-- Follower / following system (mobile + website public profiles).
-- A simple directed follow graph + SECURITY DEFINER helpers for counts, the
-- caller's follow-state, a toggle, and a names list (for the followers/following
-- sheet). Idempotent — safe to re-run.

create table if not exists public.user_follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id)
);

alter table public.user_follows enable row level security;

drop policy if exists "follows public read" on public.user_follows;
create policy "follows public read" on public.user_follows
  for select using (true);

drop policy if exists "follows self insert" on public.user_follows;
create policy "follows self insert" on public.user_follows
  for insert to authenticated
  with check (follower_id = auth.uid() and following_id <> auth.uid());

drop policy if exists "follows self delete" on public.user_follows;
create policy "follows self delete" on public.user_follows
  for delete to authenticated
  using (follower_id = auth.uid());

create index if not exists user_follows_following_idx on public.user_follows (following_id);
create index if not exists user_follows_follower_idx on public.user_follows (follower_id);

-- counts + whether the caller follows p_user_id
create or replace function public.get_follow_stats(p_user_id uuid)
returns table (followers int, following int, is_following boolean)
language sql security definer set search_path = public as $$
  select
    (select count(*)::int from user_follows where following_id = p_user_id),
    (select count(*)::int from user_follows where follower_id  = p_user_id),
    (select exists (select 1 from user_follows where follower_id = auth.uid() and following_id = p_user_id));
$$;
grant execute on function public.get_follow_stats(uuid) to authenticated, anon;

-- follow/unfollow toggle → returns the fresh counts + state
create or replace function public.toggle_follow(p_user_id uuid)
returns table (followers int, following int, is_following boolean)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required.'; end if;
  if me = p_user_id then raise exception 'You cannot follow yourself.'; end if;
  if exists (select 1 from user_follows where follower_id = me and following_id = p_user_id) then
    delete from user_follows where follower_id = me and following_id = p_user_id;
  else
    insert into user_follows (follower_id, following_id) values (me, p_user_id) on conflict do nothing;
  end if;
  return query
    select
      (select count(*)::int from user_follows where following_id = p_user_id),
      (select count(*)::int from user_follows where follower_id  = p_user_id),
      (select exists (select 1 from user_follows where follower_id = me and following_id = p_user_id));
end; $$;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- list followers (p_kind='followers') or following (p_kind='following') for a
-- user, with display name + role (joined from profiles). Newest first.
create or replace function public.get_follow_list(p_user_id uuid, p_kind text)
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
  order by f.created_at desc
  limit 200;
$$;
grant execute on function public.get_follow_list(uuid, text) to authenticated, anon;
