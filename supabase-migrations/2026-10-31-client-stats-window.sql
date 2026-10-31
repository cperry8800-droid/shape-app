-- The coach's client stats count seven days as seven and thirty as thirty (the War Room's item from
-- #2532: "get_client_stats counts days logged from current_date - 7, eight dates").
--
-- THE BUG. get_client_stats (2026-10-11-dietary-kcal.sql) counted daysLogged7d from
-- current_date - 7: eight dates, and with no upper bound, so a row dated ahead of the UTC day
-- counted too. A client who logged every day read "8/7" on the website's roster and case file and
-- 114% in its adherence; the app holds the figure to seven since #2532. avgCalories and the
-- macros averaged the same eight dates, and daysLogged30d and workoutMinutes30d counted 31.
--
-- THE FIX. The same function with each window ending on the member's own today (shape_user_tz,
-- the member's zone; the UTC day with none known, as before) and holding exactly its days:
-- days logged, average intake and macros over the last 7 days, days logged and workout minutes
-- over the last 30. Everything else is unchanged: the coach gate (is_coach_on_client), calories
-- EATEN (dietary_kcal) as a logged day, the sessions' 42 days, the weight baseline, the recent
-- sessions and the keys returned.
--
-- create or replace keeps every grant (the allowlist's coach-gated entry: null unless
-- is_coach_on_client holds). One transaction, re-runnable, a guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

create or replace function public.get_client_stats(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := '{}'::jsonb;
  -- sessions (training attendance), last 42 days
  v_sess_done int;
  v_sess_planned int;
  v_min_30 int;
  -- nutrition snapshots, the last 7 / 30 days ending the member's today
  v_days7 int;
  v_days30 int;
  v_kcal numeric;
  v_protein numeric;
  v_carbs numeric;
  v_fat numeric;
  -- weight
  v_w_now numeric;
  v_w_start numeric;
  v_w_count int;
  v_recent jsonb;
  v_today date;
begin
  if not public.is_coach_on_client(p_user_id) then
    return null;
  end if;

  -- The member's own today: snapshot_date is the member's local day. With no zone known, the
  -- UTC day. Every day window below ends on it and holds exactly its number of days.
  v_today := coalesce((now() at time zone public.shape_user_tz(p_user_id))::date, current_date);

  -- Training attendance from the sessions calendar (last 42 days, up to now).
  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status in ('completed','confirmed','requested'))
  into v_sess_done, v_sess_planned
  from public.sessions
  where client_id = p_user_id
    and scheduled_at >= (now() - interval '42 days')
    and scheduled_at <= now();

  -- Workout minutes (the last 30 days) from the daily snapshot.
  select coalesce(sum(workout_minutes), 0)
  into v_min_30
  from public.daily_health_snapshot
  where user_id = p_user_id
    and snapshot_date between v_today - 29 and v_today;

  -- Nutrition adherence + macro averages from logged (calories EATEN present)
  -- days. `calories` is a device's burn and logs no meal.
  select count(*) filter (where snapshot_date between v_today - 6 and v_today),
         count(*) filter (where snapshot_date between v_today - 29 and v_today)
  into v_days7, v_days30
  from public.daily_health_snapshot
  where user_id = p_user_id and dietary_kcal is not null;

  select round(avg(dietary_kcal)), round(avg(protein_g)), round(avg(carbs_g)), round(avg(fat_g))
  into v_kcal, v_protein, v_carbs, v_fat
  from public.daily_health_snapshot
  where user_id = p_user_id
    and dietary_kcal is not null
    and snapshot_date between v_today - 6 and v_today;

  -- Weight from the dedicated weigh-in table (latest + ~8wk-ago baseline).
  select weight into v_w_now
  from public.client_weigh_ins where user_id = p_user_id
  order by logged_on desc limit 1;

  select weight into v_w_start
  from public.client_weigh_ins
  where user_id = p_user_id and logged_on >= current_date - 56
  order by logged_on asc limit 1;

  select count(*) into v_w_count from public.client_weigh_ins where user_id = p_user_id;

  -- Recent sessions (last 4, any status) for the activity list.
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_recent from (
    select jsonb_build_object(
      'title', coalesce(topic, type, 'Session'),
      'type', type,
      'status', status,
      'durationMin', duration_min,
      'at', scheduled_at
    ) r
    from public.sessions
    where client_id = p_user_id and scheduled_at <= now()
    order by scheduled_at desc
    limit 4
  ) sub;

  v := jsonb_build_object(
    'sessionsCompleted', v_sess_done,
    'sessionsPlanned', v_sess_planned,
    'workoutMinutes30d', v_min_30,
    'daysLogged7d', v_days7,
    'daysLogged30d', v_days30,
    'avgCalories', v_kcal,
    'avgProtein', v_protein,
    'avgCarbs', v_carbs,
    'avgFat', v_fat,
    'weightNow', v_w_now,
    'weightStart', v_w_start,
    'weighInCount', v_w_count,
    'recentSessions', v_recent
  );
  return v;
end;
$$;

-- ── Guard ──────────────────────────────────────────────────────────────────────
do $guard$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_client_stats' and p.prosecdef;
  if v_src is null then
    raise exception 'get_client_stats is missing or not security definer';
  end if;
  if v_src not like '%if not public.is_coach_on_client(p_user_id) then%' then
    raise exception 'get_client_stats lost its coach gate';
  end if;
  if v_src like '%current_date - 7%' or v_src like '%current_date - 30%'
     or v_src not like '%snapshot_date between v_today - 6 and v_today%' then
    raise exception 'get_client_stats still counts eight days as seven';
  end if;
end;
$guard$;

commit;
