// scripts/mutate.mjs is the one mutation-test runner. Each rule in its header is a
// defect an ad-hoc runner shipped in this repo; each is driven here — the pure
// pieces directly, and the whole run end to end against a throwaway module in a
// temp directory, with the real `node --test` as the test command.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTap, planMutation, classify, normalizeSpec, installRestoreOnSignal, runMutations, withoutRepoEnv, REPO_ENV_KEYS } from '../scripts/mutate.mjs';

// ── pure pieces ───────────────────────────────────────────────────────────────

test('parseTap reads the suite\'s own summary and takes the LAST one', () => {
  assert.deepEqual(parseTap('ok 1 - a\n# tests 3\n# pass 3\n# fail 0\n'), { tests: 3, pass: 3, fail: 0 });
  assert.deepEqual(parseTap('# pass 1\n# fail 1\n…\n# tests 4\n# pass 4\n# fail 0\n'), { tests: 4, pass: 4, fail: 0 });
  assert.equal(parseTap('Error: Cannot find module\n'), null, 'no summary is null, never a pass');
  assert.equal(parseTap(''), null);
  assert.equal(parseTap('# passed 3\n# failed 0'), null, 'near-misses do not count');
});

test('planMutation requires the anchor exactly once and a real change', () => {
  assert.deepEqual(planMutation('a b c', 'b', 'B'), { ok: true, out: 'a B c' });
  assert.equal(planMutation('a b b', 'b', 'B').ok, false);
  assert.equal(planMutation('a b b', 'b', 'B').count, 2);
  assert.equal(planMutation('a b', 'z', 'B').count, 0);
  assert.match(planMutation('a b', 'b', 'b').reason, /identical/);
  assert.equal(planMutation('a b', '', 'B').ok, false);
  // `$&`-style tokens in the replacement are literal, not regex back-references.
  assert.equal(planMutation('x = 1', '1', '$& + $1').out, 'x = $& + $1');
});

test('classify: a red suite is a kill, a green one survives, no summary is a kill with no result', () => {
  assert.equal(classify({ pass: 3, fail: 1 }), 'killed');
  assert.equal(classify({ pass: 4, fail: 0 }), 'survived');
  assert.equal(classify(null), 'killed:no-result');
  assert.equal(classify({ pass: 0, fail: 0 }), 'killed:no-result', 'a suite that ran nothing proved nothing');
  assert.equal(classify({ pass: 4, fail: 0 }, true), 'no-op');
  assert.equal(classify({ pass: 3, fail: 1 }, true), 'unexpected-kill');
  assert.equal(classify(null, true), 'unexpected-kill');
});

test('normalizeSpec refuses the shapes that would run nothing or run the wrong thing', () => {
  const ok = { test: 'node --test x', mutations: [{ name: 'a', file: 'f', find: 'x', replace: 'y' }] };
  assert.equal(normalizeSpec(ok).mutations[0].expectSurvive, false);
  assert.throws(() => normalizeSpec({ ...ok, test: '' }), /spec.test/);
  assert.throws(() => normalizeSpec({ ...ok, mutations: [] }), /non-empty/);
  assert.throws(() => normalizeSpec({ ...ok, mutations: [{ name: 'a', file: 'f', find: 'x' }] }), /"replace" must be a string/);
  assert.throws(() => normalizeSpec({ ...ok, mutations: [ok.mutations[0], ok.mutations[0]] }), /unique/);
});

test('installRestoreOnSignal restores FIRST, then uninstalls itself and re-raises the signal', () => {
  const calls = [];
  const handlers = new Map();
  const proc = {
    pid: 4242,
    on: (s, h) => handlers.set(s, h),
    off: (s) => { calls.push(`off:${s}`); handlers.delete(s); },
    kill: (pid, sig) => calls.push(`kill:${pid}:${sig}`),
  };
  const uninstall = installRestoreOnSignal(() => calls.push('restore'), proc);
  assert.deepEqual([...handlers.keys()], ['SIGINT', 'SIGTERM', 'SIGHUP']);
  handlers.get('SIGTERM')('SIGTERM');
  assert.equal(calls[0], 'restore', 'the restore runs before anything else');
  assert.ok(calls.includes('kill:4242:SIGTERM'), 'the signal is re-raised so the default exit status holds');
  assert.equal(handlers.size, 0, 'handlers are removed so the re-raised signal is not caught again');
  // With an in-flight run to kill: abort FIRST (so the run stops touching the
  // tree), then restore, then the signal is re-raised.
  const order = [];
  const proc3 = { pid: 7, on: (s, h) => handlers.set(s, h), off: () => {}, kill: (p, s) => order.push(`kill:${s}`) };
  installRestoreOnSignal(() => order.push('restore'), proc3, { abort: (sig) => order.push(`abort:${sig}`) });
  handlers.get('SIGHUP')('SIGHUP');
  assert.deepEqual(order, ['abort:SIGHUP', 'restore', 'kill:SIGHUP']);
  // A restore that throws still re-raises (the finally), so a broken restore cannot swallow Ctrl-C.
  const calls2 = [];
  const proc2 = { pid: 1, on: (s, h) => handlers.set(s, h), off: () => {}, kill: (p, s) => calls2.push(s) };
  installRestoreOnSignal(() => { throw new Error('boom'); }, proc2);
  assert.throws(() => handlers.get('SIGINT')('SIGINT'), /boom/);
  assert.deepEqual(calls2, ['SIGINT']);
  uninstall();
});

// ── end to end, against a throwaway module with the real node --test ──────────

const LIB = `export function add(a, b) {
  if (a === undefined) return NaN; // never reached by the tests: a documented no-op
  return a + b;
}
export const LIMIT = 10;
`;
const LIB_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add, LIMIT } from './lib.mjs';
test('adds', () => { assert.equal(add(1, 2), 3); });
test('limit', () => { assert.equal(LIMIT, 10); });
`;

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-runner-'));
  fs.writeFileSync(path.join(dir, 'lib.mjs'), LIB);
  fs.writeFileSync(path.join(dir, 'lib.test.mjs'), LIB_TEST);
  return dir;
}
const SPEC = {
  test: 'node --test lib.test.mjs',
  mutations: [
    { name: 'add subtracts', file: 'lib.mjs', find: 'return a + b;', replace: 'return a - b;' },
    { name: 'limit moves', file: 'lib.mjs', find: 'LIMIT = 10', replace: 'LIMIT = 11' },
    { name: 'guard is dead code', file: 'lib.mjs', find: 'return NaN;', replace: 'return 0;', expectSurvive: true },
    { name: 'anchor absent', file: 'lib.mjs', find: 'return a * b;', replace: 'return 0;' },
    { name: 'anchor twice', file: 'lib.mjs', find: 'return', replace: 'RETURN' },
    { name: 'syntax error', file: 'lib.mjs', find: 'export const LIMIT', replace: 'export const const LIMIT' },
  ],
};

test('end to end: kills, a documented no-op, two skips, a crash — and the tree comes back byte for byte', async () => {
  const dir = scratch();
  const lines = [];
  const { results, summary } = await runMutations(SPEC, { root: dir, log: (l) => lines.push(l), allowDirty: true });
  const by = Object.fromEntries(results.map((r) => [r.name, r.verdict]));
  assert.equal(by['add subtracts'], 'killed');
  assert.equal(by['limit moves'], 'killed');
  assert.equal(by['guard is dead code'], 'no-op');
  assert.equal(by['anchor absent'], 'skipped');
  assert.equal(by['anchor twice'], 'skipped');
  assert.equal(by['syntax error'], 'killed', 'a module that no longer parses fails the suite, which is a kill');
  assert.equal(summary.killed, 3);
  assert.equal(summary.noop, 1);
  assert.equal(summary.skipped, 2);
  assert.equal(summary.survived, 0);
  assert.equal(summary.restoredOk, true);
  assert.deepEqual(summary.sanityAfter, { tests: 2, pass: 2, fail: 0 });
  assert.equal(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), LIB, 'the target is byte-identical after the round');
  assert.match(lines.find((l) => l.startsWith('SKIP') && l.includes('anchor twice')), /occurs 2 times/, 'a skip names the count; it is never relocated');
  assert.ok(lines.some((l) => l.startsWith('mutate: sanity before')));
});

test('a genuine guard gap is reported as SURVIVED, and --only narrows the round', async () => {
  const dir = scratch();
  // Drop the LIMIT test so a LIMIT mutation has nothing to catch it.
  fs.writeFileSync(path.join(dir, 'lib.test.mjs'), LIB_TEST.replace(/test\('limit'.*\n/, ''));
  const { results, summary } = await runMutations(SPEC, { root: dir, log: () => {}, allowDirty: true, only: 'limit' });
  assert.equal(results.length, 1);
  assert.equal(results[0].verdict, 'survived');
  assert.equal(summary.survived, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), LIB);
});

test('a documented no-op that starts getting KILLED is flagged, not silently counted as a kill', async () => {
  const dir = scratch();
  const spec = { ...SPEC, mutations: [{ name: 'now caught', file: 'lib.mjs', find: 'return a + b;', replace: 'return a - b;', expectSurvive: true }] };
  const { results, summary } = await runMutations(spec, { root: dir, log: () => {}, allowDirty: true });
  assert.equal(results[0].verdict, 'unexpected-kill');
  assert.equal(summary.unexpectedKill, 1);
});

test('sanity gate: a red baseline aborts BEFORE any mutation and touches no file', async () => {
  const dir = scratch();
  fs.writeFileSync(path.join(dir, 'lib.test.mjs'), LIB_TEST.replace('add(1, 2), 3', 'add(1, 2), 4'));
  const before = fs.statSync(path.join(dir, 'lib.mjs')).mtimeMs;
  // Assert on the parsed counts, not only the sentence: a run that produced NO
  // summary would throw the same sentence for a different reason.
  await assert.rejects(runMutations(SPEC, { root: dir, log: () => {}, allowDirty: true }), /sanity run is not green .*pass 1 \/ fail 1/);
  assert.equal(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), LIB);
  assert.equal(fs.statSync(path.join(dir, 'lib.mjs')).mtimeMs, before, 'the file was never written');
});

test('a test command that produces no summary at all is a red baseline, not a green one', async () => {
  const dir = scratch();
  const spec = { ...SPEC, test: 'node -e "console.log(1)"' };
  await assert.rejects(runMutations(spec, { root: dir, log: () => {}, allowDirty: true }), /no # pass\/# fail summary/);
});

test('the verdict is read from the summary, never from an exit status', async () => {
  // An exec that exits 0 but prints a red summary (the `| tail` trap) is still a kill.
  const dir = scratch();
  // Call 1 = sanity before (green), call 2 = the mutation (red), call 3 = sanity after (green).
  let calls = 0;
  const exec = () => (++calls === 2 ? '# tests 2\n# pass 1\n# fail 1\n' : '# tests 2\n# pass 2\n# fail 0\n');
  const spec = { ...SPEC, mutations: [SPEC.mutations[0]] };
  const { results } = await runMutations(spec, { root: dir, exec, log: () => {}, allowDirty: true });
  assert.equal(results[0].verdict, 'killed');
  assert.equal(calls, 3, 'sanity before, the mutation, sanity after — and nothing else');
});

test('a mutation is restored even when the test command throws mid-round', async () => {
  const dir = scratch();
  let n = 0;
  const exec = () => { n++; if (n === 2) throw new Error('runner died'); return '# tests 2\n# pass 2\n# fail 0\n'; };
  const spec = { ...SPEC, mutations: [SPEC.mutations[0]] };
  await assert.rejects(runMutations(spec, { root: dir, exec, log: () => {}, allowDirty: true }), /runner died/);
  assert.equal(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), LIB, 'the finally restored the file');
});

test('a missing target file is refused before anything runs', async () => {
  const dir = scratch();
  const spec = { ...SPEC, mutations: [{ ...SPEC.mutations[0], file: 'nope.mjs' }] };
  await assert.rejects(runMutations(spec, { root: dir, log: () => {}, allowDirty: true }), /does not exist/);
});

// A lib whose test HANGS once SPIN flips: the sanity run is green, the mutation
// turns the suite into a top-level await that never settles.
const SPIN_LIB = 'export const SPIN = false;\nexport const N = 1;\n';
const SPIN_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPIN, N } from './lib.mjs';
// ⚠ A never-settling promise alone does NOT hang: with nothing else on the event
// loop the process just exits (the file then fails as "no tests ran", i.e. a KILL).
// A pending timer is what makes the run genuinely hang until it is killed.
if (SPIN) await new Promise((r) => setTimeout(r, 120_000));
test('n', () => { assert.equal(N, 1); });
`;
function spinScratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-runner-spin-'));
  fs.writeFileSync(path.join(dir, 'lib.mjs'), SPIN_LIB);
  fs.writeFileSync(path.join(dir, 'lib.test.mjs'), SPIN_TEST);
  return dir;
}
const SPIN_SPEC = { test: 'node --test lib.test.mjs', timeoutMs: 1500, mutations: [
  { name: 'spin', file: 'lib.mjs', find: 'SPIN = false', replace: 'SPIN = true' },
  { name: 'n moves', file: 'lib.mjs', find: 'N = 1;', replace: 'N = 2;' },
] };

test('a run that outlives the timeout is killed and reported as TIMEOUT — never as a kill — and the round goes on', async () => {
  const dir = spinScratch();
  const lines = [];
  const t0 = Date.now();
  const { results, summary } = await runMutations(SPIN_SPEC, { root: dir, log: (l) => lines.push(l), allowDirty: true });
  const by = Object.fromEntries(results.map((r) => [r.name, r.verdict]));
  assert.equal(by.spin, 'timeout');
  assert.equal(by['n moves'], 'killed', 'the mutation after the hung one still ran');
  assert.equal(summary.timedOut, 1);
  assert.equal(summary.killed, 1, 'a timeout is not counted as a kill');
  assert.equal(summary.restoredOk, true);
  assert.equal(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), SPIN_LIB);
  assert.ok(Date.now() - t0 < 30_000, `the hung run was killed at the timeout (took ${Date.now() - t0} ms)`);
  assert.match(lines.find((l) => l.startsWith('TIMEOUT')), /hung past 1500 ms/);
});

test('a signal during a run kills the run first, restores the tree, and stops the round', async () => {
  const dir = scratch();
  const handlers = new Map();
  const killed = [];
  const proc = { pid: 99, on: (s, h) => handlers.set(s, h), off: (s) => handlers.delete(s), kill: (p, s) => killed.push(s) };
  let seenAbort = false;
  let runs = 0;
  let releaseFirst;
  const firstRunStarted = new Promise((r) => { releaseFirst = r; });
  // Sanity runs answer at once; the first MUTATION run stays in flight until the
  // signal aborts it (or 3 s pass, so a runner that never aborts cannot hang this test).
  const exec = (cmd, cwd, { signal }) => {
    runs++;
    if (runs !== 2) return '# tests 2\n# pass 2\n# fail 0\n';
    releaseFirst();
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(''), 3000);
      signal.addEventListener('abort', () => { seenAbort = true; clearTimeout(t); resolve({ output: '', timedOut: false }); }, { once: true });
    });
  };
  const round = runMutations(SPEC, { root: dir, exec, proc, log: () => {}, allowDirty: true });
  round.catch(() => {}); // asserted below; this keeps an early rejection from being unhandled
  await firstRunStarted;
  // The mutation is on disk while its run is in flight …
  assert.notEqual(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), LIB);
  handlers.get('SIGTERM')('SIGTERM');
  await assert.rejects(round, /interrupted by SIGTERM/);
  assert.equal(seenAbort, true, 'the in-flight run was aborted');
  assert.equal(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), LIB, '… and restored by the time the round rejects');
  assert.deepEqual(killed, ['SIGTERM'], 'the signal is re-raised once');
  assert.equal(runs, 2, 'no further mutation ran after the signal');
});

// ── a signal OUTSIDE the mutation loop ────────────────────────────────────────
// Every run is detached, so Ctrl-C reaches the runner and not the suite. The restore
// handler exists only while a mutation is on disk, which left the two sanity runs — the
// first starts before it is installed, the second after it is removed — able to end the
// runner and orphan a hung suite (CodeRabbit, #2188). Each gets an abort-only handler.

const GREEN = '# tests 2\n# pass 2\n# fail 0\n';
const ONE = { test: SPEC.test, mutations: [SPEC.mutations[0]] };
function fakeProc() {
  const handlers = new Map();
  const killed = [];
  return { handlers, killed, proc: { pid: 99, on: (s, h) => handlers.set(s, h), off: (s) => handlers.delete(s), kill: (p, s) => killed.push(s) } };
}
// An exec whose Nth call stays in flight until the runner aborts it (or 3 s pass, so a
// runner that never aborts cannot hang the test); every other call answers green at once.
function hangingExec(nth, onStart) {
  const seen = { calls: 0, aborted: false };
  const exec = (cmd, cwd, { signal }) => {
    seen.calls++;
    if (seen.calls !== nth) return GREEN;
    onStart();
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(''), 3000);
      signal.addEventListener('abort', () => { seen.aborted = true; clearTimeout(t); resolve({ output: '', timedOut: false }); }, { once: true });
    });
  };
  return { exec, seen };
}

test('a signal during the SANITY run before the round kills that run and stops with nothing mutated', async () => {
  const dir = scratch();
  const { handlers, killed, proc } = fakeProc();
  let started;
  const inFlight = new Promise((r) => { started = r; });
  const { exec, seen } = hangingExec(1, started);
  const round = runMutations(ONE, { root: dir, exec, proc, log: () => {}, allowDirty: true });
  round.catch(() => {}); // asserted below; keeps an early rejection from being unhandled
  await inFlight;
  assert.equal(typeof handlers.get('SIGINT'), 'function', 'a handler is installed while the first sanity run is in flight');
  handlers.get('SIGINT')('SIGINT');
  await assert.rejects(round, /interrupted by SIGINT during the sanity run — nothing was mutated/);
  assert.equal(seen.aborted, true, 'the in-flight sanity run was aborted');
  assert.deepEqual(killed, ['SIGINT'], 'the signal is re-raised once');
  assert.equal(seen.calls, 1, 'no mutation ran');
  assert.equal(handlers.size, 0, 'no handler is left behind');
  assert.equal(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), LIB);
});

test('a signal during the FINAL sanity run kills that run too — the tree was already restored', async () => {
  const dir = scratch();
  const { handlers, killed, proc } = fakeProc();
  let started;
  const inFlight = new Promise((r) => { started = r; });
  const { exec, seen } = hangingExec(3, started); // 1 sanity before · 2 the mutation · 3 sanity after
  const round = runMutations(ONE, { root: dir, exec, proc, log: () => {}, allowDirty: true });
  round.catch(() => {});
  await inFlight;
  assert.equal(typeof handlers.get('SIGTERM'), 'function', 'a handler is installed while the final sanity run is in flight');
  handlers.get('SIGTERM')('SIGTERM');
  await assert.rejects(round, /interrupted by SIGTERM during the final sanity run — the tree was already restored/);
  assert.equal(seen.aborted, true, 'the in-flight sanity run was aborted');
  assert.deepEqual(killed, ['SIGTERM'], 'the signal is re-raised once');
  assert.equal(seen.calls, 3);
  assert.equal(handlers.size, 0, 'no handler is left behind');
  assert.equal(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), LIB, 'the target is byte-identical');
});

test('no signal handler outlives the round — finished, or refused on a red baseline', async () => {
  const dir = scratch();
  const a = fakeProc();
  const seenDuring = [];
  const exec = () => { seenDuring.push(a.handlers.size); return GREEN; };
  await runMutations(ONE, { root: dir, exec, proc: a.proc, log: () => {}, allowDirty: true });
  assert.deepEqual(seenDuring, [3, 3, 3], 'every run — both sanity runs and the mutation run — has a handler installed');
  assert.equal(a.handlers.size, 0, 'a finished round leaves none behind');
  const b = fakeProc();
  await assert.rejects(runMutations(ONE, { root: dir, exec: () => '# tests 1\n# pass 0\n# fail 1\n', proc: b.proc, log: () => {}, allowDirty: true }), /sanity run is not green/);
  assert.equal(b.handlers.size, 0, 'a refused round leaves none behind');
});

test('a restore that fails on one file still restores every other target, and the error names the one that failed', async () => {
  const dir = scratch();
  fs.writeFileSync(path.join(dir, 'other.mjs'), 'export const X = 1;\n');
  const spec = {
    test: SPEC.test,
    mutations: [
      { name: 'first', file: 'lib.mjs', find: 'LIMIT = 10', replace: 'LIMIT = 11' },
      { name: 'second', file: 'other.mjs', find: 'X = 1', replace: 'X = 2' },
    ],
  };
  // Run 1 is the sanity run, 2 the first mutation, 3 the second: while the SECOND file is
  // mutated, the FIRST becomes a directory, so writing it back fails (EISDIR, even as root).
  let calls = 0;
  const exec = () => {
    calls++;
    if (calls === 3) { fs.rmSync(path.join(dir, 'lib.mjs')); fs.mkdirSync(path.join(dir, 'lib.mjs')); }
    return GREEN;
  };
  await assert.rejects(
    runMutations(spec, { root: dir, exec, proc: fakeProc().proc, log: () => {}, allowDirty: true }),
    (e) => /restore failed for 1 file\(s\)/.test(e.message) && /lib\.mjs: EISDIR/.test(e.message) && !/other\.mjs:/.test(e.message),
  );
  assert.equal(fs.readFileSync(path.join(dir, 'other.mjs'), 'utf8'), 'export const X = 1;\n', 'the mutated file after the broken one was still restored');
});

// ── the CLI path: loadSpec, exit codes, the dirty-tree refusal ────────────────

import { execSync, spawn } from 'node:child_process';
const CLI = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'mutate.mjs');

function cli(args, cwd) {
  try {
    return { code: 0, out: execSync(`node ${JSON.stringify(CLI)} ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

test('CLI: a .mjs spec and a .json spec both run; exit 0 with survivors reported, 1 under --fail-on-survivor, 2 on a bad spec', async () => {
  const dir = scratch();
  const one = { test: SPEC.test, mutations: [SPEC.mutations[0]] };
  fs.writeFileSync(path.join(dir, 'spec.mjs'), `export default ${JSON.stringify(one)};\n`);
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(one));
  let r = cli('--spec spec.mjs --allow-dirty', dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /KILLED\s+add subtracts/);
  r = cli('--spec spec.json --allow-dirty', dir);
  assert.equal(r.code, 0, r.out);

  // A survivor: exit 0 by default (reported), 1 under --fail-on-survivor.
  fs.writeFileSync(path.join(dir, 'lib.test.mjs'), LIB_TEST.replace(/test\('limit'.*\n/, ''));
  const surv = { test: SPEC.test, mutations: [SPEC.mutations[1]] };
  fs.writeFileSync(path.join(dir, 'surv.json'), JSON.stringify(surv));
  r = cli('--spec surv.json --allow-dirty', dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /survivors \(1\)/);
  r = cli('--spec surv.json --allow-dirty --fail-on-survivor', dir);
  assert.equal(r.code, 1, r.out);

  assert.equal(cli('--spec missing.json', dir).code, 2);
  // --timeout: a bad value is a usage error; a hung run is reported and, under
  // --fail-on-survivor, is not a clean round.
  assert.equal(cli('--spec spec.json --allow-dirty --timeout nope', dir).code, 2);
  const sdir = spinScratch();
  fs.writeFileSync(path.join(sdir, 'spin.json'), JSON.stringify({ test: SPIN_SPEC.test, mutations: [SPIN_SPEC.mutations[0]] }));
  r = cli('--spec spin.json --allow-dirty --timeout 1500', sdir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /TIMEOUT\s+spin/);
  assert.match(r.out, /TIMED OUT/);
  assert.equal(cli('--spec spin.json --allow-dirty --timeout 1500 --fail-on-survivor', sdir).code, 1);
  assert.equal(cli('', dir).code, 2, 'no --spec is a usage error');
  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ test: 'x' }));
  r = cli('--spec bad.json --allow-dirty', dir);
  assert.equal(r.code, 2);
  assert.match(r.out, /non-empty array/);
});

test('CLI: refuses a dirty target file in a git checkout unless --allow-dirty', async () => {
  const dir = scratch();
  // Without the repo-locating variables: run under a pre-commit hook they would point this
  // throwaway `git init` at the real repository (see REPO_ENV_KEYS in the runner).
  const git = (c) => execSync(`git -c user.email=t@t -c user.name=t ${c}`, { cwd: dir, env: withoutRepoEnv(), stdio: 'ignore' });
  git('init -q');
  git('add .');
  git('commit -qm init');
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({ test: SPEC.test, mutations: [SPEC.mutations[0]] }));
  // Clean tree: runs without the flag.
  assert.equal(cli('--spec spec.json', dir).code, 0);
  // Dirty target: refused, and the uncommitted edit is left exactly as it was.
  fs.appendFileSync(path.join(dir, 'lib.mjs'), '// local edit\n');
  const r = cli('--spec spec.json', dir);
  assert.equal(r.code, 2);
  assert.match(r.out, /dirty tree/);
  assert.ok(fs.readFileSync(path.join(dir, 'lib.mjs'), 'utf8').endsWith('// local edit\n'));
  assert.equal(cli('--spec spec.json --allow-dirty', dir).code, 0);
});

test('the runner finds its repository from cwd, not from GIT_* inherited from a hook', async () => {
  // The pure rule.
  assert.deepEqual(Object.keys(withoutRepoEnv({ GIT_DIR: '/x', GIT_INDEX_FILE: '/y', GIT_COMMON_DIR: '/z', PATH: '/bin', GIT_AUTHOR_NAME: 'a' })).sort(), ['GIT_AUTHOR_NAME', 'PATH'],
    'the repo-locating variables go; identity and everything else stays');
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) assert.ok(REPO_ENV_KEYS.includes(k), `${k} must be stripped`);
  // End to end: the way a hook exports it. The dirty-tree refusal must still see the
  // SCRATCH repo (and refuse), not the decoy GIT_DIR points at.
  const dir = scratch();
  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-decoy-'));
  execSync('git init -q --bare', { cwd: decoy, env: withoutRepoEnv(), stdio: 'ignore' });
  const clean = withoutRepoEnv();
  const git = (c) => execSync(`git -c user.email=t@t -c user.name=t ${c}`, { cwd: dir, env: clean, stdio: 'ignore' });
  git('init -q'); git('add .'); git('commit -qm init');
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({ test: SPEC.test, mutations: [SPEC.mutations[0]] }));
  fs.appendFileSync(path.join(dir, 'lib.mjs'), '// local edit\n');
  let r;
  try { r = { code: 0, out: execSync(`node ${JSON.stringify(CLI)} --spec spec.json`, { cwd: dir, env: { ...clean, GIT_DIR: decoy }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { r = { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` }; }
  assert.equal(r.code, 2, `the dirty scratch repo must be refused even with GIT_DIR pointing elsewhere; got ${r.code}: ${r.out}`);
  assert.match(r.out, /dirty tree/);
  // And the decoy was never touched.
  assert.equal(execSync('git rev-parse --is-bare-repository', { cwd: decoy, env: clean, encoding: 'utf8' }).trim(), 'true');
});

test('the spawned test command runs without the hook\'s repo-locating GIT_* variables', () => {
  const dir = scratch();
  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-decoy-'));
  // A "suite" that reports green only when GIT_DIR is absent from its environment.
  const probe = `node -e "const ok=!process.env.GIT_DIR&&!process.env.GIT_INDEX_FILE;console.log('# tests 1\\n# pass '+(ok?1:0)+'\\n# fail '+(ok?0:1))"`;
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({ test: probe, mutations: [SPEC.mutations[0]] }));
  let r;
  try { r = { code: 0, out: execSync(`node ${JSON.stringify(CLI)} --spec spec.json --allow-dirty`, { cwd: dir, env: { ...withoutRepoEnv(), GIT_DIR: decoy, GIT_INDEX_FILE: path.join(decoy, 'index') }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { r = { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` }; }
  assert.equal(r.code, 0, `the suite saw a leaked GIT_DIR (sanity before failed): ${r.out}`);
  assert.match(r.out, /sanity before — pass 1 \/ fail 0/);
});

// ── a real signal against a real detached suite ───────────────────────────────

const alive = (pid) => {
  try { process.kill(pid, 0); } catch { return false; }
  // A killed process nobody has reaped yet is a zombie: gone for our purposes.
  try { return !/^\d+ \(.*\) [ZX]/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; }
};
const until = async (cond, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return cond();
};

test('a real SIGINT during the first sanity run kills the detached suite instead of orphaning it', async () => {
  const dir = scratch();
  const pidFile = path.join(dir, 'suite.pid');
  // The "suite": records its pid, then never finishes — a wedged test file.
  fs.writeFileSync(path.join(dir, 'hang.mjs'), `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`);
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({ test: 'node hang.mjs', mutations: [SPEC.mutations[0]] }));
  const runner = spawn(process.execPath, [CLI, '--spec', 'spec.json', '--allow-dirty'], { cwd: dir, env: withoutRepoEnv(), stdio: 'ignore' });
  let pid = 0;
  try {
    assert.ok(await until(() => fs.existsSync(pidFile) && (pid = Number(fs.readFileSync(pidFile, 'utf8'))) > 0, 15_000), 'the suite started');
    assert.ok(alive(pid), 'the suite is running');
    const exited = new Promise((resolve) => runner.once('exit', (code, signal) => resolve({ code, signal })));
    runner.kill('SIGINT');
    const ended = await Promise.race([exited, new Promise((r) => setTimeout(() => r(null), 15_000))]);
    assert.ok(ended, 'the runner exited after SIGINT');
    assert.equal(ended.signal, 'SIGINT', 'the signal is re-raised, so the exit status is the signal\'s');
    assert.ok(await until(() => !alive(pid), 5_000), 'the detached suite died with the runner instead of running on, orphaned');
  } finally {
    if (pid && alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    try { runner.kill('SIGKILL'); } catch { /* gone */ }
  }
});
