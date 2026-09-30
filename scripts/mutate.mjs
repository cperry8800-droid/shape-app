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
//
// Usage:
//   node scripts/mutate.mjs --spec <file>            # a .mjs (default export) or .json spec
//   node scripts/mutate.mjs --spec <file> --only <substring-of-name>
//   node scripts/mutate.mjs --spec <file> --allow-dirty     # skip the git dirty-tree refusal
//   node scripts/mutate.mjs --spec <file> --fail-on-survivor
//
// Spec shape:
//   export default {
//     test: 'node --test tests/foo.test.mjs',   // the command whose # pass/# fail is read
//     mutations: [
//       { name: 'drop the guard', file: 'src/foo.mjs', find: 'if (!x) return;', replace: '' },
//       { name: 'a proven no-op', file: 'src/foo.mjs', find: '…', replace: '…', expectSurvive: true },
//     ],
//   };
//
// Exit codes: 0 done (survivors are reported, not fatal, unless --fail-on-survivor
// gives 1); 2 harness failure (sanity red, a mutation that did not land, a restore
// that did not verify, an unreadable spec).

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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
  return { test: spec.test, mutations };
}

/**
 * Register restore-on-signal handlers. `proc` is injectable so a test can drive
 * the handler without sending itself a signal. Returns an uninstall function.
 */
export function installRestoreOnSignal(restore, proc = process) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handler = (sig) => {
    try { restore(); } finally {
      for (const s of signals) proc.off(s, handler);
      proc.kill(proc.pid, sig);
    }
  };
  for (const s of signals) proc.on(s, handler);
  return () => { for (const s of signals) proc.off(s, handler); };
}

// ── The run ───────────────────────────────────────────────────────────────────

function defaultExec(cmd, cwd) {
  // ⚠ Strip NODE_TEST_* from the child's environment. When this runner is itself
  // started from inside `node --test` (its own e2e test does exactly that), the
  // parent sets NODE_TEST_CONTEXT, and a nested `node --test` that inherits it
  // reports to the parent over a pipe instead of printing its TAP summary — so
  // parseTap sees nothing and every mutation reads as "no result". Measured:
  // the same command prints `# pass 1` from a shell and nothing under the parent.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('NODE_TEST_')) delete env[k];
  try {
    return execSync(cmd, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
  } catch (e) {
    // A red suite exits non-zero; its stdout still carries the summary.
    return `${e.stdout || ''}\n${e.stderr || ''}`;
  }
}

function gitDirty(root, files) {
  try {
    const out = execSync(`git status --porcelain -- ${files.map((f) => JSON.stringify(f)).join(' ')}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return null; // not a git checkout — nothing to refuse on
  }
}

/**
 * Run every mutation in `spec` against the tree at `root`.
 * Options: exec(cmd, cwd) → output string (injectable), log(line), only, allowDirty, proc.
 */
export function runMutations(spec, { root = process.cwd(), exec = defaultExec, log = console.log, only = null, allowDirty = false, proc = process } = {}) {
  spec = normalizeSpec(spec);
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

  // Rule 1: sanity BEFORE the snapshot, so a broken tree cannot become a baseline.
  const runTest = () => parseTap(exec(spec.test, root));
  const before = runTest();
  if (!before || before.fail > 0 || before.pass < 1) {
    throw new Error(`sanity run is not green on the untouched tree (${before ? `pass ${before.pass} / fail ${before.fail}` : 'no # pass/# fail summary'}) — fix the tree first; nothing was mutated`);
  }
  log(`mutate: sanity before — pass ${before.pass} / fail ${before.fail}`);

  // Rule 2: snapshot bytes.
  const snap = new Map(files.map((f) => [f, fs.readFileSync(path.resolve(root, f))]));
  const restoreAll = () => {
    for (const [f, buf] of snap) {
      const p = path.resolve(root, f);
      fs.writeFileSync(p, buf);
      if (Buffer.compare(fs.readFileSync(p), buf) !== 0) throw new Error(`restore of ${f} did not verify byte for byte`);
    }
  };
  const uninstall = installRestoreOnSignal(restoreAll, proc);

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
      let tap;
      try {
        fs.writeFileSync(p, plan.out);
        // Rule 4: prove it landed.
        if (fs.readFileSync(p, 'utf8') !== plan.out) throw new Error(`mutation "${m.name}" did not land on disk`);
        tap = runTest();
      } finally {
        restoreAll();
      }
      const verdict = classify(tap, m.expectSurvive);
      const detail = tap ? `pass ${tap.pass} / fail ${tap.fail}` : 'no summary (crash?)';
      results.push({ ...m, verdict, detail, tap });
      const label = { killed: 'KILLED   ', 'killed:no-result': 'KILLED   ', survived: 'SURVIVED ', 'no-op': 'NO-OP    ', 'unexpected-kill': 'UNEXPECTED KILL' }[verdict];
      log(`${label} ${m.name}  (${detail}${verdict === 'killed:no-result' ? ', no result' : ''}${verdict === 'no-op' ? ', expected' : ''})`);
    }
  } finally {
    uninstall();
  }

  const after = runTest();
  const restoredOk = files.every((f) => Buffer.compare(fs.readFileSync(path.resolve(root, f)), snap.get(f)) === 0);
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const summary = {
    total: results.length,
    killed: count('killed') + count('killed:no-result'),
    survived: count('survived'),
    noop: count('no-op'),
    unexpectedKill: count('unexpected-kill'),
    skipped: count('skipped'),
    restoredOk,
    sanityAfter: after,
  };
  log(`mutate: killed ${summary.killed} · survived ${summary.survived} · no-op ${summary.noop} · unexpected kills ${summary.unexpectedKill} · skipped ${summary.skipped} · restored byte-identical: ${restoredOk} · sanity after: ${after ? `pass ${after.pass} / fail ${after.fail}` : 'NO SUMMARY'}`);
  if (!restoredOk) throw new Error('the tree is not byte-identical after the run — inspect `git status` before doing anything else');
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
  if (!specPath) { console.error('usage: node scripts/mutate.mjs --spec <file> [--only <name>] [--allow-dirty] [--fail-on-survivor]'); return 2; }
  let spec;
  try { spec = await loadSpec(specPath); } catch (e) { console.error(`mutate: cannot load spec ${specPath}: ${e.message}`); return 2; }
  try {
    const { summary, results } = runMutations(spec, { only: arg('--only'), allowDirty: argv.includes('--allow-dirty') });
    const survivors = results.filter((r) => r.verdict === 'survived');
    if (survivors.length) {
      console.log(`\nsurvivors (${survivors.length}) — each is a guard gap or a no-op; if a no-op, prove it and mark it expectSurvive:`);
      for (const s of survivors) console.log(`  · ${s.name}  [${s.file}]`);
    }
    if (summary.unexpectedKill) {
      console.log(`\n${summary.unexpectedKill} mutation(s) marked expectSurvive were KILLED — the documented no-op is no longer a no-op; re-read it.`);
    }
    return argv.includes('--fail-on-survivor') && survivors.length ? 1 : 0;
  } catch (e) {
    console.error(`mutate: ${e.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fileURLToPath(new URL(process.argv[1], 'file:'))).href) {
  main().then((code) => process.exit(code));
}
