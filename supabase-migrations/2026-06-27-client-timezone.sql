-- Per-user IANA timezone for weekend/weekday bucketing (and future tz-aware reads).
-- client_profiles is otherwise (user_id, data jsonb, updated_at); a dedicated text
-- column joins far more cheaply in get_roster_weekend_split than JSONB extraction.
alter table public.client_profiles
  add column if not exists timezone text;

-- Backfill from the only existing tz source: a member's reminder settings.
-- Skip 'UTC' (the default) so we only seed genuinely-known zones.
update public.client_profiles cp
set timezone = r.tz
from (
  select distinct on (user_id) user_id, tz
  from public.user_scheduled_reminders
  where tz is not null and tz <> 'UTC'
  order by user_id, updated_at desc
) r
where r.user_id = cp.user_id
  and cp.timezone is null;
