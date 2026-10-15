-- What a coach sees about the person they coach (client-onboarding review, fix 2c: H8, M17).
--
-- ⚠ THE COACH COULD SEE ALMOST NOTHING THE CLIENT SAID ABOUT THEMSELVES (review H8).
-- - The health screening was readable only through an active MONTHLY subscription
--   (is_coach_on_client), so a coach whose client booked a single session read
--   "No health profile on file".
-- - The goal the client picked, their training and diet preferences (injuries, equipment,
--   allergies, dislikes) and whether they want coaching sat in user_goals, readable by the member
--   alone.
-- - The old intake table, client_intakes, had a coach policy and no screen that read it, and
--   holds no rows.
--
-- This migration:
-- - is_coach_with_client(client): a coach on this client by an active subscription
--   (is_coach_on_client), OR by a session with them that is not cancelled or declined and is
--   upcoming or in the last 90 days, OR by a paid one-time session purchase in the last 90 days.
--   A program or meal-plan purchase is a product, not a coaching relationship (fix 2b's rule), and
--   is not one.
-- - get_client_health_profile now gates on it, so a session client's screening reaches their coach.
-- - get_client_intake(client): one coach-only read of the screening, the goal (only while the
--   member shares their goals, as get_client_goals), the training and diet preferences, and the
--   coaching answer. Null to anyone who is not their coach.
-- - client_intakes is dropped, after checking it is still empty (it refuses otherwise).
--
-- Re-runnable: "create or replace", "if exists", and a guard that checks the result.

begin;

create or replace function public.is_coach_with_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and p_client_id is not null and (
    public.is_coach_on_client(p_client_id)
    or exists (
      select 1 from public.sessions s
      where s.client_id = p_client_id
        and coalesce(s.status, '') not in ('cancelled', 'canceled', 'declined')
        and s.scheduled_at >= now() - interval '90 days'
        and (
          (s.provider_role = 'trainer' and exists (select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = auth.uid()))
          or (s.provider_role = 'nutritionist' and exists (select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = auth.uid()))
        )
    )
    or exists (
      select 1 from public.one_time_purchases p
      where p.client_id = p_client_id
        and p.kind = 'booking'
        and p.status = 'paid'
        and p.created_at >= now() - interval '90 days'
        and (
          (p.provider_role = 'trainer' and exists (select 1 from public.trainers t where t.id = p.provider_id and t.owner_id = auth.uid()))
          or (p.provider_role = 'nutritionist' and exists (select 1 from public.nutritionists n where n.id = p.provider_id and n.owner_id = auth.uid()))
        )
    )
  );
$$;

-- Health profile (PAR-Q+ screening, injuries, medications). DELIBERATELY not share-gated: the
-- coach always sees it (the liability screen is the point). Now for session clients too.
create or replace function public.get_client_health_profile(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.data from public.user_goals g
  where g.user_id = p_user_id
    and g.kind = 'health_profile'
    and public.is_coach_with_client(p_user_id)
  limit 1;
$$;

-- One coach-only read of who the client is. Null to anyone who is not their coach.
create or replace function public.get_client_intake(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d jsonb;
  goals jsonb;
  shared boolean;
  pick_training text[] := array['primary_goal', 'experience', 'sessions_per_week', 'equipment', 'injuries', 'preferred_times'];
  pick_nutrition text[] := array['dietary_style', 'allergies', 'dislikes', 'protein_target_g', 'calorie_range', 'meal_cadence', 'supplements', 'alcohol', 'hydration_target_l'];
begin
  if not public.is_coach_with_client(p_user_id) then
    return null;
  end if;
  select coalesce(jsonb_object_agg(g.kind, g.data), '{}'::jsonb) into d
  from public.user_goals g
  where g.user_id = p_user_id
    and g.kind in ('health_profile', 'client_goals', 'client_identity', 'client_training_prefs', 'client_nutrition_prefs', 'client_onboarding');
  goals := case when jsonb_typeof(d->'client_goals') = 'object' then d->'client_goals' else '{}'::jsonb end;
  -- The goal follows the member's own "share my goals" switch, as get_client_goals does.
  shared := coalesce(goals->>'share', 'true') <> 'false';
  return jsonb_build_object(
    'health', case when jsonb_typeof(d->'health_profile') = 'object' and d->'health_profile' <> '{}'::jsonb then d->'health_profile' else null end,
    'goalShared', shared,
    'goal', case when shared then nullif(goals->>'primaryGoal', '') else null end,
    'goalLabel', case when shared and jsonb_typeof(d->'client_identity') = 'object' then nullif(d->'client_identity'->>'goal', '') else null end,
    'training', case when jsonb_typeof(d->'client_training_prefs') = 'object' then (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(d->'client_training_prefs') e where e.key = any (pick_training)
    ) else '{}'::jsonb end,
    'nutrition', case when jsonb_typeof(d->'client_nutrition_prefs') = 'object' then (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(d->'client_nutrition_prefs') e where e.key = any (pick_nutrition)
    ) else '{}'::jsonb end,
    'wantsCoaching', case when jsonb_typeof(d->'client_onboarding'->'wantsCoaching') = 'boolean' then d->'client_onboarding'->'wantsCoaching' else null end,
    'coachingFor', case when jsonb_typeof(d->'client_onboarding'->'coachingFor') = 'array' then d->'client_onboarding'->'coachingFor' else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.is_coach_with_client(uuid) from public, anon;
grant execute on function public.is_coach_with_client(uuid) to authenticated, service_role;
revoke all on function public.get_client_health_profile(uuid) from public, anon;
grant execute on function public.get_client_health_profile(uuid) to authenticated, service_role;
revoke all on function public.get_client_intake(uuid) from public, anon;
grant execute on function public.get_client_intake(uuid) to authenticated, service_role;

-- ── Retire client_intakes: no rows, no reader. Refuses if anything was written since. ─────
do $retire$
begin
  if to_regclass('public.client_intakes') is not null then
    if exists (select 1 from public.client_intakes) then
      raise exception 'client_intakes holds rows: move them before retiring the table';
    end if;
    drop table public.client_intakes;
  end if;
end
$retire$;
drop function if exists public.client_intakes_touch_updated_at();

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if to_regclass('public.client_intakes') is not null then
    raise exception 'client_intakes is still there';
  end if;
  if exists (
    select 1 from unnest(array[
      'public.is_coach_with_client(uuid)',
      'public.get_client_health_profile(uuid)',
      'public.get_client_intake(uuid)'
    ]) f(sig)
    where has_function_privilege('anon', f.sig, 'execute')
       or not has_function_privilege('authenticated', f.sig, 'execute')
  ) then
    raise exception 'the coach reads must be executable by signed-in callers only';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_coach_with_client', 'get_client_health_profile', 'get_client_intake')
      and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'))
  ) then
    raise exception 'the coach reads must be definer functions with a pinned search_path';
  end if;
  -- Signed out, every read answers nothing.
  if public.is_coach_with_client('00000000-0000-0000-0000-000000000000'::uuid) then
    raise exception 'is_coach_with_client answered true with no caller';
  end if;
end
$guard$;

commit;
