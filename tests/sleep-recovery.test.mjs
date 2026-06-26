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
