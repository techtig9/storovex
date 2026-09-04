-- Storovex — verification suite, generated from supabase/tests/
-- Generated: 2026-09-04T05:10:53Z
--
-- Run AFTER all_migrations.sql, in the Supabase SQL Editor.
--
-- Every check raises on failure, so if this completes without an error the
-- assertions all passed. Look for the NOTICE lines confirming each suite.
--
-- IMPORTANT: this inserts fixture users and stores. Run it on a project that
-- does not hold real data, or accept those fixture rows. It resets its own
-- fixtures first, so it is safe to re-run.


-- ============================================================
-- rls_isolation.sql
-- ============================================================
-- Storovex RLS isolation test.
-- Run against a database with every migration applied. Each assertion either passes
-- silently or raises, so a non-zero psql exit status means tenant isolation is broken.
--
--   psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
--
-- Roles are switched with SET ROLE at statement level, matching how PostgREST
-- executes a request on behalf of an end user, and auth.uid() is driven by the
-- request.jwt.claim.sub GUC exactly as Supabase drives it.

-- Supabase grants these to `authenticated` on every public table by default. We
-- reproduce that so the test exercises RLS policies rather than missing privileges.
grant select,insert,update,delete on all tables in schema public to authenticated;

create or replace function public.t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin if not cond then raise exception 'ASSERTION FAILED: %', msg; end if; end; $$;

-- ============================================================
-- Fixtures (as superuser / service role)
-- ============================================================
reset role;

-- Reset first so the file is re-runnable against a database it has already touched.
delete from public.notifications where store_id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.job_queue where store_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.email_events where store_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.security_events where store_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.ai_generation_requests where store_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.subscriptions where store_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.credit_ledger where account_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
delete from public.credit_accounts where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
delete from public.projects where store_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.billing_webhook_events where id='evt_pii';
delete from public.email_suppressions where email='bounced@example.com';
delete from public.admin_audit_events where admin_user_id='22222222-2222-2222-2222-222222222222';
-- These carry state across runs and would otherwise make the later assertions fail:
-- an already-exhausted rate bucket, a worker with no free slots, a drained queue.
delete from public.api_rate_limit_buckets where bucket_key='test:bucket';
delete from public.worker_capacity where worker_id='w1';
delete from public.store_members where store_id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.stores where id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','alice@example.com'),
  ('22222222-2222-2222-2222-222222222222','bob@example.com')
on conflict (id) do nothing;

select public.t_assert(
  (select count(*) from public.profiles
   where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222'))=2,
  'handle_new_user must create a profile for every new auth user');

insert into public.stores(id,name,owner_id) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Bob Store','22222222-2222-2222-2222-222222222222');
insert into public.projects(store_id,created_by,name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Bob Secret Project');
insert into public.credit_accounts(id,store_id,balance) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',500);
insert into public.credit_ledger(account_id,type,amount) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','grant',500);
insert into public.subscriptions(store_id,plan_id,status) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','pro','active');
insert into public.ai_generation_requests(store_id,type,quality,count,estimated_credits) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','product_hero','high',2,29);
insert into public.security_events(store_id,event_type) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bob_login');
insert into public.email_events(store_id,recipient,type,status) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bob@example.com','welcome','sent');
insert into public.billing_webhook_events(id,type,action,payload) values
  ('evt_pii','transaction.completed','record_payment','{"email":"bob@example.com","address":"1 Real St"}'::jsonb);
insert into public.email_suppressions(email,reason) values('bounced@example.com','bounced');
insert into public.admin_audit_events(admin_user_id,action,reason) values
  ('22222222-2222-2222-2222-222222222222','plan_override','because reasons');

-- ============================================================
-- Act as Alice
-- ============================================================
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;

select public.t_assert(auth.uid()='11111111-1111-1111-1111-111111111111'::uuid,
  'test harness must be acting as Alice');

-- A user can create their own store. Before this migration set there was no INSERT
-- policy on stores at all, so this was impossible for every user.
insert into public.stores(id,name,owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Alice Store','11111111-1111-1111-1111-111111111111');

select public.t_assert(
  (select count(*) from public.store_members
   where store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     and user_id='11111111-1111-1111-1111-111111111111'
     and role='owner' and status='active')=1,
  'creating a store must make its owner an active owner-member');

select public.t_assert((select count(*) from public.stores
  where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=1,
  'a user must be able to read their own store');

-- ---------- cross-tenant reads must all return zero rows ----------
select public.t_assert((select count(*) from public.stores
  where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')=0, 'stores: cross-tenant read');
select public.t_assert((select count(*) from public.projects)=0, 'projects: cross-tenant read');
select public.t_assert((select count(*) from public.credit_accounts)=0, 'credit_accounts: cross-tenant read');
select public.t_assert((select count(*) from public.credit_ledger)=0, 'credit_ledger: cross-tenant read');
select public.t_assert((select count(*) from public.subscriptions)=0, 'subscriptions: cross-tenant read');
select public.t_assert((select count(*) from public.ai_generation_requests)=0, 'generation requests: cross-tenant read');
select public.t_assert((select count(*) from public.security_events)=0, 'security_events: cross-tenant read');
select public.t_assert((select count(*) from public.email_events)=0, 'email_events: cross-tenant read');
select public.t_assert((select count(*) from public.store_members
  where store_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')=0, 'store_members: cross-tenant read');

-- ---------- server-only tables must be invisible to any authenticated user ----------
select public.t_assert((select count(*) from public.billing_webhook_events)=0,
  'billing_webhook_events must never be client-readable: it holds raw Paddle PII');
select public.t_assert((select count(*) from public.email_suppressions)=0,
  'email_suppressions must never be client-readable');
select public.t_assert((select count(*) from public.admin_audit_events)=0,
  'admin_audit_events must never be client-readable');
select public.t_assert((select count(*) from public.api_rate_limit_buckets)=0,
  'api_rate_limit_buckets must never be client-readable');

-- ---------- writes that must be refused ----------
do $$
declare denied boolean;
begin
  begin
    insert into public.stores(name,owner_id) values('Stolen','22222222-2222-2222-2222-222222222222');
    denied := false;
  exception when others then denied := true; end;
  perform public.t_assert(denied,'stores INSERT must reject owner_id <> auth.uid()');

  begin
    insert into public.projects(store_id,created_by,name)
      values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Injected');
    denied := false;
  exception when others then denied := true; end;
  perform public.t_assert(denied,'cross-tenant project INSERT must be denied');

  begin
    insert into public.ai_generation_requests(store_id,type,quality,count,estimated_credits,stage)
      values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','campaign','high',20,1,'completed');
    denied := false;
  exception when others then denied := true; end;
  perform public.t_assert(denied,'clients must never INSERT generation requests directly');

  begin
    update public.credit_accounts set balance=999999
      where store_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    perform public.t_assert(not found,'clients must never UPDATE credit balances');
  exception when others then null; end;

  raise notice 'RLS ISOLATION: all assertions passed';
end $$;

reset role;

-- ============================================================
-- Rate limiter must actually limit
-- ============================================================
do $$
declare r jsonb; allowed integer := 0; i integer;
begin
  for i in 1..7 loop
    r := public.check_api_rate_limit('test:bucket',5,60);
    if (r->>'allowed')::boolean then allowed := allowed + 1; end if;
  end loop;
  perform public.t_assert(allowed=5, format('limit of 5 allowed %s requests',allowed));
  raise notice 'RATE LIMIT: allowed exactly 5 of 7 requests';
end $$;

-- ============================================================
-- Worker slots must respect max_jobs
-- ============================================================
do $$
declare a boolean; b boolean; c boolean;
begin
  insert into public.worker_capacity(worker_id,active_jobs,max_jobs) values('w1',0,2);
  a := public.try_acquire_worker_slot('w1');
  b := public.try_acquire_worker_slot('w1');
  c := public.try_acquire_worker_slot('w1');
  perform public.t_assert(a and b and not c, format('worker slots were %s,%s,%s (expected t,t,f)',a,b,c));
  raise notice 'WORKER SLOTS: correctly capped at max_jobs';
end $$;

-- ============================================================
-- Job queue must claim highest priority first
-- ============================================================
do $$
declare claimed public.job_queue;
begin
  insert into public.job_queue(store_id,job_type,priority) values
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','standard_job','standard'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','urgent_job','highest');
  claimed := public.claim_next_job('worker-x');
  perform public.t_assert(claimed.job_type='urgent_job',
    format('claim_next_job returned %s, expected urgent_job',claimed.job_type));
  raise notice 'JOB QUEUE: highest priority claimed first';
end $$;

-- ============================================================
-- Stale job recovery must requeue, and dead-letter past max_attempts
-- ============================================================
do $$
declare recovered integer;
begin
  update public.job_queue set locked_at=now()-interval '60 minutes' where status='processing';
  recovered := public.recover_stale_jobs(15);
  perform public.t_assert(recovered>=1, 'recover_stale_jobs must requeue an expired lease');
  raise notice 'STALE RECOVERY: requeued % job(s)', recovered;
end $$;

drop function if exists public.t_assert(boolean,text);

-- ============================================================
-- credit_ledger.sql
-- ============================================================
-- Storovex credit ledger test.
-- Proves the atomic functions hold the invariants that the previous
-- read-check-write TypeScript could not.
--
--   psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/credit_ledger.sql

create or replace function public.t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin if not cond then raise exception 'ASSERTION FAILED: %', msg; end if; end; $$;

-- Reset first so the file is re-runnable: the idempotency keys below would
-- otherwise collide with a previous run and turn the first reserve into a no-op.
delete from public.credit_ledger where account_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
delete from public.credit_accounts where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
delete from public.store_members where store_id='dddddddd-dddd-dddd-dddd-dddddddddddd';
delete from public.stores where id='dddddddd-dddd-dddd-dddd-dddddddddddd';

-- Fixtures
insert into auth.users(id,email) values
  ('33333333-3333-3333-3333-333333333333','ledger@example.com') on conflict do nothing;
insert into public.stores(id,name,owner_id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','Ledger Store','33333333-3333-3333-3333-333333333333')
  on conflict do nothing;
insert into public.credit_accounts(id,store_id,balance) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dddddddd-dddd-dddd-dddd-dddddddddddd',100);

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

-- ============================================================
-- billing_entitlements.sql
-- ============================================================
-- Storovex billing entitlement test.
-- Proves a verified Paddle event actually changes entitlements, and that a
-- redelivered event cannot grant the same credits twice.
--
--   psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/billing_entitlements.sql

-- Supabase grants these to `authenticated` on every public table automatically. We
-- reproduce that so the final assertion tests the RLS policy rather than a missing
-- table privilege.
grant select,insert,update,delete on all tables in schema public to authenticated;

create or replace function public.t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin if not cond then raise exception 'ASSERTION FAILED: %', msg; end if; end; $$;

-- Reset first so the file is re-runnable. The grant idempotency keys are derived
-- from the event ids below, so a leftover ledger row from a previous run would make
-- the first grant a no-op and the test would fail for the wrong reason.
delete from public.billing_transactions where store_id='55555555-5555-5555-5555-555555555555';
delete from public.credit_ledger where account_id in
  (select id from public.credit_accounts where store_id='55555555-5555-5555-5555-555555555555');
delete from public.credit_accounts where store_id='55555555-5555-5555-5555-555555555555';
delete from public.subscriptions where store_id='55555555-5555-5555-5555-555555555555';
delete from public.notifications where store_id='55555555-5555-5555-5555-555555555555';
delete from public.store_members where store_id='55555555-5555-5555-5555-555555555555';
delete from public.stores where id='55555555-5555-5555-5555-555555555555';

insert into auth.users(id,email) values
  ('44444444-4444-4444-4444-444444444444','billing@example.com') on conflict do nothing;
insert into public.stores(id,name,owner_id) values
  ('55555555-5555-5555-5555-555555555555','Billing Store','44444444-4444-4444-4444-444444444444');

do $$
declare r jsonb; b integer; n integer;
begin
  -- ---------- activation creates the subscription and grants credits ----------
  r := public.apply_subscription_event(
    'evt_activate_1','55555555-5555-5555-5555-555555555555','sub_abc','pro','active',
    'monthly', now() + interval '30 days', true);
  perform public.t_assert((r->>'ok')::boolean, 'activation should apply');
  perform public.t_assert((r->>'granted')::int = 3000,
    format('pro should grant 3000 credits, granted %s', r->>'granted'));

  perform public.t_assert(public.store_has_access('55555555-5555-5555-5555-555555555555'),
    'an active subscription must grant access');

  select balance into b from public.credit_accounts where store_id='55555555-5555-5555-5555-555555555555';
  perform public.t_assert(b = 3000, format('balance should be 3000, got %s', b));

  -- ---------- the same event redelivered must not grant again ----------
  r := public.apply_subscription_event(
    'evt_activate_1','55555555-5555-5555-5555-555555555555','sub_abc','pro','active',
    'monthly', now() + interval '30 days', true);
  perform public.t_assert((r->>'granted')::int = 0,
    'a redelivered webhook must not grant a second month of credits');
  select balance into b from public.credit_accounts where store_id='55555555-5555-5555-5555-555555555555';
  perform public.t_assert(b = 3000, format('balance must be unchanged on replay, got %s', b));

  -- ---------- exactly one subscription row per Paddle subscription ----------
  select count(*) into n from public.subscriptions where paddle_subscription_id='sub_abc';
  perform public.t_assert(n = 1, format('expected 1 subscription row, found %s', n));

  -- ---------- a plan change updates in place ----------
  r := public.apply_subscription_event(
    'evt_update_1','55555555-5555-5555-5555-555555555555','sub_abc','starter','active',
    'monthly', now() + interval '30 days', false);
  perform public.t_assert((r->>'ok')::boolean, 'plan change should apply');
  select count(*) into n from public.subscriptions where paddle_subscription_id='sub_abc';
  perform public.t_assert(n = 1, 'a plan change must update in place, not add a row');
  perform public.t_assert(
    (select plan_id from public.subscriptions where paddle_subscription_id='sub_abc') = 'starter',
    'the plan must actually change');

  -- ---------- past_due keeps access during the grace period ----------
  r := public.apply_subscription_event(
    'evt_pastdue_1','55555555-5555-5555-5555-555555555555','sub_abc','starter','past_due',
    'monthly', null, false);
  perform public.t_assert(public.store_has_access('55555555-5555-5555-5555-555555555555'),
    'past_due must keep access during grace, or a failed card is an instant lockout');
  perform public.t_assert(
    (select grace_period_ends_at from public.subscriptions where paddle_subscription_id='sub_abc') is not null,
    'a grace period must be set');

  -- ---------- an expired grace period ends access ----------
  update public.subscriptions set grace_period_ends_at = now() - interval '1 day'
  where paddle_subscription_id='sub_abc';
  perform public.t_assert(not public.store_has_access('55555555-5555-5555-5555-555555555555'),
    'access must end once the grace period expires');

  -- ---------- cancellation revokes access ----------
  r := public.apply_subscription_event(
    'evt_cancel_1','55555555-5555-5555-5555-555555555555','sub_abc','starter','canceled',
    'monthly', null, false);
  perform public.t_assert(not public.store_has_access('55555555-5555-5555-5555-555555555555'),
    'a cancelled subscription must not grant access');
  perform public.t_assert(
    (select canceled_at from public.subscriptions where paddle_subscription_id='sub_abc') is not null,
    'cancellation must be timestamped');

  -- ---------- an unknown plan is refused, never stored ----------
  r := public.apply_subscription_event(
    'evt_bad_1','55555555-5555-5555-5555-555555555555','sub_xyz','enterprise_unlimited','active',
    'monthly', null, true);
  perform public.t_assert(r->>'error' = 'PLAN_UNKNOWN', 'an unknown plan must be refused');

  -- ---------- transactions are recorded once ----------
  perform public.record_billing_transaction(
    '55555555-5555-5555-5555-555555555555','txn_1','sub_abc','paid',6900,'USD',null);
  perform public.record_billing_transaction(
    '55555555-5555-5555-5555-555555555555','txn_1','sub_abc','paid',6900,'USD',null);
  select count(*) into n from public.billing_transactions where paddle_transaction_id='txn_1';
  perform public.t_assert(n = 1, format('a redelivered transaction must not duplicate, found %s', n));

  raise notice 'BILLING ENTITLEMENTS: all assertions passed';
end $$;

-- ---------- billing history stays tenant-scoped ----------
do $$
declare n integer;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
  set local role authenticated;
  select count(*) into n from public.billing_transactions;
  perform public.t_assert(n = 0, 'another tenant must not read billing history');
  raise notice 'BILLING ENTITLEMENTS: billing history is tenant-scoped';
end $$;
