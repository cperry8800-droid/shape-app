-- "Clear all" on the website bell (owner, 2026-10-16: "add a clear all as well so the
-- notifications dont linger").
--
-- A cleared notification is hidden, not deleted. Three senders read a member's earlier rows as
-- their record of what was already sent:
--   - /api/cron/prep-reminders reads 9 days of meal_prep rows (data.forMeals) so a meal is
--     reminded about once;
--   - lib/capacity-reopen.ts reads waitlist_invite rows (data.dedupe) to skip who was told;
--   - lib/notify.ts counts the last hour's rows of a type before it emails again.
-- Deleting those rows would make each of them send again. So /api/notifications stamps
-- cleared_at, its GET leaves stamped rows out, and every sender still sees them.
--
-- The owner-only update policy (2026-05-30-notifications.sql: user_id = auth.uid()) already
-- lets a member stamp their own rows; no policy changes. The push webhook fires on INSERT only,
-- so a clear never sends anything.
--
-- Until this runs, the GET reads as before and a clear answers 503. Idempotent, safe to re-run.
begin;

alter table public.notifications add column if not exists cleared_at timestamptz;

-- The bell's read: a member's newest rows that are not cleared.
create index if not exists notifications_user_uncleared_idx
  on public.notifications (user_id, created_at desc)
  where cleared_at is null;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name = 'cleared_at' and data_type = 'timestamp with time zone'
  ) then
    raise exception 'notifications.cleared_at is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and policyname = 'notifications_update_own' and cmd = 'UPDATE'
  ) then
    raise exception 'notifications_update_own is missing: a member could not clear their own notifications';
  end if;
end
$guard$;

commit;
