// The classic-script mirror must ANSWER IDENTICALLY to the canonical module.
//
// public/age-derive.js exists because the account-creating surfaces are classic
// scripts (public/supabase.js is a browser IIFE; signup-client.html's copy is
// inline) and cannot import an ES module, while src/lib/age-derive.mjs must stay
// import-free for the Edge proxy bundle. Two implementations of one rule is a
// drift hazard, so this gate runs BOTH over a shared vector table plus a
// deterministic fuzz sweep and fails on the first disagreement.
//
// ⚠ THIS IS A BEHAVIOURAL GATE, DELIBERATELY, AND THE REASON IS A DEFECT THIS
// SUITE ALREADY SHIPPED ONCE. The previous guard for this rule asserted a REGEX
// over source text (`setFullYear(getFullYear() - 18)`), which had two failures a
// behavioural test cannot have: it passed on a file that still contained the
// expression somewhere else (a second function), and — worse — it PINNED every
// surface to the instant-based expression the read-time gate had already been
// rewritten to abandon, so the guard actively cemented the bug it was written to
// prevent. Assert what the code ANSWERS, not how it is spelled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isMinorFromDob, ADULT_AGE_YEARS, ADULT_REFERENCE_OFFSET_MS } from '../src/lib/age-derive.mjs';

// Evaluate the classic script the way a browser would: a bare <script> with a
// window global. No module wrapper, so a stray `export` would throw here.
const MIRROR = (() => {
  const src = readFileSync(new URL('../public/age-derive.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'public/age-derive.js' });
  const api = sandbox.window.ShapeAgeDerive;
  assert.ok(api && typeof api.isMinorFromDob === 'function',
    'public/age-derive.js did not register window.ShapeAgeDerive.isMinorFromDob');
  return api;
})();

test('the mirror exports the same constants as the canonical module', () => {
  assert.equal(MIRROR.ADULT_AGE_YEARS, ADULT_AGE_YEARS);
  assert.equal(MIRROR.ADULT_REFERENCE_OFFSET_MS, ADULT_REFERENCE_OFFSET_MS);
});

// The named cases: every boundary the canonical module's own suite pins, so a
// mirror that silently reverted to the instant-based rule fails HERE too, not
// only in the fuzz sweep where the failure would read as noise.
const NOW = Date.UTC(2026, 7, 16, 12);
const VECTORS = [
  // [dob, now] — the answer is whatever the canonical module says; we assert agreement.
  ['2008-08-16', NOW],                              // exactly 18 today
  ['2008-08-17', NOW],                              // one day short
  ['2008-08-15', NOW],                              // day after
  ['2008-08-17', Date.parse('2026-08-17T00:30:00Z')], // ⚠ the counterexample: minor west of UTC
  ['2008-08-17', Date.parse('2026-08-17T11:59:59Z')], // still minor
  ['2008-08-17', Date.parse('2026-08-17T12:00:00Z')], // adult everywhere on Earth
  ['2008-02-29', Date.UTC(2026, 1, 28, 12)],        // leap-day birthday, non-leap year
  ['2008-02-29', Date.UTC(2026, 2, 1, 12)],
  ['2010-03-01', Date.UTC(2028, 1, 29, 12)],        // leap-day REFERENCE: clamp, not roll
  ['2010-02-28', Date.UTC(2028, 1, 29, 12)],
  ['1990-01-01', NOW],
  ['2015-06-30', NOW],
  ['  2008-08-16  ', NOW],                          // whitespace tolerated
  ['2008-02-30', NOW],                              // calendar-impossible
  ['2008-13-01', NOW],
  ['2008-00-10', NOW],
  ['2008-04-31', NOW],
  ['2008-08-16', NaN],                              // unusable clocks
  ['2008-08-16', 9e15],
  ['2008-08-16', -9e15],
  ['0001-01-01', NOW],                              // two-digit-year mapping trap
  ['0099-12-31', NOW],
];

test('mirror and canonical agree on every named boundary vector', () => {
  for (const [dob, now] of VECTORS) {
    assert.equal(
      MIRROR.isMinorFromDob(dob, now),
      isMinorFromDob(dob, now),
      `disagreement for dob=${JSON.stringify(dob)} now=${String(now)}`
    );
  }
});

test('mirror and canonical agree on non-string and junk input', () => {
  for (const v of [null, undefined, '', '   ', 'not-a-date', '2008', '2008-08',
                   '08/16/2008', 0, 1, {}, [], true, NaN]) {
    assert.equal(MIRROR.isMinorFromDob(v, NOW), isMinorFromDob(v, NOW),
      `disagreement for ${String(v)}`);
  }
});

// ⚠ Deterministic fuzz — a seeded LCG, never Math.random, so a failure is
// reproducible and the suite cannot go green-or-red by luck between runs. This
// is the sweep that catches a mirror which is right on the named cases and wrong
// in the gaps between them (e.g. one that clamps the leap-year cutoff but reads
// the reference day at UTC instead of UTC−12 — correct for 12 hours a day).
test('mirror and canonical agree across a deterministic fuzz sweep', () => {
  let seed = 20260816;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let checked = 0;
  for (let i = 0; i < 4000; i++) {
    const y = 1970 + Math.floor(next() * 60);
    const mo = 1 + Math.floor(next() * 12);
    const d = 1 + Math.floor(next() * 31);
    const dob = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // Reference instants swept across the whole 24h clock, so any offset error
    // (UTC vs UTC−12, or a wrong sign) shows up rather than hiding at noon.
    const now = Date.UTC(2020 + Math.floor(next() * 20), Math.floor(next() * 12),
                         1 + Math.floor(next() * 28), Math.floor(next() * 24),
                         Math.floor(next() * 60));
    assert.equal(MIRROR.isMinorFromDob(dob, now), isMinorFromDob(dob, now),
      `disagreement for dob=${dob} now=${new Date(now).toISOString()}`);
    checked++;
  }
  assert.equal(checked, 4000);
});
