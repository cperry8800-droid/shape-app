import test from 'node:test';
import assert from 'node:assert/strict';
import { bsPaceZoneFor, bsPaceSplits } from '../mobile-app/src/services/paceSplits.mjs';

test('bsPaceZoneFor: faster than avg climbs zones, slower drops', () => {
  assert.equal(bsPaceZoneFor(500, 500), 3);      // exactly avg → steady
  assert.equal(bsPaceZoneFor(455, 500), 5);      // ~9% faster → push
  assert.equal(bsPaceZoneFor(480, 500), 4);      // ~4% faster
  assert.equal(bsPaceZoneFor(520, 500), 2);      // ~4% slower
  assert.equal(bsPaceZoneFor(560, 500), 1);      // ~12% slower → easy
});

test('bsPaceZoneFor: guards non-finite / non-positive to neutral 3', () => {
  assert.equal(bsPaceZoneFor(0, 500), 3);
  assert.equal(bsPaceZoneFor(500, 0), 3);
  assert.equal(bsPaceZoneFor(NaN, 500), 3);
});

test('bsPaceSplits: provider splits preferred, uncapped, zones rise on a negative split', () => {
  const providerSplits = [
    { label: 'Mile 1', pace: '9:00/mi', hr: '150 bpm', elevation: '+10 ft' },
    { label: 'Mile 2', pace: '8:30/mi', hr: '158 bpm' },
    { label: 'Mile 3', pace: '8:00/mi', hr: '165 bpm' },
  ];
  const r = bsPaceSplits({ providerSplits, sport: 'run' });
  assert.equal(r.source, 'provider');
  assert.equal(r.splits.length, 3);
  assert.equal(r.splits[0].paceVal, 540);
  assert.equal(r.splits[2].paceVal, 480);
  assert.equal(r.splits[0].paceLabel, '9:00/mi'); // display label always set
  assert.equal(r.bestIdx, 2);           // fastest = mile 3
  assert.equal(r.worstIdx, 0);
  assert.ok(r.splits[2].zone >= r.splits[0].zone); // later miles no slower → zone rises
  assert.equal(r.splits[2].hFrac, 1);   // fastest bar full height
  assert.ok(r.splits[0].hFrac >= 0.28 && r.splits[0].hFrac < 1);
  assert.equal(r.splits[0].hr, 150);
  assert.equal(r.splits[0].elevDelta, 10);
});

test('bsPaceSplits: trace fallback buckets by distance when no provider splits', () => {
  const paceTrace = Array.from({ length: 30 }, (_, i) => 540 - i * 2); // steadily faster
  const r = bsPaceSplits({ paceTrace, distanceMi: 3, sport: 'run' });
  assert.equal(r.source, 'trace');
  assert.equal(r.splits.length, 3);           // 3 miles
  assert.ok(r.splits.every((s) => Number.isFinite(s.paceVal)));
  // ⚠ AND THE LABELS ARE MILE BY MILE, not a range. This is the path a real GPS
  // run with no provider splits takes, so it is where "Split by split" gets its
  // granularity — a bucketing that ever summarised would read as `Miles 1–3`.
  assert.deepEqual(r.splits.map((s) => s.label), ['Mile 1', 'Mile 2', 'Mile 3']);
});

test('bsPaceSplits: an 18-mile trace buckets mile by mile, never into ranges', () => {
  const paceTrace = Array.from({ length: 30 }, (_, i) => 548 - i * 1.5);
  const r = bsPaceSplits({ paceTrace, distanceMi: 18.2, sport: 'run' });
  assert.equal(r.splits.length, 18);
  assert.deepEqual(r.splits.map((s) => s.label), Array.from({ length: 18 }, (_, i) => `Mile ${i + 1}`));
  assert.ok(r.splits.every((s) => !/\d\s*[-\u2013\u2014]\s*\d/.test(s.label)));
});

test('bsPaceSplits: no provider splits and no trace → source null, empty splits', () => {
  const r = bsPaceSplits({ sport: 'run' });
  assert.equal(r.source, null);
  assert.deepEqual(r.splits, []);
});

test('bsPaceSplits: a single split still yields one full-height bar, no NaN', () => {
  const r = bsPaceSplits({ providerSplits: [{ label: 'Lap 1', pace: '7:30/mi' }], sport: 'run' });
  assert.equal(r.splits.length, 1);
  assert.equal(r.splits[0].hFrac, 1);
  assert.equal(r.splits[0].zone, 3);          // equals avg (itself)
});

test('bsPaceSplits: ride speed (mph) — faster = higher number, best = max', () => {
  const providerSplits = [
    { label: 'Mile 1', pace: '18.0 mph' },
    { label: 'Mile 2', pace: '22.0 mph' },
  ];
  const r = bsPaceSplits({ providerSplits, sport: 'ride' });
  assert.equal(r.bestIdx, 1);                 // 22 mph fastest
  assert.equal(r.splits[1].hFrac, 1);
  assert.equal(r.splits[1].paceLabel, '22.0 mph');
});

test('bsPaceSplits: ride provider splits given as time/mile parse (not dropped) — lower time = faster', () => {
  const providerSplits = [
    { label: 'Mile 1', pace: '3:00/mi' },
    { label: 'Mile 2', pace: '2:40/mi' },
  ];
  const r = bsPaceSplits({ providerSplits, sport: 'ride' });
  assert.equal(r.source, 'provider');
  assert.equal(r.splits.length, 2);           // both parsed, none dropped
  assert.equal(r.bestIdx, 1);                 // 2:40 faster than 3:00
  assert.equal(r.splits[1].paceLabel, '2:40/mi');
});

test('bsPaceSplits: trace buckets never exceed the sample count (long ride, sparse stream)', () => {
  const paceTrace = Array.from({ length: 30 }, (_, i) => 18 + (i % 5)); // 30 mph samples
  const r = bsPaceSplits({ paceTrace, distanceMi: 62, sport: 'ride' });
  assert.equal(r.source, 'trace');
  assert.ok(r.splits.length <= 30);           // capped to samples, no empty buckets
  assert.ok(r.splits.every((s) => Number.isFinite(s.paceVal) && s.paceLabel.includes('mph')));
});

test('bsPaceSplits: provider splits are uncapped (26-mile marathon keeps all rows)', () => {
  const providerSplits = Array.from({ length: 26 }, (_, i) => ({ label: `Mile ${i + 1}`, pace: '8:30/mi' }));
  const r = bsPaceSplits({ providerSplits, sport: 'run' });
  assert.equal(r.splits.length, 26);
});

test('bsPaceSplits: absent columns stay absent (no fabricated hr/cadence)', () => {
  const r = bsPaceSplits({ providerSplits: [{ label: 'Mile 1', pace: '8:00/mi' }], sport: 'run' });
  assert.equal(r.splits[0].hr, null);
  assert.equal(r.splits[0].cadence, null);
  assert.equal(r.splits[0].elevDelta, null);
});

// ── splits are cut in the reader's unit ─────────────────────────────────────
// ⚠ A split table never says "Mile 3" over a pace per km: an imperial reader's
// splits are per mile, a metric reader's per kilometre.
const trace30 = Array.from({ length: 30 }, (_, i) => 540 - i * 2);

test('bsPaceSplits: a metric reader\'s trace splits are per kilometre', () => {
  const r = bsPaceSplits({ paceTrace: trace30, unit: 'km', distance: 8.2, sport: 'run' });
  assert.equal(r.source, 'trace');
  assert.deepEqual(r.splits.map((s) => s.label), ['Km 1', 'Km 2', 'Km 3', 'Km 4', 'Km 5', 'Km 6', 'Km 7', 'Km 8']);
  // A distance given in miles is read in the reader's unit too.
  const fromMiles = bsPaceSplits({ paceTrace: trace30, unit: 'km', distanceMi: 5.1, sport: 'run' });
  assert.equal(fromMiles.splits.length, 8);
  assert.ok(fromMiles.splits.every((s) => /^Km \d+$/.test(s.label)));
});

test('bsPaceSplits: per-mile rows are re-cut per kilometre from the trace for a metric reader', () => {
  const miles = [{ label: 'Mile 1', pace: '9:00/mi' }, { label: 'Mile 2', pace: '8:30/mi' }, { label: 'Mile 3', pace: '8:00/mi' }];
  const km = bsPaceSplits({ providerSplits: miles, paceTrace: trace30, unit: 'km', distance: 4.8, sport: 'run' });
  assert.equal(km.source, 'trace');
  assert.deepEqual(km.splits.map((s) => s.label), ['Km 1', 'Km 2', 'Km 3', 'Km 4', 'Km 5']);
  // ⚠ THE LABEL SAYS WHAT A ROW IS, NOT ITS PACE. A demo breakdown arrives with
  // its paces already converted ('5:36/km') while its rows are still miles.
  const converted = miles.map((r) => ({ ...r, pace: '5:36/km' }));
  assert.equal(bsPaceSplits({ providerSplits: converted, paceTrace: trace30, unit: 'km', distance: 4.8, sport: 'run' }).source, 'trace');
  // An imperial reader keeps the provider's own miles.
  const mi = bsPaceSplits({ providerSplits: miles, paceTrace: trace30, unit: 'mi', distance: 3, sport: 'run' });
  assert.equal(mi.source, 'provider');
  assert.deepEqual(mi.splits.map((s) => s.label), ['Mile 1', 'Mile 2', 'Mile 3']);
  // Per-km rows for an imperial reader are re-cut per mile the same way.
  const kmRows = [{ label: 'Km 1', pace: '5:36/km' }, { label: 'Km 2', pace: '5:20/km' }];
  assert.deepEqual(bsPaceSplits({ providerSplits: kmRows, paceTrace: trace30, unit: 'mi', distance: 3, sport: 'run' }).splits.map((s) => s.label), ['Mile 1', 'Mile 2', 'Mile 3']);
});

test('bsPaceSplits: with no trace to re-cut, the provider\'s rows stay', () => {
  const miles = [{ label: 'Mile 1', pace: '9:00/mi' }, { label: 'Mile 2', pace: '8:30/mi' }];
  const r = bsPaceSplits({ providerSplits: miles, unit: 'km', distance: 3.2, sport: 'run' });
  assert.equal(r.source, 'provider');
  assert.deepEqual(r.splits.map((s) => s.label), ['Mile 1', 'Mile 2']);
});

test('bsPaceSplits: laps say nothing about a unit, so they are never re-cut', () => {
  const laps = [{ label: 'Lap 1', pace: '1:42/100m' }, { label: 'Lap 2', pace: '1:38/100m' }];
  assert.equal(bsPaceSplits({ providerSplits: laps, paceTrace: trace30, unit: 'km', distance: 2, sport: 'swim' }).source, 'provider');
});

test('bsPaceSplits: with no distance there is no unit to cut by, so the buckets say "Split"', () => {
  const r = bsPaceSplits({ paceTrace: trace30, unit: 'km', sport: 'swim' });
  assert.equal(r.source, 'trace');
  assert.ok(r.splits.length > 1 && r.splits.every((s, i) => s.label === `Split ${i + 1}`), r.splits.map((s) => s.label).join(','));
});
