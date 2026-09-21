// The two transcription routes, DRIVEN: what each hands transcribeAudio for a
// multipart request that carries the app's locale and a context.
//
// ⚠ WHY DRIVEN. The hints are form fields nothing else reads: a route that
// parsed `language` and then passed nothing on would still return a
// transcript, and every other check would be green. The routes are loaded
// with the REAL voiceLang module and a recording transcribeAudio, so the test
// reads exactly the options that would reach the provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const voiceLang = await import(join(ROOT, 'src/lib/ai/voiceLang.mjs'));

async function loadRoute(path, { user = { id: 'u1' }, hasKey = true, answer = { ok: true, text: 'hello', model: 'gpt-4o-transcribe', fellBack: false } } = {}) {
  const calls = [];
  const registry = new Map([
    ['next/server', nextServer],
    ['@/lib/request-auth', { currentUser: async () => user }],
    ['@/lib/require-membership', { requireMembership: async () => null }],
    ['@/lib/ai/voiceLang.mjs', voiceLang],
    ['@/lib/ai', { hasOpenAIKey: () => hasKey, transcribeAudio: async (file, opts) => { calls.push({ file: { name: file.name, size: file.size }, opts }); return answer; } }],
  ]);
  const mod = await loadRealModule(join(ROOT, path), { typescript: true, registry });
  return { mod, calls };
}
function req(fields = {}, { withAudio = true } = {}) {
  const fd = new FormData();
  if (withAudio) fd.append('audio', new File([new Uint8Array([1, 2, 3])], 'nora.webm', { type: 'audio/webm' }));
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request('https://x/api', { method: 'POST', body: fd });
}

test('/api/ai/transcribe: the locale becomes the language hint, the Nora vocabulary primes the model, and the answer names the model', async () => {
  const { mod, calls } = await loadRoute('src/app/api/ai/transcribe/route.ts');
  const res = await mod.POST(req({ language: 'de', context: 'nora' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { transcript: 'hello', model: 'gpt-4o-transcribe', language: 'de' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].file, { name: 'nora.webm', size: 3 });
  assert.equal(calls[0].opts.promptId, 'ai.transcribe');
  assert.equal(calls[0].opts.language, 'de');
  assert.equal(calls[0].opts.prompt, voiceLang.transcriptionPrompt('nora', 'de'));
  assert.deepEqual(calls[0].opts.keywords, [...voiceLang.NORA_VOCAB]);
  // No hints at all: the model detects, the English vocabulary prompt still rides.
  const bare = await loadRoute('src/app/api/ai/transcribe/route.ts');
  await bare.mod.POST(req());
  assert.equal(bare.calls[0].opts.language, null);
  assert.equal(bare.calls[0].opts.prompt, voiceLang.transcriptionPrompt('nora', null));
  // A hostile language and an unknown context fall to detection and the route's default.
  const bad = await loadRoute('src/app/api/ai/transcribe/route.ts');
  await bad.mod.POST(req({ language: 'DROP TABLE', context: 'shell' }));
  assert.equal(bad.calls[0].opts.language, null);
  assert.equal(bad.calls[0].opts.prompt, voiceLang.transcriptionPrompt('nora', null));
});

test('/api/nutrition/voice: the meal vocabulary by default, the grocery one on request, no keyword list for either', async () => {
  const { mod, calls } = await loadRoute('src/app/api/nutrition/voice/route.ts');
  await mod.POST(req({ language: 'pt-BR' }));
  assert.equal(calls[0].opts.promptId, 'nutrition.voice');
  assert.equal(calls[0].opts.language, 'pt');
  assert.equal(calls[0].opts.prompt, voiceLang.transcriptionPrompt('meal', 'pt'));
  assert.deepEqual(calls[0].opts.keywords, []);
  await mod.POST(req({ context: 'grocery' }));
  assert.equal(calls[1].opts.prompt, voiceLang.transcriptionPrompt('grocery', null));
});

test('the gates are untouched: no audio is 400, no key is 503, a failed transcription is 502, signed out is 401', async () => {
  const { mod } = await loadRoute('src/app/api/ai/transcribe/route.ts');
  assert.equal((await mod.POST(req({}, { withAudio: false }))).status, 400);
  const noKey = await loadRoute('src/app/api/nutrition/voice/route.ts', { hasKey: false });
  assert.equal((await noKey.mod.POST(req())).status, 503);
  const failed = await loadRoute('src/app/api/nutrition/voice/route.ts', { answer: { ok: false, reason: 'http_error', status: 500 } });
  assert.equal((await failed.mod.POST(req())).status, 502);
  const anon = await loadRoute('src/app/api/ai/transcribe/route.ts', { user: null });
  assert.equal((await anon.mod.POST(req())).status, 401);
});
