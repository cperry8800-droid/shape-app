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
  assert.equal(r.splits[0].paceSec, 540);
  assert.equal(r.splits[2].paceSec, 480);
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
  assert.ok(r.splits.every((s) => Number.isFinite(s.paceSec)));
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
