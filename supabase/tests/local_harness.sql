-- Minimal local stand-in for the Supabase-managed objects our migrations depend on.
-- Mirrors the real shapes: auth.users, auth.uid(), the authenticated/anon roles,
-- and the storage schema. Enough to prove DDL, RLS and function bodies are valid.
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users(
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Supabase derives auth.uid() from the request JWT. Locally we drive it from a GUC
-- so tests can impersonate a user with set_config('request.jwt.claim.sub', ...).
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public, auth, storage to authenticated, anon, service_role;
