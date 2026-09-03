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

export async function requireStoreMembership(storeId: string) {
  const user = await requireSession();
  const supabase = createServerSupabase();
  const {data, error} = await supabase
    .from("store_members")
    .select("store_id,role,status")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data || data.status !== "active") throw new Error("STORE_ACCESS_DENIED");
  return {user, storeId, role: data.role as Role};
}

/**
 * Resolves which store a request acts on. The client may name one, but membership is
 * always verified server-side; if it names none, we fall back to the caller's own
 * store. Pages previously sent the literal string "current" as a store id, which is
 * not a UUID, so every dashboard request failed.
 */
export async function resolveStoreId(requested?: string | null): Promise<string> {
  const user = await requireSession();
  const supabase = createServerSupabase();

  if (requested && requested !== "current") {
    const {data} = await supabase
      .from("store_members")
      .select("store_id")
      .eq("store_id", requested)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!data) throw new Error("STORE_ACCESS_DENIED");
    return data.store_id as string;
  }

  const {data} = await supabase
    .from("store_members")
    .select("store_id,created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", {ascending: true})
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("NO_STORE");
  return data.store_id as string;
}
