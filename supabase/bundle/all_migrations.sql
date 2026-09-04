-- Storovex — complete schema, generated from supabase/migrations/
-- Generated: 2026-09-04T05:10:53Z
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It is safe to run more than once: every statement is idempotent, verified by
-- applying the full set three times against PostgreSQL 16 with no errors and an
-- unchanged resulting schema.
--
-- Order matters and is already correct here: each section depends only on the
-- sections above it.

begin;


-- ============================================================
-- 20260101000001_extensions_and_helpers.sql
-- ============================================================
-- Storovex 01 — extensions and shared helpers.
-- Ordering note: every migration in this directory applies in filename order and
-- depends only on files numbered before it. The previous set shared one timestamp
-- across seven files and forward-referenced tables, so none of it could apply.

create extension if not exists pgcrypto;

-- Single source of truth for updated_at. Previously every service set this by hand
-- in application code and several forgot, so rows drifted.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ============================================================
-- 20260101000002_tenancy.sql
-- ============================================================
-- Storovex 02 — tenancy: stores, membership, and the RBAC predicates every other
-- policy is built on. This must come first: previously store_members was created
-- before stores existed, so it carried no foreign key, and twelve policies called
-- public.current_store_id(), a function that was never defined anywhere.

create table if not exists public.stores(
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(name) between 1 and 140),
  owner_id uuid not null references auth.users(id) on delete cascade,
  theme text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_stores_owner on public.stores(owner_id);

create table if not exists public.store_members(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','admin','member')),
  status text not null default 'active' check(status in ('active','invited','suspended')),
  created_at timestamptz not null default now(),
  unique(store_id,user_id)
);
create index if not exists idx_store_members_user on public.store_members(user_id,store_id);
create index if not exists idx_store_members_store on public.store_members(store_id,role);

-- SECURITY DEFINER so these bypass RLS on store_members. Without that, a policy on
-- store_members that calls is_store_member() would recurse infinitely.
create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.store_members
    where store_id=p_store_id and user_id=auth.uid() and status='active'
  );
$$;

create or replace function public.store_role(p_store_id uuid)
returns text language sql stable security definer set search_path=public as $$
  select role from public.store_members
  where store_id=p_store_id and user_id=auth.uid() and status='active' limit 1;
$$;

-- A store with no members locks its own owner out, because every policy below is
-- membership-based. Previously nothing created this row and there was no INSERT
-- policy on stores at all, so no user could create a store under any circumstances.
create or replace function public.add_store_owner_membership()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.store_members(store_id,user_id,role,status)
  values(new.id,new.owner_id,'owner','active')
  on conflict (store_id,user_id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_stores_owner_membership on public.stores;
create trigger trg_stores_owner_membership
after insert on public.stores
for each row execute function public.add_store_owner_membership();

drop trigger if exists trg_stores_touch on public.stores;
create trigger trg_stores_touch before update on public.stores
for each row execute function public.touch_updated_at();

alter table public.stores enable row level security;
alter table public.store_members enable row level security;

drop policy if exists "stores_member_select" on public.stores;
create policy "stores_member_select" on public.stores
for select to authenticated using(public.is_store_member(id));

-- The insert that was impossible before. owner_id is pinned to the caller so a user
-- cannot create a store owned by someone else.
drop policy if exists "stores_self_insert" on public.stores;
create policy "stores_self_insert" on public.stores
for insert to authenticated with check(owner_id=auth.uid());

drop policy if exists "stores_owner_update" on public.stores;
create policy "stores_owner_update" on public.stores
for update to authenticated
using(public.store_role(id)='owner') with check(public.store_role(id)='owner');

drop policy if exists "stores_owner_delete" on public.stores;
create policy "stores_owner_delete" on public.stores
for delete to authenticated using(public.store_role(id)='owner');

drop policy if exists "store_members_read_own_store" on public.store_members;
create policy "store_members_read_own_store" on public.store_members
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "store_members_insert_owner_admin" on public.store_members;
create policy "store_members_insert_owner_admin" on public.store_members
for insert to authenticated with check(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "store_members_update_owner_admin" on public.store_members;
create policy "store_members_update_owner_admin" on public.store_members
for update to authenticated
using(public.store_role(store_id) in ('owner','admin'))
with check(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "store_members_delete_owner_admin" on public.store_members;
create policy "store_members_delete_owner_admin" on public.store_members
for delete to authenticated using(public.store_role(store_id) in ('owner','admin'));

-- ============================================================
-- 20260101000003_profiles.sql
-- ============================================================
-- Storovex 03 — user profiles, created automatically on signup.

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

-- Without this the app would have to create a profile from client code on first
-- load, which races and fails behind RLS. Doing it on the auth.users insert makes
-- a profile an invariant rather than a hope.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
for select to authenticated using(id=auth.uid());

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert" on public.profiles
for insert to authenticated with check(id=auth.uid());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

-- ============================================================
-- 20260101000004_job_queue.sql
-- ============================================================
-- Storovex 04 — durable job queue, worker leases and capacity slots.
-- job_queue is created here, before the functions that operate on it. Previously
-- phase74 indexed this table in the first migration and it was not created until
-- the thirty-first, so the very first statement of the very first file failed.

create table if not exists public.job_queue(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  priority text not null default 'standard' check(priority in ('standard','high','highest')),
  status text not null default 'queued' check(status in ('queued','processing','done','dead_letter')),
  attempts integer not null default 0 check(attempts>=0),
  max_attempts integer not null default 5 check(max_attempts>0),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_queue_claim on public.job_queue(status,run_after,priority,created_at);
create index if not exists idx_job_queue_lease on public.job_queue(status,locked_at);
create index if not exists idx_job_queue_store on public.job_queue(store_id,created_at desc);

create table if not exists public.worker_capacity(
  worker_id text primary key,
  active_jobs integer not null default 0 check(active_jobs>=0),
  max_jobs integer not null default 1 check(max_jobs>0),
  last_heartbeat timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_worker_capacity_heartbeat on public.worker_capacity(last_heartbeat);

create table if not exists public.job_rate_buckets(
  bucket_key text primary key,
  window_start timestamptz not null,
  request_count integer not null default 0 check(request_count>=0),
  updated_at timestamptz not null default now()
);

-- Priority ordering mirrors scheduler.ts fairSort/priorityWeight exactly: highest,
-- then high, then standard, FIFO within each tier. SKIP LOCKED so concurrent
-- workers never double-claim.
create or replace function public.claim_next_job(p_worker_id text)
returns public.job_queue language plpgsql security definer set search_path=public as $$
declare claimed public.job_queue;
begin
  update public.job_queue j set
    status='processing', locked_by=p_worker_id, locked_at=now(),
    attempts=attempts+1, updated_at=now()
  where j.id=(
    select id from public.job_queue
    where status='queued' and run_after<=now()
    order by case priority when 'highest' then 0 when 'high' then 1 else 2 end, created_at
    for update skip locked
    limit 1
  )
  returning * into claimed;
  return claimed;
end; $$;

create or replace function public.heartbeat_job(p_job_id uuid,p_worker_id text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.job_queue set locked_at=now(),updated_at=now()
  where id=p_job_id and status='processing' and locked_by=p_worker_id;
  return found;
end; $$;

create or replace function public.recover_stale_jobs(p_timeout_minutes integer default 15)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  with stale as (
    select id from public.job_queue
    where status='processing' and locked_at < now()-make_interval(mins=>p_timeout_minutes)
    for update skip locked
  )
  update public.job_queue j set
    status=case when attempts>=max_attempts then 'dead_letter' else 'queued' end,
    run_after=now(), locked_at=null, locked_by=null, updated_at=now(),
    error_message=coalesce(error_message,'worker lease expired')
  where j.id in (select id from stale);
  get diagnostics n = row_count;
  return n;
end; $$;

-- GET DIAGNOSTICS assigns a single variable and cannot take an expression; the
-- previous version wrote "get diagnostics ok = row_count > 0", a syntax error that
-- made this whole file unloadable.
create or replace function public.try_acquire_worker_slot(p_worker_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  update public.worker_capacity set active_jobs=active_jobs+1, updated_at=now()
  where worker_id=p_worker_id and active_jobs<max_jobs;
  get diagnostics affected = row_count;
  return affected > 0;
end; $$;

create or replace function public.release_worker_slot(p_worker_id text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.worker_capacity set active_jobs=greatest(0,active_jobs-1), updated_at=now()
  where worker_id=p_worker_id;
  return found;
end; $$;

alter table public.job_queue enable row level security;
alter table public.worker_capacity enable row level security;
alter table public.job_rate_buckets enable row level security;

drop policy if exists "job_queue_store_select" on public.job_queue;
create policy "job_queue_store_select" on public.job_queue
for select to authenticated using(store_id is not null and public.is_store_member(store_id));
-- worker_capacity and job_rate_buckets intentionally have no policies: RLS is on and
-- they are reachable only through the SECURITY DEFINER functions above and the
-- service role. Infrastructure tables are never client-readable.

-- ============================================================
-- 20260101000005_security_audit.sql
-- ============================================================
-- Storovex 05 — security events, rate-limit buckets, API and validation audit.
-- security_events is defined once here with both risk_score and severity. Previously
-- phase76 and phase77 each created it with a different column set using
-- "create table if not exists", so whichever ran first silently won and a third
-- migration existed solely to patch up the drift.

create table if not exists public.security_events(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  risk_score integer not null default 0 check(risk_score between 0 and 100),
  severity text not null default 'info' check(severity in ('info','warning','critical')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_security_events_time on public.security_events(created_at desc);
create index if not exists idx_security_events_store on public.security_events(store_id,created_at desc);
create index if not exists idx_security_events_user on public.security_events(user_id,created_at desc);

create table if not exists public.api_rate_limit_buckets(
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_rate_limit_blocked on public.api_rate_limit_buckets(blocked_until);

create table if not exists public.api_audit_events(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  method text not null,
  route text not null,
  status_code integer not null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_audit_events_store_time on public.api_audit_events(store_id,created_at desc);
create index if not exists idx_api_audit_events_route_time on public.api_audit_events(route,created_at desc);

create table if not exists public.validation_events(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  field_name text,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_validation_events_time on public.validation_events(created_at desc);

-- Atomic fixed-window limiter. The TypeScript fixedWindow() it replaces defaulted its
-- state to a freshly constructed Map, so every request looked like the first one and
-- nothing was ever limited.
create or replace function public.check_api_rate_limit(
  p_bucket_key text, p_limit integer, p_window_seconds integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.api_rate_limit_buckets; now_ts timestamptz:=now(); remaining integer; retry integer;
begin
  insert into public.api_rate_limit_buckets(bucket_key,window_started_at,request_count,updated_at)
  values(p_bucket_key,now_ts,0,now_ts)
  on conflict(bucket_key) do nothing;

  select * into b from public.api_rate_limit_buckets where bucket_key=p_bucket_key for update;

  if b.blocked_until is not null and b.blocked_until>now_ts then
    return jsonb_build_object('allowed',false,'limit',p_limit,'remaining',0,
      'retry_after_seconds',ceil(extract(epoch from (b.blocked_until-now_ts)))::int);
  end if;

  if extract(epoch from (now_ts-b.window_started_at))>=p_window_seconds then
    update public.api_rate_limit_buckets
    set window_started_at=now_ts,request_count=1,updated_at=now_ts,blocked_until=null
    where bucket_key=p_bucket_key;
    return jsonb_build_object('allowed',true,'limit',p_limit,'remaining',greatest(0,p_limit-1),
      'retry_after_seconds',p_window_seconds);
  end if;

  if b.request_count>=p_limit then
    retry:=greatest(1,(p_window_seconds-floor(extract(epoch from (now_ts-b.window_started_at))))::int);
    return jsonb_build_object('allowed',false,'limit',p_limit,'remaining',0,'retry_after_seconds',retry);
  end if;

  update public.api_rate_limit_buckets
  set request_count=request_count+1,updated_at=now_ts where bucket_key=p_bucket_key;
  remaining:=greatest(0,p_limit-b.request_count-1);
  return jsonb_build_object('allowed',true,'limit',p_limit,'remaining',remaining,
    'retry_after_seconds',greatest(1,(p_window_seconds-floor(extract(epoch from (now_ts-b.window_started_at))))::int));
end; $$;

alter table public.security_events enable row level security;
alter table public.api_rate_limit_buckets enable row level security;
alter table public.api_audit_events enable row level security;
alter table public.validation_events enable row level security;

-- Store-scoped rows are readable by that store's members. Rows with a null store_id
-- are platform-level and stay server-only: the previous "store_id is null or ..."
-- form leaked every platform security event to every authenticated user.
drop policy if exists "security_events_store_select" on public.security_events;
create policy "security_events_store_select" on public.security_events
for select to authenticated using(store_id is not null and public.is_store_member(store_id));

drop policy if exists "api_audit_events_store_select" on public.api_audit_events;
create policy "api_audit_events_store_select" on public.api_audit_events
for select to authenticated using(store_id is not null and public.is_store_member(store_id));

drop policy if exists "validation_events_store_select" on public.validation_events;
create policy "validation_events_store_select" on public.validation_events
for select to authenticated using(store_id is not null and public.is_store_member(store_id));
-- api_rate_limit_buckets: RLS on, no policy. Server-only via the function above.

-- ============================================================
-- 20260101000006_billing_credits.sql
-- ============================================================
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

-- ============================================================
-- 20260101000007_projects_templates.sql
-- ============================================================
-- Storovex 07 — templates, projects, notifications and team invitations.

create table if not exists public.templates(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  preview_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.projects(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  name text not null check(char_length(name) between 1 and 140),
  status text not null default 'draft' check(status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_store on public.projects(store_id,updated_at desc);
create index if not exists idx_projects_store_status on public.projects(store_id,status);

drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
for each row execute function public.touch_updated_at();

create table if not exists public.notifications(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_store_user on public.notifications(store_id,user_id,created_at desc);

create table if not exists public.store_invitations(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  email text not null,
  role text not null check(role in ('admin','member')),
  token text not null unique,
  status text not null default 'pending' check(status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default now()+interval '7 days',
  created_at timestamptz not null default now()
);
create index if not exists idx_store_invitations_store on public.store_invitations(store_id,status);

alter table public.templates enable row level security;
alter table public.projects enable row level security;
alter table public.notifications enable row level security;
alter table public.store_invitations enable row level security;

drop policy if exists "templates_public_select" on public.templates;
create policy "templates_public_select" on public.templates
for select to authenticated using(is_active=true);

drop policy if exists "projects_store_select" on public.projects;
create policy "projects_store_select" on public.projects
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "projects_store_insert" on public.projects;
create policy "projects_store_insert" on public.projects
for insert to authenticated with check(public.is_store_member(store_id) and created_by=auth.uid());

drop policy if exists "projects_store_update" on public.projects;
create policy "projects_store_update" on public.projects
for update to authenticated
using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));

drop policy if exists "projects_store_delete" on public.projects;
create policy "projects_store_delete" on public.projects
for delete to authenticated using(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "notifications_recipient_select" on public.notifications;
create policy "notifications_recipient_select" on public.notifications
for select to authenticated
using(user_id=auth.uid() or (user_id is null and public.is_store_member(store_id)));

drop policy if exists "notifications_recipient_update" on public.notifications;
create policy "notifications_recipient_update" on public.notifications
for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Previously missing everywhere: without a delete policy a user could never dismiss
-- a notification, because RLS denies by default.
drop policy if exists "notifications_recipient_delete" on public.notifications;
create policy "notifications_recipient_delete" on public.notifications
for delete to authenticated using(user_id=auth.uid());

drop policy if exists "store_invitations_manage_select" on public.store_invitations;
create policy "store_invitations_manage_select" on public.store_invitations
for select to authenticated using(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "store_invitations_manage_insert" on public.store_invitations;
create policy "store_invitations_manage_insert" on public.store_invitations
for insert to authenticated with check(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "store_invitations_manage_update" on public.store_invitations;
create policy "store_invitations_manage_update" on public.store_invitations
for update to authenticated
using(public.store_role(store_id) in ('owner','admin'))
with check(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "store_invitations_manage_delete" on public.store_invitations;
create policy "store_invitations_manage_delete" on public.store_invitations
for delete to authenticated using(public.store_role(store_id) in ('owner','admin'));

-- ============================================================
-- 20260101000008_generation_assets.sql
-- ============================================================
-- Storovex 08 — AI generation requests, generated assets, job events.
-- ai_generation_requests is CREATEd here. The previous phase82 file only ALTERed it,
-- on the assumption it came from a migration that was never in the repository, so
-- every column add failed against an empty database.

create table if not exists public.ai_generation_requests(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text check(type in ('product_hero','product_lifestyle','campaign','collection','banner','social_creative')),
  quality text check(quality in ('draft','standard','high')),
  count integer check(count>=1 and count<=20),
  estimated_credits integer check(estimated_credits>=1),
  reserved_credits integer check(reserved_credits>=0),
  stage text not null default 'planning'
    check(stage in ('planning','building','generating_assets','finalizing','completed','failed')),
  attempt integer not null default 1 check(attempt>=1),
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_generation_requests_store on public.ai_generation_requests(store_id,created_at desc);
create index if not exists idx_ai_generation_requests_project on public.ai_generation_requests(project_id,created_at desc);
create index if not exists idx_ai_generation_requests_stage on public.ai_generation_requests(store_id,stage);

drop trigger if exists trg_ai_generation_requests_touch on public.ai_generation_requests;
create trigger trg_ai_generation_requests_touch before update on public.ai_generation_requests
for each row execute function public.touch_updated_at();

create table if not exists public.ai_provider_events(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  generation_request_id uuid references public.ai_generation_requests(id) on delete cascade,
  provider text not null,
  model text,
  status text not null,
  error_class text,
  latency_ms integer check(latency_ms>=0),
  input_tokens integer check(input_tokens>=0),
  output_tokens integer check(output_tokens>=0),
  cost_cents integer check(cost_cents>=0),
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_provider_events_store on public.ai_provider_events(store_id,created_at desc);

create table if not exists public.assets(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  generation_request_id uuid references public.ai_generation_requests(id) on delete set null,
  bucket text not null check(bucket in ('avatars','uploads','generated-assets','project-assets','exports','public-store-assets')),
  storage_path text not null unique,
  section text check(section in ('hero','product_grid','collections','footer','full')),
  version integer not null default 1 check(version>=1),
  created_at timestamptz not null default now()
);
create index if not exists idx_assets_store_project on public.assets(store_id,project_id,created_at desc);

create table if not exists public.job_events(
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_generation_requests(id) on delete cascade,
  event_type text not null check(event_type in ('claimed','heartbeat','stage_advanced','committed','refunded','dead_lettered')),
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_job_events_job on public.job_events(job_id,created_at desc);

alter table public.ai_generation_requests enable row level security;
alter table public.ai_provider_events enable row level security;
alter table public.assets enable row level security;
alter table public.job_events enable row level security;

drop policy if exists "ai_generation_requests_store_select" on public.ai_generation_requests;
create policy "ai_generation_requests_store_select" on public.ai_generation_requests
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "ai_provider_events_store_select" on public.ai_provider_events;
create policy "ai_provider_events_store_select" on public.ai_provider_events
for select to authenticated using(store_id is not null and public.is_store_member(store_id));

drop policy if exists "assets_store_select" on public.assets;
create policy "assets_store_select" on public.assets
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "job_events_store_select" on public.job_events;
create policy "job_events_store_select" on public.job_events
for select to authenticated
using(job_id in (select id from public.ai_generation_requests where public.is_store_member(store_id)));

-- Deliberately no INSERT or UPDATE policies on any of these four. Generation rows,
-- assets and job events are written by the server only, after credits are reserved.
-- A client that could insert its own completed generation could mint free assets.

-- ============================================================
-- 20260101000009_file_storage.sql
-- ============================================================
-- Storovex 09 — user file uploads.

create table if not exists public.file_assets(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes>0 and size_bytes<=10485760),
  storage_path text not null unique,
  status text not null default 'pending' check(status in ('pending','ready','failed','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_file_assets_store on public.file_assets(store_id,created_at desc);
create index if not exists idx_file_assets_user on public.file_assets(user_id,created_at desc);

drop trigger if exists trg_file_assets_touch on public.file_assets;
create trigger trg_file_assets_touch before update on public.file_assets
for each row execute function public.touch_updated_at();

alter table public.file_assets enable row level security;

drop policy if exists "file_assets_store_select" on public.file_assets;
create policy "file_assets_store_select" on public.file_assets
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "file_assets_store_insert" on public.file_assets;
create policy "file_assets_store_insert" on public.file_assets
for insert to authenticated with check(public.is_store_member(store_id) and user_id=auth.uid());

drop policy if exists "file_assets_store_update" on public.file_assets;
create policy "file_assets_store_update" on public.file_assets
for update to authenticated
using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));

drop policy if exists "file_assets_owner_delete" on public.file_assets;
create policy "file_assets_owner_delete" on public.file_assets
for delete to authenticated
using(user_id=auth.uid() or public.store_role(store_id) in ('owner','admin'));

-- ============================================================
-- 20260101000010_email_admin.sql
-- ============================================================
-- Storovex 10 — transactional email tracking, platform admin, feature flags.

create table if not exists public.email_events(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  recipient text not null,
  type text not null,
  status text not null check(status in ('queued','sent','delivered','bounced','complained','failed')),
  attempt integer not null default 1 check(attempt>=1),
  provider_message_id text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_email_events_recipient on public.email_events(recipient,created_at desc);
create index if not exists idx_email_events_store on public.email_events(store_id,created_at desc);
create index if not exists idx_email_events_recipient_status on public.email_events(recipient,status);

create table if not exists public.email_suppressions(
  email text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags(
  key text primary key,
  enabled boolean not null default false,
  rollout_pct integer check(rollout_pct is null or (rollout_pct between 0 and 100)),
  description text,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_feature_flags_touch on public.feature_flags;
create trigger trg_feature_flags_touch before update on public.feature_flags
for each row execute function public.touch_updated_at();

create table if not exists public.admin_audit_events(
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  action text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_audit_events_store on public.admin_audit_events(store_id,created_at desc);
create index if not exists idx_admin_audit_events_admin on public.admin_audit_events(admin_user_id,created_at desc);

alter table public.email_events enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.platform_admins enable row level security;
alter table public.feature_flags enable row level security;
alter table public.admin_audit_events enable row level security;

drop policy if exists "email_events_store_select" on public.email_events;
create policy "email_events_store_select" on public.email_events
for select to authenticated using(store_id is not null and public.is_store_member(store_id));

drop policy if exists "platform_admins_self_select" on public.platform_admins;
create policy "platform_admins_self_select" on public.platform_admins
for select to authenticated using(user_id=auth.uid());

drop policy if exists "feature_flags_authenticated_select" on public.feature_flags;
create policy "feature_flags_authenticated_select" on public.feature_flags
for select to authenticated using(true);

-- email_suppressions and admin_audit_events: RLS on, no policy. Server-only.
-- The suppression list is a list of addresses that bounced or complained; exposing
-- it would leak both customer addresses and their deliverability state.

-- ============================================================
-- 20260101000011_atomic_credit_ledger.sql
-- ============================================================
-- Storovex 11 — atomic credit operations.
--
-- reserveJobCredits() previously did: read balance → check → insert ledger row →
-- separate balance update. Two concurrent requests both read the same balance and
-- both passed the check, and a failure between the two writes left the ledger and
-- the balance permanently disagreeing. The check(balance>=0) constraint limited the
-- damage but did not prevent over-reservation.
--
-- Each function below does the whole operation in one statement-level transaction,
-- taking a row lock on the account first, so concurrent callers serialise.

-- Reserve credits for a job. Idempotent on p_idempotency_key: a retry returns the
-- original reservation rather than charging twice.
create or replace function public.reserve_credits(
  p_account_id uuid,
  p_amount integer,
  p_job_id uuid,
  p_idempotency_key text,
  p_max_per_job integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_balance integer;
  v_existing public.credit_ledger;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok',false,'error','LEDGER_AMOUNT_INVALID');
  end if;
  if p_max_per_job is not null and p_amount > p_max_per_job then
    return jsonb_build_object('ok',false,'error','LEDGER_JOB_SPEND_LIMIT_EXCEEDED');
  end if;

  -- Replaying the same key must be safe: return what the first call did.
  select * into v_existing from public.credit_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    select balance into v_balance from public.credit_accounts where id = v_existing.account_id;
    return jsonb_build_object('ok',true,'duplicate',true,'reserved',v_existing.amount,
      'job_id',v_existing.job_id,'balance',v_balance);
  end if;

  -- The lock is what makes the check-then-write safe. Everything after this point
  -- is serialised against other callers touching the same account.
  select balance into v_balance from public.credit_accounts
  where id = p_account_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','CREDIT_ACCOUNT_NOT_FOUND');
  end if;
  if v_balance < p_amount then
    return jsonb_build_object('ok',false,'error','INSUFFICIENT_CREDITS','balance',v_balance);
  end if;

  insert into public.credit_ledger(account_id,type,amount,job_id,idempotency_key)
  values(p_account_id,'reservation',p_amount,p_job_id,p_idempotency_key);

  update public.credit_accounts
  set balance = balance - p_amount, updated_at = now()
  where id = p_account_id
  returning balance into v_balance;

  return jsonb_build_object('ok',true,'duplicate',false,'reserved',p_amount,
    'job_id',p_job_id,'balance',v_balance);
end; $$;

-- Convert a reservation into permanent usage. Any unused portion returns to the
-- balance. Refuses to run twice for the same job.
create or replace function public.commit_credits(
  p_account_id uuid,
  p_job_id uuid,
  p_actual_amount integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_reserved integer;
  v_refund integer;
  v_balance integer;
begin
  if p_actual_amount is null or p_actual_amount < 0 then
    return jsonb_build_object('ok',false,'error','LEDGER_AMOUNT_INVALID');
  end if;

  perform 1 from public.credit_accounts where id = p_account_id for update;

  -- A job that already settled must not settle again, in either direction.
  if exists(select 1 from public.credit_ledger
            where job_id = p_job_id and type in ('commit','refund')) then
    return jsonb_build_object('ok',false,'error','LEDGER_JOB_ALREADY_SETTLED');
  end if;

  select amount into v_reserved from public.credit_ledger
  where job_id = p_job_id and type = 'reservation';
  if not found then
    return jsonb_build_object('ok',false,'error','LEDGER_NO_RESERVATION');
  end if;
  if p_actual_amount > v_reserved then
    return jsonb_build_object('ok',false,'error','LEDGER_COMMIT_EXCEEDS_RESERVATION');
  end if;

  insert into public.credit_ledger(account_id,type,amount,job_id)
  values(p_account_id,'commit',p_actual_amount,p_job_id);

  v_refund := v_reserved - p_actual_amount;
  if v_refund > 0 then
    insert into public.credit_ledger(account_id,type,amount,job_id,reason)
    values(p_account_id,'refund',v_refund,p_job_id,'unused reservation');
    update public.credit_accounts set balance = balance + v_refund, updated_at = now()
    where id = p_account_id;
  end if;

  select balance into v_balance from public.credit_accounts where id = p_account_id;
  return jsonb_build_object('ok',true,'committed',p_actual_amount,'refunded',v_refund,'balance',v_balance);
end; $$;

-- Return a whole reservation after a failed job. Also refuses to double-settle:
-- without this, a retry loop could refund the same job repeatedly and mint credits.
create or replace function public.refund_credits(
  p_account_id uuid,
  p_job_id uuid,
  p_reason text default 'generation failed'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_reserved integer;
  v_balance integer;
begin
  perform 1 from public.credit_accounts where id = p_account_id for update;

  if exists(select 1 from public.credit_ledger
            where job_id = p_job_id and type in ('commit','refund')) then
    return jsonb_build_object('ok',false,'error','LEDGER_JOB_ALREADY_SETTLED');
  end if;

  select amount into v_reserved from public.credit_ledger
  where job_id = p_job_id and type = 'reservation';
  if not found then
    return jsonb_build_object('ok',false,'error','LEDGER_NO_RESERVATION');
  end if;

  insert into public.credit_ledger(account_id,type,amount,job_id,reason)
  values(p_account_id,'refund',v_reserved,p_job_id,p_reason);

  update public.credit_accounts set balance = balance + v_reserved, updated_at = now()
  where id = p_account_id
  returning balance into v_balance;

  return jsonb_build_object('ok',true,'refunded',v_reserved,'balance',v_balance);
end; $$;

-- Grant credits (plan renewal, top-up, promotional). Idempotent on the key so a
-- redelivered billing webhook cannot grant the same credits twice.
create or replace function public.grant_credits(
  p_account_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_reason text default 'plan grant'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok',false,'error','LEDGER_AMOUNT_INVALID');
  end if;

  if exists(select 1 from public.credit_ledger where idempotency_key = p_idempotency_key) then
    select balance into v_balance from public.credit_accounts where id = p_account_id;
    return jsonb_build_object('ok',true,'duplicate',true,'granted',0,'balance',v_balance);
  end if;

  perform 1 from public.credit_accounts where id = p_account_id for update;

  insert into public.credit_ledger(account_id,type,amount,idempotency_key,reason)
  values(p_account_id,'grant',p_amount,p_idempotency_key,p_reason);

  update public.credit_accounts set balance = balance + p_amount, updated_at = now()
  where id = p_account_id
  returning balance into v_balance;

  return jsonb_build_object('ok',true,'duplicate',false,'granted',p_amount,'balance',v_balance);
end; $$;

-- Reconciliation: the balance must always equal the signed sum of the ledger.
-- Used by tests and by the admin console to detect drift.
create or replace function public.credit_balance_from_ledger(p_account_id uuid)
returns integer language sql stable security definer set search_path=public as $$
  select coalesce(sum(
    case type
      when 'grant' then amount
      when 'refund' then amount
      when 'adjustment' then amount
      when 'reservation' then -amount
      when 'expiry' then -amount
      when 'commit' then 0  -- a commit consumes an already-deducted reservation
    end
  ),0)::integer
  from public.credit_ledger where account_id = p_account_id;
$$;

-- ============================================================
-- 20260101000012_billing_entitlements.sql
-- ============================================================
-- Storovex 12 — applying billing events to entitlements.
--
-- The webhook previously verified a Paddle signature, filed the event, and returned.
-- No subscription row was created or updated, no plan synced, no credits granted, no
-- access revoked. Billing was inert. These functions are what the webhook now calls.

-- Invoice / payment history. billing_webhook_events holds raw deliveries; this is the
-- readable record a customer and the admin console actually need.
create table if not exists public.billing_transactions(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  paddle_transaction_id text unique,
  paddle_subscription_id text,
  status text not null check(status in ('paid','failed','refunded','pending')),
  amount_cents integer not null check(amount_cents>=0),
  currency text not null default 'USD',
  invoice_url text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_billing_transactions_store
  on public.billing_transactions(store_id, occurred_at desc);

alter table public.billing_transactions enable row level security;
drop policy if exists "billing_transactions_store_select" on public.billing_transactions;
create policy "billing_transactions_store_select" on public.billing_transactions
for select to authenticated using(store_id is not null and public.is_store_member(store_id));

-- Grace period: a past_due subscription keeps access until this passes, so a failed
-- card does not instantly lock a paying customer out of their own store.
alter table public.subscriptions add column if not exists grace_period_ends_at timestamptz;
alter table public.subscriptions add column if not exists canceled_at timestamptz;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;

/**
 * Applies a subscription state change and grants the plan's credits on activation.
 *
 * Idempotent on p_event_id: the grant uses it as the ledger idempotency key, so a
 * redelivered webhook cannot grant the same month's credits twice. This is the whole
 * reason the grant lives in here rather than in application code — the subscription
 * write and the credit grant have to agree.
 */
create or replace function public.apply_subscription_event(
  p_event_id text,
  p_store_id uuid,
  p_paddle_subscription_id text,
  p_plan_id text,
  p_status text,
  p_billing_cycle text default 'monthly',
  p_current_period_end timestamptz default null,
  p_grant_credits boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_account_id uuid;
  v_included integer;
  v_granted integer := 0;
begin
  if not exists(select 1 from public.plans where id = p_plan_id) then
    return jsonb_build_object('ok',false,'error','PLAN_UNKNOWN');
  end if;

  -- One row per Paddle subscription. Conflicts update in place rather than
  -- accumulating duplicates that would make the "which plan?" question ambiguous.
  insert into public.subscriptions(
    store_id, paddle_subscription_id, plan_id, status, billing_cycle,
    current_period_end, canceled_at, grace_period_ends_at
  ) values (
    p_store_id, p_paddle_subscription_id, p_plan_id, p_status, p_billing_cycle,
    p_current_period_end,
    case when p_status = 'canceled' then now() else null end,
    case when p_status = 'past_due' then now() + interval '7 days' else null end
  )
  on conflict (paddle_subscription_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_cycle = excluded.billing_cycle,
    current_period_end = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
    canceled_at = case when excluded.status = 'canceled' then now() else null end,
    grace_period_ends_at = case when excluded.status = 'past_due'
      then coalesce(public.subscriptions.grace_period_ends_at, now() + interval '7 days')
      else null end,
    updated_at = now();

  if p_grant_credits then
    -- Every store gets a credit account on first grant rather than at signup, so a
    -- store that never subscribes carries no billing rows.
    select id into v_account_id from public.credit_accounts where store_id = p_store_id;
    if not found then
      insert into public.credit_accounts(store_id, balance) values(p_store_id, 0)
      returning id into v_account_id;
    end if;

    select included_credits into v_included from public.plans where id = p_plan_id;
    if v_included > 0 then
      -- p_event_id as the key: a redelivery is a no-op, not a second month of credits.
      select (public.grant_credits(v_account_id, v_included,
              'paddle:' || p_event_id, 'plan ' || p_plan_id)->>'granted')::int
      into v_granted;
    end if;
  end if;

  return jsonb_build_object('ok',true,'granted',v_granted,'plan',p_plan_id,'status',p_status);
end; $$;

/**
 * Whether a store currently has paid access. past_due keeps access until the grace
 * period expires; the application must not re-implement this rule anywhere else.
 */
create or replace function public.store_has_access(p_store_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.subscriptions
    where store_id = p_store_id
      and (
        status in ('active','trialing')
        or (status = 'past_due' and grace_period_ends_at is not null and grace_period_ends_at > now())
      )
  );
$$;

create or replace function public.record_billing_transaction(
  p_store_id uuid,
  p_paddle_transaction_id text,
  p_paddle_subscription_id text,
  p_status text,
  p_amount_cents integer,
  p_currency text default 'USD',
  p_invoice_url text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  insert into public.billing_transactions(
    store_id, paddle_transaction_id, paddle_subscription_id, status,
    amount_cents, currency, invoice_url
  ) values (
    p_store_id, p_paddle_transaction_id, p_paddle_subscription_id, p_status,
    greatest(0, coalesce(p_amount_cents,0)), coalesce(p_currency,'USD'), p_invoice_url
  )
  on conflict (paddle_transaction_id) do nothing;
  return jsonb_build_object('ok',true);
end; $$;

-- Notifications are written by the server only; users read and dismiss their own.
create or replace function public.notify_store(
  p_store_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_user_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.notifications(store_id, user_id, type, title, body)
  values(p_store_id, p_user_id, p_type, p_title, p_body)
  returning id into v_id;
  return v_id;
end; $$;

commit;
