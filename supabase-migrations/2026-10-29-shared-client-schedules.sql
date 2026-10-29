-- A trainer and a nutritionist who share a client see both schedules, and coaches who already
-- shared a client are told (owner, 2026-10-29: "Have the ability for trainers and nutritionists to
-- see both schedules if they have a shared client", then "Apply to existing pairs as well").
--
-- ── 1. Both schedules ─────────────────────────────────────────────────────────────────────────
-- The calendar a coach opens for a client (/api/calendar?clientId=) is built from the client's
-- assigned workouts (client_workouts) and their weekly menu (client_meal_plans). RLS lets a coach
-- read only the rows they wrote, so a trainer saw no menu and a nutritionist no workouts.
--
-- Two read-only definers hand a coach the OTHER discipline's schedule for a client they coach now,
-- projected to what the calendar draws. Not a using(is_coach_on_client(...)) policy: that hands
-- over the whole row (a menu's ingredients, steps and notes, a workout's every set) and widens
-- every other read of these tables, which assume a coach reads only their own rows (the
-- 2026-08-10-shared-clients-roster.sql lesson).
--   get_shared_client_workouts(client): for a NUTRITIONIST on the client, the published workouts
--     of the trainers who coach them now: id, title, description, scheduled_date, the payload's
--     duration and time, its exercise count, the trainer's name, and the newest five finished runs
--     of each (the calendar marks a workout done from them; a nutritionist can't read
--     workout_sessions, which can_access_workout_session keeps to the client and the trainer).
--   get_shared_client_meal_plan(client): for a TRAINER on the client, the newest published menu of
--     a nutritionist who coaches them now: id, title, week_start, each day's dow, title and tag,
--     each meal's slot, title, time and kcal (no ingredients, steps or notes), and the
--     nutritionist's name.
-- "Coaches them now" is an open subscription (active, trialing or past_due), as is_coach_on_client
-- and is_discipline_coach_on_client count it. A coach of the same discipline is handed nothing
-- here: each discipline's own reads stay as they were.
--
-- ── 2. Coaches who already shared a client ────────────────────────────────────────────────────
-- Since #2496 a hire tells both sides (src/lib/coach-thread.ts tellSharedCoaches). This tells every
-- pair that already existed, once: the same "Shared client" notice, its copy for the reader's
-- language in data.copy as the code writes it, keyed shared:existing:<client>:<other coach> so a
-- second run stores nothing, and skipping a pair the code has already told.
--
-- Called by: src/app/api/calendar/route.ts (the coach's view of a client).
-- Re-runnable: "create or replace", an insert that skips what it already wrote, and a guard.

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
    and public.is_discipline_coach_on_client(p_client_id, 'nutritionist')
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
  select m.id,
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
         ), '[]'::jsonb)),
         n.name
  from public.client_meal_plans m
  join public.nutritionists n on n.id = m.nutritionist_id
  where auth.uid() is not null
    and p_client_id is not null
    and m.client_id = p_client_id
    and m.status = 'published'
    and public.is_discipline_coach_on_client(p_client_id, 'trainer')
    and exists (
      select 1 from public.subscriptions s
      where s.client_id = p_client_id
        and s.provider_role = 'nutritionist'
        and s.provider_id = m.nutritionist_id
        and s.status in ('active', 'trialing', 'past_due')
    )
  order by m.created_at desc
  limit 1;
$$;

revoke all on function public.get_shared_client_meal_plan(uuid) from public, anon;
grant execute on function public.get_shared_client_meal_plan(uuid) to authenticated, service_role;

-- ── Tell coaches who already share a client ───────────────────────────────────────────────────
-- One row per client and coach (a coach with both listings on the client counts once, as their
-- trainer listing, as tellSharedCoaches does), then every ordered pair of two different coaches.
with live as (
  select s.client_id,
         s.provider_role as role,
         coalesce(t.owner_id, n.owner_id) as owner_id,
         nullif(btrim(coalesce(t.name, n.name, '')), '') as name
  from public.subscriptions s
  left join public.trainers t on s.provider_role = 'trainer' and t.id = s.provider_id
  left join public.nutritionists n on s.provider_role = 'nutritionist' and n.id = s.provider_id
  where s.status in ('active', 'trialing', 'past_due')
    and s.provider_role in ('trainer', 'nutritionist')
    and coalesce(t.owner_id, n.owner_id) is not null
),
per_owner as (
  select distinct on (client_id, owner_id) client_id, owner_id, role, name
  from live
  order by client_id, owner_id, case role when 'trainer' then 0 else 1 end, name nulls last
),
pairs as (
  select r.client_id,
         r.owner_id as to_id,
         r.role as to_role,
         c.owner_id as about_id,
         c.role as about_role,
         c.name as about_name,
         nullif(btrim(coalesce(pr.full_name, '')), '') as client_name
  from per_owner r
  join per_owner c on c.client_id = r.client_id and c.owner_id <> r.owner_id
  left join public.profiles pr on pr.id = r.client_id
)
insert into public.notifications (user_id, type, title, body, route, data)
select p.to_id,
       'shared_client',
       'Shared client: ' || coalesce(p.client_name, 'A client'),
       coalesce(p.client_name, 'A client') || ' now works with you and '
         || case when p.about_name is null then 'a ' || p.about_role else p.about_role || ' ' || p.about_name end
         || '. You can message each other in the care team on their client page.',
       'client',
       jsonb_build_object(
         'dedupe', 'shared:existing:' || p.client_id::text || ':' || p.about_id::text,
         'clientId', p.client_id,
         'providerRole', p.to_role,
         'counterpartUserId', p.about_id,
         'counterpartRole', p.about_role,
         -- How the bell and the push say it in the reader's language (noticeCopy.mjs): the same
         -- keys and values tellSharedCoaches stores. A nameless client is the catalog's "A client".
         'copy', jsonb_build_object(
           'title', jsonb_build_array('client.shared.title',
             jsonb_build_object('client', coalesce(to_jsonb(p.client_name), jsonb_build_object('$key', 'word.aClient')))),
           'body', case when p.about_name is null
             then jsonb_build_array(
               'client.shared.body' || case p.about_role when 'nutritionist' then 'Nutritionist' else 'Trainer' end || 'Anon',
               jsonb_build_object('client', coalesce(to_jsonb(p.client_name), jsonb_build_object('$key', 'word.aClient'))))
             else jsonb_build_array(
               'client.shared.body' || case p.about_role when 'nutritionist' then 'Nutritionist' else 'Trainer' end,
               jsonb_build_object('client', coalesce(to_jsonb(p.client_name), jsonb_build_object('$key', 'word.aClient')), 'coach', p.about_name))
           end
         )
       )
from pairs p
where not exists (
  select 1 from public.notifications x
  where x.user_id = p.to_id
    and x.type = 'shared_client'
    and x.data->>'clientId' = p.client_id::text
    and x.data->>'counterpartUserId' = p.about_id::text
)
on conflict do nothing;

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
