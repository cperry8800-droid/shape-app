-- Self-readable profile stats: key lifts + disciplines for the signed-in
-- client's OWN living profile. get_client_lifts() is coach-gated
-- (is_coach_on_client); this is the self-scoped twin (auth.uid(), no gate) so a
-- member's website/app profile can show real PRs + discipline bars instead of
-- the demo persona. SECURITY DEFINER because workout_set_logs / sessions are
-- self-RLS'd and we only ever read the caller's own rows.

create or replace function public.get_my_lifts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lifts jsonb;
  v_rpe numeric;
  v_sessions42 int;   -- completed sessions, 42d (workoutsLogged)
  v_sessions28 int;   -- completed sessions, 28d (consistency)
  v_sets7 int;        -- sets logged, 7d (endurance)
  v_sleep numeric;    -- avg sleep hours, 14d (recovery)
  v_nlifts int;
  v_prs int;
  v_strength numeric;
  v_consistency numeric;
  v_endurance numeric;
  v_recovery numeric;
begin
  if v_uid is null then return null; end if;

  select count(*) into v_sessions42
  from public.workout_sessions
  where client_id = v_uid and status in ('completed','reviewed')
    and coalesce(ended_at, created_at) >= now() - interval '42 days';

  select count(*) into v_sessions28
  from public.workout_sessions
  where client_id = v_uid and status in ('completed','reviewed')
    and coalesce(ended_at, created_at) >= now() - interval '28 days';

  select count(*) into v_sets7
  from public.workout_set_logs
  where client_id = v_uid and created_at >= now() - interval '7 days';

  select round(avg(rpe)::numeric, 1) into v_rpe
  from (
    select (regexp_match(coalesce(sl.payload->>'rpe', ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric as rpe
    from public.workout_set_logs sl
    where sl.client_id = v_uid and sl.created_at >= now() - interval '30 days'
  ) q
  where rpe is not null;

  -- Avg sleep hours (14d) — guarded so a missing table/column degrades to null
  -- (recovery just falls back to the demo bar on the client).
  begin
    select round(avg(sleep_hours)::numeric, 1) into v_sleep
    from public.daily_health_snapshot
    where user_id = v_uid
      and snapshot_date >= (now() - interval '14 days')::date
      and sleep_hours is not null;
  exception when others then v_sleep := null;
  end;

  -- Key lifts: best parsed load per move (90d) + recent-vs-prior delta.
  with sets as (
    select sl.move_name,
           sl.created_at,
           (regexp_match(coalesce(sl.payload->>'load', sl.target_load, ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric as load
    from public.workout_set_logs sl
    where sl.client_id = v_uid
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
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', move_name,
        'best', best,
        'delta', case when best_prior is not null and best_recent is not null
                      then round((best_recent - best_prior)::numeric, 1) else null end
      ) order by n desc, best desc nulls last)
      from (select * from per_move order by n desc, best desc nulls last limit 5) tp
    ), '[]'::jsonb),
    (select count(*) from per_move where best_recent is not null and best_prior is not null and best_recent > best_prior),
    (select count(*) from per_move)
  into v_lifts, v_prs, v_nlifts;

  -- Disciplines (0..1), data-driven; null when there's no signal yet.
  v_consistency := case when v_sessions28 > 0 then least(1.0, round((v_sessions28 / 16.0)::numeric, 2)) else null end;
  v_endurance   := case when v_sets7 > 0 then least(1.0, round((v_sets7 / 50.0)::numeric, 2)) else null end;
  v_strength    := case when v_nlifts > 0 then least(1.0, round((0.45 + 0.55 * (v_prs::numeric / v_nlifts))::numeric, 2)) else null end;
  v_recovery    := case when v_sleep is not null then least(1.0, round((v_sleep / 8.0)::numeric, 2)) else null end;

  return jsonb_build_object(
    'keyLifts', v_lifts,
    'prs', v_prs,
    'avgRpe', v_rpe,
    'workoutsLogged42d', v_sessions42,
    'disciplines', jsonb_build_object(
      'strength', v_strength,
      'endurance', v_endurance,
      'consistency', v_consistency,
      'recovery', v_recovery
    )
  );
end;
$$;

grant execute on function public.get_my_lifts() to authenticated;
