# Storovex — 5-Phase Plan From the Complete SaaS Product Blueprint

Source: Storovex_Complete_SaaS_Product_Blueprint.docx (36 sections). Continues numbering from the existing Phase 74-80 delivery (security/auth/jobs/storage foundation) already in this codebase, and follows the blueprint's own §33 "Recommended Build Order" as the sequencing logic.

## Phase 81 — Billing, Credit Ledger & AI Provider Routing ✅ delivered this round
Blueprint §4 AI Provider Strategy, §5 AI Credit & Cost Architecture, §7 Paddle Billing Architecture, §25 Pricing & Plans.
- Paddle products/prices, webhook idempotency, subscription state sync (active/trialing/past_due/paused/canceled)
- Immutable credit ledger (reservation/commit/refund/adjustment/grant/expiry), per-job spend caps, idempotency keys
- Provider adapter interface, error classification, backoff, circuit breaker
- Workload routing: normal chat (Cerebras→OpenRouter), generation (Gemini), difficult tasks (Claude, optional)

## Phase 82 — AI Generation Pipeline & Secure Asset Delivery ✅ delivered this round
Blueprint §6 Supabase storage buckets, §13 AI Store Builder, §14 AI Generation Workspace, §21 Background Jobs & Reliability, and build-order item 15 (signed URL delivery).
- Signed URL delivery layer completing Phase 80's private storage foundation
- Generation job lifecycle: create idempotent job → reserve credits (Phase 81 ledger) → durable queue (Phase 74-75 worker) → provider call → validate → commit credits or refund → persist asset → realtime notify
- Generation stages (Planning → Building → Generating Assets → Finalizing), section-only regeneration, versioning
- `generation_requests`, `assets`, `job_events` tables with storage-bucket path isolation (generated-assets, project-assets, exports, public-store-assets)

## Phase 83 — Core Data Model, Projects & Team Backend ✅ delivered this round
Blueprint §6 core tables, §12 Authenticated Dashboard pages (data layer), §15 Project Detail, §16 Dashboard Cards, Team/RBAC.
- `profiles`, `stores`, `store_members`, `projects`, `templates`, `notifications` tables
- Projects CRUD API (search/filter/sort/duplicate/archive/delete), dashboard KPI aggregation, templates catalog
- Team invitations/roles built on Phase 77's RBAC, activity timeline/audit events

## Phase 84 — Transactional Email, Analytics & Admin Console ✅ delivered this round
Blueprint §8 Resend Email System, §22 Notifications, §23 Admin Console, §24 Analytics & Business Metrics.
- Resend integration: templates for every event in §8/§22, `email_events` tracking, branded template system
- Business metrics: activation rate, time-to-first-value, generation success rate, credits consumed, AI cost per customer, MRR/ARR, churn
- Admin console APIs: revenue/subscription overview, AI usage & margin dashboard, jobs/dead-letter monitoring, security events, feature flags, plan overrides with audit trail

## Phase 85 — Frontend Shell, Theming, Accessibility & Launch Hardening ✅ delivered this round

All 5 phases are now delivered. See PHASE_85.md for what's a genuine first pass vs. finished (auth integration, real store context, `next build` scaffold) — recommended next steps if you continue past this plan.
Blueprint §9 Visual Direction, §10 Global App Shell, §11 Marketing Pages, §17-19 Animation/Responsive/Accessibility, §29-32 Performance/Testing/Env/Launch Checklist, §35 Screen Inventory.
- Next.js app shell, 7-theme CSS-variable token system, responsive sidebar/topbar, breakpoint behavior
- Priority screens: Marketing Home, Pricing, Login/Signup, Dashboard, AI Generation Workspace, Billing
- Accessibility pass (keyboard nav, focus states, reduced motion, screen-reader job announcements), Core Web Vitals, DB indexing/pagination
- Full env var wiring (§31), automated launch checklist (§32), expanded integration/E2E/security/billing/load test coverage (§30)

Each phase ships with its own migration, source, `PHASE_8X.md`, and test suite, and is verified with a full `npm test` + `tsc --noEmit` pass before moving to the next — matching how Phases 74-80 were delivered.

## Post-delivery: closing the supabaseStorage.ts / worker.ts gap
Every phase from 81 onward carried the same 15 known `tsc` errors, caused by two files (`supabaseStorage.ts`, `jobs/worker.ts`) that were referenced throughout but never included in any upload. A final pass closed this: a standard `@supabase/ssr` client, a `job_queue` migration + `claim_next_job` RPC (columns taken directly from Phase 74's existing function bodies, not invented), and two real bugs it surfaced along the way — `durableWorker.ts` not forwarding `workerId` to release capacity slots, and the Paddle webhook route never actually verifying signatures despite a comment saying it should. All three fixed. **`tsc --noEmit` is now clean project-wide, 144/144 tests passing.** See PHASE_85.md for full detail.
