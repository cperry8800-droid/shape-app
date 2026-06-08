-- Sell-a-plan, by owner user id: the public coach profile (mobile Signal +
-- website desktop, reached from chat / feed avatars) only knows a coach's auth
-- user id, not their marketplace provider-row id. This returns the same
-- PUBLISHED plans straight from the owner — plus the provider id + role so the
-- profile can run the SAME Stripe Connect checkout as the marketplace (buy a
-- plan). Public read (anon + authenticated). Idempotent. Run on Supabase.
--
-- Provider is resolved by the plan's kind: meal_plan → the owner's nutritionist
-- row, everything else → their trainer row (matches the checkout's role table).

drop function if exists public.get_coach_sale_plans_by_user(uuid);
create or replace function public.get_coach_sale_plans_by_user(p_user_id uuid)
returns table (id uuid, kind text, name text, meta text, price text, category text, provider_id bigint, provider_role text)
language sql stable security definer set search_path = public as $$
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category,
    case when cp.kind = 'meal_plan'
      then (select id from nutritionists where owner_id = cp.owner_id limit 1)
      else (select id from trainers where owner_id = cp.owner_id limit 1)
    end as provider_id,
    case when cp.kind = 'meal_plan' then 'nutritionist' else 'trainer' end as provider_role
  from coach_plans cp
  where cp.owner_id = p_user_id
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;
grant execute on function public.get_coach_sale_plans_by_user(uuid) to authenticated, anon;
