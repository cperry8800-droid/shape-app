-- CRITICAL FIX — make the Shape Score award RPCs actually credit/dedupe.
--
-- score_ledger_dedupe_idx was a PARTIAL unique index:
--   (user_id, source_kind, source_id) WHERE source_kind IS NOT NULL AND source_id IS NOT NULL
-- but EVERY award RPC (award_my_goal_milestones, award_momentum_bonus, award_tier_bonuses,
-- post_my_pr_to_wall, award_checkin_points, award_community_post, the accountability
-- penalties/waive, commitment settle, store redeem, …) inserts with
--   ON CONFLICT (user_id, source_kind, source_id) DO NOTHING
-- WITHOUT the index predicate. Postgres rejects that against a partial index
-- (SQLSTATE 42P10: "no unique or exclusion constraint matching the ON CONFLICT
-- specification"), so each RPC would ERROR the moment it fires. It's gone unnoticed
-- only because no award has run on real data yet (the tables are still empty).
--
-- Recreate the index as a PLAIN unique index on the same columns. NULLs are DISTINCT
-- by default, so rows with a null source_kind/source_id still never conflict — exactly
-- like the partial version — but now `ON CONFLICT (user_id, source_kind, source_id)`
-- infers cleanly. Idempotent + safe: the partial index already guaranteed uniqueness
-- on non-null-source rows, so the plain index builds without duplicate-key errors.

drop index if exists public.score_ledger_dedupe_idx;
create unique index if not exists score_ledger_dedupe_idx
  on public.score_ledger (user_id, source_kind, source_id);
