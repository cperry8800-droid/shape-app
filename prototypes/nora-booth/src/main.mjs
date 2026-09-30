// Nora's Booth — the integration. Everything the booth does comes from one clock:
// the audio engine's bar grid. The choreography (noraMix) turns "which bar are we on"
// into fader/EQ/hand targets; the SAME targets drive the audio graph, the mixer model
// and Nora's hands, so what you see her do is literally what you hear.
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
import { analyzeTrack, bufferWaveform } from './trackAnalysis.mjs';
import { NoraPerformer } from './noraPerformer.mjs';
import { NoraDirector, SHOTS, SHOT_IDS } from './noraDirector.mjs';
import { createTempoTracker } from './tempoBridge.mjs';
import { createCinematic } from './cinematic.mjs';

const Q = new URLSearchParams(location.search);
const ACCENT = '#34d6c5';
const TABLE_Y = 0.92;
const FRONT_Z = 0.20;
const QUALITY = Q.get('q') === 'low' || (Q.get('q') !== 'high' && Math.min(screen.width, screen.height) < 600) ? 'low' : 'high';
const BARS_PER_TRACK = 64;       // auto-mix cadence in the preview
const MIX_BARS = 16;
const PREP_BARS = 8;

// ── Renderer ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY === 'high', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY === 'high' ? 2 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Tone mapping. ACES pushed every bright skin highlight toward a hue-shifted grey-white and
// crushed the dark room; Khronos PBR Neutral keeps hues true up to the highlights (skin stays
// skin under three stage lights) and AgX rolls a hot coloured light off to white gracefully.
// ?tm=agx|neutral|aces switches for comparison; the exposure is per operator, tuned by eye.
const TONE = { neutral: [THREE.NeutralToneMapping, 0.92], agx: [THREE.AgXToneMapping, 1.18], aces: [THREE.ACESFilmicToneMapping, 1.05] };
const [toneOp, toneExp] = TONE[Q.get('tm')] || TONE.neutral;
renderer.toneMapping = toneOp;
renderer.toneMappingExposure = Q.get('exp') ? +Q.get('exp') : toneExp;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 150);   // far 150: the skyline stands 50–76 m out from the skylight
camera.position.set(0, 1.8, -5.5);

// Reduced motion is read before the post chain is built (the cinematic grain holds still under it).
const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// The cinematic tier (cinematic.mjs): light shafts off the screen, depth of field set per shot,
// anamorphic streaks, a film finish and 2.39:1 bars. On by default on the high tier (desktops), the
// owner's word: "as cinematic as possible". ?cine=0 turns it all off for comparison, ?bars=0 keeps the
// rest without the bars. Phones (the low tier) never run it.
const CINE = QUALITY === 'high' && Q.get('cine') !== '0';
let cine = null;

let composer = null, bloom = null;
function setupPost() {
  if (QUALITY !== 'high') return;
  if (CINE) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    cine = createCinematic({ THREE, Pass, FullScreenQuad, scene, camera, samples: Q.get('msaa') === '0' ? 0 : 4, reducedMotion: REDUCED_MOTION, bars: Q.get('bars') !== '0' });
    // the scene renders into the cinematic pass's own MSAA target (with depth); the composer's
    // ping-pong targets only carry full-screen passes, so they need no samples of their own
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    rt.texture.name = 'booth.post';
    composer = new EffectComposer(renderer, rt);
    composer.addPass(cine.passes.scene);     // the scene + sanitize (NaN/Inf to black, HDR clamped)
    composer.addPass(cine.passes.focus);     // light shafts, then depth of field
    if (Q.get('post') !== 'nobloom') { bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.22, 0.85); composer.addPass(bloom); }
    composer.addPass(cine.passes.streaks);   // anamorphic streaks on the brightest lights
    composer.addPass(new OutputPass());      // tone mapping + sRGB
    composer.addPass(cine.passes.film);      // grade, fringing, vignette, grain (display-referred)
    return;
  }
  // ⚠ MSAA. The composer renders the scene into its own half-float target, and that target had no
  // samples — so the renderer's `antialias: true` did nothing on the high tier (measured with
  // rtprobe.cjs: no multisampled renderbuffer was ever allocated). Every thin edge — rails, faders,
  // the crowd's silhouettes — was aliased. The composer ping-pongs between its two targets across
  // passes AND frames, so both carry the samples.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.get('msaa') === '0' ? 0 : 4 });
  rt.texture.name = 'booth.post';
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // ⚠ SANITIZE BEFORE BLOOM. Bloom blurs, so ONE NaN or Infinity pixel anywhere in the
  // frame (a zero-length normal in some shader, an emissive that overflows the half-float
  // target) is spread across every mip and the whole booth goes black. Measured: a knob
  // shader's normalize(cross(axis, normal)) on flat knob tops did exactly that at 900×560.
  // Zero non-finite pixels and clamp HDR here, so no single module can black the frame.
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = min(c, vec4(32.0)); }',
  }));
  if (Q.get('post') !== 'nobloom') {
    // The glow already ran at half the drawing buffer (EffectComposer.setSize → UnrealBloomPass.setSize
    // halves it; measured 640×360 at 1280×720 — the 256×256 in the constructor is overwritten on the
    // first resize). What made the halos read soft and blocky was the weighting: radius 0.5 gives the
    // two coarsest mips (80×45 and 40×23, bilinearly upsampled) as much weight as the fine ones. A
    // tighter radius keeps the glow on the fine mips, so a lit edge gets a crisp halo instead of a smear.
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.22, 0.85);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
}
setupPost();

function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h); // sizes every pass, bloom included (it halves what it is given)
}
addEventListener('resize', resize);

// ── World ───────────────────────────────────────────────────────────────────
const club = createClub({ THREE, renderer, seed: 7, accent: ACCENT, quality: QUALITY, reducedMotion: REDUCED_MOTION });
scene.add(club.group);
// Club Shape itself: the atrium, balconies, palms, lounges and the skylight ring.
// The venue bakes its lighting on load (lightBake.mjs); how long that takes is timed here, since the
// venue module itself reads no clock. window.__booth.venueMs reports it.
const venueT0 = performance.now();
const venue = createVenue({ THREE, renderer, seed: 11, quality: QUALITY, reducedMotion: REDUCED_MOTION, crowdPack: club.crowdPack, now: () => performance.now(), accent: ACCENT });
const venueMs = performance.now() - venueT0;
scene.add(venue.group);
const FINISH = QUALITY === 'high' ? 'physical' : 'standard';
const decks = [1, 2].map((n) => createCDJ({ THREE, deckNumber: n, accent: ACCENT, textureScale: QUALITY === 'high' ? 1 : 0.75, finish: FINISH }));
const DECK_X = [-0.391, 0.391];
decks.forEach((d, i) => { d.group.position.set(DECK_X[i], TABLE_Y, FRONT_Z - CDJ_DIMS.d / 2); scene.add(d.group); });
const mixer = createMixer({ THREE, accent: ACCENT, finish: FINISH });
mixer.group.position.set(0, TABLE_Y, FRONT_Z - DJM_DIMS.d / 2);
scene.add(mixer.group);

// Deck-screen underglow: in a real booth the DJ's face is lit from below by the players'
// screens — a cool, soft fill that also keeps the underside of her fringe from going black.
const glow = [];
for (let i = 0; i < 2; i++) {
  // The screen underglow is OFF: a point light a few centimetres under a hand on the jog lit the
  // skin far past the ceiling and every close shot showed a white mannequin hand. The screens
  // are emissive already; the deck's own edge glow is drawn, not lit.
  const L = new THREE.PointLight(0xcfe6ff, 0, 1.3, 2); L.visible = false;
  scene.add(L); glow.push(L);
}
const mixGlow = new THREE.PointLight(0xffe2c4, 0.035, 1.2, 2);
scene.add(mixGlow);

// ── Audio + clock ───────────────────────────────────────────────────────────
let audio = null;            // the deck engine once started
let actx = null;
const tempo = createTempoTracker();
const trackOrder = DEMO_TRACKS.map((_, i) => i);
let nextTrackIdx = 0;
const deckTrack = [null, null];
const deckStartBar = [0, 0];
let liveDeck = 0;
let plan = null;             // the current transition plan (noraMix)
let pendingMix = false;
const silentT0 = performance.now() / 1000;
const DEFAULT_BPM = 124;

function nowSec() { return actx ? actx.currentTime : performance.now() / 1000 - silentT0; }
function bpm() { return audio ? audio.bpm : DEFAULT_BPM; }
function secPerBar() { return 240 / bpm(); }
function barNow() { return audio ? (actx.currentTime - audio.t0) / secPerBar() : (performance.now() / 1000 - silentT0) / secPerBar(); }

// ── The station ─────────────────────────────────────────────────────────────
// Shape Radio plays the music and decides when songs change; Nora follows. In this preview
// the "station" is the owner's own Higgsfield-generated house tracks (the Sources table in
// marketing/shape-radio-launch-cut.md), blended back to back the way the station's
// automation will, and Nora performs each blend. The tracks have no titles of their own, so
// the decks name them by what they are — never an invented title or artist.
const STATION = [
  { file: 'hf_20260903_164640_5a06417b-ce80-4651-a5c1-1dc026ddbe9b.m4a', name: 'Melodic House · Analog Chords' },
  { file: 'hf_20260903_164640_1eb7850f-c97e-4e56-8cbc-c250be32e92b.m4a', name: 'Melodic Progressive · Plucked Arp' },
  { file: 'hf_20260903_164640_d3535005-a4f4-4b01-b3a3-6b575e193c59.m4a', name: 'Melodic Deep House · Rhodes' },
  { file: 'hf_20260903_164640_26a60d67-53cd-4b17-a0d4-261be0f9488e.m4a', name: 'Melodic House Anthem · Big Lead' },
];
const STATION_ARTIST = 'Shape Radio original';
let station = null;          // decoded + analysed tracks, or null → the synthesized example set
let masterBpm = DEFAULT_BPM;
const deckFrom = [0, 0];     // the track bar each deck started from

// Decode with an OfflineAudioContext so it can run at page load, before any tap (an
// AudioBuffer is not tied to the context that decoded it). A track that will not load or
// measure is skipped, never faked; fewer than two good tracks → the synthesized example set.
async function loadStation() {
  if (Q.get('synth')) return null;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC || typeof fetch !== 'function') return null;
  const dec = new OAC(2, 44100, 44100);
  const out = [];
  for (const e of STATION) {
    try {
      const r = await fetch('tracks/' + e.file.replace(/\.m4a$/, '.mp4')); // published as .mp4: same MP4/AAC container, and the artifact host serves no .m4a type
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buffer = await dec.decodeAudioData(await r.arrayBuffer());
      const ch = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      const meta = analyzeTrack(ch, buffer.sampleRate);
      if (!(meta && meta.bpm > 0 && meta.confidence >= 0.5)) throw new Error('no confident beat grid');
      out.push({ ...e, artist: STATION_ARTIST, buffer, meta, wave: bufferWaveform(ch, buffer.sampleRate, meta) });
    } catch (err) { console.info('[booth] skipping station track', e.name, String(err && err.message || err)); }
  }
  if (out.length < 2) return null;
  const bpms = out.map((t) => t.meta.bpm).sort((a, b) => a - b);
  masterBpm = Math.round(bpms[Math.floor(bpms.length / 2)] * 10) / 10;   // the median, rounded
  station = out;
  document.body.classList.add('station');
  return out;
}
const stationReady = loadStation();

async function startSet() {
  if (audio || startSet._busy) return;
  startSet._busy = true;
  const startBtn = document.getElementById('start');
  if (startBtn) startBtn.textContent = 'Loading the station…';
  const AC = window.AudioContext || window.webkitAudioContext;
  actx = new AC();                                   // created inside the tap, so it may play
  const resumed = actx.state === 'running' ? null : actx.resume().catch(() => {});
  await stationReady;
  if (resumed) await resumed;
  audio = createDeckAudio({ ctx: actx, bpm: station ? masterBpm : DEFAULT_BPM });
  loadNext(0, { first: true });
  audio.setChannel(0, { fader: 1, low: 0, mid: 0, hi: 0 });
  audio.setChannel(1, { ...MIX.CHANNEL_REST });
  audio.setXfader(0);
  audio.play(0, { atBar: 0, fromBar: deckFrom[0] });
  deckStartBar[0] = 0;
  liveDeck = 0;
  document.body.classList.add('live');
  startSet._busy = false;
}

function loadNext(deck, { first = false } = {}) {
  if (station) {
    const tr = station[nextTrackIdx % station.length];
    nextTrackIdx++;
    audio.loadBuffer(deck, tr.buffer, tr.meta, { name: tr.name, artist: tr.artist, key: '' });
    deckFrom[deck] = first ? 0 : (tr.meta.mixInFromBar || 0);
    deckTrack[deck] = { spec: { name: tr.name, artist: tr.artist, key: '' }, wave: tr.wave, meta: tr.meta };
    return;
  }
  const spec = DEMO_TRACKS[trackOrder[nextTrackIdx % trackOrder.length]];
  nextTrackIdx++;
  audio.load(deck, spec);
  deckFrom[deck] = 0;
  deckTrack[deck] = { spec, wave: trackWaveform(spec, spec.bars || BARS_PER_TRACK + MIX_BARS * 2) };
}

// Where the station blends out of the live track: at the track's own measured mix-out bar,
// with a blend that finishes before its outro — or, for the synthesized set, every
// BARS_PER_TRACK. Returns { startBar, lengthBars } in master bars, or null if not yet due.
function stationMixDue(bar) {
  const tr = deckTrack[liveDeck];
  if (!tr) return null;
  const S = deckStartBar[liveDeck], F = deckFrom[liveDeck];
  if (tr.meta) {
    const m = tr.meta;
    // The analysis places mixOutBar where a full 16-bar blend still ends before the outro. A
    // one-minute track is only ~30 bars, so a 16-bar blend (plus 8 bars of prep) would leave it
    // barely any time on its own: short tracks get an 8-bar blend that ends at the same point.
    const room = Math.floor((m.outroBar + 1 - m.mixOutBar) / 4) * 4;
    const L = Math.max(MIX.MIN_LENGTH_BARS, Math.min(m.lengthBars < 48 ? 8 : MIX_BARS, room));
    const at = S + (m.mixOutBar + Math.max(0, room - L) - F);
    if (bar < at - PREP_BARS - 0.5) return null;
    return { startBar: Math.max(at, Math.ceil(bar + PREP_BARS)), lengthBars: L };
  }
  if (Math.floor(bar) < S + BARS_PER_TRACK - PREP_BARS - MIX_BARS) return null;
  return { startBar: Math.ceil((bar + PREP_BARS) / 8) * 8, lengthBars: MIX_BARS };
}

// Schedule a blend into the other deck: load it PREP_BARS before, blend on a phrase.
function scheduleMix(fromBar, due = null) {
  if (!audio || plan) return;
  const startBar = due ? due.startBar : Math.ceil((fromBar + PREP_BARS) / 8) * 8;
  const to = 1 - liveDeck;
  plan = MIX.planTransition({ fromDeck: liveDeck, toDeck: to, startBar, lengthBars: due ? due.lengthBars : MIX_BARS });
  plan._loaded = false; plan._played = false; plan._stopped = false;
}

// ── Nora ────────────────────────────────────────────────────────────────────
let nora = null;
const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));
// The artifact host serves no .vrm type, so the published page ships the model as base64 text
// (nora.vrm.txt) and decodes it here; ?vrm=nora.vrm loads the binary directly in dev.
function onNora(gltf) {
  const vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  if (window.__hideNora) vrm.scene.visible = false;
  nora = new NoraPerformer({ THREE, vrm, height: 1.7, stand: { x: 0, y: club.standY || 0, z: 0.36 }, quality: QUALITY, ceiling: Q.get('ceil') === '1' });
  nora.attach(scene);
  document.body.classList.add('nora-ready');
}
const noraFail = (e) => {
  console.warn('[booth] Nora failed to load', e);
  const tag = document.querySelector('#loading .tag'); if (tag) tag.textContent = 'Nora could not load on this device';
};
const vrmUrl = Q.get('vrm') || 'nora.vrm.txt';
if (/\.txt$/.test(vrmUrl)) {
  fetch(vrmUrl).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then((b64) => {
    const bin = atob(b64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    loader.parse(bytes.buffer, '', onNora, noraFail);
  }).catch(noraFail);
} else {
  loader.load(vrmUrl, onNora, undefined, noraFail);
}

// ── Director + free camera ──────────────────────────────────────────────────
const director = new NoraDirector({ seed: 11, style: Q.get('style') === 'glide' ? 'glide' : 'cut' });
const orbit = new OrbitControls(camera, canvas);
orbit.enabled = false;
orbit.target.set(0, 1.15, 0.2);
orbit.enableDamping = true;
orbit.minDistance = 0.6; orbit.maxDistance = 9;
let lastUser = -1e9;
canvas.addEventListener('pointerdown', () => {
  if (director.mode !== 'free') { orbit.target.set(0, 1.15, 0.2); setMode('free'); }
  lastUser = performance.now();
});

// ── Anchor lookup for hands + camera ────────────────────────────────────────
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
  for (let i = 0; i < 2; i++) glow[i].position.copy(A.screen[i]).add(new THREE.Vector3(i === 0 ? 0.08 : -0.08, 0.14, -0.14)); // just above and behind the screen face: it lights her face from below, not her forearms (which pass over it)
  mixer.group.getWorldPosition(A.mixer); A.mixer.y += DJM_DIMS.h;
  mixGlow.position.set(A.mixer.x, A.mixer.y + 0.2, A.mixer.z - 0.05);
  if (nora) {
    nora.point('head', A.head);
    if (nora.headphones) { nora.headphones.userData.cups[0].getWorldPosition(A.cupL); nora.headphones.userData.cups[1].getWorldPosition(A.cupR); }
  }
}

// Map a choreography target id to a hand pose.
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

// ── Screens: the deck's own content around the playhead ─────────────────────
const SIXTEENTHS_PER_BAR = 16;
function deckScreen(i, bar) {
  const tr = deckTrack[i];
  if (!tr) return { deckLabel: 'DECK ' + (i + 1), loaded: false, color: i === 0 ? '#34d6c5' : '#e0a24a' };
  const playing = audio && audio.deckPlaying[i];
  const localBar = playing ? bar - deckStartBar[i] + deckFrom[i] : deckFrom[i];
  const pos = Math.max(0, Math.floor(localBar * SIXTEENTHS_PER_BAR));
  const w = tr.wave;
  const win = [];
  for (let k = pos - 48; k < pos + 48; k++) win.push(w[k] || { low: 0, mid: 0, high: 0 });
  const total = tr.wave.length / SIXTEENTHS_PER_BAR;
  const elapsed = localBar * secPerBar();
  // ⚠ NO ADVANCE ANNOUNCEMENT. Shape Radio's non-interactive licence forbids naming an
  // upcoming recording, so a cued deck shows its waveform (a shape, not a name) and reveals
  // the title only once its channel is actually audible — the booth rehearses the rule the
  // real station will have to follow.
  const audible = playing && (mixerState.ch[i + 1].fader || 0) > 0.25;
  return {
    deckLabel: 'DECK ' + (i + 1), title: audible ? tr.spec.name : 'Cued', artist: audible ? tr.spec.artist : '', bpm: bpm(), key: tr.spec.key || '—',
    elapsed, remaining: Math.max(0, (total - localBar) * secPerBar()), beatInBar: Math.floor(((bar % 1) + 1) % 1 * 4),
    waveColumns: win, overview: overviewOf(tr), playhead: Math.min(1, localBar / total), loaded: true,
    color: i === 0 ? '#34d6c5' : '#e0a24a',
  };
}
function overviewOf(tr) {
  if (tr._ov) return tr._ov;
  const n = 160, w = tr.wave, step = w.length / n, ov = [];
  for (let k = 0; k < n; k++) {
    let lo = 0, mi = 0, hi = 0, c = 0;
    for (let j = Math.floor(k * step); j < Math.floor((k + 1) * step); j++) { lo += w[j].low; mi += w[j].mid; hi += w[j].high; c++; }
    ov.push({ low: lo / (c || 1), mid: mi / (c || 1), high: hi / (c || 1) });
  }
  return (tr._ov = ov);
}

// ── Drop detection (works on any stream): the kick returns after ≥ 2 quiet bars ──
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

// ── UI ───────────────────────────────────────────────────────────────────────
const chips = document.getElementById('shots');
function setMode(m) {
  director.setMode(m, barNow(), nowSec());
  orbit.enabled = m === 'free';
  for (const b of chips.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
}
for (const id of ['auto', ...SHOT_IDS, 'free']) {
  const b = document.createElement('button');
  b.dataset.mode = id;
  b.textContent = id === 'auto' ? 'Auto' : id === 'free' ? 'Look around' : SHOTS[id].label;
  b.setAttribute('aria-pressed', String(id === 'auto'));
  b.onclick = () => setMode(id);
  chips.appendChild(b);
}
document.getElementById('start').onclick = () => startSet();
document.getElementById('next').onclick = () => { if (!audio) { startSet(); return; } scheduleMix(barNow()); };
let hypeUntil = -1;
document.getElementById('hype').onclick = () => { hypeUntil = barNow() + 2; };
document.getElementById('style').onclick = (e) => {
  director.style = director.style === 'cut' ? 'glide' : 'cut';
  e.currentTarget.textContent = director.style === 'cut' ? 'Edit: cuts' : 'Edit: glide';
};
const $npa = document.getElementById('npa');
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
if (REDUCED) { director.style = 'glide'; document.getElementById('style').textContent = 'Edit: glide'; }
const $np = document.getElementById('np'), $bpm = document.getElementById('bpm'), $bar = document.getElementById('bar'), $shot = document.getElementById('shotname');

// ── Loop ─────────────────────────────────────────────────────────────────────
const clock = new THREE.Timer();
const freq = new Uint8Array(256);
const deckFreq = [new Uint8Array(256), new Uint8Array(256)];
const bandsOf = (f) => {
  const n = f.length; let lo = 0, mi = 0, hi = 0;
  for (let i = 0; i < n; i++) { const v = f[i] / 255; if (i < n * 0.08) lo += v; else if (i < n * 0.4) mi += v; else hi += v; }
  const bl = lo / (n * 0.08), bm = mi / (n * 0.32), bh = hi / (n * 0.6);
  return { low: bl, mid: bm, high: bh, level: (bl + bm + bh) / 3 };
};
const mixerState = { ch: [0, 1, 2, 3].map(() => ({ fader: 0, trim: 0, hi: 0, mid: 0, low: 0, color: 0, cue: false, level: 0 })), xfader: 0, master: { l: 0, r: 0 }, fx: { on: false, name: 'ECHO', beat: '1/2', level: 0.5 }, bpm: null };
mixerState.ch[1].fader = 1;
mixerState.ch[2].low = -1;
const jogAngle = [0, 0];
let camOut = null;
let lookSide = 1;

function frame() {
  requestAnimationFrame(frame);
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = nowSec();
  const bar = barNow();
  const beat = bar * 4;
  const phase = beat - Math.floor(beat);
  const kick = Math.pow(1 - phase, 4);

  // Audio analysis → bands, measured tempo.
  let bands = { low: 0, mid: 0, high: 0, level: 0 };
  if (audio) {
    audio.analyser.getByteFrequencyData(freq);
    bands = bandsOf(freq);
    tempo.push(freq, t);
    audio.deckAnalysers.forEach((a, i) => a.getByteFrequencyData(deckFreq[i]));
    trackDrop(bar, bands.low);
  }
  dropEnv = Math.max(0, dropEnv - dt / (secPerBar() * 4));
  const hype = bar < hypeUntil ? 1 : 0;
  const drop = Math.max(dropEnv, hype);

  // Mix choreography. Between transitions the idle performance is ALSO a mixState (her
  // idle EQ flourishes are real moves on the live channel), so the audio follows it too.
  let ms;
  if (audio && !plan) { const due = stationMixDue(bar); if (due) scheduleMix(bar, due); }
  if (plan) {
    ms = MIX.mixState(plan, bar);
    const to = plan.toDeck, from = plan.fromDeck;
    if (!plan._loaded && ms.phase !== 'idle') { loadNext(to); plan._loaded = true; }
    // A bar of lead: a buffer deck needs ≥ engine.bufferLead or it joins late and loses the downbeat's
    // attack. A future atBar is scheduled sample-accurately, so starting early costs nothing.
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
      if (audio) audio.setChannel(d, c);
      Object.assign(mixerState.ch[d + 1], { fader: c.fader, low: c.low, mid: c.mid ?? 0, hi: c.hi ?? 0, color: c.color ?? 0 });
    }
    mixerState.ch[d + 1].cue = !!(ms.cueOn && ms.cueOn[d]);
  }
  if (ms.xfader != null) { if (audio) audio.setXfader(ms.xfader); mixerState.xfader = ms.xfader; }
  const handsPlan = ms.hands || null;
  window.__ms = ms;

  // Gear state.
  // The live detector needs a steady ~60 Hz frame feed; until it settles, station mode can still
  // name the tempo honestly, because every station track's grid was MEASURED from its decoded file
  // and the engine plays them all at that measured tempo. The synthesized set has only a declared
  // tempo, so it keeps "—" until the detector hears it.
  const shownBpm = tempo.bpm() || (station && audio ? audio.bpm : null);
  mixerState.bpm = shownBpm;
  mixerState.fx.on = hype > 0;
  for (let d = 0; d < 2; d++) {
    const lv = audio ? bandsOf(deckFreq[d]).level * 1.6 : 0;
    mixerState.ch[d + 1].level = Math.min(1, lv * (mixerState.ch[d + 1].fader || 0));
    const playing = audio && audio.deckPlaying[d];
    if (playing) jogAngle[d] -= dt * (33.333 / 60) * Math.PI * 2 * (1 + 0.08 * ((ms.nudge && ms.nudge[d]) || 0));
    decks[d].set({
      playing, jogAngle: jogAngle[d],
      jogTouch: !!(ms.jogTouch && ms.jogTouch[d]),
      tempo: 0, onAir: playing && mixerState.ch[d + 1].fader > 0.05,
      padsLit: ['#e33', '#fa0', '#3c3', '#3cf', null, '#a4f', null, '#fff'],
      screen: deckScreen(d, bar),
    });
    decks[d].update(dt, t);
  }
  const m = (mixerState.ch[1].level + mixerState.ch[2].level) / 2;
  mixerState.master.l = Math.min(1, m * 1.1); mixerState.master.r = Math.min(1, m * 1.05);
  mixer.set(mixerState); mixer.update(dt, t);
  club.set({ bands, kick: audio ? kick * Math.min(1, bands.low * 3) : 0, beat: Math.floor(beat) % 4, bar: Math.floor(bar), drop, accent: ACCENT, reducedMotion: REDUCED_MOTION });
  club.update(dt, t);
  venue.set({ bands, kick: audio ? kick * Math.min(1, bands.low * 3) : 0, beat: Math.floor(beat) % 4, bar: Math.floor(bar), drop, accent: ACCENT, reducedMotion: REDUCED_MOTION });
  venue.update(dt, t);

  // Nora.
  refreshAnchors();
  if (nora) {
    const hands = handsPlan ? { left: handFor('left', handsPlan.left), right: handFor('right', handsPlan.right) } : {};
    const look = (ms && ms.camHint === 'screen') ? A.screen[plan ? plan.toDeck : liveDeck]
      : (hands.left || hands.right) ? (hands.right && hands.right.palm !== 'air' ? hands.right.pos : hands.left ? hands.left.pos : A.mixer)
      : new THREE.Vector3(0, 1.4, -5);
    lookSide = look.x >= A.head.x ? 1 : -1;
    nora.update(dt, { t, beat, kick: audio ? kick : 0.15, energy: audio ? Math.min(1, bands.level * 2.2) : 0.2, hands, look, drop });
    refreshAnchors();
  }

  // Camera.
  if (director.mode === 'free') {
    orbit.update();
    if (performance.now() - lastUser > 12000 && !Q.get('mode')) setMode('auto');
  } else {
    const ctx = { head: A.head, jog: A.jog, screen: A.screen, mixer: A.mixer, deck: liveDeck, lookSide: lookSide,
      incoming: plan ? plan.toDeck : null, hint: ms ? ms.camHint : null, drop: drop > 0.5, kick: audio ? kick : 0 };
    camOut = director.update(t, bar, ctx, secPerBar(), dt);
    camera.position.set(camOut.pos.x, camOut.pos.y, camOut.pos.z);
    camera.lookAt(camOut.target.x, camOut.target.y, camOut.target.z);
    if (Math.abs(camera.fov - camOut.fov) > 0.01) { camera.fov = camOut.fov; camera.updateProjectionMatrix(); }
  }

  // HUD.
  const tr = deckTrack[liveDeck];
  if ($npa) {
    $np.textContent = tr ? tr.spec.name : 'Tap Start to hear Nora mix';
    $npa.textContent = tr ? [tr.spec.artist, tr.spec.key].filter(Boolean).join(' · ') : '';
  } else $np.textContent = tr ? `${tr.spec.name} — ${tr.spec.artist}` : 'Tap Start to hear Nora mix';
  $bpm.textContent = shownBpm ? shownBpm.toFixed(1) : '—';
  $bar.textContent = audio ? `BAR ${Math.max(0, Math.floor(bar - deckStartBar[liveDeck] + deckFrom[liveDeck])) + 1}` : '';
  const shotLabel = ((SHOTS[director.shot] || {}).label || '').toUpperCase();
  $shot.textContent = director.mode === 'free' ? 'LOOK AROUND' : director.mode === 'auto' ? `AUTO · ${shotLabel}` : shotLabel;

  if (cine) {
    // focus on what the shot is looking at (the orbit's target when the user is steering)
    const T = director.mode === 'free' ? orbit.target : camOut && camOut.target;
    const focus = T ? camera.position.distanceTo(T) : 6;
    cine.update({ dt, shot: director.mode === 'free' ? 'free' : director.shot, focus, level: bands.level, drop });
  }
  if (composer) composer.render(); else renderer.render(scene, camera);
  window.__frames = (window.__frames || 0) + 1;
}

// Debug: ?hide=nora,decks,mixer,club isolates a render problem to one part of the scene.
const HIDE = (Q.get('hide') || '').split(',');
if (HIDE.includes('decks')) decks.forEach((d) => (d.group.visible = false));
if (HIDE.includes('mixer')) mixer.group.visible = false;
if (HIDE.includes('club')) club.group.visible = false;
if (HIDE.includes('venue')) venue.group.visible = false;
window.__hideNora = HIDE.includes('nora');
resize();
if (Q.get('mode')) setMode(Q.get('mode'));
if (Q.get('autostart')) startSet();
requestAnimationFrame(frame);
window.__booth = { director, renderer, club, venue, venueMs, scene, camera, cine, get composer() { return composer; }, get nora() { return nora; }, get ms() { return window.__ms; }, get bar() { return barNow(); }, scheduleMix: () => scheduleMix(barNow()), setMode };

// Debug: the first thing a camera ray hits among Nora and the gear (handprobe.cjs uses it to sample
// only pixels that are actually her skin). Cheap: it tests only the foreground, never the crowd.
{
  const rc = new THREE.Raycaster();
  window.__booth.raycast = (x, y) => {
    rc.setFromCamera({ x, y }, camera);
    const list = [...decks.map((d) => d.group), mixer.group];
    if (nora) list.push(nora.vrm.scene);
    const h = rc.intersectObjects(list, true).find((i) => i.object.visible);
    return h ? h.object : null;
  };
}
