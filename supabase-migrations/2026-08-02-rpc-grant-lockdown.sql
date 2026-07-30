-- Close four SECURITY DEFINER functions that anon can execute in production.
--
-- ⚠ THE BUG CLASS, AND WHY IT KEEPS COMING BACK.
--
-- `revoke all on function ... from public` DOES NOT REVOKE FROM anon OR
-- authenticated. Supabase ships ALTER DEFAULT PRIVILEGES that grant EXECUTE on
-- every new function in `public` EXPLICITLY to those two roles. `from public`
-- removes only the implicit PUBLIC grant; the two explicit ones survive
-- untouched, and the function stays callable by the whole internet through
-- PostgREST's /rest/v1/rpc/ endpoint.
--
-- This repo has already shipped this vulnerability once: league_assign_cohort
-- was left executable by `authenticated` after exactly this revoke, and any
-- logged-in user could self-promote their league tier. That was fixed in
-- 2026-06-29 and the rule was written down in 2026-06-30-rpc-authz-hardening.sql
-- ("Supabase auto-grants EXECUTE on every public function to anon+authenticated").
-- The 2026-06-18 score functions were never retro-fitted, and a live grant probe
-- on 2026-07-30 found all four below with anon = true, authenticated = true.
--
-- VERIFIED LIVE BEFORE WRITING THIS (has_function_privilege, prod):
--   apply_obligation_penalty  anon=t authenticated=t   -- no auth.uid() check at all
--   award_session_kept        anon=t authenticated=t   -- no auth.uid() check at all
--   settle_commitment         anon=t authenticated=t   -- no auth.uid() check at all
--   get_store_credit_for      anon=t authenticated=t   -- no gate of any kind
--
-- What that allowed, with NO ACCOUNT: pass any user's uuid (harvested from
-- community_posts.author_id or people search) and force a score penalty onto
-- them, award them points, force-settle their weekly commitment stake, or read
-- their store-credit wallet balance.
--
-- ⚠ CALLERS WERE TRACED BEFORE REVOKING — every one of the four is reached only
-- through a service-role connection, so this migration removes no capability the
-- product actually uses:
--   apply_obligation_penalty  src/app/api/cron/score-accountability/route.ts:184  admin.rpc
--   award_session_kept        src/app/api/cron/score-accountability/route.ts:200  admin.rpc
--   settle_commitment         src/app/api/cron/score-accountability/route.ts:219  admin.rpc
--   get_store_credit_for      src/app/api/stripe/checkout-session/route.ts:179    admin.rpc
-- The member-facing wallet read is get_my_store_credit(), which takes NO argument
-- and resolves auth.uid() itself — it keeps its authenticated grant.
--
-- Idempotent and safe to re-run.

begin;

-- ── 1. The three score-integrity writers: service-role only ─────────────────
revoke all on function public.apply_obligation_penalty(uuid, text, uuid, date) from public, anon, authenticated;
grant execute on function public.apply_obligation_penalty(uuid, text, uuid, date) to service_role;

revoke all on function public.award_session_kept(uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_session_kept(uuid, uuid) to service_role;

revoke all on function public.settle_commitment(uuid, date) from public, anon, authenticated;
grant execute on function public.settle_commitment(uuid, date) to service_role;

-- ── 2. The wallet reader: service-role only; members use get_my_store_credit ─
revoke all on function public.get_store_credit_for(uuid) from public, anon, authenticated;
grant execute on function public.get_store_credit_for(uuid) to service_role;

-- ── 3. get_user_points: anon has no business here ──────────────────────────
-- Deliberately NOT revoked from `authenticated`: it backs a signed-in surface
-- (mobile-app/src/services/shapeBackend.js:5503 calls it on the USER client for
-- the profile card), and it returns an aggregate point total, not a record. Anon
-- had no caller at all, so that grant was pure surface area.
revoke all on function public.get_user_points(uuid[]) from public, anon;
grant execute on function public.get_user_points(uuid[]) to authenticated, service_role;

-- ── 4. Pin pg_temp on the authorization primitives (CWE-426) ────────────────
-- `set search_path = public` OMITS pg_temp, and an omitted pg_temp is not merely
-- absent — it is searched FIRST, ahead of pg_catalog. This is THE
-- authorization primitive that ~20 other definers delegate to, so it is the
-- worst possible place to leave it unpinned. The body below is unchanged, byte
-- for byte, from 2026-05-26-shared-clients.sql — only the search_path differs.
-- Scoped deliberately to this ONE function: 170 of 189 definers share the same
-- omission, and rewriting them all in a security hotfix would mean re-emitting
-- 170 bodies I would have to prove byte-identical. That sweep is registered, not
-- attempted here — including is_discipline_coach_on_client, the sibling primitive.
create or replace function public.is_coach_on_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active', 'trialing')
      and (
        (s.provider_role = 'trainer' and exists (
          select 1 from public.trainers t
          where t.id = s.provider_id and t.owner_id = auth.uid()
        ))
        or
        (s.provider_role = 'nutritionist' and exists (
          select 1 from public.nutritionists n
          where n.id = s.provider_id and n.owner_id = auth.uid()
        ))
      )
  );
$$;
grant execute on function public.is_coach_on_client(uuid) to authenticated;

-- ── 5. The gate. A migration that cannot prove it worked is not a gate ──────
do $guard$
declare
  v_open text;
begin
  -- 5a. None of the four may remain reachable by anon or authenticated.
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into v_open
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('apply_obligation_penalty', 'award_session_kept',
                      'settle_commitment', 'get_store_credit_for')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_open is not null then
    raise exception 'still reachable by anon/authenticated: %', v_open;
  end if;

  -- 5b. …and service_role must still reach all four, or the cron silently dies.
  select string_agg(p.proname, ', ') into v_open
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('apply_obligation_penalty', 'award_session_kept',
                      'settle_commitment', 'get_store_credit_for')
    and not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_open is not null then
    raise exception 'service_role LOST execute on: % — the score cron would fail silently', v_open;
  end if;

  -- 5c. The member-facing wallet read must survive.
  if not has_function_privilege('authenticated', 'public.get_my_store_credit()', 'EXECUTE') then
    raise exception 'get_my_store_credit lost its authenticated grant — the member wallet would break';
  end if;

  -- 5d. get_user_points: anon out, authenticated kept.
  if has_function_privilege('anon', 'public.get_user_points(uuid[])', 'EXECUTE') then
    raise exception 'get_user_points is still executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.get_user_points(uuid[])', 'EXECUTE') then
    raise exception 'get_user_points lost its authenticated grant — the profile card would break';
  end if;

  -- 5e. The authorization primitive keeps its grant AND gains pg_temp.
  if not has_function_privilege('authenticated', 'public.is_coach_on_client(uuid)', 'EXECUTE') then
    raise exception 'is_coach_on_client lost its authenticated grant — every coach surface would break';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_coach_on_client'
      and array_to_string(p.proconfig, ',') like '%pg_temp%'
  ) then
    raise exception 'is_coach_on_client search_path is still missing pg_temp';
  end if;
end $guard$;

commit;
