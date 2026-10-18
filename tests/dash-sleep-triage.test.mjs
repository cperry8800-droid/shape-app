// The recovery rule: a chronic 7-day sleep deficit (>= SLEEP_DEFICIT_H under
// target) becomes a first-class triage flag (sleep_low) + the member/coach
// directive's "sleep is the lever", while a single short night never flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateClient, buildDirective } = require('../public/newdesign/dashSignals.js');

const NOW = new Date('2026-06-16T12:00:00');
const rec = (avg7, lastNight, target = 7.5, n = 7) => ({ profile: { name: 'Q' }, recovery: { sleepHours: { avg7, lastNight, target, n } } });

test('severe chronic sleep deficit flags sleep_low', () => {
  const ev = evaluateClient(rec(5.5, 6.2), NOW, 'trainer');
  const f = ev.flags.find((x) => x.key === 'sleep_low');
  assert.ok(f, 'sleep_low flag present');
  assert.match(f.reason, /5.5h sleep vs a 7.5h target/);
});

test('severe deficit becomes the sleep directive (lever + action + reason + cite)', () => {
  const d = buildDirective(rec(5.8, 5.5), NOW, 'trainer');
  assert.equal(d.lever, 'sleep');
  assert.equal(d.action.kind, 'log_sleep');
  assert.match(d.reason, /recovery is running down/);
  assert.deepEqual(d.cited, ['sleep_low']);
});

test('a MILDER shortfall is left to the gentle narrative — not a hard flag', () => {
  // 6.0h (exactly 1.5 under target) and above stay below the triage bar (> 1.5).
  assert.equal(evaluateClient(rec(6.0, 6.0), NOW, 'trainer').flags.some((x) => x.key === 'sleep_low'), false);
  assert.equal(evaluateClient(rec(7.0, 7.0), NOW, 'trainer').flags.some((x) => x.key === 'sleep_low'), false);
  assert.equal(evaluateClient(rec(7.4, 7.4), NOW, 'trainer').flags.some((x) => x.key === 'sleep_low'), false);
});

test('no recovery data → no sleep flag', () => {
  assert.equal(evaluateClient({ profile: { name: 'Q' } }, NOW, 'trainer').flags.some((x) => x.key === 'sleep_low'), false);
});

test('sleep_low (35) is outranked by a higher-priority flag (streak_broken, 40)', () => {
  const r = rec(5.5, 5.5);
  r.streaks = { current: 0, best: 6 }; // broken training streak — higher priority
  const d = buildDirective(r, NOW, 'trainer');
  assert.equal(d.lever, 'training');
});

// ⚠ THE FLOOR (owner, 2026-10-18). One logged night under 6h used to be its own "7-day
// average": it raised sleep_low for the coach and sent the member a push. The engine now reads
// nothing below SLEEP_MIN_NIGHTS logged nights, and a record that does not say how many nights
// its average is over has no evidence at all.
const { THRESHOLDS } = require('../public/newdesign/dashSignals.js');

test('fewer than SLEEP_MIN_NIGHTS logged nights raise no sleep flag and no sleep lever', () => {
  assert.equal(THRESHOLDS.SLEEP_MIN_NIGHTS, 3);
  for (const n of [1, 2, undefined, null, 'x']) {
    const r = { profile: { name: 'Q' }, recovery: { sleepHours: { avg7: 5.0, lastNight: 5.0, target: 7.5, ...(n === undefined ? {} : { n }) } } };
    assert.equal(evaluateClient(r, NOW, 'trainer').flags.some((x) => x.key === 'sleep_low'), false, `sleep_low fired on n=${n}`);
    assert.notEqual(buildDirective(r, NOW, 'trainer').lever, 'sleep', `the sleep lever spoke on n=${n}`);
  }
  // A milder shortfall over too few nights is not the gentle lever either.
  assert.notEqual(buildDirective(rec(6.5, 6.5, 7.5, 2), NOW, 'trainer').lever, 'sleep');
});

test('three logged nights are enough', () => {
  assert.ok(evaluateClient(rec(5.0, 5.0, 7.5, 3), NOW, 'trainer').flags.some((x) => x.key === 'sleep_low'));
  assert.equal(buildDirective(rec(6.5, 6.5, 7.5, 3), NOW, 'trainer').lever, 'sleep');
});
