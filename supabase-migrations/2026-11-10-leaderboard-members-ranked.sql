-- The leaderboards rank paid members only (owner, 2026-11-10: free accounts "can see
-- leaderboards but dont get to participate").
--
-- WHAT CHANGES. shape_member_board() ranked every account that earned Shape Score points in the
-- window. An account is free now, and being ranked is part of the $5 membership: the board ranks
-- an account whose newest platform subscription is `active`, or a coach by role (the rule
-- src/lib/membership-core.ts holds; an admin by e-mail allow-list is the API's answer, not the
-- database's, and is not ranked here unless they also pay or coach). A free account, a trial and a
-- past-due membership earn points as before and are on no board, their own view included: the
-- caller still sees the board, and /api/leaderboard says why they are not on it.
--
-- The function is the 2026-10-18-coach-access-past-due.sql definition with one CTE added
-- (`participants`, between `earners` and `eligible`); nothing else in it changes.
--
-- Idempotent (create or replace), one transaction, lock_timeout 10 s.

begin;
set local lock_timeout = '10s';

create or replace function public.shape_member_board(
  p_scope text default 'everyone',
  p_period text default 'month',
  p_limit integer default 50
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  points bigint,
  rank bigint,
  prev_rank bigint,
  rank_points bigint,
  streak integer,
  training_days integer,
  meal_days integer,
  total bigint,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_since timestamptz;
  v_prev_since timestamptz;
  v_prev_until timestamptz := now() - interval '7 days';
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if v_me is null then
    raise exception 'shape_member_board: sign in first' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('everyone', 'following', 'team') then
    raise exception 'shape_member_board: unknown scope %', coalesce(p_scope, '<null>') using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('week', 'month', 'all') then
    raise exception 'shape_member_board: unknown period %', coalesce(p_period, '<null>') using errcode = '22023';
  end if;

  if p_period = 'week' then
    v_since := now() - interval '7 days';
    v_prev_since := now() - interval '14 days';
  elsif p_period = 'month' then
    v_since := date_trunc('month', now());
    v_prev_since := date_trunc('month', now() - interval '7 days');
  else
    v_since := '1970-01-01'::timestamptz;
    v_prev_since := '1970-01-01'::timestamptz;
  end if;

  return query
  with my_coaches as (
    select s.provider_role, s.provider_id
    from public.subscriptions s
    where s.client_id = v_me and s.status in ('active', 'trialing', 'past_due')
  ),
  teammates as (
    select distinct s.client_id as uid
    from public.subscriptions s
    join my_coaches c on c.provider_role = s.provider_role and c.provider_id = s.provider_id
    where s.status in ('active', 'trialing', 'past_due') and s.client_id <> v_me
  ),
  followed as (
    select f.following_id as uid
    from public.user_follows f
    where f.follower_id = v_me and f.status = 'accepted'
  ),
  earners as (
    select distinct l.user_id as uid
    from public.score_ledger l
    where l.earned_at >= least(v_since, v_prev_since)
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
  ),
  -- ⚠ ONLY A PAID MEMBER IS RANKED (owner, 2026-11-10: free accounts "can see leaderboards but
  -- dont get to participate"): the newest platform subscription active, or a coach by role, as
  -- src/lib/membership-core.ts PLATFORM_PERK_STATUSES says. Not trialing, not past_due, and not a
  -- free account, the caller's own row included: a free caller sees the board and is not on it.
  participants as (
    select e.uid
    from earners e
    where exists (
            select 1 from public.profiles p
            where p.id = e.uid
              and (p.role in ('trainer', 'nutritionist', 'dietitian')
                   or coalesce(p.roles, '{}'::text[]) && array['trainer', 'nutritionist', 'dietitian']::text[])
          )
       or exists (
            select 1
            from (
              select s.status
              from public.platform_subscriptions s
              where s.client_id = e.uid
              order by s.current_period_end desc nulls last
              limit 1
            ) newest
            where newest.status = 'active'
          )
  ),
  eligible as (
    select e.uid
    from participants e
    left join public.user_goals g on g.user_id = e.uid and g.kind = 'client_privacy_prefs'
    where e.uid = v_me
       or (coalesce(g.data->>'leaderboard', 'on') <> 'off'
           and case p_scope
                 when 'everyone'  then public.shape_profile_visibility(e.uid) = 'public'
                 when 'following' then public.shape_profile_visibility(e.uid) = 'public'
                                       and e.uid in (select uid from followed)
                 else g.data->>'team_board' = 'on'
                      and e.uid in (select uid from teammates)
               end)
  ),
  now_totals as (
    select l.user_id as uid, sum(l.delta)::bigint as pts
    from public.score_ledger l
    join eligible el on el.uid = l.user_id
    where l.earned_at >= v_since
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
    group by l.user_id
    having sum(l.delta) > 0
  ),
  prev_totals as (
    select l.user_id as uid, sum(l.delta)::bigint as pts
    from public.score_ledger l
    join eligible el on el.uid = l.user_id
    where l.earned_at >= v_prev_since and l.earned_at < v_prev_until
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
    group by l.user_id
    having sum(l.delta) > 0
  ),
  ranked as (
    select n.uid, n.pts,
           rank() over (order by n.pts desc) as rk,
           count(*) over () as n_total
    from now_totals n
  ),
  prev_ranked as (
    select p.uid, rank() over (order by p.pts desc) as rk
    from prev_totals p
  ),
  -- The top of the board, you, and whoever is next above you (the one "to pass" names), even when
  -- they sit below the top (Fable, #2371: at #60 the line named #50 and skipped #59).
  shown as (
    select r.* from ranked r
    where r.rk <= v_limit
       or r.uid = v_me
       or r.rk = (select max(a.rk) from ranked a
                  where a.rk < (select m.rk from ranked m where m.uid = v_me))
  )
  select
    -- ⚠ Another member's id never leaves (Fable, #2371): get_display_names answers any id with the
    -- full name and photo, which a private profile on the team board was promised teammates would
    -- not see. Your own row keeps yours.
    case when s.uid = v_me then s.uid end,
    case
      when nm.n = '' then 'Shape member'
      when position(' ' in nm.n) = 0 then nm.n
      else split_part(nm.n, ' ', 1) || ' ' || upper(left(regexp_replace(nm.n, '^.* ', ''), 1)) || '.'
    end,
    -- ⚠ The photo only for a public profile, or your own (Codex, #2371). The team board takes a
    -- private profile on its own switch, whose ask names first name, last initial, points and tier,
    -- not the photo. Everyone and Following hold public profiles only, so this changes the team board.
    case when s.uid = v_me or public.shape_profile_visibility(s.uid) = 'public' then p.avatar_url end,
    s.pts,
    s.rk,
    pr.rk,
    public.shape_rank_points(s.uid),
    -- ⚠ Training and nutrition: the caller's own row only. Null for everyone else.
    case when s.uid = v_me then coalesce(st.n, 0)::integer end,
    case when s.uid = v_me then coalesce(td.n, 0)::integer end,
    case when s.uid = v_me then coalesce(md.n, 0)::integer end,
    s.n_total,
    s.uid = v_me
  from shown s
  left join public.profiles p on p.id = s.uid
  -- The name with any run of whitespace (a tab or a newline too, not only spaces) as one space,
  -- and none at either end, so "first name and last initial" holds for every name (Codex, #2371).
  left join lateral (
    select regexp_replace(regexp_replace(coalesce(p.full_name, ''), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g') as n
  ) nm on true
  left join prev_ranked pr on pr.uid = s.uid
  -- The streak the member's own dashboard shows (/api/client/dashboard): days in a row with a
  -- completed workout, counted back from today, or from yesterday when today has none yet.
  -- Read for the caller's own row only (`s.uid = v_me`), like the two counts below.
  left join lateral (
    with days as (
      select distinct (coalesce(ws.started_at, ws.ended_at, ws.created_at) at time zone 'UTC')::date as d
      from public.workout_sessions ws
      where ws.client_id = s.uid and s.uid = v_me and ws.status = 'completed'
        and (coalesce(ws.started_at, ws.ended_at, ws.created_at) at time zone 'UTC')::date
            between v_today - 400 and v_today
    ),
    islands as (
      select d, d - (row_number() over (order by d))::integer as grp from days
    )
    select count(*) as n
    from islands i
    where (select max(d) from days) >= v_today - 1
      and i.grp = (select i2.grp from islands i2 where i2.d = (select max(d) from days))
  ) st on true
  left join lateral (
    select count(distinct (coalesce(ws.started_at, ws.ended_at, ws.created_at) at time zone 'UTC')::date) as n
    from public.workout_sessions ws
    where ws.client_id = s.uid and s.uid = v_me and ws.status = 'completed'
      and coalesce(ws.started_at, ws.ended_at, ws.created_at) >= v_since
  ) td on true
  left join lateral (
    select count(distinct (l.earned_at at time zone 'UTC')::date) as n
    from public.score_ledger l
    where l.user_id = s.uid and s.uid = v_me and l.category = 'nutrition' and l.source_kind = 'meal_log'
      and l.delta > 0 and l.earned_at >= v_since
  ) md on true
  order by s.rk, s.uid;
end;
$$;

revoke execute on function public.shape_member_board(text, text, integer) from public, anon;
grant execute on function public.shape_member_board(text, text, integer) to authenticated, service_role;

commit;
