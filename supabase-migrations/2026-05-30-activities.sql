-- Per-activity log that PRESERVES the activity type.
--
-- Today, synced activities (Strava/WHOOP) keep their type only as a community
-- post, while the daily snapshot collapses everything into "workout minutes" —
-- so a tennis match and a long run look identical in Progress/analytics. This
-- table keeps one typed row per activity (tennis, pilates, rowing, golf,
-- stairmaster, run, ride, …) so it can be broken out by type later.
--
-- Sources: 'strava' | 'whoop' | 'apple' | 'garmin' | 'manual'. The unique
-- (user_id, source, external_id) makes device sync idempotent; manual rows
-- carry a null external_id (nulls don't collide in a unique index). Owner RLS
-- + provider read for active subscribers (mirrors daily_health_snapshot).
-- Idempotent, safe to re-run.

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source text not null default 'manual'
    check (source in ('strava','whoop','apple','garmin','manual')),
  external_id text,
  activity_type text not null default 'workout',
  title text,
  started_at timestamptz,
  duration_min integer,
  distance_km numeric,
  calories integer,
  avg_hr integer,
  strain numeric,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create index if not exists activities_user_idx
  on public.activities (user_id, started_at desc);
create index if not exists activities_type_idx
  on public.activities (user_id, activity_type, started_at desc);

alter table public.activities enable row level security;

drop policy if exists "activities_rw_own" on public.activities;
create policy "activities_rw_own"
  on public.activities for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Providers can read their active/trialing subscribers' activities.
drop policy if exists "activities_provider_read" on public.activities;
create policy "activities_provider_read"
  on public.activities for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = activities.user_id
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );
