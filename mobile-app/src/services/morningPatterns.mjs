// What we've noticed: plain counts of the member's own mornings (docs/REVIEW-2026-10-19-morning-
// checkin.md §3.6, rulings 15, 16 and 18). PURE ESM (no IO/DOM, no clock) so it can be driven, and so
// Your mornings (BSYourMornings.jsx) and Nora's read of the mornings (src/lib/ai/memberMornings.mjs)
// count in one place: what Nora says is what the page shows.
//
// Two patterns, over the 60 days ending today, counting only mornings from MP_SINCE:
//   energyAfterShort  Low or Drained mornings after short nights against after full nights. It holds
//                     with 8 or more mornings a side and a gap in the Low or Drained share of 15
//                     points or more that is also at least 1.65 standard errors: the house gate
//                     (dashSignals.js crossoverRead, cyclePhase.mjs bsCycleRead). Said either way.
//   tiredAfterFull    Tired or Wrecked on more than half of 8 or more full nights that were answered
//                     How did you wake up?
// The output holds counts and nothing else: never a share, a gap, a stored value or readiness, so a
// line built from it can only say "after {a} of {n}" and "Based on {n} mornings".
//
// ⚠ TWO PATTERNS, AND ONLY TWO (§3.6). Each one more is another comparison of many that can differ by
// chance, and a member shown the one that did reads it as a finding. A third goes through the design
// first, not in here.
//
// ⚠ THE CARD'S SHORT NIGHT, NEVER "UNDER 7H" (ruling 16): under 6h, or an hour or more under the usual
// night, as the card's read and Your mornings' Sleep headline count it. So the page's "# short nights"
// and a pattern's short nights are the same nights.
//
// ⚠ A NIGHT COUNTS BY ITS HOURS. One with none (skipped, or never answered) and a 0h night are left
// out, as the Sleep headline leaves them out. Hours win over a skip (morningReadiness.mjs): the row's
// sleep_skipped is never cleared, so a night with hours that came after a skip counts.
//
// ⚠ FROM 2026-10-19 (#2407), when the questions became the morning's: energy before it was "right
// now", at any hour, and would count a different question.
//
// ⚠ NEVER READINESS. It is built from the same energy, sleep and Rested, so a pattern in it would be
// true by construction. And never the signed-out example (the caller's rule: an insight drawn from
// example mornings is a made-up one).
//
// ⚠ COPIES OF THE CARD'S RULES, NOT IMPORTS. BSCheckinCard.jsx imports React and reads window, so a
// server route can't import it. mpShift, mpDay, mpUsualNight and mpShortNight are its bsCiShift,
// bsCiDay (with bsCiSkippedOn), bsCiUsualNight and bsCiShortNight, held equal by
// tests/morning-patterns.test.mjs against the real card. The word rule is morningReadiness.mjs's
// mrWordIndex, itself held equal to the card's bsCiWordIndex, never a third copy.
//
// ⚠ MEMBER-LOCAL DAYS, shifted at local noon as the card's are, never through UTC. Nothing dated after
// today is read: the days end on the caller's today.

import { mrWordIndex, MR_SHORT_FLOOR_H } from './morningReadiness.mjs';

export const MP_SINCE = '2026-10-19';
export const MP_WINDOW_DAYS = 60;
// The house gate: 8 mornings a side, a gap of 15 points in the share, and 1.65 standard errors.
export const MP_MIN_MORNINGS = 8;
export const MP_GAP = 0.15;
export const MP_Z = 1.65;

const MP_ISO = /^\d{4}-\d{2}-\d{2}$/;
// The most days the progress route sends, as the card's bsCiWindow caps them.
const MP_MAX_DAYS = 400;
// Marks an index, so a reader handed one doesn't build another.
const MP_INDEX = Symbol('mpIndex');

// Rounded off float noise, so a gap of exactly 15 points (0.95 less 0.8) is 15 points.
const r9 = (x) => Math.round(x * 1e9) / 1e9;

function mpIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A member-local day `days` away, at local noon so a daylight-saving change never skips or repeats
// one. The card's bsCiShift.
export function mpShift(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return mpIso(new Date(y, m - 1, d + days, 12));
}

// The progress series ({ date, value } points per metric) by date, built once in one pass over its
// points, so reading a day costs a lookup instead of a scan of every point (the card's `.find`).
//   at(key, iso)     the value of the FIRST point dated `iso`, as a finite number, else null. The first
//                    one wins as `.find` has it, even when its value is no number: a later point on
//                    the same date is never read.
//   dated(key, iso)  some point is dated `iso`, whatever its value (bsCiSkippedOn's test)
//   has(key)         the series carries the key as a list (bsCiDay's test for sleepFromDevice)
// Handed an index, it returns it.
export function mpIndex(series) {
  if (series && series[MP_INDEX]) return series;
  const byKey = new Map();
  if (series && typeof series === 'object') {
    for (const key of Object.keys(series)) {
      const pts = series[key];
      if (!Array.isArray(pts)) continue;
      const byDate = new Map();
      for (const p of pts) {
        if (p && !byDate.has(p.date)) byDate.set(p.date, p.value);
      }
      byKey.set(key, byDate);
    }
  }
  return {
    [MP_INDEX]: true,
    has: (key) => byKey.has(key),
    dated: (key, iso) => {
      const m = byKey.get(key);
      return !!m && m.has(iso);
    },
    at: (key, iso) => {
      const m = byKey.get(key);
      const n = m && m.has(iso) ? Number(m.get(iso)) : NaN;
      return Number.isFinite(n) ? n : null;
    },
  };
}

// One day's answers: the card's bsCiDay, and `skipped` when the night was skipped on the day's row
// (bsCiSkippedOn). `device`: a watch wrote the night's hours, by the route's sleepFromDevice when the
// series has it, else the old sign (an efficiency, resting HR or HRV reading that day). Takes an index
// (mpIndex) or a series, which it indexes for this one day.
export function mpDay(index, iso) {
  const ix = mpIndex(index);
  const at = (k) => ix.at(k, iso);
  const device = ix.has('sleepFromDevice')
    ? at('sleepFromDevice') != null
    : at('sleepEfficiency') != null || at('restingHr') != null || at('hrv') != null;
  return { energy: at('energy'), hunger: at('hunger'), sleep: at('sleep'), rested: at('sleepQuality'), device, skipped: ix.dated('sleepSkipped', iso) };
}

// The member's usual night before `iso`: the median of the 14 nights before it that have hours (a 0h
// night left out), to the half hour, within the stepper's 3-12h, and 7h 30 with none. The card's
// bsCiUsualNight.
export function mpUsualNight(index, iso) {
  if (typeof iso !== 'string') return 7.5;
  const ix = mpIndex(index);
  const nights = [];
  for (let i = 1; i <= 14; i += 1) {
    const s = ix.at('sleep', mpShift(iso, -i));
    if (s != null && s > 0) nights.push(s);
  }
  if (!nights.length) return 7.5;
  nights.sort((a, b) => a - b);
  const mid = nights.length % 2 ? nights[(nights.length - 1) / 2] : (nights[nights.length / 2 - 1] + nights[nights.length / 2]) / 2;
  return Math.max(3, Math.min(12, Math.round(mid * 2) / 2));
}

// A short night: under 6h, or an hour or more under the usual night. Null with no hours. The card's
// bsCiShortNight.
export function mpShortNight(hours, usual) {
  const h = hours == null ? NaN : Number(hours);
  if (!Number.isFinite(h)) return null;
  const u = usual == null ? NaN : Number(usual);
  return h < MR_SHORT_FLOOR_H || (Number.isFinite(u) && h <= u - 1);
}

// The `n` days ending `todayIso`, that day included, oldest first, each mpDay's with its usual night:
// the card's bsCiWindow with bsCiUsualNight on each day, as Your mornings builds its window. Up to 400
// days; none for a bad day or count.
export function mpDays(series, todayIso, n) {
  const out = [];
  const len = Math.min(MP_MAX_DAYS, Math.floor(Number(n)));
  if (typeof todayIso !== 'string' || !MP_ISO.test(todayIso) || !(len > 0)) return out;
  const ix = mpIndex(series);
  for (let i = len - 1; i >= 0; i -= 1) {
    const iso = mpShift(todayIso, -i);
    out.push({ iso, ...mpDay(ix, iso), usual: mpUsualNight(ix, iso) });
  }
  return out;
}

// The patterns that hold over `days` (mpDays'), in this order, or none:
//   { key: 'energyAfterShort', dir: 'more' | 'less', short: { low, n }, full: { low, n }, mornings }
//   { key: 'tiredAfterFull', tired, n, mornings }
// Only days dated `since` (MP_SINCE by default) or later count, and a night only with hours over 0.
export function morningPatterns(days, opts) {
  const { since = MP_SINCE } = opts || {};
  const from = typeof since === 'string' && MP_ISO.test(since) ? since : MP_SINCE;
  const nights = (Array.isArray(days) ? days : []).filter((d) => d && typeof d.iso === 'string' && MP_ISO.test(d.iso)
    && d.iso >= from && Number.isFinite(d.sleep) && d.sleep > 0);
  const out = [];

  // 1. Energy after short nights: Low or Drained (the engine's energy_low line at 4) on each side.
  const short = { low: 0, n: 0 };
  const full = { low: 0, n: 0 };
  for (const d of nights) {
    const e = mrWordIndex(d.energy);
    if (e == null) continue;
    const side = mpShortNight(d.sleep, d.usual) ? short : full;
    side.n += 1;
    if (e <= 1) side.low += 1;
  }
  if (short.n >= MP_MIN_MORNINGS && full.n >= MP_MIN_MORNINGS) {
    const pS = short.low / short.n;
    const pF = full.low / full.n;
    // The two-proportion gate, as crossoverRead has it. The gap and its standard error are rounded off
    // before they are compared, so a gap of exactly 15 points, or exactly 1.65 standard errors, holds.
    const gap = r9(pS - pF);
    const se = r9(Math.sqrt((pS * (1 - pS)) / short.n + (pF * (1 - pF)) / full.n));
    if (Math.abs(gap) >= MP_GAP && Math.abs(gap) >= r9(MP_Z * se)) {
      out.push({ key: 'energyAfterShort', dir: gap > 0 ? 'more' : 'less', short, full, mornings: short.n + full.n });
    }
  }

  // 2. Waking tired after full nights: Tired or Wrecked on more than half of them (bsCiMostly's
  // majority), so exactly half is no pattern.
  let tired = 0;
  let n = 0;
  for (const d of nights) {
    if (mpShortNight(d.sleep, d.usual)) continue;
    const r = mrWordIndex(d.rested);
    if (r == null) continue;
    n += 1;
    if (r <= 1) tired += 1;
  }
  if (n >= MP_MIN_MORNINGS && tired * 2 > n) out.push({ key: 'tiredAfterFull', tired, n, mornings: n });

  return out;
}

// The patterns over the 60 days ending `todayIso`, off the progress series (or its index): what Your
// mornings shows and what Nora's read says.
export function morningPatternsFor(series, todayIso, opts) {
  return morningPatterns(mpDays(series, todayIso, MP_WINDOW_DAYS), opts);
}
