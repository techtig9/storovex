-- RLS for the two tables restored by 00_restore_stores_subscriptions.sql.
-- Additive: creates policies and grants only.
--
-- stores is the one table an anonymous shopper must read (the storefront resolves
-- /s/<slug> through it) while also holding two values that must never reach a
-- browser: stripe_account_id and subscription_id.
--
-- A row policy cannot express that, because RLS filters rows, not columns. Column
-- GRANTs can, so the two mechanisms are used together: the policy says which rows
-- are visible, the grant says which columns. The server keeps full access because
-- the service role bypasses both.

drop policy if exists "stores_public_read" on public.stores;
create policy "stores_public_read" on public.stores
for select to anon, authenticated using (true);

drop policy if exists "stores_member_update" on public.stores;
create policy "stores_member_update" on public.stores
for update to authenticated
using (public.is_store_admin(id)) with check (public.is_store_admin(id));

-- Column-level access. Revoking first is what makes this authoritative: without
-- it, a column grant added later would union with whatever table-wide grant
-- Supabase's defaults had already handed these roles.
revoke all on public.stores from anon, authenticated;
grant select (id, name, slug, created_at) on public.stores to anon, authenticated;
grant update (name, slug) on public.stores to authenticated;

-- subscriptions gets no policy at all. It is billing state: credits_remaining is
-- the balance the AI features spend against, and every reader of it
-- (creditService, try_decrement_credits, refund_credits) runs server-side. RLS is
-- enabled with zero policies, which denies both roles outright.
revoke all on public.subscriptions from anon, authenticated;
