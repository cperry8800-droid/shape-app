// The two clients' side of Nora's voice — the mobile app's backend client
// DRIVEN out of the shipped source, and the surfaces held to the contract.
//
// ⚠ WHAT THIS EXISTS FOR. Voice was dead on every phone: the composer posted
// its recording to a ROOT-RELATIVE /api/ai/transcribe, which on the native
// build resolves to the WebView's own origin — no backend, no cookie — while
// Cook Mode had already been fixed to go through window.ShapeSupport (#1805).
// The meal note and the grocery list had the same defect. Every voice call in
// the app now rides the backend client, which is where the app's locale, the
// context and the spoken flag are attached; this drives that client with a
// recording fetch and reads the wire, then pins each call site to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const BACKEND = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
const CLIENT = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8'));
const WIDGET = stripComments(readFileSync(new URL('../public/newdesign/chatWidget.jsx', import.meta.url), 'utf8'));

// Lift a function out of shapeBackend.js by brace-matching from its signature
// (the community-post-delta method): the code that runs here is the code that
// ships, with its module-scope dependencies handed in.
function lift(src, name, kind = 'function') {
  const at = src.indexOf(`${kind} ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (!depth) return src.slice(at, i + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}
function backend({ locale = 'de', token = 'tok' } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const entry = { url, method: init.method, headers: init.headers, signal: init.signal };
    if (init.body instanceof FormData) {
      entry.form = {};
      for (const k of new Set([...init.body.keys()])) entry.form[k] = init.body.getAll(k).map((v) => (v instanceof Blob ? { blob: true, size: v.size } : v));
    } else entry.json = JSON.parse(init.body);
    calls.push(entry);
    return { ok: true, status: 200, json: async () => ({ reply: 'hi', transcript: ' spoken ' }) };
  };
  const window = { ShapeVoice: { tone: () => 'supportive' }, ShapeLocale: { get: () => locale } };
  const body = [lift(BACKEND, 'appLocaleCode'), lift(BACKEND, 'askSupportBot', 'async function'), lift(BACKEND, 'transcribeVoice', 'async function'), lift(BACKEND, 'transcribeNote', 'async function'), lift(BACKEND, 'transcribeTo', 'async function'), 'return { askSupportBot, transcribeVoice, transcribeNote };'].join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function('apiBaseUrl', 'state', 'window', 'fetch', 'FormData', body)('https://api.test', { session: token ? { access_token: token } : null }, window, fetch, FormData);
  return { api, calls };
}

test('⚠ askSupportBot names the surface, the app locale and — only for a spoken message — voice:true', async () => {
  const { api, calls } = backend({ locale: 'de' });
  await api.askSupportBot([{ role: 'user', content: 'hallo' }], undefined, { voice: true });
  await api.askSupportBot([{ role: 'user', content: 'hallo' }]);
  await api.askSupportBot([{ role: 'user', content: 'hallo' }], undefined, { voice: 'yes' });
  assert.equal(calls[0].url, 'https://api.test/api/support/chat');
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  assert.deepEqual(calls[0].json, { messages: [{ role: 'user', content: 'hallo' }], tone: 'supportive', surface: 'app', voice: true, locale: 'de' });
  assert.ok(!('voice' in calls[1].json), 'a typed message carries no voice flag');
  assert.ok(!('voice' in calls[2].json), 'only the boolean true is a spoken message');
  // No locale store yet → no locale claim at all, never a guess.
  const { api: cold, calls: coldCalls } = backend({ locale: '' });
  await cold.askSupportBot([{ role: 'user', content: 'x' }]);
  assert.ok(!('locale' in coldCalls[0].json));
});

test('⚠ the transcription clients post to the backend origin with the Bearer session, the app locale and the context', async () => {
  const { api, calls } = backend({ locale: 'pt-BR' });
  const blob = new Blob([new Uint8Array(3)], { type: 'audio/webm' });
  const r = await api.transcribeVoice(blob, { filename: 'nora.webm' });
  assert.deepEqual(r, { ok: true, status: 200, transcript: 'spoken', error: '' });
  assert.equal(calls[0].url, 'https://api.test/api/ai/transcribe');
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  assert.deepEqual(calls[0].form, { audio: [{ blob: true, size: 3 }], language: ['pt-BR'], context: ['nora'] });
  await api.transcribeNote(blob, { filename: 'list.webm', context: 'grocery' });
  assert.equal(calls[1].url, 'https://api.test/api/nutrition/voice');
  assert.deepEqual(calls[1].form, { audio: [{ blob: true, size: 3 }], language: ['pt-BR'], context: ['grocery'] });
  await api.transcribeNote(blob);
  assert.deepEqual(calls[2].form.context, ['meal'], 'the note client defaults to the meal vocabulary');
  // An explicit language outranks the store; no store and no language → no field.
  await api.transcribeVoice(blob, { language: 'fr' });
  assert.deepEqual(calls[3].form.language, ['fr']);
  const { api: cold, calls: coldCalls } = backend({ locale: '' });
  await cold.transcribeVoice(blob);
  assert.ok(!('language' in coldCalls[0].form));
});

test('⚠ NO VOICE CALL IN THE APP IS ROOT-RELATIVE ANY MORE: the composer, the meal note and the grocery list all ride window.ShapeSupport', () => {
  assert.ok(!/fetch\(['"]\/api\/ai\/transcribe/.test(CLIENT), 'the composer still posts to a root-relative /api/ai/transcribe');
  assert.ok(!/fetch\(['"]\/api\/nutrition\/voice/.test(CLIENT), 'a meal / grocery dictation still posts to a root-relative /api/nutrition/voice');
  // Each call site names its context and hands over the app locale.
  assert.match(CLIENT, /ShapeSupport\.transcribe;[\s\S]{0,400}stt\(blob, \{ filename: 'nora\.webm', context: 'nora', language: window\.ShapeLocale\?\.get\?\.\(\) \}\)/);
  assert.match(CLIENT, /ShapeSupport\.transcribeNote;[\s\S]{0,400}stt\(blob, \{ filename: 'note\.webm', context: 'meal', language: window\.ShapeLocale\?\.get\?\.\(\) \}\)/);
  assert.match(CLIENT, /ShapeSupport\.transcribeNote;[\s\S]{0,400}stt\(blob, \{ filename: 'list\.webm', context: 'grocery', language: window\.ShapeLocale\?\.get\?\.\(\) \}\)/);
  // …and the backend exposes both clients.
  assert.match(BACKEND, /window\.ShapeSupport = \{\n  ask: askSupportBot,\n  transcribe: transcribeVoice,\n  transcribeNote,/);
});

test('a released hold-to-talk transcript is sent as SPOKEN on both surfaces; a typed message is not', () => {
  assert.match(CLIENT, /onVoiceComplete=\{voiceChat \? \(text\) => sendSupportText\(text, \{ voice: true \}\) : undefined\}/);
  assert.match(CLIENT, /const sendSupport = \(\) => sendSupportText\(supportDraft\);/);
  assert.match(CLIENT, /window\.ShapeSupport\?\.ask\?\.\(hist, undefined, \{ voice: opts\.voice === true \}\)/);
  assert.match(WIDGET, /send\(transcript, \{ voice: true \}\)/);
  assert.match(WIDGET, /voice: !!\(opts && opts\.voice\), surface: "web", locale: cwLocale\(\)/);
  // The website's two recorders hand the page language and the context to the server.
  assert.equal((WIDGET.match(/fd\.append\("language", cwLocale\(\)\); fd\.append\("context", "nora"\);/g) || []).length, 2);
});

test('a live coach chip opens the Listing by provider id; an example or a browse chip opens the marketplace by role', () => {
  assert.match(CLIENT, /if \(a\.type === 'coach' && a\.providerId != null\) detail\.coachId = a\.providerId;/);
  assert.match(CLIENT, /window\.dispatchEvent\(new CustomEvent\('shape:openMarket', \{ detail \}\)\)/);
  // The listener this speaks to still reads coachId → providerId.
  assert.match(CLIENT, /providerId: Number\(e\.detail\.coachId\)/);
});
