import {createServiceRoleSupabase} from "@/core/supabase/server";
import {toMinorUnits, toDecimalString, applicationFee, type Money} from "./money";
import {computeTotals, splitByStore, validateDiscount, type Discount, type LineItem} from "./pricing";
import {randomUUID} from "crypto";

/**
 * Checkout.
 *
 * The schema dictates the shape: a cart has no store, so one basket can hold items
 * from several merchants. At checkout the basket splits into an order_group holding
 * one order per store, each with its own order_number and its own platform fee.
 *
 * Runs as service role throughout. A shopper is anonymous — there is no session to
 * scope RLS by — so authority comes from possession of the cart's session_token, and
 * every read is filtered by it explicitly.
 */

export const DEFAULT_FEE_BASIS_POINTS = Number(process.env.PLATFORM_FEE_BASIS_POINTS ?? "500");
const RESERVATION_TTL_MINUTES = Number(process.env.STOCK_RESERVATION_TTL_MINUTES ?? "20");

export type CartLine = LineItem & {
  storeId: string; cartItemId: string; title: string; sku: string | null;
};

export class CheckoutError extends Error {
  constructor(readonly code: string, readonly detail?: unknown) { super(code); }
}

/** Loads a cart by its token, with everything needed to price it. */
export async function loadCart(sessionToken: string): Promise<{cartId: string; lines: CartLine[]}> {
  const supabase = createServiceRoleSupabase();

  const {data: cart} = await supabase
    .from("carts").select("id,status").eq("session_token", sessionToken).maybeSingle();
  if (!cart) throw new CheckoutError("CART_NOT_FOUND");
  if (cart.status !== "open") throw new CheckoutError("CART_NOT_OPEN");

  const {data: items} = await supabase
    .from("cart_items")
    .select("id,quantity,price_at_add,variant_id,product_variants(id,sku,store_id,price,product_id,products(title,status))")
    .eq("cart_id", cart.id);

  const lines: CartLine[] = [];
  for (const row of items ?? []) {
    const variant = row.product_variants as unknown as {
      id: string; sku: string | null; store_id: string; price: string;
      products: {title: string; status: string} | null;
    } | null;
    if (!variant) throw new CheckoutError("CART_ITEM_ORPHANED", {cartItemId: row.id});

    // A merchant can unpublish between adding to cart and checking out. Selling an
    // unpublished product would be a real bug, so this refuses rather than proceeds.
    if (variant.products?.status !== "active") {
      throw new CheckoutError("PRODUCT_UNAVAILABLE", {title: variant.products?.title});
    }

    lines.push({
      cartItemId: row.id as string,
      variantId: variant.id,
      storeId: variant.store_id,
      quantity: row.quantity as number,
      // Charge the price as it is now, not price_at_add. A cart held for a week
      // must not lock in a stale price, and the shopper sees the current total
      // before paying.
      unitPrice: toMinorUnits(variant.price),
      title: variant.products?.title ?? "",
      sku: variant.sku,
    });
  }

  if (lines.length === 0) throw new CheckoutError("CART_EMPTY");
  return {cartId: cart.id as string, lines};
}

async function loadDiscount(storeId: string, code: string): Promise<Discount | null> {
  const supabase = createServiceRoleSupabase();
  const {data} = await supabase.from("discounts")
    .select("id,code,type,value,min_subtotal,usage_limit,used_count,active,expires_at")
    .eq("store_id", storeId).ilike("code", code).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string, code: data.code as string,
    type: data.type as Discount["type"], value: Number(data.value),
    minSubtotal: data.min_subtotal === null ? null : toMinorUnits(data.min_subtotal as string),
    usageLimit: data.usage_limit as number | null,
    usedCount: (data.used_count as number) ?? 0,
    active: data.active as boolean,
    expiresAt: data.expires_at as string | null,
  };
}

/** Prices a cart without committing anything. Used to show a total before payment. */
export async function quoteCart(input: {sessionToken: string; discountCodes?: Record<string, string>}) {
  const {cartId, lines} = await loadCart(input.sessionToken);
  const byStore = splitByStore(lines);
  const quotes = [];

  for (const [storeId, storeLines] of byStore) {
    const code = input.discountCodes?.[storeId];
    const discount = code ? await loadDiscount(storeId, code) : null;

    // A code the shopper typed that does not apply must be reported, not silently
    // dropped — otherwise they pay full price wondering why.
    let discountError: string | undefined;
    if (code && !discount) discountError = "DISCOUNT_NOT_FOUND";
    else if (discount) {
      const check = validateDiscount(discount, storeLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
      if (!check.ok) discountError = check.reason;
    }

    const totals = computeTotals({
      items: storeLines,
      discount: discountError ? null : discount,
    });

    quotes.push({
      storeId, lines: storeLines, totals,
      applicationFee: applicationFee(totals.subtotal - totals.discountTotal, DEFAULT_FEE_BASIS_POINTS),
      discountCode: discountError ? null : discount?.code ?? null,
      discountError,
    });
  }

  return {
    cartId,
    stores: quotes,
    grandTotal: quotes.reduce((sum, q) => sum + q.totals.total, 0),
  };
}

/**
 * Turns a priced cart into an order group with one order per store, reserving stock
 * as it goes.
 *
 * Stock is reserved before any order row is written. If a single line cannot be
 * reserved the whole checkout is rolled back — every reservation already taken is
 * released — because a partially fulfilled basket is worse than a failed one: the
 * shopper is charged for some of what they wanted and told nothing about the rest.
 */
export async function createOrderGroup(input: {
  sessionToken: string; email: string;
  shippingAddress?: Record<string, unknown>;
  discountCodes?: Record<string, string>;
}) {
  const supabase = createServiceRoleSupabase();
  const quote = await quoteCart({sessionToken: input.sessionToken, discountCodes: input.discountCodes});
  const reservations: string[] = [];

  try {
    for (const store of quote.stores) {
      for (const line of store.lines) {
        const {data, error} = await supabase.rpc("reserve_stock_with_expiry", {
          p_variant_id: line.variantId, p_quantity: line.quantity,
          p_cart_id: quote.cartId, p_ttl_minutes: RESERVATION_TTL_MINUTES,
        });
        if (error) throw new CheckoutError("RESERVATION_FAILED");
        const result = data as {ok: boolean; error?: string; reservation_id?: string};
        if (!result.ok) throw new CheckoutError(result.error ?? "INSUFFICIENT_STOCK", {title: line.title});
        if (result.reservation_id) reservations.push(result.reservation_id);
      }
    }

    const {data: group, error: groupError} = await supabase
      .from("order_groups").insert({email: input.email}).select("id").single();
    if (groupError) throw new CheckoutError("ORDER_GROUP_CREATE_FAILED");
    const orderGroupId = group.id as string;

    const orders = [];
    for (const store of quote.stores) {
      // Per-store sequential numbering, from the merchant's own counter.
      const {data: numberResult} = await supabase.rpc("next_order_number", {p_store_id: store.storeId});
      const orderNumber = (numberResult as number | null) ?? null;

      const {data: order, error: orderError} = await supabase.from("orders").insert({
        id: randomUUID(),
        order_group_id: orderGroupId,
        store_id: store.storeId,
        order_number: orderNumber,
        email: input.email,
        status: "pending_payment",
        subtotal: toDecimalString(store.totals.subtotal),
        discount_total: toDecimalString(store.totals.discountTotal),
        shipping_total: toDecimalString(store.totals.shippingTotal),
        tax_total: toDecimalString(store.totals.taxTotal),
        total: toDecimalString(store.totals.total),
        application_fee_amount: toDecimalString(store.applicationFee),
        shipping_address: input.shippingAddress ?? null,
      }).select("id,order_number,total").single();
      if (orderError) throw new CheckoutError("ORDER_CREATE_FAILED");

      const items = store.lines.map(line => ({
        order_id: order.id,
        variant_id: line.variantId,
        // Snapshots, so an order stays readable after the product is renamed,
        // repriced or deleted.
        title_snapshot: line.title,
        sku_snapshot: line.sku,
        price_snapshot: toDecimalString(line.unitPrice),
        quantity: line.quantity,
      }));
      const {error: itemsError} = await supabase.from("order_items").insert(items);
      if (itemsError) throw new CheckoutError("ORDER_ITEMS_CREATE_FAILED");

      if (store.discountCode) {
        await supabase.rpc("increment_discount_usage", {p_discount_id: (await loadDiscount(store.storeId, store.discountCode))?.id});
      }

      orders.push({id: order.id, storeId: store.storeId, orderNumber: order.order_number, total: store.totals.total});
    }

    await supabase.from("carts").update({status: "checked_out"}).eq("id", quote.cartId);

    return {
      orderGroupId, orders,
      grandTotal: quote.grandTotal,
      totalApplicationFee: quote.stores.reduce((s, q) => s + q.applicationFee, 0),
    };
  } catch (e) {
    // Release everything taken so far. A failed checkout must not hold inventory.
    for (const reservationId of reservations) {
      await supabase.rpc("release_reservation", {p_reservation_id: reservationId})
        .then(() => undefined, () => undefined);
    }
    throw e;
  }
}
