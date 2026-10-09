// noraBooth.mjs — Nora's booth, as one object a page can mount. The app's Radio screen and the
// website's Radio page both load this file (the app through Vite, the website through Radio.html's
// import map), so they draw the same booth from the same code.
//
// It is the prototype's page (prototypes/nora-booth/src/main.mjs) with the page taken out: no
// DOM HUD, no query-string switches, no globals. What a page needs to draw its own HUD comes back
// from `snapshot()` and `onState`, and the page decides the label (noraBoothState.mjs) from it.
//
// Everything the booth does comes from one clock: the example set's bar grid while it plays, the
// station's MEASURED beat while the station plays, and a slow idle sway otherwise — never a beat
// nobody measured. The choreography (noraMix) turns "which bar are we on" into fader/EQ/hand
// targets; the SAME targets drive the audio graph, the mixer model and Nora's hands, so what you
// see her do is what you hear.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

import { createCDJ, CDJ_DIMS } from './cdj3000.mjs';
import { createMixer, DJM_DIMS } from './djmMixer.mjs';
import { createClub } from './club.mjs';
import { createVenue } from './clubVenue.mjs';
import * as MIX from './noraMix.mjs';
import { createDeckAudio, trackWaveform, DEMO_TRACKS } from './deckAudio.mjs';
import { NoraPerformer } from './noraPerformer.mjs';
import { NoraDirector } from './noraDirector.mjs';
import { createTempoTracker } from './tempoBridge.mjs';
import { createCinematic } from './cinematic.mjs';
import { createFramePacer, fitFov } from './noraFrame.mjs';
import { createExampleStarter } from './exampleStart.mjs';
import { tempoKick } from '../radioTempo.mjs';

// The club's own colour. The venue, the gear and the LED wall are lit and baked in it at creation,
// so it is Club Shape's teal rather than the page's accent: an accent changed later could not
// reach the baked parts, and half a room in one colour is worse than a room in its own.
export const CLUB_ACCENT = '#34d6c5';
const TABLE_Y = 0.92;
const FRONT_Z = 0.20;
const DECK_X = [-0.391, 0.391];
const BARS_PER_TRACK = 64;       // the example set's mix cadence
const MIX_BARS = 16;
const PREP_BARS = 8;
const DEFAULT_BPM = 124;         // the example set's declared tempo; it is never DISPLAYED
const IDLE_SWAY_BEATS_PER_S = 0.5; // off air: a slow sway, deliberately no dance tempo
const SIXTEENTHS_PER_BAR = 16;

/** Thrown when the device cannot run the booth at all (no WebGL 2). */
export class BoothUnsupportedError extends Error {
  constructor(msg) { super(msg); this.name = 'BoothUnsupportedError'; }
}

function abortError() {
  const e = new Error('The booth was closed while it loaded');
  e.name = 'AbortError';
  return e;
}

/**
 * Build the booth on `canvas` and resolve once Nora has loaded. It does not draw until `start()`.
 * On any failure (no WebGL 2, the model will not load, the caller aborts) everything it allocated
 * is released before the promise rejects, the WebGL context included.
 *
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {string} o.modelUrl              Nora's VRM
 * @param {string|null} [o.crowdUrl]       the baked crowd pack (crowd.bin.txt); null keeps silhouettes
 * @param {'low'|'high'} [o.quality]
 * @param {boolean} [o.cinematic]          the desktop post chain (high quality only)
 * @param {number} [o.fps]                 the frame-rate target (noraBoothState.boothTier)
 * @param {boolean} [o.reducedMotion]
 * @param {AbortSignal|null} [o.signal]    abort while loading → rejects with an AbortError
 * @param {(f: number) => void} [o.onProgress]  the model download, 0..1, when the size is known
 * @param {(s: object) => void} [o.onState]      the snapshot, whenever a field a page shows changes
 */
export async function createNoraBooth(o) {
  const {
    canvas, modelUrl, crowdUrl = null, quality = 'low', cinematic = false, fps = 30,
    reducedMotion = false, signal = null, onProgress = null, onState = null,
  } = o || {};
  if (!canvas) throw new Error('createNoraBooth: canvas is required');
  if (signal && signal.aborted) throw abortError();

  const owned = { renderer: null, parts: [], composer: null, bloom: null, cine: null, orbit: null };
  const release = () => {
    for (const p of owned.parts.splice(0)) { try { p.dispose(); } catch (e) { /* already gone */ } }
    try { owned.cine && owned.cine.dispose(); } catch (e) { /* already gone */ }
    try { owned.bloom && owned.bloom.dispose(); } catch (e) { /* already gone */ }
    try { owned.composer && owned.composer.dispose(); } catch (e) { /* already gone */ }
    try { owned.orbit && owned.orbit.dispose(); } catch (e) { /* already gone */ }
    if (owned.renderer) {
      try { owned.renderer.dispose(); } catch (e) { /* already gone */ }
      // dispose() frees three's resources but leaves the context alive until garbage collection,
      // and browsers cap live contexts and evict the OLDEST silently. Lose it now.
      try { owned.renderer.forceContextLoss(); } catch (e) { /* already gone */ }
      owned.renderer = null;
    }
  };

  try {
    return await build();
  } catch (e) {
    release();
    throw e;
  }

  async function build() {
    const HIGH = quality === 'high';
    const CINE = HIGH && !!cinematic;

    // ── Renderer ─────────────────────────────────────────────────────────────
    // three r163+ draws only on WebGL 2 and throws on WebGL 1; that throw becomes
    // BoothUnsupportedError above, so a page can say "this device can't run the booth".
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: HIGH, powerPreference: 'high-performance' });
    } catch (e) {
      throw new BoothUnsupportedError((e && e.message) || 'WebGL 2 is not available');
    }
    owned.renderer = renderer;
    renderer.setPixelRatio(Math.min((typeof devicePixelRatio === 'number' && devicePixelRatio) || 1, HIGH ? 2 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Khronos PBR Neutral keeps hues true into the highlights (skin stays skin under three stage
    // lights); see the prototype's comparison of ACES and AgX.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.92;
    // Count a frame's draw calls across every post pass, not just the last one (stats()).
    renderer.info.autoReset = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 150);   // far 150: the skyline stands 50–76 m out
    camera.position.set(0, 1.8, -5.5);

    // Start the 10.8 MB model download NOW, so it runs while the venue bakes its light below.
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    const vrmLoad = new Promise((resolve, reject) => {
      loader.load(modelUrl, resolve, (ev) => {
        if (onProgress && ev && ev.total > 0) { try { onProgress(Math.min(1, ev.loaded / ev.total)); } catch (e) { /* the page's problem */ } }
      }, reject);
    });
    vrmLoad.catch(() => {}); // awaited below; keep an early rejection off the console twice

    // ── Post ─────────────────────────────────────────────────────────────────
    let composer = null, bloom = null, cine = null;
    if (CINE) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      cine = createCinematic({ THREE, Pass, FullScreenQuad, scene, camera, samples: 4, reducedMotion, bars: true });
      owned.cine = cine;
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
      rt.texture.name = 'booth.post';
      composer = new EffectComposer(renderer, rt);
      composer.addPass(cine.passes.scene);     // the scene + sanitize (NaN/Inf to black, HDR clamped)
      composer.addPass(cine.passes.focus);     // light shafts, then depth of field
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.22, 0.85);
      composer.addPass(bloom);
      composer.addPass(cine.passes.streaks);   // anamorphic streaks on the brightest lights
      composer.addPass(new OutputPass());      // tone mapping + sRGB
      composer.addPass(cine.passes.film);      // grade, fringing, vignette, grain
    } else if (HIGH) {
      // MSAA on the composer's own targets: the renderer's `antialias` does nothing once the scene
      // renders into a target (measured in the prototype with rtprobe.cjs).
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      rt.texture.name = 'booth.post';
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      // ⚠ SANITIZE BEFORE BLOOM: one NaN pixel anywhere is spread across every mip and blacks the
      // whole booth (measured in the prototype on a knob shader's flat tops).
      composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = min(c, vec4(32.0)); }',
      }));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.22, 0.85);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }
    owned.composer = composer; owned.bloom = bloom;

    // ── World ────────────────────────────────────────────────────────────────
    const club = createClub({ THREE, renderer, seed: 7, accent: CLUB_ACCENT, quality, reducedMotion, crowdUrl });
    owned.parts.push(club);
    scene.add(club.group);
    const venueT0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const venue = createVenue({ THREE, renderer, seed: 11, quality, reducedMotion, crowdPack: club.crowdPack, now: () => performance.now(), accent: CLUB_ACCENT });
    const venueMs = (typeof performance !== 'undefined' ? performance.now() : 0) - venueT0;
    owned.parts.push(venue);
    scene.add(venue.group);
    const FINISH = HIGH ? 'physical' : 'standard';
    const decks = [1, 2].map((n) => createCDJ({ THREE, deckNumber: n, accent: CLUB_ACCENT, textureScale: HIGH ? 1 : 0.75, finish: FINISH }));
    decks.forEach((d, i) => { d.group.position.set(DECK_X[i], TABLE_Y, FRONT_Z - CDJ_DIMS.d / 2); scene.add(d.group); owned.parts.push(d); });
    const mixer = createMixer({ THREE, accent: CLUB_ACCENT, finish: FINISH });
    mixer.group.position.set(0, TABLE_Y, FRONT_Z - DJM_DIMS.d / 2);
    scene.add(mixer.group);
    owned.parts.push(mixer);
    const mixGlow = new THREE.PointLight(0xffe2c4, 0.035, 1.2, 2);
    scene.add(mixGlow);

    // ── Nora ─────────────────────────────────────────────────────────────────
    const gltf = await vrmLoad;
    if (signal && signal.aborted) { try { VRMUtils.deepDispose(gltf.scene); } catch (e) { /* fine */ } throw abortError(); }
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('The model is not a VRM');
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    scene.add(vrm.scene);
    owned.parts.push({ dispose() { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); } });
    const nora = new NoraPerformer({ THREE, vrm, height: 1.7, stand: { x: 0, y: club.standY || 0, z: 0.36 }, quality, ceiling: false });
    nora.attach(scene);
    owned.parts.unshift(nora); // before the VRM's own deep dispose

    // ── Director + the free camera ───────────────────────────────────────────
    const director = new NoraDirector({ seed: 11, style: reducedMotion ? 'glide' : 'cut', reducedMotion });
    const orbit = new OrbitControls(camera, canvas);
    owned.orbit = orbit;
    orbit.enabled = false;
    orbit.target.set(0, 1.15, 0.2);
    orbit.enableDamping = true;
    orbit.minDistance = 0.6; orbit.maxDistance = 9;
    // Auto: the page keeps vertical scrolling over the canvas. Look around: the canvas takes the drag.
    canvas.style.touchAction = 'pan-y';

    return makeBooth({ renderer, scene, camera, composer, bloom, cine, club, venue, venueMs, decks, mixer, mixGlow, nora, director, orbit });
  }

  function makeBooth(w) {
    const { renderer, scene, camera, composer, cine, club, venue, venueMs, decks, mixer, mixGlow, nora, director, orbit } = w;
    const pacer = createFramePacer({ targetFps: fps });
    const silentT0 = performance.now() / 1000;

    // ── Example set (the device's own AudioContext, created inside a tap) ─────
    let actx = null;
    let audio = null;
    let tempo = createTempoTracker();
    let nextTrackIdx = 0;
    const deckTrack = [null, null];
    const deckStartBar = [0, 0];
    const deckFrom = [0, 0];
    let liveDeck = 0;
    let plan = null;
    const starter = createExampleStarter(() => (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext));

    // ── Station (the page's own analyser on the Shape Radio stream) ──────────
    let stationAn = null;
    let stationPlaying = false;
    let guestOnDecks = false;
    let stationTempo = createTempoTracker();

    const nowSec = () => (actx ? actx.currentTime : performance.now() / 1000 - silentT0);
    const bpm = () => (audio ? audio.bpm : DEFAULT_BPM);
    const secPerBar = () => 240 / bpm();
    const barNow = () => (audio ? (actx.currentTime - audio.t0) / secPerBar() : (performance.now() / 1000 - silentT0) / secPerBar());

    function loadNext(deck) {
      const spec = DEMO_TRACKS[nextTrackIdx % DEMO_TRACKS.length];
      nextTrackIdx++;
      audio.load(deck, spec);
      deckFrom[deck] = 0;
      // The synthesized set keeps the generator's titles, so "Next track" visibly changes, and is
      // marked synthesized where the artist would be; the page says so in its own words.
      deckTrack[deck] = { spec: { name: spec.name, key: spec.key }, synthesized: true, wave: trackWaveform(spec, spec.bars || BARS_PER_TRACK + MIX_BARS * 2) };
    }

    function exampleMixDue(bar) {
      const S = deckStartBar[liveDeck];
      if (!deckTrack[liveDeck] || Math.floor(bar) < S + BARS_PER_TRACK - PREP_BARS - MIX_BARS) return null;
      return { startBar: Math.ceil((bar + PREP_BARS) / 8) * 8, lengthBars: MIX_BARS };
    }
    function scheduleMix(fromBar, due = null) {
      if (!audio || plan) return;
      const startBar = due ? due.startBar : Math.ceil((fromBar + PREP_BARS) / 8) * 8;
      plan = MIX.planTransition({ fromDeck: liveDeck, toDeck: 1 - liveDeck, startBar, lengthBars: due ? due.lengthBars : MIX_BARS });
      plan._loaded = false; plan._played = false; plan._stopped = false;
    }

    function clearExample() {
      if (audio) { try { audio.dispose(); } catch (e) { /* already gone */ } }
      if (actx) { try { actx.close(); } catch (e) { /* already closed */ } }
      audio = null; actx = null; plan = null;
      deckTrack[0] = deckTrack[1] = null;
      deckStartBar[0] = deckStartBar[1] = 0;
      liveDeck = 0;
      tempo = createTempoTracker();
      // The bar clock falls back to the silent clock: restart the shot with it.
      director.shotStartBar = Math.floor(Math.max(0, barNow()));
      director.shotStartT = nowSec();
    }

    /**
     * Start the example set. ⚠ Call it from the tap itself, before any await: the AudioContext is
     * created synchronously here so the browser lets it play.
     */
    function playExample() {
      if (disposed || audio || starter.pending) return Promise.resolve(false);
      // The context is made here, synchronously, inside the tap. It is handed back only once it is
      // RUNNING: a refused resume, or a stopExample() while it resumes, resolves null and closes it,
      // so the booth never claims a set nobody can hear (exampleStart.mjs).
      const started = starter.start();
      emit(true);
      return started.then((ctx) => {
        if (!ctx) { emit(true); return false; }
        if (disposed || audio || !starter.isCurrent(ctx)) { try { ctx.close(); } catch (e) { /* fine */ } emit(true); return false; }
        actx = ctx;
        audio = createDeckAudio({ ctx: actx, bpm: DEFAULT_BPM });
        loadNext(0);
        audio.setChannel(0, { fader: 1, low: 0, mid: 0, hi: 0 });
        audio.setChannel(1, { ...MIX.CHANNEL_REST });
        audio.setXfader(0);
        audio.play(0, { atBar: 0, fromBar: 0 });
        deckStartBar[0] = 0;
        liveDeck = 0;
        // The bar clock just restarted from 0, so the director's shot restarts with it (#2189's
        // frozen-camera fix: a shot begun at silent bar 40 would not be due until bar 48 of the set).
        director.shotStartBar = Math.floor(Math.max(0, barNow()));
        director.shotStartT = nowSec();
        // A booth that is not drawing does not play either; start() resumes it.
        if (!running) actx.suspend().catch(() => {});
        emit(true);
        return true;
      });
    }
    function stopExample() {
      // Reaches a start still resuming as well as a set already playing.
      starter.cancel();
      if (audio || actx) clearExample();
      emit(true);
    }
    function nextTrack() { if (audio) scheduleMix(barNow()); }

    function setStation({ analyser = null, playing = false, guest = false } = {}) {
      if (analyser !== stationAn) stationTempo = createTempoTracker();
      stationAn = analyser || null;
      stationPlaying = !!playing;
      guestOnDecks = !!guest;
      emit(true);
    }

    function setCamera(mode) {
      const m = mode === 'free' ? 'free' : 'auto';
      if (m === 'free') { orbit.target.set(0, 1.15, 0.2); }
      director.setMode(m, barNow(), nowSec());
      orbit.enabled = m === 'free';
      canvas.style.touchAction = m === 'free' ? 'none' : 'pan-y';
      emit(true);
    }

    // ── Anchors for hands + camera ───────────────────────────────────────────
    const V = () => new THREE.Vector3();
    const A = { jog: [V(), V()], jogEdge: [V(), V()], screen: [V(), V()], browse: [V(), V()], play: [V(), V()], cue: [V(), V()],
      pad: [V(), V()],
      ch: [0, 1, 2, 3].map(() => ({ fader: V(), hi: V(), mid: V(), low: V(), color: V(), cue: V() })), xfader: V(), mixer: V(), head: V(), cupL: V(), cupR: V() };
    function refreshAnchors() {
      decks.forEach((d, i) => {
        d.anchors.jog.getWorldPosition(A.jog[i]);
        d.anchors.jogEdge.getWorldPosition(A.jogEdge[i]);
        d.anchors.screen.getWorldPosition(A.screen[i]);
        d.anchors.browse.getWorldPosition(A.browse[i]);
        d.anchors.play.getWorldPosition(A.play[i]);
        d.anchors.cue.getWorldPosition(A.cue[i]);
        d.anchors.pads[0].getWorldPosition(A.pad[i]);
      });
      mixer.anchors.ch.forEach((c, i) => {
        c.fader.getWorldPosition(A.ch[i].fader); c.hi.getWorldPosition(A.ch[i].hi);
        c.mid.getWorldPosition(A.ch[i].mid); c.low.getWorldPosition(A.ch[i].low); c.cue.getWorldPosition(A.ch[i].cue);
        if (c.color) c.color.getWorldPosition(A.ch[i].color);
      });
      mixer.anchors.xfader.getWorldPosition(A.xfader);
      mixer.group.getWorldPosition(A.mixer); A.mixer.y += DJM_DIMS.h;
      mixGlow.position.set(A.mixer.x, A.mixer.y + 0.2, A.mixer.z - 0.05);
      nora.point('head', A.head);
      if (nora.headphones) { nora.headphones.userData.cups[0].getWorldPosition(A.cupL); nora.headphones.userData.cups[1].getWorldPosition(A.cupR); }
    }
    function handFor(side, h) {
      const id = h && (h.to || h.target);
      if (!id || id === 'rest') return null;
      let m;
      const out = { pos: V(), palm: 'pinch', grip: h.grip };
      if ((m = /^jog([12])$/.exec(id))) { out.pos.copy(A.jogEdge[+m[1] - 1]); out.palm = 'down'; }
      else if ((m = /^fader([1-4])$/.exec(id))) out.pos.copy(A.ch[+m[1] - 1].fader);
      else if ((m = /^(hi|mid|low|color)([1-4])$/.exec(id))) out.pos.copy(A.ch[+m[2] - 1][m[1]]);
      else if ((m = /^pad([12])$/.exec(id))) out.pos.copy(A.pad[+m[1] - 1]);
      else if ((m = /^cue([1-4])$/.exec(id))) out.pos.copy(A.ch[+m[1] - 1].cue);
      else if ((m = /^browse([12])$/.exec(id))) out.pos.copy(A.browse[+m[1] - 1]);
      else if ((m = /^play([12])$/.exec(id))) out.pos.copy(A.play[+m[1] - 1]);
      else if (id === 'xfader') out.pos.copy(A.xfader);
      else if (id === 'ear') { out.pos.copy(side === 'left' ? A.cupL : A.cupR); out.palm = 'ear'; }
      else if (id === 'air') { out.pos.copy(A.head).add(new THREE.Vector3(side === 'left' ? -0.28 : 0.28, 0.5, -0.12)); out.palm = 'air'; }
      else return null;
      return out;
    }

    // ── The decks' screens: the deck's own content around the playhead ───────
    const mixerState = { ch: [0, 1, 2, 3].map(() => ({ fader: 0, trim: 0, hi: 0, mid: 0, low: 0, color: 0, cue: false, level: 0 })), xfader: 0, master: { l: 0, r: 0 }, fx: { on: false, name: 'ECHO', beat: '1/2', level: 0.5 }, bpm: null };
    function deckScreen(i, bar) {
      const tr = deckTrack[i];
      if (!tr) return { deckLabel: 'DECK ' + (i + 1), loaded: false, color: i === 0 ? '#34d6c5' : '#e0a24a' };
      const playing = audio && audio.deckPlaying[i];
      const localBar = playing ? bar - deckStartBar[i] + deckFrom[i] : deckFrom[i];
      const pos = Math.max(0, Math.floor(localBar * SIXTEENTHS_PER_BAR));
      const wv = tr.wave;
      const win = [];
      for (let k = pos - 48; k < pos + 48; k++) win.push(wv[k] || { low: 0, mid: 0, high: 0 });
      const total = wv.length / SIXTEENTHS_PER_BAR;
      // ⚠ NO ADVANCE ANNOUNCEMENT. A cued deck shows its waveform (a shape, not a name) and the title
      // only once its channel is audible — the rule the licensed station will have to follow.
      const audible = playing && (mixerState.ch[i + 1].fader || 0) > 0.25;
      return {
        deckLabel: 'DECK ' + (i + 1), title: audible ? tr.spec.name : 'Cued', artist: '', bpm: mixerState.bpm, key: tr.spec.key || '—',
        elapsed: localBar * secPerBar(), remaining: Math.max(0, (total - localBar) * secPerBar()), beatInBar: Math.floor(((bar % 1) + 1) % 1 * 4),
        waveColumns: win, overview: overviewOf(tr), playhead: Math.min(1, localBar / total), loaded: true,
        color: i === 0 ? '#34d6c5' : '#e0a24a',
      };
    }
    function overviewOf(tr) {
      if (tr._ov) return tr._ov;
      const n = 160, wv = tr.wave, step = wv.length / n, ov = [];
      for (let k = 0; k < n; k++) {
        let lo = 0, mi = 0, hi = 0, c = 0;
        for (let j = Math.floor(k * step); j < Math.floor((k + 1) * step); j++) { lo += wv[j].low; mi += wv[j].mid; hi += wv[j].high; c++; }
        ov.push({ low: lo / (c || 1), mid: mi / (c || 1), high: hi / (c || 1) });
      }
      return (tr._ov = ov);
    }

    // ── Drop detection: the kick returns after ≥ 2 quiet bars ────────────────
    const lowHist = [];
    let dropEnv = 0, lastBarSeen = -1;
    function trackDrop(bar, low) {
      const wb = Math.floor(bar);
      if (wb !== lastBarSeen) {
        lowHist.push(low); if (lowHist.length > 6) lowHist.shift();
        lastBarSeen = wb;
        const n = lowHist.length;
        if (n >= 4 && lowHist[n - 1] > 0.18 && lowHist[n - 2] < 0.08 && lowHist[n - 3] < 0.08) dropEnv = 1;
      }
    }

    const freq = new Uint8Array(256);
    const stationFreq = new Uint8Array(256);
    const deckFreq = [new Uint8Array(256), new Uint8Array(256)];
    const bandsOf = (f) => {
      const n = f.length; let lo = 0, mi = 0, hi = 0;
      for (let i = 0; i < n; i++) { const v = f[i] / 255; if (i < n * 0.08) lo += v; else if (i < n * 0.4) mi += v; else hi += v; }
      const bl = lo / (n * 0.08), bm = mi / (n * 0.32), bh = hi / (n * 0.6);
      return { low: bl, mid: bm, high: bh, level: (bl + bm + bh) / 3 };
    };
    // A stream analyser may have any FFT size; the bands are fractions of it, so read what it has.
    let stationBins = stationFreq;
    const jogAngle = [0, 0];
    let lookSide = 1;
    let camOut = null;
    const idleLook = new THREE.Vector3(0, 1.4, -5);

    // ── Size ─────────────────────────────────────────────────────────────────
    let lastW = 0, lastH = 0;
    function resize() {
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch || (cw === lastW && ch === lastH)) return;
      lastW = cw; lastH = ch;
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch; camera.updateProjectionMatrix();
      if (composer) composer.setSize(cw, ch);
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    if (ro) ro.observe(canvas);

    // ── Visibility: draw only while somebody can see it ──────────────────────
    let onScreen = true;
    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((es) => { for (const e of es) onScreen = e.isIntersecting; }, { threshold: 0 })
      : null;
    if (io) io.observe(canvas);
    let running = false;
    let wasRunning = false;   // running when the page hid, so it resumes when the page shows
    let raf = 0;
    let disposed = false;
    const onVis = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) { wasRunning = running; if (running) pause(); }
      else if (wasRunning) { wasRunning = false; start(); }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

    let frames = 0;      // ticks that drew
    let lastEmit = '';
    const listeners = new Set();

    function snapshot() {
      const tr = audio ? deckTrack[liveDeck] : null;
      const audible = !!(tr && audio && audio.deckPlaying[liveDeck] && (mixerState.ch[liveDeck + 1].fader || 0) > 0.25);
      return {
        example: !!audio,
        starting: starter.pending,
        station: stationPlaying && !!stationAn,
        guest: guestOnDecks,
        // A measured number or null, never the example set's declared 124.
        bpm: Number.isFinite(mixerState.bpm) && mixerState.bpm > 0 ? Math.round(mixerState.bpm * 10) / 10 : null,
        // The title only once the listener can hear it.
        track: audible ? { name: tr.spec.name, synthesized: !!tr.synthesized } : null,
        camera: director.mode === 'free' ? 'free' : 'auto',
        running,
      };
    }
    function emit(force) {
      if (!onState && !listeners.size) return;
      const s = snapshot();
      const k = JSON.stringify(s);
      if (!force && k === lastEmit) return;
      lastEmit = k;
      if (onState) { try { onState(s); } catch (e) { /* the page's problem */ } }
      for (const fn of listeners) { try { fn(s); } catch (e) { /* the page's problem */ } }
    }
    // A page that outlives one mount (the app keeps the booth across tab switches) subscribes per
    // mount; the current snapshot arrives at once.
    function subscribe(fn) {
      listeners.add(fn);
      try { fn(snapshot()); } catch (e) { /* the page's problem */ }
      return () => listeners.delete(fn);
    }

    // ── The frame ────────────────────────────────────────────────────────────
    function step(dt) {
      const t = nowSec();
      const bar = barNow();
      const beat = bar * 4;
      const phase = beat - Math.floor(beat);
      const kickShape = Math.pow(1 - phase, 4);

      // What the room hears, and the beat it has MEASURED.
      let bands = { low: 0, mid: 0, high: 0, level: 0 };
      let noraBeat = t * IDLE_SWAY_BEATS_PER_S;
      let noraKick = 0;
      let energy = 0.12;
      let roomKick = 0;
      let measuredBpm = null;
      if (audio) {
        audio.analyser.getByteFrequencyData(freq);
        bands = bandsOf(freq);
        tempo.push(freq, t);
        audio.deckAnalysers.forEach((a, i) => a.getByteFrequencyData(deckFreq[i]));
        trackDrop(bar, bands.low);
        measuredBpm = tempo.bpm();
        // The example set's grid is the engine's own (it scheduled every note), so her groove may
        // follow it; the NUMBER on screen is still only what the detector measured.
        noraBeat = beat; noraKick = kickShape; roomKick = kickShape * Math.min(1, bands.low * 3);
        energy = Math.min(1, bands.level * 2.2);
      } else if (stationAn && stationPlaying) {
        if (stationBins.length !== stationAn.frequencyBinCount) stationBins = new Uint8Array(stationAn.frequencyBinCount);
        stationAn.getByteFrequencyData(stationBins);
        bands = bandsOf(stationBins);
        const st = stationAn.context ? stationAn.context.currentTime : t;
        stationTempo.push(stationBins, st);
        measuredBpm = stationTempo.bpm();
        energy = Math.min(1, bands.level * 2.2);
        const ph = stationTempo.phase();
        if (measuredBpm && Number.isFinite(ph)) {
          // A measured grid: her groove and the room's kick sit on it.
          noraBeat = (st - ph) * (measuredBpm / 60);
          noraKick = tempoKick(measuredBpm, ph, st, 0.075) || 0;
          roomKick = noraKick * Math.min(1, bands.low * 3);
        }
      }
      dropEnv = Math.max(0, dropEnv - dt / (secPerBar() * 4));
      const drop = audio ? dropEnv : 0;

      // Mix choreography — the example set only. On the station she mixes nothing (§4: no mix
      // fires off a stream nobody has located), and off air her hands rest.
      let ms = null;
      if (audio) {
        if (!plan) { const due = exampleMixDue(bar); if (due) scheduleMix(bar, due); }
        if (plan) {
          ms = MIX.mixState(plan, bar);
          const to = plan.toDeck, from = plan.fromDeck;
          if (!plan._loaded && ms.phase !== 'idle') { loadNext(to); plan._loaded = true; }
          if (!plan._played && bar >= plan.startBar - 1) { audio.play(to, { atBar: plan.startBar, fromBar: deckFrom[to] }); deckStartBar[to] = plan.startBar; plan._played = true; }
          if (!plan._stopped && ms.s != null && ms.s >= 0 && ms.playing && ms.playing[from] === false) { audio.stop(from); plan._stopped = true; }
          if (ms.phase === 'done') {
            if (!plan._stopped) { audio.stop(from); plan._stopped = true; }
            liveDeck = to; plan = null;
            ms = MIX.idleState(bar, liveDeck);
          }
        } else {
          ms = MIX.idleState(bar, liveDeck);
        }
        for (const d of [0, 1]) {
          const c = ms.ch && ms.ch[d];
          if (c) {
            audio.setChannel(d, c);
            Object.assign(mixerState.ch[d + 1], { fader: c.fader, low: c.low, mid: c.mid ?? 0, hi: c.hi ?? 0, color: c.color ?? 0 });
          }
          mixerState.ch[d + 1].cue = !!(ms.cueOn && ms.cueOn[d]);
        }
        if (ms.xfader != null) { audio.setXfader(ms.xfader); mixerState.xfader = ms.xfader; }
      } else {
        for (const d of [0, 1]) Object.assign(mixerState.ch[d + 1], { fader: 0, low: 0, mid: 0, hi: 0, color: 0, cue: false });
        mixerState.xfader = 0;
      }

      // Gear.
      mixerState.bpm = measuredBpm;
      for (let d = 0; d < 2; d++) {
        const lv = audio ? bandsOf(deckFreq[d]).level * 1.6 : 0;
        mixerState.ch[d + 1].level = Math.min(1, lv * (mixerState.ch[d + 1].fader || 0));
        const playing = !!(audio && audio.deckPlaying[d]);
        if (playing) jogAngle[d] -= dt * (33.333 / 60) * Math.PI * 2 * (1 + 0.08 * ((ms && ms.nudge && ms.nudge[d]) || 0));
        decks[d].set({
          playing, jogAngle: jogAngle[d],
          jogTouch: !!(ms && ms.jogTouch && ms.jogTouch[d]),
          tempo: 0, onAir: playing && mixerState.ch[d + 1].fader > 0.05,
          padsLit: [null, null, null, null, null, null, null, null],   // no cue data: nothing lit or labelled
          screen: deckScreen(d, bar),
        });
        decks[d].update(dt, t);
      }
      const m = (mixerState.ch[1].level + mixerState.ch[2].level) / 2;
      mixerState.master.l = Math.min(1, m * 1.1); mixerState.master.r = Math.min(1, m * 1.05);
      mixer.set(mixerState); mixer.update(dt, t);
      // The engine starts 0.1 s ahead of its own bar 0, so the clock reads just below zero for a
      // frame or two: the room counts from 0, never from -1.
      const roomBar = Math.max(0, bar);
      const roomState = { bands, kick: roomKick, beat: Math.floor(roomBar * 4) % 4, bar: Math.floor(roomBar), drop, accent: CLUB_ACCENT, reducedMotion };
      club.set(roomState); club.update(dt, t);
      venue.set(roomState); venue.update(dt, t);

      // Nora. During a human Shape Set she steps off the decks (ruling 1): there is never a 3D
      // stand-in for a real DJ.
      const vrmScene = nora.vrm.scene;
      vrmScene.visible = !guestOnDecks;
      if (nora.headphones) nora.headphones.visible = !guestOnDecks;
      refreshAnchors();
      const handsPlan = ms && ms.hands ? ms.hands : null;
      const hands = handsPlan ? { left: handFor('left', handsPlan.left), right: handFor('right', handsPlan.right) } : {};
      const look = (ms && ms.camHint === 'screen') ? A.screen[plan ? plan.toDeck : liveDeck]
        : (hands.left || hands.right) ? (hands.right && hands.right.palm !== 'air' ? hands.right.pos : hands.left ? hands.left.pos : A.mixer)
        : idleLook;
      lookSide = look.x >= A.head.x ? 1 : -1;
      if (!guestOnDecks) {
        nora.update(dt, { t, beat: noraBeat, kick: noraKick, energy, hands, look, drop });
        refreshAnchors();
      }

      // Camera.
      if (director.mode === 'free') {
        orbit.update();
      } else {
        const ctx = { head: A.head, jog: A.jog, screen: A.screen, mixer: A.mixer, deck: liveDeck, lookSide,
          incoming: plan ? plan.toDeck : null, hint: ms ? ms.camHint : null, drop: drop > 0.5, kick: audio && !reducedMotion ? kickShape : 0 };
        camOut = director.update(t, bar, ctx, secPerBar(), dt);
        camera.position.set(camOut.pos.x, camOut.pos.y, camOut.pos.z);
        camera.lookAt(camOut.target.x, camOut.target.y, camOut.target.z);
        const fov = fitFov(camOut.fov, camera.aspect);
        if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      }
      if (cine) {
        const T = director.mode === 'free' ? orbit.target : camOut && camOut.target;
        const focus = T ? camera.position.distanceTo(T) : 6;
        cine.update({ dt, shot: director.mode === 'free' ? 'free' : director.shot, focus, level: bands.level, drop });
      }
    }

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const p = pacer.tick(now);
      if (!p.render) return;
      const dt = Math.min(p.dt, 0.1);
      resize();
      step(dt);
      // Logic runs while the booth is scrolled away (the mix stays on its bars); the GPU does not.
      if (onScreen) {
        renderer.info.reset();
        if (composer) composer.render(); else renderer.render(scene, camera);
        frames++;
      }
      emit(false);
    }

    function start() {
      if (disposed || running) return;
      running = true;
      pacer.reset();
      if (actx && actx.state === 'suspended') {
        // Resuming after a hidden page or a detached booth can be refused (an iOS audio interruption
        // wants a new tap). Then the set is not playing, so the booth stops saying it is.
        const c = actx;
        c.resume().catch(() => { if (actx === c) { clearExample(); emit(true); } });
      }
      raf = requestAnimationFrame(frame);
      emit(true);
    }
    function pause() {
      if (!running) return;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // The example set pauses with the picture: nobody is watching her mix.
      if (actx && actx.state === 'running') actx.suspend().catch(() => {});
    }
    function stop() { wasRunning = false; pause(); emit(true); }

    function dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      starter.cancel();
      listeners.clear();
      clearExample();
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
      try { scene.remove(mixGlow); mixGlow.dispose(); } catch (e) { /* fine */ }
      release();
    }

    resize();
    emit(true);
    return {
      canvas, start, stop, dispose, resize, snapshot, subscribe,
      playExample, stopExample, nextTrack, setStation, setCamera,
      get disposed() { return disposed; },
      // Diagnostics for the Chromium harness (draw calls, frames, the measured refresh).
      stats() {
        const info = renderer.info.render;
        return { frames, calls: info.calls, triangles: info.triangles, hz: pacer.hz, divider: pacer.divider, fps, quality, cinematic: !!cine, reducedMotion: !!reducedMotion, venueMs: Math.round(venueMs) };
      },
    };
  }
}
