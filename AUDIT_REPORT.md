# Storovex — Phase 0 Audit Report

Date: 2026-09-03
Auditor: senior product engineer / SaaS architect / security engineer / QA
Scope: full repository, both specification files, connected Figma workspace
Branch: `claude/storovex-audit-plan-19xkwt`

**No application code was modified during this audit.** Everything below was verified
by reading source, running the toolchain, or building the app. Where something was
not verified, it says so.

---

## 0. Verification performed

| Check | Command | Result |
|---|---|---|
| Dependency install | `npm install` | 425 packages, OK |
| Typecheck | `npx tsc --noEmit` | **exit 0, 0 errors** |
| Unit tests | `npx jest` | **34 suites, 288 tests, all pass** |
| Production build | `npx next build` | **succeeds, but emits every route under `/src/app/...`** |
| Secret scan | regex over `src/`, `supabase/`, `*.json`, `*.md` | **clean — no committed secrets** |
| Dead-code scan | import graph over `src/core` | **16 of 45 core modules never imported** |
| Figma inspection | `mcp__Figma__whoami` | authenticated; **blocked — see §14** |

Two claims in `PLAN.md` need correcting:

- "144/144 tests passing" — the real number is **288**, because `app/` is a
  byte-identical copy of the repo root and Jest collects both. There are 144
  *distinct* tests, each executed twice.
- "`tsc --noEmit` is now clean project-wide" — true, but `tsconfig.json` has
  `"include": ["src", "jest.setup.ts"]`, so the duplicated `app/` tree is never
  typechecked, and `next build` had never been run before this audit.

---

## 1. Current architecture

```
storovex/
├── src/app/                    Next.js 14 App Router
│   ├── (marketing)/            home, pricing            — static, no auth
│   ├── (auth)/                 login, signup            — POST to routes that DO NOT EXIST
│   ├── (dashboard)/            dashboard, generate, billing — client components, NO auth guard
│   └── api/                    13 route handlers
├── src/components/             10 React components, 100% inline-style
├── src/core/                   45 modules — pure logic + Supabase service layer
└── supabase/migrations/        13 SQL files
```

**Stack:** Next.js 14.2.35 (App Router) · React 18 · TypeScript 5.5 (strict) ·
Supabase (Postgres + Auth + Storage) · Zod · Jest + Testing Library.
No Tailwind, no CSS framework, no state manager, no animation library, no ORM,
no linter, no CI, no `next.config.js`, no `middleware.ts`, no `public/`, no `.env.example`.

### The defining structural problem

The codebase is a **library of well-written, well-tested pure functions that are
mostly never wired into the running application.** The deterministic helpers
(`estimateCredits`, `signedDelta`, `classifyProviderError`, `churnRate`,
`shouldSuppress`, `breakpointForWidth` …) are genuinely good and have real tests.
The layer that would make them a product — provider calls, auth routes, route
wiring, RLS that parses — is either missing or broken.

**16 of 45 core modules are dead code**, never imported by any route or component:

```
ai/providerAdapter.ts    ai/router.ts           email/emailService.ts
security/validation.ts   security/redaction.ts  security/requestGuard.ts
security/abuse.ts        security/sanitize.ts   security/url.ts
jobs/durableWorker.ts    storage/uploadService.ts  generation/regeneration.ts
scheduling/scheduler.ts  data/pagination.ts     launch/envCheck.ts
launch/launchChecklist.ts
```

That list includes **the entire AI layer, the entire email send path, and the
entire rate-limit / abuse / input-validation path.**

---

## 2. Product identity conflict — THE BLOCKING DECISION

This is the single most consequential finding and it needs your decision before
any Phase 1 work.

| | Repository as built | Specification files |
|---|---|---|
| Product | **AI product photography** | **AI ecommerce store builder** |
| Page title | "Storovex — AI product photography for online stores" | "Build Your Store. Launch Faster." |
| Core object | `projects` → generated image assets | `stores` → products, orders, customers |
| Core verb | Generate hero / lifestyle / campaign **images** | Build, preview, **publish a storefront** |
| Generation catalog | `product_hero`, `product_lifestyle`, `campaign`, `banner`, `social_creative` | store structure, sections, theme, copy, product content |
| Design language | 7 photography themes (Daylight Studio, Darkroom Safelight, Sepia Print) | Dark-first violet `#7C3AED` + cyan `#06B6D4` |
| Fonts | Space Grotesk + Inter + IBM Plex Mono | Inter |

The specs demand a store builder (left tools / centre live storefront canvas /
right properties + AI), a storefront preview, products, collections, orders,
customers, cart/checkout, theme customiser and template gallery. **None of that
exists, in code or in the database.** There are no `products`, `orders`,
`customers`, `collections`, `carts`, `themes`, `pages` or `sections` tables.

This is not a gap to be closed by a redesign. It is roughly 70% of a new product.
See §16 for the three options.

---

## 3. Current features — what genuinely works

Verified by reading the code and running the tests.

**Solid, keep:**
- Credit ledger arithmetic — reservation/commit/refund maths, sign conventions,
  spend caps, over-commit rejection. Well-reasoned, well-tested.
- Paddle signature verification — correct HMAC-SHA256 over `ts:body`, timing-safe
  compare, 300s replay window. Genuinely correct.
- Generation stage machine — transitions, terminal states, dead-letter after 5 attempts.
- Provider error classification + exponential backoff + circuit breaker *logic*.
- Business metrics maths — MRR/ARR/churn/margin/activation, with input guards.
- Email suppression policy — 1 complaint or 2 bounces; verification and password
  reset correctly bypass suppression.
- RBAC permission matrix — owner/admin/member, clean and correct.
- Upload validation — MIME allowlist, size caps, filename sanitisation, path isolation.
- Accessibility primitives — skip links, `aria-current`, ARIA live stage
  announcements, `prefers-reduced-motion`, visible focus rings, a High Contrast theme.
- Worker lease / heartbeat / stale-recovery SQL (phase 74) — `FOR UPDATE SKIP LOCKED`, correct.

**Wired end-to-end (route → service → DB):** projects CRUD, dashboard KPIs,
team invitations, admin overview, plan override, signed URLs, upload validation,
job limits lookup. All of these are blocked in practice by §5 and §7.

---

## 4. Missing features

**Absent entirely — required by spec:**
- Store builder (tools / canvas / properties), section editing, undo/redo, publish
- Live storefront preview, device switching, storefront rendering
- Products, variants, collections, inventory, pricing, product editor, product table
- Orders, order lifecycle, fulfilment, refunds
- Customers, profiles, order history
- Cart, checkout
- Theme customiser, template gallery, template preview/use
- Analytics dashboard UI (service exists, no page)
- Notification centre, toasts
- Settings (any), usage page, marketing pages beyond home+pricing
- Landing sections: builder preview, AI creation, templates, integrations, trust,
  social proof, FAQ, final CTA, footer nav

**Absent — infrastructure:**
- `POST /api/auth/login` and `POST /api/auth/signup` — **the login and signup pages
  fetch these and they do not exist** (`src/app/api/` has no `auth/` directory)
- `middleware.ts` — no route protection, no session refresh
- Password reset, email verification, Google OAuth, logout
- `next.config.js`, `.env.example`, `public/`, ESLint, CI, health endpoint,
  sitemap, robots, OG metadata, legal pages
- `build` / `lint` / `typecheck` npm scripts (only `test` exists)

---

## 5. Broken features

| # | What | Evidence | Sev |
|---|---|---|---|
| B1 | **Every route builds at the wrong URL.** `app/` is a byte-identical copy of the repo root; Next resolves it as the App Router root, so routes emit as `/src/app/dashboard`, `/src/app/api/generation` … The frontend fetches `/api/…`, which 404s. | `npx next build` output; verified fixed by building a copy without `app/` | **P0** |
| B2 | **Login and signup are non-functional.** Both POST to `/api/auth/*`, which does not exist. | `src/app/(auth)/login/page.tsx:18`; no `api/auth/` dir | **P0** |
| B3 | **All migrations after phase 75 fail to apply.** 34 uses of `create policy if not exists` — PostgreSQL has never supported `IF NOT EXISTS` on `CREATE POLICY`. Syntax error. | `grep -c` across `supabase/migrations/` | **P0** |
| B4 | **12 RLS policies call `public.current_store_id()`, which is never defined anywhere.** | grep: 12 call sites, 0 definitions | **P0** |
| B5 | **Migration order is broken.** 7 files share the identical version `20260816000025`. `phase74` indexes `job_queue` before migration 31 creates it; `phase77` drops policies on `ai_generation_requests` before phase 82 creates it. | filenames + file contents | **P0** |
| B6 | **No user can ever create a store.** `stores` has SELECT and UPDATE policies only — no INSERT policy, and RLS is on. There is also no trigger inserting the owner into `store_members`, so even a service-role insert leaves the owner locked out. | `phase83` migration | **P0** |
| B7 | **Both webhooks use the cookie/anon Supabase client.** Webhooks arrive with no session, so RLS rejects their inserts. `createServiceRoleClient()` exists and is never called. | `billing/webhook/route.ts`, `email/webhook/route.ts` | **P0** |
| B8 | **Paddle webhook verifies the signature but never applies entitlements.** It writes to `billing_webhook_events` and returns. No subscription row, no plan sync, no credit grant. Billing is inert. | `billing/webhook/route.ts` | **P0** |
| B9 | **AI generation never calls an AI provider.** `createGenerationRequest` reserves credits and inserts a row with `stage:"planning"`. Nothing advances it. `completeGenerationRequest` has no caller. There is no provider client anywhere in the codebase. **Users would be charged credits for nothing.** | dead-code scan; grep for `fetch(` | **P0** |
| B10 | **Resend emails will be rejected.** The payload has no `html`, `text` or `react` field (`react:undefined` is explicit), `subject` is the raw event type (`"password_reset"`), and `...input.vars` is spread into the top level of the Resend request. No templates exist. | `email/emailService.ts:17` | **P0** |
| B11 | Dashboard/generate pages send `storeId:"current"`, `accountId:"current"`, `planId:"starter"` as literal strings. `is_store_member` needs a UUID. Every dashboard request fails. | `(dashboard)/dashboard/page.tsx:24`, `generate/page.tsx:23` | **P0** |
| B12 | Rate limiting is a no-op. `fixedWindow(...)` defaults `state` to a **freshly constructed `Map`**, so with no caller passing state every request looks like the first. No route calls it anyway. | `security/rateLimit.ts`, dead-code scan | **P1** |
| B13 | `getAiUsageAndMargin` sums *all-time* credit commits against *monthly* MRR. Margin is arithmetically meaningless. | `analytics/analyticsService.ts` | **P1** |
| B14 | Fonts never load. Space Grotesk / Inter / IBM Plex Mono are declared in CSS with no `next/font`, `<link>` or `@font-face`. Everything renders in system fallbacks. | `globals.css`; no font imports | **P1** |

---

## 6. Frontend problems

- **Inline styles everywhere.** Every component styles via React `style={{}}`.
  Inline styles **cannot express `:hover`, `:focus`, `:active`, `:disabled` or
  `@media`**. This structurally blocks the spec's hover lift, button press feedback,
  responsive builder panels and breakpoint behaviour. Not a polish issue — an
  architectural blocker.
- **No responsive behaviour in the layout.** `generate/page.tsx` hard-codes
  `gridTemplateColumns:"minmax(280px,420px) 1fr"` with no media query — guaranteed
  horizontal overflow below ~700px. Sidebar collapse is driven by a JS `resize`
  listener rather than CSS, so it is wrong on first paint (SSR renders expanded).
- **Nav has 3 items** (Dashboard, Generate, Billing). Spec requires ~14.
- **Dashboard pages are `"use client"` with no auth guard** and prerender as static
  (`○` in the build output). Anyone can load `/dashboard`.
- **No design tokens matching the spec.** Current: 7 photography themes, accent
  `#2a4d46` deep green. Spec: violet `#7C3AED`, AI cyan `#06B6D4`, dark-first
  `#09090B`.
- **No semantic colour tokens.** No success/warning/error. The generate page renders
  its `role="alert"` error message in `var(--accent)` — **dark green for an error**.
- Spacing scale is `4/8/12/16/24/32/48`; spec wants `4/8/12/16/20/24/32/40/48/64/80/96/128`.
  Radius is `4/8/14`; spec wants `6/8/10/12/16/20/24`.
- **No motion system.** `motionDurationMs()` exists, is tested, and is never used.
  No transitions of any kind in the CSS.
- No `<Suspense>`, error boundaries, loading skeletons, empty states or error states.
- Of the 30 components the spec lists, **10 exist** — and none of them is `Button`,
  `Card`, `Input`, `Modal`, `Toast`, `DataTable` or `Chart`.
- `layout.tsx` `metadata` is untyped (should be `Metadata`); no OG tags, no favicon,
  no `viewport`, no theme-colour.

---

## 7. Backend problems

- **No input validation on any route.** `validation.ts` defines `promptSchema` and
  `generationRequestSchema` with Zod. Neither is imported by a route. Every handler
  reads `await req.json()` and passes fields straight through.
- **No rate limiting on any route** (B12).
- **No CSRF protection** on any state-changing route.
- `applySecurity` (method + content-type guard) is applied to **4 of 13 routes**.
  The other 9 — including `/api/generation`, `/api/projects` and
  `/api/assets/[id]/signed-url` — have no method guard and no content-type check.
- **`await req.json()` is outside every `try` block** in 6 routes. Malformed JSON
  throws an unhandled rejection → 500 with a stack trace instead of a 400.
- **Internal error strings are returned to clients.** `apiError(status, message, message)`
  in the admin routes, and `PROJECT_LIST_FAILED: <raw postgres error>` elsewhere.
  Leaks schema details.
- **No security headers on 9 of 13 routes** (`securityHeaders` only runs inside
  `apiSuccess`/`apiError`). No CSP or HSTS anywhere, even on the 4 that are covered.
- No structured logging, no request IDs, no observability, no health endpoint.
- `/api/jobs/limits` is fully unauthenticated — it discloses plan tier limits.
- `/api/security-check` is a stub returning `{protected:true}` and is dead weight.

---

## 8. Security problems

Ranked by severity. These are the ones I would not ship past.

**S1 — Signed-URL IDOR (critical).**
`POST /api/assets/[assetId]/signed-url` authorises `body.storeId` (attacker-supplied),
then signs `body.bucket` + `body.storagePath` — **also attacker-supplied, and never
checked against the asset, the store, or `params.assetId`, which is ignored entirely.**
Any authenticated user who is a member of any one store can mint a signed URL for
**any object in any private bucket**, including other tenants' generated assets,
uploads and exports. Complete cross-tenant file read.

**S2 — Credit and plan spoofing (critical).**
`POST /api/generation` takes `accountId` and `planId` from the request body.
`planId` sets `maxSpendPerJob`; `accountId` selects **which credit account is debited**.
A user can send `planId:"pro"` to raise their own spend cap, or another tenant's
`accountId` to drain their credits. Entitlements must come from the server.

**S3 — Unauthenticated email webhook (critical).**
`POST /api/email/webhook` has **no signature verification** (Resend signs with Svix;
nothing checks it). Anyone on the internet can POST a fabricated `bounced` or
`complained` event for any address. Two forged bounces add that address to
`email_suppressions`. Since only password-reset and verification bypass suppression,
this is a **targeted denial of account recovery and notification** for arbitrary users.

**S4 — Public exposure of billing webhook payloads (critical).**
`billing_webhook_events` and `plans` have **no RLS enabled**. Supabase exposes public
tables through PostgREST to anyone holding the anon key — which ships in the browser
bundle by design. `billing_webhook_events.payload` holds raw Paddle events: customer
emails, names, billing addresses, subscription and transaction data. Full PII leak.

**S5 — Credit ledger race / double-spend (high).**
`reserveJobCredits` does read-balance → check → insert ledger row → **separate**
balance update. Two concurrent requests both read the old balance and both pass the
check. The `check(balance>=0)` constraint limits the damage but does not prevent
over-reservation, and the ledger insert and balance update are not in one transaction,
so a failure between them **permanently desynchronises the ledger from the balance**.
This must be a single `SECURITY DEFINER` Postgres function.

**S6 — Webhook idempotency race (high).**
The Paddle handler does `SELECT … maybeSingle()` then `INSERT`. Two concurrent
redeliveries both see no row and both proceed. The primary key saves the second
insert, but only *after* any entitlement work would have run twice. Needs
`INSERT … ON CONFLICT DO NOTHING` and a check on rows-affected.

**S7 — No route protection (high).** No `middleware.ts`. Dashboard routes are
statically prerendered client components with no server-side session check.

**S8 — No auth flow to attack, because none exists (high).** No login/signup routes,
no session refresh, no logout, no password reset, no MFA, no OAuth. Cookie flags,
session rotation and secure-cookie policy are all undefined.

**S9 — Client-controlled state transition (medium).**
`setProjectStatus` trusts the client's `from` value, so `canTransitionStatus` can be
bypassed by lying about the current status. Read it from the database.

**S10 — Verbose error disclosure (medium).** Raw Postgres messages returned to clients (§7).

**S11 — LIKE-wildcard injection (low).** `listProjects` interpolates the search term
into `ilike('%…%')` without escaping `%` / `_`. A query of `%%%%%%%` is a cheap
CPU-burn. Sanitisation caps length only.

**S12 — No CSRF protection (medium)** on any state-changing route.

**Good news:** no committed secrets. `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`PADDLE_WEBHOOK_SECRET` and the AI keys are all read from `process.env` and never
appear in client bundles or logs. The `redact()` helper exists (though unused).

---

## 9. Database problems

- **B3/B4/B5/B6 above are all database problems and all P0.** In their current state
  these migrations have demonstrably never been applied to a real Postgres — 34
  statements are outright syntax errors and 12 reference an undefined function.
- **`store_members.store_id` has no foreign key** to `stores` (it is created in
  phase 77, before `stores` exists in phase 83). No referential integrity on the
  central tenancy table.
- **No ecommerce schema at all** — no `products`, `product_variants`, `collections`,
  `orders`, `order_items`, `customers`, `inventory`, `discounts`, `carts`, `themes`,
  `pages`, `sections`.
- **Two sources of truth for plans** — the `plans` table and the hardcoded `PLANS`
  constant in `billing/plans.ts`. `analyticsService` prices revenue from the constant,
  not the table.
- `credit_ledger` has an `idempotency_key unique` column but **no partial index** and
  no `account_id` scoping on that uniqueness.
- No `updated_at` triggers anywhere; every service sets it manually and several forget.
- No soft deletes and no audit trail on `projects` (hard `DELETE`).
- `notifications`, `store_invitations`, `assets`, `job_events` have SELECT/INSERT
  policies but no DELETE policy — rows can never be removed by users.
- No seed data, no rollback/down migrations, no backup or restore procedure documented.

---

## 10. AI problems

**The AI product does not exist.** This is the second-biggest finding after §2.

- **No provider client of any kind.** No Gemini, Cerebras, OpenRouter or Anthropic
  SDK, no `fetch` to any provider endpoint. The only outbound HTTP call in the whole
  codebase is to Resend.
- `router.ts` "routes" by returning the string `"cerebras"` or `"gemini"`.
  `providerAdapter.ts` classifies HTTP statuses that nothing produces. Both files are
  dead code.
- **No prompt construction, no system prompts, no model selection, no token
  accounting, no streaming, no timeouts, no cancellation.**
- `createGenerationRequest` **reserves credits and then does nothing.** The job sits
  at `stage:"planning"` forever. `completeGenerationRequest` and
  `failGenerationRequest` have no callers, so credits are never committed *or
  refunded*. **Every generation permanently burns the user's credits and returns
  nothing.**
- No worker actually runs. `durableWorker.ts` is dead code; there is no cron, no
  queue consumer, no serverless function, no `vercel.json`.
- Cost tracking is a `CREDIT_COST_CENTS` env guess, not measured provider spend.
- No output validation beyond "is the array non-empty", no content safety, no
  moderation, no PII handling in prompts.

---

## 11. Billing problems

- **Paddle integration is inert** (B8) — signatures verify, then the event is filed
  and nothing happens. No subscription row is created or updated, no plan is synced,
  no credits are granted, no access is revoked.
- **No checkout flow.** No Paddle client, no price IDs, no checkout URL generation.
  `PADDLE_API_KEY` is in `envCheck` and used nowhere.
- No upgrade / downgrade / proration / cancellation / reactivation logic.
- No trial handling; `trialing` is a valid status with no code path.
- No dunning or grace-period enforcement — `apply_grace_period` is a string in a map.
- No billing history, no invoices, no payment-method management.
- No credit top-ups, no expiry job (`expiry` is a ledger type with no writer).
- Entitlements are not enforced anywhere. `PlanCard`/`billing` page shows plans from
  the hardcoded constant; nothing gates a feature on a plan.
- The ledger race (S5) and webhook race (S6) are both live.

---

## 12. Email / Resend problems

- **Every send will fail** (B10): no `html`/`text`/`react` body, subject is the raw
  event key, `vars` spread into the request root.
- **No templates exist.** `emailCatalog.ts` declares 13 event types and their
  required variables; there is no rendering layer for any of them.
- **`emailService` is never called.** No signup, verification, reset, subscription,
  credit-warning, generation or invitation email is ever sent.
- **Webhook is unauthenticated** (S3).
- **No send idempotency** — the spec explicitly requires it. Nothing prevents
  duplicate sends on retry.
- Retry policy (`shouldRetrySend`, `computeRetryDelayMs`) is defined, tested, and
  never invoked — there is no retry loop.
- `from:` is hardcoded to `notifications@storovex.com`; no domain/DKIM verification
  documented, no reply-to, no unsubscribe header for non-transactional mail.
- `email_events` records `attempt:1` always; the counter is never incremented.

---

## 13. Performance & accessibility

**Performance**
- Bundle is small (87 kB shared) — but only because there is almost no UI.
- No `next/image`; no images at all. No `next/font` → FOUT plus a layout shift on
  every page once fonts are added.
- `getDashboardKpis` fires **6 sequential-ish count queries** per dashboard load.
- `getRevenueOverview` selects **every active subscription row** to sum in JS; should
  be a SQL aggregate. `getAiUsageAndMargin` selects **every commit ledger row ever**.
- `duplicateProject` selects **every sibling project name** to compute "(copy N)".
- Dashboard fetches KPIs and projects in two uncoordinated `useEffect` calls with no
  abort, no cache, no `Suspense`, no loading skeleton.
- No indexes on `email_events`, `security_events(user_id)`, or `credit_ledger(type)`.

**Accessibility** — better than the rest of the codebase, genuinely.
- Present and correct: skip links, `aria-current="page"`, ARIA live stage
  announcements, `prefers-reduced-motion`, `:focus-visible` rings, labelled theme
  select, `role="status"` / `role="alert"`, a dedicated High Contrast theme.
- Missing: automated a11y testing (no `jest-axe`), landmark coverage audit, focus
  trapping (no modals exist yet), `aria-live` for toasts (no toasts exist),
  touch-target sizing (theme select is ~24px tall, below the 44px target),
  colour-contrast verification of all 7 themes, keyboard alternative to drag-and-drop
  (no drag-and-drop exists yet), `lang` on theme-switched content, reduced-motion
  coverage for JS-driven animation.
- **Error styling is semantically wrong** — errors render in the accent colour, which
  is dark green in the default theme.

---

## 14. Figma findings — BLOCKED, needs one input from you

The connector is live and authenticated:

```
handle: Saad Saad Ali
email:  saaadaliii145490@gmail.com
plan:   "Saad Saad Ali's team" — tier: starter, seat: View
```

**I could not inspect any design, and I will not invent findings about one.**

Every Figma read tool available here (`get_metadata`, `get_design_context`,
`get_screenshot`, `get_libraries`, `search_design_system`) **requires a `fileKey`**,
and the MCP server exposes no tool to list or search the files in a team. Without a
file URL there is no way to discover what is in the workspace.

Two further constraints worth flagging now:

1. The seat is **View**, not Edit. Reads should work; writing designs back to Figma
   (`use_figma`, `create_new_file`) will not.
2. The team is on the **starter** tier, which does not include published team
   libraries or shared variables — so `search_design_system` and `get_libraries` are
   likely to return little even once a file key is supplied.

**What I need from you:** paste a Figma file URL, ideally one with a node id —
`https://figma.com/design/<fileKey>/<name>?node-id=1-2`. Given that I will inspect
pages, frames, components, typography, spacing and colour, and write
`FIGMA_DESIGN_SELECTION.md` from what is actually there.

Until then, `FIGMA_DESIGN_SELECTION.md` records a **provisional** direction derived
from the two specification files only, and says so explicitly on its first line.

---

## 15. Priority summary

**P0 — blocks any deployment (13)**
B1 routing hijack · B2 no auth routes · B3 invalid policy syntax · B4 undefined
`current_store_id()` · B5 migration ordering · B6 stores uncreatable · B7 webhooks
use anon client · B8 billing inert · B9 AI never runs · B10 email always fails ·
B11 hardcoded `"current"` ids · S1 signed-URL IDOR · S2 credit/plan spoofing

**P1 — blocks a trustworthy launch (11)**
S3 unauthenticated email webhook · S4 public billing PII · S5 ledger race ·
S6 webhook race · S7 no route protection · B12 rate limiting is a no-op ·
no input validation on any route · no CSRF · B14 fonts never load ·
inline-style architecture blocks the spec · no ecommerce schema

**P2 — quality and correctness (12)**
B13 margin maths · S9 client-controlled transitions · S10 error disclosure ·
missing FKs · plan double source of truth · N+1 and full-table-scan queries ·
no error/loading boundaries · no design tokens per spec · no motion system ·
no component library · no observability · no lint/CI

**P3 — polish (6)**
S11 LIKE wildcards · touch-target sizes · contrast verification · SEO/OG/sitemap ·
soft deletes · seed data

---

## 16. The decision I need from you

Everything in Phases 1–3 below is identical under all three options, because it is
all repair of what already exists. **Options only diverge at Phase 4.**

**Option A — Repair and complete the product that exists** (AI product photography).
Fix all P0/P1, wire real AI providers, build the missing generation workspace and
gallery, redesign to the spec's visual language. Does **not** deliver a store builder.
~4 phases. Lowest risk, fastest to revenue, contradicts the specs' scope.

**Option B — Pivot to the specified product** (AI ecommerce store builder).
Keep the auth/security/billing/credit/job foundation, replace the generation domain
with commerce: new schema for products/orders/customers/collections/themes, a
builder, a storefront renderer, cart and checkout. ~70% new build. Matches the specs.
Substantially larger; commerce correctness (inventory, payments, tax) is high-risk work.

**Option C — Both, sequenced** *(my recommendation)*.
Ship Option A first as the revenue-generating product and the proof that the
foundation is sound, then add the store builder on top of a codebase that is already
secure, tested and deployable. AI product photography is a genuinely strong wedge for
ecommerce merchants and a natural on-ramp to a store builder — and it is far easier
to sell "generate your product photos" than "replace your Shopify".

I recommend **C**, and I recommend not writing a line of Phase 4 code until you have
chosen, because Phase 4 is where the choice becomes expensive to reverse.

---

## 17. Proposed 5-phase execution order

Dependencies are strict: each phase depends on all previous ones.

### Phase 1 — Foundation repair, auth, security, multi-tenancy
*Depends on: nothing. Everything else depends on this.*

1. Delete the `app/` duplicate; add `next.config.js`, `.env.example`, `public/`,
   `middleware.ts`, and `build`/`lint`/`typecheck` npm scripts. **(fixes B1)**
2. Rewrite every migration: replace all 34 `create policy if not exists` with
   `drop policy if exists` + `create policy`; define `is_store_member`-based policies
   and delete `current_store_id()` entirely; renumber all 13 files into a correct
   linear order; add the missing `store_members → stores` FK; add a `stores` INSERT
   policy and an owner-membership trigger; enable RLS on `billing_webhook_events`
   and `plans`. **(fixes B3, B4, B5, B6, S4)**
3. Build the auth layer: signup, login, logout, session refresh in middleware,
   email verification, password reset, Google OAuth if configured. **(fixes B2, S7, S8)**
4. Fix S1 — resolve the asset by `params.assetId`, read its real bucket/path/store
   from the database, authorise *that* store. Never trust a client path.
5. Fix S2 — derive `accountId` and `planId` server-side from the authenticated
   session's store subscription. Remove both from the request body.
6. Wire the dead security layer into a single API middleware: Zod validation on every
   route, real (Postgres-backed) rate limiting, CSRF, security headers + CSP on every
   response, redacted structured logging, `req.json()` inside `try`. **(fixes B12, S10, S12)**
7. Replace the `"current"` placeholder ids with a real store context. **(fixes B11)**

**High-risk:** the migration rewrite. It must be validated against a real Postgres
before merge, not just read. **Gate:** typecheck, lint, full test suite, `next build`,
migrations applied to a scratch Supabase project, and a written IDOR/cross-tenant
test suite that fails on today's code.

### Phase 2 — AI provider integration and the generation pipeline
*Depends on: Phase 1 (auth, ownership, validated entitlements).*

1. Real provider adapters (Gemini for generation; Cerebras → OpenRouter for chat),
   behind the existing `providerAdapter` interface, with timeouts, retries, the
   circuit breaker, and measured token/cost accounting. **(fixes B9)**
2. Make the ledger atomic: one `SECURITY DEFINER` function doing balance check +
   ledger insert + balance update in a single transaction. **(fixes S5)**
3. A real worker: queue consumer driving `planning → building → generating_assets →
   finalizing → completed`, with commit-on-success and **refund-on-failure**.
4. Asset persistence to the correct private bucket, signed delivery, realtime status.

**High-risk:** the credit ledger. Needs explicit concurrency tests (parallel
reservations against one balance) and a proven no-negative-balance invariant.
**Gate:** the above plus generation success/failure/timeout/refund integration tests.

### Phase 3 — Billing, email, notifications
*Depends on: Phase 2 (credits must be real before they can be sold).*

1. Paddle end to end: checkout, subscription lifecycle, upgrade/downgrade,
   cancellation, payment failure, grace period, **entitlement sync**, billing history.
   Idempotent webhook via `ON CONFLICT DO NOTHING`. **(fixes B8, S6)**
2. Email: real templates for all 13 catalogue events, correct Resend payload, send
   idempotency, the retry loop, Svix signature verification on the webhook.
   **(fixes B10, S3)**
3. Notification centre and toasts on real events.

**High-risk:** webhook replay and entitlement drift. Needs duplicate-delivery and
out-of-order-delivery tests. **Gate:** full billing lifecycle E2E against Paddle sandbox.

### Phase 4 — Premium frontend, design system, Figma
*Depends on: Phases 1–3, and on your §16 decision.*

1. **Adopt Tailwind** (or CSS Modules) — the inline-style architecture cannot express
   hover, focus, active, disabled or media queries, and the spec requires all of them.
2. Design tokens from the selected Figma direction; `next/font` for real font loading;
   semantic success/warning/error colours; the motion token scale. **(fixes B14)**
3. Build the component library — all 30 named in the spec.
4. Rebuild every screen; add responsive behaviour at all 9 breakpoints; add loading,
   empty and error states; add the motion system.
5. Under Option B/C, this is also where the builder, storefront, products, orders,
   customers and theme customiser are built — a phase of its own in practice.

**High-risk:** the styling migration touches every component at once. Do it
component-by-component behind the existing tests, never as one commit.
**Gate:** visual QA at 320–1920px, `jest-axe` on every page, keyboard-only walkthrough,
Lighthouse, and a real browser pass.

### Phase 5 — Analytics, admin, performance, observability, launch
*Depends on: Phases 1–4.*

1. Fix the margin maths (B13) and the N+1/full-scan queries; add missing indexes.
2. Admin console UI, real analytics dashboards, audit logs.
3. Health endpoint, structured logs, request IDs, error tracking, uptime checks.
4. SEO, OG metadata, sitemap, robots, legal pages, backups and a *tested* restore.
5. The 26-step E2E from the spec, then `FINAL_RELEASE_REPORT.md` with an **evidence-based**
   readiness rating.

---

## 18. Honest assessment

The engineering that exists is careful. The pure-logic modules are well-named,
well-commented, defensively written and genuinely tested; the credit-ledger sign
conventions and the Paddle signature verification are the work of someone who was
thinking clearly about hard problems. The accessibility instincts are better than
most production SaaS.

But the product does not run. Auth has no routes, the AI has no provider, email
cannot send, billing changes nothing, the migrations do not parse, and the build
publishes every page at the wrong URL. The phase reports describe a system that was
never executed end to end — which is exactly what you would expect from a codebase
verified only by `tsc` and unit tests over its dependency-free half.

Realistic current state: **a strong foundation at roughly 25–30% of a shippable
product**, with 13 P0 defects between here and a first deploy.

I am not rating this 10/10, and I will not until there is evidence.
