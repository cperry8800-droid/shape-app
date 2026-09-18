-- Atomic, retry-safe workout completion. A client UUID identifies ONE session;
-- a successful retry returns the original immutable record. A failed attempt
-- rolls back the parent, sets, samples, and daily rollup together.
-- Requires workout-session-logs, coach-program-tools, and session-rpe migrations.
alter table public.workout_set_logs alter column set_duration_seconds drop not null;
alter table public.workout_set_logs alter column set_duration_seconds drop default;
comment on column public.workout_set_logs.set_duration_seconds is
  'Measured duration for a timed set. NULL for Quick Log; never inferred from time between taps.';

create or replace function public.save_workout_session(
  p_session jsonb, p_sets jsonb default '[]'::jsonb, p_samples jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := (p_session->>'id')::uuid;
  v_workout uuid := nullif(p_session->>'client_workout_id', '')::uuid;
  v_trainer bigint;
  v_inserted uuid;
  v_session public.workout_sessions;
  v_set jsonb;
  v_sample jsonb;
  v_day date;
  v_minutes integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_id is null then raise exception 'Session id is required'; end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) > 1000 then raise exception 'Invalid sets'; end if;
  if jsonb_typeof(p_samples) <> 'array' or jsonb_array_length(p_samples) > 5000 then raise exception 'Invalid samples'; end if;
  if octet_length(p_session::text) > 1048576 then raise exception 'Session is too large'; end if;

  -- The caller cannot attach a log to somebody else's prescription. Retired
  -- assignments remain valid references: the session carries its own snapshot.
  if v_workout is not null then
    -- Serialize with assignment publishing. A publisher locks these same rows
    -- before checking for recorded work, so it cannot replace a prescription
    -- between this ownership check and the completed session insert.
    select trainer_id into v_trainer from public.client_workouts where id = v_workout and client_id = v_uid for update;
    if not found then raise exception 'Workout does not belong to this account'; end if;
  end if;
  insert into public.workout_sessions
    (id, client_id, client_workout_id, provider_id, provider_role, title, activity_type,
     status, privacy, source, started_at, ended_at, duration_seconds, session_rpe, summary)
  values
    (v_id, v_uid, v_workout, v_trainer, case when v_trainer is not null then 'trainer' else null end,
     left(coalesce(nullif(p_session->>'title',''), 'Workout session'), 240),
     left(coalesce(nullif(p_session->>'activity_type',''), 'workout'), 80),
     'completed', 'private', 'shape_app',
     (p_session->>'started_at')::timestamptz, (p_session->>'ended_at')::timestamptz,
     greatest(0, (p_session->>'duration_seconds')::integer), (p_session->>'session_rpe')::numeric,
     coalesce(p_session->'summary', '{}'::jsonb))
  on conflict (id) do nothing returning id into v_inserted;

  select * into v_session from public.workout_sessions where id = v_id and client_id = v_uid;
  if not found then raise exception 'Session does not belong to this account'; end if;
  -- A concurrent duplicate INSERT waits for the first transaction, then reaches
  -- this branch with all its children visible. No partially saved success.
  if v_inserted is not null then
    for v_set in select value from jsonb_array_elements(p_sets) loop
      insert into public.workout_set_logs
        (session_id, client_id, move_index, move_name, set_number, target_reps, target_load,
         actual_reps, actual_load, load_unit, rpe, started_at, finished_at,
         set_duration_seconds, rest_before_seconds, completed, payload)
      values
        (v_id, v_uid, (v_set->>'move_index')::integer, left(coalesce(nullif(v_set->>'move_name',''), 'Exercise'), 240),
         (v_set->>'set_number')::integer, v_set->>'target_reps', v_set->>'target_load',
         (v_set->>'actual_reps')::integer, (v_set->>'actual_load')::numeric,
         case when v_set->>'load_unit' = 'kg' then 'kg' else 'lb' end, (v_set->>'rpe')::numeric,
         (v_set->>'started_at')::timestamptz, (v_set->>'finished_at')::timestamptz,
         (v_set->>'set_duration_seconds')::integer, (v_set->>'rest_before_seconds')::integer,
         coalesce((v_set->>'completed')::boolean, true), coalesce(v_set->'payload','{}'::jsonb));
    end loop;
    for v_sample in select value from jsonb_array_elements(p_samples) loop
      insert into public.workout_sensor_samples
        (session_id, client_id, provider, sample_type, sampled_at, value, unit, payload)
      values
        (v_id, v_uid, v_sample->>'provider', v_sample->>'sample_type',
         (v_sample->>'sampled_at')::timestamptz, (v_sample->>'value')::numeric,
         v_sample->>'unit', coalesce(v_sample->'payload','{}'::jsonb));
    end loop;
    -- Increment once, under the same transaction. Unknown/zero duration does not
    -- become an invented one-minute workout. Existing device minutes survive.
    -- Use the member's local workout day, captured at completion; UTC date
    -- would put an evening workout on tomorrow's progress chart west of UTC.
    v_day := coalesce(nullif(v_session.summary->>'snapshotDate', '')::date, coalesce(v_session.ended_at, now())::date);
    v_minutes := greatest(0, round(v_session.duration_seconds / 60.0)::integer);
    if v_minutes > 0 then
      insert into public.daily_health_snapshot(user_id, snapshot_date, workout_minutes)
      values (v_uid, v_day, v_minutes)
      on conflict (user_id, snapshot_date) do update
        set workout_minutes = coalesce(daily_health_snapshot.workout_minutes, 0) + excluded.workout_minutes;
    end if;
  end if;
  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'set_logs', coalesce((select jsonb_agg(to_jsonb(s) order by s.move_index, s.set_number) from public.workout_set_logs s where s.session_id = v_id and s.client_id = v_uid),'[]'::jsonb),
    'sensor_samples', coalesce((select jsonb_agg(to_jsonb(s)) from public.workout_sensor_samples s where s.session_id = v_id and s.client_id = v_uid),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.save_workout_session(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_workout_session(jsonb,jsonb,jsonb) to authenticated;
