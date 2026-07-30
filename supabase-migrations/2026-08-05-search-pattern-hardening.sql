-- Search hardening: clamp the term, escape LIKE metacharacters, pin pg_temp.
--
-- FOUND BY the 2026-07-30 SQL-injection audit (5 parallel finders + adversarial
-- verification across supabase-migrations/, src/, public/ and mobile-app/).
--
-- ⚠ FIRST, WHAT THIS IS NOT. This is NOT a SQL-injection fix, and nobody should
-- read it as one. The audit's verdict was ZERO confirmed injection findings in
-- the entire codebase, and the two verifiers who examined these functions both
-- REFUTED the report for the same reason: `search_shape_people` and
-- `search_members` are `language sql` with static bodies — no EXECUTE, no
-- format(), no concatenation into a statement string — so the parse tree is
-- fixed at CREATE FUNCTION time and no argument value can alter the query's
-- MEANING. Every caller reaches them through supabase-js `.rpc()`, which POSTs
-- the argument as JSON to PostgREST and binds it as a parameter. The search box
-- string is data at every hop.
--
-- WHAT IT ACTUALLY FIXES — two things, one cost and one correctness:
--
-- 1. COST / AVAILABILITY. `p_q` had no length bound at any layer, and these are
--    SECURITY DEFINER functions granted to `authenticated`, so the browser calls
--    them DIRECTLY — they never pass through the /api/* proxy rate limiter. A
--    wildcard-dense term ('%a%a%a%a%a%a%a%b') drives Postgres's backtracking
--    LIKE matcher across an unindexable sequential scan of public.profiles, and
--    in search_shape_people every candidate row additionally pays a lateral
--    user_goals lookup and a correlated sum() over score_ledger. One signed-in
--    account could buy repeated expensive full scans cheaply. Clamped to 80
--    characters — longer than any real name or handle.
--
-- 2. CORRECTNESS. `%` and `_` were passed through unescaped, so a member
--    searching for a literal underscore got wildcard semantics: `_` matched
--    every profile with at least one character. Now escaped, so a search for
--    `_` finds an underscore.
--
-- ⚠ ESCAPE ORDER IS LOAD-BEARING: backslash FIRST, then % and _. Escaping the
-- metacharacters before doubling the backslashes would re-escape the backslashes
-- this step just inserted, turning `\%` into `\\%` — a literal backslash
-- followed by a live wildcard, i.e. the exact bug being fixed. The E'' literals
-- are deliberate: they mean one backslash regardless of standard_conforming_strings.
--
-- ALSO PINS pg_temp on both functions (CWE-426). An omitted pg_temp is not
-- merely absent from the search path — it is searched FIRST, ahead of pg_catalog,
-- so a caller who can create a temp object can shadow a function these definers
-- call. Two off the registered sweep; ~166 definers still carry the gap.
--
-- ⚠ RE-RUNNING AN OLDER FILE REVERTS THIS. Both functions are also defined in
-- 2026-06-02-channels.sql, 2026-06-09-usernames.sql and the superseded
-- 2026-06-09-universal-search.sql. Those are `create or replace`, so replaying
-- any of them silently restores the unclamped, unescaped, pg_temp-less version.
-- This file must be the last one applied for these two functions.
--
-- Behaviour otherwise preserved exactly: same signatures, same return shapes,
-- same match-everything-on-empty-term branch, same row caps (40 / 20), same
-- ordering, same visibility rules, same grants (authenticated only, never anon).
-- Verified against the live definitions before writing.
--
-- Idempotent. Safe to re-run.

begin;

-- ── search_shape_people — universal people search (name, username, @handle,
--    and non-private bio/goal) ────────────────────────────────────────────────
create or replace function public.search_shape_people(p_q text default '', p_limit int default 20)
returns table (id uuid, full_name text, role text, avatar text, points bigint)
language sql stable security definer set search_path = public, pg_temp as $fn$
  with q as (
    -- left() BEFORE anything else: the clamp is the cost control, so it must
    -- apply to what the caller actually sent.
    select left(trim(leading '@' from trim(coalesce(p_q, ''))), 80) as raw
  ),
  qq as (
    select raw,
           replace(replace(replace(raw, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') as pat
    from q
  )
  select p.id,
         p.full_name,
         coalesce(nullif(p.role, ''), 'client') as role,
         case
           when public.shape_profile_visibility(p.id) = 'private' then null
           else ident.data->>'photo'
         end as avatar,
         coalesce((select sum(l.delta)::bigint from public.score_ledger l where l.user_id = p.id), 0) as points
  from public.profiles p
  cross join qq
  left join lateral (
    select g.data from public.user_goals g
    where g.user_id = p.id and g.kind = 'client_identity' limit 1
  ) ident on true
  where auth.uid() is not null
    and coalesce(p.full_name, '') <> ''
    and (
      qq.raw = ''
      or p.full_name ilike '%' || qq.pat || '%'
      or coalesce(p.username, '') ilike '%' || qq.pat || '%'
      or replace(coalesce(ident.data->>'handle', ''), '@', '') ilike '%' || qq.pat || '%'
      or (public.shape_profile_visibility(p.id) <> 'private' and (
              coalesce(ident.data->>'bio', '')  ilike '%' || qq.pat || '%'
           or coalesce(ident.data->>'goal', '') ilike '%' || qq.pat || '%'))
    )
  -- Prefix matches rank first. Uses the ESCAPED pattern too — ranking with the
  -- raw term would keep a wildcard live in the ORDER BY after the WHERE had
  -- neutralised it, so a `%` term would sort by "matches everything".
  order by (p.full_name ilike (select pat from qq) || '%'
            or coalesce(p.username, '') ilike (select pat from qq) || '%') desc,
           p.full_name
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
$fn$;
revoke all on function public.search_shape_people(text, int) from public, anon;
grant execute on function public.search_shape_people(text, int) to authenticated;

-- ── search_members — the "add people" channel picker (id + name ONLY) ────────
create or replace function public.search_members(p_q text default '')
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public, pg_temp as $fn$
  with q as (
    select left(coalesce(p_q, ''), 80) as raw
  ),
  qq as (
    select raw,
           replace(replace(replace(raw, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') as pat
    from q
  )
  select p.id, p.full_name
  from public.profiles p
  cross join qq
  where auth.uid() is not null
    and p.id <> auth.uid()
    and (qq.raw = '' or p.full_name ilike '%' || qq.pat || '%')
  order by p.full_name nulls last
  limit 20;
$fn$;
revoke all on function public.search_members(text) from public, anon;
grant execute on function public.search_members(text) to authenticated;

-- ── The gate ────────────────────────────────────────────────────────────────
do $guard$
declare
  v_cfg text;
  v_esc text;
  r record;
begin
  -- 1. The escape expression is asserted BEHAVIOURALLY, not by reading the
  --    source. A prosrc scan is worthless here — it matches the comment that
  --    describes the escaping as readily as the escaping itself, which is
  --    exactly how the 2026-08-03 guard false-positived on its own warning.
  --    This evaluates the real expression against a term containing all three
  --    metacharacters and checks the exact output.
  select replace(replace(replace('a_b%c' || E'\\' || 'd', E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_')
    into v_esc;
  if v_esc <> 'a' || E'\\' || '_b' || E'\\' || '%c' || E'\\\\' || 'd' then
    raise exception 'escape expression is wrong: got %, so % and _ would stay live', v_esc;
  end if;

  -- 2. And prove the escaped pattern actually matches literally — the point of
  --    the whole change. Unescaped, '_' matches any single character.
  if not ('a_b' ilike '%' || E'\\_' || '%') then
    raise exception 'escaped underscore does not match a literal underscore';
  end if;
  if 'axb' ilike '%' || E'\\_' || '%' then
    raise exception 'escaped underscore still behaves as a wildcard';
  end if;

  -- 3. Structural facts: pg_temp pinned, anon shut out, authenticated allowed.
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args,
           array_to_string(p.proconfig, ',') as cfg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('search_shape_people', 'search_members')
  loop
    if coalesce(r.cfg, '') not like '%pg_temp%' then
      raise exception '%(%) does not pin pg_temp — search_path is %', r.proname, r.args, r.cfg;
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      raise exception '%(%) is executable by anon — these read profiles as the owner', r.proname, r.args;
    end if;
    if not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception '%(%) lost execute for authenticated — search would break for every member', r.proname, r.args;
    end if;
  end loop;

  -- 4. Both must still exist with their original signatures. A typo that
  --    created an overload instead of replacing would leave the old, unhardened
  --    function in place and still pass every check above.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'search_shape_people') <> 1 then
    raise exception 'search_shape_people is overloaded — the unhardened version would still be callable';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'search_members') <> 1 then
    raise exception 'search_members is overloaded — the unhardened version would still be callable';
  end if;
end $guard$;

commit;
