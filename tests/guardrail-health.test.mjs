// tests/guardrail-health.test.mjs
// Pure guardrail-health evaluation: raw counts -> verdicts + the alerts to fire.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  bsEvaluateHealth,
  bsReadState,
  bsReadStateNote,
  BS_SAMPLE_FLOOR,
  BS_MALFORMED_REASONS,
} from '../src/lib/guardrail-health.mjs';
import {
  BS_GUARDRAIL_STATES,
  BS_UNKNOWN_REASONS,
  BS_MALFORMED_REASONS as BS_CORE_MALFORMED_REASONS,
  BS_STATE_GREEN,
  BS_STATE_AMBER,
  BS_STATE_RED,
  BS_STATE_UNKNOWN,
} from '../public/newdesign/progressionGuardrail.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEALTH_SRC = readFileSync(join(ROOT, 'src/lib/guardrail-health.mjs'), 'utf8');
const ROUTE_SRC = readFileSync(
  join(ROOT, 'src/app/api/cron/guardrail-health/route.ts'), 'utf8',
);

const NOW = '2026-08-01T07:00:00.000Z';

/** N evaluations of a given state, with an optional unknownReason. */
const evals = (n, state, unknownReason = null) =>
  Array.from({ length: n }, () => ({ state, unknownReason }));

test('the floor is 20 and both malformed reasons are covered', () => {
  assert.equal(BS_SAMPLE_FLOOR, 20);
  assert.deepEqual([...BS_MALFORMED_REASONS].sort(), ['malformed_history', 'malformed_week']);
});

test('a reason rename must break a test: the core unknown vocabulary is pinned here', () => {
  // The counterpart to the BS_GUARDRAIL_STATES pin below. Without this, renaming
  // `malformed_week` in progressionGuardrail.mjs makes the malformed check read 0
  // forever and NOTHING fails — the monitor goes blind exactly where it is meant
  // to see. Pinning the full vocabulary AND the malformed subset means a rename,
  // an addition or a removal surfaces as a red build.
  assert.deepEqual(
    [...BS_UNKNOWN_REASONS].sort(),
    ['incomplete_week', 'malformed_history', 'malformed_week', 'unscoreable'],
  );
  assert.deepEqual(
    [...BS_CORE_MALFORMED_REASONS].sort(),
    ['malformed_history', 'malformed_week'],
  );
});

test('the monitor uses the core vocabulary, it does not keep its own copy', () => {
  // Referential identity, not deep equality: a second literal that happens to
  // match today would pass a deepEqual and drift tomorrow.
  assert.equal(BS_MALFORMED_REASONS, BS_CORE_MALFORMED_REASONS);
});

test('BS_GUARDRAIL_STATES and the four named state constants agree', () => {
  // The array and the names are two separate exports in the core (kept apart
  // deliberately — see progressionGuardrail.mjs — because rebuilding the array
  // literal from the constants would touch an existing line and cost a
  // deletion that file is not allowed to carry). Nothing at runtime forces
  // them to describe the same vocabulary; this is what does. If a state is
  // ever added, removed or renamed in only one of the two places, this fails
  // instead of the two silently drifting apart.
  assert.deepEqual(
    [BS_STATE_GREEN, BS_STATE_AMBER, BS_STATE_RED, BS_STATE_UNKNOWN],
    BS_GUARDRAIL_STATES,
  );
});

test('the rate matchers are wired to the named constants, not to re-typed literals', () => {
  // A value-only pin (`BS_STATE_RED === 'red'`) does NOT catch this class of
  // regression: if someone reverts
  // `rate('red_rate', (r) => r.state === BS_STATE_RED, ...)` back to
  // `r.state === 'red'`, the value comparison above still passes today —
  // 'red' still equals 'red' — and the revert is invisible until the core
  // vocabulary is later renamed, at which point red_rate reads 0% forever
  // with nothing here to say why. So this asserts the WIRING itself, read
  // out of the shipped source: the matcher must reference the constant by
  // name, and must never hardcode the literal it stands in for. A reverted
  // literal fails this immediately, independent of whatever value the
  // constant currently holds.
  assert.match(
    HEALTH_SRC,
    /rate\('red_rate',\s*\(r\)\s*=>\s*r\.state\s*===\s*BS_STATE_RED,/,
    'red_rate must compare against the imported BS_STATE_RED constant',
  );
  assert.doesNotMatch(
    HEALTH_SRC,
    /rate\('red_rate',\s*\(r\)\s*=>\s*r\.state\s*===\s*'red'/,
    'red_rate must not hardcode the literal it is supposed to import',
  );
  assert.match(
    HEALTH_SRC,
    /rate\('unknown_rate',\s*\(r\)\s*=>\s*r\.state\s*===\s*BS_STATE_UNKNOWN,/,
    'unknown_rate must compare against the imported BS_STATE_UNKNOWN constant',
  );
  assert.doesNotMatch(
    HEALTH_SRC,
    /rate\('unknown_rate',\s*\(r\)\s*=>\s*r\.state\s*===\s*'unknown'/,
    'unknown_rate must not hardcode the literal it is supposed to import',
  );
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

test('a fault that dips below the floor and comes back does NOT re-notify', () => {
  // The regression this exists for: alert -> insufficient_sample -> alert.
  // `insufficient_sample` means "could not check", not "checked, and fine", so
  // the alerting episode is still open across the gap. Reading day 2 as a
  // recovery makes day 3 announce a CONTINUING fault as a NEW one, every time
  // the sample happens to dip — precisely the flapping this control prevents.
  const failing = [...evals(3, 'red'), ...evals(17, 'green')];   // 15% of 20
  const thin = [...evals(3, 'red'), ...evals(15, 'green')];      // 18 < floor

  const day1 = bsEvaluateHealth({
    rpeDropped: 0, evaluations: failing, previous: null, nowISO: '2026-08-01T07:00:00.000Z',
  });
  assert.equal(day1.verdicts.red_rate.status, 'alert');
  assert.equal(day1.alerts.filter((a) => a.check === 'red_rate').length, 1);

  const day2 = bsEvaluateHealth({
    rpeDropped: 0, evaluations: thin, previous: day1.verdicts, nowISO: '2026-08-02T07:00:00.000Z',
  });
  assert.equal(day2.verdicts.red_rate.status, 'insufficient_sample');
  assert.equal(day2.alerts.length, 0, 'insufficient_sample never alerts');
  assert.equal(
    day2.verdicts.red_rate.alertedAt, '2026-08-01T07:00:00.000Z',
    'the open episode keeps its stamp across the gap',
  );

  const day3 = bsEvaluateHealth({
    rpeDropped: 0, evaluations: failing, previous: day2.verdicts, nowISO: '2026-08-03T07:00:00.000Z',
  });
  assert.equal(day3.verdicts.red_rate.status, 'alert');
  assert.equal(
    day3.alerts.filter((a) => a.check === 'red_rate').length, 0,
    'a continuing fault must not read as a new one',
  );
  assert.equal(day3.verdicts.red_rate.alertedAt, '2026-08-01T07:00:00.000Z');
});

test('the weekly reminder still lands across an insufficient_sample gap', () => {
  // The other half: carrying the stamp must not DISABLE the re-alert either.
  const failing = [...evals(3, 'red'), ...evals(17, 'green')];
  const thin = [...evals(3, 'red'), ...evals(15, 'green')];

  const day1 = bsEvaluateHealth({
    rpeDropped: 0, evaluations: failing, previous: null, nowISO: '2026-08-01T07:00:00.000Z',
  });
  const mid = bsEvaluateHealth({
    rpeDropped: 0, evaluations: thin, previous: day1.verdicts, nowISO: '2026-08-04T07:00:00.000Z',
  });
  const later = bsEvaluateHealth({
    rpeDropped: 0, evaluations: failing, previous: mid.verdicts, nowISO: '2026-08-08T07:00:01.000Z',
  });
  assert.equal(later.alerts.filter((a) => a.check === 'red_rate').length, 1);
});

test('a real recovery still clears the stamp, so a relapse notifies', () => {
  // `ok` is the ONLY status allowed to clear a stamp — otherwise the carry-through
  // above would silence a genuine new fault after a genuine recovery.
  const failing = [...evals(3, 'red'), ...evals(17, 'green')];
  const clean = evals(20, 'green');

  const bad = bsEvaluateHealth({
    rpeDropped: 0, evaluations: failing, previous: null, nowISO: '2026-08-01T07:00:00.000Z',
  });
  const good = bsEvaluateHealth({
    rpeDropped: 0, evaluations: clean, previous: bad.verdicts, nowISO: '2026-08-02T07:00:00.000Z',
  });
  assert.equal(good.verdicts.red_rate.status, 'ok');
  assert.equal(good.verdicts.red_rate.alertedAt, null, 'ok clears the episode');

  const badAgain = bsEvaluateHealth({
    rpeDropped: 0, evaluations: failing, previous: good.verdicts, nowISO: '2026-08-03T07:00:00.000Z',
  });
  assert.equal(badAgain.alerts.filter((a) => a.check === 'red_rate').length, 1);
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

test('NON-OBJECT garbage never throws, never inflates a rate, and is NOT malformed', () => {
  // ⚠ RECONCILED DELIBERATELY WITH THE `{}` CASE BELOW — `{}` used to be in this
  // list and is now its own test, because the two are different faults.
  //
  // A non-object cannot be a `guardrail_evaluated` row: the route maps every row
  // through `{state, unknownReason}` before this module ever sees it, so a
  // non-object only arrives when a CALLER passes something that is not a row.
  // There is no telemetry row behind it to investigate, so counting it malformed
  // would file a caller bug as a producer bug — the exact mis-filing that
  // switches this monitor off. Excluded, counted nowhere.
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [null, undefined, 42, 'nope', ...evals(20, 'green')],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.red_rate.status, 'ok');
  assert.equal(verdicts.malformed.value, 0, 'a non-row is not a malformed row');
  assert.equal(verdicts.malformed.status, 'ok');
  assert.equal(verdicts.red_rate.sample, 20, 'unreadable rows are excluded, not counted');
});

test('a row with NEITHER state nor unknownReason counts as malformed and alerts', () => {
  // The other half of the split above. `{}` is what the route emits for a REAL
  // row whose props carry no usable state and no usable reason — and the producer
  // writes a computed state on every path, so such a row is a shape no legitimate
  // writer can emit. It used to be dropped silently, which is how a systematic
  // telemetry-mapper regression could report `malformed: ok/0`.
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [{}],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.status, 'alert');
  assert.equal(verdicts.malformed.value, 1);
  assert.equal(alerts.some((a) => a.check === 'malformed'), true);
  const malformedAlert = alerts.find((a) => a.check === 'malformed');
  assert.match(
    malformedAlert.message, /no readable state/,
    'the missing-state contributor is named distinctly from the other two',
  );
});

test('a stateless row is excluded from the rate denominators', () => {
  // Same treatment as an unrecognized state, for the same reason: it matches
  // neither 'red' nor 'unknown', so leaving it in dilutes BOTH rates downward —
  // a monitor reading better exactly as it goes blind. 19 recognized + 1 stateless
  // must fall below the floor rather than divide by 20.
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [...evals(19, 'green'), {}],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.red_rate.status, 'insufficient_sample');
  assert.equal(verdicts.red_rate.sample, 19, 'the stateless row is out of the denominator');
  assert.equal(verdicts.unknown_rate.status, 'insufficient_sample');
  assert.equal(verdicts.unknown_rate.sample, 19);
  assert.equal(verdicts.malformed.value, 1, 'but it is still counted as malformed');
});

test('the systematic-regression case: every row stateless still raises malformed', () => {
  // Codex's scenario. A regression in the telemetry mapper writes 40 rows with no
  // state. Before the fix: malformed read ok/0 and the rate checks merely fell to
  // insufficient_sample, so NOTHING alerted.
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: Array.from({ length: 40 }, () => ({})),
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.value, 40);
  assert.equal(alerts.filter((a) => a.check === 'malformed').length, 1);
  assert.equal(verdicts.red_rate.status, 'insufficient_sample');
  assert.equal(verdicts.red_rate.sample, 0);
});

test('a row satisfying two malformed predicates is counted ONCE', () => {
  // An unrecognized state AND a malformed reason on the same row is one bad row,
  // not two. Summing the per-contributor counts would say two.
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [{ state: 'archived', unknownReason: 'malformed_week' }],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.value, 1, 'one row, one count');
  const { alerts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [{ state: 'archived', unknownReason: 'malformed_week' }],
    previous: null,
    nowISO: NOW,
  });
  const msg = alerts.find((a) => a.check === 'malformed').message;
  assert.match(msg, /does not recognise/, 'both contributors are still named');
  assert.match(msg, /malformed input/);
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

test('a corrupt alertedAt re-notifies rather than going silent forever', () => {
  // An unreadable stamp must not be treated as "recently alerted". Over-notifying
  // is the safe direction; a corrupt stamp that disables an alert permanently is not.
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 1,
    evaluations: [],
    previous: { rpe_dropped: { status: 'alert', value: 1, sample: null, alertedAt: 'not-a-date' } },
    nowISO: NOW,
  });
  assert.equal(alerts.length, 1, 'an unreadable stamp re-arms the alert');
  assert.equal(alerts[0].check, 'rpe_dropped');
  assert.equal(verdicts.rpe_dropped.alertedAt, NOW, 'and the corrupt stamp is replaced');
});

test('a FUTURE alertedAt re-notifies and resets rather than silencing forever', () => {
  // A parseable stamp later than now (clock correction, corrupted run record) is
  // the corruption that used to slip through: `now - last` is negative, so the
  // seven-day re-alert test can never fire, and the same future stamp is written
  // back on every run. For a far-future value the check is silenced permanently.
  const FUTURE = '2126-01-01T00:00:00.000Z';
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 1,
    evaluations: [],
    previous: { rpe_dropped: { status: 'alert', value: 1, sample: null, alertedAt: FUTURE } },
    nowISO: NOW,
  });
  assert.equal(alerts.length, 1, 'a future stamp re-arms the alert');
  assert.equal(alerts[0].check, 'rpe_dropped');
  assert.equal(
    verdicts.rpe_dropped.alertedAt, NOW,
    'and the future stamp is REPLACED, so it cannot re-suppress the next run',
  );
});

test('alertedAt exactly equal to now still suppresses (only strictly future is invalid)', () => {
  // Two runs inside the same millisecond is an ordinary repeat, not a corrupt
  // stamp — the boundary the future-stamp guard must not swallow.
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 1,
    evaluations: [],
    previous: { rpe_dropped: { status: 'alert', value: 1, sample: null, alertedAt: NOW } },
    nowISO: NOW,
  });
  assert.equal(alerts.length, 0, 'an already-open episode stamped this instant does not re-notify');
  assert.equal(verdicts.rpe_dropped.status, 'alert', 'the fault is still recorded');
  assert.equal(verdicts.rpe_dropped.alertedAt, NOW, 'and the stamp is carried, not refreshed');
});

test('an unparseable nowISO skips one run without losing the last stamp', () => {
  // One run is skipped rather than notified, but the last valid stamp survives, so
  // the seven-day reminder still lands on schedule once the clock reads properly again.
  const STAMPED = '2026-07-30T07:00:00.000Z';
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 1,
    evaluations: [],
    previous: { rpe_dropped: { status: 'alert', value: 1, sample: null, alertedAt: STAMPED } },
    nowISO: 'garbage',
  });
  assert.equal(alerts.length, 0, 'an unreadable now cannot justify a new notification');
  assert.equal(verdicts.rpe_dropped.status, 'alert', 'the fault is still recorded');
  assert.equal(verdicts.rpe_dropped.alertedAt, STAMPED, 'the last valid stamp is preserved');
});

test('unknown_rate is ok exactly at the 10% threshold (strictly greater alerts)', () => {
  // 2 unknown of 20 = 10%, not > 10%
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [...evals(2, 'unknown'), ...evals(18, 'green')],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.unknown_rate.status, 'ok');
  assert.equal(verdicts.unknown_rate.value, 0.1);
  assert.equal(verdicts.unknown_rate.sample, 20);
});

test('a rename must break a test: the core state vocabulary is pinned here', () => {
  // If progressionGuardrail.mjs ever renames/adds/removes a state, this fails —
  // a red test here is the whole point: it surfaces as a build failure instead
  // of red_rate quietly reading 0% forever because the matcher never matches.
  assert.deepEqual(
    [...BS_GUARDRAIL_STATES].sort(),
    ['amber', 'green', 'red', 'unknown'],
  );
});

test('an unrecognized state value is excluded from the rate denominators AND counted as malformed', () => {
  // 19 recognized + 1 row carrying a state outside BS_GUARDRAIL_STATES. Counted
  // in the total readable sample (20), but the rate denominator must drop it —
  // 19 is below the floor, so the rate checks must report insufficient_sample
  // rather than a rate diluted by a row that matches neither 'red' nor 'unknown'.
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [...evals(19, 'green'), { state: 'archived', unknownReason: null }],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.red_rate.status, 'insufficient_sample');
  assert.equal(verdicts.red_rate.sample, 19, 'the unrecognized row is excluded from the denominator');
  assert.equal(verdicts.unknown_rate.status, 'insufficient_sample');
  assert.equal(verdicts.unknown_rate.sample, 19);
  assert.equal(verdicts.malformed.value, 1, 'the unrecognized-state row is still counted');
});

test('a DROPPED state with a legitimate reason is malformed, not a free pass', () => {
  // Codex's scenario, and the hole the old "both fields absent" predicate had:
  // the telemetry mapper stops writing `state` but preserves a real reason, so
  // every row reads `{state: null, unknownReason: 'incomplete_week'}`. That row
  // satisfied NO malformed predicate — it was not stateless (it has a reason) and
  // not an unrecognized state (it has none) — so 20 of them reported
  // `malformed: ok/0` AND both rates `ok/0`, with the producer contract broken on
  // every single row. A state is either recognised or unreadable; a reason on the
  // same row says nothing about whether a state was computed.
  const dropped = Array.from(
    { length: 20 },
    () => ({ state: null, unknownReason: 'incomplete_week' }),
  );
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 0, evaluations: dropped, previous: null, nowISO: NOW,
  });
  assert.equal(verdicts.malformed.value, 20, 'every row is malformed');
  assert.equal(verdicts.malformed.status, 'alert');
  assert.equal(alerts.filter((a) => a.check === 'malformed').length, 1);

  // And out of the denominators: the rate checks must go quiet as
  // insufficient_sample rather than report a confident ok/0 over rows they
  // cannot read.
  assert.equal(verdicts.red_rate.status, 'insufficient_sample');
  assert.equal(verdicts.red_rate.sample, 0, 'unreadable states are not a denominator');
  assert.equal(verdicts.unknown_rate.status, 'insufficient_sample');
  assert.equal(verdicts.unknown_rate.sample, 0);

  const msg = alerts.find((a) => a.check === 'malformed').message;
  assert.match(msg, /no readable state/, 'the diagnosis says WHICH fault this is');
  assert.doesNotMatch(
    msg, /does not recognise/,
    'a missing state is not an unrecognized one — the two have different fixes',
  );
});

test('one dropped-state row still leaves the denominators honest', () => {
  // The boundary version: 19 readable + 1 whose state was dropped but which
  // carries a legitimate reason. The unreadable row must not pad the denominator
  // to 20 and buy a rate the monitor cannot actually compute.
  const { verdicts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [...evals(19, 'green'), { state: null, unknownReason: 'unscoreable' }],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.value, 1);
  assert.equal(verdicts.red_rate.status, 'insufficient_sample');
  assert.equal(verdicts.red_rate.sample, 19);
  assert.equal(verdicts.unknown_rate.sample, 19);
});

test('a row that is BOTH state-unreadable and reason-malformed is counted once', () => {
  // The overlap the widened predicate creates. The total is the union, and the
  // message says so rather than leaving a reader to add three numbers that come
  // to more than the total it just quoted.
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [{ state: null, unknownReason: 'malformed_week' }],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.value, 1, 'one row, one count');
  const msg = alerts.find((a) => a.check === 'malformed').message;
  assert.match(msg, /malformed input/, 'the guardrail-reported fault is named');
  assert.match(msg, /no readable state/, 'and so is the mapper fault');
  assert.match(msg, /do not sum to the total/, 'the overlap is stated, not left to guesswork');
});

// ── the 7-day read: one conservative flag, four distinguishable facts ────────

test('a ceiling-length read with the count agreeing is ceiling_exact, not truncation', () => {
  // The misleading-history case. A window holding exactly 5000 evaluations spends
  // the whole budget and the count agrees: nothing is KNOWN to be missing. The
  // flag stays set (see the next test for why), but the record must not describe
  // this as rows lost — a history where a quiet week and a demonstrable loss read
  // identically is one nobody consults.
  assert.equal(bsReadState({ rows: 5000, matched: 5000, ceiling: 5000 }), 'ceiling_exact');
  const note = bsReadStateNote({ state: 'ceiling_exact', rows: 5000, matched: 5000, ceiling: 5000 });
  assert.match(note, /Nothing is known to be missing/);
  assert.doesNotMatch(note, /CUT SHORT/, 'a full budget is not evidence of loss');
  assert.match(note, /not proof of absence/, 'but it still cannot certify the window');
});

test('⚠ ceiling_exact must NOT be used to clear the truncated flag', () => {
  // The trap. `rows === matched` looks like proof of a complete read and is not:
  // `matched` is page 0's count, and a row backfilled with an old `ts` into a
  // region the cursor already paged past is neither fetched nor counted — the two
  // numbers agree while a row is gone. The route's flag therefore stays
  // conservative at the ceiling regardless of the count, and this pins the
  // expression so a later "simplification" fails here instead of silently
  // reopening the omission.
  assert.match(
    ROUTE_SRC,
    /const truncated = rows\.length >= EVAL_MAX_ROWS\s*\n\s*\|\| \(matched !== null && rows\.length !== matched\);/,
    'the ceiling clause must stay unconditional',
  );
  assert.doesNotMatch(
    ROUTE_SRC, /rows\.length >= EVAL_MAX_ROWS && rows\.length !== matched/,
    'equality must never be treated as proof of a complete read',
  );
});

test('a ceiling-length read with a disagreeing count is a genuine truncation', () => {
  assert.equal(bsReadState({ rows: 5000, matched: 6200, ceiling: 5000 }), 'ceiling_truncated');
  assert.match(
    bsReadStateNote({ state: 'ceiling_truncated', rows: 5000, matched: 6200, ceiling: 5000 }),
    /CUT SHORT/,
  );
});

test('a count disagreement without the ceiling says the set shifted, and which way', () => {
  assert.equal(bsReadState({ rows: 4990, matched: 5000, ceiling: 99999 }), 'count_shifted');
  assert.match(
    bsReadStateNote({ state: 'count_shifted', rows: 4990, matched: 5000, ceiling: 99999 }),
    /SHRANK/,
  );
  assert.equal(bsReadState({ rows: 5010, matched: 5000, ceiling: 99999 }), 'count_shifted');
  assert.match(
    bsReadStateNote({ state: 'count_shifted', rows: 5010, matched: 5000, ceiling: 99999 }),
    /GREW/, 'a set that grew under the read is as interesting as one that shrank',
  );
});

test('a missing count is its own state, ceiling or not', () => {
  // "Could not check" is not "checked, and fine" — the same distinction the rate
  // checks make with insufficient_sample.
  assert.equal(bsReadState({ rows: 5000, matched: null, ceiling: 5000 }), 'ceiling_count_unknown');
  assert.equal(bsReadState({ rows: 42, matched: null, ceiling: 5000 }), 'count_unknown');
  assert.match(
    bsReadStateNote({ state: 'count_unknown', rows: 42, matched: null, ceiling: 5000 }),
    /no exact count/,
  );
});

test('an ordinary short read with an agreeing count is complete', () => {
  assert.equal(bsReadState({ rows: 42, matched: 42, ceiling: 5000 }), 'complete');
});

test('the read state reaches BOTH the log line and the persisted record', () => {
  // A state nobody can read is not a fix. It has to ride the log (for the run in
  // front of you) AND `_read` (for the history months later), and the benign case
  // must not be logged at error level — an error line on a run with nothing known
  // missing is exactly the noise that gets a check muted.
  assert.match(ROUTE_SRC, /const read = \{ evaluations: rawEvals\.length, matched, truncated, state \}/);
  assert.match(ROUTE_SRC, /message: bsReadStateNote\(\{/);
  assert.match(
    ROUTE_SRC, /state === 'ceiling_exact' \? 'info' : 'warning'/,
    'the benign ceiling case is reported as info, not as a warning',
  );
});

test('the malformed alert fires on a single unrecognized-state row', () => {
  const { verdicts, alerts } = bsEvaluateHealth({
    rpeDropped: 0,
    evaluations: [{ state: 'archived', unknownReason: null }],
    previous: null,
    nowISO: NOW,
  });
  assert.equal(verdicts.malformed.status, 'alert');
  assert.equal(verdicts.malformed.value, 1);
  assert.equal(alerts.some((a) => a.check === 'malformed'), true);
  const malformedAlert = alerts.find((a) => a.check === 'malformed');
  assert.match(malformedAlert.message, /does not recognise/, 'names the unrecognized-state contributor distinctly');
});
