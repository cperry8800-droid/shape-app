// Test bench for cdj3000.mjs — two decks on a dark flight-case top, club spots,
// deck 1 playing a synthetic 124 BPM track, deck 2 empty (LOAD TRACK).
// Query: ?view=player|hero|jog|top|screen|back  &env=0|1
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCDJ, CDJ_DIMS } from './cdj3000.mjs';

const q = new URLSearchParams(location.search);
const canvas = document.createElement('canvas');
document.body.style.margin = '0';
document.body.style.background = '#000';
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040406);
scene.fog = new THREE.Fog(0x040406, 3, 9);
if (q.get('env') !== '0') {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = Number(q.get('envi') || 0.08);
}

// Table (flight-case top) — top surface at y = 0
const table = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 0.05, 0.8),
  new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.8, metalness: 0.1 }));
table.position.set(0, -0.025, 0.02);
table.receiveShadow = true;
scene.add(table);
const trim = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.012, 0.012),
  new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 1 }));
trim.position.set(0, -0.006, 0.426); scene.add(trim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.25, metalness: 0.2 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.92; floor.receiveShadow = true;
scene.add(floor);

// Lights: a warm booth key from the truss, magenta + teal club spots, a rim.
scene.add(new THREE.HemisphereLight(0x6a7488, 0x050505, 0.12));
const key = new THREE.SpotLight(0xffd9b0, 14, 5, 0.55, 0.6, 1.6);
key.position.set(0.35, 1.35, 0.95); key.target.position.set(0, 0.05, 0.05);
key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004;
scene.add(key, key.target);
const mag = new THREE.SpotLight(0xff2fa8, 26, 8, 0.4, 0.7, 1.6);
mag.position.set(-1.4, 2.6, -1.4); mag.target.position.set(-0.3, 0, 0.1); scene.add(mag, mag.target);
const teal = new THREE.SpotLight(0x34d6c5, 24, 8, 0.4, 0.7, 1.6);
teal.position.set(1.5, 2.5, -1.3); teal.target.position.set(0.3, 0, 0.1); scene.add(teal, teal.target);
const rim = new THREE.PointLight(0x7aa0ff, 3.5, 4, 1.8);
rim.position.set(0, 0.5, -1.0); scene.add(rim);

// Decks
const deckA = createCDJ({ THREE, deckNumber: 1, accent: '#34d6c5' });
const deckB = createCDJ({ THREE, deckNumber: 2, accent: '#ff5aa8' });
const gap = 0.012;
deckA.group.position.set(-(CDJ_DIMS.w + gap) / 2, 0, 0.20 - CDJ_DIMS.d / 2);
deckB.group.position.set((CDJ_DIMS.w + gap) / 2, 0, 0.20 - CDJ_DIMS.d / 2);
scene.add(deckA.group, deckB.group);

// Synthetic track data
const BPM = 124, TRACK = 372;
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
function sample(tt) {
  const beat = tt * BPM / 60;
  const ph = ((beat % 1) + 1) % 1;
  const bar = Math.floor(beat / 4);
  const section = Math.floor(bar / 16) % 4;          // 0 intro 1 groove 2 break 3 drop
  const kickOn = section !== 2;
  const kick = kickOn ? Math.exp(-ph * 7) : 0;
  const s16 = Math.floor(beat * 4);
  const hat = Math.exp(-(((beat + 0.5) % 1) * 14)) * (section === 0 ? 0.5 : 1);
  const perc = Math.exp(-((beat * 4) % 1) * 9) * hash(s16) * 0.7;
  const pad = section === 2 ? 0.45 + 0.2 * Math.sin(tt * 1.3) : 0.2;
  return {
    low: Math.min(1, 0.12 + kick * 0.85 + (section === 3 ? 0.08 : 0)),
    mid: Math.min(1, 0.08 + pad * 0.6 + 0.42 * Math.exp(-(((beat * 2) % 1) * 5)) * (0.35 + 0.65 * hash(s16 + 7)) + kick * 0.18),
    high: Math.min(1, 0.06 + hat * 0.55 + perc * 0.5),
  };
}
const overview = Array.from({ length: 420 }, (_, i) => {
  const tt = (i + 0.5) / 420 * TRACK;
  const b = Math.floor(tt * BPM / 60 / 4 / 16) % 4;
  const e = b === 2 ? 0.45 : b === 0 ? 0.6 : 0.9;
  const n = hash(i) * 0.12;
  return { low: e * (b === 2 ? 0.3 : 0.9) + n, mid: e * 0.7 + n, high: e * 0.45 + n * 0.5 };
});

const t0 = performance.now() / 1000;
const START = 96.4;          // seconds into the track at load
let jogA = 0, last = 0;
const padsA = ['#ff2d55', '#ff9f0a', '#ffd60a', '#30d158', null, '#0a84ff', null, '#bf5af2'];
if (q.get('b') === 'loaded') {
  deckB.set({ tempo: -0.34, playing: false, onAir: false, jogTouch: true, padsLit: ['#30d158', null, '#0a84ff', null, null, null, null, null],
    screen: { deckLabel: 'DECK 2', loaded: true, color: '#ff5aa8', title: 'Night Bus Home', artist: 'Shape Radio Crew', bpm: 122, key: '11B',
      elapsed: 12.3, remaining: 301.9, beatInBar: 2, playhead: 0.04, waveColumns: Array.from({ length: 200 }, (_, i) => sample(8 + i * 0.03)) } });
} else {
  deckB.set({ tempo: -0.34, padsLit: [null, null, null, null, null, null, null, null],
    screen: { deckLabel: 'DECK 2', loaded: false, color: '#ff5aa8' } });
}

function frame() {
  const t = performance.now() / 1000 - t0;
  const dt = Math.min(0.1, t - last); last = t;
  const tempo = 0.12;
  const rate = 1 + tempo * 0.06;
  const el = START + t * rate;
  jogA += dt * (33.33 / 60) * 2 * Math.PI * rate;
  const cols = [];
  const WIN = 6, N = 240;
  for (let i = 0; i < N; i++) cols.push(sample(el - WIN / 2 + (i + 0.5) * WIN / N));
  const beatF = el * BPM / 60;
  deckA.set({
    playing: true, jogAngle: jogA, jogTouch: q.get('touch') === '1', tempo, padsLit: padsA, onAir: true,
    screen: {
      deckLabel: 'DECK 1', title: 'Signal Field (Extended Mix)', artist: 'Nora · Shape Radio', bpm: BPM * rate, key: '8A',
      elapsed: el, remaining: TRACK - el, beat: beatF, beatInBar: Math.floor(beatF) % 4, waveColumns: cols,
      overview, playhead: el / TRACK, loaded: true, color: '#34d6c5', windowSec: WIN,
    },
  });
  deckA.update(dt, t); deckB.update(dt, t);
  renderer.render(scene, camera);
  window.__info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  requestAnimationFrame(frame);
}

// Cameras
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.02, 40);
const deckAx = deckA.group.position.x;
const VIEWS = {
  player: { pos: [0, 0.60, 0.62], look: [0, 0.07, 0.00], fov: 42 },
  hero: { pos: [0.62, 0.40, 0.66], look: [-0.03, 0.06, -0.02], fov: 38 },
  jog: { pos: [deckAx + 0.07, 0.25, 0.36], look: [deckAx - 0.005, 0.095, 0.105], fov: 40 },
  top: { pos: [0, 1.05, 0.0005], look: [0, 0, 0], fov: 38 },
  screen: { pos: [deckAx, 0.33, 0.12], look: [deckAx, 0.105, -0.15], fov: 40 },
  back: { pos: [-0.45, 0.45, -0.95], look: [0, 0.05, -0.05], fov: 38 },
  left: { pos: [deckAx - 0.18, 0.18, 0.26], look: [deckAx - 0.12, 0.09, 0.07], fov: 40 },
  right: { pos: [deckAx + 0.30, 0.22, 0.20], look: [deckAx + 0.13, 0.09, 0.05], fov: 40 },
  phone: { pos: [deckAx + 0.06, 0.40, 0.36], look: [deckAx, 0.08, 0.0], fov: 55 },
};
window.__setView = (name) => {
  const v = VIEWS[name] || VIEWS.player;
  camera.position.set(...v.pos); camera.fov = v.fov; camera.updateProjectionMatrix(); camera.lookAt(...v.look);
};
window.__setView(q.get('view') || 'player');

// per-deck stats (independent of the scene)
function deckStats(d) {
  let calls = 0, tris = 0;
  d.group.traverse((o) => {
    if (o.isMesh) { calls++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; }
  });
  return { calls, tris: Math.round(tris) };
}
window.__deckStats = { A: deckStats(deckA), B: deckStats(deckB) };
window.__anchors = Object.fromEntries(Object.entries(deckA.anchors).filter(([, v]) => v && v.isObject3D).map(([k, v]) => {
  const p = new THREE.Vector3(); deckA.group.updateMatrixWorld(true); v.getWorldPosition(p); return [k, p.toArray().map((n) => +n.toFixed(4))];
}));
window.__mem = () => ({ ...renderer.info.memory });
window.__dispose = () => { deckA.dispose(); deckB.dispose(); renderer.render(scene, camera); return { ...renderer.info.memory }; };
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
requestAnimationFrame(frame);
window.__deckA = deckA;
window.__ok = true;
