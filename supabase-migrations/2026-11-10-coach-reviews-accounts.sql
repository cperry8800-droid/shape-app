-- Coach reviews' words go to every signed-in adult account, through /api/coaches/reviews; their
-- rating is everyone's (owner, 2026-11-10: an account is free, and a review's words go to "Every
-- signed-in account").
--
-- WHAT CHANGES. 2026-10-28-coach-reviews-members.sql let a review's words be read straight from
-- the table by a Shape member (shape_viewer_is_member(): a coach, or the newest platform
-- subscription active, trialing or past_due), the review's own author, or the coach it is about.
-- The words now go to every signed-in ADULT account, and only the API can tell an adult: a known
-- minor gets the rating only (computeMembership's isKnownMinor, from the birthdate in Node; the
-- repo keeps age arithmetic out of SQL, as 2026-08-22-age-visibility.sql explains). So the route
-- reads the words with the service role for a reader it has cleared, and the table answers a
-- signed-in caller only the reviews they wrote and the reviews about them. (A first draft of this
-- file opened every row to every signed-in account, which let a known minor read every review's
-- words and author through the REST API: Codex P2 on #2675.)
--
--   "members read coach reviews"   dropped.
--   "own coach reviews"            SELECT for authenticated: the review's author, or the coach it
--                                  is about.
--
-- Signed out (anon) still reads no row: a visitor gets the rating only, from
-- coach_review_ratings(), which this leaves as it is. shape_viewer_is_member() is left in place,
-- unused by this table now, so a second run or an older deploy calling it changes nothing.
--
-- Idempotent, one transaction, lock_timeout 10 s (as 2026-10-28-coach-reviews-members.sql).

begin;
set local lock_timeout = '10s';

drop policy if exists "members read coach reviews" on public.coach_reviews;
drop policy if exists "accounts read coach reviews" on public.coach_reviews;
drop policy if exists "own coach reviews" on public.coach_reviews;
create policy "own coach reviews" on public.coach_reviews
  for select to authenticated
  using (user_id = auth.uid() or owner_id = auth.uid());

commit;
