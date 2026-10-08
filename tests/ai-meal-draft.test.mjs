// Nora drafts a meal plan for a nutritionist (the Ask Nora plan, step 5): the planner over
// Shape's meal library (src/lib/ai/mealDraft.mjs), the draft_meal_plan action end to end
// (preview, confirm, undo, the role gate), and the surfaces that open the saved draft.
// The chat route's gate is driven in tests/support-chat-route.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MEAL_LIBRARY, PHASES, SLOTS, SLOT_FOODS, DRAFT_NOTICE, SCALE_MIN, SCALE_MAX, cleanMealBrief, pickMeals, buildMealDoc, mealDraftDiff, dayTotals, draftName, scaleMeal,
} from '../src/lib/ai/mealDraft.mjs';
import { createRegistry, proposeChange, confirmChange, undoChange, inMemoryAudit, verifyToken } from '../src/lib/ai/proposals.mjs';
import { NORA_ACTIONS } from '../src/lib/ai/actions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DashMeals = createRequire(import.meta.url)('../public/newdesign/dashMealCore.js');
const byId = new Map(MEAL_LIBRARY.map((f) => [f.id, f]));
const SECRET = 'test-secret';

test('the library IS the builder\'s: every food, macro, tag and ingredient, and the phase targets', () => {
  assert.deepEqual(MEAL_LIBRARY, DashMeals.FOODS);
  for (const g of DashMeals.GOAL_PHASES) assert.deepEqual(PHASES[g.key].targets, g.targets, g.key);
  assert.deepEqual(SLOTS, DashMeals.SLOTS);
  for (const [slot, ids] of Object.entries(SLOT_FOODS)) for (const id of ids) assert.ok(byId.has(id), `${slot}: ${id}`);
  // Portions scale by the builder's own arithmetic.
  const meal = { ...DashMeals.newMeal(byId.get('f5'), 'Lunch'), swaps: [{ name: 'Tofu bowl', kcal: 500, p: 30, c: 60, f: 12 }] };
  for (const k of [0.6, 1.05, 1.6]) assert.deepEqual(scaleMeal(meal, k), DashMeals.scaleMeal(meal, k), `×${k}`);
});

test('the brief: only what they said; a misheard number is dropped, never clamped', () => {
  const b = cleanMealBrief({});
  assert.equal(b.goalPhase, 'maintain');
  assert.deepEqual(b.targets, PHASES.maintain.targets);
  assert.deepEqual(b.stated, []);
  assert.equal(b.days, 3);
  assert.deepEqual(b.slots, SLOTS);
  const c = cleanMealBrief({ goalPhase: 'cut', kcal: 1800, protein: '170', carbs: 9000, days: 12, slots: ['dinner', 'Breakfast', 'brunch'], exclude: ['Dairy', ' nuts ', 'x', 'dairy'], maxPrepMinutes: 15, name: '  Spring  cut  ' });
  assert.deepEqual(c.targets, { kcal: 1800, p: 170, c: PHASES.cut.targets.c, f: PHASES.cut.targets.f });
  assert.deepEqual(c.stated, ['kcal', 'p']);
  assert.equal(c.days, 3, '12 days is out of range: the default, not 7');
  assert.deepEqual(c.slots, ['Breakfast', 'Dinner'], 'in the day\'s order');
  assert.deepEqual(c.exclusions, ['dairy', 'nuts']);
  assert.equal(c.maxPrep, 15);
  assert.equal(c.proteinFloor, 170, 'a protein they gave is the floor');
  assert.equal(c.name, 'Spring cut');
  assert.equal(cleanMealBrief({ goalPhase: 'bulk' }).goalPhase, 'maintain');
});

test('the picks: every meal from its slot\'s list, inside what was left out, varied, each day near its targets', () => {
  for (const phase of ['cut', 'maintain', 'build']) {
    const brief = cleanMealBrief({ goalPhase: phase, days: 5 });
    const a = pickMeals(brief);
    assert.deepEqual(a, pickMeals(brief), 'the same brief, the same plan');
    assert.equal(a.days.length, 5);
    const doc = buildMealDoc(brief, a, 'p');
    a.days.forEach((day, d) => {
      assert.deepEqual(day.meals.map((m) => m.slot), SLOTS);
      day.meals.forEach((m) => assert.ok(SLOT_FOODS[m.slot].includes(m.id), `${m.slot} ${m.id}`));
      assert.ok(day.scale >= SCALE_MIN && day.scale <= SCALE_MAX && Math.round(day.scale * 20) === day.scale * 20, `a portion factor in range, to 0.05: ${day.scale}`);
      const tot = dayTotals(doc.days[d].slots);
      assert.ok(Math.abs(tot.kcal - brief.targets.kcal) / brief.targets.kcal < 0.04, `${phase} day ${d}: ${tot.kcal} kcal against ${brief.targets.kcal}`);
      assert.ok(tot.p >= brief.targets.p * 0.85, `${phase} day ${d}: ${tot.p} g protein against ${brief.targets.p}`);
    });
    for (let d = 1; d < 5; d += 1) assert.notDeepEqual(a.days[d].meals.map((m) => m.id), a.days[d - 1].meals.map((m) => m.id), 'no day repeats the one before');
    assert.ok(new Set(a.days.flatMap((d) => d.meals.map((m) => m.id))).size >= 10, 'the rotation varies');
  }

  // ⚠ THE DAY AFTER COSTS MORE: with only lunch and dinner, a Build week repeats yesterday's
  // meals once a reuse costs no more than any other day's (measured on the planner).
  const two = pickMeals(cleanMealBrief({ goalPhase: 'build', days: 5, slots: ['Lunch', 'Dinner'] }));
  for (let d = 1; d < 5; d += 1) two.days[d].meals.forEach((m, j) => assert.notEqual(m.id, two.days[d - 1].meals[j].id, `day ${d} ${m.slot} repeats the day before`));
  // ⚠ THE PORTION FACTOR IS BOUNDED: a snack alone cannot be scaled to a whole day.
  const snack = cleanMealBrief({ kcal: 5000, slots: ['Snack'], days: 1 });
  const snackPick = pickMeals(snack);
  assert.equal(snackPick.days[0].scale, SCALE_MAX);
  const snackMeal = buildMealDoc(snack, snackPick, 'p').days[0].slots[0];
  assert.equal(snackMeal.kcal, Math.round(byId.get(snackPick.days[0].meals[0].id).kcal * SCALE_MAX), 'short of the target, and the card says so');

  const noDairy = pickMeals(cleanMealBrief({ exclude: ['dairy'], days: 3 }));
  const picked = noDairy.days.flatMap((d) => d.meals).map((m) => byId.get(m.id));
  assert.ok(picked.every((f) => !f.tags.includes('dairy')), 'nothing tagged dairy');
  assert.ok(picked.every((f) => !f.packaged), '⚠ a packaged food is never served once anything is excluded');
  assert.deepEqual(noDairy.missing, ['Breakfast'], 'every library breakfast holds dairy: the slot is named, not filled with a guess');
  const quick = pickMeals(cleanMealBrief({ maxPrepMinutes: 10, days: 2 }));
  assert.ok(quick.days.flatMap((d) => d.meals).every((m) => byId.get(m.id).prepMin <= 10));
  const byName = pickMeals(cleanMealBrief({ exclude: ['rice'], days: 2 }));
  assert.ok(byName.days.flatMap((d) => d.meals).every((m) => !byId.get(m.id).ingredients.some((x) => /rice/i.test(x.name))), 'an exclusion matches an ingredient too');
});

test('the document is the builder\'s own: its helpers total it, check it and assign it', () => {
  const brief = cleanMealBrief({ goalPhase: 'build', days: 2, kcal: 2700 });
  const picked = pickMeals(brief);
  const doc = buildMealDoc(brief, picked, '1234abcd-0000-4000-8000-000000000000');
  assert.deepEqual(doc, buildMealDoc(brief, picked, '1234abcd-0000-4000-8000-000000000000'), 'the token rebuilds exactly the card');
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.targets, brief.targets);
  assert.deepEqual(doc.days.map((d) => d.name), ['Day A', 'Day B']);
  const meal = doc.days[0].slots[0];
  const food = byId.get(picked.days[0].meals[0].id);
  const lib = DashMeals.scaleMeal({ ...DashMeals.newMeal(food, meal.slot), id: meal.id }, picked.days[0].scale);
  assert.deepEqual(meal, lib, 'the library\'s meal at the day\'s portion factor, nothing else');
  assert.match(meal.id, /^nora-1234abcd-0-0$/);
  assert.deepEqual(DashMeals.mealsTotals(doc.days[0].slots), dayTotals(doc.days[0].slots));
  assert.ok(Array.isArray(DashMeals.checkConstraints(doc, doc.days[0].slots)));
  const assignment = DashMeals.buildMealAssignment(doc, { weekStart: '2026-10-12' });
  assert.ok(assignment && Array.isArray(assignment.days) && assignment.days.length, 'the builder can assign it');
  assert.equal(draftName(brief), 'Build · 2-day rotation');
});

test('the card says where every meal and target came from', () => {
  const brief = cleanMealBrief({ goalPhase: 'cut', kcal: 1800, exclude: ['dairy'], days: 2 });
  const picked = pickMeals(brief);
  const rows = mealDraftDiff(brief, buildMealDoc(brief, picked, 'p'), picked);
  assert.deepEqual(rows[0], { label: 'Source', after: DRAFT_NOTICE });
  assert.match(rows[1].after, /^1800 kcal · 165 P · 170 C · 60 F \(yours: kcal; Cut defaults for the rest\)$/);
  assert.ok(rows.some((r) => r.label === 'Leaves out' && r.after === 'dairy'));
  assert.ok(rows.some((r) => r.label === 'Not filled' && /^Breakfast: /.test(r.after)));
  assert.ok(rows.some((r) => r.label === 'Day A' && /kcal · \d+ P · \d+ C · \d+ F( · portions ×[\d.]+)?$/.test(r.after)));
  const big = cleanMealBrief({ goalPhase: 'build', days: 1 });
  const bigPick = pickMeals(big);
  assert.match(mealDraftDiff(big, buildMealDoc(big, bigPick, 'p'), bigPick).find((r) => r.label === 'Day A').after, new RegExp(`portions ×${bigPick.days[0].scale}$`), 'a scaled day says so');
  assert.ok(rows.every((r) => !('before' in r)), 'lines, not changes');
  const none = cleanMealBrief({});
  assert.match(mealDraftDiff(none, buildMealDoc(none, pickMeals(none), 'p'), pickMeals(none))[1].after, /the builder's Maintain defaults; edit them there/);
});

// ── The action ───────────────────────────────────────────────────────────────────
function db({ coachOn = true, deleted = [{ id: 'row' }] } = {}) {
  const calls = { rpc: [], deletes: [] };
  return {
    _calls: calls,
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: name === 'is_coach_on_client' ? coachOn : null, error: null }; },
    from(table) {
      const st = { table, filters: {}, contains: null, containedBy: null };
      const c = {
        delete() { return c; },
        eq(k, v) { st.filters[k] = v; return c; },
        contains(k, v) { st.contains = { k, v }; return c; },
        containedBy(k, v) { st.containedBy = { k, v }; return c; },
        select() { calls.deletes.push(st); return Promise.resolve({ data: deleted, error: null }); },
      };
      return c;
    },
  };
}
const registry = () => { const r = createRegistry(); for (const a of NORA_ACTIONS) r.define(a.name, a); return r; };
const actor = { id: 'nutri-1', role: 'nutritionist' };
const ctxFor = (supabase, { role = 'nutritionist', roles, call = () => ({ ok: true, status: 200, data: { plan: {} } }) } = {}) => {
  const calls = [];
  return { actor: { id: 'nutri-1', role, ...(roles ? { roles } : {}) }, supabase, _calls: calls, call: async (m, p, b) => { calls.push({ method: m, path: p, body: b }); return call(m, p, b); } };
};

test('draft_meal_plan · preview writes nothing; confirm saves exactly the card, unpublished; undo only an untouched save', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const supabase = db();
  const ctx = ctxFor(supabase);
  const p = await proposeChange({ registry: reg, action: 'draft_meal_plan', input: { goalPhase: 'cut', kcal: 1900, days: 3, exclude: ['shellfish'], clientId: 'client-4', clientName: 'Priya' }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true, p.message);
  assert.equal(ctx._calls.length, 0, 'nothing written at preview');
  assert.match(p.preview.summary, /^Draft "Cut · 3-day rotation" for Priya and save it to your meal plans, unpublished, to edit and assign in the builder$/);
  const plan = verifyToken(p.token, SECRET);
  const { planId } = plan.confirmedPayload;
  assert.deepEqual(p.preview.open, { kind: 'coach_plan', planId, clientId: 'client-4', url: `/newdesign/NutritionistApp.html#plans?plan=${planId}&client=client-4` });
  assert.deepEqual(supabase._calls.rpc, [{ name: 'is_coach_on_client', args: { p_client_id: 'client-4' } }], 'the client is checked, never guessed');

  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true, c.message);
  const post = ctx._calls[0];
  assert.equal(post.path, '/api/coach/plans');
  assert.equal(post.body.kind, 'meal_plan');
  assert.equal(post.body.published, false, 'a draft, never live');
  assert.equal(post.body.id, planId);
  assert.equal(post.body.expectedOwnerId, 'nutri-1');
  assert.equal(post.body.meta, '3-day rotation · 1900 kcal');
  const expected = buildMealDoc(plan.confirmedPayload.brief, plan.confirmedPayload.picked, planId);
  assert.deepEqual(post.body.detail, { mealBuilder: expected }, 'what lands is what the card showed');
  assert.ok(expected.days.every((d) => d.slots.every((m) => !/shrimp/i.test(m.name))), 'what was left out stays out');
  assert.ok(!ctx._calls.some((x) => x.path === '/api/nutritionist/meal-plan'), 'never assigned from here');

  const u = await undoChange({ registry: reg, auditId: c.auditId, actor, ctx, audit });
  assert.equal(u.ok, true, u.message);
  const del = supabase._calls.deletes[0];
  assert.deepEqual(del.filters, { id: planId, owner_id: 'nutri-1', kind: 'meal_plan', published: false });
  assert.deepEqual(del.contains, { k: 'detail', v: { mealBuilder: expected } });
  assert.deepEqual(del.containedBy, { k: 'detail', v: { mealBuilder: expected } }, '⚠ the row must still hold exactly the saved draft');
});

test('draft_meal_plan · an edited or published draft is not undone; a stranger client is refused; nothing fits is said', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const ctx = ctxFor(db({ deleted: [] }));
  const p = await proposeChange({ registry: reg, action: 'draft_meal_plan', input: {}, actor, ctx, secret: SECRET });
  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  await assert.rejects(undoChange({ registry: reg, auditId: c.auditId, actor, ctx, audit }), /Changed since — nothing undone/);
  const stranger = await proposeChange({ registry: reg, action: 'draft_meal_plan', input: { clientId: 'x', clientName: 'Sam' }, actor, ctx: ctxFor(db({ coachOn: false })), secret: SECRET });
  assert.equal(stranger.ok, false);
  assert.match(stranger.message, /not an active coach on this client/);
  const nothing = await proposeChange({ registry: reg, action: 'draft_meal_plan', input: { slots: ['Breakfast'], exclude: ['dairy'] }, actor, ctx, secret: SECRET });
  assert.equal(nothing.ok, false);
  assert.match(nothing.message, /No meal in Shape's library fits/);
});

test('draft_meal_plan · nutrition roles only, held roles counted: a trainer or a member cannot propose it', async () => {
  for (const role of ['trainer', 'client']) {
    const r = await proposeChange({ registry: registry(), action: 'draft_meal_plan', input: {}, actor: { id: 'x', role }, ctx: ctxFor(db(), { role }), secret: SECRET });
    assert.equal(r.error, 'role_not_allowed', role);
  }
  const dual = await proposeChange({ registry: registry(), action: 'draft_meal_plan', input: {}, actor: { id: 'x', role: 'trainer', roles: ['trainer', 'dietitian'] }, ctx: ctxFor(db(), { role: 'trainer', roles: ['trainer', 'dietitian'] }), secret: SECRET });
  assert.equal(dual.ok, true, 'a trainer who is also a dietitian drafts');
});

// ── The surfaces ─────────────────────────────────────────────────────────────────
test('the website builder opens ?plan= once the library holds it; the app takes a nutritionist to Plans', () => {
  const W = read('public/newdesign/dashMealBuilder.jsx');
  const open = W.slice(W.indexOf('// A draft Nora just saved opens straight in the builder'), W.indexOf('// A plan saved on the phone shows up here'));
  assert.match(open, /const openPlan = typeof dashRouteParam === "function" \? dashRouteParam\("plan"\) : null;/);
  assert.match(open, /if \(found\) \{ openedPlan\.current = openPlan; setView\(\{ template: found \}\); return; \}/);
  assert.match(open, /if \(openRetried\.current !== openPlan\) \{ openRetried\.current = openPlan; setRefresh\(\(n\) => n \+ 1\); return; \}/, 'read once more before saying it is missing');
  const P = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  const nutri = P.slice(P.indexOf('function BSNutritionistAppInner('), P.indexOf('function BSNutriToday('));
  assert.match(nutri, /window\.addEventListener\('shape:openCoachPlan', onOpenPlan\);/);
  assert.match(nutri, /setShowNoraSheet\(false\);\n\s+setTab\('plans'\);/);
});
