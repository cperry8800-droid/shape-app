-- Provider applications (trainer / nutritionist).
-- Called by src/app/api/apply/route.ts from signup-trainer.html and
-- signup-nutritionist.html. Core identifying columns are top-level so they're
-- queryable; the rest of the long intake payload goes into the details JSONB
-- so we can extend the form without a schema change.
--
-- Idempotent, safe to re-run.

create table if not exists public.provider_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_type text not null check (provider_type in ('trainer','nutritionist')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  location text,
  specialty text,
  years_experience text,
  monthly_price text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','in_review','approved','rejected','withdrawn')),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  user_agent text
);

create index if not exists provider_applications_status_idx
  on public.provider_applications (status, created_at desc);
create index if not exists provider_applications_type_idx
  on public.provider_applications (provider_type, created_at desc);
create index if not exists provider_applications_email_idx
  on public.provider_applications (email);

-- Keep updated_at current.
create or replace function public.provider_applications_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists provider_applications_touch on public.provider_applications;
create trigger provider_applications_touch
  before update on public.provider_applications
  for each row execute function public.provider_applications_touch_updated_at();

alter table public.provider_applications enable row level security;

-- Anonymous users may insert (submit the form); reads happen server-side
-- from the admin dashboard via the service role.
drop policy if exists "anon_insert_provider_applications" on public.provider_applications;
create policy "anon_insert_provider_applications"
  on public.provider_applications for insert
  to anon, authenticated
  with check (true);

-- Applicants may read their own pending application by email (future
-- "application status" page). No policy for now — enable when needed.

-- ===== client_intakes =====
-- Stores the onboarding questionnaire filled out at signup (goals, experience,
-- injuries, diet, etc.). One row per client, keyed to their auth.users id.
-- Called by src/app/api/intake/route.ts from signup-client.html.

create table if not exists public.client_intakes (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_name text,
  last_name text,
  dob date,
  sex text,
  primary_goal text,
  experience_level text,
  workout_frequency text,
  injuries text,
  medical text,
  dietary text,
  emergency_contact text,
  accountability_style text,
  interests text,
  budget text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists client_intakes_primary_goal_idx
  on public.client_intakes (primary_goal);

create or replace function public.client_intakes_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_intakes_touch on public.client_intakes;
create trigger client_intakes_touch
  before update on public.client_intakes
  for each row execute function public.client_intakes_touch_updated_at();

alter table public.client_intakes enable row level security;

-- A logged-in user can insert, read, and update only their own intake row.
drop policy if exists "users_insert_own_intake" on public.client_intakes;
create policy "users_insert_own_intake"
  on public.client_intakes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users_read_own_intake" on public.client_intakes;
create policy "users_read_own_intake"
  on public.client_intakes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "users_update_own_intake" on public.client_intakes;
create policy "users_update_own_intake"
  on public.client_intakes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
