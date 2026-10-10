-- Nora's library: the songs her DJ sets on Shape Radio are built from (owner, 2026-10-10: "once i
-- upload a playlist she will be able to dj herself"; the songs are by real artists, played under
-- the station's own licences, and the station streams from radio.co).
--
-- The owner uploads the files on /dashboard/radio. The browser measures each song as it uploads
-- (tempo and beat grid, key, energy, where the music starts, fades and can be mixed) and the
-- server keeps that analysis beside the file. Nora's set planner reads the rows; her mixing engine
-- reads the files. LISTENERS NEVER GET A FILE: they hear the stream. So nothing here is readable by
-- anon or authenticated, the bucket is private, and every read and write goes through the service
-- role (the admin routes, the planner, the engine's token-gated route).
--
-- Dated 2026-10-11 on purpose: the 2026-10-10 definer capture records the one file dated that
-- day, and a second one would make its capture-day record ambiguous. This file creates no
-- function, so the definer audit has nothing to read in it either way. Idempotent.

-- ── The files ──────────────────────────────────────────────────────────────────────────────
-- Private · audio types only · 60 MB (five minutes of 16-bit stereo WAV is ~53 MB). Uploads use a
-- signed upload URL the admin route issues, so no storage.objects policy is needed or wanted:
-- with none, anon and authenticated can neither list, read nor write this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'radio-library', 'radio-library', false, 62914560,
  array['audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/flac','audio/ogg']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 62914560,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── The songs ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.radio_tracks (
  id            uuid primary key default gen_random_uuid(),
  storage_path  text not null unique check (storage_path ~ '^tracks/[0-9a-f-]{36}\.(mp3|m4a|aac|wav|flac|ogg)$'),
  sha256        text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name     text not null check (length(file_name) between 1 and 255),
  mime          text not null,
  size_bytes    bigint not null check (size_bytes between 1 and 62914560),
  -- What a SoundExchange report names: the featured artist, the recording's title, the album,
  -- the label and the ISRC. Title and artist are required; the rest are filled when known.
  title         text not null check (btrim(title) <> '' and length(title) <= 200),
  artist        text not null check (btrim(artist) <> '' and length(artist) <= 200),
  album         text check (album is null or length(album) <= 200),
  label         text check (label is null or length(label) <= 200),
  isrc          text check (isrc is null or isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  duration_sec  numeric not null check (duration_sec > 0 and duration_sec <= 1800),
  -- The analysis, as columns where the planner filters or sorts, and whole in `analysis`.
  -- bpm is NULL when no steady beat was measured; such a song is faded in and out, never
  -- beat-matched.
  bpm           numeric check (bpm is null or bpm between 60 and 200),
  camelot       text check (camelot is null or camelot ~ '^(1[0-2]|[1-9])[AB]$'),
  intensity     numeric check (intensity is null or intensity between 0 and 1),
  loudness_db   numeric check (loudness_db is null or loudness_db between -70 and 0),
  analysis      jsonb,
  -- pending: the row exists and the upload has not been confirmed in storage. ready: confirmed
  -- and analysed. Only ready, enabled songs are ever planned.
  status        text not null default 'pending' check (status in ('pending', 'ready')),
  enabled       boolean not null default true,
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status = 'pending' or analysis is not null)
);

alter table public.radio_tracks enable row level security;

-- No policy for anon or authenticated, on purpose: the library is the owner's, through the
-- service role only. Revoked from every role by name (PUBLIC included), granted to the
-- service role by name rather than relying on default grants.
revoke all on table public.radio_tracks from public, anon, authenticated;
grant select, insert, update, delete on table public.radio_tracks to service_role;

create index if not exists radio_tracks_ready_idx on public.radio_tracks (status, enabled);
