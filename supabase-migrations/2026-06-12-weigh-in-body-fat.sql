-- Optional body-fat % on weigh-ins.
--
-- The Progress page's Body fat tile/series previously had NO data source —
-- nothing wrote daily_health_snapshot.body_fat_pct. Body fat now rides on the
-- weigh-in: the Log-weigh-in sheet gains an optional "Body fat %" field stored
-- here, and /api/client/progress reads the series from client_weigh_ins.
-- RLS is inherited from the existing table policies (client owns the row;
-- linked coaches read via is_coach_on_client). Idempotent.

alter table public.client_weigh_ins
  add column if not exists body_fat_pct numeric;
