

## Phase 74
Production-durable worker leases, heartbeats, stale-job recovery and durable queue operations.


## Phase 75
Worker concurrency, rate-limit and resource-control foundation with plan-aware limits, atomic capacity slots and fair scheduling.


## Phase 76
Abuse prevention and API rate limiting with database-backed buckets, security events, risk scoring, burst protection and rate-limit headers.


## Phase 77
Central authentication/session checks, store membership RBAC, resource ownership protection, security events and hardened RLS.


## Phase 78
Secure API gateway primitives, request validation, security headers, sensitive-data redaction and API audit events.


## Phase 79
Centralized strict input validation, payload/file limits, safe filenames, URL validation and validation-event auditing.


## Phase 80
Secure file-upload foundation with validation, private-storage metadata, ownership RLS and isolated storage paths.


## Phase 81
Billing, immutable credit ledger, Paddle webhook entitlement mapping and AI provider routing/circuit-breaker foundation. First of the 5-phase plan in PLAN.md.


## Phase 82
AI generation job pipeline (stage machine, credit-ledger-integrated create/complete/fail flow, dead-letter policy), section-only regeneration/versioning, and signed-URL secure asset delivery. Second of the 5-phase plan.


## Phase 83
Core data model (profiles/stores/templates/projects/notifications/store_invitations), projects CRUD + dashboard KPI backend, team invitations and role-change/removal safety rules. Also corrects a Phase 81/82 table-naming collision with the pre-existing schema and a Phase 76/77 security_events schema-drift bug. Third of the 5-phase plan.


## Phase 84
Transactional email (Resend) with suppression-list and retry policy, business/analytics metrics (MRR/ARR/churn/AI margin), and a platform-admin console (feature flags, audited plan overrides, jobs health) with its own authorization separate from store RBAC. Fourth of the 5-phase plan.


## Phase 85
Frontend: 7-theme design system, accessible app shell, and all 6 priority screens (marketing home, pricing, login/signup, dashboard, AI generation workspace, billing) with real jsdom-rendered component tests. Fixed a crypto.randomUUID availability bug found via testing. Fifth and final phase of the 5-phase plan.

## Post-delivery closing pass
Closed the recurring `supabaseStorage.ts`/`jobs/worker.ts` gap noted in every phase doc since 81: added a real `@supabase/ssr` client, a `job_queue` migration + `claim_next_job` RPC, fixed a `durableWorker.ts` bug (missing `workerId` forwarding) and a Paddle webhook route that never actually verified signatures. `tsc --noEmit` is now clean across the whole project (0 errors); 144/144 tests passing. See PLAN.md and PHASE_85.md.
