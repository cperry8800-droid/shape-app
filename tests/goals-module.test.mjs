// BSGoals.jsx is the Goals page carved out of iosAppBroadsheetClient.jsx (2026-10-25, after Codex
// cited the WORKLOG rule on #2459 and the owner chose a move-only PR), as BSIntegrationsPage.jsx was
// (tests/integrations-page-module.test.mjs). It is a static import of the client module, so it
// evaluates BEFORE that module's body has published its globals: a top-level window read here would
// capture undefined, and the page would fail with React error #130 on first open while parse, tsc,
// the build and every render test that loads the client first all pass. This file pins the shape
// that avoids it, and the seam the goal model crosses (the client module publishes it on window).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadBroadsheet, drive } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const NEW = 'mobile-app/src/broadsheet/BSGoals.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const page = stripComments(fs.readFileSync(NEW, 'utf8'));
const client = stripComments(fs.readFileSync(CLIENT, 'utf8'));

const EXPORTED = ['BSClientGoals', 'BSGoalsContract', 'bsGoalWeekSleep'];
// Every component in the module, the four sheets included: each names its window globals first.
const COMPONENTS = ['BSClientGoals', 'BSGoalsContract', 'BSGoalEditSheet', 'BSOverallEditSheet', 'BSHeadlineEditSheet', 'BSWeighInSheet'];
// What moved, and must not be declared in the client module again.
const MOVED = [...COMPONENTS, 'bsGoalWeekSleep', 'bsGoalVolume', 'BSOLAct', 'BSOLRow', 'BSOLCredit', 'BS_GOAL_CATS', 'BS_GOAL_TEMPLATES', 'BS_GOALS_EMPTY', 'bsGoalIsoFromWeeks', 'bsGoalDaysUntil'];

test('the module exports the page, its contract and the week of sleep, and the client declares none of what moved', () => {
  for (const n of EXPORTED) assert.match(page, new RegExp(`^export function ${n}\\(`, 'm'), `${n} is not exported from the module`);
  for (const n of MOVED) {
    assert.match(page, new RegExp(`^(?:export )?(?:function|const) ${n}\\b`, 'm'), `${n} is not in the module`);
    assert.doesNotMatch(client, new RegExp(`^(?:export )?(?:function|const) ${n}\\b`, 'm'), `${n} is declared in the client module again: the move is being undone`);
  }
});

// Pinned by EVALUATING the module under a window that records every read, not by a pattern over its
// source (integrations-page-module's lesson: a top-level read spelled any other way passes a regex).
test('evaluating the module by itself reads NO window global, whatever the spelling', async () => {
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  let mod;
  try {
    mod = await loadRealModule(path.resolve(NEW));
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.deepEqual(Object.keys(mod).sort(), [...EXPORTED].sort(), 'the module evaluated but does not export what the client module and the suites import');
  assert.deepEqual(reads, [], `the module read window.${reads.join(', window.')} while it was being evaluated, before the client module published anything (React #130 on first open)`);
});

test('each component opens by naming the window globals it uses, at call time', () => {
  for (const n of COMPONENTS) {
    const m = new RegExp(`^(?:export )?function ${n}\\(.*\\) \\{\\n  const \\{ ([^}]+) \\} = window;`, 'm').exec(page);
    assert.ok(m, `${n} does not read its window globals on its first line`);
    assert.ok(m[1].split(',').map((s) => s.trim()).includes('useBS'), `${n} must take the theme hook from window at call time`);
  }
  // The masthead inset is the chrome's, read at call time with the chrome's own fallback.
  assert.match(page, /BS_MAST_TOP_CSS = 'max\(44px, calc\(env\(safe-area-inset-top, 0px\) \+ 12px\), var\(--bs-notch-floor, 0px\)\)'/);
});

test('the module carries its own translator, and imports only React, the pure goal contract and two siblings', () => {
  assert.match(page, /^function useShapeTr\(\) \{/m, 'the module has no useShapeTr()');
  for (const n of ['BSClientGoals', 'BSGoalsContract']) {
    const body = page.slice(page.indexOf(`export function ${n}(`));
    assert.match(body, /const tr = useShapeTr\(\);/, `${n} must bind tr from useShapeTr()`);
  }
  assert.equal((page.match(/window\.ShapeI18n/g) || []).length, 1, 'window.ShapeI18n must be read only inside useShapeTr()');
  const imports = [...page.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['react', 'react-dom', '../services/goalContract.mjs', './BSCheckinCard.jsx', './BSDash.jsx']);
  assert.ok(!imports.some((s) => /iosAppBroadsheet/.test(s)), 'the module imports the client module back');
});

test('the client imports the page, renders it from Home and Settings, and publishes the goal model after its last line', () => {
  assert.match(client, /^import \{ BSClientGoals \} from '\.\/BSGoals\.jsx';/m);
  assert.equal((client.match(/<BSClientGoals onBack=/g) || []).length, 2, 'Home and Settings no longer both open the page');
  const at = client.indexOf('Object.assign(window, {\n  BS_PRIMARY_GOALS,');
  assert.ok(at > 0, 'the goal model is not published on window');
  // Declared above the publish: a const named before its line is a TDZ error when the module loads.
  for (const n of ['BS_PRIMARY_GOALS', 'BS_PRIMARY_GOAL_MAX', 'BS_GOALS_DEFAULT', 'BS_GOAL_LB_TO_KG']) {
    const decl = client.indexOf(`const ${n} =`);
    assert.ok(decl > 0 && decl < at, `${n} is declared after the Object.assign that publishes it`);
  }
  const block = client.slice(at, client.indexOf('});', at));
  for (const n of ['bsPrimaryGoalLabel', 'bsPrimaryGoalToken', 'bsPrimaryGoalFromText', 'bsPrimaryGoalIsWeight', 'bsPrimaryGoalIsCustom', 'bsGoalUnitIsLb', 'bsGoalDocKg', 'bsGoalWeighIns', 'bsGoalNow', 'bsTHexA', 'useBSProgram', 'BSMeCorner']) {
    assert.match(block, new RegExp(`\\b${n}\\b`), `${n} is not published for the Goals module`);
  }
});

test('the page renders through the client module, every element a real component', async () => {
  // loadBroadsheet evaluates the client module, which compiles BSGoals.jsx as a sibling and runs the
  // Object.assign(window, …) above. A global the module read too early would be an undefined type.
  const { BSClientGoals } = await loadBroadsheet(['BSClientGoals']);
  globalThis.window.ShapeAuth = undefined;
  const d = drive(BSClientGoals, { onBack() {} });
  const nodes = d.nodes();
  assert.ok(nodes.every((n) => n.type !== undefined), 'an element with an undefined type rendered: a window global was read before the client module published it');
  assert.ok(nodes.some((n) => n.type && n.type.name === 'BSGoalsContract'), 'the page did not render its contract');
  assert.match(d.text, /Your goal/);
});
