-- Coach read of a client's weekly Shape Score and workout streak
-- (review 2026-09-09, R4). SECURITY DEFINER, gated on the COACH LINK ALONE
-- (`is_coach_on_client` — the get_client_stats / get_client_lifts precedent).
--
-- WHY A DEFINER AT ALL. Every other leg of /api/clients/[id]/shared-overview
-- now reads under the caller's own session. These two cannot: `score_ledger`
-- is owner-only by policy (2026-06-18-score-ledger-lockdown) and
-- `workout_sessions` exposes a client's SELF-logged sessions to nobody but
-- them. Without this the roster's SCORE · WK and STREAK columns read
-- "Not shared" on every live client, and the engine's score_drop and
-- streak_broken rules can never fire on a real account.
--
-- WHAT IT RETURNS — a compact projection, never the ledger:
--   { weeks: [{ weekOf, points, partial }], streak: { current, best, lastActiveOn } }
-- `weeks` is the last 8 ISO weeks of SUMMED deltas (no categories, no notes,
-- no source ids — the drawer draws a sparkline and a week-over-week delta,
-- and a coach has no business reading why each point landed).
--
-- ⚠ STORE REDEMPTIONS ARE EXCLUDED, as they are on every other Shape Score
-- surface in the repo (src/lib/score-derive.ts, src/lib/scoreHistory.ts:
-- "store redemptions are excluded everywhere so the report reconciles with the
-- Standing"). `redeem_store_item` writes a NEGATIVE delta for a purchase, so a
-- raw sum shows a coach "-682 this week, down 753" for a member who earned 68
-- points and bought a 750-point cap — the roster would report a collapse that
-- is a hat, and a member's private spending would become a coach-visible
-- signal. This projection drops `source_kind`, so a consumer cannot re-filter
-- afterwards: it has to be right here.
--
-- ⚠ THE CURRENT WEEK IS MARKED `partial`, NOT DROPPED. It is genuinely in
-- progress, so comparing it against a complete week is comparing two days
-- against seven: `ruleScoreDrop` would fire "Score down 54" at every actively
-- logging client every Monday through Wednesday. Dropping the bucket instead
-- would hide a real, live number and leave a member in their first week
-- reading "Not shared". So it ships flagged, and `DashSignals.scoreWeekReading`
-- is the one place that decides what a week-over-week delta may compare.
--
-- ⚠ THE STREAK IS COMPUTED IN UTC, ON PURPOSE. /api/client/dashboard computes
-- the member's own streak with a server-side `new Date()` at UTC midnight, so
-- a definer that used the member's local timezone would show the coach a
-- DIFFERENT number from the one the member is looking at. Matching the
-- member's displayed figure beats being independently more correct: two
-- streaks that disagree is worse than one that is a few hours coarse. If the
-- member's own route ever moves to local days, move this with it.
--
-- Absence returns NULL (not their coach), and an empty history returns the
-- shape with empty legs — the UI renders its own "not shared" either way.
--
-- Idempotent: CREATE OR REPLACE + guarded grants.

create or replace function public.get_client_score_history(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_weeks jsonb;
  v_today date := (now() at time zone 'UTC')::date;
  v_current int := 0;
  v_best int := 0;
  v_last date;
begin
  if not public.is_coach_on_client(p_user_id) then
    return null;
  end if;

  -- Weekly points, last 8 ISO weeks (oldest first). Weeks with no entries are
  -- absent rather than zero-filled: "no points banked" and "no week" are the
  -- same to a sparkline, and inventing a 0 would draw a crash that never
  -- happened.
  select coalesce(jsonb_agg(w order by w->>'weekOf'), '[]'::jsonb)
    into v_weeks
  from (
    select jsonb_build_object(
             'weekOf', to_char(date_trunc('week', l.earned_at at time zone 'UTC')::date, 'YYYY-MM-DD'),
             'points', sum(l.delta)::int,
             'partial', date_trunc('week', l.earned_at at time zone 'UTC')
                          = date_trunc('week', now() at time zone 'UTC')
           ) as w
    from public.score_ledger l
    where l.user_id = p_user_id
      and l.earned_at >= (now() at time zone 'UTC') - interval '8 weeks'
      and coalesce(l.source_kind, '') <> 'store_redeem'
    group by date_trunc('week', l.earned_at at time zone 'UTC')
  ) s;

  -- Streak — consecutive UTC days carrying a COMPLETED workout session, the
  -- same definition and the same day boundary /api/client/dashboard uses.
  -- Gaps-and-islands: consecutive days share `d - row_number()`, so each group
  -- is one unbroken run and its length is the streak.
  --
  -- ⚠ A FUTURE-DATED SESSION IS NEVER PART OF A CURRENT STREAK. The member's
  -- own route walks BACKWARDS from today, so a session dated tomorrow is
  -- simply unreachable there and counts for nothing. Gaps-and-islands has no
  -- such direction: without this clamp a run spanning today AND tomorrow ends
  -- in the future, still satisfies the "ends today or yesterday" test, and
  -- would show the coach a LONGER streak than the member is looking at —
  -- exactly the disagreement the UTC note above exists to prevent.
  with days as (
    select distinct (coalesce(ws.started_at, ws.ended_at, ws.created_at) at time zone 'UTC')::date as d
    from public.workout_sessions ws
    where ws.client_id = p_user_id
      and ws.status = 'completed'
      and coalesce(ws.started_at, ws.ended_at, ws.created_at) is not null
      and (coalesce(ws.started_at, ws.ended_at, ws.created_at) at time zone 'UTC')::date <= v_today
  ),
  runs as (
    select d, d - (row_number() over (order by d))::int as grp from days
  ),
  lens as (
    select count(*)::int as len, max(d) as ends_on from runs group by grp
  )
  select
    coalesce(max(len), 0),
    -- At most ONE run can end today or yesterday (a run ending yesterday and a
    -- separate one starting today would be adjacent, hence the same run), so
    -- this max IS the current streak. "Not today but yesterday" is allowed
    -- exactly as the member's own route allows it: a streak does not break
    -- until a day is missed outright.
    coalesce(max(len) filter (where ends_on >= v_today - 1), 0),
    max(ends_on)
  into v_best, v_current, v_last
  from lens;

  return jsonb_build_object(
    'weeks', coalesce(v_weeks, '[]'::jsonb),
    'streak', jsonb_build_object(
      'current', v_current,
      'best', v_best,
      'lastActiveOn', case when v_last is null then null else to_char(v_last, 'YYYY-MM-DD') end
    )
  );
end $$;

-- ⚠ Revoke from anon BY NAME. `revoke ... from public` does NOT remove
-- Supabase's explicit anon grant (the 2026-06-30-rpc-authz-hardening bug
-- class): an unauthenticated caller would otherwise reach a definer that
-- reads two owner-scoped tables.
revoke execute on function public.get_client_score_history(uuid) from public, anon;
grant execute on function public.get_client_score_history(uuid) to authenticated;
