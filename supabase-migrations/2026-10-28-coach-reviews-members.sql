-- Coach reviews are read by members; their rating is everyone's (owner, 2026-10-28: "i want
-- reviews to be public… anyone with a shape membership can read them", and for everyone else
-- "Rating only").
--
-- WHAT WAS WRONG. coach_reviews' SELECT policy ("read coach reviews") is `true` for anon and
-- authenticated: anyone with the public anon key could read every review's words and author
-- straight from the table, signed out, whatever /api/coaches/reviews showed.
--
-- WHAT THIS ADDS.
--   shape_viewer_is_member()   true when the CALLER (auth.uid(); never an argument) is a Shape
--     member as src/lib/membership-core.ts computeMembership() says: an approved coach (role or
--     roles holds trainer, nutritionist or dietitian), or the newest platform subscription is
--     active, trialing or past_due. (Admins by e-mail allow-list stay a server-side answer: the
--     API asks computeMembership, and an admin reads through it.) SECURITY DEFINER because a
--     caller's own profile and subscription rows are theirs to read anyway; it answers only for
--     the caller, so it says nothing about anyone else. Executable by authenticated.
--   "members read coach reviews"   SELECT for authenticated: a member, the review's own author,
--     or the coach it is about. Replaces "read coach reviews"; anon reads no rows.
--   coach_review_ratings()   every coach's rating total and count, by slug and by account
--     (owner_id), and nothing else: never a review's words, author or id. SECURITY DEFINER so a
--     non-member (anon too) still sees "9.6/10 from 12 reviews"; executable by anon and
--     authenticated. /api/coaches/reviews builds every average from it.
--
-- Tested on a local PostgreSQL 16 database with these tables as production has them: a member
-- (subscriber, past_due subscriber, coach by role, coach by roles) reads every review; a
-- non-member reads only their own; the coach reads reviews about them; anon reads none and
-- cannot execute the membership check; a canceled newest subscription over an older active one
-- is not a member; everyone, anon included, reads the ratings; a second run changed nothing.
--
-- Idempotent, one transaction, lock_timeout 10 s (as 2026-10-09-coach-reviews-require-relationship.sql).

begin;
set local lock_timeout = '10s';

create or replace function public.shape_viewer_is_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (
       exists (
         select 1
         from public.profiles p
         where p.id = auth.uid()
           and (p.role in ('trainer', 'nutritionist', 'dietitian')
                or coalesce(p.roles, '{}'::text[]) && array['trainer', 'nutritionist', 'dietitian']::text[])
       )
       or exists (
         select 1
         from (
           select s.status
           from public.platform_subscriptions s
           where s.client_id = auth.uid()
           order by s.current_period_end desc nulls last
           limit 1
         ) newest
         where newest.status in ('active', 'trialing', 'past_due')
       )
     );
$$;

revoke all on function public.shape_viewer_is_member() from public;
revoke all on function public.shape_viewer_is_member() from anon;
grant execute on function public.shape_viewer_is_member() to authenticated;

drop policy if exists "read coach reviews" on public.coach_reviews;
drop policy if exists "members read coach reviews" on public.coach_reviews;
create policy "members read coach reviews" on public.coach_reviews
  for select to authenticated
  using (user_id = auth.uid() or owner_id = auth.uid() or public.shape_viewer_is_member());

create or replace function public.coach_review_ratings()
returns table (coach_slug text, owner_id uuid, total bigint, count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.coach_slug, r.owner_id, coalesce(sum(r.rating), 0)::bigint, count(*)::bigint
  from public.coach_reviews r
  group by r.coach_slug, r.owner_id;
$$;

revoke all on function public.coach_review_ratings() from public;
grant execute on function public.coach_review_ratings() to anon, authenticated;

commit;
