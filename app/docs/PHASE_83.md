# Phase 83 — Core Data Model, Projects & Team Backend

Third phase of the 5-phase plan (see PLAN.md). Implements Blueprint §6 core tables, §12 dashboard data layer, §15 Project Detail, §16 dashboard KPI cards, and team/RBAC.

## Corrective fixes (found while testing, applied before new work)
- **Table naming collision**: Phase 81 created `provider_events` and Phase 82 created `generation_requests` — but Phase 77's migration already references pre-existing `ai_provider_events` and `ai_generation_requests` tables (from phases before 74, not in this zip). Renamed Phase 81's table to `billing_webhook_events` (a genuinely distinct concern — billing webhook dedup, not AI-provider telemetry) and rewrote Phase 82's migration to `alter table ai_generation_requests add column ...` instead of creating a disconnected duplicate. `generationService.ts` and the webhook route now write to the correct tables.
- **Schema drift**: `security_events` was defined twice with different columns (Phase 76: `risk_score`, Phase 77: `severity`) using `create table if not exists`, so only the first-run version's column ever actually existed. Added a migration that ensures both columns are present regardless of which version applied.

## Included
- `profiles`, `stores`, `templates`, `projects`, `notifications`, `store_invitations` tables with RLS built on Phase 77's `is_store_member`/`store_role` helpers
- Project rules: status lifecycle (draft ⇄ active, either → archived, archived only restores to active), sort/search validation, collision-free duplicate naming (`(copy)`, `(copy 2)`, ...)
- Dashboard KPI math: activation rate, generation success rate, credits-remaining percentage (capped at 100), all with input validation
- Team invitations: owner/admin-only, no self-service owner invites, admins can't invite/modify/remove other admins or owners, last owner can't be removed, 7-day token expiry
- Projects CRUD service + 2 API routes (list/create, single-project update/duplicate/delete), dashboard KPI endpoint, team invitations endpoint
- 19 new tests (74 total passing)

## Verification
`npm test` → 9 suites / 74 tests passing. `tsc --noEmit` at the time → only the pre-existing `supabaseStorage.ts`/`jobs/worker.ts` gaps from before Phase 74; resolved in Phase 85 (see PHASE_85.md).
