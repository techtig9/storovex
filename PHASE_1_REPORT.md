# Phase 1 Report — Foundation, Auth, Security, Multi-Tenancy

Date: 2026-09-03
Branch: `claude/storovex-audit-plan-19xkwt`
Scope: AUDIT_REPORT.md §17 Phase 1

Everything below was verified by running it. Where something was not verified, it
says so explicitly.

---

## Verification gate

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **0 errors** |
| Lint | `npx next lint --max-warnings=0` | **no warnings or errors** |
| Tests | `npx jest` | **18 suites, 172 tests, all pass** |
| Production build | `npx next build` | **compiles clean, correct routes** |
| Build with empty env | `env -u ... npx next build` | **succeeds with zero credentials** |
| Migrations | 10 files → PostgreSQL 16 | **all 10 apply from scratch** |
| RLS isolation | `supabase/tests/rls_isolation.sql` | **all assertions pass** |

Before this phase: 12 of 13 migrations failed to apply, and the build published every
route under `/src/app/...`.

---

## P0 defects closed (11 of 13)

**B1 — routing hijack.** `app/` was a byte-identical copy of the repo root, which Next
resolved as the App Router root. Removed. Routes now build at `/dashboard`,
`/api/generation` and so on. Verified in the build output.

**B2 — auth routes did not exist.** Login and signup POSTed to `/api/auth/*`, which
was absent. Built: signup, login, logout, password reset, and an OAuth/email callback
that exchanges the code for a session.

**B3 — invalid policy syntax.** 34 `create policy if not exists` statements. Not valid
PostgreSQL, in any version. Replaced with `drop policy if exists` + `create policy`.

**B4 — undefined function.** 12 policies called `public.current_store_id()`, defined
nowhere. Rewritten onto `is_store_member()`.

**B5 — migration ordering.** Seven files shared the version `20260816000025`, and
`phase74` indexed `job_queue` thirty migrations before anything created it. Renumbered
into ten files in true dependency order.

**B6 — stores could not be created.** `stores` had SELECT and UPDATE policies only, no
INSERT policy, and no trigger adding the owner to `store_members`. Both added; the
test asserts a new store makes its owner an active owner-member.

**B7 — webhooks used the anon client.** Both now use the service-role client. A
webhook arrives with no session, so RLS rejected every write they attempted.

**B11 — hardcoded `"current"` ids.** Pages sent the literal string `"current"` as a
store id, which cannot match a UUID. Added `resolveStoreId()`, which verifies
membership server-side and falls back to the caller's own store.

**S1 — signed-URL IDOR (critical).** The route authorised a body-supplied store id and
then signed a body-supplied bucket and path, ignoring `params.assetId` entirely — any
member of any store could read any object in any private bucket. Now the path
parameter is the only input that selects a row; bucket, path and owning store are read
from the database, and authorisation runs against the store the asset really belongs
to. Missing and cross-tenant assets return an identical 404 so ids cannot be probed.

**S2 — credit and plan spoofing (critical).** `/api/generation` read `accountId` and
`planId` from the request body: `planId` sets the per-job spend cap, `accountId`
selects which account is billed. Both removed from the schema entirely and derived
server-side by `getEntitlement()`.

**S4 — public billing PII.** `billing_webhook_events` and `plans` had RLS disabled
while the former holds raw Paddle payloads. RLS enabled on both; the isolation test
asserts an authenticated user reads zero rows.

---

## P1 and P2 defects closed

- **S3 — unauthenticated email webhook.** Added Svix signature verification with a
  timing-safe compare and a five-minute replay window. Anyone could previously forge
  two "bounced" events to suppress any address, denying that user their notifications.
- **S6 — webhook idempotency race.** Replaced check-then-insert with an upsert whose
  primary key decides the winner.
- **S7 — no route protection.** Added `middleware.ts`: refreshes the session on every
  request, redirects anonymous users away from protected routes and signed-in users
  away from auth pages. Uses `getUser()`, never `getSession()`, because the latter only
  decodes a client-supplied cookie.
- **S9 — client-controlled state transition.** `setProjectStatus` read `from` from the
  request body, so a client could lie about the current status to bypass the transition
  rules. It now reads the current status from the database and re-checks it in the
  `WHERE` clause.
- **S10 — verbose error disclosure.** Raw Postgres messages were returned to clients.
  Internal detail is now redacted and logged; responses carry client-safe prose only.
- **S11 — ILIKE wildcard injection.** Search terms are escaped; `%%%%%%` is no longer a
  cheap way to burn CPU.
- **S12 / rate limiting (B12).** The old limiter defaulted its state to a freshly
  constructed `Map`, so every request looked like the first, and no route called it.
  Replaced with the Postgres-backed `check_api_rate_limit`, applied through one
  wrapper to every route. The test proves a limit of 5 allows exactly 5 of 7.
- **No input validation.** Every route now parses its input with a strict Zod schema.
  `readJson` caps body size and returns 400 rather than throwing an unhandled rejection.
- **Silent under-charge.** `createGenerationRequest` reserved
  `Math.min(credits, planCap)`, so a job over the plan limit was billed the cap and
  performed in full. It now refuses with `LEDGER_JOB_SPEND_LIMIT_EXCEEDED`.
- **Unauthenticated limits disclosure.** `/api/jobs/limits` took `?tier=` from the
  query string with no auth. It now returns the caller's own limits.
- **Uploads persisted nothing.** `/api/uploads` validated metadata and returned a
  message without writing a row. It now creates the record.
- **Schema integrity.** Added the missing `store_members → stores` foreign key,
  `updated_at` triggers, a profile-on-signup trigger, missing DELETE policies, and a
  partial unique index enforcing one active subscription per store.
- Removed the `/api/security-check` stub.

---

## Deferred credentials — deploy first, add keys later

You asked to add API keys in Vercel after the work is done. That is now a supported
deployment mode rather than something to be worked around.

**Nothing reads a secret at module scope.** Every credential is read inside the
function that needs it, at the moment it is needed. A missing key is a configuration
state, not a crash:

- **Build:** verified by building with `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_API_KEY`,
  `PADDLE_WEBHOOK_SECRET`, `RESEND_API_KEY` and `GEMINI_API_KEY` all unset. It compiles
  and emits every route.
- **Boot:** the server starts on an empty environment.
- **Runtime:** a feature whose key is absent raises `IntegrationNotConfiguredError`,
  which names the integration and the variables still missing.
- **`GET /api/health`** reports which integrations are configured, which are missing,
  and what each one disables. It returns **variable names only, never values** — there
  is a test asserting a configured secret's value never appears in the response.
- **`.env.example`** documents every variable and marks which are server-only.

Only Supabase is marked required; Paddle, Resend and the AI providers are optional and
degrade to a clear 503 rather than a 500.

Suggested order: deploy → set the three Supabase variables and `NEXT_PUBLIC_SITE_URL`
→ redeploy → check `/api/health` → add the rest as each phase needs them.

---

## Tests added

`src/core/__tests__/phase1-security.test.ts` — 28 tests covering open-redirect
rejection (six attack forms), ILIKE escaping, transition rules, auth schema strictness,
the deferred-credential model including the no-value-leak assertion, site-origin
handling, and the spend-cap fix.

`supabase/tests/rls_isolation.sql` — cross-tenant reads return zero rows across nine
tables; four server-only tables are invisible to authenticated users; privileged writes
are refused; plus rate limiter, worker slots, priority claiming and stale recovery.

`supabase/tests/local_harness.sql` — stands in for Supabase-managed `auth.users`,
`auth.uid()` and the `authenticated` role, so the database gate runs anywhere.

---

## Not done in Phase 1, and why

- **Google OAuth** — the provider must be enabled in the Supabase dashboard with a
  client id and secret. The callback route handles the exchange already; nothing more
  can be verified from here until those exist.
- **Migrations against hosted Supabase** — the free-tier project limit (2 of 2, `ufo`
  and `webma`) blocked creating a scratch project, and I did not touch your existing
  ones. Validated against local PostgreSQL 16 instead, which exercises the same SQL.
  **Still to do before production: apply these to the real project and re-run the
  isolation test there.**
- **CSRF tokens** — same-origin checks plus `SameSite` cookies from Supabase cover the
  realistic cases; a token scheme belongs with the form work in Phase 4.
- **The credit-ledger race (S5)** — read-modify-write on `credit_accounts.balance` is
  still not atomic. Deliberately Phase 2, where it is the headline item, because the
  fix is a `SECURITY DEFINER` function that belongs with the generation pipeline.
- **B8, B9, B10** — billing entitlements, AI providers and email templates are Phases
  2 and 3 by design. The webhook now records events idempotently and leaves a marked
  seam for entitlement application.

---

## Honest status

Phase 1 fixes what stopped Storovex running at all: it builds correctly, the database
schema applies, tenant isolation is enforced and tested, users can sign up and sign in,
and the two critical vulnerabilities are closed.

It is not yet a working product. AI generation still does not call a provider, billing
still grants nothing, and email still sends nothing — Phases 2 and 3. Two P0s from the
audit remain open by plan (B9, B10), plus B8.

Closed this phase: 11 of 13 P0s, 8 of 11 P1s.
