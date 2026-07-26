import test from 'node:test';
import assert from 'node:assert/strict';
import { bsCookStepsSig, bsCookResumeStamp, bsCookResumeValid } from '../mobile-app/src/services/cookResume.mjs';

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

test('an EARLIER step changed — same length, same text at the saved index — does not resume', () => {
  // The case a length + saved-index check cannot see: a coach substitutes an
  // earlier instruction (here, a safety step) leaving the list length and the
  // saved step identical. The cook would have resumed past a changed method.
  const saved = stampAt(2);
  const edited = [...STEPS];
  edited[0] = 'Wash your hands, then heat the pan.';
  assert.equal(edited.length, STEPS.length);
  assert.equal(edited[saved.stepIdx], STEPS[saved.stepIdx]);
  assert.equal(bsCookResumeValid(saved, 'k', edited, DAY), null);
});

test('REORDERED steps do not resume, even though the set is unchanged', () => {
  const saved = stampAt(3);
  const edited = [STEPS[1], STEPS[0], STEPS[2], STEPS[3]];
  assert.equal(edited[saved.stepIdx], STEPS[saved.stepIdx]); // index 3 is untouched
  assert.equal(bsCookResumeValid(saved, 'k', edited, DAY), null);
});

test('a missing recipe key or day never resumes (undefined must not match undefined)', () => {
  const ghost = { stepIdx: 1, sig: bsCookStepsSig(STEPS) };          // no key, no day
  assert.equal(bsCookResumeValid(ghost, undefined, STEPS, undefined), null);
  assert.equal(bsCookResumeValid(ghost, '', STEPS, ''), null);
  assert.equal(bsCookResumeValid(stampAt(1), '   ', STEPS, DAY), null);
  assert.equal(bsCookResumeValid(stampAt(1), 'k', STEPS, '   '), null);
});

test('the method fingerprint cannot collide across step boundaries', () => {
  assert.notEqual(bsCookStepsSig(['ab', 'c']), bsCookStepsSig(['a', 'bc']));
  assert.notEqual(bsCookStepsSig(['a', 'b']), bsCookStepsSig(['ab']));
  assert.equal(bsCookStepsSig(STEPS), bsCookStepsSig([...STEPS])); // stable
});

test('no separator character is assumed impossible — control chars cannot collide either', () => {
  // `\s+` normalisation does NOT strip control characters, so a step may legally
  // contain the very character a naive serialiser would use as its delimiter.
  const SEP = String.fromCharCode(31); // U+001F, the obvious "impossible" pick
  assert.notEqual(bsCookStepsSig([`a${SEP}b`, 'c']), bsCookStepsSig(['a', `b${SEP}c`]));
  const TAB = String.fromCharCode(9);  // whitespace: normalised away, so these DO match
  assert.equal(bsCookStepsSig([`a${TAB}b`]), bsCookStepsSig(['a b']));
});

test('an edit PAST the old 80-char bound still invalidates the resume', () => {
  // The fingerprint hashes the full normalised text. A bounded per-step
  // signature would have made every edit after character 80 invisible.
  const long = 'z'.repeat(120);
  const saved = stampAt(0, [long, 'Plate it.']);
  const edited = [long.slice(0, 119) + 'Q', 'Plate it.'];
  assert.equal(edited[0].slice(0, 80), long.slice(0, 80), 'identical for the first 80 chars');
  assert.equal(bsCookResumeValid(saved, 'k', edited, DAY), null);
});

test('whitespace-only differences and the authored object shape still resume', () => {
  const saved = stampAt(1);
  const same = ['Heat   the pan.', { t: 'Sear 4 minutes a side.', station: 'stove' }, 'Rest 5 minutes.', 'Plate it.'];
  assert.equal(bsCookResumeValid(saved, 'k', same, DAY).stepIdx, 1);
});

test('a shortened list does not resume past its end', () => {
  assert.equal(bsCookResumeValid(stampAt(3), 'k', STEPS.slice(0, 2), DAY), null);
});

test('a different recipe, or another day, never resumes', () => {
  assert.equal(bsCookResumeValid(stampAt(1), 'other', STEPS, DAY), null);
  assert.equal(bsCookResumeValid(stampAt(1), 'k', STEPS, '2026-07-26'), null);
});

test('a pre-hardening stamp (no fingerprint) is discarded, not trusted', () => {
  const legacy = { key: 'k', stepIdx: 2, day: DAY };
  assert.equal(bsCookResumeValid(legacy, 'k', STEPS, DAY), null);
});

test('junk in never yields a resume', () => {
  for (const bad of [null, undefined, 0, 'x', [], { key: 'k', day: DAY, stepIdx: -1 }, { key: 'k', day: DAY, stepIdx: 1.5 }]) {
    assert.equal(bsCookResumeValid(bad, 'k', STEPS, DAY), null);
  }
  assert.equal(bsCookResumeValid(stampAt(0), 'k', null, DAY), null);
});

test('step normalisation: whitespace collapses, authored objects read, nullish is empty', () => {
  assert.equal(bsCookStepsSig(['  Sear   the\nchicken.  ']), bsCookStepsSig(['Sear the chicken.']));
  assert.equal(bsCookStepsSig([{ t: 'Roast 30 minutes.', station: 'oven' }]), bsCookStepsSig(['Roast 30 minutes.']));
  assert.equal(bsCookStepsSig([null]), bsCookStepsSig(['']));
  assert.equal(bsCookStepsSig([]), bsCookStepsSig(null)); // no method at all
});
