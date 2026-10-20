// tests/morning-patterns.test.mjs
//
// What we've noticed (docs/REVIEW-2026-10-19-morning-checkin.md §3.6, rulings 15, 16 and 18): two
// plain counts of the member's own mornings, behind the house gate, from
// mobile-app/src/services/morningPatterns.mjs, which runs here as it ships. Your mornings draws them
// and Nora's read says them, so this pins each gate at its edge.
//
// The module carries copies of the card's day, usual-night, short-night and shift rules, because a
// server route can't import a .jsx that reads window. The Morning check-in card is loaded as it ships
// (as tests/morning-readiness.test.mjs loads it), and the copies are held equal to it over a few
// hundred seeded series.
//
// The runtime is pinned to a zone with a clock change, so a day shifted through UTC or by 24-hour
// steps would show.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import { MR_SHORT_FLOOR_H } from '../mobile-app/src/services/morningReadiness.mjs';
import * as MP from '../mobile-app/src/services/morningPatterns.mjs';

const {
  MP_SINCE, MP_WINDOW_DAYS, MP_MIN_MORNINGS, MP_GAP, MP_Z,
  mpShift, mpIndex, mpDay, mpUsualNight, mpShortNight, mpDays, morningPatterns, morningPatternsFor,
} = MP;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app/src/services/morningPatterns.mjs');
const require_ = createRequire(import.meta.url);
const React = require_('react');
const CARD = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });

// ── Builders ─────────────────────────────────────────────────────────────────

// Consecutive days from `from`, as mpDays gives them: `groups` is [[count, fields], …].
function mornings(groups, from = MP_SINCE) {
  const out = [];
  let iso = from;
  for (const [count, fields] of groups) {
    for (let i = 0; i < count; i += 1) {
      out.push({ iso, energy: null, hunger: null, sleep: null, rested: null, device: false, skipped: false, usual: 7.5, ...fields });
      iso = mpShift(iso, 1);
    }
  }
  return out;
}
// Low after a short night (5h is under 6h, whatever the usual), and so on. Energy 6 is OK, never low.
const SHORT_LOW = { energy: 4, sleep: 5 };
const SHORT_OK = { energy: 6, sleep: 5 };
const FULL_LOW = { energy: 2, sleep: 8 };
const FULL_OK = { energy: 8, sleep: 8 };
// `a` Low of `n` short nights, `b` Low of `m` full nights.
const split = (a, n, b, m) => [[a, SHORT_LOW], [n - a, SHORT_OK], [b, FULL_LOW], [m - b, FULL_OK]];
const energyOf = (out) => out.find((p) => p.key === 'energyAfterShort') || null;

// { 'YYYY-MM-DD': { energy, sleep, sleepQuality, … } } → the progress series shape, oldest first.
function series(days) {
  const out = {};
  for (const [date, metrics] of Object.entries(days)) {
    for (const [k, value] of Object.entries(metrics)) (out[k] ||= []).push({ date, value });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

// The output is counts and only counts: whole numbers, never a share, a gap or a stored value.
function assertCountsOnly(out) {
  const walk = (v, path) => {
    if (typeof v === 'number') assert.ok(Number.isInteger(v) && v >= 0, `${path} is ${v}, not a count`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(out, 'patterns');
  assert.doesNotMatch(JSON.stringify(out), /\/\s?10\b|of 10\b/);
}
const run = (days, opts) => {
  const out = morningPatterns(days, opts);
  assertCountsOnly(out);
  return out;
};

// mulberry32: the same pseudo-random series on every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The design's numbers ─────────────────────────────────────────────────────

test('the gate, the window and the start are the design’s (§3.6, ruling 15)', () => {
  assert.equal(MP_SINCE, '2026-10-19'); // #2407: the questions became the morning's
  assert.equal(MP_WINDOW_DAYS, 60);
  assert.equal(MP_MIN_MORNINGS, 8);
  assert.equal(MP_GAP, 0.15);
  assert.equal(MP_Z, 1.65);
  // One short night per page (ruling 16): the card's.
  assert.equal(MR_SHORT_FLOOR_H, CARD.BS_CI_SHORT_NIGHT_H);
});

test('no mornings, no patterns, and bad input never throws', () => {
  for (const days of [undefined, null, [], {}, 'x', 7, [null, undefined, 5, 'x', {}, { iso: MP_SINCE }]]) {
    assert.deepEqual(morningPatterns(days), [], String(days));
    assert.deepEqual(morningPatterns(days, null), []);
  }
  for (const s of [undefined, null, {}, { energy: 'x' }, { energy: [null, 5, 'x'] }]) {
    assert.deepEqual(morningPatternsFor(s, '2026-12-01'), []);
  }
  const s = series({ '2026-11-01': { energy: 4, sleep: 5 } });
  for (const iso of ['2026-12-1', '', null, undefined, 20261201, '01/12/2026']) assert.deepEqual(morningPatternsFor(s, iso), [], String(iso));
});

// ── 1. Energy after short nights ─────────────────────────────────────────────

test('energy after short nights: 8 mornings a side, never 7', () => {
  assert.deepEqual(run(mornings(split(6, 8, 0, 8))), [
    { key: 'energyAfterShort', dir: 'more', short: { low: 6, n: 8 }, full: { low: 0, n: 8 }, mornings: 16 },
  ]);
  // The same shares with 7 on either side: under the floor, whatever the gap.
  assert.deepEqual(run(mornings(split(6, 7, 0, 8))), []);
  assert.deepEqual(run(mornings(split(6, 8, 0, 7))), []);
  assert.deepEqual(run(mornings(split(7, 7, 0, 7))), []);
});

test('energy after short nights: a gap of 15 points holds, 14.9 does not', () => {
  // The full side has no Low morning, so its share adds nothing to the standard error and the gap
  // floor is what decides: 149 of 1000 is 14.9 points, 150 of 1000 is 15.
  assert.deepEqual(run(mornings(split(149, 1000, 0, 8))), []);
  assert.deepEqual(energyOf(run(mornings(split(150, 1000, 0, 8)))), { key: 'energyAfterShort', dir: 'more', short: { low: 150, n: 1000 }, full: { low: 0, n: 8 }, mornings: 1008 });
  assert.equal(energyOf(run(mornings(split(3, 20, 0, 8)))).dir, 'more'); // 3 of 20: 15 points
  assert.deepEqual(run(mornings(split(2, 20, 0, 8))), []);              // 10 points

  // 19 of 20 against 24 of 30 is 15 points exactly, which the float subtraction makes 14.99…: it is
  // rounded off before the gate, in either direction, inside the 60 days.
  assert.ok(19 / 20 - 24 / 30 < 0.15, 'the float edge this test is about is not there');
  assert.deepEqual(energyOf(run(mornings(split(19, 20, 24, 30)))), { key: 'energyAfterShort', dir: 'more', short: { low: 19, n: 20 }, full: { low: 24, n: 30 }, mornings: 50 });
  assert.deepEqual(energyOf(run(mornings(split(24, 30, 19, 20)))), { key: 'energyAfterShort', dir: 'less', short: { low: 24, n: 30 }, full: { low: 19, n: 20 }, mornings: 50 });
});

test('energy after short nights: a gap over 15 points still needs 1.65 standard errors', () => {
  // 4 of 8 against 2 of 8 is 25 points, but its standard error is 23 points.
  const pS = 4 / 8; const pF = 2 / 8;
  const se = Math.sqrt((pS * (1 - pS)) / 8 + (pF * (1 - pF)) / 8);
  assert.ok(pS - pF >= 0.15 && pS - pF < 1.65 * se);
  assert.deepEqual(run(mornings(split(4, 8, 2, 8))), []);
  // The same shares over four times the mornings halve the error, and it holds.
  assert.deepEqual(energyOf(run(mornings(split(16, 32, 8, 32)))), { key: 'energyAfterShort', dir: 'more', short: { low: 16, n: 32 }, full: { low: 8, n: 32 }, mornings: 64 });
  // And one more Low full night under that floor brings the gap under the gate again.
  assert.deepEqual(run(mornings(split(5, 8, 1, 8))).length, 1);
  assert.deepEqual(run(mornings(split(5, 8, 2, 8))), []);
});

test('energy after short nights is said in either direction, with both counts', () => {
  assert.deepEqual(run(mornings(split(0, 8, 6, 8))), [
    { key: 'energyAfterShort', dir: 'less', short: { low: 0, n: 8 }, full: { low: 6, n: 8 }, mornings: 16 },
  ]);
  // Drained and Low are both low; OK is not.
  const days = mornings([[4, { energy: 2, sleep: 5 }], [4, { energy: 3, sleep: 5 }], [8, { energy: 5, sleep: 8 }]]);
  assert.deepEqual(energyOf(run(days)).short, { low: 8, n: 8 });
  assert.deepEqual(energyOf(run(days)).full, { low: 0, n: 8 });
  // A morning with no energy word is no morning here.
  assert.deepEqual(run(mornings([...split(6, 7, 0, 8), [3, { energy: null, sleep: 5 }], [2, { energy: 0, sleep: 5 }], [1, { energy: 'x', sleep: 5 }]])), []);
});

test('a 0h night and a night with no hours are left out, and hours win over a skip', () => {
  const seven = split(6, 7, 0, 8);
  // A 0h night is under 6h, so counted it would be the eighth short night.
  assert.deepEqual(run(mornings([...seven, [1, { energy: 4, sleep: 0 }]])), []);
  assert.deepEqual(run(mornings([...seven, [1, { energy: 4, sleep: null, skipped: true }]])), []);
  assert.deepEqual(run(mornings([...seven, [1, { energy: 4, sleep: -1 }], [1, { energy: 4, sleep: '5' }], [1, { energy: 4, sleep: NaN }]])), []);
  // A skipped night that got hours after the skip (a watch's sync, or typed on Edit) counts.
  assert.deepEqual(energyOf(run(mornings([...seven, [1, { energy: 4, sleep: 5, skipped: true }]]))).short, { low: 7, n: 8 });
  // The same off the progress series: a watch's 0h night and a skipped row with no hours.
  const today = '2026-12-10';
  const s = {};
  const put = (k, date, value) => (s[k] ||= []).push({ date, value });
  for (let i = 0; i < 7; i += 1) { put('energy', mpShift(today, -i), 4); put('sleep', mpShift(today, -i), 5); }
  for (let i = 7; i < 15; i += 1) { put('energy', mpShift(today, -i), 8); put('sleep', mpShift(today, -i), 8); }
  put('energy', mpShift(today, -15), 4); put('sleep', mpShift(today, -15), 0); put('sleepFromDevice', mpShift(today, -15), 1);
  put('energy', mpShift(today, -16), 4); put('sleepSkipped', mpShift(today, -16), 1);
  assert.deepEqual(morningPatternsFor(s, today), []);
  put('energy', mpShift(today, -17), 4); put('sleep', mpShift(today, -17), 5); put('sleepSkipped', mpShift(today, -17), 1);
  assert.deepEqual(energyOf(morningPatternsFor(s, today)).short, { low: 8, n: 8 });
});

test('the short night is the card’s: under 6h, or an hour or more under the usual, never under 7h', () => {
  // 6h 30 against a usual 7h is full; 6h against it is short (an hour under); 7h against 8h is short.
  const days = mornings([
    [8, { energy: 8, sleep: 6.5, usual: 7 }],
    [4, { energy: 4, sleep: 6, usual: 7 }],
    [4, { energy: 4, sleep: 7, usual: 8 }],
  ]);
  assert.deepEqual(energyOf(run(days)), { key: 'energyAfterShort', dir: 'more', short: { low: 8, n: 8 }, full: { low: 0, n: 8 }, mornings: 16 });
  for (const d of days) assert.equal(mpShortNight(d.sleep, d.usual), CARD.bsCiShortNight(d.sleep, d.usual));
  // And the usual night comes from the series, the 14 nights before each day: after two weeks of 9h,
  // 7h 30 is short.
  const today = '2026-12-20';
  const map = {};
  for (let i = 0; i < 30; i += 1) map[mpShift(today, -i)] = { sleep: 9 };
  for (let i = 0; i < 8; i += 1) map[mpShift(today, -i)] = { sleep: 7.5, energy: 4 };
  for (let i = 15; i < 23; i += 1) map[mpShift(today, -i)] = { sleep: 9, energy: 8 };
  const out = morningPatternsFor(series(map), today);
  assert.deepEqual(energyOf(out).short, { low: 8, n: 8 }, 'the usual night was not the day’s own');
});

test('only mornings from 2026-10-19 count (#2407)', () => {
  // Starting on 10-18, the first short Low night is before the morning wording and is left out.
  assert.deepEqual(run(mornings(split(6, 8, 0, 8), '2026-10-18')), []);
  assert.equal(run(mornings(split(6, 8, 0, 8), '2026-10-19')).length, 1);
  assert.equal(run(mornings(split(6, 8, 0, 8), '2026-10-18'), { since: '2026-10-18' }).length, 1);
  // A `since` that is not a day is the default.
  for (const since of ['', null, 'x', 20261018, '2026-10-1']) assert.deepEqual(run(mornings(split(6, 8, 0, 8), '2026-10-18'), { since }), [], String(since));
  // Off the series: a member whose window reaches back before it.
  const today = '2026-10-30';
  const map = {};
  for (let i = 0; i < 12; i += 1) map[mpShift(today, -i)] = i % 2 ? { energy: 4, sleep: 5 } : { energy: 8, sleep: 8 };
  for (let i = 12; i < 40; i += 1) map[mpShift(today, -i)] = i % 2 ? { energy: 4, sleep: 5 } : { energy: 8, sleep: 8 };
  assert.deepEqual(morningPatternsFor(series(map), today), [], 'mornings before 2026-10-19 were counted');
  assert.equal(morningPatternsFor(series(map), today, { since: '2026-09-01' }).length, 1);
});

test('the window is the 60 days ending today: 59 days back is in, 60 is out, tomorrow is never read', () => {
  const today = '2027-03-01';
  const base = {};
  for (let i = 0; i < 7; i += 1) base[mpShift(today, -i)] = { energy: 4, sleep: 5 };
  for (let i = 10; i < 18; i += 1) base[mpShift(today, -i)] = { energy: 8, sleep: 8 };
  const withAt = (k) => series({ ...base, [mpShift(today, -k)]: { energy: 4, sleep: 5 } });
  assert.deepEqual(energyOf(morningPatternsFor(withAt(59), today)).short, { low: 8, n: 8 });
  assert.deepEqual(morningPatternsFor(withAt(60), today), []);
  assert.deepEqual(morningPatternsFor(withAt(-1), today), [], 'a morning dated after today was read');
  assert.deepEqual(morningPatternsFor(withAt(59), today), morningPatterns(mpDays(withAt(59), today, MP_WINDOW_DAYS)));
});

// ── 2. Waking tired after full nights ────────────────────────────────────────

test('waking tired after full nights: more than half of 8 or more, never exactly half', () => {
  const TIRED = { sleep: 8, rested: 4 };   // Tired
  const WRECKED = { sleep: 8, rested: 2 }; // Wrecked
  const FINE = { sleep: 8, rested: 6 };    // OK
  assert.deepEqual(run(mornings([[3, TIRED], [2, WRECKED], [3, FINE]])), [{ key: 'tiredAfterFull', tired: 5, n: 8, mornings: 8 }]);
  assert.deepEqual(run(mornings([[4, TIRED], [4, FINE]])), [], 'exactly half is a pattern');
  assert.deepEqual(run(mornings([[7, TIRED]])), [], '7 full nights are under the floor');
  assert.deepEqual(run(mornings([[5, TIRED], [5, FINE]])), []);
  assert.deepEqual(run(mornings([[6, TIRED], [5, FINE]])), [{ key: 'tiredAfterFull', tired: 6, n: 11, mornings: 11 }]);
  // Short nights, nights with no hours or 0h, and full nights with no Rested answer are not counted.
  assert.deepEqual(run(mornings([
    [7, TIRED], [5, { sleep: 5, rested: 2 }], [3, { sleep: null, rested: 2, skipped: true }], [2, { sleep: 0, rested: 2 }], [4, { sleep: 8 }],
  ])), []);
  // A full night is the card's: 7h against a usual 7h 30 is full, 6h 30 against it is short.
  assert.equal(run(mornings([[5, { sleep: 7, rested: 4 }], [3, FINE]])).length, 1);
  assert.deepEqual(run(mornings([[5, { sleep: 6.5, rested: 4 }], [3, FINE]])), []);
  // It needs no energy answer, and a day before 2026-10-19 is left out.
  assert.deepEqual(run(mornings([[5, TIRED], [3, FINE]], '2026-10-18')), []);
});

test('the patterns come in a fixed order, energy first', () => {
  // Both hold: Low after short nights, and tired after the full ones, which come first in the days.
  const days = mornings([[5, { ...FULL_OK, rested: 4 }], [3, { ...FULL_OK, rested: 8 }], [6, SHORT_LOW], [2, SHORT_OK]]);
  const out = run(days);
  assert.deepEqual(out.map((p) => p.key), ['energyAfterShort', 'tiredAfterFull']);
  assert.deepEqual(out, [
    { key: 'energyAfterShort', dir: 'more', short: { low: 6, n: 8 }, full: { low: 0, n: 8 }, mornings: 16 },
    { key: 'tiredAfterFull', tired: 5, n: 8, mornings: 8 },
  ]);
  assert.deepEqual(run([...days].reverse()), out);
  // Only the second.
  assert.deepEqual(run(mornings([[5, { sleep: 8, rested: 4 }], [3, { sleep: 8, rested: 8 }]])).map((p) => p.key), ['tiredAfterFull']);
});

// ── The day, the index and the days ──────────────────────────────────────────

test('the index: the first point on a date wins, whatever its value, as the card’s .find has it', () => {
  const s = { energy: [{ date: '2026-11-02', value: 'x' }, { date: '2026-11-02', value: 8 }, null, { date: '2026-11-03', value: '6' }, { date: '2026-11-03', value: 2 }] };
  const ix = mpIndex(s);
  assert.equal(ix.at('energy', '2026-11-02'), null);
  assert.equal(ix.at('energy', '2026-11-03'), 6);
  assert.equal(ix.dated('energy', '2026-11-02'), true);
  assert.equal(ix.dated('energy', '2026-11-04'), false);
  assert.equal(ix.has('energy'), true);
  assert.equal(ix.has('sleep'), false);
  assert.equal(mpIndex(ix), ix, 'an index was indexed again');
  for (const bad of [null, undefined, 7, 'x']) assert.deepEqual(mpDay(mpIndex(bad), '2026-11-02'), { energy: null, hunger: null, sleep: null, rested: null, device: false, skipped: false });
  // mpDay takes the series itself too.
  assert.deepEqual(mpDay(s, '2026-11-03'), mpDay(ix, '2026-11-03'));
  // A skipped night is any point on the day, its value whatever it is (bsCiSkippedOn).
  for (const value of [1, null, undefined, 'x']) assert.equal(mpDay({ sleepSkipped: [{ date: '2026-11-02', value }] }, '2026-11-02').skipped, true, String(value));
  // A device night: sleepFromDevice when the series has it, even empty; else the old sign.
  assert.equal(mpDay({ sleepFromDevice: [], hrv: [{ date: '2026-11-02', value: 60 }] }, '2026-11-02').device, false);
  assert.equal(mpDay({ hrv: [{ date: '2026-11-02', value: 60 }] }, '2026-11-02').device, true);
});

test('mpDays: the n days ending today, oldest first, up to 400, none for a bad day or count', () => {
  const s = series({ '2026-11-02': { energy: 8, sleep: 7 } });
  const week = mpDays(s, '2026-11-02', 7);
  assert.deepEqual(week.map((d) => d.iso), ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(week[6], { iso: '2026-11-02', energy: 8, hunger: null, sleep: 7, rested: null, device: false, skipped: false, usual: 7.5 });
  assert.equal(mpDays(s, '2026-11-02', 500).length, 400);
  assert.equal(mpDays(s, '2026-11-02', Infinity).length, 400);
  assert.equal(mpDays(s, '2026-11-02', '7').length, 7);
  assert.equal(mpDays(s, '2026-11-02', 2.9).length, 2);
  for (const n of [0, -1, 0.5, NaN, 'x', undefined, null]) assert.deepEqual(mpDays(s, '2026-11-02', n), [], String(n));
  for (const iso of ['2026-11-2', '', null, undefined, 20261102]) assert.deepEqual(mpDays(s, iso, 7), [], String(iso));
});

// ── Parity with the card ─────────────────────────────────────────────────────

// Days that cross a clock change (8 March and 1 November 2026 in New York), a month, a year and a leap
// day, and the first morning counted.
const EDGES = ['2026-03-08', '2026-03-09', '2026-11-01', '2026-11-02', '2026-10-19', '2026-10-31', '2026-12-31', '2027-01-01', '2027-01-13', '2027-03-14', '2027-11-07', '2028-02-29', '2028-03-01', '2027-02-28'];

test('mpShift is the card’s bsCiShift, across clock changes, months, years and leap days', () => {
  // The runtime's zone has a clock change, or this test proves nothing.
  assert.notEqual(new Date(2026, 9, 31, 12).getTimezoneOffset(), new Date(2026, 10, 2, 12).getTimezoneOffset());
  const rand = rng(7);
  const isos = [...EDGES];
  for (let i = 0; i < 200; i += 1) isos.push(CARD.bsCiIso(new Date(2024 + Math.floor(rand() * 6), Math.floor(rand() * 12), 1 + Math.floor(rand() * 31), 12)));
  for (const iso of isos) {
    for (const k of [-400, -366, -365, -60, -59, -30, -14, -7, -1, 0, 1, 7, 30, 365, 400]) assert.equal(mpShift(iso, k), CARD.bsCiShift(iso, k), `${iso} ${k}`);
  }
  assert.equal(mpShift('2026-11-02', -1), '2026-11-01');
  assert.equal(mpShift('2028-03-01', -1), '2028-02-29');
  assert.equal(mpShift('2027-01-01', -1), '2026-12-31');
});

test('mpShortNight is the card’s bsCiShortNight', () => {
  const H = [null, undefined, NaN, '', 'x', '5', '6', 0, -1, 3, 5, 5.99, 6, 6.5, 6.75, 7, 7.5, 8, 9, 12, 13, Infinity];
  const U = [null, undefined, NaN, '', 'x', '7.5', 0, 3, 6, 6.5, 7, 7.5, 7.75, 8, 9, 12];
  for (const h of H) for (const u of U) assert.equal(mpShortNight(h, u), CARD.bsCiShortNight(h, u), `${String(h)} ${String(u)}`);
});

// A pseudo-random member: gaps, 0h nights, skips, device and old-sign days, duplicate dates (the first
// wins), null points, a point dated after today and values that are no word at all.
const WORDISH = [2, 4, 6, 8, 10, 2, 4, 6, 8, 10, 1, 3, 5, 7, 9, 4.1, 8.1, 11, 0, -2, null, 'x', '8', NaN, undefined];
const HOURS = [0, 0, 3, 4.5, 5, 5.75, 6, 6.5, 7, 7, 7.25, 7.5, 7.5, 8, 8, 9, 10.5, 12, 13, null, 'x', '7', -1];
function randomSeries(rand, todayIso) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const keys = ['energy', 'hunger', 'sleep', 'sleepQuality', 'sleepEfficiency', 'restingHr', 'hrv', 'recovery'];
  if (rand() < 0.6) keys.push('sleepFromDevice');
  if (rand() < 0.7) keys.push('sleepSkipped');
  const s = {};
  for (const k of keys) s[k] = [];
  const valueFor = (k) => (k === 'sleep' ? pick(HOURS)
    : k === 'sleepFromDevice' || k === 'sleepSkipped' ? pick([1, 1, 1, null, 0, 'x'])
    : k === 'sleepEfficiency' || k === 'restingHr' || k === 'hrv' || k === 'recovery' ? pick([55, 88, 0, null, 'x', 61.5])
    : pick(WORDISH));
  const sparse = 0.15 + rand() * 0.6; // how many days a member leaves blank
  for (let i = -3; i <= 50; i += 1) {
    const date = CARD.bsCiShift(todayIso, -i);
    for (const k of keys) {
      if (rand() < sparse) continue;
      s[k].push({ date, value: valueFor(k) });
      if (rand() < 0.08) s[k].push({ date, value: valueFor(k) }); // the same date again
      if (rand() < 0.03) s[k].push(rand() < 0.5 ? null : { date: undefined, value: 8 });
    }
  }
  for (const k of keys) {
    if (rand() < 0.3) { // out of order
      for (let i = s[k].length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [s[k][i], s[k][j]] = [s[k][j], s[k][i]]; }
    }
  }
  if (rand() < 0.05) s.sleepFromDevice = []; // a server with the series and no device night
  return s;
}

test('mpDay, mpUsualNight and mpDays are the card’s, over a few hundred seeded members', () => {
  const rand = rng(20261019);
  let days = 0;
  let devices = 0;
  let skips = 0;
  for (let n = 0; n < 300; n += 1) {
    const today = n < EDGES.length * 4 ? EDGES[n % EDGES.length] : CARD.bsCiIso(new Date(2026, 9, 19 + Math.floor(rand() * 500), 12));
    const s = randomSeries(rand, today);
    const ix = mpIndex(s);
    for (let i = -2; i <= 20; i += 1) {
      const iso = CARD.bsCiShift(today, -i);
      const want = { ...CARD.bsCiDay(s, iso), skipped: CARD.bsCiSkippedOn(s, iso) };
      assert.deepEqual(mpDay(ix, iso), want, `member ${n}, ${iso}`);
      assert.equal(mpUsualNight(ix, iso), CARD.bsCiUsualNight(s, iso), `member ${n}, usual night on ${iso}`);
      days += 1;
      if (want.device) devices += 1;
      if (want.skipped) skips += 1;
    }
    // Your mornings' window, built the page's way.
    const len = [7, 30, 60][n % 3];
    const page = CARD.bsCiWindow(s, today, len).map((d) => ({ ...d, usual: CARD.bsCiUsualNight(s, d.iso) }));
    assert.deepEqual(mpDays(s, today, len), page, `member ${n}, ${len} days`);
    assert.deepEqual(mpDays(ix, today, len), page);
    assert.deepEqual(morningPatternsFor(s, today), morningPatterns(mpDays(s, today, MP_WINDOW_DAYS)));
  }
  // The generator really made both kinds of night, or the parity proves less than it says.
  assert.ok(devices > days / 10 && skips > days / 10, `${devices} device and ${skips} skipped days of ${days}`);
  // And the usual night of a bad day is the card's 7h 30 with nothing to go on.
  for (const iso of [null, undefined, 20261102]) assert.equal(mpUsualNight({}, iso), 7.5);
  assert.equal(mpUsualNight({}, 'x'), CARD.bsCiUsualNight({}, 'x'));
});

// ── The module ───────────────────────────────────────────────────────────────

test('the module is pure: the readiness module its one import, no IO or DOM, no clock, no UTC days, no /10', () => {
  const src = readFileSync(SRC, 'utf8');
  const code = stripComments(src);
  const imports = [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./morningReadiness.mjs']);
  assert.equal((src.match(/^\s*import\b/gm) || []).length, 1);
  assert.doesNotMatch(code, /\bwindow\b|\bdocument\b|localStorage|\bfetch\s*\(|\brequire\s*\(|\bReact\b/);
  assert.doesNotMatch(code, /Date\.now|new Date\(\s*\)/, 'the module reads the clock: today is the caller’s');
  // Over the whole source, comments included: the page's pins.
  assert.doesNotMatch(src, /toISOString|getUTC|Date\.UTC/, 'a member day was built through UTC');
  assert.doesNotMatch(src, /\/\s?10\b|of 10\b/, 'the module writes a 1-10 figure');
  // The word rule is morningReadiness's, never a new copy of it.
  assert.doesNotMatch(src, /Math\.ceil\(/, 'the module carries its own word rule');
  assert.match(code, /mrWordIndex\(/);
  assert.deepEqual(Object.keys(MP).sort(), [
    'MP_GAP', 'MP_MIN_MORNINGS', 'MP_SINCE', 'MP_WINDOW_DAYS', 'MP_Z',
    'morningPatterns', 'morningPatternsFor', 'mpDay', 'mpDays', 'mpIndex', 'mpShift', 'mpShortNight', 'mpUsualNight',
  ]);
});

test('400 days of a member compute in well under 50 ms', () => {
  const today = '2027-11-23';
  const s = { energy: [], hunger: [], sleep: [], sleepQuality: [], sleepFromDevice: [], sleepSkipped: [], sleepEfficiency: [], restingHr: [], hrv: [], recovery: [] };
  const rand = rng(400);
  for (let i = 399; i >= 0; i -= 1) {
    const date = mpShift(today, -i);
    s.energy.push({ date, value: 2 + 2 * Math.floor(rand() * 5) });
    s.hunger.push({ date, value: 6 });
    s.sleepQuality.push({ date, value: 2 + 2 * Math.floor(rand() * 5) });
    if (rand() < 0.1) s.sleepSkipped.push({ date, value: 1 });
    else s.sleep.push({ date, value: 4 + rand() * 5 });
    if (rand() < 0.5) { s.sleepFromDevice.push({ date, value: 1 }); s.sleepEfficiency.push({ date, value: 88 }); s.restingHr.push({ date, value: 52 }); s.hrv.push({ date, value: 60 }); s.recovery.push({ date, value: 70 }); }
  }
  const once = () => {
    const t0 = performance.now();
    const all = mpDays(s, today, 400);
    morningPatterns(all, { since: '2000-01-01' });
    morningPatternsFor(s, today);
    return performance.now() - t0;
  };
  once(); // warmed up, as a page that has rendered once is
  const times = [once(), once(), once(), once(), once()].sort((a, b) => a - b);
  assert.ok(times[2] < 50, `400 days took ${times[2].toFixed(1)} ms`);
  assert.equal(mpDays(s, today, 400).length, 400);
});
