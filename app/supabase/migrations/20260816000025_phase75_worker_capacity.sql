create table if not exists public.worker_capacity (
 worker_id text primary key,
 active_jobs integer not null default 0 check(active_jobs>=0),
 max_jobs integer not null default 1 check(max_jobs>0),
 last_heartbeat timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.job_rate_buckets (
 bucket_key text primary key,
 window_start timestamptz not null,
 request_count integer not null default 0 check(request_count>=0),
 updated_at timestamptz not null default now()
);
create index if not exists idx_worker_capacity_heartbeat on public.worker_capacity(last_heartbeat);
alter table public.worker_capacity enable row level security;
alter table public.job_rate_buckets enable row level security;
create or replace function public.try_acquire_worker_slot(p_worker_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare ok boolean;
begin
 update public.worker_capacity set active_jobs=active_jobs+1,updated_at=now()
 where worker_id=p_worker_id and active_jobs<max_jobs;
 get diagnostics ok = row_count > 0;
 return ok;
end; $$;
create or replace function public.release_worker_slot(p_worker_id text)
returns boolean language plpgsql security definer set search_path=public as $$
begin update public.worker_capacity set active_jobs=greatest(0,active_jobs-1),updated_at=now() where worker_id=p_worker_id; return found; end; $$;
