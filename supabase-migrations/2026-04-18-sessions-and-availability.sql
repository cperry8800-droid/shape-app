-- Sessions + weekly availability for consultations / bookings.
-- Replaces the older `consultation_bookings` placeholder table with a
-- real sessions model keyed to the trainer/nutritionist row.
--
-- Called by:
--   src/app/api/consultation/route.ts          (client books)
--   src/app/dashboard/availability/actions.ts  (coach sets slots)
--   src/lib/queries.ts#getMySessions           (dashboard render)
--
-- Idempotent, safe to re-run.

-- ===== sessions =====

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid references auth.users on delete set null,
  client_name text not null,
  client_email text not null,
  provider_id bigint not null,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  type text not null default 'video' check (type in ('video','phone','inperson','message')),
  scheduled_at timestamptz not null,
  duration_min integer not null default 15,
  status text not null default 'requested'
    check (status in ('requested','confirmed','declined','completed','cancelled')),
  meeting_url text,
  client_phone text,
  topic text,
  notes text
);

create index if not exists sessions_provider_idx
  on public.sessions (provider_role, provider_id, scheduled_at);
create index if not exists sessions_client_idx
  on public.sessions (client_id, scheduled_at desc);
create index if not exists sessions_scheduled_idx
  on public.sessions (scheduled_at);

-- Prevent a coach from being double-booked for the same timestamp.
create unique index if not exists sessions_no_conflict_idx
  on public.sessions (provider_role, provider_id, scheduled_at)
  where status in ('requested','confirmed');

alter table public.sessions enable row level security;

-- Anyone (including anon visitors on /consultation.html) may insert a
-- requested session. The API route validates fields before forwarding.
drop policy if exists "anon_insert_sessions" on public.sessions;
create policy "anon_insert_sessions"
  on public.sessions for insert
  to anon, authenticated
  with check (status = 'requested');

-- Clients see their own sessions; providers see sessions booked against them.
drop policy if exists "read_own_sessions" on public.sessions;
create policy "read_own_sessions"
  on public.sessions for select
  to authenticated
  using (
    client_id = auth.uid()
    or (
      provider_role = 'trainer' and exists (
        select 1 from public.trainers t
        where t.id = sessions.provider_id and t.owner_id = auth.uid()
      )
    )
    or (
      provider_role = 'nutritionist' and exists (
        select 1 from public.nutritionists n
        where n.id = sessions.provider_id and n.owner_id = auth.uid()
      )
    )
  );

-- Provider may update status / meeting_url / notes on their own sessions.
drop policy if exists "provider_update_sessions" on public.sessions;
create policy "provider_update_sessions"
  on public.sessions for update
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = sessions.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = sessions.provider_id and n.owner_id = auth.uid()
    ))
  )
  with check (true);

-- Client may cancel their own request.
drop policy if exists "client_cancel_sessions" on public.sessions;
create policy "client_cancel_sessions"
  on public.sessions for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- ===== provider_availability =====
-- Weekly recurring slots. One row per (provider, weekday, start_minute).
-- weekday: 0 = Sunday, 6 = Saturday.
-- start_minute: minutes since midnight in the coach's local day (0–1439).
-- duration_min: slot length (15 or 30 typical).
--
-- Client UI generates the next 14 days of concrete slots by projecting
-- these rows against each date.

create table if not exists public.provider_availability (
  id uuid primary key default gen_random_uuid(),
  provider_id bigint not null,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  weekday smallint not null check (weekday between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  duration_min integer not null default 15,
  created_at timestamptz not null default now(),
  unique (provider_role, provider_id, weekday, start_minute)
);

create index if not exists provider_availability_lookup_idx
  on public.provider_availability (provider_role, provider_id, weekday);

alter table public.provider_availability enable row level security;

-- Public read — so the consultation page can render real slots without
-- forcing anon visitors to sign in.
drop policy if exists "public_read_availability" on public.provider_availability;
create policy "public_read_availability"
  on public.provider_availability for select
  to anon, authenticated
  using (true);

-- Only the owning provider can write their own slots.
drop policy if exists "provider_write_availability" on public.provider_availability;
create policy "provider_write_availability"
  on public.provider_availability for all
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = provider_availability.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = provider_availability.provider_id and n.owner_id = auth.uid()
    ))
  )
  with check (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = provider_availability.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = provider_availability.provider_id and n.owner_id = auth.uid()
    ))
  );

-- Touch updated_at on session updates.
create or replace function public.sessions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_touch_updated_at on public.sessions;
create trigger sessions_touch_updated_at
  before update on public.sessions
  for each row execute function public.sessions_set_updated_at();
