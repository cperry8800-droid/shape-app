// The coach Today as a widget board (coach dashboard step 3; the owner's design, 2026-11-06):
// six widgets, one question each — the Brief and Up next, At a glance and Money, Needs you and the
// Today timeline — with the catalogue docked beside the board instead of over it.
//   1. the brief: "N clients need your attention" (plural, singular, nobody), the names in their
//      client colours and never a time; then its own sentence, the next session still to come
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
  'DashUpNextCard', 'DashTimelineCard'];
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
const row = (id, name, severity, reason, action) => ({ severity, client: { profile: { id, name } }, lead: reason ? { reason, action: action || { kind: 'message', label: 'Message' } } : null, flags: [] });
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

test('the brief card draws each named client in their colour', async () => {
  const m = mount();
  try {
    const t = today(m.dom.window);
    const model = t.dashBriefModel([row('client-1', 'Marcus T.', 'red', 'r')], { who: 'Sam O.', id: 'client-2', time: '2:00 PM' });
    await m.render(React.createElement(t.DashBriefCard, { model }));
    assert.equal(m.text().includes('1 client needs your attention: Marcus T. Next up today: Sam O. at 2:00 PM.'), true);
    const inks = [...document.querySelectorAll('[data-dash-brief] .sh-client-ink')].map((n) => n.textContent);
    assert.deepEqual(inks, ['Marcus T.', 'Sam O.']);
  } finally { await m.done(); }
});

// ── 2. Needs you ──────────────────────────────────────────────────────────────
test('Needs you shows three rows, then folds the rest into gems with what they are', async () => {
  const now = ['m', 'p', 'e'].map((id) => row(id, id.toUpperCase() + '.', 'red', 'Reason ' + id));
  const week = ['w1', 'w2', 'w3', 'w4'].map((id) => row(id, id.toUpperCase() + '.', 'amber', 'Watch ' + id));
  const wins = [{ client: { profile: { id: 'g1', name: 'G1.' } }, hit: { label: 'First 10k', hitAt: '2026-11-05' } },
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
    assert.equal(foldBtn.querySelectorAll('.sh-client-ink').length, 6, 'one gem per folded client, in their colour');
    // Each row: name, a labelled status chip, one reason, one action.
    const first = document.querySelector('[data-dash-need]');
    assert.equal(first.textContent.includes('M.') && first.textContent.includes('Needs you') && first.textContent.includes('Reason m'), true);
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
  const ok = T.dashMoneyModel(live(412000), { live: live(412000), clients: [] });
  assert.equal(ok.recurring.k, '$4,120');
  assert.equal(ok.payout, null, 'the live Today routes read no payouts, so no payout figure');
  const unread = T.dashMoneyModel(live(null), { live: live(null), clients: [] });
  assert.equal(unread.recurring.k, '—');
  assert.equal(unread.recurring.sub, "couldn't be read");
  assert.equal(unread.payout, null);
  // The signed-out preview shows its own sample's payout (the demo band labels the page).
  const sample = DashSignals.buildMockClients(new Date());
  const demo = T.dashMoneyModel(null, { live: null, clients: sample }, true);
  assert.equal(/^\$/.test(demo.recurring.k), true);
  assert.equal(!!demo.payout && demo.payout.k === DashSignals.demoPayouts(sample, new Date()).payoutShort, true, 'the preview\'s payout is its own sample\'s date');
  // A signed-in coach whose day feed failed (live null, source live) never gets the sample's payout.
  assert.equal(T.dashMoneyModel(null, { live: null, clients: sample }, false).payout, null);
  assert.equal(T.dashMoneyModel(null, { live: null, clients: sample }).payout, null, 'no flag is not the preview');
  assert.equal(/dashMoneyModel\(live, kpiCtx, source !== "live"\)/.test(TODAY), true);

  const m = mount();
  try {
    const t = today(m.dom.window);
    await m.render(React.createElement(t.DashMoneyCard, { model: unread, role: 'trainer' }));
    const payout = document.querySelector('[data-dash-payout="unread"]');
    assert.equal(!!payout, true);
    assert.equal(/Payouts aren't connected to Today yet/.test(payout.textContent), true);
    assert.equal(/\$\d/.test(m.text()), false, 'a dollar figure on a card that could read none');
  } finally { await m.done(); }
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
  assert.equal(/<DashGrid role=\{role\} tab="today" widgets=\{gridWidgets\} dockCatalog=\{!!dockCatalog\} \/>/.test(read('trainerDashboard.jsx')), true);
});

// ── A signed-in coach whose day feed failed ──────────────────────────────────
// `live` is null on that page too, so nothing may read `!live` as the preview: no sample name,
// figures, calendar, pulse or sessions, and no "your schedule is clear" over a day nobody read.
test('a failed day feed is unread on a live page, never the sample and never a clear day', async () => {
  const page = TODAY.slice(TODAY.indexOf('function CoachDashboardPage('));
  assert.equal(/const sample = source !== "live";/.test(page), true);
  assert.equal(/const firstName = live \? live\.user\.firstName : sample \? cfg\.mockName : "";/.test(page), true);
  assert.equal(/: sample \? cfg\.mockKpis\(\)/.test(page), true);
  assert.equal(/: sample \? dashDemoCalendar\(cfg\.mockCalendar\) : null;/.test(page), true);
  assert.equal(/\(sample \? cfg\.mockPulse : \[/.test(page), true);
  assert.equal(/const scheduleRead = !!todayRows \|\| sample;/.test(page), true);
  assert.equal(/\? \(!sample \? \[\{ time: "—", who: "Today's " \+ cfg\.unit \+ "s couldn't be read"/.test(page), true);
  assert.equal((page.match(/unread=\{!scheduleRead\}/g) || []).length, 2, 'Up next and the timeline both take the read flag');
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
  } finally { await m.done(); }
});
