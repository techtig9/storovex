import {createServerSupabase} from "@/core/supabase/server";
import {toMinorUnits} from "@/core/commerce/money";

/**
 * Public storefront reads.
 *
 * Deliberately uses the anon client, not service role: the RLS policies already say
 * exactly what the public may see — published products, their variants and images —
 * so the storefront inherits that rather than restating it in application code where
 * the two could drift apart.
 */

export type StorefrontProduct = {
  id: string; title: string; description: string | null;
  priceFrom: number | null; imageUrl: string | null;
};

export async function getStoreBySlug(slug: string) {
  const supabase = createServerSupabase();
  const {data} = await supabase
    .from("stores")
    .select("id,name,slug,tagline,about,logo_url,theme_accent,shipping_flat_rate,shipping_free_threshold,tax_basis_points")
    .eq("slug", slug).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    tagline: (data.tagline as string | null) ?? null,
    about: (data.about as string | null) ?? null,
    logoUrl: (data.logo_url as string | null) ?? null,
    // Only ever a hex literal — both the column constraint and the API refuse
    // anything else, because this value is interpolated into a stylesheet.
    themeAccent: (data.theme_accent as string | null) ?? null,
    shippingFlatRate: data.shipping_flat_rate == null ? 0 : toMinorUnits(data.shipping_flat_rate as string),
    shippingFreeThreshold: data.shipping_free_threshold == null
      ? null : toMinorUnits(data.shipping_free_threshold as string),
    taxBasisPoints: Number(data.tax_basis_points ?? 0),
  };
}

export async function listStorefrontProducts(storeId: string, opts: {limit?: number; search?: string} = {}) {
  const supabase = createServerSupabase();
  let query = supabase
    .from("products")
    .select("id,title,description,product_variants(price),product_images(url,position)")
    .eq("store_id", storeId)
    // Belt and braces with the RLS policy: if a policy is ever loosened by mistake,
    // the storefront still refuses to render a draft.
    .eq("status", "active")
    .limit(opts.limit ?? 48);

  if (opts.search?.trim()) {
    query = query.textSearch("search_vector", opts.search.trim(), {type: "websearch", config: "english"});
  }

  const {data} = await query;
  return (data ?? []).map(row => {
    const variants = (row.product_variants ?? []) as {price: string}[];
    const images = ((row.product_images ?? []) as {url: string; position: number}[])
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string | null,
      // "from" price: a product with several variants shows its cheapest, which is
      // what a shopper scanning a grid expects to compare.
      priceFrom: variants.length ? Math.min(...variants.map(v => toMinorUnits(v.price))) : null,
      imageUrl: images[0]?.url ?? null,
    } satisfies StorefrontProduct;
  });
}

export async function getStorefrontProduct(storeId: string, productId: string) {
  const supabase = createServerSupabase();
  const {data} = await supabase
    .from("products")
    .select("id,title,description,product_variants(id,sku,price,compare_at_price,stock_quantity,options),product_images(url,position),product_video_ads(video_url,status)")
    .eq("id", productId).eq("store_id", storeId).eq("status", "active")
    .maybeSingle();

  if (!data) return null;

  const videoAds = (data.product_video_ads ?? []) as {video_url: string; status: string}[];
  return {
    id: data.id as string,
    title: data.title as string,
    description: data.description as string | null,
    variants: ((data.product_variants ?? []) as Record<string, unknown>[]).map(v => ({
      id: v.id as string,
      sku: v.sku as string,
      price: toMinorUnits(v.price as string),
      compareAtPrice: v.compare_at_price == null ? null : toMinorUnits(v.compare_at_price as string),
      // Exposed as a boolean, not a number: publishing exact stock counts tells
      // competitors your sales volume.
      inStock: (v.stock_quantity as number) > 0,
      options: v.options as Record<string, string>,
    })),
    images: ((data.product_images ?? []) as {url: string; position: number}[])
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    videoUrl: videoAds.find(a => a.status === "ready")?.video_url ?? null,
  };
}
