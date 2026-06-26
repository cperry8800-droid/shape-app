// Shape Steps → Shape Score points (the "Shape Steps legend").
//
// 5,000 steps = 1 "Shape Step" = +1 point; hitting your daily step goal = +3 bonus.
// Counts steps up to 20,000/day (anti-farm cap → max 4 Shape Steps), so a day is
// worth at most +7. PURE ESM (no IO/DOM) — the single source of truth the award RPC
// mirrors, and what the steps card uses to show today's running tally. Tested in
// tests/shape-steps.test.mjs.

export const STEPS_PER_SHAPE_STEP = 5000;
export const STEP_GOAL_BONUS = 3;
export const STEP_DAILY_CAP = 20000; // counted-steps ceiling → max 4 Shape Steps/day

// shapeStepsPoints(steps, goal) → { shapeSteps, basePts, bonus, total }.
// null-ish / non-positive steps score 0 (honest — never a fabricated point).
export function shapeStepsPoints(steps, goal) {
  const s = Number(steps);
  if (!Number.isFinite(s) || s <= 0) return { shapeSteps: 0, basePts: 0, bonus: 0, total: 0 };
  const counted = Math.min(s, STEP_DAILY_CAP);
  const shapeSteps = Math.floor(counted / STEPS_PER_SHAPE_STEP);
  const g = Number(goal);
  const bonus = (Number.isFinite(g) && g > 0 && s >= g) ? STEP_GOAL_BONUS : 0;
  return { shapeSteps, basePts: shapeSteps, bonus, total: shapeSteps + bonus };
}
