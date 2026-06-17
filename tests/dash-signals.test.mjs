// Signal-engine unit tests — run with: node --test tests/
// Zero dependencies (node:test + node:assert); the engine is a pure UMD
// module, so it loads in Node exactly as it does in the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { THRESHOLDS, evaluateClient, getTriageFeed, buildProgrammingQueue, buildMilestones, findJointAttention, buildMockClients,
  projectGoal, goalSlipDays, goalsFromDoc, buildDirective, buildEvidencePack } =
  require("../public/newdesign/dashSignals.js");

// Fixed reference clock: Friday 2026-06-12 (day-into-week 4 ≥ grace 3, so the
// one-week check-in rule is active). Date-sensitive tests build their own now.
const NOW = new Date("2026-06-12T12:00:00");
const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const ago = (days) => iso(new Date(NOW.getTime() - days * DAY));
const mondayOf = (d) => {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const mondaysAgo = (w) => iso(new Date(mondayOf(NOW).getTime() - w * 7 * DAY));

// A record with no flags; override per test.
const clean = (over = {}) => ({
  profile: { id: "t1", name: "Test", isNew: false },
  trainingAdherence: { pct: 90, done: 18, planned: 20 },
  foodLogs: { lastLoggedOn: ago(1), daysLogged7d: 6 },
  shapeScoreHistory: [
    { weekOf: mondaysAgo(1), points: 70 },
    { weekOf: mondaysAgo(0), points: 72 },
  ],
  weighIns: [],
  streaks: { current: 5, best: 9, lastActiveOn: ago(0) },
  lastContact: { trainer: ago(1), nutritionist: ago(1) },
  checkIn: { lastWeekOf: mondaysAgo(0) },
  goalPhase: "Build",
  milestones: [],
  payments: { mrrCents: 18000 },
  ...over,
});

const keys = (r) => r.flags.map((f) => f.key).sort();

// ── streak_broken ────────────────────────────────────────────────────────────
test("streak broken fires when current=0 and a real streak existed", () => {
  const r = evaluateClient(clean({ streaks: { current: 0, best: 12 } }), NOW, "trainer");
  assert.deepEqual(keys(r), ["streak_broken"]);
  assert.equal(r.severity, "amber");
  assert.match(r.flags[0].reason, /12 days/);
});
test("streak NOT broken when best below minimum", () => {
  const r = evaluateClient(clean({ streaks: { current: 0, best: THRESHOLDS.STREAK_MIN_BEST - 1 } }), NOW, "trainer");
  assert.deepEqual(keys(r), []);
});
test("missing streaks skips the rule (no false alarm on live data)", () => {
  const r = evaluateClient(clean({ streaks: null }), NOW, "trainer");
  assert.deepEqual(keys(r), []);
  assert.equal(r.severity, "green");
});

// ── score_drop ───────────────────────────────────────────────────────────────
test("score drop fires exactly at the threshold", () => {
  const hist = [{ weekOf: mondaysAgo(1), points: 70 }, { weekOf: mondaysAgo(0), points: 70 - THRESHOLDS.SCORE_DROP_PTS }];
  const r = evaluateClient(clean({ shapeScoreHistory: hist }), NOW, "trainer");
  assert.deepEqual(keys(r), ["score_drop"]);
  assert.match(r.flags[0].reason, new RegExp(THRESHOLDS.SCORE_DROP_PTS + " pts"));
});
test("score drop below threshold does not fire", () => {
  const hist = [{ weekOf: mondaysAgo(1), points: 70 }, { weekOf: mondaysAgo(0), points: 70 - THRESHOLDS.SCORE_DROP_PTS + 1 }];
  const r = evaluateClient(clean({ shapeScoreHistory: hist }), NOW, "trainer");
  assert.deepEqual(keys(r), []);
});
test("single-entry or missing history skips the rule", () => {
  assert.deepEqual(keys(evaluateClient(clean({ shapeScoreHistory: [{ weekOf: mondaysAgo(0), points: 10 }] }), NOW, "trainer")), []);
  assert.deepEqual(keys(evaluateClient(clean({ shapeScoreHistory: null }), NOW, "trainer")), []);
});

// ── food_gap ─────────────────────────────────────────────────────────────────
test("food gap fires at exactly N days, not before", () => {
  assert.deepEqual(keys(evaluateClient(clean({ foodLogs: { lastLoggedOn: ago(THRESHOLDS.FOOD_GAP_DAYS), daysLogged7d: 4 } }), NOW, "trainer")), ["food_gap"]);
  assert.deepEqual(keys(evaluateClient(clean({ foodLogs: { lastLoggedOn: ago(THRESHOLDS.FOOD_GAP_DAYS - 1), daysLogged7d: 4 } }), NOW, "trainer")), []);
});
test("no last-log date: empty week flags, partial week skips (approximation)", () => {
  assert.deepEqual(keys(evaluateClient(clean({ foodLogs: { lastLoggedOn: null, daysLogged7d: 0 } }), NOW, "trainer")), ["food_gap"]);
  assert.deepEqual(keys(evaluateClient(clean({ foodLogs: { lastLoggedOn: null, daysLogged7d: 2 } }), NOW, "trainer")), []);
  assert.deepEqual(keys(evaluateClient(clean({ foodLogs: null }), NOW, "trainer")), []);
});

// ── checkin_overdue ──────────────────────────────────────────────────────────
test("check-in this week is clean; 1 week missed flags (past grace day)", () => {
  assert.deepEqual(keys(evaluateClient(clean({ checkIn: { lastWeekOf: mondaysAgo(0) } }), NOW, "trainer")), []);
  const r = evaluateClient(clean({ checkIn: { lastWeekOf: mondaysAgo(1) } }), NOW, "trainer");
  assert.deepEqual(keys(r), ["checkin_overdue"]);
  assert.equal(r.severity, "amber");
});
test("1 week missed is graced early in the week", () => {
  const monday = new Date("2026-06-08T09:00:00"); // Monday, day-into-week 0 < grace
  const lastWeek = iso(new Date(mondayOf(monday).getTime() - 7 * DAY));
  const r = evaluateClient(clean({ checkIn: { lastWeekOf: lastWeek } }), monday, "trainer");
  assert.deepEqual(keys(r), []);
});
test("2+ missed weeks is red on its own and ignores grace", () => {
  const monday = new Date("2026-06-08T09:00:00");
  const twoBack = iso(new Date(mondayOf(monday).getTime() - 14 * DAY));
  const r = evaluateClient(clean({ checkIn: { lastWeekOf: twoBack } }), monday, "trainer");
  assert.deepEqual(keys(r), ["checkin_overdue"]);
  assert.equal(r.severity, "red");
  assert.match(r.flags[0].reason, /2 weeks/);
});
test("never checked in: flags unless the client is new", () => {
  assert.equal(evaluateClient(clean({ checkIn: { lastWeekOf: null } }), NOW, "trainer").severity, "red");
  const fresh = clean({ checkIn: { lastWeekOf: null } });
  fresh.profile.isNew = true;
  assert.deepEqual(keys(evaluateClient(fresh, NOW, "trainer")), []);
});

// ── contact_gap (role-aware) ─────────────────────────────────────────────────
test("contact gap fires at the threshold for the viewing pro only", () => {
  const c = clean({ lastContact: { trainer: ago(THRESHOLDS.CONTACT_GAP_DAYS), nutritionist: ago(1) } });
  assert.deepEqual(keys(evaluateClient(c, NOW, "trainer")), ["contact_gap"]);
  assert.deepEqual(keys(evaluateClient(c, NOW, "nutritionist")), []);
});
test("client view uses the most recent contact from any pro", () => {
  const c = clean({ lastContact: { trainer: ago(9), nutritionist: ago(2) } });
  assert.deepEqual(keys(evaluateClient(c, NOW, "client")), []);
  const c2 = clean({ lastContact: { trainer: ago(9), nutritionist: ago(6) } });
  assert.deepEqual(keys(evaluateClient(c2, NOW, "client")), ["contact_gap"]);
});
test("missing lastContact skips the rule", () => {
  assert.deepEqual(keys(evaluateClient(clean({ lastContact: null }), NOW, "trainer")), []);
});

// ── severity mapping ─────────────────────────────────────────────────────────
test("two flags escalate to red", () => {
  const r = evaluateClient(clean({
    streaks: { current: 0, best: 10 },
    foodLogs: { lastLoggedOn: ago(5), daysLogged7d: 1 },
  }), NOW, "trainer");
  assert.equal(r.flags.length, 2);
  assert.equal(r.severity, "red");
});
test("a fully-null live record is green (engine never invents flags)", () => {
  const bare = { profile: { id: "x", name: "Sparse", isNew: false }, trainingAdherence: null, foodLogs: null, shapeScoreHistory: null, weighIns: null, streaks: null, lastContact: null, checkIn: null, goalPhase: null, milestones: null, payments: null };
  const r = evaluateClient(bare, NOW, "trainer");
  assert.deepEqual(r.flags, []);
  assert.equal(r.severity, "green");
});

// ── triage feed ──────────────────────────────────────────────────────────────
test("triage sorts red → amber → green, most-flagged first, with reasons", () => {
  const feed = getTriageFeed("trainer", buildMockClients(NOW), NOW);
  const sev = feed.map((r) => r.severity);
  const firstAmber = sev.indexOf("amber");
  const firstGreen = sev.indexOf("green");
  assert.ok(sev.lastIndexOf("red") < firstAmber, "all reds before ambers");
  assert.ok(sev.lastIndexOf("amber") < firstGreen, "all ambers before greens");
  for (const row of feed) {
    if (row.severity !== "green") assert.ok(row.reasons.length > 0, row.client.profile.name + " has reasons");
  }
});
test("the mock personas hit their designed severities", () => {
  const feed = getTriageFeed("trainer", buildMockClients(NOW), NOW);
  assert.equal(feed.length, 10);
  const by = Object.fromEntries(feed.map((r) => [r.client.profile.name, r]));
  assert.equal(by["Jordan M."].severity, "green");
  assert.equal(by["Priya S."].severity, "green");
  assert.equal(by["Aisha K."].severity, "amber");
  assert.equal(by["Elena R."].severity, "amber");
  assert.equal(by["Deandre K."].severity, "amber");
  assert.equal(by["Nadia P."].severity, "amber");
  assert.deepEqual(keys(by["Nadia P."]), ["goal_slip"]);
  assert.equal(by["Marcus T."].severity, "red");
  assert.equal(by["Sam R."].severity, "red");
  assert.equal(by["Jonah W."].severity, "red");
  assert.deepEqual(keys(by["Marcus T."]), ["food_gap", "score_drop", "streak_broken"]);
  assert.deepEqual(keys(by["Sam R."]), ["contact_gap", "food_gap"]);
  assert.deepEqual(keys(by["Jonah W."]), ["checkin_overdue"]);
  // Tess B. is the brand-new client: green, isNew, and her missing first
  // check-in is excused by the new-client pass.
  assert.equal(by["Tess B."].severity, "green");
  assert.equal(by["Tess B."].client.profile.isNew, true);
});

test("flags carry short pill labels in the spec format", () => {
  const feed = getTriageFeed("trainer", buildMockClients(NOW), NOW);
  const by = Object.fromEntries(feed.map((r) => [r.client.profile.name, r]));
  const labels = (r) => r.flags.map((f) => f.label).sort();
  assert.deepEqual(labels(by["Marcus T."]), ["No logs 3d", "Score ↓8", "Streak broken"]);
  assert.deepEqual(labels(by["Sam R."]), ["No logs 4d", "Quiet 7d"]);
  assert.deepEqual(labels(by["Jonah W."]), ["Check-in 3w late"]);
  assert.deepEqual(labels(by["Elena R."]), ["Score ↓7"]);
  assert.deepEqual(labels(by["Nadia P."]), ["Goal ETA +15d"]);
  for (const r of feed) for (const f of r.flags) assert.ok(f.label && f.label.length <= 18, f.key + " label fits a pill");
});
test("mock personas are stable on any weekday (no grace-dependent flips)", () => {
  for (let d = 0; d < 7; d++) {
    const now = new Date(new Date("2026-06-08T12:00:00").getTime() + d * DAY); // Mon..Sun
    const feed = getTriageFeed("trainer", buildMockClients(now), now);
    const by = Object.fromEntries(feed.map((r) => [r.client.profile.name, r.severity]));
    assert.equal(by["Marcus T."], "red", "Marcus red on day " + d);
    assert.equal(by["Jonah W."], "red", "Jonah red on day " + d);
    assert.equal(by["Jordan M."], "green", "Jordan green on day " + d);
    assert.equal(by["Nadia P."], "amber", "Nadia amber on day " + d + " (goal slip is date-relative)");
  }
});

// ── programming queue (step 4.2) ────────────────────────────────────────────
test("queue: current-week check-in = ready; missing = blocked; null checkIn excluded", () => {
  const rows = [
    clean({ profile: { id: "a", name: "A", isNew: false }, checkIn: { lastWeekOf: mondaysAgo(0) } }),
    clean({ profile: { id: "b", name: "B", isNew: false }, checkIn: { lastWeekOf: mondaysAgo(1) } }),
    clean({ profile: { id: "c", name: "C", isNew: true },  checkIn: { lastWeekOf: null } }),
    clean({ profile: { id: "d", name: "D", isNew: false }, checkIn: null }),
  ];
  const q = buildProgrammingQueue(rows, NOW);
  assert.deepEqual(q.map((r) => [r.client.profile.id, r.state]), [["a", "ready"], ["b", "blocked"], ["c", "blocked"]]);
  assert.match(q[1].reason, /this week's check-in/);
  assert.match(q[2].reason, /first check-in/);
});
test("queue sorts ready before blocked with name tiebreak", () => {
  const rows = [
    clean({ profile: { id: "z", name: "Zed", isNew: false }, checkIn: { lastWeekOf: mondaysAgo(2) } }),
    clean({ profile: { id: "m", name: "Mia", isNew: false }, checkIn: { lastWeekOf: mondaysAgo(0) } }),
    clean({ profile: { id: "k", name: "Kai", isNew: false }, checkIn: { lastWeekOf: mondaysAgo(0) } }),
  ];
  assert.deepEqual(buildProgrammingQueue(rows, NOW).map((r) => r.client.profile.name), ["Kai", "Mia", "Zed"]);
});
test("queue over the mock personas: 8 ready, Jonah + Tess blocked", () => {
  const q = buildProgrammingQueue(buildMockClients(NOW), NOW);
  assert.equal(q.filter((r) => r.state === "ready").length, 8);
  assert.deepEqual(q.filter((r) => r.state === "blocked").map((r) => r.client.profile.name).sort(), ["Jonah W.", "Tess B."]);
});

// ── nutrition rules (step 5 — nutritionist feed only) ───────────────────────
test("ledger blown fires at +10% for the nutritionist, never the trainer", () => {
  const c = clean({ nutrition: { avgCalories: 2310, targetCalories: 2100, avgProtein: 150, targetProtein: 150 } });
  const n = evaluateClient(c, NOW, "nutritionist");
  assert.deepEqual(keys(n), ["ledger_blown"]);
  assert.equal(n.flags[0].label, "Ledger +10%");
  assert.deepEqual(keys(evaluateClient(c, NOW, "trainer")), []);
});
test("ledger under +10% does not fire", () => {
  const c = clean({ nutrition: { avgCalories: 2289, targetCalories: 2100, avgProtein: 150, targetProtein: 150 } });
  assert.deepEqual(keys(evaluateClient(c, NOW, "nutritionist")), []);
});
test("protein under fires at -15% with value+target; skips without a target", () => {
  const c = clean({ nutrition: { avgCalories: 2000, targetCalories: 2100, avgProtein: 127, targetProtein: 150 } });
  const n = evaluateClient(c, NOW, "nutritionist");
  assert.deepEqual(keys(n), ["protein_under"]);
  assert.match(n.flags[0].reason, /127g protein vs a 150g target/);
  const noTarget = clean({ nutrition: { avgCalories: 2000, targetCalories: null, avgProtein: 40, targetProtein: null } });
  assert.deepEqual(keys(evaluateClient(noTarget, NOW, "nutritionist")), []);
  assert.deepEqual(keys(evaluateClient(clean({ nutrition: null }), NOW, "nutritionist")), []);
});
test("nutritionist persona feed: Deandre red (logs+ledger), Priya amber (protein); trainer feed unchanged", () => {
  const nf = getTriageFeed("nutritionist", buildMockClients(NOW), NOW);
  const nby = Object.fromEntries(nf.map((r) => [r.client.profile.name, r]));
  assert.equal(nby["Deandre K."].severity, "red");
  assert.deepEqual(keys(nby["Deandre K."]), ["food_gap", "ledger_blown"]);
  assert.equal(nby["Priya S."].severity, "amber");
  assert.deepEqual(keys(nby["Priya S."]), ["protein_under"]);
  const tf = getTriageFeed("trainer", buildMockClients(NOW), NOW);
  const tby = Object.fromEntries(tf.map((r) => [r.client.profile.name, r.severity]));
  assert.equal(tby["Deandre K."], "amber");
  assert.equal(tby["Priya S."], "green");
});

// ── milestones (step 9.1) ───────────────────────────────────────────────────
test("milestones: stored hits within 30d + streak landmark + nexts", () => {
  const c = clean({
    milestones: [
      { key: "pr", kind: "pr", label: "Squat 245 lb PR", hitAt: ago(5) },
      { key: "old", kind: "goal", label: "25% to goal", hitAt: ago(45) }, // too old
    ],
    streaks: { current: 9, best: 14 },
    totals: { workouts: 96 },
  });
  const ms = buildMilestones(c, NOW);
  const labels = ms.recent.map((m) => m.label);
  assert.ok(labels.includes("Squat 245 lb PR"));
  assert.ok(!labels.includes("25% to goal"), "stale hits filtered");
  assert.ok(labels.includes("7-day streak"), "crossed streak landmark");
  const nextLabels = ms.next.map((m) => m.label);
  assert.ok(nextLabels.includes("14-day streak"));
  assert.ok(nextLabels.includes("Workout #100"));
});
test("milestones skip cleanly on a sparse record", () => {
  const bare = { profile: { id: "x", name: "Sparse" }, milestones: null, streaks: null, totals: null, goal: null, weighIns: null };
  const ms = buildMilestones(bare, NOW);
  assert.deepEqual(ms.recent, []);
  assert.deepEqual(ms.next, []);
});

// ── joint attention (step 9.2) ──────────────────────────────────────────────
test("joint attention requires a training-domain AND a nutrition-domain flag", () => {
  const joint = clean({ streaks: { current: 0, best: 10 }, foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 2 } });
  const trainingOnly = clean({ streaks: { current: 0, best: 10 } });
  const nutritionOnly = clean({ foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 2 } });
  const res = findJointAttention([joint, trainingOnly, nutritionOnly], NOW);
  assert.equal(res.length, 1);
  assert.equal(res[0].client, joint);
  assert.ok(res[0].trainingFlags.length && res[0].nutritionFlags.length);
});
test("personas: Marcus is the joint-attention case; Sam (no training flag) is not", () => {
  const res = findJointAttention(buildMockClients(NOW), NOW);
  assert.deepEqual(res.map((r) => r.client.profile.name), ["Marcus T."]);
});

// ── Projection + directive core (S3-14) ──────────────────────────────────────
// Direct coverage for projectGoal / goalsFromDoc / buildDirective /
// buildEvidencePack — the projection + directive paths that were previously
// only exercised indirectly. These would have caught the S3-2/3/5 bugs.

// S3-2 — unit reconciliation: a kg-logged series must not "achieve" an lb goal.
test("goalsFromDoc reconciles a kg weigh-in series against an lb goal (S3-2)", () => {
  const goals = goalsFromDoc({
    overall: { title: "Goal weight", target: 165, unit: "lb", start: 185 },
    weighIns: [
      { on: ago(40), weight: 84, unit: "kg" }, // ≈ 185.2 lb
      { on: ago(5), weight: 78, unit: "kg" },  // ≈ 172.0 lb
    ],
  });
  const wg = goals.find((g) => g.metric === "weight");
  assert.ok(wg, "weight goal built from overall + weigh-ins");
  assert.equal(wg.history.length, 2);
  // History is converted INTO the goal's unit (lb), not left as raw kg.
  assert.ok(wg.history[1].value > 170 && wg.history[1].value < 174, "78 kg ≈ 172 lb");
  const p = projectGoal(wg, NOW);
  // 172 lb is NOT ≤ 165 lb — the old unit-blind path returned "achieved".
  assert.notEqual(p.state, "achieved");
  assert.equal(p.direction, "down");
});

// S3-3 — unsorted (newest-first) series must read as a loss, not a gain.
test("buildEvidencePack reads a weight LOSS from a newest-first series (S3-3)", () => {
  const rec = clean({
    weighIns: [
      { on: ago(2), weight: 170, unit: "lb" },  // newest first (unsorted input)
      { on: ago(30), weight: 178, unit: "lb" },
    ],
  });
  const pack = buildEvidencePack(rec, "trainer", NOW);
  const wsig = pack.signals.find((s) => s.key === "weight");
  assert.ok(wsig, "weight signal present");
  assert.equal(wsig.value, "-8 lb"); // lost 8 — not the inverted "+8"
});
test("buildDirective's 30-day read reports the loss too (S3-3)", () => {
  const rec = clean({
    weighIns: [
      { on: ago(2), weight: 170, unit: "lb" },
      { on: ago(30), weight: 178, unit: "lb" },
    ],
  });
  const d = buildDirective(rec, NOW, "trainer");
  assert.match(d.read.summary30d, /-8 lb/);
});

// S3-5 — the single lead is by urgency, not rule push-order.
test("the directive leads with the most urgent flag, not push order (S3-5)", () => {
  const rec = clean({
    shapeScoreHistory: [
      { weekOf: mondaysAgo(1), points: 80 },
      { weekOf: mondaysAgo(0), points: 70 }, // drop 10 ≥ SCORE_DROP_PTS → fires first in push order
    ],
    checkIn: { lastWeekOf: mondaysAgo(10) }, // months-late check-in
  });
  const ev = evaluateClient(rec, NOW, "trainer");
  assert.ok(ev.flags.some((f) => f.key === "score_drop"));
  assert.ok(ev.flags.some((f) => f.key === "checkin_overdue"));
  const d = buildDirective(rec, NOW, "trainer");
  assert.equal(d.lever, "checkin"); // the months-late check-in wins
  assert.deepEqual(d.cited, ["checkin_overdue"]);
});

// projectGoal / goalSlipDays sanity coverage.
test("projectGoal returns an on-pace ETA for a steady descent (S3-14)", () => {
  const g = {
    label: "Cut", metric: "weight", unit: "lb", target: 170, start: 185,
    history: [
      { on: ago(35), value: 185 },
      { on: ago(21), value: 181 },
      { on: ago(7), value: 177 },
      { on: ago(0), value: 175 },
    ],
  };
  const p = projectGoal(g, NOW);
  assert.equal(p.direction, "down");
  assert.equal(p.state, "on-pace");
  assert.ok(p.toGo > 0 && p.projectedDate);
});
test("projectGoal marks an already-hit goal achieved (S3-14)", () => {
  const g = { metric: "weight", unit: "lb", target: 175, start: 185, history: [{ on: ago(20), value: 182 }, { on: ago(2), value: 174 }] };
  assert.equal(projectGoal(g, NOW).state, "achieved");
});
test("goalSlipDays is null without a prior baseline (S3-14)", () => {
  const g = { metric: "weight", unit: "lb", target: 170, start: 180, history: [{ on: ago(2), value: 178 }] };
  assert.equal(goalSlipDays(g, NOW), null);
});
