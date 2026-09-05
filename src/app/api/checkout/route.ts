export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {quoteCart, createOrderGroup, CheckoutError} from "@/core/commerce/checkoutService";
import {createPaymentIntent} from "@/core/payments/stripe";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {withApi, apiSuccess, apiError, readJson} from "@/core/security/apiHandler";
import {z} from "zod";

/**
 * Checkout for an anonymous shopper.
 *
 * There is no session to authorise against — authority is possession of the cart's
 * session token, which is why the rate limit here is tight and every read is scoped
 * by that token rather than by a user id.
 */

const quoteSchema = z.object({
  sessionToken: z.string().min(16).max(200),
  discountCodes: z.record(z.string().max(60)).optional(),
}).strict();

const checkoutSchema = quoteSchema.extend({
  email: z.string().trim().toLowerCase().email().max(254),
  shippingAddress: z.record(z.unknown()).optional(),
}).strict();

/** Prices the basket without committing anything. */
export const POST = withApi(
  {methods: ["POST"], rateLimit: {limit: 30, windowSeconds: 60, scope: "checkout:quote"}},
  async (req: NextRequest) => {
    const body = await readJson(req);
    const isCommit = new URL(req.url).searchParams.get("commit") === "true";

    if (!isCommit) {
      const parsed = quoteSchema.safeParse(body);
      if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Check the request and try again.");
      try {
        return apiSuccess(await quoteCart(parsed.data));
      } catch (e) {
        return checkoutFailure(e);
      }
    }

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "An email address is required.");

    try {
      const group = await createOrderGroup(parsed.data);

      // One payment intent per store: an intent settles to a single connected
      // account, and this basket may span several merchants.
      const supabase = createServiceRoleSupabase();
      const intents = [];
      for (const order of group.orders) {
        const {data: store} = await supabase
          .from("stores").select("stripe_account_id").eq("id", order.storeId).maybeSingle();
        const connectedAccountId = store?.stripe_account_id as string | undefined;

        if (!connectedAccountId) {
          // The merchant has not finished Stripe onboarding. The order exists and
          // stock is held, so this is recoverable once they connect — but the
          // shopper must not be asked to pay into nothing.
          intents.push({orderId: order.id, storeId: order.storeId, error: "MERCHANT_NOT_CONNECTED"});
          continue;
        }

        const {data: orderRow} = await supabase
          .from("orders").select("total,application_fee_amount").eq("id", order.id).single();

        const intent = await createPaymentIntent({
          orderId: order.id,
          amount: Math.round(Number(orderRow!.total) * 100),
          applicationFeeAmount: Math.round(Number(orderRow!.application_fee_amount) * 100),
          currency: process.env.STOREFRONT_CURRENCY ?? "usd",
          connectedAccountId,
          email: parsed.data.email,
          metadata: {order_group_id: group.orderGroupId, store_id: order.storeId},
        });

        await supabase.from("orders")
          .update({stripe_payment_intent_id: intent.id}).eq("id", order.id);
        intents.push({orderId: order.id, storeId: order.storeId, clientSecret: intent.clientSecret});
      }

      return apiSuccess({...group, intents}, 201);
    } catch (e) {
      return checkoutFailure(e);
    }
  }
);

function checkoutFailure(e: unknown) {
  if (!(e instanceof CheckoutError)) throw e;
  const messages: Record<string, [number, string]> = {
    CART_NOT_FOUND: [404, "We couldn't find that basket."],
    CART_NOT_OPEN: [409, "That basket has already been checked out."],
    CART_EMPTY: [400, "Your basket is empty."],
    PRODUCT_UNAVAILABLE: [409, "An item in your basket is no longer available."],
    INSUFFICIENT_STOCK: [409, "An item in your basket just went out of stock."],
    CART_ITEM_ORPHANED: [409, "An item in your basket is no longer available."],
  };
  const [status, message] = messages[e.code] ?? [400, "We couldn't complete your checkout."];
  return apiError(status, e.code, message, e.detail);
}
