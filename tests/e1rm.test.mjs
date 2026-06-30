// Estimated 1-rep max (Epley) + a strength progression verdict folded over a
// per-lift series of best-set e1RMs. The /api/client/strength route, the TS
// twin (src/lib/e1rm.ts), and the get_client_lifts SQL all mirror this. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  epleyE1rm, buildLiftSeries, progressionStatus, summarizeLift,
  E1RM_MAX_REPS, PROGRESS_DEADBAND, STALL_WEEKS,
} from '../mobile-app/src/services/e1rm.mjs';

const DAY = 86400000;
const iso = (now, daysAgo) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10);

test('epley: a true single returns the load itself (no inflation)', () => {
  assert.equal(epleyE1rm(100, 1), 100);
});

test('epley: 100 × 5 ≈ 116.67', () => {
  assert.ok(Math.abs(epleyE1rm(100, 5) - 116.6667) < 0.01);
});

test('epley: reps above the cap or non-positive load → null', () => {
  assert.equal(epleyE1rm(100, E1RM_MAX_REPS + 1), null);
  assert.equal(epleyE1rm(0, 5), null);
  assert.equal(epleyE1rm(100, 0), null);
  assert.equal(epleyE1rm('x', 5), null);
});

test('buildLiftSeries: groups by lift+day, keeps the best e1RM per day, sorts', () => {
  const rows = [
    { move_name: 'Back Squat', date: '2026-05-01', load: 100, reps: 5 },   // e1rm 116.7
    { move_name: 'back squat', date: '2026-05-01', load: 110, reps: 3 },   // e1rm 121 (same day, higher)
    { move_name: 'Back Squat', date: '2026-04-20', load: 90, reps: 5 },    // e1rm 105
    { move_name: 'Bench', date: '2026-05-01', load: 60, reps: 8 },
  ];
  const lifts = buildLiftSeries(rows);
  const squat = lifts.find((l) => l.key === 'back squat');
  assert.equal(squat.name, 'Back Squat');                // most-recent casing
  assert.equal(squat.series.length, 2);                  // two distinct days
  assert.equal(squat.series[0].date, '2026-04-20');      // sorted ascending
  assert.equal(squat.series[1].e1rm, 121);               // best of the two same-day sets
});

test('buildLiftSeries: skips incomplete sets and out-of-range reps', () => {
  const rows = [
    { move_name: 'Deadlift', date: '2026-05-01', load: 200, reps: 5, completed: false },
    { move_name: 'Deadlift', date: '2026-05-02', load: 200, reps: 20 },
  ];
  assert.equal(buildLiftSeries(rows).length, 0);
});

test('progressionStatus: building when fewer than two points', () => {
  const r = progressionStatus([{ date: '2026-05-01', e1rm: 120 }], { now: Date.parse('2026-05-02') });
  assert.equal(r.status, 'building');
});

test('progressionStatus: progressing when recent beats prior by > deadband', () => {
  const now = Date.parse('2026-05-30');
  const series = [{ date: iso(now, 30), e1rm: 100 }, { date: iso(now, 3), e1rm: 110 }];
  const r = progressionStatus(series, { now });
  assert.equal(r.status, 'progressing');
  assert.ok(r.deltaPct > PROGRESS_DEADBAND);
});

test('progressionStatus: holding within the deadband', () => {
  const now = Date.parse('2026-05-30');
  const series = [{ date: iso(now, 30), e1rm: 100 }, { date: iso(now, 3), e1rm: 101 }];
  assert.equal(progressionStatus(series, { now }).status, 'holding');
});

test('progressionStatus: stalled when no new high for >= STALL_WEEKS', () => {
  const now = Date.parse('2026-05-30');
  // all-time high set 30 days ago (> 3 weeks), nothing higher since
  const series = [{ date: iso(now, 30), e1rm: 100 }, { date: iso(now, 2), e1rm: 99 }];
  const r = progressionStatus(series, { now });
  assert.equal(r.status, 'stalled');
});

test('progressionStatus: brand-new lift with all points in recent 14-day window, rising > 2%', () => {
  const now = Date.parse('2026-05-30');
  // All points within last 14 days: first point at 10 days ago (e1rm 100), last point today (e1rm 103)
  // dp = (103 - 100) / 100 = 0.03 = 3% > 2% deadband → progressing
  const series = [{ date: iso(now, 10), e1rm: 100 }, { date: iso(now, 0), e1rm: 103 }];
  const r = progressionStatus(series, { now });
  assert.equal(r.status, 'progressing');
  assert.ok(r.deltaPct > PROGRESS_DEADBAND);
  assert.equal(r.priorBest, 100);  // priorBest is set to first when prior array is empty
});

test('progressionStatus: brand-new lift with all points in recent 14-day window, within ±2%', () => {
  const now = Date.parse('2026-05-30');
  // All points within last 14 days: first point at 8 days ago (e1rm 100), last point 2 days ago (e1rm 101)
  // dp = (101 - 100) / 100 = 0.01 = 1% < 2% deadband → holding
  const series = [{ date: iso(now, 8), e1rm: 100 }, { date: iso(now, 2), e1rm: 101 }];
  const r = progressionStatus(series, { now });
  assert.equal(r.status, 'holding');
  assert.ok(r.deltaPct <= PROGRESS_DEADBAND);
  assert.equal(r.priorBest, 100);  // priorBest is set to first when prior array is empty
});

test('progressionStatus: 3+ sessions all inside the 14-day window verdict (sparse-window path)', () => {
  const now = Date.parse('2026-05-30');
  // Three sessions within 14 days, rising 100 → 105 → 112: priorBest is empty, so
  // the verdict comes from first-vs-last in the recent window (dp = 0.12 > 2%).
  const series = [
    { date: iso(now, 12), e1rm: 100 },
    { date: iso(now, 6), e1rm: 105 },
    { date: iso(now, 0), e1rm: 112 },
  ];
  const r = progressionStatus(series, { now });
  assert.equal(r.status, 'progressing');
  assert.equal(r.recentBest, 112);
  assert.equal(r.priorBest, 100); // first recent point when prior window is empty
});

test('progressionStatus: a dormant lift (no recent activity) is stalled, not mislabeled', () => {
  const now = Date.parse('2026-05-30');
  // All points older than the 14-day recent window; last all-time high was 40 days
  // ago (> STALL_WEEKS). recentBest is null → the dormant branch returns stalled.
  const series = [
    { date: iso(now, 60), e1rm: 100 },
    { date: iso(now, 50), e1rm: 108 },
    { date: iso(now, 40), e1rm: 115 },
  ];
  const r = progressionStatus(series, { now });
  assert.ok((now - Date.parse(iso(now, 40))) / (7 * DAY) >= STALL_WEEKS);
  assert.equal(r.recentBest, null);
  assert.equal(r.status, 'stalled');
});

test('summarizeLift: surfaces current, best and top set', () => {
  const lift = { key: 'bench', name: 'Bench', series: [
    { date: '2026-05-01', e1rm: 100, load: 90, reps: 4, rpe: 8 },
    { date: '2026-05-10', e1rm: 110, load: 100, reps: 4, rpe: 9 },
    { date: '2026-05-20', e1rm: 108, load: 98, reps: 4, rpe: 8 },
  ] };
  const s = summarizeLift(lift, { now: Date.parse('2026-05-21') });
  assert.equal(s.currentE1rm, 108);
  assert.equal(s.bestE1rm, 110);
  assert.equal(s.topSet.load, 100);
});
