-- Shape Radio's own rotation (owner, 2026-11-03: "build your own internet/app radio streaming
-- platform where i can upload songs to stream instead of using radio.co"). Between Nora's sets the
-- station plays the library around the clock, planned by Shape an hour at a time
-- (src/lib/radio/rotation.mjs) under the same rules as her sets, and played by her engine
-- (services/nora-engine, NORA_MODE=station) into Shape's own Icecast server (services/station).
--
--   radio_rotation_blocks      each planned block: when it starts, its length and its programme
--   nora_engine_log.block_id   the engine's log takes a block as well as a set, so every song the
--                              station plays is in the one play record the SoundExchange report
--                              reads
--
-- Service role only, like the rest of the station's records: no anon or member access, no policy,
-- no function (nothing for the definer audit). Builds on 2026-10-11-nora-engine-log.sql.
-- Idempotent.

create table if not exists public.radio_rotation_blocks (
  id               uuid primary key default gen_random_uuid(),
  -- One block per start: the engine asks for "the block after this moment", and a retried ask
  -- must find the block the first one stored, not plan a second over it.
  starts_at        timestamptz not null unique,
  duration_sec     int not null check (duration_sec between 10 and 7200),
  programme        jsonb not null,
  planner_version  int not null,
  created_at       timestamptz not null default now()
);
alter table public.radio_rotation_blocks enable row level security;
revoke all on table public.radio_rotation_blocks from public, anon, authenticated;
grant select, insert, update, delete on table public.radio_rotation_blocks to service_role;

-- ── The play record takes a block ──────────────────────────────────────────────────────────
alter table public.nora_engine_log add column if not exists block_id uuid
  references public.radio_rotation_blocks(id) on delete set null;
-- A row is a set's or a block's, never both.
alter table public.nora_engine_log drop constraint if exists nora_engine_log_one_segment;
alter table public.nora_engine_log add constraint nora_engine_log_one_segment
  check (set_id is null or block_id is null);
create index if not exists nora_engine_log_block_idx on public.nora_engine_log (block_id, logged_at desc);
