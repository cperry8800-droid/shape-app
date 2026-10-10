// Club Shape from outside (clubExterior.mjs), as the Shape Sets background draws it: an open-air
// amphitheater under a ribbed shell, one teal ribbon along the shell's high back edge and round the
// bowl's rim, so the venue is drawn in one lopsided loop.
// And the arrival shot that flies in to it (noraDirector.mjs), which ends in front of the stage
// outside and cuts to Nora. The exterior is a set of its own, so the hosts swap the whole scene for
// it while the arrival plays; these tests hold the geometry, the flight, the cut and the swap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from './helpers/booth-three.mjs';
import {
  VENUE, EXTERIOR_DIMS, outline, outlinePt, footprintK, lipPoint, backPoint, roofPoint, tierHeight, ribbonPath, landDepth,
  createExterior, createSetSwitch,
} from '../public/newdesign/booth/clubExterior.mjs';
import { NoraDirector, SHOTS, SHOT_IDS, _arrivalForTest } from '../public/newdesign/booth/noraDirector.mjs';
import { LENS } from '../public/newdesign/booth/cinematic.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const HOST = stripComments(readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8'));
const PROTO = stripComments(readFileSync('prototypes/nora-booth/src/main.mjs', 'utf8'));
const CINE = stripComments(readFileSync('public/newdesign/booth/cinematic.mjs', 'utf8'));
const TAU = Math.PI * 2;
const S = VENUE.STAGE, WL = VENUE.WALL, TR = VENUE.TRUSS;

// the roof, sampled densely: [x, y, z] points
const ROOF = [];
for (let i = 0; i <= 240; i++) for (let j = 0; j <= 60; j++) ROOF.push(roofPoint(i / 240, j / 60));
/** The roof's lowest height over plan (x, z), or null where it does not reach. */
function roofOver(x, z, r = 1.5) {
  let h = null;
  for (const p of ROOF) if (Math.abs(p[0] - x) < r && Math.abs(p[2] - z) < r) h = h === null ? p[1] : Math.min(h, p[1]);
  return h;
}

test('the footprint is one closed, flowing outline on the peninsula, with room round it for the plaza', () => {
  let prev = outlinePt(0);
  for (let i = 1; i <= 720; i++) {
    const th = (i / 720) * TAU, p = outlinePt(th);
    assert.ok(outline(th) > 40 && outline(th) < 75, `radius ${outline(th)} at ${th}`);
    assert.ok(Math.abs(footprintK(p[0], p[1]) - 1) < 1e-9, 'footprintK is 1 on the outline');
    assert.ok(Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1.5, 'the outline jumps');
    prev = p;
    const [px, pz] = outlinePt(th, 1, 17);   // the plaza's outer edge
    assert.ok(landDepth(px, pz) > 10, `the plaza at ${th.toFixed(2)} is ${landDepth(px, pz).toFixed(1)} m from the water`);
  }
  assert.ok(footprintK(VENUE.x, VENUE.z + 1) < 0.05 && footprintK(VENUE.x + 200, VENUE.z) > 2);
});

test('the footprint is the picture\'s lopsided loop: pinched on +x between the shell and the bowl', () => {
  // the pinch: the outline dips in between the shell's end and the bowl's bulge in front of it
  const r = (th) => outline(th);
  assert.ok(r(0.22) < r(0.75) * 0.85 && r(0.22) < r(-0.5) * 0.85, `no pinch (${r(0.22).toFixed(1)} against ${r(0.75).toFixed(1)}, ${r(-0.5).toFixed(1)})`);
  assert.ok(VENUE.TH_A > 0.22 && VENUE.TH_A < 0.6, 'the shell rises just past the pinch, so the ribbon bends in on its way up');
});

test('the shell scoops up from its mouth over the stage to its back edge, its face to the bowl', () => {
  for (const t of [0, 1]) {
    for (const p of [lipPoint(t), backPoint(t)]) {
      assert.ok(Math.abs(p[1] - VENUE.RIM_H) < 1e-4, 'the shell comes down onto the rim at its ends');   // sin(π) is 1e-16, not 0, and a power of it is further off
      assert.ok(Math.abs(footprintK(p[0], p[2]) - 1) < 1e-9);
    }
  }
  const mid = lipPoint(0.5);
  assert.ok(mid[1] > VENUE.LIP_H * 0.9 && mid[1] <= VENUE.LIP_H, `the mouth peaks at ${mid[1]}`);
  let peak = 0, peakT = 0;
  for (let i = 0; i <= 200; i++) { const y = backPoint(i / 200)[1]; if (y > peak) { peak = y; peakT = i / 200; } }
  assert.ok(peak > VENUE.BACK_H * 0.97 && peak <= VENUE.BACK_H + 1e-9, `the back edge peaks at ${peak.toFixed(1)}`);
  assert.ok(peakT < 0.45, `highest on +x, the left of the picture (t ${peakT})`);
  for (let i = 1; i < 60; i++) {
    const t = i / 60, back = roofPoint(t, 1);
    assert.ok(Math.abs(footprintK(back[0], back[2]) - 1) < 1e-9, 'the back edge runs on the outline');
    assert.ok(back[1] > lipPoint(t)[1], `the back edge stands over the mouth at t ${t}`);
    for (let j = 0; j <= 20; j++) {
      const p = roofPoint(t, j / 20);
      assert.ok(footprintK(p[0], p[2]) <= 1 + 1e-9, `the shell overhangs the rim at t ${t}, s ${j / 20}`);
      assert.ok(p[1] >= VENUE.RIM_H - 1e-9, 'the shell dips below the rim');
    }
  }
  // its face turns to the bowl: across the middle, the face's normal leans toward −z, the crowd
  for (let i = 6; i <= 14; i++) for (let j = 6; j <= 18; j++) {
    const t = i / 20, s = j / 20, e = 1e-4, p = roofPoint(t, s), a = roofPoint(t + e, s), b = roofPoint(t, s + e);
    const u = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], v = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const up = n[1] < 0 ? -1 : 1;
    assert.ok(n[2] * up < 0, `at t ${t}, s ${s} the face turns away from the bowl`);
  }
  // clear over the stage, over its LED wall, and over the truss across its front
  const clear = (x, z, need, what) => {
    const h = roofOver(x, z);
    assert.notEqual(h, null, `no roof over the ${what} at (${x}, ${z})`);
    assert.ok(h > need, `the roof is ${h.toFixed(1)} m over the ${what} at (${x}, ${z}), under ${need}`);
  };
  for (let x = S.x - S.w / 2; x <= S.x + S.w / 2; x += 2) for (let z = S.z - S.d / 2; z <= S.z + S.d / 2; z += 2) clear(x, z, VENUE.FLOOR_Y + S.h + 10, 'stage');
  for (let x = -WL.w / 2 - 1; x <= WL.w / 2 + 1; x += 2) clear(x, WL.z + 0.6, WL.y1 + 4, 'LED wall');
  for (let x = -TR.w / 2; x <= TR.w / 2; x += 2) clear(x, TR.z, TR.y + 3, 'truss');
});

test('the stage stands on the floor, under the roof, facing the crowd; the terraces step up to the rim', () => {
  for (const [x, z] of [[S.x - S.w / 2, S.z - S.d / 2], [S.x + S.w / 2, S.z + S.d / 2], [S.x - WL.w / 2, WL.z], [S.x + WL.w / 2, WL.z]]) {
    assert.ok(footprintK(x, z) < VENUE.CROWD_K, `(${x}, ${z}) is off the floor`);
  }
  assert.ok(WL.z > S.z + S.d / 2 - 0.01, 'the wall stands behind the stage, so it faces −z, the crowd');
  assert.equal(tierHeight(0), VENUE.FLOOR_Y);
  assert.equal(tierHeight(VENUE.CROWD_K - 1e-6), VENUE.FLOOR_Y);
  let prev = 0;
  for (let k = 0; k <= 0.9999; k += 0.001) { const h = tierHeight(k); assert.ok(h >= prev); prev = h; }
  assert.ok(Math.abs(tierHeight(0.9999) - VENUE.RIM_H) < 1e-9, 'the top tier is the rim');
  const steps = new Set(); for (let k = VENUE.CROWD_K; k < 1; k += 0.001) steps.add(tierHeight(k).toFixed(4));
  assert.equal(steps.size, VENUE.TIERS);
});

test('the ribbon is one closed loop: along the shell\'s back edge and on round the front of the rim', () => {
  const pts = ribbonPath(), b0 = backPoint(0);
  assert.ok(Math.hypot(pts[0][0] - b0[0], pts[0][1] - b0[1], pts[0][2] - b0[2]) < 0.5, 'it starts where the shell rises');
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 3.2, `a gap in the ribbon at ${i}`);
  }
  const rim = pts.filter((p) => Math.abs(p[1] - VENUE.RIM_H - 0.35) < 1e-9), edge = pts.filter((p) => !rim.includes(p));
  assert.ok(rim.length > 150 && edge.length > 200, `${edge.length} points along the edge, ${rim.length} round the rim`);
  assert.ok(Math.max(...edge.map((p) => p[1])) > VENUE.BACK_H * 0.97, 'up along the top of the shell');
  for (const p of edge) {
    const k = footprintK(p[0], p[2]);
    assert.ok(k > 1 && k < 1.02, 'the edge run rides the outside of the back edge');
  }
  for (const p of rim) {
    assert.ok(Math.abs(p[1] - VENUE.RIM_H - 0.35) < 1e-9, 'the rim run sits on the wall');
    assert.ok(p[2] < lipPoint(0)[2] + 1, 'the rim run is the front of the bowl, not the back under the roof');
  }
});

function walkArrival(n = 4000) {
  const P = { x: 0, y: 0, z: 0 }, T = { x: 0, y: 0, z: 0 }, out = [];
  for (let i = 0; i <= n; i++) {
    const fov = _arrivalForTest.arrivalAt(i / n, P, T);
    out.push({ u: i / n, p: { ...P }, t: { ...T }, fov });
  }
  return out;
}

test('the arrival starts high over the bay and ends over the crowd, looking at the stage under the roof', () => {
  const path = walkArrival(), a = path[0].p, z = path[path.length - 1].p, look = path[path.length - 1].t;
  assert.ok(a.y > 100 && footprintK(a.x, a.z) > 3, 'it starts out over the bay');
  assert.ok(landDepth(a.x, a.z) < 0, 'over the water');
  assert.ok(footprintK(z.x, z.z) < VENUE.CROWD_K && z.y > VENUE.FLOOR_Y + 5, 'it ends over the crowd');
  const front = S.z - S.d / 2;
  assert.ok(front - z.z > 10 && front - z.z < 30, `${(front - z.z).toFixed(1)} m short of the stage`);
  assert.ok(z.z < lipPoint(0.5)[2], 'in front of the shell\'s mouth, under the open sky');
  // the stage's LED wall is in the middle of the frame
  const v = [look.x - z.x, look.y - z.y, look.z - z.z], w = [S.x - z.x, (WL.y0 + WL.y1) / 2 - z.y, WL.z - z.z];
  const cos = (v[0] * w[0] + v[1] * w[1] + v[2] * w[2]) / (Math.hypot(...v) * Math.hypot(...w));
  assert.ok(Math.acos(cos) < (10 * Math.PI) / 180, `the wall is ${(Math.acos(cos) * 180 / Math.PI).toFixed(1)}° off centre`);
});

test('all the way in, the arrival clears the crowd, the rim, the roof and the stage', () => {
  let inside = false, minRoof = Infinity;
  for (const { p, u } of walkArrival()) {
    assert.ok(p.y > VENUE.FLOOR_Y + 5, `u ${u}: ${p.y.toFixed(1)} m is in the crowd`);
    const k = footprintK(p.x, p.z);
    if (!inside && k < 1) { inside = true; assert.ok(p.y > VENUE.RIM_H + 5, `crossed the rim at ${p.y.toFixed(1)} m`); }
    if (inside) assert.ok(k < 1, 'it leaves the bowl again');
    for (const r of ROOF) minRoof = Math.min(minRoof, Math.hypot(r[0] - p.x, r[1] - p.y, r[2] - p.z));
    const inBox = (x0, x1, y0, y1, z0, z1) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1 && p.z > z0 && p.z < z1;
    assert.ok(!inBox(S.x - S.w / 2, S.x + S.w / 2, 0, S.h + 2, S.z - S.d / 2, S.z + S.d / 2), 'into the stage');
    assert.ok(!inBox(-WL.w / 2 - 1, WL.w / 2 + 1, 0, WL.y1 + 1, WL.z - 1, WL.z + 1.5), 'into the LED wall');
    assert.ok(!inBox(-TR.w / 2 - 1, TR.w / 2 + 1, TR.y - 1.5, TR.y + 1.5, TR.z - 1.5, TR.z + 1.5), 'into the truss');
  }
  assert.ok(inside, 'it never came into the bowl');
  assert.ok(minRoof > 5, `it passes ${minRoof.toFixed(1)} m from the roof`);
});

test('the arrival never jumps, and keeps the booth\'s lens range', () => {
  const path = walkArrival(SHOTS.arrival.bars * 2 * 60 * 2);   // 60 fps at the fastest tempo (2 s a bar), twice over
  const dt = (SHOTS.arrival.bars * 2) / (path.length - 1);
  let vmax = 0, fmin = Infinity, fmax = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1].p, b = path[i].p;
    vmax = Math.max(vmax, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt);
    fmin = Math.min(fmin, path[i].fov); fmax = Math.max(fmax, path[i].fov);
  }
  assert.ok(vmax < 60, `${vmax.toFixed(1)} m/s at its fastest`);
  assert.ok(fmin >= 40 && fmax <= 56, `the lens stays in the booth's range (${fmin.toFixed(1)}–${fmax.toFixed(1)})`);
  const bowl = path.filter((s) => footprintK(s.p.x, s.p.z) < 1);
  // the flight slows as it comes down (48% of it is over the bowl; 26% at one speed)
  assert.ok(bowl.length > path.length * 0.35, `the last stretch, over the crowd, is a blur (${(bowl.length / path.length).toFixed(2)})`);
});

const ctx = () => {
  const v = (x, y, z) => ({ x, y, z });
  return { head: v(0, 1.6, 0.2), jog: [v(-0.3, 1.0, 0.1), v(0.3, 1.0, 0.1)], screen: [v(-0.3, 1.1, 0.1), v(0.3, 1.1, 0.1)],
    mixer: v(0, 1.0, 0.1), deck: 0, lookSide: 1, incoming: null, hint: null, drop: false, kick: 0 };
};

test('the booth opens on the arrival, except under reduced motion, where it opens on the room and never flies in by itself', () => {
  assert.ok(SHOT_IDS.includes('arrival') && Object.hasOwn(LENS, 'arrival'));
  assert.equal(new NoraDirector({ seed: 11 }).shot, 'arrival');
  const still = new NoraDirector({ seed: 11, reducedMotion: true });
  assert.equal(still.shot, 'club');
  const seen = new Set();
  for (let bar = 0; bar < 4000; bar++) { const id = still._pick(bar); seen.add(id); still._cut(id, bar, bar, false); }
  assert.ok(!seen.has('arrival'), 'reduced motion picked the 300 m descent');
  const live = new NoraDirector({ seed: 11 });
  const seenLive = new Set();
  for (let bar = 0; bar < 4000; bar++) { const id = live._pick(bar); seenLive.add(id); live._cut(id, bar, bar, false); }
  assert.ok(seenLive.has('arrival'), 'the arrival comes round again in the rotation');
  still.setMode('arrival', 0, 0);
  assert.equal(still.shot, 'arrival', 'a locked Arrival still plays: the viewer asked for it');
});

test('the arrival cuts to the drone, on Nora, and never glides in or out: the exterior is another set', () => {
  for (const style of ['cut', 'glide']) {
    const d = new NoraDirector({ seed: 5, style });
    let after = 0;
    for (let bar = 0; bar < 3000; bar++) {
      const was = d.shot;
      d.update(bar * 2, bar + 0.01, ctx(), 2, 1 / 60);
      if (d.shot !== was && (d.shot === 'arrival' || was === 'arrival')) {
        assert.equal(d._blend, 1, `${style}: a glide ${was} → ${d.shot}`);
        if (was === 'arrival') { assert.equal(d.shot, 'drone', `${style}: the arrival cut to ${d.shot}`); after++; }
      } else if (d.shot !== was && style === 'glide') {
        assert.ok(d._blend < 1, 'the control: other cuts glide in this style');
      }
    }
    assert.ok(after > 1, `${style}: the arrival came round and went (${after})`);
  }
});

test('a restarted bar clock carries the arrival on from where it was, instead of flying back out over the bay', () => {
  const d = new NoraDirector({ seed: 11 });
  const mid = d.update(10, 5, ctx(), 2, 1 / 60);
  const before = { ...mid.pos };
  d.restartClock(0, 10);
  const after = d.update(10, 0, ctx(), 2, 1 / 60);
  assert.equal(d.shot, 'arrival');
  for (const c of ['x', 'y', 'z']) assert.ok(Math.abs(after.pos[c] - before[c]) < 1e-9, `${c} moved ${after.pos[c] - before[c]} on the restart`);
  const e = new NoraDirector({ seed: 11 });
  e.setMode('free');                 // the viewer took the camera, so nothing cuts away at the end
  e.update(0, 40, ctx(), 2, 1 / 60);
  e.restartClock(3, 0);
  assert.equal(e.shot, 'arrival');
  assert.equal(e.shotStartBar, 3 - e.shotBars, 'past its end: done, not restarted');
  const f = new NoraDirector({ seed: 11 });
  f.update(0, 2.5, ctx(), 2, 1 / 60);
  f.restartClock(100, 0);
  assert.equal(f.shotStartBar, 97.5);
});

test('the set switch hides everything but the exterior while outside, and gives back exactly what it hid', () => {
  const node = (visible) => ({ visible });
  const keep = node(true), shown = node(true), hidden = node(false), late = node(true);
  const scene = { children: [keep, shown, hidden] };
  const sw = createSetSwitch(scene, keep);
  sw.apply(true);
  assert.deepEqual([keep.visible, shown.visible, hidden.visible], [true, false, false]);
  shown.visible = true;                 // the host shows it again (Nora's own per-frame visibility)
  scene.children.push(late);            // something added while outside (Nora loading)
  sw.apply(true);
  assert.deepEqual([shown.visible, late.visible], [false, false]);
  assert.equal(sw.hiddenCount, 2, 'each node is held once');
  sw.apply(false);
  assert.deepEqual([keep.visible, shown.visible, hidden.visible, late.visible], [true, true, false, true], 'what was hidden before stays hidden');
  assert.equal(sw.hiddenCount, 0);
  sw.apply(false);
  assert.equal(hidden.visible, false);
});

test('both pages play the arrival in the exterior set: the scene swaps, the shafts stop, the lens reaches across the bay', () => {
  for (const [name, src] of [['noraBooth.mjs', HOST], ['main.mjs', PROTO]]) {
    assert.match(src, /createSetSwitch\(scene, exterior\.group\)/, `${name} has no set switch`);
    assert.match(src, /const out = (!!exterior && )?director\.mode !== 'free' && director\.shot === 'arrival';/, `${name}: outside is not the arrival`);
    assert.match(src, /exterior\.update\(dt, t, out, bands\.level\);\s*sets\.apply\(out\);/, `${name} does not swap the sets`);
    assert.match(src, /camera\.near = out \? EXTERIOR_DIMS\.NEAR : (CAM_NEAR|0\.03);/, `${name}: near`);
    assert.match(src, /camera\.far = out \? EXTERIOR_DIMS\.FAR : (CAM_FAR|150);/, `${name}: far`);
    assert.match(src, /cine\.update\(\{[^}]*shafts: !outside \}\)/, `${name}: the LED wall's shafts shine in the exterior`);
    assert.match(src, /director\.restartClock\(/, `${name} restarts the shot when the set starts`);
  }
  assert.match(CINE, /uDof\.uShaft\.value = shafts \? vis \* /);
  assert.match(CINE, /function update\(\{[^}]*shafts = true[^}]*\}/);
});

test('the exterior builds in Node, shows only when told, and disposes everything it made', () => {
  for (const quality of ['high', 'low']) {
    const ext = createExterior({ THREE, quality });
    const names = new Set(), geos = new Set();
    ext.group.traverse((o) => { names.add(o.name); if (o.geometry) geos.add(o.geometry); });
    for (const n of ['exteriorRoof', 'exteriorRoofUnderside', 'exteriorRoofRibs', 'exteriorShellBack', 'exteriorMouthLights', 'exteriorMouthEdge', 'exteriorBowlFloor', 'exteriorTerraces',
      'exteriorStepLights', 'exteriorOuterWall', 'exteriorStage', 'exteriorLedWall', 'exteriorBeam', 'exteriorRibbon',
      'exteriorSkyline', 'exteriorPalms', 'exteriorLamps']) assert.ok(names.has(n), `${quality}: no ${n}`);
    assert.ok(ext.stats.triangles > 20000 && ext.stats.triangles < (quality === 'low' ? 120000 : 300000), `${quality}: ${ext.stats.triangles} triangles`);
    assert.equal(ext.group.visible, false, 'hidden until the arrival');
    assert.equal(ext.update(1 / 60, 1, false), false);
    assert.equal(ext.group.visible, false);
    assert.equal(ext.update(1 / 60, 1, true), true);
    assert.equal(ext.group.visible, true);
    assert.equal(ext.outside, true);
    let disposed = 0;
    for (const g of geos) g.addEventListener('dispose', () => disposed++);
    ext.dispose();
    assert.equal(disposed, geos.size, `${quality}: ${geos.size - disposed} geometries left undisposed`);
    assert.equal(ext.group.children.length, 0);
  }
});

test('the exterior is deterministic and takes no clock of its own', () => {
  const src = stripComments(readFileSync('public/newdesign/booth/clubExterior.mjs', 'utf8'));
  assert.doesNotMatch(src, /Math\.random|Date\.now|performance\.now|^import /m);
  const a = createExterior({ THREE, quality: 'low', seed: 9 }), b = createExterior({ THREE, quality: 'low', seed: 9 });
  assert.deepEqual(a.stats, b.stats);
  a.dispose(); b.dispose();
  assert.equal(EXTERIOR_DIMS.NEAR, 0.5);
});
