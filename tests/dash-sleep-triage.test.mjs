// The recovery rule: a chronic 7-day sleep deficit (>= SLEEP_DEFICIT_H under
// target) becomes a first-class triage flag (sleep_low) + the member/coach
// directive's "sleep is the lever", while a single short night never flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateClient, buildDirective } = require('../public/newdesign/dashSignals.js');

const NOW = new Date('2026-06-16T12:00:00');
const rec = (avg7, lastNight, target = 7.5) => ({ profile: { name: 'Q' }, recovery: { sleepHours: { avg7, lastNight, target } } });

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
