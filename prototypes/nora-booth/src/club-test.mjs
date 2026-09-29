// Test bench for club.mjs — Club Shape's stage with placeholder gear, a capsule DJ and a
// crude stand-in for the venue (floor, walls, gold balcony lines, skylight ring) so the
// composition can be judged. The real hall is clubVenue.mjs.
// Query: ?view=club|club2|wide|shoulder|crane|crane2|pano|panoside|profile|screen
//        &q=high|low  &drop=0|1  &rm=1 (reduced motion)  &t=<start s>  &post=0 (no bloom)
//        &venue=0 (no stand-in)  &info=1 (club-only draw calls / triangles)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createClub } from './club.mjs';
import { createVenue } from './clubVenue.mjs';

const q = new URLSearchParams(location.search);
const QUALITY = q.get('q') === 'low' ? 'low' : 'high';
const REDUCED = q.get('rm') === '1';
const canvas = document.createElement('canvas');
document.body.style.margin = '0';
document.body.style.background = '#000';
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const VIEWS = {
  club: [[0, 9, -34], [0, 3, 0], 50],
  club2: [[-1.4, 9.6, -35], [0, 3.1, 0.5], 50],
  wide: [[-0.3, 1.8, -6.0], [0, 1.3, 0.4], 38],
  shoulder: [[-0.3, 1.78, 1.3], [0.15, 1.25, -3.5], 46],
  crane: [[-3.2, 2.0, -3.8], [0, 1.15, 0.35], 42],
  crane2: [[-1.6, 3.7, -2.6], [0, 1.15, 0.35], 42],
  pano: [[0, 2.0, -2.95], [0, 1.15, 0.15], 40],
  panoside: [[2.69, 1.75, -1.39], [0, 1.15, 0.15], 40],
  profile: [[1.9, 0.98, 0.1], [0, 1.35, 0.3], 30],
  screen: [[0, 3.6, -7.5], [0, 3.9, 2.0], 45],
};
const v = VIEWS[q.get('view') || 'wide'] || VIEWS.wide;
const camera = new THREE.PerspectiveCamera(v[2], innerWidth / innerHeight, 0.03, 80);
camera.position.set(...v[0]);
camera.lookAt(...v[1]);

const club = createClub({ THREE, renderer, seed: 7, accent: '#34d6c5', quality: QUALITY, reducedMotion: REDUCED });
scene.add(club.group);

// ── stand-in venue (TEST ONLY) ───────────────────────────────────────────────
const venue = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.6, metalness: 0.1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 52), dark);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.66, -20); venue.add(floor);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(52, 16.2), dark);
    w.rotation.y = -s * Math.PI / 2; w.position.set(s * 14, 7.4, -20); venue.add(w);
  }
  const end = new THREE.Mesh(new THREE.PlaneGeometry(28, 16.2), dark);
  end.position.set(0, 7.4, -46); venue.add(end);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(28, 16.2), dark);
  back.rotation.y = Math.PI; back.position.set(0, 7.4, 6); venue.add(back);
  const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb866).multiplyScalar(1.3) });
  const slab = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.5 });
  for (const s of [-1, 1]) for (const y of [3.6, 7.6, 11.6]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.35, 50), slab);
    b.position.set(s * 12.25, y - 0.2, -20); venue.add(b);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 50), gold);
    l.position.set(s * 10.52, y + 0.9, -20); venue.add(l);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(50, 2.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9a5a1c).multiplyScalar(0.5) }));
    g.rotation.y = -s * Math.PI / 2; g.position.set(s * 13.9, y + 1.6, -20); venue.add(g);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(28, 52), dark);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 15.5, -20); venue.add(ceil);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe6ff).multiplyScalar(2.5) }));
  ring.scale.set(8, 13, 1); ring.rotation.x = Math.PI / 2; ring.position.set(0, 15.45, -18); venue.add(ring);
}
// ?venue=real → the real Club Shape hall (clubVenue.mjs) instead of the stand-in
let realVenue = null;
if (q.get('venue') === 'real') {
  realVenue = createVenue({ THREE, renderer, seed: 11, quality: QUALITY, reducedMotion: REDUCED });
  scene.add(realVenue.group);
} else if (q.get('venue') !== '0') scene.add(venue);

// placeholder gear at the contract positions
const gear = new THREE.Group();
scene.add(gear);
const gearMat = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.5, metalness: 0.3 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.6 });
const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3b7bd6).multiplyScalar(1.4) });
function unit(w, d, h, x) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gearMat);
  body.position.y = h / 2; g.add(body);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, 0.004, d - 0.01), plateMat);
  plate.position.y = h + 0.002; g.add(plate);
  g.position.set(x, 0.92, 0.20 - d / 2);
  gear.add(g);
  return g;
}
const d1 = unit(0.329, 0.453, 0.1185, -0.391);
const d2 = unit(0.329, 0.453, 0.1185, 0.391);
unit(0.413, 0.444, 0.108, 0);
for (const d of [d1, d2]) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), screenMat);
  s.rotation.x = -Math.PI / 2 + 0.5; s.position.set(0, 0.13, -0.16); d.add(s);
}
const djMat = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.6 });
const dj = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 1.05, 6, 16), djMat);
dj.position.set(0, club.standY + 0.19 + 0.525 + 0.02, 0.30);
gear.add(dj);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), djMat);
head.position.set(0, 1.6, 0.30); gear.add(head);

const NOL = (q.get('nolight') || '').split(',');
const HIDE = (q.get('hide') || '').split(',');
club.group.traverse((o) => { if (HIDE.includes(o.name)) o.visible = false; });
club.group.traverse((o) => { if (o.isLight && NOL.includes(o.name)) o.visible = false; });
let composer = null;
if (q.get('post') !== '0') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.5, 0.82));
  composer.addPass(new OutputPass());
}

// synthetic 124 BPM signal
const BPM = 124, SPB = 60 / BPM;
const DROP = Number(q.get('drop') || 0);
let t = Number(q.get('t') || 12.3);
function drive(dt) {
  t += dt;
  const beatF = t / SPB;
  const ph = beatF % 1;
  const kick = Math.exp(-ph * 7);
  const bar = Math.floor(beatF / 4);
  club.set({
    bands: {
      low: 0.18 + 0.32 * kick,
      mid: 0.2 + 0.08 * Math.sin(t * 2.1) + 0.05 * Math.sin(t * 5.3),
      high: 0.12 + 0.06 * Math.sin(t * 3.7 + 1) + 0.05 * ((beatF * 2) % 1 < 0.2 ? 1 : 0),
      level: 0.22 + 0.12 * kick,
    },
    kick, beat: Math.floor(beatF) % 4, bar, drop: DROP, reducedMotion: REDUCED,
  });
  club.update(dt, t);
  if (realVenue) {
    realVenue.set({ bands: { low: 0.3, mid: 0.25, high: 0.15, level: 0.28 }, kick: Math.exp(-((t / SPB) % 1) * 7), beat: Math.floor(t / SPB) % 4, bar: Math.floor(t / SPB / 4), drop: DROP, reducedMotion: REDUCED });
    realVenue.update(dt, t);
  }
}
for (let i = 0; i < 150; i++) drive(1 / 30);

function frame() {
  drive(1 / 30);
  if (composer) composer.render(); else renderer.render(scene, camera);
  window.__ok = true;
  requestAnimationFrame(frame);
}
if (q.get('info') === '1') {
  venue.visible = false; gear.visible = false;
  renderer.info.autoReset = true;
  // count from a camera that frames everything (frustum culling off-screen would under-count)
  renderer.render(scene, camera);
  let tris = 0; club.group.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); } });
  window.__info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, sceneTriangles: Math.round(tris),
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, crowd: club.crowdCount,
    meshes: (() => { let n = 0; club.group.traverse((o) => { if (o.isMesh) n++; }); return n; })(),
    lights: (() => { let n = 0; club.group.traverse((o) => { if (o.isLight) n++; }); return n; })() };
  club.dispose();
  window.__afterDispose = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  window.__ok = true;
} else {
  frame();
}
