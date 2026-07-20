import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsSetsNow } from '../public/newdesign/noraSets.mjs';

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

test('empty + garbage: never throws, honest nulls', () => {
  assert.deepEqual(bsSetsNow([], T0), { live: null, next: null, upcoming: [] });
  assert.deepEqual(bsSetsNow(null, T0), { live: null, next: null, upcoming: [] });
  const junk = [{ id: 'x' }, row('ok', '2026-07-20T19:00:00Z'), { id: 'bad', starts_at: 'nope', duration_min: 60 }];
  assert.equal(bsSetsNow(junk, T0).next.id, 'ok');
});
