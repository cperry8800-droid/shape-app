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
-- Absence returns NULL (not their coach). A client with no ledger entries at
-- all returns `weeks` holding only the current week at 0 — the grid below
-- starts at their first entry, and they have none — and a client with no
-- completed sessions returns `{current: 0, best: 0, lastActiveOn: null}`.
-- ⚠ BOTH OF THOSE ARE MEASURED ZEROES, NOT "NOT SHARED", and the roster says
-- so: `0d` in STREAK is the true answer for someone who has not trained. Only
-- an unapplied migration or a failed read renders "Not shared", because only
-- then is the answer genuinely unknown.
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

  -- Weekly points, the last 8 ISO weeks (oldest first), ZERO-FILLED.
  --
  -- ⚠ A WEEK WITH NO ENTRIES MUST SHIP AS 0, NOT BE OMITTED. This read
  -- originally dropped empty weeks on the reasoning that "inventing a 0 would
  -- draw a crash that never happened" — and that reasoning is WRONG twice
  -- over. The ledger is the record of points EARNED, so the sum over an empty
  -- week is a measured zero, not an invention. And omitting it silently breaks
  -- adjacency for every consumer: `scoreWeekReading` compares the two newest
  -- complete buckets, so a client who banks nothing all week keeps LAST week's
  -- healthy number in the SCORE · WK column, unflagged (the newest bucket is
  -- last week, and it is not `partial`), while a client silent for a month has
  -- two non-adjacent weeks subtracted and reported as "week-over-week".
  -- A zero-filled grid makes adjacency structural rather than hoped for.
  --
  -- ⚠ AND THE WINDOW IS FLOORED TO A WEEK BOUNDARY. A rolling
  -- `now() - interval '8 weeks'` starts mid-week, so the OLDEST bucket held a
  -- partial week's points while reporting `partial: false` — manufacturing a
  -- drop or a gain out of the window's own edge.
  --
  -- The grid starts at the client's FIRST ledger week when that is inside the
  -- window: weeks before a member earned anything are genuinely no-data, and
  -- zero-filling those would draw a flat run they never lived.
  with bounds as (
    select date_trunc('week', now() at time zone 'UTC')::date as cur_week,
           (date_trunc('week', now() at time zone 'UTC') - interval '7 weeks')::date as win_start
  ),
  first_entry as (
    select date_trunc('week', min(l.earned_at) at time zone 'UTC')::date as first_week
    from public.score_ledger l
    where l.user_id = p_user_id
      and coalesce(l.source_kind, '') <> 'store_redeem'
  ),
  grid as (
    select generate_series(
             greatest(b.win_start, coalesce(f.first_week, b.cur_week)),
             b.cur_week,
             interval '1 week'
           )::date as w
    from bounds b cross join first_entry f
  ),
  sums as (
    select date_trunc('week', l.earned_at at time zone 'UTC')::date as w,
           sum(l.delta)::int as pts
    from public.score_ledger l, bounds b
    where l.user_id = p_user_id
      and coalesce(l.source_kind, '') <> 'store_redeem'
      and l.earned_at >= b.win_start
    group by 1
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'weekOf', to_char(g.w, 'YYYY-MM-DD'),
             'points', coalesce(s.pts, 0),
             'partial', g.w = (select cur_week from bounds)
           ) order by g.w
         ), '[]'::jsonb)
    into v_weeks
  from grid g left join sums s on s.w = g.w;

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
    -- ⚠ `best` IS WINDOWED TO THE SAME 8 WEEKS AS THE SCORE, and that is what
    -- keeps ruleStreakBroken from firing at half the roster. It fires on
    -- `current === 0 && best >= 3`, so a LIFETIME best is permanently >= 3 for
    -- anyone who ever trained three days running — and a Mon/Wed/Fri member
    -- has current 0 every Sunday, so they would be flagged "streak broken"
    -- every week forever. A recent best asks the question the rule means:
    -- did they have a roll lately, and have they lost it.
    coalesce(max(len) filter (where ends_on >= v_today - 56), 0),
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
