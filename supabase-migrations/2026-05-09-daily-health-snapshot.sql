-- Daily health snapshot. One row per (user_id, date) consolidating signals
-- from sleep, recovery, training, and nutrition into a single queryable
-- record. This is the foundation for the cross-domain correlation engine,
-- the AI weekly readout, and role-lensed analytics — all of which read from
-- this table instead of the raw integration responses.
--
-- Sources merge non-destructively: each sync (WHOOP, Strava, workout_session
-- log, manual nutrition entry) UPSERTs the columns it owns. The `sources`
-- jsonb tracks which providers contributed which fields so coaches can
-- distinguish "no data" from "missing integration".
--
-- Idempotent, safe to re-run.

create table if not exists public.daily_health_snapshot (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,

  -- Sleep / recovery (typically WHOOP, Apple Health, Garmin)
  sleep_hours numeric(4,2),
  sleep_performance_pct numeric(5,2),
  sleep_efficiency_pct numeric(5,2),
  recovery_score numeric(5,2),
  hrv_ms numeric(6,2),
  resting_hr numeric(5,2),

  -- Training (WHOOP strain, Strava, workout_sessions)
  strain numeric(4,2),
  workout_minutes integer check (workout_minutes is null or workout_minutes >= 0),
  workout_volume_lb integer check (workout_volume_lb is null or workout_volume_lb >= 0),
  avg_heart_rate integer check (avg_heart_rate is null or avg_heart_rate >= 0),
  max_heart_rate integer check (max_heart_rate is null or max_heart_rate >= 0),

  -- Nutrition (manual log, MyFitnessPal-style imports)
  calories integer check (calories is null or calories >= 0),
  protein_g numeric(6,2) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(6,2) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(6,2) check (fat_g is null or fat_g >= 0),
  hydration_l numeric(4,2) check (hydration_l is null or hydration_l >= 0),

  -- Body / subjective
  weight_lb numeric(5,1),
  body_fat_pct numeric(4,1),
  mood smallint check (mood is null or (mood between 1 and 10)),
  stress smallint check (stress is null or (stress between 1 and 10)),
  soreness smallint check (soreness is null or (soreness between 1 and 10)),

  -- Provenance: { "sleep": "whoop", "strain": "whoop", "calories": "manual" }
  sources jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists daily_health_snapshot_user_date_idx
  on public.daily_health_snapshot (user_id, snapshot_date desc);

alter table public.daily_health_snapshot enable row level security;

-- Users can read and write their own snapshots. Sync routes run as the
-- authenticated user and upsert directly; manual nutrition entry uses the
-- same path.
drop policy if exists "user_rw_own_snapshots" on public.daily_health_snapshot;
create policy "user_rw_own_snapshots"
  on public.daily_health_snapshot for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trainers and nutritionists can read snapshots for their active subscribers.
-- Mirrors the client_intakes provider-visibility pattern.
drop policy if exists "providers_read_subscriber_snapshots" on public.daily_health_snapshot;
create policy "providers_read_subscriber_snapshots"
  on public.daily_health_snapshot for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = daily_health_snapshot.user_id
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

create or replace function public.daily_health_snapshot_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_health_snapshot_touch_updated_at on public.daily_health_snapshot;
create trigger daily_health_snapshot_touch_updated_at
  before update on public.daily_health_snapshot
  for each row execute function public.daily_health_snapshot_set_updated_at();
