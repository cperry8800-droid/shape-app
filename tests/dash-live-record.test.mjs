// The live-record mapper (review 2026-09-09, R4) — driven, not grepped.
//
// `_dashRecordFromLive` is what turns a roster row + its shared-overview into
// the record every roster column, the drilldown drawer and the twelve engine
// rules read. Until R4 it hardcoded six fields to null, so a real roster showed
// a sliver of what the demo did. These tests brace-match the SHIPPED function
// out of dashData.jsx and evaluate it, so an equivalent rewrite passes and a
// real regression fails — a spelling pin could not tell those apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DashSignals = require('../public/newdesign/dashSignals.js');
const SRC = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');

function fn(name) {
  let at = SRC.indexOf('function ' + name + '(');
  assert.notEqual(at, -1, name + ' not found in dashData.jsx');
  // Keep a leading `async` — slicing from `function` alone makes every `await`
  // in the body a syntax error, which reads as a broken test rather than a
  // mis-cut source span.
  if (SRC.slice(at - 6, at) === 'async ') at -= 6;
  let i = SRC.indexOf('{', at), depth = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) return SRC.slice(at, j + 1);
  }
  throw new Error('unbalanced braces around ' + name);
}
// eslint-disable-next-line no-new-func
const recordFromLive = new Function('DashSignals', fn('_dashRecordFromLive') + '; return _dashRecordFromLive;')(DashSignals);
// eslint-disable-next-line no-new-func
const makeCoachNotes = (win) => new Function('window', fn('_dashCoachNotes') + '; return _dashCoachNotes;')(win);

const ROW = { id: 'c-1', name: 'Ada L', mrrCents: 12000, lastAt: '2026-09-01T10:00:00Z' };
// A response carrying every R4 leg.
const FULL = {
  stats: { sessionsPlanned: 20, sessionsCompleted: 18, daysLogged7d: 5, avgCalories: 2400, avgProtein: 140 },
  lastContact: { trainer: '2026-09-07T09:00:00Z', nutritionist: null },
  program: { name: 'Strength Block 3', week: 3, weeks: 12, status: 'active' },
  logs: { lastLoggedOn: '2026-09-08', daysLogged7d: 4, recent: [{ on: '2026-09-08', kcal: 2350, protein: 145 }] },
  nutritionTargets: { calories: 2200, protein: 160 },
  scoreHistory: { weeks: [{ weekOf: '2026-08-31', points: 61, partial: false }, { weekOf: '2026-09-07', points: 74, partial: false }], streak: { current: 4, best: 11, lastActiveOn: '2026-09-08' } },
};

test('every R4 leg reaches the record', () => {
  const r = recordFromLive(ROW, FULL, null);
  assert.deepEqual(r.lastContact, FULL.lastContact);
  assert.deepEqual(r.program, FULL.program);
  assert.deepEqual(r.shapeScoreHistory, [{ weekOf: '2026-08-31', points: 61, partial: false }, { weekOf: '2026-09-07', points: 74, partial: false }]);
  assert.deepEqual(r.streaks, { current: 4, best: 11, lastActiveOn: '2026-09-08' });
  assert.deepEqual(r.recentLogs, FULL.logs.recent);
  assert.equal(r.foodLogs.lastLoggedOn, '2026-09-08');
  assert.equal(r.nutrition.targetCalories, 2200);
  assert.equal(r.nutrition.targetProtein, 160);
});

test('the rollup keeps the 7-day count; the snapshot leg only fills the gap', () => {
  // Two counts that disagree is worse than one that is a day coarse — the
  // get_client_stats figure is the one every other surface already quotes.
  assert.equal(recordFromLive(ROW, FULL, null).foodLogs.daysLogged7d, 5);
  const noRollup = { ...FULL, stats: { ...FULL.stats, daysLogged7d: null } };
  assert.equal(recordFromLive(ROW, noRollup, null).foodLogs.daysLogged7d, 4);
});

test('"no logs" and "logs are not shared" stay different empties', () => {
  // The drawer renders a different sentence for each, so they must not collapse.
  assert.deepEqual(recordFromLive(ROW, { ...FULL, logs: null }, null).recentLogs, [],
    'a response carrying the key with nothing in it is an EMPTY window');
  const older = { ...FULL };
  delete older.logs;
  assert.equal(recordFromLive(ROW, older, null).recentLogs, null,
    'a response from before R4 has no key and must stay "not shared"');
});

test('a missing leg is null, never a zero or a stand-in', () => {
  const r = recordFromLive(ROW, { stats: FULL.stats }, null);
  assert.equal(r.shapeScoreHistory, null, 'pre-migration the score RPC 404s and the column reads "Not shared"');
  assert.equal(r.streaks, null);
  assert.equal(r.lastContact, null);
  assert.equal(r.program, null);
  assert.equal(r.nutrition.targetCalories, null);
  assert.equal(r.nutrition.targetProtein, null);
  assert.equal(r.foodLogs.lastLoggedOn, null);
  // A roster row with no overview at all still yields a paintable record.
  const bare = recordFromLive(ROW, null, null);
  assert.equal(bare.profile.name, 'Ada L');
  assert.equal(bare.shapeScoreHistory, null);
  assert.equal(bare.recentLogs, null);
});

test('a score payload with no weeks is null, not an empty sparkline', () => {
  const empty = { ...FULL, scoreHistory: { weeks: [], streak: { current: 0, best: 0, lastActiveOn: null } } };
  const r = recordFromLive(ROW, empty, null);
  assert.equal(r.shapeScoreHistory, null);
  // A zero streak is a REAL reading (the roster flags current 0 against best ≥ 3),
  // so unlike the weeks it must survive.
  assert.deepEqual(r.streaks, { current: 0, best: 0, lastActiveOn: null });
  const junk = { ...FULL, scoreHistory: { weeks: [{ weekOf: null, points: 9 }, { weekOf: '2026-09-07', points: 'lots' }], streak: null } };
  assert.equal(recordFromLive(ROW, junk, null).shapeScoreHistory, null);
  assert.equal(recordFromLive(ROW, junk, null).streaks, null);
});

test('coach notes carry three states: a note, a read-but-empty doc, an unreadable one', () => {
  const notes = { 'c-1': { text: 'Deload next week — knee.', updatedAt: '2026-09-05T14:22:00Z' }, 'c-2': { text: 'other client' } };
  assert.deepEqual(recordFromLive(ROW, FULL, notes).coachNotes, [{ on: '2026-09-05', text: 'Deload next week — knee.' }]);
  // Read the doc, nothing for THIS client → [] ("no notes yet"), which is a
  // different sentence from a doc that could not be read at all → null.
  assert.deepEqual(recordFromLive({ ...ROW, id: 'c-9' }, FULL, notes).coachNotes, []);
  assert.deepEqual(recordFromLive(ROW, FULL, {}).coachNotes, []);
  assert.deepEqual(recordFromLive(ROW, FULL, { 'c-1': { text: '   ' } }).coachNotes, [], 'whitespace is not a note');
  assert.equal(recordFromLive(ROW, FULL, null).coachNotes, null, 'an unreadable doc must not assert the coach wrote nothing');
});

test('the in-progress week rides through flagged, and no longer reads as a collapse', () => {
  // The definer marks the current bucket `partial`; dropping the flag here is
  // what would put every actively-logging client amber on a Monday.
  const midweek = { ...FULL, scoreHistory: { ...FULL.scoreHistory, weeks: [
    { weekOf: '2026-08-24', points: 70, partial: false },
    { weekOf: '2026-08-31', points: 72, partial: false },
    { weekOf: '2026-09-07', points: 20, partial: true },
  ] } };
  const rec = recordFromLive(ROW, midweek, null);
  assert.equal(rec.shapeScoreHistory[2].partial, true, 'the flag must survive the mapping');
  const r = DashSignals.scoreWeekReading(rec.shapeScoreHistory);
  assert.equal(r.points, 20, 'the live number is still shown');
  assert.equal(r.delta, 2, 'the delta compares the two COMPLETE weeks, not 20 against 72');
  const keys = DashSignals.evaluateClient(rec, new Date('2026-09-09T12:00:00'), 'trainer').flags.map((f) => f.key);
  assert.ok(!keys.includes('score_drop'), 'a healthy client must not flag mid-week, got: ' + keys.join(', '));
});

test('the filled record lets the rules that were skipped actually fire', () => {
  // The point of R4: on a live roster the engine could only see adherence and
  // check-ins. Drive the real engine over a filled record and assert the
  // score/contact/streak rules now reach a verdict.
  const now = new Date('2026-09-09T12:00:00');
  const dropping = {
    ...FULL,
    scoreHistory: { weeks: [{ weekOf: '2026-08-24', points: 74, partial: false }, { weekOf: '2026-08-31', points: 40, partial: false }], streak: { current: 0, best: 11, lastActiveOn: '2026-08-20' } },
    lastContact: { trainer: '2026-08-20T09:00:00Z', nutritionist: null },
  };
  const rec = recordFromLive(ROW, dropping, null);
  const keys = DashSignals.evaluateClient(rec, now, 'trainer').flags.map((f) => f.key);
  for (const k of ['score_drop', 'contact_gap', 'streak_broken']) {
    assert.ok(keys.includes(k), 'expected ' + k + ' to fire on a filled record, got: ' + keys.join(', '));
  }
});

// ── _dashCoachNotes — the read behind coachNotes ─────────────────────────────
// Driven against a stubbed shapeDb because the difference that matters here is
// invisible to the mapper: {} means "read it, nothing in it" and null means
// "could not read", and getUserGoals returns null for BOTH "not signed in" and
// "the read failed".
test('coach-notes read: every can\'t-know resolves null, never an empty doc', async () => {
  const doc = { 'c-1': { text: 'note' } };
  const db = (over) => ({ getSession: async () => ({}), getUserGoals: async () => doc, ...over });
  assert.deepEqual(await makeCoachNotes({ shapeDb: db() })(), doc);
  assert.deepEqual(await makeCoachNotes({ shapeDb: db({ getUserGoals: async () => ({}) }) })(), {},
    'a doc that exists and holds nothing is {} — the coach genuinely wrote none');
  // getUserGoals resolves null for anon AND for a failed read; both are
  // can't-know, and reporting either as {} asserts the coach wrote nothing.
  assert.equal(await makeCoachNotes({ shapeDb: db({ getUserGoals: async () => null }) })(), null);
  assert.equal(await makeCoachNotes({ shapeDb: db({ getUserGoals: async () => { throw new Error('network'); } }) })(), null);
  assert.equal(await makeCoachNotes({})(), null, 'no shapeDb on the page is not an empty doc');
  assert.equal(await makeCoachNotes({ shapeDb: {} })(), null);
});

test('coach-notes read: getSession runs BEFORE getUserGoals, and its failure is survivable', async () => {
  // ⚠ getUserGoals resolves the user through client.auth.getUser(), which does
  // NOT bootstrap the Next.js cookie-session bridge — without getSession first
  // a signed-in coach reads as ANON and every note silently reads empty. This
  // is the defect that made four writes never save on the P0 set.
  const calls = [];
  await makeCoachNotes({ shapeDb: {
    getSession: async () => { calls.push('getSession'); return {}; },
    getUserGoals: async () => { calls.push('getUserGoals'); return {}; },
  } })();
  assert.deepEqual(calls, ['getSession', 'getUserGoals']);
  // A thrown getSession falls through as anon rather than losing the read.
  assert.deepEqual(await makeCoachNotes({ shapeDb: {
    getSession: async () => { throw new Error('no session'); },
    getUserGoals: async () => ({ ok: 1 }),
  } })(), { ok: 1 });
});
