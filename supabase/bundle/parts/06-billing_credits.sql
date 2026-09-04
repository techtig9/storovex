-- Storovex schema — part 06 of 12: billing_credits
-- Run the parts in numeric order. Each depends only on the parts before it.
-- Safe to re-run: every statement is idempotent.

-- Storovex 06 — plans, subscriptions, credit accounts and the immutable ledger.

create table if not exists public.plans(
  id text primary key,
  name text not null,
  monthly_cents integer not null check(monthly_cents>=0),
  included_credits integer not null check(included_credits>=0),
  max_spend_per_job_credits integer not null check(max_spend_per_job_credits>0),
  active boolean not null default true
);

create table if not exists public.subscriptions(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  paddle_subscription_id text unique,
  plan_id text not null references public.plans(id),
  status text not null check(status in ('active','trialing','past_due','paused','canceled')),
  billing_cycle text not null default 'monthly' check(billing_cycle in ('monthly','annual')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_subscriptions_store on public.subscriptions(store_id);
-- One active subscription per store. Entitlement lookups assume this and previously
-- nothing enforced it, so a duplicate row would silently change a store's plan.
create unique index if not exists idx_subscriptions_one_active
  on public.subscriptions(store_id) where status in ('active','trialing');

drop trigger if exists trg_subscriptions_touch on public.subscriptions;
create trigger trg_subscriptions_touch before update on public.subscriptions
for each row execute function public.touch_updated_at();

create table if not exists public.credit_accounts(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  balance integer not null default 0 check(balance>=0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.credit_accounts(id) on delete cascade,
  type text not null check(type in ('reservation','commit','refund','adjustment','grant','expiry')),
  amount integer not null check(amount>=0),
  job_id uuid,
  idempotency_key text unique,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_credit_ledger_account on public.credit_ledger(account_id,created_at desc);
create index if not exists idx_credit_ledger_job on public.credit_ledger(job_id);
create index if not exists idx_credit_ledger_type on public.credit_ledger(account_id,type);

create table if not exists public.billing_webhook_events(
  id text primary key,
  type text not null,
  action text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;
-- RLS was previously left OFF on both of these. PostgREST exposes public tables to
-- anyone holding the anon key, which ships in the browser bundle by design, so raw
-- Paddle payloads — customer emails, names, billing addresses — were world-readable.
alter table public.billing_webhook_events enable row level security;

drop policy if exists "plans_public_select" on public.plans;
create policy "plans_public_select" on public.plans
for select to authenticated using(active=true);

drop policy if exists "subscriptions_store_select" on public.subscriptions;
create policy "subscriptions_store_select" on public.subscriptions
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "credit_accounts_store_select" on public.credit_accounts;
create policy "credit_accounts_store_select" on public.credit_accounts
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "credit_ledger_store_select" on public.credit_ledger;
create policy "credit_ledger_store_select" on public.credit_ledger
for select to authenticated
using(account_id in (select id from public.credit_accounts where public.is_store_member(store_id)));
-- billing_webhook_events: RLS on, no policy. Service role only.
-- Writes to subscriptions/credit_accounts/credit_ledger are service-role only too:
-- a client must never be able to grant itself credits or change its own plan.

insert into public.plans(id,name,monthly_cents,included_credits,max_spend_per_job_credits) values
  ('starter','Starter',1700,400,60),
  ('mid','Mid',3400,1200,150),
  ('pro','Pro',6900,3000,400)
on conflict (id) do nothing;
