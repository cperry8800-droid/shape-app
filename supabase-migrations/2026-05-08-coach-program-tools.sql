-- Coach-built program tools, exercise library, and sensor-ready workout logs.
-- Idempotent, safe to re-run.

-- ===== Exercise library + video demos =====

create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references auth.users on delete cascade,
  provider_id bigint,
  provider_role text check (provider_role in ('trainer','nutritionist')),
  name text not null,
  category text,
  primary_muscles text[] not null default '{}',
  equipment text[] not null default '{}',
  difficulty text,
  video_url text,
  thumbnail_url text,
  coaching_cues text[] not null default '{}',
  common_faults text[] not null default '{}',
  sensor_profile jsonb not null default '{}'::jsonb,
  is_public boolean not null default false
);

create index if not exists exercise_library_owner_idx
  on public.exercise_library (owner_id, created_at desc);
create index if not exists exercise_library_provider_idx
  on public.exercise_library (provider_role, provider_id, name)
  where provider_id is not null and provider_role is not null;
create index if not exists exercise_library_public_idx
  on public.exercise_library (is_public, name)
  where is_public = true;

alter table public.exercise_library enable row level security;

drop policy if exists "exercise_library_read_own_or_public" on public.exercise_library;
create policy "exercise_library_read_own_or_public"
  on public.exercise_library for select
  to authenticated
  using (owner_id = auth.uid() or is_public = true);

drop policy if exists "exercise_library_write_own" on public.exercise_library;
create policy "exercise_library_write_own"
  on public.exercise_library for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ===== Coach program templates =====

create table if not exists public.coach_program_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references auth.users on delete cascade,
  provider_id bigint,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  title text not null,
  goal text,
  level text,
  duration_weeks integer check (duration_weeks is null or duration_weeks > 0),
  days_per_week integer check (days_per_week is null or days_per_week between 1 and 7),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source text not null default 'manual' check (source in ('manual','ai_generated','imported')),
  auto_adjust_rules jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb
);

alter table public.coach_program_templates
  add column if not exists progression_rules jsonb not null default '[]'::jsonb,
  add column if not exists nutrition_targets jsonb not null default '{}'::jsonb,
  add column if not exists marketplace_listed boolean not null default false,
  add column if not exists marketplace_price_cents integer
    check (marketplace_price_cents is null or marketplace_price_cents >= 0),
  add column if not exists marketplace_status text not null default 'not_listed'
    check (marketplace_status in ('not_listed','pending_review','listed','rejected','archived'));

create index if not exists coach_program_templates_owner_idx
  on public.coach_program_templates (owner_id, updated_at desc);
create index if not exists coach_program_templates_provider_idx
  on public.coach_program_templates (provider_role, provider_id, status, updated_at desc);
create index if not exists coach_program_templates_marketplace_idx
  on public.coach_program_templates (marketplace_listed, marketplace_status, updated_at desc)
  where marketplace_listed = true;

alter table public.coach_program_templates enable row level security;

drop policy if exists "coach_program_templates_read_own" on public.coach_program_templates;
create policy "coach_program_templates_read_own"
  on public.coach_program_templates for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "coach_program_templates_write_own" on public.coach_program_templates;
create policy "coach_program_templates_write_own"
  on public.coach_program_templates for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "coach_program_templates_read_marketplace" on public.coach_program_templates;
create policy "coach_program_templates_read_marketplace"
  on public.coach_program_templates for select
  to authenticated
  using (marketplace_listed = true and marketplace_status = 'listed');

create table if not exists public.coach_program_workouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  program_template_id uuid not null references public.coach_program_templates on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  week_number integer not null default 1 check (week_number > 0),
  day_number integer not null default 1 check (day_number between 1 and 7),
  title text not null,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists coach_program_workouts_template_idx
  on public.coach_program_workouts (program_template_id, week_number, day_number);
create index if not exists coach_program_workouts_owner_idx
  on public.coach_program_workouts (owner_id, updated_at desc);

alter table public.coach_program_workouts enable row level security;

drop policy if exists "coach_program_workouts_read_own" on public.coach_program_workouts;
create policy "coach_program_workouts_read_own"
  on public.coach_program_workouts for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "coach_program_workouts_write_own" on public.coach_program_workouts;
create policy "coach_program_workouts_write_own"
  on public.coach_program_workouts for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create table if not exists public.coach_program_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  program_template_id uuid not null references public.coach_program_templates on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  provider_id bigint not null,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  status text not null default 'assigned'
    check (status in ('assigned','active','paused','completed','archived')),
  weight_override text,
  notes text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists coach_program_assignments_owner_idx
  on public.coach_program_assignments (owner_id, created_at desc);
create index if not exists coach_program_assignments_client_idx
  on public.coach_program_assignments (client_id, status, created_at desc);
create index if not exists coach_program_assignments_template_idx
  on public.coach_program_assignments (program_template_id, created_at desc);

alter table public.coach_program_assignments enable row level security;

drop policy if exists "coach_program_assignments_owner_write" on public.coach_program_assignments;
create policy "coach_program_assignments_owner_write"
  on public.coach_program_assignments for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "coach_program_assignments_client_read" on public.coach_program_assignments;
create policy "coach_program_assignments_client_read"
  on public.coach_program_assignments for select
  to authenticated
  using (client_id = auth.uid());

-- ===== Optional metadata on older workout tables =====
-- These are guarded so the Program Tools save migration can still run if the
-- workout-session migrations have not been installed yet.

do $$
begin
  if to_regclass('public.client_workouts') is not null then
    alter table public.client_workouts
      add column if not exists source text not null default 'manual'
        check (source in ('manual','ai_generated','template','imported')),
      add column if not exists auto_adjust_rules jsonb not null default '{}'::jsonb,
      add column if not exists exercise_video_map jsonb not null default '{}'::jsonb,
      add column if not exists sensor_requirements jsonb not null default '{}'::jsonb;
  end if;
end $$;

do $$
begin
  if to_regclass('public.workout_set_logs') is not null then
    alter table public.workout_set_logs
      add column if not exists actual_reps integer check (actual_reps is null or actual_reps >= 0),
      add column if not exists actual_load numeric(10,2) check (actual_load is null or actual_load >= 0),
      add column if not exists load_unit text not null default 'lb',
      add column if not exists rpe numeric(3,1) check (rpe is null or rpe between 0 and 10),
      add column if not exists progression_snapshot text,
      add column if not exists selected_alternate text,
      add column if not exists reaction_type text
        check (reaction_type is null or reaction_type in ('strong','form_broke','skipped')),
      add column if not exists reaction_label text,
      add column if not exists detected_reps integer check (detected_reps is null or detected_reps >= 0),
      add column if not exists detected_tempo_seconds numeric(6,2) check (detected_tempo_seconds is null or detected_tempo_seconds >= 0),
      add column if not exists detected_rom_score numeric(5,2) check (detected_rom_score is null or detected_rom_score between 0 and 100),
      add column if not exists detection_confidence numeric(4,3)
        check (detection_confidence is null or detection_confidence between 0 and 1),
      add column if not exists form_feedback text;

    if to_regprocedure('public.can_access_workout_session(uuid)') is not null then
      drop policy if exists "clients update own workout set logs" on public.workout_set_logs;
      create policy "clients update own workout set logs"
        on public.workout_set_logs for update
        to authenticated
        using (client_id = auth.uid() and public.can_access_workout_session(session_id))
        with check (client_id = auth.uid() and public.can_access_workout_session(session_id));
    end if;
  end if;
end $$;

-- ===== Shared updated_at trigger =====

create or replace function public.coach_tools_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exercise_library_touch_updated_at on public.exercise_library;
create trigger exercise_library_touch_updated_at
  before update on public.exercise_library
  for each row execute function public.coach_tools_set_updated_at();

drop trigger if exists coach_program_templates_touch_updated_at on public.coach_program_templates;
create trigger coach_program_templates_touch_updated_at
  before update on public.coach_program_templates
  for each row execute function public.coach_tools_set_updated_at();

drop trigger if exists coach_program_workouts_touch_updated_at on public.coach_program_workouts;
create trigger coach_program_workouts_touch_updated_at
  before update on public.coach_program_workouts
  for each row execute function public.coach_tools_set_updated_at();

drop trigger if exists coach_program_assignments_touch_updated_at on public.coach_program_assignments;
create trigger coach_program_assignments_touch_updated_at
  before update on public.coach_program_assignments
  for each row execute function public.coach_tools_set_updated_at();
