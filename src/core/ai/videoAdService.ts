import {createServiceRoleSupabase} from "@/core/supabase/server";
import {spendCredits, commitCredits, refundCredits, InsufficientCreditsError} from "./creditService";
import {callWithResilience} from "./resilience";
import type {FetchLike} from "./providers/types";

/**
 * AI video ads for products.
 *
 * Driven off product_video_ads.status rather than a separate queue table: the status
 * column already exists and a row is its own work item, so there is one source of
 * truth for whether an ad is pending, generating, ready or failed.
 *
 * The contract mirrors the credit rule everywhere else: every request ends either
 * committed with a video, or refunded.
 */

export type VideoAdStatus = "pending" | "generating" | "ready" | "failed";

export type VideoAdRequest = {
  storeId: string; productId: string;
  hasMusic: boolean; hasVoiceover: boolean;
};

export async function requestVideoAd(input: VideoAdRequest) {
  const supabase = createServiceRoleSupabase();

  // Refuse a duplicate before charging. Two clicks on a slow button should not
  // cost twice.
  const {data: existing} = await supabase
    .from("product_video_ads").select("id,status")
    .eq("product_id", input.productId)
    .in("status", ["pending", "generating"])
    .maybeSingle();
  if (existing) return {id: existing.id as string, status: existing.status as VideoAdStatus, duplicate: true};

  const {usageId, remaining} = await spendCredits({storeId: input.storeId, feature: "video_ad"});

  const {data, error} = await supabase.from("product_video_ads").insert({
    product_id: input.productId, store_id: input.storeId,
    has_music: input.hasMusic, has_voiceover: input.hasVoiceover,
    status: "pending",
  }).select("id,status").single();

  if (error) {
    // The charge landed but the work item did not. Give the credits back rather
    // than leaving the merchant paying for an ad that will never be made.
    await refundCredits(usageId, "video ad row insert failed").catch(() => undefined);
    throw new Error("VIDEO_AD_CREATE_FAILED");
  }

  // The usage id travels with the row so the worker can settle it either way.
  await supabase.from("credit_usage").update({feature: `video_ad:${data.id}`}).eq("id", usageId);

  return {id: data.id as string, status: data.status as VideoAdStatus, usageId, remaining, duplicate: false};
}

/**
 * Generates one pending ad.
 *
 * The provider call is injectable so the whole lifecycle — claim, generate, store,
 * settle credits — can be tested without a network or a real video model.
 */
export async function processVideoAd(
  adId: string,
  generate: (req: {productTitle: string; hasMusic: boolean; hasVoiceover: boolean}) => Promise<{videoUrl: string}>,
  opts: {fetchImpl?: FetchLike} = {}
): Promise<{ok: true; videoUrl: string} | {ok: false; reason: string}> {
  const supabase = createServiceRoleSupabase();

  // Claim it conditionally, so two workers cannot generate the same ad twice.
  const {data: claimed} = await supabase
    .from("product_video_ads").update({status: "generating"})
    .eq("id", adId).eq("status", "pending")
    .select("id,product_id,store_id,has_music,has_voiceover");

  if (!claimed || claimed.length === 0) return {ok: false, reason: "ALREADY_CLAIMED"};
  const ad = claimed[0]!;

  const {data: usage} = await supabase
    .from("credit_usage").select("id").eq("feature", `video_ad:${adId}`).maybeSingle();
  const usageId = usage?.id as string | undefined;

  try {
    const {data: product} = await supabase
      .from("products").select("title").eq("id", ad.product_id).maybeSingle();

    const result = await callWithResilience("gemini", () => generate({
      productTitle: (product?.title as string) ?? "this product",
      hasMusic: ad.has_music as boolean,
      hasVoiceover: ad.has_voiceover as boolean,
    }));

    if (!result.videoUrl) throw new Error("PROVIDER_RETURNED_NO_VIDEO");

    await supabase.from("product_video_ads")
      .update({status: "ready", video_url: result.videoUrl}).eq("id", adId);
    if (usageId) await commitCredits(usageId).catch(() => undefined);

    return {ok: true, videoUrl: result.videoUrl};
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await supabase.from("product_video_ads").update({status: "failed"}).eq("id", adId);
    // The merchant paid for a video they did not get.
    if (usageId) await refundCredits(usageId, reason).catch(() => undefined);
    return {ok: false, reason};
  }
}

/** Builds the brief sent to the video model. Separated so it reads as copy, not transport. */
export function buildVideoAdPrompt(input: {
  productTitle: string; description?: string; hasMusic: boolean; hasVoiceover: boolean;
}) {
  return [
    `A short vertical product advertisement for "${input.productTitle}".`,
    input.description ? `Product details: ${input.description}` : "",
    "Show the product clearly and in use. Keep cuts quick and the framing tight.",
    input.hasVoiceover ? "Include a concise spoken voiceover naming the product and one benefit." : "No voiceover.",
    input.hasMusic ? "Include upbeat background music." : "No music.",
    "Do not invent claims about the product, and do not add text overlays or logos.",
  ].filter(Boolean).join(" ");
}
