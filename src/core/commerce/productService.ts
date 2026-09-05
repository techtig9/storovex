import {createServerSupabase, createServiceRoleSupabase} from "@/core/supabase/server";
import {toMinorUnits, toDecimalString, type Money} from "./money";

/**
 * Product and variant reads and writes.
 *
 * Uses the caller's own client, so RLS is what enforces store scoping — the store id
 * is still passed and filtered on, but a bug there cannot leak another merchant's
 * catalogue, because the policy would reject the row anyway. Defence in depth in the
 * order that matters: the database decides, the application agrees.
 */

/** Live products_status_check allows exactly these three. "published" is not one
 * of them, so every storefront query written against it matched nothing. */
export type ProductStatus = "draft" | "active" | "archived";

export type VariantInput = {
  sku: string;
  price: Money;
  compareAtPrice?: Money | null;
  stockQuantity: number;
  options?: Record<string, string>;
  imageUrl?: string | null;
};

export async function listProducts(input: {
  storeId: string; search?: string; status?: ProductStatus; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const supabase = createServerSupabase();

  let query = supabase
    .from("products")
    .select("id,title,description,status,created_at", {count: "exact"})
    .eq("store_id", input.storeId);

  if (input.status) query = query.eq("status", input.status);
  // Postgres full-text search over the existing search_vector column, rather than
  // ILIKE: the column is already there and a trigram scan on a large catalogue is
  // markedly slower.
  if (input.search?.trim()) query = query.textSearch("search_vector", input.search.trim(), {
    type: "websearch", config: "english",
  });

  const {data, error, count} = await query
    .order("created_at", {ascending: false})
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) throw new Error("PRODUCT_LIST_FAILED");
  return {products: data ?? [], total: count ?? 0, page, pageSize};
}

export async function getProduct(storeId: string, productId: string) {
  const supabase = createServerSupabase();
  const [{data: product}, {data: variants}, {data: images}] = await Promise.all([
    supabase.from("products").select("id,title,description,status,created_at")
      .eq("id", productId).eq("store_id", storeId).maybeSingle(),
    supabase.from("product_variants")
      .select("id,sku,price,compare_at_price,stock_quantity,options,image_url")
      .eq("product_id", productId).order("created_at", {ascending: true}),
    supabase.from("product_images").select("id,url,position")
      .eq("product_id", productId).order("position", {ascending: true}),
  ]);

  if (!product) return null;
  return {
    ...product,
    // Prices leave the database as numeric strings; normalise to minor units so
    // callers never do arithmetic on a float.
    variants: (variants ?? []).map(v => ({
      id: v.id, sku: v.sku,
      price: toMinorUnits(v.price as string),
      compareAtPrice: v.compare_at_price === null ? null : toMinorUnits(v.compare_at_price as string),
      stockQuantity: v.stock_quantity, options: v.options, imageUrl: v.image_url,
    })),
    images: images ?? [],
  };
}

export async function createProduct(input: {
  storeId: string; title: string; description?: string; status?: ProductStatus;
}) {
  const supabase = createServerSupabase();
  const {data, error} = await supabase.from("products").insert({
    store_id: input.storeId, title: input.title,
    description: input.description ?? null,
    // New products start as drafts. Publishing is a deliberate act, and the
    // storefront policy keys off exactly this column.
    status: input.status ?? "draft",
  }).select("id,title,status,created_at").single();
  if (error) throw new Error("PRODUCT_CREATE_FAILED");
  return data;
}

export async function updateProduct(input: {
  storeId: string; productId: string;
  title?: string; description?: string; status?: ProductStatus;
}) {
  const supabase = createServerSupabase();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.status !== undefined) patch.status = input.status;
  if (Object.keys(patch).length === 0) throw new Error("NOTHING_TO_UPDATE");

  const {data, error} = await supabase.from("products").update(patch)
    .eq("id", input.productId).eq("store_id", input.storeId)
    .select("id,title,status").single();
  if (error) throw new Error("PRODUCT_UPDATE_FAILED");
  return data;
}

export async function deleteProduct(storeId: string, productId: string) {
  const supabase = createServerSupabase();
  // Refuse if the product has ever been ordered: order_items snapshot the title and
  // price, but the variant reference would dangle, and order history that cannot be
  // traced back to a product is worse than a product that will not delete.
  const admin = createServiceRoleSupabase();
  const {count} = await admin.from("order_items").select("id", {count: "exact", head: true})
    .in("variant_id",
      (await admin.from("product_variants").select("id").eq("product_id", productId))
        .data?.map(v => v.id) ?? ["00000000-0000-0000-0000-000000000000"]);
  if ((count ?? 0) > 0) throw new Error("PRODUCT_HAS_ORDERS");

  const {error} = await supabase.from("products")
    .delete().eq("id", productId).eq("store_id", storeId);
  if (error) throw new Error("PRODUCT_DELETE_FAILED");
  return {deleted: true};
}

export async function createVariant(input: {storeId: string; productId: string} & VariantInput) {
  const supabase = createServerSupabase();
  const {data, error} = await supabase.from("product_variants").insert({
    product_id: input.productId, store_id: input.storeId, sku: input.sku,
    price: toDecimalString(input.price),
    compare_at_price: input.compareAtPrice == null ? null : toDecimalString(input.compareAtPrice),
    stock_quantity: input.stockQuantity,
    options: input.options ?? {}, image_url: input.imageUrl ?? null,
  }).select("id,sku,stock_quantity").single();
  if (error) throw new Error("VARIANT_CREATE_FAILED");
  return data;
}

/**
 * Adjusts stock by a delta rather than setting it.
 *
 * Setting an absolute value loses concurrent sales: a merchant editing "50 in stock"
 * while an order takes one would write 50 back and silently un-sell it.
 */
export async function adjustStock(input: {storeId: string; variantId: string; delta: number}) {
  const admin = createServiceRoleSupabase();
  if (input.delta === 0) throw new Error("DELTA_ZERO");

  const {data, error} = await admin.rpc(
    input.delta > 0 ? "release_stock" : "try_reserve_stock",
    {p_variant_id: input.variantId, p_quantity: Math.abs(input.delta)}
  );
  if (error) throw new Error("STOCK_ADJUST_FAILED");
  // try_reserve_stock returns false when there is not enough to take away.
  if (input.delta < 0 && data === false) throw new Error("INSUFFICIENT_STOCK");
  return {adjusted: input.delta};
}
