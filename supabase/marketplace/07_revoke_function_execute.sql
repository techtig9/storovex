-- Closes the RPC surface.
--
-- Supabase exposes every function in `public` at /rest/v1/rpc/<name>, so a function
-- is callable by anyone holding the anon key — which is a public value, shipped to
-- every browser — unless EXECUTE is revoked. Supabase's own linter flagged twelve
-- of these. Four of them are ones I added, and they are the serious ones:
--
--   reserve_stock_with_expiry  an anonymous caller could reserve a store's entire
--                              inventory in a loop and hold it for the TTL. No
--                              purchase, no account, no trace beyond the stock
--                              going to zero. Denial of inventory.
--   release_reservation        takes a reservation id and returns the stock. A
--                              caller who guessed or observed an id could free
--                              another shopper's held stock mid-checkout.
--   release_cart_reservations  the same, by cart id.
--   sweep_expired_reservations  meant for a scheduler, not the public internet.
--
-- These are SECURITY DEFINER, so they bypass RLS entirely: the policies in 01 and 05
-- do not constrain them at all. That is exactly why they must not be callable.
--
-- The predicate functions (is_store_member, is_store_admin, store_role) are a
-- different case. They are revoked from PUBLIC and from anon, then granted back to
-- authenticated, because the merchant policies in 01 call them and an RLS policy
-- expression IS evaluated with the calling role's privileges — revoke EXECUTE from
-- authenticated and every merchant query fails with "permission denied for function
-- is_store_member" rather than simply returning fewer rows.
--
-- I first wrote the opposite here, having watched the test suite pass after a
-- revoke. That revoke had done nothing at all (it named anon and authenticated but
-- not PUBLIC, see below), so the suite was passing on a grant that was still in
-- place. The lesson is narrow and worth stating: a test that passes after a change
-- proves nothing until you have confirmed the change actually took effect.
--
-- anon keeps no access to them, and needs none: every policy anon is subject to
-- tests a status column or is unconditional, and none calls a predicate function.
--
-- The remaining six are the owner's own commerce functions. They are not SECURITY
-- DEFINER, so RLS still applies to what they touch, but they move stock, credits,
-- order numbers and discount counters. Every caller in the application uses the
-- service role, which is unaffected by these revokes — verified by inspecting all
-- eleven .rpc() call sites.

-- IMPORTANT: the revoke must name PUBLIC, not just anon and authenticated.
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and anon
-- and authenticated inherit it from there. Revoking from those two roles alone
-- removes a grant they never separately held and changes nothing at all.
--
-- This is not theoretical. The first version of this file revoked from anon and
-- authenticated only; the verification probe then reserved all 100 units of a
-- store's stock as anon and the revoke had no effect. Then EXECUTE is granted back
-- to service_role explicitly, because revoking from PUBLIC takes it from the server
-- too and every legitimate caller runs as service_role.

revoke execute on function public.is_store_member(uuid) from public, anon, authenticated;
revoke execute on function public.is_store_admin(uuid) from public, anon, authenticated;
revoke execute on function public.store_role(uuid) from public, anon, authenticated;

revoke execute on function public.reserve_stock_with_expiry(uuid, integer, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_reservation(uuid) from public, anon, authenticated;
revoke execute on function public.release_cart_reservations(uuid) from public, anon, authenticated;
revoke execute on function public.sweep_expired_reservations() from public, anon, authenticated;

revoke execute on function public.try_reserve_stock(uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_stock(uuid, integer) from public, anon, authenticated;
revoke execute on function public.next_order_number(uuid) from public, anon, authenticated;
revoke execute on function public.increment_discount_usage(uuid) from public, anon, authenticated;
revoke execute on function public.try_decrement_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, integer) from public, anon, authenticated;

-- Hand it back to the server. Without this the application cannot call its own
-- commerce functions.
do $$
declare f text;
begin
  foreach f in array array[
    'reserve_stock_with_expiry(uuid, integer, uuid, integer)','release_reservation(uuid)',
    'release_cart_reservations(uuid)','sweep_expired_reservations()',
    'try_reserve_stock(uuid, integer)','release_stock(uuid, integer)',
    'next_order_number(uuid)','increment_discount_usage(uuid)',
    'try_decrement_credits(uuid, integer)','refund_credits(uuid, integer)']
  loop
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- The three policy predicates go back to authenticated as well. Merchant policies
-- call them on every query, so without this a signed-in merchant can read nothing.
grant execute on function public.is_store_member(uuid) to authenticated, service_role;
grant execute on function public.is_store_admin(uuid) to authenticated, service_role;
grant execute on function public.store_role(uuid) to authenticated, service_role;
