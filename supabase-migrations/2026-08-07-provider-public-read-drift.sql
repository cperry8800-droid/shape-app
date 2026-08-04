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
-- ⚠ The command check requires 'SELECT' EXACTLY, and rejects 'ALL'.
-- `pg_policies.cmd` reports 'ALL' for a `for all` policy. An earlier revision
-- of this guard accepted both, reasoning that a FOR ALL policy's USING clause
-- is what a SELECT is checked against, so it reads fine — true, and beside the
-- point. FOR ALL is WRITE-capable: `for all to anon, authenticated using (true)`
-- with no WITH CHECK takes its write predicate from USING, so it also permits
-- INSERT/UPDATE/DELETE to anonymous callers wherever the table grants allow.
-- Since the create-block above is create-IF-ABSENT and matches on NAME alone,
-- a live policy that had drifted to FOR ALL would be left standing — and a
-- guard that accepted it would certify an anonymous write policy as this
-- migration's stated read-only end state.
--
-- That is the SAME defect `2026-07-31-coach-insert-lockout.sql` and the #1851
-- guard both hit, read from the other side: they filtered on a narrow cmd and
-- so MISSED a FOR ALL policy that granted more than they were checking for.
-- The lesson is not "accept ALL" — it is "FOR ALL grants writes, so never let
-- it pass unexamined". Verified against production 2026-08-04: all three
-- policies are PERMISSIVE / SELECT, so this tightening is a no-op there.
--
-- ⚠ `permissive = 'PERMISSIVE'` for the same class of reason. A RESTRICTIVE
-- policy of the same name would satisfy every other clause here while granting
-- NOTHING — restrictive policies only subtract, and with no permissive policy
-- present the table denies all reads. The guard would report success over a
-- marketplace that returns zero rows, which is precisely the silent failure
-- this file exists to make loud.
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
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and 'anon' = any (roles) and 'authenticated' = any (roles)
      and qual = 'true'
  ) then
    v_missing := v_missing || 'trainers'::text;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nutritionists'
      and policyname = 'nutritionists public read'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and 'anon' = any (roles) and 'authenticated' = any (roles)
      and qual = 'true'
  ) then
    v_missing := v_missing || 'nutritionists'::text;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gyms'
      and policyname = 'gyms public read'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
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
