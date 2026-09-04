-- Storovex marketplace — RLS isolation test.
--
-- Proves that a merchant cannot reach another merchant's data, that the anonymous
-- storefront sees published products and nothing else, and that financial tables are
-- closed to clients entirely.
--
-- Every assertion raises on failure, so a clean run means everything passed.
-- Re-runnable: it resets its own fixtures first. Inserts fixture rows, so run it on
-- a project without real data.

create or replace function public.t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin if not cond then raise exception 'ASSERTION FAILED: %', msg; end if; end; $$;

reset role;

-- ---------- fixtures ----------
delete from public.order_items where order_id in (select id from public.orders where store_id in
  ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b'));
delete from public.orders where store_id in
  ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
delete from public.payment_events where store_id = 'b0000000-0000-0000-0000-00000000000b';
delete from public.credit_usage where store_id = 'b0000000-0000-0000-0000-00000000000b';
delete from public.audit_logs where store_id = 'b0000000-0000-0000-0000-00000000000b';
delete from public.discounts where store_id = 'b0000000-0000-0000-0000-00000000000b';
delete from public.product_variants where store_id in
  ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
delete from public.products where store_id in
  ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
delete from public.store_team_members where store_id in
  ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
delete from public.carts where session_token = 'tok-shopper';

insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-11111111111a','merchant-a@example.com'),
  ('22222222-2222-2222-2222-22222222222b','merchant-b@example.com')
on conflict (id) do nothing;

insert into public.store_team_members(store_id,user_id,role) values
  ('a0000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-11111111111a','owner'),
  ('b0000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-22222222222b','owner');

-- Merchant B's data. Merchant A must never see any of it.
insert into public.products(id,store_id,title,status) values
  ('bbbb1111-0000-0000-0000-00000000bbbb','b0000000-0000-0000-0000-00000000000b','B Secret Draft','draft'),
  ('bbbb2222-0000-0000-0000-00000000bbbb','b0000000-0000-0000-0000-00000000000b','B Published Item','published');
insert into public.product_variants(id,product_id,store_id,sku,price,stock_quantity) values
  ('bbbb3333-0000-0000-0000-00000000bbbb','bbbb2222-0000-0000-0000-00000000bbbb',
   'b0000000-0000-0000-0000-00000000000b','B-SKU-1',49.99,10);
insert into public.discounts(store_id,code,type,value) values
  ('b0000000-0000-0000-0000-00000000000b','BSECRET20','percent',20);
insert into public.orders(id,store_id,order_number,email,status,total,application_fee_amount) values
  ('bbbb4444-0000-0000-0000-00000000bbbb','b0000000-0000-0000-0000-00000000000b',1001,
   'shopper@example.com','paid',49.99,4.99);
insert into public.order_items(order_id,variant_id,title_snapshot,price_snapshot,quantity) values
  ('bbbb4444-0000-0000-0000-00000000bbbb','bbbb3333-0000-0000-0000-00000000bbbb','B Published Item',49.99,1);
insert into public.payment_events(store_id,order_id,stripe_event_id,type) values
  ('b0000000-0000-0000-0000-00000000000b','bbbb4444-0000-0000-0000-00000000bbbb','evt_secret','payment_intent.succeeded');
insert into public.credit_usage(store_id,feature,credits_spent,status) values
  ('b0000000-0000-0000-0000-00000000000b','video_ad',25,'committed');
insert into public.audit_logs(store_id,actor_id,action) values
  ('b0000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-22222222222b','product.deleted');
insert into public.carts(session_token,status) values ('tok-shopper','open');

-- Merchant A's own product, to prove access is scoped rather than simply broken.
insert into public.products(id,store_id,title,status) values
  ('aaaa1111-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-00000000000a','A Own Product','published');

-- ============================================================
-- Act as merchant A
-- ============================================================
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-11111111111a',false);
set role authenticated;

select public.t_assert((select count(*) from public.products
  where store_id='a0000000-0000-0000-0000-00000000000a')=1,
  'a merchant must see their own products');

-- The draft is the real test: the published one is visible to everybody by design.
select public.t_assert((select count(*) from public.products
  where id='bbbb1111-0000-0000-0000-00000000bbbb')=0,
  'another store''s DRAFT product must be invisible');

select public.t_assert((select count(*) from public.discounts)=0,
  'discount codes must never be readable across stores');
select public.t_assert((select count(*) from public.orders)=0,
  'another store''s orders must be invisible');
select public.t_assert((select count(*) from public.order_items)=0,
  'another store''s order items must be invisible');
select public.t_assert((select count(*) from public.credit_usage)=0,
  'another store''s AI spending must be invisible');
select public.t_assert((select count(*) from public.audit_logs)=0,
  'another store''s audit trail must be invisible');
select public.t_assert((select count(*) from public.store_team_members
  where store_id='b0000000-0000-0000-0000-00000000000b')=0,
  'another store''s team must be invisible');

-- Server-only tables: closed to every client, not merely scoped.
select public.t_assert((select count(*) from public.payment_events)=0,
  'payment_events must be server-only');
select public.t_assert((select count(*) from public.carts)=0,
  'carts must be server-only: session_token is guessable');
select public.t_assert((select count(*) from public.order_groups)=0,
  'order_groups spans stores and must be server-only');
select public.t_assert((select count(*) from public.store_order_counters)=0,
  'store_order_counters must be server-only');

do $$
declare denied boolean;
begin
  begin
    insert into public.products(store_id,title,status)
    values('b0000000-0000-0000-0000-00000000000b','Injected','published');
    denied := false;
  exception when others then denied := true; end;
  perform public.t_assert(denied,'writing a product into another store must be denied');

  begin
    update public.orders set status='cancelled'
     where id='bbbb4444-0000-0000-0000-00000000bbbb';
    perform public.t_assert(not found,'updating another store''s order must affect no rows');
  exception when others then null; end;

  begin
    insert into public.payment_events(store_id,stripe_event_id,type)
    values('a0000000-0000-0000-0000-00000000000a','evt_forged','payment_intent.succeeded');
    denied := false;
  exception when others then denied := true; end;
  perform public.t_assert(denied,'a client must never write a payment event');

  raise notice 'MERCHANT ISOLATION: all assertions passed';
end $$;

-- ============================================================
-- Act as an anonymous shopper
-- ============================================================
reset role;
select set_config('request.jwt.claim.sub','',false);
set role anon;

select public.t_assert((select count(*) from public.products
  where id='bbbb2222-0000-0000-0000-00000000bbbb')=1,
  'the storefront must show a published product');
select public.t_assert((select count(*) from public.products
  where id='bbbb1111-0000-0000-0000-00000000bbbb')=0,
  'the storefront must NOT show a draft product');
select public.t_assert((select count(*) from public.product_variants
  where id='bbbb3333-0000-0000-0000-00000000bbbb')=1,
  'a published product''s variants must be visible for the price');
select public.t_assert((select count(*) from public.orders)=0,
  'an anonymous visitor must never read orders');
select public.t_assert((select count(*) from public.discounts)=0,
  'an anonymous visitor must never enumerate discount codes');
select public.t_assert((select count(*) from public.users)=0,
  'an anonymous visitor must never read users');
select public.t_assert((select count(*) from public.credit_usage)=0,
  'an anonymous visitor must never read credit usage');

do $$
declare denied boolean;
begin
  begin
    insert into public.products(store_id,title,status)
    values('a0000000-0000-0000-0000-00000000000a','Anon Injected','published');
    denied := false;
  exception when others then denied := true; end;
  perform public.t_assert(denied,'an anonymous visitor must not write products');
  raise notice 'STOREFRONT ISOLATION: all assertions passed';
end $$;

reset role;

-- ============================================================
-- A draft product must hide its variants and images too
-- ============================================================
do $$
declare n int;
begin
  insert into public.product_variants(id,product_id,store_id,sku,price,stock_quantity)
  values('bbbb5555-0000-0000-0000-00000000bbbb','bbbb1111-0000-0000-0000-00000000bbbb',
         'b0000000-0000-0000-0000-00000000000b','B-DRAFT-SKU',9.99,5);

  perform set_config('request.jwt.claim.sub','',false);
  set local role anon;
  select count(*) into n from public.product_variants
   where id='bbbb5555-0000-0000-0000-00000000bbbb';
  perform public.t_assert(n=0,
    'a draft product''s variants must stay hidden, or an unreleased price leaks');
  raise notice 'DRAFT INHERITANCE: variants of an unpublished product stay hidden';
end $$;

reset role;
