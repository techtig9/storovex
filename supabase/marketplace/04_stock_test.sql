-- Storovex marketplace — stock reservation tests.
-- Raises on failure. Re-runnable.

create or replace function public.t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin if not cond then raise exception 'ASSERTION FAILED: %', msg; end if; end; $$;

reset role;
delete from public.stock_reservations where variant_id = 'cccc1111-0000-0000-0000-00000000cccc';
delete from public.product_variants where id = 'cccc1111-0000-0000-0000-00000000cccc';
insert into public.product_variants(id,product_id,store_id,sku,price,stock_quantity)
values('cccc1111-0000-0000-0000-00000000cccc', null, 'a0000000-0000-0000-0000-00000000000a',
       'STOCK-TEST', 10.00, 10);

do $$
declare r jsonb; res1 uuid; n int; stock int;
begin
  -- ---------- a reservation reduces available stock ----------
  r := public.reserve_stock_with_expiry('cccc1111-0000-0000-0000-00000000cccc', 3, null, 20);
  perform public.t_assert((r->>'ok')::boolean, 'reserving available stock should succeed');
  res1 := (r->>'reservation_id')::uuid;
  select stock_quantity into stock from public.product_variants
   where id='cccc1111-0000-0000-0000-00000000cccc';
  perform public.t_assert(stock = 7, format('stock should be 7, got %s', stock));

  -- ---------- overselling is refused ----------
  r := public.reserve_stock_with_expiry('cccc1111-0000-0000-0000-00000000cccc', 100, null, 20);
  perform public.t_assert(r->>'error' = 'INSUFFICIENT_STOCK', 'overselling must be refused');
  select stock_quantity into stock from public.product_variants
   where id='cccc1111-0000-0000-0000-00000000cccc';
  perform public.t_assert(stock = 7, 'a refused reservation must not change stock');

  -- ---------- releasing returns the stock, and is idempotent ----------
  r := public.release_reservation(res1);
  perform public.t_assert((r->>'released')::int = 3, 'releasing should return 3');
  select stock_quantity into stock from public.product_variants
   where id='cccc1111-0000-0000-0000-00000000cccc';
  perform public.t_assert(stock = 10, format('stock should be back to 10, got %s', stock));

  r := public.release_reservation(res1);
  -- Without this guard a retry loop would return the same stock repeatedly and
  -- invent inventory that does not exist.
  perform public.t_assert((r->>'released')::int = 0, 'a second release must be a no-op');
  select stock_quantity into stock from public.product_variants
   where id='cccc1111-0000-0000-0000-00000000cccc';
  perform public.t_assert(stock = 10, 'a repeated release must not inflate stock');

  -- ---------- an expired reservation is swept back ----------
  r := public.reserve_stock_with_expiry('cccc1111-0000-0000-0000-00000000cccc', 4, null, 20);
  update public.stock_reservations set expires_at = now() - interval '1 minute'
   where id = (r->>'reservation_id')::uuid;
  select stock_quantity into stock from public.product_variants
   where id='cccc1111-0000-0000-0000-00000000cccc';
  perform public.t_assert(stock = 6, 'stock should be held while reserved');

  n := public.sweep_expired_reservations();
  perform public.t_assert(n = 1, format('sweep should reclaim 1 reservation, got %s', n));
  select stock_quantity into stock from public.product_variants
   where id='cccc1111-0000-0000-0000-00000000cccc';
  perform public.t_assert(stock = 10,
    format('an abandoned basket must not hold stock forever; got %s', stock));

  -- ---------- a live reservation is not swept ----------
  r := public.reserve_stock_with_expiry('cccc1111-0000-0000-0000-00000000cccc', 2, null, 20);
  n := public.sweep_expired_reservations();
  perform public.t_assert(n = 0, 'a reservation that has not expired must not be swept');
  select stock_quantity into stock from public.product_variants
   where id='cccc1111-0000-0000-0000-00000000cccc';
  perform public.t_assert(stock = 8, 'a live reservation must still hold its stock');
  perform public.release_reservation((r->>'reservation_id')::uuid);

  raise notice 'STOCK RESERVATION: all assertions passed';
end $$;

-- ---------- reservations are invisible to clients ----------
do $$
declare n int; blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-11111111111a',false);
  set local role authenticated;
  begin
    select count(*) into n from public.stock_reservations;
  exception when insufficient_privilege then
    -- The grant is revoked, so the read is refused before RLS is even consulted.
    -- Stronger than returning zero rows, and equally a pass.
    blocked := true; n := 0;
  end;
  perform public.t_assert(blocked or n = 0, 'stock_reservations must be unreachable by a client');
  raise notice 'STOCK RESERVATION: table is server-only (%)',
    case when blocked then 'grant revoked' else 'no rows visible' end;
end $$;

reset role;
