// The onboarding board (client-onboarding review, fix 4): one board per new client, every tick a
// record. Driven here end to end:
//   1. bsOnboardingLeg, the pure leg (src/lib/coach-client-legs.mjs);
//   2. the shared overview's reads behind it (the welcome, the coach's first message, the first plan
//      this coach published), through the real buildSharedOverview over a fake client;
//   3. the triage engine on a new client (dashSignals.js: M13, L8, the week-one date);
//   4. the website board, mounted, saving a week-one target;
//   5. POST /api/clients/[id]/week-one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const nextServer = require('next/server');
const LEGS = await import(pathToFileURL(join(ROOT, 'src/lib/coach-client-legs.mjs')).href);
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-15T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const stepsOf = (ob) => Object.fromEntries(ob.steps.map((s) => [s.key, s]));

// ── 1. The leg ───────────────────────────────────────────────────────────────────────────────────
test('the leg ticks each step from its record, and nothing else', () => {
  const ob = LEGS.bsOnboardingLeg({
    role: 'trainer', joinedAt: ago(2), welcomeAt: ago(2), helloAt: null, firstPlan: null,
    checkins: [], measurements: [], programDetail: {}, intake: { training: { sessions_per_week: '4' } }, now: NOW,
  });
  assert.equal(ob.day, 3);
  assert.equal(ob.days, 30);
  const s = stepsOf(ob);
  assert.deepEqual(ob.steps.map((x) => x.key), ['joined', 'welcome', 'hello', 'plan', 'checkin', 'checkin2', 'progress']);
  assert.equal(s.joined.done, true);
  assert.equal(s.welcome.done, true);
  assert.equal(s.hello.done, false);
  assert.equal(s.plan.done, false);
  assert.equal(s.plan.due, null, 'no week-one date, no deadline (decision 3: no fixed rule)');
  assert.equal(s.checkin.done, false);
  assert.equal(s.progress.done, false);
  assert.equal(ob.weekOne, null);
  assert.equal(ob.suggested, 4, 'their own answer: sessions per week');
  assert.equal(ob.unit, 'workouts');

  const done = LEGS.bsOnboardingLeg({
    role: 'trainer', joinedAt: ago(29), welcomeAt: ago(29), helloAt: ago(28), firstPlan: { at: ago(27), title: 'Base week' },
    checkins: [{ week_of: '2026-10-12' }, { week_of: '2026-10-05' }, { week_of: '2026-08-03' }],
    measurements: [{ site: 'waist', measured_on: '2026-10-14' }], programDetail: { training: { weekOne: { count: 4, startsOn: '2026-09-22', providerId: 7 } } }, providerId: 7, now: NOW,
  });
  const d = stepsOf(done);
  assert.equal(d.hello.done, true);
  assert.equal(d.plan.done, true);
  assert.equal(d.plan.title, 'Base week');
  assert.equal(d.checkin.done, true);
  assert.equal(d.checkin.at, '2026-10-05', 'a check-in from before they joined is not their first with you');
  assert.equal(d.checkin2.done, true);
  assert.equal(d.progress.done, true);
  assert.deepEqual(done.weekOne, { count: 4, startsOn: '2026-09-22', setAt: null });
  assert.equal(done.suggested, null);
  assert.equal(d.plan.due, '2026-09-22');
});

test('a failed read is unknown, never "to do"; past day 30 there is no board', () => {
  const ob = LEGS.bsOnboardingLeg({ role: 'nutritionist', joinedAt: ago(1), welcomeAt: undefined, helloAt: undefined, firstPlan: undefined, checkins: undefined, measurements: undefined, now: NOW });
  const s = stepsOf(ob);
  for (const k of ['welcome', 'hello', 'plan', 'checkin', 'checkin2', 'progress']) assert.equal(s[k].done, null, k);
  assert.equal(ob.unit, 'days_logged');
  assert.equal(ob.suggested, null, 'nothing a member told Shape says how many days they will log');
  assert.equal(LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: ago(30), now: NOW }), null);
  assert.equal(LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: null, now: NOW }), null);
  assert.equal(LEGS.bsOnboardingLeg({ role: 'client', joinedAt: ago(1), now: NOW }), null);
  // A target outside 1-14, or not a whole number, is no target.
  for (const count of [0, 15, 2.5, 'x']) {
    assert.equal(LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: ago(1), programDetail: { training: { weekOne: { count, providerId: 7 } } }, providerId: 7, now: NOW }).weekOne, null, String(count));
  }
});

test('the first check-in falls due at the end of week one, never the next morning', () => {
  // Joined Saturday 2026-10-10: due the Sunday a week later, not Sunday 10-11.
  const sat = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: '2026-10-10T10:00:00Z', checkins: [], now: NOW });
  assert.equal(stepsOf(sat).checkin.due, '2026-10-18');
  // Joined Monday 2026-10-12: due that Sunday.
  const mon = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: '2026-10-12T10:00:00Z', checkins: [], now: NOW });
  assert.equal(stepsOf(mon).checkin.due, '2026-10-18');
  assert.equal(stepsOf(mon).checkin2.due, '2026-10-25', 'the second a week after the first');
  // Week one set to start later moves it.
  const later = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: '2026-10-12T10:00:00Z', checkins: [], programDetail: { training: { weekOne: { count: 3, startsOn: '2026-10-20', providerId: 7 } } }, providerId: 7, now: NOW });
  assert.equal(stepsOf(later).checkin.due, '2026-10-25');
  // ...and the second with it (Codex on #2378): never due before the first.
  assert.equal(stepsOf(later).checkin2.due, '2026-11-01');
  const muchLater = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: '2026-10-12T10:00:00Z', checkins: [], programDetail: { training: { weekOne: { count: 3, startsOn: '2026-11-02', providerId: 7 } } }, providerId: 7, now: NOW });
  assert.ok(stepsOf(muchLater).checkin2.due > stepsOf(muchLater).checkin.due, 'a week one three weeks out keeps the check-ins in order');
});

test('the day-30 measurement falls due on day 30, the board\'s last (Codex on #2378)', () => {
  // Joined 2026-10-12: day 30 is 11-10, and the board is gone from 11-11.
  const ob = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: '2026-10-12T10:00:00Z', measurements: [], now: NOW });
  assert.equal(stepsOf(ob).progress.due, '2026-11-10');
  const last = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: '2026-10-12T10:00:00Z', measurements: [], now: Date.parse('2026-11-11T09:00:00Z') });
  assert.equal(last.day, 30);
  assert.equal(stepsOf(last).progress.due, '2026-11-10', 'due no later than the last day the board shows');
  assert.equal(LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: '2026-10-12T10:00:00Z', now: Date.parse('2026-11-11T10:00:00Z') }), null);
});

test('a measurement dated after today never completes day 30 (Codex on #2378)', () => {
  const joinedAt = '2026-10-12T10:00:00Z';
  // Day 4: a measurement dated day 29 (a wrong device clock) is not the day-30 read.
  const early = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, measurements: [{ measured_on: '2026-11-09' }], now: Date.parse('2026-10-15T12:00:00Z') });
  assert.equal(stepsOf(early).progress.done, false);
  // Day 29: the same measurement, now dated today, is.
  const onTime = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, measurements: [{ measured_on: '2026-11-09' }], now: Date.parse('2026-11-09T12:00:00Z') });
  assert.equal(stepsOf(onTime).progress.done, true);
  // A member east of UTC whose own today is already tomorrow in UTC still counts.
  const east = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, measurements: [{ measured_on: '2026-11-10' }], now: Date.parse('2026-11-09T13:00:00Z') });
  assert.equal(stepsOf(east).progress.done, true);
  // The read returns the newest row per site, so a future waist row may hide a real day-29 one:
  // "couldn't read", never "not yet". A valid row at another site still completes it.
  const day29 = Date.parse('2026-11-09T12:00:00Z');
  const hid = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, measurements: [{ site: 'waist', measured_on: '2027-01-01' }], now: day29 });
  assert.equal(stepsOf(hid).progress.done, null);
  const other = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, measurements: [{ site: 'waist', measured_on: '2027-01-01' }, { site: 'hips', measured_on: '2026-11-09' }], now: day29 });
  assert.equal(stepsOf(other).progress.done, true);
  const none = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, measurements: [{ site: 'waist', measured_on: '2026-10-13' }], now: day29 });
  assert.equal(stepsOf(none).progress.done, false, 'only older rows: not yet');
});

test('saving a week-one target reads the board again, on the website and in the app (Codex on #2378)', () => {
  const today = read('public/newdesign/dashToday.jsx');
  assert.match(today, /setTarget\(j\.weekOne\); setEditing\(false\); setState\("Saved"\);\n[^\n]*\n[^\n]*\n      try \{ window\.dispatchEvent\(new CustomEvent\("shape:coach-progress-refresh", \{ detail: \{ clientId: id \} \}\)\); \} catch \(e\) \{\}/);
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /window\.__bsToast\?\.\(coachTr\('coach:onboard\.saved'[^\n]*if \(onSaved\) onSaved\(\); \}/);
  assert.match(pros, /onSayHello=\{\(\) => fireEvt\('shape:proMessageClient'\)\} onSaved=\{reloadOnboard\} \/>/);
  assert.match(pros, /window\.ShapeCareTeam\.overview\(uid\)\.then\(\(d\) => \{ if \(d\) setOnboard\(\(prev\) => \(uid === clientUidRef\.current \? bsOnboardingFor\(d, role\) : prev\)\); \}\)/, 'a read for a client the coach has left is dropped');
});

test('a week-one target counts only for the coach who set it (Codex on #2378)', () => {
  const leg = (weekOne, providerId) => LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt: '2026-10-12T10:00:00Z', checkins: [], firstPlan: null, programDetail: { training: { weekOne } }, providerId, now: NOW });
  const mine = leg({ count: 3, startsOn: '2026-10-20', providerId: 7 }, 7);
  assert.equal(mine.weekOne.count, 3);
  assert.equal(stepsOf(mine).plan.due, '2026-10-20');
  // The client's previous trainer set it: the new coach has no target, no deadline, and the suggestion.
  for (const [w, id] of [[{ count: 3, startsOn: '2026-10-01', providerId: 9 }, 7], [{ count: 3, startsOn: '2026-10-01' }, 7], [{ count: 3, startsOn: '2026-10-01', providerId: 7 }, undefined]]) {
    const ob = leg(w, id);
    assert.equal(ob.weekOne, null, JSON.stringify([w, id]));
    assert.equal(stepsOf(ob).plan.due, null, 'no predecessor\'s deadline');
    assert.equal(stepsOf(ob).checkin.due, '2026-10-18', 'week one starts when they joined you');
  }
  assert.match(read('src/lib/shared-overview.ts'), /onboarding\[role\] = bsOnboardingLeg\(\{\n      role,\n      providerId,/);
});

// ── 2. The shared overview's reads ───────────────────────────────────────────────────────────────
const COACH = { id: '11111111-1111-4111-8111-111111111111' };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function overviewDb({ joined = new Date(Date.now() - 2 * DAY).toISOString(), messages, workouts = [], fail = [], conversations, checkins = [] } = {}) {
  return fakeSupabase({
    tables: {
      trainers: [{ id: 7, name: 'Coach Q', owner_id: COACH.id }],
      nutritionists: [],
      subscriptions: [{ client_id: A, provider_role: 'trainer', provider_id: 7, status: 'active', current_period_end: null, created_at: joined }],
      conversations: conversations ?? [{ id: 'conv-a', client_id: A, kind: 'direct', provider_role: 'trainer', provider_id: 7, last_message_at: joined }],
      messages: messages ?? [
        { conversation_id: 'conv-a', sender_id: null, created_at: joined, metadata: { shape: 'welcome' } },
        { conversation_id: 'conv-a', sender_id: A, created_at: joined, metadata: {} },
      ],
      client_workouts: workouts,
      client_meal_plans: [],
      client_programs: [],
    },
    rpcs: {
      get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: 'Jordan Reyes', avatar_url: null })),
      get_my_shared_clients: () => [], get_client_goals: () => null, get_client_stats: () => null, get_client_lifts: () => null,
      get_client_checkins: () => checkins, get_client_measurements: () => [], get_client_progress_photos: () => [],
      get_client_health_profile: () => null, get_client_intake: () => ({ training: { sessions_per_week: '3' } }),
      get_client_cycle: () => null, get_client_meal_prep: () => null, get_client_score_history: () => null,
    },
    fail,
  });
}
async function overview(db, me = { trainerId: 7, nutritionistId: null }) {
  const lib = await loadRealModule(join(ROOT, 'src/lib/shared-overview.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/supabase/server', { createClient: async () => { throw new Error('type-only'); } }],
      ['@/lib/recovery-readiness', await loadRealModule(join(ROOT, 'src/lib/recovery-readiness.ts'), { typescript: true })],
      ['@/lib/vitals-leg.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/vitals-leg.mjs')).href)],
      ['@/lib/coach-client-legs.mjs', LEGS],
    ]),
  });
  return lib.buildSharedOverview(db, { clientId: A, me });
}

test('the overview reads Shape\'s welcome, the coach\'s own first message and their first plan', async () => {
  const fresh = await overview(overviewDb());
  const s = stepsOf(fresh.onboarding.trainer);
  assert.equal(s.welcome.done, true, 'the welcome has no sender and metadata.shape = welcome');
  assert.equal(s.hello.done, false, 'the client writing is not the coach saying hello');
  assert.equal(s.plan.done, false);
  assert.equal(fresh.onboarding.trainer.suggested, 3);

  const later = new Date(Date.now() - DAY).toISOString();
  const going = await overview(overviewDb({
    messages: [
      { conversation_id: 'conv-a', sender_id: null, created_at: later, metadata: { shape: 'welcome' } },
      { conversation_id: 'conv-a', sender_id: COACH.id, created_at: later, metadata: {} },
    ],
    workouts: [
      { client_id: A, trainer_id: 9, title: "Another trainer's week", created_at: later, status: 'published' },
      { client_id: A, trainer_id: null, title: 'Their own', created_at: later, status: 'published' },
      { client_id: A, trainer_id: 7, title: 'Base week', created_at: later, status: 'archived' },
    ],
  }));
  const g = stepsOf(going.onboarding.trainer);
  assert.equal(g.hello.done, true);
  assert.equal(g.plan.done, true);
  assert.equal(g.plan.title, 'Base week', 'only a plan this coach published counts');
  // A client who left and came back (Codex on #2378): a plan from the earlier run is not this one's.
  const earlier = new Date(Date.now() - 90 * DAY).toISOString();
  const back = await overview(overviewDb({
    workouts: [{ client_id: A, trainer_id: 7, title: 'Last spring', created_at: earlier, status: 'archived' }],
    messages: [
      { conversation_id: 'conv-a', sender_id: COACH.id, created_at: earlier, metadata: {} },
      { conversation_id: 'conv-a', sender_id: null, created_at: new Date(Date.now() - 2 * DAY).toISOString(), metadata: { shape: 'welcome' } },
    ],
  }));
  assert.equal(stepsOf(back.onboarding.trainer).plan.done, false, 'a plan from before this subscription');
  assert.equal(stepsOf(back.onboarding.trainer).hello.done, false, 'a message from the earlier run is not this one\'s hello');

  const unread = await overview(overviewDb({ fail: ['messages', 'client_workouts'] }));
  const u = stepsOf(unread.onboarding.trainer);
  assert.equal(u.welcome.done, null);
  assert.equal(u.hello.done, null);
  assert.equal(u.plan.done, null);

  const settled = await overview(overviewDb({ joined: new Date(Date.now() - 40 * DAY).toISOString() }));
  assert.equal('onboarding' in settled, false, 'past 30 days: no board, and no extra reads');
  assert.equal(settled.client.name, 'Jordan Reyes');
});

// ── 3. The engine on a new client ───────────────────────────────────────────────────────────────
const D = (() => { const w = {}; vm.runInNewContext(readFileSync(join(ROOT, 'public/newdesign/dashSignals.js'), 'utf8'), { window: w, console }); return w.DashSignals; })();
test('a new client reads New, not "No logs 7d+" or "Progress unknown"; the board\'s gaps are flagged', () => {
  const now = new Date('2026-10-15T12:00:00');
  const dayAgo = (n) => new Date(now.getTime() - n * DAY).toISOString();
  const rec = (o) => Object.assign({
    progressRead: { state: 'ready' }, profile: { id: 'u', name: 'Jordan', isNew: true, joinedAt: dayAgo(1) },
    foodLogs: { lastLoggedOn: null, daysLogged7d: 0 }, checkIn: { lastWeekOf: null }, lastContact: { trainer: dayAgo(1), nutritionist: null }, screening: 'clear',
  }, o);
  // Through JSON: the engine runs in its own realm, whose arrays never deep-equal this one's.
  const ev = (r) => { const e = D.evaluateClient(r, now, 'trainer'); return JSON.parse(JSON.stringify([e.severity, e.flags.map((f) => f.label)])); };
  assert.deepEqual(ev(rec({})), ['green', []], 'day one: nothing logged is not a lapse');
  assert.deepEqual(ev(rec({ profile: { id: 'u', name: 'J', isNew: true, joinedAt: dayAgo(9) } })), ['amber', ['No logs 7d+']]);
  assert.deepEqual(ev(rec({ profile: { id: 'u', name: 'J', isNew: true } })), ['green', []], 'no join date: the 14-day "new" decides');
  assert.deepEqual(ev(rec({ onboarding: { trainer: { day: 3, steps: [{ key: 'hello', done: false }] } } })), ['amber', ['Say hello']]);
  assert.deepEqual(ev(rec({ onboarding: { trainer: { day: 2, steps: [{ key: 'hello', done: false }] } } })), ['green', []]);
  assert.deepEqual(ev(rec({ onboarding: { trainer: { day: 3, steps: [{ key: 'hello', done: null }] } } })), ['green', []], 'an unread step flags nothing');
  assert.deepEqual(ev(rec({ profile: { id: 'u', name: 'J', isNew: true, joinedAt: dayAgo(6) }, lastContact: { trainer: null, nutritionist: null } })), ['amber', ['Never messaged']]);
  assert.deepEqual(ev(rec({ profile: { id: 'u', name: 'J', isNew: true, joinedAt: dayAgo(6) }, lastContact: { nutritionist: null } })), ['green', []], 'a leg without the coach\'s role is not shared, not never');
  assert.deepEqual(ev(rec({ onboarding: { trainer: { day: 4, steps: [{ key: 'hello', done: true }, { key: 'plan', done: false, due: '2026-10-14' }] } } })), ['amber', ['Week 1 not live']]);
  assert.deepEqual(ev(rec({ onboarding: { trainer: { day: 4, steps: [{ key: 'hello', done: true }, { key: 'plan', done: false, due: '2026-10-16' }] } } })), ['green', []]);
  assert.deepEqual(ev(rec({ progressRead: { state: 'unavailable' } })), ['unknown', []], 'a failed read stays unknown');
  // An established client with an empty week and no check-in at all: flagged as before, red on two.
  assert.deepEqual(ev(rec({ profile: { id: 'u', name: 'J', isNew: false, joinedAt: dayAgo(40) } })), ['red', ['No logs 7d+', 'No first check-in']]);
  // The client's own view never gets the coach's board flags.
  const self = D.evaluateClient(rec({ onboarding: { trainer: { day: 4, steps: [{ key: 'hello', done: false }, { key: 'plan', done: false, due: '2026-10-14' }] } } }), now, 'client');
  assert.ok(!self.flags.some((f) => f.key === 'plan_due'));
});

// ── 4. The website board ───────────────────────────────────────────────────────────────────────
const babel = require('next/dist/compiled/babel/core'), preset = require('next/dist/compiled/babel/preset-react');
const shared = readFileSync(join(ROOT, 'public/newdesign/dashData.jsx'), 'utf8');
const reviewHelper = shared.slice(shared.indexOf('function dashCheckinReviewed('), shared.indexOf('// The unit a bound metric'));
const todayCode = reviewHelper + babel.transformSync(readFileSync(join(ROOT, 'public/newdesign/dashToday.jsx'), 'utf8'), { presets: [preset] }).code;

test('the website board: newest first, one open, Say hello, and a week-one target saved for the coach\'s role', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#today' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // ⚠ LOADED AFTER THE WINDOW EXISTS: react-dom decides at load whether the page has input events, and
  // without them typing into a field never reaches onChange.
  const { createRoot } = await import('react-dom/client');
  const posts = [];
  globalThis.fetch = async (url, init) => { posts.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({ ok: true, weekOne: { count: 5, startsOn: '2026-10-20' } }) }; };
  const api = new Function('React', 'window', 'serif', 'sans', todayCode + ';return {DashOnboardingPanel,dashOnboardingRows,dashOnboardingNext};')(React, dom.window, 'serif', 'sans');
  const ob = (day, hello) => ({ trainer: { role: 'trainer', joinedAt: ago(day - 1), day, days: 30, unit: 'workouts', suggested: 4, weekOne: null,
    steps: [{ key: 'joined', done: true }, { key: 'welcome', done: true, at: ago(day - 1) }, { key: 'hello', done: hello }, { key: 'plan', done: false, due: null }, { key: 'checkin', done: false, due: '2026-10-18' }, { key: 'checkin2', done: false }, { key: 'progress', done: false }] } });
  const clients = [
    { profile: { id: 'old-one', name: 'Sam Lee' }, onboarding: ob(12, true), screening: 'clear' },
    { profile: { id: 'new-one', name: 'Jordan Reyes' }, onboarding: ob(2, false), screening: 'missing', intake: { goal: 'Build strength', training: [{ key: 'experience', label: 'Experience', value: '1-2 years' }], nutrition: [] } },
    { profile: { id: 'settled', name: 'Kim' }, onboarding: null },
  ];
  assert.deepEqual(api.dashOnboardingRows(clients, 'trainer').map((c) => c.profile.id), ['new-one', 'old-one']);
  assert.deepEqual(api.dashOnboardingRows(clients, 'nutritionist'), [], 'a nutritionist sees their own boards only');
  assert.equal(api.dashOnboardingNext(clients[1].onboarding.trainer, 'trainer'), 'Your first message');
  assert.equal(api.dashOnboardingNext({ steps: [{ key: 'checkin', done: false, due: '2026-10-18' }] }, 'trainer').startsWith('First check-in · due '), true);
  assert.equal(api.dashOnboardingNext({ steps: [{ key: 'plan', done: false }] }, 'nutritionist'), 'Meal plan live');
  const root = createRoot(document.getElementById('root'));
  const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  const click = async (b) => act(async () => b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  try {
    await act(async () => root.render(React.createElement(api.DashOnboardingPanel, { clients, role: 'trainer', live: true })));
    const text = document.body.textContent;
    assert.match(text, /Jordan Reyes/);
    assert.match(text, /Day 2 of 30/);
    assert.match(text, /Build strength/);
    assert.match(text, /Not completed/, 'the screening state');
    assert.ok(!/Confirm intake/.test(text), 'no box for the coach to tick');
    assert.ok(button('Say hello'), 'the hello step is not done');
    assert.match(text, /they said 4 sessions a week/);
    await click(button('Set target'));
    const input = document.querySelector('input[type="number"]');
    assert.equal(input.value, '4', 'prefilled from their answer');
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await act(async () => { setValue.call(input, '5'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    await click(button('Save'));
    assert.equal(posts.length, 1);
    assert.equal(posts[0][0], '/api/clients/new-one/week-one');
    assert.equal(posts[0][1].role, 'trainer');
    assert.equal(posts[0][1].count, 5);
    assert.match(posts[0][1].startsOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(document.body.textContent, /target: 5 workouts in week 1/);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = before.window; globalThis.document = before.document; globalThis.IS_REACT_ACT_ENVIRONMENT = before.act; globalThis.fetch = before.fetch;
  }
});

test('the board is the "New clients" tab of Needs you, and the setup card shows the same board', () => {
  const src = readFileSync(join(ROOT, 'public/newdesign/dashToday.jsx'), 'utf8');
  const needs = src.slice(src.indexOf('{ key: "needs", title: "Needs you"'), src.indexOf('{ key: "checkins", title: "Check-ins to review"'));
  assert.match(needs, /\{ key: "new", label: "New clients", empty: dashOnboardingRows\(clients, role\)\.length === 0,[\s\S]*render: \(\) => <DashOnboardingPanel clients=\{clients\} role=\{role\} live=\{source === "live"\} \/> \}/);
  assert.match(src, /\{ key: "setup", title: "New clients"[\s\S]{0,200}<DashOnboardingPanel clients=\{clients\} role=\{role\} live=\{source === "live"\} \/>/);
  assert.ok(!/DashSetupPanel|dashSetupSteps|setupIntake/.test(src), 'the manual intake confirmation is gone');
});

// ── 5. POST /api/clients/[id]/week-one ─────────────────────────────────────────────────────────
async function weekOneRoute({ user = COACH, rpcError = null, listing = { id: 7 }, listingError = null } = {}) {
  const calls = [];
  const reads = [];
  const client = {
    rpc: async (name, args) => { calls.push([name, args]); return { data: null, error: rpcError }; },
    // The caller's own listing for the role.
    from: (table) => { const q = { select: () => q, eq: (k, v) => { reads.push([table, k, v]); return q; }, maybeSingle: async () => ({ data: listingError ? null : listing, error: listingError }) }; return q; },
  };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/clients/[id]/week-one/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => client }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
    ]),
  });
  const post = async (id, body) => {
    const res = await mod.POST(new Request(`https://x/api/clients/${id}/week-one`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    return { status: res.status, body: await res.json() };
  };
  return { post, calls, reads };
}

test('the week-one route writes the coach\'s own discipline through set_program_detail', async () => {
  const { post, calls } = await weekOneRoute();
  const ok = await post(A, { role: 'trainer', count: 4, startsOn: '2026-10-20' });
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
  const [name, args] = calls[0];
  assert.equal(name, 'set_program_detail');
  assert.equal(args.p_client_id, A);
  assert.equal(args.p_discipline, 'training');
  assert.equal(args.p_phase, null, 'the phase is left as it is');
  assert.deepEqual({ ...args.p_detail.weekOne, setAt: 'x' }, { count: 4, startsOn: '2026-10-20', setAt: 'x', setBy: 'coach', providerId: 7 }, 'the listing that set it rides with it (Codex on #2378)');
  const nutri = await post(A, { role: 'nutritionist', count: null });
  assert.equal(nutri.status, 200);
  assert.equal(calls[1][1].p_discipline, 'nutrition');
  assert.equal(calls[1][1].p_detail.weekOne, null, 'null clears it');
});

test('the week-one route refuses the client themselves, bad input, and a caller who is not that coach', async () => {
  const self = await weekOneRoute({ user: { id: A } });
  assert.equal((await self.post(A, { role: 'trainer', count: 3 })).status, 403);
  assert.equal(self.calls.length, 0);
  const anon = await weekOneRoute({ user: null });
  assert.equal((await anon.post(A, { role: 'trainer', count: 3 })).status, 401);
  const { post, calls } = await weekOneRoute();
  for (const body of [{ role: 'client', count: 3 }, { role: 'trainer', count: 0 }, { role: 'trainer', count: 15 }, { role: 'trainer', count: 2.5 }, { role: 'trainer', count: 3, startsOn: '2026-02-30' }, { role: 'trainer', count: 3, startsOn: '2031-01-01' }]) {
    assert.equal((await post(A, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await post('not-a-uuid', { role: 'trainer', count: 3 })).status, 404);
  assert.equal(calls.length, 0);
  const denied = await weekOneRoute({ rpcError: { code: '42501', message: 'Not authorized to set the training program for this client.' } });
  assert.equal((await denied.post(A, { role: 'trainer', count: 3 })).status, 403);
  // No listing of that role: refused before any write. An unreadable one: a 500, nothing written.
  const noListing = await weekOneRoute({ listing: null });
  assert.equal((await noListing.post(A, { role: 'nutritionist', count: 3 })).status, 403);
  assert.deepEqual(noListing.reads, [['nutritionists', 'owner_id', COACH.id]]);
  assert.equal(noListing.calls.length, 0);
  const unread = await weekOneRoute({ listingError: { code: 'XX000', message: 'down' } });
  const errLog = console.error; console.error = () => {};
  try { assert.equal((await unread.post(A, { role: 'trainer', count: 3 })).status, 500); } finally { console.error = errLog; }
  assert.equal(unread.calls.length, 0);
  assert.match(readFileSync(join(ROOT, 'src/lib/warroom.ts'), 'utf8'), /\['\/api\/clients\/\[id\]\/week-one', 'POST'\]/);
});

// ── L8: publishing a meal plan tells the member ─────────────────────────────────────────────────
async function mealPlanRoute({ insertError = null, adminThrows = false } = {}) {
  const notices = [];
  const chain = (table) => {
    const q = {
      select: () => q, eq: () => q, in: () => q,
      update: () => q,
      insert: () => q,
      maybeSingle: async () => ({ data: table === 'nutritionists' ? { id: 5 } : null, error: null }),
      single: async () => (insertError ? { data: null, error: insertError } : { data: { id: 'plan-1' }, error: null }),
      then: (res, rej) => Promise.resolve(table === 'subscriptions' ? { data: [{ client_id: A }], error: null } : { data: null, error: null }).then(res, rej),
    };
    return q;
  };
  const client = { from: chain };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/nutritionist/meal-plan/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => ({ id: COACH.id }), clientForRequest: async () => client }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/access-guards.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/access-guards.mjs')).href)],
      ['@/lib/compliance/server', { gateProviderAction: async () => ({ enforced: false, allowed: true, disclaimer: null, scope: null, reason: null }), blockMessage: () => '' }],
      ['@/lib/supabase/admin', { createAdminClient: () => { if (adminThrows) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY'); return { admin: true }; } }],
      ['@/lib/notify', { createNotification: async (c, n) => { notices.push([c, n]); return true; } }],
    ]),
  });
  const res = await mod.POST(new Request('https://x/api/nutritionist/meal-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: A, title: 'Lean week', days: [{ day: 'Mon' }] }) }));
  return { status: res.status, notices };
}

test('a published meal plan notifies the member on Eat; a failed publish notifies no one (L8)', async () => {
  const ok = await mealPlanRoute();
  assert.equal(ok.status, 200);
  assert.equal(ok.notices.length, 1);
  const [client, n] = ok.notices[0];
  assert.deepEqual(client, { admin: true }, 'written as the service role: the row is the member\'s');
  assert.deepEqual(n, { userId: A, type: 'meal_plan', title: 'New meal plan from your coach', body: 'Lean week', route: 'eat', data: { mealPlanId: 'plan-1' } });
  const R = await import(pathToFileURL(join(ROOT, 'public/newdesign/notificationRoutes.mjs')).href);
  assert.equal(R.ROUTES.eat, 'member');
  const failed = await mealPlanRoute({ insertError: { message: 'boom' } });
  assert.equal(failed.status, 500);
  assert.equal(failed.notices.length, 0);
});

// ── 6. The coach app: NEW rows, and records that match the website's ────────────────────────────
test('the app\'s records carry New, the join date, the board and a known "no check-in", as the website\'s do', async () => {
  const M = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/signalsMap.mjs')).href);
  const ob = { trainer: { day: 3, steps: [{ key: 'hello', done: false }] } };
  const rec = M.recordFromCoachData({ id: 'u', name: 'Jordan', isNew: true, joinedAt: ago(2), onboarding: ob, checkins: [], stats: { daysLogged7d: 0 } });
  assert.deepEqual(rec.profile, { id: 'u', name: 'Jordan', isNew: true, joinedAt: ago(2) });
  assert.equal(rec.onboarding, ob);
  assert.deepEqual(rec.checkIn, { lastWeekOf: null }, 'a read that answered none is a known none (L8)');
  assert.equal('checkIn' in M.recordFromCoachData({ id: 'u', name: 'J', checkins: null }), false, 'a failed read stays unset');
  // The roster, the overview batch and the record builder are wired together.
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /sessions: c\.sessions \|\| 0, isNew: !!c\.isNew, joinedAt: c\.joinedAt \|\| null \}\)\);/);
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /for \(let i = 0; i < list\.length; i \+= 50\) \{[\s\S]{0,300}\/api\/clients\/shared-overview/);
  const sig = read('mobile-app/src/services/shapeSignals.js');
  assert.match(sig, /id: c\.id, name: c\.name, isNew: c\.isNew, joinedAt: c\.joinedAt, stats,/);
  assert.match(sig, /lastContact: ov && ov\.lastContact \? ov\.lastContact : null,\s+onboarding: ov && ov\.onboarding \? ov\.onboarding : null,/);
});

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, from);
  return src.slice(a, b);
}
// A translator that returns the English default with {name} filled (ICU plurals are not needed here).
const coachTr = (_k, o = {}) => String(o.defaultValue || '').replace(/\{(\w+)\}/g, (_m, k) => (o[k] != null ? String(o[k]) : ''));

test('a new client with nothing to flag is a NEW row in the app, led by their board\'s next step', () => {
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  const code = slice(pros, 'function bsOnboardingFor(', 'function BSProOnboardingStation(') + slice(pros, 'function bsRowFromTriage(', '// Severity for a roster row');
  const api = new Function('coachTr', code + ';return { bsRowFromTriage, bsOnboardingNext, bsOnboardingFor };')(coachTr);
  const t = { GREEN: 'g', RUST: 'r', AMBER: 'a', BLUE: 'b' };
  const ob = { trainer: { day: 3, steps: [{ key: 'joined', done: true }, { key: 'hello', done: false }, { key: 'plan', done: false, due: '2026-10-20' }] } };
  const row = (severity, profile, extra = {}) => ({ severity, client: { profile, onboarding: ob, ...extra }, flags: [], reasons: [] });
  const fresh = api.bsRowFromTriage(row('green', { id: 'u', name: 'Jordan Reyes', isNew: true }), 'trainer', t);
  assert.equal(fresh._sig.sev, 'new');
  assert.equal(fresh._sig.rank, 2);
  assert.equal(fresh._sig.label, 'NEW');
  assert.equal(fresh._sig.directive, 'New · Your first message');
  assert.equal(fresh.s, 'onboard');
  const settled = api.bsRowFromTriage(row('green', { id: 'u', name: 'Sam', isNew: false }), 'trainer', t);
  assert.equal(settled._sig.sev, 'green');
  assert.equal(settled._sig.label, 'ON TRACK');
  const flagged = api.bsRowFromTriage({ severity: 'amber', client: { profile: { id: 'u', name: 'J', isNew: true }, onboarding: ob }, flags: [{ reason: 'Say hello' }], reasons: [] }, 'trainer', t);
  assert.equal(flagged._sig.sev, 'amber', 'a flag outranks New');
  const noBoard = api.bsRowFromTriage({ severity: 'green', client: { profile: { id: 'u', name: 'J', isNew: true } }, flags: [], reasons: [] }, 'nutritionist', t);
  assert.equal(noBoard._sig.directive, 'New client — open their first 30 days.');
  assert.match(api.bsOnboardingNext({ steps: [{ key: 'plan', done: false, due: '2026-10-20' }] }, 'nutritionist'), /^Meal plan live · due /);
  assert.equal(api.bsOnboardingFor({ onboarding: ob }, 'dietitian'), null, 'a dietitian reads the nutritionist board');
  // The client page shows the board from the same overview, and Say hello opens the thread.
  assert.match(pros, /setOnboard\(bsOnboardingFor\(d, role\)\)/);
  assert.match(pros, /<BSProOnboardingStation ob=\{onboard\} role=\{role\} clientUid=\{clientUid\}[^>]*onSayHello=\{\(\) => fireEvt\('shape:proMessageClient'\)\} onSaved=\{reloadOnboard\} \/>/);
  assert.match(pros, /window\.ShapeWeekOne\.set\(clientUid, role, count, startsOn\)/);
});

// ── 7. The member: a coach preparing their plan, and a check-in about plans that exist ─────────────
test('the plan read names the coach the member pays, their thread and their week-one target (M16)', async () => {
  const U = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const load = async (db) => loadRealModule(join(ROOT, 'src/app/api/client/plan/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', { NextResponse: { json: (body, init) => ({ body, init }) } }],
      ['@/lib/request-auth', { clientForRequest: async () => db, currentUser: async () => ({ id: U }) }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
    ]),
  });
  const tables = {
    client_workouts: [], client_meal_plans: [],
    client_programs: [{ user_id: U, detail: { training: { weekOne: { count: 4, startsOn: '2026-10-20', providerId: 7 } } } }],
    subscriptions: [{ client_id: U, provider_role: 'trainer', provider_id: 7, status: 'active', created_at: ago(2) }],
    trainers: [{ id: 7, name: 'Tom Trainer' }], nutritionists: [],
    conversations: [{ id: 'conv-t', client_id: U, kind: 'direct', provider_role: 'trainer', provider_id: 7 }],
  };
  const { body } = await (await load(fakeSupabase({ tables }))).GET(new Request('https://x/api/client/plan'));
  assert.equal(body.training.hasPlan, false);
  assert.deepEqual(body.training.coaching, { name: 'Tom Trainer', conversationId: 'conv-t', weekOne: { count: 4, startsOn: '2026-10-20' } });
  assert.equal(body.meals.coaching, null, 'no nutritionist: null, a known none');
  // A target the member's previous trainer set is not this coach's (Codex on #2378).
  const before = { ...tables, client_programs: [{ user_id: U, detail: { training: { weekOne: { count: 4, startsOn: '2026-10-20', providerId: 9 } } } }] };
  assert.equal((await (await load(fakeSupabase({ tables: before }))).GET(new Request('https://x/api/client/plan'))).body.training.coaching.weekOne, null);
  const failed = (await (await load(fakeSupabase({ tables, fail: ['subscriptions'] }))).GET(new Request('https://x/api/client/plan'))).body;
  assert.equal('coaching' in failed.training, false, 'an unread subscription is "could not tell", not "no coach"');
});

test('the member app and the website say the coach is preparing the plan, and ask adherence only of a plan', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  // Train: a coached member with no plan gets the coach card, not "Find a trainer" and the build door.
  assert.match(client, /\{trainCoaching\s+\? <BSCoachPreparing role="trainer" coaching=\{trainCoaching\} onOpenSession=\{\(\) => \{ setOpenSession\(true\); setSession\(true\); \}\} \/>\s+: <>\s+<BSFindCoachBar role="trainer"/);
  assert.match(client, /setTrainCoaching\(p\?\.training\?\.coaching \|\| null\);/);
  // Eat: the same for a nutritionist, before any menu.
  assert.match(client, /\{bsEatSignedIn && eatPlanRead && !liveMealDays && eatCoaching && <BSCoachPreparing role="nutritionist" coaching=\{eatCoaching\} \/>\}/);
  assert.match(client, /if \(!cancelled\) setEatCoaching\(p\?\.meals\?\.coaching \|\| null\);\s+if \(cancelled \|\| !p\?\.meals\?\.hasPlan\) return;/);
  // The check-in's adherence questions follow the plans, in the app and on the website.
  const RATINGS = [['trainingAdherence'], ['nutritionAdherence'], ['sleep'], ['energy']];
  const app = new Function('BS_CHECKIN_RATINGS', slice(client, 'function bsCheckinRatings(', 'const BS_MEASURE_SITES') + ';return bsCheckinRatings;')(RATINGS);
  const web = new Function('CK_RATINGS', slice(read('public/newdesign/dashProgress.jsx'), 'function dprCheckinRatings(', 'function DprCheckinForm(') + ';return dprCheckinRatings;')(RATINGS);
  for (const f of [app, web]) {
    assert.deepEqual(f(null).map(([k]) => k), ['trainingAdherence', 'nutritionAdherence', 'sleep', 'energy'], 'until it is known, every question');
    assert.deepEqual(f({ training: false, nutrition: false }).map(([k]) => k), ['sleep', 'energy']);
    assert.deepEqual(f({ training: true, nutrition: false }).map(([k]) => k), ['trainingAdherence', 'sleep', 'energy']);
  }
  assert.match(client, /\{bsCheckinRatings\(plans\)\.map\(/);
  assert.match(read('public/newdesign/dashProgress.jsx'), /\{dprCheckinRatings\(plans\)\.map\(/);
  // The website's Train builder says so too.
  const train = read('public/newdesign/dashTrain.jsx');
  assert.match(train, /<DtrBuilder self=\{selfData\} onChanged=\{reloadAll\} coaching=\{plan && plan\.training && !plan\.training\.hasPlan && plan\.training\.coaching \? plan\.training\.coaching : null\} \/>/);
  assert.match(train, /is preparing your plan\. It shows up here the moment they publish it/);
  const nutri = read('public/newdesign/dashNutri.jsx');
  assert.match(nutri, /\{plan && plan\.meals && plan\.meals\.coaching \? <>[\s\S]{0,400}is preparing your meal plan\./);
});

// ── 7. Fable's review of fix 4 ───────────────────────────────────────────────────────────────────
test('Fable 1: the member DM is contact too: a coach who wrote there has messaged them, and said hello', async () => {
  const key = COACH.id < A ? `${COACH.id}:${A}` : `${A}:${COACH.id}`;
  const later = new Date(Date.now() - DAY).toISOString();
  const me = { trainerId: 7, nutritionistId: null, userId: COACH.id };
  const dmOnly = overviewDb({
    conversations: [{ id: 'dm-1', kind: 'direct', dm_key: key, client_id: null, provider_id: null, provider_role: null, last_message_at: later }],
    messages: [{ conversation_id: 'dm-1', sender_id: COACH.id, created_at: later, metadata: {} }],
  });
  const ov = await overview(dmOnly, me);
  assert.deepEqual(ov.lastContact, { trainer: later, nutritionist: null }, 'the DM is the caller\'s own contact');
  assert.equal(stepsOf(ov.onboarding.trainer).hello.done, true, 'their first message was in the DM');
  assert.equal(stepsOf(ov.onboarding.trainer).welcome.done, false, 'Shape\'s welcome lives in the coach thread only');
  // Another pair's DM is not this coach's contact.
  const other = await overview(overviewDb({ conversations: [{ id: 'dm-2', kind: 'direct', dm_key: `${A}:99999999-9999-4999-8999-999999999999`, client_id: null, provider_id: null, last_message_at: later }], messages: [] }), me);
  assert.deepEqual(other.lastContact, { trainer: null, nutritionist: null });
  // A failed DM read is unknown, never "never messaged".
  const failing = await overview(overviewDb({ fail: ['conversations'] }), me);
  assert.equal('lastContact' in failing, false);
  assert.equal(stepsOf(failing.onboarding.trainer).hello.done, null);
  // The leg itself: the DM counts for each role the caller coaches the client in, and only those.
  assert.deepEqual(LEGS.bsLastContactLeg([], { trainer: 7, nutritionist: null }, { last_message_at: later }), { trainer: later, nutritionist: null });
  assert.deepEqual(LEGS.bsLastContactLeg([{ provider_role: 'trainer', provider_id: 7, last_message_at: ago(1) }], { trainer: 7, nutritionist: 3 }, { last_message_at: ago(5) }), { trainer: ago(1), nutritionist: ago(5) });
});

test('Fable 2: an empty check-in read is "none" only where the caller could read check-ins', async () => {
  const coach = await overview(overviewDb(), { trainerId: 7, nutritionistId: null, userId: COACH.id });
  assert.deepEqual(coach.checkins, [], 'the client\'s coach: a known none');
  const bookingOnly = await overview(overviewDb(), { trainerId: 8, nutritionistId: null, userId: COACH.id });
  assert.equal(bookingOnly.checkins, null, 'a coach the client does not subscribe to: not shared, never "no first check-in"');
  const self = await overview(overviewDb(), { trainerId: null, nutritionistId: null, userId: A });
  assert.deepEqual(self.checkins, [], 'the client\'s own view, as before');
  // The app: the three-state reader, and only for a subscriber.
  const be = read('mobile-app/src/services/shapeBackend.js');
  const i = be.indexOf('  checkinsKnown: async (userId, limit = 6) => {');
  const kit = new Function('supabase', 'return {' + be.slice(i, be.indexOf('\n  },', i) + 4) + '};');
  const answering = (r) => kit({ rpc: async () => r });
  assert.deepEqual(await answering({ data: [], error: null }).checkinsKnown('u'), []);
  assert.equal(await answering({ data: null, error: { message: 'down' } }).checkinsKnown('u'), null, 'an error is unknown');
  assert.equal(await kit({ rpc: async () => { throw new Error('offline'); } }).checkinsKnown('u'), null);
  assert.equal(await kit(null).checkinsKnown('u'), null);
  assert.match(read('mobile-app/src/services/shapeSignals.js'), /kit\.checkinsKnown && c\.joinedAt \? kit\.checkinsKnown\(c\.id, 2\)\.catch\(\(\) => null\) : null,/);
});

test('Fable 3: a new client whose overview did not arrive stays on the board, as unread', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#today' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const api = new Function('React', 'window', 'serif', 'sans', todayCode + ';return {DashOnboardingPanel,dashOnboardingRows};')(React, dom.window, 'serif', 'sans');
  const day = (n) => new Date(Date.now() - n * DAY).toISOString();
  const clients = [
    { profile: { id: 'failed', name: 'Ola Bright', joinedAt: day(3) }, onboarding: null, progressRead: { state: 'unavailable' } },
    { profile: { id: 'waiting', name: 'Max Ito', joinedAt: day(9) }, onboarding: null, progressRead: { state: 'loading' } },
    { profile: { id: 'settled', name: 'Kim', joinedAt: day(45) }, onboarding: null, progressRead: { state: 'unavailable' } },
    { profile: { id: 'ready', name: 'Rae', joinedAt: day(40) }, onboarding: null, progressRead: { state: 'ready' } },
    { profile: { id: 'booked', name: 'Bo' }, onboarding: null, progressRead: { state: 'unavailable' } },
    // Codex on #2378: the overview arrived (ready) without this coach's board, its subscriptions
    // read having failed; the roster says day 6, so the client stays, unread.
    { profile: { id: 'partial', name: 'Pat Moss', joinedAt: day(5) }, progressRead: { state: 'ready' } },
    { profile: { id: 'other-role', name: 'Oz Ng', joinedAt: day(7) }, onboarding: { nutritionist: { day: 8, steps: [] } }, progressRead: { state: 'ready' } },
  ];
  assert.deepEqual(api.dashOnboardingRows(clients, 'trainer').map((c) => [c.profile.id, c.unread]), [['failed', 'unavailable'], ['partial', 'unavailable'], ['other-role', 'unavailable'], ['waiting', 'loading']]);
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(api.DashOnboardingPanel, { clients, role: 'trainer', live: true })));
    const text = document.body.textContent;
    assert.ok(!/No clients in their first 30 days/.test(text), 'not "no new clients"');
    assert.match(text, /Ola Bright.*Couldn't read their first 30 days/);
    assert.match(text, /Max Ito.*Loading their first 30 days/);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = before.window; globalThis.document = before.document; globalThis.IS_REACT_ACT_ENVIRONMENT = before.act;
  }
});

test('Fable 4: a meal plan that is live is answered as live, even when its notice cannot be written', async () => {
  const orig = console.error; console.error = () => {};
  try {
    const r = await mealPlanRoute({ adminThrows: true });
    assert.equal(r.status, 200);
    assert.equal(r.notices.length, 0);
  } finally { console.error = orig; }
});

test('Fable 5: a check-in filed before the subscription is not the first one; the first week is named only when the read reaches it', () => {
  const joinedAt = '2026-10-16T09:00:00Z';
  const now = Date.parse('2026-10-20T12:00:00Z');
  const before = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, checkins: [{ week_of: '2026-10-12', created_at: '2026-10-12T08:00:00Z' }], now });
  assert.equal(stepsOf(before).checkin.done, false, 'filed on the Monday, subscribed on the Friday');
  const after = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, checkins: [{ week_of: '2026-10-12', created_at: '2026-10-18T08:00:00Z' }], now });
  assert.deepEqual([stepsOf(after).checkin.done, stepsOf(after).checkin.at], [true, '2026-10-12'], 'filed after joining, for the joining week');
  const undated = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, checkins: [{ week_of: '2026-10-12' }], now });
  assert.equal(stepsOf(undated).checkin.done, true, 'no filing time: the week ending after the join day counts, as before');
  // Four rows (the read's limit), all since joining: done, but the oldest of them may not be the first.
  const late = Date.parse('2026-11-14T12:00:00Z');
  const four = ['2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19'].map((w) => ({ week_of: w, created_at: w + 'T10:00:00Z' }));
  const capped = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, checkins: four, now: late });
  assert.deepEqual([stepsOf(capped).checkin.done, stepsOf(capped).checkin.at], [true, null]);
  assert.equal(LEGS.CHECKIN_READ_LIMIT, 4);
  const three = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, checkins: four.slice(0, 3), now: late });
  assert.equal(stepsOf(three).checkin.at, '2026-10-26', 'below the limit the oldest is the first');
  const crossed = LEGS.bsOnboardingLeg({ role: 'trainer', joinedAt, checkins: [...four.slice(0, 3), { week_of: '2026-10-12', created_at: '2026-10-12T08:00:00Z' }], now: late });
  assert.equal(stepsOf(crossed).checkin.at, '2026-10-26', 'a row from before joining shows the read reached past the first');
  assert.match(read('src/lib/shared-overview.ts'), /get_client_checkins', \{ p_user_id: clientId, p_limit: CHECKIN_READ_LIMIT \}/);
  assert.match(read('public/newdesign/dashWeek.jsx'), /const DWK_CHECKIN_LIMIT = 4;/, 'the website week view keeps the same number');
});
