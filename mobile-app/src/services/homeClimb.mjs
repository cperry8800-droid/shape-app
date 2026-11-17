// THE CLIMB: the member's goal drawn as a route climbing to a flag (owner, 2026-11-03, the Home preview:
// "the chart should just be goal progress"). Pure, so the tests run it.
//
// Height is how far there, not the weight: 0 at the start, the flag at the target. A cut (the weight
// going down) and a build (going up) both climb, because the route reads homeWeek.mjs's bsHomeGoalRead
// share walked, (start − now) ÷ (start − target). The milestones sit at a quarter, a half and three
// quarters of the way (the strip under the chart says them; the route itself carries no ticks).

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

// The route's geometry in a 340 × 150 box, as the approved Home draws it (owner, 2026-11-17: "make it look
// like the preview"): one smooth climb from the start, low and a little in from the left (the coaches'
// trails lead into it, homeCare.mjs's BS_CARE_TRAIL), to the goal's flag high on the right. Two cubic
// curves joined at the middle; `p` runs 0 to 1 along them. Deterministic, so the same goal draws the same
// route every time.
export const BS_CLIMB_W = 340;
export const BS_CLIMB_H = 150;
const BS_CLIMB_CURVES = [
  [[58, 112], [110, 100], [150, 84], [190, 66]],
  [[190, 66], [240, 44], [290, 28], [318, 22]],
];
export function bsClimbPoint(p) {
  const q = Math.max(0, Math.min(1, Number(p) || 0));
  const [a, b, c, d] = BS_CLIMB_CURVES[q <= 0.5 ? 0 : 1];
  const t = q <= 0.5 ? q * 2 : (q - 0.5) * 2;
  const u = 1 - t;
  const at = (i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  return { x: Math.round(at(0) * 10) / 10, y: Math.round(at(1) * 10) / 10 };
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

// The ground under the route: the whole route, closed along the bottom of the box, as one polygon. It
// takes the goal's gold, fading down.
export function bsClimbArea(steps = 48) {
  const foot = bsClimbPoint(0), top = bsClimbPoint(1);
  return [`${foot.x},${BS_CLIMB_H}`, bsClimbPath(0, 1, steps), `${top.x},${BS_CLIMB_H}`].join(' ');
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

// The climb's two colours: Shape's teal for what is walked and gold for the goal (owner, 2026-11-04: "add
// a little more color to this graph"). A point `f` (0 to 1) of the way along is mixed between them.
export const bsClimbGold = (t) => (t && t.isLight ? '#b9861f' : '#e2ac44');
export function bsClimbMix(a, b, f) {
  const pa = String(a || '').replace('#', ''), pb = String(b || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(pa) || !/^[0-9a-f]{6}$/i.test(pb)) return a;
  const na = parseInt(pa, 16), nb = parseInt(pb, 16), k = Math.max(0, Math.min(1, Number(f) || 0));
  const ch = (s) => Math.round(((na >> s) & 255) + ((((nb >> s) & 255) - ((na >> s) & 255)) * k));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}
