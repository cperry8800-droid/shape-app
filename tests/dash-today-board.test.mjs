// The coach Today as a widget board (coach dashboard step 3; the owner's design, 2026-11-06):
// six widgets, one question each — the Brief and Up next, At a glance and Money, Needs you and the
// Today timeline — with the catalogue docked beside the board instead of over it.
//   1. the brief: "N clients need your attention" (plural, singular, nobody), each name in ink with
//      their tier's mark beside it, and never a time; then its own sentence, the next session still to come
//      today on the coach's day (owner, 2026-11-06) — not one that has passed or started;
//   2. Needs you shows three rows and folds the rest into gems with what they are;
//   3. the default board is the six, in three pairs of two thirds beside one third;
//   4. Money never prints a figure this page cannot read;
//   5. the catalogue opens beside the board and stays open while the coach arranges it.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as ShapeZone from '../public/newdesign/shapeZone.mjs';
import * as ShapeClientColors from '../public/newdesign/clientColors.mjs';
import { resolveGridLayout } from '../public/newdesign/dashboardLayout.mjs';

const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core');
const preset = require('next/dist/compiled/babel/preset-react');
const DashSignals = require('../public/newdesign/dashSignals.js');
const read = (f) => readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8');
const TODAY = read('dashToday.jsx');
const GRID = read('dashGrid.jsx');
const compile = (src) => babel.transformSync(src, { presets: [preset], babelrc: false, configFile: false }).code;
const todayCode = compile(TODAY);
const gridCode = compile(GRID);

const NAMES = ['dashBriefModel', 'dashBriefPieces', 'dashBriefText', 'dashNextToday', 'dashNeedsItems', 'dashNeedsFold', 'dashNeedsFoldText',
  'DashNeedsBoard', 'DashBriefCard', 'dashRowKeyOpen', 'dashMoneyModel', 'DashMoneyCard', 'dashGlanceCells', 'DASH_TODAY_BOARD',
  'DashUpNextCard', 'DashTimelineCard', 'DashBriefWidget',
  'dashPayoutRead', 'dashPayoutView', 'dashPayoutWhen', 'dashPayoutAmount', 'dashFetchNextPayout', 'dashJointReason'];
function today(win) {
  return new Function('React', 'window', 'DashSignals', 'useDashUnits', 'useRememberedChoice', 'dashMilestonesIn', 'serif', 'sans', 'mono', 'INK', 'TEAL_BRIGHT',
    todayCode + ';return {' + NAMES.join(',') + '};')(React, win, DashSignals, () => null, (s, k, a, f) => React.useState(f), (ms) => ms, 'serif', 'sans', 'monospace', '#f2ede4', '#2ee0c4');
}
function mount() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#today' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.ShapeZone = ShapeZone; dom.window.ShapeClientColors = ShapeClientColors;
  const root = createRoot(document.getElementById('root'));
  return {
    dom, root,
    render: (el) => act(async () => root.render(el)),
    text: () => document.getElementById('root').textContent,
    async done() {
      await act(async () => root.unmount()); dom.window.close();
      globalThis.window = before.window; globalThis.document = before.document; globalThis.IS_REACT_ACT_ENVIRONMENT = before.act;
    },
  };
}
const row = (id, name, severity, reason, action, rankPoints) => ({ severity, client: { profile: { id, name }, ...(rankPoints !== undefined ? { rankPoints } : {}) }, lead: reason ? { reason, action: action || { kind: 'message', label: 'Message' } } : null, flags: [] });
const T = today({ ShapeZone, ShapeClientColors });

// ── 1. The brief ──────────────────────────────────────────────────────────────
test('the brief counts who needs the coach, names them, and says nobody calmly', () => {
  const three = [row('a', 'Marcus T.', 'red', 'r'), row('b', 'Priya S.', 'red', 'r'), row('c', 'Elena R.', 'red', 'r')];
  assert.equal(T.dashBriefText(T.dashBriefModel(three, null)), '3 clients need your attention: Marcus T., Priya S. and Elena R.');
  assert.equal(T.dashBriefText(T.dashBriefModel(three.slice(0, 1), null)), '1 client needs your attention: Marcus T.');
  assert.equal(T.dashBriefText(T.dashBriefModel([], null)), 'Nobody needs your attention right now.');
  // Past three, the rest are counted, not listed.
  const five = three.concat([row('d', 'Sam O.', 'red', 'r'), row('e', 'Jaya P.', 'red', 'r')]);
  assert.equal(T.dashBriefText(T.dashBriefModel(five, null)), '5 clients need your attention: Marcus T., Priya S., Elena R. and 2 more.');
  // A pulse that could not be read is never "nobody".
  assert.equal(T.dashBriefText(T.dashBriefModel(null, null)), "Who needs your attention couldn't be read just now.");
  // The named clients are the coloured pieces, each with their id.
  const named = T.dashBriefPieces(T.dashBriefModel(three, null)).filter((p) => p.name).map((p) => p.id);
  assert.deepEqual(named, ['a', 'b', 'c']);
});

test('the brief takes its count from the engine: red rows with a lead of the coach\'s own', () => {
  const feed = [row('a', 'A', 'red', 'r1'), row('b', 'B', 'amber', 'r2'), row('c', 'C', 'green', 'r3'), row('d', 'D', 'red', null), row('e', 'E', 'unknown', 'r5')];
  const split = DashSignals.coachNeeds(feed);
  assert.deepEqual(split.now.map((r) => r.client.profile.id), ['a']);
  assert.deepEqual(split.week.map((r) => r.client.profile.id), ['b']);
  assert.equal(DashSignals.coachBrief(feed).more, 1, 'the engine\'s own brief reads the same two lists');
  // Through the real engine over the preview roster: every one it counts is red and has a lead.
  const now = new Date();
  const real = DashSignals.coachNeeds(DashSignals.getTriageFeed('trainer', DashSignals.buildMockClients(now), now));
  assert.equal(real.now.every((r) => r.severity === 'red' && !!r.lead), true);
  assert.equal(real.week.every((r) => r.severity === 'amber' && !!r.lead), true);
});

test('the brief names the next session still to come today, at its time, and never one that has passed', () => {
  const zone = 'America/New_York';
  const NOW = Date.parse('2026-11-06T15:00:00Z');                       // 10:00 in New York
  const r = (who, iso, status) => ({ at: new Date(iso), end: new Date(Date.parse(iso) + 45 * 60000), who, status });
  const rows = [
    r('Priya S.', '2026-11-06T13:00:00Z', 'confirmed'),                 // 08:00, earlier today: passed
    r('Underway', '2026-11-06T14:45:00Z', 'confirmed'),                 // 09:45, started: not "next up"
    r('Cancelled', '2026-11-06T16:00:00Z', 'cancelled'),                // not on the day at all
    r('Sam O.', '2026-11-06T19:00:00Z', 'confirmed'),                   // 14:00: the next one
    r('Late', '2026-11-07T03:00:00Z', 'requested'),                     // 22:00 the same New York day
  ];
  const next = T.dashNextToday(rows, null, NOW, zone);
  assert.equal(next.who, 'Sam O.');
  assert.equal(next.time, ShapeZone.formatTime('2026-11-06T19:00:00Z', { zone }), 'the time prints through ShapeZone in the day\'s zone');
  assert.equal(/2:00|14:00/.test(next.time), true);
  const text = T.dashBriefText(T.dashBriefModel([row('a', 'Marcus T.', 'red', 'r')], next));
  assert.equal(text, '1 client needs your attention: Marcus T. Next up today: Sam O. at ' + next.time + '.');
  // The first sentence carries no time; the time is only in the next-appointment sentence.
  const first = text.slice(0, text.indexOf(' Next up today'));
  assert.equal(/\d{1,2}:\d{2}|\bAM\b|\bPM\b|before your/i.test(first), false);
  // The coach's day, not UTC's: 22:00 in New York is still today there.
  assert.equal(T.dashNextToday(rows.slice(4), null, NOW, zone).who, 'Late');
  assert.equal(T.dashNextToday(rows.slice(4), null, NOW, 'UTC'), null, 'in UTC that booking is tomorrow');
  // Nothing left today, over a day that was read: "No more sessions today." (owner, 2026-11-06).
  const done = T.dashNextToday(rows.slice(0, 3), null, NOW, zone);
  assert.equal(done, null, 'a session earlier today, one under way, or a cancelled one is not named');
  assert.equal(T.dashBriefText(T.dashBriefModel([], done, { read: true, unit: 'session' })), 'Nobody needs your attention right now. No more sessions today.');
  assert.equal(T.dashBriefText(T.dashBriefModel([row('a', 'Marcus T.', 'red', 'r')], done, { read: true, unit: 'consult' })), '1 client needs your attention: Marcus T. No more consults today.');
  // An unread day, or the preview, is not an empty one: the sentence is left out.
  assert.equal(T.dashBriefText(T.dashBriefModel([], done, { read: false, unit: 'session' })), 'Nobody needs your attention right now.');
  assert.equal(T.dashBriefText(T.dashBriefModel([], done)), 'Nobody needs your attention right now.');
  // Tomorrow is not today.
  assert.equal(T.dashNextToday([r('Tomorrow', '2026-11-07T15:00:00Z', 'confirmed')], null, NOW, zone), null);
  // The preview has no clock: its NEXT row, at its own time.
  assert.deepEqual(T.dashNextToday(null, [{ time: '07:00', who: 'Priya S.', status: 'DONE' }, { time: '14:00', who: 'Sam O.', status: 'NEXT' }], NOW, zone), { who: 'Sam O.', time: '14:00' });
});

test('the brief card marks each named client\'s tier beside their name, which stays in ink', async () => {
  const m = mount();
  try {
    const t = today(m.dom.window);
    // Marcus is Form (2,400 rank points), Sam Raw at a measured 0, Elena unread (no rank points).
    const model = t.dashBriefModel([row('client-1', 'Marcus T.', 'red', 'r', null, 2400), row('client-3', 'Elena R.', 'red', 'r')], { who: 'Sam O.', id: 'client-2', time: '2:00 PM', points: 0 });
    await m.render(React.createElement(t.DashBriefCard, { model }));
    assert.equal(m.text().includes('2 clients need your attention: Marcus T. and Elena R. Next up today: Sam O. at 2:00 PM.'), true);
    const marks = [...document.querySelectorAll('[data-dash-brief] .sh-tier-mark')];
    assert.deepEqual(marks.map((n) => [n.getAttribute('data-tier'), n.getAttribute('aria-label'), n.getAttribute('title')]),
      [['form', 'Form tier', 'Form tier'], ['raw', 'Raw tier', 'Raw tier']], 'a mark per known tier, named in words; none for the unread one');
    assert.deepEqual(marks.map((n) => n.style.getPropertyValue('--tier-mark')), ['#e0463c', '#5fa96e'], 'the marks are not the tiers\' own colours');
    // The mark rides with the name's first word (no wrap between them), and the name carries no colour.
    assert.deepEqual(marks.map((n) => [n.parentElement.textContent, n.parentElement.style.whiteSpace]), [['Marcus', 'nowrap'], ['Sam', 'nowrap']]);
    assert.equal([...document.querySelectorAll('[data-dash-brief] span')].some((n) => n.style.color !== ''), false, 'a name is tinted');
    // The names carry their tier in words on hover; the unread one carries none.
    assert.deepEqual([...document.querySelectorAll('[data-dash-brief] > span')].map((n) => [n.textContent, n.getAttribute('title')]),
      [['Marcus T.', 'Form tier'], ['Elena R.', null], ['Sam O.', 'Raw tier']]);
  } finally { await m.done(); }
});

test('Up next, the timeline and the brief\'s next appointment mark the client\'s tier from the roster', async () => {
  const m = mount();
  try {
    const t = today(m.dom.window);
    const clients = [{ profile: { id: 'p', name: 'Priya S.' }, rankPoints: 3000 }, { profile: { id: 's', name: 'Sam O.' }, rankPoints: 800 }];
    const items = [{ time: '07:00', who: 'Priya S.', status: 'DONE', done: true }, { time: '14:00', who: 'Sam O.', status: 'NEXT', done: false }, { time: '19:00', who: 'Jaya P.', done: false }];
    const state = { now: Date.UTC(2026, 10, 6, 12), items, nextIdx: 1, next: items[1] };
    const tiers = () => [...document.querySelectorAll('.sh-tier-mark')].map((n) => n.getAttribute('data-tier') + ':' + n.parentElement.textContent);
    // The timeline: the session still to come is marked; the one behind the coach and the client
    // who is not on the roster are not.
    await m.render(React.createElement(t.DashTimelineCard, { rows: null, state, unit: 'session', zone: null, clients, role: 'trainer', card: true }));
    assert.deepEqual(tiers(), ['tempo:Sam']);
    // Up next, the board's card: the client's tier beside the name.
    await m.render(React.createElement(t.DashUpNextCard, { rows: null, state, clients, role: 'trainer', unit: 'session', zone: null, single: true }));
    assert.deepEqual(tiers(), ['tempo:Sam']);
    // The brief widget: its next appointment carries the roster client's tier.
    await m.render(React.createElement(t.DashBriefWidget, { needNow: [], rows: null, demoRows: [{ time: '14:00', who: 'Sam O.', status: 'NEXT' }], zone: null, clients, unit: 'session' }));
    assert.equal(m.text().includes('Next up today: Sam O. at 14:00.'), true);
    assert.deepEqual(tiers(), ['tempo:Sam']);
    // A Needs you row the coach can open says the tier in its name for assistive tech: on the name,
    // which is the row's opener since step 5a (a link beside the action, never a button around it).
    m.dom.window.DashClientDrawer = () => null;
    const r = row('s', 'Sam O.', 'red', 'Reason', null, 800);
    await m.render(React.createElement(t.DashNeedsBoard, { items: T.dashNeedsItems({ now: [r], week: [] }, []), feed: [r], role: 'trainer', prefs: null, dismiss: null }));
    assert.equal(document.querySelector('[data-dash-need] [data-dash-peek-name]').getAttribute('aria-label'), 'Open Sam O., Tempo tier');
    assert.equal(document.querySelector('[data-dash-need]').hasAttribute('role'), false, 'the row is a button around its action again');
  } finally { await m.done(); }
});

test('an unknown tier draws no colour: never Raw, never a status colour', async () => {
  const m = mount();
  try {
    const t = today(m.dom.window);
    for (const v of [undefined, null, NaN, -5, '2400', Infinity]) {
      const model = t.dashBriefModel([row('c', 'Ana B.', 'red', 'r', null, v)], null);
      await m.render(React.createElement(t.DashBriefCard, { model }));
      assert.equal(document.querySelectorAll('[data-dash-brief] .sh-tier-mark').length, 0, `rank points ${String(v)} drew a tier`);
    }
    // A needs-you row with no tier: a hollow gem, no colour and nothing read aloud.
    const items = T.dashNeedsItems({ now: [row('u', 'U.', 'red', 'Reason u')], week: [] }, []);
    await m.render(React.createElement(t.DashNeedsBoard, { items, feed: [], role: 'trainer', prefs: null, dismiss: null }));
    const gem = document.querySelector('[data-dash-need] [data-tier-unknown]');
    assert.equal(!!gem && gem.getAttribute('aria-hidden') === 'true' && gem.style.background === '' && !gem.className, true, 'an unknown tier is not a hollow gem');
    assert.equal(document.querySelectorAll('[data-dash-need] .sh-tier-mark').length, 0);
    // Without the module on the page, a known tier draws nothing either.
    const bare = today({ ShapeZone });
    await m.render(React.createElement(bare.DashBriefCard, { model: bare.dashBriefModel([row('c', 'Ana B.', 'red', 'r', null, 9000)], null) }));
    assert.equal(document.querySelectorAll('.sh-tier-mark').length, 0);
  } finally { await m.done(); }
});

// ── 2. Needs you ──────────────────────────────────────────────────────────────
test('Needs you shows three rows, then folds the rest into gems with what they are', async () => {
  const now = ['m', 'p', 'e'].map((id, i) => row(id, id.toUpperCase() + '.', 'red', 'Reason ' + id, null, [16000, 800, 0][i]));
  // One of the week's clients has no tier read: their gem is hollow.
  const week = ['w1', 'w2', 'w3', 'w4'].map((id, i) => row(id, id.toUpperCase() + '.', 'amber', 'Watch ' + id, null, [5000, 2000, undefined, 749][i]));
  const wins = [{ client: { profile: { id: 'g1', name: 'G1.' }, rankPoints: 120 }, hit: { label: 'First 10k', hitAt: '2026-11-05' } },
    { client: { profile: { id: 'g2', name: 'G2.' } }, hit: { label: 'Streak 30', hitAt: '2026-11-04' } },
    { client: { profile: { id: 'm', name: 'M.' } }, hit: { label: 'Dup', hitAt: '2026-11-03' } }];
  const items = T.dashNeedsItems({ now, week }, wins);
  assert.equal(items.length, 9, 'each client once: a red client\'s win is not a second row');
  assert.deepEqual(items.map((i) => i.kind), ['now', 'now', 'now', 'week', 'week', 'week', 'week', 'good', 'good']);
  const fold = T.dashNeedsFold(items);
  assert.equal(fold.shown.length, 3);
  assert.equal(fold.rest.length, 6);
  assert.equal(T.dashNeedsFoldText(fold), '4 this week · 2 good news');
  // Fewer than four: nothing folds.
  assert.equal(T.dashNeedsFold(items.slice(0, 3)).rest.length, 0);
  // Extra reds fold too, and say so.
  assert.equal(T.dashNeedsFoldText(T.dashNeedsFold(now.concat(now).map((r, i) => ({ ...T.dashNeedsItems({ now: [r], week: [] }, [])[0], id: 'x' + i })))), '3 more need you');

  // A row's keys open its drawer; the same keys on its action button are the button's (#2628 review).
  const rowEl = {}, btnEl = {};
  const key = (k, target) => { const e = { key: k, target, currentTarget: rowEl, prevented: false, preventDefault() { this.prevented = true; } }; let opened = 0; T.dashRowKeyOpen(e, true, () => { opened += 1; }); return { opened, prevented: e.prevented }; };
  assert.deepEqual(key('Enter', rowEl), { opened: 1, prevented: true });
  assert.deepEqual(key(' ', rowEl), { opened: 1, prevented: true });
  assert.deepEqual(key('Enter', btnEl), { opened: 0, prevented: false }, 'Enter on Message is Message, not the drawer');
  assert.deepEqual(key(' ', btnEl), { opened: 0, prevented: false });
  assert.deepEqual(key('a', rowEl), { opened: 0, prevented: false });

  const m = mount();
  try {
    const t = today(m.dom.window);
    await m.render(React.createElement(t.DashNeedsBoard, { items, feed: [], role: 'trainer', prefs: null, dismiss: null }));
    assert.equal(document.querySelectorAll('[data-dash-need]').length, 3, 'more than three rows on the first screen');
    const foldBtn = document.querySelector('[data-dash-fold]');
    assert.equal(!!foldBtn, true);
    assert.equal(/6 more/.test(foldBtn.textContent) && /4 this week/.test(foldBtn.textContent) && /2 good news/.test(foldBtn.textContent), true);
    // One gem per folded client in their tier's colour (a hollow one for the unread tier), named on
    // hover; inside the fold's button they are not read aloud, which says what they are in words.
    const gems = [...foldBtn.querySelectorAll('.sh-tier-mark, [data-tier-unknown]')];
    // (749 points is still Raw: Tempo starts at 750.)
    assert.deepEqual(gems.map((g) => g.getAttribute('data-tier') || 'unknown'), ['peak', 'form', 'unknown', 'raw', 'raw', 'unknown']);
    assert.deepEqual(gems.map((g) => g.getAttribute('title')), ['W1. · Peak tier', 'W2. · Form tier', 'W3.', 'W4. · Raw tier', 'G1. · Raw tier', 'G2.']);
    assert.equal(gems.every((g) => g.getAttribute('aria-hidden') === 'true' && !g.hasAttribute('role')), true);
    // Each row: the tier gem, the name in ink, a labelled status chip, one reason, one action.
    const first = document.querySelector('[data-dash-need]');
    assert.equal(first.textContent.includes('M.') && first.textContent.includes('Needs you') && first.textContent.includes('Reason m'), true);
    const gem = first.querySelector('.sh-tier-mark');
    assert.deepEqual([gem.getAttribute('data-tier'), gem.getAttribute('role'), gem.getAttribute('aria-label')], ['legend', 'img', 'Legend tier']);
    assert.equal([...first.querySelectorAll('span')].some((n) => n.style.color !== '' && n.textContent === 'M.'), false, 'the name is tinted');
    assert.equal(first.querySelectorAll('button').length, 1, 'a row offers one action');
    await act(async () => foldBtn.dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true })));
    assert.equal(document.querySelectorAll('[data-dash-need]').length, 9, 'the fold opens the rest');
    assert.equal(document.querySelectorAll('[data-dash-need="good"]')[0].textContent.includes('Congratulate'), true);
    // Nobody: a calm line, no rows.
    await m.render(React.createElement(t.DashNeedsBoard, { items: [], feed: [], role: 'trainer', prefs: null, dismiss: null }));
    assert.equal(document.querySelectorAll('[data-dash-need]').length, 0);
    assert.equal(/Nobody needs you right now/.test(m.text()), true);
    // Needs you is the one thing to act on: it asks for the highest lift on the board.
    assert.equal(document.querySelector('section[aria-label="Needs you"]').getAttribute('data-dash-lift'), '2');
  } finally { await m.done(); }
});

// ── 3. The default board ──────────────────────────────────────────────────────
function declaredWidgets() {
  const page = TODAY.slice(TODAY.indexOf('function CoachDashboardPage('));
  const arr = page.slice(page.indexOf('const gridWidgets = ['), page.indexOf('\n  ];', page.indexOf('const gridWidgets = [')));
  const out = [];
  for (const m of arr.matchAll(/\{ key: "([a-z]+)", title: /g)) {
    const entry = arr.slice(m.index, arr.indexOf('render:', m.index));
    const size = /size: "([a-z]+)"/.exec(entry);
    out.push({ key: m[1], size: size ? size[1] : null, optional: /optional: true/.test(entry) });
  }
  return out;
}
test('the default board is the six widgets, in three pairs of two thirds beside one third', () => {
  const ws = declaredWidgets();
  assert.ok(ws.length >= 20, 'the widget list moved — this guard is reading nothing');
  assert.deepEqual(ws.filter((w) => !w.optional).map((w) => w.key), ['brief', 'upnext', 'glance', 'money', 'needsyou', 'timeline']);
  assert.deepEqual(T.DASH_TODAY_BOARD, ['brief', 'upnext', 'glance', 'money', 'needsyou', 'timeline']);
  // A fresh key (#2628 review): "needs" was the old tabbed card's, and a saved layout matches by key.
  assert.equal(ws.some((w) => w.key === 'needs'), false, 'no widget reuses the old card\'s key');
  // A coach who never touched the board gets exactly these, at these widths.
  const fresh = resolveGridLayout(null, ws);
  assert.deepEqual(fresh.visible.map((v) => v.key + ':' + v.w), ['brief:8', 'upnext:4', 'glance:8', 'money:4', 'needsyou:8', 'timeline:4']);
  // Every card the old default board carried stays in the catalogue, off until added.
  for (const k of ['queues', 'practice', 'wins', 'roster', 'kpis', 'business']) {
    assert.equal(ws.some((w) => w.key === k && w.optional), true, k + ' is not an optional card');
  }
  // The day column's halves are widgets; nothing sits beside the grid.
  assert.equal(/nowColumn=/.test(page()), false);
  function page() { return TODAY.slice(TODAY.indexOf('function CoachDashboardPage(')); }
});

test('At a glance is three figures from the KPI pool, and Check-ins reviewed counts only a read review', () => {
  const NOW = new Date('2026-11-06T12:00:00Z');                          // a Friday; this week is Nov 2
  const ck = (id, weekOf, reviewed) => ({ profile: { id, name: id }, checkIn: { lastWeekOf: weekOf, latest: { weekOf, reviewed } } });
  const ctx = { clients: [ck('a', '2026-11-02', true), ck('b', '2026-10-26', false), ck('c', '2026-11-02', null), ck('d', '2026-10-12', false)], queue: [{ state: 'ready' }, { state: 'draft' }], role: 'trainer', now: NOW };
  const out = DashSignals.dashKpiValue('reviewed', ctx);
  assert.equal(out.value, 1);
  assert.equal(out.sub, 'of 2 · this week and last · 1 not read yet', 'an unread review is not counted but is said; a month-old check-in is not counted');
  const unread = DashSignals.dashKpiValue('reviewed', { live: { kpis: {} }, clients: [ck('c', '2026-11-02', null)], now: NOW });
  assert.equal(unread.value, null);
  assert.equal(unread.why, "couldn't be read");
  // A check-in the record only dates (no review state read) is unread too, never "no check-ins";
  // in the signed-out preview, which reads no reviews, it is "live only".
  const dated = { profile: { id: 'z', name: 'z' }, checkIn: { lastWeekOf: '2026-11-02' } };
  assert.equal(DashSignals.dashKpiValue('reviewed', { live: { kpis: {} }, clients: [dated], now: NOW }).why, "couldn't be read");
  assert.equal(DashSignals.dashKpiValue('reviewed', { live: null, clients: [dated], now: NOW }).why, 'live only');
  assert.equal(DashSignals.dashKpiValue('reviewed', { clients: [], now: NOW }).why, 'no check-ins in the last two weeks');
  // An overview still loading, or failed, is not "no check-in" (#2628 review): it is unread.
  const pending = (id, state) => ({ profile: { id, name: id }, progressRead: { state, checkedAt: null }, checkIn: null });
  const part = DashSignals.dashKpiValue('reviewed', { live: { kpis: {} }, clients: [ck('a', '2026-11-02', true), pending('l', 'loading'), pending('u', 'unavailable')], now: NOW });
  assert.equal(part.value, 1);
  assert.equal(part.sub, 'of 1 · this week and last · 2 not read yet');
  const none = DashSignals.dashKpiValue('reviewed', { live: { kpis: {} }, clients: [pending('l', 'loading')], now: NOW });
  assert.equal(none.value, null);
  assert.equal(none.why, "couldn't be read", 'never "no check-ins" while an overview is unread');
  assert.equal(DashSignals.dashKpiValue('reviewed', { live: { kpis: {} }, clients: [{ ...ck('r', '2026-11-02', true), progressRead: { state: 'ready' } }], now: NOW }).value, 1, 'a read overview counts');
  // The account's week, not the device's (#2628 review): 03:00 UTC on Monday 9 November is still
  // Sunday in New York, whose "last week" is 26 October, and already Monday noon in Tokyo.
  const prevZ = globalThis.ShapeZone;
  globalThis.ShapeZone = ShapeZone;
  try {
    const MON = new Date('2026-11-09T03:00:00Z');
    const late = { clients: [ck('a', '2026-10-26', true)], now: MON };
    assert.equal(DashSignals.dashKpiValue('reviewed', { ...late, zone: 'America/New_York' }).value, 1);
    assert.equal(DashSignals.dashKpiValue('reviewed', { ...late, zone: 'Asia/Tokyo' }).value, null);
    // No zone passed (the day feed failed): the account's zone through ShapeZone, not the device's.
    ShapeZone.setAccountZone('America/New_York');
    try { assert.equal(DashSignals.dashKpiValue('reviewed', late).value, 1); } finally { ShapeZone.clearAccountZone(); }
    ShapeZone.setAccountZone('Asia/Tokyo');
    try { assert.equal(DashSignals.dashKpiValue('reviewed', late).value, null); } finally { ShapeZone.clearAccountZone(); }
  } finally { if (prevZ === undefined) delete globalThis.ShapeZone; else globalThis.ShapeZone = prevZ; }
  const cells = T.dashGlanceCells('trainer', ctx);
  assert.deepEqual(cells.map((c) => c.l), ['Programs due', 'Check-ins reviewed', 'Roster logging']);
  assert.deepEqual(cells.map((c) => c.k), ['2', '1', '—'], 'no shared logs reads as a dash, never 0%');
  assert.equal(T.dashGlanceCells('nutritionist', ctx)[0].l, 'Plans due');
});

// ── 4. Money ──────────────────────────────────────────────────────────────────
test('Money never prints a figure it cannot read', async () => {
  const live = (cents) => ({ kpis: { monthlyNetCents: cents, activeClients: 7 } });
  const ok = T.dashMoneyModel(live(412000), { live: live(412000), clients: [] }, false, { state: 'none' });
  assert.equal(ok.recurring.k, '$4,120');
  assert.equal(ok.payout.state, 'none');
  const unread = T.dashMoneyModel(live(null), { live: live(null), clients: [] }, false, { state: 'unread' });
  assert.equal(unread.recurring.k, '—');
  assert.equal(unread.recurring.sub, "couldn't be read");
  assert.equal(unread.payout.state, 'unread');
  // A signed-in page whose payout read has not been asked is unread, never the sample.
  assert.equal(T.dashMoneyModel(live(412000), { live: live(412000), clients: [] }, false, null).payout.state, 'unread');
  // The signed-out preview shows its own sample's payout (the demo band labels the page).
  const sample = DashSignals.buildMockClients(new Date());
  const demo = T.dashMoneyModel(null, { live: null, clients: sample }, true);
  assert.equal(/^\$/.test(demo.recurring.k), true);
  assert.equal(demo.payout.state === 'sample' && demo.payout.k === DashSignals.demoPayouts(sample, new Date()).payoutShort, true, 'the preview\'s payout is its own sample\'s date');
  // A signed-in coach whose day feed failed (live null, source live) never gets the sample's payout:
  // their own read's answer, or "couldn't be read" without one, and never "not connected".
  assert.equal(T.dashMoneyModel(null, { live: null, clients: sample }, false).payout.state, 'unread');
  assert.equal(T.dashMoneyModel(null, { live: null, clients: sample }).payout.state, 'unread', 'no flag is not the preview');
  assert.equal(T.dashMoneyModel(null, { live: null, clients: sample }, false, { state: 'none' }).payout.state, 'none');
  // The preview is the page's own flag, and it alone says sample (the page reads no payout there).
  assert.equal(T.dashMoneyModel(null, { live: null, clients: sample }, true, { state: 'none' }).payout.state, 'sample');
  // The page: the sample only on the preview (source "demo"), and "reading" while the page's first
  // read is in flight (source null), never the sample's payout flashed at a coach.
  assert.equal(/const money = dashMoneyModel\(live, kpiCtx, source === "demo", source == null \? \{ state: "loading" \} : payoutRead\);/.test(TODAY), true);
  assert.equal(T.dashMoneyModel(null, { live: null, clients: sample }, false, { state: 'loading' }).payout.state, 'loading');

  const m = mount();
  try {
    const t = today(m.dom.window);
    await m.render(React.createElement(t.DashMoneyCard, { model: unread, role: 'trainer' }));
    const payout = document.querySelector('[data-dash-payout="unread"]');
    assert.equal(!!payout, true);
    assert.equal(payout.textContent, "Your next payout couldn't be read just now.");
    assert.equal(/\$\d/.test(m.text()), false, 'a dollar figure on a card that could read none');
    assert.equal(/aren't connected to Today/.test(m.text()), false, 'the old placeholder is back');
  } finally { await m.done(); }
});

// ── 4b. The next payout, from Stripe (the owner's answer to #2628) ────────────
test('the payout read: every answer of the route is one honest state', () => {
  const next = { amountCents: 48312, currency: 'usd', arrivalDate: Date.UTC(2026, 10, 9), status: 'in_transit' };
  assert.deepEqual(T.dashPayoutRead(200, { isProvider: true, connected: true, next }), { state: 'next', next });
  assert.deepEqual(T.dashPayoutRead(200, { isProvider: true, connected: true, next: null }), { state: 'none' });
  assert.deepEqual(T.dashPayoutRead(200, { isProvider: true, connected: false }), { state: 'setup' });
  // Every failure is unread: Stripe down, the route's own errors, an answer it cannot use.
  const unread = [
    [200, { isProvider: true, connected: true, error: true }],
    [200, { isProvider: true, connected: true }],                         // no `next` at all is not "none"
    [200, { isProvider: false }],
    [200, { isProvider: false, connected: false }],                       // no listing is not "set payouts up"
    [200, { isProvider: true, connected: true, next: { amountCents: null, currency: 'usd' } }],
    [200, { isProvider: true, connected: true, next: { amountCents: 100, currency: '' } }],
    [200, null], [401, { error: 'x' }], [500, { isProvider: true, connected: false }], [503, null],
  ];
  for (const [status, body] of unread) assert.equal(T.dashPayoutRead(status, body).state, 'unread', status + ' ' + JSON.stringify(body));
});

test('the payout read asks the route for this role, and a dead network is unread', async () => {
  const prev = globalThis.fetch;
  const asked = [];
  try {
    globalThis.fetch = async (url, opts) => { asked.push([url, opts && opts.credentials]); return { ok: true, status: 200, json: async () => ({ isProvider: true, connected: true, next: null }) }; };
    assert.deepEqual(await T.dashFetchNextPayout('nutritionist'), { state: 'none' });
    assert.deepEqual(asked, [['/api/coach/next-payout?role=nutritionist', 'same-origin']]);
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ isProvider: true, connected: false }) });
    assert.deepEqual(await T.dashFetchNextPayout('trainer'), { state: 'unread' }, 'a failed answer was read as its body');
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    assert.deepEqual(await T.dashFetchNextPayout('trainer'), { state: 'unread' });
  } finally { globalThis.fetch = prev; }
});

test('the next payout prints its amount, currency and arrival day, on the coach\'s day', () => {
  const zone = 'America/Los_Angeles';
  const NOW = Date.parse('2026-11-06T18:00:00Z');                       // 10:00 Friday in Los Angeles
  const day = (d) => Date.UTC(2026, 10, d);                              // Stripe: the day's midnight, UTC
  // The amount in its own currency's units.
  assert.equal(T.dashPayoutAmount(48312, 'usd'), new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(483.12));
  assert.equal(T.dashPayoutAmount(5000, 'jpy'), new Intl.NumberFormat(undefined, { style: 'currency', currency: 'JPY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(5000), 'a zero-decimal currency was divided by 100');
  assert.equal(T.dashPayoutAmount(12340, 'kwd'), new Intl.NumberFormat(undefined, { style: 'currency', currency: 'KWD', minimumFractionDigits: 3 }).format(12.34));
  assert.equal(T.dashPayoutAmount(100, 'zzz!'), '1.00 ZZZ!', 'a currency Intl cannot print is still named, never dollars');
  // Today and tomorrow are the coach's: 6 Nov is today in Los Angeles at 10:00, and still 5 Nov's
  // tomorrow at 23:00 the night before in Los Angeles (07:00 UTC on the 6th).
  assert.equal(T.dashPayoutWhen(day(6), zone, NOW), 'arrives today');
  assert.equal(T.dashPayoutWhen(day(7), zone, NOW), 'arrives tomorrow');
  assert.equal(T.dashPayoutWhen(day(6), zone, Date.parse('2026-11-06T07:00:00Z')), 'arrives tomorrow');
  assert.equal(T.dashPayoutWhen(day(6), 'UTC', Date.parse('2026-11-06T07:00:00Z')), 'arrives today');
  // A later day prints as that calendar day: never the day before, west of Greenwich.
  const nov9 = ShapeZone.formatDate(Date.parse('2026-11-09T12:00:00Z'), { zone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  assert.equal(T.dashPayoutWhen(day(9), zone, NOW), 'arrives ' + nov9);
  assert.equal(/9/.test(nov9) && /Mon/.test(nov9), true, nov9);
  assert.equal(T.dashPayoutWhen(day(4), zone, NOW).startsWith('was due '), true, 'a late payout reads as arriving');
  assert.equal(T.dashPayoutWhen(null, zone, NOW), null);
  const view = T.dashPayoutView({ state: 'next', next: { amountCents: 48312, currency: 'usd', arrivalDate: day(7), status: 'in_transit' } }, zone, NOW);
  assert.deepEqual(view, { state: 'next', k: T.dashPayoutAmount(48312, 'usd'), sub: 'arrives tomorrow · USD' });
  assert.equal(T.dashPayoutView({ state: 'next', next: { amountCents: 100, currency: 'eur', arrivalDate: null } }, zone, NOW).sub, 'on its way, not landed yet · EUR');
  // The model reads the route's zone (kpiCtx.zone) for the coach's day: at 07:00 UTC it is still
  // the 5th in Los Angeles, so the 6th is tomorrow there.
  const model = T.dashMoneyModel({ kpis: { monthlyNetCents: 1 } }, { live: { kpis: { monthlyNetCents: 1 } }, clients: [], zone }, false, { state: 'next', next: { amountCents: 100, currency: 'usd', arrivalDate: day(6) } }, Date.parse('2026-11-06T07:00:00Z'));
  assert.equal(model.payout.sub, 'arrives tomorrow · USD');
});

test('the Money card says each payout state, and links to setting payouts up where Business does', async () => {
  const m = mount();
  try {
    const t = today(m.dom.window);
    const card = async (read) => {
      await m.render(React.createElement(t.DashMoneyCard, { model: t.dashMoneyModel({ kpis: { monthlyNetCents: 412000 } }, { live: { kpis: { monthlyNetCents: 412000 } }, clients: [], zone: 'UTC' }, false, read, Date.parse('2026-11-06T12:00:00Z')), role: 'trainer' }));
      const cell = document.querySelector('[data-dash-payout]');
      return { state: cell.getAttribute('data-dash-payout'), text: cell.textContent, href: cell.querySelector('a') ? cell.querySelector('a').getAttribute('href') : null };
    };
    const next = await card({ state: 'next', next: { amountCents: 48312, currency: 'usd', arrivalDate: Date.UTC(2026, 10, 7) } });
    assert.equal(next.state, 'next');
    assert.equal(next.text, t.dashPayoutAmount(48312, 'usd') + 'arrives tomorrow · USD');
    const none = await card({ state: 'none' });
    assert.deepEqual([none.state, none.text], ['none', 'No payout scheduled right now.']);
    const setup = await card({ state: 'setup' });
    assert.equal(setup.state, 'setup');
    assert.equal(setup.text, "Payouts aren't set up yet. Set them up in Business →");
    assert.equal(setup.href, 'TrainerApp.html#business?section=money', 'not the Business page\'s Money section, where it sets payouts up');
    const loading = await card({ state: 'loading' });
    assert.equal(loading.state, 'loading');
    for (const r of [{ state: 'none' }, { state: 'setup' }, { state: 'loading' }, { state: 'unread' }]) {
      await card(r);
      const cell = document.querySelector('[data-dash-payout]');
      assert.equal(/\d/.test(cell.textContent), false, r.state + ' printed a figure');
    }
    // The halves stack where the card can't hold two cells a five-figure payout fits (measured in
    // Chromium: "$12,483.12" overran a 153px half at a 1100px window; a 170px cell holds it).
    const money = document.querySelector('section[aria-label="Money"]');
    assert.equal(money.style.gridTemplateColumns, 'repeat(auto-fit, minmax(170px, 1fr))');
    // The nutritionist's link is their own page's.
    await m.render(React.createElement(t.DashMoneyCard, { model: t.dashMoneyModel({ kpis: {} }, { live: { kpis: {} }, clients: [] }, false, { state: 'setup' }), role: 'nutritionist' }));
    assert.equal(document.querySelector('[data-dash-payout="setup"] a').getAttribute('href'), 'NutritionistApp.html#business?section=money');
  } finally { await m.done(); }
  // The page reads it on a live page only, and the preview is its own source, never `live` null.
  const page = TODAY.slice(TODAY.indexOf('function CoachDashboardPage('));
  assert.equal(/const payoutRead = useDashNextPayout\(role, source === "live"\);/.test(page), true);
  assert.equal(/const money = dashMoneyModel\(live, kpiCtx, source === "demo", /.test(page), true);
  assert.equal(/return live \? \(read \|\| \{ state: "loading" \}\) : null;/.test(TODAY), true, 'the preview is handed a read');
});

// ── 5. Customize keeps the board in view ──────────────────────────────────────
test('the catalogue opens beside the board, not over it, and stays open while the coach arranges it', async () => {
  const m = mount();
  try {
    const { DgCatalog } = new Function('React', 'ReactDOM', 'window', gridCode + ';return { DgCatalog };')(React, ReactDOM, m.dom.window);
    const dock = document.createElement('aside');
    const board = document.createElement('div');
    document.body.appendChild(board); document.body.appendChild(dock);
    const opened = [];
    const rows = [{ key: 'brief', title: 'Brief', on: true, canAdd: false, empty: false }, { key: 'wins', title: 'Client wins', blurb: 'Milestones', on: false, canAdd: true, empty: false }];
    await m.render(React.createElement(DgCatalog, { rows, onAdd: () => {}, onRemove: () => {}, onReset: () => {}, dock, onOpenChange: (v) => opened.push(v) }));
    const btn = document.querySelector('.dash-catalog-btn');
    await act(async () => btn.dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true })));
    const panel = document.querySelector('.dash-widget-catalog');
    assert.equal(!!panel, true);
    assert.equal(dock.contains(panel), true, 'the panel is not in the column beside the board');
    assert.equal(panel.style.position === 'fixed', false, 'a docked panel floats over the cards');
    assert.equal(opened[opened.length - 1], true, 'the board was not told to make room');
    // Arranging the board (a press on a card) leaves it open.
    await act(async () => board.dispatchEvent(new m.dom.window.MouseEvent('mousedown', { bubbles: true })));
    assert.equal(!!document.querySelector('.dash-widget-catalog'), true, 'a press on the board closed the catalogue');
    // Done closes it, and the board takes its width back.
    const done = [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Done');
    await act(async () => done.dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true })));
    assert.equal(!!document.querySelector('.dash-widget-catalog'), false);
    assert.equal(opened[opened.length - 1], false);
  } finally { await m.done(); }
  // DashGrid opens a second column for it, and the Today shell asks for the dock.
  assert.equal(/\.dg-docked \.dg-board-body\{grid-template-columns:minmax\(0,1fr\) 320px\}/.test(GRID), true);
  assert.equal(/dock=\{docking \? dockEl : null\} onOpenChange=\{setCatalogOpen\}/.test(GRID), true);
  assert.equal(/const docking = dockCatalog && !mobile && dockRoom;/.test(GRID), true);
  // The dock takes its column only where the board keeps its pairs (#2628 review): measured in
  // Chromium, the board is 1312px at a 1440 window, 1152 at 1280, 972 at 1100 and 864 at 900.
  const fits = new Function(GRID.slice(GRID.indexOf('const DG_DOCK_COL'), GRID.indexOf('// The docked panel:')) + ';return dgDockFits;')();
  assert.deepEqual([1312, 1152, 972, 864, 0].map(fits), [true, true, false, false, true]);
  assert.equal(/<DashGrid role=\{role\} tab="today" widgets=\{gridWidgets\} dockCatalog=\{!!dockCatalog\} keepEarlierToday=\{!!keepEarlierToday\} \/>/.test(read('trainerDashboard.jsx')), true);
});

// ── 6. Shared clients on the default board (the owner's answer to #2628) ─────
const jointOf = (id, name, role = 'nutritionist', userId = 'co-' + id) => ({ client: { profile: { id, name } }, coCoach: { role, userId, name: 'Rae' },
  trainingFlags: [{ key: 'streak_broken', label: 'Streak broken' }], nutritionFlags: [{ key: 'food_gap', label: 'No logs 3d' }], action: { kind: 'care_team', label: 'Start joint note' } });
test('Needs you flags a shared client: a "Shared" chip naming the other coach\'s role, the joint reason and the joint note', () => {
  const now = [row('m', 'M.', 'red', 'Reason m'), row('p', 'P.', 'red', 'Reason p')];
  const week = [row('w1', 'W1.', 'amber', 'Watch w1'), row('s', 'S.', 'amber', 'Watch s')];
  const wins = [{ client: { profile: { id: 'x', name: 'X.' } }, hit: { label: 'First PR', hitAt: '2026-11-05' } }, { client: { profile: { id: 'lone', name: 'Lone.' } }, hit: { label: 'Dup', hitAt: '2026-11-04' } }];
  const items = T.dashNeedsItems({ now, week }, wins, [jointOf('p', 'P.'), jointOf('s', 'S.'), jointOf('lone', 'Lone.')]);
  // Each keeps the engine's place; a joint client the engine did not list comes in after "now".
  assert.deepEqual(items.map((i) => i.id), ['m', 'p', 'lone', 'w1', 's', 'x']);
  assert.deepEqual(items.map((i) => i.kind), ['now', 'now', 'week', 'week', 'week', 'good']);
  assert.deepEqual(items.map((i) => i.shared || null), [null, 'nutritionist', 'nutritionist', null, 'nutritionist', null]);
  const p = items[1];
  assert.equal(p.reason, 'Slipping on both sides: streak broken and no logs 3d.');
  assert.equal(p.action.label, 'Start joint note');
  assert.equal(p.joint.coCoach.userId, 'co-p');
  assert.equal(items[0].reason, 'Reason m', 'a client nobody shares lost their own reason');
  // The fold keeps three rows and its "N more" line, and names a shared client folded away.
  const fold = T.dashNeedsFold(items);
  assert.equal(fold.shown.length, 3);
  assert.equal(T.dashNeedsFoldText(fold), '2 this week · 1 good news · 1 shared');
  // No joint attention: the rows are #2628's, untouched.
  const plain = T.dashNeedsItems({ now, week }, wins);
  assert.equal(plain.some((i) => 'shared' in i || 'joint' in i), false);
  assert.equal(T.dashNeedsFoldText(T.dashNeedsFold(plain)), '1 this week · 2 good news');
  // An entry without a co-coach of the other discipline is not a shared client.
  assert.equal(T.dashNeedsItems({ now, week: [] }, [], [{ ...jointOf('p', 'P.'), coCoach: null }])[1].shared, undefined);
  // The trainer's board names the nutritionist; the nutritionist's names the trainer.
  assert.equal(T.dashNeedsItems({ now, week: [] }, [], [jointOf('m', 'M.', 'trainer')])[0].shared, 'trainer');
  // The note takes the row when the coach's own lead is part of the slip…
  const led = (key, label, action) => ({ ...row('k', 'K.', 'red', 'Own reason'), lead: { key, reason: 'Own reason', action } });
  const slip = T.dashNeedsItems({ now: [led('streak_broken', 'Streak broken', { kind: 'message', label: 'Message' })], week: [] }, [], [jointOf('k', 'K.')])[0];
  assert.equal(slip.action.label === 'Start joint note' && !!slip.joint, true);
  // …never over a lead the engine ranks above it: a flagged screening keeps its read, and the chip.
  const screening = T.dashNeedsItems({ now: [led('screening_flagged', 'Screening', { kind: 'read_screening', label: 'Read health screening' })], week: [] }, [], [jointOf('k', 'K.')])[0];
  assert.equal(screening.shared, 'nutritionist');
  assert.equal(screening.action.label, 'Read health screening');
  assert.equal(screening.reason, 'Own reason');
  assert.equal('joint' in screening, false, 'the joint note stands where the screening read was');
});

test('the shared row draws its chip and opens the private note to the other coach, never a message to the client', async () => {
  const P = '11111111-1111-4111-8111-111111111111';
  const now = [row('m', 'M.', 'red', 'Reason m'), row(P, 'Priya S.', 'red', 'Reason p')];
  const items = T.dashNeedsItems({ now, week: [] }, [], [jointOf(P, 'Priya S.', 'nutritionist', '22222222-2222-4222-8222-222222222222')]);
  const m = mount();
  const prevFetch = globalThis.fetch;
  const posted = [];
  try {
    globalThis.fetch = async (url, opts) => { posted.push({ url, method: opts && opts.method, body: opts && opts.body ? JSON.parse(opts.body) : null }); return { ok: true, json: async () => ({ conversationId: 'conv-1' }) }; };
    const opened = [];
    m.dom.window.__openChatTo = (o) => opened.push(o);
    const t = today(m.dom.window);
    await m.render(React.createElement(t.DashNeedsBoard, { items, feed: [], role: 'trainer', prefs: null, dismiss: null }));
    const rows = [...document.querySelectorAll('[data-dash-need]')];
    assert.equal(rows.length, 2);
    const shared = rows[1].querySelector('[data-dash-shared]');
    assert.equal(!!shared && shared.textContent === 'Shared · nutritionist', true);
    assert.equal(rows[0].querySelector('[data-dash-shared]') === null, true, 'a client nobody shares carries the chip');
    assert.equal(rows[1].textContent.includes('Needs you') && rows[1].textContent.includes('Slipping on both sides'), true);
    const btn = rows[1].querySelector('button');
    assert.equal(btn.textContent, 'Start joint note');
    assert.equal(rows[1].querySelectorAll('button').length, 1, 'a row offers one action');
    const before = m.dom.window.location.href;
    await act(async () => { btn.dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    assert.deepEqual(posted.map((x) => [x.url, x.method, x.body && x.body.counterpartUserId]), [['/api/me/shared-clients/' + P + '/thread', 'POST', '22222222-2222-4222-8222-222222222222']]);
    assert.equal(opened.length === 1 && opened[0].conversationId === 'conv-1', true, 'the care-team thread did not open');
    assert.equal(m.dom.window.location.href, before, 'the joint note went to the client\'s thread');
    const status = () => document.querySelector('section[aria-label="Needs you"] [role="status"]').textContent;
    assert.equal(status(), '', 'an opened note said it failed');
    // ⚠ Never a button that does nothing: a refused thread says so, in the card's one live region…
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'Not on this care team.' }) });
    await act(async () => { btn.dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(status(), "Your private thread with Priya S.'s nutritionist couldn't be opened just now.");
    assert.equal(rows[1].querySelector('[role="status"]') === null, true, 'a live region inside a button row is never heard');
    // …and the preview's client (not a real account) is told where the note opens, without a request.
    const demoItems = T.dashNeedsItems({ now: [row('demo-2', 'Marcus T.', 'red', 'r')], week: [] }, [], [jointOf('demo-2', 'Marcus T.', 'nutritionist', 'demo-coach-nutritionist')]);
    await m.render(React.createElement(t.DashNeedsBoard, { items: demoItems, feed: [], role: 'trainer', prefs: null, dismiss: null }));
    posted.length = 0;
    globalThis.fetch = async (url) => { posted.push({ url }); return { ok: true, json: async () => ({}) }; };
    await act(async () => { document.querySelector('[data-dash-need] button').dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(status(), "Your private thread with Marcus T.'s nutritionist opens on a live account.");
    assert.equal(posted.length, 0);
  } finally { globalThis.fetch = prevFetch; await m.done(); }
});

test('through the real engine: the preview\'s shared client is flagged on both coaches\' boards', () => {
  const now = new Date();
  const clients = DashSignals.buildMockClients(now);
  for (const [role, other] of [['trainer', 'nutritionist'], ['nutritionist', 'trainer']]) {
    const joint = DashSignals.findJointAttention(clients, now, undefined, role);
    assert.ok(joint.length > 0, role + ': the preview has no joint client, so this guard reads nothing');
    const items = T.dashNeedsItems(DashSignals.coachNeeds(DashSignals.getTriageFeed(role, clients, now)), [], joint);
    const flagged = items.filter((i) => i.shared);
    assert.equal(flagged.length, joint.length, role + ': a joint client is missing from Needs you');
    assert.equal(flagged.every((i) => i.shared === other), true);
    // Each one's action is the joint note exactly when its own lead is part of the slip (or it has none).
    for (const it of flagged) {
      const j = joint.find((x) => x.client.profile.id === it.id);
      const lead = it.row && it.row.lead ? it.row.lead.key : null;
      const part = !lead || j.trainingFlags.concat(j.nutritionFlags).some((f) => f.key === lead);
      assert.equal(it.action.label === 'Start joint note', part, role + ' ' + it.name + ' (' + lead + ')');
    }
    assert.equal(flagged.some((i) => !!i.joint), true, role + ': the preview never shows the joint note, so this guard reads nothing');
  }
  // Needs you on the page is handed the page's joint attention.
  assert.equal(/<DashNeedsWidget split=\{needSplit\} clients=\{clients\} feed=\{triage\} joint=\{joint\}/.test(TODAY), true);
});

// ── 7. A coach's earlier Today, kept as a dashboard of its own (the owner's answer to #2628) ──
const G = new Function('React', 'ReactDOM', 'window', gridCode + ';return { dgKeepEarlierToday, dgEarlierTodayDue, dgEarlierTodayGate, dgEarlierTodayTab, dgCreateLayoutStore, dgBoards, dgBoardEdit };')(React, ReactDOM, {});
// The Today a trainer saved before #2628: the tabbed queues (`needs`) on top, Practice, the Week
// ahead (optional, added), the Business overview and summary; Client wins hidden.
const OLD_TODAY = {
  items: [{ id: 'needs', x: 0, y: 0, w: 12, h: 40 }, { id: 'practice', x: 0, y: 40, w: 12, h: 10 }, { id: 'week', x: 0, y: 50, w: 6, h: 20 },
    { id: 'kpis', x: 0, y: 70, w: 12, h: 10 }, { id: 'business', x: 0, y: 80, w: 12, h: 12 }],
  hidden: ['wins'], added: ['week'], mobileOrder: ['needs', 'week', 'practice'],
};
const OLD_DOC = () => ({ trainer: { today: JSON.parse(JSON.stringify(OLD_TODAY)), clients: { items: [{ id: 'roster', x: 0, y: 0, w: 12, h: 30 }], hidden: ['notes'] } }, client: { today: { hidden: ['x'] } } });
// The Today widgets the build before #2628 declared, for the trainer (dashToday.jsx at c57ee80).
const BEFORE_2628 = [['needs', 'full'], ['checkins', 'half', 1], ['setup', 'full', 1], ['replies', 'half', 1], ['capacity', 'half', 1], ['pulse', 'half', 1], ['schedule', 'half', 1], ['queue', 'full', 1],
  ['practice', 'full'], ['wins', 'full'], ['kpis', 'full'], ['business', 'full'], ['week', 'half', 1], ['status', 'half', 1], ['movers', 'half', 1], ['anniversaries', 'half', 1], ['revenue', 'half', 1], ['ending', 'half', 1], ['notes', 'half', 1]]
  .map(([key, size, optional]) => ({ key, size, optional: !!optional }));

test('an earlier Today is copied whole into "My earlier dashboard", and the active board starts as the six', () => {
  const doc = OLD_DOC();
  const before = JSON.stringify(doc);
  assert.equal(G.dgEarlierTodayDue(doc, 'trainer'), true);
  const next = G.dgKeepEarlierToday(doc, 'trainer', 'board-1');
  assert.equal(JSON.stringify(doc), before, 'the op changed the document it was handed');
  const lib = G.dgBoards(next, 'trainer');
  assert.equal(lib.active, 'default', 'the new six-widget board is not the active one');
  assert.deepEqual(lib.boards.map((b) => [b.id, b.name]), [['default', 'My dashboard'], ['board-1', 'My earlier dashboard']]);
  const copy = lib.boards[1];
  assert.deepEqual(copy.tabs.clients, OLD_DOC().trainer.clients, 'the whole board: every tab, as it was');
  // The active board: Today is the six-widget board; its other tabs are untouched.
  assert.deepEqual(next.trainer.today, {});
  assert.deepEqual(lib.boards[0].tabs.today, {});
  assert.deepEqual(next.trainer.clients, OLD_DOC().trainer.clients);
  assert.deepEqual(next.earlierToday, { trainer: 'board-1' });
  assert.deepEqual(next.client, OLD_DOC().client, 'another role\'s layout moved');
  // Once: a marked document is not copied again, and the next op answers it unchanged.
  assert.equal(G.dgEarlierTodayDue(next, 'trainer'), false);
  assert.equal(G.dgKeepEarlierToday(next, 'trainer', 'board-2'), next);
  // The six-widget build draws the copy as the old build drew the earlier Today: the same cards in
  // the same places (the tabbed queues under their new key), and the old day column's two halves.
  const oldView = resolveGridLayout(OLD_TODAY, BEFORE_2628);
  const nowWidgets = declaredWidgets().filter((w) => w.key !== 'roster');
  const copyView = resolveGridLayout(copy.tabs.today, nowWidgets);
  const place = (v) => [v.key, v.x, v.y, v.w, v.h].join(':');
  assert.equal(oldView.visible.length, 5, 'the old build\'s own view of the fixture moved');
  assert.deepEqual(copyView.visible.slice(0, oldView.visible.length).map(place), oldView.visible.map((v) => ({ ...v, key: v.key === 'needs' ? 'queues' : v.key })).map(place));
  assert.deepEqual(copyView.visible.slice(oldView.visible.length).map((v) => v.key), ['upnext', 'timeline']);
  for (const k of ['brief', 'glance', 'money', 'needsyou', 'wins']) assert.equal(copyView.hidden.includes(k), true, k + ' is on the earlier board');
  assert.deepEqual(copy.tabs.today.mobileOrder, ['queues', 'week', 'practice']);
  // The old key is gone from every list: a saved `needs` names no card in this build (#2628 review).
  const lists = (t) => [t.items.map((i) => i.id), t.order || [], t.mobileOrder || [], t.hidden || [], t.added || []];
  assert.equal(lists(copy.tabs.today).some((l) => l.includes('needs')), false, 'a saved `needs` survived on the earlier board');
  // …and the active board's Today resolves to exactly the six.
  assert.deepEqual(resolveGridLayout(next.trainer.today, nowWidgets).visible.map((v) => v.key), ['brief', 'upnext', 'glance', 'money', 'needsyou', 'timeline']);
  // A nutritionist's Roster health was a default of theirs; a trainer's Today never had one.
  assert.equal(G.dgEarlierTodayTab({ items: [] }, 'nutritionist').added.includes('roster'), true);
  assert.equal(G.dgEarlierTodayTab({ items: [] }, 'trainer').added.includes('roster'), false);
  // A card the coach had hidden stays off, under its new key: the tabbed queues hidden are hidden
  // queues, not added back, and the order a preset saved (`order`) is renamed too.
  const hid = G.dgEarlierTodayTab({ hidden: ['needs', 'wins'], order: ['needs', 'ending'], added: ['ending'] }, 'trainer');
  assert.equal(hid.added.includes('queues'), false);
  assert.equal(hid.hidden.includes('queues') && !hid.hidden.includes('needs') && hid.hidden.includes('wins'), true, JSON.stringify(hid.hidden));
  assert.deepEqual(hid.order, ['queues', 'ending']);
  assert.equal(resolveGridLayout(hid, nowWidgets).visible.some((v) => v.key === 'queues'), false, 'the hidden Work queues came back');
  // An added old card stays added under its new key.
  assert.equal(G.dgEarlierTodayTab({ added: ['needs'] }, 'trainer').added.filter((k) => k === 'queues').length, 1);
});

test('the earlier dashboard\'s name is unique, a rename never brings it back, and only an earlier layout is copied', () => {
  const named = (names) => {
    const doc = OLD_DOC();
    doc.savedDashboards = { trainer: { active: 'default', boards: [{ id: 'default', name: 'My dashboard', tabs: doc.trainer }].concat(names.map((n, i) => ({ id: 'b' + i, name: n, tabs: {} }))) } };
    return doc;
  };
  const third = G.dgKeepEarlierToday(named(['my earlier dashboard', 'My earlier dashboard 2']), 'trainer', 'board-1');
  assert.equal(G.dgBoards(third, 'trainer').boards.find((b) => b.id === 'board-1').name, 'My earlier dashboard 3');
  // A coach who renames it keeps the name: the mark, not the board, says it was made.
  const kept = G.dgKeepEarlierToday(OLD_DOC(), 'trainer', 'board-1');
  const renamed = G.dgBoardEdit(kept, 'trainer', { type: 'rename', board: 'board-1', name: 'Old Today' });
  const back = G.dgBoardEdit(renamed, 'trainer', { type: 'tab', board: 'default', tab: 'today', layout: OLD_TODAY });
  assert.equal(G.dgEarlierTodayDue(back, 'trainer'), false, 'a renamed earlier board came back');
  assert.deepEqual(back.earlierToday, { trainer: 'board-1' }, 'a board edit dropped the mark');
  // Each role is its own: the trainer's mark is not the nutritionist's.
  assert.equal(G.dgEarlierTodayDue({ ...back, nutritionist: { today: OLD_TODAY } }, 'nutritionist'), true);
  // Nothing saved, an empty layout, or one the six-widget build wrote: nothing to copy.
  for (const doc of [{}, { trainer: {} }, { trainer: { today: {} } }, { trainer: { today: { items: [], hidden: [], added: [] } } },
    { trainer: { today: { items: [{ id: 'brief', x: 0, y: 0, w: 8, h: 9 }, { id: 'needs', x: 0, y: 9, w: 8, h: 20 }] } } },
    { trainer: { today: { hidden: ['money'], items: [], order: ['brief'] } } }, { trainer: { today: { added: ['queues'] } } },
    { trainer: { today: { hidden: ['needsyou'] } } }, { trainer: { today: { items: [{ id: 'needsyou', x: 0, y: 0, w: 8, h: 20 }, { id: 'practice', x: 0, y: 20, w: 12, h: 9 }] } } }]) {
    assert.equal(G.dgEarlierTodayDue(doc, 'trainer'), false, JSON.stringify(doc));
    assert.equal(G.dgKeepEarlierToday(doc, 'trainer', 'board-1'), doc);
  }
  // A layout of one hidden card is a saved layout.
  assert.equal(G.dgEarlierTodayDue({ trainer: { today: { hidden: ['wins'] } } }, 'trainer'), true);
  // The active board's tabs where doc[role] is absent (a board saved by an older client).
  const lib = { savedDashboards: { trainer: { active: 'b2', boards: [{ id: 'b1', name: 'A', tabs: {} }, { id: 'b2', name: 'B', tabs: { today: OLD_TODAY } }] } } };
  assert.equal(G.dgEarlierTodayDue(lib, 'trainer'), true);
  assert.equal(G.dgEarlierTodayDue({ savedDashboards: { trainer: { ...lib.savedDashboards.trainer, active: 'b1' } } }, 'trainer'), false, 'an inactive board was read as the active one');
});

test('at the 20-dashboard cap nothing is dropped, and no mark is set', () => {
  const doc = OLD_DOC();
  const boards = [{ id: 'default', name: 'My dashboard', tabs: doc.trainer }];
  for (let i = 1; i < 20; i++) boards.push({ id: 'b' + i, name: 'Board ' + i, tabs: {} });
  doc.savedDashboards = { trainer: { active: 'default', boards } };
  const out = G.dgKeepEarlierToday(doc, 'trainer', 'board-1');
  assert.equal(out, doc, 'a document at the cap was changed');
  assert.equal('earlierToday' in out, false);
  assert.equal(G.dgEarlierTodayDue(out, 'trainer'), true, 'it can run once there is room');
  const nineteen = { ...doc, savedDashboards: { trainer: { active: 'default', boards: boards.slice(0, 19) } } };
  assert.equal(G.dgBoards(G.dgKeepEarlierToday(nineteen, 'trainer', 'board-1'), 'trainer').boards.length, 20);
});

test('it runs through the layout store\'s own lane, never in the preview, signed out, or on a read not back', async () => {
  let server = OLD_DOC();
  const saves = [];
  const db = (first) => {
    let reads = 0;
    return {
      getUser: async () => ({ id: 'u1' }),
      getUserGoals: async () => { reads += 1; return JSON.parse(JSON.stringify(reads === 1 && first ? first : server)); },
      saveUserGoals: async (_kind, next) => { saves.push(next); server = JSON.parse(JSON.stringify(next)); return { error: null }; },
    };
  };
  const timers = { setTimeout: () => 0, clearTimeout: () => {} };
  // The preview (or signed out): no account, so the store has no uid.
  const preview = G.dgCreateLayoutStore(null, db(), timers);
  assert.equal(preview.read().loaded, true);
  assert.equal(G.dgEarlierTodayGate(preview, 'trainer', true, 'today'), false);
  // A read still loading, and one that failed.
  const store = G.dgCreateLayoutStore('u1', db(), timers);
  assert.equal(G.dgEarlierTodayGate(store, 'trainer', true, 'today'), false);
  const failing = G.dgCreateLayoutStore('u1', { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => { throw new Error('offline'); }, saveUserGoals: async () => ({}) }, timers);
  await failing.load();
  assert.equal(failing.read().status, 'error');
  assert.equal(G.dgEarlierTodayGate(failing, 'trainer', true, 'today'), false);
  await store.load();
  assert.equal(G.dgEarlierTodayGate(store, 'trainer', true, 'today'), true);
  assert.equal(G.dgEarlierTodayGate(store, 'trainer', false, 'today'), false, 'a page that did not ask');
  assert.equal(G.dgEarlierTodayGate(store, 'trainer', true, 'clients'), false, 'another tab');
  // The gate itself, over a store state holding an earlier layout: no account, or a read that has
  // not come back, is never a reason to copy (the real store holds no document in either case).
  const holding = (uid, loaded) => ({ uid, read: () => ({ loaded, status: loaded ? 'saved' : 'error', doc: OLD_DOC() }) });
  assert.equal(G.dgEarlierTodayGate(holding('u1', true), 'trainer', true, 'today'), true);
  assert.equal(G.dgEarlierTodayGate(holding(null, true), 'trainer', true, 'today'), false, 'the preview or a signed-out page copied');
  assert.equal(G.dgEarlierTodayGate(holding('u1', false), 'trainer', true, 'today'), false, 'a read not back copied');
  // The op, then the store's flush: one write, the copy and the mark in it.
  store.change((d) => G.dgKeepEarlierToday(d, 'trainer', 'board-1'));
  await store.flush();
  assert.equal(saves.length, 1);
  assert.deepEqual(G.dgBoards(server, 'trainer').boards.map((b) => b.id), ['default', 'board-1']);
  assert.equal(G.dgEarlierTodayGate(store, 'trainer', true, 'today'), false, 'it would run again on the next open');
  // A second device that read the earlier layout before the first wrote: its op replays on the
  // fresh, marked document and makes no second board.
  const other = G.dgCreateLayoutStore('u1', db(OLD_DOC()), timers);
  await other.load();
  assert.equal(G.dgEarlierTodayGate(other, 'trainer', true, 'today'), true);
  other.change((d) => G.dgKeepEarlierToday(d, 'trainer', 'board-2'));
  await other.flush();
  assert.deepEqual(G.dgBoards(server, 'trainer').boards.map((b) => b.id), ['default', 'board-1'], 'a second earlier board');
  assert.deepEqual(server.earlierToday, { trainer: 'board-1' });
  // DashGrid runs it from that gate, through the store, before the board boots, and only the store writes.
  const eff = GRID.indexOf('if (!dgEarlierTodayGate(store, role, keepEarlierToday, tab)) return;');
  assert.equal(eff > 0 && eff < GRID.indexOf('// ── init GridStack once per role/tab'), true, 'the copy runs after the board has booted');
  assert.equal(/store\.change\(\(doc\) => dgKeepEarlierToday\(doc, role, id\)\);/.test(GRID), true);
  assert.equal(GRID.split('saveUserGoals(').length - 1, 1, 'a second writer of the layout document');
  assert.equal(/\n      keepEarlierToday\n/.test(TODAY), true, 'the coach Today does not ask for it');
});

test('the switcher on Today reaches the earlier dashboard', async () => {
  const m = mount();
  try {
    const g = new Function('React', 'ReactDOM', 'window', gridCode + ';return { DgSavedDashboards, dgCreateLayoutStore, dgKeepEarlierToday, dgBoards };')(React, ReactDOM, m.dom.window);
    let server = OLD_DOC();
    const db = { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => JSON.parse(JSON.stringify(server)), saveUserGoals: async (_k, next) => { server = next; return { error: null }; } };
    const store = g.dgCreateLayoutStore('u1', db, { setTimeout: () => 0, clearTimeout: () => {} });
    await store.load();
    store.change((d) => g.dgKeepEarlierToday(d, 'trainer', 'board-1'));
    await m.render(React.createElement(g.DgSavedDashboards, { store, role: 'trainer', beforeChange: () => {} }));
    const select = document.querySelector('select[aria-label="Saved dashboard"]');
    assert.deepEqual([...select.options].map((o) => o.textContent), ['My dashboard', 'My earlier dashboard']);
    assert.equal(select.value, 'default');
    assert.equal(select.disabled, false);
    select.value = 'board-1';
    await act(async () => select.dispatchEvent(new m.dom.window.Event('change', { bubbles: true })));
    assert.equal(g.dgBoards(store.read().doc, 'trainer').active, 'board-1');
    assert.equal(store.read().doc.trainer.today.items[0].id, 'queues', 'the switch did not bring the earlier Today back');
  } finally { await m.done(); }
  // DashGrid draws the switcher in its bar, on Today as on every tab.
  assert.equal(/<div className="dash-gridbar"[^>]*>\s*<DgSavedDashboards store=\{store\} role=\{role\}/.test(GRID), true);
});

// ── A signed-in coach whose day feed failed ──────────────────────────────────
// `live` is null on that page too, so nothing may read `!live` as the preview: no sample name,
// figures, calendar, pulse or sessions, and no "your schedule is clear" over a day nobody read.
test('a failed day feed is unread on a live page, never the sample and never a clear day', async () => {
  const page = TODAY.slice(TODAY.indexOf('function CoachDashboardPage('));
  // The preview is useDashboard's "demo" alone: an unread roster (tests/dash-roster-unread.test.mjs)
  // is no sample either.
  assert.equal(/const sample = source === "demo";/.test(page), true);
  assert.equal(/const firstName = live \? live\.user\.firstName : sample \? cfg\.mockName : "";/.test(page), true);
  assert.equal(/: sample \? cfg\.mockKpis\(\)/.test(page), true);
  assert.equal(/: sample \? dashDemoCalendar\(cfg\.mockCalendar\) : null;/.test(page), true);
  assert.equal(/\(sample \? cfg\.mockPulse : \[/.test(page), true);
  assert.equal(/const scheduleRead = !!todayRows \|\| sample;/.test(page), true);
  assert.equal(/const dayUnread = waiting \? "loading" : !scheduleRead;/.test(page), true);
  assert.equal(/\? \(!sample \? \[waiting \? \{[^}]*\} : \{ time: "—", who: "Today's " \+ cfg\.unit \+ "s couldn't be read"/.test(page), true);
  assert.equal((page.match(/unread=\{dayUnread\}/g) || []).length, 2, 'Up next and the timeline both take the read flag');
  assert.equal(/onOpenCalendar=\{calendarEvents \? openCalendar : null\}/.test(page), true, 'no calendar read, no Calendar button');
  assert.equal(/greeting=\{firstName \? cfg\.greeting\(firstName\) : "Good morning\."\}/.test(page), true);
  // No mock fallback is left keyed on `live` alone.
  assert.equal(/live \? [^\n]*: cfg\.mock/.test(page), false);
  // The KPI pool's sessions count is unread too, not "0 · all done".
  const ses = DashSignals.dashKpiValue('todaySessions', { schedule: [], scheduleRead: false });
  assert.equal(ses.value, null);
  assert.equal(ses.why, "couldn't be read");
  assert.equal(DashSignals.dashKpiValue('todaySessions', { schedule: [] }).value, 0, 'a read, empty day is 0');

  const m = mount();
  try {
    const t = today(m.dom.window);
    const empty = { now: Date.now(), items: [], nextIdx: -1, next: null };
    await m.render(React.createElement(t.DashUpNextCard, { rows: null, state: empty, clients: [], role: 'trainer', unit: 'session', zone: null, single: true, unread: true }));
    assert.equal(document.querySelector('[data-dash-upnext]').getAttribute('data-dash-upnext'), 'unread');
    assert.equal(/couldn't be read/.test(m.text()) && !/schedule is clear/.test(m.text()), true);
    await m.render(React.createElement(t.DashUpNextCard, { rows: [], state: empty, clients: [], role: 'trainer', unit: 'session', zone: null, single: true }));
    assert.equal(document.querySelector('[data-dash-upnext]').getAttribute('data-dash-upnext'), 'clear', 'a read, empty day is clear');
    await m.render(React.createElement(t.DashTimelineCard, { rows: null, state: empty, unit: 'session', zone: null, clients: [], role: 'trainer', card: true, unread: true }));
    assert.equal(document.querySelector('[data-dash-timeline]').getAttribute('data-dash-timeline'), 'unread');
    assert.equal(/couldn't be read/.test(m.text()) && !/0 sessions/.test(m.text()), true);
    assert.equal(/Calendar/.test(m.text()), false, 'no opener, no Calendar button');
    await m.render(React.createElement(t.DashTimelineCard, { rows: [], state: empty, unit: 'session', zone: null, clients: [], role: 'trainer', card: true, onOpenCalendar: () => {} }));
    assert.equal(/Calendar →/.test(m.text()), true, 'with a calendar, the button');
  } finally { await m.done(); }
});
