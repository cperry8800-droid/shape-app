// The AI transport's model pin, DRIVEN against the real src/lib/ai.ts.
//
// ⚠ WHY DRIVEN. GPT-6 Astra changed the request shape: it 400s on the sampling
// parameters and on `reasoning.effort` below `low`, and an account without
// access gets `model_not_found` for a model that exists. Every one of those is
// invisible to a source scan and to `tsc` — the payload is a Record<string,
// unknown> — so the tests below build the exact wire body the module would send
// and read the fallback off a scripted fetch. A test that grepped for
// 'gpt-6-astra' would pass on a module that still sent `temperature`.

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
const ai = await loadRealModule(join(ROOT, 'src/lib/ai.ts'), {
  typescript: true, registry: new SubmoduleStubs([['next/server', nextServer]]),
});

const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_FALLBACK_MODEL', 'OPENAI_REASONING_EFFORT', 'OPENAI_STORE_RESPONSES'];
// Every test runs with the AI env CLEARED and then sets only what it names —
// the container's own env must never decide a test.
async function withEnv(vars, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  try { return await fn(); } finally {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

// A scripted provider: each entry answers one fetch, in order, and every
// request body is recorded so the tests read the WIRE shape, not the intent.
function scriptFetch(answers) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return new Response(typeof a.body === 'string' ? a.body : JSON.stringify(a.body), { status: a.status });
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
const NOT_FOUND = { status: 404, body: { error: { message: 'The model `gpt-6-astra` does not exist or you do not have access to it.', type: 'invalid_request_error', param: null, code: 'model_not_found' } } };
const OK = { status: 200, body: { output_text: 'hi', usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } };

test('the shipped default is GPT-6 Astra; OPENAI_MODEL still overrides it', async () => {
  await withEnv({}, () => assert.equal(ai.aiModel(), 'gpt-6-astra'));
  await withEnv({ OPENAI_MODEL: 'gpt-5.4-mini' }, () => assert.equal(ai.aiModel(), 'gpt-5.4-mini'));
  // The vision pin still rides the text pin until it is set (unchanged contract).
  await withEnv({}, () => assert.equal(ai.aiVisionModel(), 'gpt-6-astra'));
});

test('reasoning-family detection is by model id, and the chat variants are NOT reasoning models', () => {
  for (const m of ['gpt-6-astra', 'gpt-5.4-mini', 'gpt-5.5', 'gpt-5', 'o4-mini', 'o3']) assert.equal(ai.isReasoningModel(m), true, m);
  for (const m of ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-5.3-chat-latest', 'gpt-5-chat-latest', '']) assert.equal(ai.isReasoningModel(m), false, m);
  assert.equal(ai.isAstraModel('gpt-6-astra'), true);
  assert.equal(ai.isAstraModel('gpt-5.4-mini'), false);
});

test('⚠ ASTRA: sampling params are STRIPPED, effort is set, retention is off, the cache key is the promptId', async () => {
  await withEnv({}, () => {
    const { model, payload } = ai.prepareAIRequest(
      { input: 'x', temperature: 0.2, top_p: 0.9, top_logprobs: 3, logprobs: true, tools: [{ type: 'function', name: 'f' }] },
      { promptId: 'support.chat' },
    );
    assert.equal(model, 'gpt-6-astra');
    for (const k of ['temperature', 'top_p', 'top_logprobs', 'logprobs']) assert.ok(!(k in payload), `${k} must not reach Astra`);
    assert.deepEqual(payload.reasoning, { effort: 'low' });
    assert.equal(payload.store, false);
    assert.equal(payload.prompt_cache_key, 'support.chat');
    // A stateless tool loop must get the reasoning back to echo it — with
    // tools present the request asks for the encrypted content.
    assert.deepEqual(payload.include, ['reasoning.encrypted_content']);
    // The caller's own body is untouched (prepare is pure).
    assert.equal(payload.input, 'x');
  });
});

test('without tools no encrypted-reasoning include is requested; with retention on it is not needed either', async () => {
  await withEnv({}, () => {
    assert.ok(!('include' in ai.prepareAIRequest({ input: 'x' }, { promptId: 'p' }).payload));
    const kept = ai.prepareAIRequest({ input: 'x', tools: [{ type: 'function', name: 'f' }], store: true }, { promptId: 'p' }).payload;
    assert.equal(kept.store, true);
    assert.ok(!('include' in kept));
    // An existing include list is extended, never replaced.
    const ext = ai.prepareAIRequest({ input: 'x', tools: [{ type: 'function', name: 'f' }], include: ['message.output_text.logprobs'] }, { promptId: 'p' }).payload;
    assert.deepEqual(ext.include, ['message.output_text.logprobs', 'reasoning.encrypted_content']);
  });
  await withEnv({ OPENAI_STORE_RESPONSES: '1' }, () => {
    const { payload } = ai.prepareAIRequest({ input: 'x', tools: [{ type: 'function', name: 'f' }] }, { promptId: 'p' });
    assert.equal(payload.store, true);
    assert.ok(!('include' in payload));
  });
});

test('effort precedence: body > caller option > env > low; Astra clamps none/minimal to low, other reasoning models do not', async () => {
  await withEnv({}, () => {
    assert.equal(ai.prepareAIRequest({ input: 'x', reasoning: { effort: 'high' } }, { effort: 'medium' }).payload.reasoning.effort, 'high');
    assert.equal(ai.prepareAIRequest({ input: 'x' }, { effort: 'medium' }).payload.reasoning.effort, 'medium');
    assert.equal(ai.prepareAIRequest({ input: 'x' }, { effort: 'none' }).payload.reasoning.effort, 'low');
    assert.equal(ai.prepareAIRequest({ input: 'x' }, { effort: 'minimal' }).payload.reasoning.effort, 'low');
    assert.equal(ai.prepareAIRequest({ input: 'x', reasoning: { effort: 'none', summary: 'auto' } }, {}).payload.reasoning.effort, 'low');
    // the rest of the caller's reasoning object survives the clamp
    assert.equal(ai.prepareAIRequest({ input: 'x', reasoning: { effort: 'none', summary: 'auto' } }, {}).payload.reasoning.summary, 'auto');
    assert.equal(ai.prepareAIRequest({ input: 'x' }, { effort: 'minimal', model: 'gpt-5.4-mini' }).payload.reasoning.effort, 'minimal');
    assert.equal(ai.prepareAIRequest({ input: 'x' }, { effort: 'max' }).payload.reasoning.effort, 'max');
  });
  await withEnv({ OPENAI_REASONING_EFFORT: 'medium' }, () => {
    assert.equal(ai.aiReasoningEffort(), 'medium');
    assert.equal(ai.prepareAIRequest({ input: 'x' }, {}).payload.reasoning.effort, 'medium');
    assert.equal(ai.prepareAIRequest({ input: 'x' }, { effort: 'high' }).payload.reasoning.effort, 'high');
  });
  await withEnv({ OPENAI_REASONING_EFFORT: 'turbo' }, () => {
    assert.equal(ai.aiReasoningEffort(), 'low', 'an unknown env value is ignored, never sent');
  });
});

test('verbosity merges into text without clobbering a json_schema format', async () => {
  await withEnv({}, () => {
    const format = { type: 'json_schema', name: 's', schema: { type: 'object' }, strict: true };
    const { payload } = ai.prepareAIRequest({ input: 'x', text: { format } }, { verbosity: 'low' });
    assert.deepEqual(payload.text, { format, verbosity: 'low' });
    assert.ok(!('text' in ai.prepareAIRequest({ input: 'x' }, {}).payload));
  });
});

test('a NON-reasoning pin keeps its sampling params and gets none of the reasoning-only fields', async () => {
  await withEnv({ OPENAI_MODEL: 'gpt-4.1' }, () => {
    const { model, payload } = ai.prepareAIRequest({ input: 'x', temperature: 0.2, tools: [{ type: 'function', name: 'f' }] }, { promptId: 'p', effort: 'high', verbosity: 'low' });
    assert.equal(model, 'gpt-4.1');
    assert.equal(payload.temperature, 0.2);
    assert.ok(!('reasoning' in payload));
    assert.ok(!('text' in payload));
    assert.ok(!('include' in payload));
    assert.equal(payload.store, false);
    assert.equal(payload.prompt_cache_key, 'p');
  });
});

test('isModelAccessError: a refused MODEL, by code, by param, or by message — never a generic 400/429/500', () => {
  assert.equal(ai.isModelAccessError(404, JSON.stringify(NOT_FOUND.body)), true);
  assert.equal(ai.isModelAccessError(400, JSON.stringify({ error: { message: 'Invalid model', param: 'model', code: null } })), true);
  assert.equal(ai.isModelAccessError(403, JSON.stringify({ error: { message: 'Project does not have access to model gpt-6-astra', code: 'model_access_denied' } })), true);
  assert.equal(ai.isModelAccessError(404, 'model not found'), true);
  assert.equal(ai.isModelAccessError(400, JSON.stringify({ error: { message: "Unsupported parameter: 'temperature' is not supported with this model.", param: 'temperature', code: 'unsupported_parameter' } })), false);
  assert.equal(ai.isModelAccessError(400, JSON.stringify({ error: { message: "Unsupported value: 'none' is not supported with this model.", param: 'reasoning.effort', code: 'unsupported_value' } })), false);
  assert.equal(ai.isModelAccessError(429, JSON.stringify({ error: { message: 'Rate limit reached for model gpt-6-astra', code: 'rate_limit_exceeded' } })), false);
  assert.equal(ai.isModelAccessError(500, JSON.stringify(NOT_FOUND.body)), false);
  assert.equal(ai.isModelAccessError(400, ''), false);
});

test('the fallback model: unset → gpt-5.4-mini; a name → that name; none/off → disabled', async () => {
  await withEnv({}, () => assert.equal(ai.aiFallbackModel(), 'gpt-5.4-mini'));
  await withEnv({ OPENAI_FALLBACK_MODEL: 'gpt-5.5' }, () => assert.equal(ai.aiFallbackModel(), 'gpt-5.5'));
  for (const v of ['none', 'off', 'false', '0', ' NONE ']) await withEnv({ OPENAI_FALLBACK_MODEL: v }, () => assert.equal(ai.aiFallbackModel(), null, v));
});

test('⚠ callAI: a refused pin retries ONCE on the fallback, re-prepared for THAT model, and the log names both', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    const f = scriptFetch([NOT_FOUND, OK]);
    const log = captureLog();
    try {
      const res = await ai.callAI({ input: 'hello', tools: [{ type: 'function', name: 'f' }] }, { promptId: 'support.chat', effort: 'minimal' });
      assert.equal(f.calls.length, 2);
      assert.equal(f.calls[0].body.model, 'gpt-6-astra');
      assert.equal(f.calls[0].body.reasoning.effort, 'low', 'Astra floor on the first attempt');
      assert.equal(f.calls[0].headers.Authorization, 'Bearer test-key');
      assert.equal(f.calls[1].body.model, 'gpt-5.4-mini');
      assert.equal(f.calls[1].body.reasoning.effort, 'minimal', 'the fallback carries the CALLER\'s effort — it is prepared for its own model, not copied');
      assert.deepEqual(f.calls[1].body.include, ['reasoning.encrypted_content']);
      assert.equal(res.ok, true);
      assert.equal(res.model, 'gpt-5.4-mini');
      assert.equal(res.fellBack, true);
      assert.deepEqual(res.usage, { inputTokens: 10, outputTokens: 2, totalTokens: 12 });
      const fb = log.lines.find((l) => l.includes('"reason":"model_fallback"'));
      assert.ok(fb, 'a model_fallback log line');
      assert.match(fb, /"model":"gpt-6-astra"/);
      assert.match(fb, /"fallbackModel":"gpt-5.4-mini"/);
      const okLine = log.lines.find((l) => l.includes('"ok":true'));
      assert.match(okLine, /"model":"gpt-5.4-mini"/);
      assert.match(okLine, /"fellBack":true/);
    } finally { f.restore(); log.restore(); }
  });
});

test('callAI: a generic 400 does NOT fall back — the caller gets the status and detail as before', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    const bad = { status: 400, body: { error: { message: "Unsupported parameter: 'foo'", param: 'foo', code: 'unsupported_parameter' } } };
    const f = scriptFetch([bad, OK]);
    const log = captureLog();
    try {
      const res = await ai.callAI({ input: 'hello' }, { promptId: 'p' });
      assert.equal(f.calls.length, 1, 'no second attempt');
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'http_error');
      assert.equal(res.status, 400);
      assert.equal(res.model, 'gpt-6-astra');
      assert.match(res.detail, /unsupported_parameter/);
      assert.ok(!log.lines.some((l) => l.includes('model_fallback')));
    } finally { f.restore(); log.restore(); }
  });
});

test('callAI: no fallback when the caller pinned the model, when the retry is disabled, or when the pin IS the fallback', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    const f = scriptFetch([NOT_FOUND, OK]);
    const log = captureLog();
    try {
      const res = await ai.callAI({ input: 'hello', model: 'gpt-6-astra' }, { promptId: 'p' });
      assert.equal(f.calls.length, 1, 'an explicit model is exactly what the caller asked for');
      assert.equal(res.ok, false);
    } finally { f.restore(); log.restore(); }
  });
  await withEnv({ OPENAI_API_KEY: 'test-key', OPENAI_FALLBACK_MODEL: 'none' }, async () => {
    const f = scriptFetch([NOT_FOUND, OK]);
    const log = captureLog();
    try {
      const res = await ai.callAI({ input: 'hello' }, { promptId: 'p' });
      assert.equal(f.calls.length, 1);
      assert.equal(res.ok, false);
      assert.equal(res.status, 404);
    } finally { f.restore(); log.restore(); }
  });
  await withEnv({ OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'gpt-5.4-mini' }, async () => {
    const f = scriptFetch([NOT_FOUND, OK]);
    const log = captureLog();
    try {
      const res = await ai.callAI({ input: 'hello' }, { promptId: 'p' });
      assert.equal(f.calls.length, 1, 'a failing fallback must never retry itself');
      assert.equal(res.ok, false);
    } finally { f.restore(); log.restore(); }
  });
});

test('callAI: the happy path carries the prepared shape on the wire and reports the model that answered', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    const f = scriptFetch([OK]);
    const log = captureLog();
    try {
      const res = await ai.callAI({ input: [{ role: 'user', content: 'hi' }], temperature: 0.7 }, { promptId: 'support.chat', verbosity: 'low' });
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].url, 'https://api.openai.com/v1/responses');
      const b = f.calls[0].body;
      assert.equal(b.model, 'gpt-6-astra');
      assert.ok(!('temperature' in b));
      assert.deepEqual(b.reasoning, { effort: 'low' });
      assert.deepEqual(b.text, { verbosity: 'low' });
      assert.equal(b.store, false);
      assert.equal(b.prompt_cache_key, 'support.chat');
      assert.equal(res.ok, true);
      assert.equal(res.model, 'gpt-6-astra');
      assert.equal(res.fellBack, false);
    } finally { f.restore(); log.restore(); }
  });
});

test('callAI: no key is still the honest no_key result, and never touches the network', async () => {
  await withEnv({}, async () => {
    const f = scriptFetch([OK]);
    const log = captureLog();
    try {
      const res = await ai.callAI({ input: 'x' }, { promptId: 'p' });
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'no_key');
      assert.equal(f.calls.length, 0);
    } finally { f.restore(); log.restore(); }
  });
});
