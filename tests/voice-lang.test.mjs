// Nora's voice per locale — DRIVEN. node --test.
//
// ⚠ WHAT THIS EXISTS FOR. Dictation was `rec.lang = 'en-US'` on both surfaces,
// which dictated thirteen locales as American English, and the server's
// transcription got no language hint and no vocabulary at all. The tables in
// src/lib/ai/voiceLang.mjs are the fix; this holds them to the app's own
// locale list, drives the resolvers on the inputs a client can actually send
// (including hostile ones), and holds the website widget's HAND COPY of the
// dictation table to the shipped one — the widget is a classic script and
// cannot import, so drift there is silent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPEECH_LANG, TRANSCRIBE_LANG, LOCALE_NAMES, NORA_VOCAB, NORA_PROPER_NOUNS, TRANSCRIBE_CONTEXTS,
  speechLangFor, transcribeLangFor, normalizeLocale, languageNameFor, transcriptionPrompt, transcriptionHints,
} from '../src/lib/ai/voiceLang.mjs';
import { LOCALES } from '../mobile-app/src/i18n/locales.mjs';

const WIDGET = readFileSync(new URL('../public/newdesign/chatWidget.jsx', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');

test('every locale the app ships has a dictation tag, a transcription hint (or a deliberate null) and a language name — and nothing else does', () => {
  assert.ok(LOCALES.length >= 13, 'the locale list is the corpus');
  const codes = new Set(LOCALES.map((l) => l.code));
  for (const l of LOCALES) {
    assert.ok(Object.hasOwn(SPEECH_LANG, l.code), `SPEECH_LANG lacks ${l.code}`);
    assert.ok(Object.hasOwn(TRANSCRIBE_LANG, l.code), `TRANSCRIBE_LANG lacks ${l.code}`);
    assert.ok(Object.hasOwn(LOCALE_NAMES, l.code), `LOCALE_NAMES lacks ${l.code}`);
    assert.match(SPEECH_LANG[l.code], /^[a-z]{2}-[A-Z]{2}$/, `${l.code} dictation tag`);
    const t = TRANSCRIBE_LANG[l.code];
    assert.ok(t === null || /^[a-z]{2}$/.test(t), `${l.code} hint must be ISO-639-1 or null, got ${t}`);
    assert.ok(LOCALE_NAMES[l.code].length > 3);
  }
  for (const k of [...Object.keys(SPEECH_LANG), ...Object.keys(TRANSCRIBE_LANG), ...Object.keys(LOCALE_NAMES)]) {
    assert.ok(codes.has(k), `${k} is not a locale the app ships`);
  }
  // The one deliberate null: Nigerian Pidgin has no code the transcription
  // models know, so it detects rather than being told a language it is not.
  assert.equal(TRANSCRIBE_LANG.pcm, null);
  assert.equal(SPEECH_LANG.pcm, 'en-NG');
  assert.equal(TRANSCRIBE_LANG.arz, 'ar');
});

test('speechLangFor: the locale\'s tag, a base-language match, English for the unknown — never the raw client string', () => {
  assert.equal(speechLangFor('de'), 'de-DE');
  assert.equal(speechLangFor('pt-BR'), 'pt-BR');
  assert.equal(speechLangFor('pt'), 'pt-BR');
  assert.equal(speechLangFor('zh-Hans'), 'zh-CN');
  assert.equal(speechLangFor('pcm'), 'en-NG');
  assert.equal(speechLangFor('xx'), 'en-US');
  assert.equal(speechLangFor(''), 'en-US');
  assert.equal(speechLangFor(null), 'en-US');
  assert.equal(speechLangFor(undefined), 'en-US');
  assert.equal(speechLangFor('de-DE; DROP TABLE'), 'de-DE', 'a base match still resolves, and the raw string never comes back');
});

test('transcribeLangFor: ISO-639-1 or null — a regional code maps to its base, Pidgin detects, an unknown or hostile value detects', () => {
  assert.equal(transcribeLangFor('de'), 'de');
  assert.equal(transcribeLangFor('pt-BR'), 'pt');
  assert.equal(transcribeLangFor('zh-Hans'), 'zh');
  assert.equal(transcribeLangFor('arz'), 'ar');
  assert.equal(transcribeLangFor('en-US'), 'en');
  assert.equal(transcribeLangFor('pcm'), null);
  assert.equal(transcribeLangFor('xx-YY'), null);
  assert.equal(transcribeLangFor('DROP TABLE'), null);
  assert.equal(transcribeLangFor(''), null);
  assert.equal(transcribeLangFor(42), null);
});

test('normalizeLocale reduces a client claim to one of the app\'s codes or null; languageNameFor names it', () => {
  assert.equal(normalizeLocale('de'), 'de');
  assert.equal(normalizeLocale('de-AT'), 'de');
  assert.equal(normalizeLocale('pt'), 'pt-BR');
  assert.equal(normalizeLocale('en-GB'), 'en');
  assert.equal(normalizeLocale('zh-Hans'), 'zh-Hans');
  assert.equal(normalizeLocale('zh'), 'zh-Hans');
  assert.equal(normalizeLocale('xx'), null);
  assert.equal(normalizeLocale('de; DROP TABLE'), null);
  assert.equal(normalizeLocale('a'.repeat(40)), null);
  assert.equal(normalizeLocale(42), null);
  assert.equal(normalizeLocale(undefined), null);
  assert.equal(languageNameFor('de'), 'German');
  assert.equal(languageNameFor('pt'), 'Brazilian Portuguese');
  assert.equal(languageNameFor('en-US'), 'English');
  assert.equal(languageNameFor('xx'), null);
});

test('the transcription prompt carries Shape\'s vocabulary in English and only the proper nouns in any other language', () => {
  const en = transcriptionPrompt('nora', 'en');
  assert.match(en, /Nora/);
  for (const w of ['Shape Score', 'Hyrox', 'PAR-Q', 'HRV', 'macros']) assert.ok(en.includes(w), `en prompt carries ${w}`);
  assert.equal(transcriptionPrompt('nora', null), en, 'an unknown language is primed as English');
  const de = transcriptionPrompt('nora', 'de');
  for (const w of NORA_PROPER_NOUNS) assert.ok(de.includes(w), `de prompt carries ${w}`);
  assert.ok(!/training|nutrition|coaches|Talking to/.test(de), 'no English sentence in a non-English prompt');
  assert.match(transcriptionPrompt('meal', 'en'), /grams|ounces|calories/);
  assert.ok(!/grams|calories/.test(transcriptionPrompt('meal', 'fr')));
  assert.match(transcriptionPrompt('grocery', 'en'), /produce|dairy/);
  assert.ok(!/produce/.test(transcriptionPrompt('grocery', 'es')));
  for (const ctx of TRANSCRIBE_CONTEXTS) for (const lang of ['en', null, 'de']) assert.ok(transcriptionPrompt(ctx, lang).length < 800, `${ctx}/${lang} stays under the 800-char clip`);
  assert.ok(Object.isFrozen(NORA_VOCAB) && Object.isFrozen(NORA_PROPER_NOUNS));
});

test('transcriptionHints reads the form: a locale becomes the hint, an unknown context falls to the route\'s default, and only Nora\'s composer gets the keyword list', () => {
  const fd = new FormData();
  fd.append('language', 'pt-BR');
  fd.append('context', 'grocery');
  const h = transcriptionHints(fd, 'nora');
  assert.deepEqual({ context: h.context, language: h.language, keywords: h.keywords }, { context: 'grocery', language: 'pt', keywords: [] });
  assert.equal(h.prompt, transcriptionPrompt('grocery', 'pt'));
  const nora = transcriptionHints(new FormData(), 'nora');
  assert.deepEqual({ context: nora.context, language: nora.language }, { context: 'nora', language: null });
  assert.deepEqual(nora.keywords, [...NORA_VOCAB]);
  nora.keywords.push('x');
  assert.ok(!NORA_VOCAB.includes('x'), 'the caller gets a copy, never the frozen table');
  const bad = new FormData();
  bad.append('language', 'DROP TABLE');
  bad.append('context', 'shell');
  assert.deepEqual({ context: transcriptionHints(bad, 'meal').context, language: transcriptionHints(bad, 'meal').language }, { context: 'meal', language: null });
  assert.equal(transcriptionHints(null, 'meal').context, 'meal', 'no form at all is fine');
  assert.equal(transcriptionHints(null, 'shell').context, 'nora', 'a default outside the list is itself refused');
  assert.equal(transcriptionHints({ get: () => { throw new Error('boom'); } }, 'meal').context, 'meal', 'a form that throws cannot fail the request');
});

test('⚠ THE WEBSITE WIDGET\'S HAND COPY OF THE DICTATION TABLE IS THE SHIPPED TABLE, and both clients dictate in the locale, not en-US', () => {
  const m = WIDGET.match(/const CW_SPEECH_LANG = \{([\s\S]*?)\n\s*\};/);
  assert.ok(m, 'chatWidget.jsx no longer carries CW_SPEECH_LANG');
  const json = '{' + m[1].replace(/(^|[,\s{])([A-Za-z][\w-]*)\s*:/g, '$1"$2":').replace(/,\s*$/, '') + '}';
  const copy = JSON.parse(json);
  assert.deepEqual(copy, { ...SPEECH_LANG }, 'the widget\'s copy drifted from voiceLang.mjs SPEECH_LANG');
  assert.ok(Object.keys(copy).length >= 13, 'the parse read the whole table');
  // The widget resolves through it, and the literal is gone.
  assert.match(WIDGET, /rec\.lang = cwSpeechLang\(\)/);
  assert.ok(!/rec\.lang = "en-US"/.test(WIDGET), 'the widget still hardcodes en-US');
  // The app imports the shipped resolver and reads the locale store.
  assert.match(CLIENT, /import \{ speechLangFor \} from '\.\.\/\.\.\/\.\.\/src\/lib\/ai\/voiceLang\.mjs';/);
  assert.match(CLIENT, /rec\.lang = speechLangFor\(window\.ShapeLocale\?\.get\?\.\(\)\)/);
  assert.ok(!/rec\.lang = 'en-US'/.test(CLIENT), 'the app composer still hardcodes en-US');
});
