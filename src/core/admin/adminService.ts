import {createServiceRoleSupabase, createServerSupabase} from "@/core/supabase/server";
import {toMinorUnits} from "@/core/commerce/money";

/**
 * Platform administration.
 *
 * This is the one place that deliberately reads across every store, so the guard is
 * the whole feature: `requirePlatformAdmin` re-reads the caller's role from the
 * database on every call rather than trusting anything the client sent. `users.role`
 * is constrained to `user` and `admin`.
 */

export class AdminError extends Error {
  constructor(readonly code: string) { super(code); }
}

export async function requirePlatformAdmin() {
  const supabase = createServerSupabase();
  const {data: auth, error} = await supabase.auth.getUser();
  if (error || !auth.user) throw new Error("UNAUTHENTICATED");

  // Through the service role: the caller can read their own users row under RLS,
  // but relying on that would mean a policy change silently becomes an
  // authorization change.
  const admin = createServiceRoleSupabase();
  const {data} = await admin.from("users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!data || data.role !== "admin") throw new Error("PLATFORM_ADMIN_REQUIRED");
  return {userId: auth.user.id};
}

const PAID = ["paid", "fulfilled"];

/** Marketplace-wide figures. */
export async function platformOverview(days = 30) {
  const admin = createServiceRoleSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [{data: stores}, {data: orders}, {count: userCount}, {count: productCount}] =
    await Promise.all([
      admin.from("stores").select("id,name,slug,created_at,stripe_account_id"),
      admin.from("orders").select("id,store_id,status,total,application_fee_amount,created_at")
        .gte("created_at", since),
      admin.from("users").select("id", {count: "exact", head: true}),
      admin.from("products").select("id", {count: "exact", head: true}),
    ]);

  const paidOrders = (orders ?? []).filter(o => PAID.includes(o.status as string));
  const gmv = paidOrders.reduce((sum, o) => sum + toMinorUnits(o.total as string), 0);
  const fees = paidOrders.reduce((sum, o) => sum + toMinorUnits(o.application_fee_amount as string), 0);

  // Per store, so the platform can see who is actually trading rather than only a
  // total that one large seller can dominate.
  const byStore = new Map<string, {orders: number; gmv: number}>();
  for (const order of paidOrders) {
    const id = order.store_id as string;
    const entry = byStore.get(id) ?? {orders: 0, gmv: 0};
    entry.orders += 1;
    entry.gmv += toMinorUnits(order.total as string);
    byStore.set(id, entry);
  }

  const storeRows = (stores ?? []).map(s => {
    const stats = byStore.get(s.id as string) ?? {orders: 0, gmv: 0};
    return {
      id: s.id as string,
      name: s.name as string,
      slug: s.slug as string,
      createdAt: s.created_at as string,
      // Whether they can be paid at all, which is the first thing to check when a
      // store has products but no orders.
      payoutsConnected: Boolean(s.stripe_account_id),
      orders: stats.orders,
      gmv: stats.gmv,
    };
  }).sort((a, b) => b.gmv - a.gmv);

  return {
    periodDays: days,
    storeCount: storeRows.length,
    userCount: userCount ?? 0,
    productCount: productCount ?? 0,
    // Kept apart on purpose: conflating what shoppers paid with what the platform
    // earned overstates the business by an order of magnitude.
    grossMerchandiseValue: gmv,
    platformRevenue: fees,
    paidOrders: paidOrders.length,
    // A store that cannot take money is a store that will never produce revenue,
    // so it is counted rather than left to be noticed.
    storesWithoutPayouts: storeRows.filter(s => !s.payoutsConnected).length,
    stores: storeRows.slice(0, 50),
  };
}
