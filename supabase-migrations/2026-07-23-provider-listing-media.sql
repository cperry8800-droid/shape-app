-- Coach-authored marketplace-box media (spec 2026-07-23 — "E · The Combo").
--
-- Shape: { "portrait": url|null, "cover": url|null,
--          "gallery": [{ "url": url, "caption": text (<=80) }] (<=6),
--          "updatedAt": ISO — stamped BY THE SETTER on every successful write }
--
-- Limits + parsed-URL validation (own Supabase storage host · owner-folder path
-- prefix · image-extension allowlist) are enforced by the canonical normalizer
-- at BOTH the write path and every render path
-- (public/newdesign/listingMedia.mjs); captions are plain text (rendered as
-- text, never HTML).
--
-- Both provider tables are already public-read for the marketplace, and both
-- marketplaces already select('*'), so every surface reads this with zero new
-- endpoints and it is migration-safe before apply (absent column → absent key →
-- normalizer returns empty). Writes go through the coach's existing owner-scoped
-- provider-row update path — listing_media is NOT an admin-pinned column
-- (2026-06-25-provider-admin-column-guard enumerates a blocklist it is not on),
-- exactly as monthly_offer (2026-07-09). Idempotent; safe to re-run.

alter table if exists public.trainers
  add column if not exists listing_media jsonb;

alter table if exists public.nutritionists
  add column if not exists listing_media jsonb;
