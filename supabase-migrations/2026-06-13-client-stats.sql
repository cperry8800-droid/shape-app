-- Coach-facing per-client stats rollup for the client-profile dashboard.
--
-- Aggregates the data a coach is already allowed to read for a linked client
-- (RLS: providers_read_subscriber_snapshots, the sessions policy, and
-- client_weigh_ins) into a single share-gated SECURITY DEFINER call so the
-- mobile coach app can render live KPIs instead of demo numbers. Falls back to
-- nothing (null fields) when there's no data — the client renders demo values
-- for any field that comes back null.
--
-- Gated on is_coach_on_client(uuid) from 2026-05-26-shared-clients.sql. Idempotent.

create or replace function public.get_client_stats(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  -- sessions (training attendance), last 42 days
  v_sess_done int;
  v_sess_planned int;
  v_min_30 int;
  -- nutrition snapshots, last 7 / 30 days
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
begin
  if not public.is_coach_on_client(p_user_id) then
    return null;
  end if;

  -- Training attendance from the sessions calendar (last 42 days, up to now).
  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status in ('completed','confirmed','requested'))
  into v_sess_done, v_sess_planned
  from public.sessions
  where client_id = p_user_id
    and scheduled_at >= (now() - interval '42 days')
    and scheduled_at <= now();

  -- Workout minutes (last 30 days) from the daily snapshot.
  select coalesce(sum(workout_minutes), 0)
  into v_min_30
  from public.daily_health_snapshot
  where user_id = p_user_id
    and snapshot_date >= (current_date - 30);

  -- Nutrition adherence + macro averages from logged (calories present) days.
  select count(*) filter (where snapshot_date >= current_date - 7),
         count(*) filter (where snapshot_date >= current_date - 30)
  into v_days7, v_days30
  from public.daily_health_snapshot
  where user_id = p_user_id and calories is not null;

  select round(avg(calories)), round(avg(protein_g)), round(avg(carbs_g)), round(avg(fat_g))
  into v_kcal, v_protein, v_carbs, v_fat
  from public.daily_health_snapshot
  where user_id = p_user_id
    and calories is not null
    and snapshot_date >= current_date - 7;

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

grant execute on function public.get_client_stats(uuid) to authenticated;
