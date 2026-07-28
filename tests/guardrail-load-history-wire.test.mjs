// The wire contract between the load-history RPC and the guardrail core.
//
// WHY THIS FILE EXISTS: the first cut of the migration built its rows with
// `row_to_json`, and it would have silently switched the guardrail OFF for
// every client with any history.
//
//   JSON cannot express `undefined`. `row_to_json` emits every selected column,
//   so a session whose `summary` carries no duration keys arrived as
//   `"durationPrompted": null, "durationAnswer": null` — keys PRESENT. The
//   core's absence test is `=== undefined`, so null is not absent: the row is
//   reported MALFORMED. Every session written before Deploy 1 is exactly that
//   shape, and that IS the trailing baseline. One malformed row turns the whole
//   evaluation `unknown` (§13.8), and `unknown` never blocks publish (§7.5).
//
// Nothing in the suite caught it, because the SQL and the JS live in different
// languages and neither one is wrong on its own. This test is the seam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bsClassifySession } from '../public/newdesign/progressionGuardrail.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = readFileSync(join(ROOT, 'public', 'newdesign', 'progressionGuardrail.mjs'), 'utf8');

// ⚠ RESOLVED BY FUNCTION NAME, NOT BY FILENAME. The RPC is `create or replace`,
// so pinning one file would let a LATER migration redefine
// `get_client_load_history` with `row_to_json` while every assertion below
// still passed — the guard would be pinned to a file rather than to the
// deployed shape. Migrations are date-prefixed, so the last definition in
// filename order is the one production ends up running.
const MIGRATIONS = join(ROOT, 'supabase-migrations');
const DEFINES = /create\s+or\s+replace\s+function\s+public\.get_client_load_history/i;
// Structural assertions run against the EXECUTABLE sql only. The file's own
// comments name `row_to_json` in order to warn against it, and a guard that
// can't tell prose from code would fire on its own explanation.
const stripComments = (s) => s.replace(/--[^\n]*/g, '');

const DEFINING_FILES = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => DEFINES.test(stripComments(readFileSync(join(MIGRATIONS, f), 'utf8'))));

const SQL = DEFINING_FILES.length
  ? readFileSync(join(MIGRATIONS, DEFINING_FILES[DEFINING_FILES.length - 1]), 'utf8')
  : '';
const SQL_CODE = stripComments(SQL);

test('migration: a definition of get_client_load_history exists to check', () => {
  // Without this, a rename would make every assertion below vacuously pass
  // against an empty string.
  assert.ok(DEFINING_FILES.length > 0, 'no migration defines public.get_client_load_history');
});

const row = (over = {}) => ({
  startedAtISO: '2026-07-25T18:58:36Z', timezone: 'America/New_York',
  durationSec: 3600, sessionRpe: 7, ...over,
});

// ─── The behaviour the SQL shape has to respect ─────────────────────────────

test('core: an ABSENT duration pair is not_prompted; a NULL pair is MALFORMED', () => {
  // This asymmetry is the whole reason the migration omits rather than nulls.
  // If it ever disappears, the SQL gymnastics become unnecessary — but until
  // then, emitting null where the writer wrote nothing disables the guardrail.
  const absent = bsClassifySession(row());
  assert.equal(absent.malformed, false, 'absent reads as not_prompted (§13.8)');
  assert.equal(absent.eligible, true);

  const nulled = bsClassifySession(row({ durationPrompted: null, durationAnswer: null }));
  assert.equal(nulled.malformed, true, 'null is NOT absent — this is the trap');
});

test('core: a HALF-FILLED pair stays malformed BY NAME', () => {
  // The migration passes both keys through when EITHER exists, precisely so
  // this ruling survives: a row that contradicts itself is a caller bug.
  const half = bsClassifySession(row({ durationPrompted: true, durationAnswer: null }));
  assert.equal(half.malformed, true);
  assert.ok((half.issues || []).some((i) => i.field === 'durationAnswer'));
});

test('core: a null sessionRpe or timezone behaves the same as an absent one', () => {
  // Relied on by the migration, which nulls these rather than omitting them.
  const noRpe = row(); delete noRpe.sessionRpe;
  assert.deepEqual(
    [bsClassifySession(row({ sessionRpe: null })).malformed, bsClassifySession(row({ sessionRpe: null })).rated],
    [bsClassifySession(noRpe).malformed, bsClassifySession(noRpe).rated],
  );
  const noTz = row(); delete noTz.timezone;
  assert.equal(bsClassifySession(row({ timezone: null })).malformed, bsClassifySession(noTz).malformed);
});

// ─── The SQL has to keep emitting that shape ────────────────────────────────

test('migration: does NOT use row_to_json for the session rows', () => {
  // The exact construct that produced the bug. Reintroducing it re-nulls the
  // absent keys and re-disables the guardrail.
  assert.doesNotMatch(SQL_CODE, /row_to_json/, 'row_to_json emits absent keys as null — build the object by hand');
});

test('migration: emits every field name the core destructures, in camelCase', () => {
  // The core's own parameter list is the source of truth, read out of the file
  // so a rename there fails HERE rather than silently producing undefined.
  const m = CORE.match(/export function bsClassifySession[\s\S]{0,400}?const\s*\{([^}]+)\}\s*=/);
  assert.ok(m, 'could not locate the core session destructure');
  const fields = m[1].split(',').map((s) => s.trim().split(/[:=]/)[0].trim()).filter(Boolean);
  assert.ok(fields.includes('startedAtISO') && fields.includes('durationPrompted'), `unexpected core fields: ${fields}`);
  for (const f of fields) {
    assert.match(SQL_CODE, new RegExp(`'${f}'`), `the RPC never emits '${f}' — the core would read undefined`);
  }
});

test('migration: the duration pair is CONDITIONAL on the writer having written it', () => {
  // `?` is the jsonb key-existence operator — the mechanism that makes absent
  // absent. Both keys ride together so a half-filled pair stays malformed.
  assert.match(SQL_CODE, /summary \? 'durationPrompted' or ws\.summary \? 'durationAnswer'/);
  assert.match(SQL_CODE, /else '\{\}'::jsonb/, 'no keys written => no keys emitted');
});

test('migration: started_at falls back to created_at rather than dropping the row', () => {
  // §4.1: "started_at when present, else created_at". A dropped row shrinks the
  // baseline with no malformed signal to say why.
  assert.match(SQL_CODE, /coalesce\(ws\.started_at, ws\.created_at\)/);
  assert.doesNotMatch(SQL_CODE, /ws\.started_at is not null/, 'dropping null started_at contradicts §4.1');
});

test('migration: the kill switch ships seeded FALSE (advisory) and cannot clobber an ops flip', () => {
  assert.match(SQL_CODE, /values \('guardrail_red_enabled', false\)/, 'advisory at ship (§9.4)');
  assert.match(SQL_CODE, /on conflict \(key\) do nothing/, 'a re-run must never revert a live flip');
});

// ─── §9.5 — the scope discriminators (owner ruling 2026-07-28) ───────────────

test('migration: the RPC EMITS source and status, so the core can scope on them', () => {
  // §9.5's standing demand: "the RPC must start returning whichever field the
  // ruling keys on." These are NOT in bsClassifySession's destructure — they
  // are read by bsSessionInScope — so the field loop above cannot cover them
  // and they are asserted by name here.
  assert.match(SQL_CODE, /'source',\s*to_jsonb\(ws\.source\)/, "the core would read source undefined");
  assert.match(SQL_CODE, /'status',\s*to_jsonb\(ws\.status\)/, "the core would read status undefined");
});

test('migration: only PERFORMED work crosses the wire, and `reviewed` still counts', () => {
  // Filtered in SQL rather than the core specifically so the `limit 500` cannot
  // be consumed by rows that were never going to count.
  assert.match(SQL_CODE, /ws\.status in \('completed', 'reviewed'\)/);
  // The literal-'completed' reading is the trap: it would let a coach REVIEWING
  // a session silently remove it from that client's baseline.
  assert.doesNotMatch(SQL_CODE, /ws\.status\s*=\s*'completed'/, 'reviewed must not be dropped');
});

test('migration: SOURCE is deliberately NOT filtered in SQL — it is the core ruling', () => {
  // Which sources count is the contestable half (`manual` is registered for
  // revisit), and under the §4.1 standing rule a judgement lives where §12's
  // fixtures reach it. Filtering here would move the decision most likely to
  // change into the one place it cannot be fixture-tested — and would make
  // tests/guardrail-scope.test.mjs pass while proving nothing about production.
  assert.doesNotMatch(SQL_CODE, /ws\.source\s+in\s*\(/, 'source scope belongs in the core');
  assert.doesNotMatch(SQL_CODE, /ws\.source\s*=\s*'/, 'source scope belongs in the core');
});
