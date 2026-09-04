export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {sendAssistantMessage, loadConversation} from "@/core/ai/assistantService";
import {InsufficientCreditsError} from "@/core/ai/creditService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const schema = z.object({
  storeId: z.string().uuid().optional(),
  content: z.string().trim().min(1).max(4000),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "ai:assistant-read"}},
  async (req: NextRequest) => {
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "ai:use");
    return apiSuccess({messages: await loadConversation(storeId)});
  }
);

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 30, windowSeconds: 60, scope: "ai:assistant"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Type a message and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "ai:use");

    try {
      return apiSuccess(await sendAssistantMessage({storeId, content: parsed.data.content}));
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return apiError(402, "INSUFFICIENT_CREDITS", "You're out of AI credits.");
      }
      // The provider failed and the credit was refunded; say so plainly rather than
      // leaving the merchant wondering whether they were charged.
      return apiError(503, "ASSISTANT_UNAVAILABLE",
        "The assistant is unavailable right now. You haven't been charged.", e);
    }
  }
);
