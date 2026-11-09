-- A coach's public stats, each only when the coach made it public (2026-11-09).
--
-- WHY. The owner, 2026-11-09: "we will eventually have to be able to record sessions coached, active
-- clients, etc." and then "Yes I want that data but coaches should be able to decide what they want
-- public." Shape already records all four figures; nothing showed them. This is the read a coach page
-- (website and app) calls for them. Showing them on the page is the next PR.
--
-- THE COACH'S CHOICE is `publicStats` in their own profile doc (user_goals kind 'profile_custom'), a
-- list of 'sessions', 'clients', 'since' and 'programClients', written by the app's Make it yours
-- (Spotlight → What's public) and cleaned by bsProfilePublicStats (public/newdesign/profileCustom.mjs).
-- No list, or a key missing from it, means that figure is not public: NOTHING IS PUBLIC UNTIL THE
-- COACH TURNS IT ON.
--
-- WHAT IT RETURNS: one row, always. Each column is the figure when the coach made it public and null
-- otherwise; a figure made public with nothing to count is 0 (or {} for program_clients): measured,
-- not unread. Counts only: no client's name or id, nothing per client.
--   sessions_coached  the coach's sessions with status 'completed' that were due before now, all time,
--                     over every provider row the account owns (public.sessions: provider_id +
--                     provider_role). The Score's rule for a past completed session
--                     (2026-11-05-coach-score-past-sessions.sql), without its 90-day window.
--   active_clients    the people who pay the coach now: subscriptions in status active, trialing or
--                     past_due, counted as distinct people (count(distinct coalesce(client_id, 'sub:' ||
--                     id))), as shape_coach_score_parts counts them, across every provider row the
--                     account owns, so a client paying the same coach as trainer and as nutritionist is
--                     one client.
--   coaching_since    the year (in the coach's own zone, profiles.timezone, else UTC) of the earlier of
--                     the coach's first completed past session and their first subscription that
--                     started (any status but pending, incomplete and incomplete_expired, the statuses
--                     src/lib/coach-trajectory.mjs reads as never started). 0 when there is neither.
--   program_clients   { "<coach_plans id>": n } for each plan the coach has PUBLISHED in their library:
--                     a trainer's programs (kind 'program', not a single-day workout, detail.buildType
--                     'workout', as the Score counts programs) and a nutritionist's meal plans (kind
--                     'meal_plan'). n is how many clients are on it now, by the rule the coach's own
--                     library reads (src/app/api/coach/plans/usage/route.ts, owner 2026-11-09): distinct
--                     clients with an open subscription to that provider row, holding a published
--                     upcoming workout from it (client_workouts.payload.template.id, scheduled_date on or
--                     after the coach's today) or, for a meal plan, their published plan from it
--                     (client_meal_plans.payload.template.id). A published plan nobody is on is 0.
--
-- WHO SEES IT. A provider row (trainers / nutritionists) owned by p_owner makes them a coach; an
-- account with none returns all nulls. A private profile returns all nulls to a caller it is not open
-- to, by get_public_profile's own can_view rule (2026-10-12-shape-score-fixes.sql): public, the owner,
-- or a friends-tier profile to a DM friend. A signed-out caller has a NULL uid, so the owner and
-- friend arms are false for it (written so they never come out NULL).
--
-- HOUSE RULES (2026-10-10-security-review-lows-and-anon-definers.sql): a STABLE SECURITY DEFINER pinned
-- to `public, pg_temp`, EXECUTE revoked from PUBLIC and granted to anon and authenticated BY NAME (the
-- intent on the record: coach pages are public), listed in tests/fixtures/definer-anon-allowlist.json
-- as public-by-design. It reads the profile doc and the private tables as their owner does, which is
-- why it returns counts and nothing else.
--
-- Idempotent: create or replace, revoke, grant, and a guard that rolls it all back if anything did not
-- land. Tested on PostgreSQL 16.4 (PGlite) with the tables it reads, as anon, a stranger, a friend, the
-- coach and the service role: tests/coach-public-stats-sql.test.mjs, whose database half runs when PGlite
-- is installed (SHAPE_PGLITE) and is skipped by name otherwise.

begin;
set local lock_timeout = '10s';

create or replace function public.get_coach_public_stats(p_owner uuid)
returns table (sessions_coached integer, active_clients integer, coaching_since integer, program_clients jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with provs as (
    -- The account's provider rows, both roles: a user can be a trainer and a nutritionist.
    select t.id, 'trainer'::text as role from public.trainers t where p_owner is not null and t.owner_id = p_owner
    union all
    select n.id, 'nutritionist'::text from public.nutritionists n where p_owner is not null and n.owner_id = p_owner
  ),
  pick as (
    -- The coach's own choice, read from their own doc: string keys of a list, the first 16 entries.
    select coalesce(array_agg(distinct e.k), '{}'::text[]) as keys
    from public.user_goals g
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(g.data->'publicStats') = 'array' then g.data->'publicStats' else '[]'::jsonb end
    ) with ordinality as x(v, i)
    cross join lateral (select x.v #>> '{}' as k where jsonb_typeof(x.v) = 'string') e
    where g.user_id = p_owner and g.kind = 'profile_custom' and x.i <= 16
  ),
  visraw as (
    select coalesce(g.data->>'profileVisibility', 'Public') as v
    from public.user_goals g
    where g.user_id = p_owner and g.kind = 'client_settings'
    limit 1
  ),
  vis as (
    select case
      when lower(coalesce((select v from visraw), 'public')) like 'pub%' then 'public'
      when lower(coalesce((select v from visraw), 'public')) like '%friend%'
        or lower(coalesce((select v from visraw), 'public')) like '%circle%' then 'friends'
      else 'private'
    end as norm
  ),
  fr as (
    select exists (
      select 1
      from public.conversation_participants me
      join public.conversation_participants them on them.conversation_id = me.conversation_id
      join public.conversations c on c.id = me.conversation_id
      where me.user_id = auth.uid()
        and them.user_id = p_owner
        and c.dm_key is not null
    ) as is_friend
  ),
  gate as (
    -- Open to this caller, and the account is a coach.
    select (
      (select norm from vis) = 'public'
      or coalesce(auth.uid() = p_owner, false)
      or ((select norm from vis) = 'friends' and (select is_friend from fr))
    ) and exists (select 1 from provs) as open
  ),
  shown as (
    -- Each figure is computed only when it is shown: off is null, never a count.
    select
      (select open from gate) and (select keys from pick) @> array['sessions'] as sessions,
      (select open from gate) and (select keys from pick) @> array['clients'] as clients,
      (select open from gate) and (select keys from pick) @> array['since'] as since,
      (select open from gate) and (select keys from pick) @> array['programClients'] as program_clients
  ),
  zone as (
    select coalesce((
      select z.name from public.profiles pr join pg_timezone_names z on z.name = pr.timezone where pr.id = p_owner limit 1
    ), 'UTC') as tz
  ),
  done as (
    -- Completed sessions that were due before now.
    select s.scheduled_at
    from public.sessions s
    join provs p on p.id = s.provider_id and p.role = s.provider_role
    where s.status = 'completed'
      and s.scheduled_at < now()
  ),
  plans as (
    select cp.id, cp.kind
    from public.coach_plans cp
    where cp.owner_id = p_owner
      and cp.published
      and (
        (cp.kind = 'program' and coalesce(cp.detail->>'buildType', 'program') <> 'workout'
          and exists (select 1 from provs where role = 'trainer'))
        or (cp.kind = 'meal_plan' and exists (select 1 from provs where role = 'nutritionist'))
      )
  ),
  open_subs as (
    select s.provider_id, s.provider_role, s.client_id
    from public.subscriptions s
    join provs p on p.id = s.provider_id and p.role = s.provider_role
    where s.status in ('active', 'trialing', 'past_due')
  ),
  on_plan as (
    -- Who is on each plan now, as the coach's own library reads it (ids stay in here).
    select (cw.payload->'template'->>'id') as plan_id, cw.client_id
    from public.client_workouts cw
    join provs p on p.role = 'trainer' and p.id = cw.trainer_id
    where cw.status = 'published'
      and cw.scheduled_date >= (now() at time zone (select tz from zone))::date
      and exists (select 1 from open_subs o where o.provider_role = 'trainer' and o.provider_id = cw.trainer_id and o.client_id = cw.client_id)
    union
    select (m.payload->'template'->>'id'), m.client_id
    from public.client_meal_plans m
    join provs p on p.role = 'nutritionist' and p.id = m.nutritionist_id
    where m.status = 'published'
      and exists (select 1 from open_subs o where o.provider_role = 'nutritionist' and o.provider_id = m.nutritionist_id and o.client_id = m.client_id)
  )
  select
    case when (select sessions from shown) then (select count(*)::integer from done) end,
    case when (select clients from shown) then (
      select count(distinct coalesce(s.client_id::text, 'sub:' || s.id::text))::integer
      from public.subscriptions s
      join provs p on p.id = s.provider_id and p.role = s.provider_role
      where s.status in ('active', 'trialing', 'past_due')
    ) end,
    case when (select since from shown) then coalesce((
      select extract(year from (least(
        (select min(scheduled_at) from done),
        (select min(s.created_at)
           from public.subscriptions s
           join provs p on p.id = s.provider_id and p.role = s.provider_role
          where s.status not in ('pending', 'incomplete', 'incomplete_expired'))
      ) at time zone (select tz from zone)))::integer
    ), 0) end,
    case when (select program_clients from shown) then coalesce((
      select jsonb_object_agg(pl.id::text, (
        select count(distinct o.client_id) from on_plan o where o.plan_id = pl.id::text
      )::integer)
      from plans pl
    ), '{}'::jsonb) end;
$function$;

revoke execute on function public.get_coach_public_stats(uuid) from public;
grant execute on function public.get_coach_public_stats(uuid) to anon, authenticated, service_role;

-- The guard: a pinned STABLE definer that anon and authenticated can run, whose body reads the
-- coach's own publicStats, gates each figure on it and on can_view, and names no client.
do $check$
declare
  v_def text;
  v_definer boolean;
  v_config text[];
  v_volatile char;
  v_oid oid;
begin
  select p.oid, pg_get_functiondef(p.oid), p.prosecdef, p.proconfig, p.provolatile
    into v_oid, v_def, v_definer, v_config, v_volatile
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_coach_public_stats'
    and pg_get_function_identity_arguments(p.oid) = 'p_owner uuid';
  if v_def is null then raise exception 'get_coach_public_stats(uuid): missing'; end if;
  if not v_definer or v_volatile <> 's' then raise exception 'get_coach_public_stats: must be a STABLE SECURITY DEFINER'; end if;
  if not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'get_coach_public_stats: search_path is not pinned to public, pg_temp';
  end if;
  if not has_function_privilege('anon', v_oid, 'execute') or not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'get_coach_public_stats: anon and authenticated must both be able to run it';
  end if;
  if position('g.data->''publicStats''' in v_def) = 0 or position('g.kind = ''profile_custom''' in v_def) = 0 then
    raise exception 'get_coach_public_stats: does not read the coach''s own publicStats';
  end if;
  if position('coalesce(auth.uid() = p_owner, false)' in v_def) = 0 then
    raise exception 'get_coach_public_stats: does not gate on can_view';
  end if;
end
$check$;

commit;
