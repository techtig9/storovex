-- Storovex verification — test 3 of 3: billing_entitlements
-- Run after all 12 schema parts.
-- Raises on any failed assertion, so no error means it passed.
-- Inserts fixture rows; use a project without real data. Safe to re-run.

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
