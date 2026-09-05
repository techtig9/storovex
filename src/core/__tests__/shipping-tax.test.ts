import {shippingFor, settingsFromRow, taxRatePercent, NO_SHIPPING_OR_TAX} from "@/core/commerce/storeSettings";
import {computeTotals} from "@/core/commerce/pricing";
import type {Discount} from "@/core/commerce/pricing";

const items = [{variantId: "v1", quantity: 2, unitPrice: 2500}]; // $50.00

describe("shipping", () => {
  it("charges nothing when the merchant has set no rate", () => {
    expect(shippingFor(NO_SHIPPING_OR_TAX, 5000)).toBe(0);
  });

  it("charges the flat rate below the free threshold", () => {
    const s = {shippingFlatRate: 599, shippingFreeThreshold: 5000, taxBasisPoints: 0};
    expect(shippingFor(s, 4999)).toBe(599);
  });

  it("ships free at the threshold, not just above it", () => {
    // "Free over $50" that charges on an order of exactly $50 is the kind of
    // off-by-one a customer notices and complains about.
    const s = {shippingFlatRate: 599, shippingFreeThreshold: 5000, taxBasisPoints: 0};
    expect(shippingFor(s, 5000)).toBe(0);
    expect(shippingFor(s, 5001)).toBe(0);
  });

  it("never ships free when no threshold is set", () => {
    const s = {shippingFlatRate: 599, shippingFreeThreshold: null, taxBasisPoints: 0};
    expect(shippingFor(s, 1_000_00)).toBe(599);
  });

  it("compares the threshold against the discounted subtotal", () => {
    // A code that takes the basket under the free-shipping line should cost the
    // shopper the postage. Otherwise the discount is quietly worth more than its
    // face value and the merchant absorbs the difference.
    const s = {shippingFlatRate: 599, shippingFreeThreshold: 5000, taxBasisPoints: 0};
    expect(shippingFor(s, 5000)).toBe(0);
    expect(shippingFor(s, 4500)).toBe(599);
  });
});

describe("tax", () => {
  it("is zero when unset, so nothing changes for a store that never configures it", () => {
    expect(computeTotals({items}).taxTotal).toBe(0);
    expect(computeTotals({items}).total).toBe(5000);
  });

  it("applies to goods plus postage", () => {
    // 8.25% of ($50.00 + $5.99) = $4.62
    const totals = computeTotals({items, shippingTotal: 599, taxBasisPoints: 825});
    expect(totals.taxTotal).toBe(461);
    expect(totals.total).toBe(5000 + 599 + 461);
  });

  it("is charged after the discount, not before", () => {
    const discount: Discount = {
      id: "d", code: "TEN", type: "percent", value: 10,
      minSubtotal: null, usageLimit: null, usedCount: 0, active: true, expiresAt: null,
    };
    const totals = computeTotals({items, discount, taxBasisPoints: 1000});
    // $50 - $5 = $45, taxed at 10% = $4.50. Taxing the pre-discount $50 would
    // charge the shopper tax on money they did not spend.
    expect(totals.discountTotal).toBe(500);
    expect(totals.taxTotal).toBe(450);
    expect(totals.total).toBe(4950);
  });

  it("rounds tax down, never up", () => {
    // A cent invented by rounding is a cent the merchant has to remit and did not
    // collect.
    const totals = computeTotals({items: [{variantId: "v", quantity: 1, unitPrice: 999}], taxBasisPoints: 825});
    expect(totals.taxTotal).toBe(Math.floor((999 * 825) / 10000));
  });
});

describe("reading settings off a row", () => {
  it("treats a missing row as no shipping and no tax", () => {
    expect(settingsFromRow(null)).toEqual(NO_SHIPPING_OR_TAX);
  });

  it("converts money columns to minor units", () => {
    const s = settingsFromRow({
      shipping_flat_rate: "5.99", shipping_free_threshold: "50.00", tax_basis_points: 825,
    });
    expect(s).toEqual({shippingFlatRate: 599, shippingFreeThreshold: 5000, taxBasisPoints: 825});
  });

  it("keeps a null threshold null rather than turning it into zero", () => {
    // Zero would mean "everything ships free", which is the opposite of "no
    // threshold set".
    expect(settingsFromRow({shipping_flat_rate: "5.99", shipping_free_threshold: null}).shippingFreeThreshold)
      .toBeNull();
  });
});

describe("showing a tax rate", () => {
  it("reads back as the percentage a merchant typed", () => {
    expect(taxRatePercent(825)).toBe("8.25");
    expect(taxRatePercent(2000)).toBe("20");
    expect(taxRatePercent(0)).toBe("0");
  });
});
