-- Client profile data — the long-form "me" page fields that clients fill out
-- on /client-profile.html (basic info, fitness goals, metrics, nutrition,
-- social links, privacy/visibility/messaging preferences, macro splits, tags).
--
-- Stored as a single JSONB column rather than columns per field so the form
-- can evolve without migrations. Each row is one-to-one with a user.
--
-- Idempotent, safe to re-run.

create table if not exists public.client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.client_profiles enable row level security;

-- A user can read their own client profile.
drop policy if exists "client_profiles_read_own" on public.client_profiles;
create policy "client_profiles_read_own"
  on public.client_profiles for select
  to authenticated
  using (user_id = auth.uid());

-- A user can insert their own client profile (first save).
drop policy if exists "client_profiles_insert_own" on public.client_profiles;
create policy "client_profiles_insert_own"
  on public.client_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

-- A user can update their own client profile.
drop policy if exists "client_profiles_update_own" on public.client_profiles;
create policy "client_profiles_update_own"
  on public.client_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.client_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_profiles_touch_updated_at on public.client_profiles;
create trigger client_profiles_touch_updated_at
  before update on public.client_profiles
  for each row execute function public.client_profiles_set_updated_at();
