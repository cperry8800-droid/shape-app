import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { NoraPerformer } from './noraPerformer.mjs';
const q = new URLSearchParams(location.search);
const W = innerWidth, H = innerHeight;
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(W, H); document.body.appendChild(r.domElement);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0c10);
scene.add(new THREE.HemisphereLight(0x8899aa, 0x111111, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(-1, 3, -2); scene.add(key);
const rim = new THREE.DirectionalLight(0x34d6c5, 3); rim.position.set(0, 2, 3); scene.add(rim);
// placeholder table + gear
const box = (w,h,d,x,y,z,c)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:c,roughness:.6}));m.position.set(x,y,z);scene.add(m);return m;};
box(1.5,0.92,0.62,0,0.46,-0.09,0x222428);
for (const x of [-0.391, 0.391]) { box(0.329,0.1185,0.453,x,0.92+0.059,0.20-0.2265,0x111111);
  const jog=new THREE.Mesh(new THREE.CylinderGeometry(0.103,0.103,0.01,32),new THREE.MeshStandardMaterial({color:0x444444}));jog.position.set(x,1.045,0.03);scene.add(jog); }
box(0.413,0.108,0.444,0,0.92+0.054,0.20-0.222,0x1a1a1a);
const floor=box(8,0.02,8,0,-0.01,0,0x151515);
const cam = new THREE.PerspectiveCamera(35, W/H, 0.05, 50);
const views = { front:[0,1.55,-2.4, 0,1.2,0.2], three:[-1.6,1.6,-1.6, 0,1.15,0.2], side:[2.2,1.3,0.1, 0,1.15,0.2], top:[0,2.6,0.9, 0,1.0,0.0], back:[0.6,1.7,1.6,0,1.1,0] };
const v = views[q.get('v')||'three']; cam.position.set(v[0],v[1],v[2]); cam.lookAt(v[3],v[4],v[5]);
const loader = new GLTFLoader(); loader.register((p)=>new VRMLoaderPlugin(p));
loader.load('nora.vrm', (gltf) => {
  const vrm = gltf.userData.vrm; VRMUtils.removeUnnecessaryVertices(gltf.scene); VRMUtils.combineSkeletons(gltf.scene); VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  const p = new NoraPerformer({ THREE, vrm, height: 1.7, stand: { x: 0, y: 0, z: 0.36 } }); p.attach(scene);
  const pose = q.get('p') || 'jogs';
  const V = (x,y,z)=>new THREE.Vector3(x,y,z);
  const poses = {
    jogs: { left:{pos:V(-0.391,1.05,0.03),palm:'down'}, right:{pos:V(0.391,1.05,0.03),palm:'down'} },
    mixer:{ left:{pos:V(-0.06,1.03,0.14),palm:'pinch'}, right:{pos:V(0.06,1.06,-0.05),palm:'pinch'} },
    ear:  { left:{pos:V(-0.391,1.05,0.03),palm:'down'}, right:{palm:'ear', pos:null} },
    air:  { left:{pos:V(-0.06,1.03,0.14),palm:'pinch'}, right:{pos:V(0.35,2.05,0.1),palm:'air'} },
    rest: {},
  };
  const hands = poses[pose];
  let t = 0;
  for (let i = 0; i < 90; i++) { t += 1/30;
    if (hands.right && hands.right.palm==='ear') { const hp=new THREE.Vector3(); p.headphones.userData.cups[1].getWorldPosition(hp); hands.right.pos = hp; }
    p.update(1/30, { t, beat: t*2.07, kick: 0.5, energy: 0.7, hands, look: V(0,1.05,0.0), drop: pose==='air'?1:0 }); }
  r.render(scene, cam); window.__ready = true;
  window.__info = { scale: p.scale, lean: p.lean };
}, undefined, (e)=>{ window.__err = String(e); });
