export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {deleteCollection} from "@/core/commerce/collectionService";
import {collectionFailure} from "../errors";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";
import {z} from "zod";

const uuid = z.string().uuid();

export const DELETE = withApi(
  {methods: ["DELETE"], rateLimit: {limit: 30, windowSeconds: 60, scope: "collections:delete"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_COLLECTION_ID", "That collection id isn't valid.");
    }
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "products:write");
    try {
      return apiSuccess(await deleteCollection(storeId, params.id));
    } catch (e) { return collectionFailure(e); }
  }
);
