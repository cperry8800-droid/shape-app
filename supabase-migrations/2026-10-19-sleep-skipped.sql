-- A night skipped in the Morning check-in is kept on the server (owner, 2026-10-19: "yes fix", on
-- the reminder that read energy saved alone on the old "How are you." page as a finished morning).
--
--   daily_health_snapshot.sleep_skipped is true when the member tapped Skip on the night step that
--   day. The Morning check-in reminder (src/app/api/cron/reminders/route.ts) counts a morning
--   answered once its energy is in AND the night is answered (hours or Rested), measured by a
--   watch, or skipped; until now a skip lived only on the device, so the reminder could not tell a
--   skipped night from an unanswered one and read energy alone as done.
--
-- ⚠ NULL, NOT FALSE. A row says nothing about the night until the member skips it; nothing reads
-- false. The table's grants are table-wide, so the new column is covered by them and none are
-- restated, and no trigger watches it (the award trigger fires only on its listed columns).
--
-- One transaction, re-runnable, a guard at the end. Until it runs, the check-in route's skip save
-- fails on its own (the device still remembers the skip) and the reminder keeps the energy-only
-- rule.

begin;
set local lock_timeout = '10s';

alter table public.daily_health_snapshot
  add column if not exists sleep_skipped boolean;

comment on column public.daily_health_snapshot.sleep_skipped is
  'True when the member skipped the night in the Morning check-in that day. Null otherwise.';

-- ── Guard ──────────────────────────────────────────────────────────────────────
do $guard$
declare
  v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'daily_health_snapshot' and column_name = 'sleep_skipped';
  if v_type is null then
    raise exception 'daily_health_snapshot.sleep_skipped is missing';
  end if;
  if v_type <> 'boolean' then
    raise exception 'daily_health_snapshot.sleep_skipped is %, not boolean', v_type;
  end if;
  if not has_column_privilege('authenticated', 'public.daily_health_snapshot', 'sleep_skipped', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.daily_health_snapshot', 'sleep_skipped', 'INSERT') then
    raise exception 'members cannot write daily_health_snapshot.sleep_skipped';
  end if;
end;
$guard$;

commit;
