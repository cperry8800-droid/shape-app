-- Coach reviews are read by every signed-in account; their rating is everyone's (owner,
-- 2026-11-10: an account is free, and a review's words go to "Every signed-in account").
--
-- WHAT CHANGES. 2026-10-28-coach-reviews-members.sql let a review's words be read by a Shape
-- member (shape_viewer_is_member(): a coach, or the newest platform subscription active, trialing
-- or past_due), the review's own author, or the coach it is about. With the free tier, any
-- signed-in account may read them. Signed out (anon) still reads no row: a visitor gets the
-- rating only, from coach_review_ratings(), which this leaves as it is.
--
--   "members read coach reviews"   dropped.
--   "accounts read coach reviews"  SELECT for authenticated, every row.
--
-- shape_viewer_is_member() is left in place, unused by this table now, so a second run or an
-- older deploy calling it changes nothing.
--
-- Idempotent, one transaction, lock_timeout 10 s (as 2026-10-28-coach-reviews-members.sql).

begin;
set local lock_timeout = '10s';

drop policy if exists "members read coach reviews" on public.coach_reviews;
drop policy if exists "accounts read coach reviews" on public.coach_reviews;
create policy "accounts read coach reviews" on public.coach_reviews
  for select to authenticated
  using (true);

commit;
