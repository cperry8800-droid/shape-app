-- anon may READ the provider tables and nothing else.
--
-- WHY
-- public.trainers and public.nutritionists both granted `anon` the full table ACL:
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. RLS is enabled on both,
-- and the only policies are a public SELECT and an authenticated "update own row" -- so
-- INSERT/UPDATE/DELETE by anon are already denied at the row layer.
--
-- TRUNCATE is the one that matters, because TRUNCATE IS NOT SUBJECT TO RLS AT ALL. No policy
-- gates it, and none can. Measured in a rolled-back transaction against production on
-- 2026-08-14, on a scratch table with RLS ENABLED and ZERO policies -- the strongest posture
-- row-level security is capable of:
--
--   BEFORE revoke  -> TRUNCATE SUCCEEDED as anon
--   AFTER  revoke  -> refused: permission denied
--   AFTER  revoke  -> SELECT still works
--
-- The "before" case is the part that makes this migration worth applying: the guard below
-- would pass trivially if the grant had never permitted anything.
--
-- ⚠ HONEST SCOPE OF THE RISK -- this grant is LATENT, not live.
-- Being able to say "anon holds TRUNCATE" is not the same as saying "anyone can wipe the
-- table today", and the difference was checked rather than assumed:
--   * `anon` is NOLOGIN (pg_roles.rolcanlogin = false), so no one can open a direct Postgres
--     connection as anon. The only LOGIN roles are `authenticator` and `postgres`.
--   * PostgREST reaches anon only via `set local role anon`, and it emits no TRUNCATE for any
--     HTTP verb -- GET/POST/PATCH/DELETE map to SELECT/INSERT/UPDATE/DELETE, all RLS-gated.
--   * No anon-executable function in `public` emits a TRUNCATE or evaluates caller-supplied
--     SQL. Three candidates were read in full rather than pattern-matched:
--       - get_roster_weekly_adherence: the word "truncate" occurs only in a COMMENT.
--       - rls_auto_enable: an event-trigger function; pg_event_trigger_ddl_commands() errors
--         when called directly, and its EXECUTE interpolates trigger metadata, not arguments.
--       - set_metric_source: returns 42501 when auth.uid() is null, so anon stops at line one;
--         its dynamic UPDATE quotes with %I over a whitelisted metric and binds values by USING.
--
-- So this closes a hole that needs a second component to fire. That is exactly why it is worth
-- closing now: the second component is one ordinary SECURITY INVOKER helper away, nobody would
-- think to re-check this grant while writing it, and the failure mode is total data loss with
-- no row-level trace.
--
-- WHAT IS DELIBERATELY NOT CHANGED HERE
-- `authenticated` keeps SELECT and UPDATE -- the "update own row" policy is what lets a coach
-- edit their own profile, and revoking the table grant would dead-letter that policy. It loses
-- TRUNCATE only, which is the identical defect one free signup away and has no legitimate caller.
-- `service_role` is untouched; it is the trusted backend identity and bypasses RLS by design.

-- REVOKE ALL then re-GRANT SELECT, rather than naming each privilege to drop. Naming them means
-- this file silently stops being complete the next time Postgres adds a privilege type -- which
-- is not hypothetical here: MAINTAIN arrived in PG17 and is already present in these ACLs.
revoke all on table public.trainers      from anon;
revoke all on table public.nutritionists from anon;

grant select on table public.trainers      to anon;
grant select on table public.nutritionists to anon;

revoke truncate on table public.trainers      from authenticated;
revoke truncate on table public.nutritionists from authenticated;

-- ===== Guard =====
-- RAISE arity checked: every format string below takes exactly the arguments it names. A bare %
-- in a branch that never runs still aborts the whole migration at COMPILE time.
do $guard$
declare
  v_tbl text;
  v_bad text;
  v_col int;
begin
  foreach v_tbl in array array['trainers', 'nutritionists'] loop

    -- 1. anon holds no write privilege of any kind.
    --
    --    has_table_privilege is the right instrument and the only safe one here. DELETE and
    --    TRUNCATE have no column-level form, so it is complete for them -- and
    --    has_any_column_privilege RAISES when asked about either, so a blanket swap to the
    --    column-aware function would abort this migration rather than harden it.
    --
    --    It also answers for privileges held indirectly through PUBLIC, which a plain read of
    --    pg_class.relacl would miss: `revoke ... from anon` does not touch a PUBLIC grant, so a
    --    future one would leave anon writing again with anon's own ACL entry looking clean.
    select string_agg(p, ', ' order by p) into v_bad
    from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
    where has_table_privilege('anon', format('public.%I', v_tbl), p);

    if v_bad is not null then
      raise exception 'anon still holds % on public.% — TRUNCATE there is ungated by RLS', v_bad, v_tbl;
    end if;

    -- 2. No column-level residue. REVOKE ALL ON TABLE never touches pg_attribute.attacl, so a
    --    per-column INSERT/UPDATE/REFERENCES grant would survive step 1 completely unseen --
    --    has_table_privilege reports FALSE for column-level grants, which is precisely why
    --    check 1 cannot be trusted to catch this on its own.
    select count(*) into v_col
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(a.attacl) x
    where n.nspname = 'public'
      and c.relname = v_tbl
      and x.grantee = 'anon'::regrole
      and x.privilege_type <> 'SELECT';

    if v_col > 0 then
      raise exception '% column-level grant(s) to anon survive on public.%', v_col, v_tbl;
    end if;

    -- 3. SELECT survives. An over-revoke takes the public marketplace dark, which is a worse
    --    outage than the hole being closed -- so it has to fail just as loudly.
    if not has_table_privilege('anon', format('public.%I', v_tbl), 'SELECT') then
      raise exception 'anon lost SELECT on public.% — the public marketplace would go dark', v_tbl;
    end if;

    -- 4. authenticated loses TRUNCATE...
    if has_table_privilege('authenticated', format('public.%I', v_tbl), 'TRUNCATE') then
      raise exception 'authenticated still holds TRUNCATE on public.%', v_tbl;
    end if;

    -- 5. ...and keeps the UPDATE its own-row policy depends on.
    if not has_table_privilege('authenticated', format('public.%I', v_tbl), 'UPDATE') then
      raise exception 'authenticated lost UPDATE on public.% — coaches can no longer edit their profile', v_tbl;
    end if;

  end loop;
end
$guard$;
