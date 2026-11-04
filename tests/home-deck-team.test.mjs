// tests/home-deck-team.test.mjs
//
// THE MEMBER HOME THE OWNER CHOSE (2026-11-03, the Home preview: "ok looks good"), its sections drawn
// from known data through the shipping views:
//   · the climb (BSHomeDeck.jsx's BSHomeClimbView, services/homeClimb.mjs's state and route): goal
//     progress only ("the chart should just be goal progress"), in the member's units;
//   · This week (BSHomeWeekBarsView): five bars a day, Train · Food · Protein · Steps · Check-in;
//   · Team (BSHomeTeam.jsx): each coach the member pays once, the trainer with today's call and the
//     nutritionist with their note and the food left ("so you dont have them twice");
//   · Daily habits in the morning panel (BSHomeSections.jsx's BSHomeHabitsRowView).
// The reads behind them are tests/home-sections.test.mjs's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { drive, textOf, SHIM, ROOT, THEME } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { IntlMessageFormat } from 'intl-messageformat';
import * as C from '../mobile-app/src/services/homeClimb.mjs';

// The app's translator with no catalog: each string is its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };

const REG = { registry: new Map([['react', { ...SHIM, useContext: (c) => c._currentValue }], ['react-dom', { createPortal: (n) => n }]]) };
const S = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeSections.jsx'), REG);
const D = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeDeck.jsx'), REG);
const T = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeTeam.jsx'), REG);

const LB = 0.45359237;
// The harness theme with the real kilogram → pound display the app's imperial theme has.
const withPounds = (fn) => {
  const prev = globalThis.useBS;
  globalThis.useBS = () => new Proxy(THEME, { get: (t, k) => (k === 'kgToDisplay' ? (kg) => kg / LB : t[k]) });
  try { return fn(); } finally { globalThis.useBS = prev; }
};
const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
const signIn = () => { globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-1' } }) }; };
const signOut = () => { delete globalThis.ShapeAuth; };
// What the views dispatch on window, by event name (the harness's window has no event target).
const listen = (name) => {
  const got = [];
  const prev = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (e) => { if (e && e.type === name) got.push(e.detail); return true; };
  return { got, off: () => { if (prev) globalThis.dispatchEvent = prev; else delete globalThis.dispatchEvent; } };
};

// ── The climb ────────────────────────────────────────────────────────────────

const LOSING = [
  { d: '2026-08-27', kg: 80.0 }, { d: '2026-09-24', kg: 79.0 }, { d: '2026-10-01', kg: 78.8 },
  { d: '2026-10-08', kg: 78.4 }, { d: '2026-10-15', kg: 78.0 }, { d: '2026-10-22', kg: 77.6 },
];
const GOAL_PROPS = (over = {}) => ({
  docKg: (v, o) => (v == null || v === '' ? null : (/^lb/i.test(String((o && o.unit) || 'kg')) ? Number(v) * LB : Number(v))),
  isWeightGoal: (id) => ['fat_loss', 'muscle', ''].includes(id || ''),
  goalWords: (id) => ({ fat_loss: 'Lose fat', race: 'Run a race' })[id] || id,
  todayIso: '2026-10-22',
  ...over,
});
const climbOf = (d) => d.nodes()[0];
// The milestone ticks: a short upright at a quarter, a half and three quarters of the route.
const milestones = (d) => d.nodes().filter((n) => n.type === 'line' && C.BS_CLIMB_MILESTONES.some((m) => n.props.x1 === C.bsClimbPoint(m / 100).x && n.props.x2 === n.props.x1 && n.props.y1 === C.bsClimbPoint(m / 100).y - 5));
const climbLinks = (d) => d.nodes().filter((n) => n.type === 'button');

test('the climb\'s state: progress, reached, a start with no target, words alone, or nothing', () => {
  const read = { nowKg: 77.6, targetKg: 75, pct: 48, reached: false, paceKgWk: -0.36 };
  assert.deepEqual(C.bsHomeClimbState({ read, words: 'Lean', weightGoal: true }), { kind: 'progress', pct: 48, early: false });
  assert.deepEqual(C.bsHomeClimbState({ read: { ...read, paceKgWk: null }, weightGoal: true }), { kind: 'progress', pct: 48, early: true }, 'no pace yet: early');
  assert.equal(C.bsHomeClimbState({ read: { ...read, pct: 140 }, weightGoal: true }).pct, 100, 'never past the flag');
  assert.equal(C.bsHomeClimbState({ read: { ...read, pct: null }, weightGoal: true }).pct, 0, 'a share it cannot work out is none of the way');
  assert.deepEqual(C.bsHomeClimbState({ read: { ...read, reached: true }, weightGoal: true }), { kind: 'reached', pct: 100, early: false });
  assert.equal(C.bsHomeClimbState({ read: { nowKg: 77.6, targetKg: null, paceKgWk: -0.2 }, weightGoal: true }).kind, 'start', 'weigh-ins, no target');
  assert.equal(C.bsHomeClimbState({ read, words: 'Run a race', weightGoal: false }).kind, 'words', 'not a weight goal: its words');
  assert.equal(C.bsHomeClimbState({ read: { nowKg: null, targetKg: 75 }, words: 'Lose fat', weightGoal: true }).kind, 'words', 'no weigh-in yet');
  assert.equal(C.bsHomeClimbState({ read: null, words: '  ', weightGoal: true }).kind, 'none');
  assert.equal(C.bsHomeClimbState().kind, 'none');
});

test('the climb\'s route runs from the foot to the flag, the same every time', () => {
  assert.deepEqual(C.bsClimbPoint(0), { x: 14, y: 136 }, 'the foot, low left');
  assert.deepEqual(C.bsClimbPoint(1), { x: 300, y: 30 }, 'the summit, high right');
  assert.deepEqual(C.bsClimbPoint(-1), C.bsClimbPoint(0), 'clamped below');
  assert.deepEqual(C.bsClimbPoint(2), C.bsClimbPoint(1), 'clamped above');
  let lastX = -1;
  for (let i = 0; i <= 20; i++) { const p = C.bsClimbPoint(i / 20); assert.ok(p.x > lastX, 'the route only moves right'); lastX = p.x; }
  assert.ok(C.bsClimbPoint(0.75).y < C.bsClimbPoint(0.25).y, 'it climbs');
  const half = C.bsClimbPath(0, 0.5).split(' ');
  assert.equal(half[0], '14,136');
  assert.equal(half[half.length - 1], `${C.bsClimbPoint(0.5).x},${C.bsClimbPoint(0.5).y}`);
  assert.equal(C.bsClimbPath(0, 1), C.bsClimbPath(0, 1), 'deterministic');
  const ridge = C.bsClimbRidge().split(' ');
  assert.equal(ridge[0], `0,${C.BS_CLIMB_H}`);
  assert.equal(ridge[ridge.length - 1], `${C.BS_CLIMB_W},${C.BS_CLIMB_H}`, 'closed along the bottom');
  assert.deepEqual(C.BS_CLIMB_MILESTONES, [25, 50, 75]);
});

test('the climb: the goal in the member\'s words, what is left in their units, the pace and the date, and the walked line', () => withPounds(() => {
  const opened = [];
  const data = { primary: 'fat_loss', overall: { title: 'Lean, and quick on the bike again', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, tour: 'hero-goal', onOpen: () => opened.push(1) }));
  const root = climbOf(d);
  assert.equal(root.props['data-bs-home-climb'], 'progress');
  assert.equal(root.props['data-tour'], 'hero-goal', 'the tour\'s goal step anchors on the climb');
  const text = d.text;
  assert.match(text, /“Lean, and quick on the bike again” · Since Aug 27/, 'the goal in the member\'s own words, since the first weigh-in');
  assert.match(text, /5\.7lb to go/, '2.6 kg left reads in pounds');
  assert.match(text, /−0\.8 lb\/wk · Dec 12, 2026/, 'the pace in pounds a week and when it lands, with the year');
  assert.match(text, /Goal 165\.3/, 'the target by the flag');
  assert.match(text, /171\.1 now/, 'where the latest weigh-in stands on the route');
  assert.match(text, /Aug 27 · 176\.4/, 'the start at the foot');
  const svg = d.nodes().find((n) => n.type === 'svg');
  assert.equal(svg.props.role, 'img');
  assert.equal(svg.props['aria-label'], 'Your goal: 48% of the way, 5.7 lb to go');
  // Height is how far there: the walked line runs to 48% of the route, the dot on it, the flag still open.
  const walked = d.nodes().find((n) => n.props && n.props['data-climb-walked'] != null);
  assert.equal(walked.props['data-climb-walked'], 48);
  assert.equal(walked.props.points, C.bsClimbPath(0, 0.48));
  assert.ok(d.nodes().some((n) => n.props && n.props['data-climb-now'] != null));
  assert.equal(d.nodes().find((n) => n.props && n.props['data-climb-flag']).props['data-climb-flag'], 'open');
  // The milestones: a quarter passed, a half and three quarters still ahead.
  const ticks = milestones(d);
  assert.equal(ticks.length, 3);
  assert.deepEqual(ticks.map((l) => l.props.stroke === THEME.ACCENT), [true, false, false]);
  // The whole climb opens the goal.
  root.props.onClick();
  assert.equal(opened.length, 1);
  assert.equal(climbLinks(d).length, 0, 'a goal on its way needs no link');
}));

test('the climb with no pace yet says when it will have one, never a dash', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: [{ d: '2026-10-19', kg: 80 }, { d: '2026-10-22', kg: 79 }] };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
  assert.equal(climbOf(d).props['data-bs-home-climb'], 'progress');
  assert.match(d.text, /Pace after a week of weigh-ins/);
  assert.doesNotMatch(d.text, /lb\/wk/);
}));

// Codex P2 on #2583: a climb with no link of its own is itself a button for the keyboard and switch devices;
// one with its own link keeps that as the way in, so no button sits inside a button.
test('the climb is keyboard-operable: a progress climb is a focusable button opened with Enter or Space', () => withPounds(() => {
  const opened = [];
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const root = climbOf(drive(D.BSHomeClimbView, GOAL_PROPS({ data, onOpen: () => opened.push(1) })));
  assert.equal(root.props['data-bs-home-climb'], 'progress');
  assert.equal(root.props.role, 'button');
  assert.equal(root.props.tabIndex, 0);
  assert.match(String(root.props['aria-label']), /Your goal: \d+% of the way/, 'named by what it shows');
  let prevented = 0;
  for (const key of ['Enter', ' ', 'Tab']) root.props.onKeyDown({ key, preventDefault: () => { prevented += 1; } });
  assert.equal(opened.length, 2, 'Enter and Space open Your goals; Tab does not');
  assert.equal(prevented, 2, 'Space does not scroll the page');
  // Words alone carries its own link: the climb is no button around it.
  const words = climbOf(drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'race', overall: {}, weighIns: [] }, onOpen: () => {} })));
  assert.equal(words.props.role, undefined, 'a button around a link');
  assert.equal(words.props.tabIndex, undefined);
}));

test('the climb says only what it can: reached, a start with no target, words alone, nothing set, or still reading', () => withPounds(() => {
  const opened = [];
  const onOpen = () => opened.push(1);
  const tap = (d) => climbLinks(d)[0].props.onClick({ stopPropagation() {} });
  // Reached: the flag planted, and the next one.
  const reached = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 78 }, weighIns: LOSING }, onOpen }));
  assert.equal(climbOf(reached).props['data-bs-home-climb'], 'reached');
  assert.match(reached.text, /Goal reached ✓/);
  assert.equal(reached.nodes().find((n) => n.props && n.props['data-climb-flag']).props['data-climb-flag'], 'planted');
  assert.ok(!reached.nodes().some((n) => n.props && n.props['data-climb-now'] != null), 'no dot short of the flag');
  assert.equal(textOf(climbLinks(reached)[0]), 'Set the next one →');
  tap(reached);
  // A weight goal with weigh-ins and no target: where they stand, and a number to aim at.
  const start = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: {}, weighIns: LOSING }, onOpen }));
  assert.equal(climbOf(start).props['data-bs-home-climb'], 'start');
  assert.match(start.text, /171\.1lb now/);
  assert.equal(textOf(climbLinks(start)[0]), 'Add a number to track it →');
  assert.ok(!start.nodes().some((n) => n.props && n.props['data-climb-walked'] != null), 'nothing walked without a target');
  // No goal yet but weigh-ins logged: it reads as a weight goal, as on the Goal page.
  assert.equal(climbOf(drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: '', overall: {}, weighIns: LOSING } }))).props['data-bs-home-climb'], 'start');
  // A goal that is not about weight: its words, no weight read.
  const race = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'race', overall: {}, weighIns: LOSING }, onOpen }));
  assert.equal(climbOf(race).props['data-bs-home-climb'], 'words');
  assert.match(race.text, /“Run a race”/);
  assert.doesNotMatch(race.text, /171\.1|lb now/, 'no weight read on a race goal');
  assert.equal(textOf(climbLinks(race)[0]), 'Add a number to track it →');
  tap(race);
  // The same goal with a pound target reads the weigh-ins again, the target as typed.
  const raceLb = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'race', overall: { unit: 'lb', target: 165 }, weighIns: LOSING } }));
  assert.equal(climbOf(raceLb).props['data-bs-home-climb'], 'progress');
  assert.match(raceLb.text, /Goal 165\.0/);
  // A weight goal before the first weigh-in: its words, and a number to track.
  const fresh = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: {}, weighIns: [] } }));
  assert.equal(climbOf(fresh).props['data-bs-home-climb'], 'words');
  assert.match(fresh.text, /“Lose fat”/);
  // Nothing set: the door sets one, the flag an empty outline.
  const none = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: '', overall: {}, weighIns: [] }, onOpen }));
  assert.equal(climbOf(none).props['data-bs-home-climb'], 'none');
  assert.match(none.text, /No goal yet/);
  assert.equal(textOf(climbLinks(none)[0]), 'Set your goal →');
  assert.equal(none.nodes().find((n) => n.type === 'polygon' && n.props.fillOpacity != null).props.fillOpacity, 0);
  tap(none);
  assert.equal(opened.length, 3, 'each link opens the goal');
  // Still reading (or a read that failed): the ridge alone, no words, no milestones, no link.
  const loading = drive(D.BSHomeClimbView, GOAL_PROPS({ data: null }));
  assert.equal(climbOf(loading).props['data-bs-home-climb'], 'loading');
  assert.equal(loading.text, '');
  assert.equal(climbLinks(loading).length, 0);
  assert.equal(milestones(loading).length, 0);
}));

test('the deck hands its own dark theme to what it holds: the radio first, then the climb and the week', () => {
  const seen = [];
  const prevCtx = globalThis.BSContext;
  globalThis.BSContext = { Provider: function Provider() {} };
  try {
    const d = drive(D.BSHomeDeck, { radio: { type: 'div', key: 'radio', props: { 'data-radio': '' } }, children: [{ type: 'div', key: 'climb', props: { 'data-climb': '' } }] });
    const provider = d.nodes()[0];
    assert.equal(provider.type, globalThis.BSContext.Provider, 'the band provides its theme');
    seen.push(provider.props.value);
    const band = d.nodes().find((n) => n.props && n.props['data-bs-home-deck'] != null);
    const kids = [].concat(band.props.children).filter(Boolean);
    assert.ok(kids[0].props['data-radio'] != null, 'Shape Radio sits first, above the climb (owner, 2026-11-03)');
    assert.equal(band.props.style.background, seen[0].PAPER, 'the band is the deck theme\'s paper');
  } finally { globalThis.BSContext = prevCtx; }
});

// ── This week ────────────────────────────────────────────────────────────────

const GRID = {
  week: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'],
  today: 3,
  sessions: ['hit', 'rest', 'miss', 'ahead', 'ahead', 'ahead', 'ahead'],
  food: ['hit', 'hit', 'miss', 'hit', 'ahead', 'ahead', 'ahead'],
  protein: ['hit', 'miss', 'hit', 'ahead', 'ahead', 'ahead', 'ahead'],
  steps: ['miss', 'hit', 'miss', 'ahead', 'ahead', 'ahead', 'ahead'],
  mornings: ['hit', 'miss', 'hit', 'ahead', 'ahead', 'ahead', 'ahead'],
};
const days = (d) => d.nodes().filter((n) => n.type === 'button' && n.props['data-bs-home-day'] != null);
const barsOf = (day) => day.props.children.flat(3).filter(Boolean).flatMap((c) => (c && c.props && Array.isArray(c.props.children) ? c.props.children : [])).filter(fn('BSHdBar'));

test('This week: a day a button with five bars, Train · Food · Protein · Steps · Check-in, each day opening the calendar on it', () => {
  const opened = [];
  let months = 0;
  const d = drive(D.BSHomeWeekBarsView, { w: { grid: GRID }, checkinsOn: true, onDay: (day) => opened.push(day), onMonth: () => { months += 1; } });
  const list = days(d);
  assert.deepEqual(list.map((b) => b.props['data-bs-home-day']), GRID.week, 'Monday to Sunday');
  // Each day's bars are Week so far's rows, in the key's order.
  list.forEach((b, i) => {
    assert.deepEqual(barsOf(b).map((x) => x.props.state), [GRID.sessions[i], GRID.food[i], GRID.protein[i], GRID.steps[i], GRID.mornings[i]], GRID.week[i]);
  });
  // A screen reader hears the day and each bar's word (the bars and the key are hidden from it).
  assert.equal(list[0].props['aria-label'], 'Monday, October 19: Train hit, Food hit, Protein hit, Steps missed, Check-in hit');
  assert.equal(list[1].props['aria-label'], 'Tuesday, October 20: Train rest day, Food hit, Protein missed, Steps hit, Check-in missed');
  // Today is the ink day, its bars in paper.
  assert.equal(list[3].props['aria-current'], 'date');
  assert.ok(list.filter((b, i) => i !== 3).every((b) => b.props['aria-current'] == null));
  assert.ok(barsOf(list[3]).every((x) => x.props.on === true));
  assert.equal(list[3].props.style.background, THEME.INK);
  assert.ok(list.every((b) => b.props.style.minHeight >= 44), 'a day is a 44 px target');
  // A day opens the calendar on that day; Month → opens the month.
  list[1].props.onClick();
  assert.equal(opened.length, 1);
  assert.ok(opened[0] instanceof Date);
  assert.equal(opened[0].toDateString(), new Date(2026, 9, 20).toDateString());
  d.nodes().find((n) => n.type === 'button' && textOf(n) === 'Month →').props.onClick();
  assert.equal(months, 1);
  // The head: This week., the ISO week and its span; the key under the days.
  assert.match(d.text, /This week\./);
  assert.match(d.text, /Wk 43 · Oct 19–25/);
  assert.match(d.text, /Each day/);
  assert.match(d.text, /Train · Food · Protein · Steps · Check-in/);
});

test('This week with Check-ins off draws four bars, and an unread week marks no day missed', () => {
  const off = drive(D.BSHomeWeekBarsView, { w: { grid: GRID }, checkinsOn: false });
  assert.ok(days(off).every((b) => barsOf(b).length === 4), 'Check-ins off: no check-in bar');
  assert.doesNotMatch(off.text, /Check-in/);
  assert.doesNotMatch(days(off)[0].props['aria-label'], /Check-in/);
  // Nothing read yet: seven blank days that open nothing, no week line, no Month without a door.
  const opened = [];
  const blank = drive(D.BSHomeWeekBarsView, { w: { grid: null }, onDay: (day) => opened.push(day) });
  const list = days(blank);
  assert.equal(list.length, 7);
  assert.ok(list.every((b) => b.props['data-bs-home-day'] === ''));
  assert.ok(list.every((b) => barsOf(b).every((x) => x.props.state == null)), 'an unread week marks no bar missed');
  list[0].props.onClick();
  assert.equal(opened.length, 0, 'a blank day opens nothing');
  assert.doesNotMatch(blank.text, /Wk /);
  assert.ok(!blank.nodes().some((n) => n.type === 'button' && textOf(n) === 'Month →'));
});

// The signed-out preview's sample is one week, and its counts are its own squares' hits so far.
test('the preview\'s sample week: the counts beside the squares are its own hits so far', () => {
  signOut();
  const d = drive(D.BSHomeWeekBars, { checkinsOn: true });
  const view = d.nodes()[0];
  assert.equal(view.type.name, 'BSHomeWeekBarsView');
  const w = view.props.w;
  assert.ok(w.grid, 'the sample draws no bars');
  const hits = (k) => w.grid[k].filter((x) => x === 'hit').length;
  assert.equal(w.sessions.done, hits('sessions'));
  assert.equal(w.daysLogged, hits('food'));
  assert.equal(w.mornings, hits('mornings'));
  assert.equal(w.sessions.planned, 4);
  assert.ok(w.grid.sessions.every((x, i) => x !== 'miss' || [0, 2, 3, 5].includes(i)), 'a sample session is missed only on a planned day');
});

// ── Team ─────────────────────────────────────────────────────────────────────

const JORDAN = { role: 'trainer', name: 'Jordan Chen', conversationId: 'c-j', providerId: 7, photo: 'https://cdn.example/jordan.jpg' };
const MAYA = { role: 'nutritionist', name: 'Maya Patel', conversationId: 'c-m', providerId: 3, photo: null };
const TEAM = (over = {}) => ({
  coaches: [JORDAN, MAYA],
  notes: [{ role: 'nutritionist', text: 'Five plates. Three logged before noon.', who: 'Maya Patel' }],
  workout: { title: 'Lower Push — Peak', meta: '54 min · 6 moves', time: '9:00 AM', onStart: () => {}, coachId: 7 },
  meal: { slot: 'Lunch', time: '12:40', title: 'bowl + rice', onLog: () => {} },
  fuel: { left: 532, pct: 75 },
  unread: { 'dm:c-m': 2 },
  next: null,
  dayLabel: 'Fri 11',
  ...over,
});
const coachBlock = (d, who) => d.nodes().find((n) => n.props && n.props['data-team-coach'] === who);
const messages = (d) => d.nodes().filter((n) => n.type === 'button' && n.props['data-team-message']);

test('Team: each coach once, the trainer with today\'s call and the nutritionist with their note, the food left and the next meal', () => {
  const started = [], logged = [];
  const props = TEAM({ workout: { ...TEAM().workout, onStart: () => started.push(1) }, meal: { ...TEAM().meal, onLog: () => logged.push(1) } });
  const d = drive(T.BSHomeTeamView, { ...props, tour: 'hero-home' });
  const root = d.nodes()[0];
  assert.equal(root.props['data-tour'], 'hero-home', 'the tour\'s home step anchors on Team');
  assert.match(d.text, /^Team\./, 'In your corner, renamed (owner, 2026-11-03)');
  assert.match(d.text, /Fri 11 · 2 coaches/);
  // The trainer: today's call, the only place it shows.
  const trainer = coachBlock(d, 'trainer');
  const tt = textOf(trainer);
  assert.match(tt, /Jordan Chen/);
  assert.match(tt, /Trainer · Today’s call/);
  assert.match(tt, /9:00 AM/);
  assert.match(tt, /Lower Push — Peak/);
  assert.match(tt, /54 min · 6 moves/);
  d.nodes().find((n) => n.type === 'button' && n.props['data-team-start'] != null).props.onClick();
  assert.equal(started.length, 1, 'I\'ll train today starts the session');
  // The nutritionist: their note, the food left, the next meal, and Log it.
  const nutri = coachBlock(d, 'nutritionist');
  const nt = textOf(nutri);
  assert.match(nt, /Nutritionist · This week’s note/);
  assert.match(nt, /“Five plates\. Three logged before noon\.”/);
  assert.match(nt, /532kcal left/);
  assert.match(nt, /Lunch 12:40 · bowl \+ rice/);
  const log = d.nodes().find((n) => n.type === 'button' && n.props['data-team-log'] != null);
  assert.equal(textOf(log), 'Log Lunch →');
  log.props.onClick();
  assert.equal(logged.length, 1);
  // Each coach is offered once, with what is unread on their Message.
  assert.deepEqual(messages(d).map((b) => [b.props['data-team-message'], textOf(b), b.props['aria-label']]), [
    ['trainer', 'Message', 'Message Jordan Chen'],
    ['nutritionist', 'Message · 2 new', 'Message Maya Patel'],
  ]);
  assert.ok(messages(d).every((b) => b.props.style.minHeight === 44));
  assert.doesNotMatch(d.text, /Find a coach/, 'a member with coaches is not sent to find one');
});

test('Team\'s faces: the coach\'s photo in their role\'s ring, else their initials, and initials when the photo fails', () => {
  const d = drive(T.BSHomeTeamView, TEAM());
  const faces = d.nodes().filter(fn('BSHtFace'));
  assert.deepEqual(faces.map((f) => f.props.photo), [JORDAN.photo, null], 'a face a coach: Jordan with a photo, Maya without');
  const withPhoto = drive(faces[0].type, faces[0].props);
  const img = withPhoto.nodes()[0];
  assert.equal(img.type, 'img');
  assert.equal(img.props['data-team-face'], 'photo');
  assert.equal(img.props.src, JORDAN.photo);
  assert.equal(img.props.alt, '', 'the name beside it says who it is');
  assert.match(img.props.style.border, /^2px solid #c0533b$/, 'a trainer\'s ring is rust');
  // A photo that fails to load falls back to the initials.
  img.props.onError();
  withPhoto.render();
  assert.equal(withPhoto.nodes()[0].props['data-team-face'], 'initials');
  assert.equal(withPhoto.text, 'JC');
  const without = drive(faces[1].type, faces[1].props);
  assert.equal(without.nodes()[0].props['data-team-face'], 'initials');
  assert.equal(without.text, 'MP');
});

test('Team\'s Message opens that coach\'s thread; a coach with no thread yet opens the coaches, never another coach\'s (Codex P2 on #2424)', () => {
  const ev = listen('shape:openConversation');
  try {
    let coachesOpened = 0;
    const d = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, { ...MAYA, conversationId: null }], onCoaches: () => { coachesOpened += 1; } }));
    const [j, m] = messages(d);
    j.props.onClick();
    assert.deepEqual(ev.got, [{ conversationId: 'c-j', name: 'Jordan Chen' }]);
    m.props.onClick();
    assert.equal(coachesOpened, 1, 'no thread: the coaches\' threads');
    assert.equal(ev.got.length, 1, 'no event with no thread to open');
  } finally { ev.off(); }
});

test('a paid coach whose name could not be read is offered by role, and a second coach of a role is a row of their own (Codex P2 on #2424)', () => {
  const ev = listen('shape:openConversation');
  try {
    const d = drive(T.BSHomeTeamView, TEAM({ notes: [], coaches: [
      { role: 'trainer', name: null, conversationId: 'c-x', providerId: 9 },
      { role: 'nutritionist', name: null, conversationId: null, providerId: 3 },
      { role: 'trainer', name: null, conversationId: 'c-y', providerId: 10 },
    ], onCoaches: () => {}, workout: { ...TEAM().workout, coachId: 9 } }));
    assert.deepEqual(messages(d).map((b) => b.props['aria-label']), ['Message your trainer', 'Message your nutritionist', 'Message your trainer']);
    assert.match(textOf(coachBlock(d, 'trainer')), /^TrainerTrainer · Today’s call/, 'the role stands for the name');
    assert.deepEqual(d.nodes().filter(fn('BSHtFace')).map((f) => f.props.initials), ['T', 'N', 'T'], 'and for the face\'s initials');
    const extra = d.nodes().filter((n) => n.props && n.props['data-team-coach'] === 'extra');
    assert.equal(extra.length, 1, 'the second trainer is a row of their own');
    messages(d)[0].props.onClick();
    messages(d)[2].props.onClick();
    assert.deepEqual(ev.got, [{ conversationId: 'c-x', name: undefined }, { conversationId: 'c-y', name: undefined }],
      'each nameless trainer opens their own thread, with no name to show');
  } finally { ev.off(); }
});

// Every coach's weekly note stays on Home (the old From your coaches showed both roles'): each on its
// own coach's card, the trainer's over today's session, and a second coach of a role never shows the
// first's. An unsigned note, or one signed with a name no coach here carries, is the first's.
test("each coach's weekly note is on their own card: the trainer's over the session, a second coach's on their row", () => {
  const SAM = { role: 'trainer', name: 'Sam Strong', conversationId: 'c-s', providerId: 8, photo: null };
  const notes = [
    { role: 'trainer', text: 'Sam here: hips first this week.', who: 'Sam Strong' },
    { role: 'trainer', text: 'Jordan: three sets, then stop.', who: 'Jordan Chen' },
    { role: 'nutritionist', text: 'Five plates.', who: 'Maya Patel' },
  ];
  const d = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, SAM], notes }));
  const noteIn = (block) => (block ? d.nodes().filter((n) => n.props && n.props['data-team-note'] != null && block.props && textOf(block).includes(textOf(n))).map(textOf) : []);
  assert.deepEqual(noteIn(coachBlock(d, 'trainer')), ['“Jordan: three sets, then stop.”'], "the trainer's own note, over the session");
  assert.deepEqual(noteIn(coachBlock(d, 'nutritionist')), ['“Five plates.”']);
  assert.deepEqual(noteIn(coachBlock(d, 'extra')), ['“Sam here: hips first this week.”'], "the second trainer's note on their own row");
  // The trainer's note sits above the session in its card.
  const session = d.nodes().find((n) => n.props && n.props['data-team-card'] === 'session');
  assert.ok(textOf(session).indexOf('Jordan: three sets') < textOf(session).indexOf("I'll train today"), 'the note is under the session');
  // A second coach with no note of their own shows none: never the first's.
  const quiet = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, SAM], notes: [notes[1]] }));
  assert.equal(quiet.nodes().filter((n) => n.props && n.props['data-team-note'] != null).length, 1, "the first trainer's note showed twice");
  assert.doesNotMatch(textOf(quiet.nodes().find((n) => n.props && n.props['data-team-coach'] === 'extra')), /three sets/);
  // An unsigned note is the first trainer's; one signed by Sam is never Jordan's.
  const unsigned = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, SAM], notes: [{ role: 'trainer', text: 'Unsigned.', who: null }] }));
  assert.match(textOf(unsigned.nodes().find((n) => n.props && n.props['data-team-coach'] === 'trainer')), /Unsigned\./);
  const samOnly = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, SAM], notes: [notes[0]] }));
  assert.doesNotMatch(textOf(samOnly.nodes().find((n) => n.props && n.props['data-team-coach'] === 'trainer')), /hips first/, "Sam's note went to Jordan's card");
});

// A member may pay two trainers: today's session is the card of the one who wrote it, with their Message
// (Codex P2 on #2583); a session no paid trainer wrote is Today's workout, on no coach's card.
test("today's session goes on the card of the trainer who wrote it, and the member's own on no coach's", () => {
  const SAM = { role: 'trainer', name: 'Sam Strong', conversationId: 'c-s', providerId: 8, photo: null };
  const ev = listen('shape:openConversation');
  try {
    const d = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, SAM, MAYA], workout: { ...TEAM().workout, coachId: 8 } }));
    const card = coachBlock(d, 'trainer');
    assert.match(textOf(card), /^Sam Strong/, "Sam wrote it, so Sam's card carries it, though Jordan is the earlier");
    assert.match(textOf(card), /Today’s call[\s\S]*Lower Push — Peak/);
    assert.match(textOf(coachBlock(d, 'extra')), /^Jordan Chen/, 'Jordan is the second trainer\'s row');
    assert.doesNotMatch(textOf(coachBlock(d, 'extra')), /Lower Push/);
    const msg = d.nodes().find((n) => n.type === 'button' && n.props['data-team-message'] && card && textOf(card).includes(textOf(n)) && n.props['aria-label'] === 'Message Sam Strong');
    assert.ok(msg, "the session's Message is Sam's");
    msg.props.onClick();
    assert.deepEqual(ev.got, [{ conversationId: 'c-s', name: 'Sam Strong' }]);
  } finally { ev.off(); }
  // The member's own workout (no coach), or a trainer no longer paid: Today's workout, on no card.
  for (const coachId of [null, 99]) {
    const own = drive(T.BSHomeTeamView, TEAM({ workout: { ...TEAM().workout, coachId } }));
    assert.doesNotMatch(textOf(coachBlock(own, 'trainer')), /Lower Push|Today’s call/, `a session by ${coachId} is filed under Jordan`);
    assert.match(textOf(coachBlock(own, 'none-session')), /^Today’s workout.*Lower Push — Peak/);
  }
});

// Codex P2 on #2583: a note keeps its coach's listing id, and Team files it by that id first, so two coaches
// who share a name, or a name lookup that failed, never put one coach's advice under the other.
test("a coach's note is filed by their listing id: same-named coaches each get their own, and a missing name never moves it", () => {
  const A = { role: 'trainer', name: 'Alex Kim', conversationId: 'c-a', providerId: 7, photo: null };
  const B = { role: 'trainer', name: 'Alex Kim', conversationId: 'c-b', providerId: 8, photo: null };
  const notes = [
    { role: 'trainer', text: 'Note from 8.', who: 'Alex Kim', providerId: 8 },
    { role: 'trainer', text: 'Note from 7.', who: 'Alex Kim', providerId: 7 },
  ];
  const d = drive(T.BSHomeTeamView, TEAM({ coaches: [A, B, MAYA], notes, workout: { ...TEAM().workout, coachId: 7 } }));
  assert.match(textOf(coachBlock(d, 'trainer')), /Note from 7\./, 'the first Alex shows the other\'s note');
  assert.doesNotMatch(textOf(coachBlock(d, 'trainer')), /Note from 8\./);
  assert.match(textOf(coachBlock(d, 'extra')), /Note from 8\./, 'the second Alex lost their own note');
  assert.doesNotMatch(textOf(coachBlock(d, 'extra')), /Note from 7\./);
  // The name lookup failed (no who): the id still files it.
  const nameless = drive(T.BSHomeTeamView, TEAM({ coaches: [A, B], notes: [{ role: 'trainer', text: 'Only 8 wrote.', who: null, providerId: 8 }], workout: { ...TEAM().workout, coachId: 7 } }));
  assert.doesNotMatch(textOf(coachBlock(nameless, 'trainer')), /Only 8 wrote/, 'an unnamed note fell to the first trainer');
  assert.match(textOf(coachBlock(nameless, 'extra')), /Only 8 wrote/);
});

test('Team\'s next session opens the calendar on its day', () => {
  const opened = [];
  const next = { at: Date.parse('2026-10-24T13:00:00Z'), providerName: 'Jordan Chen', providerRole: 'trainer' };
  const d = drive(T.BSHomeTeamView, TEAM({ next, onCalendar: (day) => opened.push(day) }));
  const row = d.nodes().find((n) => n.type === 'button' && n.props['data-team-next'] != null);
  assert.match(textOf(row), /^Next session.*· Jordan Chen$/);
  row.props.onClick();
  assert.equal(opened.length, 1);
  assert.equal(opened[0].getTime(), next.at, 'the calendar opens on the session\'s day');
  // Not named: the role.
  const nameless = drive(T.BSHomeTeamView, TEAM({ next: { ...next, providerName: null } }));
  assert.match(textOf(nameless.nodes().find((n) => n.props && n.props['data-team-next'] != null)), /· Trainer$/);
});

test('with no coach, Team is Today: the session and the food left without a face, and Find a coach only when Home asks', () => {
  let found = 0;
  const d = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], unread: {}, showFindCoach: true, onFindCoach: () => { found += 1; } }));
  assert.match(d.text, /^Today\./);
  assert.match(d.text, /Fri 11/);
  assert.doesNotMatch(d.text, /coach(es)? ·|\d coach/, 'no coach count');
  assert.match(textOf(coachBlock(d, 'none-session')), /Today’s workout9:00 AMLower Push — Peak/);
  assert.match(textOf(coachBlock(d, 'none-fuel')), /Fuel left today532kcal left/);
  assert.equal(messages(d).length, 0, 'no coach, no Message');
  assert.equal(d.nodes().filter(fn('BSHtFace')).length, 0, 'no face without a coach');
  const find = d.nodes().find((n) => n.type === 'button' && n.props['data-team-find'] != null);
  assert.match(textOf(find), /^Find a coachTrainers and nutritionists/);
  find.props.onClick();
  assert.equal(found, 1);
  // Find a coach waits for Home to know there is none (bsHomeCoachesKnown).
  const waiting = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], showFindCoach: false }));
  assert.ok(!waiting.nodes().some((n) => n.props && n.props['data-team-find'] != null));
  // Nothing to say at all: nothing drawn.
  assert.equal(drive(T.BSHomeTeamView, { coaches: [], notes: [] }).nodes().length, 0);
  // A trainer with no session today still offers Message.
  const rest = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN], workout: null }));
  assert.match(textOf(coachBlock(rest, 'trainer')), /No session today/);
  assert.equal(messages(rest).length, 1);
});

// ── Daily habits, in the morning panel ───────────────────────────────────────

const HABITS = [
  { id: 'h1', name: 'Drink 3 glasses of water', type: 'do', history: ['2026-10-22'] },
  { id: 'h2', name: 'Take vitamins', type: 'do', history: ['2026-10-21'] },
  { id: 'h3', name: 'smoking', type: 'avoid', history: ['2026-10-22'] },
  { id: 'h4', name: 'Read 10 pages', type: 'do', history: [] },
  { id: 'h5', name: 'Stretch', type: 'do', history: [] },
];
const ticks = (d) => d.nodes().filter((n) => n.type === 'button' && n.props['data-habit-tick']);

test('Daily habits: how many are done today, the first three as ticks with the habit\'s short word, and the rest on the page', () => {
  signIn();
  try {
    const toggled = [];
    let opened = 0;
    const d = drive(S.BSHomeHabitsRowView, { habits: HABITS, ready: true, todayIso: '2026-10-22', tour: 'hero-habits', onToggle: (id) => toggled.push(id), onOpen: () => { opened += 1; } });
    assert.equal(d.nodes()[0].props['data-tour'], 'hero-habits');
    assert.match(d.text, /^Daily habits2 of 5 done/);
    const list = ticks(d);
    assert.deepEqual(list.map((b) => [b.props['data-habit-tick'], b.props['aria-pressed'], b.props['aria-label'], textOf(b)]), [
      ['done', true, 'Drink 3 glasses of water', '✓water'],
      ['open', false, 'Take vitamins', '✓vitamins'],
      ['done', true, 'smoking', '✓No smoking'],
    ], 'a tick a habit, labelled with its last word; a habit to avoid reads "No …"');
    assert.ok(list.every((b) => b.props.style.minHeight === 44), 'a tick is a 44 px target');
    list[1].props.onClick();
    assert.deepEqual(toggled, ['h2'], 'a tick here is the page\'s tick');
    const more = d.nodes().find((n) => n.type === 'button' && textOf(n) === '+2');
    assert.equal(more.props['aria-label'], '2 more habits');
    more.props.onClick();
    d.nodes().find((n) => n.type === 'button' && /^Daily habits/.test(textOf(n))).props.onClick();
    assert.equal(opened, 2, '+2 and the title open the Habits page');
    // Three or fewer: no "+".
    const three = drive(S.BSHomeHabitsRowView, { habits: HABITS.slice(0, 3), todayIso: '2026-10-22' });
    assert.ok(!three.nodes().some((n) => n.type === 'button' && /^\+\d/.test(textOf(n))));
    // Still reading: a dash, no ticks. None yet: add the first.
    const reading = drive(S.BSHomeHabitsRowView, { habits: [], ready: false, todayIso: '2026-10-22' });
    assert.match(reading.text, /Daily habits—/);
    assert.equal(ticks(reading).length, 0);
    const empty = drive(S.BSHomeHabitsRowView, { habits: [], ready: true, todayIso: '2026-10-22' });
    assert.match(empty.text, /Daily habitsAdd your first/);
    assert.equal(ticks(empty).length, 0);
  } finally { signOut(); }
});

test('signed out, Daily habits shows the sample\'s habits as today\'s ticks', () => {
  signOut();
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetHabits.jsx'), 'utf8');
  const at = src.indexOf('const _BS_HABIT_DEMO_ROWS = [');
  const rows = new Function(`return ${src.slice(src.indexOf('[', at), src.indexOf('];', at) + 1)};`)();
  const prev = globalThis._BS_HABIT_DEMO_ROWS;
  globalThis._BS_HABIT_DEMO_ROWS = rows;
  try {
    // A Thursday: each sample habit is done today by its pattern's fourth day.
    const d = drive(S.BSHomeHabitsRowView, { habits: [], ready: true, todayIso: '2026-10-22' });
    const done = rows.filter((h) => h.pattern[3] === 1).length;
    assert.match(d.text, new RegExp(`^Daily habits${done} of ${rows.length} done`));
    const list = ticks(d);
    assert.deepEqual(list.map((b) => b.props['aria-label']), rows.slice(0, 3).map((h) => h.name));
    assert.deepEqual(list.map((b) => b.props['data-habit-tick']), rows.slice(0, 3).map((h) => (h.pattern[3] === 1 ? 'done' : 'open')));
    assert.equal(textOf(list[1]), '✓steps', 'a number is not a word: "10,000 steps" reads steps');
  } finally { globalThis._BS_HABIT_DEMO_ROWS = prev; }
});
