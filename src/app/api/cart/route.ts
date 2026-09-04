export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {quoteCart, CheckoutError} from "@/core/commerce/checkoutService";
import {z} from "zod";

/**
 * The basket, for anonymous shoppers.
 *
 * Runs as service role because there is no session to scope RLS by. Authority is
 * possession of the session token, so every query filters on it explicitly and the
 * token is required to be long enough not to be guessable.
 */

const addSchema = z.object({
  sessionToken: z.string().min(32).max(200),
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
}).strict();

const updateSchema = z.object({
  sessionToken: z.string().min(32).max(200),
  cartItemId: z.string().uuid(),
  // Zero removes the line, which is what a quantity stepper does at its minimum.
  quantity: z.number().int().min(0).max(20),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "cart:read"}},
  async (req: NextRequest) => {
    const token = new URL(req.url).searchParams.get("sessionToken");
    if (!token || token.length < 32) return apiError(400, "INVALID_TOKEN", "Basket not found.");
    try {
      return apiSuccess(await quoteCart({sessionToken: token}));
    } catch (e) {
      if (e instanceof CheckoutError && (e.code === "CART_NOT_FOUND" || e.code === "CART_EMPTY")) {
        // An empty basket is a normal state, not an error the shopper should see.
        return apiSuccess({cartId: null, stores: [], grandTotal: 0});
      }
      throw e;
    }
  }
);

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 60, windowSeconds: 60, scope: "cart:add"}},
  async (req: NextRequest) => {
    const parsed = addSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "We couldn't add that to your basket.");

    const supabase = createServiceRoleSupabase();

    // Only sell what is published. Checking here as well as at checkout means a
    // shopper is told immediately rather than at payment.
    const {data: variant} = await supabase
      .from("product_variants")
      .select("id,stock_quantity,products(status)")
      .eq("id", parsed.data.variantId).maybeSingle();

    const product = variant?.products as unknown as {status: string} | null;
    if (!variant || product?.status !== "published") {
      return apiError(404, "VARIANT_UNAVAILABLE", "That item isn't available.");
    }
    if ((variant.stock_quantity as number) < parsed.data.quantity) {
      return apiError(409, "INSUFFICIENT_STOCK", "There isn't enough of that left in stock.");
    }

    let {data: cart} = await supabase
      .from("carts").select("id").eq("session_token", parsed.data.sessionToken).maybeSingle();
    if (!cart) {
      const {data: created, error} = await supabase
        .from("carts").insert({session_token: parsed.data.sessionToken, status: "open"})
        .select("id").single();
      if (error) return apiError(500, "CART_CREATE_FAILED", "We couldn't start a basket.", error);
      cart = created;
    }

    // Adding the same variant twice increases the line rather than duplicating it.
    const {data: existing} = await supabase
      .from("cart_items").select("id,quantity")
      .eq("cart_id", cart!.id).eq("variant_id", parsed.data.variantId).maybeSingle();

    if (existing) {
      const newQuantity = Math.min(20, (existing.quantity as number) + parsed.data.quantity);
      await supabase.from("cart_items").update({quantity: newQuantity}).eq("id", existing.id);
      return apiSuccess({cartItemId: existing.id, quantity: newQuantity});
    }

    const {data: item, error} = await supabase.from("cart_items").insert({
      cart_id: cart!.id, variant_id: parsed.data.variantId, quantity: parsed.data.quantity,
    }).select("id,quantity").single();
    if (error) return apiError(500, "CART_ADD_FAILED", "We couldn't add that to your basket.", error);

    return apiSuccess({cartItemId: item.id, quantity: item.quantity}, 201);
  }
);

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 60, windowSeconds: 60, scope: "cart:update"}},
  async (req: NextRequest) => {
    const parsed = updateSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "We couldn't update your basket.");

    const supabase = createServiceRoleSupabase();
    const {data: cart} = await supabase
      .from("carts").select("id").eq("session_token", parsed.data.sessionToken).maybeSingle();
    if (!cart) return apiError(404, "CART_NOT_FOUND", "Basket not found.");

    // Scoped to this cart, so a guessed item id from someone else's basket does nothing.
    if (parsed.data.quantity === 0) {
      await supabase.from("cart_items").delete()
        .eq("id", parsed.data.cartItemId).eq("cart_id", cart.id);
      return apiSuccess({removed: true});
    }

    const {error} = await supabase.from("cart_items")
      .update({quantity: parsed.data.quantity})
      .eq("id", parsed.data.cartItemId).eq("cart_id", cart.id);
    if (error) return apiError(500, "CART_UPDATE_FAILED", "We couldn't update your basket.", error);
    return apiSuccess({quantity: parsed.data.quantity});
  }
);
