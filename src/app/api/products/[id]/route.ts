export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {getProduct, updateProduct, deleteProduct, createVariant} from "@/core/commerce/productService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const uuid = z.string().uuid();

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    storeId: uuid.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(20000).optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
  }),
  z.object({
    action: z.literal("add_variant"),
    storeId: uuid.optional(),
    sku: z.string().trim().min(1).max(100),
    // Minor units only. Accepting a decimal here would invite float arithmetic.
    price: z.number().int().min(0),
    compareAtPrice: z.number().int().min(0).nullable().optional(),
    stockQuantity: z.number().int().min(0),
    options: z.record(z.string()).optional(),
  }),
]);

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 240, windowSeconds: 60, scope: "products:get"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_PRODUCT_ID", "That product id isn't valid.");
    }
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "products:read");

    const product = await getProduct(storeId, params.id);
    if (!product) return apiError(404, "PRODUCT_NOT_FOUND", "That product doesn't exist.");
    return apiSuccess(product);
  }
);

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 120, windowSeconds: 60, scope: "products:update"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_PRODUCT_ID", "That product id isn't valid.");
    }
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "products:write");

    if (parsed.data.action === "add_variant") {
      return apiSuccess(await createVariant({
        storeId, productId: params.id,
        sku: parsed.data.sku, price: parsed.data.price,
        compareAtPrice: parsed.data.compareAtPrice ?? null,
        stockQuantity: parsed.data.stockQuantity,
        options: parsed.data.options,
      }), 201);
    }

    try {
      return apiSuccess(await updateProduct({storeId, productId: params.id, ...parsed.data}));
    } catch (e) {
      if (e instanceof Error && e.message === "NOTHING_TO_UPDATE") {
        return apiError(400, "NOTHING_TO_UPDATE", "No changes were supplied.");
      }
      throw e;
    }
  }
);

export const DELETE = withApi(
  {methods: ["DELETE"], rateLimit: {limit: 30, windowSeconds: 60, scope: "products:delete"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_PRODUCT_ID", "That product id isn't valid.");
    }
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "products:write");

    try {
      return apiSuccess(await deleteProduct(storeId, params.id));
    } catch (e) {
      if (e instanceof Error && e.message === "PRODUCT_HAS_ORDERS") {
        // Archiving keeps order history readable; deleting would dangle it.
        return apiError(409, "PRODUCT_HAS_ORDERS",
          "This product has been ordered, so it can't be deleted. Archive it instead.");
      }
      throw e;
    }
  }
);
