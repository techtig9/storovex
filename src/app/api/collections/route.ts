export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {listCollections, createCollection} from "@/core/commerce/collectionService";
import {collectionFailure} from "./errors";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const createSchema = z.object({
  storeId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "collections:list"}},
  async (req: NextRequest) => {
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "products:read");
    return apiSuccess({collections: await listCollections(storeId)});
  }
);

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 60, windowSeconds: 60, scope: "collections:create"}},
  async (req: NextRequest) => {
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Give the collection a name.");
    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "products:write");
    try {
      return apiSuccess(await createCollection({storeId, title: parsed.data.title}), 201);
    } catch (e) { return collectionFailure(e); }
  }
);
