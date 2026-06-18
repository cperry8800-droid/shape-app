// Momentum: a 0–100 "don't break the streak" meter, folded over an ordered day
// series (oldest→newest). +STEP_UP per active day, −STEP_DOWN per missed day
// (a notch, not a reset), clamped 0..100. These constants are the SINGLE source
// of truth for the recurrence — the SQL compute_momentum() mirrors them exactly,
// so any change here must be made in supabase-migrations/2026-06-18-score-momentum.sql too.
export const STEP_UP = 7;
export const STEP_DOWN = 12;
export const BONUS_THRESHOLD = 80;
export const BONUS_POINTS = 25;

// Weekly-bonus escalation: the bonus GROWS +BONUS_STEP for each consecutive prior
// ISO week that also earned the bonus, capped at BONUS_MAX — a six-rung ramp:
// 25 → 40 → 55 → 70 → 85 → 100. Mirrored verbatim in award_momentum_bonus() (SQL).
export const BONUS_BASE = 25;   // alias of BONUS_POINTS — the first qualifying week
export const BONUS_STEP = 15;   // added per consecutive prior bonus-week
export const BONUS_MAX = 100;   // cap, reached at a 6-week streak

// streakWeeks = count of consecutive immediately-prior ISO weeks that already earned
// the bonus (0 = this is the first qualifying week). Returns the escalated amount.
export function momentumBonus(streakWeeks) {
  return Math.min(BONUS_MAX, BONUS_BASE + BONUS_STEP * Math.max(0, Number(streakWeeks) || 0));
}

// activeDays: ordered (oldest→newest) array of booleans, one per calendar day in
// the window. Returns the folded meter value, rounded, clamped to 0..100.
export function computeMomentum(activeDays) {
  let m = 0;
  for (const active of (activeDays || [])) {
    m = Math.max(0, Math.min(100, m + (active ? STEP_UP : -STEP_DOWN)));
  }
  return Math.round(m);
}

// True once the meter has reached the weekly-bonus line.
export function momentumThresholdMet(value) {
  return (Number(value) || 0) >= BONUS_THRESHOLD;
}
