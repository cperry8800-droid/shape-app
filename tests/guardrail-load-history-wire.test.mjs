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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bsClassifySession } from '../public/newdesign/progressionGuardrail.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(join(ROOT, 'supabase-migrations', '2026-07-27-guardrail-load-history.sql'), 'utf8');
const CORE = readFileSync(join(ROOT, 'public', 'newdesign', 'progressionGuardrail.mjs'), 'utf8');
// Structural assertions run against the EXECUTABLE sql only. The file's own
// comments name `row_to_json` in order to warn against it, and a guard that
// can't tell prose from code would fire on its own explanation.
const SQL_CODE = SQL.replace(/--[^\n]*/g, '');

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
