/**
 * Browser-side API calls.
 *
 * Every route answers with {ok:true,data} or {ok:false,error:{code,message}}, and
 * that `message` is written to be shown to a person. Unwrapping it in one place
 * means no screen has to invent its own wording for a failure the server already
 * described, and none of them accidentally render a raw error object.
 */

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const NETWORK_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

export async function api<T>(
  path: string,
  init: {method?: string; body?: unknown; signal?: AbortSignal} = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : {"Content-Type": "application/json"},
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
  });
  } catch (e) {
    // An aborted request is the caller navigating away or typing again, not a
    // failure worth showing anyone.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK", NETWORK_MESSAGE);
  }

  const body = await res.json().catch(() => null) as
    | {ok: true; data: T}
    | {ok: false; error: {code: string; message: string}}
    | null;

  if (!res.ok || !body || body.ok === false) {
    const error = body && body.ok === false ? body.error : null;
    throw new ApiError(
      res.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? "Something went wrong. Please try again."
    );
  }
  return body.data;
}

/** Turns anything thrown into prose safe to put on screen. */
export function messageFor(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong. Please try again.";
}
