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
