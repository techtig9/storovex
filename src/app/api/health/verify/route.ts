// Makes live outbound calls, so it can never be prerendered.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import {type NextRequest} from "next/server";
import {timingSafeEqual} from "crypto";
import {verifyIntegrations} from "@/core/config/verifyIntegrations";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";

/**
 * Live preflight for every configured integration.
 *
 * Guarded by CRON_SECRET rather than a user session: it makes outbound calls with
 * production credentials and its output names configuration problems, so it must not
 * be reachable by ordinary users. Every check is a read — nothing is sent or charged.
 */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const GET = withApi({methods: ["GET"]}, async (req: NextRequest) => {
  if (!process.env.CRON_SECRET) {
    return apiError(503, "NOT_CONFIGURED", "Set CRON_SECRET to enable verification.");
  }
  if (!authorized(req)) return apiError(401, "UNAUTHORIZED", "Invalid credentials.");

  const checks = await verifyIntegrations();
  const required = checks.filter(c => ["supabase"].includes(c.id));
  const ready = required.every(c => c.ok);

  return apiSuccess({
    ready,
    summary: `${checks.filter(c => c.ok).length}/${checks.length} integrations verified`,
    checks,
  });
});
