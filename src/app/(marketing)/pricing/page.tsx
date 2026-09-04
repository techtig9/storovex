import React from "react";
import type {Metadata} from "next";
import {Card, CardBody, CardHeader, CardTitle} from "@/components/ui/Card";
import {MarketingNav, MarketingFooter} from "@/components/marketing/Chrome";
import {DEFAULT_FEE_BASIS_POINTS} from "@/core/commerce/checkoutService";

export const metadata: Metadata = {
  title: "Pricing",
  description: "No monthly fee to open a store. Storovex takes a small percentage of each sale.",
};

export default function PricingPage() {
  const feePercent = (DEFAULT_FEE_BASIS_POINTS / 100).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>
      <MarketingNav />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <header className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl">Pricing</h1>
          <p className="mt-4 text-md text-ink-muted sm:text-lg">
            Nothing to pay to open a store or list products. Storovex takes {feePercent}% of each
            sale, and you keep the rest.
          </p>
        </header>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle as="h2">Selling</CardTitle></CardHeader>
            <CardBody>
              <p className="text-4xl font-semibold tabular-nums">
                {feePercent}%<span className="text-base font-normal text-ink-muted"> per sale</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-base">
                <li className="flex gap-2.5"><Tick /> <span>Unlimited products and collections</span></li>
                <li className="flex gap-2.5"><Tick /> <span>Your own storefront</span></li>
                <li className="flex gap-2.5"><Tick /> <span>Payouts direct to your Stripe account</span></li>
                <li className="flex gap-2.5"><Tick /> <span>No fee until you make a sale</span></li>
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle as="h2">AI features</CardTitle></CardHeader>
            <CardBody>
              <p className="text-4xl font-semibold tabular-nums">
                Credits<span className="text-base font-normal text-ink-muted"> as you use them</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-base">
                <li className="flex gap-2.5"><Tick /> <span>AI video ads for your products</span></li>
                <li className="flex gap-2.5"><Tick /> <span>An assistant that knows your catalogue</span></li>
                <li className="flex gap-2.5"><Tick /> <span>Charged per generation, refunded if one fails</span></li>
              </ul>
              <p className="mt-6 text-sm text-ink-subtle">
                Credit pricing is shown in your dashboard before you spend anything.
              </p>
            </CardBody>
          </Card>
        </div>

        <p className="mt-10 max-w-2xl text-sm text-ink-subtle">
          Stripe&rsquo;s own processing fees apply to every transaction and are set by Stripe,
          not by Storovex.
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
