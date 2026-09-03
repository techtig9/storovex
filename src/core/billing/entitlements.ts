import {createServiceRoleSupabase} from "@/core/supabase/server";
import type {PlanId} from "./plans";

export type Entitlement = {
  storeId: string;
  planId: PlanId;
  creditAccountId: string;
  balance: number;
  status: string;
};

/**
 * The single server-side source of truth for what a store is entitled to.
 *
 * This exists because /api/generation previously read `accountId` and `planId`
 * straight from the request body. `planId` sets the per-job credit cap, so a user
 * could send "pro" to raise their own limit; `accountId` selects which credit account
 * is debited, so a user could send someone else's and drain it. Neither value may
 * ever come from the client.
 *
 * Uses the service-role client deliberately: entitlements must resolve even for a
 * store whose subscription row the member cannot read directly.
 */
export async function getEntitlement(storeId: string): Promise<Entitlement> {
  const supabase = createServiceRoleSupabase();

  const [{data: sub}, {data: account}] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_id,status")
      .eq("store_id", storeId)
      .in("status", ["active", "trialing"])
      .maybeSingle(),
    supabase
      .from("credit_accounts")
      .select("id,balance")
      .eq("store_id", storeId)
      .maybeSingle(),
  ]);

  if (!account) throw new Error("CREDIT_ACCOUNT_NOT_FOUND");
  if (!sub) throw new Error("NO_ACTIVE_SUBSCRIPTION");

  return {
    storeId,
    planId: sub.plan_id as PlanId,
    creditAccountId: account.id as string,
    balance: account.balance as number,
    status: sub.status as string,
  };
}
