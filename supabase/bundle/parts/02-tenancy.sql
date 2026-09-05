-- Storovex schema — part 02 of 12: tenancy
-- Run the parts in numeric order. Each depends only on the parts before it.
-- Safe to re-run: every statement is idempotent.

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
