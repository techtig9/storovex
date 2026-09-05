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
| `jest` | 10 suites, **151 tests**, all pass |
| `next build` with an empty environment | succeeds |
| Database scripts, clean-slate rebuild | 9 scripts apply in order, both suites pass |
| **Live isolation probe** | **10/10 pass** |
| **Live RPC privilege probe** | **8/8 pass** |
| Supabase security advisor | all anonymous-execute warnings cleared |
| Browser, 5 viewports × 6 public pages | 0 overflow, 0 console errors, 1 h1 each |
| Browser, route protection | all 7 merchant routes redirect to `/login` |
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

## 7. Everything that is built

**Merchant** — dashboard on real figures; products with search and filters; product
editor (variants, prices, stock, images, publishing); orders with fulfil, cancel and
refund; discounts; **collections**; **team management**; settings covering store
details, Stripe Connect, **shipping and tax**, and **storefront appearance**.

**Shopper** — branded storefront with an About section and postage stated up front;
product pages; basket with quantities, discount codes and a full total; checkout
with Stripe's Payment Element; order confirmation.

**Platform** — an **admin console** across every store, showing marketplace sales
and platform revenue as separate figures, and counting the stores that cannot yet
take payment.

**Behind it** — **transactional receipts** sent when payment clears; **request-scoped
structured logging** with an `X-Request-Id` on every response; 36 RLS policies; a
commerce core in integer minor units.

## 8. Decisions worth knowing

- **Shipping is charged per order, per store.** A multi-store basket is several
  orders, and each merchant ships their own parcel.
- **The free-shipping threshold is compared after the discount.** Otherwise a code
  that takes a basket under the line is quietly worth more than its face value and
  the merchant absorbs the difference.
- **Tax applies to goods plus postage, after the discount, rounded down.** A cent
  invented by rounding is a cent the merchant must remit and never collected.
- **The platform fee is taken on goods only** — not on postage or tax. A percentage
  of shipping is a cut of money going straight to a courier.
- **The last manager cannot be demoted or removed.** A store with no manager is
  unrecoverable: nobody left can promote anyone back.
- **Categories are the platform's, collections are the merchant's.** A marketplace
  where every seller invents category names cannot be browsed across sellers.
- **The receipt is sent from the webhook, not at checkout**, so it goes out when the
  money actually clears — and it can never fail the webhook, because Stripe retries
  a non-2xx and that would re-run every step above it.
- **Email reports `skipped` when unconfigured** rather than returning success. A
  silent no-op is how a merchant comes to believe receipts are going out.
- **An inbound `X-Request-Id` is only honoured if it looks like one.** Echoing
  arbitrary client text into logs lets a caller forge their own entries.
- **The accent colour is a CSS custom property**, constrained to a hex literal by
  both the API and a database check, so merchant text never becomes markup.

## 9. Bugs found by running it, not reading it

- **Route protection was completely inert.** `middleware.ts` sat at the repository
  root; Next.js looks inside `src/` for a `src/app` project, so the build manifest
  read `"middleware": []` and no middleware compiled at all. It typechecked and
  linted the whole time. A test now asserts its location.
- **Checkout wrote a cart status the database forbids** (`checked_out`). supabase-js
  returns errors rather than throwing and the result was discarded, so the write
  failed silently and left the cart open — the same basket could be checked out
  twice, creating two sets of orders for one shopper.
- **Every storefront query filtered `status = 'published'`**, which the constraint
  does not allow. The catalogue would have returned nothing, forever.
- **`is_store_admin()` checked for `owner`/`admin`** where the constraint allows
  `manager | staff`, so every admin-gated policy denied everyone including the owner.
- **An anonymous caller could drain a store's entire inventory** through
  `reserve_stock_with_expiry`, exposed at `/rest/v1/rpc/`. Verified by doing it.

## 10. What is still not done

**No live payment has been taken.** Stripe, Resend and the AI providers are
exercised against injected responses shaped like their documented APIs.

**The storefront pages are not browser-verified end to end.** This sandbox's proxy
blocks Supabase's REST domain, so a running storefront cannot load its own data
here. They are covered by component tests instead; the public pages, route
protection and merchant screens *are* browser-verified across five viewports.

**Not built:** a drag-and-drop visual page builder. Storefront customisation is
name, tagline, about, logo and accent colour — real and applied, but it is
configuration, not a canvas. Shipping is a flat rate with a free-over threshold,
not per-region or per-weight rates. Product images are added by https URL rather
than uploaded, because I could not verify a storage bucket or test an upload from
here.

**`stores` and `subscriptions` were restored** after an incident with a reset script
of mine, and the restored definition has 7 of the original 15 columns.
`INCIDENT_2026-09-04_schema_reset.md` records it.

## 11. Honest state

The database is well secured, and that claim rests on probes run against the live
project. The commerce, credit, shipping, tax and payment logic is carefully reasoned
and thoroughly tested. The interface is complete end to end: a merchant can set up a
store, price and stock it, brand it, publish it, take an order and refund it; a
shopper can browse, fill a basket, apply a code, see the real total including
postage, and pay.

What has still never happened is a real payment. Everything past Stripe's API
boundary is verified against mocked responses.

One thing closes that: **a Stripe test key**, to put a payment through end to end.
