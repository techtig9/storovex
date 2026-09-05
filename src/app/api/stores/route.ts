export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {getStoreForMerchant, updateStore, listMyStores, StoreError} from "@/core/commerce/storeService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const patchSchema = z.object({
  storeId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(3).max(60).optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  about: z.string().trim().max(2000).nullable().optional(),
  logoUrl: z.string().trim().max(2048).nullable().optional(),
  themeAccent: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  // Money in minor units, tax in basis points — the same units the rest of the
  // system uses, so nothing has to convert at a boundary.
  shippingFlatRate: z.number().int().min(0).max(100_000_00).optional(),
  shippingFreeThreshold: z.number().int().min(0).max(100_000_00).nullable().optional(),
  taxBasisPoints: z.number().int().min(0).max(10000).optional(),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "stores:get"}},
  async (req: NextRequest) => {
    const url = new URL(req.url);
    if (url.searchParams.get("all") === "true") {
      return apiSuccess({stores: await listMyStores()});
    }
    const storeId = await resolveStoreId(url.searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "store:read");
    return apiSuccess(await getStoreForMerchant(storeId));
  }
);

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 30, windowSeconds: 60, scope: "stores:update"}},
  async (req: NextRequest) => {
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the store details.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "store:write");
    try {
      return apiSuccess(await updateStore({...parsed.data, storeId}));
    } catch (e) {
      if (!(e instanceof StoreError)) throw e;
      const messages: Record<string, [number, string]> = {
        SLUG_TAKEN: [409, "That storefront address is already in use. Try another."],
        SLUG_INVALID: [422, "A storefront address can use lowercase letters, numbers and hyphens."],
        STORE_UPDATE_FORBIDDEN: [403, "Only a manager can change store details."],
        NOTHING_TO_UPDATE: [400, "No changes were supplied."],
        STORE_NOT_FOUND: [404, "That store doesn't exist."],
        LOGO_URL_INVALID: [422, "A logo needs to be an https link to an image."],
        ACCENT_INVALID: [422, "Pick a colour like #2E5AAC."],
        SHIPPING_INVALID: [422, "Shipping can't be negative."],
        THRESHOLD_INVALID: [422, "The free-shipping threshold can't be negative."],
        TAX_RATE_INVALID: [422, "A tax rate has to be between 0% and 100%."],
      };
      const [status, message] = messages[e.code] ?? [400, "We couldn't save those changes."];
      return apiError(status, e.code, message, e.detail);
    }
  }
);
