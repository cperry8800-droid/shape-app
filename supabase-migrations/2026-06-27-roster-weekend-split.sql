-- Batched weekday-vs-weekend buckets for a coach's roster. SECURITY DEFINER:
-- habit rows are owner-only under RLS, so we read them in a definer context but
-- gate every client through is-coach-on-client (active/trialing subscription
-- owned by the caller) — a coach can only ever see their own clients' buckets.
create or replace function public.get_roster_weekend_split(p_client_ids uuid[])
returns table (
  client_id uuid,
  dimension text,        -- 'nutrition' | 'habits'
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
  tz as (
    select a.client_id, coalesce(cp.timezone, 'UTC') as zone
    from allowed a
    left join public.client_profiles cp on cp.user_id = a.client_id
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
                    join public.user_habits uh on uh.id = uhc.habit_id and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday')
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
    join public.user_habits h on h.user_id = a.client_id and lower(coalesce(h.cadence,'daily')) in ('daily','everyday')
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
      join public.user_habits uh on uh.id = uhc.habit_id and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday')
      group by uh.user_id, uhc.done_on
    ) c on c.user_id = dy.client_id and c.done_on = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  )
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from nut
  union all
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from hab;
$$;

revoke all on function public.get_roster_weekend_split(uuid[]) from public;
grant execute on function public.get_roster_weekend_split(uuid[]) to authenticated;
