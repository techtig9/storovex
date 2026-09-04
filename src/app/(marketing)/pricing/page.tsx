import React from "react";
import type {Metadata} from "next";
import {Card, CardBody, CardHeader, CardTitle} from "@/components/ui/Card";
import {Badge} from "@/components/ui/States";
import {MarketingNav, MarketingFooter} from "@/components/marketing/Chrome";
import {PLANS, priceForCycle, ANNUAL_DISCOUNT_PCT, type PlanId} from "@/core/billing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple credit-based pricing. You're only charged for images that are actually delivered.",
};

const ORDER: PlanId[] = ["starter", "mid", "pro"];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>
      <MarketingNav />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <header className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl">Pricing</h1>
          <p className="mt-4 text-md text-ink-muted sm:text-lg">
            Every plan includes a monthly credit allowance. Credits are spent per image,
            and refunded in full if a generation doesn&rsquo;t complete.
          </p>
        </header>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {ORDER.map(id => {
            const plan = PLANS[id];
            const annualPerMonth = Math.round(priceForCycle(id, "annual") / 12);
            const recommended = id === "mid";
            return (
              <Card key={id} interactive className={recommended ? "border-brand" : undefined}>
                <CardHeader className="flex items-center justify-between gap-2">
                  <CardTitle as="h2">{plan.name}</CardTitle>
                  {recommended && <Badge tone="brand">Most popular</Badge>}
                </CardHeader>
                <CardBody>
                  <p className="text-4xl font-semibold tabular-nums">
                    ${(plan.monthlyCents / 100).toFixed(0)}
                    <span className="text-base font-normal text-ink-muted">/month</span>
                  </p>
                  <p className="mt-1.5 text-sm text-ink-subtle">
                    ${(annualPerMonth / 100).toFixed(0)}/month billed annually — save {ANNUAL_DISCOUNT_PCT}%
                  </p>

                  <ul className="mt-6 space-y-2.5 text-base">
                    <li className="flex gap-2.5">
                      <Tick /> <span><strong className="tabular-nums">{plan.includedCredits.toLocaleString()}</strong> credits each month</span>
                    </li>
                    <li className="flex gap-2.5">
                      <Tick /> <span>Up to <strong className="tabular-nums">{plan.maxSpendPerJobCredits}</strong> credits per generation</span>
                    </li>
                    <li className="flex gap-2.5"><Tick /> <span>All six shot types</span></li>
                    <li className="flex gap-2.5"><Tick /> <span>Automatic refund on failed generations</span></li>
                  </ul>

                  <a
                    href="/signup"
                    className={
                      recommended
                        ? "mt-7 inline-flex h-11 w-full items-center justify-center rounded-md bg-brand px-4 text-base font-semibold text-brand-contrast transition-colors duration-fast hover:bg-brand-hover"
                        : "mt-7 inline-flex h-11 w-full items-center justify-center rounded-md border border-line-strong px-4 text-base font-semibold text-ink transition-colors duration-fast hover:bg-surface-raised"
                    }
                  >
                    Start with {plan.name}
                  </a>
                </CardBody>
              </Card>
            );
          })}
        </div>

        <p className="mt-10 max-w-2xl text-sm text-ink-subtle">
          Credit costs vary by shot type and quality — a draft banner costs less than a
          high-quality collection. The exact cost is shown before you start a generation.
        </p>
      </main>

      <MarketingFooter />
    </div>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 20 20" className="mt-1 h-4 w-4 shrink-0 text-success" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 10.5 4 4 8-9" />
    </svg>
  );
}
