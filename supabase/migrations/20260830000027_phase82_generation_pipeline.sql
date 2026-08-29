
-- ai_generation_requests already exists from an earlier (pre-Phase-74) migration not
-- included in this delivery; Phase 77's RLS hardening already policies it by store_id.
-- Extend it with the columns the Phase 82 generation pipeline needs, rather than
-- creating a second, disconnected "generation_requests" table under a different name.
alter table public.ai_generation_requests add column if not exists project_id uuid;
alter table public.ai_generation_requests add column if not exists user_id uuid;
alter table public.ai_generation_requests add column if not exists type text
 check(type in ('product_hero','product_lifestyle','campaign','collection','banner','social_creative'));
alter table public.ai_generation_requests add column if not exists quality text
 check(quality in ('draft','standard','high'));
alter table public.ai_generation_requests add column if not exists count integer check(count>=1 and count<=20);
alter table public.ai_generation_requests add column if not exists estimated_credits integer check(estimated_credits>=1);
alter table public.ai_generation_requests add column if not exists stage text default 'planning'
 check(stage in ('planning','building','generating_assets','finalizing','completed','failed'));
alter table public.ai_generation_requests add column if not exists attempt integer not null default 1 check(attempt>=1);
alter table public.ai_generation_requests add column if not exists last_error text;
alter table public.ai_generation_requests add column if not exists idempotency_key text unique;
alter table public.ai_generation_requests add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_ai_generation_requests_project on public.ai_generation_requests(project_id,created_at desc);

create table if not exists public.assets(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 project_id uuid not null,
 generation_request_id uuid references public.ai_generation_requests(id),
 bucket text not null check(bucket in ('avatars','uploads','generated-assets','project-assets','exports','public-store-assets')),
 storage_path text not null unique,
 section text check(section in ('hero','product_grid','collections','footer','full')),
 version integer not null default 1 check(version>=1),
 created_at timestamptz not null default now()
);
create index if not exists idx_assets_store_project on public.assets(store_id,project_id,created_at desc);
alter table public.assets enable row level security;
create policy if not exists "assets_store_select" on public.assets for select to authenticated
using(store_id=public.current_store_id());
create policy if not exists "assets_store_insert" on public.assets for insert to authenticated
with check(store_id=public.current_store_id());

create table if not exists public.job_events(
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.ai_generation_requests(id),
 event_type text not null check(event_type in ('claimed','heartbeat','stage_advanced','committed','refunded','dead_lettered')),
 detail jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_job_events_job on public.job_events(job_id,created_at desc);
alter table public.job_events enable row level security;
create policy if not exists "job_events_store_select" on public.job_events for select to authenticated
using(job_id in (select id from public.ai_generation_requests where store_id=public.current_store_id()));
