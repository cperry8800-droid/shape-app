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
-- ⚠ SELECT + INSERT ONLY, deliberately NOT `grant all`. This table is an AUDIT
-- TRAIL: `grant all` includes TRUNCATE, and one stray truncate from a buggy
-- service-role script erases the entire history in a single statement, leaving
-- no rowcount trace behind. The cron only ever inserts one row per run and
-- selects the latest, so those two verbs are the whole contract.
grant select, insert on public.guardrail_health_runs to service_role;

-- No RLS policy is created deliberately: with RLS enabled and no policy, every
-- non-service role is denied by default. service_role bypasses RLS entirely.

-- ── The gate ──────────────────────────────────────────────────────────────
-- ⚠ INSIDE the transaction on purpose: a raised exception below rolls the DDL
-- back, so a table that cannot prove anon and authenticated are shut out is
-- never left behind. Committing first would demote every assertion to a report.
do $guard$
declare
  r      record;
  v_type text;
  v_null text;
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'guardrail_health_runs'
  ) then
    raise exception 'guardrail_health_runs was not created';
  end if;

  -- ⚠ EXISTENCE IS NOT SHAPE. `create table if not exists` is a FULL NO-OP when a
  -- relation of that name already exists, whatever its columns — so the check
  -- above passes over a table someone narrowed by hand while iterating, this file
  -- reports a clean re-run, and the cron then dies at write time with "column
  -- alerted does not exist". The header's "Idempotent. Safe to re-run." claim is
  -- only true because of the four assertions below.
  for r in
    select * from (values
      ('id',       'uuid',                     'NO'),
      ('ran_at',   'timestamp with time zone', 'NO'),
      ('verdicts', 'jsonb',                    'NO'),
      ('alerted',  'boolean',                  'NO')
    ) as expected(col, typ, nullable)
  loop
    select c.data_type, c.is_nullable into v_type, v_null
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name   = 'guardrail_health_runs'
      and c.column_name  = r.col;

    if v_type is null then
      raise exception 'guardrail_health_runs is missing column %', r.col;
    end if;
    if v_type <> r.typ then
      raise exception 'guardrail_health_runs.% has type %, expected %', r.col, v_type, r.typ;
    end if;
    if v_null <> r.nullable then
      raise exception 'guardrail_health_runs.% is nullable, expected NOT NULL', r.col;
    end if;
  end loop;

  -- Same blindness, same remedy: `create index if not exists` never inspects the
  -- index it skips. Without this one the "most recent run" read degrades to a
  -- sequential scan silently rather than failing.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'guardrail_health_runs'
      and indexname  = 'guardrail_health_runs_ran_at_idx'
  ) then
    raise exception 'guardrail_health_runs_ran_at_idx is missing - the most-recent-run read would degrade to a scan';
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
  -- Both verbs the cron actually uses, asserted separately so the failure names
  -- the operation. ⚠ The SELECT half matters MORE than it looks: the route reads
  -- the previous run to decide whether an alert is a NEW fault or a continuing
  -- one, and that read degrades silently (it logs and treats the absence as "no
  -- prior state"). A lost SELECT grant would therefore cost the 7-day re-alert
  -- behaviour with nothing crashing to announce it.
  if not has_table_privilege('service_role', 'public.guardrail_health_runs', 'INSERT') then
    raise exception 'service_role cannot INSERT guardrail_health_runs - the cron could not persist a run';
  end if;
  if not has_table_privilege('service_role', 'public.guardrail_health_runs', 'SELECT') then
    raise exception 'service_role cannot SELECT guardrail_health_runs - the cron would silently lose its re-alert memory';
  end if;
end $guard$;

commit;
