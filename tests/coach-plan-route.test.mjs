// "Open in builder" on Nora's card opens in the coach app the plan belongs to (Codex on #2594). Nora
// drafts for every coach role an account holds, so a trainer who is also a nutritionist can have a
// nutrition plan drafted from the trainer app, where no shell answered its card. The app's root now
// switches to the right coach app and hands the request over; the shell it mounts opens it.
// services/coachPlanRoute.mjs, the root's listener (iosAppBroadsheetMain.jsx) and both shells.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heldCoachRoles, coachPlanSwitch, holdCoachPlan, takeCoachPlan, COACH_PLAN_HANDOFF_MS } from '../mobile-app/src/services/coachPlanRoute.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const NUTRI = { planId: 'p-1', planKind: 'meal_plan', clientId: 'cl-9' };
const PROGRAM = { planId: 'p-2', planKind: null, clientId: null };

test('the coach roles an account holds, in the app\'s names', () => {
  assert.deepEqual(heldCoachRoles({ role: 'trainer', roles: ['client', 'Nutrition', 'trainer'] }), ['trainer', 'nutritionist']);
  assert.deepEqual(heldCoachRoles({ role: 'dietitian' }), ['dietitian']);
  assert.deepEqual(heldCoachRoles({ role: 'client', roles: ['client'] }), []);
  assert.deepEqual(heldCoachRoles(null), []);
});

test('the app switches only when the one on screen cannot answer and the account holds one that can', () => {
  // A nutrition plan from the trainer app: the nutritionist app (or the dietitian's, the same app).
  assert.equal(coachPlanSwitch(NUTRI, 'trainer', ['trainer', 'nutritionist']), 'nutritionist');
  assert.equal(coachPlanSwitch(NUTRI, 'trainer', ['trainer', 'dietitian']), 'dietitian');
  assert.equal(coachPlanSwitch(NUTRI, 'client', ['nutritionist']), 'nutritionist', 'from the member app too');
  // A trainer's program from the nutritionist app: the trainer app.
  assert.equal(coachPlanSwitch(PROGRAM, 'nutritionist', ['nutritionist', 'trainer']), 'trainer');
  assert.equal(coachPlanSwitch(PROGRAM, 'dietitian', ['dietitian', 'trainer']), 'trainer');
  // The app on screen answers its own: nothing switches.
  assert.equal(coachPlanSwitch(NUTRI, 'nutritionist', ['trainer', 'nutritionist']), null);
  assert.equal(coachPlanSwitch(NUTRI, 'dietitian', ['dietitian']), null);
  assert.equal(coachPlanSwitch(PROGRAM, 'trainer', ['trainer', 'nutritionist']), null);
  // An account without the role stays where it is; a card with no plan moves nothing.
  assert.equal(coachPlanSwitch(NUTRI, 'trainer', ['trainer']), null);
  assert.equal(coachPlanSwitch(PROGRAM, 'nutritionist', ['nutritionist']), null);
  assert.equal(coachPlanSwitch({ planKind: 'meal_plan' }, 'trainer', ['nutritionist']), null);
  assert.equal(coachPlanSwitch({ planId: '', planKind: 'meal_plan' }, 'trainer', ['nutritionist']), null);
  assert.equal(coachPlanSwitch(null, 'trainer', ['nutritionist']), null);
});

test('the handoff: taken once, by the shell it is for, and not after its time', () => {
  const w = {};
  holdCoachPlan(w, { ...NUTRI, extra: 'dropped' }, 1000);
  assert.equal(takeCoachPlan(w, false, 1001), null, 'the trainer shell leaves a nutrition plan');
  assert.deepEqual(takeCoachPlan(w, true, 1002), { planId: 'p-1', clientId: 'cl-9', planKind: 'meal_plan' });
  assert.equal(takeCoachPlan(w, true, 1003), null, 'taken once');
  holdCoachPlan(w, PROGRAM, 5000);
  assert.equal(takeCoachPlan(w, true, 5001), null, 'the nutritionist shell leaves a program');
  assert.deepEqual(takeCoachPlan(w, false, 5000 + COACH_PLAN_HANDOFF_MS), { planId: 'p-2', clientId: null, planKind: null });
  holdCoachPlan(w, NUTRI, 9000);
  assert.equal(takeCoachPlan(w, true, 9000 + COACH_PLAN_HANDOFF_MS + 1), null, 'a stale handoff is dropped');
  assert.equal(takeCoachPlan(w, true, 9002), null, 'and gone');
  holdCoachPlan(w, NUTRI, 9000);
  assert.equal(takeCoachPlan(w, true, 8000), null, 'a clock that went back is not trusted');
});

test('the root switches to the plan\'s coach app and holds the request; each shell takes its own on mount', () => {
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /import \{ heldCoachRoles, coachPlanSwitch, holdCoachPlan \} from '\.\.\/services\/coachPlanRoute\.mjs';/);
  const at = main.indexOf('const onOpenPlan = (e) => {');
  assert.ok(at > 0, 'the root listens');
  const body = main.slice(at, main.indexOf("}, []);", at));
  assert.match(body, /const held = heldCoachRoles\(window\.ShapeAuth\?\.getCachedState\?\.\(\)\?\.profile\);/);
  assert.match(body, /const target = coachPlanSwitch\(detail, roleNow\.current, held\);\n\s+if \(!target\) return;\n(\s+\/\/[^\n]*\n)?\s+mayLeave\(window\)\.then\(\(ok\) => \{\n\s+if \(!ok\) return;\n\s+holdCoachPlan\(window, detail\);\n\s+setRole\(target\);\n\s+setTweakNow\.current\('role', target\);/);
  assert.match(body, /window\.addEventListener\('shape:openCoachPlan', onOpenPlan\);/);
  assert.match(main, /roleNow\.current = role;/, 'the role on screen, read at the tap');

  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /import \{ takeCoachPlan \} from '\.\.\/services\/coachPlanRoute\.mjs';/);
  const taken = [...pros.matchAll(/const handed = takeCoachPlan\(window, (true|false)\);\n\s+if \(handed\) onOpenPlan\(\{ detail: handed \}\);/g)].map((m) => m[1]);
  assert.deepEqual(taken, ['false', 'true'], 'the trainer shell takes programs, the nutritionist shell nutrition plans');
});

test('the leave guard: one held at a time, asked before a tab tap or a jump, let go by its own release (Codex on #2594)', async () => {
  const { holdLeave, mayLeave } = await import('../mobile-app/src/services/leaveGuard.mjs');
  const w = {};
  assert.equal(await mayLeave(w), true, 'none held: go');
  const releaseA = holdLeave(w, async () => true);
  assert.equal(await mayLeave(w), true);
  // A newer screen holds its own guard, one that says stay: the older screen letting go of its guard
  // must not drop the newer one (the mutation round on 1366ae8 found the old check could not tell).
  const releaseB = holdLeave(w, async () => false);
  assert.equal(await mayLeave(w), false);
  releaseA();
  assert.equal(await mayLeave(w), false, 'an older screen\'s release leaves the newer guard');
  releaseB();
  assert.equal(await mayLeave(w), true, 'its own release drops it');
  holdLeave(w, async () => { throw new Error('dialog failed'); });
  assert.equal(await mayLeave(w), false, 'a guard that fails keeps the work');
  holdLeave(w, async () => 'yes');
  assert.equal(await mayLeave(w), false, 'only a plain yes leaves');
  assert.equal(typeof holdLeave(w, null), 'function', 'no guard to hold: a release that does nothing');

  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  const nutri = pros.slice(pros.indexOf('function BSNutritionistAppInner('), pros.indexOf('function BSNutriToday('));
  assert.match(nutri, /<BSTabBar active=\{tab\} onChange=\{\(k\) => \{ mayLeave\(window\)\.then\(\(ok\) => \{ if \(ok\) setTab\(k\); \}\); \}\}/, 'the tab bar asks first');
  assert.match(nutri, /mayLeave\(window\)\.then\(\(ok\) => \{\n\s+if \(!ok\) return;\n\s+navJumpRef\.current\.navPush\(\);\n\s+setOpenPlanRequest\(/, 'so does opening Nora\'s plan');
  // A swipe that reaches the shell steps tabs too (Codex on #2594): it asks the guard before it does.
  assert.match(nutri, /const onNavGesture = \(intent\) => \{ mayLeave\(window\)\.then\(\(ok\) => \{ if \(ok\) stepNav\(intent\); \}\); \};/, 'and a swipe');
  assert.match(nutri, /const next = bsNavStepTab\(\['today', 'clients', 'plans', 'chat', 'me'\], tab, intent\);/, 'stepNav is the nutritionist\'s own step');
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /mayLeave\(window\)\.then\(\(ok\) => \{\n\s+if \(!ok\) return;\n\s+holdCoachPlan\(window, detail\);/, 'and switching coach apps');
});
