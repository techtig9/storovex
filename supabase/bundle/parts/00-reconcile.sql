-- Storovex — pre-flight reconcile. RUN THIS FIRST, before part 01.
--
-- Why this exists: the schema uses "create table if not exists", so if a table of
-- the same name already exists from an earlier or unrelated schema, it is kept as-is
-- and later statements fail against it — for example
--   ERROR: 42703: column "store_id" does not exist
-- when the index on subscriptions(store_id) meets a subscriptions table that has no
-- such column.
--
-- What this does: for every table Storovex needs, if a table of that name exists but
-- is missing the column Storovex depends on, then
--   * if it is EMPTY, it is dropped so the migrations can create it correctly;
--   * if it CONTAINS ROWS, nothing is touched and this raises, naming the table.
--
-- Nothing with data in it is ever dropped. If this stops with an error, send it to
-- me and we will decide what to do with that table deliberately.

do $$
declare
  r record;
  n bigint;
  dropped int := 0;
  kept int := 0;
begin
  for r in
    with expected(t, key_col) as (
      values
        ('profiles','id'), ('stores','owner_id'), ('store_members','store_id'),
        ('templates','category'), ('projects','store_id'), ('notifications','store_id'),
        ('store_invitations','token'), ('plans','included_credits'),
        ('subscriptions','store_id'), ('credit_accounts','store_id'),
        ('credit_ledger','account_id'), ('billing_webhook_events','payload'),
        ('billing_transactions','paddle_transaction_id'),
        ('ai_generation_requests','store_id'), ('ai_provider_events','provider'),
        ('assets','storage_path'), ('job_events','job_id'), ('job_queue','job_type'),
        ('worker_capacity','worker_id'), ('job_rate_buckets','bucket_key'),
        ('security_events','event_type'), ('api_rate_limit_buckets','bucket_key'),
        ('api_audit_events','route'), ('validation_events','reason'),
        ('file_assets','storage_path'), ('email_events','recipient'),
        ('email_suppressions','email'), ('platform_admins','user_id'),
        ('feature_flags','key'), ('admin_audit_events','action')
    )
    select e.t, e.key_col
    from expected e
    join information_schema.tables tb
      on tb.table_schema = 'public' and tb.table_name = e.t
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = e.t and c.column_name = e.key_col
    )
  loop
    execute format('select count(*) from public.%I', r.t) into n;

    if n > 0 then
      -- Refuse rather than guess. Losing rows to a schema migration is not a
      -- trade-off worth making silently.
      raise exception
        'Table public.% already exists with a different shape (missing "%") and holds % row(s). Nothing has been changed. Decide what to do with this table before continuing.',
        r.t, r.key_col, n;
    end if;

    raise notice 'Dropping empty mis-shaped table public.% (missing "%")', r.t, r.key_col;
    execute format('drop table public.%I cascade', r.t);
    dropped := dropped + 1;
  end loop;

  select count(*) into kept
  from information_schema.tables
  where table_schema = 'public';

  raise notice 'Reconcile complete. Dropped % empty mis-shaped table(s). % table(s) remain in public.', dropped, kept;
end $$;
