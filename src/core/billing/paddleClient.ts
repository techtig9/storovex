import {requireIntegration} from "@/core/config/integrations";
import type {FetchLike} from "@/core/ai/providers/types";
import {siteUrl} from "@/core/config/site";
import type {PlanId, BillingCycle} from "./plans";

/**
 * Paddle Billing API client.
 *
 * Only the calls Storovex actually makes are here. Price ids are configuration: they
 * differ between Paddle's sandbox and live environments, so hardcoding them would
 * make the sandbox untestable.
 */
function apiBase() {
  return process.env.PADDLE_ENVIRONMENT === "sandbox"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

export function priceIdFor(planId: PlanId, cycle: BillingCycle): string | undefined {
  return process.env[`PADDLE_PRICE_${planId.toUpperCase()}_${cycle.toUpperCase()}`];
}

async function paddleFetch(path: string, init: RequestInit, fetchImpl?: FetchLike) {
  requireIntegration("paddle");
  const impl = fetchImpl ?? (globalThis.fetch as FetchLike);
  const res = await impl(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PADDLE_API_${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Creates a transaction the client hands to Paddle.js to open checkout.
 *
 * `custom_data.store_id` is the link back: the webhook has no other reliable way to
 * know which Storovex store a Paddle subscription belongs to.
 */
export async function createCheckoutTransaction(
  input: {storeId: string; planId: PlanId; cycle: BillingCycle; customerEmail: string},
  opts: {fetchImpl?: FetchLike} = {}
) {
  const priceId = priceIdFor(input.planId, input.cycle);
  if (!priceId) throw new Error(`PADDLE_PRICE_NOT_CONFIGURED: ${input.planId}/${input.cycle}`);

  const body = await paddleFetch("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{price_id: priceId, quantity: 1}],
      custom_data: {store_id: input.storeId, plan_id: input.planId},
      checkout: {url: `${siteUrl()}/billing?checkout=complete`},
      customer: {email: input.customerEmail},
    }),
  }, opts.fetchImpl) as {data?: {id?: string; checkout?: {url?: string}}};

  const transactionId = body.data?.id;
  if (!transactionId) throw new Error("PADDLE_TRANSACTION_MALFORMED");
  return {transactionId, checkoutUrl: body.data?.checkout?.url};
}

/** Cancels at period end by default: cancelling immediately forfeits paid-for time. */
export async function cancelSubscription(
  subscriptionId: string,
  opts: {immediately?: boolean; fetchImpl?: FetchLike} = {}
) {
  await paddleFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({effective_from: opts.immediately ? "immediately" : "next_billing_period"}),
  }, opts.fetchImpl);
  return {canceled: true, immediate: opts.immediately === true};
}

/**
 * Upgrades and downgrades. Upgrades prorate and charge immediately so the customer
 * gets the larger plan now; downgrades take effect next period so they keep what
 * they have already paid for.
 */
export async function changeSubscriptionPlan(
  input: {subscriptionId: string; planId: PlanId; cycle: BillingCycle; direction: "upgrade" | "downgrade"},
  opts: {fetchImpl?: FetchLike} = {}
) {
  const priceId = priceIdFor(input.planId, input.cycle);
  if (!priceId) throw new Error(`PADDLE_PRICE_NOT_CONFIGURED: ${input.planId}/${input.cycle}`);

  await paddleFetch(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      items: [{price_id: priceId, quantity: 1}],
      proration_billing_mode: input.direction === "upgrade"
        ? "prorated_immediately"
        : "do_not_bill",
    }),
  }, opts.fetchImpl);
  return {changed: true};
}
