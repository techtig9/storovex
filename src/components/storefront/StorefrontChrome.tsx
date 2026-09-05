import React from "react";

/**
 * The header, footer and skip link every storefront page shares.
 *
 * The accent colour is set as a CSS custom property rather than interpolated into
 * class names, so the only thing that reaches the page is a value the database has
 * already constrained to `^#[0-9A-Fa-f]{6}$`. A merchant-supplied string never
 * becomes markup.
 */
export function StorefrontChrome({
  storeName, slug, tagline, logoUrl, accent, children,
}: {
  storeName: string; slug: string;
  tagline?: string | null; logoUrl?: string | null; accent?: string | null;
  children: React.ReactNode;
}) {
  const branded = accent && /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : undefined;
  return (
    <div className="min-h-screen bg-bg"
         style={branded ? ({"--storefront-accent": branded} as React.CSSProperties) : undefined}>
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <a href={`/s/${slug}`} className="flex min-w-0 items-center gap-3 underline-offset-4 hover:underline">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" width={36} height={36}
                   className="h-9 w-9 shrink-0 rounded-md object-cover" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-xl font-semibold">{storeName}</span>
              {tagline && <span className="block truncate text-sm font-normal text-ink-muted">{tagline}</span>}
            </span>
          </a>
          <a href={`/s/${slug}/cart`}
             className="inline-flex h-10 shrink-0 items-center rounded-md border border-line px-4 text-base font-medium transition-colors duration-fast hover:bg-surface-raised"
             style={branded ? {borderColor: branded, color: branded} : undefined}>
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
