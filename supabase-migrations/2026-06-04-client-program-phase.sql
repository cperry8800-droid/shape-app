-- Per-client program phase (training block + nutrition phase) — the source of
-- truth behind the Home/Eat/Train eyebrows. Stored here (not user_goals, which
-- is self-only) so a client's coach can READ and SET it for their clients.
--
-- Reuses is_coach_on_client(uuid) from 2026-05-26-shared-clients.sql.
-- Idempotent, safe to re-run.

create table if not exists public.client_programs (
  user_id uuid primary key references auth.users on delete cascade,
  training_phase text,
  nutrition_phase text,
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.client_programs enable row level security;

-- The client owns their row (read + write).
drop policy if exists "client_program_self" on public.client_programs;
create policy "client_program_self"
  on public.client_programs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A coach with an active subscription to the client can read it.
drop policy if exists "client_program_coach_read" on public.client_programs;
create policy "client_program_coach_read"
  on public.client_programs for select
  to authenticated
  using (public.is_coach_on_client(user_id));

-- …and set/update it (e.g. moving a client from Build → Peak).
drop policy if exists "client_program_coach_insert" on public.client_programs;
create policy "client_program_coach_insert"
  on public.client_programs for insert
  to authenticated
  with check (public.is_coach_on_client(user_id));

drop policy if exists "client_program_coach_update" on public.client_programs;
create policy "client_program_coach_update"
  on public.client_programs for update
  to authenticated
  using (public.is_coach_on_client(user_id))
  with check (public.is_coach_on_client(user_id));
