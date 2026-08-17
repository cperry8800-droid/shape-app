// ABSENCE OF A DATE OF BIRTH MUST NOT ADMIT.
//
// THE DEFECT THIS CLOSES, AND WHY IT IS A READ-TIME FIX. Every gate used to read
//   isKnownMinor = fromDob !== null ? fromDob : over_18 === false
// so only an explicit proof of MINORITY refused and absence ADMITTED. Any account
// that reached a session without a stored date of birth was therefore let in, and
// four consecutive review rounds found four different routes into that state: a
// failed profile upsert on the auto-confirm path, an email-confirmation callback
// that never provisioned, an approved-coach invitation that wrote no DOB, and a
// legacy sign-in whose provisioning failure left the session usable. Patching the
// write surfaces could not converge — each patch added a new failure mode — because
// the hole was the read-time default, not any one writer.
//
// The rule now: a usable DOB decides in BOTH directions; the trigger-written
// over_18 flag is the fallback; and when a row proves NOTHING either way, only
// accounts predating ADULT_PROOF_REQUIRED_FROM are grandfathered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mustRefuseForAge, ADULT_PROOF_REQUIRED_FROM } from '../src/lib/age-derive.mjs';

const NOW = Date.UTC(2026, 7, 16, 12);
const BEFORE = new Date(ADULT_PROOF_REQUIRED_FROM - 86400000).toISOString(); // grandfathered
const AFTER = new Date(ADULT_PROOF_REQUIRED_FROM + 86400000).toISOString();  // must prove

// ── A usable date decides, and the cutoff never overrides it ─────────────────

test('a proven adult passes regardless of when the account was created', () => {
  for (const created_at of [BEFORE, AFTER]) {
    assert.equal(mustRefuseForAge({ date_of_birth: '1990-01-01', created_at }, NOW), false);
  }
});

test('a proven minor is refused regardless of when the account was created', () => {
  for (const created_at of [BEFORE, AFTER]) {
    assert.equal(mustRefuseForAge({ date_of_birth: '2015-06-30', created_at }, NOW), true);
  }
});

// ⚠ The boundary the whole wave exists for: adulthood is asserted only once it is
// true in EVERY timezone, and the cutoff must not quietly re-admit that case.
test('the anywhere-on-Earth boundary still governs a dated row', () => {
  const eve = Date.parse('2026-08-17T00:30:00Z');
  assert.equal(mustRefuseForAge({ date_of_birth: '2008-08-17', created_at: AFTER }, eve), true);
  assert.equal(mustRefuseForAge({ date_of_birth: '2008-08-17', created_at: AFTER },
    Date.parse('2026-08-17T12:00:00Z')), false);
});

// ── The stored flag is the fallback for rows with no usable date ─────────────

test('the trigger-written flag decides when there is no usable date', () => {
  assert.equal(mustRefuseForAge({ over_18: false, created_at: BEFORE }, NOW), true,
    'over_18=false is a proven minor and must refuse even when grandfathered');
  assert.equal(mustRefuseForAge({ over_18: true, created_at: AFTER }, NOW), false,
    'over_18=true is proof of adulthood — set_over_18() derives it and discards client input');
});

// ── Absence: the actual fix ─────────────────────────────────────────────────

test('an account with NO proof is grandfathered only if it predates the cutoff', () => {
  assert.equal(mustRefuseForAge({ created_at: BEFORE }, NOW), false, 'pre-cutoff account should be grandfathered');
  assert.equal(mustRefuseForAge({ created_at: AFTER }, NOW), true, 'post-cutoff account with no proof MUST be refused');
});

test('the cutoff boundary itself requires proof (>=, not >)', () => {
  const at = new Date(ADULT_PROOF_REQUIRED_FROM).toISOString();
  assert.equal(mustRefuseForAge({ created_at: at }, NOW), true);
  assert.equal(mustRefuseForAge({ created_at: new Date(ADULT_PROOF_REQUIRED_FROM - 1).toISOString() }, NOW), false);
});

// ⚠ THE STATE A FAILED PROVISIONING WRITE LEAVES BEHIND. A session with no
// profiles row used to be admitted; it is the single most important case here.
test('a missing or unreadable profile REFUSES', () => {
  for (const p of [null, undefined, {}, { created_at: null }, { created_at: 'not-a-date' },
                   { created_at: {} }, { created_at: [] }]) {
    assert.equal(mustRefuseForAge(p, NOW), true, `expected refusal for ${JSON.stringify(p)}`);
  }
});

// ⚠ A caller that forgets `created_at` reads every account as unplaceable and
// refuses — safe, but a total lockout. So the selects are pinned here: the
// mistake fails the build rather than the login.
test('every gate selects created_at alongside the age columns', () => {
  const gates = [
    ['membership-core.ts', '../src/lib/membership-core.ts'],
    ['age-gate.ts', '../src/lib/age-gate.ts'],
  ];
  for (const [label, rel] of gates) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    const selects = [...src.matchAll(/\.select\(\s*'([^']*)'\s*\)/g)].map((m) => m[1]);
    const ageSelects = selects.filter((s) => s.includes('date_of_birth') || s.includes('over_18'));
    assert.ok(ageSelects.length > 0, `${label}: no age-column select found — re-anchor this test`);
    for (const sel of ageSelects) {
      assert.ok(sel.includes('created_at'),
        `${label}: select("${sel}") omits created_at — every account would read as unplaceable and be REFUSED`);
    }
    assert.match(src, /mustRefuseForAge\(/, `${label}: does not use the shared refusal policy`);
  }
});

// The old permissive expression must never come back on a gate.
test('no gate reverts to admitting on absence', () => {
  for (const rel of ['../src/lib/membership-core.ts', '../src/lib/age-gate.ts']) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    assert.ok(!/fromDob\s*!==\s*null\s*\?\s*fromDob\s*:/.test(src),
      'the permissive "absence admits" expression is back — absence must refuse');
  }
});

// ⚠ The cutoff is a one-way ratchet: moving it FORWARD re-opens the hole for every
// account created in the widened window. Pinned so a "harmless" bump is a failure.
test('the grandfather cutoff has not moved forward', () => {
  assert.ok(ADULT_PROOF_REQUIRED_FROM <= Date.UTC(2026, 7, 16),
    'ADULT_PROOF_REQUIRED_FROM moved forward — that re-admits every unproven account created in the new window');
});

// ⚠ THE GRANDFATHER IS ONLY AS TRUSTWORTHY AS created_at. The owner policy
// `users update own profile` is (auth.uid() = id) with NO column restriction —
// verified live — so without a server-side freeze an authenticated caller could
// backdate their own row (or insert one already backdated) and walk straight
// past this gate. The freeze is folded into set_over_18() rather than a separate
// trigger because BEFORE ROW triggers fire in ALPHABETICAL order, and a guard
// sorting after the derivation is worse than the bug it fixes.
test('the created_at freeze ships in the migration the grandfather depends on', () => {
  const file = readFileSync(
    new URL('../supabase-migrations/2026-08-16-created-at-freeze-and-application-dob.sql', import.meta.url),
    'utf8'
  );
  // ⚠ SLICE THE FUNCTION BODY. The migration's own structural guard block quotes
  // these same assignments to self-verify, so asserting over the whole file
  // matches the guard's literals and passes even when the trigger no longer
  // performs the freeze — caught by mutation-testing this test.
  // Same tolerance as the directory-wide guard below: an exact-literal search here
  // would stop finding the definition the moment the SQL is reformatted, and a
  // `notEqual(-1)` that fires is at least loud — but matching tolerantly keeps the
  // two halves of this file honest about the same statement.
  const fnStart = file.search(/create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\s*\.\s*)?"?set_over_18"?\s*\(/i);
  assert.notEqual(fnStart, -1, 'set_over_18() definition not found — re-anchor this test');
  const fnEnd = file.indexOf('$$;', fnStart);
  assert.notEqual(fnEnd, -1, 'function terminator not found — re-anchor this test');
  const sql = file.slice(fnStart, fnEnd);
  assert.match(sql, /new\.created_at := old\.created_at/, 'UPDATE does not freeze created_at — the cutoff is forgeable');
  assert.match(sql, /new\.created_at := now\(\)/, 'INSERT does not stamp created_at — a backdated row can be inserted');
  assert.match(sql, /new\.date_of_birth := old\.date_of_birth/, 'the migration dropped the existing DOB freeze');
  assert.match(sql, /is_privileged/, 'the freeze is not scoped to non-privileged callers — backfills would break');
  // Folded into the derivation, not a sibling trigger (the ordering hazard).
  assert.match(sql, /function\s+(?:"?public"?\s*\.\s*)?"?set_over_18"?\s*\(/i, 'the freeze is not inside set_over_18()');
});

// ⚠ THE DURABLE FORWARD GUARD. Both the 08-15 and 08-16 migrations
// `create or replace` set_over_18() and both are marked safe to re-run, so
// replaying the OLDER one after the newer silently reinstates a body with no
// created_at freeze and re-opens the grandfather clause to backdating. A DO
// guard inside a migration only runs while THAT file is applied, so it cannot
// catch a later replacement. The durable protection is this: EVERY replayable
// definition of the function must carry the FULL freeze, checked here across the
// whole migrations directory — so a future migration that drops either half
// fails the build rather than the gate.
// ⚠ THE MATCHER IS THE GUARD. This scan used to key on the exact lowercase string
// `create or replace function public.set_over_18()`. PostgreSQL does not care about
// case or the space before the parens, so
//   CREATE OR REPLACE FUNCTION public.set_over_18 ()
// is the same statement and was INVISIBLE here — and because the three known
// definitions kept the count assertion satisfied, a migration replacing the
// function with NEITHER freeze passed this test clean. Verified, not assumed:
// reformatting one header that way and deleting `new.created_at := old.created_at`
// left every assertion green.
//
// The fix is deliberately NOT "widen the literal by one more case". A hand-rolled
// matcher keeps differing from Postgres's in ways nothing catches, and a matcher
// that quietly recognises nothing reports CLEAN — the worst direction for a guard.
// So: recognise the statement tolerantly, and FAIL CLOSED on anything ambiguous
// (a file defining it more than once, or a known definer that stops matching)
// rather than skipping it silently.
const SET_OVER_18_DEF =
  /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\s*\.\s*)?"?set_over_18"?\s*\(/gi;

// The freeze assignments, equally formatting-tolerant — a future migration may
// well write `NEW.created_at := OLD.created_at`.
const FREEZES = [
  [/new\s*\.\s*date_of_birth\s*:=\s*old\s*\.\s*date_of_birth/i,
    'the date_of_birth freeze — replaying it re-opens DOB rewriting'],
  [/new\s*\.\s*created_at\s*:=\s*old\s*\.\s*created_at/i,
    'the created_at UPDATE freeze — replaying it re-opens grandfather backdating'],
  [/new\s*\.\s*created_at\s*:=\s*now\s*\(\s*\)/i,
    'the created_at INSERT stamp — a backdated row can be inserted'],
];

// Every migration known to define the function. A definer that stops matching is
// a matcher regression, not a resolved one, so the guard names them explicitly.
const KNOWN_DEFINERS = [
  '2026-06-22-age-verification.sql',
  '2026-08-15-profiles-dob-immutable.sql',
  '2026-08-16-created-at-freeze-and-application-dob.sql',
];

// ⚠ ASSERT OVER THE FUNCTION BODY, NOT THE FILE. Asserting per FILE was the
// previous shape and it reported CLEAN about a definition it could not see: a
// replacement body that freezes NOTHING passes as long as the three literals
// appear anywhere else in the file — a later structural `DO` block quoting the
// expected assignments is enough, and that is exactly how these migrations are
// written. Reproduced before fixing.
//
// Extracting the body is tractable because dollar quoting cannot nest with the
// SAME tag: the body runs from the first `$tag$` after the CREATE to the next
// occurrence of that identical tag. That is a delimiter match, not the SQL
// lexing the pg_temp scanner kept losing on. The tag charset admits non-ASCII
// because Postgres treats any non-ASCII byte as an identifier character.
const DOLLAR_OPEN = /\$([A-Za-z_-￿][A-Za-z0-9_-￿]*)?\$/g;

function bodyOf(src, startIndex, file) {
  DOLLAR_OPEN.lastIndex = startIndex;
  const open = DOLLAR_OPEN.exec(src);
  assert.ok(open,
    `${file}: found a set_over_18() definition with no dollar-quoted body — this guard cannot read it, ` +
    'so it refuses rather than report clean. Re-anchor this test.');
  const tag = open[0];
  const bodyStart = open.index + tag.length;
  const end = src.indexOf(tag, bodyStart);
  assert.notEqual(end, -1,
    `${file}: set_over_18()'s body opens with ${tag} and never closes — unreadable, refusing to report clean.`);
  return src.slice(bodyStart, end);
}

test('every migration defining set_over_18() carries the full freeze', () => {
  const dir = new URL('../supabase-migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const definers = [];

  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    const defs = [...src.matchAll(SET_OVER_18_DEF)];
    if (!defs.length) continue;
    // Each definition is checked on its OWN body, so several in one file is no
    // longer ambiguous — but every one of them must carry the full freeze.
    for (const def of defs) {
      definers.push([f, bodyOf(src, def.index + def[0].length, f)]);
    }
  }

  const found = definers.map(([f]) => f);
  for (const known of KNOWN_DEFINERS) {
    assert.ok(found.includes(known),
      `${known} defines set_over_18() but this guard no longer recognises it — the matcher regressed, ` +
      'which means a redefinition can now drop the freeze unnoticed. Fix the matcher, do not delete this.');
  }

  for (const [file, body] of definers) {
    for (const [pattern, what] of FREEZES) {
      assert.match(body, pattern,
        `${file}: set_over_18()'s BODY is missing ${what}`);
    }
  }
});
