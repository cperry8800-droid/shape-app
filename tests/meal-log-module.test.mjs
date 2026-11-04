// The Log meal sheet and its filed stamp redesigned as the owner's B (owner, 2026-11-04: "new designs
// for this", then of three looks "B for logging meals and Filed"), and carved out of the client module
// into BSMealLog.jsx (the WORKLOG rule: a PR that touches a self-contained screen moves it).
//
// What it pins:
//   · THE SEAM. The module exports the two screens alone, never imports back into the client, reads no
//     window global while it evaluates, and the client declares none of what moved; the old band, its
//     ledger heads and the option switch are gone.
//   · THE SHEET, mounted: a raised hero with the meal and the one tap; "Correct the record" and the note
//     to the coach as two folded cards; a bar at the foot that always holds the live tally (and keeps
//     the tab bar covered). The bar's own log button shows only once the pill is out of view or the meal
//     is adjusted: the old sheet's second "Log as planned →", always on beside the pill, is gone by design.
//   · THE HANDLERS: the one tap logs the meal's macros and hands its write to onLogged; a fold opens;
//     an adjusted portion reprices the bar's button and logs the adjusted figures; reset, toggle, Edit and
//     Add do what they did; photo and voice open their panels; a free log opens on the record.
//   · FILED, both ways: the sheet's own (← Back, the Shape Score award, Done) and the one-tap's (← Undo,
//     the day so far signed out, the honest "Cooked" with no macros).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { stripComments } from './helpers/strip-comments.mjs';
import { drive, textOf, SHIM, ROOT, loadCarved } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const NEW = path.join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSMealLog.jsx');
const CLIENT = path.join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');
const view = stripComments(fs.readFileSync(NEW, 'utf8'));
const client = stripComments(fs.readFileSync(CLIENT, 'utf8'));
const MOVED = ['BSLogMealFlow', 'BSMealLogged', 'BSBarcodeScan', 'bsIngId', 'bsLoadFoodRecents', 'bsPushFoodRecent', 'bsBarcodeScanSupported'];

// The app's translator with no catalog: each string its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };

const M = await loadCarved('BSMealLog.jsx');
const MEAL = { id: 'm1', title: 'Chicken caesar', kcal: 560, p: 42, c: 54, f: 20, tag: 'Meal' };
const by = (d, id) => d.nodes().find((n) => n.props && n.props['data-meal-log'] === id) || null;
const press = (d, id) => {
  const n = by(d, id);
  assert.ok(n, `no ${id} on the screen`);
  n.props.onClick({ preventDefault() {}, stopPropagation() {} });
  return d.render();
};
const foldButton = (d, id) => d.nodes().find((n) => n.type === 'button' && n.props['aria-expanded'] !== undefined && textOf(by(d, id)).startsWith(textOf(n)));
const openFold = (d, id) => { foldButton(d, id).props.onClick(); return d.render(); };
const byAria = (d, label) => d.nodes().find((n) => n.type === 'button' && n.props['aria-label'] === label);
// Each test's own meal-log recorder (the global the flow writes through).
function recordWrites() {
  const writes = [];
  globalThis.ShapeMealLog = { log: (m) => { writes.push(m); return Promise.resolve({ awardPromise: Promise.resolve({ awarded: true, points: 10 }) }); } };
  return writes;
}

test('the module exports the two screens alone, and the client declares none of what moved', () => {
  assert.deepEqual([...view.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]), ['BSLogMealFlow', 'BSMealLogged']);
  for (const n of MOVED) {
    assert.match(view, new RegExp(`^(?:export )?(?:async )?(?:function ${n}\\(|const ${n} = )`, 'm'), `${n} is not in the module`);
    assert.doesNotMatch(client, new RegExp(`^(?:async )?(?:function ${n}\\(|const ${n} = )`, 'm'), `${n} is still declared in the client`);
  }
  assert.match(client, /^import \{ BSLogMealFlow, BSMealLogged \} from '\.\/BSMealLog\.jsx';$/m);
  assert.doesNotMatch(view, /from '\.\/iosAppBroadsheetClient\.jsx'/, 'a feature module never imports back into the client');
  // B is the only design: the old band and its ledger heads are gone, and no switch picks a look.
  assert.doesNotMatch(view, /LedgerHead|#0b0f0f|__mealLogLook/);
  for (const f of fs.readdirSync(path.dirname(NEW)).filter((x) => /\.(jsx|js|mjs)$/.test(x))) {
    assert.doesNotMatch(fs.readFileSync(path.join(path.dirname(NEW), f), 'utf8'), /__mealLogLook/, `${f} still reads the options switch`);
  }
});

test('evaluating the module by itself reads no window global (React #130 otherwise)', async () => {
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  let mod;
  try {
    mod = await loadRealModule(NEW, { registry: new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]) });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.deepEqual(Object.keys(mod).sort(), ['BSLogMealFlow', 'BSMealLogged']);
  assert.deepEqual(reads, [], `the module read window.${reads.join(', window.')} while it was being evaluated`);
});

test('a meal as planned: the hero carries the one tap, the corrections and the note are folded, the bar holds the tally', () => {
  recordWrites();
  const d = drive(M.BSLogMealFlow, { meal: MEAL, onClose() {}, onLogged() {} });
  const hero = textOf(by(d, 'hero'));
  assert.match(hero, /Meal · Planned/);
  assert.match(hero, /Chicken caesar/);
  assert.match(textOf(by(d, 'one-tap')), /^One tapAte it as planned✓$/);
  assert.doesNotMatch(hero, /560 planned/, 'on a meal as planned the planned line only repeats the bar');
  assert.equal(by(d, 'reset'), null);
  assert.equal(foldButton(d, 'record').props['aria-expanded'], false);
  assert.match(textOf(by(d, 'record')), /^Correct the recordPortion 1\.00× · Chicken caesar/);
  assert.equal(foldButton(d, 'dispatch').props['aria-expanded'], false);
  assert.match(textOf(by(d, 'dispatch')), /^Dispatch to Dr\. MayaOptional/);
  assert.equal(byAria(d, 'Portion ＋'), undefined, 'the record is folded');
  // The bar is always drawn (the tab bar stays covered), with the live tally and no second log button.
  const bar = textOf(by(d, 'bar'));
  assert.match(bar, /^560KCAL42P · 54C · 20F/);
  assert.match(bar, /DAY 2128 \/ 2100/);
  assert.equal(by(d, 'bar-log'), null, 'the pill is in view: the bar does not repeat it');
  assert.doesNotMatch(d.text, /Log as planned/);
});

test('the one tap logs the meal, hands its write on, and files it with the award, Done and Back', async () => {
  const writes = recordWrites();
  const closed = [];
  const handed = [];
  const d = drive(M.BSLogMealFlow, { meal: MEAL, onClose: () => closed.push(1), onLogged: (w) => handed.push(w) });
  press(d, 'one-tap');
  assert.deepEqual(writes, [{ kcal: 560, protein: 42, carbs: 54, fat: 20 }]);
  assert.equal(handed.length, 1);
  assert.equal(typeof handed[0].then, 'function', 'the write rides to onLogged');
  assert.match(d.text, /Meal · Filed /);
  assert.match(textOf(by(d, 'stamp')), /^560Kcal · 42P · Logged ✓/);
  assert.match(textOf(by(d, 'day-kcal')), /^2128\/ 2100 KCAL$/);
  assert.match(textOf(by(d, 'day-p')), /^160\/ 165 P$/);
  assert.match(d.text, /Day so far/);
  await new Promise((r) => setTimeout(r, 0));
  d.render();
  assert.equal(textOf(by(d, 'award')), '+10 · Nutrition · Shape Score');
  press(d, 'done');
  assert.equal(closed.length, 1, 'Done closes');
  d.back();
  assert.equal(closed.length, 2, 'the back row is the sheet\'s Back');
});

test('the record unfolds; an adjusted portion reprices the bar\'s button and logs the adjusted meal; reset undoes it', () => {
  const writes = recordWrites();
  const d = drive(M.BSLogMealFlow, { meal: MEAL, onClose() {}, onLogged() {} });
  openFold(d, 'record');
  assert.equal(foldButton(d, 'record').props['aria-expanded'], true);
  const rec = textOf(by(d, 'record'));
  for (const s of ['Portion', '1.00×', 'Ingredients · tap to toggle', 'Chicken caesar', '1 serving · 560 kcal · 42P', 'Edit', '＋ Add — search foods or enter manually']) assert.ok(rec.includes(s), `the record shows ${s}`);
  byAria(d, 'Portion ＋').props.onClick();
  d.render();
  assert.equal(by(d, 'one-tap'), null, 'an adjusted meal is not "as planned"');
  assert.match(textOf(by(d, 'reset')), /Adjusted — reset to plan/);
  assert.match(textOf(by(d, 'hero')), /560 planned · 42P · 54C · 20F/);
  assert.match(textOf(by(d, 'record')), /1 serving · 700 kcal · 53P/);
  assert.match(textOf(by(d, 'bar')), /^700KCAL/);
  assert.equal(textOf(by(d, 'bar-log')), 'Log · 700 kcal · 1.25× →');
  press(d, 'reset');
  assert.ok(by(d, 'one-tap'), 'reset brings the one tap back');
  assert.equal(by(d, 'bar-log'), null);
  byAria(d, 'Portion ＋').props.onClick();
  d.render();
  press(d, 'bar-log');
  assert.deepEqual(writes, [{ kcal: 700, protein: 53, carbs: 68, fat: 25 }]);
  assert.match(textOf(by(d, 'stamp')), /^700Kcal · 53P · Logged ✓/);
});

test('an ingredient toggles, Edit opens its editor, Add opens the add sheet', () => {
  recordWrites();
  const d = drive(M.BSLogMealFlow, { meal: MEAL, onClose() {}, onLogged() {} });
  openFold(d, 'record');
  d.nodes().find((n) => n.type === 'button' && n.props['aria-label'] === 'Exclude Chicken caesar').props.onClick();
  d.render();
  assert.equal(textOf(by(d, 'bar-log')), 'Log · 0 kcal →', 'nothing left on the plate');
  assert.ok(d.nodes().some((n) => n.props && n.props['aria-label'] === 'Include Chicken caesar'));
  d.click('Edit');
  assert.ok(d.nodes().some((n) => n.type === 'input' && n.props.placeholder === 'Ingredient'), 'the editor opens');
  const d2 = drive(M.BSLogMealFlow, { meal: MEAL, onClose() {}, onLogged() {} });
  openFold(d2, 'record');
  d2.click('＋ Add');
  assert.ok(d2.nodes().some((n) => n.type === 'input' && n.props.placeholder === 'Search foods, brands, barcodes…'), 'the add sheet opens');
});

test('the note to the coach unfolds, its photo and voice open their panels, and a note reads on the folded card', () => {
  recordWrites();
  const d = drive(M.BSLogMealFlow, { meal: MEAL, onClose() {}, onLogged() {} });
  openFold(d, 'dispatch');
  const area = d.nodes().find((n) => n.type === 'textarea');
  assert.equal(area.props.placeholder, 'Felt a bit hungry still · swapped rice for sweet potato…');
  d.click('⊡ Photo');
  assert.match(textOf(by(d, 'dispatch')), /Snap or upload/);
  d.click('● Voice');
  assert.doesNotMatch(textOf(by(d, 'dispatch')), /Snap or upload/, 'one panel at a time');
  assert.match(textOf(by(d, 'dispatch')), /Tap to speak/);
  d.nodes().find((n) => n.type === 'textarea').props.onChange({ target: { value: 'Still hungry' } });
  d.render();
  openFold(d, 'dispatch');
  assert.match(textOf(by(d, 'dispatch')), /^Dispatch to Dr\. Maya“Still hungry”/);
});

test('a free log (nothing planned) opens on the record, with no one tap and the honest log button', () => {
  recordWrites();
  const d = drive(M.BSLogMealFlow, { meal: null, signedIn: true, onClose() {}, onLogged() {} });
  assert.equal(by(d, 'one-tap'), null);
  assert.equal(by(d, 'reset'), null);
  assert.match(textOf(by(d, 'hero')), /^Log a mealMealAdd what you ate to log it$/);
  assert.equal(foldButton(d, 'record').props['aria-expanded'], true, 'its food is added there');
  assert.match(textOf(by(d, 'record')), /＋ Add — search foods or enter manually/);
  assert.equal(by(d, 'dispatch'), null, 'signed in with no linked coach, no note');
  const log = by(d, 'bar-log');
  assert.equal(textOf(log), 'Log · 0 kcal →');
  assert.equal(log.props.disabled, true, 'nothing to log yet');
});

test('the bar\'s log button shows once the one tap scrolls out of view, and goes when it is back', async () => {
  // Effects run here (the shared shim keeps them no-ops), with an observer the test drives.
  const observers = [];
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; observers.push(this); } observe(el) { this.el = el; } disconnect() { this.off = true; } };
  const RUN = { ...SHIM, useEffect(fn) { fn(); }, useLayoutEffect(fn) { fn(); } };
  const L = await loadCarved('BSMealLog.jsx', RUN);
  recordWrites();
  const d = drive(L.BSLogMealFlow, { meal: MEAL, onClose() {}, onLogged() {} });
  by(d, 'one-tap').props.ref.current = {};
  d.render();
  const io = observers.find((o) => o.el && !o.off);
  assert.ok(io, 'the one tap is observed');
  io.cb([{ isIntersecting: false }]);
  d.render();
  assert.equal(textOf(by(d, 'bar-log')), 'Log as planned →', 'the pill is out of view: the bar carries the log');
  io.cb([{ isIntersecting: true }]);
  d.render();
  assert.equal(by(d, 'bar-log'), null, 'the pill is back');
  delete globalThis.IntersectionObserver;
});

test('filed from a meal\'s own page: ← Undo, the day so far signed out, Done', () => {
  const undone = [];
  const done = [];
  const d = drive(M.BSMealLogged, { kcal: 180, p: 26, time: '4:00 PM', logged: true, onDone: () => done.push(1), onUndo: () => undone.push(1) });
  assert.match(d.text, /Meal · Filed 4:00 PM/);
  assert.match(textOf(by(d, 'stamp')), /^180Kcal · 26P · Logged ✓/);
  assert.match(textOf(by(d, 'day-kcal')), /^1748\/ 2100 KCAL$/);
  assert.match(textOf(by(d, 'day-p')), /^144\/ 165 P$/);
  // Undo retracts the log, so it is its own button, never the shared row a swipe would fire.
  assert.throws(() => d.back(), /no back row/);
  assert.match(textOf(by(d, 'undo')), /←Undo/);
  press(d, 'undo');
  press(d, 'done');
  assert.deepEqual([undone.length, done.length], [1, 1]);
  // Signed in, the demo day is not shown (honest absence over invented numbers).
  globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  try {
    const signed = drive(M.BSMealLogged, { kcal: 180, p: 26, time: '4:00 PM', logged: true });
    assert.equal(by(signed, 'day-kcal'), null);
    assert.doesNotMatch(signed.text, /Day so far/);
  } finally { delete globalThis.ShapeAuth; }
  // A cook with no macros: a dash, Cooked, and no "Logged ✓".
  const cooked = drive(M.BSMealLogged, { kcal: null, p: null, time: '' });
  assert.match(textOf(by(cooked, 'stamp')), /^—Kcal · —P · No macros on this one/);
  assert.match(cooked.text, /Meal · Cooked/);
  assert.doesNotMatch(cooked.text, /Logged ✓/);
});
