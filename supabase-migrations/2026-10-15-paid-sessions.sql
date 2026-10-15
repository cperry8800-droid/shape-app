-- A paid session becomes something the coach books, and a program is recorded as a program
-- (client-onboarding review, fix 3c: M10). Idempotent, safe to re-run.
--
-- Called by:
--   src/app/api/stripe/checkout-session/route.ts  (writes kind 'program' for a program's sale)
--   src/app/api/stripe/webhook/route.ts           (records the purchase with that kind)
--   src/app/api/sessions/manage/route.ts          (links a booked session to the paid one)
--   src/app/api/coach/to-schedule/route.ts        (the coach's paid sessions not yet booked)
--
-- ── 1. one_time_purchases.kind takes 'program' ────────────────────────────────
-- ⚠ A PROGRAM'S SALE WAS RECORDED AS A BOOKING. The checkout wrote kind 'booking' for anything a
-- trainer sold, so a program bought from a trainer counted as a paid session everywhere a booking
-- means one: is_coach_with_client (2026-10-15-coach-client-intake.sql) made its buyer a coaching
-- client, and get_or_create_client_conversation (2026-10-15-coach-thread.sql) opened a thread for
-- them. A program is a product (fix 2b's rule), so its sale is now 'program'.
--
-- ── 2. one_time_purchases.session_id ──────────────────────────────────────────
-- ⚠ A PAID SESSION NEVER BECAME A SESSION. Nothing booked it, and /api/sessions/manage let a
-- coach book only an active subscriber, so a client who paid for one session could not be booked
-- at all. A paid session is now "to schedule" until a session is booked against it: the coach's
-- booking links the oldest open one (session_id), and one whose session is cancelled or declined
-- is open again. ON DELETE SET NULL for the same reason.
--
-- ── 3. A program recorded as a booking is corrected ───────────────────────────
-- ⚠ THE WEBHOOK RECORDS A PROGRAM AS A BOOKING UNTIL THIS FILE RUNS (Fable on #2373). Before the kind
-- check takes 'program' it refuses it, and the webhook keeps the sale as 'booking' rather than lose
-- the buyer's entitlement. A row like that names a plan, which no session's purchase does (plan_id,
-- or the snapshot's id when the plan was deleted before payment), so every such row becomes a program.
-- Production held no one-time purchases on 2026-10-15, so this corrects only a row written between
-- the deploy and this migration.

alter table public.one_time_purchases drop constraint if exists one_time_purchases_kind_check;
alter table public.one_time_purchases add constraint one_time_purchases_kind_check
  check (kind in ('booking', 'meal_plan', 'program'));

alter table public.one_time_purchases
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

update public.one_time_purchases
   set kind = 'program'
 where kind = 'booking'
   and (plan_id is not null or (plan_snapshot is not null and plan_snapshot ? 'id'));

create index if not exists one_time_purchases_open_sessions_idx
  on public.one_time_purchases (provider_role, provider_id, client_id, created_at)
  where kind = 'booking' and status = 'paid';

-- ===== Guard =====
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conrelid = 'public.one_time_purchases'::regclass and c.conname = 'one_time_purchases_kind_check';
  if v_def is null or position('program' in v_def) = 0 or position('booking' in v_def) = 0 or position('meal_plan' in v_def) = 0 then
    raise exception 'one_time_purchases_kind_check is missing or wrong: %', coalesce(v_def, '(none)');
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'one_time_purchases' and column_name = 'session_id' and data_type = 'uuid'
  ) then
    raise exception 'one_time_purchases.session_id is missing';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.one_time_purchases'::regclass and c.contype = 'f'
      and c.confrelid = 'public.sessions'::regclass and c.confdeltype = 'n'
  ) then
    raise exception 'one_time_purchases.session_id must reference sessions on delete set null';
  end if;
  if exists (
    select 1 from public.one_time_purchases
    where kind = 'booking' and (plan_id is not null or (plan_snapshot is not null and plan_snapshot ? 'id'))
  ) then
    raise exception 'a purchase that names a plan is still recorded as a booking';
  end if;
end $$;
