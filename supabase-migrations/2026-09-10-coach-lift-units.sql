-- get_client_lifts, re-issued: normalise every set to POUNDS before comparing,
-- and carry the unit out (2026-09-10, the units wave).
--
-- The coach-gated twin of get_my_lifts, with the same two defects and the same
-- fix. This is the WHOLE 2026-06-25 function re-stated, because a replace that
-- kept only the lifts CTE would have dropped avgRpe, the PR count and the rest
-- of the payload. Everything not marked below is byte-identical to the original.
--
--   1. `sets` resolves each row's unit and a new `norm` CTE converts BOTH the
--      load and the e1RM load to pounds, so nothing compares across units;
--   2. every lift row states `unit`;
--   3. anon is revoked BY NAME and search_path pins pg_temp.
--
-- Idempotent: CREATE OR REPLACE + guarded grants.

create or replace function public.get_client_lifts(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
           ) as reps,
           -- ⚠ THE UNIT, RESOLVED THE WAY `_setLogUnit` RESOLVES IT: the explicit
           -- field wins (three spellings, as the client writes them) and only
           -- when there is none is the load STRING sniffed. The live logger puts
           -- the number in `load` and the unit in a separate field, so sniffing
           -- alone files every metric set as pounds.
           case
             when coalesce(sl.payload->>'unit', sl.payload->>'loadUnit', sl.payload->>'load_unit') is not null
               then case when lower(coalesce(sl.payload->>'unit', sl.payload->>'loadUnit', sl.payload->>'load_unit')) like '%kg%' then 'kg' else 'lb' end
             when lower(coalesce(sl.payload->>'actualLoad', sl.payload->>'load', sl.payload->>'actual_load', sl.target_load, '')) like '%kg%' then 'kg'
             else 'lb'
           end as unit
    from public.workout_set_logs sl
    where sl.client_id = p_user_id
      and sl.created_at >= now() - interval '90 days'
      and sl.completed is distinct from false
  ),
  norm as (
    -- ⚠ ONE UNIT BEFORE ANY COMPARISON. `max(load)` used to run over bare
    -- numbers from mixed units, so a client logging some sessions in kilograms
    -- and some in pounds had 100 (kg) lose to 200 (lb) and their coach was shown
    -- the LIGHTER lift as their best — 100 kg is 220 lb. The estimated 1RM was
    -- computed on the same mixed numbers.
    select move_name, created_at, reps,
           case when unit = 'kg' then load / 0.45359237 else load end as load,
           case when unit = 'kg' then e1_load / 0.45359237 else e1_load end as e1_load
    from sets
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
    from norm
    where load is not null
    group by move_name
  )
  select jsonb_build_object(
    'keyLifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', move_name,
        'best', round(best::numeric, 1),
        -- ⚠ THE UNIT TRAVELS WITH THE FIGURE. Without it the coach app labelled
        -- an unknown-unit number "kg" in its own copy — a guess presented as a
        -- fact. Pounds by construction; saying so lets the reader convert.
        'unit', 'lb',
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

revoke execute on function public.get_client_lifts(uuid) from public, anon;
grant execute on function public.get_client_lifts(uuid) to authenticated;
