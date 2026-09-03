// Reads request headers (auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId, requireSession} from "@/core/auth/session";
import {createCheckoutTransaction} from "@/core/billing/paddleClient";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const schema = z.object({
  storeId: z.string().uuid().optional(),
  planId: z.enum(["starter", "mid", "pro"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
}).strict();

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 20, windowSeconds: 300, scope: "billing:checkout"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Choose a plan and billing period.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    // Only an owner can start a purchase that binds the store to a subscription.
    await authorizeStoreAction(storeId, "billing:write");
    const user = await requireSession();
    if (!user.email) return apiError(422, "NO_EMAIL", "Your account has no email address.");

    try {
      const result = await createCheckoutTransaction({
        storeId, planId: parsed.data.planId, cycle: parsed.data.cycle, customerEmail: user.email,
      });
      return apiSuccess(result, 201);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (message.startsWith("PADDLE_PRICE_NOT_CONFIGURED")) {
        return apiError(503, "PLAN_UNAVAILABLE", "That plan isn't available for purchase yet.", e);
      }
      if (message.startsWith("INTEGRATION_NOT_CONFIGURED")) {
        return apiError(503, "BILLING_UNAVAILABLE", "Billing isn't configured yet.", e);
      }
      throw e;
    }
  }
);
