// The finish pop-up (owner, 2026-11-04: "at the end of each workout, have a pop up appear where the
// client ranks workout from level of difficulty to enjoyment/satisfication"), BSSessionFinish.jsx.
// MOUNTED: the real BSSession in jsdom with real React and the real react-dom, so the sheet lands in
// #bs-phone-surface over the live session as it does on the phone.
//
// What it pins:
//   · THE SEAM. The module imports only React, react-dom and its look siblings (never the client),
//     reads no window global while it evaluates, names its globals on its first line and carries its
//     own translator; the client renders it beside the view, never in its place.
//   · Ending a workout (End workout early, or Finish workout) opens a modal sheet over the session,
//     which stays drawn under it; the sheet takes focus.
//   · The two ratings lead (effort 1-10, enjoyment 1-5), then the duration question, the share
//     toggle and Save. Nothing is picked; a tap picks, a second tap un-picks; effort is lit in its
//     band (green to 4, amber to 7, red above), and glows on dark paper only.
//   · Save sends sessionRpe and summary.enjoyment; skipped ratings save as null; reviewFeel is never
//     written. The draft keeps enjoyment; an older draft's reviewFeel restores harmlessly.
//   · ← Edit workout closes it back to the workout without saving.
//   · A failed save keeps the sheet, freezes the ratings, turns Edit into Pause & exit, and Retry
//     sends the very same submission.
//   · Every control on it is a 44px target.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import * as ReactDOM from 'react-dom';
import { IntlMessageFormat } from 'intl-messageformat';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadBroadsheet, THEME } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const FINISH = 'mobile-app/src/broadsheet/BSSessionFinish.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const finishSrc = stripComments(fs.readFileSync(FINISH, 'utf8'));
const client = stripComments(fs.readFileSync(CLIENT, 'utf8'));

// ── The seam ─────────────────────────────────────────────────────────────────────────────────────

test('the module exports the sheet, imports no host module, and carries its own translator', () => {
  assert.deepEqual([...finishSrc.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]), ['BSSessionFinish']);
  assert.deepEqual([...finishSrc.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]), ['react', 'react-dom', './bsCleanType.jsx', './BSProInstrument.jsx', '../services/dialogBack.mjs']);
  assert.match(finishSrc, /^function useShapeTr\(\) \{/m);
  assert.equal((finishSrc.match(/window\.ShapeI18n/g) || []).length, 1, 'window.ShapeI18n is read only inside useShapeTr()');
  assert.match(finishSrc, /^export function BSSessionFinish\(\{ finish: F \}\) \{\n  const \{ useBS, bsSdReduced \} = window;/m);
  // It portals into the phone's surface, as the app's other sheets do.
  assert.match(finishSrc, /document\.getElementById\('bs-phone-surface'\)/);
  assert.match(finishSrc, /return surface \? createPortal\(body, surface\) : body;/);
});

test('evaluating the module by itself reads NO window global', async () => {
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  try {
    await loadRealModule(path.resolve(FINISH), { registry: new Map([['react-dom', { createPortal: (n) => n }]]) });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.deepEqual(reads, [], `${FINISH} read window.${reads.join(', window.')} while it was being evaluated`);
});

test('the client renders the pop-up beside the view, and the old finish page is gone', () => {
  assert.match(client, /^import \{ BSSessionFinish \} from '\.\/BSSessionFinish\.jsx';$/m);
  const player = client.slice(client.indexOf('function BSSession('), client.indexOf('const BS_GROCERY_DEFAULT'));
  assert.equal((player.match(/<BSSessionFinish finish=\{\{/g) || []).length, 1);
  assert.match(player, /const finishSheet = completing \? <BSSessionFinish finish=\{\{/);
  assert.match(player, /\}\} \/>\n {2}\{finishSheet\}\n {2}<\/>;\n\}/, 'the sheet rides after the view in one fragment');
  assert.doesNotMatch(player, /if \(completing\) \{/, 'no page of its own any more');
  // Its words are the module's now; the vibe is gone everywhere.
  for (const key of ['effortQ', 'effortScale', 'effortAria', 'completeEyebrow', 'saveFinish', 'enjoyQ', 'shareToggle'])
    assert.doesNotMatch(player, new RegExp(`tr\\('session:player\\.${key}'`), `the client still draws session:player.${key}`);
  assert.doesNotMatch(client, /reviewFeel/, 'nothing reads or writes the old vibe');
  assert.doesNotMatch(client, /session:player\.vibe/);
  const en = JSON.parse(fs.readFileSync('mobile-app/src/i18n/catalogs/en/session.json', 'utf8'));
  assert.deepEqual(Object.keys(en).filter((k) => k.startsWith('player.vibe')), []);
});

// ── Mounted ──────────────────────────────────────────────────────────────────────────────────────

// The app is drawn inside the phone surface and the sheet portals in beside it, as on the phone.
const dom = new JSDOM('<!doctype html><div id="bs-phone-surface"><div id="root"></div></div>', { url: 'https://shape.test/m/' });
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
globalThis.dispatchEvent = dom.window.dispatchEvent.bind(dom.window);
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.useStateBSC = React.useState;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'client-f' } }) };
globalThis.ShapeLiveProgress = { clear() {}, push() {} };
globalThis.shapeDb = { getUserGoals: async () => null };
globalThis.__bsToast = () => {};
// The app's translator over the shipped English catalogs. A key `en` lacks returns nothing (the
// caller's fallback then shows), so what the member sees asserted below proves each key resolves.
const CAT = new Map();
const catalog = (ns) => {
  if (!CAT.has(ns)) {
    const p = `mobile-app/src/i18n/catalogs/en/${ns}.json`;
    CAT.set(ns, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
  }
  return CAT.get(ns);
};
globalThis.ShapeI18n = {
  t: (key, opts = {}) => {
    const i = String(key).indexOf(':');
    const raw = i < 0 ? null : catalog(key.slice(0, i))[key.slice(i + 1)];
    return raw == null ? undefined : new IntlMessageFormat(raw, 'en').format(opts);
  },
};
const { BSSession } = await loadBroadsheet('BSSession', React, ReactDOM);
const { createRoot } = await import('react-dom/client');

// Light paper is the harness's theme; dark paper is the same map with the dark paper's tokens.
const LIGHT = THEME;
const DARK = new Proxy({ ...THEME, isLight: false, PAPER: '#0b0f0f', INK: '#f2ede4', INK50: '#8a8780', INK70: '#bdb8ae' }, { get: (t, k) => (k in t ? t[k] : '#000'), has: () => true });
globalThis.useBS = () => LIGHT;

const rootEl = document.getElementById('root');
const surface = document.getElementById('bs-phone-surface');
const MOVES = [{ m: 'Back squat', s: '2 × 5', l: '100 kg', reps: '5', sets: 2, rpe: '8' }];
let root = null;
let saved = [];
let failSaves = 0;
const mount = async (props = {}) => {
  saved = [];
  globalThis.ShapeWorkoutLogs = {
    saveSessionLog: async (payload) => {
      saved.push(structuredClone(payload));
      if (failSaves > 0) { failSaves -= 1; throw new Error('Offline — retry'); }
      return { workoutSession: { stored: 'supabase', data: { id: payload.sessionId } } };
    },
  };
  root = createRoot(rootEl);
  await act(async () => root.render(React.createElement(BSSession, { moves: MOVES, title: 'Lower — Build', onBack() {}, ...props })));
};
const unmount = async () => { if (root) await act(async () => root.unmount()); root = null; globalThis.useBS = () => LIGHT; failSaves = 0; };
const fresh = () => { localStorage.clear(); localStorage.setItem('shapeClientWorkoutView:client-f', 'focus'); };
const buttonIn = (scope, label) => [...scope.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent.trim() === label);
const press = async (scope, label) => { const b = buttonIn(scope, label); assert.ok(b, `no button ${label}`); await act(async () => b.click()); };
const sheet = () => surface.querySelector('[role="dialog"]');
const draft = () => JSON.parse(localStorage.getItem('shapeClientWorkoutDrafts:client-f') || '[]')[0];
const pressedOf = (prefix) => [...sheet().querySelectorAll('button[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label')).filter((l) => l && l.startsWith(prefix));
const rgb = (hex) => {
  const h = hex.slice(1), n = parseInt(h.length === 3 ? [...h].map((x) => x + x).join('') : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

test('End workout early opens the pop-up over the session, which stays drawn under it', async (t) => {
  t.after(unmount); fresh(); await mount();
  assert.ok(!sheet(), 'no pop-up while the workout runs');
  await press(document, 'End workout early');
  const dlg = sheet();
  assert.ok(dlg, 'the pop-up');
  assert.ok(surface.contains(dlg), 'portalled into the phone surface');
  assert.equal(dlg.getAttribute('aria-modal'), 'true');
  // The session is still drawn behind it, untouched.
  assert.match(rootEl.textContent, /Back squat/);
  assert.ok(buttonIn(rootEl, 'Change view'), 'the session view is still there');
  // A dim over the whole phone, the sheet at its foot with a rounded top, scrolling when tall.
  const dim = dlg.parentElement;
  assert.equal(dim.style.position, 'absolute');
  assert.equal(dim.style.inset, '0px');
  assert.equal(dim.style.zIndex, '200');
  assert.equal(dim.style.justifyContent, 'flex-end');
  assert.equal(dlg.style.borderTopLeftRadius, '24px');
  assert.equal(dlg.style.borderTopRightRadius, '24px');
  assert.equal(dlg.style.overflowY, 'auto');
  assert.equal(dlg.style.maxHeight, '92%');
  // The title is the workout's, it names the dialog, and it takes focus as the sheet opens.
  const title = document.getElementById(dlg.getAttribute('aria-labelledby'));
  assert.equal(title.textContent, 'Lower — Build');
  assert.ok(document.activeElement === title, 'the title takes focus');
  assert.match(dlg.textContent, /Session · Complete/);
  assert.match(dlg.textContent, /0 of 2 sets · 0:0\d on the clock/);
  // The two ratings lead, then the duration question (this timer never ran), the share toggle, Save.
  const text = dlg.textContent;
  const at = ['How hard was that?', '1 easy · 10 all-out', 'How much did you enjoy it?', '1 not at all · 5 loved it', 'How long?', 'Share to the community', 'Save & finish ✓'].map((s) => text.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `missing: ${JSON.stringify(at)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in that order');
  assert.doesNotMatch(text, /The vibe|Loved it|Not for me/);
});

test('Finish workout, once every set is logged, opens the same pop-up', async (t) => {
  t.after(unmount); fresh(); await mount();
  await press(document, 'Log set 1 · 5 reps');
  await press(document, 'Log set 2 · 5 reps');
  assert.ok(!sheet(), 'no pop-up while sets remain');
  await press(document, 'Finish workout ✓');
  assert.ok(sheet());
  assert.match(sheet().textContent, /2 of 2 sets/);
});

test('the two ratings: nothing picked; a tap picks, a second tap un-picks; effort lit in its band', async (t) => {
  t.after(unmount); fresh(); await mount();
  await press(document, 'End workout early');
  const dlg = sheet();
  const effort = [...dlg.querySelectorAll('[data-finish-rating="effort"] button')];
  const enjoy = [...dlg.querySelectorAll('[data-finish-rating="enjoy"] button')];
  assert.deepEqual(effort.map((b) => b.getAttribute('aria-label')), Array.from({ length: 10 }, (_, i) => `Effort ${i + 1} of 10`));
  assert.deepEqual(enjoy.map((b) => b.getAttribute('aria-label')), Array.from({ length: 5 }, (_, i) => `Enjoyment ${i + 1} of 5`));
  assert.deepEqual(effort.map((b) => b.textContent), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  // Each row is a group named by its question.
  for (const [id, q] of [['effort', 'How hard was that?'], ['enjoy', 'How much did you enjoy it?']]) {
    const g = dlg.querySelector(`[data-finish-rating="${id}"]`);
    assert.equal(g.getAttribute('role'), 'group');
    assert.equal(document.getElementById(g.getAttribute('aria-labelledby')).textContent, q);
  }
  assert.equal(dlg.querySelectorAll('[aria-pressed="true"]').length, 0, 'nothing pre-selected');

  await press(dlg, 'Effort 9 of 10');
  assert.deepEqual(pressedOf('Effort'), ['Effort 9 of 10']);
  // The pick lit in its band (red above 7), the slots under it lit faintly in theirs: a meter.
  const slot = (n) => sheet().querySelector(`[data-finish-rating="effort"] [data-finish-slot="${n}"]`);
  assert.equal(slot(9).style.color, rgb('#c4432b'));
  assert.equal(slot(6).style.color, rgb('#a8680d'));
  assert.equal(slot(3).style.color, rgb('#17844c'));
  assert.equal(slot(10).style.color, rgb(LIGHT.INK50), 'above the pick stays unlit');
  assert.equal(draft().sessionRpe, 9);
  await press(sheet(), 'Effort 9 of 10');
  assert.deepEqual(pressedOf('Effort'), [], 'a second tap clears it');
  assert.equal(draft().sessionRpe, null, 'cleared is null, never 0');

  await press(sheet(), 'Enjoyment 4 of 5');
  assert.deepEqual(pressedOf('Enjoyment'), ['Enjoyment 4 of 5']);
  assert.equal(draft().enjoyment, 4, 'the draft keeps it');
  await press(sheet(), 'Enjoyment 4 of 5');
  assert.deepEqual(pressedOf('Enjoyment'), []);
  assert.equal(draft().enjoyment, null);
  await press(sheet(), 'Enjoyment 2 of 5');
  assert.deepEqual(pressedOf('Enjoyment'), ['Enjoyment 2 of 5']);
  assert.equal(draft().enjoyment, 2);
  assert.equal('reviewFeel' in draft(), false, 'the draft no longer writes the vibe');
});

test('Save sends sessionRpe and summary.enjoyment', async (t) => {
  t.after(unmount); fresh(); await mount();
  await press(document, 'End workout early');
  await press(sheet(), 'Effort 6 of 10');
  await press(sheet(), 'Enjoyment 5 of 5');
  await press(sheet(), 'Save & finish ✓');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].sessionRpe, 6);
  assert.equal(saved[0].summary.enjoyment, 5);
  assert.equal('reviewFeel' in saved[0].summary, false, 'the vibe is no longer written');
  assert.equal(saved[0].summary.prescription.title, 'Lower — Build', 'the rest of the summary rides as before');
});

test('skipped ratings save as null, never 0', async (t) => {
  t.after(unmount); fresh(); await mount();
  await press(document, 'End workout early');
  await press(sheet(), 'Save & finish ✓');
  assert.equal(saved.length, 1);
  assert.strictEqual(saved[0].sessionRpe, null);
  assert.strictEqual(saved[0].summary.enjoyment, null);
});

test('the workout behind the sheet is inert and hidden while it shows, and focus is held in the sheet (Codex P2 on #2614)', async (t) => {
  t.after(unmount); fresh(); await mount();
  assert.ok(!rootEl.hasAttribute('inert'), 'nothing inert while the workout runs');
  await press(document, 'End workout early');
  const dlg = sheet();
  const title = document.getElementById(dlg.getAttribute('aria-labelledby'));
  // Every other child of the phone surface: the app with the workout in it.
  assert.ok(rootEl.hasAttribute('inert'), 'the workout is inert');
  assert.equal(rootEl.getAttribute('aria-hidden'), 'true', 'and hidden from screen readers');
  assert.ok(!dlg.closest('[inert]'), 'the sheet itself is not');
  // A focus that lands outside the sheet (Tab past its end, or a switch control) goes back to its title.
  const behind = buttonIn(rootEl, 'Change view');
  assert.ok(behind, 'a control behind the sheet');
  await act(async () => { behind.focus(); });
  assert.ok(document.activeElement === title, 'focus is sent back to the sheet');
  // Inside the sheet, focus moves freely.
  const pick = buttonIn(dlg, 'Effort 5 of 10');
  await act(async () => { pick.focus(); });
  assert.ok(document.activeElement === pick);
  // Closed, the workout is back: neither inert nor hidden, and focus is no longer held.
  await press(sheet(), '← Edit workout');
  assert.ok(!sheet());
  assert.ok(!rootEl.hasAttribute('inert'), 'the workout is live again');
  assert.ok(!rootEl.hasAttribute('aria-hidden'));
  const again = buttonIn(rootEl, 'Change view');
  await act(async () => { again.focus(); });
  assert.ok(document.activeElement === again, 'focus stays where it is put');
});

test('← Edit workout closes the pop-up back to the workout, saving nothing', async (t) => {
  t.after(unmount); fresh(); await mount();
  await press(document, 'End workout early');
  await press(sheet(), 'Effort 5 of 10');
  await press(sheet(), 'Enjoyment 3 of 5');
  await press(sheet(), '← Edit workout');
  assert.ok(!sheet(), 'closed');
  assert.equal(saved.length, 0);
  assert.ok(buttonIn(document, 'Log set 1 · 5 reps'), 'back on the workout, its sets still open');
  // The answers wait for the next finish.
  await press(document, 'End workout early');
  assert.deepEqual(pressedOf('Effort'), ['Effort 5 of 10']);
  assert.deepEqual(pressedOf('Enjoyment'), ['Enjoyment 3 of 5']);
});

test('a failed save keeps the pop-up, freezes the ratings, and Retry sends the same submission', async (t) => {
  t.after(unmount); fresh(); failSaves = 1; await mount();
  await press(document, 'End workout early');
  await press(sheet(), 'Effort 7 of 10');
  await press(sheet(), 'Enjoyment 4 of 5');
  await press(sheet(), 'Save & finish ✓');
  assert.equal(saved.length, 1);
  const dlg = sheet();
  assert.ok(dlg, 'the pop-up stays');
  assert.match(dlg.querySelector('[role="alert"]').textContent, /Offline/);
  assert.match(dlg.textContent, /Retry sends the same workout once/);
  // The submission is frozen: the ratings, the duration and the share toggle can no longer change.
  assert.equal(dlg.querySelector('fieldset').disabled, true);
  assert.ok(dlg.querySelector('[data-finish-rating="enjoy"] button').matches(':disabled'));
  assert.ok(buttonIn(dlg, 'Pause & exit'), 'Edit is Pause & exit while a save is pending');
  assert.ok(!buttonIn(dlg, '← Edit workout'), 'no Edit while pending');
  await press(dlg, 'Retry save');
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[1], saved[0], 'the very same submission');
  assert.equal(saved[1].summary.enjoyment, 4);
  assert.equal(saved[1].sessionRpe, 7);
});

test('every control on the pop-up is a 44px target', async (t) => {
  t.after(unmount); fresh(); await mount();
  await press(document, 'End workout early');
  const controls = [...sheet().querySelectorAll('button, input')];
  // Edit, ten effort slots, five enjoyment slots, the duration field, the share toggle, Save.
  assert.equal(controls.length, 19);
  for (const c of controls) {
    const h = parseFloat(c.style.minHeight || c.style.height || '0');
    assert.ok(h >= 44, `${c.getAttribute('aria-label') || c.textContent.trim()} is ${h}px tall`);
  }
});

test('the duration question keeps its rules: typed minutes are the answer', async (t) => {
  t.after(unmount); fresh(); await mount();
  await press(document, 'End workout early');
  const field = sheet().querySelector('input[aria-label="Session length in minutes"]');
  assert.ok(field, 'asked: this timer never ran');
  assert.match(sheet().textContent, /The timer didn’t run for this one\./);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(field, '42');
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await press(sheet(), 'Save & finish ✓');
  assert.equal(saved[0].durationSeconds, 42 * 60);
  assert.equal(saved[0].durationAnswer, 'confirmed');
});

test('a draft keeps enjoyment; an older draft that carries reviewFeel restores harmlessly', async (t) => {
  t.after(unmount); fresh(); await mount();
  await press(document, 'End workout early');
  await press(sheet(), 'Enjoyment 3 of 5');
  const kept = draft();
  assert.equal(kept.completing, true);
  await unmount();
  // Resumed: the pop-up opens again with the answer kept.
  await mount({ draft: kept });
  assert.ok(sheet(), 'a finishing draft reopens on the pop-up');
  assert.deepEqual(pressedOf('Enjoyment'), ['Enjoyment 3 of 5']);
  await unmount();
  // A draft from before the pop-up: the three-way vibe, no enjoyment. It restores, the old answer
  // is not mapped onto the 1-5 scale, and it is not written again.
  const old = { ...kept, reviewFeel: 'loved' };
  delete old.enjoyment;
  await mount({ draft: old });
  assert.ok(sheet());
  assert.deepEqual(pressedOf('Enjoyment'), []);
  await press(sheet(), 'Save & finish ✓');
  assert.strictEqual(saved[0].summary.enjoyment, null);
  assert.equal('reviewFeel' in saved[0].summary, false);
  await unmount();
  // Anything but a whole 1-5 is no answer.
  for (const bad of [0, 6, 2.5, '4', -1]) {
    await mount({ draft: { ...kept, enjoyment: bad } });
    assert.deepEqual(pressedOf('Enjoyment'), [], `draft enjoyment ${JSON.stringify(bad)}`);
    await unmount();
  }
});

test('dark paper: the pick glows; light paper: no glow', async (t) => {
  t.after(unmount);
  for (const [theme, glows] of [[DARK, true], [LIGHT, false]]) {
    fresh(); globalThis.useBS = () => theme; await mount();
    await press(document, 'End workout early');
    await press(sheet(), 'Effort 7 of 10');
    const pick = sheet().querySelector('[data-finish-rating="effort"] [data-finish-slot="7"]');
    assert.equal(!!pick.style.textShadow, glows, `${theme.isLight ? 'light' : 'dark'} paper`);
    assert.equal(pick.style.color, rgb(theme.isLight ? '#a8680d' : '#e8a33c'), 'amber, in the paper\'s shade');
    await unmount();
  }
});
