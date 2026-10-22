// tests/home-sections.test.mjs
//
// HOME, PART 2 (owner, 2026-10-22, off the Home mockup). Home says what only Home can: Your goal,
// Week so far and From your coaches. Two layers, each through the shipping code:
//   · the reads (services/homeWeek.mjs): the week's days, the week so far, the goal's weight read,
//     the next session and the coaches;
//   · the sections (broadsheet/BSHomeSections.jsx), drawn from known data through their views.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { drive, SHIM, ROOT, THEME } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { IntlMessageFormat } from 'intl-messageformat';
import * as H from '../mobile-app/src/services/homeWeek.mjs';

// The app's translator with no catalog: each string is its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };

const S = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeSections.jsx'), {
  registry: new Map([['react', { ...SHIM, useContext: (c) => c._currentValue }], ['react-dom', { createPortal: (n) => n }]]),
});

const LB = 0.45359237;
// The harness theme with the real kilogram → pound display the app's imperial theme has.
const withPounds = (fn) => {
  const prev = globalThis.useBS;
  globalThis.useBS = () => new Proxy(THEME, { get: (t, k) => (k === 'kgToDisplay' ? (kg) => kg / LB : t[k]) });
  try { return fn(); } finally { globalThis.useBS = prev; }
};
const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;

// ── The reads ────────────────────────────────────────────────────────────────

test('the week so far runs Monday to today, across a month too', () => {
  assert.deepEqual(H.bsHwWeekDays('2026-10-22'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'], 'a Thursday');
  assert.deepEqual(H.bsHwWeekDays('2026-10-19'), ['2026-10-19'], 'a Monday is one day');
  assert.equal(H.bsHwWeekDays('2026-10-25').length, 7, 'a Sunday is the whole week');
  assert.equal(H.bsHwWeekDays('2026-11-01')[0], '2026-10-26', 'the Monday before a month turns');
  assert.deepEqual(H.bsHwWeekDays('not a day'), []);
});

test('the week so far counts only this week, and a day of zero is a day with nothing logged', () => {
  const series = {
    calories: [{ date: '2026-10-18', value: 2000 }, { date: '2026-10-19', value: 1800 }, { date: '2026-10-20', value: 0 }, { date: '2026-10-21', value: 2100 }],
    protein: [{ date: '2026-10-18', value: 50 }, { date: '2026-10-19', value: 120 }, { date: '2026-10-21', value: 140 }],
    steps: [{ date: '2026-10-22', value: 8000 }],
  };
  const answered = (iso) => ['2026-10-18', '2026-10-19', '2026-10-20'].includes(iso);
  const w = H.bsHomeWeekSoFar({ todayIso: '2026-10-22', series, workoutsDone: 2, workoutsPlanned: 4, proteinTarget: 140, stepGoal: 8000, answered });
  assert.equal(w.days, 4);
  assert.deepEqual(w.sessions, { done: 2, planned: 4 });
  assert.equal(w.daysLogged, 2, 'Sunday is last week and a zero is not a log');
  assert.deepEqual(w.protein, { avg: 130, target: 140 }, 'the average over the days that have a reading');
  assert.deepEqual(w.steps, { avg: 8000, goal: 8000 });
  assert.equal(w.mornings, 2, 'by the card\'s own rule, this week only');
  // Nothing read yet: each figure says it does not know rather than a zero.
  const none = H.bsHomeWeekSoFar({ todayIso: '2026-10-22', workoutsPlanned: 0 });
  assert.equal(none.daysLogged, null);
  assert.equal(none.protein.avg, null);
  assert.equal(none.mornings, null);
  assert.deepEqual(none.sessions, { done: null, planned: null }, 'no plan this week is no "of"');
  assert.equal(H.bsHwPct(3, 4), 75);
  assert.equal(H.bsHwPct(9, 4), 100);
  assert.equal(H.bsHwPct(3, null), undefined);
});

const LOSING = [
  { d: '2026-08-27', kg: 80.0 }, { d: '2026-09-24', kg: 79.0 }, { d: '2026-10-01', kg: 78.8 },
  { d: '2026-10-08', kg: 78.4 }, { d: '2026-10-15', kg: 78.0 }, { d: '2026-10-22', kg: 77.6 },
];

test('the goal read: where the weigh-ins stand, the pace of the last 28 days, and when it lands', () => {
  const r = H.bsHomeGoalRead({ weighIns: LOSING.slice().reverse(), startKg: 80, targetKg: 75, todayIso: '2026-10-22' });
  assert.equal(r.nowKg, 77.6, 'the latest weigh-in, whatever order they came in');
  assert.equal(r.sinceIso, '2026-08-27');
  assert.equal(r.changeKg, -2.4);
  assert.equal(r.pct, 48);
  assert.equal(r.toGoKg, 2.6);
  assert.equal(r.reached, false);
  assert.equal(r.paceKgWk, -0.36, 'a least-squares line over the last 28 days, a week of it');
  assert.equal(r.etaIso, '2026-12-12');
  assert.equal(r.trend.length, 6, 'the last 56 days');
});

test('the goal read says nothing it cannot back', () => {
  // Reached: no "to go" and no date.
  const done = H.bsHomeGoalRead({ weighIns: LOSING, startKg: 80, targetKg: 78, todayIso: '2026-10-22' });
  assert.equal(done.reached, true);
  assert.equal(done.toGoKg, null);
  assert.equal(done.etaIso, null);
  assert.equal(done.pct, 100);
  // Moving away from the target lately: a pace, but no date.
  const away = H.bsHomeGoalRead({ weighIns: LOSING, startKg: 76, targetKg: 82, todayIso: '2026-10-22' });
  assert.equal(away.pct, 27);
  assert.ok(away.paceKgWk < 0);
  assert.equal(away.etaIso, null);
  // Behind the start: none of the way, never a negative share.
  assert.equal(H.bsHomeGoalRead({ weighIns: LOSING, startKg: 80, targetKg: 85, todayIso: '2026-10-22' }).pct, 0);
  // A gain goal on its way up.
  const gain = H.bsHomeGoalRead({ weighIns: [{ d: '2026-10-01', kg: 60 }, { d: '2026-10-22', kg: 61.2 }], startKg: 60, targetKg: 65, todayIso: '2026-10-22' });
  assert.equal(gain.pct, 24);
  assert.ok(gain.paceKgWk > 0 && gain.etaIso > '2026-10-22');
  // Two weigh-ins three days apart are no pace.
  const short = H.bsHomeGoalRead({ weighIns: [{ d: '2026-10-19', kg: 80 }, { d: '2026-10-22', kg: 79 }], targetKg: 75, todayIso: '2026-10-22' });
  assert.equal(short.paceKgWk, null);
  assert.equal(short.etaIso, null);
  // No start: the first weigh-in is the start. A blank target is none.
  const open = H.bsHomeGoalRead({ weighIns: LOSING, startKg: null, targetKg: '', todayIso: '2026-10-22' });
  assert.equal(open.startKg, 80);
  assert.equal(open.targetKg, null);
  assert.equal(open.pct, null);
  assert.equal(open.toGoKg, null);
  // A pace that would take more than two years is no date.
  const slow = H.bsHomeGoalRead({ weighIns: [{ d: '2026-09-24', kg: 100 }, { d: '2026-10-22', kg: 99.8 }], targetKg: 60, todayIso: '2026-10-22' });
  assert.equal(slow.etaIso, null);
  assert.deepEqual(H.bsHomeGoalRead({ weighIns: [], targetKg: 75, todayIso: '2026-10-22' }), { nowKg: null, targetKg: 75 });
});

test('the preview\'s sample weigh-ins are moved to end today', () => {
  const moved = H.bsHwRedate([{ d: '2026-02-15', kg: 80.4 }, { d: '2026-06-13', kg: 79.2 }], '2026-10-22');
  assert.equal(moved[1].d, '2026-10-22');
  assert.equal(H.bsHwDaysBetween(moved[0].d, moved[1].d), H.bsHwDaysBetween('2026-02-15', '2026-06-13'), 'the gaps between them kept');
  assert.equal(moved[0].kg, 80.4);
  assert.deepEqual(H.bsHwRedate([], '2026-10-22'), []);
});

test('the next session is the soonest confirmed one still ahead, as the client', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const list = [
    { id: 1, role: 'client', status: 'confirmed', scheduledAt: '2026-10-21T09:00:00Z' },
    { id: 2, role: 'client', status: 'cancelled', scheduledAt: '2026-10-23T09:00:00Z' },
    { id: 3, role: 'coach', status: 'confirmed', scheduledAt: '2026-10-23T10:00:00Z' },
    { id: 4, role: 'client', status: 'confirmed', scheduledAt: '2026-10-25T09:00:00Z' },
    { id: 5, role: 'client', status: 'confirmed', scheduledAt: '2026-10-24T09:00:00Z' },
    { id: 6, role: 'client', status: 'requested', scheduledAt: '2026-10-23T08:00:00Z' },
  ];
  assert.equal(H.bsHomeNextSession(list, now).id, 5);
  assert.equal(H.bsHomeNextSession([], now), null);
  assert.equal(H.bsHomeNextSession(null, now), null);
});

test('the coaches are the ones the plan read says the member pays, trainers first', () => {
  const plan = {
    meals: { coaching: { coaches: [{ name: 'Dr. Maya Patel', conversationId: 'c-m' }] } },
    training: { coaching: { coaches: [{ name: 'Jordan Chen', conversationId: 'c-j' }, { name: null }] } },
  };
  assert.deepEqual(H.bsHomeCoachesOf(plan), [
    { role: 'trainer', name: 'Jordan Chen', conversationId: 'c-j' },
    { role: 'nutritionist', name: 'Dr. Maya Patel', conversationId: 'c-m' },
  ]);
  assert.deepEqual(H.bsHomeCoachesOf({ training: { coaching: null }, meals: {} }), [], 'no coach, or a read that failed');
  assert.deepEqual(H.bsHomeCoachesOf(null), []);
});

// ── The sections ─────────────────────────────────────────────────────────────

const GOAL_PROPS = (over = {}) => ({
  docKg: (v, o) => (v == null || v === '' ? null : (/^lb/i.test(String((o && o.unit) || 'kg')) ? Number(v) * LB : Number(v))),
  isWeightGoal: (id) => ['fat_loss', 'muscle', ''].includes(id || ''),
  goalWords: (id) => ({ fat_loss: 'Lose fat', race: 'Run a race' })[id] || id,
  todayIso: '2026-10-22',
  ...over,
});

test('Your goal: the words, where the weigh-ins stand in the member\'s units, the line, and when it lands', () => withPounds(() => {
  const opened = [];
  const data = { primary: 'fat_loss', overall: { title: 'Lean, and quick on the bike again', unit: 'kg', start: 80, target: 75 }, weighIns: LOSING };
  const d = drive(S.BSHomeGoalView, GOAL_PROPS({ data, tour: 'hero-goal', onOpen: () => opened.push(1) }));
  const text = d.text;
  assert.match(text, /“Lean, and quick on the bike again”/, 'the goal in the member\'s own words');
  assert.match(text, /171\.1/, '77.6 kg reads in pounds');
  assert.match(text, /165\.3 lb/, 'the target');
  assert.match(text, /−5\.3/, 'the change since the start, in pounds');
  assert.match(text, /−0\.8/, 'the pace in pounds a week');
  assert.match(text, /5\.7/, 'what is left');
  assert.match(text, /At this rate, around/);
  const title = d.nodes().find(fn('BSFocusTitle'));
  assert.equal(title.props.title, 'Your goal');
  assert.match(title.props.kicker, /^Since /);
  const line = d.nodes().find(fn('BSHsTrend'));
  assert.equal(line.props.points.length, 6, 'the line is the last 56 days of weigh-ins');
  assert.match(line.props.label, /^Weigh-ins from 176\.4 to 171\.1 lb$/, 'and is labelled');
  assert.equal(d.nodes()[0].props['data-tour'], 'hero-goal', 'the tour\'s goal step anchors here');
  const weighIn = d.nodes().find((n) => fn('BSHsAction')(n) && n.props.label === 'Weigh in →');
  weighIn.props.onClick();
  assert.equal(opened.length, 1, 'Weigh in opens the goal page');
}));

test('Your goal says only what it can: words alone, no weigh-ins yet, or nothing set', () => withPounds(() => {
  // A goal that is not about weight, with no weight target: its words, and the door to it.
  const race = drive(S.BSHomeGoalView, GOAL_PROPS({ data: { primary: 'race', overall: {}, weighIns: LOSING } }));
  assert.match(race.text, /“Run a race”/);
  assert.doesNotMatch(race.text, /171\.1|lb now/, 'no weight read on a race goal');
  assert.ok(race.nodes().some((n) => fn('BSHsAction')(n) && n.props.label === 'Your goal →'));
  // The same goal with a weight target set reads the weigh-ins again.
  const raceLb = drive(S.BSHomeGoalView, GOAL_PROPS({ data: { primary: 'race', overall: { unit: 'lb', target: 165 }, weighIns: LOSING } }));
  assert.match(raceLb.text, /171\.1/);
  assert.match(raceLb.text, /165\.0 lb/, 'a pound target reads back as typed');
  // A weight goal before the first weigh-in.
  const fresh = drive(S.BSHomeGoalView, GOAL_PROPS({ data: { primary: 'fat_loss', overall: {}, weighIns: [] } }));
  assert.match(fresh.text, /“Lose fat”/);
  assert.match(fresh.text, /No weigh-ins yet\./);
  // Nothing set at all.
  const none = drive(S.BSHomeGoalView, GOAL_PROPS({ data: { primary: '', overall: {}, weighIns: [] } }));
  assert.match(none.text, /Set a goal/);
  assert.ok(none.nodes().some((n) => fn('BSHsAction')(n) && n.props.label === 'Set your goal →'), 'nothing set: the door sets one');
  // No goal yet but weigh-ins logged: it reads as a weight goal, as on the Goal page.
  const weighed = drive(S.BSHomeGoalView, GOAL_PROPS({ data: { primary: '', overall: {}, weighIns: LOSING } }));
  assert.match(weighed.text, /171\.1/);
  assert.ok(weighed.nodes().some((n) => fn('BSHsAction')(n) && n.props.label === 'Weigh in →'));
}));

test('Week so far: a row for each figure, each opening where it lives, and no check-ins row with Check-ins off', () => {
  const doors = [];
  const door = (k) => () => doors.push(k);
  const w = { days: 4, sessions: { done: 2, planned: 4 }, daysLogged: 3, protein: { avg: 121, target: 140 }, steps: { avg: 6980, goal: 8000 }, mornings: 3 };
  const props = { w, onTrain: door('train'), onEat: door('eat'), onProgress: door('progress'), onSteps: door('steps'), onMornings: door('mornings') };
  const d = drive(S.BSHomeWeekView, { ...props, checkinsOn: true });
  const rows = d.nodes().filter(fn('BSFocusLeader'));
  assert.deepEqual(rows.map((r) => [r.props.label, r.props.value, r.props.note]), [
    ['Sessions', '2', 'of 4'],
    ['Food logged', '3', 'of 4 days'],
    ['Avg protein', '121', 'of 140 g'],
    ['Avg steps', '6,980', 'of 8,000'],
    ['Check-ins', '3', 'of 4'],
  ]);
  assert.deepEqual(rows.map((r) => r.props.pct), [50, 75, 86, 87, 75]);
  rows.forEach((r) => r.props.onOpen());
  assert.deepEqual(doors, ['train', 'eat', 'progress', 'steps', 'mornings']);
  const title = d.nodes().find(fn('BSFocusTitle'));
  assert.equal(title.props.title, 'Week so far');
  const off = drive(S.BSHomeWeekView, { ...props, checkinsOn: false });
  assert.equal(off.nodes().filter(fn('BSFocusLeader')).length, 4, 'Check-ins off: no mornings row');
  // Nothing read: a dash, never a zero; no plan: "this week".
  const unknown = drive(S.BSHomeWeekView, { ...props, w: { days: 4, sessions: { done: null, planned: null }, daysLogged: null, protein: { avg: null, target: null }, steps: { avg: null, goal: 8000 }, mornings: null } });
  const u = unknown.nodes().filter(fn('BSFocusLeader'));
  assert.deepEqual(u.map((r) => r.props.value), ['—', '—', '—', '—', '—']);
  assert.equal(u[0].props.note, 'this week');
  assert.equal(u[2].props.unit, null, 'no "g" after a dash');
});

test('From your coaches: their notes, a message door to each with what is unread, and the next session', () => {
  assert.equal(drive(S.BSHomeCoachesView, {}).nodes().length, 0, 'nothing to say draws nothing');
  const sent = [];
  const listen = (e) => sent.push(e.detail);
  globalThis.addEventListener?.('shape:openConversation', listen);
  const days = [];
  const next = { at: Date.parse('2026-10-24T13:00:00Z'), providerName: 'Jordan Chen', providerRole: 'trainer' };
  const d = drive(S.BSHomeCoachesView, {
    notes: [{ role: 'trainer', text: 'Keep every lift while the weight comes off.', who: 'Jordan Chen' }],
    coaches: [{ role: 'trainer', name: 'Jordan Chen', conversationId: 'c-j' }, { role: 'nutritionist', name: 'Dr. Maya Patel', conversationId: 'c-m' }],
    unread: { 'dm:c-m': 2 },
    next,
    onCalendar: (day) => days.push(day),
  });
  assert.match(d.text, /“Keep every lift while the weight comes off\.”/);
  assert.match(d.text, /— Jordan Chen · Trainer/);
  const links = d.nodes().filter(fn('BSFocusLink'));
  assert.deepEqual(links.map((l) => [l.props.label, l.props.tag.replace(/,.*·/, ' ·')]), [
    ['Message Jordan Chen', 'Trainer'],
    ['Message Dr. Maya Patel', '2 new'],
    ['Next session', 'Sat · Jordan Chen'],
  ]);
  links[1].props.onOpen();
  links[2].props.onOpen();
  assert.equal(days.length, 1);
  assert.equal(days[0].getTime(), next.at, 'the calendar opens on the session\'s day');
  if (globalThis.addEventListener) {
    assert.deepEqual(sent, [{ conversationId: 'c-m', name: 'Dr. Maya Patel' }], 'the message door opens that coach\'s thread');
    globalThis.removeEventListener('shape:openConversation', listen);
  }
});
