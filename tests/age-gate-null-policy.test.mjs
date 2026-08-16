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
import { readFileSync } from 'node:fs';
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
  const fnStart = file.indexOf('create or replace function public.set_over_18()');
  assert.notEqual(fnStart, -1, 'set_over_18() definition not found — re-anchor this test');
  const fnEnd = file.indexOf('$$;', fnStart);
  assert.notEqual(fnEnd, -1, 'function terminator not found — re-anchor this test');
  const sql = file.slice(fnStart, fnEnd);
  assert.match(sql, /new\.created_at := old\.created_at/, 'UPDATE does not freeze created_at — the cutoff is forgeable');
  assert.match(sql, /new\.created_at := now\(\)/, 'INSERT does not stamp created_at — a backdated row can be inserted');
  assert.match(sql, /new\.date_of_birth := old\.date_of_birth/, 'the migration dropped the existing DOB freeze');
  assert.match(sql, /is_privileged/, 'the freeze is not scoped to non-privileged callers — backfills would break');
  // Folded into the derivation, not a sibling trigger (the ordering hazard).
  assert.match(sql, /function public\.set_over_18\(\)/, 'the freeze is not inside set_over_18()');
});
