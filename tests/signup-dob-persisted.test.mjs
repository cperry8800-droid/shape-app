// EVERY SIGNUP SURFACE MUST PERSIST THE DATE OF BIRTH ONTO `profiles`.
//
// THE BUG (Codex round 10 on #1888, confirmed against the live database before
// fixing): public/signup-client.html collected a date of birth, sent it to the
// intake inbox and to `client_intakes` — and called shapeDb.signUp() WITHOUT it.
// That helper upserted `profiles` with no date_of_birth, so every account made
// through that flow carried date_of_birth NULL and, by the trigger, over_18 NULL.
//
// Why that is a gate failure and not a missing field: all three 18+ checks —
// the proxy's paid-prefix gate (src/lib/supabase/middleware.ts), computeMembership()'s
// isKnownMinor (src/lib/membership-core.ts) and refuseKnownMinor() (src/lib/age-gate.ts)
// — derive from date_of_birth at READ time and treat NULL as "says nothing", which
// ADMITS. `client_intakes` is not a table any of them reads. So a minor who
// answered the date-of-birth question honestly was let straight through, and the
// page was reachable from ~20 others including login.html's "Sign up" link.
//
// WHY A SOURCE-SCANNING GUARD RATHER THAN UNIT TESTS: the 18+ arithmetic has four
// copies (this helper, the page, newdesign/signup.jsx, mobile shapeBackend.js) and
// they CANNOT share a module — public/supabase.js is a browser IIFE loaded by
// <script> and signup-client.html's copy is inline, neither of which can import.
// Drift between the copies is the realistic failure, so the drift is what is gated,
// the way career-award-scope.test.mjs gates its two copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HELPER = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
const LEGACY_PAGE = readFileSync(new URL('../public/signup-client.html', import.meta.url), 'utf8');
const NEWDESIGN = readFileSync(new URL('../public/newdesign/signup.jsx', import.meta.url), 'utf8');
const MOBILE = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');

// The body of shapeDb.signUp(), so an assertion cannot be satisfied by an
// unrelated date_of_birth elsewhere in the file.
const signUpBody = (() => {
  const start = HELPER.indexOf('async signUp(opts)');
  assert.notEqual(start, -1, 'shapeDb.signUp(opts) not found — this guard is anchored to it');
  const end = HELPER.indexOf('async addRole(', start);
  assert.notEqual(end, -1, 'could not find the end of signUp()');
  return HELPER.slice(start, end);
})();

test('shapeDb.signUp writes date_of_birth into the profiles row', () => {
  const upsertAt = signUpBody.indexOf("from('profiles').upsert(");
  assert.notEqual(upsertAt, -1, 'signUp no longer upserts profiles — re-anchor this test');
  const upsert = signUpBody.slice(upsertAt, signUpBody.indexOf('})', upsertAt));
  assert.match(upsert, /date_of_birth\s*:/, 'the profiles upsert omits date_of_birth — accounts would be created UNGATED');
});

// ⚠ The metadata copy is not redundant. With email confirmation on, signUp()
// returns a user and NO session, so the upsert above cannot authenticate and the
// row is written later — newdesign/login.jsx:140 claims date_of_birth off
// user_metadata at first sign-in. Drop this and the confirm-by-email half of the
// flow still produces ungated accounts, which is the harder half to notice.
test('shapeDb.signUp also carries date_of_birth in auth metadata for the email-confirm path', () => {
  const optionsAt = signUpBody.indexOf('auth.signUp(');
  const options = signUpBody.slice(optionsAt, signUpBody.indexOf('if (signUpRes.error)', optionsAt));
  assert.match(options, /date_of_birth\s*:/, 'signUp metadata omits date_of_birth — email-confirm signups stay ungated');
});

test('shapeDb.signUp refuses a missing or under-18 date rather than creating the account', () => {
  assert.match(signUpBody, /dob_required/, 'no missing-DOB refusal');
  assert.match(signUpBody, /under_18/, 'no under-18 refusal');
  // Both refusals must return BEFORE the account is created, or the check is decorative.
  const authAt = signUpBody.indexOf('auth.signUp(');
  assert.ok(signUpBody.indexOf('under_18') < authAt, 'the under-18 check runs AFTER the account is created');
  assert.ok(signUpBody.indexOf('dob_required') < authAt, 'the missing-DOB check runs AFTER the account is created');
});

// over_18 is derived by set_over_18() from date_of_birth on every write and any
// supplied value is discarded. Writing it directly would read as though the flag
// were settable from the client, which is the exact misreading the DOB freeze
// migration (2026-08-15-profiles-dob-immutable.sql) exists to prevent.
test('no signup surface writes over_18 directly — it is derived, never supplied', () => {
  for (const [label, src] of [['supabase.js', HELPER], ['signup-client.html', LEGACY_PAGE],
                              ['signup.jsx', NEWDESIGN], ['shapeBackend.js', MOBILE]]) {
    assert.ok(!/over_18\s*:/.test(src), `${label}: sets over_18 directly`);
  }
});

test('the legacy signup page passes its collected dob into signUp', () => {
  const callAt = LEGACY_PAGE.indexOf('shapeDb.signUp({');
  assert.notEqual(callAt, -1, 'signup-client.html no longer calls shapeDb.signUp — re-anchor this test');
  const call = LEGACY_PAGE.slice(callAt, LEGACY_PAGE.indexOf('});', callAt));
  // \b matters: without it `xdob: data.dob` satisfies the match, so a renamed
  // (and therefore ignored) key would pass. Caught by mutation-testing this guard.
  assert.match(call, /\bdob\s*:\s*data\.dob/, 'the collected date of birth is not passed to signUp');
});

// ⚠ THE ORDER IS THE POINT, AND IT IS A SEPARATE DEFECT FROM THE MISSING DOB.
// completeSignup() relays the entire questionnaire — injuries, medications,
// dietary restrictions, emergency contact — to the Shape intake inbox via
// sendIntakeEmail() BEFORE it creates the account. Refusing a minor only inside
// signUp() would still have collected and transmitted a child's health data and
// only then declined them. The age check has to come first to mean anything.
test('the legacy page refuses a minor BEFORE relaying their intake questionnaire', () => {
  const fnAt = LEGACY_PAGE.indexOf('async function completeSignup()');
  assert.notEqual(fnAt, -1, 'completeSignup() not found — re-anchor this test');
  const body = LEGACY_PAGE.slice(fnAt);
  // ⚠ Match the CALL STATEMENT, not the bare name: the comments in both this
  // file and completeSignup() mention sendIntakeEmail(), and an indexOf on the
  // name alone finds the prose first and reports a passing order as failing.
  const checkAt = body.search(/^\s*if \(bornOn > adultBy\) \{/m);
  const emailAt = body.search(/^\s*sendIntakeEmail\(data\);/m);
  assert.notEqual(checkAt, -1, 'completeSignup() has no 18+ check');
  assert.notEqual(emailAt, -1, 'sendIntakeEmail call not found — re-anchor this test');
  assert.ok(checkAt < emailAt,
    "the 18+ check runs AFTER sendIntakeEmail() — a refused minor's health data is transmitted anyway");
});

// All four copies must agree on what "18" means. `setFullYear(getFullYear() - 18)`
// is the shared rule; a copy that drifts to a day-count or a different threshold
// would let one surface admit someone another refuses.
test('every surface uses the same 18-year threshold expression', () => {
  const rule = /setFullYear\(\s*(?:\w+(?:\.\w+)*)?\.?getFullYear\(\)\s*-\s*18\s*\)/;
  for (const [label, src] of [['supabase.js', HELPER], ['signup-client.html', LEGACY_PAGE],
                              ['signup.jsx', NEWDESIGN], ['shapeBackend.js', MOBILE]]) {
    assert.match(src, rule, `${label}: 18-year threshold missing or drifted`);
  }
});
