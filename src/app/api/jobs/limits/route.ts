// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {tierLimits, type PlanTier} from "@/core/scheduling/limits";
import {resolveStoreId} from "@/core/auth/session";
import {getEntitlement} from "@/core/billing/entitlements";
import {withApi, apiSuccess} from "@/core/security/apiHandler";

const PLAN_TO_TIER: Record<string, PlanTier> = {starter: "starter", mid: "mid", pro: "pro"};

/**
 * Returns the caller's own limits. It used to take `?tier=` from the query string
 * with no authentication at all, so anyone could enumerate every plan's limits and
 * the answer had nothing to do with who was asking.
 */
export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 60, windowSeconds: 60, scope: "jobs:limits"}},
  async (req: NextRequest) => {
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    const entitlement = await getEntitlement(storeId);
    const tier = PLAN_TO_TIER[entitlement.planId] ?? "free";
    return apiSuccess({tier, limits: tierLimits(tier)});
  }
);
