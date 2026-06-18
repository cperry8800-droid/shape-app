// Momentum: a 0–100 "don't break the streak" meter, folded over an ordered day
// series (oldest→newest). +STEP_UP per active day, −STEP_DOWN per missed day
// (a notch, not a reset), clamped 0..100. These constants are the SINGLE source
// of truth for the recurrence — the SQL compute_momentum() mirrors them exactly,
// so any change here must be made in supabase-migrations/2026-06-18-score-momentum.sql too.
export const STEP_UP = 7;
export const STEP_DOWN = 12;
export const BONUS_THRESHOLD = 80;
export const BONUS_POINTS = 25;

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
