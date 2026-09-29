// arenaStage: the arena-scale main stage stays inside its envelope (clear of the balconies, the
// ceiling and the end wall), keeps Nora's booth and portal clear, and costs less on phones.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createArenaStage, ARENA_DIMS } from '../src/arenaStage.mjs';

const build = (quality) => createArenaStage({ THREE, quality, mergeGeometries });
const boundsOf = (group) => {
  group.updateMatrixWorld(true);
  const all = new THREE.Box3(), meshes = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;   // the beams are instanced and move; checked below
    const b = new THREE.Box3().setFromObject(o);
    meshes.push({ name: o.name, b });
    all.union(b);
  });
  return { all, meshes };
};

test('the stage stays inside the stage end: clear of the balconies (|x| 10.5), the ceiling (15.5) and the end wall (z 6)', () => {
  const a = build('high');
  const { all, meshes } = boundsOf(a.group);
  assert.ok(meshes.length > 10);
  assert.ok(all.max.x <= 10.46 && all.min.x >= -10.46, `x ${all.min.x.toFixed(2)}…${all.max.x.toFixed(2)}`);
  assert.ok(all.max.y <= 15.45, `top ${all.max.y.toFixed(2)}`);
  assert.ok(all.max.z <= 5.99, `back ${all.max.z.toFixed(2)}`);
  assert.ok(all.min.y >= ARENA_DIMS.FLOOR_Y - 0.01, `bottom ${all.min.y.toFixed(2)}`);
  a.dispose();
});

test('nothing lands on Nora: the booth zone (|x| < 1.6, −0.8 < z < 1.9, above the deck) is clear', () => {
  const a = build('high');
  const zone = new THREE.Box3(new THREE.Vector3(-1.6, ARENA_DIMS.DECK_Y + 0.01, -0.8), new THREE.Vector3(1.6, 8.0, 1.9));
  for (const { name, b } of boundsOf(a.group).meshes) {
    if (name === 'arenaTruss' || name === 'arenaSpotCans' || name === 'arenaSpotLenses' || name === 'arenaMovingHeads') {
      assert.ok(b.min.y > 8.5, `${name} hangs at ${b.min.y.toFixed(2)}`);   // the rig is overhead, above the portal
      continue;
    }
    // the runway's merged box reaches back under the deck's nose; it never rises above the deck
    if (name === 'arenaRunway' || name === 'arenaRunwayLines') { assert.ok(b.max.y <= ARENA_DIMS.DECK_Y + 0.01, name); continue; }
    if (name === 'arenaLedWall' || name === 'arenaWallFrame') { assert.ok(b.min.z >= ARENA_DIMS.BACK_Z - 0.01, name); continue; }
  }
  // every other vertex: none inside the zone (a merged mesh's box spans the gap between the wings)
  const v = new THREE.Vector3();
  a.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || /Truss|Spot|MovingHeads|Runway|LedWall|WallFrame/.test(o.name)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      assert.ok(!zone.containsPoint(v), `${o.name} has a vertex at ${v.toArray().map((c) => c.toFixed(2))}`);
    }
  });
  a.dispose();
});

test('the mark: ▸ at +x on the top step, ◂ at −x raised by 20/44 of its height, both pointing in', () => {
  const a = build('high');
  const faces = a.group.getObjectByName('arenaMarkFaces');
  const p = faces.geometry.attributes.position;
  let maxL = -Infinity, maxR = -Infinity, minXL = Infinity, maxXR = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    if (x > 0) { maxL = Math.max(maxL, y); minXL = Math.min(minXL, x); }
    else { maxR = Math.max(maxR, y); maxXR = Math.max(maxXR, x); }
  }
  assert.ok(Math.abs(maxR - maxL - 6.2 * 20 / 44) < 1e-3, `lift ${(maxR - maxL).toFixed(3)}`);
  assert.ok(minXL > 5.4 && maxXR < -5.4, 'the tips reach the portal edge and no further');
  a.dispose();
});

test('phones pay less: fewer beams and par cans, no truss lacing', () => {
  const hi = build('high'), lo = build('low');
  assert.ok(lo.counts.beams < hi.counts.beams && lo.counts.beams <= 6);
  assert.ok(lo.counts.pars < hi.counts.pars);
  const tris = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { const geo = o.geometry; n += (geo.index ? geo.index.count : geo.attributes.position.count) / 3; } }); return n; };
  assert.ok(tris(lo.group) < tris(hi.group) * 0.6, `low ${tris(lo.group)} vs high ${tris(hi.group)}`);
  hi.dispose(); lo.dispose();
});

test('the beams animate without flashing: a beat of kicks moves their colour less than 15 %', () => {
  const a = build('high');
  a.set({ bands: { level: 0.6 }, kick: 0, drop: 0, bar: 0 });
  for (let i = 0; i < 360; i++) a.update(1 / 60, i / 60);   // let the level settle
  const col = a.group.getObjectByName('arenaBeams').geometry.attributes.aColor;
  const base = col.getX(0);
  a.set({ kick: 1 });
  let peak = base;
  for (let i = 0; i < 30; i++) { a.update(1 / 60, 6 + i / 60); peak = Math.max(peak, col.getX(0)); }
  assert.ok(base > 0 && peak / base < 1.15, `kick lift ${(peak / base).toFixed(3)}`);
  a.dispose();
});

test('the drone flies clear of the rig: at least a metre from the truss, the lights and the speakers', async () => {
  const { _droneForTest } = await import('../src/noraDirector.mjs');
  const a = build('high');
  a.group.updateMatrixWorld(true);
  const rig = [];
  a.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && /Truss|Spot|MovingHeads|LineArrays/.test(o.name)) rig.push([o.name, new THREE.Box3().setFromObject(o)]); });
  assert.equal(rig.length, 5);
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  for (let i = 0; i < 2000; i++) {
    _droneForTest.droneAt(i / 2000, P, T);
    for (const [n, b] of rig) assert.ok(b.distanceToPoint(P) > 1.0, `${n} is ${b.distanceToPoint(P).toFixed(2)} m from the drone at ${P.toArray().map((c) => c.toFixed(1))}`);
  }
  a.dispose();
});
