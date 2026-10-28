// tests/split-glass-mark.test.mjs
//
// Split glass, the splash mark in 3D (owner, 2026-10-26: "do split glass"), shared by the
// homepage splash and the app's launch screens (public/newdesign/splitGlassMark.js). These pin
// what nobody can check frame by frame: it starts edge-on and ends up facing you, a settle
// lands exactly on each surface's flat mark in that surface's own colors, a settle cut in
// mid-spin takes the short way round, and the frame loop stops when it should.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SG = require('../public/newdesign/splitGlassMark.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** The polygons in a rendered frame: their points and the rest of their attributes. */
const polys = (svg) => [...svg.matchAll(/<polygon points="([^"]+)"([^>]*)\/>/g)]
  .map((m) => ({ pts: m[1].split(' ').map((p) => p.split(',').map(Number)), attrs: m[2].trim() }));
const sameTri = (a, b) => a.length === 3 && b.every((p) => a.some((q) => Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9));

test('it starts edge-on with the triangles together, and faces you once the spin ends', () => {
  const start = SG.pose(0);
  assert.ok(Math.abs(Math.cos(start.ry)) < 1e-9, `it does not start edge-on (ry ${start.ry})`);
  assert.equal(start.sep, 0, 'the triangles start apart');
  for (const e of [SG.SPIN, 3, 5, 9, 20, 61]) {
    const p = SG.pose(e);
    assert.ok(Math.abs(p.ry) <= 0.55 + 1e-9 && Math.abs(p.rx) <= 0.28 + 1e-9,
      `at ${e} s it is turned away (ry ${p.ry.toFixed(2)}, rx ${p.rx.toFixed(2)})`);
    assert.ok(p.sep > 10.9, `at ${e} s the two depths have not opened`);
  }
});

for (const [name, spec] of [['website', SG.SITE], ['app', SG.APP]]) {
  test(`settled, the ${name} mark is exactly its flat mark, in its own colors`, () => {
    const out = polys(SG.render(spec, SG.REST));
    assert.equal(out.length, 2, 'glass faces are left over the flat mark');
    for (const tri of spec.tris) {
      const hit = out.find((p) => sameTri(p.pts, tri.pts));
      assert.ok(hit, `no flat triangle at ${tri.pts.join(' ')}`);
      assert.equal(hit.attrs, `fill="${tri.solid}"`);
    }
  });
}

test("each surface's geometry is the mark that surface already draws", () => {
  // the homepage's flat mark (the fallback under the glass) and the app's fallback mark
  const site = read('public/newdesign/index.html');
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  for (const tri of SG.SITE.tris) assert.ok(site.includes(`points="${tri.pts.join(' ')}" pathLength="1"`), `index.html has no ${tri.pts.join(' ')}`);
  for (const tri of SG.APP.tris) assert.ok(app.includes(`points="${tri.pts.join(' ')}" fill="${tri.solid}"`), `BSShapeMark has no ${tri.pts.join(' ')}`);
});

test('a replayed launch spins the app mark in again rather than resuming the drift', () => {
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(app, /function onReplay\(\) \{ _bsMarkT0 = null;/, 'bs-replay-splash keeps the first launch\'s clock');
});

test('mid-spin it is glass: every face of both prisms, see-through, with lit edges', () => {
  for (const e of [0.4, 1.2, 2, 4]) {
    const out = polys(SG.render(SG.SITE, SG.pose(e)));
    assert.equal(out.length, 10, `at ${e} s it drew ${out.length} faces, not 10`);
    for (const p of out) {
      assert.ok(p.pts.flat().every(Number.isFinite), `at ${e} s a face has a point that is not a number`);
      assert.match(p.attrs, /fill-opacity="(0(\.\d+)?|0?\.\d+)"/, `at ${e} s a face is not see-through`);
      assert.match(p.attrs, /stroke="rgba\(/, `at ${e} s a face has no lit edge`);
    }
  }
});

test('a settle cut in mid-spin takes the short way round', () => {
  const from = SG.pose(0.2); // nearly two turns still to go
  const half = SG.blend(from, SG.REST, 0.5);
  assert.ok(Math.abs(half.ry) <= Math.PI / 2, `halfway it is still unwinding (ry ${half.ry.toFixed(2)})`);
  assert.deepEqual(SG.blend(from, SG.REST, 1), SG.REST);
});

test('play draws a frame at once and every frame after, then settles onto the flat mark and stops', () => {
  let now = 1000;
  const frames = [];
  const g = { innerHTML: '' };
  const run = SG.play(g, SG.SITE, { now: () => now, raf: (f) => frames.push(f), start: now });
  assert.equal(polys(g.innerHTML).length, 10, 'the first frame was not drawn at once');
  const step = (ms) => {
    now += ms;
    const f = frames.shift();
    assert.ok(f, 'the loop stopped asking for frames');
    f();
  };
  for (let i = 0; i < 60; i++) step(50); // 3 s in
  assert.equal(frames.length, 1);
  run.settle();
  run.settle(); // a second call changes nothing
  for (let i = 0; i < 20 && frames.length; i++) step(60);
  assert.equal(frames.length, 0, 'it kept asking for frames after it settled');
  assert.equal(g.innerHTML, SG.render(SG.SITE, SG.REST), 'it did not land on the flat mark');
});

test('a second screen started from the first one\'s clock picks up the drift', () => {
  const g1 = { innerHTML: '' }, g2 = { innerHTML: '' };
  SG.play(g1, SG.APP, { now: () => 4000, raf: () => {}, start: 1000 });
  assert.equal(g1.innerHTML, SG.render(SG.APP, SG.pose(3)), 'it did not draw the pose 3 s in');
  SG.play(g2, SG.APP, { now: () => 4000, raf: () => {}, start: 1000 });
  assert.equal(g2.innerHTML, g1.innerHTML);
});

test('stop ends the loop, and reduced motion draws one still pose and never animates', () => {
  const frames = [];
  const run = SG.play({ innerHTML: '' }, SG.APP, { now: () => 0, raf: (f) => frames.push(f) });
  run.stop();
  frames.shift()();
  assert.equal(frames.length, 0, 'a stopped mark asked for another frame');

  const g = { innerHTML: '' };
  const still = SG.play(g, SG.APP, { reduced: true, raf: () => assert.fail('a reduced-motion mark asked for a frame') });
  assert.equal(g.innerHTML, SG.render(SG.APP, SG.STILL));
  still.settle();
  assert.equal(g.innerHTML, SG.render(SG.APP, SG.REST));
});

// The app's masthead mark (owner, 2026-10-27: "make the triangles here on app the same design/look as
// new triangle splash page"): BSLogo draws the same prisms, held at the still pose, in denser glass.
test('the masthead mark is BSLogo\'s own triangles, and settled it is the flat mark in the page\'s ink', () => {
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx');
  const ink = [15, 14, 12], teal = [10, 143, 135];
  const spec = SG.logo(ink, teal);
  // The fallback BSLogo draws for a colour that is not a hex is the same geometry.
  for (const tri of spec.tris) assert.ok(app.includes(`points="${tri.pts.join(' ')}" fill={c}`), `BSLogo has no ${tri.pts.join(' ')}`);
  assert.deepEqual(spec.tris[0].rgb, teal, 'the teal prism is not the front one');
  const flat = polys(SG.render(spec, SG.REST));
  assert.equal(flat.length, 2);
  assert.ok(flat.some((p) => p.attrs === 'fill="rgb(15,14,12)"'), 'settled, the back prism is not the ink');
});

test('the masthead glass is denser than the splash\'s, and the splash is drawn as it was', () => {
  const spec = SG.logo([15, 14, 12], [10, 143, 135]);
  const opacity = (svg) => polys(svg).map((p) => Number(/fill-opacity="([\d.]+)"/.exec(p.attrs)[1]));
  const width = (svg) => polys(svg).map((p) => Number(/stroke-width="([\d.]+)"/.exec(p.attrs)[1]));
  const mast = SG.render(spec, SG.STILL, SG.MAST);
  assert.equal(polys(mast).length, 10, 'every face of both prisms');
  assert.ok(Math.min(...opacity(mast)) >= SG.MAST.floor - 1e-9, 'a masthead face is fainter than the floor');
  assert.ok(Math.min(...width(mast)) >= 0.45 * SG.MAST.stroke - 0.01, 'a masthead edge is a hairline');
  // Without a look, the splash keeps its 7% floor and its 0.7 / 0.45 edges.
  const splash = SG.render(SG.APP, SG.STILL);
  assert.deepEqual([...new Set(width(splash))].sort(), [0.45, 0.7]);
  assert.ok(Math.min(...opacity(splash)) < SG.MAST.floor, 'the splash has gone dense');
});

test('BSLogo draws the glass from the shared module and keeps the flat mark when it cannot', () => {
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx');
  const at = app.indexOf('function bsLogoGlass(');
  assert.ok(at >= 0, 'bsLogoGlass is gone');
  const fn = app.slice(at, app.indexOf('\n// The mark turns while the app is open', at));
  assert.match(fn, /window\.SplitGlassMark/, 'the masthead does not read the shared mark');
  assert.match(fn, /const spec = light \? SG\.logo\(\[255, 255, 255\], \[52, 214, 197\]\) : SG\.logo\(ink, \[10, 143, 135\]\);/, 'the colours do not follow the paper');
  assert.match(fn, /still: SG\.render\(spec, SG\.STILL, SG\.MAST\)/, 'the first frame is not the still pose in MAST glass');
  assert.match(fn, /if \(!SG \|\| typeof SG\.logo !== 'function' \|\| !m\) return null;/, 'a non-hex colour or a missing module must fall back');
  // Drive it: a hex ink draws glass, cached per ink; currentColor draws nothing (the flat mark).
  const run = new Function('window', `const _bsLogoGlass = new Map();\n${fn}; return bsLogoGlass;`);
  const bsLogoGlass = run({ SplitGlassMark: SG });
  const dark = bsLogoGlass('#0f0e0c');
  assert.equal(dark.still, SG.render(SG.logo([15, 14, 12], [10, 143, 135]), SG.STILL, SG.MAST));
  assert.deepEqual(dark.spec, SG.logo([15, 14, 12], [10, 143, 135]));
  assert.equal(bsLogoGlass('#0F0E0C'), dark, 'the same ink is not drawn once');
  // A dark paper (its light ink says so) takes the splash's teal and white (owner, 2026-10-28: "teal
  // and white for dark papers"), whatever its ink: cream, Carbon's grey, Blueprint's blue.
  for (const light of ['#F4EDE0', '#f5f0e6', '#c9cfd6', '#dbe7ff']) {
    assert.equal(bsLogoGlass(light).still, SG.render(SG.logo([255, 255, 255], [52, 214, 197]), SG.STILL, SG.MAST), `${light} ink is not teal and white`);
  }
  // A light paper keeps the deep teal and its own ink (Manila's brown).
  assert.deepEqual(bsLogoGlass('#221806').spec, SG.logo([34, 24, 6], [10, 143, 135]));
  assert.equal(bsLogoGlass('currentColor'), null);
  assert.equal(run(undefined)('#0f0e0c'), null, 'with no window it must fall back');
});

// The masthead mark turns while the app is open (owner, 2026-10-28: "have them slowly rotate/spin
// on page while app is open").
test('the masthead turn starts and ends each turn on the still pose, and stays glass all the way round', () => {
  assert.deepEqual(SG.turn(0), SG.STILL);
  const near = (a, b) => Math.abs(Math.cos(a) - Math.cos(b)) < 1e-9 && Math.abs(Math.sin(a) - Math.sin(b)) < 1e-9;
  for (const n of [1, 2, 37]) assert.ok(near(SG.turn(n * SG.TURN).ry, SG.STILL.ry), `after ${n} turns it is not back on the still pose`);
  assert.ok(near(SG.turn(SG.TURN / 2).ry, SG.STILL.ry + Math.PI), 'halfway it has not turned half round');
  assert.ok(SG.TURN >= 8, `a turn in ${SG.TURN} s is not slow`);
  const spec = SG.logo([15, 14, 12], [10, 143, 135]);
  for (let i = 0; i < 48; i++) {
    const e = (i * SG.TURN) / 48;
    const p = SG.turn(e);
    assert.equal(p.rx, SG.STILL.rx);
    assert.equal(p.sep, SG.STILL.sep);
    assert.equal(p.fill, 0, `at ${e} s it went solid`);
    const out = polys(SG.render(spec, p, SG.MAST));
    assert.equal(out.length, 10, `at ${e} s it drew ${out.length} faces, not 10`);
    assert.ok(out.every((f) => f.pts.flat().every(Number.isFinite)), `at ${e} s a face has a point that is not a number`);
  }
  // Each step of the clock moves it forward the same way: it turns, it does not sway.
  const steps = [0, 1, 2, 3].map((e) => SG.turn(e).ry);
  for (let i = 1; i < steps.length; i++) assert.ok(Math.abs(steps[i] - steps[i - 1] - (2 * Math.PI) / SG.TURN) < 1e-9);
});

test('one clock turns every masthead mark, about 30 frames a second, only while one is on screen', () => {
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx');
  const block = app.slice(app.indexOf('// BEGIN bsLogoTurn'), app.indexOf('// END bsLogoTurn'));
  assert.ok(block.length > 100, 'the bsLogoTurn block is gone');
  const frames = [];
  const make = new Function('requestAnimationFrame', 'performance', `${block}; return bsLogoTurn;`);
  const bsLogoTurn = make((f) => { frames.push(f); return frames.length; }, { now: () => 1000 });
  const seen = { a: [], b: [] };
  const offA = bsLogoTurn((e) => seen.a.push(e));
  const offB = bsLogoTurn((e) => seen.b.push(e));
  assert.equal(frames.length, 1, 'two marks asked for two frame loops');
  frames.shift()(1500);
  assert.deepEqual(seen.a, [0.5]);
  assert.deepEqual(seen.b, [0.5], 'the two marks are not at the same angle');
  frames.shift()(1510); // 10 ms later: not yet
  assert.equal(seen.a.length, 1, 'it drew faster than 30 frames a second');
  frames.shift()(1540);
  assert.deepEqual(seen.a, [0.5, 0.54]);
  offA();
  frames.shift()(1580);
  assert.equal(seen.a.length, 2, 'a mark off screen was still drawn');
  assert.equal(seen.b.length, 3);
  offB();
  frames.shift()(1620);
  assert.equal(frames.length, 0, 'with no mark on screen it kept asking for frames');
  // A mark coming back starts the loop again, on the same clock.
  bsLogoTurn((e) => seen.a.push(e));
  assert.equal(frames.length, 1);
  frames.shift()(3000);
  assert.equal(seen.a.at(-1), 2);
});

test('BSLogo turns its glass only on screen and never under reduced motion', () => {
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx');
  const at = app.indexOf('function BSLogo(');
  const fn = app.slice(at, app.indexOf('\nfunction BSLogoMask(', at));
  assert.match(fn, /prefers-reduced-motion: reduce\)'\)\.matches\) return undefined;/, 'reduced motion must keep the still pose');
  assert.match(fn, /SG\.render\(glass\.spec, SG\.turn\(e\), SG\.MAST\)/, 'it does not draw the turn in MAST glass');
  assert.match(fn, /new IntersectionObserver\(/, 'it turns off screen too');
  assert.match(fn, /return \(\) => \{ io\.disconnect\(\); stop\(\); \};/, 'unmounting leaves it in the loop');
  assert.match(fn, /<g ref=\{gRef\} dangerouslySetInnerHTML=\{\{ __html: glass\.still \}\} \/>/, 'the first frame is not the still pose');
});
