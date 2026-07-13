// The share card (spec 2026-07-13) — pure helpers under test: the card model
// (honest-absent — nothing fabricated), the shared hero-promotion rule,
// greedy wrap with ellipsis, and the route aspect-fit. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { bsShareCardModel, bsHeroStatIndex, bsWrapText, bsFitRoute } from "../public/newdesign/shareCard.mjs";

// ── bsShareCardModel ─────────────────────────────────────────────────────────
test("model type resolves: meal > pr (stamped delta) > workout", () => {
  assert.equal(bsShareCardModel({ meal: { kcal: 620 } }).type, "meal");
  assert.equal(bsShareCardModel({ delta: "+10 lb" }).type, "pr");
  assert.equal(bsShareCardModel({}).type, "workout");
});

test("empty stat rows are dropped, never fabricated", () => {
  const m = bsShareCardModel({
    heroStat: ["Distance", "8.4 mi"],
    stats: [["Pace", "7:42/mi"], ["HR", ""], ["", null], ["Time", "1:04"]],
  });
  assert.deepEqual(m.heroStat, ["Distance", "8.4 mi"]);
  assert.deepEqual(m.stats, [["Pace", "7:42/mi"], ["Time", "1:04"]]);
});

test("the hero never repeats in the small rows; rows cap at 3", () => {
  const m = bsShareCardModel({
    heroStat: ["Calories", "620 kcal"],
    stats: [["Calories", "620 kcal"], ["A", "1"], ["B", "2"], ["C", "3"], ["D", "4"]],
  });
  assert.equal(m.stats.length, 3);
  assert.ok(!m.stats.some(([l, v]) => l === "Calories" && v === "620 kcal"));
});

test("routes need 2+ finite points; junk filters out; absent stays null", () => {
  assert.equal(bsShareCardModel({}).routePoints, null);
  assert.equal(bsShareCardModel({ routePoints: [[1, 2]] }).routePoints, null);
  const m = bsShareCardModel({ routePoints: [[1, 2], ["x", 3], [4, 5]] });
  assert.deepEqual(m.routePoints, [[1, 2], [4, 5]]);
});

test("delta is honest-absent (null when blank); tier line uppercases", () => {
  assert.equal(bsShareCardModel({ delta: "  " }).delta, null);
  assert.equal(bsShareCardModel({ tierLine: "Tempo · Client" }).tierLine, "TEMPO · CLIENT");
});

// ── bsHeroStatIndex ──────────────────────────────────────────────────────────
test("runs promote distance; lifts promote load", () => {
  const runStats = [["Pace", "7:42/mi"], ["Distance", "8.4 mi"], ["Time", "1:04"]];
  assert.equal(bsHeroStatIndex(runStats, { isRun: true }), 1);
  const liftStats = [["Top set", "5 × 315"], ["Load", "315 lb"], ["Est. 1RM", "365 lb"]];
  assert.equal(bsHeroStatIndex(liftStats), 1);
});

test("fallback: the first digits+unit value; else index 0; junk-safe", () => {
  assert.equal(bsHeroStatIndex([["RPE", "8"], ["Volume", "12,400 lb"]]), 1);
  assert.equal(bsHeroStatIndex([["Moves", "6"], ["RPE", "8"]]), 0);
  assert.equal(bsHeroStatIndex([]), 0);
  assert.equal(bsHeroStatIndex(null), 0);
});

// ── bsWrapText ───────────────────────────────────────────────────────────────
const measure = (s) => s.length * 10; // 10px per char fake measurer

test("wraps greedily within maxWidth", () => {
  assert.deepEqual(bsWrapText("one two three four", 90, measure, 3), ["one two", "three", "four"]);
});

test("overflow past maxLines ellipsizes the last line", () => {
  const lines = bsWrapText("aaaa bbbb cccc dddd eeee", 100, measure, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
  assert.ok(measure(lines[1]) <= 100);
});

test("empty text wraps to no lines; a single huge word still returns a line", () => {
  assert.deepEqual(bsWrapText("", 100, measure), []);
  const lines = bsWrapText("supercalifragilistic", 100, measure, 1);
  assert.equal(lines.length, 1);
});

test("an oversized token ellipsizes to fit — no line ever exceeds maxWidth", () => {
  const one = bsWrapText("supercalifragilistic", 100, measure, 1);
  assert.ok(one[0].endsWith("…"));
  assert.ok(measure(one[0]) <= 100);
  // Mid-text oversized tokens fit too, without eating neighboring words.
  const mid = bsWrapText("hi supercalifragilistic yo", 100, measure, 3);
  assert.deepEqual(mid.map((l) => measure(l) <= 100), [true, true, true]);
  assert.equal(mid[0], "hi");
  assert.equal(mid[2], "yo");
});

// ── bsFitRoute ───────────────────────────────────────────────────────────────
test("aspect-fits and centers points into the box", () => {
  const fit = bsFitRoute([[0, 0], [10, 5]], { x: 100, y: 200, w: 100, h: 100 });
  assert.equal(fit.length, 2);
  // x spans the full box (10 units → 100px); y (5 units → 50px) centers.
  assert.deepEqual(fit[0].map(Math.round), [100, 225]);
  assert.deepEqual(fit[1].map(Math.round), [200, 275]);
});

test("a zero-spread route returns null (no fake line from one spot)", () => {
  assert.equal(bsFitRoute([[5, 5], [5, 5]], { x: 0, y: 0, w: 10, h: 10 }), null);
});
