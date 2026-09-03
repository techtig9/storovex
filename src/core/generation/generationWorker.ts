import {createServiceRoleSupabase} from "@/core/supabase/server";
import {runImageGeneration, buildImagePrompt} from "@/core/ai/imageGeneration";
import {advanceStage, completeGenerationRequest, failGenerationRequest} from "./generationService";
import {estimateCredits, type GenerationType, type Quality} from "./catalog";
import {ProviderError, type FetchLike} from "@/core/ai/providers/types";
import {randomUUID} from "crypto";

export type JobPayload = {
  jobId: string; accountId: string; type: GenerationType; quality: Quality; count: number;
  brief?: string; productName?: string; style?: string; referenceAssetId?: string;
};

/**
 * Executes one generation job end to end.
 *
 * This is the piece that did not exist. Previously createGenerationRequest reserved
 * credits, wrote a row at stage "planning", and nothing ever moved it — the job sat
 * there forever and the credits were never committed or refunded, so every
 * generation silently took the user's credits and returned nothing.
 *
 * The contract now: every job ends either committed with assets, or refunded.
 */
export async function processGenerationJob(
  payload: JobPayload,
  attempt: number,
  opts: {fetchImpl?: FetchLike; timeoutMs?: number} = {}
): Promise<{ok: true; assetIds: string[]} | {ok: false; deadLetter: boolean; reason: string}> {
  const supabase = createServiceRoleSupabase();

  try {
    await advanceStage(payload.jobId, "building");

    // Fetch the reference photo the user uploaded, if the job has one.
    let referenceImage: {data: Uint8Array; mimeType: string} | undefined;
    if (payload.referenceAssetId) {
      const {data: fileRow} = await supabase
        .from("file_assets").select("storage_path,mime_type")
        .eq("id", payload.referenceAssetId).maybeSingle();
      if (fileRow) {
        const {data: blob} = await supabase.storage.from("uploads").download(fileRow.storage_path as string);
        if (blob) {
          referenceImage = {
            data: new Uint8Array(await blob.arrayBuffer()),
            mimeType: (fileRow.mime_type as string) ?? "image/jpeg",
          };
        }
      }
    }

    await advanceStage(payload.jobId, "generating_assets");

    const result = await runImageGeneration({
      prompt: buildImagePrompt({
        type: payload.type, brief: payload.brief,
        productName: payload.productName, style: payload.style,
      }),
      count: payload.count,
      referenceImage,
    }, {fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs});

    // Record what the provider actually did, so cost and latency analytics are
    // measured rather than estimated from a CREDIT_COST_CENTS guess.
    const {data: jobRow} = await supabase
      .from("ai_generation_requests").select("store_id,project_id").eq("id", payload.jobId).maybeSingle();

    await supabase.from("ai_provider_events").insert({
      store_id: jobRow?.store_id ?? null,
      generation_request_id: payload.jobId,
      provider: result.provider, model: result.model, status: "success",
      latency_ms: result.latencyMs,
      input_tokens: result.inputTokens ?? null,
      output_tokens: result.outputTokens ?? null,
    });

    await advanceStage(payload.jobId, "finalizing");

    const assetIds: string[] = [];
    for (const image of result.images) {
      const assetId = randomUUID();
      const extension = image.mimeType.split("/")[1] ?? "png";
      const storagePath = `${jobRow?.store_id}/${jobRow?.project_id}/${assetId}.${extension}`;

      const {error: uploadError} = await supabase.storage
        .from("generated-assets")
        .upload(storagePath, image.data, {contentType: image.mimeType, upsert: false});
      if (uploadError) throw new Error(`ASSET_UPLOAD_FAILED: ${uploadError.message}`);

      const {error: rowError} = await supabase.from("assets").insert({
        id: assetId, store_id: jobRow?.store_id, project_id: jobRow?.project_id,
        generation_request_id: payload.jobId, bucket: "generated-assets", storage_path: storagePath,
      });
      if (rowError) throw new Error(`ASSET_RECORD_FAILED: ${rowError.message}`);
      assetIds.push(assetId);
    }

    // Bill for what was actually delivered. If the provider returned fewer images
    // than requested, the difference returns to the user automatically.
    const actual = estimateCredits(payload.type, payload.quality, Math.max(1, assetIds.length));
    const reserved = estimateCredits(payload.type, payload.quality, payload.count);
    await completeGenerationRequest({
      jobId: payload.jobId, accountId: payload.accountId,
      actualAmount: Math.min(actual, reserved), assetIds,
    });

    return {ok: true, assetIds};
  } catch (e) {
    const reason = e instanceof ProviderError
      ? `${e.errorClass}: ${e.message}`
      : e instanceof Error ? e.message : String(e);

    await supabase.from("ai_provider_events").insert({
      provider: "gemini", status: "failure",
      error_class: e instanceof ProviderError ? e.errorClass : "permanent",
      generation_request_id: payload.jobId,
    }).then(() => undefined, () => undefined);

    const {deadLetter} = await failGenerationRequest({
      jobId: payload.jobId, accountId: payload.accountId, attempt, reason,
    });
    return {ok: false, deadLetter, reason};
  }
}

/**
 * Claims one queued job and runs it. Returns null when the queue is empty, so a
 * caller can poll without special-casing.
 */
export async function runNextJob(workerId: string, opts: {fetchImpl?: FetchLike} = {}) {
  const supabase = createServiceRoleSupabase();
  const {data: job, error} = await supabase.rpc("claim_next_job", {p_worker_id: workerId});
  if (error || !job || !(job as {id?: string}).id) return null;

  const claimed = job as {id: string; payload: JobPayload; attempts: number};
  await supabase.from("job_events").insert({job_id: claimed.id, event_type: "claimed", detail: {workerId}});

  const result = await processGenerationJob(claimed.payload, claimed.attempts, opts);

  await supabase.from("job_queue").update({
    status: result.ok ? "done" : result.deadLetter ? "dead_letter" : "queued",
    locked_by: null, locked_at: null,
    error_message: result.ok ? null : result.reason.slice(0, 500),
  }).eq("id", claimed.id);

  return {jobId: claimed.id, ...result};
}
