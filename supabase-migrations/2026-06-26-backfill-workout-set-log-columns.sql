-- Backfill workout_set_logs.actual_load / actual_reps / rpe / load_unit columns.
--
-- The in-app live-session writer historically stored the athlete's actual
-- load/reps inside the `payload` jsonb only (actualLoad / actualReps), never the
-- actual_load / actual_reps / rpe / load_unit COLUMNS that the train-volume +
-- strength/progress readers read. The app now populates the columns at write time
-- (normalizeWorkoutSetLog); this fills the columns for existing rows from their
-- payload so historical training volume + e1RM read correctly.
--
-- Idempotent + safe:
--   * Only touches rows the OLD writer left fully blank (both numeric columns NULL).
--   * Parses the LEADING number from free text ("230 lb" -> 230, "3-5" -> 3),
--     matching the app's parseFloat() behavior; non-numeric ("bodyweight", "%BW")
--     stays NULL — honest, never a fabricated 0.
--   * load_unit is NOT NULL (default 'lb'); only upgraded to 'kg' when detected,
--     never set to NULL.
--   * Re-runnable: rows already populated by the new writer are skipped.

update public.workout_set_logs s set
  actual_load = (
    nullif(substring(coalesce(s.payload->>'actualLoad', s.payload->>'load', '')
                     from '([0-9]+(?:\.[0-9]+)?)'), '')
  )::numeric(10,2),
  actual_reps = (
    nullif(substring(coalesce(s.payload->>'actualReps', s.payload->>'reps', '')
                     from '([0-9]+)'), '')
  )::integer,
  -- A CASE (not greatest/least over the parsed value): greatest(0, NULL) returns 0
  -- in Postgres, which would FABRICATE rpe=0 for every row with no parseable RPE
  -- (and historical payloads carry no rpe at all). Keep NULL when unparseable.
  rpe = case
    when nullif(substring(coalesce(s.payload->>'rpe', '') from '([0-9]+(?:\.[0-9]+)?)'), '') is null then null
    else least(10, greatest(0, (substring(coalesce(s.payload->>'rpe', '') from '([0-9]+(?:\.[0-9]+)?)'))::numeric(3,1)))
  end,
  load_unit = case
    when lower(coalesce(s.payload->>'unit', s.payload->>'loadUnit', '')) like '%kg%' then 'kg'
    when lower(coalesce(s.payload->>'actualLoad', s.payload->>'targetLoad', '')) like '%kg%' then 'kg'
    else s.load_unit
  end
where s.actual_load is null and s.actual_reps is null;
