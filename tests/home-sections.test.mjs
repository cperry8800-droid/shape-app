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
import { readFileSync } from 'node:fs';
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

test('the sessions planned this week are the ones Train lays on this week (Codex P2 on #2424)', () => {
  const now = new Date(2026, 9, 22, 9); // Thursday 22 October 2026
  const plan = (workouts) => ({ training: { hasPlan: true, workouts } });
  assert.equal(H.bsHomeSessionsPlanned(plan([
    { title: 'A', scheduledDate: '2026-10-19' },
    { title: 'Next week', scheduledDate: '2026-10-27' },
    { title: 'Last week', scheduledDate: '2026-10-12' },
  ]), now), 1, 'a row dated in another week is not this week\'s');
  assert.equal(H.bsHomeSessionsPlanned(plan([{ title: 'Repeat', repeatDow: [0, 2, 4] }]), now), 3, 'a weekly repeat counts each of its days');
  assert.equal(H.bsHomeSessionsPlanned(plan([{ title: 'Undated' }, { title: 'Undated 2' }]), now), 2);
  assert.equal(H.bsHomeSessionsPlanned({ training: { hasPlan: false, workouts: [] } }, now), null, 'no training plan');
  assert.equal(H.bsHomeSessionsPlanned(null, now), null);
});

test('days trained is a number only from a read that answered (Codex P2 on #2424)', () => {
  assert.equal(H.bsHwTrainedOf({ workouts: 2, ok: true }), 2);
  assert.equal(H.bsHwTrainedOf({ workouts: 0, ok: true }), 0, 'a real zero');
  assert.equal(H.bsHwTrainedOf({ workouts: 0, checkin: false, habits: 0, ok: false }), null, 'the fallback of a failed read');
  assert.equal(H.bsHwTrainedOf({ workouts: 0 }), null, 'no word on success is no number');
  assert.equal(H.bsHwTrainedOf(null), null);
});

test('a logged activity is bounded and dated by the member\'s own week, not UTC\'s (Codex P2 on #2424)', () => {
  const tz = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Tokyo';
    assert.deepEqual(H.bsHwWeekWindow('2026-10-19'), { from: '2026-10-18T15:00:00.000Z', to: '2026-10-25T15:00:00.000Z' });
    assert.equal(H.bsHwLocalDayOf('2026-10-18T23:00:00Z'), '2026-10-19', 'Monday 08:00 in Tokyo is Monday');
    process.env.TZ = 'America/Los_Angeles';
    assert.deepEqual(H.bsHwWeekWindow('2026-10-19'), { from: '2026-10-19T07:00:00.000Z', to: '2026-10-26T07:00:00.000Z' });
    assert.equal(H.bsHwLocalDayOf('2026-10-19T03:00:00Z'), '2026-10-18', 'Sunday 20:00 in Los Angeles is last week');
  } finally {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  }
  assert.equal(H.bsHwWeekWindow('not a day'), null, 'no week: the UTC read as before');
  assert.equal(H.bsHwWeekWindow(undefined), null);
  assert.equal(H.bsHwLocalDayOf('nonsense'), null);
});

test('the goal keeps an older document\'s weigh-ins when the table has none (Codex P2 on #2424)', () => {
  const doc = { weighIns: [{ d: '2026-10-01', kg: 80 }] };
  const listed = [{ d: '2026-10-20', kg: 79 }];
  assert.equal(H.bsHwGoalWeighIns(listed, doc), listed, 'the table wins when it has rows');
  assert.equal(H.bsHwGoalWeighIns([], doc), doc.weighIns);
  assert.equal(H.bsHwGoalWeighIns(null, doc), doc.weighIns, 'a failed table read too');
  assert.deepEqual(H.bsHwGoalWeighIns(null, {}), []);
  assert.deepEqual(H.bsHwGoalWeighIns(undefined, null), []);
});

test('a goal read that failed leaves the goal section unresolved, never "Set a goal" (Codex P2 on #2424)', () => {
  assert.equal(H.bsHwGoalData(null, null, null), null, 'both reads failed');
  assert.equal(H.bsHwGoalData(null, { goal: 'Lose fat' }, LOSING), null, 'the document is the only source of the title and target');
  assert.deepEqual(H.bsHwGoalData({}, {}, []), { primary: '', overall: {}, weighIns: [] }, 'nothing stored is a real "no goal"');
  const d = H.bsHwGoalData({ overall: { title: 'Lean', target: 75, weighIns: [{ d: '2026-10-01', kg: 80 }] } }, { goal: 'Lose fat' }, null);
  assert.equal(d.primary, 'Lose fat', 'the identity mirror fills in the goal\'s words');
  assert.equal(d.overall.title, 'Lean');
  assert.deepEqual(d.weighIns, [{ d: '2026-10-01', kg: 80 }], 'a failed table read falls back to the document');
  assert.equal(H.bsHwGoalData({ primaryGoal: 'race' }, { goal: 'Lose fat' }, LOSING).primary, 'race', 'the document\'s own goal first');
});

test('a progress read that did not answer is no series, so the week says "—" (Codex P2 on #2424)', () => {
  const series = { calories: [] };
  assert.equal(H.bsHwSeriesOf({ series }), series);
  assert.equal(H.bsHwSeriesOf(null), null, 'ShapeProgress.progress resolves null on a failed request');
  assert.equal(H.bsHwSeriesOf({ error: 'x' }), null);
  assert.equal(H.bsHwSeriesOf({ ok: true, snapshotsRead: false, series }), null, 'the route\'s history read failed: its empty series are not "nothing logged"');
  assert.equal(H.bsHwSeriesOf({ ok: true, snapshotsRead: true, series }), series);
  // The route says so: the snapshot read's error is kept and answered as snapshotsRead.
  const route = readFileSync(join(ROOT, 'src', 'app', 'api', 'client', 'progress', 'route.ts'), 'utf8');
  assert.match(route, /const \{ data: snapRows, error: snapError \} = await supabase\n\s+\.from\('daily_health_snapshot'\)/);
  assert.match(route, /snapshotsRead: !snapError,/);
  assert.equal(H.bsHomeWeekSoFar({ todayIso: '2026-10-22', series: H.bsHwSeriesOf(null) }).daysLogged, null);
});

test('the next session is the soonest confirmed one still ahead, as the client, with a coach they pay', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const coaches = [{ role: 'trainer', name: 'Jordan Chen', providerId: 7 }, { role: 'nutritionist', name: 'Dr. Maya Patel', providerId: 3 }];
  const paid = { providerRole: 'trainer', providerId: 7 };
  const list = [
    { id: 1, role: 'client', status: 'confirmed', scheduledAt: '2026-10-21T09:00:00Z', ...paid },
    { id: 2, role: 'client', status: 'cancelled', scheduledAt: '2026-10-23T09:00:00Z', ...paid },
    { id: 3, role: 'coach', status: 'confirmed', scheduledAt: '2026-10-23T10:00:00Z', ...paid },
    { id: 4, role: 'client', status: 'confirmed', scheduledAt: '2026-10-25T09:00:00Z', providerRole: 'nutritionist', providerId: 3 },
    { id: 5, role: 'client', status: 'confirmed', scheduledAt: '2026-10-24T09:00:00Z', ...paid },
    { id: 6, role: 'client', status: 'requested', scheduledAt: '2026-10-23T08:00:00Z', ...paid },
    // A former coach's, or an intro coach's the member doesn't pay; and a paid coach's id under the
    // other role (the two roles number their coaches separately).
    { id: 7, role: 'client', status: 'confirmed', scheduledAt: '2026-10-22T15:00:00Z', providerRole: 'trainer', providerId: 99 },
    { id: 8, role: 'client', status: 'confirmed', scheduledAt: '2026-10-22T16:00:00Z', providerRole: 'nutritionist', providerId: 7 },
  ];
  assert.equal(H.bsHomeNextSession(list, coaches, now).id, 5);
  assert.equal(H.bsHomeNextSession(list, coaches.slice(1), now).id, 4, 'only the nutritionist paid');
  assert.equal(H.bsHomeNextSession(list, [], now), null, 'no coach paid, no session');
  assert.equal(H.bsHomeNextSession(list, [{ role: 'trainer', name: 'No id' }], now), null, 'a coach without an id matches nothing');
  assert.equal(H.bsHomeNextSession([], coaches, now), null);
  assert.equal(H.bsHomeNextSession(null, coaches, now), null);
  // The sessions read names each session's coach by role and id, as the plan read names the paid ones.
  const route = readFileSync(join(ROOT, 'src', 'app', 'api', 'sessions', 'manage', 'route.ts'), 'utf8');
  assert.match(route, /providerRole: r\.provider_role,\n\s+providerId: r\.provider_id,/);
  const plan = readFileSync(join(ROOT, 'src', 'app', 'api', 'client', 'plan', 'route.ts'), 'utf8');
  assert.match(plan, /const coaches = subs\.map\(\(sub\) => \(\{\n\s+providerId: sub\.provider_id,/);
});

test('the weekly notes are the paid coaches\' alone', () => {
  const coaches = [{ role: 'trainer', name: 'Jordan Chen', providerId: 7 }, { role: 'nutritionist', name: 'Dr. Maya Patel', providerId: 3 }];
  const banners = [
    { id: 'a', provider_role: 'trainer', provider_id: 7, text: 'Push the tempo.' },
    { id: 'b', provider_role: 'trainer', provider_id: 99, text: 'A former coach\'s note.' },
    { id: 'c', provider_role: 'nutritionist', provider_id: 3, text: 'Protein first.' },
    { id: 'd', provider_role: 'nutritionist', provider_id: 7, text: 'Another role\'s 7.' },
    null,
  ];
  assert.deepEqual(H.bsHomePaidBanners(banners, coaches).map((b) => b.id), ['a', 'c']);
  assert.deepEqual(H.bsHomePaidBanners(banners, []), [], 'no coach paid, no note');
  assert.deepEqual(H.bsHomePaidBanners(null, coaches), []);
  // Home draws its notes through it, and a timed coach item carries its minutes onto the line, so
  // Today's call can count down to it.
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /const banners = bsHomePaidBanners\(coachFeed\.banners, planCoaches\);/);
  assert.match(client, /key: `coach-\$\{it\.id\}`,\n\s+time: p\.time \|\| '',\n(\s+\/\/.*\n)*\s+_min: bsHomeTimeMinutes\(p\.time\),/);
  assert.match(client, /const nextStop = todayDirective\.engine \? lineRows\.find\(\(r\) => typeof r\._min === 'number' && r\._min > bsNowMin && !r\.done\) : null;/);
});

test('the coaches are the ones the plan read says the member pays, trainers first', () => {
  const plan = {
    meals: { coaching: { coaches: [{ name: 'Dr. Maya Patel', conversationId: 'c-m', providerId: 3 }] } },
    training: { coaching: { coaches: [{ name: 'Jordan Chen', conversationId: 'c-j', providerId: 7 }, { name: null }] } },
  };
  assert.deepEqual(H.bsHomeCoachesOf(plan), [
    { role: 'trainer', name: 'Jordan Chen', conversationId: 'c-j', providerId: 7 },
    { role: 'nutritionist', name: 'Dr. Maya Patel', conversationId: 'c-m', providerId: 3 },
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

test('a coach whose thread is not set up yet opens the coaches\' threads, never another coach\'s (Codex P2 on #2424)', () => {
  const sent = [];
  const listen = (e) => sent.push(e.detail);
  globalThis.addEventListener?.('shape:openConversation', listen);
  let coachesOpened = 0;
  const d = drive(S.BSHomeCoachesView, { coaches: [{ role: 'trainer', name: 'Jordan Chen', conversationId: null }], onCoaches: () => { coachesOpened += 1; } });
  const row = d.nodes().find(fn('BSFocusLink'));
  assert.equal(row.props.label, 'Message Jordan Chen');
  row.props.onOpen();
  assert.equal(coachesOpened, 1);
  assert.deepEqual(sent, [], 'no event with no thread to open');
  globalThis.removeEventListener?.('shape:openConversation', listen);
});
