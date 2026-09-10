// tests/lift-rpc-source-parity.test.mjs
//
// THE TWO LIFT RPCs MUST READ THE SAME FIELD AS "THE LIFT". `get_my_lifts`
// (the member's own key-lifts card) and `get_client_lifts` (the coach's case
// file) answer the same question about the same sets, and they diverged:
//
//   `normalizeWorkoutSetLog` writes the ACTUAL load to the `actual_load`
//   COLUMN and keeps the raw entry in `payload`. `get_client_lifts` read the
//   column first, then `payload.actualLoad`, `payload.load`,
//   `payload.actual_load`, and only then the prescription in `target_load`.
//   `get_my_lifts` read `payload.load` and `target_load` ONLY.
//
// Driven on a real Postgres 16 (see the PR), that cost two things: a set
// logged as `{actualLoad: 225}` against a prescribed `185 lb` reported the
// PRESCRIPTION on the member's own card, and a set whose only load string was
// `{actualLoad: "100 kg"}` produced a null `raw_load` and was DROPPED — the
// lift vanished from the member's card while their coach could see it.
//
// A unit test cannot run Postgres, so this pins the property that made the two
// answers agree: the load selector and the unit sniff are IDENTICAL in the two
// migrations. Normalised for whitespace and for the column alias, so a
// reformat passes and a changed field list fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MINE = 'supabase-migrations/2026-09-10-my-lifts-source.sql';
const THEIRS = 'supabase-migrations/2026-09-10-coach-lift-units.sql';

const mine = readFileSync(MINE, 'utf8');
const theirs = readFileSync(THEIRS, 'utf8');

const squash = (s) => s.replace(/\s+/g, ' ').trim();

// The ordered list of payload fields a selector reads, in the order it reads
// them. That ORDER is the contract — it is what decides whether the actual
// load or the prescription wins.
function fieldOrder(sql, anchor) {
  const at = sql.indexOf(anchor);
  assert.notEqual(at, -1, `anchor not found: ${anchor}`);
  const window = sql.slice(at, at + 400);
  return [...window.matchAll(/sl\.payload->>'([a-zA-Z_]+)'|sl\.(target_load|actual_load)\b/g)]
    .map((m) => m[1] || m[2]);
}

test('the load selector reads the same fields in the same order in both RPCs', () => {
  const ANCHOR = 'case when sl.actual_load > 0';
  const a = fieldOrder(mine, ANCHOR);
  const b = fieldOrder(theirs, ANCHOR);
  assert.ok(a.length >= 4, `expected a real field list, got ${JSON.stringify(a)}`);
  assert.deepEqual(a, b);
  // And the ACTUAL load must come before the prescription, whatever else changes.
  assert.ok(a.indexOf('actualLoad') < a.indexOf('target_load'),
    'the prescription must never outrank the actual load');
});

test('both RPCs prefer the actual_load COLUMN over any payload field', () => {
  for (const [name, sql] of [['get_my_lifts', mine], ['get_client_lifts', theirs]]) {
    assert.ok(squash(sql).includes(
      squash('coalesce( case when sl.actual_load > 0 then sl.actual_load::numeric else null end,')),
      `${name} does not prefer the actual_load column`);
  }
});

test('the unit sniff falls back over the same fields in both RPCs', () => {
  // The SNIFF is the `when lower(coalesce(...))` arm — the branch reached only
  // when no explicit unit field is present. Matched as its own line so the
  // explicit-field arm above it (which ends in the same `like '%kg%'`) cannot
  // be picked up by mistake.
  const pick = (sql) => {
    // ⚠ ANCHORED AT THE START OF THE LINE. The explicit-field arm above reads
    // `then case when lower(coalesce(...))`, which contains the same substring
    // — matching loosely picks THAT line and reports the explicit fields as
    // though they were the sniff, which is a guard that passes on the bug.
    const line = sql.split('\n').find((l) => /^when lower\(coalesce\(/.test(l.trim()));
    assert.ok(line, 'unit sniff fallback line not found');
    return [...line.matchAll(/sl\.payload->>'([a-zA-Z_]+)'|sl\.(target_load)\b/g)].map((m) => m[1] || m[2]);
  };
  const a = pick(mine);
  const b = pick(theirs);
  assert.ok(a.includes('actualLoad'),
    `the unit must be sniffed off the field the VALUE came from; got ${JSON.stringify(a)}`);
  assert.deepEqual(a, b);
});

test('get_my_lifts still normalises to pounds and is not executable by anon', () => {
  assert.match(mine, /raw_load \/ 0\.45359237/, 'the pounds normalisation is gone');
  assert.match(mine, /search_path = public, pg_temp/, 'pg_temp is not pinned last');
  assert.match(mine, /revoke execute on function public\.get_my_lifts\(\) from public, anon/,
    'anon is not revoked BY NAME (revoke from public does not drop Supabase’s anon grant)');
});

// ── An unknown unit must stay unknown ───────────────────────────────────────
// Both case-file consumers used to default a missing lift unit to 'lb'. That
// is the same defect as the hardcoded "kg" they replaced, one step on: the RPC
// states a unit only once the migration is APPLIED, and until then it returns
// a bare max taken ACROSS mixed units — a number whose unit is genuinely not
// known. Stamping one on it turns "we don't know" into a claim, and the theme
// then CONVERTS that claim, so a metric coach is shown a confidently wrong
// kilogram figure.
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const WEB = 'public/newdesign/coachClientDetail.jsx';

test('bsSdMeasure leaves a value with an unknown unit untouched', async () => {
  // The contract the fix depends on — driven, not assumed.
  const { bsSdMeasure } = await import('../mobile-app/src/services/sessionLedger.mjs');
  const prefs = { weight: 'kg', distance: 'km' };
  assert.deepEqual(bsSdMeasure(225, '', prefs), { value: 225, unit: '' });
  assert.deepEqual(bsSdMeasure(225, null, prefs), { value: 225, unit: null });
  // ...while a KNOWN unit still converts, so this is not just "conversion off".
  assert.equal(bsSdMeasure(220.5, 'lb', prefs).unit, 'kg');
});

test('neither case-file consumer invents a unit for a lift that has none', () => {
  const fallbacks = [
    ['mobile', readFileSync(PROS, 'utf8').split('\n').find((l) => l.includes('const srcU ='))],
    ['web', readFileSync(WEB, 'utf8').split('\n').find((l) => l.includes('const liftUnit ='))],
  ];
  for (const [where, line] of fallbacks) {
    assert.ok(line, `${where}: fallback line not found`);
    // The last alternative of the `||`/ternary chain IS the fallback. It must
    // be an empty string — not a unit, and not a non-empty placeholder.
    assert.doesNotMatch(line, /["'](lb|kg|kgs|lbs|pounds|kilograms)["']/i,
      `${where}: a missing lift unit is defaulted to a real unit — ${line.trim()}`);
    assert.match(line, /(\|\|\s*''|:\s*"")\s*;/,
      `${where}: the fallback is not the empty string — ${line.trim()}`);
  }
});

test('the web case file renders no dangling separator when the unit is unknown', () => {
  // Drive the shipped expression rather than reading it: extract the `const v`
  // ternary and evaluate it, so a rewrite that keeps the behaviour passes.
  const line = readFileSync(WEB, 'utf8').split('\n').find((l) => l.includes('const v = b != null ?'));
  assert.ok(line, 'the render expression was not found');
  const expr = line.slice(line.indexOf('const v = b != null ?') + 'const v = '.length);
  const body = expr.slice(0, expr.indexOf('; return {'));
  const render = new Function('b', 'u', 'e1', `return (${body});`);
  assert.equal(render(225, '', null), '225');
  assert.equal(render(225, '', 240), '225 · 240 e1RM');
  // A known unit is still printed, with exactly one space.
  assert.equal(render(225, 'lb', null), '225 lb');
  assert.equal(render(225, 'lb', 240), '225 lb · 240 e1RM');
});
