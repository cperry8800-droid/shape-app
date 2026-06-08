-- Marketplace "What's hot" rail: published, PRICED coach_plans across ALL coaches,
-- categorised into three tabs (program / workout / meal) so the mobile + website
-- marketplace can show real buyable plans (name + price + coach) and run the same
-- Stripe Connect checkout. Public read (anon + authenticated). SECURITY DEFINER
-- because coach_plans is owner-RLS. Idempotent. Run on Supabase.

drop function if exists public.get_market_plans();
create or replace function public.get_market_plans()
returns table (
  id uuid, kind text, tab text, name text, meta text, price text,
  coach_name text, owner_id uuid, provider_id bigint, provider_role text
)
language sql stable security definer set search_path = public as $$
  select cp.id, cp.kind,
    case
      when cp.kind = 'meal_plan' then 'meal'
      when lower(coalesce(cp.detail->>'buildType', '')) in ('workout', 'single', 'session') then 'workout'
      else 'program'
    end as tab,
    cp.name, cp.meta, cp.price,
    coalesce(p.full_name, 'Shape coach') as coach_name,
    cp.owner_id,
    case when cp.kind = 'meal_plan'
      then (select id from nutritionists where owner_id = cp.owner_id limit 1)
      else (select id from trainers where owner_id = cp.owner_id limit 1)
    end as provider_id,
    case when cp.kind = 'meal_plan' then 'nutritionist' else 'trainer' end as provider_role
  from coach_plans cp
  left join profiles p on p.id = cp.owner_id
  where cp.published = true
    and coalesce(nullif(trim(cp.price), ''), '') <> ''
  order by cp.created_at desc
  limit 60;
$$;
grant execute on function public.get_market_plans() to authenticated, anon;
