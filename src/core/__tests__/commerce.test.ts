import {toMinorUnits, toDecimalString, applicationFee, sumMoney, formatMoney} from "@/core/commerce/money";
import {computeTotals, validateDiscount, discountAmount, splitByStore, lineSubtotal, type Discount} from "@/core/commerce/pricing";
import {verifyStripeSignature} from "@/core/payments/stripe";
import {createHmac} from "crypto";

const discount = (over: Partial<Discount> = {}): Discount => ({
  id: "d1", code: "SAVE10", type: "percent", value: 10,
  minSubtotal: null, usageLimit: null, usedCount: 0, active: true, expiresAt: null,
  ...over,
});

describe("money is handled in integer minor units", () => {
  it("converts a decimal price without losing a cent to float error", () => {
    // 19.99 * 100 is 1998.9999999999998 in binary floating point. Truncating gives
    // 1998, which is a cent short on every single order.
    expect(toMinorUnits("19.99")).toBe(1999);
    expect(toMinorUnits(19.99)).toBe(1999);
    expect(toMinorUnits("0.07")).toBe(7);
  });

  it("round-trips back to a decimal string", () => {
    expect(toDecimalString(1999)).toBe("19.99");
    expect(toDecimalString(7)).toBe("0.07");
    expect(toDecimalString(100000)).toBe("1000.00");
    expect(toDecimalString(0)).toBe("0.00");
  });

  it("refuses values that are not money", () => {
    expect(() => toMinorUnits("abc")).toThrow(/MONEY_INVALID/);
    expect(() => toMinorUnits(-1)).toThrow(/MONEY_NEGATIVE/);
    expect(() => toDecimalString(19.5)).toThrow(/MONEY_NOT_INTEGER/);
  });

  it("formats for display", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
  });

  it("sums without drifting", () => {
    expect(sumMoney([1999, 1, 2500])).toBe(4500);
  });
});

describe("the platform fee", () => {
  it("takes the stated percentage", () => {
    // 500 basis points is 5%.
    expect(applicationFee(10000, 500)).toBe(500);
    expect(applicationFee(1999, 500)).toBe(99);
  });

  it("rounds down, never up", () => {
    // 5% of 1999 is 99.95. Rounding up would take a cent more from the merchant
    // than the rate they agreed to.
    expect(applicationFee(1999, 500)).toBe(99);
    expect(applicationFee(1, 500)).toBe(0);
  });

  it("rejects a nonsensical rate", () => {
    expect(() => applicationFee(1000, -1)).toThrow(/FEE_BASIS_POINTS_INVALID/);
    expect(() => applicationFee(1000, 10001)).toThrow(/FEE_BASIS_POINTS_INVALID/);
  });

  it("can never exceed the sale", () => {
    expect(applicationFee(1000, 10000)).toBe(1000);
  });
});

describe("discount validation reports why, not just whether", () => {
  it("accepts a valid discount", () => {
    expect(validateDiscount(discount(), 5000)).toEqual({ok: true});
  });

  it("names each rejection so checkout can explain it", () => {
    expect(validateDiscount(discount({active: false}), 5000))
      .toEqual({ok: false, reason: "DISCOUNT_INACTIVE"});
    expect(validateDiscount(discount({expiresAt: "2020-01-01T00:00:00Z"}), 5000))
      .toEqual({ok: false, reason: "DISCOUNT_EXPIRED"});
    expect(validateDiscount(discount({usageLimit: 5, usedCount: 5}), 5000))
      .toEqual({ok: false, reason: "DISCOUNT_USAGE_EXHAUSTED"});
    expect(validateDiscount(discount({minSubtotal: 10000}), 5000))
      .toEqual({ok: false, reason: "DISCOUNT_MINIMUM_NOT_MET"});
  });

  it("treats the expiry moment itself as expired", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    expect(validateDiscount(discount({expiresAt: at.toISOString()}), 5000, at).ok).toBe(false);
  });
});

describe("discount amounts", () => {
  it("computes a percentage", () => {
    expect(discountAmount(discount({type: "percent", value: 10}), 5000)).toBe(500);
  });

  it("computes a fixed amount", () => {
    expect(discountAmount(discount({type: "fixed", value: 750}), 5000)).toBe(750);
  });

  it("never exceeds the subtotal", () => {
    // A discount larger than the basket must not make the order payable to the
    // shopper.
    expect(discountAmount(discount({type: "fixed", value: 999999}), 5000)).toBe(5000);
  });
});

describe("order totals", () => {
  const items = [
    {variantId: "v1", quantity: 2, unitPrice: 1999},
    {variantId: "v2", quantity: 1, unitPrice: 500},
  ];

  it("sums line items", () => {
    expect(lineSubtotal(items)).toBe(4498);
  });

  it("applies a discount then tax on the discounted amount", () => {
    const totals = computeTotals({
      items, discount: discount({type: "fixed", value: 498}),
      shippingTotal: 500, taxBasisPoints: 2000,
    });
    expect(totals.subtotal).toBe(4498);
    expect(totals.discountTotal).toBe(498);
    // (4498 - 498 + 500) * 20% = 900
    expect(totals.taxTotal).toBe(900);
    expect(totals.total).toBe(5400);
  });

  it("ignores a discount that does not validate rather than applying it", () => {
    const totals = computeTotals({items, discount: discount({active: false})});
    expect(totals.discountTotal).toBe(0);
    expect(totals.total).toBe(4498);
  });

  it("never returns a negative total", () => {
    const totals = computeTotals({
      items: [{variantId: "v1", quantity: 1, unitPrice: 100}],
      discount: discount({type: "fixed", value: 100000}),
    });
    expect(totals.total).toBe(0);
  });

  it("rejects a zero or negative quantity", () => {
    expect(() => lineSubtotal([{variantId: "v", quantity: 0, unitPrice: 100}]))
      .toThrow(/QUANTITY_INVALID/);
  });
});

describe("splitting a basket across stores", () => {
  it("groups items by their store", () => {
    const split = splitByStore([
      {storeId: "a", sku: "1"}, {storeId: "b", sku: "2"}, {storeId: "a", sku: "3"},
    ]);
    expect(split.size).toBe(2);
    expect(split.get("a")).toHaveLength(2);
    expect(split.get("b")).toHaveLength(1);
  });

  it("handles a single-store basket", () => {
    expect(splitByStore([{storeId: "a"}]).size).toBe(1);
  });

  it("handles an empty basket", () => {
    expect(splitByStore([]).size).toBe(0);
  });

  it("prices each store independently, so one discount cannot cross stores", () => {
    const all = [
      {variantId: "v1", storeId: "a", quantity: 1, unitPrice: 1000},
      {variantId: "v2", storeId: "b", quantity: 1, unitPrice: 2000},
    ];
    const split = splitByStore(all);
    const a = computeTotals({items: split.get("a")!, discount: discount({type: "fixed", value: 500})});
    const b = computeTotals({items: split.get("b")!});
    expect(a.total).toBe(500);
    expect(b.total).toBe(2000);
  });
});

describe("Stripe webhook signatures", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({id: "evt_1", type: "payment_intent.succeeded"});

  function sign(timestamp: number, payload = body, key = secret) {
    const sig = createHmac("sha256", key).update(`${timestamp}.${payload}`).digest("hex");
    return `t=${timestamp},v1=${sig}`;
  }

  it("accepts a correctly signed recent delivery", () => {
    const now = Date.now();
    expect(verifyStripeSignature(sign(Math.floor(now / 1000)), body, secret, now)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const now = Date.now();
    const header = sign(Math.floor(now / 1000));
    expect(verifyStripeSignature(header, body.replace("succeeded", "failed"), secret, now)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const now = Date.now();
    expect(verifyStripeSignature(sign(Math.floor(now / 1000), body, "whsec_other"), body, secret, now)).toBe(false);
  });

  it("rejects a replayed delivery outside the tolerance window", () => {
    const now = Date.now();
    const old = Math.floor(now / 1000) - 3600;
    expect(verifyStripeSignature(sign(old), body, secret, now)).toBe(false);
  });

  it("rejects a forged timestamp, because the timestamp is signed too", () => {
    const now = Date.now();
    const real = sign(Math.floor(now / 1000) - 3600);
    const forged = real.replace(/^t=\d+/, `t=${Math.floor(now / 1000)}`);
    expect(verifyStripeSignature(forged, body, secret, now)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    const now = Date.now();
    expect(verifyStripeSignature(null, body, secret, now)).toBe(false);
    expect(verifyStripeSignature("garbage", body, secret, now)).toBe(false);
    expect(verifyStripeSignature("t=123", body, secret, now)).toBe(false);
  });
});
