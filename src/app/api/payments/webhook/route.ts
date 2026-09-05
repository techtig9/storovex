export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {verifyStripeSignature} from "@/core/payments/stripe";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {send, buildReceipt, type ReceiptOrder} from "@/core/email/emailService";
import {toMinorUnits} from "@/core/commerce/money";
import {siteUrl} from "@/core/config/site";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";

/**
 * Stripe webhook.
 *
 * Idempotency is insert-first on stripe_event_id: the unique constraint decides the
 * winner, so two concurrent redeliveries cannot both apply. Stripe retries
 * aggressively, and a payment applied twice would release stock twice or mark an
 * order paid that was refunded.
 */
export const POST = withApi(
  {methods: ["POST"], allowAnyContentType: true},
  async (req: NextRequest) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return apiError(503, "NOT_CONFIGURED", "Payment webhooks are not configured.");

    const rawBody = await req.text();
    if (!verifyStripeSignature(req.headers.get("stripe-signature"), rawBody, secret)) {
      return apiError(401, "SIGNATURE_INVALID", "Signature verification failed.");
    }

    let event: {
      id?: string; type?: string;
      data?: {object?: {id?: string; metadata?: Record<string, string>; amount?: number}};
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return apiError(400, "MALFORMED", "Body is not valid JSON.");
    }
    if (!event.id || !event.type) return apiError(400, "MALFORMED", "Missing event id or type.");

    const intent = event.data?.object;
    const orderId = intent?.metadata?.order_id;
    const storeId = intent?.metadata?.store_id;

    const supabase = createServiceRoleSupabase();
    const {data: inserted, error} = await supabase
      .from("payment_events")
      .upsert({
        stripe_event_id: event.id, type: event.type,
        order_id: orderId ?? null, store_id: storeId ?? null,
        payload: event, processed_at: new Date().toISOString(),
      }, {onConflict: "stripe_event_id", ignoreDuplicates: true})
      .select("id");

    if (error) return apiError(500, "PERSIST_FAILED", "Could not record the event.", error);
    if (!inserted || inserted.length === 0) return apiSuccess({status: "already_processed"});

    if (!orderId) return apiSuccess({status: "recorded", note: "no order attributed"});

    if (event.type === "payment_intent.succeeded") {
      await supabase.from("orders").update({status: "paid"}).eq("id", orderId);
      // The sale is committed, so the reservation has served its purpose. The stock
      // stays decremented; releasing it here would put sold goods back on the shelf.
      await releaseReservationsForOrder(orderId);
      // The receipt goes out here, when the money has actually cleared — not at
      // checkout, where the payment can still fail and a customer would have a
      // receipt for something they were never charged for.
      await sendOrderEmails(orderId);
      return apiSuccess({status: "paid", orderId});
    }

    if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
      await supabase.from("orders").update({status: "failed"}).eq("id", orderId);
      // Payment failed, so the goods were never sold. Put them back.
      await returnStockForOrder(orderId);
      return apiSuccess({status: "failed", orderId});
    }

    if (event.type === "charge.refunded") {
      await supabase.from("orders").update({status: "refunded"}).eq("id", orderId);
      await returnStockForOrder(orderId);
      return apiSuccess({status: "refunded", orderId});
    }

    return apiSuccess({status: "recorded", type: event.type});
  }
);

/**
 * Sends the customer their receipt and tells the merchant to pack it.
 *
 * Deliberately cannot fail the webhook. If Stripe gets anything other than a 2xx it
 * retries, and retrying a paid order because an email bounced would re-run every
 * step above it. A receipt that did not send is a support question; a webhook that
 * keeps failing is a broken shop.
 */
async function sendOrderEmails(orderId: string) {
  try {
    const supabase = createServiceRoleSupabase();
    const {data: order} = await supabase.from("orders")
      .select("order_number,email,subtotal,discount_total,shipping_total,tax_total,total,store_id,stores(name)")
      .eq("id", orderId).maybeSingle();
    if (!order) return;

    const {data: items} = await supabase.from("order_items")
      .select("title_snapshot,price_snapshot,quantity").eq("order_id", orderId);

    const store = order.stores as unknown as {name: string} | null;
    const receiptOrder: ReceiptOrder = {
      orderNumber: order.order_number as number,
      storeName: store?.name ?? "the seller",
      items: (items ?? []).map(i => ({
        title: i.title_snapshot as string,
        quantity: i.quantity as number,
        unitPrice: toMinorUnits(i.price_snapshot as string),
      })),
      subtotal: toMinorUnits(order.subtotal as string),
      discountTotal: toMinorUnits(order.discount_total as string),
      shippingTotal: toMinorUnits(order.shipping_total as string),
      taxTotal: toMinorUnits(order.tax_total as string),
      total: toMinorUnits(order.total as string),
    };

    const result = await send(buildReceipt({
      email: order.email as string,
      order: receiptOrder,
      orderUrl: `${siteUrl()}/orders/${orderId}`,
    }));

    // Reported rather than swallowed: a merchant who believes receipts are going
    // out when they are not will find out from an angry customer instead.
    if (!result.ok && !result.skipped) {
      console.error(JSON.stringify({level: "error", code: "RECEIPT_SEND_FAILED", orderId, reason: result.reason}));
    }
  } catch (e) {
    console.error(JSON.stringify({
      level: "error", code: "ORDER_EMAIL_FAILED", orderId,
      reason: e instanceof Error ? e.message : String(e),
    }));
  }
}

/** Marks reservations settled without returning stock — the sale went through. */
async function releaseReservationsForOrder(orderId: string) {
  const supabase = createServiceRoleSupabase();
  const {data: order} = await supabase
    .from("orders").select("order_group_id").eq("id", orderId).maybeSingle();
  if (!order) return;
  await supabase.from("stock_reservations")
    .update({released_at: new Date().toISOString()})
    .is("released_at", null)
    .in("variant_id",
      (await supabase.from("order_items").select("variant_id").eq("order_id", orderId))
        .data?.map(i => i.variant_id) ?? []);
}

/** Returns stock to the shelf after a failed or refunded payment. */
async function returnStockForOrder(orderId: string) {
  const supabase = createServiceRoleSupabase();
  const {data: items} = await supabase
    .from("order_items").select("variant_id,quantity").eq("order_id", orderId);
  for (const item of items ?? []) {
    await supabase.rpc("release_stock", {
      p_variant_id: item.variant_id, p_quantity: item.quantity,
    }).then(() => undefined, () => undefined);
  }
}
