-- Meal shares never earn the +5 community-post award (spec 2026-07-12).
--
-- The meal LOG already earns through award_meal_log; re-broadcasting a logged
-- meal to the feed must not pay again (per-meal +5s are a farm vector). The
-- app's share path also skips its client-side award call, but the web route
-- (/api/community/feed POST) invokes this RPC unconditionally on every insert
-- — this guard is the defense in depth that covers both paths.
--
-- Identical to the 2026-06-18 definition plus the meal exemption in the
-- eligibility gate: the RPC returns without inserting (stays `returns void`)
-- when the post is a meal by activity_type OR metrics kind.

create or replace function public.award_community_post(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_post_id is null then return; end if;
  -- Only a real, caller-owned, feed-visible, NON-MEAL post earns.
  -- Private/profile-only posts, other users' posts, and meal shares award
  -- nothing.
  if not exists (
    select 1 from public.community_posts
    where id = p_post_id and author_id = v_uid and privacy in ('public', 'community')
      and coalesce(activity_type, '') <> 'meal'
      and coalesce(metrics->>'kind', '') <> 'meal'
  ) then return; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'community', 'community_post', p_post_id, 5, 'Community post')
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;

grant execute on function public.award_community_post(uuid) to authenticated;
