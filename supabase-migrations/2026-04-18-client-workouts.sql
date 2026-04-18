-- Client-assigned workouts.
-- Trainers build a workout in /trainer-dashboard.html, assign it to a client,
-- and publish. Clients see their assigned workouts on /my-workouts.html and
-- open the detail view at /workout.html?id=X with an optional Spotify playlist
-- embed rendered at the top.
--
-- Structure (exercises, warmup, cooldown, etc.) is stored as JSONB so the
-- trainer-dashboard builder keeps full flexibility without schema churn.
--
-- Idempotent, safe to re-run.

create table if not exists public.client_workouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id bigint not null,
  client_id uuid not null,
  title text not null,
  description text,
  kind text not null check (kind in ('template','custom')),
  payload jsonb not null default '{}'::jsonb,
  playlist_id uuid references public.trainer_playlists(id) on delete set null,
  status text not null default 'published' check (status in ('published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_workouts_client_idx
  on public.client_workouts (client_id, created_at desc);
create index if not exists client_workouts_trainer_idx
  on public.client_workouts (trainer_id, created_at desc);

alter table public.client_workouts enable row level security;

-- Trainers who own the trainer row may CRUD their own assignments.
drop policy if exists "trainer_write_own_client_workouts" on public.client_workouts;
create policy "trainer_write_own_client_workouts"
  on public.client_workouts for all
  to authenticated
  using (
    exists (
      select 1 from public.trainers t
      where t.id = client_workouts.trainer_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trainers t
      where t.id = client_workouts.trainer_id and t.owner_id = auth.uid()
    )
  );

-- Clients may read workouts assigned to them.
drop policy if exists "client_read_own_client_workouts" on public.client_workouts;
create policy "client_read_own_client_workouts"
  on public.client_workouts for select
  to authenticated
  using (client_id = auth.uid());

create or replace function public.client_workouts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_workouts_touch_updated_at on public.client_workouts;
create trigger client_workouts_touch_updated_at
  before update on public.client_workouts
  for each row execute function public.client_workouts_set_updated_at();

-- Trainers (and nutritionists) need to list their active subscribers so the
-- workout-builder assign dropdown can show real names instead of a static
-- fake list. Extend client_intakes RLS to allow that narrow read.
drop policy if exists "providers_read_subscriber_intakes" on public.client_intakes;
create policy "providers_read_subscriber_intakes"
  on public.client_intakes for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = client_intakes.user_id
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );
