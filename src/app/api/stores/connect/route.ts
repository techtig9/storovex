export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {createConnectAccount, createConnectAccountLink} from "@/core/payments/stripe";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {siteUrl} from "@/core/config/site";
import {z} from "zod";

/**
 * Starts or resumes Stripe Connect onboarding.
 *
 * Until this completes a store has no stripe_account_id, and checkout refuses to
 * take payment for it — an order can be created but the shopper is never asked to
 * pay into nothing. This is the screen that fixes that.
 */

const schema = z.object({storeId: z.string().uuid().optional()}).strict();

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 10, windowSeconds: 300, scope: "stores:connect"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse((await readJson(req)) ?? {});
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    // Connecting a bank account is a billing action, so it is managers only.
    const membership = await authorizeStoreAction(storeId, "billing:write");

    const admin = createServiceRoleSupabase();
    const {data: store} = await admin.from("stores")
      .select("stripe_account_id").eq("id", storeId).maybeSingle();
    if (!store) return apiError(404, "STORE_NOT_FOUND", "That store doesn't exist.");

    try {
      let accountId = store.stripe_account_id as string | null;

      if (!accountId) {
        const account = await createConnectAccount({storeId, email: membership.user.email});
        accountId = account.id;
        // Persisted immediately. If the link generation below fails, the account
        // still exists at Stripe, and without this row the next attempt would
        // create a second one and split the merchant's payouts.
        const {error} = await admin.from("stores")
          .update({stripe_account_id: accountId}).eq("id", storeId);
        if (error) return apiError(500, "STORE_UPDATE_FAILED", "We couldn't save your Stripe account.", error);
      }

      const link = await createConnectAccountLink({
        accountId,
        refreshUrl: `${siteUrl()}/settings?stripe=refresh`,
        returnUrl: `${siteUrl()}/settings?stripe=done`,
      });
      return apiSuccess({url: link.url});
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (detail.startsWith("INTEGRATION_")) {
        return apiError(503, "STRIPE_NOT_CONFIGURED",
          "Payments aren't configured yet. Add a Stripe secret key and try again.", detail);
      }
      return apiError(502, "STRIPE_CONNECT_FAILED",
        "We couldn't reach Stripe. Try again in a moment.", detail);
    }
  }
);
