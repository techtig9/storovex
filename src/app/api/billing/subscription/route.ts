// Reads request headers (auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {createServerSupabase, createServiceRoleSupabase} from "@/core/supabase/server";
import {cancelSubscription, changeSubscriptionPlan} from "@/core/billing/paddleClient";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {PLANS, type PlanId} from "@/core/billing/plans";
import {z} from "zod";

const PLAN_RANK: Record<PlanId, number> = {starter: 1, mid: 2, pro: 3};

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "billing:read"}},
  async (req: NextRequest) => {
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "billing:read");

    const supabase = createServerSupabase();
    const [{data: sub}, {data: account}, {data: transactions}] = await Promise.all([
      supabase.from("subscriptions")
        .select("plan_id,status,billing_cycle,current_period_end,grace_period_ends_at,cancel_at_period_end")
        .eq("store_id", storeId).maybeSingle(),
      supabase.from("credit_accounts").select("balance").eq("store_id", storeId).maybeSingle(),
      supabase.from("billing_transactions")
        .select("id,status,amount_cents,currency,occurred_at,invoice_url")
        .eq("store_id", storeId).order("occurred_at", {ascending: false}).limit(24),
    ]);

    const planId = sub?.plan_id as PlanId | undefined;
    return apiSuccess({
      subscription: sub ? {...sub, planName: planId ? PLANS[planId]?.name : null} : null,
      credits: {balance: account?.balance ?? 0, included: planId ? PLANS[planId]?.includedCredits ?? 0 : 0},
      transactions: transactions ?? [],
    });
  }
);

const patchSchema = z.discriminatedUnion("action", [
  z.object({action: z.literal("cancel"), storeId: z.string().uuid().optional()}),
  z.object({
    action: z.literal("change_plan"),
    storeId: z.string().uuid().optional(),
    planId: z.enum(["starter", "mid", "pro"]),
    cycle: z.enum(["monthly", "annual"]).default("monthly"),
  }),
]);

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 20, windowSeconds: 300, scope: "billing:change"}},
  async (req: NextRequest) => {
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "billing:write");

    // Service role: the subscription id is needed even though members cannot read it.
    const admin = createServiceRoleSupabase();
    const {data: sub} = await admin.from("subscriptions")
      .select("paddle_subscription_id,plan_id").eq("store_id", storeId)
      .in("status", ["active", "trialing", "past_due"]).maybeSingle();

    const subscriptionId = sub?.paddle_subscription_id as string | undefined;
    if (!subscriptionId) return apiError(409, "NO_SUBSCRIPTION", "There's no active subscription to change.");

    if (parsed.data.action === "cancel") {
      // At period end, not immediately: cancelling now would forfeit time already paid for.
      await cancelSubscription(subscriptionId);
      await admin.from("subscriptions").update({cancel_at_period_end: true}).eq("store_id", storeId);
      return apiSuccess({canceled: true, effective: "period_end"});
    }

    const current = sub?.plan_id as PlanId | undefined;
    const direction = current && PLAN_RANK[parsed.data.planId] < PLAN_RANK[current] ? "downgrade" : "upgrade";
    await changeSubscriptionPlan({
      subscriptionId, planId: parsed.data.planId, cycle: parsed.data.cycle, direction,
    });
    // The subscription row is updated by the resulting subscription.updated webhook,
    // never here — one writer keeps entitlements consistent.
    return apiSuccess({requested: parsed.data.planId, direction});
  }
);
