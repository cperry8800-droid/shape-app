-- Coach-authored "what's included" for the monthly coaching offer (spec
-- 2026-07-09 §5 — the Listing's coupon opens a WHAT'S INCLUDED sheet whose
-- content coaches customize themselves).
--
-- Shape: { "blurb": text, "includes": text[] (<=8, each <=80 chars),
--          "updatedAt": ISO } — length limits enforced by the coach editor;
-- plain text only (rendered as text, never HTML).
--
-- Both provider tables are already public-read for the marketplace, so the
-- Listing (and the website coach profile) read this with zero new endpoints;
-- writes go through the coach's existing owner-scoped provider-row update
-- path. Idempotent; safe to re-run.

alter table if exists public.trainers
  add column if not exists monthly_offer jsonb;

alter table if exists public.nutritionists
  add column if not exists monthly_offer jsonb;
