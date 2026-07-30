-- Usernames — every account gets a unique Shape handle (@username).
-- profiles.username + availability / claim / username-login RPCs; universal
-- search matches usernames too. Idempotent — safe to re-run.

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username)) where username is not null;

-- Availability check — signup forms poll this as you type. Granted to anon so
-- the create-account screen can check before the auth user exists.
create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select lower(trim(coalesce(p_username, ''))) ~ '^[a-z0-9][a-z0-9._]{2,19}$'
     and not exists (
       select 1 from public.profiles
       where lower(username) = lower(trim(p_username)) and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     );
$$;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Claim / change my username. 3-20 chars, a-z 0-9 . _ , must start with a
-- letter or digit; unique case-insensitively.
create or replace function public.set_my_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(coalesce(p_username, '')));
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if u !~ '^[a-z0-9][a-z0-9._]{2,19}$' then raise exception 'username_invalid'; end if;
  if exists (select 1 from public.profiles where lower(username) = u and id <> auth.uid()) then
    raise exception 'username_taken';
  end if;
  update public.profiles set username = u where id = auth.uid();
  return u;
end;
$$;
grant execute on function public.set_my_username(text) to authenticated;

-- Username → login email, so the sign-in form accepts either. SECURITY DEFINER
-- read of auth.users; anon so the login page can resolve before auth.
create or replace function public.get_email_for_username(p_username text)
returns text language sql stable security definer set search_path = public as $$
  select au.email::text
  from public.profiles p join auth.users au on au.id = p.id
  where lower(p.username) = lower(trim(coalesce(p_username, '')))
  limit 1;
$$;
grant execute on function public.get_email_for_username(text) to anon, authenticated;

-- Universal search also matches the new username (alongside name, the
-- client_identity @handle, and non-private bio/goal keywords).
-- ⚠ SUPERSEDED for this function by 2026-08-05-search-pattern-hardening.sql
--   (clamps the term to 80 chars, escapes LIKE metacharacters, pins pg_temp).
--   This is `create or replace`, so RE-RUNNING THIS FILE SILENTLY REVERTS that
--   hardening. Apply the 2026-08-05 file again afterwards if you ever do.
create or replace function public.search_shape_people(p_q text default '', p_limit int default 20)
returns table (id uuid, full_name text, role text, avatar text, points bigint)
language sql stable security definer set search_path = public as $$
  with q as (select trim(leading '@' from trim(coalesce(p_q, ''))) as raw)
  select p.id,
         p.full_name,
         coalesce(nullif(p.role, ''), 'client') as role,
         case
           when public.shape_profile_visibility(p.id) = 'private' then null
           else ident.data->>'photo'
         end as avatar,
         coalesce((select sum(l.delta)::bigint from public.score_ledger l where l.user_id = p.id), 0) as points
  from public.profiles p
  cross join q
  left join lateral (
    select g.data from public.user_goals g
    where g.user_id = p.id and g.kind = 'client_identity' limit 1
  ) ident on true
  where auth.uid() is not null
    and coalesce(p.full_name, '') <> ''
    and (
      q.raw = ''
      or p.full_name ilike '%' || q.raw || '%'
      or coalesce(p.username, '') ilike '%' || q.raw || '%'
      or replace(coalesce(ident.data->>'handle', ''), '@', '') ilike '%' || q.raw || '%'
      or (public.shape_profile_visibility(p.id) <> 'private' and (
              coalesce(ident.data->>'bio', '')  ilike '%' || q.raw || '%'
           or coalesce(ident.data->>'goal', '') ilike '%' || q.raw || '%'))
    )
  order by (p.full_name ilike (select raw from q) || '%' or coalesce(p.username, '') ilike (select raw from q) || '%') desc, p.full_name
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
$$;
grant execute on function public.search_shape_people(text, int) to authenticated;

-- get_public_profile also returns the username — handles are public
-- identifiers (shown even on locked cards). DROP + recreate to widen the
-- return type; body otherwise identical to 2026-06-08-profile-custom.sql,
-- with `username` appended as the LAST column (keeps existing readers stable).
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
  avatar text,
  is_public boolean,
  visibility text,
  can_view boolean,
  custom jsonb,
  username text
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
  cust as (
    select g.data as d
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'profile_custom'
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
    (select d->>'photo' from ident),   -- avatar: ALWAYS returned (ungated)
    ((select norm from vis) = 'public'),
    (select norm from acc),
    (select can_view from acc),
    case when (select can_view from acc) then (select d from cust) end,
    p.username
  from public.profiles p
  where p.id = p_user_id;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;
