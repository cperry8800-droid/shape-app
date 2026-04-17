-- Launch readiness — tables for contact form and consultation booking.
-- Called by src/app/api/contact/route.ts and src/app/api/consultation/route.ts.
-- Idempotent, safe to re-run.

-- ===== contact_submissions =====

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  user_agent text,
  status text not null default 'new'
);

create index if not exists contact_submissions_created_at_idx
  on public.contact_submissions (created_at desc);
create index if not exists contact_submissions_status_idx
  on public.contact_submissions (status);

alter table public.contact_submissions enable row level security;

-- Anonymous users may insert (submit the form); nobody may read via the
-- anon key — reads happen from the service role via an admin dashboard.
drop policy if exists "anon_insert_contact_submissions" on public.contact_submissions;
create policy "anon_insert_contact_submissions"
  on public.contact_submissions for insert
  to anon, authenticated
  with check (true);

-- ===== consultation_bookings =====

create table if not exists public.consultation_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  professional_name text not null,
  professional_type text not null check (professional_type in ('trainer','nutritionist')),
  scheduled_date date not null,
  scheduled_time text not null,
  client_name text not null,
  client_email text not null,
  topic text,
  status text not null default 'pending'
);

create index if not exists consultation_bookings_scheduled_idx
  on public.consultation_bookings (scheduled_date, scheduled_time);
create index if not exists consultation_bookings_client_email_idx
  on public.consultation_bookings (client_email);

alter table public.consultation_bookings enable row level security;

drop policy if exists "anon_insert_consultation_bookings" on public.consultation_bookings;
create policy "anon_insert_consultation_bookings"
  on public.consultation_bookings for insert
  to anon, authenticated
  with check (true);

-- Clients may read their own bookings by matching email (useful for a
-- "my bookings" page later). No policy for now — enable when needed.
