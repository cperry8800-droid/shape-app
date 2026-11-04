// THE CLIMB: the member's goal drawn as a route up a ridge to a summit flag (owner, 2026-11-03, the
// Home preview: "the chart should just be goal progress"). Pure, so the tests run it.
//
// Height is how far there, not the weight: 0 at the start, the flag at the target. A cut (the weight
// going down) and a build (going up) both climb, because the route reads homeWeek.mjs's bsHomeGoalRead
// share walked, (start − now) ÷ (start − target). The milestones sit at a quarter, a half and three
// quarters of the route.

// What the climb shows, off the goal read (bsHomeGoalRead's) and the goal's words:
//   'progress' a goal with a start, a target and a weigh-in, still to reach;
//   'reached'  the latest weigh-in at or past the target;
//   'start'    a target and weigh-ins, but nothing walked yet or no target with a start (the route
//              with no line on it);
//   'target'   a target with no weigh-in yet: the target, and the way to the first weigh-in (Codex P2
//              on #2583: a member who had set a target read "No goal yet", or "Add a number" with one);
//   'words'    a goal in words only, with no weight numbers (owner, 2026-11-03: "Add a number to
//              track it");
//   'none'     no goal at all.
// `early` is true while there is no pace yet (bsHomeGoalRead gives one only from two weigh-ins at
// least 7 days apart in the last 28 days), so the climb says when it will have one, not a dash.
export function bsHomeClimbState({ read = null, words = '', weightGoal = false } = {}) {
  const r = read || {};
  const hasWeights = weightGoal && r.nowKg != null;
  if (hasWeights && r.targetKg != null) {
    if (r.reached) return { kind: 'reached', pct: 100, early: false };
    const pct = Number.isFinite(r.pct) ? Math.max(0, Math.min(100, r.pct)) : 0;
    return { kind: 'progress', pct, early: r.paceKgWk == null };
  }
  if (hasWeights) return { kind: 'start', pct: 0, early: r.paceKgWk == null };
  if (weightGoal && r.targetKg != null) return { kind: 'target', pct: 0, early: true };
  if (String(words || '').trim()) return { kind: 'words', pct: 0, early: false };
  return { kind: 'none', pct: 0, early: false };
}

// The route's geometry in a 340 × 150 box: from the foot (left, low) to the summit (right, high), with
// a few rises and dips so it reads as a climb and not a ruler. `p` runs 0 to 1 along it. Deterministic,
// so the same goal draws the same ridge every time.
export const BS_CLIMB_W = 340;
export const BS_CLIMB_H = 150;
const FOOT = { x: 14, y: 136 };
const TOP = { x: 300, y: 30 };
export function bsClimbPoint(p) {
  const q = Math.max(0, Math.min(1, Number(p) || 0));
  const x = FOOT.x + (TOP.x - FOOT.x) * q;
  // A slow start, a steady middle and a steeper last third, with two dips that vanish at both ends.
  const rise = q * q * (3 - 2 * q) * 0.55 + q * 0.45;
  const wiggle = Math.sin(q * Math.PI * 3) * 7 * q * (1 - q) * 4 + Math.sin(q * Math.PI * 7) * 2.5 * q * (1 - q) * 4;
  const y = FOOT.y - (FOOT.y - TOP.y) * rise + wiggle * 0.6;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

// Points along the route from `a` to `b` (0–1), as an SVG polyline string.
export function bsClimbPath(a = 0, b = 1, steps = 48) {
  const from = Math.max(0, Math.min(1, a)), to = Math.max(from, Math.min(1, b));
  const n = Math.max(1, Math.round(steps * (to - from)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const pt = bsClimbPoint(from + ((to - from) * i) / n);
    pts.push(`${pt.x},${pt.y}`);
  }
  return pts.join(' ');
}

// The ridge behind the route: the route lifted a little with sharper peaks, run on to the box's right
// edge and closed along the bottom, as one polygon.
export function bsClimbRidge(steps = 60) {
  const pts = [`0,${BS_CLIMB_H}`, `0,${FOOT.y + 4}`];
  for (let i = 0; i <= steps; i++) {
    const q = i / steps;
    const pt = bsClimbPoint(q);
    const peak = Math.abs(Math.sin(q * Math.PI * 5)) * 6;
    pts.push(`${pt.x},${Math.round((pt.y - 3 - peak) * 10) / 10}`);
  }
  pts.push(`${BS_CLIMB_W},${TOP.y + 14}`, `${BS_CLIMB_W},${BS_CLIMB_H}`);
  return pts.join(' ');
}

export const BS_CLIMB_MILESTONES = [25, 50, 75];

// The goal page's milestones off the goal read (BSGoals.jsx's rule; owner, 2026-11-04: "add a little more
// info here, either milestones, and percentage progress"): a quarter, a half and three quarters of the way
// from the start weight to the target, then the target. Each is met once the latest weigh-in is at or past
// it, within 0.05 kg, the goal page's own test, so Home and the goal page agree on which are done. `next`
// is the first not met and `away` the kilograms from the latest weigh-in to it. null without a start, a
// target and a weigh-in, or with a target equal to the start.
export function bsClimbMilestones(read) {
  const r = read || {};
  const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  const start = num(r.startKg), target = num(r.targetKg), now = num(r.nowKg);
  if (start == null || target == null || now == null || start === target) return null;
  const losing = target < start;
  const stops = [...BS_CLIMB_MILESTONES, 100].map((m) => {
    const kg = start + (target - start) * (m / 100);
    return { m, kg, done: losing ? now <= kg + 0.05 : now >= kg - 0.05 };
  });
  const next = stops.find((s) => !s.done) || null;
  return { stops, next, away: next ? Math.round(Math.abs(next.kg - now) * 100) / 100 : 0 };
}

// The climb's two colours: Shape's teal at the foot and gold at the summit, the goal (owner, 2026-11-04:
// "add a little more color to this graph"). A point `f` (0 to 1) of the way along is mixed between them.
export const bsClimbGold = (t) => (t && t.isLight ? '#b9861f' : '#e2ac44');
export function bsClimbMix(a, b, f) {
  const pa = String(a || '').replace('#', ''), pb = String(b || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(pa) || !/^[0-9a-f]{6}$/i.test(pb)) return a;
  const na = parseInt(pa, 16), nb = parseInt(pb, 16), k = Math.max(0, Math.min(1, Number(f) || 0));
  const ch = (s) => Math.round(((na >> s) & 255) + ((((nb >> s) & 255) - ((na >> s) & 255)) * k));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}
