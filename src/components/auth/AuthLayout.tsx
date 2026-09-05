import React from "react";

export function AuthLayout({title, subtitle, children, footer}: {
  title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
          <a href="/" className="inline-flex items-center gap-2 text-base font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs text-brand-contrast">S</span>
            Storovex
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl">{title}</h1>
          <p className="mt-1.5 text-base text-ink-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-sm text-ink-muted">{footer}</div>
        </div>
      </main>
    </div>
  );
}
