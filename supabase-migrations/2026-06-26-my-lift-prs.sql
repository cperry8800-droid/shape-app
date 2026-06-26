-- All-time strength PRs for the calling client, computed across EVERY logged set
-- (no row/date cap), so the Progress page's "PR history" can never drop an old
-- all-time best when a high-volume athlete has more sets than the route's
-- workout_set_logs window (the route reads the newest 3000 for the recent
-- e1RM/trajectory; PRs come from this aggregate instead).
--
-- Mirrors the load/reps extraction the API route + get_client_lifts use: the
-- in-app live-session writer stores actuals in the `payload` jsonb (actualLoad /
-- actualReps) and does NOT populate the actual_load/actual_reps columns, so each
-- value reads the column first (>0; a 0 column means "not set"), then the payload
-- aliases. Incomplete sets are excluded. Numeric values are extracted via regex
-- so non-numeric free text yields NULL rather than erroring.
--
-- Self-scoped: SECURITY DEFINER + auth.uid() (no user_id param — a caller only
-- ever reads their own PRs), matching the compute_momentum() pattern. Idempotent.

create or replace function public.get_my_lift_prs(p_limit int default 12)
returns table (move text, best numeric, best_reps int, unit text, best_at timestamptz)
language sql
stable
security definer
set search_path = public
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
  order by load_lb desc
  limit greatest(1, least(coalesce(p_limit, 12), 100));
$$;

-- Default Postgres grants EXECUTE to PUBLIC; revoke it so only authenticated
-- callers (scoped to auth.uid() inside the function) can run it.
revoke execute on function public.get_my_lift_prs(int) from public;
grant execute on function public.get_my_lift_prs(int) to authenticated;
