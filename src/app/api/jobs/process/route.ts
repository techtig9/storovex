// Reads request headers (auth), so it can never be prerendered.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import {type NextRequest} from "next/server";
import {timingSafeEqual} from "crypto";
import {runNextJob} from "@/core/generation/generationWorker";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";

/**
 * Drains the generation queue. Intended to be driven by a scheduler — a Vercel cron
 * entry hitting this every minute, or an external worker calling it in a loop.
 *
 * Protected by a shared secret rather than a user session, because the caller is a
 * machine. Without CRON_SECRET set the route refuses to run at all: an open endpoint
 * that spends user credits would be worse than a broken one.
 */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = withApi({methods: ["POST"], allowAnyContentType: true}, async (req: NextRequest) => {
  if (!process.env.CRON_SECRET) {
    return apiError(503, "NOT_CONFIGURED", "Job processing is not configured.");
  }
  if (!authorized(req)) {
    return apiError(401, "UNAUTHORIZED", "Invalid worker credentials.");
  }

  const workerId = req.headers.get("x-worker-id") ?? `worker-${process.env.VERCEL_REGION ?? "local"}`;
  const maxJobs = Math.min(Number(new URL(req.url).searchParams.get("max") ?? "5"), 20);

  const processed = [];
  for (let i = 0; i < maxJobs; i++) {
    const result = await runNextJob(workerId);
    if (!result) break;
    processed.push({jobId: result.jobId, ok: result.ok});
  }

  return apiSuccess({workerId, processed: processed.length, jobs: processed});
});
