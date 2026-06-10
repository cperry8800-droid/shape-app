-- Member playlists — every member can save Spotify / Apple Music playlists to
-- their profile library, mark them public, and share them with other members.
-- Public playlists are readable by anyone (they show on the owner's public
-- profile); private ones only by the owner. Idempotent — safe to re-run.

create table if not exists public.member_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'Playlist',
  provider text not null default 'spotify' check (provider in ('spotify','apple','other')),
  url text not null,
  cover text,
  track_count int,
  meta text,
  is_public boolean not null default true,
  saved_from uuid references auth.users on delete set null, -- set when saved from another member's public playlist
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists member_playlists_user_idx on public.member_playlists (user_id, sort, created_at desc);

alter table public.member_playlists enable row level security;

drop policy if exists "read public or own playlists" on public.member_playlists;
create policy "read public or own playlists"
  on public.member_playlists for select
  to anon, authenticated
  using (is_public = true or user_id = auth.uid());

drop policy if exists "insert own playlists" on public.member_playlists;
create policy "insert own playlists"
  on public.member_playlists for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update own playlists" on public.member_playlists;
create policy "update own playlists"
  on public.member_playlists for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete own playlists" on public.member_playlists;
create policy "delete own playlists"
  on public.member_playlists for delete
  to authenticated
  using (user_id = auth.uid());

-- A member's playlists as seen by a viewer: own → all; else only public ones
-- (and only when the profile itself isn't private). SECURITY DEFINER so the
-- visibility gate is consistent with get_public_profile.
create or replace function public.get_member_playlists(p_user_id uuid)
returns setof public.member_playlists
language sql stable security definer set search_path = public as $$
  select * from public.member_playlists mp
  where mp.user_id = p_user_id
    and (
      mp.user_id = auth.uid()
      or (mp.is_public = true and public.shape_profile_visibility(p_user_id) <> 'private')
    )
  order by mp.sort, mp.created_at desc;
$$;

grant execute on function public.get_member_playlists(uuid) to anon, authenticated;
