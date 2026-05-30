-- Per-user calendar events — the shared backing store for the website
-- (newdesign CalendarOverlay) and the mobile app (BSCalendarScreen). Both
-- front-ends read/write the same rows via /api/calendar, so they stay in sync.
--
-- An event belongs to a user (user_id). It may be created by that user OR by a
-- coach who has an active subscription to them (created_by + created_by_role),
-- e.g. a trainer scheduling a workout on a client's Tuesday.
--
-- Coaching SESSIONS (the sessions table) are NOT duplicated here — the API
-- merges them in read-only. This table is for everything else: planned
-- workouts, meals, check-ins, reminders, rest days, milestones, etc.
--
-- Reuses is_coach_on_client(uuid) from 2026-05-26-shared-clients.sql.
-- Idempotent, safe to re-run.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_by uuid references auth.users on delete set null,
  created_by_role text not null default 'self'
    check (created_by_role in ('self','trainer','nutritionist')),
  -- WORKOUT | MEAL | CHECKIN | SESSION | CONSULT | REVIEW | PLAN | ADMIN | REST
  kind text not null default 'ADMIN',
  title text not null,
  sub text,
  event_date date not null,
  event_time text,                 -- 'HH:MM' (24h) or null for all-day
  duration_min integer,
  with_name text,                  -- "with" — coach/partner display name
  location text,
  accent text,                     -- optional UI color hint
  status text not null default 'planned'
    check (status in ('planned','done','skipped','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_user_date_idx
  on public.calendar_events (user_id, event_date);
create index if not exists calendar_events_creator_idx
  on public.calendar_events (created_by, event_date);

alter table public.calendar_events enable row level security;

-- ===== Read: the owner, or a coach active on the owner =====
drop policy if exists "calendar_events_read" on public.calendar_events;
create policy "calendar_events_read"
  on public.calendar_events for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_coach_on_client(user_id)
  );

-- ===== Insert: on your own calendar, or on an active client's =====
-- created_by must be the caller; created_by_role distinguishes self vs coach.
drop policy if exists "calendar_events_insert" on public.calendar_events;
create policy "calendar_events_insert"
  on public.calendar_events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      user_id = auth.uid()
      or public.is_coach_on_client(user_id)
    )
  );

-- ===== Update: the owner, or a coach active on the owner =====
drop policy if exists "calendar_events_update" on public.calendar_events;
create policy "calendar_events_update"
  on public.calendar_events for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_coach_on_client(user_id)
  )
  with check (
    user_id = auth.uid()
    or public.is_coach_on_client(user_id)
  );

-- ===== Delete: the owner, or the coach who created the event =====
-- (a coach can remove what they added; the owner can remove anything on theirs)
drop policy if exists "calendar_events_delete" on public.calendar_events;
create policy "calendar_events_delete"
  on public.calendar_events for delete
  to authenticated
  using (
    user_id = auth.uid()
    or (created_by = auth.uid() and public.is_coach_on_client(user_id))
  );

-- touch updated_at
create or replace function public.calendar_events_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calendar_events_touch on public.calendar_events;
create trigger calendar_events_touch
  before update on public.calendar_events
  for each row execute function public.calendar_events_touch_updated_at();
