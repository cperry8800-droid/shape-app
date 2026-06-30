-- RPC authorization hardening — AUTHZ-P1-fulfillment-pii + 4x AUTHZ-P2
-- (docs/SECURITY-AUDIT-2026-06-30.md §2b).
--
-- Supabase auto-grants EXECUTE on every public function to anon+authenticated.
-- These SECURITY DEFINER functions either (a) have NO caller check and are only
-- ever called by the service role / an admin route, or (b) used `auth.uid() IS
-- NULL` (which anon also satisfies) as an implicit guard. Verified callers:
--   - admin_list_store_fulfillment / admin_mark_store_fulfilled: NO app caller
--     (admin-only). anon could read every merch redemption incl. ship_to (PII).
--   - consume_store_credit: called by the Stripe webhook via the SERVICE ROLE only.
--   - set_metric_source / set_program_detail: called by authenticated users; the
--     anon write came from NULL-logic ( `x <> auth.uid()` is NULL when auth.uid()
--     is NULL, so `if (NULL and ...) then raise` never fired for anon ).
--
-- Fix:
--   1. REVOKE EXECUTE from public/anon/authenticated on the three service-role/
--      admin-only functions; keep service_role. (A bare `revoke ... from public`
--      can drop service_role too, so we re-grant it explicitly — same gotcha as
--      the 2026-06-29 league_assign_cohort fix.)
--   2. Add an explicit `auth.uid() is null` reject at the top of set_metric_source
--      and set_program_detail (bodies otherwise unchanged — fetched verbatim via
--      pg_get_functiondef).
-- Idempotent. OWNER: apply on Supabase, then re-verify (see footer).

-- ===== 1. service-role / admin-only: revoke from clients =====
revoke execute on function public.admin_list_store_fulfillment() from public, anon, authenticated;
grant  execute on function public.admin_list_store_fulfillment() to service_role;

revoke execute on function public.admin_mark_store_fulfilled(uuid, text) from public, anon, authenticated;
grant  execute on function public.admin_mark_store_fulfilled(uuid, text) to service_role;

revoke execute on function public.consume_store_credit(uuid, text, text, integer) from public, anon, authenticated;
grant  execute on function public.consume_store_credit(uuid, text, text, integer) to service_role;

-- ===== 2. authenticated-callable, but reject anon (NULL-logic bypass) =====
-- Only change vs the live definition is the first statement after `begin`.
CREATE OR REPLACE FUNCTION public.set_metric_source(p_user_id uuid, p_metric text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := coalesce(p_user_id, auth.uid()); v_obs record;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if v_uid <> auth.uid() and not public.is_coach_on_client(v_uid) then
    raise exception 'Not authorized for this user.' using errcode = '42501'; end if;
  if not public._reconcilable_metric(p_metric) then
    raise exception 'Unknown metric %', p_metric using errcode = '22023'; end if;
  insert into public.metric_source_overrides (user_id, metric, source, set_by, updated_at)
  values (v_uid, p_metric, p_source, auth.uid(), now())
  on conflict (user_id, metric) do update set source = excluded.source, set_by = excluded.set_by, updated_at = now();
  select o.snapshot_date, o.value into v_obs
  from public.health_metric_observations o
  where o.user_id = v_uid and o.metric = p_metric and o.source = p_source
  order by o.snapshot_date desc limit 1;
  if found then
    execute format(
      'update public.daily_health_snapshot set %I = $1, sources = jsonb_set(coalesce(sources, ''{}''::jsonb), array[$2], to_jsonb($3::text), true), updated_at = now() where user_id = $4 and snapshot_date = $5',
      p_metric
    ) using v_obs.value, p_metric, p_source, v_uid, v_obs.snapshot_date;
  end if;
  return jsonb_build_object('ok', true, 'metric', p_metric, 'source', p_source);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_program_detail(p_client_id uuid, p_discipline text, p_phase text, p_detail jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := case p_discipline when 'training' then 'trainer'
                                   when 'nutrition' then 'nutritionist' end;
  v_row public.client_programs;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if v_role is null then
    raise exception 'invalid discipline %, expected training or nutrition', p_discipline
      using errcode = '22023';
  end if;
  if not (auth.uid() = p_client_id or public.is_discipline_coach_on_client(p_client_id, v_role)) then
    raise exception 'Not authorized to set the % program for this client.', p_discipline
      using errcode = '42501';
  end if;

  insert into public.client_programs as cp (user_id, training_phase, nutrition_phase, detail, updated_by, updated_at)
  values (
    p_client_id,
    case when p_discipline = 'training'  then p_phase else null end,
    case when p_discipline = 'nutrition' then p_phase else null end,
    case when p_detail is null then '{}'::jsonb
         else jsonb_set('{}'::jsonb, array[p_discipline], p_detail, true) end,
    auth.uid(), now()
  )
  on conflict (user_id) do update set
    training_phase  = case when p_discipline = 'training'  then coalesce(p_phase, cp.training_phase)  else cp.training_phase  end,
    nutrition_phase = case when p_discipline = 'nutrition' then coalesce(p_phase, cp.nutrition_phase) else cp.nutrition_phase end,
    detail = case when p_detail is null then cp.detail
                  else jsonb_set(coalesce(cp.detail, '{}'::jsonb), array[p_discipline],
                                 coalesce(cp.detail -> p_discipline, '{}'::jsonb) || p_detail, true) end,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'trainingPhase', v_row.training_phase,
    'nutritionPhase', v_row.nutrition_phase,
    'detail', v_row.detail
  );
end;
$function$;

-- Verify after apply:
--   -- (1) revoked functions: expect anon=f authenticated=f service_role=t
--   select p.proname,
--     has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--     has_function_privilege('authenticated', p.oid, 'EXECUTE') as authd,
--     has_function_privilege('service_role', p.oid, 'EXECUTE')  as svc
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public'
--     and p.proname in ('admin_list_store_fulfillment','admin_mark_store_fulfilled','consume_store_credit');
--   -- (2) anon reject: calling set_metric_source / set_program_detail as anon now raises 42501.
