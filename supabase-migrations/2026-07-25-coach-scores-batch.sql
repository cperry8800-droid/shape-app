-- Batch coach standing for the marketplace directory.
--
-- WHY: a coach's rung must be their CANONICAL coach score — the same quantity
-- /api/coach/score renders on their own Coach Score page (active clients +
-- session completion + programs published). The marketplace previously had no
-- way to read that for someone else, so it fell back to member activity points
-- (score_ledger), which is a DIFFERENT quantity: a successful coach with no
-- personal logging showed no standing, while a coach who logs their own
-- workouts showed a rung that contradicted their own page. One number, one
-- ladder, both surfaces.
--
-- The formula below mirrors src/app/api/coach/score/route.ts EXACTLY:
--     active clients (active|trialing)        x 50
--   + round(completion% over last 90d)        x 10
--   + programs published (TRAINER only)       x 80
-- ⚠ KEEP IN SYNC with that route. Two notes where the code is the authority:
--   * programs published has NO date filter in the route (the file's header
--     comment says "last 90 days" but the query does not filter) — matched here.
--   * completion% is rounded to a whole percent FIRST, then multiplied by 10,
--     exactly as Math.round(pct) * 10 does.
--
-- Returns a row per requested id that is a REAL provider of that role (0 when
-- the coach has nothing yet) so the caller can tell "looked up, no standing"
-- from "not looked up" and render honestly. An id that is not a provider of the
-- requested role returns NO ROW — the caller reads an absent id as "no
-- standing" and renders nothing, which is the honest answer for a coach who
-- does not exist.
-- SECURITY DEFINER because the directory is public-facing (browsable signed
-- out) while subscriptions/sessions are RLS-protected: the function exposes ONLY
-- the aggregated score, never a client id, a session row, or a raw count.
-- Idempotent — safe to re-run.

create or replace function public.get_coach_scores(p_role text, p_ids bigint[])
returns table (provider_id bigint, points integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
    select s.provider_id as pid,
           count(*) filter (where s.status in ('active', 'trialing')) as active_clients
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
$$;

-- Public directory: browsable signed out, so anon needs execute. Only the
-- aggregate leaves the function.
revoke all on function public.get_coach_scores(text, bigint[]) from public;
grant execute on function public.get_coach_scores(text, bigint[]) to anon, authenticated;
