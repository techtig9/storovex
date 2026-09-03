// Reads request headers (auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {createServerSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";
import {z} from "zod";

/** Lets the generation screen poll a job's stage. Scoped by RLS to the caller's store. */
export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 300, windowSeconds: 60, scope: "generation:status"}},
  async (req: NextRequest) => {
    const params = new URL(req.url).searchParams;
    const jobId = params.get("jobId");
    if (!jobId || !z.string().uuid().safeParse(jobId).success) {
      return apiError(400, "INVALID_JOB_ID", "That job id isn't valid.");
    }

    const storeId = await resolveStoreId(params.get("storeId"));
    await authorizeStoreAction(storeId, "store:read");

    // The user's own client, so RLS is the thing enforcing store scoping here.
    const supabase = createServerSupabase();
    const {data: job} = await supabase
      .from("ai_generation_requests")
      .select("id,stage,attempt,last_error,estimated_credits,type,quality,count")
      .eq("id", jobId).eq("store_id", storeId).maybeSingle();

    if (!job) return apiError(404, "JOB_NOT_FOUND", "That generation doesn't exist.");

    const {data: assets} = await supabase
      .from("assets").select("id,bucket,storage_path,created_at")
      .eq("generation_request_id", jobId).order("created_at", {ascending: true});

    return apiSuccess({
      job: {
        id: job.id, stage: job.stage, attempt: job.attempt,
        // Provider errors can echo prompt content; the client gets a stage, not a trace.
        failed: job.stage === "failed",
        type: job.type, quality: job.quality, count: job.count,
        estimatedCredits: job.estimated_credits,
      },
      assets: assets ?? [],
    });
  }
);
