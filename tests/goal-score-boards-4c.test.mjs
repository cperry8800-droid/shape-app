// Coach dashboard step 4c (the owner's review, 2026-11-08): the coach Goal and Score tabs as widget
// boards, for the trainer and the nutritionist, drawn by one module (coachGoalScore.jsx). These mount the
// SHIPPED components in jsdom with the real forecast, signals, zone and tier modules, dashBusiness.jsx's
// cards and dashData.jsx's goal helpers, and read what a coach reads:
//   1. Goal's pace: a start and a due date, the statuses and their sentences, never a guessed pace;
//   2. the saved goal's new shape (start, startAt, due) and what an edit keeps;
//   3. the action says who: only real reads named;
//   4. the Goal board: one card a goal, the at-risk one raised and open, the catalogue, the sample dated
//      from today, a clean empty state, a failed read that is neither the sample nor empty, Add, Edit,
//      Delete, Archive and Restore, the account-bound save and the re-read on shape:accountSetup;
//   5. Score's arithmetic: the route's formula, the fastest way up with completion's cap, a bar that
//      adds up, no perks;
//   6. the Score board's read rule and states;
//   7. Business · Overview's goal line: the coach's own revenue goal, named, else the Plan's.
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
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#goal', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
const React = require_('react');
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
Object.assign(globalThis, { DashSignals, serif: 'serif', sans: 'sans', INK: 'var(--sh-ink, #f2ede4)', PAPER: 'var(--sh-ground, #1a1612)', TEAL_BRIGHT: 'var(--sh-accent, #2ee0c4)' });

// dashToday.jsx, whole, as the page loads it: the money format, the tier marks and the tab links.
const T = new Function('React', 'window', 'DashSignals', 'useDashUnits', 'useRememberedChoice', 'useRememberedSlots', 'dashMilestonesIn', 'useDashFocusRefresh', 'serif', 'sans', 'mono', 'INK', 'TEAL_BRIGHT',
  compile(read('dashToday.jsx')) + ';return { dashMoney, DashClientGem, dashRecordTier, dashClientHref, dashTabHref, dashLinkedTab };')(
  React, window, DashSignals, () => null, (s, k, a, f) => React.useState(f), (s, keys, allowed, defaults) => React.useState(defaults), (ms) => ms, () => {}, 'serif', 'sans', 'monospace', '#f2ede4', '#2ee0c4');
const messages = [];
Object.assign(globalThis, {
  dashMoney: T.dashMoney, DashClientGem: T.DashClientGem, dashRecordTier: T.dashRecordTier, dashClientHref: T.dashClientHref, dashTabHref: T.dashTabHref, dashLinkedTab: T.dashLinkedTab,
  dashMessageClient: (name, role, draft, id) => messages.push({ name, role, draft, id }),
});

// dashData.jsx's goal helpers, brace-matched out of the shipped file.
function fnSrc(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.notEqual(at, -1, name + ' not found');
  let depth = 0;
  for (let j = src.indexOf('{', src.indexOf(')', at)); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced ' + name);
}
const DATA = read('dashData.jsx');
const D = new Function(['goalMetricUnit', 'goalMetricsFor', 'goalLiveValue', 'coachLiveMomentum'].map((n) => fnSrc(DATA, n)).join('\n') + '\nreturn { goalMetricUnit, goalMetricsFor, goalLiveValue, coachLiveMomentum };')();
Object.assign(globalThis, D);

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const B = await loadRealModule(ND('dashBusiness.jsx'), {
  appendExports: 'export { DbzCard, DbzChip, DbzGem, DBZ_FILLED, DBZ_OUTLINE, DBZ_NOTE, DBZ_LBL, DBZ_MONO, DBZ_INK, DBZ_INK50, DBZ_RULE, dbzTodayParts, dbzPartsOf, useDbzChartWidth, dbzClientHref, DbzGoalEarn, dbzOwnRevenueGoal, dbzPaceModel, DbzPaceCard };',
});
// The browser shares dashBusiness.jsx's top-level names with every later script; here they are globals.
Object.assign(globalThis, {
  DbzCard: B.DbzCard, DbzChip: B.DbzChip, DbzGem: B.DbzGem, DBZ_FILLED: B.DBZ_FILLED, DBZ_OUTLINE: B.DBZ_OUTLINE, DBZ_NOTE: B.DBZ_NOTE, DBZ_LBL: B.DBZ_LBL,
  DBZ_MONO: B.DBZ_MONO, DBZ_INK: B.DBZ_INK, DBZ_INK50: B.DBZ_INK50, DBZ_RULE: B.DBZ_RULE, dbzTodayParts: B.dbzTodayParts, dbzPartsOf: B.dbzPartsOf,
  useDbzChartWidth: B.useDbzChartWidth, dbzClientHref: B.dbzClientHref, DbzGoalEarn: B.DbzGoalEarn,
});
const C = await loadRealModule(ND('coachGoalScore.jsx'), {
  appendExports: 'export { cgsDayNum, cgsDayKey, cgsToday, cgsDayOfInstant, cgsDayLabel, cgsQuarterEnd, cgsGoalReading, cgsGoalPace, cgsFocusGoal, cgsGoalSentence, cgsNudgeModel, cgsGoalAction, cgsGoalGroup, cgsKeepsStart, cgsStampGoal, cgsGoalIds, cgsLastArchive, cgsSampleState, cgsScoreModel, cgsScoreSum, cgsWayUp, cgsStepText, cgsLadderPlace, cgsTierOf, CGS_TIERS, CGS_TERMS, CGS_SCORE_SAMPLE, CGS_AT_RISK, CoachGoalBoard, CoachScoreBoard };',
});
const PAGES = {};
for (const [f, name] of [['trainerGoalPage.jsx', 'TrainerGoalPage'], ['nutritionistGoalPage.jsx', 'NutritionistGoalPage'], ['trainerScorePage.jsx', 'TrainerScorePage'], ['nutritionistScorePage.jsx', 'NutritionistScorePage']]) {
  PAGES[name] = (await loadRealModule(ND(f), { appendExports: 'export { ' + name + ' };' }))[name];
}
Object.assign(globalThis, { CoachGoalBoard: C.CoachGoalBoard, CoachScoreBoard: C.CoachScoreBoard });

async function mount(el) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await React.act(async () => root.render(el));
  return { div, text: () => div.textContent.replace(/\s+/g, ' ').trim(), unmount: () => React.act(async () => { root.unmount(); div.remove(); }) };
}
const settle = async (n = 4) => { for (let i = 0; i < n; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = (el) => React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
async function setValue(input, v) {
  const proto = Object.getPrototypeOf(input);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, String(v));
  await React.act(async () => { input.dispatchEvent(new window.Event('input', { bubbles: true })); input.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
const byText = (root, sel, re) => [...root.querySelectorAll(sel)].find((b) => re.test(b.textContent));
const textOf = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
// Every control styled as the board's one filled action (DBZ_FILLED: the accent's fill).
const filled = (root) => [...root.querySelectorAll('button, a')].filter((b) => /var\(--sh-accent, #2ee0c4\)/.test(b.style.background));
const GROUPS = ['clients', 'schedule', 'money', 'programs'];
const DAY = 86400000;

// ── The shell, stubbed: the page frame, a DashGrid that records the board it was handed and draws its
// default cards (every card with `all`), the roster and live-figure hooks, the confirm and the account.
function shell({ live = { kind: 'demo' }, roster = null, all = false, confirm = true, fixNote = null } = {}) {
  const seen = { boards: {}, confirms: [], rosterReads: 0 };
  // One answer per page, as useDashboard memoizes its feed: a fresh array each render would re-run the
  // page's roster effect forever.
  const feed = roster ? { source: roster.source, triage: roster.triage } : { source: null, triage: [] };
  Object.assign(globalThis, {
    DashPage: ({ eyebrow, title, subtitle, actions, children }) => React.createElement('main', null,
      React.createElement('div', { 'data-eyebrow': '' }, eyebrow), React.createElement('h1', null, title), React.createElement('p', { 'data-subtitle': '' }, subtitle),
      React.createElement('nav', { 'data-actions': '' }, actions), children),
    DashDemoBand: () => React.createElement('div', { 'data-band': '' }, 'Preview · demo data'),
    DashGrid: (props) => {
      seen.boards[props.tab] = props;
      return React.createElement(React.Fragment, null, props.widgets.filter((w) => !w.empty && (all || !w.optional)).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render())));
    },
    goalQuarterLabel: () => 'YOUR GOALS · Q4 2026',
    trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: { demo: 'trainer' }, nutriPayoutCard: { demo: 'nutritionist' },
    useCoachLiveFigures: () => live,
    useDashboard: () => { seen.rosterReads += 1; return feed; },
    useCoachStanding: () => null, coachStandingLine: () => 'standing', CoachScoreActions: () => null, CoachLeaderboard: () => React.createElement('i', null, 'LEADERBOARD'),
    coachScoreFixNote: () => fixNote,
  });
  window.ShapeConfirm = { open: async (o) => { seen.confirms.push(o.title); return confirm; } };
  return seen;
}
// window.shapeDb for a coach: `goals` is what getUserGoals answers (null: the read failed); saves are recorded.
// `bridge`: the coach is signed in only through the Next.js cookie bridge, so getUser answers nobody until
// getSession() has bootstrapped it (dashData.jsx dashDocBridge).
function account({ user = { id: 'coach-uid' }, goals = {}, saveError = null, bridge = false } = {}) {
  const db = { saves: [], reads: [], bridged: !bridge };
  window.shapeDb = {
    getSession: async () => { db.bridged = true; return { user }; },
    getUser: async () => (db.bridged ? user : null),
    getUserGoals: async (kind, opts) => { db.reads.push([kind, opts]); return typeof goals === 'function' ? goals() : goals; },
    saveUserGoals: async (kind, data, opts) => { db.saves.push([kind, JSON.parse(JSON.stringify(data)), opts]); return saveError ? { error: { message: saveError } } : { ok: true }; },
  };
  return db;
}
async function goalPage(role, opts = {}) {
  const seen = shell(opts);
  const m = await mount(React.createElement(role === 'nutritionist' ? PAGES.NutritionistGoalPage : PAGES.TrainerGoalPage));
  await settle();
  return { m, seen, board: seen.boards['goal-board'] };
}
const card = (m, key) => m.div.querySelector('[data-card="' + key + '"]');

// ── 1. Pace ───────────────────────────────────────────────────────────────────
const S0 = C.cgsDayOfInstant('2026-09-09T12:00:00.000Z');
const AT = '2026-09-09T12:00:00.000Z';
const goal = (o) => ({ id: 'x', t: 'A goal', cur: 0, tgt: 100, money: false, pct: false, start: 0, startAt: AT, due: C.cgsDayKey(S0 + 120), ...o });
const paceOf = (g, today, reading) => C.cgsGoalPace(g, reading || { state: 'ready', cur: Number(g.cur) }, today);

test('a goal\'s pace runs from its start to its target on the due date, and each status says so', () => {
  const today = S0 + 60; // half the span gone
  // At or past the straight line today: on track. Exactly on it counts.
  for (const cur of [50, 64]) assert.equal(paceOf(goal({ cur }), today).status, 'ontrack', String(cur));
  // Behind the line, but today's pace reaches at least three quarters of the target: at risk.
  assert.equal(C.CGS_AT_RISK, 0.75);
  assert.equal(paceOf(goal({ cur: 38 }), today).status, 'atrisk', '38 of 50 needed: reaches 76%');
  assert.equal(paceOf(goal({ cur: 37 }), today).status, 'behind', '37 of 50 needed: reaches 74%');
  // Reached: done, whatever the date; a goal coming down (start above target) is reached from above.
  assert.equal(paceOf(goal({ cur: 100 }), today).status, 'done');
  assert.equal(paceOf(goal({ start: 10, tgt: 4, cur: 4 }), today).status, 'done');
  assert.equal(paceOf(goal({ start: 10, tgt: 4, cur: 7 }), today).status, 'ontrack', 'down 3 of 6 at half the span');
  assert.equal(paceOf(goal({ start: 10, tgt: 4, cur: 8 }), today).status, 'behind', 'down 2 of 6: reaches 67%');
  // The due date passed short of the target: behind, and says so. On the due date there is still the day.
  const late = paceOf(goal({ cur: 90 }), S0 + 121);
  assert.deepEqual([late.status, late.overdue], ['behind', true]);
  const dueDay = paceOf(goal({ cur: 90 }), S0 + 120);
  assert.deepEqual([dueDay.status, !!dueDay.overdue, dueDay.daysLeft, dueDay.needPerWeek], ['atrisk', false, 0, null]);
  assert.equal(C.cgsGoalSentence(goal({ cur: 90 }), dueDay, S0 + 120, null), 'Due today, at 90 of 100.');
  // Set under a week ago: too early to read a pace.
  assert.equal(paceOf(goal({ cur: 0 }), S0 + 3).status, 'early');
  assert.equal(paceOf(goal({ cur: 0 }), S0 + 8).status, 'behind', 'a week in, the pace reads');
  // The numbers the sentence prints.
  const p = paceOf(goal({ cur: 40 }), today);
  assert.deepEqual([p.expected, p.daysLeft, Math.round(p.reach * 100), Math.round(p.projected), Math.round(p.madePerWeek * 100) / 100, Math.round(p.needPerWeek * 100) / 100],
    [50, 60, 80, 80, Math.round((40 / (60 / 7)) * 100) / 100, Math.round((60 / (60 / 7)) * 100) / 100]);
  assert.equal(Math.round(p.progress * 100), 40);
});

test('a goal with no start or no due date never gets a guessed pace', () => {
  const today = S0 + 60;
  // Saved before step 4c: no start, no startAt, no due.
  const legacy = paceOf({ id: 'l', t: 'Old', cur: 34, tgt: 50 }, today);
  assert.equal(legacy.status, 'nodue');
  assert.equal(Math.round(legacy.progress * 100), 68, 'its ring still shows how far, from zero');
  assert.equal(C.cgsGoalSentence({ cur: 34, tgt: 50 }, legacy, today, null), 'Saved before goals kept a start and a due date, so its pace can\'t be read.');
  assert.deepEqual(C.cgsGoalAction({ cur: 34, tgt: 50 }, legacy, { role: 'trainer' }), { kind: 'edit', label: 'Add a due date' });
  // A start and no due date; a due date and no start (its figure couldn't be read when it was set).
  for (const [g, sentence, label] of [
    [goal({ cur: 40, due: undefined }), 'It has no due date after its start, so its pace can\'t be read.', 'Add a due date'],
    [goal({ cur: 40, due: 'not a day' }), 'It has no due date after its start, so its pace can\'t be read.', 'Add a due date'],
    [goal({ cur: 40, due: C.cgsDayKey(S0 - 1) }), 'It has no due date after its start, so its pace can\'t be read.', 'Add a due date'],
    [goal({ cur: 40, start: undefined, startAt: undefined }), 'Its starting figure couldn\'t be read when it was set, so its pace can\'t be read.', 'Start its pace'],
  ]) {
    const pc = paceOf(g, today);
    assert.equal(pc.status, 'nodue', sentence);
    assert.equal(C.cgsGoalSentence(g, pc, today, null), sentence);
    assert.equal(C.cgsGoalAction(g, pc, { role: 'trainer' }).label, label);
  }
  // A bound figure still loading, or unreadable: no pace, no action, never the typed figure.
  const bound = goal({ metric: 'activeClients', cur: 99 });
  assert.equal(paceOf(bound, today, { state: 'loading' }).status, 'reading');
  assert.equal(paceOf(bound, today, { state: 'unread' }).status, 'unread');
  assert.equal(C.cgsGoalAction(bound, { status: 'unread' }, { role: 'trainer' }), null);
  assert.equal(C.cgsGoalSentence(bound, { status: 'unread' }, today, 'Active clients'), 'Couldn\'t read active clients just now, so its progress isn\'t shown.');
});

test('what a goal reads now: the live figure when bound (undefined unbound, null unreadable), the typed one otherwise, the sample its own', () => {
  const live = { kind: 'live', activeClients: 21, mrrNetCents: 2601000, adherencePct: null };
  assert.deepEqual(C.cgsGoalReading({ metric: 'activeClients', cur: 5 }, live, false), { state: 'ready', cur: 21 });
  assert.deepEqual(C.cgsGoalReading({ metric: 'mrrNetMonthly', cur: 5 }, live, false), { state: 'ready', cur: 26010 }, 'cents → dollars');
  assert.deepEqual(C.cgsGoalReading({ metric: 'adherencePct', cur: 5 }, live, false), { state: 'unread' }, 'null is unreadable, never the typed 5');
  assert.deepEqual(C.cgsGoalReading({ metric: 'activeClients', cur: 5 }, { kind: 'loading' }, false), { state: 'loading' });
  assert.deepEqual(C.cgsGoalReading({ metric: 'activeClients', cur: 5 }, { kind: 'unknown' }, false), { state: 'unread' });
  assert.deepEqual(C.cgsGoalReading({ cur: 7 }, live, false), { state: 'ready', cur: 7 }, 'unbound: the typed figure');
  assert.deepEqual(C.cgsGoalReading({ metric: 'activeClients', cur: 34 }, { kind: 'demo' }, true), { state: 'ready', cur: 34 }, 'the sample reads its own figure');
});

test('each status prints one sentence, on the account\'s calendar', () => {
  const today = S0 + 42;
  const g = { pct: true, tgt: 95, start: 90, cur: 92, startAt: AT, due: C.cgsDayKey(S0 + 84) };
  const p = paceOf(g, today);
  assert.equal(p.status, 'atrisk');
  const due = C.cgsDayLabel(S0 + 84, today);
  assert.equal(C.cgsGoalSentence(g, p, today, null), '+0.3 pts a week so far; 95% by ' + due + ' needs +0.5 pts a week.');
  const flat = { ...g, cur: 90 };
  assert.equal(C.cgsGoalSentence(flat, paceOf(flat, today), today, null), 'No gain since ' + C.cgsDayLabel(S0, today) + '; 95% by ' + due + ' needs +0.8 pts a week.');
  const on = { money: true, tgt: 20000, start: 9000, cur: 14820, startAt: AT, due: C.cgsDayKey(S0 + 84) };
  assert.equal(C.cgsGoalSentence(on, paceOf(on, today), today, null), '$14,820 now; the line to $20,000 by ' + due + ' needs $14,500 today.');
  const done = { tgt: 2, start: 0, cur: 2, startAt: AT, due: C.cgsDayKey(S0 + 84) };
  assert.equal(C.cgsGoalSentence(done, paceOf(done, today), today, null), 'Reached: 2 of 2, due ' + due + '.');
  const late = { tgt: 50, start: 20, cur: 41, startAt: AT, due: C.cgsDayKey(S0 + 30) };
  assert.equal(C.cgsGoalSentence(late, paceOf(late, today), today, null), C.cgsDayLabel(S0 + 30, today) + ' has passed at 41 of 50.');
  // A count's line figure is whole: 33.4 clients is not a figure anyone reads.
  const cl = { tgt: 50, start: 16, cur: 34, startAt: AT, due: C.cgsDayKey(S0 + 101) };
  assert.match(C.cgsGoalSentence(cl, paceOf(cl, today), today, null), /needs 30 today\.$/);
  // Calendar days: a due date is the day it names, and a bad one is no day at all.
  assert.equal(C.cgsDayKey(C.cgsDayNum('2026-12-31')), '2026-12-31');
  for (const bad of ['2026-02-30', '2026-13-01', '', null, '12/31/2026']) assert.equal(C.cgsDayNum(bad), null, String(bad));
  assert.equal(C.cgsDayKey(C.cgsQuarterEnd(C.cgsDayNum('2026-11-08'))), '2026-12-31');
  assert.equal(C.cgsDayKey(C.cgsQuarterEnd(C.cgsDayNum('2026-02-10'))), '2026-03-31');
});

test('the board raises one goal: a missed due date first, then the furthest behind, then at risk', () => {
  const row = (id, pace) => ({ id, pace });
  assert.equal(C.cgsFocusGoal([row('a', { status: 'ontrack' }), row('b', { status: 'done' }), row('c', { status: 'nodue', progress: 0 })]), null, 'nothing behind: nothing raised');
  assert.equal(C.cgsFocusGoal([row('a', { status: 'atrisk', reach: 0.9 }), row('b', { status: 'atrisk', reach: 0.8 })]), 'b');
  assert.equal(C.cgsFocusGoal([row('a', { status: 'atrisk', reach: 0.76 }), row('b', { status: 'behind', reach: 0.6 })]), 'b');
  assert.equal(C.cgsFocusGoal([row('a', { status: 'behind', reach: 0.1 }), row('b', { status: 'behind', overdue: true, reach: 0.9 })]), 'b');
});

// ── 2. The saved goal's shape ────────────────────────────────────────────────
test('a new or edited goal saves start, startAt and due; an edit keeps the start it was set with', () => {
  const now = '2026-11-08T15:00:00.000Z';
  const fresh = C.cgsStampGoal(null, { t: 'Publish 2', cur: 1, tgt: 2, due: '2026-12-31' }, { state: 'ready', cur: 1 }, now);
  assert.deepEqual([fresh.start, fresh.startAt, fresh.due], [1, now, '2026-12-31']);
  const bound = C.cgsStampGoal(null, { t: 'Clients', metric: 'activeClients', cur: 0, tgt: 50, due: '2026-12-31' }, { state: 'ready', cur: 21 }, now);
  assert.equal(bound.start, 21, 'a bound goal starts from its live figure');
  const unreadable = C.cgsStampGoal(null, { t: 'Clients', metric: 'activeClients', tgt: 50, due: '2026-12-31' }, { state: 'unread' }, now);
  assert.equal('start' in unreadable || 'startAt' in unreadable, false, 'no start is guessed');
  const prev = { id: 'g1', t: 'Old title', cur: 1, tgt: 2, start: 0, startAt: '2026-10-01T10:00:00.000Z', due: '2026-12-31' };
  const edited = C.cgsStampGoal(prev, { ...prev, t: 'New title', tgt: 3, due: '2027-01-15' }, { state: 'ready', cur: 1 }, now);
  assert.deepEqual([edited.t, edited.tgt, edited.start, edited.startAt, edited.due], ['New title', 3, 0, '2026-10-01T10:00:00.000Z', '2027-01-15']);
  // A changed binding or unit: the old start is in another unit, so the pace starts again today.
  for (const change of [{ metric: 'activeClients' }, { money: true }, { pct: true }]) {
    const re = C.cgsStampGoal(prev, { ...prev, ...change }, { state: 'ready', cur: 9 }, now);
    assert.deepEqual([re.start, re.startAt], [9, now], JSON.stringify(change));
  }
  // A legacy goal (no start) edited: its pace starts today.
  const legacy = C.cgsStampGoal({ id: 'g2', t: 'Old', cur: 34, tgt: 50 }, { id: 'g2', t: 'Old', cur: 34, tgt: 50, due: '2027-01-31' }, { state: 'ready', cur: 34 }, now);
  assert.deepEqual([legacy.start, legacy.startAt, legacy.due], [34, now, '2027-01-31']);
  // An empty or bad due date is not saved.
  assert.equal('due' in C.cgsStampGoal(null, { t: 'x', cur: 0, tgt: 1, due: '' }, { state: 'ready', cur: 0 }, now), false);
  assert.equal('due' in C.cgsStampGoal(null, { t: 'x', cur: 0, tgt: 1, due: '2026-02-30' }, { state: 'ready', cur: 0 }, now), false);
  assert.equal(C.cgsKeepsStart(null, prev), false);
});

test('goal ids are the goal\'s identity: kept when saved, positional and unique when not', () => {
  assert.deepEqual(C.cgsGoalIds([{ id: 'a' }, { t: 'x' }, null, { id: 'goal1' }, { t: 'y' }]).map((g) => g.id), ['a', 'goal1x', 'goal1', 'goal3']);
  assert.deepEqual(C.cgsGoalIds(undefined), []);
  assert.deepEqual(C.cgsGoalIds('nope'), []);
});

// ── 3. The action says who ───────────────────────────────────────────────────
const mockFeed = (role, now = new Date()) => DashSignals.getTriageFeed(role, DashSignals.buildMockClients(now), now);
test('an adherence goal names the clients pulling it down, from real reads only', () => {
  const t = C.cgsNudgeModel({ role: 'trainer', roster: { source: 'demo', triage: mockFeed('trainer') }, sample: true });
  assert.deepEqual(t.clients.map((c) => c.name), ['Sam R.', 'Jonah W.'], 'a trainer\'s session adherence: the missed sessions');
  assert.equal(t.clients.every((c) => typeof c.reason === 'string' && /weren't completed/.test(c.reason)), true);
  const n = C.cgsNudgeModel({ role: 'nutritionist', roster: { source: 'demo', triage: mockFeed('nutritionist') }, sample: true });
  assert.deepEqual(n.clients.map((c) => c.name), ['Priya S.'], 'a nutritionist\'s protein adherence');
  assert.equal(typeof n.clients[0].draft === 'string' && /Protein/.test(n.clients[0].draft), true, 'with the member\'s own draft');
  // ⚠ A signed-in coach beside a demo roster (not this role) is unread: never the sample's people.
  assert.equal(C.cgsNudgeModel({ role: 'trainer', roster: { source: 'demo', triage: mockFeed('trainer') }, sample: false }).state, 'unread');
  // A roster that couldn't be read (useDashboard's "unread") names nobody, for the sample's goals too.
  assert.equal(C.cgsNudgeModel({ role: 'trainer', roster: { source: 'unread', triage: [] }, sample: false }).state, 'unread');
  assert.equal(C.cgsNudgeModel({ role: 'trainer', roster: { source: 'unread', triage: [] }, sample: true }).state, 'unread');
  assert.equal(C.cgsNudgeModel({ role: 'trainer', roster: { source: 'live', triage: mockFeed('trainer') }, sample: true }).state, 'unread');
  assert.equal(C.cgsNudgeModel({ role: 'trainer', roster: undefined, sample: false }).state, 'loading');
  // A client whose progress is still loading, or couldn't be read, or who is off plan, is not named.
  const feed = mockFeed('trainer').map((r) => (r.client.profile.name === 'Sam R.' ? { ...r, client: { ...r.client, progressRead: { state: 'loading' } } }
    : r.client.profile.name === 'Jonah W.' ? { ...r, client: { ...r.client, progressRead: { state: 'unavailable' } } } : r));
  const partial = C.cgsNudgeModel({ role: 'trainer', roster: { source: 'live', triage: feed }, sample: false });
  assert.deepEqual([partial.clients.length, partial.pending], [0, 1]);
  // A client whose plan the roster couldn't read (onPlan null) is neither on a plan nor off one, so is
  // not named (Business · Retention's rule, #2636); one with no onPlan at all (the preview's) still is.
  const planUnread = mockFeed('trainer').map((r) => (r.client.profile.name === 'Sam R.' ? { ...r, client: { ...r.client, payments: { ...(r.client.payments || {}), onPlan: null } } } : r));
  assert.deepEqual(C.cgsNudgeModel({ role: 'trainer', roster: { source: 'live', triage: planUnread }, sample: false }).clients.map((c) => c.name), ['Jonah W.']);
  const noField = mockFeed('trainer').map((r) => ({ ...r, client: { ...r.client, payments: { ...(r.client.payments || {}), onPlan: undefined } } }));
  assert.deepEqual(C.cgsNudgeModel({ role: 'trainer', roster: { source: 'live', triage: noField }, sample: false }).clients.map((c) => c.name), ['Sam R.', 'Jonah W.']);
  // The action, by kind, and only when there is someone to name.
  const p = { status: 'atrisk' };
  assert.equal(C.cgsGoalAction({ metric: 'adherencePct' }, p, { role: 'trainer', nudge: t }).label, 'Nudge Sam R. and Jonah W.');
  assert.equal(C.cgsGoalAction({ metric: 'adherencePct' }, p, { role: 'nutritionist', nudge: n }).label, 'Nudge Priya S.');
  assert.equal(C.cgsGoalAction({ metric: 'adherencePct' }, p, { role: 'trainer', nudge: partial }), null);
  assert.equal(C.cgsGoalAction({ metric: 'adherencePct' }, p, { role: 'trainer', nudge: { state: 'unread' } }), null);
  const four = { state: 'ready', clients: ['A a.', 'B b.', 'C c.', 'D d.'].map((name) => ({ name })) };
  assert.equal(C.cgsGoalAction({ metric: 'adherencePct' }, p, { role: 'trainer', nudge: four }).label, 'Nudge A a., B b. and 2 more');
  const growth = C.cgsGoalAction({ metric: 'activeClients' }, p, { role: 'trainer' });
  assert.deepEqual([growth.label, growth.href], ['Open Business · Growth', 'TrainerApp.html#business?section=growth']);
  assert.deepEqual(C.cgsGoalAction({ metric: 'mrrNetMonthly' }, p, { role: 'nutritionist' }).href, 'NutritionistApp.html#business?section=plan');
  assert.deepEqual(C.cgsGoalAction({}, p, { role: 'trainer' }), { kind: 'edit', label: 'Update the figure' });
  assert.equal(C.cgsGoalAction({ metric: 'activeClients' }, { status: 'done' }, { role: 'trainer' }), null, 'a reached goal asks nothing');
  // Its catalogue group: the metric's, else the unit's; a typed count is a programs goal.
  assert.deepEqual([{ metric: 'activeClients' }, { metric: 'mrrNetMonthly' }, { metric: 'adherencePct' }, { money: true }, { pct: true }, {}].map(C.cgsGoalGroup), ['clients', 'money', 'clients', 'money', 'clients', 'programs']);
});

// ── 4. The Goal board ────────────────────────────────────────────────────────
test('signed out: the sample board, dated from today, with one goal raised, open, and its action naming who', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    account({ user: null });
    const roster = { source: 'demo', triage: mockFeed(role) };
    const { m, seen, board } = await goalPage(role, { roster });
    try {
      assert.equal(!!board, true, role + ': a board');
      assert.deepEqual([board.role, board.tab], [role, 'goal-board'], 'its own tab key, never the old board\'s "goal"');
      const on = board.widgets.filter((w) => !w.optional && !w.empty).map((w) => w.key);
      assert.deepEqual(on, ['goal-sample-adherence', 'goal-sample-clients', 'goal-sample-revenue', 'goal-sample-programs'], role + ': the at-risk goal first');
      assert.equal(on.length >= 4 && on.length <= 6, true, 'a lean default board');
      assert.deepEqual(resolveGridLayout(null, board.widgets).visible.map((v) => v.w), [12, 6, 6, 6], 'the raised goal across the board, the rest in pairs');
      assert.deepEqual(board.widgets.filter((w) => w.optional).map((w) => w.key), ['momentum', 'earn'], 'Momentum and What clients earn you are in the catalogue');
      assert.equal(board.widgets.find((w) => w.key === 'first').empty, true, 'the first-goal card is off a board with goals');
      for (const w of board.widgets) assert.equal(GROUPS.includes(w.group) && typeof w.title === 'string' && typeof w.blurb === 'string' && w.blurb.length > 10, true, w.key);
      // The raised goal: Lift 2, open on its pace chart, its one filled action naming the sample's people.
      const focus = card(m, 'goal-sample-adherence');
      assert.equal(focus.querySelector('section').getAttribute('data-dash-lift'), '2');
      assert.equal(!!focus.querySelector('[data-cgs-chart]'), true, 'it opens on its pace chart');
      assert.equal(focus.querySelector('[data-cgs-status]').getAttribute('data-cgs-status'), 'atrisk');
      assert.match(textOf(focus), /At risk/);
      assert.equal(filled(m.div).map((b) => b.textContent).join('|'), role === 'trainer' ? 'Nudge Sam R. and Jonah W.' : 'Nudge Priya S.', 'one filled action on the board');
      // The others rest closed, each on track, with its one action.
      for (const k of ['goal-sample-clients', 'goal-sample-revenue', 'goal-sample-programs']) {
        const c = card(m, k);
        assert.equal(c.querySelector('section').getAttribute('data-dash-lift'), null, k);
        assert.equal(!!c.querySelector('[data-cgs-chart]'), false, k + ' expands on click');
        assert.equal(c.querySelector('[data-cgs-status]').getAttribute('data-cgs-status'), 'ontrack', k);
      }
      assert.equal(textOf(card(m, 'goal-sample-clients').querySelector('[data-cgs-action]')), 'Open Business · Growth');
      assert.equal(textOf(card(m, 'goal-sample-revenue').querySelector('[data-cgs-action]')), 'Open Business · Plan');
      assert.equal(textOf(card(m, 'goal-sample-programs').querySelector('[data-cgs-action]')), 'Update the figure');
      // ⚠ The sample's dates are from today: every due date is ahead, none a fixed past month.
      const today = C.cgsToday();
      for (const g of C.cgsSampleState(role).goals) assert.equal(C.cgsDayNum(g.due) > today && C.cgsDayOfInstant(g.startAt) < today, true, g.id);
      assert.doesNotMatch(m.text(), /by July|Jun 29|Jul 4|Aug 15|Aug 22|by Q3/, 'no stale month');
      assert.equal(!!m.div.querySelector('[data-band]'), true, 'the band labels the sample');
      assert.match(m.div.querySelector('[data-subtitle]').textContent, /Sample view/);
      // Expand opens another goal's chart; Collapse closes the raised one.
      await click(card(m, 'goal-sample-programs').querySelector('[data-cgs-expand]'));
      assert.equal(!!card(m, 'goal-sample-programs').querySelector('[data-cgs-chart]'), true, 'Expand draws its pace');
      await click(focus.querySelector('[data-cgs-expand]'));
      assert.equal(!!card(m, 'goal-sample-adherence').querySelector('[data-cgs-chart]'), false, 'Collapse closes it');
      assert.equal(seen.rosterReads > 0, true, 'the roster is read for the adherence goal');
    } finally { await m.unmount(); }
  }
});

test('the nudge names each client, with their tier mark, and messages the one tapped', async () => {
  account({ user: null });
  messages.length = 0;
  const { m } = await goalPage('trainer', { roster: { source: 'demo', triage: mockFeed('trainer') } });
  try {
    const focus = card(m, 'goal-sample-adherence');
    await click(focus.querySelector('[data-cgs-action]'));
    const rows = [...focus.querySelectorAll('[data-cgs-nudge] [data-cgs-message]')];
    assert.deepEqual(rows.map((b) => b.textContent), ['Message Sam', 'Message Jonah']);
    assert.equal(focus.querySelectorAll('[data-cgs-nudge] [aria-label]').length >= 2 || focus.querySelectorAll('[data-cgs-nudge] span').length >= 2, true, 'each with a tier mark');
    await click(rows[1]);
    assert.deepEqual(messages.map((x) => x.name + ':' + x.role), ['Jonah W.:trainer']);
    // A single named client is messaged directly.
    await m.unmount();
    messages.length = 0;
    const n = await goalPage('nutritionist', { roster: { source: 'demo', triage: mockFeed('nutritionist') } });
    await click(card(n.m, 'goal-sample-adherence').querySelector('[data-cgs-action]'));
    assert.deepEqual(messages.map((x) => x.name), ['Priya S.']);
    await n.m.unmount();
  } catch (e) { await m.unmount().catch(() => {}); throw e; }
});

test('signed in with no goals: a clean empty state, never the sample', async () => {
  for (const goals of [{}, { goals: [] }, { momentum: [['1', 'x', 'y']] }]) {
    account({ goals });
    const { m, board } = await goalPage('trainer', { live: { kind: 'live', activeClients: 3, mrrNetCents: 45000, adherencePct: 80 } });
    try {
      assert.deepEqual(board.widgets.filter((w) => !w.optional && !w.empty).map((w) => w.key), ['first'], JSON.stringify(goals));
      assert.match(textOf(card(m, 'first')), /No goals for this quarter yet/);
      assert.doesNotMatch(m.text(), /50 active clients|\$20k MRR|Publish 2 new programs|95% session adherence|Sam R\.|Sample/);
      assert.equal(!!m.div.querySelector('[data-band]'), false);
      assert.equal(!!byText(m.div, '[data-actions] button', /\+ New goal/), true);
    } finally { await m.unmount(); }
  }
});

test('a failed read is neither the sample nor an empty quarter, and nothing can be saved over it', async () => {
  const db = account({ goals: null });
  const { m, board } = await goalPage('trainer', { live: { kind: 'live', activeClients: 3, mrrNetCents: 45000, adherencePct: 80 } });
  try {
    assert.equal(!!board, false, 'no board');
    assert.equal(m.div.querySelector('[data-cgs-read]').getAttribute('data-cgs-read'), 'failed');
    assert.match(m.text(), /Your goals couldn't be read just now\./);
    assert.doesNotMatch(m.text(), /No goals for this quarter|50 active clients|Sample/);
    assert.equal(m.div.querySelectorAll('[data-actions] button').length, 0, 'no New goal, no Archive');
    assert.deepEqual(db.saves, []);
  } finally { await m.unmount(); }
  // A thrown sign-in check is a failed read too.
  window.shapeDb = { getUser: async () => { throw new Error('offline'); }, getUserGoals: async () => ({}) };
  const t = await goalPage('trainer');
  try { assert.equal(t.m.div.querySelector('[data-cgs-read]').getAttribute('data-cgs-read'), 'failed'); } finally { await t.m.unmount(); }
});

test('a signed-in coach\'s goals: bound figures read live, a legacy goal asks for a due date, and saving stamps its pace', async () => {
  const live = { kind: 'live', activeClients: 21, mrrNetCents: 1482000, adherencePct: null };
  const legacy = { id: 'g-old', t: '50 active clients', metric: 'activeClients', cur: 3, tgt: 50 };
  const rev = { id: 'g-rev', t: '$20k MRR by Q3', metric: 'mrrNetMonthly', money: true, cur: 0, tgt: 20000, start: 9000, startAt: new Date(Date.now() - 60 * DAY).toISOString(), due: C.cgsDayKey(C.cgsToday() + 60) };
  const adh = { id: 'g-adh', t: '95% adherence', metric: 'adherencePct', pct: true, cur: 91, tgt: 95, start: 90, startAt: new Date(Date.now() - 40 * DAY).toISOString(), due: C.cgsDayKey(C.cgsToday() + 40) };
  const db = account({ goals: { goals: [legacy, rev, adh], archived: [] } });
  const { m, board } = await goalPage('trainer', { live, roster: { source: 'demo', triage: mockFeed('trainer') } });
  try {
    assert.deepEqual(db.reads, [['trainer', { expectedUserId: 'coach-uid' }]], 'the read is bound to the account');
    const old = card(m, 'goal-g-old');
    assert.match(textOf(old), /^Goal · Active clients/);
    assert.match(textOf(old), /21 of 50 · no due date/, 'the live figure, not the typed 3');
    assert.match(textOf(old), /No due date/);
    assert.match(textOf(old), /Saved before goals kept a start and a due date/);
    assert.match(textOf(card(m, 'goal-g-rev')), /\$14,820 of \$20,000/);
    // An unreadable bound figure is "—", Not read, and asks nothing.
    const a = card(m, 'goal-g-adh');
    assert.match(textOf(a), /— of 95% · due/);
    assert.match(textOf(a), /Not read/);
    assert.equal(!!a.querySelector('[data-cgs-action]'), false);
    assert.doesNotMatch(m.text(), /Sam R\.|Jonah W\./, 'a roster that fell back to the demo names nobody');
    assert.equal(!!m.div.querySelector('[data-band]'), false);
    // Add a due date: the modal sets it, and the save stamps the pace's start from today's live figure.
    await click(old.querySelector('[data-cgs-action]'));
    const dlg = m.div.querySelector('[role="dialog"]');
    assert.equal(!!dlg, true, 'the edit modal');
    const due = C.cgsDayKey(C.cgsToday() + 50);
    await setValue(dlg.querySelector('input[type="date"]'), due);
    assert.match(textOf(m.div.querySelector('[data-cgs-start-line]')), /Its pace starts today, from 21\./);
    await click(m.div.querySelector('[data-cgs-save]'));
    await settle();
    assert.equal(db.saves.length, 1);
    const [kind, doc, opts] = db.saves[0];
    assert.deepEqual([kind, opts], ['trainer', { expectedUserId: 'coach-uid' }], 'the account-bound save');
    const saved = doc.goals.find((g) => g.id === 'g-old');
    assert.deepEqual([saved.start, saved.due, typeof saved.startAt], [21, due, 'string']);
    assert.deepEqual(doc.goals.map((g) => g.id), ['g-old', 'g-rev', 'g-adh'], 'the others untouched, in order');
    assert.equal(doc.goals.find((g) => g.id === 'g-rev').start, 9000);
    assert.match(textOf(card(m, 'goal-g-old')), /Just set/, 'its pace reads after a week');
    // A due date before the start can't be saved.
    await click(card(m, 'goal-g-rev').querySelector('[data-cgs-edit]'));
    await setValue(m.div.querySelector('[role="dialog"] input[type="date"]'), C.cgsDayKey(C.cgsToday() - 90));
    assert.equal(m.div.querySelector('[data-cgs-save]').disabled, true);
    assert.match(textOf(m.div.querySelector('[data-cgs-start-line]')), /^Pick a due date after/);
  } finally { await m.unmount(); }
});

test('while a bound goal\'s figures load, the board waits; a live roster names who', async () => {
  const adh = { id: 'g-adh', t: '95% session adherence', metric: 'adherencePct', pct: true, cur: 0, tgt: 95, start: 90, startAt: new Date(Date.now() - 42 * DAY).toISOString(), due: C.cgsDayKey(C.cgsToday() + 42) };
  account({ goals: { goals: [adh] } });
  const wait = await goalPage('trainer', { live: { kind: 'loading' } });
  try {
    assert.equal(!!wait.board, false);
    assert.equal(wait.m.div.querySelector('[data-cgs-read]').getAttribute('data-cgs-read'), 'pending');
  } finally { await wait.m.unmount(); }
  // The coach's own roster, read live: their real clients with missed sessions are named.
  const live = { kind: 'live', activeClients: 10, mrrNetCents: 100000, adherencePct: 92 };
  const feed = mockFeed('trainer');
  account({ goals: { goals: [adh] } });
  const { m } = await goalPage('trainer', { live, roster: { source: 'live', triage: feed } });
  try {
    assert.equal(textOf(card(m, 'goal-g-adh').querySelector('[data-cgs-action]')), 'Nudge Sam R. and Jonah W.');
    assert.equal(card(m, 'goal-g-adh').querySelector('section').getAttribute('data-dash-lift'), '2');
  } finally { await m.unmount(); }
});

test('Add, Edit, Delete, Archive and Restore keep working, each save bound to the account', async () => {
  const g1 = { id: 'g1', t: 'Publish 2 new programs', cur: 1, tgt: 2, start: 0, startAt: new Date(Date.now() - 20 * DAY).toISOString(), due: C.cgsDayKey(C.cgsToday() + 40) };
  const db = account({ goals: { goals: [g1], archived: [] } });
  const seen0 = shell({ live: { kind: 'live', activeClients: 1, mrrNetCents: 1, adherencePct: 1 } });
  const m = await mount(React.createElement(PAGES.TrainerGoalPage));
  await settle();
  try {
    // Add: the modal starts at the quarter's end, and the new goal gets an id and a start.
    await click(byText(m.div, '[data-actions] button', /\+ New goal/));
    const dlg = m.div.querySelector('[role="dialog"]');
    assert.equal(dlg.querySelector('input[type="date"]').value, C.cgsDayKey(C.cgsQuarterEnd(C.cgsToday())));
    await setValue(dlg.querySelector('input[type="text"]'), 'Ten consults');
    await setValue(dlg.querySelectorAll('input[type="number"]')[0], 4);
    await setValue(dlg.querySelectorAll('input[type="number"]')[1], 10);
    await click(m.div.querySelector('[data-cgs-save]'));
    await settle();
    let doc = db.saves[db.saves.length - 1][1];
    const added = doc.goals[1];
    assert.deepEqual([doc.goals.length, added.t, added.start, added.cur, added.tgt, added.due], [2, 'Ten consults', 4, 4, 10, C.cgsDayKey(C.cgsQuarterEnd(C.cgsToday()))]);
    assert.match(added.id, /^g/);
    // Edit keeps the start.
    await click(card(m, 'goal-g1').querySelector('[data-cgs-edit]'));
    await setValue(m.div.querySelector('[role="dialog"] input[type="text"]'), 'Publish 3 new programs');
    await click(m.div.querySelector('[data-cgs-save]'));
    await settle();
    doc = db.saves[db.saves.length - 1][1];
    assert.deepEqual([doc.goals[0].t, doc.goals[0].start, doc.goals[0].startAt], ['Publish 3 new programs', 0, g1.startAt]);
    // Delete asks first.
    await click(card(m, 'goal-g1').querySelector('[data-cgs-edit]'));
    await click(byText(m.div, '[role="dialog"] button', /^Delete$/));
    await settle();
    assert.deepEqual(seen0.confirms, ['Delete this goal?']);
    doc = db.saves[db.saves.length - 1][1];
    assert.deepEqual(doc.goals.map((g) => g.t), ['Ten consults']);
    // Archive asks, keeps a copy; the empty board offers it back.
    await click(m.div.querySelector('[data-goal-archive]'));
    await settle();
    doc = db.saves[db.saves.length - 1][1];
    assert.deepEqual([doc.goals.length, doc.archived.length, doc.archived[0].goals[0].t], [0, 1, 'Ten consults']);
    assert.equal(!!m.div.querySelector('[data-goal-restore]'), true);
    await click(m.div.querySelector('[data-goal-restore]'));
    await settle();
    doc = db.saves[db.saves.length - 1][1];
    assert.deepEqual([doc.goals.map((g) => g.t), doc.archived.length], [['Ten consults'], 0]);
    assert.equal(db.saves.every((s) => s[0] === 'trainer' && s[2] && s[2].expectedUserId === 'coach-uid'), true, 'every save is bound to the account');
  } finally { await m.unmount(); }
});

test('a setup in Nora\'s chat (shape:accountSetup) reads the goals again', async () => {
  let n = 0;
  const db = account({ goals: () => { n += 1; return { goals: n === 1 ? [] : [{ id: 'g9', t: 'Set by Nora', cur: 1, tgt: 5 }] }; } });
  const { m, seen } = await goalPage('trainer', { live: { kind: 'live', activeClients: 1, mrrNetCents: 1, adherencePct: 1 } });
  try {
    assert.deepEqual(seen.boards['goal-board'].widgets.filter((w) => !w.empty && !w.optional).map((w) => w.key), ['first']);
    await React.act(async () => { window.dispatchEvent(new window.CustomEvent('shape:accountSetup', { detail: { undone: false } })); });
    await settle();
    assert.equal(db.reads.length, 2);
    assert.deepEqual(seen.boards['goal-board'].widgets.filter((w) => !w.empty && !w.optional).map((w) => w.key), ['goal-g9']);
  } finally { await m.unmount(); }
});

test('the catalogue cards: Momentum and What clients earn you, each when added', async () => {
  account({ user: null });
  const { m } = await goalPage('trainer', { all: true, roster: { source: 'demo', triage: mockFeed('trainer') } });
  try {
    assert.match(textOf(card(m, 'momentum')), /^Momentum/);
    assert.match(textOf(card(m, 'momentum')), /Sample figures, not your own practice/);
    assert.match(textOf(card(m, 'earn')), /^What clients earn you/);
  } finally { await m.unmount(); }
});

// ── 5. Score's arithmetic ────────────────────────────────────────────────────
// The route's own formula, read out of src/app/api/coach/score/route.ts and run: the board's every
// number follows it.
const ROUTE = readFileSync(new URL('../src/app/api/coach/score/route.ts', import.meta.url), 'utf8');
const routeTiers = [...ROUTE.slice(ROUTE.indexOf('const TIERS'), ROUTE.indexOf('];', ROUTE.indexOf('const TIERS'))).matchAll(/\['(\w+)', (\d+)\]/g)].map((x) => [x[1], Number(x[2])]);
const routeEach = { clients: Number(/const ptsActive = activeClients \* (\d+);/.exec(ROUTE)[1]), completion: Number(/Math\.round\(completionPct \* (\d+)\)/.exec(ROUTE)[1]), programs: Number(/const ptsPrograms = programsPublished \* (\d+);/.exec(ROUTE)[1]) };
function routeScore(role, clients, pct, programs) {
  const breakdown = [{ label: 'Active clients', points: clients * routeEach.clients, sub: clients + ' clients' }, { label: 'Session completion', points: pct * routeEach.completion, sub: pct + '% · last 90d' }]
    .concat(role === 'trainer' ? [{ label: 'Programs published', points: programs * routeEach.programs, sub: programs + ' live' }] : []);
  const total = breakdown.reduce((a, b) => a + b.points, 0);
  let i = 0; for (let k = routeTiers.length - 1; k >= 0; k--) if (total >= routeTiers[k][1]) { i = k; break; }
  const next = routeTiers[i + 1] || null;
  return { total, breakdown, current_tier: routeTiers[i][0], next_tier: next ? next[0] : null, points_to_next: next ? next[1] - total : 0 };
}

test('the score follows the route\'s formula: its terms, its tiers, and the samples on them', () => {
  assert.deepEqual(routeEach, { clients: 50, completion: 10, programs: 80 });
  assert.deepEqual(C.CGS_TIERS, routeTiers, 'the tiers are the route\'s');
  assert.deepEqual(C.CGS_TERMS.map((t) => [t.label, t.each]), [['Active clients', 50], ['Session completion', 10], ['Programs published', 80]]);
  assert.deepEqual(C.CGS_SCORE_SAMPLE.trainer, routeScore('trainer', 14, 90, 2), 'the review\'s Maya: 1,760, Pro, 240 to Elite');
  assert.deepEqual(C.CGS_SCORE_SAMPLE.nutritionist, routeScore('nutritionist', 12, 91, 0));
  const m = C.cgsScoreModel(routeScore('trainer', 14, 90, 2), 'trainer');
  assert.deepEqual([m.total, m.sum, m.tier, m.next, m.toNext, m.clients, m.pct, m.programs], [1760, 1760, 'Pro', 'Elite', 240, 14, 90, 2]);
  assert.equal(C.cgsScoreSum(m), '14 × 50 + 90 × 10 + 2 × 80');
  // Counts come from the points, never the sub-line's words.
  const odd = C.cgsScoreModel({ total: 600, current_tier: 'Certified', next_tier: 'Pro', points_to_next: 150, breakdown: [{ label: 'Active clients', points: 600, sub: 'twelve-ish' }] }, 'nutritionist');
  assert.equal(odd.clients, 12);
  // A row the formula doesn't know is its own part, so the parts still add to the total.
  const extra = C.cgsScoreModel({ total: 1000, current_tier: 'Pro', next_tier: 'Elite', points_to_next: 1000, breakdown: [{ label: 'Active clients', points: 900 }, { label: 'Something new', points: 100 }] }, 'trainer');
  assert.deepEqual([extra.sum, extra.parts.map((p) => p.term)], [1000, ['clients', null]]);
  // Legacy rung names read as the coach's.
  assert.equal(C.cgsScoreModel({ total: 900, current_tier: 'Tempo', next_tier: 'Form', points_to_next: 1100, breakdown: [] }, 'trainer').tier, 'Pro');
  assert.equal(C.cgsScoreModel(null, 'trainer'), null);
  // The coach's place on one line of five tiers.
  assert.deepEqual(C.cgsLadderPlace(0), { index: 0, at: 0, frac: 0 });
  // The current tier's segment fills only as far as the score has come through it (owner, 2026-11-10:
  // 80 points in Certified drew the whole segment).
  assert.equal(C.cgsLadderPlace(80).frac, 80 / 750);
  assert.equal(C.cgsLadderPlace(1760).frac, (1760 - 750) / 1250);
  assert.equal(C.cgsLadderPlace(40000).frac, 1);
  assert.equal(C.cgsLadderPlace(1760).index, 1);
  assert.equal(Math.round(C.cgsLadderPlace(1760).at * 1000), Math.round(((1 + (1760 - 750) / 1250) / 5) * 1000));
  assert.equal(C.cgsLadderPlace(2000).index, 2);
  assert.equal(C.cgsLadderPlace(40000).at, 1);
});

test('fastest way up: each term\'s sum and where it lands, fewest steps first, and completion\'s cap said with its arithmetic', () => {
  // The trainer: 240 to Elite. 3 programs land on 2,000; 5 clients on 2,010; completion has 100 of room.
  const t = C.cgsWayUp(C.cgsScoreModel(routeScore('trainer', 14, 90, 2), 'trainer'), 'trainer');
  assert.deepEqual(t.steps.map(C.cgsStepText), ['3 programs: 3 × 80 = +240, lands on 2,000 · Elite', '5 new clients: 5 × 50 = +250, lands on 2,010 · Elite']);
  assert.deepEqual(t.capped, { room: 100, n: 10, from: 90, lands: 1860 });
  // The nutritionist: 12 × 50 + 91 × 10 = 1,510, and completion can add only 90 more.
  const n = C.cgsWayUp(C.cgsScoreModel(routeScore('nutritionist', 12, 91, 0), 'nutritionist'), 'nutritionist');
  assert.deepEqual(n.steps.map(C.cgsStepText), ['10 new clients: 10 × 50 = +500, lands on 2,010 · Elite']);
  assert.deepEqual(n.capped, { room: 90, n: 9, from: 91, lands: 1600 });
  // When completion's room reaches the tier it is a way up, in percentage points.
  const near = C.cgsWayUp(C.cgsScoreModel(routeScore('trainer', 20, 80, 3), 'trainer'), 'trainer'); // 1,000 + 800 + 240 = 2,040 → Elite, 2,960 to Master
  assert.equal(near.next, 'Master');
  const close = C.cgsWayUp(C.cgsScoreModel(routeScore('nutritionist', 25, 72, 0), 'nutritionist'), 'nutritionist'); // 1,250 + 720 = 1,970: 30 to Elite
  assert.deepEqual(close.steps.map(C.cgsStepText), ['1 new client: 1 × 50 = +50, lands on 2,020 · Elite', 'Completion 72% → 75%: 3 × 10 = +30, lands on 2,000 · Elite']);
  assert.equal(close.capped, null);
  // Room that exactly reaches the tier is a way up: 1,970 at 97%, and 3 points land on 2,000.
  const exact = C.cgsWayUp(C.cgsScoreModel(routeScore('nutritionist', 20, 97, 0), 'nutritionist'), 'nutritionist');
  assert.deepEqual([exact.steps.map((s) => s.term), exact.capped], [['clients', 'completion'], null]);
  assert.equal(C.cgsStepText(exact.steps[1]), 'Completion 97% → 100%: 3 × 10 = +30, lands on 2,000 · Elite');
  // At 100% there is no room at all.
  assert.deepEqual(C.cgsWayUp(C.cgsScoreModel(routeScore('nutritionist', 2, 100, 0), 'nutritionist'), 'nutritionist').capped, { room: 0, n: 0, from: 100, lands: 1100 });
  // Each step's landing is the route's own tier for that total.
  for (const s of t.steps.concat(n.steps, close.steps)) assert.equal(s.tier, routeTiers[C.cgsTierOf(s.lands)][0]);
  assert.deepEqual(C.cgsWayUp(C.cgsScoreModel(routeScore('nutritionist', 400, 90, 0), 'nutritionist'), 'nutritionist'), { top: true });
});

// ── 6. The Score board ───────────────────────────────────────────────────────
function scriptFetch(answer) {
  const paths = [];
  globalThis.fetch = window.fetch = async (path) => {
    paths.push(path);
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return { ok: answer >= 200 && answer < 300, status: answer, json: async () => ({ error: 'no' }) };
    return { ok: true, status: 200, json: async () => answer };
  };
  return paths;
}
async function scorePage(role, answer, opts = {}) {
  const seen = shell(opts);
  const paths = scriptFetch(answer);
  const m = await mount(React.createElement(role === 'nutritionist' ? PAGES.NutritionistScorePage : PAGES.TrainerScorePage));
  await settle();
  return { m, seen, paths, board: seen.boards['score-board'], eyebrow: () => m.div.querySelector('[data-eyebrow]').textContent, title: () => m.div.querySelector('h1').textContent };
}
const PERKS = /What Master unlocks|Verified badge on marketplace|Top-3 rank|Higher payout tier|Host Shape Radio rooms|Early access to new features/;

test('signed out (a 401): the sample board, labelled, with the fastest way up the only raised card', async () => {
  for (const [role, total, lead, action] of [['trainer', '1,760', '3 programs: 3 × 80 = +240, lands on 2,000 · Elite', 'Open Programs'], ['nutritionist', '1,510', '10 new clients: 10 × 50 = +500, lands on 2,010 · Elite', 'Open Business · Growth']]) {
    const { m, board, paths, title, eyebrow } = await scorePage(role, 401);
    try {
      assert.deepEqual(paths, ['/api/coach/score?role=' + role]);
      assert.deepEqual([board.role, board.tab], [role, 'score-board'], 'its own tab key, never the old board\'s "score"');
      assert.deepEqual(board.widgets.map((w) => w.key), ['score', 'wayup', 'parts'], 'a lean board of three; the formula sits under it');
      assert.deepEqual(board.widgets.filter((w) => w.optional).map((w) => w.key), [], 'and nothing in the catalogue: the perks left the page');
      assert.deepEqual(resolveGridLayout(null, board.widgets).visible.map((v) => v.key + ':' + v.w), ['score:8', 'wayup:4', 'parts:12']);
      for (const w of board.widgets) assert.equal(GROUPS.includes(w.group), true, w.key);
      assert.equal(title(), total);
      assert.match(eyebrow(), /· PRO · SAMPLE$/);
      assert.equal(!!m.div.querySelector('[data-band]'), true);
      assert.match(textOf(card(m, 'score')), /Sample · an example coach/, 'the example is labelled as one');
      assert.match(textOf(card(m, 'score')), new RegExp(total + 'Pro · ' + (role === 'trainer' ? '240' : '490') + ' to Elite'));
      assert.equal(m.div.querySelector('[data-cgs-current]').getAttribute('data-cgs-tier'), 'Pro', 'the coach\'s place on the five tiers');
      assert.equal(m.div.querySelectorAll('[data-cgs-tier]').length, 5);
      // The bar is the score: Certified passed and full, Pro filled as far as the score is through it.
      const pts = Number(total.replace(/,/g, ''));
      assert.deepEqual([...m.div.querySelectorAll('[data-cgs-fill]')].map((f) => Number(f.getAttribute('data-cgs-fill'))), [100, Math.round(((pts - 750) / 1250) * 1000) / 10, 0, 0, 0]);
      // The only raised card, its one filled action.
      assert.deepEqual([...m.div.querySelectorAll('[data-dash-lift="2"]')].map((s) => s.getAttribute('aria-label')), ['Fastest way up']);
      assert.equal(textOf(m.div.querySelector('[data-cgs-step]')), lead);
      assert.deepEqual(filled(m.div).map((b) => b.textContent), [action]);
      const capped = textOf(m.div.querySelector('[data-cgs-capped]'));
      assert.match(capped, role === 'trainer' ? /Your 1,760 is 14 × 50 \+ 90 × 10 \+ 2 × 80\. Completion is at 90%, so it can add only 100 more \(10 × 10, to 1,860\)\. New clients and programs carry the climb\./
        : /Your 1,510 is 12 × 50 \+ 91 × 10\. Completion is at 91%, so it can add only 90 more \(9 × 10, to 1,600\)\. New clients carry the climb\./);
      // A bar that adds up: its segments are the score's parts, summing to the total.
      const segs = [...m.div.querySelectorAll('[data-cgs-seg]')].map((s) => Number(s.getAttribute('data-cgs-points')));
      assert.equal(segs.reduce((a, b) => a + b, 0), Number(total.replace(',', '')));
      assert.equal(segs.length, role === 'trainer' ? 3 : 2);
      assert.match(textOf(m.div.querySelector('[data-cgs-sum]')), role === 'trainer' ? /^700 \+ 900 \+ 160 = 1,760$/ : /^600 \+ 910 = 1,510$/);
      const earn = m.div.querySelector('#score-earn');
      assert.match(textOf(earn), new RegExp('^How points are earned' + (role === 'trainer' ? 3 : 2) + ' TERMS'));
      assert.equal(/Programs published/.test(textOf(earn)), role === 'trainer');
      assert.equal(!!earn.closest('[data-card]'), false, 'How it works scrolls to a section no board control can hide');
      assert.doesNotMatch(m.text(), PERKS, 'no perks: nothing grants them');
    } finally { await m.unmount(); }
  }
});

test('a signed-in coach reads their own score on the board; the fix note is theirs only', async () => {
  const own = routeScore('trainer', 30, 87, 0); // 1,500 + 870 = 2,370: Elite, 2,630 to Master
  const { m, title, eyebrow } = await scorePage('trainer', own, { fixNote: 'We corrected how Score counts sessions and programs.' });
  try {
    assert.equal(title(), '2,370');
    assert.equal(eyebrow(), 'COACH SCORE · ELITE');
    assert.equal(m.div.querySelector('[data-cgs-current]').getAttribute('data-cgs-tier'), 'Elite');
    assert.match(textOf(card(m, 'wayup')), /2,630 to Master/);
    assert.match(textOf(m.div.querySelector('[data-cgs-step]')), /^33 programs: 33 × 80 = \+2,640, lands on 5,010 · Master$/);
    assert.equal(!!m.div.querySelector('[data-score-fix]'), true);
    assert.doesNotMatch(m.text(), /SAMPLE|Sample · an example/);
    assert.equal(!!m.div.querySelector('[data-band]'), false);
  } finally { await m.unmount(); }
  const s = await scorePage('trainer', 401, { fixNote: 'We corrected how Score counts sessions and programs.' });
  try { assert.equal(!!s.m.div.querySelector('[data-score-fix]'), false, 'never on the sample'); } finally { await s.m.unmount(); }
});

test('a failed read is never the sample: the score card says so, and the cards that need a score wait', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    for (const failure of [503, 500, 404, new Error('offline'), { error: 'not a score' }]) {
      const what = role + ' ' + (failure instanceof Error ? 'thrown' : JSON.stringify(failure));
      const { m, board, title, eyebrow } = await scorePage(role, failure);
      try {
        assert.equal(title(), '—', what);
        assert.match(eyebrow(), /COULDN'T READ/, what);
        assert.deepEqual(board.widgets.filter((w) => !w.empty).map((w) => w.key), ['score'], what + ': the way up and the bar wait on a score');
        assert.equal(!!m.div.querySelector('#score-earn'), true, what + ': the formula is still there to read');
        assert.equal(board.widgets.find((w) => w.key === 'wayup').emptyWhy, 'your score couldn\'t be read');
        assert.match(textOf(card(m, 'score')), /Couldn't read your score just now\./);
        assert.doesNotMatch(m.text(), /1,760|1,510|14 clients|12 clients|SAMPLE|Sample/, what);
        assert.equal(!!m.div.querySelector('[data-band]') || !!m.div.querySelector('[data-cgs-current]'), false, what);
      } finally { await m.unmount(); }
    }
  }
  globalThis.fetch = window.fetch = () => new Promise(() => {});
  const seen = shell();
  const m = await mount(React.createElement(PAGES.TrainerScorePage));
  try {
    assert.equal(!!seen.boards['score-board'], false, 'no board while the read runs');
    assert.match(m.text(), /Reading your score…/);
    assert.equal(m.div.querySelector('h1').textContent, '—');
  } finally { await m.unmount(); }
});

test('the four page files only mount the shared boards, and the old fixed-page text is gone', () => {
  for (const [f, comp, role] of [['trainerGoalPage.jsx', 'CoachGoalBoard', 'trainer'], ['nutritionistGoalPage.jsx', 'CoachGoalBoard', 'nutritionist'], ['trainerScorePage.jsx', 'CoachScoreBoard', 'trainer'], ['nutritionistScorePage.jsx', 'CoachScoreBoard', 'nutritionist']]) {
    const src = read(f);
    assert.equal(src.includes('return <' + comp + ' role="' + role + '" />;'), true, f);
    assert.doesNotMatch(src, /NOT A BOARD|What Master unlocks|DEFAULT_GOALS_STATE|by July/, f);
  }
  const mod = read('coachGoalScore.jsx');
  assert.doesNotMatch(mod, /A FIXED PAGE, NOT A BOARD|What Master unlocks" *list|Top-3 rank|Host Shape Radio rooms/);
  for (const html of ['TrainerApp.html', 'NutritionistApp.html', 'TrainerGoal.html', 'NutritionistGoal.html', 'TrainerScore.html', 'NutritionistScore.html']) {
    const page = read(html);
    const at = page.indexOf('<script type="text/babel" src="coachGoalScore.jsx"></script>');
    assert.equal(at > 0, true, html + ' loads the boards, with no ?v=');
    const mod2 = Math.max(page.indexOf('GoalPage.jsx'), page.indexOf('ScorePage.jsx'));
    assert.equal(at < mod2, true, html + ' loads them before the page module');
    if (/App\.html$/.test(html)) assert.equal(page.indexOf('src="dashBusiness.jsx') > 0 && page.indexOf('src="dashBusiness.jsx') < at && page.indexOf('src="dashGrid.jsx') < at, true, html + ': DbzCard and DashGrid load first');
  }
});

// ── 7. Business · Overview's goal line ───────────────────────────────────────
test('the Overview\'s goal line is the coach\'s own revenue goal, named, else the Plan\'s with today\'s words', async () => {
  assert.deepEqual(B.dbzOwnRevenueGoal(undefined), { state: 'reading' });
  assert.deepEqual(B.dbzOwnRevenueGoal(null), { state: 'unread' });
  assert.deepEqual(B.dbzOwnRevenueGoal([]), { state: 'none' });
  assert.deepEqual(B.dbzOwnRevenueGoal([{ t: '50 clients', metric: 'activeClients', tgt: 50 }, { t: 'typed $', money: true, tgt: 9000 }]), { state: 'none' }, 'only a goal bound to the net a month');
  assert.deepEqual(B.dbzOwnRevenueGoal([{ t: 'zero', metric: 'mrrNetMonthly', tgt: 0 }, { t: 'blank', metric: 'mrrNetMonthly', tgt: '' }, { t: '$20k MRR by Q3', metric: 'mrrNetMonthly', tgt: 20000 }, { t: 'later', metric: 'mrrNetMonthly', tgt: 30000 }]),
    { state: 'ready', title: '$20k MRR by Q3', cents: 2000000 }, 'the first with a target');
  const PACE = { adds: 2, churn: 0.05, days: 91, fromFirst: false, added: 6, ended: 2, avgActive: 10, unread: false };
  const base = { state: 'ready', clients: 10, mrrNetCents: 150000, mrrGrossCents: 180000, rateCents: 18000, byoShare: 0.2, pace: PACE };
  const start = CF.planStart(base);
  const own = B.dbzPaceModel(base, B.dbzOwnRevenueGoal([{ t: '$20k MRR by Q3', metric: 'mrrNetMonthly', tgt: 20000 }]));
  assert.deepEqual([own.goalCents, own.goalOf, own.goalTitle], [2000000, 'own', '$20k MRR by Q3']);
  assert.equal(own.reach, CF.monthsTo(2000000, own.f));
  assert.equal(B.dbzPaceModel(base, { state: 'reading' }).state, 'loading', 'the line waits for the coach\'s goal, never jumps');
  assert.deepEqual([B.dbzPaceModel(base, { state: 'none' }).goalCents, B.dbzPaceModel(base, { state: 'none' }).goalOf], [start.goal * 100, 'plan']);
  assert.deepEqual([B.dbzPaceModel(base, { state: 'unread' }).goalCents, B.dbzPaceModel(base, { state: 'unread' }).goalOf], [start.goal * 100, 'unread']);
  assert.equal(B.dbzPaceModel(base).goalOf, 'plan', 'the preview: the Plan\'s');
  const m = await mount(React.createElement(B.DbzPaceCard, { model: own }));
  try {
    assert.match(m.text(), /The goal line is your goal “\$20k MRR by Q3”, from your Goal tab\. A projection, not a promise\./);
    assert.match(m.text(), /\$20,000 goal line/);
  } finally { await m.unmount(); }
  for (const [o, re] of [[{ state: 'none' }, /The goal line is the Plan's starting goal, half again today's net\. A projection/], [{ state: 'unread' }, /Your goals couldn't be read just now, so the goal line is the Plan's starting goal/]]) {
    const c = await mount(React.createElement(B.DbzPaceCard, { model: B.dbzPaceModel(base, o) }));
    try { assert.match(c.text(), re); } finally { await c.unmount(); }
  }
});

test('the Business page reads the coach\'s goals, bound to the account, and again on shape:accountSetup', async () => {
  const weeks = Array.from({ length: 26 }, (_, i) => {
    const d = new Date(Date.now() - (25 - i) * 7 * DAY);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { weekOf: d.toISOString().slice(0, 10), active: 10, added: i % 3 === 0 ? 1 : 0, ended: i % 5 === 0 ? 1 : 0, mrrNetCents: 153000, mrrGrossCents: 180000, oneTimeCents: 0 };
  });
  const analytics = { isTrainer: true, providerId: 7, metrics: {}, byOrigin: [], byoMix: { clients: 10, brought: 0 }, trajectory: { weeks, firstSubAt: weeks[0].weekOf + 'T00:00:00Z' }, renewals: [], churn: [], stripe: { connected: false } };
  const ok = (d) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d) });
  globalThis.fetch = window.fetch = (url) => (url.startsWith('/api/trainer/analytics') ? ok(analytics) : url.startsWith('/api/coach/listing') ? ok({ listings: [{ role: 'trainer', monthly: 180, ready: true }] })
    : url.startsWith('/api/coach/capacity') ? ok({ listings: [{ role: 'trainer', waiting: 0, effective: false }] }) : Promise.reject(new Error('unexpected ' + url)));
  const roster = DashSignals.buildMockClients(new Date());
  const seen = { boards: {} };
  Object.assign(globalThis, {
    useDashboard: () => ({ today: { isTrainer: true }, source: 'live', clients: roster, triage: [] }),
    useRememberedChoices: () => null, useRememberedChoice: () => React.useState('overview'),
    DashPage: ({ children }) => React.createElement(React.Fragment, null, children), DashSegmented: () => null, DashExportButton: () => null, DashFunnelPanel: () => null, DashDemoBand: () => null,
    DashGrid: (props) => { seen.boards[props.tab] = props; return React.createElement(React.Fragment, null, props.widgets.filter((w) => !w.empty && !w.optional).map((w) => React.createElement('div', { key: w.key, 'data-card': w.key }, w.render()))); },
    trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: {}, nutriPayoutCard: {}, useDashUnits: () => ({ measure: (v, u) => ({ value: v, unit: u }) }), useDashNextPayout: undefined,
  });
  let target = 20000;
  // Signed in only through the cookie bridge (Codex on #2638): getUser answers nobody until getSession runs.
  const db = account({ bridge: true, goals: () => ({ goals: [{ id: 'g', t: 'My revenue goal', metric: 'mrrNetMonthly', tgt: target }] }) });
  const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
  await settle(6);
  try {
    assert.deepEqual([db.bridged, db.reads], [true, [['trainer', { expectedUserId: 'coach-uid' }]]]);
    const pace = () => textOf(card(m, 'pace'));
    assert.match(pace(), /The goal line is your goal “My revenue goal”, from your Goal tab\./);
    assert.match(pace(), /\$20,000 goal line/);
    target = 25000;
    await React.act(async () => { window.dispatchEvent(new window.CustomEvent('shape:accountSetup', { detail: {} })); });
    await settle(4);
    assert.equal(db.reads.length, 2);
    assert.match(pace(), /\$25,000 goal line/);
  } finally { await m.unmount(); }
  // A goals read that fails: the Plan's line, and it says why.
  account({ goals: null });
  const f = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
  await settle(6);
  try { assert.match(textOf(card(f, 'pace')), /Your goals couldn't be read just now, so the goal line is the Plan's starting goal/); } finally { await f.unmount(); }
});

test('Codex on #2638: "How it works" keeps somewhere to scroll with every card hidden, and while the score reads', async () => {
  // A board whose coach hid every card renders none of them; the formula is the page's, under the board.
  globalThis.fetch = window.fetch = () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
  const seen = shell();
  const shown = globalThis.DashGrid;
  globalThis.DashGrid = (props) => { seen.boards[props.tab] = props; return null; };
  const m = await mount(React.createElement(PAGES.TrainerScorePage));
  await settle();
  try {
    assert.equal(!!seen.boards['score-board'], true);
    assert.equal(m.div.querySelectorAll('[data-card]').length, 0, 'every card hidden');
    assert.match(textOf(m.div.querySelector('#score-earn')), /^How points are earned3 TERMS/);
  } finally { await m.unmount(); globalThis.DashGrid = shown; }
  // Still reading: the formula is there before the board.
  globalThis.fetch = window.fetch = () => new Promise(() => {});
  shell();
  const p = await mount(React.createElement(PAGES.NutritionistScorePage));
  try {
    assert.equal(!!p.div.querySelector('[data-cgs-read="pending"]'), true);
    assert.match(textOf(p.div.querySelector('#score-earn')), /^How points are earned2 TERMS/);
  } finally { await p.unmount(); }
});

test('Codex on #2638: a coach signed in only through the cookie bridge reads their own goals, on Goal and on Business', async () => {
  const mine = { id: 'g-rev', t: 'My revenue goal', metric: 'mrrNetMonthly', money: true, cur: 0, tgt: 20000, start: 9000, startAt: new Date(Date.now() - 30 * DAY).toISOString(), due: C.cgsDayKey(C.cgsToday() + 60) };
  const db = account({ bridge: true, goals: { goals: [mine] } });
  const { m, board } = await goalPage('trainer', { live: { kind: 'live', activeClients: 10, mrrNetCents: 1482000, adherencePct: null } });
  try {
    assert.equal(db.bridged, true, 'getSession ran');
    assert.deepEqual(db.reads, [['trainer', { expectedUserId: 'coach-uid' }]], 'and the goals read as this coach');
    assert.deepEqual(board.widgets.filter((w) => !w.optional && !w.empty).map((w) => w.key), ['goal-g-rev']);
    assert.doesNotMatch(m.text(), /Sample view|50 active clients/, 'never the sample in their place');
  } finally { await m.unmount(); }
  // Business · Overview reads the goals the same way: its page test signs the coach in through the bridge.
});
