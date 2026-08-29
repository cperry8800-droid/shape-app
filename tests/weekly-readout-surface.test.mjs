// The weekly readout's SURFACE: what the Progress-hub station renders, and what
// the data-layer helper resolves.
//
// ⚠ THE CARD IS DRIVEN, NOT GREPPED. It is mounted through the shared broadsheet
// harness with a react impl whose `useEffect` actually runs, so the fetch → state
// → render path is the one production takes. A guard that matched the source text
// would pin a spelling; these pin what the component ANSWERS (the #1936 lesson).
//
// The data-layer half cannot be imported — shapeBackend.js is a classic browser
// script — so `getWeeklyReadout` is brace-matched out of the shipped file and
// evaluated against stubs, the same technique tests/online-visible-pref.test.mjs
// uses for public/supabase.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadBroadsheet, drive, SHIM, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

// The harness no-ops effects by design (the real ones start wall-clock intervals).
// This card's whole job is to render what an effect fetched, so it gets an impl
// that runs them — everything else, including the hook cells, stays the harness's.
const RUN_EFFECTS = { ...SHIM, useEffect(fn) { fn(); } };
const { BSWeeklyReadoutCard } = await loadBroadsheet(['BSWeeklyReadoutCard'], RUN_EFFECTS);

const tick = () => new Promise((r) => setTimeout(r, 0));

const FULL = {
  source: 'openai',
  cached: false,
  window_days: 90,
  sample_size: 41,
  readout: {
    summary: 'Your sleep is carrying the week.',
    insights: [
      {
        correlation_key: 'sleep_hours:recovery_score:1',
        headline: 'Sleep leads recovery',
        detail: 'Nights over seven hours are followed by higher recovery.',
        recommendation: 'Protect the wind-down on training days.',
      },
      {
        correlation_key: 'protein_g:soreness:0',
        headline: 'Protein tracks soreness',
        detail: 'Higher protein days read as less sore.',
        recommendation: '',
      },
    ],
  },
};

// Render the card with whatever `ShapeReadout.get` resolves, and let the effect settle.
async function render(props, resolved) {
  globalThis.window.ShapeReadout = { get: async () => resolved };
  const d = drive(BSWeeklyReadoutCard, props);
  await tick();
  return d.render();
}

// The redaction line is a local COMPONENT whose text rides on a `label` prop, so it
// never appears in `textOf` (which walks children). Assert on the node, the way the
// harness's own clickChip finds a chip — matching the text would silently pass on a
// station that dropped the component entirely.
const redactedWith = (d, label) => d.nodes()
  .some((n) => typeof n.type === 'function' && n.props && n.props.label === label);

test('a full readout renders its summary, every insight, and the recommendations', async () => {
  const d = await render({ isSelf: true }, FULL);
  assert.match(d.text, /Your sleep is carrying the week\./);
  assert.match(d.text, /Sleep leads recovery/);
  assert.match(d.text, /Nights over seven hours/);
  assert.match(d.text, /Protect the wind-down/);
  assert.match(d.text, /Protein tracks soreness/);
});

// ⚠ THE SIGNED-OUT PREVIEW RENDERS NOTHING, which departs from this hub's
// demo-for-signed-out convention deliberately: every other station shows an
// example of a live account, but a READOUT is a claim about a specific person's
// own body. A demo one would be a fabricated health insight presented as a finding.
test('signed out renders nothing at all — never a demo readout', async () => {
  const d = await render({ isSelf: false }, FULL);
  assert.equal(d.text, '');
  assert.equal(d.nodes().length, 0);
});

// ⚠ THE RENDER GUARD IS FOR THE STALE FRAME, and only this test reaches it.
// React runs effects AFTER the commit, so when a member signs out there is exactly
// one render where `isSelf` is already false and `data` still holds the readout the
// previous session fetched. Dropping `!isSelf` from the render guard paints that
// member's health insights into the signed-out preview for a frame — the same
// cross-account class as the _followCache leak and the profile that painted one
// frame of B's name beside A's age. Mutating the props object and re-rendering
// reproduces the frame exactly: the effect's setData(null) writes the cell, but this
// render already read `data` above it.
test('signing out renders nothing on the very frame before the effect clears it', async () => {
  globalThis.window.ShapeReadout = { get: async () => FULL };
  const props = { isSelf: true };
  const d = drive(BSWeeklyReadoutCard, props);
  await tick();
  d.render();
  assert.match(d.text, /Your sleep is carrying the week\./, 'setup: the readout never loaded');
  props.isSelf = false;
  d.render();
  assert.equal(d.nodes().length, 0, "the previous member's readout painted into the signed-out preview");
});

test('a failed fetch renders nothing, not a stale or partial station', async () => {
  const d = await render({ isSelf: true }, null);
  assert.equal(d.nodes().length, 0);
});

test('a response with no readout renders nothing', async () => {
  const d = await render({ isSelf: true }, { source: 'openai', window_days: 90, sample_size: 41 });
  assert.equal(d.nodes().length, 0);
});

// ⚠ THE STAMP IS THE RESPONSE'S, NOT THE REQUEST'S. On a cache hit the route
// reports the window and sample the readout was actually computed from; rendering
// a request default here would undo that at the last step.
test('the stamp reads the response window and sample, not a default', async () => {
  const d = await render({ isSelf: true }, FULL);
  assert.match(d.text, /90-day window/);
  assert.match(d.text, /41 days logged/);
  const other = await render({ isSelf: true }, { ...FULL, window_days: 30, sample_size: 12 });
  assert.match(other.text, /30-day window/);
  assert.match(other.text, /12 days logged/);
  assert.doesNotMatch(other.text, /90-day window/);
});

test('an absent window or sample is omitted rather than rendered as a zero', async () => {
  const d = await render({ isSelf: true }, { ...FULL, window_days: null, sample_size: null });
  assert.match(d.text, /Your sleep is carrying the week\./);
  assert.doesNotMatch(d.text, /window/i);
  assert.doesNotMatch(d.text, /days logged/);
});

// ⚠ THE DETERMINISTIC READOUT SAYS SO. It is real evidence, honestly rendered —
// but it is not the AI reading of it, and a member who cannot tell the two apart
// has been told something untrue about where the words came from.
test('a fallback readout is labelled and a model readout is not', async () => {
  const model = await render({ isSelf: true }, FULL);
  assert.doesNotMatch(model.text, /Computed, not written/);
  const fallback = await render({ isSelf: true }, { ...FULL, source: 'fallback' });
  assert.match(fallback.text, /Computed, not written/);
});

// Not a failure — the honest output of a member who has not yet logged enough
// overlapping days for any pair to clear the gate.
test('no insights renders the redaction line, never an empty finding list', async () => {
  const d = await render({ isSelf: true }, {
    ...FULL,
    source: 'fallback',
    readout: { summary: 'Not enough overlapping days yet.', insights: [] },
  });
  assert.match(d.text, /Not enough overlapping days yet\./);
  assert.ok(redactedWith(d, 'No pattern on record yet'), 'the empty state is not redacted');
});

test('a malformed insights field degrades to the redaction line rather than throwing', async () => {
  const d = await render({ isSelf: true }, { ...FULL, readout: { summary: 'A summary.', insights: 'nope' } });
  assert.match(d.text, /A summary\./);
  assert.ok(redactedWith(d, 'No pattern on record yet'), 'a malformed insights field is not redacted');
});

// -- the mount ---------------------------------------------------------------
// A card nothing renders is a card that ships dead. This is a source guard on
// purpose: the Progress hub itself is not mountable here (it opens six network
// reads and an intersection observer per station).
test('the station is mounted in the Progress hub Overall tab', () => {
  const src = stripComments(fs.readFileSync(SRC, 'utf8'));
  assert.match(src, /<BSWeeklyReadoutCard\s+isSelf=\{signedIn\}\s*\/>/,
    'the card is not mounted, or no longer takes the hub signed-in flag');
});

// -- the data layer ----------------------------------------------------------
function extractFn(src, marker, label) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, `${label}: marker not found — ${marker}`);
  assert.equal(src.indexOf(marker, i + 1), -1, `${label}: marker is ambiguous — ${marker}`);
  const open = src.indexOf('{', i + marker.length - 1);
  assert.ok(open > 0, `${label}: no body`);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error(`${label}: unbalanced body`);
}

const BACKEND = fs.readFileSync('mobile-app/src/services/shapeBackend.js', 'utf8');
const getReadoutSrc = extractFn(BACKEND, 'async function getWeeklyReadout({ windowDays } = {})', 'getWeeklyReadout');

// Build the SHIPPED function against stubs, capturing the request it makes.
function buildGetReadout(fetchImpl) {
  const calls = [];
  const fn = new Function(
    'fetch', 'apiBaseUrl', 'sessionsAuthHeaders',
    `${getReadoutSrc}\nreturn getWeeklyReadout;`,
  )(
    (url, init) => { calls.push({ url, init }); return fetchImpl(url, init); },
    'https://api.test',
    () => ({ Authorization: 'Bearer t' }),
  );
  return { fn, calls };
}

const ok = (body) => async () => ({ ok: true, json: async () => body });

test('the helper posts to the readout route with the native base and bearer', async () => {
  const { fn, calls } = buildGetReadout(ok(FULL));
  await fn();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.test/api/ai/weekly-readout');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t');
  assert.equal(calls[0].init.credentials, 'same-origin');
});

test('a window override rides in the body; the default sends none', async () => {
  const withWindow = buildGetReadout(ok(FULL));
  await withWindow.fn({ windowDays: 30 });
  assert.deepEqual(JSON.parse(withWindow.calls[0].init.body), { window_days: 30 });
  const plain = buildGetReadout(ok(FULL));
  await plain.fn();
  assert.deepEqual(JSON.parse(plain.calls[0].init.body), {});
});

test('the helper resolves the response when it carries a readout', async () => {
  const { fn } = buildGetReadout(ok(FULL));
  assert.deepEqual(await fn(), FULL);
});

// Every failure resolves NULL rather than rejecting — the card has no error state
// by design, so a rejection here would surface as an unhandled promise instead.
test('a non-ok response, a readout-less body, and a thrown fetch all resolve null', async () => {
  const notOk = buildGetReadout(async () => ({ ok: false, json: async () => FULL }));
  assert.equal(await notOk.fn(), null);
  const noReadout = buildGetReadout(ok({ source: 'openai', window_days: 90 }));
  assert.equal(await noReadout.fn(), null);
  const threw = buildGetReadout(async () => { throw new Error('offline'); });
  assert.equal(await threw.fn(), null);
  const badJson = buildGetReadout(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }));
  assert.equal(await badJson.fn(), null);
});

// ⚠ THE READOUT IS DELIBERATELY OUTSIDE THE SHARED METRICS CACHE. That cache
// exists so several surfaces can read one rollup response; this route MUTATES —
// it claims a lease and may spend a model call — so a cached second reader would
// be a second claim, not a free read.
test('the helper does not ride the shared client-metrics cache', () => {
  assert.doesNotMatch(getReadoutSrc, /cachedClientJson/,
    'the readout route mutates (it claims a lease) — it must not be cached like a rollup read');
});
