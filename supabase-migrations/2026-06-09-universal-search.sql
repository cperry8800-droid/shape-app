-- Universal search — find anyone with a Shape account (member or coach) by name.
-- One call returns everything the search screen needs: role (client/trainer/
-- nutritionist), profile photo, and all-time points (→ tier color). Privacy:
-- names + tiers are already public app-wide (chat, leaderboard, locked profile
-- cards); the photo is withheld for accounts whose profile visibility is
-- 'private'. Idempotent — safe to re-run.

create or replace function public.search_shape_people(p_q text default '', p_limit int default 20)
returns table (id uuid, full_name text, role text, avatar text, points bigint)
language sql stable security definer set search_path = public as $$
  select p.id,
         p.full_name,
         coalesce(nullif(p.role, ''), 'client') as role,
         case
           when public.shape_profile_visibility(p.id) = 'private' then null
           else (select g.data->>'photo' from public.user_goals g
                  where g.user_id = p.id and g.kind = 'client_identity' limit 1)
         end as avatar,
         coalesce((select sum(l.delta)::bigint from public.score_ledger l where l.user_id = p.id), 0) as points
  from public.profiles p
  where auth.uid() is not null
    and coalesce(p.full_name, '') <> ''
    and (coalesce(p_q, '') = '' or p.full_name ilike '%' || p_q || '%')
  order by (p.full_name ilike p_q || '%') desc, p.full_name
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
$$;

grant execute on function public.search_shape_people(text, int) to authenticated;
