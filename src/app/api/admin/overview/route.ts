// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {withApi, apiSuccess} from "@/core/security/apiHandler";
import {requirePlatformAdmin} from "@/core/admin/platformAuth";
import {getRevenueOverview, getAiUsageAndMargin} from "@/core/analytics/analyticsService";
import {getJobsHealth} from "@/core/admin/adminService";

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 60, windowSeconds: 60, scope: "admin:overview"}},
  async () => {
    await requirePlatformAdmin();
    const [revenue, aiUsage, jobs] = await Promise.all([
      getRevenueOverview(), getAiUsageAndMargin(), getJobsHealth(),
    ]);
    return apiSuccess({revenue, aiUsage, jobs});
  }
);
