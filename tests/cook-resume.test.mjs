import test from 'node:test';
import assert from 'node:assert/strict';
import { bsCookStepSig, bsCookResumeStamp, bsCookResumeValid } from '../mobile-app/src/services/cookResume.mjs';

const STEPS = ['Heat the pan.', 'Sear 4 minutes a side.', 'Rest 5 minutes.', 'Plate it.'];
const DAY = '2026-07-25';
const stampAt = (i, steps = STEPS) => bsCookResumeStamp('k', i, steps, DAY);

test('a stamp written against the current steps resumes', () => {
  assert.equal(bsCookResumeValid(stampAt(2), 'k', STEPS, DAY).stepIdx, 2);
});

test('THE BUG: a renumbered recipe does not resume at the wrong step', () => {
  // Saved at index 2 ("Rest 5 minutes."), then the coach inserts a step above.
  const saved = stampAt(2);
  const edited = ['Heat the pan.', 'Salt it.', 'Sear 4 minutes a side.', 'Rest 5 minutes.', 'Plate it.'];
  // Index 2 now points at "Sear…" — the old behaviour would have dropped the
  // cook there, mid-method, at an instruction they had already done.
  assert.equal(edited[saved.stepIdx], 'Sear 4 minutes a side.');
  assert.equal(bsCookResumeValid(saved, 'k', edited, DAY), null);
});

test('a step edited IN PLACE (same count, same index) does not resume', () => {
  const saved = stampAt(1);
  const edited = [...STEPS];
  edited[1] = 'Sear 4 minutes a side, to 74°C / 165°F.';
  assert.equal(bsCookResumeValid(saved, 'k', edited, DAY), null);
});

test('a shortened list does not resume past its end', () => {
  assert.equal(bsCookResumeValid(stampAt(3), 'k', STEPS.slice(0, 2), DAY), null);
});

test('a different recipe, or another day, never resumes', () => {
  assert.equal(bsCookResumeValid(stampAt(1), 'other', STEPS, DAY), null);
  assert.equal(bsCookResumeValid(stampAt(1), 'k', STEPS, '2026-07-26'), null);
});

test('a pre-hardening stamp (no len/at) is discarded, not trusted', () => {
  const legacy = { key: 'k', stepIdx: 2, day: DAY };
  assert.equal(bsCookResumeValid(legacy, 'k', STEPS, DAY), null);
});

test('junk in never yields a resume', () => {
  for (const bad of [null, undefined, 0, 'x', [], { key: 'k', day: DAY, stepIdx: -1 }, { key: 'k', day: DAY, stepIdx: 1.5 }]) {
    assert.equal(bsCookResumeValid(bad, 'k', STEPS, DAY), null);
  }
  assert.equal(bsCookResumeValid(stampAt(0), 'k', null, DAY), null);
});

test('step signature normalises whitespace, bounds length, and reads authored objects', () => {
  assert.equal(bsCookStepSig('  Sear   the\nchicken.  '), 'Sear the chicken.');
  assert.equal(bsCookStepSig({ t: 'Roast 30 minutes.', station: 'oven' }), 'Roast 30 minutes.');
  assert.equal(bsCookStepSig('x'.repeat(200)).length, 80);
  assert.equal(bsCookStepSig(null), '');
  // Two steps differing only past the 80-char bound share a signature; the
  // length check still pins the list, so this is a bounded, deliberate limit.
  assert.equal(bsCookStepSig('y'.repeat(90)), bsCookStepSig('y'.repeat(85)));
});
