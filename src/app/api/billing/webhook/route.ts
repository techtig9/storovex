// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {actionForEvent, normalizeSubscriptionStatus, type PaddleEventType} from "@/core/billing/paddleWebhook";
import {verifyPaddleSignature} from "@/core/billing/paddleSignature";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";

/**
 * Paddle webhook receiver.
 *
 * Two things were wrong before. It used the cookie-based anon client, and a webhook
 * arrives with no session, so RLS rejected every write it attempted. And its
 * idempotency was a SELECT followed by an INSERT, which two concurrent redeliveries
 * both pass.
 *
 * Applying entitlements is Phase 3; this records the event exactly once and leaves a
 * clear seam for that. It does not yet change any subscription.
 */
export const POST = withApi(
  {methods: ["POST"], allowAnyContentType: true},
  async (req: NextRequest) => {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("paddle-signature");
    const secret = process.env.PADDLE_WEBHOOK_SECRET;

    if (!secret) return apiError(500, "NOT_CONFIGURED", "Billing webhooks are not configured.");
    if (!signatureHeader) return apiError(401, "SIGNATURE_MISSING", "Missing signature.");

    try {
      verifyPaddleSignature(signatureHeader, rawBody, secret);
    } catch {
      return apiError(401, "SIGNATURE_INVALID", "Signature verification failed.");
    }

    let body: {event_id?: string; event_type?: PaddleEventType; data?: {status?: string}};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return apiError(400, "MALFORMED", "Body is not valid JSON.");
    }

    const eventId = body.event_id;
    const eventType = body.event_type;
    if (!eventId || !eventType) return apiError(400, "MALFORMED", "Missing event id or type.");

    let action: string;
    try {
      action = actionForEvent(eventType);
    } catch {
      // Unknown event types are acknowledged, not retried forever. Paddle adds new
      // ones over time and a 4xx would make it redeliver indefinitely.
      return apiSuccess({status: "ignored", reason: "unsupported_event_type"});
    }

    if (body.data?.status) {
      try {
        normalizeSubscriptionStatus(body.data.status);
      } catch {
        return apiError(422, "UNKNOWN_STATUS", "Unrecognised subscription status.");
      }
    }

    // Insert-first idempotency: the primary key decides the winner, so concurrent
    // redeliveries cannot both proceed. A conflict means it is already recorded.
    const supabase = createServiceRoleSupabase();
    const {data: inserted, error} = await supabase
      .from("billing_webhook_events")
      .upsert({id: eventId, type: eventType, action, payload: body}, {onConflict: "id", ignoreDuplicates: true})
      .select("id");

    if (error) return apiError(500, "PERSIST_FAILED", "Could not record the event.", error);
    if (!inserted || inserted.length === 0) return apiSuccess({status: "already_processed"});

    // Phase 3 applies `action` to subscriptions, credit grants and access here.
    return apiSuccess({status: "recorded", action});
  }
);
