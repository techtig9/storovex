import {createServerClient, type CookieOptions} from "@supabase/ssr";
import {NextResponse, type NextRequest} from "next/server";

/**
 * Refreshes the Supabase session cookie on every request and returns both the
 * response carrying the refreshed cookie and the current user.
 *
 * Server Components cannot write cookies, so without this running in middleware a
 * session would expire and never renew.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({request: {headers: request.headers}});

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  // getUser() revalidates the token against Supabase. getSession() only decodes the
  // cookie, which a client could have forged, so it must not be used for authorization.
  const {data: {user}} = await supabase.auth.getUser();
  return {response, user};
}
