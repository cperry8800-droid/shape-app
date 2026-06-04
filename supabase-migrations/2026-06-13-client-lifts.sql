-- Coach-facing strength rollup for the client-profile dashboard: key lifts,
-- PR count, avg RPE, and logged-workout count, derived from workout_set_logs /
-- workout_sessions. Loads/reps are stored as free text (e.g. "82.5 kg"), and
-- RPE — when captured — rides in the set payload, so this parses leading
-- numbers best-effort. Null fields when there's nothing to read; the UI falls
-- back to demo values per field.
--
-- Gated on is_coach_on_client(uuid). Idempotent.

create or replace function public.get_client_lifts(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_combined jsonb;
  v_rpe numeric;
  v_sessions int;
begin
  if not public.is_coach_on_client(p_user_id) then
    return null;
  end if;

  -- Logged (completed) workouts in the last 42 days.
  select count(*) into v_sessions
  from public.workout_sessions
  where client_id = p_user_id
    and status in ('completed', 'reviewed')
    and coalesce(ended_at, created_at) >= now() - interval '42 days';

  -- Average RPE from set payloads (last 30 days), if present.
  select round(avg(rpe)::numeric, 1) into v_rpe
  from (
    select (regexp_match(coalesce(sl.payload->>'rpe', ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric as rpe
    from public.workout_set_logs sl
    where sl.client_id = p_user_id
      and sl.created_at >= now() - interval '30 days'
  ) q
  where rpe is not null;

  -- Key lifts + PR count: best parsed load per move (last 90 days), with a
  -- recent-vs-prior delta (last 30 days vs the 30–90 day window).
  with sets as (
    select sl.move_name,
           sl.created_at,
           (regexp_match(coalesce(sl.payload->>'load', sl.target_load, ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric as load
    from public.workout_set_logs sl
    where sl.client_id = p_user_id
      and sl.created_at >= now() - interval '90 days'
  ),
  per_move as (
    select move_name,
           max(load) as best,
           max(load) filter (where created_at >= now() - interval '30 days') as best_recent,
           max(load) filter (where created_at <  now() - interval '30 days') as best_prior,
           count(*) as n
    from sets
    where load is not null
    group by move_name
  )
  select jsonb_build_object(
    'keyLifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', move_name,
        'best', best,
        'delta', case when best_prior is not null and best_recent is not null
                      then round((best_recent - best_prior)::numeric, 1) else null end
      ) order by n desc, best desc nulls last)
      from (select * from per_move order by n desc, best desc nulls last limit 5) tp
    ), '[]'::jsonb),
    'prs', (
      select count(*) from per_move
      where best_recent is not null and best_prior is not null and best_recent > best_prior
    )
  ) into v_combined;

  return v_combined || jsonb_build_object('avgRpe', v_rpe, 'workoutsLogged42d', v_sessions);
end;
$$;

grant execute on function public.get_client_lifts(uuid) to authenticated;
