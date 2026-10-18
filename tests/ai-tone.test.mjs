// Nora's tone + spoken-directive parity. Pure logic shared by the chat route
// and /api/ai/speak. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TONES, DEFAULT_TONE, normalizeTone, FRAMING_RULES, toneInstruction, voiceForTone,
  voiceStyleForTone, speakableDirective, encodeSpokenText, decodeSpokenText, containsShaming,
  NORA_VOICES, normalizeVoice, resolveVoice, resolveVoiceWithDefault, OPENAI_TTS_VOICES, speechInstructions, NORA_DELIVERY,
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

test('voice maps per tone, in a woman\'s voice either way (supportive warm, direct bright)', () => {
  assert.equal(voiceForTone('supportive'), 'coral');
  assert.equal(voiceForTone('direct'), 'nova');
  assert.equal(voiceForTone('bogus'), 'coral'); // default
});

// Nora is a woman's voice at every step (owner, 2026-10-18: "her voice needs to sound more feminine").
const MENS_VOICES = ['alloy', 'ash', 'ballad', 'echo', 'fable', 'onyx', 'verse'];

test('resolveVoiceWithDefault: picker wins, then the env voice, then the tone default, and all of them are hers', () => {
  // A member's explicit pick always wins over the env default.
  assert.equal(resolveVoiceWithDefault('sage', 'nova', 'supportive'), 'sage');
  // No pick → the owner's env voice, when it is one of hers.
  assert.equal(resolveVoiceWithDefault(undefined, 'nova', 'supportive'), 'nova');
  assert.equal(resolveVoiceWithDefault('auto', 'SHIMMER ', 'direct'), 'shimmer'); // trimmed + case-insensitive
  // A man's voice, picked by an older build or set as the env default, falls to the tone's own.
  for (const v of MENS_VOICES) {
    assert.equal(resolveVoiceWithDefault(v, undefined, 'supportive'), 'coral', 'picked ' + v);
    assert.equal(resolveVoiceWithDefault(undefined, v, 'direct'), 'nova', 'env ' + v);
  }
  // Junk/unset env → the tone default (never trusted into the API call).
  assert.equal(resolveVoiceWithDefault(undefined, 'robot9000', 'supportive'), 'coral');
  assert.equal(resolveVoiceWithDefault(undefined, '', 'direct'), 'nova');
  assert.ok(OPENAI_TTS_VOICES.includes('fable'));
  for (const v of NORA_VOICES) assert.ok(OPENAI_TTS_VOICES.includes(v.id) && !MENS_VOICES.includes(v.id), v.id);
});

test('her delivery is brisk, and an owner\'s own instructions get her voice and pace added', () => {
  for (const t of ['supportive', 'direct']) {
    const s = speechInstructions('', t);
    assert.equal(s, voiceStyleForTone(t), 'unset: the tone\'s own style');
    assert.match(s, /woman/);
    assert.match(s, /brisk, lively pace/);
    assert.doesNotMatch(s, /relaxed/i);
  }
  assert.equal(speechInstructions('  Calm and bright.  ', 'direct'), 'Calm and bright. ' + NORA_DELIVERY);
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
  assert.equal(resolveVoice('sage', 'supportive'), 'sage');
  assert.equal(resolveVoice('auto', 'supportive'), 'coral');
  assert.equal(resolveVoice(undefined, 'direct'), 'nova');
  assert.equal(resolveVoice('not-a-voice', 'direct'), 'nova');
  assert.equal(resolveVoice('onyx', 'direct'), 'nova', 'a man\'s voice an older build saved');
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
