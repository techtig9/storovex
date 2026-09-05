-- Storovex 10 — transactional email tracking, platform admin, feature flags.

create table if not exists public.email_events(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  recipient text not null,
  type text not null,
  status text not null check(status in ('queued','sent','delivered','bounced','complained','failed')),
  attempt integer not null default 1 check(attempt>=1),
  provider_message_id text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_email_events_recipient on public.email_events(recipient,created_at desc);
create index if not exists idx_email_events_store on public.email_events(store_id,created_at desc);
create index if not exists idx_email_events_recipient_status on public.email_events(recipient,status);

create table if not exists public.email_suppressions(
  email text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags(
  key text primary key,
  enabled boolean not null default false,
  rollout_pct integer check(rollout_pct is null or (rollout_pct between 0 and 100)),
  description text,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_feature_flags_touch on public.feature_flags;
create trigger trg_feature_flags_touch before update on public.feature_flags
for each row execute function public.touch_updated_at();

create table if not exists public.admin_audit_events(
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  action text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_audit_events_store on public.admin_audit_events(store_id,created_at desc);
create index if not exists idx_admin_audit_events_admin on public.admin_audit_events(admin_user_id,created_at desc);

alter table public.email_events enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.platform_admins enable row level security;
alter table public.feature_flags enable row level security;
alter table public.admin_audit_events enable row level security;

drop policy if exists "email_events_store_select" on public.email_events;
create policy "email_events_store_select" on public.email_events
for select to authenticated using(store_id is not null and public.is_store_member(store_id));

drop policy if exists "platform_admins_self_select" on public.platform_admins;
create policy "platform_admins_self_select" on public.platform_admins
for select to authenticated using(user_id=auth.uid());

drop policy if exists "feature_flags_authenticated_select" on public.feature_flags;
create policy "feature_flags_authenticated_select" on public.feature_flags
for select to authenticated using(true);

-- email_suppressions and admin_audit_events: RLS on, no policy. Server-only.
-- The suppression list is a list of addresses that bounced or complained; exposing
-- it would leak both customer addresses and their deliverability state.
