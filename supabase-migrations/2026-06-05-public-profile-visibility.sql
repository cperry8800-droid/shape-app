-- Adds an `is_public` flag to get_public_profile so a viewer can be told when a
-- member has chosen to keep their profile private (vs. just having no bio set).
-- Body is otherwise identical to 2026-06-04-public-profile-card.sql. Adding a
-- return column requires DROP + CREATE (CREATE OR REPLACE can't change the
-- output columns). Idempotent; safe to re-run.

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
  is_public boolean
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
  vis as (
    select coalesce(g.data->>'profileVisibility', 'Public') as v
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_settings'
    limit 1
  )
  select
    p.id,
    coalesce(p.full_name, 'Shape member'),
    p.role,
    (select points from pts),
    case when coalesce((select v from vis), 'Public') = 'Public' then (select d->>'bio' from ident) end,
    case when coalesce((select v from vis), 'Public') = 'Public' then (select d->>'pronouns' from ident) end,
    case when coalesce((select v from vis), 'Public') = 'Public' then (select d->>'goal' from ident) end,
    case when coalesce((select v from vis), 'Public') = 'Public' then (select d->>'link' from ident) end,
    (coalesce((select v from vis), 'Public') = 'Public')
  from public.profiles p
  where p.id = p_user_id;
$$;
grant execute on function public.get_public_profile(uuid) to authenticated;
