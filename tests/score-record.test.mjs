import test from 'node:test';
import assert from 'node:assert/strict';
import { bsScoreRecord, recordFilterBucket, RANGE_KEYS } from '../mobile-app/src/services/scoreHistory.mjs';

// Fixed "now": 2026-07-06T12:00:00Z
const NOW = Date.UTC(2026, 6, 6, 12, 0, 0);
const day = (y, m, d) => new Date(Date.UTC(y, m, d, 9, 0, 0)).toISOString();

const ROWS = [
  { category: 'workouts', source_kind: 'workout_session', delta: 10, note: 'Workout logged', earned_at: day(2026, 6, 6) }, // today
  { category: 'nutrition', source_kind: 'meal_log', delta: 10, note: 'Meal logged', earned_at: day(2026, 6, 5) },          // yesterday
  { category: 'habits', source_kind: 'habit', delta: 3, note: 'Habit', earned_at: day(2026, 6, 2) },                        // this week
  { category: 'adherence', source_kind: 'checkin', delta: -7, note: 'Missed check-in', earned_at: day(2026, 5, 20) },       // ~2wk ago (penalty)
  { category: 'other', source_kind: 'store_redeem', delta: -450, note: 'Redeemed tee', earned_at: day(2026, 6, 4) },        // EXCLUDED
  { category: 'prs', source_kind: 'pr_wall', delta: 12, note: 'Back squat PR', earned_at: day(2026, 3, 10) },               // ~3mo ago
];

test('redemptions excluded from lifetime + every range (rank basis)', () => {
  const r = bsScoreRecord(ROWS, { now: NOW });
  // 10+10+3-7+12 = 28 ; the -450 redeem is excluded
  assert.equal(r.lifetime, 28);
  for (const k of RANGE_KEYS) {
    const flat = r.ranges[k].byCategory.map((c) => c.key);
    assert.ok(!flat.includes('other'), `${k} must not surface the redeem row`);
  }
});

test('1w window: earned/lost/net + cumulative is the true running rank', () => {
  const w = bsScoreRecord(ROWS, { now: NOW }).ranges['1w'];
  // in the last 7 days: +10 +10 +3 = 23 earned, 0 lost
  assert.equal(w.earned, 23);
  assert.equal(w.lost, 0);
  assert.equal(w.net, 23);
  // cumulative ends at the lifetime rank (28), monotonic non-decreasing here
  assert.equal(w.series[w.series.length - 1].cumulative, 28);
  for (let i = 1; i < w.series.length; i++) {
    assert.ok(w.series[i].cumulative >= w.series[i - 1].cumulative);
  }
});

test('all window: penalties bucketed to lost + a penalty reason', () => {
  const a = bsScoreRecord(ROWS, { now: NOW }).ranges['all'];
  assert.equal(a.lost, 7);
  assert.equal(a.penalties[0].note, 'Missed check-in');
  assert.equal(a.penalties[0].total, -7);
});

test('history: grouped by day, newest first, subtotals sum the day', () => {
  const h = bsScoreRecord(ROWS, { now: NOW }).history;
  assert.equal(h[0].date, '2026-07-06');       // newest day first
  assert.equal(h[0].subtotal, 10);
  // 5 non-redeem rows across 5 distinct days
  assert.equal(h.length, 5);
  assert.equal(h.reduce((s, d) => s + d.rows.length, 0), 5);
});

test('filter buckets map categories + penalties', () => {
  assert.equal(recordFilterBucket('workouts', 10, 'workout_session'), 'workouts');
  assert.equal(recordFilterBucket('adherence', 15, 'checkin'), 'checkins');
  assert.equal(recordFilterBucket('adherence', -7, 'checkin'), 'penalty');
  assert.equal(recordFilterBucket('prs', 12, 'pr_wall'), 'prs');
  assert.equal(recordFilterBucket('community', 5, 'community_post'), 'other');
});

test('empty ledger → valid empty report, no NaN', () => {
  const r = bsScoreRecord([], { now: NOW });
  assert.equal(r.lifetime, 0);
  assert.equal(r.history.length, 0);
  assert.equal(r.ranges['1w'].earned, 0);
  assert.equal(r.ranges['1w'].net, 0);
  assert.deepEqual(r.ranges['1w'].series, []);
  assert.ok(Number.isFinite(r.ranges['all'].net));
});

test('single-entry ledger', () => {
  const one = [{ category: 'workouts', source_kind: 'workout_session', delta: 10, note: 'W', earned_at: day(2026, 6, 6) }];
  const r = bsScoreRecord(one, { now: NOW });
  assert.equal(r.lifetime, 10);
  assert.equal(r.history.length, 1);
  assert.equal(r.ranges['1w'].series.length, 1);
  assert.equal(r.ranges['1w'].series[0].cumulative, 10);
});

test('3m buckets weekly + spans a month boundary without collapsing days', () => {
  const rows = [
    { category: 'workouts', source_kind: 'w', delta: 10, note: 'a', earned_at: day(2026, 4, 28) }, // May 28
    { category: 'workouts', source_kind: 'w', delta: 10, note: 'b', earned_at: day(2026, 5, 2) },  // Jun 2 (different ISO week)
  ];
  const r = bsScoreRecord(rows, { now: NOW }).ranges['3m'];
  assert.equal(r.series.length, 2);          // two weekly buckets, not merged
  assert.equal(r.series[1].cumulative, 20);
  // history keeps them on their own calendar days
  const h = bsScoreRecord(rows, { now: NOW }).history;
  assert.equal(h.length, 2);
});
