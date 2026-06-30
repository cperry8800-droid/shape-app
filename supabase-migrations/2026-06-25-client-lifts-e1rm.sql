-- Widen get_client_lifts to add an estimated 1-rep max (Epley) per key lift,
-- capped at 12 reps and special-cased at 1 rep, mirroring
-- mobile-app/src/services/e1rm.mjs.
--
-- The in-app live-session writer (normalizeWorkoutSetLog) stores the athlete's
-- ACTUAL load/reps inside the `payload` jsonb (actualLoad / actualReps) and does
-- NOT populate the actual_load/actual_reps columns, so `load` and the e1RM reps
-- read both — preferring the columns, then payload, then the prescription
-- (target) only for `load`. Incomplete sets are excluded (matching the TS engine).
-- e1RM is computed from ACTUAL reps only (no target fallback), so a set with no
-- logged reps yields no e1RM rather than a guess.
--
-- Gated on is_coach_on_client(uuid). Idempotent (create or replace).

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

  select count(*) into v_sessions
  from public.workout_sessions
  where client_id = p_user_id
    and status in ('completed', 'reviewed')
    and coalesce(ended_at, created_at) >= now() - interval '42 days';

  select round(avg(rpe)::numeric, 1) into v_rpe
  from (
    select (regexp_match(coalesce(sl.payload->>'rpe', ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric as rpe
    from public.workout_set_logs sl
    where sl.client_id = p_user_id
      and sl.created_at >= now() - interval '30 days'
      and sl.completed is distinct from false
  ) q
  where rpe is not null;

  with sets as (
    select sl.move_name,
           sl.created_at,
           -- best/delta load: actual column (>0; 0 = "not set"), then payload
           -- aliases (mirroring the API route), then the prescription.
           coalesce(
             case when sl.actual_load > 0 then sl.actual_load::numeric else null end,
             (regexp_match(coalesce(sl.payload->>'actualLoad', sl.payload->>'load', sl.payload->>'actual_load', sl.target_load, ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric
           ) as load,
           -- e1RM load: actuals ONLY (column >0, then payload aliases) — no prescription.
           coalesce(
             case when sl.actual_load > 0 then sl.actual_load::numeric else null end,
             (regexp_match(coalesce(sl.payload->>'actualLoad', sl.payload->>'load', sl.payload->>'actual_load', ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric
           ) as e1_load,
           -- e1RM reps: actual column (>0), then payload aliases (matches the route).
           coalesce(
             case when sl.actual_reps > 0 then sl.actual_reps else null end,
             (regexp_match(coalesce(sl.payload->>'actualReps', sl.payload->>'reps', sl.payload->>'actual_reps', ''), '([0-9]+)'))[1]::int
           ) as reps
    from public.workout_set_logs sl
    where sl.client_id = p_user_id
      and sl.created_at >= now() - interval '90 days'
      and sl.completed is distinct from false
  ),
  per_move as (
    select move_name,
           max(load) as best,
           max(
             case
               when e1_load is null or e1_load <= 0 then null
               when reps is null or reps < 1 or reps > 12 then null
               when reps <= 1 then round(e1_load, 1)
               else round((e1_load * (1 + reps::numeric / 30)), 1)
             end
           ) as best_e1rm,
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
        'e1rm', best_e1rm,
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
