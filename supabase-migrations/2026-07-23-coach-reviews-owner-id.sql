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

-- ⚠ owner_id MUST be server-derived, never client-settable. The insert RLS policy
-- only checks `user_id = auth.uid()`, and clients write with the public user-scoped
-- key — so without this a signed-in coach could INSERT a coach_reviews row directly
-- with owner_id = their own uid + a fabricated body, then pin it on their wins wall
-- (which trusts owner_id) as a "real review". This BEFORE trigger stamps owner_id from
-- coach_slug (the same slugify the app uses), so it can't be forged. Immutability is
-- IDENTITY-SCOPED: on an UPDATE that leaves BOTH coach_slug AND coach_kind unchanged
-- (an ordinary body/rating edit, or a provider rename that leaves this row's slug
-- intact) it preserves OLD.owner_id — ignoring the client's NEW value and any later
-- provider rename, so a pinned review's ownership can't drift or be re-forged. But if
-- the row is REPOINTED at a different coach identity, it re-derives: the POST upsert
-- conflicts on (user_id, coach_slug) — kind-agnostic — so a member who reviews a
-- trainer AND a same-slug nutritionist has the second review UPDATE the first row,
-- flipping coach_kind (and body); preserving the old owner_id there would stamp the
-- nutritionist's words with the trainer's owner, letting that trainer pin a review
-- written for someone else. Recomputing on a slug/kind change keeps owner_id honest
-- (and never lets an author own their own row — the wall's authorId != ownerId guard
-- filters a self-derived stamp). It stamps only when EXACTLY ONE provider owner
-- matches the slug — a collision or no match leaves NULL (an unprovable row is never
-- pinnable). SECURITY DEFINER so it can read the provider tables regardless of the writer.
create or replace function public.coach_review_owner_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owners uuid[];
begin
  -- Identity-stable edit: an UPDATE that leaves the coach identity (slug + kind)
  -- untouched keeps the original stamp and skips the provider scan — this preserves
  -- the stamp across a body/rating edit AND across a later provider rename (the row's
  -- slug column doesn't change on a rename). A slug/kind CHANGE (the kind-agnostic
  -- upsert repointing the row at a different coach) falls through and re-derives below,
  -- so owner_id can never be left mis-attributed to the previous coach.
  if (tg_op = 'UPDATE'
      and new.coach_slug is not distinct from old.coach_slug
      and new.coach_kind is not distinct from old.coach_kind) then
    new.owner_id := old.owner_id;
    return new;
  end if;
  if new.coach_kind = 'nutritionist' then
    select array_agg(distinct owner_id) into v_owners
    from public.nutritionists
    where owner_id is not null
      and regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') = new.coach_slug;
  else
    select array_agg(distinct owner_id) into v_owners
    from public.trainers
    where owner_id is not null
      and regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') = new.coach_slug;
  end if;
  if v_owners is not null and array_length(v_owners, 1) = 1 then
    new.owner_id := v_owners[1];
  else
    new.owner_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists coach_reviews_set_owner on public.coach_reviews;
create trigger coach_reviews_set_owner
  before insert or update on public.coach_reviews
  for each row execute function public.coach_review_owner_id();

-- The wall fetches the owner's reviews then filters by owner_id; this index serves
-- the owner-scoped lookup a coach's own wall/pin-picker makes.
create index if not exists coach_reviews_owner_idx
  on public.coach_reviews (owner_id, created_at desc);
