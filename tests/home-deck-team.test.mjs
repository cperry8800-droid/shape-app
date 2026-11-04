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
import * as W from '../mobile-app/src/services/homeWeek.mjs';

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
  // A target and no weigh-in yet (Codex P2 on #2583): the target, with or without words, never "No goal yet".
  assert.deepEqual(C.bsHomeClimbState({ read: { nowKg: null, targetKg: 75 }, words: 'Lose fat', weightGoal: true }), { kind: 'target', pct: 0, early: true });
  assert.equal(C.bsHomeClimbState({ read: { nowKg: null, targetKg: 75 }, weightGoal: true }).kind, 'target');
  assert.equal(C.bsHomeClimbState({ read: { nowKg: null, targetKg: null }, words: 'Lose fat', weightGoal: true }).kind, 'words', 'words and no number: its words');
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

// Owner, 2026-11-04: "simplify some of the data on the hill climb/chart. looks like too much and can be a
// little overwhelming". The climb says three things; the route shows how far.
test('the climb: the goal in the member\'s words, what is left in their units, the goal by the flag, and the walked line', () => withPounds(() => {
  const opened = [];
  const data = { primary: 'fat_loss', overall: { title: 'Lean, and quick on the bike again', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, tour: 'hero-goal', onOpen: () => opened.push(1) }));
  const root = climbOf(d);
  assert.equal(root.props['data-bs-home-climb'], 'progress');
  assert.equal(root.props['data-tour'], 'hero-goal', 'the tour\'s goal step anchors on the climb');
  const text = d.text;
  assert.match(text, /“Lean, and quick on the bike again”/, 'the goal in the member\'s own words');
  assert.match(text, /5\.7lb to go/, '2.6 kg left reads in pounds');
  assert.match(text, /Goal 165\.3/, 'the target by the flag');
  // Over the sky, still three things: the corner by the flag says the goal alone (owner, 2026-11-04: "clean
  // up the flag section"); the route's numbers and the band are the next test's. The share walked is the
  // strip's alone (below), once.
  assert.equal(textOf(d.nodes().find((n) => n.props && n.props['data-climb-goal'] != null)), 'Goal 165.3', 'the goal alone by the flag');
  assert.doesNotMatch(text, /Since|Aug 27/, 'not the date it started');
  assert.equal(text.split('48%').length - 1, 1, 'the share walked shows once, in the strip');
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
  // A met tick in the colour of where it stands on the teal → gold run (option B's colours), one ahead faded.
  assert.deepEqual(ticks.map((l) => l.props.stroke === C.bsClimbMix(THEME.ACCENT, C.bsClimbGold(THEME), [0.25, 0.5, 0.75][ticks.indexOf(l)])), [true, false, false]);
  // The whole climb opens the goal.
  root.props.onClick();
  assert.equal(opened.length, 1);
  assert.equal(climbLinks(d).length, 0, 'a goal on its way needs no link');
}));

test('the climb early on: what is left and the goal, no pace and no placeholder for one', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: [{ d: '2026-10-19', kg: 80 }, { d: '2026-10-22', kg: 79 }] };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
  assert.equal(climbOf(d).props['data-bs-home-climb'], 'progress');
  assert.match(d.text, /lb to go/);
  assert.doesNotMatch(d.text, /Pace after a week of weigh-ins|lb\/wk/);
  assert.ok(!d.nodes().some((n) => n.props && n.props['data-climb-pace'] != null), 'no pace line');
}));

// Owner, 2026-11-04: "add a little more info here, either milestones, and percentage progress", "add a little
// more color to this graph", then "this design but with option C coloring scheme on graph".
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

test('the climb in colour, with the strip: the share walked, the next milestone, its weight and what is left, and the four milestones', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, onOpen: () => {} }));
  const one = (k) => d.nodes().find((n) => n.props && n.props[k] != null);
  const teal = THEME.ACCENT;
  const gold = C.bsClimbGold(THEME);
  // The strip: 48% in the ring, Halfway next at 77.5 kg (170.9 lb), 0.1 kg (0.2 lb) from the latest weigh-in.
  assert.ok(one('data-climb-strip'), 'no strip under a goal on its way');
  assert.equal(textOf(one('data-climb-strip-pct')), '48%');
  assert.equal(one('data-climb-ring').props['data-climb-ring'], 48);
  assert.equal(one('data-climb-next').props['data-climb-next'], 50);
  assert.equal(textOf(one('data-climb-next')), 'Next · Halfway');
  assert.equal(textOf(one('data-climb-next-weight')), '170.9 lb');
  assert.equal(textOf(one('data-climb-next-left')), ' · 0.2 lb to go');
  // The four milestones: a quarter met, Halfway next, the rest ahead; teal at the foot, gold at the goal.
  const pips = d.nodes().filter((n) => n.props && n.props['data-climb-pip'] != null);
  assert.deepEqual(pips.map((p) => p.props['data-climb-pip']), [25, 50, 75, 100]);
  assert.deepEqual(pips.map((p) => p.props['data-climb-pip-state']), ['done', 'next', 'ahead', 'ahead']);
  assert.deepEqual(pips.map((p) => p.props['data-climb-pip-color']), [0.25, 0.5, 0.75, 1].map((f) => C.bsClimbMix(teal, gold, f)));
  assert.equal(pips[3].props['data-climb-pip-color'], gold);
  assert.equal(pips[0].props.style.background, C.bsClimbMix(teal, gold, 0.25), 'a met milestone is filled');
  assert.equal(pips[1].props.style.background, 'transparent', 'one ahead is an outline');
  // The route in option B's colours (owner, 2026-11-04: "also i like this coloring for graph on home page"):
  // the hill washed teal at the foot to gold at the summit, the walked line and what is still to walk on the
  // same teal → gold run, the flag and the goal by it in gold; no glows.
  const grads = Object.fromEntries(d.nodes().filter((n) => n.type === 'linearGradient').map((g) => [g.props.id, g]));
  const fillOf = (n) => /^url\(#(.+)\)$/.exec([n.props.fill, n.props.stroke].find((v) => /^url\(/.test(v || '')) || '')[1];
  const ridge = grads[fillOf(one('data-climb-ridge'))];
  assert.ok(ridge, 'the hill is not washed');
  const stopsOf = (g) => (Array.isArray(g.props.children) ? g.props.children : [g.props.children]).filter(Boolean).map((c) => c.props.stopColor);
  assert.deepEqual(stopsOf(ridge), [teal, gold], 'the hill runs from the teal to the gold');
  const walkedRun = grads[fillOf(one('data-climb-walked'))];
  assert.deepEqual(stopsOf(walkedRun), [teal, gold], 'the walked line runs from the teal to the gold');
  assert.equal(fillOf(one('data-climb-ahead')), fillOf(one('data-climb-walked')), 'the route still to walk is on the same run');
  assert.equal(one('data-climb-ahead').props.strokeDasharray, '3 4');
  for (const k of ['data-climb-walked-area', 'data-climb-next-ring', 'data-climb-summit-glow']) assert.equal(one(k), undefined, `${k} is C's, not B's`);
  assert.equal(one('data-climb-now').props.fill, C.bsClimbMix(teal, gold, 0.48), 'the now dot wears the colour of where it stands');
  const flag = d.nodes().find((n) => n.type === 'polygon' && n.props.fillOpacity != null);
  assert.equal(flag.props.fill, gold);
  assert.equal(one('data-climb-goal').props.style.color, gold);
  // A tick and its dot agree on what is met: a met tick in the colour of where it stands, one ahead faded.
  assert.deepEqual(milestones(d).map((l, i) => l.props.stroke === C.bsClimbMix(teal, gold, [0.25, 0.5, 0.75][i])), pips.slice(0, 3).map((p) => p.props['data-climb-pip-state'] === 'done'));
  // A screen reader hears the strip with the rest.
  const band = textOf(one('data-climb-band')).replace(/\s+/g, ' ');
  assert.equal(climbOf(d).props['aria-label'].split(' · ').slice(0, 5).join(' · '), 'Your goal: 48% of the way, 5.7 lb to go · Next · Halfway · 170.9 lb · 0.2 lb to go');
  assert.match(climbOf(d).props['aria-label'], /· Start 176\.4 · Current 171\.1 · Pace /, 'and the band, after the strip');
  assert.ok(band.length > 0);
}));

test('the strip is for a goal on its way: none when it is reached, before a weigh-in, or for a goal without numbers', () => withPounds(() => {
  const noStrip = (d) => !d.nodes().some((n) => n.props && n.props['data-climb-strip'] != null);
  const reached = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 78 }, weighIns: LOSING } }));
  assert.equal(climbOf(reached).props['data-bs-home-climb'], 'reached');
  assert.ok(noStrip(reached), 'a reached goal has no next milestone');
  assert.doesNotMatch(reached.text, /%/);
  // Reached plants the flag in the teal; every tick is passed, each in the colour of where it stands.
  assert.equal(reached.nodes().find((n) => n.type === 'polygon' && n.props.fillOpacity != null).props.fill, THEME.ACCENT);
  const gold = C.bsClimbGold(THEME);
  assert.deepEqual(milestones(reached).map((l) => l.props.stroke), [0.25, 0.5, 0.75].map((f) => C.bsClimbMix(THEME.ACCENT, gold, f)));
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

// Owner, 2026-11-04: "add more info on this graph. Make it pop more", then of three designs, "go with A and
// include these and clean up the flag section" (A's numbers on the route, with B's band of four figures).
test('the climb\'s numbers on the route: the start at the foot, each milestone\'s weight under its tick, the weight now over the dot', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data, onOpen: () => {} }));
  const one = (k) => d.nodes().find((n) => n.props && n.props[k] != null);
  const all = (k) => d.nodes().filter((n) => n.props && n.props[k] != null);
  assert.equal(textOf(one('data-climb-start')), 'START 176.4', '80 kg, in pounds');
  // 78.75, 77.5 and 76.25 kg: a quarter, a half and three quarters of the way, under their ticks.
  const ms = all('data-climb-ms-weight');
  assert.deepEqual(ms.map((n) => n.props['data-climb-ms-weight']), [25, 50, 75]);
  assert.deepEqual(ms.map(textOf), ['173.6', '170.9', '168.1']);
  ms.forEach((n, i) => {
    const p = C.bsClimbPoint([0.25, 0.5, 0.75][i]);
    assert.equal(n.props.x, p.x, 'under its tick');
    assert.ok(n.props.y > p.y, 'below the route');
  });
  assert.deepEqual(ms.map((n) => n.props.fillOpacity), [1, 0.75, 0.75], 'a met one full, ones ahead softer');
  // The weight now (77.6 kg) in a chip over the dot, its box inside the climb.
  const chip = one('data-climb-now-chip');
  assert.equal(chip.props['data-climb-now-chip'], 'above');
  assert.equal(textOf(chip), '171.1 NOW');
  const rect = d.nodes().find((n) => n.type === 'rect' && n.props.rx === '7.5');
  assert.ok(rect.props.x >= 4 && rect.props.x + rect.props.width <= C.BS_CLIMB_W - 4, 'the chip stays inside the box');
  assert.ok(rect.props.y + 15 < C.bsClimbPoint(0.48).y, 'over the dot');
}));

test('the band under the hill: Start, Current, Pace and the date at that pace, each only when the read has it', () => withPounds(() => {
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
  assert.deepEqual(cells.map((c) => textOf(c)), [`Start176.4`, `Current171.1`, `Pace${pace}`, `Goal≈ ${eta}`]);
  // Each edge in its colour on the run: the start teal, the date gold.
  const gold = C.bsClimbGold(THEME);
  assert.match(cells[0].props.style.boxShadow, /inset 0 2px 0 rgba\(/);
  assert.notEqual(cells[0].props.style.boxShadow, cells[3].props.style.boxShadow);
  assert.ok(gold);
  // Early on, no pace and no date yet: the band holds what there is, and no placeholder for the rest.
  const early = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: [{ d: '2026-10-19', kg: 80 }, { d: '2026-10-22', kg: 79 }] } }));
  const eb = early.nodes().find((n) => n.props && n.props['data-climb-band'] != null);
  assert.equal(eb.props['data-climb-band'], 'start current');
  assert.equal(eb.props.style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.doesNotMatch(early.text, /lb\/wk|—|≈/);
}));

test('the climb\'s light: the sun inside the box, the hill shaded, a lit crest, a glow under the walked line, the dot breathing but not under reduced motion', () => withPounds(() => {
  const data = { primary: 'fat_loss', overall: { title: 'Lean', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
  const one = (k) => d.nodes().find((n) => n.props && n.props[k] != null);
  // The sun fades out before any edge of the box, so it never shows one (the corner by the flag, cleaned up).
  const sun = one('data-climb-sun');
  const [cx, cy, r] = [sun.props.cx, sun.props.cy, sun.props.r].map(Number);
  assert.ok(cx - r >= 0 && cy - r >= 0 && cx + r <= C.BS_CLIMB_W && cy + r <= C.BS_CLIMB_H, 'the sun inside the box');
  assert.equal(cx, C.bsClimbPoint(1).x, 'behind the summit');
  assert.ok(one('data-climb-shade') && one('data-climb-crest'));
  assert.equal(one('data-climb-glow').props.points, C.bsClimbPath(0, 0.48), 'the glow runs under the walked line only');
  const breath = one('data-climb-breath');
  const css = textOf(d.nodes().find((n) => n.type === 'style'));
  assert.match(css, new RegExp(`\\.${breath.props.className}\\{animation:`), 'the dot breathes');
  assert.match(css, new RegExp(`prefers-reduced-motion: reduce\\)\\{\\.${breath.props.className}\\{animation:none\\}`), 'and stands still under reduced motion');
  assert.ok(!/filter/.test(css), 'no filters');
}));

test('near the summit the weight now drops under the dot, clear of the goal\'s corner', () => withPounds(() => {
  // 79.8 → 75.2 of 80 → 75: 96% of the way.
  const near = [{ d: '2026-10-01', kg: 79.8 }, { d: '2026-10-22', kg: 75.2 }];
  const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 75 }, weighIns: near } }));
  const chip = d.nodes().find((n) => n.props && n.props['data-climb-now-chip'] != null);
  assert.equal(chip.props['data-climb-now-chip'], 'below');
  const rect = d.nodes().find((n) => n.type === 'rect' && n.props.rx === '7.5');
  assert.ok(rect.props.y > C.bsClimbPoint(0.96).y, 'under the dot');
  assert.ok(rect.props.x + rect.props.width <= C.BS_CLIMB_W - 4);
}));

test('the route\'s numbers, the band and the breathing are for a goal on its way only', () => withPounds(() => {
  const none = (d) => ['data-climb-band', 'data-climb-now-chip', 'data-climb-start', 'data-climb-ms-weight', 'data-climb-breath', 'data-climb-glow'].filter((k) => d.nodes().some((n) => n.props && n.props[k] != null));
  const reached = drive(D.BSHomeClimbView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: { unit: 'kg', start: 80, target: 78 }, weighIns: LOSING } }));
  assert.deepEqual(none(reached), [], 'reached');
  assert.ok(reached.nodes().some((n) => n.props && n.props['data-climb-sun'] != null), 'the light stays on a reached goal');
  for (const data of [{ primary: 'fat_loss', overall: { unit: 'lb', target: 165 }, weighIns: [] }, { primary: 'race', overall: {}, weighIns: [] }, { primary: '', overall: {}, weighIns: [] }]) {
    const d = drive(D.BSHomeClimbView, GOAL_PROPS({ data }));
    assert.deepEqual(none(d), [], climbOf(d).props['data-bs-home-climb']);
  }
  const loading = drive(D.BSHomeClimbView, GOAL_PROPS({ data: null }));
  assert.deepEqual(none(loading), []);
  assert.ok(!loading.nodes().some((n) => n.props && (n.props['data-climb-sun'] != null || n.props['data-climb-crest'] != null)), 'still reading: no light');
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
  // The words once (they are the big line), and no "Since" date with no weight on show (#2583).
  assert.equal(race.text.split('“Run a race”').length - 1, 1, 'the goal\'s words twice');
  assert.doesNotMatch(race.text, /Since/);
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
  // Still reading (or a read that failed): the ridge alone, no words, no milestones, no link.
  const loading = drive(D.BSHomeClimbView, GOAL_PROPS({ data: null }));
  assert.equal(climbOf(loading).props['data-bs-home-climb'], 'loading');
  assert.equal(loading.text, '');
  assert.equal(climbLinks(loading).length, 0);
  assert.equal(milestones(loading).length, 0);
  // Its ridge is hidden from a screen reader, never an unnamed graphic (Codex P2 on #2583); every
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

test('Shape Radio stands above the deck on its own line; the deck hands its own theme to the climb and the week', () => {
  // Owner, 2026-11-04: "take the shape radio box out of the new climb box above it so its on its own line".
  const seen = [];
  const prevCtx = globalThis.BSContext;
  globalThis.BSContext = { Provider: function Provider() {} };
  try {
    const d = drive(D.BSHomeDeck, { radio: { type: 'div', key: 'radio', props: { 'data-radio': '' } }, children: [{ type: 'div', key: 'climb', props: { 'data-climb': '' } }] });
    const nodes = d.nodes();
    const radioAt = nodes.findIndex((n) => n.props && n.props['data-radio'] != null);
    const providerAt = nodes.findIndex((n) => n.type === globalThis.BSContext.Provider);
    assert.ok(radioAt >= 0 && providerAt > radioAt, 'Shape Radio is drawn first, before the deck');
    // Its own line, its edges on the deck's: the box's own 8px and 2px more.
    const line = nodes.find((n) => n.props && n.props['data-bs-home-radio'] != null);
    assert.equal(line.props.style.margin, '0 2px');
    const provider = nodes[providerAt];
    seen.push(provider.props.value);
    const band = nodes.find((n) => n.props && n.props['data-bs-home-deck'] != null);
    assert.equal(band.props.style.margin, '10px 10px 0', 'the deck sits 10px under the radio, 10px in from the page');
    // The glass's teal edge is drawn first; the band holds the climb, and no longer the radio.
    const kids = [].concat(band.props.children).flat().filter(Boolean).filter((k) => !(typeof k.type === 'function' && k.type.name === 'BSGlassEdge'));
    assert.ok(kids[0].props['data-climb'] != null, 'the climb leads the deck');
    assert.ok(!kids.some((k) => k.props && k.props['data-radio'] != null), 'Shape Radio is inside the deck again');
    // Glass in the paper's own colour (owner, 2026-11-04: "make sure the glassy look matches the print color").
    assert.ok(String(band.props.style.background).endsWith(`, ${seen[0].PAPER}`), 'the band is glass over the deck theme\'s paper');
    assert.equal(seen[0].PAPER, THEME.PAPER, 'the deck is the paper\'s own colour, not a dark band');
    assert.equal(seen[0].INK, THEME.INK, 'its words are the paper\'s own ink');
    // With no radio (a coach's calendar deck and the like), the deck keeps its own place.
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
  // Each coach is offered once, with what is unread on their Message, said to a screen reader too (#2583).
  assert.deepEqual(messages(d).map((b) => [b.props['data-team-message'], textOf(b), b.props['aria-label']]), [
    ['trainer', 'Message', 'Message Jordan Chen'],
    ['nutritionist', 'Message · 2 new', 'Message Maya Patel, 2 new'],
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

// Codex P2 on #2583: a meal logged from Team counts in its food left: the meal logger hands its write to
// onLogged, and Home reads the day again once it lands (and a moment later, as Home's other loggers do).
test("a meal logged from Team is counted in Team's food left once it is written", () => {
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  // The meal logger is its own module since its redesign (owner, 2026-11-04: B "for logging meals and Filed").
  const logger = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSMealLog.jsx'), 'utf8');
  const flow = logger.slice(logger.indexOf('export function BSLogMealFlow('), logger.indexOf('export function BSLogMealFlow(') + 40000);
  assert.notEqual(logger.indexOf('export function BSLogMealFlow('), -1, 'the meal logger is BSMealLog.jsx\'s');
  assert.match(flow, /write = r;[\s\S]{0,400}onLogged\(write\);/, 'the logger hands its write to onLogged');
  assert.match(client, /onLogged=\{\(write\) => \{\s+if \(loggingMealId\) setMealLogged\(\(prev\) => \(\{ \.\.\.prev, \[loggingMealId\]: true \}\)\);[\s\S]{0,300}if \(write && typeof write\.then === 'function'\) write\.then\(\(\) => \{ refreshAnalytics\(\); bsScoreDirty\(\); \}, \(\) => \{\}\);\s+setTimeout\(refreshAnalytics, 700\);/);
});

// Codex P2 on #2583: a member who pays two nutritionists sees the day's meals under the one who wrote the plan.
test("the day's meals go on the card of the nutritionist who wrote the plan, with their Message", () => {
  const NIA = { role: 'nutritionist', name: 'Nia Noor', conversationId: 'c-n', providerId: 4, photo: null };
  const ev = listen('shape:openConversation');
  try {
    const d = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, NIA], mealCoachId: 4 }));
    const card = coachBlock(d, 'nutritionist');
    assert.match(textOf(card), /^Nia Noor/, "Nia wrote the meal plan, so Nia's card carries the meals, though Maya is the earlier");
    assert.match(textOf(coachBlock(d, 'extra')), /^Maya Patel/, 'Maya is the second nutritionist\'s row');
    const msg = d.nodes().find((n) => n.type === 'button' && n.props['data-team-message'] && n.props['aria-label'] === 'Message Nia Noor' && textOf(card).includes(textOf(n)));
    assert.ok(msg, "the meals' Message is Nia's");
    msg.props.onClick();
    assert.deepEqual(ev.got, [{ conversationId: 'c-n', name: 'Nia Noor' }]);
  } finally { ev.off(); }
  // No author named: the first nutritionist, as before.
  const NIA2 = { role: 'nutritionist', name: 'Nia Noor', conversationId: 'c-n', providerId: 4, photo: null };
  const unnamed = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, NIA2], mealCoachId: null }));
  assert.match(textOf(coachBlock(unnamed, 'nutritionist')), /^Maya Patel[\s\S]*kcal left/);
  // A plan by a nutritionist no longer paid (Codex P2 on #2583): Fuel left today on no coach's card, and the
  // paid nutritionists keep only their own Message, never those meals.
  const former = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN, MAYA, NIA2], mealCoachId: 99 }));
  assert.match(textOf(coachBlock(former, 'none-fuel')), /kcal left/);
  assert.doesNotMatch(textOf(coachBlock(former, 'nutritionist')), /kcal left|Log /);
  assert.ok(former.nodes().some((n) => n.type === 'button' && /^Message Maya Patel(, |$)/.test(n.props['aria-label'] || '')), "Maya's Message stays hers");
  const fuelCard = coachBlock(former, 'none-fuel');
  assert.ok(!former.nodes().some((n) => n.type === 'button' && n.props['data-team-message'] && textOf(fuelCard).includes(textOf(n)) && /Maya|Nia/.test(n.props['aria-label'] || '')), 'no coach\'s Message on those meals');
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /mealCoachId=\{sample \? 'sample-nutritionist' : \(\(livePlan && livePlan\.meals && livePlan\.meals\.coachId\) \?\? null\)\}/);
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

// Owner, 2026-11-04: "ok add it", of the engine's move back on Home as one row: the morning panel's first,
// only when the engine leads, "Your move" in the lever's colour, the move and its reason, the pledge a square.
test('Your move: the engine\'s one move, its reason and its pledge, first in the morning panel and only when it leads', () => {
  let went = 0;
  const d = drive(S.BSHomeMoveRow, { head: 'Get to bed earlier tonight.', sub: 'Under 6h a night this week', cta: ["I'll get to bed earlier →", () => { went += 1; }], color: '#4a7bd0' });
  assert.match(d.text, /^Your moveGet to bed earlier tonight\.Under 6h a night this week$/);
  const go = d.nodes().find((n) => n.type === 'button' && n.props['data-bs-home-move-go'] != null);
  assert.equal(go.props['aria-label'], "I'll get to bed earlier", 'the square says the pledge');
  assert.equal(go.props.style.width, 44);
  go.props.onClick();
  assert.equal(went, 1);
  assert.equal(drive(S.BSHomeMoveRow, { head: '', cta: null }).nodes().length, 0, 'no move, no row');
  // Home draws it first in the panel, and only for the engine's lead (the plan's own leads are Team's).
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(src, /<BSMorningPanel>\n(\s+\{\/\*[\s\S]*?\*\/\}\n)?\s+\{todayDirective && todayDirective\.engine \? \(\n\s+<BSHomeMoveRow head=\{todayDirective\.head\} sub=\{todayDirective\.sub\} cta=\{todayDirective\.cta\} color=\{todayDirective\.c\} \/>/);
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

test('Team on another day: its date, its session as a preview, its meals in order, nothing to log and no food left', () => {
  const started = [];
  const d = drive(T.BSHomeTeamView, TEAM({
    today: false, dayLabel: 'Sat 12', meal: null, fuel: null,
    workout: { ...TEAM().workout, title: 'Long run', time: '8:00 AM', onStart: () => started.push(1) },
    dayMeals: [{ slot: 'Breakfast', time: '7:00 AM', title: 'Oats + whey' }, { slot: 'Lunch', time: '12:40 PM', title: 'Chicken bowl' }],
  }));
  assert.match(d.text, /Sat 12 · 2 coaches/);
  const trainer = textOf(coachBlock(d, 'trainer'));
  assert.match(trainer, /Trainer · Sat 12/, 'the day, not Today’s call');
  assert.doesNotMatch(d.text, /Today’s call/);
  assert.match(trainer, /Long run/);
  const start = d.nodes().find((n) => n.type === 'button' && n.props['data-team-start'] != null);
  assert.equal(textOf(start), 'Preview →', 'a preview, not I’ll train today');
  start.props.onClick();
  assert.equal(started.length, 1);
  const meals = d.nodes().filter((n) => n.props && n.props['data-team-day-meal'] != null).map((n) => textOf(n));
  assert.deepEqual(meals, ['Breakfast7:00 AMOats + whey', 'Lunch12:40 PMChicken bowl'], 'the day’s meals, in order');
  assert.ok(!d.nodes().some((n) => n.props && n.props['data-team-log'] != null), 'nothing to log on another day');
  assert.ok(!d.nodes().some((n) => n.props && n.props['data-team-fuel'] != null), 'no food left on another day');
  assert.doesNotMatch(d.text, /kcal left|Fuel left today/);
});

test('Team on another day with no coach and no session: the date heads it, and the day says so', () => {
  const d = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], today: false, dayLabel: 'Sun 13', workout: null, meal: null, fuel: null,
    dayMeals: [{ slot: 'Dinner', time: '7:00 PM', title: 'Salmon' }], showFindCoach: true, onFindCoach: () => {} }));
  assert.match(d.text, /^Sun 13\./, 'the day in place of Today');
  assert.doesNotMatch(d.text, /^Today/);
  assert.match(d.text, /Meals · Sun 13/);
  assert.doesNotMatch(d.text, /Fuel left today/);
  const withSession = drive(T.BSHomeTeamView, TEAM({ coaches: [JORDAN], notes: [], today: false, dayLabel: 'Sun 13', workout: null, meal: null, fuel: null }));
  assert.match(withSession.text, /No session · Sun 13/);
  const orphan = drive(T.BSHomeTeamView, TEAM({ coaches: [], notes: [], today: false, dayLabel: 'Sun 13', workout: { ...TEAM().workout, coachId: null }, meal: null, fuel: null }));
  assert.match(orphan.text, /Workout · Sun 13/);
});

test('Home holds the picked day: the strip hands it up, and Team reads that day\'s session and meals', () => {
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /const \[pickedDay, setPickedDay\] = useStateBSC\(null\);/);
  assert.match(client, /picked=\{pickedDay\} onPick=\{setPickedDay\} \/>/, 'the strip is Home’s');
  assert.match(client, /const pickWorkout = pickToday \? selWorkout : \(liveWeek \? liveWeek\.workoutByIdx\[pickIdx\] : bsClientWorkoutForDay\(pickIdx\)\);/);
  assert.match(client, /const pickMeals = pickToday \? selMeals : mealsForIdx\(pickIdx\);/);
  assert.match(client, /dayLabel=\{`\$\{_dowShort\(pickDate\)\} \$\{pickDate\.getDate\(\)\}`\} today=\{pickToday\}/, 'Team’s date is the picked one');
  assert.match(client, /fuel=\{pickToday \? fuel : null\}/, 'the food left is today’s alone');
  // The morning panel stays today's: Your move reads selIdx, which is today.
  assert.match(client, /const selIdx = todayIdx;/);
});
