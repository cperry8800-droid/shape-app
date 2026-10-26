// Line-up of the crowd's people (crowdPeople.mjs, a v3 pack): every baked person at the near level
// of detail, the same people behind at far, tiny and seated. ?url=crowd-people.bin.txt
//   &cam=front|back|side|close   &raise=<radians>   &dress=0 (as baked; no recolours)   &w=1 (arm weights)
import * as THREE from 'three';
import { loadCrowd, createCrowd } from '../../../public/newdesign/booth/crowdPeople.mjs';

const q = new URLSearchParams(location.search);
const canvas = document.createElement('canvas');
document.body.style.margin = '0'; document.body.style.background = '#000'; document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070c);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 80);
const cam = q.get('cam') || 'front';
if (cam === 'front') { camera.position.set(0, 1.55, 8.2); camera.lookAt(0, 1.0, -1); }
else if (cam === 'close') { camera.position.set(-1.6, 1.5, 2.6); camera.lookAt(-1.6, 1.35, 0); }
else if (cam === 'back') { camera.position.set(0, 1.6, -9); camera.lookAt(0, 1.0, -1); }
else if (cam.startsWith('c:')) { const c = cam.slice(2).split(',').map(Number); camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); }
else { camera.position.set(8, 1.5, 0.3); camera.lookAt(0, 1.0, -1); }
scene.add(new THREE.HemisphereLight(0x2a3550, 0x0b0806, 0.7));
const key = new THREE.SpotLight(0xffead6, 160, 0, 0.7, 0.7, 2); key.position.set(2, 5, 7); key.target.position.set(0, 1, -1); scene.add(key, key.target);
const magenta = new THREE.SpotLight(0xff3aa8, 90, 0, 0.8, 0.7, 2); magenta.position.set(-5, 4, -4); magenta.target.position.set(0, 1, -1); scene.add(magenta, magenta.target);
const teal = new THREE.SpotLight(0x34d6c5, 90, 0, 0.8, 0.7, 2); teal.position.set(5, 4, -4); teal.target.position.set(0, 1, -1); scene.add(teal, teal.target);

let seed = 5; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
loadCrowd(q.get('url') || 'crowd-people.bin.txt').then((pack) => {
  const N = pack.header.bodies.length;
  const lods = (q.get('lods') || 'near,far,tiny,seat').split(',').filter((l) => pack.header.lods.includes(l));
  const people = [], lodCount = lods.map(() => 0);
  const raise = +(q.get('raise') || 0);
  lods.forEach((l, li) => {
    for (let b = 0; b < N; b++) people.push({ x: (b - (N - 1) / 2) * 0.82, z: -li * 1.6, yaw: 0, lod: li, idx: lodCount[li]++, body: b, raise: li === 0 && b % 3 === 2 ? raise : 0 });
  });
  const crowd = createCrowd({ THREE, pack, people, lodCount, rnd, lods });
  if (q.get('dress') === '0') {
    // every garment as baked: the recolours off
    for (const m of crowd.group.children) for (const n of ['iTop', 'iLower', 'iShoe', 'iHair']) {
      const a = m.geometry.attributes[n];
      for (let i = 0; i < a.count; i++) a.setX(i, -1);
    }
  }
  if (q.has('w')) crowd.setDebug(true);
  scene.add(crowd.group);
  crowd.setLight(new THREE.Color(0.25, 0.4, 0.5), new THREE.Color(0.02, 0.022, 0.026), new THREE.Color(0.01, 0.008, 0.012));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
  for (const p of people) {
    const y = /^seat/.test(lods[p.lod]) ? 0.45 - pack.header.seat.seatY : 0;
    M.compose(V.set(p.x, y, p.z), Q.setFromEuler(new THREE.Euler(0, p.yaw, 0)), S);
    crowd.setPerson(p, M, p.raise, p.raise * 0.9);
  }
  crowd.commit();
  renderer.render(scene, camera);
  window.__info = { triangles: crowd.triangles, drawCalls: crowd.drawCalls, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  window.__ready = true;
}).catch((e) => { console.error(e); window.__err = String(e && e.stack || e); });
