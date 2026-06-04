-- Public profile card for chat: lets any signed-in member view another member's
-- name, role, tier (from their Shape Score), and — only if they've set their
-- profile to Public — their bio/pronouns/goal/link. Plus a batch points lookup
-- so the feed can tint avatars/bubbles by each author's real tier.
--
-- score_ledger RLS is self-only, so these run SECURITY DEFINER (like the
-- leaderboard) to aggregate cross-user totals. Idempotent.

-- All-time points for a single member (tier is computed client-side from this).
create or replace function public.get_public_profile(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  role text,
  points bigint,
  bio text,
  pronouns text,
  goal text,
  link text
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
    case when coalesce((select v from vis), 'Public') = 'Public' then (select d->>'link' from ident) end
  from public.profiles p
  where p.id = p_user_id;
$$;
grant execute on function public.get_public_profile(uuid) to authenticated;

-- Batch all-time points for many members (feed tier coloring).
create or replace function public.get_user_points(p_ids uuid[])
returns table (user_id uuid, points bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.user_id, coalesce(sum(l.delta), 0)::bigint as points
  from public.score_ledger l
  where l.user_id = any(p_ids)
  group by l.user_id;
$$;
grant execute on function public.get_user_points(uuid[]) to authenticated;
