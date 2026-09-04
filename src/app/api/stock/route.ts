export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {adjustStock} from "@/core/commerce/productService";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

/**
 * Stock adjustment, by delta.
 *
 * Never by absolute value: a merchant setting "50 in stock" from a page loaded five
 * minutes ago would overwrite every sale made since, silently un-selling goods that
 * are already on their way to a customer. A delta composes with concurrent orders.
 */
const schema = z.object({
  storeId: z.string().uuid().optional(),
  variantId: z.string().uuid(),
  delta: z.number().int().refine(n => n !== 0, "A change of zero does nothing.")
    .refine(n => Math.abs(n) <= 100_000, "That's too large a single adjustment."),
}).strict();

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 120, windowSeconds: 60, scope: "stock:adjust"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Enter a whole number other than zero.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "products:write");

    // adjustStock runs as service role to reach the stock functions, which bypass
    // RLS — so the variant's ownership is checked here rather than assumed.
    const admin = createServiceRoleSupabase();
    const {data: variant} = await admin.from("product_variants")
      .select("id,store_id").eq("id", parsed.data.variantId).maybeSingle();
    if (!variant || variant.store_id !== storeId) {
      return apiError(404, "VARIANT_NOT_FOUND", "That variant doesn't exist.");
    }

    try {
      return apiSuccess(await adjustStock({
        storeId, variantId: parsed.data.variantId, delta: parsed.data.delta,
      }));
    } catch (e) {
      const code = e instanceof Error ? e.message : "STOCK_ADJUST_FAILED";
      if (code === "INSUFFICIENT_STOCK") {
        return apiError(409, code, "There isn't that much stock to remove.");
      }
      return apiError(400, code, "We couldn't adjust the stock.");
    }
  }
);
