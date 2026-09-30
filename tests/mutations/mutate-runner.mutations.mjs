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
      find: 'const after = runTest();', replace: 'const after = before;' },
    { name: 'dirty tree is not refused', file: 'scripts/mutate.mjs',
      find: 'if (dirty && dirty.length) {', replace: 'if (false) {' },
    { name: 'signal handler kills before restoring', file: 'scripts/mutate.mjs',
      find: 'try { restore(); } finally {', replace: 'try { proc.kill(proc.pid, sig); restore(); } finally {' },
    { name: 'expectSurvive kill reported as a plain kill', file: 'scripts/mutate.mjs',
      find: "if (tap.fail > 0) return expectSurvive ? 'unexpected-kill' : 'killed';", replace: "if (tap.fail > 0) return 'killed';" },
    // The landed check can only fire when the filesystem lies about a write it
    // accepted; no test here can make it do that, so it is a documented no-op.
    { name: 'landed check removed', file: 'scripts/mutate.mjs', expectSurvive: true,
      find: `if (fs.readFileSync(p, 'utf8') !== plan.out) throw new Error(\`mutation "\${m.name}" did not land on disk\`);`, replace: '' },
  ],
};
