-- Widens two CHECK constraints. Read this before running it: it is the only
-- change in this directory that alters a constraint the owner wrote, rather than
-- adding something alongside it.
--
-- Widening a CHECK can never reject a row that already exists — it only permits
-- more — so it cannot fail on live data and cannot corrupt anything. It is still
-- a change to someone else's schema, so it is isolated in its own file with its
-- rollback stated at the bottom.
--
-- ---------------------------------------------------------------
-- 1. credit_usage.status: add 'reserved' and 'refunded'
-- ---------------------------------------------------------------
-- The original vocabulary is completed | failed — two terminal states, both
-- written after the work finishes. That ordering is the problem: credits are
-- decremented before an AI call and the audit row is written after it, so a crash
-- in between leaves the balance reduced with no record of what took it. The
-- merchant is out of pocket and nothing can say why.
--
-- 'reserved' is the state between the charge and the outcome, so the row exists
-- from the moment the money moves. 'refunded' is what makes giving it back
-- idempotent: refundCredits flips reserved -> refunded conditionally, so two
-- concurrent retries cannot both credit the balance and mint credits from nothing.
-- Without a distinct state, "already refunded" and "failed, refund still owed"
-- are the same row and the second retry pays out again.
--
-- ---------------------------------------------------------------
-- 2. product_video_ads.status: add 'pending'
-- ---------------------------------------------------------------
-- The original is processing | ready | failed. A row is created when an ad is
-- requested and claimed when a worker picks it up, and with no state for
-- "requested but not started" those are the same value — so the claim
-- (update ... where status = 'pending') has nothing to test and two workers can
-- generate, and charge for, the same ad. 'pending' gives the claim something to
-- transition from. The table has no other column to use: it is
-- (id, product_id, store_id, video_url, has_music, has_voiceover, status, created_at).

alter table public.credit_usage drop constraint if exists credit_usage_status_check;
alter table public.credit_usage add constraint credit_usage_status_check
  check (status = any (array['completed'::text,'failed'::text,
                             'reserved'::text,'refunded'::text]));

alter table public.product_video_ads drop constraint if exists product_video_ads_status_check;
alter table public.product_video_ads add constraint product_video_ads_status_check
  check (status = any (array['processing'::text,'ready'::text,'failed'::text,'pending'::text]));

-- ---------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------
-- Restores the original two constraints exactly. It will fail if rows already use
-- the added values — which is correct: it is telling you the data now depends on
-- them, and the application code must be reverted alongside.
--
--   alter table public.credit_usage drop constraint if exists credit_usage_status_check;
--   alter table public.credit_usage add constraint credit_usage_status_check
--     check (status = any (array['completed'::text,'failed'::text]));
--
--   alter table public.product_video_ads drop constraint if exists product_video_ads_status_check;
--   alter table public.product_video_ads add constraint product_video_ads_status_check
--     check (status = any (array['processing'::text,'ready'::text,'failed'::text]));
