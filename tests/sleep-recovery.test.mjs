import test from 'node:test';
import assert from 'node:assert/strict';
import { sleepRecoveryFromProgress } from '../mobile-app/src/services/signalsMap.mjs';

test('null/empty progress → null (no fabricated recovery)', () => {
  assert.equal(sleepRecoveryFromProgress(null), null);
  assert.equal(sleepRecoveryFromProgress({ series: {} }), null);
  assert.equal(sleepRecoveryFromProgress({ series: { sleep: [] } }), null);
});

test('builds avg7 + lastNight from the sleep series', () => {
  const series = { sleep: [
    { date: '2026-06-20', value: 6 }, { date: '2026-06-21', value: 7 },
    { date: '2026-06-22', value: 6.5 }, { date: '2026-06-23', value: 8 },
    { date: '2026-06-24', value: 6 }, { date: '2026-06-25', value: 7 },
    { date: '2026-06-26', value: 5.5 },
  ] };
  const r = sleepRecoveryFromProgress({ series });
  assert.equal(r.sleepHours.lastNight, 5.5);                 // most recent point
  assert.equal(Math.round(r.sleepHours.avg7 * 10) / 10, 6.6); // mean of the last 7
  assert.equal(r.sleepHours.target, 7.5);
});

test('fewer than 7 points still averages what exists', () => {
  const r = sleepRecoveryFromProgress({ series: { sleep: [{ date: '2026-06-25', value: 6 }, { date: '2026-06-26', value: 8 }] } });
  assert.equal(r.sleepHours.lastNight, 8);
  assert.equal(r.sleepHours.avg7, 7);
});

test('drops non-positive / non-finite / missing-value points (lastNight from filtered, not raw tail)', () => {
  const r = sleepRecoveryFromProgress({ series: { sleep: [
    { date: 'a', value: 6 }, { date: 'b', value: 0 }, { date: 'c', value: NaN },
    { date: 'd', value: -1 }, { date: 'e' /* missing value */ }, { date: 'f', value: 8 },
  ] } });
  assert.equal(r.sleepHours.lastNight, 8); // last finite-positive value, junk tail ignored
  assert.equal(r.sleepHours.avg7, 7);      // mean of [6, 8]
});

test('avg7 averages only the last 7 of a longer series', () => {
  // 9 points; the two leading 1s must fall outside the last-7 window
  const sleep = [1, 1, 7, 7, 7, 7, 7, 7, 7].map((v, i) => ({ date: `d${i}`, value: v }));
  const r = sleepRecoveryFromProgress({ series: { sleep } });
  assert.equal(r.sleepHours.lastNight, 7);
  assert.equal(r.sleepHours.avg7, 7);
});
