-- claim_provider_row: admin-managed, service-role only — AUTHZ-P2-claim-jack
-- (docs/SECURITY-AUDIT-2026-06-30.md §2b).
--
-- claim_provider_row(text, bigint) was SECURITY DEFINER + EXECUTE-able by
-- authenticated, and assigned owner_id = auth.uid() to any UNCLAIMED trainer /
-- nutritionist / gym row. The /dashboard/claim route is admin-gated
-- (requireAdminUser, prior fix), but a user could call the RPC directly via
-- PostgREST and claim a seeded/demo provider listing -> coach role + that
-- profile's subscribers + revenue (privilege escalation).
--
-- There is no DB-level admin predicate (admin is env-based in TS), so the fix is
-- to run the claim under the SERVICE ROLE. Replace the 2-arg function (which used
-- auth.uid()) with a 3-arg version that takes the target owner explicitly, REVOKE
-- it from public/anon/authenticated, and grant only service_role. The route now
-- calls it via createAdminClient passing the (admin) user's id.
--
-- DEPLOY TOGETHER with the route change (src/app/dashboard/claim/actions.ts):
-- between applying this migration and deploying the new code the admin-only claim
-- flow may briefly fail (rare + admin-only). Idempotent.

drop function if exists public.claim_provider_row(text, bigint);

create or replace function public.claim_provider_row(p_role text, p_provider_id bigint, p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_owner_id is null then
    raise exception 'owner required' using errcode = '22023';
  end if;
  if p_role = 'trainer' then
    update public.trainers set owner_id = p_owner_id where id = p_provider_id and owner_id is null;
  elsif p_role = 'nutritionist' then
    update public.nutritionists set owner_id = p_owner_id where id = p_provider_id and owner_id is null;
  elsif p_role = 'gym' then
    update public.gyms set owner_id = p_owner_id where id = p_provider_id and owner_id is null;
  else
    raise exception 'invalid role %', p_role;
  end if;
end;
$function$;

revoke execute on function public.claim_provider_row(text, bigint, uuid) from public, anon, authenticated;
grant  execute on function public.claim_provider_row(text, bigint, uuid) to service_role;

-- Verify after apply (expect f):
--   select has_function_privilege('authenticated',
--     'public.claim_provider_row(text,bigint,uuid)'::regprocedure, 'EXECUTE');
