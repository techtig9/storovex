"use client";
import React from "react";
import {AppShell} from "@/components/shell/AppShell";
import {Card, CardBody, CardHeader, CardTitle} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
import {Badge, EmptyState, ErrorState, Skeleton} from "@/components/ui/States";
import {PLANS, type PlanId} from "@/core/billing/plans";

type Subscription = {
  plan_id: PlanId; planName: string | null; status: string;
  billing_cycle: string; current_period_end: string | null; cancel_at_period_end: boolean;
};
type Transaction = {id: string; status: string; amount_cents: number; currency: string; occurred_at: string};
type Billing = {subscription: Subscription | null; credits: {balance: number; included: number}; transactions: Transaction[]};

export default function BillingPage() {
  const [data, setData] = React.useState<Billing | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const ac = new AbortController();
    fetch("/api/billing/subscription", {signal: ac.signal})
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(b => setData(b.data))
      .catch(e => { if (e.name !== "AbortError") setFailed(true); });
    return () => ac.abort();
  }, []);

  return (
    <AppShell activeId="billing" creditsRemaining={data?.credits.balance}>
      <header className="mb-6">
        <h1 className="text-3xl">Billing</h1>
        <p className="mt-1 text-base text-ink-muted">Your plan, credits and payment history.</p>
      </header>

      {failed && <ErrorState description="We couldn't load your billing details. Refresh to try again." />}

      {!failed && !data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" /><Skeleton className="h-40" />
        </div>
      )}

      {data && (
        <div className="space-y-8">
          <section aria-labelledby="plan-heading" className="grid gap-4 sm:grid-cols-2">
            <h2 id="plan-heading" className="sr-only">Current plan</h2>

            <Card>
              <CardHeader className="flex items-center justify-between gap-3">
                <CardTitle as="h3">Current plan</CardTitle>
                {data.subscription && (
                  <Badge tone={data.subscription.status === "active" ? "success" : "warning"}>
                    {data.subscription.status}
                  </Badge>
                )}
              </CardHeader>
              <CardBody>
                {data.subscription ? (
                  <>
                    <p className="text-2xl font-semibold">{data.subscription.planName ?? data.subscription.plan_id}</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Billed {data.subscription.billing_cycle}
                      {data.subscription.current_period_end &&
                        ` · renews ${new Date(data.subscription.current_period_end).toLocaleDateString("en-GB", {dateStyle: "medium"})}`}
                    </p>
                    {data.subscription.cancel_at_period_end && (
                      <p className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
                        Cancels at the end of this period. You keep access until then.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-base text-ink-muted">No active subscription.</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle as="h3">Credits</CardTitle></CardHeader>
              <CardBody>
                <p className="text-2xl font-semibold tabular-nums">{data.credits.balance.toLocaleString()}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  of {data.credits.included.toLocaleString()} included this period
                </p>
                {data.credits.included > 0 && (
                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full bg-surface-raised"
                    role="progressbar"
                    aria-valuenow={Math.min(100, Math.round((data.credits.balance / data.credits.included) * 100))}
                    aria-valuemin={0} aria-valuemax={100}
                    aria-label="Credits remaining"
                  >
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-emphasis"
                      style={{width: `${Math.min(100, (data.credits.balance / data.credits.included) * 100)}%`}}
                    />
                  </div>
                )}
              </CardBody>
            </Card>
          </section>

          <section aria-labelledby="plans-heading">
            <h2 id="plans-heading" className="mb-4 text-xl">Plans</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {(Object.keys(PLANS) as PlanId[]).map(id => {
                const plan = PLANS[id];
                const current = data.subscription?.plan_id === id;
                return (
                  <Card key={id} interactive={!current} className={current ? "border-brand" : undefined}>
                    <CardHeader className="flex items-center justify-between gap-2">
                      <CardTitle>{plan.name}</CardTitle>
                      {current && <Badge tone="brand">Current</Badge>}
                    </CardHeader>
                    <CardBody>
                      <p className="text-2xl font-semibold tabular-nums">
                        ${(plan.monthlyCents / 100).toFixed(0)}
                        <span className="text-sm font-normal text-ink-muted">/month</span>
                      </p>
                      <p className="mt-2 text-sm text-ink-muted">
                        {plan.includedCredits.toLocaleString()} credits · up to {plan.maxSpendPerJobCredits} per generation
                      </p>
                      {!current && (
                        <Button variant="secondary" fullWidth className="mt-4" size="sm">
                          Choose {plan.name}
                        </Button>
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="mb-4 text-xl">Payment history</h2>
            {data.transactions.length === 0 ? (
              <EmptyState title="No payments yet" description="Invoices appear here once your first payment is taken." />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left">
                    <caption className="sr-only">Payment history</caption>
                    <thead>
                      <tr className="border-b border-line">
                        <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Date</th>
                        <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Amount</th>
                        <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transactions.map(t => (
                        <tr key={t.id} className="border-b border-line last:border-0">
                          <td className="px-5 py-3 text-sm tabular-nums text-ink-muted">
                            {new Date(t.occurred_at).toLocaleDateString("en-GB", {dateStyle: "medium"})}
                          </td>
                          <td className="px-5 py-3 text-base tabular-nums">
                            {(t.amount_cents / 100).toFixed(2)} {t.currency}
                          </td>
                          <td className="px-5 py-3">
                            <Badge tone={t.status === "paid" ? "success" : t.status === "failed" ? "danger" : "neutral"}>
                              {t.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
