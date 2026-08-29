create index if not exists idx_job_queue_lease on public.job_queue(status,locked_at);
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
 with stale as (select id from public.job_queue where status='processing' and locked_at < now()-make_interval(mins=>p_timeout_minutes) for update skip locked)
 update public.job_queue j set status=case when attempts>=max_attempts then 'dead_letter' else 'queued' end,
 run_after=now(),locked_at=null,locked_by=null,updated_at=now(),
 error_message=coalesce(error_message,'worker lease expired')
 where j.id in (select id from stale);
 get diagnostics n=row_count; return n;
end; $$;
