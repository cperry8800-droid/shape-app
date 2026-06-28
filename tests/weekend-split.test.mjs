// Weekday-vs-weekend adherence split — pure statistics over pre-bucketed weekly
// counts. Timezone-free by contract; the SQL RPC + client bucket builder mirror
// the bucketing. The .mjs is the source of truth; src/lib/weekendSplit.ts mirrors
// it. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWeekendSplit, buildSelfWeekendBuckets,
  MIN_WEEKENDS, FLAG_GAP_PP, SE_Z, CONSISTENCY, STATUS,
} from '../mobile-app/src/services/weekendSplit.mjs';

// helper: build N weeks of identical buckets for one dimension
const wk = (i, wdN, wdD, weN, weD) => ({ weekStart: `2026-W${i}`, weekdayNum: wdN, weekdayDen: wdD, weekendNum: weN, weekendDen: weD });

test('fewer than MIN_WEEKENDS weekends → insufficient', () => {
  const nutrition = [wk(1, 5, 5, 2, 2), wk(2, 5, 5, 2, 2)]; // 2 weekends only
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.status, STATUS.INSUFFICIENT);
});

test('a clear, consistent weekend drop flags', () => {
  // 6 weeks: weekday 5/5 logged, weekend 0/2 logged → 100% vs 0%, every week
  const nutrition = Array.from({ length: 6 }, (_, i) => wk(i, 5, 5, 0, 2));
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.status, STATUS.OK);
  assert.equal(r.dimensions.nutrition.present, true);
  assert.equal(Math.round(r.dimensions.nutrition.gapPp), 100);
  assert.equal(r.dimensions.nutrition.flagged, true);
  assert.equal(r.worstDimension, 'nutrition');
});

test('a perfectly consistent member does not flag (gap ~0)', () => {
  const nutrition = Array.from({ length: 6 }, (_, i) => wk(i, 5, 5, 2, 2));
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.dimensions.nutrition.flagged, false);
  assert.equal(r.worstDimension, null);
});

test('two solid weekends + one outlier does NOT flag (consistency gate)', () => {
  // weekday always 5/5; weekend: 2/2,2/2,2/2,2/2,2/2,0/2 → small avg gap, low positive-week share
  const nutrition = [wk(0,5,5,2,2),wk(1,5,5,2,2),wk(2,5,5,2,2),wk(3,5,5,2,2),wk(4,5,5,2,2),wk(5,5,5,0,2)];
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.dimensions.nutrition.flagged, false);
});

test('weekend denominator below MIN_DIM_DAYS → dimension absent (null), not 0%', () => {
  // 3 weekends but only 6 weekend-days total (< 12) → nutrition absent
  const nutrition = [wk(0,5,5,0,2),wk(1,5,5,0,2),wk(2,5,5,0,2)];
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.dimensions.nutrition, null);
  assert.equal(r.status, STATUS.BUILDING); // has weekends, but no present dimension
});

test('single present dimension → composite equals that dimension, no fabricated gaps', () => {
  const nutrition = Array.from({ length: 6 }, (_, i) => wk(i, 5, 5, 0, 2));
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.dimensions.habits, null);
  assert.equal(Math.round(r.dimensions.composite.gapPp), Math.round(r.dimensions.nutrition.gapPp));
});

test('worstDimension ranks by lower-CI bound among flagged dims', () => {
  // nutrition: big clean gap; habits: smaller noisier gap
  const nutrition = Array.from({ length: 6 }, (_, i) => wk(i, 10, 10, 1, 5)); // 100% vs 20%
  const habits = Array.from({ length: 6 }, (_, i) => wk(i, 18, 20, 12, 16));   // ~90% vs 75%
  const r = computeWeekendSplit({ nutrition, habits });
  assert.equal(r.worstDimension, 'nutrition');
});

test('constants are exported and stable', () => {
  assert.equal(MIN_WEEKENDS, 3);
  assert.equal(FLAG_GAP_PP, 15);
  assert.equal(SE_Z, 1.65);
  assert.equal(CONSISTENCY, 0.60);
});

test('buildSelfWeekendBuckets: weekday-only protein logging yields a weekend gap', () => {
  // log protein every weekday, never on weekends, across the window
  const days = [];
  const end = '2026-06-27';
  // synthesize 56 days; mark weekdays as logged
  const series = { protein: [] };
  const dayMs = 86400000;
  const e = new Date(end + 'T12:00:00Z');
  for (let i = 55; i >= 0; i--) {
    const day = new Date(e.getTime() - i * dayMs).toISOString().slice(0, 10);
    const dow = new Date(day + 'T12:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6) series.protein.push({ date: day, value: 120 });
  }
  const buckets = buildSelfWeekendBuckets({ habits: [] }, { series }, { todayLocal: end });
  const r = computeWeekendSplit(buckets);
  assert.equal(r.dimensions.nutrition.present, true);
  assert.ok(r.dimensions.nutrition.gapPp > 90); // weekday ~100%, weekend ~0%
  assert.equal(r.dimensions.nutrition.flagged, true);
});

test('buildSelfWeekendBuckets: a 1g protein day is NOT a logged day (floor)', () => {
  const series = { protein: [{ date: '2026-06-27', value: 1 }] };
  const buckets = buildSelfWeekendBuckets({ habits: [] }, { series }, { todayLocal: '2026-06-27' });
  // that single below-floor day contributes 0 to weekendNum
  const sat = buckets.nutrition.find((w) => w.weekendNum > 0);
  assert.equal(sat, undefined);
});

test('buildSelfWeekendBuckets: a brand-new account (only a few recent days) does not fabricate a gap', () => {
  // activity on the last 5 days only → window clamps to ~5 days → <12 weekend-days → nutrition absent
  const series = { protein: [] };
  const dayMs = 86400000; const e = new Date('2026-06-27T12:00:00Z');
  for (let i = 4; i >= 0; i--) series.protein.push({ date: new Date(e.getTime() - i * dayMs).toISOString().slice(0, 10), value: 120 });
  const buckets = buildSelfWeekendBuckets({ habits: [] }, { series }, { todayLocal: '2026-06-27' });
  const r = computeWeekendSplit(buckets);
  assert.equal(r.dimensions.nutrition, null); // clamp prevents 54 empty days reading as a weekend cliff
});

test('buildSelfWeekendBuckets: no activity at all → empty buckets → insufficient', () => {
  const buckets = buildSelfWeekendBuckets({ habits: [] }, { series: {} }, { todayLocal: '2026-06-27' });
  assert.deepEqual(buckets, { nutrition: [], habits: [] });
  assert.equal(computeWeekendSplit(buckets).status, STATUS.INSUFFICIENT);
});

test('buildSelfWeekendBuckets: weekday-cadence habits excluded entirely', () => {
  const habits = { habits: [{ id: '1', cadence: 'weekdays', history: ['2026-06-22'] }] };
  const buckets = buildSelfWeekendBuckets(habits, { series: {} }, { todayLocal: '2026-06-27' });
  assert.equal(buckets.habits.length, 0); // no daily-cadence habits → dimension absent
});

test('buildSelfWeekendBuckets: a daily habit counts its `history` dates into buckets', () => {
  // one daily habit completed every weekday for the window, never on weekends
  const dayMs = 86400000; const e = new Date('2026-06-27T12:00:00Z');
  const history = [];
  for (let i = 55; i >= 0; i--) {
    const day = new Date(e.getTime() - i * dayMs).toISOString().slice(0, 10);
    const dow = new Date(day + 'T12:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6) history.push(day);
  }
  const habits = { habits: [{ id: '1', cadence: 'daily', history }] };
  const buckets = buildSelfWeekendBuckets(habits, { series: {} }, { todayLocal: '2026-06-27' });
  const r = computeWeekendSplit(buckets);
  assert.equal(r.dimensions.habits.present, true);
  assert.ok(r.dimensions.habits.gapPp > 90); // weekday ~100%, weekend ~0%
});
