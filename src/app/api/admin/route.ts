export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {requirePlatformAdmin, platformOverview} from "@/core/admin/adminService";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";
import {z} from "zod";

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 60, windowSeconds: 60, scope: "admin:overview"}},
  async (req: NextRequest) => {
    // Thrown as PLATFORM_ADMIN_REQUIRED, which withApi already maps to a 403.
    await requirePlatformAdmin();

    const days = z.coerce.number().int().min(1).max(365)
      .safeParse(new URL(req.url).searchParams.get("days") ?? 30);
    if (!days.success) return apiError(400, "INVALID_PERIOD", "Choose a period between 1 and 365 days.");

    return apiSuccess(await platformOverview(days.data));
  }
);
