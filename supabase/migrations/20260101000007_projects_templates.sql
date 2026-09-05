-- Storovex 07 — templates, projects, notifications and team invitations.

create table if not exists public.templates(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  preview_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.projects(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  name text not null check(char_length(name) between 1 and 140),
  status text not null default 'draft' check(status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_store on public.projects(store_id,updated_at desc);
create index if not exists idx_projects_store_status on public.projects(store_id,status);

drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
for each row execute function public.touch_updated_at();

create table if not exists public.notifications(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_store_user on public.notifications(store_id,user_id,created_at desc);

create table if not exists public.store_invitations(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  email text not null,
  role text not null check(role in ('admin','member')),
  token text not null unique,
  status text not null default 'pending' check(status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default now()+interval '7 days',
  created_at timestamptz not null default now()
);
create index if not exists idx_store_invitations_store on public.store_invitations(store_id,status);

alter table public.templates enable row level security;
alter table public.projects enable row level security;
alter table public.notifications enable row level security;
alter table public.store_invitations enable row level security;

drop policy if exists "templates_public_select" on public.templates;
create policy "templates_public_select" on public.templates
for select to authenticated using(is_active=true);

drop policy if exists "projects_store_select" on public.projects;
create policy "projects_store_select" on public.projects
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "projects_store_insert" on public.projects;
create policy "projects_store_insert" on public.projects
for insert to authenticated with check(public.is_store_member(store_id) and created_by=auth.uid());

drop policy if exists "projects_store_update" on public.projects;
create policy "projects_store_update" on public.projects
for update to authenticated
using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));

drop policy if exists "projects_store_delete" on public.projects;
create policy "projects_store_delete" on public.projects
for delete to authenticated using(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "notifications_recipient_select" on public.notifications;
create policy "notifications_recipient_select" on public.notifications
for select to authenticated
using(user_id=auth.uid() or (user_id is null and public.is_store_member(store_id)));

drop policy if exists "notifications_recipient_update" on public.notifications;
create policy "notifications_recipient_update" on public.notifications
for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Previously missing everywhere: without a delete policy a user could never dismiss
-- a notification, because RLS denies by default.
drop policy if exists "notifications_recipient_delete" on public.notifications;
create policy "notifications_recipient_delete" on public.notifications
for delete to authenticated using(user_id=auth.uid());

drop policy if exists "store_invitations_manage_select" on public.store_invitations;
create policy "store_invitations_manage_select" on public.store_invitations
for select to authenticated using(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "store_invitations_manage_insert" on public.store_invitations;
create policy "store_invitations_manage_insert" on public.store_invitations
for insert to authenticated with check(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "store_invitations_manage_update" on public.store_invitations;
create policy "store_invitations_manage_update" on public.store_invitations
for update to authenticated
using(public.store_role(store_id) in ('owner','admin'))
with check(public.store_role(store_id) in ('owner','admin'));

drop policy if exists "store_invitations_manage_delete" on public.store_invitations;
create policy "store_invitations_manage_delete" on public.store_invitations
for delete to authenticated using(public.store_role(store_id) in ('owner','admin'));
