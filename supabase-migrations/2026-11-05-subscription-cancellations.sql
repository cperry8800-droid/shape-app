-- Coach plan cancellations, kept on the subscription row (2026-11-05).
--
-- The Stripe webhook wrote only status and current_period_end, so a member who cancelled kept an
-- `active` row until the period ended and only a live Stripe read inside a 7-day window could tell.
-- These columns hold what Stripe says about the cancellation, written by
-- customer.subscription.updated / .deleted (src/app/api/stripe/webhook/route.ts) and filled for the
-- past by scripts/backfill-coach-payments.mjs:
--   cancel_at_period_end, cancel_at   the plan is set to end (and when); null = not synced yet
--   canceled_at                       when the cancellation was asked for (Stripe's own meaning: for
--                                     a cancel at period end it is the request, not the end)
--   ended_at                          when the plan actually ended
--   cancellation_reason / _feedback / _comment   Stripe's cancellation_details
--   cancel_synced_at                  the Stripe time of the last cancellation write, so an older
--                                     event delivered late can't undo a newer one
--
-- And the member's own words (owner, 2026-11-05: "user types response"). Members now cancel a coach
-- plan in Shape's own step (POST /api/stripe/cancel-plan), which asks one optional question, "Why
-- are you leaving?", answered as free text:
--   member_cancel_reason, member_cancel_reason_at
-- ⚠ PRIVATE TO THAT COACH AND SHAPE. RLS on subscriptions is "clients read own" + "providers read
-- own": no other coach reads the row (verified for shared-overview, 2026-08-10). The member reads
-- back only their own words. Nothing public reads these columns.
--
-- Re-runnable: "add column if not exists", constraints dropped and re-added, and a guard.

begin;

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean,
  add column if not exists cancel_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_feedback text,
  add column if not exists cancellation_comment text,
  add column if not exists cancel_synced_at timestamptz,
  add column if not exists member_cancel_reason text,
  add column if not exists member_cancel_reason_at timestamptz;

-- The member's words are capped where they are typed (500) and here.
alter table public.subscriptions drop constraint if exists subscriptions_member_cancel_reason_len;
alter table public.subscriptions add constraint subscriptions_member_cancel_reason_len
  check (member_cancel_reason is null or char_length(member_cancel_reason) between 1 and 500);
alter table public.subscriptions drop constraint if exists subscriptions_cancellation_comment_len;
alter table public.subscriptions add constraint subscriptions_cancellation_comment_len
  check (cancellation_comment is null or char_length(cancellation_comment) <= 5000);

do $guard$
declare
  c text;
begin
  foreach c in array array['cancel_at_period_end', 'cancel_at', 'canceled_at', 'ended_at', 'cancellation_reason',
    'cancellation_feedback', 'cancellation_comment', 'cancel_synced_at', 'member_cancel_reason', 'member_cancel_reason_at'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'subscriptions' and column_name = c
    ) then
      raise exception 'subscriptions.% is missing', c;
    end if;
  end loop;
  -- The reason must stay private: no policy may open subscriptions beyond the member and their coach.
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and cmd in ('SELECT', 'ALL')
      and policyname not in ('clients read own subscriptions', 'providers read own subscriptions')
  ) then
    raise exception 'subscriptions has a read policy beyond the member and their coach; the cancellation reason would leak';
  end if;
end
$guard$;

commit;
