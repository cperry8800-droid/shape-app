-- Daily steps / NEAT: the one standard activity metric Shape was missing.
-- Adds a steps column to the daily snapshot (the same row device-sync + manual
-- logs write). Integer count for the calendar day; written SET-style (the day's
-- authoritative total), like sleep_hours — device sync overwrites with the
-- device's daily total, a manual log sets it. Idempotent.

alter table public.daily_health_snapshot
  add column if not exists steps integer;

comment on column public.daily_health_snapshot.steps is
  'Daily step count (NEAT). Device-synced total for the day (Apple Health / Garmin / etc.) or a manual entry; SET, not accumulated.';
