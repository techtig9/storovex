
-- Phase 76 and Phase 77 each define public.security_events with different columns
-- (risk_score vs severity). Because both use "create table if not exists", only
-- whichever migration ran first actually created the table, silently dropping the
-- other's column. This migration makes both columns present regardless of which
-- version was applied, so neither phase's code fails on a missing column.
alter table public.security_events add column if not exists risk_score integer not null default 0 check(risk_score between 0 and 100);
alter table public.security_events add column if not exists severity text not null default 'info' check(severity in ('info','warning','critical'));
create index if not exists idx_security_events_time on public.security_events(created_at desc);
