
create table if not exists public.api_audit_events (
 id uuid primary key default gen_random_uuid(),
 store_id uuid,
 actor_user_id uuid,
 method text not null,
 route text not null,
 status_code integer not null,
 request_id text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_api_audit_events_store_time on public.api_audit_events(store_id,created_at desc);
create index if not exists idx_api_audit_events_route_time on public.api_audit_events(route,created_at desc);
alter table public.api_audit_events enable row level security;
create policy if not exists "api_audit_events_store_select"
on public.api_audit_events for select to authenticated
using(store_id is null or store_id=public.current_store_id());
