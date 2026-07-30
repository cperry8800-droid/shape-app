// Both writers of a client's schedule must take the SAME advisory lock.
//
// WHY THIS FILE EXISTS: an advisory lock only excludes a transaction that asks
// for the IDENTICAL key pair. `publish_client_week` and
// `regenerate_client_workouts` are the only two functions that write a client's
// coach-authored `client_workouts`, and for one head they held different keys —
// the publish on (client, week), the regeneration on nothing at all. They
// therefore never conflicted, and two silent corruptions followed: two Adjust
// applies could both validate the same delete set and commit both replacement
// programs, and an apply could land inside the window between a publish's
// precondition check and its replace.
//
// That failure has no runtime symptom. The precondition still compares, the
// rowcount still counts, and both still PASS for both racers, because each can
// only see what its own snapshot shows. Nothing raises; a coach's program simply
// doubles or disappears. So the invariant is asserted statically here, where it
// fails a push, rather than only in the migration's own guard, which fails at
// apply time — long after the code that broke it was written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The migration that RECREATES both functions. Any later migration that
// recreates either one must be added here, or this guard silently stops
// describing the deployed database.
const MIGRATION = 'supabase-migrations/2026-08-01-client-schedule-serialize.sql';

const sql = readFileSync(join(ROOT, MIGRATION), 'utf8');

/** The plpgsql body of `create or replace function public.<name>`. */
function bodyOf(name) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} is not defined in ${MIGRATION}`);
  const open = sql.indexOf('\nas $$\n', start);
  assert.ok(open > start, `${name} has no dollar-quoted body`);
  const end = sql.indexOf('\n$$;', open);
  assert.ok(end > open, `${name}'s body is unterminated`);
  return sql.slice(open, end);
}

const WRITERS = ['publish_client_week', 'regenerate_client_workouts'];

/** The lock call, whitespace-collapsed so formatting can't read as a difference. */
function lockCall(body) {
  const m = body.match(/perform\s+pg_advisory_xact_lock\s*\(([\s\S]*?)\)\s*;/);
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

test('both schedule writers take an advisory lock', () => {
  for (const name of WRITERS) {
    assert.ok(
      lockCall(bodyOf(name)) !== null,
      `${name} does not take pg_advisory_xact_lock — it is not serialized against the other writer`,
    );
  }
});

test('the two writers lock on the IDENTICAL key', () => {
  const [pub, reg] = WRITERS.map((n) => lockCall(bodyOf(n)));
  // The whole point. Two different keys is the same as no lock at all: each
  // transaction takes a lock nobody else contends for and proceeds straight into
  // the race the lock was added to close.
  assert.equal(
    reg,
    pub,
    'publish_client_week and regenerate_client_workouts lock on different keys — they do not exclude each other',
  );
  // Keyed on the client, not the client-week: a regeneration spans many weeks
  // plus undated weekly-repeat rows, so there is no single week it could name.
  assert.match(pub, /hashtext\('shape_client_schedule'\)/);
  assert.match(pub, /hashtext\(p_client_id::text\)/);
  assert.doesNotMatch(pub, /p_week_start/, 'the key narrowed back to a week — the regeneration cannot take that key');
});

test('the lock is taken before anything it protects', () => {
  // A lock acquired after the read it is meant to make trustworthy protects
  // nothing: the comparison has already run against the pre-lock snapshot.
  const pub = bodyOf('publish_client_week');
  const lockAt = pub.indexOf('pg_advisory_xact_lock');
  for (const [label, needle] of [
    ['the replay read', 'from public.coach_week_publishes'],
    ['the precondition comparison', 'v_current_ids is distinct from v_expected_ids'],
    ['the week replacement', 'delete from public.client_workouts'],
  ]) {
    const at = pub.indexOf(needle);
    assert.ok(at > 0, `publish_client_week no longer contains ${label}`);
    assert.ok(lockAt < at, `publish_client_week locks AFTER ${label}`);
  }

  const reg = bodyOf('regenerate_client_workouts');
  const regLockAt = reg.indexOf('pg_advisory_xact_lock');
  for (const [label, needle] of [
    ['the delete-set validation', 'from public.client_workouts w'],
    ['the inserts', 'insert into public.client_workouts'],
    ['the delete', 'delete from public.client_workouts w'],
  ]) {
    const at = reg.indexOf(needle);
    assert.ok(at > 0, `regenerate_client_workouts no longer contains ${label}`);
    assert.ok(regLockAt < at, `regenerate_client_workouts locks AFTER ${label}`);
  }
});

test('the regeneration enforces its delete rowcount', () => {
  const reg = bodyOf('regenerate_client_workouts');
  // The second line of defence, and the one that fails LOUDLY if the
  // serialization is ever bypassed: a delete that moves fewer rows than the
  // scope check counted means the plan moved, so the whole transaction — its
  // inserts included — must roll back rather than stack a second program on top
  // of rows it believed it had retired.
  assert.match(reg, /if v_deleted <> v_expected then/);
  const guardAt = reg.indexOf('v_deleted <> v_expected');
  const raiseAt = reg.indexOf("errcode = '40001'", guardAt);
  assert.ok(raiseAt > guardAt, 'the rowcount mismatch does not raise 40001 (serialization_failure)');
  // It must sit AFTER the delete's own row_count, or it reads a stale counter.
  assert.ok(reg.indexOf('get diagnostics v_deleted = row_count') < guardAt);
});

test('neither writer is reachable by anon or authenticated', () => {
  // SECURITY DEFINER bypasses RLS, and both functions take caller-supplied rows.
  // The grant IS the gate (the #1459 lesson), so it is re-asserted in the
  // migration and pinned here.
  for (const role of ['anon', 'authenticated']) {
    for (const fn of ['publish_client_week', 'regenerate_client_workouts']) {
      assert.match(
        sql,
        new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from ${role};`),
        `${MIGRATION} does not revoke EXECUTE on ${fn} from ${role}`,
      );
    }
  }
  for (const fn of ['publish_client_week', 'regenerate_client_workouts']) {
    assert.match(sql, new RegExp(`grant  execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
  }
});
