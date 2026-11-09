// "See the example": a signed-in coach can open the sample dashboard, under the band, and nothing
// in it reaches their account (owner, 2026-11-09, option 1).
//
// The example is the signed-out preview, made by signing the tab out (public/newdesign/dashExample.js):
// while it is on, the tab's /api/me says { user: null }, every other /api/ request and every request to
// the Supabase project is answered 401 before it leaves, and supabase.js gives the tab a client with no
// stored session. Only signing out goes through. The shells skip their sign-in gate for it, the band
// says it's the example and offers the way back, and the link to it shows where a coach's own roster
// is empty and in Settings.
//
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require_ = createRequire(import.meta.url);
const ROOT = (f) => fileURLToPath(new URL('../' + f, import.meta.url));
const read = (f) => readFileSync(ROOT(f), 'utf8');
const ND = (f) => read('public/newdesign/' + f);
const { JSDOM, VirtualConsole } = require_('jsdom');
const EXAMPLE_SRC = ND('dashExample.js');

// ── 1. The switch, in a page of its own ───────────────────────────────────────────
// A fresh window at `url`, its real fetch a recorder, and dashExample.js run in it.
function page(url, { stored } = {}) {
  const quiet = new VirtualConsole(); // jsdom can't navigate; enter() and leave() still run
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url, virtualConsole: quiet });
  const win = dom.window;
  if (stored) win.sessionStorage.setItem('shape.dashExample', stored);
  const sent = [];
  const real = async (input, init) => {
    sent.push({ url: typeof input === 'string' ? input : input.url, method: (init && init.method) || (input && input.method) || 'GET' });
    return new Response('{"real":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  win.fetch = real;
  new Function('window', EXAMPLE_SRC)(win);
  return { win, sent, real };
}

test('off unless asked: no ?example and nothing stored leaves fetch alone', () => {
  const { win, real } = page('https://shape.test/newdesign/TrainerApp.html#today');
  assert.equal(win.ShapeDashExample.on, false);
  assert.equal(win.fetch === real, true, 'the page fetches as itself');
  assert.equal(win.sessionStorage.getItem('shape.dashExample'), null);
});

test('?example=1 turns it on for this tab; the tab keeps it without the query; ?example=0 turns it off', () => {
  const a = page('https://shape.test/newdesign/TrainerApp.html?example=1#week');
  assert.equal(a.win.ShapeDashExample.on, true);
  assert.equal(a.win.sessionStorage.getItem('shape.dashExample'), '1');
  assert.equal(a.win.fetch === a.real, false, 'the tab answers as signed out');
  const b = page('https://shape.test/newdesign/TrainerApp.html#week', { stored: '1' });
  assert.equal(b.win.ShapeDashExample.on, true, 'a reload or a tab change keeps the example');
  const c = page('https://shape.test/newdesign/TrainerApp.html?example=0#week', { stored: '1' });
  assert.equal(c.win.ShapeDashExample.on, false);
  assert.equal(c.win.sessionStorage.getItem('shape.dashExample'), null);
  const d = page('https://shape.test/newdesign/TrainerApp.html?example=yes#week');
  assert.equal(d.win.ShapeDashExample.on, false, 'only "1" asks for it');
});

test('in the example, the tab reads as signed out and nothing for the account leaves it', async () => {
  const { win, sent } = page('https://shape.test/newdesign/TrainerApp.html?example=1#today');
  const ask = async (input, init) => { const r = await win.fetch(input, init); return [r.status, await r.json()]; };
  // Who is signed in: nobody.
  assert.deepEqual(await ask('/api/me', { credentials: 'same-origin', cache: 'no-store' }), [200, { user: null }]);
  assert.deepEqual(await ask('https://shape.test/api/me'), [200, { user: null }], 'the same address written whole');
  // Every read of the account is a signed-out visitor's.
  for (const u of ['/api/trainer/clients', '/api/trainer/dashboard', '/api/coach/plans?role=trainer', '/api/coach/plans/usage', '/api/coach/score', '/api/stripe/next-payout']) {
    const [status] = await ask(u);
    assert.equal(status, 401, u);
  }
  // The cookie bridge would sign the tab's client back in as the coach: it is answered here too.
  assert.equal((await ask('/api/auth/session', { credentials: 'include', cache: 'no-store' }))[0], 401);
  assert.equal((await ask('/api/auth/session', { method: 'POST', body: '{}' }))[0], 401, 'nor can a session be pushed into the cookie');
  // Writes never leave: a publish, a meal plan, a booking move, a dismissal, by any spelling.
  assert.equal((await ask('/api/trainer/workout', { method: 'POST', body: '{}' }))[0], 401);
  assert.equal((await ask('/api/nutritionist/meal-plan', { method: 'post', body: '{}' }))[0], 401);
  assert.equal((await ask(new Request('https://shape.test/api/calendar/move', { method: 'PATCH', body: '{}' })))[0], 401);
  assert.equal((await ask('/api/coach/plans?id=x', { method: 'DELETE' }))[0], 401);
  // The Supabase project, read or written, from any of its hosts.
  assert.equal((await ask('https://zznufekgjngecelwxndw.supabase.co/rest/v1/coach_signal_dismissals?select=*'))[0], 401);
  assert.equal((await ask('https://zznufekgjngecelwxndw.supabase.co/rest/v1/user_goals', { method: 'POST', body: '{}' }))[0], 401);
  assert.equal((await ask('https://zznufekgjngecelwxndw.supabase.co/auth/v1/user'))[0], 401);
  assert.equal(sent.length, 0, 'not one request for the account was sent: ' + JSON.stringify(sent));
});

test('in the example, signing out and everything that is not the account still go through', async () => {
  const { win, sent } = page('https://shape.test/newdesign/TrainerApp.html?example=1#today');
  await win.fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
  await win.fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
  await win.fetch('/api/auth/session', { method: 'delete' });
  await win.fetch('https://unpkg.com/react@18.3.1/umd/react.production.min.js');
  await win.fetch('/newdesign/dash.css');
  await win.fetch('https://elsewhere.example/api/me');
  assert.deepEqual(sent.map((s) => s.method + ' ' + s.url), [
    'POST /api/auth/signout',
    'DELETE /api/auth/session',
    'delete /api/auth/session',
    'GET https://unpkg.com/react@18.3.1/umd/react.production.min.js',
    'GET /newdesign/dash.css',
    'GET https://elsewhere.example/api/me',
  ]);
});

test('leaving the example clears it and keeps the tab and the rest of the address', () => {
  const { win } = page('https://shape.test/newdesign/TrainerApp.html?from=nav&example=1#programs');
  assert.equal(win.ShapeDashExample.href(null), '/newdesign/TrainerApp.html?from=nav#programs');
  assert.equal(win.ShapeDashExample.href('1'), '/newdesign/TrainerApp.html?from=nav&example=1#programs');
  win.ShapeDashExample.leave();
  assert.equal(win.sessionStorage.getItem('shape.dashExample'), null, 'a reload is the coach\'s own data');
  const off = page('https://shape.test/newdesign/NutritionistApp.html#plans');
  off.win.ShapeDashExample.enter();
  assert.equal(off.win.sessionStorage.getItem('shape.dashExample'), '1');
  assert.equal(off.win.ShapeDashExample.href('1'), '/newdesign/NutritionistApp.html?example=1#plans');
});

// ── 2. supabase.js: the example's client holds no session ─────────────────────────
function loadSupabase(example) {
  const made = [];
  const store = new Map();
  const win = {
    ShapeDashExample: example == null ? undefined : { on: example },
    supabase: { createClient: (url, key, opts) => { made.push(opts); return { auth: { onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }, getSession: async () => ({ data: { session: null } }) }, from() { return {}; } }; } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: () => null, get length() { return 0; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'https://shape.test/newdesign/TrainerApp.html', pathname: '/newdesign/TrainerApp.html', search: '', hash: '', origin: 'https://shape.test' },
    document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], body: null, cookie: '' },
    navigator: { userAgent: 'test' },
    console,
  };
  win.window = win;
  const sandbox = { window: win, console, setTimeout, clearTimeout, URL, URLSearchParams, Promise, JSON, Date, Math, Object, Array, String, Number, Boolean, Error, Map, Set };
  Object.assign(sandbox, { document: win.document, localStorage: win.localStorage, sessionStorage: win.sessionStorage, navigator: win.navigator, location: win.location });
  vm.createContext(sandbox);
  vm.runInContext(read('public/supabase.js'), sandbox, { filename: 'public/supabase.js' });
  return made;
}

test('supabase.js: the example tab\'s client keeps no session and never touches the coach\'s stored one', () => {
  const ex = loadSupabase(true);
  assert.equal(ex.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ex[0].auth)), { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'shape.auth.example' });
  for (const off of [false, null]) {
    const own = loadSupabase(off);
    assert.deepEqual(JSON.parse(JSON.stringify(own[0].auth)), { persistSession: true, autoRefreshToken: true, storageKey: 'shape.auth' }, 'the coach\'s own client, as before');
  }
});

// ── 3. The shells ─────────────────────────────────────────────────────────────────
for (const shell of ['TrainerApp.html', 'NutritionistApp.html']) {
  test(shell + ': the switch loads before anything that can fetch, and the gate shows the example', async () => {
    const html = ND(shell);
    const at = (needle) => { const i = html.indexOf(needle); assert.equal(i >= 0, true, shell + ' lost ' + needle); return i; };
    const sw = at('<script src="dashExample.js"></script>');
    for (const later of ['src="portalSession.js"', 'src="/supabase.js', 'ShapePortalSession.read()', 'src="/consent-insights.js"', 'nd/', 'src="pageShell.jsx', 'globalChatButton.js']) {
      const i = html.indexOf(later);
      if (i >= 0) assert.equal(sw < i, true, shell + ': dashExample.js must load before ' + later);
    }
    assert.equal(html.slice(0, sw).includes('fetch('), false, shell + ': nothing above the switch fetches');
    // The gate, run: in the example it neither asks who is signed in nor sends the coach anywhere.
    const start = html.indexOf('<script>', at('src="portalSession.js"'));
    const gate = html.slice(start + '<script>'.length, html.indexOf('</script>', start));
    for (const on of [true, false]) {
      let asked = 0;
      const win = { ShapeDashExample: { on }, ShapePortalSession: { read: () => { asked += 1; return Promise.resolve({ user: null }); } }, location: { pathname: '/newdesign/' + shell, search: '', hash: '', replace: () => { win.sent = true; } } };
      new Function('window', gate)(win);
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(asked, on ? 0 : 1, shell + (on ? ': the example is shown, not gated' : ': the gate still reads who is signed in'));
      assert.equal(!!win.sent, !on, shell + (on ? ': the example sends nobody to sign in' : ': a signed-out visitor is still sent to sign in'));
    }
  });
}

// ── 4. The band and the link, mounted ─────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#today', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require_('react');
const ReactDOM = require_('react-dom');
const { createRoot } = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const preset = require_('next/dist/compiled/babel/preset-react');
const compile = (src) => babel.transformSync(src, { presets: [preset], babelrc: false, configFile: false, sourceType: 'script' }).code;
const DashSignals = require_('../public/newdesign/dashSignals.js');
const CF = require_('../public/newdesign/coachForecast.js');
const DashExport = require_('../public/newdesign/dashExport.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
const U = await import('../public/newdesign/unitText.mjs');
Object.assign(window, { ShapeZone, ShapeClientColors, CoachForecast: CF, DashExport });
window.matchMedia = (q) => ({ media: q, matches: true, addEventListener() {}, removeEventListener() {} });
Object.assign(globalThis, {
  React, ReactDOM, DashSignals,
  serif: 'serif', sans: 'sans-serif', mono: 'monospace', INK: '#f2ede4', PAPER: '#1a1612', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', ink50: 'rgba(0,0,0,.5)',
  ssAlpha: (c, a) => 'rgba(0,0,0,' + a + ')',
  trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: { demo: 'trainer' }, nutriPayoutCard: { demo: 'nutritionist' },
});
const DATA_CODE = compile(ND('dashData.jsx'));
const freshData = () => new Function('React', 'DashSignals', 'window', 'document',
  DATA_CODE + '\n;return { useDashboard, useCoachWeekReviews, useCoachDoc, useSignedIn, useRememberedChoices, useRememberedChoice, useRememberedSet, useRememberedSlots, dashPlanClientCount, dashUnitsApi, dashUnitPrefs, dashCheckinReviewed, readoutStamp, readoutWeekKey, useWeekClock, dashWeighInDelta };')(React, DashSignals, window, document);
const D = freshData();
const share = () => { for (const k of Object.keys(window)) if (!(k in globalThis)) { try { globalThis[k] = window[k]; } catch (e) { /* read-only */ } } };
Object.assign(globalThis, { useCoachWeekReviews: D.useCoachWeekReviews, dashCheckinReviewed: D.dashCheckinReviewed, readoutStamp: D.readoutStamp, readoutWeekKey: D.readoutWeekKey, useWeekClock: D.useWeekClock, dashWeighInDelta: D.dashWeighInDelta });
const T = new Function(compile(ND('dashToday.jsx')) + ';return { CoachDashboardPage, DashDemoBand, DashExampleLink, dashRouteParam };')();
globalThis.dashRouteParam = T.dashRouteParam;
share();
new Function(compile(ND('dashRoster.jsx')) + ';return { DashRosterTable };')();
share();
const CLIENTS = {
  trainer: new Function(compile(ND('trainerClientsPage.jsx')) + ';return TrainerClientsPage;')(),
  nutritionist: new Function(compile(ND('nutritionistClientsPage.jsx')) + ';return NutritionistClientsPage;')(),
};
share();

const settle = async (n = 6) => { for (let i = 0; i < n; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
// ⚠ EVERY PAGE IS UNMOUNTED AFTER ITS TEST, A FAILED ONE INCLUDED. A page left mounted keeps its clock
// timers running, so a failed assertion before its unmount hung the file instead of failing it.
const mounted = new Set();
async function mount(el) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  let gone = false;
  const unmount = async () => { if (gone) return; gone = true; mounted.delete(unmount); await React.act(async () => { root.unmount(); div.remove(); }); };
  mounted.add(unmount);
  await React.act(async () => root.render(el));
  await settle();
  return { div, text: () => div.textContent.replace(/\s+/g, ' ').trim(), unmount };
}
afterEach(async () => { for (const u of [...mounted]) await u(); });
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ROLE_KEY = { trainer: 'isTrainer', nutritionist: 'isNutritionist' };
const uid = (i) => String(i).padStart(8, '0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// The coach's own server: a roster of `n` clients (live), and a day feed.
function server(role, n) {
  const asked = [];
  const handler = async (url, init) => {
    const u = typeof url === 'string' ? url : url.url;
    asked.push(((init && init.method) || 'GET') + ' ' + u);
    if (u.startsWith('/api/' + role + '/clients')) {
      return json({ [ROLE_KEY[role]]: true, clients: Array.from({ length: n }, (_, i) => ({ id: uid(i + 1), name: 'Own Client ' + (i + 1), status: 'active' })), totals: { active: n } });
    }
    if (u.startsWith('/api/' + role + '/dashboard')) return json({ [ROLE_KEY[role]]: true, user: { firstName: 'Avery' }, kpis: {}, today: [] });
    if (u === '/api/clients/shared-overview') return json({ results: {}, failed: [] });
    return json({}, 404);
  };
  return { handler, asked };
}
// The page shell, stubbed as the other page tests do (pageShell.jsx, coachNav.jsx), and the real data
// hook, fresh for each page so no read is served from the last one's cache.
const units = D.dashUnitsApi(U, D.dashUnitPrefs('Imperial · lb / mi'));
function shell() {
  Object.assign(globalThis, {
    useDashboard: freshData().useDashboard,
    DashShell: (props) => React.createElement('div', null, props.gridWidgets.filter((w) => !w.empty).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render()))),
    DashPage: ({ eyebrow, children }) => React.createElement('main', null, React.createElement('div', { 'data-eyebrow': '' }, eyebrow), children),
    Card: ({ children }) => React.createElement('div', null, children), DashSegmented: ({ items }) => React.createElement('div', { 'data-seg': '' }, items.map((i) => i.label).join(' | ')),
    SharedClientsTab: () => null, DashExportButton: () => null,
    useDashUnits: () => units, useDashFocusRefresh: () => {}, useDashPaper: () => {}, dashShellHref: (x) => x,
    dashPlanClientCount: D.dashPlanClientCount, dashMilestonesIn: (ms) => ms || { recent: [], next: [] }, dashGoalText: (x) => String(x),
  });
}
function useServer(srv) { shell(); globalThis.fetch = window.fetch = srv.handler; }
const linkCount = (div) => div.querySelectorAll('[data-dash-example-link]').length;

test('the band: the example says so and offers the way back; the signed-out preview is unchanged', async () => {
  let left = 0;
  window.ShapeDashExample = { on: true, enter() {}, leave() { left += 1; } };
  try {
    const m = await mount(React.createElement(T.DashDemoBand));
    assert.match(m.text(), /Example · sample clients — nothing here is your account/);
    assert.match(m.text(), /Back to my dashboard/);
    assert.equal(/Sign in/.test(m.text()), false, 'a signed-in coach is not asked to sign in');
    await React.act(async () => { m.div.querySelector('button').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    assert.equal(left, 1, 'Back to my dashboard leaves the example');
    await m.unmount();
  } finally { delete window.ShapeDashExample; }
  for (const sw of [undefined, { on: false, enter() {}, leave() {} }]) {
    if (sw) window.ShapeDashExample = sw;
    const m = await mount(React.createElement(T.DashDemoBand));
    assert.match(m.text(), /Preview · demo data — an example of a live account/);
    assert.match(m.text(), /Sign in →/);
    assert.equal(/Back to my dashboard/.test(m.text()), false);
    await m.unmount();
    delete window.ShapeDashExample;
  }
});

test('the link: it opens the example, and never shows inside it or where the shell has no switch', async () => {
  let entered = 0;
  window.ShapeDashExample = { on: false, enter() { entered += 1; }, leave() {} };
  try {
    const m = await mount(React.createElement(T.DashExampleLink));
    assert.equal(linkCount(m.div), 1);
    assert.match(m.text(), /See the example →/);
    await React.act(async () => { m.div.querySelector('button').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    assert.equal(entered, 1);
    await m.unmount();
    window.ShapeDashExample.on = true;
    const inside = await mount(React.createElement(T.DashExampleLink));
    assert.equal(linkCount(inside.div), 0, 'no link to the example inside it');
    await inside.unmount();
  } finally { delete window.ShapeDashExample; }
  const none = await mount(React.createElement(T.DashExampleLink));
  assert.equal(linkCount(none.div), 0, 'a page without the switch offers nothing');
  await none.unmount();
});

test('Today: a coach whose roster was read and is empty is offered the example; nobody else is', async () => {
  window.ShapeDashExample = { on: false, enter() {}, leave() {} };
  try {
    for (const role of ['trainer', 'nutritionist']) {
      useServer(server(role, 0));
      const empty = await mount(React.createElement(T.CoachDashboardPage, { role }));
      await settle(8);
      assert.match(empty.text(), /No clients yet\. See the example dashboard →/, role);
      assert.equal(linkCount(empty.div), 1, role);
      await empty.unmount();
      useServer(server(role, 2));
      const full = await mount(React.createElement(T.CoachDashboardPage, { role }));
      await settle(8);
      assert.equal(linkCount(full.div), 0, role + ': a coach with clients sees their own');
      await full.unmount();
    }
    // The signed-out preview already is the sample: no link to it.
    useServer({ handler: async () => json({ error: 'x' }, 401) });
    const preview = await mount(React.createElement(T.CoachDashboardPage, { role: 'trainer' }));
    await settle(8);
    assert.match(preview.text(), /Preview · demo data/);
    assert.equal(linkCount(preview.div), 0, 'the preview is not offered itself');
    await preview.unmount();
    // A roster that couldn't be read is not an empty one.
    useServer({ handler: async (u) => (String(u).includes('/clients') ? json({ error: 'x' }, 500) : json({}, 404)) });
    const unread = await mount(React.createElement(T.CoachDashboardPage, { role: 'trainer' }));
    await settle(8);
    assert.equal(linkCount(unread.div), 0, 'an unread roster is not "no clients yet"');
    await unread.unmount();
  } finally { delete window.ShapeDashExample; }
});

test('Clients: the empty table offers the example only for a roster that was read', async () => {
  window.ShapeDashExample = { on: false, enter() {}, leave() {} };
  try {
    for (const role of ['trainer', 'nutritionist']) {
      useServer(server(role, 0));
      const m = await mount(React.createElement(CLIENTS[role]));
      await settle(8);
      assert.match(m.text(), /No clients yet\. Share your public profile to start getting subscribers\. See the example dashboard →/, role);
      await m.unmount();
      useServer({ handler: async (u) => (String(u).includes('/clients') ? json({ error: 'x' }, 503) : json({}, 404)) });
      const unread = await mount(React.createElement(CLIENTS[role]));
      await settle(8);
      assert.equal(linkCount(unread.div), 0, role + ': unread is not empty');
      await unread.unmount();
    }
  } finally { delete window.ShapeDashExample; }
});

test('Settings: the example card is for a signed-in coach, outside the example', () => {
  const src = ND('coachSettings.jsx');
  const card = src.slice(src.indexOf('the example dashboard (owner, 2026-11-09)'), src.indexOf('the account\'s time zone (P9)'));
  assert.match(card, /\{live && typeof DashExampleLink === "function" && window\.ShapeDashExample && !window\.ShapeDashExample\.on && \(/);
  assert.match(card, /Nothing you do in the example reaches your account\./);
  assert.match(card, /<DashExampleLink \/>/);
});

// ── 5. The example, end to end: the coach's own server is never asked ───────────────
test('the example over a coach with their own clients: the sample under the example band, and the account is never read', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    const own = server(role, 3);
    shell();
    window.fetch = own.handler;
    window.sessionStorage.setItem('shape.dashExample', '1');
    new Function('window', EXAMPLE_SRC)(window);
    globalThis.fetch = window.fetch;
    try {
      assert.equal(window.ShapeDashExample.on, true);
      const m = await mount(React.createElement(T.CoachDashboardPage, { role }));
      await settle(10);
      assert.match(m.text(), /Example · sample clients — nothing here is your account/, role);
      assert.equal(/Own Client/.test(m.text()), false, role + ': none of the coach\'s own clients');
      assert.equal(DashSignals.buildMockClients(new Date()).some((c) => m.text().includes(c.profile.name)), true, role + ': the sample\'s people');
      assert.deepEqual(own.asked, [], role + ': the coach\'s server was never asked');
      await m.unmount();
    } finally {
      window.sessionStorage.removeItem('shape.dashExample');
      delete window.ShapeDashExample;
    }
  }
});

test('the header: the example tab offers no Log in or Get started, since its coach is signed in', () => {
  const src = ND('pageShell.jsx');
  assert.match(src, /\{!\(window\.ShapeDashExample && window\.ShapeDashExample\.on\) && <a href="\/newdesign\/Login\.html" style=\{quietLink\}>Log in<\/a>\}/);
  assert.match(src, /\{!\(window\.ShapeDashExample && window\.ShapeDashExample\.on\) && <a href="\/newdesign\/Landing\.html" style=\{ctaBtn\}>Get started<\/a>\}/);
  assert.match(src, /\) : \(window\.ShapeDashExample && window\.ShapeDashExample\.on\) \? null : \(\n          <>\n            <a href="Login\.html"/, 'the phone menu too');
});
