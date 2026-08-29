
create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text,
 avatar_path text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy if not exists "profiles_self_select" on public.profiles for select to authenticated using(id=auth.uid());
create policy if not exists "profiles_self_update" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy if not exists "profiles_self_insert" on public.profiles for insert to authenticated with check(id=auth.uid());

create table if not exists public.stores(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 owner_id uuid not null references auth.users(id),
 theme text not null default 'default',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.stores enable row level security;
create policy if not exists "stores_member_select" on public.stores for select to authenticated
using(public.is_store_member(id));
create policy if not exists "stores_owner_update" on public.stores for update to authenticated
using(public.store_role(id)='owner') with check(public.store_role(id)='owner');

create table if not exists public.templates(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 category text not null,
 preview_path text,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.templates enable row level security;
create policy if not exists "templates_public_select" on public.templates for select to authenticated using(is_active=true);

create table if not exists public.projects(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 template_id uuid references public.templates(id),
 name text not null check(char_length(name)>=1 and char_length(name)<=140),
 status text not null default 'draft' check(status in ('draft','active','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_projects_store on public.projects(store_id,updated_at desc);
create index if not exists idx_projects_store_status on public.projects(store_id,status);
alter table public.projects enable row level security;
create policy if not exists "projects_store_select" on public.projects for select to authenticated
using(public.is_store_member(store_id));
create policy if not exists "projects_store_write" on public.projects for insert to authenticated
with check(public.is_store_member(store_id));
create policy if not exists "projects_store_update" on public.projects for update to authenticated
using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));
create policy if not exists "projects_store_delete" on public.projects for delete to authenticated
using(public.store_role(store_id) in ('owner','admin'));

create table if not exists public.notifications(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 user_id uuid references auth.users(id),
 type text not null,
 title text not null,
 body text,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists idx_notifications_store_user on public.notifications(store_id,user_id,created_at desc);
alter table public.notifications enable row level security;
create policy if not exists "notifications_recipient_select" on public.notifications for select to authenticated
using(user_id=auth.uid() or (user_id is null and public.is_store_member(store_id)));
create policy if not exists "notifications_recipient_update" on public.notifications for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.store_invitations(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 email text not null,
 role text not null check(role in ('admin','member')),
 token text not null unique,
 status text not null default 'pending' check(status in ('pending','accepted','revoked')),
 created_at timestamptz not null default now()
);
create index if not exists idx_store_invitations_store on public.store_invitations(store_id,status);
alter table public.store_invitations enable row level security;
create policy if not exists "store_invitations_manage_select" on public.store_invitations for select to authenticated
using(public.store_role(store_id) in ('owner','admin'));
create policy if not exists "store_invitations_manage_insert" on public.store_invitations for insert to authenticated
with check(public.store_role(store_id) in ('owner','admin'));
