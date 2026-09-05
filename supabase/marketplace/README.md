# Marketplace schema work

Additive SQL for the live `storovex` project. **Nothing here drops, alters or
truncates an existing table, and nothing touches a row.** After the reset incident
(see `INCIDENT_2026-09-04_schema_reset.md`) that constraint is deliberate and
permanent: destructive SQL for this project gets named and confirmed before it runs,
never bundled into a script.

## Apply in this order

| File | What it does |
|---|---|
| `01_rls_policies.sql` | Membership predicates and 30 RLS policies |
| `03_function_hardening.sql` | Pins `search_path` on the six existing functions; adds stock reservation expiry |

## Then verify

| File | What it proves |
|---|---|
| `02_rls_test.sql` | Merchant, storefront and draft-inheritance isolation |
| `04_stock_test.sql` | Reservation, release, idempotency, expiry sweep |

Both raise on any failed assertion, so a clean run means everything passed. Both are
re-runnable and reset their own fixtures. They insert fixture rows, so run them
before real data exists, or delete the fixtures afterwards.

`_local_schema_for_testing.sql` is a **local fixture only** — it reconstructs the live
schema so the policies can be developed and tested here. Never run it against the
real project.

## What the policies decide

- **Merchants** reach only their own store, through `store_team_members`.
- **The anonymous storefront** sees published products and their variants, images,
  ready video ads, collections and categories. Nothing else.
- **Eight tables are server-only** — RLS on, no policy, so every client is denied:
  `payment_events`, `carts`, `cart_items`, `order_groups`, `store_order_counters`,
  `stock_reservations`, and the two tables awaiting restore.

Three choices worth stating, because they are not obvious:

- **Discounts have no public read.** Codes are validated server-side; a readable
  table would let anyone enumerate every code in the marketplace.
- **`order_groups` is server-only** even for merchants. It spans stores, so a merchant
  who could read it would learn that their customer also bought from a competitor.
- **Variants and images inherit visibility from their product** rather than carrying
  their own flag, so an unpublished product cannot leak its price through a variant.

## Still open

`stores` and `subscriptions` must be restored from backup before this is applied to
production — several policies reference `store_team_members.store_id`, which is
meaningless without `stores`, and `try_decrement_credits` is broken without
`subscriptions`.

RLS cannot restrict individual columns, so `orders_member_update` lets a merchant
update any column on their own order. The server must refuse writes to `total`,
`application_fee_amount` and `stripe_payment_intent_id`; that belongs in the API
layer, not here.
