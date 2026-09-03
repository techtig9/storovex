import {NextResponse, type NextRequest} from "next/server";
import {updateSession} from "@/core/supabase/middleware";

// Everything under these prefixes requires a signed-in user.
const PROTECTED_PREFIXES = ["/dashboard", "/generate", "/billing", "/projects", "/settings", "/admin"];
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
