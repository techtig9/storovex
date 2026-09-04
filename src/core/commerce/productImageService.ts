import {createServerSupabase} from "@/core/supabase/server";
import {isSafeImageUrl} from "@/core/security/url";

/**
 * Product images.
 *
 * Replaces the previous upload path, which wrote to a `file_assets` table that does
 * not exist in this project — it was left over from a different codebase, so every
 * call to it failed. The real table is product_images (id, product_id, store_id,
 * url, position), and images are referenced by URL.
 *
 * Writes go through the caller's client so the images_member_all policy scopes them,
 * and reads inherit visibility from the parent product.
 */

export class ImageError extends Error {
  constructor(readonly code: string, readonly detail?: unknown) { super(code); }
}

export async function listImages(storeId: string, productId: string) {
  const supabase = createServerSupabase();
  const {data, error} = await supabase.from("product_images")
    .select("id,url,position")
    .eq("product_id", productId).eq("store_id", storeId)
    .order("position", {ascending: true});
  if (error) throw new ImageError("IMAGE_LIST_FAILED", error.message);
  return (data ?? []).map(i => ({
    id: i.id as string, url: i.url as string, position: i.position as number,
  }));
}

export async function addImage(input: {storeId: string; productId: string; url: string}) {
  // The URL ends up in an <img src> on a public storefront, so it is validated the
  // same way as any other user-supplied destination: https only, no private hosts,
  // no javascript: or data: scheme.
  if (!isSafeImageUrl(input.url)) throw new ImageError("IMAGE_URL_INVALID");

  const supabase = createServerSupabase();
  const existing = await listImages(input.storeId, input.productId);
  if (existing.length >= 12) throw new ImageError("IMAGE_LIMIT_REACHED");

  // Append. Positions are dense from 0 so the storefront can order by them without
  // worrying about gaps, and the first image is the one used as the thumbnail.
  const nextPosition = existing.length === 0
    ? 0
    : Math.max(...existing.map(i => i.position)) + 1;

  const {data, error} = await supabase.from("product_images").insert({
    product_id: input.productId, store_id: input.storeId,
    url: input.url, position: nextPosition,
  }).select("id,url,position").single();
  if (error) throw new ImageError("IMAGE_ADD_FAILED", error.message);
  return {id: data.id as string, url: data.url as string, position: data.position as number};
}

export async function removeImage(input: {storeId: string; productId: string; imageId: string}) {
  const supabase = createServerSupabase();
  const {error} = await supabase.from("product_images")
    .delete().eq("id", input.imageId)
    .eq("product_id", input.productId).eq("store_id", input.storeId);
  if (error) throw new ImageError("IMAGE_REMOVE_FAILED", error.message);

  // Close the gap, so position stays a dense sequence and "first image" keeps
  // meaning the first one the merchant sees.
  const remaining = await listImages(input.storeId, input.productId);
  await Promise.all(remaining.map((image, index) =>
    image.position === index
      ? Promise.resolve()
      : supabase.from("product_images").update({position: index}).eq("id", image.id)
  ));
  return {removed: true};
}

/** Moves one image up or down, which is how a merchant chooses the thumbnail. */
export async function reorderImage(input: {
  storeId: string; productId: string; imageId: string; direction: "up" | "down";
}) {
  const images = await listImages(input.storeId, input.productId);
  const index = images.findIndex(i => i.id === input.imageId);
  if (index === -1) throw new ImageError("IMAGE_NOT_FOUND");

  const target = input.direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= images.length) return {moved: false};

  const supabase = createServerSupabase();
  const a = images[index]!;
  const b = images[target]!;
  // Two updates rather than a swap in one statement: the position column has no
  // unique constraint, so an intermediate collision is harmless.
  await supabase.from("product_images").update({position: b.position}).eq("id", a.id);
  await supabase.from("product_images").update({position: a.position}).eq("id", b.id);
  return {moved: true};
}
