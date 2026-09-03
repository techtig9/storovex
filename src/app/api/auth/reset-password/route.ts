// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {createServerSupabase} from "@/core/supabase/server";
import {resetRequestSchema} from "@/core/auth/schemas";
import {withApi, apiSuccess, readJson} from "@/core/security/apiHandler";
import {siteUrl} from "@/core/config/site";

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 5, windowSeconds: 900, scope: "auth:reset"}},
  async (req: NextRequest) => {
    const body = await readJson(req);
    const parsed = resetRequestSchema.safeParse(body);

    if (parsed.success) {
      const supabase = createServerSupabase();
      await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${siteUrl()}/api/auth/callback?next=/settings/password`,
      });
    }

    // Always the same response, whether or not the address exists and whether or not
    // the request even parsed. Anything else leaks which addresses have accounts.
    return apiSuccess({
      message: "If that email has an account, a reset link is on its way.",
    });
  }
);
