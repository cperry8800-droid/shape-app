// Nora's tone + spoken-directive parity. Pure logic shared by the chat route
// and /api/ai/speak. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TONES, DEFAULT_TONE, normalizeTone, FRAMING_RULES, toneInstruction, voiceForTone,
  voiceStyleForTone, speakableDirective, encodeSpokenText, decodeSpokenText, containsShaming,
  NORA_VOICES, normalizeVoice, resolveVoice, resolveVoiceWithDefault, OPENAI_TTS_VOICES,
} from '../src/lib/ai/tone.mjs';

test('tone normalizes safely and defaults to supportive', () => {
  assert.equal(DEFAULT_TONE, 'supportive');
  assert.deepEqual(TONES, ['supportive', 'direct']);
  assert.equal(normalizeTone('direct'), 'direct');
  assert.equal(normalizeTone('supportive'), 'supportive');
  assert.equal(normalizeTone('SHOUTY'), 'supportive'); // unknown → default
  assert.equal(normalizeTone(null), 'supportive');
  assert.equal(normalizeTone(undefined), 'supportive');
});

test('both tones carry the never-shame / never-weaponize framing', () => {
  for (const tone of ['supportive', 'direct']) {
    const inst = toneInstruction(tone);
    assert.match(inst, /never shame/i);
    assert.match(inst, /never weaponize a number/i);
    assert.match(inst, /never invent/i);
  }
  // the rules are the same set, regardless of tone
  for (const rule of FRAMING_RULES) {
    assert.ok(toneInstruction('supportive').includes(rule));
    assert.ok(toneInstruction('direct').includes(rule));
  }
});

test('the two tones are genuinely different framings', () => {
  const s = toneInstruction('supportive');
  const d = toneInstruction('direct');
  assert.notEqual(s, d);
  assert.match(s, /warm|encourag/i);
  assert.match(d, /concise|factual/i);
});

test('voice maps per tone (supportive warmer, direct neutral)', () => {
  assert.equal(voiceForTone('supportive'), 'shimmer');
  assert.equal(voiceForTone('direct'), 'alloy');
  assert.equal(voiceForTone('bogus'), 'shimmer'); // default
});

test('resolveVoiceWithDefault: picker wins, then the env voice, then the tone default', () => {
  // A member's explicit pick always wins over the env default.
  assert.equal(resolveVoiceWithDefault('onyx', 'fable', 'supportive'), 'onyx');
  // No pick → the owner's env voice (any valid API voice, incl. non-picker ones).
  assert.equal(resolveVoiceWithDefault(undefined, 'fable', 'supportive'), 'fable');
  assert.equal(resolveVoiceWithDefault('auto', 'FABLE ', 'direct'), 'fable'); // trimmed + case-insensitive
  // Junk/unset env → the tone default (never trusted into the API call).
  assert.equal(resolveVoiceWithDefault(undefined, 'robot9000', 'supportive'), 'shimmer');
  assert.equal(resolveVoiceWithDefault(undefined, '', 'direct'), 'alloy');
  assert.ok(OPENAI_TTS_VOICES.includes('fable'));
});

test('voiceStyleForTone steers delivery per tone and defaults supportive', () => {
  const s = voiceStyleForTone('supportive');
  const d = voiceStyleForTone('direct');
  assert.ok(s.length > 20 && d.length > 20);
  assert.notEqual(s, d);
  assert.match(s, /warm/i);
  assert.match(d, /crisp|brisk/i);
  // both explicitly ban the announcer read; unknown tone falls to supportive
  assert.match(s, /never announcer/i);
  assert.match(d, /never announcer/i);
  assert.equal(voiceStyleForTone('bogus'), s);
  assert.equal(voiceStyleForTone(null), s);
});

test('a member can pick a voice; unknown/auto falls back to the tone default', () => {
  assert.ok(NORA_VOICES.length >= 4);
  for (const v of NORA_VOICES) {
    assert.equal(normalizeVoice(v.id), v.id);     // every catalog id is valid
    assert.ok(typeof v.label === 'string' && v.label);
  }
  assert.equal(normalizeVoice('auto'), null);     // sentinel → tone default
  assert.equal(normalizeVoice('haxxor'), null);   // junk → tone default (never trusted)
  // resolveVoice: explicit choice wins; else the tone's default voice.
  assert.equal(resolveVoice('onyx', 'supportive'), 'onyx');
  assert.equal(resolveVoice('auto', 'supportive'), 'shimmer');
  assert.equal(resolveVoice(undefined, 'direct'), 'alloy');
  assert.equal(resolveVoice('not-a-voice', 'direct'), 'alloy');
});

const DIRECTIVE = {
  verdict: 'Protein is the lever this week',
  reason: 'Protein is at 80g against a 140g target across 5 logged days',
  action: { label: 'add a protein source to lunch', kind: 'nutrition' },
  read: { summary30d: '…', oneThingNow: 'add a protein source to lunch' },
};

test('speakableDirective keeps the FACTS verbatim in both tones (never re-numbers)', () => {
  for (const tone of ['supportive', 'direct']) {
    const line = speakableDirective(DIRECTIVE, tone);
    assert.ok(line.includes('80g'), `${tone} keeps 80g`);
    assert.ok(line.includes('140g'), `${tone} keeps 140g`);
    assert.ok(/protein is the lever this week/i.test(line));
    assert.ok(/add a protein source to lunch/i.test(line));
    assert.equal(containsShaming(line), false, `${tone} never shames`);
  }
});

test('tone changes only the framing of the action', () => {
  const sup = speakableDirective(DIRECTIVE, 'supportive');
  const dir = speakableDirective(DIRECTIVE, 'direct');
  assert.notEqual(sup, dir);
  assert.match(dir, /Next: add a protein source to lunch\./);
  assert.match(sup, /When you're ready, add a protein source to lunch\./);
});

test('speakableDirective is deterministic → display and speech cannot diverge (parity)', () => {
  // The SAME string is shown and spoken; recomputing yields an identical line.
  const a = speakableDirective(DIRECTIVE, 'supportive');
  const b = speakableDirective(DIRECTIVE, 'supportive');
  assert.equal(a, b);
});

test('a green/no-action directive reads the same in both tones (no fabricated step)', () => {
  const green = { verdict: 'On track', reason: 'Three sessions logged and protein on target', action: null, read: { oneThingNow: '' } };
  const sup = speakableDirective(green, 'supportive');
  const dir = speakableDirective(green, 'direct');
  assert.equal(sup, dir);            // identical when there's no action to frame
  assert.ok(!/next:|when you're ready/i.test(sup));
});

test('the parity channel round-trips losslessly (what was spoken === what was shown)', () => {
  const samples = [
    speakableDirective(DIRECTIVE, 'direct'),
    'Sleep dipped to 5.9h — protect tonight’s wind-down.',
    'Café crème & 50% — emoji, accents, symbols ✓',
    'line one\nline two',
  ];
  for (const s of samples) {
    assert.equal(decodeSpokenText(encodeSpokenText(s)), s);
  }
});

test('containsShaming flags shaming, passes honest framing', () => {
  assert.equal(containsShaming('You failed to hit your protein again.'), true);
  assert.equal(containsShaming('You only logged twice.'), true);
  assert.equal(containsShaming("Don't be lazy."), true);
  assert.equal(containsShaming('Protein is at 80g vs a 140g target — add a source at lunch.'), false);
});
