// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {getEntitlement} from "@/core/billing/entitlements";
import {createGenerationRequest} from "@/core/generation/generationService";
import {InsufficientCreditsError} from "@/core/billing/creditLedger";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const bodySchema = z.object({
  storeId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  type: z.enum(["product_hero", "product_lifestyle", "campaign", "collection", "banner", "social_creative"]),
  quality: z.enum(["draft", "standard", "high"]),
  count: z.number().int().min(1).max(20),
  idempotencyKey: z.string().min(16).max(128),
}).strict();

/**
 * accountId and planId are deliberately absent from the schema. They used to be read
 * from the request body, which let a caller raise their own per-job spend cap by
 * claiming a higher plan, or bill another tenant by naming their credit account.
 * Both now come from getEntitlement(), server-side, keyed on the verified store.
 */
export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 20, windowSeconds: 60, scope: "generation:create"}},
  async (req: NextRequest) => {
    const body = await readJson(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Check the generation options and try again.");
    }

    const storeId = await resolveStoreId(parsed.data.storeId);
    const membership = await authorizeStoreAction(storeId, "ai:generate");
    const entitlement = await getEntitlement(storeId);

    try {
      const result = await createGenerationRequest({
        storeId,
        projectId: parsed.data.projectId,
        accountId: entitlement.creditAccountId,
        planId: entitlement.planId,
        userId: membership.user.id,
        type: parsed.data.type,
        quality: parsed.data.quality,
        count: parsed.data.count,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      return apiSuccess(result, 201);
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return apiError(402, "INSUFFICIENT_CREDITS", "You don't have enough credits for this generation.");
      }
      const message = e instanceof Error ? e.message : "";
      if (message === "DUPLICATE_IDEMPOTENCY_KEY") {
        return apiError(409, "DUPLICATE_REQUEST", "That generation was already submitted.");
      }
      if (message === "LEDGER_JOB_SPEND_LIMIT_EXCEEDED") {
        return apiError(422, "JOB_TOO_LARGE", "That generation exceeds your plan's per-job credit limit.");
      }
      throw e;
    }
  }
);
