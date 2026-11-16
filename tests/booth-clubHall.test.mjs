// Club Shape's live room follows its pictures (owner: "make the ceiling holes triangles", "same as
// shape logo", "get creative with the ceiling", "feel free to have things that come down", "tables I
// meant to the right of the DJ booth"; asked what the 3D room should become: "Rebuild the 3D room").
// The roof opens through the Shape mark's two triangles in a canopy of triangular panels, a
// chandelier of nested triangular trusses hangs under each, and the tables are on a raised terrace on
// the crowd's right, beside the stage, and nowhere else on the floor.
// clubHall.mjs holds the figures and imports nothing of three, so it is run; clubVenue.mjs and
// club.mjs import three's addons, which Node can't resolve from the repo root, so they are read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HALL, SHAPE_MARK, CHANDELIER, TERRACE, FLOOR_SIDE, skylightTriangles, roofCanopy, chandeliers, terraceBooths, terraceRope, crowdSpan, triArea, inTriangle,
} from '../public/newdesign/booth/clubHall.mjs';
import { SIDE_ROOMS } from '../public/newdesign/booth/clubRooms.mjs';
import { ARENA_DIMS } from '../public/newdesign/booth/arenaStage.mjs';
import { evalShot, SHOTS, _droneForTest } from '../public/newdesign/booth/noraDirector.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const raw = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const read = (p) => stripComments(raw(p));
const VENUE = read('public/newdesign/booth/clubVenue.mjs');
const CLUB = read('public/newdesign/booth/club.mjs');
const HALL_SRC = raw('public/newdesign/booth/clubHall.mjs');
const num = (src, re) => +src.match(re)[1];
const FLOOR_Y = num(VENUE, /FLOOR_Y: (-?[\d.]+),/), X_IN = num(VENUE, /X_IN: ([\d.]+),/), CEIL_Y = num(VENUE, /CEIL_Y: ([\d.]+),/);
const Z_STAGE = num(VENUE, /Z_STAGE: (-?[\d.]+),/), FAR_RAIL_Z = num(VENUE, /const FAR_RAIL_Z = (-?[\d.]+);/);
const CROWD = Object.fromEntries([...CLUB.match(/CROWD: \{([^}]*)\}/)[1].matchAll(/(\w+):\s*(-?[\d.]+)/g)].map((m) => [m[1], +m[2]]));
const WALL = Object.fromEntries([...CLUB.match(/WALL: \{([^}]*)\}/)[1].matchAll(/(\w+):\s*(-?[\d.]+)/g)].map((m) => [m[1], +m[2]]));
const D = SIDE_ROOMS.door;
const SKY = skylightTriangles();
const centroid = (t) => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3];
const len = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

// every ring side and every cable of both chandeliers, on both tiers, as [a, b, name] ([x, y, z] ends)
const HANGING = [];
for (const q of ['high', 'low']) for (const ch of chandeliers(q)) {
  for (const r of ch.rings) r.corners.forEach((a, i) => HANGING.push([a, r.corners[(i + 1) % 3], `${q}: opening ${ch.tri}, the ${r.scale} ring`]));
  for (const c of ch.cables) HANGING.push([c.a, c.b, `${q}: opening ${ch.tri}, a cable`]);
}
// the least distance between segment p→q and segment a→b
function segDist(p, q, a, b) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = sub(q, p), d2 = sub(b, a), r = sub(p, a), A = dot(d1, d1), E = dot(d2, d2), F = dot(d2, r);
  let s = 0, t = 0;
  if (A > 1e-12 && E > 1e-12) {
    const B = dot(d1, d2), C = dot(d1, r), den = A * E - B * B;
    s = den > 1e-12 ? Math.max(0, Math.min(1, (B * F - C * E) / den)) : 0;
    t = (B * s + F) / E;
    if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -C / A)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (B - C) / A)); }
  } else if (E > 1e-12) t = Math.max(0, Math.min(1, F / E));
  return len([p[0] + d1[0] * s, p[1] + d1[1] * s, p[2] + d1[2] * s], [a[0] + d2[0] * t, a[1] + d2[1] * t, a[2] + d2[2] * t]);
}
const nearestHanging = (p, q = p) => { let best = [Infinity, '']; for (const [a, b, name] of HANGING) { const d = segDist(p, q, a, b); if (d < best[0]) best = [d, name]; } return best; };

test('the roof opens through the Shape mark: its two triangles, the right way round from the dance floor', () => {
  // the mark is the logo's own: the first two paths of the Club Shape logo
  const paths = [...raw('public/club-shape-logo-white.svg').matchAll(/<path[^>]* d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z"/g)].slice(0, 2);
  assert.deepEqual(paths.map((m) => [[+m[1], +m[2]], [+m[3], +m[4]], [+m[5], +m[6]]]), SHAPE_MARK.map((t) => t.map((p) => [...p])));
  assert.equal(SKY.length, 2);
  // one scale, no turn: world x = c − k·(logo x), world z = c′ + k·(logo y), with k > 0. Someone on
  // the floor facing the stage (+z) and looking up has −x on their right and −z at the top of what
  // they see, so the logo's right (+x) is their right and its top (−y) is their top: the mark reads
  // as it is drawn. (+k on x would mirror it, as would −k on z.)
  const flat = SHAPE_MARK.flat(), world = SKY.flat();
  const k = (world[0][0] - world[5][0]) / (flat[5][0] - flat[0][0]);
  assert.ok(k > 0.05 && k < 0.12, `a logo unit is ${k.toFixed(4)} m`);
  flat.forEach((p, i) => {
    assert.ok(Math.abs(world[i][0] - (world[0][0] - k * (p[0] - flat[0][0]))) < 1e-9, `corner ${i}: logo right is world −x`);
    assert.ok(Math.abs(world[i][1] - (world[0][1] + k * (p[1] - flat[0][1]))) < 1e-9, `corner ${i}: logo up is world −z`);
  });
  // 15 m across, centred where the oval skylight was, so 19.5 m along the room
  const xs = world.map((p) => p[0]), zs = world.map((p) => p[1]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - HALL.MARK.w) < 1e-9 && HALL.MARK.w === 15);
  assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - HALL.MARK.x) < 1e-9 && Math.abs((Math.max(...zs) + Math.min(...zs)) / 2 - HALL.MARK.z) < 1e-9);
  assert.deepEqual([HALL.MARK.x, HALL.MARK.z], [0, -13]);
  assert.ok(Math.abs(Math.max(...zs) - Math.min(...zs) - 19.5) < 0.1, `${(Math.max(...zs) - Math.min(...zs)).toFixed(2)} m along the room`);
  // as the crowd sees it: ▸ on their left (+x) and nearer the stage, pointing right (−x); ◂ on their
  // right and further back, pointing left; the tips pass each other
  const [left, right] = SKY;
  assert.ok(left[0][0] > 7 && left[1][0] > 7 && left[2][0] < 0, 'the first stands on the crowd\'s left and points to their right');
  assert.ok(right[0][0] < -7 && right[1][0] < -7 && right[2][0] > 0, 'the second stands on their right and points left');
  assert.ok(left[2][0] < right[2][0], 'their tips pass each other');
  assert.ok(centroid(left)[1] > centroid(right)[1] + 5, 'the first is the one nearer the stage (the mark\'s lower triangle)');
  // clear of the balconies' edges and of the roof's ends
  assert.ok(Math.max(...xs.map(Math.abs)) <= X_IN - 2.9, 'three metres of roof between each opening and the balcony');
  assert.ok(Math.max(...zs) < Z_STAGE - 8 && Math.min(...zs) > FAR_RAIL_Z + 15);
  // the figures the venue was built on are the hall's
  assert.deepEqual([HALL.FLOOR_Y, HALL.CEIL_Y, HALL.ROOF.x, HALL.ROOF.z0, HALL.ROOF.z1], [FLOOR_Y, CEIL_Y, X_IN, FAR_RAIL_Z, Z_STAGE]);
  assert.match(VENUE, /SKYLIGHT: \{ x: 0, y: 15\.5, z: -13, w: 15 \},/);
});

test('the venue cuts those two openings and nothing oval: outlined in white light, the sky and the skyline behind', () => {
  assert.match(VENUE, /const SKY = skylightTriangles\(\);/);
  assert.doesNotMatch(VENUE, /superPt|superHalfZ|SUPER_N|superTube/, 'the oval\'s superellipse is gone');
  assert.doesNotMatch(VENUE, /shape\.holes\.push/, 'and its hole in a flat slab');
  assert.doesNotMatch(VENUE, /const ceilLine =/, 'and the warm lines that ran the length of the old ceiling');
  // each opening: its rim up into the sky, a tube along each side with a ball at each corner, a halo
  assert.match(VENUE, /for \(const t of SKY\) S\.push\(loopStrip\(ring3\(t, CEIL_Y \+ 0\.2\), ring3\(t, RIM_TOP\),/);
  assert.match(VENUE, /R\.push\(rod\(\[p\[0\], TUBE_Y, p\[1\]\], \[q\[0\], TUBE_Y, q\[1\]\], TUBE_R, RAD, \[1, 1, 1\]\)\);/);
  assert.match(VENUE, /mesh\(merge\(R, 'ring'\), matRing, 'venueSkylightRing'\);/);
  assert.match(VENUE, /mesh\(merge\(HA, 'halo'\), matHalo, 'venueSkylightHalo', 3\);/);
  assert.match(VENUE, /const matHalo = own\(new THREE\.MeshBasicMaterial\(\{[^}]*blending: THREE\.AdditiveBlending, depthWrite: false/);
  // the line pulses as the oval's ring did, and the kick's share is held under reduced motion
  assert.match(VENUE, /const kTarget = RM \? 0 : st\.kick;/);
  assert.match(VENUE, /const pulse = 0\.9 \+ 0\.22 \* envLevel \+ 0\.14 \* envKick \+ 0\.12 \* envDrop;\s*matRing\.color\.copy\(RING_BASE\)\.multiplyScalar\(pulse\);/);
  // the sky dome, the stars and the city are still there behind them, centred on the mark
  for (const name of ['venueSkyDome', 'venueStars', 'venueSkyline']) assert.ok(VENUE.includes(`'${name}'`), name);
  assert.match(VENUE, /const DOME_C = new THREE\.Vector3\(0, 2, sk\.z\);/);
  // the oval's ring is gone from the gear's environment too (it stood above that scene's own ceiling
  // plane, so it never showed in a reflection; nothing of the oval's size is left in club.mjs)
  assert.doesNotMatch(CLUB, /TorusGeometry\(1, 0\.03|ring\.scale\.set|8\.4, 12\.5/);
  assert.match(CLUB, /c\.rotation\.x = Math\.PI \/ 2; c\.position\.set\(0, 13\.5, -13\); es\.add\(c\);/, 'the ceiling the gear reflects is still there');
});

test('the roof round them is a canopy of whole triangular panels: it covers the roof exactly, fewer and larger on phones', () => {
  const rect = 2 * HALL.ROOF.x * (HALL.ROOF.z1 - HALL.ROOF.z0), open = SKY.reduce((s, t) => s + triArea(t), 0);
  const hi = roofCanopy('high'), lo = roofCanopy('low');
  for (const [name, c] of [['high', hi], ['low', lo]]) {
    // every panel is a triangle of the roof, outside both openings, and together they are all of it
    let sum = 0;
    for (const p of c.panels) {
      assert.equal(p.pts.length, 3);
      const a = triArea(p.pts);
      assert.ok(a > 2, `${name}: a sliver of ${a.toFixed(3)} m²`);
      sum += a;
      for (const [x, z] of p.pts) assert.ok(Math.abs(x) <= HALL.ROOF.x + 1e-9 && z >= HALL.ROOF.z0 - 1e-9 && z <= HALL.ROOF.z1 + 1e-9, `${name}: a panel leaves the roof`);
      assert.ok(!SKY.some((t) => inTriangle(centroid(p.pts), t)), `${name}: a panel lies in an opening`);
      // and none reaches into one: no corner inside an opening by more than a hair
      for (const q of p.pts) assert.ok(!SKY.some((t) => inTriangle(q, t, 1e-6)), `${name}: a panel's corner is inside an opening`);
      assert.ok(p.shade >= 0 && p.shade < 1 && typeof p.lit === 'boolean');
    }
    assert.ok(Math.abs(sum + open - rect) < 1e-6, `${name}: panels ${sum.toFixed(4)} + openings ${open.toFixed(4)} ≠ roof ${rect}`);
    // the lit edges: each panel edge once, none along or across an opening
    const keys = new Set();
    for (const [x0, z0, x1, z1] of c.lines) {
      const key = [[x0, z0], [x1, z1]].map((p) => p.map((v) => v.toFixed(4)).join(',')).sort().join('|');
      assert.ok(!keys.has(key), `${name}: an edge is drawn twice`);
      keys.add(key);
      for (let i = 1; i < 8; i++) {
        const p = [x0 + ((x1 - x0) * i) / 8, z0 + ((z1 - z0) * i) / 8];
        assert.ok(!SKY.some((t) => inTriangle(p, t, -1e-6)), `${name}: a lit edge runs along or across an opening`);
      }
    }
    assert.ok(c.lines.length > c.panels.length, `${name}: ${c.lines.length} edges for ${c.panels.length} panels`);
    const lit = c.panels.filter((p) => p.lit).length;
    assert.ok(lit > 0 && lit < c.panels.length / 4, `${name}: ${lit} lit panels`);
  }
  assert.ok(hi.panels.length > 120 && lo.panels.length < hi.panels.length * 0.6, `high ${hi.panels.length}, low ${lo.panels.length}`);
  assert.ok(lo.lines.length < hi.lines.length * 0.6);
  // no slivers on either tier: every panel's corners are at least 20° (a sliver's lit edges would run together)
  for (const c of [hi, lo]) for (const p of c.panels) for (let i = 0; i < 3; i++) {
    const a = p.pts[i], b = p.pts[(i + 1) % 3], d = p.pts[(i + 2) % 3];
    const ang = Math.acos(((b[0] - a[0]) * (d[0] - a[0]) + (b[1] - a[1]) * (d[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.hypot(d[0] - a[0], d[1] - a[1])) * 180 / Math.PI;
    assert.ok(ang > 20, `a panel corner of ${ang.toFixed(1)}°`);
  }
  assert.deepEqual(roofCanopy('high'), hi, 'seeded: the same roof every time');
  // the venue: panels with their own tones merged into the baked structure, the edges into the LED mesh
  assert.match(VENUE, /const CANOPY = roofCanopy\(quality\);/);
  assert.match(VENUE, /for \(const p of CANOPY\.panels\) \{/);
  assert.match(VENUE, /S\.push\(rawGeo\(pos, col, idx, nrm\)\);/);
  assert.match(VENUE, /for \(const \[x0, z0, x1, z1\] of CANOPY\.lines\) \{/);
  assert.match(VENUE, /const TEAL = accentLin\.map\(\(c\) => c \* [\d.]+\)/, 'in the club\'s accent');
  assert.match(VENUE, /mesh\(merge\(CL, 'ceilLeds'\), matCeilLed, 'venueCeilingLeds'\);/);
  // baked and emissive: the venue still has no light of its own
  assert.doesNotMatch(VENUE, /new THREE\.(PointLight|SpotLight|DirectionalLight|RectAreaLight|HemisphereLight|AmbientLight)\(/);
  // pure and seeded
  assert.deepEqual([...HALL_SRC.matchAll(/^import\b.*$/gm)].map((m) => m[0]), ["import { SIDE_ROOMS } from './clubRooms.mjs';"]);
  assert.doesNotMatch(stripComments(HALL_SRC), /Math\.random|Date\.now|performance\.now|document\.|window\./);
});

test('a chandelier hangs under each opening: nested triangles of truss, each smaller and lower, well over the heads', () => {
  assert.deepEqual([...CHANDELIER.high.scales], [0.85, 0.66, 0.47, 0.3]);
  assert.equal(CHANDELIER.low.scales.length, 3, 'three rings on phones');
  for (const q of ['high', 'low']) {
    const all = chandeliers(q), spec = CHANDELIER[q];
    assert.equal(all.length, 2, 'one for each opening');
    all.forEach((ch, tri) => {
      const open = SKY[tri], c = centroid(open);
      assert.ok(len(ch.centre, c) < 1e-9);
      assert.equal(ch.rings.length, spec.scales.length);
      ch.rings.forEach((r, k) => {
        assert.equal(r.scale, spec.scales[k]);
        // the opening's own shape, scaled: each side is the opening's side × scale (turned and tipped, never stretched)
        r.corners.forEach((a, i) => {
          const side = len(a, r.corners[(i + 1) % 3]), want = Math.hypot(open[i][0] - open[(i + 1) % 3][0], open[i][1] - open[(i + 1) % 3][1]) * r.scale;
          assert.ok(Math.abs(side - want) < 1e-6, `${q} ring ${k}: side ${side.toFixed(3)} for ${want.toFixed(3)}`);
        });
        // hung about the opening's centre, at its height
        const m = [0, 1, 2].map((j) => (r.corners[0][j] + r.corners[1][j] + r.corners[2][j]) / 3);
        assert.ok(Math.abs(m[0] - c[0]) < 1e-6 && Math.abs(m[2] - c[1]) < 1e-6 && Math.abs(m[1] - spec.y[k]) < 1e-6);
        // tipped a few degrees: its plane's normal is 2°–5° off the vertical
        const u = r.corners[1].map((v, j) => v - r.corners[0][j]), w = r.corners[2].map((v, j) => v - r.corners[0][j]);
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const tip = Math.acos(Math.abs(n[1]) / Math.hypot(...n)) * 180 / Math.PI;
        assert.ok(tip > 1.9 && tip < 5, `${q} ring ${k} is tipped ${tip.toFixed(2)}°`);
        // inside the one above (the opening, for the first), seen from below
        const above = k === 0 ? open : ch.rings[k - 1].corners.map((p) => [p[0], p[2]]);
        for (const p of r.corners) assert.ok(inTriangle([p[0], p[2]], above, 0.15), `${q} ring ${k} sits inside the one above`);
        // lower than the one above, all of it
        if (k) assert.ok(Math.max(...r.corners.map((p) => p[1])) < Math.min(...ch.rings[k - 1].corners.map((p) => p[1])) - 0.8);
        assert.ok(r.phase >= 0 && r.phase < Math.PI * 2);
      });
      // the lowest ring hangs about ten metres over the floor: far over the heads and the raised hands
      const lowest = ch.rings[ch.rings.length - 1];
      assert.ok(lowest.y - FLOOR_Y > 9.5 && lowest.y - FLOOR_Y < 10.2, `${q}: the lowest ring is ${(lowest.y - FLOOR_Y).toFixed(2)} m up`);
      assert.ok(Math.min(...lowest.corners.map((p) => p[1])) - CHANDELIER.section.h - FLOOR_Y > 9.3);
      assert.ok(Math.max(...ch.rings[0].corners.map((p) => p[1])) + CHANDELIER.section.h < CEIL_Y - 1, 'and the top one is clear of the roof');
      // three cables to each ring: from the opening's frame to the top ring's corners, then corner to corner
      assert.equal(ch.cables.length, 3 * ch.rings.length);
      for (let i = 0; i < 3; i++) {
        const chain = ch.cables.slice(i * ch.rings.length, (i + 1) * ch.rings.length);
        assert.equal(chain[0].a[1], CEIL_Y, 'fixed at the roof');
        assert.ok(inTriangle([chain[0].a[0], chain[0].a[2]], open) && len([chain[0].a[0], chain[0].a[2]], open[i]) < 0.2, 'on the opening\'s frame, at its corner');
        assert.equal(chain[0].pa, null, 'the roof is still');
        chain.forEach((cb, k) => {
          assert.deepEqual(cb.b, ch.rings[k].corners[i]);
          assert.equal(cb.pb, ch.rings[k].phase, 'a cable swings with the ring it holds');
          if (k) { assert.deepEqual(cb.a, ch.rings[k - 1].corners[i]); assert.equal(cb.pa, ch.rings[k - 1].phase); }
        });
      }
      // clear of the balconies and of the stage's rig
      for (const r of ch.rings) for (const p of r.corners) {
        assert.ok(Math.abs(p[0]) < X_IN - 3, 'three metres inside the balcony rails');
        assert.ok(p[2] < ARENA_DIMS.TRUSS.z0 - ARENA_DIMS.TRUSS.size / 2 - 0.6, `a ring corner at z ${p[2].toFixed(2)} is at the stage's front truss`);
      }
    });
    assert.deepEqual(chandeliers(q), all, 'seeded: they hang the same every time');
  }
  // the venue builds them from those figures, as one mesh: a truss on desktop, a beam on phones, a line of light under each side
  assert.match(VENUE, /for \(const ch of chandeliers\(quality\)\) \{/);
  assert.match(VENUE, /mesh\(merge\(P, 'chandeliers'\), matChandelier, 'venueChandeliers'\);/);
  assert.match(VENUE, /const \{ w: TW, h: TH \} = CHANDELIER\.section;/);
  assert.match(VENUE, /if \(LOW\) \{[\s\S]{0,300}?return;\s*\}/, 'phones stop at the beam: no lacing');
  // they sway in the vertex shader, as far as each vertex hangs under the roof, and hang still under reduced motion
  assert.match(VENUE, /matChandelier\.onBeforeCompile = \(sh\) => \{\s*sh\.uniforms\.uTime = U\.uTime; sh\.uniforms\.uSway = U\.uSway;/);
  assert.match(VENUE, /uSway: \{ value: RM \? 0 : 1 \},/);
  assert.match(VENUE, /U\.uSway\.value = RM \? 0 : 1;/, 'and when the preference changes');
  assert.match(VENUE, /matChandelier\.color\.setScalar\(pulse\);/, 'their lines breathe with the openings\' outlines');
  const amp = num(VENUE, /float cHang = max\(0\.0, \$\{CEIL_Y\.toFixed\(2\)\} - transformed\.y\) \* ([\d.]+) \* uSway;/);   // metres of swing per metre hung, times uSway
  assert.ok(amp * (CEIL_Y - CHANDELIER.high.y[3]) < 0.06, 'a few centimetres at the lowest ring, no more');
});

test('no camera meets a chandelier: every shot and the drone\'s whole loop keep two metres off every ring and cable', () => {
  const HEAD = { x: 0, y: 1.6, z: 0.3 };
  const ctx = { head: HEAD, jog: [HEAD, HEAD], screen: [HEAD, HEAD], mixer: HEAD, deck: 0, lookSide: 1 };
  const at = (id, u) => evalShot(id, u, 3.7, ctx, { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 0 }).pos;
  assert.ok(HANGING.length === 2 * (4 * 6 + 3 * 6), 'both tiers\' rings and cables are checked');
  for (const id of Object.keys(SHOTS)) {
    if (id === 'arrival') continue;   // flown outside, in the exterior's own set: the hall is not drawn (noraBooth.mjs)
    const steps = id === 'drone' ? 4000 : 100;
    for (let i = 0; i <= steps; i++) {
      const P = at(id, i / steps), [d, name] = nearestHanging([P.x, P.y, P.z]);
      assert.ok(d > 2.0, `${id} at u=${(i / steps).toFixed(4)} (${[P.x, P.y, P.z].map((v) => v.toFixed(1))}) is ${d.toFixed(2)} m from ${name}`);
    }
  }
  assert.match(read('public/newdesign/booth/noraBooth.mjs'), /const out = !!exterior && director\.mode !== 'free' && director\.shot === 'arrival';/);
  // the drone still goes up under the roof (the check above is not passed by staying low): it flies
  // the lane between the two chandeliers, above their lowest rings
  const P = { x: 0, y: 0, z: 0 }, T = { x: 0, y: 0, z: 0 };
  let top = -Infinity, between = 0;
  const [left, right] = chandeliers('high');
  for (let i = 0; i < 4000; i++) {
    _droneForTest.droneAt(i / 4000, P, T);
    top = Math.max(top, P.y);
    if (P.y > 12 && P.z < left.centre[1] && P.z > right.centre[1] && P.x > right.centre[0] && P.x < left.centre[0]) between++;
  }
  assert.ok(top > 13 && top < CEIL_Y - 1.5, `the drone climbs to ${top.toFixed(2)}`);
  assert.ok(between > 40, 'and passes between the two chandeliers, up among their top rings');
});

test('the chandeliers hang over the screen\'s headline, never across it, from the back of the room and from the floor', () => {
  // the headline (the mark over CLUB SHAPE): y 3.15 … 7.43 on the wall's artwork plane, most of its width
  const HEAD = { x: 0, y: 1.6, z: 0.3 };
  const ctx = { head: HEAD, jog: [HEAD, HEAD], screen: [HEAD, HEAD], mixer: HEAD, deck: 0, lookSide: 1 };
  assert.ok(WALL.y0 < 3.15 && WALL.y0 + WALL.h > 7.43 && WALL.w / 2 > 6.8);
  for (const id of ['atrium', 'club', 'wide']) {
    for (let i = 0; i <= 10; i++) {
      const P = evalShot(id, i / 10, 3.7, ctx, { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 0 }).pos;
      for (let ix = 0; ix <= 8; ix++) for (const y of [3.15, 5.3, 7.43]) {
        const x = -6.8 + (13.6 * ix) / 8;
        const [d, name] = nearestHanging([P.x, P.y, P.z], [x, y, WALL.z]);
        assert.ok(d > 0.5, `${id} at u=${(i / 10).toFixed(1)}: the sight line to the headline at (${x.toFixed(1)}, ${y}) passes ${d.toFixed(2)} m from ${name}`);
      }
    }
  }
});

test('the tables are on the crowd\'s right only: a raised terrace beside the stage, short of the lounge\'s doorway', () => {
  const T = TERRACE, B = terraceBooths();
  assert.equal(T.side, -1);
  assert.equal(SIDE_ROOMS.lounge, T.side, 'the crowd\'s right is world −x, the VIP lounge\'s side');
  assert.ok(T.x0 < T.x1 && T.x1 < -6 && T.x0 > -(X_IN + 0.5), 'all of it on −x, from under the balcony\'s edge to the dance floor');
  assert.ok(Math.abs(T.h - 0.45) < 1e-9 && Math.abs(B.y - (FLOOR_Y + T.h)) < 1e-9, 'raised 0.45 m');
  assert.ok(T.z1 <= -2.9 && T.z1 > -4, 'it starts beside the stage, behind the wing\'s lip and the sub stacks');
  assert.ok(T.z0 > D.z1 + 0.5 && T.z0 < D.z1 + 1.5, `it ends ${(T.z0 - D.z1).toFixed(2)} m short of the aisle to the lounge's doorway`);
  assert.ok(T.steps >= 1 && T.steps <= 2 && T.tread >= 0.28, 'a step or two down at the far end');
  // booths every 3 m along the deck: sofa, table, sofa across it
  const deck0 = T.z0 + T.steps * T.tread;
  assert.ok(B.bays.length >= 5 && B.sofas.length === 2 * B.bays.length && B.tables.length === B.bays.length);
  B.bays.forEach((z, i) => {
    if (i) assert.ok(Math.abs(B.bays[i - 1] - z - 3) < 1e-9, 'a booth every 3 m');
    assert.ok(z + 1 < T.z1 - 0.3 && z - 1 > deck0 + 0.3, `the booth at z ${z.toFixed(2)} stands on the deck, clear of its ends`);
  });
  for (const s of B.sofas) {
    assert.ok(s.x < 0 && s.x - 0.25 > T.x0 && s.x + 0.25 < T.x1, `a sofa at x ${s.x}: on the terrace`);
    assert.ok(s.z + 1 < D.z0 || s.z - 1 > D.z1, 'none in the doorway\'s aisle');
  }
  for (const t of B.tables) assert.ok(t.x < 0 && t.x > T.x0 + 1 && t.x < T.x1 - 1 && B.bays.includes(t.z));
  // each sofa faces its table: the inner one's back is to the dance floor
  for (const s of B.sofas) assert.equal(Math.sign(Math.sin(s.ry)), Math.sign(T.table - s.x), 'the seat faces the table');
  assert.ok(!B.sofas.concat(B.tables).some((p) => p.x > 0), 'nothing on the crowd\'s left');
  // the venue places exactly those, on the deck, and no booth of its own anywhere else
  assert.match(VENUE, /const TB = terraceBooths\(\), ROPE = terraceRope\(\);\s*const TERRACE_Y = TB\.y;/);
  assert.match(VENUE, /const SOFAS = TB\.sofas, TABLES = TB\.tables;/);
  assert.equal((VENUE.match(/SOFAS\.push|TABLES\.push/g) || []).length, 0, 'the venue adds no booth of its own');
  assert.doesNotMatch(VENUE, /bayZ/, 'the floor\'s rows of booths are gone, both sides');
  assert.doesNotMatch(VENUE, /s \* 7\.2|s \* 10\.4|s \* 8\.8|s \* 6\.9/, 'and nothing of them is mirrored to the other side');
  assert.match(VENUE, /m4\.compose\(v3\.set\(b\.x, TERRACE_Y, b\.z\), q, sc3\.set\(1, 1, 1\)\); imSofa\.setMatrixAt\(i, m4\);/);
  assert.match(VENUE, /m4\.compose\(v3\.set\(tb\.x, TERRACE_Y, tb\.z\), q, sc3\.set\(1, 1, 1\)\); imTable\.setMatrixAt\(i, m4\);/);
  assert.match(VENUE, /m4\.compose\(v3\.set\(tb\.x, TERRACE_Y \+ 0\.635, tb\.z\), q, sc3\.set\(1, 1, 1\)\); imCandle\.setMatrixAt\(i, m4\);/);
  // the deck and its steps are part of the baked structure and shade what stands by them
  assert.match(VENUE, /S\.push\(paint\(occ\(boxSeg\(T\.x0, T\.x1, FLOOR_Y, TERRACE_Y, deck0, T\.z1, BAKE_CELL\)\), deckPaint\)\);/);
  assert.match(VENUE, /for \(let k = 1; k <= T\.steps; k\+\+\) \{/);
  // the candles' light, what blocks it and the seated guests went up with the tables
  assert.match(VENUE, /for \(const tb of TABLES\) LIGHTS\.push\(\{ p: \[tb\.x, TERRACE_Y \+ 0\.72, tb\.z\], c: CANDLE_LIGHT\.c,/);
  assert.match(VENUE, /FLOOR_OCC\.push\(\[Math\.min\(xBack, b\.x\), TERRACE_Y, b\.z - 1, Math\.max\(xBack, b\.x\), TERRACE_Y \+ 0\.95, b\.z \+ 1\]\);/);
  assert.match(VENUE, /FLOOR_OCC\.push\(\[tb\.x - 0\.4, TERRACE_Y \+ 0\.555, tb\.z - 0\.4, tb\.x \+ 0\.4, TERRACE_Y \+ 0\.6, tb\.z \+ 0\.4\]\);/);
  assert.match(VENUE, /y: TERRACE_Y - 0\.36, z: b\.z \+ fz \* 0\.3 - fx \* off,/);
  assert.match(VENUE, /seat: \{ x: b\.x \+ fx \* 0\.2 \+ fz \* off, z: b\.z \+ fz \* 0\.2 - fx \* off, top: TERRACE_Y \+ 0\.42 \} \}\);/);
  assert.match(VENUE, /if \(f\.seat\) m4\.compose\(v3\.set\(f\.seat\.x, \(f\.seat\.top != null \? f\.seat\.top : FLOOR_Y \+ 0\.42\) - seatY \* k, f\.seat\.z\), q, sc3\.set\(k, k, k\)\);/);
});

test('the terrace is roped off: brass posts and a velvet rope along the dance floor and across its stage end, the steps left open', () => {
  const T = TERRACE, R = terraceRope(), deck0 = T.z0 + T.steps * T.tread;
  assert.ok(R.posts.length >= 8 && R.spans.length === R.posts.length - 1);
  assert.ok(Math.abs(R.y - (FLOOR_Y + T.h)) < 1e-9 && R.height > 0.85 && R.height < 1.1);
  for (const [x, z] of R.posts) {
    assert.ok(x > T.x0 && x < T.x1 && z < T.z1 && z > deck0, 'every post stands on the deck');
    const onFloorEdge = Math.abs(x - (T.x1 - T.rope)) < 1e-9, onStageEnd = Math.abs(z - (T.z1 - T.rope)) < 1e-9;
    assert.ok(onFloorEdge || onStageEnd, `a post at (${x.toFixed(2)}, ${z.toFixed(2)}) is on neither roped edge`);
  }
  // one line, post to post, no span longer than 2.4 m; it runs the whole dance-floor edge
  for (const [i, j] of R.spans) { assert.equal(j, i + 1); const d = Math.hypot(R.posts[i][0] - R.posts[j][0], R.posts[i][1] - R.posts[j][1]); assert.ok(d > 1.5 && d < 2.4, `a span of ${d.toFixed(2)} m`); }
  const edge = R.posts.filter(([x]) => Math.abs(x - (T.x1 - T.rope)) < 1e-9).map(([, z]) => z);
  assert.ok(Math.max(...edge) > T.z1 - 0.2 && Math.min(...edge) < deck0 + 0.2, 'from the stage end to the head of the steps');
  // the steps' side is open: no post or rope across the far end
  assert.ok(!R.posts.some(([x, z]) => z < deck0 + 0.2 && x < T.x1 - T.rope - 0.01));
  // the sofas' backs are inside the rope
  for (const s of terraceBooths().sofas) assert.ok(s.x + 0.22 < T.x1 - T.rope - 0.14 || s.x < T.table, 'the inner sofa\'s back clears the posts\' feet');
  // instanced posts, the rope as part of the baked structure, all of it disposed
  assert.match(VENUE, /const imPost = new THREE\.InstancedMesh\(postGeo, matTable, ROPE\.posts\.length\);\s*imPost\.name = 'venueRopePosts';/);
  assert.match(VENUE, /for \(const \[i, j\] of ROPE\.spans\) \{/);
  assert.match(VENUE, /for \(const im of \[imTrunk, \.\.\.imFronds, imBeam, imSofa, imTable, imCandle, imPost, imFig\]\) im\.dispose\(\);/);
});

test('the crowd takes the floor the booths left, never the terrace nor a doorway\'s aisle, within the same caps', () => {
  const half = CROWD.x, T = TERRACE;
  assert.equal(half, 7);
  assert.ok(FLOOR_SIDE > half + 2 && FLOOR_SIDE < X_IN, 'out to under the balcony\'s edge');
  for (let z = CROWD.z0; z >= CROWD.z1; z -= 0.05) {
    const [lo, hi] = crowdSpan(z, half);
    assert.ok(lo < 0 && hi > 0 && lo >= -FLOOR_SIDE && hi <= FLOOR_SIDE);
    const inAisle = z > D.z0 - 0.3 && z < D.z1 + 0.3, byTerrace = z > T.z0 - 0.3 && z < T.z1 + 0.3;
    if (inAisle) assert.deepEqual([lo, hi], [-half, half], `z ${z.toFixed(2)}: the aisle to both side rooms stays clear`);
    if (byTerrace) assert.ok(lo >= T.x1 + 0.3, `z ${z.toFixed(2)}: the crowd stands ${(lo - T.x1).toFixed(2)} m off the terrace`);
    if (!inAisle && z < D.z0 - 0.4) assert.deepEqual([lo, hi], [-FLOOR_SIDE, FLOOR_SIDE], 'behind the doorways the floor is open on both sides');
    if (!inAisle && z > D.z1 + 0.4) assert.equal(hi, FLOOR_SIDE, 'the crowd\'s left is open floor from the stage back');
    if (z > T.z1 + 0.4) assert.equal(lo, -half, 'in front of the terrace: the subs and the stage\'s wing');
    // on the crowd's right it never goes past the dance floor's own edge before the doorway: the terrace is there
    if (z > D.z0) assert.ok(lo >= -half);
  }
  // club.mjs places its rows by it, and checks the jittered point again at its own depth
  assert.match(CLUB, /import \{ crowdSpan \} from '\.\/clubHall\.mjs';/);
  assert.match(CLUB, /const \[rowLo, rowHi\] = crowdSpan\(z, CROWD\.x\);\s*for \(let x = rowLo \+ rnd\(\) \* s \* 0\.5; x <= rowHi; x \+= s\) \{/);
  assert.match(CLUB, /const \[lo, hi\] = crowdSpan\(pz, CROWD\.x\);\s*if \(px < lo \|\| px > hi \|\| pz > CROWD\.z0\) continue;/);
  // past the dance floor's own width the crowd is half as thick, so the middle gives up little to fill the edges
  assert.match(CLUB, /if \(Math\.abs\(px\) > CROWD\.x && rnd\(\) < 0\.5\) continue;/);
  // the caps are the ones the floor had: phones draw no more people than before
  assert.match(CLUB, /const caps = low \? \[150, 200\] : \[300, 520, 1500\];/);
});
