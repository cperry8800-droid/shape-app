// Nora's voice starts on the first sentence (speed, 2026-10-08): the split rule, and the
// website's own copy of it held to the same answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { speechParts } from '../public/newdesign/noraVoiceLoop.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = readFileSync(join(ROOT, 'public/newdesign/chatWidget.jsx'), 'utf8');

const CORPUS = [
  '',
  'Yes.',
  'Hi! Your message came through clearly. How can I help?',
  'Great question. Your plan this week has three strength days and two easy runs, with Sunday off. I would keep the long run easy, and add protein at breakfast so you recover well before Tuesday.',
  'A long opening sentence that keeps going without any full stop for a very long while, past two hundred and twenty characters, so there is no sentence end within reach of the first part and the whole reply must stay as one piece to be spoken. Then a second.',
  'Your coach, Dr. Lee, set 150 g of protein today! That is about 40 g per meal. "Keep it simple," she said. Eggs, Greek yogurt and chicken get you most of the way there before dinner tonight.',
  'You logged 1,568 kcal so far today, which leaves about 600 for dinner. Shall I draft it?',
];

test('the split: an opening of at least sixty characters, then the rest; short replies stay whole', () => {
  assert.deepEqual(speechParts(''), []);
  assert.deepEqual(speechParts('Yes.'), ['Yes.']);
  assert.deepEqual(speechParts('Hi! Your message came through clearly. How can I help?'), ['Hi! Your message came through clearly. How can I help?'], 'too short to be worth two requests');
  const two = speechParts(CORPUS[3]);
  assert.equal(two.length, 2);
  assert.ok(two[0].length >= 60 && two[0].length <= 220);
  assert.match(two[0], /[.!?]$/, 'the opening ends on a sentence end');
  assert.deepEqual(speechParts(CORPUS[4]), [CORPUS[4]], 'no sentence end within reach: one piece');
  assert.deepEqual(speechParts(CORPUS[6]), [CORPUS[6]], 'a rest under forty characters is not worth its own request');
  for (const text of CORPUS) {
    const parts = speechParts(text);
    assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.trim().replace(/\s+/g, ' '), 'the words are never changed, only cut');
  }
});

test('the website keeps its own copy of the rule, with the same answers', () => {
  const start = WEB.indexOf('function cwSpeechParts(text) {');
  assert.ok(start > 0, 'the website has its copy');
  const src = WEB.slice(start, WEB.indexOf('\n}\n', start) + 2);
  const cwSpeechParts = new Function(`${src}; return cwSpeechParts;`)();
  for (const text of CORPUS) assert.deepEqual(cwSpeechParts(text), speechParts(text), JSON.stringify(text));
  // And website Listen asks for both parts at once, then plays the rest on the same player.
  const speak = WEB.slice(WEB.indexOf('const speakNora = async (text, opts) => {'), WEB.indexOf('\n  };\n', WEB.indexOf('const speakNora = async (text, opts) => {')));
  assert.match(speak, /const parts = cwSpeechParts\(clean\.slice\(0, 2000\)\);/);
  assert.match(speak, /const rest = parts\.length > 1 \? ask\(parts\[1\]\)/);
  assert.ok(speak.indexOf('opening = ask(parts[0])') < speak.indexOf('const rest ='), 'the opening is asked for first');
  assert.ok(speak.indexOf('const rest =') < speak.indexOf('await opening'), 'and the rest before the opening is awaited');
  assert.match(speak, /if \(rest && gen === noraGenRef\.current\) \{ playRest\(\); return; \}/);
});
