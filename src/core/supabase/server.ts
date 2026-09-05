import {createServerClient, type CookieOptions} from "@supabase/ssr";
import {createClient} from "@supabase/supabase-js";
import {cookies} from "next/headers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`ENV_MISSING: ${name}`);
  return value;
}

/**
 * Request-scoped client carrying the caller's session. Every query made through it
 * runs under that user's RLS policies, which is what makes tenant isolation hold.
 * Use this for anything acting on behalf of a signed-in user.
 */
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({name, value, ...options});
          } catch {
            // Server Components cannot write cookies. Middleware refreshes the
            // session cookie on every request, so this is safe to swallow.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({name, value: "", ...options});
          } catch {
            // As above.
          }
        },
      },
    }
  );
}

/**
 * Bypasses RLS entirely. Only for operations with no user session that must still be
 * trusted: signed webhook handlers, background workers, platform admin writes.
 *
 * Never call this on a path where a request body decides which rows are touched
 * without an explicit ownership check first — RLS is not there to catch mistakes.
 */
export function createServiceRoleSupabase() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {auth: {autoRefreshToken: false, persistSession: false}}
  );
}
