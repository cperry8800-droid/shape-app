// plainText — markdown out, words untouched. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainText } from '../src/lib/ai/replyText.mjs';

test('markup is removed and every word survives', () => {
  const md = '## Today\n\n**Upper body — push** at 07:30, then *Easy run*.\n\n- Bench press 4 × 6\n- Dips 3 × 10\n\n1. Warm up\n2) Lift\n\n> Tip: `log_meal` after lunch.\n\n```\ncode\n```\n';
  const out = plainText(md);
  assert.equal(out, 'Today\n\nUpper body — push at 07:30, then Easy run.\n\n• Bench press 4 × 6\n• Dips 3 × 10\n\n1. Warm up\n2. Lift\n\nTip: log_meal after lunch.\n\ncode');
  // Nothing the model said is gone: the word sequence is identical either side.
  const words = (s) => s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
  assert.deepEqual(words(out), words(md));
});

test('plain prose passes through unchanged; a lone asterisk, a multiplication sign and 4 × 6 are not markup', () => {
  const s = "You've logged 2 of 4 habits today — nice. Bench press was 185 lb × 6, up from 180 × 6.";
  assert.equal(plainText(s), s);
  assert.equal(plainText('Rate it 1-10 * optional'), 'Rate it 1-10 * optional');
  assert.equal(plainText('185 lb * 3 * 5 today'), '185 lb * 3 * 5 today', 'two multiplication signs are not an emphasis pair');
  assert.equal(plainText('a *real* emphasis and _another_ one'), 'a real emphasis and another one');
  assert.equal(plainText('snake_case_names stay'), 'snake_case_names stay');
  assert.equal(plainText(null), '');
  assert.equal(plainText('  padded  \n\n\n\nlines  '), 'padded\n\nlines');
});
