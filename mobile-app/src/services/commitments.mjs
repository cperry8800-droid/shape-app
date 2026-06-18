// Weekly commitment + stake — pure logic shared by the UI, the node tests, and
// mirrored in the SQL settle_commitment(). A commitment targets auto-tracked weekly
// counts ({ workouts?, checkin?, habits? }); "met" = every SPECIFIED target reached
// (omitted keys ignored). The stake (points at risk, two-sided) clamps to 5..50.

export const STAKE_MIN = 5;
export const STAKE_MAX = 50;

export function clampStake(n) {
  return Math.max(STAKE_MIN, Math.min(STAKE_MAX, Math.round(Number(n) || 0)));
}

// targets: { workouts?:int, checkin?:bool, habits?:int }
// actuals: { workouts:int, checkin:bool, habits:int } over the commitment's ISO week.
export function commitmentMet(targets, actuals) {
  const t = targets || {};
  const a = actuals || {};
  if (t.workouts != null && (Number(a.workouts) || 0) < Number(t.workouts)) return false;
  if (t.checkin && !a.checkin) return false;
  if (t.habits != null && (Number(a.habits) || 0) < Number(t.habits)) return false;
  // An empty commitment (no specified target) is never "met".
  return (t.workouts != null) || !!t.checkin || (t.habits != null);
}
