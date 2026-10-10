-- Nora as the DJ at the times the owner sets (owner, 2026-10-10: "i want NORA to be a full AI dj
-- at times on shape"; slots the owner sets; no talking). Builds on 2026-10-11-radio-library.sql.
--
--   nora_slots           the owner's recurring times ("Mon–Fri 6 pm, 60 min, America/New_York")
--   nora_sets (+2 cols)  each set they put on the schedule: host_kind 'nora', and the slot it
--                        came from. A Nora set is shown in "Coming up" as "Nora · DJ set" (the
--                        show is named, never the music) and only once the licences are confirmed.
--   nora_set_programmes  the set Nora planned: every song, its order and every transition. It
--                        names the songs ahead of air, so it is NEVER readable by listeners (the
--                        licence forbids announcing recordings in advance); only the service role
--                        reads it (the dashboard, the cron, the engine's token-gated route).
--   nora_dj_settings     one row: whether the owner has confirmed the station's licences.
--
-- No function is created, so the definer audit has nothing to read here. Dated 2026-10-11 like
-- the library (the 2026-10-10 capture records the one file dated that day). Idempotent.

-- ── The slots ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.nora_slots (
  id            uuid primary key default gen_random_uuid(),
  days          smallint[] not null check (cardinality(days) between 1 and 7 and days <@ array[0,1,2,3,4,5,6]::smallint[]),
  start_minute  int not null check (start_minute between 0 and 1439),
  duration_min  int not null check (duration_min between 30 and 360),
  zone          text not null check (length(zone) between 1 and 64),
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.nora_slots enable row level security;
revoke all on table public.nora_slots from public, anon, authenticated;
grant select, insert, update, delete on table public.nora_slots to service_role;

-- ── The sets ───────────────────────────────────────────────────────────────────────────────
-- Existing rows are guest sets (the default); Nora's are written by the cron only.
alter table public.nora_sets add column if not exists host_kind text not null default 'guest'
  check (host_kind in ('guest', 'nora'));
alter table public.nora_sets add column if not exists slot_id uuid
  references public.nora_slots(id) on delete set null;
-- One set per slot per start, so a cron run that overlaps another cannot double a set.
create unique index if not exists nora_sets_slot_start_uniq on public.nora_sets (slot_id, starts_at) where slot_id is not null;

-- ── What Nora planned ──────────────────────────────────────────────────────────────────────
create table if not exists public.nora_set_programmes (
  set_id           uuid primary key references public.nora_sets(id) on delete cascade,
  programme        jsonb not null,
  planner_version  int not null,
  planned_at       timestamptz not null default now()
);
alter table public.nora_set_programmes enable row level security;
revoke all on table public.nora_set_programmes from public, anon, authenticated;
grant select, insert, update, delete on table public.nora_set_programmes to service_role;

-- ── The licence switch ─────────────────────────────────────────────────────────────────────
create table if not exists public.nora_dj_settings (
  id                     int primary key default 1 check (id = 1),
  licences_confirmed_at  timestamptz,
  licences_confirmed_by  text,
  updated_at             timestamptz not null default now()
);
insert into public.nora_dj_settings (id) values (1) on conflict (id) do nothing;
alter table public.nora_dj_settings enable row level security;
revoke all on table public.nora_dj_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.nora_dj_settings to service_role;
