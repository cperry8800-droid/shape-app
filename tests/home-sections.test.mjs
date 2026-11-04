// tests/home-sections.test.mjs
//
// HOME'S READS (services/homeWeek.mjs), through the shipping code: the week's days, the week so far and
// its squares, the goal's weight read, the next session, the coaches the member pays and their notes.
// The sections that draw them (the climb, the week's bars, Team, the habits row) are
// tests/home-deck-team.test.mjs's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT } from './helpers/broadsheet-mount.mjs';
import * as H from '../mobile-app/src/services/homeWeek.mjs';

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
    training: { coaching: { coaches: [{ name: 'Jordan Chen', conversationId: 'c-j', providerId: 7, photo: 'https://cdn.example/j.jpg' }, { name: null, conversationId: 'c-x', providerId: 9, photo: 'javascript:alert(1)' }, { name: null }] } },
  };
  assert.deepEqual(H.bsHomeCoachesOf(plan), [
    // The face on the Team card: the plan read's photo, https only.
    { role: 'trainer', name: 'Jordan Chen', conversationId: 'c-j', providerId: 7, photo: 'https://cdn.example/j.jpg' },
    // Paid, but the listing's name couldn't be read: still a coach (Codex P2 on #2424).
    { role: 'trainer', name: null, conversationId: 'c-x', providerId: 9, photo: null },
    { role: 'nutritionist', name: 'Dr. Maya Patel', conversationId: 'c-m', providerId: 3, photo: null },
  ]);
  assert.deepEqual(H.bsHomeCoachesOf({ training: { coaching: null }, meals: {} }), [], 'no coach, or a read that failed');
  assert.deepEqual(H.bsHomeCoachesOf(null), []);
});

test('"no coach" is known only when the read named coaching for both disciplines (Find a coach waits)', () => {
  assert.equal(H.bsHomeCoachesKnown({ ok: true, training: { coaching: null }, meals: { coaching: null } }), true, 'read, and no coach');
  assert.equal(H.bsHomeCoachesKnown({ ok: true, training: { coaching: { coaches: [{ name: 'Jordan' }] } }, meals: { coaching: null } }), true);
  // The route omits `coaching` when it could not read the subscriptions: not known.
  assert.equal(H.bsHomeCoachesKnown({ ok: true, training: {}, meals: { coaching: null } }), false);
  assert.equal(H.bsHomeCoachesKnown({ ok: true, training: { coaching: null }, meals: {} }), false);
  assert.equal(H.bsHomeCoachesKnown({ ok: false, training: { coaching: null }, meals: { coaching: null } }), false);
  assert.equal(H.bsHomeCoachesKnown(null), false, 'ShapePlan.get resolves null when it fails');
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /if \(on && bsHomeCoachesKnown\(p\)\) setCoachesKnown\(true\);/);
  // Team's Find a coach: signed in it waits for the read; the signed-out preview shows the sample's two
  // coaches (owner, 2026-11-03: "the preview of app should show a potential real life account").
  assert.match(client, /const teamCoaches = sample\n\s+\? \[\{ role: 'trainer', name: 'Jordan Chen'[^\n]*\n\s+: planCoaches;/);
  assert.match(client, /showFindCoach=\{!teamCoaches\.length && coachesKnown\}/);
});

// ── The week's squares ───────────────────────────────────────────────────────

// The squares, through the model: hit, missed (a session only on a day the plan set one), a rest day,
// today until it is hit and the days ahead, and nothing said when nothing was read.
test('the week grid: a square a day for each row, today never missed, a session missed only on a day the plan set', () => {
  const series = {
    calories: [{ date: '2026-10-19', value: 1800 }, { date: '2026-10-21', value: 2000 }],
    protein: [{ date: '2026-10-19', value: 150 }, { date: '2026-10-20', value: 90 }, { date: '2026-10-22', value: 141 }],
    steps: [{ date: '2026-10-20', value: 8000 }, { date: '2026-10-21', value: 7999 }],
  };
  const w = H.bsHomeWeekSoFar({ todayIso: '2026-10-22', series, proteinTarget: 140, stepGoal: 8000, answered: (d) => d === '2026-10-20',
    trainedDays: ['2026-10-19', '2026-10-18'], plannedDays: [true, false, true, true, false, true, false], planRead: true });
  const g = w.grid;
  assert.deepEqual(g.week, ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(g.today, 3);
  assert.deepEqual(g.sessions, ['hit', 'rest', 'miss', 'ahead', 'ahead', 'ahead', 'ahead'], 'Tuesday set nothing, so it rests; last Sunday\'s session is not this week\'s');
  assert.deepEqual(g.food, ['hit', 'miss', 'hit', 'ahead', 'ahead', 'ahead', 'ahead'], 'today without food yet is still to come');
  assert.deepEqual(g.protein, ['hit', 'miss', 'miss', 'hit', 'ahead', 'ahead', 'ahead'], 'a day hits at the target, and today once it does');
  assert.deepEqual(g.steps, ['miss', 'hit', 'miss', 'ahead', 'ahead', 'ahead', 'ahead'], '7,999 is short of 8,000');
  assert.deepEqual(g.mornings, ['miss', 'hit', 'miss', 'ahead', 'ahead', 'ahead', 'ahead']);
  // Without a target, a protein or steps square is a day with a reading.
  const free = H.bsHomeWeekSoFar({ todayIso: '2026-10-22', series }).grid;
  assert.deepEqual(free.protein.slice(0, 3), ['hit', 'hit', 'miss']);
  // The plan read with no training plan: an untrained day rests, never "missed" against a plan nobody has.
  assert.deepEqual(H.bsHomeWeekSoFar({ todayIso: '2026-10-22', series, trainedDays: [], planRead: true }).grid.sessions.slice(0, 3), ['rest', 'rest', 'rest']);
  // The plan read failed or hasn't landed (Codex P2 on #2449): a day trained still says so, today is
  // still to come, and a day gone by untrained says nothing, since the plan may have set a session on it.
  const unread = H.bsHomeWeekSoFar({ todayIso: '2026-10-22', series, trainedDays: ['2026-10-20'] }).grid.sessions;
  assert.deepEqual(unread, [null, 'hit', null, 'ahead', 'ahead', 'ahead', 'ahead']);
  assert.deepEqual(H.bsHomeWeekSoFar({ todayIso: '2026-10-22', series, trainedDays: ['2026-10-20'], plannedDays: [true, true, true, true, true, true, true] }).grid.sessions, unread,
    'without a read, planned days are not taken on trust either');
  // Nothing read: no square says missed.
  const none = H.bsHomeWeekSoFar({ todayIso: '2026-10-22' }).grid;
  for (const k of ['sessions', 'food', 'protein', 'steps', 'mornings']) {
    assert.deepEqual(none[k], [null, null, null, null, 'ahead', 'ahead', 'ahead'], k);
  }
  // A Sunday is the whole week; nothing is ahead but today until it is hit.
  assert.deepEqual(H.bsHomeWeekSoFar({ todayIso: '2026-10-25', series, trainedDays: [] }).grid.food, ['hit', 'miss', 'hit', 'miss', 'miss', 'miss', 'ahead']);
  assert.equal(H.bsHomeWeekSoFar({ todayIso: 'not a day' }).grid, null);
});

test('the days trained and the plan\'s days come off their reads, and a failed read is unknown', () => {
  assert.deepEqual(H.bsHwTrainedDaysOf({ ok: true, workouts: 2, days: ['2026-10-19', '2026-10-21T00:00:00'] }), ['2026-10-19', '2026-10-21']);
  assert.equal(H.bsHwTrainedDaysOf({ ok: false, days: ['2026-10-19'] }), null);
  assert.equal(H.bsHwTrainedDaysOf({ ok: true, workouts: 0 }), null, 'an older read without days is unknown');
  assert.equal(H.bsHomeSessionsPlannedDays(null), null);
  assert.equal(H.bsHomeSessionsPlannedDays({ training: { hasPlan: false } }), null);
  const days = H.bsHomeSessionsPlannedDays({ training: { hasPlan: true, workouts: [] } }, new Date(2026, 9, 22));
  assert.deepEqual(days, [false, false, false, false, false, false, false]);
  // The backend's read hands the days back with the count.
  const backend = readFileSync(join(ROOT, 'mobile-app', 'src', 'services', 'shapeBackend.js'), 'utf8');
  assert.match(backend, /return \{ workouts: days\.size, days: \[\.\.\.days\]\.sort\(\),/);
  // Home tells the section whether the plan read came back with the workouts: ShapePlan.get resolves
  // null when it fails, and the route says training.read false when its workouts read failed.
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /const \[planRead, setPlanRead\] = useStateBSC\(false\);/);
  assert.match(client, /if \(on && bsPlanPartRead\(p, 'training'\)\) setPlanRead\(true\);/);
  const route = readFileSync(join(ROOT, 'src', 'app', 'api', 'client', 'plan', 'route.ts'), 'utf8');
  assert.match(route, /const \{ data: cwRows, error: cwErr \} = await supabase\s+\.from\('client_workouts'\)/);
  assert.match(route, /hasPlan: workouts\.length > 0,[\s\S]{0,240}?read: !cwErr,/);
  assert.match(client, /plannedDays=\{bsHomeSessionsPlannedDays\(livePlan\)\} planRead=\{planRead\}/);
});

test('the week\'s reads are used only in the week they were read for (Codex P2s on #2424)', () => {
  const series = { kcal: [] };
  assert.equal(H.bsHwOfWeek({ monday: '2026-10-19', v: series }, '2026-10-19'), series);
  assert.equal(H.bsHwOfWeek({ monday: '2026-10-19', v: 3 }, '2026-10-19'), 3);
  assert.equal(H.bsHwOfWeek({ monday: '2026-10-19', v: 0 }, '2026-10-19'), 0, 'a real zero stays');
  assert.equal(H.bsHwOfWeek({ monday: '2026-10-19', v: series }, '2026-10-26'), null, 'last week\'s read on a new Monday is unknown');
  assert.equal(H.bsHwOfWeek(null, '2026-10-26'), null, 'nothing read yet');
  // Both of useBSHomeWeek's reads go through it (Home's week bars draw off it).
  const src = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSHomeSections.jsx'), 'utf8');
  assert.match(src, /setSeries\(\{ monday, v: bsHwSeriesOf\(p\) \}\)/);
  assert.match(src, /setTrained\(\{ monday, v: bsHwTrainedOf\(p\), days: bsHwTrainedDaysOf\(p\) \}\)/);
  assert.match(src, /trainedDays: trained && trained\.monday === monday \? trained\.days : null, plannedDays, planRead,/);
  assert.match(src, /const weekSeries = bsHwOfWeek\(series, monday\);/);
  assert.match(src, /series: weekSeries, workoutsDone: bsHwOfWeek\(trained, monday\),/);
  assert.match(src, /answered: \(iso\) => bsCiAnswered\(bsCiDay\(weekSeries, iso\)\)/);
});
