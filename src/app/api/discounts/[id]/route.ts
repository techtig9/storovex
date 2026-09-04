export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {updateDiscount, deleteDiscount} from "@/core/commerce/discountService";
import {discountFailure} from "../errors";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const uuid = z.string().uuid();

const patchSchema = z.object({
  storeId: uuid.optional(),
  active: z.boolean().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict();

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 60, windowSeconds: 60, scope: "discounts:update"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_DISCOUNT_ID", "That discount id isn't valid.");
    }
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "discounts:write");
    try {
      return apiSuccess(await updateDiscount({...parsed.data, storeId, discountId: params.id}));
    } catch (e) { return discountFailure(e); }
  }
);

export const DELETE = withApi(
  {methods: ["DELETE"], rateLimit: {limit: 30, windowSeconds: 60, scope: "discounts:delete"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_DISCOUNT_ID", "That discount id isn't valid.");
    }
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "discounts:write");
    try {
      return apiSuccess(await deleteDiscount(storeId, params.id));
    } catch (e) { return discountFailure(e); }
  }
);
