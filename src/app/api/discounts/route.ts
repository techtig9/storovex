export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {listDiscounts, createDiscount} from "@/core/commerce/discountService";
import {discountFailure} from "./errors";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const createSchema = z.object({
  storeId: z.string().uuid().optional(),
  // Codes are typed by shoppers, so the character set is deliberately narrow.
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["percent", "fixed"]),
  // Percent: whole percent. Fixed: minor units, same as everywhere else.
  value: z.number().int().min(1),
  minSubtotal: z.number().int().min(0).nullable().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict();

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 120, windowSeconds: 60, scope: "discounts:list"}},
  async (req: NextRequest) => {
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "discounts:write");
    return apiSuccess({discounts: await listDiscounts(storeId)});
  }
);

export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 30, windowSeconds: 60, scope: "discounts:create"}},
  async (req: NextRequest) => {
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the discount details.");

    const storeId = await resolveStoreId(parsed.data.storeId);
    await authorizeStoreAction(storeId, "discounts:write");
    try {
      return apiSuccess(await createDiscount({...parsed.data, storeId}), 201);
    } catch (e) { return discountFailure(e); }
  }
);
