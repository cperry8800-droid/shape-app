// tests/morning-readiness.test.mjs
//
// Morning readiness (docs/REVIEW-2026-10-19-morning-checkin.md §3.8; owner, 2026-10-19: "yes add the
// readiness score"): one 0-100 number for the morning, for every member, from the day's own answers
// and, with a watch, the watch's readings dated that day. Home's done line and Your mornings both
// compute it with mobile-app/src/services/morningReadiness.mjs, which runs here as it ships. The
// Morning check-in card is loaded as it ships too, so its word rule and this module's are held equal
// (ruling 11).
//
// The runtime is pinned to a zone with a clock change, so a day shifted through UTC or by 24-hour
// steps would show in the baseline window.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as MR from '../mobile-app/src/services/morningReadiness.mjs';
import { computeRecoveryReadiness } from '../mobile-app/src/services/recoveryReadiness.mjs';

const {
  MR_WORD_SCORE, MR_WEIGHTS, MR_SHORT_FLOOR_H,
  mrWordIndex, morningReadinessBand, morningReadiness, morningReadinessForDay, mrWatchForDay,
} = MR;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app/src/services/morningReadiness.mjs');
const require_ = createRequire(import.meta.url);
const React = require_('react');
const CARD = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });

const TODAY = '2026-10-18';
const YDAY = '2026-10-17';
const TOMORROW = '2026-10-19';

// { 'YYYY-MM-DD': { energy, sleepQuality, sleep, recovery, hrv, … } } → the progress series shape.
function series(days) {
  const out = {};
  for (const [date, metrics] of Object.entries(days)) {
    for (const [k, value] of Object.entries(metrics)) (out[k] ||= []).push({ date, value });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.date < b.date ? -1 : 1)); // oldest first, as the route
  return out;
}
// n consecutive days ending the day before `iso`, each with the same readings.
function before(iso, n, metrics) {
  const out = {};
  const [y, m, d] = iso.split('-').map(Number);
  for (let i = 1; i <= n; i += 1) out[CARD.bsCiIso(new Date(y, m - 1, d - i, 12))] = { ...metrics };
  return out;
}

// The weights in hundredths, written out here rather than read from the module, so a changed weight
// fails the renormalisation test below.
const W = { energy: 35, sleep: 25, rested: 15, watch: 15, hrv: 5, rhr: 5 };
const mean = (parts) => {
  let s = 0; let w = 0;
  for (const [k, v] of Object.entries(parts)) { s += W[k] * v; w += W[k]; }
  return Math.round(s / w);
};

test('the parts and their weights are the design’s (§3.8)', () => {
  assert.deepEqual(MR_WORD_SCORE, [10, 35, 60, 85, 100]);
  assert.deepEqual(MR_WEIGHTS, { energy: 0.35, sleep: 0.25, rested: 0.15, watch: 0.15, hrv: 0.05, rhr: 0.05 });
  assert.equal(Object.values(MR_WEIGHTS).reduce((a, w) => a + Math.round(w * 100), 0), 100);
  assert.equal(MR_SHORT_FLOOR_H, 6);
  assert.equal(MR_SHORT_FLOOR_H, CARD.BS_CI_SHORT_NIGHT_H); // the card's short-night line
});

test('no energy, no readiness: never a fabricated score', () => {
  assert.equal(morningReadiness(), null);
  assert.equal(morningReadiness({}), null);
  for (const energy of [null, undefined, 0, -2, NaN, '']) assert.equal(morningReadiness({ energy }), null, String(energy));
  // Every other part present is still no readiness without the morning's energy.
  assert.equal(morningReadiness({
    rested: 8, sleepHours: 8, usualNight: 7.5,
    watch: { score: 90, hrv: 60, hrvBaseline: 60, restingHr: 50, rhrBaseline: 50 },
  }), null);
  assert.equal(morningReadinessForDay(series({ [TODAY]: { sleep: 8, sleepQuality: 8, recovery: 90 } }), TODAY), null);
  assert.equal(morningReadinessForDay(series({ [YDAY]: { energy: 8 } }), TODAY), null); // yesterday's energy is not today's
});

test('energy alone scores its word, and an old 1-10 value reads as its nearest word', () => {
  const cases = [[1, 10], [2, 10], [3, 35], [4, 35], [5, 60], [6, 60], [7, 85], [8, 85], [9, 100], [10, 100]];
  for (const [energy, part] of cases) {
    const r = morningReadiness({ energy });
    assert.deepEqual(r.parts, { energy: part }, `energy ${energy}`);
    assert.equal(r.score, part, `energy ${energy}`);
    assert.equal(r.usesWatch, false);
  }
});

test('How did you wake up? scores the same five words at 0.15', () => {
  // Great energy (100) at 0.35 with each Rested word at 0.15.
  const cases = [[2, 10, 73], [4, 35, 81], [6, 60, 88], [8, 85, 96], [10, 100, 100]];
  for (const [rested, part, score] of cases) {
    const r = morningReadiness({ energy: 10, rested });
    assert.equal(r.parts.rested, part, `rested ${rested}`);
    assert.equal(r.score, score, `rested ${rested}`); // (35 · 100 + 15 · part) / 50
  }
  for (const rested of [null, 0, NaN]) assert.equal('rested' in morningReadiness({ energy: 10, rested }).parts, false);
});

test('sleep: 100 less 30 per hour short of the usual night, or of 6h', () => {
  const sleep = (sleepHours, usualNight) => morningReadiness({ energy: 10, sleepHours, usualNight }).parts.sleep;
  assert.equal(sleep(7.5, 7.5), 100);
  assert.equal(sleep(9, 7.5), 100);   // more than usual is no bonus
  assert.equal(sleep(6.5, 7.5), 70);  // an hour short
  assert.equal(sleep(7, 8), 70);      // an hour under an 8h usual
  assert.equal(sleep(6, 7.5), 55);    // 1h 30 short
  assert.equal(sleep(5.5, 7.5), 40);  // 2h short: the usual night is the larger shortfall (vs 30 min under 6)
  assert.equal(sleep(3, 7.5), 0);     // 4h 30 short is −35, clamped
  // Under 6h is short whatever the member is used to.
  assert.equal(sleep(5, 5), 70);      // a usual 5h night is still an hour under 6
  assert.equal(sleep(5.5, 5), 85);    // over the usual, 30 min under 6
  assert.equal(sleep(6, 5), 100);
  // No usual night given is the card's 7h 30.
  assert.equal(sleep(6.5), 70);
  assert.equal(sleep(6.5, null), 70);
  assert.equal(sleep(6.5, 0), 70);
  // No hours, no sleep part.
  for (const h of [null, undefined, NaN, -1, '7']) assert.equal(morningReadiness({ energy: 10, sleepHours: h }).parts.sleep, undefined, String(h));
  // A 0h night is a night, the shortest there is: it scores 0, never more than 30 minutes would.
  assert.equal(sleep(0, 7.5), 0);
  assert.equal(sleep(0, 3), 0);
  const none = morningReadiness({ energy: 7, sleepHours: 0, usualNight: 7.5 });
  assert.deepEqual(none.parts, { energy: 85, sleep: 0 });
  assert.equal(none.score, 50); // (35 · 85 + 25 · 0) / 60 = 49.6
  assert.equal(none.score, morningReadiness({ energy: 7, sleepHours: 0.5, usualNight: 7.5 }).score, 'a 0h night outscored 30 minutes');
  // (35 · 100 + 25 · 70) / 60 = 87.5: a half rounds up, not on float noise.
  assert.equal(morningReadiness({ energy: 10, sleepHours: 6.5, usualNight: 7.5 }).score, 88);
});

test('a night with no hours has no sleep part and the other parts share its weight; hours win over a skip', () => {
  // A night skipped and never given hours: Good and Rested alone.
  const skipped = morningReadiness({ energy: 8, rested: 8, usualNight: 7.5 });
  assert.deepEqual(skipped.parts, { energy: 85, rested: 85 });
  assert.equal(skipped.score, 85);
  // Hours that came after the skip (a watch's sync, or typed on Edit) count: 3h 30 short is 0, so
  // (35 · 85 + 25 · 0 + 15 · 85) / 75 = 56.7. A skip is not an input, so saying one changes nothing.
  const answers = { energy: 8, rested: 8, sleepHours: 4, usualNight: 7.5 };
  const counted = morningReadiness(answers);
  assert.deepEqual(counted.parts, { energy: 85, sleep: 0, rested: 85 });
  assert.equal(counted.score, 57);
  assert.deepEqual(morningReadiness({ ...answers, skipped: true }), counted, "a skip dropped the night's hours");
});

test('the watch’s own recovery score counts as it is, within 0-100', () => {
  const watch = (score) => morningReadiness({ energy: 10, watch: { score } });
  assert.equal(watch(50).parts.watch, 50);
  assert.equal(watch(50).score, 85);  // (35 · 100 + 15 · 50) / 50
  assert.equal(watch(0).parts.watch, 0); // a real reading of 0 counts
  assert.equal(watch(0).score, 70);
  assert.equal(watch(130).parts.watch, 100);
  assert.equal(watch(-5).parts.watch, 0);
  assert.equal(watch(50).usesWatch, true);
  for (const score of [null, undefined, NaN]) {
    const r = watch(score);
    assert.equal('watch' in r.parts, false);
    assert.equal(r.usesWatch, false);
  }
  assert.equal(morningReadiness({ energy: 10, watch: null }).score, 100);
});

test('HRV against the member’s baseline: at it 80, 40% either way moves 20 (recoveryReadiness.mjs’s rule)', () => {
  const hrv = (h, base) => morningReadiness({ energy: 10, watch: { hrv: h, hrvBaseline: base } }).parts.hrv;
  assert.equal(hrv(60, 60), 80);
  assert.equal(hrv(84, 60), 100);
  assert.equal(hrv(36, 60), 60);
  assert.equal(hrv(120, 60), 100); // clamped
  assert.equal(hrv(6, 60), 35);
  assert.equal(hrv(60, null), undefined); // no baseline, no part
  assert.equal(hrv(null, 60), undefined);
  assert.equal(hrv(0, 60), undefined);
  for (const [h, base] of [[60, 60], [84, 60], [36, 60], [71, 64], [20, 80]]) {
    assert.equal(Math.round(hrv(h, base)), computeRecoveryReadiness({ hrv: h, hrvBaseline: base }), `${h} vs ${base}`);
  }
});

test('resting HR against the baseline: at or under it 100, 10 off a beat over it (recoveryReadiness.mjs’s rule)', () => {
  const rhr = (h, base) => morningReadiness({ energy: 10, watch: { restingHr: h, rhrBaseline: base } }).parts.rhr;
  assert.equal(rhr(50, 50), 100);
  assert.equal(rhr(45, 50), 100);
  assert.equal(rhr(55, 50), 50);
  assert.equal(rhr(62, 50), 0); // clamped
  assert.equal(rhr(50, null), undefined);
  assert.equal(rhr(null, 50), undefined);
  for (const [h, base] of [[50, 50], [45, 50], [53, 50], [58, 51.5]]) {
    assert.equal(Math.round(rhr(h, base)), computeRecoveryReadiness({ restingHr: h, rhrBaseline: base }), `${h} vs ${base}`);
  }
});

test('the weights are shared out over the parts present, every combination', () => {
  // Fixed answers for each optional part, and the part each scores.
  const inputs = {
    sleep: { sleepHours: 6.5, usualNight: 7.5 },          // 70
    rested: { rested: 4 },                                 // 35
    watch: { watch: { score: 90 } },                       // 90
    hrv: { watch: { hrv: 72, hrvBaseline: 60 } },          // 80 + 20% · 50 = 90
    rhr: { watch: { restingHr: 52, rhrBaseline: 50 } },    // 100 − 2 · 10 = 80
  };
  const scores = { energy: 60, sleep: 70, rested: 35, watch: 90, hrv: 90, rhr: 80 };
  const keys = Object.keys(inputs);
  for (let mask = 0; mask < 1 << keys.length; mask += 1) {
    const on = keys.filter((_, i) => mask & (1 << i));
    const args = { energy: 6 };
    const watch = {};
    for (const k of on) {
      const { watch: w, ...rest } = inputs[k];
      Object.assign(args, rest);
      if (w) Object.assign(watch, w);
    }
    args.watch = watch;
    const r = morningReadiness(args);
    const parts = Object.fromEntries(['energy', ...on].map((k) => [k, scores[k]]));
    assert.deepEqual(r.parts, parts, on.join('+') || 'energy alone');
    assert.equal(r.score, mean(parts), on.join('+') || 'energy alone');
    assert.equal(r.usesWatch, on.some((k) => k === 'watch' || k === 'hrv' || k === 'rhr'), on.join('+'));
  }
  // All six by hand: (35 · 85 + 25 · 100 + 15 · 85 + 15 · 70 + 5 · 80 + 5 · 100) / 100 = 87.
  assert.equal(morningReadiness({
    energy: 8, sleepHours: 7.5, usualNight: 7.5, rested: 8,
    watch: { score: 70, hrv: 60, hrvBaseline: 60, restingHr: 50, rhrBaseline: 50 },
  }).score, 87);
  // Good energy with a watch score of 70: (35 · 85 + 15 · 70) / 50 = 80.5, which rounds up to Ready.
  const half = morningReadiness({ energy: 8, watch: { score: 70 } });
  assert.equal(half.score, 81);
  assert.equal(half.band, 'ready');
});

test('the bands: 80 and up Ready, 60-79 Steady, 40-59 Take it easy, under 40 Run down', () => {
  const cases = [[100, 'ready'], [80, 'ready'], [79, 'steady'], [60, 'steady'], [59, 'easy'], [40, 'easy'], [39, 'low'], [0, 'low']];
  for (const [score, band] of cases) assert.equal(morningReadinessBand(score), band, String(score));
  for (const score of [null, undefined, NaN]) assert.equal(morningReadinessBand(score), null);
  // The band travels with the score.
  assert.equal(morningReadiness({ energy: 8 }).band, 'ready');   // 85
  assert.equal(morningReadiness({ energy: 6 }).band, 'steady');  // 60
  assert.equal(morningReadiness({ energy: 4 }).band, 'low');     // 35
});

test('the worked examples', () => {
  // Good energy (8), 7h 30 against a usual 7h 30, Rested (8):
  // (35 · 85 + 25 · 100 + 15 · 85) / 75 = 6750 / 75 = 90 → Ready.
  const good = morningReadiness({ energy: 8, sleepHours: 7.5, usualNight: 7.5, rested: 8 });
  assert.deepEqual(good, { score: 90, band: 'ready', parts: { energy: 85, sleep: 100, rested: 85 }, usesWatch: false });
  // Low (4), 8h (nothing short of 7h 30 or 6h), Tired (4):
  // (35 · 35 + 25 · 100 + 15 · 35) / 75 = 4250 / 75 = 56.7 → 57, Take it easy.
  const low = morningReadiness({ energy: 4, sleepHours: 8, usualNight: 7.5, rested: 4 });
  assert.deepEqual(low, { score: 57, band: 'easy', parts: { energy: 35, sleep: 100, rested: 35 }, usesWatch: false });
  // Drained (2), 4h against 7h 30 (3h 30 short: 100 − 105, clamped to 0), Wrecked (2):
  // (35 · 10 + 25 · 0 + 15 · 10) / 75 = 500 / 75 = 6.7 → 7, Run down.
  const drained = morningReadiness({ energy: 2, sleepHours: 4, usualNight: 7.5, rested: 2 });
  assert.deepEqual(drained, { score: 7, band: 'low', parts: { energy: 10, sleep: 0, rested: 10 }, usesWatch: false });
});

// ── Off the progress series ──

test('a day off the series reads its answers and the watch’s readings dated that day', () => {
  const s = series({
    ...before(TODAY, 6, { hrv: 60, restingHr: 50 }),
    [TODAY]: { energy: 8, sleepQuality: 8, sleep: 7.5, recovery: 70, hrv: 66, restingHr: 52 },
  });
  const r = morningReadinessForDay(s, TODAY, { usualNight: 7.5 });
  // hrv 80 + (6 / 60) · 50 = 85; resting HR 100 − 2 · 10 = 80.
  assert.deepEqual(r.parts, { energy: 85, sleep: 100, rested: 85, watch: 70, hrv: 85, rhr: 80 });
  // (35 · 85 + 25 · 100 + 15 · 85 + 15 · 70 + 5 · 85 + 5 · 80) / 100 = 86.25.
  assert.equal(r.score, 86);
  assert.equal(r.band, 'ready');
  assert.equal(r.usesWatch, true);
  assert.deepEqual(mrWatchForDay(s, TODAY), { score: 70, hrv: 66, hrvBaseline: 60, restingHr: 52, rhrBaseline: 50 });
  // Home's done line holds the morning's answers itself and takes only the watch from the series:
  // the same number as Your mornings.
  assert.deepEqual(morningReadiness({ energy: 8, rested: 8, sleepHours: 7.5, usualNight: 7.5, skipped: false, watch: mrWatchForDay(s, TODAY) }), r);
});

test('the watch counts only with readings dated that day', () => {
  const s = series({
    ...before(TODAY, 6, { hrv: 60, restingHr: 50, recovery: 80 }),
    [TODAY]: { energy: 8 },
  });
  const r = morningReadinessForDay(s, TODAY);
  assert.deepEqual(r.parts, { energy: 85 }); // yesterday's watch is not this morning's
  assert.equal(r.usesWatch, false);
  assert.deepEqual(mrWatchForDay(s, TODAY), { score: null, hrv: null, hrvBaseline: 60, restingHr: null, rhrBaseline: 50 });
});

test('a baseline is the 30 days before the day, and needs 4 readings', () => {
  const hrvBase = (days) => mrWatchForDay(series({ ...days, [TODAY]: { energy: 8, hrv: 90 } }), TODAY).hrvBaseline;
  assert.equal(hrvBase(before(TODAY, 3, { hrv: 60 })), null);  // 3 readings: no baseline
  assert.equal(hrvBase(before(TODAY, 4, { hrv: 60 })), 60);    // 4: the mean, without the day's own 90
  assert.equal(morningReadinessForDay(series({ ...before(TODAY, 3, { hrv: 60 }), [TODAY]: { energy: 8, hrv: 90 } }), TODAY).parts.hrv, undefined);
  assert.equal(morningReadinessForDay(series({ ...before(TODAY, 4, { hrv: 60 }), [TODAY]: { energy: 8, hrv: 90 } }), TODAY).parts.hrv, 100);
  // The mean of the readings in the window.
  assert.equal(hrvBase({ '2026-10-14': { hrv: 50 }, '2026-10-15': { hrv: 60 }, '2026-10-16': { hrv: 70 }, [YDAY]: { hrv: 80 } }), 65);
  // iso − 30 is in the window and iso − 31 is not.
  const edge = { '2026-09-18': { hrv: 60 }, '2026-10-01': { hrv: 60 }, '2026-10-05': { hrv: 60 } };
  assert.equal(hrvBase({ ...edge, '2026-09-17': { hrv: 60 } }), null);
  assert.equal(hrvBase({ ...edge, '2026-09-17': { hrv: 1000 }, [YDAY]: { hrv: 60 } }), 60);
  // Only positive readings count toward the 4.
  assert.equal(hrvBase({ ...before(TODAY, 3, { hrv: 60 }), '2026-10-10': { hrv: 0 } }), null);
  // A reading dated after the day is not in its baseline.
  assert.equal(hrvBase({ ...before(TODAY, 3, { hrv: 60 }), [TOMORROW]: { hrv: 60 } }), null);
  // Resting HR keeps its own baseline the same way.
  const s = series({ ...before(TODAY, 4, { restingHr: 48 }), [TODAY]: { energy: 8, restingHr: 50 } });
  assert.equal(mrWatchForDay(s, TODAY).rhrBaseline, 48);
  assert.equal(morningReadinessForDay(s, TODAY).parts.rhr, 80);
});

test('a point dated after the day is never read', () => {
  assert.equal(morningReadinessForDay(series({ [TOMORROW]: { energy: 10 } }), TODAY), null);
  const s = series({
    ...before(TODAY, 6, { hrv: 60 }),
    [TODAY]: { energy: 4 },
    [TOMORROW]: { energy: 10, sleep: 9, sleepQuality: 10, recovery: 99, hrv: 100 },
  });
  const r = morningReadinessForDay(s, TODAY);
  assert.deepEqual(r.parts, { energy: 35 });
  assert.equal(r.usesWatch, false);
});

test('a night skipped on the day’s row counts the hours it got after all, and has no sleep part without any', () => {
  // The row keeps its skip for good (the route never clears it), so a watch's 4h that synced after the
  // skip is on a skipped row: it counts, as the card's read and the sleep strip count it.
  const late = series({ [TODAY]: { energy: 8, sleepQuality: 8, sleep: 4, sleepFromDevice: 1, sleepSkipped: 1 } });
  const r = morningReadinessForDay(late, TODAY, { usualNight: 7.5 });
  assert.deepEqual(r.parts, { energy: 85, sleep: 0, rested: 85 });
  assert.equal(r.score, 57);
  assert.equal(r.band, 'easy');
  assert.deepEqual(morningReadinessForDay(late, TODAY, { usualNight: 7.5, skipped: true }), r, "the caller's skip dropped the night's hours");
  assert.deepEqual(r, morningReadinessForDay(series({ [TODAY]: { energy: 8, sleepQuality: 8, sleep: 4 } }), TODAY, { usualNight: 7.5 }), 'a skipped row with hours scored apart from the same row unskipped');
  // A skip with no hours: energy alone.
  assert.deepEqual(morningReadinessForDay(series({ [TODAY]: { energy: 8, sleepSkipped: 1 } }), TODAY).parts, { energy: 85 });
  // A watch's 0h night on the row is a night: it scores 0.
  assert.equal(morningReadinessForDay(series({ [TODAY]: { energy: 8, sleep: 0, sleepFromDevice: 1 } }), TODAY, { usualNight: 7.5 }).parts.sleep, 0);
});

test('the usual night is the card’s, given by the caller', () => {
  const days = { ...before(TODAY, 14, { sleep: 8 }), [TODAY]: { energy: 10, sleep: 7 } };
  const s = series(days);
  const usual = CARD.bsCiUsualNight(s, TODAY);
  assert.equal(usual, 8);
  assert.equal(morningReadinessForDay(s, TODAY, { usualNight: usual }).parts.sleep, 70); // an hour under 8h
  assert.equal(morningReadinessForDay(s, TODAY).parts.sleep, 85);                        // 30 min under 7h 30
});

test('member-local days across a clock change, a month and a year', () => {
  // The runtime's zone has a clock change, or this test proves nothing.
  assert.notEqual(new Date(2026, 9, 31, 12).getTimezoneOffset(), new Date(2026, 10, 2, 12).getTimezoneOffset());
  // 2026-11-20, 30 days back across the 1 November clock change, is 2026-10-21.
  const iso = '2026-11-20';
  const base = (days) => mrWatchForDay(series({ ...days, [iso]: { energy: 8, hrv: 60 } }), iso).hrvBaseline;
  const three = { '2026-10-22': { hrv: 60 }, '2026-11-01': { hrv: 60 }, '2026-11-02': { hrv: 60 } };
  assert.equal(base({ ...three, '2026-10-21': { hrv: 60 } }), 60);
  assert.equal(base({ ...three, '2026-10-20': { hrv: 60 } }), null);
  // Across a year: 2027-01-05 reaches back to 2026-12-06.
  const jan = '2027-01-05';
  const yr = { '2026-12-31': { hrv: 60 }, '2027-01-01': { hrv: 60 }, '2027-01-04': { hrv: 60 } };
  const baseJan = (days) => mrWatchForDay(series({ ...days, [jan]: { energy: 8, hrv: 60 } }), jan).hrvBaseline;
  assert.equal(baseJan({ ...yr, '2026-12-06': { hrv: 60 } }), 60);
  assert.equal(baseJan({ ...yr, '2026-12-05': { hrv: 60 } }), null);
  // And the day's own point is matched as the member's local date, nothing else.
  assert.equal(morningReadinessForDay(series({ '2026-11-01': { energy: 8 } }), '2026-11-01').score, 85);
});

test('bad input reads as nothing, and never throws', () => {
  const s = series({ [TODAY]: { energy: 8 } });
  for (const iso of ['2026-10-1', '', null, undefined, 20261018, '18/10/2026']) {
    assert.equal(morningReadinessForDay(s, iso), null, String(iso));
    assert.equal(mrWatchForDay(s, iso), null, String(iso));
  }
  for (const bad of [null, undefined, {}, { energy: 'x' }, { energy: { date: TODAY, value: 8 } }]) {
    assert.equal(morningReadinessForDay(bad, TODAY), null);
  }
  // A day that is not a local ISO day is no day, even where a point carries the same bad date.
  assert.equal(morningReadinessForDay(series({ '2026-10-1': { energy: 8 } }), '2026-10-1'), null);
  assert.equal(morningReadinessForDay(s, TODAY, null).score, 85);
  assert.equal(morningReadinessForDay(series({ [TODAY]: { energy: 8, hrv: 'n/a', recovery: 'x' } }), TODAY).usesWatch, false);
});

test('mrWordIndex is the card’s bsCiWordIndex, value for value (ruling 11)', () => {
  for (let i = 1; i <= 100; i += 1) {
    const v = i / 10;
    assert.equal(mrWordIndex(v), CARD.bsCiWordIndex(v), String(v));
  }
  for (const v of [0, -1, 10.5, 11, 100, null, undefined, NaN, '7', '', Infinity, 2.0000001, 3.9999]) {
    assert.equal(mrWordIndex(v), CARD.bsCiWordIndex(v), String(v));
  }
  // The rule itself: (2i, 2i+2] is word i, so 4 is Low and 4.1 is OK, at the engine's lines.
  assert.equal(mrWordIndex(4), 1);
  assert.equal(mrWordIndex(4.1), 2);
  assert.equal(mrWordIndex(8), 3);
  assert.equal(mrWordIndex(8.1), 4);
});

test('the module is pure: no imports, no IO or DOM, no clock, no UTC days', () => {
  const src = readFileSync(SRC, 'utf8');
  const code = src.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /^\s*import\b/m);
  assert.doesNotMatch(code, /\bwindow\b|\bdocument\b|localStorage|\bfetch\s*\(|\brequire\s*\(/);
  assert.doesNotMatch(code, /toISOString|getUTC|Date\.UTC|Date\.now|new Date\(\s*\)/);
  assert.deepEqual(Object.keys(MR).sort(), [
    'MR_SHORT_FLOOR_H', 'MR_WEIGHTS', 'MR_WORD_SCORE',
    'morningReadiness', 'morningReadinessBand', 'morningReadinessForDay', 'mrWatchForDay', 'mrWordIndex',
  ]);
});
