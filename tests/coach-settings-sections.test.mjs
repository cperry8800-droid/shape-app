// The coach Settings page in sections (owner, 2026-11-10: "settings page needs to be organized much
// better", then "create tabs at the top that get to different sections in settings instead of
// scrolling all the way down"). Tabs across the top, one section showing at a time, every panel kept
// mounted; the flag thresholds and the notification switches under headings, with nothing dropped.
// The page is the shipped file, compiled and mounted in JSDOM over stubs of the dashboard globals it
// reads. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const DashSignals = require(join(ROOT, 'public/newdesign/dashSignals.js'));

const CODE = babel.transformSync(readFileSync(join(ROOT, 'public/newdesign/coachSettings.jsx'), 'utf8'), { presets: [presetReact], babelrc: false, configFile: false }).code;
const EXPORTS = 'return { CoachSettingsPage, cstGrouped, CST_FLAG_GROUPS, CST_NOTIFY_GROUPS, CST_COACH_TYPES, CST_SECTIONS };';

// The globals the page reads off the other dashboard scripts, as parameters of the compiled module.
const GLOBALS = ['React', 'window', 'document', 'fetch', 'DashSignals', 'nutriNavItems', 'trainerNavItems', 'nutriPayoutCard', 'trainerPayoutCard',
  'useCoachThresholds', 'useSignedIn', 'useCoachDoc', 'useDashPaper', 'DashDemoBand', 'DashPage', 'DashSegmented', 'DashPaperPicker',
  'DashExampleLink', 'useRememberedChoicesFor', 'useRememberedChoice', 'dashRouteParam', 'CoachAccountSettings', 'CoachGuidesCard',
  'dashInvalidateCoachSettings', 'DASH_THRESHOLDS_EVENT', 'dashReadCoachSettings'];

function load(win, over = {}) {
  const h = React.createElement;
  const nav = (active) => [{ slug: 'today', label: 'Today' }, { slug: 'week', label: 'Week' }, { slug: 'settings', label: 'Settings', active: active === 'settings' }];
  const env = {
    React, window: win, document: win.document,
    fetch: async () => ({ ok: false, status: 503, json: async () => ({ code: 'feed_not_set_up' }) }),
    DashSignals, nutriNavItems: nav, trainerNavItems: nav, nutriPayoutCard: null, trainerPayoutCard: null,
    useCoachThresholds: () => ({ refused: [] }),
    useSignedIn: () => null,
    useCoachDoc: () => ({ kind: 'signedout', doc: null, apply: async () => false }),
    useDashPaper: undefined,
    DashDemoBand: () => h('div', null, 'DEMO BAND'),
    DashPage: ({ children, title }) => h('main', null, h('h1', null, title), children),
    // The real control's grammar: a tablist of role="tab" buttons, aria-selected on the chosen one.
    DashSegmented: ({ label, items, value, onChange }) => h('div', { role: 'tablist', 'aria-label': label },
      items.map((it) => h('button', { key: it.key, type: 'button', role: 'tab', 'aria-selected': it.key === value, onClick: () => onChange(it.key) }, it.label))),
    DashPaperPicker: () => h('div', null, 'SKIN PICKER'),
    DashExampleLink: undefined,
    useRememberedChoicesFor: () => ({}),
    useRememberedChoice: (store, key, allowed, fallback) => React.useState(fallback),
    dashRouteParam: () => null,
    CoachAccountSettings: () => h('div', null, 'ACCOUNT CARDS'),
    CoachGuidesCard: () => h('div', { 'data-tour': 'dash-guides' }, 'GUIDES CARD'),
    dashInvalidateCoachSettings: () => {}, DASH_THRESHOLDS_EVENT: 'x', dashReadCoachSettings: async () => null,
    ...over,
  };
  return new Function(...GLOBALS, CODE + ';' + EXPORTS)(...GLOBALS.map((g) => env[g]));
}

async function mountPage(over = {}, role = 'trainer') {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#settings' });
  const keep = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { CoachSettingsPage } = load(dom.window, over);
  const root = createRoot(dom.window.document.getElementById('root'));
  const doc = dom.window.document;
  const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => root.render(React.createElement(CoachSettingsPage, { role })));
  await settle();
  const tabs = () => [...doc.querySelectorAll('[role="tab"]')];
  const panels = () => [...doc.querySelectorAll('[role="tabpanel"]')];
  const shown = () => panels().filter((p) => !p.hidden).map((p) => p.getAttribute('aria-label'));
  const panel = (label) => panels().find((p) => p.getAttribute('aria-label') === label);
  const click = async (label) => {
    const b = tabs().find((t) => t.textContent === label);
    assert.ok(b, 'no tab ' + label);
    await act(async () => b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    await settle();
  };
  const close = async () => {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.window = keep.window; globalThis.document = keep.document; globalThis.IS_REACT_ACT_ENVIRONMENT = keep.act;
  };
  const hash = async (to) => {
    dom.window.location.hash = to;
    await act(async () => { dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); });
    await settle();
  };
  return { doc, tabs, panels, shown, panel, click, hash, close };
}

const fake = new JSDOM('').window;
const { cstGrouped, CST_FLAG_GROUPS, CST_NOTIFY_GROUPS, CST_COACH_TYPES, CST_SECTIONS } = load(fake);

// ── the groups drop nothing ──────────────────────────────────────────────────
test('every flag threshold sits under exactly one heading, and every heading names a real one', () => {
  const named = CST_FLAG_GROUPS.flatMap((g) => g.keys);
  assert.equal(new Set(named).size, named.length, 'a threshold is under two headings');
  const tunable = DashSignals.TUNABLES.map((t) => t.key);
  assert.deepEqual([...named].sort(), [...tunable].sort(), 'the headings and the engine\'s thresholds differ');
  const out = cstGrouped(CST_FLAG_GROUPS, DashSignals.TUNABLES, (t) => t.key, { key: 'more', label: 'More' });
  assert.deepEqual(out.map((g) => g.key), CST_FLAG_GROUPS.map((g) => g.key), 'a heading is empty, or rows fell to More');
  assert.equal(out.reduce((n, g) => n + g.rows.length, 0), tunable.length);
});

test('every notification switch sits under exactly one heading, and every heading names a real one', () => {
  const named = CST_NOTIFY_GROUPS.flatMap((g) => g.keys);
  assert.equal(new Set(named).size, named.length, 'a switch is under two headings');
  assert.deepEqual([...named].sort(), CST_COACH_TYPES.map((r) => r[0]).sort(), 'the headings and the switch list differ');
});

test('a row no heading names still shows, under More; a name with no row is skipped', () => {
  const rows = [{ key: 'A' }, { key: 'B' }, { key: 'NEW' }];
  const out = cstGrouped([{ key: 'one', label: 'One', keys: ['B', 'GONE', 'A'] }, { key: 'two', label: 'Two', keys: ['GONE'] }], rows, (r) => r.key, { key: 'more', label: 'More' });
  assert.deepEqual(out.map((g) => [g.key, g.rows.map((r) => r.key)]), [['one', ['B', 'A']], ['more', ['NEW']]]);
});

// ── the tabs ─────────────────────────────────────────────────────────────────
test('tabs across the top: General first and showing, every other section mounted and hidden', async () => {
  const m = await mountPage();
  try {
    assert.deepEqual(m.tabs().map((t) => t.textContent), ['General', 'Client flags', 'Notifications', 'Calendar', 'Guides', 'Account']);
    assert.deepEqual(m.tabs().map((t) => t.getAttribute('aria-selected')), ['true', 'false', 'false', 'false', 'false', 'false']);
    assert.deepEqual(m.panels().map((p) => p.getAttribute('aria-label')), CST_SECTIONS.map((s) => s.label), 'a section is not mounted');
    assert.deepEqual(m.shown(), ['General']);
    const general = m.panel('General').textContent;
    assert.match(general, /Your dashboard opens on/);
    assert.match(general, /Appearance/);
    // The tabs come before the first section in the document.
    const list = m.doc.querySelector('[role="tablist"]');
    assert.ok(list.compareDocumentPosition(m.panel('General')) & 4, 'the tabs are not above the sections');
  } finally { await m.close(); }
});

test('a tab shows its section and hides the one before; the flags are all there, under four headings', async () => {
  const m = await mountPage();
  try {
    await m.click('Client flags');
    assert.deepEqual(m.shown(), ['Client flags']);
    assert.equal(m.tabs().find((t) => t.textContent === 'Client flags').getAttribute('aria-selected'), 'true');
    const flags = m.panel('Client flags');
    for (const g of CST_FLAG_GROUPS) assert.ok(flags.textContent.includes(g.label), g.label + ' heading missing');
    const fields = [...flags.querySelectorAll('input[type="number"]')].map((i) => i.getAttribute('aria-label'));
    assert.deepEqual(fields.sort(), DashSignals.TUNABLES.map((t) => t.label + ' (' + t.unit + ')').sort(), 'a threshold has no field');
    assert.match(flags.textContent, /Each number decides when a client is flagged to you/);
    await m.click('Calendar');
    assert.deepEqual(m.shown(), ['Calendar']);
    assert.match(m.panel('Calendar').textContent, /Calendar feed · read-only/);
    await m.click('Guides');
    assert.deepEqual(m.shown(), ['Guides']);
    assert.match(m.panel('Guides').textContent, /GUIDES CARD/);
    await m.click('Account');
    assert.deepEqual(m.shown(), ['Account']);
    assert.match(m.panel('Account').textContent, /ACCOUNT CARDS/);
    assert.doesNotMatch(m.panel('Account').textContent, /GUIDES CARD/);
    await m.click('Notifications');
    assert.deepEqual(m.shown(), ['Notifications']);
    assert.match(m.panel('Notifications').textContent, /Sign in to set which of your notifications reach you\./);
  } finally { await m.close(); }
});

test('the section is remembered per role, and a link can name one', async () => {
  const asked = [];
  const m = await mountPage({
    useRememberedChoice: (store, key, allowed, fallback) => { asked.push([key, allowed, fallback]); return React.useState(fallback); },
    dashRouteParam: (k) => (k === 'section' ? 'notifications' : null),
  }, 'nutritionist');
  try {
    assert.deepEqual(asked[0], ['settingsSection:nutritionist', CST_SECTIONS.map((s) => s.key), 'general']);
    assert.deepEqual(m.shown(), ['Notifications'], '#settings?section=notifications did not open Notifications');
  } finally { await m.close(); }
});

test('a link followed while Settings is open switches the tab (the tour\'s "See all guides")', async () => {
  let asked = null;
  const m = await mountPage({ dashRouteParam: (k) => (k === 'section' ? asked : null) });
  try {
    assert.deepEqual(m.shown(), ['General']);
    asked = 'guides';
    await m.hash('#settings?section=guides');
    assert.deepEqual(m.shown(), ['Guides'], 'the page ignored a ?section= that arrived while it was open');
    asked = 'nope';
    await m.hash('#settings?section=nope');
    assert.deepEqual(m.shown(), ['Guides'], 'an unknown section moved the page');
  } finally { await m.close(); }
});

test('the tour opens each Settings stop\'s tab, and "See all guides" opens Guides', () => {
  const tour = readFileSync(join(ROOT, 'public/newdesign/dashTour.js'), 'utf8');
  const guide = tour.slice(tour.indexOf("g.push({ key: 'settings'"), tour.indexOf("g.push({ key: 'chat'"));
  const steps = guide.split('\n').filter((l) => /^\s+\{ navigate: /.test(l));
  assert.ok(steps.length >= 5, 'the Settings guide lost its steps');
  for (const st of steps) assert.match(st, /navigate: setTab\('(General|Client flags|Notifications|Calendar|Guides)'\)/, 'a Settings stop does not open its tab: ' + st.slice(0, 90));
  assert.match(tour, /var setTab = function \(label\) \{ return openTab\('settings', 'Settings sections', label\); \};/);
  assert.match(tour, /window\.location\.hash = '#settings\?section=guides';/);
  const labels = CST_SECTIONS.map((s) => s.label);
  for (const m of guide.matchAll(/setTab\('([^']+)'\)/g)) assert.ok(labels.includes(m[1]), m[1] + ' is not a Settings tab');
});

test('the tab memory reads off the account the page already resolved: one sign-in check, not two (Codex, #2685)', async () => {
  let signedInCalls = 0;
  const stores = [];
  const m = await mountPage({
    useSignedIn: () => { signedInCalls += 1; return 'coach-1'; },
    useCoachDoc: () => ({ kind: 'ready', doc: {}, apply: async () => true }),
    useRememberedChoicesFor: (live, acct) => { stores.push([live, acct]); return {}; },
  });
  try {
    assert.ok(stores.length > 0, 'the page opened no preference store');
    assert.deepEqual(stores[stores.length - 1], [true, 'coach-1'], 'the store is not keyed on the page\'s own account');
    // The page and its notification card each run on one sign-in check a render; none more.
    const page = readFileSync(join(ROOT, 'public/newdesign/coachSettings.jsx'), 'utf8');
    const body = page.slice(page.indexOf('function CoachSettingsPage('), page.indexOf('function CoachNotificationCard('));
    assert.equal((body.match(/useSignedIn\(/g) || []).length, 1, 'Settings resolves the account twice');
    assert.doesNotMatch(body, /useRememberedChoices\(/, 'Settings opened the store through a second useSignedIn');
    assert.ok(signedInCalls > 0);
  } finally { await m.close(); }
});

test('a link naming no section, or one that is not there, leaves General', async () => {
  for (const asked of ['nope', 'account']) {
    const m = await mountPage({ dashRouteParam: () => asked, CoachAccountSettings: undefined, CoachGuidesCard: undefined });
    try {
      assert.ok(!m.tabs().some((t) => t.textContent === 'Account'), 'an Account tab without its cards');
      assert.ok(!m.tabs().some((t) => t.textContent === 'Guides'), 'a Guides tab without its card');
      assert.deepEqual(m.shown(), ['General'], asked + ' left no section showing');
    } finally { await m.close(); }
  }
});

test('a signed-in coach\'s tuning shows on its row and in its heading\'s count', async () => {
  const m = await mountPage({
    useSignedIn: () => 'coach-1',
    useCoachDoc: () => ({ kind: 'ready', doc: { thresholds: { FOOD_GAP_DAYS: 5 } }, apply: async () => true }),
  });
  try {
    await m.click('Client flags');
    const flags = m.panel('Client flags');
    assert.equal(flags.querySelector('input[aria-label="Food-log gap (days)"]').value, '5');
    assert.match(flags.textContent, /1 tuned/);
    assert.match(flags.textContent, /Saved to your account/);
  } finally { await m.close(); }
});
