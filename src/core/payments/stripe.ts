import {createHmac, timingSafeEqual} from "crypto";
import {requireIntegration} from "@/core/config/integrations";
import type {FetchLike} from "@/core/ai/providers/types";

/**
 * Stripe Connect.
 *
 * The schema settles the model: orders carry both a stripe_payment_intent_id and an
 * application_fee_amount, so merchants are connected accounts and Storovex takes a
 * cut of each sale. That is a different arrangement from a plain subscription — the
 * money moves to the merchant, and the platform's fee is deducted in transit.
 *
 * A multi-store basket needs one intent per store, because a single intent can only
 * settle to a single connected account.
 */

const API_BASE = "https://api.stripe.com/v1";

/** Stripe's API takes form encoding, including for nested objects. */
function formEncode(data: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(formEncode(value as Record<string, unknown>, field));
    } else {
      parts.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripeFetch(
  path: string, body: Record<string, unknown> | null,
  opts: {fetchImpl?: FetchLike; idempotencyKey?: string; method?: string} = {}
) {
  requireIntegration("stripe");
  const impl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // Stripe deduplicates on this key for 24 hours, so a retry after a network
  // timeout cannot charge a shopper twice.
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await impl(`${API_BASE}${path}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body: body ? formEncode(body) : undefined,
  });

  const json = await res.json().catch(() => null) as {error?: {message?: string; code?: string}} | null;
  if (!res.ok) {
    throw new Error(`STRIPE_${res.status}: ${json?.error?.code ?? json?.error?.message ?? "unknown"}`);
  }
  return json as Record<string, unknown>;
}

/**
 * One payment intent per store, settling to that merchant's connected account with
 * the platform fee deducted.
 */
export async function createPaymentIntent(input: {
  orderId: string;
  amount: number;              // minor units
  currency: string;
  connectedAccountId: string;
  applicationFeeAmount: number;
  email: string;
  metadata?: Record<string, string>;
}, opts: {fetchImpl?: FetchLike} = {}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("AMOUNT_INVALID");
  if (input.applicationFeeAmount > input.amount) throw new Error("FEE_EXCEEDS_AMOUNT");

  const body = await stripeFetch("/payment_intents", {
    amount: input.amount,
    currency: input.currency.toLowerCase(),
    receipt_email: input.email,
    application_fee_amount: input.applicationFeeAmount,
    transfer_data: {destination: input.connectedAccountId},
    automatic_payment_methods: {enabled: "true"},
    metadata: {order_id: input.orderId, ...input.metadata},
  }, {
    // Keyed on the order, so retrying a checkout cannot create a second intent for
    // the same order.
    idempotencyKey: `order:${input.orderId}`,
    fetchImpl: opts.fetchImpl,
  });

  return {
    id: body.id as string,
    clientSecret: body.client_secret as string,
    status: body.status as string,
  };
}

export async function refundPaymentIntent(input: {
  paymentIntentId: string; amount?: number; reason?: string; refundId: string;
}, opts: {fetchImpl?: FetchLike} = {}) {
  const body = await stripeFetch("/refunds", {
    payment_intent: input.paymentIntentId,
    ...(input.amount ? {amount: input.amount} : {}),
    ...(input.reason ? {reason: input.reason} : {}),
    // Refunding the fee too: keeping the platform's cut on a cancelled sale would
    // leave the merchant out of pocket for a sale that never happened.
    refund_application_fee: "true",
    reverse_transfer: "true",
  }, {idempotencyKey: `refund:${input.refundId}`, fetchImpl: opts.fetchImpl});

  return {id: body.id as string, status: body.status as string};
}

/** Creates the onboarding link a merchant follows to connect their Stripe account. */
export async function createConnectAccountLink(input: {
  accountId: string; refreshUrl: string; returnUrl: string;
}, opts: {fetchImpl?: FetchLike} = {}) {
  const body = await stripeFetch("/account_links", {
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  }, {fetchImpl: opts.fetchImpl});
  return {url: body.url as string};
}

/**
 * Verifies a Stripe webhook signature.
 *
 * Header form is `t=<unix>,v1=<hex hmac of "t.payload">`. The timestamp is inside
 * the signed material, so an attacker cannot replay an old delivery with a fresh
 * timestamp — changing it invalidates the signature.
 */
export function verifyStripeSignature(
  header: string | null, rawBody: string, secret: string,
  nowMs = Date.now(), toleranceSeconds = 300
): boolean {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map(p => p.split("=") as [string, string]).filter(p => p.length === 2)
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = nowMs / 1000 - Number(timestamp);
  if (!Number.isFinite(age) || age < -toleranceSeconds || age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
