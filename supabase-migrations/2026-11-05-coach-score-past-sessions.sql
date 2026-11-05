-- The coach score counts sessions that have happened and programs that are published (2026-11-05).
--
-- WHY. Two of the score's three terms counted the wrong rows, in both functions below and in
-- /api/coach/score:
--   * Session completion (percent × 10) divided the completed sessions by every session scheduled
--     from 90 days ago on, with no end and any status. A coach's upcoming bookings, and every
--     cancelled or declined one, sat in the denominator and pulled completion down for nothing the
--     coach had failed to do; the further ahead a coach booked, the lower it read.
--   * Programs published (× 80) counted client_workouts rows: every assigned training day for every
--     client, archived ones included. One 12-week, three-day program assigned to one client was 36
--     "programs", 2,880 points; a published program nobody had been assigned yet was none.
-- The owner chose to ship it ("yes do score fix", 2026-11-05).
--
-- WHAT CHANGES. In each function the `sess` and `progs` terms only:
--   * sess: over the 90 days up to now. Completed = status 'completed'. Missed = status 'confirmed'
--     and due over 24 hours ago (a day's grace to mark it done). Completion = completed / (completed
--     + missed). Requested (never accepted), cancelled and declined sessions count neither way, and
--     nor does anything still ahead. An unmarked past session counts as missed, as get_client_stats
--     counts one (2026-10-31-client-stats-window.sql).
--   * progs: the trainer's published programs in their library (coach_plans: kind 'program',
--     published, and not a single-day workout, detail.buildType 'workout'; a row from before
--     buildType was stored counts, as the library reads it as a program). coach_plans is keyed by
--     the coach's account, so it is joined through the listing's owner_id.
-- Everything else is 2026-10-18-coach-score-distinct-clients.sql's body (the distinct open clients,
-- the 200-id cap, the role check, the listing intersection), with the same headers: get_coach_scores
-- stays a STABLE SECURITY DEFINER pinned to `public, pg_temp`; shape_coach_score_parts stays a STABLE
-- invoker pinned the same way (its callers are the definers record_coach_score_snapshots and
-- shape_coach_board, so it reads coach_plans as they do). `create or replace` keeps each function's
-- owner and grants, so nothing is granted or revoked.
--
-- ⚠ THIS MOVES EVERY COACH'S SCORE, and the nightly reading (07:15 UTC) records the new figure, so
-- the Climbers board's 30-day gain shows the jump for a month. The Score pages say so for 30 days
-- (COACH_SCORE_FIX_ON in public/newdesign/leaderboards.jsx, BS_SCORE_FIX_ON in
-- mobile-app/src/broadsheet/BSScoreFixNote.jsx): set both to the day this runs.
--
-- ⚠ KEEP IN SYNC with src/app/api/coach/score/route.ts, which counts the coach's own score the same
-- way for their Score page (tests/coach-score-fix.test.mjs reads all three).
--
-- Idempotent: safe to re-run.

begin;
set local lock_timeout = '10s';

create or replace function public.get_coach_scores(p_role text, p_ids bigint[])
returns table (provider_id bigint, points integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  -- REJECT an oversized call rather than silently truncating it. A `limit 200`
  -- would return an arbitrary subset, and the caller — which cannot tell a
  -- dropped id from one with no standing — would cache every omitted coach as
  -- "no tier" for the session. Failing loudly is the only honest option; the
  -- client chunks to this size, so this only fires on a caller that doesn't.
  if array_length(p_ids, 1) > 200 then
    raise exception 'get_coach_scores: at most 200 ids per call (got %)', array_length(p_ids, 1)
      using errcode = '22023';
  end if;

  -- Only the two marketplace coach roles are scoreable. Rejecting anything else
  -- LOUDLY (rather than returning an empty set) matters because of how the
  -- caller settles a batch: an empty-but-successful answer is indistinguishable
  -- from "these coaches have no standing", so every id would be cached as
  -- no-tier for the session. A raise leaves the keys uncached and retryable —
  -- the same reasoning as the >200 guard above.
  if p_role is null or p_role not in ('trainer', 'nutritionist') then
    raise exception 'get_coach_scores: unknown role %', coalesce(p_role, '<null>')
      using errcode = '22023';
  end if;

  return query
  with req as (
    -- De-duplicated: a crafted call can't fan this out.
    select distinct x as id
    from unnest(coalesce(p_ids, '{}'::bigint[])) as x
  ),
  ids as (
    -- Score only ids that are REAL provider rows of the requested role (the public coach set and
    -- nothing else; an unknown id returns no row, which the caller already handles).
    select r.id
    from req r
    where exists (
      select 1 from public.trainers t
      where p_role = 'trainer' and t.id = r.id
    ) or exists (
      select 1 from public.nutritionists n
      where p_role = 'nutritionist' and n.id = r.id
    )
  ),
  subs as (
    -- People, not plans, and a client whose payment is retrying counts (2026-10-18).
    select s.provider_id as pid,
           count(distinct coalesce(s.client_id::text, 'sub:' || s.id::text))
             filter (where s.status in ('active', 'trialing', 'past_due')) as active_clients
    from public.subscriptions s
    join ids on ids.id = s.provider_id
    where s.provider_role = p_role
    group by s.provider_id
  ),
  sess as (
    -- Sessions that have happened (2026-11-05): completed, or confirmed and unmarked a day after.
    select s.provider_id as pid,
           count(*) filter (where s.status = 'completed'
                              or (s.status = 'confirmed' and s.scheduled_at < now() - interval '24 hours')) as total,
           count(*) filter (where s.status = 'completed') as completed
    from public.sessions s
    join ids on ids.id = s.provider_id
    where s.provider_role = p_role
      and s.scheduled_at >= (now() - interval '90 days')
      and s.scheduled_at < now()
    group by s.provider_id
  ),
  progs as (
    -- Published programs in the coach's library (2026-11-05), by the listing's owner.
    select t.id as pid, count(p.id) as n
    from ids
    join public.trainers t on t.id = ids.id
    join public.coach_plans p on p.owner_id = t.owner_id
    where p_role = 'trainer'          -- nutritionists score no programs
      and p.kind = 'program'
      and p.published
      and coalesce(p.detail->>'buildType', 'program') <> 'workout'
    group by t.id
  )
  select
    ids.id as provider_id,
    (
      coalesce(subs.active_clients, 0) * 50
      + case
          when coalesce(sess.total, 0) > 0
            then round((sess.completed::numeric / sess.total) * 100) * 10
          else 0
        end
      + coalesce(progs.n, 0) * 80
    )::integer as points
  from ids
  left join subs  on subs.pid  = ids.id
  left join sess  on sess.pid  = ids.id
  left join progs on progs.pid = ids.id;
end;
$function$;

create or replace function public.shape_coach_score_parts(p_role text)
returns table (provider_id bigint, owner_id uuid, active_clients integer, completion_pct integer, programs integer, points integer)
language sql
stable
set search_path = public, pg_temp
as $function$
  with listings as (
    select t.id, t.owner_id from public.trainers t
    where p_role = 'trainer' and t.owner_id is not null
    union all
    select n.id, n.owner_id from public.nutritionists n
    where p_role = 'nutritionist' and n.owner_id is not null
  ),
  subs as (
    -- People, not plans, and a client whose payment is retrying counts (2026-10-18).
    select s.provider_id as pid,
           count(distinct coalesce(s.client_id::text, 'sub:' || s.id::text))
             filter (where s.status in ('active', 'trialing', 'past_due')) as active_clients
    from public.subscriptions s
    join listings l on l.id = s.provider_id
    where s.provider_role = p_role
    group by s.provider_id
  ),
  sess as (
    -- Sessions that have happened (2026-11-05): completed, or confirmed and unmarked a day after.
    select s.provider_id as pid,
           count(*) filter (where s.status = 'completed'
                              or (s.status = 'confirmed' and s.scheduled_at < now() - interval '24 hours')) as total,
           count(*) filter (where s.status = 'completed') as completed
    from public.sessions s
    join listings l on l.id = s.provider_id
    where s.provider_role = p_role
      and s.scheduled_at >= (now() - interval '90 days')
      and s.scheduled_at < now()
    group by s.provider_id
  ),
  progs as (
    -- Published programs in the coach's library (2026-11-05), by the listing's owner.
    select l.id as pid, count(p.id) as n
    from listings l
    join public.coach_plans p on p.owner_id = l.owner_id
    where p_role = 'trainer'
      and p.kind = 'program'
      and p.published
      and coalesce(p.detail->>'buildType', 'program') <> 'workout'
    group by l.id
  ),
  parts as (
    select l.id, l.owner_id,
           coalesce(subs.active_clients, 0)::integer as active_clients,
           case when coalesce(sess.total, 0) > 0
                then round((sess.completed::numeric / sess.total) * 100)::integer
                else 0 end as completion_pct,
           coalesce(progs.n, 0)::integer as programs
    from listings l
    left join subs  on subs.pid  = l.id
    left join sess  on sess.pid  = l.id
    left join progs on progs.pid = l.id
  )
  select id, owner_id, active_clients, completion_pct, programs,
         (active_clients * 50 + completion_pct * 10 + programs * 80)::integer as points
  from parts;
$function$;

-- The guard: both bodies count past sessions and published programs (and still distinct open
-- clients), and neither changed what kind of function it is. Anything else rolls it all back.
do $check$
declare
  v_name text;
  v_def text;
  v_definer boolean;
  v_config text[];
begin
  foreach v_name in array array['get_coach_scores', 'shape_coach_score_parts'] loop
    select pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
      into v_def, v_definer, v_config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    if v_def is null then
      raise exception '%: missing', v_name;
    end if;
    if position('count(distinct coalesce(s.client_id::text, ''sub:'' || s.id::text))' in v_def) = 0
       or position('(''active'', ''trialing'', ''past_due'')' in v_def) = 0 then
      raise exception '%: does not count distinct open clients', v_name;
    end if;
    if position('and s.scheduled_at < now()' in v_def) = 0
       or position('s.scheduled_at < now() - interval ''24 hours''' in v_def) = 0 then
      raise exception '%: does not count past sessions only', v_name;
    end if;
    if position('public.coach_plans' in v_def) = 0 or position('p.published' in v_def) = 0
       or position('public.client_workouts' in v_def) > 0 then
      raise exception '%: does not count published programs', v_name;
    end if;
    if v_definer is distinct from (v_name = 'get_coach_scores') then
      raise exception '%: SECURITY DEFINER changed', v_name;
    end if;
    if not (v_config @> array['search_path=public, pg_temp']) then
      raise exception '%: search_path is not pinned to public, pg_temp', v_name;
    end if;
  end loop;
end
$check$;

commit;
