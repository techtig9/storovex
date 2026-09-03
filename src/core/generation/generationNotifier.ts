import {createServiceRoleSupabase} from "@/core/supabase/server";
import {sendEmailSafely} from "@/core/email/emailService";
import {siteUrl} from "@/core/config/site";

/**
 * Announces a finished generation in the notification centre and by email.
 *
 * Everything here is best-effort by design: a notification that fails must never
 * fail the generation, and must never cause a refund to be skipped.
 */
export async function notifyGenerationOutcome(input: {
  jobId: string;
  storeId?: string;
  projectId?: string;
  outcome: "completed" | "failed";
  assetCount?: number;
  reason?: string;
}) {
  if (!input.storeId) return;

  try {
    const supabase = createServiceRoleSupabase();

    const [{data: project}, {data: job}] = await Promise.all([
      input.projectId
        ? supabase.from("projects").select("name").eq("id", input.projectId).maybeSingle()
        : Promise.resolve({data: null}),
      supabase.from("ai_generation_requests").select("user_id").eq("id", input.jobId).maybeSingle(),
    ]);

    const projectName = (project?.name as string) ?? "your project";
    const projectUrl = input.projectId ? `${siteUrl()}/projects/${input.projectId}` : `${siteUrl()}/dashboard`;

    await supabase.rpc("notify_store", {
      p_store_id: input.storeId,
      p_type: input.outcome === "completed" ? "generation_completed" : "generation_failed",
      p_title: input.outcome === "completed"
        ? `${input.assetCount ?? 0} new image${input.assetCount === 1 ? "" : "s"} ready`
        : "A generation didn't finish",
      p_body: input.outcome === "completed"
        ? `${projectName} — ready to download.`
        : `${projectName} — your credits have been refunded.`,
      p_user_id: job?.user_id ?? null,
    });

    if (!job?.user_id) return;
    const {data: user} = await supabase.auth.admin.getUserById(job.user_id as string);
    const email = user?.user?.email;
    if (!email) return;

    if (input.outcome === "completed") {
      await sendEmailSafely({
        to: email, type: "generation_completed", storeId: input.storeId,
        // Keyed on the job, so a worker retry cannot send this twice.
        idempotencyKey: `generation_completed:${input.jobId}`,
        vars: {projectName, assetCount: input.assetCount ?? 0, projectUrl},
      });
    } else {
      await sendEmailSafely({
        to: email, type: "generation_failed", storeId: input.storeId,
        idempotencyKey: `generation_failed:${input.jobId}`,
        // The user gets a plain reason, never the provider's raw error, which can
        // echo the prompt back.
        vars: {projectName, reason: friendlyReason(input.reason), projectUrl},
      });
    }
  } catch (e) {
    console.error(JSON.stringify({
      level: "error", code: "GENERATION_NOTIFY_FAILED",
      jobId: input.jobId, detail: e instanceof Error ? e.message : String(e),
    }));
  }
}

function friendlyReason(raw?: string) {
  if (!raw) return "An unexpected error occurred.";
  if (raw.startsWith("timeout")) return "The image service took too long to respond.";
  if (raw.startsWith("rate_limit")) return "The image service was busy. Please try again shortly.";
  if (raw.startsWith("provider_outage")) return "The image service was temporarily unavailable.";
  if (raw.startsWith("auth")) return "There's a configuration problem on our side.";
  if (raw.includes("no image data")) return "The image service returned no usable images.";
  return "The generation could not be completed.";
}
