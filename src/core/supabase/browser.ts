"use client";
import {createBrowserClient} from "@supabase/ssr";

/**
 * Browser client. Only ever receives the anon key, which is public by design —
 * RLS is what protects the data, not the key.
 */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
