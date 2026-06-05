-- Richer per-client program adjustments — the payload behind the coach's
-- "Adjust program / Adjust plan" page (intensity, sessions, focus, weekly split
-- for trainers; calories, macros, meals, refeed, restrictions for nutritionists).
--
-- Stored as a JSONB blob on the existing client_programs row so it inherits the
-- same coach-writable RLS (client owns their row; a coach with an active sub can
-- read AND set it via is_coach_on_client). Shape:
--   { training:   { intensity, sessions, weeks, focus[], days[], note, updatedAt },
--     nutrition:  { calories, protein, carbs, fat, meals, refeed, restrictions[], note, updatedAt } }
-- A trainer writes `training`, a nutritionist writes `nutrition`; the two coexist.
--
-- Idempotent, safe to re-run. No new policies needed (the column inherits the
-- table's existing client_programs RLS from 2026-06-04-client-program-phase.sql).

alter table public.client_programs
  add column if not exists detail jsonb not null default '{}'::jsonb;
