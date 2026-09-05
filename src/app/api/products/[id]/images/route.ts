export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {listImages, addImage, removeImage, reorderImage, ImageError} from "@/core/commerce/productImageService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

/**
 * Product images, by URL.
 *
 * This replaces /api/uploads, which registered files in a `file_assets` table that
 * does not exist in this project and therefore failed on every call.
 */

const uuid = z.string().uuid();

const postSchema = z.object({
  storeId: uuid.optional(),
  url: z.string().trim().min(1).max(2048),
}).strict();

const patchSchema = z.object({
  storeId: uuid.optional(),
  imageId: uuid,
  direction: z.enum(["up", "down"]),
}).strict();

function badId() {
  return apiError(400, "INVALID_PRODUCT_ID", "That product id isn't valid.");
}

function imageFailure(e: unknown) {
  if (!(e instanceof ImageError)) throw e;
  const messages: Record<string, [number, string]> = {
    IMAGE_URL_INVALID: [422, "That image link isn't valid. It must be an https:// address."],
    IMAGE_LIMIT_REACHED: [409, "A product can have up to 12 images."],
    IMAGE_NOT_FOUND: [404, "That image doesn't exist."],
  };
  const [status, message] = messages[e.code] ?? [400, "We couldn't update the images."];
  return apiError(status, e.code, message, e.detail);
}

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 240, windowSeconds: 60, scope: "images:list"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) return badId();
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "products:read");
    return apiSuccess({images: await listImages(storeId, params.id)});
  }
);

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 60, windowSeconds: 60, scope: "images:add"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) return badId();
    const parsed = postSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the image link and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "products:write");
    try {
      return apiSuccess(await addImage({storeId, productId: params.id, url: parsed.data.url}), 201);
    } catch (e) { return imageFailure(e); }
  }
);

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 120, windowSeconds: 60, scope: "images:reorder"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) return badId();
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "products:write");
    try {
      return apiSuccess(await reorderImage({
        storeId, productId: params.id,
        imageId: parsed.data.imageId, direction: parsed.data.direction,
      }));
    } catch (e) { return imageFailure(e); }
  }
);

export const DELETE = withApi(
  {methods: ["DELETE"], rateLimit: {limit: 60, windowSeconds: 60, scope: "images:remove"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) return badId();
    const url = new URL(req.url);
    const imageId = url.searchParams.get("imageId");
    if (!imageId || !uuid.safeParse(imageId).success) {
      return apiError(400, "INVALID_IMAGE_ID", "That image id isn't valid.");
    }
    const storeId = await resolveStoreId(url.searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "products:write");
    try {
      return apiSuccess(await removeImage({storeId, productId: params.id, imageId}));
    } catch (e) { return imageFailure(e); }
  }
);
