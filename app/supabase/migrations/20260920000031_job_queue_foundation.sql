
-- job_queue itself was never included in any zip delivered so far, even though
-- Phase 74's heartbeat_job/recover_stale_jobs and Phase 75's capacity functions
-- already assume it exists. Every column here is one those functions already
-- reference by name (status, locked_at, locked_by, attempts, max_attempts,
-- run_after, error_message, updated_at) — nothing here is guessed business logic,
-- it's the minimum schema the existing code requires to run at all.
-- If your full project already has a job_queue table from an earlier phase,
-- this is a no-op (create table if not exists) — drop this file instead of
-- applying it, or verify the column set matches before applying.
create table if not exists public.job_queue(
 id uuid primary key default gen_random_uuid(),
 store_id uuid,
 user_id uuid,
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
alter table public.job_queue enable row level security;
create policy if not exists "job_queue_store_select" on public.job_queue for select to authenticated
using(store_id is null or public.is_store_member(store_id));

-- Ordering mirrors scheduler.ts's fairSort/priorityWeight exactly: highest, then
-- high, then standard, FIFO within each tier. Skips locked rows so concurrent
-- workers never double-claim the same job.
create or replace function public.claim_next_job(p_worker_id text)
returns public.job_queue language plpgsql security definer set search_path=public as $$
declare claimed public.job_queue;
begin
 update public.job_queue j set
  status='processing',locked_by=p_worker_id,locked_at=now(),
  attempts=attempts+1,updated_at=now()
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
