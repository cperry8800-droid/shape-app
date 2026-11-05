// P5's new coach notices (owner, 2026-11-05: "Build package P5"):
//   · check-in received (a trigger on client_checkins),
//   · a member cancelled a session (sessions/manage),
//   · a care-team hand-off when a co-coach changes a shared client's plan (src/lib/care-team.mjs and
//     the messages trigger),
//   · a client's win: a PR, a goal reached, a streak milestone (/api/cron/client-wins).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as Handoff from '../src/lib/handoff.mjs';
import * as Wins from '../src/lib/client-wins.mjs';
import { np, onDay, phrase, sayPart, atTime } from '../mobile-app/src/services/noticeCopy.mjs';
import * as Translator from '../src/lib/ai/memberTranslator.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const CATS = Object.fromEntries(['en', 'es', 'de'].map((loc) => [loc, { home: JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/home.json`)), notice: JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/notice.json`)) }]));
const copyFor = Translator.makeMemberCopy(CATS);
const say = (loc, part) => { const c = copyFor(loc, false); return sayPart(part, c.tr, c.locale); };

// ── the hand-off line ──────────────────────────────────────────────────────────────────────────
const menu = (train, rest) => [
  { dow: 0, tag: 'TRAIN', targets: train }, { dow: 1, tag: 'REST', targets: rest }, { dow: 2, tag: 'TRAIN', targets: train },
];

test('a menu change names the one target that moved, in the thread\'s English and in the copy', () => {
  const prev = menu({ cal: 2100, p: 150, c: 160, f: 70 }, { cal: 1900, p: 150, c: 120, f: 70 });
  const next = menu({ cal: 2100, p: 150, c: 190, f: 70 }, { cal: 1900, p: 150, c: 120, f: 70 });
  assert.deepEqual(Handoff.mealPlanChanges(prev, next), [{ metric: 'c', days: 'training', from: 160, to: 190 }]);
  const line = Handoff.mealPlanHandoff({ coach: 'Rae Lindqvist', client: 'Marcus T.', plan: 'Lean bulk', prevDays: prev, prevTitle: 'Lean bulk', nextDays: next, from: '2026-11-02' });
  assert.equal(line.title, 'Plan change: Marcus T.');
  assert.equal(line.body, 'Rae Lindqvist raised carbs on training days, 160 → 190 g from Mon, Nov 2.');
  // The copy says, in English, what the thread says.
  assert.equal(say('en', line.copy.title), line.title);
  assert.equal(say('en', line.copy.body), line.body);
  // And in another language, from the catalog, the names kept.
  const es = say('es', line.copy.body);
  assert.ok(es && es !== line.body && es.includes('Rae Lindqvist') && /160 → 190 g/.test(es), es);
});

test('a target lowered on both kinds of day reads "every day"; two moves list both', () => {
  const prev = menu({ cal: 2100, p: 150, c: 160, f: 70 }, { cal: 1900, p: 150, c: 120, f: 70 });
  const both = menu({ cal: 2100, p: 140, c: 160, f: 70 }, { cal: 1900, p: 140, c: 120, f: 70 });
  assert.deepEqual(Handoff.mealPlanChanges(prev, both), [{ metric: 'p', days: 'all', from: 150, to: 140 }]);
  const line = Handoff.mealPlanHandoff({ coach: 'Rae', client: 'Priya', plan: 'Cut', prevDays: prev, prevTitle: 'Cut', nextDays: both, from: '2026-11-09' });
  assert.equal(line.body, 'Rae lowered protein on every day, 150 → 140 g from Mon, Nov 9.');
  assert.deepEqual(line.copy.body, np('handoff.macroDown', { coach: 'Rae', metric: phrase('handoff.metric.p'), days: phrase('handoff.days.all'), from: 150, to: 140, unit: 'g', when: onDay('2026-11-09', 'weekday') }));
  // The same start but a different end on each kind of day is two changes, not "every day".
  const apart = menu({ cal: 2100, p: 160, c: 160, f: 70 }, { cal: 1900, p: 140, c: 120, f: 70 });
  assert.deepEqual(Handoff.mealPlanChanges(prev, apart), [{ metric: 'p', days: 'training', from: 150, to: 160 }, { metric: 'p', days: 'rest', from: 150, to: 140 }]);
  // Different moves on the two kinds of day stay two changes.
  const split = menu({ cal: 2200, p: 150, c: 160, f: 70 }, { cal: 1800, p: 150, c: 120, f: 70 });
  const two = Handoff.mealPlanChanges(prev, split);
  assert.deepEqual(two, [{ metric: 'cal', days: 'training', from: 2100, to: 2200 }, { metric: 'cal', days: 'rest', from: 1900, to: 1800 }]);
  const many = Handoff.mealPlanHandoff({ coach: 'Rae', client: 'Priya', plan: 'Cut', prevDays: prev, prevTitle: 'Cut', nextDays: split, from: '2026-11-09' });
  assert.equal(many.body, "Rae changed the meal plan's targets from Mon, Nov 9: calories on training days 2100 → 2200 kcal; calories on rest days 1900 → 1800 kcal.");
  assert.equal(say('en', many.copy.body), 'Rae changed 2 targets in the meal plan from Mon, Nov 9.');
});

test('a republished menu says nothing; a new one names itself; a target missing on either side is no change', () => {
  const prev = menu({ cal: 2100, p: 150, c: 160, f: 70 }, { cal: 1900, p: 150, c: 120, f: 70 });
  assert.equal(Handoff.mealPlanHandoff({ coach: 'Rae', client: 'P', plan: 'Cut', prevDays: prev, prevTitle: 'Cut', nextDays: prev, from: '2026-11-09' }), null);
  const renamed = Handoff.mealPlanHandoff({ coach: 'Rae', client: 'P', plan: 'Maintain', prevDays: prev, prevTitle: 'Cut', nextDays: prev, from: '2026-11-09' });
  assert.equal(renamed.body, 'Rae started a new meal plan, Maintain, from Mon, Nov 9.');
  const first = Handoff.mealPlanHandoff({ coach: '', client: '', plan: 'Base', prevDays: null, prevTitle: null, nextDays: prev, from: '2026-11-09' });
  assert.equal(first.body, 'Their nutritionist started a new meal plan, Base, from Mon, Nov 9.');
  assert.equal(first.title, 'Plan change: A client');
  assert.equal(say('en', first.copy.title), first.title);
  const noTargets = [{ tag: 'TRAIN' }, { tag: 'REST', targets: { cal: 'x' } }];
  assert.deepEqual(Handoff.mealPlanChanges(prev, noTargets), []);
  assert.deepEqual(Handoff.targetsByKind([{ targets: { cal: 2000, p: '150', c: null, f: '' } }]), { training: { cal: 2000, p: 150, c: null, f: null }, rest: null });
  // A bad date keeps the line and drops only the copy that needs it.
  const noDay = Handoff.mealPlanHandoff({ coach: 'Rae', client: 'P', plan: 'Cut', prevDays: prev, prevTitle: 'Cut', nextDays: menu({ cal: 2100, p: 150, c: 170, f: 70 }, { cal: 1900, p: 150, c: 120, f: 70 }), from: '2026-02-30' });
  assert.equal(noDay.body, 'Rae raised carbs on training days, 160 → 170 g.');
  assert.equal(noDay.copy.body, null);
});

test('a program, an adjustment and a week-one target each say one line', () => {
  const p = Handoff.programHandoff({ coach: 'Maya', client: 'Marcus T.', plan: 'Hypertrophy Reset', from: '2026-11-09' });
  assert.equal(p.body, 'Maya started Hypertrophy Reset from Mon, Nov 9.');
  assert.equal(say('en', p.copy.body), p.body);
  assert.equal(Handoff.programHandoff({ coach: 'Maya', client: 'M', plan: '  ', from: '2026-11-09' }), null);
  const a = Handoff.adjustHandoff({ coach: 'Maya', client: 'M', mode: 'deload', sessions: 3, from: '2026-11-03' });
  assert.equal(a.body, 'Maya adjusted the training plan (deload, 3 sessions a week) from Tue, Nov 3.');
  assert.equal(say('en', a.copy.body), a.body);
  const a1 = Handoff.adjustHandoff({ coach: 'Maya', client: 'M', mode: 'progress', sessions: null, from: '2026-11-03' });
  assert.equal(a1.body, 'Maya adjusted the training plan (loads up) from Tue, Nov 3.');
  assert.equal(say('en', a1.copy.body), a1.body);
  assert.equal(Handoff.adjustHandoff({ coach: 'Maya', client: 'M', mode: 'sideways', sessions: 3, from: '2026-11-03' }), null);
  assert.equal(Handoff.adjustHandoff({ coach: 'Maya', client: 'M', mode: 'deload', sessions: 3, from: null }), null);
  const w = Handoff.weekOneHandoff({ coach: 'Maya', client: 'M', role: 'trainer', count: 3 });
  assert.equal(w.body, 'Maya set week one to 3 workouts.');
  assert.equal(say('en', w.copy.body), w.body);
  const n = Handoff.weekOneHandoff({ coach: 'Rae', client: 'M', role: 'nutritionist', count: 1 });
  assert.equal(n.body, 'Rae set week one to 1 day of food logs.');
  assert.equal(say('en', n.copy.body), n.body);
  assert.equal(Handoff.weekOneHandoff({ coach: 'Rae', client: 'M', role: 'nutritionist', count: 0 }), null);
});

// ── posting it ─────────────────────────────────────────────────────────────────────────────────
function fakeDb(handlers) {
  const calls = [];
  const db = {
    calls,
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve(handlers.rpc ? handlers.rpc(name, args) : { data: null, error: null }); },
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') { const r = handlers.from ? handlers.from(q) : { data: [], error: null }; return (res, rej) => Promise.resolve(r).then(res, rej); }
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
  return db;
}
const CareTeam = await import('../src/lib/care-team.mjs');

test('a hand-off is posted as the coach into each care-team thread, marked for the trigger, once per dedupe key', async () => {
  const line = Handoff.programHandoff({ coach: 'Maya', client: 'Marcus', plan: 'Base', from: '2026-11-09' });
  const seen = new Set(['conv-b']);
  const user = fakeDb({
    rpc: (_n, a) => ({ data: a.p_other_user_id === 'rae' ? 'conv-a' : 'conv-b', error: null }),
    from: (q) => {
      const eq = q.ops.find((o) => o[0] === 'eq' && o[1] === 'conversation_id');
      if (q.ops[0][0] === 'select') return { data: eq && seen.has(eq[2]) ? [{ id: 'm' }] : [], error: null };
      return { data: null, error: null };
    },
  });
  const posted = await CareTeam.postHandoff(user, {
    clientId: 'client-1', actorId: 'maya', line, dedupe: 'program:base:2026-11-09',
    coCoaches: [{ userId: 'rae', role: 'nutritionist', name: 'Rae', providerId: 2 }, { userId: 'sam', role: 'trainer', name: 'Sam', providerId: 3 }],
  });
  assert.equal(posted, 1, 'the thread that already has the line gets nothing');
  const inserts = user.calls.filter((c) => c.ops && c.ops.some((o) => o[0] === 'insert'));
  assert.equal(inserts.length, 1);
  const row = inserts[0].ops.find((o) => o[0] === 'insert')[1];
  assert.equal(row.conversation_id, 'conv-a');
  assert.equal(row.sender_id, 'maya');
  assert.equal(row.body, line.body);
  assert.deepEqual(row.metadata, { kind: 'handoff', clientId: 'client-1', noticeTitle: line.title, copy: line.copy, dedupe: 'program:base:2026-11-09' });
  // The thread is opened through the coach's own session.
  assert.deepEqual(user.calls.filter((c) => c.rpc).map((c) => c.rpc), ['get_or_create_coach_coach_conversation', 'get_or_create_coach_coach_conversation']);
  // Nothing to say: nothing posted.
  assert.equal(await CareTeam.postHandoff(user, { clientId: 'c', actorId: 'maya', line: null, coCoaches: [{ userId: 'rae' }] }), 0);
});

test('the team is read on the coach\'s own session; the others are every other person on it, once', async () => {
  const team = [
    { provider_role: 'trainer', provider_id: 1, name: 'Maya', owner_id: 'maya' },
    { provider_role: 'nutritionist', provider_id: 2, name: 'Rae', owner_id: 'rae' },
    { provider_role: 'nutritionist', provider_id: 9, name: 'Maya N', owner_id: 'maya' },
    { provider_role: 'coach', provider_id: 5, name: 'X', owner_id: 'x' },
    { provider_role: 'trainer', provider_id: 6, name: 'Nobody', owner_id: null },
  ];
  const posted = [];
  const user = fakeDb({
    rpc: (name, args) => (name === 'get_client_coaches' ? { data: team, error: null } : { data: 'conv-' + args.p_other_user_id, error: null }),
    from: (q) => {
      if (q.table === 'profiles') return { data: { full_name: 'Marcus T.' }, error: null };
      const ins = q.ops.find((o) => o[0] === 'insert');
      if (ins) posted.push(ins[1]);
      return { data: [], error: null };
    },
  });
  const seen = [];
  const n = await CareTeam.tellCareTeam(user, { clientId: 'c1', actorId: 'maya', role: 'trainer', compose: (who) => { seen.push(who); return Handoff.programHandoff({ ...who, plan: 'Base', from: '2026-11-09' }); } });
  assert.equal(n, 1);
  assert.deepEqual(seen, [{ coach: 'Maya', client: 'Marcus T.' }], 'the actor named in the role they acted in');
  assert.equal(posted[0].conversation_id, 'conv-rae');
  assert.equal(posted[0].body, 'Maya started Base from Mon, Nov 9.');
  assert.equal(CareTeam.actorNameFrom(CareTeam.coCoachesFrom([], 'x'), 'maya', 'trainer'), null);
  // The actor is named in the role they acted in: the same person's nutritionist listing for a menu.
  const named = [{ userId: 'maya', role: 'trainer', name: 'Maya' }, { userId: 'maya', role: 'nutritionist', name: 'Maya N' }];
  assert.equal(CareTeam.actorNameFrom(named, 'maya', 'nutritionist'), 'Maya N');
  assert.equal(CareTeam.actorNameFrom(named, 'maya', 'trainer'), 'Maya');
  // Not shared (nobody else on the team), or the team unreadable: nothing composed, nothing posted.
  for (const answer of [{ data: [team[0]], error: null }, { data: null, error: { message: 'down' } }]) {
    const lone = fakeDb({ rpc: () => answer });
    let composed = false;
    assert.equal(await CareTeam.tellCareTeam(lone, { clientId: 'c1', actorId: 'maya', role: 'trainer', compose: () => { composed = true; return null; } }), 0);
    assert.equal(composed, false);
    assert.ok(!lone.calls.some((c) => c.rpc === 'get_or_create_coach_coach_conversation'));
  }
});

test('every save path that changes a shared plan posts the hand-off, after its write', () => {
  const paths = [
    ['src/app/api/nutritionist/meal-plan/route.ts', /await tellCareTeamOfMenu\(supabase, \{ clientId, actorId: user\.id, title, weekStart, days, prev:/, /\.from\('client_meal_plans'\)\s*\.insert/],
    ['src/app/api/trainer/workout/route.ts', /await tellCareTeamOfProgram\(supabase, \{ clientId: String\(r\.clientId\)/, /results\.push\(await publishMergedWeekForClient/],
    ['src/app/api/trainer/adjust/route.ts', /compose: \(\{ coach, client \}\) => adjustHandoff\(/, /admin\.rpc\('regenerate_client_workouts'/],
    ['src/app/api/clients/[id]/week-one/route.ts', /compose: \(\{ coach, client \}\) => weekOneHandoff\(/, /supabase\.rpc\('set_program_detail'/],
  ];
  for (const [file, hook, write] of paths) {
    const src = read(file);
    const at = src.search(hook);
    assert.ok(at > 0, `${file}: no hand-off`);
    assert.ok(src.search(write) > 0 && src.search(write) < at, `${file}: the hand-off runs before the write`);
  }
  // A program posts once, from its first week, keyed on the program and its start.
  const workout = read('src/app/api/trainer/workout/route.ts');
  assert.match(workout, /Number\(t\.week\) === 1/);
  assert.match(workout, /if \(r\.status !== 'accepted'\) continue;/);
  assert.match(workout, /key: `program:\$\{String\(startsProgram\.id \|\| plan\)\}:\$\{from\}`/);
  // The menu the new one replaces is read before it is archived.
  const meal = read('src/app/api/nutritionist/meal-plan/route.ts');
  assert.ok(meal.indexOf("select('title, payload')") < meal.indexOf(".update({ status: 'archived' })"));
});

// ── the triggers ───────────────────────────────────────────────────────────────────────────────
const SQL = read('supabase-migrations/2026-11-05-coach-notices.sql');

test('the messages trigger turns a hand-off line into care_team_handoff, everything else as before', () => {
  const fn = SQL.slice(SQL.indexOf('create or replace function public.notify_on_new_message()'), SQL.indexOf('-- ── 2.'));
  const before = read('supabase-migrations/2026-10-26-push-notice-fixes.sql');
  const old = before.slice(before.indexOf('create or replace function public.notify_on_new_message()'), before.indexOf('$$;', before.indexOf('create or replace function public.notify_on_new_message()')));
  // Everything outside the care-team insert is the 2026-10-26 body, word for word.
  const body = fn.slice(0, fn.indexOf('$$;'));
  const a = body.indexOf("    select cp.user_id,\n           case when v_handoff");
  const b = body.indexOf('      from public.conversation_participants cp', a);
  assert.ok(a > 0 && b > a, 'the care-team select was not found');
  const restored = (body.slice(0, a)
    + "    select cp.user_id, 'message', 'New message', left(coalesce(new.body, ''), 80), 'messages',\n"
    + "           jsonb_build_object('conversationId', new.conversation_id, 'careTeam', true, 'side', 'coach')\n"
    + body.slice(b)).replace(/\n  -- A care-team hand-off line[^\n]*\n  -- [^\n]*\n  v_handoff boolean[^\n]*\n/, '\n');
  assert.equal(restored, old);
  assert.match(fn, /v_handoff boolean := coalesce\(new\.metadata->>'kind', ''\) = 'handoff';/);
  assert.match(fn, /case when v_handoff then 'care_team_handoff' else 'message' end/);
  assert.match(fn, /case when jsonb_typeof\(new\.metadata->'copy'\) = 'object' then jsonb_build_object\('copy', new\.metadata->'copy'\)/);
  // The hand-off stays inside the care-team branch: a client's thread never sees one.
  assert.ok(fn.indexOf('v_handoff then') > fn.indexOf('A care-team thread') && fn.indexOf('v_handoff then') < fn.indexOf('conv.client_id = new.sender_id'));
});

test('a check-in tells each coach on the client once a week, with copy, opening the client', () => {
  const fn = SQL.slice(SQL.indexOf('create or replace function public.notify_coaches_on_checkin()'), SQL.indexOf('-- ── Checks'));
  assert.match(fn, /s\.status in \('active', 'trialing', 'past_due'\)/);
  assert.match(fn, /'checkin_submitted',\n\s+'Check-in from ' \|\| v_shown,/);
  assert.match(fn, /'dedupe', 'checkin:' \|\| new\.user_id::text \|\| ':' \|\| new\.week_of::text/);
  assert.match(fn, /exception when unique_violation then/);
  assert.match(fn, /if r\.coach_id is null or r\.coach_id = new\.user_id then/);
  assert.match(fn, /'client',\n\s+jsonb_build_object\(/);
  assert.match(SQL, /after insert or update on public\.client_checkins/);
  assert.match(SQL, /revoke all on function public\.notify_coaches_on_checkin\(\) from public, anon, authenticated;/);
  // The English the trigger writes is the catalog's.
  const en = CATS.en.notice;
  assert.equal(en['checkin.received.title'].replace('{client}', 'Sam'), 'Check-in from Sam');
  assert.match(fn, / sent this week''s check-in, with a question for you\./);
  assert.equal(en['checkin.received.bodyQuestion'].replace('{client}', 'Sam'), "Sam sent this week's check-in, with a question for you.");
  assert.equal(en['checkin.received.body'].replace('{client}', 'Sam'), "Sam sent this week's check-in.");
});

// ── a member's own cancel ──────────────────────────────────────────────────────────────────────
const Cancel = await import('../src/lib/client-cancel-notice.mjs');

test('a member cancelling tells their coach, on the coach\'s clock, under Sessions', async () => {
  const one = Cancel.clientCancelText({ client: 'Sam Lee', count: 1, whenText: 'Tue, Nov 10, 6:00 PM', whenAt: atTime('2026-11-10T23:00:00Z', 'America/New_York', true) });
  assert.equal(one.title, 'Session cancelled: Sam Lee');
  assert.equal(one.body, 'Sam Lee cancelled their session on Tue, Nov 10, 6:00 PM.');
  assert.equal(say('en', one.copy.title), one.title);
  assert.equal(say('en', one.copy.body), one.body);
  const run = Cancel.clientCancelText({ client: null, count: 4, whenText: 'Tue, Nov 10, 6:00 PM', whenAt: atTime('2026-11-10T23:00:00Z', 'America/New_York', true) });
  assert.equal(run.body, 'A client cancelled 4 sessions, from Tue, Nov 10, 6:00 PM on.');
  assert.equal(say('en', run.copy.body), 'A client cancelled 4 sessions, from Tue, Nov 10, 6:00 PM on.');

  const written = [];
  const notify = async (_a, n, copy) => { written.push({ n, copy }); return true; };
  const Live = { tellCoachClientCancelled: (admin, b, o = {}) => Cancel.tellCoachClientCancelled(admin, b, { notify, ...o }) };
  const admin = fakeDb({ from: (q) => (q.table === 'trainers' ? { data: { id: 7, owner_id: 'coach-1', timezone: 'America/New_York' }, error: null } : { data: null, error: null }) });
  const ok = await Live.tellCoachClientCancelled(admin, { id: 's1', client_id: 'm1', client_name: 'Sam Lee', provider_role: 'trainer', provider_id: 7, scheduled_at: '2026-11-10T23:00:00Z' });
  assert.equal(ok, true);
  assert.equal(written[0].n.userId, 'coach-1');
  assert.equal(written[0].n.type, 'client_cancelled');
  assert.equal(written[0].n.route, 'schedule');
  assert.equal(written[0].n.body, 'Sam Lee cancelled their session on Tue, Nov 10, 6:00 PM.');
  assert.equal(written[0].n.data.dedupe, 'client-cancel:s1');
  // A booking the coach made for themselves, or a provider that can't be read: nobody is told.
  const self = fakeDb({ from: () => ({ data: { owner_id: 'm1' }, error: null }) });
  assert.equal(await Live.tellCoachClientCancelled(self, { id: 's2', client_id: 'm1', provider_role: 'trainer', provider_id: 7, scheduled_at: '2026-11-10T23:00:00Z' }), false);
  assert.equal(await Live.tellCoachClientCancelled(admin, { id: 's3', client_id: 'm1', provider_role: 'coach', provider_id: 7, scheduled_at: '2026-11-10T23:00:00Z' }), false);
  // No zone on the listing: UTC, and it says so.
  const noZone = fakeDb({ from: (q) => (q.table === 'trainers' ? { data: { owner_id: 'coach-1' }, error: null } : { data: null, error: null }) });
  await Live.tellCoachClientCancelled(noZone, { id: 's4', client_id: 'm1', client_name: 'Sam', provider_role: 'trainer', provider_id: 7, scheduled_at: '2026-11-10T23:00:00Z' });
  assert.match(written.at(-1).n.body, /UTC/);
});

test('the route tells the coach only when the member\'s own cancel moved a live booking', () => {
  const src = read('src/app/api/sessions/manage/route.ts');
  assert.match(src, /if \(action === 'cancel' && isClient && !isCoach && \(statusBefore === 'requested' \|\| statusBefore === 'confirmed'\)\) \{\n\s+await tellCoachClientCancelled\(createAdminClient\(\), session, \{ notify: createNotification \}\);/);
  assert.ok(src.indexOf('await tellCoachClientCancelled(createAdminClient(), session') > src.indexOf('if (updErr) return dbError(updErr, \'session update\', 500);'));
  assert.match(src, /if \(!o\.isCoach && o\.session\.client_id === o\.userId\) \{\n\s+await tellCoachClientCancelled\(createAdminClient\(\), \{ \.\.\.o\.session, id: run\[0\]\.id, scheduled_at: run\[0\]\.scheduled_at \}, \{ count: run\.length, notify: createNotification \}\);/);
});

// ── wins ───────────────────────────────────────────────────────────────────────────────────────
const set = (move, load, unit, at, extra = {}) => ({ move_name: move, actual_load: load, load_unit: unit, created_at: at, ...extra });

test('a PR beats every earlier set of the move, in pounds; a first log or a tie is not one', () => {
  const prior = [set('Back squat', 225, 'lb', '2026-10-01T10:00:00Z'), set('Back squat', 235, 'lb', '2026-10-20T10:00:00Z'), set('Bench', 100, 'kg', '2026-10-20T10:00:00Z'), set('Row', 135, 'lb', '2026-10-01T10:00:00Z')];
  const recent = [
    set('back squat', 245, 'lb', '2026-11-04T10:00:00Z'), set('Back squat', 240, 'lb', '2026-11-04T10:05:00Z'),
    set('Bench', 215, 'lb', '2026-11-04T10:00:00Z'), // 215 lb < 100 kg (220.5 lb)
    set('Row', 135, 'lb', '2026-11-04T10:00:00Z'), // a tie
    set('Deadlift', 315, 'lb', '2026-11-04T10:00:00Z'), // a first log
    set('Back squat', 400, 'lb', '2026-11-04T10:00:00Z', { completed: false }), // not done
    set('Back squat', null, 'lb', '2026-11-04T10:00:00Z', { payload: { actualLoad: '250 lb' } }),
  ];
  const wins = Wins.prWins(recent, prior);
  assert.deepEqual(wins, [{ kind: 'pr', move: 'Back squat', load: 250, unit: 'lb', dedupe: 'win:pr:back squat:250lb' }]);
  assert.deepEqual(Wins.prWins([set('Bench', 101, 'kg', '2026-11-04T10:00:00Z')], prior).map((w) => w.load), [101]);
  assert.equal(Wins.setLoad({ actual_load: 0, payload: { load: '60/70 kg' } }), 60);
  assert.equal(Wins.setLoad({ payload: {} }), null);
});

test('a streak milestone is told the day it is reached or the day after, once per run', () => {
  const run = (end, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(end + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10));
  assert.deepEqual(Wins.streakWin(run('2026-11-05', 7), '2026-11-05'), { kind: 'streak', days: 7, dedupe: 'win:streak:7:2026-10-30' });
  // Reached yesterday, nothing yet today: still told (a run before today's workout).
  assert.deepEqual(Wins.streakWin(run('2026-11-04', 7), '2026-11-05'), { kind: 'streak', days: 7, dedupe: 'win:streak:7:2026-10-29' });
  // Reached yesterday and one more today: still the same win (the dedupe stores it once).
  assert.deepEqual(Wins.streakWin(run('2026-11-05', 8), '2026-11-05'), { kind: 'streak', days: 7, dedupe: 'win:streak:7:2026-10-29' });
  // Two days past it: old news.
  assert.equal(Wins.streakWin(run('2026-11-05', 9), '2026-11-05'), null);
  assert.equal(Wins.streakWin(run('2026-11-05', 6), '2026-11-05'), null);
  // A run that ended two days ago is broken; a day after today is never counted.
  assert.equal(Wins.streakWin(run('2026-11-03', 7), '2026-11-05'), null);
  assert.equal(Wins.currentRun(['2026-11-06', '2026-11-05'], '2026-11-05').length, 1);
  assert.deepEqual(Wins.streakWin(run('2026-11-05', 14), '2026-11-05').days, 14);
});

test('a goal is a win the first time its newest reading meets the target, in the goal\'s direction', () => {
  const down = { id: 'g1', label: 'Bodyweight', unit: 'lb', target: 165, start: 180, history: [{ on: '2026-10-20', value: 170 }, { on: '2026-11-04', value: 164.5 }] };
  assert.deepEqual(Wins.goalWins([down], '2026-11-04'), [{ kind: 'goal', label: 'Bodyweight', value: 164.5, unit: 'lb', dedupe: 'win:goal:g1:165' }]);
  assert.deepEqual(Wins.goalWins([down], '2026-11-05'), [], 'the reading is older than the window');
  const met = { ...down, history: [{ on: '2026-10-20', value: 164 }, { on: '2026-11-04', value: 163 }] };
  assert.deepEqual(Wins.goalWins([met], '2026-11-04'), [], 'met before: not news');
  const up = { id: 'g2', label: 'Squat', unit: 'lb', target: 245, history: [{ on: '2026-10-01', value: 200 }, { on: '2026-11-04', value: 245 }] };
  assert.equal(Wins.goalWins([up], '2026-11-04').length, 1);
  const notYet = { ...down, history: [{ on: '2026-11-04', value: 166 }] };
  assert.deepEqual(Wins.goalWins([notYet], '2026-11-04'), []);
  assert.deepEqual(Wins.goalWins([{ label: '', target: 1, history: [{ on: '2026-11-04', value: 2 }] }, null, 'x'], '2026-11-04'), []);
});

test('a win\'s notice says it in English and in the copy, the client\'s name kept', () => {
  for (const [win, title, body] of [
    [{ kind: 'pr', move: 'Back squat', load: 250, unit: 'lb' }, 'Sam Lee set a PR', 'Back squat: 250 lb, a new best.'],
    [{ kind: 'goal', label: 'Bodyweight', value: 164.5, unit: 'lb' }, 'Sam Lee reached a goal', 'Bodyweight: 164.5 lb, on target.'],
    [{ kind: 'streak', days: 14 }, 'Sam Lee: 14-day streak', '14 days in a row with a workout.'],
  ]) {
    const n = Wins.winNotice(win, 'Sam Lee');
    assert.equal(n.title, title);
    assert.equal(n.body, body);
    assert.equal(say('en', n.copy.title), title);
    assert.equal(say('en', n.copy.body), body);
    assert.ok(say('de', n.copy.title).includes('Sam Lee'));
  }
  assert.equal(Wins.winNotice({ kind: 'pr', move: 'Row', load: 1, unit: 'kg' }, '').title, 'A client set a PR');
  assert.equal(Wins.winNotice({ kind: 'nope' }, 'x'), null);
});

test('the wins run: a PR to trainers only, everything under the daily limit, keyed on the client', () => {
  const src = read('src/app/api/cron/client-wins/route.ts');
  assert.match(src, /if \(win\.kind === 'pr' && coach\.role !== 'trainer'\) continue;/);
  assert.match(src, /type: 'client_win',/);
  assert.match(src, /dedupe: `\$\{win\.dedupe\}:\$\{clientId\}`/);
  assert.match(src, /claim = await claimPushSlots\(admin, coach\.userId, \{ tz: cap\.tz, cap: cap\.cap, want: 1 \}\);\n\s+return !claim \|\| claim\.granted >= 1;/);
  assert.match(src, /await releasePushClaim\(admin, claim\);/);
  assert.match(src, /\.in\('status', OPEN_SUB_STATUSES\)/);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/client-wins'));
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/cron\/client-wins', 'GET,POST'\]/);
});
