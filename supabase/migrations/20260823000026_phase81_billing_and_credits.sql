
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
 store_id uuid not null,
 paddle_subscription_id text unique,
 plan_id text not null references public.plans(id),
 status text not null check(status in ('active','trialing','past_due','paused','canceled')),
 billing_cycle text not null default 'monthly' check(billing_cycle in ('monthly','annual')),
 current_period_end timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_subscriptions_store on public.subscriptions(store_id);
alter table public.subscriptions enable row level security;
create policy if not exists "subscriptions_store_select" on public.subscriptions for select to authenticated
using(store_id=public.current_store_id());

create table if not exists public.credit_accounts(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null unique,
 balance integer not null default 0 check(balance>=0),
 updated_at timestamptz not null default now()
);
alter table public.credit_accounts enable row level security;
create policy if not exists "credit_accounts_store_select" on public.credit_accounts for select to authenticated
using(store_id=public.current_store_id());

create table if not exists public.credit_ledger(
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.credit_accounts(id),
 type text not null check(type in ('reservation','commit','refund','adjustment','grant','expiry')),
 amount integer not null check(amount>=0),
 job_id uuid,
 idempotency_key text unique,
 reason text,
 created_at timestamptz not null default now()
);
create index if not exists idx_credit_ledger_account on public.credit_ledger(account_id,created_at desc);
create index if not exists idx_credit_ledger_job on public.credit_ledger(job_id);
alter table public.credit_ledger enable row level security;
create policy if not exists "credit_ledger_store_select" on public.credit_ledger for select to authenticated
using(account_id in (select id from public.credit_accounts where store_id=public.current_store_id()));

create table if not exists public.billing_webhook_events(
 id text primary key,
 type text not null,
 action text not null,
 payload jsonb not null,
 created_at timestamptz not null default now()
);
-- Note: intentionally a distinct table from ai_provider_events (which tracks AI-gateway
-- provider call telemetry per Blueprint §4/§6, not billing webhook deliveries).

insert into public.plans(id,name,monthly_cents,included_credits,max_spend_per_job_credits) values
 ('starter','Starter',1700,400,60),
 ('mid','Mid',3400,1200,150),
 ('pro','Pro',6900,3000,400)
on conflict (id) do nothing;
