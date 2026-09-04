# Storovex — Revised Plan

Date: 2026-09-04
Supersedes the Option C decision in AUDIT_REPORT.md §16.

That decision was made before either of us knew the live database existed. Now that
it has been audited, the direction is settled: **Storovex is the AI-assisted
ecommerce marketplace described in the specification files**, not the AI product
photography tool the repository was building.

This document records what the live schema actually is, what of the four completed
phases survives that change, and what the real build order should be.

---

## 1. What Storovex actually is

The `storovex` database describes a **multi-tenant commerce marketplace with
AI features**, and it is further along in design than the repository was.

### Marketplace, not single-tenant SaaS

```
orders.application_fee_amount     -- Storovex takes a platform fee per sale
orders.stripe_payment_intent_id   -- Stripe, not Paddle
payment_events.stripe_event_id    -- Stripe webhook ledger
```

That is **Stripe Connect**: merchants sell, Storovex takes a cut. This is a
materially different billing architecture from the Paddle subscription flow built in
Phase 3 — it needs connected accounts, payouts, and per-transaction fees, not just a
plan a customer subscribes to.

### One basket can span several stores

`carts` has no `store_id`. `cart_items` points at a `variant_id`, and variants belong
to stores. `order_groups(id, email)` then owns many `orders`, each with its own
`store_id` and `order_number`.

So a shopper fills one cart across multiple merchants, checks out once, and it splits
into one order per store. That is a genuine marketplace, and it shapes cart,
checkout, payment-splitting and fulfilment design.

### Real commerce primitives already exist

Four functions in the database are correct work that should be kept:

| Function | What it does |
|---|---|
| `try_reserve_stock(variant, qty)` | Atomic conditional decrement; returns false rather than overselling |
| `release_stock(variant, qty)` | Returns reserved stock |
| `next_order_number(store)` | Per-store sequential order numbers |
| `increment_discount_usage(discount)` | Usage counting |

`order_items` snapshots `title`, `sku` and `price` at purchase time — the right call,
and one plenty of commerce schemas get wrong.

### AI is metered per feature

```
credit_usage(store_id, feature, credits_spent, status)
assistant_messages(store_id, role, content, sequence)   -- an AI assistant
product_video_ads(product_id, video_url, has_music, has_voiceover, status)
```

So AI is not one generation pipeline but several credit-charged features, with video
ad generation as a concrete first one.

---

## 2. Findings in the live schema

Independent of the incident, the audit surfaced these. Ranked by severity.

**S1 — 19 of 22 tables have RLS enabled with zero policies.**
This is not a leak; RLS with no policy denies everything. It means something else:
the application cannot use the Supabase client for any of those tables at all, so
either every query runs as service role — with **no database-enforced tenant
isolation** — or the app does not work. For a marketplace where merchants must never
see each other's orders, policies are the whole game. This is the single largest
piece of outstanding work on the database.

**S2 — all six functions have a mutable `search_path`.**
Flagged by Supabase's own linter. A function without a pinned `search_path` can be
made to resolve a different table than intended by a caller who controls the schema
search order. Every one needs `set search_path = public`.

**S3 — stock can be reserved but never expires.**
`try_reserve_stock` decrements immediately and correctly. Nothing releases it if the
shopper abandons the cart, so abandoned baskets permanently consume inventory until
someone calls `release_stock` by hand. Needs a reservation record with an expiry and
a sweeper.

**S4 — leaked-password protection is disabled** in Supabase Auth. One toggle.

**Schema gaps** (things the specs require that no table covers): product `slug`/handle
for storefront URLs, refunds, shipping and fulfilment, cart expiry, inventory audit
trail, and store themes or page structure for the builder.

**`pg_trgm` is installed in `public`** rather than its own schema. Minor.

---

## 3. What survives the change of direction

Roughly two thirds of the completed work is domain-agnostic and carries over intact.

### Carries over unchanged

- **Auth** — signup, login, logout, password reset, OAuth callback, `middleware.ts`
  route protection, open-redirect guard, uniform anti-enumeration responses.
- **API hardening** — the `withApi` wrapper: method and content-type guards, body
  size caps, Postgres-backed rate limiting, security headers, error handling that
  never leaks internals. Every route needs this regardless of domain.
- **Supabase clients** — server, browser and middleware, with the service-role split.
- **Deferred credentials** — build and boot with an empty environment,
  `GET /api/health`, and the live `verify-integrations` preflight.
- **Job queue and durable worker** — leases, heartbeats, stale recovery, priority
  claiming. Directly reusable for AI video ad generation.
- **The entire frontend design system** — Tailwind tokens, 22 components, the app
  shell, accessibility work, `jest-axe` coverage, responsive verification.
- **Test and deployment infrastructure** — 287 tests, live provider contract tests,
  the SQL bundle tooling, `DEPLOYMENT.md`.

### Needs rework

- **Billing: Paddle → Stripe Connect.** The webhook idempotency pattern and the
  entitlement-application design survive; the provider, the connected-account model
  and the fee handling do not. This is the largest single rewrite.
- **Email templates.** The mechanism, idempotency and retry logic survive. The
  thirteen events become commerce events: order confirmation, shipping, refund,
  merchant payout, low stock.
- **Tenancy.** My `stores`/`store_members`/`profiles` are replaced by their
  `stores`/`store_team_members`/`users`. `is_store_member()` and `store_role()` port
  across with renamed tables.
- **Credits.** Their model is `subscriptions.credits_remaining` plus a `credit_usage`
  log. My atomic reserve/commit/refund ledger is stronger — it survives double-settle
  and concurrent spend — and is worth adopting, but must be reconciled with their
  existing functions rather than dropped on top.

### Does not carry over

- The generation domain: shot types, `estimateCredits`, the photography prompt
  builder, `ai_generation_requests`.
- The Gemini image adapter, though `providers/http.ts`, `resilientCall.ts` and the
  error classification (including the HTTP-400-means-auth fix) are provider-agnostic
  and stay.
- Photography-specific pages: the generate workspace, the project list.

---

## 4. Revised phases

Phase numbering restarts, since the earlier plan targeted a different product.

### Phase A — Recover and secure the database
*Blocked on the backup restore.*

1. Restore `stores` and `subscriptions`, and the 14 foreign keys.
2. **Write RLS policies for all 22 tables.** Merchant-scoped through
   `store_team_members`; public read for published storefront data; server-only for
   `payment_events`, `audit_logs` and `credit_usage`.
3. Pin `search_path` on all six functions.
4. Enable leaked-password protection.
5. Port the cross-tenant isolation test suite to this schema — it is the same shape,
   pointed at `store_team_members`.

**Gate:** cross-tenant reads return zero rows for every table, proven by test.

### Phase B — Wire the surviving backend to the real schema
1. Repoint auth, `resolveStoreId` and the RBAC helpers at
   `store_team_members`/`users`.
2. Keep `withApi` and rate limiting; rebuild the route surface around commerce.
3. Products, variants, images, collections and categories: CRUD behind ownership checks.

### Phase C — Cart, checkout and orders
1. Cart lifecycle with expiry, and stock reservation that releases on expiry (S3).
2. Stripe Connect: connected accounts, payment intents with `application_fee_amount`,
   the multi-store split into `order_groups` → `orders`.
3. Signed Stripe webhooks into `payment_events`, idempotent on `stripe_event_id` —
   the same insert-first pattern already proven in the Paddle handler.
4. Order lifecycle, refunds, fulfilment.

**Gate:** an end-to-end purchase across two stores, with a deliberate payment failure
and a deliberate refund, both verified against the ledger.

### Phase D — AI features
1. Credit metering on the atomic model, reconciled with `try_decrement_credits`.
2. AI video ads through the existing job queue and worker.
3. The AI assistant over `assistant_messages`.

### Phase E — Storefront and builder
1. Public per-store storefront: product pages, collections, cart, checkout.
2. The merchant builder UI, on the existing design system.

### Phase F — Analytics, admin, launch
As before: observability, admin console, SEO, performance, full E2E.

---

## 5. What is not decided

- **Whether AI product photography stays as a feature.** `product_video_ads` shows
  AI media generation is in scope; the Gemini image work could become "generate
  product images" inside the builder rather than being discarded. Worth a decision
  before Phase D.
- **Whether the repository's existing code is migrated or restarted.** My
  recommendation is migrated: the auth, security, job and frontend layers are tested
  and would cost weeks to rebuild, and the parts that do not fit are cleanly
  separable.
- **Whether merchants also pay a subscription** on top of the marketplace fee.
  `subscriptions.credits_remaining` suggests yes, for AI features. Restoring that
  table will confirm its shape.
