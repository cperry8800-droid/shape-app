// Mutation spec for the booth's first graphics pass (2026-10-09, owner: "still looks very animated"):
// Nora's face and resting body (noraFace.mjs), how the performer and the booth read it, the hair's
// spring steps, the crowd's human eyes, and the camera that keeps the anime placeholder's face out
// of its rotation. Each mutation breaks one promise tests/nora-booth-face.test.mjs makes. Run from
// the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-booth-graphics-2026-10-09.mutations.mjs --fail-on-skipped
const FACE = 'public/newdesign/booth/noraFace.mjs';
const PERF = 'public/newdesign/booth/noraPerformer.mjs';
const HOST = 'public/newdesign/booth/noraBooth.mjs';
const CROWD = 'public/newdesign/booth/crowdAvatars.mjs';
const DIR = 'public/newdesign/booth/noraDirector.mjs';
const STATE = 'public/newdesign/booth/noraBoothState.mjs';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';

export default {
  test: 'node --test tests/nora-booth-face.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    // ── blinks ──
    { name: 'a blink opens as fast as it closes', file: FACE,
      find: '  open: 0.16,       // s, lid going back up', replace: '  open: 0.07,       // s, lid going back up' },
    { name: 'blinks come on a fixed period again', file: FACE,
      find: '  const tail = -Math.log(1 - clamp(r, 0, 0.999999)) * (BLINK.meanGap - BLINK.minGap);', replace: '  const tail = (BLINK.meanGap - BLINK.minGap) + 0 * r;' },
    { name: 'there is no longest gap', file: FACE,
      find: '  return clamp(BLINK.minGap + tail, BLINK.minGap, BLINK.maxGap);', replace: '  return Math.max(BLINK.minGap, BLINK.minGap + tail);' },
    { name: 'never a double blink', file: FACE,
      find: '    doubleAt = rand() < BLINK.double ? at + BLINK_LEN + BLINK.doubleGap : null;', replace: '    doubleAt = rand() < 0 ? at + BLINK_LEN + BLINK.doubleGap : null;' },
    { name: 'the next blink is spaced from the first of a pair, not the second', file: FACE,
      find: '        nextAt = Math.max(nextAt, onset + BLINK.minGap);', replace: '' },
    { name: 'a gaze shift blinks inside the refractory window', file: FACE,
      find: '      else if (gazeShift && clock - onset >= BLINK.gazeRefractory && rand() < BLINK.gazeChance) begin(clock);', replace: '      else if (gazeShift && rand() < BLINK.gazeChance) begin(clock);' },
    { name: 'a gaze shift never brings a blink', file: FACE,
      find: '      else if (gazeShift && clock - onset >= BLINK.gazeRefractory && rand() < BLINK.gazeChance) begin(clock);', replace: '' },
    // ── gaze ──
    { name: 'the eyes follow every small move of the target', file: FACE,
      find: '        if (a > GAZE.threshold) {', replace: '        if (a > 0) {' },
    { name: 'no shortest fixation', file: FACE,
      find: '      else if (clock - lastSaccade >= GAZE.holdMin) {', replace: '      else {' },
    { name: 'no saccade counts as big', file: FACE,
      find: 'big = a >= GAZE.big;', replace: 'big = false;' },
    { name: 'the eyes never drift while fixating', file: FACE,
      find: '        micro = { yaw: (rand() * 2 - 1) * GAZE.microAmp, pitch: (rand() * 2 - 1) * GAZE.microAmp };', replace: '        micro = { yaw: 0 * rand(), pitch: 0 * rand() };' },
    { name: 'the head is handed the drifting gaze', file: FACE,
      find: '      return { gaze: turnAbout(eye, fix, micro.yaw, micro.pitch), head: { ...fix }, saccade, big };', replace: '      return { gaze: turnAbout(eye, fix, micro.yaw, micro.pitch), head: turnAbout(eye, fix, micro.yaw, micro.pitch), saccade, big };' },
    { name: 'idle glances stray twice as far', file: FACE,
      find: "          idle = idle ? { yaw: (rand() * 2 - 1) * GAZE.idleYaw, pitch: (rand() * 2 - 1) * GAZE.idlePitch } : { yaw: 0, pitch: 0 };", replace: "          idle = idle ? { yaw: (rand() * 2 - 1) * GAZE.idleYaw * 2, pitch: (rand() * 2 - 1) * GAZE.idlePitch } : { yaw: 0, pitch: 0 };" },
    { name: 'idle she stares at one point', file: FACE,
      find: '        target = turnAbout(eye, want, idle.yaw, idle.pitch);', replace: '        target = want;' },
    { name: 'turnAbout loses the distance', file: FACE,
      find: '  const ch = Math.cos(el) * r;', replace: '  const ch = Math.cos(el);' },
    // ── breath ──
    { name: 'the breath rate never wanders', file: FACE,
      find: '      const wander = 1 + BREATH.wander * (0.6 * Math.sin(clock * 0.13 + w1) + 0.4 * Math.sin(clock * 0.31 + w2));', replace: '      const wander = 1;' },
    { name: 'effort does not quicken the breath', file: FACE,
      find: '      const bpm = (BREATH.restBpm + BREATH.effortBpm * clamp(energy, 0, 1)) * wander;', replace: '      const bpm = BREATH.restBpm * wander;' },
    { name: 'every breath is the same depth', file: FACE,
      find: '      if (Math.floor(phase) !== Math.floor(before)) depth = 0.8 + 0.4 * rand();   // a new breath', replace: '' },
    { name: 'the inhale is as long as the exhale', file: FACE,
      find: 'restBpm: 12.5, effortBpm: 8, wander: 0.12, inhale: 0.4 }', replace: 'restBpm: 12.5, effortBpm: 8, wander: 0.12, inhale: 0.5 }' },
    // ── weight ──
    { name: 'square can follow square', file: FACE,
      find: '        target = target === 0 ? (rand() < 0.5 ? -1 : 1) : rand() < WEIGHT.square ? 0 : -target;', replace: '        target = rand() < WEIGHT.square ? 0 : target === 0 ? (rand() < 0.5 ? -1 : 1) : -target;' },
    { name: 'she never stands square', file: FACE,
      find: '        target = target === 0 ? (rand() < 0.5 ? -1 : 1) : rand() < WEIGHT.square ? 0 : -target;', replace: '        target = target === 0 ? (rand() < 0.5 ? -1 : 1) : -target;' },
    { name: 'the weight shifts on a fixed period', file: FACE,
      find: '        nextAt = clock + WEIGHT.holdMin + (WEIGHT.holdMax - WEIGHT.holdMin) * rand();', replace: '        nextAt = clock + WEIGHT.holdMin + 0 * rand();' },
    { name: 'a weight shift crawls', file: FACE,
      find: 'holdMin: 3.5, holdMax: 9, square: 0.2, omega: 3.2 }', replace: 'holdMin: 3.5, holdMax: 9, square: 0.2, omega: 1.2 }' },
    // ── the performer and the booth ──
    { name: 'the performer blinks on a clock again', file: PERF,
      find: '      const blink = this.face.blink.step(dt, { gazeShift: g.big });', replace: '      const blink = ((t * 1000) % 3700) < 110 ? 1 : 0;' },
    { name: 'the head is aimed at the raw target', file: PERF,
      find: '    const toL = this._v[1].set(g.head.x, g.head.y, g.head.z).sub(hw);', replace: '    const toL = this._v[1].copy(lookW).sub(hw);' },
    { name: 'off the beat she still dips', file: PERF,
      find: '    const dipRaw = groove ? 0.5 + 0.5 * Math.cos((ph - 0.07) * Math.PI * 2) : 0;', replace: '    const dipRaw = 0.5 + 0.5 * Math.cos((ph - 0.07) * Math.PI * 2);' },
    { name: 'off the beat she still sways on a metronome', file: PERF,
      find: '    spring1(sm.sway, groove ? Math.sin(beat * Math.PI) : rest, sdt, groove ? 12 : 4);', replace: '    spring1(sm.sway, Math.sin(beat * Math.PI), sdt, groove ? 12 : 4);' },
    { name: 'the booth says there is a beat off air', file: HOST,
      find: '      let groove = false;', replace: '      let groove = true;' },
    { name: 'an unmeasured station grid counts as a beat', file: HOST,
      find: "          roomKick = noraKick * Math.min(1, bands.low * 3);\n          groove = true;", replace: "          roomKick = noraKick * Math.min(1, bands.low * 3);\n        }\n        if (stationAn) {\n          groove = true;" },
    // ── hair ──
    { name: 'the hair takes one long step', file: PERF,
      find: '  return Math.min(SPRING_MAX_STEPS, Math.max(1, Math.ceil(dt / SPRING_STEP - 1e-9)));', replace: '  return 1;' },
    { name: 'the hair takes uncapped steps', file: PERF,
      find: '  return Math.min(SPRING_MAX_STEPS, Math.max(1, Math.ceil(dt / SPRING_STEP - 1e-9)));', replace: '  return Math.max(1, Math.ceil(dt / SPRING_STEP - 1e-9));' },
    { name: 'the spring manager is not restored', file: PERF,
      find: '      try { vrm.update(dt); } finally { vrm.springBoneManager = sbm; }', replace: '      vrm.update(dt);' },
    { name: 'the hair is never settled', file: PERF,
      find: '    if (sbm && !this._hairSettled) {', replace: '    if (sbm && false) {' },
    { name: 'the hair settles every frame', file: PERF,
      find: '      this._hairSettled = true;\n', replace: '' },
    { name: 'the hair settles for a moment only', file: PERF,
      find: 'export const HAIR_SETTLE_S = 1.5;', replace: 'export const HAIR_SETTLE_S = 0.2;' },
    { name: 'a sleeve is given hair gravity', file: PERF,
      find: "  return /hair/i.test(boneName || '') && !(authored > 0) ? HAIR_GRAVITY : authored;", replace: "  return !(authored > 0) ? HAIR_GRAVITY : authored;" },
    { name: 'authored hair gravity is overwritten', file: PERF,
      find: "  return /hair/i.test(boneName || '') && !(authored > 0) ? HAIR_GRAVITY : authored;", replace: "  return /hair/i.test(boneName || '') ? HAIR_GRAVITY : authored;" },
    { name: 'the performer never applies hair gravity', file: PERF,
      find: '        if (j && j.settings) j.settings.gravityPower = hairGravity(j.bone && j.bone.name, j.settings.gravityPower);', replace: '' },
    // ── crowd eyes ──
    { name: 'the crowd draws the bake\'s anime eyes', file: CROWD,
      find: '  const F = humanEyeFrame(header.face);', replace: '  const F = header.face && header.face.L && header.face.R && header.face.L.white ? header.face : null;' },
    { name: 'the eye opening is as tall as it is wide', file: CROWD,
      find: 'halfWidth: 0.24, halfHeight: 0.085,', replace: 'halfWidth: 0.24, halfHeight: 0.24,' },
    { name: 'the iris fits inside the opening', file: CROWD,
      find: 'iris: 0.095, irisUp: 0.02,', replace: 'iris: 0.07, irisUp: 0.02,' },
    { name: 'the brow stays at the anime height', file: CROWD,
      find: 'bv = H.browUp * ipd, bh = H.browHalf * ipd;', replace: 'bv = (b[2] + b[3]) / 2, bh = H.browHalf * ipd;' },
    { name: 'the crowd\'s eyes glow again', file: CROWD,
      find: "totalEmissiveRadiance += vec3(0.02, 0.021, 0.023) * gCatch", replace: "totalEmissiveRadiance += vec3(0.22, 0.23, 0.25) * gCatch" },
    { name: 'the anime eye opening is painted white again', file: CROWD,
      find: 'P == 4 ? skin * 0.72 :', replace: 'P == 4 ? vec3(0.6, 0.57, 0.54) :' },
    { name: 'a zero IPD still draws eyes', file: CROWD,
      find: '  if (!(ipd > 0)) return null;', replace: '' },
    // ── the camera and the placeholder ──
    { name: 'the rotation ignores exclusions', file: DIR,
      find: "&& id !== 'screen' && !this.exclude.has(id));", replace: "&& id !== 'screen');" },
    { name: 'the placeholder takes close-ups', file: STATE,
      find: "export const NORA_MODEL = Object.freeze({ path: 'nora/placeholder.vrm', crowd: 'nora/crowd.bin.txt', portrait: false });", replace: "export const NORA_MODEL = Object.freeze({ path: 'nora/placeholder.vrm', crowd: 'nora/crowd.bin.txt', portrait: true });" },
    { name: 'the booth ignores portrait', file: HOST,
      find: "exclude: portrait ? [] : ['face'] });", replace: "exclude: [] });" },
    { name: 'the app drops the portrait rule', file: APP,
      find: '        portrait: NORA_MODEL.portrait,\n', replace: '' },
  ],
};
