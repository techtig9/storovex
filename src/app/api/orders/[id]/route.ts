export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {resolveStoreId} from "@/core/auth/session";
import {getOrder, setOrderStatus, refundOrder, OrderError} from "@/core/commerce/orderService";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

const uuid = z.string().uuid();

const patchSchema = z.discriminatedUnion("action", [
  // Fulfilment and cancellation are ordinary shop work.
  z.object({
    action: z.literal("set_status"),
    storeId: uuid.optional(),
    status: z.enum(["fulfilled", "cancelled"]),
  }),
  // Refunding is separated because it moves money and needs a different permission.
  z.object({action: z.literal("refund"), storeId: uuid.optional()}),
]);

function orderFailure(e: unknown) {
  if (!(e instanceof OrderError)) throw e;
  const messages: Record<string, [number, string]> = {
    ORDER_NOT_FOUND: [404, "That order doesn't exist."],
    TRANSITION_NOT_ALLOWED: [409, "That order can't move to that status from where it is now."],
    ORDER_CHANGED_CONCURRENTLY: [409, "This order was just updated somewhere else. Reload and try again."],
    NO_PAYMENT_TO_REFUND: [409, "There's no payment on this order to refund."],
    REFUND_FAILED: [502, "The refund didn't go through. Nothing has been changed."],
  };
  const [status, message] = messages[e.code] ?? [400, "We couldn't update that order."];
  return apiError(status, e.code, message, e.detail);
}

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 240, windowSeconds: 60, scope: "orders:get"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_ORDER_ID", "That order id isn't valid.");
    }
    const storeId = await resolveStoreId(new URL(req.url).searchParams.get("storeId"));
    await authorizeStoreAction(storeId, "orders:read");

    const order = await getOrder(storeId, params.id);
    if (!order) return apiError(404, "ORDER_NOT_FOUND", "That order doesn't exist.");
    return apiSuccess(order);
  }
);

export const PATCH = withApi(
  {methods: ["PATCH"], rateLimit: {limit: 60, windowSeconds: 60, scope: "orders:update"}},
  async (req: NextRequest, {params}) => {
    if (!params?.id || !uuid.safeParse(params.id).success) {
      return apiError(400, "INVALID_ORDER_ID", "That order id isn't valid.");
    }
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");

    const storeId = await resolveStoreId(parsed.data.storeId);

    try {
      if (parsed.data.action === "refund") {
        // Staff can fulfil but not refund: one ships a parcel, the other sends money
        // back, and they should not be the same level of trust.
        await authorizeStoreAction(storeId, "orders:refund");
        return apiSuccess(await refundOrder({storeId, orderId: params.id}));
      }
      await authorizeStoreAction(storeId, "orders:fulfil");
      return apiSuccess(await setOrderStatus({storeId, orderId: params.id, status: parsed.data.status}));
    } catch (e) { return orderFailure(e); }
  }
);
