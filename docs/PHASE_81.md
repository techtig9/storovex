# Phase 81 — Billing, Credit Ledger & AI Provider Routing

First phase of the 5-phase plan generated from the Storovex Complete SaaS Product Blueprint (see PLAN.md). Implements Blueprint §4 (AI Provider Strategy), §5 (AI Credit & Cost Architecture), §7 (Paddle Billing Architecture) and §25 (Pricing & Plans).

## Included
- Plan catalog (Starter/Mid/Pro) with monthly/annual pricing and per-plan included credits and per-job spend caps
- Immutable credit ledger primitives: reservation, commit (with automatic partial refund), refund, balance computation
- Insufficient-credit and per-job spend-limit enforcement
- Paddle webhook event → entitlement action mapping, idempotent event handling, subscription status normalization and access rules (active/trialing/past_due retain access; paused/canceled do not)
- AI provider adapter: error classification (rate_limit/timeout/auth/validation/provider_outage/permanent), retry eligibility, bounded exponential backoff, circuit breaker (closed/open/half_open)
- AI workload router: normal conversation (Cerebras → OpenRouter fallback on recoverable errors only), generation (Gemini, isolated from chat routing), difficult/bigger tasks (Claude when configured, else safe fallback)
- `credit_accounts`, `credit_ledger`, `plans`, `subscriptions`, `provider_events` tables with tenant-isolated RLS
- Paddle webhook API route wiring the above together
- Automated tests (22 new tests, 39 total passing)

## Fixes to existing code found while establishing a test baseline
- Added missing `zod` dependency (Phase 79's `validation.ts` imports it but it wasn't declared anywhere) — Phase 79 tests could not run before this fix.
- Fixed `safeFilename` in Phase 80's `uploadSecurity.ts`: path-traversal input like `"../../secret file.png"` sanitized to `"_.._secret_file.png"` instead of the intended `"secret_file.png"`. Now takes the last path segment before sanitizing, so embedded `../` sequences are dropped rather than turned into stray underscored artifacts.
- Added `tsconfig.json` `paths` alias for `@/*` so the existing `@/core/...` imports resolve.

## Known gaps carried over from before Phase 74 (resolved in Phase 85)
`supabaseStorage.ts` and `jobs/worker.ts` were not present in this zip when this phase was delivered — see PHASE_85.md for how that was closed (real `@supabase/ssr` client, a `job_queue` migration, and a `claim_next_job` RPC). `tsc --noEmit` is now clean project-wide.

## Correction applied in Phase 83
This phase's migration originally created a table named `provider_events`. Phase 83 found this collided conceptually with a pre-existing `ai_provider_events` table (referenced by Phase 77 but not created in this zip) and renamed it to `billing_webhook_events` — a distinct, correctly-scoped table. See PHASE_83.md for details.
