// Test page for djmMixer.mjs — the mixer on a dark flight-case table under coloured club spots,
// driven by a fake 126 BPM mix. ?view=player|hero|close|fx|top|back  ?t=seconds (freeze time)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMixer, DJM_DIMS } from '../../../public/newdesign/booth/djmMixer.mjs';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'hero';
const fixedT = q.has('t') ? Number(q.get('t')) : null;

const canvas = document.createElement('canvas');
document.body.style.margin = '0';
document.body.style.background = '#000';
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = q.get('shadows') !== '0';
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05060a');
scene.fog = new THREE.Fog('#05060a', 2.5, 7);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if (q.get('env') !== '0') scene.environment = envTex;
scene.environmentIntensity = 0.16;

// Flight-case table top.
const tableMat = new THREE.MeshStandardMaterial({ color: '#141417', roughness: 0.82, metalness: 0.05 });
const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.9), tableMat);
table.position.set(0, -0.02, -0.1);
table.receiveShadow = true;
scene.add(table);
const trimMat = new THREE.MeshStandardMaterial({ color: '#8d9299', roughness: 0.35, metalness: 0.9 });
const trim = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.045, 0.012), trimMat);
trim.position.set(0, -0.02, 0.356);
scene.add(trim);

const mixer = createMixer({ THREE, accent: '#34d6c5' });
scene.add(mixer.group);

// Lights: dim fill, a warm key from the truss (shadows), magenta + cyan spots, a blue rim.
scene.add(new THREE.HemisphereLight('#39405a', '#050505', 0.35));
const key = new THREE.SpotLight('#ffe2c0', 9, 4, 0.42, 0.6, 1.2);
key.position.set(0.35, 1.45, 0.85);
key.target.position.set(0, 0.1, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.002;
key.shadow.camera.near = 0.5; key.shadow.camera.far = 3;
scene.add(key, key.target);
const mag = new THREE.SpotLight('#ff3fb4', 10, 5, 0.35, 0.8, 1.4);
mag.position.set(-1.3, 1.2, -0.6);
mag.target.position.set(0, 0.1, 0);
scene.add(mag, mag.target);
const cyan = new THREE.SpotLight('#2fd8ff', 10, 5, 0.35, 0.8, 1.4);
cyan.position.set(1.4, 1.0, -0.5);
cyan.target.position.set(0, 0.1, 0);
scene.add(cyan, cyan.target);
const rim = new THREE.DirectionalLight('#5a6cff', 1.3);
rim.position.set(0, 0.6, -2);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 20);
const top = DJM_DIMS.h;
const views = {
  // Player's eye: from +Z above, ~55° down.
  player: { fov: 42, pos: [0, top + 0.62 * Math.sin(55 * Math.PI / 180), 0.62 * Math.cos(55 * Math.PI / 180)], look: [0, top, 0.0] },
  hero: { fov: 34, pos: [0.46, 0.43, 0.56], look: [-0.01, 0.07, 0.0] },
  close: { fov: 30, pos: [-0.03, 0.27, 0.36], look: [-0.075, top, 0.11] },
  fx: { fov: 30, pos: [0.22, 0.34, 0.26], look: [0.14, top, -0.06] },
  top: { fov: 30, pos: [0, 0.95, 0.0001], look: [0, 0, 0] },
  topR: { fov: 13, pos: [0.14, 0.95, 0.0001], look: [0.14, 0, 0] },
  topL: { fov: 13, pos: [-0.1, 0.95, -0.1], look: [-0.1, 0, -0.1] },
  phone: { fov: 52, pos: [0, top + 0.35 * Math.sin(55 * Math.PI / 180), 0.12 + 0.35 * Math.cos(55 * Math.PI / 180)], look: [0, top, 0.12] },
  back: { fov: 34, pos: [-0.4, 0.35, -0.6], look: [0, 0.06, 0] },
  side: { fov: 30, pos: [0.75, 0.12, 0.0], look: [0, 0.06, 0] },
};
const v = views[view] || views.hero;
camera.fov = v.fov;
camera.position.set(...v.pos);
camera.lookAt(...v.look);
camera.updateProjectionMatrix();

// A fake 126 BPM mix: CH2 (deck 1) playing out, CH3 (deck 2) blending in.
const BPM = 126;
function drive(t) {
  const beat = (t * BPM) / 60, ph = beat % 1, bar = Math.floor(beat / 4);
  const kick = Math.exp(-ph * 7), hat = Math.exp(-((beat * 2) % 1) * 9);
  const f2 = 0.9, f3 = 0.55 + 0.4 * Math.sin(t * 0.45);
  const lvl = (f, g) => Math.min(1, (0.35 + 0.45 * kick + 0.12 * hat) * f * g);
  const ch = [
    { fader: 0.0, trim: -0.2, hi: 0, mid: 0, low: 0, color: 0, cue: false, level: 0 },
    { fader: f2, trim: 0.1, hi: 0.15 * Math.sin(t * 0.7), mid: 0.0, low: -0.5 + 0.5 * Math.sin(t * 0.3), color: 0, cue: false, level: lvl(f2, 1.05) },
    { fader: f3, trim: 0.05, hi: -0.3, mid: 0.2 * Math.sin(t * 0.9), low: -1 + 0.8 * (0.5 + 0.5 * Math.sin(t * 0.35)), color: 0.7 * Math.sin(t * 0.6), cue: (bar % 2) === 0, level: lvl(f3, 1.0) },
    { fader: 0.12, trim: -0.4, hi: 0.4, mid: -0.25, low: 0.3, color: -0.35, cue: true, level: lvl(0.12, 1) },
  ];
  const m = Math.min(1, 0.55 * (ch[1].level + ch[2].level) + 0.1);
  mixer.set({
    ch, xfader: 0.55 * Math.sin(t * 0.3),
    master: { l: m, r: Math.min(1, m * (0.94 + 0.06 * Math.sin(t * 3))) },
    fx: { on: (bar % 4) >= 2, name: ['ECHO', 'REVERB', 'FILTER', 'ROLL'][Math.floor(bar / 4) % 4], beat: ['1/2', '3/4', '1', '1/4'][Math.floor(bar / 4) % 4], level: 0.35 + 0.3 * Math.sin(t * 0.5) },
    bpm: BPM, colorFx: 'FILTER', masterCue: false,
  });
}

// Per-unit cost: draw the mixer alone once (no shadows) and read renderer.info.
function measureMixer() {
  const solo = new THREE.Scene();
  const parent = mixer.group.parent;
  solo.add(mixer.group);
  const was = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.info.reset();
  renderer.info.autoReset = false;
  renderer.render(solo, camera);
  const r = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  renderer.info.autoReset = true;
  renderer.shadowMap.enabled = was;
  parent.add(mixer.group);
  return r;
}

let last = performance.now() / 1000, frames = 0;
const t0 = last;
function frame() {
  const now = performance.now() / 1000;
  const t = fixedT != null ? fixedT : 12 + (now - t0);
  const dt = Math.min(0.1, now - last);
  last = now;
  if (!window.__disposed) drive(t);
  if (!window.__disposed) mixer.update(fixedT != null ? 1 / 30 : dt, t);
  renderer.render(scene, camera);
  frames++;
  if (frames === 20) {
    const solo = measureMixer();
    renderer.info.reset();
    renderer.render(scene, camera);
    // Anchors must sit on the controls they name (and the fader anchor must follow the fader).
    const wp = (o) => o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +(v * 1000).toFixed(1));
    mixer.set({ ch: [{}, { fader: 0 }] }); const f0 = wp(mixer.anchors.ch[1].fader);
    mixer.set({ ch: [{}, { fader: 1 }] }); const f1 = wp(mixer.anchors.ch[1].fader);
    mixer.set({ xfader: -1 }); const xa = wp(mixer.anchors.xfader);
    mixer.set({ xfader: 1 }); const xb = wp(mixer.anchors.xfader);
    const anchors = { fader0: f0, fader1: f1, travelMm: +(f0[2] - f1[2]).toFixed(1), xfA: xa, xfB: xb, xTravelMm: +(xb[0] - xa[0]).toFixed(1),
      trim1: wp(mixer.anchors.ch[1].trim), cue2: wp(mixer.anchors.ch[2].cue), master: wp(mixer.anchors.masterLevel),
      fxOn: wp(mixer.anchors.fxOn), fxKnob: wp(mixer.anchors.fxKnob), fxScreen: wp(mixer.anchors.fxScreen) };
    window.__info = { mixer: solo, scene: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }, anchors };
    if (q.get('dispose') === '1') {
      renderer.render(scene, camera);
      const before = { ...renderer.info.memory };
      mixer.dispose();
      renderer.render(scene, camera);
      window.__info.dispose = { before, after: { ...renderer.info.memory }, children: mixer.group.children.length, parent: !!mixer.group.parent };
      window.__disposed = true;
    }
    window.__ok = true;
  }
  requestAnimationFrame(frame);
}
frame();
window.__mixer = mixer;
