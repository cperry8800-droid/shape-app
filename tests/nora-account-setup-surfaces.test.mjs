// "Set up with Nora" on the surfaces (src/lib/ai/accountSetup.mjs is the server half,
// tests/nora-account-setup.test.mjs drives it): the first-run goal step's door in the app, the
// confirm card in the app and on the website (a setting Nora could not set is said as such, a
// confirmed setup says where to change it and makes the app read what it changed), and the
// Welcome step of the tours (the website's client and coach tours, the app's coach tour), which
// end and open Nora with the ask in her composer. The app components are the shipping code, driven
// through the broadsheet mount harness; the tour engine runs in jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadBroadsheet, drive, SHIM, THEME, flatten, textOf } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { BS_ACCOUNT_SETUP_KINDS } from '../mobile-app/src/services/userGoalsRefresh.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const APP = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const tick = () => new Promise((r) => setImmediate(r));

const { BSIntentStep, BSNoraProposal } = await loadBroadsheet(['BSIntentStep', 'BSNoraProposal']);

const SETUP_CARD = {
  type: 'proposal', label: 'Review & confirm', action: 'set_up_account', token: 'tok-setup',
  summary: 'Set up your account: 2 changes',
  diff: [
    { label: 'Units', field: 'units', before: 'Imperial · lb / mi', after: 'Metric · kg / km' },
    { label: 'Goal', field: 'goal', before: null, after: 'Build muscle' },
    { label: 'email', field: 'email', refused: 'yours', after: 'Not set: Yours to do yourself' },
    { label: 'Headline', field: 'headline', refused: 'coach_only', after: 'Not set: For coaches only' },
  ],
};

// ── The goal step's door ─────────────────────────────────────────────────────────────────────
test('the goal step offers "Set up with Nora" beside the goals, and the tap is the shell\'s', () => {
  let asked = 0;
  const d = drive(BSIntentStep, { onDone: () => {}, onNora: () => { asked += 1; } });
  const door = d.nodes().find((n) => n.type === 'button' && n.props['data-nora-setup'] !== undefined);
  assert.ok(door, 'the door is drawn');
  assert.match(textOf(door), /Set up with Nora/);
  assert.match(textOf(door), /Tell her about you and she fills it all in\. You check it before anything is saved\./);
  assert.ok(flatten(door).some((n) => n.type === 'img' && /nora-avatar\.png$/.test(n.props.src)), 'her face, so they know who she is');
  d.click('Set up with Nora');
  assert.equal(asked, 1);
  // The goal chips and Skip are still there: Nora is the other way through, not the only one.
  assert.ok(d.buttons().some((b) => b.label === 'Build muscle'));
  assert.ok(d.buttons().some((b) => /^Skip for now/.test(b.label)));
  const without = drive(BSIntentStep, { onDone: () => {} });
  assert.ok(!without.nodes().some((n) => n.props && n.props['data-nora-setup'] !== undefined), 'no door when the shell gives no way to open her');
});

test('the shell: the door opens Nora with the ask in her composer, over the step; a setup re-reads the steps', () => {
  const shell = APP.slice(APP.indexOf('function BSClientAppInner('), APP.indexOf('const settingsOverlay = showSettings ? ('));
  assert.match(shell, /const setUpWithNora = \(\) => bsAskNora\(tr\('onboarding:intent\.noraDraft', \{ defaultValue: 'Set up my account with me\.' \}\)\);/);
  assert.match(shell, /<BSIntentStep onDone=\{\(\) => firstRunNext\(\{ \.\.\.firstRun\.onb, intentSeen: true \}\)\} onNora=\{setUpWithNora\} \/>\}\{noraSheet\}/);
  assert.match(shell, /window\.addEventListener\('shape:accountSetup', again\);/);
  assert.match(shell, /window\.removeEventListener\('shape:accountSetup', again\);/);
  // bsAskNora puts the words in her composer and opens her; it never sends them.
  const ask = APP.slice(APP.indexOf('function bsAskNora('), APP.indexOf('function BSAskNoraLink('));
  assert.match(ask, /_bsNoraDraft = String\(text \|\| ''\)\.slice\(0, 500\);/);
  assert.match(ask, /new CustomEvent\('shape:openNora'\)/);
});

// ── The app's card ───────────────────────────────────────────────────────────────────────────
function withGlobals(extra, fn) {
  const keys = Object.keys(extra);
  const prev = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  Object.assign(globalThis, extra);
  return Promise.resolve().then(fn).finally(() => { for (const k of keys) globalThis[k] = prev[k]; });
}

test('app card: each change before → after; a setting Nora could not set is struck through with why', () => {
  const d = drive(BSNoraProposal, { a: { ...SETUP_CARD, token: 'tok-read' }, t: THEME });
  const rows = d.nodes().filter((n) => n.type === 'div' && n.props.style && n.props.style.fontSize === 10).map((n) => textOf(n));
  assert.ok(rows.includes('UnitsImperial · lb / mi→Metric · kg / km'));
  assert.ok(rows.includes('Goal—→Build muscle'), 'a value they never had reads —');
  const refused = d.nodes().filter((n) => n.props && n.props['data-nora-refused']);
  assert.deepEqual(refused.map((n) => [n.props['data-nora-refused'], textOf(n)]), [
    ['yours', 'email·Not setYours to do yourself'],
    ['coach_only', 'Headline·Not setFor coaches only'],
  ]);
  assert.ok(!d.text.includes('Not set: '), 'the server\'s English fallback line is for builds from before this, not drawn here');
  assert.ok(!d.text.includes('Saved to your account'), 'nothing said before the confirm lands');
});

test('app card: a confirmed setup says where to change it, and the app reads again what it changed', async () => {
  const fired = [];
  const unitsSet = [];
  let reloads = 0;
  await withGlobals({
    // Codex on 940ecd8 (P2): the name's cached profile row is read again too (bsMyName reads it).
    ShapeAuth: { reloadProfile: async () => { reloads += 1; return { full_name: 'Samantha Lee' }; }, getCachedState: () => ({}) },
    ShapeSupport: { confirm: async (token) => { assert.equal(token, 'tok-setup'); return { ok: true, auditId: 'aud-9' }; }, undo: async (id) => { assert.equal(id, 'aud-9'); return { ok: true }; } },
    shapeDb: { getUserGoals: async (kind) => (kind === 'client_settings' ? { units: 'Metric · kg / km', dailyCheckin: 'Off' } : null) },
    ShapeUnits: { set: (v) => unitsSet.push(v) },
    dispatchEvent: (e) => { fired.push(e); return true; },
  }, async () => {
    const d = drive(BSNoraProposal, { a: SETUP_CARD, t: THEME });
    d.click('Confirm');
    await tick(); await tick();
    d.render();
    assert.ok(d.text.includes('Applied ✓'));
    assert.ok(d.text.includes('Saved to your account. You can change any of it in Settings.'));
    const setup = fired.filter((e) => e.type === 'shape:accountSetup');
    assert.equal(setup.length, 1);
    assert.deepEqual(setup[0].detail, { undone: false });
    assert.ok(fired.some((e) => e.type === 'shape:identity') && fired.some((e) => e.type === 'shape:notifyprefs'));
    assert.deepEqual(unitsSet, ['Metric · kg / km'], 'the units the account now holds');
    assert.equal(reloads, 1, 'the cached profile row is read again');
    // Codex on #2566 (P2): every mounted screen holding a copy of what the setup writes reads it again.
    const announced = () => fired.filter((e) => e.type === 'shape:userGoals').map((e) => e.detail.kinds);
    assert.deepEqual(announced(), [[...BS_ACCOUNT_SETUP_KINDS]], 'the setup\'s documents are announced on Confirm');
    // ⚠ Drawn again (her sheet closed and reopened, or the first run moving on under it): still applied,
    // with its Undo, never Confirm again.
    const again = drive(BSNoraProposal, { a: SETUP_CARD, t: THEME });
    assert.ok(again.text.includes('Applied ✓'));
    assert.ok(!again.buttons().some((b) => b.label === 'Confirm'));
    assert.ok(again.buttons().some((b) => b.label === 'Undo'));
    d.click('Undo');
    await tick(); await tick();
    d.render();
    assert.ok(d.text.includes('Undone'));
    assert.deepEqual(fired.filter((e) => e.type === 'shape:accountSetup').map((e) => e.detail), [{ undone: false }, { undone: true }]);
    assert.deepEqual(announced(), [[...BS_ACCOUNT_SETUP_KINDS], [...BS_ACCOUNT_SETUP_KINDS]], 'and again on Undo');
    assert.equal(reloads, 2, 'and the profile row again on Undo');
    const third = drive(BSNoraProposal, { a: SETUP_CARD, t: THEME });
    assert.ok(third.text.includes('Undone') && !third.buttons().some((b) => b.label === 'Confirm' || b.label === 'Undo'), 'an undone card stays undone');
  });
});

test('app card: any other card is unchanged by this — no "saved" line, no setup event', async () => {
  const fired = [];
  await withGlobals({
    ShapeSupport: { confirm: async () => ({ ok: true, auditId: 'aud-1' }) },
    dispatchEvent: (e) => { fired.push(e); return true; },
  }, async () => {
    const d = drive(BSNoraProposal, { a: { ...SETUP_CARD, token: 'tok-water', action: 'log_water', diff: [{ label: 'Hydration', before: '1 L', after: '1.5 L' }] }, t: THEME });
    d.click('Confirm');
    await tick();
    d.render();
    assert.ok(!d.text.includes('Saved to your account'));
    assert.equal(fired.filter((e) => e.type === 'shape:accountSetup').length, 0);
    assert.equal(fired.filter((e) => e.type === 'shape:userGoals').length, 0, 'nor any document announced');
  });
});

// ── The website's card ───────────────────────────────────────────────────────────────────────
// An in-memory localStorage, as a browser's: the website's thread and its cards' outcomes live there.
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m }; }
function webCard(fetchImpl, win = undefined, storage = undefined, react = SHIM) {
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const src = read('public/newdesign/chatWidget.jsx');
  const start = src.indexOf('const cwIsLine =');
  const end = src.indexOf('function ChatWidget(props)');
  const { code } = babel.transformSync(src.slice(start, end) + '\nthis.CwProposalCard = CwProposalCard;', { presets: [presetReact], babelrc: false, configFile: false });
  const ctx = { React: react, TEAL: 'teal', TEAL_BRIGHT: 'teal', PAPER: 'paper', sans: 'sans', cwHexA: () => 'rgba(0,0,0,0.1)', fetch: fetchImpl, ...(win ? { window: win, CustomEvent } : {}), ...(storage ? { localStorage: storage } : {}) };
  vm.runInNewContext(code, ctx);
  return ctx.CwProposalCard;
}

test('website card: refusals said as such; a confirmed setup says where to change it', async () => {
  const posted = [];
  const told = [];
  const store = memStorage();
  const Card = webCard(async (url, init) => { posted.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({ ok: true, auditId: 'aud-3' }) }; }, { dispatchEvent: (e) => { told.push([e.type, JSON.parse(JSON.stringify(e.detail))]); return true; } }, store);
  const d = drive(Card, { a: SETUP_CARD });
  const refused = d.nodes().filter((n) => n.props && n.props['data-nora-refused']).map((n) => textOf(n));
  assert.deepEqual(refused, ['email·Not setYours to do yourself', 'Headline·Not setFor coaches only']);
  const rows = d.nodes().filter((n) => n.type === 'div' && n.props.style && n.props.style.fontSize === 10.5).map((n) => textOf(n));
  assert.ok(rows.includes('UnitsImperial · lb / mi→Metric · kg / km'));
  d.click('Confirm');
  await tick(); await tick();
  d.render();
  assert.deepEqual(posted, [['/api/ai/proposals/confirm', { token: 'tok-setup' }]]);
  assert.ok(d.text.includes('Saved to your account. You can change any of it in Settings.'));
  // Codex on a569e48 (P2): the page under the widget is told, and reads again what it shows.
  assert.deepEqual(told, [['shape:accountSetup', { undone: false }]]);
  // Codex on 08677b3 (P2): the thread outlives the card (closing the widget, another page), and so
  // does its outcome: drawn again it is applied, with its Undo, never Confirm again.
  const again = drive(Card, { a: SETUP_CARD });
  assert.ok(again.text.includes('Applied ✓') && again.text.includes('Saved to your account'));
  assert.ok(!again.buttons().some((b) => b.label === 'Confirm'));
  assert.ok(again.buttons().some((b) => b.label === 'Undo'), 'with its Undo');
  const kept = JSON.parse(store._m.get('shape.nora.cardDone.v1'));
  assert.deepEqual(Object.keys(kept), ['tok-setup'], 'kept by the token (its signature, when it has one)');
  assert.deepEqual([kept['tok-setup'].status, kept['tok-setup'].auditId], ['done', 'aud-3']);
  d.click('Undo');
  await tick(); await tick();
  d.render();
  assert.deepEqual(told, [['shape:accountSetup', { undone: false }], ['shape:accountSetup', { undone: true }]], 'and again on Undo');
  const third = drive(Card, { a: SETUP_CARD });
  assert.ok(third.text.includes('Undone') && !third.buttons().some((b) => b.label === 'Confirm' || b.label === 'Undo'), 'an undone card stays undone');
  const fresh = drive(Card, { a: { ...SETUP_CARD, token: 'tok-other' } });
  assert.ok(fresh.buttons().some((b) => b.label === 'Confirm'), 'another proposal is its own');
  const other = drive(Card, { a: { ...SETUP_CARD, token: 'tok-water', action: 'log_water', diff: [{ label: 'Hydration', before: '1 L', after: '1.5 L' }] } });
  other.click('Confirm');
  await tick(); await tick();
  other.render();
  assert.ok(other.text.includes('Applied ✓') && !other.text.includes('Saved to your account'), 'only a setup card says it');
  assert.equal(told.length, 2, 'nor is the page told of any other card');
});

// Codex on 3037b0a (P2): the same card open in two tabs. Confirming it in one writes the outcome to
// localStorage, and the storage event fires in the other; the card there reads it and offers Undo,
// never Confirm again. The harness's React runs no effects, so this one runs each as it mounts.
test('website card: a card open in another tab follows its Confirm and Undo there', async () => {
  const store = memStorage();
  const listeners = [];
  const told = [];
  const win = {
    dispatchEvent: (e) => { told.push([e.type, JSON.parse(JSON.stringify(e.detail))]); return true; },
    addEventListener: (type, fn) => { listeners.push([type, fn]); },
    removeEventListener: (type, fn) => { const i = listeners.findIndex(([t, f]) => t === type && f === fn); if (i >= 0) listeners.splice(i, 1); },
  };
  const ran = new Set();
  const React = { ...SHIM, useEffect: (fn, deps) => { const key = JSON.stringify(deps); if (!ran.has(key)) { ran.add(key); fn(); } } };
  const Card = webCard(async () => ({ ok: true, json: async () => ({ ok: true }) }), win, store, React);
  const other = drive(Card, { a: { ...SETUP_CARD, token: 'tok-tabs' } });
  assert.ok(other.buttons().some((b) => b.label === 'Confirm'));
  assert.deepEqual(listeners.map(([t]) => t), ['storage'], 'the card listens for the other tabs');
  // The first tab confirms: its outcome lands in storage, and this tab hears it.
  store.setItem('shape.nora.cardDone.v1', JSON.stringify({ 'tok-tabs': { status: 'done', auditId: 'aud-7', at: 1 } }));
  listeners.forEach(([t, fn]) => fn({ key: 'shape.nora.cardDone.v1' }));
  other.render();
  assert.ok(other.text.includes('Applied ✓'), 'applied here too');
  assert.ok(!other.buttons().some((b) => b.label === 'Confirm'), 'never Confirm again');
  assert.ok(other.buttons().some((b) => b.label === 'Undo'), 'with its Undo');
  // Codex on 6a19188 (P2): and this tab's page reads again what the setup changed, once.
  assert.deepEqual(told, [['shape:accountSetup', { undone: false }]]);
  listeners.forEach(([t, fn]) => fn({ key: 'shape.nora.cardDone.v1' }));
  assert.equal(told.length, 1, 'the same outcome heard again tells the page nothing new');
  // Another key changing is not this card's news.
  listeners.forEach(([t, fn]) => fn({ key: 'shape.something.else.v1' }));
  other.render();
  assert.ok(other.text.includes('Applied ✓'));
  // Undone in the first tab: undone here.
  store.setItem('shape.nora.cardDone.v1', JSON.stringify({ 'tok-tabs': { status: 'undone', auditId: 'aud-7', at: 2 } }));
  listeners.forEach(([t, fn]) => fn({ key: 'shape.nora.cardDone.v1' }));
  other.render();
  assert.ok(other.text.includes('Undone') && !other.buttons().some((b) => b.label === 'Undo' || b.label === 'Confirm'));
  assert.deepEqual(told, [['shape:accountSetup', { undone: false }], ['shape:accountSetup', { undone: true }]], 'and of the Undo');
  // Any other card heard from another tab tells the page nothing.
  const water = drive(Card, { a: { ...SETUP_CARD, token: 'tok-tabw', action: 'log_water' } });
  store.setItem('shape.nora.cardDone.v1', JSON.stringify({ 'tok-tabw': { status: 'done', auditId: 'aud-8', at: 3 } }));
  listeners.forEach(([t, fn]) => fn({ key: 'shape.nora.cardDone.v1' }));
  water.render();
  assert.ok(water.text.includes('Applied ✓'));
  assert.equal(told.length, 2, 'no setup announced for another card');
});

// Codex on 88348f0 (P2): Confirm pressed on the same card in two tabs at once. One wins; the other's
// answer is "already applied". The card draws its outcome from the kept store alone, so the loser
// shows Applied with the winner's Undo, whether the winner's outcome landed before its answer or after.
test('website card: a Confirm that loses to another tab shows the winner\'s outcome, with its Undo', async () => {
  const fail = { ok: false, json: async () => ({ ok: false, error: 'already_confirmed', message: 'That change was already applied.' }) };
  // The winner's outcome is kept before this tab's answer arrives.
  {
    const store = memStorage();
    const told = [];
    const win = { dispatchEvent: (e) => { told.push([e.type, JSON.parse(JSON.stringify(e.detail))]); return true; }, addEventListener() {}, removeEventListener() {} };
    const Card = webCard(async () => { store.setItem('shape.nora.cardDone.v1', JSON.stringify({ 'tok-race': { status: 'done', auditId: 'aud-win', at: 1 } })); return fail; }, win, store);
    const d = drive(Card, { a: { ...SETUP_CARD, token: 'tok-race' } });
    d.click('Confirm');
    await tick(); await tick();
    d.render();
    assert.ok(d.text.includes('Applied ✓') && !d.text.includes('already applied'), 'applied, and no error');
    assert.ok(d.buttons().some((b) => b.label === 'Undo'), 'with the winner\'s Undo');
    assert.ok(!d.buttons().some((b) => /^(Confirm|Try again)/.test(b.label)));
    assert.deepEqual(told, [['shape:accountSetup', { undone: false }]], 'and this tab\'s page is told');
  }
  // The winner's outcome lands after: the error stands until it does, then the card follows it.
  {
    const store = memStorage();
    const listeners = [];
    const told = [];
    const win = { dispatchEvent: (e) => { told.push([e.type, JSON.parse(JSON.stringify(e.detail))]); return true; }, addEventListener: (t, fn) => listeners.push([t, fn]), removeEventListener() {} };
    const ran = new Set();
    const React = { ...SHIM, useEffect: (fn, deps) => { const key = JSON.stringify(deps); if (!ran.has(key)) { ran.add(key); fn(); } } };
    const Card = webCard(async () => fail, win, store, React);
    const d = drive(Card, { a: { ...SETUP_CARD, token: 'tok-race' } });
    d.click('Confirm');
    await tick(); await tick();
    d.render();
    assert.ok(d.text.includes('That change was already applied.'), 'the answer, until the outcome lands');
    store.setItem('shape.nora.cardDone.v1', JSON.stringify({ 'tok-race': { status: 'done', auditId: 'aud-win', at: 1 } }));
    listeners.forEach(([t, fn]) => fn({ key: 'shape.nora.cardDone.v1' }));
    d.render();
    assert.ok(d.text.includes('Applied ✓') && d.buttons().some((b) => b.label === 'Undo'), 'then the winner\'s outcome, Undo and all');
    assert.deepEqual(told, [['shape:accountSetup', { undone: false }]]);
  }
  // A browser that refuses storage still keeps the outcome for the page's life.
  {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const Card = webCard(async () => ({ ok: true, json: async () => ({ ok: true, auditId: 'aud-mem' }) }), { dispatchEvent: () => true }, broken);
    const d = drive(Card, { a: { ...SETUP_CARD, token: 'tok-mem' } });
    d.click('Confirm');
    await tick(); await tick();
    d.render();
    assert.ok(d.text.includes('Applied ✓'));
    const again = drive(Card, { a: { ...SETUP_CARD, token: 'tok-mem' } });
    assert.ok(again.text.includes('Applied ✓') && again.buttons().some((b) => b.label === 'Undo'), 'drawn again, from memory');
  }
});

// ── The tours ────────────────────────────────────────────────────────────────────────────────
async function inDom(fn) {
  const { JSDOM } = require_('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"><div id="anchor">x</div></div></body></html>', { pretendToBeVisual: true });
  const w = dom.window;
  const keys = ['window', 'document', 'getComputedStyle', 'matchMedia', 'requestAnimationFrame'];
  const prev = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  Object.assign(globalThis, {
    window: w, document: w.document, getComputedStyle: w.getComputedStyle.bind(w),
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }), requestAnimationFrame: (cb) => setTimeout(cb, 0),
  });
  try { return await fn(w); } finally { Object.assign(globalThis, prev); dom.window.close(); }
}

test('the tour engine: a step\'s other way on ends the tour (its seen flag first), then runs', async () => {
  const { startTour } = await loadRealModule(join(ROOT, 'public/newdesign/spotlightTour.js'));
  await inDom(async (w) => {
    const order = [];
    const root = w.document.getElementById('root');
    startTour([
      { anchor: () => w.document.getElementById('anchor'), eyebrow: 'Welcome', title: 'Welcome to Shape.', body: 'A quick tour.', altLabel: 'Set up with Nora', onAlt: () => order.push('alt') },
      { anchor: () => w.document.getElementById('anchor'), title: 'Today', body: 'Your day.' },
    ], { root, onDone: () => order.push('done') });
    for (let i = 0; i < 20 && !root.querySelector('[data-st="alt"]'); i += 1) await new Promise((r) => setTimeout(r, 5));
    const alt = root.querySelector('[data-st="alt"]');
    assert.ok(alt, 'the Welcome step draws it');
    assert.equal(alt.textContent, 'Set up with Nora');
    alt.onclick();
    assert.deepEqual(order, ['done', 'alt'], 'the tour is marked seen before Nora opens');
    assert.ok(!root.querySelector('[role="dialog"]'), 'the tour is gone');
  });
  await inDom(async (w) => {
    const root = w.document.getElementById('root');
    startTour([{ anchor: () => w.document.getElementById('anchor'), title: 'Today', body: 'Your day.' }], { root });
    for (let i = 0; i < 20 && !root.querySelector('[data-st="next"]'); i += 1) await new Promise((r) => setTimeout(r, 5));
    assert.ok(!root.querySelector('[data-st="alt"]'), 'a step without one draws none');
  });
});

test('the website tours\' Welcome steps open Nora with the ask; the app\'s coach tour does too', () => {
  const tour = read('public/newdesign/dashTour.js');
  assert.match(tour, /eyebrow: 'Welcome', title: 'Welcome to Shape\.', [^\n]*altLabel: 'Set up with Nora', onAlt: setUpWithNora\('Set up my account with me\.'\) \},/);
  assert.match(tour, /eyebrow: 'Welcome', title: 'Your coaching tools\.', [^\n]*altLabel: 'Set up with Nora', onAlt: setUpWithNora\('Set up my coach profile with me\.'\) \},/);
  // The opener, run: Nora's tab, the words in her composer (the widget never sends a draft).
  const fn = tour.slice(tour.indexOf('function setUpWithNora('), tour.indexOf('function clientSteps('));
  const opened = [];
  const ctx = { window: { __openChatTo: (req) => opened.push(req) } };
  vm.runInNewContext(`${fn}\nthis.go = setUpWithNora;`, ctx);
  ctx.go('Set up my account with me.')();
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), [{ who: 'Nora', tab: 'support', draft: 'Set up my account with me.' }]);
  vm.runInNewContext('this.go("x")();', { ...ctx, window: {} }, { filename: 'no-widget' });

  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  const coachTour = pros.slice(pros.indexOf('function BSProOnboardingTour('), pros.indexOf('function BSTrainerApp('));
  assert.match(coachTour, /altLabel: tr\('coach:tour\.noraSetup', \{ defaultValue: 'Set up with Nora' \}\), onAlt: \(\) => \{ try \{ if \(window\.bsAskNora\) window\.bsAskNora\(tr\('coach:tour\.noraSetupDraft', \{ defaultValue: 'Set up my coach profile with me\.' \}\)\); \} catch \(e\) \{\} \} \},/);
});
