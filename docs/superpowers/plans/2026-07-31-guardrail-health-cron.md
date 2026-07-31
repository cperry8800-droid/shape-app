# Guardrail Health Cron (Layer 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily scheduled check over `analytics_events` that alerts on the progression
guardrail's silent failure modes — the ones Sentry can never see, because the guardrail core
never throws by contract.

**Architecture:** A pure, fully-tested evaluation module (`src/lib/guardrail-health.mjs`)
that takes raw counts and returns verdicts plus the alerts to fire, wrapped by a thin Vercel
cron route that does only I/O — authenticate, query, call the module, persist, notify, ping
the heartbeat. This mirrors the existing `funnel.mjs` / `guardrail-gate.mjs` split, which is
how this codebase makes logic testable: **no cron route in this repo has a test, because
every route so far put its logic inline. This one does not.**

**Tech Stack:** Next.js route handler (`nodejs` runtime), Supabase admin client,
`node:test` + `node:assert/strict`, one SQL migration.

**Spec:** [`docs/superpowers/specs/2026-07-31-error-tracking-design.md`](../specs/2026-07-31-error-tracking-design.md)

## Global Constraints

- **Four checks, not five.** The `guardrail_evaluated`-count-is-zero check is deliberately
  NOT built — see the spec's *Registered, not built*.
- **Rates are per EVALUATION, never per publish.** `guardrail_evaluated` has two emission
  sites (`week-publish-server.ts:209` and `trainer/adjust/route.ts:327`), and Adjust writes
  one row per evaluation inside a `map`. The migration comment claiming "one row per
  publish" is wrong.
- **Malformed reasons are TWO values:** `'malformed_history'` and `'malformed_week'`.
  Matching only the first silently misses every malformed proposed week.
- **Sample floor = 20 evaluations.** Below it, rate checks report `insufficient_sample` —
  never a number, never zero.
- **Malformed alerts on ANY occurrence**, with no floor and no rate.
- **`insufficient_sample` never fires an alert** and never counts as a fault.
- **No Sentry dependency.** Sentry does not exist in this repo yet. Nothing in this plan may
  import `@sentry/*`.
- **Auth pattern is copied verbatim** from `src/app/api/cron/analytics-purge/route.ts`:
  `x-cron-secret` or `Authorization: Bearer`, compared with `timingSafeEqual`.
- **Timestamp column on `analytics_events` is `ts`** (not `created_at`).
- **Migrations revoke from `public`, `anon` AND `authenticated`** — not just `public`. See
  the bug class closed in #1851.
- **Line endings LF, zero NUL bytes** on every file touched. Verify before every commit.
- Test runner: `npm test` (`node --test "tests/**/*.test.mjs"`).

---

### Task 1: The pure evaluation module

All logic lives here so it can be tested without a database, a network, or a scheduler.

**Files:**
- Create: `src/lib/guardrail-health.mjs`
- Test: `tests/guardrail-health.test.mjs`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `BS_SAMPLE_FLOOR: number` (20)
  - `BS_MALFORMED_REASONS: string[]` (`['malformed_history', 'malformed_week']`)
  - `bsEvaluateHealth({ rpeDropped, evaluations, previous, nowISO }) -> { verdicts, alerts }`
    - `rpeDropped: number` — count of `session_rpe_dropped` rows in the last 24h
    - `evaluations: Array<{ state: string|null, unknownReason: string|null }>` — last 7d
    - `previous: object|null` — the prior run's `verdicts`
    - `nowISO: string` — ISO timestamp; the only "now" the module sees
    - returns `verdicts: Record<string, {status, value, sample, alertedAt}>` where
      `status` is `'ok' | 'alert' | 'insufficient_sample'`, and
      `alerts: Array<{ check, severity, message }>`

- [ ] **Step 1: Write the failing test**

Create `tests/guardrail-health.test.mjs`:

```javascript
// tests/guardrail-health.test.mjs
// Pure guardrail-health evaluation: raw counts -> verdicts + the alerts to fire.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsEvaluateHealth,
  BS_SAMPLE_FLOOR,
  BS_MALFORMED_REASONS,
} from '../src/lib/guardrail-health.mjs';

const NOW = '2026-08-01T07:00:00.000Z';

/** N evaluations of a given state, with an optional unknownReason. */
const evals = (n, state, unknownReason = null) =>
  Array.from({ length: n }, () => ({ state, unknownReason }));

test('the floor is 20 and both malformed reasons are covered', () => {
  assert.equal(BS_SAMPLE_FLOOR, 20);
  assert.deepEqual([...BS_MALFORMED_REASONS].sort(), ['malformed_history', 'malformed_week']);
});

test('rpe_dropped alerts on any count above zero', () => {
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 3, evaluations: [], previous: null, nowISO: NOW,
  });
  assert.equal(verdicts.rpe_dropped.status, 'alert');
  assert.equal(verdicts.rpe_dropped.value, 3);
  assert.equal(alerts.filter((a) => a.check === 'rpe_dropped').length, 1);
});

test('rpe_dropped is ok at zero', () => {
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0, evaluations: [], previous: null, nowISO: NOW,
  });
  assert.equal(verdicts.rpe_dropped.status, 'ok');
});

test('malformed alerts on a single occurrence, with no floor', () => {
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [{ state: 'unknown', unknownReason: 'malformed_history' }],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.status, 'alert');
  assert.equal(verdicts.malformed.value, 1);
  assert.equal(alerts.some((a) => a.check === 'malformed'), true);
});

test('malformed counts malformed_week too, not just malformed_history', () => {
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [
      { state: 'unknown', unknownReason: 'malformed_week' },
      { state: 'unknown', unknownReason: 'malformed_history' },
    ],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.value, 2);
});

test('other unknown reasons are NOT malformed', () => {
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [
      { state: 'unknown', unknownReason: 'incomplete_week' },
      { state: 'unknown', unknownReason: 'unscoreable' },
    ],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.status, 'ok');
  assert.equal(verdicts.malformed.value, 0);
});

test('rate checks report insufficient_sample below the floor and never a number', () => {
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: evals(19, 'red'),
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.red_rate.status, 'insufficient_sample');
  assert.equal(verdicts.red_rate.value, null);
  assert.equal(verdicts.red_rate.sample, 19);
  assert.equal(verdicts.unknown_rate.status, 'insufficient_sample');
  assert.equal(alerts.length, 0, 'insufficient_sample must never alert');
});

test('red_rate alerts above 5% once the floor is cleared', () => {
  // 2 red of 20 = 10%
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [...evals(2, 'red'), ...evals(18, 'green')],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.red_rate.status, 'alert');
  assert.equal(verdicts.red_rate.value, 0.1);
  assert.equal(verdicts.red_rate.sample, 20);
});

test('red_rate is ok exactly at the 5% threshold (strictly greater alerts)', () => {
  // 1 red of 20 = 5%, not > 5%
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [...evals(1, 'red'), ...evals(19, 'green')],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.red_rate.status, 'ok');
});

test('unknown_rate alerts above 10%, and malformed is a subset of it', () => {
  // 3 unknown of 20 = 15%; one of them malformed
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [
      { state: 'unknown', unknownReason: 'malformed_week' },
      { state: 'unknown', unknownReason: 'incomplete_week' },
      { state: 'unknown', unknownReason: 'unscoreable' },
      ...evals(17, 'green'),
    ],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.unknown_rate.status, 'alert');
  assert.equal(verdicts.unknown_rate.value, 0.15);
  assert.equal(verdicts.malformed.status, 'alert', 'malformed is counted independently');
});

test('an already-alerting check does not re-alert the next day', () => {
  const first = bsEvaluateHealth({
    rpeDropped: 1, evaluations: [], previous: null, nowISO: '2026-08-01T07:00:00.000Z',
  });
  assert.equal(first.alerts.length, 1);

  const second = bsEvaluateHealth({
    rpeDropped: 1, evaluations: [], previous: first.verdicts, nowISO: '2026-08-02T07:00:00.000Z',
  });
  assert.equal(second.alerts.length, 0, 'still bad, but not a new transition');
  assert.equal(second.verdicts.rpe_dropped.status, 'alert');
});

test('a persisting alert re-fires after seven days', () => {
  const first = bsEvaluateHealth({
    rpeDropped: 1, evaluations: [], previous: null, nowISO: '2026-08-01T07:00:00.000Z',
  });
  const later = bsEvaluateHealth({
    rpeDropped: 1, evaluations: [], previous: first.verdicts, nowISO: '2026-08-08T07:00:01.000Z',
  });
  assert.equal(later.alerts.length, 1, 'weekly reminder while unresolved');
});

test('recovering then failing again alerts once more', () => {
  const bad = bsEvaluateHealth({
    rpeDropped: 1, evaluations: [], previous: null, nowISO: '2026-08-01T07:00:00.000Z',
  });
  const good = bsEvaluateHealth({
    rpeDropped: 0, evaluations: [], previous: bad.verdicts, nowISO: '2026-08-02T07:00:00.000Z',
  });
  assert.equal(good.alerts.length, 0);
  assert.equal(good.verdicts.rpe_dropped.status, 'ok');

  const badAgain = bsEvaluateHealth({
    rpeDropped: 1, evaluations: [], previous: good.verdicts, nowISO: '2026-08-03T07:00:00.000Z',
  });
  assert.equal(badAgain.alerts.length, 1);
});

test('crossing the floor from insufficient_sample into ok is not an alert', () => {
  const thin = bsEvaluateHealth({
    rpeDropped: 0, evaluations: evals(5, 'green'), previous: null, nowISO: NOW,
  });
  const fat = bsEvaluateHealth({
    rpeDropped: 0, evaluations: evals(30, 'green'), previous: thin.verdicts, nowISO: NOW,
  });
  assert.equal(fat.alerts.length, 0);
  assert.equal(fat.verdicts.red_rate.status, 'ok');
});

test('malformed evaluations missing a state still count as malformed', () => {
  // Defensive: the reason is what identifies malformed, not the state string.
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [{ state: null, unknownReason: 'malformed_history' }],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.value, 1);
});

test('garbage rows never throw and never inflate a rate', () => {
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [null, undefined, 42, 'nope', {}, ...evals(20, 'green')],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.red_rate.status, 'ok');
  assert.equal(verdicts.malformed.value, 0);
  assert.equal(verdicts.red_rate.sample, 20, 'unreadable rows are excluded, not counted');
});

test('a missing rpeDropped count is treated as zero rather than throwing', () => {
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: null, evaluations: [], previous: null, nowISO: NOW,
  });
  assert.equal(verdicts.rpe_dropped.status, 'ok');
  assert.equal(verdicts.rpe_dropped.value, 0);
});

test('every alert carries a check name, severity and a human message', () => {
  const { alerts } = bsEvaluateHealth({
    rpeDropped: 2,
    evaluations: [{ state: 'unknown', unknownReason: 'malformed_week' }],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(alerts.length, 2);
  for (const a of alerts) {
    assert.ok(a.check, 'has a check name');
    assert.ok(['warning', 'error'].includes(a.severity));
    assert.ok(typeof a.message === 'string' && a.message.length > 10);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="malformed"`
Expected: FAIL — `Cannot find module '../src/lib/guardrail-health.mjs'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/guardrail-health.mjs`:

```javascript
// src/lib/guardrail-health.mjs
//
// Layer 2 of error tracking: the failure modes Sentry cannot see, because the
// progression guardrail NEVER THROWS BY CONTRACT. Pure — no database, no clock,
// no network. `nowISO` is the only "now" this module is allowed to know.
//
// ⚠ RATES ARE PER EVALUATION, NEVER PER PUBLISH. `guardrail_evaluated` has two
// emission sites (week-publish-server.ts and trainer/adjust/route.ts), and the
// Adjust one writes a row PER EVALUATION inside a map. The migration comment
// claiming "one row per publish" is wrong; sizing anything against it is wrong.

/** Below this many evaluations a rate is noise, so it is not reported at all. */
export const BS_SAMPLE_FLOOR = 20;

/**
 * ⚠ TWO values, not one. `progressionGuardrail.mjs` returns `malformed_history`
 * when the history is unusable and `malformed_week` when the proposed week is.
 * Matching only the first silently misses every malformed proposed week — and a
 * malformed check that cannot see half its subject is the exact silent failure
 * this module exists to catch.
 */
export const BS_MALFORMED_REASONS = ['malformed_history', 'malformed_week'];

const BS_RED_RATE_MAX = 0.05;
const BS_UNKNOWN_RATE_MAX = 0.10;

/** Re-announce an unresolved alert this often, so it is not forgotten. */
const BS_REALERT_MS = 7 * 24 * 60 * 60 * 1000;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/** A readable evaluation row, or null. Junk is EXCLUDED, never counted. */
function readEvaluation(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const state = typeof row.state === 'string' ? row.state : null;
  const unknownReason = typeof row.unknownReason === 'string' ? row.unknownReason : null;
  // A row with neither field carries no signal and must not pad a denominator.
  if (state === null && unknownReason === null) return null;
  return { state, unknownReason };
}

const verdict = (status, value, sample, alertedAt = null) => ({ status, value, sample, alertedAt });

/**
 * Decide whether a check that is currently `alert` should NOTIFY.
 *
 * Notifies on a transition into alert, and again every BS_REALERT_MS while it
 * stays there. Returns the `alertedAt` to persist.
 *
 * ⚠ `insufficient_sample` is not a state in either direction here: it never
 * notifies, and it never counts as the "previously fine" that arms a new alert
 * incorrectly — it simply leaves the previous stamp alone by having none.
 */
function shouldNotify(previousEntry, nowISO) {
  const wasAlerting = previousEntry && previousEntry.status === 'alert';
  if (!wasAlerting) return { notify: true, alertedAt: nowISO };

  const last = Date.parse(previousEntry.alertedAt || '');
  if (!Number.isFinite(last)) return { notify: true, alertedAt: nowISO };

  const now = Date.parse(nowISO);
  if (!Number.isFinite(now)) return { notify: false, alertedAt: previousEntry.alertedAt };

  if (now - last >= BS_REALERT_MS) return { notify: true, alertedAt: nowISO };
  return { notify: false, alertedAt: previousEntry.alertedAt };
}

/**
 * @param {{rpeDropped:number|null, evaluations:Array, previous:object|null, nowISO:string}} input
 * @returns {{verdicts:Record<string,object>, alerts:Array<{check,severity,message}>}}
 */
export function bsEvaluateHealth({ rpeDropped, evaluations, previous, nowISO }) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const rows = (Array.isArray(evaluations) ? evaluations : [])
    .map(readEvaluation)
    .filter(Boolean);
  const sample = rows.length;

  const verdicts = {};
  const alerts = [];

  /** Register a verdict, and an alert if it is bad and due to be announced. */
  const record = (check, status, value, sampleN, severity, message) => {
    if (status !== 'alert') {
      verdicts[check] = verdict(status, value, sampleN);
      return;
    }
    const { notify, alertedAt } = shouldNotify(prev[check], nowISO);
    verdicts[check] = verdict('alert', value, sampleN, alertedAt);
    if (notify) alerts.push({ check, severity, message });
  };

  // ── 1. session_rpe_dropped, 24h. A count, not a rate: any drop is a real
  //       rating a member gave that we failed to store.
  const dropped = finite(rpeDropped) ? rpeDropped : 0;
  record(
    'rpe_dropped',
    dropped > 0 ? 'alert' : 'ok',
    dropped,
    null,
    'error',
    `${dropped} session RPE rating(s) were given but not stored in the last 24h. `
    + 'A member rated a session and the write was rejected.',
  );

  // ── 2. malformed, ANY occurrence, no floor. Malformed is reserved for shapes
  //       NO LEGITIMATE WRITER CAN EMIT, so one row means our own code produced
  //       something it should not have. That is a bug, not a rate to trend.
  const malformed = rows.filter(
    (r) => r.unknownReason !== null && BS_MALFORMED_REASONS.includes(r.unknownReason),
  ).length;
  record(
    'malformed',
    malformed > 0 ? 'alert' : 'ok',
    malformed,
    sample,
    'error',
    `${malformed} guardrail evaluation(s) in the last 7d went unknown on malformed input `
    + `(${BS_MALFORMED_REASONS.join(' or ')}). Malformed means a shape no legitimate `
    + 'writer can emit, so this is our bug.',
  );

  // ── 3 & 4. The rate checks. Below the floor they report insufficient_sample —
  //          never zero, never a number. One unknown out of one evaluation is
  //          100% and would trip every threshold in the design.
  const rate = (check, matcher, max, severity, label) => {
    if (sample < BS_SAMPLE_FLOOR) {
      verdicts[check] = verdict('insufficient_sample', null, sample);
      return;
    }
    const hits = rows.filter(matcher).length;
    const value = hits / sample;
    record(
      check,
      value > max ? 'alert' : 'ok',
      value,
      sample,
      severity,
      `${label} rate is ${(value * 100).toFixed(1)}% over the last 7d `
      + `(${hits} of ${sample}), above the ${(max * 100).toFixed(0)}% threshold.`,
    );
  };

  rate('red_rate', (r) => r.state === 'red', BS_RED_RATE_MAX, 'warning', 'Red');
  rate('unknown_rate', (r) => r.state === 'unknown', BS_UNKNOWN_RATE_MAX, 'warning', 'Unknown');

  return { verdicts, alerts };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all `guardrail-health` tests PASS, and the pre-existing suite still passes.

- [ ] **Step 5: Verify line endings, then commit**

```bash
perl -pi -e 's/\r\n/\n/g' src/lib/guardrail-health.mjs tests/guardrail-health.test.mjs
perl -e 'local $/; for (@ARGV) { open F,"<:raw",$_; $d=<F>; die "NUL in $_\n" if $d=~/\x00/ } print "clean\n"' src/lib/guardrail-health.mjs tests/guardrail-health.test.mjs
git add src/lib/guardrail-health.mjs tests/guardrail-health.test.mjs
git commit -m "feat(health): the pure guardrail-health evaluation core

Four checks over analytics_events, with no database, clock or network.
Rates are per EVALUATION (two emission sites, Adjust writes one row per
evaluation) and malformed matches BOTH malformed_history and malformed_week."
```

---

### Task 2: The run-record migration

**Files:**
- Create: `supabase-migrations/2026-08-06-guardrail-health-runs.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.guardrail_health_runs (id, ran_at, verdicts, alerted)`,
  readable and writable by `service_role` only.

- [ ] **Step 1: Write the migration**

Create `supabase-migrations/2026-08-06-guardrail-health-runs.sql`:

```sql
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
--
-- ⚠ INSIDE the transaction, deliberately. A raised exception here must roll the
-- DDL back — a migration that cannot prove it worked is not a gate. Committing
-- first would leave the table durable after a failed assertion, and the re-run
-- would then satisfy "was it created?" while the real defect survived.
-- All five guard-bearing migrations in this repo commit AFTER the guard.
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
```

- [ ] **Step 2: Verify line endings and commit**

```bash
perl -pi -e 's/\r\n/\n/g' supabase-migrations/2026-08-06-guardrail-health-runs.sql
git add supabase-migrations/2026-08-06-guardrail-health-runs.sql
git commit -m "feat(health): guardrail_health_runs table, service-role only

RLS on with no policy (deny by default), revoked from anon AND authenticated
per the #1851 bug class, with a DO-block gate asserting all three."
```

- [ ] **Step 3: Hand the migration to the owner**

Post **only** the raw GitHub link, per the WORKLOG convention — no SQL body, no
explanation:
`https://raw.githubusercontent.com/cperry8800-droid/shape-app/<branch>/supabase-migrations/2026-08-06-guardrail-health-runs.sql`

⚠ The route in Task 3 cannot persist a run until this is applied. It is written to
degrade rather than crash (see Task 3, Step 3), so it can ship before the migration runs.

---

### Task 3: The cron route

**Files:**
- Create: `src/app/api/cron/guardrail-health/route.ts`
- Modify: `vercel.json` (add the cron entry)
- Reference (do not modify): `src/app/api/cron/analytics-purge/route.ts` — copy its auth verbatim

**Interfaces:**
- Consumes: `bsEvaluateHealth` from `@/lib/guardrail-health.mjs` (the `@/lib/*.mjs`
  specifier is this repo's established convention — see `@/lib/funnel.mjs` in
  `src/app/api/analytics/track/route.ts:10`); `createAdminClient` from
  `@/lib/supabase/admin`.
- Reads `analytics_events` columns `id`, `event`, `props`, `ts` — all confirmed present in
  `2026-06-23-analytics-events.sql`.
- Produces: `GET /api/cron/guardrail-health` returning
  `{ ok: true, verdicts, alerted: number, heartbeat: 'sent'|'skipped'|'failed' }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/cron/guardrail-health/route.ts`:

```typescript
// Daily: the silent-failure check over analytics_events (error-tracking Layer 2).
//
// Sentry cannot see any of this. The progression guardrail NEVER THROWS BY
// CONTRACT, so a broken guardrail is indistinguishable from a healthy one at the
// exception layer. This job is the only thing that would notice.
//
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { bsEvaluateHealth } from '@/lib/guardrail-health.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  return safeEqual(req.headers.get('x-cron-secret') || '', secret)
    || safeEqual(req.headers.get('authorization') || '', `Bearer ${secret}`);
}

/**
 * Where an alert goes.
 *
 * ⚠ Sentry does not exist in this repo yet, so this logs. When Layer 1 lands,
 * THIS FUNCTION BODY is the single place that changes — nothing else in the job
 * knows how an alert is delivered. Until then the findings reach Vercel logs and
 * the run record, and no further.
 */
function reportAlerts(alerts: Array<{ check: string; severity: string; message: string }>): void {
  for (const a of alerts) {
    console.error('[shape-health]', JSON.stringify({ alert: 'guardrail-health', ...a }));
  }
}

/**
 * The dead-man's switch.
 *
 * ⚠ Deliberately provider-agnostic: a plain GET to whatever URL is configured.
 * Sentry cron monitors, Healthchecks.io and Cronitor all accept exactly this, so
 * the heartbeat is not blocked on choosing one — and, critically, not blocked on
 * Sentry existing.
 *
 * ⚠ A HEARTBEAT IS ABOUT THE JOB RUNNING, NOT ABOUT THE CHECKS FINDING NOTHING.
 * A run where all four checks report insufficient_sample is a HEALTHY run and
 * must still ping. Only an actual failure to complete withholds it.
 */
async function sendHeartbeat(): Promise<'sent' | 'skipped' | 'failed'> {
  const url = process.env.HEARTBEAT_PING_URL || '';
  if (!url) return 'skipped';
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const admin = createAdminClient();
    const nowISO = new Date().toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. The RPE drops, last 24h. head:true so no rows cross the wire.
    const { count: rpeDropped, error: rpeErr } = await admin
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'session_rpe_dropped')
      .gte('ts', since24h);
    if (rpeErr) throw new Error(`rpe_dropped query failed: ${rpeErr.message}`);

    // ── 2. The evaluations, last 7d. Only the two fields the checks read.
    const { data: rawEvals, error: evalErr } = await admin
      .from('analytics_events')
      .select('props')
      .eq('event', 'guardrail_evaluated')
      .gte('ts', since7d);
    if (evalErr) throw new Error(`guardrail_evaluated query failed: ${evalErr.message}`);

    const evaluations = (rawEvals ?? []).map((r: { props: unknown }) => {
      const p = (r && typeof r.props === 'object' && r.props !== null ? r.props : {}) as
        Record<string, unknown>;
      return {
        state: typeof p.state === 'string' ? p.state : null,
        unknownReason: typeof p.unknownReason === 'string' ? p.unknownReason : null,
      };
    });

    // ── 3. The previous verdicts, for the transition test.
    //
    // ⚠ A MISSING TABLE MUST NOT KILL THE RUN. This ships before the migration is
    // applied; with no prior record every check reads as a fresh transition, which
    // is the safe direction — it over-reports once rather than staying silent.
    let previous: Record<string, unknown> | null = null;
    const { data: prevRow, error: prevErr } = await admin
      .from('guardrail_health_runs')
      .select('verdicts')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevErr) console.error('[shape-health] previous run unreadable:', prevErr.message);
    else if (prevRow) previous = prevRow.verdicts as Record<string, unknown>;

    // ── 4. The verdict.
    const { verdicts, alerts } = bsEvaluateHealth({
      rpeDropped: rpeDropped ?? 0, evaluations, previous, nowISO,
    });

    reportAlerts(alerts);

    // ── 5. Persist. A failed insert is logged, never thrown: losing the record
    //       costs the next run its transition test, which is far better than
    //       losing the alerts that were just raised.
    const { error: insErr } = await admin
      .from('guardrail_health_runs')
      .insert({ ran_at: nowISO, verdicts, alerted: alerts.length > 0 });
    if (insErr) console.error('[shape-health] run record not saved:', insErr.message);

    // ── 6. The heartbeat, last, and only on a completed run.
    const heartbeat = await sendHeartbeat();

    return NextResponse.json({ ok: true, verdicts, alerted: alerts.length, heartbeat });
  } catch (e) {
    // ⚠ NO HEARTBEAT ON THIS PATH. A job that threw did not do its work, and a
    // dead-man's switch that pings anyway is worse than none — it reports health
    // it did not verify.
    console.error('[shape-health] run failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
```

- [ ] **Step 2: Register the cron**

Modify `vercel.json` — add to the `crons` array, after `analytics-purge`:

```json
    {
      "path": "/api/cron/guardrail-health",
      "schedule": "0 9 * * *"
    }
```

09:00 UTC, after `analytics-purge` at 03:30 and the score cron at 07:00, so it never
contends with them.

- [ ] **Step 3: Verify it typechecks and builds**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: the full suite still passes.

- [ ] **Step 4: Verify line endings and commit**

```bash
perl -pi -e 's/\r\n/\n/g' src/app/api/cron/guardrail-health/route.ts vercel.json
git add src/app/api/cron/guardrail-health/route.ts vercel.json
git commit -m "feat(health): the guardrail-health cron route + heartbeat

Thin I/O shell over the pure core. Degrades rather than crashes when the run
table is absent, so it can ship before the migration is applied. The heartbeat
is a provider-agnostic ping and is deliberately NOT sent on the throw path."
```

---

### Task 4: Records

**Files:**
- Modify: `docs/WORKLOG.md` (Latest pointer + a dated changelog entry)

- [ ] **Step 1: Add the changelog entry**

Add a dated entry under `## Changelog`, and update the `> **Latest ...**` pointer. Follow
the surrounding entries' voice. It must state:

- Four checks, and **why the fifth was not built** (the count-is-zero check would fire on
  any quiet day, since `guardrail_evaluated` measures coach activity).
- ⚠ **Only two of four can fire pre-launch** — `rpe_dropped` and `malformed`. The two rate
  checks report `insufficient_sample` until 20 evaluations land in a 7-day window.
- ⚠ **Alerts currently reach Vercel logs only.** `reportAlerts` is the single seam; Layer 1
  replaces its body. Until then this job files findings nobody is notified about.
- ⚠ The **write-rule drift**: `2026-07-29-guardrail-week-publish.sql:266` claims
  "publish only, one row per publish"; there are two emission sites and Adjust writes one
  row per evaluation. Every rate here is per evaluation.
- The migration `2026-08-06-guardrail-health-runs.sql` and whether it is applied.
- `HEARTBEAT_PING_URL` is unset until the owner picks a provider, so the dead-man's switch
  is **inert** — the run reports `heartbeat: 'skipped'`.

- [ ] **Step 2: Verify line endings and commit**

```bash
perl -pi -e 's/\r\n/\n/g' docs/WORKLOG.md
git add docs/WORKLOG.md
git commit -m "docs(worklog): the guardrail-health cron (error tracking, Layer 2)"
```

---

## Owner actions after this plan

| # | Action | Without it |
|---|---|---|
| 1 | Apply `2026-08-06-guardrail-health-runs.sql` | No run record, so every alert re-fires daily |
| 2 | Set `HEARTBEAT_PING_URL` to a dead-man's-switch URL | Nothing notices if the cron stops |
| 3 | Create the Sentry org (Layer 1) | Alerts reach Vercel logs and no human |

⚠ **Items 2 and 3 are the difference between this job working and this job being
watched.** The checks are correct the moment the code ships; the notifications are not.
