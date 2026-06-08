-- "Who to follow" suggestions — members the caller doesn't already follow (or
-- have a pending request to), ranked: people who follow you (follow-back) →
-- mutual connections (followed by people you follow) → most-followed → name.
-- Returns enough to render a card with a reason chip. SECURITY DEFINER so it can
-- read the follow graph; only exposes public profile fields. Idempotent.

create or replace function public.get_follow_suggestions(p_limit int default 20)
returns table (
  user_id uuid,
  full_name text,
  role text,
  followers int,
  follows_me boolean,
  mutuals int
)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  my_following as (
    select following_id from user_follows
    where follower_id = (select id from me) and status = 'accepted'
  ),
  connected as (
    -- already following / requested → exclude; plus myself
    select following_id as uid from user_follows where follower_id = (select id from me)
    union all
    select (select id from me)
  ),
  cand as (
    select p.id, p.full_name, p.role
    from profiles p
    where p.id is not null
      and p.id <> (select id from me)
      and p.id not in (select uid from connected)
  )
  select
    c.id,
    coalesce(c.full_name, 'Shape member'),
    coalesce(c.role, 'client'),
    (select count(*)::int from user_follows f where f.following_id = c.id and f.status = 'accepted'),
    exists (select 1 from user_follows f where f.follower_id = c.id and f.following_id = (select id from me) and f.status = 'accepted'),
    (select count(*)::int from user_follows f where f.following_id = c.id and f.status = 'accepted' and f.follower_id in (select following_id from my_following))
  from cand c
  order by
    exists (select 1 from user_follows f where f.follower_id = c.id and f.following_id = (select id from me) and f.status = 'accepted') desc,
    (select count(*)::int from user_follows f where f.following_id = c.id and f.status = 'accepted' and f.follower_id in (select following_id from my_following)) desc,
    (select count(*)::int from user_follows f where f.following_id = c.id and f.status = 'accepted') desc,
    coalesce(c.full_name, 'zzz') asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
grant execute on function public.get_follow_suggestions(int) to authenticated;
