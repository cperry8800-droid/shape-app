-- Sell-a-plan preview: surface a coach plan's `detail` (which now carries the
-- coach-uploaded demo `media` — photos & videos) on the public sale-plans RPC so
-- a buyer can preview the workout media on the coach's profile before buying.
-- DROP first: the prior version returned fewer columns and Postgres won't let
-- `create or replace` change a function's return type. Idempotent. Run on Supabase.

drop function if exists public.get_coach_sale_plans(text, bigint);
create or replace function public.get_coach_sale_plans(p_provider_role text, p_provider_id bigint)
returns table (id uuid, kind text, name text, meta text, price text, category text, detail jsonb)
language sql stable security definer set search_path = public as $$
  with own as (
    select case
      when p_provider_role = 'nutritionist' then (select owner_id from nutritionists where id = p_provider_id)
      else (select owner_id from trainers where id = p_provider_id)
    end as oid
  )
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category,
    cp.detail
  from coach_plans cp
  where cp.owner_id = (select oid from own)
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;
grant execute on function public.get_coach_sale_plans(text, bigint) to authenticated, anon;

-- Same `detail` passthrough on the by-user variant (the Signal public profile).
drop function if exists public.get_coach_sale_plans_by_user(uuid);
create or replace function public.get_coach_sale_plans_by_user(p_user_id uuid)
returns table (id uuid, kind text, name text, meta text, price text, category text, provider_id bigint, provider_role text, detail jsonb)
language sql stable security definer set search_path = public as $$
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category,
    case when cp.kind = 'meal_plan'
      then (select id from nutritionists where owner_id = cp.owner_id limit 1)
      else (select id from trainers where owner_id = cp.owner_id limit 1)
    end as provider_id,
    case when cp.kind = 'meal_plan' then 'nutritionist' else 'trainer' end as provider_role,
    cp.detail
  from coach_plans cp
  where cp.owner_id = p_user_id
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;
grant execute on function public.get_coach_sale_plans_by_user(uuid) to authenticated, anon;
