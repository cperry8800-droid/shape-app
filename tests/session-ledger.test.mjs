import test from 'node:test';
import assert from 'node:assert/strict';
import { bsSdSplitUnit, bsSdRankStats, bsSdNeedle } from '../mobile-app/src/services/sessionLedger.mjs';

test('splitUnit: trailing short unit splits', () => {
  assert.deepEqual(bsSdSplitUnit('3.2 mi'), { num: '3.2', unit: 'mi' });
  assert.deepEqual(bsSdSplitUnit('148 bpm'), { num: '148', unit: 'bpm' });
  assert.deepEqual(bsSdSplitUnit('7:58/mi'), { num: '7:58', unit: '/mi' });
  assert.deepEqual(bsSdSplitUnit('8,150 lb'), { num: '8,150', unit: 'lb' });
  assert.deepEqual(bsSdSplitUnit('1.12 m'), { num: '1.12', unit: 'm' });
});

test('splitUnit: times, bare numbers, and composites stay whole', () => {
  assert.deepEqual(bsSdSplitUnit('25:31'), { num: '25:31', unit: '' });
  assert.deepEqual(bsSdSplitUnit('410'), { num: '410', unit: '' });
  assert.deepEqual(bsSdSplitUnit('2.4 · M0'), { num: '2.4 · M0', unit: '' });
  assert.deepEqual(bsSdSplitUnit(null), { num: '', unit: '' });
});

test('rankStats: run session → pace/time/avg-HR primary in source order', () => {
  const stats = [['AVG PACE', '7:58/mi'], ['TIME', '25:31'], ['AVG HR', '148 bpm'], ['MAX HR', '164 bpm'], ['CALORIES', '410'], ['STRIDE', '1.12 m'], ['GROUND', '250 ms'], ['TRAINING', '2.4 · M0']];
  const { primary, secondary } = bsSdRankStats(stats);
  assert.deepEqual(primary.map((s) => s[0]), ['AVG PACE', 'TIME', 'AVG HR']);
  assert.deepEqual(secondary.map((s) => s[0]), ['MAX HR', 'CALORIES', 'STRIDE', 'GROUND', 'TRAINING']);
});

test('rankStats: strength session (no pace/hr/time) promotes the first two', () => {
  const { primary, secondary } = bsSdRankStats([['SETS', '24'], ['VOLUME', '8,150 lb'], ['TRAINING', '2.1 · M0']]);
  assert.deepEqual(primary.map((s) => s[0]), ['SETS', 'VOLUME']);
  assert.deepEqual(secondary.map((s) => s[0]), ['TRAINING']);
});

test('rankStats: MAX HR counts as the HR primary when no AVG HR exists', () => {
  const { primary } = bsSdRankStats([['MAX HR', '164 bpm'], ['CALORIES', '410'], ['TIME', '25:31']]);
  assert.deepEqual(primary.map((s) => s[0]), ['MAX HR', 'TIME']);
});

test('rankStats: one stat → one primary; empty → both empty', () => {
  assert.equal(bsSdRankStats([['DISTANCE', '1,200 m']]).primary.length, 1);
  assert.deepEqual(bsSdRankStats([]), { primary: [], secondary: [] });
  assert.deepEqual(bsSdRankStats(null), { primary: [], secondary: [] });
});

test('needle: pace mode — faster reads right, endpoints slowest→fastest', () => {
  const n = bsSdNeedle('7:58/mi', [521, 478, 432], 'pace');
  assert.ok(Math.abs(n.frac - (521 - 478) / (521 - 432)) < 1e-9);
  assert.equal(n.lo, '8:41');
  assert.equal(n.hi, '7:12');
});

test('needle: speed mode — higher reads right', () => {
  const n = bsSdNeedle('17.2 mph', [12.0, 21.5], 'speed');
  assert.ok(Math.abs(n.frac - (17.2 - 12.0) / 9.5) < 1e-9);
  assert.equal(n.lo, '12.0');
  assert.equal(n.hi, '21.5');
});

test('needle: clamps out-of-range averages to 0..1', () => {
  assert.equal(bsSdNeedle('6:00/mi', [521, 432], 'pace').frac, 1);
  assert.equal(bsSdNeedle('9:59/mi', [521, 432], 'pace').frac, 0);
});

test('needle: honest null on short/flat/unparseable input', () => {
  assert.equal(bsSdNeedle('7:58/mi', [478], 'pace'), null);
  assert.equal(bsSdNeedle('7:58/mi', [480, 480], 'pace'), null);
  assert.equal(bsSdNeedle('brisk', [521, 432], 'pace'), null);
  assert.equal(bsSdNeedle('7:58/mi', null, 'pace'), null);
});
