-- Follow requests for private/friends profiles.
--
-- Public profile  → Follow is immediate (status 'accepted').
-- Friends/Private  → Follow creates a REQUEST (status 'pending'); the owner must
--                    accept before it counts. The requester sees "Requested".
--
-- Adds a `status` column to user_follows and reworks the follow RPCs:
--   • get_follow_stats  → counts only ACCEPTED; adds is_pending (caller→owner)
--   • toggle_follow     → public = accept now, else request; re-toggle cancels
--   • get_follow_list   → only ACCEPTED
--   • respond_follow_request / list_follow_requests (owner accepts/declines)
-- Idempotent. Run on Supabase.

alter table public.user_follows add column if not exists status text not null default 'accepted';

-- normalized profile visibility for a user: 'public' | 'friends' | 'private'
create or replace function public.shape_profile_visibility(p_user_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select coalesce(g.data->>'profileVisibility', 'Public') into v
  from public.user_goals g
  where g.user_id = p_user_id and g.kind = 'client_settings'
  limit 1;
  v := lower(coalesce(v, 'public'));
  if v like 'pub%' then return 'public';
  elsif v like '%friend%' or v like '%circle%' then return 'friends';
  else return 'private'; end if;
end; $$;
grant execute on function public.shape_profile_visibility(uuid) to authenticated, anon;

-- counts (accepted only) + caller's follow / pending state
drop function if exists public.get_follow_stats(uuid);
create function public.get_follow_stats(p_user_id uuid)
returns table (followers int, following int, is_following boolean, is_pending boolean)
language sql security definer set search_path = public as $$
  select
    (select count(*)::int from user_follows where following_id = p_user_id and status = 'accepted'),
    (select count(*)::int from user_follows where follower_id  = p_user_id and status = 'accepted'),
    (select exists (select 1 from user_follows where follower_id = auth.uid() and following_id = p_user_id and status = 'accepted')),
    (select exists (select 1 from user_follows where follower_id = auth.uid() and following_id = p_user_id and status = 'pending'));
$$;
grant execute on function public.get_follow_stats(uuid) to authenticated, anon;

-- follow / request / cancel-or-unfollow toggle
drop function if exists public.toggle_follow(uuid);
create function public.toggle_follow(p_user_id uuid)
returns table (followers int, following int, is_following boolean, is_pending boolean)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); vis text;
begin
  if me is null then raise exception 'Authentication required.'; end if;
  if me = p_user_id then raise exception 'You cannot follow yourself.'; end if;
  if exists (select 1 from user_follows where follower_id = me and following_id = p_user_id) then
    -- already following or already requested → undo (unfollow / cancel request)
    delete from user_follows where follower_id = me and following_id = p_user_id;
  else
    vis := public.shape_profile_visibility(p_user_id);
    insert into user_follows (follower_id, following_id, status)
    values (me, p_user_id, case when vis = 'public' then 'accepted' else 'pending' end)
    on conflict (follower_id, following_id) do nothing;
  end if;
  return query
    select
      (select count(*)::int from user_follows where following_id = p_user_id and status = 'accepted'),
      (select count(*)::int from user_follows where follower_id  = p_user_id and status = 'accepted'),
      (select exists (select 1 from user_follows where follower_id = me and following_id = p_user_id and status = 'accepted')),
      (select exists (select 1 from user_follows where follower_id = me and following_id = p_user_id and status = 'pending'));
end; $$;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- accepted followers/following list (names)
drop function if exists public.get_follow_list(uuid, text);
create function public.get_follow_list(p_user_id uuid, p_kind text)
returns table (user_id uuid, full_name text, role text, since timestamptz)
language sql security definer set search_path = public as $$
  select
    pr.id,
    coalesce(pr.full_name, 'Shape member'),
    coalesce(pr.role, 'client'),
    f.created_at
  from user_follows f
  join profiles pr
    on pr.id = (case when p_kind = 'following' then f.following_id else f.follower_id end)
  where (case when p_kind = 'following' then f.follower_id else f.following_id end) = p_user_id
    and f.status = 'accepted'
  order by f.created_at desc
  limit 200;
$$;
grant execute on function public.get_follow_list(uuid, text) to authenticated, anon;

-- pending requests TO the caller (people who want to follow you)
create or replace function public.list_follow_requests()
returns table (user_id uuid, full_name text, role text, since timestamptz)
language sql security definer set search_path = public as $$
  select
    pr.id,
    coalesce(pr.full_name, 'Shape member'),
    coalesce(pr.role, 'client'),
    f.created_at
  from user_follows f
  join profiles pr on pr.id = f.follower_id
  where f.following_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc
  limit 200;
$$;
grant execute on function public.list_follow_requests() to authenticated;

-- owner accepts (true) or declines (false) a pending request from p_follower_id
create or replace function public.respond_follow_request(p_follower_id uuid, p_accept boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required.'; end if;
  if p_accept then
    update user_follows set status = 'accepted'
    where follower_id = p_follower_id and following_id = me and status = 'pending';
  else
    delete from user_follows
    where follower_id = p_follower_id and following_id = me and status = 'pending';
  end if;
  return (select count(*)::int from user_follows where following_id = me and status = 'pending');
end; $$;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;
