
create table if not exists public.file_assets(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 user_id uuid not null,
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
alter table public.file_assets enable row level security;
create policy if not exists "file_assets_store_select" on public.file_assets for select to authenticated
using(store_id=public.current_store_id());
create policy if not exists "file_assets_store_insert" on public.file_assets for insert to authenticated
with check(store_id=public.current_store_id() and user_id=auth.uid());
create policy if not exists "file_assets_store_update" on public.file_assets for update to authenticated
using(store_id=public.current_store_id()) with check(store_id=public.current_store_id());
