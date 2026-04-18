-- Trainer-curated Spotify playlists delivered via Shape Radio.
-- Trainers create playlists from their dashboard; any authenticated user
-- can view them (a Spotify playlist URL is public info — no need to gate
-- by subscription for v1).
--
-- Idempotent, safe to re-run.

create table if not exists public.trainer_playlists (
  id uuid primary key default gen_random_uuid(),
  trainer_id bigint not null,
  workout_id bigint,
  title text not null,
  description text,
  spotify_playlist_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trainer_playlists_trainer_idx
  on public.trainer_playlists (trainer_id, created_at desc);
create index if not exists trainer_playlists_workout_idx
  on public.trainer_playlists (workout_id)
  where workout_id is not null;

alter table public.trainer_playlists enable row level security;

-- Public read — Spotify playlist URLs are already public.
drop policy if exists "public_read_trainer_playlists" on public.trainer_playlists;
create policy "public_read_trainer_playlists"
  on public.trainer_playlists for select
  to anon, authenticated
  using (true);

-- Only the trainer who owns the trainer row can write their own playlists.
drop policy if exists "trainer_write_own_playlists" on public.trainer_playlists;
create policy "trainer_write_own_playlists"
  on public.trainer_playlists for all
  to authenticated
  using (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_playlists.trainer_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_playlists.trainer_id and t.owner_id = auth.uid()
    )
  );

create or replace function public.trainer_playlists_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trainer_playlists_touch_updated_at on public.trainer_playlists;
create trigger trainer_playlists_touch_updated_at
  before update on public.trainer_playlists
  for each row execute function public.trainer_playlists_set_updated_at();
