-- Coach soundtracks — saved Spotify/Apple playlists a coach can attach to
-- workouts / programs / meal plans. Shared by the mobile Soundtracks page and
-- the website Playlists page so the two stay in sync.
--
-- Owner-scoped (each coach sees only their own). Attachments ride in a jsonb
-- array of { id, kind, name } so we don't need a join table. Idempotent.

create table if not exists public.coach_soundtracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  provider text not null default 'spotify' check (provider in ('spotify', 'apple')),
  tag text,
  url text,
  tracks integer not null default 0,
  duration text,
  bpm text,
  attached jsonb not null default '[]'::jsonb,   -- [{ id, kind, name }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_soundtracks_owner_idx
  on public.coach_soundtracks (owner_id, created_at desc);

alter table public.coach_soundtracks enable row level security;

drop policy if exists "soundtracks_owner_all" on public.coach_soundtracks;
create policy "soundtracks_owner_all" on public.coach_soundtracks for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.coach_soundtracks_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists coach_soundtracks_touch on public.coach_soundtracks;
create trigger coach_soundtracks_touch
  before update on public.coach_soundtracks
  for each row execute function public.coach_soundtracks_touch_updated_at();
