// Next-load suggestion for the live session player. Autoregulate off the most
// recent session for the lift (bump when the last set was easy / hit reps, hold
// when grindy), sanity-bound against the athlete's current e1RM, with a
// %-of-e1RM fallback and finally "repeat the last/authored load". Pure (no I/O);
// the only dependency is epleyE1rm (the shared Phase-1 Epley model). Run: node --test

import { epleyE1rm } from './e1rm.mjs';

export const AUTOREG_RPE = 8;      // last set at/under this effort → bump
export const BUMP_PCT = 0.025;     // ~2.5% progressive-overload step
export const E1RM_CEILING = 1.05;  // never suggest beyond 1.05x the current e1RM
export const GYM_STEP = { kg: 2.5, lb: 5 };

const stepFor = (unit) => GYM_STEP[unit] || GYM_STEP.lb;
const roundToStep = (x, step) => Math.round(x / step) * step;
const round1 = (n) => Math.round(n * 10) / 10;

function pnum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  return parseFloat(String(v));
}

// "6-8" → 8 (top of the range); "8" → 8; "" / null → null
function targetReps(authored) {
  if (authored == null) return null;
  const nums = String(authored).match(/\d+/g);
  return nums && nums.length ? Math.max(...nums.map(Number)) : null;
}

// lift: a window.ShapeStrength lift summary { currentE1rm, unit, series:[{load,reps,rpe}] } | null
// move: the authored move { reps, l }
// → { load, reps, unit, basis, rationale, deltaFromLast } | null
export function suggestNextLoad(lift, move) {
  const unit = (lift && lift.unit) || 'lb';
  const step = stepFor(unit);
  const series = lift && Array.isArray(lift.series) ? lift.series : [];
  const last = series.length ? series[series.length - 1] : null;
  const e1 = lift && Number.isFinite(Number(lift.currentE1rm)) ? Number(lift.currentE1rm) : null;

  let reps = targetReps(move && move.reps);
  const lastLoad = last ? pnum(last.load) : NaN;
  const lastReps = last ? pnum(last.reps) : NaN;
  const lastRpe = last && last.rpe != null ? pnum(last.rpe) : null;
  if (reps == null && Number.isFinite(lastReps)) reps = lastReps;
  const authoredLoad = pnum(move && move.l);

  let load = null, basis = null, rationale = '', deltaFromLast = null;

  if (Number.isFinite(lastLoad) && lastLoad > 0) {
    // 1) autoregulate off the last session
    const hitReps = reps == null || (Number.isFinite(lastReps) && lastReps >= reps);
    const easy = (lastRpe != null && lastRpe <= AUTOREG_RPE) || (lastRpe == null && hitReps);
    if (easy) {
      load = Math.max(lastLoad + step, roundToStep(lastLoad * (1 + BUMP_PCT), step));
      basis = 'autoreg';
      rationale = lastRpe != null ? `+${round1(load - lastLoad)} from last · felt easy` : `+${round1(load - lastLoad)} from last`;
    } else {
      load = lastLoad;
      basis = 'autoreg';
      rationale = 'hold · last set was hard';
    }
    // 2) sanity-bound vs current e1RM
    if (e1 != null && reps != null) {
      const cap = epleyE1rm(load, reps);
      if (cap != null && cap > e1 * E1RM_CEILING) {
        const denom = reps <= 1 ? 1 : 1 + reps / 30;
        // FLOOR to the gym step (not round) so the suggestion never rounds back up
        // past the ceiling, e.g. e1RM 141 × 5 → raw cap 126.9 → 125 (not 127.5).
        load = Math.floor(((e1 * E1RM_CEILING) / denom) / step) * step;
        rationale = `capped near your e1RM`;
      }
    }
    deltaFromLast = round1(load - lastLoad);
  } else if (e1 != null && reps != null) {
    // 3) %-of-e1RM fallback (e1RM exists but no usable last load)
    load = roundToStep(e1 * (30 / (30 + reps)), step);
    basis = 'e1rm';
    rationale = `≈${Math.round((30 / (30 + reps)) * 100)}% of your e1RM`;
  } else if (Number.isFinite(authoredLoad) && authoredLoad > 0) {
    // 4) repeat the authored/last load
    load = authoredLoad;
    basis = 'repeat';
    rationale = 'repeat last';
  } else {
    return null; // 5) nothing numeric to suggest
  }

  load = roundToStep(load, step);
  if (!Number.isFinite(load) || load <= 0) return null;
  return { load, reps, unit, basis, rationale, deltaFromLast };
}
