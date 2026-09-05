-- Storovex 11 — atomic credit operations.
--
-- reserveJobCredits() previously did: read balance → check → insert ledger row →
-- separate balance update. Two concurrent requests both read the same balance and
-- both passed the check, and a failure between the two writes left the ledger and
-- the balance permanently disagreeing. The check(balance>=0) constraint limited the
-- damage but did not prevent over-reservation.
--
-- Each function below does the whole operation in one statement-level transaction,
-- taking a row lock on the account first, so concurrent callers serialise.

-- Reserve credits for a job. Idempotent on p_idempotency_key: a retry returns the
-- original reservation rather than charging twice.
create or replace function public.reserve_credits(
  p_account_id uuid,
  p_amount integer,
  p_job_id uuid,
  p_idempotency_key text,
  p_max_per_job integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_balance integer;
  v_existing public.credit_ledger;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok',false,'error','LEDGER_AMOUNT_INVALID');
  end if;
  if p_max_per_job is not null and p_amount > p_max_per_job then
    return jsonb_build_object('ok',false,'error','LEDGER_JOB_SPEND_LIMIT_EXCEEDED');
  end if;

  -- Replaying the same key must be safe: return what the first call did.
  select * into v_existing from public.credit_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    select balance into v_balance from public.credit_accounts where id = v_existing.account_id;
    return jsonb_build_object('ok',true,'duplicate',true,'reserved',v_existing.amount,
      'job_id',v_existing.job_id,'balance',v_balance);
  end if;

  -- The lock is what makes the check-then-write safe. Everything after this point
  -- is serialised against other callers touching the same account.
  select balance into v_balance from public.credit_accounts
  where id = p_account_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','CREDIT_ACCOUNT_NOT_FOUND');
  end if;
  if v_balance < p_amount then
    return jsonb_build_object('ok',false,'error','INSUFFICIENT_CREDITS','balance',v_balance);
  end if;

  insert into public.credit_ledger(account_id,type,amount,job_id,idempotency_key)
  values(p_account_id,'reservation',p_amount,p_job_id,p_idempotency_key);

  update public.credit_accounts
  set balance = balance - p_amount, updated_at = now()
  where id = p_account_id
  returning balance into v_balance;

  return jsonb_build_object('ok',true,'duplicate',false,'reserved',p_amount,
    'job_id',p_job_id,'balance',v_balance);
end; $$;

-- Convert a reservation into permanent usage. Any unused portion returns to the
-- balance. Refuses to run twice for the same job.
create or replace function public.commit_credits(
  p_account_id uuid,
  p_job_id uuid,
  p_actual_amount integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_reserved integer;
  v_refund integer;
  v_balance integer;
begin
  if p_actual_amount is null or p_actual_amount < 0 then
    return jsonb_build_object('ok',false,'error','LEDGER_AMOUNT_INVALID');
  end if;

  perform 1 from public.credit_accounts where id = p_account_id for update;

  -- A job that already settled must not settle again, in either direction.
  if exists(select 1 from public.credit_ledger
            where job_id = p_job_id and type in ('commit','refund')) then
    return jsonb_build_object('ok',false,'error','LEDGER_JOB_ALREADY_SETTLED');
  end if;

  select amount into v_reserved from public.credit_ledger
  where job_id = p_job_id and type = 'reservation';
  if not found then
    return jsonb_build_object('ok',false,'error','LEDGER_NO_RESERVATION');
  end if;
  if p_actual_amount > v_reserved then
    return jsonb_build_object('ok',false,'error','LEDGER_COMMIT_EXCEEDS_RESERVATION');
  end if;

  insert into public.credit_ledger(account_id,type,amount,job_id)
  values(p_account_id,'commit',p_actual_amount,p_job_id);

  v_refund := v_reserved - p_actual_amount;
  if v_refund > 0 then
    insert into public.credit_ledger(account_id,type,amount,job_id,reason)
    values(p_account_id,'refund',v_refund,p_job_id,'unused reservation');
    update public.credit_accounts set balance = balance + v_refund, updated_at = now()
    where id = p_account_id;
  end if;

  select balance into v_balance from public.credit_accounts where id = p_account_id;
  return jsonb_build_object('ok',true,'committed',p_actual_amount,'refunded',v_refund,'balance',v_balance);
end; $$;

-- Return a whole reservation after a failed job. Also refuses to double-settle:
-- without this, a retry loop could refund the same job repeatedly and mint credits.
create or replace function public.refund_credits(
  p_account_id uuid,
  p_job_id uuid,
  p_reason text default 'generation failed'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_reserved integer;
  v_balance integer;
begin
  perform 1 from public.credit_accounts where id = p_account_id for update;

  if exists(select 1 from public.credit_ledger
            where job_id = p_job_id and type in ('commit','refund')) then
    return jsonb_build_object('ok',false,'error','LEDGER_JOB_ALREADY_SETTLED');
  end if;

  select amount into v_reserved from public.credit_ledger
  where job_id = p_job_id and type = 'reservation';
  if not found then
    return jsonb_build_object('ok',false,'error','LEDGER_NO_RESERVATION');
  end if;

  insert into public.credit_ledger(account_id,type,amount,job_id,reason)
  values(p_account_id,'refund',v_reserved,p_job_id,p_reason);

  update public.credit_accounts set balance = balance + v_reserved, updated_at = now()
  where id = p_account_id
  returning balance into v_balance;

  return jsonb_build_object('ok',true,'refunded',v_reserved,'balance',v_balance);
end; $$;

-- Grant credits (plan renewal, top-up, promotional). Idempotent on the key so a
-- redelivered billing webhook cannot grant the same credits twice.
create or replace function public.grant_credits(
  p_account_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_reason text default 'plan grant'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok',false,'error','LEDGER_AMOUNT_INVALID');
  end if;

  if exists(select 1 from public.credit_ledger where idempotency_key = p_idempotency_key) then
    select balance into v_balance from public.credit_accounts where id = p_account_id;
    return jsonb_build_object('ok',true,'duplicate',true,'granted',0,'balance',v_balance);
  end if;

  perform 1 from public.credit_accounts where id = p_account_id for update;

  insert into public.credit_ledger(account_id,type,amount,idempotency_key,reason)
  values(p_account_id,'grant',p_amount,p_idempotency_key,p_reason);

  update public.credit_accounts set balance = balance + p_amount, updated_at = now()
  where id = p_account_id
  returning balance into v_balance;

  return jsonb_build_object('ok',true,'duplicate',false,'granted',p_amount,'balance',v_balance);
end; $$;

-- Reconciliation: the balance must always equal the signed sum of the ledger.
-- Used by tests and by the admin console to detect drift.
create or replace function public.credit_balance_from_ledger(p_account_id uuid)
returns integer language sql stable security definer set search_path=public as $$
  select coalesce(sum(
    case type
      when 'grant' then amount
      when 'refund' then amount
      when 'adjustment' then amount
      when 'reservation' then -amount
      when 'expiry' then -amount
      when 'commit' then 0  -- a commit consumes an already-deducted reservation
    end
  ),0)::integer
  from public.credit_ledger where account_id = p_account_id;
$$;
