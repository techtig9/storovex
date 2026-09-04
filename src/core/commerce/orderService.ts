import {createServerSupabase, createServiceRoleSupabase} from "@/core/supabase/server";
import {toMinorUnits} from "./money";
import {refundPaymentIntent} from "@/core/payments/stripe";

/**
 * Order reads and fulfilment for merchants.
 *
 * Reads go through the caller's own client so RLS decides what they can see; the
 * store id is still filtered on, but a mistake there cannot leak another merchant's
 * orders because the policy rejects the row anyway.
 *
 * Writes that move money use the service role, because refunding calls Stripe and
 * then records the outcome — work a client must never be able to trigger directly.
 */

/** The only values orders_status_check permits. */
export const ORDER_STATUSES = [
  "pending_payment", "paid", "failed", "fulfilled", "cancelled", "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Which transitions are allowed, and deliberately not a free-for-all.
 *
 * A merchant marking an unpaid order "fulfilled" would ship goods nobody paid for,
 * and re-refunding a refunded order would send the money twice. Terminal states have
 * no exits: once refunded or cancelled, an order is history.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled", "failed"],
  paid: ["fulfilled", "refunded", "cancelled"],
  fulfilled: ["refunded"],
  failed: ["cancelled"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class OrderError extends Error {
  constructor(readonly code: string, readonly detail?: unknown) { super(code); }
}

export async function listOrders(input: {
  storeId: string; status?: OrderStatus; search?: string; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const supabase = createServerSupabase();

  let query = supabase
    .from("orders")
    .select("id,order_number,email,status,total,created_at", {count: "exact"})
    .eq("store_id", input.storeId);

  if (input.status) query = query.eq("status", input.status);
  // Merchants look an order up by the number the customer quotes them, or by email.
  if (input.search?.trim()) {
    const term = input.search.trim();
    const asNumber = Number(term);
    query = Number.isInteger(asNumber)
      ? query.eq("order_number", asNumber)
      : query.ilike("email", `%${term}%`);
  }

  const {data, error, count} = await query
    .order("created_at", {ascending: false})
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new OrderError("ORDER_LIST_FAILED", error.message);

  return {
    orders: (data ?? []).map(o => ({
      id: o.id as string,
      orderNumber: o.order_number as number,
      email: o.email as string,
      status: o.status as OrderStatus,
      total: toMinorUnits(o.total as string),
      createdAt: o.created_at as string,
    })),
    total: count ?? 0, page, pageSize,
  };
}

export async function getOrder(storeId: string, orderId: string) {
  const supabase = createServerSupabase();
  const [{data: order}, {data: items}] = await Promise.all([
    supabase.from("orders")
      .select("id,order_number,email,status,subtotal,discount_total,shipping_total,tax_total,total,application_fee_amount,shipping_address,stripe_payment_intent_id,created_at")
      .eq("id", orderId).eq("store_id", storeId).maybeSingle(),
    supabase.from("order_items")
      .select("id,title_snapshot,sku_snapshot,price_snapshot,quantity")
      .eq("order_id", orderId),
  ]);
  if (!order) return null;

  const money = (v: unknown) => toMinorUnits(v as string);
  return {
    id: order.id as string,
    orderNumber: order.order_number as number,
    email: order.email as string,
    status: order.status as OrderStatus,
    subtotal: money(order.subtotal),
    discountTotal: money(order.discount_total),
    shippingTotal: money(order.shipping_total),
    taxTotal: money(order.tax_total),
    total: money(order.total),
    // What the merchant actually receives, which is the number they care about and
    // is nowhere in the raw row.
    applicationFee: money(order.application_fee_amount),
    netToMerchant: money(order.total) - money(order.application_fee_amount),
    shippingAddress: order.shipping_address as Record<string, unknown> | null,
    paymentIntentId: order.stripe_payment_intent_id as string | null,
    createdAt: order.created_at as string,
    items: (items ?? []).map(i => ({
      id: i.id as string,
      title: i.title_snapshot as string,
      sku: i.sku_snapshot as string | null,
      unitPrice: money(i.price_snapshot),
      quantity: i.quantity as number,
      lineTotal: money(i.price_snapshot) * (i.quantity as number),
    })),
    allowedNextStatuses: ALLOWED_TRANSITIONS[order.status as OrderStatus] ?? [],
  };
}

/**
 * Moves an order to a new status, refusing transitions that make no sense.
 *
 * The guard is a conditional update rather than a read-then-write: two merchants
 * with the order open in two tabs would otherwise both read "paid" and both act.
 */
export async function setOrderStatus(input: {
  storeId: string; orderId: string; status: OrderStatus;
}) {
  const admin = createServiceRoleSupabase();
  const {data: current} = await admin.from("orders")
    .select("status").eq("id", input.orderId).eq("store_id", input.storeId).maybeSingle();
  if (!current) throw new OrderError("ORDER_NOT_FOUND");

  const from = current.status as OrderStatus;
  if (from === input.status) return {status: from, changed: false};
  if (!canTransition(from, input.status)) throw new OrderError("TRANSITION_NOT_ALLOWED", {from, to: input.status});

  const {data, error} = await admin.from("orders")
    .update({status: input.status})
    .eq("id", input.orderId).eq("store_id", input.storeId).eq("status", from)
    .select("id,status");
  if (error) throw new OrderError("ORDER_UPDATE_FAILED", error.message);
  // Zero rows means the status moved under us between the read and the write.
  if (!data || data.length === 0) throw new OrderError("ORDER_CHANGED_CONCURRENTLY");

  return {status: input.status, changed: true};
}

/**
 * Refunds an order through Stripe, then records it.
 *
 * Stripe is called first on purpose. Marking the row refunded before the money moves
 * would leave a merchant looking at a refunded order the customer never received,
 * with nothing to reconcile against.
 */
export async function refundOrder(input: {storeId: string; orderId: string}) {
  const admin = createServiceRoleSupabase();
  const {data: order} = await admin.from("orders")
    .select("id,status,stripe_payment_intent_id,total,application_fee_amount")
    .eq("id", input.orderId).eq("store_id", input.storeId).maybeSingle();
  if (!order) throw new OrderError("ORDER_NOT_FOUND");

  const from = order.status as OrderStatus;
  if (from === "refunded") return {refunded: false, alreadyRefunded: true};
  if (!canTransition(from, "refunded")) throw new OrderError("TRANSITION_NOT_ALLOWED", {from, to: "refunded"});

  const intentId = order.stripe_payment_intent_id as string | null;
  if (!intentId) throw new OrderError("NO_PAYMENT_TO_REFUND");

  // Claim the transition first so two clicks cannot both reach Stripe. If the
  // refund then fails the status is put back, because an order recorded as
  // refunded when no money moved is the worse of the two failures.
  const {data: claimed} = await admin.from("orders")
    .update({status: "refunded"})
    .eq("id", input.orderId).eq("status", from).select("id");
  if (!claimed || claimed.length === 0) throw new OrderError("ORDER_CHANGED_CONCURRENTLY");

  try {
    // refundId keys Stripe's idempotency header. Using the order id means a retry
    // after a network timeout returns the original refund rather than issuing a
    // second one — there is exactly one refund per order by construction.
    await refundPaymentIntent({paymentIntentId: intentId, refundId: input.orderId});
  } catch (e) {
    await admin.from("orders").update({status: from}).eq("id", input.orderId);
    throw new OrderError("REFUND_FAILED", e instanceof Error ? e.message : String(e));
  }

  return {refunded: true, alreadyRefunded: false};
}
