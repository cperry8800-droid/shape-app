-- Recurring sessions: the bookings of one run share a series id. Coach Schedule upgrade, step 4.
-- Idempotent, safe to re-run.
--
-- Read and written by:
--   src/lib/session-series.ts           the run's dates on the coach's clock, and where a move
--                                       of "this and following" lands
--   src/app/api/sessions/manage/route.ts create with `repeat` stamps the id on every booking it
--                                       writes; cancel and reschedule with `scope: 'following'`
--                                       act on this booking and every later active one sharing it
--   src/app/api/calendar/route.ts       hands the id to the Schedule, which offers the scope
--
-- ── WHAT IT IS ────────────────────────────────────────────────────────────────
-- A nullable uuid. A booking that is not part of a run has none, which is every row written
-- before this file and every single booking after it. Each booking of a run is still an
-- ordinary `sessions` row (its own status, time, room and reminders), so nothing that reads
-- sessions has to know runs exist; the id only says which rows "this and following" means.
--
-- ⚠ NO NEW POLICY. The rows are written by the manage route with the service role after its own
-- checks (the coach owns the provider row; the client is theirs), exactly as a single booking
-- from an empty slot is, and RLS already gives each row to its coach and its client.
--
-- ⚠ THE INDEX LEADS WITH THE SERIES, THEN THE START: "this and following" is one series read
-- from one instant on, and a single booking (no series) is not in it at all.

alter table public.sessions add column if not exists series_id uuid;

comment on column public.sessions.series_id is
  'The run this booking belongs to (recurring sessions, 2026-10-07). Null for a single booking. '
  'Written by /api/sessions/manage create with repeat; read by its cancel/reschedule scope ''following''.';

create index if not exists sessions_series_idx
  on public.sessions (series_id, scheduled_at)
  where series_id is not null;
