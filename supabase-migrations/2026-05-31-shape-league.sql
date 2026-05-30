-- Shape League — weekly behavioral leagues (Strava/Duolingo model).
--
-- WHAT'S RANKED: a weekly BEHAVIORAL score from score_ledger — things the user
-- controls (workouts logged, plan adherence, habits, community, radio). It
-- deliberately EXCLUDES outcome categories (prs) and non-"turning up" ones
-- (endorsements, referrals). Turning up beats performance — a beginner who
-- completes their plan can outscore an athlete who skips theirs.
--
-- STRUCTURE: opt-in. Members are seeded into cohorts of ~24 within a tier.
-- Tiers (the "heat ladder"): ember < ignite < flame < blaze < inferno.
-- Weekly seasons: each ISO week is its own season. On the first read of a new
-- week, a member's PRIOR week is settled — top 5 of the cohort promote a tier,
-- bottom 5 relegate — then they're reseeded into a fresh cohort for the new
-- week. Lazy (no cron); see the API route.
--
-- PRIVACY: joining is explicit (a row here). Leaving deletes the row — no rank
-- follows you out.
--
-- Requires score_ledger (2026-05-28). Idempotent, safe to re-run.

create table if not exists public.league_members (
  user_id uuid primary key references auth.users on delete cascade,
  tier text not null default 'ember'
    check (tier in ('ember','ignite','flame','blaze','inferno')),
  -- ISO-week key 'IYYY-IW' the member is currently seeded for, + their cohort
  -- number within (tier, week). Reseeded each new week on first read.
  season_week text not null,
  cohort int not null default 0,
  joined_at timestamptz not null default now(),
  -- last week we settled promotion/relegation for this member (prevents
  -- double-applying when the league is opened multiple times in a new week).
  settled_week text
);

create index if not exists league_members_cohort_idx
  on public.league_members (season_week, tier, cohort);

alter table public.league_members enable row level security;

-- A member manages their own membership (join / leave / the API updates seed).
drop policy if exists "league_members_rw_own" on public.league_members;
create policy "league_members_rw_own"
  on public.league_members for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Weekly behavioral score ──────────────────────────────────────────────
-- Points a user earned in a given ISO week from the "turning up" categories.
-- SECURITY DEFINER so it can read across users (score_ledger is owner-RLS) but
-- it only ever returns an aggregate integer, never raw ledger rows.
create or replace function public.league_week_score(p_user uuid, p_week text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.delta), 0)::int
  from public.score_ledger l
  where l.user_id = p_user
    and l.category in ('workouts','adherence','habits','community','radio')
    and to_char(l.earned_at, 'IYYY-IW') = p_week;
$$;

-- ── Standings for a cohort (current week) ────────────────────────────────
-- Returns every member of the caller-resolved cohort with their live weekly
-- score + rank + safe display fields. SECURITY DEFINER; only display data out.
create or replace function public.league_standings(p_week text, p_tier text, p_cohort int)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  score int,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with members as (
    select m.user_id
    from public.league_members m
    where m.season_week = p_week and m.tier = p_tier and m.cohort = p_cohort
  ),
  scored as (
    select mem.user_id, public.league_week_score(mem.user_id, p_week) as score
    from members mem
  )
  select
    s.user_id,
    coalesce(p.full_name, 'Shape member') as full_name,
    p.avatar_url,
    s.score,
    rank() over (order by s.score desc) as rank
  from scored s
  left join public.profiles p on p.id = s.user_id
  order by s.score desc;
$$;

revoke all on function public.league_week_score(uuid, text) from public;
revoke all on function public.league_standings(text, text, int) from public;
grant execute on function public.league_week_score(uuid, text) to authenticated;
grant execute on function public.league_standings(text, text, int) to authenticated;
