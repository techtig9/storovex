-- Restores the two tables my 00-reset.sql destroyed on 2026-09-04.
-- See INCIDENT_2026-09-04_schema_reset.md.
--
-- This is NOT the original schema. The original `stores` had 15 columns and
-- `subscriptions` an unknown number; that definition was lost with the tables.
-- Every column below is *derived from evidence that survived the drop*, not
-- guessed:
--
--   stores.id              14 tables carry a `store_id uuid` that pointed here
--   stores.name            assistantService reads it for prompt grounding
--   stores.slug            storefrontService looks a store up by it
--   stores.stripe_account_id   checkout reads it to route the Connect payment
--   stores.subscription_id     no table carries subscription_id, so the link
--                              lived here; creditService reads it
--   subscriptions.id             try_decrement_credits/refund_credits key on it
--   subscriptions.credits_remaining  both functions read and write it
--
-- owner_id and created_at are conventional additions, not derived. Everything
-- else the original had is still missing and must be re-added when the real
-- schema surfaces.
--
-- Non-destructive by construction: every statement is IF NOT EXISTS. Run
-- against a project that already has the real tables and it changes nothing.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  credits_remaining integer not null default 0,
  created_at timestamptz default now()
);

-- credits_remaining must never go below zero. try_decrement_credits guards
-- this in its WHERE clause, but a direct UPDATE would not, and a negative
-- balance silently grants free usage.
alter table public.subscriptions
  drop constraint if exists subscriptions_credits_remaining_non_negative;
alter table public.subscriptions
  add constraint subscriptions_credits_remaining_non_negative
  check (credits_remaining >= 0);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  stripe_account_id text,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  owner_id uuid references public.users(id) on delete restrict,
  created_at timestamptz default now()
);

-- The slug is a public URL segment (/s/<slug>); two stores sharing one would
-- make the storefront resolve to whichever row came back first.
create unique index if not exists stores_slug_key on public.stores (lower(slug));

do $$
declare
  t text;
  cascade_tables text[] := array[
    'assistant_messages','audit_logs','channels','collections','credit_usage',
    'discounts','orders','product_images','product_variants','product_video_ads',
    'products','store_order_counters','store_team_members'
  ];
begin
  -- 13 store-owned tables: deleting a store takes its content with it.
  foreach t in array cascade_tables loop
    if not exists (
      select 1 from pg_constraint
      where conname = t || '_store_id_fkey' and conrelid = ('public.'||t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (store_id) '
        'references public.stores(id) on delete cascade', t, t||'_store_id_fkey');
    end if;
  end loop;

  -- payment_events is the exception, and its nullable store_id is the evidence
  -- the original treated it that way: a financial record must outlive the store
  -- it belonged to, for reconciliation and for dispute evidence.
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_events_store_id_fkey'
      and conrelid = 'public.payment_events'::regclass
  ) then
    alter table public.payment_events
      add constraint payment_events_store_id_fkey foreign key (store_id)
      references public.stores(id) on delete set null;
  end if;
end $$;

alter table public.stores enable row level security;
alter table public.subscriptions enable row level security;
