// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {createAssetSignedUrl} from "@/core/storage/signedUrlService";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const bodySchema = z.object({
  ttlSeconds: z.number().int().min(1).max(3600).optional(),
}).strict();

/**
 * Mints a short-lived signed URL for one asset.
 *
 * The previous version authorised a store id from the request body and then signed a
 * bucket and storage path *also* taken from the body, while ignoring params.assetId
 * entirely. Any member of any store could therefore read any object in any private
 * bucket belonging to any tenant.
 *
 * Now the asset id in the path is the only input that selects a row. Its bucket,
 * path and owning store are read from the database, and authorisation is checked
 * against the store the asset actually belongs to. The client cannot name a path.
 */
export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 60, windowSeconds: 60, scope: "assets:sign"}},
  async (req: NextRequest, {params}) => {
    const assetId = params?.assetId;
    if (!assetId || !z.string().uuid().safeParse(assetId).success) {
      return apiError(400, "INVALID_ASSET_ID", "That asset id isn't valid.");
    }

    const body = await readJson(req);
    const parsed = bodySchema.safeParse(body ?? {});
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    // Service role reads the asset's true location. This is a lookup only: nothing
    // from the request influences which row is returned.
    const admin = createServiceRoleSupabase();
    const {data: asset} = await admin
      .from("assets")
      .select("id,store_id,bucket,storage_path")
      .eq("id", assetId)
      .maybeSingle();

    // Same response whether the asset is missing or belongs to another tenant, so
    // this cannot be used to probe which asset ids exist.
    if (!asset) return apiError(404, "ASSET_NOT_FOUND", "That asset doesn't exist.");

    await authorizeStoreAction(asset.store_id as string, "store:read");

    const result = await createAssetSignedUrl({
      bucket: asset.bucket as never,
      storagePath: asset.storage_path as string,
      ttlSeconds: parsed.data.ttlSeconds,
    });

    return apiSuccess({assetId, ...result});
  }
);
