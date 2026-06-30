-- Adds the TRAINING dimension to the coach roster weekday-vs-weekend split
-- (fast-follow to 2026-06-27-roster-weekend-split.sql). Same SECURITY DEFINER
-- shape + owner gate; this `create or replace` just adds a third dimension to
-- the union. Idempotent, safe to re-run.
--
-- Depends on client_workouts.scheduled_date (added 2026-06-01-client-plans.sql)
-- and workout_sessions (status, started_at). Apply order vs the route doesn't
-- matter: the /api/coach/roster-weekend route only ever reads back rows, so a
-- DB without the training rows simply yields no training dimension.
create or replace function public.get_roster_weekend_split(p_client_ids uuid[])
returns table (
  client_id uuid,
  dimension text,        -- 'nutrition' | 'habits' | 'training'
  week_start date,
  weekday_num numeric,
  weekday_den numeric,
  weekend_num numeric,
  weekend_den numeric
)
language sql
security definer
set search_path = public
as $$
  with allowed as (
    select cid as client_id
    from unnest(p_client_ids) as cid
    where exists (
      select 1 from public.subscriptions s
      left join public.trainers t on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = cid
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  ),
  -- Only clients with a CAPTURED timezone — never fabricate a UTC bucketing
  -- choice for a member whose real zone is unknown (honest-data). Unknown-tz
  -- clients drop out → no rows → the route computes 'insufficient' → no chip.
  tz as (
    select a.client_id, cp.timezone as zone
    from allowed a
    join public.client_profiles cp on cp.user_id = a.client_id
    where cp.timezone is not null
  ),
  win as (  -- per client, the local "today" and the 56-day floor
    select client_id, zone,
           (now() at time zone zone)::date as today_local
    from tz
  ),
  -- Clamp the window start to the member's FIRST observed activity (any snapshot
  -- or daily-habit completion) within the 56-day floor — mirrors the client
  -- bucket builder, so a brand-new account doesn't read empty days as a gap.
  activity as (
    select w.client_id, w.today_local,
      greatest(
        w.today_local - 55,
        least(
          coalesce((select min(d.snapshot_date) from public.daily_health_snapshot d
                    where d.user_id = w.client_id and d.snapshot_date > w.today_local - 56 and d.snapshot_date <= w.today_local), w.today_local),
          coalesce((select min(uhc.done_on) from public.user_habit_completions uhc
                    join public.user_habits uh on uh.id = uhc.habit_id and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday') and uh.archived_at is null
                    where uh.user_id = w.client_id and uhc.done_on > w.today_local - 56 and uhc.done_on <= w.today_local), w.today_local)
        )
      ) as start_local
    from win w
  ),
  days as (  -- expand each client's clamped window, one row per calendar day
    select a.client_id, gs::date as day
    from activity a, generate_series(a.start_local, a.today_local, interval '1 day') gs
  ),
  -- NUTRITION: denominator = every day in the (clamped) window; a day is "logged"
  -- when its snapshot protein clears the floor. Left join so no-snapshot days
  -- count as den+1/num+0 (a miss) — matching the client builder exactly.
  nut as (
    select dy.client_id, 'nutrition'::text as dimension,
           date_trunc('week', dy.day)::date as week_start,
           count(*) filter (where extract(isodow from dy.day) < 6) as weekday_den,
           count(*) filter (where extract(isodow from dy.day) < 6 and coalesce(d.protein_g,0) >= 10) as weekday_num,
           count(*) filter (where extract(isodow from dy.day) >= 6) as weekend_den,
           count(*) filter (where extract(isodow from dy.day) >= 6 and coalesce(d.protein_g,0) >= 10) as weekend_num
    from days dy
    left join public.daily_health_snapshot d on d.user_id = dy.client_id and d.snapshot_date = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  ),
  -- HABITS: daily-cadence habits only; scheduled = every day in window × #daily habits
  daily_habits as (
    select a.client_id, count(*) as n_daily
    from activity a
    join public.user_habits h on h.user_id = a.client_id and lower(coalesce(h.cadence,'daily')) in ('daily','everyday') and h.archived_at is null
    group by a.client_id
  ),
  hab as (
    select dy.client_id, 'habits'::text as dimension,
           date_trunc('week', dy.day)::date as week_start,
           sum(case when extract(isodow from dy.day) < 6 then dh.n_daily else 0 end) as weekday_den,
           sum(case when extract(isodow from dy.day) < 6 then coalesce(c.done,0) else 0 end) as weekday_num,
           sum(case when extract(isodow from dy.day) >= 6 then dh.n_daily else 0 end) as weekend_den,
           sum(case when extract(isodow from dy.day) >= 6 then coalesce(c.done,0) else 0 end) as weekend_num
    from days dy
    join daily_habits dh on dh.client_id = dy.client_id
    left join (
      select uh.user_id, uhc.done_on, count(*) as done
      from public.user_habit_completions uhc
      join public.user_habits uh on uh.id = uhc.habit_id and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday') and uh.archived_at is null
      where uh.user_id in (select client_id from activity)
      group by uh.user_id, uhc.done_on
    ) c on c.user_id = dy.client_id and c.done_on = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  ),
  -- TRAINING: a day is in the DENOMINATOR when the client had a workout SCHEDULED
  -- that day (client_workouts.scheduled_date, published); in the NUMERATOR when a
  -- completed workout_session falls on that same LOCAL day. Day-based (a day with
  -- several scheduled workouts counts once) to mirror the other dimensions, and the
  -- session is bucketed into the member's own timezone so "trained that day" lines
  -- up with the coach-set scheduled calendar day. Days without a scheduled workout
  -- contribute 0/0 → they don't dilute the rate (the floor + statistical gate in the
  -- pure module decide whether the dimension is shown at all).
  sched as (
    select cw.client_id, cw.scheduled_date as day
    from public.client_workouts cw
    where cw.client_id in (select client_id from activity)
      and cw.status = 'published'
      and cw.scheduled_date is not null
    group by cw.client_id, cw.scheduled_date
  ),
  trained as (
    select ws.client_id, (coalesce(ws.started_at, ws.created_at) at time zone z.zone)::date as day
    from public.workout_sessions ws
    join tz z on z.client_id = ws.client_id
    where ws.client_id in (select client_id from activity)
      and ws.status = 'completed'
    group by ws.client_id, (coalesce(ws.started_at, ws.created_at) at time zone z.zone)::date
  ),
  trn as (
    select dy.client_id, 'training'::text as dimension,
           date_trunc('week', dy.day)::date as week_start,
           count(*) filter (where extract(isodow from dy.day) < 6 and sc.day is not null) as weekday_den,
           count(*) filter (where extract(isodow from dy.day) < 6 and sc.day is not null and tr.day is not null) as weekday_num,
           count(*) filter (where extract(isodow from dy.day) >= 6 and sc.day is not null) as weekend_den,
           count(*) filter (where extract(isodow from dy.day) >= 6 and sc.day is not null and tr.day is not null) as weekend_num
    from days dy
    left join sched sc on sc.client_id = dy.client_id and sc.day = dy.day
    left join trained tr on tr.client_id = dy.client_id and tr.day = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  )
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from nut
  union all
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from hab
  union all
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from trn;
$$;

revoke all on function public.get_roster_weekend_split(uuid[]) from public;
grant execute on function public.get_roster_weekend_split(uuid[]) to authenticated;
