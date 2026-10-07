-- No two active bookings for one coach can overlap — refused by the database, not only by a read.
-- Coach Schedule upgrade, step 2 (Codex, the review of #2228, P1). Idempotent, safe to re-run.
--
-- Answered by:
--   src/lib/session-booking.ts  isDoubleBookError — 23P01 (this constraint) and 23505 (the
--                               identical-start index) both read as "that time was just taken"
--   src/app/api/sessions/request/route.ts, src/app/api/sessions/manage/route.ts (create and
--   reschedule), src/app/api/consultation/route.ts
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
-- Every booking route reads the coach's calendar (findSessionClash), then writes. Two
-- overlapping bookings sent at the same moment — 09:00–10:00 and 09:30–10:30 — both pass the
-- read before either insert commits. The only guard in the schema, sessions_no_conflict_idx, is
-- unique on the exact START instant, so both inserts succeed and the coach is double-booked.
-- A reschedule can lose the same race.
--
-- ── WHAT THIS DOES ───────────────────────────────────────────────────────────
-- An exclusion constraint: for one coach (provider_role, provider_id), no two rows whose status
-- holds time ('requested', 'confirmed' — scheduleRules.mjs ACTIVE_STATUSES, the same two the
-- start index covers) may have intersecting [start, start + duration) ranges. Half-open, so a
-- 9:00–10:00 session and a 10:00 one are back to back, not a clash — the rule clashIn() applies.
--
-- ⚠ session_span IS DECLARED IMMUTABLE, AND THAT IS TRUE, NOT A WORKAROUND. `timestamptz +
-- interval` is only STABLE because an interval with days or months depends on the session time
-- zone (a "day" across a DST change). make_interval(mins => n) has neither: n minutes is the
-- same span of absolute time in every zone, so the result depends on the arguments alone.
--
-- ⚠ IF THIS FAILS WITH 23P01, two active bookings already overlap. Production held 0 sessions
-- on 2026-10-07, so it should not; if it does, the error names the pair to cancel or move.

create extension if not exists btree_gist with schema extensions;

create or replace function public.session_span(p_start timestamptz, p_minutes integer)
returns tstzrange
language sql
immutable
parallel safe
set search_path = ''
as $$
  select tstzrange(p_start, p_start + make_interval(mins => greatest(coalesce(p_minutes, 15), 0)), '[)')
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_no_overlap' and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_no_overlap
      exclude using gist (
        provider_role with =,
        provider_id with =,
        public.session_span(scheduled_at, duration_min) with &&
      )
      where (status in ('requested', 'confirmed'));
  end if;
end $$;
