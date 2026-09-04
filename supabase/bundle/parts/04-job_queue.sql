-- Storovex schema — part 04 of 12: job_queue
-- Run the parts in numeric order. Each depends only on the parts before it.
-- Safe to re-run: every statement is idempotent.

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
