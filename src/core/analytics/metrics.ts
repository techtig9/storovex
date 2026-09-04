import type {Money} from "@/core/commerce/money";

/**
 * Commerce metrics as pure functions, so the arithmetic is testable without a
 * database and cannot quietly differ between the merchant dashboard and the admin
 * console.
 *
 * Every function refuses rather than returning a plausible-looking wrong number:
 * a metric that silently divides by zero is worse than one that is absent, because
 * somebody will act on it.
 */

export function averageOrderValue(revenue: Money, orderCount: number): Money {
  if (revenue < 0 || orderCount < 0) throw new Error("AOV_INPUT_INVALID");
  // No orders means AOV is undefined, not zero. Zero reads as "our orders are
  // worthless" rather than "we have no orders".
  if (orderCount === 0) return 0;
  return Math.round(revenue / orderCount);
}

export function conversionRate(orders: number, sessions: number): number {
  if (orders < 0 || sessions < 0) throw new Error("CONVERSION_INPUT_INVALID");
  if (orders > sessions) throw new Error("CONVERSION_EXCEEDS_SESSIONS");
  if (sessions === 0) return 0;
  return Math.round((orders / sessions) * 10000) / 100;
}

export function grossMerchandiseValue(orderTotals: Money[]): Money {
  return orderTotals.reduce((sum, t) => {
    if (!Number.isInteger(t) || t < 0) throw new Error("GMV_INPUT_INVALID");
    return sum + t;
  }, 0);
}

/** What the platform actually earns — the sum of application fees, not GMV. */
export function platformRevenue(applicationFees: Money[]): Money {
  return applicationFees.reduce((sum, f) => {
    if (!Number.isInteger(f) || f < 0) throw new Error("FEE_INPUT_INVALID");
    return sum + f;
  }, 0);
}

export function refundRate(refunded: number, total: number): number {
  if (refunded < 0 || total < 0) throw new Error("REFUND_INPUT_INVALID");
  if (refunded > total) throw new Error("REFUNDS_EXCEED_ORDERS");
  if (total === 0) return 0;
  return Math.round((refunded / total) * 10000) / 100;
}

export type PeriodComparison = {current: number; previous: number; changePct: number | null};

/**
 * Period-over-period change.
 *
 * Returns null rather than Infinity when the previous period was zero: "up ∞%" is
 * not information, and rendering it makes a dashboard look broken.
 */
export function compare(current: number, previous: number): PeriodComparison {
  const changePct = previous === 0
    ? null
    : Math.round(((current - previous) / previous) * 10000) / 100;
  return {current, previous, changePct};
}

export type TopProduct = {productId: string; title: string; unitsSold: number; revenue: Money};

export function rankTopProducts(
  lines: {variantId: string; title: string; quantity: number; price: Money}[],
  limit = 10
): TopProduct[] {
  const byTitle = new Map<string, TopProduct>();
  for (const line of lines) {
    // Grouped by the snapshotted title, so a renamed product does not split into
    // two rows in the report.
    const existing = byTitle.get(line.title);
    const revenue = line.price * line.quantity;
    if (existing) {
      existing.unitsSold += line.quantity;
      existing.revenue += revenue;
    } else {
      byTitle.set(line.title, {
        productId: line.variantId, title: line.title,
        unitsSold: line.quantity, revenue,
      });
    }
  }
  return [...byTitle.values()]
    .sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold)
    .slice(0, limit);
}
