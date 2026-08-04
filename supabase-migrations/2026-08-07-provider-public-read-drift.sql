-- Schema drift — codify the three provider public-read policies.
--
-- WHY THIS EXISTS
-- `trainers public read`, `nutritionists public read` and `gyms public read` are
-- LIVE in production (SELECT, roles {anon, authenticated}, USING (true)) but
-- appear in ZERO of this repo's migration files. Their siblings do:
-- `2026-04-14-provider-owner-id.sql` codifies all three `... update own row`
-- policies. So the UPDATE half of each table's policy set is reproducible and
-- the SELECT half is not.
--
-- The consequence is not abstract. Rebuild this database from
-- `supabase-migrations/` and RLS is on with no read policy on the three
-- marketplace tables, so an anonymous visitor gets ZERO rows: no coach
-- directory, no listings, no discovery. It fails SILENTLY, because an empty
-- result is not an error — the marketplace would simply look empty.
--
-- Registered as "schema drift" by the 2026-07-30 access-control audit
-- (#1851). Surfaced by a CodeRabbit finding that was itself wrong and that
-- CodeRabbit withdrew on the evidence.
--
-- ⚠ THIS MIGRATION IS DELIBERATELY BEHAVIOUR-NEUTRAL.
-- It reproduces exactly what production already has. Against production it is
-- a genuine no-op: each policy is created ONLY when absent, so a re-run drops
-- nothing and rewrites nothing. That matters on a live table — a
-- `drop policy` + `create policy` pair would open a window, however brief, in
-- which the public marketplace returns no rows.
--
-- ⚠ WHAT THIS MIGRATION DOES *NOT* DO, on purpose.
-- `anon` can also read `trainers.stripe_account_id` / `.stripe_account_status`
-- (and the nutritionist equivalents) through these same policies, because no
-- column-level grant narrows them. Nothing in the browser needs those columns:
-- all 29 server reads go through the service-role admin client, and the single
-- client-side read (`iosAppBroadsheetMarketplace.jsx:194-195`) maps both fields
-- into an object and never reads them back. Closing that is a REAL access
-- change with its own blast radius, so it belongs in its own migration with its
-- own review — not smuggled into a file whose stated guarantee is "changes
-- nothing".
--
-- Safe to re-run. Idempotent.

-- ===== The three public-read policies =====
-- Create-if-absent rather than drop-and-recreate: see the behaviour-neutral
-- note above. `USING (true)` is intentional — these are the public marketplace
-- directory tables (name, specialty, price, bio, rating, tags). They carry no
-- email, phone or date of birth; member PII lives in `profiles`, which was
-- locked down separately by `2026-08-04-profiles-pii-lockdown.sql`.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trainers'
      and policyname = 'trainers public read'
  ) then
    create policy "trainers public read"
      on public.trainers for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'nutritionists'
      and policyname = 'nutritionists public read'
  ) then
    create policy "nutritionists public read"
      on public.nutritionists for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gyms'
      and policyname = 'gyms public read'
  ) then
    create policy "gyms public read"
      on public.gyms for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

-- ===== Guard =====
-- Asserts the END STATE, so a rebuild that silently failed to create a policy
-- fails loudly here instead of shipping an invisible marketplace.
--
-- ⚠ The command check accepts BOTH 'SELECT' and 'ALL'. `pg_policies.cmd`
-- reports 'ALL' for a `for all` policy, whose USING clause is exactly what a
-- SELECT is checked against — so filtering on 'SELECT' alone would report a
-- perfectly functional read policy as missing. This repo has now been bitten
-- twice by the inverse of that mistake (`2026-07-31-coach-insert-lockout.sql`
-- and the #1851 guard both filtered a cmd and certified the wrong thing).
--
-- ⚠ Each RAISE below carries EXACTLY ONE `%` for EXACTLY ONE argument.
-- PL/pgSQL validates RAISE placeholder arity at COMPILE time, so a mismatch in
-- a branch that never executes still aborts the whole migration on a healthy
-- database — that is how `2026-08-05-search-pattern-hardening.sql` shipped
-- dead on arrival. `%` is the placeholder; `%%` would be a literal percent sign
-- and would consume no argument.

do $$
declare
  v_missing text[] := '{}';
  v_rls_off text[] := '{}';
begin
  -- Explicit, one table at a time — clearer to read than a loop, and it names
  -- the exact table in the failure message.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trainers'
      and policyname = 'trainers public read'
      and cmd in ('SELECT','ALL')
      and 'anon' = any (roles) and 'authenticated' = any (roles)
      and qual = 'true'
  ) then
    v_missing := v_missing || 'trainers'::text;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nutritionists'
      and policyname = 'nutritionists public read'
      and cmd in ('SELECT','ALL')
      and 'anon' = any (roles) and 'authenticated' = any (roles)
      and qual = 'true'
  ) then
    v_missing := v_missing || 'nutritionists'::text;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gyms'
      and policyname = 'gyms public read'
      and cmd in ('SELECT','ALL')
      and 'anon' = any (roles) and 'authenticated' = any (roles)
      and qual = 'true'
  ) then
    v_missing := v_missing || 'gyms'::text;
  end if;

  if array_length(v_missing, 1) is not null then
    raise exception
      'provider public-read drift guard: missing or malformed policy on %',
      array_to_string(v_missing, ', ');
  end if;

  -- A read policy on a table with RLS disabled is meaningless, and a table with
  -- RLS disabled is wide open regardless of policy. Assert both are true.
  select coalesce(array_agg(c.relname::text), '{}')
    into v_rls_off
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('trainers','nutritionists','gyms')
    and c.relrowsecurity is not true;

  if array_length(v_rls_off, 1) is not null then
    raise exception
      'provider public-read drift guard: RLS is NOT enabled on %',
      array_to_string(v_rls_off, ', ');
  end if;
end
$$;
