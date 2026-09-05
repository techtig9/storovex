export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {storeAnalytics} from "@/core/analytics/analyticsService";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";
import {z} from "zod";

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 60, windowSeconds: 60, scope: "analytics:read"}},
  async (req: NextRequest) => {
    const params = new URL(req.url).searchParams;
    const days = z.coerce.number().int().min(1).max(365).safeParse(params.get("days") ?? 30);
    if (!days.success) return apiError(400, "INVALID_PERIOD", "Choose a period between 1 and 365 days.");

    const storeId = await resolveStoreId(params.get("storeId"));
    await authorizeStoreAction(storeId, "orders:read");
    return apiSuccess(await storeAnalytics(storeId, days.data));
  }
);
