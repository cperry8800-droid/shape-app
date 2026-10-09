// Mutation spec for Nora's booth, Phase 1 (2026-10-09): the label and who-hears-the-example rules
// (noraBoothState.mjs), frame pacing and portrait framing (noraFrame.mjs), the keeper that holds
// one booth between visits (noraBoothKeeper.mjs), the two mounts (the app's Radio screen and the
// website's Radio page), and the negative-bar fix in the club. Each mutation breaks one promise
// the suites make. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-booth-phase1-2026-10-09.mutations.mjs --fail-on-skipped
const STATE = 'public/newdesign/booth/noraBoothState.mjs';
const FRAME = 'public/newdesign/booth/noraFrame.mjs';
const KEEPER = 'public/newdesign/booth/noraBoothKeeper.mjs';
const HOST = 'public/newdesign/booth/noraBooth.mjs';
const CLUB = 'public/newdesign/booth/club.mjs';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';
const WEB = 'public/newdesign/radio.jsx';
const INSTR = 'public/newdesign/radioInstrument.jsx';

export default {
  test: 'node --test tests/nora-booth-state.test.mjs tests/nora-booth-frame.test.mjs tests/nora-booth-keeper.test.mjs tests/nora-booth-mounts.test.mjs tests/radio-instrument-rules.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── the label ──
    { name: 'the example set stops labelling itself first', file: STATE,
      find: "  if (example) return { key: 'example' };\n", replace: '' },
    { name: 'a station that is not playing reads as on air', file: STATE,
      find: "  if (!st.playing) return { key: 'offAir' };", replace: "  if (st.playing === false && st.bpm == null) return { key: 'offAir' };" },
    { name: 'a guest set no longer names the DJ', file: STATE,
      find: "  if (dj) return { key: 'guest', dj };", replace: '' },
    { name: 'an unmeasured tempo is mimed as a mix', file: STATE,
      find: "  if (!measured(st.bpm)) return { key: 'noBeat' };", replace: '' },
    { name: 'a truthy cue sheet counts as verified', file: STATE,
      find: 'if (st.cueSheet === true) return', replace: 'if (st.cueSheet) return' },
    { name: 'a zero tempo counts as measured', file: STATE,
      find: 'const measured = (v) => Number.isFinite(v) && v > 0;', replace: 'const measured = (v) => Number.isFinite(v);' },
    // ── who hears the example ──
    { name: 'the example plays over the station', file: STATE,
      find: '  if (stationPlaying) return false;\n', replace: '' },
    { name: 'a prospect is treated as a member', file: STATE,
      find: '  if (prospect) return true;\n', replace: '' },
    { name: 'a truthy configuration withholds the example', file: STATE,
      find: 'return stationConfigured !== true;', replace: 'return !stationConfigured;' },
    // ── the tier ──
    { name: 'phones get the desktop rate', file: STATE,
      find: 'export const PHONE_FPS = 30;', replace: 'export const PHONE_FPS = 60;' },
    { name: 'a phone is judged by its long side', file: STATE,
      find: 'const side = Math.min(Number(screenW) || 0, Number(screenH) || 0);', replace: 'const side = Math.max(Number(screenW) || 0, Number(screenH) || 0);' },
    { name: 'the WebGL 2 probe keeps its context', file: STATE,
      find: '    if (lose) lose.loseContext();\n', replace: '' },
    // ── frame pacing ──
    { name: 'the refresh is the median, not the shortest typical frame', file: FRAME,
      find: 'const p = d[Math.floor((d.length - 1) * 0.2)];', replace: 'const p = d[Math.floor((d.length - 1) * 0.5)];' },
    { name: 'the divider loses its slack', file: FRAME,
      find: 'Math.ceil(displayHz / targetFps - 0.1)', replace: 'Math.ceil(displayHz / targetFps)' },
    { name: 'the divider rounds, and 75 Hz runs above the target', file: FRAME,
      find: 'Math.ceil(displayHz / targetFps - 0.1)', replace: 'Math.round(displayHz / targetFps)' },
    { name: 'a frame is due a whole period late', file: FRAME,
      find: 'now - lastRender >= (divider - 0.5) * period', replace: 'now - lastRender >= divider * period' },
    { name: 'before measuring, every tick draws', file: FRAME,
      find: '  let divider = dividerFor(60, targetFps);', replace: '  let divider = 1;' },
    { name: 'reset forgets nothing: a pause is stepped as one long frame', file: FRAME,
      find: '    reset() { lastTick = null; lastRender = null; },', replace: '    reset() { lastTick = null; },' },
    { name: 'a portrait box keeps the 16:9 lens', file: FRAME,
      find: 'if (!Number.isFinite(fovDeg) || !(aspect > 0) || aspect >= ref) return fovDeg;', replace: 'return fovDeg;' },
    { name: 'the lens is not capped', file: FRAME,
      find: 'return Math.min(Math.max(fovDeg, max), Math.max(fovDeg, need));', replace: 'return Math.max(fovDeg, need);' },
    // ── the keeper ──
    { name: 'a released booth keeps drawing', file: KEEPER,
      find: '      if (e.booth) { try { e.booth.stop(); } catch (err) { /* fine */ } }\n      e.timer', replace: '      e.timer' },
    { name: 'an idle booth is never disposed', file: KEEPER,
      find: '      e.timer = T.set(() => { e.timer = null; if (e.holders === 0) finish(e); }, idleMs);', replace: '' },
    { name: 'a return does not cancel the idle timer', file: KEEPER,
      find: '      if (entry && !entry.dead) {\n        if (entry.timer != null) { T.clear(entry.timer); entry.timer = null; }', replace: '      if (entry && !entry.dead) {' },
    { name: 'a booth that arrives after its timer is kept alive', file: KEEPER,
      find: "          try { b.dispose(); } catch (err) { /* already gone */ }\n          const ab", replace: '          const ab' },
    { name: 'a failed build stays the entry, so nothing retries', file: KEEPER,
      find: '        if (entry === e) entry = null;\n        e.dead = true;', replace: '        e.dead = true;' },
    { name: 'a booth that arrives with nobody holding it starts drawing', file: KEEPER,
      find: '        if (e.holders === 0) { try { b.stop(); } catch (err) { /* fine */ } }', replace: '' },
    { name: 'a late screen gets no progress until the next report', file: KEEPER,
      find: '      if (lastProgress != null && entry && !entry.booth) { try { fn(lastProgress); } catch (err) { /* the page\'s */ } }', replace: '' },
    // ── the host ──
    { name: 'the room is handed a negative bar again', file: HOST,
      find: '      const roomBar = Math.max(0, bar);', replace: '      const roomBar = bar;' },
    { name: 'a failed build keeps its WebGL context', file: HOST,
      find: '      try { owned.renderer.forceContextLoss(); } catch (e) { /* already gone */ }\n', replace: '' },
    { name: 'setStation forgets the analyser', file: HOST,
      find: '      stationAn = analyser || null;', replace: '      stationAn = stationAn || null;' },
    // ── the club ──
    { name: 'the laser palette is indexed with a signed modulo', file: CLUB,
      find: 'palette[posMod(Math.floor(state.bar / 8) + (s > 0 ? 0 : (drop > 0.5 ? 2 : 0)), palette.length)]', replace: 'palette[(Math.floor(state.bar / 8) + (s > 0 ? 0 : (drop > 0.5 ? 2 : 0))) % palette.length]' },
    // ── the app mount ──
    { name: 'the app keeps the example playing once it is not the member’s to hear', file: APP,
      find: '    if (!allowed && boothRef.current) boothRef.current.stopExample();\n  }, [allowed, status]);', replace: '  }, [allowed, status]);' },
    { name: 'the app wires the radio graph while nothing plays', file: APP,
      find: 'const an = stationPlaying && window.ShapeRadioLive?.analyser ? window.ShapeRadioLive.analyser() : null;', replace: 'const an = window.ShapeRadioLive?.analyser ? window.ShapeRadioLive.analyser() : null;' },
    { name: 'the app forgets the booth was open', file: APP,
      find: 'const toggleNora = () => setNoraOnState((v) => { bsNoraWanted = !v; return !v; });', replace: 'const toggleNora = () => setNoraOnState((v) => !v);' },
    { name: 'the app imports the booth statically', file: APP,
      find: "import { createBoothKeeper } from '../../../public/newdesign/booth/noraBoothKeeper.mjs';\n", replace: "import { createBoothKeeper } from '../../../public/newdesign/booth/noraBoothKeeper.mjs';\nimport '../../../public/newdesign/booth/noraBooth.mjs';\n" },
    { name: 'the app says LIVE again', file: APP,
      find: "    default: return tr('radio:booth.label.offAir', { defaultValue: 'Off air' });", replace: "    default: return tr('radio:booth.label.offAir', { defaultValue: 'LIVE' });" },
    { name: 'the app releases nothing on unmount', file: APP,
      find: '      setSnap(null);\n      keeper.release();', replace: '      setSnap(null);' },
    // ── the website mount ──
    { name: 'the website treats an unresolved visitor as a prospect', file: WEB,
      find: 'const prospect = radio.signedIn === false;', replace: 'const prospect = !radio.signedIn;' },
    { name: 'the website hands over no graph when it is announced', file: WEB,
      find: '    const bind = (e) => bindStation(e && e.detail);', replace: '    const bind = (e) => void (e && e.detail);' },
    { name: 'the website binds the graph only on the announcement, not on open', file: WEB,
      find: '  React.useEffect(() => { if (state === "open") bindStation(null); }, [state, bindStation]);\n', replace: '' },
    { name: 'the instrument stops announcing the station’s state', file: INSTR,
      find: '    try { window.dispatchEvent(new CustomEvent("shape:radiostate", { detail: window.__shapeRadioState })); } catch (e) {}\n', replace: '' },
  ],
};
