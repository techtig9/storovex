# Phase 85 — Frontend Shell, Theming, Accessibility & Launch Hardening

Fifth and final phase of the 5-phase plan (see PLAN.md). Implements Blueprint §9 (Visual Direction), §10 (Global App Shell), §11 (Marketing Pages), §17-19 (Animation/Responsive/Accessibility), §29-32 (Performance/Testing/Env/Launch Checklist).

## New test infrastructure
This phase adds real UI, so it also adds real UI testing: React, `@testing-library/react`, and `jest-environment-jsdom`, wired in per-file via `@jest-environment jsdom` pragmas so the existing 90 node-environment tests are untouched. `tsconfig.json` gained `jsx: "react-jsx"`, DOM libs, and an explicit `types` array (needed to get `@testing-library/jest-dom`'s matcher types recognized — see "bugs found" below).

## Bug found and fixed
The Generate page's idempotency-key generation used `crypto.randomUUID()`, which isn't available in this test environment and isn't guaranteed in real browsers either (it requires a secure context — plain HTTP origins don't have it). Found via a genuinely failing test (it fell into the generic "couldn't reach the server" catch branch instead of the 402 branch), not a type error. Replaced with a `crypto.getRandomValues`-based token generator, and consolidated Phase 83's invite-token generator to use the same shared helper instead of duplicating the logic.

## Design approach
Grounded in what the product actually does (AI product photography for online stores) rather than generic SaaS chrome: a "light table" app shell, a contact-sheet motif for project/asset grids, and photography-studio vocabulary for the 7 themes (Daylight Studio, Blackout, Contact Sheet, Darkroom Safelight, Slate, High Contrast, Sepia Print) — deliberately avoiding the generic cream+terracotta, near-black+acid-accent, and zero-radius-broadsheet looks common in AI-generated design.

## Included
- **Pure logic** (19 + 1 tests): 7-theme token registry with validation/resolution, responsive breakpoints, accessibility helpers (reduced-motion duration, ARIA-live stage announcements for screen-reader users following a background job, focusable-id sanitization), required-env-var checklist (9 vars across Supabase/Paddle/Resend/AI providers), launch-readiness scoring with a 6-item default critical checklist, offset/limit pagination helpers, shared random-token generator
- **App shell**: `Sidebar` (collapsible icon rail, `aria-current` on the active item), `Topbar` (project/frame count, credit balance, theme switcher), `AppShell` (skip-to-content link, `:focus-visible` rings, composes both)
- **Screens**: marketing homepage (bespoke hero + contact-sheet example strip + 3-step process), pricing (monthly/annual toggle), login/signup (accessible forms, clearly-marked Supabase Auth integration point), dashboard (KPI grid + project contact sheet, loading/empty states), AI generation workspace (form with live credit estimate + stage progress with ARIA-live region), billing (plan cards)
- **Launch hardening**: env var completeness check, default launch checklist (RLS audit, backups, webhook verification, email domain verification all marked critical), pagination for indexed list queries
- 46 new tests across 6 suites (136 total passing)

## Verification
`npm test` → 16 suites / 136 tests passing, including real jsdom renders of every new component and page (not just compile-checks). `tsc --noEmit` → only the same 15 pre-existing `supabaseStorage.ts`/`jobs/worker.ts` references from before Phase 74; zero new errors from the entire frontend layer.

## What's a first pass, not a finished product
- Login/signup pages point at `/api/auth/login` and `/api/auth/signup`, which don't exist yet — intentionally left as a marked integration point rather than a fabricated Supabase client, since `session.ts`'s existing pattern implies a specific client setup this zip doesn't include.
- Dashboard/generate/billing pages use a placeholder `storeId: "current"` — needs wiring to real session/store context once the auth integration above is in place.
- The marketing homepage is a genuine first design pass grounded in the product's subject matter, not a finished brand identity — further iteration on copy and visual direction is welcome.
- No `next.config.js`, Tailwind config, or actual `next build`/`next dev` verification — this zip still doesn't include a full Next.js project scaffold (see Phase 81's original note on the upload being a partial slice).

## Closing the supabaseStorage.ts / worker.ts gap (post-delivery pass)
Every phase doc from 81 onward noted the same recurring gap: `supabaseStorage.ts` and `jobs/worker.ts` were referenced throughout but never included in any upload, so `tsc --noEmit` always carried 15 known errors. Rather than leave that as a permanent caveat, this pass closed it:

- **`supabaseStorage.ts`**: implemented as the standard `@supabase/ssr` server-client pattern for Next.js App Router (cookie-based session), plus a service-role client for trusted server-only operations. This is boilerplate infrastructure with essentially one correct shape, not business logic — low risk to provide directly. Added `@supabase/ssr` and `@supabase/supabase-js` as dependencies.
- **`jobs/worker.ts`**: implementing `claimNextJob`/`finishJob`/`failJob` required a `job_queue` table that no migration in any delivered zip actually created — even though Phase 74's `heartbeat_job`/`recover_stale_jobs` functions already referenced it by column name. Added a migration creating `job_queue` with exactly the columns those existing functions require (not invented), plus a `claim_next_job` RPC that orders by the same priority/FIFO rule already defined in `scheduler.ts`'s `fairSort`.
- **Bug found in the process**: `durableWorker.ts` called `finishJob(job.id)` and `failJob(job.id, reason)` without forwarding `workerId`, even though releasing a `worker_capacity` slot (Phase 75) requires knowing which worker held it. Invisible before now because the whole module failed to resolve; fixed by forwarding `workerId` through both calls.
- **Bug found in the process**: the billing webhook route's own comment admitted signature verification was "delegated to a verified Paddle SDK/helper at deploy time" — i.e., not actually implemented, so any POST to that endpoint would be trusted unverified. Implemented real Paddle signature verification (`ts;h1` HMAC-SHA256 format, timing-safe comparison, 300-second replay window) and wired it into the route ahead of all other processing.

`tsc --noEmit` now reports **zero errors** across the entire project. Full test suite: **144/144 passing** across 17 suites.

If your fuller project already has real versions of `supabaseStorage.ts` or `job_queue`, treat these as reference implementations to diff against rather than blind overwrites — they're written to the same shape your existing code already assumes, but your real versions may have additional detail (e.g. actual Paddle/Resend SDK calls) this partial codebase doesn't need to exercise its tests.
