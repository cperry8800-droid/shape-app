-- Shape Score fixes — the 2026-10-12 scoring review, on the owner's word: "fix all bugs".
--
-- Production held 0 score_ledger rows when this was written, so no member has been
-- mis-scored; every change below is to how points WILL be earned and read.
--
--   1. award_checkin_points paid +15 for ANY week_of a member wrote (client_checkins is
--      owner-writable), so a script could reach Legend in minutes. It now pays only for
--      this week or last week in the member's own zone.
--   2. The tier a member SAW (rank excluding Store purchases, including tier bonuses,
--      high-water) and the tier that UNLOCKED its rewards (net including Store purchases,
--      excluding bonuses) disagreed by up to 3,500 points, and every Store purchase pushed
--      later unlocks back. One basis now, everywhere: shape_rank_points() — the high-water
--      mark of points earned, excluding Store purchases and tier bonuses. The unlock, the
--      public profile card, the avatar tiers and the leaderboards all read it (the Score
--      page computes the same thing in src/lib/score-derive.ts).
--   4. New personal records stopped earning: the 2026-09-10 rewrite of post_my_pr_to_wall
--      dropped the +12 the copy still promises. A trigger on pr_wall_posts restores it,
--      once per lift per calendar month (the original bucket), whenever a best is written.
--   5. waive_penalty accepted ANY negative ledger row, so a coach could "waive" a client's
--      Store purchase and refund the points. It now takes penalty rows only.
--   6. Meals logged on the website or through Nora (POST /api/nutrition/meal-log) and
--      workouts synced from a device earned nothing: only the app called the RPCs. Both
--      RPCs gate on daily_health_snapshot, which every path writes, so a trigger there
--      awards them — same once-a-day keys, so nothing pays twice.
--   7. award_step_points closed a day out on the UTC date while snapshot_date is the
--      member's local day, so an evening open in the Americas locked in a partial day.
--      It now closes out on the member's own date (or a day later when the zone is unknown).
--
-- Every restated function keeps its existing grants (CREATE OR REPLACE does not touch
-- them; the definer audit's allow-list is unchanged). The three new functions are
-- revoked from public, anon and authenticated.
--
-- One transaction, re-runnable, a guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

-- ── 2. One rank basis ──────────────────────────────────────────────────────────
-- The high-water mark of a member's earned points: every ledger row except Store
-- purchases (spending never lowers your rank) and tier bonuses (a bonus is spendable
-- credit, not rank — and counting it is what let the shown tier run ahead of the
-- unlock). Penalties count, so they dent the current number, but the high-water mark
-- never comes down: the tier never demotes. Invoker: it is only ever called from
-- inside the definers below, which run as the owner.
create or replace function public.shape_rank_points(p_uid uuid)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(max(greatest(r.running, 0)), 0)::bigint
  from (
    select sum(l.delta) over (order by l.earned_at, l.id rows between unbounded preceding and current row) as running
    from public.score_ledger l
    where l.user_id = p_uid
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
  ) r;
$$;
revoke execute on function public.shape_rank_points(uuid) from public, anon, authenticated;

create or replace function public.award_tier_bonuses()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_base   bigint;
  v_award  integer := 0;
  v_names  text[] := array['Tempo','Form','Peak','Legend'];
  v_thresh integer[] := array[750, 2000, 5000, 15000];
  v_bonus  integer[] := array[500, 1000, 2000, 4000];
  i        integer;
  v_sid    uuid;
  v_ins    integer;
  v_unlocked integer := 0;
begin
  if v_uid is null then return jsonb_build_object('awarded', 0, 'unlocked', 0); end if;

  -- The SAME basis the Score page shows the tier on (shape_rank_points): the tier a
  -- member sees is the tier whose rewards they can claim.
  v_base := public.shape_rank_points(v_uid);

  for i in 1 .. array_length(v_thresh, 1) loop
    if v_base >= v_thresh[i] then
      v_sid := md5('tier_bonus:' || v_names[i])::uuid;  -- stable per-tier id → dedupe
      insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
      values (v_uid, 'other', 'tier_bonus', v_sid, v_bonus[i], 'Tier bonus · ' || v_names[i])
      on conflict (user_id, source_kind, source_id) do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_award := v_award + v_bonus[i]; end if;

      insert into public.tier_rewards (user_id, tier, reward_key)
      select v_uid, d.tier, d.reward_key from public.tier_reward_defs() d
      where d.tier = v_names[i]
      on conflict (user_id, reward_key) do nothing;
      get diagnostics v_ins = row_count;
      v_unlocked := v_unlocked + v_ins;
    end if;
  end loop;

  return jsonb_build_object('awarded', v_award, 'unlocked', v_unlocked);
end;
$$;

-- Avatar tiers (the app's people search, feed and chat) read this.
create or replace function public.get_user_points(p_ids uuid[])
returns table (user_id uuid, points bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- One row per member with a ledger, as the old GROUP BY gave, however often an id repeats.
  select u.id as user_id, public.shape_rank_points(u.id) as points
  from (select distinct x as id from unnest(coalesce(p_ids, array[]::uuid[])) as x) u
  where exists (select 1 from public.score_ledger l where l.user_id = u.id);
$$;
revoke all on function public.get_user_points(uuid[]) from public, anon;
grant execute on function public.get_user_points(uuid[]) to authenticated, service_role;

-- The profile card (website profile tier, the app's profile). Restated from
-- 2026-10-10-security-review-lows-and-anon-definers.sql; only `pts` changes.
create or replace function public.get_public_profile(p_user_id uuid)
returns table(user_id uuid, full_name text, role text, points bigint, bio text, pronouns text, goal text, link text, avatar text, is_public boolean, visibility text, can_view boolean, custom jsonb, username text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pts as (
    -- The rank basis (shape_rank_points): a card's tier is the tier its owner sees.
    -- It summed every row, so a Store purchase dropped a member a tier for others.
    select public.shape_rank_points(p_user_id) as points
  ),
  ident as (
    select g.data as d
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_identity'
    limit 1
  ),
  cust as (
    select g.data as d
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'profile_custom'
    limit 1
  ),
  visraw as (
    select coalesce(g.data->>'profileVisibility', 'Public') as v
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_settings'
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
      join public.conversation_participants them
        on them.conversation_id = me.conversation_id
      join public.conversations c on c.id = me.conversation_id
      where me.user_id = auth.uid()
        and them.user_id = p_user_id
        and c.dm_key is not null
    ) as is_friend
  ),
  acc as (
    select
      (select norm from vis) as norm,
      ((select norm from vis) = 'public')
        or (auth.uid() = p_user_id)
        or ((select norm from vis) = 'friends' and (select is_friend from fr))
        as can_view
  )
  select
    p.id,
    coalesce(p.full_name, 'Shape member'),
    p.role,
    (select points from pts),
    case when (select can_view from acc) then (select d->>'bio' from ident) end,
    case when (select can_view from acc) then (select d->>'pronouns' from ident) end,
    case when (select can_view from acc) then (select d->>'goal' from ident) end,
    case when (select can_view from acc) then (select d->>'link' from ident) end,
    (select d->>'photo' from ident),   -- avatar: returned for every card a caller may see
    ((select norm from vis) = 'public'),
    (select norm from acc),
    (select can_view from acc),
    case when (select can_view from acc) then (select d from cust) end,
    p.username
  from public.profiles p
  where p.id = p_user_id
    -- L17: a private profile is not a card for a caller with no account.
    and not (auth.uid() is null and (select norm from vis) = 'private');
$$;

-- ── 1. Check-ins pay for this week or last week only ──────────────────────────
create or replace function public.award_checkin_points(p_week_of date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_tz    text := public.shape_user_tz(auth.uid());
  v_today date;
begin
  if v_uid is null or p_week_of is null then return; end if;
  -- The member's own date when their zone is known; UTC otherwise (a day either side
  -- is inside the window anyway). A week_of more than 13 days back is an older week,
  -- and one in the future is not a check-in at all.
  v_today := case when v_tz is not null then (now() at time zone v_tz)::date else (now() at time zone 'utc')::date end;
  if p_week_of < v_today - 13 or p_week_of > v_today + 1 then return; end if;
  -- Require a genuine check-in for this week — a bare RPC call earns nothing.
  if not exists (
    select 1 from public.client_checkins where user_id = v_uid and week_of = p_week_of
  ) then return; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'adherence', 'checkin',
            md5('checkin:' || v_uid::text || ':' || p_week_of::text)::uuid,
            15, 'Weekly check-in')
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;

-- ── 5. A coach waives penalties, nothing else ─────────────────────────────────
create or replace function public.waive_penalty(p_uid uuid, p_source_kind text, p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_coach uuid := auth.uid(); v_delta integer; v_cat text; v_ins integer;
begin
  if v_coach is null or p_uid is null or p_source_kind is null or p_source_id is null then
    return jsonb_build_object('waived', false);
  end if;
  if not public.is_coach_on_client(p_uid) then
    return jsonb_build_object('waived', false, 'reason', 'not_coach');
  end if;
  -- ⚠ A PENALTY ROW, NOT "A NEGATIVE ROW". A Store purchase is negative too, and
  -- waiving it refunded the points while the client kept the item.
  if p_source_kind not like 'penalty\_%' escape '\' or p_source_kind = 'penalty_waive' then
    return jsonb_build_object('waived', false, 'reason', 'not_a_penalty');
  end if;
  select delta, category into v_delta, v_cat from public.score_ledger
    where user_id = p_uid and source_kind = p_source_kind and source_id = p_source_id and delta < 0
    limit 1;
  if v_delta is null then return jsonb_build_object('waived', false, 'reason', 'no_penalty'); end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (p_uid, coalesce(v_cat, 'adherence'), 'penalty_waive', p_source_id, -v_delta, 'Penalty waived by coach')
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null
      do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('waived', v_ins > 0, 'amount', -v_delta);
end $$;

-- ── 7. Steps close out on the member's own day ────────────────────────────────
create or replace function public.award_step_points()
returns table(day date, points integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tz  text := public.shape_user_tz(auth.uid());
  v_goal integer;
  v_today date;
  r record;
  v_shape_steps integer;
  v_bonus integer;
  v_total integer;
begin
  if v_uid is null then return; end if;

  select coalesce(nullif(data->>'goal', '')::integer, 8000) into v_goal
  from public.user_goals
  where user_id = v_uid and kind = 'client_step_goal'
  limit 1;
  if v_goal is null or v_goal < 1000 then v_goal := 8000; end if;

  -- snapshot_date is the member's LOCAL day, so a day is finished when the member's
  -- own date has moved past it. Zone unknown: wait a further day, which no zone on
  -- earth is still inside (UTC−12's day ends at noon UTC the next day).
  v_today := case when v_tz is not null then (now() at time zone v_tz)::date
                  else (now() at time zone 'utc')::date - 1 end;

  for r in
    select snapshot_date as d, steps::integer as steps
    from public.daily_health_snapshot
    where user_id = v_uid
      and steps is not null and steps > 0
      and snapshot_date <  v_today          -- completed days only
      and snapshot_date >= v_today - 14     -- recent catch-up window
  loop
    v_shape_steps := least(4, floor(r.steps / 5000.0)::integer);
    v_bonus := case when r.steps >= v_goal then 3 else 0 end;
    v_total := v_shape_steps + v_bonus;
    if v_total <= 0 then continue; end if;

    insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (
      v_uid, 'habits', 'step_points',
      md5('step_points:' || v_uid::text || ':' || r.d::text)::uuid,
      v_total,
      v_shape_steps || ' Shape Steps' || case when v_bonus > 0 then ' + goal' else '' end
    )
    on conflict do nothing;

    if found then
      day := r.d; points := v_total; return next;
    end if;
  end loop;
  return;
end;
$$;

-- ── 6. Meals and workouts earn however they were logged ───────────────────────
-- award_meal_log and award_workout_session both gate on today's daily_health_snapshot,
-- but only the app ever called them: a meal logged on the website or by Nora, and a
-- workout synced from a watch, wrote the snapshot and earned nothing. This trigger
-- awards from the snapshot itself, with the SAME source ids the RPCs use, so a day
-- pays at most once whichever path gets there first. The day must be the member's
-- today or yesterday (a sync can land after midnight) in their zone, or within a day
-- either side of UTC when the zone is unknown — the RPCs' own farm rule, plus the
-- late-sync day.
create or replace function public.award_from_daily_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz     text;
  v_today  date;
  v_latest date;
begin
  if new.user_id is null or new.snapshot_date is null then return new; end if;
  v_tz := public.shape_user_tz(new.user_id);
  v_today := case when v_tz is not null then (now() at time zone v_tz)::date else (now() at time zone 'utc')::date end;
  -- (A variable, not an inline CASE: plpgsql ends an IF condition at the first THEN.)
  v_latest := case when v_tz is not null then v_today else v_today + 1 end;
  if new.snapshot_date > v_latest or new.snapshot_date < v_today - 1 then
    return new;
  end if;

  if coalesce(new.workout_minutes, 0) > 0 then
    insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
      values (new.user_id, 'workouts', 'workout_session',
              md5('workout_session:' || new.user_id::text || ':' || new.snapshot_date::text)::uuid, 10, 'Workout session')
      on conflict do nothing;
  end if;

  if coalesce(new.dietary_kcal, 0) > 0 or coalesce(new.protein_g, 0) > 0
     or coalesce(new.carbs_g, 0) > 0 or coalesce(new.fat_g, 0) > 0 then
    insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
      values (new.user_id, 'nutrition', 'meal_log',
              md5('meal_log:' || new.user_id::text || ':' || new.snapshot_date::text)::uuid, 10, 'Meal logged')
      on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.award_from_daily_snapshot() from public, anon, authenticated;

drop trigger if exists daily_health_snapshot_award on public.daily_health_snapshot;
create trigger daily_health_snapshot_award
  after insert or update of workout_minutes, dietary_kcal, protein_g, carbs_g, fat_g
  on public.daily_health_snapshot
  for each row execute function public.award_from_daily_snapshot();

-- ── 4. A new personal record earns +12 again ─────────────────────────────────
-- post_my_pr_to_wall writes pr_wall_posts only for a genuine improvement (its
-- in-statement guard makes a losing race write nothing), so a write here IS a new
-- best. Once per lift per calendar month, the bucket the original award used.
create or replace function public.award_pr_wall_post()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is null or new.lift_key is null then return new; end if;
  if tg_op = 'UPDATE' and new.best_value is not distinct from old.best_value then return new; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (new.user_id, 'prs', 'pr_wall_post',
            md5('pr_wall:' || new.user_id::text || ':' || lower(new.lift_key) || ':' || to_char(now(), 'YYYY-MM'))::uuid,
            12, 'PR: ' || coalesce(nullif(new.lift_label, ''), new.lift_key))
    on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.award_pr_wall_post() from public, anon, authenticated;

drop trigger if exists pr_wall_posts_award on public.pr_wall_posts;
create trigger pr_wall_posts_award
  after insert or update of best_value on public.pr_wall_posts
  for each row execute function public.award_pr_wall_post();

-- ── 2 (cont.) The monthly boards count earned points only ─────────────────────
create or replace function public.shape_leaderboard(
  p_period text default 'month',
  p_limit int default 50
)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  points bigint,
  rank bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select case
      when p_period = 'week' then now() - interval '7 days'
      when p_period = 'all'  then '1970-01-01'::timestamptz
      else date_trunc('month', now())
    end as since
  ),
  totals as (
    select l.user_id, sum(l.delta)::bigint as points
    from public.score_ledger l, bounds b
    where l.earned_at >= b.since
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
    group by l.user_id
    having sum(l.delta) > 0
  ),
  visible as (
    select t.user_id, t.points
    from totals t
    left join public.user_goals g
      on g.user_id = t.user_id and g.kind = 'client_privacy_prefs'
    where coalesce(g.data->>'leaderboard', 'on') <> 'off'
  )
  select
    v.user_id,
    coalesce(p.full_name, 'Shape member') as full_name,
    p.avatar_url,
    v.points,
    rank() over (order by v.points desc) as rank
  from visible v
  left join public.profiles p on p.id = v.user_id
  order by v.points desc
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.shape_leaderboard_me(
  p_period text default 'month'
)
returns table (points bigint, rank bigint, total bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select case
      when p_period = 'week' then now() - interval '7 days'
      when p_period = 'all'  then '1970-01-01'::timestamptz
      else date_trunc('month', now())
    end as since
  ),
  totals as (
    select l.user_id, sum(l.delta)::bigint as points
    from public.score_ledger l, bounds b
    where l.earned_at >= b.since
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
    group by l.user_id
    having sum(l.delta) > 0
  ),
  visible as (
    select t.user_id, t.points
    from totals t
    left join public.user_goals g
      on g.user_id = t.user_id and g.kind = 'client_privacy_prefs'
    where coalesce(g.data->>'leaderboard', 'on') <> 'off'
  ),
  ranked as (
    select user_id, points, rank() over (order by points desc) as rank,
           count(*) over () as total
    from visible
  )
  select points, rank, total from ranked where user_id = auth.uid();
$$;
revoke execute on function public.shape_leaderboard(text, integer) from public, anon;
grant execute on function public.shape_leaderboard(text, integer) to authenticated, service_role;
revoke execute on function public.shape_leaderboard_me(text) from public, anon;
grant execute on function public.shape_leaderboard_me(text) to authenticated, service_role;

-- ── Guard ──────────────────────────────────────────────────────────────────────
do $guard$
begin
  if has_function_privilege('anon', 'public.shape_rank_points(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.shape_rank_points(uuid)', 'EXECUTE') then
    raise exception 'shape_rank_points is callable directly';
  end if;
  if has_function_privilege('anon', 'public.award_from_daily_snapshot()', 'EXECUTE')
     or has_function_privilege('anon', 'public.award_pr_wall_post()', 'EXECUTE') then
    raise exception 'a score trigger function is executable by anon';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'daily_health_snapshot_award' and not tgisinternal) then
    raise exception 'daily_health_snapshot_award is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'pr_wall_posts_award' and not tgisinternal) then
    raise exception 'pr_wall_posts_award is missing';
  end if;
  if has_function_privilege('anon', 'public.shape_leaderboard(text, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_user_points(uuid[])', 'EXECUTE') then
    raise exception 'a score reader is executable by anon';
  end if;
end;
$guard$;

commit;
