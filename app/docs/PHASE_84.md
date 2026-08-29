# Phase 84 — Transactional Email, Analytics & Admin Console

Fourth phase of the 5-phase plan (see PLAN.md). Implements Blueprint §8 (Resend Email System), §22 (Notifications), §23 (Admin Console), §24 (Analytics & Business Metrics).

## Bugs found and fixed while testing
Two of my own Phase 84 test assertions were wrong, not the implementation: `"too short"` is 9 characters (the 10-character minimum correctly rejected it — the test's `.not.toThrow()` expectation was the bug), and `isDeadLetterQueueUnhealthy(1, 0)` asserted an impossible state (1 dead-lettered job out of 0 total) should return `true`, when the function correctly rejects it as invalid input. Both fixed by correcting the test cases, not loosening the validation.

## Included
- Email catalog: 13 event types (welcome, verification, password reset, subscription lifecycle, credit warnings, generation results, team invitations) each with required template variables validated before send; password reset/verification always bypass the suppression list, everything else respects it
- Suppression rules: any spam complaint or 2+ hard bounces suppress a recipient; bounded exponential retry (max 3 attempts) for failed sends
- Business metrics: MRR/ARR (from normalized monthly amounts), churn rate, AI cost per customer, margin %, time-to-first-value — all with input validation
- Admin console: platform-admin authorization *separate from* per-store RBAC (a new `platform_admins` table — this is TechTig's internal console, not a store owner's dashboard), feature-flag evaluation with stable percentage rollout, dead-letter queue health check, plan overrides that require a ≥10-character documented reason and write an audit event
- `email_events`, `email_suppressions`, `platform_admins`, `feature_flags`, `admin_audit_events` tables
- 3 API routes: Resend delivery webhook, admin overview (revenue/AI margin/jobs health), audited plan override
- 21 new tests (90 total passing)

## Verification
`npm test` → 10 suites / 90 tests passing. `tsc --noEmit` at the time → only the pre-existing `supabaseStorage.ts`/`jobs/worker.ts` gaps from before Phase 74; resolved in Phase 85 (see PHASE_85.md).
