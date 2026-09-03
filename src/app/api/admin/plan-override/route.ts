// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {requirePlatformAdmin} from "@/core/admin/platformAuth";
import {applyPlanOverride} from "@/core/admin/adminService";
import {z} from "zod";

const schema = z.object({
  storeId: z.string().uuid(),
  newPlanId: z.enum(["starter", "mid", "pro"]),
  reason: z.string().trim().min(10).max(500),
}).strict();

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 20, windowSeconds: 300, scope: "admin:plan-override"}},
  async (req: NextRequest) => {
    // Authorise before parsing so a non-admin learns nothing about the payload shape.
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) {
      return apiError(422, "INVALID_REQUEST", "A store, plan and a reason of at least 10 characters are required.");
    }
    return apiSuccess(await applyPlanOverride({adminUserId: admin.id, ...parsed.data}));
  }
);
