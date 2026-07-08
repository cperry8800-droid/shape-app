-- Followers-only post visibility: 'followers' — visible to the AUTHOR and their
-- ACCEPTED followers (user_follows.status = 'accepted'), nowhere else. This is
-- how a friends-visibility member's activity reaches the feeds of the people
-- who follow them without ever being public. Feed queries additionally scope
-- the FOLLOWING mode client/route-side; this RLS is the authority.
-- Idempotent — safe to re-run.

-- 1) Allow 'followers' in the privacy CHECK constraint.
alter table public.community_posts
  drop constraint if exists community_posts_privacy_check;
alter table public.community_posts
  add constraint community_posts_privacy_check
  check (privacy in ('public', 'community', 'private', 'profile', 'followers'));

-- 2) can_view_community_post: 'followers' readable by the author + accepted followers.
--    (Engagement RLS on community_likes / community_comments gates through this
--    function, so likes/comments on followers posts work with no further change.)
create or replace function public.can_view_community_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts p
    where p.id = p_post_id
      and (
        p.privacy = 'public'
        or p.privacy = 'profile'
        or (p.privacy = 'community' and auth.uid() is not null)
        or (p.privacy = 'followers' and (
          p.author_id = auth.uid()
          or exists (
            select 1 from public.user_follows f
            where f.follower_id = auth.uid()
              and f.following_id = p.author_id
              and f.status = 'accepted'
          )
        ))
        or p.author_id = auth.uid()
      )
  );
$$;

-- 3) Read policy mirrors the function (as it does for the other tiers).
drop policy if exists "read visible community posts" on public.community_posts;
create policy "read visible community posts"
  on public.community_posts for select
  to anon, authenticated
  using (
    privacy = 'public'
    or privacy = 'profile'
    or (privacy = 'community' and auth.uid() is not null)
    or (privacy = 'followers' and exists (
      select 1 from public.user_follows f
      where f.follower_id = auth.uid()
        and f.following_id = community_posts.author_id
        and f.status = 'accepted'
    ))
    or author_id = auth.uid()
  );
