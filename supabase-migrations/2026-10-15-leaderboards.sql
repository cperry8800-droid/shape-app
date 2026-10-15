-- Member and coach leaderboards. Owner, 2026-10-15: "we should have a members and coaches
-- leaderboard", then, on the preview (https://claude.ai/artifact/WDiuG1YCHygFWoNkwKnBmn):
-- "looks good, build it".
--
-- WHAT THIS ADDS
--   1. shape_member_board(scope, period, limit) — the member board, three ways:
--        everyone   members with a public profile who have not turned the board off
--        following  the same members, narrowed to the people the caller follows
--        team       members who share an active coach with the caller AND turned on
--                   "Show me to my coach's team" (client_privacy_prefs.team_board = 'on')
--      Names leave as first name and last initial, never the full name. Other members get name,
--      photo, points, rank and tier, the fields the privacy policy lists as public ("Shape Score
--      and tier … may appear on leaderboards"). ⚠ The streak, training days and meal days are
--      the CALLER'S OWN ONLY (null on everyone else's row): the policy says training and
--      nutrition data is never made public (Codex, on #2371).
--   2. shape_coach_board(role, view) — every live listing of a role ranked by Coach Score
--      ('standing') or by points gained over 30 days ('climb'). Coaches only.
--   3. coach_score_snapshots + record_coach_score_snapshots() — one nightly reading of every
--      coach's score (the cron /api/cron/coach-score-snapshots), which is what "climbers" and
--      "places moved since last week" are measured against. There is no history before it.
--   4. The two old boards, shape_leaderboard / shape_leaderboard_me, closed to signed-in
--      callers: they ship full names, and /api/leaderboard reads shape_member_board now.
--
-- ⚠ THE CALLER ALWAYS SEES THEIR OWN PLACE, EVEN WHEN NOBODY ELSE CAN. A member with the board
-- off, a private profile, or the team switch off is in their OWN view of the board and in no
-- one else's; /api/leaderboard tells them which of those hides them. So the rank a hidden member
-- reads is "where you would stand", and the people below them see a board one place shorter.
-- The same holds for a coach whose listing is not live yet.
--
-- ⚠ NO BOARD SAYS WHICH COACH A MEMBER HAS. The team board names teammates to each other, and
-- only teammates who switched it on; it never names the coach, and nothing here returns a
-- subscription. Being on it does tell a teammate you share a coach, which is why it is its own
-- switch and is off until the member turns it on.
--
-- ⚠ THE COACH SCORE IS THE ONE THE COACH'S SCORE PAGE SHOWS. Active clients × 50, session
-- completion over 90 days (percent × 10), programs × 80 for trainers: the formula in
-- get_coach_scores (2026-07-25-coach-scores-batch.sql) and /api/coach/score. KEEP THE THREE IN
-- SYNC; tests/leaderboards.test.mjs reads all three.
--
-- Re-runnable: create-or-replace and if-not-exists throughout; the guard at the end checks grants.

begin;

-- ── 1. Coach score history ──────────────────────────────────────────────────────────────────
create table if not exists public.coach_score_snapshots (
  provider_role text not null check (provider_role in ('trainer', 'nutritionist')),
  provider_id bigint not null,
  day date not null,
  points integer not null,
  primary key (provider_role, provider_id, day)
);
-- RLS on and no policy: only the definers below read or write it.
alter table public.coach_score_snapshots enable row level security;
revoke all on table public.coach_score_snapshots from anon, authenticated;

-- Every coach-owned listing of a role, with the parts of its score. Shape's own listings (no
-- owner) are not coaches and are left out, as the marketplace leaves them out. Not callable by
-- anyone directly; the two definers below call it.
create or replace function public.shape_coach_score_parts(p_role text)
returns table (
  provider_id bigint,
  owner_id uuid,
  active_clients integer,
  completion_pct integer,
  programs integer,
  points integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  with listings as (
    select t.id, t.owner_id from public.trainers t
    where p_role = 'trainer' and t.owner_id is not null
    union all
    select n.id, n.owner_id from public.nutritionists n
    where p_role = 'nutritionist' and n.owner_id is not null
  ),
  subs as (
    select s.provider_id as pid,
           count(*) filter (where s.status in ('active', 'trialing')) as active_clients
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
$$;
revoke execute on function public.shape_coach_score_parts(text) from public, anon, authenticated;

-- The nightly reading. Run by the cron with the service key; a second run the same UTC day
-- replaces that day's reading. Readings of listings that no longer exist, and readings over
-- 400 days old, are removed.
create or replace function public.record_coach_score_snapshots()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_written integer := 0;
  v_n integer;
  v_role text;
begin
  foreach v_role in array array['trainer', 'nutritionist'] loop
    insert into public.coach_score_snapshots (provider_role, provider_id, day, points)
      select v_role, p.provider_id, v_day, p.points
      from public.shape_coach_score_parts(v_role) p
    on conflict (provider_role, provider_id, day) do update set points = excluded.points;
    get diagnostics v_n = row_count;
    v_written := v_written + v_n;
  end loop;

  delete from public.coach_score_snapshots where day < v_day - 400;
  delete from public.coach_score_snapshots s
  where s.provider_role = 'trainer'
    and not exists (select 1 from public.trainers t where t.id = s.provider_id and t.owner_id is not null);
  delete from public.coach_score_snapshots s
  where s.provider_role = 'nutritionist'
    and not exists (select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id is not null);

  return v_written;
end;
$$;
revoke execute on function public.record_coach_score_snapshots() from public, anon, authenticated;
grant execute on function public.record_coach_score_snapshots() to service_role;

-- ── 2. The coach board ──────────────────────────────────────────────────────────────────────
-- Every LIVE listing of the role (owned, listing_ready — the marketplace's own predicate, which
-- a suspension already turns off), plus the caller's own listing of that role whether live or
-- not (`listed` says which). Callable only by an account that owns a listing of either role.
--
--   standing  rank by today's score; prev_rank is the rank in the reading taken 7 or more days
--             ago (null until there is one, or for a coach with no reading that day)
--   climb     rank by points gained since the reading 30 days ago, or since the earliest
--             reading before today when history is shorter (`gained_since` says which day).
--             Today's own reading is never the baseline, so on the first day nobody is ranked
--             rather than everyone tying at 0. A coach with no reading on the baseline day is not
--             ranked (gained and rank null).
create or replace function public.shape_coach_board(p_role text, p_view text default 'standing')
returns table (
  provider_id bigint,
  name text,
  specialty text,
  avatar_url text,
  points integer,
  active_clients integer,
  completion_pct integer,
  rank bigint,
  prev_rank bigint,
  gained integer,
  gained_since date,
  is_me boolean,
  listed boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_prev_day date;
  v_base_day date;
begin
  if v_me is null then
    raise exception 'shape_coach_board: sign in first' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('trainer', 'nutritionist') then
    raise exception 'shape_coach_board: unknown role %', coalesce(p_role, '<null>') using errcode = '22023';
  end if;
  if p_view is null or p_view not in ('standing', 'climb') then
    raise exception 'shape_coach_board: unknown view %', coalesce(p_view, '<null>') using errcode = '22023';
  end if;
  if not exists (select 1 from public.trainers t where t.owner_id = v_me)
     and not exists (select 1 from public.nutritionists n where n.owner_id = v_me) then
    raise exception 'shape_coach_board: coaches only' using errcode = '42501';
  end if;

  select max(s.day) into v_prev_day
  from public.coach_score_snapshots s
  where s.provider_role = p_role and s.day <= v_today - 7;

  select coalesce(
           (select max(s.day) from public.coach_score_snapshots s
            where s.provider_role = p_role and s.day <= v_today - 30),
           (select min(s.day) from public.coach_score_snapshots s
            where s.provider_role = p_role and s.day < v_today))
    into v_base_day;

  return query
  with listings as (
    select t.id, t.name, t.specialty, t.listing_media, t.owner_id, coalesce(t.listing_ready, false) as ready
    from public.trainers t
    where p_role = 'trainer' and t.owner_id is not null
      and (coalesce(t.listing_ready, false) or t.owner_id = v_me)
    union all
    select n.id, n.name, n.specialty, n.listing_media, n.owner_id, coalesce(n.listing_ready, false) as ready
    from public.nutritionists n
    where p_role = 'nutritionist' and n.owner_id is not null
      and (coalesce(n.listing_ready, false) or n.owner_id = v_me)
  ),
  scored as (
    select l.id, l.name, l.specialty, l.listing_media, l.owner_id, l.ready,
           p.points, p.active_clients, p.completion_pct,
           prev.points as prev_points,
           base.points as base_points
    from listings l
    join public.shape_coach_score_parts(p_role) p on p.provider_id = l.id
    left join public.coach_score_snapshots prev
      on prev.provider_role = p_role and prev.provider_id = l.id and prev.day = v_prev_day
    left join public.coach_score_snapshots base
      on base.provider_role = p_role and base.provider_id = l.id and base.day = v_base_day
  ),
  ranked as (
    select sc.*,
           (sc.points - sc.base_points)::integer as gain,
           rank() over (order by sc.points desc) as standing_rank,
           case when sc.prev_points is null then null
                else rank() over (partition by (sc.prev_points is null) order by sc.prev_points desc) end as prior_rank,
           case when sc.base_points is null then null
                else rank() over (partition by (sc.base_points is null) order by (sc.points - sc.base_points) desc) end as climb_rank
    from scored sc
  )
  select r.id,
         coalesce(nullif(btrim(r.name), ''), 'Shape coach'),
         nullif(btrim(coalesce(r.specialty, '')), ''),
         coalesce(nullif(r.listing_media->>'portrait', ''), pr.avatar_url),
         r.points,
         r.active_clients,
         r.completion_pct,
         case when p_view = 'climb' then r.climb_rank else r.standing_rank end,
         case when p_view = 'climb' then null else r.prior_rank end,
         r.gain,
         case when r.base_points is null then null else v_base_day end,
         r.owner_id = v_me,
         r.ready
  from ranked r
  left join public.profiles pr on pr.id = r.owner_id
  order by (case when p_view = 'climb' then r.climb_rank else r.standing_rank end) nulls last, r.id;
end;
$$;
revoke execute on function public.shape_coach_board(text, text) from public, anon;
grant execute on function public.shape_coach_board(text, text) to authenticated, service_role;

-- ── 3. The member board ─────────────────────────────────────────────────────────────────────
-- Points earned in the window (store spending and tier bonuses do not count, as on the old
-- board). week = the last 7 days, month = since the 1st (UTC), all = everything.
-- prev_rank is the rank in the same window a week earlier, among the same people.
-- Returns the top p_limit and the caller's own row; `total` is everyone ranked.
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
    where s.client_id = v_me and s.status in ('active', 'trialing')
  ),
  teammates as (
    select distinct s.client_id as uid
    from public.subscriptions s
    join my_coaches c on c.provider_role = s.provider_role and c.provider_id = s.provider_id
    where s.status in ('active', 'trialing') and s.client_id <> v_me
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
  eligible as (
    select e.uid
    from earners e
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
  shown as (
    select r.* from ranked r
    where r.rk <= v_limit or r.uid = v_me
  )
  select
    s.uid,
    case
      when btrim(coalesce(p.full_name, '')) = '' then 'Shape member'
      when position(' ' in btrim(p.full_name)) = 0 then btrim(p.full_name)
      else split_part(btrim(p.full_name), ' ', 1) || ' '
           || upper(left(regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
    end,
    p.avatar_url,
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

-- ── 4. The old boards: closed to callers ────────────────────────────────────────────────────
-- They return profiles.full_name, and the board now shows first name and last initial. Kept for
-- the service role so nothing that names them breaks; /api/leaderboard falls back to them only
-- on a database this migration has not reached.
revoke execute on function public.shape_leaderboard(text, integer) from public, anon, authenticated;
revoke execute on function public.shape_leaderboard_me(text) from public, anon, authenticated;
grant execute on function public.shape_leaderboard(text, integer) to service_role;
grant execute on function public.shape_leaderboard_me(text) to service_role;

-- ── Guard ───────────────────────────────────────────────────────────────────────────────────
do $guard$
begin
  if has_function_privilege('anon', 'public.shape_member_board(text, text, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.shape_member_board(text, text, integer)', 'EXECUTE') then
    raise exception 'shape_member_board: signed-in members only';
  end if;
  if has_function_privilege('anon', 'public.shape_coach_board(text, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.shape_coach_board(text, text)', 'EXECUTE') then
    raise exception 'shape_coach_board: signed-in callers only (the function itself admits coaches)';
  end if;
  if has_function_privilege('anon', 'public.shape_coach_score_parts(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.shape_coach_score_parts(text)', 'EXECUTE') then
    raise exception 'shape_coach_score_parts is callable directly';
  end if;
  if has_function_privilege('anon', 'public.record_coach_score_snapshots()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_coach_score_snapshots()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.record_coach_score_snapshots()', 'EXECUTE') then
    raise exception 'record_coach_score_snapshots: service role only';
  end if;
  if has_function_privilege('authenticated', 'public.shape_leaderboard(text, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.shape_leaderboard_me(text)', 'EXECUTE') then
    raise exception 'the old full-name boards are still open to signed-in callers';
  end if;
  if has_table_privilege('authenticated', 'public.coach_score_snapshots', 'SELECT')
     or has_table_privilege('anon', 'public.coach_score_snapshots', 'SELECT') then
    raise exception 'coach_score_snapshots is readable directly';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.coach_score_snapshots'::regclass) then
    raise exception 'coach_score_snapshots has RLS off';
  end if;
end;
$guard$;

commit;
