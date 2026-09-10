-- Close the two League SECURITY DEFINER functions that anon can execute, and
-- pin their search_path (2026-09-10).
--
-- ⚠ THE SAME BUG CLASS AS 2026-08-02-rpc-grant-lockdown.sql, SHIPPED AGAIN —
-- and this time by APPLYING A FOUR-MONTH-OLD MIGRATION WITHOUT RE-AUDITING IT.
--
-- 2026-05-31-shape-league.sql was found unapplied on 2026-09-10 and applied the
-- same evening. It was written BEFORE the rule that 2026-06-30-rpc-authz-hardening.sql
-- wrote down, so it ends in:
--
--     revoke all on function public.league_week_score(uuid, text) from public;
--     grant execute on function public.league_week_score(uuid, text) to authenticated;
--
-- `from public` removes only the IMPLICIT PUBLIC grant. Supabase ships ALTER
-- DEFAULT PRIVILEGES granting EXECUTE on every new function in `public`
-- EXPLICITLY to anon and authenticated, and those two survive untouched — so
-- both functions went live callable by the whole internet through
-- /rest/v1/rpc/. This is the third time this repo has shipped it: league_assign_cohort
-- (self-promote, fixed 2026-06-29), the four 2026-06-18 score functions (fixed
-- 2026-08-02), and now the rest of the League.
--
-- VERIFIED LIVE BEFORE WRITING THIS (pg_proc.proacl, prod, 2026-09-10):
--   league_week_score   anon=X authenticated=X   search_path=public   (no pg_temp)
--   league_standings    anon=X authenticated=X   search_path=public   (no pg_temp)
-- and a `set local role anon` probe executed BOTH without permission denied.
--
-- WHAT THAT ALLOWED, WITH NO ACCOUNT. `league_week_score(p_user, p_week)` takes
-- an ARBITRARY user id and sums public.score_ledger — a table whose RLS is
-- owner-scoped, and which the same anon probe could NOT read directly. The
-- definer bypasses that RLS by design, so passing any uuid (harvested from
-- community_posts.author_id or the people search, the same path the 2026-08-02
-- header describes) returns that member's private weekly score.
-- `league_standings` returns user_id + full_name + avatar_url + score + rank for
-- a whole cohort, with no visibility gate at all.
--
-- ⚠ NOTHING HAS ACTUALLY LEAKED, AND THAT IS LUCK, NOT DESIGN: score_ledger and
-- league_members are both EMPTY in production (measured, 0 rows). The hole would
-- have started returning real numbers the first time a member earned a point.
--
-- THE GRANTS THIS SETTLES ON, and why they are not symmetric:
--   * league_week_score  — service_role only. It is an INTERNAL helper: its only
--     caller is league_standings, which is SECURITY DEFINER and therefore runs
--     as the owner, so it keeps working with no grant to either client role. No
--     app code calls it. A function that takes someone else's uuid and returns
--     their private total should not be reachable by a client at all.
--   * league_standings   — authenticated. /api/league calls it with a
--     user-scoped client (route line 96), so authenticated is required; anon is
--     not, because the route already refuses a signed-out caller.
--
-- Idempotent. Ends in a DO block that ABORTS if the lockdown did not take, so a
-- silent partial apply cannot report success.

-- ── 1. search_path: pin pg_temp LAST on both (CWE-426) ──────────────────────
-- Every other definer in this repo carries `public, pg_temp`. Without pg_temp
-- pinned last a caller can create a temp object that shadows a referenced one.
alter function public.league_week_score(uuid, text) set search_path = public, pg_temp;
alter function public.league_standings(text, text, int) set search_path = public, pg_temp;

-- ── 2. Revoke BY NAME — `from public` alone is what caused this ─────────────
revoke all on function public.league_week_score(uuid, text) from public, anon, authenticated;
revoke all on function public.league_standings(text, text, int) from public, anon;

-- ── 3. Re-grant exactly what each caller needs ──────────────────────────────
grant execute on function public.league_week_score(uuid, text) to service_role;
grant execute on function public.league_standings(text, text, int) to authenticated, service_role;

-- ── 4. Abort if it did not take ─────────────────────────────────────────────
do $guard$
declare
  v_open text;
begin
  -- 4a. Neither may remain reachable by anon.
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into v_open
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('league_week_score', 'league_standings')
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_open is not null then
    raise exception 'still reachable by anon: %', v_open;
  end if;

  -- 4b. The arbitrary-uuid helper must not be reachable by authenticated either.
  if has_function_privilege('authenticated', 'public.league_week_score(uuid,text)', 'EXECUTE') then
    raise exception 'league_week_score is still executable by authenticated — it takes any member''s uuid';
  end if;

  -- 4c. …but the route's own read must survive, or /api/league dies silently.
  if not has_function_privilege('authenticated', 'public.league_standings(text,text,int)', 'EXECUTE') then
    raise exception 'league_standings lost its authenticated grant — /api/league would break';
  end if;

  -- 4d. service_role must reach both.
  select string_agg(p.proname, ', ') into v_open
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('league_week_score', 'league_standings')
    and not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_open is not null then
    raise exception 'service_role LOST execute on: %', v_open;
  end if;

  -- 4e. Both must pin pg_temp LAST.
  select string_agg(p.proname, ', ') into v_open
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('league_week_score', 'league_standings')
    and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=public, pg_temp%';
  if v_open is not null then
    raise exception 'search_path does not pin pg_temp last on: %', v_open;
  end if;
end
$guard$;
