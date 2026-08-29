
create table if not exists public.validation_events(
 id uuid primary key default gen_random_uuid(),
 store_id uuid,
 actor_user_id uuid,
 event_type text not null,
 field_name text,
 reason text not null,
 created_at timestamptz not null default now()
);
create index if not exists idx_validation_events_time on public.validation_events(created_at desc);
alter table public.validation_events enable row level security;
create policy if not exists "validation_events_store_select"
on public.validation_events for select to authenticated
using(store_id is null or store_id=public.current_store_id());
