"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Button} from "@/components/ui/Button";
import {Card, CardBody, CardHeader, CardTitle} from "@/components/ui/Card";
import {MetricCard} from "@/components/ui/MetricCard";
import {Select} from "@/components/ui/Input";
import {EmptyState, ErrorState} from "@/components/ui/States";
import {api, messageFor} from "@/core/ui/apiClient";
import {formatMoney} from "@/core/commerce/money";

type Comparison = {current: number; previous: number; changePct: number | null};
type Analytics = {
  periodDays: number;
  revenue: Comparison;
  orders: Comparison;
  netToMerchant: number;
  platformFees: number;
  averageOrderValue: number;
  refundRatePct: number;
  topProducts: {productId: string; title: string; unitsSold: number; revenue: number}[];
};

export default function DashboardPage() {
  return (
    <AppShell activeId="dashboard">
      <DashboardScreen />
    </AppShell>
  );
}

/**
 * Renders a period-over-period change.
 *
 * `changePct` is null when the previous period was zero, and that is deliberate:
 * growth from nothing is not a percentage. Showing "up ∞%" or "up 100%" for a
 * store's first sale is a number somebody would act on, so it says what actually
 * happened instead.
 */
function trend(c: Comparison): {hint: string; tone: "neutral" | "positive" | "negative"} {
  if (c.changePct === null) {
    return c.current > 0
      ? {hint: "First activity in this period", tone: "positive"}
      : {hint: "No activity in either period", tone: "neutral"};
  }
  if (c.changePct === 0) return {hint: "Unchanged on the period before", tone: "neutral"};
  const direction = c.changePct > 0 ? "up" : "down";
  return {
    hint: `${direction} ${Math.abs(c.changePct)}% on the period before`,
    tone: c.changePct > 0 ? "positive" : "negative",
  };
}

function DashboardScreen() {
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState<Analytics | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string>();

  const load = React.useCallback(async (period: number) => {
    setState("loading");
    try {
      setData(await api<Analytics>(`/api/analytics?days=${period}`));
      setState("ready");
    } catch (e) {
      setError(messageFor(e));
      setState("error");
    }
  }, []);

  React.useEffect(() => { void load(days); }, [load, days]);

  const loading = state === "loading";
  const revenueTrend = data ? trend(data.revenue) : null;
  const ordersTrend = data ? trend(data.orders) : null;
  const noSales = state === "ready" && data !== null && data.orders.current === 0;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Dashboard</h1>
          <p className="mt-1 text-base text-ink-muted">Your store at a glance.</p>
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
        <ErrorState as="h2" description={error ?? "We couldn't load your figures."}
          action={<Button onClick={() => void load(days)}>Try again</Button>} />
      )}

      {state !== "error" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard loading={loading} label="Revenue"
              value={data ? formatMoney(data.revenue.current) : "—"}
              hint={revenueTrend?.hint ?? "Paid and fulfilled orders"}
              tone={revenueTrend?.tone} />
            <MetricCard loading={loading} label="Orders"
              value={data?.orders.current ?? "—"}
              hint={ordersTrend?.hint ?? "Paid and fulfilled orders"}
              tone={ordersTrend?.tone} />
            <MetricCard loading={loading} label="You received"
              value={data ? formatMoney(data.netToMerchant) : "—"}
              hint={data ? `After ${formatMoney(data.platformFees)} in platform fees` : "After platform fees"} />
            <MetricCard loading={loading} label="Average order"
              value={data ? formatMoney(data.averageOrderValue) : "—"}
              hint="Revenue divided by paid orders" />
          </div>

          {noSales && (
            <div className="mt-6">
              <EmptyState as="h2" title="No sales in this period"
                description="Once orders come in, revenue, your best sellers and refund rate all appear here."
                action={<Button onClick={() => { window.location.href = "/products"; }}>
                  Go to your products
                </Button>} />
            </div>
          )}

          {state === "ready" && data && data.topProducts.length > 0 && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader><CardTitle as="h2">Best sellers</CardTitle></CardHeader>
                <CardBody>
                  <ol className="divide-y divide-line">
                    {data.topProducts.map((p, i) => (
                      <li key={`${p.productId}-${i}`} className="flex items-center justify-between gap-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-ink-subtle">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.title}</p>
                            <p className="text-sm text-ink-muted">
                              {p.unitsSold} sold
                            </p>
                          </div>
                        </div>
                        <p className="shrink-0 tabular-nums">{formatMoney(p.revenue)}</p>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>

              <Card>
                <CardHeader><CardTitle as="h2">Refunds</CardTitle></CardHeader>
                <CardBody>
                  <p className="text-3xl font-semibold tabular-nums">{data.refundRatePct}%</p>
                  <p className="mt-1.5 text-base text-ink-muted">
                    of orders in the last {data.periodDays} days were refunded.
                  </p>
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}
