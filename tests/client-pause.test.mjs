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
test('get_client_pause: the same people, while it holds and for 15 days after, when the member is back, and never the setter\'s id', () => {
  assert.match(SQL, /returns table \(until_on date, set_by_role text, set_at timestamptz, set_by_me boolean, back_at timestamptz\)\nlanguage plpgsql/);
  assert.match(SQL, /if v_uid is null or p_client_id is null\n     or not \(v_uid = p_client_id or public\.is_coach_on_client\(p_client_id\)\) then\n    return;/);
  // The instant the member's return day begins, in their zone (Codex on #2705).
  assert.match(SQL, /select c\.until_on, c\.set_by_role, c\.set_at, c\.set_by is not distinct from v_uid,\n         \(c\.until_on \+ 1\)::timestamp at time zone v_tz/);
  assert.match(SQL, /and c\.until_on >= \(now\(\) at time zone v_tz\)::date - 15\n  order by c\.from_on desc, c\.id desc\n  limit 1;/);
  assert.match(SQL, /raise exception 'get_client_pause must say when the member is back \(back_at\)';/);
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
  // When the member is back, as the database says it: carried to the engine's record (Codex on #2705).
  const back = (b) => build(db(() => ({ data: [{ until_on: '2026-11-20', set_by_role: 'member', set_at: '2026-11-10T09:00:00Z', set_by_me: false, back_at: b }], error: null })));
  const withBack = await back('2026-11-21T08:00:00+00:00');
  assert.deepEqual(withBack.pause, { until: '2026-11-20', by: 'member', mine: false, at: '2026-11-10T09:00:00Z', backAt: '2026-11-21T08:00:00+00:00' });
  assert.deepEqual(E.recordFromOverview({ id: A, name: 'Pat' }, withBack).pause, { until: '2026-11-20', by: 'member', backAt: '2026-11-21T08:00:00+00:00' });
  assert.ok(!('backAt' in (await back('soon')).pause), 'a time that is not a time is left out');
  assert.ok(!('backAt' in E.recordFromOverview({ id: A, name: 'Pat' }, { pause: { until: '2026-11-20', backAt: 'soon' } }).pause));
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
test('on the member\'s calendar: a coach a day ahead still sees them away, one behind sees them back (Codex on #2705)', () => {
  // A member in Los Angeles, away until Fri Nov 20: back at their midnight, 08:00 UTC on the 21st.
  const la = { until: '2026-11-20', by: 'member', backAt: '2026-11-21T08:00:00+00:00' };
  const feed = (zone, at, pause) => E.inZone(zone, new Date(at), (now) => E.getTriageFeed('trainer', [away(pause)], now)[0]);
  // Noon on the 21st in Tokyo is 7 pm on the 20th in Los Angeles: still away.
  const tokyo = feed('Asia/Tokyo', '2026-11-21T03:00:00Z', la);
  assert.equal(tokyo.pause.state, 'paused');
  assert.deepEqual(tokyo.flags, []);
  assert.equal(feed('Asia/Tokyo', '2026-11-21T03:00:00Z', { until: '2026-11-20' }).pause.state, 'back', 'without the instant, the coach\'s own day');
  // An hour after their midnight: back today, on every calendar.
  for (const z of ['Asia/Tokyo', 'Pacific/Honolulu', 'UTC']) {
    const r = feed(z, '2026-11-21T09:00:00Z', la);
    assert.deepEqual([r.pause.state, r.pause.since, r.pause.day], ['back', '2026-11-21', 0], z);
    assert.equal(r.flags[0].reason, 'Back from a break today: see how it went', z);
  }
  // A member in London is back at 00:00 UTC on the 21st, 4 pm on the 20th in Honolulu.
  const ldn = { until: '2026-11-20', backAt: '2026-11-21T00:00:00+00:00' };
  assert.equal(feed('Pacific/Honolulu', '2026-11-21T02:00:00Z', ldn).pause.state, 'back');
  assert.equal(feed('Pacific/Honolulu', '2026-11-21T02:00:00Z', { until: '2026-11-20' }).pause.state, 'paused', 'without it, the coach\'s own day');
  // The days back count from that instant: day 13 a minute before two weeks, then as if no break.
  assert.equal(feed('UTC', '2026-12-05T07:59:00Z', la).pause.day, 13);
  assert.equal(feed('UTC', '2026-12-05T08:00:00Z', la).pause, null);
  // The gaps since they came back count those same days (Codex on #2705). A member in Kiritimati is back
  // at their midnight, 10:00 UTC on the 20th: 73 hours on it is 3 days without a food log, and a week on 7
  // without contact, for a coach on their calendar and for one a day behind it alike.
  const kir = { until: '2026-11-20', backAt: '2026-11-20T10:00:00+00:00' };
  const nut = (zone, at) => E.inZone(zone, new Date(at), (now) => E.getTriageFeed('nutritionist', [away(kir)], now)[0]);
  for (const z of ['Pacific/Kiritimati', 'Pacific/Honolulu', 'UTC']) {
    assert.deepEqual(nut(z, '2026-11-23T11:00:00Z').reasons, ['No food logs in the 3 days since their break'], z);
    assert.ok(nut(z, '2026-11-27T11:00:00Z').reasons.includes('No contact in the 7 days since their break'), z);
  }
  // The website's panel and data layer read it too.
  assert.match(read('public/supabase.js'), /if \(pause && typeof row\.back_at === 'string' && !isNaN\(Date\.parse\(row\.back_at\)\)\) pause\.backAt = row\.back_at;/);
  assert.match(read('public/newdesign/dashRoster.jsx'), /const holds = !!p && \(Number\.isFinite\(backAt\) \? Date\.now\(\) < backAt : p\.until >= bounds\.min\);/);
});
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

test('the push reads a client\'s break from the roster a coach posts (engineSnapshot: Codex on #2705)', () => {
  const rec = away({ until: '2026-11-20', by: 'member', backAt: '2026-11-21T08:00:00+00:00' });
  assert.deepEqual(E.engineSnapshot(rec).pause, rec.pause);
  const posted = (pause) => ({ role: 'trainer', at: +NOW, clients: [E.engineSnapshot(away(pause))] });
  const sent = (pause) => core.candidatesFor(posted(pause), { tone: 'neutral', lastSeverity: {}, now: NOW }).candidates.map((c) => c.type);
  assert.deepEqual(sent(undefined), ['client_red'], 'red without a break');
  assert.deepEqual(sent({ until: '2026-11-20' }), []);
  // Both coach apps post their roster through it.
  assert.match(read('public/newdesign/dashData.jsx'), /\(records \|\| \[\]\)\.map\(\(r\) => DashSignals\.engineSnapshot\(r\)\)/);
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /records\.map\(\(r\) => E\.engineSnapshot\(r\)\)/);
});
const NOTIFY = await import('../src/lib/ai/notifications.mjs');
test('the hourly run reads each client\'s break fresh, over the roster the coach saved (Codex on #2705)', async () => {
  const at = new Date('2026-11-21T03:00:00Z');
  // Coach c1 has trainer listing 7 and nutritionist listing 3; p9 is a stranger's client, p8's
  // subscription to them was cancelled.
  const listings = {
    trainers: [{ id: 7, owner_id: 'c1' }, { id: 8, owner_id: 'c2' }],
    nutritionists: [{ id: 3, owner_id: 'c1' }],
    subscriptions: [
      { client_id: 'p1', provider_id: 7, provider_role: 'trainer', status: 'active' },
      { client_id: 'p2', provider_id: 3, provider_role: 'nutritionist', status: 'past_due' },
      { client_id: 'p3', provider_id: 7, provider_role: 'trainer', status: 'trialing' },
      { client_id: 'p4', provider_id: 7, provider_role: 'trainer', status: 'active' },
      { client_id: 'p8', provider_id: 7, provider_role: 'trainer', status: 'canceled' },
      { client_id: 'p9', provider_id: 8, provider_role: 'trainer', status: 'active' },
      { client_id: 'p9', provider_id: 7, provider_role: 'nutritionist', status: 'active' },
    ],
  };
  const pauses = [
    { id: 1, client_id: 'p1', from_on: '2026-11-01', until_on: '2026-11-05', set_by_role: 'member' },
    { id: 2, client_id: 'p1', from_on: '2026-11-18', until_on: '2026-11-20', set_by_role: 'trainer' },
    { id: 3, client_id: 'p3', from_on: '2026-11-19', until_on: '2026-11-25', set_by_role: 'member' },
    { id: 4, client_id: 'p4', from_on: '2026-10-01', until_on: '2026-10-02', set_by_role: 'member' },
    { id: 5, client_id: 'p8', from_on: '2026-11-19', until_on: '2026-11-22', set_by_role: 'member' },
    { id: 6, client_id: 'p9', from_on: '2026-11-19', until_on: '2026-11-22', set_by_role: 'member' },
  ];
  const profiles = [{ id: 'p1', timezone: 'America/Los_Angeles' }, { id: 'p3', timezone: 'Not/AZone' }];
  const db = (fail = []) => fakeSupabase({ tables: { ...listings, client_pauses: pauses, profiles }, fail });
  // The latest break of each of the coach's own clients, with the instant their return day begins in
  // their zone (UTC for one unknown); none, or one long over, is null.
  const own = { p1: { until: '2026-11-20', by: 'trainer', backAt: '2026-11-21T08:00:00.000Z' }, p2: null, p3: { until: '2026-11-25', by: 'member', backAt: '2026-11-26T00:00:00.000Z' }, p4: null };
  const one = await core.loadClientBreaks(db(), 'c1', ['p1', 'p2', 'p3', 'p4', 'p1'], at);
  assert.deepEqual(Object.fromEntries(one.breaks), own);
  assert.deepEqual([...one.coached].sort(), ['p1', 'p2', 'p3', 'p4'], 'who of the roster they still have');
  // ⚠ A ROSTER THAT NAMES SOMEONE ELSE'S CLIENT READS NOTHING OF THEM (CodeRabbit's security check):
  // the stored roster is the coach's own row, which they may write directly. Nor a cancelled client,
  // nor one on a listing of another role's id; and an account with no listings, nobody.
  const mixed = await core.loadClientBreaks(db(), 'c1', ['p1', 'p2', 'p3', 'p4', 'p8', 'p9'], at);
  assert.deepEqual(Object.fromEntries(mixed.breaks), own);
  assert.deepEqual([...mixed.coached].sort(), ['p1', 'p2', 'p3', 'p4'], 'a cancelled client and a stranger\'s are not theirs');
  for (const who of ['member-x', '']) {
    const none = await core.loadClientBreaks(db(), who, ['p1', 'p9'], at);
    assert.deepEqual([none.coached.size, none.breaks.size], [0, 0], `${who || 'nobody'} has nobody`);
  }
  // The access check failing reads nothing (null: the run sends nothing); the breaks alone failing
  // still says who they have.
  for (const t of ['trainers', 'nutritionists', 'subscriptions']) assert.equal(await core.loadClientBreaks(db([t]), 'c1', ['p1'], at), null, `a failed ${t} read reads nothing`);
  const unread = await core.loadClientBreaks(db(['client_pauses']), 'c1', ['p1'], at);
  assert.deepEqual([[...unread.coached], unread.breaks], [['p1'], null]);
  assert.deepEqual((await core.loadClientBreaks(db(['profiles']), 'c1', ['p1'], at)).breaks.get('p1'), { until: '2026-11-20', by: 'trainer' }, 'no zone read: no instant, so the coach\'s day');
  assert.equal((await core.loadClientBreaks(db(), 'c1', [], at)).breaks.size, 0);
  // Saved before they went away, the roster reads them red; read fresh, they are away and clear.
  const savedHere = { role: 'trainer', at: +NOW, clients: [E.engineSnapshot(away(undefined))] };
  const savedAway = { role: 'trainer', at: +NOW, clients: [E.engineSnapshot(away({ until: '2026-11-20' }))] };
  const has = (breaks) => ({ coached: new Set(['p1']), breaks });
  const run = (snap, rosterAccess, revokedClients) => core.candidatesFor(snap, { tone: 'neutral', lastSeverity: {}, now: NOW, rosterAccess, revokedClients });
  assert.deepEqual(run(savedHere, null).candidates.map((c) => c.type), ['client_red']);
  assert.deepEqual(run(savedHere, has(null)).candidates.map((c) => c.type), ['client_red'], 'theirs, the breaks unread: as saved');
  const fresh = run(savedHere, has(new Map([['p1', { until: '2026-11-20', by: 'member' }]])));
  assert.deepEqual(fresh.candidates, []);
  assert.ok('p1' in fresh.coachSeen && !['red', 'amber'].includes(fresh.coachSeen.p1), 'seen clear');
  // A break the roster was saved with and no longer on record: as if none. One the read didn't list: as saved.
  assert.deepEqual(run(savedAway, has(new Map([['p1', null]]))).candidates.map((c) => c.type), ['client_red']);
  assert.deepEqual(run(savedAway, has(new Map())).candidates, []);
  // ⚠ A CLIENT THEY NO LONGER HAVE IS NOT EVALUATED (CodeRabbit's security check): red in the saved
  // roster, nothing sent, and seen clear, so an alert held for them goes too. So for the live route's
  // refused clients.
  const gone = run(savedHere, { coached: new Set(), breaks: new Map() });
  assert.deepEqual([gone.candidates, gone.coachSeen], [[], { p1: 'clear' }]);
  assert.deepEqual(run({ ...savedHere, clients: [] }, null, ['p1']).coachSeen, { p1: 'clear' });
  // The alert held for them before they went away is dropped, not sent.
  const held = { type: 'client_red', key: 'p1', sig: 'red:No food logs', title: 'Pat', body: 'No food logs', route: 'client', data: { providerRole: 'trainer' }, priority: 'high', channels: { push: true }, at: +NOW - 3600000 };
  for (const r of [fresh, gone]) {
    const d = NOTIFY.decideNotifications({ candidates: r.candidates, last: { date: 'never', pendingDigest: [held], coachClients: { p1: 'red' } }, prefs: { ...NOTIFY.DEFAULT_PREFS, tz: 'UTC', capTz: 'UTC' }, now: NOW, audience: 'coach', coachSeen: r.coachSeen });
    assert.deepEqual([d.nextState.pendingDigest, d.digest, d.send, d.nextState.coachClients], [[], null, [], {}]);
  }
  // The hourly run reads them for a coach's roster, with its other per-coach reads.
  const cron = read('src/app/api/ai/notify/cron/route.ts');
  assert.match(cron, /loadClientBreaks\(admin, userId, \(Array\.isArray\(snapshot\.clients\) \? snapshot\.clients : \[\]\)\.map\(coachRecordId\)\.filter\(\(v\): v is string => !!v\), now\),/);
  assert.match(cron, /zone: prefs\.tz, memberPaused, rosterAccess \}\);/);
  // Fail closed: who they still have can't be read, so nothing goes this hour.
  assert.match(cron, /if \(isCoach && !rosterAccess\) \{\n[^\n]*\n    return null;\n  \}/);
  // The live route hands on the clients its scope check refused.
  const live = read('src/app/api/ai/notify/route.ts');
  assert.match(live, /revokedClients = clients\.map\(\(c, i\) => \(checks\[i\] === null \? coachRecordId\(c\) : null\)\)\.filter\(\(v\): v is string => !!v\);/);
  assert.match(live, /zone: prefs\.tz, memberPaused, revokedClients \}\);/);
});
test('the hourly run says "Back from a break" for a break over since the roster was saved (Codex on #2705)', () => {
  // Saved on Nov 18 while Pat was away until the 20th; a member in Los Angeles is back at 08:00Z on the 21st.
  const brk = { until: '2026-11-20', by: 'member', backAt: '2026-11-21T08:00:00.000Z' };
  const snap = { role: 'trainer', at: +new Date('2026-11-18T12:00:00Z'), clients: [E.engineSnapshot(away(brk))] };
  const sent = (iso, breaks = new Map([['p1', brk]])) => core.candidatesFor(snap, { tone: 'neutral', lastSeverity: {}, now: new Date(iso), zone: 'UTC', rosterAccess: { coached: new Set(['p1']), breaks } })
    .candidates.map((c) => c.type + ':' + c.body);
  // Still away at the run: nothing.
  assert.deepEqual(sent('2026-11-21T07:00:00Z'), []);
  // Back since their midnight: the welcome back, that day and for the next two, though the roster is the 18th's.
  assert.match(sent('2026-11-21T09:00:00Z').join(), /^client_amber:[^,]*Back from a break today/);
  assert.match(sent('2026-11-23T09:00:00Z').join(), /^client_amber:[^,]*Back from a break since 2026-11-21/);
  // Three days back: the roster knows nothing of the days since, so none of the absence it holds speaks.
  assert.deepEqual(sent('2026-11-24T09:00:00Z'), []);
  // The break only as the roster was saved, not read at the run: away, as of the 18th.
  assert.deepEqual(sent('2026-11-21T09:00:00Z', null), []);
});
test('an alert held for a client\'s absence is dropped once they go away, though another flag keeps their row amber (Codex on #2705)', () => {
  // p1 and p3 are away, their plan ending in three days (amber, and a break leaves it); p4 is back today
  // (amber: the welcome back); p2 is here, red on absence.
  const ending = (id, pause) => ({ userId: id, ...away(pause, { profile: { id, name: 'Client ' + id, joinedAt: '2026-08-01T00:00:00Z' }, payments: { cancelAtPeriodEnd: true, periodEndsAt: '2026-11-14T12:00:00' } }) });
  const snap = { role: 'trainer', at: +NOW, clients: [ending('p1', { until: '2026-11-20' }), ending('p3', { until: '2026-11-20' }), { userId: 'p4', ...away({ until: '2026-11-10' }, { profile: { id: 'p4', name: 'Client p4', joinedAt: '2026-08-01T00:00:00Z' } }) }, { userId: 'p2', ...away(undefined, { profile: { id: 'p2', name: 'Client p2', joinedAt: '2026-08-01T00:00:00Z' } }) }] };
  const r = core.candidatesFor(snap, { tone: 'neutral', lastSeverity: { p1: 'red', p2: 'red', p3: 'red', p4: 'red' }, now: NOW });
  assert.deepEqual([r.coachSeen.p1, r.coachSeen.p3, r.coachSeen.p4, r.coachSeen.p2], ['amber', 'amber', 'amber', 'red'], 'away or just back, amber, not clear');
  assert.deepEqual(r.coachAway, { p1: ['plan_ending'], p3: ['plan_ending'], p4: ['pause_ended'] }, 'who is away or just back, with what their rows still say');
  // Held from before the break: p1 for their food logs, p3 for the plan ending, p2 for their food logs.
  const held = (key, reasonKey, body) => ({ type: 'client_red', key, sig: 'red:' + body, title: 'Client ' + key, body, route: 'client', data: { providerRole: 'trainer', clientId: key, reasonKey }, priority: 'high', channels: { push: true }, at: +NOW - 3600000 });
  const last = { date: 'never', coachClients: { p1: 'red', p2: 'red', p3: 'red', p4: 'red' }, pendingDigest: [held('p1', 'food_gap', 'p1 no food logs'), held('p3', 'plan_ending', 'p3 plan ending'), held('p4', 'contact_gap', 'p4 no contact'), held('p2', 'food_gap', 'p2 no food logs')] };
  const decide = (coachAway) => JSON.stringify(NOTIFY.decideNotifications({ candidates: r.candidates, last, prefs: { ...NOTIFY.DEFAULT_PREFS, tz: 'UTC', capTz: 'UTC' }, now: NOW, audience: 'coach', coachSeen: r.coachSeen, coachAway }));
  const out = decide(r.coachAway);
  assert.ok(!out.includes('p1 no food logs'), 'the absence alert of a client away is neither sent nor kept');
  assert.ok(!out.includes('p4 no contact'), 'nor of one back today');
  assert.ok(out.includes('p3 plan ending'), 'a reason the break leaves still goes');
  assert.ok(out.includes('p2 no food logs'), 'a client who is here is untouched');
  assert.ok(decide(null).includes('p1 no food logs'), 'without it, the stale alert went out mid-break');
  // Both routes hand it on.
  for (const f of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) assert.match(read(f), /const \{ audience, candidates, coachSeen, coachAway \} = candidatesFor\(/, f);
});
test('a member on a break is sent nothing held from before it began; a coach\'s held alert stays (Codex on #2705)', () => {
  const at = new Date('2026-11-11T15:00:00Z');
  const prefs = { ...NOTIFY.DEFAULT_PREFS, tz: 'UTC', capTz: 'UTC' };
  const move = { type: 'directive', key: 'self', sig: 'Focus|Log dinner||2026-11-09', title: 'Your move today', body: 'Log dinner', route: 'home', data: { move: 'log', lever: 'food' }, priority: 'high', channels: { push: true }, at: +at - 3600000 };
  const coach = { type: 'client_amber', key: 'c9', sig: 'amber:Pat', title: 'Pat', body: 'No food logs', route: 'client', data: { providerRole: 'trainer' }, priority: 'med', channels: { push: true }, at: +at - 3600000 };
  const last = { date: 'never', pendingDigest: [move, coach], types: { 'directive:self': { sig: move.sig, at: move.at } } };
  const items = (d) => (d.digest ? d.digest.data.items : []).map((i) => i.type).sort();
  assert.deepEqual(items(NOTIFY.decideNotifications({ candidates: [], last, prefs, now: at, audience: 'client' })), ['client_amber', 'directive'], 'without a break, both go');
  const away = NOTIFY.decideNotifications({ candidates: [], last, prefs, now: at, audience: 'client', memberPaused: true });
  assert.deepEqual(items(away), ['client_amber']);
  assert.ok(!away.nextState.pendingDigest.some((i) => i.type === 'directive'), 'and it is not kept for later');
  assert.ok(!('directive:self' in away.nextState.types), 'its stamp goes with it, so the move is sent once it is true after the break');
  // A coach's own run is untouched by a member's break.
  assert.deepEqual(items(NOTIFY.decideNotifications({ candidates: [], last, prefs, now: at, audience: 'coach', memberPaused: true })), ['client_amber', 'directive']);
  // Both routes hand it on.
  for (const f of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) assert.match(read(f), /\{ candidates, last, prefs, now, audience, checkinOptedOut, pushedToday, memberPaused, tr: copy\?\.tr, coachSeen, coachAway \}/, f);
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
test('a member on a break is sent none of the reminders they set, each held to its own day (Codex on #2705)', async () => {
  const { mock } = await import('node:test');
  const run = async (reminders, pauses, { failPauses = false } = {}) => {
    const sent = [], fired = [], asked = [];
    const admin = {
      from(table) {
        const q = { _in: null, _gte: null,
          select() { return q; }, eq() { return q; }, order() { return q; },
          in(k, v) { q._in = v; return q; }, gte(k, v) { q._gte = v; return q; },
          range: async () => ({ data: reminders, error: null }),
          update(patch) { return { eq: async (_k, id) => { fired.push({ id, ...patch }); return { error: null }; } }; },
          then(resolve, reject) {
            if (table !== 'client_pauses') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            asked.push({ ids: q._in, floor: q._gte });
            if (failPauses) return Promise.resolve({ data: null, error: { message: 'down' } }).then(resolve, reject);
            return Promise.resolve({ data: pauses.filter((p) => q._in.includes(p.client_id) && p.until_on >= q._gte), error: null }).then(resolve, reject);
          },
        };
        return q;
      },
    };
    const mod = await loadRealModule(join(ROOT, 'src/app/api/cron/reminders/route.ts'), {
      typescript: true,
      registry: new Map([
        ['next/server', { NextResponse: { json: (b, init) => ({ status: init?.status ?? 200, json: async () => b }) } }],
        ['@/lib/supabase/admin', { createAdminClient: () => admin }],
        ['@/lib/notify', { createNotification: async (_c, n) => { sent.push(n.data.reminderId); return true; } }],
      ]),
    });
    process.env.CRON_SECRET = 'cron-test';
    mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 21, 8, 0) });
    try {
      await mod.GET(new Request('https://x/api/cron/reminders', { headers: { 'x-cron-secret': 'cron-test' } }));
      return { sent, fired, asked };
    } finally { mock.timers.reset(); }
  };
  const r = (id, user, tz = 'UTC') => ({ id, user_id: user, kind: 'weigh_in', label: '', at_time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], tz, last_fired_on: null });
  const pauses = [
    { client_id: 'away', from_on: '2026-11-18', until_on: '2026-11-25' },
    { client_id: 'back', from_on: '2026-11-10', until_on: '2026-11-20' },
    { client_id: 'last', from_on: '2026-11-15', until_on: '2026-11-21' },
  ];
  const out = await run([r('r1', 'away'), r('r2', 'back'), r('r3', 'last'), r('r4', 'free')], pauses);
  assert.deepEqual(out.sent, ['r2', 'r4'], 'away, and on the last day away, nothing; back, or never away, as before');
  assert.deepEqual(out.fired.map((f) => [f.id, f.last_fired_on]), [['r1', '2026-11-21'], ['r2', '2026-11-21'], ['r3', '2026-11-21'], ['r4', '2026-11-21']], 'one held back is done for its day, not asked again each run');
  assert.deepEqual(out.asked, [{ ids: ['away', 'back', 'last', 'free'], floor: '2026-11-19' }], 'one read, for the members with a reminder due');
  // A reminder's own day: 08:00 on the 21st UTC is still the 20th in Honolulu, before that break ended there.
  assert.deepEqual((await run([{ ...r('r5', 'back', 'Pacific/Honolulu'), at_time: '22:00' }], pauses)).sent, []);
  // A breaks read that fails holds none back.
  assert.deepEqual((await run([r('r1', 'away'), r('r4', 'free')], pauses, { failPauses: true })).sent, ['r1', 'r4']);
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
  // With the instant the member is back (Codex on #2705), that, whatever this device's day.
  assert.equal(pauseHolds({ until: '2026-11-10', backAt: new Date(+now + 3600000).toISOString() }, now), true, 'their day ends later than this device\'s');
  assert.equal(pauseHolds({ until: '2026-11-11', backAt: new Date(+now - 1).toISOString() }, now), false, 'and earlier');
  assert.equal(pauseHolds({ until: '2026-11-11', backAt: 'soon' }, now), true, 'an unreadable instant: this device\'s day');
  const client = (res) => ({ rpc: async (name, args) => ({ name, args, ...res }) });
  assert.deepEqual(await readClientPause(client({ data: [{ until_on: '2026-11-20', set_by_role: 'trainer', set_by_me: true }], error: null }), 'c1'), { ok: true, ready: true, pause: { until: '2026-11-20', by: 'trainer', mine: true } });
  assert.deepEqual(await readClientPause(client({ data: [{ until_on: '2026-11-20', set_by_role: 'member', set_by_me: false, back_at: '2026-11-21T08:00:00+00:00' }], error: null }), 'c1'), { ok: true, ready: true, pause: { until: '2026-11-20', by: 'member', mine: false, backAt: '2026-11-21T08:00:00+00:00' } });
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
  // A saved break re-reads the roster behind the case file (Codex on #2705: ShapeSignals.changed, tested
  // in tests/app-roster-loading.test.mjs), read at call time.
  assert.match(mod, /if \(r\.ok\) \{\n\s+setSave\(\{ kind: 'idle' \}\);\n\s+setAttempt\(\(n\) => n \+ 1\);\n\s+try \{ window\.ShapeSignals\?\.changed\?\.\(\); \} catch \(e\) \{\}\n/);
  // …and the member's own break takes this device's habit reminders down, or puts them back (habitBreak.mjs,
  // tests/habit-break.test.mjs).
  assert.match(mod, /if \(clientId === uid\) \{ try \{ window\.ShapeHabitReminders\?\.syncBreak\?\.\(true\); \} catch \(e\) \{\} \}/);
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
