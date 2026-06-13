// Goal-projection tests — node --test, zero deps. Covers projectGoal's pace
// math + states, the week-over-week slip detector, the goal_slip flag, the
// 3-goal cap, the doc→goals normalizer, milestone-feed wiring, and the
// context-line brief. Synthetic cases use collinear histories so every
// expected date is exact hand arithmetic; persona cases pin the demo story.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DS = require("../public/newdesign/dashSignals.js");
const { THRESHOLDS, MAX_GOALS, projectGoal, goalSlipDays, visibleGoals, goalBrief, goalsFromDoc, evaluateClient, buildMilestones, getTriageFeed, buildMockClients } = DS;

const NOW = new Date("2026-06-12T12:00:00");
const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const ago = (days) => iso(new Date(NOW.getTime() - days * DAY));
const hist = (pairs) => pairs.map(([d, v]) => ({ on: ago(d), value: v }));
const goal = (over = {}) => ({ id: "g1", label: "Goal weight", metric: "weight", unit: "lb", target: 170, start: 180, setBy: "trainer", history: [], ...over });

// ── projection states ────────────────────────────────────────────────────────
test("on-pace down-goal: exact ETA from a clean −2 lb/wk line", () => {
  const p = projectGoal(goal({ history: hist([[14, 176], [7, 174], [0, 172]]), start: 176 }), NOW);
  assert.equal(p.state, "on-pace");
  assert.equal(p.projectedDate, "2026-06-19", "2 lb to go at 2 lb/wk = 7 days out");
  assert.equal(p.daysOut, 7);
  assert.equal(p.ratePerWeek, -2);
  assert.equal(p.toGo, 2);
  assert.ok(Math.abs(p.pct - 4 / 6) < 1e-9, "progress from start 176 → 170");
  assert.match(p.projectedLabel, /^[A-Z][a-z]{2} \d{1,2}$/, "human date label");
});
test("up-direction goal (strength) projects the same way", () => {
  const p = projectGoal(goal({ label: "Squat 1RM", target: 100, start: 88, history: hist([[14, 88], [7, 92], [0, 96]]) }), NOW);
  assert.equal(p.state, "on-pace");
  assert.equal(p.direction, "up");
  assert.equal(p.projectedDate, "2026-06-19");
  assert.equal(p.ratePerWeek, 4);
});
test("pace moving AWAY from the target = stalled, no fabricated date", () => {
  const p = projectGoal(goal({ target: 165, history: hist([[14, 170], [7, 171], [0, 172]]) }), NOW);
  assert.equal(p.state, "stalled");
  assert.equal(p.projectedDate, undefined);
});
test("achieved: last value crossed the target; first crossing dated", () => {
  const p = projectGoal(goal({ history: hist([[14, 172], [7, 170.5], [0, 169.6]]) }), NOW);
  assert.equal(p.state, "achieved");
  assert.equal(p.achievedOn, ago(0));
  assert.equal(p.pct, 1);
});
test("insufficient history is reported, never guessed", () => {
  assert.equal(projectGoal(goal({ history: hist([[0, 175]]) }), NOW).state, "insufficient");
  assert.equal(projectGoal(goal({ history: hist([[3, 176], [0, 175]]) }), NOW).state, "insufficient", "3-day span < the 7-day minimum");
  const noHist = projectGoal(goal({ history: [], now: 174 }), NOW);
  assert.equal(noHist.state, "insufficient");
  assert.equal(noHist.lastValue, 174, "falls back to the goal's current value");
  assert.equal(projectGoal(goal({ target: null }), NOW), null);
  assert.equal(projectGoal(null, NOW), null);
});
test("projection uses the RECENT pace window, not an old hot streak", () => {
  const plateau = [[120, 200], [90, 185]].concat([56, 49, 42, 35, 28, 21, 14, 7, 0].map((d) => [d, 180]));
  const p = projectGoal(goal({ target: 170, start: 200, history: hist(plateau) }), NOW);
  assert.equal(p.state, "stalled", "all-time slope is down, but the last 8 weeks are flat");
});
test("a crawl pace reads 1y+ instead of promising a far date", () => {
  const p = projectGoal(goal({ target: 165, history: hist([[56, 180.4], [28, 180.2], [0, 180]]) }), NOW);
  assert.equal(p.state, "far");
  assert.ok(p.daysOut > THRESHOLDS.GOAL_FAR_DAYS);
});
test("history field shapes from every live source normalize ({d,kg}, {logged_on,weight})", () => {
  const p = projectGoal(goal({ history: [{ d: ago(14), kg: 176 }, { logged_on: ago(7), weight: 174 }, { on: ago(0), value: 172 }], start: 176 }), NOW);
  assert.equal(p.state, "on-pace");
  assert.equal(p.projectedDate, "2026-06-19");
});

// ── week-over-week slip (the amber flag) ─────────────────────────────────────
test("slip: a flat week moves the ETA exactly 16 days later", () => {
  // Through last week: 180→178→176 at −2/wk → ETA = ago(7)+21d = Jun 26.
  // This week's point holds at 176 → fit flattens to −0.2/day → ETA Jul 12.
  const g = goal({ start: 180, history: hist([[21, 180], [14, 178], [7, 176], [0, 176]]) });
  assert.equal(goalSlipDays(g, NOW), 16);
  const r = evaluateClient({ profile: { id: "x", name: "X" }, goals: [g] }, NOW, "trainer");
  assert.deepEqual(r.flags.map((f) => f.key), ["goal_slip"]);
  assert.equal(r.severity, "amber", "the slip alone reads amber");
  assert.equal(r.flags[0].label, "Goal ETA +16d");
  assert.match(r.flags[0].reason, /moved 16 days later this week/);
});
test("steady pace = zero slip, no flag; both pro feeds see a real slip", () => {
  const steady = goal({ start: 180, history: hist([[21, 180], [14, 178], [7, 176], [0, 174]]) });
  assert.equal(goalSlipDays(steady, NOW), 0);
  assert.deepEqual(evaluateClient({ profile: { id: "x", name: "X" }, goals: [steady] }, NOW, "trainer").flags, []);
  const slipped = goal({ start: 180, history: hist([[21, 180], [14, 178], [7, 176], [0, 176]]) });
  for (const role of ["trainer", "nutritionist"]) {
    assert.deepEqual(evaluateClient({ profile: { id: "x", name: "X" }, goals: [slipped] }, NOW, role).flags.map((f) => f.key), ["goal_slip"], role);
  }
});
test("losing the ETA entirely (pace reversed) flags as 'Goal ETA lost'", () => {
  const g = goal({ start: 180, history: hist([[21, 180], [14, 178], [7, 176], [0, 181]]) });
  assert.equal(goalSlipDays(g, NOW), Infinity);
  const r = evaluateClient({ profile: { id: "x", name: "X" }, goals: [g] }, NOW, "trainer");
  assert.equal(r.flags[0].label, "Goal ETA lost");
});
test("no slip noise: always-stalled, achieved, or short histories stay silent", () => {
  const alwaysFlat = goal({ target: 165, history: hist([[28, 181], [21, 181], [14, 181], [7, 181], [0, 181]]) });
  assert.equal(goalSlipDays(alwaysFlat, NOW), null, "never had an ETA to slip");
  const achieved = goal({ history: hist([[14, 172], [7, 171], [0, 169]]) });
  assert.equal(goalSlipDays(achieved, NOW), null);
  assert.equal(goalSlipDays(goal({ history: hist([[0, 175]]) }), NOW), null);
});

// ── the 3-goal cap ───────────────────────────────────────────────────────────
test("visible goals cap at MAX_GOALS; a hidden 4th goal can't flag", () => {
  assert.equal(MAX_GOALS, 3);
  const steady = (id) => goal({ id, history: hist([[21, 180], [14, 178], [7, 176], [0, 174]]) });
  const slipped = goal({ id: "g4", history: hist([[21, 180], [14, 178], [7, 176], [0, 176]]) });
  const four = [steady("g1"), steady("g2"), steady("g3"), slipped];
  assert.equal(visibleGoals(four).length, 3);
  assert.ok(!visibleGoals(four).some((g) => g.id === "g4"));
  assert.deepEqual(evaluateClient({ profile: { id: "x", name: "X" }, goals: four }, NOW, "trainer").flags, []);
  assert.deepEqual(visibleGoals(null), []);
});

// ── doc → goals normalizer ───────────────────────────────────────────────────
test("goalsFromDoc: coach goals lead; live weigh-ins become the weight history", () => {
  const out = goalsFromDoc({
    coach: [
      { id: "c1", label: "Goal weight", metric: "weight", unit: "lb", target: 170, start: 184, setBy: "trainer", history: [] },
      { id: "c2", label: "Squat 1RM", metric: "strength", unit: "lb", target: 250, start: 215, setBy: "trainer", history: hist([[7, 240], [0, 242]]) },
    ],
    weighIns: [{ on: ago(14), weight: 176, unit: "lb" }, { on: ago(0), weight: 172.8, unit: "lb" }],
    overall: { title: "Lean by August", target: 76, unit: "kg" },
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "c1");
  assert.deepEqual(out[0].history.map((p) => p.value), [176, 172.8], "weigh-ins attached to the coach weight goal");
  assert.ok(!out.some((g) => g.id === "overall"), "self goal doesn't duplicate a coach weight goal");
});
test("goalsFromDoc: with no coach goals, the legacy self doc still maps ({d,kg} weigh-ins, numeric self-goals), capped at 3", () => {
  const out = goalsFromDoc({
    coach: null,
    overall: { title: "Lean by August", target: 76, unit: "kg", start: 80.4, now: 79.2, weighIns: [{ d: ago(14), kg: 80 }, { d: ago(0), kg: 79.2 }] },
    training: [{ t: "Squat 1.5× bodyweight", cur: 135, tgt: 175 }, { t: "4 workouts / week", cur: 3.2, tgt: 4 }],
    nutrition: [{ t: "150g protein daily", cur: 120, tgt: 150 }],
  });
  assert.equal(out.length, 3, "capped at MAX_GOALS");
  assert.equal(out[0].id, "overall");
  assert.equal(out[0].unit, "kg");
  assert.deepEqual(out[0].history.map((p) => p.value), [80, 79.2], "{d,kg} doc shape normalizes");
  assert.equal(out[1].label, "Squat 1.5× bodyweight");
  assert.equal(out[1].now, 135, "legacy current value carries (no fabricated history)");
  assert.equal(projectGoal(out[1], NOW).state, "insufficient");
  assert.deepEqual(goalsFromDoc(null), []);
});

// ── milestone feed + context-line brief ──────────────────────────────────────
test("milestones lead with goal proximity + pace; achieved goals land in recent", () => {
  const rec = {
    profile: { id: "x", name: "X" },
    streaks: { current: 9, best: 14 },
    totals: { workouts: 96 },
    goal: { target: 170, unit: "lb", now: 172.8 }, // legacy field must NOT double-list
    goals: [
      goal({ history: hist([[14, 176], [7, 174], [0, 172]]), start: 176 }),
      goal({ id: "g2", label: "5k under 25:00", unit: "min", target: 25, start: 28.5, history: hist([[14, 25.6], [7, 25.2], [0, 24.8]]) }),
    ],
  };
  const ms = buildMilestones(rec, NOW);
  assert.equal(ms.next[0].kind, "goal", "goal proximity leads the next feed");
  assert.equal(ms.next[0].label, "Goal weight");
  assert.match(ms.next[0].detail, /2 lb away · pace [A-Z][a-z]{2} \d/);
  assert.ok(Math.abs(ms.next[0].progress - 4 / 6) < 1e-9);
  assert.ok(ms.recent.some((m) => m.label === "5k under 25:00"), "achieved goal celebrated");
  assert.equal(ms.next.filter((m) => m.kind === "goal").length, 1, "legacy goal field didn't double-list");
});
test("goalBrief: proximity + pace for the context line, slip noted in-line", () => {
  const onPace = { goals: [goal({ history: hist([[14, 176], [7, 174], [0, 172]]), start: 176 })] };
  assert.match(goalBrief(onPace, NOW), /^2 lb to “Goal weight” · pace [A-Z][a-z]{2} \d/);
  const slipped = { goals: [goal({ start: 180, history: hist([[21, 180], [14, 178], [7, 176], [0, 176]]) })] };
  assert.match(goalBrief(slipped, NOW), /\(ETA \+16d this wk\)/);
  const stalled = { goals: [goal({ target: 165, history: hist([[14, 181], [7, 181], [0, 181]]) })] };
  assert.match(goalBrief(stalled, NOW), /pace stalled/);
  const done = { goals: [goal({ history: hist([[14, 172], [7, 170.5], [0, 169.6]]) })] };
  assert.match(goalBrief(done, NOW), /hit [A-Z][a-z]{2} \d{1,2} ✓/);
  assert.equal(goalBrief({ goals: [] }, NOW), null);
  assert.equal(goalBrief({ goals: null }, NOW), null);
});

// ── personas ─────────────────────────────────────────────────────────────────
test("Jordan: steady collinear goals — exact ETAs, zero slip, still green", () => {
  const jordan = buildMockClients(NOW).find((c) => c.profile.name === "Jordan M.");
  const [pWeight, pSquat, p5k] = jordan.goals.map((g) => projectGoal(g, NOW));
  assert.equal(pWeight.state, "on-pace");
  assert.equal(pWeight.projectedDate, "2026-07-17", "2.8 lb at 0.55/wk from Jun 11");
  assert.equal(pSquat.state, "on-pace");
  assert.equal(pSquat.projectedDate, "2026-07-26", "8 lb at 1.25/wk from Jun 11");
  assert.equal(p5k.state, "achieved");
  for (const g of jordan.goals) assert.ok((goalSlipDays(g, NOW) ?? 0) === 0 || g === jordan.goals[2]);
  assert.equal(evaluateClient(jordan, NOW, "trainer").severity, "green");
});
test("Nadia: the plateau slips her ETA +15d — amber on goal_slip alone", () => {
  const feed = getTriageFeed("trainer", buildMockClients(NOW), NOW);
  const nadia = feed.find((r) => r.client.profile.name === "Nadia P.");
  assert.equal(nadia.severity, "amber");
  assert.deepEqual(nadia.flags.map((f) => f.key), ["goal_slip"]);
  assert.equal(nadia.flags[0].label, "Goal ETA +15d");
});
test("Marcus: flat since the start = stalled card, but NO slip flag (no ETA was ever promised)", () => {
  const marcus = buildMockClients(NOW).find((c) => c.profile.name === "Marcus T.");
  assert.equal(projectGoal(marcus.goals[0], NOW).state, "stalled");
  assert.equal(goalSlipDays(marcus.goals[0], NOW), null);
  assert.ok(!evaluateClient(marcus, NOW, "trainer").flags.some((f) => f.key === "goal_slip"));
});
test("Tess: no goals set yet — empty, not invented", () => {
  const tess = buildMockClients(NOW).find((c) => c.profile.name === "Tess B.");
  assert.deepEqual(visibleGoals(tess.goals), []);
  assert.equal(goalBrief(tess, NOW), null);
});
