"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {MetricCard} from "@/components/ui/MetricCard";
import {Select} from "@/components/ui/Input";
import {Badge, ErrorState} from "@/components/ui/States";
import {DataTable, type Column} from "@/components/merchant/DataTable";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";

type StoreRow = {
  id: string; name: string; slug: string; createdAt: string;
  payoutsConnected: boolean; orders: number; gmv: number;
};
type Overview = {
  periodDays: number; storeCount: number; userCount: number; productCount: number;
  grossMerchandiseValue: number; platformRevenue: number; paidOrders: number;
  storesWithoutPayouts: number; stores: StoreRow[];
};

export default function AdminPage() {
  return (
    <AppShell activeId="admin">
      <AdminScreen />
    </AppShell>
  );
}

function AdminScreen() {
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState<Overview | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async (period: number) => {
    setState("loading");
    try {
      setData(await api<Overview>(`/api/admin?days=${period}`));
      setState("ready");
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    }
  }, []);

  React.useEffect(() => { void load(days); }, [load, days]);

  const columns: Column<StoreRow>[] = [
    {
      key: "store", header: "Store",
      render: s => (
        <div className="min-w-0">
          <a href={`/s/${s.slug}`} className="font-medium underline-offset-2 hover:underline">{s.name}</a>
          <p className="text-sm text-ink-muted">/{s.slug}</p>
        </div>
      ),
    },
    {
      key: "payouts", header: "Payouts",
      render: s => s.payoutsConnected
        ? <Badge tone="success">Connected</Badge>
        : <Badge tone="warning">Not connected</Badge>,
    },
    {key: "orders", header: "Orders", secondary: true, align: "right", render: s => s.orders},
    {key: "gmv", header: "Sales", align: "right", render: s => formatMoney(s.gmv)},
  ];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Platform</h1>
          <p className="mt-1 text-base text-ink-muted">Every store on Storovex.</p>
        </div>
        <div className="w-44">
          <Select label="Period" value={String(days)} onChange={e => setDays(Number(e.target.value))}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </Select>
        </div>
      </header>

      {state === "error" && (
        <ErrorState as="h2"
          description={error ?? "We couldn't load the platform figures."}
          action={<Button onClick={() => void load(days)}>Try again</Button>} />
      )}

      {state !== "error" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard loading={state === "loading"} label="Marketplace sales"
              value={data ? formatMoney(data.grossMerchandiseValue) : "—"}
              hint="What shoppers paid across every store" />
            <MetricCard loading={state === "loading"} label="Platform revenue"
              value={data ? formatMoney(data.platformRevenue) : "—"}
              hint="Your fee on those sales — not the same number" />
            <MetricCard loading={state === "loading"} label="Stores"
              value={data?.storeCount ?? "—"}
              hint={data
                ? `${data.storesWithoutPayouts} can't take payment yet`
                : "Total stores on the platform"}
              tone={data && data.storesWithoutPayouts > 0 ? "negative" : "neutral"} />
            <MetricCard loading={state === "loading"} label="Paid orders"
              value={data?.paidOrders ?? "—"}
              hint={data ? `${data.productCount} products, ${data.userCount} accounts` : "In this period"} />
          </div>

          {state === "ready" && data && (
            <div className="mt-6">
              <h2 className="mb-3 text-md font-semibold">Stores by sales</h2>
              <DataTable caption="Every store on the platform, ranked by sales"
                columns={columns} rows={data.stores} rowKey={s => s.id}
                emptyMessage="No stores have been created yet." />
              {data.storeCount > data.stores.length && (
                <p className="mt-3 text-sm text-ink-muted">
                  Showing the top {data.stores.length} of {data.storeCount} stores.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
