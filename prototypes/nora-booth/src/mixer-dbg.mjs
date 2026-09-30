import * as THREE from 'three';
import { createMixer } from './djmMixer.mjs';
const c = document.createElement('canvas'); document.body.style.margin='0'; document.body.appendChild(c);
const r = new THREE.WebGLRenderer({ canvas: c, antialias: true }); r.setSize(innerWidth, innerHeight);
const s = new THREE.Scene(); s.background = new THREE.Color('#223');
const m = createMixer({ THREE }); s.add(m.group);
m.set({ ch: [{ fader: 0.5 }] });
const caps = m.group.getObjectByName('faderCaps');
const mode = new URLSearchParams(location.search).get('mode') || 'normal';
if (mode === 'normal') caps.material = new THREE.MeshNormalMaterial();
s.add(new THREE.HemisphereLight('#fff', '#333', 0.5)); const dl = new THREE.DirectionalLight('#fff', 3); dl.position.set(0.3, 1, 0.5); s.add(dl);
if (mode === 'rough') caps.material.roughness = 0.8;
if (mode.startsWith('v')) {
  const skip = mode.slice(1).split('');   // letters: c=color, r=rough, m=metal, e=emissive, a=aMat varying
  const mm = new THREE.MeshStandardMaterial({ color: '#101113', roughness: 0.36, metalness: 0.08 });
  mm.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: new THREE.Color('#fff') }; sh.uniforms.uPaintGlow = { value: 0.3 };
    if (!skip.includes('a')) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aMat;\nvarying vec3 vMat;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;');
    else sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMat;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = vec3(0.0);');
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPaint;\nuniform float uPaintGlow;\nvarying vec3 vMat;');
    if (!skip.includes('c')) f = f.replace('#include <color_fragment>', 'vec3 instEm = vec3(0.0);\ndiffuseColor.rgb = mix( diffuseColor.rgb, uPaint, vMat.r );');
    else f = f.replace('#include <color_fragment>', 'vec3 instEm = vec3(0.0);');
    if (!skip.includes('r')) f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.3, vMat.b );\nroughnessFactor = mix( roughnessFactor, 0.55, vMat.r * ( 1.0 - vMat.b ) );');
    if (!skip.includes('m')) f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 1.0, vMat.b );\nmetalnessFactor *= 1.0 - vMat.r * ( 1.0 - vMat.b );');
    if (!skip.includes('e')) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += instEm * vMat.g + uPaint * uPaintGlow * vMat.r * ( 1.0 - vMat.b );');
    sh.fragmentShader = f;
  };
  caps.material = mm;
}
if (mode === 'plain') caps.material = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.36 });
const cam = new THREE.PerspectiveCamera(20, innerWidth / innerHeight, 0.005, 5);
cam.position.set(-0.168 + 0.02, 0.108 + 0.06, 0.051 + 0.06); cam.lookAt(-0.168, 0.118, 0.051);
const dr = new URLSearchParams(location.search).get('dr'); if (dr) caps.geometry.setDrawRange(Number(dr.split(',')[0]), Number(dr.split(',')[1]));
r.render(s, cam);
const g = caps.geometry, p = g.attributes.position, n = g.attributes.normal; let bad = 0, degen = 0;
for (let i = 0; i < n.count; i++) if (!Number.isFinite(n.getX(i)) || Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) > 0.01) bad++;
for (let i = 0; i < p.count; i += 3) { const a=new THREE.Vector3().fromBufferAttribute(p,i), b=new THREE.Vector3().fromBufferAttribute(p,i+1), d=new THREE.Vector3().fromBufferAttribute(p,i+2); if (b.sub(a).cross(d.sub(a)).length() < 1e-14) degen++; }
const am = g.attributes.aMat; const top = { bodyTopY: [], lineY: [] };
for (let i = 0; i < p.count; i++) { const y = p.getY(i) * 1000; if (am.getX(i) > 0.9 && n.getY(i) > 0.9) top.lineY.push(+y.toFixed(3)); if (am.getX(i) === 0 && am.getZ(i) === 0 && n.getY(i) > 0.95) top.bodyTopY.push(+y.toFixed(3)); }
top.bodyTopY = [Math.min(...top.bodyTopY), Math.max(...top.bodyTopY)]; top.lineY = [Math.min(...top.lineY), Math.max(...top.lineY)];
const ranges = {}; for (let i = 0; i < p.count; i++) { const k = am.getX(i).toFixed(2)+'/'+am.getZ(i).toFixed(2); const y=p.getY(i)*1000; ranges[k] = ranges[k] ? [Math.min(ranges[k][0], y), Math.max(ranges[k][1], y)] : [y, y]; }
window.__info = { verts: n.count, bad, degen, top, ranges }; window.__ok = true;
