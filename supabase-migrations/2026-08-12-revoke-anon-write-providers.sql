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

    -- 2. No column-level residue -- measured by EFFECTIVE privilege, never by anon's own ACL entry.
    --    A per-column INSERT/UPDATE/REFERENCES grant survives check 1 completely unseen, because
    --    has_table_privilege reports FALSE for a column-level grant. That much was always true.
    --
    --    ⚠ WHAT THE FIRST CUT GOT WRONG, and it failed in the one direction that matters. It read
    --    pg_attribute.attacl through aclexplode looking for grantee = 'anon'. aclexplode reports
    --    the role a grant was MADE TO, so a column-level grant made to PUBLIC -- or to any role
    --    anon inherits -- is invisible to it while anon holds the privilege in full. `revoke ...
    --    from anon` does not reach a PUBLIC grant either, so the migration would have completed
    --    with its own guard certifying that anon cannot write, over a database where it could.
    --    A guard that cannot see the state it exists to catch is worse than no guard: it is a
    --    false all-clear on the security posture of the two most public tables in the schema.
    --
    --    has_column_privilege resolves PUBLIC and role inheritance, which is the entire point of
    --    using it. It is asked ONLY about the three privilege types that HAVE a column-level form:
    --    DELETE, TRUNCATE, TRIGGER and MAINTAIN have none, and the column-aware functions RAISE
    --    when asked about them -- a blanket swap would abort this migration rather than harden it.
    --    Those four exist only at table level, where check 1 already covers them.
    --
    --    A TRUE here can only mean a column grant: has_column_privilege answers TRUE for a
    --    privilege held at EITHER level, and check 1 has already raised if anon held any of these
    --    three at table level. Columns are named rather than counted, because "3 grants survive"
    --    sends the next reader hunting for something this query already knows.
    select string_agg(distinct a.attname || ' (' || p || ')', ', ' order by a.attname || ' (' || p || ')')
      into v_bad
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['INSERT','UPDATE','REFERENCES']) p
    where n.nspname = 'public'
      and c.relname = v_tbl
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege('anon', c.oid, a.attnum, p);

    if v_bad is not null then
      raise exception 'anon holds column-level % on public.% — REVOKE ALL ON TABLE does not reach a grant made to PUBLIC', v_bad, v_tbl;
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
