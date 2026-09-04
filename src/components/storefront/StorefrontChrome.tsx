import React from "react";

/** The header, footer and skip link every storefront page shares. */
export function StorefrontChrome({
  storeName, slug, children,
}: {storeName: string; slug: string; children: React.ReactNode}) {
  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <a href={`/s/${slug}`} className="text-xl font-semibold underline-offset-4 hover:underline">
            {storeName}
          </a>
          <a href={`/s/${slug}/cart`}
             className="inline-flex h-10 items-center rounded-md border border-line px-4 text-base font-medium transition-colors duration-fast hover:bg-surface-raised">
            Basket
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-ink-subtle sm:px-6 lg:px-8">
          <span>{storeName} — powered by Storovex</span>
          <span className="flex gap-4">
            <a href="/terms" className="underline-offset-2 hover:underline">Terms</a>
            <a href="/privacy" className="underline-offset-2 hover:underline">Privacy</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
