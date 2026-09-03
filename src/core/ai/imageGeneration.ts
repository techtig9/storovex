import {generateImages} from "./providers/gemini";
import {callWithResilience, type AttemptLog} from "./resilientCall";
import type {FetchLike, ImageGenerationRequest, ImageGenerationResult} from "./providers/types";

/**
 * The generation entry point the pipeline calls. Routing is intentionally simple:
 * image work goes to Gemini and has no fallback, because a second provider would
 * produce visibly different output for the same product. A failure here refunds
 * rather than silently substituting a different look.
 */
export async function runImageGeneration(
  req: ImageGenerationRequest,
  opts: {fetchImpl?: FetchLike; timeoutMs?: number; onAttempt?: (log: AttemptLog) => void} = {}
): Promise<ImageGenerationResult> {
  return callWithResilience(
    "gemini",
    () => generateImages(req, {fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs}),
    {onAttempt: opts.onAttempt}
  );
}

/**
 * Builds the prompt sent to the provider. Kept separate from the HTTP adapter so it
 * can be reviewed and tested as product copy rather than as transport code.
 */
export function buildImagePrompt(input: {
  type: string;
  brief?: string;
  productName?: string;
  style?: string;
}) {
  const shot: Record<string, string> = {
    product_hero: "a clean studio hero shot on a seamless background, centred, even soft lighting",
    product_lifestyle: "a lifestyle scene showing the product in natural use, shallow depth of field",
    campaign: "a seasonal campaign image with room for overlaid marketing copy",
    collection: "a flat-lay grid showing the product alongside complementary items",
    banner: "a wide storefront banner composition with clear negative space on one side",
    social_creative: "a square social post composition, bold and thumb-stopping at small size",
  };
  const parts = [
    `Product photography: ${shot[input.type] ?? shot.product_hero}.`,
    input.productName ? `Product: ${input.productName}.` : "",
    input.style ? `Visual style: ${input.style}.` : "",
    input.brief ? `Art direction: ${input.brief}` : "",
    "Preserve the product's true shape, colour, materials and proportions exactly as shown in the reference image.",
    "Do not add text, watermarks or logos.",
  ];
  return parts.filter(Boolean).join(" ");
}
