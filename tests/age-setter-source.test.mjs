// The MOBILE age setter must check the UPDATE RESULT, not merely the error.
//
// ⚠ THE DEFECT THIS PINS. `supabase.from('profiles').update(...).eq('id', uid)`
// resolves `{ error: null }` when it matched ZERO rows — PostgREST does not call
// that an error. An error-only check therefore returns "saved" for a member whose
// profiles row is missing, or whose write RLS refuses, and the optimistic toggle
// stands while nothing was written: the member is told their age is public when
// it is not. That is this feature's one unacceptable direction, and it is the
// same class /api/me/date-of-birth shipped and then fixed.
//
// ⚠ WHY SOURCE HERE, WHEN THE ROUTES NEXT DOOR ARE DRIVEN. shapeBackend.js is a
// window-global module that imports Capacitor and builds a live Supabase client
// at load, so node cannot execute it; every existing test covering that file
// asserts on its source for the same reason. tests/age-route-behaviour.test.mjs
// drives the two ROUTES, which are loadable — this covers the one write path that
// is not.
//
// ⚠ AND IT SLICES THE FUNCTION FIRST. tests/signup-dob-persisted.test.mjs records
// what happens otherwise: a whole-file search passed while one of two matching
// sites had drifted. Everything below is asserted inside the setAgePublic slice
// alone, so a correct sibling elsewhere in this 7,500-line file cannot satisfy it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'mobile-app/src/services/shapeBackend.js';

function setterSource() {
  const src = readFileSync(join(ROOT, SRC), 'utf8');
  const start = src.indexOf('async function setAgePublic(');
  assert.ok(start > 0, `${SRC} must still define setAgePublic`);
  const end = src.indexOf('window.ShapeAgeVisibility', start);
  assert.ok(end > start, 'the setAgePublic slice must terminate at the export');
  return src.slice(start, end);
}

test('setAgePublic asks for the updated row back', () => {
  const fn = setterSource();
  assert.match(
    fn, /\.select\(\s*['"]age_public['"]\s*\)/,
    'the update must request the stored row — without it a zero-row write is invisible'
  );
  assert.match(
    fn, /const \{ data, error \} = await supabase/,
    'it must destructure data, not error alone'
  );
});

test('setAgePublic throws when nothing was written', () => {
  const fn = setterSource();
  assert.match(fn, /throw new Error/, 'a failed save must throw so the caller can roll back');
  assert.ok(
    /!row/.test(fn),
    'a missing row must be treated as failure, not as success'
  );
  assert.ok(
    /row\.age_public !== want/.test(fn),
    'the STORED value must be compared to what was asked for'
  );
});

// ⚠ THE SHAPE THAT WAS WRONG, pinned so it cannot come back. This is the exact
// text the setter carried before the fix; if it reappears, the row check is gone.
test('the error-only write shape is absent', () => {
  const fn = setterSource();
  assert.ok(
    !/const \{ error \} = await supabase/.test(fn),
    'an error-only destructure cannot distinguish a zero-row update from a saved one'
  );
});
