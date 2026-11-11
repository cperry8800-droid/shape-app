// A client's break, "away until <date>" (owner, 2026-11-11: set by the member or any of their coaches;
// billing carries on). supabase-migrations/2026-11-11-client-pause.sql, src/lib/shared-overview.ts
// (the overview's `pause`), public/newdesign/dashSignals.js (pauseOf), the push (notify-core's
// loadMemberPaused), the Score and prep-reminder crons, and the screens: the app's BSClientPause.jsx
// and the website's client panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { READER_COPY_EN } from './helpers/reader-copy-en.mjs';
import { pauseBounds, validPauseDay, pauseHolds, readClientPause, writeClientPause, PAUSE_MAX_DAYS } from '../mobile-app/src/services/clientPause.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = createRequire(import.meta.url)('../public/newdesign/dashSignals.js');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const NOW = new Date('2026-11-11T12:00:00');
const keys = (r) => r.flags.map((f) => f.key).sort();
// Logged nothing since Oct 25, last checked in for the week of Oct 19, last written to on Oct 24, five
// of six booked sessions missed: red on every count, without a break.
const away = (pause, extra = {}) => ({ profile: { id: 'p1', name: 'Pat', joinedAt: '2026-08-01T00:00:00Z' }, progressRead: { state: 'ready' },
  foodLogs: { lastLoggedOn: '2026-10-25', daysLogged7d: 0 }, checkIn: { lastWeekOf: '2026-10-19' },
  lastContact: { trainer: '2026-10-24T10:00:00Z', nutritionist: '2026-10-24T10:00:00Z' },
  bookedSessions: { trainer: { done: 1, planned: 6 } }, ...(pause === undefined ? {} : { pause }), ...extra });
const row = (role, rec, now = NOW) => E.getTriageFeed(role, [rec], now)[0];

// ── the migration ────────────────────────────────────────────────────────────
const SQL = read('supabase-migrations/2026-11-11-client-pause.sql');
test('the break is its own table, reached only through two definer functions', () => {
  // One row a break, from its first day to its last (Codex on #2705); tests/client-pause-sql.test.mjs runs it.
  assert.match(SQL, /create table if not exists public\.client_pauses \(\n  id          bigint generated always as identity primary key,\n  client_id   uuid not null references auth\.users \(id\) on delete cascade,\n  from_on     date not null default current_date,\n  until_on    date not null,/);
  assert.match(SQL, /constraint client_pauses_days check \(from_on <= until_on\)/);
  assert.match(SQL, /alter table public\.client_pauses drop constraint if exists client_pauses_pkey;/, 'the first run\'s table is turned in place');
  assert.match(SQL, /set_by_role text not null check \(set_by_role in \('member', 'trainer', 'nutritionist'\)\)/);
  assert.match(SQL, /alter table public\.client_pauses enable row level security;/);
  assert.match(SQL, /revoke all on table public\.client_pauses from public, anon, authenticated;/);
  assert.doesNotMatch(SQL, /create policy/i, 'no direct read or write');
  for (const fn of ['set_client_pause(uuid, date)', 'get_client_pause(uuid)']) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, '\\$&')} from public, anon;`));
  }
  assert.equal((SQL.match(/security definer\nset search_path = public, pg_temp/g) || []).length, 2);
  assert.match(SQL, /^begin;$/m);
  assert.match(SQL, /^commit;$/m);
});
test('set_client_pause: the member or a coach on the client, today to 90 on in their calendar; ending early keeps the days', () => {
  assert.match(SQL, /if v_uid is null or p_client_id is null then\n    raise exception 'not signed in' using errcode = '42501';/);
  assert.match(SQL, /if v_uid = p_client_id then\n    v_role := 'member';\n  elsif public\.is_coach_on_client\(p_client_id\) then/);
  assert.match(SQL, /  else\n    raise exception 'not this client''s member or coach' using errcode = '42501';/);
  assert.match(SQL, /select p\.timezone into v_tz from public\.profiles p where p\.id = p_client_id;/);
  assert.match(SQL, /    if v_cur\.from_on >= v_today then\n      delete from public\.client_pauses where id = v_cur\.id;\n    else\n      update public\.client_pauses set until_on = v_today - 1 where id = v_cur\.id;/);
  assert.match(SQL, /if p_until < v_today - 1 or p_until > v_today \+ 91 then/);
  assert.match(SQL, /v_until := greatest\(p_until, v_today\);/);
  assert.match(SQL, /values \(p_client_id, v_today, v_until, v_uid, v_role, now\(\)\);/);
  assert.match(SQL, /perform pg_advisory_xact_lock\(/);
  assert.doesNotMatch(SQL, /on conflict \(client_id\)/, 'a new break after one has ended is a new row');
});
test('get_client_pause: the same people, while it holds and for 15 days after, and never the setter\'s id', () => {
  assert.match(SQL, /returns table \(until_on date, set_by_role text, set_at timestamptz, set_by_me boolean\)/);
  assert.match(SQL, /select p\.until_on, p\.set_by_role, p\.set_at, p\.set_by is not distinct from auth\.uid\(\)/);
  assert.match(SQL, /and \(auth\.uid\(\) = p_client_id or public\.is_coach_on_client\(p_client_id\)\)\n    and p\.until_on >= current_date - 15\n  order by p\.from_on desc, p\.id desc\n  limit 1;/);
  assert.match(SQL, /where auth\.uid\(\) is not null\n    and p_client_id is not null/);
});

// ── the overview ─────────────────────────────────────────────────────────────
const COACH = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEGS = await import(pathToFileURL(join(ROOT, 'src/lib/coach-client-legs.mjs')).href);
const lib = await loadRealModule(join(ROOT, 'src/lib/shared-overview.ts'), {
  typescript: true,
  registry: new Map([
    ['@/lib/supabase/server', { createClient: async () => { throw new Error('type-only'); } }],
    ['@/lib/recovery-readiness', await loadRealModule(join(ROOT, 'src/lib/recovery-readiness.ts'), { typescript: true })],
    ['@/lib/vitals-leg.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/vitals-leg.mjs')).href)],
    ['@/lib/coach-client-legs.mjs', LEGS],
  ]),
});
function db(pause) {
  const base = fakeSupabase({
    tables: {
      trainers: [{ id: 7, name: 'Coach Q', owner_id: COACH }], nutritionists: [],
      subscriptions: [{ client_id: A, provider_role: 'trainer', provider_id: 7, status: 'active', current_period_end: null, created_at: new Date().toISOString() }],
      conversations: [], messages: [], client_workouts: [], client_meal_plans: [], client_programs: [],
    },
    rpcs: { get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: 'Pat Doe', avatar_url: null })) },
  });
  const rpc = base.rpc.bind(base);
  base.rpc = async (name, args) => (name === 'get_client_pause' ? pause(args) : rpc(name, args));
  return base;
}
const build = (d) => lib.buildSharedOverview(d, { clientId: A, me: { userId: COACH, trainerId: 7, nutritionistId: null } });
const quiet = async (fn) => { const e = console.error, seen = []; console.error = (...a) => seen.push(a.join(' ')); try { return [await fn(), seen]; } finally { console.error = e; } };

test('the overview carries the break, null when there is none, and nothing when it could not read one', async () => {
  let asked = null;
  const ov = await build(db((args) => { asked = args; return { data: [{ until_on: '2026-11-20', set_by_role: 'member', set_at: '2026-11-10T09:00:00Z', set_by_me: false }], error: null }; }));
  assert.deepEqual(asked, { p_client_id: A });
  assert.deepEqual(ov.pause, { until: '2026-11-20', by: 'member', mine: false, at: '2026-11-10T09:00:00Z' });
  assert.deepEqual(E.recordFromOverview({ id: A, name: 'Pat' }, ov).pause, { until: '2026-11-20', by: 'member' });
  const none = await build(db(() => ({ data: [], error: null })));
  assert.equal(none.pause, null);
  assert.equal(E.recordFromOverview({ id: A, name: 'Pat' }, none).pause, null);
  const [missing, log1] = await quiet(() => build(db(() => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }))));
  assert.ok(!('pause' in missing), 'before the migration: no key');
  assert.deepEqual(log1.filter((l) => /get_client_pause/.test(l)), [], 'not deployed is not failed');
  assert.ok(!('pause' in E.recordFromOverview({ id: A, name: 'Pat' }, missing)), 'and the record reads as before');
  const [failed, log2] = await quiet(() => build(db(() => ({ data: null, error: { code: '500', message: 'boom' } }))));
  assert.ok(!('pause' in failed), 'a failed read is not "no break"');
  assert.equal(log2.filter((l) => /get_client_pause failed/.test(l)).length, 1);
  const bad = await build(db(() => ({ data: [{ until_on: 'soon' }], error: null })));
  assert.equal(bad.pause, null, 'a day that is not a day is no break');
});

// ── the engine ───────────────────────────────────────────────────────────────
test('away: nothing that reads their absence speaks, and the row is clear', () => {
  assert.deepEqual(keys(row('trainer', away(undefined))), ['checkin_overdue', 'contact_gap', 'food_gap', 'missed_sessions'], 'without a break');
  const r = row('trainer', away({ until: '2026-11-20', by: 'member' }));
  assert.equal(r.severity, 'green');
  assert.deepEqual(r.flags, []);
  assert.deepEqual(r.pause, { state: 'paused', until: '2026-11-20', by: 'member' });
  // Their last day away is still away.
  assert.equal(row('trainer', away({ until: '2026-11-11', by: 'member' })).pause.state, 'paused');
  // A check-in they filed while away still waits for review: what they share is not absence.
  const filed = away({ until: '2026-11-20' }, { checkIn: { lastWeekOf: '2026-11-09', latest: { weekOf: '2026-11-09', ratings: {}, question: 'Can we move Friday?' } } });
  assert.ok(keys(row('trainer', filed)).every((k) => !['checkin_overdue', 'food_gap', 'contact_gap', 'missed_sessions'].includes(k)));
});
test('back: three days of "Back from a break" for every coach, then the gaps count from the day they came back', () => {
  const d0 = row('trainer', away({ until: '2026-11-10', by: 'trainer' }));
  assert.equal(d0.severity, 'amber');
  assert.deepEqual(keys(d0), ['pause_ended']);
  assert.equal(d0.flags[0].reason, 'Back from a break today: see how it went');
  assert.equal(d0.lead.action.label, 'Welcome back');
  assert.deepEqual(keys(row('nutritionist', away({ until: '2026-11-10' }))), ['pause_ended'], 'the nutritionist too');
  const d2 = row('trainer', away({ until: '2026-11-08' }));
  assert.equal(d2.flags[0].reason, 'Back from a break since 2026-11-09: see how it went');
  // Day 5: the food gap counts from the return day, and the return week is not a missed check-in.
  const d5 = row('nutritionist', away({ until: '2026-11-05' }));
  assert.deepEqual(d5.reasons, ['No food logs in the 5 days since their break']);
  assert.equal(d5.flags[0].sig, 'back:2026-11-06');
  // Day 12: two weeks since the week they came back in, and quiet since then.
  const d12 = row('nutritionist', away({ until: '2026-10-29' }));
  assert.deepEqual(d12.reasons.sort(), ['No check-in in the 2 weeks since their break', 'No contact in the 12 days since their break', 'No food logs in the 12 days since their break']);
  // Past 14 days back: as if there had been no break.
  assert.deepEqual(row('nutritionist', away({ until: '2026-10-21' })).reasons.sort(), row('nutritionist', away(undefined)).reasons.sort());
  assert.equal(row('nutritionist', away({ until: '2026-10-21' })).pause, null);
});
test('a member\'s own view on a break is quiet and never says "Back from a break"', () => {
  assert.deepEqual(E.evaluateClient(away({ until: '2026-11-20' }), NOW, 'client').flags, []);
  assert.deepEqual(E.evaluateClient(away({ until: '2026-11-10' }), NOW, 'client').flags, []);
});
test('the welcome back draft is the member\'s own words, with no coach reason in it', () => {
  const r = row('trainer', away({ until: '2026-11-10' }));
  const draft = E.memberDraft('pause_ended', r.client, 'trainer', r.flags[0]);
  assert.match(draft, /^Welcome back, Pat! How was the break\?/);
  assert.doesNotMatch(draft, /alert|flag|missed/i);
  assert.equal(E.flagDiscipline('pause_ended'), 'general');
  assert.equal(E.flagArea({ key: 'pause_ended' }), 'contact');
  assert.equal(E.pauseOf({ pause: { until: 'nope' } }, NOW), null);
  assert.equal(E.pauseOf({}, NOW), null);
});

// ── the push ─────────────────────────────────────────────────────────────────
const core = await loadRealModule(join(ROOT, 'src/lib/ai/notify-core.ts'), {
  typescript: true,
  registry: new Map([
    ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')],
    ['@/lib/ai/memberTranslator.mjs', { memberLocaleCode: () => 'en' }],
    ['@/lib/reader-copy', READER_COPY_EN],
    ['../../../mobile-app/src/services/leadReason.mjs', await import('../mobile-app/src/services/leadReason.mjs')],
    ['@/lib/roles.mjs', await import('../src/lib/roles.mjs')],
    ['@/lib/notify', { createNotification: async () => true }],
    ['@/lib/email', { sendEmail: async () => ({ ok: true }) }],
    ['@/lib/time', await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true })],
    ['@/lib/push-cap', { claimPushSlots: async () => null }],
    ['../../../public/newdesign/dashSignals.js', { __esModule: true, default: E }],
  ]),
});
test('a member on a break is read fresh, in their own day, and gets none of their own notices', async () => {
  const at = new Date('2026-11-21T06:00:00Z'); // the 20th still, in Los Angeles
  const table = (until) => fakeSupabase({ tables: { client_pauses: until ? [{ client_id: 'm1', until_on: until }] : [] } });
  assert.equal(await core.loadMemberPaused(table('2026-11-20'), 'm1', at, 'America/Los_Angeles', { asService: true }), true);
  assert.equal(await core.loadMemberPaused(table('2026-11-20'), 'm1', at, 'UTC', { asService: true }), false, 'the 21st in UTC');
  assert.equal(await core.loadMemberPaused(table(null), 'm1', at, 'UTC', { asService: true }), false);
  // One row a break, kept after it ends: the latest end is read, whichever row comes first.
  const two = fakeSupabase({ tables: { client_pauses: [{ client_id: 'm1', until_on: '2026-11-08' }, { client_id: 'm1', until_on: '2026-11-25' }] } });
  assert.equal(await core.loadMemberPaused(two, 'm1', at, 'UTC', { asService: true }), true);
  const rpc = (res) => ({ rpc: async (name, args) => { assert.equal(name, 'get_client_pause'); assert.deepEqual(args, { p_client_id: 'm1' }); return res; } });
  assert.equal(await core.loadMemberPaused(rpc({ data: [{ until_on: '2026-11-30' }], error: null }), 'm1', at, 'UTC'), true);
  assert.equal(await core.loadMemberPaused(rpc({ data: null, error: { message: 'down' } }), 'm1', at, 'UTC'), false, 'a failed read is no break');
  assert.equal(await core.loadMemberPaused({ rpc: async () => { throw new Error('x'); } }, 'm1', at, 'UTC'), false);
  // Their record is due a check-in nudge; on a break, nothing.
  const snap = { role: 'client', at: +at, record: { profile: { id: 'm1', name: 'Me' }, checkIn: { lastWeekOf: '2026-11-02' }, checkinDueThisWeek: true, progressRead: { state: 'ready' } } };
  const habits = { reminders: [{ id: 'h1', title: 'Walk', hour: 0, minute: 0 }], doneToday: [] };
  assert.ok(core.candidatesFor(snap, { tone: 'neutral', lastSeverity: {}, now: at, habitContext: habits }).candidates.length > 0, 'the fixture nudges');
  assert.deepEqual(core.candidatesFor(snap, { tone: 'neutral', lastSeverity: {}, now: at, habitContext: habits, memberPaused: true }).candidates, []);
  // The hourly run and the live route ask for it.
  assert.match(read('src/app/api/ai/notify/cron/route.ts'), /const memberPaused = isCoach \? false : await loadMemberPaused\(admin, userId, now, prefs\.tz, \{ asService: true \}\);/);
  assert.match(read('src/app/api/ai/notify/route.ts'), /loadMemberPaused\(actor\.supabase, actor\.user\.id, now, prefs\.tz\),/);
});
test('a coach is not pushed about a client away, and is pushed "Back from a break" the day they return', () => {
  const snap = (pause) => ({ role: 'trainer', at: +NOW, clients: [{ userId: 'p1', ...away(pause) }] });
  const sent = (pause) => core.candidatesFor(snap(pause), { tone: 'neutral', lastSeverity: {}, now: NOW }).candidates.map((c) => c.type + ':' + c.body);
  assert.equal(sent(undefined).length, 1, 'red without a break');
  assert.deepEqual(sent({ until: '2026-11-20' }), []);
  assert.match(sent({ until: '2026-11-10' })[0], /^client_amber:.*Back from a break today/);
});

// ── the Score and prep-reminder crons ───────────────────────────────────────
const PAUSE = await import(pathToFileURL(join(ROOT, 'src/lib/client-pause.mjs')).href);
test('a break covers its own days only: not the days before it began, and still the ones it covered once ended (Codex on #2705)', () => {
  const by = PAUSE.pausesByClient([
    { client_id: 'a', from_on: '2026-11-11', until_on: '2026-11-20' },
    { client_id: 'b', from_on: '2026-11-03', until_on: '2026-11-07' },
    { client_id: 'b', from_on: '2026-11-10', until_on: '2026-11-12' },
    { client_id: 'c', until_on: '2026-11-20' }, { client_id: 'c', from_on: 'soon', until_on: '2026-11-20' }, null, { from_on: '2026-11-01', until_on: '2026-11-02' },
  ]);
  assert.deepEqual([...by.keys()], ['a', 'b'], 'a row without both days, or a client, is dropped');
  // Begun today: yesterday's missed workout and last week's check-in are still owed.
  assert.equal(PAUSE.pauseCovers(by.get('a'), '2026-11-10'), false);
  assert.equal(PAUSE.pauseCovers(by.get('a'), '2026-11-02', '2026-11-08'), false);
  assert.equal(PAUSE.pauseCovers(by.get('a'), '2026-11-11'), true, 'its first day');
  assert.equal(PAUSE.pauseCovers(by.get('a'), '2026-11-20'), true, 'its last day');
  assert.equal(PAUSE.pauseCovers(by.get('a'), '2026-11-21'), false);
  // Ended early, the days it covered stay covered; the gap between two breaks is owed.
  assert.equal(PAUSE.pauseCovers(by.get('b'), '2026-11-05'), true);
  assert.equal(PAUSE.pauseCovers(by.get('b'), '2026-11-08'), false);
  assert.equal(PAUSE.pauseCovers(by.get('b'), '2026-11-11'), true);
  // A week's check-in is none when a break covers any day of the week.
  assert.equal(PAUSE.pauseCovers(by.get('b'), '2026-11-08', '2026-11-09'), false);
  assert.equal(PAUSE.pauseCovers(by.get('b'), '2026-11-08', '2026-11-14'), true);
  assert.equal(PAUSE.pauseCovers(undefined, '2026-11-11'), false);
});
test('the Score takes no penalty for a day a break covers, and a member away is not reminded to prep', () => {
  const score = read('src/app/api/cron/score-accountability/route.ts');
  assert.match(score, /\.from\('client_pauses'\)\n          \.select\('client_id, from_on, until_on'\)\n          \.in\('client_id', ids\)\n          \.gte\('until_on', lastMonday\)/);
  assert.match(score, /breaksBy = pausesByClient\(pausesMissing \? \[\] : pausesRes\.data\);/);
  assert.match(score, /if \(pauseCovers\(breaksBy\.get\(uid\), day, to\)\) return;/);
  assert.match(score, /await penalize\('checkin', null, lastMonday, "last week's check-in", lastSunday\);/, 'the check-in\'s whole week');
  assert.match(score, /\[sessRes, wosRes, habitsRes, settingsRes, pausesRes\]\.some\(\(r\) => \(r\.data \|\| \[\]\)\.length >= ROWS_MAX\)/, 'a full page of breaks skips the chunk');
  assert.match(score, /if \(pausesRes\.error && !pausesMissing\) \{\n        console\.error\('\[score-accountability\] pauses read failed — skipping chunk:'/);
  const prep = read('src/app/api/cron/prep-reminders/route.ts');
  assert.match(prep, /readIn\(due, \(c\) => admin\.from\('client_pauses'\)\.select\('client_id, from_on, until_on'\)\.in\('client_id', c\)\.gte\('until_on', pauseFloor\)\),/);
  assert.match(prep, /if \(pauseCovers\(breaksBy\.get\(userId\), today\)\) continue;/);
});

// ── the app's reads, writes and screens ─────────────────────────────────────
test('the app\'s break: a day from today to 90 on; reads tell "none" from "couldn\'t read" from "not there yet"', async () => {
  const now = new Date(2026, 10, 11, 9);
  assert.deepEqual(pauseBounds(now), { min: '2026-11-11', max: '2027-02-09' });
  assert.equal(PAUSE_MAX_DAYS, 90);
  for (const [v, ok] of [['2026-11-11', true], ['2027-02-09', true], ['2026-11-10', false], ['2027-02-10', false], ['soon', false], [null, false]]) assert.equal(validPauseDay(v, now), ok, String(v));
  assert.equal(pauseHolds({ until: '2026-11-11' }, now), true, 'the last day away');
  assert.equal(pauseHolds({ until: '2026-11-10' }, now), false);
  const client = (res) => ({ rpc: async (name, args) => ({ name, args, ...res }) });
  assert.deepEqual(await readClientPause(client({ data: [{ until_on: '2026-11-20', set_by_role: 'trainer', set_by_me: true }], error: null }), 'c1'), { ok: true, ready: true, pause: { until: '2026-11-20', by: 'trainer', mine: true } });
  assert.deepEqual(await readClientPause(client({ data: [], error: null }), 'c1'), { ok: true, ready: true, pause: null });
  assert.deepEqual(await readClientPause(client({ data: null, error: { code: 'PGRST202' } }), 'c1'), { ok: true, ready: false });
  assert.deepEqual(await readClientPause(client({ data: null, error: { code: '500' } }), 'c1'), { ok: false });
  assert.deepEqual(await readClientPause(null, 'c1'), { ok: false });
  let wrote = null;
  const w = (error) => ({ rpc: async (name, args) => { wrote = { name, args }; return { error }; } });
  const day = pauseBounds().min;
  assert.deepEqual(await writeClientPause(w(null), 'c1', day), { ok: true });
  assert.deepEqual(wrote, { name: 'set_client_pause', args: { p_client_id: 'c1', p_until: day } });
  assert.deepEqual(await writeClientPause(w(null), 'c1', null), { ok: true });
  assert.deepEqual(wrote.args, { p_client_id: 'c1', p_until: null }, 'null ends it');
  assert.deepEqual(await writeClientPause(w({ code: '42501' }), 'c1', day), { ok: false, error: 'refused' });
  assert.deepEqual(await writeClientPause(w({ code: '22023' }), 'c1', day), { ok: false, error: 'range' });
  assert.deepEqual(await writeClientPause(w(null), 'c1', '2020-01-01'), { ok: false, error: 'range' }, 'checked before it is sent');
});
test('the screens: the member\'s Settings, the coach\'s case file and roster, the website\'s panel, in every language', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /import \{ BSPauseSetting \} from '\.\/BSClientPause\.jsx';/);
  assert.match(client, /\{!isCoachRole && \(\n        <div data-settings-region="" style=\{\{ padding: `22px \$\{t\.padX\}px 0` \}\}>\n          <BSSetLabel t=\{t\}>\{tr\('settings:pause\.group'/);
  assert.match(client, /<BSPauseSetting t=\{t\} coach=\{isCoachRole\} \/>/, 'the member\'s Away row');
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /\{clientUid && <BSClientPauseCard key=\{'pause:' \+ clientUid\} clientId=\{clientUid\} t=\{t\} \/>\}/);
  assert.match(pros, /const away = row\.pause && row\.pause\.state === 'paused' && typeof row\.pause\.until === 'string' \? row\.pause : null;/);
  assert.match(pros, /label: away && sev === 'green' \? coachTr\('coach:roster\.labelAway'/);
  const mod = read('mobile-app/src/broadsheet/BSClientPause.jsx');
  assert.doesNotMatch(mod, /from '\.\/iosAppBroadsheet/, 'never an import back into a client module');
  const words = [...mod.matchAll(/defaultValue: (?:[^']*?)'([^']*)'(?: : '([^']*)')?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean);
  assert.ok(words.length > 15, 'its words found');
  assert.deepEqual(words.filter((w) => /\bpaus/i.test(w)), [], 'its words say away and break, never pause (the membership\'s)');
  const roster = read('public/newdesign/dashRoster.jsx');
  assert.equal((roster.match(/\["pause", "Away · a break from alerts", DashSecPause\],/g) || []).length, 2, 'both coaches\' panels');
  assert.match(roster, /if \(!live \|\| !db \|\| typeof db\.getClientPause !== "function"\)/);
  assert.match(read('public/supabase.js'), /async setClientPause\(clientId, until\) \{/);
  const SETTINGS = ['group', 'row', 'preview', 'unavailable', 'retry', 'byYou', 'byCoach', 'range', 'failed', 'until', 'change', 'end', 'desc', 'dateLabel', 'save', 'cancel'];
  const COACH = ['head', 'preview', 'unavailable', 'retry', 'byYou', 'byMember', 'byCoach', 'range', 'failed', 'until', 'change', 'end', 'desc', 'dateLabel', 'save', 'cancel'];
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const s = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/settings.json`));
    const c = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/coach.json`));
    for (const k of SETTINGS) assert.ok(s['pause.' + k], `${loc} settings pause.${k}`);
    for (const k of COACH) assert.ok(c['pause.' + k], `${loc} coach pause.${k}`);
    assert.match(s['pause.until'], /\{date\}/, loc);
    assert.match(c['roster.dirAway'], /\{date\}/, loc);
    assert.ok(c['roster.labelAway'], loc);
  }
});
