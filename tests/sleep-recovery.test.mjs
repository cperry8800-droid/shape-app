import test from 'node:test';
import assert from 'node:assert/strict';
import { sleepRecoveryFromProgress } from '../mobile-app/src/services/signalsMap.mjs';

// ⚠ THE CLOCK IS INJECTED. These fixtures used to carry hardcoded 2026-06 dates and
// non-date strings ('a', 'd0') because the function ignored dates entirely — it read the
// last 7 OBSERVATIONS, whatever week they came from. Now that the window is 7 calendar
// days, an uninjected clock would make the whole file expire.
const NOW = new Date(2026, 5, 26); // Fri 26 Jun 2026, local — window is 06-20 … 06-27
const at = (progress) => sleepRecoveryFromProgress(progress, { now: NOW });

test('null/empty progress → null (no fabricated recovery)', () => {
  assert.equal(at(null), null);
  assert.equal(at({ series: {} }), null);
  assert.equal(at({ series: { sleep: [] } }), null);
});

test('builds avg7 + lastNight from the sleep series', () => {
  const series = { sleep: [
    { date: '2026-06-20', value: 6 }, { date: '2026-06-21', value: 7 },
    { date: '2026-06-22', value: 6.5 }, { date: '2026-06-23', value: 8 },
    { date: '2026-06-24', value: 6 }, { date: '2026-06-25', value: 7 },
    { date: '2026-06-26', value: 5.5 },
  ] };
  const r = at({ series });
  assert.equal(r.sleepHours.lastNight, 5.5);                 // most recent point
  assert.equal(Math.round(r.sleepHours.avg7 * 10) / 10, 6.6); // mean of the last 7
  assert.equal(r.sleepHours.target, 7.5);
});

test('fewer than 7 points still averages what exists', () => {
  const r = at({ series: { sleep: [{ date: '2026-06-25', value: 6 }, { date: '2026-06-26', value: 8 }] } });
  assert.equal(r.sleepHours.lastNight, 8);
  assert.equal(r.sleepHours.avg7, 7);
});

test('drops non-positive / non-finite / missing-value points (lastNight from filtered, not raw tail)', () => {
  const r = at({ series: { sleep: [
    { date: '2026-06-21', value: 6 }, { date: '2026-06-22', value: 0 },
    { date: '2026-06-23', value: NaN }, { date: '2026-06-24', value: -1 },
    { date: '2026-06-25' /* missing value */ }, { date: '2026-06-26', value: 8 },
  ] } });
  assert.equal(r.sleepHours.lastNight, 8); // last finite-positive value, junk tail ignored
  assert.equal(r.sleepHours.avg7, 7);      // mean of [6, 8]
});

test('the 7-value cap holds even when one date carries several rows', () => {
  // The window already bounds the DAYS; this cap exists so a duplicated date cannot let
  // an 8th reading widen the "7-day" average it claims to be.
  const sleep = [
    { date: '2026-06-20', value: 1 }, { date: '2026-06-20', value: 1 },
    { date: '2026-06-21', value: 7 }, { date: '2026-06-22', value: 7 },
    { date: '2026-06-23', value: 7 }, { date: '2026-06-24', value: 7 },
    { date: '2026-06-25', value: 7 }, { date: '2026-06-26', value: 7 },
    { date: '2026-06-26', value: 7 },
  ];
  const r = at({ series: { sleep } });
  assert.equal(r.sleepHours.lastNight, 7);
  assert.equal(r.sleepHours.avg7, 7, 'the two leading 1s fall outside the last-7 cap');
});

// ── the registered defects ───────────────────────────────────────────────────────

test('STALE readings are excluded — 7 calendar days, not 7 observations', () => {
  // The whole bug: /api/client/progress returns up to 400 snapshots with no recency
  // filter, so three bad nights from MONTHS ago used to feed avg7 — and the newest
  // observation was presented as "lastNight" however old it was.
  const sleep = [
    { date: '2026-03-01', value: 3 }, { date: '2026-03-02', value: 3 },
    { date: '2026-03-03', value: 3 }, { date: '2026-06-25', value: 8 },
    { date: '2026-06-26', value: 8 },
  ];
  const r = at({ series: { sleep } });
  assert.equal(r.sleepHours.avg7, 8, 'March cannot feed a 7-day average');
  assert.equal(r.sleepHours.lastNight, 8);

  // And a series that is ENTIRELY stale is absence, not a stale reading.
  assert.equal(at({ series: { sleep: [{ date: '2026-03-01', value: 3 }] } }), null);
});

test('a FUTURE-dated row can never become lastNight', () => {
  // /api/client/checkin takes the day from the REQUEST, so 2099-01-01 is writable —
  // and being newest it would otherwise be this member's "last night" forever.
  const r = at({ series: { sleep: [
    { date: '2026-06-25', value: 7 }, { date: '2026-06-26', value: 7 },
    { date: '2099-01-01', value: 1 },
  ] } });
  assert.equal(r.sleepHours.lastNight, 7);
  assert.equal(r.sleepHours.avg7, 7);
  assert.equal(at({ series: { sleep: [{ date: '2099-01-01', value: 1 }] } }), null);
});

test('a point whose date cannot be proven is DROPPED, not trusted', () => {
  // Recency it cannot prove is absence — the under-firing direction.
  for (const date of ['a', '', null, undefined, 20260626, {}]) {
    assert.equal(at({ series: { sleep: [{ date, value: 7 }] } }), null, `date: ${String(date)}`);
  }
});

test('the window boundaries are inclusive on both ends', () => {
  const one = (date) => at({ series: { sleep: [{ date, value: 7 }] } });
  assert.ok(one('2026-06-20'), 'the cutoff day itself is in-window');
  assert.equal(one('2026-06-19'), null, 'the day before the cutoff is out');
  // ⚠ Tomorrow is ALLOWED: snapshot_date is the member's LOCAL day, so a member ahead
  // of this clock legitimately writes one. The day after is not a tz artifact.
  assert.ok(one('2026-06-27'), 'tomorrow is in-window (local-day tolerance)');
  assert.equal(one('2026-06-28'), null, 'the day after tomorrow is out');
});
