// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {NextResponse, type NextRequest} from "next/server";
import {createServerSupabase} from "@/core/supabase/server";
import {safeRedirectPath} from "@/core/auth/redirect";

/**
 * Where Supabase sends the user back after email confirmation, password reset or an
 * OAuth round trip. Exchanges the one-time code for a session cookie.
 */
export async function GET(request: NextRequest) {
  const {searchParams, origin} = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createServerSupabase();
  const {error} = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_code`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
