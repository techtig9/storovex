// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {createServerSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess} from "@/core/security/apiHandler";

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 30, windowSeconds: 300, scope: "auth:logout"}},
  async () => {
    const supabase = createServerSupabase();
    await supabase.auth.signOut();
    return apiSuccess({ok: true});
  }
);
