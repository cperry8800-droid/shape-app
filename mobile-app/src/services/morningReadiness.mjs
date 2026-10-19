// Morning readiness: one 0-100 number for the morning, for every member, computed on the device
// from the day's own row (docs/REVIEW-2026-10-19-morning-checkin.md §3.8; owner, 2026-10-19: "yes
// add the readiness score"). PURE ESM (no IO/DOM) so it can be driven, and so Home's done line
// (BSCheckinCard.jsx) and Your mornings (BSYourMornings.jsx) compute it in one place: the number on
// Home is the number on the page.
//
// It needs the morning's energy and returns null without it, never a fabricated score. Every other
// part counts only when present, and the weights are shared out over the parts present, so a member
// with no watch, or one who skipped the night, is not marked down for what they don't have:
//   energy 0.35  the five words score 10 · 35 · 60 · 85 · 100
//   sleep  0.25  100 less 30 per hour short, where short is the larger of the hours under the usual
//                night (the card's bsCiUsualNight: the median of the last 14, 7h 30 with none) and
//                the hours under 6. A skipped night has no sleep part.
//   rested 0.15  How did you wake up?, on the same five scores
//   watch  0.15  the watch's own recovery score
//   hrv    0.05  HRV against the member's own 30-day baseline (4 readings or more)
//   rhr    0.05  resting HR against its baseline the same way; both by recoveryReadiness.mjs's rules
// The three watch parts read only readings dated THAT DAY.
//
// Bands: 80+ Ready · 60-79 Steady · 40-59 Take it easy · under 40 Run down. It is a guide built from
// the member's own answers, not a medical reading, and coaches don't see it yet.
//
// ⚠ NOT recoveryReadiness.mjs. That is the watch's night: 6h typed alone reads 80 there, and
// recoveryReadinessFromSeries takes each metric's newest reading however old it is. This is the
// member's morning, and it reads nothing that is not dated the day it scores.
//
// ⚠ WORDS BY THE CARD'S ONE RULE (ruling 11): mrWordIndex is bsCiWordIndex, (2i, 2i+2] is word i, so
// a word never disagrees with the engine's thresholds at 4 and 8. It is a copy, not an import,
// because BSCheckinCard.jsx imports this module for Home's done line; tests/morning-readiness.test.mjs
// holds the two equal.
//
// ⚠ MEMBER-LOCAL DAYS. A reading is the day's when its date is that local ISO day, and the baseline
// window is the 30 days before it, shifted at local noon as the card's bsCiShift is, never through
// UTC. A point dated after the day is never read.

export const MR_WORD_SCORE = [10, 35, 60, 85, 100];
export const MR_WEIGHTS = { energy: 0.35, sleep: 0.25, rested: 0.15, watch: 0.15, hrv: 0.05, rhr: 0.05 };
// Under 6h is short whatever the member's usual night: the card's BS_CI_SHORT_NIGHT_H, the line the
// engine's sleep_low draws.
export const MR_SHORT_FLOOR_H = 6;
// The usual night with nothing to go on, as bsCiUsualNight has it.
const MR_USUAL_NIGHT_H = 7.5;
// The baseline: the member's own readings over the 30 days before the day, and only with 4 or more.
const MR_BASELINE_DAYS = 30;
const MR_BASELINE_MIN = 4;
const MR_ISO = /^\d{4}-\d{2}-\d{2}$/;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pos = (v) => { const n = fin(v); return n != null && n > 0 ? n : null; };

// A stored 1-10 value → its word (0..4): 1-2 → 0, 3-4 → 1, 5-6 → 2, 7-8 → 3, 9-10 → 4.
export function mrWordIndex(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(0, Math.min(4, Math.ceil(Math.min(10, n) / 2) - 1));
}

// 'ready' · 'steady' · 'easy' · 'low', the keys of home:mornings.bandReady / bandSteady / bandEasy /
// bandLow. Null with no score.
export function morningReadinessBand(score) {
  if (fin(score) == null) return null;
  if (score >= 80) return 'ready';
  if (score >= 60) return 'steady';
  if (score >= 40) return 'easy';
  return 'low';
}

// One morning's readiness from its answers. `energy` and `rested` are stored 1-10 values, read as
// words; `sleepHours` is the night's hours (typed or a watch's); `usualNight` is the card's
// bsCiUsualNight; `watch` is { score, hrv, hrvBaseline, restingHr, rhrBaseline }, the day's own
// readings (mrWatchForDay), any of them null. Null without the morning's energy. Otherwise
// { score, band, parts, usesWatch }: `parts` holds each counted part's 0-100 score, unrounded.
export function morningReadiness({ energy, rested, sleepHours, usualNight, skipped, watch } = {}) {
  const e = mrWordIndex(energy);
  if (e == null) return null;
  const parts = { energy: MR_WORD_SCORE[e] };

  const hours = pos(sleepHours);
  if (hours != null && !skipped) {
    const usual = pos(usualNight) ?? MR_USUAL_NIGHT_H;
    const short = Math.max(usual - hours, MR_SHORT_FLOOR_H - hours, 0);
    parts.sleep = clamp(100 - 30 * short, 0, 100);
  }

  const r = mrWordIndex(rested);
  if (r != null) parts.rested = MR_WORD_SCORE[r];

  const w = watch || {};
  const dev = fin(w.score);
  if (dev != null) parts.watch = clamp(dev, 0, 100);
  const hrv = pos(w.hrv);
  const hrvBase = pos(w.hrvBaseline);
  if (hrv != null && hrvBase != null) parts.hrv = clamp(80 + ((hrv - hrvBase) / hrvBase) * 50, 0, 100);
  const rhr = pos(w.restingHr);
  const rhrBase = pos(w.rhrBaseline);
  if (rhr != null && rhrBase != null) parts.rhr = clamp(100 - Math.max(0, rhr - rhrBase) * 10, 0, 100);

  // The weighted mean over the parts present. The weights are summed in hundredths, so a mean that
  // lands on a half (87.5) rounds up every time instead of on float noise.
  let sum = 0;
  let wsum = 0;
  for (const [k, s] of Object.entries(parts)) {
    const wt = Math.round(MR_WEIGHTS[k] * 100);
    sum += wt * s;
    wsum += wt;
  }
  const score = Math.round(sum / wsum);
  return { score, band: morningReadinessBand(score), parts, usesWatch: parts.watch != null || parts.hrv != null || parts.rhr != null };
}

// ── Off the progress series ({ date, value } points per metric, as /api/client/progress returns) ──

function mrIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// At local noon, so a daylight-saving change never skips or repeats a day.
function mrShift(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return mrIso(new Date(y, m - 1, d + days, 12));
}

function mrPoints(series, key) {
  const arr = series && series[key];
  return Array.isArray(arr) ? arr : [];
}

// The day's own reading of one metric: the point dated `iso`, the first one as bsCiDay reads it.
function mrAt(series, key, iso) {
  const p = mrPoints(series, key).find((s) => s && s.date === iso);
  const n = p ? Number(p.value) : NaN;
  return Number.isFinite(n) ? n : null;
}

// The mean of the member's positive readings dated in the 30 days before `iso` (iso-30 to iso-1),
// or null with fewer than 4. The day's own reading and anything dated after it are not in it.
function mrBaseline(series, key, iso) {
  const from = mrShift(iso, -MR_BASELINE_DAYS);
  const to = mrShift(iso, -1);
  const v = mrPoints(series, key)
    .filter((p) => p && typeof p.date === 'string' && p.date >= from && p.date <= to)
    .map((p) => Number(p.value))
    .filter((x) => Number.isFinite(x) && x > 0);
  return v.length >= MR_BASELINE_MIN ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// The watch's readings dated `iso` with their baselines: the `watch` morningReadiness takes. Home's
// done line holds the morning's answers itself and passes this for the watch, so its number is the
// one morningReadinessForDay gives Your mornings for the same day.
export function mrWatchForDay(series, iso) {
  if (typeof iso !== 'string' || !MR_ISO.test(iso)) return null;
  return {
    score: mrAt(series, 'recovery', iso),
    hrv: mrAt(series, 'hrv', iso),
    hrvBaseline: mrBaseline(series, 'hrv', iso),
    restingHr: mrAt(series, 'restingHr', iso),
    rhrBaseline: mrBaseline(series, 'restingHr', iso),
  };
}

// One day's readiness off the series: its energy, Rested (sleepQuality) and hours, and the watch's
// readings dated that day. `skipped` left out reads the day's row (series.sleepSkipped), so a night
// skipped on another device stays skipped here; `usualNight` is the card's bsCiUsualNight for the day.
export function morningReadinessForDay(series, iso, opts = {}) {
  if (typeof iso !== 'string' || !MR_ISO.test(iso)) return null;
  const { usualNight, skipped } = opts || {};
  const nightSkipped = skipped == null ? mrPoints(series, 'sleepSkipped').some((p) => p && p.date === iso) : !!skipped;
  return morningReadiness({
    energy: mrAt(series, 'energy', iso),
    rested: mrAt(series, 'sleepQuality', iso),
    sleepHours: mrAt(series, 'sleep', iso),
    usualNight,
    skipped: nightSkipped,
    watch: mrWatchForDay(series, iso),
  });
}
