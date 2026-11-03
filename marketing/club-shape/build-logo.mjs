// build-logo.mjs — the Club Shape logo, drawn from the Shape wordmark's own letterforms.
//
// The brand art (public/SHAPE-logo-teal-white.png) is the word SHAPE with no font file behind it.
// prototypes/nora-booth/src/wordmarkGlyphs.mjs rebuilds that face as strokes (fitted to the PNG
// letter by letter) and builds C, L, U and B from the same bar, stem and corner, which is how the
// club's stage screen says CLUB SHAPE. This script turns those strokes into vector outlines and
// sets them with the brand's two triangles:
//
//   stacked     the mark over CLUB SHAPE, as the brand's own lockup sets it over SHAPE
//   horizontal  CLUB ▸◂ SHAPE on one line, the mark between the words as in SHAPE ▸◂ RADIO
//
// Run from the repository root:
//   node marketing/club-shape/build-logo.mjs           writes the SVGs, PNGs and preview.png
//   node marketing/club-shape/build-logo.mjs --check   scores the rebuilt SHAPE against the brand PNG
//   node marketing/club-shape/build-logo.mjs --site    writes the chosen logo where the site and the
//                                                      app serve it (SITE_FILES)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { SLANT, GLYPHS, TH, TV } from '../../prototypes/nora-booth/src/wordmarkGlyphs.mjs';
import { MARK_PNG } from '../../prototypes/nora-booth/src/screenArt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// ── The brand's measures (public/SHAPE-logo-teal-white.png, 3696 × 1782) ─────────────────────────
const BRAND = {
  cap: MARK_PNG.cap,          // 340 px
  wordLeft: 289,              // S's upright box (its ink starts at 296: the fitted S's bowl)
  wordTop: 1241,              // the cap line
  baseline: 1581,             // the row under the letters' last inked row (1580)
};

// Where each letter's upright box starts, in caps from the word's first. The brand spaces SHAPE by
// eye, not by a fixed gap (box to box: S·H 0.84, H·A 0.78, A·P 0.77, P·E 0.81), so SHAPE keeps the
// brand's own places, fitted to the PNG one letter at a time (--check scores them). C, L, U and B
// take the same rhythm, each gap read off its nearest kin: C·L like P·E (an open right side onto a
// stem), L·U tighter than A·P (L opens wider than A's diagonal), U·B like S·H (closed onto a stem).
export const SPACING = {
  SHAPE: { S: 0, H: 1.9735, A: 3.8853, P: 6.0412, E: 7.9265 },
  CLUB: { CL: 0.80, LU: 0.70, UB: 0.84 },
  wordSpace: 1.75,            // B's box to S's box, in the one-line CLUB SHAPE
};
export const COLORS = {
  white: '#FFFFFF',           // the wordmark and the ◂, as the brand PNG draws them
  teal: '#35B6C1',            // the ▸, sampled from the brand PNG
  ink: '#1A1A1A',             // the light-background wordmark (public/logo.svg)
};

// The lockups, in caps.
export const LOCKUP = {
  markCaps: 2.4,              // the mark's height, a touch over the brand's own 2.32 for a word twice as
                              //   long (owner, 2026-11-03: the club screen's 2.8 read too big here)
  markGap: 0.75,              // mark to cap line (the brand's is 0.74)
  markShift: 0.074,           // the mark sits this far right of the word's centre, as in the brand art
  inlineMarkCaps: 1.3,        // the horizontal lockup's mark, a little taller than a cap,
  inlineMarkDrop: 0.06,       //   its middle this far under the caps' middle (as SHAPE ▸◂ RADIO sits)
  inlineGap: 1.3,             //   and a word space from the words on each side
  pad: 0.6,                   // clear space round each file
  tilePad: 1.4,               // and round the logo on a tile (a file with its own background)
};

// ── Strokes → outlines ───────────────────────────────────────────────────────────────────────────
// Upright cap units, y up; the face's oblique is the shear x' = x + SLANT·y.
const ARC_STEPS = 40;
export function partPolygon(p) {
  if (p.k === 'seg') {
    const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], L = Math.hypot(dx, dy);
    const nx = (-dy / L) * p.t / 2, ny = (dx / L) * p.t / 2;
    return [[p.a[0] + nx, p.a[1] + ny], [p.b[0] + nx, p.b[1] + ny], [p.b[0] - nx, p.b[1] - ny], [p.a[0] - nx, p.a[1] - ny]];
  }
  if (p.k === 'arc') {
    const outer = [], inner = [];
    for (let i = 0; i <= ARC_STEPS; i++) {
      const f = i / ARC_STEPS, a = p.a0 + (p.a1 - p.a0) * f, t = p.t0 + (p.t1 - p.t0) * f;
      outer.push([p.c[0] + Math.cos(a) * (p.r + t / 2), p.c[1] + Math.sin(a) * (p.r + t / 2)]);
      inner.push([p.c[0] + Math.cos(a) * (p.r - t / 2), p.c[1] + Math.sin(a) * (p.r - t / 2)]);
    }
    return [...outer, ...inner.reverse()];
  }
  if (p.k === 'diag') {
    const h = p.t / 2;
    return [[p.x0 - h, p.y0], [p.x0 + h, p.y0], [p.x1 + h, p.y1], [p.x1 - h, p.y1]];
  }
  throw new Error('build-logo: unknown part ' + p.k);
}

// Every outline wound the same way, so overlapping strokes stay filled under the nonzero rule.
export function wind(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s < 0 ? poly.slice().reverse() : poly;
}
const n2 = (v) => (Math.round(v * 100) / 100).toString();
export const pathOf = (polys) => polys.map((q) => 'M' + q.map(([x, y]) => n2(x) + ' ' + n2(y)).join('L') + 'Z').join('');

// The letters' box positions for a word, in caps from its first box.
export function places(word) {
  if (word === 'SHAPE') return Object.entries(SPACING.SHAPE);
  if (word === 'CLUB') {
    const g = SPACING.CLUB, at = { C: 0 };
    at.L = at.C + GLYPHS.C.w + g.CL;
    at.U = at.L + GLYPHS.L.w + g.LU;
    at.B = at.U + GLYPHS.U.w + g.UB;
    return Object.entries(at);
  }
  if (word === 'CLUB SHAPE') {
    const club = places('CLUB'), [, bAt] = club[club.length - 1];
    const s0 = bAt + GLYPHS.B.w + SPACING.wordSpace;
    return [...club, ...places('SHAPE').map(([ch, x]) => [ch, s0 + x])];
  }
  throw new Error('build-logo: no spacing for ' + word);
}

// The face's P and B are square on the stem side, but their strokes leave the corner itself open (the
// bar stops at the stem's centre line and the stem at the bar's), a notch the LED screen's dots never
// show. These squares close it, inside the letter's own outline.
const STEM_CORNERS = {
  P: [[[0, 1 - TH], [TV, 1 - TH], [TV, 1], [0, 1]]],
  B: [[[0, 1 - TH], [TV, 1 - TH], [TV, 1], [0, 1]], [[0, 0], [TV, 0], [TV, TH], [0, TH]]],
};

/** A word's outlines in SVG space: cap height `cap` px, first upright box at `x`, baseline at `y`. */
export function wordPolys(word, { x, y, cap }) {
  const polys = [];
  let right = 0;
  for (const [ch, at] of places(word)) {
    const g = GLYPHS[ch];
    const outlines = [...g.parts.map(partPolygon), ...(STEM_CORNERS[ch] || [])];
    for (const o of outlines) polys.push(wind(o.map(([u, v]) => [x + (at + u + SLANT * v) * cap, y - v * cap])));
    right = Math.max(right, at + g.w);
  }
  return { polys, width: (right + SLANT) * cap };   // the last letter's top overhangs by SLANT
}

// The two triangles, in caps from the mark's top-left corner (y down), as the brand art draws them.
const MARK = (() => {
  const { box, cap } = MARK_PNG;
  const rel = (pts) => pts.map(([px, py]) => [(px - box.x0) / cap, (py - box.y0) / cap]);
  return { teal: rel(MARK_PNG.teal), white: rel(MARK_PNG.white), w: (box.x1 - box.x0) / cap, h: (box.y1 - box.y0) / cap };
})();
function markPolys({ x, y, height }) {
  const k = height / MARK.h;
  const place = (pts) => [pts.map(([u, v]) => [x + u * k, y + v * k])];
  return { teal: place(MARK.teal), white: place(MARK.white), w: MARK.w * k, h: height };
}

// ── The lockups ──────────────────────────────────────────────────────────────────────────────────
export const CAP = 100;   // the files' cap height, in SVG units

// The mark over CLUB SHAPE, with `padCaps` of clear space round it.
function stacked(padCaps = LOCKUP.pad) {
  const pad = padCaps * CAP;
  const markH = LOCKUP.markCaps * CAP;
  const all = places('CLUB SHAPE');
  const shapeAt = all[4][1] * CAP;
  const wordW = wordPolys('CLUB SHAPE', { x: 0, y: 0, cap: CAP }).width;
  const markW = markPolys({ x: 0, y: 0, height: markH }).w;
  const markTop = pad;
  const baseline = markTop + markH + LOCKUP.markGap * CAP + CAP;
  return {
    W: wordW + 2 * pad,
    H: baseline + pad,
    // centred over the word's ink, nudged right as the brand art nudges it
    mark: markPolys({ x: pad + wordW / 2 + LOCKUP.markShift * CAP - markW / 2, y: markTop, height: markH }),
    club: wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys,
    shape: wordPolys('SHAPE', { x: pad + shapeAt, y: baseline, cap: CAP }).polys,
  };
}

// CLUB ▸◂ SHAPE on one line, with `padCaps` of clear space round it.
function horizontal(padCaps = LOCKUP.pad) {
  const pad = padCaps * CAP;
  const g = LOCKUP.inlineGap * CAP;
  const club = wordPolys('CLUB', { x: 0, y: 0, cap: CAP });
  const mark0 = markPolys({ x: 0, y: 0, height: LOCKUP.inlineMarkCaps * CAP });
  // B's right edge and S's left edge meet the mark at half a cap, where the oblique leans by SLANT/2
  const clubRightMid = club.width - SLANT * CAP / 2;
  const markX = pad + clubRightMid + g;
  const shapeX = markX + mark0.w + g - SLANT * CAP / 2;
  const shape = wordPolys('SHAPE', { x: 0, y: 0, cap: CAP });
  const top = pad + Math.max(0, (LOCKUP.inlineMarkCaps - 1) / 2 - LOCKUP.inlineMarkDrop) * CAP;   // the mark's top over the cap line
  const baseline = top + CAP;
  const markTop = baseline - CAP / 2 - mark0.h / 2 + LOCKUP.inlineMarkDrop * CAP;
  const W = shapeX + shape.width + pad;
  const H = Math.max(baseline, markTop + mark0.h) + pad;
  return {
    W, H,
    mark: markPolys({ x: markX, y: markTop, height: mark0.h }),
    club: wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys,
    shape: wordPolys('SHAPE', { x: shapeX, y: baseline, cap: CAP }).polys,
  };
}

// Each file's colours (CLUB, SHAPE, the teal ▸, the white ◂), its own background if it is a tile,
// and the sheet preview.png shows it on. Every scheme sets the same lockup, so the sizing and the
// spacing are the same in all of them (a tile only has more room round it).
export const DARK = '#15110d', LIGHT = '#f2ede4';
const all = (c) => ({ club: c, shape: c, teal: c, white: c });
export const SCHEMES = {
  '':            { label: 'white and teal, for dark backgrounds', club: COLORS.white, shape: COLORS.white, teal: COLORS.teal, white: COLORS.white, sheet: DARK },
  '-ink':        { label: 'ink and teal, for light backgrounds', club: COLORS.ink, shape: COLORS.ink, teal: COLORS.teal, white: COLORS.ink, sheet: LIGHT },
  '-on-white':   { label: 'a white tile: ink and teal', club: COLORS.ink, shape: COLORS.ink, teal: COLORS.teal, white: COLORS.ink, bg: '#FFFFFF', sheet: DARK },
  '-on-teal':    { label: 'a teal tile: all white (a teal ▸ would vanish on it)', ...all(COLORS.white), bg: COLORS.teal, sheet: DARK },
  '-mono-white': { label: 'all white', ...all(COLORS.white), sheet: DARK },
  '-mono-black': { label: 'all black', ...all('#000000'), sheet: LIGHT },
  '-teal':       { label: 'CLUB in teal, for dark backgrounds (an alternate)', club: COLORS.teal, shape: COLORS.white, teal: COLORS.teal, white: COLORS.white, sheet: DARK },
};
const LOCKUPS = { stacked, horizontal };
const build = (name, s) => LOCKUPS[name](s.bg ? LOCKUP.tilePad : LOCKUP.pad);

export function svgOf(l, s) {
  const W = n2(l.W), H = n2(l.H);
  const fill = (color, polys) => (polys.length ? `<path fill="${color}" d="${pathOf(polys)}"/>` : '');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Club Shape">`,
    s.bg ? `<rect width="${W}" height="${H}" fill="${s.bg}"/>` : '',
    fill(s.teal, l.mark.teal),
    fill(s.white, l.mark.white),
    fill(s.club, l.club),
    fill(s.shape, l.shape),
    '</svg>',
  ].filter(Boolean).join('\n') + '\n';
}

// ── Checking the rebuilt face against the brand PNG ──────────────────────────────────────────────
async function check(sharp) {
  const png = join(ROOT, 'public', 'SHAPE-logo-teal-white.png');
  const meta = await sharp(png).metadata();
  const { polys } = wordPolys('SHAPE', { x: BRAND.wordLeft, y: BRAND.baseline, cap: BRAND.cap });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><path fill="#fff" d="${pathOf(polys)}"/></svg>`;
  const ours = await sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer();
  const theirs = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();
  // per letter: the brand's own letter boxes (columns), the wordmark's rows
  const cols = [[296, 717], [960, 1405], [1610, 2077], [2343, 2755], [2985, 3375]];
  const out = [];
  for (const [i, [c0, c1]] of cols.entries()) {
    let both = 0, either = 0;
    for (let y = BRAND.wordTop - 20; y < BRAND.baseline + 20; y++) {
      for (let x = c0 - 30; x <= c1 + 30; x++) {
        const a = ours[y * meta.width + x] > 127, b = theirs[y * meta.width + x] > 127;
        if (a && b) both++;
        if (a || b) either++;
      }
    }
    out.push(`${'SHAPE'[i]} ${(both / either).toFixed(3)}`);
  }
  console.log('IoU against the brand PNG: ' + out.join(' · '));
  return { ours, theirs, width: meta.width, height: meta.height };
}

// ── The served files: the chosen logo (owner, 2026-11-03: the stacked triangles) ───────────────────
// Cropped close, as the nav PNGs they replace are (the site and the app size a logo by its height).
// The wordmark alone is the app masthead's title, as shape-wordmark.png was.
const SITE_PAD = 0.12;
function wordmark(padCaps) {
  const pad = padCaps * CAP, baseline = pad + CAP;
  const shapeAt = places('CLUB SHAPE')[4][1] * CAP;
  return {
    W: wordPolys('CLUB SHAPE', { x: 0, y: 0, cap: CAP }).width + 2 * pad, H: CAP + 2 * pad,
    mark: { teal: [], white: [] },
    club: wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys,
    shape: wordPolys('SHAPE', { x: pad + shapeAt, y: baseline, cap: CAP }).polys,
  };
}
export const SITE_FILES = {
  'public/club-shape-logo-white.svg': () => [stacked(SITE_PAD), SCHEMES['-mono-white']],
  'public/club-shape-logo-black.svg': () => [stacked(SITE_PAD), SCHEMES['-mono-black']],
  'public/club-shape-logo-teal-white.svg': () => [stacked(SITE_PAD), SCHEMES['']],
  // The lockup without its triangles, same box: the website bar hands its <img> these once the
  // turning glass mark (splitGlassMark.js's mountNav) has taken the triangles' place.
  'public/club-shape-logo-bare-white.svg': () => [{ ...stacked(SITE_PAD), mark: { teal: [], white: [] } }, SCHEMES['-mono-white']],
  'public/club-shape-logo-bare-black.svg': () => [{ ...stacked(SITE_PAD), mark: { teal: [], white: [] } }, SCHEMES['-mono-black']],
  'mobile-app/public/club-shape-logo.svg': () => [stacked(SITE_PAD), SCHEMES['']],
  'mobile-app/public/club-shape-wordmark.svg': () => [wordmark(SITE_PAD), SCHEMES['-mono-white']],
  // The website dashboard rail's wordmark, drawn as a CSS mask so it takes the paper's ink (dash.css).
  'public/club-shape-wordmark.svg': () => [wordmark(SITE_PAD), SCHEMES['-mono-white']],
};

async function main() {
  const require = createRequire(join(ROOT, 'package.json'));
  let sharp = null;
  try { sharp = require('sharp'); } catch { /* the SVGs still build without it */ }
  if (process.argv.includes('--site')) {
    for (const [file, make] of Object.entries(SITE_FILES)) {
      const [l, s] = make();
      writeFileSync(join(ROOT, file), svgOf(l, s));
      console.log(`${file}  ${n2(l.W)} × ${n2(l.H)}  (aspect ${(l.W / l.H).toFixed(3)})`);
    }
    return;
  }
  if (process.argv.includes('--check')) {
    if (!sharp) throw new Error('--check needs sharp (npm ci at the repository root)');
    await check(sharp);
    return;
  }
  mkdirSync(join(HERE, 'png'), { recursive: true });
  const written = [];
  for (const name of Object.keys(LOCKUPS)) {
    for (const [suffix, s] of Object.entries(SCHEMES)) {
      const l = build(name, s);
      const file = `club-shape-${name}${suffix}.svg`;
      const svg = svgOf(l, s);
      writeFileSync(join(HERE, file), svg);
      written.push(file);
      if (sharp) {
        await sharp(Buffer.from(svg), { density: 72 * (2400 / l.W) }).resize({ width: 2400 }).png().toFile(join(HERE, 'png', file.replace('.svg', '.png')));
      }
    }
  }
  if (sharp) await preview(sharp);
  console.log('wrote ' + written.join(', ') + (sharp ? ', png/*.png, preview.png' : ' (no sharp: SVGs only)'));
}

// One sheet: a row per colour scheme (in SCHEMES' order), the stacked lockup on the left and the
// one-line lockup on the right, each on the background it is for.
async function preview(sharp) {
  const COL = 1000, ROW = 300, M = 70, panels = [];
  const order = Object.keys(SCHEMES);
  for (const [r, suffix] of order.entries()) {
    const s = SCHEMES[suffix];
    for (const [c, name] of Object.keys(LOCKUPS).entries()) {
      const l = build(name, s);
      const scale = Math.min((COL - 2 * M) / l.W, (ROW - 2 * M) / l.H);
      const w = Math.round(l.W * scale), h = Math.round(l.H * scale);
      const img = await sharp(Buffer.from(svgOf(l, s)), { density: 72 * scale }).resize({ width: w, height: h, fit: 'fill' }).png().toBuffer();
      const panel = await sharp({ create: { width: COL, height: ROW, channels: 4, background: s.sheet } })
        .composite([{ input: img, left: Math.round((COL - w) / 2), top: Math.round((ROW - h) / 2) }]).png().toBuffer();
      panels.push({ input: panel, left: c * COL, top: r * ROW });
    }
  }
  await sharp({ create: { width: 2 * COL, height: order.length * ROW, channels: 4, background: DARK } })
    .composite(panels).png().toFile(join(HERE, 'preview.png'));
}

// Run as a script; imported (marketing/club-shape/mark-ideas.mjs), it only lends its letters.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
