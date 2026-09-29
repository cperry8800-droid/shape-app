// Test bench for clubVenue.mjs — the venue + a stand-in stage (portal, screen, deck, floor crowd).
// Query: ?view=club|clubalt|shoulder|wide|crane|pano|up|side  &q=high|low  &rm=1  &post=0
//        &info=1 (one frame, report draw calls / triangles)  &kick=0..1 &level=0..1 &drop=0|1
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createVenue } from './clubVenue.mjs';

const q = new URLSearchParams(location.search);
const QUALITY = q.get('q') === 'low' ? 'low' : 'high';
const RM = q.get('rm') === '1';
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
scene.fog = new THREE.FogExp2(0x070a12, 0.012);   // what club.mjs installs
scene.background = new THREE.Color(0x05070c);

const VIEWS = {
  club: [[-0.2, 9.1, -33], [0, 3.1, 0.5], 50],
  clubalt: [[0, 9, -34], [0, 6, 0], 50],
  shoulder: [[-0.3, 1.78, 1.3], [0.15, 1.25, -3.5], 46],
  wide: [[-0.6, 1.85, -6.2], [0, 1.3, 0.4], 38],
  crane: [[-1.6, 3.7, -2.6], [0, 1.15, 0.35], 42],
  pano: [[-2.6, 1.9, -1.5], [0, 1.15, 0.15], 40],
  panoR: [[2.95, 1.8, -0.8], [0, 1.15, 0.15], 40],
  up: [[0, 1.8, -24], [0, 16, -12], 60],
  side: [[-6, 5.6, -20], [10.5, 5.5, -16], 55],
  people: [[4, 6.2, -24], [10.8, 4.6, -20], 45],
  far: [[0, 7, -30], [0, 7, -46], 55],
};
const v = VIEWS[q.get('view') || 'club'] || VIEWS.club;
const camera = new THREE.PerspectiveCamera(v[2], innerWidth / innerHeight, 0.03, 80);
camera.position.set(...v[0]);
camera.lookAt(...v[1]);

const venue = createVenue({ THREE, renderer, seed: 11, quality: QUALITY, reducedMotion: RM });
if (q.get('novenue') !== '1') scene.add(venue.group);

// ── stand-in stage (the stage module's job): portal, LED screen, deck, crowd ──
const black = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.6, metalness: 0.3 });
function addBox(w, h, d, x, y, z, m = black) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; }
addBox(11, 0.9, 1.2, 0, 8.35, 2.6);           // portal header
addBox(0.9, 9.0, 1.2, -5.05, 4.3, 2.6);       // legs
addBox(0.9, 9.0, 1.2, 5.05, 4.3, 2.6);
addBox(8.4, 0.48, 4.3, 0, -0.42, 0.85);       // stage deck
const scr = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 7.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.08, 0.14) }));
scr.position.set(0, 4.0, 2.0); scr.rotation.y = Math.PI; scene.add(scr);
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.2, 3.2)), new THREE.LineBasicMaterial({ color: 0xffffff }));
outline.position.set(0, 4.3, 1.97); scene.add(outline);
addBox(1.6, 0.9, 0.6, 0, 0.45, -0.1);         // booth
// floor crowd
{
  const g = new THREE.CapsuleGeometry(0.2, 1.1, 3, 6); g.translate(0, 0.75, 0);
  const n = QUALITY === 'low' ? 260 : 620;
  const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x060608 }), n);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m.makeTranslation((r() - 0.5) * 13.5, -0.66, -1.8 - r() * 32); im.setMatrixAt(i, m); }
  scene.add(im);
}

let composer = null;
if (q.get('post') !== '0') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = min(c, vec4(32.0)); }',
  }));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.5, 0.82));
  composer.addPass(new OutputPass());
}

const KICK = Number(q.get('kick') || 0), LEVEL = Number(q.get('level') || 0.3), DROP = Number(q.get('drop') || 0);
let t = Number(q.get('t') || 12.3);
function drive(dt) {
  t += dt;
  venue.set({ bands: { low: 0.3, mid: 0.2, high: 0.15, level: LEVEL }, kick: KICK, beat: 0, bar: 0, drop: DROP });
  venue.update(dt, t);
}
for (let i = 0; i < 60; i++) drive(1 / 30);

renderer.info.autoReset = true;
if (composer) composer.render(); else renderer.render(scene, camera);
renderer.info.autoReset = false;
const others = scene.children.filter((o) => o !== venue.group);
others.forEach((o) => { o.visible = false; });
renderer.info.reset();
renderer.render(scene, camera);
others.forEach((o) => { o.visible = true; });
window.__info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
renderer.info.autoReset = true;
if (composer) composer.render(); else renderer.render(scene, camera);
window.__ok = true;
window.__dispose = () => { venue.dispose(); return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, children: venue.group.children.length }; };
