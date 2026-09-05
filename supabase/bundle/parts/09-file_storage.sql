-- Storovex schema — part 09 of 12: file_storage
-- Run the parts in numeric order. Each depends only on the parts before it.
-- Safe to re-run: every statement is idempotent.

-- Storovex 09 — user file uploads.

create table if not exists public.file_assets(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes>0 and size_bytes<=10485760),
  storage_path text not null unique,
  status text not null default 'pending' check(status in ('pending','ready','failed','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_file_assets_store on public.file_assets(store_id,created_at desc);
create index if not exists idx_file_assets_user on public.file_assets(user_id,created_at desc);

drop trigger if exists trg_file_assets_touch on public.file_assets;
create trigger trg_file_assets_touch before update on public.file_assets
for each row execute function public.touch_updated_at();

alter table public.file_assets enable row level security;

drop policy if exists "file_assets_store_select" on public.file_assets;
create policy "file_assets_store_select" on public.file_assets
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "file_assets_store_insert" on public.file_assets;
create policy "file_assets_store_insert" on public.file_assets
for insert to authenticated with check(public.is_store_member(store_id) and user_id=auth.uid());

drop policy if exists "file_assets_store_update" on public.file_assets;
create policy "file_assets_store_update" on public.file_assets
for update to authenticated
using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));

drop policy if exists "file_assets_owner_delete" on public.file_assets;
create policy "file_assets_owner_delete" on public.file_assets
for delete to authenticated
using(user_id=auth.uid() or public.store_role(store_id) in ('owner','admin'));
