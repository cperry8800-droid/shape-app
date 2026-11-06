// The coach's push alerts (P2, 2026-11-05):
//   1. they fire again after a client recovers and later slips again — the memory of who was alerted
//      (`notify_state.coachClients`) was written and never cleared (notifications.mjs coachCandidates /
//      decideNotifications), so a client alerted once was never alerted again at that severity;
//   2. a coach who uses only the website gets them too — the hourly cron re-runs the roster snapshot a
//      surface last posted, and only the app posted one (and the app's records carried their id where
//      the route did not read it, so even its posts were dropped);
//   3. quiet hours and the alert switches still hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { READER_COPY_EN } from './helpers/reader-copy-en.mjs';
import { coachCandidates, coachSeen, settleCoachMemory, decideNotifications } from '../src/lib/ai/notifications.mjs';

const require_ = createRequire(import.meta.url);
const E = require_('../public/newdesign/dashSignals.js');
const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

// Noon in New York, outside the default quiet hours (22–7).
const NOON = new Date('2026-11-04T17:00:00Z');
const PREFS = { tz: 'America/New_York', capTz: 'America/New_York', quietStart: 22, quietEnd: 7, maxPerDay: 20 };
const DAY = 864e5;

// The pipeline candidatesFor runs (notify-core.ts), on a record at an instant.
function run(records, last, now = NOON, prefs = PREFS) {
  const rows = E.getTriageFeed('trainer', records, now).map((r) => ({
    clientId: r.client.userId, clientName: r.client.profile.name, severity: r.severity,
    reason: (r.lead && r.lead.reason) || r.reasons[0] || '', flags: r.flags, lead: r.lead,
  }));
  const candidates = coachCandidates({ triageRows: rows, lastSeverity: last.coachClients || {}, providerRole: 'trainer' });
  const d = decideNotifications({ candidates, last, prefs, now, audience: 'coach', coachSeen: coachSeen(rows) });
  return { sent: d.send.map((s) => s.type + ':' + s.data.clientId), held: d.suppressed.map((s) => s.reason), state: d.nextState, digest: d.digest };
}
const client = (over) => ({ userId: 'c1', profile: { id: 'c1', name: 'Sam R.' }, checkIn: { lastWeekOf: '2026-11-02' }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: '2026-11-03', daysLogged7d: 6 }, ...over });
const quiet = (days) => client({ lastContact: { trainer: new Date(NOON.getTime() - days * DAY).toISOString() } });
const fine = client({ lastContact: { trainer: new Date(NOON.getTime() - DAY).toISOString() } });
const red = client({ lastContact: { trainer: new Date(NOON.getTime() - 6 * DAY).toISOString() }, streaks: { current: 0, best: 9 } });

test('amber → recovers → amber again: the second slip alerts', () => {
  const a = run([quiet(6)], {});
  assert.deepEqual(a.sent, ['client_amber:c1']);
  const again = run([quiet(6)], a.state);
  assert.deepEqual(again.sent, [], 'still amber: no re-nag');
  const ok = run([fine], again.state);
  assert.equal('c1' in ok.state.coachClients, false, 'recovered: forgotten');
  const slip = run([quiet(6)], ok.state);
  assert.deepEqual(slip.sent, ['client_amber:c1'], 'the same reason again is a new event');
});

test('red → recovers → red again alerts; red → eases to amber → red again alerts', () => {
  const r1 = run([red], {});
  assert.deepEqual(r1.sent, ['client_red:c1']);
  const eased = run([quiet(6)], r1.state);
  assert.deepEqual(eased.sent, [], 'easing is not news');
  assert.equal(eased.state.coachClients.c1, 'amber', 'but it is remembered as amber');
  assert.deepEqual(run([red], eased.state).sent, ['client_red:c1'], 'worse again: alerted');
  const ok = run([fine], r1.state);
  assert.deepEqual(run([red], ok.state).sent, ['client_red:c1']);
});

test('a client the run did not see keeps what it had', () => {
  assert.deepEqual(settleCoachMemory({ c1: 'red', c2: 'amber' }, { c2: 'clear' }), { c1: 'red' });
  assert.deepEqual(settleCoachMemory({ c1: 'red' }, { c1: 'amber' }), { c1: 'amber' });
  assert.deepEqual(settleCoachMemory({ c1: 'amber' }, { c1: 'red' }), { c1: 'amber' }, 'worsening is the alert\'s to record');
  assert.deepEqual(settleCoachMemory({ c1: 'red' }, null), { c1: 'red' });
});

test('a row whose only flags are routed to the other coach reads as clear for this one', () => {
  const rows = [
    { clientId: 'a', severity: 'red', flags: [{ owned: true }] },
    { clientId: 'b', severity: 'amber', flags: [{ owned: false }] },
    { clientId: 'c', severity: 'green', flags: [] },
    { clientId: '', severity: 'red', flags: [{ owned: true }] },
  ];
  assert.deepEqual(coachSeen(rows), { a: 'red', b: 'clear', c: 'clear' });
});

test('an alert held for the digest is dropped when the client recovers before it goes', () => {
  const night = new Date('2026-11-05T04:00:00Z'); // 11 pm in New York: quiet hours
  const held = run([quiet(6)], {}, night);
  assert.deepEqual(held.sent, []);
  assert.deepEqual(held.held, ['quiet_hours'], 'quiet hours hold a coach alert');
  assert.equal(held.state.pendingDigest.length, 1);
  const ok = run([fine], held.state);
  assert.equal(ok.digest, null, 'not delivered after they recovered');
  assert.equal(ok.state.pendingDigest.length, 0);
  // Still slipping by morning: the held alert goes out in the digest, as before.
  assert.ok(run([quiet(6)], held.state).digest, 'a client still amber gets the held alert');
});

test("the alert switches hold: a coach who turned 'Client went amber' off is not sent one", () => {
  const off = { ...PREFS, matrix: { client_amber: { inapp: false, push: false, email: false } } };
  const r = run([quiet(6)], {}, NOON, off);
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.held, ['opted_out']);
});

test('the push says the lead the website leads with', () => {
  // Contact (80) outranks the streak (40); the old push took the first owned flag in rule order.
  const rows = E.getTriageFeed('trainer', [red], NOON).map((r) => ({ clientId: 'c1', clientName: 'Sam', severity: r.severity, reason: r.reasons[0], flags: r.flags, lead: r.lead }));
  assert.equal(E.getTriageFeed('trainer', [red], NOON)[0].flags[0].key, 'streak_broken', 'rule order puts the streak first');
  const [alert] = coachCandidates({ triageRows: rows, lastSeverity: {} });
  assert.equal(alert.body, 'No contact in 6 days');
  assert.equal(alert.data.reasonKey, 'contact_gap');
});

// ── the website posts the snapshot ──────────────────────────────────────────
function slice(src, name) {
  const at = src.indexOf('function ' + name + '(');
  let d = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(at, j + 1); }
  throw new Error(name);
}
test('a website-only coach posts the roster to the push, every 30 minutes at most, without page-only data', () => {
  const DATA = read('public/newdesign/dashData.jsx');
  const store = new Map();
  const calls = [];
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const fetch = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }); };
  // eslint-disable-next-line no-new-func
  const post = new Function('DashSignals', 'localStorage', 'fetch', 'const DASH_NOTIFY_EVERY_MS = 30 * 60 * 1000;\n' + slice(DATA, 'dashPostNotifySnapshot') + '; return dashPostNotifySnapshot;')(E, localStorage, fetch);
  const recs = [{ profile: { id: 'c1', name: 'A' }, intake: [{ l: 'private' }], streaks: { current: 0, best: 5 } }, { profile: { id: null, name: 'demo' } }];
  assert.equal(post('trainer', recs), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/ai/notify');
  assert.equal(calls[0].init.credentials, 'same-origin');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.role, 'trainer');
  assert.deepEqual(body.clients.map((c) => c.userId), ['c1'], 'a record with no id is not posted');
  assert.equal('intake' in body.clients[0], false);
  assert.equal(post('trainer', recs), false, 'throttled');
  assert.equal(post('nutritionist', recs), true, 'each role on its own clock');
  assert.equal(post('client', recs), false, 'a member page never posts a roster');
  assert.equal(post('trainer', []), false);
  assert.match(DATA, /dashPostNotifySnapshot\(role, DashSignals\.attachCoachContext\(records\.filter\(\(r, i\) => !!overviews\[i\]\), ctx, role\)\);/, 'posted after the enriched read, unread clients left out, with the role\'s dismissals');
});

test('the route reads the id where a record carries it, and the role only when the coach holds it', () => {
  const route = read('src/app/api/ai/notify/route.ts');
  assert.match(route, /const id = coachRecordId\(c\);/);
  assert.match(route, /const role = rosterRole\(parsed\.data\.role, actor\);/);
  assert.match(route, /const snapshot: Snapshot = \{ role, tz: prefs\.tz, at: \+now \};/);
  for (const rel of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) {
    const src = read(rel);
    assert.match(src, /loadCoachContext\(/, rel + ' does not read the dismissals and reviews fresh');
    assert.match(src, /tr: copy\?\.tr, coachSeen \}/, rel + ' does not settle the alert memory');
  }
  // The app posts the engine's snapshot, with the id the route reads.
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /records\.map\(\(r\) => E\.engineSnapshot\(r\)\)\.filter\(Boolean\)/);
});

// ── A coach with both listings (2026-11-05) ─────────────────────────────────
// One auth user owns a trainer row and a nutritionist row, and each dashboard posts its own role's
// roster. They went to the one `notify_snapshot`, so opening the second replaced the first and the
// hourly run alerted for one role only; and a dietitian's nutrition page (which posts 'nutritionist')
// was refused its role. The routes run here as shipped, over a fake database.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const delivered = [];
const core = await loadRealModule(join(ROOT, 'src/lib/ai/notify-core.ts'), {
  typescript: true,
  registry: new Map([
    ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')],
    ['@/lib/ai/memberTranslator.mjs', { memberLocaleCode: () => 'en' }],
    ['@/lib/reader-copy', READER_COPY_EN],
    ['../../../mobile-app/src/services/leadReason.mjs', await import('../mobile-app/src/services/leadReason.mjs')],
    ['@/lib/roles.mjs', await import('../src/lib/roles.mjs')],
    ['@/lib/notify', { createNotification: async (_admin, n) => { delivered.push(n); return true; } }],
    ['@/lib/email', { sendEmail: async () => ({ ok: true }) }],
    ['@/lib/time', await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true })],
    ['@/lib/push-cap', { claimPushSlots: async () => null }],
    ['../../../public/newdesign/dashSignals.js', { __esModule: true, default: E }],
  ]),
});
let db = null;
let actor = null;
const roles = await import('../src/lib/roles.mjs');
const liveRoute = await loadRealModule(join(ROOT, 'src/app/api/ai/notify/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
    ['@/lib/ai/server', { resolveActor: async () => actor }],
    ['@/lib/supabase/admin', { createAdminClient: () => db }],
    ['@/lib/ai/notify-core', core],
    ['@/lib/push-cap', { releasePushClaim: async () => {} }],
    ['@/lib/roles.mjs', roles],
    ['@/lib/require-membership', { requireMembership: async () => null }],
  ]),
});
const cronRoute = await loadRealModule(join(ROOT, 'src/app/api/ai/notify/cron/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/supabase/admin', { createAdminClient: () => db }],
    ['@/lib/ai/notify-core', core],
    ['@/lib/push-cap', { releasePushClaim: async () => {} }],
    ['@/lib/roles.mjs', roles],
    ['../../../../../lib/run-rotation.mjs', await import('../src/lib/run-rotation.mjs')],
  ]),
});
// The fake database, with the upsert writeUserGoal makes.
function notifyDb(tables) {
  const fake = fakeSupabase({ tables, rpcs: { is_coach_on_client: () => true } });
  const from = fake.from;
  fake.from = (table) => {
    const chain = from(table);
    chain.upsert = async (row, opts) => {
      const keys = String((opts && opts.onConflict) || '').split(',').map((k) => k.trim()).filter(Boolean);
      const rows = (tables[table] = tables[table] || []);
      const at = rows.findIndex((r) => keys.length && keys.every((k) => r[k] === row[k]));
      if (at >= 0) rows[at] = { ...rows[at], ...row }; else rows.push({ ...row });
      return { data: null, error: null };
    };
    return chain;
  };
  return fake;
}
// A client the engine reads on the real clock: this week's check-in filed, logging daily, and the given
// last contact per role (six days is amber; one day is clear).
const localDay = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const thisMonday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDay(d); };
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
const rosterClient = (id, lastContact) => ({ userId: id, profile: { id, name: 'Client ' + id }, checkIn: { lastWeekOf: thisMonday() }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: localDay(new Date(Date.now() - DAY)), daysLogged7d: 6 }, lastContact });
const docOf = (tables, kind) => ((tables.user_goals || []).find((r) => r.kind === kind) || {}).data;
const sentAs = () => delivered.map((n) => n.data.providerRole + ':' + n.data.clientId).sort();
const postRoster = (body) => liveRoute.POST(new Request('https://shape.test/api/ai/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
process.env.NOTIFY_CRON_SECRET = 'cron-test';
const runCron = async () => (await cronRoute.GET(new Request('https://shape.test/api/ai/notify/cron', { headers: { 'x-notify-secret': 'cron-test' } }))).json();

test('the role a roster is posted as: one the coach holds, compared as provider roles (a dietitian holds the nutritionist\'s)', () => {
  const dual = { role: 'trainer', roles: ['trainer', 'dietitian'] };
  assert.equal(core.rosterRole('nutritionist', dual), 'nutritionist', 'the nutrition page of a trainer who is also a dietitian');
  assert.equal(core.rosterRole('nutritionist', { role: 'dietitian', roles: ['dietitian'] }), 'nutritionist');
  assert.equal(core.rosterRole('dietitian', { role: 'nutritionist', roles: ['nutritionist'] }), 'dietitian');
  assert.equal(core.rosterRole('trainer', dual), 'trainer');
  assert.equal(core.rosterRole('nutritionist', { role: 'trainer', roles: ['trainer'] }), 'trainer', 'a role not held is the profile\'s');
  assert.equal(core.rosterRole('client', dual), 'trainer');
  assert.equal(core.rosterRole(undefined, { role: 'client', roles: ['client'] }), 'client');
  assert.equal(core.notifyKind('notify_snapshot', 'trainer'), 'notify_snapshot:trainer');
  assert.equal(core.notifyKind('notify_snapshot', 'dietitian'), 'notify_snapshot:nutritionist');
  assert.equal(core.notifyKind('notify_state', 'client'), 'notify_state', "a member's keeps the plain key");
});

test("the live route keeps each role's roster and alert memory, and takes a dietitian's nutrition page as theirs", async () => {
  const tables = { user_goals: [] };
  db = notifyDb(tables);
  actor = { user: { id: 'coach-1' }, role: 'trainer', roles: ['trainer', 'dietitian'], supabase: db };
  delivered.length = 0;
  assert.equal((await postRoster({ role: 'nutritionist', clients: [rosterClient('n1', { nutritionist: daysAgo(6) })] })).status, 200);
  assert.equal((await postRoster({ role: 'trainer', clients: [rosterClient('t1', { trainer: daysAgo(6) })] })).status, 200);
  assert.equal(docOf(tables, 'notify_snapshot:nutritionist').role, 'nutritionist', 'evaluated as the nutritionist, not the profile\'s trainer');
  assert.deepEqual(docOf(tables, 'notify_snapshot:nutritionist').clients.map((c) => c.userId), ['n1']);
  assert.deepEqual(docOf(tables, 'notify_snapshot:trainer').clients.map((c) => c.userId), ['t1'], 'the second page did not replace the first');
  assert.equal(docOf(tables, 'notify_snapshot'), undefined);
  assert.ok(docOf(tables, 'notify_state:trainer') && docOf(tables, 'notify_state:nutritionist'), 'each role its own alert memory');
  assert.deepEqual(sentAs(), ['nutritionist:n1', 'trainer:t1']);
  // A role the caller does not hold is evaluated as the profile's.
  actor = { ...actor, roles: ['trainer'] };
  await postRoster({ role: 'nutritionist', clients: [rosterClient('n2', { trainer: daysAgo(6) })] });
  assert.deepEqual(docOf(tables, 'notify_snapshot:trainer').clients.map((c) => c.userId), ['n2']);
  assert.deepEqual(docOf(tables, 'notify_snapshot:nutritionist').clients.map((c) => c.userId), ['n1']);
});

test('the hourly run evaluates both rosters, each on its own memory: a client on both is not alerted every hour', async () => {
  const tables = { user_goals: [
    // s1 is on both rosters: clear for the trainer, amber for the nutritionist.
    { user_id: 'coach-1', kind: 'notify_snapshot:trainer', data: { role: 'trainer', at: Date.now(), clients: [rosterClient('t1', { trainer: daysAgo(6) }), rosterClient('s1', { trainer: daysAgo(1) })] } },
    { user_id: 'coach-1', kind: 'notify_snapshot:nutritionist', data: { role: 'nutritionist', at: Date.now(), clients: [rosterClient('s1', { nutritionist: daysAgo(6) })] } },
  ] };
  db = notifyDb(tables);
  delivered.length = 0;
  const first = await runCron();
  assert.deepEqual([first.active, first.evaluated], [1, 1], 'one person, both rosters');
  assert.deepEqual(sentAs(), ['nutritionist:s1', 'trainer:t1']);
  delivered.length = 0;
  await runCron();
  assert.deepEqual(delivered, [], "the trainer reading s1 clear does not make the nutritionist alert again");
  assert.deepEqual(Object.keys(docOf(tables, 'notify_state:nutritionist').coachClients), ['s1']);
  assert.deepEqual(Object.keys(docOf(tables, 'notify_state:trainer').coachClients), ['t1']);
});

test('the run still reads the one snapshot from before the split, until that role posts its own', async () => {
  const legacyState = { coachClients: { t1: 'amber' }, pendingDigest: [{ type: 'client_amber', key: 'n7', sig: 'amber:x', data: { providerRole: 'nutritionist' } }, { type: 'client_amber', key: 't7', sig: 'amber:y', data: { providerRole: 'trainer' } },
    // A held member notice (the account is also a member): no provider role, so no coach role's (Codex on #2622).
    { type: 'checkin_due', key: 'm1', sig: 'due:w', data: {} }] };
  const tables = { user_goals: [
    { user_id: 'coach-1', kind: 'notify_snapshot', data: { role: 'trainer', at: Date.now(), clients: [rosterClient('t1', { trainer: daysAgo(6) }), rosterClient('t2', { trainer: daysAgo(6) })] } },
    { user_id: 'coach-1', kind: 'notify_state', data: legacyState },
  ] };
  db = notifyDb(tables);
  delivered.length = 0;
  await runCron();
  const alerts = delivered.filter((n) => n.data && n.data.clientId).map((n) => n.data.providerRole + ':' + n.data.clientId);
  assert.deepEqual(alerts, ['trainer:t2'], 'the old roster runs, on the old memory: t1 was alerted before');
  assert.ok(docOf(tables, 'notify_state:trainer'), 'and its memory is the role\'s own from now on');
  // A role's first read since the split: the shared memory, its held alerts narrowed to the role's.
  const shared = notifyDb({ user_goals: [{ user_id: 'coach-1', kind: 'notify_state', data: legacyState }] });
  const asTrainer = await core.readNotifyState(shared, 'coach-1', 'trainer');
  assert.deepEqual(asTrainer.coachClients, { t1: 'amber' });
  assert.deepEqual(asTrainer.pendingDigest.map((i) => i.key), ['t7'], "the nutritionist's held alert is not sent as the trainer's");
  assert.deepEqual((await core.readNotifyState(shared, 'coach-1', 'dietitian')).pendingDigest.map((i) => i.key), ['n7']);
  const own = notifyDb({ user_goals: [{ user_id: 'coach-1', kind: 'notify_state', data: legacyState }, { user_id: 'coach-1', kind: 'notify_state:trainer', data: { coachClients: {} } }] });
  assert.deepEqual(await core.readNotifyState(own, 'coach-1', 'trainer'), { coachClients: {} }, 'once it has its own, only its own');
  assert.equal((await core.readNotifyState(shared, 'coach-1', 'client')).pendingDigest.length, 3, "a member's is the plain one, its own held notice included");
  // The day's push count stays the person's (Codex on #2622): each role writes its memory to its own key
  // and the count to the shared one, and reads the count back from there, so two roles share one budget
  // when the day's pushes can't be read.
  const budget = { user_goals: [] };
  const bdb = notifyDb(budget);
  await core.writeNotifyState(bdb, 'coach-1', 'trainer', { date: '2026-11-05', sentToday: 3, coachClients: { t1: 'amber' } });
  assert.deepEqual(docOf(budget, 'notify_state'), { date: '2026-11-05', sentToday: 3 });
  const asNutri = await core.readNotifyState(bdb, 'coach-1', 'nutritionist');
  assert.equal(asNutri.sentToday, 3, "the trainer's pushes count against the nutritionist's run");
  assert.equal(asNutri.date, '2026-11-05');
  await core.writeNotifyState(bdb, 'coach-1', 'nutritionist', { ...asNutri, sentToday: 4, coachClients: { n1: 'amber' } });
  assert.equal((await core.readNotifyState(bdb, 'coach-1', 'trainer')).sentToday, 4);
  assert.deepEqual((await core.readNotifyState(bdb, 'coach-1', 'trainer')).coachClients, { t1: 'amber' }, 'the memory stays the role\'s');
  const capped = decideNotifications({ candidates: [{ type: 'client_red', key: 'x', sig: 'red:x', severity: 'red', title: 't', body: 'b', data: {} }], last: { ...asNutri, sentToday: 99 }, prefs: { dailyCap: 3 }, now: new Date('2026-11-05T15:00:00Z'), audience: 'coach', pushedToday: null });
  assert.equal(capped.send.filter((n) => n.channels ? n.channels.push : true).length === 0 || capped.send.length === 0, true, 'a shared count at the cap holds the push');
  // Once that role posts its own, the old one is not read for it; a member's record there still is.
  const rows = [
    { kind: 'notify_snapshot', data: { role: 'trainer', at: 1 } },
    { kind: 'notify_snapshot:trainer', data: { role: 'trainer', at: 2 } },
    { kind: 'notify_snapshot:nutritionist', data: { role: 'nutritionist', at: 3 } },
  ];
  assert.deepEqual(core.snapshotsToEvaluate(rows).map((s) => s.at), [2, 3]);
  assert.deepEqual(core.snapshotsToEvaluate([{ kind: 'notify_snapshot', data: { role: 'nutritionist', at: 1 } }, rows[1]]).map((s) => s.at), [1, 2], 'the old roster of the other role still runs');
  assert.deepEqual(core.snapshotsToEvaluate([{ kind: 'notify_snapshot', data: { role: 'dietitian', at: 1 } }, rows[2]]).map((s) => s.at), [3], "a dietitian's is the nutritionist's");
  assert.deepEqual(core.snapshotsToEvaluate([{ kind: 'notify_snapshot', data: { role: 'client', at: 1 } }, rows[1]]).map((s) => s.at), [1, 2]);
  assert.deepEqual(core.snapshotsToEvaluate(rows.slice(1), 3).map((s) => s.at), [3], 'one past the active window is skipped');
  assert.deepEqual(core.snapshotsToEvaluate(null), []);
  // The cron reads every key, and evaluates each role on its own state.
  const cron = read('src/app/api/ai/notify/cron/route.ts');
  assert.match(cron, /\.in\('kind', NOTIFY_SNAPSHOT_KINDS\)/);
  assert.match(cron, /readNotifyState\(admin, userId, snapshot\.role\)/);
  assert.match(cron, /writeNotifyState\(admin, userId, snapshot\.role, nextState/);
  assert.match(read('src/app/api/ai/notify/route.ts'), /writeNotifyState\(actor\.supabase, actor\.user\.id, role, nextState/);
});

// ── The app posts every coach role it holds (#2622's follow-up) ───────────────
// evaluateNotifications built one roster from `profile.role` behind one shared stamp, so a coach with
// both listings never posted the second from the app, and evaluating one role silenced the other.
test('the app posts one roster per held coach role, each on its own throttle, and a member their record', async () => {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const block = src.slice(src.indexOf('const NOTIFY_THROTTLE_MS'), src.indexOf('window.ShapeNotify = { evaluate: evaluateNotifications };'));
  assert.ok(block.length > 200, 'the notify block moved');
  const run = async (profile, store = {}) => {
    const posts = [];
    const win = {
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
      ShapeSignals: { coachRecords: async (role) => [{ profile: { id: role + '-client' } }], selfRecord: async () => ({ me: true }) },
      DashSignals: { engineSnapshot: (r) => ({ userId: r.profile.id }) },
    };
    const fetchFake = async (url, init) => { posts.push(JSON.parse(init.body)); return { json: async () => ({ ok: true }) }; };
    const state = { session: { access_token: 't' }, profile };
    const providerDiscipline = (role) => (role === 'dietitian' ? 'nutritionist' : role);
    const evaluate = new Function('window', 'fetch', 'state', 'apiBaseUrl', 'providerDiscipline', block + '\nreturn evaluateNotifications;')(win, fetchFake, state, 'https://x', providerDiscipline);
    await evaluate(false);
    return { posts, store };
  };
  // Both listings (a dietitian on the nutrition rails): a roster each, under its own role and key.
  const both = await run({ role: 'trainer', roles: ['trainer', 'dietitian'] });
  assert.deepEqual(both.posts.map((b) => b.role), ['trainer', 'nutritionist']);
  assert.equal(both.posts[1].clients[0].userId, 'nutritionist-client');
  assert.equal(both.posts.some((b) => 'record' in b), false, 'a coach posts no member record');
  assert.deepEqual(Object.keys(both.store).sort(), ['shape.notify.last:nutritionist', 'shape.notify.last:trainer']);
  // One role's fresh stamp does not silence the other.
  const one = await run({ role: 'trainer', roles: ['trainer', 'nutritionist'] }, { 'shape.notify.last:trainer': String(Date.now()) });
  assert.deepEqual(one.posts.map((b) => b.role), ['nutritionist']);
  // A member who also coaches: their roster, and their own record on the old key.
  const member = await run({ role: 'client', roles: ['client', 'trainer'] });
  assert.deepEqual(member.posts.map((b) => (b.record ? 'record' : b.role)), ['trainer', 'record']);
  assert.equal('shape.notify.last' in member.store, true);
  // A plain member: the record alone.
  const plain = await run({ role: 'client', roles: ['client'] });
  assert.deepEqual(plain.posts.map((b) => (b.record ? 'record' : b.role)), ['record']);
  // The sign-out forgets every stamp.
  assert.match(src, /\['shape\.notify\.last', 'shape\.notify\.last:trainer', 'shape\.notify\.last:nutritionist'\]\.forEach/);
});
