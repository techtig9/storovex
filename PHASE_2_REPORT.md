# Phase 2 Report — AI Providers, Atomic Credits, Generation Pipeline

Date: 2026-09-03
Scope: AUDIT_REPORT.md §17 Phase 2

---

## Verification gate

| Gate | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `next lint --max-warnings=0` | **clean** |
| `jest` | **19 suites, 197 tests, all pass** (was 172) |
| `next build` with empty env | **succeeds** |
| 11 migrations from scratch | **all apply** |
| RLS isolation suite | **all assertions pass** |
| Credit ledger invariants | **all assertions pass** |
| **Credit concurrency, 20-way** | **exactly 10 of 20 granted; no over-issue** |

---

## S5 — the credit double-spend race is closed

The old `reserveJobCredits` read the balance, checked it in JavaScript, inserted a
ledger row, then updated the balance in a **separate statement**. Two concurrent
requests both read the same balance and both passed the check. A failure between the
two writes left the ledger and the balance permanently disagreeing.

Migration 11 moves all of it into locked, single-transaction Postgres functions:
`reserve_credits`, `commit_credits`, `refund_credits`, `grant_credits`, plus
`credit_balance_from_ledger` for reconciliation.

**Proof, not assertion.** `supabase/tests/credit_concurrency.sh` opens an account with
100 credits and fires 20 genuinely parallel reservations of 10 through separate
connections:

```
final balance       : 0   (expected 0)
reservations granted: 10  (expected 10)
ledger sum          : -100 (expected -100)
```

Exactly ten succeeded and ten were refused. The ledger and the balance agree.

Also enforced in the database, each with a test:
- replaying an idempotency key returns the original reservation, never a second charge
- a job cannot settle twice, in either direction — without this a retry loop could
  refund the same job repeatedly and mint credits
- a commit can never exceed its reservation
- grants are idempotent, so a redelivered billing webhook cannot double-grant
- a negative balance is rejected by the schema constraint

---

## B9 — AI generation now actually calls a provider

Before this phase there was **no provider client anywhere in the codebase**. The only
outbound HTTP call in the whole project was to Resend. `router.ts` "routed" by
returning the string `"gemini"`; `providerAdapter.ts` classified HTTP statuses that
nothing produced. Both were dead code.

Built:
- **`providers/gemini.ts`** — image generation, reference photo sent as an inline
  part, base64 decoded to bytes, usage metadata captured. The API key travels in the
  `x-goog-api-key` header, never the URL, because query strings land in access logs
  and proxy caches. There is a test asserting the key never appears in the URL.
- **`providers/chat.ts`** — Cerebras and OpenRouter share the OpenAI chat-completions
  shape; Anthropic uses the messages API with its required `anthropic-version` header.
  Models are env-overridable, so a model change is a config edit rather than a deploy.
- **`providers/http.ts`** — one place where every provider call leaves the process, so
  timeout, abort and error classification behave identically everywhere. Every call
  gets a deadline: a hung request holds a worker slot *and* keeps the user's credits
  reserved, which is the failure mode that hurts most.
- **`resilientCall.ts`** — retry with exponential backoff, and the circuit breaker that
  `providerAdapter.ts` described but nothing used. Auth and validation failures are
  not retried, because they will fail identically next time.

Every adapter takes an injectable `fetchImpl`, so all 25 provider tests run without a
network: real HTTP status mapping (429/401/400/500/503), abort-to-timeout, network
failure as a retryable outage, retry-then-succeed, no-retry-on-auth, circuit opening
and then refusing to call, and body truncation so a provider echoing the prompt back
cannot flood the logs.

**A 200 with no image is treated as a failure.** Returning success there would commit
the user's credits for nothing — which is exactly what the old pipeline did.

---

## The pipeline that never existed

`createGenerationRequest` used to reserve credits, write a row at stage `"planning"`,
and stop. Nothing ever moved it. `completeGenerationRequest` and
`failGenerationRequest` had no callers, so credits were never committed *or refunded*.
**Every generation permanently took the user's credits and returned nothing.**

Now:

1. `createGenerationRequest` estimates cost, reserves atomically, persists the request,
   and enqueues it — then returns. An HTTP request never waits on an image model. If
   the row insert or the enqueue fails, the reservation is refunded rather than left
   stranded.
2. `generationWorker.ts` claims a job, downloads the reference photo, calls the
   provider, records a real `ai_provider_events` row with measured latency and tokens,
   uploads each image to the private `generated-assets` bucket, writes `assets` rows,
   and commits credits **for what was actually delivered** — if the provider returns
   fewer images than requested, the difference returns to the user automatically.
3. On failure it refunds and dead-letters, or leaves the reservation in place for a
   retry. A job that will be retried keeps its reservation, or the retry would have
   nothing to spend.

**The contract: every job ends either committed with assets, or refunded.**

- `POST /api/jobs/process` drains the queue, guarded by a `CRON_SECRET` bearer token
  with a timing-safe compare. Without that secret set it refuses to run at all — an
  open endpoint that spends user credits would be worse than a broken one.
- `GET /api/generation/status` lets the UI poll a job. It returns a stage, never a
  provider error string, since those can echo prompt content.

---

## Deferred credentials still hold

Verified again this phase: `next build` succeeds with `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` and `CRON_SECRET` all unset. Provider
adapters call `requireIntegration()` at the point of use, so a missing key raises a
typed error naming the integration instead of calling the API with `undefined`. There
is a test for that.

New optional variables added to `.env.example`: `CRON_SECRET`, plus model overrides.

---

## Not done, and why

- **No live provider call has been made.** Every adapter is exercised against injected
  fetch responses shaped like the real APIs. I have not sent a request to Gemini,
  Cerebras, OpenRouter or Anthropic, because no keys are configured. **The first live
  call is the remaining risk in this phase** — response shapes are from the providers'
  documented formats, not from a response I have seen. Add the keys and run one
  generation before trusting it.
- **Streaming** is not implemented. Image generation is not streamed, and chat
  streaming has no consumer until the UI exists in Phase 4.
- **The circuit breaker is process-local.** On serverless that protects one warm
  instance, not the fleet. Fleet-wide breaking needs shared state and a round trip on
  every call; not worth it yet.
- **No scheduler is configured.** `/api/jobs/process` exists and is tested, but nothing
  calls it on a timer yet. A `vercel.json` cron entry is Phase 5 deployment work.
- **Migrations still not applied to hosted Supabase** — free-tier limit, unchanged from
  Phase 1. Validated against local PostgreSQL 16.

---

## Status

P0s closed this phase: **B9** (AI never ran). P1 closed: **S5** (ledger race).

Remaining from the audit: **B8** billing entitlements and **B10** email templates, both
Phase 3 by plan.

Storovex can now take a generation request, spend credits safely under concurrency,
call a real image model, store the result, and settle the ledger correctly whether the
job succeeds or fails. It cannot yet sell anything or send an email.
