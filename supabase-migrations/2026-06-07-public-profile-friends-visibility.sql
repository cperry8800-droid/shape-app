-- Profile visibility: public / friends / private — enforced server-side.
--
-- Visibility is stored in user_goals('client_settings').profileVisibility
-- ('Public' | 'Just friends' | 'Private'); the mobile profile's privacy selector
-- and Settings → Profile visibility both write it. This normalizes it to
-- public/friends/private and gates the detail columns (bio/pronouns/goal/link):
--   • public  → anyone
--   • friends → the owner, or a viewer who shares a member 1:1 conversation
--               (conversations.dm_key) with the owner — i.e. their circle
--   • private → only the owner
--
-- Adds `visibility` (normalized) and `can_view` (does THIS viewer get details)
-- to get_public_profile. `is_public` is kept for back-compat (= visibility
-- 'public'). Adding return columns requires DROP + CREATE. Idempotent.

drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  role text,
  points bigint,
  bio text,
  pronouns text,
  goal text,
  link text,
  is_public boolean,
  visibility text,
  can_view boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with pts as (
    select coalesce(sum(delta), 0)::bigint as points
    from public.score_ledger where user_id = p_user_id
  ),
  ident as (
    select g.data as d
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_identity'
    limit 1
  ),
  visraw as (
    select coalesce(g.data->>'profileVisibility', 'Public') as v
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_settings'
    limit 1
  ),
  vis as (
    select case
      when lower(coalesce((select v from visraw), 'public')) like 'pub%' then 'public'
      when lower(coalesce((select v from visraw), 'public')) like '%friend%'
        or lower(coalesce((select v from visraw), 'public')) like '%circle%' then 'friends'
      else 'private'
    end as norm
  ),
  fr as (
    select exists (
      select 1
      from public.conversation_participants me
      join public.conversation_participants them
        on them.conversation_id = me.conversation_id
      join public.conversations c on c.id = me.conversation_id
      where me.user_id = auth.uid()
        and them.user_id = p_user_id
        and c.dm_key is not null
    ) as is_friend
  ),
  acc as (
    select
      (select norm from vis) as norm,
      ((select norm from vis) = 'public')
        or (auth.uid() = p_user_id)
        or ((select norm from vis) = 'friends' and (select is_friend from fr))
        as can_view
  )
  select
    p.id,
    coalesce(p.full_name, 'Shape member'),
    p.role,
    (select points from pts),
    case when (select can_view from acc) then (select d->>'bio' from ident) end,
    case when (select can_view from acc) then (select d->>'pronouns' from ident) end,
    case when (select can_view from acc) then (select d->>'goal' from ident) end,
    case when (select can_view from acc) then (select d->>'link' from ident) end,
    ((select norm from vis) = 'public'),
    (select norm from acc),
    (select can_view from acc)
  from public.profiles p
  where p.id = p_user_id;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;
