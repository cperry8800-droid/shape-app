import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsVarianceBand, bsVarianceCopy } from '../public/newdesign/varianceBand.mjs';

const wk = (ws, scheduled, completed) => ({ week_start: ws, scheduled, completed });
// 6 qualifying weeks, tight cluster → steady. Rates: .70 .72 .68 .71 .69 .70
const STEADY = [wk('2026-06-01', 10, 7), wk('2026-06-08', 25, 18), wk('2026-06-15', 25, 17),
  wk('2026-06-22', 7, 5), wk('2026-06-29', 13, 9), wk('2026-07-06', 10, 7)];
// 4 qualifying weeks alternating 1.0 / 0.4 → population stdev = 30pp → variable
const SWING = [wk('2026-06-15', 10, 10), wk('2026-06-22', 10, 4), wk('2026-06-29', 10, 10), wk('2026-07-06', 10, 4)];

test('variable fires on a clear swing; result contract exact', () => {
  const r = bsVarianceBand(SWING);
  assert.equal(r.band, 'variable');
  assert.equal(r.weeks, 4);                       // integer COUNT, not an array
  assert.equal(r.mean, 70);
  assert.equal(r.stdev, 30);
  assert.equal(r.min, 40);
  assert.equal(r.max, 100);
});

test('steady band on a tight cluster', () => {
  const r = bsVarianceBand(STEADY);
  assert.equal(r.band, 'steady');
  assert.ok(r.stdev <= 8);
});

test('band boundaries compare UNROUNDED at 8.0 / 18.0', () => {
  // two weeks at exactly ±8.0pp around the mean → population stdev exactly 8.0 → steady (≤)
  const edge8 = [wk('2026-06-15', 100, 62), wk('2026-06-22', 100, 78), wk('2026-06-29', 100, 62), wk('2026-07-06', 100, 78)];
  assert.equal(bsVarianceBand(edge8).band, 'steady');
  // ±18.0pp → stdev exactly 18.0 → variable (≥)
  const edge18 = [wk('2026-06-15', 100, 52), wk('2026-06-22', 100, 88), wk('2026-06-29', 100, 52), wk('2026-07-06', 100, 88)];
  assert.equal(bsVarianceBand(edge18).band, 'variable');
});

test('dead middle is a REAL result with band null', () => {
  // ±12pp swing → stdev 12 → between the thresholds
  const mid = [wk('2026-06-15', 100, 58), wk('2026-06-22', 100, 82), wk('2026-06-29', 100, 58), wk('2026-07-06', 100, 82)];
  const r = bsVarianceBand(mid);
  assert.equal(r.band, null);
  assert.equal(r.weeks, 4);
});

test('floor: 3 qualifying weeks -> null (the whole call)', () => {
  assert.equal(bsVarianceBand(SWING.slice(0, 3)), null);
});

test('thin + zero weeks are dropped BEFORE the floor, and never enter the stats', () => {
  // 3 solid weeks + a 5-unit thin week + a zero week -> only 3 qualify -> null
  const thin = [...SWING.slice(0, 3), wk('2026-06-08', 5, 0), wk('2026-06-01', 0, 0)];
  assert.equal(bsVarianceBand(thin), null);
  // 4 solid + 1 wild thin week: thin week must NOT swing the stats
  const wild = [...SWING, wk('2026-06-08', 2, 0)];
  assert.equal(bsVarianceBand(wild).weeks, 4);
});

test('garbage: never throws; malformed weeks dropped; duplicates last-wins; non-array null', () => {
  assert.equal(bsVarianceBand(null), null);
  assert.equal(bsVarianceBand('nope'), null);
  const junk = [...SWING, wk('2026-05-25', NaN, 3), wk('2026-05-18', 10, 14), { week_start: '2026-05-11' }, wk('bad-date', 10, 5)];
  assert.equal(bsVarianceBand(junk).weeks, 4);    // only the 4 solid weeks survive
  const dup = [...SWING, wk('2026-07-06', 10, 4)];  // duplicate week_start → last wins, still 4 weeks
  assert.equal(bsVarianceBand(dup).weeks, 4);
});

test('copy binds to the figures and handles null', () => {
  assert.equal(bsVarianceCopy(null), null);
  const v = bsVarianceCopy(bsVarianceBand(SWING));
  assert.equal(v.chip, 'VARIABLE');
  assert.match(v.line, /swings 40–100%/);
  const s = bsVarianceCopy(bsVarianceBand(STEADY));
  assert.equal(s.chip, null);
  assert.match(s.line, /holds 68–72%/);
});
