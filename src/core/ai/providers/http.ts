import {ProviderError, type FetchLike, type ProviderId} from "./types";
import {classifyProviderError} from "../providerAdapter";

export const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * One place where every provider call actually leaves the process, so timeout,
 * abort and error classification behave identically no matter which provider is
 * being called.
 *
 * A request that hangs is the failure mode that hurts most here: it holds a worker
 * slot and the user's credits stay reserved. Every call gets a deadline.
 */
export async function providerFetch(
  provider: ProviderId,
  url: string,
  init: RequestInit,
  opts: {fetchImpl?: FetchLike; timeoutMs?: number; signal?: AbortSignal} = {}
): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Honour a caller-supplied cancellation as well as our own deadline.
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetchImpl(url, {...init, signal: controller.signal});
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(
        provider,
        classifyProviderError(res.status),
        // Truncated: provider errors can echo the whole prompt back.
        `${provider} responded ${res.status}: ${body.slice(0, 500)}`,
        res.status
      );
    }
    return res;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const isAbort = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    if (isAbort) {
      throw new ProviderError(provider, "timeout", `${provider} timed out after ${timeoutMs}ms`);
    }
    // A network-level failure (DNS, refused, reset) is an outage, not a bug in the
    // request, so the retry policy should treat it as recoverable.
    throw new ProviderError(provider, "provider_outage",
      `${provider} request failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
