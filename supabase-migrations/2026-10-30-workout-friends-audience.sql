-- Workouts shared with friends: a 'friends' audience for workout posts and the live row.
--
-- Owner, 2026-10-30: "the user has the option to make their workouts public with friends so not
-- only can friends see the activity you're doing, but they can tap into the workout and see
-- specifics like how fast you are running, pace, etc". Settings → Share workout data gains a
-- third choice, 'Friends' (stored in user_goals('client_settings').shareWorkoutData beside 'On'
-- and 'Off'), and the share rule (public/newdesign/workoutPrivacy.mjs) returns 'friends' for it.
-- Session details reads the post it opens, so whoever can read the post sees its pace, splits,
-- heart rate and route.
--
-- ⚠ FRIENDS ARE MUTUAL FOLLOWS, NOT FOLLOWERS. Following a public profile is accepted at once
-- (toggle_follow), so a followers-only audience on a public profile is anyone who taps Follow.
-- A friend is someone the member follows who follows them back, both accepted: the member's
-- own follow is what lets a person in, and unfollowing them takes it back. 'followers' stays
-- what a "Just friends" profile shares with (its follows need the member's approval).
--
-- Audience order, narrowest last: public, followers, friends, private. A friend is always a
-- follower, so 'friends' is narrower than 'followers'.
--
-- What this does:
--   1. community_posts.privacy accepts 'friends'.
--   2. can_view_community_post and the posts' read policy let the author and their friends
--      read a 'friends' post. Likes and comments gate through can_view_community_post, so
--      friends can react to it and reply. Every other leg is unchanged from
--      2026-07-08-followers-post-visibility.sql.
--   3. user_activity_live.visibility accepts 'friends', and its read policy lets the member's
--      friends read it while it is live. Every other leg is unchanged from
--      2026-07-19-user-activity-live-expiry-rls.sql.
--   4. shape_sync_workout_privacy (20260924020426_atomic_workout_privacy.sql) learns 'Friends':
--      past auto-posts tighten to 'friends' when that is narrower, and the live row is
--      restamped. History still only becomes more private.
--
-- Until this runs, a post or live row stamped 'friends' is refused by the old checks, so a
-- member who picks Friends shares nothing new (it fails closed). Run it before the app ships.
-- Idempotent, safe to re-run.

-- 1 · posts may carry the friends audience.
alter table public.community_posts
  drop constraint if exists community_posts_privacy_check;
alter table public.community_posts
  add constraint community_posts_privacy_check
  check (privacy in ('public', 'community', 'private', 'profile', 'followers', 'friends'));

-- 2 · who may read a post. A friend: the caller follows the author AND the author follows the
--     caller, both accepted. A NULL auth.uid() matches no follow row, so a visitor reads none.
create or replace function public.can_view_community_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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
        or (p.privacy = 'friends' and (
          p.author_id = auth.uid()
          or (
            exists (
              select 1 from public.user_follows f
              where f.follower_id = auth.uid()
                and f.following_id = p.author_id
                and f.status = 'accepted'
            )
            and exists (
              select 1 from public.user_follows b
              where b.follower_id = p.author_id
                and b.following_id = auth.uid()
                and b.status = 'accepted'
            )
          )
        ))
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
    or (privacy = 'followers' and exists (
      select 1 from public.user_follows f
      where f.follower_id = auth.uid()
        and f.following_id = community_posts.author_id
        and f.status = 'accepted'
    ))
    or (privacy = 'friends'
      and exists (
        select 1 from public.user_follows f
        where f.follower_id = auth.uid()
          and f.following_id = community_posts.author_id
          and f.status = 'accepted'
      )
      and exists (
        select 1 from public.user_follows b
        where b.follower_id = community_posts.author_id
          and b.following_id = auth.uid()
          and b.status = 'accepted'
      ))
    or author_id = auth.uid()
  );

-- 3 · the live row. There is still no 'private' value: a private member's row is absent.
alter table public.user_activity_live
  drop constraint if exists user_activity_live_visibility_check;
alter table public.user_activity_live
  add constraint user_activity_live_visibility_check
  check (visibility in ('public', 'followers', 'friends'));

drop policy if exists "live read" on public.user_activity_live;
create policy "live read" on public.user_activity_live
  for select to authenticated using (
    user_id = auth.uid()
    or (expires_at > now() and (
      visibility = 'public'
      or (visibility = 'followers' and exists (
            select 1 from public.user_follows
            where follower_id = auth.uid() and following_id = user_id and status = 'accepted'))
      or (visibility = 'friends'
        and exists (
            select 1 from public.user_follows f
            where f.follower_id = auth.uid() and f.following_id = user_activity_live.user_id and f.status = 'accepted')
        and exists (
            select 1 from public.user_follows b
            where b.follower_id = user_activity_live.user_id and b.following_id = auth.uid() and b.status = 'accepted'))
    ))
  );

-- 4 · the settings trigger. The same rule as bsWorkoutSharePrivacy, in the same order: Off or a
--     Private profile is private, then Friends, then a Just friends profile, then public.
create or replace function public.shape_sync_workout_privacy()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  audience text;
begin
  if new.kind <> 'client_settings' then return new; end if;
  audience := case
    when coalesce(new.data->>'shareWorkoutData', 'On') = 'Off'
      or coalesce(new.data->>'profileVisibility', 'Public') = 'Private' then 'private'
    when coalesce(new.data->>'shareWorkoutData', 'On') = 'Friends' then 'friends'
    when coalesce(new.data->>'profileVisibility', 'Public') = 'Just friends' then 'followers'
    else 'public'
  end;

  -- History only becomes more private. Manual posts retain their own audience.
  if audience = 'private' then
    update public.community_posts set privacy = 'private'
      where author_id = new.user_id and source_provider is not null
        and privacy in ('public', 'community', 'followers', 'friends');
  elsif audience = 'friends' then
    update public.community_posts set privacy = 'friends'
      where author_id = new.user_id and source_provider is not null
        and privacy in ('public', 'community', 'followers');
  elsif audience = 'followers' then
    update public.community_posts set privacy = 'followers'
      where author_id = new.user_id and source_provider is not null
        and privacy in ('public', 'community');
  end if;

  if audience = 'private' then
    delete from public.user_activity_live where user_id = new.user_id;
  else
    update public.user_activity_live set visibility = audience
      where user_id = new.user_id and visibility is distinct from audience;
  end if;
  return new;
end;
$$;

revoke all on function public.shape_sync_workout_privacy() from public, anon, authenticated;
drop trigger if exists shape_sync_workout_privacy on public.user_goals;
create trigger shape_sync_workout_privacy
  after insert or update of data on public.user_goals
  for each row execute function public.shape_sync_workout_privacy();
