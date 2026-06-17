// Nora's action tools through the AI1 scaffold: each previewed change shows the
// permission check, the confirm-before-apply preview, the endpoint call carrying
// the actor's session, the audit row, and a clean undo. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRegistry, proposeChange, confirmChange, undoChange, inMemoryAudit } = require('../src/lib/ai/proposals.mjs');
const { logMealAction, setClientGoalAction, assignWorkoutAction, assignMealPlanAction } = require('../src/lib/ai/actions.mjs');

const SECRET = 'test-secret';

// A chainable Supabase stub: from().select().eq().eq().maybeSingle(),
// from().update().eq().eq(), and rpc().
function supabaseMock({ snapshot = null, coachOnClient = true } = {}) {
  const calls = { updates: [], rpc: [] };
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: snapshot }),
    update: (patch) => { calls.updates.push(patch); return { eq: () => ({ eq: async () => ({}) }) }; },
  };
  return {
    from: () => chain,
    rpc: async (name) => { calls.rpc.push(name); return { data: name === 'is_coach_on_client' ? coachOnClient : null }; },
    _calls: calls,
  };
}
function ctxFor(actor, supabase, callImpl) {
  const calls = [];
  return { actor, supabase, _calls: calls, call: async (method, path, body) => { calls.push({ method, path, body }); return callImpl(method, path, body); } };
}
function registryWith(action) { const r = createRegistry(); r.define(action.name, action); return r; }

test('(a) TIER 1 — client logs a meal: preview → confirm → endpoint → audit → undo', async () => {
  const registry = registryWith(logMealAction);
  const audit = inMemoryAudit();
  const actor = { id: 'client-1', role: 'client' };
  const supabase = supabaseMock({ snapshot: { calories: 1200, protein_g: 90 } });
  const ctx = ctxFor(actor, supabase, () => ({ ok: true, status: 200, data: { ok: true, day: '2026-06-16' } }));

  // PREVIEW (no side effects).
  const p = await proposeChange({ registry, action: 'log_meal', input: { kcal: 600, protein: 45, mealName: 'lunch' }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true);
  assert.equal(p.requiresConfirm, true);
  assert.match(p.preview.summary, /Log lunch to today/);
  const cal = p.preview.diff.find((d) => d.field === 'calories');
  assert.equal(cal.before, '1200 kcal');
  assert.equal(cal.after, '1800 kcal'); // 1200 + 600
  assert.equal(ctx._calls.length, 0, 'no endpoint call on preview');
  assert.equal(audit._rows.length, 0, 'nothing audited on preview');

  // CONFIRM → executes via the existing endpoint, writes one audit row.
  const c = await confirmChange({ registry, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true);
  assert.equal(ctx._calls[0].method, 'POST');
  assert.equal(ctx._calls[0].path, '/api/nutrition/meal-log');
  assert.deepEqual(ctx._calls[0].body, { kcal: 600, protein: 45 });
  assert.equal(audit._rows.length, 1);
  assert.equal(audit._rows[0].action, 'log_meal');
  assert.equal(audit._rows[0].source, 'nora');
  assert.equal(audit._rows[0].target.userId, 'client-1');

  // UNDO → restores the prior snapshot macros.
  await undoChange({ registry, auditId: c.auditId, actor, ctx, audit });
  assert.equal(supabase._calls.updates.length, 1);
  assert.equal(supabase._calls.updates[0].calories, 1200);
  assert.equal(supabase._calls.updates[0].protein_g, 90);
  assert.equal(audit._rows[0].status, 'undone');
});

test('(b) TIER 2 — coach sets a client goal: permission → preview → endpoint → audit → undo', async () => {
  const registry = registryWith(setClientGoalAction);
  const audit = inMemoryAudit();
  const actor = { id: 'coach-1', role: 'trainer' };
  const supabase = supabaseMock({ coachOnClient: true });
  let goals = [{ label: 'Bench', target: 200, unit: 'lb', setBy: 'coach' }];
  const ctx = ctxFor(actor, supabase, (m, p, b) => {
    if (m === 'GET' && /\/goals$/.test(p)) return { ok: true, status: 200, data: { ok: true, goals } };
    if (m === 'POST' && /\/goals$/.test(p)) { goals = b.goals; return { ok: true, status: 200, data: { ok: true, goals } }; }
    return { ok: false, status: 404, data: {} };
  });

  const p = await proposeChange({ registry, action: 'set_client_goal', input: { clientId: 'client-9', clientName: 'Priya', goal: { label: 'Goal weight', target: 145, unit: 'lb' } }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true);
  // permission check ran (is_coach_on_client) BEFORE any write
  assert.ok(supabase._calls.rpc.includes('is_coach_on_client'));
  assert.match(p.preview.summary, /Priya.*Goal weight.*145/);
  assert.equal(audit._rows.length, 0);

  const c = await confirmChange({ registry, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true);
  assert.deepEqual(goals.map((g) => g.label), ['Bench', 'Goal weight']); // executed via endpoint
  assert.equal(audit._rows.length, 1);
  assert.equal(audit._rows[0].action, 'set_client_goal');
  assert.equal(audit._rows[0].target.userId, 'client-9');

  await undoChange({ registry, auditId: c.auditId, actor, ctx, audit });
  assert.deepEqual(goals.map((g) => g.label), ['Bench']); // restored to before
  assert.equal(audit._rows[0].status, 'undone');
});

test('role gate: a client cannot even PROPOSE a coach action', async () => {
  const registry = registryWith(setClientGoalAction);
  const r = await proposeChange({ registry, action: 'set_client_goal', input: { clientId: 'x', goal: { target: 1 } }, actor: { id: 'c', role: 'client' }, ctx: {}, secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'role_not_allowed');
});

test('permission backstop: a coach NOT on the client is refused (is_coach_on_client) — no write', async () => {
  const registry = registryWith(setClientGoalAction);
  const supabase = supabaseMock({ coachOnClient: false });
  const ctx = ctxFor({ id: 'coach-2', role: 'trainer' }, supabase, () => ({ ok: true, status: 200, data: {} }));
  const r = await proposeChange({ registry, action: 'set_client_goal', input: { clientId: 'not-mine', goal: { label: 'X', target: 1 } }, actor: { id: 'coach-2', role: 'trainer' }, ctx, secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'preview_failed');
  assert.match(r.message, /not an active coach/);
  assert.equal(ctx._calls.length, 0, 'no endpoint call when refused');
});

test('never guess: an unmatched client reference asks instead of acting', async () => {
  const registry = registryWith(setClientGoalAction);
  const ctx = ctxFor({ id: 'coach-3', role: 'nutritionist' }, supabaseMock({}), () => ({ ok: true, status: 200, data: {} }));
  const r = await proposeChange({ registry, action: 'set_client_goal', input: { clientName: 'someone', goal: { target: 1 } /* no clientId */ }, actor: { id: 'coach-3', role: 'nutritionist' }, ctx, secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'preview_failed');
  assert.match(r.message, /Which client/);
});

test('nothing to log is refused with a clear ask', async () => {
  const registry = registryWith(logMealAction);
  const ctx = ctxFor({ id: 'client-1', role: 'client' }, supabaseMock({ snapshot: null }), () => ({ ok: true, status: 200, data: {} }));
  const r = await proposeChange({ registry, action: 'log_meal', input: {}, actor: { id: 'client-1', role: 'client' }, ctx, secret: SECRET });
  assert.equal(r.ok, false);
  assert.match(r.message, /what to log/);
});

// ── coach assign tools (write-scope hardening) ──────────────────────────────
// A richer Supabase stub: rpc('is_coach_on_client'), provider-row lookup, the
// current published meal plan, and awaitable update chains (records patch+filters).
function richSupabase2({ coachMap = {}, providerId = 7, prevPlan = null } = {}) {
  const calls = { updates: [], rpc: [] };
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        maybeSingle: async () => {
          if (table === 'trainers' || table === 'nutritionists') return { data: providerId == null ? null : { id: providerId } };
          if (table === 'client_meal_plans') return { data: prevPlan };
          return { data: null };
        },
        update(patch) {
          const u = { table, patch, filters: {} };
          const up = { eq(c, v) { u.filters[c] = v; return up; }, then(res, rej) { calls.updates.push(u); return Promise.resolve({}).then(res, rej); } };
          return up;
        },
      };
      return chain;
    },
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: name === 'is_coach_on_client' ? coachMap[args.p_client_id] === true : null }; },
    _calls: calls,
  };
}

test('assign_workout: trainer on client → preview → endpoint → audit → undo (archives the assignment)', async () => {
  const registry = registryWith(assignWorkoutAction);
  const audit = inMemoryAudit();
  const actor = { id: 'trainer-1', role: 'trainer' };
  const supabase = richSupabase2({ coachMap: { 'client-9': true }, providerId: 42 });
  let posted = null;
  const ctx = ctxFor(actor, supabase, (m, p, b) => {
    if (m === 'POST' && p === '/api/trainer/workout') { posted = b; return { ok: true, status: 200, data: { ok: true, count: 1 } }; }
    return { ok: false, status: 404, data: {} };
  });

  const p = await proposeChange({ registry, action: 'assign_workout', input: { clientId: 'client-9', clientName: 'Priya', title: 'Upper — push', scheduledDate: '2026-06-20' }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true);
  assert.ok(supabase._calls.rpc.some((r) => r.name === 'is_coach_on_client'));
  assert.match(p.preview.summary, /Assign 'Upper — push' to Priya on 2026-06-20/);
  assert.equal(ctx._calls.length, 0);

  const c = await confirmChange({ registry, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true);
  assert.equal(posted.title, 'Upper — push');
  assert.deepEqual(posted.clientIds, ['client-9']);
  assert.equal(audit._rows[0].action, 'assign_workout');
  assert.equal(audit._rows[0].target.userId, 'client-9');

  await undoChange({ registry, auditId: c.auditId, actor, ctx, audit });
  const u = supabase._calls.updates[0];
  assert.equal(u.table, 'client_workouts');
  assert.equal(u.patch.status, 'archived');
  assert.equal(u.filters.trainer_id, 42);
  assert.equal(u.filters.client_id, 'client-9');
  assert.equal(u.filters.scheduled_date, '2026-06-20');
  assert.equal(audit._rows[0].status, 'undone');
});

test('assign_workout: OUT-OF-SCOPE client rejected AT THE ENDPOINT (403) — execute_failed, no audit', async () => {
  // Front check passes (some coaching link) but the hardened endpoint rejects on
  // the discipline/active-subscription check. Proves the server is the gate.
  const registry = registryWith(assignWorkoutAction);
  const audit = inMemoryAudit();
  const actor = { id: 'trainer-1', role: 'trainer' };
  const supabase = richSupabase2({ coachMap: { 'client-9': true }, providerId: 42 });
  const ctx = ctxFor(actor, supabase, () => ({ ok: false, status: 403, data: { error: 'You can only assign workouts to your own active clients.' } }));

  const p = await proposeChange({ registry, action: 'assign_workout', input: { clientId: 'client-9', clientName: 'Priya', title: 'Upper — push' }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true);
  const c = await confirmChange({ registry, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, false);
  assert.equal(c.error, 'execute_failed');
  assert.match(c.message, /your own active clients/);
  assert.equal(audit._rows.length, 0, 'a rejected endpoint write is never audited');
  assert.equal(supabase._calls.updates.length, 0, 'nothing written');
});

test('assign_workout: a NON-client of this trainer is refused at preview (front check) — no endpoint call', async () => {
  const registry = registryWith(assignWorkoutAction);
  const supabase = richSupabase2({ coachMap: { 'stranger': false }, providerId: 42 });
  const ctx = ctxFor({ id: 'trainer-1', role: 'trainer' }, supabase, () => ({ ok: true, status: 200, data: {} }));
  const r = await proposeChange({ registry, action: 'assign_workout', input: { clientId: 'stranger', title: 'X' }, actor: { id: 'trainer-1', role: 'trainer' }, ctx, secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'preview_failed');
  assert.match(r.message, /not an active coach/);
  assert.equal(ctx._calls.length, 0);
});

test('assign_workout: a nutritionist cannot even propose it (discipline role gate)', async () => {
  const r = await proposeChange({ registry: registryWith(assignWorkoutAction), action: 'assign_workout', input: { clientId: 'c', title: 'X' }, actor: { id: 'n', role: 'nutritionist' }, ctx: {}, secret: SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'role_not_allowed');
});

test('assign_meal_plan: nutritionist on client → preview → endpoint → audit → undo (restores prior plan)', async () => {
  const registry = registryWith(assignMealPlanAction);
  const audit = inMemoryAudit();
  const actor = { id: 'nutri-1', role: 'nutritionist' };
  const supabase = richSupabase2({ coachMap: { 'client-9': true }, providerId: 5, prevPlan: { id: 'plan-old', title: 'Maintain' } });
  let posted = null;
  const ctx = ctxFor(actor, supabase, (m, p, b) => {
    if (m === 'POST' && p === '/api/nutritionist/meal-plan') { posted = b; return { ok: true, status: 200, data: { ok: true, id: 'plan-new' } }; }
    return { ok: false, status: 404, data: {} };
  });

  const p = await proposeChange({ registry, action: 'assign_meal_plan', input: { clientId: 'client-9', clientName: 'Priya', title: 'Cut · week 1', days: [{ d: 'Mon' }, { d: 'Tue' }] }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true);
  assert.match(p.preview.summary, /Assign meal plan 'Cut · week 1' \(2 days\) to Priya/);
  const cell = p.preview.diff[0];
  assert.equal(cell.before, 'Maintain'); // the plan it replaces (real, not invented)
  assert.equal(cell.after, 'Cut · week 1');

  const c = await confirmChange({ registry, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true);
  assert.equal(posted.title, 'Cut · week 1');
  assert.equal(posted.days.length, 2);
  assert.equal(audit._rows[0].action, 'assign_meal_plan');

  await undoChange({ registry, auditId: c.auditId, actor, ctx, audit });
  // archives the new plan, then republishes the prior one (plan-old).
  assert.equal(supabase._calls.updates[0].patch.status, 'archived');
  assert.equal(supabase._calls.updates[1].patch.status, 'published');
  assert.equal(supabase._calls.updates[1].filters.id, 'plan-old');
  assert.equal(audit._rows[0].status, 'undone');
});

test('assign_meal_plan: refuses to INVENT meals — empty days asks instead of acting', async () => {
  const registry = registryWith(assignMealPlanAction);
  const supabase = richSupabase2({ coachMap: { 'client-9': true }, providerId: 5 });
  const ctx = ctxFor({ id: 'nutri-1', role: 'nutritionist' }, supabase, () => ({ ok: true, status: 200, data: {} }));
  const r = await proposeChange({ registry, action: 'assign_meal_plan', input: { clientId: 'client-9', title: 'Cut', days: [] }, actor: { id: 'nutri-1', role: 'nutritionist' }, ctx, secret: SECRET });
  assert.equal(r.ok, false);
  assert.match(r.message, /won't invent the meals/);
  assert.equal(ctx._calls.length, 0);
});
