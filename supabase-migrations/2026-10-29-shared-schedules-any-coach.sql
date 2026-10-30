-- Every coach on a client sees every other coach's schedule, whatever their discipline (owner,
-- 2026-10-29: "Let two trainers on one client see each other's schedules too", then "any shared
-- client for any trainer or nutritionist should be shared").
--
-- 2026-10-29-shared-client-schedules.sql gave a coach the OTHER discipline's plan: a nutritionist
-- the trainers' workouts, a trainer the nutritionist's menu. A second trainer or a second
-- nutritionist on the same client saw nothing of the first. Both reads now answer any coach who
-- coaches the client now (is_coach_on_client: an open subscription, active, trialing or past_due),
-- with every OTHER coach's plan, never the caller's own (RLS already hands a coach their own rows):
--   get_shared_client_workouts(client): the published workouts of every trainer who coaches the
--     client now, but the caller's own; the same projection as before (title, description, date,
--     the payload's duration and time, its exercise count, the trainer's name, the newest five
--     finished runs), never a workout's sets.
--   get_shared_client_meal_plan(client): the newest published menu of EACH nutritionist who
--     coaches the client now, but the caller's own (one row per nutritionist, where it was one row);
--     the same projection as before (each day's dow, title and tag; each meal's slot, title, time
--     and kcal), never ingredients, steps or notes.
-- The return types are unchanged, so "create or replace" swaps the bodies in place.
--
-- Called by: src/app/api/calendar/route.ts (the coach's view of a client).
-- Re-runnable: "create or replace", and a guard.

begin;

-- ── get_shared_client_workouts ────────────────────────────────────────────────────────────────
create or replace function public.get_shared_client_workouts(p_client_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  scheduled_date date,
  duration text,
  plan_time text,
  exercise_count integer,
  trainer_name text,
  runs jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id,
         w.title,
         w.description,
         w.scheduled_date,
         w.payload->>'duration',
         w.payload->>'time',
         case when jsonb_typeof(w.payload->'exercises') = 'array' then jsonb_array_length(w.payload->'exercises') else 0 end,
         t.name,
         coalesce((
           select jsonb_agg(r.run order by r.created_at desc)
           from (
             select ws.created_at,
                    jsonb_build_object(
                      'duration_seconds', ws.duration_seconds,
                      'started_at', ws.started_at,
                      'ended_at', ws.ended_at,
                      'created_at', ws.created_at,
                      'local_day', ws.summary->>'snapshotDate'
                    ) as run
             from public.workout_sessions ws
             where ws.client_workout_id = w.id
               and ws.client_id = p_client_id
               and ws.status in ('completed', 'reviewed')
             order by ws.created_at desc
             limit 5
           ) r
         ), '[]'::jsonb)
  from public.client_workouts w
  join public.trainers t on t.id = w.trainer_id
  where auth.uid() is not null
    and p_client_id is not null
    and w.client_id = p_client_id
    and w.status = 'published'
    and public.is_coach_on_client(p_client_id)
    -- Never the caller's own: RLS already hands a trainer their own workouts.
    and t.owner_id is distinct from auth.uid()
    and exists (
      select 1 from public.subscriptions s
      where s.client_id = p_client_id
        and s.provider_role = 'trainer'
        and s.provider_id = w.trainer_id
        and s.status in ('active', 'trialing', 'past_due')
    )
  order by w.scheduled_date desc nulls first, w.created_at desc
  limit 200;
$$;

revoke all on function public.get_shared_client_workouts(uuid) from public, anon;
grant execute on function public.get_shared_client_workouts(uuid) to authenticated, service_role;

-- ── get_shared_client_meal_plan ───────────────────────────────────────────────────────────────
create or replace function public.get_shared_client_meal_plan(p_client_id uuid)
returns table (
  id uuid,
  title text,
  week_start date,
  payload jsonb,
  nutritionist_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select newest.id, newest.title, newest.week_start, newest.payload, newest.nutritionist_name
  from (
    select distinct on (m.nutritionist_id)
           m.id,
           m.title,
           m.week_start,
           jsonb_build_object('days', coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'dow', d.day->'dow',
                        'title', d.day->'title',
                        'tag', d.day->'tag',
                        'meals', coalesce((
                          select jsonb_agg(
                                   jsonb_build_object('slot', x.meal->'slot', 'title', x.meal->'title', 'time', x.meal->'time', 'kcal', x.meal->'kcal')
                                   order by x.i)
                          from jsonb_array_elements(case when jsonb_typeof(d.day->'meals') = 'array' then d.day->'meals' else '[]'::jsonb end)
                               with ordinality as x(meal, i)
                          where jsonb_typeof(x.meal) = 'object'
                        ), '[]'::jsonb)
                      )
                      order by d.i)
             from jsonb_array_elements(case when jsonb_typeof(m.payload->'days') = 'array' then m.payload->'days' else '[]'::jsonb end)
                  with ordinality as d(day, i)
             where jsonb_typeof(d.day) = 'object'
           ), '[]'::jsonb)) as payload,
           n.name as nutritionist_name,
           m.created_at
    from public.client_meal_plans m
    join public.nutritionists n on n.id = m.nutritionist_id
    where auth.uid() is not null
      and p_client_id is not null
      and m.client_id = p_client_id
      and m.status = 'published'
      and public.is_coach_on_client(p_client_id)
      -- Never the caller's own: RLS already hands a nutritionist their own menu.
      and n.owner_id is distinct from auth.uid()
      and exists (
        select 1 from public.subscriptions s
        where s.client_id = p_client_id
          and s.provider_role = 'nutritionist'
          and s.provider_id = m.nutritionist_id
          and s.status in ('active', 'trialing', 'past_due')
      )
    order by m.nutritionist_id, m.created_at desc
  ) newest
  order by newest.created_at desc
  limit 20;
$$;

revoke all on function public.get_shared_client_meal_plan(uuid) from public, anon;
grant execute on function public.get_shared_client_meal_plan(uuid) to authenticated, service_role;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
declare
  f text;
begin
  foreach f in array array['public.get_shared_client_workouts(uuid)', 'public.get_shared_client_meal_plan(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute') then
      raise exception '% must be executable by signed-in callers only', f;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('get_shared_client_workouts', 'get_shared_client_meal_plan')
      and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'))
  ) then
    raise exception 'the shared-schedule reads must be definers with a pinned search_path';
  end if;
  -- Signed out (no auth.uid() here), they answer nothing.
  if exists (select 1 from public.get_shared_client_workouts((select client_id from public.client_workouts limit 1)))
     or exists (select 1 from public.get_shared_client_meal_plan((select client_id from public.client_meal_plans limit 1))) then
    raise exception 'a shared-schedule read answered with no caller';
  end if;
end
$guard$;

commit;
