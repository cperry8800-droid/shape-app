// Meal-builder core tests — node --test, zero deps (same pattern as the
// workout-builder suite). The core is a pure UMD module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DM = require("../public/newdesign/dashMealCore.js");
const { buildMockClients, buildProgrammingQueue } = require("../public/newdesign/dashSignals.js");

const NOW = new Date("2026-06-12T12:00:00");
const food = (id) => DM.FOODS.find((f) => f.id === id);

// ── targets & constraints ───────────────────────────────────────────────────
test("new plan seeds targets from the goal phase, protein floor 20g under", () => {
  const plan = DM.newPlan("Test", "cut");
  assert.deepEqual(plan.targets, { kcal: 1900, p: 165, c: 170, f: 60 });
  assert.equal(plan.constraints.proteinFloor, 145);
  assert.equal(DM.newPlan("B", "build").targets.kcal, 2700);
});

test("food search honours exclusion tags, name matches, and max prep", () => {
  const noShellfish = DM.searchFoods("", { exclusions: ["shellfish"] });
  assert.ok(!noShellfish.some((f) => f.id === "f10"), "shrimp tacos filtered by tag");
  const noChicken = DM.searchFoods("", { exclusions: ["chicken"] });
  assert.ok(!noChicken.some((f) => /chicken/i.test(f.name)), "exclusion also matches names");
  const quick = DM.searchFoods("", { maxPrep: 5 });
  assert.ok(quick.every((f) => f.prepMin == null || f.prepMin <= 5));
  assert.ok(DM.searchFoods("salmon", {}).some((f) => f.id === "f6"));
});

test("constraint check warns when meals sit under the protein floor", () => {
  const plan = DM.newPlan("Test", "cut"); // floor 145
  const low = [DM.newMeal(food("f14"), "Snack")]; // 8 g protein
  assert.match(DM.checkConstraints(plan, low)[0], /under the 145g floor/);
  const fine = [DM.newMeal(food("f5"), "Lunch"), DM.newMeal(food("f6"), "Dinner"), DM.newMeal(food("f4"), "Snack"), DM.newMeal(food("f1"), "Breakfast")];
  assert.deepEqual(DM.checkConstraints(plan, fine), []);
});

// ── variants are first-class overlays ───────────────────────────────────────
const dayWithRest = () => {
  const day = DM.newDay("Day A");
  day.slots = [DM.newMeal(food("f1"), "Breakfast"), DM.newMeal(food("f5"), "Lunch"), DM.newMeal(food("f13"), "Snack")];
  const lunchId = day.slots[1].id;
  const caesar = Object.assign(DM.newMeal(food("f23"), "Lunch"), { id: lunchId });
  day.variants = { rest: { overrides: { [lunchId]: caesar, [day.slots[2].id]: null }, extras: [DM.newMeal(food("f21"), "Snack")] } };
  return day;
};

test("variant resolution: override replaces, null removes, extras append", () => {
  const day = dayWithRest();
  assert.deepEqual(DM.resolveDay(day, "training").map((m) => m.name), [food("f1").name, food("f5").name, food("f13").name]);
  const rest = DM.resolveDay(day, "rest");
  assert.deepEqual(rest.map((m) => m.name), [food("f1").name, food("f23").name, food("f21").name]);
});

test("editing a base meal with apply-to-variants flows into followers", () => {
  const day = dayWithRest();
  const bfastId = day.slots[0].id; // breakfast follows base on the rest variant
  const next = DM.editBaseMeal(day, bfastId, DM.newMeal(food("f17"), "Breakfast"), true);
  assert.equal(DM.resolveDay(next, "rest")[0].name, food("f17").name, "variant follows the edit");
  assert.equal(DM.resolveDay(day, "training")[0].name, food("f1").name, "source day untouched");
});

test("declining apply-to-variants freezes the OLD meal into each variant", () => {
  const day = dayWithRest();
  const bfastId = day.slots[0].id;
  const next = DM.editBaseMeal(day, bfastId, DM.newMeal(food("f17"), "Breakfast"), false);
  assert.equal(DM.resolveDay(next, "training")[0].name, food("f17").name, "base updated");
  assert.equal(DM.resolveDay(next, "rest")[0].name, food("f1").name, "variant keeps the approved old meal");
  // The lunch already had its own override — it must not be clobbered.
  assert.equal(DM.resolveDay(next, "rest")[1].name, food("f23").name);
});

test("hasVariantFollowers flags only meals a variant still inherits", () => {
  const day = dayWithRest();
  assert.equal(DM.hasVariantFollowers(day, day.slots[0].id), true, "breakfast inherited by rest");
  assert.equal(DM.hasVariantFollowers(day, day.slots[1].id), false, "lunch already overridden");
  assert.equal(DM.hasVariantFollowers(DM.newDay("X"), "nope"), false, "no variants at all");
});

// ── macro math ──────────────────────────────────────────────────────────────
test("running totals sum the resolved meals", () => {
  const t = DM.mealsTotals([DM.newMeal(food("f1"), "Breakfast"), DM.newMeal(food("f5"), "Lunch")]);
  assert.deepEqual(t, { kcal: 780, p: 77, c: 77, f: 20 });
});

test("portion scaling (1.2×) scales macros, ingredient quantities, and swaps", () => {
  const m = DM.newMeal(food("f5"), "Lunch"); // 620 kcal, chicken 200 g
  m.swaps = [{ name: "Turkey bowl", kcal: 610, p: 48, c: 66, f: 14 }];
  const s = DM.scaleMeal(m, 1.2);
  assert.equal(s.kcal, 744);
  assert.equal(s.p, 62);
  assert.equal(s.ingredients[0].qty, 240, "chicken 200 g → 240 g");
  assert.equal(s.swaps[0].kcal, 732, "approved alternates scale too");
  assert.equal(m.kcal, 620, "source meal untouched");
});

test("phase shift (−10% carbs) hits every day, variant, extra, swap — and the targets", () => {
  const plan = DM.newPlan("Cut", "cut");
  plan.days = [dayWithRest()];
  plan.days[0].slots[1].swaps = [{ name: "Alt", kcal: 600, p: 40, c: 60, f: 20 }];
  const next = DM.phaseShift(plan, { carbsPct: -10 });
  const before = dayWithRest();
  // Base lunch: 68 c → 61, kcal recomputed 4/4/9.
  const lunch = next.days[0].slots[1];
  assert.equal(lunch.c, 61);
  assert.equal(lunch.kcal, lunch.p * 4 + lunch.c * 4 + lunch.f * 9);
  // Swap shifted the same way.
  assert.equal(lunch.swaps[0].c, 54);
  // Variant override (caesar, 12 c → 11) and extra (bar, 21 c → 19) shifted.
  const restMeals = DM.resolveDay(next.days[0], "rest");
  assert.equal(restMeals[1].c, 11);
  assert.equal(restMeals[2].c, 19);
  // Targets shifted + kcal recomputed; original plan untouched.
  assert.equal(next.targets.c, 153);
  assert.equal(next.targets.kcal, 165 * 4 + 153 * 4 + 60 * 9);
  assert.equal(plan.targets.c, 170);
  assert.equal(plan.days[0].slots[1].c, before.slots[1].c);
});

// ── grocery ─────────────────────────────────────────────────────────────────
test("grocery aggregates shared ingredients across the week (and scales)", () => {
  const dayMeals = [
    [DM.newMeal(food("f5"), "Lunch"), DM.newMeal(food("f6"), "Dinner")], // rice 180 + 180
    [DM.newMeal(food("f8"), "Lunch")], // rice 180
  ];
  const list = DM.buildGrocery(dayMeals, 1);
  const rice = list.find((g) => g.name === "Rice");
  assert.equal(rice.qty, 540);
  assert.equal(rice.unit, "g");
  assert.ok(rice.meals.length >= 2, "lists the meals that use it");
  const sorted = list.map((g) => g.name);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a.localeCompare(b)), "alphabetical");
  const scaled = DM.buildGrocery(dayMeals, 1.2).find((g) => g.name === "Rice");
  assert.equal(scaled.qty, 648);
});

// ── assignment snapshot ─────────────────────────────────────────────────────
test("assignment: 7 days, scaled targets in the client ledger's {cal,p,c,f} shape", () => {
  const plan = DM.newPlan("Cut", "cut");
  plan.days = [dayWithRest()];
  const out = DM.buildMealAssignment(plan, { scale: 1.2, trainingDows: [0, 2, 4] });
  assert.equal(out.days.length, 7);
  assert.deepEqual(out.days.map((d) => d.dow), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(out.days[0].targets, { cal: 2280, p: 198, c: 204, f: 72 });
  // Training dows get the base; the rest get the rest variant.
  assert.equal(out.days[0].tag, "TRAIN");
  assert.equal(out.days[1].tag, "REST");
  assert.equal(out.days[1].meals[1].title, food("f23").name, "rest lunch is the caesar override");
  assert.ok(!out.days[1].meals.some((m) => m.title === food("f13").name), "nulled snack dropped on rest days");
  // Meals carry slot times + grocery-ready ingredient strings + alternates.
  const lunch = out.days[0].meals[1];
  assert.equal(lunch.time, "12:30");
  assert.equal(lunch.ingredients[0].qty, "240 g");
  assert.equal(lunch.ingredients[0].name, "Chicken breast");
  assert.ok(Array.isArray(lunch.alts));
  assert.ok(out.grocery.length > 0, "auto grocery ships with the assignment");
});

test("grocery edits flow through the ingredients (removal + weekly-total rescale)", () => {
  const plan = DM.newPlan("Cut", "cut");
  const day = DM.newDay("Day A");
  day.slots = [DM.newMeal(food("f5"), "Lunch"), DM.newMeal(food("f6"), "Dinner")]; // rice 180 ×2/day
  plan.days = [day];
  const edits = { "rice|g": { qty: 1260 }, "olive oil|ml": { remove: true } }; // auto rice = 2520 g/wk → halve it
  const out = DM.buildMealAssignment(plan, { scale: 1, groceryEdits: edits });
  const rice = out.grocery.find((g) => g.name === "Rice");
  assert.equal(rice.qty, 1260, "grocery total hits the edited amount");
  assert.equal(out.days[0].meals[0].ingredients.find((i) => i.name === "Rice").qty, "90 g", "per-meal ingredient rescaled");
  assert.ok(!out.grocery.some((g) => g.name === "Olive oil"), "removed item gone from the list");
  assert.ok(!out.days[0].meals[0].ingredients.some((i) => i.name === "Olive oil"), "…and from every meal");
});

test("assignment is a snapshot: later template edits never retro-change it", () => {
  const plan = DM.newPlan("Cut", "cut");
  plan.days = [dayWithRest()];
  const out = DM.buildMealAssignment(plan, { scale: 1 });
  const title = out.days[0].meals[1].title;
  plan.days[0].slots[1].name = "CHANGED";
  plan.days[0].slots[1].kcal = 9999;
  assert.equal(out.days[0].meals[1].title, title);
  assert.notEqual(out.days[0].meals[1].kcal, 9999);
});

// ── lifecycle groups ────────────────────────────────────────────────────────
test("lifecycle: intake = new clients, phase change = 50% milestone or near goal, expiring = queue-ready", () => {
  const clients = buildMockClients(NOW);
  const queue = buildProgrammingQueue(clients, NOW);
  const lc = DM.buildPlanLifecycle(clients, queue);
  const names = (l) => l.map((c) => c.profile.name);
  assert.ok(names(lc.intake).includes("Tess B."), "brand-new client waits on intake");
  assert.ok(names(lc.phaseChange).includes("Jordan M."), "50%-to-goal milestone → phase change");
  const readyIds = new Set(queue.filter((r) => r.state === "ready").map((r) => r.client.profile.id));
  assert.ok(lc.expiring.length > 0);
  assert.ok(lc.expiring.every((c) => readyIds.has(c.profile.id)), "expiring mirrors the ready queue");
  assert.ok(!names(lc.phaseChange).includes("Tess B."), "intake clients don't double-list");
});

// ── demo templates ──────────────────────────────────────────────────────────
test("demo templates cover all three phases and exercise the variant model", () => {
  const tpls = DM.demoMealTemplates();
  assert.deepEqual(tpls.map((t) => t.detail.mealBuilder.goalPhase).sort(), ["build", "cut", "maintain"]);
  const cut = tpls.find((t) => t.name.startsWith("Summer Cut"));
  const dayA = cut.detail.mealBuilder.days[0];
  const rest = DM.resolveDay(dayA, "rest");
  assert.ok(rest.some((m) => m.name === food("f23").name), "rest-day lunch override present");
  assert.ok(!rest.some((m) => m.name === food("f13").name), "rest day drops the snack");
  assert.ok(dayA.slots[1].swaps.length >= 1 && dayA.slots[1].swaps.length <= 3, "swap groups capped at 3");
  // Assignment path works end-to-end on a demo template.
  const out = DM.buildMealAssignment(cut.detail.mealBuilder, { scale: 1 });
  assert.equal(out.days.length, 7);
});
