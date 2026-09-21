// The transcription transport, DRIVEN against the real src/lib/ai.ts.
//
// ⚠ WHY DRIVEN. What reaches the provider is a multipart body a source scan
// cannot see: which model, whether a language hint rides (and only as a valid
// ISO-639-1 code), whether the vocabulary prompt rides, and that `keywords[]`
// goes ONLY to a model whose API takes it — every other model 400s on an
// unknown field, which would read as "transcription is broken" on every
// request. And the one retry: a refused transcription MODEL falls back once
// to whisper-1, the way a refused text model falls back, and nothing else does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

class SubmoduleStubs extends Map {
  has(k) { return super.has(k) || String(k).startsWith('./ai/'); }
  get(k) { return super.has(k) ? super.get(k) : {}; }
}
const ai = await loadRealModule(join(ROOT, 'src/lib/ai.ts'), { typescript: true, registry: new SubmoduleStubs([['next/server', nextServer]]) });

const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_TRANSCRIBE_MODEL'];
async function withEnv(vars, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  try { return await fn(); } finally {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
// A scripted provider that records the MULTIPART body of every request.
function scriptFetch(answers) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const fields = {};
    for (const k of new Set([...init.body.keys()])) {
      const vals = init.body.getAll(k).map((v) => (v instanceof File ? { file: v.name, size: v.size } : v));
      fields[k] = vals.length === 1 ? vals[0] : vals;
    }
    calls.push({ url: String(url), auth: init.headers.Authorization, fields });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return new Response(JSON.stringify(a.body), { status: a.status });
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
const AUDIO = () => new File([new Uint8Array([1, 2, 3, 4])], 'nora.webm', { type: 'audio/webm' });
const REFUSED = { status: 404, body: { error: { message: 'The model `gpt-4o-transcribe` does not exist or you do not have access to it.', type: 'invalid_request_error', param: null, code: 'model_not_found' } } };
const OK = { status: 200, body: { text: '  hello Nora  ' } };

test('the shipped default is gpt-4o-transcribe; OPENAI_TRANSCRIBE_MODEL overrides it', async () => {
  await withEnv({}, () => assert.equal(ai.aiTranscribeModel(), 'gpt-4o-transcribe'));
  await withEnv({ OPENAI_TRANSCRIBE_MODEL: 'gpt-transcribe' }, () => assert.equal(ai.aiTranscribeModel(), 'gpt-transcribe'));
});

test('prepareTranscription: a valid ISO-639-1 hint rides, anything else is dropped; the prompt is clipped; keywords[] go only to gpt-transcribe', () => {
  const p = ai.prepareTranscription;
  assert.deepEqual(p('gpt-4o-transcribe', { promptId: 'x', language: 'de', prompt: 'Shape Score', keywords: ['Shape'] }), { model: 'gpt-4o-transcribe', language: 'de', prompt: 'Shape Score' });
  assert.deepEqual(p('gpt-transcribe', { promptId: 'x', language: 'de', prompt: 'Shape Score', keywords: [' Shape ', '', 'Nora'] }), { model: 'gpt-transcribe', language: 'de', prompt: 'Shape Score', 'keywords[]': ['Shape', 'Nora'] });
  assert.deepEqual(p('whisper-1', { promptId: 'x', language: 'DE ', prompt: '  ' }), { model: 'whisper-1', language: 'de' });
  for (const bad of ['deu', 'pt-BR', 'en-US', 'x', 42, null, undefined, 'DROP TABLE']) {
    assert.ok(!('language' in p('whisper-1', { promptId: 'x', language: bad })), `language ${String(bad)} must be dropped`);
  }
  assert.equal(p('whisper-1', { promptId: 'x', prompt: 'a'.repeat(2000) }).prompt.length, 800);
  assert.equal(p('gpt-transcribe', { promptId: 'x', keywords: Array.from({ length: 150 }, (_, i) => `w${i}`) })['keywords[]'].length, 100);
  assert.ok(!('keywords[]' in p('gpt-transcribe', { promptId: 'x', keywords: [] })));
});

test('⚠ THE WIRE: the file, the model, the hint and the prompt reach the transcription endpoint under the key', async () => {
  const f = scriptFetch([OK]);
  const log = captureLog();
  try {
    const r = await withEnv({ OPENAI_API_KEY: 'k' }, () => ai.transcribeAudio(AUDIO(), { promptId: 'ai.transcribe', language: 'de', prompt: 'Shape Score, Nora', keywords: ['Shape'] }));
    assert.deepEqual(r, { ok: true, text: 'hello Nora', latencyMs: r.latencyMs, promptId: 'ai.transcribe', model: 'gpt-4o-transcribe', fellBack: false });
    assert.equal(f.calls.length, 1);
    assert.match(f.calls[0].url, /\/audio\/transcriptions$/);
    assert.equal(f.calls[0].auth, 'Bearer k');
    assert.deepEqual(f.calls[0].fields, { file: { file: 'nora.webm', size: 4 }, model: 'gpt-4o-transcribe', language: 'de', prompt: 'Shape Score, Nora' });
  } finally { f.restore(); log.restore(); }
});

test('⚠ A REFUSED MODEL FALLS BACK ONCE TO whisper-1 — and only a refused MODEL does', async () => {
  const f = scriptFetch([REFUSED, OK]);
  const log = captureLog();
  try {
    const r = await withEnv({ OPENAI_API_KEY: 'k' }, () => ai.transcribeAudio(AUDIO(), { promptId: 'ai.transcribe', language: 'fr' }));
    assert.equal(r.ok, true);
    assert.equal(r.model, 'whisper-1');
    assert.equal(r.fellBack, true);
    assert.deepEqual(f.calls.map((c) => c.fields.model), ['gpt-4o-transcribe', 'whisper-1']);
    assert.equal(f.calls[1].fields.language, 'fr', 'the hint rides on the fallback too');
    assert.ok(log.lines.some((l) => /model_fallback/.test(l) && /whisper-1/.test(l)), 'the fallback is logged with the model it landed on');
  } finally { f.restore(); log.restore(); }
  // A 500 is not a refused model: no retry, and the failure names the model.
  const g = scriptFetch([{ status: 500, body: { error: { message: 'upstream' } } }, OK]);
  const log2 = captureLog();
  try {
    const r = await withEnv({ OPENAI_API_KEY: 'k' }, () => ai.transcribeAudio(AUDIO(), { promptId: 'ai.transcribe' }));
    assert.deepEqual({ ok: r.ok, reason: r.reason, status: r.status, model: r.model }, { ok: false, reason: 'http_error', status: 500, model: 'gpt-4o-transcribe' });
    assert.equal(g.calls.length, 1);
  } finally { g.restore(); log2.restore(); }
  // whisper-1 pinned: one attempt, never a "fallback" onto itself.
  const h = scriptFetch([REFUSED, OK]);
  const log3 = captureLog();
  try {
    const r = await withEnv({ OPENAI_API_KEY: 'k', OPENAI_TRANSCRIBE_MODEL: 'whisper-1' }, () => ai.transcribeAudio(AUDIO(), { promptId: 'ai.transcribe' }));
    assert.equal(r.ok, false);
    assert.equal(h.calls.length, 1);
  } finally { h.restore(); log3.restore(); }
});

test('no key → no_key, and nothing is fetched', async () => {
  const f = scriptFetch([OK]);
  try {
    const r = await withEnv({}, () => ai.transcribeAudio(AUDIO(), { promptId: 'ai.transcribe' }));
    assert.deepEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'no_key' });
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});
