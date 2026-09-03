import {providerFetch} from "./http";
import {ProviderError, type FetchLike, type ImageGenerationRequest, type ImageGenerationResult} from "./types";
import {requireIntegration} from "@/core/config/integrations";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Overridable so a model change is a config edit, not a deploy. */
export function geminiImageModel() {
  return process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Gemini image generation.
 *
 * Storovex generates product photography from a reference image plus a prompt, so
 * the reference is sent as an inline part alongside the text. Gemini returns images
 * as base64 inlineData parts; we decode to bytes here and let the pipeline decide
 * where they are stored.
 */
export async function generateImages(
  req: ImageGenerationRequest,
  opts: {fetchImpl?: FetchLike; timeoutMs?: number} = {}
): Promise<ImageGenerationResult> {
  requireIntegration("gemini");
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = geminiImageModel();
  const startedAt = Date.now();

  const parts: unknown[] = [{text: req.prompt}];
  if (req.referenceImage) {
    parts.push({
      inlineData: {
        mimeType: req.referenceImage.mimeType,
        data: toBase64(req.referenceImage.data),
      },
    });
  }

  const res = await providerFetch(
    "gemini",
    `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      // Key travels in a header, never the URL: query strings end up in access logs
      // and proxy caches.
      headers: {"Content-Type": "application/json", "x-goog-api-key": apiKey},
      body: JSON.stringify({
        contents: [{role: "user", parts}],
        generationConfig: {
          candidateCount: Math.min(Math.max(req.count, 1), 8),
          ...(req.aspectRatio ? {imageConfig: {aspectRatio: req.aspectRatio}} : {}),
        },
      }),
    },
    {fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs, signal: req.signal}
  );

  const body = await res.json() as {
    candidates?: {content?: {parts?: {inlineData?: {mimeType: string; data: string}}[]}}[];
    usageMetadata?: {promptTokenCount?: number; candidatesTokenCount?: number};
  };

  const images = (body.candidates ?? [])
    .flatMap(c => c.content?.parts ?? [])
    .filter(p => p.inlineData?.data)
    .map(p => ({
      data: new Uint8Array(Buffer.from(p.inlineData!.data, "base64")),
      mimeType: p.inlineData!.mimeType || "image/png",
    }));

  // A 200 with no image is a real failure. Returning success here would commit the
  // user's credits for nothing, which is exactly what the old pipeline did.
  if (images.length === 0) {
    throw new ProviderError("gemini", "validation", "Gemini returned no image data", res.status);
  }

  return {
    provider: "gemini",
    model,
    images,
    latencyMs: Date.now() - startedAt,
    inputTokens: body.usageMetadata?.promptTokenCount,
    outputTokens: body.usageMetadata?.candidatesTokenCount,
  };
}
