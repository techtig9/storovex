import {createServerSupabase} from "@/core/supabase/server";

/**
 * Collections and categories.
 *
 * Two different things that look alike. A **collection** belongs to one store and is
 * that merchant's own grouping — "Winter", "Sale". A **category** is the platform's
 * shared taxonomy, the same list for everyone, and merchants pick from it rather
 * than adding to it: a marketplace where every seller invents their own category
 * names cannot be browsed across sellers, which is the point of a marketplace.
 *
 * So collections are created here and categories are only assigned.
 */

export class CollectionError extends Error {
  constructor(readonly code: string, readonly detail?: unknown) { super(code); }
}

function toSlug(value: string) {
  return value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export async function listCollections(storeId: string) {
  const supabase = createServerSupabase();
  const {data, error} = await supabase.from("collections")
    .select("id,title,slug").eq("store_id", storeId).order("title", {ascending: true});
  if (error) throw new CollectionError("COLLECTION_LIST_FAILED", error.message);

  const ids = (data ?? []).map(c => c.id as string);
  // One count query for all of them rather than one per collection.
  const {data: links} = ids.length
    ? await supabase.from("product_collections").select("collection_id").in("collection_id", ids)
    : {data: []};

  const counts = new Map<string, number>();
  for (const link of links ?? []) {
    const id = link.collection_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (data ?? []).map(c => ({
    id: c.id as string, title: c.title as string, slug: c.slug as string,
    productCount: counts.get(c.id as string) ?? 0,
  }));
}

export async function createCollection(input: {storeId: string; title: string}) {
  const title = input.title.trim();
  if (!title) throw new CollectionError("TITLE_REQUIRED");
  const slug = toSlug(title);
  if (!slug) throw new CollectionError("TITLE_UNUSABLE");

  const supabase = createServerSupabase();
  const {data: existing} = await supabase.from("collections")
    .select("id").eq("store_id", input.storeId).eq("slug", slug).maybeSingle();
  if (existing) throw new CollectionError("COLLECTION_EXISTS");

  const {data, error} = await supabase.from("collections")
    .insert({store_id: input.storeId, title, slug})
    .select("id,title,slug").single();
  if (error) throw new CollectionError("COLLECTION_CREATE_FAILED", error.message);
  return {id: data.id as string, title: data.title as string, slug: data.slug as string, productCount: 0};
}

export async function deleteCollection(storeId: string, collectionId: string) {
  const supabase = createServerSupabase();
  // The links go first. Deleting the collection while product_collections still
  // points at it would either fail on the foreign key or orphan the rows.
  await supabase.from("product_collections").delete().eq("collection_id", collectionId);
  const {error} = await supabase.from("collections")
    .delete().eq("id", collectionId).eq("store_id", storeId);
  if (error) throw new CollectionError("COLLECTION_DELETE_FAILED", error.message);
  return {deleted: true};
}

/** The platform's shared category list. Read-only to merchants. */
export async function listCategories() {
  const supabase = createServerSupabase();
  const {data, error} = await supabase.from("categories")
    .select("id,name,slug").order("name", {ascending: true});
  if (error) throw new CollectionError("CATEGORY_LIST_FAILED", error.message);
  return (data ?? []).map(c => ({id: c.id as string, name: c.name as string, slug: c.slug as string}));
}

/** What one product currently belongs to. */
export async function productMemberships(storeId: string, productId: string) {
  const supabase = createServerSupabase();
  const [{data: collections}, {data: categories}] = await Promise.all([
    supabase.from("product_collections").select("collection_id").eq("product_id", productId),
    supabase.from("product_categories").select("category_id").eq("product_id", productId),
  ]);
  return {
    collectionIds: (collections ?? []).map(c => c.collection_id as string),
    categoryIds: (categories ?? []).map(c => c.category_id as string),
  };
}

/**
 * Replaces a product's memberships wholesale.
 *
 * Delete-then-insert rather than diffing: the set is small, the write is idempotent,
 * and a diff that gets the comparison wrong leaves a product in a collection the
 * merchant just removed it from.
 */
export async function setProductMemberships(input: {
  storeId: string; productId: string;
  collectionIds?: string[]; categoryIds?: string[];
}) {
  const supabase = createServerSupabase();

  // Confirm the product is this store's before touching the join tables, which
  // carry no store_id of their own to scope by.
  const {data: product} = await supabase.from("products")
    .select("id").eq("id", input.productId).eq("store_id", input.storeId).maybeSingle();
  if (!product) throw new CollectionError("PRODUCT_NOT_FOUND");

  if (input.collectionIds) {
    // Only this store's collections, so a guessed id from another merchant cannot
    // put their collection on this product.
    const {data: owned} = await supabase.from("collections")
      .select("id").eq("store_id", input.storeId).in("id", input.collectionIds.length ? input.collectionIds : ["00000000-0000-0000-0000-000000000000"]);
    const allowed = new Set((owned ?? []).map(c => c.id as string));

    await supabase.from("product_collections").delete().eq("product_id", input.productId);
    const rows = input.collectionIds.filter(id => allowed.has(id))
      .map(id => ({product_id: input.productId, collection_id: id}));
    if (rows.length) {
      const {error} = await supabase.from("product_collections").insert(rows);
      if (error) throw new CollectionError("COLLECTION_ASSIGN_FAILED", error.message);
    }
  }

  if (input.categoryIds) {
    await supabase.from("product_categories").delete().eq("product_id", input.productId);
    const rows = input.categoryIds.map(id => ({product_id: input.productId, category_id: id}));
    if (rows.length) {
      const {error} = await supabase.from("product_categories").insert(rows);
      if (error) throw new CollectionError("CATEGORY_ASSIGN_FAILED", error.message);
    }
  }

  return {updated: true};
}
