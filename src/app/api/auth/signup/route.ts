// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {createServerSupabase} from "@/core/supabase/server";
import {signupSchema} from "@/core/auth/schemas";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {siteUrl} from "@/core/config/site";

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 5, windowSeconds: 900, scope: "auth:signup"}},
  async (req: NextRequest) => {
    const body = await readJson(req);
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the details you entered.");

    const supabase = createServerSupabase();
    const {error} = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {display_name: parsed.data.displayName ?? null},
        emailRedirectTo: `${siteUrl()}/api/auth/callback`,
      },
    });

    // Never distinguish "already registered" from "created" in the response: doing so
    // turns signup into an account-existence oracle. Supabase sends the appropriate
    // mail either way.
    if (error && !/already registered/i.test(error.message)) {
      return apiError(400, "SIGNUP_FAILED", "We couldn't create that account.");
    }

    return apiSuccess({
      message: "Check your email to confirm your account.",
    }, 201);
  }
);
