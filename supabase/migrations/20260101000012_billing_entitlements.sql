-- Storovex 12 — applying billing events to entitlements.
--
-- The webhook previously verified a Paddle signature, filed the event, and returned.
-- No subscription row was created or updated, no plan synced, no credits granted, no
-- access revoked. Billing was inert. These functions are what the webhook now calls.

-- Invoice / payment history. billing_webhook_events holds raw deliveries; this is the
-- readable record a customer and the admin console actually need.
create table if not exists public.billing_transactions(
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  paddle_transaction_id text unique,
  paddle_subscription_id text,
  status text not null check(status in ('paid','failed','refunded','pending')),
  amount_cents integer not null check(amount_cents>=0),
  currency text not null default 'USD',
  invoice_url text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_billing_transactions_store
  on public.billing_transactions(store_id, occurred_at desc);

alter table public.billing_transactions enable row level security;
drop policy if exists "billing_transactions_store_select" on public.billing_transactions;
create policy "billing_transactions_store_select" on public.billing_transactions
for select to authenticated using(store_id is not null and public.is_store_member(store_id));

-- Grace period: a past_due subscription keeps access until this passes, so a failed
-- card does not instantly lock a paying customer out of their own store.
alter table public.subscriptions add column if not exists grace_period_ends_at timestamptz;
alter table public.subscriptions add column if not exists canceled_at timestamptz;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;

/**
 * Applies a subscription state change and grants the plan's credits on activation.
 *
 * Idempotent on p_event_id: the grant uses it as the ledger idempotency key, so a
 * redelivered webhook cannot grant the same month's credits twice. This is the whole
 * reason the grant lives in here rather than in application code — the subscription
 * write and the credit grant have to agree.
 */
create or replace function public.apply_subscription_event(
  p_event_id text,
  p_store_id uuid,
  p_paddle_subscription_id text,
  p_plan_id text,
  p_status text,
  p_billing_cycle text default 'monthly',
  p_current_period_end timestamptz default null,
  p_grant_credits boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_account_id uuid;
  v_included integer;
  v_granted integer := 0;
begin
  if not exists(select 1 from public.plans where id = p_plan_id) then
    return jsonb_build_object('ok',false,'error','PLAN_UNKNOWN');
  end if;

  -- One row per Paddle subscription. Conflicts update in place rather than
  -- accumulating duplicates that would make the "which plan?" question ambiguous.
  insert into public.subscriptions(
    store_id, paddle_subscription_id, plan_id, status, billing_cycle,
    current_period_end, canceled_at, grace_period_ends_at
  ) values (
    p_store_id, p_paddle_subscription_id, p_plan_id, p_status, p_billing_cycle,
    p_current_period_end,
    case when p_status = 'canceled' then now() else null end,
    case when p_status = 'past_due' then now() + interval '7 days' else null end
  )
  on conflict (paddle_subscription_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_cycle = excluded.billing_cycle,
    current_period_end = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
    canceled_at = case when excluded.status = 'canceled' then now() else null end,
    grace_period_ends_at = case when excluded.status = 'past_due'
      then coalesce(public.subscriptions.grace_period_ends_at, now() + interval '7 days')
      else null end,
    updated_at = now();

  if p_grant_credits then
    -- Every store gets a credit account on first grant rather than at signup, so a
    -- store that never subscribes carries no billing rows.
    select id into v_account_id from public.credit_accounts where store_id = p_store_id;
    if not found then
      insert into public.credit_accounts(store_id, balance) values(p_store_id, 0)
      returning id into v_account_id;
    end if;

    select included_credits into v_included from public.plans where id = p_plan_id;
    if v_included > 0 then
      -- p_event_id as the key: a redelivery is a no-op, not a second month of credits.
      select (public.grant_credits(v_account_id, v_included,
              'paddle:' || p_event_id, 'plan ' || p_plan_id)->>'granted')::int
      into v_granted;
    end if;
  end if;

  return jsonb_build_object('ok',true,'granted',v_granted,'plan',p_plan_id,'status',p_status);
end; $$;

/**
 * Whether a store currently has paid access. past_due keeps access until the grace
 * period expires; the application must not re-implement this rule anywhere else.
 */
create or replace function public.store_has_access(p_store_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.subscriptions
    where store_id = p_store_id
      and (
        status in ('active','trialing')
        or (status = 'past_due' and grace_period_ends_at is not null and grace_period_ends_at > now())
      )
  );
$$;

create or replace function public.record_billing_transaction(
  p_store_id uuid,
  p_paddle_transaction_id text,
  p_paddle_subscription_id text,
  p_status text,
  p_amount_cents integer,
  p_currency text default 'USD',
  p_invoice_url text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  insert into public.billing_transactions(
    store_id, paddle_transaction_id, paddle_subscription_id, status,
    amount_cents, currency, invoice_url
  ) values (
    p_store_id, p_paddle_transaction_id, p_paddle_subscription_id, p_status,
    greatest(0, coalesce(p_amount_cents,0)), coalesce(p_currency,'USD'), p_invoice_url
  )
  on conflict (paddle_transaction_id) do nothing;
  return jsonb_build_object('ok',true);
end; $$;

-- Notifications are written by the server only; users read and dismiss their own.
create or replace function public.notify_store(
  p_store_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_user_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.notifications(store_id, user_id, type, title, body)
  values(p_store_id, p_user_id, p_type, p_title, p_body)
  returning id into v_id;
  return v_id;
end; $$;
