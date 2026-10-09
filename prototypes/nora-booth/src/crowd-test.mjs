// Line-up of the baked crowd figures: near row (three hair lengths × arms down / half / up),
// far row behind. ?url=crowd.bin.txt  &cam=front|back|side
import * as THREE from 'three';
import { loadCrowdPack, createAvatarCrowd } from '../../../public/newdesign/booth/crowdAvatars.mjs';

const q = new URLSearchParams(location.search);
const canvas = document.createElement('canvas');
document.body.style.margin = '0'; document.body.style.background = '#000'; document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070c);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 60);
const cam = q.get('cam') || 'front';
const solo = q.has('solo'); // one near figure, close up, raise from ?raise=
const D = solo ? 2.6 : 5.2, LY = solo ? 1.1 : 1.05;
if (cam === 'front') { camera.position.set(0, 1.5, D); camera.lookAt(0, LY, 0); }
else if (cam === 'back') { camera.position.set(0, 1.5, -D); camera.lookAt(0, LY, 0); }
else { camera.position.set(D, 1.4, 0.3); camera.lookAt(0, LY, 0); }
scene.add(new THREE.HemisphereLight(0x223044, 0x0b0806, 0.5));
const key = new THREE.SpotLight(0xffead6, 60, 0, 0.6, 0.7, 2); key.position.set(1.5, 4, 5); key.target.position.set(0, 1, 0); scene.add(key, key.target);
const top = new THREE.SpotLight(0xd8ecff, 80, 0, 0.6, 0.7, 2); top.position.set(-1, 4.5, -3); top.target.position.set(0, 1, 0); scene.add(top, top.target);

let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const people = [];
const lodCount = [0, 0];
if (solo) people.push({ x: 0, z: 0, yaw: 0, lod: +(q.get('lod') || 0), idx: lodCount[+(q.get('lod') || 0)]++, s: 1, w: 1, raise: +(q.get('raise') || 0), hair: +(q.get('hair') || 0) });
else {
  for (let i = 0; i < 9; i++) people.push({ x: (i - 4) * 0.75, z: 0, yaw: 0, lod: 0, idx: lodCount[0]++, s: 1, w: 1, raise: [0, 1.35, 2.7][i % 3] });
  for (let i = 0; i < 9; i++) people.push({ x: (i - 4) * 0.75, z: -2.2, yaw: 0, lod: 1, idx: lodCount[1]++, s: 1, w: 1, raise: [0, 1.35, 2.7][(i + 1) % 3] });
}

loadCrowdPack(q.get('url') || 'crowd.bin.txt').then((pack) => {
  if (!solo) people.forEach((p) => { p.hair = p.idx % 3; }); // every hair length shows on both rows
  const crowd2 = createAvatarCrowd({ THREE, pack, people, lodCount, rnd });
  if (q.has('w')) crowd2.setDebug(true);
  scene.add(crowd2.group);
  crowd2.setLight(new THREE.Color(0.2, 0.32, 0.4), new THREE.Color(0.01, 0.014, 0.018));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
  for (const p of people) {
    M.compose(V.set(p.x, 0, p.z), Q.setFromEuler(new THREE.Euler(0, p.yaw, 0)), S);
    crowd2.setPerson(p, M, p.raise, solo ? +(q.get('raiseR') || 0) : p.raise * (p.idx % 2 ? 1 : 0.5));
  }
  crowd2.commit();
  renderer.render(scene, camera);
  window.__info = { triangles: crowd2.triangles, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  window.__ready = true;
}).catch((e) => { console.error(e); window.__err = String(e); });
