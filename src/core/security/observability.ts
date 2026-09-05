import {randomUUID} from "crypto";

/**
 * Request-scoped logging.
 *
 * Every log line carries the same request id, so a failure reported by a user can be
 * traced through the handler that produced it. Without one, a production log is a
 * stream of unrelated lines and "it broke at about three o'clock" is all anyone has.
 *
 * The id is also returned to the caller in `X-Request-Id`, which is what makes it
 * useful: the person reporting the problem can quote it.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export function newRequestId(): string {
  return randomUUID();
}

/**
 * An inbound `X-Request-Id` is honoured so a trace can span a proxy or a client
 * retry — but only when it looks like an id. Echoing arbitrary client text into
 * logs invites forged or injected entries.
 */
export function requestIdFrom(headers: Headers): string {
  const supplied = headers.get("x-request-id");
  if (supplied && /^[A-Za-z0-9_-]{8,64}$/.test(supplied)) return supplied;
  return newRequestId();
}

const REDACT = /^(authorization|cookie|set-cookie|x-api-key|apikey)$/i;

export function log(
  level: LogLevel,
  requestId: string,
  event: string,
  fields: Record<string, unknown> = {}
) {
  // One JSON object per line, which is what log aggregators expect and what makes
  // these greppable by request id.
  const line = JSON.stringify({
    level, event, requestId, ts: new Date().toISOString(),
    ...redactFields(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Drops anything that looks like a credential before it reaches a log. */
export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT.test(key)) { out[key] = "[redacted]"; continue; }
    if (typeof value === "string" && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…[truncated]`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** How long a handler took, rounded — for spotting the slow one, not for billing. */
export function durationMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
