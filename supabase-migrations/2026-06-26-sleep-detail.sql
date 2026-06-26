-- Sleep fast-follow: detailed sleep architecture columns on daily_health_snapshot.
--
-- Adds the device-sourced sleep detail the recovery view surfaces: sleep STAGES
-- (deep / REM / light / awake minutes), onset LATENCY, RESPIRATORY rate, and the
-- bed/wake window. Currently populated from Oura's v2 sleep document (the only
-- connected provider that exposes stages + latency + respiratory); other providers
-- leave them NULL and the UI shows an honest "—". The recovery-readiness SCORE is
-- computed (not stored) from these + the existing sleep_hours / efficiency / RHR /
-- HRV columns.
--
-- All columns nullable + additive (no behavior change until a sync writes them).
-- Reads use select('*') so the progress route keeps working before this is applied.

alter table public.daily_health_snapshot
  add column if not exists sleep_deep_min     smallint    check (sleep_deep_min     is null or sleep_deep_min     >= 0),
  add column if not exists sleep_rem_min      smallint    check (sleep_rem_min      is null or sleep_rem_min      >= 0),
  add column if not exists sleep_light_min    smallint    check (sleep_light_min    is null or sleep_light_min    >= 0),
  add column if not exists sleep_awake_min    smallint    check (sleep_awake_min    is null or sleep_awake_min    >= 0),
  add column if not exists sleep_latency_min  smallint    check (sleep_latency_min  is null or sleep_latency_min  >= 0),
  add column if not exists respiratory_rate   numeric(4,1) check (respiratory_rate is null or respiratory_rate   >= 0),
  add column if not exists sleep_start        timestamptz,
  add column if not exists sleep_end          timestamptz;
