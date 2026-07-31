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
