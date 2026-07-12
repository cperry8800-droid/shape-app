// Meal share (spec 2026-07-12) — the payload builder + the card's menu rows.
// The contract under test: the plate not the ledger (meal macros only),
// honest-absent attribution (no empty-string keys), and the award skip is
// unconditional. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { bsMealSharePayload, bsMealMenuLines } from "../mobile-app/src/services/mealShare.mjs";

// ── bsMealSharePayload ───────────────────────────────────────────────────────
test("payload carries the meal identity + rounded macros", () => {
  const pay = bsMealSharePayload({ name: "Sheet-pan salmon", kcal: 619.6, p: 44.2, c: 57.5, f: 22 });
  assert.equal(pay.title, "Sheet-pan salmon");
  assert.equal(pay.activityType, "meal");
  assert.equal(pay.metrics.kind, "meal");
  assert.deepEqual(
    [pay.metrics.kcal, pay.metrics.p, pay.metrics.c, pay.metrics.f],
    [620, 44, 58, 22]
  );
});

test("skipAward is always true — a share never earns", () => {
  assert.equal(bsMealSharePayload({ name: "Lunch" }).skipAward, true);
  assert.equal(bsMealSharePayload({}).skipAward, true);
});

test("attribution is honest-absent: recipeId/coach only when truthy", () => {
  const bare = bsMealSharePayload({ name: "Bowl", recipeId: "", coach: "  " });
  assert.ok(!("recipeId" in bare.metrics));
  assert.ok(!("coach" in bare.metrics));
  const attributed = bsMealSharePayload({ name: "Bowl", recipeId: "kc-12", coach: "Rae" });
  assert.equal(attributed.metrics.recipeId, "kc-12");
  assert.equal(attributed.metrics.coach, "Rae");
});

test("portion rides only when it isn't 1x (and never as junk)", () => {
  assert.ok(!("portion" in bsMealSharePayload({ portion: 1 }).metrics));
  assert.equal(bsMealSharePayload({ portion: 1.5 }).metrics.portion, 1.5);
  assert.equal(bsMealSharePayload({ portion: 0.333333 }).metrics.portion, 0.33);
  assert.ok(!("portion" in bsMealSharePayload({ portion: 0 }).metrics));
  assert.ok(!("portion" in bsMealSharePayload({ portion: "abc" }).metrics));
});

test("empty name falls back to Meal; planned defaults false", () => {
  const pay = bsMealSharePayload({});
  assert.equal(pay.title, "Meal");
  assert.equal(pay.metrics.planned, false);
  assert.equal(bsMealSharePayload({ planned: true }).metrics.planned, true);
});

test("payload never carries day totals or goal fields", () => {
  const pay = bsMealSharePayload({ name: "Dinner", kcal: 700, p: 40, c: 60, f: 25 });
  const keys = Object.keys(pay.metrics).sort();
  assert.deepEqual(keys, ["c", "f", "kcal", "kind", "p", "planned"]);
});

test("missing/malformed macros are OMITTED — never fabricated zeroes", () => {
  const pay = bsMealSharePayload({ name: "Kcal-only", kcal: 500 });
  assert.deepEqual(Object.keys(pay.metrics).sort(), ["kcal", "kind", "planned"]);
  const junk = bsMealSharePayload({ name: "Junk", kcal: "abc", p: null, c: undefined, f: "" });
  assert.deepEqual(Object.keys(junk.metrics).sort(), ["kind", "planned"]);
});

// ── bsMealMenuLines ──────────────────────────────────────────────────────────
test("menu lines are P/C/F only — kcal rides the hero, never duplicated", () => {
  const lines = bsMealMenuLines({ kcal: 620, p: 44, c: 58, f: 22 });
  assert.deepEqual(lines, [["Protein", "44 g"], ["Carbs", "58 g"], ["Fat", "22 g"]]);
});

test("menu lines round stray floats and DROP absent macros (honest-absent)", () => {
  assert.deepEqual(bsMealMenuLines({ p: 44.000001, c: "58", f: null }), [
    ["Protein", "44 g"], ["Carbs", "58 g"],
  ]);
  assert.deepEqual(bsMealMenuLines(null), []);
  assert.deepEqual(bsMealMenuLines({ p: "junk" }), []);
});
