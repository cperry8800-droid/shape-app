-- The check-in kit: girth measurements · progress photos · weekly check-ins ·
-- health-profile coach read. One migration for the three coaching-standard
-- tracking gaps (research 2026-06-12): measurements + structured progress
-- photos, the weekly check-in form, and intake/PAR-Q screening visibility.
-- Reuses is_coach_on_client(uuid) from 2026-05-26-shared-clients.sql. Idempotent.

-- ── 1) Girth measurements ────────────────────────────────────────────────────
-- One row per (user, day, site). Sites follow the ACE core protocol
-- (waist · hips · chest · arm · thigh · calf, + neck/shoulders optional).
create table if not exists public.client_measurements (
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  site text not null check (site in ('waist','hips','chest','arm','thigh','calf','neck','shoulders')),
  value numeric not null check (value > 0 and value < 500),
  unit text not null default 'cm' check (unit in ('cm','in')),
  created_at timestamptz not null default now(),
  primary key (user_id, measured_on, site)
);
alter table public.client_measurements enable row level security;

drop policy if exists "measurements owner all" on public.client_measurements;
create policy "measurements owner all" on public.client_measurements
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "measurements coach read" on public.client_measurements;
create policy "measurements coach read" on public.client_measurements
  for select to authenticated
  using (public.is_coach_on_client(user_id));

-- ── 2) Progress photos ───────────────────────────────────────────────────────
-- Structured front/side/back photos, date-stamped. Files live in the PRIVATE
-- progress-photos bucket (uploaded server-side via /api/client/progress-photos,
-- which stores a long-lived signed URL on the row so client + coach render it).
create table if not exists public.client_progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_on date not null default current_date,
  pose text not null default 'front' check (pose in ('front','side','back')),
  url text not null,
  storage_path text,
  created_at timestamptz not null default now()
);
create index if not exists client_progress_photos_user_idx
  on public.client_progress_photos (user_id, taken_on desc);
alter table public.client_progress_photos enable row level security;

drop policy if exists "progress photos owner all" on public.client_progress_photos;
create policy "progress photos owner all" on public.client_progress_photos
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "progress photos coach read" on public.client_progress_photos;
create policy "progress photos coach read" on public.client_progress_photos
  for select to authenticated
  using (public.is_coach_on_client(user_id));

-- Private storage bucket (15 MB, images). Uploads happen service-role via the
-- API route, so no client storage policies are needed beyond denying public read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 15728640,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 3) Weekly check-ins ──────────────────────────────────────────────────────
-- One per (user, week). Ratings ride in one jsonb (1–10 ints):
-- { trainingAdherence, nutritionAdherence, sleep, energy, stress, hunger }.
create table if not exists public.client_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_of date not null,                -- Monday of the check-in week
  ratings jsonb not null default '{}'::jsonb,
  wins text,
  struggles text,
  question text,
  weight numeric,
  unit text default 'kg' check (unit in ('kg','lb')),
  created_at timestamptz not null default now(),
  primary key (user_id, week_of)
);
alter table public.client_checkins enable row level security;

drop policy if exists "checkins owner all" on public.client_checkins;
create policy "checkins owner all" on public.client_checkins
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "checkins coach read" on public.client_checkins;
create policy "checkins coach read" on public.client_checkins
  for select to authenticated
  using (public.is_coach_on_client(user_id));

-- ── 4) Coach reads (RPCs) ────────────────────────────────────────────────────
-- Latest check-ins for a linked client (coach-side client profile).
create or replace function public.get_client_checkins(p_user_id uuid, p_limit int default 6)
returns setof public.client_checkins
language sql security definer set search_path = public as $$
  select c.* from public.client_checkins c
  where c.user_id = p_user_id and public.is_coach_on_client(p_user_id)
  order by c.week_of desc
  limit greatest(1, least(coalesce(p_limit, 6), 26));
$$;
grant execute on function public.get_client_checkins(uuid, int) to authenticated;

-- Latest measurement per site for a linked client.
create or replace function public.get_client_measurements(p_user_id uuid)
returns setof public.client_measurements
language sql security definer set search_path = public as $$
  select distinct on (m.site) m.*
  from public.client_measurements m
  where m.user_id = p_user_id and public.is_coach_on_client(p_user_id)
  order by m.site, m.measured_on desc;
$$;
grant execute on function public.get_client_measurements(uuid) to authenticated;

-- Progress photos for a linked client (rows carry long-lived signed URLs).
create or replace function public.get_client_progress_photos(p_user_id uuid, p_limit int default 30)
returns setof public.client_progress_photos
language sql security definer set search_path = public as $$
  select p.* from public.client_progress_photos p
  where p.user_id = p_user_id and public.is_coach_on_client(p_user_id)
  order by p.taken_on desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 120));
$$;
grant execute on function public.get_client_progress_photos(uuid, int) to authenticated;

-- Health profile (PAR-Q+ screening, injuries, medications) — stored by the app
-- in user_goals(kind 'health_profile'). DELIBERATELY not share-gated: a linked
-- coach always sees it (the liability screen is the point). Returns null when
-- the caller isn't a coach on this client or nothing is stored.
create or replace function public.get_client_health_profile(p_user_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select g.data from public.user_goals g
  where g.user_id = p_user_id
    and g.kind = 'health_profile'
    and public.is_coach_on_client(p_user_id)
  limit 1;
$$;
grant execute on function public.get_client_health_profile(uuid) to authenticated;
