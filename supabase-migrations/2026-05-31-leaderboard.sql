-- Shape Score leaderboard.
--
-- score_ledger RLS only exposes a user's own rows, so a cross-user ranking
-- can't be built client-side. This SECURITY DEFINER function aggregates points
-- per user over a period and returns ONLY safe display fields (name, avatar,
-- points, rank) — never the raw ledger. Anyone authenticated can call it.
--
-- Privacy: a user is excluded if their user_goals 'client_privacy_prefs' JSON
-- has leaderboard = 'off'. Everyone else is in by default. The caller always
-- sees their own rank (a second query the API can do), but the public board
-- respects opt-out.
--
-- period: 'week' | 'month' | 'all'. limit_n caps the returned rows.
-- Idempotent, safe to re-run.

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
set search_path = public
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

-- A caller's own rank within the full (visible) field, even if outside top N.
create or replace function public.shape_leaderboard_me(
  p_period text default 'month'
)
returns table (points bigint, rank bigint, total bigint)
language sql
stable
security definer
set search_path = public
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

revoke all on function public.shape_leaderboard(text, int) from public;
revoke all on function public.shape_leaderboard_me(text) from public;
grant execute on function public.shape_leaderboard(text, int) to authenticated;
grant execute on function public.shape_leaderboard_me(text) to authenticated;
