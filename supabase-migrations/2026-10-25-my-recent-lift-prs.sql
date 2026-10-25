-- The calling client's most recently set strength PRs, for the profile's activity feed
-- (/api/client/progress → recentPrs).
--
-- get_my_lift_prs ranks every move's all-time best by load and clamps its limit to 100,
-- so a member with more than 100 distinct moves who sets a new best on a light move had
-- it cut before the route could sort by date (Codex P2 on #2445). This function computes
-- the same per-move bests and orders them by WHEN each was set before it limits, so the
-- newest records are the ones returned, however many moves there are.
--
-- The body is get_my_lift_prs's (2026-06-26-my-lift-prs.sql) with only the final ORDER BY
-- changed (and its search_path pinned with pg_temp, as tests/definer-grants.test.mjs asks of a
-- new definer): the same column-then-payload load/reps extraction, incomplete sets excluded,
-- the heaviest set per move picked in pounds (ties to the most recent), and the set's own
-- load and unit returned. tests/recent-lift-prs.test.mjs holds the two bodies equal.
--
-- Self-scoped: SECURITY DEFINER + auth.uid() (no user_id param — a caller only ever reads
-- their own PRs). Idempotent: create or replace, and the grants can be re-run.

create or replace function public.get_my_recent_lift_prs(p_limit int default 6)
returns table (move text, best numeric, best_reps int, unit text, best_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sets as (
    select
      btrim(sl.move_name) as move,
      -- best load: actual column (>0), then payload aliases (regex-safe numeric).
      coalesce(
        case when sl.actual_load > 0 then sl.actual_load::numeric else null end,
        (regexp_match(coalesce(sl.payload->>'actualLoad', sl.payload->>'load', sl.payload->>'actual_load', ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric
      ) as load,
      -- reps of that set: actual column (>0), then payload aliases.
      coalesce(
        case when sl.actual_reps > 0 then sl.actual_reps else null end,
        (regexp_match(coalesce(sl.payload->>'actualReps', sl.payload->>'reps', sl.payload->>'actual_reps', ''), '([0-9]+)'))[1]::int
      ) as reps,
      coalesce(sl.load_unit, 'lb') as unit,
      sl.created_at
    from public.workout_set_logs sl
    where sl.client_id = auth.uid()
      and sl.completed is distinct from false
      and btrim(coalesce(sl.move_name, '')) <> ''
  ),
  valid as (
    select * from sets where load is not null and load > 0
  ),
  normed as (
    -- normalize to lb ONLY for ranking, so a mixed kg/lb history picks the truly
    -- heaviest set and orders moves correctly; the original load + unit are returned.
    select *, (case when lower(unit) = 'kg' then load * 2.20462 else load end) as load_lb
    from valid
  ),
  best as (
    -- the single heaviest set per move (ties broken by most recent), all-time.
    select distinct on (move)
      move, load as best, load_lb, reps as best_reps, unit, created_at as best_at
    from normed
    order by move, load_lb desc, created_at desc
  )
  select move, best, best_reps, unit, best_at
  from best
  order by best_at desc, load_lb desc
  limit greatest(1, least(coalesce(p_limit, 6), 100));
$$;

-- Postgres grants EXECUTE to PUBLIC, and Supabase's default privileges grant it to anon;
-- revoke both so only authenticated callers (scoped to auth.uid() inside) can run it.
revoke execute on function public.get_my_recent_lift_prs(int) from public, anon;
grant execute on function public.get_my_recent_lift_prs(int) to authenticated;
