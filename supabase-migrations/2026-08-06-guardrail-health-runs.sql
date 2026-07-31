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

-- ⚠ AND FROM service_role, WHICH IS THE ROLE THIS FILE ORIGINALLY MISSED.
-- Supabase DEFAULT-GRANTS `DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
-- TRUNCATE, UPDATE` to service_role on every new table in `public` (verified
-- against production). So the revoke above — which names only public, anon and
-- authenticated — left service_role holding TRUNCATE, and the `grant select,
-- insert` below was a no-op re-stating two privileges it already had. The file
-- claimed the opposite in as many words.
--
-- ⚠ THIS IS THE #1851 BUG CLASS THIS FILE'S OWN HEADER CITES, APPLIED TO THE ROLE
-- NOBODY CHECKED. "revoke from public does not touch an explicit role grant" was
-- written down for anon and authenticated and then not swept for service_role.
--
-- So: revoke everything from service_role FIRST, then grant back exactly the two
-- verbs the cron uses. This table is an AUDIT TRAIL — one stray truncate from a
-- buggy service-role script erases the entire history in a single statement,
-- leaving no rowcount trace behind. The cron inserts one row per run and selects
-- the latest; those two verbs are the whole contract.
--
-- ⚠ ACCEPTED TRADE-OFFS, STATED RATHER THAN GLOSSED:
--   * Revoking DELETE leaves service_role with NO retention path. Deliberate at
--     ~365 rows/year of small jsonb — negligible, and a table that cannot be
--     pruned is a better audit trail than one that can be emptied by accident.
--     Pruning later means a migration that grants DELETE for the occasion.
--   * The table OWNER can still TRUNCATE, and no grant can change that. The
--     claim asserted below is scoped to service_role — the role the cron and
--     every ad-hoc service-key script actually connect as.
revoke all on public.guardrail_health_runs from service_role;

-- ⚠ AND A THIRD PLACE PRIVILEGES HIDE: COLUMN-LEVEL GRANTS.
-- `revoke all ON TABLE` clears `pg_class.relacl`. Column privileges live in a
-- SEPARATE store, `pg_attribute.attacl`, and a table-level revoke does not touch
-- them — so on a pre-existing or hand-altered table a `grant update (verdicts,
-- alerted) ... to service_role` survives every revoke above. Verified against
-- production: `pg_catalog.pg_subscription` grants SELECT to PUBLIC on 17 of its
-- columns and NOTHING at table level, and there
-- `has_table_privilege('anon', ..., 'SELECT')` is FALSE while
-- `has_any_column_privilege('anon', ..., 'SELECT')` is TRUE. So the guard below
-- could not see this, and this sweep is what makes its claim true rather than
-- merely asserted.
--
-- Dynamic over the live column list rather than the four expected names on
-- purpose: an extra column left behind by hand-iteration carries its own ACL,
-- and enumerating names would step straight past it.
do $cols$
declare
  r record;
begin
  for r in
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.guardrail_health_runs'::regclass
      and a.attnum > 0
      and not a.attisdropped
  loop
    execute format(
      'revoke all (%I) on table public.guardrail_health_runs from public, anon, authenticated, service_role',
      r.attname
    );
  end loop;
end $cols$;

-- Table-level, so it covers every column including any added later. Granted
-- AFTER the sweep above, which only clears the column store and cannot undo it.
grant select, insert on public.guardrail_health_runs to service_role;

-- No RLS policy is created deliberately: with RLS enabled and no policy, every
-- non-service role is denied by default. service_role bypasses RLS entirely.

-- ── The gate ──────────────────────────────────────────────────────────────
-- ⚠ INSIDE the transaction on purpose: a raised exception below rolls the DDL
-- back, so a table that cannot prove anon and authenticated are shut out is
-- never left behind. Committing first would demote every assertion to a report.
do $guard$
declare
  r         record;
  v_type    text;
  v_null    text;
  v_default text;
  v_pkcols  text[];
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

  -- ⚠ TYPE AND NULLABILITY ARE NOT THE WHOLE SHAPE, AND THE PIECE THE LOOP ABOVE
  -- CANNOT SEE IS THE ONE THAT BREAKS EVERY WRITE. A pre-existing table can carry
  -- `id uuid NOT NULL` and have LOST its `gen_random_uuid()` default — a hand
  -- `alter column id drop default` while iterating, or a table rebuilt from a
  -- partial dump. The loop passes (type and nullability are both still correct),
  -- `create table if not exists` no-ops, this file reports a clean re-run, and
  -- then EVERY run-record insert fails, because the cron omits `id` and lets the
  -- default supply it. The consequence is not just a lost audit trail: with no
  -- rows to read, the previous-run lookup finds nothing, so `bsEvaluateHealth`
  -- treats a CONTINUING alert as a fresh transition and re-notifies every single
  -- day — the exact flapping the run record exists to prevent.
  --
  -- `position(... in ...)`, never LIKE: `gen_random_uuid` contains `_`, which is
  -- a LIKE wildcard, so `like '%gen_random_uuid%'` would also match
  -- `genXrandomXuuid`. This repo has already shipped that bug once inside a guard.
  select c.column_default into v_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'guardrail_health_runs'
    and c.column_name  = 'id';
  if v_default is null or position('gen_random_uuid' in v_default) = 0 then
    raise exception
      'guardrail_health_runs.id has no gen_random_uuid() default (found: %) - the cron omits id on insert, so every run record would fail to write',
      coalesce(v_default, '<no default>');
  end if;

  -- And the primary-key contract the default sits under. A default only promises
  -- a value gets generated; the PRIMARY KEY is what promises it stays unique and
  -- non-null, and it is separately droppable. Asserted on the exact column set,
  -- so a PK moved onto another column — or widened into a composite, which would
  -- let two run records share an id — fails here instead of passing as
  -- "a primary key exists". Read from pg_constraint because information_schema
  -- cannot express the ordered column list in one read.
  select array_agg(a.attname::text order by k.ord) into v_pkcols
  from pg_constraint con
  cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a
    on a.attrelid = con.conrelid and a.attnum = k.attnum
  where con.conrelid = 'public.guardrail_health_runs'::regclass
    and con.contype  = 'p';
  if v_pkcols is null then
    raise exception
      'guardrail_health_runs has no primary key - run records could duplicate, and nothing enforces a unique id';
  end if;
  if v_pkcols <> array['id']::text[] then
    raise exception
      'guardrail_health_runs primary key is on (%), expected (id)', array_to_string(v_pkcols, ', ');
  end if;

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
  --
  -- ⚠ `has_any_column_privilege`, NOT `has_table_privilege`. The table-level
  -- function inspects `pg_class.relacl` ONLY: a role holding SELECT on a single
  -- column reads FALSE there, so the assertion passes while the role can still
  -- select that column. `has_any_column_privilege` is the strict superset — it
  -- is TRUE for a table-level grant AND for a column-only grant — which is
  -- exactly the "prove the absence" shape these two checks need. Confirmed
  -- against production on `pg_catalog.pg_subscription`, which carries column-only
  -- SELECT for PUBLIC: table-level FALSE, any-column TRUE.
  if has_any_column_privilege('anon', 'public.guardrail_health_runs', 'SELECT') then
    raise exception 'anon can still read guardrail_health_runs (table- or column-level)';
  end if;
  if has_any_column_privilege('authenticated', 'public.guardrail_health_runs', 'SELECT') then
    raise exception 'authenticated can still read guardrail_health_runs (table- or column-level)';
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

  -- ⚠ ASSERT THE ABSENCES, NOT JUST THE PRESENCES. The two checks above prove
  -- the cron can do its job; they say nothing about what else it can do, and
  -- "what else" is the entire point of an audit trail. A guard that only proves
  -- SELECT and INSERT exist passes unchanged over a table where Supabase's
  -- default grant left TRUNCATE, DELETE and UPDATE in place — certifying a
  -- posture the file does not actually deliver. Each is named separately so a
  -- failure says which verb survived.
  --
  -- TRUNCATE erases the history in one statement with no rowcount trace. DELETE
  -- erases it row by row. UPDATE is the quietest of the three and no less
  -- disqualifying: a rewritten verdict is a run record that says something the
  -- run did not say, which is worse than a missing one.
  --
  -- ⚠ TWO FUNCTIONS, AND THE SPLIT IS NOT COSMETIC. Only SELECT, INSERT, UPDATE
  -- and REFERENCES have a column-level form in PostgreSQL. TRUNCATE and DELETE
  -- act on whole rows, so they exist only at table level and
  -- `has_any_column_privilege(..., 'DELETE')` does not merely return false — it
  -- RAISES `22023 unrecognized privilege type` (verified against production),
  -- which inside this guard would abort the migration on a healthy database.
  -- So: table-level function for the two row-level verbs, column-aware function
  -- for UPDATE, which is the one of the three a column grant can smuggle in.
  for r in
    select unnest(array['TRUNCATE', 'DELETE']) as verb
  loop
    if has_table_privilege('service_role', 'public.guardrail_health_runs', r.verb) then
      raise exception
        'service_role still holds % on guardrail_health_runs - the audit trail can be rewritten or erased',
        r.verb;
    end if;
  end loop;

  -- The column-capable one. `grant update (verdicts) ...` is invisible to
  -- `has_table_privilege`, and rewriting `verdicts` or `alerted` is precisely the
  -- quiet corruption this assertion exists to rule out.
  if has_any_column_privilege('service_role', 'public.guardrail_health_runs', 'UPDATE') then
    raise exception
      'service_role still holds UPDATE on guardrail_health_runs (table- or column-level) - the audit trail can be rewritten';
  end if;
end $guard$;

commit;
