// Nora's written answers, streamed (speed, 2026-10-08): her words appear as she writes them.
//
// DRIVEN where it can be: the shared reader (public/newdesign/noraStream.mjs) and the website's
// copy of it run over the same streams cut at every boundary; src/lib/ai.ts reads a scripted
// OpenAI event stream through a stubbed fetch; the app's askSupportBot is lifted out of
// shapeBackend.js and run against stream and JSON responses; and the app's Nora sheet is
// rendered with the shared mount shim. The route's own events are driven in
// tests/support-chat-route.test.mjs, where its harness lives. Only the website panel's wiring is
// read from source: its whole component has no mount harness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isNoraStream, readNoraStream } from '../public/newdesign/noraStream.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { loadBroadsheet, drive } from './helpers/broadsheet-mount.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MODULE = read('public/newdesign/noraStream.mjs');
const WEB = read('public/newdesign/chatWidget.jsx');
const BACKEND = read('mobile-app/src/services/shapeBackend.js');

// A top-level function's source, from its signature to the first closing brace at column 0.
const fnSource = (src, signature) => {
  const at = src.indexOf(signature);
  assert.ok(at >= 0, `${signature} not found`);
  return src.slice(at, src.indexOf('\n}\n', at) + 2);
};

// ── Streams ────────────────────────────────────────────────────────────────────
const sse = (events, eol = '\n') => events.map(([e, d]) => `event: ${e}${eol}data: ${JSON.stringify(d)}${eol}${eol}`).join('');
// A Response whose body arrives in pieces of `size` characters (0: one piece), so an event,
// a line and a multi-byte character are each split somewhere.
function respond(text, { size = 0, type = 'text/event-stream; charset=utf-8', status = 200 } = {}) {
  const bytes = new TextEncoder().encode(text);
  const step = size || bytes.length || 1;
  const body = new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += step) c.enqueue(bytes.slice(i, i + step));
      c.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': type } });
}
const DONE = { reply: 'You have 3 habits — keep going.', source: 'ai', actions: [{ type: 'screen', screen: 'habits', label: 'Open habits' }], model: 'pinned' };
const LOOKUP = [
  ['text', { text: 'Let me check' }],
  ['reset', {}],
  ['text', { text: 'You have' }],
  ['text', { text: 'You have 3 habits — keep going.' }],
  ['done', DONE],
];

async function readsLikeTheModule(reader, isStream) {
  for (const eol of ['\n', '\r\n']) {
    for (const size of [0, 1, 2, 5, 7, 64]) {
      const seen = [];
      const res = respond(sse(LOOKUP, eol), { size });
      assert.equal(isStream(res), true);
      const done = await reader(res, { onText: (t) => seen.push(`text:${t}`), onReset: () => seen.push('reset') });
      assert.deepEqual(seen, ['text:Let me check', 'reset', 'text:You have', 'text:You have 3 habits — keep going.'], `pieces of ${size}, ${JSON.stringify(eol)}`);
      assert.deepEqual(done, DONE, 'done is exactly the plain request\'s object');
    }
  }
  // A stream that ends without `done` (the connection dropped) is null, never a half answer.
  assert.equal(await reader(respond(sse(LOOKUP.slice(0, 3)), { size: 3 }), {}), null);
  // Unknown events, comments and malformed data are skipped; the last block needs no blank line.
  const odd = `: keep-alive\n\nevent: ping\ndata: {}\n\nevent: text\ndata: {not json\n\nevent: text\ndata: {"text":"Hi"}\n\nevent: done\ndata: {"reply":"Hi","source":"ai","actions":[]}`;
  const texts = [];
  assert.deepEqual(await reader(respond(odd, { size: 4 }), { onText: (t) => texts.push(t) }), { reply: 'Hi', source: 'ai', actions: [] });
  assert.deepEqual(texts, ['Hi']);
  // JSON is not a stream: the limit and the bot check answer that way.
  assert.equal(isStream(respond('{}', { type: 'application/json' })), false);
  assert.equal(isStream(null), false);
  assert.equal(await reader(null, {}), null);
}

test('the shared reader: text, reset and done, whatever the stream is cut into', async () => {
  await readsLikeTheModule(readNoraStream, isNoraStream);
});

test('the website keeps an identical copy, and it reads the same streams the same way', async () => {
  const pairs = [
    ['export function isNoraStream(', 'function cwIsNoraStream('],
    ['export async function readNoraStream(', 'async function cwReadNoraStream('],
  ];
  const copies = [];
  for (const [mod, web] of pairs) {
    const want = fnSource(MODULE, mod).replace(mod, web);
    const have = fnSource(WEB, web);
    assert.equal(have, want, `${web.trim()} drifted from public/newdesign/noraStream.mjs`);
    copies.push(have);
  }
  // eslint-disable-next-line no-new-func
  const { cwIsNoraStream, cwReadNoraStream } = new Function(`${copies.join('\n')}\nreturn { cwIsNoraStream, cwReadNoraStream };`)();
  await readsLikeTheModule(cwReadNoraStream, cwIsNoraStream);
});

// ── The model call (src/lib/ai.ts) ─────────────────────────────────────────────
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
class SubmoduleStubs extends Map {
  has(k) { return super.has(k) || String(k).startsWith('./ai/'); }
  get(k) { return super.has(k) ? super.get(k) : {}; }
}
const ai = await loadRealModule(join(ROOT, 'src/lib/ai.ts'), { typescript: true, registry: new SubmoduleStubs([['next/server', nextServer]]) });

// OpenAI's Responses stream: `data:` lines carrying typed events, as it sends them.
const openai = (events) => events.map((e) => `event: ${e.type}\r\ndata: ${JSON.stringify(e)}\r\n\r\n`).join('');
const FINAL = { id: 'resp_1', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello there.' }] }], usage: { input_tokens: 6771, output_tokens: 40, total_tokens: 6811, input_tokens_details: { cached_tokens: 6400 }, output_tokens_details: { reasoning_tokens: 12 } } };
const HELLO = [
  { type: 'response.created', response: { id: 'resp_1' } },
  { type: 'response.output_text.delta', delta: 'Hel' },
  { type: 'response.output_text.delta', delta: 'lo there.' },
  { type: 'response.output_text.done', text: 'Hello there.' },
  { type: 'response.completed', response: FINAL },
];

test('readResponseStream: each delta as it comes, and the completed response at the end', async () => {
  for (const size of [0, 1, 3, 11]) {
    const got = [];
    const final = await ai.readResponseStream(respond(openai(HELLO), { size }).body, (d) => got.push(d));
    assert.deepEqual(got, ['Hel', 'lo there.']);
    assert.deepEqual(final, FINAL, 'the same object a plain call returns');
  }
  // A response cut short by its token budget is still her answer.
  const cut = { ...FINAL, status: 'incomplete' };
  assert.deepEqual(await ai.readResponseStream(respond(openai([HELLO[1], { type: 'response.incomplete', response: cut }])).body, () => {}), cut);
  // A failure is an error, so callAI's failure path runs: never a reply made of half a stream.
  await assert.rejects(ai.readResponseStream(respond(openai([HELLO[1], { type: 'response.failed', response: { error: { message: 'boom' } } }])).body, () => {}), /response\.failed/);
  await assert.rejects(ai.readResponseStream(respond(openai([{ type: 'error', message: 'overloaded' }])).body, () => {}), /stream error/);
  await assert.rejects(ai.readResponseStream(respond(openai(HELLO.slice(0, 3))).body, () => {}), /ended without a response/);
  await assert.rejects(ai.readResponseStream(null, () => {}), /no response body/);

  // ⚠ A failure mid-stream lets go of the body instead of leaving it open (CodeRabbit, #2278).
  let cancelled = false;
  const open = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(openai([HELLO[1], { type: 'response.failed', response: { error: { message: 'boom' } } }]))); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(ai.readResponseStream(open, () => {}), /response\.failed/);
  assert.equal(cancelled, true, 'the stream is cancelled, not left for the provider to close');
});

const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_FALLBACK_MODEL', 'OPENAI_REASONING_EFFORT', 'OPENAI_STORE_RESPONSES'];
async function withEnv(vars, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
function scriptFetch(answers) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return answers[Math.min(calls.length - 1, answers.length - 1)]();
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
function captureLog() {
  const lines = [];
  const log = console.log; const warn = console.warn;
  console.log = (...a) => { lines.push(a.map(String).join(' ')); };
  console.warn = () => {};
  return { lines, restore: () => { console.log = log; console.warn = warn; } };
}

test('callAI streams only when asked, returns what a plain call returns, and logs when the first words came', async () => {
  await withEnv({ OPENAI_API_KEY: 'k' }, async () => {
    const f = scriptFetch([() => respond(openai(HELLO), { size: 9 }), () => new Response(JSON.stringify(FINAL), { status: 200 })]);
    const log = captureLog();
    try {
      const got = [];
      const streamed = await ai.callAI({ input: 'hi' }, { promptId: 'support.chat', onText: (d) => got.push(d) });
      const plain = await ai.callAI({ input: 'hi' }, { promptId: 'support.chat' });
      assert.equal(f.calls[0].stream, true, 'asked for a stream');
      assert.ok(!('stream' in f.calls[1]), 'a caller that does not draw words gets the plain call');
      assert.deepEqual(got, ['Hel', 'lo there.']);
      assert.equal(streamed.ok, true);
      assert.deepEqual(streamed.data, plain.data, 'the caller reads the same response either way');
      assert.deepEqual(streamed.usage, plain.usage);
      const line = log.lines.find((l) => l.includes('"streamed":true'));
      assert.ok(line, 'the streamed call is logged as one');
      assert.match(line, /"firstTextMs":\d+/);
      assert.match(line, /"cachedTokens":6400/);
    } finally { f.restore(); log.restore(); }
  });
});

test('a stream that fails partway is a failed call, and a refused pin still falls back before any words', async () => {
  await withEnv({ OPENAI_API_KEY: 'k' }, async () => {
    const broken = scriptFetch([() => respond(openai([HELLO[1], { type: 'response.failed', response: { error: { message: 'x' } } }]))]);
    const log = captureLog();
    try {
      const got = [];
      const r = await ai.callAI({ input: 'hi' }, { promptId: 'support.chat', onText: (d) => got.push(d) });
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'network');
      assert.deepEqual(got, ['Hel'], 'what came first was shown; the route replaces it with its fallback');
    } finally { broken.restore(); log.restore(); }

    const refused = { error: { message: 'The model `gpt-6-astra` does not exist or you do not have access to it.', code: 'model_not_found' } };
    const f = scriptFetch([() => new Response(JSON.stringify(refused), { status: 404 }), () => respond(openai(HELLO))]);
    const log2 = captureLog();
    try {
      const got = [];
      const r = await ai.callAI({ input: 'hi' }, { promptId: 'support.chat', onText: (d) => got.push(d) });
      assert.equal(r.ok, true);
      assert.equal(r.fellBack, true);
      assert.equal(f.calls.length, 2);
      assert.equal(f.calls[1].stream, true, 'the fallback streams too');
      assert.deepEqual(got, ['Hel', 'lo there.'], 'only the model that answered wrote anything');
    } finally { f.restore(); log2.restore(); }
  });
});

// ── The app's client (askSupportBot, lifted out of shapeBackend.js) ────────────
function appClient(answer) {
  const calls = [];
  const fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return answer(calls.length); };
  const body = ['const supabase = null;', fnSource(BACKEND, 'async function liveAccessToken('), fnSource(BACKEND, 'function appLocaleCode('), fnSource(BACKEND, 'async function askSupportBot('), 'return askSupportBot;'].join('\n');
  // eslint-disable-next-line no-new-func
  const ask = new Function('apiBaseUrl', 'state', 'window', 'fetch', 'isNoraStream', 'readNoraStream', body)(
    'https://api.test', { session: { access_token: 'tok' } }, { ShapeVoice: { tone: () => 'supportive' }, ShapeLocale: { get: () => 'en' } }, fetch, isNoraStream, readNoraStream);
  return { ask, calls };
}

test('the app asks for a stream only when the caller draws words, and resolves the same object', async () => {
  const { ask, calls } = appClient(() => respond(sse(LOOKUP), { size: 6 }));
  const seen = [];
  const r = await ask([{ role: 'user', content: 'habits?' }], undefined, { onText: (t) => seen.push(t), onReset: () => seen.push('↺') });
  assert.equal(calls[0].stream, true);
  assert.deepEqual(seen, ['Let me check', '↺', 'You have', 'You have 3 habits — keep going.']);
  assert.deepEqual(r, DONE);

  const plain = appClient(() => new Response(JSON.stringify({ reply: 'hi', actions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  assert.deepEqual(await plain.ask([{ role: 'user', content: 'x' }]), { reply: 'hi', actions: [] });
  assert.ok(!('stream' in plain.calls[0]), 'Cook Mode and every other caller keep the plain request');
});

test('the app: JSON still answers a streamed ask (the limit), and a broken stream is a failed request', async () => {
  const limited = appClient(() => new Response(JSON.stringify({ reply: 'You have used today\'s questions.', source: 'limit', limited: true, actions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const seen = [];
  const r = await limited.ask([{ role: 'user', content: 'x' }], undefined, { onText: (t) => seen.push(t) });
  assert.equal(r.source, 'limit');
  assert.deepEqual(seen, []);

  const dropped = appClient(() => respond(sse(LOOKUP.slice(0, 2))));
  await assert.rejects(dropped.ask([{ role: 'user', content: 'x' }], undefined, { onText: () => {} }), /unavailable/);
  const failed = appClient(() => respond(sse([['text', { text: 'Hel' }], ['done', { reply: '', source: 'error', actions: [] }]])));
  await assert.rejects(failed.ask([{ role: 'user', content: 'x' }], undefined, { onText: () => {} }), /unavailable/, 'the sheet shows its "can\'t be reached" line, as for a 500');
});

// ── The app's Nora sheet ───────────────────────────────────────────────────────
globalThis.document = globalThis.document || { getElementById: () => null, body: {} };
const sheet = await loadBroadsheet(['BSNoraSheet', '_bsNoraPublish', '_bsNoraLiveSet', '_bsNoraLive']);
const reset = () => { sheet._bsNoraPublish(null, false); sheet._bsNoraLiveSet(''); };
const open = () => drive(sheet.BSNoraSheet, { onClose: () => {} });
const composer = (d) => d.nodes().find((n) => n.props && typeof n.props.onSend === 'function');

test('the sheet draws her reply so far as her message, in place of "Nora is typing…"', () => {
  reset();
  sheet._bsNoraPublish(null, true);
  const waiting = open();
  assert.match(waiting.text, /Nora is typing…/, 'before her first words');
  sheet._bsNoraLiveSet('Hello there, I am wri');
  const writing = open();
  assert.ok(writing.text.endsWith('Nora · ConciergeHello there, I am wri'), 'after the thread, labelled as hers');
  assert.doesNotMatch(writing.text, /Nora is typing/);
  assert.equal(writing.buttons().filter((b) => /Listen/.test(b.label)).length, 1, 'Listen on the greeting only: the half-written reply has none');
  reset();
});

test('a send streams into the sheet, and the finished reply replaces the live text', async () => {
  reset();
  const live = [];
  window.ShapeSupport = {
    ask: async (hist, tone, extra) => {
      assert.equal(typeof extra.onText, 'function');
      extra.onText('Let me');
      live.push(sheet._bsNoraLive);
      extra.onReset();
      live.push(sheet._bsNoraLive);
      extra.onText('Leg day.');
      live.push(sheet._bsNoraLive);
      return { reply: 'Leg day.', actions: [] };
    },
  };
  try {
    const d = open();
    composer(d).props.onChange('what is on today?');
    d.render();
    await composer(d).props.onSend();
    assert.deepEqual(live, ['Let me', '', 'Leg day.']);
    assert.equal(sheet._bsNoraLive, '', 'gone once she has answered');
    const after = open();
    assert.equal(after.text.split('Leg day.').length - 1, 1, 'her reply once: no live copy beside it');
    assert.doesNotMatch(after.text, /Nora is typing/);
  } finally { delete window.ShapeSupport; reset(); }
});

test('Clear takes the half-written answer with it, and later words are not drawn', async () => {
  reset();
  window.ShapeSupport = {
    ask: async (hist, tone, extra) => {
      extra.onText('Your plan');
      open().click('Clear');
      assert.equal(sheet._bsNoraLive, '');
      extra.onText('Your plan has three days.');
      return { reply: 'Your plan has three days.', actions: [] };
    },
  };
  try {
    const d = open();
    composer(d).props.onChange('my plan?');
    d.render();
    await composer(d).props.onSend();
    assert.equal(sheet._bsNoraLive, '', 'the answer belonged to the conversation that went');
    assert.doesNotMatch(open().text, /Your plan/);
  } finally { delete window.ShapeSupport; reset(); }
});

// ── The website panel (read from source) ──────────────────────────────────────
test('the website panel asks for a stream, reads one only when it gets one, and draws it as her message', () => {
  const send = WEB.slice(WEB.indexOf('if (isSupport) {\n      const sentAt'), WEB.indexOf('setTyping(true);\n    setTimeout('));
  assert.match(send, /context: cwNoraContext\(\), stream: true, \.\.\.extra \}\)/);
  assert.match(send, /onText: \(t\) => \{ if \(gen === noraThreadGenRef\.current\) setNoraLive\(t\); \}/, 'a cleared conversation draws no more words');
  assert.match(send, /const read = async \(r\) => \(r\.ok && cwIsNoraStream\(r\) \? \(\(await cwReadNoraStream\(r, live\)\) \|\| \{\}\) : await r\.json\(\)\.catch\(\(\) => \(\{\}\)\)\);/);
  assert.match(send, /let res = await ask\(\{\}\);\n\s+let data = await read\(res\);/);
  assert.match(send, /if \(token\) \{ res = await ask\(\{ turnstileToken: token \}\); data = await read\(res\); \}/, 'the bot check\'s second ask streams too');
  assert.match(send, /setTyping\(false\);\n\s+setNoraLive\(""\);/);
  assert.ok(!/res\.json\(\)/.test(send), 'no path reads the body as JSON without checking for a stream');
  assert.match(WEB, /\{typing && isSupport && noraLive \? \(\(\) => \{/);
  assert.match(WEB, /\}\)\(\) : typing && \(\n\s+<div style=\{\{ display: "flex", alignItems: "center", gap: 6/, 'the typing line until her first words');
  assert.match(WEB, /\}, \[tabIdx, activeIdx, active\?\.messages\?\.length, typing, open, noraLive\]\);/, 'it scrolls with her words');
});
