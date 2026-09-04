# Storovex — Release Report

Date: 2026-09-04
Branch: `claude/storovex-audit-plan-19xkwt`

---

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `next lint --max-warnings=0` | **clean** |
| `jest` | **5 suites, 106 tests, all pass** |
| `next build` with an empty environment | **succeeds** |
| Local database suites | RLS isolation, storefront isolation, draft inheritance, stock reservation — **all pass** |
| Browser, 5 viewports × 3 pages | **0 horizontal overflow, 0 console errors** |
| `jest-axe` | **0 violations** |

**Every database result above is against a local reconstruction of the live schema,
not the live project.** That distinction matters and is not hedging: see §4.

---

## 1. What exists

### Foundation (unchanged since the earlier phases, all still passing)
Auth — signup, login, logout, password reset, OAuth callback, `middleware.ts` route
protection, open-redirect guard, anti-enumeration responses. The `withApi` wrapper —
method and content-type guards, body size caps, Postgres-backed rate limiting,
security headers, error handling that never leaks internals. Deferred credentials,
`GET /api/health`, and a live integration preflight. The Tailwind design system: 22
components, dark/light/high-contrast themes, verified accessibility.

### Database security (Phase A — written, tested locally, **not applied**)
30 RLS policies. Merchants scoped through `store_team_members`; anonymous shoppers
see published products, their variants, images, ready video ads, collections and
categories; eight financial and cross-store tables are server-only. `search_path`
pinned on all six of the owner's existing functions. Stock reservations now expire.

### Commerce (Phases B and C)
Money in integer minor units throughout. Pricing, discount validation that reports
*why* it refused, and totals arithmetic in one place. Checkout that reserves stock
before writing an order and releases everything on failure. Stripe Connect: one
payment intent per store, platform fee deducted in transit, refunds reversing both
transfer and fee. A webhook idempotent on `stripe_event_id`. Products API with
full-text search and delta-based stock adjustment.

### AI (Phase D)
Credit metering built on the owner's existing `try_decrement_credits` and
`refund_credits` rather than replacing them, with `credit_usage` as the audit trail
and a status guard so a retry cannot refund twice. Video ad generation driven off
`product_video_ads.status`, claimed conditionally so two workers cannot generate the
same ad. An assistant grounded in the merchant's real catalogue, ordered by the
`sequence` column rather than timestamps.

### Storefront (Phase E)
Public per-store storefront and product pages, reading through the anon client so RLS
is what decides visibility. Anonymous basket keyed by a browser-held token.
Per-product metadata and Open Graph tags.

### Analytics (Phase F)
Merchant analytics computed from real orders: GMV and platform revenue kept separate,
average order value, refund rate, period-over-period comparison, top products merged
by snapshotted title.

---

## 2. Decisions worth knowing

- **Money never touches a float.** `19.99 * 100` is `1998.9999…` in binary floating
  point; truncating loses a cent on every order. The platform fee rounds **down**,
  because rounding up takes more than the agreed rate out of someone else's sale.
- **A failed checkout releases every reservation it took.** A partially fulfilled
  basket is worse than a failed one: the shopper is charged for part of what they
  wanted and told nothing about the rest.
- **Refunds reverse the platform fee too.** Keeping a cut of a cancelled sale leaves
  the merchant out of pocket for a sale that never happened.
- **Variants and images inherit visibility from their product**, so an unpublished
  product cannot leak its price through a variant.
- **`order_groups` is server-only even for merchants** — it spans stores, so a
  merchant reading it would learn their customer also bought from a competitor.
- **Discounts have no public read**, or anyone could enumerate every code.
- **Stock is exposed to shoppers as a boolean**, not a count: publishing exact
  inventory tells competitors your sales volume.
- **Analytics refuse impossible inputs** and return `null` rather than `Infinity` for
  growth from zero. A metric that silently divides by zero is worse than an absent
  one, because somebody will act on it.

---

## 3. Bugs found by testing, not by reading

1. **Google reports an invalid API key as HTTP 400, not 401** — found by probing the
   live API. Classification was calling a misconfigured key a malformed request.
2. **`el?.focus() ?? panel?.focus()`** — `focus()` returns `undefined`, so the
   fallback always ran and pulled focus back out of the dialog.
3. **A modal effect depending on `onClose`** re-ran every render, firing its
   focus-restoring cleanup at the wrong times.
4. **`CardTitle`, `EmptyState` and `ErrorState` hardcoded `h3`**, producing real
   heading-order violations under a page `h1`. Caught by axe, twice.
5. **`aria-label` on a bare `div`** in the toast viewport — prohibited ARIA.
6. **Light-mode semantic colours failed contrast** at 2.2–3.8:1 against white.
7. **`get diagnostics ok = row_count > 0`** — invalid PL/pgSQL, found only by
   executing it.

---

## 4. What is not verified, and what is not built

**Not applied to the live database.** `stores` and `subscriptions` remain missing
after my reset script destroyed them (`INCIDENT_2026-09-04_schema_reset.md`). The
backup restore did not take effect. Until the owner supplies the original schema SQL,
every database claim here rests on a local reconstruction, and two columns the code
assumes — `stores.slug` and `stores.stripe_account_id` — are **inferred, not known**.

**No live third-party call has succeeded.** Stripe, Resend and the AI providers are
exercised against injected responses shaped like their documented APIs. Nothing has
been charged, sent or generated.

**Not built:**
- The merchant UI for products, orders, discounts and the AI assistant. The APIs
  exist and are tested; the screens do not.
- The visual store builder. This is the largest single remaining piece.
- Cart and checkout **pages** — the API and the add-to-basket control exist, the
  basket and payment screens do not.
- Fulfilment, shipping and refund flows beyond the webhook status transitions.
- Admin console, structured logging with request IDs, and error tracking.
- Transactional email. The Paddle-era templates were retired with the photography
  domain and commerce equivalents have not been written.
- Legal pages.

---

## 5. Honest state

The backend is in good shape: the commerce, credit and payment logic is carefully
reasoned and thoroughly tested at the unit level, and the security model is written
and proven against a faithful local copy of the schema.

What it is not is a running product. No screen exists for a merchant to add a product
or view an order, no shopper can complete a purchase through the UI, and none of it
has touched the real database or a real payment.

Two things unblock everything else: **the `stores` and `subscriptions` SQL**, and a
**Stripe test key**. With those, the next session can apply the security work, run
every suite against the real project, and put a real payment through in test mode.

I am not rating this production-ready. It is a well-tested foundation with a
substantial amount of interface still to build.
