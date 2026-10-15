-- Coaches set their own free intro length, and a session knows it is an intro.
-- Client-onboarding review, fix 3b. Idempotent, safe to re-run.
--
-- Owner, 2026-10-15: "make sure coaches can set the lengh for their consultation, if they want 15
-- or 30 min" · "or even 10 min" · "it should be completly customizable" · "coach should have
-- flexibility to set any meeting they want".
--
-- Called by:
--   src/app/api/my-booking-rules/route.ts   (the coach saves the length with their other rules)
--   src/app/api/consultation/route.ts       (books the intro at that length, marks it intro)
--   src/lib/session-emails.ts               (the follow-up after an intro)
--
-- ── 1. provider_booking_rules.consult_min ────────────────────────────────────
-- The intro's length in whole minutes, 5 to 240: any length, up to the four hours a coach's own
-- booking can run (/api/sessions/manage). The default is 15, what every intro was until now, so a
-- coach who never sets it changes nothing. bookingRules.mjs RULE_LIMITS.consultMin states the same
-- range (tests/booking-rules.test.mjs reads both and requires agreement).
-- ⚠ PUBLIC READ, LIKE THE REST OF THE ROW. The booking page lays out times of this length for
-- signed-out visitors; how long a coach's free intro runs discloses nothing. The owner write policy
-- (provider_write_booking_rules) already covers the new column.
--
-- ── 2. sessions.intro ────────────────────────────────────────────────────────
-- True for a booking /api/consultation writes. Every intro used to be the 15-minute video session,
-- and that length was the only thing that marked one; now that the length is the coach's, the
-- follow-up after an intro needs a marker of its own. Default false.
-- ⚠ A MEMBER CAN SET IT ON THEIR OWN REQUEST (client_insert_own_sessions lets them write their own
-- `requested` row), and all it earns them is a "how was your intro?" note to themselves when the
-- coach completes it. Nothing else reads it.
--
-- Production held no sessions and no booking rules on 2026-10-15, so nothing is backfilled.

alter table public.provider_booking_rules
  add column if not exists consult_min integer not null default 15;

alter table public.provider_booking_rules drop constraint if exists provider_booking_rules_consult_min;
alter table public.provider_booking_rules add constraint provider_booking_rules_consult_min
  check (consult_min between 5 and 240);

alter table public.sessions
  add column if not exists intro boolean not null default false;

-- ===== Guard =====
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conrelid = 'public.provider_booking_rules'::regclass
    and c.conname = 'provider_booking_rules_consult_min';
  if v_def is null or v_def !~ 'consult_min >= 5' or v_def !~ 'consult_min <= 240' then
    raise exception 'provider_booking_rules_consult_min is missing or wrong: %', coalesce(v_def, '(none)');
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_booking_rules'
      and column_name = 'consult_min' and is_nullable = 'NO' and column_default = '15'
  ) then
    raise exception 'provider_booking_rules.consult_min is not NOT NULL DEFAULT 15';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions'
      and column_name = 'intro' and is_nullable = 'NO' and column_default = 'false'
  ) then
    raise exception 'sessions.intro is not NOT NULL DEFAULT false';
  end if;
end $$;
