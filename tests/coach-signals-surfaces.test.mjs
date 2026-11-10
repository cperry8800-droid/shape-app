// One engine everywhere (P2, 2026-11-05): the SAME client, fed through every surface's own input
// path, gets the same flags and the same reasons.
//
// The four readers used to build their records four ways — the website from the overview without
// sleep, energy or hunger; the app from the get_client_* rollups without streak, Score, targets or the
// last-logged day; Nora from three RPCs without contact, screening or the week-one board; the push from
// whatever the app posted — so a client could be red on one and on track on another. Each now runs the
// one builder, DashSignals.recordFromOverview, over the same overview. These drive the SHIPPED paths:
//   website — dashData.jsx's _dashRecordFromLive, brace-matched out of the file;
//   app     — shapeSignals.js's triageLive, loaded with a scripted window;
//   Nora    — coachToday.mjs's readCoachToday over the shared fake Supabase;
//   push    — notify-core.ts's candidatesFor over the snapshot the website posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { READER_COPY_EN } from './helpers/reader-copy-en.mjs';
import { readCoachToday } from '../src/lib/ai/coachToday.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const E = require_('../public/newdesign/dashSignals.js');

// ── One client, every leg the engine reads ──────────────────────────────────
// Real time: the app's triage runs on the clock it is called on, so every date here is relative to it.
const NOW = new Date();
const DAY = 864e5;
const isoDay = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ago = (days) => isoDay(new Date(NOW.getTime() - days * DAY));
const mondayOf = (d) => { const x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const MONDAY = isoDay(mondayOf(NOW));
const mondaysAgo = (w) => isoDay(new Date(mondayOf(NOW).getTime() - w * 7 * DAY));
const CID = '0b9d3a52-6a4e-4c7c-9a7e-2f1f6b0c1a11';
const JOINED = new Date(NOW.getTime() - 200 * DAY).toISOString();

function overview({ careTeam } = {}) {
  return {
    // Four days logged, the last three days ago: the calorie and protein averages have their days
    // (NUTRITION_MIN_DAYS), and a trainer's 5-day food-log gap has not come (2026-11-10).
    stats: { sessionsCompleted: 6, sessionsPlanned: 10, daysLogged7d: 4, avgCalories: 2600, avgProtein: 90 },
    logs: { lastLoggedOn: ago(3), daysLogged7d: 4, recent: [] },
    nutritionTargets: { calories: 2100, protein: 150 },
    // A 29% fall: a coach's score drop is relative, and context.
    scoreHistory: { weeks: [{ weekOf: mondaysAgo(2), points: 70, partial: false }, { weekOf: mondaysAgo(1), points: 50, partial: false }, { weekOf: MONDAY, points: 12, partial: true }], streak: { current: 0, best: 10, lastActiveOn: ago(3) } },
    lastContact: { trainer: new Date(NOW.getTime() - 8 * DAY).toISOString(), nutritionist: null },
    sleep: { avg7: 5.5, latest: 5.5, series7: [1, 2, 3, 4].map((d, i) => ({ date: ago(d), value: [5.4, 5.6, 5.5, 5.5][i] })) },
    vitals: { energy: { avg7: 3.2, n: 4 }, hunger: { avg7: 8.5, n: 4 } },
    deviceRecovery: { avg7: 28, n: 4 },
    screening: 'flagged',
    checkins: [{ week_of: MONDAY, ratings: { sleep: 1, stress: 5, trainingAdherence: 4 }, question: 'Can we swap Friday?', created_at: NOW.toISOString() }],
    replyWait: { trainer: new Date(NOW.getTime() - 30 * 3600e3).toISOString(), nutritionist: null },
    bookedSessions: { trainer: { done: 6, planned: 10 }, nutritionist: null },
    program: { name: 'Strength Block 2', week: 4, weeks: 4, status: 'active', estimatedEndAt: new Date(NOW.getTime() + 3 * DAY).toISOString(), overdue: false, nextAssigned: null },
    careTeam: careTeam || [{ role: 'trainer', providerId: 7, name: 'Coach', userId: 'coach-1', isMe: true }],
    careTeamPartial: false,
    goals: null,
  };
}
const ROW = { id: CID, name: 'Ana Lee', isNew: false, joinedAt: JOINED, paymentRetrying: true };
const flagsOf = (row) => row.flags.map((f) => f.key + ' | ' + f.reason + ' | ' + f.owned).sort();

// ── the website ─────────────────────────────────────────────────────────────
const DATA = readFileSync(join(ROOT, 'public/newdesign/dashData.jsx'), 'utf8');
function fn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.notEqual(at, -1, name + ' not found');
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced ' + name);
}
// eslint-disable-next-line no-new-func
const recordFromLive = new Function('DashSignals', fn(DATA, '_dashRecordFromLive') + '; return _dashRecordFromLive;')(E);
const CTX = { dismissals: [], reviews: {} };
const websiteRow = (ov = overview(), thresholds) => {
  const rec = recordFromLive(ROW, ov, {}, null);
  return E.getTriageFeed('trainer', E.attachCoachContext([rec], CTX), NOW, thresholds)[0];
};

// ── the app ─────────────────────────────────────────────────────────────────
let appOverview = overview();
let appSettings = {};
let appDismissals = [];
const appDismissCalls = [];
globalThis.window = {
  ShapeAuth: { getCachedState: () => ({ user: { id: 'coach-1' } }) },
  ShapeAssign: { clients: async () => [{ userId: CID, name: 'Ana Lee', isNew: false, joinedAt: JOINED, paymentRetrying: true }] },
  ShapeCareTeam: { overviews: async () => ({ [CID]: appOverview }) },
  shapeDb: { getUserGoals: async (kind) => (kind === 'coach_week_reviews' ? {} : kind === 'coach_settings' ? appSettings : null) },
  ShapeSignalDismissals: {
    list: async () => appDismissals,
    set: async (...args) => { appDismissCalls.push(['set', ...args]); return true; },
    clear: async (...args) => { appDismissCalls.push(['clear', ...args]); return true; },
  },
  DashSignals: E,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
};
await loadRealModule(join(ROOT, 'mobile-app/src/services/shapeSignals.js'), {
  registry: new Map([['../../../public/newdesign/dashSignals.js', {}]]),
});
const appRow = async () => (await window.ShapeSignals.triageLive('trainer', { force: true }))[0];

// ── Nora ────────────────────────────────────────────────────────────────────
const dbTables = () => ({
  trainers: [{ id: 7, owner_id: 'coach-1', name: 'Coach' }],
  nutritionists: [],
  subscriptions: [{ client_id: CID, status: 'past_due', provider_role: 'trainer', provider_id: 7, created_at: JOINED }],
  sessions: [],
  user_goals: [],
});
const dbRpcs = () => ({ get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: 'Ana Lee' })) });
function noraDb() {
  return fakeSupabase({ tables: dbTables(), rpcs: dbRpcs() });
}

// ── the push ────────────────────────────────────────────────────────────────
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

test('the website feeds every leg: sleep, energy, hunger, wearable recovery, replies, the new signals', () => {
  const row = websiteRow();
  const keys = row.flags.map((f) => f.key).sort();
  // No broken streak: it is the member's own, no coach's (2026-11-10).
  assert.deepEqual(keys, ['checkin_waiting', 'contact_gap', 'energy_low', 'hunger_high', 'ledger_blown', 'missed_sessions',
    'payment_retrying', 'program_ending', 'protein_under', 'recovery_low', 'reply_waiting', 'score_drop', 'screening_flagged', 'sleep_low'].sort());
  // The logging and streak legs reach the record; the rules that read them decide.
  assert.deepEqual(row.client.foodLogs, { lastLoggedOn: ago(3), daysLogged7d: 4 });
  assert.equal(row.client.streaks.current, 0);
});

test('the app gets the same flags and reasons as the website, from the same overview', async () => {
  appOverview = overview(); appSettings = {};
  const web = websiteRow();
  const app = await appRow();
  assert.deepEqual(flagsOf(app), flagsOf(web));
  assert.equal(app.severity, web.severity);
  assert.equal(app.lead.reason, web.lead.reason);
  assert.equal(app.lead.action.kind, web.lead.action.kind);
  assert.equal(app.directive.read.summary30d, web.directive.read.summary30d);
});

test("the app runs on the coach's own tuning, as the website does", async () => {
  appOverview = overview();
  appSettings = { thresholds: { FOOD_GAP_DAYS: 2, MISSED_SESSIONS: 9 } };
  const tuned = E.resolveThresholds(appSettings.thresholds, 'trainer').thresholds;
  const app = await appRow();
  const web = websiteRow(overview(), tuned);
  assert.equal(app.flags.some((f) => f.key === 'food_gap'), true, 'the tuned gap is shorter than the 3 days since the last log');
  assert.equal(app.flags.some((f) => f.key === 'missed_sessions'), false);
  assert.deepEqual(flagsOf(app), flagsOf(web));
  appSettings = {};
});

test("Nora reads the same record: contact, screening and the rest reach her answer, with the coach's move", async () => {
  const web = websiteRow();
  const t = await readCoachToday(noraDb(), 'coach-1', { now: NOW, zone: 'UTC', role: 'trainer', readOverviews: async (ids) => ({ [ids[0]]: overview() }) });
  assert.equal(t.needsYou.checked, 1);
  assert.equal(t.needsYou.items.length, 1);
  const item = t.needsYou.items[0];
  assert.equal(item.severity, web.severity);
  assert.equal(item.why, web.directive.verdict + ': ' + web.directive.reason);
  assert.equal(item.move, web.lead.action.label);
  // The three legs Nora never had before P2 are in her record now.
  const noRead = await readCoachToday(noraDb(), 'coach-1', { now: NOW, zone: 'UTC', role: 'trainer', readOverviews: async (ids) => ({ [ids[0]]: { ...overview(), screening: 'clear', replyWait: null, bookedSessions: null, lastContact: null, stats: null, logs: null, scoreHistory: null, sleep: null, vitals: null, deviceRecovery: null, program: null, checkins: null } }) });
  assert.equal(noRead.needsYou.items.length, 0, 'with those legs clear nothing else raises her');
});

test("the push evaluates the snapshot the website posts, and alerts with Today's lead", () => {
  const web = websiteRow();
  const rec = recordFromLive(ROW, overview(), {}, null);
  const snap = E.engineSnapshot(E.attachCoachContext([rec], CTX)[0]);
  assert.equal(snap.userId, CID, 'the route scope-checks the id it can read');
  assert.equal(core.coachRecordId(snap), CID);
  assert.equal(core.coachRecordId({ profile: { id: CID } }), CID, "the app's records carry the id at profile.id only");
  // The snapshot carries the engine's inputs and none of what the page only shows.
  for (const k of ['intake', 'checkins', 'coachNotes', 'recentLogs', 'sleep', 'coCoaches']) assert.equal(k in snap, false, k + ' rides in the snapshot');
  assert.deepEqual(flagsOf(E.getTriageFeed('trainer', [snap], NOW)[0]), flagsOf(web));
  const { audience, candidates, coachSeen } = core.candidatesFor({ role: 'trainer', clients: [snap] }, { tone: 'supportive', lastSeverity: {}, now: NOW, coachContext: CTX });
  assert.equal(audience, 'coach');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].type, web.severity === 'red' ? 'client_red' : 'client_amber');
  assert.equal(candidates[0].body, web.lead.reason, "the push says what Today leads with");
  assert.deepEqual(coachSeen, { [CID]: web.severity });
});

test("the push and Nora read the coach's dismissals fresh: a reason set aside since the snapshot stays quiet", async () => {
  const rec = recordFromLive(ROW, overview(), {}, null);
  const snap = E.engineSnapshot(rec); // posted before anything was dismissed
  const lead = websiteRow().lead;
  const dismissals = [{ client_id: CID, reason_key: lead.key, reason_sig: lead.sig, until: null }];
  const fresh = core.candidatesFor({ role: 'trainer', clients: [snap] }, { tone: 'supportive', lastSeverity: {}, now: NOW, coachContext: { dismissals, reviews: {} } });
  assert.notEqual(fresh.candidates[0] && fresh.candidates[0].body, lead.reason, 'the dismissed lead is not the alert');
  const db = noraDb();
  const t = await readCoachToday(fakeSupabase({ tables: { ...dbTables(), coach_signal_dismissals: dismissals.map((d) => ({ ...d, coach_id: 'coach-1' })) }, rpcs: dbRpcs() }), 'coach-1', { now: NOW, zone: 'UTC', role: 'trainer', readOverviews: async (ids) => ({ [ids[0]]: overview() }) });
  assert.ok(!t.needsYou.items[0].why.includes(lead.reason), 'Nora does not lead with it either');
  void db;
});

test('a trainer-only client: the nutrition reads are the trainer\'s own, counted and alerted', () => {
  const row = websiteRow();
  for (const k of ['ledger_blown', 'protein_under', 'hunger_high']) {
    const f = row.flags.find((x) => x.key === k);
    assert.ok(f && f.owned === true, k + ' is the trainer\'s when no nutritionist is on the client');
  }
  assert.equal(row.readOnly.length, 0, 'nothing routed to a dietitian who is not there');
});

test('a shared client: the nutrition reads route to the nutritionist who is there, and do not count for the trainer', () => {
  const team = [{ role: 'trainer', providerId: 7, name: 'Coach', userId: 'coach-1', isMe: true }, { role: 'nutritionist', providerId: 3, name: 'Rae', userId: 'coach-2', isMe: false }];
  const row = websiteRow(overview({ careTeam: team }));
  assert.equal(row.flags.some((f) => ['ledger_blown', 'protein_under', 'hunger_high'].includes(f.key)), false);
  assert.deepEqual(row.readOnly.map((f) => f.key + ':' + f.owned + ':' + f.routeTo).sort(), ['hunger_high:false:nutritionist', 'ledger_blown:false:nutritionist', 'protein_under:false:nutritionist']);
});

// ── A coach with both listings (2026-11-05) ─────────────────────────────────
// One auth user owns a trainer row and a nutritionist row. Each page reads its own role's program, and
// a reason set aside on one page stays on the other.
const BLOCK = overview().program; // the trainer's block, ending in 3 days
// Every other leg quiet, so the program is the one thing that could raise the client.
const quietOverview = (over) => ({ ...overview(), screening: 'clear', replyWait: null, bookedSessions: null, lastContact: null, stats: null, logs: null, scoreHistory: null, sleep: null, vitals: null, deviceRecovery: null, checkins: null, ...over });
const dualOverview = () => quietOverview({ program: BLOCK, programs: { trainer: BLOCK } });
const dualTables = () => ({
  ...dbTables(),
  nutritionists: [{ id: 3, owner_id: 'coach-1', name: 'Coach' }],
  subscriptions: [{ client_id: CID, status: 'active', provider_role: 'nutritionist', provider_id: 3, created_at: JOINED }],
});
const keysOf = (row) => (row ? row.flags.map((f) => f.key).sort() : []);

test("a coach with both listings: the nutrition page never reads the trainer's block as an ending plan, on any surface", async () => {
  // The website.
  const rec = recordFromLive(ROW, dualOverview(), {}, null);
  assert.equal(keysOf(E.getTriageFeed('trainer', [rec], NOW)[0]).includes('program_ending'), true);
  assert.equal(keysOf(E.getTriageFeed('nutritionist', [rec], NOW)[0]).includes('program_ending'), false);
  // The push: the snapshot the page posts carries each role's program.
  const snap = E.engineSnapshot(E.attachCoachContext([rec], CTX, 'nutritionist')[0]);
  assert.equal(keysOf(E.getTriageFeed('nutritionist', [snap], NOW)[0]).includes('program_ending'), false);
  assert.equal(core.candidatesFor({ role: 'nutritionist', clients: [snap] }, { tone: 'supportive', lastSeverity: {}, now: NOW, coachContext: CTX }).candidates.length, 0);
  assert.equal(core.candidatesFor({ role: 'trainer', clients: [snap] }, { tone: 'supportive', lastSeverity: {}, now: NOW, coachContext: CTX }).candidates.length, 1);
  // The app.
  appOverview = dualOverview();
  const app = (await window.ShapeSignals.triageLive('nutritionist', { force: true }))[0];
  assert.equal(keysOf(app).includes('program_ending'), false);
  appOverview = overview();
  // Nora: the nutrition client is quiet; with only `program` (an older overview) it reads as before.
  const nora = (ov) => readCoachToday(fakeSupabase({ tables: dualTables(), rpcs: dbRpcs() }), 'coach-1', { now: NOW, zone: 'UTC', role: 'nutritionist', readOverviews: async (ids) => ({ [ids[0]]: ov }) });
  assert.equal((await nora(dualOverview())).needsYou.items.length, 0);
  assert.equal((await nora(quietOverview({ program: BLOCK }))).needsYou.items.length, 1);
});

test('a coach with both listings: a reason set aside on one page stays on the other, on every surface', async () => {
  const wait = new Date(NOW.getTime() - 30 * 3600e3).toISOString();
  const both = (over) => ({ ...overview(), replyWait: { trainer: wait, nutritionist: wait }, ...over });
  const rec = recordFromLive(ROW, both(), {}, null);
  const flag = E.getTriageFeed('nutritionist', [rec], NOW)[0].flags.find((f) => f.key === 'reply_waiting');
  assert.ok(flag && flag.sig);
  const row = (role) => ({ client_id: CID, reason_key: 'reply_waiting', reason_sig: flag.sig, until: null, provider_role: role });
  const has = (r) => keysOf(r).includes('reply_waiting');
  // The push, re-reading the dismissals over the snapshot posted before anything was set aside.
  const snap = E.engineSnapshot(rec);
  const quiet = quietOverview({ replyWait: { trainer: wait, nutritionist: wait }, program: null });
  const quietSnap = E.engineSnapshot(recordFromLive(ROW, quiet, {}, null));
  const pushes = (role, rows) => core.candidatesFor({ role, clients: [quietSnap] }, { tone: 'supportive', lastSeverity: {}, now: NOW, coachContext: { dismissals: rows, reviews: {} } }).candidates.length;
  assert.equal(pushes('trainer', [row('nutritionist')]), 1, "the nutritionist's dismissal leaves the trainer's alert");
  assert.equal(pushes('nutritionist', [row('nutritionist')]), 0);
  assert.equal(has(E.getTriageFeed('trainer', E.attachCoachContext([snap], { dismissals: [row('nutritionist')] }, 'trainer'), NOW)[0]), true);
  // The app: Today reads the role's rows only, and Dismiss and Restore save the role.
  appOverview = both();
  appDismissals = [row('nutritionist')];
  assert.equal(has((await window.ShapeSignals.triageLive('trainer', { force: true }))[0]), true, "the trainer's stays");
  assert.equal(has((await window.ShapeSignals.triageLive('nutritionist', { force: true }))[0]), false);
  appDismissals = []; appOverview = overview();
  appDismissCalls.length = 0;
  assert.equal(await window.ShapeSignals.dismiss(CID, { key: 'reply_waiting', sig: flag.sig }, null, 'nutritionist'), true);
  assert.equal(await window.ShapeSignals.restore(CID, 'reply_waiting', 'trainer'), true);
  assert.deepEqual(appDismissCalls, [['set', CID, { key: 'reply_waiting', sig: flag.sig }, null, 'nutritionist'], ['clear', CID, 'reply_waiting', 'trainer']]);
  assert.equal(await window.ShapeSignals.dismiss(CID, { key: 'reply_waiting', sig: flag.sig }, null), false, 'no role, nothing saved');
  assert.equal(appDismissCalls.length, 2);
  // The case file names its role.
  assert.match(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8'), /window\.ShapeSignals\.dismiss\(clientUid, \{ key: _lead\.key, sig: _lead\.sig \}, until, role\)/);
  // Nora reads the role column (coachContext.mjs selects it: the fake returns only the columns asked for).
  const noraItems = async (rows) => (await readCoachToday(fakeSupabase({ tables: { ...dbTables(), coach_signal_dismissals: rows.map((d) => ({ ...d, coach_id: 'coach-1' })) }, rpcs: dbRpcs() }), 'coach-1', { now: NOW, zone: 'UTC', role: 'trainer', readOverviews: async (ids) => ({ [ids[0]]: quiet }) })).needsYou.items.length;
  assert.equal(await noraItems([row('nutritionist')]), 1, "the nutritionist's dismissal leaves the trainer's");
  assert.equal(await noraItems([row('trainer')]), 0);
});

// The website's and the app's reads and writes of coach_signal_dismissals, run as shipped over a
// recording client. ⚠ Before 2026-11-05-coach-signal-dismissals-by-role.sql runs the column is missing:
// every read and write errors, which answers null and false, as before the table existed.
function recordingDb({ rows = [], error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') return (res, rej) => Promise.resolve(error ? { data: null, error } : { data: rows, error: null }).then(res, rej);
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
}
function asyncFn(src, name) {
  const at = src.indexOf('async function ' + name + '(');
  assert.notEqual(at, -1, name + ' not found');
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced ' + name);
}
test("the website's and the app's dismissal reads and writes carry the role", async () => {
  // The website (dashData.jsx).
  // eslint-disable-next-line no-new-func
  const web = (db) => new Function('window', 'dashDocBridge',
    [fn(DATA, '_dashDismissRole'), asyncFn(DATA, '_dashDismissUid'), asyncFn(DATA, 'dashReadDismissals'), asyncFn(DATA, 'dashWriteDismissal'), asyncFn(DATA, 'dashClearDismissal')].join('\n')
    + '; return { dashReadDismissals, dashWriteDismissal, dashClearDismissal };')({ shapeDb: { client: db, getUser: async () => ({ id: 'coach-1' }) } }, async () => {});
  let db = recordingDb({ rows: [{ client_id: CID, reason_key: 'reply_waiting', reason_sig: 's', until: null, provider_role: 'trainer' }] });
  let w = web(db);
  assert.equal((await w.dashReadDismissals()).length, 1);
  assert.deepEqual(db.calls[0].ops[0], ['select', 'client_id, reason_key, reason_sig, until, provider_role']);
  assert.equal(await w.dashWriteDismissal(CID, { key: 'reply_waiting', sig: 's' }, null, 'nutritionist'), true);
  assert.deepEqual(db.calls[1].ops[0], ['upsert', { coach_id: 'coach-1', provider_role: 'nutritionist', client_id: CID, reason_key: 'reply_waiting', reason_sig: 's', until: null }, { onConflict: 'coach_id,provider_role,client_id,reason_key' }]);
  assert.equal(await w.dashWriteDismissal(CID, { key: 'reply_waiting', sig: 's' }, null, 'dietitian'), true);
  assert.equal(db.calls[2].ops[0][1].provider_role, 'nutritionist', "a dietitian's is the nutritionist's");
  assert.equal(await w.dashClearDismissal(CID, 'reply_waiting', 'trainer'), true);
  assert.deepEqual(db.calls[3].ops, [['delete'], ['eq', 'coach_id', 'coach-1'], ['eq', 'provider_role', 'trainer'], ['eq', 'client_id', CID], ['eq', 'reason_key', 'reply_waiting']]);
  const before = db.calls.length;
  assert.equal(await w.dashWriteDismissal(CID, { key: 'reply_waiting', sig: 's' }, null, 'client'), false, 'no coach role, nothing saved');
  assert.equal(await w.dashClearDismissal(CID, 'reply_waiting'), false);
  assert.equal(db.calls.length, before);
  // Before the migration: the column is missing.
  w = web(recordingDb({ error: { code: '42703', message: 'column coach_signal_dismissals.provider_role does not exist' } }));
  assert.equal(await w.dashReadDismissals(), null, 'nothing hidden');
  assert.equal(await w.dashWriteDismissal(CID, { key: 'reply_waiting', sig: 's' }, null, 'trainer'), false, 'the control says it could not save');
  // The page passes its role to the engine and to every write.
  assert.match(DATA, /DashSignals\.attachCoachContext\(state\.clients, coachCtx, role\)/);
  assert.match(DATA, /await dashWriteDismissal\(clientId, flag, until, role\);/);
  assert.match(DATA, /await dashClearDismissal\(clientId, key, role\);/);

  // The app (shapeBackend.js's ShapeSignalDismissals).
  const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const block = BACKEND.slice(BACKEND.indexOf('const signalDismissRole'), BACKEND.indexOf('window.ShapeSignalDismissals ='));
  // eslint-disable-next-line no-new-func
  const app = (sb) => new Function('supabase', 'state', block + '; return { listSignalDismissals, setSignalDismissal, clearSignalDismissal };')(sb, { user: { id: 'coach-1' } });
  db = recordingDb({ rows: [] });
  const a = app(db);
  assert.deepEqual(await a.listSignalDismissals(), []);
  assert.deepEqual(db.calls[0].ops[0], ['select', 'client_id, reason_key, reason_sig, until, provider_role']);
  assert.equal(await a.setSignalDismissal(CID, { key: 'reply_waiting', sig: 's' }, null, 'trainer'), true);
  assert.deepEqual(db.calls[1].ops[0], ['upsert', { coach_id: 'coach-1', provider_role: 'trainer', client_id: CID, reason_key: 'reply_waiting', reason_sig: 's', until: null }, { onConflict: 'coach_id,provider_role,client_id,reason_key' }]);
  assert.equal(await a.clearSignalDismissal(CID, 'reply_waiting', 'nutritionist'), true);
  assert.deepEqual(db.calls[2].ops, [['delete'], ['eq', 'coach_id', 'coach-1'], ['eq', 'provider_role', 'nutritionist'], ['eq', 'client_id', CID], ['eq', 'reason_key', 'reply_waiting']]);
  assert.equal(await a.setSignalDismissal(CID, { key: 'reply_waiting', sig: 's' }, null), false, 'no role, nothing saved');
  assert.equal(await app(recordingDb({ error: { code: '42703', message: 'missing column' } })).listSignalDismissals(), null);
});
