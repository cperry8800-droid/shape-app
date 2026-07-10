// Nora's delivery tone — supportive vs direct — and the spoken-text plumbing.
//
// Pure & dependency-free (plain ESM) so node:test imports the exact logic the
// chat route + the /api/ai/speak route run. Two principles hold for BOTH tones,
// always:
//   • Never shame, scold, or guilt — no "you failed", "you only", "should have".
//   • Never weaponize a number — a metric is context for a next step, never a
//     verdict on the person.
// Tone changes the FRAMING words, never the facts. The number you read is the
// number you hear; the action is the real action from the engine.

export const TONES = ['supportive', 'direct'];
export const DEFAULT_TONE = 'supportive';

export function normalizeTone(tone) {
  return TONES.includes(String(tone)) ? String(tone) : DEFAULT_TONE;
}

// The non-negotiable framing both tones obey (injected into Nora's prompt and
// asserted by tests so neither tone can drift into shaming).
export const FRAMING_RULES = [
  'Never shame, scold, blame, or guilt. Avoid "you failed", "you only", "you should have", "you never".',
  'Never weaponize a number. A metric is context for the next step, not a judgment of the person.',
  'Ground every claim in a real signal. If there is no data, say so plainly — never invent a number or a result.',
];

// Prompt fragment for the chosen tone (appended to Nora's system prompt). The
// facts and the next action are identical across tones; only the framing differs.
export function toneInstruction(tone) {
  const base = FRAMING_RULES.join(' ');
  if (normalizeTone(tone) === 'direct') {
    return [
      'TONE — DIRECT: Be concise and factual. Lead with the one thing that matters, then the next action.',
      'Short sentences. No filler, no hedging, no pep. State the metric plainly as context.',
      base,
    ].join(' ');
  }
  return [
    'TONE — SUPPORTIVE: Be warm and encouraging. Acknowledge the effort, then frame the next step as a small, doable move.',
    'Gentle and human, never clinical. Reassure without sugar-coating the facts.',
    base,
  ].join(' ');
}

// OpenAI TTS voice per tone: supportive = warmer, direct = neutral/crisp.
export function voiceForTone(tone) {
  return normalizeTone(tone) === 'direct' ? 'alloy' : 'shimmer';
}

// Speech-delivery style per tone for the gpt-4o-mini-tts `instructions` field —
// steers HOW the words are read, never the words themselves (the verbatim
// contract). The NORA_TTS_INSTRUCTIONS env (optional) overrides both at the
// speak route, so the owner can pin a house style without a code change.
export function voiceStyleForTone(tone) {
  if (normalizeTone(tone) === 'direct') {
    return 'Crisp, confident, matter-of-fact fitness coach — brisk, energetic pace, no fluff, never announcer-like.';
  }
  return 'Warm, natural, encouraging fitness coach talking with a friend — relaxed conversational pace, gentle emphasis, never announcer-like.';
}

// The voices a member can pick for Nora (curated OpenAI TTS set, friendly
// labels). 'auto' (or anything unknown) means "follow the tone" via voiceForTone.
export const NORA_VOICES = [
  { id: 'shimmer', label: 'Warm' },
  { id: 'alloy', label: 'Neutral' },
  { id: 'sage', label: 'Calm' },
  { id: 'nova', label: 'Bright' },
  { id: 'onyx', label: 'Deep' },
  { id: 'verse', label: 'Expressive' },
];
const VOICE_IDS = NORA_VOICES.map((v) => v.id);

// A chosen voice id, or null when it should fall back to the tone default.
export function normalizeVoice(voice) {
  return VOICE_IDS.includes(String(voice)) ? String(voice) : null;
}
// What the speak route actually uses: the explicit choice, else the tone default.
export function resolveVoice(voice, tone) {
  return normalizeVoice(voice) || voiceForTone(tone);
}

// ── spoken directive (parity) ───────────────────────────────────────────────
// Compose the ONE line that is BOTH shown and spoken for a directive, so what
// you read is exactly what you hear. The engine's verdict + reason (the facts)
// pass through verbatim; tone only frames the action.
function endSentence(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : t + '.';
}
function lowerFirst(s) {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

export function speakableDirective(directive, tone) {
  const d = directive || {};
  const t = normalizeTone(tone);
  const verdict = endSentence(d.verdict);
  const reason = endSentence(d.reason);
  const step = (d.action && d.action.label) ? String(d.action.label).trim()
    : (d.read && d.read.oneThingNow) ? String(d.read.oneThingNow).trim() : '';
  const parts = [];
  if (verdict) parts.push(verdict);
  if (reason) parts.push(reason);
  if (step) {
    parts.push(t === 'direct' ? endSentence('Next: ' + step) : endSentence("When you're ready, " + lowerFirst(step)));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ── parity channel ──────────────────────────────────────────────────────────
// The /api/ai/speak route echoes the EXACT text it synthesized in this header,
// so a caller can assert what-was-heard === what-was-shown. Lossless round-trip.
export const SPOKEN_TEXT_HEADER = 'X-Spoken-Text';
export function encodeSpokenText(text) {
  return encodeURIComponent(String(text == null ? '' : text));
}
export function decodeSpokenText(headerValue) {
  try {
    return decodeURIComponent(String(headerValue || ''));
  } catch {
    return '';
  }
}

// ── shaming guard (test net + optional runtime assertion) ───────────────────
const SHAMING_PATTERNS = [
  /\byou failed\b/i,
  /\byou only\b/i,
  /\byou should have\b/i,
  /\byou never\b/i,
  /\byou always\b/i,
  /\bembarrassing\b/i,
  /\bpathetic\b/i,
  /\bno excuse/i,
  /\blazy\b/i,
  /\bdisappointing\b/i,
];
export function containsShaming(text) {
  const s = String(text || '');
  return SHAMING_PATTERNS.some((re) => re.test(s));
}
