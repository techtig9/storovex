"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {Card, CardBody, CardHeader, CardTitle} from "@/components/ui/Card";
import {Modal} from "@/components/ui/Modal";
import {ErrorState, Skeleton} from "@/components/ui/States";
import {useToast} from "@/components/ui/Toast";
import {OrderStatusBadge} from "@/components/merchant/StatusBadge";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";

type Item = {
  id: string; title: string; sku: string | null;
  unitPrice: number; quantity: number; lineTotal: number;
};
type Order = {
  id: string; orderNumber: number; email: string; status: string;
  subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number;
  total: number; applicationFee: number; netToMerchant: number;
  shippingAddress: Record<string, unknown> | null;
  createdAt: string; items: Item[]; allowedNextStatuses: string[];
};

export default function OrderPage({params}: {params: {id: string}}) {
  return (
    <AppShell activeId="orders">
      <OrderScreen orderId={params.id} />
    </AppShell>
  );
}

function OrderScreen({orderId}: {orderId: string}) {
  const [order, setOrder] = React.useState<Order | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      setOrder(await api<Order>(`/api/orders/${orderId}`));
      setState("ready");
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    }
  }, [orderId]);

  React.useEffect(() => { void load(); }, [load]);

  if (state !== "ready" || !order) {
    return (
      <>
        <nav className="mb-4 text-sm" aria-label="Breadcrumb">
          <a href="/orders" className="text-ink-muted underline-offset-2 hover:underline">Orders</a>
        </nav>
        <h1 className="mb-6 text-3xl">Order</h1>
        {state === "loading" ? (
          <div className="space-y-4" aria-busy="true">
            <span className="sr-only" role="status">Loading order</span>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <ErrorState as="h2" description={error ?? "We couldn't load that order."}
            action={<Button onClick={() => void load()}>Try again</Button>} />
        )}
      </>
    );
  }

  return (
    <>
      <nav className="mb-4 text-sm" aria-label="Breadcrumb">
        <a href="/orders" className="text-ink-muted underline-offset-2 hover:underline">Orders</a>
        <span className="mx-2 text-ink-subtle" aria-hidden="true">/</span>
        <span className="text-ink">#{order.orderNumber}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Order #{order.orderNumber}</h1>
          <p className="mt-1 text-base text-ink-muted">
            {order.email} · <time dateTime={order.createdAt}>
              {new Date(order.createdAt).toLocaleString()}
            </time>
          </p>
          <div className="mt-2"><OrderStatusBadge status={order.status} /></div>
        </div>
        <OrderActions order={order} onChanged={load} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader><CardTitle as="h2">Items</CardTitle></CardHeader>
          <CardBody>
            <ul className="divide-y divide-line">
              {order.items.map(item => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    {/* The snapshot, not the live product: this is what was bought. */}
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-ink-muted">
                      {item.quantity} × {formatMoney(item.unitPrice)}
                      {item.sku && <span className="ml-2">SKU {item.sku}</span>}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums">{formatMoney(item.lineTotal)}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle as="h2">Payment</CardTitle></CardHeader>
            <CardBody>
              <dl className="space-y-2 text-base">
                <Row label="Subtotal" value={formatMoney(order.subtotal)} />
                {order.discountTotal > 0 && (
                  <Row label="Discount" value={`−${formatMoney(order.discountTotal)}`} />
                )}
                {order.shippingTotal > 0 && <Row label="Shipping" value={formatMoney(order.shippingTotal)} />}
                {order.taxTotal > 0 && <Row label="Tax" value={formatMoney(order.taxTotal)} />}
                <div className="border-t border-line pt-2">
                  <Row label="Customer paid" value={formatMoney(order.total)} strong />
                </div>
                <Row label="Platform fee" value={`−${formatMoney(order.applicationFee)}`} muted />
                <div className="border-t border-line pt-2">
                  {/* The number the merchant actually cares about, and the one the
                      raw order row does not contain. */}
                  <Row label="You receive" value={formatMoney(order.netToMerchant)} strong />
                </div>
              </dl>
            </CardBody>
          </Card>

          {order.shippingAddress && (
            <Card>
              <CardHeader><CardTitle as="h2">Ship to</CardTitle></CardHeader>
              <CardBody>
                <address className="not-italic text-base text-ink-muted">
                  {Object.entries(order.shippingAddress)
                    .filter(([, v]) => typeof v === "string" && v)
                    .map(([k, v]) => <span key={k} className="block">{String(v)}</span>)}
                </address>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({label, value, strong, muted}: {
  label: string; value: string; strong?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={muted ? "text-ink-muted" : ""}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""} ${muted ? "text-ink-muted" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Only the transitions the server will actually accept are offered.
 *
 * The list comes from the order itself rather than being hardcoded here, so a button
 * can never appear for a move the API is going to reject — which is how a merchant
 * ends up clicking "Fulfil" on an unpaid order and being told no.
 */
function OrderActions({order, onChanged}: {order: Order; onChanged: () => Promise<void>}) {
  const toast = useToast();
  const [working, setWorking] = React.useState(false);
  const [confirmingRefund, setConfirmingRefund] = React.useState(false);

  const canFulfil = order.allowedNextStatuses.includes("fulfilled");
  const canCancel = order.allowedNextStatuses.includes("cancelled");
  const canRefund = order.allowedNextStatuses.includes("refunded");

  async function setStatus(status: string, successTitle: string) {
    setWorking(true);
    try {
      await api(`/api/orders/${order.id}`, {method: "PATCH", body: {action: "set_status", status}});
      await onChanged();
      toast.push({tone: "success", title: successTitle});
    } catch (e) {
      toast.push({tone: "danger", title: "Couldn't update the order", description: messageFor(e)});
    } finally {
      setWorking(false);
    }
  }

  async function refund() {
    setWorking(true);
    try {
      await api(`/api/orders/${order.id}`, {method: "PATCH", body: {action: "refund"}});
      setConfirmingRefund(false);
      await onChanged();
      toast.push({tone: "success", title: "Refunded", description: "The customer has been refunded in full."});
    } catch (e) {
      toast.push({tone: "danger", title: "Refund failed", description: messageFor(e)});
    } finally {
      setWorking(false);
    }
  }

  if (!canFulfil && !canCancel && !canRefund) {
    return <p className="text-sm text-ink-muted">No further action is available for this order.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canFulfil && (
          <Button loading={working} onClick={() => setStatus("fulfilled", "Marked as fulfilled")}>
            Mark fulfilled
          </Button>
        )}
        {canCancel && (
          <Button variant="secondary" loading={working}
            onClick={() => setStatus("cancelled", "Order cancelled")}>
            Cancel
          </Button>
        )}
        {canRefund && (
          <Button variant="danger" onClick={() => setConfirmingRefund(true)}>Refund</Button>
        )}
      </div>

      <Modal open={confirmingRefund} onClose={() => setConfirmingRefund(false)}
        title={`Refund ${formatMoney(order.total)}?`}
        description="The customer is refunded in full and the platform fee is returned to you. This can't be undone.">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" data-autofocus onClick={() => setConfirmingRefund(false)}>
            Keep the order
          </Button>
          <Button variant="danger" loading={working} onClick={refund}>Refund in full</Button>
        </div>
      </Modal>
    </>
  );
}
