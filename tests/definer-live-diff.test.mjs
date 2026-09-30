// scripts/definer-live-diff.mjs is what an owner runs against the live database, so a defect in
// it is a defect in the audit's last mile: an empty capture read as "nothing wrong", a wrapped
// cell read as zero rows, or a finding counted twice. Each case here is one of those.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRows, diffLive, verdict, report, main } from '../scripts/definer-live-diff.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts/definer-live-diff.mjs');
const LIVE = JSON.parse(fs.readFileSync(join(ROOT, 'tests/fixtures/definer-live-2026-09-30.json'), 'utf8'));
// The fixture lists non-trigger definers only (its own `scope`), so its rows are all is_trigger: false
// and say nothing about trigger definers.

const allow = () => ({
  entries: { mine: { class: 'self-gated-auth-uid', note: 'x' }, both: { class: 'self-gated-auth-uid', note: 'x' } },
  registeredFindings: [{ name: 'known_open' }],
  registeredPinFindings: [{ name: 'loose' }],
});
const row = (proname, anon, pinned = true, extra = {}) => ({ proname, is_trigger: false, anon_executable: anon, pg_temp_pinned: pinned, ...extra });

test('parseRows takes the array, a one-cell wrapper, a bare-string cell, or the single-key object', () => {
  const rows = [row('a', true), row('b', false)];
  assert.deepEqual(parseRows(JSON.stringify(rows)), rows);
  assert.deepEqual(parseRows(JSON.stringify([{ rows }])), rows, 'the column the query names');
  assert.deepEqual(parseRows(JSON.stringify([{ json_agg: rows }])), rows, 'any single column');
  assert.deepEqual(parseRows(JSON.stringify({ rows })), rows);
  assert.deepEqual(parseRows(JSON.stringify(JSON.stringify(rows))), rows, 'a cell copied as a JSON string');
  assert.deepEqual(parseRows(JSON.stringify([{ rows: JSON.stringify(rows) }])), rows);
});

test('parseRows refuses input that would read as a pass by accident', () => {
  assert.throws(() => parseRows('not json'), /not JSON/);
  assert.throws(() => parseRows('[]'), /no rows/);
  assert.throws(() => parseRows(JSON.stringify([{ rows: [] }])), /no rows/);
  assert.throws(() => parseRows('{"a":1,"b":2}'), /expected a JSON array/);
  assert.throws(() => parseRows('42'), /expected a JSON array/);
  assert.throws(() => parseRows(JSON.stringify([{ proname: 'a' }])), /row 0 lacks/, 'a row without anon_executable is not a capture of the query');
  assert.throws(() => parseRows(JSON.stringify([{ ...row('a', true), anon_executable: 'true' }])), /row 0 lacks/, 'a string is not a boolean');
  assert.throws(() => parseRows(JSON.stringify([row('a', true), { anon_executable: true }])), /row 1 lacks/);
});

test('parseRows refuses a capture that cannot say which rows are triggers or which are pinned', () => {
  // An older query's output has neither column. Read without them, every row would count as a plain
  // function and every pin as fine, and the check would pass a database it never looked at.
  const without = (r, key) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
  const noTrigger = without(row('a', true), 'is_trigger');
  const noPin = without(row('a', true), 'pg_temp_pinned');
  assert.throws(() => parseRows(JSON.stringify([noTrigger])), /row 0 lacks .*is_trigger.*current scripts\/definer-live-check\.sql/s);
  assert.throws(() => parseRows(JSON.stringify([noPin])), /row 0 lacks .*pg_temp_pinned/s);
  assert.throws(() => parseRows(JSON.stringify([{ ...row('a', true), is_trigger: 'false' }])), /row 0 lacks/, 'a string is not a boolean');
  assert.throws(() => parseRows(JSON.stringify([{ ...row('a', true), pg_temp_pinned: null }])), /row 0 lacks/, 'null is not a boolean');
});

test('an anon-executable definer with no entry and no finding is unaccounted', () => {
  const d = diffLive([row('mine', true), row('known_open', true), row('brand_new', true), row('quiet', false)], allow());
  assert.deepEqual(d.unaccounted, ['brand_new']);
  assert.equal(d.anonExecutable, 3);
  assert.equal(d.allowListed, 1);
  assert.equal(d.registered, 1);
  assert.equal(d.definers, 4);
  assert.equal(verdict(d), 1);
});

test('a registered finding and an allow-listed entry are both accounted for', () => {
  const d = diffLive([row('mine', true), row('known_open', true), row('both', false)], allow());
  assert.deepEqual(d.unaccounted, []);
  assert.equal(verdict(d), 0);
});

test('a row for a function that is not a definer, or is a trigger, or is not in public, does not count as an anon-executable definer', () => {
  const d = diffLive([row('inv', true, true, { prosecdef: false }), row('tf', true, true, { is_trigger: true }), row('other', true, true, { nspname: 'extra' }), row('mine', true)], allow());
  assert.deepEqual(d.unaccounted, []);
  assert.equal(d.anonExecutable, 1);
  assert.equal(d.definers, 1, 'the RPC surface: one non-trigger definer in public');
  assert.equal(d.triggerDefiners, 1, 'the trigger function is counted separately, for the pin');
});

test('a TRIGGER definer is outside the anon accounting and inside the pin check, and the pin list is read before the trigger filter', () => {
  // The scope the query, the diff script and the model share: anon-executability over non-trigger
  // definers, the search_path pin over ALL definers. An unpinned trigger definer must be caught
  // here even though it can never be an anon-callable RPC.
  const trig = (name, pinned) => row(name, true, pinned, { is_trigger: true });
  const d = diffLive([trig('tf_loose', false), trig('tf_ok', true), row('mine', true)], allow());
  assert.deepEqual(d.unaccounted, [], 'an anon-executable trigger function is not an exposure: nothing can call it');
  assert.deepEqual(d.unpinned, ['tf_loose'], 'but an unpinned trigger definer is exactly as exposed to a planted pg_temp relation');
  assert.deepEqual(d.unregisteredPins, ['tf_loose']);
  assert.equal(verdict(d), 1, 'and it fails the run until it is fixed or registered');
  const registered = diffLive([trig('loose', false)], allow()); // `loose` is a registered pin finding
  assert.deepEqual(registered.unregisteredPins, []);
  assert.equal(verdict(registered), 0);
  const stale = diffLive([trig('loose', true), row('mine', true)], allow());
  assert.deepEqual(stale.stalePins, ['loose'], 'a pin finding for a trigger definer that is pinned now is stale, like any other');
});

test('the same name twice is one function in the diff', () => {
  const d = diffLive([row('brand_new', true), row('brand_new', true)], allow());
  assert.deepEqual(d.unaccounted, ['brand_new']);
  assert.equal(d.anonExecutable, 1);
});

test('an entry the live catalog no longer supports is stale, and fails only under --strict', () => {
  const d = diffLive([row('mine', true)], allow()); // `both` and `known_open` are not anon live
  assert.deepEqual(d.stale, ['both', 'known_open']);
  assert.equal(verdict(d), 0);
  assert.equal(verdict(d, { strict: true }), 1);
});

test('an unpinned definer must be a registered pin finding', () => {
  const d = diffLive([row('mine', false, false), row('loose', false, false), row('fine', false, true)], allow());
  assert.deepEqual(d.unpinned, ['loose', 'mine']);
  assert.deepEqual(d.unregisteredPins, ['mine']);
  assert.equal(verdict(d), 1);
  const ok = diffLive([row('loose', false, false)], allow());
  assert.deepEqual(ok.unregisteredPins, []);
  assert.equal(verdict(ok), 0);
  const stale = diffLive([row('loose', false, true), row('mine', true)], allow());
  assert.deepEqual(stale.stalePins, ['loose']);
  assert.equal(verdict(stale), 0);
  assert.equal(verdict(stale, { strict: true }), 1);
});

test('a name in both entries and findings fails the check', () => {
  const a = allow();
  a.registeredFindings.push({ name: 'mine' });
  const d = diffLive([row('mine', true)], a);
  assert.deepEqual(d.doubleListed, ['mine']);
  assert.equal(verdict(d), 1);
});

test('the report names each unaccounted function and says what to do', () => {
  const text = report(diffLive([row('brand_new', true), row('mine', true), row('tf', true, true, { is_trigger: true })], allow()));
  assert.match(text, /2 SECURITY DEFINER functions in public \(plus 1 trigger functions, checked for the pin only\); 2 executable by anon: 1 allow-listed, 0 registered findings, 1 UNACCOUNTED/);
  assert.match(text, /\n  brand_new\n/);
  assert.match(text, /revoke execute on function public\.<name>\(<args>\) from public, anon/);
  assert.match(text, /revoking from PUBLIC alone leaves the explicit anon grant standing/);
  assert.doesNotMatch(report(diffLive([row('mine', true)], allow())), /UNACCOUNTED anon-executable/);
});

// ── main(): exit statuses and where the report goes ──────────────────────────

const withAllowFile = (obj, fn) => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'definer-diff-'));
  try {
    const p = join(dir, 'allow.json');
    fs.writeFileSync(p, JSON.stringify(obj));
    return fn(p);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
const run = (argv, stdin) => { const o = []; const e = []; const code = main(argv, { stdin, out: (s) => o.push(s), err: (s) => e.push(s) }); return { code, out: o.join('\n'), err: e.join('\n') }; };

test('main: 0 when accounted for (report on stdout), 1 when not (report on stderr), 2 for unusable input', () => {
  withAllowFile(allow(), (p) => {
    const ok = run(['--allowlist', p], JSON.stringify([row('mine', true)]));
    assert.equal(ok.code, 0);
    assert.match(ok.out, /1 executable by anon/);
    assert.equal(ok.err, '');
    const bad = run(['--allowlist', p], JSON.stringify([row('brand_new', true)]));
    assert.equal(bad.code, 1);
    assert.match(bad.err, /brand_new/);
    assert.equal(bad.out, '');
    for (const stdin of ['', '[]', 'nope', '[{"x":1}]']) {
      const r = run(['--allowlist', p], stdin);
      assert.equal(r.code, 2, `stdin ${JSON.stringify(stdin)}`);
      assert.match(r.err, /^definer-live-diff: /);
    }
    assert.equal(run(['--allowlist', p, '--strict'], JSON.stringify([row('mine', true)])).code, 1, 'strict fails on the stale entries the rows do not support');
  });
  assert.equal(run(['--allowlist', '/nonexistent/allow.json'], '[]').code, 2);
});

test('the CLI: the checked-in allow-list accepts the live capture, and rejects a new anon-executable definer', () => {
  const unpinned = new Set(LIVE.definersWithoutPgTemp);
  const rows = [
    ...LIVE.anonExecutable.map((proname) => row(proname, true, !unpinned.has(proname))),
    ...LIVE.notAnonExecutable.map((proname) => row(proname, false, !unpinned.has(proname))),
  ];
  assert.ok(rows.every((r) => r.is_trigger === false), 'the fixture names non-trigger definers');
  const cli = (input, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: 'utf8', cwd: ROOT });
  const good = cli(JSON.stringify([{ rows }]));
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /136 SECURITY DEFINER functions in public \(plus 0 trigger functions, checked for the pin only\); 85 executable by anon: 79 allow-listed, 6 registered findings, 0 UNACCOUNTED/);
  const leak = cli(JSON.stringify([...rows, row('league_style_leak', true)]));
  assert.equal(leak.status, 1);
  assert.match(leak.stderr, /1 UNACCOUNTED/);
  assert.match(leak.stderr, /league_style_leak/);
  const loose = cli(JSON.stringify([...rows, row('an_unpinned_trigger', false, false, { is_trigger: true })]));
  assert.equal(loose.status, 1, 'an unpinned TRIGGER definer fails the run, end to end');
  assert.match(loose.stderr, /search_path does not end in pg_temp[^]*an_unpinned_trigger/);
  assert.doesNotMatch(loose.stderr, /UNACCOUNTED anon-executable/, 'and it is not reported as an anon exposure');
  assert.equal(cli('').status, 2);
  assert.equal(cli(JSON.stringify([{ rows }]), '--strict').status, 0, 'the checked-in lists carry no stale entry against the live capture');
});
