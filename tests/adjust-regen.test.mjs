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

// ── bsScaleLoad: the load field is PROSE, so only weight values may move ────
// The field's type is flattened away upstream (loadLabel → "RPE 8", the mobile
// builder's free-text Load input, bsAssignExercise's leftovers), so the parse
// whitelists what a weight IS and leaves everything else byte-identical.
const DELOAD = BS_ADJUST_SCALE.deload;     // 0.85
const PROGRESS = BS_ADJUST_SCALE.progress; // 1.025

test('bsScaleLoad: an authored RPE annotation is NEVER rewritten as weight', () => {
  // The live defect: a deload restated the coach's prescribed effort.
  // loadType:'rpe' rows exist in production, so this is not hypothetical.
  assert.equal(bsScaleLoad('RPE 8', DELOAD), 'RPE 8');
  assert.equal(bsScaleLoad('RPE 7', DELOAD), 'RPE 7');
  assert.equal(bsScaleLoad('@8 RPE', DELOAD), '@8 RPE');
  assert.equal(bsScaleLoad('RPE 8', PROGRESS), 'RPE 8');
});

test('bsScaleLoad: a set count is never scaled, but the weight beside it is', () => {
  // The scheme regex in bsAssignExercise misses "N sets x M reps", so the whole
  // tail used to land in `load` and the FIRST number (the set count) moved.
  assert.equal(bsScaleLoad('10 sets x 3 reps @ 225 lb', DELOAD), '10 sets x 3 reps @ 190 lb');
  assert.equal(bsScaleLoad('3 sets x 8 reps @ 135 lb', PROGRESS), '3 sets x 8 reps @ 140 lb');
});

test('bsScaleLoad: every rung of a ramp scales, not just the first', () => {
  // Scaling only the first rung produced a ramp that descended then overshot.
  assert.equal(bsScaleLoad('135/155/175 lb across', DELOAD), '115/130/150 lb across');
  assert.equal(bsScaleLoad('135/155/175 lb across', PROGRESS), '140/160/180 lb across');
});

test('bsScaleLoad: plain weights, bare numbers and bodyweight-plus still scale', () => {
  assert.equal(bsScaleLoad('110 kg', DELOAD), '95 kg');
  assert.equal(bsScaleLoad('225 lb', DELOAD), '190 lb');
  assert.equal(bsScaleLoad('@ 135 lb', PROGRESS), '@ 140 lb');
  assert.equal(bsScaleLoad('BW+25 lb', DELOAD), 'BW+20 lb');
  assert.equal(bsScaleLoad('110', DELOAD), '95');          // mobile builder's free-text field
  assert.equal(bsScaleLoad('27.5 lb', DELOAD), '25 lb');   // decimals survive the parse
});

test('bsScaleLoad: unidentifiable loads are returned UNCHANGED, never guessed at', () => {
  for (const s of ['work up to a heavy triple', '2 plates', '75% 1RM', '@ 80% 1RM', 'bodyweight', '']) {
    assert.equal(bsScaleLoad(s, DELOAD), s, `deload must not touch ${JSON.stringify(s)}`);
    assert.equal(bsScaleLoad(s, PROGRESS), s, `progress must not touch ${JSON.stringify(s)}`);
  }
});

test('bsScaleLoad: maintain (scale 1) is byte-identical for every shape', () => {
  for (const s of ['110 kg', 'RPE 8', '135/155/175 lb', '10 sets x 3 reps @ 225 lb', '110', '75% 1RM']) {
    assert.equal(bsScaleLoad(s, BS_ADJUST_SCALE.maintain), s);
  }
});

test('bsScaleLoad: surrounding text is structurally preserved — only digits may move', () => {
  const CORPUS = ['110 kg', '92.5 kg', 'RPE 8', '75% 1RM', '110', '@ 135 lb', '225 lb', '27.5 lb',
    'BW+25 lb', '135/155/175 lb across', '10 sets x 3 reps @ 225 lb', 'work up to a heavy triple',
    '2 plates', '@ 80% 1RM', 'RPE 7', ''];
  const skeleton = (x) => x.replace(/\d+(?:\.\d+)?/g, '#');
  for (const s of CORPUS) {
    for (const scale of [DELOAD, PROGRESS]) {
      const out = bsScaleLoad(s, scale);
      assert.equal(skeleton(out), skeleton(s), `non-numeric shape changed: ${JSON.stringify(s)} → ${JSON.stringify(out)}`);
      // and a number may only have moved if it was eligible in the first place
      if (out !== s) {
        assert.ok(/^\s*\d+(?:\.\d+)?\s*$/.test(s) || /\d\s*(?:kgs?|lbs?|#)\b/i.test(s),
          `ineligible string was rewritten: ${JSON.stringify(s)} → ${JSON.stringify(out)}`);
      }
    }
  }
});

test('bsScaleLoad: null/undefined and unit-less junk never throw', () => {
  assert.equal(bsScaleLoad(null, DELOAD), '');
  assert.equal(bsScaleLoad(undefined, DELOAD), '');
  assert.equal(bsScaleLoad('—', DELOAD), '—');
});
