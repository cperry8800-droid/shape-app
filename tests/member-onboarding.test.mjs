// The member's own first 30 days (client-onboarding review, fix 4: the board's member mode). Driven here:
//   1. memberOnboardingBoard, the pure board (src/lib/member-onboarding.mjs);
//   2. GET and POST /api/client/onboarding, through the real route over a fake client;
//   3. the website's Today card, mounted, saving the member's own target;
//   4. the app's Home station, mounted, and where it sits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core'), preset = require('next/dist/compiled/babel/preset-react');
const M = await import(pathToFileURL(join(ROOT, 'src/lib/member-onboarding.mjs')).href);
const LEGS = await import(pathToFileURL(join(ROOT, 'src/lib/coach-client-legs.mjs')).href);
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-15T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const stepsOf = (b) => Object.fromEntries(b.steps.map((s) => [s.key, s]));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, from);
  return src.slice(a, b);
}
const NONE = { training: null, nutrition: null };
const base = (over = {}) => ({
  joinedAt: ago(2), now: NOW, answers: {}, setup: null, devices: [], weighIn: null, measurements: [],
  firstPlan: null, sessions: [], checkins: [], coaching: NONE, ...over,
});

// ── 1. The board ─────────────────────────────────────────────────────────────────────────────────
test('the board ticks each step from its record, and names the next one', () => {
  const b = M.memberOnboardingBoard(base({ answers: { training: { sessions_per_week: '4', experience: 'beginner' }, onboarding: { wantsCoaching: false } } }));
  assert.equal(b.day, 3);
  assert.equal(b.days, 30);
  assert.deepEqual(b.steps.map((s) => s.key), ['joined', 'profile', 'plan', 'workout', 'review', 'progress']);
  const s = stepsOf(b);
  assert.equal(s.joined.done, true);
  assert.equal(s.profile.done, false, 'no goal on file');
  assert.equal(s.plan.done, false);
  assert.equal(s.workout.done, false);
  assert.equal(s.review.done, false);
  assert.equal(s.progress.done, false);
  assert.equal(b.next, 'profile');
  assert.equal(s.review.due, '2026-10-19', 'week one runs seven days from the join day');
  assert.equal(s.progress.due, '2026-11-11', 'day 30, the board\'s last');
  assert.equal(b.suggested, 4, 'their own answer: sessions per week');
  assert.equal(b.profile.experience, 'beginner');
  assert.equal(b.profile.wantsCoaching, false);
  assert.deepEqual(b.window, { firstDay: '2026-10-13', lastDay: '2026-11-11' });

  const done = M.memberOnboardingBoard(base({
    joinedAt: ago(29),
    answers: { identity: { goal: 'Lose fat' }, goals: { primaryGoal: 'fat_loss' } },
    firstPlan: { at: ago(28), title: 'Foundations', coach: false },
    sessions: [{ started_at: ago(27), created_at: ago(27) }],
    checkins: [{ week_of: '2026-09-21', created_at: ago(23) }],
    measurements: [{ measured_on: '2026-10-14' }],
  }));
  const d = stepsOf(done);
  assert.equal(done.profile.goal, 'Lose fat', 'the label mirror, never the token');
  assert.ok(Object.values(d).every((x) => x.done === true));
  assert.equal(d.plan.title, 'Foundations');
  assert.equal(d.plan.by, 'you');
  assert.equal(done.next, null);
});

test('a failed read is unknown, never "to do"; past day 30 or with no membership there is no board', () => {
  const b = M.memberOnboardingBoard(base({ answers: undefined, firstPlan: undefined, sessions: undefined, checkins: undefined, measurements: undefined, weighIn: undefined }));
  const s = stepsOf(b);
  for (const k of ['profile', 'plan', 'workout', 'review', 'progress']) assert.equal(s[k].done, null, k);
  assert.equal(b.profile, null);
  assert.equal(b.start.weighIn, undefined);
  assert.equal(b.start.measuredOn, undefined);
  assert.equal(b.next, null, 'nothing unknown is named as the next step');
  assert.equal(M.memberOnboardingBoard(base({ joinedAt: ago(30) })), null, 'past the 30 days');
  assert.equal(M.memberOnboardingBoard(base({ joinedAt: null })), null, 'no membership row: a coach or an admin');
  assert.equal(M.memberOnboardingBoard(base({ joinedAt: new Date(NOW + DAY).toISOString() })), null);
});

test('only records since joining count, and a measurement dated after today never completes day 30', () => {
  const b = M.memberOnboardingBoard(base({
    joinedAt: ago(29),
    sessions: [{ started_at: ago(40), created_at: ago(29.5) }],
    checkins: [{ week_of: '2026-09-07', created_at: ago(35) }],
    measurements: [{ measured_on: '2026-10-25' }, { measured_on: '2026-09-01' }],
  }));
  const s = stepsOf(b);
  assert.equal(s.workout.done, false, 'a session started before they joined');
  assert.equal(s.review.done, false, 'a check-in filed before they joined');
  assert.equal(s.progress.done, false, 'a future date is the member\'s clock, not a measurement');
  assert.equal(b.start.measuredOn, null);
  // Joined 2026-09-16: day 28 is 2026-10-13.
  const day28 = M.memberOnboardingBoard(base({ joinedAt: ago(29), measurements: [{ measured_on: '2026-10-13' }] }));
  assert.equal(stepsOf(day28).progress.done, true, 'from day 28 on');
  const early = M.memberOnboardingBoard(base({ joinedAt: ago(29), measurements: [{ measured_on: '2026-10-12' }] }));
  assert.equal(stepsOf(early).progress.done, false, 'a day-27 measurement is the starting point, not the day-30 review');
  assert.equal(early.start.measuredOn, '2026-10-12');
});

test('the week-one target is the member\'s own, set during this membership, counted against their sessions', () => {
  const setup = { weekOne: { count: 3, startsOn: '2026-10-14', setAt: ago(1) } };
  const b = M.memberOnboardingBoard(base({
    setup,
    sessions: [{ started_at: '2026-10-14T08:00:00Z', created_at: '2026-10-14T09:00:00Z' }, { started_at: '2026-10-21T08:00:00Z', created_at: '2026-10-21T09:00:00Z' }, { started_at: '2026-10-13T18:00:00Z', created_at: '2026-10-13T19:00:00Z' }],
  }));
  assert.deepEqual(b.weekOne, { count: 3, startsOn: '2026-10-14' });
  assert.equal(b.setBy, 'you');
  assert.equal(b.weekOneDone, 1, 'only sessions inside week one');
  assert.equal(b.suggested, null);
  assert.equal(stepsOf(b).review.due, '2026-10-20', 'the review follows the start they chose');
  // A target saved before this membership began is an earlier run's.
  const old = M.memberOnboardingBoard(base({ setup: { weekOne: { count: 3, startsOn: '2026-10-14', setAt: ago(9) } } }));
  assert.equal(old.weekOne, null);
  for (const bad of [{ count: 0 }, { count: 15 }, { count: 2.5 }, { count: 'x' }, null]) {
    assert.equal(M.memberWeekOneOf({ weekOne: bad }, null), null, JSON.stringify(bad));
  }
  assert.equal(M.memberWeekOneOf({ weekOne: { count: '3' } }, null).count, 3, 'a stored numeral reads as its number');
  assert.equal(M.memberWeekOneOf({ weekOne: { count: 3, startsOn: '20261014' } }, null).startsOn, null, 'a start that is not a day is none');
  const unread = M.memberOnboardingBoard(base({ setup: undefined }));
  assert.equal(unread.weekOneUnread, true);
  assert.equal(unread.weekOne, null);
  assert.equal(stepsOf(unread).review.due, null, 'a due date that hangs on an unread start is unknown');
});

test('a member who pays a trainer: the trainer sets the target, and the plan is theirs to write', () => {
  const coaching = { training: { name: 'Tom Trainer', providerId: 7, since: ago(2) }, nutrition: null };
  const b = M.memberOnboardingBoard(base({ coaching, answers: { identity: { goal: 'Build strength' } }, programDetail: { training: { weekOne: { count: 4, startsOn: '2026-10-20', providerId: 7, setAt: ago(1) } } } }));
  assert.deepEqual(b.weekOne, { count: 4, startsOn: '2026-10-20' });
  assert.equal(b.setBy, 'coach');
  assert.equal(b.coachSets, true);
  assert.equal(b.coaching.training, 'Tom Trainer');
  const s = stepsOf(b);
  assert.equal(s.plan.waiting, true, 'the trainer is writing it');
  assert.equal(b.next, 'workout', 'the plan is not the member\'s step while they wait');
  // The coach board's own rule: a predecessor's target, or one from an earlier run, is not this one's.
  assert.equal(M.memberOnboardingBoard(base({ coaching, programDetail: { training: { weekOne: { count: 4, providerId: 9 } } } })).weekOne, null);
  assert.equal(M.memberOnboardingBoard(base({ coaching, programDetail: { training: { weekOne: { count: 4, providerId: 7, setAt: ago(5) } } } })).weekOne, null);
  // Their own saved target does not apply while a trainer sets it.
  const own = M.memberOnboardingBoard(base({ coaching, programDetail: {}, setup: { weekOne: { count: 2, setAt: ago(1) } } }));
  assert.equal(own.weekOne, null);
  assert.equal(own.suggested, null);
  assert.equal(M.memberOnboardingBoard(base({ coaching, programDetail: undefined })).weekOneUnread, true);
  // A coaching read that failed: "could not tell", never "no coach".
  const unknown = M.memberOnboardingBoard(base({ coaching: undefined }));
  assert.equal(unknown.coaching, undefined);
  assert.equal(unknown.weekOneUnread, true);
  assert.equal(stepsOf(unknown).plan.waiting, false);
  // A coach's plan counts as the plan.
  const live = M.memberOnboardingBoard(base({ coaching, programDetail: {}, firstPlan: { at: ago(1), title: 'Week 1', coach: true } }));
  assert.equal(stepsOf(live).plan.by, 'coach');
  assert.equal(stepsOf(live).plan.waiting, false);
});

// ── 2. The route ─────────────────────────────────────────────────────────────────────────────────
const U = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
// The route reads the real clock, so its records are dated from it.
const rago = (days) => new Date(Date.now() - days * DAY).toISOString();
const rday = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
function tablesFor(over = {}) {
  return {
    platform_subscriptions: [{ client_id: U, created_at: rago(2) }, { client_id: 'someone-else', created_at: rago(1) }],
    user_goals: [
      { user_id: U, kind: 'client_identity', data: { goal: 'Build strength' } },
      { user_id: U, kind: 'client_training_prefs', data: { sessions_per_week: '3', experience: 'novice' } },
      { user_id: U, kind: 'client_onboarding', data: { wantsCoaching: false } },
      { user_id: U, kind: 'health_profile', data: { consentAt: rago(2), injuries: 'knee' } },
    ],
    user_integrations: [{ user_id: U, provider: 'whoop' }, { user_id: U, provider: 'spotify' }],
    client_weigh_ins: [{ user_id: U, logged_on: rday(1), weight: 82, unit: 'kg' }, { user_id: U, logged_on: rday(14), weight: 84, unit: 'kg' }],
    client_measurements: [],
    client_workouts: [{ client_id: U, status: 'published', created_at: rago(1), title: 'Foundations · Day 1', trainer_id: null }],
    workout_sessions: [],
    client_checkins: [],
    subscriptions: [],
    trainers: [], nutritionists: [], client_programs: [],
    ...over,
  };
}
async function route(db, { denied = null, user = { id: U } } = {}) {
  const upserts = [];
  const client = {
    ...db,
    from(table) {
      const q = db.from(table);
      q.upsert = async (row, opts) => { upserts.push([table, row, opts]); return { error: null }; };
      return q;
    },
  };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/client/onboarding/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', { NextResponse: { json: (body, init) => ({ body, status: (init && init.status) || 200 }) } }],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => user }],
      ['@/lib/require-membership', { requireMembership: async () => denied }],
      ['@/lib/integrations/providers', { PROVIDERS: { whoop: { label: 'WHOOP' }, spotify: { label: 'Spotify' } } }],
      ['@/lib/member-onboarding.mjs', M],
    ]),
  });
  const get = () => mod.GET(new Request('https://x/api/client/onboarding'));
  const post = (body) => mod.POST(new Request('https://x/api/client/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { get, post, upserts };
}

test('GET builds the board from the member\'s own records', async () => {
  const { get } = await route(fakeSupabase({ tables: tablesFor() }));
  const { status, body } = await get();
  assert.equal(status, 200);
  const b = body.board;
  assert.equal(b.day, 3);
  assert.equal(b.profile.goal, 'Build strength');
  assert.equal(b.profile.screening, true);
  assert.equal(b.profile.experience, 'novice');
  assert.deepEqual(b.profile.devices, ['WHOOP'], 'a music service is not a device');
  assert.equal('injuries' in b.profile, false, 'nothing of the screening leaves the server but that it is on file');
  assert.deepEqual(b.start.weighIn, { on: rday(1), weight: 82, unit: 'kg' }, 'the first weigh-in since joining');
  const s = stepsOf(b);
  assert.equal(s.profile.done, true);
  assert.equal(s.plan.done, true);
  assert.equal(s.plan.title, 'Foundations · Day 1');
  assert.equal(b.next, 'workout');
  assert.equal(b.suggested, 3);
  assert.deepEqual(b.coaching, { training: null, nutrition: null });
});

test('GET: no board past day 30 or with no membership row; a failed read is unknown; the gate holds', async () => {
  const late = await route(fakeSupabase({ tables: tablesFor({ platform_subscriptions: [{ client_id: U, created_at: rago(40) }] }) }));
  assert.deepEqual((await late.get()).body, { ok: true, board: null });
  const none = await route(fakeSupabase({ tables: tablesFor({ platform_subscriptions: [] }) }));
  assert.deepEqual((await none.get()).body, { ok: true, board: null });
  const broken = await route(fakeSupabase({ tables: tablesFor(), fail: ['platform_subscriptions'] }));
  const r = await broken.get();
  assert.equal(r.status, 500, 'a membership that could not be read is not "no board"');
  const partial = await route(fakeSupabase({ tables: tablesFor(), fail: ['workout_sessions', 'subscriptions', 'user_goals'] }));
  const b = (await partial.get()).body.board;
  assert.equal(stepsOf(b).workout.done, null);
  assert.equal(stepsOf(b).profile.done, null);
  assert.equal(b.coaching, undefined);
  assert.equal(b.weekOneUnread, true);
  const gate = await route(fakeSupabase({ tables: tablesFor() }), { denied: { body: { code: 'membership_required' }, status: 402 } });
  assert.equal((await gate.get()).status, 402);
  const anon = await route(fakeSupabase({ tables: tablesFor() }), { user: null });
  assert.equal((await anon.get()).status, 401);
});

test('GET: a member who pays a trainer sees the trainer, and the trainer\'s target', async () => {
  const tables = tablesFor({
    client_workouts: [],
    subscriptions: [{ client_id: U, provider_role: 'trainer', provider_id: 7, status: 'active', created_at: rago(2) }],
    trainers: [{ id: 7, name: 'Tom Trainer' }],
    client_programs: [{ user_id: U, detail: { training: { weekOne: { count: 4, startsOn: rday(-5), providerId: 7, setAt: rago(1) } } } }],
  });
  const b = (await (await route(fakeSupabase({ tables }))).get()).body.board;
  assert.equal(b.coaching.training, 'Tom Trainer');
  assert.deepEqual(b.weekOne, { count: 4, startsOn: rday(-5) });
  assert.equal(b.setBy, 'coach');
  assert.equal(stepsOf(b).plan.waiting, true);
});

test('POST saves the member\'s own target, inside their 30 days, and only theirs', async () => {
  const { post, upserts } = await route(fakeSupabase({ tables: tablesFor() }));
  const ok = await post({ count: 3, startsOn: rday(-1) });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { ok: true, weekOne: { count: 3, startsOn: rday(-1) } });
  assert.equal(upserts.length, 1);
  const [table, row, opts] = upserts[0];
  assert.equal(table, 'user_goals');
  assert.equal(row.user_id, U);
  assert.equal(row.kind, 'member_setup', 'its own kind: no whole-document writer of client_onboarding can drop it');
  assert.deepEqual({ ...row.data.weekOne, setAt: 'x' }, { count: 3, startsOn: rday(-1), setAt: 'x' });
  assert.deepEqual(opts, { onConflict: 'user_id,kind' });
  assert.equal((await post({ count: 4 })).status, 200, 'no start: week one starts the day they joined');

  for (const body of [{ count: 0 }, { count: 15 }, { count: 2.5 }, { count: 'x' }, { count: 3, startsOn: '2026-02-30' }, { count: 3, startsOn: 'tomorrow' }, { count: 3, startsOn: rday(3) }, { count: 3, startsOn: rday(-28) }]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body));
  }
  assert.equal(upserts.length, 2, 'nothing refused was written');

  const coached = await route(fakeSupabase({ tables: tablesFor({ subscriptions: [{ client_id: U, provider_role: 'trainer', provider_id: 7, status: 'active', created_at: rago(2) }] }) }));
  const refused = await coached.post({ count: 3 });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'coach_sets');
  assert.equal(coached.upserts.length, 0);
  const unsure = await route(fakeSupabase({ tables: tablesFor(), fail: ['subscriptions'] }));
  assert.equal((await unsure.post({ count: 3 })).status, 500, 'a coaching read that failed cannot tell');
  assert.equal(unsure.upserts.length, 0);
  const late = await route(fakeSupabase({ tables: tablesFor({ platform_subscriptions: [{ client_id: U, created_at: rago(40) }] }) }));
  assert.equal((await late.post({ count: 3 })).status, 409);
  assert.equal(late.upserts.length, 0);
});

test('POST refuses a day that does not exist, even one that would roll into the 30 days', async () => {
  // Joined 18 Nov: the window runs to 17 Dec, and Date.parse reads 31 November as 1 December.
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-11-20T12:00:00Z');
  try {
    const { post, upserts } = await route(fakeSupabase({ tables: tablesFor({ platform_subscriptions: [{ client_id: U, created_at: '2026-11-18T12:00:00.000Z' }] }) }));
    assert.equal((await post({ count: 3, startsOn: '2026-11-31' })).status, 400);
    assert.equal(upserts.length, 0);
    assert.equal((await post({ count: 3, startsOn: '2026-12-01' })).status, 200, 'the real day is accepted');
  } finally { Date.now = realNow; }
});

// ── 3. The website card ─────────────────────────────────────────────────────────────────────────
const dcl = read('public/newdesign/dashClient.jsx');
const cardCode = babel.transformSync(slice(dcl, 'const DCL_SETUP_STEPS = {', 'function ClientDashboardPage() {'), { presets: [preset] }).code;
async function mountWeb(fetchImpl, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/ClientApp.html#today' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  globalThis.fetch = fetchImpl;
  const Board = new Function('React', 'window', 'serif', 'DCL_INK50', 'DCL_TEAL', 'DCL_MONO', 'dashShellHref', cardCode + ';return DclSetupBoard;')(React, dom.window, 'serif', 'ink', 'teal', 'mono', (h) => h);
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(Board)));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await run(dom);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = before.window; globalThis.document = before.document; globalThis.IS_REACT_ACT_ENVIRONMENT = before.act; globalThis.fetch = before.fetch;
  }
}
const sampleBoard = () => M.memberOnboardingBoard(base({
  answers: { identity: { goal: 'Build strength' }, training: { sessions_per_week: '4' }, onboarding: { wantsCoaching: false } },
  firstPlan: null, coaching: NONE,
}));

test('the website card shows the four stages, the timeline, and saves the member\'s own target', async () => {
  const calls = [];
  let board = sampleBoard();
  const fetchImpl = async (url, init = {}) => {
    calls.push([url, init.method || 'GET', init.body ? JSON.parse(init.body) : null]);
    if (init.method === 'POST') {
      board = M.memberOnboardingBoard(base({ answers: { identity: { goal: 'Build strength' } }, setup: { weekOne: { count: 5, startsOn: '2026-10-14', setAt: new Date(NOW).toISOString() } } }));
      return { ok: true, json: async () => ({ ok: true, weekOne: { count: 5, startsOn: '2026-10-14' } }) };
    }
    return { ok: true, json: async () => ({ ok: true, board }) };
  };
  await mountWeb(fetchImpl, async (dom) => {
    const text = () => document.body.textContent;
    assert.match(text(), /Your setup · day 3 of 30/);
    for (const stage of ['01 · What Shape knows', '02 · Starting point', '03 · Pick your plan', '04 · Go live']) assert.ok(text().includes(stage), stage);
    assert.match(text(), /Build strength/);
    assert.match(text(), /4 days \/ week/);
    assert.match(text(), /Not now/);
    assert.match(text(), /Starter programs/);
    assert.match(text(), /Want a coach\?/, 'no coach yet: the fork');
    assert.match(text(), /✓ Joined Shape/);
    assert.match(text(), /○ Plan set/);
    assert.match(text(), /you said 4 sessions a week/);
    assert.ok(!/Confirm|tick/i.test(text()), 'no box for the member to tick');
    const button = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    await act(async () => button('Set target').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    const input = document.querySelector('input[type="number"]');
    assert.equal(input.value, '4', 'prefilled from their own answer');
    const date = document.querySelector('input[type="date"]');
    assert.equal(date.min, '2026-10-13');
    assert.equal(date.max, '2026-11-11');
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await act(async () => { setValue.call(input, '5'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    await act(async () => button('Save').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const posted = calls.find((c) => c[1] === 'POST');
    assert.deepEqual(posted, ['/api/client/onboarding', 'POST', { count: 5, startsOn: '2026-10-13' }]);
    assert.equal(calls.filter((c) => c[1] === 'GET').length, 2, 'the board is read again after a save');
    assert.match(text(), /Your target: 5 workouts in week 1/);
    assert.match(text(), /set by you/);
  });
});

test('the website card: a trainer sets the target; a failed read or no board shows nothing', async () => {
  const coached = M.memberOnboardingBoard(base({ coaching: { training: { name: 'Tom Trainer', providerId: 7, since: ago(2) }, nutrition: null }, programDetail: {} }));
  await mountWeb(async () => ({ ok: true, json: async () => ({ ok: true, board: coached }) }), async () => {
    const text = document.body.textContent;
    assert.match(text, /Tom Trainer is preparing your plan/);
    assert.match(text, /Tom Trainer sets your week-one target/);
    assert.ok(![...document.querySelectorAll('button')].some((b) => /Set target|Change/.test(b.textContent)), 'not theirs to set');
    assert.ok(!/Want a coach\?/.test(text), 'they have one');
  });
  await mountWeb(async () => ({ ok: true, json: async () => ({ ok: true, board: null }) }), async () => {
    assert.equal(document.getElementById('root').innerHTML, '');
  });
  await mountWeb(async () => ({ ok: false, json: async () => ({ ok: false }) }), async () => {
    assert.equal(document.getElementById('root').innerHTML, '', 'nothing tells a long-standing member their setup "couldn\'t be read"');
  });
  await mountWeb(async () => { throw new Error('offline'); }, async () => {
    assert.equal(document.getElementById('root').innerHTML, '');
  });
});

test('the website card sits on Today, signed in only, above the day', () => {
  assert.match(dcl, /\{live && <DclSetupBoard \/>\}\n\n\s+<div className="dash-today-split">/);
});

// ── 4. The app station ──────────────────────────────────────────────────────────────────────────
const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
// English with {name} filled and ICU plurals resolved, enough for these strings.
const tr = (_k, o = {}) => String(o.defaultValue || '')
  .replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_m, k, one, other) => (o[k] === 1 ? one : other).replace('#', String(o[k])))
  .replace(/\{(\w+)\}/g, (_m, k) => (o[k] != null ? String(o[k]) : ''));

test('the app station: the timeline, the next step, and the member\'s own target', async () => {
  const comp = babel.transformSync(slice(client, 'const BS_SETUP_STEPS = {', 'function BSClientHome('), { presets: [preset] }).code;
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/m/' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  let board = sampleBoard();
  const saves = [];
  let gets = 0;
  dom.window.ShapeMemberSetup = {
    get: async () => { gets++; return { ok: true, board }; },
    setWeekOne: async (count, startsOn) => { saves.push([count, startsOn]); board = M.memberOnboardingBoard(base({ setup: { weekOne: { count, startsOn, setAt: new Date(NOW).toISOString() } } })); return { ok: true }; },
  };
  dom.window.__bsToast = () => {};
  const Station = new Function('React', 'window', 'useBS', 'useShapeTr', 'useStateBSC', 'BSTStationHead', 'bsDateLocale', comp + ';return BSMemberSetupStation;')(
    React, dom.window, () => ({ isLight: false, MONO: 'm', DISPLAY: 'd', INK: 'k', INK50: 'k5', INK70: 'k7' }), () => tr, React.useState,
    ({ label }) => React.createElement('h3', null, label), () => 'en-US');
  const root = createRoot(document.getElementById('root'));
  const nav = [];
  const button = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
  const click = async (b) => act(async () => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
  try {
    await act(async () => { root.render(React.createElement(Station, { onGoal: () => nav.push('goal'), onTrain: () => nav.push('train'), onCheckin: () => nav.push('checkin'), onFindCoach: () => nav.push('market') })); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(document.querySelector('h3').textContent, 'YOUR FIRST 30 DAYS · DAY 3 OF 30');
    const text = document.body.textContent;
    for (const step of ['Joined Shape', 'Goal set', 'Plan set', 'First workout', 'Week-1 review', 'Day-30 review']) assert.ok(text.includes(step), step);
    assert.match(text, /you said 4 sessions a week/);
    await click(button('PICK YOUR PLAN'));
    assert.deepEqual(nav, ['train'], 'the next step opens Train');
    await click(button('FIND A COACH'));
    assert.deepEqual(nav, ['train', 'market']);
    await click(button('SET TARGET'));
    assert.match(document.body.textContent, /4 workouts in week 1/, 'prefilled from their answer');
    await click(button('+'));
    await click(button('SAVE'));
    assert.deepEqual(saves, [[5, '2026-10-13']]);
    assert.equal(gets, 2, 'the board is read again after a save');
    assert.match(document.body.textContent, /5 workouts in week 1/);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = before.window; globalThis.document = before.document; globalThis.IS_REACT_ACT_ENVIRONMENT = before.act;
  }
});

test('the app station sits on Home for a signed-in member, after the check-ins, and reads the route the website reads', () => {
  const home = slice(client, 'function BSClientHome(', '\nfunction ');
  assert.match(home, /\{bsHomeSignedIn && \(\n\s+<BSMemberSetupStation onGoal=\{\(\) => setGoalsPage\(true\)\} onTrain=\{\(\) => goTrain\?\.\(\)\} onCheckin=\{\(\) => setCheckinPage\(true\)\} onFindCoach=\{goMarket \? \(\) => goMarket\(\) : null\} \/>/);
  assert.ok(home.indexOf('<BSMemberSetupStation') > home.indexOf('<BSTodayNudge variant="row"'), 'under the check-ins');
  assert.ok(home.indexOf('<BSMemberSetupStation') < home.indexOf('FOCUS · THE NEXT STOP'), 'above the next stop');
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /fetch\(`\$\{apiBaseUrl \|\| ''\}\/api\/client\/onboarding`, \{ credentials: 'same-origin', headers: sessionsAuthHeaders\(\) \}\)/, 'Bearer in the installed app');
  assert.match(backend, /window\.ShapeMemberSetup = \{ get: getMemberSetup, setWeekOne: setMemberWeekOne \};/);
});

test('every station string is in all 13 catalogs', () => {
  const keys = [...new Set([...client.matchAll(/'home:(setup\.\w+)'/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 30, String(keys.length));
  for (const loc of ['en', 'de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/home.json`));
    for (const k of keys) assert.ok(typeof cat[k] === 'string' && cat[k], `${loc} ${k}`);
  }
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/home.json'));
  for (const k of keys) {
    const m = new RegExp(`'home:${k.replace('.', '\\.')}', (?:\\{ defaultValue: )?'([^']*)'`).exec(client);
    assert.ok(m, k);
    assert.equal(en[k], m[1].replace(/\\'/g, "'"), `en ${k} matches its defaultValue`);
  }
});

test('the route is registered in the War Room', () => {
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/client\/onboarding', 'GET,POST'\],/);
});
