-- ============================================================================
-- Shape Score ledger + leaderboard, bundled in dependency order.
-- Paste into the Supabase SQL editor and Run once. Idempotent.
--
-- IMPORTANT: this creates public.score_ledger FIRST. Its absence was why the
-- leaderboard run failed (relation "public.score_ledger" does not exist) AND
-- why Shape Score never accumulated (habits/activities award points into it).
-- ============================================================================

-- ===== 1) score_ledger (prerequisite) =====

-- Shape Score ledger.
-- One row per points-earning event (or deduction). The ClientScore page
-- aggregates the current month by category to render the breakdown,
-- progress bar, and recent-points ledger.
--
-- Categories match the breakdown rows on ClientScore.html so the page
-- can ship without further translation:
--   workouts | adherence | habits | prs | community | endorsements
--   | radio | referrals | other

create table if not exists public.score_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'workouts','adherence','habits','prs','community',
    'endorsements','radio','referrals','other'
  )),
  source_kind text,    -- e.g. 'habit_toggle','workout_log','plan_day'
  source_id uuid,      -- pointer to originating row (habit_id, workout_id, …)
  delta integer not null,
  note text,
  earned_at timestamptz not null default now()
);

create index if not exists score_ledger_user_earned_idx
  on public.score_ledger (user_id, earned_at desc);
create index if not exists score_ledger_user_cat_earned_idx
  on public.score_ledger (user_id, category, earned_at desc);

-- Prevent double-credit when a single source event posts twice.
create unique index if not exists score_ledger_dedupe_idx
  on public.score_ledger (user_id, source_kind, source_id)
  where source_kind is not null and source_id is not null;

alter table public.score_ledger enable row level security;

drop policy if exists "score_ledger readable by owner" on public.score_ledger;
create policy "score_ledger readable by owner" on public.score_ledger
  for select using (auth.uid() = user_id);

drop policy if exists "score_ledger insertable by owner" on public.score_ledger;
create policy "score_ledger insertable by owner" on public.score_ledger
  for insert with check (auth.uid() = user_id);

drop policy if exists "score_ledger deletable by owner" on public.score_ledger;
create policy "score_ledger deletable by owner" on public.score_ledger
  for delete using (auth.uid() = user_id);

-- ===== 2) leaderboard functions =====

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

-- Drop first so a re-run after any signature/return-type edit can't fail with
-- "cannot change return type of existing function".
drop function if exists public.shape_leaderboard(text, int);
drop function if exists public.shape_leaderboard_me(text);

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
