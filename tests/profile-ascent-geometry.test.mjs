// The Terrain profile's hero ascent. Over a cover photo the route climbs into
// the picture; on paper it stays the compact chart it has always been. Both
// facts are geometry, so this guard EVALUATES the shipped expressions rather
// than matching their spelling — an equivalent rewrite must pass, and a wrong
// number must fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');

function grab(re, label) {
  const m = SRC.match(re);
  assert.ok(m, `the ascent's ${label} is not where this guard looks — re-anchor it rather than deleting the assertion`);
  return m[0];
}

// The two numbers that split one block, read off the source.
const BLOCK = Number(grab(/const BS_HERO_BLOCK = \d+;/, 'block height').match(/\d+/)[0]);
const [, H_COVER, H_PAPER] = grab(/const heroAscentH = heroCover \? \d+ : \d+;/, 'band height').match(/(\d+) : (\d+)/).map(Number);

// The pad above the band, as the JSX actually computes it.
const PAD_EXPR = grab(/paddingTop: BS_HERO_BLOCK - heroAscentH/, 'pad expression');
const padFor = (h) => new Function('BS_HERO_BLOCK', 'heroAscentH', `return ${PAD_EXPR.replace('paddingTop: ', '')};`)(BLOCK, h);

// The route itself, lifted verbatim and run at either height.
const GEO = [
  grab(/const W = 330, H = heroAscentH;/, 'viewBox'),
  grab(/const base = \[12, H - 22\], peak = \[W - 22, 26\];/, 'endpoints'),
  grab(/const rise = base\[1\] - peak\[1\];/, 'rise'),
  grab(/const KNEE = [^;]+;/, 'shape fractions'),
  grab(/const ridge = `M \$\{base\[0\]\}[^`]+`;/, 'path'),
].join('\n');
// The figure's cap, also lifted — it is what keeps the avatar off the flag.
const CAP = grab(/const hp = Math\.max\(0\.06, Math\.min\(heroPct, _hlTop \? [\d.]+ : [\d.]+\)\);/, 'figure cap');

const geo = (heroAscentH) => new Function('heroAscentH', `${GEO}\nreturn { W, H, base, peak, rise, ridge, KNEE, SHOULDER };`)(heroAscentH);
const paper = geo(H_PAPER);
const cover = geo(H_COVER);
const slope = (g) => (g.base[1] - g.peak[1]) / (g.peak[0] - g.base[0]);
// Absolute y inside the photo block: the pad above the band plus the offset in it.
const absY = (g, y) => padFor(g.H) + y;

test('the cover band and the pad above it sum to one constant block', () => {
  // ⚠ THE POINT OF THE WHOLE CHANGE. The photo is object-fit: cover over this
  // block, so growing the block to raise the line would RE-CROP the photo
  // instead of moving the line up it. The extra range is spent out of the
  // padding, never added to the height.
  // 278 is written HERE rather than read from the source, or the assertion is
  // algebra: `padFor` IS `BLOCK - heroAscentH`, so summing them back to BLOCK
  // can never fail. It is the block the photo was cropped to before this change
  // (the old 128 pad + 150 band), and moving it re-frames every member's cover.
  assert.equal(padFor(H_COVER) + H_COVER, 278, 'the cover block changed height — the photo now crops differently');
  assert.ok(padFor(H_COVER) >= 0, 'the band cannot be taller than the block it sits in');
  assert.ok(H_COVER > H_PAPER, 'the cover band is the taller of the two, or there is nothing to climb');
});

test('the base of the route does not move when the band grows', () => {
  // The base square, the base label and the phase eyebrow are all pinned to the
  // bottom of this block. If the base drifted, raising the summit would have
  // dragged the whole hero's furniture with it.
  assert.equal(absY(cover, cover.base[1]), absY(paper, paper.base[1]));
});

test('the summit climbs into the photo and the chord steepens with it', () => {
  assert.ok(absY(cover, cover.peak[1]) < absY(paper, paper.peak[1]) - 40,
    `the cover summit must sit well above the compact one, got ${absY(cover, cover.peak[1])} vs ${absY(paper, paper.peak[1])}`);
  assert.ok(slope(cover) > slope(paper) * 1.4,
    `the cover chord must read as a steeper climb, got ${slope(cover).toFixed(3)} vs ${slope(paper).toFixed(3)}`);
});

test('the route is shaped as a fraction of its own rise, not of the band height', () => {
  // Both control points must hold the same share of the rise at either height,
  // or a taller band flattens the approach instead of steepening the climb.
  const share = (g, y) => (g.base[1] - y) / g.rise;
  const knee = (g) => share(g, Number(g.ridge.match(/Q [\d.]+ ([\d.]+),/)[1]));
  const shoulder = (g) => share(g, Number(g.ridge.match(/, [\d.]+ ([\d.]+) T/)[1]));
  assert.ok(Math.abs(knee(cover) - knee(paper)) < 1e-9, 'the knee drifted');
  assert.ok(Math.abs(shoulder(cover) - shoulder(paper)) < 1e-9, 'the shoulder drifted');
  assert.ok(knee(paper) > 0 && knee(paper) < shoulder(paper) && shoulder(paper) < 1,
    'the route must leave the base, bend once, and arrive at the summit');
});

test('the compact chart is untouched — the old literals, re-derived', () => {
  // `H - 34` and `H * 0.5` at H = 150 are what the fractions replaced. Asserted
  // as ARITHMETIC rather than as a pinned path string, so a rewrite that keeps
  // the geometry passes and a rewrite that moves it fails.
  assert.equal(paper.H, 150);
  assert.equal(paper.base[1] - paper.rise * paper.KNEE, paper.H - 34);
  assert.equal(paper.base[1] - paper.rise * paper.SHOULDER, paper.H * 0.5);
});

test('the figure still clears the summit flag on the taller band', () => {
  // The cap is a fraction of the CHORD, so a steeper chord moves the figure up
  // as well as along. The flag's pole rises 18 units above the peak and the
  // summit label sits at the top-right; the avatar column is 60 wide, centred.
  const hp = new Function('heroPct', '_hlTop', 'Math', `${CAP}\nreturn hp;`)(1, false, Math);
  const here = { x: cover.base[0] + (cover.peak[0] - cover.base[0]) * hp, y: cover.base[1] + (cover.peak[1] - cover.base[1]) * hp };
  assert.ok(here.x + 30 < cover.peak[0] - 6, `the avatar column runs into the flag: ${here.x + 30} vs ${cover.peak[0]}`);
  assert.ok(here.y > cover.peak[1], 'the figure must stand below the summit it is climbing toward');
});
