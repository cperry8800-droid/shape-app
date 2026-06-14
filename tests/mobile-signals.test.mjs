// Phase 1 — the app's mobile→record mappers feed the SAME engine the website
// runs. Proves the mapped records are valid engine inputs (no false flags on
// missing data; real flags when the data is there). Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  recordFromCoachData,
  recordFromSelfData,
  mondayKey,
} from "../mobile-app/src/services/signalsMap.mjs";

const require = createRequire(import.meta.url);
const DashSignals = require("../public/newdesign/dashSignals.js");
const deps = { goalsFromDoc: DashSignals.goalsFromDoc };

// ── mondayKey ────────────────────────────────────────────────────────────────
test("mondayKey collapses any date to its Monday (UTC)", () => {
  assert.equal(mondayKey("2026-06-13"), "2026-06-08"); // Sat → Mon
  assert.equal(mondayKey("2026-06-08"), "2026-06-08"); // Mon → Mon
  assert.equal(mondayKey(""), null);
  assert.equal(mondayKey(null), null);
});

// ── Coach mapper → engine ────────────────────────────────────────────────────
test("recordFromCoachData maps the get_client_* rollup shape", () => {
  const rec = recordFromCoachData(
    { id: "u1", name: "Marcus T.", stats: { sessionsCompleted: 8, sessionsPlanned: 12, daysLogged7d: 4, avgCalories: 2100, avgProtein: 160 } },
    deps
  );
  assert.equal(rec.profile.id, "u1");
  assert.deepEqual(rec.trainingAdherence, { done: 8, planned: 12, pct: 67 });
  assert.equal(rec.foodLogs.daysLogged7d, 4);
  assert.equal(rec.nutrition.avgCalories, 2100);
});

test("a sparse coach record produces NO false flags (missing inputs are skipped)", () => {
  const rec = recordFromCoachData({ id: "u2", name: "Quiet Client" }, deps);
  const feed = DashSignals.getTriageFeed("trainer", [rec]);
  assert.equal(Array.isArray(feed), true);
  const row = feed.find((r) => r.client.profile.id === "u2");
  assert.equal(row.severity, "green");
  assert.equal(row.flags.length, 0);
});

test("a coach record with zero food logs this week flags food_gap", () => {
  const rec = recordFromCoachData({ id: "u3", name: "No Logs", stats: { daysLogged7d: 0 } }, deps);
  const feed = DashSignals.getTriageFeed("nutritionist", [rec]);
  const row = feed.find((r) => r.client.profile.id === "u3");
  assert.ok(row.flags.some((f) => f.key === "food_gap"), "food_gap should fire on daysLogged7d=0");
  assert.notEqual(row.severity, "green");
});

test("coach goalsDoc → goals + weigh-ins + body-comp goal flow through", () => {
  const goalsDoc = {
    overall: { target: 165, unit: "lb", now: 171, weighIns: [
      { on: "2026-04-20", weight: 177 }, { on: "2026-05-18", weight: 173 }, { on: "2026-06-08", weight: 171 },
    ] },
    training: [{ id: "g1", label: "Squat 1.5x BW", target: 245, metric: "lb", history: [] }],
  };
  const rec = recordFromCoachData({ id: "u4", name: "On Track", goalsDoc }, deps);
  assert.equal(rec.goal.target, 165);
  assert.equal(rec.weighIns.length, 3);
  assert.ok(Array.isArray(rec.goals) && rec.goals.length >= 1, "goalsFromDoc normalized the doc");
  // The mapped record is a valid projectGoal input via the engine.
  assert.doesNotThrow(() => DashSignals.buildMilestones(rec));
});

// ── Self (client) mapper → engine ────────────────────────────────────────────
test("recordFromSelfData maps streak + nutrition + weigh-ins", () => {
  const rec = recordFromSelfData(
    {
      uid: "me", name: "Quinn",
      nutrition: { currentStreak: 6, longestStreak: 14, avgProtein: 150, daysLogged7d: 5 },
      weighIns: [{ on: "2026-04-20", weight: 177 }, { on: "2026-06-08", weight: 171 }],
      goalsDoc: { overall: { target: 165, unit: "lb", now: 171 } },
    },
    deps
  );
  assert.deepEqual(rec.streaks, { current: 6, best: 14 });
  assert.equal(rec.weighIns.length, 2);
  assert.equal(rec.foodLogs.daysLogged7d, 5);
  assert.equal(rec.goal.target, 165);
});

test("self record drives buildMilestones + goal projection without error", () => {
  const rec = recordFromSelfData(
    {
      uid: "me", name: "Quinn",
      nutrition: { currentStreak: 0 },
      goalsDoc: { overall: { target: 165, unit: "lb", now: 171, weighIns: [
        { on: "2026-04-20", weight: 177 }, { on: "2026-05-04", weight: 175 },
        { on: "2026-05-18", weight: 173 }, { on: "2026-06-08", weight: 171 },
      ] } },
    },
    deps
  );
  const ms = DashSignals.buildMilestones(rec);
  assert.ok(ms && typeof ms === "object");
  // A steady downward weigh-in series should project a goal (any non-null state).
  if (Array.isArray(rec.goals) && rec.goals.length) {
    const proj = DashSignals.projectGoal(rec.goals[0]);
    assert.ok(proj && typeof proj.state === "string");
  }
});
