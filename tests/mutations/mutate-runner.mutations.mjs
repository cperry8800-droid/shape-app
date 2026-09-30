// Mutation spec for the runner itself — the first consumer of scripts/mutate.mjs.
//
// Convention from here on: a PR's mutation round is a checked-in spec under
// tests/mutations/<subject>.mutations.mjs (this directory is NOT matched by
// `npm test`'s tests/**/*.test.mjs glob, so specs never run as tests). Run it with
//   node scripts/mutate.mjs --spec tests/mutations/<subject>.mutations.mjs
// and paste the summary line into the PR. A survivor is either a guard gap (fix
// the test) or a proven no-op (mark it expectSurvive with the proof in `why`).
export default {
  test: 'node --test tests/mutate-runner.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'sanity gate removed', file: 'scripts/mutate.mjs',
      find: "if (!before || before.fail > 0 || before.pass < 1) {", replace: 'if (false) {' },
    { name: 'anchor relocated to the first match when it occurs more than once', file: 'scripts/mutate.mjs',
      find: 'if (count !== 1) return', replace: 'if (count < 1) return' },
    { name: 'a missing summary reads as survived', file: 'scripts/mutate.mjs',
      find: "if (tap == null) return expectSurvive ? 'unexpected-kill' : 'killed:no-result';", replace: "if (tap == null) return 'survived';" },
    { name: 'parseTap takes the FIRST summary instead of the last', file: 'scripts/mutate.mjs',
      find: 'while ((m = re.exec(s))) r = Number(m[1]);', replace: 'if ((m = re.exec(s))) r = Number(m[1]);' },
    { name: 'restore is not in the finally', file: 'scripts/mutate.mjs',
      find: '      } finally {\n        restoreAll();\n      }', replace: '      } finally {\n      }' },
    { name: 'NODE_TEST_* env is inherited by the child', file: 'scripts/mutate.mjs',
      find: "for (const k of Object.keys(env)) if (k.startsWith('NODE_TEST_')) delete env[k];", replace: '' },
    { name: 'sanity after the round is skipped', file: 'scripts/mutate.mjs',
      find: 'const { tap: after, timedOut: afterTimedOut } = await runGuarded();', replace: 'const after = before, afterTimedOut = false;' },
    { name: 'dirty tree is not refused', file: 'scripts/mutate.mjs',
      find: 'if (dirty && dirty.length) {', replace: 'if (false) {' },
    { name: 'signal handler kills before restoring', file: 'scripts/mutate.mjs',
      find: '      if (abort) abort(sig);\n      restore();\n    } finally {', replace: '      proc.kill(proc.pid, sig);\n      if (abort) abort(sig);\n      restore();\n    } finally {' },
    { name: 'signal handler does not abort the in-flight run', file: 'scripts/mutate.mjs',
      find: '      if (abort) abort(sig);\n      restore();', replace: '      restore();' },
    { name: 'the round goes on after a signal', file: 'scripts/mutate.mjs',
      find: 'if (interrupted) throw new Error(`interrupted by ${interrupted} — the tree was restored; the round did not finish`);', replace: '' },
    { name: 'a timed-out run is classified like any other', file: 'scripts/mutate.mjs',
      find: "const verdict = run.timedOut ? 'timeout' : classify(tap, m.expectSurvive);", replace: 'const verdict = classify(tap, m.expectSurvive);' },
    // Removing the timeout makes the spin test's inner run hang, so the suite
    // itself hangs: this mutation is caught by THIS round's own timeout and is
    // reported as TIMEOUT rather than KILLED — which is the rule working, not a
    // gap. `timeoutMs` below bounds that wait.
    { name: 'the per-run timeout never fires', file: 'scripts/mutate.mjs',
      find: 'const timer = timeoutMs ? setTimeout(', replace: 'const timer = false ? setTimeout(' },
    { name: 'expectSurvive kill reported as a plain kill', file: 'scripts/mutate.mjs',
      find: "if (tap.fail > 0) return expectSurvive ? 'unexpected-kill' : 'killed';", replace: "if (tap.fail > 0) return 'killed';" },
    // The landed check can only fire when the filesystem lies about a write it
    // accepted; no test here can make it do that, so it is a documented no-op.
    { name: 'landed check removed', file: 'scripts/mutate.mjs', expectSurvive: true,
      find: `if (fs.readFileSync(p, 'utf8') !== plan.out) throw new Error(\`mutation "\${m.name}" did not land on disk\`);`, replace: '' },
    { name: 'git status inherits GIT_* from the hook (acts on the committing repo)', file: 'scripts/mutate.mjs',
      find: "{ cwd: root, env: withoutRepoEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }",
      replace: "{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }" },
    { name: 'the spawned test command inherits GIT_* from the hook', file: 'scripts/mutate.mjs',
      find: '  const env = withoutRepoEnv();\n',
      replace: '  const env = { ...process.env };\n' },
    // A signal outside the mutation loop (CodeRabbit, #2188): both sanity runs are
    // detached, so a signal that ends the runner orphans the suite unless the run is guarded.
    { name: 'the first sanity run has no signal handler (Ctrl-C orphans the suite)', file: 'scripts/mutate.mjs',
      find: 'const { tap: before, timedOut: beforeTimedOut } = await runGuarded();',
      replace: 'const { tap: before, timedOut: beforeTimedOut } = await runTest();' },
    { name: 'the final sanity run has no signal handler', file: 'scripts/mutate.mjs',
      find: 'const { tap: after, timedOut: afterTimedOut } = await runGuarded();',
      replace: 'const { tap: after, timedOut: afterTimedOut } = await runTest();' },
    { name: 'the abort-only handler never aborts the in-flight run', file: 'scripts/mutate.mjs',
      find: 'const uninstallAbortOnly = installRestoreOnSignal(() => {}, proc, { abort });',
      replace: 'const uninstallAbortOnly = installRestoreOnSignal(() => {}, proc, {});' },
    { name: 'the abort-only handler is never uninstalled', file: 'scripts/mutate.mjs',
      find: 'try { return await runTest(); } finally { uninstallAbortOnly(); }',
      replace: 'return await runTest();' },
    { name: 'an interrupted first sanity run reads as a red baseline, not as an interrupt', file: 'scripts/mutate.mjs',
      find: 'if (interrupted) throw new Error(`interrupted by ${interrupted} during the sanity run — nothing was mutated`);',
      replace: '' },
    { name: 'an interrupted final sanity run reads as a red tree, not as an interrupt', file: 'scripts/mutate.mjs',
      find: 'if (interrupted) throw new Error(`interrupted by ${interrupted} during the final sanity run — the tree was already restored; the round did not finish`);',
      replace: '' },
  ],
};
