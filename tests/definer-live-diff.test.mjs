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
import * as M from './helpers/definer-model.mjs';
import { allowListAsOfCapture, modelAsOfCapture } from './helpers/definer-live.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts/definer-live-diff.mjs');
const LIVE = JSON.parse(fs.readFileSync(join(ROOT, 'tests/fixtures/definer-live-2026-10-08.json'), 'utf8'));
// The fixture lists the non-trigger definers by anon-executability and the trigger definers by name (its own `scope`)
// and say nothing about trigger definers.

const allow = () => ({
  entries: { mine: { class: 'self-gated-auth-uid', note: 'x' }, both: { class: 'self-gated-auth-uid', note: 'x' } },
  registeredFindings: [{ name: 'known_open' }],
  registeredPinFindings: [{ name: 'loose' }],
});
const row = (proname, anon, pinned = true, extra = {}) => ({ proname, identity_args: '', is_trigger: false, anon_executable: anon, pg_temp_pinned: pinned, ...extra });

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

test('parseRows refuses a capture that does not list each signature', () => {
  // Without `identity_args` every overload of a name looks like the same function, which is exactly
  // how an overload made outside the migrations would pass as the allow-listed one beside it.
  const without = (r, key) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
  assert.throws(() => parseRows(JSON.stringify([without(row('a', true), 'identity_args')])), /row 0 lacks .*identity_args.*current scripts\/definer-live-check\.sql/s);
  assert.throws(() => parseRows(JSON.stringify([{ ...row('a', true), identity_args: null }])), /row 0 lacks .*identity_args/s, 'null is not text');
  assert.throws(() => parseRows(JSON.stringify([{ ...row('a', true), identity_args: 7 }])), /row 0 lacks .*identity_args/s, 'a number is not text');
  assert.deepEqual(parseRows(JSON.stringify([row('a', true)])).map((r) => r.identity_args), [''], 'the empty string is a real signature: a function with no arguments');
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

// ── Overloads: the allow-list is by NAME, the catalog is by signature ────────

test('an overload of an allow-listed name is reported and fails the verdict, however the entry reads', () => {
  const sig = (args, anon) => row('mine', anon, true, { identity_args: args });
  // The hole this closes: `mine` is an allow-listed entry, and a second signature made outside the
  // migrations shares its name. Counted by name it is "mine, accounted for", exit 0.
  const d = diffLive([sig('p_id uuid', true), sig('p_id uuid, p_other text', true)], allow());
  assert.deepEqual(d.unaccounted, [], 'by name nothing is unaccounted: that is the hole');
  assert.deepEqual(d.overloaded, [{ name: 'mine', sigs: [{ args: 'p_id uuid', anon: true, trigger: false }, { args: 'p_id uuid, p_other text', anon: true, trigger: false }] }]);
  assert.equal(verdict(d), 1);
  // One signature, the same name: nothing to report.
  const one = diffLive([sig('p_id uuid', true)], allow());
  assert.deepEqual(one.overloaded, []);
  assert.equal(verdict(one), 0);
  // Only the EXTRA signature is open to anon: the allow-listed name still reads as anon-executable.
  const quiet = diffLive([sig('p_id uuid', false), sig('p_id uuid, p_other text', true)], allow());
  assert.deepEqual(quiet.unaccounted, []);
  assert.deepEqual(quiet.overloaded[0].sigs.map((x) => x.anon), [false, true], 'each signature keeps its own anon flag');
  assert.equal(verdict(quiet), 1);
  // Neither signature is open to anon, and it is still an overload: the allow-list cannot say which.
  assert.equal(verdict(diffLive([sig('a int', false), sig('b int', false)], allow())), 1);
});

test('what is not an overload: the same signature twice, a non-definer, another schema', () => {
  const sig = (args, extra = {}) => row('mine', true, true, { identity_args: args, ...extra });
  assert.deepEqual(diffLive([sig('p_id uuid'), sig('p_id uuid')], allow()).overloaded, [], 'one signature listed twice is one function');
  assert.deepEqual(diffLive([sig('p_id uuid'), sig('x int', { prosecdef: false })], allow()).overloaded, [], 'an invoker function is not a definer');
  assert.deepEqual(diffLive([sig('p_id uuid'), sig('x int', { nspname: 'extra' })], allow()).overloaded, [], 'another schema is another function');
});

test('a trigger function that shares a name with another definer is an overload too: the pin findings are by name', () => {
  // `loose` is a registered PIN finding. An unpinned plain function that shares its name would inherit that
  // registration and pass, exactly as an anon-executable overload inherits an allow-list entry.
  const trigger = row('loose', false, false, { is_trigger: true, identity_args: '' });
  const plain = row('loose', false, false, { identity_args: 'p_id uuid' });
  const d = diffLive([trigger, plain], allow());
  assert.deepEqual(d.unregisteredPins, [], 'by name the pin is registered: that is the hole');
  assert.deepEqual(d.overloaded, [{ name: 'loose', sigs: [{ args: '', anon: false, trigger: true }, { args: 'p_id uuid', anon: false, trigger: false }] }]);
  assert.equal(verdict(d), 1);
  assert.match(report(d), /\n  loose: \(\) \[trigger\] and \(p_id uuid\)\n/);
  assert.deepEqual(diffLive([trigger], allow()).overloaded, [], 'one trigger function alone is not an overload');
});

test('the report names every signature of an overloaded name, marks the open ones, and says what to do', () => {
  const sig = (args, anon) => row('mine', anon, true, { identity_args: args });
  const text = report(diffLive([sig('p_id uuid', false), sig('p_id uuid, p_other text', true)], allow()));
  assert.match(text, /OVERLOADED \(one name, several signatures\)/);
  assert.match(text, /\n  mine: \(p_id uuid\) and \(p_id uuid, p_other text\) \[anon-executable\]\n/);
  assert.match(text, /Rename or drop the extra signature/);
  assert.doesNotMatch(report(diffLive([row('mine', true)], allow())), /OVERLOADED/);
});

test('the capture query reads plain AND window functions, not plain ones only', () => {
  // A SECURITY DEFINER window function can be created in SQL or plpgsql (prokind 'w', prosecdef true:
  // measured on PostgreSQL 16.13), and the static audit reads every non-trigger definer. A query that
  // filtered `prokind = 'f'` would leave a live-only one out of the capture that is the authority.
  const sql = fs.readFileSync(join(ROOT, 'scripts/definer-live-check.sql'), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(sql, /\bp\.prokind\s+in\s*\(\s*'f'\s*,\s*'w'\s*\)/i);
  assert.doesNotMatch(sql, /\bprokind\s*=\s*'f'/i);
  assert.match(sql, /\bp\.prosecdef\b/, 'and it still reads definers only');
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

test('fixedAfterCapture: counted as before while live still has it, named as applied once live agrees', () => {
  const allow = {
    entries: { mine: { class: 'self-gated-auth-uid', note: 'x' } },
    registeredFindings: [{ name: 'known_open' }],
    registeredPinFindings: [],
    fixedAfterCapture: [
      { name: 'was_finding', fixedBy: 'f.sql', wasFinding: { name: 'was_finding' } },
      { name: 'was_entry', fixedBy: 'f.sql', wasEntry: { class: 'self-gated-auth-uid', note: 'x' } },
    ],
  };
  // Not applied yet: live still has both open. They count as what they were, nothing is unaccounted.
  const open = diffLive([row('mine', true), row('known_open', true), row('was_finding', true), row('was_entry', true)], allow);
  assert.deepEqual(open.unaccounted, []);
  assert.equal(open.allowListed, 2);
  assert.equal(open.registered, 2);
  assert.deepEqual(open.awaitingApply, ['was_entry', 'was_finding']);
  assert.deepEqual(open.appliedLive, []);
  assert.equal(verdict(open, { strict: true }), 0);
  assert.match(report(open), /not applied live yet \(counted as before until it is\): was_entry, was_finding/);
  // Applied: live no longer has them anon-executable. Named for deletion; strict fails on it.
  const applied = diffLive([row('mine', true), row('known_open', true), row('was_finding', false), row('was_entry', false)], allow);
  assert.deepEqual(applied.unaccounted, []);
  assert.deepEqual(applied.awaitingApply, []);
  assert.deepEqual(applied.appliedLive, ['was_entry', 'was_finding']);
  assert.deepEqual(applied.stale, [], 'an applied fix is its own signal, not a stale entry');
  assert.equal(verdict(applied), 0);
  assert.equal(verdict(applied, { strict: true }), 1);
  assert.match(report(applied), /Applied live \(delete from fixedAfterCapture/);
  // Also listed as an entry is a mistake in the file.
  const dbl = diffLive([row('was_entry', true)], { ...allow, entries: { ...allow.entries, was_entry: { class: 'self-gated-auth-uid', note: 'x' } } });
  assert.deepEqual(dbl.doubleListed, ['was_entry']);
  assert.equal(verdict(dbl), 1);
});

test('allowListAsOfCapture: a fix dated after the capture is read as what the list said that day', () => {
  const allow = {
    entries: { kept: { class: 'self-gated-auth-uid', note: 'x' } },
    registeredFindings: [],
    registeredPinFindings: [],
    fixedAfterCapture: [
      { name: 'later_fix', fixedBy: '2026-12-01-fix.sql', wasFinding: { name: 'later_fix', kind: 'anon-executable-no-gate' } },
      { name: 'earlier_fix', fixedBy: '2026-01-01-fix.sql', wasEntry: { class: 'self-gated-auth-uid', note: 'x' } },
    ],
  };
  const fn = (n) => `create function public.${n}() returns int language sql security definer set search_path = public, pg_temp as $$ select 1 $$;`;
  const pre = M.replay([{ file: '2026-01-01-fix.sql', sql: fn('kept') + fn('later_fix') + fn('earlier_fix') }]);
  const { allow: asOf, restored } = allowListAsOfCapture(allow, pre);
  assert.deepEqual(restored, ['later_fix'], 'only the fix the capture predates is restored');
  assert.deepEqual(asOf.registeredFindings.map((f) => f.name), ['later_fix']);
  assert.ok(!Object.hasOwn(asOf.entries, 'earlier_fix'), 'a fix the capture already contains is not restored');
  assert.deepEqual(asOf.fixedAfterCapture.map((f) => f.name), ['earlier_fix'], 'and stays, for the live diff to call applied');
});

test('the CLI: the checked-in allow-list accepts the live capture, and rejects a new anon-executable definer', () => {
  const unpinned = new Set(LIVE.definersWithoutPgTemp);
  const rows = [
    ...LIVE.anonExecutable.map((proname) => row(proname, true, !unpinned.has(proname))),
    ...LIVE.notAnonExecutable.map((proname) => row(proname, false, !unpinned.has(proname))),
    ...LIVE.triggerDefiners.map((proname) => row(proname, false, !unpinned.has(proname), { is_trigger: true })),
  ];
  assert.equal(rows.filter((r) => r.is_trigger).length, 12, 'the fixture names the trigger definers too');
  const cli = (input, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: 'utf8', cwd: ROOT });
  const good = cli(JSON.stringify([{ rows }]));
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /138 SECURITY DEFINER functions in public \(plus 12 trigger functions, checked for the pin only\); 83 executable by anon: 79 allow-listed, 4 registered findings, 0 UNACCOUNTED/);
  const leak = cli(JSON.stringify([...rows, row('league_style_leak', true)]));
  assert.equal(leak.status, 1);
  assert.match(leak.stderr, /1 UNACCOUNTED/);
  assert.match(leak.stderr, /league_style_leak/);
  // The hole, end to end: an allow-listed, anon-executable name with a second signature that the
  // migrations do not hold. By name it is "accounted for"; it must fail.
  const hidden = LIVE.anonExecutable[0];
  const overloaded = cli(JSON.stringify([...rows.map((r) => (r.proname === hidden ? { ...r, identity_args: 'p_id uuid' } : r)), row(hidden, true, true, { identity_args: 'p_id uuid, p_other text' })]));
  assert.equal(overloaded.status, 1, 'an overload of an allow-listed name fails the run, end to end');
  assert.match(overloaded.stderr, new RegExp(`OVERLOADED[^]*${hidden}: \\(p_id uuid\\) \\[anon-executable\\] and \\(p_id uuid, p_other text\\) \\[anon-executable\\]`));
  assert.match(overloaded.stderr, /0 UNACCOUNTED/, 'and by name nothing is unaccounted, which is why it needs its own check');
  const loose = cli(JSON.stringify([...rows, row('an_unpinned_trigger', false, false, { is_trigger: true })]));
  assert.equal(loose.status, 1, 'an unpinned TRIGGER definer fails the run, end to end');
  assert.match(loose.stderr, /search_path does not end in pg_temp[^]*an_unpinned_trigger/);
  assert.doesNotMatch(loose.stderr, /UNACCOUNTED anon-executable/, 'and it is not reported as an anon exposure');
  assert.equal(cli('').status, 2);
  // --strict against the capture reads the allow-list AS OF the capture: an entry for a function no
  // pre-capture migration creates cannot be in it yet (allowListAsOfCapture). Nothing else is set aside.
  const asOf = allowListAsOfCapture(JSON.parse(fs.readFileSync(join(ROOT, 'tests/fixtures/definer-anon-allowlist.json'), 'utf8')), modelAsOfCapture(join(ROOT, 'supabase-migrations'), LIVE));
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'allow-as-of-'));
  try {
    const p = join(tmp, 'allow.json');
    fs.writeFileSync(p, JSON.stringify(asOf.allow));
    assert.equal(cli(JSON.stringify([{ rows }]), '--strict', '--allowlist', p).status, 0, 'the checked-in lists carry no stale entry against the live capture');
    if (asOf.pending.length) {
      const strictAll = cli(JSON.stringify([{ rows }]), '--strict');
      assert.equal(strictAll.status, 1, 'the whole list, post-capture entries included, is stale against an older capture');
      for (const name of asOf.pending) assert.match(strictAll.stdout + strictAll.stderr, new RegExp(name), `${name} is the stale one`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
