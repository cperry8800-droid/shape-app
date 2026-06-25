-- Widen get_client_lifts to add an estimated 1-rep max (Epley) per key lift.
-- e1RM uses the real captured columns (actual_load / actual_reps), capped at 12
-- reps and special-cased at 1 rep, mirroring mobile-app/src/services/e1rm.mjs.
-- The existing best/delta/prs/avgRpe/workoutsLogged42d logic is unchanged.
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
  ) q
  where rpe is not null;

  with sets as (
    select sl.move_name,
           sl.created_at,
           (regexp_match(coalesce(sl.payload->>'load', sl.target_load, ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric as load,
           case
             when sl.actual_load is null or sl.actual_load <= 0 then null
             when sl.actual_reps is null or sl.actual_reps < 1 or sl.actual_reps > 12 then null
             when sl.actual_reps <= 1 then round(sl.actual_load::numeric, 1)
             else round((sl.actual_load * (1 + sl.actual_reps::numeric / 30))::numeric, 1)
           end as e1rm
    from public.workout_set_logs sl
    where sl.client_id = p_user_id
      and sl.created_at >= now() - interval '90 days'
  ),
  per_move as (
    select move_name,
           max(load) as best,
           max(e1rm) as best_e1rm,
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
