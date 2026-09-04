import {createServerSupabase, createServiceRoleSupabase} from "@/core/supabase/server";

/**
 * The merchant's own store record.
 *
 * stripe_account_id and subscription_id are readable only by the server: the column
 * grants on `stores` give anon and authenticated just id, name, slug and created_at,
 * so anything here that needs the rest uses the service role.
 */

export class StoreError extends Error {
  constructor(readonly code: string, readonly detail?: unknown) { super(code); }
}

export async function getStoreForMerchant(storeId: string) {
  // Service role, because the merchant genuinely needs to know whether their Stripe
  // account is connected, and that column is not client-readable.
  const admin = createServiceRoleSupabase();
  const {data} = await admin.from("stores")
    .select("id,name,slug,stripe_account_id,subscription_id,created_at")
    .eq("id", storeId).maybeSingle();
  if (!data) throw new StoreError("STORE_NOT_FOUND");

  const {data: subscription} = data.subscription_id
    ? await admin.from("subscriptions").select("credits_remaining")
        .eq("id", data.subscription_id as string).maybeSingle()
    : {data: null};

  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    // The id itself is not returned. Whether onboarding is finished is the only
    // thing the interface needs, and the account id is a value with no business
    // being in a browser.
    stripeConnected: Boolean(data.stripe_account_id),
    creditsRemaining: (subscription?.credits_remaining as number | undefined) ?? 0,
    createdAt: data.created_at as string,
  };
}

export async function updateStore(input: {storeId: string; name?: string; slug?: string}) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.slug !== undefined) patch.slug = input.slug.trim().toLowerCase();
  if (Object.keys(patch).length === 0) throw new StoreError("NOTHING_TO_UPDATE");

  if (typeof patch.slug === "string" && !/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(patch.slug)) {
    throw new StoreError("SLUG_INVALID");
  }

  // Through the caller's client, so the stores_member_update policy is what permits
  // the write and only a manager can make it.
  const supabase = createServerSupabase();
  const {data, error} = await supabase.from("stores").update(patch)
    .eq("id", input.storeId).select("id,name,slug").maybeSingle();

  if (error) {
    // The unique index is on lower(slug); a clash means the storefront URL is taken.
    if (error.code === "23505") throw new StoreError("SLUG_TAKEN");
    throw new StoreError("STORE_UPDATE_FAILED", error.message);
  }
  if (!data) throw new StoreError("STORE_UPDATE_FORBIDDEN");
  return data;
}

/** Every store the signed-in user belongs to, for the store switcher. */
export async function listMyStores() {
  const supabase = createServerSupabase();
  const {data: memberships} = await supabase
    .from("store_team_members").select("store_id,role").order("invited_at", {ascending: true});
  const ids = (memberships ?? []).map(m => m.store_id as string);
  if (ids.length === 0) return [];

  const {data: stores} = await supabase.from("stores").select("id,name,slug").in("id", ids);
  const byId = new Map((stores ?? []).map(s => [s.id as string, s]));
  return (memberships ?? []).map(m => {
    const store = byId.get(m.store_id as string);
    return {
      id: m.store_id as string,
      name: (store?.name as string) ?? "Untitled store",
      slug: (store?.slug as string) ?? "",
      role: m.role as string,
    };
  });
}
