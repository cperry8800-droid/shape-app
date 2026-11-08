// The website bar's turning mark (owner, 2026-11-03: "add the same effect to the triangles in top
// left logo on nav bar that we did on the app. Some same effects as the splash pages").
// splitGlassMark.js's mountNav lays the app masthead's split-glass prisms over the Shape
// lockup's triangles and hands the <img> the lockup without them. These pin where the glass goes
// (against build-logo's own layout), the bare files it swaps to, both bars' wiring, and mountNav's
// behaviour: it swaps only once the bare file has loaded, draws the still pose under reduced motion,
// and puts the flat lockup back when stopped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SG = createRequire(import.meta.url)('../public/newdesign/splitGlassMark.js');

test('NAV_BOX is the lockup build-logo draws: its size, the triangles\' centre and height', async () => {
  const m = await import('../marketing/club-shape/build-logo.mjs');
  const { MARK_PNG } = await import('../prototypes/nora-booth/src/screenArt.mjs');
  const pad = 0.12 * m.CAP, L = m.LOCKUP;                                   // build-logo's SITE_PAD
  const wordW = m.wordPolys('SHAPE', { x: 0, y: 0, cap: m.CAP }).width;
  const markH = L.markCaps * m.CAP;
  const markW = markH * (MARK_PNG.box.x1 - MARK_PNG.box.x0) / (MARK_PNG.box.y1 - MARK_PNG.box.y0);
  const mx = pad + wordW / 2 + L.markShift * m.CAP - markW / 2;
  const want = { w: wordW + 2 * pad, h: pad + markH + L.markGap * m.CAP + m.CAP + pad, cx: mx + markW / 2, cy: pad + markH / 2, markH };
  for (const k of Object.keys(want)) assert.ok(Math.abs(SG.NAV_BOX[k] - want[k]) < 0.01, `NAV_BOX.${k} is ${SG.NAV_BOX[k]}, the lockup's is ${want[k]}`);
  // and the served lockups are that size
  for (const f of ['public/shape-logo-teal-white.svg', 'public/shape-logo-black.svg']) {
    assert.match(read(f), new RegExp(`viewBox="0 0 ${SG.NAV_BOX.w} ${SG.NAV_BOX.h}"`), f);
  }
});

test('the glass box: the masthead mark\'s triangles (82 units tall, centred at 49.5, 56) on the lockup\'s', () => {
  assert.deepEqual(SG.navPlace(), { left: '35.25%', top: '-7.27%', width: '31.1%', height: '75.34%' });
});

test('the bare lockups: the same box, the words only', () => {
  for (const [bare, full] of [['public/shape-logo-bare-white.svg', 'public/shape-logo-white.svg'], ['public/shape-logo-bare-black.svg', 'public/shape-logo-black.svg']]) {
    const b = read(bare), f = read(full);
    assert.equal(/viewBox="[^"]+"/.exec(b)[0], /viewBox="[^"]+"/.exec(f)[0], `${bare} is not the lockup's box`);
    assert.equal((b.match(/<path /g) || []).length, 1, `${bare} should hold SHAPE only`);
    assert.equal((f.match(/<path /g) || []).length, 3, `${full} should hold the two triangles and the word`);
  }
});

test('the shared header turns the glass on both papers, each <img> keeping its paper switch', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  assert.match(shell, /useNavGlass\(markDarkRef, true, "\/shape-logo-bare-white\.svg"\)/);
  assert.match(shell, /useNavGlass\(markLightRef, false, "\/shape-logo-bare-black\.svg"\)/);
  assert.match(shell, /<span ref=\{markDarkRef\} className="shape-nav-mark"[^>]*var\(--sh-logo-dark, block\)[^>]*><img src="\/shape-logo-teal-white\.svg"[^>]*\/><svg className="shape-nav-glass"[^>]*\/><\/span>/);
  assert.match(shell, /<span ref=\{markLightRef\} className="shape-nav-mark"[^>]*var\(--sh-logo-light, none\)[^>]*><img src="\/shape-logo-black\.svg"[^>]*\/><svg className="shape-nav-glass"[^>]*\/><\/span>/);
  assert.match(shell, /SG\.mountNav\(el\.querySelector\("svg"\), el\.querySelector\("img"\), \{ dark, bare \}\)/);
  // a page without the script loads it, once
  assert.match(shell, /tag\.src = "\/newdesign\/splitGlassMark\.js"/);
});

test('the homepage bar turns the glass too', () => {
  const home = read('public/newdesign/index.html');
  assert.match(home, /<a class="brand"[^>]*><span class="nav-mark"><img src="\/shape-logo-teal-white\.svg"[^>]*\/><svg class="nav-glass"><\/svg><\/span><\/a>/);
  assert.match(home, /SG\.mountNav\(m\.querySelector\('svg'\), m\.querySelector\('img'\), \{ dark: true, bare: '\/shape-logo-bare-white\.svg' \}\)/);
  assert.ok(home.indexOf('splitGlassMark.js') < home.indexOf('SG.mountNav('), 'the script must be loaded before the bar mounts it');
});

// A small stand-in for the page: just what mountNav touches.
function fakePage({ reduced = false } = {}) {
  const images = [];
  const attrs = (o) => Object.assign(o, { _a: {}, setAttribute(k, v) { this._a[k] = String(v); }, getAttribute(k) { return this._a[k] ?? null; } });
  const g = { innerHTML: '' };
  const svg = attrs({ style: {}, querySelector: () => null, appendChild: (c) => Object.assign(g, c) });
  const img = attrs({});
  img.setAttribute('src', '/shape-logo-teal-white.svg');
  globalThis.document = { createElementNS: () => g };
  globalThis.Image = class { constructor() { images.push(this); } };
  globalThis.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  delete globalThis.IntersectionObserver;
  return { svg, img, g, images };
}
const cleanup = () => { for (const k of ['document', 'Image', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame']) delete globalThis[k]; };

test('mountNav swaps to the bare lockup only once it has loaded, and stop() puts the flat one back', () => {
  const { svg, img, g, images } = fakePage({ reduced: true });
  try {
    const stop = SG.mountNav(svg, img, { dark: true, bare: '/shape-logo-bare-white.svg' });
    assert.equal(img.getAttribute('src'), '/shape-logo-teal-white.svg', 'swapped before the bare file loaded');
    assert.equal(images.length, 1);
    assert.equal(images[0].src, '/shape-logo-bare-white.svg');
    images[0].onload();
    assert.equal(img.getAttribute('src'), '/shape-logo-bare-white.svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 99 113');
    assert.equal(svg.style.left, '35.25%');
    // reduced motion: the still pose, as the app's masthead
    assert.equal(g.innerHTML, SG.render(SG.logo([255, 255, 255], [52, 214, 197]), SG.STILL, SG.MAST));
    stop();
    assert.equal(img.getAttribute('src'), '/shape-logo-teal-white.svg');
    assert.equal(g.innerHTML, '');
  } finally { cleanup(); }
});

test('mountNav: the light paper\'s glass is the page\'s ink and the deep teal; a stop before the load swaps nothing', () => {
  const { svg, img, g, images } = fakePage({ reduced: true });
  try {
    const stop = SG.mountNav(svg, img, { dark: false, bare: '/shape-logo-bare-black.svg' });
    stop();
    images[0].onload();
    assert.equal(img.getAttribute('src'), '/shape-logo-teal-white.svg');
    assert.equal(g.innerHTML, '');
    const again = fakePage({ reduced: true });
    SG.mountNav(again.svg, again.img, { dark: false, bare: '/shape-logo-bare-black.svg' });
    again.images[0].onload();
    assert.equal(again.g.innerHTML, SG.render(SG.logo([26, 26, 26], [10, 143, 135]), SG.STILL, SG.MAST));
  } finally { cleanup(); }
});
