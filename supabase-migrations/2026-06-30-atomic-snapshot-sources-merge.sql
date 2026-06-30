-- Atomic provenance merge for daily_health_snapshot.sources.
--
-- upsertSnapshot() (src/lib/health-snapshot.ts) previously read the existing
-- `sources` jsonb, merged the current sync's fields in JS, and wrote the whole
-- object back inside the metric upsert. Two concurrent syncs (e.g. Whoop +
-- Garmin on the same day) could each read the same baseline and clobber the
-- other's provenance entries on the conflicting UPDATE. The metric VALUES are
-- safe (each writer includes only its own columns, so its UPDATE never touches
-- another source's columns) — but `sources` was written whole, so the second
-- writer's copy (baseline-read + only its own fields) overwrote the first's
-- entries.
--
-- This RPC merges a source-provenance patch into the row's sources jsonb under
-- the UPDATE's row lock (`sources || patch`), so no concurrent merge is lost.
-- SECURITY INVOKER so the existing RLS (user_rw_own_snapshots: user_id =
-- auth.uid()) authorizes the write for a user-client caller — a user can only
-- ever merge sources onto their own row; the service-role sync paths (the Garmin
-- webhook) bypass RLS exactly as today. The row is created/updated by the metric
-- upsert that runs first, so this only ever UPDATEs an existing row (a no-op if
-- the caller doesn't own it).
--
-- Idempotent, safe to re-run.

create or replace function public.merge_snapshot_sources(
  p_user_id uuid,
  p_date date,
  p_sources jsonb
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.daily_health_snapshot
     set sources = sources || coalesce(p_sources, '{}'::jsonb)
   where user_id = p_user_id
     and snapshot_date = p_date;
$$;

revoke all on function public.merge_snapshot_sources(uuid, date, jsonb) from public;
grant execute on function public.merge_snapshot_sources(uuid, date, jsonb) to authenticated, service_role;
