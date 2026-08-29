
create table if not exists public.email_events(
 id uuid primary key default gen_random_uuid(),
 store_id uuid,
 recipient text not null,
 type text not null,
 status text not null check(status in ('queued','sent','delivered','bounced','complained','failed')),
 attempt integer not null default 1 check(attempt>=1),
 created_at timestamptz not null default now()
);
create index if not exists idx_email_events_recipient on public.email_events(recipient,created_at desc);
create index if not exists idx_email_events_store on public.email_events(store_id,created_at desc);
alter table public.email_events enable row level security;
create policy if not exists "email_events_store_select" on public.email_events for select to authenticated
using(store_id is null or public.is_store_member(store_id));

create table if not exists public.email_suppressions(
 email text primary key,
 reason text not null,
 created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
-- No select policy for authenticated users: suppression list is server-only.

create table if not exists public.platform_admins(
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy if not exists "platform_admins_self_select" on public.platform_admins for select to authenticated
using(user_id=auth.uid());

create table if not exists public.feature_flags(
 key text primary key,
 enabled boolean not null default false,
 rollout_pct integer check(rollout_pct is null or (rollout_pct>=0 and rollout_pct<=100)),
 description text,
 updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
create policy if not exists "feature_flags_authenticated_select" on public.feature_flags for select to authenticated using(true);

create table if not exists public.admin_audit_events(
 id uuid primary key default gen_random_uuid(),
 admin_user_id uuid not null references auth.users(id),
 store_id uuid,
 action text not null,
 reason text not null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_admin_audit_events_store on public.admin_audit_events(store_id,created_at desc);
alter table public.admin_audit_events enable row level security;
-- No select policy for regular authenticated users: platform-admin-only via service role / requirePlatformAdmin().
