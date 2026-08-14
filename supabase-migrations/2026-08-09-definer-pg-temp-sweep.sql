-- Pin pg_temp LAST on every SECURITY DEFINER function in `public` (CWE-426).
--
-- WHY THIS EXISTS
-- An omitted pg_temp is not merely absent from the search path. Postgres searches the
-- session's TEMPORARY schema FIRST -- ahead of pg_catalog -- whenever pg_temp is not named
-- explicitly. Every role on this database holds TEMPORARY (anon, authenticated, service_role
-- and PUBLIC, verified live 2026-08-14), so a caller can plant a table, view, function or
-- operator in pg_temp that shadows a name a SECURITY DEFINER body resolves, and have it run
-- as the function's owner (postgres). Naming pg_temp LAST moves it behind pg_catalog and
-- public. Listing it FIRST would be a no-op on the vulnerability -- position is the fix, not
-- presence, which is why the guard below asserts position and not just membership.
--
-- LIVE COUNTS AT AUTHORING (production, 2026-08-14):
--   175 functions in public | 132 SECURITY DEFINER | 19 already pinned
--   113 unpinned | 0 carrying no search_path at all
--   Of the 113: 92 anon-executable, 102 authenticated-executable, 11 service-role only.
--   Distinct values among the 113: `public` (112) and `pg_catalog` (1, rls_auto_enable).
-- The go-live checklist recorded 174/131/18/113/0 as of 2026-07-31. The +1/+1/+1 is
-- get_or_create_direct_conversation, restored by 2026-08-08-restore-direct-conversation.sql
-- already pinned. The 113 is unchanged and is exactly what this migration closes.
--
-- ============================================================================
-- ⚠⚠ READ THIS BEFORE EDITING THE ALTER STATEMENT. THE OBVIOUS FORM IS WRONG.
-- ============================================================================
-- The natural way to build this statement is format(... 'set search_path to %L', value).
-- IT SILENTLY BREAKS EVERY FUNCTION IT TOUCHES. Proven against THIS database on
-- 2026-08-14, inside a transaction that was rolled back:
--
--   quote_literal form -> proconfig stores  search_path="public, pg_temp"
--                      -> calling the function raises: relation "profiles" does not exist
--   bare identifier    -> proconfig stores  search_path=public, pg_temp
--                      -> calling the function returns normally
--
-- Postgres reads the quoted string as ONE schema NAMED `public, pg_temp`, which does not
-- exist, rather than as a two-element list. A nonexistent schema in search_path is silently
-- ignored, so the function loses `public` entirely and every unqualified table reference in
-- its body fails at CALL time -- not at ALTER time. There is no error to notice at apply.
-- With 92 of these callable by anon, that is a full-app outage shipped as a hardening fix.
--
-- So the value is appended RAW with %s. That is correct, not a shortcut: proconfig stores
-- search_path in already-re-emittable form (it is what Postgres itself would print), so
-- appending ', pg_temp' to the stored text yields valid SET syntax for every case, including
-- a hypothetical schema whose name required quoting. The identifier halves still go through
-- %I. The value cannot be attacker-controlled -- only the postgres role can write proconfig.
--
-- WHY ALTER, NOT CREATE OR REPLACE
-- ALTER FUNCTION ... SET search_path writes pg_proc.proconfig and nothing else. Body, owner,
-- grants, volatility, strictness, parallel safety, cost, comments and every dependent trigger
-- / event trigger / view are untouched -- there is no body to re-state, so there is nothing
-- to drift. CREATE OR REPLACE would force re-stating 113 bodies; this repo has already
-- shipped a superseded-file body revert once.
--
-- WHY A LOOP AND NOT 113 LITERAL STATEMENTS
-- 113 hand-written ALTERs are not reviewable and go stale the moment a function lands. The
-- loop reads the live catalog: correct on any database, and a no-op on a second run.
--
-- ⚠ THIS IS NOT DURABLE ON ITS OWN. 76 files in supabase-migrations/ declare functions with
-- `set search_path to 'public'` (124 occurrences). Replaying ANY of them reverts that one
-- function to unpinned, silently -- the same class documented on
-- 2026-08-05-search-pattern-hardening.sql, roughly 40x wider. The durable half is a CI guard
-- asserting zero unpinned definers; see tests/definer-search-path.test.mjs.

-- ===== The sweep =====
do $pin$
declare
  r      record;
  v_done int := 0;
begin
  for r in
    select n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           sp.val as cur
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral (
      select (select right(cfg, -length('search_path='))
              from unnest(coalesce(p.proconfig, '{}')) cfg
              where cfg like 'search\_path=%' limit 1) as val
    ) sp
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef
      -- Only functions that ALREADY carry a search_path. A definer with none is a different,
      -- worse defect with a different fix: there is nothing to append to, and inventing
      -- `public, pg_temp` would be a guess about what its body resolves. There are currently
      -- ZERO; guard check (2) below asserts that stays true rather than assuming it.
      and sp.val is not null
      -- Word-boundary match, never `like '%pg_temp%'` -- `_` is a LIKE wildcard, so the naive
      -- form also matches `pgXtemp`. Same trap 2026-08-05-search-pattern-hardening was bitten by.
      and not (sp.val ~ '(^|[,[:space:]"])pg_temp($|[,[:space:]"])')
    -- Deterministic order so a re-run's NOTICE stream is diffable.
    order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    -- %I.%I(%s) rather than oid::regprocedure: regprocedure's schema qualification is
    -- search_path-dependent, so its rendered text can come out unqualified and rebind
    -- elsewhere. pg_get_function_identity_arguments pins the exact overload (empty string for
    -- a zero-arg function, which renders as a valid `f()`).
    -- ⚠ The final %s is deliberate and load-bearing -- see the banner above. Do not "fix" it to %L.
    execute format(
      'alter function %I.%I(%s) set search_path to %s',
      r.nspname, r.proname, r.args, r.cur || ', pg_temp'
    );
    v_done := v_done + 1;
  end loop;

  raise notice 'pinned pg_temp on % SECURITY DEFINER function(s)', v_done;
end
$pin$;

-- ===== Guard =====
-- Asserts the END STATE rather than trusting the loop above. Compile-tested as a whole: every
-- RAISE takes exactly the arguments its format string names. A bare % in a NEVER-EXECUTED
-- branch aborts the entire migration at COMPILE time -- that is how the 2026-07-30 search-term
-- migration shipped dead on arrival. Arity here: notice 1/1, check1 2/2, check2 1/1, check3 2/2.
do $guard$
declare
  v_unpinned       int;
  v_unpinned_names text;
  v_nopath         int;
  v_notlast        int;
  v_notlast_names  text;
begin
  -- (1) has a search_path but no pg_temp -- the defect this migration closes.
  select count(*),
         coalesce(string_agg(f.ident, ', ' order by f.ident), '(none)')
    into v_unpinned, v_unpinned_names
  from (
    select p.oid::regprocedure::text as ident, sp.val
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral (
      select (select right(cfg, -length('search_path='))
              from unnest(coalesce(p.proconfig, '{}')) cfg
              where cfg like 'search\_path=%' limit 1) as val
    ) sp
    where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  ) f
  where f.val is not null
    and not (f.val ~ '(^|[,[:space:]"])pg_temp($|[,[:space:]"])');

  if v_unpinned > 0 then
    raise exception 'pg_temp sweep incomplete: % SECURITY DEFINER function(s) in public still omit pg_temp: %',
      v_unpinned, v_unpinned_names;
  end if;

  -- (2) no search_path clause at all -- strictly worse than unpinned, and the one state the
  -- loop deliberately skips. Zero today; this fails loudly if that ever stops being true.
  select count(*) into v_nopath
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search\_path=%'
    );

  if v_nopath > 0 then
    raise exception '% SECURITY DEFINER function(s) in public carry NO search_path at all -- pin them explicitly, do not let the sweep guess',
      v_nopath;
  end if;

  -- (3) pg_temp present but NOT the final entry. Listing it first is a no-op on the
  -- vulnerability, so presence alone is not the invariant -- position is.
  -- ⚠ This check is ALSO what catches the quoted-single-name disaster described in the banner:
  -- the broken value "public, pg_temp" contains pg_temp (so check 1 passes it) but does not
  -- END with it unquoted, so it fails HERE. Do not weaken this check.
  select count(*),
         coalesce(string_agg(f.ident, ', ' order by f.ident), '(none)')
    into v_notlast, v_notlast_names
  from (
    select p.oid::regprocedure::text as ident, sp.val
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral (
      select (select right(cfg, -length('search_path='))
              from unnest(coalesce(p.proconfig, '{}')) cfg
              where cfg like 'search\_path=%' limit 1) as val
    ) sp
    where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  ) f
  where f.val ~ '(^|[,[:space:]"])pg_temp($|[,[:space:]"])'
    and f.val !~ '(^|,)[[:space:]]*pg_temp[[:space:]]*$';

  if v_notlast > 0 then
    raise exception 'pg_temp is not the LAST search_path entry on % SECURITY DEFINER function(s): %',
      v_notlast, v_notlast_names;
  end if;
end
$guard$;

-- Verify after apply (expect definers=132, pinned=132, unpinned=0, no_path=0):
--   select count(*) filter (where p.prosecdef) as definers,
--          count(*) filter (where p.prosecdef and sp.val ~ '(^|[,[:space:]"])pg_temp($|[,[:space:]"])') as pinned,
--          count(*) filter (where p.prosecdef and sp.val is not null
--                             and not (sp.val ~ '(^|[,[:space:]"])pg_temp($|[,[:space:]"])')) as unpinned,
--          count(*) filter (where p.prosecdef and sp.val is null) as no_path
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   left join lateral (select right(cfg, -length('search_path=')) as val
--                      from unnest(coalesce(p.proconfig,'{}')) cfg
--                      where cfg like 'search\_path=%' limit 1) sp on true
--   where n.nspname = 'public' and p.prokind = 'f';
