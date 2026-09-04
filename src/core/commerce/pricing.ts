import {type Money, sumMoney} from "./money";

export type DiscountType = "percent" | "fixed";

export type Discount = {
  id: string;
  code: string;
  type: DiscountType;
  value: number;          // percent points, or minor units for a fixed amount
  minSubtotal: Money | null;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
};

export type LineItem = {variantId: string; quantity: number; unitPrice: Money};

export type DiscountRejection =
  | "DISCOUNT_INACTIVE" | "DISCOUNT_EXPIRED"
  | "DISCOUNT_USAGE_EXHAUSTED" | "DISCOUNT_MINIMUM_NOT_MET";

export function lineSubtotal(items: LineItem[]): Money {
  return sumMoney(items.map(i => {
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new Error("QUANTITY_INVALID");
    return i.unitPrice * i.quantity;
  }));
}

/**
 * Every reason a discount can be refused, checked in one place.
 *
 * Returns the reason rather than a boolean so the checkout can tell the shopper why
 * their code did not work — "expired" and "you need to spend more" call for very
 * different responses.
 */
export function validateDiscount(
  discount: Discount, subtotal: Money, now: Date = new Date()
): {ok: true} | {ok: false; reason: DiscountRejection} {
  if (!discount.active) return {ok: false, reason: "DISCOUNT_INACTIVE"};
  if (discount.expiresAt && new Date(discount.expiresAt) <= now) {
    return {ok: false, reason: "DISCOUNT_EXPIRED"};
  }
  if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
    return {ok: false, reason: "DISCOUNT_USAGE_EXHAUSTED"};
  }
  if (discount.minSubtotal !== null && subtotal < discount.minSubtotal) {
    return {ok: false, reason: "DISCOUNT_MINIMUM_NOT_MET"};
  }
  return {ok: true};
}

/** Never exceeds the subtotal: a discount must not make an order payable to the shopper. */
export function discountAmount(discount: Discount, subtotal: Money): Money {
  const raw = discount.type === "percent"
    ? Math.floor((subtotal * discount.value) / 100)
    : Math.round(discount.value);
  return Math.max(0, Math.min(raw, subtotal));
}

export type OrderTotals = {
  subtotal: Money; discountTotal: Money; shippingTotal: Money;
  taxTotal: Money; total: Money;
};

/**
 * Order arithmetic, in one place so the API, the storefront and the Stripe intent
 * can never disagree about what the shopper owes.
 *
 * Tax is computed after the discount, on the discounted goods plus shipping, which
 * is the common treatment. Jurisdictions differ; when real tax rules land this is
 * the single function that changes.
 */
export function computeTotals(input: {
  items: LineItem[];
  discount?: Discount | null;
  shippingTotal?: Money;
  taxBasisPoints?: number;
}): OrderTotals {
  const subtotal = lineSubtotal(input.items);
  const shippingTotal = input.shippingTotal ?? 0;

  let discountTotal = 0;
  if (input.discount) {
    const check = validateDiscount(input.discount, subtotal);
    if (check.ok) discountTotal = discountAmount(input.discount, subtotal);
  }

  const taxable = subtotal - discountTotal + shippingTotal;
  const taxTotal = input.taxBasisPoints
    ? Math.floor((taxable * input.taxBasisPoints) / 10000)
    : 0;

  return {
    subtotal, discountTotal, shippingTotal, taxTotal,
    total: Math.max(0, taxable + taxTotal),
  };
}

/**
 * Splits a multi-store basket into one group of items per store.
 *
 * The schema requires this: carts have no store_id, order_groups own many orders,
 * and each order carries its own store_id and order_number. A shopper checks out
 * once and each merchant receives their own order.
 */
export function splitByStore<T extends {storeId: string}>(items: T[]): Map<string, T[]> {
  const byStore = new Map<string, T[]>();
  for (const item of items) {
    const existing = byStore.get(item.storeId);
    if (existing) existing.push(item);
    else byStore.set(item.storeId, [item]);
  }
  return byStore;
}
