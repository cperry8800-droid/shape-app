// A signed-in coach whose roster read fails is told so, never shown sample people (the owner's rule:
// sample data appears only in the signed-out preview, under the demo band).
//
// useDashboard(role) (dashData.jsx) fell back to its demo whenever /api/{role}/clients failed, a 500 or
// a dropped network as much as a signed-out 401, so every coach page showed the sample's people to a
// real coach. Its contract now, for a coach role:
//   - "demo" only when the roster route answered 401 (signed out, src/lib/coach-roster.ts) or 200 with
//     `[roleKey]: false` (signed in, not a coach of this role): the sample, as before;
//   - "unread" for any other failed roster read (another status, a network error, a throw in the hook
//     after the roster read): no clients, loading false, the day feed as it answered;
//   - a quiet re-read of a live page that fails keeps it live.
// And every coach page treats "unread" as not the preview and not live: no band, no sample person,
// "couldn't be read" (or "—") wherever it would otherwise claim nobody or count a 0, while what it
// reads from its own source (Today's day feed and payout, Schedule's calendar, Business's analytics,
// Goal's goals, Score's score) still shows.
//
// The real modules are mounted in jsdom: dashData.jsx's hook over a scripted server, and Today,
// Clients (both roles), Business, Goal, Score, Schedule and Week over its "unread" answer.
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
// The page-shell globals the coach pages read at render (pageShell.jsx, coachNav.jsx), stubbed.
Object.assign(globalThis, {
  React, ReactDOM, DashSignals,
  serif: 'serif', sans: 'sans-serif', mono: 'monospace', INK: '#f2ede4', PAPER: '#1a1612', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', ink50: 'rgba(0,0,0,.5)',
  ssAlpha: (c, a) => 'rgba(0,0,0,' + a + ')',
  trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: { demo: 'trainer' }, nutriPayoutCard: { demo: 'nutritionist' },
});

// ── The modules ───────────────────────────────────────────────────────────────
// dashData.jsx is compiled once and evaluated afresh for each hook scenario: its read cache is module
// state, and a scenario must not be served the last one's roster.
const DATA_CODE = compile(read('dashData.jsx'));
const freshData = () => new Function('React', 'DashSignals', 'window', 'document',
  DATA_CODE + '\n;return { useDashboard, useCoachWeekReviews, useCoachDoc, useSignedIn, useRememberedChoices, useRememberedChoice, useRememberedSet, useRememberedSlots, dashPlanClientCount, dashUnitsApi, dashUnitPrefs, dashCheckinReviewed, readoutStamp, readoutWeekKey, useWeekClock, dashWeighInDelta };')(React, DashSignals, window, document);
// The pages' copy: its hooks and helpers are window globals, as the coach shells load them (each file
// ends in Object.assign(window, …)); a later module's names are shared the same way.
const D = freshData();
const share = () => { for (const k of Object.keys(window)) if (!(k in globalThis)) { try { globalThis[k] = window[k]; } catch (e) { /* read-only */ } } };
// The names a later file reads but its own window export leaves out, shared as the browser's one global
// scope shares every top-level name.
Object.assign(globalThis, { useCoachWeekReviews: D.useCoachWeekReviews, dashCheckinReviewed: D.dashCheckinReviewed, readoutStamp: D.readoutStamp, readoutWeekKey: D.readoutWeekKey, useWeekClock: D.useWeekClock, dashWeighInDelta: D.dashWeighInDelta });
const T = new Function(compile(read('dashToday.jsx')) + ';return { CoachDashboardPage, DASH_TODAY_ROLES, DashDemoBand, dashRouteParam };')();
globalThis.dashRouteParam = T.dashRouteParam;
share();
const R = new Function(compile(read('dashRoster.jsx')) + ';return { DashRosterTable };')();
share();
const CLIENTS = {
  trainer: new Function(compile(read('trainerClientsPage.jsx')) + ';return TrainerClientsPage;')(),
  nutritionist: new Function(compile(read('nutritionistClientsPage.jsx')) + ';return NutritionistClientsPage;')(),
};
const B = new Function(compile(read('dashBusiness.jsx')) + ';return { CoachBusinessPage, DbzCard, DbzChip, DbzGem, DBZ_FILLED, DBZ_OUTLINE, DBZ_NOTE, DBZ_LBL, DBZ_MONO, DBZ_INK, DBZ_INK50, DBZ_RULE, dbzTodayParts, dbzPartsOf, useDbzChartWidth, dbzClientHref, DbzGoalEarn };')();
share();
Object.assign(globalThis, B);
const C = new Function(compile(read('coachGoalScore.jsx')) + ';return { CoachGoalBoard, CoachScoreBoard };')();
const W = new Function(compile(read('dashWeek.jsx')) + ';return { CoachWeekPage };')();
share();
const units = D.dashUnitsApi(U, D.dashUnitPrefs('Imperial · lb / mi'));

// ── What only the preview draws ───────────────────────────────────────────────
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CAST = DashSignals.buildMockClients(new Date());
const mockDay = (role) => T.DASH_TODAY_ROLES[role].mockSchedule.map((s) => s.who);
// The Schedule's sample week names its own people (dscDemoPlans and DSC_DEMO), read from the file.
const SCHED = read('dashSchedule.jsx');
const SCHED_DEMO = SCHED.slice(SCHED.indexOf('function dscDemoPlans('), SCHED.indexOf('})();', SCHED.indexOf('const DSC_DEMO = (() => {')));
const SCHED_NAMES = [...SCHED_DEMO.matchAll(/"([A-Z][a-z]+ [A-Z]\.)"/g)].map((x) => x[1]);
assert.equal(SCHED_NAMES.length > 3, true, 'the Schedule\'s sample moved: this guard is reading nobody');
const SAMPLE = new RegExp('\\b(' + [...new Set([...CAST.map((c) => c.profile.name), ...mockDay('trainer'), ...mockDay('nutritionist'), ...SCHED_NAMES, T.DASH_TODAY_ROLES.trainer.mockName, T.DASH_TODAY_ROLES.nutritionist.mockName])].map(esc).join('|') + ')');
const BAND = /Preview · demo data/;
const UNREAD = "Your roster couldn't be read just now · reload to try again";

const uid = (i) => String(i).padStart(8, '0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function mount(el) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await React.act(async () => root.render(el));
  await settle();
  return { div, text: () => div.textContent.replace(/\s+/g, ' ').trim(), unmount: () => React.act(async () => { root.unmount(); div.remove(); }) };
}
// A coach signed in (the store's account): every per-account document reads empty, every save lands.
function signedIn(uidv = 'coach-1') {
  const chain = { select() { return chain; }, in() { return chain; }, eq() { return Promise.resolve({ data: [], error: null }); } };
  window.shapeDb = {
    getSession: async () => ({ data: { session: { user: { id: uidv } } } }),
    getUser: async () => (uidv ? { id: uidv } : null),
    getUserGoals: async () => ({}),
    saveUserGoals: async () => ({ error: null }),
    client: { rpc: async () => ({ data: [], error: null }), from: () => chain },
  };
}

// ── 1. The hook ───────────────────────────────────────────────────────────────
// The server as useDashboard reads it. `roster`: a body to answer 200 with, a status to fail with, or
// "network" (fetch throws). The day feed answers live unless `feed` is "fail".
const ROLE_KEY = { trainer: 'isTrainer', nutritionist: 'isNutritionist' };
function hookServer({ role = 'trainer', roster, feed = 'ok', sessionClient = 'Avery Stone' } = {}) {
  const asked = [];
  const handler = async (url, init) => {
    const u = String(url);
    asked.push(u);
    if (u.startsWith('/api/' + role + '/clients')) {
      const r = typeof roster === 'function' ? roster() : roster;
      if (r === 'network') throw new TypeError('Failed to fetch');
      if (typeof r === 'number') return json({ error: 'x' }, r);
      return json(r);
    }
    if (u.startsWith('/api/' + role + '/dashboard')) {
      if ((typeof feed === 'function' ? feed() : feed) === 'fail') return json({}, 503);
      return json({ [ROLE_KEY[role]]: true, user: { firstName: 'Avery' }, kpis: { activeClients: 1 }, today: [{ scheduledAt: '2026-11-09T23:00:00Z', clientName: sessionClient }] });
    }
    if (u === '/api/clients/shared-overview' && init && init.method === 'POST') {
      const ids = JSON.parse(init.body).ids || [];
      return json({ results: Object.fromEntries(ids.map((id) => [id, { client: { id, name: 'Ada' }, stats: { sessionsPlanned: 4, sessionsCompleted: 3 } }])), failed: [] });
    }
    return json({}, 404);
  };
  return { handler, asked };
}
async function runHook({ role = 'trainer', ...opts }) {
  const srv = hookServer({ role, ...opts });
  globalThis.fetch = window.fetch = srv.handler;
  delete window.shapeDb;
  const hook = freshData().useDashboard;
  const seen = [];
  const Probe = () => { seen.push(hook(role, { refreshOnFocus: true })); return null; };
  const m = await mount(React.createElement(Probe));
  await settle(8);
  return { seen, last: () => seen[seen.length - 1], srv, m };
}

test('the hook: a 401 is the signed-out preview, the sample under the band, as before', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    const { last, m } = await runHook({ role, roster: 401 });
    try {
      assert.equal(last().source, 'demo', role);
      assert.equal(last().clients.length, CAST.length, role + ': the sample roster');
      assert.equal(last().loading, false);
      assert.equal(last().triage.length > 0, true, role + ': the preview has its triage');
    } finally { await m.unmount(); }
  }
});

test('the hook: signed in without this role (200, [roleKey] false) is the preview too', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    const { last, m } = await runHook({ role, roster: { [ROLE_KEY[role]]: false, clients: [], totals: { active: 0 } } });
    try {
      assert.equal(last().source, 'demo', role);
      assert.equal(last().clients.length, CAST.length);
    } finally { await m.unmount(); }
  }
});

test('the hook: a 500, a 503, a network error or an unusable answer is unread, with no sample clients and the day feed as it answered', async () => {
  const failures = [
    ['a 500', 500],
    ['a 503', 503],
    ['a 403', 403],
    ['a network error', 'network'],
    // 200 without the role key at all: an answer the page cannot use, never "not a coach".
    ['a 200 without the role key', { clients: [] }],
    // 200 the hook throws on after the roster read (clients is not a list).
    ['a throw after the roster read', { isTrainer: true, clients: 'oops', totals: { onPlan: 1 } }],
  ];
  for (const [label, roster] of failures) {
    const { seen, last, m } = await runHook({ roster });
    try {
      const d = last();
      assert.equal(d.source, 'unread', label);
      assert.deepEqual([d.clients.length, d.triage.length, d.queue.length, d.joint.length], [0, 0, 0, 0], label + ': no clients, so nothing built on them');
      assert.equal(d.loading, false, label);
      assert.equal(d.dismissable, false, label);
      assert.equal(!!(d.today && d.today.isTrainer), true, label + ': the day feed answered, and is handed on');
      assert.equal(d.today.today[0].clientName, 'Avery Stone', label);
      // At no point did the page hold the sample.
      assert.equal(seen.some((x) => x.source === 'demo' || x.clients.some((c) => /^demo-/.test(String(c.profile && c.profile.id)))), false, label + ': a render held the sample');
    } finally { await m.unmount(); }
  }
  // Both reads failed: unread, and no feed.
  const both = await runHook({ roster: 500, feed: 'fail' });
  try {
    assert.equal(both.last().source, 'unread');
    assert.equal(both.last().today, null);
    assert.equal(both.last().clients.length, 0);
  } finally { await both.m.unmount(); }
  // The nutritionist's roster too.
  const nutri = await runHook({ role: 'nutritionist', roster: 'network' });
  try { assert.equal(nutri.last().source, 'unread'); assert.equal(nutri.last().clients.length, 0); } finally { await nutri.m.unmount(); }
});

test('the hook: a quiet re-read of a live page that fails keeps it live, never the preview or unread', async () => {
  const realNow = Date.now;
  let clock = Date.UTC(2026, 10, 9, 15, 0, 0);
  Date.now = () => clock;
  let roster = { isTrainer: true, clients: [{ id: uid(1), name: 'Ada' }], totals: { onPlan: 1 } };
  try {
    const { seen, last, m } = await runHook({ roster: () => roster });
    try {
      assert.equal(last().source, 'live');
      assert.equal(last().clients.length, 1);
      for (const fail of [500, 'network']) {
        roster = fail;
        clock += 61_000;
        const from = seen.length;
        await React.act(async () => { window.dispatchEvent(new window.Event('focus')); });
        await settle(8);
        assert.equal(last().source, 'live', String(fail) + ': the re-read took the page off live');
        assert.equal(last().clients.length, 1, String(fail));
        assert.equal(seen.slice(from).every((d) => d.source === 'live'), true, String(fail) + ': a render left live');
      }
    } finally { await m.unmount(); }
  } finally { Date.now = realNow; }
});

// ── 2. The pages over "unread" ────────────────────────────────────────────────
// useDashboard's answer for a coach whose roster read failed, exactly as the hook builds it.
const unreadFeed = (today = null) => ({
  loading: false, clients: [], triage: [], queue: [], joint: [], today, source: 'unread', planCount: undefined,
  dismissable: false, setDismissal: async () => false, clearDismissal: async () => false,
});
// A day feed that answered: one session still to come today, and the route's own figures.
function dayFeed(role) {
  // Two minutes on: still today on the coach's clock for all but the day's last two minutes.
  const start = new Date(Date.now() + 2 * 60000).toISOString();
  const kpis = role === 'nutritionist'
    ? { activeClients: 7, monthlyNetCents: 123400, consultsThisWeek: 5, upcomingConsults: 3, totalConsults: 40 }
    : { activeClients: 7, monthlyNetCents: 123400, sessionsThisWeek: 5, upcomingSessions: 3, totalSessions: 40 };
  return {
    [ROLE_KEY[role]]: true, user: { firstName: 'Avery' }, dayZone: ShapeZone.viewerZone(), kpis,
    today: [{ scheduledAt: start, durationMin: 45, type: 'Remote', status: 'confirmed', topic: 'Lower pull', clientName: 'Avery Stone', clientId: uid(1) }],
    calendar: [{ at: start, durationMin: 45, kind: role === 'nutritionist' ? 'CONSULT' : 'SESSION', title: 'Avery Stone', sub: 'Lower pull · 45 min', clientId: uid(1), status: 'confirmed' }],
    pulse: [], growth: null, funnel: null,
  };
}
// The page's own reads that are not useDashboard's: Stripe's next payout and the coach's conversations.
function ownReads(role) {
  return async (url) => {
    const u = String(url);
    if (u.startsWith('/api/coach/next-payout')) return json({ isProvider: true, connected: true, next: { amountCents: 48312, currency: 'usd', arrivalDate: Date.now() + 2 * 86400000, status: 'pending' } });
    if (u.startsWith('/api/' + role + '/messages')) return json({ threads: [{ id: 'c1', clientName: 'Blair Fox', latestKnown: true, messages: [{ mine: false, createdAt: '2026-11-09T10:00:00Z' }] }] });
    return json({}, 503);
  };
}
// A card's words, or '' when the page drew no such card.
const cardText = (div, key) => { const el = div.querySelector('[data-card="' + key + '"]'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
const hasUnreadNote = (div, key) => { const el = div.querySelector('[data-card="' + key + '"] [data-dash-roster="unread"]'); return !!el && el.textContent === UNREAD; };
// Every claim an empty roster would make, and a count built on one.
const EMPTY_CLAIMS = /Nobody needs your attention|No one needs your attention|No clients yet|No clients in their first 30 days|No unreviewed check-ins|Every check-in reviewed|No one in the queue|Milestones appear here|appears once|No shared history yet|\b0 ready\b|no clients yet|of 0 on the pulse/;

async function todayPage(role, today) {
  signedIn();
  Object.assign(globalThis, {
    useDashboard: () => unreadFeed(today),
    // The shell draws every card the page declares, the catalogue's included, as a coach could add it.
    DashShell: (props) => React.createElement('div', null, props.gridWidgets.filter((w) => !w.empty).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render()))),
    useDashUnits: () => units, useDashFocusRefresh: () => {}, useDashPaper: () => {},
    dashShellHref: (s) => s,
  });
  globalThis.fetch = window.fetch = ownReads(role);
  const m = await mount(React.createElement(T.CoachDashboardPage, { role }));
  await settle(8);
  return m;
}

test('Today with the roster unread: no band and no sample, every roster card says so, and the day feed, the payout and replies still show', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    const unit = role === 'nutritionist' ? 'consult' : 'session';
    const m = await todayPage(role, dayFeed(role));
    try {
      const t = m.text();
      assert.doesNotMatch(t, BAND, role);
      assert.ok(!m.div.querySelector('.dash-demo-band'), role + ': the band');
      assert.doesNotMatch(t, SAMPLE, role + ': a sample person on a coach\'s Today');
      assert.doesNotMatch(t, EMPTY_CLAIMS, role + ': an empty claim over a roster nobody read: ' + (EMPTY_CLAIMS.exec(t) || [''])[0]);
      // The brief and Needs you: who needs the coach couldn't be read; the next session is the feed's.
      assert.match(cardText(m.div, 'brief'), /^BriefWho needs your attention couldn't be read just now\. Next up today: Avery Stone at /);
      assert.match(cardText(m.div, 'needsyou'), /Who needs you couldn't be read just now/);
      // Up next: the feed's session, and the client's history unread, never "No shared history yet".
      assert.match(cardText(m.div, 'upnext'), /Avery Stone/);
      assert.match(cardText(m.div, 'upnext'), new RegExp(esc(UNREAD)));
      assert.match(cardText(m.div, 'timeline'), /Avery Stone/);
      // At a glance: three roster figures, each a dash that says why.
      assert.equal(cardText(m.div, 'glance'), (role === 'nutritionist' ? 'Plans due' : 'Programs due') + "—couldn't be readCheck-ins reviewed—couldn't be readRoster logging—couldn't be read");
      // Money: the feed's net and Stripe's payout, both their own reads.
      assert.match(cardText(m.div, 'money'), /^Recurring revenue\$1,234 \/mo/);
      assert.match(cardText(m.div, 'money'), /\$483\.12/);
      // Every card built on the roster says it couldn't be read.
      const rosterCards = ['checkins', 'setup', 'pulse', 'wins', 'status', 'logtrend', 'movers', 'anniversaries', 'revenue', 'ending'].concat(role === 'trainer' ? ['queue'] : ['roster']);
      for (const k of rosterCards) assert.equal(hasUnreadNote(m.div, k), true, role + ': the ' + k + ' card does not say the roster couldn\'t be read: ' + cardText(m.div, k));
      // The work queues: the first tab (Attention) says so too; Replies is its own read.
      assert.equal(hasUnreadNote(m.div, 'queues'), true, role + ': Work queues');
      assert.match(cardText(m.div, 'replies'), /Blair Fox/, role + ': the conversations read is its own and shows');
      // The strips: a roster figure is "—", the feed's are the feed's.
      const practice = cardText(m.div, 'practice');
      assert.match(practice, new RegExp((role === 'nutritionist' ? 'Consults today' : 'Sessions today') + '1'), role + ': ' + practice);
      assert.match(practice, /Monthly recurring—couldn't be read/);
      assert.match(cardText(m.div, 'kpis'), /Active clients7/);
      assert.match(cardText(m.div, 'kpis'), /Monthly \(net\)\$1,234/);
      assert.match(cardText(m.div, 'business'), /\$1,234/);
      // The notes are the coach's own, kept with the account: never "Preview".
      assert.match(cardText(m.div, 'notes'), /Saved with your account/);
      assert.equal(!!m.div.querySelector('[data-dash-roster="unread"]'), true);
      assert.match(cardText(m.div, 'upnext'), new RegExp('UP NEXT · IN'));
      assert.doesNotMatch(cardText(m.div, 'upnext'), new RegExp('Every ' + unit + ' is behind you|Your schedule is clear'));
    } finally { await m.unmount(); }
  }
});

test('Today with the roster and the day feed both unread: each says so, and the sample\'s day never stands in', async () => {
  const m = await todayPage('trainer', null);
  try {
    const t = m.text();
    assert.doesNotMatch(t, BAND);
    assert.doesNotMatch(t, SAMPLE, 'a sample person on a coach\'s Today');
    assert.doesNotMatch(t, EMPTY_CLAIMS);
    assert.equal(m.div.querySelector('[data-card="upnext"] [data-dash-upnext]').getAttribute('data-dash-upnext'), 'unread');
    assert.equal(m.div.querySelector('[data-card="timeline"] [data-dash-timeline]').getAttribute('data-dash-timeline'), 'unread');
    assert.equal(cardText(m.div, 'brief'), "BriefWho needs your attention couldn't be read just now.");
    // The net is the roster's without a feed: unread. The payout is Stripe's, and still shows.
    assert.match(cardText(m.div, 'money'), /^Recurring revenue—couldn't be read/);
    assert.match(cardText(m.div, 'money'), /\$483\.12/);
    // The Business summary has no feed and is not the preview: no sample growth or funnel.
    assert.doesNotMatch(cardText(m.div, 'business'), /\$\d|\+\d/);
    assert.match(cardText(m.div, 'kpis'), /Active clients—couldn't be read/);
    assert.doesNotMatch(cardText(m.div, 'kpis'), /live only/);
  } finally { await m.unmount(); }
});

test('Today\'s preview still draws its sample under the band (the contrast)', async () => {
  signedIn(null);
  const clients = CAST;
  Object.assign(globalThis, {
    useDashboard: () => ({ loading: false, clients, triage: DashSignals.getTriageFeed('trainer', clients), queue: DashSignals.buildProgrammingQueue(clients), joint: [], today: null, source: 'demo', dismissable: false, setDismissal: async () => false, clearDismissal: async () => false }),
  });
  globalThis.fetch = window.fetch = async () => json({}, 401);
  const m = await mount(React.createElement(T.CoachDashboardPage, { role: 'trainer' }));
  await settle(6);
  try {
    assert.match(m.text(), BAND);
    assert.match(m.text(), SAMPLE);
    assert.equal(!!m.div.querySelector('[data-dash-roster="unread"]'), false, 'the preview says its roster couldn\'t be read');
  } finally { await m.unmount(); }
});

test('Clients, both roles, with the roster unread: no band, every count "—", and the list says so', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    signedIn();
    Object.assign(globalThis, {
      useDashboard: () => unreadFeed(dayFeed(role)),
      DashPage: ({ eyebrow, children }) => React.createElement('main', null, React.createElement('div', { 'data-eyebrow': '' }, eyebrow), children),
      Card: ({ children }) => React.createElement('div', null, children), DashSegmented: ({ items }) => React.createElement('div', { 'data-seg': '' }, items.map((i) => i.label + (i.count != null ? ' ' + i.count : '')).join(' | ')),
      SharedClientsTab: () => null, DashExportButton: ({ live }) => React.createElement('i', null, live ? 'EXPORT ON' : 'EXPORT OFF'),
      useDashUnits: () => units, useDashFocusRefresh: () => {}, useDashPaper: () => {},
      dashPlanClientCount: D.dashPlanClientCount, dashMilestonesIn: (ms) => ms || { recent: [], next: [] }, dashGoalText: (s) => String(s),
    });
    globalThis.fetch = window.fetch = async () => json({}, 503);
    const m = await mount(React.createElement(CLIENTS[role]));
    try {
      const t = m.text();
      assert.doesNotMatch(t, BAND, role);
      assert.doesNotMatch(t, SAMPLE, role);
      assert.equal(m.div.querySelector('[data-eyebrow]').textContent, '— ACTIVE CLIENTS', role + ': the active count is unread, never 0');
      assert.equal(m.div.querySelector('[data-seg]').textContent, 'Your clients | Shared with you', role + ': a count on the switch');
      const health = m.div.querySelector('[data-roster-health]');
      assert.equal(health.getAttribute('data-roster-health'), 'unread', role);
      assert.deepEqual([...health.querySelectorAll('[data-health]')].map((b) => b.textContent), ['— need you', '— watch', '— on track'], role + ': a health count built on nobody');
      assert.match(health.textContent, new RegExp(esc(UNREAD)));
      assert.match(m.div.querySelector('[data-health-reviewed]').textContent, /Check-ins reviewed\s*—\s*couldn't be read/);
      assert.equal(m.div.querySelector('[data-roster-empty]').getAttribute('data-roster-empty'), 'unread', role);
      assert.equal(m.div.querySelector('[data-roster-empty]').textContent, UNREAD);
      assert.doesNotMatch(t, /No clients yet|Search 0 clients|\b0 ACTIVE/, role);
      assert.equal(m.div.querySelector('input[aria-label="Search clients"]').getAttribute('placeholder'), 'Search clients');
      assert.match(t, /EXPORT OFF/, role + ': an export of a roster nobody read');
    } finally { await m.unmount(); }
  }
});

// ── Business ──────────────────────────────────────────────────────────────────
const analytics = (() => {
  const DAY = 86400000;
  const weeks = Array.from({ length: 26 }, (_, i) => {
    const d = new Date(Date.now() - (25 - i) * 7 * DAY);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { weekOf: d.toISOString().slice(0, 10), active: 10, added: i % 3 === 0 ? 1 : 0, ended: i % 5 === 0 ? 1 : 0, mrrNetCents: 153000, mrrGrossCents: 180000, oneTimeCents: 0 };
  });
  return { isTrainer: true, providerId: 7, metrics: { activeClients: 10, mrrNetCents: 153000, mrrGrossCents: 180000 }, byOrigin: [], byoMix: { clients: 10, brought: 0 }, trajectory: { weeks, firstSubAt: weeks[0].weekOf + 'T00:00:00Z' }, renewals: [], churn: [], stripe: { connected: false } };
})();
async function businessPage(section, analyticsAnswer) {
  signedIn();
  Object.assign(globalThis, {
    useDashboard: () => unreadFeed(null),
    useRememberedChoices: () => null,
    useRememberedChoice: () => React.useState(section),
    DashPage: ({ children }) => React.createElement(React.Fragment, null, children),
    DashSegmented: () => null, DashExportButton: () => null,
    DashFunnelPanel: ({ live }) => React.createElement('i', null, live ? 'LIVE FUNNEL' : 'DEMO FUNNEL'),
    DashGrid: (props) => React.createElement(React.Fragment, null, props.widgets.filter((w) => !w.empty).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render()))),
    useDashUnits: () => ({ measure: (value, unit) => ({ value, unit }) }),
  });
  globalThis.fetch = window.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('/api/trainer/analytics')) return analyticsAnswer();
    if (u.startsWith('/api/coach/listing')) return json({ listings: [{ role: 'trainer', monthly: 180, ready: true }] });
    if (u.startsWith('/api/coach/capacity')) return json({ listings: [{ role: 'trainer', waiting: 0, effective: false }] });
    if (u.startsWith('/api/coach/next-payout')) return json({ isProvider: true, connected: true, next: { amountCents: 48312, currency: 'usd', arrivalDate: Date.now() + 2 * 86400000, status: 'pending' } });
    return json({}, 503);
  };
  const m = await mount(React.createElement(B.CoachBusinessPage, { role: 'trainer' }));
  await settle(8);
  return m;
}

test('Business with the roster unread: no band and no sample; the clients cards say so, the analytics and payout still show', async () => {
  for (const section of ['overview', 'retention']) {
    const m = await businessPage(section, async () => json(analytics));
    try {
      const t = m.text();
      assert.doesNotMatch(t, BAND, section);
      assert.doesNotMatch(t, /DEMO FUNNEL|PREVIEW/, section);
      assert.doesNotMatch(t, SAMPLE, section + ': the sample roster on a coach\'s page');
      if (section === 'overview') {
        assert.match(cardText(m.div, 'clients'), /Your clients couldn't be read just now/);
        assert.match(cardText(m.div, 'net'), /\$1,530/, 'the analytics read is its own and shows');
        assert.match(cardText(m.div, 'payout'), /\$483\.12/, 'the payout read is its own and shows');
      } else {
        assert.match(t, /Who might leave couldn't be read just now/);
        assert.match(t, /Your clients couldn't be read just now/);
      }
    } finally { await m.unmount(); }
  }
  // While the analytics are still out, a roster useDashboard says is unread is unread already, never "Reading".
  const m = await businessPage('overview', () => new Promise(() => {}));
  try {
    assert.match(cardText(m.div, 'clients'), /Your clients couldn't be read just now/);
    assert.doesNotMatch(m.text(), BAND);
    assert.doesNotMatch(m.text(), SAMPLE);
  } finally { await m.unmount(); }
});

// ── Goal and Score ────────────────────────────────────────────────────────────
function goalShell({ roster, live }) {
  const seen = { rosterReads: 0, boards: {} };
  Object.assign(globalThis, {
    DashPage: ({ eyebrow, title, subtitle, actions, children }) => React.createElement('main', null,
      React.createElement('div', { 'data-eyebrow': '' }, eyebrow), React.createElement('h1', null, title), React.createElement('p', null, subtitle), React.createElement('nav', null, actions), children),
    DashGrid: (props) => { seen.boards[props.tab] = props; return React.createElement(React.Fragment, null, props.widgets.filter((w) => !w.empty && !w.optional).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render()))); },
    goalQuarterLabel: () => 'YOUR GOALS · Q4 2026',
    useCoachLiveFigures: () => live,
    useDashboard: () => { seen.rosterReads += 1; return roster; },
    useCoachStanding: () => null, coachStandingLine: () => 'standing', CoachScoreActions: () => null, CoachLeaderboard: () => null, coachScoreFixNote: () => null,
  });
  return seen;
}

test('Goal with the roster unread: the adherence goal names nobody and no sample shows; the coach\'s own goals and figures do', async () => {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const goals = [
    { id: 'g-adh', t: '95% adherence', metric: 'adherencePct', pct: true, tgt: 95, start: 70, startAt: new Date(Date.now() - 40 * 86400000).toISOString(), due: day(40) },
    { id: 'g-cl', t: '20 active clients', metric: 'activeClients', tgt: 20, start: 5, startAt: new Date(Date.now() - 40 * 86400000).toISOString(), due: day(40) },
  ];
  const roster = { source: 'unread', triage: [] };
  const seen = goalShell({ roster, live: { kind: 'live', activeClients: 7, mrrNetCents: 123400, adherencePct: 60 } });
  window.shapeDb = { getSession: async () => ({}), getUser: async () => ({ id: 'coach-1' }), getUserGoals: async () => ({ goals, archived: [] }), saveUserGoals: async () => ({ ok: true }) };
  const m = await mount(React.createElement(C.CoachGoalBoard, { role: 'trainer' }));
  await settle(8);
  try {
    const t = m.text();
    assert.equal(seen.rosterReads > 0, true, 'the roster is read for the adherence goal');
    assert.doesNotMatch(t, BAND);
    assert.doesNotMatch(t, SAMPLE, 'a sample person named on a coach\'s goal');
    assert.doesNotMatch(t, /Sample view|Sample figures/);
    // The coach's own goals, with the figures their own reads give.
    assert.match(cardText(m.div, 'goal-g-cl'), /7 of 20/);
    assert.match(cardText(m.div, 'goal-g-adh'), /60% of 95%/);
    // Who pulls the adherence goal down couldn't be read: no Nudge, and nobody named.
    assert.equal(!!m.div.querySelector('[data-card="goal-g-adh"] [data-cgs-action]'), false, 'a nudge built on a roster nobody read');
    assert.doesNotMatch(cardText(m.div, 'goal-g-adh'), /Nudge/);
  } finally { await m.unmount(); }
});

test('Score with the roster unread: its own score read shows, and it never reads the roster', async () => {
  const seen = goalShell({ roster: { source: 'unread', triage: [] }, live: { kind: 'live' } });
  globalThis.fetch = window.fetch = async (url) => (String(url).startsWith('/api/coach/score')
    ? json({ total: 2370, current_tier: 'Elite', breakdown: [{ label: 'Active clients', points: 1500, sub: '30 clients' }, { label: 'Session completion', points: 870, sub: '87% · last 90d' }] })
    : json({}, 404));
  const m = await mount(React.createElement(C.CoachScoreBoard, { role: 'trainer' }));
  await settle(6);
  try {
    assert.equal(m.div.querySelector('h1').textContent, '2,370');
    assert.doesNotMatch(m.text(), BAND);
    assert.doesNotMatch(m.text(), /SAMPLE|Sample · an example/);
    assert.equal(seen.rosterReads, 0, 'the Score page reads its own score, never the roster');
  } finally { await m.unmount(); }
});

// ── Schedule ──────────────────────────────────────────────────────────────────
const { mountSchedule } = await import('./helpers/schedule-page.mjs');
const NY = 'America/New_York';
const sev = (id, date, time, extra = {}) => ({ id: 'session:' + id, sessionId: id, source: 'session', kind: 'SESSION', title: 'Strength', sub: 'video', date, time, durationMin: 60, with: 'Avery Stone', clientId: uid(1), status: 'confirmed', reschedulable: true, editable: false, ...extra });
function scheduleServer({ calendar = 'ok' } = {}) {
  const posts = [];
  const asked = [];
  const handler = async (u, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    asked.push(u.pathname);
    if (method !== 'GET') posts.push({ path: u.pathname, body });
    const r = (status, b) => ({ ok: status >= 200 && status < 300, status, json: async () => b });
    if (u.pathname === '/api/my-availability') return r(200, { slots: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_minute: 480, duration_min: 240 })), timezone: NY });
    if (u.pathname === '/api/coach/to-schedule') return r(200, { items: [] });
    if (u.pathname === '/api/my-time-off') return r(200, { timeOff: [], ready: true });
    if (u.pathname === '/api/my-booking-rules') return r(200, { rules: { bufferMin: 0, maxPerDay: null, minNoticeHours: 0, consultMin: 15 }, ready: true });
    if (u.pathname === '/api/calendar') {
      if (calendar === 'fail') return r(503, { error: 'down' });
      const from = u.searchParams.get('from'), to = u.searchParams.get('to');
      const events = [sev('s-thu', '2026-10-08', '09:00'), sev('r-fri', '2026-10-09', '14:00', { status: 'requested', with: 'Blair Fox', clientId: uid(2), title: 'Intro session' })];
      return r(200, { events: events.filter((e) => e.date >= from && e.date <= to), zone: NY });
    }
    if (u.pathname === '/api/sessions/manage') return r(200, { ok: true });
    return r(404, {});
  };
  return { handler, posts, asked };
}

test('Schedule with the roster unread and no day feed: the coach\'s own calendar, read and worked for real, never the preview\'s', async () => {
  const srv = scheduleServer();
  // useDashboard's "unread": no clients and, here, no day feed either (live false, source "unread").
  const page = await mountSchedule({ fetch: srv.handler, triage: [], live: false, source: 'unread' });
  try {
    assert.ok(!page.doc.querySelector('[data-demo-band]'), 'the band on a coach\'s page');
    assert.doesNotMatch(page.text(), SAMPLE, 'the preview\'s week for a signed-in coach');
    assert.doesNotMatch(page.text(), /Demo ·/);
    // The calendar is the page's own read: the coach's booking is on the grid, and its zone named.
    assert.ok(page.doc.querySelector('[data-dsc-block="session:s-thu"]'), 'the coach\'s calendar did not show');
    assert.equal(page.doc.querySelector('[data-calendar-note]').getAttribute('data-calendar-note'), 'read');
    // Its other reads run as a live page's do: paid sessions to schedule, time off.
    assert.equal(srv.asked.includes('/api/coach/to-schedule'), true, 'paid sessions to schedule were not asked');
    assert.equal(srv.asked.includes('/api/my-time-off'), true, 'time off was not asked');
    // Answering a request goes to the server, never the preview's "Demo · …".
    const card = page.doc.querySelector('[aria-label="Requests to confirm"]');
    assert.ok(card, 'the request card');
    await page.click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Accept'));
    assert.deepEqual(srv.posts.map((p) => [p.path, p.body.action]), [['/api/sessions/manage', 'confirm']]);
    assert.doesNotMatch(page.toast(), /Demo/);
    // Booking from the toolbar: the sheet's client list is the roster, which couldn't be read.
    await page.click(page.button('+ Book'));
    const empty = page.doc.querySelector('[data-book-roster]');
    assert.ok(empty, 'the book sheet');
    assert.equal(empty.getAttribute('data-book-roster'), 'unread');
    assert.equal(empty.textContent, UNREAD);
  } finally { await page.unmount(); }
  // The calendar failed too: the page says so and offers the Retry, as a live page's does.
  const down = scheduleServer({ calendar: 'fail' });
  const failed = await mountSchedule({ fetch: down.handler, triage: [], live: false, source: 'unread' });
  try {
    assert.ok(!failed.doc.querySelector('[data-demo-band]'));
    assert.equal(failed.doc.querySelectorAll('[data-dsc-block]').length, 0, 'sample bookings for a signed-in coach');
    const note = failed.doc.querySelector('[data-calendar-note]');
    assert.ok(note, 'no word on a calendar nobody read');
    assert.match(note.textContent, /Your calendar couldn't be read just now\./);
    assert.equal(/Retry/.test(note.textContent), true);
  } finally { await failed.unmount(); }
});

// ── Week ──────────────────────────────────────────────────────────────────────
test('Week with the roster unread: no band and no sample; the head and the roster say it couldn\'t be read', async () => {
  signedIn();
  Object.assign(globalThis, {
    useDashboard: () => ({ loading: false, triage: [], source: 'unread' }),
    useDashUnits: () => units,
    DashPage: ({ title, actions, children }) => React.createElement('main', null, React.createElement('h1', null, title), React.createElement('nav', null, actions), children),
    useCoachWeekReviews: D.useCoachWeekReviews, useCoachDoc: D.useCoachDoc, useSignedIn: D.useSignedIn,
  });
  globalThis.fetch = window.fetch = async () => json({}, 503);
  const m = await mount(React.createElement(W.CoachWeekPage, { role: 'trainer' }));
  await settle(6);
  try {
    const t = m.text();
    assert.doesNotMatch(t, BAND);
    assert.doesNotMatch(t, /Preview/);
    assert.doesNotMatch(t, SAMPLE);
    assert.equal(m.div.querySelectorAll('[data-dwk-row]').length, 0);
    assert.match(m.div.querySelector('[data-dwk-head]').textContent, /^— check-ins to review/);
    assert.equal(m.div.querySelector('[data-dwk-roster]').getAttribute('data-dwk-roster'), 'unread');
    assert.match(t, /The roster · —/);
    assert.doesNotMatch(t, /The roster · 0 clients|No clients on the roster yet|Every client reviewed/);
    assert.equal(m.div.querySelector('[data-dwk-start]').disabled, true);
  } finally { await m.unmount(); }
});
