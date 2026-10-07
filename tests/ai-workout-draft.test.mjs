// AI drafting for coaches — the shared core (src/lib/ai/workoutDraft.mjs) and Nora's
// draft_workout action, driven through the real preview → confirm → audit → undo
// scaffold. The model is a script; everything after it is the shipping code.
//
// ⚠ WHAT THIS HOLDS: a draft is the builder's own document, it never carries a weight
// the coach did not state, a template never passes as AI, a client's session never
// gets a guessed date, and the rows the coach confirmed are the rows that land.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  cleanBrief, sanitizeDraft, expandDraft, toBuilderDoc, generateDraft, draftRequest, summarizeDraft, templateDraft,
  allowedLoads, readCoachLoadUnit, readClientContext, draftSessions, sessionWeeks, DRAFT_SCHEMA, DRAFT_LIBRARY,
  TEMPLATE_NOTICE, OFF_TOPIC_MESSAGE, moveLine, focusOf,
} from '../src/lib/ai/workoutDraft.mjs';
import { normalizeWorkoutDetail, builderToAssignmentRows } from '../public/newdesign/workoutDocument.mjs';
import { createRegistry, proposeChange, confirmChange, undoChange, inMemoryAudit, verifyToken, signToken } from '../src/lib/ai/proposals.mjs';
import { draftWorkoutAction, assignWorkoutAction, NORA_ACTIONS } from '../src/lib/ai/actions.mjs';

const require = createRequire(import.meta.url);
const DashBuilder = require('../public/newdesign/dashBuilderCore.js');
const SECRET = 'test-secret';

// ── fixtures ────────────────────────────────────────────────────────────────────
const row = (name, sets, reps, rpe, rest, extra = {}) => ({ name, sets, reps, rpe, rest, tempo: '', cue: '', group: '', load: 0, loadUnit: '', ...extra });
const RAW_DAY = {
  offTopic: false,
  name: 'Lower A — 50 min',
  notes: 'Swap the RDL for hip thrusts if the back is cranky.',
  progression: { deloadWeeks: [], rpeStep: 0 },
  days: [{
    name: 'Lower A', weekday: 0, blocks: [
      { kind: 'main', rows: [row('back squat', 4, '6', 7, '2:30', { load: 225, loadUnit: 'lb', cue: 'Brace' }), row('Romanian deadlift', 3, '8', 7, '2:00')] },
      { kind: 'warmup', rows: [row('Glute bridge', 2, '10', 0, '30s')] },
      { kind: 'accessory', rows: [row('Walking lunge', 3, '10/side', 7, '90s', { group: 'B' }), row('Leg curl', 3, '12', 8, '90s', { group: 'B' }), row('Standing calf raise', 3, '12', 8, '60s', { group: 'C' })] },
    ],
  }],
};
const RAW_WEEK = {
  offTopic: false,
  name: 'Strength block',
  notes: '',
  progression: { deloadWeeks: [4, 4, 1, 99], rpeStep: 0.5 },
  days: [
    { name: 'Lower', weekday: 2, blocks: [{ kind: 'main', rows: [row('Back squat', 4, '5', 7, '2:30')] }] },
    { name: 'Upper', weekday: 2, blocks: [{ kind: 'main', rows: [row('Bench press', 4, '5', 7.5, '2:30')] }] },
    { name: 'Full', weekday: 9, blocks: [{ kind: 'main', rows: [row('Deadlift', 3, '3', 8, '3:00')] }] },
  ],
};
const answer = (raw) => ({ ok: true, data: { output: [{ type: 'message', content: [{ type: 'output_text', text: typeof raw === 'string' ? raw : JSON.stringify(raw) }] }] } });
function scriptedModel(...answers) {
  const calls = [];
  const fn = async (body, opts) => { calls.push({ body, opts }); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; if (a instanceof Error) throw a; return a; };
  fn.calls = calls;
  return fn;
}
const isoPlus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
// The next Monday at least a week out, so a one-week program assigned from it lands in one week.
function nextMonday() { const d = new Date(Date.now() + 7 * 864e5); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)); return d.toISOString().slice(0, 10); }
const allRows = (builder) => builder.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => b.rows)));

// ── the brief ───────────────────────────────────────────────────────────────────
test('cleanBrief is an allowlist: unknown keys never reach the brief, and every number is clamped', () => {
  const b = cleanBrief({ request: 'x'.repeat(900), weeks: 99, daysPerWeek: 0, minutes: 400, unit: 'stone', equipment: ' barbell\n rack ', secret: 'ignore me', __proto__: { evil: 1 }, client: { goal: 'Sub-25 5k', note: 'private health note' } });
  assert.equal(b.request.length, 500);
  assert.equal(b.kind, 'program', 'more than one week is a program');
  assert.equal(b.weeks, 12);
  assert.equal(b.daysPerWeek, 3, 'an unusable day count takes the default');
  assert.equal(b.minutes, 180);
  assert.equal(b.unit, null);
  assert.equal(b.equipment, 'barbell rack');
  assert.deepEqual(Object.keys(b).sort(), ['client', 'daysPerWeek', 'equipment', 'kind', 'level', 'minutes', 'name', 'request', 'unit', 'weeks']);
  assert.deepEqual(b.client, { goal: 'Sub-25 5k' }, 'only the named context fields survive');
  assert.equal(cleanBrief({ request: 'legs' }).kind, 'day');
  assert.equal(cleanBrief({ request: 'legs', kind: 'day', weeks: 8 }).weeks, 1, 'a day is one week whatever else was sent');
  assert.equal(cleanBrief({ request: 'legs', kind: 'program' }).weeks, 4);
  assert.equal(cleanBrief({ level: 'Pretty advanced lifter' }).level, 'advanced');
});

test('the prompt carries the allowlisted brief only, and the schema is strict all the way down', () => {
  const req = draftRequest(cleanBrief({ request: 'lower body', minutes: 50, secret: 'NEVER-IN-PROMPT' }));
  const user = JSON.parse(req.input[1].content);
  assert.ok(!req.input[1].content.includes('NEVER-IN-PROMPT'));
  assert.deepEqual(Object.keys(user.brief).sort(), ['kind', 'minutesPerSession', 'request', 'unit']);
  assert.equal(user.library.length, DRAFT_LIBRARY.length);
  assert.equal(req.text.format.strict, true);
  assert.match(req.input[0].content, /never invent a weight/i);
  const walk = (s, path) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false, `${path} must refuse extra keys`);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${path} must require every key (strict mode)`);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${path}.${k}`);
    }
    if (s.type === 'array') walk(s.items, `${path}[]`);
    assert.ok(!('minimum' in s) && !('maximum' in s), `${path}: strict mode rejects min/max`);
  };
  walk(DRAFT_SCHEMA, 'draft');
});

test('the copied library is the builder\'s own: every row matches a DashBuilder exercise exactly', () => {
  const lib = new Map(DashBuilder.EXERCISES.map((e) => [e.name, e]));
  for (const [name, muscle, equipment] of DRAFT_LIBRARY) {
    const e = lib.get(name);
    assert.ok(e, `${name} is not in the builder's library`);
    assert.equal(e.muscle, muscle, `${name} muscle`);
    assert.equal(e.equipment, equipment, `${name} equipment`);
  }
});

test('every template move, in every focus and kit, is a library move', () => {
  const names = new Set(DRAFT_LIBRARY.map((r) => r[0]));
  const asks = ['lower body', 'upper body', 'push day', 'pull day', 'full body', 'conditioning intervals', 'mobility and stretching', 'strength'];
  const kits = ['barbell', 'dumbbells only', 'bodyweight, no equipment'];
  for (const ask of asks) for (const kit of kits) for (const kind of ['day', 'program']) {
    for (const minutes of [25, 40, 75]) {
      const b = cleanBrief({ request: ask, equipment: kit, kind, daysPerWeek: 7, minutes });
      const raw = templateDraft(b);
      for (const d of raw.days) for (const bl of d.blocks) for (const r of bl.rows) assert.ok(names.has(r.name), `${r.name} (${ask}/${kit})`);
    }
  }
  assert.equal(focusOf('upper body push'), 'push', 'push beats upper');
  assert.equal(focusOf('rowing intervals'), 'conditioning');
  assert.equal(focusOf('rows and curls'), 'pull');
  assert.equal(focusOf('something'), 'full');
});

// ── loads ───────────────────────────────────────────────────────────────────────
test('⚠ LOADS: a weight survives only when the coach stated that number', () => {
  const lb = sanitizeDraft(RAW_DAY, cleanBrief({ request: 'lower body, 50 min', unit: 'lb' }));
  const squat = lb.days[0].blocks.find((b) => b.kind === 'main').rows[0];
  assert.equal(squat.load, '', 'a model-invented 225 lb is dropped');
  assert.equal(squat.loadType, 'lb', 'the empty field still carries the coach\'s unit');

  const said = sanitizeDraft(RAW_DAY, cleanBrief({ request: 'lower body, squat at 225 lb', unit: 'kg' }));
  const s2 = said.days[0].blocks.find((b) => b.kind === 'main').rows[0];
  assert.deepEqual([s2.load, s2.loadType], [225, 'lb'], 'the coach said 225 lb, so it stays — in lb even for a kg coach');

  const kgCoach = sanitizeDraft({ ...RAW_DAY, days: [{ ...RAW_DAY.days[0], blocks: [{ kind: 'main', rows: [row('Back squat', 4, '6', 7, '2:30', { load: 100, loadUnit: 'kg' })] }] }] }, cleanBrief({ request: 'squats, use 100 kg', unit: 'lb' }));
  assert.deepEqual([kgCoach.days[0].blocks[0].rows[0].load, kgCoach.days[0].blocks[0].rows[0].loadType], [100, 'kg'], '"use 100 kg" stays kg for an lb coach');

  const kgEmpty = sanitizeDraft(RAW_DAY, cleanBrief({ request: 'lower body', unit: 'kg' }));
  assert.ok(kgEmpty.days[0].blocks.every((b) => b.rows.every((r) => r.loadType === 'kg' && r.load === '')), 'a kg coach gets kg-labelled empty rows');

  const max = allowedLoads('squat 1RM 140 kg, use 185, 50 min, 3 days at 6 pm, 4x6', 'lb');
  assert.deepEqual(max.abs, [{ value: 185, type: 'lb' }], 'a 1RM is a reference, never a working load; a time or count is no load');
  assert.equal(max.pctFree, true);
  const pct = sanitizeDraft({ ...RAW_DAY, days: [{ ...RAW_DAY.days[0], blocks: [{ kind: 'main', rows: [row('Back squat', 4, '6', 0, '', { load: 75, loadUnit: 'pct' })] }] }] }, cleanBrief({ request: 'squat off a 1RM of 140 kg' }));
  assert.deepEqual([pct.days[0].blocks[0].rows[0].load, pct.days[0].blocks[0].rows[0].loadType], [75, 'pct'], 'percentages are relative intensity once the coach works off a 1RM');
  const noPct = sanitizeDraft({ ...RAW_DAY, days: [{ ...RAW_DAY.days[0], blocks: [{ kind: 'main', rows: [row('Back squat', 4, '6', 0, '', { load: 75, loadUnit: 'pct' })] }] }] }, cleanBrief({ request: 'lower body' }));
  assert.equal(noPct.days[0].blocks[0].rows[0].load, '', 'no 1RM, no percentage');
});

// ── sanitizing ──────────────────────────────────────────────────────────────────
test('sanitizeDraft clamps, canonicalizes, orders blocks and re-deals superset letters', () => {
  const spec = sanitizeDraft(RAW_DAY, cleanBrief({ request: 'lower body' }));
  const d = spec.days[0];
  assert.equal(d.weekday, null, '⚠ one session has no weekday, so it lands on the chosen date');
  assert.deepEqual(d.blocks.map((b) => b.kind), ['warmup', 'main', 'accessory'], 'builder order whatever order the model used');
  const squat = d.blocks[1].rows[0];
  assert.equal(squat.name, 'Back squat', 'library casing');
  assert.equal(squat.muscle, 'Quads');
  assert.equal(squat.equipment, 'Barbell');
  const acc = d.blocks[2].rows;
  assert.deepEqual(acc.map((r) => r.group), ['A', 'A', ''], 'the pair is A (re-dealt), the lone C is no superset');
  assert.equal(d.blocks[0].rows[0].rpe, '', 'RPE 0 is none');
  assert.equal(spec.notes, RAW_DAY.notes);

  const messy = sanitizeDraft({
    offTopic: false, name: 'N'.repeat(200), notes: '', progression: {},
    days: [{ name: '', weekday: -1, blocks: [
      { kind: 'cooldown', rows: [row('Stretch', 1, '1', 0, '')] },
      { kind: 'main', rows: [
        row('A1. Bench press', 0, '8', 11, '90'), row('', 3, '8', 7, ''), row('Row', 15, 'x'.repeat(40), 7.3, '2 min', { tempo: 'slowly' }),
        ...Array.from({ length: 20 }, (_, i) => row(`Move ${i}`, 'abc', '8', 'hard', '', { group: 'Z' })),
      ] },
      { kind: 'accessory', rows: [row('Curl', 3, '10', 8, '', { group: 'A' }), row('Curl 2', 3, '10', 8, '', { group: 'A' })] },
    ] }],
  }, cleanBrief({ request: 'push' }));
  const rows = messy.days[0].blocks.flatMap((b) => b.rows);
  assert.equal(messy.name.length, 80);
  assert.equal(messy.days[0].name, 'Day 1');
  assert.ok(!messy.days[0].blocks.some((b) => b.kind === 'cooldown'), 'an unknown block kind is dropped');
  assert.equal(rows.length, 16, 'sixteen moves a day at most');
  assert.deepEqual([rows[0].name, rows[0].sets, rows[0].rpe, rows[0].rest], ['Bench press', 1, 10, '90s'], 'numbering stripped, sets and RPE clamped, a bare rest is seconds');
  assert.deepEqual([rows[1].name, rows[1].sets, rows[1].rpe, rows[1].reps.length, rows[1].tempo], ['Row', 10, 7.5, 24, ''], 'an empty-named row is dropped; RPE in half points; a word is no tempo');
  assert.equal(rows[2].sets, 3, 'an unreadable set count is the builder default');
  assert.equal(rows[2].rpe, '', 'an unreadable RPE is none');
  assert.ok(rows.slice(2).every((r) => r.group === 'A'), 'the first run of Zs is A');
  assert.equal(messy.days[0].blocks.find((b) => b.kind === 'accessory'), undefined, 'the cap reached the accessories first');
  assert.equal(sanitizeDraft({ offTopic: false, days: [{ blocks: [{ kind: 'main', rows: [{ name: '' }] }] }] }, cleanBrief({})), null, 'no usable rows is no draft');
  assert.equal(sanitizeDraft('junk', cleanBrief({})), null);
  assert.deepEqual(sanitizeDraft({ offTopic: true, days: [] }, cleanBrief({})), { offTopic: true });
});

test('a program week: unique weekdays, filled from the default spread and sorted; deloads bounded', () => {
  const spec = sanitizeDraft(RAW_WEEK, cleanBrief({ request: 'strength', kind: 'program', weeks: 6, daysPerWeek: 3 }));
  assert.deepEqual(spec.days.map((d) => [d.weekday, d.name]), [[0, 'Upper'], [2, 'Lower'], [4, 'Full']], 'a duplicate Wednesday and a weekday 9 move to the spread');
  assert.deepEqual(spec.progression, { deloadWeeks: [4], rpeStep: 0.5 }, 'week 1 never deloads, 99 is past the end, duplicates collapse');
  const two = sanitizeDraft(RAW_WEEK, cleanBrief({ request: 'strength', kind: 'program', weeks: 4, daysPerWeek: 2 }));
  assert.equal(two.days.length, 2, 'no more days than the coach asked for');
});

// ── the document ────────────────────────────────────────────────────────────────
test('expandDraft is the builder\'s document: normalized, deterministic, ids unique', () => {
  const spec = sanitizeDraft(RAW_DAY, cleanBrief({ request: 'lower body' }));
  const a = expandDraft(spec);
  const b = expandDraft(JSON.parse(JSON.stringify(spec)));
  assert.deepEqual(a, b, 'the same spec always builds the same document — what the token relies on');
  assert.equal(a.buildType, 'workout');
  assert.deepEqual(normalizeWorkoutDetail({ buildType: a.buildType, builder: a.builder }, { name: a.name }).builder, a.builder, 'already normalized: the builder opens it unchanged');
  const ids = allRows(a.builder).map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(allRows(a.builder).every((r) => r.video === '' && r.progression === null && (r.group === null || /^[A-Z]$/.test(r.group))));
  assert.deepEqual(toBuilderDoc(RAW_DAY, cleanBrief({ request: 'lower body' })), a);
  assert.equal(toBuilderDoc({ offTopic: true, days: [] }, cleanBrief({})), null);
});

test('a program repeats week 1 with the stated progression: RPE climbs, a deload cuts sets and RPE, then resets', () => {
  const spec = sanitizeDraft(RAW_WEEK, cleanBrief({ request: 'strength', kind: 'program', weeks: 6, daysPerWeek: 3 }));
  const built = expandDraft(spec);
  assert.equal(built.buildType, 'program');
  assert.equal(built.builder.weeks.length, 6);
  const squat = (w) => built.builder.weeks[w].days.find((d) => d.name === 'Lower').blocks[0].rows[0];
  assert.deepEqual([1, 2, 3].map((w) => squat(w - 1).rpe), [7, 7.5, 8], 'RPE +0.5 a build week');
  assert.equal(built.builder.weeks[3].deload, true);
  assert.deepEqual([squat(3).sets, squat(3).rpe], [2, 6], 'deload: sets × 0.6 (the builder\'s rule), RPE − 1');
  assert.deepEqual([squat(4).sets, squat(4).rpe], [4, 7], 'after the deload the build starts again from week 1');
  assert.ok(allRows(built.builder).every((r) => r.load === ''), 'loads never move');
  const ids = allRows(built.builder).map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unique across every week');
});

test('⚠ a drafted single session lands on the chosen date, not on a weekday the model named', () => {
  const built = toBuilderDoc(RAW_DAY, cleanBrief({ request: 'lower body' }));
  const wed = '2030-01-09'; // a Wednesday; the raw draft said Monday
  const rows = builderToAssignmentRows(built.builder, { id: 't', name: built.name }, wed);
  assert.deepEqual(rows.map((r) => r.scheduledDate), [wed]);
  const sessions = draftSessions(built, wed, 'draft-1');
  assert.equal(sessions[0].payload.template.id, 'draft-1', 'stamped with the draft id undo filters on');
  assert.ok(sessions[0].payload.exercises.length > 0, 'a real session, not an empty title');
  assert.deepEqual(sessionWeeks(sessions), ['2030-01-07']);
});

test('summarizeDraft reads as a coach writes it', () => {
  const spec = sanitizeDraft(RAW_WEEK, cleanBrief({ request: 'strength', kind: 'program', weeks: 6, daysPerWeek: 3 }));
  const s = summarizeDraft(expandDraft(spec).builder, spec);
  assert.equal(s.days[0].label, 'Mon · Upper');
  assert.equal(s.days[1].moves[0], 'Back squat — 4 × 5 · RPE 7 · 2:30');
  assert.equal(s.repeat, 'Weeks 2–6 repeat week 1 · RPE +0.5 a week · deload week 4 (sets × 0.6, RPE −1)');
  assert.equal(s.lines[0], 'Mon · Upper — 1 move');
  assert.equal(moveLine({ name: 'Front squat', sets: 3, reps: '5', loadType: 'kg', load: 100, rpe: 8, rest: '2:00', group: 'A' }), 'Front squat — 3 × 5 · 100 kg · RPE 8 · 2:00 · superset A');
});

// ── the model and its failures ──────────────────────────────────────────────────
test('generateDraft: the model\'s draft when it answers; a LABELLED template when it cannot', async () => {
  const brief = cleanBrief({ request: 'lower body, 50 min', minutes: 50 });
  const ok = scriptedModel(answer(RAW_DAY));
  const ai = await generateDraft(brief, { callModel: ok });
  assert.equal(ai.source, 'ai');
  assert.equal(ok.calls[0].opts.promptId, 'ai.draft-workout');
  assert.equal(ok.calls[0].opts.timeoutMs, 45_000);
  assert.equal(ai.spec.days[0].blocks[1].rows[0].name, 'Back squat');

  for (const [why, model] of [
    ['no model', null],
    ['the call fails', scriptedModel({ ok: false, reason: 'http_error' })],
    ['the call throws', scriptedModel(new Error('boom'))],
    ['junk text', scriptedModel(answer('not json {'))],
    ['empty days', scriptedModel(answer({ offTopic: false, name: 'x', days: [], progression: {}, notes: '' }))],
  ]) {
    const g = await generateDraft(brief, { callModel: model });
    assert.equal(g.ok, true, why);
    assert.equal(g.source, 'template', `${why} → a template, said to be one`);
    assert.ok(g.spec.days[0].blocks.length > 0, why);
  }
});

test('a request that is not a workout is a question back, never a session nobody asked for', async () => {
  const poem = cleanBrief({ request: 'write me a poem about the sea' });
  const off = await generateDraft(poem, { callModel: scriptedModel(answer({ offTopic: true, name: '', days: [], progression: { deloadWeeks: [], rpeStep: 0 }, notes: '' })) });
  assert.deepEqual(off, { ok: false, error: 'off_topic', message: OFF_TOPIC_MESSAGE });
  const noKey = await generateDraft(poem, {});
  assert.equal(noKey.error, 'off_topic', 'with no model to ask, the template path refuses too');
  const junk = await generateDraft(poem, { callModel: scriptedModel(answer('{')) });
  assert.equal(junk.error, 'off_topic');
});

test('⚠ BOUNDED: the worst 12-week × 7-day × 16-move draft keeps a sane token and fits the plans route', () => {
  const long = (n, c = 'x') => c.repeat(n);
  const raw = {
    offTopic: false, name: long(200), notes: long(900), progression: { deloadWeeks: [4, 8, 12], rpeStep: 0.5 },
    days: Array.from({ length: 9 }, (_, d) => ({ name: long(200), weekday: d, blocks: [{ kind: 'main', rows: Array.from({ length: 30 }, (_, i) => row(`Move ${i} ${long(200)}`, 4, long(60, '8'), 8, '2:30', { tempo: '31X1', cue: long(400) })) }] })),
  };
  const brief = cleanBrief({ request: long(900), kind: 'program', weeks: 12, daysPerWeek: 7 });
  const spec = sanitizeDraft(raw, brief);
  const token = signToken({ action: 'draft_workout', source: 'nora', actor: { id: 'u', role: 'trainer' }, target: {}, suggestion: { request: brief.request }, confirmedPayload: { mode: 'save', planId: 'x', spec }, beforeState: {}, afterState: {}, reversal: null, nonce: 'n', iat: 1, exp: 2 }, SECRET);
  const built = expandDraft(spec);
  assert.equal(allRows(built.builder).length, 12 * 7 * 16);
  assert.ok(token.length < 64_000, `token ${token.length} chars — the spec, not 12 weeks of rows, rides in it`);
  assert.ok(JSON.stringify({ detail: { builder: built.builder } }).length < 1_000_000, 'under /api/coach/plans\'s 1 MB body limit');
});

// ── reads ───────────────────────────────────────────────────────────────────────
function readDb(rows, { fail = false, throws = false } = {}) {
  return {
    from(table) {
      if (throws) throw new Error('down');
      const filters = {};
      const c = { select() { return c; }, eq(k, v) { filters[k] = v; return c; }, maybeSingle: async () => (fail ? { data: null, error: { message: 'x' } } : { data: typeof rows[table] === 'function' ? rows[table](filters) : rows[table] ?? null, error: null }) };
      return c;
    },
  };
}
test('the coach\'s unit is Settings → Units by the app\'s rule; anything unreadable is imperial', async () => {
  const doc = (units) => readDb({ user_goals: (f) => (f.kind === 'client_settings' && f.user_id === 'c' ? { data: { units } } : null) });
  assert.equal(await readCoachLoadUnit(doc('Metric · kg / km'), 'c'), 'kg');
  assert.equal(await readCoachLoadUnit(doc('km'), 'c'), 'kg');
  assert.equal(await readCoachLoadUnit(doc('Imperial · lb / mi'), 'c'), 'lb');
  assert.equal(await readCoachLoadUnit(doc(undefined), 'c'), 'lb');
  assert.equal(await readCoachLoadUnit(readDb({}, { fail: true }), 'c'), 'lb');
  assert.equal(await readCoachLoadUnit(readDb({}, { throws: true }), 'c'), 'lb');
});
test('client context is the training phase and nothing else', async () => {
  assert.deepEqual(await readClientContext(readDb({ client_programs: (f) => (f.user_id === 'k' ? { training_phase: 'Peak', detail: { health: 'private' } } : null) }), 'k'), { trainingPhase: 'Peak' });
  assert.equal(await readClientContext(readDb({ client_programs: null }), 'k'), null);
  assert.equal(await readClientContext(readDb({}, { throws: true }), 'k'), null);
});

// ── Nora's draft_workout, through the real scaffold ─────────────────────────────
// A Supabase stand-in for the action: reads by table, recorded writes whose result
// rows a test chooses (an empty list is the in-statement guard matching nothing).
function actionDb({ coachOn = true, trainerId = 42, units = 'Imperial · lb / mi', phase = null, writeRows = () => [{ id: 'row-1' }] } = {}) {
  const calls = { rpc: [], writes: [], reads: [] };
  return {
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: name === 'is_coach_on_client' ? (typeof coachOn === 'function' ? coachOn(args.p_client_id) : coachOn) : null, error: null }; },
    from(table) {
      const st = { table, op: null, patch: null, filters: {} };
      const c = {
        select() { if (st.op) { const w = { ...st, filters: { ...st.filters } }; calls.writes.push(w); return Promise.resolve({ data: writeRows(w), error: null }); } return c; },
        eq(k, v) { st.filters[k] = v; return c; },
        is(k, v) { st.filters[k] = v; return c; },
        update(p) { st.op = 'update'; st.patch = p; return c; },
        delete() { st.op = 'delete'; return c; },
        maybeSingle: async () => {
          calls.reads.push({ table, filters: { ...st.filters } });
          if (table === 'trainers') return { data: trainerId == null ? null : { id: trainerId }, error: null };
          if (table === 'user_goals') return { data: { data: { units } }, error: null };
          if (table === 'client_programs') return { data: phase ? { training_phase: phase } : null, error: null };
          return { data: null, error: null };
        },
      };
      return c;
    },
    _calls: calls,
  };
}
function actionCtx(db, { model = scriptedModel(answer(RAW_DAY)), call = () => ({ ok: true, status: 200, data: { ok: true } }), role = 'trainer' } = {}) {
  const calls = [];
  return { actor: { id: 'coach-1', role }, supabase: db, draftModel: model, _calls: calls, call: async (m, p, b) => { calls.push({ method: m, path: p, body: b }); return call(m, p, b); } };
}
const registry = () => { const r = createRegistry(); for (const a of NORA_ACTIONS) r.define(a.name, a); return r; };
const actor = { id: 'coach-1', role: 'trainer' };

test('draft_workout · SAVE: preview drafts once, confirm saves exactly those rows, undo deletes the untouched save', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const db = actionDb();
  let saved = null;
  const ctx = actionCtx(db, { call: (m, p, b) => { if (m === 'POST' && p === '/api/coach/plans') { saved = b; return { ok: true, status: 200, data: { plan: { id: b.id } } }; } return { ok: false, status: 404, data: {} }; } });
  const p = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'lower body, 50 min, barbell', kind: 'day', minutes: 50 }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true, p.message);
  assert.equal(ctx.draftModel.calls.length, 1, 'drafted once, at preview');
  assert.equal(ctx._calls.length, 0, 'nothing written at preview');
  assert.match(p.preview.summary, /^Draft "Lower A — 50 min" and save it to your programs as a draft$/);
  assert.ok(p.preview.diff.every((d) => !('before' in d)), 'draft rows are lines, not before → after changes');
  assert.ok(p.preview.diff.some((d) => d.after === 'Back squat — 4 × 6 · RPE 7 · 2:30'));
  assert.ok(p.preview.diff.some((d) => d.label === 'Loads'), 'the card says the weights are blank');
  assert.ok(p.preview.diff.some((d) => d.label === 'Note' && d.after === RAW_DAY.notes));
  const plan = verifyToken(p.token, SECRET);
  const planId = plan.confirmedPayload.planId;
  assert.match(planId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'a v4 id the plans route accepts as its own');
  assert.deepEqual(p.preview.open, { kind: 'coach_plan', planId, url: `/newdesign/TrainerApp.html#programs?plan=${planId}` });

  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true, c.message);
  assert.equal(ctx.draftModel.calls.length, 1, '⚠ the model is never asked again at confirm');
  assert.equal(saved.id, planId);
  assert.equal(saved.published, false, 'saved as a draft');
  assert.equal(saved.kind, 'program');
  assert.equal(saved.expectedOwnerId, 'coach-1');
  assert.deepEqual(saved.detail, { buildType: 'workout', builder: expandDraft(plan.confirmedPayload.spec).builder }, 'byte-identical to the previewed draft');
  assert.equal(saved.detail.builder.weeks[0].days[0].blocks[1].rows[0].load, '', 'no invented weight reaches the library');
  assert.equal(c.result.open.planId, planId);
  assert.equal(audit._rows[0].action, 'draft_workout');
  assert.equal(audit._rows[0].target.kind, 'coach_plan');

  await undoChange({ registry: reg, auditId: c.auditId, actor, ctx, audit });
  const del = db._calls.writes.find((w) => w.op === 'delete');
  assert.equal(del.table, 'coach_plans');
  assert.deepEqual(del.filters, { id: planId, owner_id: 'coach-1', 'detail->>revision': '1' }, 'only the save itself, never an edited program');
  assert.equal(audit._rows[0].status, 'undone');
});

test('draft_workout · undo after the coach edited the saved program changes nothing', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const db = actionDb({ writeRows: () => [] });
  const ctx = actionCtx(db, { call: () => ({ ok: true, status: 200, data: { plan: {} } }) });
  const p = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'lower body', kind: 'day' }, actor, ctx, secret: SECRET });
  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  await assert.rejects(() => undoChange({ registry: reg, auditId: c.auditId, actor, ctx, audit }), /Changed since/);
  assert.equal(audit._rows[0].status, 'executed', 'never marked undone on a conflict');
});

test('draft_workout · a confirm after the coach\'s library moved relays the plans route\'s own words', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const ctx = actionCtx(actionDb(), { call: () => ({ ok: false, status: 409, data: { error: 'This draft was already saved. Reload the library to review its latest version.', code: 'revision_conflict' } }) });
  const p = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'lower body', kind: 'day' }, actor, ctx, secret: SECRET });
  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, false);
  assert.equal(c.error, 'execute_failed');
  assert.equal(c.message, 'This draft was already saved. Reload the library to review its latest version.');
  assert.equal(audit._rows.length, 0, 'nothing audited when nothing applied');
});

test('draft_workout · ASSIGN a single session: asks for the day first, then assigns real rows; undo pulls exactly those', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const db = actionDb({ phase: 'Peak' });
  let posted = null;
  const ctx = actionCtx(db, { call: (m, p, b) => { if (p === '/api/trainer/workout') { posted = b; return { ok: true, status: 200, data: { ok: true, count: 1 } }; } return { ok: false, status: 404, data: {} }; } });

  const ask = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'lower body', kind: 'day', clientId: 'client-9', clientName: 'Priya' }, actor, ctx, secret: SECRET });
  assert.equal(ask.ok, false);
  assert.equal(ask.message, "Which day should Priya do it? Tell me the date and I'll draft it.");
  assert.equal(ctx.draftModel.calls.length, 0, 'asked before the model ran — a question costs nothing');

  const past = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'lower body', kind: 'day', clientId: 'client-9', clientName: 'Priya', scheduledDate: isoPlus(-2) }, actor, ctx, secret: SECRET });
  assert.match(past.message, /has already passed/);

  const day = isoPlus(3);
  const p = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'lower body', kind: 'day', clientId: 'client-9', clientName: 'Priya', scheduledDate: day }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true, p.message);
  assert.equal(p.preview.summary, `Draft "Lower A — 50 min" and assign it to Priya on ${day}`);
  assert.equal(p.preview.open, undefined, 'an assignment has no builder to open');
  assert.ok(db._calls.rpc.some((r) => r.name === 'is_coach_on_client' && r.args.p_client_id === 'client-9'));
  assert.deepEqual(JSON.parse(ctx.draftModel.calls[0].body.input[1].content).brief.client, { trainingPhase: 'Peak' }, 'the client\'s phase, and only that');

  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true, c.message);
  const draftId = verifyToken(p.token, SECRET).confirmedPayload.draftId;
  assert.deepEqual(posted.clientIds, ['client-9']);
  assert.equal(posted.sessions.length, 1);
  assert.equal(posted.sessions[0].scheduledDate, day);
  assert.equal(posted.sessions[0].payload.template.id, draftId);
  assert.ok(posted.sessions[0].payload.exercises.length >= 5, 'a built session, not an empty title');

  await undoChange({ registry: reg, auditId: c.auditId, actor, ctx, audit });
  const u = db._calls.writes.find((w) => w.op === 'update');
  assert.equal(u.table, 'client_workouts');
  assert.deepEqual(u.patch, { status: 'archived' });
  assert.deepEqual(u.filters, { trainer_id: 42, client_id: 'client-9', status: 'published', 'payload->template->>id': draftId }, 'exactly the sessions this put there');
});

test('draft_workout · an assignment the boundary holds (guardrail 409) is relayed in its own words', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const ctx = actionCtx(actionDb(), { call: () => ({ ok: false, status: 409, data: { ok: false, error: 'This is a 40% jump on her last four weeks.' } }) });
  const p = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'lower body', kind: 'day', clientId: 'client-9', scheduledDate: isoPlus(2) }, actor, ctx, secret: SECRET });
  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  assert.equal(c.message, 'This is a 40% jump on her last four weeks.');
});

test('draft_workout · undo of an assignment the client already moved past changes nothing', async () => {
  const reg = registry();
  const audit = inMemoryAudit();
  const ctx = actionCtx(actionDb({ writeRows: () => [] }));
  const p = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'lower body', kind: 'day', clientId: 'client-9', scheduledDate: isoPlus(2) }, actor, ctx, secret: SECRET });
  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit });
  await assert.rejects(() => undoChange({ registry: reg, auditId: c.auditId, actor, ctx, audit }), /Changed since/);
});

test('draft_workout · never a guessed client: no id asks, a client they do not coach is refused — before any drafting', async () => {
  const reg = registry();
  const ctx = actionCtx(actionDb({ coachOn: false }));
  const noId = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'legs', clientName: 'Priya', scheduledDate: isoPlus(2) }, actor, ctx, secret: SECRET });
  assert.match(noId.message, /Which client\?/);
  const stranger = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'legs', clientId: 'stranger', clientName: 'Sam', scheduledDate: isoPlus(2) }, actor, ctx, secret: SECRET });
  assert.equal(stranger.ok, false);
  assert.equal(stranger.message, "You're not an active coach on this client, so I can't do that for them.");
  assert.equal(ctx.draftModel.calls.length, 0);
  assert.equal(ctx._calls.length, 0);
  const empty = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: '  ' }, actor, ctx, secret: SECRET });
  assert.match(empty.message, /Tell me what to build/);
});

test('draft_workout · trainers only: a nutritionist or a client cannot even propose it', async () => {
  for (const role of ['nutritionist', 'dietitian', 'client']) {
    const r = await proposeChange({ registry: registry(), action: 'draft_workout', input: { request: 'legs' }, actor: { id: 'x', role }, ctx: actionCtx(actionDb(), { role }), secret: SECRET });
    assert.equal(r.error, 'role_not_allowed', role);
  }
});

test('draft_workout · a multi-week program for a client is SAVED for the builder\'s Assign, with the client ready', async () => {
  const reg = registry();
  const ctx = actionCtx(actionDb(), { model: scriptedModel(answer(RAW_WEEK)) });
  const p = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: '6-week strength block', kind: 'program', weeks: 6, daysPerWeek: 3, clientId: 'client-9', clientName: 'Priya', startDate: nextMonday() }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true, p.message);
  const plan = verifyToken(p.token, SECRET);
  assert.equal(plan.confirmedPayload.mode, 'save');
  assert.equal(plan.confirmedPayload.clientId, 'client-9');
  assert.match(p.preview.summary, /for Priya and save it to your programs — open it in the builder to assign it \(a multi-week program is assigned from the builder\)$/);
  assert.equal(p.preview.open.url, `/newdesign/TrainerApp.html#programs?plan=${plan.confirmedPayload.planId}&client=client-9`);
  assert.equal(p.preview.open.clientId, 'client-9');
  assert.ok(p.preview.diff.some((d) => d.label === 'Weeks' && /deload week 4/.test(d.after)));
  assert.equal(plan.confirmedPayload.spec.days.length, 3, 'the token carries one week, not six');
  assert.ok(!p.preview.diff.some((d) => d.label === 'Why saved'), 'saved by rule, not because an assignment happened to span weeks');
  assert.ok(!ctx.supabase._calls.reads.some((r) => r.table === 'trainers'), 'no assignment was ever on the table');
});

test('draft_workout · a one-week program from a Monday is ONE publish; from mid-week it would be two, so it is saved', async () => {
  const reg = registry();
  let posted = [];
  const ctx = actionCtx(actionDb(), { model: scriptedModel(answer(RAW_WEEK)), call: (m, p, b) => { posted.push(b); return { ok: true, status: 200, data: { ok: true } }; } });
  const mon = nextMonday();
  const p = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'a week of strength', kind: 'program', weeks: 1, daysPerWeek: 3, clientId: 'client-9', clientName: 'Priya', startDate: mon }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true, p.message);
  assert.match(p.preview.summary, new RegExp(`assign it to Priya for the week of ${mon}$`));
  assert.ok(p.preview.diff.some((d) => d.label === `Mon ${mon} · Upper`), 'an assigned day is labelled by its date');
  const c = await confirmChange({ registry: reg, token: p.token, actor, ctx, secret: SECRET, audit: inMemoryAudit() });
  assert.equal(c.ok, true);
  assert.equal(posted.length, 1, 'one call');
  assert.equal(posted[0].sessions.length, 3, 'the whole week in it');
  assert.equal(new Set(posted[0].sessions.map((s) => s.payload.template.id)).size, 1);

  const thu = new Date(Date.parse(mon + 'T00:00:00Z') + 3 * 864e5).toISOString().slice(0, 10);
  const mid = await proposeChange({ registry: reg, action: 'draft_workout', input: { request: 'a week of strength', kind: 'program', weeks: 1, daysPerWeek: 3, clientId: 'client-9', clientName: 'Priya', startDate: thu }, actor, ctx, secret: SECRET });
  assert.equal(verifyToken(mid.token, SECRET).confirmedPayload.mode, 'save');
  assert.equal(mid.preview.diff[0].label, 'Why saved');
});

test('draft_workout · a template is labelled on the card and to the model, never passed off as AI', async () => {
  const ctx = actionCtx(actionDb({ units: 'Metric · kg / km' }), { model: null });
  const p = await proposeChange({ registry: registry(), action: 'draft_workout', input: { request: 'lower body, 50 min', kind: 'day', minutes: 50 }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, true, p.message);
  assert.ok(p.preview.summary.startsWith(TEMPLATE_NOTICE));
  assert.deepEqual(p.preview.diff[0], { label: 'Source', after: TEMPLATE_NOTICE });
  assert.match(p.preview.note, /TEMPLATE, not an AI draft/);
  const spec = verifyToken(p.token, SECRET).confirmedPayload.spec;
  assert.equal(spec.unit, 'kg', 'the coach\'s own Settings → Units');
  assert.ok(spec.days[0].blocks.every((b) => b.rows.every((r) => r.loadType === 'kg' && r.load === '')));
});

test('draft_workout · a request that is not a workout is a plain question back', async () => {
  const ctx = actionCtx(actionDb(), { model: scriptedModel(answer({ offTopic: true, name: '', days: [], progression: { deloadWeeks: [], rpeStep: 0 }, notes: '' })) });
  const p = await proposeChange({ registry: registry(), action: 'draft_workout', input: { request: 'write me a poem', kind: 'day' }, actor, ctx, secret: SECRET });
  assert.equal(p.ok, false);
  assert.equal(p.message, OFF_TOPIC_MESSAGE);
});

test('draft_workout · a long week is cut to a phone-sized card, the rest is in the builder', async () => {
  const big = { ...RAW_WEEK, days: Array.from({ length: 5 }, (_, d) => ({ name: `Day ${d}`, weekday: d, blocks: [{ kind: 'main', rows: Array.from({ length: 12 }, (_, i) => row(`Move ${i}`, 3, '8', 7, '90s')) }] })) };
  const ctx = actionCtx(actionDb(), { model: scriptedModel(answer(big)) });
  const p = await proposeChange({ registry: registry(), action: 'draft_workout', input: { request: 'five day split', kind: 'program', weeks: 4, daysPerWeek: 5 }, actor, ctx, secret: SECRET });
  const moves = p.preview.diff.filter((d) => d.label === '' && !/more in the builder/.test(d.after));
  assert.equal(moves.length, 36);
  assert.deepEqual(p.preview.diff.filter((d) => /more in the builder/.test(d.after)).map((d) => d.after), ['+12 more in the builder', '+12 more in the builder']);
});

// ── assign_workout: the date gap ────────────────────────────────────────────────
test('⚠ assign_workout asks for the day instead of previewing a workout the route will refuse', async () => {
  const r = createRegistry(); r.define(assignWorkoutAction.name, assignWorkoutAction);
  const ctx = actionCtx(actionDb());
  const none = await proposeChange({ registry: r, action: 'assign_workout', input: { clientId: 'client-9', clientName: 'Priya', title: 'Upper A' }, actor, ctx, secret: SECRET });
  assert.equal(none.ok, false);
  assert.equal(none.message, "Which day should I put 'Upper A' on Priya's calendar? Tell me the date and I'll draft it.");
  const bad = await proposeChange({ registry: r, action: 'assign_workout', input: { clientId: 'client-9', title: 'Upper A', scheduledDate: 'Monday' }, actor, ctx, secret: SECRET });
  assert.match(bad.message, /as a date \(YYYY-MM-DD\)/);
  const impossible = await proposeChange({ registry: r, action: 'assign_workout', input: { clientId: 'client-9', title: 'Upper A', scheduledDate: '2031-02-30' }, actor, ctx, secret: SECRET });
  assert.match(impossible.message, /as a date/);
  const past = await proposeChange({ registry: r, action: 'assign_workout', input: { clientId: 'client-9', title: 'Upper A', scheduledDate: isoPlus(-1) }, actor, ctx, secret: SECRET });
  assert.match(past.message, /has already passed/);
  const ok = await proposeChange({ registry: r, action: 'assign_workout', input: { clientId: 'client-9', clientName: 'Priya', title: 'Upper A', scheduledDate: isoPlus(1) }, actor, ctx, secret: SECRET });
  assert.equal(ok.ok, true);
  assert.match(ok.preview.summary, /\(title only, no exercises\)$/, 'the card says the session is empty');
  assert.ok(ok.preview.diff.some((d) => d.label === 'Exercises' && d.after === 'None — title only'));
});
