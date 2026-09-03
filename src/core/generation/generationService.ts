import {createServiceRoleSupabase} from "@/core/supabase/server";
import {reserveJobCredits, commitJobCredits, refundJobCredits} from "@/core/billing/creditService";
import {estimateCredits, type GenerationType, type Quality} from "./catalog";
import {maxSpendPerJob, type PlanId} from "@/core/billing/plans";
import {randomUUID} from "crypto";

/**
 * Creates a generation job: estimate cost, reserve credits atomically, persist the
 * request, and enqueue it. The provider call happens in the worker, not here, so an
 * HTTP request never waits on an image model.
 */
export async function createGenerationRequest(input: {
  storeId: string; projectId: string; accountId: string; planId: PlanId; userId: string;
  type: GenerationType; quality: Quality; count: number; idempotencyKey: string;
  brief?: string; productName?: string; style?: string; referenceAssetId?: string;
}) {
  const credits = estimateCredits(input.type, input.quality, input.count);

  // Refuse rather than silently reserving the cap and doing the full job, which is
  // what Math.min(credits, cap) used to do.
  const cap = maxSpendPerJob(input.planId);
  if (credits > cap) throw new Error("LEDGER_JOB_SPEND_LIMIT_EXCEEDED");

  const jobId = randomUUID();
  const reservation = await reserveJobCredits({
    accountId: input.accountId, planId: input.planId, jobId,
    amount: credits, idempotencyKey: input.idempotencyKey,
  });

  // A replayed idempotency key means this job already exists. Return it instead of
  // creating a second row for the same request.
  if (reservation.duplicate) {
    const supabase = createServiceRoleSupabase();
    const {data} = await supabase
      .from("ai_generation_requests")
      .select("id,stage,estimated_credits")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (data) return data;
  }

  const supabase = createServiceRoleSupabase();
  const {data, error} = await supabase.from("ai_generation_requests").insert({
    id: jobId, store_id: input.storeId, project_id: input.projectId, user_id: input.userId,
    type: input.type, quality: input.quality, count: input.count,
    estimated_credits: credits, reserved_credits: credits,
    stage: "planning", attempt: 1, idempotency_key: input.idempotencyKey,
  }).select("id,stage,estimated_credits").single();

  if (error) {
    // The reservation is already committed to the ledger. Give it back rather than
    // leaving the user short for a job that will never run.
    await refundJobCredits({accountId: input.accountId, jobId, reason: "job row insert failed"})
      .catch(() => undefined);
    throw new Error("GENERATION_REQUEST_CREATE_FAILED");
  }

  const {error: queueError} = await supabase.from("job_queue").insert({
    id: jobId, store_id: input.storeId, user_id: input.userId, job_type: "image_generation",
    payload: {
      jobId, accountId: input.accountId, type: input.type, quality: input.quality,
      count: input.count, brief: input.brief, productName: input.productName,
      style: input.style, referenceAssetId: input.referenceAssetId,
    },
  });
  if (queueError) {
    await refundJobCredits({accountId: input.accountId, jobId, reason: "enqueue failed"})
      .catch(() => undefined);
    await supabase.from("ai_generation_requests")
      .update({stage: "failed", last_error: "ENQUEUE_FAILED"}).eq("id", jobId);
    throw new Error("GENERATION_ENQUEUE_FAILED");
  }

  return data;
}

export async function advanceStage(jobId: string, stage: string) {
  const supabase = createServiceRoleSupabase();
  await supabase.from("ai_generation_requests").update({stage}).eq("id", jobId);
  await supabase.from("job_events").insert({job_id: jobId, event_type: "stage_advanced", detail: {stage}});
}

export async function completeGenerationRequest(input: {
  jobId: string; accountId: string; actualAmount: number; assetIds: string[];
}) {
  const settlement = await commitJobCredits({
    accountId: input.accountId, jobId: input.jobId, actualAmount: input.actualAmount,
  });
  const supabase = createServiceRoleSupabase();
  await supabase.from("ai_generation_requests").update({stage: "completed"}).eq("id", input.jobId);
  await supabase.from("job_events").insert({
    job_id: input.jobId, event_type: "committed",
    detail: {assetIds: input.assetIds, ...settlement},
  });
  return settlement;
}

/**
 * Fails a job. Credits are refunded only once the job is genuinely finished — a job
 * that will be retried keeps its reservation, or a retry would have nothing to spend.
 */
export async function failGenerationRequest(input: {
  jobId: string; accountId: string; attempt: number; reason: string; maxAttempts?: number;
}) {
  const maxAttempts = input.maxAttempts ?? 5;
  const willRetry = input.attempt < maxAttempts;
  const supabase = createServiceRoleSupabase();

  if (!willRetry) {
    await refundJobCredits({accountId: input.accountId, jobId: input.jobId, reason: input.reason});
    await supabase.from("job_events").insert({
      job_id: input.jobId, event_type: "dead_lettered", detail: {reason: input.reason},
    });
  }

  await supabase.from("ai_generation_requests").update({
    stage: willRetry ? "planning" : "failed",
    attempt: input.attempt + 1,
    last_error: input.reason.slice(0, 500),
  }).eq("id", input.jobId);

  return {deadLetter: !willRetry, willRetry};
}
