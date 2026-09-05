-- Storovex marketplace — row level security.
--
-- ADDITIVE ONLY. This creates functions, policies and grants. It does not drop,
-- alter or truncate any table, and it does not touch a single row.
--
-- Why it is needed: nineteen of the twenty-two tables have RLS enabled with no
-- policies at all. That denies everything rather than leaking, so nothing is exposed
-- today — but it also means the application cannot read its own data through the
-- Supabase client, and there is no database-enforced tenant isolation. In a
-- marketplace, where one merchant must never see another's orders, that isolation is
-- the point.
--
-- The model:
--   * merchants act through store_team_members and see only their own store
--   * shoppers are anonymous and see only published storefront data
--   * money, audit and metering tables are server-only (service role)
--
-- Safe to re-run: every policy is dropped by name before being created.

-- ============================================================
-- Membership predicates
-- ============================================================

-- SECURITY DEFINER so these bypass RLS on store_team_members. Without that, a policy
-- on store_team_members that calls is_store_member() would recurse forever.
create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.store_team_members
    where store_id = p_store_id and user_id = auth.uid()
  );
$$;

create or replace function public.store_role(p_store_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.store_team_members
  where store_id = p_store_id and user_id = auth.uid() limit 1;
$$;

-- Managers may change team membership and delete records; staff may not. Kept as
-- its own predicate so the distinction is stated once.
-- store_team_members.role is constrained to 'manager' and 'staff'. Checking for
-- 'owner' or 'admin', as this did originally, could never be true for anyone, so
-- every admin-gated policy denied the whole world including the actual owner.
create or replace function public.is_store_admin(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'manager' from public.store_team_members
     where store_id = p_store_id and user_id = auth.uid() limit 1),
    false);
$$;

-- ============================================================
-- Identity
-- ============================================================

drop policy if exists "users_self_select" on public.users;
create policy "users_self_select" on public.users
for select to authenticated using (id = auth.uid());

drop policy if exists "users_self_update" on public.users;
create policy "users_self_update" on public.users
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "store_members_read_own_stores" on public.store_team_members;
create policy "store_members_read_own_stores" on public.store_team_members
for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "store_members_admin_insert" on public.store_team_members;
create policy "store_members_admin_insert" on public.store_team_members
for insert to authenticated with check (public.is_store_admin(store_id));

drop policy if exists "store_members_admin_update" on public.store_team_members;
create policy "store_members_admin_update" on public.store_team_members
for update to authenticated
using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));

drop policy if exists "store_members_admin_delete" on public.store_team_members;
create policy "store_members_admin_delete" on public.store_team_members
for delete to authenticated using (public.is_store_admin(store_id));

-- ============================================================
-- Catalogue — merchants manage; the public reads what is published
-- ============================================================

drop policy if exists "products_member_all" on public.products;
create policy "products_member_all" on public.products
for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- The storefront is anonymous, so `anon` needs read access — but only to products a
-- merchant has actually published. A draft must never be visible.
-- 'active' is the published state: products_status_check allows draft|active|archived
-- and has no 'published' value at all.
drop policy if exists "products_public_read_published" on public.products;
create policy "products_public_read_published" on public.products
for select to anon, authenticated using (status = 'active');

drop policy if exists "variants_member_all" on public.product_variants;
create policy "variants_member_all" on public.product_variants
for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- Variants, images and video ads inherit visibility from their product rather than
-- carrying their own published flag, so an unpublished product hides all of them.
drop policy if exists "variants_public_read_published" on public.product_variants;
create policy "variants_public_read_published" on public.product_variants
for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

drop policy if exists "images_member_all" on public.product_images;
create policy "images_member_all" on public.product_images
for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

drop policy if exists "images_public_read_published" on public.product_images;
create policy "images_public_read_published" on public.product_images
for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

drop policy if exists "video_ads_member_all" on public.product_video_ads;
create policy "video_ads_member_all" on public.product_video_ads
for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- Only finished ads are public; a generation in progress or failed is the
-- merchant's business alone.
drop policy if exists "video_ads_public_read_ready" on public.product_video_ads;
create policy "video_ads_public_read_ready" on public.product_video_ads
for select to anon, authenticated
using (status = 'ready'
       and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

drop policy if exists "collections_member_all" on public.collections;
create policy "collections_member_all" on public.collections
for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

drop policy if exists "collections_public_read" on public.collections;
create policy "collections_public_read" on public.collections
for select to anon, authenticated using (true);

-- Categories are a shared taxonomy, not per-store: readable by everyone, writable
-- only by the server.
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
for select to anon, authenticated using (true);

drop policy if exists "product_categories_public_read" on public.product_categories;
create policy "product_categories_public_read" on public.product_categories
for select to anon, authenticated using (true);

drop policy if exists "product_categories_member_write" on public.product_categories;
create policy "product_categories_member_write" on public.product_categories
for all to authenticated
using (exists (select 1 from public.products p where p.id = product_id and public.is_store_member(p.store_id)))
with check (exists (select 1 from public.products p where p.id = product_id and public.is_store_member(p.store_id)));

drop policy if exists "product_collections_public_read" on public.product_collections;
create policy "product_collections_public_read" on public.product_collections
for select to anon, authenticated using (true);

drop policy if exists "product_collections_member_write" on public.product_collections;
create policy "product_collections_member_write" on public.product_collections
for all to authenticated
using (exists (select 1 from public.products p where p.id = product_id and public.is_store_member(p.store_id)))
with check (exists (select 1 from public.products p where p.id = product_id and public.is_store_member(p.store_id)));

-- ============================================================
-- Merchant operations
-- ============================================================

drop policy if exists "discounts_member_all" on public.discounts;
create policy "discounts_member_all" on public.discounts
for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
-- Deliberately no public read: discount codes are validated server-side. Exposing
-- the table would let anyone enumerate every code in the marketplace.

drop policy if exists "channels_member_all" on public.channels;
create policy "channels_member_all" on public.channels
for all to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

drop policy if exists "assistant_messages_member_read" on public.assistant_messages;
create policy "assistant_messages_member_read" on public.assistant_messages
for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "assistant_messages_member_insert" on public.assistant_messages;
create policy "assistant_messages_member_insert" on public.assistant_messages
for insert to authenticated with check (public.is_store_member(store_id));

-- Read-only for merchants. Audit and metering rows are written by the server; a
-- client that could edit them could hide its own actions or its own spending.
drop policy if exists "audit_logs_member_read" on public.audit_logs;
create policy "audit_logs_member_read" on public.audit_logs
for select to authenticated using (public.is_store_member(store_id));

drop policy if exists "credit_usage_member_read" on public.credit_usage;
create policy "credit_usage_member_read" on public.credit_usage
for select to authenticated using (public.is_store_member(store_id));

-- ============================================================
-- Orders — merchants read their own; nothing client-writable
-- ============================================================

drop policy if exists "orders_member_read" on public.orders;
create policy "orders_member_read" on public.orders
for select to authenticated using (public.is_store_member(store_id));

-- Merchants may advance fulfilment state. Money columns are protected by the server
-- refusing to accept them, not by RLS, which cannot restrict individual columns.
drop policy if exists "orders_member_update" on public.orders;
create policy "orders_member_update" on public.orders
for update to authenticated
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

drop policy if exists "order_items_member_read" on public.order_items;
create policy "order_items_member_read" on public.order_items
for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and public.is_store_member(o.store_id)));

-- order_groups spans stores by design, so a merchant seeing one would see that the
-- shopper also bought elsewhere. Server-only.
-- carts and cart_items are keyed by an anonymous session_token, which a client could
-- guess or enumerate; they are handled server-side against the token.
-- payment_events and store_order_counters are financial infrastructure.
--
-- None of these five gets a policy, so RLS returns no rows to a client. That alone
-- is enough to prevent a leak, but it leaves the tables *reachable*: a client can
-- still select from them and get an empty result, and the day someone adds a
-- permissive policy for an unrelated reason, the data is public. Revoking the grant
-- as well means two independent mistakes would have to line up. Verified against the
-- live project: before this, anon could select from order_groups and receive zero
-- rows; after it, the select is refused outright.

-- ============================================================
-- Grants
-- ============================================================
-- Supabase applies these by default on new tables. Reasserted so the policies above
-- are the thing deciding access, rather than a missing privilege.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Applied after the blanket grants above, which would otherwise re-open them.
revoke all on public.order_groups from anon, authenticated;
revoke all on public.carts from anon, authenticated;
revoke all on public.cart_items from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;
revoke all on public.store_order_counters from anon, authenticated;

-- stores and subscriptions are deliberately excluded from the blanket grant above.
-- They hold stripe_account_id, subscription_id and credit balances, which need
-- column-level restriction that a table-wide grant cannot express;
-- 05_stores_policies.sql owns their privileges.
--
-- Re-revoking here matters: without it, re-running this file on its own would
-- silently re-widen those two tables to every column, and nothing would fail to
-- announce it. With it, running 01 alone leaves them closed until 05 reopens the
-- three public columns — the storefront breaks loudly rather than leaking quietly.
do $$
begin
  if to_regclass('public.stores') is not null then
    revoke all on public.stores from anon, authenticated;
  end if;
  if to_regclass('public.subscriptions') is not null then
    revoke all on public.subscriptions from anon, authenticated;
  end if;
end $$;
