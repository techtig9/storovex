import React from "react";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs text-brand-contrast">S</span>
          Storovex
        </a>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <a href="/pricing" className="rounded-md px-3 py-2 text-base font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink">
            Pricing
          </a>
          <a href="/login" className="rounded-md px-3 py-2 text-base font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink">
            Log in
          </a>
          <a href="/signup" className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-base font-semibold text-brand-contrast transition-colors duration-fast hover:bg-brand-hover">
            Start free
          </a>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-10 text-sm text-ink-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>Storovex — sell online, without building a shop.</p>
        <p>&copy; {new Date().getFullYear()} Storovex</p>
      </div>
    </footer>
  );
}
