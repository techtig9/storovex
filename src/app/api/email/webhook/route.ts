// Reads request headers (rate limiting, auth cookies), so it can never be prerendered.
export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {createHmac, timingSafeEqual} from "crypto";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {shouldSuppress} from "@/core/email/emailEvents";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";

/**
 * Resend signs webhooks with Svix: an id, a timestamp, and a base64 HMAC-SHA256 over
 * `${id}.${timestamp}.${body}`.
 *
 * This route previously had no verification at all. Anyone could POST a fabricated
 * "bounced" event for any address, and two of those add it to email_suppressions —
 * which suppresses everything except password reset and verification. That is a
 * targeted denial of notifications against arbitrary users, from the open internet.
 */
function verifySvixSignature(headers: Headers, rawBody: string, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject anything outside a five minute window so a captured delivery cannot be
  // replayed later.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  const expectedBuf = Buffer.from(expected);

  // The header carries a space-separated list of versioned signatures.
  return signatureHeader.split(" ").some(part => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const actualBuf = Buffer.from(value);
    return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
  });
}

export const POST = withApi(
  {methods: ["POST"], allowAnyContentType: true},
  async (req: NextRequest) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return apiError(500, "NOT_CONFIGURED", "Email webhooks are not configured.");

    const rawBody = await req.text();
    if (!verifySvixSignature(req.headers, rawBody, secret)) {
      return apiError(401, "SIGNATURE_INVALID", "Signature verification failed.");
    }

    let body: {type?: string; data?: {to?: string[]; email?: string}};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return apiError(400, "MALFORMED", "Body is not valid JSON.");
    }

    const type = body.type;
    const email = body.data?.to?.[0] ?? body.data?.email;
    if (!type || !email) return apiError(400, "MALFORMED", "Missing event type or recipient.");

    const status = type.includes("bounced") ? "bounced"
      : type.includes("complained") ? "complained"
      : type.includes("delivered") ? "delivered"
      : "sent";

    const supabase = createServiceRoleSupabase();
    await supabase.from("email_events").insert({recipient: email, type: "webhook_update", status, attempt: 1});

    if (status === "bounced" || status === "complained") {
      const [{count: bounces}, {count: complaints}] = await Promise.all([
        supabase.from("email_events").select("id", {count: "exact", head: true})
          .eq("recipient", email).eq("status", "bounced"),
        supabase.from("email_events").select("id", {count: "exact", head: true})
          .eq("recipient", email).eq("status", "complained"),
      ]);
      if (shouldSuppress(bounces ?? 0, complaints ?? 0)) {
        await supabase.from("email_suppressions").upsert({email, reason: status}, {onConflict: "email"});
      }
    }

    return apiSuccess({status});
  }
);
