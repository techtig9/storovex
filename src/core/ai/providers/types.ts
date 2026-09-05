/**
 * Provider-agnostic contracts. Everything the pipeline needs from a provider is
 * expressed here so adapters stay swappable and, importantly, testable without a
 * network: every adapter takes an injectable `fetchImpl`.
 */

export type ProviderId = "gemini" | "cerebras" | "openrouter" | "anthropic";

export type GeneratedImage = {
  /** Raw bytes. The pipeline uploads these; adapters never touch storage. */
  data: Uint8Array;
  mimeType: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  count: number;
  aspectRatio?: string;
  referenceImage?: {data: Uint8Array; mimeType: string};
  signal?: AbortSignal;
};

export type ImageGenerationResult = {
  provider: ProviderId;
  model: string;
  images: GeneratedImage[];
  latencyMs: number;
  /** Absent when a provider does not report usage; never guessed. */
  inputTokens?: number;
  outputTokens?: number;
};

export type ChatRequest = {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type ChatResult = {
  provider: ProviderId;
  model: string;
  text: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

/**
 * A provider failure classified into something the retry policy can act on.
 * `status` is kept so provider events record what actually came back.
 */
export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly errorClass: "rate_limit" | "timeout" | "auth" | "validation" | "provider_outage" | "permanent",
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
