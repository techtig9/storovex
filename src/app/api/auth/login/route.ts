// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {createServerSupabase} from "@/core/supabase/server";
import {loginSchema} from "@/core/auth/schemas";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";

export const POST = withApi(
  // Tighter than most routes: credential stuffing is the attack this route exists to
  // survive. Keyed per IP by withApi.
  {methods: ["POST"], rateLimit: {limit: 10, windowSeconds: 900, scope: "auth:login"}},
  async (req: NextRequest) => {
    const body = await readJson(req);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return apiError(400, "INVALID_CREDENTIALS", "Email or password is incorrect.");

    const supabase = createServerSupabase();
    const {error} = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    // One message for every failure mode — wrong password, unknown address,
    // unconfirmed email — so the response cannot be used to enumerate accounts.
    if (error) return apiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

    return apiSuccess({ok: true});
  }
);
