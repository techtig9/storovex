import {ProviderError, type ProviderId} from "./providers/types";
import {isRetryable, computeBackoffMs, nextCircuitState, canCall, type Circuit} from "./providerAdapter";

/**
 * Retry and circuit breaking for provider calls.
 *
 * The circuit is process-local, which on serverless protects one warm instance
 * rather than the fleet. It still stops a single instance from hammering a provider
 * that is already failing; fleet-wide breaking would need shared state and a round
 * trip on every call.
 */
const circuits = new Map<ProviderId, Circuit>();

export function circuitFor(provider: ProviderId): Circuit {
  return circuits.get(provider) ?? {state: "closed", failures: 0};
}
export function resetCircuits() { circuits.clear(); }

export type AttemptLog = {provider: ProviderId; attempt: number; ok: boolean; errorClass?: string};

export async function callWithResilience<T>(
  provider: ProviderId,
  fn: () => Promise<T>,
  opts: {maxAttempts?: number; sleep?: (ms: number) => Promise<void>; onAttempt?: (l: AttemptLog) => void} = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));

  if (!canCall(circuitFor(provider))) {
    throw new ProviderError(provider, "provider_outage", `${provider} circuit is open`);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      circuits.set(provider, nextCircuitState(circuitFor(provider), "success", Date.now()));
      opts.onAttempt?.({provider, attempt, ok: true});
      return result;
    } catch (e) {
      lastError = e;
      const errorClass = e instanceof ProviderError ? e.errorClass : "permanent";
      circuits.set(provider, nextCircuitState(circuitFor(provider), "failure", Date.now()));
      opts.onAttempt?.({provider, attempt, ok: false, errorClass});
      // Auth and validation failures fail identically next time; retrying them
      // only burns the rate limit.
      if (!isRetryable(errorClass) || attempt === maxAttempts) break;
      await sleep(computeBackoffMs(attempt));
    }
  }
  throw lastError;
}
