-- Daily energy + hunger ratings (1–10) on the per-day snapshot, parallel to the
-- existing mood/stress/soreness columns. Written by /api/client/checkin from the
-- new daily check-in card. Idempotent.

alter table public.daily_health_snapshot
  add column if not exists energy smallint check (energy is null or energy between 1 and 10),
  add column if not exists hunger smallint check (hunger is null or hunger between 1 and 10);
