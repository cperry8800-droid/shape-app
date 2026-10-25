// tests/profile-signals.test.mjs
//
// The member's own profile, signed in: the Signals tab's live figures (owner, 2026-10-24: "where is
// this data updated from", then "leave demo data but make sure live feed is correct").
//
// Every live figure on that tab read a field its route never sent, so a signed-in member saw an
// empty tab whatever they had logged:
//   · the day streak read /api/client/train's `stats.currentStreak` and the weekly bars its
//     `volumeByDay`; that route sent neither then (it does since, for the Train page), so the
//     streak was always 0 and the week redacted;
//   · the trajectory ran /api/client/progress's `series.weight` ({ date, value } rows) through
//     Number(), so every weigh-in became NaN and it always read "no weigh-ins yet";
//   · key lifts and the activity feed's PRs read `/api/client/train`'s `prs`, which it never sends.
// They now come from profileSignals.mjs, over the routes that do serve them. The signed-out demo
// keeps every sample figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bsProfileStreak, bsProfileWeek, bsProfileTrajectory, bsProfileLifts, bsProfileDisciplines,
} from '../mobile-app/src/services/profileSignals.mjs';
import { loadBroadsheet, drive, textOf, ROOT, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const read = (...p) => stripComments(readFileSync(join(ROOT, ...p), 'utf8'));

test('the day streak is the dashboard\'s, and a missing one is unknown, not 0', () => {
  assert.equal(bsProfileStreak({ kpis: { streak: 6 } }), 6);
  assert.equal(bsProfileStreak({ kpis: { streak: 0 } }), 0, 'no streak today is a real 0');
  assert.equal(bsProfileStreak(null), null, 'a failed read');
  assert.equal(bsProfileStreak({ kpis: {} }), null);
  assert.equal(bsProfileStreak({ kpis: { streak: null } }), null);
});

test('weekly momentum is the workout minutes of the seven days ending today, by date', () => {
  const progress = { ok: true, snapshotsRead: true, series: { volume: [
    { date: '2026-09-20', value: 90 },   // before the window
    { date: '2026-09-27', value: 45 },
    { date: '2026-09-30', value: 30 },
    { date: '2026-10-03', value: 20 },   // today
  ] } };
  const wk = bsProfileWeek(progress, '2026-10-03');
  assert.deepEqual(wk.days, ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'],
    'the week runs across a month end, oldest first, today last');
  assert.deepEqual(wk.minutes, [45, 0, 0, 30, 0, 0, 20], 'a day with no row trained 0 minutes');
  const empty = bsProfileWeek({ ok: true, snapshotsRead: true, series: { volume: [] } }, '2026-10-03');
  assert.deepEqual(empty.minutes, [0, 0, 0, 0, 0, 0, 0], 'nothing logged this week is seven honest zeros');
});

test('weekly momentum says nothing when the progress read did not answer', () => {
  assert.equal(bsProfileWeek(null, '2026-10-03'), null, 'a failed request');
  assert.equal(bsProfileWeek({ ok: true, snapshotsRead: false, series: { volume: [] } }, '2026-10-03'), null,
    'a failed history read has empty series for a reason other than nothing logged');
});

test('the trajectory reads the weigh-ins the progress route sends as { date, value } rows', () => {
  const weight = [180, 179, 178.5, 178, 177, 176.4, 176, 175].map((value, i) => ({ date: `2026-10-0${i + 1}`, value }));
  assert.deepEqual(bsProfileTrajectory({ series: { weight } }), [179, 178.5, 178, 177, 176.4, 176, 175], 'the last seven, oldest first');
  // The old read: rows straight through Number(), every one NaN.
  assert.deepEqual(weight.slice(-7).map(Number).filter(Number.isFinite), [], 'the bug this replaces');
  assert.equal(bsProfileTrajectory({ series: { weight: weight.slice(0, 1) } }), null, 'one weigh-in is not a trajectory');
  assert.equal(bsProfileTrajectory(null), null);
});

test('key lifts and disciplines are the profile-stats route\'s, the website profile\'s read', () => {
  const stats = { ok: true, lifts: [['Back squat', '245 lb'], ['Deadlift', '285 lb'], ['Bench press', '135 lb'], ['Row', '115 lb']], disciplines: [['Strength', 0.7], ['Recovery', 1.4]] };
  assert.deepEqual(bsProfileLifts(stats), [['Back squat', '245 lb'], ['Deadlift', '285 lb'], ['Bench press', '135 lb']]);
  assert.deepEqual(bsProfileDisciplines(stats), [['Strength', 0.7], ['Recovery', 1]], 'only the ones with a signal, clamped to 1');
  const none = { ok: true, hasLifts: false, lifts: [], disciplines: [] };
  assert.equal(bsProfileLifts(none), null);
  assert.equal(bsProfileDisciplines(none), null);
  assert.equal(bsProfileLifts(null), null);
});

test('each route still sends the field the profile reads from it', () => {
  const dash = read('src', 'app', 'api', 'client', 'dashboard', 'route.ts');
  assert.match(dash, /kpis: \{ streak,/, 'the dashboard sends kpis.streak');
  const prog = read('src', 'app', 'api', 'client', 'progress', 'route.ts');
  assert.match(prog, /snapshotsRead: !snapError,/);
  assert.match(prog, /\n\s+weight: weightSeries,/, 'progress sends series.weight');
  assert.match(prog, /\n\s+volume: volumeSeries,/, 'progress sends series.volume');
  assert.match(prog, /const volumeSeries = seriesFor\('workout_minutes'\);/, 'series.volume is workout minutes per day');
  assert.match(prog, /\n\s+prs,\n\s+recentPrs,\n/, 'progress sends prs and recentPrs');
  const stats = read('src', 'app', 'api', 'client', 'profile-stats', 'route.ts');
  assert.match(stats, /\n\s+lifts,\n\s+disciplines,\n/, 'profile-stats sends lifts and disciplines');
  const backend = read('mobile-app', 'src', 'services', 'shapeBackend.js');
  assert.match(backend, /function getClientDashboard\(\) \{ return cachedClientJson\('\/api\/client\/dashboard'\)/);
  assert.match(backend, /function getClientProfileStats\(\) \{ return cachedClientJson\('\/api\/client\/profile-stats'\)/);
  assert.match(backend, /window\.ShapeProgress = \{[^}]*dashboard: getClientDashboard, profileStats: getClientProfileStats \};/);
});

test('the profile reads its live figures from those routes, and none from the train route', () => {
  const src = stripComments(readFileSync(SRC, 'utf8'));
  const start = src.indexOf('function BSTerrainProfile(');
  const body = src.slice(start, src.indexOf('\nfunction ', start + 1));
  assert.match(body, /window\.ShapeProgress\.profileStats\(\)/);
  assert.match(body, /window\.ShapeProgress\.dashboard \? window\.ShapeProgress\.dashboard\(\)/);
  assert.match(body, /bsProfileStreak\(dash\)/);
  assert.match(body, /bsProfileTrajectory\(prog\)/);
  assert.match(body, /bsProfileWeek\(prog\)/);
  assert.match(body, /Array\.isArray\(td\.recentPrs\)\) \? td\.recentPrs/, 'the feed reads the most recently set PRs, not the heaviest few');
  assert.doesNotMatch(body, /ShapeProgress\??\.train/, 'the profile reads the dashboard\'s streak and the progress route\'s week and PRs, not the train route');
  assert.doesNotMatch(body, /currentStreak|volumeByDay/);
});

test('signed out, the Signals tab keeps every demo figure', async () => {
  const mod = await loadBroadsheet(['BSTerrainProfile']);
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const person = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' };
  const d = drive(mod.BSTerrainProfile, { person, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSTerrainTabs').props.onPick('signals');
  d.render();
  const all = d.nodes();
  assert.ok(all.some((n) => n.type === 'span' && textOf(n) === '14'), 'the 14-day streak');
  assert.ok(all.some((n) => n.type === 'span' && textOf(n) === '−5'), 'the −5 lb trajectory');
  const days = all.filter((n) => n.type === 'div' && n.props && n.props.style && n.props.style.fontSize === 6.5).map(textOf);
  assert.deepEqual(days, ['M', 'T', 'W', 'T', 'F', 'S', 'S'], 'the Monday-to-Sunday row');
  const bars = all.find((n) => n && typeof n.type === 'function' && n.type.name === 'BSSdBars' && n.props.rows[0][0] === 'Strength');
  assert.deepEqual(bars.props.perf, [82, 64, 91, 73], 'the demo disciplines');
});
