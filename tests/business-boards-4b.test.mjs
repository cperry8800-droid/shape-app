// Coach dashboard step 4b (the owner's review, 2026-11-08): Business · Plan, Growth and Retention as
// widget boards, as step 4a made Overview and Money. These mount the SHIPPED components
// (dashBusiness.jsx, dashToday.jsx, dashGrid.jsx) in jsdom with the real forecast, signals, zone and
// tier modules, and read what a coach reads:
//   1. the default boards (Plan three, Growth and Retention four), on their own tab keys, and what
//      moved to the catalogue;
//   2. live versus sample: the preview's figures only under the band, never on a coach's failed page;
//   3. Plan: one scenario from the coach's own numbers, the levers priced from the forecast and applied
//      by a tap, and where it levels off, flipping to "Clears goal";
//   4. Growth: the funnel to scale with the leak named, the profile link, the money split with tier
//      marks, and the waiting list with "Reopen my listing";
//   5. Retention: who might leave (only real reads named), what a client is worth, how long they stay,
//      and why people left, grouped, with one follow-up;
//   6. unread versus empty on every card.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const read = (f) => readFileSync(ND(f), 'utf8');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#business', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
const React = require_('react');
const ReactDOM = require_('react-dom');
globalThis.React = React;
const { createRoot } = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const preset = require_('next/dist/compiled/babel/preset-react');
const compile = (src) => babel.transformSync(src, { presets: [preset], babelrc: false, configFile: false }).code;
const CF = require_('../public/newdesign/coachForecast.js');
const DashSignals = require_('../public/newdesign/dashSignals.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
const { resolveGridLayout } = await import('../public/newdesign/dashboardLayout.mjs');
Object.assign(window, { CoachForecast: CF, ShapeZone, ShapeClientColors });
Object.assign(globalThis, { DashSignals, serif: 'serif' });

// dashToday.jsx, whole, as the page loads it: the money format, the tier marks, the client links, and
// the funnel's sample and benchmark (top-level constants the page reads by name, as the browser shares them).
const TODAY = read('dashToday.jsx');
const T = new Function('React', 'window', 'DashSignals', 'useDashUnits', 'useRememberedChoice', 'useRememberedSlots', 'dashMilestonesIn', 'useDashFocusRefresh', 'serif', 'sans', 'mono', 'INK', 'TEAL_BRIGHT',
  compile(TODAY) + ';return { dashMoney, DashClientGem, dashRecordTier, dashClientHref, dashTabHref, dashLinkedTab, DASH_DEMO_FUNNEL, DASH_FUNNEL_BENCHMARK };')(
  React, window, DashSignals, () => null, (s, k, a, f) => React.useState(f), (s, keys, allowed, defaults) => React.useState(defaults), (ms) => ms, () => {}, 'serif', 'sans', 'monospace', '#f2ede4', '#2ee0c4');
const messages = [];
Object.assign(globalThis, {
  dashMoney: T.dashMoney, DashClientGem: T.DashClientGem, dashRecordTier: T.dashRecordTier, dashClientHref: T.dashClientHref, dashTabHref: T.dashTabHref, dashLinkedTab: T.dashLinkedTab,
  DASH_DEMO_FUNNEL: T.DASH_DEMO_FUNNEL, DASH_FUNNEL_BENCHMARK: T.DASH_FUNNEL_BENCHMARK,
  dashMessageClient: (name, role, draft, id) => messages.push({ name, role, draft, id }),
});
const money = T.dashMoney;
const esc = (s) => String(s).replace(/[.$()+*?[\]\\|{}^]/g, '\\$&');

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const B = await loadRealModule(ND('dashBusiness.jsx'), {
  appendExports: 'export { dbzPlanBase, dbzScenarioStart, dbzScenarioRun, dbzLevers, dbzPlanModel, DbzPlanStartCard, DbzScenarioCard, DbzLeversCard, DbzLevelCard, dbzFunnelSteps, dbzFunnelModel, DbzFunnelCard, useDbzReferralLink, DbzProfileLinkCard, dbzOriginSplit, DbzOriginSplitCard, DbzWaitlistCard, dbzLeaveModel, DbzLeaveCard, dbzWorthModel, DbzWorthCard, dbzTenureModel, dbzTenureWords, DbzTenureCard, dbzReasonGroup, dbzReasonsModel, DbzReasonsCard, dbzDemoOrigin, DBZ_DEMO_CHURN };',
});

async function mount(el) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await React.act(async () => root.render(el));
  return { div, text: () => div.textContent.replace(/\s+/g, ' ').trim(), rerender: (next) => React.act(async () => root.render(next)), unmount: () => React.act(async () => { root.unmount(); div.remove(); }) };
}
const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el) => React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
async function setValue(input, v) {
  const proto = Object.getPrototypeOf(input);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, String(v));
  await React.act(async () => { input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const dollars = (t) => /\$\d/.test(t);
const ROSTER = DashSignals.buildMockClients(new Date());
const ROSTER_NAMES = new RegExp(ROSTER.map((c) => esc(c.profile.name)).join('|'));

// The whole page, with its neighbours stubbed: the band, the sidebar card, the funnel panel, and a
// DashGrid that records the boards it was handed and draws every card each declares (the catalogue's
// too with `all`), or each default card.
function stubPage({ source, today = null, section, clients, all = false }) {
  const seen = { boards: {} };
  const rosterOf = clients !== undefined ? clients : source === 'demo' ? DashSignals.buildMockClients(new Date()) : [];
  Object.assign(globalThis, {
    useDashboard: () => ({ today, source, clients: rosterOf, triage: DashSignals.getTriageFeed('trainer', rosterOf) }),
    useRememberedChoices: () => null,
    useRememberedChoice: () => React.useState(section),
    DashPage: ({ children }) => React.createElement(React.Fragment, null, children),
    DashSegmented: () => null, DashExportButton: ({ live }) => React.createElement('i', null, live ? 'EXPORT ON' : 'EXPORT OFF'),
    DashFunnelPanel: ({ live }) => React.createElement('i', null, live ? 'LIVE FUNNEL' : 'DEMO FUNNEL'),
    DashDemoBand: () => React.createElement('b', null, 'PREVIEW'),
    DashGrid: (props) => {
      seen.boards[props.tab] = props;
      return React.createElement(React.Fragment, null, props.widgets.filter((w) => !w.empty && (all || !w.optional)).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render())));
    },
    trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: { demo: 'trainer' }, nutriPayoutCard: { demo: 'nutritionist' },
    useDashUnits: () => ({ measure: (value, unit) => ({ value, unit }) }),
    useDashNextPayout: undefined,
  });
  return seen;
}
const answer = (status, body) => () => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
async function page(opts, fetcher) {
  const seen = stubPage(opts);
  globalThis.fetch = window.fetch = fetcher;
  const m = await mount(React.createElement(window.CoachBusinessPage, { role: opts.role || 'trainer' }));
  await settle();
  await settle();
  return { m, seen };
}
const cardText = (m, key) => (m.div.querySelector('[data-card="' + key + '"]') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();

// Every control styled as the board's one filled action (DBZ_FILLED: the accent's fill).
const filled = (root) => [...root.querySelectorAll('button, a, span')].filter((b) => /var\(--sh-accent, #2ee0c4\)/.test(b.style.background));
const GROUP_KEYS = ['clients', 'schedule', 'money', 'programs'];

// ── 1. The default boards ─────────────────────────────────────────────────────
const BOARDS = {
  // The brief's three: the scenario across the board, the levers beside the level. "Where you start" is
  // in the catalogue with what the tab carried before.
  plan: { tab: 'business-plan', on: ['scenario', 'levers', 'level'], layout: ['scenario:12', 'levers:8', 'level:4'], off: ['start', 'earn', 'planner'] },
  growth: { tab: 'business-growth', on: ['funnel', 'link', 'origin', 'waitlist'], layout: ['funnel:8', 'link:4', 'origin:8', 'waitlist:4'], off: ['closerate', 'whofound', 'byo'] },
  retention: { tab: 'business-retention', on: ['leave', 'worth', 'tenure', 'reasons'], layout: ['leave:8', 'worth:4', 'tenure:8', 'reasons:4'], off: ['outcomes', 'churnlist'] },
};
test('Plan, Growth and Retention are boards on their own tab keys: their default cards, the rest in the catalogue', async () => {
  for (const [section, want] of Object.entries(BOARDS)) {
    const { m, seen } = await page({ source: 'demo', section }, answer(401, { error: 'x' }));
    assert.deepEqual(Object.keys(seen.boards), [want.tab], section + ': one board a section');
    const b = seen.boards[want.tab];
    assert.equal(b.role, 'trainer');
    assert.deepEqual(b.widgets.filter((w) => !w.optional).map((w) => w.key), want.on, section);
    // Two thirds beside one third, as on Today and the 4a boards.
    assert.deepEqual(resolveGridLayout(null, b.widgets).visible.map((v) => v.key + ':' + v.w), want.layout, section);
    assert.deepEqual(b.widgets.filter((w) => w.optional).map((w) => w.key), want.off, section + ': the catalogue');
    for (const w of b.widgets) {
      assert.equal(typeof w.title === 'string' && typeof w.blurb === 'string' && w.blurb.length > 10, true, section + ' ' + w.key + ' has no title or blurb');
      assert.equal(GROUP_KEYS.includes(w.group), true, section + ' ' + w.key + ' names no catalogue group');
    }
    // The cards are on the page: each one's eyebrow, in order.
    assert.deepEqual([...m.div.querySelectorAll('[data-card] > section')].map((s) => s.getAttribute('aria-label')), want.on.map((k) => b.widgets.find((w) => w.key === k).title), section);
    await m.unmount();
  }
  const src = read('dashBusiness.jsx');
  for (const k of ['plan', 'growth', 'retention']) {
    assert.match(src, new RegExp('\\n    ' + k + ': grid \\? <DashGrid key="business-' + k + '" role=\\{role\\} tab="business-' + k + '" widgets=\\{' + k + 'Widgets\\} /> : stack\\(' + k + 'Widgets\\),'), k);
  }
  // The old Plan's four-slider planner, Growth's two-up plates and Retention's three stacked plates are gone.
  assert.doesNotMatch(src, /plan: <React\.Fragment>\{earnPlate\}\{planPlate\}|pair\(funnel, origin\)|retention: <React\.Fragment>\{lifetime\}/);
});

test('what each tab carried before is in its catalogue, the progress data among it', async () => {
  // Drawn with the catalogue's cards: the old zones are all still there to add.
  const { m: p } = await page({ source: 'demo', section: 'plan', all: true }, answer(401, { error: 'x' }));
  assert.match(cardText(p, 'start'), /^Where you start\$[\d,]+ \/mo\d+ clients today, after Shape's fee/);
  assert.match(cardText(p, 'earn'), /What clients earn you.*net a month.*a year/);
  assert.match(cardText(p, 'planner'), /Plan the next 12 months.*Compare a what-if.*In 12 months/);
  await p.unmount();
  const { m: g } = await page({ source: 'demo', section: 'growth', all: true }, answer(401, { error: 'x' }));
  assert.match(cardText(g, 'closerate'), /DEMO FUNNEL/);
  assert.match(cardText(g, 'whofound'), /you brought · \d+ found you on Shape/);
  assert.match(cardText(g, 'byo'), /Bring your clients.*Copy link.*Email it/);
  await g.unmount();
  const { m: r } = await page({ source: 'demo', section: 'retention', all: true }, answer(401, { error: 'x' }));
  assert.match(cardText(r, 'outcomes'), /roster outcomes, last 30 days.*Top weight loss · 30d/);
  assert.match(cardText(r, 'churnlist'), /Churn · who left & why.*Devon Sharpe.*Mara Ellison.*Theo Brandt/);
  await r.unmount();
});

// ── 2. Live versus sample ─────────────────────────────────────────────────────
const UNREAD = {
  plan: [/A year from now.*Couldn't read your subscriptions just now, and the plan starts from them/, /Which lever moves it most.*Couldn't read your subscriptions/, /Where it levels off.*Couldn't read your subscriptions/],
  growth: [/Couldn't read your funnel just now/, /Your link couldn't be made just now/, /Couldn't read where your clients came from just now/, /Your waiting list couldn't be read just now/],
  retention: [/Who might leave couldn't be read just now/, /What a client is worth.*Couldn't read your subscriptions just now/, /How long they stay.*Your clients couldn't be read just now/, /Couldn't read your cancellations just now/],
};
const LOADING = {
  plan: [/A year from now.*Reading your numbers…/, /Which lever moves it most.*Reading your numbers…/, /Where it levels off.*Reading your numbers…/],
  growth: [/Reading your funnel…/, /Making your link…/, /Reading where your clients came from…/, /Reading your waiting list…/],
  retention: [/Reading your clients' signals…/, /Reading your history…/, /Reading your clients…/, /Reading who left…/],
};
test('the preview draws its own sample under the band; a coach whose reads failed sees each card say so, never the sample', async () => {
  for (const section of Object.keys(BOARDS)) {
    const demo = await page({ source: 'demo', section }, answer(401, { error: 'x' }));
    const t = demo.m.text();
    assert.match(t, /^PREVIEW/, section);
    assert.equal(dollars(t), true, section + ': the preview has figures');
    // Retention names its roster in words; Growth on each tier mark's title.
    const titles = [...demo.m.div.querySelectorAll('[title]')].map((e) => e.getAttribute('title')).join(' | ');
    if (section === 'retention') assert.match(t, ROSTER_NAMES, section + ': the preview names its roster');
    if (section === 'growth') assert.match(titles, ROSTER_NAMES, section + ': the preview\'s tier marks are its roster');
    await demo.m.unmount();
    // Signed in, every read failed: useDashboard fell back to its demo, roster and all.
    for (const fail of [answer(500, { error: 'x' }), answer(503, { error: 'x' }), () => Promise.reject(new TypeError('Failed to fetch'))]) {
      const out = await page({ source: 'demo', section }, (url) => (url.startsWith('/api/trainer/analytics') ? fail() : answer(500, {})()));
      const u = out.m.text();
      assert.doesNotMatch(u, /PREVIEW|DEMO FUNNEL/, section);
      assert.doesNotMatch(u, ROSTER_NAMES, section + ': the sample roster on a coach\'s page');
      assert.equal(dollars(u), false, section + ': a figure on a page that read none: ' + u.slice(0, 300));
      assert.doesNotMatch(u, /Reading |Making your link/, section + ': a failed read is not still loading');
      for (const re of UNREAD[section]) assert.match(u, re, section);
      await out.m.unmount();
    }
    // Still reading: every card says it is, none says it failed or shows the sample.
    const wait = await page({ source: 'demo', section }, () => new Promise(() => {}));
    const w = wait.m.text();
    assert.doesNotMatch(w, /PREVIEW|couldn't|Couldn't/, section + ': ' + w.slice(0, 300));
    assert.doesNotMatch(w, ROSTER_NAMES, section);
    assert.equal(dollars(w), false, section);
    for (const re of LOADING[section]) assert.match(w, re, section);
    await wait.m.unmount();
  }
});

// A live coach's analytics: ten clients, a pace, and a listing at $180.
function weeksOf(n, active, net, gross, added = (i) => (i % 3 === 0 ? 1 : 0)) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - (n - 1 - i) * 7 * 86400000);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { weekOf: d.toISOString().slice(0, 10), active, added: added(i), ended: i % 5 === 0 ? 1 : 0, mrrNetCents: net, mrrGrossCents: gross, oneTimeCents: 0 };
  });
}
function liveAnalytics(o = {}) {
  const weeks = weeksOf(26, 10, 153000, 180000);
  return { isTrainer: true, providerId: 7, metrics: {}, byOrigin: [], byoMix: { clients: 10, brought: 0 }, trajectory: { weeks, firstSubAt: weeks[0].weekOf + 'T00:00:00Z' }, renewals: [], churn: [], stripe: { connected: false }, ...o };
}
function liveFetch(analytics, { capacity = { listings: [{ role: 'trainer', waiting: 0, effective: false }] }, posts = null } = {}) {
  const ok = (d) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d) });
  return (url, init) => {
    if (url.startsWith('/api/trainer/analytics')) return ok(analytics);
    if (url.startsWith('/api/coach/listing')) return ok({ listings: [{ role: 'trainer', monthly: 180, ready: true }] });
    if (url.startsWith('/api/coach/capacity')) {
      if (init && init.method === 'POST') { if (posts) posts.push(JSON.parse(init.body)); return ok({ ok: true, listing: { effective: false } }); }
      return ok(capacity);
    }
    return Promise.reject(new Error('unexpected ' + url));
  };
}

// ── 3. Plan ───────────────────────────────────────────────────────────────────
const PACE = { adds: 2.3, churn: 0.08, days: 91, fromFirst: false, added: 7, ended: 3, avgActive: 12 };
const BASE = { state: 'ready', clients: 12, mrrNetCents: 189000, mrrGrossCents: 216000, rateCents: 18000, rateFrom: 'your listing price', byoShare: 2 / 12, byoNote: '0% fee · 2 of your 12', pace: PACE };
const runOf = (base, o) => CF.forecast({ clients: base.clients, mrrNetCents: base.mrrNetCents, byoShare: base.byoShare, months: 36, priceCents: Math.round(o.rate * 100), adds: o.adds, churn: o.churnPct / 100 });

test('the scenario starts at the coach\'s own numbers, never a made-up count, and says where each came from', async () => {
  const start = CF.planStart(BASE);
  const model = B.dbzPlanModel(BASE, null);
  assert.deepEqual([model.state, model.touched, model.plan], ['ready', false, { adds: start.adds, churnPct: start.churnPct, rate: start.rate }]);
  assert.equal(model.yearCents, runOf(BASE, start).rows[12].netCents, 'a year out at today\'s pace, through the forecast');
  const m = await mount(React.createElement(B.DbzScenarioCard, { model, onChange: () => {}, onReset: () => {} }));
  const sliders = [...m.div.querySelectorAll('input[type=range]')];
  assert.deepEqual(sliders.map((s) => Number(s.value)), [start.adds, start.churnPct, start.rate], 'three sliders, at the coach\'s numbers');
  assert.match(m.text(), new RegExp('^A year from nownet a month · next \\d+ months' + esc(money(model.yearCents)) + ' /moat today\'s pace'));
  assert.match(m.text(), /yours: 2\.3 over the last 3 months/);
  assert.match(m.text(), /yours: 8% leave a month, over the last 3 months/);
  assert.match(m.text(), /your listing price/);
  assert.equal(m.div.querySelector('svg[role="img"]') != null, true, 'the projection is drawn');
  assert.match(m.div.querySelector('svg[role="img"]').innerHTML, /goal/, 'with its goal line');
  assert.doesNotMatch(m.text(), /Back to my numbers/, 'nothing to go back to yet');
  await m.unmount();
  // On the page, from a live coach's analytics: ten clients today, and the scenario starts there.
  // (With the catalogue drawn: "Where you start" is a catalogue card.)
  const { m: pg } = await page({ source: 'live', section: 'plan', all: true }, liveFetch(liveAnalytics()));
  assert.match(cardText(pg, 'start'), /^Where you start\$1,530 \/mo10 clients today, after Shape's feeNew clients pay\$180 a monthyour listing price/);
  assert.doesNotMatch(['scenario', 'levers', 'level'].map((k) => cardText(pg, k)).join(' '), /20 clients|you have 10 today/, 'no calculator opening at a round number above today on the board');
  const b = B.dbzPlanBase({ live: true, extra: liveAnalytics(), listing: { monthly: 180 }, listingRead: true });
  assert.equal(Number(pg.div.querySelector('[data-card="scenario"] input[type=range]').value), CF.planStart(b).adds);
  await pg.unmount();
  // No history: stated defaults, never "yours".
  const young = { ...BASE, pace: { adds: null, churn: null, days: 12, fromFirst: true } };
  const y = await mount(React.createElement(B.DbzScenarioCard, { model: B.dbzPlanModel(young, null), onChange: () => {}, onReset: () => {} }));
  assert.match(y.text(), /at a starting pace: no history yet/);
  assert.equal((y.text().match(/no history yet · set your own/g) || []).length, 2);
  assert.doesNotMatch(y.text(), /yours:/);
  await y.unmount();
  const ys = await mount(React.createElement(B.DbzPlanStartCard, { model: B.dbzPlanModel(young, null) }));
  assert.match(ys.text(), /A starting pace1\.0 new · 5% leave, a monthno history yet · set your own/);
  assert.doesNotMatch(ys.text(), /Your pace/);
  await ys.unmount();
});

test('the levers are priced from the forecast, most first, and the top one is the board\'s one filled control', async () => {
  const start = CF.planStart(BASE);
  const plan = { adds: start.adds, churnPct: start.churnPct, rate: start.rate };
  const at = runOf(BASE, plan).rows[12].netCents;
  const want = [
    ['more', { ...plan, adds: CF.round1(plan.adds + 1) }],
    ['keep', { ...plan, churnPct: Math.max(0, CF.round1(plan.churnPct - 3)) }],
    ['price', { ...plan, rate: Math.round(plan.rate * 1.15 / 5) * 5 }],
  ].map(([key, o]) => ({ key, cents: Math.round(runOf(BASE, o).rows[12].netCents - at), o })).sort((a, b) => b.cents - a.cents);
  const levers = B.dbzLevers(BASE, plan);
  assert.deepEqual(levers.map((l) => [l.key, l.deltaCents]), want.map((w) => [w.key, w.cents]));
  assert.equal(levers.every((l, i) => i === 0 || l.deltaCents <= levers[i - 1].deltaCents), true, 'most first');
  // Priced from the plan as it stands, not the coach's start, and sorted: with few leaving and new
  // clients at a lower rate, fewer leaving moves it more than one more client a month does.
  const other = { adds: 4, churnPct: 3, rate: 120 };
  const fromOther = runOf(BASE, other).rows[12].netCents;
  const otherWant = [
    ['more', { ...other, adds: 5 }], ['keep', { ...other, churnPct: 0 }], ['price', { ...other, rate: 140 }],
  ].map(([key, o]) => [key, Math.round(runOf(BASE, o).rows[12].netCents - fromOther)]).sort((a, b) => b[1] - a[1]);
  assert.equal(otherWant[0][0], 'keep', 'the fixture puts fewer leaving first');
  assert.deepEqual(B.dbzLevers(BASE, other).map((l) => [l.key, l.deltaCents]), otherWant);
  // No one leaving: no "fewer leaving" lever.
  assert.deepEqual(B.dbzLevers(BASE, { ...plan, churnPct: 0 }).map((l) => l.key).sort(), ['more', 'price']);
  const applied = [];
  const m = await mount(React.createElement(B.DbzLeversCard, { model: B.dbzPlanModel(BASE, null), onApply: (o) => applied.push(o) }));
  assert.equal(m.div.querySelector('section').getAttribute('data-dash-lift'), '2');
  const rows = [...m.div.querySelectorAll('[data-dbz-lever]')];
  assert.deepEqual(rows.map((r) => r.getAttribute('data-dbz-lever')), want.map((w) => w.key));
  assert.match(rows[0].textContent, new RegExp('^\\+' + esc(money(want[0].cents)) + '.*Moves it most'));
  assert.deepEqual(filled(m.div).map((f) => f.textContent), ['Apply'], 'one filled control, on the top lever');
  assert.equal(rows[0].contains(filled(m.div)[0]), true);
  assert.equal(m.div.querySelectorAll('button button').length, 0, 'no nested buttons');
  await click(rows[1]);
  assert.deepEqual(applied, [want[1].o]);
  // Said once the page hands back the plan with the lever in it.
  await m.rerender(React.createElement(B.DbzLeversCard, { model: B.dbzPlanModel(BASE, applied[0]), onApply: (o) => applied.push(o) }));
  assert.match(m.text(), /Applied: fewer leaving\./);
  await m.unmount();
});

test('where it levels off: the forecast\'s steady net and clients, short of the goal or clearing it, and the edge cases', async () => {
  const start = CF.planStart(BASE);
  const model = B.dbzPlanModel(BASE, null);
  const f = runOf(BASE, start);
  assert.deepEqual(model.steady, { clients: f.steadyClients, netCents: f.steadyNetCents });
  const m = await mount(React.createElement(B.DbzLevelCard, { model }));
  const goal = start.goal * 100;
  const clears = f.steadyNetCents >= goal;
  assert.match(m.text(), new RegExp('^Where it levels off' + (clears ? 'Clears goal' : 'Short of goal') + esc(money(f.steadyNetCents)) + ' /moat about ' + Math.round(f.steadyClients) + ' clients, ' + esc(money(Math.abs(f.steadyNetCents - goal))) + (clears ? ' over' : ' short of') + ' the ' + esc(money(goal)) + ' goal'));
  await m.unmount();
  for (const [plan, re] of [[{ adds: 2, churnPct: 0, rate: 180 }, /doesn't level off: it keeps climbing/], [{ adds: 0, churnPct: 5, rate: 180 }, /With no new clients, the plan winds down/]]) {
    const x = await mount(React.createElement(B.DbzLevelCard, { model: B.dbzPlanModel(BASE, plan) }));
    assert.match(x.text(), re);
    assert.equal(dollars(x.text()), false);
    await x.unmount();
  }
});

test('on the page, a tapped lever moves the scenario\'s slider and the level, which flips to "Clears goal"; ↺ puts the coach\'s numbers back', async () => {
  const { m } = await page({ source: 'demo', section: 'plan' }, answer(401, { error: 'x' }));
  const base = B.dbzPlanBase({ live: false });
  const start = CF.planStart(base);
  const steady = runOf(base, start);
  assert.ok(steady.steadyNetCents < start.goal * 100, 'the preview plateaus short of its goal');
  assert.match(cardText(m, 'level'), /Short of goal/);
  const slider = () => Number(m.div.querySelector('[data-card="scenario"] input[type=range]').value);
  assert.equal(slider(), start.adds);
  const top = m.div.querySelector('[data-card="levers"] [data-dbz-lever]');
  assert.equal(top.getAttribute('data-dbz-lever'), 'more', 'one more client a month moves the preview most');
  await click(top);
  assert.equal(slider(), CF.round1(start.adds + 1), 'the lever moved the scenario\'s slider');
  const after = runOf(base, { ...start, adds: CF.round1(start.adds + 1) });
  assert.match(cardText(m, 'scenario'), new RegExp(esc(money(after.rows[12].netCents)) + ' /mowith your changes · ' + esc(money(steady.rows[12].netCents)) + ' at today\'s pace'));
  assert.ok(after.steadyNetCents >= start.goal * 100);
  assert.match(cardText(m, 'level'), /^Where it levels offClears goal/);
  // The levers now price from the plan as it stands.
  assert.match(cardText(m, 'levers'), new RegExp(esc(CF.round1(start.adds + 1).toFixed(1)) + ' → '));
  assert.match(cardText(m, 'levers'), /Applied: one more new client a month\./);
  const back = [...m.div.querySelectorAll('[data-card="scenario"] button')].find((b) => /Back to my numbers/.test(b.textContent));
  await click(back);
  assert.equal(slider(), start.adds);
  assert.doesNotMatch(cardText(m, 'levers'), /Applied:/, 'the levers no longer say a lever is applied once the plan is the coach\'s own again');
  assert.match(cardText(m, 'level'), /Short of goal/);
  // A slider moves the plan for all three cards too.
  await setValue(m.div.querySelector('[data-card="scenario"] input[type=range]'), 5);
  assert.match(cardText(m, 'levers'), /5\.0 → 6\.0 a month/);
  await m.unmount();
});

// ── 4. Growth ─────────────────────────────────────────────────────────────────
test('the funnel is drawn to scale, prints each step\'s rate, and names the leak and the healthy step', async () => {
  const demo = B.dbzFunnelSteps({ views: 1240, consults90: 40, signed90: 14 }, 'sample');
  assert.deepEqual(demo.steps.map((s) => [s.from + '-' + s.to, Math.round(s.rate * 10) / 10, s.mark]), [['views-consults', 3.2, 'leak'], ['consults-signed', 35, 'good']]);
  const m = await mount(React.createElement(B.DbzFunnelCard, { model: demo }));
  assert.match(m.text(), /Profile views1,240↓ 3\.2%of profile views book a consultThe leakConsults · 90 days40↓ 35%of consults sign · benchmark ~30%GoodSigned from Shape · 90 days14/);
  // To scale against the views: 40 and 14 are two bars, not one floor.
  assert.deepEqual([...m.div.querySelectorAll('[data-dbz-bar]')].map((b) => b.getAttribute('data-dbz-bar')), ['100', '3.2', '1.1']);
  // And drawn at that width: no floor that makes 40 and 14 one bar.
  assert.deepEqual([...m.div.querySelectorAll('[data-dbz-bar]')].map((b) => parseFloat(b.style.width).toFixed(1)), [100, 40 / 12.4, 14 / 12.4].map((w) => w.toFixed(1)));
  await m.unmount();
  // The preview's funnel is Today's own.
  assert.deepEqual(B.dbzFunnelModel({ preview: true }).stages.map((s) => s.v), [T.DASH_DEMO_FUNNEL.views, T.DASH_DEMO_FUNNEL.consults90, T.DASH_DEMO_FUNNEL.signed90]);
  // Views aren't tracked (live today): the scale is the consults, and a step over its benchmark is no leak.
  const live = B.dbzFunnelSteps({ views: null, consults90: 20, signed90: 8 }, 'ready');
  assert.deepEqual(live.steps.map((s) => s.mark), [null, 'good']);
  const lm = await mount(React.createElement(B.DbzFunnelCard, { model: live }));
  assert.match(lm.text(), /Profile viewsnot tracked yet↓ —/);
  assert.match(lm.text(), /Profile views aren't tracked yet, so the first step can't be measured\./);
  assert.doesNotMatch(lm.text(), /The leak/);
  assert.deepEqual([...lm.div.querySelectorAll('[data-dbz-bar]')].map((b) => b.getAttribute('data-dbz-bar')), ['100', '40']);
  await lm.unmount();
  // Below the benchmark: the leak, even alone.
  assert.deepEqual(B.dbzFunnelSteps({ views: null, consults90: 20, signed90: 4 }, 'ready').steps.map((s) => s.mark), [null, 'leak']);
  // A lone step with no benchmark is not called a leak.
  assert.deepEqual(B.dbzFunnelSteps({ views: 1000, consults90: 20, signed90: null }, 'ready').steps.map((s) => s.mark), [null, null]);
  // More signed than consulted: no rate, said.
  const over = B.dbzFunnelSteps({ views: null, consults90: 3, signed90: 5 }, 'ready');
  assert.deepEqual([over.steps[1].rate, over.steps[1].why], [null, 'over']);
  const om = await mount(React.createElement(B.DbzFunnelCard, { model: over }));
  assert.match(om.text(), /More signed than booked a consult, so that step has no rate/);
  await om.unmount();
  const um = await mount(React.createElement(B.DbzFunnelCard, { model: B.dbzFunnelSteps({ views: null, consults90: null, signed90: 4 }, 'ready') }));
  assert.match(um.text(), /Your consults couldn't be read just now\./);
  await um.unmount();
  // States: the feed still out, the feed failed, a live feed without a funnel.
  assert.equal(B.dbzFunnelModel({ preview: false, live: null, waiting: true }).state, 'loading');
  assert.equal(B.dbzFunnelModel({ preview: false, live: null, waiting: false }).state, 'unread');
  assert.equal(B.dbzFunnelModel({ preview: false, live: { kind: 'live', funnel: null }, waiting: false }).state, 'unread');
});

test('the profile link beside the funnel: the board\'s one filled control, copied, or said when it can\'t be', async () => {
  const calls = [];
  window.shapeDb = { getSession: async () => ({ user: { id: 'coach-uid' } }), client: { rpc: async (fn, args) => { calls.push([fn, args]); return { data: 'tok-1', error: null }; } } };
  try {
    const m = await mount(React.createElement(B.DbzProfileLinkCard, { preview: false, role: 'nutritionist', providerId: 4, pending: false }));
    await settle();
    assert.deepEqual(calls, [['create_coach_referral_link', { p_provider_role: 'nutritionist', p_provider_id: 4 }]]);
    assert.equal(m.div.querySelector('section').getAttribute('data-dash-lift'), '2');
    assert.match(m.text(), /Clients who join through your own link pay no Shape fee: you keep your full rate\./);
    assert.match(m.text(), /MemberProfile\.html\?u=coach-uid&ref=tok-1&role=nutritionist/);
    const btn = filled(m.div);
    assert.deepEqual(btn.map((b) => b.tagName + ':' + b.textContent), ['BUTTON:Copy profile link']);
    // The page reads the global navigator (Node's own here, not jsdom's window.navigator).
    const wrote = [];
    const had = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { wrote.push(t); } } });
    try { await click(btn[0]); await settle(); } finally { if (had) Object.defineProperty(globalThis.navigator, 'clipboard', had); else delete globalThis.navigator.clipboard; }
    assert.deepEqual(wrote, ['https://theshapecommunity.com/newdesign/MemberProfile.html?u=coach-uid&ref=tok-1&role=nutritionist']);
    assert.match(m.text(), /Copied ✓/);
    await m.unmount();
    // The link couldn't be made: said, with no button that does nothing.
    window.shapeDb.client.rpc = async () => ({ data: null, error: { message: 'x' } });
    const bad = await mount(React.createElement(B.DbzProfileLinkCard, { preview: false, role: 'trainer', providerId: 4, pending: false }));
    await settle();
    assert.match(bad.text(), /Your link couldn't be made just now/);
    assert.equal(bad.div.querySelectorAll('button').length, 0);
    await bad.unmount();
  } finally { delete window.shapeDb; }
  // The analytics (which carry the listing id) still out: making it; the preview: a sample, disabled.
  const wait = await mount(React.createElement(B.DbzProfileLinkCard, { preview: false, role: 'trainer', providerId: undefined, pending: true }));
  assert.match(wait.text(), /Making your link…/);
  await wait.unmount();
  const s = await mount(React.createElement(B.DbzProfileLinkCard, { preview: true, role: 'trainer', providerId: null, pending: false }));
  assert.equal(s.div.querySelector('button') == null, true, 'the preview copies nobody\'s link');
  assert.equal(s.div.querySelector('[aria-disabled="true"]').textContent, 'Copy profile link');
  await s.unmount();
});

test('where clients come from: one bar of brought, found on Shape and Shape\'s fee, at each row\'s stored fee, with tier marks', async () => {
  const rows = [
    { name: 'Ada', clientId: 'a', kind: 'subscription', feeBps: 0, priceCents: 20000, plans: 1, mixedFees: false },
    { name: 'Ben', clientId: 'b', kind: 'subscription', feeBps: 1500, priceCents: 18000, plans: 1, mixedFees: false },
    { name: 'Cy', clientId: 'c', kind: 'subscription', feeBps: 1250, priceCents: 16000, plans: 1, mixedFees: false },
    { name: 'Dee', clientId: 'd', kind: 'subscription', feeBps: 0, priceCents: 24000, plans: 2, mixedFees: true },
    { name: 'Eve', clientId: 'e', kind: 'subscription', feeBps: 1500, priceCents: null, plans: 1, mixedFees: false },
    { name: 'Pia', clientId: 'p', kind: 'purchase', feeBps: 1500, priceCents: 9000 },
  ];
  const s = B.dbzOriginSplit(rows);
  assert.deepEqual([s.count, s.brought.length, s.shape.length, s.unsplit, s.broughtCents, s.shapeNetCents, s.feeCents], [5, 1, 2, 2, 20000, 15300 + 14000, 2700 + 2000]);
  assert.equal(s.totalCents, 20000 + 18000 + 16000, 'what the split clients pay, a purchase not among them');
  const clients = [{ profile: { id: 'a', name: 'Ada' }, rankPoints: 6900 }, { profile: { id: 'b', name: 'Ben' }, rankPoints: null }];
  const m = await mount(React.createElement(B.DbzOriginSplitCard, { model: s, clients }));
  // The header counts the clients in the split, at what they pay.
  assert.match(m.text(), new RegExp('^Where clients come from3 clients · ' + esc(money(54000)) + ' a month'));
  assert.match(m.text(), new RegExp('Brought by you1 client · no fee' + esc(money(20000)) + '/moFound you on Shape2 clients · yours after the fee' + esc(money(29300)) + '/moShape\'s fee'));
  assert.match(m.text(), /2 clients aren't in the split: a price that couldn't be read, or plans at different fees\./);
  assert.deepEqual([...m.div.querySelectorAll('[data-dbz-split]')].map((x) => x.getAttribute('data-dbz-split')), ['brought', 'shape', 'fee']);
  // Each client's tier mark, in their group: a known tier, and a hollow mark for one unknown.
  const marks = (k) => [...m.div.querySelectorAll('[data-dbz-split-row="' + k + '"] .sh-tier-mark, [data-dbz-split-row="' + k + '"] [data-tier-unknown]')].map((x) => x.getAttribute('data-tier') || 'unknown');
  assert.deepEqual(marks('brought'), [ShapeClientColors.clientTier(6900).key]);
  assert.deepEqual(marks('shape'), ['unknown', 'unknown']);
  // A partial split says how many it left out.
  assert.equal(m.div.querySelector('[data-dbz-origin-partial]') != null, true);
  await m.unmount();
  // The preview: its roster, whose fees net to its book.
  const demo = B.dbzOriginSplit(B.dbzDemoOrigin());
  const book = ROSTER.reduce((a, c) => ({ gross: a.gross + c.payments.mrrCents, net: a.net + c.payments.mrrCents - c.payments.feeCents }), { gross: 0, net: 0 });
  assert.deepEqual([demo.count, demo.totalCents, demo.broughtCents + demo.shapeNetCents], [ROSTER.length, book.gross, book.net]);
  // Every price unread is no figure at all, never "$0".
  const none = [{ name: 'Eve', clientId: 'e', kind: 'subscription', feeBps: 1500, priceCents: null, plans: 1, mixedFees: false }, { name: 'Dee', clientId: 'd', kind: 'subscription', feeBps: 0, priceCents: 24000, plans: 2, mixedFees: true }];
  for (const [rowsIn, want] of [[undefined, /Reading where your clients came from…/], [null, /Couldn't read where your clients came from just now/], [[], /No clients yet\./], [none, /^Where clients come fromCouldn't split what your 2 clients pay just now: a price that couldn't be read, or plans at different fees\.$/]]) {
    const x = await mount(React.createElement(B.DbzOriginSplitCard, { model: B.dbzOriginSplit(rowsIn), clients: [] }));
    assert.match(x.text(), want);
    assert.equal(dollars(x.text()), false);
    await x.unmount();
  }
});

test('the waiting list: members and what they\'d bring at the listing price, and "Reopen my listing" when it is full', async () => {
  const m = await mount(React.createElement(B.DbzWaitlistCard, { preview: false, waiting: 3, rateCents: 18000, priceNote: null, capacity: { effective: true }, role: 'trainer', onReopened: () => {} }));
  assert.match(m.text(), new RegExp('^Waiting list3 membersabout ' + esc(money(CF.earn({ clients: 3, priceCents: 18000, byoShare: 0 }).netCents)) + ' a month if they all join at \\$180, after Shape\'s fee'));
  assert.equal(money(CF.earn({ clients: 3, priceCents: 18000, byoShare: 0 }).netCents), '$459');
  const posts = [];
  let reopened = 0;
  await m.rerender(React.createElement(B.DbzWaitlistCard, { preview: false, waiting: 3, rateCents: 18000, priceNote: null, capacity: { effective: true }, role: 'trainer', onReopened: () => { reopened += 1; } }));
  globalThis.fetch = window.fetch = async (url, init) => { posts.push([url, init.method, JSON.parse(init.body)]); return { ok: true, json: async () => ({ ok: true, listing: {} }) }; };
  const btn = [...m.div.querySelectorAll('button')];
  assert.deepEqual(btn.map((b) => b.textContent), ['Reopen my listing']);
  assert.equal(filled(m.div).length, 0, 'an outline action: Growth\'s filled one is the link');
  await click(btn[0]);
  await settle();
  assert.deepEqual(posts, [['/api/coach/capacity', 'POST', { role: 'trainer', atCapacity: false }]]);
  assert.equal(reopened, 1);
  assert.match(m.text(), /Your listing is open again, and the people waiting are told you have room\./);
  await m.unmount();
  // A reopening that fails is said, and the button stays.
  globalThis.fetch = window.fetch = async () => ({ ok: false, json: async () => ({ error: 'x' }) });
  const f = await mount(React.createElement(B.DbzWaitlistCard, { preview: false, waiting: 1, rateCents: 18000, capacity: { effective: true }, role: 'trainer' }));
  await click(f.div.querySelector('button'));
  await settle();
  assert.match(f.text(), /1 member.*Couldn't reopen your listing just now\. Try again, or reopen it on your Profile\./);
  await f.unmount();
  // Open already: no action. Price unread: said instead of a figure. The preview: a disabled sample.
  const open = await mount(React.createElement(B.DbzWaitlistCard, { preview: false, waiting: 2, rateCents: null, priceNote: 'Couldn\'t read your listing price just now, so they aren\'t valued here.', capacity: { effective: false }, role: 'trainer' }));
  assert.match(open.text(), /2 membersCouldn't read your listing price just now, so they aren't valued here\.Your listing is open, so they can subscribe now\./);
  assert.equal(open.div.querySelectorAll('button').length, 0);
  await open.unmount();
  const pv = await mount(React.createElement(B.DbzWaitlistCard, { preview: true, waiting: undefined, rateCents: 18000, capacity: undefined, role: 'trainer' }));
  assert.match(pv.text(), /3 members.*\$459/);
  assert.equal(pv.div.querySelector('button') == null, true);
  assert.equal(pv.div.querySelector('[aria-disabled="true"]').textContent, 'Reopen my listing');
  await pv.unmount();
  for (const [waiting, re] of [[undefined, /Reading your waiting list…/], [null, /Your waiting list couldn't be read just now\./], [0, /No one is waiting\./]]) {
    const x = await mount(React.createElement(B.DbzWaitlistCard, { preview: false, waiting, rateCents: 18000, capacity: { effective: true }, role: 'trainer' }));
    assert.match(x.text(), re);
    assert.equal(x.div.querySelectorAll('button').length, 0);
    await x.unmount();
  }
});

test('on the page, the waiting list reads the capacity route, and reopening sends this role and drops the action', async () => {
  const posts = [];
  const { m } = await page({ source: 'live', section: 'growth' }, liveFetch(liveAnalytics(), { capacity: { listings: [{ role: 'trainer', waiting: 3, effective: true }, { role: 'nutritionist', waiting: 9, effective: false }] }, posts }));
  assert.match(cardText(m, 'waitlist'), /3 members.*\$459.*Reopen my listing/);
  await click(m.div.querySelector('[data-card="waitlist"] button'));
  await settle();
  assert.deepEqual(posts, [{ role: 'trainer', atCapacity: false }]);
  assert.match(cardText(m, 'waitlist'), /Your listing is open again/);
  assert.equal(m.div.querySelectorAll('[data-card="waitlist"] button').length, 0);
  await m.unmount();
});

// ── 5. Retention ──────────────────────────────────────────────────────────────
test('who might leave: the engine\'s "Needs you" set at what they net, Lift 2, and one filled "Message" to the first', async () => {
  messages.length = 0;
  const triage = DashSignals.getTriageFeed('trainer', ROSTER);
  const need = DashSignals.coachNeeds(triage);
  const model = B.dbzLeaveModel({ triage, clientsState: 'ready' });
  const net = (c) => c.payments.mrrCents - c.payments.feeCents;
  assert.deepEqual(model.rows.map((r) => r.name), need.now.map((r) => r.client.profile.name));
  assert.equal(model.totalCents, need.now.reduce((s, r) => s + net(r.client), 0));
  assert.equal(model.week, need.week.length);
  const m = await mount(React.createElement(B.DbzLeaveCard, { model, role: 'trainer' }));
  assert.equal(m.div.querySelector('section').getAttribute('data-dash-lift'), '2');
  const first = need.now[0].client.profile;
  assert.match(m.text(), new RegExp('^Who might leave, first' + esc(money(model.totalCents)) + ' a month at stake' + need.now.length + ' clients show the signals that come before a client leaves\\.' + esc(first.name) + 'Needs you' + esc(need.now[0].lead.reason)));
  assert.deepEqual(filled(m.div).map((b) => b.textContent), ['Message ' + first.name.split(' ')[0]]);
  await click(filled(m.div)[0]);
  assert.deepEqual(messages, [{ name: first.name, role: 'trainer', draft: null, id: first.id }]);
  // Each name beside its tier mark, in the card's ink, never the tier's colour.
  const marks = [...m.div.querySelectorAll('[data-dbz-leave-row]')].map((r) => (r.querySelector('.sh-tier-mark') || { getAttribute: () => 'none' }).getAttribute('data-tier'));
  assert.deepEqual(marks, need.now.map((r) => ShapeClientColors.clientTier(r.client.rankPoints).key));
  assert.equal([...m.div.querySelectorAll('[data-dbz-leave-row] a, [data-dbz-leave-row] span')].some((s) => s.textContent === first.name && s.style.color && s.style.color !== 'var(--sh-ink, #f2ede4)'), false, 'a name in a tier colour');
  assert.match(m.text(), new RegExp(need.week.length + ' more to watch this week, on Today\\.'));
  await m.unmount();
});

test('who might leave names only real reads: a progress read that failed or is loading is counted apart, an unread roster names no one', async () => {
  const live = ROSTER.map((c) => ({ ...c, profile: { ...c.profile }, payments: { ...c.payments }, progressRead: { state: 'ready' } }));
  const need = DashSignals.coachNeeds(DashSignals.getTriageFeed('trainer', live)).now.map((r) => r.client.profile.name);
  assert.ok(need.length >= 3, 'the fixture needs three at risk');
  const [failedName, loadingName] = need;
  live.find((c) => c.profile.name === failedName).progressRead = { state: 'unavailable' };
  live.find((c) => c.profile.name === loadingName).progressRead = { state: 'loading' };
  // One more on the list has no plan: they can't leave one.
  const dropIn = { ...live.find((c) => c.profile.name === need[2]) };
  dropIn.payments = { ...dropIn.payments, onPlan: false };
  live[live.findIndex((c) => c.profile.name === need[2])] = dropIn;
  const model = B.dbzLeaveModel({ triage: DashSignals.getTriageFeed('trainer', live), clientsState: 'ready' });
  assert.deepEqual(model.rows.map((r) => r.name).filter((n) => [failedName, loadingName, need[2]].includes(n)), []);
  assert.deepEqual([model.unread, model.pending], [1, 1]);
  const m = await mount(React.createElement(B.DbzLeaveCard, { model, role: 'trainer' }));
  assert.match(m.text(), /1 client's progress couldn't be read, so they aren't counted\. 1 client's progress is still loading\./);
  assert.doesNotMatch(m.text(), new RegExp(esc(failedName) + '|' + esc(loadingName)));
  await m.unmount();
  // A roster that wasn't read (the demo fallback): no one named, said as unread; still loading: said so.
  assert.equal(B.dbzLeaveModel({ triage: DashSignals.getTriageFeed('trainer', ROSTER), clientsState: 'unread' }).state, 'unread');
  assert.equal(B.dbzLeaveModel({ triage: [], clientsState: 'loading' }).state, 'loading');
  // An unread net makes the total a floor; none read is no total, never "$0".
  const firstAtRisk = need[0];
  const one = ROSTER.map((c) => (c.profile.name === firstAtRisk ? { ...c, payments: { ...c.payments, mrrCents: null, feeCents: null } } : c));
  const oneModel = B.dbzLeaveModel({ triage: DashSignals.getTriageFeed('trainer', one), clientsState: 'ready' });
  const floor = await mount(React.createElement(B.DbzLeaveCard, { model: oneModel, role: 'trainer' }));
  assert.match(floor.text(), new RegExp('^Who might leave, firstat least ' + esc(money(oneModel.totalCents)) + ' a month at stake'));
  assert.match(floor.text(), new RegExp(esc(firstAtRisk) + 'Needs you[^$]*—'), 'the unread net prints a dash');
  await floor.unmount();
  const unknown = ROSTER.map((c) => ({ ...c, payments: { ...c.payments, mrrCents: null, feeCents: null } }));
  const u = await mount(React.createElement(B.DbzLeaveCard, { model: B.dbzLeaveModel({ triage: DashSignals.getTriageFeed('trainer', unknown), clientsState: 'ready' }), role: 'trainer' }));
  assert.match(u.text(), /^Who might leave, firstwhat they net couldn't be read/);
  assert.equal(dollars(u.text()), false);
  await u.unmount();
  // Nobody needs the coach over a whole read: said in full; over a partial one, only for what was read.
  const calm = await mount(React.createElement(B.DbzLeaveCard, { model: B.dbzLeaveModel({ triage: [], clientsState: 'ready' }), role: 'trainer' }));
  assert.equal(calm.text(), "Who might leave, firstNo one looks likely to leave right now: no client's signals need you.");
  await calm.unmount();
});

test('what a client is worth: about N months × the net a client = the figure, with DbzLifetimeZone\'s states', async () => {
  const lt = CF.lifetime({ netPerClientCents: BASE.mrrNetCents / BASE.clients, churn: PACE.churn });
  const m = await mount(React.createElement(B.DbzWorthCard, { model: B.dbzWorthModel(BASE) }));
  assert.equal(m.text(), 'What a client is worth' + money(lt.valueCents) + 'About ' + Math.round(lt.months) + ' months × ' + money(BASE.mrrNetCents / BASE.clients) + ' net = ' + money(lt.valueCents)
    + 'From 8% of clients leaving a month over the last 3 months, and ' + money(BASE.mrrNetCents / BASE.clients) + ' net a client a month.');
  await m.unmount();
  for (const [base, re] of [
    [{ state: 'loading' }, /^What a client is worthReading your history…$/],
    [{ state: 'unread' }, /Couldn't read your subscriptions just now/],
    [{ ...BASE, pace: { adds: null, churn: null, unread: true } }, /Couldn't read your subscription history just now/],
    [{ ...BASE, pace: { ...PACE, churn: null } }, /This fills in after a month with clients/],
    [{ ...BASE, pace: { ...PACE, churn: 0 } }, /No one has left over the last 3 months, so there isn't an average stay to measure yet\./],
  ]) {
    const x = await mount(React.createElement(B.DbzWorthCard, { model: B.dbzWorthModel(base) }));
    assert.match(x.text(), re);
    assert.equal(dollars(x.text()), false);
    await x.unmount();
  }
});

test('how long they stay: today\'s clients on one line by tenure, each with their tier mark, and the average stay on it', async () => {
  const NOW = Date.parse('2026-11-08T12:00:00Z');
  const day = 86400000;
  const iso = (d) => new Date(NOW - d * day).toISOString();
  const clients = [
    { profile: { id: 'a', name: 'Avery Stone' }, rankPoints: 6900, payments: { joinedAt: iso(400), onPlan: true } },
    { profile: { id: 'b', name: 'Blair Fox' }, rankPoints: null, payments: { joinedAt: iso(5), onPlan: true } },
    { profile: { id: 'c', name: 'Casey Hale' }, rankPoints: 900, payments: { joinedAt: iso(100), onPlan: true } },
    { profile: { id: 'd', name: 'Drop In' }, rankPoints: 100, payments: { joinedAt: iso(50), onPlan: false } },
    { profile: { id: 'e', name: 'No Date' }, rankPoints: 100, payments: { joinedAt: null, onPlan: true } },
  ];
  const t = B.dbzTenureModel({ clients, state: 'ready', now: NOW });
  assert.deepEqual(t.dots.map((d) => d.name), ['Blair Fox', 'Casey Hale', 'Avery Stone'], 'newest first, a drop-in and an unread date off the line');
  assert.deepEqual([t.unknown, t.scaleMo, Math.round(t.medianDays)], [1, 18, 100]);
  assert.deepEqual([B.dbzTenureWords(5), B.dbzTenureWords(100), B.dbzTenureWords(400), B.dbzTenureWords(800)], ['5 days', '3 months', '13 months', '2.2 years']);
  const worth = { state: 'ready', months: 9 };
  const m = await mount(React.createElement(B.DbzTenureCard, { model: t, worth }));
  assert.equal(m.div.querySelector('section').getAttribute('data-dash-lift'), '0', 'a list rests');
  assert.match(m.text(), /^How long they stay3 clients · median 3 months/);
  assert.match(m.text(), /Longest: Avery Stone, 13 months\. Newest: Blair Fox, 5 days\. The green line is the average stay, about 9 months\./);
  assert.match(m.text(), /1 client's start date couldn't be read, so they aren't on the line\./);
  const dots = [...m.div.querySelectorAll('[data-dbz-tenure-dot]')];
  assert.deepEqual(dots.map((d) => (d.querySelector('.sh-tier-mark') ? d.querySelector('.sh-tier-mark').getAttribute('data-tier') : 'unknown')), ['unknown', ShapeClientColors.clientTier(900).key, ShapeClientColors.clientTier(6900).key]);
  assert.match(dots[2].firstElementChild.getAttribute('title'), /^Avery Stone · 13 months · /);
  // Each at its tenure on an 18-month line (jsdom rounds the calc's percentage).
  assert.deepEqual(dots.map((d) => Number(/calc\(([\d.]+)%/.exec(d.style.left)[1]).toFixed(2)), [5, 100, 400].map((days) => ((days / (18 * 30.4)) * 100).toFixed(2)));
  assert.equal(m.div.querySelector('[data-dbz-tenure-avg]') != null, true);
  assert.match(m.div.querySelector('[role="img"]').getAttribute('aria-label'), /Blair Fox 5 days; Casey Hale 3 months; Avery Stone 13 months\./);
  await m.unmount();
  for (const [model, re] of [[{ state: 'loading' }, /Reading your clients…/], [{ state: 'unread' }, /Your clients couldn't be read just now/], [B.dbzTenureModel({ clients: [], state: 'ready', now: NOW }), /No clients on a plan yet\./]]) {
    const x = await mount(React.createElement(B.DbzTenureCard, { model, worth: null }));
    assert.match(x.text(), re);
    await x.unmount();
  }
});

test('why people left, grouped by reason, with one follow-up; with no reasons on record, says the survey hasn\'t shipped', async () => {
  assert.deepEqual(B.DBZ_DEMO_CHURN.map((r) => B.dbzReasonGroup(r.reason).label), ['Life changed', 'Hit their goal', 'Life changed']);
  assert.deepEqual([null, '', 'Too expensive for me', 'Wanted an in-person coach', 'Something else'].map((r) => B.dbzReasonGroup(r).key), ['none', 'none', 'cost', 'fit', 'other']);
  const now = Date.now();
  const pace = { ...PACE, from: now - 91 * 86400000 };
  const r = B.dbzReasonsModel({ live: false, churn: B.DBZ_DEMO_CHURN, pace, now });
  assert.deepEqual(r.groups.map((g) => g.label + ' ' + g.n), ['Life changed 2', 'Hit their goal 1']);
  assert.equal(r.follow.name, 'Devon Sharpe');
  const m = await mount(React.createElement(B.DbzReasonsCard, { model: r }));
  assert.equal(m.div.querySelector('section').getAttribute('data-dash-lift'), '0', 'a list rests');
  assert.match(m.text(), /^Why people left3 left over the last 3 months−\$560 a monthLife changed2Hit their goal1Follow up: Devon Sharpe said “Budget — coming back in the fall”\.$/);
  await m.unmount();
  // Live, the routes send no reason until the cancellation survey ships.
  const rows = [
    { name: 'Ana', clientId: 'a', departed: true, startedAt: new Date(now - 200 * 86400000).toISOString(), endedAt: new Date(now - 10 * 86400000).toISOString(), priceCents: 18000, reason: null },
    { name: 'Bo', clientId: 'b', departed: true, startedAt: new Date(now - 300 * 86400000).toISOString(), endedAt: new Date(now - 20 * 86400000).toISOString(), priceCents: 16000, reason: null },
  ];
  const live = await mount(React.createElement(B.DbzReasonsCard, { model: B.dbzReasonsModel({ live: true, churn: rows, pace, now }) }));
  assert.match(live.text(), /2 left over the last 3 months−\$340 a monthNo reason given2No one gave a reason: exit reasons collect once the cancellation survey ships\./);
  assert.doesNotMatch(live.text(), /Follow up/);
  await live.unmount();
  // Nobody inside the window: none left, and nothing grouped.
  const old = B.dbzReasonsModel({ live: true, churn: [{ ...rows[0], endedAt: new Date(now - 200 * 86400000).toISOString() }], pace, now });
  assert.deepEqual([old.count, old.groups.length], [0, 0]);
  for (const [churn, re] of [[undefined, /Reading who left…/], [null, /Couldn't read your cancellations just now/], [[], /No one has left yet\./], [[{ ...rows[0], departed: null }], /Couldn't check who still has a plan with you just now/]]) {
    const x = await mount(React.createElement(B.DbzReasonsCard, { model: B.dbzReasonsModel({ live: true, churn, pace, now }) }));
    assert.match(x.text(), re);
    assert.equal(dollars(x.text()), false);
    await x.unmount();
  }
});

test('on the Retention board, who left and what a client is worth read one window, the pace\'s', async () => {
  const day = 86400000;
  const now = Date.now();
  const churn = [{ name: 'Day ninety', clientId: 'n', departed: true, startedAt: new Date(now - 300 * day).toISOString(), endedAt: new Date(now - 90.5 * day).toISOString(), priceCents: 18000, reason: 'Moved away' }];
  const { m } = await page({ source: 'live', section: 'retention' }, liveFetch(liveAnalytics({ churn })));
  assert.match(cardText(m, 'worth'), /From [\d.]+% of clients leaving a month over the last 3 months/);
  assert.match(cardText(m, 'reasons'), /1 left over the last 3 months−\$180 a monthLife changed1/);
  await m.unmount();
});

// ── 6. The rules on every board ───────────────────────────────────────────────
test('each board has one filled control, no nested buttons, and its one thing to act on at Lift 2', async () => {
  const want = { plan: ['Apply'], growth: ['Copy profile link'], retention: ['Message ' + DashSignals.coachNeeds(DashSignals.getTriageFeed('trainer', ROSTER)).now[0].client.profile.name.split(' ')[0]] };
  const lift2 = { plan: ['levers'], growth: ['link'], retention: ['leave'] };
  for (const section of Object.keys(BOARDS)) {
    const { m } = await page({ source: 'demo', section }, answer(401, { error: 'x' }));
    assert.deepEqual(filled(m.div).map((b) => b.textContent), want[section], section);
    assert.equal(m.div.querySelectorAll('button button, a button, button a').length, 0, section + ': a nested control');
    assert.deepEqual([...m.div.querySelectorAll('[data-card] > section[data-dash-lift="2"]')].map((s) => s.parentElement.getAttribute('data-card')), lift2[section], section);
    await m.unmount();
  }
});
