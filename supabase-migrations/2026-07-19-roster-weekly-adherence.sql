-- Batched WEEKLY adherence buckets for a coach's roster (spec 2026-07-19 —
-- the variance band). SECURITY DEFINER: habit/snapshot rows are owner-only
-- under RLS, so we read in a definer context but gate EVERY client through
-- the caller's own active subscription — a coach only ever sees their own
-- clients' buckets, and an unauthorized or nonexistent id is simply ABSENT
-- from the result (fail-closed, indistinguishable). search_path pinned with
-- pg_temp; every reference schema-qualified.
--
-- Idempotent, safe to re-run. Consumed by public/newdesign/varianceBand.mjs
-- (bsVarianceBand) — this function ONLY buckets; it makes no band judgement.
create or replace function public.get_roster_weekly_adherence(p_client_ids uuid[])
returns table (client_id uuid, week_start date, scheduled numeric, completed numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Fail CLOSED on an oversized batch (review round: raise, never silently
  -- truncate — a truncated roster would read as "those clients have no data").
  if coalesce(array_length(p_client_ids, 1), 0) > 100 then
    raise exception 'too_many_clients';
  end if;
  return query
  with capped as (
    -- DISTINCT: duplicate ids must not multiply joined rows into the totals.
    select distinct cid from unnest(p_client_ids) as cid
  ),
  allowed as (
    select c.cid as client_id from capped c
    where exists (
      select 1 from public.subscriptions s
      left join public.trainers t on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = c.cid
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  ),
  tz as (  -- the CANONICAL tz helper (shape_user_tz — validated pg_timezone_names
           -- only, so `now() at time zone zone` can never raise on a bad stored
           -- value); unknown-tz clients drop out rather than being bucketed in a
           -- fabricated zone (honest-data, same rule as the weekend-split RPC).
    select a.client_id, public.shape_user_tz(a.client_id) as zone
    from allowed a
    where public.shape_user_tz(a.client_id) is not null
  ),
  win as (  -- the trailing 8 CLOSED ISO weeks, local to each member
    select z.client_id, z.zone,
           date_trunc('week', (now() at time zone z.zone))::date as this_week_start
    from tz z
  ),
  days as (  -- every day of the 8 closed weeks (this week EXCLUDED)
    select w.client_id, w.zone, gs::date as day
    from win w,
         generate_series(w.this_week_start - 56, w.this_week_start - 1, interval '1 day') gs
  ),
  daily_habits as (
    select a.client_id, count(*) as n_daily
    from allowed a
    join public.user_habits h on h.user_id = a.client_id
      and lower(coalesce(h.cadence,'daily')) in ('daily','everyday') and h.archived_at is null
    group by a.client_id
  ),
  completions as (
    select uh.user_id, uhc.done_on, count(*) as done
    from public.user_habit_completions uhc
    join public.user_habits uh on uh.id = uhc.habit_id
      and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday') and uh.archived_at is null
    where uh.user_id in (select a.client_id from allowed a)
    group by uh.user_id, uhc.done_on
  ),
  per_day as (
    select d.client_id, d.day,
      -- units count SEPARATELY even on the same date (spec):
      coalesce(dh.n_daily, 0)                                                   as habit_sched,
      coalesce(c.done, 0)                                                       as habit_done,
      case when ws.scheduled then 1 else 0 end                                  as workout_sched,
      case when ws.scheduled and wl.done then 1 else 0 end                      as workout_done,
      1                                                                         as nutrition_sched,
      case when coalesce(s.protein_g, 0) >= 10 then 1 else 0 end                as nutrition_done
    from days d
    left join daily_habits dh on dh.client_id = d.client_id
    left join completions c on c.user_id = d.client_id and c.done_on = d.day
    -- EXISTS, not a join: several workout rows on one date must not fan per_day
    -- out and multiply the habit/nutrition units.
    left join lateral (
      select exists (
        select 1 from public.client_workouts w
        where w.client_id = d.client_id
          and w.scheduled_date = d.day
          and w.status = 'published'   -- mirrors the accountability cron's filter
      ) as scheduled
    ) ws on true
    -- "Logged a workout near that day", mirroring apply_obligation_penalty's
    -- exoneration EXACTLY (bias to counting it done — logging can lag the
    -- session): a snapshot with workout minutes on the day or the next, or any
    -- activity within ±1 day. NOTE: workout_sessions is deliberately NOT used —
    -- it has no per-day date column (client_id/created_at only), and the repo's
    -- authoritative completion signal is the pair below.
    left join lateral (
      select (
        exists (select 1 from public.daily_health_snapshot d2
                where d2.user_id = d.client_id
                  and d2.snapshot_date in (d.day, d.day + 1)
                  and coalesce(d2.workout_minutes, 0) > 0)
        or exists (select 1 from public.activities a2
                   where a2.user_id = d.client_id
                     and (a2.started_at)::date in (d.day - 1, d.day, d.day + 1))
      ) as done
    ) wl on true
    left join public.daily_health_snapshot s on s.user_id = d.client_id and s.snapshot_date = d.day
  )
  select per_day.client_id,
         date_trunc('week', per_day.day)::date as week_start,
         sum(per_day.habit_sched + per_day.workout_sched + per_day.nutrition_sched)::numeric as scheduled,
         -- least(): a stray extra completion can never push a week over 100%.
         sum(least(per_day.habit_done, per_day.habit_sched) + per_day.workout_done + per_day.nutrition_done)::numeric as completed
  from per_day
  group by per_day.client_id, date_trunc('week', per_day.day)
  order by 1, 2;
end $$;

-- Revoke from public AND anon AND authenticated before re-granting: Supabase
-- default-grants EXECUTE on new public functions, and revoking from `public`
-- alone leaves the role grants in place.
revoke all on function public.get_roster_weekly_adherence(uuid[]) from public, anon;
grant execute on function public.get_roster_weekly_adherence(uuid[]) to authenticated, service_role;
