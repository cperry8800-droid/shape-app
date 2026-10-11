-- Calories eaten get their own column (owner, 2026-10-11: "Separate calories
-- eaten from calories burned").
--
-- daily_health_snapshot.calories has meant two things. Meal logs ADD to it
-- (add_meal_macros, and through it the app's logger and Nora's log_meal),
-- while the device syncs (Garmin dailies, Oura and Apple Health, through
-- upsertSnapshot in src/lib/health-snapshot.ts, and set_metric_source when a
-- member picks a source) OVERWRITE it with active kilocalories and tag
-- sources.calories. So a member with a watch saw their burn as food, or their
-- food erased by the next sync, depending on which wrote last; and a watch's
-- burn alone earned the day's "meal logged" points.
--
-- From this file on:
--   · dietary_kcal  = calories EATEN. Only meal logs write it.
--   · calories      = calories BURNED. Only device syncs write it.
--
-- The backfill, in order:
--   1. A row no device wrote (no sources.calories tag) holds meal calories:
--      they move to dietary_kcal, and calories is cleared.
--   2. A device row a meal was logged onto after the sync holds the burn PLUS
--      the meal. upsertSnapshot keeps each device's own reading in
--      health_metric_observations, so the meal is the excess over the reading
--      of the source that tagged the row, and the burn goes back to it.
--   3. Any other device row with logged macros gets the energy in them (4 kcal
--      per gram of protein and carbs, 9 per gram of fat): a later sync
--      overwrote that day's meal calories, which cannot be recovered.
--
-- add_meal_macros keeps its signature, its grants and its guards; it writes
-- dietary_kcal instead of calories, and its NaN guard now works (see the body).
--
-- Four functions read `calories` as calories eaten; each is redefined from its
-- live body with that one predicate changed, keeping its signature, its grants
-- (create or replace keeps them) and its pin:
--   · award_meal_log   — a meal counts by calories eaten (or macros), so a
--                        watch's burn alone no longer earns "Meal logged";
--   · get_client_stats — the coach's days logged and average intake;
--   · compute_momentum — a day is active on calories eaten OR burned (both
--                        counted before, through the one column);
--   · get_funnel       — the first-nutrition step.
--
-- Re-runnable: add column if not exists; the backfill only touches rows whose
-- dietary_kcal is still null; create or replace; a guard at the end.
--
-- ⚠ RUN THIS BEFORE THE APP CODE DEPLOYS. The readers select dietary_kcal,
-- and PostgREST refuses a select naming a column that does not exist.

begin;

alter table public.daily_health_snapshot
  add column if not exists dietary_kcal integer
  check (dietary_kcal is null or dietary_kcal >= 0);

-- Meal-log rows: no device wrote their calories, so they are calories eaten.
update public.daily_health_snapshot
   set dietary_kcal = calories,
       calories = null
 where dietary_kcal is null
   and calories is not null
   and not (coalesce(sources, '{}'::jsonb) ? 'calories');

-- Device rows with a meal logged after the sync: the excess over the device's
-- own reading is the meal, and the burn goes back to the reading.
update public.daily_health_snapshot d
   set dietary_kcal = d.calories - round(o.value)::integer,
       calories     = round(o.value)::integer
  from public.health_metric_observations o
 where d.dietary_kcal is null
   and (coalesce(d.sources, '{}'::jsonb) ? 'calories')
   and o.user_id = d.user_id
   and o.snapshot_date = d.snapshot_date
   and o.metric = 'calories'
   and o.source = d.sources->>'calories'
   and d.calories > round(o.value);

-- Other device rows with logged macros: the energy in the macros.
update public.daily_health_snapshot
   set dietary_kcal = round(4 * coalesce(protein_g, 0) + 4 * coalesce(carbs_g, 0) + 9 * coalesce(fat_g, 0))::integer
 where dietary_kcal is null
   and (coalesce(sources, '{}'::jsonb) ? 'calories')
   and coalesce(protein_g, carbs_g, fat_g) is not null
   and 4 * coalesce(protein_g, 0) + 4 * coalesce(carbs_g, 0) + 9 * coalesce(fat_g, 0) > 0;

-- ── Meal-log macro accumulate (NULL field = leave unchanged) ──
create or replace function public.add_meal_macros(
  p_kcal numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_hydration numeric, p_date date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- DB-boundary validation: this RPC is executable by `authenticated`, so a direct
  -- caller bypasses the API's asNum guard. Clamp every supplied macro to >= 0 (a NULL
  -- field stays "unchanged") and drop NaN and Infinity, so a direct caller can't
  -- decrement / poison their snapshot via the conflict-update path below.
  -- ⚠ A numeric NaN EQUALS ITSELF in Postgres, so the `x <> x` test this function
  -- used never caught one (measured on 16: 'NaN' set protein_g to NaN). Compare
  -- against the value instead.
  p_kcal      := case when p_kcal      is null or p_kcal      in ('NaN', 'Infinity') then null else greatest(0, p_kcal)      end;
  p_protein   := case when p_protein   is null or p_protein   in ('NaN', 'Infinity') then null else greatest(0, p_protein)   end;
  p_carbs     := case when p_carbs     is null or p_carbs     in ('NaN', 'Infinity') then null else greatest(0, p_carbs)     end;
  p_fat       := case when p_fat       is null or p_fat       in ('NaN', 'Infinity') then null else greatest(0, p_fat)       end;
  p_hydration := case when p_hydration is null or p_hydration in ('NaN', 'Infinity') then null else greatest(0, round(p_hydration, 3)) end;

  -- Calories eaten go to dietary_kcal; `calories` is a device's burn and a
  -- meal log never touches it.
  insert into public.daily_health_snapshot as d
      (user_id, snapshot_date, dietary_kcal, protein_g, carbs_g, fat_g, hydration_l)
    values (
      v_uid, p_date,
      p_kcal,
      p_protein,
      p_carbs,
      p_fat,
      p_hydration
    )
  on conflict (user_id, snapshot_date) do update set
    dietary_kcal = case when p_kcal      is null then d.dietary_kcal else coalesce(d.dietary_kcal, 0) + p_kcal      end,
    protein_g    = case when p_protein   is null then d.protein_g    else coalesce(d.protein_g, 0)    + p_protein   end,
    carbs_g      = case when p_carbs     is null then d.carbs_g      else coalesce(d.carbs_g, 0)      + p_carbs     end,
    fat_g        = case when p_fat       is null then d.fat_g        else coalesce(d.fat_g, 0)        + p_fat       end,
    hydration_l  = case when p_hydration is null then d.hydration_l  else greatest(0, round(coalesce(d.hydration_l, 0) + p_hydration, 3)) end,
    updated_at   = now();
end;
$$;

-- The grants as 2026-06-29-atomic-daily-snapshot-accumulators.sql set them.
revoke all on function public.add_meal_macros(numeric, numeric, numeric, numeric, numeric, date) from public;
grant execute on function public.add_meal_macros(numeric, numeric, numeric, numeric, numeric, date) to authenticated;

-- ── The readers of calories eaten ──

-- Points for logging a meal: the day must carry a real meal (calories eaten or
-- food macros; hydration alone, or a device's burn, does not count).
create or replace function public.award_meal_log(p_day date default null::date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := coalesce(p_day, current_date);
  v_tz  text := public.shape_user_tz(auth.uid());
  v_ins integer;
begin
  if v_uid is null then return jsonb_build_object('awarded', false); end if;
  -- Only the caller's OWN calendar day earns (Codex P1 farm fix) — same rule as
  -- award_workout_session. Their zone when known; ±1 UTC until it's captured.
  if v_tz is not null then
    if v_day <> (now() at time zone v_tz)::date then
      return jsonb_build_object('awarded', false, 'reason', 'not_today');
    end if;
  elsif v_day < current_date - 1 or v_day > current_date + 1 then
    return jsonb_build_object('awarded', false, 'reason', 'stale_day');
  end if;
  -- Gate on a REAL nutrition log that day (calories eaten or food macros;
  -- hydration alone doesn't count, and neither does a device's burn in `calories`).
  if not exists (
    select 1 from public.daily_health_snapshot d
    where d.user_id = v_uid and d.snapshot_date = v_day
      and (coalesce(d.dietary_kcal, 0) > 0 or coalesce(d.protein_g, 0) > 0
        or coalesce(d.carbs_g, 0) > 0 or coalesce(d.fat_g, 0) > 0)
  ) then return jsonb_build_object('awarded', false, 'reason', 'no_meal'); end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'nutrition', 'meal_log',
            md5('meal_log:' || v_uid::text || ':' || v_day::text)::uuid, 10, 'Meal logged')
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null
      do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('awarded', v_ins > 0, 'points', case when v_ins > 0 then 10 else 0 end);
end $$;

-- Momentum: a day is active on anything logged or synced, calories eaten and
-- calories burned alike (both reached this through the one column before).
create or replace function public.compute_momentum()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_m   integer := 0;
  r     record;
begin
  if v_uid is null then return 0; end if;
  -- The window is UTC-calendar-day-based (current_date / generate_series resolve in
  -- the DB session tz = UTC on Supabase), matching the route's composite block. The
  -- day-scoped WRITERS bucket on the user's LOCAL day, so a boundary day near local
  -- midnight can read one notch off — this can only UNDERCOUNT (never farm: it can't
  -- exceed +25/week, double-credit, or invent activity), and a single check-in marks
  -- its whole Mon..Sun week active, masking most edge cases. Known + accepted.
  for r in
    select
      (
        exists (
          select 1 from public.daily_health_snapshot s
          where s.user_id = v_uid
            and s.snapshot_date = g.d::date
            and (s.dietary_kcal > 0 or s.calories > 0 or s.workout_minutes > 0 or s.sleep_hours > 0)
        )
        or exists (
          select 1 from public.user_habit_completions hc
          where hc.user_id = v_uid and hc.done_on = g.d::date
        )
        or exists (
          select 1 from public.client_checkins c
          where c.user_id = v_uid
            and c.week_of <= g.d::date and g.d::date < c.week_of + 7
        )
      ) as active
    from generate_series(current_date - 29, current_date, interval '1 day') as g(d)
    order by g.d   -- oldest → newest
  loop
    v_m := greatest(0, least(100, v_m + case when r.active then 7 else -12 end));
  end loop;
  return v_m;
end $$;

-- The coach's view of a client: days logged and average intake are calories
-- EATEN.
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

  -- Nutrition adherence + macro averages from logged (calories EATEN present)
  -- days. `calories` is a device's burn and logs no meal.
  select count(*) filter (where snapshot_date >= current_date - 7),
         count(*) filter (where snapshot_date >= current_date - 30)
  into v_days7, v_days30
  from public.daily_health_snapshot
  where user_id = p_user_id and dietary_kcal is not null;

  select round(avg(dietary_kcal)), round(avg(protein_g)), round(avg(carbs_g)), round(avg(fat_g))
  into v_kcal, v_protein, v_carbs, v_fat
  from public.daily_health_snapshot
  where user_id = p_user_id
    and dietary_kcal is not null
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

-- The admin funnel: the first-nutrition step is a meal logged (calories eaten
-- or protein), never a device sync.
create or replace function public.get_funnel(p_from timestamp with time zone, p_to timestamp with time zone)
returns table(step text, count bigint)
language sql
security definer
set search_path = public, pg_temp
as $$
  with cohort as (
    select pr.id as uid, pr.created_at
    from public.profiles pr
    where pr.role = 'client'
      and pr.created_at >= p_from and pr.created_at < p_to
  )
  select 'signup'::text, count(*)::bigint from cohort
  union all
  select 'onboarding', count(*)::bigint from cohort c
    where exists (select 1 from public.user_goals g
                  where g.user_id = c.uid and g.kind = 'client_onboarding'
                    and coalesce((g.data->>'intentSeen')::boolean, false))
  union all
  select 'first_workout', count(*)::bigint from cohort c
    where exists (select 1 from public.workout_sessions w where w.client_id = c.uid)
  union all
  select 'first_nutrition', count(*)::bigint from cohort c
    where exists (select 1 from public.daily_health_snapshot d
                  where d.user_id = c.uid and (d.dietary_kcal is not null or d.protein_g is not null))
  union all
  select 'paid', count(*)::bigint from cohort c
    where exists (select 1 from public.platform_subscriptions s
                  where s.client_id = c.uid and s.status in ('active','trialing','past_due'))
  union all
  select 'day30', count(*)::bigint from cohort c
    where c.created_at < now() - interval '30 days'
      and (
        exists (select 1 from public.workout_sessions w
                where w.client_id = c.uid and w.created_at >= c.created_at + interval '30 days')
        or exists (select 1 from public.daily_health_snapshot d
                where d.user_id = c.uid and d.snapshot_date >= (c.created_at + interval '30 days')::date)
      )
  union all
  select 'day90', count(*)::bigint from cohort c
    where c.created_at < now() - interval '90 days'
      and (
        exists (select 1 from public.workout_sessions w
                where w.client_id = c.uid and w.created_at >= c.created_at + interval '90 days')
        or exists (select 1 from public.daily_health_snapshot d
                where d.user_id = c.uid and d.snapshot_date >= (c.created_at + interval '90 days')::date)
      );
$$;

-- Guard: the column exists; add_meal_macros writes it and the four readers read
-- it, each still a pinned definer; a signed-in member can log; and no meal-log row
-- is left in `calories`.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'daily_health_snapshot' and column_name = 'dietary_kcal'
  ) then
    raise exception 'daily_health_snapshot.dietary_kcal is missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'add_meal_macros'
       and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%'
       and p.prosrc like '%dietary_kcal = case when p_kcal%'
  ) then
    raise exception 'add_meal_macros is not the pinned definer that writes dietary_kcal';
  end if;
  if (
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('award_meal_log', 'compute_momentum', 'get_client_stats', 'get_funnel')
       and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%'
       and p.prosrc like '%dietary_kcal%'
  ) <> 4 then
    raise exception 'a reader of calories eaten is not the pinned definer that reads dietary_kcal';
  end if;
  if not has_function_privilege('authenticated', 'public.add_meal_macros(numeric, numeric, numeric, numeric, numeric, date)', 'execute') then
    raise exception 'add_meal_macros is not executable by authenticated';
  end if;
  if exists (
    select 1 from public.daily_health_snapshot
     where calories is not null and dietary_kcal is null
       and not (coalesce(sources, '{}'::jsonb) ? 'calories')
  ) then
    raise exception 'a meal-log row still holds its calories in daily_health_snapshot.calories';
  end if;
end $$;

commit;
