-- One night-before prep reminder per member per evening, even when two runs of
-- /api/cron/prep-reminders overlap (CodeRabbit on #2202: the earlier-reminder read and the insert
-- are separate steps, so two runs at once could both send).
--
-- A notification that carries data.dedupe is unique per (user, type, key). The prep reminder
-- sets it to 'prep:<the member's date>', so a second insert for the same evening fails with
-- 23505: it is never pushed (the push webhook fires on insert) and never emailed
-- (createPreferredNotification emails only once the row is stored). Rows without the key are
-- not indexed, so no other notification is affected.
--
-- Until this runs, the reminder works as before; only the overlap guard is missing.
-- Idempotent, safe to re-run.

create unique index if not exists notifications_dedupe_uidx
  on public.notifications (user_id, type, (data->>'dedupe'))
  where data ? 'dedupe';
