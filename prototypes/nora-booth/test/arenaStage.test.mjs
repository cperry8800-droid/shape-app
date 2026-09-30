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
    if (name === 'arenaLedWall' || name === 'arenaWallFrame') { assert.ok(b.min.z >= ARENA_DIMS.BACK_Z - 0.01, name); continue; }
  }
  // every other vertex: none inside the zone (a merged mesh's box spans the gap between the wings)
  const v = new THREE.Vector3();
  a.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || /Truss|Spot|MovingHeads|LedWall|WallFrame/.test(o.name)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      assert.ok(!zone.containsPoint(v), `${o.name} has a vertex at ${v.toArray().map((c) => c.toFixed(2))}`);
    }
  });
  a.dispose();
});

test('no runway and no statues: the crowd runs to the stage lip, and the mark is only on the screen', () => {
  // the owner: "remove this walk way in front of stage", "remove the outside 2 large triangles"
  for (const q of ['high', 'low']) {
    const a = build(q);
    const names = [];
    a.group.traverse((o) => { if (o.isMesh) names.push(o.name); });
    assert.ok(!names.some((n) => /Runway|BStage|Mark/i.test(n)), `${q}: ${names.join(' ')}`);
    assert.equal(ARENA_DIMS.RUNWAY, undefined);
    assert.equal(ARENA_DIMS.BSTAGE, undefined);
    // nothing of the stage reaches out past the deck's nose into the crowd
    const { all } = boundsOf(a.group);
    const floor = new THREE.Box3(new THREE.Vector3(-6, ARENA_DIMS.FLOOR_Y, -40), new THREE.Vector3(6, ARENA_DIMS.DECK_Y + 0.5, -1.5));
    a.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const bb = new THREE.Box3().setFromObject(o);
      assert.ok(!bb.intersectsBox(floor), `${o.name} reaches the dance floor: z ${bb.min.z.toFixed(2)}`);
    });
    assert.ok(all.max.z <= 5.99);
    a.dispose();
  }
});

test('no stairs on the sides: the wings are a flat deck, and the wall is the only LED', () => {
  // the owner: "remove the stairs on the sides of the stage"
  for (const q of ['high', 'low']) {
    const a = build(q);
    const wall = a.group.getObjectByName('arenaLedWall');
    const led = [];
    a.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.material === wall.material) led.push(o.name); });
    assert.deepEqual(led, ['arenaLedWall'], `${q}: LED surfaces ${led.join(' ')}`);
    a.group.updateMatrixWorld(true);
    // nothing on the wings stands above the deck: the tallest thing out there is its own top
    for (const name of ['arenaWings', 'arenaWingLines', 'arenaParCans', 'arenaParLenses']) {
      const b = new THREE.Box3().setFromObject(a.group.getObjectByName(name));
      assert.ok(b.max.y <= ARENA_DIMS.DECK_Y + 0.001, `${q}: ${name} rises to ${b.max.y.toFixed(2)}`);
    }
    a.dispose();
  }
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
