export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {listCategories, productMemberships, setProductMemberships} from "@/core/commerce/collectionService";
import {collectionFailure} from "../collections/errors";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

/**
 * The shared category list, and what a product belongs to.
 *
 * Categories are the platform's taxonomy: readable by everyone, writable by nobody
 * through this API. A marketplace where each seller invents category names cannot
 * be browsed across sellers.
 */

const assignSchema = z.object({
  storeId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  collectionIds: z.array(z.string().uuid()).max(50).optional(),
  categoryIds: z.array(z.string().uuid()).max(50).optional(),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "categories:list"}},
  async (req: NextRequest) => {
    const productId = new URL(req.url).searchParams.get("productId");
    const categories = await listCategories();

    if (!productId) return apiSuccess({categories});
    if (!z.string().uuid().safeParse(productId).success) {
      return apiError(400, "INVALID_PRODUCT_ID", "That product id isn't valid.");
    }
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "products:read");
    return apiSuccess({categories, memberships: await productMemberships(storeId, productId)});
  }
);

export const PUT = withApi(
  {methods: ["PUT"], rateLimit: {limit: 60, windowSeconds: 60, scope: "categories:assign"}},
  async (req: NextRequest) => {
    const parsed = assignSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");
    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "products:write");
    try {
      return apiSuccess(await setProductMemberships({...parsed.data, storeId}));
    } catch (e) { return collectionFailure(e); }
  }
);
