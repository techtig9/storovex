import React from "react";
import {Card} from "@/components/ui/Card";
import {MarketingNav, MarketingFooter} from "@/components/marketing/Chrome";
import {DEFAULT_FEE_BASIS_POINTS} from "@/core/commerce/checkoutService";

/**
 * The marketing home page.
 *
 * Every claim here maps to something the code actually does. The previous version
 * sold AI product photography, which this codebase is no longer — a front door
 * advertising a product that does not exist is worse than a plain one.
 */

const FEATURES = [
  {
    title: "Your own storefront",
    body: "A public shop at your own address, with your name, logo, colour and an about section. Shoppers browse and buy without ever seeing a Storovex login.",
  },
  {
    title: "Products, priced and stocked",
    body: "Variants with their own prices and stock, images, and a publish switch. Nothing is visible to shoppers until you publish it.",
  },
  {
    title: "Payments straight to you",
    body: "Connect Stripe once. Customers pay you directly, with the platform fee deducted in transit — and returned to you in full if you refund.",
  },
  {
    title: "Orders you can actually work",
    body: "Fulfil, cancel or refund. An unpaid order can't be marked fulfilled, and a refunded one is final — the shop can't get into a state that loses money.",
  },
  {
    title: "Discounts and shipping",
    body: "Percentage or fixed codes with limits and expiry, flat-rate postage with a free-over threshold, and a tax rate. Shoppers see the real total in the basket, not at the payment step.",
  },
  {
    title: "A team, with real roles",
    body: "Staff run products and orders. Only managers refund, see billing or change who has access.",
  },
];

const STEPS = [
  {n: "01", title: "Open your shop", body: "Pick a name and an address. Your storefront exists from that moment."},
  {n: "02", title: "Add what you sell", body: "Products, prices, stock and photos. Publish when you're ready — not before."},
  {n: "03", title: "Connect Stripe", body: "So money reaches your bank account rather than sitting somewhere in between."},
];

const FAQS = [
  {
    q: "What does it cost?",
    a: "Nothing to open a shop or list products. Storovex takes a percentage of each sale, and you keep the rest. If you refund an order, the fee on it comes back to you too — we don't keep a cut of a sale that didn't happen.",
  },
  {
    q: "Where does the money go?",
    a: "To your own Stripe account, on Stripe's normal payout schedule. Storovex never holds your takings.",
  },
  {
    q: "Can I sell before connecting Stripe?",
    a: "You can build and publish your shop, but nobody can pay you until Stripe is connected — so do that before you share the link.",
  },
  {
    q: "What are the AI features?",
    a: "Video ads for your products, and an assistant that answers questions about your own catalogue. Both cost credits, and a generation that fails refunds them automatically.",
  },
  {
    q: "Is my shop separate from everyone else's?",
    a: "Yes, and it's enforced in the database rather than only in the app. One seller cannot read another's orders even if the application asked it to.",
  },
];

export default function MarketingHomePage() {
  const feePercent = (DEFAULT_FEE_BASIS_POINTS / 100).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>
      <MarketingNav />

      <main id="main" tabIndex={-1}>
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:px-8">
          <p className="animate-fade-up text-xs font-semibold uppercase tracking-[0.12em] text-brand">
            No monthly fee — {feePercent}% of what you sell
          </p>
          <h1 className="mt-4 max-w-3xl animate-fade-up text-4xl sm:text-5xl lg:text-6xl">
            Sell online, without building a shop.
          </h1>
          <p className="mt-5 max-w-xl animate-fade-up text-md text-ink-muted sm:text-lg">
            Open a storefront, list what you sell and take payment. Money goes straight to
            your own Stripe account — Storovex takes {feePercent}% of each sale and nothing else.
          </p>
          {/* Anchors rather than buttons: these navigate, and a keyboard user
              expects Enter on a link to follow it. */}
          <div className="mt-8 flex animate-fade-up flex-col gap-3 sm:flex-row">
            <a
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-brand px-6 text-md font-semibold text-brand-contrast transition-colors duration-fast hover:bg-brand-hover"
            >
              Open your shop
            </a>
            <a
              href="/pricing"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong px-6 text-md font-semibold text-ink transition-colors duration-fast hover:bg-surface-raised"
            >
              See pricing
            </a>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
          <h2 id="features-heading" className="sr-only">What you get</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Card key={f.title} interactive className="p-5" style={{animationDelay: `${i * 60}ms`}}>
                <p className="text-base font-semibold">{f.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="how-heading" className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
            <h2 id="how-heading" className="text-3xl">How it works</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {STEPS.map(s => (
                <div key={s.n}>
                  <span className="font-mono text-xs font-semibold text-brand">{s.n}</span>
                  <h3 className="mt-2 text-lg">{s.title}</h3>
                  <p className="mt-2 text-base text-ink-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 id="faq-heading" className="text-3xl">Questions</h2>
          <dl className="mt-8 space-y-6">
            {FAQS.map(f => (
              <div key={f.q} className="border-b border-line pb-6 last:border-0">
                <dt className="text-md font-semibold">{f.q}</dt>
                <dd className="mt-2 text-base leading-relaxed text-ink-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl">Start with one product</h2>
            <p className="mx-auto mt-3 max-w-lg text-md text-ink-muted">
              You can have something for sale in a few minutes, and it costs nothing until
              somebody buys it.
            </p>
            <a
              href="/signup"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-brand px-6 text-md font-semibold text-brand-contrast transition-colors duration-fast hover:bg-brand-hover"
            >
              Create an account
            </a>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
