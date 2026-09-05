# Incident — schema reset dropped two live tables

Date: 2026-09-04
Project: Supabase `storovex` (`vjlarglyifnbpqcpxoxd`, techtig6@gmail.com)
Cause: `supabase/bundle/parts/00-reset.sql`, written by me and run by the product owner

---

## What was destroyed

| Object | Detail | Data lost |
|---|---|---|
| `public.stores` | 15 columns | none — 0 rows |
| `public.subscriptions` | had `credits_remaining`; no `store_id` | none — 0 rows |
| 14 foreign keys referencing `stores` | dropped by `CASCADE` | n/a |

The 14 tables now holding an orphaned `store_id uuid` with no foreign key:
`products`, `product_variants`, `product_images`, `product_video_ads`, `collections`,
`discounts`, `orders`, `payment_events`, `channels`, `credit_usage`,
`assistant_messages`, `audit_logs`, `store_order_counters`, `store_team_members`.

**Two surviving functions are now broken**, because they reference the dropped
`subscriptions` table:

```sql
public.try_decrement_credits(p_subscription_id uuid, p_cost integer)
  -- update subscriptions set credits_remaining = credits_remaining - p_cost ...
public.refund_credits(p_subscription_id uuid, p_amount integer)
  -- update subscriptions set credits_remaining = credits_remaining + p_amount ...
```

Everything else survived: all 22 remaining tables, and the other four commerce
functions (`try_reserve_stock`, `release_stock`, `next_order_number`,
`increment_discount_usage`).

Of the twelve tables the diagnostic reported before the reset, only these two were
the owner's. The other ten (`profiles`, `store_members`, `job_queue`,
`worker_capacity`, `job_rate_buckets`, `security_events`, `api_rate_limit_buckets`,
`api_audit_events`, `validation_events`, `notifications`) were created by my own
parts 01–05 in an earlier attempt, and dropping those cost nothing.

---

## Why it happened

`00-reset.sql` guarded on one condition: every table in its list is empty. Every
table was empty, so it proceeded.

That guard was wrong. **Emptiness is not evidence that dropping is safe** — a schema
nobody has inserted into yet is still a schema someone designed. The list also used
generic names (`stores`, `subscriptions`, `profiles`, `notifications`, `job_queue`)
that belong to plenty of products, and this project happened to be a different
product using two of them.

The check I should have written: drop a table only if it matches *this* schema's
definition — a `stores` with 15 columns is self-evidently not the 6-column one this
schema defines, and that alone should have stopped it, empty or not.

`00-reconcile.sql`, written earlier, had a related weakness: it tested a single key
column per table, and a 15-column `stores` satisfies "has `owner_id`".

**Neither script should be run against any project again.** Both are superseded by
the recovery below.

---

## Recovery

1. **Restore from a Supabase backup taken before 2026-09-04** — Dashboard → Database
   → Backups. This is the only route that returns `stores` and `subscriptions` with
   their original columns and every foreign key intact.

2. If no backup is available, both tables have to be rebuilt from what references
   them. That is reconstruction, not recovery: `stores` had 15 columns and only
   `owner_id` is known; `subscriptions` is known only to have `id` and
   `credits_remaining`. The result would be functional but not the original.

Nothing further should be applied to this project until one of those is done.

---

## Changes made in response

- `00-reset.sql` and `00-reconcile.sql` are withdrawn. They remain in git history but
  must not be run.
- No destructive SQL will be authored for this project again. Additive migrations
  only, and anything that drops or alters an existing object gets named explicitly
  and confirmed before it runs, regardless of whether the table looks empty.
