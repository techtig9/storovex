import {createServerSupabase} from "@/core/supabase/server";
import type {Role} from "./authorization";

export async function requireSession() {
  const supabase = createServerSupabase();
  // getUser() revalidates against Supabase. getSession() only decodes the cookie,
  // which is client-supplied, so it must never gate authorization.
  const {data, error} = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

/**
 * Confirms the caller belongs to a store and returns their role.
 *
 * Reads through store_team_members, which is the marketplace's membership table.
 */
export async function requireStoreMembership(storeId: string) {
  const user = await requireSession();
  const supabase = createServerSupabase();
  const {data, error} = await supabase
    .from("store_team_members")
    .select("store_id,role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) throw new Error("STORE_ACCESS_DENIED");
  return {user, storeId, role: data.role as Role};
}

/**
 * Resolves which store a request acts on. A client may name one, but membership is
 * always verified server-side; naming none falls back to the caller's first store.
 */
export async function resolveStoreId(requested?: string | null): Promise<string> {
  const user = await requireSession();
  const supabase = createServerSupabase();

  if (requested) {
    const {data} = await supabase
      .from("store_team_members").select("store_id")
      .eq("store_id", requested).eq("user_id", user.id).maybeSingle();
    if (!data) throw new Error("STORE_ACCESS_DENIED");
    return data.store_id as string;
  }

  const {data} = await supabase
    .from("store_team_members").select("store_id,invited_at")
    .eq("user_id", user.id)
    .order("invited_at", {ascending: true})
    .limit(1).maybeSingle();
  if (!data) throw new Error("NO_STORE");
  return data.store_id as string;
}
