-- LOCAL TEST FIXTURE ONLY — never run this against the real project.
--
-- Reconstructs the live storovex schema from the audit so RLS policies can be
-- written and proven locally. Column definitions are taken verbatim from
-- information_schema on the real database; constraints and defaults are added only
-- where a test needs them.
--
-- public.stores and public.subscriptions are approximations: both were destroyed
-- before their definitions could be captured. They exist here so the policies can be
-- tested, and MUST come from the owner's backup in production.

create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users(
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public, auth to authenticated, anon, service_role;

-- APPROXIMATE — real definition must be restored from backup.
create table if not exists public.stores(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  name text,
  slug text unique,
  -- subscriptions has no store_id, and try_decrement_credits takes a subscription
  -- id, so the link must live here. Confirm against the restored table.
  subscription_id uuid,
  stripe_account_id text,
  created_at timestamptz default now()
);
-- APPROXIMATE — real definition must be restored from backup.
create table if not exists public.subscriptions(
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  credits_remaining integer default 0
);

create table if not exists public.users(
  id uuid primary key, name text, email text, role text, created_at timestamptz default now());
create table if not exists public.store_team_members(
  id uuid primary key default gen_random_uuid(), store_id uuid, user_id uuid,
  role text, invited_at timestamptz default now());
create table if not exists public.products(
  id uuid primary key default gen_random_uuid(), store_id uuid, title text, description text,
  status text default 'draft', search_vector tsvector, created_at timestamptz default now());
create table if not exists public.product_variants(
  id uuid primary key default gen_random_uuid(), product_id uuid, store_id uuid, sku text,
  options jsonb, price numeric, compare_at_price numeric, stock_quantity integer default 0,
  image_url text, created_at timestamptz default now());
create table if not exists public.product_images(
  id uuid primary key default gen_random_uuid(), product_id uuid, store_id uuid, url text, position integer);
create table if not exists public.product_video_ads(
  id uuid primary key default gen_random_uuid(), product_id uuid, store_id uuid, video_url text,
  has_music boolean, has_voiceover boolean, status text, created_at timestamptz default now());
create table if not exists public.collections(
  id uuid primary key default gen_random_uuid(), store_id uuid, title text, slug text);
create table if not exists public.categories(
  id uuid primary key default gen_random_uuid(), name text, slug text);
create table if not exists public.product_categories(product_id uuid, category_id uuid);
create table if not exists public.product_collections(product_id uuid, collection_id uuid);
create table if not exists public.carts(
  id uuid primary key default gen_random_uuid(), session_token text, status text default 'open',
  created_at timestamptz default now());
create table if not exists public.cart_items(
  id uuid primary key default gen_random_uuid(), cart_id uuid, variant_id uuid,
  quantity integer, price_at_add numeric);
create table if not exists public.order_groups(
  id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now());
create table if not exists public.orders(
  id uuid primary key default gen_random_uuid(), order_group_id uuid, store_id uuid,
  order_number integer, email text, status text, subtotal numeric, shipping_total numeric,
  tax_total numeric, discount_total numeric, total numeric, application_fee_amount numeric,
  shipping_address jsonb, stripe_payment_intent_id text, created_at timestamptz default now());
create table if not exists public.order_items(
  id uuid primary key default gen_random_uuid(), order_id uuid, variant_id uuid,
  title_snapshot text, sku_snapshot text, price_snapshot numeric, quantity integer);
create table if not exists public.discounts(
  id uuid primary key default gen_random_uuid(), store_id uuid, code text, type text, value numeric,
  min_subtotal numeric, usage_limit integer, used_count integer default 0, active boolean default true,
  expires_at timestamptz);
create table if not exists public.channels(
  id uuid primary key default gen_random_uuid(), store_id uuid, channel text, status text,
  created_at timestamptz default now());
create table if not exists public.payment_events(
  id uuid primary key default gen_random_uuid(), store_id uuid, order_id uuid, stripe_event_id text,
  type text, payload jsonb, processed_at timestamptz);
create table if not exists public.credit_usage(
  id uuid primary key default gen_random_uuid(), store_id uuid, feature text,
  credits_spent integer, status text, created_at timestamptz default now());
create table if not exists public.assistant_messages(
  id uuid primary key default gen_random_uuid(), sequence bigint, store_id uuid, role text,
  content text, created_at timestamptz default now());
create table if not exists public.audit_logs(
  id uuid primary key default gen_random_uuid(), sequence bigint, store_id uuid, actor_id uuid,
  action text, metadata jsonb, created_at timestamptz default now());
create table if not exists public.store_order_counters(store_id uuid primary key, next_number integer default 1);

-- The four surviving commerce functions, reproduced verbatim from the live database
-- so the search_path fix can be tested against their real bodies.
create or replace function public.try_reserve_stock(p_variant_id uuid, p_quantity integer)
returns boolean language plpgsql as $function$
declare v_updated int;
begin
  update product_variants set stock_quantity = stock_quantity - p_quantity
   where id = p_variant_id and stock_quantity >= p_quantity;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end; $function$;

create or replace function public.release_stock(p_variant_id uuid, p_quantity integer)
returns void language sql as $function$
  update product_variants set stock_quantity = stock_quantity + p_quantity where id = p_variant_id;
$function$;

create or replace function public.next_order_number(p_store_id uuid)
returns integer language sql as $function$
  update store_order_counters set next_number = next_number + 1
   where store_id = p_store_id returning next_number - 1;
$function$;

create or replace function public.increment_discount_usage(p_discount_id uuid)
returns void language sql as $function$
  update discounts set used_count = used_count + 1 where id = p_discount_id;
$function$;

create or replace function public.try_decrement_credits(p_subscription_id uuid, p_cost integer)
returns integer language plpgsql as $function$
declare v_remaining int;
begin
  update subscriptions set credits_remaining = credits_remaining - p_cost
   where id = p_subscription_id and credits_remaining >= p_cost
  returning credits_remaining into v_remaining;
  return v_remaining;
end; $function$;

create or replace function public.refund_credits(p_subscription_id uuid, p_amount integer)
returns void language sql as $function$
  update subscriptions set credits_remaining = credits_remaining + p_amount where id = p_subscription_id;
$function$;

-- Matches the live project: RLS on everywhere, policies almost nowhere.
do $$ declare t text;
begin
  for t in select table_name from information_schema.tables where table_schema='public'
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
