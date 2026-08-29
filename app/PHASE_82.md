# Phase 82 — AI Generation Pipeline & Secure Asset Delivery

Second phase of the 5-phase plan (see PLAN.md). Implements Blueprint §6 (storage buckets), §13 (AI Store Builder), §14 (AI Generation Workspace), §21 (Background Jobs & Reliability), and build-order item 15 (signed URL delivery).

## Included
- Signed URL policy: which of the 6 buckets require signing, TTL bounds (5 min default / 60 min max), tenant-isolated `bucket/store/project/asset/filename` paths reusing Phase 80's filename sanitizer
- Publish guard: only `project-assets`/`generated-assets` may ever move into the public `public-store-assets` bucket
- Generation catalog: 6 generation types × 3 quality tiers with deterministic credit estimates, aspect-ratio validation
- Generation stage machine: `planning → building → generating_assets → finalizing → completed`, with `failed` reachable from any non-terminal stage but no stage-skipping; dead-letter after 5 attempts; provider-output validation before anything is persisted
- Section-only regeneration (hero/product_grid/collections/footer/full) with version incrementing, so regenerating one section can't silently overwrite the others
- Service layer wiring the pipeline to Phase 81's credit ledger: reserve on request creation, commit on success, refund (with dead-letter marking) on failure
- `generation_requests`, `assets`, `job_events` tables with tenant-isolated RLS
- Two API routes: create generation request, issue signed URL for a private asset
- 16 new tests (55 total passing)

## Verification
`npm test` → 8 suites / 55 tests passing. `tsc --noEmit` at the time → only the pre-existing `supabaseStorage.ts` / `jobs/worker.ts` gaps from before Phase 74; resolved in Phase 85 (see PHASE_85.md), after which the whole project compiles clean.

## Correction applied in Phase 83
This phase's migration originally created a table named `generation_requests`. Phase 83 found this was a disconnected duplicate of a pre-existing `ai_generation_requests` table (referenced by Phase 77 but not created in this zip) and rewrote the migration to extend `ai_generation_requests` instead. `generationService.ts` now writes to `ai_generation_requests`. See PHASE_83.md for details.
