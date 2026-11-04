// Nora drafts a nutritionist's PROGRAM or DIET (owner, 2026-11-04: "Nora can't create a nutritionist's
// 'program' or 'diet' yet, only meal plans … can you fix these and make them possible?"): the brief
// (src/lib/ai/nutritionDraft.mjs), the generator's answer read with the app's own parsers, the
// draft_nutrition_program action end to end (preview, confirm, undo, the role gate), and the chat
// route offering and metering it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanNutritionBrief, generatePlanBody, nutritionDraftFrom, nutritionPlanRow, nutritionDraftDiff, withoutClientName, TEMPLATE_LINES, NUTRITION_TEMPLATE_NOTICE, GOALS, DIETS,
} from '../src/lib/ai/nutritionDraft.mjs';
import { createRegistry, proposeChange, confirmChange, undoChange, inMemoryAudit, verifyToken } from '../src/lib/ai/proposals.mjs';
import { NORA_ACTIONS } from '../src/lib/ai/actions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SECRET = 'test-secret';

// What /api/ai/generate-plan answers: the model's draft, or its own template (source 'template').
const ARC = { source: 'openai', draft: { title: 'Habit reset', blocks: [{ title: 'Week 1', detail: 'Reset & habits' }, { title: 'Week 2', detail: 'Build routine' }, { title: 'Week 3', detail: 'Dial macros' }], coachNotes: ['Check allergies first.'] } };
const DIET = { source: 'template', draft: { title: 'Cut diet', blocks: [{ title: 'Breakfast options', detail: 'Oats, eggs, Greek yogurt' }, { title: 'Foods to avoid', detail: 'Fried food, sugary drinks' }] } };

test('the brief: the kind is asked for, the goal and diet are the builder\'s chips, a misheard number is dropped', () => {
  assert.equal(cleanNutritionBrief({}).kind, null, 'no kind: Nora asks');
  const b = cleanNutritionBrief({ kind: 'program', request: '  a 6-week   reset ', goal: 'lose fat', diet: 'plant-based', weeks: 6, kcal: 2100, name: ' Reset ' });
  assert.deepEqual(b, { kind: 'program', request: 'a 6-week reset', name: 'Reset', goal: 'Cut', diet: 'Vegan', weeks: 6, kcal: 2100 });
  assert.deepEqual(GOALS, ['Cut', 'Maintain', 'Lean bulk', 'Performance']);
  assert.deepEqual(DIETS, ['Omnivore', 'Vegetarian', 'Vegan', 'Pescatarian']);
  // The request's words never pick the goal: "build me a diet" is not a bulk.
  const d = cleanNutritionBrief({ kind: 'diet', request: 'build me a diet', weeks: 8, kcal: 99999 });
  assert.equal(d.goal, 'Maintain');
  assert.equal(d.diet, 'Omnivore');
  assert.equal(d.weeks, null, 'a diet has no length');
  assert.equal(d.kcal, null, 'out of range: dropped, not clamped');
  assert.equal(cleanNutritionBrief({ kind: 'program', weeks: 30 }).weeks, 4, 'out of range: the builder\'s four weeks');
  assert.equal(cleanNutritionBrief({ kind: 'meal_plan' }).kind, null, 'a meal plan is draft_meal_plan\'s');
});

test('the generator is asked as the app\'s builder asks it, with no client\'s name', () => {
  const b = cleanNutritionBrief({ kind: 'program', request: 'reset for Priya', goal: 'Cut', diet: 'Vegetarian', weeks: 6, kcal: 1900, clientName: 'Priya' });
  assert.deepEqual(generatePlanBody(b), { kind: 'nutrition_program', goal: 'Cut', client: '', level: 'Vegetarian', duration: '6 weeks', calories: '1900', preferences: 'reset for Priya', protein: '' });
  assert.equal(generatePlanBody(cleanNutritionBrief({ kind: 'diet' })).kind, 'diet');
  assert.equal(generatePlanBody(cleanNutritionBrief({ kind: 'diet' })).duration, '7 days');
});

test('the answer is read with the app\'s parsers: a line a week for a program, the template when it will not parse', () => {
  const prog = cleanNutritionBrief({ kind: 'program', weeks: 3 });
  const a = nutritionDraftFrom(prog, ARC);
  assert.deepEqual(a, { lines: ['Week 1 — Reset & habits', 'Week 2 — Build routine', 'Week 3 — Dial macros'], name: 'Habit reset', note: 'Check allergies first.', source: 'ai', weeks: 3 });
  // A program whose lines are not weeks (or repeat a week) is refused whole: the app's template.
  for (const bad of [{ blocks: [{ title: 'Monday', detail: 'x' }, { title: 'Tuesday', detail: 'y' }] }, { blocks: [{ title: 'Week 1', detail: 'a' }, { title: 'Week 1', detail: 'b' }] }, null]) {
    const t = nutritionDraftFrom(prog, { source: 'openai', draft: bad });
    assert.deepEqual(t.lines, TEMPLATE_LINES.program);
    assert.equal(t.source, 'template');
  }
  // The route's own template parses, and is still a template.
  const diet = nutritionDraftFrom(cleanNutritionBrief({ kind: 'diet' }), DIET);
  assert.deepEqual(diet.lines, ['Breakfast options — Oats, eggs, Greek yogurt', 'Foods to avoid — Fried food, sugary drinks']);
  assert.equal(diet.source, 'template');
  assert.equal(diet.weeks, null, 'a diet has no length');
});

test('a program is as long as the weeks it holds, not the weeks asked for (Codex on #2594)', async () => {
  // The generator answered a four-week request with six weeks (its own duration says six).
  const SIX = { source: 'openai', draft: { title: 'Long reset', duration: '6 weeks', blocks: [1, 2, 3, 4, 5, 6].map((i) => ({ label: `W${i}`, title: `Week ${i}`, detail: `Focus ${i}` })) } };
  const b = cleanNutritionBrief({ kind: 'program', weeks: 4 });
  const d = nutritionDraftFrom(b, SIX);
  assert.equal(d.weeks, 6);
  assert.equal(nutritionPlanRow(b, d, 'x').meta, 'program · 6 weeks · omnivore');
  assert.equal(nutritionDraftDiff(b, d).find((r) => r.label === 'Length').after, '6 weeks (asked for 4)');
  // Counted as the builder counts it: the highest week a line states.
  const gap = nutritionDraftFrom(b, { source: 'openai', draft: { blocks: [{ title: 'Week 1', detail: 'Base' }, { title: 'Week 6', detail: 'Peak' }] } });
  assert.equal(gap.weeks, 6);
  // The starting template is four weeks, whatever was asked.
  const eight = cleanNutritionBrief({ kind: 'program', weeks: 8 });
  const t = nutritionDraftFrom(eight, { source: 'openai', draft: { blocks: [{ title: 'nope' }] } });
  assert.equal(t.weeks, 4);
  assert.equal(nutritionPlanRow(eight, t, 'x').meta, 'program · 4 weeks · omnivore');
  // As asked: the card says the length alone.
  const asked = nutritionDraftFrom(cleanNutritionBrief({ kind: 'program', weeks: 3 }), ARC);
  assert.equal(nutritionDraftDiff(cleanNutritionBrief({ kind: 'program', weeks: 3 }), asked).find((r) => r.label === 'Length').after, '3 weeks');
  // And Nora is told to say so when it differs.
  const reg = registry();
  const prop = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { kind: 'program', request: 'a reset', weeks: 4 }, actor, ctx: ctxFor(db(), { generated: SIX }), secret: SECRET });
  assert.equal(prop.ok, true, prop.message);
  assert.match(prop.preview.note, /The builder drafted 6 weeks, not the 4 asked for: say so\./);
  assert.equal(verifyToken(prop.token, SECRET).confirmedPayload.row.meta, 'program · 6 weeks · omnivore');
  const same = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { kind: 'program', request: 'a reset', weeks: 3 }, actor, ctx: ctxFor(db(), { generated: ARC }), secret: SECRET });
  assert.equal(same.ok, true, same.message);
  assert.doesNotMatch(same.preview.note, /The builder drafted/);
});

test('the saved row is the app\'s own document for the kind; the card shows every line and where it came from', () => {
  const b = cleanNutritionBrief({ kind: 'program', goal: 'Cut', diet: 'Vegan', weeks: 3, kcal: 1900 });
  const d = nutritionDraftFrom(b, ARC);
  const row = nutritionPlanRow(b, d, 'plan-1');
  assert.deepEqual(row, {
    id: 'plan-1', kind: 'meal_plan', name: 'Habit reset', meta: 'program · 3 weeks · 1900 kcal · vegan',
    detail: { buildType: 'program', goal: 'Cut', diet: 'Vegan', cals: '~1900', blocks: d.lines.map((text, i) => ({ id: `b${i}`, text })), note: 'Check allergies first.', media: [] },
  });
  assert.equal(nutritionPlanRow(cleanNutritionBrief({ kind: 'diet', name: 'Keto week' }), nutritionDraftFrom(cleanNutritionBrief({ kind: 'diet' }), DIET), 'x').name, 'Keto week', 'their name first');
  assert.equal(nutritionPlanRow(cleanNutritionBrief({ kind: 'diet' }), { lines: ['a', 'b'], name: '', note: '', source: 'template' }, 'x').name, 'Maintain diet');
  const diff = nutritionDraftDiff(b, d);
  assert.deepEqual(diff.slice(0, 5).map((r) => r.label), ['Source', 'Goal', 'Diet', 'Length', 'Calories']);
  assert.deepEqual(diff.slice(5).map((r) => r.after), d.lines);
  assert.equal(nutritionDraftDiff(b, { ...d, source: 'template' })[0].after, NUTRITION_TEMPLATE_NOTICE);
});

// ── The action ─────────────────────────────────────────────────────────────────────
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
const ctxFor = (supabase, { role = 'nutritionist', roles, generated = ARC, generateOk = true } = {}) => {
  const calls = [];
  const call = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/api/ai/generate-plan') return generateOk ? { ok: true, status: 200, data: generated } : { ok: false, status: 403, data: { error: 'Coach access required.' } };
    return { ok: true, status: 200, data: { plan: {} } };
  };
  return { actor: { id: 'nutri-1', role, ...(roles ? { roles } : {}) }, supabase, _calls: calls, call };
};

test('draft_nutrition_program · the preview only asks the generator; confirm saves the card, unpublished; undo only an untouched save', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const supabase = db();
  const ctx = ctxFor(supabase);
  const p = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { kind: 'program', request: 'a 3-week habit reset', goal: 'Cut', weeks: 3, clientId: 'client-4', clientName: 'Priya' }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true, p.message);
  assert.deepEqual(ctx._calls.map((c) => [c.method, c.path]), [['POST', '/api/ai/generate-plan']], 'the generator, and nothing written');
  assert.equal(ctx._calls[0].body.client, '', 'no client\'s name to the model');
  // A program is published, never assigned: the card promises no Assign (Codex on #2594).
  assert.equal(p.preview.summary, 'Draft "Habit reset" for Priya and save it to your programs in the Shape app, unpublished, to edit and publish there');
  assert.match(p.preview.note, /A program is not assigned to a client; never say it can be\./);
  const plan = verifyToken(p.token, SECRET);
  const { planId, row } = plan.confirmedPayload;
  assert.deepEqual(p.preview.open, { kind: 'coach_plan', planKind: 'meal_plan', planId, clientId: 'client-4' }, 'the app opens it; no website link');
  assert.deepEqual(supabase._calls.rpc, [{ name: 'is_coach_on_client', args: { p_client_id: 'client-4' } }], 'the client is checked, never guessed');
  assert.match(p.preview.note, /never add a line, a meal or a number of your own/);
  assert.match(p.preview.note, /holds no meals/);

  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true, c.message);
  const post = ctx._calls[1];
  assert.equal(ctx._calls.length, 2, 'the generator is not asked again');
  assert.equal(post.path, '/api/coach/plans');
  assert.deepEqual(post.body, { id: planId, kind: 'meal_plan', name: row.name, meta: row.meta, published: false, expectedOwnerId: 'nutri-1', detail: row.detail });
  assert.equal(post.body.detail.buildType, 'program', 'listed under Programs');
  assert.deepEqual(post.body.detail.blocks.map((b) => b.text), ['Week 1 — Reset & habits', 'Week 2 — Build routine', 'Week 3 — Dial macros']);

  const u = await undoChange({ registry: reg, auditId: c.auditId, actor, ctx, audit });
  assert.equal(u.ok, true, u.message);
  const del = supabase._calls.deletes[0];
  assert.deepEqual(del.filters, { id: planId, owner_id: 'nutri-1', kind: 'meal_plan', published: false });
  assert.deepEqual(del.contains, { k: 'detail', v: row.detail });
  assert.deepEqual(del.containedBy, { k: 'detail', v: row.detail }, 'only the document it saved, untouched');

  // Edited or published since: nothing matches, and it says so.
  const ctx2 = ctxFor(db({ deleted: [] }));
  const p2 = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { kind: 'diet', request: 'keto' }, actor, ctx: ctx2, secret: SECRET });
  const c2 = await confirmChange({ registry: reg, token: p2.token, actor, ctx: ctx2, secret: SECRET, audit });
  await assert.rejects(undoChange({ registry: reg, auditId: c2.auditId, actor, ctx: ctx2, audit }), /Changed since — nothing undone/);
});

test('draft_nutrition_program · a template says so; no kind, a client not theirs, or a refused generator drafts nothing', async () => {
  const reg = registry();
  const t = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { kind: 'diet', request: 'a cut diet', goal: 'Cut' }, actor, ctx: ctxFor(db(), { generated: DIET }), secret: SECRET });
  assert.equal(t.ok, true, t.message);
  assert.match(t.preview.summary, /^Template · Draft "Cut diet" and save it to your diets in the Shape app, unpublished, to edit there, and to assign once each day has a menu$/);
  assert.match(t.preview.note, /only once they have written a menu for every day in its editor; until then it is a guide/);
  assert.match(t.preview.note, /This is a TEMPLATE, not an AI draft/);
  assert.equal(verifyToken(t.token, SECRET).confirmedPayload.row.detail.buildType, 'diet', 'listed under Diet');

  const noKind = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { request: 'something' }, actor, ctx: ctxFor(db()), secret: SECRET });
  assert.equal(noKind.ok, false);
  assert.match(noKind.message, /program .* or a diet/);
  const stranger = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { kind: 'program', request: 'x', clientId: 'c-9', clientName: 'Sam' }, actor, ctx: ctxFor(db({ coachOn: false })), secret: SECRET });
  assert.equal(stranger.ok, false);
  const refusedCtx = ctxFor(db(), { generateOk: false });
  const refused = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { kind: 'program', request: 'x' }, actor, ctx: refusedCtx, secret: SECRET });
  assert.equal(refused.ok, false);
  assert.match(refused.message, /Coach access required/, 'the route\'s own words');
  assert.ok(!refusedCtx._calls.some((c) => c.path === '/api/coach/plans'), 'nothing saved');
});

test('draft_nutrition_program · nutrition roles only, held roles counted', async () => {
  for (const role of ['trainer', 'client']) {
    const r = await proposeChange({ registry: registry(), action: 'draft_nutrition_program', input: { kind: 'diet', request: 'x' }, actor: { id: 'x', role }, ctx: ctxFor(db(), { role }), secret: SECRET });
    assert.equal(r.error, 'role_not_allowed', role);
  }
  const dual = await proposeChange({ registry: registry(), action: 'draft_nutrition_program', input: { kind: 'diet', request: 'x' }, actor: { id: 'x', role: 'trainer', roles: ['trainer', 'dietitian'] }, ctx: ctxFor(db(), { role: 'trainer', roles: ['trainer', 'dietitian'] }), secret: SECRET });
  assert.equal(dual.ok, true, 'a trainer who is also a dietitian drafts');
});

test('the chat route offers it to nutrition roles beside draft_meal_plan, says when to use it, and meters it', () => {
  const R = read('src/app/api/support/chat/route.ts');
  const tools = R.slice(R.indexOf('const NUTRITION_TOOLS = ['), R.indexOf('const NUTRITION_PROMPT_NOTE'));
  assert.match(tools, /name: 'draft_meal_plan'/);
  assert.match(tools, /name: 'draft_nutrition_program'/);
  assert.match(tools, /kind: \{ type: 'string', enum: \['program', 'diet'\]/);
  assert.match(tools, /required: \['kind', 'request'\]/);
  const note = R.slice(R.indexOf('const NUTRITION_PROMPT_NOTE'), R.indexOf("].join(' ');", R.indexOf('const NUTRITION_PROMPT_NOTE')));
  assert.match(note, /call draft_nutrition_program with kind 'program' or 'diet'/);
  assert.match(note, /never write a line, a meal or a number of your own/);
  assert.match(R, /const WRITE_TOOLS = new Set\(\[[^\]]*'draft_nutrition_program'/);
  assert.match(R, /if \(name === 'draft_nutrition_program'\) \{\n\s*const budget = await countBudget\(actor\.supabase, actor\.user\.id, 'draft_program'\);/, 'counted against AI drafting, before the preview');
  assert.match(read('src/lib/ai/noraStatus.mjs'), /draft_nutrition_program: 'draft',/);
});

test('no client\'s name reaches the model, in the coach\'s own words either (Codex on #2594)', async () => {
  assert.equal(withoutClientName('a reset for Priya', 'Priya'), 'a reset for the client');
  assert.equal(withoutClientName('Priya Shah wants fish; Shah hates beans', 'Priya Shah'), 'the client wants fish; the client hates beans', 'the whole name, then each part');
  assert.equal(withoutClientName("for priya's cut", 'Priya'), "for the client's cut", 'whatever its case, a possessive too');
  assert.equal(withoutClientName('Zoë needs a diet', 'Zoë'), 'the client needs a diet', 'a name with an accent');
  assert.equal(withoutClientName('a priyanka-style plan', 'Priya'), 'a priyanka-style plan', 'a word that only starts with it stays');
  assert.equal(withoutClientName('a plan for J.R.', 'J.R.'), 'a plan for the client', 'a name with dots is matched as written');
  assert.equal(withoutClientName('a plan', ''), 'a plan');
  assert.equal(generatePlanBody(cleanNutritionBrief({ kind: 'diet', request: 'keto for Priya' }), { clientName: 'Priya' }).preferences, 'keto for the client');
  // End to end: the generator's body holds no name, the card still says who it is for.
  const reg = registry();
  const ctx = ctxFor(db());
  const p = await proposeChange({ registry: reg, action: 'draft_nutrition_program', input: { kind: 'program', request: 'a 3-week reset for Priya Shah', weeks: 3, clientId: 'client-4', clientName: 'Priya Shah' }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true, p.message);
  const body = ctx._calls.find((c) => c.path === '/api/ai/generate-plan').body;
  assert.equal(body.preferences, 'a 3-week reset for the client');
  assert.doesNotMatch(JSON.stringify(body), /Priya|Shah/);
  assert.match(p.preview.summary, / for Priya Shah /);
});
