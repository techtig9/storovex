import React from "react";
import {MarketingNav, MarketingFooter} from "./Chrome";

/**
 * Shared layout for the legal pages.
 *
 * `updated` is required rather than optional: a policy with no date is one a reader
 * cannot tell is current, and that is the first thing anyone checks.
 */
export function LegalPage({
  title, intro, updated, children,
}: {title: string; intro: string; updated: string; children: React.ReactNode}) {
  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>
      <MarketingNav />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <header>
          <h1 className="text-4xl">{title}</h1>
          <p className="mt-4 text-md text-ink-muted">{intro}</p>
          <p className="mt-2 text-sm text-ink-subtle">
            Last updated <time dateTime={updated}>
              {new Date(updated).toLocaleDateString(undefined, {year: "numeric", month: "long", day: "numeric"})}
            </time>
          </p>
        </header>

        {/*
          Prose spacing is set here rather than per-page so both documents read the
          same way, and the measure stays around 70 characters for readability.
        */}
        <div className="mt-10 space-y-8 text-base leading-relaxed text-ink-muted [&_h2]:text-md [&_h2]:font-semibold [&_h2]:text-ink [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:space-y-2 [&_ul]:pl-5 [&_li]:list-disc">
          {children}
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
