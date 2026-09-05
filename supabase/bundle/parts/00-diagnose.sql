-- Storovex — schema diagnostic. READ ONLY: changes nothing.
--
-- Run this in the SQL Editor and send back the result.
--
-- It reports, for every table Storovex needs: whether it already exists, how many
-- columns and rows it has, and whether the key columns Storovex expects are present.
-- That tells us whether an existing table can be kept, extended, or has to be
-- replaced — without guessing.

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
select
  e.t as table_name,
  case when c.table_name is null then 'MISSING' else 'exists' end as status,
  coalesce(cols.n, 0) as columns,
  case
    when c.table_name is null then null
    else (xpath('/row/c/text()',
      query_to_xml(format('select count(*) as c from public.%I', e.t), false, true, '')))[1]::text::bigint
  end as rows,
  case
    when c.table_name is null then null
    when k.column_name is null then 'KEY COLUMN "' || e.key_col || '" MISSING'
    else 'ok'
  end as shape
from expected e
left join information_schema.tables c
  on c.table_schema = 'public' and c.table_name = e.t
left join lateral (
  select count(*) n from information_schema.columns
  where table_schema = 'public' and table_name = e.t
) cols on true
left join information_schema.columns k
  on k.table_schema = 'public' and k.table_name = e.t and k.column_name = e.key_col
order by
  case when c.table_name is null then 2
       when k.column_name is null then 0
       else 1 end,
  e.t;
