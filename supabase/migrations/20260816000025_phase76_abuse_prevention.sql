
create table if not exists public.security_events (
 id uuid primary key default gen_random_uuid(),
 store_id uuid,
 user_id uuid,
 event_type text not null,
 risk_score integer not null default 0 check(risk_score between 0 and 100),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_security_events_time on public.security_events(created_at desc);
create index if not exists idx_security_events_store on public.security_events(store_id,created_at desc);
alter table public.security_events enable row level security;
create policy if not exists "security_events_store_select"
on public.security_events for select to authenticated
using(store_id is null or store_id=public.current_store_id());

create table if not exists public.api_rate_limit_buckets (
 bucket_key text primary key,
 window_started_at timestamptz not null default now(),
 request_count integer not null default 0,
 blocked_until timestamptz,
 updated_at timestamptz not null default now()
);
create index if not exists idx_rate_limit_blocked on public.api_rate_limit_buckets(blocked_until);
alter table public.api_rate_limit_buckets enable row level security;

create or replace function public.check_api_rate_limit(
 p_bucket_key text,p_limit integer,p_window_seconds integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.api_rate_limit_buckets; now_ts timestamptz:=now(); remaining integer; retry integer;
begin
 insert into public.api_rate_limit_buckets(bucket_key,window_started_at,request_count,updated_at)
 values(p_bucket_key,now_ts,1,now_ts)
 on conflict(bucket_key) do nothing;
 select * into b from public.api_rate_limit_buckets where bucket_key=p_bucket_key for update;
 if b.blocked_until is not null and b.blocked_until>now_ts then
  return jsonb_build_object('allowed',false,'limit',p_limit,'remaining',0,'retry_after_seconds',ceil(extract(epoch from (b.blocked_until-now_ts))));
 end if;
 if extract(epoch from (now_ts-b.window_started_at))>=p_window_seconds then
  update public.api_rate_limit_buckets set window_started_at=now_ts,request_count=1,updated_at=now_ts,blocked_until=null where bucket_key=p_bucket_key;
  return jsonb_build_object('allowed',true,'limit',p_limit,'remaining',p_limit-1,'retry_after_seconds',p_window_seconds);
 end if;
 if b.request_count>=p_limit then
  retry:=greatest(1,p_window_seconds-floor(extract(epoch from (now_ts-b.window_started_at))));
  return jsonb_build_object('allowed',false,'limit',p_limit,'remaining',0,'retry_after_seconds',retry);
 end if;
 update public.api_rate_limit_buckets set request_count=request_count+1,updated_at=now_ts where bucket_key=p_bucket_key;
 remaining:=greatest(0,p_limit-b.request_count-1);
 return jsonb_build_object('allowed',true,'limit',p_limit,'remaining',remaining,'retry_after_seconds',greatest(1,p_window_seconds-floor(extract(epoch from (now_ts-b.window_started_at)))));
end;
$$;
