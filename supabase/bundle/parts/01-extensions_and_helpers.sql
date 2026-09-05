-- Storovex schema — part 01 of 12: extensions_and_helpers
-- Run the parts in numeric order. Each depends only on the parts before it.
-- Safe to re-run: every statement is idempotent.

-- Storovex 01 — extensions and shared helpers.
-- Ordering note: every migration in this directory applies in filename order and
-- depends only on files numbered before it. The previous set shared one timestamp
-- across seven files and forward-referenced tables, so none of it could apply.

create extension if not exists pgcrypto;

-- Single source of truth for updated_at. Previously every service set this by hand
-- in application code and several forgot, so rows drifted.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;
