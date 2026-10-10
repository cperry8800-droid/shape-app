// Mutation spec for the `wasPinFinding` half of `fixedAfterCapture`: a pin fix carried in the
// allow-list until the catalog is captured again (the 2026-10-10 Lows migration pins
// save_workout_session; the 2026-10-09 capture predates it). Each mutation breaks one clause of
// the checker, the as-of-capture reading or the live diff; every one must be
// killed by the three definer suites.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/definer-fixed-after-capture-pins-2026-10-10.mutations.mjs --fail-on-skipped
const CHECK = 'tests/helpers/definer-allowlist.mjs';
const LIVE = 'tests/helpers/definer-live.mjs';
const DIFF = 'scripts/definer-live-diff.mjs';

export default {
  test: 'node --test tests/definer-grants.test.mjs tests/definer-live-diff.test.mjs tests/definer-live-agreement.test.mjs',
  timeoutMs: 900_000,
  mutations: [
    // ── the checker ──
    { name: 'a pin item is not one of the three shapes an item may take', file: CHECK,
      find: "      const before = ['wasEntry', 'wasFinding', 'wasPinFinding'].filter((k) => !!f[k]);",
      replace: "      const before = ['wasEntry', 'wasFinding'].filter((k) => !!f[k]);" },
    { name: 'a pin fix that did not land is accepted', file: CHECK,
      find: '        else if (unpinned.includes(f.name)) problems.push(',
      replace: '        else if (false) problems.push(' },
    { name: 'a pin item for a function the model does not hold is accepted', file: CHECK,
      find: '        if (!isDefiner) problems.push(',
      replace: '        if (false) problems.push(' },
    { name: 'a pin item may also stay in registeredPinFindings', file: CHECK,
      find: '        if (pinNames.includes(f.name)) problems.push(`${f.name}: in fixedAfterCapture and also in registeredPinFindings`);\n',
      replace: '' },
    { name: 'a pin item is held to the anon-exposure checks', file: CHECK,
      find: '      if (f.wasPinFinding) {\n        // A pin fix',
      replace: '      if (false) {\n        // A pin fix' },
    // ── as of the capture ──
    { name: 'a pin fix the capture predates is not read back as a pin finding', file: LIVE,
      find: '    else if (f.wasPinFinding) restoredPins.push(f.wasPinFinding);\n',
      replace: '' },
    // ── the live diff ──
    { name: 'an unpinned pin fix does not count as registered', file: DIFF,
      find: '  const awaitingPins = fixedPins.filter((f) => unpinned.includes(f.name));',
      replace: '  const awaitingPins = [];' },
    { name: 'a pin fix live has applied is never named', file: DIFF,
      find: '    appliedLive: names([...fixedAccess.filter((f) => !anonNames.has(f.name)), ...fixedPins.filter((f) => !unpinned.includes(f.name))].map((f) => f.name)),',
      replace: '    appliedLive: names(fixedAccess.filter((f) => !anonNames.has(f.name)).map((f) => f.name)),' },
    { name: 'a pin fix still in registeredPinFindings is not double-listed', file: DIFF,
      find: '      ...fixedPins.map((f) => f.name).filter((n) => rawPinFindings.has(n)),\n',
      replace: '' },
    { name: 'a pin fix is read as an access fix', file: DIFF,
      find: '  const fixedAccess = fixed.filter((f) => !f.wasPinFinding);',
      replace: '  const fixedAccess = fixed;' },
    // The list itself carried the pin item only until the 2026-10-10 capture (11/11 killed with a
    // mutation of it on 2026-10-09); the item is gone now, so the list is not a target here.
  ],
};
