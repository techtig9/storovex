-- Storovex — full schema reset. RUN THIS FIRST, then parts 01 through 12.
--
-- Why this rather than 00-reconcile.sql: reconcile only checks one key column per
-- table, so a leftover table can pass that check and still be the wrong shape. A
-- public.stores with 15 columns satisfies "has owner_id" while being a completely
-- different table from the 6-column one this schema defines. Column-by-column
-- reconciliation of an arbitrary old schema is guesswork; starting clean is not.
--
-- SAFETY: this counts every row first and DROPS NOTHING unless the entire set is
-- empty. If any table holds even one row, it changes nothing and stops, naming the
-- table. Read the error rather than working around it.
--
-- This touches only Storovex's own tables in the public schema. auth.users and
-- everything Supabase manages are left completely alone.

do $$
declare
  storovex_tables text[] := array[
    'profiles','stores','store_members','templates','projects','notifications',
    'store_invitations','plans','subscriptions','credit_accounts','credit_ledger',
    'billing_webhook_events','billing_transactions','ai_generation_requests',
    'ai_provider_events','assets','job_events','job_queue','worker_capacity',
    'job_rate_buckets','security_events','api_rate_limit_buckets','api_audit_events',
    'validation_events','file_assets','email_events','email_suppressions',
    'platform_admins','feature_flags','admin_audit_events'
  ];
  t text;
  n bigint;
  total bigint := 0;
  present int := 0;
begin
  -- Pass 1: count everything. Nothing is dropped in this pass.
  foreach t in array storovex_tables loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      present := present + 1;
      execute format('select count(*) from public.%I', t) into n;
      total := total + n;
      if n > 0 then
        raise exception
          'STOPPED: public.% holds % row(s). Nothing has been dropped. If this data is disposable, delete it deliberately and re-run; if it is not, tell me before continuing.',
          t, n;
      end if;
    end if;
  end loop;

  raise notice 'Found % existing Storovex table(s), % row(s) in total. Safe to reset.', present, total;

  -- Pass 2: drop. Reached only when every table above was empty.
  -- Quieten the "does not exist, skipping" notices from the DROP IF EXISTS calls;
  -- on a mostly-empty project they bury the two lines that actually matter.
  perform set_config('client_min_messages', 'warning', true);

  foreach t in array storovex_tables loop
    execute format('drop table if exists public.%I cascade', t);
  end loop;

  -- Functions and triggers are recreated by the parts. Dropping them first avoids a
  -- stale definition surviving with a signature the new schema does not expect.
  drop function if exists public.touch_updated_at() cascade;
  drop function if exists public.is_store_member(uuid) cascade;
  drop function if exists public.store_role(uuid) cascade;
  drop function if exists public.add_store_owner_membership() cascade;
  drop function if exists public.handle_new_user() cascade;
  drop function if exists public.claim_next_job(text) cascade;
  drop function if exists public.heartbeat_job(uuid, text) cascade;
  drop function if exists public.recover_stale_jobs(integer) cascade;
  drop function if exists public.try_acquire_worker_slot(text) cascade;
  drop function if exists public.release_worker_slot(text) cascade;
  drop function if exists public.check_api_rate_limit(text, integer, integer) cascade;
  drop function if exists public.reserve_credits(uuid, integer, uuid, text, integer) cascade;
  drop function if exists public.commit_credits(uuid, uuid, integer) cascade;
  drop function if exists public.refund_credits(uuid, uuid, text) cascade;
  drop function if exists public.grant_credits(uuid, integer, text, text) cascade;
  drop function if exists public.credit_balance_from_ledger(uuid) cascade;
  drop function if exists public.apply_subscription_event(text, uuid, text, text, text, text, timestamptz, boolean) cascade;
  drop function if exists public.store_has_access(uuid) cascade;
  drop function if exists public.record_billing_transaction(uuid, text, text, text, integer, text, text) cascade;
  drop function if exists public.notify_store(uuid, text, text, text, uuid) cascade;
  drop function if exists public.current_store_id() cascade;
  drop function if exists public.t_assert(boolean, text) cascade;

  -- The signup trigger lives on auth.users, so it must be removed by name; the
  -- table itself is untouched.
  drop trigger if exists trg_auth_user_created on auth.users;

  perform set_config('client_min_messages', 'notice', true);
  raise notice 'Reset complete. Now run parts 01 through 12 in order.';
end $$;
