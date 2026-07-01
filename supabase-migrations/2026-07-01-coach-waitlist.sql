-- Per-coach waiting list. When a coach is at_capacity, signed-in members join
-- to be first in line; the coach invites them back with first-dibs booking.
-- Idempotent, safe to re-run.

create table if not exists public.coach_waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  client_id uuid not null references auth.users on delete cascade,
  note text,
  status text not null default 'waiting'
    check (status in ('waiting','invited','booked','declined','left')),
  invited_at timestamptz,
  responded_at timestamptz,
  invite_expires_at timestamptz
);

-- One ACTIVE spot per client per coach (waiting or invited).
create unique index if not exists coach_waitlist_active_uniq
  on public.coach_waitlist (provider_role, provider_id, client_id)
  where status in ('waiting','invited');

-- Coach-room listing + FIFO ordering.
create index if not exists coach_waitlist_provider_idx
  on public.coach_waitlist (provider_role, provider_id, status, created_at);

-- "My waitlists" lookup.
create index if not exists coach_waitlist_client_idx
  on public.coach_waitlist (client_id, status);

alter table public.coach_waitlist enable row level security;

-- Defense-in-depth: a client may read only their own rows. All writes and the
-- coach-room read go through the service-role API with explicit auth checks.
drop policy if exists "clients read own waitlist" on public.coach_waitlist;
create policy "clients read own waitlist" on public.coach_waitlist
  for select using (auth.uid() = client_id);
