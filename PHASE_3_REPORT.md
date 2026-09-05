# Phase 3 Report — Billing, Email, Notifications

Date: 2026-09-03
Scope: AUDIT_REPORT.md §17 Phase 3

Per the Option C decision in AUDIT_REPORT §16, this phase covers billing, email and
notifications. Orders and customers belong to the ecommerce product on the Phase 6+
track and are deliberately not built here.

---

## Verification gate

| Gate | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `next lint --max-warnings=0` | **clean** |
| `jest` | **20 suites, 255 tests, all pass** (was 197) |
| `next build` with empty env | **succeeds** |
| 12 migrations from scratch | **all apply** |
| RLS isolation | **pass** |
| Credit ledger invariants | **pass** |
| Credit concurrency, 20-way | **pass — no over-issue** |
| Billing entitlements | **pass, and re-runnable** |

---

## B8 — billing now actually does something

The webhook verified Paddle's signature correctly, filed the event, and returned. No
subscription row was created or updated, no plan synced, no credits granted, no access
revoked. Billing was inert.

Migration 12 adds `apply_subscription_event`, `store_has_access`,
`record_billing_transaction` and `notify_store`, and `entitlementSync.ts` turns a
verified event into real changes.

Proven in `supabase/tests/billing_entitlements.sql`:

- activation creates the subscription **and grants the plan's credits** (Pro → 3000)
- **a redelivered event grants nothing.** The grant's ledger idempotency key is the
  Paddle event id, so a retry cannot hand out a second month of credits. This is why
  the grant lives inside the same function as the subscription write — the two have to
  agree or a customer gets free credits on every webhook retry.
- exactly one subscription row per Paddle subscription; a plan change updates in place
- **`past_due` keeps access for a seven-day grace period**, so a failed card is not an
  instant lockout of a paying customer, and access ends once that expires
- cancellation revokes access and is timestamped
- an unknown plan id is refused, never stored
- a redelivered transaction does not duplicate in billing history
- billing history is tenant-scoped — another tenant reads zero rows

Also built: `POST /api/billing/checkout` (Paddle transaction with `custom_data.store_id`
as the link back — the webhook has no other reliable way to attribute a subscription),
and `GET`/`PATCH /api/billing/subscription` for history, cancellation and plan changes.

Two deliberate choices:
- **Cancel at period end, not immediately.** Cancelling now would forfeit time already
  paid for.
- **Upgrades prorate and charge immediately; downgrades take effect next period.** The
  customer gets the larger plan now, and keeps what they already paid for on the way down.
- **Plan changes are not written locally.** The resulting `subscription.updated` webhook
  is the single writer, so entitlements never diverge from Paddle.

---

## B10 — every email would have failed

The old payload had **no `html`, `text` or `react` field** (it set `react: undefined`
explicitly), the subject was the raw event key so users would have received an email
titled `password_reset`, and the template variables were spread into the top level of
the Resend request body. There were no templates at all. Resend would have rejected
every single send with a 422.

Built thirteen templates, one per catalogue event, sharing a table-based, inline-styled
layout — Outlook and several webmail clients strip `<style>` blocks and do not support
flex or grid. Every template ships a plain-text alternative, because a missing text part
is a strong spam signal.

Tested, per template and across all thirteen:
- subject, HTML and text all render and are non-trivial
- no `undefined` or `[object Object]` reaches the output
- the subject is never the raw event key
- **interpolated values are escaped** — a project named `<img src=x onerror=...>` cannot
  inject markup into an email
- the generation-failure email states that credits were refunded, because that is the
  first thing a user wants to know

`emailService.ts` was rewritten: it claims the send in `email_events` **before** calling
Resend, so the unique idempotency key collapses concurrent duplicates into one delivery;
it passes Resend its own `Idempotency-Key` so a retry after a timeout does not
double-send; and it finally uses the retry policy `emailEvents.ts` defined and nothing
called. It only backs off for failures that might clear — a 4xx other than 429 will fail
identically next time.

Password reset and verification still bypass suppression. Locking someone out of account
recovery because a notification bounced would be worse than the bounce.

---

## Notifications

`GET`/`PATCH /api/notifications` back a notification centre, scoped by RLS. Real events
are wired: subscription activated, cancelled, payment failed, grace period started,
generation completed, generation failed.

`generationNotifier.ts` announces generation outcomes in-app and by email, keyed on the
job id so a worker retry cannot notify twice. It is best-effort throughout — a
notification failure must never fail a generation or skip a refund — and it sends a
**plain reason**, never the provider's raw error, which can echo the prompt back.

One deliberate restraint: a job that will be retried does not notify. Only a genuinely
finished job does, or users would get mail about every attempt.

---

## Not done, and why

- **No live Paddle or Resend call has been made.** Both clients are exercised against
  injected responses shaped like the documented APIs. No keys are configured, so
  nothing has been sent or charged. **This is the open risk in this phase**, same shape
  as Phase 2: add the keys, run one sandbox checkout and one real email before trusting it.
- **Dunning beyond the grace period** — no escalating reminder sequence yet. The grace
  period is enforced and the first email is sent.
- **Credit top-ups and expiry** — `grant_credits` supports both; there is no purchase
  flow or expiry job.
- **Low-credit and credits-exhausted emails** have templates and are tested, but nothing
  triggers them yet; that needs a usage threshold check in the worker.
- **Migrations still not applied to hosted Supabase** — free-tier limit, unchanged.

---

## Status

All 13 P0 defects from the audit are now closed. B8 and B10 were the last two.

Storovex can authenticate a user, sell them a subscription, grant and safely spend
credits under concurrency, call a real image model, store and deliver the result, settle
the ledger correctly either way, and tell the user what happened by email and in-app.

What it does not have is a frontend worth showing anyone. That is Phase 4.
