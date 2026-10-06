// Mutation spec for Shape Radio's light effects following the music (2026-10-06): the
// Immersive stage lights, the Subtle edge light, and the one reading of the radio they share.
// Each mutation breaks one promise the suites make: a kick is a kick and hiss is not, a drop is
// the kick returning after a breakdown, an unreadable stream is never music, light paper
// deepens the gels, the beams fan and swing together on the drop, every layer is decoration at
// its place in the stack on the floor it is given, the analyser is read once a frame, and the
// playing overlay reads the music while the Settings preview runs the demo. Run from the root:
//   node scripts/mutate.mjs --spec tests/mutations/radio-lights-2026-10-06.mutations.mjs --fail-on-skipped
const ENGINE = 'mobile-app/src/services/radioLight.mjs';
const LIGHTS = 'mobile-app/src/broadsheet/iosAppRadioLights.jsx';
const REACTIVE = 'mobile-app/src/broadsheet/iosAppReactive.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const DJ = 'mobile-app/src/broadsheet/iosAppHologramDJ.jsx';

export default {
  test: 'node --test tests/radio-light-engine.test.mjs tests/radio-lights-mount.test.mjs tests/hologram-dj-mount.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── the engine: kicks ──
    { name: 'no refractory window: a fast train counts every frame over the threshold', file: ENGINE,
      find: 't - lastKick >= RL_KICK_REFRACTORY_MS && ',
      replace: '' },
    { name: 'no absolute floor: a quiet bass ripple kicks', file: ENGINE,
      find: ' && bands.bass - bassSlow >= RL_KICK_MIN',
      replace: '' },
    { name: 'the slow average starts at zero: the first frames of a stream read as kicks', file: ENGINE,
      find: 'const s = s0.measuredMs > 0 ? s0 : { ...s0, bassSlow: bands.bass };',
      replace: 'const s = s0;' },
    // ── the engine: drops ──
    { name: 'any kick is a drop: no breakdown needed', file: ENGINE,
      find: 't - lastKick >= RL_DROP_GAP_MS',
      replace: 't - lastKick >= 0' },
    { name: 'no warm-up: a stream that opens mid-breakdown drops on its first groove', file: ENGINE,
      find: ' && t >= RL_DROP_WARMUP_MS',
      replace: '' },
    { name: 'an unreadable stream breathes a beat it cannot hear', file: ENGINE,
      find: 'kick: 0, drop: 0, bar: (t % 12000)',
      replace: 'kick: breath, drop: 0, bar: (t % 12000)' },
    { name: 'the demo drop moves past the 6 s Settings preview', file: ENGINE,
      find: 'RL_DEMO_DROP_BAR = 2',
      replace: 'RL_DEMO_DROP_BAR = 3' },
    // ── the engine: the lights ──
    { name: 'light paper deepens only to 1.1:1: cream stays the paper', file: ENGINE,
      find: 'RL_LIGHT_CONTRAST = 2.6',
      replace: 'RL_LIGHT_CONTRAST = 1.1' },
    { name: 'light paper keeps the gels as picked', file: ENGINE,
      find: 'return isLight ? [rlDeepen(a), rlDeepen(b)] : [a, b];',
      replace: 'return [a, b];' },
    { name: 'the drop never brings the heads together', file: ENGINE,
      find: 'return sweep * (1 - d) + unison * d;',
      replace: 'return sweep;' },
    { name: 'the kick lands on every head at once', file: ENGINE,
      find: 'const alt = i % 2 === beatN % 2 ? 1 : 0.5;',
      replace: 'const alt = 1;' },
    // ── the layers ──
    { name: 'the layers take taps', file: LIGHTS,
      find: "pointerEvents: 'none'",
      replace: "pointerEvents: 'auto'" },
    { name: 'the stage lights rise over the edge light', file: LIGHTS,
      find: 'rlRootStyle(color, isLight, 1)',
      replace: 'rlRootStyle(color, isLight, 10)' },
    { name: 'unmounting leaves the light loop running', file: LIGHTS,
      find: 'return () => cancelAnimationFrame(raf);',
      replace: 'return undefined;' },
    { name: 'the edge light runs down under the tab bar', file: LIGHTS,
      find: 'top: 0, bottom: floor, [dir]: 0',
      replace: 'top: 0, bottom: 0, [dir]: 0' },
    { name: 'the pool sits on the screen edge, not the floor line', file: LIGHTS,
      find: 'bottom: floor - 70',
      replace: 'bottom: -70' },
    { name: 'the palette refresh drops the light-paper gels', file: LIGHTS,
      find: 'const [a, b] = rlGels(key, isLight);',
      replace: 'const [a, b] = rlGels(key, false);' },
    // ── the shared reading ──
    { name: 'an all-zero stream is read as music', file: REACTIVE,
      find: 'if (rlHasSignal(bins)) {',
      replace: 'if (bins) {' },
    { name: 'every layer reads the analyser again in the same frame', file: REACTIVE,
      find: 'if (now === S.at && live === S.live && S.read) return S.read;',
      replace: '' },
    { name: 'the demo resumes after a pause instead of starting over', file: REACTIVE,
      find: 'if (S.t0 === null || now - S.at > 1000 || live !== S.live) S.t0 = now;',
      replace: 'if (S.t0 === null) S.t0 = now;' },
    { name: 'Subtle mounts the stage lights too', file: REACTIVE,
      find: "const staged = mode === 'immersive' || mode === 'hologram';",
      replace: "const staged = mode !== 'off';" },
    // ── the call sites ──
    { name: 'the playing overlay runs the demo clock instead of the music', file: CLIENT,
      find: 'floor={floor} live />',
      replace: 'floor={floor} />' },
    { name: 'the Settings preview reads a radio that is not playing', file: CLIENT,
      find: 'floor={0} preview />',
      replace: 'floor={0} preview live />' },
    { name: 'the hologram DJ ignores the music and keeps its own clock', file: DJ,
      find: "const music = !still && !!rd && rd.source !== 'demo';",
      replace: 'const music = false;' },
  ],
};
