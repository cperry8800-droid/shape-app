// EVERY ACCOUNT-CREATING SURFACE MUST USE THE ONE 18+ RULE, AND PERSIST THE DOB.
//
// Two defects, one root cause. (1) The legacy signup collected a date of birth,
// wrote it only to the intake email and client_intakes — not a table any age
// check reads — and upserted `profiles` without it, so the row carried
// date_of_birth NULL. Every gate reads NULL as "says nothing", which ADMITS.
// (2) Every surface then carried its OWN hand-written 18+ comparison of the form
//   born > (new Date()).setFullYear(getFullYear() - 18)
// which compares INSTANTS: `new Date('2008-08-17')` is midnight UTC, so at
// 2026-08-17T00:30:00Z it reads ADULT while it is still Aug 16 in Los Angeles.
// That is exactly the counterexample the read-time gate was rewritten to close,
// so signup admitted the member the gate would later refuse — after relaying
// their health questionnaire.
//
// ⚠ THE PREVIOUS VERSION OF THIS FILE MADE BOTH PROBLEMS WORSE, WHICH IS WHY THE
// APPROACH CHANGED. It asserted the OLD expression as the shared rule across all
// four copies, so it actively PINNED every surface to the instant comparison the
// gate had abandoned — a guard cementing the bug it was written to prevent. And
// its threshold assertion searched a whole file for one match, while
// shapeBackend.js contains two (email signUp and signInWithPhone), so drifting
// one still passed. Both are fixed here: the rule now lives in ONE place, this
// file checks that every surface DELEGATES to it, and each mobile creation path
// is sliced and asserted independently.
//
// Behavioural equivalence of the canonical module and its classic-script mirror
// is a separate gate: tests/age-derive-mirror.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ⚠ STRIP COMMENTS BEFORE ASSERTING ABOUT CODE. The rationale comments on these
// surfaces quote the very expression this file bans and name `auth.signUp()`
// while explaining the ordering, so an assertion over raw text fires on its own
// explanation — which is exactly what happened when these two tests were first
// written. (Same lesson as tests/meal-note-copy.test.mjs.) The `:` lookbehind
// keeps `https://` out of the line-comment rule.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const HELPER = read('../public/supabase.js');
const LEGACY_PAGE = read('../public/signup-client.html');
const NEWDESIGN = read('../public/newdesign/signup.jsx');
const MOBILE = read('../mobile-app/src/services/shapeBackend.js');
const NEXT_ACTION = read('../src/app/login/actions.ts');

// Slice a function body by its opening marker and the marker that follows it, so
// an assertion can never be satisfied by a match somewhere else in the file.
function slice(src, startMarker, endMarker, label) {
  const start = src.indexOf(startMarker);
  assert.notEqual(start, -1, `${label}: start marker not found — re-anchor this test (${startMarker})`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `${label}: end marker not found — re-anchor this test (${endMarker})`);
  return src.slice(start, end);
}

const signUpBody = slice(HELPER, 'async signUp(opts)', 'async addRole(', 'supabase.js signUp');
const signInBody = slice(HELPER, 'async signIn(email, password)', 'async signOut()', 'supabase.js signIn');
// ⚠ The two mobile creation paths are sliced SEPARATELY. This is the exact
// scoping bug the previous version had: one whole-file search over a file with
// two matching sites passes while either one drifts.
const mobileSignUp = slice(MOBILE, 'async function signUp(', 'async function signInWithPhone(', 'shapeBackend signUp');
const mobilePhone = slice(MOBILE, 'async function signInWithPhone(', 'async function verifyPhoneOtp(', 'shapeBackend signInWithPhone');
const nextSignup = slice(NEXT_ACTION, 'export async function signup(', 'export async function requestPasswordReset(', 'actions.ts signup');

// ── The DOB reaches the row the gates actually read ──────────────────────────

test('shapeDb.signUp writes date_of_birth into the profiles row', () => {
  const at = signUpBody.indexOf("from('profiles').upsert(");
  assert.notEqual(at, -1, 'signUp no longer upserts profiles — re-anchor this test');
  const upsert = signUpBody.slice(at, signUpBody.indexOf('})', at));
  assert.match(upsert, /date_of_birth\s*:/, 'the profiles upsert omits date_of_birth — accounts would be created UNGATED');
});

// ⚠ Not redundant with the row write. With email confirmation on, signUp returns
// a user and NO session, so the upsert cannot authenticate and the row is written
// later — from this metadata, at first sign-in.
test('shapeDb.signUp also carries date_of_birth in auth metadata', () => {
  const at = signUpBody.indexOf('auth.signUp(');
  const options = signUpBody.slice(at, signUpBody.indexOf('if (signUpRes.error)', at));
  assert.match(options, /date_of_birth\s*:/, 'signUp metadata omits date_of_birth — email-confirm signups stay ungated');
});

// ⚠ THE LEGACY CONFIRM PATH'S ONLY PROVISIONING POINT. signup-client.html
// redirects to login.html (not newdesign/Login.html), and login.html REJECTS a
// missing profile, so without this the confirmed account keeps a usable session,
// no profiles row, and no DOB.
test('legacy signIn provisions a missing profile from the signup metadata', () => {
  assert.match(signInBody, /!profile/, 'signIn does not branch on a missing profile');
  assert.match(signInBody, /date_of_birth/, 'signIn provisioning drops the date of birth');
  assert.match(signInBody, /from\('profiles'\)\.upsert\(/, 'signIn does not write the profiles row');
});

test('the Next /signup action persists the DOB when a session exists', () => {
  assert.match(nextSignup, /from\('profiles'\)\.upsert\(/, '/signup never writes a profiles row — the account is ungated');
  assert.match(nextSignup, /date_of_birth\s*:\s*dob/, '/signup does not persist the collected date');
  assert.match(nextSignup, /data:\s*\{\s*role,\s*date_of_birth/, '/signup omits the DOB from auth metadata');
});

// ── Every surface delegates to the ONE rule, and fails closed ────────────────

const DELEGATES = [
  ['supabase.js signUp', signUpBody, /ShapeAgeDerive/],
  ['signup-client.html', LEGACY_PAGE, /ShapeAgeDerive/],
  ['newdesign/signup.jsx', NEWDESIGN, /ShapeAgeDerive/],
  ['shapeBackend signUp', mobileSignUp, /isMinorFromDob\(/],
  ['shapeBackend signInWithPhone', mobilePhone, /isMinorFromDob\(/],
  ['actions.ts signup', nextSignup, /isMinorFromDob\(/],
];

test('every account-creating path delegates to the shared derivation', () => {
  for (const [label, body, re] of DELEGATES) {
    assert.match(body, re, `${label}: does not use the shared 18+ derivation`);
  }
});

// ⚠ THE ANTI-REGRESSION THAT MATTERS MOST. The instant comparison is the bug;
// if it reappears on any surface the gate silently starts admitting minors at the
// boundary again, and every other assertion here would still pass.
test('no signup surface reintroduces the instant-based 18-year comparison', () => {
  const rule = /setFullYear\([^)]*getFullYear\(\)\s*-\s*18\s*\)/;
  for (const [label, raw] of [
    ['supabase.js signUp', signUpBody],
    ['signup-client.html', LEGACY_PAGE],
    ['newdesign/signup.jsx', NEWDESIGN],
    ['shapeBackend signUp', mobileSignUp],
    ['shapeBackend signInWithPhone', mobilePhone],
    ['actions.ts signup', nextSignup],
  ]) {
    const body = stripComments(raw);
    assert.ok(!rule.test(body),
      `${label}: the instant-based 18y comparison is back — it admits a minor on their local birthday eve`);
  }
});

// A surface that cannot load the rule must REFUSE, not skip the check.
test('the classic-script surfaces fail closed when the module is absent', () => {
  for (const [label, body] of [
    ['supabase.js signUp', signUpBody],
    ['signup-client.html', LEGACY_PAGE],
    ['newdesign/signup.jsx', NEWDESIGN],
  ]) {
    assert.match(body, /typeof\s+\w+\.isMinorFromDob\s*!==\s*['"]function['"]/,
      `${label}: no fail-closed guard — a failed module load would skip the age check entirely`);
  }
});

test('every page whose signup needs the mirror actually loads it', () => {
  const pages = ['../public/signup-client.html', '../public/newdesign/SignupClient.html',
                 '../public/newdesign/SignupNutritionist.html', '../public/newdesign/SignupTrainer.html'];
  for (const p of pages) {
    assert.match(read(p), /src="\/age-derive\.js"/,
      `${p}: does not load /age-derive.js — its signup would fail closed on every attempt`);
  }
});

// ── Ordering, and the things that must never be written ─────────────────────

// ⚠ THE ORDER IS A SEPARATE DEFECT FROM THE MISSING DOB. completeSignup() relays
// the entire questionnaire — injuries, medications, dietary restrictions,
// emergency contact — to the Shape inbox BEFORE the account is created. Refusing
// a minor only inside signUp() would still have transmitted a child's health data
// and only then declined them.
test('the legacy page refuses a minor BEFORE relaying their intake questionnaire', () => {
  const fnAt = LEGACY_PAGE.indexOf('async function completeSignup()');
  assert.notEqual(fnAt, -1, 'completeSignup() not found — re-anchor this test');
  const body = LEGACY_PAGE.slice(fnAt);
  // Match the CALL STATEMENT, not the bare name: the comments mention
  // sendIntakeEmail(), and an indexOf on the name finds the prose first.
  const checkAt = body.search(/^\s*if \(isMinor === true\) \{/m);
  const emailAt = body.search(/^\s*sendIntakeEmail\(data\);/m);
  assert.notEqual(checkAt, -1, 'completeSignup() has no 18+ refusal');
  assert.notEqual(emailAt, -1, 'sendIntakeEmail call not found — re-anchor this test');
  assert.ok(checkAt < emailAt,
    "the 18+ check runs AFTER sendIntakeEmail() — a refused minor's health data is transmitted anyway");
});

test('both refusals run before the account is created, on every surface', () => {
  const helper = stripComments(signUpBody);
  const authAt = helper.indexOf('auth.signUp(');
  assert.ok(authAt > -1, 'supabase.js: auth.signUp call not found — re-anchor');
  assert.ok(helper.indexOf('ShapeAgeDerive') < authAt, 'supabase.js: the age check runs AFTER account creation');
  const next = stripComments(nextSignup);
  const nextAuthAt = next.indexOf('auth.signUp(');
  assert.ok(nextAuthAt > -1, 'actions.ts: auth.signUp call not found — re-anchor');
  assert.ok(next.indexOf('isMinorFromDob(') < nextAuthAt, 'actions.ts: the age check runs AFTER account creation');
});

test('the legacy signup page passes its collected dob into signUp', () => {
  const callAt = LEGACY_PAGE.indexOf('shapeDb.signUp({');
  assert.notEqual(callAt, -1, 'signup-client.html no longer calls shapeDb.signUp — re-anchor this test');
  const call = LEGACY_PAGE.slice(callAt, LEGACY_PAGE.indexOf('});', callAt));
  // \b matters: without it `xdob: data.dob` satisfies the match, so a renamed
  // (and therefore ignored) key would pass. Caught by mutation-testing this guard.
  assert.match(call, /\bdob\s*:\s*data\.dob/, 'the collected date of birth is not passed to signUp');
});

// over_18 is derived by set_over_18() from date_of_birth on every write and any
// supplied value is discarded. Writing it directly would read as though the flag
// were settable from the client — the misreading the DOB freeze migration exists
// to prevent.
test('no signup surface writes over_18 directly — it is derived, never supplied', () => {
  for (const [label, src] of [['supabase.js', HELPER], ['signup-client.html', LEGACY_PAGE],
                              ['signup.jsx', NEWDESIGN], ['shapeBackend.js', MOBILE],
                              ['actions.ts', NEXT_ACTION]]) {
    assert.ok(!/over_18\s*:/.test(src), `${label}: sets over_18 directly`);
  }
});

// ── The coach path: application -> approval -> profile ──────────────────────

const APPLY_ROUTE = read('../src/app/api/apply/route.ts');
const APPROVAL = read('../src/app/dashboard/applications/actions.ts');

test('the apply route validates 18+ server-side, before the application is stored', () => {
  const body = stripComments(APPLY_ROUTE);
  const checkAt = body.indexOf('isMinorFromDob(');
  const insertAt = body.indexOf("from('provider_applications')");
  assert.ok(checkAt > -1, 'the apply route does not validate the applicant age at all');
  assert.ok(insertAt > -1, 'apply-route insert not found — re-anchor this test');
  assert.ok(checkAt < insertAt, 'the age check runs AFTER the application is written');
});

// ⚠ MIGRATION-SAFE OR PROVIDER SIGNUP BREAKS. `dob` is declared in the 2026-04-17
// migration but was never present on the live table (schema drift), so an insert
// naming it fails 42703 until 2026-08-16 is applied. Without the retry, every
// coach application would 500 in the window between deploy and migration.
test('the apply route degrades when the dob column is not yet deployed', () => {
  const body = stripComments(APPLY_ROUTE);
  assert.match(body, /42703|PGRST204/, 'no unknown-column retry — provider signup breaks until the migration runs');
  assert.match(body, /\.insert\(\{ \.\.\.applicationRow, details \}\)/,
    'the retry does not re-insert without the dob column');
  // ⚠ The retry must PRESERVE the validated date in `details`. Dropping it told
  // the applicant they were ready for review and then made them permanently
  // unapprovable, with no way for an admin to restore the value.
  assert.match(body, /details = \{ \.\.\.details, dob \}/,
    'the fallback discards the validated DOB — those applicants become unapprovable');
});

// ⚠ Approval provisions an auth user AND a coach profile, and coach roles satisfy
// membership automatically — so approving an application with no stored date of
// birth creates an entitled account the gates refuse at every surface. Legacy
// applications (submitted before the field existed) carry none.
test('approval refuses an application with no verified date of birth', () => {
  const body = stripComments(APPROVAL);
  const guardAt = body.search(/if \(!applicantDob/);
  // Match the CALL, not the declaration — resolveOrInviteProviderUser is defined
  // far above the guard, so indexOf on the bare name finds the function itself
  // and reports a correct order as failing. (Third time this exact trap: anchor
  // ordering assertions on the invocation.)
  const inviteAt = body.search(/await resolveOrInviteProviderUser\(/);
  assert.ok(guardAt > -1, 'approval does not require a date of birth');
  assert.ok(inviteAt > -1, 'invite call not found — re-anchor this test');
  assert.ok(guardAt < inviteAt, 'the DOB guard runs AFTER the auth user is created');
  assert.match(body, /isMinorFromDob\(applicantDob\)/, 'approval does not re-derive the applicant age');
  // Recovers the date from `details` for applications stored before the column existed.
  assert.match(body, /typed\.dob \|\|/, 'approval does not fall back to the details-carried DOB');
});

test('approval carries the DOB into the profile without overwriting an existing one', () => {
  const body = stripComments(APPROVAL);
  assert.match(body, /date_of_birth: dob/, 'approval does not persist the applicant DOB');
  assert.match(body, /profile\?\.date_of_birth \?/, 'approval can overwrite an existing DOB — the freeze makes the first write permanent');
});
