# Storovex — Design System Report

Date: 2026-09-03
Phase 4

---

## Why Tailwind replaced inline styles

The previous frontend styled every component with React `style={{}}` objects. Inline
styles **cannot express `:hover`, `:focus`, `:active`, `:disabled`, or `@media`** — not
awkwardly, at all. That made the specification's hover lift, button-press feedback,
focus rings and responsive panels literally unreachable, and it is why the old shell
measured `window.innerWidth` in a resize listener instead: JavaScript was the only
tool it had for a breakpoint, so the server rendered one layout and the client
corrected it after hydration, visible as a jump on every load.

Every component in this phase is Tailwind over CSS custom properties.

## Tokens

Colours are CSS custom properties, so one `data-theme` attribute reskins the app and
Tailwind classes stay theme-agnostic (`bg-surface`, not `bg-zinc-900`).

| Role | Light | Dark |
|---|---|---|
| Brand | `#7c3aed` | `#8b5cf6` |
| Brand hover | `#6d28d9` | `#a78bfa` |
| AI accent | `#0891b2` | `#22d3ee` |
| Background | `#fafafa` | `#09090b` |
| Surface | `#ffffff` | `#111113` |
| Raised | `#f4f4f5` | `#18181b` |
| Line | `#e4e4e7` | `#27272a` |
| Ink | `#18181b` | `#fafafa` |
| Ink muted | `#52525b` | `#a1a1aa` |
| Success / Warning / Danger | `#047857` / `#b45309` / `#dc2626` | `#34d399` / `#fbbf24` / `#f87171` |

Two deliberate departures from the specification's literal values:

1. **Semantic colours are darkened in light mode.** The spec lists `#10B981`,
   `#F59E0B`, `#EF4444`. As text on a white surface those give roughly 2.5:1, 2.2:1 and
   3.8:1 — all below the 4.5:1 WCAG AA threshold. The darker variants above clear it.
   The spec's values are kept for dark mode, where they are the ones that work.
2. **A third theme, `high-contrast`, is carried over** from the previous design system.
   It is an accessibility affordance, not a style, and dropping it would have been a
   regression.

Type: Inter, self-hosted via `next/font` with `display: swap`. The previous stylesheet
named Space Grotesk, Inter and IBM Plex Mono and loaded **none of them**, so every page
silently rendered in system fallbacks.

Spacing follows the 8px scale. Radius 6–24px. Motion: fast 150ms, normal 220ms,
emphasis 360ms, marketing 560ms, all `transform`/`opacity` only, all disabled under
`prefers-reduced-motion`.

## Components

`Button` (7 variants × 3 sizes, loading and disabled states), `Card` / `CardHeader` /
`CardBody` / `CardTitle`, `MetricCard`, `Input` / `Select` / `Textarea`, `Modal`,
`Toast` + `ToastProvider`, `Badge`, `EmptyState`, `ErrorState`, `Skeleton`,
`ProjectList`, `GenerationForm`, `GenerationProgress`, `AppShell`, `Sidebar`,
`ThemeToggle`, `AuthForm`, `AuthLayout`, `MarketingNav`, `MarketingFooter`.

Decisions worth recording:

- **A loading button stays focusable and reports `aria-busy`.** Removing it from the
  tab order mid-interaction strands a keyboard user.
- **Label, hint and error live inside the field component.** Making them the caller's
  job is how forms end up with inputs that have no accessible name.
- **Error toasts never auto-dismiss.** Hiding a failure the user may not have read is
  how people miss that their work did not save. Successes dismiss after six seconds.
- **`CardTitle` takes an `as` prop.** Hard-coding `h3` produced a real heading-order
  violation on pricing, caught by axe.
- **Status is never colour alone.** Every badge carries a text label.

## Responsive

CSS, not JavaScript. The sidebar is a persistent rail from `lg` and a drawer below it.
Wide content — tables — scrolls inside its own container so the page body never
scrolls horizontally.

Verified in a real browser (Chromium) at 320, 390, 768, 1280 and 1920 across home,
pricing and login: **15 combinations, zero horizontal overflow, zero console errors.**

## Accessibility

Automated `jest-axe` checks on every component group and every page, all passing.
Beyond that: skip links, one `h1` per page and no skipped levels, visible focus rings
via `:focus-visible`, a focus-trapping dialog that restores focus to its trigger, live
regions for job progress and toasts, `autocomplete` hints password managers
understand, 44px touch targets on `md` and `lg` controls, and full
`prefers-reduced-motion` support.

## What is not built

The specification's store-builder inventory — builder canvas, storefront preview,
products, orders, customers, collections, theme customiser — is deliberately absent.
Per AUDIT_REPORT §16 (Option C), Phase 4 dresses the AI product photography product;
the store builder is the Phase 6+ track.
