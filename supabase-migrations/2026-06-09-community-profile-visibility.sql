-- Third post visibility: 'profile' — visible to EVERYONE on the author's profile
-- (like 'public'), but kept OUT of the community feed (the feed read queries
-- exclude it in code; RLS still lets anyone read it so it renders on the profile).
-- Idempotent — safe to re-run.

-- 1) Allow 'profile' in the privacy CHECK constraint.
alter table public.community_posts
  drop constraint if exists community_posts_privacy_check;
alter table public.community_posts
  add constraint community_posts_privacy_check
  check (privacy in ('public', 'community', 'private', 'profile'));

-- 2) 'profile' reads like 'public' (anyone can view), so a profile-only post
--    shows on the author's profile to every viewer. Feed queries filter it out.
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
        or p.author_id = auth.uid()
      )
  );
$$;

drop policy if exists "read visible community posts" on public.community_posts;
create policy "read visible community posts"
  on public.community_posts for select
  to anon, authenticated
  using (
    privacy = 'public'
    or privacy = 'profile'
    or (privacy = 'community' and auth.uid() is not null)
    or author_id = auth.uid()
  );
