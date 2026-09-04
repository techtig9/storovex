import React from "react";
import {Card} from "@/components/ui/Card";
import {MarketingNav, MarketingFooter} from "@/components/marketing/Chrome";

const SHOTS = [
  {tag: "Hero", note: "Clean studio shot on a seamless background"},
  {tag: "Lifestyle", note: "Your product in a real setting"},
  {tag: "Campaign", note: "Seasonal creative with space for copy"},
  {tag: "Collection", note: "Flat-lay grids for category pages"},
  {tag: "Banner", note: "Wide storefront headers"},
  {tag: "Social", note: "Square crops that hold up small"},
];

const STEPS = [
  {n: "01", title: "Upload", body: "One reference photo of the product, taken however you can. A phone is fine."},
  {n: "02", title: "Direct", body: "Choose the shot types and the mood — bright and minimal, warm and editorial, or your existing brand style."},
  {n: "03", title: "Publish", body: "Get a full set back, sized for your product pages, ads and social posts."},
];

const FAQS = [
  {q: "Do I need a studio or a photographer?", a: "No. Storovex works from a single reference photo — the kind you can take on a phone against a plain wall."},
  {q: "Will it change what my product looks like?", a: "It shouldn't. Every generation instructs the model to preserve the product's real shape, colour and materials. Anything that comes back wrong costs you nothing — see the credits answer below."},
  {q: "What happens if a generation fails?", a: "Your credits are refunded in full, automatically. You are only charged for images that are actually delivered."},
  {q: "Can I cancel?", a: "Any time. Cancelling takes effect at the end of the period you have already paid for, and your generated images stay available."},
];

export default function MarketingHomePage() {
  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>
      <MarketingNav />

      <main id="main" tabIndex={-1}>
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:px-8">
          <p className="animate-fade-up text-xs font-semibold uppercase tracking-[0.12em] text-brand">
            One upload, a full shoot
          </p>
          <h1 className="mt-4 max-w-3xl animate-fade-up text-4xl sm:text-5xl lg:text-6xl">
            Your product, shot a dozen ways — without a studio.
          </h1>
          <p className="mt-5 max-w-xl animate-fade-up text-md text-ink-muted sm:text-lg">
            Upload one reference photo. Storovex generates hero shots, lifestyle scenes and
            campaign creative in your store&rsquo;s style — sized and ready to publish.
          </p>
          {/* Anchors rather than buttons: these navigate, and a keyboard user
              expects Enter on a link to follow it. */}
          <div className="mt-8 flex animate-fade-up flex-col gap-3 sm:flex-row">
            <a
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-brand px-6 text-md font-semibold text-brand-contrast transition-colors duration-fast hover:bg-brand-hover"
            >
              Start generating
            </a>
            <a
              href="/pricing"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong px-6 text-md font-semibold text-ink transition-colors duration-fast hover:bg-surface-raised"
            >
              See pricing
            </a>
          </div>
        </section>

        <section aria-labelledby="shots-heading" className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
          <h2 id="shots-heading" className="sr-only">What Storovex generates</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SHOTS.map((s, i) => (
              <Card key={s.tag} interactive className="p-5" style={{animationDelay: `${i * 60}ms`}}>
                <div className="mb-4 aspect-[4/3] rounded-lg border border-line bg-surface-raised" aria-hidden="true" />
                <p className="text-base font-semibold">{s.tag}</p>
                <p className="mt-1 text-sm text-ink-muted">{s.note}</p>
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
                <dd className="mt-2 text-base text-ink-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl">Start with one product</h2>
            <p className="mx-auto mt-3 max-w-lg text-md text-ink-muted">
              See what a full set looks like for something you already sell.
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
