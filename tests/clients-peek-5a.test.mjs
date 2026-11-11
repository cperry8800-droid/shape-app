// Coach dashboard step 5a (the owner's coach review, step 5: "The client peek, then Clients, Week and
// Schedule"): the client panel docks beside the list on Clients, and any client name on Today opens it.
// These mount the SHIPPED modules (dashToday.jsx, dashRoster.jsx and both Clients pages) in jsdom, with
// the real signals engine, zone and tier modules, and read what a coach reads:
//   1. docked, the panel is part of the page: nothing inert, no scroll lock, no focus trap; ↑ ↓ move
//      the selection from the list, Esc closes; narrower, and on Today, it is still the modal slide-over;
//   2. the roster-health bar: its counts are the groups' and its parts the filters (the remembered
//      `rosterFilter` among them), and a count nobody could read is "—", never 0;
//   3. the groups: Needs you, Watch, Progress unknown and On track as labelled headings, each row
//      with its tier mark; where the new and the unknown go;
//   4. the calmer panel: three facts and the review's sections, each loading, unread or empty;
//   5. Today: a client's name opens the panel and keeps its href.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const read = (f) => readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#clients', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require_('react');
const ReactDOM = require_('react-dom');
const { createRoot } = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const preset = require_('next/dist/compiled/babel/preset-react');
const compile = (src) => babel.transformSync(src, { presets: [preset], babelrc: false, configFile: false }).code;
const DashSignals = require_('../public/newdesign/dashSignals.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
Object.assign(window, { ShapeZone, ShapeClientColors });

// The width: jsdom has no media queries, so the panel's dock query answers what the test says.
let WIDE = true;
const mq = new Set();
window.matchMedia = (q) => ({ media: q, get matches() { return WIDE; }, addEventListener: (t, fn) => mq.add(fn), removeEventListener: (t, fn) => mq.delete(fn) });
const setWide = (v) => React.act(async () => { WIDE = v; for (const fn of [...mq]) fn(); });

// The page-shell globals these modules read at render, each a pageShell.jsx / dashData.jsx export the
// shells load first, stubbed: what is under test is the roster and the panel.
const Pass = ({ children }) => React.createElement('div', null, children);
Object.assign(globalThis, {
  React, ReactDOM, DashSignals,
  serif: 'serif', sans: 'sans-serif', mono: 'monospace', INK: '#f2ede4', PAPER: '#1a1612', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4',
  ssAlpha: (c, a) => 'rgba(0,0,0,' + a + ')',
  useDashUnits: () => null, dashMilestonesIn: (ms) => ms || { recent: [], next: [] },
  dashWeighIn: (w) => ({ value: w.weight, unit: w.unit || 'lb' }), dashWeighInDelta: (a, b) => Math.round((b.weight - a.weight) * 10) / 10,
  useRememberedSet: () => { const [v, setV] = React.useState([]); return [v, (k) => setV((x) => (x.includes(k) ? x.filter((y) => y !== k) : x.concat([k])))]; },
  useRememberedSlots: (store, keys, allowed, defaults) => React.useState(defaults),
  useDashFocusRefresh: () => {}, useDashPaper: () => {},
  DashPage: Pass, Card: Pass, DashSegmented: () => null, SharedClientsTab: () => null,
  DashExportButton: ({ live }) => React.createElement('i', null, live ? 'EXPORT ON' : 'EXPORT OFF'),
  trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: { demo: 'trainer' }, nutriPayoutCard: { demo: 'nutritionist' },
  dashPlanClientCount: (clients) => clients.length,
  dashGoalText: (s) => String(s),
});

const TODAY_NAMES = ['CoachDashboardPage', 'DASH_TODAY_ROLES', 'DASH_SEV_COLORS', 'DashPill', 'DashDemoBand', 'dashTabHref', 'dashClientHref', 'dashClientPageHref', 'dashRouteParam',
  'dashDemoCalendar', 'dashGlanceCells', 'dashKpiCell', 'dashRecordTier', 'dashTierMark', 'DashTierDot', 'DashClientGem', 'DashClientName', 'DashPeekLink', 'dashPeekClick',
  'dashRowKeyOpen', 'dashJointReason', 'dashOpenCareTeam', 'dashMessageClient', 'dashCoachActionGo', 'dashFmtTime', 'dashCalDate', 'dashCalTime', 'DashBriefCard', 'DashNeedsBoard', 'dashNeedsItems', 'DashUpNextCard', 'dashFindRecord', 'dashNextToday'];
const T = new Function(compile(read('dashToday.jsx')) + ';return {' + TODAY_NAMES.join(',') + '};')();
Object.assign(globalThis, T);
const ROSTER_NAMES = ['DashRosterTable', 'DashRosterHealth', 'dashRosterHealth', 'DashRosterPeek', 'dashRosterGroups', 'dashRosterColumns', 'DashClientDrawer', 'dashPeekSessions',
  'dashNextSessionFor', 'dashPeekFacts', 'dashPeekJoint', 'DASH_DRAWER_VIEWS', 'DASH_ROSTER_VIEWS', 'DASH_ROSTER_SORT_KEYS', 'DASH_PEEK_DOCK_QUERY', 'dashDrawerSections'];
const R = new Function(compile(read('dashRoster.jsx')) + ';return {' + ROSTER_NAMES.join(',') + '};')();
Object.assign(globalThis, R);
const PAGES = {
  trainer: new Function(compile(read('trainerClientsPage.jsx')) + ';return TrainerClientsPage;')(),
  nutritionist: new Function(compile(read('nutritionistClientsPage.jsx')) + ';return NutritionistClientsPage;')(),
};

const NOW = new Date();
const CAST = () => DashSignals.buildMockClients(NOW);
// The preview's cast as live clients: account ids, overviews read.
const uid = (i) => String(i).padStart(8, '0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const asLive = (cs, state = 'ready') => cs.map((c, i) => ({ ...c, profile: { ...c.profile, id: uid(i + 1) }, progressRead: { state, checkedAt: NOW.toISOString() } }));

function stubPage({ role = 'trainer', source = 'demo', clients = CAST(), today = null, loading = false, remembered = {}, triage }) {
  const feed = triage || DashSignals.getTriageFeed(role, clients, NOW);
  Object.assign(globalThis, {
    useDashboard: () => ({ loading, clients: loading ? [] : clients, triage: loading ? [] : feed, source: loading ? null : source, planCount: undefined, today, queue: [],
      joint: DashSignals.findJointAttention(clients, NOW, null, role), dismissable: false, setDismissal: async () => false, clearDismissal: async () => false }),
    useRememberedChoices: () => null,
    useRememberedChoice: (store, key, allowed, fallback) => React.useState(remembered[key] !== undefined && allowed.includes(remembered[key]) ? remembered[key] : fallback),
  });
  return feed;
}
async function mount(el) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await React.act(async () => root.render(el));
  return { div, text: () => div.textContent.replace(/\s+/g, ' ').trim(), unmount: () => React.act(async () => { root.unmount(); div.remove(); }) };
}
const page = async (opts) => { const feed = stubPage(opts); const m = await mount(React.createElement(PAGES[opts.role || 'trainer'])); return { m, feed }; };
// Whether the click was left to the browser (dispatchEvent is false once a handler prevented it).
const click = async (el, opts = {}) => {
  let followed;
  await React.act(async () => { followed = el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...opts })); });
  return followed;
};
const press = (el, key) => React.act(async () => { el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
const rowEls = (root) => [...root.querySelectorAll('[data-roster-row]')];
const rowNamed = (root, name) => rowEls(root).find((r) => r.getAttribute('aria-label').startsWith('Open ' + name + ' drilldown'));
const nameOf = (row) => /^Open (.+?) drilldown/.exec(row.getAttribute('aria-label'))[1];
const panelText = () => { const p = document.querySelector('[data-peek]'); return p ? p.textContent.replace(/\s+/g, ' ') : ''; };
const inertNow = () => [...document.body.children].filter((el) => el.inert).length;

// ── 1. Docked versus the slide-over ───────────────────────────────────────────
test('docked on Clients the panel is part of the page: nothing inert, no scroll lock, no focus trap', async () => {
  await setWide(true);
  const { m } = await page({});
  try {
    assert.equal(R.DASH_PEEK_DOCK_QUERY, '(min-width: 1180px)');
    assert.equal(m.div.querySelector('[data-peek-layout]').getAttribute('data-peek-layout'), 'list', 'the list takes the page until a client is chosen');
    const marcus = rowNamed(m.div, 'Marcus T.');
    marcus.focus();
    await click(marcus);
    const panel = document.querySelector('[data-peek]');
    assert.equal(!!panel, true);
    assert.deepEqual([panel.getAttribute('data-peek'), panel.getAttribute('role'), panel.hasAttribute('aria-modal')], ['docked', 'region', false]);
    assert.equal(m.div.contains(panel), true, 'the docked panel is on the page, not a portal over it');
    assert.equal(m.div.querySelector('[data-peek-layout]').getAttribute('data-peek-layout'), 'docked');
    assert.equal(inertNow(), 0, 'docked, nothing is inert');
    assert.equal(document.body.style.overflow, '', 'docked, the page keeps its scroll');
    assert.ok(document.activeElement === marcus, 'docked, opening a client leaves focus on the list');
    // Focus is free: a control outside the panel can take it, and nothing pulls it back.
    const search = m.div.querySelector('input[aria-label="Search clients"]');
    await React.act(async () => { search.focus(); });
    assert.ok(document.activeElement === search, 'docked, the panel traps focus');
    // The heading names the client, with their tier beside the name.
    assert.equal(document.getElementById(panel.getAttribute('aria-labelledby')).textContent, 'Marcus T.');
    // The selected row lifts to meet the panel (Lift 2); the list rests.
    const lifted = rowEls(m.div).filter((r) => /--lift-2/.test(r.style.boxShadow)).map(nameOf);
    assert.deepEqual(lifted, ['Marcus T.']);
    assert.equal(marcus.getAttribute('aria-current'), 'true');
    // Docked, the list keeps the compact columns: the client, the score and sessions kept, and the last contact.
    const heads = [...m.div.querySelector('.dash-roster-scroll > div > div').children].map((h) => h.textContent.replace(/[▾▴]/g, '').trim());
    assert.deepEqual(heads, ['CLIENT', 'SCORE · WK', 'KEPT · 42D', 'LAST CONTACT']);
  } finally { await m.unmount(); }
});

test('docked, the column the roster is sorted by stays, and the full table returns when the panel closes', () => {
  const view = R.DASH_ROSTER_VIEWS.trainer;
  const keep = (docked, sort) => R.dashRosterColumns(view, 'trainer', docked, sort).keep.map((i) => view.heads[i][0]);
  assert.deepEqual(keep(true, 'triage'), ['SCORE · WK', 'KEPT · 42D', 'LAST CONTACT']);
  assert.deepEqual(keep(true, 'revenue'), ['SCORE · WK', 'KEPT · 42D', 'LAST CONTACT', 'REVENUE'], 'a remembered sort orders rows by a column nobody can see');
  assert.deepEqual(keep(false, 'triage'), view.heads.map((h) => h[0]));
  const docked = R.dashRosterColumns(view, 'trainer', true, 'tenure');
  assert.equal(docked.cols.split(/\s+(?![^(]*\))/).length, docked.keep.length + 1, 'the compact template has a track per column');
  const n = R.DASH_ROSTER_VIEWS.nutritionist;
  assert.deepEqual(R.dashRosterColumns(n, 'nutritionist', true, 'triage').keep.map((i) => n.heads[i][0]), ['LAST FOOD LOG', 'COMPLIANCE · 7D', 'LAST CONSULT']);
});

test('docked, ↑ ↓ move the selection through the list as drawn, and Esc closes', async () => {
  await setWide(true);
  const { m } = await page({});
  try {
    const order = rowEls(m.div).map(nameOf);
    const first = rowEls(m.div)[0];
    first.focus();
    // Before anything is open, an arrow does nothing special (Enter opens).
    await press(first, 'ArrowDown');
    assert.equal(!!document.querySelector('[data-peek]'), false, 'an arrow opened a panel nobody asked for');
    await press(first, 'Enter');
    assert.equal(document.getElementById(document.querySelector('[data-peek]').getAttribute('aria-labelledby')).textContent, order[0]);
    await press(document.activeElement, 'ArrowDown');
    assert.equal(nameOf(document.activeElement), order[1], '↓ moves focus to the next row');
    assert.equal(document.getElementById(document.querySelector('[data-peek]').getAttribute('aria-labelledby')).textContent, order[1], '↓ moves the selection');
    // Across a group heading: the row after the last Needs you is the first Watch.
    for (let i = 1; i < 3; i++) await press(document.activeElement, 'ArrowDown');
    assert.equal(nameOf(document.activeElement), order[3]);
    assert.equal(document.activeElement.closest('[data-roster-group]').getAttribute('data-roster-group'), 'amber');
    await press(document.activeElement, 'ArrowUp');
    assert.equal(nameOf(document.activeElement), order[2], '↑ moves back');
    // The last row stays the last.
    const last = rowEls(m.div).at(-1);
    await click(last);
    last.focus();
    await press(last, 'ArrowDown');
    assert.ok(document.activeElement === last, '↓ past the end left the list');
    assert.equal(document.getElementById(document.querySelector('[data-peek]').getAttribute('aria-labelledby')).textContent, order.at(-1));
    // Esc from the list closes the panel and leaves focus on the row.
    await press(last, 'Escape');
    assert.equal(!!document.querySelector('[data-peek]'), false, 'Esc did not close the docked panel');
    assert.ok(document.activeElement === last);
    // Esc from inside the panel closes it and puts focus back on the row it showed.
    const marcus = rowNamed(m.div, 'Marcus T.');
    await click(marcus);
    const gear = document.querySelector('[data-peek] [aria-label="Choose sections"]');
    await React.act(async () => { gear.focus(); });
    await press(gear, 'Escape');
    assert.equal(!!document.querySelector('[data-peek]'), false);
    assert.ok(document.activeElement === rowNamed(m.div, 'Marcus T.'), 'Esc from the panel lost the coach\'s place in the list');
    // × closes it too.
    await click(rowNamed(m.div, 'Sam R.'));
    await click(document.querySelector('[data-peek] [aria-label="Close"]'));
    assert.equal(!!document.querySelector('[data-peek]'), false);
  } finally { await m.unmount(); }
});

test('narrower, the same panel is the modal slide-over: the page inert, scroll locked, Esc back to the row', async () => {
  await setWide(false);
  const { m } = await page({});
  try {
    const marcus = rowNamed(m.div, 'Marcus T.');
    marcus.focus();
    await click(marcus);
    const panel = document.querySelector('[data-peek]');
    assert.deepEqual([panel.getAttribute('data-peek'), panel.getAttribute('role'), panel.getAttribute('aria-modal')], ['sheet', 'dialog', 'true']);
    assert.equal(m.div.contains(panel), false, 'the slide-over is portaled over the page');
    assert.equal(m.div.inert, true, 'the page behind the slide-over is not inert');
    assert.equal(document.body.style.overflow, 'hidden');
    assert.ok(panel.contains(document.activeElement), 'the slide-over does not hold focus');
    assert.equal(m.div.querySelector('[data-peek-layout]').getAttribute('data-peek-layout'), 'list');
    // Its content is the panel's: the facts and the review's sections.
    assert.equal(!!panel.querySelector('[data-peek-facts]'), true);
    await press(document.activeElement, 'Escape');
    assert.equal(!!document.querySelector('[data-peek]'), false);
    assert.equal(!!m.div.inert, false);
    assert.equal(document.body.style.overflow, '');
    assert.ok(document.activeElement === rowNamed(m.div, 'Marcus T.'), 'focus did not return to the row');
    // Widening with the panel open docks it, and the page stops being inert.
    await click(rowNamed(m.div, 'Marcus T.'));
    assert.equal(m.div.inert, true);
    await setWide(true);
    assert.equal(document.querySelector('[data-peek]').getAttribute('data-peek'), 'docked');
    assert.equal(inertNow(), 0);
    assert.equal(document.body.style.overflow, '');
    await setWide(false);
    assert.equal(document.querySelector('[data-peek]').getAttribute('data-peek'), 'sheet', 'narrowing with the panel open kept it docked');
    await press(document.activeElement, 'Escape');
  } finally { await m.unmount(); await setWide(true); }
});

// ── 2. The roster-health bar ──────────────────────────────────────────────────
const partText = (root, k) => { const b = root.querySelector('[data-health="' + k + '"]'); return b ? b.textContent.replace(/\s+/g, ' ').trim() : null; };
const groupsOf = (root) => [...root.querySelectorAll('[data-roster-group]')].map((g) => g.getAttribute('data-roster-group'));
test('the bar is "3 need you · 1 watch · 6 on track", each part a filter, the remembered one included', async () => {
  const { m, feed } = await page({});
  try {
    const n = (s) => feed.filter((r) => r.severity === s).length;
    // The cast as each coach reads it since 2026-11-10: red is two areas, a broken streak is no coach's
    // flag, a score drop is context.
    assert.deepEqual([n('red'), n('amber'), n('green')], [3, 1, 6], 'the preview cast moved — re-derive this guard');
    assert.deepEqual(['red', 'amber', 'green', 'new'].map((k) => partText(m.div, k)), ['3 need you', '1 watch', '6 on track', '1 new']);
    assert.equal(partText(m.div, 'unknown'), null, 'an empty "progress unknown" part is drawn');
    assert.equal(/Reading/.test(m.div.querySelector('[data-roster-health]').textContent), false);
    // A part filters the list to its group, and says it is on.
    await click(m.div.querySelector('[data-health="red"]'));
    assert.equal(m.div.querySelector('[data-health="red"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(groupsOf(m.div), ['red']);
    assert.equal(rowEls(m.div).length, 3);
    // The part that is on turns off again; so does "Show all".
    await click(m.div.querySelector('[data-health="red"]'));
    assert.deepEqual(groupsOf(m.div), ['red', 'amber', 'green']);
    await click(m.div.querySelector('[data-health="new"]'));
    assert.deepEqual(rowEls(m.div).map(nameOf), ['Tess B.']);
    assert.equal(/Show all 10/.test(partText(m.div, 'all')), true);
    await click(m.div.querySelector('[data-health="all"]'));
    assert.equal(rowEls(m.div).length, 10);
  } finally { await m.unmount(); }
  // The remembered filter keeps working: a coach who left Watch on comes back to Watch.
  const { m: w } = await page({ remembered: { rosterFilter: 'amber' } });
  try {
    assert.equal(w.div.querySelector('[data-health="amber"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(groupsOf(w.div), ['amber']);
  } finally { await w.unmount(); }
  // And a remembered "progress unknown" keeps its part on the bar while nobody is in it.
  const { m: u } = await page({ remembered: { rosterFilter: 'unknown' } });
  try {
    assert.equal(partText(u.div, 'unknown'), '0 progress unknown');
    assert.equal(/No clients match this search or filter/.test(u.text()), true);
  } finally { await u.unmount(); }
});

test('a count nobody could read is "—", never 0: the roster loading, then the overviews still on their way', async () => {
  // The roster itself is loading: every part is a dash.
  const loading = R.dashRosterHealth([], true);
  assert.deepEqual(loading.counts, { red: null, amber: null, green: null, new: null, unknown: null });
  const { m } = await page({ loading: true });
  try {
    assert.deepEqual(['red', 'amber', 'green'].map((k) => partText(m.div, k)), ['— need you', '— watch', '— on track']);
    assert.equal(/\b0\b/.test(m.div.querySelector('[data-roster-health]').textContent), false, 'a loading bar printed a 0');
    assert.equal(/Reading your roster…/.test(m.div.querySelector('[data-roster-health]').textContent), true);
  } finally { await m.unmount(); }
  // The first paint: the roster is read, the overviews are not, and every severity is still "unknown".
  const reading = asLive(CAST(), 'loading').map((c) => ({ ...c, shapeScoreHistory: null, streaks: null, foodLogs: null, trainingAdherence: null, checkIn: null, lastContact: null, weighIns: null, nutrition: null, coachNotes: undefined, goals: null }));
  const { m: r } = await page({ source: 'live', clients: reading });
  try {
    assert.deepEqual(['red', 'amber', 'green'].map((k) => partText(r.div, k)), ['— need you', '— watch', '— on track']);
    assert.equal(/Reading 10 clients' progress…/.test(r.div.querySelector('[data-roster-health]').textContent), true);
    assert.equal(partText(r.div, 'unknown'), null, 'clients still being read were counted as progress unknown');
  } finally { await r.unmount(); }
  // Read, with two overviews failed: real counts, and the two counted apart as what is missing.
  const live = asLive(CAST());
  const failed = live.map((c, i) => (i < 2 ? { ...c, progressRead: { state: 'unavailable', checkedAt: null }, shapeScoreHistory: null, streaks: null, foodLogs: null, trainingAdherence: null, checkIn: null, lastContact: null } : c));
  const feed = DashSignals.getTriageFeed('trainer', failed, NOW);
  const h = R.dashRosterHealth(feed, false);
  assert.equal(h.state, 'read');
  assert.equal(h.counts.unknown >= 1, true, 'a client whose read failed vanished from the counts');
  assert.equal(h.counts.red + h.counts.amber + h.counts.green + h.counts.unknown, 10, 'the parts no longer add up to the roster');
  const { m: f } = await page({ source: 'live', clients: failed });
  try {
    assert.equal(partText(f.div, 'unknown'), h.counts.unknown + ' progress unknown');
    // An empty roster that WAS read is a measured 0.
    assert.deepEqual(R.dashRosterHealth([], false).counts, { red: 0, amber: 0, green: 0, new: 0, unknown: 0 });
  } finally { await f.unmount(); }
});

test('check-ins reviewed is Today\'s At a glance figure, and an unread one says so', async () => {
  // The preview reads no reviews: the figure is a dash that says "live only", never 0.
  const { m } = await page({});
  try {
    const t = m.div.querySelector('[data-health-reviewed]').textContent.replace(/\s+/g, ' ');
    assert.equal(t, 'Check-ins reviewed — live only');
  } finally { await m.unmount(); }
  // Live: the count Today shows, from the same derivation over the same roster.
  const wk = ShapeZone.dayKey(NOW);
  const monday = (() => { const d = new Date(wk + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const live = asLive(CAST()).map((c, i) => (i < 3 ? { ...c, checkIn: { lastWeekOf: monday, latest: { weekOf: monday, reviewed: i === 0 } } } : c));
  const triage = DashSignals.getTriageFeed('trainer', live, NOW);
  const want = T.dashGlanceCells('trainer', { live: {}, clients: live, triage, role: 'trainer' }, ['reviewed'])[0];
  const { m: l } = await page({ source: 'live', clients: live });
  try {
    const t = l.div.querySelector('[data-health-reviewed]').textContent.replace(/\s+/g, ' ');
    assert.equal(t, 'Check-ins reviewed ' + want.k + ' ' + want.sub);
    assert.equal(/^Check-ins reviewed 1 of 3/.test(t), true, t);
  } finally { await l.unmount(); }
});

// ── 3. The groups ─────────────────────────────────────────────────────────────
test('Needs you, Watch, Progress unknown and On track are labelled headings; each row has its tier mark', async () => {
  const { m, feed } = await page({});
  try {
    const heads = [...m.div.querySelectorAll('[data-roster-group] > [role="heading"]')].map((h) => [...h.children].map((c) => c.textContent).join('|'));
    assert.deepEqual(heads, ['Needs you|3', 'Watch|1', 'On track|6'], 'the group headings moved');
    assert.equal([...m.div.querySelectorAll('[data-roster-group] > [role="heading"]')].every((h) => h.getAttribute('aria-level') === '3'), true);
    // Every row sits under its own severity's heading.
    for (const g of m.div.querySelectorAll('[data-roster-group]')) {
      const key = g.getAttribute('data-roster-group');
      for (const r of g.querySelectorAll('[data-roster-row]')) {
        const row = feed.find((x) => x.client.profile.id === r.getAttribute('data-roster-row'));
        assert.equal(row.severity, key, nameOf(r) + ' is under ' + key);
      }
    }
    // A mark per row: the tier's colour, or a hollow square for an unknown tier. No status swatch.
    for (const r of rowEls(m.div)) {
      const mark = r.querySelector('.sh-tier-mark, [data-tier-unknown]');
      assert.equal(!!mark, true, nameOf(r) + ' has no tier mark');
    }
    const tiers = rowEls(m.div).map((r) => (r.querySelector('.sh-tier-mark') || { getAttribute: () => 'unknown' }).getAttribute('data-tier'));
    assert.equal(tiers.every((t) => ['raw', 'tempo', 'form', 'peak', 'legend'].includes(t)), true, tiers.join(','));
    // The new client is in their week's group, On track, and marked New.
    const tess = rowNamed(m.div, 'Tess B.');
    assert.equal(tess.closest('[data-roster-group]').getAttribute('data-roster-group'), 'green');
    assert.equal(/New/.test(tess.textContent), true);
  } finally { await m.unmount(); }
  // A client whose progress couldn't be read is under Progress unknown, which says why, between Watch and On track.
  const live = asLive(CAST()).map((c) => (c.profile.name === 'Jordan M.' ? { ...c, progressRead: { state: 'unavailable', checkedAt: null }, shapeScoreHistory: null } : c));
  const { m: u } = await page({ source: 'live', clients: live });
  try {
    assert.deepEqual(groupsOf(u.div), ['red', 'amber', 'unknown', 'green']);
    const g = u.div.querySelector('[data-roster-group="unknown"]');
    assert.deepEqual([...g.querySelector('[role="heading"]').children].map((c) => c.textContent), ['Progress unknown', '1', "Their progress couldn't be read, or they haven't shared enough of it yet."]);
    assert.deepEqual([...g.querySelectorAll('[data-roster-row]')].map(nameOf), ['Jordan M.']);
  } finally { await u.unmount(); }
  // A severity this build does not know joins Progress unknown rather than leaving the list.
  const odd = [{ severity: 'purple', client: { profile: { id: 'x', name: 'X' } }, flags: [] }];
  assert.deepEqual(R.dashRosterGroups(odd).map((g) => g.key + ':' + g.rows.length), ['unknown:1']);
});

test('search, sort, the Shared tab, the export and ?status= still work around the groups', async () => {
  const { m } = await page({ remembered: { rosterSort: 'name', rosterSortDir: 'asc' } });
  try {
    // A sort orders the rows within each group: status still reads first.
    const red = [...m.div.querySelectorAll('[data-roster-group="red"] [data-roster-row]')].map(nameOf);
    assert.deepEqual(red, [...red].sort((a, b) => a.localeCompare(b)));
    assert.deepEqual(groupsOf(m.div), ['red', 'amber', 'green']);
    const search = m.div.querySelector('input[aria-label="Search clients"]');
    const proto = Object.getPrototypeOf(search);
    await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(search, 'pri'); search.dispatchEvent(new window.Event('input', { bubbles: true })); });
    assert.deepEqual(rowEls(m.div).map(nameOf), ['Priya S.']);
    assert.deepEqual(groupsOf(m.div), ['green'], 'an empty group kept its heading');
    assert.equal(/EXPORT OFF/.test(m.text()), true, 'the preview\'s export is not live-only');
  } finally { await m.unmount(); }
  // ?status= opens the list on that group.
  window.location.hash = '#clients?status=amber';
  const { m: s } = await page({});
  try { assert.deepEqual(groupsOf(s.div), ['amber']); } finally { await s.unmount(); window.location.hash = '#clients'; }
});

// ── 4. The calmer panel ───────────────────────────────────────────────────────
const drawer = async (row, props = {}) => {
  let closed = 0;
  const m = await mount(React.createElement(R.DashClientDrawer, { row, role: 'trainer', onClose: () => { closed += 1; }, prefs: null, docked: true, ...props }));
  return { m, closed: () => closed };
};
test('three facts at the top: program, sessions kept and streak, each a value, or reading, unread or empty', async () => {
  const cast = asLive(CAST());
  const jordan = cast.find((c) => c.profile.name === 'Jordan M.');
  const facts = (rec, role = 'trainer') => R.dashPeekFacts(rec, role).map((f) => [f.label, f.v, f.sub, f.state]);
  assert.deepEqual(facts(jordan), [['Program', 'Strength Block 3', 'week 6 of 12', 'value'], ['Sessions kept', '90%', '18 of 20 · 42 days', 'value'], ['Streak', '9 days', 'best 14', 'value']]);
  assert.deepEqual(facts(jordan, 'nutritionist').map((f) => f[0]), ['Plan', 'Logging · 7d', 'Streak']);
  assert.deepEqual(facts(jordan, 'nutritionist')[1], ['Logging · 7d', '86%', '6 of 7 days logged', 'value']);
  const bare = { ...jordan, program: null, programs: null, trainingAdherence: null, streaks: null };
  assert.deepEqual(facts({ ...bare, goalPhase: null }).map((f) => f[1] + '|' + f[3]), ['Not set|empty', 'Not shared|empty', 'Not shared|empty'], 'a read overview that holds nothing');
  // No program of their own but a goal phase: the phase, said as that.
  assert.deepEqual(facts({ ...bare, goalPhase: 'Cut' })[0], ['Program', 'Cut phase', 'no program set', 'value']);
  assert.deepEqual(facts({ ...bare, goalPhase: null, progressRead: { state: 'loading' } }).map((f) => f[1] + '|' + f[2]), ['…|reading', '…|reading', '…|reading'], 'still reading is not "not set"');
  assert.deepEqual(facts({ ...bare, goalPhase: null, progressRead: { state: 'unavailable' } }).map((f) => f[1] + '|' + f[2]), ['—|couldn\'t be read', '—|couldn\'t be read', '—|couldn\'t be read']);
  // A value the page already holds is shown whatever the read state.
  assert.equal(facts({ ...jordan, progressRead: { state: 'unavailable' } })[2][1], '9 days');
  // On the panel, at the top, before the sections.
  const row = DashSignals.getTriageFeed('trainer', [jordan], NOW)[0];
  const { m } = await drawer(row);
  try {
    const panel = document.querySelector('[data-peek]');
    assert.deepEqual([...panel.querySelectorAll('[data-peek-fact]')].map((f) => f.getAttribute('data-peek-fact') + ':' + f.getAttribute('data-state')), ['program:value', 'keeping:value', 'streak:value']);
    assert.equal(/^On track/.test(panel.querySelector('[data-peek-status]').textContent), true, 'the status is not a labelled chip');
  } finally { await m.unmount(); }
});

test('the review\'s sections lead, per role; the ⚙ and the hidden list stay', () => {
  const keys = (role) => R.DASH_DRAWER_VIEWS[role].sections.map((s) => s[0]);
  assert.deepEqual(keys('trainer').slice(0, 5), ['joint', 'checkin', 'score', 'nutrition', 'next']);
  assert.deepEqual(keys('nutritionist').slice(0, 5), ['joint', 'checkin', 'score', 'logs', 'next']);
  // Every section the lenses had is still one a coach can show or hide.
  for (const k of ['score', 'goals', 'adherence', 'notes', 'milestones', 'nutrition']) assert.equal(keys('trainer').includes(k), true, k);
  for (const k of ['logs', 'goals', 'macros', 'weighins', 'training']) assert.equal(keys('nutritionist').includes(k), true, k);
  assert.deepEqual(R.dashDrawerSections(R.DASH_DRAWER_VIEWS.trainer, ['next']).shown.map((s) => s[0]).includes('next'), false);
});

test('the joint note shows only for a shared client, and says so when the thread can\'t be opened', async () => {
  const cast = asLive(CAST());
  const joint = DashSignals.findJointAttention(cast, NOW, null, 'trainer');
  assert.deepEqual(joint.map((j) => j.client.profile.name), ['Marcus T.'], 'the preview\'s shared client moved');
  const feed = DashSignals.getTriageFeed('trainer', cast, NOW);
  const marcus = feed.find((r) => r.client.profile.name === 'Marcus T.');
  const sam = feed.find((r) => r.client.profile.name === 'Sam R.');
  let { m } = await drawer(marcus, { joint });
  try {
    const sec = document.querySelector('[data-peek-joint]');
    assert.equal(!!sec && sec.getAttribute('data-peek-joint'), 'nutritionist');
    assert.equal(/Shared with their nutritionist, Rae\./.test(sec.textContent) && /Slipping on both sides:/.test(sec.textContent) && /Start joint note/.test(sec.textContent), true, sec.textContent);
    assert.equal(document.querySelector('[data-peek-status] [data-dash-shared]').textContent, 'Shared · nutritionist');
    // A thread the route won't open says so, never a dead button.
    const prev = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    try {
      await click(sec.querySelector('button'));
      await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      assert.equal(/Your private thread with Marcus T\.'s nutritionist couldn't be opened just now\./.test(sec.textContent), true, sec.textContent);
    } finally { globalThis.fetch = prev; }
  } finally { await m.unmount(); }
  // The preview's shared client is no account: the thread "opens on a live account".
  const demo = CAST();
  const demoRow = DashSignals.getTriageFeed('trainer', demo, NOW).find((r) => r.client.profile.name === 'Marcus T.');
  ({ m } = await drawer(demoRow, { joint: DashSignals.findJointAttention(demo, NOW, null, 'trainer') }));
  try {
    const sec = document.querySelector('[data-peek-joint]');
    await click(sec.querySelector('button'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(/Your private thread with Marcus T\.'s nutritionist opens on a live account\./.test(sec.textContent), true, sec.textContent);
  } finally { await m.unmount(); }
  ({ m } = await drawer(sam, { joint }));
  try {
    assert.equal(!!document.querySelector('[data-peek-joint]'), false, 'a client who is not shared got the joint note');
    assert.equal(/Joint note/i.test(panelText()), false, 'a client who is not shared got an empty joint note section');
    assert.equal(!!document.querySelector('[data-peek-status] [data-dash-shared]'), false);
  } finally { await m.unmount(); }
  // A host that holds no joint list draws no joint section rather than guessing.
  ({ m } = await drawer(marcus));
  try { assert.equal(!!document.querySelector('[data-peek-joint]'), false); } finally { await m.unmount(); }
});

test('the next session comes from the page\'s schedule: booked, none, unread, reading, or not on this page', async () => {
  const cast = asLive(CAST());
  const marcus = cast.find((c) => c.profile.name === 'Marcus T.');
  const at = (h) => new Date(NOW.getTime() + h * 3600000).toISOString();
  const feed = (calendar) => ({ calendar });
  const mine = (h, status, extra = {}) => ({ at: at(h), kind: 'SESSION', title: 'Marcus T.', sub: 'Deload · 60 min', clientId: marcus.profile.id, status, ...extra });
  const next = (sessions) => R.dashNextSessionFor(marcus, sessions, NOW.getTime());
  // The soonest of his own bookings still to come, by id, never a cancelled one or one that started.
  const s = R.dashPeekSessions(feed([mine(-2, 'confirmed'), mine(30, 'cancelled'), mine(50, 'confirmed'), mine(26, 'requested'), mine(5, 'completed')]), 'live', 'trainer');
  assert.equal(next(s).state, 'booked');
  assert.equal(next(s).session.at, Date.parse(at(26)));
  // Another coach's booking for him (the shared calendar) is not this coach's next session.
  assert.equal(next(R.dashPeekSessions(feed([mine(3, 'confirmed', { kind: 'NUTRITION', sharedCoach: true })]), 'live', 'trainer')).state, 'none');
  // Another client's booking under the same name is not his: the id decides.
  assert.equal(next(R.dashPeekSessions(feed([mine(3, 'confirmed', { clientId: uid(99) })]), 'live', 'trainer')).state, 'none');
  // A booking with no account link is matched by name.
  assert.equal(next(R.dashPeekSessions(feed([mine(3, 'confirmed', { clientId: null })]), 'live', 'trainer')).state, 'booked');
  // An older feed that sent no status can't tell a cancelled booking: unread, never "nothing booked".
  assert.equal(next(R.dashPeekSessions(feed([{ at: at(3), kind: 'SESSION', title: 'Marcus T.' }]), 'live', 'trainer')).state, 'unread');
  assert.equal(next(R.dashPeekSessions(null, 'live', 'trainer')).state, 'unread', 'a failed day feed is not an empty schedule');
  assert.equal(next(R.dashPeekSessions(feed([]), 'live', 'trainer')).state, 'none');
  assert.equal(next(R.dashPeekSessions(null, null, 'trainer')).state, 'loading');
  assert.equal(next(undefined).state, 'elsewhere');
  // The preview reads its own sample calendar, under the band.
  const sample = R.dashPeekSessions(null, 'demo', 'trainer');
  assert.equal(sample.state, 'read');
  assert.equal(sample.rows.length > 0 && sample.rows.every((r) => Number.isFinite(r.at)), true);
  // On the panel: the day and time on the account's clock, and each state in words.
  const row = DashSignals.getTriageFeed('trainer', [marcus], NOW)[0];
  const words = async (sessions) => {
    const { m } = await drawer(row, { sessions });
    const el = document.querySelector('[data-peek-next]');
    const out = el ? el.getAttribute('data-peek-next') + '|' + el.closest('div').textContent.replace(/\s+/g, ' ').trim() : 'none drawn';
    await m.unmount();
    return out;
  };
  const booked = await words(s);
  assert.equal(booked.startsWith('booked|' + ShapeZone.formatDateTime(Date.parse(at(26)))), true, booked);
  assert.equal(/(tomorrow|in 2 days) · Deload · 60 min$/.test(booked), true, booked);
  assert.equal(await words({ state: 'read', rows: [] }), "none|No session booked with them. Open Schedule →");
  assert.equal(await words({ state: 'unread' }), "unread|Your schedule couldn't be read just now. Open Schedule →");
  assert.equal(await words({ state: 'loading' }), 'loading|Reading your schedule…');
  assert.equal(await words(undefined), "elsewhere|This page doesn't hold your bookings. Open Schedule →");
});

test('the week\'s check-in: this week\'s or the last one, its words, and whether it was reviewed', async () => {
  const wk = (n) => { const d = new Date(ShapeZone.dayKey(NOW) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7 * n); return d.toISOString().slice(0, 10); };
  const base = asLive(CAST()).find((c) => c.profile.name === 'Jordan M.');
  const text = async (rec) => {
    const row = DashSignals.getTriageFeed('trainer', [rec], NOW)[0];
    const { m } = await drawer(row);
    const sec = [...document.querySelectorAll('[data-peek] > div')].find((d) => /This week's check-in/i.test(d.firstChild ? d.firstChild.textContent : ''));
    const t = sec ? sec.textContent.replace(/\s+/g, ' ').trim() : 'no section';
    await m.unmount();
    return t;
  };
  const ck = { week_of: wk(0), ratings: { trainingAdherence: 8, sleep: 5 }, wins: 'Hit every session', struggles: 'Late dinners', question: 'More carbs on leg day?' };
  const thisWeek = await text({ ...base, checkIn: { lastWeekOf: wk(0), latest: { weekOf: wk(0), reviewed: false } }, checkins: [ck] });
  assert.equal(/This week's check-in is in\./.test(thisWeek) && /Waiting on your review/.test(thisWeek), true, thisWeek);
  assert.equal(/Training 8\/10 · Sleep 5\/10/.test(thisWeek) && /Win ?Hit every session/.test(thisWeek) && /Asked you ?More carbs on leg day\?/.test(thisWeek) && /Read it on Week →/.test(thisWeek), true, thisWeek);
  assert.equal(/Reviewed/.test(await text({ ...base, checkIn: { lastWeekOf: wk(0), latest: { weekOf: wk(0), reviewed: true } } })), true);
  assert.equal(/Review status couldn't be read/.test(await text({ ...base, checkIn: { lastWeekOf: wk(0), latest: { weekOf: wk(0), reviewed: null } } })), true, 'an unread review state claimed one');
  assert.equal(/Last week's check-in\. This week's isn't in yet\./.test(await text({ ...base, checkIn: { lastWeekOf: wk(1) } })), true);
  assert.equal(/Their last check-in was 3 weeks ago\./.test(await text({ ...base, checkIn: { lastWeekOf: wk(3) } })), true);
  // A month-old check-in is Week's history: it is not "waiting on your review".
  const old = await text({ ...base, checkIn: { lastWeekOf: wk(4), latest: { weekOf: wk(4), reviewed: false } } });
  assert.equal(/4 weeks ago/.test(old) && !/Waiting on your review|Read it on Week/.test(old), true, old);
  assert.equal(/No check-in yet\./.test(await text({ ...base, checkIn: { lastWeekOf: null } })), true);
  // Loading, unread and not shared are three sentences.
  assert.equal(/Reading their check-ins…/.test(await text({ ...base, checkIn: null, progressRead: { state: 'loading' } })), true);
  assert.equal(/Their check-ins couldn't be read just now\./.test(await text({ ...base, checkIn: null, progressRead: { state: 'unavailable' } })), true);
  assert.equal(/Check-ins aren't shared to the web yet\./.test(await text({ ...base, checkIn: null })), true);
});

test('the panel\'s file link is "Open full file →", by the client\'s own address', async () => {
  const cast = asLive(CAST());
  const row = DashSignals.getTriageFeed('trainer', [cast[0]], NOW)[0];
  const { m } = await drawer(row);
  try {
    const a = document.querySelector('[data-peek] [data-peek-file]');
    assert.equal(a.textContent, 'Open full file →');
    assert.equal(a.getAttribute('href'), T.dashClientHref(cast[0], 'trainer'));
  } finally { await m.unmount(); }
  // The preview's people have no file, so none is offered.
  const demo = DashSignals.getTriageFeed('trainer', [CAST()[0]], NOW)[0];
  const { m: d } = await drawer(demo);
  try { assert.equal(!!document.querySelector('[data-peek] [data-peek-file]'), false); } finally { await d.unmount(); }
});

test('the nutritionist\'s Clients docks the same panel, with its own lens', async () => {
  await setWide(true);
  const { m } = await page({ role: 'nutritionist' });
  try {
    assert.deepEqual(['red', 'amber', 'green'].map((k) => partText(m.div, k)), ['2 need you', '5 watch', '3 on track']);
    await click(rowNamed(m.div, 'Priya S.'));
    const panel = document.querySelector('[data-peek]');
    assert.equal(panel.getAttribute('data-peek'), 'docked');
    assert.equal(/Quick consult/.test(panel.textContent) && /Next consult/i.test(panel.textContent) && /Logging · 7d/i.test(panel.textContent), true);
    assert.equal(inertNow(), 0);
  } finally { await m.unmount(); }
});

// ── 5. Today: any client name opens the panel, and keeps its href ─────────────
test('on Today a client\'s name opens the panel on the page, and ⌘/Ctrl-click or a middle click keep the file', async () => {
  await setWide(true);
  window.__shapeCoachShell = true;
  const cast = asLive(CAST());
  const triage = DashSignals.getTriageFeed('trainer', cast, NOW);
  const priya = cast.find((c) => c.profile.name === 'Priya S.');
  const start = new Date(NOW.getTime() + 20 * 60000).toISOString();
  const today = {
    isTrainer: true, user: { firstName: 'Alex' }, kpis: {}, dayZone: ShapeZone.viewerZone(),
    today: [{ scheduledAt: start, durationMin: 45, type: 'Remote', status: 'confirmed', topic: 'Lower pull', clientName: 'Priya S.' }],
    calendar: [{ at: start, durationMin: 45, kind: 'SESSION', title: 'Priya S.', sub: 'Lower pull · 45 min', clientId: priya.profile.id, status: 'confirmed' }],
  };
  const shell = {};
  Object.assign(globalThis, {
    useDashboard: () => ({ today, triage, clients: cast, queue: [], joint: DashSignals.findJointAttention(cast, NOW, null, 'trainer'), source: 'live', dismissable: false, setDismissal: async () => false, clearDismissal: async () => false }),
    useRememberedChoices: () => null,
    useRememberedChoice: (s, k, a, f) => React.useState(f),
    // The shell draws the default board's six cards, as DashGrid would.
    DashShell: (props) => { shell.props = props; return React.createElement('div', null, props.gridWidgets.filter((w) => !w.optional).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render()))); },
  });
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  let m = null;
  try {
    m = await mount(React.createElement(T.CoachDashboardPage, { role: 'trainer' }));
    const card = (k) => m.div.querySelector('[data-card="' + k + '"]');
    // Needs you: the name is a link to the client's file, and a plain click opens the panel instead.
    const name = card('needsyou').querySelector('[data-dash-need] a[data-dash-peek-name]');
    assert.equal(name.textContent, 'Marcus T.');
    assert.equal(name.getAttribute('href'), '#client/' + encodeURIComponent(cast.find((c) => c.profile.name === 'Marcus T.').profile.id), 'the name lost its href');
    const kept = await click(name);
    assert.equal(kept, false, 'a plain click still followed the link');
    let panel = document.querySelector('[data-peek]');
    assert.equal(!!panel, true, 'the name did not open the panel');
    assert.deepEqual([panel.getAttribute('data-peek'), panel.getAttribute('aria-modal')], ['sheet', 'true'], 'on Today the panel is the slide-over');
    assert.equal(document.getElementById(panel.getAttribute('aria-labelledby')).textContent, 'Marcus T.');
    assert.equal(!!panel.querySelector('[data-peek-joint]'), true, 'Today\'s panel lost the joint note its Needs you row flags');
    await press(document.activeElement, 'Escape');
    assert.equal(!!document.querySelector('[data-peek]'), false);
    // ⌘/Ctrl-click, Shift-click and a middle click are the browser's: the link is followed, no panel.
    for (const opts of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const followed = await click(name, opts);
      assert.equal(followed, true, JSON.stringify(opts) + ' was taken from the browser');
      assert.equal(!!document.querySelector('[data-peek]'), false, JSON.stringify(opts) + ' opened the panel');
    }
    window.location.hash = '#today';
    // The Brief: each named client opens the panel too.
    const briefName = card('brief').querySelector('[data-dash-brief] a[data-dash-peek-name]');
    assert.equal(briefName.textContent, 'Marcus T.');
    assert.equal(briefName.getAttribute('href').startsWith('#client/'), true);
    await click(briefName);
    assert.equal(document.getElementById(document.querySelector('[data-peek]').getAttribute('aria-labelledby')).textContent, 'Marcus T.');
    await press(document.activeElement, 'Escape');
    // Up next: the session's client, and the panel names their next session from this page's day feed.
    const upName = card('upnext').querySelector('a[data-dash-peek-name]');
    assert.equal(upName.textContent, 'Priya S.');
    await click(upName);
    panel = document.querySelector('[data-peek]');
    assert.equal(document.getElementById(panel.getAttribute('aria-labelledby')).textContent, 'Priya S.');
    assert.equal(panel.querySelector('[data-peek-next]').getAttribute('data-peek-next'), 'booked');
    assert.equal(panel.textContent.includes(ShapeZone.formatDateTime(Date.parse(start))), true);
    // The page hands the panel its store (the drawer's ⚙ rule): the page's own, not one of its own.
    await press(document.activeElement, 'Escape');
    assert.match(read('dashToday.jsx'), /\{peekRow && <DashClientDrawer row=\{peekRow\} role=\{role\} onClose=\{\(\) => setPeekId\(null\)\} prefs=\{prefs\}/);
  } finally {
    if (m) await m.unmount();
    globalThis.fetch = prevFetch;
    delete window.__shapeCoachShell;
    window.location.hash = '#clients';
  }
});

test('a name the panel can\'t open keeps its link, and a preview client with no file is a button', async () => {
  const opened = [];
  const peek = { can: (id) => id === 'demo-1', open: (id) => opened.push(id) };
  // Outside a shell the file is the standalone page; inside one (below) the in-shell route.
  assert.equal(T.dashClientHref({ profile: { id: uid(5) } }, 'trainer'), 'TrainerClient.html?id=' + uid(5));
  window.__shapeCoachShell = true;
  const m = await mount(React.createElement('p', null,
    React.createElement(T.DashPeekLink, { id: uid(5), role: 'trainer', peek }, 'Not on the roster'),
    React.createElement(T.DashPeekLink, { id: 'demo-1', role: 'trainer', peek }, 'Preview client'),
    React.createElement(T.DashPeekLink, { id: 'demo-2', role: 'trainer', peek }, 'Neither')));
  try {
    const [a, b] = [m.div.querySelector('a'), m.div.querySelector('button')];
    assert.deepEqual([a.textContent, a.hasAttribute('data-dash-peek-name'), a.getAttribute('href')], ['Not on the roster', false, '#client/' + uid(5)]);
    assert.equal(await click(a), true, 'a link the panel can\'t open was stopped');
    assert.equal(b.textContent, 'Preview client');
    await click(b);
    assert.deepEqual(opened, ['demo-1']);
    assert.equal(m.div.querySelectorAll('a, button').length, 2, 'a name with neither a file nor a panel became a control');
  } finally { await m.unmount(); delete window.__shapeCoachShell; window.location.hash = '#clients'; }
});

// ── Codex on #2639 ────────────────────────────────────────────────────────────
test('Codex on #2639: Up next finds its client by id, never the first of two with one name', async () => {
  window.__shapeCoachShell = true;
  const cast = asLive(CAST());
  const sams = cast.filter((c) => c.profile.name === 'Sam R.');
  assert.equal(sams.length, 1, 'the cast has one Sam R.');
  const twin = { ...sams[0], profile: { ...sams[0].profile, id: uid(99) } };
  const clients = cast.concat([twin]);
  // By id: that client, or nobody; by a name two clients share: nobody; by a name one client has: them.
  assert.equal(T.dashFindRecord(clients, 'Sam R.', uid(99)).profile.id, uid(99));
  assert.equal(T.dashFindRecord(clients, 'Sam R.', 'no-such-id'), null);
  assert.equal(T.dashFindRecord(clients, 'Sam R.'), null, 'a shared name picks nobody');
  assert.equal(T.dashFindRecord(cast, 'Sam R.').profile.id, sams[0].profile.id);
  // The day's next row carries its client's id through to the card. ⚠ ON A FIXED CLOCK: a row half an
  // hour after the real now is tomorrow's after 23:30, and Up next only takes today's, so the test
  // failed every night in that half hour. Noon in a named zone is mid-day whatever the hour or the host.
  const zone = 'UTC';
  const now = Date.UTC(2026, 10, 10, 12, 0);
  const at = new Date(now + 30 * 60000);
  const rows = [{ at, end: new Date(+at + 3600000), time: '12:30', status: 'confirmed', clientId: uid(99), who: 'Sam R.', sub: '60 min' }];
  assert.equal(T.dashNextToday(rows, null, now, zone).clientId, uid(99));
  const next = { ...rows[0], done: false, live: false };
  const opened = [];
  const m = await mount(React.createElement(T.DashUpNextCard, { rows, state: { now, items: [next], nextIdx: 0, next }, clients, role: 'trainer', unit: 'session', zone, single: true,
    peek: { can: () => true, open: (id) => opened.push(id) } }));
  try {
    const link = m.div.querySelector('[data-dash-peek-name]');
    assert.equal(!!link, true);
    assert.equal(link.getAttribute('href'), '#client/' + encodeURIComponent(uid(99)), 'the file is the booked client\'s');
    await click(link);
    assert.deepEqual(opened, [uid(99)], 'the panel is the booked client\'s');
  } finally { await m.unmount(); }
});

test('Codex on #2639: a sessions read the route says failed is unread, never "no session booked"', () => {
  const cal = { calendar: [], sessionsRead: false };
  assert.deepEqual(R.dashPeekSessions(cal, 'live', 'trainer'), { state: 'unread' });
  assert.equal(R.dashNextSessionFor({ profile: { id: uid(1), name: 'Sam R.' } }, R.dashPeekSessions(cal, 'live', 'trainer'), Date.now()).state, 'unread');
  // A read that worked and found nothing is "none"; a feed from before the flag reads as before.
  assert.equal(R.dashNextSessionFor({ profile: { id: uid(1), name: 'Sam R.' } }, R.dashPeekSessions({ calendar: [], sessionsRead: true }, 'live', 'trainer'), Date.now()).state, 'none');
  assert.equal(R.dashPeekSessions({ calendar: [] }, 'live', 'trainer').state, 'read');
  // Today reads the same flag: its day is unread, not clear (the day feed's rows are dropped).
  assert.match(read('dashToday.jsx'), /const todayRows = live && Array\.isArray\(live\.today\) && live\.sessionsRead !== false \? live\.today : null;/);
});

test('Codex on #2639: each client gets a fresh panel, so one client\'s failure never shows in the next one\'s', async () => {
  const cast = asLive(CAST());
  const joint = DashSignals.findJointAttention(cast, NOW, null, 'trainer');
  const feed = DashSignals.getTriageFeed('trainer', cast, NOW);
  const marcus = feed.find((r) => r.client.profile.name === 'Marcus T.');
  const sam = feed.find((r) => r.client.profile.name === 'Sam R.');
  // Two shared clients, so the joint note sits in the same place in both panels.
  const both = [joint[0], { ...joint[0], client: sam.client }];
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  const show = (row) => React.act(async () => root.render(React.createElement(R.DashClientDrawer, { row, role: 'trainer', onClose: () => {}, prefs: null, docked: true, joint: both })));
  const prev = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  try {
    await show(marcus);
    await click(document.querySelector('[data-peek-joint] button'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.match(document.querySelector('[data-peek-joint]').textContent, /Marcus T\.'s nutritionist couldn't be opened just now/);
    await show(sam);
    assert.equal(document.getElementById(document.querySelector('[data-peek]').getAttribute('aria-labelledby')).textContent, 'Sam R.');
    assert.doesNotMatch(document.querySelector('[data-peek-joint]').textContent, /couldn't be opened|Marcus T\./, 'Marcus\'s failure showed in Sam\'s panel');
  } finally {
    globalThis.fetch = prev;
    await React.act(async () => { root.unmount(); });
    div.remove();
  }
});

test('Codex on #2639: with only the joint note shown, a client who isn\'t shared gets the empty panel\'s words', async () => {
  const cast = asLive(CAST());
  const joint = DashSignals.findJointAttention(cast, NOW, null, 'trainer');
  const feed = DashSignals.getTriageFeed('trainer', cast, NOW);
  const sam = feed.find((r) => r.client.profile.name === 'Sam R.');
  const marcus = feed.find((r) => r.client.profile.name === 'Marcus T.');
  const others = R.DASH_DRAWER_VIEWS.trainer.sections.map((x) => x[0]).filter((k) => k !== 'joint');
  const keep = globalThis.useRememberedSet;
  globalThis.useRememberedSet = () => [others, () => {}];
  try {
    let { m } = await drawer(sam, { joint });
    try {
      assert.match(panelText(), /The only section you show is the joint note, which is for shared clients\./);
    } finally { await m.unmount(); }
    ({ m } = await drawer(marcus, { joint }));
    try {
      assert.equal(!!document.querySelector('[data-peek-joint]'), true);
      assert.equal(!!document.querySelector('[data-peek-empty]'), false, 'a shared client has the joint note to show');
    } finally { await m.unmount(); }
  } finally { globalThis.useRememberedSet = keep; }
});
