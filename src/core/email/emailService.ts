import {createServiceRoleSupabase} from "@/core/supabase/server";
import {assertTemplateVarsComplete, mustBypassSuppression, type EmailEventType} from "./emailCatalog";
import {renderEmail} from "./templates";
import {shouldRetrySend, computeRetryDelayMs, MAX_EMAIL_RETRIES} from "./emailEvents";
import {requireIntegration} from "@/core/config/integrations";
import type {FetchLike} from "@/core/ai/providers/types";

/**
 * Transactional email.
 *
 * The previous implementation would have failed on every single send: the Resend
 * payload carried no `html`, `text` or `react` field (it set `react: undefined`
 * explicitly), the subject was the raw event key such as "password_reset", and the
 * template variables were spread into the top level of the request body. There were
 * also no templates at all, no send idempotency, and the retry policy defined in
 * emailEvents.ts had no caller.
 */

export type SendResult = {
  sent: boolean;
  duplicate?: boolean;
  suppressed?: boolean;
  providerMessageId?: string;
};

function fromAddress() {
  return process.env.RESEND_FROM_EMAIL ?? "Storovex <notifications@storovex.com>";
}

export async function sendTransactionalEmail(
  input: {
    to: string;
    type: EmailEventType;
    vars: Record<string, unknown>;
    storeId?: string;
    /**
     * Stable key for this logical send. Two attempts to send the same welcome or
     * the same generation-complete notice collapse into one delivery.
     */
    idempotencyKey?: string;
  },
  opts: {fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<void>} = {}
): Promise<SendResult> {
  assertTemplateVarsComplete(input.type, input.vars);
  requireIntegration("resend");

  const supabase = createServiceRoleSupabase();
  const idempotencyKey = input.idempotencyKey ?? `${input.type}:${input.to}:${new Date().toISOString().slice(0, 10)}`;

  // Claim the send before calling the provider. The unique index on
  // email_events.idempotency_key is what makes concurrent callers collapse into one.
  const {data: claim, error: claimError} = await supabase
    .from("email_events")
    .upsert({
      recipient: input.to, type: input.type, status: "queued", attempt: 1,
      store_id: input.storeId ?? null, idempotency_key: idempotencyKey,
    }, {onConflict: "idempotency_key", ignoreDuplicates: true})
    .select("id");

  if (claimError) throw new Error("EMAIL_CLAIM_FAILED");
  if (!claim || claim.length === 0) return {sent: false, duplicate: true};
  const eventId = claim[0]!.id as string;

  // Password reset and verification bypass suppression: locking someone out of
  // account recovery because a marketing send bounced would be worse than the bounce.
  if (!mustBypassSuppression(input.type)) {
    const {data: suppressed} = await supabase
      .from("email_suppressions").select("email").eq("email", input.to).maybeSingle();
    if (suppressed) {
      await supabase.from("email_events").update({status: "failed"}).eq("id", eventId);
      return {sent: false, suppressed: true};
    }
  }

  const {subject, html, text} = renderEmail(input.type, input.vars);
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));

  let lastStatus = 0;
  let providerMessageId: string | undefined;

  for (let attempt = 1; attempt <= MAX_EMAIL_RETRIES; attempt++) {
    let ok = false;
    try {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          // Resend's own idempotency, so a retry after a timeout does not double-send.
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [input.to],
          subject,
          html,
          text,
          tags: [{name: "event_type", value: input.type}],
        }),
      });
      lastStatus = res.status;
      ok = res.ok;
      if (ok) {
        const body = await res.json().catch(() => null) as {id?: string} | null;
        providerMessageId = body?.id;
      }
    } catch {
      ok = false;
    }

    if (ok) {
      await supabase.from("email_events")
        .update({status: "sent", attempt, provider_message_id: providerMessageId ?? null})
        .eq("id", eventId);
      return {sent: true, providerMessageId};
    }

    // 4xx other than 429 will fail identically on retry; only back off for the
    // failures that might actually clear.
    const worthRetrying = lastStatus === 0 || lastStatus === 429 || lastStatus >= 500;
    if (!worthRetrying || !shouldRetrySend(attempt, "failed")) break;
    await sleep(computeRetryDelayMs(attempt));
  }

  await supabase.from("email_events")
    .update({status: "failed", attempt: MAX_EMAIL_RETRIES}).eq("id", eventId);
  throw new Error(`EMAIL_SEND_FAILED: ${lastStatus}`);
}

/**
 * Fire-and-forget wrapper. A failed notification must never fail the operation that
 * triggered it — a user's generation succeeding does not depend on the email landing.
 */
export async function sendEmailSafely(
  input: Parameters<typeof sendTransactionalEmail>[0],
  opts: Parameters<typeof sendTransactionalEmail>[1] = {}
): Promise<SendResult | null> {
  try {
    return await sendTransactionalEmail(input, opts);
  } catch (e) {
    console.error(JSON.stringify({
      level: "error", code: "EMAIL_SEND_FAILED",
      type: input.type, recipient: "[REDACTED]",
      detail: e instanceof Error ? e.message : String(e),
    }));
    return null;
  }
}
