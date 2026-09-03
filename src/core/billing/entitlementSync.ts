import {createServiceRoleSupabase} from "@/core/supabase/server";
import {normalizeSubscriptionStatus, actionForEvent, type PaddleEventType} from "./paddleWebhook";
import {sendEmailSafely} from "@/core/email/emailService";
import {siteUrl} from "@/core/config/site";
import {PLANS, type PlanId} from "./plans";

/**
 * Turns a verified Paddle event into entitlement changes.
 *
 * This is what was missing: the webhook verified signatures correctly, filed the
 * event, and returned. No subscription row, no plan sync, no credit grant, no access
 * revoked. Billing did nothing.
 */

type PaddleEvent = {
  event_id: string;
  event_type: PaddleEventType;
  data?: {
    id?: string;
    subscription_id?: string;
    status?: string;
    custom_data?: {store_id?: string; plan_id?: string};
    items?: {price?: {id?: string}}[];
    current_billing_period?: {ends_at?: string};
    billing_cycle?: {interval?: string};
    details?: {totals?: {total?: string; currency_code?: string}};
    invoice_number?: string;
  };
};

/** Statuses whose arrival means "this period is paid for, grant the credits". */
const GRANTS_CREDITS = new Set<PaddleEventType>([
  "subscription.created", "subscription.activated",
]);

function resolvePlanId(event: PaddleEvent): PlanId | null {
  const claimed = event.data?.custom_data?.plan_id;
  // custom_data is what we set at checkout, so it is ours, not the customer's. Still
  // validated against the known plans rather than trusted outright.
  if (claimed && claimed in PLANS) return claimed as PlanId;
  return null;
}

export async function applyPaddleEvent(event: PaddleEvent) {
  const action = actionForEvent(event.event_type);
  const supabase = createServiceRoleSupabase();
  const storeId = event.data?.custom_data?.store_id;

  // Payment events carry a transaction rather than a subscription state change.
  if (event.event_type === "transaction.completed" || event.event_type === "transaction.payment_failed") {
    const totals = event.data?.details?.totals;
    if (storeId && event.data?.id) {
      await supabase.rpc("record_billing_transaction", {
        p_store_id: storeId,
        p_paddle_transaction_id: event.data.id,
        p_paddle_subscription_id: event.data.subscription_id ?? null,
        p_status: event.event_type === "transaction.completed" ? "paid" : "failed",
        p_amount_cents: totals?.total ? Math.round(Number(totals.total)) : 0,
        p_currency: totals?.currency_code ?? "USD",
        p_invoice_url: null,
      });
    }

    if (event.event_type === "transaction.payment_failed" && storeId) {
      await supabase.rpc("notify_store", {
        p_store_id: storeId, p_type: "payment_failed",
        p_title: "Payment failed",
        p_body: "We couldn't take your payment. Update your card to avoid interruption.",
      });
      await notifyBillingContact(storeId, "payment_failed", {
        planName: await currentPlanName(storeId),
        retryUrl: `${siteUrl()}/billing`,
      });
    }
    return {action, applied: true};
  }

  if (event.event_type === "adjustment.created") {
    // Refunds and credits are recorded for history; they do not change entitlement.
    return {action, applied: true, note: "recorded_only"};
  }

  // Everything below is a subscription state change.
  const subscriptionId = event.data?.id;
  const rawStatus = event.data?.status;
  if (!storeId || !subscriptionId || !rawStatus) {
    // Without custom_data we cannot attribute the subscription to a store. Better to
    // surface that loudly than to guess and grant credits to the wrong tenant.
    return {action, applied: false, reason: "MISSING_ATTRIBUTION"};
  }

  const status = normalizeSubscriptionStatus(rawStatus);
  const planId = resolvePlanId(event);
  if (!planId) return {action, applied: false, reason: "PLAN_UNRESOLVED"};

  const cycle = event.data?.billing_cycle?.interval === "year" ? "annual" : "monthly";

  const {data, error} = await supabase.rpc("apply_subscription_event", {
    p_event_id: event.event_id,
    p_store_id: storeId,
    p_paddle_subscription_id: subscriptionId,
    p_plan_id: planId,
    p_status: status,
    p_billing_cycle: cycle,
    p_current_period_end: event.data?.current_billing_period?.ends_at ?? null,
    p_grant_credits: GRANTS_CREDITS.has(event.event_type) && (status === "active" || status === "trialing"),
  });
  if (error) throw new Error("ENTITLEMENT_SYNC_FAILED");

  const result = data as {ok: boolean; granted?: number; error?: string};
  if (!result?.ok) return {action, applied: false, reason: result?.error ?? "UNKNOWN"};

  await announce(storeId, event.event_type, planId, status);
  return {action, applied: true, granted: result.granted ?? 0};
}

async function currentPlanName(storeId: string) {
  const supabase = createServiceRoleSupabase();
  const {data} = await supabase.from("subscriptions")
    .select("plan_id").eq("store_id", storeId).maybeSingle();
  const planId = data?.plan_id as PlanId | undefined;
  return planId && planId in PLANS ? PLANS[planId].name : "your plan";
}

/** Emails the store owner. Never throws: notification failure must not fail billing. */
async function notifyBillingContact(storeId: string, type: Parameters<typeof sendEmailSafely>[0]["type"], vars: Record<string, unknown>) {
  const supabase = createServiceRoleSupabase();
  const {data: store} = await supabase.from("stores").select("owner_id").eq("id", storeId).maybeSingle();
  if (!store?.owner_id) return;
  const {data: user} = await supabase.auth.admin.getUserById(store.owner_id as string);
  const email = user?.user?.email;
  if (!email) return;
  await sendEmailSafely({to: email, type, vars, storeId});
}

async function announce(storeId: string, eventType: PaddleEventType, planId: PlanId, status: string) {
  const supabase = createServiceRoleSupabase();
  const planName = PLANS[planId].name;

  if (eventType === "subscription.created" || eventType === "subscription.activated") {
    await supabase.rpc("notify_store", {
      p_store_id: storeId, p_type: "subscription_activated",
      p_title: `${planName} is active`, p_body: "This period's credits have been added.",
    });
    await notifyBillingContact(storeId, "subscription_activated", {
      planName, billingUrl: `${siteUrl()}/billing`,
    });
    return;
  }

  if (eventType === "subscription.canceled") {
    const {data: sub} = await supabase.from("subscriptions")
      .select("current_period_end").eq("store_id", storeId).maybeSingle();
    const until = sub?.current_period_end
      ? new Date(sub.current_period_end as string).toLocaleDateString("en-GB", {dateStyle: "long"})
      : "the end of your billing period";
    await supabase.rpc("notify_store", {
      p_store_id: storeId, p_type: "subscription_canceled",
      p_title: "Subscription cancelled", p_body: `Access continues until ${until}.`,
    });
    await notifyBillingContact(storeId, "subscription_canceled", {planName, accessUntil: until, billingUrl: `${siteUrl()}/billing`});
    return;
  }

  if (status === "past_due") {
    const {data: sub} = await supabase.from("subscriptions")
      .select("grace_period_ends_at").eq("store_id", storeId).maybeSingle();
    const graceEndsAt = sub?.grace_period_ends_at
      ? new Date(sub.grace_period_ends_at as string).toLocaleDateString("en-GB", {dateStyle: "long"})
      : "shortly";
    await supabase.rpc("notify_store", {
      p_store_id: storeId, p_type: "grace_period_started",
      p_title: "Payment overdue", p_body: `Access continues until ${graceEndsAt}.`,
    });
    await notifyBillingContact(storeId, "grace_period_started", {
      planName, graceEndsAt, billingUrl: `${siteUrl()}/billing`,
    });
  }
}
