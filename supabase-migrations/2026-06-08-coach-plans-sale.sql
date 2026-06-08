-- Sell-a-plan: let clients buy a coach's published plan through the existing
-- Stripe Connect checkout, and own it afterwards.
--
--   • get_coach_sale_plans(role, provider_id) — a coach's PUBLISHED, priced
--     plans, readable by anyone (so a buyer can see what's for sale). Maps the
--     marketplace provider row → the coach's owner_id.
--   • one_time_purchases.plan_id — which coach_plan a purchase was for.
--   • get_my_purchased_plans() — the buyer's paid plans (→ unlocked in Library).
-- Idempotent. Run on Supabase.

alter table public.one_time_purchases
  add column if not exists plan_id uuid references public.coach_plans(id) on delete set null;

-- A marketplace coach's PUBLISHED plans (for their profile catalogue). Priced
-- plans are buyable; others are just listed. `category` (from the AI-draft
-- buildType, else the kind) drives the per-role tabs on the profile.
create or replace function public.get_coach_sale_plans(p_provider_role text, p_provider_id bigint)
returns table (id uuid, kind text, name text, meta text, price text, category text)
language sql stable security definer set search_path = public as $$
  with own as (
    select case
      when p_provider_role = 'nutritionist' then (select owner_id from nutritionists where id = p_provider_id)
      else (select owner_id from trainers where id = p_provider_id)
    end as oid
  )
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category
  from coach_plans cp
  where cp.owner_id = (select oid from own)
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;
grant execute on function public.get_coach_sale_plans(text, bigint) to authenticated, anon;

-- The signed-in buyer's purchased (paid) plans — drives the Library unlock.
create or replace function public.get_my_purchased_plans()
returns table (id uuid, kind text, name text, meta text, detail jsonb, provider_role text, purchased_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cp.id, cp.kind, cp.name, cp.meta, cp.detail, otp.provider_role, otp.created_at
  from one_time_purchases otp
  join coach_plans cp on cp.id = otp.plan_id
  where otp.client_id = auth.uid() and otp.status = 'paid' and otp.plan_id is not null
  order by otp.created_at desc;
$$;
grant execute on function public.get_my_purchased_plans() to authenticated;
