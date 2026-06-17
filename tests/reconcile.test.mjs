// Source reconciliation (INT2): surface only real disagreements, resolve the
// authoritative reading from the override (else default device rank). node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReconciliation, authoritativeReading, disagree, metricLabel, METRICS, DEFAULT_SOURCE_RANK,
} from '../src/lib/integrations/reconcile.mjs';

// last night: WHOOP says 7.2h, Oura says 6.6h — a real disagreement.
const SLEEP = [
  { snapshot_date: '2026-06-17', metric: 'sleep_hours', source: 'whoop', value: 7.2, observed_at: '2026-06-17T07:00:00Z' },
  { snapshot_date: '2026-06-17', metric: 'sleep_hours', source: 'oura', value: 6.6, observed_at: '2026-06-17T07:05:00Z' },
];

test('disagree respects the per-metric tolerance (rounding noise is not a conflict)', () => {
  assert.equal(disagree('sleep_hours', 7.2, 6.6), true);   // 0.6h > 0.25h tol
  assert.equal(disagree('sleep_hours', 7.2, 7.1), false);  // 0.1h ≤ 0.25h tol
  assert.equal(disagree('resting_hr', 52, 61), true);
  assert.equal(disagree('sleep_hours', 7.2, null), false); // missing → not a conflict
});

test('HONEST DATA: no observations, single source, or agreement → nothing to reconcile', () => {
  assert.deepEqual(buildReconciliation([], {}), []);
  assert.deepEqual(buildReconciliation([SLEEP[0]], {}), []);                 // one source
  const agree = [SLEEP[0], { ...SLEEP[1], value: 7.1 }];                     // within tol
  assert.deepEqual(buildReconciliation(agree, {}), []);
});

test('two sources disagree → one conflict, side-by-side, default rank authoritative', () => {
  const items = buildReconciliation(SLEEP, {});
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.metric, 'sleep_hours');
  assert.equal(it.label, 'Sleep');
  assert.equal(it.differ, true);
  assert.equal(it.sources.length, 2);
  // WHOOP outranks Oura by default → it's authoritative until overridden
  assert.equal(it.authoritativeSource, 'whoop');
  assert.equal(it.override, null);
  const whoop = it.sources.find(s => s.source === 'whoop');
  const oura = it.sources.find(s => s.source === 'oura');
  assert.equal(whoop.value, 7.2); assert.equal(whoop.isAuthoritative, true);
  assert.equal(oura.value, 6.6); assert.equal(oura.isAuthoritative, false);
});

test('"make this my source": the override flips the authoritative reading', () => {
  const items = buildReconciliation(SLEEP, { sleep_hours: 'oura' });        // user picked Oura
  const it = items[0];
  assert.equal(it.override, 'oura');
  assert.equal(it.authoritativeSource, 'oura');
  assert.equal(it.sources.find(s => s.source === 'oura').isAuthoritative, true);
  assert.equal(it.sources.find(s => s.source === 'whoop').isAuthoritative, false);
});

test('authoritativeReading: override with a reading wins; else the highest-ranked source', () => {
  const readings = [{ source: 'oura', value: 6.6 }, { source: 'strava', value: 8 }, { source: 'whoop', value: 7.2 }];
  assert.equal(authoritativeReading('sleep_hours', readings, 'strava').source, 'strava'); // override honored
  assert.equal(authoritativeReading('sleep_hours', readings, null).source, 'whoop');       // default rank
  // an override pointing at a source with NO reading falls back to rank
  assert.equal(authoritativeReading('sleep_hours', readings, 'garmin').source, 'whoop');
  assert.equal(authoritativeReading('sleep_hours', [], 'whoop'), null);
});

test('latest reading per source wins (a re-sync supersedes the earlier value)', () => {
  const obs = [
    { snapshot_date: '2026-06-16', metric: 'resting_hr', source: 'whoop', value: 60, observed_at: '2026-06-16T07:00:00Z' },
    { snapshot_date: '2026-06-17', metric: 'resting_hr', source: 'whoop', value: 52, observed_at: '2026-06-17T07:00:00Z' },
    { snapshot_date: '2026-06-17', metric: 'resting_hr', source: 'oura', value: 58, observed_at: '2026-06-17T07:00:00Z' },
  ];
  const it = buildReconciliation(obs, {})[0];
  assert.equal(it.sources.find(s => s.source === 'whoop').value, 52); // newest, not 60
});

test('conflicts sort first; `all` mode also returns agreeing/single-source metrics', () => {
  const obs = [
    ...SLEEP, // sleep conflict
    { snapshot_date: '2026-06-17', metric: 'calories', source: 'oura', value: 2400 }, // single source, no conflict
  ];
  assert.equal(buildReconciliation(obs, {}).length, 1);                 // conflicts only
  const all = buildReconciliation(obs, {}, { conflictsOnly: false });
  assert.equal(all.length, 2);
  assert.equal(all[0].differ, true);                                    // conflict first
});

test('the metric catalog is coherent (labels + a sane default rank)', () => {
  assert.equal(metricLabel('sleep_hours'), 'Sleep');
  assert.ok(Object.keys(METRICS).length >= 6);
  assert.ok(DEFAULT_SOURCE_RANK.indexOf('whoop') < DEFAULT_SOURCE_RANK.indexOf('manual'));
});
