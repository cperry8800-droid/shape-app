// AI drafting for coaches — the SURFACES, driven: the coach route the web builder's
// "Draft with AI" calls (/api/ai/draft-workout), Nora's chat route offering
// draft_workout to a trainer, and the confirm card on the website and in the app.
//
// The model is a script; the gates, the draft core, the action and both cards are the
// shipping code (loadRealModule for the routes, the broadsheet mount for the app card,
// the chat widget's own function body for the web card).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { loadBroadsheet, drive, SHIM, THEME, flatten, textOf } from './helpers/broadsheet-mount.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const draftCore = await import(join(ROOT, 'src/lib/ai/workoutDraft.mjs'));
const proposals = await import(join(ROOT, 'src/lib/ai/proposals.mjs'));
const actions = await import(join(ROOT, 'src/lib/ai/actions.mjs'));

const COACH = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

const row = (name, sets, reps, rpe, rest, extra = {}) => ({ name, sets, reps, rpe, rest, tempo: '', cue: '', group: '', load: 0, loadUnit: '', ...extra });
const RAW = {
  offTopic: false, name: 'Lower A', notes: '', progression: { deloadWeeks: [], rpeStep: 0 },
  days: [{ name: 'Lower A', weekday: -1, blocks: [{ kind: 'main', rows: [row('Back squat', 4, '6', 7, '2:30', { load: 315, loadUnit: 'lb' }), row('Romanian deadlift', 3, '8', 7, '2:00')] }] }],
};
const modelText = (raw) => ({ output_text: typeof raw === 'string' ? raw : JSON.stringify(raw), output: [] });

// ── /api/ai/draft-workout ───────────────────────────────────────────────────────
async function loadDraftRoute({ user = { id: COACH, email: 'c@x' }, gate = { isMember: true, isCoach: true, isAdmin: false, isKnownMinor: false }, profile = { role: 'trainer', roles: [] }, hasKey = true, answers = [{ ok: true, data: modelText(RAW) }], units = null, coached = [CLIENT], phase = 'Build', denied = null } = {}) {
  const sb = fakeSupabase({
    tables: {
      profiles: [{ id: COACH, ...profile }],
      user_goals: units ? [{ user_id: COACH, kind: 'client_settings', data: { units } }] : [],
      client_programs: [{ user_id: CLIENT, training_phase: phase, detail: { health: 'PRIVATE-NOTE' } }],
    },
    rpcs: { is_coach_on_client: (a) => coached.includes(a.p_client_id) },
  });
  const ai = [];
  let i = 0;
  const registry = new Map([
    ['next/server', nextServer],
    ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => sb }],
    ['@/lib/membership-core', { computeMembership: async () => gate }],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/require-membership', { requireMembership: async () => denied }],
    ['@/lib/ai', { hasOpenAIKey: () => hasKey, callAI: async (body, opts) => { ai.push({ body, opts }); const a = answers[Math.min(i++, answers.length - 1)]; if (a instanceof Error) throw a; return a; } }],
    ['@/lib/ai/workoutDraft.mjs', draftCore],
  ]);
  const mod = await loadRealModule(join(ROOT, 'src/app/api/ai/draft-workout/route.ts'), { typescript: true, registry });
  return { mod, ai, sb };
}
const draftPost = (body) => new Request('https://x/api/ai/draft-workout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('draft route: trainers and admins only — a member, a nutritionist and a signed-out caller are refused', async () => {
  const member = await loadDraftRoute({ gate: { isMember: true, isCoach: false, isAdmin: false } });
  assert.equal((await member.mod.POST(draftPost({ request: 'legs' }))).status, 403);
  assert.equal(member.ai.length, 0, 'no model call for a refused caller');
  const nutri = await loadDraftRoute({ profile: { role: 'nutritionist', roles: [] } });
  const nr = await nutri.mod.POST(draftPost({ request: 'legs' }));
  assert.equal(nr.status, 403);
  assert.equal((await nr.json()).error, 'Workout drafting is for trainers.');
  const dual = await loadDraftRoute({ profile: { role: 'nutritionist', roles: ['trainer'] } });
  assert.equal((await dual.mod.POST(draftPost({ request: 'legs' }))).status, 200, 'a nutritionist who also trains drafts workouts');
  const admin = await loadDraftRoute({ gate: { isMember: true, isCoach: false, isAdmin: true }, profile: { role: 'client' } });
  assert.equal((await admin.mod.POST(draftPost({ request: 'legs' }))).status, 200);
  const anon = await loadDraftRoute({ user: null });
  assert.equal((await anon.mod.POST(draftPost({ request: 'legs' }))).status, 401);
  const unpaid = await loadDraftRoute({ denied: nextServer.NextResponse.json({ error: 'Shape membership required.' }, { status: 402 }) });
  assert.equal((await unpaid.mod.POST(draftPost({ request: 'legs' }))).status, 402);
});

test('draft route: the model\'s rows come back as the builder\'s document, minus the weight it invented', async () => {
  const r = await loadDraftRoute();
  const res = await r.mod.POST(draftPost({ request: 'lower body, 50 min, barbell, intermediate', minutes: 50, secret: 'NOT-IN-PROMPT' }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.source, 'openai');
  assert.equal(json.notice, undefined);
  assert.equal(json.draft.buildType, 'workout');
  const squat = json.draft.builder.weeks[0].days[0].blocks[0].rows[0];
  assert.deepEqual([squat.name, squat.load, squat.loadType, squat.rpe], ['Back squat', '', 'lb', 7]);
  assert.deepEqual(json.lines, ['Lower A — 2 moves', 'Back squat — 4 × 6 · RPE 7 · 2:30', 'Romanian deadlift — 3 × 8 · RPE 7 · 2:00']);
  assert.equal(r.ai[0].opts.promptId, 'ai.draft-workout');
  assert.ok(!r.ai[0].body.input[1].content.includes('NOT-IN-PROMPT'), 'unknown body keys never reach the prompt');
});

test('draft route: no key, a failed call, a throw or junk is a LABELLED template — never a 500', async () => {
  for (const [why, opts] of [
    ['no key', { hasKey: false }],
    ['call fails', { answers: [{ ok: false, reason: 'timeout' }] }],
    ['call throws', { answers: [new Error('network')] }],
    ['junk', { answers: [{ ok: true, data: modelText('nope') }] }],
  ]) {
    const r = await loadDraftRoute(opts);
    const res = await r.mod.POST(draftPost({ request: 'upper body push' }));
    assert.equal(res.status, 200, why);
    const json = await res.json();
    assert.equal(json.source, 'template', why);
    assert.equal(json.notice, draftCore.TEMPLATE_NOTICE, why);
    assert.equal(json.draft.builder.weeks[0].days[0].name, 'Push', why);
    if (why === 'no key') assert.equal(r.ai.length, 0, 'no key, no call');
  }
});

test('draft route: off-topic is a 422 question; an empty brief is a 400', async () => {
  const off = await loadDraftRoute({ answers: [{ ok: true, data: modelText({ offTopic: true, name: '', days: [], progression: { deloadWeeks: [], rpeStep: 0 }, notes: '' }) }] });
  const res = await off.mod.POST(draftPost({ request: 'write me a poem' }));
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, draftCore.OFF_TOPIC_MESSAGE);
  const empty = await loadDraftRoute();
  assert.equal((await empty.mod.POST(draftPost({ request: '   ' }))).status, 400);
});

test('draft route: a client is context only for someone this coach coaches — the phase, never the body\'s own "client"', async () => {
  const r = await loadDraftRoute();
  const ok = await r.mod.POST(draftPost({ request: 'legs', clientId: CLIENT, client: { goal: 'INJECTED-BY-BODY' } }));
  assert.equal(ok.status, 200);
  const prompt = r.ai[0].body.input[1].content;
  assert.deepEqual(JSON.parse(prompt).brief.client, { trainingPhase: 'Build' });
  assert.ok(!prompt.includes('INJECTED-BY-BODY'));
  assert.ok(!prompt.includes('PRIVATE-NOTE'), 'no health notes, no other columns');
  const stranger = await loadDraftRoute();
  const no = await stranger.mod.POST(draftPost({ request: 'legs', clientId: STRANGER }));
  assert.equal(no.status, 403);
  assert.equal((await no.json()).error, 'You can only draft for clients you actively coach.');
  assert.equal(stranger.ai.length, 0);
  assert.equal((await stranger.mod.POST(draftPost({ request: 'legs', clientId: 'not-a-uuid' }))).status, 400);
});

test('draft route: units follow the coach\'s Settings → Units unless the brief names one', async () => {
  const kg = await loadDraftRoute({ units: 'Metric · kg / km' });
  const j = await (await kg.mod.POST(draftPost({ request: 'legs' }))).json();
  assert.equal(j.draft.builder.weeks[0].days[0].blocks[0].rows[0].loadType, 'kg');
  assert.equal(JSON.parse(kg.ai[0].body.input[1].content).brief.unit, 'kg');
  const said = await loadDraftRoute({ units: 'Metric · kg / km' });
  const j2 = await (await said.mod.POST(draftPost({ request: 'legs', unit: 'lb' }))).json();
  assert.equal(j2.draft.builder.weeks[0].days[0].blocks[0].rows[0].loadType, 'lb');
  const def = await loadDraftRoute();
  assert.equal((await (await def.mod.POST(draftPost({ request: 'legs' }))).json()).draft.builder.weeks[0].days[0].blocks[0].rows[0].loadType, 'lb', 'imperial is the default');
});

test('draft route: a 12-week, 7-day program comes back whole and bounded', async () => {
  const r = await loadDraftRoute({ hasKey: false });
  const j = await (await r.mod.POST(draftPost({ request: 'strength program', kind: 'program', weeks: 40, daysPerWeek: 9 }))).json();
  assert.equal(j.draft.buildType, 'program');
  assert.equal(j.draft.builder.weeks.length, 12);
  assert.equal(j.draft.builder.weeks[0].days.length, 7);
  assert.deepEqual(j.draft.builder.weeks.map((w) => w.deload).map((d, i) => d ? i + 1 : 0).filter(Boolean), [4, 8, 12]);
});

// ── /api/support/chat · Nora for a trainer ──────────────────────────────────────
const ai_ = await loadRealModule(join(ROOT, 'src/lib/ai.ts'), { typescript: true, registry: new (class extends Map { has(k) { return super.has(k) || String(k).startsWith('./ai/'); } get(k) { return super.has(k) ? super.get(k) : {}; } })([['next/server', nextServer]]) });
const coachCatalog = await loadRealModule(join(ROOT, 'src/lib/coach-catalog.ts'), { typescript: true });
const say = (text) => ({ output_text: text, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
const fnCall = (name, args, id = `call_${name}`) => ({ type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) });
const calls = (...items) => ({ output: [{ type: 'reasoning', id: 'rs_1', summary: [] }, ...items] });

async function loadChat({ role = 'trainer', user = { id: COACH, email: 'c@x' }, isMember = true, answers = [say('ok')], coached = [], hasKey = true, failAI = false, tables = {}, fail = [] } = {}) {
  const sb = fakeSupabase({ tables: { user_goals: [], ...tables }, fail, rpcs: { is_coach_on_client: (a) => coached.includes(a.p_client_id) } });
  const seen = [];
  let i = 0;
  const registry = proposals.createRegistry();
  for (const a of actions.NORA_ACTIONS) registry.define(a.name, a);
  const reg = new Map([
    ['next/server', nextServer],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/coach-catalog', coachCatalog],
    ['@/lib/ai/proposals.mjs', proposals],
    ['@/lib/ai/tone.mjs', await import(join(ROOT, 'src/lib/ai/tone.mjs'))],
    ['@/lib/ai/memberContext.mjs', await import(join(ROOT, 'src/lib/ai/memberContext.mjs'))],
    ['@/lib/ai/cookContext.mjs', await import(join(ROOT, 'src/lib/ai/cookContext.mjs'))],
    ['@/lib/ai/actions.mjs', actions],
    ['@/lib/ai/replyText.mjs', await import(join(ROOT, 'src/lib/ai/replyText.mjs'))],
    ['@/lib/ai/memberReads.mjs', await import(join(ROOT, 'src/lib/ai/memberReads.mjs'))],
    ['@/lib/ai/shapeKnowledge.mjs', await import(join(ROOT, 'src/lib/ai/shapeKnowledge.mjs'))],
    ['@/lib/ai/voiceLang.mjs', await import(join(ROOT, 'src/lib/ai/voiceLang.mjs'))],
    ['@/lib/request-auth', { clientForRequest: async () => sb }],
    ['@/lib/membership-core', { computeMembership: async () => ({ isMember, isCoach: ['trainer', 'nutritionist'].includes(role), isAdmin: false, isKnownMinor: false }) }],
    ['@/lib/food-search-server', { searchFoodsServer: async () => ({ results: [], unavailable: true }) }],
    ['@/lib/ai', {
      hasOpenAIKey: () => hasKey,
      aiPublicModel: ai_.aiPublicModel,
      callAI: async (body, opts) => { seen.push({ body, opts }); if (failAI) return { ok: false, reason: 'http_error', status: 503, latencyMs: 1, promptId: opts.promptId }; const a = answers[Math.min(i, answers.length - 1)]; i += 1; return { ok: true, data: a, usage: null, latencyMs: 1, promptId: opts.promptId, model: 'pinned', fellBack: false }; },
    }],
    ['@/lib/ai/server', {
      resolveActor: async () => (user ? { user, role, supabase: sb } : null),
      makeCtx: (actor) => ({ actor: { id: actor.user.id, role: actor.role }, supabase: sb, store: {}, call: async () => ({ ok: true, status: 200, data: {} }) }),
      serverRegistry: registry,
      proposalSecret: () => 'chat-secret',
      casWriteUserGoals: async () => ({ ok: true }),
      auditSink: () => ({ log: async () => 'audit-1' }),
    }],
  ]);
  const mod = await loadRealModule(join(ROOT, 'src/app/api/support/chat/route.ts'), { typescript: true, registry: reg });
  return { mod, seen };
}
const chatPost = (text) => new Request('https://x/api/support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }] }) });
const toolNames = (body) => (body.tools || []).map((t) => t.name);

test('Nora: only a trainer is offered draft_workout, with the drafting rules and today\'s date', async () => {
  const t = await loadChat({ role: 'trainer' });
  await t.mod.POST(chatPost('hi'));
  const body = t.seen[0].body;
  assert.ok(toolNames(body).includes('draft_workout'));
  const sys = body.input[0].content;
  assert.match(sys, /TRAINER DRAFTING: Today is \d{4}-\d{2}-\d{2} \((Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, UTC\)/);
  assert.match(sys, /never invent a date/i);
  assert.match(sys, /Never invent loads/);
  assert.match(sys, /nothing is saved or assigned until they confirm/);
  const aw = body.tools.find((x) => x.name === 'assign_workout');
  assert.match(aw.description, /BY TITLE ONLY/);
  assert.match(aw.description, /use draft_workout instead/);
  for (const role of ['client', 'nutritionist']) {
    const o = await loadChat({ role });
    await o.mod.POST(chatPost('hi'));
    assert.ok(!toolNames(o.seen[0].body).includes('draft_workout'), `${role} never sees the schema`);
    assert.doesNotMatch(o.seen[0].body.input[0].content, /TRAINER DRAFTING/);
  }
  const anon = await loadChat({ user: null });
  await anon.mod.POST(chatPost('hi'));
  assert.ok(!toolNames(anon.seen[0].body).includes('draft_workout'));
});

// ⚠ THE TRAINER'S OWN DAY (#2227 registered "Nora's today is UTC"). The clock is
// pinned so both sides of the date line are exercised whatever hour the suite runs:
// 2026-10-08T02:00Z is Wednesday 7 Oct, 10 pm in New York, and Thursday 8 Oct in UTC.
async function withClock(iso, fn) {
  const Real = Date;
  const fixed = Real.parse(iso);
  globalThis.Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(fixed); } static now() { return fixed; } };
  try { return await fn(); } finally { globalThis.Date = Real; }
}
const trainerNoteOf = async (opts) => {
  const t = await loadChat(opts);
  await withClock('2026-10-08T02:00:00Z', () => t.mod.POST(chatPost('hi')));
  return t.seen[0].body.input[0].content;
};

test('Nora: a trainer\'s "today" is the day in their own zone, from their listing', async () => {
  const sys = await trainerNoteOf({ tables: { trainers: [{ owner_id: COACH, timezone: 'America/New_York' }] } });
  assert.match(sys, /TRAINER DRAFTING: Today is 2026-10-07 \(Wednesday, America\/New_York\)\./);
  // UTC is already the 8th, and the boundary dates workouts on UTC days: Nora is told
  // so, rather than offering a "today" the route refuses as passed.
  assert.match(sys, /the earliest day a session can go on right now is 2026-10-08/);
});

test('Nora: a trainer ahead of UTC gets their day and no earliest-day note', async () => {
  const sys = await trainerNoteOf({ tables: { trainers: [{ owner_id: COACH, timezone: 'Asia/Tokyo' }] } });
  assert.match(sys, /Today is 2026-10-08 \(Thursday, Asia\/Tokyo\)\./);
  assert.doesNotMatch(sys, /earliest day a session/);
});

test('Nora: with no listing zone the profile\'s zone decides; two listings still read; nothing stored or a bad zone is UTC', async () => {
  const prof = await trainerNoteOf({ tables: { trainers: [{ owner_id: COACH, timezone: null }], client_profiles: [{ user_id: COACH, timezone: 'America/Los_Angeles' }] } });
  assert.match(prof, /Today is 2026-10-07 \(Wednesday, America\/Los_Angeles\)/);
  const two = await trainerNoteOf({ tables: { trainers: [{ owner_id: COACH, timezone: '' }, { owner_id: COACH, timezone: 'Europe/London' }] } });
  assert.match(two, /Today is 2026-10-08 \(Thursday, Europe\/London\)/, 'a second listing is not an error');
  const none = await trainerNoteOf({});
  assert.match(none, /Today is 2026-10-08 \(Thursday, UTC\)\./);
  const bad = await trainerNoteOf({ tables: { trainers: [{ owner_id: COACH, timezone: 'Mars/Olympus' }] } });
  assert.match(bad, /Today is 2026-10-08 \(Thursday, UTC\)\./);
  const failed = await trainerNoteOf({ tables: { trainers: [{ owner_id: COACH, timezone: 'America/New_York' }] }, fail: ['trainers'] });
  assert.match(failed, /Today is 2026-10-08 \(Thursday, UTC\)\./, 'an unreadable listing reads as UTC');
});

test('Nora: a trainer who just asks gets a drafted card — the rows are in the signed token, and "Open in builder" rides with it', async () => {
  const t = await loadChat({ answers: [calls(fnCall('draft_workout', { request: 'lower body, 50 min, barbell, intermediate', kind: 'day', minutes: 50 })), modelText(RAW), say("I've drafted a lower-body session — review it below.")] });
  const res = await t.mod.POST(chatPost('build me a lower body session, 50 min, barbell'));
  const json = await res.json();
  assert.equal(t.seen[1].opts.promptId, 'ai.draft-workout', 'the second model call is the draft itself');
  const card = json.actions.find((a) => a.type === 'proposal');
  assert.ok(card, 'a confirm card');
  assert.equal(card.action, 'draft_workout');
  assert.match(card.summary, /^Draft "Lower A" and save it to your programs as a draft$/);
  const plan = proposals.verifyToken(card.token, 'chat-secret');
  assert.equal(plan.confirmedPayload.spec.days[0].blocks[0].rows[0].name, 'Back squat');
  assert.equal(plan.confirmedPayload.spec.days[0].blocks[0].rows[0].load, '', 'the invented 315 never reached the token');
  assert.equal(card.open.url, `/newdesign/TrainerApp.html#programs?plan=${plan.confirmedPayload.planId}`);
  const out = JSON.parse(t.seen[2].body.input.find((x) => x.type === 'function_call_output').output);
  assert.equal(out.proposed, true);
  assert.match(out.note, /Nothing is saved until the trainer confirms/);
});

test('Nora: a client whose model fabricates draft_workout is refused by the registry — no card, no draft', async () => {
  const c = await loadChat({ role: 'client', answers: [calls(fnCall('draft_workout', { request: 'legs', kind: 'day' })), say('no')] });
  const json = await (await c.mod.POST(chatPost('build me legs'))).json();
  assert.equal(json.actions.filter((a) => a.type === 'proposal').length, 0);
  assert.equal(c.seen.length, 2, 'two chat rounds, no draft call');
  assert.equal(JSON.parse(c.seen[1].body.input.find((x) => x.type === 'function_call_output').output).error, 'role_not_allowed');
});

test('Nora: a trainer asking for something that is not a workout gets an answer, not a draft', async () => {
  const t = await loadChat({ answers: [say('Here is a short poem about the sea…')] });
  const json = await (await t.mod.POST(chatPost('write me a poem'))).json();
  assert.equal(json.reply, 'Here is a short poem about the sea…');
  assert.equal(json.actions.length, 0);
  assert.equal(t.seen.length, 1, 'no draft call');
});

test('Nora: a client session with no day comes back as the question, before any draft; a stranger is refused plainly', async () => {
  const t = await loadChat({ coached: [CLIENT], answers: [calls(fnCall('draft_workout', { request: 'legs', kind: 'day', clientId: CLIENT, clientName: 'Priya' })), say('Which day should Priya do it?')] });
  const json = await (await t.mod.POST(chatPost('build Priya a leg day'))).json();
  assert.equal(json.actions.length, 0, 'no card without a day');
  const out = JSON.parse(t.seen[1].body.input.find((x) => x.type === 'function_call_output').output);
  assert.deepEqual(out, { error: 'preview_failed', message: "Which day should Priya do it? Tell me the date and I'll draft it." });
  assert.equal(t.seen.filter((s) => s.opts.promptId === 'ai.draft-workout').length, 0, 'asked before drafting');

  const s = await loadChat({ coached: [], answers: [calls(fnCall('draft_workout', { request: 'legs', kind: 'day', clientId: STRANGER, clientName: 'Sam', scheduledDate: '2099-01-05' })), say('no')] });
  await s.mod.POST(chatPost('build Sam a leg day on Monday'));
  const o2 = JSON.parse(s.seen[1].body.input.find((x) => x.type === 'function_call_output').output);
  assert.equal(o2.message, "You're not an active coach on this client, so I can't do that for them.");
});

test('Nora with NO model: a trainer\'s build request still gets the labelled template card; nobody else\'s does', async () => {
  const t = await loadChat({ hasKey: false });
  const json = await (await t.mod.POST(chatPost('Build me a lower body session, 50 min'))).json();
  assert.equal(json.source, 'fallback');
  assert.match(json.reply, /^AI drafting is unavailable right now/);
  const card = json.actions.find((a) => a.type === 'proposal');
  assert.ok(card, 'a card, not "passed to the Shape team"');
  assert.ok(card.summary.startsWith(draftCore.TEMPLATE_NOTICE));
  assert.match(card.summary, /save it to your programs as a draft$/, 'the library only — no client, no date guessed');
  assert.equal(t.seen.length, 0, 'no model was called at all');

  // The key is set but the chat model is down: the fallback card is still the template,
  // and the draft does not spend another call on a model that just failed.
  const down = await loadChat({ failAI: true });
  const dj = await (await down.mod.POST(chatPost('Build me a lower body session, 50 min'))).json();
  assert.ok(dj.actions.find((a) => a.type === 'proposal').summary.startsWith(draftCore.TEMPLATE_NOTICE));
  assert.deepEqual(down.seen.map((x) => x.opts.promptId), ['support.chat'], 'one failed chat call, no draft call');

  const q = await loadChat({ hasKey: false });
  const qj = await (await q.mod.POST(chatPost('How do I build a program?'))).json();
  assert.ok(!qj.actions.some((a) => a.type === 'proposal'), 'a question gets the ordinary answer');

  for (const role of ['client', 'nutritionist']) {
    const o = await loadChat({ role, hasKey: false });
    const oj = await (await o.mod.POST(chatPost('Build me a lower body session, 50 min'))).json();
    assert.ok(!oj.actions.some((a) => a.type === 'proposal'), role);
    assert.doesNotMatch(oj.reply, /AI drafting is unavailable/, role);
  }
});

// ── the app card ────────────────────────────────────────────────────────────────
const { BSNoraProposal } = await loadBroadsheet(['BSNoraProposal']);
const tick = () => new Promise((r) => setImmediate(r));
const DRAFT_CARD = {
  type: 'proposal', label: 'Review & confirm', action: 'draft_workout', token: 'tok',
  summary: 'Draft "Lower A" and save it to your programs as a draft',
  diff: [{ label: 'Lower A', after: '2 moves' }, { label: '', after: 'Back squat — 4 × 6 · RPE 7 · 2:30' }, { label: 'Weight', before: '180 lb', after: '178 lb' }],
  open: { kind: 'coach_plan', planId: 'plan-1', clientId: CLIENT, url: '/newdesign/TrainerApp.html#programs?plan=plan-1' },
};

test('app card: a draft line renders as a line, a change as before → after', () => {
  const d = drive(BSNoraProposal, { a: DRAFT_CARD, t: THEME });
  const rows = d.nodes().filter((n) => n.type === 'div' && n.props.style && n.props.style.fontSize === 10);
  const texts = rows.map((n) => textOf(n));
  assert.ok(texts.includes('Back squat — 4 × 6 · RPE 7 · 2:30'), 'a move is just the move');
  assert.ok(texts.includes('Lower A2 moves'));
  assert.ok(texts.includes('Weight180 lb→178 lb'), 'a real change still shows its before');
  assert.ok(!d.text.includes('Open in builder'), 'no Open before the confirm lands');
});

test('app card: once confirmed, "Open in builder" opens the saved program by id', async () => {
  const fired = [];
  const prev = { ShapeSupport: globalThis.ShapeSupport, dispatchEvent: globalThis.dispatchEvent };
  globalThis.ShapeSupport = { confirm: async (token) => { assert.equal(token, 'tok'); return { ok: true, auditId: 'aud-1' }; }, undo: async () => ({ ok: true }) };
  globalThis.dispatchEvent = (e) => { fired.push(e); return true; };
  try {
    const d = drive(BSNoraProposal, { a: DRAFT_CARD, t: THEME });
    d.click('Confirm');
    await tick();
    d.render();
    assert.ok(d.text.includes('Applied ✓'));
    d.click('Open in builder');
    assert.equal(fired.length, 1);
    assert.equal(fired[0].type, 'shape:openCoachPlan');
    assert.deepEqual(fired[0].detail, { planId: 'plan-1', clientId: CLIENT });
    assert.ok(d.buttons().some((b) => b.label === 'Undo'));
    const plain = drive(BSNoraProposal, { a: { ...DRAFT_CARD, open: undefined }, t: THEME });
    plain.click('Confirm');
    await tick();
    plain.render();
    assert.ok(!plain.text.includes('Open in builder'), 'no open target, no button');
  } finally {
    globalThis.ShapeSupport = prev.ShapeSupport;
    globalThis.dispatchEvent = prev.dispatchEvent;
  }
});

test('app: the trainer shell answers shape:openCoachPlan and the Programs screen opens the editor on that plan', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
  const trainer = src.slice(src.indexOf('function BSTrainerAppInner('), src.indexOf('function BSNutritionistApp('));
  assert.match(trainer, /window\.addEventListener\('shape:openCoachPlan', onOpenPlan\)/);
  assert.match(trainer, /setOpenPlanRequest\(\{ planId, nonce: Date\.now\(\) \}\);\s*setTab\('programs'\);/);
  assert.match(trainer, /<BSTrainerPrograms sheet=\{sheet\} initialTab=\{programInitialTab\} openPlanRequest=\{openPlanRequest\} \/>/);
  const programs = src.slice(src.indexOf('function BSTrainerPrograms('), src.indexOf('const rememberPlan = (row) =>', src.indexOf('function BSTrainerPrograms(')));
  assert.match(programs, /const row = serverPlans\.find\(\(p\) => p\.id === req\.planId\);\s*if \(row\) \{ openHandled\.current = req\.nonce; setEditingPlan\(row\); return; \}/);
  assert.match(programs, /refreshLibrary\(\); return; \}/, 'one more read before it says it cannot find it');
});

// ── the website card ────────────────────────────────────────────────────────────
// The real CwProposalCard, compiled out of chatWidget.jsx and rendered with the
// mount harness's hook shim (the widget is a classic script with no exports).
function webCard() {
  const src = readFileSync(join(ROOT, 'public/newdesign/chatWidget.jsx'), 'utf8');
  const start = src.indexOf('const cwIsLine =');
  const end = src.indexOf('function ChatWidget(props)');
  assert.ok(start > 0 && end > start, 'the card must stay where this harness reads it');
  const { code } = babel.transformSync(src.slice(start, end) + '\nthis.CwProposalCard = CwProposalCard;', { presets: [presetReact], babelrc: false, configFile: false });
  const ctx = { React: SHIM, TEAL: 'teal', TEAL_BRIGHT: 'teal', PAPER: 'paper', sans: 'sans', cwHexA: () => 'rgba(0,0,0,0.1)', fetch: async () => ({ ok: true, json: async () => ({ ok: true, auditId: 'aud-1' }) }) };
  vm.runInNewContext(code, ctx);
  return ctx.CwProposalCard;
}

test('website card: lines render as lines; "Open in builder" appears after the confirm, for a /newdesign/ page only', async () => {
  const Card = webCard();
  const d = drive(Card, { a: DRAFT_CARD });
  const lines = d.nodes().filter((n) => n.type === 'div' && n.props.style && n.props.style.fontSize === 10.5).map((n) => textOf(n));
  assert.ok(lines.includes('Back squat — 4 × 6 · RPE 7 · 2:30'));
  assert.ok(lines.includes('Weight180 lb→178 lb'));
  const link = () => flatten(d.nodes()).find((n) => n.type === 'a');
  assert.equal(link(), undefined);
  d.click('Confirm');
  await tick(); await tick();
  d.render();
  assert.equal(link().props.href, '/newdesign/TrainerApp.html#programs?plan=plan-1');
  assert.equal(textOf(link()), 'Open in builder →');

  const evil = drive(Card, { a: { ...DRAFT_CARD, open: { kind: 'coach_plan', planId: 'x', url: 'https://evil.example/' } } });
  evil.click('Confirm');
  await tick(); await tick();
  evil.render();
  assert.equal(flatten(evil.nodes()).find((n) => n.type === 'a'), undefined, 'an off-site URL is never a link');
});

// ── Nora never promises a follow-up nobody records ─────────────────────────────
// Nothing stores a question for the team: no ticket, no inbox, no email. So Nora gives
// the address a person reads (info@theshapecommunity.com), and never says she flagged,
// forwarded, noted or passed something on, on any surface (the Ask Nora review, 2026-10-07).
const FALSE_FOLLOW_UP = /flagged (this|it)|I'll flag|follow up (here|right here|in this thread|to finish)|teammate will follow up|passed this to|noted your interest|bring in the (human )?Shape team|brings in the human Shape team|can pass a message|Escalates to/i;

test('Nora: the prompt tells her to give the address and never to claim a hand-off', async () => {
  const t = await loadChat({ role: 'client' });
  await t.mod.POST(chatPost('I want a refund'));
  const sys = t.seen[0].body.input[0].content;
  assert.match(sys, /email the Shape team at info@theshapecommunity\.com/);
  assert.match(sys, /never say you have flagged, forwarded, noted or passed something on/);
  assert.doesNotMatch(sys, /say you have flagged it for the Shape team/);
  assert.doesNotMatch(sys, /offer to pass the question to the Shape team/);
});

test('Nora with no model: billing, login and the catch-all give the address and claim nothing', async () => {
  for (const [ask, needsAddress] of [['I want a refund on my subscription', true], ["I can't log in", true], ['what is the airspeed of a swallow', true], ['connect instacart', false]]) {
    const t = await loadChat({ role: 'client', hasKey: false });
    const { reply } = await (await t.mod.POST(chatPost(ask))).json();
    assert.doesNotMatch(reply, FALSE_FOLLOW_UP, `${ask}: ${reply}`);
    if (needsAddress) assert.match(reply, /info@theshapecommunity\.com/, ask);
  }
});

test('Nora on the website, in the app and in her knowledge base: no promise of a follow-up', () => {
  for (const rel of ['src/app/api/support/chat/route.ts', 'src/lib/ai/shapeKnowledge.mjs', 'public/newdesign/chatWidget.jsx', 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx']) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
      // comments describe the old wording; only shipped strings count
      .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    const hit = src.match(FALSE_FOLLOW_UP);
    assert.equal(hit, null, `${rel}: "${hit && hit[0]}"`);
  }
  const en = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/feed.json'), 'utf8'));
  assert.equal(en['support.composerPlaceholder'], 'Ask Nora…', "Nora's composer asks Nora, not a team nobody routes it to");
});
