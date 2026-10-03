// Mutation spec for the Nora booth's blinder flash gate and the director's reduced-motion
// rule (prototypes/nora-booth, PR #2189's review round). Four of these were run by hand in that
// round (4/4); this spec adds two more, and through the shared runner all six are killed. Run
// from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-flash-gate.mutations.mjs
// The gate is pure (no clock, no randomness), so the test drives it with synthetic kick
// trains; each mutation below breaks one clause of the rule "nothing flashes faster than
// once a beat, never more than three a second, one flash per kick edge".
export default {
  test: 'node --test prototypes/nora-booth/test/flashGate.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'the gap check is removed: every kick flashes', file: 'prototypes/nora-booth/src/flashGate.mjs',
      find: 'if (hit && armed && t - last >= wait) { last = t; env = 1; }',
      replace: 'if (hit && armed) { last = t; env = 1; }' },
    { name: 'the beat period is ignored: only the 1/3 s floor holds', file: 'prototypes/nora-booth/src/flashGate.mjs',
      find: 'const wait = Math.max(gap > 0 ? gap : 0, minGap) * 0.98;',
      replace: 'const wait = minGap * 0.98;' },
    { name: 'the gate stays armed while the kick is held: a held kick re-fires every beat', file: 'prototypes/nora-booth/src/flashGate.mjs',
      find: '      armed = !hit;',
      replace: '      armed = true;' },
    { name: 'the flash never decays', file: 'prototypes/nora-booth/src/flashGate.mjs',
      find: 'env *= Math.exp(-Math.max(0, dt) / decay);',
      replace: '' },
    { name: 'the handheld sway stays on under reduced motion', file: 'prototypes/nora-booth/src/noraDirector.mjs',
      find: 'const h = ctx.reducedMotion ? 0 : s.handheld;',
      replace: 'const h = s.handheld;' },
    { name: 'the director forgets its reducedMotion flag', file: 'prototypes/nora-booth/src/noraDirector.mjs',
      find: 'if (this.reducedMotion && !ctx.reducedMotion) ctx = { ...ctx, reducedMotion: true };',
      replace: '' },
  ],
};
