import {createServerSupabase} from "@/core/supabase/server";
import {toMinorUnits} from "@/core/commerce/money";
import {
  averageOrderValue, grossMerchandiseValue, platformRevenue,
  refundRate, rankTopProducts, compare,
} from "./metrics";

/**
 * Merchant analytics.
 *
 * Reads through the caller's own client, so RLS restricts every figure to the
 * merchant's own store — a merchant cannot compute a number from another's orders
 * even if the store id were wrong.
 */

// orders_status_check allows pending_payment | paid | failed | fulfilled |
// cancelled | refunded. 'shipped' and 'delivered' were in this list and can never
// occur, so they matched nothing — harmless, but it read as though the pipeline
// had stages it does not have.
const PAID_STATUSES = ["paid", "fulfilled"];

export async function storeAnalytics(storeId: string, days = 30) {
  const supabase = createServerSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const previousSince = new Date(Date.now() - days * 2 * 86_400_000).toISOString();

  const [{data: current}, {data: previous}, {data: lines}] = await Promise.all([
    supabase.from("orders").select("id,total,application_fee_amount,status,created_at")
      .eq("store_id", storeId).gte("created_at", since),
    supabase.from("orders").select("id,total,status")
      .eq("store_id", storeId).gte("created_at", previousSince).lt("created_at", since),
    supabase.from("order_items")
      .select("variant_id,title_snapshot,price_snapshot,quantity,orders!inner(store_id,status,created_at)")
      .eq("orders.store_id", storeId).gte("orders.created_at", since),
  ]);

  const currentOrders = current ?? [];
  const paid = currentOrders.filter(o => PAID_STATUSES.includes(o.status as string));
  const refunded = currentOrders.filter(o => o.status === "refunded");

  const revenue = grossMerchandiseValue(paid.map(o => toMinorUnits(o.total as string)));
  const fees = platformRevenue(paid.map(o => toMinorUnits(o.application_fee_amount as string)));

  const previousPaid = (previous ?? []).filter(o => PAID_STATUSES.includes(o.status as string));
  const previousRevenue = grossMerchandiseValue(previousPaid.map(o => toMinorUnits(o.total as string)));

  const topProducts = rankTopProducts((lines ?? []).map(l => ({
    variantId: l.variant_id as string,
    title: (l.title_snapshot as string) ?? "Unknown",
    quantity: l.quantity as number,
    price: toMinorUnits(l.price_snapshot as string),
  })));

  return {
    periodDays: days,
    revenue: compare(revenue, previousRevenue),
    orders: compare(paid.length, previousPaid.length),
    // What the merchant keeps, which is the number they actually care about.
    netToMerchant: revenue - fees,
    platformFees: fees,
    averageOrderValue: averageOrderValue(revenue, paid.length),
    refundRatePct: refundRate(refunded.length, currentOrders.length),
    topProducts,
  };
}
