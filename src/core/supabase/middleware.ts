import {createServerClient, type CookieOptions} from "@supabase/ssr";
import {NextResponse, type NextRequest} from "next/server";

/**
 * Refreshes the Supabase session cookie on every request and returns both the
 * response carrying the refreshed cookie and the current user.
 *
 * Server Components cannot write cookies, so without this running in middleware a
 * session would expire and never renew.
 *
 * Two ways this can be asked to run without a working database, and neither may
 * take the site down. Middleware runs ahead of every route, including the marketing
 * pages and the login form, so anything thrown here is a 500 on *every* URL rather
 * than a degraded corner of the app.
 *
 *   1. No credentials configured. This is the normal state of a fresh deployment —
 *      the app is built to boot without them so it can be deployed first and
 *      configured after. createServerClient rejects an undefined URL, so the client
 *      is not constructed at all.
 *   2. Supabase unreachable or erroring. A signed-in visitor should degrade to
 *      signed-out, not meet a blank error page on the homepage.
 *
 * Reporting no user is the safe direction in both cases: public pages render, and
 * middleware sends protected routes to /login, which is the correct outcome when
 * there is no way to verify a session.
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({request: {headers: request.headers}});

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return {response, user: null, configured: false};

  return withSupabase(request, url, anonKey);
}

async function withSupabase(request: NextRequest, url: string, anonKey: string) {
  let response = NextResponse.next({request: {headers: request.headers}});

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({name, value, ...options});
          response = NextResponse.next({request: {headers: request.headers}});
          response.cookies.set({name, value, ...options});
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({name, value: "", ...options});
          response = NextResponse.next({request: {headers: request.headers}});
          response.cookies.set({name, value: "", ...options});
        },
      },
    });

    // getUser() revalidates the token against Supabase. getSession() only decodes
    // the cookie, which a client could have forged, so it must not be used for
    // authorization.
    const {data, error} = await supabase.auth.getUser();
    if (error) return {response, user: null, configured: true};
    return {response, user: data.user, configured: true};
  } catch {
    // An unreachable auth service degrades the visitor to signed-out rather than
    // returning a 500 from every URL on the site.
    return {response, user: null, configured: true};
  }
}
