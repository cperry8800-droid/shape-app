-- Shape Radio rooms.
-- Live scheduled/audio rooms shared by trainer and nutritionist community pages.
-- Idempotent, safe to re-run.

create table if not exists public.radio_rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  host_user_id uuid references auth.users on delete set null,
  host_role text not null default 'trainer'
    check (host_role in ('trainer','nutritionist','client','admin')),
  host_name text not null default 'Shape coach',
  topic text not null check (char_length(trim(topic)) > 0),
  description text,
  scheduled_at timestamptz not null,
  audience text not null default 'clients_coaches'
    check (audience in ('clients_coaches','clients_only','coaches_only','public_shape')),
  status text not null default 'scheduled'
    check (status in ('scheduled','live','ended','cancelled')),
  room_url text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists radio_rooms_status_scheduled_idx
  on public.radio_rooms (status, scheduled_at);
create index if not exists radio_rooms_host_idx
  on public.radio_rooms (host_user_id, scheduled_at desc);
create index if not exists radio_rooms_role_scheduled_idx
  on public.radio_rooms (host_role, scheduled_at);

alter table public.radio_rooms enable row level security;

drop policy if exists "read visible radio rooms" on public.radio_rooms;
create policy "read visible radio rooms"
  on public.radio_rooms for select
  to anon, authenticated
  using (status <> 'cancelled');

drop policy if exists "users create own radio rooms" on public.radio_rooms;
create policy "users create own radio rooms"
  on public.radio_rooms for insert
  to authenticated
  with check (host_user_id = auth.uid());

drop policy if exists "hosts update own radio rooms" on public.radio_rooms;
create policy "hosts update own radio rooms"
  on public.radio_rooms for update
  to authenticated
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid());

drop policy if exists "hosts delete own radio rooms" on public.radio_rooms;
create policy "hosts delete own radio rooms"
  on public.radio_rooms for delete
  to authenticated
  using (host_user_id = auth.uid());

create or replace function public.radio_rooms_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists radio_rooms_touch_updated_at on public.radio_rooms;
create trigger radio_rooms_touch_updated_at
  before update on public.radio_rooms
  for each row execute function public.radio_rooms_set_updated_at();
