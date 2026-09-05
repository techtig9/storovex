import {NextResponse, type NextRequest} from "next/server";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {redact} from "./redaction";
import {log, requestIdFrom, durationMs} from "./observability";
import {INPUT_LIMITS} from "./limits";

export type ApiOptions = {
  methods: string[];
  /**
   * Postgres-backed fixed window. The previous in-memory limiter defaulted its state
   * to a freshly constructed Map on every call, so it allowed everything, and no
   * route called it anyway.
   */
  rateLimit?: {limit: number; windowSeconds: number; scope: string};
  /** Skip the application/json requirement (webhooks that post other content types). */
  allowAnyContentType?: boolean;
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cache-Control": "no-store",
};

export function withSecurityHeaders(res: NextResponse) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export function apiSuccess(data: unknown, status = 200) {
  return withSecurityHeaders(NextResponse.json({ok: true, data}, {status}));
}

/**
 * `message` is client-safe prose. Internal detail belongs in `logDetail`, which is
 * redacted and logged but never serialised into the response — the previous handlers
 * returned raw Postgres errors like "PROJECT_LIST_FAILED: column x does not exist".
 */
export function apiError(status: number, code: string, message: string, logDetail?: unknown) {
  if (logDetail !== undefined) {
    console.error(JSON.stringify({level: "error", code, status, detail: redact(logDetail)}));
  }
  return withSecurityHeaders(NextResponse.json({ok: false, error: {code, message}}, {status}));
}

export class ApiFailure extends Error {
  constructor(readonly status: number, readonly code: string, readonly publicMessage: string) {
    super(code);
  }
}

/** Body parsing that returns null instead of throwing an unhandled rejection. */
export async function readJson(req: NextRequest): Promise<unknown> {
  const raw = await req.text();
  if (raw.length > INPUT_LIMITS.jsonBytes) throw new ApiFailure(413, "REQUEST_TOO_LARGE", "Request body is too large.");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiFailure(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
}

function clientIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  // Left-most entry is the original client on Vercel and most proxies.
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  try {
    const supabase = createServiceRoleSupabase();
    const {data, error} = await supabase.rpc("check_api_rate_limit", {
      p_bucket_key: key, p_limit: limit, p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data as {allowed: boolean; limit: number; remaining: number; retry_after_seconds: number};
  } catch (e) {
    // Fail closed on a limiter outage for auth routes would lock everyone out, and
    // fail open would remove the protection. We fail open but record it loudly:
    // the limiter is a mitigation, not the only control on these routes.
    console.error(JSON.stringify({level: "error", code: "RATE_LIMIT_UNAVAILABLE", detail: redact(String(e))}));
    return null;
  }
}

/**
 * One wrapper carrying every cross-cutting concern the routes were missing: method
 * guard, content-type guard, body size cap, rate limiting, security headers, and
 * error handling that never leaks internals.
 */
export function withApi(
  options: ApiOptions,
  handler: (req: NextRequest, ctx: {params?: Record<string, string>}) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: {params?: Record<string, string>} = {}) => {
    // Every line this request logs carries this id, and it goes back in a header so
    // whoever reports a problem can quote it.
    const requestId = requestIdFrom(req.headers);
    const startedAt = performance.now();
    const route = new URL(req.url).pathname;

    const finish = (res: NextResponse) => {
      res.headers.set("X-Request-Id", requestId);
      log(res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info",
          requestId, "request",
          {method: req.method, route, status: res.status, durationMs: durationMs(startedAt)});
      return res;
    };

    try {
      if (!options.methods.includes(req.method)) {
        return finish(apiError(405, "METHOD_NOT_ALLOWED", "That method isn't allowed here."));
      }

      if (!options.allowAnyContentType && ["POST", "PUT", "PATCH"].includes(req.method)) {
        const ct = (req.headers.get("content-type") ?? "").toLowerCase();
        if (!ct.includes("application/json")) {
          return finish(apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json."));
        }
      }

      if (options.rateLimit) {
        const {limit, windowSeconds, scope} = options.rateLimit;
        const result = await checkRateLimit(`${scope}:${clientIp(req)}`, limit, windowSeconds);
        if (result && !result.allowed) {
          const res = apiError(429, "RATE_LIMITED", "Too many requests. Try again shortly.");
          res.headers.set("Retry-After", String(result.retry_after_seconds));
          res.headers.set("X-RateLimit-Limit", String(result.limit));
          res.headers.set("X-RateLimit-Remaining", "0");
          return finish(res);
        }
      }

      return finish(await handler(req, ctx));
    } catch (e) {
      if (e instanceof ApiFailure) return finish(apiError(e.status, e.code, e.publicMessage));

      const message = e instanceof Error ? e.message : String(e);
      // Authorization failures thrown from deeper layers map to 401/403 without the
      // caller having to catch them individually.
      if (message === "UNAUTHENTICATED") {
        return finish(apiError(401, "UNAUTHENTICATED", "You need to be signed in."));
      }
      if (message === "FORBIDDEN" || message === "STORE_ACCESS_DENIED" || message === "RESOURCE_ACCESS_DENIED") {
        return finish(apiError(403, "FORBIDDEN", "You don't have access to that."));
      }
      if (message === "PLATFORM_ADMIN_REQUIRED") {
        return finish(apiError(403, "FORBIDDEN", "You don't have access to that."));
      }
      // The request id is logged with the failure and returned in the header, so a
      // report of "it broke" can be matched to the exact line that recorded it.
      log("error", requestId, "unhandled", {route, message});
      return finish(apiError(500, "INTERNAL_ERROR", "Something went wrong on our end.", e));
    }
  };
}
