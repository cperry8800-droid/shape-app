-- Apple Health and Oura workouts get into activities. Idempotent, safe to re-run.
--
-- activities.source was checked against ('strava','whoop','apple','garmin','manual')
-- (2026-05-30-activities.sql), but the Apple Health sync writes 'apple_health' and the Oura sync
-- 'oura', so every workout either sent was refused. Checked live on 2026-10-24: the check read as
-- above (activities_source_check), and activities held no rows at all.
--
-- Written by:
--   src/app/api/integrations/apple-health/sync/route.ts   (source 'apple_health')
--   src/app/api/integrations/oura/sync/route.ts           (source 'oura')
-- Both now report a refused row instead of dropping it in silence.
--
-- Read by Train's Burned this week (services/weekBurn.mjs, on a day with no device snapshot),
-- Home's Week so far (getCommitmentProgress) and the profile's Field notes.
--
-- 'apple' stays: nothing writes it now, but a row written under it would otherwise fail the check.

alter table public.activities drop constraint if exists activities_source_check;
alter table public.activities add constraint activities_source_check
  check (source in ('strava', 'whoop', 'apple', 'apple_health', 'garmin', 'oura', 'manual'));
