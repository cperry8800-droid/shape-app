import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsSetsNow, bsSetsWindow, MAX_DURATION_MIN } from '../public/newdesign/noraSets.mjs';

const T0 = Date.parse('2026-07-20T18:00:00Z');
const row = (id, startIso, dur = 60, x = {}) => ({ id, title: `Set ${id}`, dj: 'Nora', starts_at: startIso, duration_min: dur, ...x });

test('end-exclusive live window: start live, end NOT live, latest start wins on overlap', () => {
  const rows = [row('a', '2026-07-20T18:00:00Z', 60), row('b', '2026-07-20T18:30:00Z', 60)];
  assert.equal(bsSetsNow(rows, T0).live.id, 'a');                                  // now == start → live
  assert.equal(bsSetsNow(rows, T0 + 45 * 60000).live.id, 'b');                     // overlap → latest start
  assert.equal(bsSetsNow([row('a', '2026-07-20T17:00:00Z', 60)], T0).live, null);  // now == end → NOT live
});

test('next excludes the live row; upcoming = 7d inclusive, (starts_at, id) order, cap 10, live excluded', () => {
  const live = row('l', '2026-07-20T17:30:00Z', 60);
  const soon = row('s', '2026-07-20T19:00:00Z');
  const week = row('w', '2026-07-27T18:00:00Z');       // exactly now + 7d → INCLUDED
  const far = row('f', '2026-07-27T18:00:01Z');        // past the boundary → excluded
  const r = bsSetsNow([far, week, soon, live], T0);
  assert.equal(r.live.id, 'l');
  assert.equal(r.next.id, 's');                        // never the live row
  assert.deepEqual(r.upcoming.map(x => x.id), ['s', 'w']);
  const dup = [row('b2', '2026-07-20T19:00:00Z'), row('a1', '2026-07-20T19:00:00Z')];
  assert.deepEqual(bsSetsNow(dup, T0).upcoming.map(x => x.id), ['a1', 'b2']);      // equal starts → id order
  const many = Array.from({ length: 14 }, (_, i) => row(`m${String(i).padStart(2, '0')}`, `2026-07-2${1 + (i % 5)}T1${i % 9}:00:00Z`));
  assert.equal(bsSetsNow(many, T0).upcoming.length, 10);
});

// The window is shared by both surfaces, so the coupling it encodes is worth
// pinning: the lookback must be EXACTLY the schema's duration ceiling, or the
// longest possible live set falls outside the query on whichever surface drifts.
test('read window: lookback is exactly the duration cap, horizon is 7d', () => {
  const w = bsSetsWindow(T0);
  assert.equal(Date.parse(w.from), T0 - MAX_DURATION_MIN * 60000);
  assert.equal(Date.parse(w.to), T0 + 7 * 24 * 3600 * 1000);
  // A set of max duration that started at the lookback edge is NOT live (end
  // exclusive) but anything later still is — so nothing live can be missed.
  const edge = row('e', w.from, MAX_DURATION_MIN);
  assert.equal(bsSetsNow([edge], T0).live, null);
  assert.equal(bsSetsNow([row('e2', new Date(Date.parse(w.from) + 60000).toISOString(), MAX_DURATION_MIN)], T0).live.id, 'e2');
  assert.ok(Number.isFinite(Date.parse(bsSetsWindow(undefined).from)));   // bad clock → still a usable window
});

// "Never throws" has to survive the inputs that actually raise. Number() RAISES
// on a Symbol rather than returning NaN, and a finite-but-extreme epoch pushes
// the window edges out of Date range where toISOString() raises — so both are
// pinned, on BOTH exports.
test('never throws on hostile clocks: Symbol, out-of-range, NaN', () => {
  for (const bad of [Symbol('x'), 8.64e15, -8.64e15, Infinity, NaN, 'nope', {}]) {
    const w = bsSetsWindow(bad);
    assert.ok(Number.isFinite(Date.parse(w.from)) && Number.isFinite(Date.parse(w.to)), `window usable for ${String(bad)}`);
    assert.deepEqual(bsSetsNow([], bad), { live: null, next: null, upcoming: [] }, `resolver survives ${String(bad)}`);
  }
});

// Rows are attacker-shaped jsonb off the wire, so the ROW coercions matter more
// than the clock one: Number() raises on a Symbol duration and Date.parse()
// raises on a Symbol start. A single hostile row must be dropped, not take the
// whole schedule down with it.
test('a hostile row is dropped, never thrown on — and never hides the good rows', () => {
  const good = row('ok', '2026-07-20T19:00:00Z');
  for (const field of ['duration_min', 'starts_at', 'id', 'title', 'dj']) {
    const hostile = { ...row('bad', '2026-07-20T19:30:00Z'), [field]: Symbol('boom') };
    const r = bsSetsNow([hostile, good], T0);
    assert.equal(r.next.id, 'ok', `Symbol ${field} must be dropped, not thrown on`);
    assert.equal(r.upcoming.length, 1, `Symbol ${field} must not survive into upcoming`);
  }
});

test('empty + garbage: never throws, honest nulls', () => {
  assert.deepEqual(bsSetsNow([], T0), { live: null, next: null, upcoming: [] });
  assert.deepEqual(bsSetsNow(null, T0), { live: null, next: null, upcoming: [] });
  const junk = [{ id: 'x' }, row('ok', '2026-07-20T19:00:00Z'), { id: 'bad', starts_at: 'nope', duration_min: 60 }];
  assert.equal(bsSetsNow(junk, T0).next.id, 'ok');
});
