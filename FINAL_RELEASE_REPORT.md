# Storovex — Release Report

Date: 2026-09-04
Branch: `claude/storovex-audit-plan-19xkwt`
Live project: `vjlarglyifnbpqcpxoxd`

---

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `next lint --max-warnings=0` | clean |
| `jest` | 6 suites, **114 tests**, all pass |
| `next build` with an empty environment | succeeds |
| Database scripts, clean-slate rebuild | 9 scripts apply in order, both suites pass |
| **Live isolation probe** | **10/10 pass** |
| **Live RPC privilege probe** | **8/8 pass** |
| Supabase security advisor | all anonymous-execute warnings cleared |
| Browser, 5 viewports × 3 pages | 0 horizontal overflow, 0 console errors |
| `jest-axe` | 0 violations |

The live probes insert fixtures, assert, and roll back. Verified afterwards: every
table still holds 0 rows.

---

## 1. The incident is repaired

`stores` and `subscriptions` — dropped on 2026-09-04 by a reset script of mine —
are back, with all **14 foreign keys** restored and RLS enabled. The two credit
functions that had been silently referencing missing tables work again.

The restored definition is **not the original**. `stores` had 15 columns; this one
has 7, and every one is derived from evidence that survived the drop rather than
guessed:

| Column | Why it must exist |
|---|---|
| `stores.id` | 14 tables carry a `store_id` that pointed here |
| `stores.name` | the assistant reads it for prompt grounding |
| `stores.slug` | the storefront resolves `/s/<slug>` through it |
| `stores.stripe_account_id` | checkout reads it to route the Connect payment |
| `stores.subscription_id` | no table carries `subscription_id`, so the link lived here |
| `subscriptions.id`, `.credits_remaining` | both surviving credit functions read and write them |

`owner_id` and `created_at` are conventional additions. **Whatever else the
original held is still missing** and must be added when the real schema surfaces.
The restore script is `IF NOT EXISTS` throughout, so running it against a project
that already has the real tables changes nothing.

---

## 2. Two bugs that would have shipped a dead product

Running against the live database — not the local copy — turned up mismatches
between my code and the real schema. Two were fatal and silent:

**Products.** Every storefront query filtered `status = 'published'`.
`products_status_check` allows `draft | active | archived`. There is no
`'published'`. The catalogue would have returned **nothing, forever**, and looked
like an empty shop rather than a bug.

**Team roles.** `is_store_admin()` checked for `'owner'` or `'admin'`.
`store_team_members_role_check` allows `manager | staff`. No row could hold those
values, so every admin-gated policy denied **everyone, including the real owner**.

Both passed typecheck, lint, 106 unit tests and a production build.

Three more of the same kind: `credit_usage.feature` was priced against four
invented names where the constraint lists six real ones; video ads used a
`'generating'` state that does not exist; orders were written as `'pending'`
instead of `'pending_payment'`.

**Root cause.** My local test fixture declared every status and role column as
bare `text` with no CHECK constraint, so it accepted vocabulary the real database
rejects. A fixture more permissive than production does not merely fail to catch
bugs — it manufactures confidence in them. All 15 live CHECK constraints are now
copied into the fixture verbatim, and `schema-vocabulary.test.ts` asserts the
code's vocabulary against them.

Two features I had costed — product copy and image generation — are **absent from
the live feature list, and I removed them.** The database is saying the product
does not offer them.

---

## 3. A vulnerability I introduced, found and closed

Supabase exposes every `public` function at `/rest/v1/rpc/<name>`, callable by
anyone holding the anon key — a value shipped to every browser. Four of the
functions I added in Phase A were `SECURITY DEFINER`, so they bypassed RLS
entirely:

- **`reserve_stock_with_expiry`** — an anonymous caller could reserve a store's
  entire inventory in a loop and hold it. No account, no purchase, no trace beyond
  the stock reaching zero. **Verified: as `anon` I drained all 100 units.**
- **`release_reservation` / `release_cart_reservations`** — free another shopper's
  held stock mid-checkout.
- **`sweep_expired_reservations`** — a scheduler job, on the public internet.

All are now revoked; the live probe confirms each is refused for both anonymous
and signed-in callers while the server still works.

**The fix was wrong the first time, and the way it was wrong is worth recording.**
I revoked `EXECUTE` from `anon` and `authenticated`. PostgreSQL grants `EXECUTE`
on every function to `PUBLIC` by default, and those roles inherit it from there —
so the revoke removed a grant they never separately held and **changed nothing**.
I then watched the test suite pass and wrote a comment claiming the behaviour was
verified. It was passing on a grant that was still in place. The probe that
reserved 100 units is what exposed both the vulnerability and my false claim.

A test that passes after a change proves nothing until you confirm the change took
effect.

The same probe then showed the opposite of what I had written: with the revoke
genuinely applied, merchant queries failed with `permission denied for function
is_store_member`, because an RLS policy expression **is** evaluated with the
calling role's privileges. The three predicate functions are granted back to
`authenticated` for that reason, and remain closed to `anon`.

---

## 4. What is live now

25 tables, **36 policies**, 14 foreign keys, RLS on everything.

Proven on the live database:

- the storefront resolves a store by slug, and sees active products but not drafts
- a draft product's variants and prices stay hidden
- `stripe_account_id` and `subscription_id` are unreadable by any client —
  enforced with **column grants**, since a row policy cannot restrict columns
- credit balances, spend rows and unfinished video ads are not public
- discount codes are not enumerable
- six financial tables are **unreachable**, not merely empty — RLS returns no rows
  *and* the grant is revoked, so two independent mistakes would have to line up

---

## 5. Deliberate exceptions in the advisor output

- **7 × `rls_enabled_no_policy` (INFO)** — intentional. These are the server-only
  tables; no policy plus no grant is the strongest position, not a gap.
- **3 × `authenticated_security_definer` (WARN)** — required. Revoke these and
  every merchant read fails. They answer only about the caller's own `auth.uid()`.
- **`pg_trgm` in `public` (WARN)** — pre-existing, and the full-text index depends
  on it. Moving it risks the search index; left alone deliberately.
- **Leaked password protection disabled (WARN)** — **worth enabling.** It is a
  dashboard toggle (Auth → Policies) that checks new passwords against
  HaveIBeenPwned. I cannot set it from here.

---

## 6. One change to your schema, named explicitly

`06_widen_status_vocabulary.sql` widens two CHECK constraints you wrote:

- `credit_usage.status` gains `reserved` and `refunded`
- `product_video_ads.status` gains `pending`

Widening a CHECK can never reject an existing row, so it cannot fail on live data.
It is still your schema, so it is isolated in its own file with **its rollback SQL
written at the bottom**.

Why: `completed | failed` are both terminal, written after the work finishes.
Credits are decremented *before* the AI call, so a crash in between leaves the
balance reduced with no record of what took it. `reserved` is the state between
the charge and the outcome; `refunded` is what makes giving credits back
idempotent, so two concurrent retries cannot both pay out. For video ads,
`pending` gives the atomic claim something to transition from — without it, two
workers can generate and charge for the same ad.

Everything else applied is additive.

---

## 7. What is not done

**Not verified anywhere:** no live Stripe call has been made. Stripe, Resend and
the AI providers are exercised against injected responses shaped like their
documented APIs. Nothing has been charged, sent or generated.

**Not built:**

- **Merchant UI** for products, orders, discounts and the AI assistant. The APIs
  exist and are tested; the screens do not.
- **The visual store builder** — the largest remaining piece.
- **Cart and checkout pages.** The API and the add-to-basket control exist; the
  basket and payment screens do not, so no shopper can complete a purchase.
- Fulfilment, shipping and refund flows beyond the webhook status transitions.
- Admin console; structured logging with request IDs; error tracking.
- Transactional email — the Paddle-era templates were retired with the photography
  domain and commerce equivalents have not been written.
- Legal pages.
- `src/core/storage/uploadService.ts` writes to a `file_assets` table that **does
  not exist** in this project. It is left over from the photography codebase and
  will fail if called.

---

## 8. Honest state

The database is now in genuinely good shape, and that claim rests on probes run
against the live project rather than a local copy. The commerce, credit and
payment logic is carefully reasoned and well tested at the unit level.

It is not a running product. No screen exists for a merchant to add a product or
view an order, no shopper can complete a purchase through the UI, and no real
payment has been processed.

Two things unblock the rest: **the original `stores` and `subscriptions` column
list**, so the restored tables can be completed, and a **Stripe test key**, so a
payment can be put through end to end. The next substantial build is the merchant
UI.

I am not rating this production-ready. It is a well-tested, now genuinely secured
foundation with a substantial amount of interface still to build.
