// /api/support/chat, DRIVEN — Nora's tool loop against a scripted model.
//
// ⚠ WHY DRIVEN. Everything this route decides about WHO gets WHAT is invisible
// to a source scan: which tools a request carries (a member's read tools, a
// coach's lookups, an anonymous caller's none), which model the request is
// sent to (the pin for a member, the public model for the open door), that a
// tool call the model makes actually runs against the caller's own client and
// its answer goes back under the same call_id, that the reply reaches the
// bubble as plain text, and that the loop stops. The model is a script: each
// entry answers one callAI, so a test reads the wire body of every round.

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

class SubmoduleStubs extends Map {
  has(k) { return super.has(k) || String(k).startsWith('./ai/'); }
  get(k) { return super.has(k) ? super.get(k) : {}; }
}
const ai = await loadRealModule(join(ROOT, 'src/lib/ai.ts'), { typescript: true, registry: new SubmoduleStubs([['next/server', nextServer]]) });
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const coachCatalog = await loadRealModule(join(ROOT, 'src/lib/coach-catalog.ts'), { typescript: true });
const proposals = await import(join(ROOT, 'src/lib/ai/proposals.mjs'));
const tone = await import(join(ROOT, 'src/lib/ai/tone.mjs'));
const memberContext = await import(join(ROOT, 'src/lib/ai/memberContext.mjs'));
const cookContext = await import(join(ROOT, 'src/lib/ai/cookContext.mjs'));
const actions = await import(join(ROOT, 'src/lib/ai/actions.mjs'));
const replyText = await import(join(ROOT, 'src/lib/ai/replyText.mjs'));
const memberReads = await import(join(ROOT, 'src/lib/ai/memberReads.mjs'));

const ROUTE = 'src/app/api/support/chat/route.ts';
const U = 'member-1';

// Scripted model: `answers[i]` is the payload callAI returns on round i. A
// function_call item is { type:'function_call', call_id, name, arguments }.
function say(text) { return { output_text: text, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }; }
function call(name, args, id = `call_${name}`) { return { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) }; }
function calls(...items) { return { output: [{ type: 'reasoning', id: 'rs_1', summary: [] }, ...items] }; }

// `isCoach`/`isAdmin` default the way membership-core derives them (from the
// role), so a test can also model a DUAL-ROLE account: primary role 'client',
// coach by roles[] — which is what the route must read membership for.
async function loadRoute({ user = { id: U, email: 'm@x' }, role = 'client', isMember = true, isCoach = ['trainer', 'nutritionist', 'dietitian'].includes(role), isAdmin = false, hasKey = true, answers = [say('ok')], tables = {}, rpcs = {}, fail = [] } = {}) {
  const sb = fakeSupabase({ tables, rpcs, fail });
  const calls_ = { ai: [], proposals: [] };
  let i = 0;
  const registry = new Map([
    ['next/server', nextServer],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/coach-catalog', coachCatalog],
    ['@/lib/ai/proposals.mjs', proposals],
    ['@/lib/ai/tone.mjs', tone],
    ['@/lib/ai/memberContext.mjs', memberContext],
    ['@/lib/ai/cookContext.mjs', cookContext],
    ['@/lib/ai/actions.mjs', actions],
    ['@/lib/ai/replyText.mjs', replyText],
    // The REAL readers run against the fake — a stubbed reader would prove
    // only that the route calls a function, not that a member's rows come back.
    ['@/lib/ai/memberReads.mjs', memberReads],
    ['@/lib/membership-core', { computeMembership: async () => ({ isMember, isCoach, isAdmin, isKnownMinor: false }) }],
    ['@/lib/food-search-server', { searchFoodsServer: async () => ({ results: [], unavailable: true }) }],
    ['@/lib/ai', {
      hasOpenAIKey: () => hasKey,
      aiPublicModel: ai.aiPublicModel, // the REAL resolver — the tiering test asserts on its answer
      callAI: async (body, opts) => {
        calls_.ai.push({ body, opts });
        // An answer may carry `fellBack: '<model>'` — callAI reporting that the
        // pin was refused and this payload came from the fallback model.
        const { fellBack = null, ...data } = answers[Math.min(i, answers.length - 1)]; i += 1;
        return { ok: true, data, usage: null, latencyMs: 1, promptId: opts.promptId, model: fellBack || body.model || 'pinned', fellBack: !!fellBack };
      },
    }],
    ['@/lib/ai/server', {
      resolveActor: async () => (user ? { user, role, supabase: sb } : null),
      makeCtx: (actor) => ({ actor: { id: actor.user.id, role: actor.role }, supabase: sb, store: {}, call: async () => ({ ok: true, status: 200, data: {} }) }),
      serverRegistry: proposals.createRegistry(),
      proposalSecret: () => 'test-secret',
      casWriteUserGoals: async () => ({ ok: true }),
      auditSink: () => ({ log: async () => 'audit-1' }),
    }],
  ]);
  const mod = await loadRealModule(join(ROOT, ROUTE), { typescript: true, registry });
  return { mod, calls: calls_, sb };
}
const post = (body, headers = {}) => new Request('https://x/api/support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const ask = (text) => ({ messages: [{ role: 'user', content: text }] });
const toolNames = (body) => (body.tools || []).map((t) => t.name);

const READ_NAMES = ['get_training_plan', 'get_recent_workouts', 'get_week_summary', 'get_habits', 'get_coaching', 'get_reminders', 'get_points'];

test('⚠ WHO GETS WHAT: an anonymous caller gets the base tools on the PUBLIC model; a member gets the read tools on the pin; a coach also gets the lookups', async () => {
  const anon = await loadRoute({ user: null });
  await anon.mod.POST(post(ask('hi')));
  const a = anon.calls.ai[0];
  assert.equal(a.body.model, ai.aiPublicModel(), 'the open door rides the public model');
  for (const n of READ_NAMES) assert.ok(!toolNames(a.body).includes(n), `${n} must not be offered to an anonymous caller`);
  assert.ok(!toolNames(a.body).includes('find_client'));
  assert.ok(toolNames(a.body).includes('recommend_coaches'));

  const member = await loadRoute({});
  await member.mod.POST(post(ask('hi')));
  const m = member.calls.ai[0];
  assert.equal(m.body.model, undefined, 'a member rides the pin (callAI resolves it, and keeps its access fallback)');
  for (const n of READ_NAMES) assert.ok(toolNames(m.body).includes(n), `${n} offered to a member`);
  assert.ok(!toolNames(m.body).includes('find_client'), 'a client is not a coach');
  assert.ok(!toolNames(m.body).includes('get_client_snapshot'));
  assert.equal(m.opts.effort, 'low');
  assert.equal(m.opts.verbosity, 'low');
  assert.equal(m.opts.promptId, 'support.chat');
  assert.equal(typeof m.body.max_output_tokens, 'number');
  const sys = m.body.input[0].content;
  assert.match(sys, /LOOKUPS:/);
  assert.match(sys, /No markdown/);
  assert.match(sys, /THE READ TOOLS ARE AVAILABLE/);

  const coach = await loadRoute({ role: 'trainer' });
  await coach.mod.POST(post(ask('hi')));
  const c = coach.calls.ai[0];
  assert.ok(toolNames(c.body).includes('find_client'));
  assert.ok(toolNames(c.body).includes('get_client_snapshot'));
  // A signed-in NON-member: no read tools, and the public model.
  const prospect = await loadRoute({ isMember: false });
  await prospect.mod.POST(post(ask('hi')));
  const p = prospect.calls.ai[0];
  assert.equal(p.body.model, ai.aiPublicModel());
  for (const n of READ_NAMES) assert.ok(!toolNames(p.body).includes(n));
  assert.ok(!/LOOKUPS are available/.test(p.body.input[0].content));
});

test('every read tool schema is strict with no arguments, so nothing can be passed to read someone else', async () => {
  const { mod, calls } = await loadRoute({});
  await mod.POST(post(ask('hi')));
  const tools = calls.ai[0].body.tools.filter((t) => READ_NAMES.includes(t.name));
  assert.equal(tools.length, READ_NAMES.length);
  for (const t of tools) {
    assert.equal(t.strict, true, t.name);
    assert.deepEqual(t.parameters.properties, {}, t.name);
    assert.equal(t.parameters.additionalProperties, false, t.name);
  }
});

test('⚠ A LOOKUP RUNS: the model asks for the plan, the member\'s own rows come back under the call id, and the reply is what the model said', async () => {
  const tables = {
    client_workouts: [{ id: 'w1', client_id: U, status: 'published', title: 'Upper body — push', trainer_id: 7, scheduled_date: '2026-09-23', created_at: '2026-09-01T00:00:00Z', payload: { exercises: [{ name: 'Bench press', sets: 4, reps: 6 }] } }],
    client_meal_plans: [],
    trainers: [{ id: 7, name: 'Maya Okafor' }],
  };
  const answers = [calls(call('get_training_plan', {})), say('Today is Upper body — push: bench press 4 × 6, from Maya.')];
  const { mod, calls: c } = await loadRoute({ tables, answers });
  const res = await mod.POST(post(ask("what's on today?")));
  const out = await res.json();
  assert.equal(c.ai.length, 2, 'one round to ask, one to answer');
  const second = c.ai[1].body.input;
  // The reasoning + function_call items are echoed, then our output follows.
  assert.ok(second.some((it) => it.type === 'reasoning'), 'the reasoning item is echoed back (a reasoning model refuses a call without it)');
  const fco = second.find((it) => it.type === 'function_call_output');
  assert.equal(fco.call_id, 'call_get_training_plan');
  const result = JSON.parse(fco.output);
  assert.equal(result.ok, true);
  assert.equal(result.training.coach, 'Maya Okafor');
  assert.equal(result.training.thisWeek[0].title, 'Upper body — push');
  assert.deepEqual(out, { reply: 'Today is Upper body — push: bench press 4 × 6, from Maya.', source: 'ai', actions: [], model: 'pinned' });
});

test('a read that fails answers ok:false to the model — never an empty plan — and a read for a non-member fails closed', async () => {
  const { mod, calls: c } = await loadRoute({ fail: ['client_workouts', 'client_meal_plans'], answers: [calls(call('get_training_plan', {})), say("I can't see your plan right now.")] });
  await mod.POST(post(ask('plan?')));
  const fco = c.ai[1].body.input.find((it) => it.type === 'function_call_output');
  assert.deepEqual(JSON.parse(fco.output), { ok: false });
  // A non-member whose model somehow emits a read call: members_only, no read.
  const p = await loadRoute({ isMember: false, answers: [calls(call('get_week_summary', {})), say('x')], tables: { daily_health_snapshot: [{ user_id: U, snapshot_date: '2026-09-23', calories: 1 }] } });
  await p.mod.POST(post(ask('week?')));
  const fco2 = p.calls.ai[1].body.input.find((it) => it.type === 'function_call_output');
  assert.deepEqual(JSON.parse(fco2.output), { error: 'members_only' });
  assert.ok(!p.sb._calls.some((x) => x.table === 'daily_health_snapshot'), 'nothing was read');
});

test('coach lookups: find_client resolves a name on the coach\'s OWN roster; a client asking gets not_a_coach; a bad id is refused before any RPC', async () => {
  // Client ids are auth uuids in production (find_client hands back what
  // get_display_names returns); the route refuses a non-uuid BEFORE any RPC, so
  // the fixture carries uuid-shaped ids or the refusal fires on the happy path.
  const C1 = '11111111-1111-4111-8111-111111111111', C2 = '22222222-2222-4222-8222-222222222222';
  const tables = {
    trainers: [{ id: 7, name: 'Maya', owner_id: U }], nutritionists: [],
    subscriptions: [{ client_id: C1, provider_id: 7, provider_role: 'trainer', status: 'active' }, { client_id: C2, provider_id: 7, provider_role: 'trainer', status: 'active' }],
  };
  const rpcs = {
    get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: id === C1 ? 'Priya Shah' : 'Sam Ortiz' })),
    get_client_stats: ({ p_user_id }) => (p_user_id === C1 ? { daysLogged7d: 5, avgCalories: 2050 } : null),
    get_client_lifts: () => null,
  };
  const coach = await loadRoute({ role: 'trainer', tables, rpcs, answers: [calls(call('find_client', { name: 'priya' }, 'c1'), call('get_client_snapshot', { clientId: C1 }, 'c2'), call('get_client_snapshot', { clientId: 'DROP TABLE' }, 'c3')), say('Priya logged 5 of 7 days.')] });
  await coach.mod.POST(post(ask("how's Priya doing?")));
  const outs = coach.calls.ai[1].body.input.filter((it) => it.type === 'function_call_output').map((it) => [it.call_id, JSON.parse(it.output)]);
  assert.deepEqual(outs[0], ['c1', { ok: true, client: { id: C1, name: 'Priya Shah', roles: ['trainer'] } }]);
  assert.equal(outs[1][1].allowed, true);
  assert.deepEqual(outs[1][1].nutrition, { daysLogged7d: 5, avgCalories: 2050 });
  assert.equal(outs[2][1].error, 'bad_client_id');
  assert.equal(coach.sb._calls.filter((x) => x.rpc === 'get_client_stats').length, 1, 'the bad id never reached the RPC');

  const client = await loadRoute({ role: 'client', tables, rpcs, answers: [calls(call('find_client', { name: 'priya' })), say('x')] });
  await client.mod.POST(post(ask('priya?')));
  const fco = client.calls.ai[1].body.input.find((it) => it.type === 'function_call_output');
  assert.equal(JSON.parse(fco.output).error, 'not_a_coach');
  assert.ok(!client.sb._calls.some((x) => x.table === 'trainers' || x.table === 'nutritionists' || x.table === 'subscriptions'), 'a client is refused BEFORE any roster read');

  // ⚠ COACH ACCESS IS MEMBERSHIP'S VERDICT, NOT THE PRIMARY ROLE: a dual-role
  // account (profile.role 'client', a coach by roles[]) gets the lookups too.
  const dual = await loadRoute({ role: 'client', isCoach: true, tables, rpcs, answers: [calls(call('find_client', { name: 'priya' }, 'd1')), say('x')] });
  await dual.mod.POST(post(ask('priya?')));
  assert.ok(toolNames(dual.calls.ai[0].body).includes('find_client'), 'a dual-role member is offered the coach lookups');
  const dfco = dual.calls.ai[1].body.input.find((it) => it.type === 'function_call_output');
  assert.deepEqual(JSON.parse(dfco.output), { ok: true, client: { id: C1, name: 'Priya Shah', roles: ['trainer'] } });
  // …and an admin is included explicitly (no coach profile → the roster says so).
  const admin = await loadRoute({ role: 'client', isAdmin: true, tables: { trainers: [], nutritionists: [] }, answers: [calls(call('find_client', { name: 'priya' }, 'a1')), say('x')] });
  await admin.mod.POST(post(ask('priya?')));
  assert.ok(toolNames(admin.calls.ai[0].body).includes('find_client'));
  assert.equal(JSON.parse(admin.calls.ai[1].body.input.find((it) => it.type === 'function_call_output').output).error, 'not_a_coach');
});

test('⚠ THE REPLY REACHES THE BUBBLE AS PLAIN TEXT: markdown the model emits anyway is stripped, words intact', async () => {
  const { mod } = await loadRoute({ answers: [say('**Today:**\n- Upper body — push\n- Easy run')] });
  const out = await (await mod.POST(post(ask('today?')))).json();
  assert.equal(out.reply, 'Today:\n• Upper body — push\n• Easy run');
});

test('the loop is bounded: five model rounds at most, ten tool calls at most, then the text is taken', async () => {
  const endless = Array.from({ length: 20 }, () => calls(call('get_reminders', {})));
  const { mod, calls: c } = await loadRoute({ answers: endless, tables: { user_scheduled_reminders: [] } });
  const out = await (await mod.POST(post(ask('loop')))).json();
  assert.equal(c.ai.length, 5, 'MAX_MODEL_ROUNDS');
  // Round 5 returned only a call and no text → no reply → the honest fallback.
  assert.equal(out.source, 'fallback');
  const many = [calls(...Array.from({ length: 12 }, (_, i) => call('get_reminders', {}, `r${i}`))), say('done')];
  const b = await loadRoute({ answers: many, tables: { user_scheduled_reminders: [] } });
  await b.mod.POST(post(ask('burst')));
  const outs = b.calls.ai[1].body.input.filter((it) => it.type === 'function_call_output');
  assert.equal(outs.length, 12, 'every call gets an output so the transcript stays valid');
  assert.equal(outs.filter((it) => JSON.parse(it.output).error === 'tool_budget_exhausted').length, 2, 'the two past the budget are refused, not run');
  assert.equal(b.sb._calls.filter((x) => x.table === 'user_scheduled_reminders').length, 10);
});

test('⚠ A REFUSED PIN IS REFUSED FOR THE WHOLE REQUEST: once callAI reports a fallback, the later rounds name the fallback model directly instead of paying a refused Astra call each', async () => {
  const { mod, calls: c } = await loadRoute({ answers: [{ ...calls(call('get_reminders', {})), fellBack: 'gpt-5.4-mini' }, say('None set.')], tables: { user_scheduled_reminders: [] } });
  const out = await (await mod.POST(post(ask('reminders?')))).json();
  assert.equal(c.ai[0].body.model, undefined, 'round 1 asks for the pin');
  assert.equal(c.ai[1].body.model, 'gpt-5.4-mini', 'round 2 goes straight to the model that answered');
  assert.equal(out.model, 'gpt-5.4-mini', 'and the response says which model answered');
  // Control: with no fallback reported, every round keeps asking for the pin.
  const b = await loadRoute({ answers: [calls(call('get_reminders', {})), say('None.')], tables: { user_scheduled_reminders: [] } });
  const outB = await (await b.mod.POST(post(ask('reminders?')))).json();
  assert.equal(b.calls.ai[1].body.model, undefined);
  assert.equal(outB.model, 'pinned');
});

test('Cook Mode still carries NO tools and NO read tools, on the public model for a signed-out cook', async () => {
  const cook = await loadRoute({ user: null, answers: [say('Sear it two minutes a side.')] });
  await cook.mod.POST(post({ messages: [{ role: 'user', content: 'how long?' }], cookContext: { recipeTitle: 'Steak', stepIndex: 1, stepText: 'Sear.', ingredients: ['steak'] } }));
  const b = cook.calls.ai[0].body;
  assert.equal(b.tools, undefined);
  assert.equal(b.model, ai.aiPublicModel());
});

test('member facts carry today\'s habit completion now (the context line nothing populated before)', async () => {
  const tables = {
    user_habits: [{ id: 'h1', user_id: U, archived_at: null }, { id: 'h2', user_id: U, archived_at: null }, { id: 'h3', user_id: U, archived_at: '2026-01-01T00:00:00Z' }],
    user_habit_completions: [{ user_id: U, habit_id: 'h1', done_on: new Date().toISOString().slice(0, 10) }],
  };
  const { mod, calls: c } = await loadRoute({ tables });
  await mod.POST(post(ask('hi')));
  const facts = c.ai[0].body.input.find((it) => it.role === 'system' && /FACTS ABOUT THIS MEMBER/.test(it.content));
  assert.ok(facts, 'a member gets the facts block');
  assert.match(facts.content, /Habits today: 1 of 2 done/);
});

test('no key → the rule-based fallback, and the model is never called', async () => {
  const { mod, calls: c } = await loadRoute({ hasKey: false });
  const out = await (await mod.POST(post(ask('help me find a trainer')))).json();
  assert.equal(out.source, 'fallback');
  assert.equal(c.ai.length, 0);
});
