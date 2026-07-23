-- Coach reviews — add an IMMUTABLE owner_id (the coach BEING reviewed) so the
-- profile wave's "Wins wall" (P5) can pin only reviews PROVABLY owned by the
-- profile owner.
--
-- Today coach_reviews is keyed by `coach_slug` (free-text = slugify(name),
-- MUTABLE + collision-prone on a rename/reuse) and `user_id` is the review AUTHOR,
-- never the coach. The wall's whole promise is "— REAL REVIEW · PINNED"; a slug
-- collision rendering ANOTHER coach's words as this coach's testimonial would be a
-- fabricated credential, which the honesty doctrine forbids. owner_id is the fix:
-- stamped at WRITE time from the slug's resolved provider owner (server-side, never
-- client-supplied). The wall resolves a pinned id by `id` AND `owner_id = the
-- profile owner's uid`, so a hand-written id belonging to another coach's review
-- never resolves.
--
-- NO BACKFILL (records-round final ruling): every candidate backfill heuristic
-- mis-attaches after a slug rename/reuse — a bare slug join hands the previous
-- holder's rows to the new one, and a provider-created_at tenure check fails
-- because row age is not slug-tenure age. No immutable slug-history source exists,
-- so no legacy row's ownership is PROVABLE — and unprovable rows must never be
-- pinnable. All pre-migration rows keep owner_id NULL permanently; the review WRITE
-- path stamps owner_id on every NEW review, so the pinnable set grows only from
-- provably-owned rows. Honest cost: a coach can pin only reviews written after this
-- migration. The general (slug-keyed) Reviews section is unaffected.
--
-- Additive + idempotent, safe to re-run. `on delete set null`: if the coach's auth
-- account is deleted, their reviews stop resolving on any wall (honest absence).

alter table public.coach_reviews
  add column if not exists owner_id uuid references auth.users on delete set null;

-- The wall fetches the owner's reviews (by slug, the existing public read path)
-- then filters by owner_id; this index serves the owner-scoped lookup a coach's
-- own wall/pin-picker makes.
create index if not exists coach_reviews_owner_idx
  on public.coach_reviews (owner_id, created_at desc);
