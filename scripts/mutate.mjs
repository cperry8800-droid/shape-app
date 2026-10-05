#!/usr/bin/env node
// The one mutation-test runner. Breaks the code on purpose, one edit at a time,
// and reports whether the named test command noticed.
//
// Why a checked-in runner: the changelog records every PR writing its own
// throwaway runner, and the same runner defects recurring — a restore that was
// not in a `finally` (a deliberate defect left in the tree, later read as the
// code being broken); a runner that snapshotted an ALREADY-MUTATED file as its
// clean baseline; a mutation whose anchor did not occur and was silently applied
// to a nearby match, reporting a kill for an edit that never landed; and a
// "did the suite fail" read off a PIPELINE's exit status (`npm test | tail`
// reports `tail`'s status, so every mutation "survived"). Each of those is a
// rule here, and tests/mutate-runner.test.mjs drives each one.
//
// Rules:
//   1. Sanity FIRST: the test command must be green on the untouched tree before
//      a single byte moves, or the run aborts — a broken tree can never become a
//      baseline. Sanity again AFTER the last restore.
//   2. Snapshot every target file as BYTES before anything, and restore from the
//      snapshot after each mutation, in a `finally`, and on SIGINT/SIGTERM/SIGHUP.
//      Every restore is verified byte for byte; a mismatch is a harness failure.
//      ⚠ The test command runs ASYNCHRONOUSLY (spawn, not execSync): a signal
//      handler can only fire when the event loop is free, so a synchronous run
//      made Ctrl-C during a test run a no-op — the mutated file stayed on disk
//      until the run ended, which for a hung run was never. On a signal the
//      in-flight run is killed FIRST (its whole process group), then the tree is
//      restored, then the signal is re-raised. The two SANITY runs have nothing to
//      restore, but they are detached too, so they get the same handler in its
//      abort-only form — otherwise a signal that ends the runner leaves a hung suite
//      running with no parent (CodeRabbit, #2188).
//   3. An anchor must occur EXACTLY once in the file, or the mutation is reported
//      as SKIP with the count — never relocated, never applied to the first match.
//   4. A mutation must be proven to have LANDED (the bytes on disk equal the
//      intended text) before its test run counts.
//   5. The verdict is read from the suite's OWN `# pass` / `# fail` summary. A run
//      that produces no summary at all (a crash, a syntax error that stops the
//      runner) is reported as KILLED (no result) — it is not a pass.
//   6. A spec may mark a mutation `expectSurvive: true` for a PROVEN no-op; it is
//      then reported as NO-OP rather than as a survivor, and a kill on it is
//      flagged, because the no-op has stopped being one.
//   7. Every test run has a TIMEOUT (default 15 min; `timeoutMs` in the spec or
//      `--timeout <ms>`). A run that outlives it is killed and the mutation is
//      reported as TIMEOUT — not as a kill: a suite that HANGS under a mutation
//      has not noticed it, it has stopped answering, and that is a harness defect
//      to fix. Measured 2026-09-30: the extraction spec's import-cycle mutation
//      turned the mount harness into an unbounded recursion, and without a
//      timeout the round sat there until it was killed by hand.
//
// Usage:
//   node scripts/mutate.mjs --spec <file>            # a .mjs (default export) or .json spec
//   node scripts/mutate.mjs --spec <file> --only <substring-of-name>
//   node scripts/mutate.mjs --spec <file> --allow-dirty     # skip the git dirty-tree refusal
//   node scripts/mutate.mjs --spec <file> --fail-on-survivor    # a survivor OR a timeout exits 1
//   node scripts/mutate.mjs --spec <file> --fail-on-skipped     # any skipped mutation exits 1
//   node scripts/mutate.mjs --spec <file> --timeout 600000      # per-run timeout in ms
//
// Spec shape:
//   export default {
//     test: 'node --test tests/foo.test.mjs',   // the command whose # pass/# fail is read
//     timeoutMs: 900000,                        // optional per-run timeout (default 15 min)
//     mutations: [
//       { name: 'drop the guard', file: 'src/foo.mjs', find: 'if (!x) return;', replace: '' },
//       { name: 'a proven no-op', file: 'src/foo.mjs', find: '…', replace: '…', expectSurvive: true },
//     ],
//   };
//
// Exit codes: 0 done (survivors are reported, not fatal, unless --fail-on-survivor
// gives 1; skips likewise, unless --fail-on-skipped gives 1 — the two flags are
// independent and combine); 2 harness failure (sanity red, a mutation that did not
// land, a restore that did not verify, an unreadable spec).

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// ── Pure pieces (tested directly) ─────────────────────────────────────────────

/** Read node:test's own summary. Takes the LAST `# pass`/`# fail` pair, or null. */
export function parseTap(output) {
  const s = String(output || '');
  const last = (re) => { let m, r = null; while ((m = re.exec(s))) r = Number(m[1]); return r; };
  const pass = last(/^# pass (\d+)\s*$/gm);
  const fail = last(/^# fail (\d+)\s*$/gm);
  const tests = last(/^# tests (\d+)\s*$/gm);
  if (pass == null || fail == null) return null;
  return { tests: tests ?? pass + fail, pass, fail };
}

/** Apply one exact-string mutation. The anchor must occur exactly once. */
export function planMutation(src, find, replace) {
  if (typeof find !== 'string' || !find.length) return { ok: false, count: 0, reason: 'empty anchor' };
  const count = src.split(find).length - 1;
  if (count !== 1) return { ok: false, count, reason: `anchor occurs ${count} times` };
  if (typeof replace !== 'string') return { ok: false, count, reason: 'replace must be a string' };
  const out = src.replace(find, () => replace);
  if (out === src) return { ok: false, count, reason: 'replacement is identical to the anchor' };
  return { ok: true, out };
}

/** Verdict for one mutation from the parsed summary (or null = no summary). */
export function classify(tap, expectSurvive = false) {
  if (tap == null) return expectSurvive ? 'unexpected-kill' : 'killed:no-result';
  if (tap.fail > 0) return expectSurvive ? 'unexpected-kill' : 'killed';
  if (tap.pass >= 1) return expectSurvive ? 'no-op' : 'survived';
  return expectSurvive ? 'unexpected-kill' : 'killed:no-result'; // pass 0, fail 0: nothing ran
}

/** Validate a spec's shape; returns the normalized spec or throws. */
export function normalizeSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('spec must be an object');
  if (typeof spec.test !== 'string' || !spec.test.trim()) throw new Error('spec.test must be the test command');
  if (!Array.isArray(spec.mutations) || spec.mutations.length === 0) throw new Error('spec.mutations must be a non-empty array');
  const seen = new Set();
  const mutations = spec.mutations.map((m, i) => {
    if (!m || typeof m !== 'object') throw new Error(`mutation ${i}: not an object`);
    for (const k of ['name', 'file', 'find', 'replace']) {
      if (typeof m[k] !== 'string') throw new Error(`mutation ${i} (${m.name ?? '?'}): "${k}" must be a string`);
    }
    if (seen.has(m.name)) throw new Error(`mutation names must be unique: "${m.name}"`);
    seen.add(m.name);
    return { name: m.name, file: m.file, find: m.find, replace: m.replace, expectSurvive: m.expectSurvive === true };
  });
  let timeoutMs = null;
  if (spec.timeoutMs !== undefined) {
    if (!Number.isFinite(spec.timeoutMs) || spec.timeoutMs <= 0) throw new Error('spec.timeoutMs must be a positive number of milliseconds');
    timeoutMs = spec.timeoutMs;
  }
  return { test: spec.test, mutations, timeoutMs };
}

/**
 * Register restore-on-signal handlers. `proc` is injectable so a test can drive
 * the handler without sending itself a signal. `abort(sig)`, when given, is
 * called BEFORE the restore: it kills the in-flight test run, so the run cannot
 * go on reading (or, for a suite that writes, writing) the tree the restore is
 * about to put back. Returns an uninstall function.
 */
export function installRestoreOnSignal(restore, proc = process, { abort = null } = {}) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handler = (sig) => {
    try {
      if (abort) abort(sig);
      restore();
    } finally {
      for (const s of signals) proc.off(s, handler);
      proc.kill(proc.pid, sig);
    }
  };
  for (const s of signals) proc.on(s, handler);
  return () => { for (const s of signals) proc.off(s, handler); };
}

// ── The run ───────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15 * 60_000;

// Kill a spawned command and everything it started. The command runs under
// `sh -c` in its OWN process group (detached), so killing the group reaches the
// `node --test` behind the shell and the worker per test file behind that —
// killing the shell alone leaves the grandchildren running, and their stdio
// pipes keep this runner waiting on 'close' forever.
function killTree(child) {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
}

// ⚠ The variables that tell git WHICH repository to act on. A pre-commit hook runs
// with GIT_DIR / GIT_INDEX_FILE (and, in a linked worktree, GIT_COMMON_DIR) exported,
// and a child that inherits them acts on the COMMITTING repository whatever its cwd:
// the runner's own e2e test did a throwaway `git init && git add . && git commit` and
// it landed in the real repo — a stray "init" commit on the worktree's branch, and
// `git init` under a GIT_DIR with no work tree flips core.bare to true, after which the
// main checkout answers "this operation must be run in a work tree". The runner's git
// call and every command it spawns run without them; a repo is found from cwd alone.
export const REPO_ENV_KEYS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE'];
export function withoutRepoEnv(env = process.env) {
  const out = { ...env };
  for (const k of REPO_ENV_KEYS) delete out[k];
  return out;
}

function defaultExec(cmd, cwd, { timeoutMs = DEFAULT_TIMEOUT_MS, signal = null } = {}) {
  // ⚠ Strip NODE_TEST_* from the child's environment. When this runner is itself
  // started from inside `node --test` (its own e2e test does exactly that), the
  // parent sets NODE_TEST_CONTEXT, and a nested `node --test` that inherits it
  // reports to the parent over a pipe instead of printing its TAP summary — so
  // parseTap sees nothing and every mutation reads as "no result". Measured:
  // the same command prints `# pass 1` from a shell and nothing under the parent.
  const env = withoutRepoEnv();
  for (const k of Object.keys(env)) if (k.startsWith('NODE_TEST_')) delete env[k];
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, env, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false, done = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs) : null;
    const onAbort = () => killTree(child);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      // A red suite exits non-zero; its stdout still carries the summary.
      resolve({ output: `${out}\n${err}`, timedOut });
    };
    child.on('error', (e) => { err += `\n${e.message}`; finish(); });
    child.on('close', finish);
  });
}

function gitDirty(root, files) {
  try {
    const out = execSync(`git status --porcelain -- ${files.map((f) => JSON.stringify(f)).join(' ')}`, { cwd: root, env: withoutRepoEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return null; // not a git checkout — nothing to refuse on
  }
}

/**
 * Run every mutation in `spec` against the tree at `root`.
 * Options: exec(cmd, cwd, { timeoutMs, signal }) → output string or
 * { output, timedOut } (injectable, sync or async), log(line), only, allowDirty,
 * proc, timeoutMs (overrides the spec's).
 */
export async function runMutations(spec, { root = process.cwd(), exec = defaultExec, log = console.log, only = null, allowDirty = false, proc = process, timeoutMs = null } = {}) {
  spec = normalizeSpec(spec);
  const runTimeout = timeoutMs ?? spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const mutations = only ? spec.mutations.filter((m) => m.name.includes(only)) : spec.mutations;
  if (mutations.length === 0) throw new Error(`--only "${only}" matched no mutation`);

  const files = [...new Set(mutations.map((m) => m.file))];
  for (const f of files) {
    const p = path.resolve(root, f);
    if (!fs.existsSync(p)) throw new Error(`target file does not exist: ${f}`);
  }
  if (!allowDirty) {
    const dirty = gitDirty(root, files);
    if (dirty && dirty.length) {
      throw new Error(`refusing to start on a dirty tree — uncommitted changes in a target file would be snapshotted as the baseline:\n  ${dirty.join('\n  ')}\n(pass --allow-dirty to override)`);
    }
  }

  // One AbortController for the whole round: the signal handler aborts it, which
  // kills whatever run is in flight (defaultExec listens on it), and `interrupted`
  // stops the loop from starting the next mutation on a tree that is being
  // restored under it.
  const controller = new AbortController();
  let interrupted = null;
  const abort = (sig) => { interrupted = sig; controller.abort(); };
  const runTest = async () => {
    const r = await exec(spec.test, root, { timeoutMs: runTimeout, signal: controller.signal });
    const output = typeof r === 'string' ? r : (r && r.output) || '';
    return { tap: parseTap(output), timedOut: Boolean(r && typeof r === 'object' && r.timedOut) };
  };
  // ⚠ Every run is DETACHED (its own process group), so Ctrl-C in a terminal reaches this
  // process and NOT the run: a signal that ends the runner leaves the suite orphaned, and
  // for a hung suite that is forever. The restore handler only exists while a mutation is
  // on disk, so the two SANITY runs — the first starts before it is installed, the second
  // after it is removed — were the gap (CodeRabbit, #2188). Outside the mutation loop there is
  // nothing to restore, so they get the abort-only form: kill the in-flight run, re-raise.
  const runGuarded = async () => {
    const uninstallAbortOnly = installRestoreOnSignal(() => {}, proc, { abort });
    try { return await runTest(); } finally { uninstallAbortOnly(); }
  };
  // Rule 1: sanity BEFORE the snapshot, so a broken tree cannot become a baseline.
  const { tap: before, timedOut: beforeTimedOut } = await runGuarded();
  // An interrupted run has no summary; report the interrupt, not "the tree is not green".
  if (interrupted) throw new Error(`interrupted by ${interrupted} during the sanity run — nothing was mutated`);
  if (beforeTimedOut) throw new Error(`sanity run on the untouched tree did not finish inside ${runTimeout} ms — the suite hangs before any mutation; fix the tree first`);
  if (!before || before.fail > 0 || before.pass < 1) {
    throw new Error(`sanity run is not green on the untouched tree (${before ? `pass ${before.pass} / fail ${before.fail}` : 'no # pass/# fail summary'}) — fix the tree first; nothing was mutated`);
  }
  log(`mutate: sanity before — pass ${before.pass} / fail ${before.fail}`);

  // Rule 2: snapshot bytes.
  const snap = new Map(files.map((f) => [f, fs.readFileSync(path.resolve(root, f))]));
  const restoreAll = () => {
    // Attempt EVERY file before failing: the mutated one can sit after a file that will
    // not restore, and stopping at the first error would leave it mutated on disk while
    // the error names only the other file (CodeRabbit, #2188).
    const failures = [];
    for (const [f, buf] of snap) {
      try {
        const p = path.resolve(root, f);
        fs.writeFileSync(p, buf);
        if (Buffer.compare(fs.readFileSync(p), buf) !== 0) throw new Error('did not verify byte for byte');
      } catch (e) {
        failures.push(`${f}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (failures.length) throw new Error(`restore failed for ${failures.length} file(s) — every other target was still restored; inspect \`git status\` before doing anything else:\n  ${failures.join('\n  ')}`);
  };
  const uninstall = installRestoreOnSignal(restoreAll, proc, { abort });

  const results = [];
  try {
    for (const m of mutations) {
      const p = path.resolve(root, m.file);
      const src = snap.get(m.file).toString('utf8');
      const plan = planMutation(src, m.find, m.replace);
      if (!plan.ok) {
        results.push({ ...m, verdict: 'skipped', detail: plan.reason });
        log(`SKIP      ${m.name} — ${plan.reason}`);
        continue;
      }
      // ONE restore point: the write, the landed check and the run all sit inside
      // this try, so whatever throws after the first byte moves is followed by a
      // restore. (An outer belt-and-braces restore was removed on purpose — two
      // layers each cover the other, so neither can be proven by a mutation.)
      let run;
      try {
        fs.writeFileSync(p, plan.out);
        // Rule 4: prove it landed.
        if (fs.readFileSync(p, 'utf8') !== plan.out) throw new Error(`mutation "${m.name}" did not land on disk`);
        run = await runTest();
      } finally {
        restoreAll();
      }
      // A signal arrived during that run: the handler has killed it and restored
      // the tree (the finally above restored it again, harmlessly). Do not start
      // the next mutation — the process is about to exit on the re-raised signal,
      // and a fake `proc` in a test must see the round stop the same way.
      if (interrupted) throw new Error(`interrupted by ${interrupted} — the tree was restored; the round did not finish`);
      const { tap } = run;
      // Rule 7: a run that had to be killed is not a verdict either way.
      const verdict = run.timedOut ? 'timeout' : classify(tap, m.expectSurvive);
      const detail = run.timedOut ? `hung past ${runTimeout} ms and was killed` : tap ? `pass ${tap.pass} / fail ${tap.fail}` : 'no summary (crash?)';
      results.push({ ...m, verdict, detail, tap });
      const label = { killed: 'KILLED   ', 'killed:no-result': 'KILLED   ', survived: 'SURVIVED ', 'no-op': 'NO-OP    ', 'unexpected-kill': 'UNEXPECTED KILL', timeout: 'TIMEOUT  ' }[verdict];
      log(`${label} ${m.name}  (${detail}${verdict === 'killed:no-result' ? ', no result' : ''}${verdict === 'no-op' ? ', expected' : ''}${verdict === 'timeout' ? ' — a suite that hangs has not noticed the mutation; fix the harness' : ''})`);
    }
  } finally {
    uninstall();
  }

  const { tap: after, timedOut: afterTimedOut } = await runGuarded();
  if (interrupted) throw new Error(`interrupted by ${interrupted} during the final sanity run — the tree was already restored; the round did not finish`);
  const restoredOk = files.every((f) => Buffer.compare(fs.readFileSync(path.resolve(root, f)), snap.get(f)) === 0);
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const summary = {
    total: results.length,
    killed: count('killed') + count('killed:no-result'),
    survived: count('survived'),
    noop: count('no-op'),
    unexpectedKill: count('unexpected-kill'),
    timedOut: count('timeout'),
    skipped: count('skipped'),
    restoredOk,
    sanityAfter: after,
  };
  log(`mutate: killed ${summary.killed} · survived ${summary.survived} · no-op ${summary.noop} · unexpected kills ${summary.unexpectedKill} · timed out ${summary.timedOut} · skipped ${summary.skipped} · restored byte-identical: ${restoredOk} · sanity after: ${after ? `pass ${after.pass} / fail ${after.fail}` : afterTimedOut ? 'HUNG' : 'NO SUMMARY'}`);
  if (!restoredOk) throw new Error('the tree is not byte-identical after the run — inspect `git status` before doing anything else');
  if (afterTimedOut) throw new Error(`sanity run after the round did not finish inside ${runTimeout} ms — the restored tree hangs; inspect \`git status\` before doing anything else`);
  if (!after || after.fail > 0) throw new Error('sanity run after the round is not green — the restore left the tree different from the baseline');
  return { results, summary };
}

export async function loadSpec(specPath) {
  const abs = path.resolve(specPath);
  if (abs.endsWith('.json')) return JSON.parse(fs.readFileSync(abs, 'utf8'));
  const mod = await import(pathToFileURL(abs).href);
  return mod.default ?? mod.spec ?? mod;
}

export async function main(argv = process.argv.slice(2)) {
  const arg = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const specPath = arg('--spec');
  if (!specPath) { console.error('usage: node scripts/mutate.mjs --spec <file> [--only <name>] [--allow-dirty] [--fail-on-survivor] [--fail-on-skipped] [--timeout <ms>]'); return 2; }
  let timeoutMs = null;
  if (arg('--timeout') != null) {
    timeoutMs = Number(arg('--timeout'));
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) { console.error('mutate: --timeout must be a positive number of milliseconds'); return 2; }
  }
  let spec;
  try { spec = await loadSpec(specPath); } catch (e) { console.error(`mutate: cannot load spec ${specPath}: ${e.message}`); return 2; }
  try {
    const { summary, results } = await runMutations(spec, { only: arg('--only'), allowDirty: argv.includes('--allow-dirty'), timeoutMs });
    const survivors = results.filter((r) => r.verdict === 'survived');
    if (survivors.length) {
      console.log(`\nsurvivors (${survivors.length}) — each is a guard gap or a no-op; if a no-op, prove it and mark it expectSurvive:`);
      for (const s of survivors) console.log(`  · ${s.name}  [${s.file}]`);
    }
    if (summary.unexpectedKill) {
      console.log(`\n${summary.unexpectedKill} mutation(s) marked expectSurvive were KILLED — the documented no-op is no longer a no-op; re-read it.`);
    }
    if (summary.timedOut) {
      console.log(`\n${summary.timedOut} mutation(s) TIMED OUT — the suite hung instead of failing; a guard that hangs is a harness defect, not a kill.`);
    }
    if (summary.skipped) {
      // Each skip carries planMutation's own reason: an anchor that does not occur exactly
      // once, an empty anchor, or a replacement identical to its anchor (Copilot, #2198).
      console.log(`\n${summary.skipped} mutation(s) SKIPPED — they could not be applied, so the round never tested them; fix the spec:`);
      for (const s of results.filter((r) => r.verdict === 'skipped')) console.log(`  · ${s.name}  [${s.file}] — ${s.detail}`);
    }
    // The two flags are independent: a skip is not a survivor, and a survivor is not a skip.
    const failOnSurvivor = argv.includes('--fail-on-survivor') && (survivors.length || summary.timedOut);
    const failOnSkipped = argv.includes('--fail-on-skipped') && summary.skipped > 0;
    return failOnSurvivor || failOnSkipped ? 1 : 0;
  } catch (e) {
    console.error(`mutate: ${e.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fileURLToPath(new URL(process.argv[1], 'file:'))).href) {
  main().then((code) => process.exit(code));
}
