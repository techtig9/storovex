-- Storovex schema — part 08 of 12: generation_assets
-- Run the parts in numeric order. Each depends only on the parts before it.
-- Safe to re-run: every statement is idempotent.

-- Storovex 08 — AI generation requests, generated assets, job events.
-- ai_generation_requests is CREATEd here. The previous phase82 file only ALTERed it,
-- on the assumption it came from a migration that was never in the repository, so
-- every column add failed against an empty database.

create table if not exists public.ai_generation_requests(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text check(type in ('product_hero','product_lifestyle','campaign','collection','banner','social_creative')),
  quality text check(quality in ('draft','standard','high')),
  count integer check(count>=1 and count<=20),
  estimated_credits integer check(estimated_credits>=1),
  reserved_credits integer check(reserved_credits>=0),
  stage text not null default 'planning'
    check(stage in ('planning','building','generating_assets','finalizing','completed','failed')),
  attempt integer not null default 1 check(attempt>=1),
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_generation_requests_store on public.ai_generation_requests(store_id,created_at desc);
create index if not exists idx_ai_generation_requests_project on public.ai_generation_requests(project_id,created_at desc);
create index if not exists idx_ai_generation_requests_stage on public.ai_generation_requests(store_id,stage);

drop trigger if exists trg_ai_generation_requests_touch on public.ai_generation_requests;
create trigger trg_ai_generation_requests_touch before update on public.ai_generation_requests
for each row execute function public.touch_updated_at();

create table if not exists public.ai_provider_events(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  generation_request_id uuid references public.ai_generation_requests(id) on delete cascade,
  provider text not null,
  model text,
  status text not null,
  error_class text,
  latency_ms integer check(latency_ms>=0),
  input_tokens integer check(input_tokens>=0),
  output_tokens integer check(output_tokens>=0),
  cost_cents integer check(cost_cents>=0),
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_provider_events_store on public.ai_provider_events(store_id,created_at desc);

create table if not exists public.assets(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  generation_request_id uuid references public.ai_generation_requests(id) on delete set null,
  bucket text not null check(bucket in ('avatars','uploads','generated-assets','project-assets','exports','public-store-assets')),
  storage_path text not null unique,
  section text check(section in ('hero','product_grid','collections','footer','full')),
  version integer not null default 1 check(version>=1),
  created_at timestamptz not null default now()
);
create index if not exists idx_assets_store_project on public.assets(store_id,project_id,created_at desc);

create table if not exists public.job_events(
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_generation_requests(id) on delete cascade,
  event_type text not null check(event_type in ('claimed','heartbeat','stage_advanced','committed','refunded','dead_lettered')),
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_job_events_job on public.job_events(job_id,created_at desc);

alter table public.ai_generation_requests enable row level security;
alter table public.ai_provider_events enable row level security;
alter table public.assets enable row level security;
alter table public.job_events enable row level security;

drop policy if exists "ai_generation_requests_store_select" on public.ai_generation_requests;
create policy "ai_generation_requests_store_select" on public.ai_generation_requests
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "ai_provider_events_store_select" on public.ai_provider_events;
create policy "ai_provider_events_store_select" on public.ai_provider_events
for select to authenticated using(store_id is not null and public.is_store_member(store_id));

drop policy if exists "assets_store_select" on public.assets;
create policy "assets_store_select" on public.assets
for select to authenticated using(public.is_store_member(store_id));

drop policy if exists "job_events_store_select" on public.job_events;
create policy "job_events_store_select" on public.job_events
for select to authenticated
using(job_id in (select id from public.ai_generation_requests where public.is_store_member(store_id)));

-- Deliberately no INSERT or UPDATE policies on any of these four. Generation rows,
-- assets and job events are written by the server only, after credits are reserved.
-- A client that could insert its own completed generation could mint free assets.
