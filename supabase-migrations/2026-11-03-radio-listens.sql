-- Shape Radio's listening sessions on Shape's own station (part 4 of Shape's own radio; owner,
-- 2026-11-03: "Compliance requires a per-performance count for every play - build that").
--
-- The station server (services/station, Icecast's url auth) tells Shape through /api/radio/pass
-- as each listener joins and leaves. Each row is one listener's session: the station's own record
-- of who was connected, and when. The SoundExchange report counts, for every play, the sessions
-- that heard any part of it (its performances), and the month's listening hours
-- (src/lib/radio/listens.mjs).
--
--   boot, boot_at  which start of the station server the session belongs to (its container writes a
--                  new one at each start). A session whose end never arrived (the server crashed, or
--                  Shape was out of reach as it ended) ended, at the latest, when the station started
--                  again.
--   client         Icecast's number for the connection, unique within one boot.
--   started_at     when the station let the listener in (Shape's clock).
--   ended_at       when the station said they left (Shape's clock); null while they listen.
--   duration_sec   the length Icecast measured.
--
-- ⚠ NO ACCOUNT, NO ADDRESS. A row holds only the station's own numbers and times. Nothing ties a
-- row to a member: the licence report needs counts, not people.
--
-- Written and read only as the service role (the door route and the admin report). No anon or
-- member access, no function. Builds on 2026-11-03-radio-rotation.sql. Idempotent.

create table if not exists public.radio_listens (
  id           bigint generated always as identity primary key,
  boot         text not null check (boot ~ '^[0-9]{9,11}\.[0-9a-f]{16}$'),
  boot_at      timestamptz not null,
  client       bigint not null check (client >= 0),
  started_at   timestamptz not null,
  ended_at     timestamptz,
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  constraint radio_listens_order check (ended_at is null or ended_at >= started_at),
  constraint radio_listens_one_per_connection unique (boot, client)
);
alter table public.radio_listens enable row level security;
revoke all on table public.radio_listens from public, anon, authenticated;
grant select, insert, update, delete on table public.radio_listens to service_role;
grant usage, select on sequence public.radio_listens_id_seq to service_role;

create index if not exists radio_listens_started_idx on public.radio_listens (started_at);
create index if not exists radio_listens_ended_idx on public.radio_listens (ended_at);
create index if not exists radio_listens_boot_at_idx on public.radio_listens (boot_at);
