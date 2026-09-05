-- Storovex marketplace — function hardening.
--
-- ADDITIVE ONLY. Alters function configuration and adds a reservation table.
-- No existing table is dropped, altered or truncated.
--
-- Fixes two findings:
--
-- S2 — all six commerce functions have a mutable search_path, flagged by Supabase's
-- own linter. A function that does not pin its search_path resolves table names
-- against whatever schema order the caller has set, so a caller able to create a
-- table in an earlier schema can make `update product_variants` hit a table they
-- control instead. Pinning search_path closes that.
--
-- S3 — stock is reserved but never expires. try_reserve_stock decrements
-- immediately and correctly, but nothing releases it if the shopper walks away, so
-- an abandoned basket holds inventory until someone calls release_stock by hand.

-- ------------------------------------------------------------
-- S2: pin search_path on the existing functions
-- ------------------------------------------------------------
-- ALTER rather than CREATE OR REPLACE, so the bodies stay exactly as they are.
alter function public.try_reserve_stock(uuid, integer) set search_path = public;
alter function public.release_stock(uuid, integer) set search_path = public;
alter function public.next_order_number(uuid) set search_path = public;
alter function public.increment_discount_usage(uuid) set search_path = public;
alter function public.try_decrement_credits(uuid, integer) set search_path = public;
alter function public.refund_credits(uuid, integer) set search_path = public;

-- ------------------------------------------------------------
-- S3: make reservations expire
-- ------------------------------------------------------------
create table if not exists public.stock_reservations(
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null,
  cart_id uuid,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_reservations_expiry
  on public.stock_reservations(expires_at) where released_at is null;
create index if not exists idx_stock_reservations_cart
  on public.stock_reservations(cart_id) where released_at is null;

alter table public.stock_reservations enable row level security;
-- Server-only, enforced twice: RLS with no policy denies row access, and the grants
-- are revoked so the table is unreachable even if a policy is added by mistake later.
-- A client able to edit reservations could free another shopper's stock or hold
-- inventory indefinitely.
revoke all on public.stock_reservations from anon, authenticated;

/**
 * Reserves stock and records the reservation so it can be reclaimed.
 *
 * Wraps the existing try_reserve_stock rather than replacing it, so the atomic
 * conditional decrement that already works is left untouched.
 */
create or replace function public.reserve_stock_with_expiry(
  p_variant_id uuid,
  p_quantity integer,
  p_cart_id uuid default null,
  p_ttl_minutes integer default 20
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    return jsonb_build_object('ok', false, 'error', 'QUANTITY_INVALID');
  end if;

  v_ok := public.try_reserve_stock(p_variant_id, p_quantity);
  if not v_ok then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_STOCK');
  end if;

  insert into public.stock_reservations(variant_id, cart_id, quantity, expires_at)
  values (p_variant_id, p_cart_id, p_quantity, now() + make_interval(mins => p_ttl_minutes))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'reservation_id', v_id);
end; $$;

/** Releases one reservation. Idempotent: a second call returns released = 0. */
create or replace function public.release_reservation(p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.stock_reservations;
begin
  update public.stock_reservations set released_at = now()
   where id = p_reservation_id and released_at is null
  returning * into r;

  if not found then
    return jsonb_build_object('ok', true, 'released', 0);
  end if;

  perform public.release_stock(r.variant_id, r.quantity);
  return jsonb_build_object('ok', true, 'released', r.quantity);
end; $$;

/**
 * Returns stock from every expired reservation. Intended to run on a schedule.
 * Without this, S3 stands: abandoned baskets consume inventory permanently.
 */
create or replace function public.sweep_expired_reservations()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in
    select id, variant_id, quantity from public.stock_reservations
    where released_at is null and expires_at <= now()
    for update skip locked
  loop
    update public.stock_reservations set released_at = now() where id = r.id;
    perform public.release_stock(r.variant_id, r.quantity);
    n := n + 1;
  end loop;
  return n;
end; $$;

/** Releases everything a cart holds, for checkout completion or explicit abandonment. */
create or replace function public.release_cart_reservations(p_cart_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in
    select id, variant_id, quantity from public.stock_reservations
    where cart_id = p_cart_id and released_at is null
    for update skip locked
  loop
    update public.stock_reservations set released_at = now() where id = r.id;
    perform public.release_stock(r.variant_id, r.quantity);
    n := n + 1;
  end loop;
  return n;
end; $$;
