-- Shape workout session logs.
-- Phone app owns exact set/rest timing; watches add sensor samples.
-- Idempotent, safe to re-run.

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users on delete cascade,
  client_workout_id uuid references public.client_workouts(id) on delete set null,
  provider_id bigint,
  provider_role text check (provider_role in ('trainer','nutritionist')),
  title text not null default 'Workout session',
  activity_type text not null default 'workout',
  status text not null default 'completed'
    check (status in ('planned','active','completed','abandoned','reviewed')),
  privacy text not null default 'private'
    check (privacy in ('private','coach','community','public')),
  source text not null default 'shape_app'
    check (source in ('shape_app','shape_session','apple_watch','apple_health','wear_os','whoop','garmin','strava','manual')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_sessions_client_idx
  on public.workout_sessions (client_id, created_at desc);
create index if not exists workout_sessions_provider_idx
  on public.workout_sessions (provider_role, provider_id, created_at desc)
  where provider_id is not null and provider_role is not null;
create index if not exists workout_sessions_client_workout_idx
  on public.workout_sessions (client_workout_id)
  where client_workout_id is not null;

create table if not exists public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  move_index integer not null default 0 check (move_index >= 0),
  move_name text not null,
  set_number integer not null check (set_number > 0),
  target_reps text,
  target_load text,
  started_at timestamptz,
  finished_at timestamptz,
  set_duration_seconds integer not null default 0 check (set_duration_seconds >= 0),
  rest_before_seconds integer check (rest_before_seconds is null or rest_before_seconds >= 0),
  completed boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workout_set_logs_session_idx
  on public.workout_set_logs (session_id, move_index, set_number);
create index if not exists workout_set_logs_client_idx
  on public.workout_set_logs (client_id, created_at desc);

create table if not exists public.workout_sensor_samples (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  provider text not null default 'shape_app'
    check (provider in ('shape_app','shape_session','apple_watch','apple_health','wear_os','whoop','garmin','strava','manual')),
  sample_type text not null
    check (sample_type in ('heart_rate','heart_rate_zone','calories','motion','cadence','power','strain','summary')),
  sampled_at timestamptz not null default now(),
  value numeric,
  unit text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workout_sensor_samples_session_idx
  on public.workout_sensor_samples (session_id, sampled_at asc);
create index if not exists workout_sensor_samples_client_idx
  on public.workout_sensor_samples (client_id, sampled_at desc);
create index if not exists workout_sensor_samples_provider_idx
  on public.workout_sensor_samples (provider, sample_type, sampled_at desc);

create table if not exists public.coach_workout_review_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  reviewer_id uuid not null references auth.users on delete cascade,
  provider_id bigint,
  provider_role text check (provider_role in ('trainer','nutritionist')),
  body text not null check (char_length(trim(body)) > 0),
  visibility text not null default 'client'
    check (visibility in ('client','coach_private','team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_workout_review_notes_session_idx
  on public.coach_workout_review_notes (session_id, created_at asc);
create index if not exists coach_workout_review_notes_reviewer_idx
  on public.coach_workout_review_notes (reviewer_id, created_at desc);

alter table public.workout_sessions enable row level security;
alter table public.workout_set_logs enable row level security;
alter table public.workout_sensor_samples enable row level security;
alter table public.coach_workout_review_notes enable row level security;

create or replace function public.can_access_workout_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workout_sessions ws
    where ws.id = p_session_id
      and (
        ws.client_id = auth.uid()
        or (
          ws.provider_role = 'trainer'
          and exists (
            select 1 from public.trainers t
            where t.id = ws.provider_id and t.owner_id = auth.uid()
          )
        )
        or (
          ws.provider_role = 'nutritionist'
          and exists (
            select 1 from public.nutritionists n
            where n.id = ws.provider_id and n.owner_id = auth.uid()
          )
        )
      )
  );
$$;

drop policy if exists "clients insert own workout sessions" on public.workout_sessions;
create policy "clients insert own workout sessions"
  on public.workout_sessions for insert
  to authenticated
  with check (client_id = auth.uid());

drop policy if exists "participants read workout sessions" on public.workout_sessions;
create policy "participants read workout sessions"
  on public.workout_sessions for select
  to authenticated
  using (public.can_access_workout_session(id));

drop policy if exists "clients update own active workout sessions" on public.workout_sessions;
create policy "clients update own active workout sessions"
  on public.workout_sessions for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists "clients insert own workout set logs" on public.workout_set_logs;
create policy "clients insert own workout set logs"
  on public.workout_set_logs for insert
  to authenticated
  with check (client_id = auth.uid() and public.can_access_workout_session(session_id));

drop policy if exists "participants read workout set logs" on public.workout_set_logs;
create policy "participants read workout set logs"
  on public.workout_set_logs for select
  to authenticated
  using (public.can_access_workout_session(session_id));

drop policy if exists "clients insert own workout sensor samples" on public.workout_sensor_samples;
create policy "clients insert own workout sensor samples"
  on public.workout_sensor_samples for insert
  to authenticated
  with check (client_id = auth.uid() and public.can_access_workout_session(session_id));

drop policy if exists "participants read workout sensor samples" on public.workout_sensor_samples;
create policy "participants read workout sensor samples"
  on public.workout_sensor_samples for select
  to authenticated
  using (public.can_access_workout_session(session_id));

drop policy if exists "participants read coach workout review notes" on public.coach_workout_review_notes;
create policy "participants read coach workout review notes"
  on public.coach_workout_review_notes for select
  to authenticated
  using (
    public.can_access_workout_session(session_id)
    and (
      visibility <> 'coach_private'
      or reviewer_id = auth.uid()
    )
  );

drop policy if exists "providers create workout review notes" on public.coach_workout_review_notes;
create policy "providers create workout review notes"
  on public.coach_workout_review_notes for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.can_access_workout_session(session_id)
    and (
      (
        provider_role = 'trainer'
        and exists (
          select 1 from public.trainers t
          where t.id = provider_id and t.owner_id = auth.uid()
        )
      )
      or (
        provider_role = 'nutritionist'
        and exists (
          select 1 from public.nutritionists n
          where n.id = provider_id and n.owner_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "reviewers update own workout review notes" on public.coach_workout_review_notes;
create policy "reviewers update own workout review notes"
  on public.coach_workout_review_notes for update
  to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

create or replace function public.workout_sessions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workout_sessions_touch_updated_at on public.workout_sessions;
create trigger workout_sessions_touch_updated_at
  before update on public.workout_sessions
  for each row execute function public.workout_sessions_set_updated_at();

create or replace function public.coach_workout_review_notes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_workout_review_notes_touch_updated_at on public.coach_workout_review_notes;
create trigger coach_workout_review_notes_touch_updated_at
  before update on public.coach_workout_review_notes
  for each row execute function public.coach_workout_review_notes_set_updated_at();
