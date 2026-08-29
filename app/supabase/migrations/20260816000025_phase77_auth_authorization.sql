
create table if not exists public.store_members (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','admin','member')),
 status text not null default 'active' check(status in ('active','invited','suspended')),
 created_at timestamptz not null default now(),
 unique(store_id,user_id)
);
create index if not exists idx_store_members_user on public.store_members(user_id,store_id);
create index if not exists idx_store_members_store on public.store_members(store_id,role);

alter table public.store_members enable row level security;

create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.store_members where store_id=p_store_id and user_id=auth.uid() and status='active');
$$;

create or replace function public.store_role(p_store_id uuid)
returns text language sql stable security definer set search_path=public as $$
 select role from public.store_members where store_id=p_store_id and user_id=auth.uid() and status='active' limit 1;
$$;

create policy if not exists "store_members_read_own_store"
on public.store_members for select to authenticated
using(public.is_store_member(store_id));

create policy if not exists "store_members_insert_owner_admin"
on public.store_members for insert to authenticated
with check(public.store_role(store_id) in ('owner','admin'));

create policy if not exists "store_members_update_owner_admin"
on public.store_members for update to authenticated
using(public.store_role(store_id) in ('owner','admin'))
with check(public.store_role(store_id) in ('owner','admin'));

-- Harden existing sensitive tables against cross-store reads/writes.
drop policy if exists "ai_generation_requests_store_isolation" on public.ai_generation_requests;
create policy "ai_generation_requests_store_isolation"
on public.ai_generation_requests for select to authenticated
using(public.is_store_member(store_id));

drop policy if exists "ai_generation_requests_store_insert" on public.ai_generation_requests;
create policy "ai_generation_requests_store_insert"
on public.ai_generation_requests for insert to authenticated
with check(public.is_store_member(store_id));

drop policy if exists "ai_generation_requests_store_update" on public.ai_generation_requests;
create policy "ai_generation_requests_store_update"
on public.ai_generation_requests for update to authenticated
using(public.is_store_member(store_id))
with check(public.is_store_member(store_id));

-- Provider events can be viewed only by members of their store.
drop policy if exists "ai_provider_events_store_isolation" on public.ai_provider_events;
create policy "ai_provider_events_store_isolation"
on public.ai_provider_events for select to authenticated
using(store_id is null or public.is_store_member(store_id));

-- Security events are append-only from trusted server code; users can only read their store events.
create table if not exists public.security_events (
 id uuid primary key default gen_random_uuid(),
 store_id uuid,
 user_id uuid,
 event_type text not null,
 severity text not null default 'info' check(severity in ('info','warning','critical')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_security_events_store on public.security_events(store_id,created_at desc);
alter table public.security_events enable row level security;
create policy if not exists "security_events_store_read"
on public.security_events for select to authenticated
using(store_id is null or public.is_store_member(store_id));
