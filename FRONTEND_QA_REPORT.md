# Storovex — Frontend QA Report

Date: 2026-09-03
Phase 4

Everything below was executed. Nothing here is an estimate.

## Automated

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `next lint --max-warnings=0` | clean |
| `jest` | 18 suites, **287 tests**, all pass |
| `jest-axe` | every component group and page, **0 violations** |
| `next build` (empty environment) | succeeds |

## Browser

Chromium, production build, real navigation.

| Viewport | Home | Pricing | Login |
|---|---|---|---|
| 320 | pass | pass | pass |
| 390 | pass | pass | pass |
| 768 | pass | pass | pass |
| 1280 | pass | pass | pass |
| 1920 | pass | pass | pass |

**15/15 combinations: no horizontal overflow, no console errors.**

`/icon.svg`, `/robots.txt` and `/sitemap.xml` all return 200. A missing favicon was the
one 404 the first browser pass surfaced; it is fixed.

## Bugs found and fixed during this phase

1. **Modal focus never reached the dialog.** The autofocus line read
   `panel?.querySelector("[data-autofocus]")?.focus() ?? panel?.focus()`. `focus()`
   returns `undefined`, so the `??` fallback *always* ran and pulled focus straight
   back onto the panel. Found by a focus assertion, not by looking.
2. **Modal cleanup fired on every render.** The effect depended on `onClose`, which
   callers pass as an inline arrow — a new function each render — so the effect
   re-ran constantly and its focus-restoring cleanup fired at the wrong times.
   `onClose` now lives in a ref.
3. **Focus was "restored" to `<body>`.** When a dialog opens programmatically,
   `document.activeElement` is the body; restoring there strands a keyboard user at
   the top of the page. Now guarded, and the target is checked for `isConnected`
   since the trigger may have unmounted.
4. **Heading-order violation on pricing** — `CardTitle` was hard-coded to `h3` under
   an `h1`. Caught by axe; `CardTitle` now takes an `as` prop.
5. **`aria-label` on a bare `div`** in the toast viewport is a prohibited ARIA
   attribute. Caught by axe; it now carries `role="region"`.
6. **Light-mode semantic colours failed contrast.** The spec's `#10B981` / `#F59E0B` /
   `#EF4444` are 2.2–3.8:1 as text on white. Darkened for light mode only.

## Regression

The four database suites were re-run after the frontend work and all pass. All four
are now **re-runnable**: they reset their own fixtures first, including the rate-limit
bucket and worker rows that previously carried state between runs and made a second
run fail for the wrong reason. Verified by running each three times in succession.

## Not verified

- **No visual regression baseline.** Screenshots were reviewed by eye at 1280 and 390;
  there is no automated pixel diff.
- **No real screen-reader pass.** `jest-axe` catches machine-checkable violations, not
  whether a flow makes sense when heard. VoiceOver/NVDA testing remains outstanding.
- **No Lighthouse run.** Bundle sizes are small (~93 kB first load) but Core Web
  Vitals have not been measured on real hardware.
- **Dashboard, generate and billing were not browser-tested**, only unit-tested. They
  require an authenticated session, which needs a live Supabase project — still
  blocked on the free-tier limit.
