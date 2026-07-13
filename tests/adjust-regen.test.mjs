// Adjust → full program regeneration — the pure planner's invariants
// (spec #1707: base-load scaling, deterministic weekday remapping, strict
// future scope, rest-day repeat patching, idempotence, horizon trim/extend).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsAdjustRegen, bsScaleLoad, BS_ADJUST_SCALE } from '../mobile-app/src/services/adjustRegen.mjs';

const TODAY = '2026-07-13'; // a Monday
const DAYS_PPL = ['Push day', 'Pull day', 'Legs day', 'Rest', 'Push day', 'Pull day', 'Rest'];
const row = (id, date, load = '100 lb', extra = {}) => ({
  id,
  scheduled_date: date,
  title: `W-${id}`,
  description: '',
  kind: 'custom',
  payload: { exercises: [{ name: 'Back squat', sets: '4', reps: '6', load, seg: '' }] },
  ...extra,
});
const adj = (over = {}) => ({ intensity: 'maintain', sessions: 4, weeks: 4, days: DAYS_PPL, ...over });
const run = (rows, a, gen = 1) => bsAdjustRegen({ rows, adjustment: a, todayISO: TODAY, gen });

test('deload bakes baseL and scales loads from it', () => {
  const r = run([{ ...row('a', '2026-07-14'), playlist_id: 'pl-1' }], adj({ intensity: 'deload' }));
  assert.equal(r.changed, true);
  const m = r.inserts[0].payload.exercises[0];
  assert.equal(m.baseL, '100 lb');
  assert.equal(m.load, '85 lb'); // 100 × 0.85, plate-rounded
  assert.equal(r.inserts[0].payload.adjustGen, 1);
  assert.equal(r.inserts[0].playlist_id, 'pl-1'); // attached soundtrack survives
  assert.deepEqual(r.deleteIds, ['a']);
});

test('deload → progress re-derives from baseL (no compounding)', () => {
  const first = run([row('a', '2026-07-14')], adj({ intensity: 'deload' }));
  const after = { ...row('a2', '2026-07-14'), payload: first.inserts[0].payload };
  const second = run([after], adj({ intensity: 'progress' }), 2);
  const m = second.inserts[0].payload.exercises[0];
  assert.equal(m.baseL, '100 lb');
  assert.equal(m.load, bsScaleLoad('100 lb', BS_ADJUST_SCALE.progress)); // from base, not 85
});

test('applying the identical adjustment twice is a no-op', () => {
  const first = run([row('a', '2026-07-14')], adj({ intensity: 'deload' }));
  // The second run sees the FULL first output (incl. the weeks extension).
  const after = first.inserts.map((ins, i) => ({ id: `n${i}`, ...ins }));
  const second = run(after, adj({ intensity: 'deload' }), 2);
  assert.equal(second.changed, false);
  assert.equal(second.inserts.length, 0);
  assert.equal(second.deleteIds.length, 0);
});

test('sessions 4 → 3 trims the LAST training weekday, deterministically', () => {
  // Tue/Wed/Fri/Sat occupied (dows 1,2,4,5); split training days = 0,1,2,4,5.
  const rows = [row('t', '2026-07-14'), row('w', '2026-07-15'), row('f', '2026-07-17'), row('s', '2026-07-18')];
  const r = run(rows, adj({ sessions: 3, weeks: 1 }));
  // newDows = first 3 of [0,1,2,4,5] = [0,1,2]; oldDows [1,2,4,5] → ranks:
  // 1→0, 2→1, 4→2, 5 trimmed.
  assert.ok(r.deleteIds.includes('s'));
  assert.equal(r.inserts.length, 2); // Tue→Mon lands on TODAY (dropped as passed); Wed→Tue, Fri→Wed survive
  const dates = r.inserts.map((i) => i.scheduled_date).sort();
  assert.deepEqual(dates, ['2026-07-14', '2026-07-15']);
  const rerun = run(rows, adj({ sessions: 3, weeks: 1 }), 2);
  assert.deepEqual(rerun.inserts.map((i) => i.scheduled_date).sort(), dates);
});

test('sessions 3 → 4 only re-days existing sessions (never invents)', () => {
  const rows = [row('t', '2026-07-14'), row('w', '2026-07-15'), row('f', '2026-07-17')];
  const r = run(rows, adj({ sessions: 4, weeks: 1 }));
  const total = r.inserts.length + rows.length - r.deleteIds.length;
  assert.ok(r.inserts.length <= 3); // moved copies of existing sessions only
  assert.equal(total, 3);
});

test('a Rest weekday drops dated rows AND patches repeat sources', () => {
  const days = [...DAYS_PPL];
  days[1] = 'Rest'; // Tuesday rests
  const rows = [
    row('t', '2026-07-14'), // Tuesday → mapped away or dropped
    { id: 'rep', scheduled_date: null, title: 'Weekly', description: '', kind: 'custom', payload: { repeatDow: [1, 4] } },
    { id: 'rep2', scheduled_date: null, title: 'Weekly2', description: '', kind: 'custom', payload: { repeatDow: [1] } },
  ];
  const r = run(rows, adj({ days, sessions: 4 }));
  const patched = r.repeatPatches.find((p) => p.id === 'rep');
  assert.ok(patched && !patched.repeatDow.includes(1), 'Tuesday leaves the repeat');
  assert.ok(r.deleteIds.includes('rep2'), 'an emptied repeat is deleted');
});

test('weeks horizon trims beyond and extends the last adjusted week forward', () => {
  const rows = [row('w1', '2026-07-14'), row('w2', '2026-07-21'), row('w3', '2026-08-25')];
  const trim = run(rows, adj({ weeks: 2 }));
  assert.ok(trim.deleteIds.includes('w3'), 'beyond-horizon row deleted');
  const extend = run([row('w1', '2026-07-14')], adj({ weeks: 3 }));
  const dates = extend.inserts.map((i) => i.scheduled_date).sort();
  assert.deepEqual(dates, ['2026-07-14', '2026-07-21', '2026-07-28']);
  assert.equal(extend.inserts[2].payload.adjustGen, 1);
});

test('strict future scope: today and the past pass through untouched', () => {
  const rows = [row('past', '2026-07-10'), row('today', '2026-07-13'), row('fut', '2026-07-15')];
  const r = run(rows, adj({ intensity: 'deload', weeks: 1 }));
  assert.ok(!r.deleteIds.includes('past') && !r.deleteIds.includes('today'));
  assert.equal(r.inserts.length, 1);
  assert.ok(r.deleteIds.includes('fut'));
});

test('program week numbers bump on extension', () => {
  const base = row('p', '2026-07-14');
  base.payload.program = { id: 'x', name: 'Block', week: 2, weeks: 8 };
  const r = run([base], adj({ weeks: 2 }));
  const ext = r.inserts.find((i) => i.scheduled_date === '2026-07-21');
  assert.equal(ext.payload.program.week, 3);
});

test('garbage input changes nothing', () => {
  assert.equal(bsAdjustRegen({ rows: null, adjustment: adj(), todayISO: TODAY, gen: 1 }).changed, false);
  assert.equal(run([], adj()).changed, false);
  assert.equal(run([row('a', '2026-07-14')], null).changed, false);
});
