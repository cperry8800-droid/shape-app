// lightBake: the shadow rays, the falloff, the AO and the grids the venue's light bake stands on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rayBox, boxGrid, occluded, lightGrid, directAt, aoAt, bakeMesh, bounceField, gridQuad } from '../public/newdesign/booth/lightBake.mjs';

const SLAB = [-5, 2, -5, 5, 2.4, 5];   // a slab 2–2.4 m up, 10 × 10 m

test('rayBox: hits the slab going up, misses beside it and short of it', () => {
  assert.equal(rayBox(0, 0, 0, 0, 1, 0, 10, SLAB), true);
  assert.equal(rayBox(6, 0, 0, 0, 1, 0, 10, SLAB), false);
  assert.equal(rayBox(0, 0, 0, 0, 1, 0, 1.5, SLAB), false);   // stops before the slab
});

test('occluded: the grid walk finds the slab from any cell, in both directions', () => {
  const G = boxGrid([SLAB], 1.5);
  assert.equal(occluded(G, 0.3, 0, -0.7, 0, 1, 0, 5), true);
  assert.equal(occluded(G, 0.3, 5, -0.7, 0, -1, 0, 5), true);
  const d = [0.6, 0.8, 0]; const l = Math.hypot(...d);
  assert.equal(occluded(G, -3, 0, 0, d[0] / l, d[1] / l, 0, 8), true);
  assert.equal(occluded(G, 7, 0, 0, 0, 1, 0, 8), false);
});

test('directAt: inverse-square, cosine-weighted, and a slab casts a shadow', () => {
  const L = [{ p: [0, 1, 0], c: [1, 1, 1], r0: 0, range: 20 }];
  const LG = lightGrid(L, 3), E = [0, 0, 0];
  directAt(0, 0, 0, 0, 1, 0, LG, null, E);
  assert.ok(Math.abs(E[0] - 1) < 1e-6);                 // 1 m straight below: 1
  directAt(2, 0, 0, 0, 1, 0, LG, null, E);
  const cos = 1 / Math.hypot(2, 1), want = cos / 5;
  assert.ok(Math.abs(E[0] - want) < 1e-6);
  directAt(0, 0, 0, 0, -1, 0, LG, null, E);
  assert.equal(E[0], 0);                                 // facing away: nothing
  const above = [{ p: [0, 3, 0], c: [1, 1, 1], r0: 0, range: 20 }];
  directAt(0, 0, 0, 0, 1, 0, lightGrid(above, 3), boxGrid([SLAB], 1.5), E);
  assert.equal(E[0], 0);                                 // the slab is between: shadow
});

test('aoAt: an open floor is fully open, a floor under a low slab and against a wall is not', () => {
  const OG = boxGrid([[-5, 0.5, -5, 5, 0.7, 5], [0.2, -1, -5, 0.6, 3, 5]], 1);
  const dirs = [];
  for (let i = 0; i < 16; i++) { const z = 1 - (i + 0.5) / 16, r = Math.sqrt(1 - z * z), a = i * 2.39996; dirs.push([Math.cos(a) * r, Math.sin(a) * r, z]); }
  assert.equal(aoAt(20, 0, 0, 0, 1, 0, OG, dirs, 1.2), 1);
  const corner = aoAt(0, 0, 0, 0, 1, 0, OG, dirs, 1.2);
  assert.ok(corner < 0.3, `corner AO ${corner}`);
});

test('bakeMesh: lights the vertex under a lamp, leaves a far one at its ambient colour', () => {
  const pos = [0, 0, 0, 30, 0, 0], nrm = [0, 1, 0, 0, 1, 0], col = [0.02, 0.02, 0.02, 0.02, 0.02, 0.02];
  const LG = lightGrid([{ p: [0, 1, 0], c: [2, 1.5, 1], r0: 0.2, range: 6 }], 3);
  bakeMesh({ pos, nrm, col, LG, OG: null, aoRays: 0 });
  assert.ok(col[0] > 0.3 && col[0] > col[2]);            // a warm pool
  assert.ok(Math.abs(col[3] - 0.02) < 1e-9);              // untouched
});

test('bounceField: a lit floor lifts the soffit above it, not the one beside it', () => {
  const samples = [];
  for (let x = -1; x <= 1; x += 0.25) for (let z = -1; z <= 1; z += 0.25) samples.push({ p: [x, 0, z], n: [0, 1, 0], rad: [0.5, 0.4, 0.3] });
  const B = bounceField(samples, { cell: 0.5, radius: 3, gain: 1 });
  const up = B.at(0, 2, 0, 0, -1, 0).slice();
  const away = B.at(0, 2, 0, 0, 1, 0).slice();
  assert.ok(up[0] > 0.01);
  assert.equal(away[0], 0);
});

test('gridQuad: cells, counts and a normal that follows u × v', () => {
  const g = gridQuad([0, 0, 0], [1, 0, 0], [0, 0, -1], 3, 2, 0.5);
  assert.equal(g.pos.length / 3, 7 * 5);
  assert.equal(g.idx.length / 3, 6 * 4 * 2);
  assert.deepEqual(g.nrm.slice(0, 3).map((v) => v + 0), [0, 1, 0]);   // + 0: a -0 is still up
});
