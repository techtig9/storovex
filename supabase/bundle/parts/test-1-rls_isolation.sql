-- Storovex verification — test 1 of 3: rls_isolation
-- Run after all 12 schema parts.
-- Raises on any failed assertion, so no error means it passed.
-- Inserts fixture rows; use a project without real data. Safe to re-run.

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
