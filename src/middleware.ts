import {NextResponse, type NextRequest} from "next/server";
import {updateSession} from "@/core/supabase/middleware";

/**
 * This file MUST live at src/middleware.ts, not at the repository root.
 *
 * Next.js looks for middleware beside the `app` directory: at the project root for a
 * root-level app/, and inside src/ for a src/app/ project like this one. It was at
 * the root, so Next compiled no middleware at all — the build manifest listed
 * "middleware": [] — and every guard below was silently inert. Protected routes
 * served to signed-out visitors, and sessions were never refreshed, so a user would
 * be logged out whenever their access token expired.
 *
 * Nothing warned about this. The file typechecked, linted and looked correct; it was
 * simply never loaded. Moving it here is the entire fix.
 */

// Everything under these prefixes requires a signed-in user.
//
// This list must track the merchant routes that actually exist. It previously named
// /generate, /billing and /projects — routes from a different product that no longer
// exist here — while omitting /products, /orders and /discounts, which do. The API
// still refused those callers, so nothing leaked, but an unauthenticated visitor got
// a broken screen full of errors instead of being sent to sign in.
const PROTECTED_PREFIXES = [
  "/dashboard", "/products", "/orders", "/discounts", "/settings", "/admin",
];
// Signed-in users are bounced away from these.
const AUTH_ONLY_PREFIXES = ["/login", "/signup", "/reset-password"];

function isUnder(pathname: string, prefixes: string[]) {
  return prefixes.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const {pathname} = request.nextUrl;

  // Session refresh must happen on every matched request, not only protected ones,
  // or a user browsing public pages would silently fall out of their session.
  const {response, user} = await updateSession(request);

  if (!user && isUnder(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Only a same-origin relative path is preserved, so this cannot be used as an
    // open redirect back out to an attacker's site after login.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isUnder(pathname, AUTH_ONLY_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
