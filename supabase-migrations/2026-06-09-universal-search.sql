-- Universal search — find anyone with a Shape account (member or coach).
-- Matches name, @handle, and (for non-private profiles) bio + goal keywords.
-- One call returns everything the search screen needs: role (client/trainer/
-- nutritionist), profile photo, and all-time points (→ tier color). Privacy:
-- names + tiers are already public app-wide (chat, leaderboard, locked profile
-- cards); the photo is withheld — and bio/goal keywords are NOT matched — for
-- accounts whose profile visibility is 'private'. Idempotent — safe to re-run.

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
      or replace(coalesce(ident.data->>'handle', ''), '@', '') ilike '%' || q.raw || '%'
      or (public.shape_profile_visibility(p.id) <> 'private' and (
              coalesce(ident.data->>'bio', '')  ilike '%' || q.raw || '%'
           or coalesce(ident.data->>'goal', '') ilike '%' || q.raw || '%'))
    )
  order by (p.full_name ilike (select raw from q) || '%') desc, p.full_name
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
$$;

grant execute on function public.search_shape_people(text, int) to authenticated;
