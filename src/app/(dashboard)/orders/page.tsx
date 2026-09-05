"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {Input, Select} from "@/components/ui/Input";
import {EmptyState, ErrorState, Skeleton} from "@/components/ui/States";
import {DataTable, type Column} from "@/components/merchant/DataTable";
import {OrderStatusBadge} from "@/components/merchant/StatusBadge";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";

type Order = {
  id: string; orderNumber: number; email: string;
  status: string; total: number; createdAt: string;
};

const PAGE_SIZE = 25;

export default function OrdersPage() {
  return (
    <AppShell activeId="orders">
      <OrdersScreen />
    </AppShell>
  );
}

function OrdersScreen() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();
  const [rows, setRows] = React.useState<Order[]>([]);
  const [total, setTotal] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const params = new URLSearchParams({page: String(page), pageSize: String(PAGE_SIZE)});
        if (search.trim()) params.set("search", search.trim());
        if (status) params.set("status", status);
        const data = await api<{orders: Order[]; total: number}>(
          `/api/orders?${params}`, {signal: controller.signal});
        setRows(data.orders);
        setTotal(data.total);
        setState("ready");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(messageFor(e));
        setState("error");
      }
    }, search ? 300 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [search, status, page]);

  const columns: Column<Order>[] = [
    {
      key: "number", header: "Order",
      render: o => (
        <a href={`/orders/${o.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
          #{o.orderNumber}
        </a>
      ),
    },
    {key: "email", header: "Customer", secondary: true, render: o => <span className="text-ink-muted">{o.email}</span>},
    {key: "status", header: "Status", render: o => <OrderStatusBadge status={o.status} />},
    {
      key: "date", header: "Placed", secondary: true,
      render: o => (
        <time dateTime={o.createdAt} className="text-sm text-ink-muted">
          {new Date(o.createdAt).toLocaleDateString()}
        </time>
      ),
    },
    {key: "total", header: "Total", align: "right", render: o => formatMoney(o.total)},
  ];

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl">Orders</h1>
        <p className="mt-1 text-base text-ink-muted">
          {total === 0 ? "Orders placed on your storefront." : `${total} order${total === 1 ? "" : "s"}.`}
        </p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_14rem]">
        <Input label="Search" type="search" placeholder="Order number or email"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="pending_payment">Awaiting payment</option>
          <option value="paid">Paid</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="failed">Payment failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </Select>
      </div>

      {state === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only" role="status">Loading orders</span>
          {Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {state === "error" && (
        <ErrorState as="h2" description={error ?? "We couldn't load your orders."}
          action={<Button onClick={() => setPage(p => p)}>Try again</Button>} />
      )}

      {state === "ready" && rows.length === 0 && !search && !status && (
        <EmptyState as="h2" title="No orders yet"
          description="When someone buys from your storefront, their order appears here." />
      )}

      {state === "ready" && (rows.length > 0 || search || status) && (
        <>
          <DataTable caption="Your orders" columns={columns} rows={rows}
            rowKey={o => o.id} emptyMessage="No orders match those filters." />
          {lastPage > 1 && (
            <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
              <Button variant="secondary" size="sm" disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}>Previous</Button>
              <p className="text-sm text-ink-muted">Page {page} of {lastPage}</p>
              <Button variant="secondary" size="sm" disabled={page >= lastPage}
                onClick={() => setPage(p => p + 1)}>Next</Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
