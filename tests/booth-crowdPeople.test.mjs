// The crowd as real people (owner, 2026-10-26: "make the crowd look like real people", "have the
// people look dressed up to go out"): MakeHuman people baked by prototypes/nora-booth/crowd-mh into
// the v3 packs public/newdesign/booth/crowdPeople.mjs draws, the version switch that keeps the older
// avatar pack working, who wears what, and the wiring on both surfaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { decodePeoplePack, decodeAnyCrowdPack, crowdHasLod, recolour, dressPeople, PART, createPeopleCrowd } from '../public/newdesign/booth/crowdPeople.mjs';
import * as THREE from './helpers/booth-three.mjs';
import { crowdPackPath, NORA_MODEL } from '../public/newdesign/booth/noraBoothState.mjs';
import { imageSize } from '../scripts/nora-model/check-vrm.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const LODS = ['near', 'far', 'tiny', 'seat'];
// What a figure may cost, per level of detail: a re-bake past these is a performance decision, not a
// tweak (the floor alone draws 300 near, 520 far and 1,500 tiny figures on a desktop).
const BUDGET = {
  'nora/crowd-people.bin.txt': { people: 12, near: 5800, far: 1500, tiny: 700, seat: 900 },
  'nora/crowd-people-lo.bin.txt': { people: 6, near: 3200, far: 950, tiny: 450, seat: 560 },
};
const packs = Object.keys(BUDGET).map((path) => ({ path, pack: decodePeoplePack(readFileSync('public/' + path, 'utf8')) }));

test('both people packs decode whole: every person at every level, inside its budget', () => {
  for (const { path, pack } of packs) {
    const { header, geos } = pack;
    const B = BUDGET[path];
    assert.equal(header.v, 3, path);
    assert.equal(header.bodies.length, B.people, path);
    assert.deepEqual(header.lods, LODS, path);
    const parts = new Set(Object.values(PART));
    header.bodies.forEach((b, i) => {
      for (const l of LODS) {
        const g = geos[`${i}:${l}`];
        assert.ok(g, `${path}: ${b.name} has no ${l} figure`);
        assert.ok(g.ni / 3 <= B[l], `${path}: ${b.name} ${l} is ${g.ni / 3} triangles, over ${B[l]}`);
        let maxI = 0;
        for (const x of g.index) if (x > maxI) maxI = x;
        assert.ok(maxI < g.nv, `${path}: ${b.name} ${l} indexes past its vertices`);
        for (const p of g.part) assert.ok(parts.has(p), `${path}: ${b.name} ${l} has part ${p}`);
      }
      // the shoulders the arm raise turns about: left on +x, at shoulder height
      assert.ok(b.pivot.L[0] > 0.08 && b.pivot.R[0] < -0.08, `${path}: ${b.name}'s shoulders`);
      assert.ok(b.pivot.L[1] > 1.15 && b.pivot.L[1] < 1.65, `${path}: ${b.name}'s shoulder height`);
      assert.ok(b.height > 1.45 && b.height < 2.0, `${path}: ${b.name} is ${b.height} m`);
      // one seat height for everyone: the venue lowers every seated figure by the pack's one seatY
      assert.equal(b.seatY, header.seat.seatY, `${path}: ${b.name} sits at ${b.seatY} m`);
      let minY = Infinity;
      const s = geos[`${i}:seat`];
      for (let v = 0; v < s.nv; v++) minY = Math.min(minY, s.pos[v * 3 + 1] / 1000);
      assert.ok(minY > -0.08 && minY < header.seat.seatY - 0.25, `${path}: ${b.name}'s feet, seated, are ${minY} m up`);
    });
    assert.ok(header.seat.seatY > 0.65 && header.seat.seatY < 1.0);
  }
});

test('the arms carry weights to raise them, and only the arms', () => {
  for (const { path, pack } of packs) {
    const g = pack.geos['0:near'];
    let left = 0, right = 0, both = 0;
    for (let i = 0; i < g.nv; i++) {
      const l = g.arm[i * 2], r = g.arm[i * 2 + 1];
      if (l > 128) left++;
      if (r > 128) right++;
      if (l > 25 && r > 25) both++;   // a breastbone vertex may carry a trace (≤ 2%) of both arms; harmless
    }
    assert.ok(left > 50 && right > 50, `${path}: arms weighted ${left} / ${right}`);
    assert.equal(both, 0, `${path}: a vertex moves with both arms`);
  }
});

test('each pack\'s atlas sits beside it, at the size its header says', () => {
  for (const { path, pack } of packs) {
    const file = 'public/nora/' + pack.header.atlas.file;
    assert.ok(/^[\w.-]+\.webp$/.test(pack.header.atlas.file), 'a plain file name beside the pack');
    assert.ok(existsSync(file), file);
    assert.deepEqual(imageSize(readFileSync(file)), { w: pack.header.atlas.w, h: pack.header.atlas.h }, file);
    // desktops: no texture over 4096 on a side; phones: a quarter of that area or less
    assert.ok(Math.max(pack.header.atlas.w, pack.header.atlas.h) <= (path.includes('-lo') ? 2048 : 4096));
  }
});

test('the app serves the same crowd and the same Nora as the website', () => {
  for (const f of ['crowd-people.bin.txt', 'crowd-people.webp', 'crowd-people-lo.bin.txt', 'crowd-people-lo.webp', 'nora.vrm']) {
    assert.ok(readFileSync('public/nora/' + f).equals(readFileSync('mobile-app/public/nora/' + f)), f);
  }
});

test('either pack version decodes through one door, and says which levels it has', () => {
  const old = decodeAnyCrowdPack(readFileSync('public/nora/crowd.bin.txt', 'utf8'));
  assert.equal(old.header.v, 2);
  assert.ok(old.geos['body:near']);
  assert.ok(crowdHasLod(old, 'seat') && !crowdHasLod(old, 'huge'));
  const now = decodeAnyCrowdPack(readFileSync('public/' + NORA_MODEL.crowd, 'utf8'));
  assert.equal(now.header.v, 3);
  for (const l of LODS) assert.ok(crowdHasLod(now, l), l);
  assert.ok(!crowdHasLod(now, 'huge'));
  assert.ok(!crowdHasLod(null, 'near'));
});

test('a recolour keeps the garment\'s shading and takes the target\'s colour', () => {
  const mean = [0.2, 0.2, 0.2];   // luma 0.2
  const k = recolour([0.4, 0.1, 0.05], mean);
  // the shader draws k · luma(texel): a texel at the garment's mean comes out as the target
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(k[i] * 0.2 - [0.4, 0.1, 0.05][i]) < 1e-9);
  assert.deepEqual(recolour(null, mean), [-1, 0, 0], 'none');
  assert.deepEqual(recolour([0.1, 0.1, 0.1], null), [-1, 0, 0], 'a garment with no measured colour is left as baked');
  assert.ok(recolour([0.1, 0.1, 0.1], [0, 0, 0]).every(Number.isFinite), 'a black garment does not divide by zero');
});

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test('neighbours are never the same person, the suit is rarer, and the same seed dresses the room the same', () => {
  const { header } = packs[0].pack;
  const room = () => {
    const people = [];
    for (let z = 0; z < 18; z += 0.55) for (let x = -6; x <= 6; x += 0.55) people.push({ x, z });
    dressPeople(header, people, seeded(9));
    return people;
  };
  const a = room(), b = room();
  assert.deepEqual(a.map((p) => p.body), b.map((p) => p.body), 'the same seed, the same room');
  for (const p of a) {
    for (const q of a) {
      if (p !== q && Math.hypot(p.x - q.x, p.z - q.z) < 1.1) assert.notEqual(p.body, q.body, 'two of the same person side by side');
    }
  }
  const count = header.bodies.map(() => 0);
  for (const p of a) count[p.body]++;
  const suit = header.bodies.findIndex((b) => b.name === 'suit');
  assert.ok(suit >= 0 && header.bodies[suit].weight < 1);
  const mean = a.length / header.bodies.length;
  assert.ok(count[suit] < mean, `the suit is ${count[suit]} of ${a.length}`);
  for (const p of a) {
    const t = header.bodies[p.body].tint;
    if (!t[PART.TOP]) assert.equal(p.top[0], -1, 'a print or a suit is never recoloured');
  }
});

test('people without a place (the venue\'s) still each get someone', () => {
  const people = Array.from({ length: 40 }, () => ({}));
  dressPeople(packs[1].pack.header, people, seeded(3));
  for (const p of people) assert.ok(Number.isInteger(p.body) && p.body >= 0 && p.body < packs[1].pack.header.bodies.length);
});

test('a desktop loads the desktop crowd, a phone the lighter one', () => {
  assert.equal(crowdPackPath(NORA_MODEL, 'high'), 'nora/crowd-people.bin.txt');
  assert.equal(crowdPackPath(NORA_MODEL, 'low'), 'nora/crowd-people-lo.bin.txt');
  assert.equal(crowdPackPath({ crowd: 'a.bin.txt' }, 'low'), 'a.bin.txt', 'a model with one pack serves it to both');
  assert.equal(crowdPackPath(null, 'high'), null);
});

test('the club, the venue and both pages use the people crowd', () => {
  const club = stripComments(readFileSync('public/newdesign/booth/club.mjs', 'utf8'));
  assert.match(club, /import \{ loadCrowd, createCrowd \} from '\.\/crowdPeople\.mjs';/);
  assert.match(club, /loadCrowd\(crowdUrl, fetchFn\)/);
  assert.match(club, /avatars = createCrowd\(\{/);
  const venue = stripComments(readFileSync('public/newdesign/booth/clubVenue.mjs', 'utf8'));
  assert.match(venue, /if \(!crowdHasLod\(pack, stand\) \|\| !crowdHasLod\(pack, 'seat'\)\) return;/);
  assert.match(venue, /venueCrowd = createCrowd\(\{/);
  const web = stripComments(readFileSync('public/newdesign/radio.jsx', 'utf8'));
  assert.match(web, /crowdUrl: S\.noraAssetUrl\(S\.crowdPackPath\(S\.NORA_MODEL, tier\.quality\), "\/"\)/);
  const app = stripComments(readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', 'utf8'));
  assert.match(app, /crowdUrl: noraAssetUrl\(crowdPackPath\(NORA_MODEL, tier\.quality\), import\.meta\.env\.BASE_URL\)/);
});

test('hair and the eyes\' clear shells are alpha-tested; nothing else is', () => {
  const src = readFileSync('public/newdesign/booth/crowdPeople.mjs', 'utf8');
  assert.match(src, /if \(P == 2 && diffuseColor\.a \* \(1\.0 \+ 0\.3 \* lod\) < 0\.5\) discard;/);
  assert.match(src, /if \(P == 3 && diffuseColor\.a < 0\.5\) discard;/);
  assert.equal((src.match(/discard;/g) || []).length, 2);
});

// ── the dark floor (owner, 2026-10-26: "make the crowd darker like a real club") ──

// the shader a crowd material compiles, patched by its own onBeforeCompile on three's real standard
// shader: every `replace` must find its include, or the patch would vanish silently
function compiled(opts = {}) {
  const pack = packs[1].pack;
  const crowd = createPeopleCrowd({ THREE, pack, people: [{ lod: 0 }, { lod: 1 }], lodCount: [1, 1], rnd: seeded(5), lods: ['near', 'seat'], ...opts });
  const mat = crowd.group.children.find((m) => m.count > 0).material;
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  mat.onBeforeCompile(sh);
  crowd.dispose();
  return sh;
}

test('the house lights: the direct light fades from the front row into the house, the ambient turns down', () => {
  const sh = compiled({ house: { near: 0.6, far: 0.12, fall: 6, ambient: 0.2 } });
  assert.match(sh.fragmentShader, /#include <lights_fragment_end>\n\{ float houseK = mix\(uHouse\.y, uHouse\.x, exp\(min\(vStageZ - 1\.5, 0\.0\) \/ uHouse\.z\)\);/);
  assert.match(sh.fragmentShader, /reflectedLight\.directDiffuse \*= houseK; reflectedLight\.directSpecular \*= houseK;/);
  assert.match(sh.fragmentShader, /reflectedLight\.indirectDiffuse \*= uHouse\.w; reflectedLight\.indirectSpecular \*= uHouse\.w;/);
  assert.match(sh.fragmentShader, /uniform vec4 uHouse;/);
  // the earlier patches still land too
  for (const marker of ['totalEmissiveRadiance += pool', 'diffuseColor.a = 1.0;']) assert.ok(sh.fragmentShader.includes(marker), marker);
  assert.deepEqual(sh.uniforms.uHouse.value.toArray(), [0.6, 0.12, 6, 0.2]);
  // the shader's own curve: the front row (z −2) and ten metres back
  const houseK = (z, h) => h.far + (h.near - h.far) * Math.exp(Math.min(z - 1.5, 0) / h.fall);
  const H = { near: 0.6, far: 0.12, fall: 6 };
  assert.ok(houseK(-2, H) > 0.35 && houseK(-2, H) < 0.42, 'the front row keeps ≈ 40% of the stage\'s direct light');
  assert.ok(houseK(-10, H) < 0.2 && houseK(-30, H) - H.far < 0.01, 'deep in the house it is near the floor value');
});

test('without the option a crowd keeps all of the room\'s light (the venue\'s lounges)', () => {
  assert.deepEqual(compiled().uniforms.uHouse.value.toArray(), [1, 1, 1e4, 1]);
  const club = stripComments(readFileSync('public/newdesign/booth/club.mjs', 'utf8'));
  assert.match(club, /export const CROWD_HOUSE = Object\.freeze\(\{ near: 0\.6, far: 0\.12, fall: 6, ambient: 0\.2 \}\);/);
  assert.match(club, /avatars = createCrowd\(\{ THREE, pack, people, lodCount, rnd, lods: LODS, stageFalloff: low \? 9 : 11, house: CROWD_HOUSE \}\);/);
  // the stage's fill on their faces: a smaller share of the wall's light than the 0.55 it was
  assert.match(club, /tmpC2\.copy\(iceC\)\.multiplyScalar\(0\.006 \+ 0\.008 \* lvl\)\.add\(glowA\.copy\(wallGlow\)\.multiplyScalar\(0\.35\)\);/);
  const venue = stripComments(readFileSync('public/newdesign/booth/clubVenue.mjs', 'utf8'));
  assert.doesNotMatch(venue.match(/venueCrowd = createCrowd\(\{[\s\S]*?\}\);/)[0], /house/, 'the balconies are lit by their lounges');
});
