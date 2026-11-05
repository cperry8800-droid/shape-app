-- A weekly reading of the figures a coach's Goal page binds to, so the goal pace can be projected
-- ("On track", "Off track · heading for 83% by Dec 31"; public/newdesign/coachGoals.js).
--
-- Active clients and net a month already have a weekly series (the trajectory, rebuilt from
-- subscriptions on every read), and programs published have their dates (coach_plans.published_at,
-- 2026-11-05-coach-plans-published-at.sql). Session adherence (trainers) and protein adherence
-- (nutritionists) have no history anywhere: each analytics read computes today's figure and keeps
-- nothing. So the analytics routes record this week's reading as they compute it, and the Goal page
-- reads the weeks back (GET /api/coach/goal-readings).
--
--   1. coach_goal_readings: one reading per listing, figure and ISO week (its Monday, UTC). A later
--      read in the same week replaces the value and the day it was taken, so a week holds its latest.
--   2. record_coach_goal_reading(): called by the analytics routes with the coach's own session. It
--      writes only for a listing the caller owns, only a figure on its list, only a value in range.
--   3. The coach reads their own listings' readings (RLS).
--
-- Readings older than two years are dropped as new ones arrive. Until this runs the call fails, the
-- routes log it and answer as before, and a goal bound to adherence shows its pace once readings
-- exist. One transaction. Idempotent, safe to re-run.

begin;

create table if not exists public.coach_goal_readings (
  provider_role text        not null check (provider_role in ('trainer', 'nutritionist')),
  provider_id   bigint      not null,
  metric        text        not null check (metric in ('adherencePct')),
  week_of       date        not null,
  on_day        date        not null,
  value         numeric     not null,
  updated_at    timestamptz not null default now(),
  primary key (provider_role, provider_id, metric, week_of)
);

alter table public.coach_goal_readings enable row level security;
revoke all on table public.coach_goal_readings from public, anon, authenticated;
grant select on table public.coach_goal_readings to authenticated;
grant select, insert, update, delete on table public.coach_goal_readings to service_role;

drop policy if exists coach_goal_readings_owner_read on public.coach_goal_readings;
create policy coach_goal_readings_owner_read on public.coach_goal_readings
  for select to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t where t.id = provider_id and t.owner_id = (select auth.uid())))
    or (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n where n.id = provider_id and n.owner_id = (select auth.uid())))
  );

-- This week's reading of one figure for one of the caller's own listings. Returns whether it was
-- written. A percent is 0 to 100; anything else, a listing the caller does not own, or no caller at
-- all writes nothing.
create or replace function public.record_coach_goal_reading(
  p_role text,
  p_provider_id bigint,
  p_metric text,
  p_value numeric
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_week date := date_trunc('week', (now() at time zone 'UTC'))::date;
begin
  if v_uid is null or p_role is null or p_role not in ('trainer', 'nutritionist') or p_provider_id is null then
    return false;
  end if;
  if p_metric is null or p_metric not in ('adherencePct') then
    return false;
  end if;
  if p_value is null or p_value < 0 or p_value > 100 then
    return false;
  end if;
  if p_role = 'trainer' then
    if not exists (select 1 from public.trainers t where t.id = p_provider_id and t.owner_id = v_uid) then
      return false;
    end if;
  else
    if not exists (select 1 from public.nutritionists n where n.id = p_provider_id and n.owner_id = v_uid) then
      return false;
    end if;
  end if;

  insert into public.coach_goal_readings as r (provider_role, provider_id, metric, week_of, on_day, value, updated_at)
  values (p_role, p_provider_id, p_metric, v_week, v_today, p_value, now())
  on conflict (provider_role, provider_id, metric, week_of)
  do update set value = excluded.value, on_day = excluded.on_day, updated_at = now();

  delete from public.coach_goal_readings
  where provider_role = p_role and provider_id = p_provider_id and week_of < v_week - 731;
  return true;
end;
$$;

revoke all on function public.record_coach_goal_reading(text, bigint, text, numeric) from public, anon;
grant execute on function public.record_coach_goal_reading(text, bigint, text, numeric) to authenticated, service_role;

-- Guard: raise on anything that did not land.
do $guard$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'coach_goal_readings' and c.relrowsecurity
  ) then
    raise exception 'coach_goal_readings is missing or has no row level security';
  end if;
  if has_table_privilege('anon', 'public.coach_goal_readings', 'select')
     or has_table_privilege('authenticated', 'public.coach_goal_readings', 'insert')
     or has_table_privilege('authenticated', 'public.coach_goal_readings', 'update') then
    raise exception 'coach_goal_readings: written only through record_coach_goal_reading';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_goal_readings' and policyname = 'coach_goal_readings_owner_read') then
    raise exception 'coach_goal_readings has no owner read policy';
  end if;
  if has_function_privilege('anon', 'public.record_coach_goal_reading(text, bigint, text, numeric)', 'execute')
     or not has_function_privilege('authenticated', 'public.record_coach_goal_reading(text, bigint, text, numeric)', 'execute') then
    raise exception 'record_coach_goal_reading: signed-in coaches only';
  end if;
end
$guard$;

commit;
