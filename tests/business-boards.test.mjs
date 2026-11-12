// Coach dashboard step 4a (the owner's build order, 2026-11-08): Business · Overview and Business ·
// Money as widget boards, and Today's leftovers. These mount the SHIPPED components (dashBusiness.jsx,
// dashToday.jsx, dashGrid.jsx, trainerDashboard.jsx) in jsdom with the real forecast, signals, zone
// and tier modules, and read what a coach reads:
//   1. the default boards: Overview's five and Money's four, each on its own tab key, and the cards
//      that moved to the catalogue;
//   2. live versus sample: the preview's figures only under the band, never on a coach's failed page;
//   3. unread versus empty: a read that failed is said, a measured none is said in words;
//   4. money at risk, the Overview's one filled button, at Lift 2;
//   5. when do I get paid: the date, available and the hold, why available is $0, the month track;
//   6. renewals explain the fee, row by row;
//   7. the payout history and its CSV;
//   8. Stripe as a real widget;
//   9. the catalogue's groups on every coach board;
//  10. At a glance's ⚙, and the roster logging trend;
//  11. Stripe arrival dates on their bank day, instants on the account's clock;
//  12. the sidebar's money card: the next payout, in Today's states.
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
const E = require_('../public/newdesign/dashExport.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
const { resolveGridLayout } = await import('../public/newdesign/dashboardLayout.mjs');
Object.assign(window, { CoachForecast: CF, ShapeZone, ShapeClientColors, DashExport: E });
Object.assign(globalThis, { DashSignals, serif: 'serif' });

// dashToday.jsx, whole, as the page loads it: the money format, the payout read and its card states,
// the tier marks, the client links, the glance picker and the logging trend.
const TODAY = read('dashToday.jsx');
const T = new Function('React', 'window', 'DashSignals', 'useDashUnits', 'useRememberedChoice', 'useRememberedSlots', 'dashMilestonesIn', 'useDashFocusRefresh', 'serif', 'sans', 'mono', 'INK', 'TEAL_BRIGHT',
  compile(TODAY) + ';return { dashMoney, dashPayoutView, dashPayoutAmount, dashPayoutWhen, dashPayoutRead, dashPayoutSidebarCard, useDashNextPayout, dashSharedNextPayout, DashClientGem, dashRecordTier, dashTierMark, dashClientHref, dashTabHref, dashLinkedTab, dashGlanceCells, dashGlanceSettings, dashKpiSettings, dashLogTrend, DashLogTrendPanel, DASH_GLANCE_DEFAULT };')(
  React, window, DashSignals, () => null, (s, k, a, f) => React.useState(f), (s, keys, allowed, defaults) => React.useState(defaults), (ms) => ms, () => {}, 'serif', 'sans', 'monospace', '#f2ede4', '#2ee0c4');
const messages = [];
Object.assign(globalThis, {
  dashMoney: T.dashMoney, dashPayoutView: T.dashPayoutView, dashPayoutAmount: T.dashPayoutAmount, dashPayoutWhen: T.dashPayoutWhen,
  DashClientGem: T.DashClientGem, dashRecordTier: T.dashRecordTier, dashClientHref: T.dashClientHref, dashTabHref: T.dashTabHref, dashLinkedTab: T.dashLinkedTab,
  dashMessageClient: (name, role, draft, id) => messages.push({ name, role, draft, id }),
});
const money = T.dashMoney;

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const B = await loadRealModule(ND('dashBusiness.jsx'), {
  appendExports: 'export { dbzBankDay, dbzDate, dbzDay, dbzNetModel, DbzNetCard, dbzAtRisk, DbzAtRiskCard, dbzPayoutModel, DbzNextPayoutCard, dbzClientTiles, DbzClientTilesCard, dbzStripeState, dbzGetPaidModel, DbzGetPaidCard, dbzMonthTrack, DbzStripeCard, dbzPayoutHistory, DbzPayoutHistoryCard, dbzFeeLabel, DbzRenewalsZone, DbzPayoutsZone, dbzPaceModel, DbzPaceCard, DbzRevenueByClientZone, dbzDemoRenewals, DBZ_PAYOUTS_READ };',
});

// dashGrid.jsx: the catalogue, its groups and the ⚙.
const GRID = read('dashGrid.jsx');
const G = new Function('React', 'ReactDOM', 'window', compile(GRID) + ';return { DgCatalog, dgCatalogRows, dgCatalogGroups, DgCardSettings, dgSettingGroups, DG_CATALOG_GROUPS };')(React, ReactDOM, window);

async function mount(el) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await React.act(async () => root.render(el));
  return { div, text: () => div.textContent.replace(/\s+/g, ' ').trim(), rerender: (next) => React.act(async () => root.render(next)), unmount: () => React.act(async () => { root.unmount(); div.remove(); }) };
}
const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el) => React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const dollars = (t) => /\$\d/.test(t);
const ROSTER = DashSignals.buildMockClients(new Date());
const ROSTER_NAMES = new RegExp(ROSTER.map((c) => c.profile.name.replace(/[.$]/g, '\\$&')).join('|'));
const withZone = async (zone, fn) => { ShapeZone.setAccountZone(zone); try { return await fn(); } finally { ShapeZone.clearAccountZone(); } };

// The whole page, with its neighbours stubbed: the band, the sidebar card, the funnel, and a DashGrid
// that records the boards it was handed and draws every card each declares.
function stubPage({ source, today = null, section, clients, asks = null }) {
  const seen = { card: null, boards: {} };
  Object.assign(globalThis, {
    useDashboard: () => ({ today, source, clients: clients !== undefined ? clients : source === 'demo' ? DashSignals.buildMockClients(new Date()) : [] }),
    useRememberedChoices: () => null,
    useRememberedChoice: () => React.useState(section),
    DashPage: ({ children, payoutCard }) => { seen.card = payoutCard; return React.createElement(React.Fragment, null, children); },
    DashSegmented: () => null, DashExportButton: ({ live }) => React.createElement('i', null, live ? 'EXPORT ON' : 'EXPORT OFF'),
    DashFunnelPanel: ({ live }) => React.createElement('i', null, live ? 'LIVE FUNNEL' : 'DEMO FUNNEL'),
    DashDemoBand: () => React.createElement('b', null, 'PREVIEW'),
    DashGrid: (props) => {
      seen.boards[props.tab] = props;
      return React.createElement(React.Fragment, null, props.widgets.filter((w) => !w.empty).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render())));
    },
    trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: { demo: 'trainer' }, nutriPayoutCard: { demo: 'nutritionist' },
    useDashUnits: () => ({ measure: (value, unit) => ({ value, unit }) }),
    // Today's payout read: recorded when a test asks (`asks`), absent otherwise, as on a page without it.
    useDashNextPayout: asks ? (role, live) => { asks.push(role + ':' + live); return live ? { state: 'unread' } : null; } : undefined,
  });
  return seen;
}
const answer = (status, body) => () => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
async function page(opts, fetcher) {
  const seen = stubPage(opts);
  globalThis.fetch = window.fetch = fetcher;
  const m = await mount(React.createElement(window.CoachBusinessPage, { role: opts.role || 'trainer' }));
  await settle();
  return { m, seen };
}
const cardText = (m, key) => (m.div.querySelector('[data-card="' + key + '"]') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();

// ── 1. The default boards ─────────────────────────────────────────────────────
test('Overview and Money are boards on their own tab keys: five and four default cards, the rest in the catalogue', async () => {
  const { m, seen } = await page({ source: 'demo', section: 'overview' }, answer(401, { error: 'x' }));
  const ov = seen.boards['business-overview'];
  assert.equal(!!ov, true, 'no Overview board');
  assert.equal(ov.role, 'trainer');
  assert.deepEqual(ov.widgets.filter((w) => !w.optional).map((w) => w.key), ['net', 'atrisk', 'pace', 'payout', 'clients']);
  // Two thirds beside one third, as on Today, then the clients across the board.
  assert.deepEqual(resolveGridLayout(null, ov.widgets).visible.map((v) => v.key + ':' + v.w), ['net:4', 'atrisk:8', 'pace:8', 'payout:4', 'clients:12']);
  // What the Overview carried, and what the review moved off it, can be added back.
  assert.deepEqual(ov.widgets.filter((w) => w.optional).map((w) => w.key), ['trajectory', 'lifetime', 'renewals', 'funnel', 'revenue', 'retention']);
  for (const w of ov.widgets) assert.equal(typeof w.title === 'string' && typeof w.blurb === 'string' && w.blurb.length > 10, true, w.key + ' has no title or blurb');
  // The first thing on the board is money: the net a month, beside what's at risk.
  assert.match(cardText(m, 'net'), /^Net a month\$[\d,]+ \/mo/);
  await m.unmount();
  const mo = await page({ source: 'demo', section: 'money' }, answer(401, { error: 'x' }));
  const money_ = mo.seen.boards['business-money'];
  assert.deepEqual(money_.widgets.filter((w) => !w.optional).map((w) => w.key), ['getpaid', 'stripe', 'renewals', 'history']);
  assert.deepEqual(resolveGridLayout(null, money_.widgets).visible.map((v) => v.key + ':' + v.w), ['getpaid:8', 'stripe:4', 'renewals:8', 'history:4']);
  assert.deepEqual(money_.widgets.filter((w) => w.optional).map((w) => w.key), ['netweeks', 'summary']);
  assert.equal(Object.keys(mo.seen.boards).join(), 'business-money', 'one board a section');
  await mo.m.unmount();
  // The tab keys are new: nothing reads or writes an old Business layout, and Today's stays Today's.
  const src = read('dashBusiness.jsx');
  assert.match(src, /<DashGrid key="business-overview" role=\{role\} tab="business-overview" widgets=\{overviewWidgets\} \/>/);
  assert.match(src, /<DashGrid key="business-money" role=\{role\} tab="business-money" widgets=\{moneyWidgets\} \/>/);
  for (const f of ['dashGrid.jsx', 'dashboardLayout.mjs', 'dashBusiness.jsx']) assert.doesNotMatch(read(f), /\[["']business["']\]|\.business\b|tab="business"/, f + ' reads an old Business layout');
});

// Plan, Growth and Retention are boards since step 4b: their cards are pinned in
// tests/business-boards-4b.test.mjs. Here, only that each is its own board, on its own tab key.
test('Plan, Growth and Retention are boards too (step 4b), each on its own tab key', async () => {
  for (const section of ['plan', 'growth', 'retention']) {
    const { m, seen } = await page({ source: 'demo', section }, answer(401, { error: 'x' }));
    assert.deepEqual(Object.keys(seen.boards), ['business-' + section], section);
    await m.unmount();
  }
});

// ── 2. Live versus sample ─────────────────────────────────────────────────────
test('the preview draws its own sample on both boards, under the band; a coach whose reads failed never sees it', async () => {
  for (const section of ['overview', 'money']) {
    const asked = [];
    const demo = await page({ source: 'demo', section, asks: asked }, answer(401, { error: 'x' }));
    const t = demo.m.text();
    assert.match(t, /^PREVIEW/, section);
    assert.match(t, ROSTER_NAMES, section + ': the preview names its roster');
    assert.equal(dollars(t), true, section + ': the preview has figures');
    assert.deepEqual(demo.seen.card, { demo: 'trainer' });
    // The preview never asks Stripe for a payout (Today's read is handed live false throughout).
    assert.equal(asked.length > 0 && asked.every((a) => a === 'trainer:false'), true, section + ': ' + asked.join());
    await demo.m.unmount();
    // Signed in, every read failed: useDashboard's "unread" (no clients), and, as the second witness,
    // the demo roster it resolved for an outage before tests/dash-roster-unread.test.mjs's contract.
    for (const source of ['unread', 'demo']) for (const fail of [answer(500, { error: 'x' }), answer(503, { error: 'x' }), () => Promise.reject(new TypeError('Failed to fetch'))]) {
      const coachAsks = [];
      const out = await page({ source, section, asks: coachAsks }, (url) => (url.startsWith('/api/trainer/analytics') ? fail() : answer(500, {})()));
      assert.equal(coachAsks[coachAsks.length - 1], 'trainer:true', section + ', ' + source + ': a coach whose analytics failed is still asked for their payout');
      const u = out.m.text();
      assert.doesNotMatch(u, /PREVIEW|DEMO FUNNEL/, section);
      assert.doesNotMatch(u, ROSTER_NAMES, section + ': the sample roster on a coach\'s page');
      assert.equal(dollars(u), false, section + ': a figure on a page that read none: ' + u.slice(0, 300));
      assert.doesNotMatch(u, /Reading |loads? with/, section + ': a failed read is not still loading');
      await out.m.unmount();
    }
  }
});

test('a signed-in coach whose roster read live sees their own clients, never the sample\'s', async () => {
  const mine = [
    { profile: { id: '11111111-1111-4111-8111-111111111111', name: 'Avery Stone' }, rankPoints: 6900, payments: { mrrCents: 20000, feeCents: 3000, onPlan: true } },
    { profile: { id: '22222222-2222-4222-8222-222222222222', name: 'Blair Fox', isNew: true }, rankPoints: null, payments: { mrrCents: 15000, feeCents: 0, onPlan: true } },
    { profile: { id: '33333333-3333-4333-8333-333333333333', name: 'Casey Hale' }, rankPoints: 900, payments: { mrrCents: null, feeCents: null, paymentRetrying: true, onPlan: true } },
    { profile: { id: '44444444-4444-4444-8444-444444444444', name: 'Drop In' }, rankPoints: 100, payments: { mrrCents: 0, onPlan: false } },
  ];
  const { m } = await page({ source: 'live', section: 'overview', clients: mine }, () => new Promise(() => {}));
  const tiles = cardText(m, 'clients');
  assert.match(tiles, /3 on a plan/);
  assert.match(tiles, /Avery Stone\$200\/mo.*Blair Fox\$150\/moNew.*Casey Haleprice couldn't be readPayment retrying/);
  assert.doesNotMatch(tiles, /Drop In/, 'a roster row with no plan is not a client tile');
  assert.doesNotMatch(tiles, ROSTER_NAMES);
  // The tier is a mark beside the name, never a colour on it; an unknown tier is a hollow mark.
  const marks = [...m.div.querySelectorAll('[data-card="clients"] [data-dbz-tile]')].map((t) => (t.querySelector('.sh-tier-mark') ? t.querySelector('.sh-tier-mark').getAttribute('data-tier') : t.querySelector('[data-tier-unknown]') ? 'unknown' : 'none'));
  assert.deepEqual(marks, [ShapeClientColors.clientTier(6900).key, 'unknown', ShapeClientColors.clientTier(900).key]);
  assert.equal([...m.div.querySelectorAll('[data-card="clients"] [data-dbz-tile] span')].some((s) => /Avery/.test(s.textContent) && s.style.color && s.style.color !== 'var(--sh-ink, #f2ede4)'), false, 'a name in a tier colour');
  // A tile opens the client's page, inside the shell.
  assert.equal(m.div.querySelector('[data-card="clients"] a[data-dbz-tile]') != null, true);
  // Retrying is money at risk, at what they net (unknown here: "at least").
  assert.match(cardText(m, 'atrisk'), /Casey HalePayment retrying—/);
  await m.unmount();
});

// ── 3. Unread versus empty ────────────────────────────────────────────────────
test('Net a month: loading, unread and a figure are three things, and null never prints $0', () => {
  assert.equal(B.dbzNetModel({ preview: false, extra: null, extraFailed: false }).state, 'loading');
  assert.equal(B.dbzNetModel({ preview: false, extra: null, extraFailed: true }).state, 'unread');
  assert.equal(B.dbzNetModel({ preview: false, extra: { trajectory: null, metrics: { activeClients: null, mrrNetCents: null } } }).state, 'unread');
  const zero = B.dbzNetModel({ preview: false, extra: { trajectory: null, metrics: { activeClients: 0, mrrNetCents: 0, mrrGrossCents: 0 } } });
  assert.deepEqual([zero.state, zero.netCents, zero.clients], ['ready', 0, 0], 'no clients is a measured $0');
  const weeks = [{ weekOf: '2026-11-02', active: 13, mrrNetCents: 195300, mrrGrossCents: 228000 }];
  const ready = B.dbzNetModel({ preview: false, extra: { trajectory: { weeks }, metrics: { activeClients: 12, mrrNetCents: 1, mrrGrossCents: 1 } } });
  assert.deepEqual([ready.clients, ready.netCents, ready.grossCents], [13, 195300, 228000], 'the trajectory\'s today, as every tab reads it');
  assert.equal(B.dbzNetModel({ preview: true }).state, 'sample');
  // A latest week whose net couldn't be read is unread, never a figure.
  assert.equal(B.dbzNetModel({ preview: false, extra: { trajectory: { weeks: [{ weekOf: '2026-11-02', active: 4, mrrNetCents: null, mrrGrossCents: null }] } } }).state, 'unread');
});

test('money at risk: cancellations and retried payments, one row a client, and every partial read said', () => {
  const ren = [
    { name: 'Sam Rivera', clientId: 'a', dueAt: '2026-11-12T12:00:00Z', netCents: 15300, ending: true },
    { name: 'Sam Rivera', clientId: 'a', dueAt: '2026-11-10T12:00:00Z', netCents: 5000, ending: true },
    { name: 'Lee Park', clientId: 'b', dueAt: '2026-11-09T12:00:00Z', netCents: 18000, ending: false },
    { name: 'Uma Cole', clientId: 'c', dueAt: '2026-11-11T12:00:00Z', netCents: 9000, ending: null },
  ];
  const retry = [{ profile: { id: 'a', name: 'Sam Rivera' }, payments: { mrrCents: 18000, feeCents: 2700, paymentRetrying: true } }, { profile: { id: 'd', name: 'Dee Moss' }, payments: { mrrCents: 16000, feeCents: null, status: 'past_due' } }];
  const r = B.dbzAtRisk({ renewals: ren, clients: retry, clientsState: 'ready' });
  assert.equal(r.state, 'ready');
  // Sam: two plans ending, summed, the soonest day kept; and their retried payment doesn't count twice.
  assert.deepEqual(r.rows.map((x) => [x.kind, x.name, x.cents]), [['cancelling', 'Sam Rivera', 20300], ['retrying', 'Dee Moss', Math.round(16000 * (1 - CF.FEE_RATE))]]);
  assert.equal(r.rows[0].at, '2026-11-10T12:00:00Z');
  assert.equal(r.totalCents, 20300 + 13600);
  assert.equal(r.unchecked, 1, 'a renewal Stripe could not be asked about is said, not counted as safe');
  // Each half on its own: still loading, failed, and nothing at all.
  assert.equal(B.dbzAtRisk({ renewals: undefined, clients: [], clientsState: 'loading' }).state, 'loading');
  assert.equal(B.dbzAtRisk({ renewals: null, clients: [], clientsState: 'unread' }).state, 'unread');
  const half = B.dbzAtRisk({ renewals: null, clients: retry, clientsState: 'ready' });
  assert.deepEqual([half.state, half.renewState, half.rows.length], ['ready', 'unread', 2]);
  // A roster that wasn't read is no evidence: its rows (the demo fallback's) are never listed.
  assert.deepEqual(B.dbzAtRisk({ renewals: [], clients: retry, clientsState: 'unread' }).rows, []);
  const none = B.dbzAtRisk({ renewals: [], clients: [], clientsState: 'ready' });
  assert.deepEqual([none.state, none.rows.length, none.totalCents], ['ready', 0, 0]);
});

// ── 4. Money at risk: Lift 2, and the Overview's only filled button ───────────
test('money at risk stands at Lift 2 with one filled button, "Message Sam", and says what it could not read', async () => {
  messages.length = 0;
  const ren = [{ name: 'Sam Rivera', clientId: '55555555-5555-4555-8555-555555555555', dueAt: '2026-11-12T12:00:00Z', netCents: 15300, ending: true }, { name: 'Ro Vale', clientId: 'x', dueAt: '2026-11-13T12:00:00Z', netCents: null, ending: true }];
  const model = B.dbzAtRisk({ renewals: ren, clients: [], clientsState: 'unread' });
  const m = await mount(React.createElement(B.DbzAtRiskCard, { model, clients: [], role: 'trainer' }));
  assert.equal(m.div.querySelector('section').getAttribute('data-dash-lift'), '2');
  const buttons = [...m.div.querySelectorAll('button')];
  assert.deepEqual(buttons.map((b) => b.textContent), ['Message Sam']);
  await click(buttons[0]);
  assert.deepEqual(messages, [{ name: 'Sam Rivera', role: 'trainer', draft: null, id: '55555555-5555-4555-8555-555555555555' }]);
  assert.match(m.text(), /at least −\$153 a month/, 'a row whose money was unread makes the total a floor');
  assert.match(m.text(), /Cancelling · ends /);
  assert.match(m.text(), /Payments Stripe is retrying couldn't be read\./);
  const unchecked = await mount(React.createElement(B.DbzAtRiskCard, { model: B.dbzAtRisk({ renewals: [{ name: 'Uma', clientId: 'u', dueAt: '2026-11-11T12:00:00Z', netCents: 9000, ending: null }], clients: [], clientsState: 'ready' }), clients: [], role: 'trainer' }));
  assert.match(unchecked.text(), /Nothing at risk in what could be read\.1 renewal this week couldn't be checked with Stripe, so a cancellation there wouldn't show here\./);
  await unchecked.unmount();
  await m.unmount();
  // Nothing at risk is said in full only over a whole read.
  const whole = await mount(React.createElement(B.DbzAtRiskCard, { model: B.dbzAtRisk({ renewals: [], clients: [], clientsState: 'ready' }), clients: [], role: 'trainer' }));
  assert.equal(whole.text(), 'Money at riskNothing at risk this week: no plan ends in the next 7 days and no payment is retrying.');
  await whole.unmount();
  const part = await mount(React.createElement(B.DbzAtRiskCard, { model: B.dbzAtRisk({ renewals: [], clients: [], clientsState: 'unread' }), clients: [], role: 'trainer' }));
  assert.match(part.text(), /Nothing at risk in what could be read\.Payments Stripe is retrying couldn't be read\./);
  await part.unmount();
  // On the whole Overview, it is the only filled control.
  const { m: o } = await page({ source: 'demo', section: 'overview' }, answer(401, { error: 'x' }));
  const filled = [...o.div.querySelectorAll('button, a')].filter((b) => /var\(--sh-accent, #2ee0c4\)/.test(b.style.background));
  assert.deepEqual(filled.map((b) => b.textContent), ['Message ' + B.dbzDemoRenewals().find((r) => r.ending).name.split(' ')[0]]);
  await o.unmount();
});

// ── 5. When do I get paid? ────────────────────────────────────────────────────
const NOW = Date.parse('2026-11-08T18:00:00Z');
test('when do I get paid: the date in large type, available and on hold, and why available is $0', () => withZone('UTC', async () => {
  const stripe = (o) => ({ connected: true, status: 'active', balanceCents: 0, pendingCents: 41200, schedule: { interval: 'daily', delayDays: 7 }, payouts: [], ...o });
  const read = { state: 'next', next: { amountCents: 48312, currency: 'usd', arrivalDate: Date.UTC(2026, 10, 12), status: 'in_transit' } };
  const m = B.dbzGetPaidModel({ preview: false, read, stripe: stripe(), renewals: [], now: NOW });
  assert.equal(m.head.date, ShapeZone.formatDate(Date.parse('2026-11-12T12:00:00Z'), { zone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }));
  assert.deepEqual([m.available, m.hold, m.holdWords], [0, 41200, '7-day hold']);
  assert.equal(m.why, "Available is $0 because new charges wait out Stripe's 7-day hold before they can be paid out.");
  assert.equal(B.dbzGetPaidModel({ preview: false, read, stripe: stripe({ pendingCents: 0 }), renewals: [], now: NOW }).why, "Available is $0 because it's already on its way to your bank: the payout above.");
  assert.equal(B.dbzGetPaidModel({ preview: false, read: { state: 'none' }, stripe: stripe({ pendingCents: 0 }), renewals: [], now: NOW }).why, 'Available is $0: no charges have cleared yet.');
  assert.equal(B.dbzGetPaidModel({ preview: false, read: { state: 'none' }, stripe: stripe({ pendingCents: null }), renewals: [], now: NOW }).why, "Available is $0, and what's in the hold couldn't be read.");
  assert.equal(B.dbzGetPaidModel({ preview: false, read, stripe: stripe({ balanceCents: 5000 }), renewals: [], now: NOW }).why, null, 'no reason is owed for money that is there');
  // Unread is not $0: a failed balance read prints a dash and says so.
  const unread = B.dbzGetPaidModel({ preview: false, read, stripe: stripe({ balanceCents: null }), renewals: [], now: NOW });
  assert.deepEqual([unread.available, unread.why], [null, null]);
  const card = await mount(React.createElement(B.DbzGetPaidCard, { model: unread }));
  assert.match(card.text(), /Available now—couldn't be read just now/);
  await card.unmount();
  // Connected means payable: a linked account mid-onboarding is set-up, not a $0 balance.
  for (const [s, want] of [[undefined, 'loading'], [null, 'unread'], [{ connected: false }, 'setup'], [{ connected: true, status: 'pending' }, 'setup'], [{ connected: true, error: true, status: 'active' }, 'error'], [stripe(), 'ready']]) {
    assert.equal(B.dbzStripeState({ preview: false, stripe: s }), want, JSON.stringify(s));
  }
  assert.equal(B.dbzStripeState({ preview: true, stripe: undefined }), 'sample');
}));

test('the month as one track: each renewal on its day on the account\'s clock, the payout, and the 7 days read', () => withZone('America/Los_Angeles', async () => {
  // 10:00 on 8 November in Los Angeles.
  const ren = [
    { name: 'A', dueAt: '2026-11-10T06:00:00Z', ending: false },   // still 9 Nov in Los Angeles
    { name: 'B', dueAt: '2026-11-12T20:00:00Z', ending: true },
    { name: 'C', dueAt: '2026-11-14T20:00:00Z', ending: null },
    { name: 'D', dueAt: '2026-12-01T20:00:00Z', ending: false },   // next month
  ];
  const t = B.dbzMonthTrack({ now: NOW, renewals: ren, payoutDay: { y: 2026, mo: 11, d: 30 } });
  assert.deepEqual([t.y, t.mo, t.daysIn, t.today, t.readTo, t.payoutDay, t.later], [2026, 11, 30, 8, 15, 30, 1]);
  assert.deepEqual(t.marks.map((x) => x.day + ':' + x.kind), ['9:renews', '12:cancelled', '14:unchecked']);
  const card = await mount(React.createElement(B.DbzGetPaidCard, { model: B.dbzGetPaidModel({ preview: false, read: { state: 'none' }, stripe: { connected: true, status: 'active', balanceCents: 100, pendingCents: 0, payouts: [] }, renewals: ren, now: NOW }) }));
  assert.match(card.text(), /Renewals are read 7 days ahead, so the track shows those through Nov 15\. 1 more renews next month\./);
  assert.match(card.div.querySelector('svg[role="img"]').getAttribute('aria-label'), /Nov 8 is today; A renews Nov 9; B ends Nov 12; C is due, not checked, Nov 14/);
  await card.unmount();
  // Renewals not read: none on the track, and said.
  assert.equal(B.dbzMonthTrack({ now: NOW, renewals: null }).renewals, 'unread');
}));

// ── 6. Renewals explain the fee ───────────────────────────────────────────────
test('every renewal says why Shape takes its fee or none; an ending plan gets Message', async () => {
  assert.equal(B.dbzFeeLabel({ feeBps: 0 }), 'no Shape fee', 'a renewal carries the fee, not the origin: 0% says only that (Codex on #2722)');
  assert.equal(B.dbzFeeLabel({ feeBps: 1500 }), 'through Shape · 15% fee');
  assert.equal(B.dbzFeeLabel({ feeBps: 1250 }), 'through Shape · 12.5% fee', 'the stored rate, never a constant');
  assert.equal(B.dbzFeeLabel({ feeBps: null, priceCents: 18000, netCents: 15300 }), 'through Shape · 15% fee', 'a route before the field: read from what the row nets');
  assert.equal(B.dbzFeeLabel({ priceCents: 18000, netCents: 18000 }), 'no Shape fee');
  assert.equal(B.dbzFeeLabel({ feeBps: null, priceCents: null, netCents: null }), "fee couldn't be read");
  messages.length = 0;
  const rows = [
    { name: 'Ana Reyes', clientId: 'a', dueAt: '2026-11-10T12:00:00Z', priceCents: 18000, netCents: 15300, feeBps: 1500, ending: false },
    { name: 'Ben K', clientId: 'b', dueAt: '2026-11-11T12:00:00Z', priceCents: 18000, netCents: 18000, feeBps: 0, ending: true },
  ];
  const m = await mount(React.createElement(B.DbzRenewalsZone, { live: true, renewals: rows, clients: [], role: 'nutritionist' }));
  assert.deepEqual([...m.div.querySelectorAll('[data-dbz-fee]')].map((e) => e.textContent), ['through Shape · 15% fee', 'no Shape fee']);
  assert.deepEqual([...m.div.querySelectorAll('[data-dbz-renewal]')].map((e) => e.getAttribute('data-dbz-renewal') + ':' + e.querySelectorAll('button').length), ['renews:0', 'cancelled:1']);
  await click(m.div.querySelector('[data-dbz-renewal="cancelled"] button'));
  assert.deepEqual(messages, [{ name: 'Ben K', role: 'nutritionist', draft: null, id: 'b' }]);
  assert.match(m.text(), /Net to you, after Shape's fee: 15% on a client who signed up through Shape, none on your existing clients \(or an invite or link from before November 12, 2026\)\./);
  await m.unmount();
  // The routes send the stored fee on each row (coach-renewals.mjs).
  const { renewalRows } = await import('../src/lib/coach-renewals.mjs');
  const out = renewalRows([{ client_id: 'x', price_cents: 18000, fee_bps: 0, current_period_end: '2026-11-10T00:00:00Z', stripe_subscription_id: 's' }, { client_id: 'y', price_cents: 18000, fee_bps: null, current_period_end: '2026-11-10T00:00:00Z' }], { names: new Map(), flags: new Map([['s', false]]), cutCents: (p, b) => Math.round(p * (1 - (b == null ? 1500 : b) / 10000)) });
  assert.deepEqual(out.map((r) => r.feeBps), [0, null]);
  // The preview's renewals carry their roster client and fee, as the routes' rows do.
  for (const r of B.dbzDemoRenewals()) assert.equal(typeof r.clientId === 'string' && Number.isFinite(r.feeBps), true, r.name);
});

// ── 7. The payout history ─────────────────────────────────────────────────────
test('payout history: the next payout and four months, per currency, and a full list is only Stripe\'s latest 12', () => withZone('UTC', async () => {
  const p = (id, y, mo, d, cents, status = 'paid', currency = 'usd') => ({ id, amountCents: cents, currency, status, arrivalDate: Date.UTC(y, mo - 1, d) });
  const few = [p('a', 2026, 11, 3, 20000), p('b', 2026, 10, 28, 15000), p('c', 2026, 10, 14, 9000, 'failed'), p('d', 2026, 9, 30, 4000), p('e', 2026, 9, 2, 800, 'paid', 'jpy')];
  const h = B.dbzPayoutHistory(few, NOW);
  assert.equal(h.capped, false);
  assert.deepEqual(h.months.map((x) => [x.label, x.count, x.failed, x.cover, x.totals.map((t) => t.currency + t.cents).join('+')]), [
    ['November so far', 1, 0, 'full', 'usd20000'],
    ['October', 1, 1, 'full', 'usd15000'],
    ['September', 2, 0, 'full', 'usd4000+jpy800'],
    ['August', 0, 0, 'full', ''],
  ]);
  const head = { state: 'next', date: 'Thursday, November 12', amount: T.dashPayoutAmount(48312, 'usd'), status: 'pending' };
  const card = await mount(React.createElement(B.DbzPayoutHistoryCard, { stripeState: 'ready', head, history: h, exportControl: null }));
  const t = card.text();
  assert.match(t, new RegExp('Next payoutThursday, November 12 · pending' + T.dashPayoutAmount(48312, 'usd').replace(/[$.]/g, '\\$&')));
  assert.match(t, /October1 payout · 1 failed\$150\.00/);
  assert.match(t, /September2 payouts\$40\.00 \+ ¥800/);
  assert.match(t, /AugustNo payouts/, 'a month the read covers with nothing paid is a measured none');
  await card.unmount();
  // Twelve payouts, the oldest on 10 September: August wasn't read, September is a floor.
  const full = Array.from({ length: 12 }, (_, i) => p('f' + i, 2026, 9, 10 + i * 5, 1000));
  const capped = B.dbzPayoutHistory(full, NOW);
  assert.deepEqual(capped.months.map((x) => x.cover), ['full', 'full', 'partial', 'unread']);
  const cc = await mount(React.createElement(B.DbzPayoutHistoryCard, { stripeState: 'ready', head: { state: 'none' }, history: capped, exportControl: null }));
  assert.match(cc.text(), /Augustolder than the 12 payouts Stripe sent—/);
  assert.match(cc.text(), /September5 payoutsat least \$50\.00/);
  assert.match(cc.text(), /Stripe sends your latest 12 payouts; older ones are in your Stripe dashboard\./);
  await cc.unmount();
  assert.equal(B.DBZ_PAYOUTS_READ, 12);
  assert.match(readFileSync(new URL('../src/lib/stripe.ts', import.meta.url), 'utf8'), /stripe\.payouts\.list\(\{ limit: 12 \}/, 'the history\'s cap is the read\'s own');
  // Not read, not set up, Stripe down: each said, never "No payouts".
  for (const [state, re] of [['unread', /Your past payouts couldn't be read just now\./], ['setup', /Your payouts list here once Stripe is set up\./], ['error', /Couldn't reach Stripe just now/], ['loading', /Reading your payouts…/]]) {
    const x = await mount(React.createElement(B.DbzPayoutHistoryCard, { stripeState: state, head: { state: 'unread' }, history: B.dbzPayoutHistory([], NOW), exportControl: null }));
    assert.match(x.text(), re, state);
    assert.doesNotMatch(x.text(), /No payouts/, state);
    await x.unmount();
  }
}));

test('the payouts CSV: each payout\'s bank day, its own currency\'s units, and an unread amount left empty', () => {
  const csv = E.payoutsCsv([
    { id: 'po_1', amountCents: 48312, currency: 'usd', status: 'paid', arrivalDate: Date.UTC(2026, 9, 31) },
    { id: 'po_2', amountCents: 5000, currency: 'jpy', status: 'in_transit', arrivalDate: Date.UTC(2026, 10, 12) },
    { id: 'po_3', amountCents: null, currency: 'eur', status: 'failed', arrivalDate: null },
  ]);
  assert.equal(csv, '﻿Arrival date,Amount,Currency,Status,Payout id\r\n2026-11-12,5000,JPY,in_transit,po_2\r\n2026-10-31,483.12,USD,paid,po_1\r\n,,EUR,failed,po_3\r\n');
  assert.equal(E.payoutMajor(12340, 'kwd'), '12.340');
  // The page builds it from the payouts it read, and only for a coach whose Stripe was read.
  const src = read('dashBusiness.jsx');
  assert.match(src, /<DashExportButton kind="payouts" label="your payouts" live=\{stripeState === "ready" && Array\.isArray\(stripe\.payouts\) && stripe\.payouts\.length > 0\}/);
  assert.match(src, /build=\{\(\) => window\.DashExport\.payoutsCsv\(stripe\.payouts\)\}/);
});

// ── 8. Stripe as a real widget ────────────────────────────────────────────────
test('Stripe is a full-size button and what lives there; not set up, it starts onboarding and says when that fails', async () => {
  const ready = await mount(React.createElement(B.DbzStripeCard, { state: 'ready', stripe: { connected: true, status: 'active', schedule: { interval: 'weekly', weeklyAnchor: 'friday', delayDays: 7 } }, providerId: 7, role: 'trainer' }));
  const a = ready.div.querySelector('a');
  assert.deepEqual([a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.style.width, a.style.minHeight], ['Open your Stripe ↗', 'https://dashboard.stripe.com/', '_blank', '100%', '46px']);
  assert.match(ready.text(), /Receiptsevery charge and refund, per clientStatementsmonthly reports and your tax formsBankthe account your payouts land inSchedulePaid out weekly · Fridays · 7-day rolling delay/);
  await ready.unmount();
  const posts = [];
  globalThis.fetch = window.fetch = async (url, opts) => { posts.push([url, JSON.parse(opts.body)]); return { ok: false, json: async () => ({ error: 'x' }) }; };
  for (const [stripe, label] of [[{ connected: false }, 'Set up payouts →'], [{ connected: true, status: 'pending' }, 'Finish setting up payouts →']]) {
    const s = await mount(React.createElement(B.DbzStripeCard, { state: 'setup', stripe, providerId: 7, role: 'nutritionist' }));
    const btn = s.div.querySelector('button');
    assert.equal(btn.textContent, label);
    await click(btn);
    await settle();
    assert.match(s.text(), /Couldn't open Stripe just now\. Try again in a moment\./, 'a set-up that came back without a link is said');
    await s.unmount();
  }
  assert.deepEqual(posts.map((p) => p[0] + ' ' + p[1].provider_role + ' ' + p[1].provider_id), ['/api/stripe/connect/onboard nutritionist 7', '/api/stripe/connect/onboard nutritionist 7']);
  const sample = await mount(React.createElement(B.DbzStripeCard, { state: 'sample', stripe: null, providerId: null, role: 'trainer' }));
  assert.equal(sample.div.querySelector('a') == null, true, 'the preview links to nobody\'s Stripe');
  assert.equal(sample.div.querySelector('[aria-disabled="true"]').textContent, 'Open your Stripe ↗');
  await sample.unmount();
  for (const [state, re] of [['loading', /Reading your Stripe account…/], ['unread', /Couldn't read whether Stripe is linked just now/], ['error', /Couldn't reach Stripe from here just now/]]) {
    const x = await mount(React.createElement(B.DbzStripeCard, { state, stripe: { connected: true, error: true, status: 'active' }, providerId: 7, role: 'trainer' }));
    assert.match(x.text(), re, state);
    await x.unmount();
  }
  // The old link, 9.5px faint text beside "Your money", is gone.
  assert.doesNotMatch(read('dashBusiness.jsx'), /fontSize: 9\.5, color: DBZ_TEAL, textDecoration: "none", opacity: isLive \? 1 : 0\.6 \}\}>Open your Stripe/);
});

// ── 9. The catalogue's groups ─────────────────────────────────────────────────
const GROUP_KEYS = ['clients', 'schedule', 'money', 'programs'];
function todayWidgets() {
  const pg = TODAY.slice(TODAY.indexOf('function CoachDashboardPage('));
  const arr = pg.slice(pg.indexOf('const gridWidgets = ['), pg.indexOf('\n  ];', pg.indexOf('const gridWidgets = [')));
  return [...arr.matchAll(/\{ key: "([a-z]+)", title: /g)].map((m) => {
    const entry = arr.slice(m.index, arr.indexOf('render:', m.index));
    return { key: m[1], group: (/group: "([a-z]+)"/.exec(entry) || [])[1] || null };
  });
}
test('every coach board\'s catalogue is grouped: Clients, Schedule, Money and Programs', async () => {
  assert.deepEqual(G.DG_CATALOG_GROUPS.map((g) => g[1]), ['Clients', 'Schedule', 'Money', 'Programs']);
  const ws = todayWidgets();
  assert.ok(ws.length >= 27, 'the Today widget list moved — this guard is reading nothing');
  for (const w of ws) assert.equal(GROUP_KEYS.includes(w.group), true, 'Today\'s ' + w.key + ' names no group');
  for (const section of ['overview', 'money']) {
    const { m, seen } = await page({ source: 'demo', section }, answer(401, { error: 'x' }));
    for (const w of Object.values(seen.boards)[0].widgets) assert.equal(GROUP_KEYS.includes(w.group), true, section + ' ' + w.key + ' names no group');
    await m.unmount();
  }
  // The rows carry the group; the groups list on-board cards first, then addable, then empty, in order.
  const rows = G.dgCatalogRows([
    { key: 'a', title: 'A', group: 'money' }, { key: 'b', title: 'B', group: 'clients', optional: true },
    { key: 'c', title: 'C', group: 'clients' }, { key: 'd', title: 'D', group: 'programs', optional: true, empty: true, emptyWhy: 'later' },
    { key: 'e', title: 'E', group: 'odd' },
  ], ['b', 'd']);
  assert.deepEqual(G.dgCatalogGroups(rows).map((g) => g.label + ':' + g.rows.map((r) => r.key).join('')), ['Clients:cb', 'Money:a', 'Programs:d', 'More:e']);
  // A board whose widgets name none (a member's tabs) lists as it always has.
  assert.equal(G.dgCatalogGroups(G.dgCatalogRows([{ key: 'x', title: 'X' }], [])), null);
  const m = await mount(React.createElement(G.DgCatalog, { rows, onAdd: () => {}, onRemove: () => {}, onReset: () => {} }));
  await click(m.div.querySelector('.dash-catalog-btn'));
  const panel = document.querySelector('.dash-widget-catalog');
  assert.deepEqual([...panel.querySelectorAll('[data-dg-group]')].map((g) => g.getAttribute('aria-label') + ':' + [...g.querySelectorAll('[data-dg-row]')].map((r) => r.getAttribute('data-dg-row') + (r.querySelector('button') ? '=' + r.querySelector('button').textContent : '')).join(',')),
    ['Clients:c=Remove,b=＋ Add', 'Money:a=Remove', 'Programs:d', 'More:e=Remove']);
  assert.match(panel.textContent, /later/, 'an empty card says why, with no control');
  await m.unmount();
});

// ── 10. At a glance's ⚙, and the roster logging trend ─────────────────────────
test('At a glance takes a ⚙: three slots from the KPI pool, a pick already shown swaps, compliance reads "Roster logging"', async () => {
  const ctx = { clients: [], queue: [{ state: 'ready' }], role: 'trainer', live: null };
  assert.deepEqual(T.dashGlanceCells('trainer', ctx).map((c) => c.l), ['Programs due', 'Check-ins reviewed', 'Roster logging'], 'the default three');
  assert.deepEqual(T.dashGlanceCells('trainer', ctx, ['mrr', 'compliance', 'due']).map((c) => c.l), ['Monthly recurring', 'Roster logging', 'Programs due']);
  const picked = [];
  const groups = T.dashGlanceSettings(['due', 'reviewed', 'compliance'], 'trainer', (v) => picked.push(v));
  assert.deepEqual(groups.map((g) => g.label), ['First', 'Second', 'Third']);
  assert.equal(groups[0].options.length, DashSignals.DASH_KPI_KEYS.length);
  assert.equal(groups[2].options.find((o) => o.v === 'compliance').label, 'Roster logging');
  assert.equal(G.dgSettingGroups({ settings: groups }).length, 3, 'the card would show no ⚙');
  // Through the gear itself: picking "Check-ins reviewed" for the first slot swaps the two.
  const m = await mount(React.createElement(G.DgCardSettings, { groups }));
  await click(m.div.querySelector('button'));
  const sel = document.body.querySelector('select.dash-setpick-sel');
  sel.value = 'reviewed';
  await React.act(async () => { sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
  assert.deepEqual(picked, [['reviewed', 'due', 'compliance']]);
  await m.unmount();
  // Today wires it, remembered per account and role, three slots of their own.
  const pg = TODAY.slice(TODAY.indexOf('function CoachDashboardPage('));
  assert.match(pg, /const \[glanceChosen, setGlanceKpis\] = useDashGlanceKpis\(prefs, role\);/);
  assert.match(pg, /const glance = dashGlanceCells\(role, kpiCtx, glanceChosen\);/);
  assert.match(pg, /settings: dashGlanceSettings\(glanceChosen, role, setGlanceKpis\) \}/);
  assert.match(TODAY, /useRememberedSlots\(prefs, \[base \+ "0", base \+ "1", base \+ "2"\], DashSignals\.DASH_KPI_KEYS, DASH_GLANCE_DEFAULT\)/);
  assert.match(TODAY, /const base = "kpi:" \+ role \+ ":glance:";/);
});

test('the roster logging trend draws only the days each record holds, and says what it could not read', async () => {
  const rec = (days, from = null, extra = {}) => ({ profile: { id: Math.random().toString(36) }, foodLogDays: { days, from }, ...extra });
  const clients = [
    rec(['2026-11-08', '2026-11-07', '2026-11-02']),
    rec(['2026-11-08'], '2026-11-06'),                                      // its window starts on the 6th
    { profile: { id: 'u' }, progressRead: { state: 'unavailable' } },      // a failed read
    { profile: { id: 'p' }, progressRead: { state: 'loading' } },          // still on its way
    { profile: { id: 's' }, foodLogs: { daysLogged7d: 7, lastLoggedOn: '2026-11-08' } }, // a count only: not read on a live page
  ];
  const t = T.dashLogTrend(clients, { today: '2026-11-08', sample: false });
  assert.deepEqual(t.days.map((d) => d.key.slice(8) + d.dow + ':' + d.logged + '/' + d.read), ['02Mon:1/1', '03Tue:0/1', '04Wed:0/1', '05Thu:0/1', '06Fri:0/2', '07Sat:1/2', '08Sun:2/2']);
  assert.deepEqual([t.held, t.unread, t.pending], [2, 2, 1], 'the count-only record is no day-by-day evidence on a live page');
  // The preview lays its sample's count on the days it ends on.
  const s = T.dashLogTrend([{ foodLogs: { daysLogged7d: 3, lastLoggedOn: '2026-11-07' } }], { today: '2026-11-08', sample: true });
  assert.deepEqual(s.days.map((d) => d.logged), [0, 0, 0, 1, 1, 1, 0]);
  assert.equal(T.dashLogTrend(clients, { today: 'not a day' }), null);
  const m = await mount(React.createElement(T.DashLogTrendPanel, { trend: t }));
  assert.match(m.text(), /Records hold the last 7 days, so the trend starts there\. 2 clients' logs couldn't be read, so they aren't counted\. 1 client's logs are still loading\./);
  assert.match(m.div.querySelector('[role="img"]').getAttribute('aria-label'), /Sun 2 of 2$/);
  await m.unmount();
  // A catalogue card on Today, off until added, empty (so it can't be added) until a record holds a day.
  const w = todayWidgets().find((x) => x.key === 'logtrend');
  assert.deepEqual(w, { key: 'logtrend', group: 'clients' });
  const pg = TODAY.slice(TODAY.indexOf('function CoachDashboardPage('));
  assert.match(pg, /\{ key: "logtrend", title: "Roster logging trend", [^\n]*optional: true, group: "clients", size: "half",\n\s+empty: !rosterUnread && \(!logTrend \|\| logTrend\.held === 0\),/);
  assert.match(pg, /const logTrend = dashLogTrend\(clients, \{ today: [^\n]*, sample \}\);/);
});

// ── 11. Dates on the account's clock, Stripe's arrival on its bank day ─────────
test('a Stripe arrival date prints as its bank day west of Greenwich; a plan\'s end on the account\'s clock', () => withZone('America/Los_Angeles', async () => {
  const nov14 = Date.UTC(2026, 10, 14);   // Stripe: the day's midnight, UTC (13 November, 16:00 in Los Angeles)
  assert.equal(B.dbzBankDay(nov14), ShapeZone.formatDate(Date.parse('2026-11-14T12:00:00Z'), { zone: 'UTC', month: 'short', day: 'numeric' }));
  assert.match(B.dbzBankDay(nov14), /14/);
  assert.equal(B.dbzBankDay(null), '—');
  // At UTC+14 the day's noon in UTC is already the next morning: still the 14th.
  await withZone('Pacific/Kiritimati', async () => assert.match(B.dbzBankDay(nov14), /14/));
  ShapeZone.setAccountZone('America/Los_Angeles');
  const m = await mount(React.createElement(B.DbzPayoutsZone, { live: true, stripe: { connected: true, status: 'active', balanceCents: 0, pendingCents: 0, schedule: null, payouts: [{ id: 'a', amountCents: 52000, status: 'in_transit', arrivalDate: nov14 }] }, providerId: 7, role: 'trainer', metrics: null }));
  assert.match(m.text(), /The next payout, \$520, lands Nov 14\./, m.text());
  assert.match(m.text(), /arrives Nov 14/);
  await m.unmount();
  // A plan's period end is an instant: 04:00 UTC on the 14th is still the 13th in Los Angeles.
  const end = '2026-11-14T04:00:00Z';
  assert.equal(B.dbzDay(end), ShapeZone.formatDate(Date.parse(end), { zone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' }));
  assert.match(B.dbzDay(end), /13/);
  assert.match(B.dbzDate(end), /13/);
  const src = read('dashBusiness.jsx');
  assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ''), /dbzDate\(next\.arrivalDate\)/, 'an arrival date printed as an instant again');
}));

// ── 12. The sidebar's money card ──────────────────────────────────────────────
test('the sidebar\'s card is the next payout in Today\'s states, and the preview keeps its sample', async () => {
  const NOWT = Date.parse('2026-11-08T12:00:00Z');
  await withZone('UTC', async () => {
    const next = T.dashPayoutSidebarCard({ state: 'next', next: { amountCents: 48312, currency: 'usd', arrivalDate: Date.UTC(2026, 10, 9), status: 'pending' } }, 'trainer', NOWT);
    assert.deepEqual(next, { state: 'next', label: 'NEXT PAYOUT', amount: T.dashPayoutAmount(48312, 'usd'), sub: 'arrives tomorrow · USD' });
  });
  assert.deepEqual(T.dashPayoutSidebarCard({ state: 'none' }, 'trainer'), { state: 'none', label: 'NEXT PAYOUT', amount: 'None', sub: 'no payout scheduled right now' });
  assert.deepEqual(T.dashPayoutSidebarCard({ state: 'setup' }, 'nutritionist'), { state: 'setup', label: 'PAYOUTS', amount: 'Not set up', sub: 'set them up in Business →', href: 'NutritionistApp.html#business?section=money' });
  assert.deepEqual(T.dashPayoutSidebarCard(null, 'trainer'), { state: 'loading', label: 'NEXT PAYOUT', amount: '—', sub: 'reading your payouts…' });
  assert.deepEqual(T.dashPayoutSidebarCard({ state: 'unread' }, 'trainer'), { state: 'unread', label: 'NEXT PAYOUT', amount: '—', sub: "couldn't be read just now" });
  for (const s of ['none', 'setup', 'loading', 'unread']) assert.equal(/\d/.test(T.dashPayoutSidebarCard(s === 'loading' ? null : { state: s }, 'trainer').amount), false, s);
  // The rail itself (trainerDashboard.jsx), signed in and signed out.
  const SHELL = read('trainerDashboard.jsx');
  const part = SHELL.slice(SHELL.indexOf('const _dsbCache'), SHELL.indexOf('// The frame every dashboard tab renders inside'));
  // A fresh module a run: the sidebar caches the feed's answer for a minute (_dsbCache).
  const code = compile(part);
  const sidebar = () => new Function('React', 'window', 'TEAL_BRIGHT', 'INK', 'mono', 'serif', 'getComputedStyle', 'useDashNextPayout', 'dashPayoutSidebarCard', code + ';return DashSidebar;')(
    React, window, '#2ee0c4', '#f2ede4', 'monospace', 'serif', window.getComputedStyle, T.useDashNextPayout, T.dashPayoutSidebarCard);
  const nav = [{ label: 'Today', slug: 'today', href: 'TrainerApp.html#today' }];
  const demoCard = { demo: true, label: 'PAYOUT NOV 30', amount: '$449', sub: 'Month to date · in 22 days' };
  const asked = [];
  const run = async (dashJson, payoutBody, navItems = nav) => {
    window.dashJson = dashJson;
    globalThis.fetch = window.fetch = async (url) => { asked.push(url); return { ok: true, status: 200, json: async () => payoutBody }; };
    const m = await mount(React.createElement(sidebar(), { navItems, payoutCard: demoCard }));
    await settle(); await settle();
    const el = m.div.querySelector('.shape-dash-payout');
    const out = { state: el.getAttribute('data-dash-payout'), text: el.textContent };
    await m.unmount();
    return out;
  };
  // Signed out: the sample, and Stripe is never asked.
  const before = asked.length;
  const out = await run(async () => { throw new Error('HTTP 401'); }, null);
  assert.deepEqual(out, { state: null, text: 'PAYOUT NOV 30$449Month to date · in 22 days' });
  assert.equal(asked.length, before, 'the preview asked for a payout');
  // Signed in: Stripe's next payout, and never "payouts connect soon".
  const live = await run(async () => ({ isTrainer: true, kpis: { activeClients: 4, monthlyNetCents: 60000 } }), { isProvider: true, connected: true, next: null });
  assert.deepEqual(live, { state: 'none', text: 'NEXT PAYOUTNoneno payout scheduled right now' });
  assert.equal(asked.slice(-1)[0], '/api/coach/next-payout?role=trainer');
  // Signed in, the dashboard feed failed: still the payout, never the sample.
  // (The other role: reads begun within seconds of each other share one request, dashSharedNextPayout.)
  const unknown = await run(async () => { throw new Error('HTTP 500'); }, { isProvider: true, connected: false }, [{ label: 'Today', slug: 'today', href: 'NutritionistApp.html#today' }]);
  assert.equal(asked.slice(-1)[0], '/api/coach/next-payout?role=nutritionist');
  assert.equal(unknown.state, 'setup');
  assert.doesNotMatch((SHELL + TODAY).replace(/\/\/[^\n]*/g, ''), /payouts connect soon/, 'the old card is back');
});

test('the sidebar and the Money card share one payout request', async () => {
  let n = 0;
  globalThis.fetch = async () => { n += 1; return { ok: true, status: 200, json: async () => ({ isProvider: true, connected: true, next: null }) }; };
  const [a, b] = await Promise.all([T.dashSharedNextPayout('share-check'), T.dashSharedNextPayout('share-check')]);
  assert.deepEqual([a, b, n], [{ state: 'none' }, { state: 'none' }, 1]);
  assert.match(TODAY, /dashSharedNextPayout\(role\)\.then\(\(r\) => \{ if \(on\) setRead\(r\); \}\);/);
});

// ── The Overview's next payout and pace cards ─────────────────────────────────
test('the Overview\'s next payout says each state, and its pace card draws today\'s pace against the goal line', async () => {
  for (const [model, re] of [[{ state: 'none' }, /^Next payoutNo payout scheduled right now\.$/], [{ state: 'loading' }, /Reading your payouts…/], [{ state: 'unread' }, /Your next payout couldn't be read just now\./], [{ state: 'sample', k: 'Nov 30', sub: 'in 22 days' }, /Nov 30in 22 days/]]) {
    const m = await mount(React.createElement(B.DbzNextPayoutCard, { model }));
    assert.match(m.text(), re, model.state);
    await m.unmount();
  }
  let opened = 0;
  const s = await mount(React.createElement(B.DbzNextPayoutCard, { model: { state: 'setup' }, onSetup: () => { opened += 1; } }));
  await click(s.div.querySelector('button'));
  assert.equal(opened, 1, 'set-up opens Money, where Stripe is');
  await s.unmount();
  assert.equal(B.dbzPayoutModel({ preview: false, read: null }).state, 'loading');
  assert.equal(B.dbzPayoutModel({ preview: true, read: { state: 'unread' } }).state, 'sample', 'the preview is never handed a read');
  const PACE = { adds: 2, churn: 0.05, days: 91, fromFirst: false, added: 6, ended: 2, avgActive: 10, unread: false };
  const base = { state: 'ready', clients: 10, mrrNetCents: 150000, mrrGrossCents: 180000, rateCents: 18000, byoShare: 0.2, pace: PACE };
  const pm = B.dbzPaceModel(base);
  const start = CF.planStart(base);
  const f = CF.forecast({ clients: 10, mrrNetCents: 150000, byoShare: 0.2, months: 36, priceCents: start.rate * 100, adds: start.adds, churn: start.churnPct / 100 });
  assert.deepEqual([pm.yearCents, pm.goalCents, pm.reach], [f.rows[12].netCents, start.goal * 100, CF.monthsTo(start.goal * 100, f)]);
  let toPlan = 0;
  const m = await mount(React.createElement(B.DbzPaceCard, { model: pm, onPlan: () => { toPlan += 1; } }));
  assert.match(m.text(), new RegExp('At today\'s pace, you net ' + money(pm.yearCents).replace('$', '\\$') + ' a month in a year\\.'));
  assert.match(m.text(), /The goal line is the Plan's starting goal, half again today's net\./);
  await click([...m.div.querySelectorAll('button')].find((b) => b.textContent === 'Plan it →'));
  assert.equal(toPlan, 1);
  await m.unmount();
  assert.equal(B.dbzPaceModel({ state: 'unread' }).state, 'unread');
});

// Codex, #2633: the Clients pages passed their own "MONTHLY · MRR … payouts connect soon" card, which the
// sidebar keeps (it replaces only the demo literals), so the money card went back to the old line there.
// Every coach page hands the sidebar its demo literal now, and no page carries the old words.
test('every coach page hands the sidebar its demo card; no page says "payouts connect soon"', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../public/newdesign/', import.meta.url);
  for (const [page, lit] of [['trainerClientsPage.jsx', 'trainerPayoutCard'], ['nutritionistClientsPage.jsx', 'nutriPayoutCard']]) {
    const src = readFileSync(new URL(page, dir), 'utf8');
    assert.match(src, new RegExp('payoutCard=\\{' + lit + '\\}'), page + ' passes its own card again');
  }
  const stale = readdirSync(dir).filter((f) => /\.(jsx|js)$/.test(f))
    .filter((f) => /payouts connect soon|label: "MONTHLY · MRR"/.test(readFileSync(new URL(f, dir), 'utf8').replace(/\/\/[^\n]*/g, '')));
  assert.deepEqual(stale, [], 'a page still builds the old money card');
});
