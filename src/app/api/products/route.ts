// Reads request headers (auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {listProducts, createProduct} from "@/core/commerce/productService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const listSchema = z.object({
  storeId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const createSchema = z.object({
  storeId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000).optional(),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "products:list"}},
  async (req: NextRequest) => {
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check your filters and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "products:read");
    return apiSuccess(await listProducts({...parsed.data, storeId}));
  }
);

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 60, windowSeconds: 60, scope: "products:create"}},
  async (req: NextRequest) => {
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the product details.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "products:write");
    // status is deliberately not accepted here: a product is always created as a
    // draft and published through an explicit update.
    return apiSuccess(await createProduct({
      storeId, title: parsed.data.title, description: parsed.data.description,
    }), 201);
  }
);
