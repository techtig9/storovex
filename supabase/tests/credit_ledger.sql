-- Storovex credit ledger test.
-- Proves the atomic functions hold the invariants that the previous
-- read-check-write TypeScript could not.
--
--   psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/credit_ledger.sql

create or replace function public.t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin if not cond then raise exception 'ASSERTION FAILED: %', msg; end if; end; $$;

-- Fixtures
insert into auth.users(id,email) values
  ('33333333-3333-3333-3333-333333333333','ledger@example.com') on conflict do nothing;
insert into public.stores(id,name,owner_id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','Ledger Store','33333333-3333-3333-3333-333333333333')
  on conflict do nothing;
insert into public.credit_accounts(id,store_id,balance) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dddddddd-dddd-dddd-dddd-dddddddddddd',100)
  on conflict do nothing;

do $$
declare r jsonb; b integer;
begin
  -- ---------- happy path ----------
  r := public.reserve_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',30,
       '10000000-0000-0000-0000-000000000001','key-1',60);
  perform public.t_assert((r->>'ok')::boolean, 'reserve should succeed');
  perform public.t_assert((r->>'balance')::int = 70, format('balance should be 70, got %s', r->>'balance'));

  -- ---------- idempotency: a retry must not charge twice ----------
  r := public.reserve_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',30,
       '10000000-0000-0000-0000-000000000001','key-1',60);
  perform public.t_assert((r->>'duplicate')::boolean, 'replaying a key must report duplicate');
  select balance into b from public.credit_accounts where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  perform public.t_assert(b = 70, format('replay must not change the balance, got %s', b));

  -- ---------- per-job cap is enforced in the database, not just in TypeScript ----------
  r := public.reserve_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',80,
       '10000000-0000-0000-0000-000000000002','key-2',60);
  perform public.t_assert(r->>'error' = 'LEDGER_JOB_SPEND_LIMIT_EXCEEDED', 'cap must be enforced');

  -- ---------- cannot reserve more than the balance ----------
  r := public.reserve_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',5000,
       '10000000-0000-0000-0000-000000000003','key-3',99999);
  perform public.t_assert(r->>'error' = 'INSUFFICIENT_CREDITS', 'overdraft must be refused');

  -- ---------- partial commit refunds the unused portion ----------
  r := public.commit_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
       '10000000-0000-0000-0000-000000000001',18);
  perform public.t_assert((r->>'ok')::boolean, 'commit should succeed');
  perform public.t_assert((r->>'refunded')::int = 12, format('12 unused credits should return, got %s', r->>'refunded'));
  perform public.t_assert((r->>'balance')::int = 82, format('balance should be 82, got %s', r->>'balance'));

  -- ---------- a settled job cannot settle again in either direction ----------
  r := public.commit_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
       '10000000-0000-0000-0000-000000000001',5);
  perform public.t_assert(r->>'error' = 'LEDGER_JOB_ALREADY_SETTLED', 'double commit must be refused');

  r := public.refund_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
       '10000000-0000-0000-0000-000000000001');
  perform public.t_assert(r->>'error' = 'LEDGER_JOB_ALREADY_SETTLED',
    'refunding an already-committed job must be refused, or a retry loop mints credits');

  -- ---------- failed job returns the whole reservation ----------
  r := public.reserve_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',20,
       '10000000-0000-0000-0000-000000000004','key-4',60);
  perform public.t_assert((r->>'balance')::int = 62, 'balance after second reserve');
  r := public.refund_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
       '10000000-0000-0000-0000-000000000004','provider timeout');
  perform public.t_assert((r->>'refunded')::int = 20, 'full reservation must return');
  perform public.t_assert((r->>'balance')::int = 82, 'balance restored after refund');

  -- ---------- commit exceeding the reservation is refused ----------
  r := public.reserve_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',10,
       '10000000-0000-0000-0000-000000000005','key-5',60);
  r := public.commit_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
       '10000000-0000-0000-0000-000000000005',50);
  perform public.t_assert(r->>'error' = 'LEDGER_COMMIT_EXCEEDS_RESERVATION',
    'a job must never commit more than it reserved');
  perform public.commit_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '10000000-0000-0000-0000-000000000005',10);

  -- ---------- grants are idempotent, so a redelivered webhook cannot double-grant ----------
  r := public.grant_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',400,'grant-jan','plan renewal');
  perform public.t_assert((r->>'granted')::int = 400, 'grant should apply');
  r := public.grant_credits('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',400,'grant-jan','plan renewal');
  perform public.t_assert((r->>'duplicate')::boolean, 'replayed grant must be a no-op');
  perform public.t_assert((r->>'granted')::int = 0, 'replayed grant must add nothing');

  -- ---------- the balance must equal the ledger ----------
  select balance into b from public.credit_accounts where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  perform public.t_assert(
    b = 100 + public.credit_balance_from_ledger('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
    format('balance %s must equal opening 100 plus ledger %s',
      b, public.credit_balance_from_ledger('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')));

  raise notice 'CREDIT LEDGER: all assertions passed (final balance %)', b;
end $$;

-- ---------- the constraint is the last line of defence ----------
do $$
declare denied boolean;
begin
  begin
    update public.credit_accounts set balance = -1
    where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    denied := false;
  exception when check_violation then denied := true; end;
  perform public.t_assert(denied, 'a negative balance must be impossible at the schema level');
  raise notice 'CREDIT LEDGER: negative balance rejected by constraint';
end $$;
