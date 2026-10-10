-- Nora's engine's log (services/nora-engine): each set it started, ended or had to stop, and each
-- song it played. The 'song' rows are the station's play record for Nora's sets, the source of the
-- monthly SoundExchange report of use (/api/admin/radio/plays), so each copies the song's title,
-- artist, album, label and ISRC as they were when it played: a song deleted later still reports.
--
-- Written only by the engine's token-gated route as the service role; read only by the admin
-- dashboard. No anon or member access, no function (nothing for the definer audit). Builds on
-- 2026-10-11-nora-dj-sets.sql. Idempotent.

create table if not exists public.nora_engine_log (
  id         bigint generated always as identity primary key,
  set_id     uuid references public.nora_sets(id) on delete set null,
  event      text not null check (event in ('started', 'song', 'ended', 'failed')),
  track_id   uuid references public.radio_tracks(id) on delete set null,
  played_at  timestamptz not null,
  title      text,
  artist     text,
  album      text,
  label      text,
  isrc       text,
  detail     text check (detail is null or length(detail) <= 300),
  logged_at  timestamptz not null default now(),
  check (event <> 'song' or (title is not null and artist is not null))
);
alter table public.nora_engine_log enable row level security;
revoke all on table public.nora_engine_log from public, anon, authenticated;
grant select, insert, update, delete on table public.nora_engine_log to service_role;
grant usage, select on sequence public.nora_engine_log_id_seq to service_role;

create index if not exists nora_engine_log_plays_idx on public.nora_engine_log (event, played_at);
create index if not exists nora_engine_log_set_idx on public.nora_engine_log (set_id, logged_at desc);
