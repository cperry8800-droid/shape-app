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
    stats: { sessionsCompleted: 6, sessionsPlanned: 10, daysLogged7d: 2, avgCalories: 2600, avgProtein: 90 },
    logs: { lastLoggedOn: ago(4), daysLogged7d: 2, recent: [] },
    nutritionTargets: { calories: 2100, protein: 150 },
    scoreHistory: { weeks: [{ weekOf: mondaysAgo(2), points: 70, partial: false }, { weekOf: mondaysAgo(1), points: 61, partial: false }, { weekOf: MONDAY, points: 12, partial: true }], streak: { current: 0, best: 10, lastActiveOn: ago(3) } },
    lastContact: { trainer: new Date(NOW.getTime() - 8 * DAY).toISOString(), nutritionist: null },
    sleep: { avg7: 5.5, latest: 5.5, series7: [1, 2, 3, 4].map((d, i) => ({ date: ago(d), value: [5.4, 5.6, 5.5, 5.5][i] })) },
    vitals: { energy: { avg7: 3.2, n: 4 }, hunger: { avg7: 8.5, n: 4 } },
    deviceRecovery: { avg7: 28, n: 4 },
    screening: 'flagged',
    checkins: [{ week_of: MONDAY, ratings: { sleep: 1, stress: 5, trainingAdherence: 4 }, question: 'Can we swap Friday?', created_at: NOW.toISOString() }],
    replyWait: { trainer: new Date(NOW.getTime() - 30 * 3600e3).toISOString(), nutritionist: null },
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
globalThis.window = {
  ShapeAuth: { getCachedState: () => ({ user: { id: 'coach-1' } }) },
  ShapeAssign: { clients: async () => [{ userId: CID, name: 'Ana Lee', isNew: false, joinedAt: JOINED, paymentRetrying: true }] },
  ShapeCareTeam: { overviews: async () => ({ [CID]: appOverview }) },
  shapeDb: { getUserGoals: async (kind) => (kind === 'coach_week_reviews' ? {} : kind === 'coach_settings' ? appSettings : null) },
  ShapeSignalDismissals: { list: async () => [] },
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
  const keys = websiteRow().flags.map((f) => f.key).sort();
  assert.deepEqual(keys, ['checkin_waiting', 'contact_gap', 'energy_low', 'food_gap', 'hunger_high', 'ledger_blown', 'missed_sessions',
    'payment_retrying', 'program_ending', 'protein_under', 'recovery_low', 'reply_waiting', 'score_drop', 'screening_flagged', 'sleep_low', 'streak_broken'].sort());
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
  appSettings = { thresholds: { FOOD_GAP_DAYS: 10, MISSED_SESSIONS: 9 } };
  const tuned = E.resolveThresholds(appSettings.thresholds).thresholds;
  const app = await appRow();
  const web = websiteRow(overview(), tuned);
  assert.equal(app.flags.some((f) => f.key === 'food_gap'), false, 'the tuned gap is longer than 4 days');
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
  const noRead = await readCoachToday(noraDb(), 'coach-1', { now: NOW, zone: 'UTC', role: 'trainer', readOverviews: async (ids) => ({ [ids[0]]: { ...overview(), screening: 'clear', replyWait: null, lastContact: null, stats: null, logs: null, scoreHistory: null, sleep: null, vitals: null, deviceRecovery: null, program: null, checkins: null } }) });
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
