// /api/nutrition/recipe-parse, DRIVEN — not grepped.
//
// ⚠ WHY DRIVEN. This route is the boundary where MODEL OUTPUT becomes DATA, and
// every decision it makes is invisible to a source scan: that an unauthenticated
// request never reaches the provider, that a missing key is an honest
// `unavailable` rather than an empty draft, and — the one that matters most —
// that step metadata the model emits is DROPPED rather than carried. A recipe
// import may never host an interleave window (cookOrchestrator's binding "no
// fabricated parallelism"), and a model asked for JSON will happily invent
// `{passive: true, min: 40, station: 'oven'}` if the shape allows it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

// The REAL parseModelJson — this route's whole job is what happens to what that
// function returns, so stubbing it would test the stub.
// ai.ts re-exports several ./ai/* engines this route never reaches; a Map that
// answers for that whole prefix keeps the load to the one function under test.
class SubmoduleStubs extends Map {
  has(k) { return super.has(k) || String(k).startsWith('./ai/'); }
  get(k) { return super.has(k) ? super.get(k) : {}; }
}
const ai = await loadRealModule(join(ROOT, 'src/lib/ai.ts'), {
  typescript: true,
  registry: new SubmoduleStubs([['next/server', nextServer]]),
});
assert.equal(typeof ai.parseModelJson, 'function');

// ⚠ THE REAL readJson, NOT A STUB. The first version of this file stubbed it as
// `async (req) => req.json()` — a shape production never returns — and the route
// was reading `.text` off readJson's `{ ok, data }` WRAPPER, so every request
// resolved to `too_short` and the model was never called. The suite was green on
// a route that was dead in production. A fixture that invents a contract tests
// the fixture.
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), {
  typescript: true, registry: new Map([['next/server', nextServer]]),
});

const ROUTE = 'src/app/api/nutrition/recipe-parse/route.ts';

function loadRoute({ user = { id: 'u1' }, denied = null, hasKey = true, aiResult, onCall } = {}) {
  const calls = { ai: 0, lastArgs: null };
  return loadRealModule(join(ROOT, ROUTE), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/require-membership', { requireMembership: async () => denied }],
      ['@/lib/ai', {
        parseModelJson: ai.parseModelJson,
        hasOpenAIKey: () => hasKey,
        callAI: async (payload, opts) => {
          calls.ai += 1; calls.lastArgs = { payload, opts };
          if (onCall) onCall(payload, opts);
          return typeof aiResult === 'function' ? aiResult() : aiResult;
        },
      }],
    ]),
  }).then((mod) => ({ mod, calls }));
}

const req = (body) => new Request('https://x/api/nutrition/recipe-parse', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

const modelSays = (obj) => ({ ok: true, data: { output_text: typeof obj === 'string' ? obj : JSON.stringify(obj) } });

const LONG = 'Ingredients: two eggs, a cup of flour. Method: whisk them together and cook.';

test('an unauthenticated request never reaches the provider', async () => {
  const { mod, calls } = await loadRoute({ user: null });
  const res = await mod.POST(req({ text: LONG }));
  assert.equal(res.status, 401);
  assert.equal(calls.ai, 0);
});

test('the membership gate short-circuits before anything else', async () => {
  const denied = nextServer.NextResponse.json({ error: 'no' }, { status: 402 });
  const { mod, calls } = await loadRoute({ denied });
  const res = await mod.POST(req({ text: LONG }));
  assert.equal(res.status, 402);
  assert.equal(calls.ai, 0);
});

test('no key configured is an honest unavailable, never an empty draft', async () => {
  const { mod, calls } = await loadRoute({ hasKey: false });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.equal(body.draft, null);
  assert.equal(body.unavailable, true);
  assert.equal(body.reason, 'no_key');
  assert.equal(calls.ai, 0);
  // ⚠ `{ingredients: [], steps: []}` would be the positive claim "this recipe
  // has no ingredients"; the review screen would render it as a finding.
  assert.equal('ingredients' in body, false);
});

test('too little text is refused before the provider is paid for it', async () => {
  const { mod, calls } = await loadRoute({});
  const body = await (await mod.POST(req({ text: 'eggs' }))).json();
  assert.equal(body.reason, 'too_short');
  assert.equal(calls.ai, 0);
});

test('a provider failure degrades honestly', async () => {
  const { mod } = await loadRoute({ aiResult: { ok: false, reason: 'rate_limited' } });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.equal(body.draft, null);
  assert.equal(body.unavailable, true);
  assert.equal(body.reason, 'rate_limited');
});

test('a good draft comes back labelled as the model\'s', async () => {
  const { mod } = await loadRoute({
    aiResult: modelSays({ title: 'Pancakes', servings: 2, ingredients: [{ n: '2', m: 'eggs' }, { n: '1 cup', m: 'flour' }], steps: ['Whisk the eggs.', 'Fold in the flour.'] }),
  });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.equal(body.model, true);
  assert.equal(body.draft.title, 'Pancakes');
  assert.equal(body.draft.servings, 2);
  assert.deepEqual(body.draft.ingredients, [{ n: '2', m: 'eggs' }, { n: '1 cup', m: 'flour' }]);
  assert.deepEqual(body.draft.steps, ['Whisk the eggs.', 'Fold in the flour.']);
});

test('⚠ STEP METADATA THE MODEL EMITS IS DROPPED — a step is text and nothing else', async () => {
  const { mod } = await loadRoute({
    aiResult: modelSays({
      title: 'Braise', servings: 4,
      ingredients: [{ n: '400 g', m: 'beef' }],
      steps: [
        { t: 'Sear the beef.' },
        { t: 'Cover and braise for 90 minutes.', min: 90, passive: true, station: 'oven' },
      ],
    }),
  });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.deepEqual(body.draft.steps, ['Sear the beef.', 'Cover and braise for 90 minutes.']);
  // Not "the window is false" — the FIELDS do not exist. A string cannot carry
  // one, which is why the steps are flattened rather than sanitised.
  for (const s of body.draft.steps) assert.equal(typeof s, 'string');
  assert.equal(JSON.stringify(body.draft).includes('passive'), false);
  assert.equal(JSON.stringify(body.draft).includes('station'), false);
});

test('the system prompt forbids the metadata as well, so the drop is the belt', async () => {
  let sys = '';
  const { mod } = await loadRoute({
    aiResult: modelSays({ title: 'T', ingredients: [{ n: '1', m: 'x' }], steps: ['One.'] }),
    onCall: (payload) => { sys = payload.input.find((m) => m.role === 'system').content; },
  });
  await mod.POST(req({ text: LONG }));
  assert.match(sys, /passive/i);
  assert.match(sys, /never invent a quantity/i);
});

test('fenced JSON is unwrapped rather than failing the parse', async () => {
  const { mod } = await loadRoute({
    aiResult: modelSays('```json\n{"title":"T","servings":null,"ingredients":[{"n":"1","m":"egg"}],"steps":["One."]}\n```'),
  });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.equal(body.draft.title, 'T');
  assert.deepEqual(body.draft.steps, ['One.']);
});

test('the Responses content blocks are walked when output_text is absent', async () => {
  const { mod } = await loadRoute({
    aiResult: { ok: true, data: { output: [{ content: [{ text: '{"title":"T","ingredients":[{"n":"1","m":"egg"}],"steps":["One."]}' }] }] } },
  });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.equal(body.draft.title, 'T');
});

test('a model that returns nothing usable is unavailable, not an empty recipe', async () => {
  for (const said of [
    { title: 'T', ingredients: [], steps: [] },
    'not json at all',
    { title: 'T' },
  ]) {
    const { mod } = await loadRoute({ aiResult: modelSays(said) });
    const body = await (await mod.POST(req({ text: LONG }))).json();
    assert.equal(body.draft, null, JSON.stringify(said));
    assert.equal(body.reason, 'no_draft');
  }
});

test('hostile field types are coerced or dropped, never passed through', async () => {
  const { mod } = await loadRoute({
    aiResult: modelSays({
      title: { evil: 1 },
      servings: 10000,
      ingredients: [{ n: 5, m: 'eggs' }, { n: '1', m: '' }, 'string row', null, { m: 'flour' }],
      steps: ['ok', '', null, 42, { t: '' }],
    }),
  });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.equal(body.draft.title, '');
  // 10000 servings is not a serving count.
  assert.equal(body.draft.servings, null);
  // A numeric quantity is not a string; the row keeps its name and loses the n.
  assert.deepEqual(body.draft.ingredients, [{ n: '', m: 'eggs' }, { n: '', m: 'flour' }]);
  assert.deepEqual(body.draft.steps, ['ok']);
});

test('an oversized answer is bounded rather than trusted', async () => {
  const { mod } = await loadRoute({
    aiResult: modelSays({
      title: 'x'.repeat(500),
      ingredients: Array.from({ length: 400 }, (_, i) => ({ n: '1', m: `row ${i}` })),
      steps: Array.from({ length: 400 }, (_, i) => `step ${i}`),
    }),
  });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.equal(body.draft.title.length, 160);
  assert.equal(body.draft.ingredients.length, 120);
  assert.equal(body.draft.steps.length, 80);
});

test('a malformed body is readJson\'s 400, not a silent too_short', async () => {
  const { mod, calls } = await loadRoute({});
  const raw = new Request('https://x/api/nutrition/recipe-parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  const res = await mod.POST(raw);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Malformed JSON.');
  assert.equal(calls.ai, 0);
});

test('an empty body is refused by readJson too', async () => {
  const { mod } = await loadRoute({});
  const raw = new Request('https://x/api/nutrition/recipe-parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '' });
  assert.equal((await mod.POST(raw)).status, 400);
});

test('an oversized body is 413 before anything is parsed', async () => {
  const { mod, calls } = await loadRoute({});
  const raw = new Request('https://x/api/nutrition/recipe-parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '99000000' },
    body: JSON.stringify({ text: LONG }),
  });
  assert.equal((await mod.POST(raw)).status, 413);
  assert.equal(calls.ai, 0);
});

test('⚠ A REAL PASTE REACHES THE MODEL — the wrapper is unwrapped', async () => {
  // The regression this file exists for: with `.text` read off the wrapper the
  // route answered `too_short` for every request in production while the suite
  // stayed green on a stub.
  let sawText = '';
  const { mod, calls } = await loadRoute({
    aiResult: modelSays({ title: 'T', ingredients: [{ n: '1', m: 'egg' }], steps: ['One.'] }),
    onCall: (payload) => { sawText = payload.input.find((m) => m.role === 'user').content; },
  });
  const body = await (await mod.POST(req({ text: LONG }))).json();
  assert.equal(calls.ai, 1);
  assert.equal(sawText, LONG);
  assert.equal(body.model, true);
});

test('the route is registered in the War Room', async () => {
  // RAW_ROUTES is a hand-maintained literal (the src/app/api tree is not traced
  // into the serverless bundle, so /warroom cannot walk it at runtime). It is
  // module-private, so it is EXPORTED for this read rather than grepped — a
  // grep would also match the path inside a comment.
  const warroom = await loadRealModule(join(ROOT, 'src/lib/warroom.ts'), {
    typescript: true,
    appendExports: 'export const __RAW_ROUTES = RAW_ROUTES;',
    registry: new Map([
      ['fs/promises', { readdir: async () => [], stat: async () => ({}) }],
      ['fs', { existsSync: () => false }],
      ['path', createRequire(join(ROOT, 'package.json'))('path')],
      ['./funnel.mjs', { buildFunnel: () => ({}) }],
      ['./supabase/admin', { createAdminClient: () => null }],
    ]),
  });
  const paths = warroom.__RAW_ROUTES.map(([p]) => p);
  assert.ok(paths.length > 100, 'the route table did not load');
  assert.ok(paths.includes('/api/nutrition/recipe-parse'), 'recipe-parse missing from the API surface');
  // No duplicates — a second entry would double-count on the board.
  assert.equal(paths.filter((x) => x === '/api/nutrition/recipe-parse').length, 1);
});
