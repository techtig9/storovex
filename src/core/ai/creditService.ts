import {createServiceRoleSupabase} from "@/core/supabase/server";

/**
 * AI credit metering.
 *
 * Built on the two functions that already exist in the database rather than
 * replacing them: try_decrement_credits is a conditional update, so it is already
 * atomic and cannot take a store below zero, and refund_credits is its inverse.
 *
 * What was missing is the audit trail. credit_usage records what was spent and on
 * what, and — importantly — is written *after* the decrement succeeds, so a log
 * entry never claims a charge that did not happen.
 */

export type AiFeature = "video_ad" | "assistant" | "product_copy" | "image";

/** What each feature costs. Kept here so a price change is one edit, not a search. */
export const FEATURE_COST: Record<AiFeature, number> = {
  video_ad: 25,
  assistant: 1,
  product_copy: 3,
  image: 8,
};

export class InsufficientCreditsError extends Error {
  constructor(readonly required: number) { super("INSUFFICIENT_CREDITS"); }
}

/**
 * Finds the subscription that holds a store's credits.
 *
 * subscriptions carries no store_id — the link is stores.subscription_id — so this
 * is the one place that knows how the two tables relate.
 */
async function subscriptionIdForStore(storeId: string): Promise<string | null> {
  const supabase = createServiceRoleSupabase();
  const {data} = await supabase
    .from("stores").select("subscription_id").eq("id", storeId).maybeSingle();
  return (data?.subscription_id as string | undefined) ?? null;
}

export async function creditBalance(storeId: string): Promise<number> {
  const subscriptionId = await subscriptionIdForStore(storeId);
  if (!subscriptionId) return 0;
  const supabase = createServiceRoleSupabase();
  const {data} = await supabase
    .from("subscriptions").select("credits_remaining").eq("id", subscriptionId).maybeSingle();
  return (data?.credits_remaining as number | undefined) ?? 0;
}

/**
 * Spends credits for one use of a feature.
 *
 * Returns a usage id the caller keeps: if the work then fails, that id is what
 * refunds it. A caller that loses it has charged a customer for nothing.
 */
export async function spendCredits(input: {
  storeId: string; feature: AiFeature; cost?: number;
}): Promise<{usageId: string; remaining: number}> {
  const cost = input.cost ?? FEATURE_COST[input.feature];
  if (!Number.isInteger(cost) || cost <= 0) throw new Error("COST_INVALID");

  const subscriptionId = await subscriptionIdForStore(input.storeId);
  if (!subscriptionId) throw new InsufficientCreditsError(cost);

  const supabase = createServiceRoleSupabase();
  const {data, error} = await supabase.rpc("try_decrement_credits", {
    p_subscription_id: subscriptionId, p_cost: cost,
  });
  if (error) throw new Error("CREDIT_DECREMENT_FAILED");

  // The function returns null when its WHERE clause matched nothing, which means
  // the balance was too low. Null is the refusal, not an error.
  const remaining = data as number | null;
  if (remaining === null) throw new InsufficientCreditsError(cost);

  const {data: usage, error: usageError} = await supabase.from("credit_usage").insert({
    store_id: input.storeId, feature: input.feature,
    credits_spent: cost, status: "reserved",
  }).select("id").single();

  if (usageError) {
    // The credits are already gone. Put them back rather than leaving a silent
    // charge with no record of what it bought.
    await supabase.rpc("refund_credits", {p_subscription_id: subscriptionId, p_amount: cost});
    throw new Error("CREDIT_USAGE_LOG_FAILED");
  }

  return {usageId: usage.id as string, remaining};
}

/** Marks a spend as delivered. The credits stay spent. */
export async function commitCredits(usageId: string) {
  const supabase = createServiceRoleSupabase();
  const {error} = await supabase.from("credit_usage")
    .update({status: "committed"}).eq("id", usageId).eq("status", "reserved");
  if (error) throw new Error("CREDIT_COMMIT_FAILED");
  return {committed: true};
}

/**
 * Returns credits after failed work. Idempotent: the status guard means a retry
 * loop cannot refund the same usage twice and mint credits from nothing.
 */
export async function refundCredits(usageId: string, reason = "generation failed") {
  const supabase = createServiceRoleSupabase();

  const {data: usage} = await supabase.from("credit_usage")
    .select("id,store_id,credits_spent,status").eq("id", usageId).maybeSingle();
  if (!usage) throw new Error("CREDIT_USAGE_NOT_FOUND");
  if (usage.status !== "reserved") return {refunded: 0, alreadySettled: true};

  const subscriptionId = await subscriptionIdForStore(usage.store_id as string);
  if (!subscriptionId) throw new Error("SUBSCRIPTION_NOT_FOUND");

  // Flip the status first, conditionally. If two callers race, only one gets the
  // row and only one refund reaches the balance.
  const {data: claimed} = await supabase.from("credit_usage")
    .update({status: "refunded"})
    .eq("id", usageId).eq("status", "reserved")
    .select("id,credits_spent");

  if (!claimed || claimed.length === 0) return {refunded: 0, alreadySettled: true};

  await supabase.rpc("refund_credits", {
    p_subscription_id: subscriptionId, p_amount: usage.credits_spent as number,
  });
  return {refunded: usage.credits_spent as number, alreadySettled: false, reason};
}
