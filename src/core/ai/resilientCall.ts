import {ProviderError, type ProviderId} from "./providers/types";
import {isRetryable, computeBackoffMs, nextCircuitState, canCall, type Circuit} from "./providerAdapter";

/**
 * Wraps a provider call with the retry and circuit-breaker policy that
 * providerAdapter.ts described but nothing ever used.
 *
 * The circuit is process-local. That is deliberate and worth being honest about: on
 * serverless it protects one warm instance, not the fleet. It still stops a single
 * instance from hammering a provider that is already failing. Fleet-wide breaking
 * would need shared state and is not worth the round trip on every call.
 */
const circuits = new Map<ProviderId, Circuit>();

export function circuitFor(provider: ProviderId): Circuit {
  return circuits.get(provider) ?? {state: "closed", failures: 0};
}

export function resetCircuits() {
  circuits.clear();
}

function recordOutcome(provider: ProviderId, outcome: "success" | "failure") {
  circuits.set(provider, nextCircuitState(circuitFor(provider), outcome, Date.now()));
}

export type AttemptLog = {
  provider: ProviderId;
  attempt: number;
  ok: boolean;
  errorClass?: string;
  latencyMs: number;
};

export async function callWithResilience<T>(
  provider: ProviderId,
  fn: () => Promise<T>,
  opts: {maxAttempts?: number; sleep?: (ms: number) => Promise<void>; onAttempt?: (log: AttemptLog) => void} = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));

  if (!canCall(circuitFor(provider))) {
    throw new ProviderError(provider, "provider_outage", `${provider} circuit is open`);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await fn();
      recordOutcome(provider, "success");
      opts.onAttempt?.({provider, attempt, ok: true, latencyMs: Date.now() - startedAt});
      return result;
    } catch (e) {
      lastError = e;
      const errorClass = e instanceof ProviderError ? e.errorClass : "permanent";
      recordOutcome(provider, "failure");
      opts.onAttempt?.({provider, attempt, ok: false, errorClass, latencyMs: Date.now() - startedAt});

      // An auth or validation failure will fail identically next time. Retrying it
      // just burns the user's time and our rate limit.
      if (!isRetryable(errorClass) || attempt === maxAttempts) break;
      await sleep(computeBackoffMs(attempt));
    }
  }
  throw lastError;
}
