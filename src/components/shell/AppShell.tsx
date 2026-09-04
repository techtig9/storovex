"use client";
import React from "react";
import {Sidebar} from "./Sidebar";
import {ThemeToggle} from "./ThemeToggle";
import {NAV_ITEMS} from "./navItems";
import {Button} from "@/components/ui/Button";
import {ToastProvider} from "@/components/ui/Toast";
import {cn} from "@/components/ui/cn";

/**
 * Application shell.
 *
 * Responsive behaviour is CSS, not JavaScript. The previous shell measured
 * window.innerWidth in a resize listener, which meant the server rendered one layout
 * and the client corrected it after hydration — visible as a jump on every load.
 * Here the sidebar is simply hidden below lg and presented as a drawer instead.
 */
export function AppShell({
  activeId, storeName = "Your store", creditsRemaining, headerActions, children,
}: {
  activeId: string;
  storeName?: string;
  creditsRemaining?: number;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <ToastProvider>
      <a href="#main" className="skip-link">Skip to content</a>

      <div className="flex min-h-screen bg-bg">
        {/* Persistent sidebar from lg upward. */}
        <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">
          <Sidebar items={NAV_ITEMS} activeId={activeId} storeName={storeName} />
        </aside>

        {/* Below lg the same navigation becomes a drawer. */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
            <div className="absolute inset-y-0 left-0 w-64 animate-slide-in-right border-r border-line bg-surface">
              <Sidebar items={NAV_ITEMS} activeId={activeId} storeName={storeName} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur">
            <Button
              variant="ghost" size="sm" className="lg:hidden"
              aria-expanded={drawerOpen}
              aria-controls="primary-navigation"
              onClick={() => setDrawerOpen(o => !o)}
            >
              <span className="sr-only">{drawerOpen ? "Close navigation" : "Open navigation"}</span>
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M3 5.5h14M3 10h14M3 14.5h14" strokeLinecap="round" />
              </svg>
            </Button>

            <div className="ml-auto flex items-center gap-3">
              {typeof creditsRemaining === "number" && (
                <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-1 text-xs font-medium text-ink-muted sm:inline-flex">
                  <span className="tabular-nums text-ink">{creditsRemaining.toLocaleString()}</span> credits
                </span>
              )}
              {headerActions}
              <ThemeToggle />
            </div>
          </header>

          <main id="main" tabIndex={-1} className={cn("flex-1 px-4 py-6 sm:px-6 lg:px-8")}>
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
