import {providerFetch} from "./http";
import {ProviderError, type ChatRequest, type ChatResult, type FetchLike, type ProviderId} from "./types";
import {requireIntegration} from "@/core/config/integrations";

/**
 * Chat adapters for the three text providers. Cerebras and OpenRouter both speak the
 * OpenAI chat-completions shape, so they share one implementation; Anthropic has its
 * own message format and is handled separately.
 */

type OpenAiShapedResponse = {
  choices?: {message?: {content?: string}}[];
  usage?: {prompt_tokens?: number; completion_tokens?: number};
};

async function openAiShapedChat(
  provider: Extract<ProviderId, "cerebras" | "openrouter">,
  url: string,
  apiKey: string,
  model: string,
  req: ChatRequest,
  opts: {fetchImpl?: FetchLike; timeoutMs?: number}
): Promise<ChatResult> {
  const startedAt = Date.now();
  const messages = [
    ...(req.system ? [{role: "system", content: req.system}] : []),
    {role: "user", content: req.prompt},
  ];

  const res = await providerFetch(provider, url, {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({
      model,
      messages,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
    }),
  }, {fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs, signal: req.signal});

  const body = await res.json() as OpenAiShapedResponse;
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text) throw new ProviderError(provider, "validation", `${provider} returned empty content`, res.status);

  return {
    provider, model, text,
    latencyMs: Date.now() - startedAt,
    inputTokens: body.usage?.prompt_tokens,
    outputTokens: body.usage?.completion_tokens,
  };
}

export function cerebrasModel() { return process.env.CEREBRAS_MODEL ?? "llama-3.3-70b"; }
export function openRouterModel() { return process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct"; }
export function anthropicModel() { return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5"; }

export function cerebrasChat(req: ChatRequest, opts: {fetchImpl?: FetchLike; timeoutMs?: number} = {}) {
  requireIntegration("cerebras");
  return openAiShapedChat("cerebras", "https://api.cerebras.ai/v1/chat/completions",
    process.env.CEREBRAS_API_KEY!, cerebrasModel(), req, opts);
}

export function openRouterChat(req: ChatRequest, opts: {fetchImpl?: FetchLike; timeoutMs?: number} = {}) {
  requireIntegration("openrouter");
  return openAiShapedChat("openrouter", "https://openrouter.ai/api/v1/chat/completions",
    process.env.OPENROUTER_API_KEY!, openRouterModel(), req, opts);
}

/** Anthropic messages API — used for the complex-reasoning route only. */
export async function anthropicChat(
  req: ChatRequest,
  opts: {fetchImpl?: FetchLike; timeoutMs?: number} = {}
): Promise<ChatResult> {
  requireIntegration("anthropic");
  const model = anthropicModel();
  const startedAt = Date.now();

  const res = await providerFetch("anthropic", "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 2048,
      ...(req.system ? {system: req.system} : {}),
      messages: [{role: "user", content: req.prompt}],
      ...(req.temperature !== undefined ? {temperature: req.temperature} : {}),
    }),
  }, {fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs, signal: req.signal});

  const body = await res.json() as {
    content?: {type: string; text?: string}[];
    usage?: {input_tokens?: number; output_tokens?: number};
  };
  const text = (body.content ?? []).filter(p => p.type === "text").map(p => p.text ?? "").join("");
  if (!text) throw new ProviderError("anthropic", "validation", "Anthropic returned empty content", res.status);

  return {
    provider: "anthropic", model, text,
    latencyMs: Date.now() - startedAt,
    inputTokens: body.usage?.input_tokens,
    outputTokens: body.usage?.output_tokens,
  };
}
