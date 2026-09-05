import {toMinorUnits, type Money} from "./money";

/**
 * A store's shipping and tax rules, and the arithmetic that applies them.
 *
 * Kept separate from checkoutService so the rules can be reasoned about — and
 * tested — without a database. Both are per-store rather than per-order, because a
 * multi-store basket becomes one order per merchant and each ships their own parcel
 * and charges their own tax.
 */

export type StoreCommerceSettings = {
  shippingFlatRate: Money;
  /** Orders at or above this subtotal ship free. Null means never free. */
  shippingFreeThreshold: Money | null;
  taxBasisPoints: number;
};

export const NO_SHIPPING_OR_TAX: StoreCommerceSettings = {
  shippingFlatRate: 0, shippingFreeThreshold: null, taxBasisPoints: 0,
};

/** Reads the settings off a `stores` row, tolerating the columns being absent. */
export function settingsFromRow(row: Record<string, unknown> | null | undefined): StoreCommerceSettings {
  if (!row) return NO_SHIPPING_OR_TAX;
  const threshold = row.shipping_free_threshold;
  return {
    shippingFlatRate: row.shipping_flat_rate == null ? 0 : toMinorUnits(row.shipping_flat_rate as string),
    shippingFreeThreshold: threshold == null ? null : toMinorUnits(threshold as string),
    taxBasisPoints: Number(row.tax_basis_points ?? 0),
  };
}

/**
 * What postage costs for one store's part of a basket.
 *
 * The threshold is compared against the subtotal *after* discount, which is the
 * choice that can be defended to a customer: a code that takes them under the free
 * shipping line should cost them the postage, or the discount is worth more than
 * its face value and the merchant silently absorbs the difference.
 */
export function shippingFor(
  settings: StoreCommerceSettings, discountedSubtotal: Money
): Money {
  if (settings.shippingFlatRate <= 0) return 0;
  if (settings.shippingFreeThreshold !== null && discountedSubtotal >= settings.shippingFreeThreshold) {
    return 0;
  }
  return settings.shippingFlatRate;
}

/** Basis points to a human percentage, for display only. */
export function taxRatePercent(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2).replace(/\.?0+$/, "");
}
