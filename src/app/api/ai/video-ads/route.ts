export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {requestVideoAd} from "@/core/ai/videoAdService";
import {InsufficientCreditsError, FEATURE_COST} from "@/core/ai/creditService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const schema = z.object({
  storeId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  hasMusic: z.boolean().default(true),
  hasVoiceover: z.boolean().default(false),
}).strict();

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 20, windowSeconds: 300, scope: "ai:video-ad"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "ai:use");

    try {
      const result = await requestVideoAd({
        storeId, productId: parsed.data.productId,
        hasMusic: parsed.data.hasMusic, hasVoiceover: parsed.data.hasVoiceover,
      });
      // A duplicate is a success from the caller's point of view: the ad they asked
      // for is already being made, and they have not been charged twice.
      return apiSuccess(result, result.duplicate ? 200 : 201);
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return apiError(402, "INSUFFICIENT_CREDITS",
          `A video ad costs ${FEATURE_COST.video_ad} credits and you don't have enough.`);
      }
      throw e;
    }
  }
);
