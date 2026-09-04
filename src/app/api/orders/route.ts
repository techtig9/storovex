export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {listOrders, ORDER_STATUSES} from "@/core/commerce/orderService";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";
import {z} from "zod";

const schema = z.object({
  storeId: z.string().uuid().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "orders:list"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check your filters and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "orders:read");
    return apiSuccess(await listOrders({...parsed.data, storeId}));
  }
);
