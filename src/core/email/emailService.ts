import type {FetchLike} from "@/core/ai/providers/types";
import {formatMoney} from "@/core/commerce/money";

/**
 * Transactional email.
 *
 * Every send is best-effort and never throws into the caller: an order that is paid
 * for and shipped must not be treated as failed because a receipt did not go out.
 * Failures are returned, so the caller can log them, and reported honestly rather
 * than swallowed as success.
 *
 * When Resend is not configured, `send` reports `skipped` instead of pretending to
 * have sent something. A silent no-op here is how a merchant ends up believing
 * customers received receipts that were never sent.
 */

const API = "https://api.resend.com/emails";

export type SendResult =
  | {ok: true; id: string}
  | {ok: false; skipped: true; reason: "NOT_CONFIGURED"}
  | {ok: false; skipped: false; reason: string};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export async function send(
  message: EmailMessage, opts: {fetchImpl?: FetchLike} = {}
): Promise<SendResult> {
  // Only the API key, not the full Resend integration check: that also demands
  // RESEND_WEBHOOK_SECRET, which is for inbound delivery events and has nothing to
  // do with sending. Requiring it here would silently stop receipts for anyone who
  // configured sending but not webhooks.
  if (!process.env.RESEND_API_KEY) {
    return {ok: false, skipped: true, reason: "NOT_CONFIGURED"};
  }

  const from = process.env.EMAIL_FROM ?? "Storovex <orders@storovex.com>";
  const impl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);

  try {
    const res = await impl(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? {reply_to: message.replyTo} : {}),
      }),
    });

    const body = await res.json().catch(() => null) as {id?: string; message?: string} | null;
    if (!res.ok) return {ok: false, skipped: false, reason: body?.message ?? `HTTP_${res.status}`};
    return {ok: true, id: body?.id ?? "unknown"};
  } catch (e) {
    return {ok: false, skipped: false, reason: e instanceof Error ? e.message : String(e)};
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type ReceiptOrder = {
  orderNumber: number;
  storeName: string;
  items: {title: string; quantity: number; unitPrice: number}[];
  subtotal: number; discountTotal: number; shippingTotal: number;
  taxTotal: number; total: number;
};

/**
 * The order receipt.
 *
 * Plain text is built alongside the HTML rather than after it, because a receipt
 * that renders as a blank message in a text-only client is a support ticket. Every
 * value is escaped: product titles are merchant-supplied and end up in an email
 * client that will happily render markup.
 */
export function buildReceipt(input: {
  email: string; order: ReceiptOrder; orderUrl: string;
}): EmailMessage {
  const {order} = input;
  const money = (v: number) => formatMoney(v);

  const rows = order.items.map(item =>
    `<tr>
       <td style="padding:8px 0;color:#111">${escapeHtml(item.title)} &times; ${item.quantity}</td>
       <td style="padding:8px 0;text-align:right;color:#111">${money(item.unitPrice * item.quantity)}</td>
     </tr>`).join("");

  const line = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#555">${label}</td>
         <td style="padding:4px 0;text-align:right;color:#555">${value}</td></tr>`;

  const html = `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 4px;font-size:20px;color:#111">Thank you for your order</h1>
      <p style="margin:0 0 20px;color:#555;font-size:14px">
        Order #${order.orderNumber} from ${escapeHtml(order.storeName)}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows}
        <tr><td colspan="2" style="border-top:1px solid #e5e7eb;padding-top:10px"></td></tr>
        ${line("Subtotal", money(order.subtotal))}
        ${order.discountTotal > 0 ? line("Discount", `−${money(order.discountTotal)}`) : ""}
        ${order.shippingTotal > 0 ? line("Shipping", money(order.shippingTotal)) : ""}
        ${order.taxTotal > 0 ? line("Tax", money(order.taxTotal)) : ""}
        <tr>
          <td style="padding-top:10px;font-weight:600;color:#111">Total</td>
          <td style="padding-top:10px;text-align:right;font-weight:600;color:#111">${money(order.total)}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0">
        <a href="${escapeHtml(input.orderUrl)}"
           style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">
          View your order
        </a>
      </p>
    </div>
    <p style="margin:16px 0 0;text-align:center;color:#888;font-size:12px">
      Sold by ${escapeHtml(order.storeName)} on Storovex
    </p>
  </div>
</body></html>`;

  const text = [
    `Thank you for your order`,
    `Order #${order.orderNumber} from ${order.storeName}`,
    ``,
    ...order.items.map(i => `${i.title} x ${i.quantity}  ${money(i.unitPrice * i.quantity)}`),
    ``,
    `Subtotal: ${money(order.subtotal)}`,
    ...(order.discountTotal > 0 ? [`Discount: -${money(order.discountTotal)}`] : []),
    ...(order.shippingTotal > 0 ? [`Shipping: ${money(order.shippingTotal)}`] : []),
    ...(order.taxTotal > 0 ? [`Tax: ${money(order.taxTotal)}`] : []),
    `Total: ${money(order.total)}`,
    ``,
    `View your order: ${input.orderUrl}`,
  ].join("\n");

  return {
    to: input.email,
    subject: `Your order #${order.orderNumber} from ${order.storeName}`,
    html, text,
  };
}

/** Tells a merchant they have something to pack. */
export function buildMerchantNotification(input: {
  email: string; order: ReceiptOrder; orderUrl: string;
}): EmailMessage {
  const itemCount = input.order.items.reduce((n, i) => n + i.quantity, 0);
  return {
    to: input.email,
    subject: `New order #${input.order.orderNumber} — ${formatMoney(input.order.total)}`,
    html: `<p>You have a new order, #${input.order.orderNumber}, for ${itemCount} item${itemCount === 1 ? "" : "s"} totalling ${formatMoney(input.order.total)}.</p>
           <p><a href="${escapeHtml(input.orderUrl)}">Open it in your dashboard</a></p>`,
    text: `New order #${input.order.orderNumber} for ${itemCount} item${itemCount === 1 ? "" : "s"}, totalling ${formatMoney(input.order.total)}.\n\n${input.orderUrl}`,
  };
}
