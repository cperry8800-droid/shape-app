// Nora's voice, per locale: which language tag the browser's dictation and the
// server's transcription are told, and the vocabulary that primes a
// transcription toward Shape's own words.
//
// The app's locale codes are the i18n catalog's (mobile-app/src/i18n/locales.mjs);
// dictation (Web Speech API) wants a BCP-47 tag, and transcription wants an
// ISO-639-1 code or nothing. `en-US` was hardcoded before this module, which
// dictated every one of thirteen locales as American English.
//
// Plain ESM, no deps — shared by the server, the mobile bundle and, as a
// hand-copied table, the website widget (a classic script that cannot
// import); tests/voice-lang.test.mjs holds the copy to this one.

export const SPEECH_LANG = Object.freeze({
  en: 'en-US', es: 'es-ES', 'pt-BR': 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', id: 'id-ID', vi: 'vi-VN',
  tr: 'tr-TR', ha: 'ha-NG', pcm: 'en-NG', ru: 'ru-RU', uk: 'uk-UA', hi: 'hi-IN', bn: 'bn-BD', te: 'te-IN',
  ar: 'ar-SA', arz: 'ar-EG', ur: 'ur-PK', 'zh-Hans': 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
});

// ISO-639-1 for the transcription API. Nigerian Pidgin has no code the
// transcription models know, so it is left to auto-detect rather than told a
// language it is not.
export const TRANSCRIBE_LANG = Object.freeze({
  en: 'en', es: 'es', 'pt-BR': 'pt', fr: 'fr', de: 'de', it: 'it', id: 'id', vi: 'vi', tr: 'tr', ha: 'ha', pcm: null,
  ru: 'ru', uk: 'uk', hi: 'hi', bn: 'bn', te: 'te', ar: 'ar', arz: 'ar', ur: 'ur', 'zh-Hans': 'zh', ja: 'ja', ko: 'ko',
});

const norm = (locale) => String(locale || '').trim();

/** The BCP-47 tag dictation is told; an unknown locale falls back to English. */
export function speechLangFor(locale) {
  const l = norm(locale);
  if (SPEECH_LANG[l]) return SPEECH_LANG[l];
  const base = l.split('-')[0];
  const hit = Object.keys(SPEECH_LANG).find((k) => k.split('-')[0] === base);
  return hit ? SPEECH_LANG[hit] : 'en-US';
}

/** The ISO-639-1 hint transcription is given, or null to let it detect. */
export function transcribeLangFor(locale) {
  const l = norm(locale);
  if (Object.prototype.hasOwnProperty.call(TRANSCRIBE_LANG, l)) return TRANSCRIBE_LANG[l];
  const base = l.split('-')[0];
  return /^[a-z]{2}$/.test(base) && Object.values(TRANSCRIBE_LANG).includes(base) ? base : null;
}

// Shape's own words — the ones a general transcription model mishears
// ("Shape Score" → "shape's core", "Hyrox" → "high rocks", "PAR-Q" → "parking").
export const NORA_VOCAB = Object.freeze([
  'Shape', 'Nora', 'Shape Score', 'Shape Radio', 'Shape Store', 'Cook Mode', 'Prep session', 'PAR-Q', 'HRV', 'RPE',
  'e1RM', 'Hyrox', 'macros', 'kcal', 'protein', 'carbs', 'weigh-in', 'habit streak', 'Tempo', 'Form', 'Peak', 'Legend',
  'marketplace', 'trainer', 'nutritionist', 'dietitian', 'Whoop', 'Garmin', 'Strava', 'Oura', 'Instacart',
]);
// The proper nouns alone: safe to prime in ANY language, where an English
// sentence would pull a non-English recording toward English.
export const NORA_PROPER_NOUNS = Object.freeze(['Shape', 'Nora', 'Shape Score', 'Shape Radio', 'Hyrox', 'PAR-Q', 'HRV', 'RPE', 'Whoop', 'Garmin', 'Strava', 'Oura', 'Instacart']);

/**
 * The transcription prompt for a recording: a natural English sentence that
 * carries the vocabulary when the recording is English (or its language is
 * unknown), and the proper nouns alone otherwise — a prompt in the wrong
 * language is worse than none. `meal` primes the meal-note dictation instead.
 */
export function transcriptionPrompt(context = 'nora', language = null) {
  const english = !language || language === 'en';
  if (context === 'meal') {
    return english
      ? 'A note about a meal for a nutrition coach: ingredients, portions, grams, ounces, cups, calories, protein, carbs, fat, macros.'
      : NORA_PROPER_NOUNS.slice(0, 2).join(', ') + '.';
  }
  if (context === 'grocery') {
    return english
      ? 'A grocery list read aloud: items with quantities, brands and aisles — produce, dairy, meat, fish, pantry, frozen, bakery.'
      : NORA_PROPER_NOUNS.slice(0, 2).join(', ') + '.';
  }
  if (!english) return NORA_PROPER_NOUNS.join(', ') + '.';
  return `Talking to Nora, the Shape app's assistant, about training, nutrition, coaches and the account: ${NORA_VOCAB.filter((w) => w !== 'Shape' && w !== 'Nora').join(', ')}.`;
}

// The contexts a transcription can be primed for: Nora's composer, the meal
// logger's note, the grocery list. Anything else falls to the route's default.
export const TRANSCRIBE_CONTEXTS = Object.freeze(['nora', 'meal', 'grocery']);

/**
 * The hints a transcription route reads off its multipart form — `language`
 * (the app's locale code) and `context` — resolved to what transcribeAudio
 * takes. Unknown values fall to the defaults; nothing here can fail a request.
 * The vocabulary keywords ride only for Nora's own composer (the meal and
 * grocery prompts carry their own words in the prompt).
 */
export function transcriptionHints(form, defaultContext = 'nora') {
  const get = (k) => {
    try { const v = form && typeof form.get === 'function' ? form.get(k) : null; return typeof v === 'string' ? v : ''; } catch { return ''; }
  };
  const ctxRaw = get('context').trim().toLowerCase();
  const context = TRANSCRIBE_CONTEXTS.includes(ctxRaw) ? ctxRaw : (TRANSCRIBE_CONTEXTS.includes(defaultContext) ? defaultContext : 'nora');
  const language = transcribeLangFor(get('language'));
  return { context, language, prompt: transcriptionPrompt(context, language), keywords: context === 'nora' ? [...NORA_VOCAB] : [] };
}

// The language a locale names, for the reply prompt: "the member's app is set
// to German" is something a model can act on where a bare tag is a guess.
export const LOCALE_NAMES = Object.freeze({
  en: 'English', es: 'Spanish', 'pt-BR': 'Brazilian Portuguese', fr: 'French', de: 'German', it: 'Italian', id: 'Indonesian',
  vi: 'Vietnamese', tr: 'Turkish', ha: 'Hausa', pcm: 'Nigerian Pidgin', ru: 'Russian', uk: 'Ukrainian', hi: 'Hindi', bn: 'Bengali',
  te: 'Telugu', ar: 'Arabic', arz: 'Egyptian Arabic', ur: 'Urdu', 'zh-Hans': 'Simplified Chinese', ja: 'Japanese', ko: 'Korean',
});

/**
 * A client-supplied locale, reduced to one of the app's own codes — exact
 * first, then by base language ('pt' → 'pt-BR', 'en-GB' → 'en') — or null.
 * Untrusted input: bounded, matched against the catalog, never echoed raw.
 */
export function normalizeLocale(locale) {
  const l = String(locale || '').trim().slice(0, 16);
  if (!/^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$/.test(l)) return null;
  if (LOCALE_NAMES[l]) return l;
  const base = l.split('-')[0].toLowerCase();
  const hit = Object.keys(LOCALE_NAMES).find((k) => k.split('-')[0].toLowerCase() === base);
  return hit || null;
}

/** The language name for a locale (through normalizeLocale), or null. */
export function languageNameFor(locale) {
  const code = normalizeLocale(locale);
  return code ? LOCALE_NAMES[code] : null;
}
