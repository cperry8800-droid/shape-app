// Workout-builder core tests — node --test, zero deps (same pattern as the
// signal-engine suite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DB = require("../public/newdesign/dashBuilderCore.js");

const kgRow = (over = {}) => ({
  id: "t1", name: "Back squat", muscle: "Quads", equipment: "Barbell",
  sets: 4, reps: "5", loadType: "kg", load: 100, tempo: "31X1", rest: "150s",
  cue: "brace before the walkout", group: null,
  progression: { rule: "all-reps", incKg: 2.5 },
  ...over,
});
const week = (rows) => ({ deload: false, days: [{ name: "Day 1", playlist: null, blocks: [{ kind: "main", rows }] }] });

test("progression auto-fills the duplicated week (+2.5 kg on all-reps)", () => {
  const w1 = week([kgRow(), kgRow({ id: "t2", progression: null, load: 60 })]);
  const w2 = DB.applyProgression(w1);
  assert.equal(w2.days[0].blocks[0].rows[0].load, 102.5);
  assert.equal(w2.days[0].blocks[0].rows[1].load, 60, "no rule → unchanged");
  assert.equal(w1.days[0].blocks[0].rows[0].load, 100, "source week untouched");
  assert.notEqual(w2.days[0].blocks[0].rows[0].id, "t1", "duplicated rows get fresh ids");
});
test("progression caps pct at 100 and rpe at 10", () => {
  const w = week([
    kgRow({ loadType: "pct", load: 99, progression: { rule: "all-reps", incPct: 2.5 } }),
    kgRow({ id: "t2", loadType: "rpe", load: 9.5, progression: { rule: "all-reps", incRpe: 1 } }),
  ]);
  const next = DB.applyProgression(w);
  assert.equal(next.days[0].blocks[0].rows[0].load, 100);
  assert.equal(next.days[0].blocks[0].rows[1].load, 10);
});

test("deload cuts volume ~40% (sets ×0.6, floor 1) and flags the week", () => {
  const w = week([kgRow({ sets: 5 }), kgRow({ id: "t2", sets: 1 })]);
  const d = DB.deloadWeek(w);
  assert.equal(d.deload, true);
  assert.equal(d.days[0].blocks[0].rows[0].sets, 3);
  assert.equal(d.days[0].blocks[0].rows[1].sets, 1, "never below 1 set");
  assert.equal(w.days[0].blocks[0].rows[0].sets, 5, "source untouched (editable copy)");
});

test("superset labels: adjacent grouped rows get A1/A2, ungrouped get numbers", () => {
  const day = {
    name: "D", playlist: null,
    blocks: [{ kind: "main", rows: [kgRow({ group: null }), kgRow({ id: "a1", group: "A" }), kgRow({ id: "a2", group: "A" }), kgRow({ id: "p2", group: null })] }],
  };
  assert.deepEqual(DB.rowLabels(day), ["01", "A1", "A2", "02"]);
});

test("load labels per type render the trainer's choice", () => {
  assert.equal(DB.loadLabel(kgRow()), "100 kg");
  assert.equal(DB.loadLabel(kgRow({ loadType: "pct", load: 75 })), "75% 1RM");
  assert.equal(DB.loadLabel(kgRow({ loadType: "rpe", load: 8 })), "RPE 8");
  assert.equal(DB.loadLabel(kgRow({ load: 0 })), "", "bodyweight rows show no load");
});

test("client card carries cues verbatim and the day playlist", () => {
  const day = {
    name: "Lower Push", playlist: { name: "Peak", meta: "14 tracks" },
    blocks: [{ kind: "main", rows: [kgRow({ cue: "brace before the walkout" })] }],
  };
  const card = DB.dayToClientCard(day, { time: "5:45 PM" });
  assert.equal(card.exercises[0].cue, "brace before the walkout");
  assert.equal(card.playlist.name, "Peak");
  assert.match(card.meta, /1 moves · 4 sets/);
});

test("assignment is a snapshot: later template edits never retro-change rows", () => {
  const program = { version: 2, goalTag: "strength", weeks: [week([kgRow()])] };
  const rows = DB.buildAssignmentRows(program, { id: "tpl-1", name: "Block" }, "2026-06-15");
  assert.equal(rows[0].payload.exercises[0].cue, "brace before the walkout");
  program.weeks[0].days[0].blocks[0].rows[0].cue = "CHANGED";
  program.weeks[0].days[0].blocks[0].rows[0].load = 999;
  assert.equal(rows[0].payload.exercises[0].cue, "brace before the walkout");
  assert.equal(rows[0].payload.exercises[0].load, "100 kg");
  assert.deepEqual(rows[0].payload.template, { id: "tpl-1", name: "Block", version: 2, week: 1, day: 1 });
});

test("assignment dates: days consecutive inside a week, weeks 7 days apart", () => {
  const twoWeek = {
    version: 1, goalTag: "strength",
    weeks: [
      { deload: false, days: [{ name: "A", playlist: null, blocks: [{ kind: "main", rows: [kgRow()] }] }, { name: "B", playlist: null, blocks: [{ kind: "main", rows: [kgRow({ id: "x" })] }] }] },
      { deload: false, days: [{ name: "A", playlist: null, blocks: [{ kind: "main", rows: [kgRow({ id: "y" })] }] }] },
    ],
  };
  const rows = DB.buildAssignmentRows(twoWeek, null, "2026-06-15"); // a Monday
  assert.deepEqual(rows.map((r) => r.scheduledDate), ["2026-06-15", "2026-06-16", "2026-06-22"]);
});

test("demo templates cover all five goal tags and pass through the snapshot path", () => {
  const tpls = DB.demoTemplates();
  assert.deepEqual(tpls.map((t) => t.detail.builder.goalTag).sort(), ["5k-prep", "cut", "hypertrophy", "return-to-gym", "strength"]);
  const strength = tpls.find((t) => t.name === "Strength Block 3");
  // Week 2 was generated via applyProgression — squat moved 110 → 112.5.
  assert.equal(strength.detail.builder.weeks[1].days[0].blocks[1].rows[0].load, 112.5);
  const rows = DB.buildAssignmentRows(strength.detail.builder, { id: strength.id, name: strength.name }, "2026-06-15");
  assert.equal(rows.length, 4);
  assert.ok(rows[0].payload.playlist && rows[0].payload.playlist.name.includes("Lower Push"));
  assert.ok(DB.demoPerformance(strength.id).retention.length >= 8);
});

// ── groupAssignmentWeeks — one publish per WEEK, not per session ─────────────
//
// The grouping is the load-bearing half: the publish boundary REPLACES a whole
// client-week, so a session bucketed into the wrong week is judged against the
// wrong load AND lands in a replace that clears a week it was never part of.

test("groupAssignmentWeeks: a 12-week × 3-day program becomes 12 calls, not 36", () => {
  const rows = [];
  for (let w = 0; w < 12; w += 1) {
    for (const d of [0, 2, 4]) {           // Mon / Wed / Fri
      const dt = new Date(Date.UTC(2026, 5, 15 + w * 7 + d)); // 2026-06-15 is a Monday
      rows.push({ title: `W${w + 1} D${d}`, scheduledDate: dt.toISOString().slice(0, 10), payload: {} });
    }
  }
  assert.equal(rows.length, 36);
  const weeks = DB.groupAssignmentWeeks(rows);
  assert.equal(weeks.length, 12);
  assert.ok(weeks.every((w) => w.rows.length === 3));
  assert.equal(weeks[0].weekStartISO, "2026-06-15");
  assert.equal(weeks[11].weekStartISO, "2026-08-31");
});

test("groupAssignmentWeeks: Monday comes from the session's OWN date", () => {
  // Sunday closes the week it belongs to; the next Monday opens a new one.
  const weeks = DB.groupAssignmentWeeks([
    { title: "Sun", scheduledDate: "2026-06-21", payload: {} },
    { title: "Mon", scheduledDate: "2026-06-22", payload: {} },
    { title: "Wed", scheduledDate: "2026-06-17", payload: {} },
  ]);
  assert.deepEqual(weeks.map((w) => w.weekStartISO), ["2026-06-15", "2026-06-22"]);
  assert.deepEqual(weeks[0].rows.map((r) => r.title), ["Sun", "Wed"]);
  assert.deepEqual(weeks[1].rows.map((r) => r.title), ["Mon"]);
});

test("groupAssignmentWeeks: weeks come back calendar-ascending", () => {
  const weeks = DB.groupAssignmentWeeks([
    { title: "c", scheduledDate: "2026-07-06", payload: {} },
    { title: "a", scheduledDate: "2026-06-15", payload: {} },
    { title: "b", scheduledDate: "2026-06-29", payload: {} },
  ]);
  assert.deepEqual(weeks.map((w) => w.weekStartISO), ["2026-06-15", "2026-06-29", "2026-07-06"]);
});

test("groupAssignmentWeeks: an undated row is DROPPED, never given a fabricated Monday", () => {
  const weeks = DB.groupAssignmentWeeks([
    { title: "real", scheduledDate: "2026-06-17", payload: {} },
    { title: "undated", scheduledDate: "", payload: {} },
    { title: "garbage", scheduledDate: "next tuesday", payload: {} },
    { title: "impossible", scheduledDate: "2026-02-30", payload: {} },
    null,
  ]);
  assert.equal(weeks.length, 1);
  assert.deepEqual(weeks[0].rows.map((r) => r.title), ["real"]);
});

test("groupAssignmentWeeks: garbage input yields no weeks rather than throwing", () => {
  for (const bad of [null, undefined, "rows", 7, {}]) {
    assert.deepEqual(DB.groupAssignmentWeeks(bad), []);
  }
});

test("groupAssignmentWeeks: the real builder output round-trips into one week", () => {
  const strength = DB.demoTemplates()[0];
  const rows = DB.buildAssignmentRows(strength.detail.builder, { id: strength.id, name: strength.name }, "2026-06-15");
  const weeks = DB.groupAssignmentWeeks(rows);
  const total = weeks.reduce((n, w) => n + w.rows.length, 0);
  assert.equal(total, rows.length);          // nothing dropped
  assert.ok(weeks.length < rows.length);     // and genuinely fewer calls
});
