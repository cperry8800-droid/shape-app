// The end-of-workout ratings, at the data level: where they are stored and that a coach can read them.
// The finish pop-up (BSSessionFinish.jsx) asks difficulty (1-10, the session RPE) and enjoyment (1-5);
// the owner, 2026-11-04: "show both ratings to coaches". The coach's view of them is drawn by the review
// page's redesign; this file pins the data underneath it:
//   · STORED: difficulty in workout_sessions.session_rpe (numeric(3,1)); enjoyment in
//     workout_sessions.summary->'enjoyment' (jsonb, a whole 1-5). Both null when skipped.
//   · WRITTEN: the app's writer (saveWorkoutSessionLog → save_workout_session) carries both through the
//     atomic RPC, which inserts the column and the summary as sent.
//   · READ: the coach's existing read of a client's sessions (ShapeWorkoutLogs.listSessions, the one
//     BSWorkoutReviewPage uses) selects every workout_sessions column, under the participant policy that
//     admits the trainer who owns the session's assignment. So it already returns both; nothing widened.
// The writer and the reader are the shipping functions, run against a stub client (the technique of
// tests/workout-session-reliability.test.mjs); the SQL is read from the migrations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { bsDurationFacts } from '../public/newdesign/progressionGuardrail.mjs';
import { BS_PRIVACY_RANK } from '../mobile-app/src/services/workoutShare.mjs';

const backend = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
const sql = (f) => readFileSync(new URL(`../supabase-migrations/${f}`, import.meta.url), 'utf8');

// The shipping writer and reader, with a stub Supabase client that records what they send.
function backendWith(rows = []) {
  const calls = [];
  const api = {
    rpc: async (name, payload) => { calls.push({ name, payload }); return { data: { session: payload?.p_session || {}, set_logs: [], sensor_samples: [] } }; },
    from(table) {
      const q = { table, ops: [] };
      calls.push({ name: 'from', q });
      const chain = {
        select(cols) { q.ops.push(['select', cols]); return chain; },
        neq(...a) { q.ops.push(['neq', ...a]); return chain; },
        order(...a) { q.ops.push(['order', ...a]); return chain; },
        limit(n) { q.ops.push(['limit', n]); return Promise.resolve({ data: rows, error: null }); },
      };
      return chain;
    },
  };
  const context = { Date, Number, String, Math, JSON, crypto: webcrypto, state: { user: { id: 'client-a' } }, supabase: api,
    bsDurationFacts, BS_PRIVACY_RANK, normalizeRole: (x) => x, _localDate: (d) => d.toISOString().slice(0, 10),
    saveLocalRecord: (_key, data) => data, readLocalRecords: () => [], createCommunityPost: async () => ({ stored: 'supabase' }),
    invalidateClientMetrics() {}, announcePRsFromSetLogs() {}, bsIsDuplicateWorkoutPost: () => false,
    window: { ShapeAnalytics: { track() {} } } };
  vm.createContext(context);
  const normalize = backend.slice(backend.indexOf('function _setLogNum('), backend.indexOf('async function listWorkoutSessions('));
  const save = backend.slice(backend.indexOf('async function saveWorkoutSessionLog('), backend.indexOf('// A post id is only ever forwarded'));
  const list = backend.slice(backend.indexOf('async function listWorkoutSessions('), backend.indexOf('async function listWorkoutSensorSamples('));
  vm.runInContext(`${normalize}\n${save}\n${list}\nthis.save = saveWorkoutSessionLog; this.list = listWorkoutSessions;`, context);
  return { save: context.save, list: context.list, calls };
}
// What BSSession hands the writer at Save (its frozen pending submission), trimmed to what matters here.
const submission = (sessionRpe, enjoyment) => ({
  sessionId: '21f8bf71-2faa-4934-b027-72bc192a9421', clientWorkoutId: '9b0e7c2a-4f7d-4c55-9d1e-1f2a3b4c5d6e', title: 'Lower — Build',
  durationSeconds: 2700, sessionRpe, durationAnswer: 'not_prompted', setLogs: [], privacy: 'private',
  summary: { prescription: { title: 'Lower — Build' }, enjoyment, startedAt: '2026-11-04T17:00:00Z', endedAt: '2026-11-04T17:45:00Z' },
});

test('saving: difficulty goes to session_rpe, enjoyment to summary.enjoyment, through the atomic RPC', async () => {
  const w = backendWith();
  await w.save(submission(7, 4));
  const call = w.calls.find((c) => c.name === 'save_workout_session');
  assert.ok(call, 'the atomic save');
  assert.equal(call.payload.p_session.session_rpe, 7);
  assert.equal(call.payload.p_session.summary.enjoyment, 4);
  assert.equal('reviewFeel' in call.payload.p_session.summary, false);
  // The summary sample the RPC also stores carries the same summary.
  assert.equal(call.payload.p_samples.find((s) => s.sample_type === 'summary').payload.enjoyment, 4);
});

test('saving: skipped ratings are stored as null, never 0', async () => {
  const w = backendWith();
  await w.save(submission(null, null));
  const call = w.calls.find((c) => c.name === 'save_workout_session');
  assert.strictEqual(call.payload.p_session.session_rpe, null);
  assert.strictEqual(call.payload.p_session.summary.enjoyment, null);
});

test('the RPC inserts the column and the summary as sent', () => {
  // The function body is 2026-09-18's; 2026-10-10 only pins its search_path.
  const body = sql('2026-09-18-workout-session-atomic-save.sql');
  assert.match(body, /status, privacy, source, started_at, ended_at, duration_seconds, session_rpe, summary\)/);
  assert.match(body, /\(p_session->>'session_rpe'\)::numeric,\s*coalesce\(p_session->'summary', '\{\}'::jsonb\)\)/);
  // The session is the trainer's when it was logged against their assignment.
  assert.match(body, /select trainer_id into v_trainer from public\.client_workouts where id = v_workout and client_id = v_uid for update;/);
  assert.match(body, /\(v_id, v_uid, v_workout, v_trainer, case when v_trainer is not null then 'trainer' else null end,/);
  assert.doesNotMatch(sql('2026-10-10-security-review-lows-and-anon-definers.sql'), /create or replace function public\.save_workout_session/);
  // The column holds the RPE scale.
  assert.match(sql('2026-07-27-session-rpe.sql'), /add column if not exists session_rpe numeric\(3,1\)\s*check \(session_rpe is null or session_rpe between 0 and 10\);/);
});

test('reading: the coach\'s existing session read selects every column, so both ratings come back untouched', async () => {
  const row = { id: 's1', client_id: 'client-a', provider_id: 12, provider_role: 'trainer', session_rpe: 7, summary: { completedSets: 9, enjoyment: 4 } };
  const w = backendWith([row]);
  const result = await w.list();
  const q = w.calls.find((c) => c.name === 'from').q;
  assert.equal(q.table, 'workout_sessions');
  assert.equal(q.ops[0][0], 'select');
  assert.match(q.ops[0][1], /^\*, /, 'every column of the session row');
  assert.equal(result.data[0].session_rpe, 7);
  assert.equal(result.data[0].summary.enjoyment, 4);
});

test('reading: the participant policy admits the trainer who owns the session\'s assignment', () => {
  const base = sql('2026-05-02-workout-session-logs.sql');
  assert.match(base, /create policy "participants read workout sessions"\s+on public\.workout_sessions for select\s+to authenticated\s+using \(public\.can_access_workout_session\(id\)\);/);
  const fn = base.slice(base.indexOf('create or replace function public.can_access_workout_session('), base.indexOf('drop policy if exists "clients insert own workout sessions"'));
  assert.match(fn, /ws\.client_id = auth\.uid\(\)/);
  assert.match(fn, /ws\.provider_role = 'trainer'\s+and exists \(\s+select 1 from public\.trainers t\s+where t\.id = ws\.provider_id and t\.owner_id = auth\.uid\(\)/);
  // No later migration redefines the function or the policy.
  for (const f of ['2026-05-08-coach-program-tools.sql', '2026-06-17-review-note-delete.sql', '2026-08-31-nutrition-day-review-notes.sql', '2026-10-29-shared-client-schedules.sql']) {
    assert.doesNotMatch(sql(f), /create or replace function public\.can_access_workout_session|create policy "participants read workout sessions"/, f);
  }
});
