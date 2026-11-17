// tests/home-deck-team.test.mjs
//
// THE MEMBER HOME, its sections drawn from known data through the shipping views. The owner chose them on
// 2026-11-03 (the Home preview: "ok looks good") and approved their new look and order on 2026-11-17 ("ok
// make new home screens live", "build those. Please make it look like the preview", then "just make sure
// look and design is same as preview"):
//   · This week (BSHomeDeck.jsx's BSHomeWeekBarsView), on its own plate under Shape Radio: five bars a day,
//     Train · Food · Protein · Steps · Check-in;
//   · the goal plate (BSHomeClimbView, services/homeClimb.mjs's state and route): goal progress only ("the
//     chart should just be goal progress"), in the member's units, every figure kept ("keep this");
//   · Today's plan (BSHomeTeam.jsx): one plate, a row a half, with everything Team's coach cards offered;
//   · Daily habits in the morning panel (BSHomeSections.jsx's BSHomeHabitsRowView).
// The reads behind them are tests/home-sections.test.mjs's; who the member has hired, and what Home says of
// it (the title, the trails, the coaches, the invitation), is tests/home-care.test.mjs's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { drive, textOf, flatten, SHIM, ROOT, THEME } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { IntlMessageFormat } from 'intl-messageformat';
import * as C from '../mobile-app/src/services/homeClimb.mjs';
import * as W from '../mobile-app/src/services/homeWeek.mjs';
import * as HC from '../mobile-app/src/services/homeCare.mjs';

// The app's translator with no catalog: each string is its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };

const REG = { registry: new Map([['react', { ...SHIM, useContext: (c) => c._currentValue }], ['react-dom', { createPortal: (n) => n }]]) };
const S = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeSections.jsx'), REG);
const D = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeDeck.jsx'), REG);
const T = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeTeam.jsx'), REG);
const CARE = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeCare.jsx'), REG);

// The two coaches the fixtures hire: a trainer with a photo, a nutritionist without.
const JORDAN = { role: 'trainer', name: 'Jordan Chen', conversationId: 'c-j', providerId: 7, photo: 'https://cdn.example/jordan.jpg' };
const MAYA = { role: 'nutritionist', name: 'Maya Patel', conversationId: 'c-m', providerId: 3, photo: null };

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

// ── The goal plate ───────────────────────────────────────────────────────────

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
// The plate is the section; the climb inside it is the door to Your goals.
const plateOf = (d) => d.nodes()[0];
const climbOf = (d) => d.nodes().find((n) => n.props && n.props['data-bs-home-climb'] != null);
const labelOf = (d) => d.nodes().find(fn('BSHomePlateLabel'));
const climbLinks = (d) => d.nodes().filter((n) => n.type === 'button');
// What the approved Home's chart no longer draws (owner, 2026-11-17): the 2026-11-04 hill's sun, shade and
// crest, the glow and the breathing dot, the ticks on the route and the weights under them.
const GONE = ['data-climb-sun', 'data-climb-shade', 'data-climb-crest', 'data-climb-glow', 'data-climb-breath', 'data-climb-milestone', 'data-climb-ms-weight', 'data-climb-ridge'];

test('the climb\'s state: progress, reached, a start with no target, words alone, or nothing', () => {
  const read = { nowKg: 77.6, targetKg: 75, pct: 48, reached: false, paceKgWk: -0.36 };
  assert.deepEqual(C.bsHomeClimbState({ read, words: 'Lean', weightGoal: true }), { kind: 'progress', pct: 48, early: false });
  assert.deepEqual(C.bsHomeClimbState({ read: { ...read, paceKgWk: null }, weightGoal: true }), { kind: 'progress', pct: 48, early: true }, 'no pace yet: early');
  assert.equal(C.bsHomeClimbState({ read: { ...read, pct: 140 }, weightGoal: true }).pct, 100, 'never past the flag');
  assert.equal(C.bsHomeClimbState({ read: { ...read, pct: null }, weightGoal: true }).pct, 0, 'a share it cannot work out is none of the way');
  assert.deepEqual(C.bsHomeClimbState({ read: { ...read, reached: true }, weightGoal: true }), { kind: 'reached', pct: 100, early: false });
  assert.equal(C.bsHomeClimbState({ read: { nowKg: 77.6, targetKg: null, paceKgWk: -0.2 }, weightGoal: true }).kind, 'start', 'weigh-ins, no target');
  assert.equal(C.bsHomeClimbState({ read, words: 'Run a race', weightGoal: false }).kind, 'words', 'not a weight goal: its words');
  // A target and no weigh-in yet (Codex P2 on #2583): the target, with or without words, never "No goal yet".
  assert.deepEqual(C.bsHomeClimbState({ read: { nowKg: null, targetKg: 75 }, words: 'Lose fat', weightGoal: true }), { kind: 'target', pct: 0, early: true });
  assert.equal(C.bsHomeClimbState({ read: { nowKg: null, targetKg: 75 }, weightGoal: true }).kind, 'target');
  assert.equal(C.bsHomeClimbState({ read: { nowKg: null, targetKg: null }, words: 'Lose fat', weightGoal: true }).kind, 'words', 'words and no number: its words');
  assert.equal(C.bsHomeClimbState({ read: null, words: '  ', weightGoal: true }).kind, 'none');
  assert.equal(C.bsHomeClimbState().kind, 'none');
});

// Owner, 2026-11-17: "make it look like the preview". The route is the approved Home's: one smooth climb
// from the start, a little in from the left so the coaches' trails can lead into it, to the flag.
test('the climb\'s route runs from the start to the flag, the same every time, and the coaches\' trails end where it starts', () => {
  assert.deepEqual(C.bsClimbPoint(0), { x: 58, y: 112 }, 'the start, low and in from the left');
  assert.deepEqual(C.bsClimbPoint(1), { x: 318, y: 22 }, 'the goal, high right');
  assert.deepEqual(C.bsClimbPoint(0.5), { x: 190, y: 66 }, 'the two curves meet at the middle');
  assert.deepEqual(C.bsClimbPoint(-1), C.bsClimbPoint(0), 'clamped below');
  assert.deepEqual(C.bsClimbPoint(2), C.bsClimbPoint(1), 'clamped above');
  let last = { x: -1, y: 1000 };
  for (let i = 0; i <= 20; i++) {
    const p = C.bsClimbPoint(i / 20);
    assert.ok(p.x > last.x, 'the route only moves right');
    assert.ok(p.y < last.y, 'and only climbs');
    last = p;
  }
  assert.ok(last.x <= C.BS_CLIMB_W && C.bsClimbPoint(1).y - 18 >= 0, 'the flag stands inside the box');
  const half = C.bsClimbPath(0, 0.5).split(' ');
  assert.equal(half[0], '58,112');
  assert.equal(half[half.length - 1], `${C.bsClimbPoint(0.5).x},${C.bsClimbPoint(0.5).y}`);
  assert.equal(C.bsClimbPath(0, 1), C.bsClimbPath(0, 1), 'deterministic');
  // The ground under the route: the route itself, closed along the bottom of the box.
  const area = C.bsClimbArea().split(' ');
  assert.equal(area[0], `58,${C.BS_CLIMB_H}`);
  assert.equal(area[1], '58,112');
  assert.equal(area[area.length - 2], '318,22');
  assert.equal(area[area.length - 1], `318,${C.BS_CLIMB_H}`, 'closed along the bottom');
  assert.deepEqual(C.BS_CLIMB_MILESTONES, [25, 50, 75]);
  // Each trail ends on the route's first point, so it joins the climb and never floats beside it.
  for (const [role, path] of Object.entries(HC.BS_CARE_TRAIL)) assert.match(path, / 58,112$/, `${role}'s trail misses the start`);
});

// Owner, 2026-11-17: "keep this", of the goal's figures. What is left, the chart with the start, the weight
// now and the goal on it, and the walked line.
test('the goal plate: its title, the goal in the member\'s words as its tag, what is left in their units, the goal by the flag, and the walked line', () => withPounds(() => {
  const opened = [];
  const data = { primary: 'fat_loss', overall: { title: 'Lean, and quick on the bike again', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, tour: 'hero-goal', onOpen: () => opened.push(1) }));
  assert.equal(plateOf(d).type, 'section');
  assert.equal(plateOf(d).props['data-bs-home-goal'], 'none', 'no coach: the plate says so');
  assert.equal(plateOf(d).props['aria-label'], 'Your goal');
  const root = climbOf(d);
  assert.equal(root.props['data-bs-home-climb'], 'progress');
  assert.equal(root.props['data-tour'], 'hero-goal', 'the tour\'s goal step anchors on the climb');
  // The label: the title, a dot in the goal's gold, and the goal in the member's own words as the pill tag.
  const label = labelOf(d);
  assert.equal(textOf(label), 'Your goal');
  assert.equal(label.props.note, 'Lean, and quick on the bike again', 'the goal in the member\'s own words');
  assert.equal(label.props.dot, C.bsClimbGold(THEME));
  const text = d.text;
  assert.match(text, /5\.7lb to go/, '2.6 kg left reads in pounds');
  assert.equal(textOf(d.nodes().find((n) => n.props && n.props['data-climb-goal'] != null)), 'GOAL 165.3', 'the goal alone by the flag');
  assert.doesNotMatch(text, /Since|Aug 27/, 'not the date it started');
  assert.equal(text.split('48%').length - 1, 1, 'the share walked shows once, in the strip');
  const svg = d.nodes().find((n) => n.type === 'svg');
  assert.equal(svg.props.role, 'img');
  assert.equal(svg.props['aria-label'], 'Your goal: 48% of the way, 5.7 lb to go');
  // Height is how far there: the walked line runs to 48% of the route, the dot on it, the flag still open.
  const walked = d.nodes().find((n) => n.props && n.props['data-climb-walked'] != null);
  assert.equal(walked.props['data-climb-walked'], 48);
  assert.equal(walked.props.points, C.bsClimbPath(0, 0.48));
  const now = d.nodes().find((n) => n.props && n.props['data-climb-now'] != null);
  assert.deepEqual([now.props.cx, now.props.cy], [C.bsClimbPoint(0.48).x, C.bsClimbPoint(0.48).y], 'the dot stands where the member is');
  assert.equal(d.nodes().find((n) => n.props && n.props['data-climb-flag']).props['data-climb-flag'], 'open');
  // The whole climb opens the goal.
  root.props.onClick();
  assert.equal(opened.length, 1);
  assert.equal(climbLinks(d).length, 0, 'a goal on its way needs no link');
}));

// Owner, 2026-11-17: "remove the rainbow font color on home page, keep it neutral".
test('the big figure on Home is plain ink: no gradient text', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  for (const coaches of [[], [JORDAN], [JORDAN, MAYA]]) {
    const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, coaches }));
    const fig = d.nodes().find((n) => n.props && n.props['data-climb-figure'] != null);
    assert.equal(textOf(fig), '5.7');
    assert.equal(fig.props.style.color, THEME.INK, 'the figure is the paper\'s ink');
    for (const k of ['backgroundImage', 'backgroundClip', 'WebkitBackgroundClip', 'WebkitTextFillColor']) assert.equal(fig.props.style[k], undefined, `${k}: gradient text on Home`);
    assert.equal(fig.props.style.fontSize, 60);
    assert.equal(fig.props.style.fontWeight, 800);
  }
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSHomeDeck.jsx'), 'utf8');
  assert.doesNotMatch(src, /bsMpGradText|WebkitTextFillColor|backgroundClip/, 'the profile\'s lit figure is not Home\'s');
}));

test('the climb early on: what is left and the goal, no pace and no placeholder for one', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: [{ d: '2026-10-19', kg: 80 }, { d: '2026-10-22', kg: 79 }] };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
  assert.equal(climbOf(d).props['data-bs-home-climb'], 'progress');
  assert.match(d.text, /lb to go/);
  assert.doesNotMatch(d.text, /Pace after a week of weigh-ins|lb\/wk/);
  assert.ok(!d.nodes().some((n) => n.props && n.props['data-climb-pace'] != null), 'no pace line');
}));

// Owner, 2026-11-04: "add a little more info here, either milestones, and percentage progress".
test('the climb\'s milestones are the goal page\'s: a quarter, a half, three quarters and the target, met from the latest weigh-in', () => {
  const cut = C.bsClimbMilestones({ startKg: 80, targetKg: 75, nowKg: 77.6 });
  assert.deepEqual(cut.stops.map((s) => s.m), [25, 50, 75, 100]);
  assert.deepEqual(cut.stops.map((s) => s.kg), [78.75, 77.5, 76.25, 75], 'start + (target − start) × share, as BSGoals.jsx');
  assert.deepEqual(cut.stops.map((s) => s.done), [true, false, false, false]);
  assert.equal(cut.next.m, 50);
  assert.equal(cut.away, 0.1, 'from the latest weigh-in to the next one');
  // The goal page's own test: within 0.05 kg counts as met.
  assert.equal(C.bsClimbMilestones({ startKg: 80, targetKg: 75, nowKg: 77.54 }).next.m, 75);
  // A build climbs the same way.
  const build = C.bsClimbMilestones({ startKg: 60, targetKg: 70, nowKg: 66 });
  assert.deepEqual(build.stops.map((s) => s.done), [true, true, false, false]);
  assert.equal(build.next.m, 75);
  assert.equal(build.away, 1.5);
  // Nothing to measure: no start, no target, no weigh-in, or a target that is the start.
  for (const read of [null, { startKg: 80, targetKg: null, nowKg: 79 }, { startKg: 80, targetKg: 75, nowKg: null }, { startKg: 75, targetKg: 75, nowKg: 75 }]) {
    assert.equal(C.bsClimbMilestones(read), null);
  }
  // The two colours, and the scale between them.
  assert.equal(C.bsClimbGold({ isLight: false }), '#e2ac44');
  assert.equal(C.bsClimbGold({ isLight: true }), '#b9861f');
  assert.equal(C.bsClimbMix('#000000', '#ffffff', 0), '#000000');
  assert.equal(C.bsClimbMix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(C.bsClimbMix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(C.bsClimbMix('nope', '#ffffff', 0.5), 'nope', 'a colour it cannot read is left as it is');
});

test('the next milestone under the chart: the share walked as a ring, the milestone, its weight and what is left, and the four milestones as dots', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, onOpen: () => {} }));
  const one = (k) => d.nodes().find((n) => n.props && n.props[k] != null);
  const teal = THEME.ACCENT;
  const gold = C.bsClimbGold(THEME);
  // The strip: 48% in the ring, Halfway next at 77.5 kg (170.9 lb), 0.1 kg (0.2 lb) from the latest weigh-in.
  assert.ok(one('data-climb-strip'), 'no strip under a goal on its way');
  assert.equal(textOf(one('data-climb-strip-pct')), '48%');
  assert.equal(one('data-climb-ring').props['data-climb-ring'], 48);
  assert.equal(one('data-climb-ring').props.stroke, teal, 'the ring is the teal of progress');
  assert.equal(one('data-climb-next').props['data-climb-next'], 50);
  assert.equal(textOf(one('data-climb-next')), 'Next · Halfway');
  assert.equal(textOf(one('data-climb-next-weight')), '170.9 lb');
  assert.equal(textOf(one('data-climb-next-left')), ' · 0.2 lb to go');
  // The four milestones, as the approved Home draws them: a quarter met (a teal dot), Halfway next (a teal
  // ring), three quarters ahead (a quiet ring), and the goal a square in its gold.
  const pips = d.nodes().filter((n) => n.props && n.props['data-climb-pip'] != null);
  assert.deepEqual(pips.map((p) => p.props['data-climb-pip']), [25, 50, 75, 100]);
  assert.deepEqual(pips.map((p) => p.props['data-climb-pip-state']), ['done', 'next', 'ahead', 'ahead']);
  assert.deepEqual(pips.map((p) => p.props['data-climb-pip-color']), [teal, teal, CARE.bsHomeInk(THEME, 0.4), gold]);
  assert.equal(pips[0].props.style.background, teal, 'a met milestone is filled');
  assert.equal(pips[1].props.style.background, 'transparent', 'one ahead is an outline');
  assert.equal(pips[3].props.style.borderRadius, 0, 'the goal is a square');
  // A screen reader hears the strip with the rest.
  const band = textOf(one('data-climb-band')).replace(/\s+/g, ' ');
  assert.equal(climbOf(d).props['aria-label'].split(' · ').slice(0, 5).join(' · '), 'Your goal: 48% of the way, 5.7 lb to go · Next · Halfway · 170.9 lb · 0.2 lb to go');
  assert.match(climbOf(d).props['aria-label'], /· Start 176\.4 · Current 171\.1 · Pace /, 'and the band, after the strip');
  assert.ok(band.length > 0);
}));

// Owner, 2026-11-17: "just make sure look and design is same as preview". The chart is the approved Home's:
// the ground under the route in the goal's gold, fading down; what is walked a solid line from gold at the
// start to the teal of where the member is; what is ahead a thin dashed line in gold; the start and the
// weight now as rings; the flag in gold. The 2026-11-04 hill (its sun, shade and crest, the ticks and their
// weights, the glow and the breathing dot) is not drawn.
test('the chart, as the approved Home draws it: gold ground, a gold-to-teal walked line, a dashed gold way ahead, rings and a gold flag', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, onOpen: () => {} }));
  const one = (k) => d.nodes().find((n) => n.props && n.props[k] != null);
  const teal = THEME.ACCENT;
  const gold = C.bsClimbGold(THEME);
  const grads = Object.fromEntries(d.nodes().filter((n) => n.type === 'linearGradient').map((g) => [g.props.id, g]));
  const urlOf = (v) => (/^url\(#(.+)\)$/.exec(String(v || '')) || [])[1];
  const stopsOf = (g) => (Array.isArray(g.props.children) ? g.props.children : [g.props.children]).filter(Boolean).map((c) => c.props.stopColor);
  const area = one('data-climb-area');
  assert.equal(area.props.points, C.bsClimbArea());
  assert.deepEqual(stopsOf(grads[urlOf(area.props.fill)]), [gold, gold], 'the ground is the goal\'s gold, fading down');
  const walked = one('data-climb-walked');
  assert.deepEqual(stopsOf(grads[urlOf(walked.props.stroke)]), [gold, teal], 'what is walked runs from gold to teal');
  assert.equal(walked.props.strokeWidth, '4');
  const ahead = one('data-climb-ahead');
  assert.equal(ahead.props.points, C.bsClimbPath(0.48, 1), 'what is ahead starts where the member is');
  assert.equal(ahead.props.stroke, gold);
  assert.equal(ahead.props.strokeDasharray, '4 5');
  // The start and the weight now: rings in the teal over the paper.
  const start = one('data-climb-start-dot');
  assert.deepEqual([start.props.cx, start.props.cy, start.props.fill, start.props.stroke], [58, 112, THEME.PAPER, teal]);
  assert.deepEqual([one('data-climb-now').props.fill, one('data-climb-now').props.stroke], [THEME.PAPER, teal]);
  const flag = d.nodes().find((n) => n.type === 'polygon' && n.props.fillOpacity != null);
  assert.equal(flag.props.fill, gold);
  assert.equal(flag.props.fillOpacity, 1);
  assert.equal(one('data-climb-goal').props.fill, gold);
  for (const k of GONE) assert.equal(one(k), undefined, `${k} is the 2026-11-04 hill's, not the approved Home's`);
  assert.ok(!d.nodes().some((n) => n.type === 'style'), 'no animation on the chart');
}));

test('the strip is for a goal on its way: none when it is reached, before a weigh-in, or for a goal without numbers', () => withPounds(() => {
  const noStrip = (d) => !d.nodes().some((n) => n.props && n.props['data-climb-strip'] != null);
  const reached = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 78 }, weighIns: LOSING } }));
  assert.equal(climbOf(reached).props['data-bs-home-climb'], 'reached');
  assert.ok(noStrip(reached), 'a reached goal has no next milestone');
  assert.doesNotMatch(reached.text, /%/);
  // Reached plants the flag in the teal, and the whole route is walked in it.
  assert.equal(reached.nodes().find((n) => n.type === 'polygon' && n.props.fillOpacity != null).props.fill, THEME.ACCENT);
  const walked = reached.nodes().find((n) => n.props && n.props['data-climb-walked'] != null);
  assert.equal(walked.props.points, C.bsClimbPath(0, 1));
  assert.equal(walked.props.stroke, THEME.ACCENT);
  const target = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'lb', target: 165 }, weighIns: [] } }));
  assert.equal(climbOf(target).props['data-bs-home-climb'], 'target');
  assert.ok(noStrip(target), 'no weigh-in: nothing walked to measure');
  assert.doesNotMatch(target.text, /%|Next/);
  for (const data of [{ primary: 'race', overall: {}, weighIns: [] }, { primary: '', overall: {}, weighIns: [] }, { primary: 'fat_loss', overall: {}, weighIns: LOSING }]) {
    const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
    assert.ok(noStrip(d), `${climbOf(d).props['data-bs-home-climb']}: a strip`);
  }
  assert.ok(noStrip(drive(D.BSHomeClimbView, GOAL_PROPS({ data: null }))), 'still reading: no strip');
}));

test('the chart\'s numbers: the start under its ring, the weight now over its dot, the goal by the flag', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, onOpen: () => {} }));
  const one = (k) => d.nodes().find((n) => n.props && n.props[k] != null);
  const start = one('data-climb-start');
  assert.equal(textOf(start), 'START 176.4', '80 kg, in pounds');
  assert.equal(start.props.x, 58, 'under the start');
  assert.ok(start.props.y > 112 && start.props.y < C.BS_CLIMB_H, 'below the route, inside the box');
  // The weight now (77.6 kg) over the dot, in the teal.
  const now = one('data-climb-now-chip');
  const p = C.bsClimbPoint(0.48);
  assert.equal(now.props['data-climb-now-chip'], 'above');
  assert.equal(textOf(now), '171.1 NOW');
  assert.equal(now.props.textAnchor, 'middle');
  assert.ok(now.props.y < p.y - 6, 'over the dot');
  assert.equal(now.props.fill, THEME.ACCENT);
  // The goal by the flag, to its left and under the route's end, in gold.
  const goal = one('data-climb-goal');
  assert.equal(textOf(goal), 'GOAL 165.3');
  assert.equal(goal.props.textAnchor, 'end');
  assert.ok(goal.props.x < 318 && goal.props.y > 22);
  // The small capitals are the app's mono.
  for (const n of [start, now, goal]) assert.equal(n.props.style.fontFamily, THEME.MONO);
}));

test('the four figures under the chart: Start, Current, Pace and the date at that pace, each only when the read has it', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
  const read = W.bsHomeGoalRead({ weighIns: LOSING, startKg: 80, targetKg: 75, todayIso: '2026-10-22' });
  assert.ok(read.paceKgWk < 0 && read.etaIso, 'the sample has a pace and a date');
  const pace = `${read.paceKgWk < 0 ? '−' : '+'}${(Math.abs(read.paceKgWk) / LB).toFixed(1)} lb/wk`;
  const [y, m, dd] = read.etaIso.split('-').map(Number);
  const eta = new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const band = d.nodes().find((n) => n.props && n.props['data-climb-band'] != null);
  assert.equal(band.props['data-climb-band'], 'start current pace eta');
  assert.equal(band.props.style.gridTemplateColumns, 'repeat(4, minmax(0, 1fr))');
  const cells = d.nodes().filter((n) => n.props && n.props['data-climb-band-cell'] != null);
  assert.deepEqual(cells.map((c) => textOf(c)), [`Start176.4`, `Current171.1`, `Pace${pace}`, `Goal≈ ${eta}`]);
  // Chips with a coloured top edge: what is behind the member in the teal, what is ahead in the goal's gold.
  const gold = C.bsClimbGold(THEME);
  assert.deepEqual(cells.map((c) => c.props.style.borderTop), [THEME.ACCENT, THEME.ACCENT, gold, gold].map((c) => `2px solid ${c}`));
  assert.ok(cells.every((c) => c.props.style.borderRadius === 12));
  // Early on, no pace and no date yet: the band holds what there is, and no placeholder for the rest.
  const early = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: [{ d: '2026-10-19', kg: 80 }, { d: '2026-10-22', kg: 79 }] } }));
  const eb = early.nodes().find((n) => n.props && n.props['data-climb-band'] != null);
  assert.equal(eb.props['data-climb-band'], 'start current');
  assert.equal(eb.props.style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.doesNotMatch(early.text, /lb\/wk|—|≈/);
}));

test('the band on a narrow phone: a value wraps at its spaces rather than losing its unit (Codex P2 on #2618)', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
  const values = d.nodes().filter((n) => n.props && n.props['data-climb-band-value'] != null);
  assert.equal(values.length, 4);
  for (const v of values) {
    assert.equal(v.props.style.whiteSpace, 'normal', 'wraps');
    assert.equal(v.props.style.textOverflow, undefined, 'never cut to an ellipsis');
    assert.notEqual(v.props.style.overflow, 'hidden', 'never clipped');
  }
  assert.match(textOf(values[3]), /^≈\u00a0/, 'the ≈ stays with its date');
}));

test('a flat pace reads 0.0, never +0.0 (Codex P2 on #2618)', () => withPounds(() => {
  // The same weight a fortnight apart: a pace of exactly 0, and no date at that pace.
  const flat = [{ d: '2026-10-08', kg: 78 }, { d: '2026-10-22', kg: 78 }];
  assert.equal(W.bsHomeGoalRead({ weighIns: flat, startKg: 80, targetKg: 75, todayIso: '2026-10-22' }).paceKgWk, 0);
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: flat } }));
  const pace = d.nodes().find((n) => n.props && n.props['data-climb-band-cell'] === 'pace');
  assert.equal(textOf(pace), 'Pace0.0 lb/wk');
  // A pace that rounds to zero in the reader's units reads the same.
  const tiny = [{ d: '2026-10-08', kg: 78 }, { d: '2026-10-22', kg: 77.99 }];
  const t = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: tiny } }));
  assert.equal(textOf(t.nodes().find((n) => n.props && n.props['data-climb-band-cell'] === 'pace')), 'Pace0.0 lb/wk');
  // A real one keeps its sign.
  const losing = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: LOSING } }));
  assert.match(textOf(losing.nodes().find((n) => n.props && n.props['data-climb-band-cell'] === 'pace')), /^Pace−\d/);
}));

test('the chart\'s capitals are the reader\'s locale\'s: Turkish "şimdi" is ŞİMDİ (Codex P2 on #2618)', () => withPounds(() => {
  const prev = globalThis.ShapeI18n;
  const tr = { 'home:climb.nowWord': 'şimdi', 'goal:terms.whenStart': 'Başlangıç' };
  globalThis.ShapeI18n = { t: (key, opts = {}) => (tr[key] ?? new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts)), intlLocale: () => 'tr-TR' };
  try {
    const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
    const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
    const chip = textOf(d.nodes().find((n) => n.props && n.props['data-climb-now-chip'] != null));
    assert.match(chip, /ŞİMDİ$/, `the weight now in Turkish capitals: ${chip}`);
    assert.doesNotMatch(chip, /ŞIMDI/);
    assert.match(textOf(d.nodes().find((n) => n.props && n.props['data-climb-start'] != null)), /^BAŞLANGIÇ /);
  } finally { globalThis.ShapeI18n = prev; }
}));

test('near the flag the weight now stands to the dot\'s upper left, clear of the flag and inside the box', () => withPounds(() => {
  // 79.8 → 75.2 of 80 → 75: 96% of the way.
  const near = [{ d: '2026-10-01', kg: 79.8 }, { d: '2026-10-22', kg: 75.2 }];
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: near } }));
  const now = d.nodes().find((n) => n.props && n.props['data-climb-now-chip'] != null);
  const p = C.bsClimbPoint(0.96);
  assert.equal(now.props['data-climb-now-chip'], 'left');
  assert.equal(now.props.textAnchor, 'end', 'it runs left from the dot, away from the flag');
  assert.ok(now.props.x < p.x, 'left of the dot');
  assert.ok(now.props.y >= 12 && now.props.y < C.BS_CLIMB_H, 'inside the box');
}));

test('the chart\'s numbers and the band are for a goal on its way only', () => withPounds(() => {
  const none = (d) => ['data-climb-band', 'data-climb-now-chip', 'data-climb-start', 'data-climb-start-dot', 'data-climb-goal'].filter((k) => d.nodes().some((n) => n.props && n.props[k] != null));
  const reached = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 78 }, weighIns: LOSING } }));
  assert.deepEqual(none(reached), [], 'reached');
  assert.ok(reached.nodes().some((n) => n.props && n.props['data-climb-flag'] != null), 'the flag stays on a reached goal');
  for (const data of [{ primary: 'fat_loss', overall: { unit: 'lb', target: 165 }, weighIns: [] }, { primary: 'race', overall: {}, weighIns: [] }, { primary: '', overall: {}, weighIns: [] }]) {
    const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
    assert.deepEqual(none(d), [], climbOf(d).props['data-bs-home-climb']);
    assert.ok(d.nodes().some((n) => n.props && n.props['data-climb-ahead'] != null), 'the way ahead is still drawn');
  }
  const loading = drive(D.BSHomeClimbView, GOAL_PROPS({ data: null }));
  assert.deepEqual(none(loading), []);
  assert.ok(!loading.nodes().some((n) => n.props && (n.props['data-climb-flag'] != null || n.props['data-climb-ahead'] != null || n.props['data-climb-trail'] != null)), 'still reading: the ground alone');
}));

// Codex P2 on #2583: a climb with no link of its own is itself a button for the keyboard and switch devices;
// one with its own link keeps that as the way in, so no button sits inside a button.
test('the climb is keyboard-operable: a progress climb is a focusable button opened with Enter or Space', () => withPounds(() => {
  const opened = [];
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, coaches: [JORDAN, MAYA], onCoach: () => {}, onOpen: () => opened.push(1) }));
  const root = climbOf(d);
  assert.equal(root.props['data-bs-home-climb'], 'progress');
  assert.equal(root.props.role, 'button');
  assert.equal(root.props.tabIndex, 0);
  assert.match(String(root.props['aria-label']), /Your goal: \d+% of the way/, 'named by what it shows');
  let prevented = 0;
  for (const key of ['Enter', ' ', 'Tab']) root.props.onKeyDown({ key, preventDefault: () => { prevented += 1; } });
  assert.equal(opened.length, 2, 'Enter and Space open Your goals; Tab does not');
  assert.equal(prevented, 2, 'Space does not scroll the page');
  // ⚠ No button inside a button: the coaches at the plate's foot are doors of their own, so they sit beside
  // the climb in the plate, never inside it.
  const row = d.nodes().find(fn('BSHomeCoachesRow'));
  assert.ok(row, 'the coaches are on the plate');
  assert.ok(!flatten(root).includes(row), 'the coaches\' doors sit inside the climb\'s button');
  assert.ok(flatten(plateOf(d)).includes(row));
  // Words alone carries its own link: the climb is no button around it.
  const words = climbOf(drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'race', overall: {}, weighIns: [] }, onOpen: () => {} })));
  assert.equal(words.props.role, undefined, 'a button around a link');
  assert.equal(words.props.tabIndex, undefined);
  // Still reading (or a read that failed): nothing to name, so no door at all (Codex P2 on #2583).
  const reading = climbOf(drive(D.BSHomeClimbView, GOAL_PROPS({ data: null, onOpen: () => opened.push(1) })));
  assert.equal(reading.props['data-bs-home-climb'], 'loading');
  assert.equal(reading.props.role, undefined, 'an unnamed button in the tab order');
  assert.equal(reading.props.tabIndex, undefined);
  assert.equal(reading.props.onClick, undefined);
  assert.equal(opened.length, 2);
}));

test('the climb says only what it can: reached, a start with no target, a target with no weigh-in, words alone, nothing set, or still reading', () => withPounds(() => {
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
  assert.ok(climbLinks(reached)[0].props.style.minHeight >= 44, 'the link is a 44 px target');
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
  // The words once (they are the big line, so the plate carries no tag), and no "Since" date with no weight
  // on show (#2583).
  assert.equal(race.text.split('“Run a race”').length - 1, 1, 'the goal\'s words twice');
  assert.equal(labelOf(race).props.note, null, 'the words are the big line and the tag both');
  assert.doesNotMatch(race.text, /Since/);
  assert.doesNotMatch(race.text, /171\.1|lb now/, 'no weight read on a race goal');
  assert.equal(textOf(climbLinks(race)[0]), 'Add a number to track it →');
  tap(race);
  // The same goal with a pound target reads the weigh-ins again, the target as typed.
  const raceLb = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'race', overall: { unit: 'lb', target: 165 }, weighIns: LOSING } }));
  assert.equal(climbOf(raceLb).props['data-bs-home-climb'], 'progress');
  assert.match(raceLb.text, /GOAL 165\.0/);
  // A weight goal before the first weigh-in: its words, and a number to track.
  const fresh = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: {}, weighIns: [] } }));
  assert.equal(climbOf(fresh).props['data-bs-home-climb'], 'words');
  assert.match(fresh.text, /“Lose fat”/);
  // A target set and no weigh-in yet (Codex P2 on #2583): the target, and the first weigh-in, never "No goal yet".
  for (const primary of ['', 'fat_loss']) {
    const target = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary, overall: { unit: 'lb', target: 165 }, weighIns: [] }, onOpen }));
    assert.equal(climbOf(target).props['data-bs-home-climb'], 'target', `${primary || 'no words'}: the target`);
    assert.match(target.text, /165\.0lb/);
    assert.match(target.text, /Goal · No weigh-ins yet\./);
    assert.doesNotMatch(target.text, /No goal yet|Add a number/);
    assert.equal(textOf(climbLinks(target)[0]), 'Weigh in →');
  }
  // Nothing set: the door sets one, the flag an empty outline.
  const none = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: '', overall: {}, weighIns: [] }, onOpen }));
  assert.equal(climbOf(none).props['data-bs-home-climb'], 'none');
  assert.match(none.text, /No goal yet/);
  assert.equal(textOf(climbLinks(none)[0]), 'Set your goal →');
  assert.equal(none.nodes().find((n) => n.type === 'polygon' && n.props.fillOpacity != null).props.fillOpacity, 0);
  tap(none);
  assert.equal(opened.length, 3, 'each link opens the goal');
  // Still reading (or a read that failed): the plate's title over the bare ground, no figure, no link.
  const loading = drive(D.BSHomeClimbView, GOAL_PROPS({ data: null }));
  assert.equal(climbOf(loading).props['data-bs-home-climb'], 'loading');
  assert.equal(loading.text, 'Your goal', 'the plate\'s title alone');
  assert.equal(climbLinks(loading).length, 0);
  // Its chart is hidden from a screen reader, never an unnamed graphic (Codex P2 on #2583); every
  // other state's graphic is named by what it shows.
  const svgOf = (d) => d.nodes().find((n) => n.type === 'svg');
  assert.equal(svgOf(loading).props['aria-hidden'], true);
  assert.equal(svgOf(loading).props.role, undefined);
  assert.equal(svgOf(loading).props['aria-label'], undefined);
  for (const d of [reached, none]) {
    assert.equal(svgOf(d).props.role, 'img');
    assert.ok(String(svgOf(d).props['aria-label'] || '').length > 0, 'a named state lost its name');
    assert.equal(svgOf(d).props['aria-hidden'], undefined);
  }
}));

test('Shape Radio stands above the plates on its own line; the deck sets them 10px apart and hands them its own theme', () => {
  // Owner, 2026-11-04: "take the shape radio box out of the new climb box above it so its on its own line".
  // Owner, 2026-11-17: This week and the goal are each a plate of their own under it, so the deck draws no box.
  const seen = [];
  const prevCtx = globalThis.BSContext;
  globalThis.BSContext = { Provider: function Provider() {} };
  try {
    const d = drive(D.BSHomeDeck, { radio: { type: 'div', key: 'radio', props: { 'data-radio': '' } }, children: [{ type: 'div', key: 'week', props: { 'data-week': '' } }, { type: 'div', key: 'climb', props: { 'data-climb': '' } }] });
    const nodes = d.nodes();
    const radioAt = nodes.findIndex((n) => n.props && n.props['data-radio'] != null);
    const providerAt = nodes.findIndex((n) => n.type === globalThis.BSContext.Provider);
    assert.ok(radioAt >= 0 && providerAt > radioAt, 'Shape Radio is drawn first, before the plates');
    // Its own line, its edges on the plates': the box's own 8px and 2px more.
    const line = nodes.find((n) => n.props && n.props['data-bs-home-radio'] != null);
    assert.equal(line.props.style.margin, '0 2px');
    const provider = nodes[providerAt];
    seen.push(provider.props.value);
    const band = nodes.find((n) => n.props && n.props['data-bs-home-deck'] != null);
    assert.equal(band.props.style.margin, '10px 10px 0', 'the plates sit 10px under the radio, 10px in from the page');
    assert.equal(band.props.style.display, 'flex');
    assert.equal(band.props.style.flexDirection, 'column');
    assert.equal(band.props.style.gap, 10, 'the plates are 10px apart');
    assert.equal(band.props.style.background, undefined, 'the deck draws a box of its own again');
    assert.equal(band.props.style.border, undefined);
    // The deck holds the week, then the goal, and not the radio.
    const kids = [].concat(band.props.children).flat().filter(Boolean);
    assert.deepEqual(kids.map((k) => Object.keys(k.props)[0]), ['data-week', 'data-climb'], 'This week leads, then the goal');
    assert.ok(!kids.some((k) => k.props && k.props['data-radio'] != null), 'Shape Radio is inside the deck again');
    assert.equal(seen[0].PAPER, THEME.PAPER, 'the deck is the paper\'s own colour');
    assert.equal(seen[0].INK, THEME.INK, 'its words are the paper\'s own ink');
    // With no radio, the deck keeps its own place.
    const bare = drive(D.BSHomeDeck, { children: [{ type: 'div', key: 'climb', props: { 'data-climb': '' } }] });
    assert.equal(bare.nodes().find((n) => n.props && n.props['data-bs-home-deck'] != null).props.style.margin, '6px 10px 0');
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
  // The approved Home's cell (owner, 2026-11-17): a 12px corner, today's filled in the paper's ink; training's
  // bar in the trainer's rust and food's in the nutritionist's gold, the other three in the cell's ink.
  assert.ok(list.every((b) => b.props.style.borderRadius === 12));
  assert.deepEqual(barsOf(list[0]).map((x) => x.props.tone), ['#c0533b', '#a07a2e', null, null, null]);
  const bar = (props) => drive(barsOf(list[0])[0].type, props).nodes()[0];
  assert.equal(bar({ state: 'hit', on: false, tone: '#c0533b' }).props.style.background, '#c0533b', 'a hit bar is its role\'s colour');
  assert.equal(bar({ state: 'hit', on: true, tone: null }).props.style.background, THEME.PAPER, 'a plain bar on today\'s cell is the paper');
  assert.equal(bar({ state: 'hit', on: false, tone: null }).props.style.background, THEME.INK);
  assert.match(bar({ state: 'ahead', on: false, tone: '#a07a2e' }).props.style.border, /^1px solid rgba\(160,122,46,/, 'a bar to come is an outline in its colour');
  assert.ok(bar({ state: 'hit', on: false, tone: null }).props.style.height > bar({ state: 'miss', on: false, tone: null }).props.style.height, 'a hit stands taller than a miss');
  // A tap picks a day in place, never straight into the calendar (owner, 2026-11-04: "when i click on any
  // day on week view for client home page it immediatly takes me to month calendar"); today is picked
  // first, and the line under the strip says how the picked day went.
  assert.equal(list[3].props['aria-pressed'], true, 'today is picked first');
  assert.match(d.text, /○ Train · ✓ Food · ○ Protein · ○ Steps · ○ Check-in/, 'today\'s line: its bars marked');
  list[1].props.onClick();
  assert.equal(opened.length, 0, 'a first tap opens nothing');
  d.render();
  const picked = days(d);
  assert.equal(picked[1].props['aria-pressed'], true);
  assert.equal(picked[3].props['aria-pressed'], false);
  assert.match(picked[1].props.style.boxShadow, /^inset 0 0 0 1\.5px /, 'the picked day is ringed');
  assert.equal(picked[3].props.style.background, THEME.INK, 'today keeps its ink');
  assert.match(d.text, /– Train · ✓ Food · × Protein · ✓ Steps · × Check-in/, 'the picked day\'s line');
  // The picked day tapped again, or its → under the strip, opens the calendar on that day.
  picked[1].props.onClick();
  assert.equal(opened.length, 1);
  assert.ok(opened[0] instanceof Date);
  assert.equal(opened[0].toDateString(), new Date(2026, 9, 20).toDateString());
  const door = d.nodes().find((n) => n.type === 'button' && n.props['data-bs-home-open-day'] != null);
  assert.equal(door.props['data-bs-home-open-day'], GRID.week[1]);
  assert.ok(door.props.style.minHeight >= 44, 'the → is a 44 px target');
  door.props.onClick();
  assert.equal(opened.length, 2);
  assert.equal(opened[1].toDateString(), new Date(2026, 9, 20).toDateString());
  d.nodes().find((n) => n.type === 'button' && textOf(n) === 'Month →').props.onClick();
  assert.equal(months, 1);
  // The head: This week., the ISO week and its span.
  assert.match(d.text, /This week\./);
  assert.match(d.text, /Wk 43 · Oct 19–25/);
});

// The Shape Steps page lost its only door with Week so far's Steps tile (#2583); the owner, 2026-11-04:
// "where did shape steps go?", then "yes put it back on this week steps".
test('Steps under the strip opens the Shape Steps page, in the picked day\'s line and in the key', () => {
  let steps = 0;
  const onSteps = () => { steps += 1; };
  const doors = (d) => d.nodes().filter(fn('BSHdStepsDoor'));
  // The door drawn: its button (the harness draws one level at a time).
  const buttonOf = (door) => drive(door.type, door.props).nodes().find((n) => n.type === 'button' && n.props['data-bs-home-steps'] != null);
  const d = drive(D.BSHomeWeekBarsView, { w: { grid: GRID }, checkinsOn: true, onSteps, onDay: () => {}, onMonth: () => {} });
  const [door] = doors(d);
  assert.ok(door, 'Steps is the door');
  assert.equal(textOf(door), '○ Steps', 'the word keeps its mark and its place');
  assert.match(d.text, /○ Train · ✓ Food · ○ Protein · ○ Steps · ○ Check-in/, 'the line reads as it did');
  const btn = buttonOf(door);
  assert.ok(btn.props.style.minWidth >= 44 && btn.props.style.minHeight >= 44, 'a 44 px target');
  // Its box reaches no further than the date's → does: 6px up into the gap, 26px down into the padding.
  assert.equal(btn.props.style.margin, '-6px -6px -26px');
  assert.equal(btn.props.style.padding, '6px 6px 26px');
  assert.equal(btn.props.style.color, THEME.ACCENT, 'in the accent, as the date\'s → is');
  btn.props.onClick();
  assert.equal(steps, 1);
  // The mark is hidden from a screen reader; the button reads Steps.
  const markSpan = [door.props.children].flat().find((c) => c && c.props && c.props['aria-hidden'] === 'true');
  assert.equal(textOf(markSpan), '○ ');
  // The line's own box is as tall as the door's reach, so its clip never cuts the target.
  const line = d.nodes().find((n) => n.props && n.props['data-bs-home-day-line'] !== undefined);
  assert.equal(line.props.style.margin, '-6px 0 -26px');
  assert.equal(line.props.style.padding, '6px 0 26px');
  assert.equal(line.props['aria-hidden'], undefined, 'the line is not hidden, or the door would be');
  // A narrow line (a small phone, a long language) cuts the words, never the door (Codex P2 on #2601): the
  // line is a flex row, the door sits in it whole and never shrinks, the words on either side end in "…".
  assert.equal(line.props.style.display, 'flex');
  const kids = [line.props.children].flat(4).filter(Boolean);
  assert.ok(kids.includes(door), 'the door sits inside a piece that clips');
  assert.equal(btn.props.style.flex, 'none', 'the door shrinks');
  const pieces = kids.filter((n) => n.type === 'span');
  assert.deepEqual(pieces.map((n) => textOf(n)), ['○ Train · ✓ Food · ○ Protein · ', ' · ○ Check-in']);
  for (const p of pieces) { assert.equal(p.props.style.textOverflow, 'ellipsis'); assert.equal(p.props.style.minWidth, 0); assert.equal(p.props.style.whiteSpace, 'pre', 'a piece drops the spaces round its ·'); }
  // An unread week's key has the door too, reaching 4px up (the key sits 4px under the days).
  const blank = drive(D.BSHomeWeekBarsView, { w: { grid: null }, onSteps });
  const [key] = doors(blank);
  assert.ok(key, 'the key\'s Steps is the door');
  assert.equal(textOf(key), 'Steps');
  const keyBtn = buttonOf(key);
  assert.equal(keyBtn.props.style.margin, '-4px -6px -26px');
  const keyLine = blank.nodes().find((n) => n.props && n.props['data-bs-home-day-line'] !== undefined);
  assert.equal(keyLine.props.style.margin, '-4px 0 -26px');
  keyBtn.props.onClick();
  assert.equal(steps, 2);
  // With no door from Home, Steps is a word as before.
  assert.equal(doors(drive(D.BSHomeWeekBarsView, { w: { grid: GRID }, checkinsOn: true })).length, 0);
  // Home hands This week the old tile's door: the page once steps have synced, else Integrations.
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  const mount = client.slice(client.indexOf('<BSHomeWeekBars'), client.indexOf('</BSHomeDeck>'));
  assert.match(mount, /onSteps=\{\(\) => \{\s*if \(stepsToday\.hasData \|\| !stepsToday\.known\) \{ setStepsHistory\(true\); return; \}\s*try \{ window\.dispatchEvent\(new CustomEvent\('shape:openIntegrations'\)\); \} catch \(e\) \{\}\s*\}\}/);
  assert.match(client, /\{stepsHistory && <BSStepsHistory onClose=\{\(\) => setStepsHistory\(false\)\} \/>\}/, 'the page is still mounted');
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

// ── Today's plan ─────────────────────────────────────────────────────────────

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
// What a row holds, found inside it rather than by its words (its squares carry a mark, not words).
const inRow = (block, pred) => (block ? flatten(block).filter(pred) : []);
const markOf = (block) => inRow(block, (n) => n.props && n.props['data-team-mark'] != null)[0].props['data-team-mark'];

// Owner, 2026-11-17, the approved Home: one plate, a row a half. Everything Team's two coach cards offered
// (owner, 2026-11-03) is still on it.
test('Today\'s plan: one plate, the trainer\'s session "From {name}" and the nutritionist\'s food left and next meal, each with its square, Message and note', () => {
  const started = [], logged = [];
  const props = TEAM({ workout: { ...TEAM().workout, onStart: () => started.push(1) }, meal: { ...TEAM().meal, onLog: () => logged.push(1) } });
  const d = drive(T.BSHomeTeamView, { ...props, tour: 'hero-home' });
  const root = d.nodes()[0];
  assert.equal(root.type, 'section');
  assert.equal(root.props['data-tour'], 'hero-home', 'the tour\'s home step anchors on Today\'s plan');
  assert.equal(root.props['data-bs-home-team'], 'team');
  assert.equal(root.props['aria-label'], 'Today');
  assert.equal(root.props.style.borderRadius, 18, 'one plate');
  assert.doesNotMatch(d.text, /^Team\.|\d coaches/, 'the plate has no head of its own, as the approved Home');
  assert.ok(!d.nodes().some((n) => n.props && n.props['data-team-day'] != null), 'today, the plate names no day');
  // The trainer's row: the session, from them, with its own summary.
  const trainer = coachBlock(d, 'trainer');
  assert.equal(textOf(trainer), 'Lower Push — PeakFrom Jordan · 9:00 AM · 54 min · 6 moves');
  assert.equal(markOf(trainer), 'solid');
  const start = d.nodes().find((n) => n.type === 'button' && n.props['data-team-start'] != null);
  assert.equal(start.props['aria-label'], "I'll train today", 'the square is the pledge');
  assert.equal(start.props.style.width, 48);
  start.props.onClick();
  assert.equal(started.length, 1, 'I\'ll train today opens the session');
  // The nutritionist's row: the food left and the next meal, from them, their note under it, and Log.
  const nutri = coachBlock(d, 'nutritionist');
  // (The 2 between them is what is unread on her Message square.)
  assert.equal(textOf(nutri), '532 kcal leftFrom Maya · Lunch 12:40 · bowl + rice2This week’s note“Five plates. Three logged before noon.”');
  assert.equal(markOf(nutri), 'solid');
  const log = d.nodes().find((n) => n.type === 'button' && n.props['data-team-log'] != null);
  assert.equal(log.props['aria-label'], 'Log Lunch');
  log.props.onClick();
  assert.equal(logged.length, 1);
  // The two rows, in the plate's order: training, then food.
  assert.deepEqual(d.nodes().filter((n) => n.props && n.props['data-team-coach'] != null).map((n) => n.props['data-team-coach']), ['trainer', 'nutritionist']);
  // Each coach is offered once, a square each, with what is unread on it and said to a screen reader (#2583).
  assert.deepEqual(messages(d).map((b) => [b.props['data-team-message'], b.props['aria-label']]), [
    ['trainer', 'Message Jordan Chen'],
    ['nutritionist', 'Message Maya Patel, 2 new'],
  ]);
  assert.ok(messages(d).every((b) => b.props.style.minHeight === 48 && b.props.style.width === 48), 'a square is a 48 px target');
  assert.deepEqual(messages(d).map((b) => inRow(b, (n) => n.props && n.props['data-team-unread'] != null).map(textOf)), [[], ['2']], 'the unread count rides its coach\'s square');
  assert.doesNotMatch(d.text, /Find a coach/, 'a member with coaches is not sent to find one');
});

// A half nobody coaches yet, for a member with a coach of the other discipline: the member's own, dashed.
test('Today\'s plan with one coach: the other half is the member\'s own, its mark dashed', () => {
  let eat = 0, train = 0;
  // A trainer only: the food left with no nutritionist is on your own for now, and still logs.
  const t1 = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN], notes: [], mealCoachId: null, onEat: () => { eat += 1; } }));
  assert.equal(t1.nodes()[0].props['data-bs-home-team'], 'one');
  assert.equal(markOf(coachBlock(t1, 'trainer')), 'solid');
  const own = coachBlock(t1, 'none-fuel');
  assert.equal(markOf(own), 'open', 'the open seat is dashed');
  assert.equal(textOf(own), '532 kcal leftOn your own for now · Lunch 12:40 · bowl + rice');
  assert.ok(inRow(own, (n) => n.type === 'button' && n.props['data-team-log'] != null).length === 1, 'the next meal still logs');
  assert.equal(inRow(own, (n) => n.type === 'button' && n.props['data-team-message']).length, 0, 'no coach, no Message');
  // A trainer only, and nothing read of the day's food: Your food log, and the way to Eat.
  const bare = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN], notes: [], meal: null, fuel: null, onEat: () => { eat += 1; } }));
  const log = coachBlock(bare, 'open-food');
  assert.equal(textOf(log), 'Your food logOn your own for now');
  assert.equal(markOf(log), 'open');
  const door = inRow(log, (n) => n.type === 'button')[0];
  assert.equal(door.props['aria-label'], 'Log a meal');
  door.props.onClick();
  assert.equal(eat, 1);
  // A nutritionist only: the member's own session is dashed too; with none, Your training and the way to Train.
  const n1 = drive(T.BSHomeTeamView, TEAM({ coaches: [MAYA], workout: { ...TEAM().workout, coachId: null } }));
  assert.equal(markOf(coachBlock(n1, 'none-session')), 'open');
  assert.match(textOf(coachBlock(n1, 'none-session')), /^Lower Push — PeakToday’s workout · On your own for now · 9:00 AM/);
  assert.equal(markOf(coachBlock(n1, 'nutritionist')), 'solid');
  const n2 = drive(T.BSHomeTeamView, TEAM({ coaches: [MAYA], workout: null, onTrain: () => { train += 1; } }));
  const training = coachBlock(n2, 'open-training');
  assert.equal(textOf(training), 'Your trainingOn your own for now');
  inRow(training, (n) => n.type === 'button')[0].props.onClick();
  assert.equal(train, 1);
  // The order holds: training first, then food.
  assert.deepEqual(n2.nodes().filter((n) => n.props && n.props['data-team-coach'] != null).map((n) => n.props['data-team-coach']), ['open-training', 'nutritionist']);
  // With a team, or with no coach at all, nothing is dashed: no seat is open beside a coach.
  for (const coaches of [[JORDAN, MAYA], []]) {
    const d = drive(T.BSHomeTeamView, TEAM({ coaches, notes: [], workout: { ...TEAM().workout, coachId: coaches.length ? 7 : null }, mealCoachId: null }));
    assert.ok(d.nodes().filter((n) => n.props && n.props['data-team-mark'] != null).every((n) => n.props['data-team-mark'] === 'solid'), `${coaches.length} coaches: a dashed mark`);
  }
});

test('with nothing to log today, the food\'s square opens Eat; on another day there is no square', () => {
  let eat = 0;
  const d = drive(T.BSHomeTeamView, TEAM({ meal: null, onEat: () => { eat += 1; } }));
  const door = d.nodes().find((n) => n.type === 'button' && n.props['data-team-eat'] != null);
  assert.equal(door.props['aria-label'], 'Open today’s menu');
  door.props.onClick();
  assert.equal(eat, 1);
  assert.ok(!d.nodes().some((n) => n.props && n.props['data-team-log'] != null));
  const other = drive(T.BSHomeTeamView, TEAM({ today: false, meal: null, fuel: null, dayMeals: [{ slot: 'Lunch', time: '12:40 PM', title: 'Chicken bowl' }], onEat: () => { eat += 1; } }));
  assert.ok(!other.nodes().some((n) => n.props && (n.props['data-team-eat'] != null || n.props['data-team-log'] != null)), 'Eat is today\'s');
});

test('Message opens that coach\'s thread; a coach with no thread yet opens the coaches, never another coach\'s (Codex P2 on #2424)', () => {
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
    assert.match(textOf(coachBlock(d, 'trainer')), /^Lower Push — PeakFrom Trainer · /, 'the role stands for the name');
    assert.match(textOf(coachBlock(d, 'nutritionist')), /^532 kcal leftFrom Nutritionist · /);
    const extra = d.nodes().filter((n) => n.props && n.props['data-team-coach'] === 'extra');
    assert.equal(extra.length, 1, 'the second trainer is a row of their own');
    assert.equal(textOf(extra[0]), 'Trainer', 'the role once, not twice');
    messages(d)[0].props.onClick();
    messages(d)[2].props.onClick();
    assert.deepEqual(ev.got, [{ conversationId: 'c-x', name: undefined }, { conversationId: 'c-y', name: undefined }],
      'each nameless trainer opens their own thread, with no name to show');
  } finally { ev.off(); }
});

// Every coach's weekly note stays on Home (the old From your coaches showed both roles'): each under its
// own coach's row, and a second coach of a role never shows the first's. An unsigned note, or one signed
// with a name no coach here carries, is the first's.
test("each coach's weekly note is under their own row: the trainer's with the session, a second coach's on their row", () => {
  const SAM = { role: 'trainer', name: 'Sam Strong', conversationId: 'c-s', providerId: 8, photo: null };
  const notes = [
    { role: 'trainer', text: 'Sam here: hips first this week.', who: 'Sam Strong' },
    { role: 'trainer', text: 'Jordan: three sets, then stop.', who: 'Jordan Chen' },
    { role: 'nutritionist', text: 'Five plates.', who: 'Maya Patel' },
  ];
  const d = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, SAM], notes }));
  const noteIn = (block) => inRow(block, (n) => n.props && n.props['data-team-note'] != null).map(textOf);
  assert.deepEqual(noteIn(coachBlock(d, 'trainer')), ['“Jordan: three sets, then stop.”'], "the trainer's own note, with the session");
  assert.deepEqual(noteIn(coachBlock(d, 'nutritionist')), ['“Five plates.”']);
  assert.deepEqual(noteIn(coachBlock(d, 'extra')), ['“Sam here: hips first this week.”'], "the second trainer's note on their own row");
  // The trainer's row holds the session and the note together.
  assert.match(textOf(coachBlock(d, 'trainer')), /^Lower Push — Peak[\s\S]*This week’s note“Jordan: three sets, then stop\.”$/);
  // A second coach with no note of their own shows none: never the first's.
  const quiet = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, SAM], notes: [notes[1]] }));
  assert.equal(quiet.nodes().filter((n) => n.props && n.props['data-team-note'] != null).length, 1, "the first trainer's note showed twice");
  assert.doesNotMatch(textOf(quiet.nodes().find((n) => n.props && n.props['data-team-coach'] === 'extra')), /three sets/);
  // An unsigned note is the first trainer's; one signed by Sam is never Jordan's.
  const unsigned = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, SAM], notes: [{ role: 'trainer', text: 'Unsigned.', who: null }] }));
  assert.match(textOf(unsigned.nodes().find((n) => n.props && n.props['data-team-coach'] === 'trainer')), /Unsigned\./);
  const samOnly = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, SAM], notes: [notes[0]] }));
  assert.doesNotMatch(textOf(samOnly.nodes().find((n) => n.props && n.props['data-team-coach'] === 'trainer')), /hips first/, "Sam's note went to Jordan's row");
});

// A member may pay two trainers: today's session is the row of the one who wrote it, with their Message
// (Codex P2 on #2583); a session no paid trainer wrote is Today's workout, on no coach's row.
test("today's session goes on the row of the trainer who wrote it, and the member's own on no coach's", () => {
  const SAM = { role: 'trainer', name: 'Sam Strong', conversationId: 'c-s', providerId: 8, photo: null };
  const ev = listen('shape:openConversation');
  try {
    const d = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, SAM, MAYA], workout: { ...TEAM().workout, coachId: 8 } }));
    const card = coachBlock(d, 'trainer');
    assert.match(textOf(card), /^Lower Push — PeakFrom Sam · /, "Sam wrote it, so Sam's row carries it, though Jordan is the earlier");
    assert.match(textOf(coachBlock(d, 'extra')), /^Jordan Chen/, 'Jordan is the second trainer\'s row');
    assert.doesNotMatch(textOf(coachBlock(d, 'extra')), /Lower Push/);
    const [msg] = inRow(card, (n) => n.type === 'button' && n.props['data-team-message']);
    assert.equal(msg.props['aria-label'], 'Message Sam Strong', "the session's Message is Sam's");
    msg.props.onClick();
    assert.deepEqual(ev.got, [{ conversationId: 'c-s', name: 'Sam Strong' }]);
  } finally { ev.off(); }
  // The member's own workout (no coach), or a trainer no longer paid: Today's workout, on no coach's row;
  // the paid trainer keeps a row of their own, with Message.
  for (const coachId of [null, 99]) {
    const own = drive(T.BSHomeTeamView, TEAM({ workout: { ...TEAM().workout, coachId } }));
    assert.equal(textOf(coachBlock(own, 'trainer')), 'Jordan ChenTrainer', `a session by ${coachId} is filed under Jordan`);
    assert.equal(inRow(coachBlock(own, 'trainer'), (n) => n.type === 'button' && n.props['data-team-message']).length, 1);
    assert.match(textOf(coachBlock(own, 'none-session')), /^Lower Push — PeakToday’s workout · 9:00 AM · 54 min/);
    assert.equal(inRow(coachBlock(own, 'none-session'), (n) => n.type === 'button' && n.props['data-team-message']).length, 0, 'no coach\'s Message on a session none of them wrote');
    assert.equal(inRow(coachBlock(own, 'none-session'), (n) => n.type === 'button' && n.props['data-team-start'] != null).length, 1);
  }
});

// Codex P2 on #2583: a meal logged from Home counts in its food left: the meal logger hands its write to
// onLogged, and Home reads the day again once it lands (and a moment later, as Home's other loggers do).
test("a meal logged from Today's plan is counted in its food left once it is written", () => {
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  // The meal logger is its own module since its redesign (owner, 2026-11-04: B "for logging meals and Filed").
  const logger = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSMealLog.jsx'), 'utf8');
  const flow = logger.slice(logger.indexOf('export function BSLogMealFlow('), logger.indexOf('export function BSLogMealFlow(') + 40000);
  assert.notEqual(logger.indexOf('export function BSLogMealFlow('), -1, 'the meal logger is BSMealLog.jsx\'s');
  assert.match(flow, /write = r;[\s\S]{0,400}onLogged\(write\);/, 'the logger hands its write to onLogged');
  assert.match(client, /onLogged=\{\(write\) => \{\s+if \(loggingMealId\) setMealLogged\(\(prev\) => \(\{ \.\.\.prev, \[loggingMealId\]: true \}\)\);[\s\S]{0,300}if \(write && typeof write\.then === 'function'\) write\.then\(\(\) => \{ refreshAnalytics\(\); bsScoreDirty\(\); \}, \(\) => \{\}\);\s+setTimeout\(refreshAnalytics, 700\);/);
});

// Codex P2 on #2583: a member who pays two nutritionists sees the day's meals under the one who wrote the plan.
test("the day's meals go on the row of the nutritionist who wrote the plan, with their Message", () => {
  const NIA = { role: 'nutritionist', name: 'Nia Noor', conversationId: 'c-n', providerId: 4, photo: null };
  const ev = listen('shape:openConversation');
  try {
    const d = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, NIA], mealCoachId: 4 }));
    const card = coachBlock(d, 'nutritionist');
    assert.match(textOf(card), /^532 kcal leftFrom Nia · /, "Nia wrote the meal plan, so Nia's row carries the meals, though Maya is the earlier");
    assert.match(textOf(coachBlock(d, 'extra')), /^Maya Patel/, 'Maya is the second nutritionist\'s row');
    const [msg] = inRow(card, (n) => n.type === 'button' && n.props['data-team-message']);
    assert.equal(msg.props['aria-label'], 'Message Nia Noor', "the meals' Message is Nia's");
    msg.props.onClick();
    assert.deepEqual(ev.got, [{ conversationId: 'c-n', name: 'Nia Noor' }]);
  } finally { ev.off(); }
  // No author named: the first nutritionist, as before.
  const NIA2 = { role: 'nutritionist', name: 'Nia Noor', conversationId: 'c-n', providerId: 4, photo: null };
  const unnamed = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, NIA2], mealCoachId: null }));
  assert.match(textOf(coachBlock(unnamed, 'nutritionist')), /^532 kcal leftFrom Maya · /);
  // A plan by a nutritionist no longer paid (Codex P2 on #2583): the food left on no coach's row, and the
  // paid nutritionists keep only their own Message, never those meals.
  const former = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, NIA2], mealCoachId: 99 }));
  const fuelRow = coachBlock(former, 'none-fuel');
  assert.match(textOf(fuelRow), /^532 kcal left/);
  assert.equal(markOf(fuelRow), 'solid', 'a team has no open seat');
  assert.doesNotMatch(textOf(coachBlock(former, 'nutritionist')), /kcal left/);
  assert.equal(inRow(coachBlock(former, 'nutritionist'), (n) => n.type === 'button' && n.props['data-team-log'] != null).length, 0);
  assert.ok(former.nodes().some((n) => n.type === 'button' && /^Message Maya Patel(, |$)/.test(n.props['aria-label'] || '')), "Maya's Message stays hers");
  assert.equal(inRow(fuelRow, (n) => n.type === 'button' && n.props['data-team-message']).length, 0, 'no coach\'s Message on those meals');
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /mealCoachId=\{sample \? 'sample-nutritionist' : \(\(livePlan && livePlan\.meals && livePlan\.meals\.coachId\) \?\? null\)\}/);
});

// Codex P2 on #2583: a note keeps its coach's listing id, and the plate files it by that id first, so two
// coaches who share a name, or a name lookup that failed, never put one coach's advice under the other.
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

// Owner, 2026-11-04: "ok add it", of the engine's move back on Home as one row: the morning panel's first,
// only when the engine leads, "Your move" in the lever's colour, the move and its reason, the pledge a square.
test('Your move: the engine\'s one move, its reason and its pledge, first in the morning panel and only when it leads', () => {
  let went = 0;
  const d = drive(S.BSHomeMoveRow, { head: 'Get to bed earlier tonight.', sub: 'Under 6h a night this week', cta: ["I'll get to bed earlier →", () => { went += 1; }], color: '#4a7bd0' });
  assert.match(d.text, /^Your moveGet to bed earlier tonight\.Under 6h a night this week$/);
  const go = d.nodes().find((n) => n.type === 'button' && n.props['data-bs-home-move-go'] != null);
  assert.equal(go.props['aria-label'], "I'll get to bed earlier", 'the square says the pledge');
  // The plate's square (owner, 2026-11-17): 48px with a 12px corner, in ink.
  assert.equal(go.props.style.width, 48);
  assert.equal(go.props.style.borderRadius, 12);
  assert.equal(go.props.style.background, THEME.INK);
  go.props.onClick();
  assert.equal(went, 1);
  assert.equal(drive(S.BSHomeMoveRow, { head: '', cta: null }).nodes().length, 0, 'no move, no row');
  // Home draws it first in the panel, and only for the engine's lead (the plan's own leads are Today's plan's).
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(src, /<BSMorningPanel>\n(\s+\{\/\*[\s\S]*?\*\/\}\n)?\s+\{todayDirective && todayDirective\.engine \? \(\n\s+<BSHomeMoveRow head=\{todayDirective\.head\} sub=\{todayDirective\.sub\} cta=\{todayDirective\.cta\} color=\{todayDirective\.c\} \/>/);
});

test('the next session opens the calendar on its day', () => {
  const opened = [];
  const next = { at: Date.parse('2026-10-24T13:00:00Z'), providerName: 'Jordan Chen', providerRole: 'trainer' };
  const d = drive(T.BSHomeTeamView, TEAM({ next, onCalendar: (day) => opened.push(day) }));
  const row = d.nodes().find((n) => n.type === 'button' && n.props['data-team-next'] != null);
  assert.match(textOf(row), /^Next session.*· Jordan Chen$/);
  assert.ok(row.props.style.minHeight >= 44);
  row.props.onClick();
  assert.equal(opened.length, 1);
  assert.equal(opened[0].getTime(), next.at, 'the calendar opens on the session\'s day');
  // Not named: the role.
  const nameless = drive(T.BSHomeTeamView, TEAM({ next: { ...next, providerName: null } }));
  assert.match(textOf(nameless.nodes().find((n) => n.props && n.props['data-team-next'] != null)), /· Trainer$/);
});

test('with no coach, the plate is Today: the session and the food left with no coach named, and Find a coach only when Home asks', () => {
  let found = 0;
  const d = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], unread: {}, showFindCoach: true, onFindCoach: () => { found += 1; } }));
  assert.equal(d.nodes()[0].props['data-bs-home-team'], 'none');
  assert.equal(d.nodes()[0].props['aria-label'], 'Today');
  assert.doesNotMatch(d.text, /From |coach(es)? ·|\d coach/, 'no coach named, no coach count');
  assert.equal(textOf(coachBlock(d, 'none-session')), 'Lower Push — PeakToday’s workout · 9:00 AM · 54 min · 6 moves');
  assert.equal(textOf(coachBlock(d, 'none-fuel')), '532 kcal leftLunch 12:40 · bowl + rice');
  assert.equal(messages(d).length, 0, 'no coach, no Message');
  const find = d.nodes().find((n) => n.type === 'button' && n.props['data-team-find'] != null);
  assert.match(textOf(find), /^Find a coachTrainers and nutritionists/);
  assert.ok(find.props.style.minHeight >= 44);
  find.props.onClick();
  assert.equal(found, 1);
  // Find a coach waits for Home to know there is none (bsHomeCoachesKnown).
  const waiting = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], showFindCoach: false }));
  assert.ok(!waiting.nodes().some((n) => n.props && n.props['data-team-find'] != null));
  // Nothing to say at all: nothing drawn.
  assert.equal(drive(T.BSHomeTeamView, { coaches: [], notes: [] }).nodes().length, 0);
  // A trainer with no session today still offers Message.
  const rest = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN], workout: null }));
  assert.equal(textOf(coachBlock(rest, 'trainer')), 'No session todayJordan Chen · Trainer');
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

test('Daily habits: how many are done today, the first three a row each with its tick, and the rest on the page', () => {
  signIn();
  try {
    const toggled = [];
    let opened = 0;
    const d = drive(S.BSHomeHabitsRowView, { habits: HABITS, ready: true, todayIso: '2026-10-22', tour: 'hero-habits', onToggle: (id) => toggled.push(id), onOpen: () => { opened += 1; } });
    assert.equal(d.nodes()[0].props['data-tour'], 'hero-habits');
    assert.match(d.text, /^Daily habits2 of 5 done/);
    const list = ticks(d);
    assert.deepEqual(list.map((b) => [b.props['data-habit-tick'], b.props['aria-pressed'], b.props['aria-label']]), [
      ['done', true, 'Drink 3 glasses of water'],
      ['open', false, 'Take vitamins'],
      ['done', true, 'smoking'],
    ], 'a tick a habit, named by the habit as the member wrote it');
    // A row a habit (owner, 2026-11-17, the approved Home): its own words beside the tick; a habit to avoid
    // reads "No …".
    assert.deepEqual(d.nodes().filter((n) => n.props && n.props['data-habit-name'] != null).map(textOf), ['Drink 3 glasses of water', 'Take vitamins', 'No smoking']);
    assert.ok(list.every((b) => b.props.style.minHeight === 44 && b.props.style.width === 44), 'a tick is a 44 px target');
    // The plate's square: filled in ink once done, an outline until then.
    assert.deepEqual(list.map((b) => b.props.style.background), [THEME.INK, 'transparent', THEME.INK]);
    assert.ok(list.every((b) => b.props.style.borderRadius === 12));
    list[1].props.onClick();
    assert.deepEqual(toggled, ['h2'], 'a tick here is the page\'s tick');
    const more = d.nodes().find((n) => n.type === 'button' && n.props['data-habits-more'] != null);
    assert.match(textOf(more), /^2 more habits/);
    assert.ok(more.props.style.minHeight >= 44);
    more.props.onClick();
    d.nodes().find((n) => n.type === 'button' && /^Daily habits/.test(textOf(n))).props.onClick();
    assert.equal(opened, 2, 'the rest and the title open the Habits page');
    // Three or fewer: no more to open.
    const three = drive(S.BSHomeHabitsRowView, { habits: HABITS.slice(0, 3), todayIso: '2026-10-22' });
    assert.ok(!three.nodes().some((n) => n.props && n.props['data-habits-more'] != null));
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
    assert.deepEqual(d.nodes().filter((n) => n.props && n.props['data-habit-name'] != null).map(textOf), rows.slice(0, 3).map((h) => h.name), 'each row says its habit whole');
  } finally { globalThis._BS_HABIT_DEMO_ROWS = prev; }
});

// The self-review of #2583: Home's reads after its own writes, the trainer behind the preview's Message, the
// week by Train's rule, the reader's clock, and the sample's note in the reader's language.
test("Home re-reads the score after what earns points, messages the session's own trainer, and slots its week by Train's rule", () => {
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  const sections = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSHomeSections.jsx'), 'utf8');
  // The score reads itself again on a check-in saved and on Home's own point-earning writes.
  assert.match(client, /window\.addEventListener\(BS_CI_SAVED, again\);\s+window\.addEventListener\(BS_SCORE_DIRTY, again\);/);
  assert.match(client, /write\.then\(\(\) => \{ refreshAnalytics\(\); bsScoreDirty\(\); \}, \(\) => \{\}\);/, 'a meal logged from Team');
  assert.match(client, /<BSHomeHabitsRow tour="hero-habits"[^\n]*onTicked=\{bsScoreDirty\} \/>/, 'a habit ticked on Home');
  assert.match(sections, /Promise\.resolve\(r\)\.then\(\(\) => onTicked\(\), \(\) => \{\}\);/);
  // The preview's Message: the session's own trainer's thread, never the sample coach for a signed-in member.
  assert.match(client, /if \(!bsHomeSignedIn\) \{ goChat\('Jordan Chen', 'Coach · Hypertrophy'\); return; \}\s+const c = shownWorkout && shownWorkout\.coachId != null/);
  assert.doesNotMatch(client, /onMessage=\{\(\) => \{ setShowWorkoutPreview\(false\); goChat\('Jordan Chen'/);
  // Home's week is Train's (bsSlotWeek): a session dated in another week is never today's.
  assert.match(client, /const wSlots = bsSlotWeek\(\(plan\.training && plan\.training\.workouts\) \|\| \[\], monday\);/);
  // The reader's clock, and no time where none was set.
  assert.match(client, /new Intl\.DateTimeFormat\(bsCkLocale\(\), \{ hour: 'numeric', minute: '2-digit' \}\)/);
  assert.match(client, /time: _wkTimed \? fmtAt\(WORKOUT_AT\) : null/);
  // The signed-out sample's note, in the reader's language.
  assert.match(client, /text: tr\('home:team\.sampleNote', \{ defaultValue: 'Five plates\./);
});

// ── The picked day (owner, 2026-11-04: "the change in weekly date should adjust activities on home page") ──

test('This week: held by Home, a tap hands Home the day and the strip shows the day Home picked', () => {
  const picks = [];
  const d = drive(D.BSHomeWeekBarsView, { w: { grid: GRID }, checkinsOn: true, picked: 4, onPick: (i) => picks.push(i), onDay: () => {}, onMonth: () => {} });
  const list = days(d);
  assert.equal(list[4].props['aria-pressed'], true, 'the day Home holds is the picked one');
  assert.equal(list[3].props['aria-pressed'], false, 'today is not, while another is held');
  assert.match(d.text, /Fri 23 →/, 'its line names it');
  list[1].props.onClick();
  assert.deepEqual(picks, [1], 'a tap hands Home the day');
  d.render();
  assert.equal(days(d)[4].props['aria-pressed'], true, 'and the strip waits for Home to move it');
  // Held with nothing picked yet: today.
  const t0 = drive(D.BSHomeWeekBarsView, { w: { grid: GRID }, checkinsOn: true, picked: null, onPick: () => {}, onDay: () => {}, onMonth: () => {} });
  assert.equal(days(t0)[3].props['aria-pressed'], true);
});

test('Today\'s plan on another day: its date, its session as a preview, its meals in order, nothing to log and no food left', () => {
  const started = [];
  const d = drive(T.BSHomeTeamView, TEAM({
    today: false, dayLabel: 'Sat 12', meal: null, fuel: null,
    workout: { ...TEAM().workout, title: 'Long run', time: '8:00 AM', onStart: () => started.push(1) },
    dayMeals: [{ slot: 'Breakfast', time: '7:00 AM', title: 'Oats + whey' }, { slot: 'Lunch', time: '12:40 PM', title: 'Chicken bowl' }],
  }));
  // The plate says which day it shows, to the eye and to a screen reader.
  assert.equal(textOf(d.nodes().find((n) => n.props && n.props['data-team-day'] != null)), 'Sat 12');
  assert.equal(d.nodes()[0].props['aria-label'], 'Sat 12');
  assert.equal(textOf(coachBlock(d, 'trainer')), 'Long runFrom Jordan · 8:00 AM · 54 min · 6 moves');
  assert.match(textOf(coachBlock(d, 'nutritionist')), /^Meals · Sat 12From Maya/, 'the day\'s meals, from their nutritionist');
  const start = d.nodes().find((n) => n.type === 'button' && n.props['data-team-start'] != null);
  assert.equal(start.props['aria-label'], 'Preview', 'a preview, not I’ll train today');
  start.props.onClick();
  assert.equal(started.length, 1);
  const meals = d.nodes().filter((n) => n.props && n.props['data-team-day-meal'] != null).map((n) => textOf(n));
  assert.deepEqual(meals, ['Breakfast7:00 AMOats + whey', 'Lunch12:40 PMChicken bowl'], 'the day’s meals, in order');
  assert.ok(!d.nodes().some((n) => n.props && n.props['data-team-log'] != null), 'nothing to log on another day');
  assert.ok(!d.nodes().some((n) => n.props && n.props['data-team-fuel'] != null), 'no food left on another day');
  assert.doesNotMatch(d.text, /kcal left|Fuel left today/);
});

test('Today\'s plan on another day with no coach and no session: the date heads it, and the day says so', () => {
  const d = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], today: false, dayLabel: 'Sun 13', workout: null, meal: null, fuel: null,
    dayMeals: [{ slot: 'Dinner', time: '7:00 PM', title: 'Salmon' }], showFindCoach: true, onFindCoach: () => {} }));
  assert.match(d.text, /^Sun 13/, 'the day heads the plate');
  assert.equal(d.nodes()[0].props['aria-label'], 'Sun 13', 'the day in place of Today');
  assert.match(d.text, /Meals · Sun 13/);
  assert.doesNotMatch(d.text, /Fuel left today/);
  const withSession = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN], notes: [], today: false, dayLabel: 'Sun 13', workout: null, meal: null, fuel: null }));
  assert.match(withSession.text, /No session · Sun 13/);
  const orphan = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], today: false, dayLabel: 'Sun 13', workout: { ...TEAM().workout, coachId: null }, meal: null, fuel: null }));
  assert.match(orphan.text, /Workout · Sun 13/);
});

test('Home holds the picked day: the strip hands it up, and Today\'s plan reads that day\'s session and meals', () => {
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /const \[pickedDay, setPickedDay\] = useStateBSC\(null\);/);
  assert.match(client, /picked=\{pickedDay\} onPick=\{setPickedDay\} \/>/, 'the strip is Home’s');
  assert.match(client, /const pickWorkout = pickToday \? selWorkout : \(liveWeek \? liveWeek\.workoutByIdx\[pickIdx\] : bsClientWorkoutForDay\(pickIdx\)\);/);
  assert.match(client, /const pickMeals = pickToday \? selMeals : mealsForIdx\(pickIdx\);/);
  assert.match(client, /dayLabel=\{`\$\{_dowShort\(pickDate\)\} \$\{pickDate\.getDate\(\)\}`\} today=\{pickToday\}/, 'the plate’s date is the picked one');
  assert.match(client, /fuel=\{pickToday \? fuel : null\}/, 'the food left is today’s alone');
  // The morning panel stays today's: Your move reads selIdx, which is today.
  assert.match(client, /const selIdx = todayIdx;/);
});

// ── One check-in on Home (owner, 2026-11-11: "why are there 2 checkins for a signed in account") ───
// The Weekly check-in is the coach's form: a line on Team naming who it is for, only with a coach, where it
// was a second check-in row under the morning panel that every signed-in account saw.
test('Today\'s plan: the Weekly check-in is a line under the coaches it is for, and only when there is a coach', () => {
  let opened = 0;
  const one = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN], notes: [], weekly: { onOpen: () => { opened += 1; } } }));
  const line = one.nodes().find((n) => n.type === 'button' && n.props['data-team-weekly'] != null);
  assert.ok(line, 'the line is drawn');
  assert.ok(line.props.style.minHeight >= 44);
  assert.match(textOf(line), /Weekly check-in due\s*For Jordan\s*2 min/);
  assert.equal(line.props['aria-label'], 'Weekly check-in due · For Jordan · 2 min');
  line.props.onClick();
  assert.equal(opened, 1, 'it opens the check-in');
  const two = drive(T.BSHomeTeamView, TEAM({ weekly: { onOpen: () => {} } }));
  assert.match(textOf(two.nodes().find((n) => n.props && n.props['data-team-weekly'] != null)), /For your coaches/);
  // No coach: nothing to send it to, so no line (Settings and Your first 30 days still open the form).
  const none = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], showFindCoach: true, weekly: { onOpen: () => {} } }));
  assert.equal(none.nodes().some((n) => n.props && n.props['data-team-weekly'] != null), false);
  // Not due: no line.
  const notDue = drive(T.BSHomeTeamView, TEAM({ weekly: null }));
  assert.equal(notDue.nodes().some((n) => n.props && n.props['data-team-weekly'] != null), false);
  // Home: no second check-in row, the line rides Team signed in only, and only a sent check-in clears it.
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.doesNotMatch(client, /BSHomeBulletin|home:bulletin\.weeklyCheckin/, 'no weekly row beside the morning panel');
  // Whenever it is due, the engine's check-in week included: Home's lead never asks for it (Codex P2 on #2709).
  assert.match(client, /weekly=\{!sample && checkinDue && checkinPrefOn \? \{ onOpen: \(\) => setCheckinPage\(true\) \} : null\}/);
  assert.match(client, /function bsCheckinLeadSuppressed\(engineFlag\) \{\s*return !!engineFlag && engineFlag\.lever === 'checkin';\s*\}/, 'no weekly check-in in Home\'s lead');
  assert.doesNotMatch(client, /home:lead\.checkin\./, 'the lead has no check-in move to draw');
  assert.match(client, /<BSWeeklyCheckin onBack=\{\(\) => setCheckinPage\(false\)\} onSent=\{\(\) => \{ setCheckinDue\(false\); setCheckinPage\(false\); \}\} \/>/, 'a Back without sending keeps the line');
});
