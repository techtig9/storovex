import React from "react";
import {Badge, type BadgeTone} from "@/components/ui/States";

/**
 * Status vocabulary, in one place.
 *
 * The labels differ from the stored values on purpose: `pending_payment` is what the
 * column holds, "Awaiting payment" is what a person understands. The tone is never
 * the only signal — the words carry the meaning on their own.
 */
const ORDER_LABELS: Record<string, {label: string; tone: BadgeTone}> = {
  pending_payment: {label: "Awaiting payment", tone: "warning"},
  paid: {label: "Paid", tone: "success"},
  fulfilled: {label: "Fulfilled", tone: "brand"},
  failed: {label: "Payment failed", tone: "danger"},
  cancelled: {label: "Cancelled", tone: "neutral"},
  refunded: {label: "Refunded", tone: "neutral"},
};

const PRODUCT_LABELS: Record<string, {label: string; tone: BadgeTone}> = {
  draft: {label: "Draft", tone: "neutral"},
  active: {label: "Live", tone: "success"},
  archived: {label: "Archived", tone: "neutral"},
};

export function OrderStatusBadge({status}: {status: string}) {
  const s = ORDER_LABELS[status] ?? {label: status, tone: "neutral" as BadgeTone};
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ProductStatusBadge({status}: {status: string}) {
  const s = PRODUCT_LABELS[status] ?? {label: status, tone: "neutral" as BadgeTone};
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
