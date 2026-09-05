/**
 * Money handling.
 *
 * The database stores prices as `numeric`, which arrives in JavaScript as a string
 * or a float depending on the driver. Neither is safe to do arithmetic on: floats
 * lose cents at scale, and a marketplace that computes a platform fee off a
 * rounding-error total will drift from what Stripe actually charged.
 *
 * Everything here works in integer minor units and converts only at the edges.
 */

export type Money = number; // minor units, e.g. pence or cents

export function toMinorUnits(value: string | number): Money {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) throw new Error("MONEY_INVALID");
  if (n < 0) throw new Error("MONEY_NEGATIVE");
  // Round rather than truncate: 19.99 * 100 is 1998.9999... in binary floating point.
  return Math.round(n * 100);
}

export function toDecimalString(minor: Money): string {
  if (!Number.isInteger(minor)) throw new Error("MONEY_NOT_INTEGER");
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMoney(minor: Money, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, {style: "currency", currency}).format(minor / 100);
}

/**
 * The platform's cut of a sale.
 *
 * Rounded down deliberately: rounding up would occasionally take a cent more from
 * the merchant than the stated percentage, which is the wrong direction for a fee
 * somebody else is paying.
 */
export function applicationFee(subtotal: Money, feeBasisPoints: number): Money {
  if (!Number.isInteger(subtotal) || subtotal < 0) throw new Error("MONEY_INVALID");
  if (!Number.isInteger(feeBasisPoints) || feeBasisPoints < 0 || feeBasisPoints > 10000) {
    throw new Error("FEE_BASIS_POINTS_INVALID");
  }
  return Math.floor((subtotal * feeBasisPoints) / 10000);
}

export function sumMoney(values: Money[]): Money {
  return values.reduce((total, v) => {
    if (!Number.isInteger(v)) throw new Error("MONEY_NOT_INTEGER");
    return total + v;
  }, 0);
}
