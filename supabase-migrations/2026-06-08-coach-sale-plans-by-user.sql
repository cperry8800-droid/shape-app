-- Sell-a-plan, by owner user id: the Signal public profile (reached from chat /
-- feed avatars) only knows a coach's auth user id, not their marketplace
-- provider-row id. This variant returns the same PUBLISHED plans straight from
-- the owner, so the profile's Coaching tab can show a coach's real catalogue
-- (workouts / programs / meals / diets) just like the marketplace detail page.
-- Public read (anon + authenticated). Idempotent. Run on Supabase.

create or replace function public.get_coach_sale_plans_by_user(p_user_id uuid)
returns table (id uuid, kind text, name text, meta text, price text, category text)
language sql stable security definer set search_path = public as $$
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category
  from coach_plans cp
  where cp.owner_id = p_user_id
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;
grant execute on function public.get_coach_sale_plans_by_user(uuid) to authenticated, anon;
