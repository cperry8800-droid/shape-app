-- The coach score counts CLIENTS, and a client whose payment is retrying counts (owner, 2026-10-18).
--
-- WHY. The score's first term is "50 a client", and the coach Score page (app and website) says so.
-- Both functions counted subscription ROWS with status active or trialing, so:
--   * a client on two plans with one coach earned that coach 100 (Codex on #2400; a supported shape,
--     origin-attribution.ts folds it into one client, though none is in production today), and
--   * a client whose payment is retrying earned nothing, while the same coach's Business page,
--     Clients list and badge count them (2026-10-18-coach-access-past-due.sql keeps their access).
-- The owner chose both: "Yes, per client" and "Yes, count them".
--
-- WHAT CHANGES. In each function the `subs` term only: count(distinct client) over the open
-- statuses (active, trialing, past_due), a row with no client_id standing alone as in every other
-- per-client count. Everything else is the live body as read on 2026-10-18 (pg_get_functiondef),
-- comments included, with the same headers: get_coach_scores stays a STABLE SECURITY DEFINER
-- pinned to `public, pg_temp`; shape_coach_score_parts stays a STABLE invoker pinned the same way.
-- `create or replace` keeps each function's owner and grants, so nothing is granted or revoked.
--
-- ⚠ KEEP IN SYNC with src/app/api/coach/score/route.ts, which counts the coach's own clients the
-- same way for their Score page.
--
-- Idempotent: safe to re-run.

begin;

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
    -- Score only ids that are REAL provider rows of the requested role.
    --
    -- `trainers`/`nutritionists` are the marketplace's own source and are
    -- unconditionally public-read today (SELECT policy `qual: true` for
    -- anon+authenticated — verified live), so this intersection hides nothing
    -- that is visible now. It makes the boundary EXPLICIT: this function scores
    -- the public coach set and nothing else, so if an "unlisted coach" flag is
    -- ever added to those tables it narrows this function automatically instead
    -- of quietly continuing to expose the hidden rows.
    --
    -- It also stops the function asserting a real-looking "0 points" about a
    -- provider id that does not exist — an unknown id now returns NO ROW, which
    -- is the honest answer and the one the caller already handles.
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
    select s.provider_id as pid,
           count(*) as total,
           count(*) filter (where s.status = 'completed') as completed
    from public.sessions s
    join ids on ids.id = s.provider_id
    where s.provider_role = p_role
      and s.scheduled_at >= (now() - interval '90 days')
    group by s.provider_id
  ),
  progs as (
    select w.trainer_id as pid, count(*) as n
    from public.client_workouts w
    join ids on ids.id = w.trainer_id
    where p_role = 'trainer'          -- nutritionists score no programs
    group by w.trainer_id
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
    select s.provider_id as pid,
           count(*) as total,
           count(*) filter (where s.status = 'completed') as completed
    from public.sessions s
    join listings l on l.id = s.provider_id
    where s.provider_role = p_role
      and s.scheduled_at >= (now() - interval '90 days')
    group by s.provider_id
  ),
  progs as (
    select w.trainer_id as pid, count(*) as n
    from public.client_workouts w
    join listings l on l.id = w.trainer_id
    where p_role = 'trainer'
    group by w.trainer_id
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

-- The guard: both bodies count distinct clients over the three open statuses, and neither changed
-- what kind of function it is. Anything else rolls the whole migration back.
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
