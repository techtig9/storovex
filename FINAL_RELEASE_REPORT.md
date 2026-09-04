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

## 7. The interface, now built

Every screen listed as missing in the previous report now exists.

**For merchants** — `/products` with search, status filter and pagination;
`/products/[id]` for details, variants, prices, stock, images and publishing;
`/orders` and `/orders/[id]` with fulfil, cancel and refund; `/discounts`;
`/settings` including Stripe Connect onboarding; and a dashboard reporting real
figures instead of a hardcoded empty state.

**For shoppers** — `/s/[slug]/cart` with quantities, removal and discount codes;
`/s/[slug]/checkout` with Stripe's Payment Element; and
`/s/[slug]/order/[groupId]` for confirmation. **A purchase can now be completed
through the interface**, which was not true before.

**Also** — `/terms` and `/privacy`, and new APIs for orders, discounts, stock,
product images and stores.

Decisions worth knowing:

- **Stock changes by a delta, never by setting a total.** A merchant typing "50"
  on a page loaded five minutes ago would overwrite every sale made since.
- **Only transitions the server will accept are offered.** The order page reads
  its available actions from the order itself, so a button never appears for a
  move the API will reject. Unpaid orders cannot be fulfilled; refunded and
  cancelled are terminal.
- **Refunds claim the transition before calling Stripe** and put it back if the
  call fails, so two clicks cannot refund twice and a failed refund never leaves
  an order marked as refunded.
- **The confirmation page requires the email, not just the link.** The order id
  is in the URL, so it reaches history, referrers and anyone it is pasted to.
- **`stripe_account_id` never reaches the browser** — the API returns only
  whether onboarding finished.
- **A discount's code and value cannot be edited** once created, because changing
  what a code was worth after it has been used makes the order history
  unexplainable.

## 8. Three bugs found by running it, not by reading it

**Route protection was completely inert.** `middleware.ts` sat at the repository
root; Next.js looks for it inside `src/` in a `src/app` project. The build
manifest read `"middleware": []` — **no middleware was compiled at all**. Every
protected route served to signed-out visitors, and sessions were never refreshed,
so users would be logged out whenever their token expired. The file typechecked,
linted and read correctly; it was simply never loaded. Moving it to
`src/middleware.ts` was the whole fix, and a test now asserts its location,
because nothing else can catch this.

**The protected list named routes that no longer exist.** It listed `/generate`,
`/billing` and `/projects` from the photography codebase while omitting
`/products`, `/orders` and `/discounts`. The API still refused those callers, so
nothing leaked, but a signed-out visitor got a screen full of errors instead of a
login page.

**Checkout wrote a cart status the database forbids.** `carts.status =
"checked_out"`; the constraint allows `open | converted | abandoned`. supabase-js
returns errors rather than throwing and the result was discarded, so the write
failed silently and left the cart open — **the same basket could be checked out
again, creating a second set of orders for one shopper.**

Also fixed: `analyticsService` counted `"shipped"` and `"delivered"` order
statuses that cannot exist, and `uploadService` wrote to a `file_assets` table
this project does not have. That upload path is replaced by real image management
against `product_images`.

## 9. What is still not done

**No live payment has been taken.** Stripe is exercised against injected
responses shaped like its documented API. Nothing has been charged.

**The storefront pages are not browser-verified end to end.** This sandbox's
proxy blocks Supabase's REST domain — only the MCP connector reaches the database
— so a running storefront cannot load its own data here. Those screens are
covered by component tests against mocked responses instead, and the public
pages, route protection and merchant screens *are* browser-verified. This is a
limit of where I am running, not a known defect.

**Not built:** the visual store builder, which remains the largest missing piece;
team management (the roles and permissions exist, the screen does not);
collections and categories management; shipping rates and tax rules, which are
currently always zero; transactional email; an admin console; and structured
logging with request IDs.

**Image uploads are by URL**, not direct file upload. Supabase Storage would be
the right home, but I could not verify a bucket exists or test an upload from
here, so I built what I could actually test.

## 10. Honest state

The database is genuinely well secured, and that rests on probes run against the
live project. The commerce, credit and payment logic is carefully reasoned and
well tested. The interface now exists end to end: a merchant can add a product,
price it, stock it, publish it and fulfil the order; a shopper can browse, fill a
basket, apply a code and pay.

What has still never happened is a real payment. Everything downstream of
Stripe's API boundary is verified against mocked responses, and the storefront
has not been driven in a browser against real data.

Two things would close that: **a Stripe test key**, to put a real payment
through, and **the original `stores` and `subscriptions` column list**, so the
restored tables can be completed. With those, the next session can run the full
purchase end to end and know it works rather than believe it does.
