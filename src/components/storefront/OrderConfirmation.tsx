"use client";
import React from "react";
import {Button} from "@/components/ui/Button";
import {Card, CardBody} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {Badge, ErrorState, Skeleton} from "@/components/ui/States";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";

type Group = {
  id: string; email: string; createdAt: string;
  orders: {
    id: string; orderNumber: number; status: string; total: number;
    storeName: string; storeSlug: string;
    items: {id: string; title: string; quantity: number; unitPrice: number}[];
  }[];
};

const STATUS: Record<string, {label: string; tone: "neutral" | "success" | "warning" | "danger" | "brand"}> = {
  pending_payment: {label: "Awaiting payment", tone: "warning"},
  paid: {label: "Paid", tone: "success"},
  fulfilled: {label: "On its way", tone: "brand"},
  failed: {label: "Payment failed", tone: "danger"},
  cancelled: {label: "Cancelled", tone: "neutral"},
  refunded: {label: "Refunded", tone: "neutral"},
};

/**
 * The confirmation page asks for the email before showing anything.
 *
 * The group id is in the URL, so it reaches browser history, referrer headers and
 * anyone the shopper pastes the link to. Requiring the email as well means a leaked
 * link on its own does not expose someone's postal address and what they bought.
 */
export function OrderConfirmation({groupId, slug}: {groupId: string; slug: string}) {
  const [email, setEmail] = React.useState("");
  const [group, setGroup] = React.useState<Group | null>(null);
  const [state, setState] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = React.useState<string>();

  async function lookUp(e: React.FormEvent) {
    e.preventDefault();
    setState("loading"); setError(undefined);
    try {
      const params = new URLSearchParams({groupId, email: email.trim().toLowerCase()});
      setGroup(await api<Group>(`/api/orders/group?${params}`));
      setState("ready");
    } catch (err) {
      setError(messageFor(err));
      setState("error");
    }
  }

  if (state === "ready" && group) {
    const awaiting = group.orders.some(o => o.status === "pending_payment");
    return (
      <>
        <h1 className="text-3xl">Thank you</h1>
        <p className="mt-2 text-base text-ink-muted">
          {awaiting
            ? "Your order is placed. We're still confirming your payment — this page updates once it clears."
            : "Your order is confirmed. A receipt is on its way to your email."}
        </p>
        <p className="mt-1 text-sm text-ink-subtle">
          Reference <code className="font-mono">{group.id.slice(0, 8)}</code> ·{" "}
          <time dateTime={group.createdAt}>{new Date(group.createdAt).toLocaleString()}</time>
        </p>

        <div className="mt-6 space-y-4">
          {group.orders.map(order => {
            const status = STATUS[order.status] ?? {label: order.status, tone: "neutral" as const};
            return (
              <Card key={order.id}>
                <CardBody className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-md font-semibold">
                      {group.orders.length > 1 ? order.storeName : `Order #${order.orderNumber}`}
                    </h2>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <ul className="divide-y divide-line text-base">
                    {order.items.map(item => (
                      <li key={item.id} className="flex justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate">{item.title}</span>
                          <span className="text-sm text-ink-muted">× {item.quantity}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatMoney(item.unitPrice * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between border-t border-line pt-3 font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{formatMoney(order.total)}</span>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>

        <div className="mt-6">
          <Button variant="secondary" onClick={() => { window.location.href = `/s/${slug}`; }}>
            Continue shopping
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl">Your order</h1>
      <p className="mt-2 text-base text-ink-muted">
        Enter the email you used at checkout to see it.
      </p>

      <Card className="mt-6">
        <CardBody className="pt-5">
          <form onSubmit={lookUp} className="space-y-4">
            <Input label="Email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} />
            {state === "error" && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error ?? "We couldn't find that order."}
              </p>
            )}
            <Button type="submit" fullWidth loading={state === "loading"} disabled={!email.trim()}>
              View my order
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
