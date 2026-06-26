-- Daily subjective "rested" rating (1-10) for the home check-in card's sleep
-- section. Manual-only (no device provides it), so it is NOT added to the
-- multi-source reconcile set. Idempotent; nullable so existing rows are fine.

alter table public.daily_health_snapshot
  add column if not exists sleep_quality smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_health_snapshot_sleep_quality_range'
  ) then
    alter table public.daily_health_snapshot
      add constraint daily_health_snapshot_sleep_quality_range
      check (sleep_quality is null or (sleep_quality >= 1 and sleep_quality <= 10)) not valid;
  end if;
end $$;
