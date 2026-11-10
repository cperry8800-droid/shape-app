-- Shape Radio plays only for the account listening, on its own paid membership (owner, 2026-11-10:
-- "i dont want any pass giving any access to shape radio, you can only access shape radio if you
-- have your own login with a your own paid membership").
--
-- WHAT THIS ADDS. Two service-role tables the radio routes keep (src/lib/radio/streams.mjs):
--
--   radio_streams      one row per stream a member starts: /api/radio/listen opens it, from the
--                      member's 90-second start code, and the station ticket names its id (never
--                      the member). The door (/api/radio/pass) reads the account from it.
--   radio_connections  one row per connection the station has open for an account: written as the
--                      station lets a listener in, deleted as it says they left. One account plays
--                      on one device: a newer connection marks the older ones to be dropped, and so
--                      does a membership that ends or goes past due (/api/radio/kicks, which the
--                      station's door service polls and acts on with Icecast's killclient).
--
-- ⚠ AN ACCOUNT IS KEPT HERE ONLY WHILE IT LISTENS. radio_listens (2026-11-03) holds no account, and
-- that stays so: a connection's row goes when the station says the listener left (or when a newer
-- start of the station is seen, or ten minutes after a drop that was never confirmed), and a
-- stream's row a day after it was opened. Neither table is readable by anon or authenticated.
--
-- Idempotent, one transaction, lock_timeout 10 s.

begin;
set local lock_timeout = '10s';

create table if not exists public.radio_streams (
  stream_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  opened_at timestamptz not null default now()
);
create index if not exists radio_streams_opened_idx on public.radio_streams (opened_at);

create table if not exists public.radio_connections (
  boot text not null,
  client bigint not null,
  stream_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  connected_at timestamptz not null default now(),
  -- When this account's paid membership was last confirmed for this connection.
  checked_at timestamptz not null default now(),
  -- Set when the connection must be dropped: a newer one for the account, or no membership.
  kick_requested_at timestamptz,
  kick_reason text check (kick_reason is null or kick_reason in ('newer_stream', 'membership')),
  -- When the station's door was last handed it to drop.
  kicked_at timestamptz,
  primary key (boot, client)
);
create index if not exists radio_connections_user_idx on public.radio_connections (user_id);
create index if not exists radio_connections_kick_idx on public.radio_connections (boot, kick_requested_at);
create index if not exists radio_connections_checked_idx on public.radio_connections (boot, checked_at);

alter table public.radio_streams enable row level security;
alter table public.radio_connections enable row level security;
revoke all on public.radio_streams from anon, authenticated;
revoke all on public.radio_connections from anon, authenticated;
grant all on public.radio_streams to service_role;
grant all on public.radio_connections to service_role;

commit;
