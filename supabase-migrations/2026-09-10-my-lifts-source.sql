-- get_my_lifts, re-issued: read the load the member ACTUALLY lifted, the way
-- get_client_lifts already reads it (2026-09-10, the units wave — CodeRabbit round).
--
-- ⚠ THE TWO LIFT RPCs DISAGREED ABOUT WHICH FIELD IS THE LIFT, so a member and
-- their coach could be shown different bests for the same set. Not a rounding
-- difference — a different number off a different field:
--
--   `normalizeWorkoutSetLog` (shapeBackend.js) writes the ACTUAL load to the
--   `actual_load` COLUMN (from `actualLoad ?? actual_load ?? load`) and keeps
--   the whole raw entry in `payload`. `get_client_lifts` reads that column
--   first, then `payload.actualLoad`, `payload.load`, `payload.actual_load`,
--   and only then the prescription in `target_load`. `get_my_lifts` read
--   `payload.load` and `target_load` ONLY.
--
--   So for a set logged as `{actualLoad: 225}` against a prescribed `185 lb`,
--   the coach's case file said 225 and the member's own card said 185 — the
--   PRESCRIPTION, presented as what they lifted. And where there was no
--   `load` and no `target_load`, `raw_load` came back null and the set was
--   dropped by `where raw_load is not null`: the lift was missing from the
--   member's own key lifts while their coach could see it.
--
-- ⚠ AND THE UNIT WAS SNIFFED OFF A FIELD THE VALUE DID NOT COME FROM. The
-- applied 2026-09-10-lift-units.sql carries a comment claiming the unit rule
-- "MIRRORS `_setLogUnit` IN shapeBackend.js EXACTLY". It did not: `_setLogUnit`
-- sniffs `actualLoad ?? targetLoad`, and this sniffed `load ?? target_load`.
-- A set whose only load string is `"100 kg"` in `actualLoad` was filed as
-- POUNDS — which the pounds normalisation below then trusted, so the whole
-- point of that migration was defeated for exactly those rows.
--
-- Both hunks are now byte-identical to get_client_lifts (2026-09-10-coach-lift-units.sql),
-- which is the property that keeps the two answers the same.
--
-- ⚠ REGISTERED, NOT FIXED: `get_client_lifts` also filters `completed is
-- distinct from false` and this does not, so an abandoned set still counts
-- toward a member's own best. That is a different question — WHICH SETS COUNT,
-- not which field is the load — and changing it silently moves numbers members
-- already see. It wants an owner call, not a side effect of this one.
--
-- Generated from 2026-09-10-lift-units.sql by targeted replacement of those two
-- hunks; every payload key of the original is preserved by construction.
-- Idempotent: `create or replace`, grants re-issued.

create or replace function public.get_my_lifts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
           -- ⚠ THE UNIT RULE MIRRORS `_setLogUnit` IN shapeBackend.js EXACTLY:
           -- the explicit field wins (three spellings, as the client writes
           -- them) and only when there is none is the load STRING sniffed. The
           -- live logger stores the number in `load` and the unit in a separate
           -- field, so sniffing alone files every metric set as pounds.
           case
             when coalesce(sl.payload->>'unit', sl.payload->>'loadUnit', sl.payload->>'load_unit') is not null
               then case when lower(coalesce(sl.payload->>'unit', sl.payload->>'loadUnit', sl.payload->>'load_unit')) like '%kg%' then 'kg' else 'lb' end
             when lower(coalesce(sl.payload->>'actualLoad', sl.payload->>'load', sl.payload->>'actual_load', sl.target_load, '')) like '%kg%' then 'kg'
             else 'lb'
           end as unit,
           coalesce(
             case when sl.actual_load > 0 then sl.actual_load::numeric else null end,
             (regexp_match(coalesce(sl.payload->>'actualLoad', sl.payload->>'load', sl.payload->>'actual_load', sl.target_load, ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric
           ) as raw_load
    from public.workout_set_logs sl
    where sl.client_id = v_uid
      and sl.created_at >= now() - interval '90 days'
  ),
  norm as (
    -- ⚠ ONE UNIT BEFORE ANY COMPARISON. This function used to `max()` bare
    -- numbers across mixed units, so a member logging some sessions in
    -- kilograms and some in pounds had 100 (kg) lose to 200 (lb) and their
    -- "best" was the LIGHTER lift — 100 kg is 220 lb. It is not a display bug:
    -- `best` feeds the PR count and the strength discipline score below.
    select move_name,
           created_at,
           case when unit = 'kg' then raw_load / 0.45359237 else raw_load end as load
    from sets
    where raw_load is not null
  ),
  per_move as (
    select move_name,
           max(load) as best,
           max(load) filter (where created_at >= now() - interval '30 days') as best_recent,
           max(load) filter (where created_at <  now() - interval '30 days') as best_prior,
           count(*) as n
    from norm
    group by move_name
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', move_name,
        'best', round(best::numeric, 1),
        -- ⚠ THE UNIT TRAVELS WITH THE FIGURE. Dropping it is why
        -- /api/client/profile-stats emitted `[name, "245"]` and the coach app
        -- then labelled that unknown-unit number "kg" in its own copy — a guess
        -- presented as a fact. Every row here is pounds by construction (the
        -- app's canonical unit for a LIFT; body weight is the opposite, see the
        -- client_weigh_ins note of the same date), and saying so lets a reader
        -- convert to their own Settings instead of being told what it is.
        'unit', 'lb',
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
    'unit', 'lb',
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

revoke execute on function public.get_my_lifts() from public, anon;
grant execute on function public.get_my_lifts() to authenticated;
