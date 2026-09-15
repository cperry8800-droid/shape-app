// NORA IS A PROJECTION, AND THE PROJECTION STILL MOVES.
//
// WHY THIS FILE EXISTS: on 2026-09-15 the owner looked at the Radio page's
// "Nora · DJ preview" and said "the look of nora here needs to be updated, not
// so avatar looking". The fix is a MATERIAL — noraHologram.mjs renders the same
// rig as light made of the Signal Field's dots — and a material swap has three
// ways to go quietly wrong that no render harness in this container can see
// at a glance: a shader that does not carry three.js's skinning chunks (a frozen
// T-pose), a depth prepass whose clone copies the morph influences instead of
// sharing them (an eyelid whose depth lags its light), and an outline shell
// left visible (a second, larger Nora around the first). Each is driven here
// against a stub THREE and a fake graph, because the module takes THREE by
// injection precisely so this can run in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import {
  NORA_LOOKS, NORA_DEFAULT_LOOK, HOLO_VERT, HOLO_FRAG,
  holoParams, createHologram, applyHologram, updateHologram,
} from '../public/newdesign/noraHologram.mjs';

// --- a stub THREE: only what the module reaches for ------------------------
class StubMaterial { constructor(p = {}) { Object.assign(this, p); this.disposed = 0; } dispose() { this.disposed += 1; } }
const THREE = {
  ShaderMaterial: class extends StubMaterial { constructor(p) { super(p); this.isShaderMaterial = true; } },
  MeshBasicMaterial: class extends StubMaterial { constructor(p) { super(p); this.isMeshBasicMaterial = true; } },
  Color: class { constructor(c) { this.hex = c; } },
  AdditiveBlending: 'additive', NormalBlending: 'normal', FrontSide: 'front', DoubleSide: 'double',
};

// --- a fake scene graph with three.js's own add/remove/traverse semantics -----
class Node {
  constructor(name) { this.name = name; this.children = []; this.parent = null; this.visible = true; }
  add(c) { if (c.parent) c.parent.remove(c); c.parent = this; this.children.push(c); return this; }
  remove(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parent = null; } return this; }
  traverse(fn) { fn(this); for (const c of this.children.slice()) c.traverse(fn); }
}
class Mesh extends Node {
  constructor(name, material, morph = [0, 0]) {
    super(name); this.isMesh = true; this.material = material;
    this.morphTargetInfluences = morph; this.morphTargetDictionary = { blink: 0 };
    this.skeleton = { bones: ['hips'] }; this.renderOrder = 0;
  }
  // three.js: SkinnedMesh.clone() shares the skeleton and COPIES the influences.
  clone() { const m = new Mesh(`${this.name}~`, this.material, this.morphTargetInfluences.slice()); m.skeleton = this.skeleton; return m; }
}
function rig() {
  const root = new Node('root'); const grp = new Node('grp'); root.add(grp);
  const surface = new StubMaterial({ name: 'Body' }); const outline = new StubMaterial({ name: 'Body (Outline)', isOutline: true });
  const body = new Mesh('body', [surface, outline]);               // MToon: outline as a 2nd array entry
  const face = new Mesh('face', new StubMaterial({ name: 'Face' }), [0.3]); // a single material, a morph
  const shell = new Mesh('shell', new StubMaterial({ name: 'Hair (Outline)', isOutline: true })); // an outline-only mesh
  grp.add(body); grp.add(face); grp.add(shell);
  return { root, grp, body, face, shell, surface, outline };
}

test('the looks, and what each asks of the material', () => {
  assert.ok(NORA_LOOKS.includes(NORA_DEFAULT_LOOK), 'the default look is not a look');
  assert.equal(NORA_DEFAULT_LOOK, 'dots', 'the shipped default is no longer the projection');
  const dots = holoParams('dots'); const wire = holoParams('wire'); const solid = holoParams('solid');
  // Additive light needs the depth prepass and must not write depth itself.
  for (const [name, p] of [['dots', dots], ['wire', wire]]) {
    assert.ok(p.additive && p.depthPrepass && !p.depthWrite, `${name} is additive without the prepass, or writes its own depth`);
  }
  assert.ok(!solid.additive && solid.depthWrite && !solid.depthPrepass, 'solid is not an ordinary depth-written surface');
  assert.equal(dots.mode, 0); assert.equal(wire.mode, 1); assert.equal(solid.mode, 2);
  assert.ok(wire.wireframe && !dots.wireframe && !solid.wireframe);
  assert.equal(holoParams('avatar'), null, 'avatar is no longer the VRM\'s own materials');
  assert.equal(holoParams('nonsense'), null, 'an unknown look does not fall back to a hologram');
});

test('the vertex shader skins and morphs, in three.js\'s own order', () => {
  const at = (s) => { const i = HOLO_VERT.indexOf(s); assert.ok(i >= 0, `${s} is gone — the projection ${s.includes('skin') ? 'no longer skins (a frozen T-pose)' : 'no longer morphs (she never blinks)'}`); return i; };
  const main = at('void main()');
  assert.ok(at('#include <morphtarget_pars_vertex>') < main && at('#include <skinning_pars_vertex>') < main, 'the pars chunks are inside main');
  const order = ['<beginnormal_vertex>', '<morphnormal_vertex>', '<skinbase_vertex>', '<skinnormal_vertex>', '<begin_vertex>', '<morphtarget_vertex>', '<skinning_vertex>'].map((c) => at(`#include ${c}`));
  for (let i = 1; i < order.length; i += 1) assert.ok(order[i] > order[i - 1], 'the chunks are out of three.js\'s order — a later chunk reads a variable an earlier one defines');
  assert.ok(order[0] > main, 'the body chunks are outside main');
  assert.match(HOLO_VERT, /vec4\( transformed, 1\.0 \)/, 'the position is not the skinned/morphed one');
  assert.match(HOLO_VERT, /normalMatrix \* objectNormal/, 'the normal is not the skinned one — the fresnel lights the T-pose');
  for (const u of ['uColor', 'uTime', 'uLevel', 'uCell', 'uOpacity', 'uMode']) assert.match(HOLO_FRAG, new RegExp(`uniform \\w+ ${u};`), `${u} is no longer a uniform`);
  // ⚠ THE CELL ITSELF, NOT "gl_FragCoord SOMEWHERE AFTER uMode == 0". The
  // scanline term reads gl_FragCoord.y a few lines down, so a first cut of this
  // line matched a dot matrix computed in MODEL space — the mutation survived.
  // The pitch is screen-space by construction only if the cell is derived from
  // the fragment's own coordinate.
  assert.match(HOLO_FRAG, /vec2 cell = mod\( gl_FragCoord\.xy, uCell \)/, 'the dot matrix is no longer screen-space — it will swim with the rig instead of sitting on the glass');
});

test('the swap: every surface onto one light, the outline shells gone, the depth prepass sharing the rig', () => {
  const r = rig();
  const h = applyHologram(THREE, r.root, 'dots', { color: '#0ac5a8', pixelRatio: 2 });
  assert.equal(h.meshes, 2, 'expected the body and the face to be swapped');
  assert.equal(h.hidden, 1, 'the outline-only shell was not hidden');
  assert.equal(r.body.material, r.face.material, 'the two surfaces are not on ONE material (two uniform sets to drift)');
  assert.ok(r.body.material.isShaderMaterial, 'the body is not on the hologram');
  assert.equal(r.body.material.blending, 'additive');
  assert.equal(r.body.material.depthWrite, false);
  assert.equal(r.body.material.side, 'double', 'the projection is single-sided — a VRM\'s double-sided clothes would show holes');
  assert.equal(r.shell.visible, false, 'the outline-only shell is still visible — a second Nora around the first');
  // The depth prepass: one clone per swapped mesh, on the depth material, in the opaque pass.
  const clones = r.grp.children.filter((c) => c.name.endsWith('~'));
  assert.equal(clones.length, 2, `expected a depth clone per swapped mesh, found ${clones.length}`);
  for (const c of clones) {
    assert.ok(c.material.isMeshBasicMaterial && c.material.colorWrite === false, 'the depth clone writes colour — a second lit figure');
    // ⚠ THE PREPASS MUST SEE WHAT THE LIGHT SEES. A double-sided light over a
    // front-sided prepass leaves every back face un-depthed, so it adds
    // through whatever is in front of it — the tangle the prepass exists to
    // stop, on exactly the surfaces (hair cards, a skirt) a VRM marks
    // double-sided.
    assert.equal(c.material.side, r.body.material.side, 'the depth prepass and the light disagree about sidedness');
    assert.equal(c.renderOrder, -1);
    assert.equal(c.skeleton, r[c.name.replace('~', '')].skeleton, 'the depth clone has its own skeleton — it will not follow the rig');
  }
  const faceClone = clones.find((c) => c.name === 'face~');
  assert.equal(faceClone.morphTargetInfluences, r.face.morphTargetInfluences, 'the depth clone COPIED the morph influences — a blinking eyelid\'s depth lags its light');
  // uCell is in device pixels.
  assert.equal(h.holo.uniforms.uCell.value, 5.5 * 2);
  assert.equal(h.holo.uniforms.uColor.value.hex, '#0ac5a8');
  // restore() puts everything back exactly, by reference.
  const holoMat = r.body.material; const depthMat = clones[0].material;
  h.restore();
  assert.equal(r.body.material.length, 2, 'the body\'s material array did not come back');
  assert.equal(r.body.material[1], r.outline, 'the outline entry did not come back by reference');
  assert.equal(r.face.material.name, 'Face');
  assert.equal(r.shell.visible, true, 'the hidden shell was not shown again');
  assert.equal(r.grp.children.filter((c) => c.name.endsWith('~')).length, 0, 'the depth clones were left in the scene');
  assert.equal(holoMat.disposed, 1); assert.equal(depthMat.disposed, 1);
});

test('solid needs no prepass, avatar touches nothing at all', () => {
  const r = rig();
  const h = applyHologram(THREE, r.root, 'solid', {});
  assert.equal(r.grp.children.filter((c) => c.name.endsWith('~')).length, 0, 'solid added depth clones it does not need');
  assert.equal(r.body.material.blending, 'normal'); assert.equal(r.body.material.depthWrite, true);
  h.restore();
  const before = JSON.stringify({ names: r.grp.children.map((c) => c.name), vis: r.shell.visible, mats: [Array.isArray(r.body.material), r.face.material.name] });
  const a = applyHologram(THREE, r.root, 'avatar', {});
  assert.equal(a.holo, null); assert.equal(a.meshes, 0); assert.equal(a.hidden, 0);
  assert.equal(JSON.stringify({ names: r.grp.children.map((c) => c.name), vis: r.shell.visible, mats: [Array.isArray(r.body.material), r.face.material.name] }), before, 'the avatar look changed the scene — the outline shell was hidden');
  a.restore();
});

test('the frame update writes the instant and nothing eases', () => {
  const r = rig();
  const h = applyHologram(THREE, r.root, 'dots', {});
  updateHologram(h, { t: 12.5, level: 0.4 });
  assert.equal(h.holo.uniforms.uTime.value, 12.5); assert.equal(h.holo.uniforms.uLevel.value, 0.4);
  updateHologram(h, { t: NaN, level: 7 });
  assert.equal(h.holo.uniforms.uTime.value, 0); assert.equal(h.holo.uniforms.uLevel.value, 1, 'the level is not clamped');
  updateHologram(null, { t: 1 }); updateHologram(applyHologram(THREE, r.root, 'avatar', {}), { t: 1 }); // null-safe
  h.restore();
});

test('the stage applies the look on load, drives it per frame and restores it on dispose', () => {
  const src = stripComments(readFileSync('public/newdesign/noraStage.mjs', 'utf8'));
  assert.match(src, /import \{[^}]*applyHologram[^}]*\} from '\.\/noraHologram\.mjs'/, 'the stage no longer imports the projection');
  const load = src.slice(src.indexOf('async load()'), src.indexOf('_applyLook() {'));
  assert.match(load, /this\.scene\.add\(vrm\.scene\);[\s\S]*this\._applyLook\(\);/, 'the look is not applied once the VRM is in the scene');
  // The loop's own first line re-arms the frame, so the slice ends at the LAST
  // `requestAnimationFrame(loop)` — the one that starts it, after the body.
  const loop = src.slice(src.indexOf('const loop = (now) => {'), src.lastIndexOf('this._raf = requestAnimationFrame(loop);'));
  assert.ok(loop.length > 300, `the loop slice is ${loop.length} chars — this guard is reading the wrong thing`);
  assert.match(loop, /updateHologram\(this\._holo, \{ t: now \/ 1000, level: bands\.level \}\)/, 'the projection is not fed the frame');
  const dispose = src.slice(src.indexOf('dispose() {'));
  assert.ok(dispose.indexOf('this._holo.restore()') >= 0 && dispose.indexOf('this._holo.restore()') < dispose.indexOf('deepDispose'), 'dispose does not restore the VRM before disposing it — the shared hologram material is disposed with the model');
  assert.match(src, /this\.look = look \|\| NORA_DEFAULT_LOOK/, 'the stage no longer defaults to the projection');
  // The Radio page hands the stage the page's accent, so Nora recolours with it.
  const radio = stripComments(readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', 'utf8'));
  // `[^)]`, not `[^}]`: the call carries a template literal (`${import.meta.env.BASE_URL}`) whose brace would end a `[^}]*` early.
  assert.match(radio, /new NoraStage\(\{[^)]*color: t\.ACCENT/, 'the Radio page no longer hands Nora the accent');
});
