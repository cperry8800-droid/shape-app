// The sign-in screen's door to the coach application (owner, 2026-11-09, of the application's three doors:
// "and all of these for where to find application"). A card of its own under the sign-in links, there
// whichever role is picked; and joining as a trainer or nutritionist on the create step goes to the
// application, where it used to make an ordinary member account that met the paywall.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MAIN = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', import.meta.url), 'utf8');
const LOGIN = MAIN.slice(MAIN.indexOf('function BSLogin('), MAIN.indexOf('\n}\n', MAIN.indexOf('function BSLogin(')));

test('the coach card: its title and line, and Apply as a trainer / a nutritionist opening the application', () => {
  assert.ok(LOGIN.length > 5000, 'the scan found the sign-in screen');
  const card = LOGIN.slice(LOGIN.indexOf('data-login-coach-door'), LOGIN.indexOf('data-login-coach-door') + 2000);
  assert.match(LOGIN, /\{onApply && \(\s*<div data-login-coach-door=""/, 'shown whenever the application can open, not only after picking a coach role');
  assert.match(card, /tr\('login\.coachCardTitle'\)/);
  assert.match(card, /tr\('login\.coachCardBody'\)/);
  assert.match(card, /\[\['trainer', tr\('login\.applyTrainer'\)\], \['nutritionist', tr\('login\.applyNutritionist'\)\]\]/);
  assert.match(card, /onClick=\{\(\) => \{ setAuthError\(''\); onApply\(k\); \}\}/);
  assert.match(card, /minHeight: 44/);
});

test('joining as a coach is applying: the create step\'s primary action opens the application', () => {
  assert.match(LOGIN, /const coachCreate = isCreate && !!onApply && \(role === 'trainer' \|\| role === 'nutritionist' \|\| role === 'dietitian'\);/);
  assert.match(LOGIN, /onClick=\{coachCreate \? \(\) => \{ setAuthError\(''\); onApply\(signupRole\); \} : isPhone/);
  assert.match(LOGIN, /: coachCreate \? tr\('login\.applyAs', \{ role: roleLabel \}\)/, 'the button says it applies');
  // The dietitian pick reaches the application as a dietitian (signupRole), which no door could do before.
  assert.match(LOGIN, /onApply\(signupRole\)/);
});
