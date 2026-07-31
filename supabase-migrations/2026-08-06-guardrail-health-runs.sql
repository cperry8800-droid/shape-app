-- The guardrail-health cron's run record: one row per run, holding every check's
-- verdict so the next run can tell a NEW fault from a continuing one.
--
-- ⚠ NOT analytics_events, for three reasons. This is operational state, not
-- product analytics; the analytics-purge cron deletes from that table on a
-- 12-month cutoff; and track_event stamps user_id = auth.uid(), which is NULL on
-- the service-role connection this job uses.
--
-- Idempotent. Safe to re-run.

begin;

create table if not exists public.guardrail_health_runs (
  id       uuid primary key default gen_random_uuid(),
  ran_at   timestamptz not null default now(),
  verdicts jsonb       not null,
  alerted  boolean     not null default false
);

-- The only query this table serves: "the most recent run".
create index if not exists guardrail_health_runs_ran_at_idx
  on public.guardrail_health_runs (ran_at desc);

alter table public.guardrail_health_runs enable row level security;

-- ⚠ REVOKE FROM anon AND authenticated, NOT JUST public. Supabase grants those
-- roles explicitly, and `revoke ... from public` does not touch an explicit
-- grant. That exact gap is what left four score RPCs anon-executable until
-- #1851; the rule was written down in 2026-06-30-rpc-authz-hardening.sql and the
-- older code was simply never swept.
revoke all on public.guardrail_health_runs from public, anon, authenticated;
grant all on public.guardrail_health_runs to service_role;

-- No RLS policy is created deliberately: with RLS enabled and no policy, every
-- non-service role is denied by default. service_role bypasses RLS entirely.

-- ── The gate ──────────────────────────────────────────────────────────────
-- ⚠ INSIDE the transaction on purpose: a raised exception below rolls the DDL
-- back, so a table that cannot prove anon and authenticated are shut out is
-- never left behind. Committing first would demote every assertion to a report.
do $guard$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'guardrail_health_runs'
  ) then
    raise exception 'guardrail_health_runs was not created';
  end if;

  if not (
    select relrowsecurity from pg_class
    where oid = 'public.guardrail_health_runs'::regclass
  ) then
    raise exception 'RLS is not enabled on guardrail_health_runs';
  end if;

  -- The whole point of the revoke. If either role kept access, operational
  -- state (including how often the guardrail is failing) is readable by any
  -- signed-in member, and anon would be worse.
  if has_table_privilege('anon', 'public.guardrail_health_runs', 'SELECT') then
    raise exception 'anon can still read guardrail_health_runs';
  end if;
  if has_table_privilege('authenticated', 'public.guardrail_health_runs', 'SELECT') then
    raise exception 'authenticated can still read guardrail_health_runs';
  end if;
  if not has_table_privilege('service_role', 'public.guardrail_health_runs', 'INSERT') then
    raise exception 'service_role cannot write guardrail_health_runs - the cron would fail';
  end if;
end $guard$;

commit;
