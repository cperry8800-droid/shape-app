// The sign-in screen's door to the coach application (owner, 2026-11-09, of the application's three doors:
// "and all of these for where to find application"). Redrawn 2026-11-13 in the first-run look
// (BSFirstRun.jsx): the door is the "Apply to coach" pill in the top bar of join and sign-in alike, opening
// a screen of its own (the centred header, Apply as a trainer / a nutritionist in the panel). Joining
// makes a member's account; a coach applies, so a coach role left on the device can never turn a join
// into a coach account, and the dietitian question is the application's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MAIN = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', import.meta.url), 'utf8');
const LOGIN = MAIN.slice(MAIN.indexOf('function BSLogin('), MAIN.indexOf('\n}\n', MAIN.indexOf('function BSLogin(')));
const FIRST_RUN = readFileSync(new URL('../mobile-app/src/broadsheet/BSFirstRun.jsx', import.meta.url), 'utf8');
const SCREEN = FIRST_RUN.slice(FIRST_RUN.indexOf('export function BSLoginScreen('));
const APPLY = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx', import.meta.url), 'utf8');

test('the coach door: its title and line, and Apply as a trainer / a nutritionist opening the application', () => {
  assert.ok(LOGIN.length > 5000, 'the scan found the sign-in screen');
  // BSLogin hands the application's door to the screen; the screen offers it whenever it can open.
  assert.match(LOGIN, /onBack, onApply, captchaSlot,/);
  assert.match(SCREEN, /const pill = s\.onApply \? \(\n\s+<button type="button" data-fr-coach-pill=""/, 'shown whenever the application can open, not only after picking a coach role');
  assert.doesNotMatch(SCREEN.slice(SCREEN.indexOf('const pill = '), SCREEN.indexOf('const pill = ') + 300), /isCreate|isPhone/, 'on join and on sign in alike');
  const door = SCREEN.slice(SCREEN.indexOf('const coachDoor = s.onApply && coachOpen ? ('), SCREEN.indexOf('// The long forms take the compact header'));
  assert.ok(door.length > 400, 'the door is a screen of its own');
  // It opens OVER the form, which stays mounted: unmounting the form took the Turnstile widget's
  // container with it, and a join or sign-in after Close was stuck at the bot check.
  assert.match(door, /<div style=\{\{ position: 'absolute', inset: 0, zIndex: 5 \}\}>/, 'an overlay, not a replacement');
  assert.doesNotMatch(SCREEN.slice(0, SCREEN.indexOf('// The long forms take the compact header')), /if \(s\.onApply && coachOpen\) \{\s*return/, 'no early return that unmounts the form');
  assert.match(SCREEN, /<\/FRScreen>\n\s+\{coachDoor\}\n\s+<\/>/, 'the door renders after the form, which stays mounted');
  assert.match(door, /tr\('fr\.coachTitlePre'\)/);
  assert.match(door, /tr\('login\.coachCardBody'\)/);
  assert.match(door, /\[\['trainer', tr\('login\.applyTrainer'\)\], \['nutritionist', tr\('login\.applyNutritionist'\)\]\]/);
  assert.match(door, /onClick=\{\(\) => \{ s\.setAuthError\(''\); s\.onApply\(k\); \}\}/);
  // A first-run button is 52px tall (frButton), past the 44px a finger needs.
  assert.match(door, /style=\{frButton\('outline'/);
  const kit = readFileSync(new URL('../mobile-app/src/broadsheet/BSFirstRunKit.jsx', import.meta.url), 'utf8');
  assert.match(kit, /export function frButton\(kind, extra\) \{\n\s+return \{\n\s+width: '100%', minHeight: 52,/);
});

test('joining makes a member\'s account; a coach applies, and the application asks about the dietitian', () => {
  assert.match(LOGIN, /const signupRole = isCreate \? 'client' : role;/, 'a coach role left on the device never makes a join a coach account');
  assert.doesNotMatch(LOGIN, /coachCreate|isDietitian/, 'no role picker and no RD toggle on join');
  assert.doesNotMatch(SCREEN, /role="radiogroup"/, 'no role picker on join or sign in');
  // The dietitian (RD/RDN) says so in the application, which takes them on the nutritionist rails.
  assert.match(APPLY, /tr\('onboarding:apply\.opt\.dietitian', \{ defaultValue: 'Dietitian \(RD \/ RDN\)' \}\)/);
});
