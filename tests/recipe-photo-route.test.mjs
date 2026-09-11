// /api/nutrition/recipe-photo, DRIVEN — not grepped.
//
// ⚠ WHY DRIVEN. This route is the second place member input becomes a recipe
// draft, and its decisions are invisible to a source scan: that an
// unauthenticated request never reaches the provider, that an image this
// endpoint's next hop would refuse is refused HERE instead (where the route can
// say why), that the Responses API content-block shape is the one
// this endpoint actually takes (Chat Completions' is different and is a 400),
// and — the one with teeth — that a provider refusal comes back as a NAMED
// failure the sheet can say something true about, never as an empty draft.
//
// ⚠ AND THE PHOTO IS NEVER STORED. There is no bucket, no path, no signed URL:
// the bytes exist for one request. A test asserts nothing reaches storage,
// because "we didn't build it" stops being true the moment someone adds it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

class SubmoduleStubs extends Map {
  has(k) { return super.has(k) || String(k).startsWith('./ai/'); }
  get(k) { return super.has(k) ? super.get(k) : {}; }
}
const ai = await loadRealModule(join(ROOT, 'src/lib/ai.ts'), {
  typescript: true, registry: new SubmoduleStubs([['next/server', nextServer]]),
});
// The REAL shared module — the prompt and the validator are what several of
// these tests assert on, so a stub would make them vacuous.
const recipeDraft = await loadRealModule(join(ROOT, 'src/lib/recipe-draft.ts'), { typescript: true });
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), {
  typescript: true, registry: new Map([['next/server', nextServer]]),
});

const ROUTE = 'src/app/api/nutrition/recipe-photo/route.ts';

function loadRoute({ user = { id: 'u1' }, denied = null, hasKey = true, aiResult } = {}) {
  const calls = { ai: 0, lastArgs: null };
  return loadRealModule(join(ROOT, ROUTE), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/recipe-draft', recipeDraft],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/require-membership', { requireMembership: async () => denied }],
      ['@/lib/ai', {
        parseModelJson: ai.parseModelJson,
        hasOpenAIKey: () => hasKey,
        callAI: async (payload, opts) => {
          calls.ai += 1; calls.lastArgs = { payload, opts };
          return aiResult ?? { ok: true, data: { output_text: '{}' }, usage: null, latencyMs: 1, promptId: opts.promptId };
        },
      }],
    ]),
  }).then((mod) => ({ mod, calls }));
}

// A 1x1 JPEG is too small to pass the "is this plausibly an image" floor, so the
// fixtures pad to a realistic size. The bytes need not be a valid JPEG — nothing
// in the route decodes the image, and pretending otherwise would test a decoder
// this route does not have.
const b64 = (bytes) => Buffer.alloc(bytes, 7).toString('base64');
const IMAGE = `data:image/jpeg;base64,${b64(4000)}`;
const post = (body) => new Request('https://x/api/nutrition/recipe-photo', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const json = async (res) => res.json();

test('an unauthenticated request never reaches the provider', async () => {
  const { mod, calls } = await loadRoute({ user: null });
  const res = await mod.POST(post({ image: IMAGE }));
  assert.equal(res.status, 401);
  assert.equal(calls.ai, 0, 'provider quota must never be burned for an anonymous caller');
});

test('the membership gate short-circuits before anything else', async () => {
  const denied = nextServer.NextResponse.json({ error: 'nope' }, { status: 402 });
  const { mod, calls } = await loadRoute({ denied });
  assert.equal((await mod.POST(post({ image: IMAGE }))).status, 402);
  assert.equal(calls.ai, 0);
});

test('no key configured is an honest unavailable, never an empty draft', async () => {
  const { mod, calls } = await loadRoute({ hasKey: false });
  const out = await json(await mod.POST(post({ image: IMAGE })));
  assert.deepEqual(out, { draft: null, unavailable: true, reason: 'no_key' });
  assert.equal(calls.ai, 0);
});

test('⚠ EVERY BAD IMAGE IS REFUSED BEFORE THE PROVIDER, AND EACH IS NAMED', async () => {
  // The names are the point: the sheet says something different for each, and a
  // single "couldn't read that" would be true of all of them and useful for none.
  const cases = [
    [undefined, 'no_image'],
    ['', 'no_image'],
    ['not-a-data-url', 'bad_image'],
    [`data:text/html;base64,${b64(4000)}`, 'unsupported_type'],
    // ⚠ image/heic IS THE INTERESTING ONE, AND IT IS REFUSED ON PURPOSE
    // DESPITE BEING WHAT IPHONES PRODUCE. The provider does not take it, so
    // admitting it guaranteed a 400 this route could only report as "we
    // couldn't read your photo" while its log blamed the model's vision
    // capability. An allow-list that admits what the next hop refuses is worse
    // than one that refuses it here, because only one of the two can say why.
    // The app re-encodes every pick to JPEG through a canvas, so no member
    // reaches this.
    [`data:image/heic;base64,${b64(4000)}`, 'unsupported_type'],
    [`data:image/svg+xml;base64,${b64(4000)}`, 'unsupported_type'],
    [`data:image/jpeg;base64,${b64(40)}`, 'bad_image'],          // implausibly small
    // ⚠ 720_000 AND NOT MORE, ON PURPOSE. base64 inflates by 4/3, so anything
    // over ~750_000 decoded exceeds readJson's 1 MB body limit and comes back as
    // its generic 413 before this route's guard ever runs — a real ordering, and
    // the reason the client downscales to a 640_000 budget rather than relying on
    // either. This fixture sits in the band the ROUTE judges; the 413 above it is
    // covered by its own test.
    [`data:image/jpeg;base64,${b64(720_000)}`, 'too_large'],
  ];
  for (const [image, reason] of cases) {
    const { mod, calls } = await loadRoute();
    const out = await json(await mod.POST(post({ image })));
    assert.deepEqual(out, { draft: null, unavailable: true, reason }, `for ${String(image).slice(0, 40)}`);
    assert.equal(calls.ai, 0, 'a refused image must never reach the provider');
  }

  // ⚠ AND THE POSITIVE CONTROL, WITHOUT WHICH ALL OF THE ABOVE PASSES ON A
  // ROUTE THAT REFUSES EVERYTHING. Every type the provider does take must get
  // through to it — a guard is only doing its job if it lets the good case past.
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    const { mod, calls } = await loadRoute();
    await mod.POST(post({ image: `data:${mime};base64,${b64(4000)}` }));
    assert.equal(calls.ai, 1, `${mime} is a type the provider accepts and must reach it`);
  }
});

test('⚠ THE RESPONSES API CONTENT-BLOCK SHAPE, NOT CHAT COMPLETIONS\'', async () => {
  // ai.ts targets /v1/responses and its own header warns against inferring this
  // from the older endpoint. Responses takes input_text / input_image with
  // image_url as a STRING; Chat Completions takes {type:'image_url',
  // image_url:{url}}. The wrong one is a 400 and the feature is simply dead.
  const { mod, calls } = await loadRoute();
  await mod.POST(post({ image: IMAGE }));
  assert.equal(calls.ai, 1);
  const input = calls.lastArgs.payload.input;
  const userTurn = input.find((m) => m.role === 'user');
  assert.ok(Array.isArray(userTurn.content), 'the user turn must be content blocks, not a string');
  const img = userTurn.content.find((c) => c.type === 'input_image');
  assert.ok(img, `no input_image block: ${JSON.stringify(userTurn.content)}`);
  assert.equal(typeof img.image_url, 'string', 'Responses takes image_url as a string');
  assert.ok(img.image_url.startsWith('data:image/jpeg;base64,'));
  assert.ok(userTurn.content.some((c) => c.type === 'input_text'), 'and an input_text block beside it');
  // The shapes that are NOT this endpoint's.
  assert.ok(!userTurn.content.some((c) => c.type === 'image_url'), 'that is the Chat Completions block');
  assert.equal(calls.lastArgs.opts.promptId, 'nutrition.recipe-photo');
});

test('⚠ THE PHOTO PROMPT FORBIDS GUESSING AT WHAT IT CANNOT READ', async () => {
  // A misread digit and an invented line are the two failures a member cannot
  // catch on the review screen: a gap is visible, a wrong quantity looks
  // finished. And step metadata stays forbidden here exactly as on the paste
  // path — an imported recipe may never host an interleave window.
  const { mod, calls } = await loadRoute();
  await mod.POST(post({ image: IMAGE }));
  const sys = calls.lastArgs.payload.input.find((m) => m.role === 'system').content;
  assert.match(sys, /OMIT that row or step/i, 'illegible text must be omitted, not guessed');
  assert.match(sys, /transcrib/i);
  assert.match(sys, /Never emit timing, station or passive/i, 'the no-metadata rule is shared, not dropped');
  assert.match(sys, /amount INCLUDING its unit/i, 'and so is the unit rule');
  assert.match(sys, /return empty arrays rather than describing what you see/i, 'a photo of food is not a recipe');
});

test('⚠ A PROVIDER 4xx IS NAMED photo_unreadable — a dead vision model cannot look like an empty recipe', async () => {
  // This build's OPENAI_MODEL may have no vision capability, in which case every
  // photo import fails right here. The route does not claim to know that is the
  // cause (the same 400 covers a dozen others), but it must not hand back
  // something the sheet renders as "your photo had no ingredients".
  const { mod } = await loadRoute({
    aiResult: { ok: false, reason: 'http_error', status: 400, detail: 'model does not support image input', latencyMs: 1, promptId: 'p' },
  });
  const out = await json(await mod.POST(post({ image: IMAGE })));
  assert.deepEqual(out, { draft: null, unavailable: true, reason: 'photo_unreadable' });
});

test('a 5xx or a timeout keeps the provider\'s own reason, which is a different sentence', async () => {
  for (const [res, reason] of [
    [{ ok: false, reason: 'http_error', status: 503, latencyMs: 1, promptId: 'p' }, 'http_error'],
    [{ ok: false, reason: 'timeout', latencyMs: 1, promptId: 'p' }, 'timeout'],
    [{ ok: false, reason: 'network', latencyMs: 1, promptId: 'p' }, 'network'],
  ]) {
    const { mod } = await loadRoute({ aiResult: res });
    assert.equal((await json(await mod.POST(post({ image: IMAGE })))).reason, reason);
  }
});

test('⚠ AN EMPTY DRAFT IS A FAILURE, NEVER A RESULT', async () => {
  // `{ingredients: [], steps: []}` is the positive claim "this photo contains a
  // recipe with no ingredients". On the photo path the likeliest cause is that
  // the member photographed something that is not a recipe — which they need told.
  for (const body of ['{}', '{"title":"Soup","ingredients":[],"steps":[]}', 'not json at all']) {
    const { mod } = await loadRoute({ aiResult: { ok: true, data: { output_text: body }, usage: null, latencyMs: 1, promptId: 'p' } });
    const out = await json(await mod.POST(post({ image: IMAGE })));
    assert.deepEqual(out, { draft: null, unavailable: true, reason: 'no_draft' }, `for ${body}`);
  }
});

test('⚠ STEP METADATA THE MODEL EMITS IS DROPPED — a step is text and nothing else', async () => {
  const { mod } = await loadRoute({
    aiResult: {
      ok: true, usage: null, latencyMs: 1, promptId: 'p',
      data: { output_text: JSON.stringify({
        title: 'Braise', servings: 4,
        ingredients: [{ n: '2 lb', m: 'beef' }],
        steps: [{ t: 'Braise for 40 minutes', passive: true, min: 40, station: 'oven' }, 'Rest it'],
      }) },
    },
  });
  const out = await json(await mod.POST(post({ image: IMAGE })));
  assert.deepEqual(out.draft.steps, ['Braise for 40 minutes', 'Rest it']);
  assert.equal(JSON.stringify(out.draft).includes('passive'), false);
  assert.equal(JSON.stringify(out.draft).includes('station'), false);
  assert.equal(out.model, true);
});

test('a good transcription comes back labelled as the model\'s', async () => {
  const { mod } = await loadRoute({
    aiResult: {
      ok: true, usage: null, latencyMs: 1, promptId: 'p',
      data: { output_text: '```json\n' + JSON.stringify({
        title: "Nana's lemon chicken", servings: 4,
        ingredients: [{ n: '1/2 cup', m: 'flour' }, { n: '', m: 'salt' }],
        steps: ['Heat the oven.', 'Roast it.'],
      }) + '\n```' },
    },
  });
  const out = await json(await mod.POST(post({ image: IMAGE })));
  assert.equal(out.model, true);
  assert.equal(out.draft.title, "Nana's lemon chicken");
  assert.equal(out.draft.servings, 4);
  assert.deepEqual(out.draft.ingredients, [{ n: '1/2 cup', m: 'flour' }, { n: '', m: 'salt' }]);
  assert.deepEqual(out.draft.steps, ['Heat the oven.', 'Roast it.']);
});

test('a malformed or oversized body is readJson\'s own response, not a silent no_image', async () => {
  const { mod, calls } = await loadRoute();
  const bad = new Request('https://x/api/nutrition/recipe-photo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops',
  });
  assert.equal((await mod.POST(bad)).status, 400);
  const huge = new Request('https://x/api/nutrition/recipe-photo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: `data:image/jpeg;base64,${b64(1_200_000)}` }),
  });
  assert.equal((await mod.POST(huge)).status, 413);
  assert.equal(calls.ai, 0);
});

test('⚠ THE PHOTO IS NEVER STORED — no bucket, no path, no signed URL', async () => {
  // Deliberate: keeping it would mean a migration, a second signed-URL surface,
  // a new row in the GDPR export, a deletion obligation, and indefinite
  // retention of what is very often someone else's copyrighted cookbook page.
  // This asserts on the SOURCE because the absence of a call is exactly what
  // cannot be observed by driving the route.
  const { readFileSync } = await import('node:fs');
  // ⚠ COMMENTS STRIPPED FIRST, with the SHARED stripper. This route's own header
  // explains at length why it does not touch storage — so a naive scan matches
  // the word "storage" in the prose that exists to say it is absent, and the
  // guard fails on correct code. (It did, on the first run.) The repo has one
  // stripper on purpose: three local copies each re-introduced a lazy /* … */
  // span that silently ate the source they were asserting over.
  const src = stripComments(readFileSync(join(ROOT, ROUTE), 'utf8'));
  for (const forbidden of ['storage', 'createSignedUrl', 'recipe-imports', 'upload(']) {
    assert.equal(src.includes(forbidden), false, `${forbidden} appears — the photo is being persisted`);
  }
  // And the response carries no path back to the client.
  const { mod } = await loadRoute({
    aiResult: { ok: true, usage: null, latencyMs: 1, promptId: 'p',
      data: { output_text: JSON.stringify({ title: 'X', ingredients: [{ n: '1', m: 'egg' }], steps: ['Cook'] }) } },
  });
  const out = await json(await mod.POST(post({ image: IMAGE })));
  assert.deepEqual(Object.keys(out).sort(), ['draft', 'model']);
  assert.deepEqual(Object.keys(out.draft).sort(), ['ingredients', 'servings', 'steps', 'title']);
});

test('⚠ THE IMAGE GUARD IS NOT EXPORTED FROM THE ROUTE, and it decodes nothing', async () => {
  // ⚠ THE FIRST HALF IS A BUILD ERROR, NOT A PREFERENCE. An App Router route
  // file exporting anything outside the handler set fails the webpack typegen
  // path (`checkFields<Diff<…>>`), and this was the only route in the repo doing
  // it — exported purely so this test could reach it. It lives beside the
  // validator now, where it is reachable without standing up the route and its
  // five stubs.
  const { mod } = await loadRoute();
  assert.equal(typeof mod.parseImageDataUrl, 'undefined', 'a route may export only its handlers and its config');
  assert.deepEqual(Object.keys(mod).sort(), ['POST', 'dynamic', 'maxDuration', 'runtime']);

  // ⚠ AND NOTHING HERE DECODES. An earlier draft ran Buffer.from purely to
  // measure the decoded length and threw the buffer away — up to 700 KB of
  // garbage on the hot path of the feature's only request, since the provider is
  // sent the base64 string, never the buffer. 40 MB of base64 must be refused
  // without ever being materialised as bytes, and the wall clock is the only
  // instrument that can tell the difference.
  const { parseImageDataUrl } = recipeDraft;
  assert.equal(typeof parseImageDataUrl, 'function');
  const t0 = Date.now();
  const huge = parseImageDataUrl(`data:image/jpeg;base64,${'A'.repeat(40_000_000)}`);
  assert.deepEqual(huge, { ok: false, reason: 'too_large' });
  assert.ok(Date.now() - t0 < 2000, 'the oversize path decoded when it should have refused');

  const ok = parseImageDataUrl(IMAGE);
  assert.equal(ok.ok, true);
  assert.equal(ok.mime, 'image/jpeg');
  assert.equal(ok.bytes, 4000);
  // The data URL handed onward is REBUILT from the validated mime and the
  // whitespace-stripped payload, never echoed — the mime is attacker-controlled
  // text on its way into an outbound request.
  assert.equal(ok.dataUrl, IMAGE);
});
