// soundwave.mjs — the Club Shape soundwave mark: the pulse drawn as audio bars (pulse-looks.png's D,
// owner 2026-11-03: "i like this", then "lets perfect it").
//
// Perfected from the sketch in three ways:
//   - mirrored about the line, so the beat clears the letters by the same amount above the cap line
//     and below the baseline (the line runs at the letters' middle-bar height, MID);
//   - the quiet bars are exactly the letters' bar thickness (TH), so the quiet stretch reads as a line
//     in the letters' own pen, not dashes of three lengths;
//   - the loud bars climb and fall in an even rhythm (a small bump, then the beat), the three loudest in
//     teal. Every bar is a stem's width (TV), leaning at the face's slant.
//
//   node marketing/club-shape/soundwave.mjs   writes marketing/club-shape/wave/: the one-line and
//                                             stacked lockups in every colour, the app icons, preview.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SLANT, GLYPHS, TH, TV, MID } from '../../prototypes/nora-booth/src/wordmarkGlyphs.mjs';
import { wind, pathOf, wordPolys, places, CAP, LOCKUP, COLORS, SCHEMES, svgOf, DARK, LIGHT } from './build-logo.mjs';
import { PULSE_LOCKUP } from './pulse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'wave');
const Q = TH / 2;   // a quiet bar's half-height: the letters' bar thickness in all

// Each bar's reach above the line and below it, in caps, left to right.
export const WAVE = {
  bars: [Q, Q, 0.13, Q, Q, 0.1, 0.4, 0.8, 0.52, 0.2, 0.09, Q, Q].map((a) => [a, a]),
  width: TV,          // a bar: a stem's width
  gap: 0.085,         // between bars
  loud: 0.4,          // a bar this loud or louder is the beat, in teal
};
// The sketch the owner picked, for the before-and-after row: three heights of quiet bar, the reach
// below the line 0.8 of the reach above it.
const SKETCH = { ...WAVE, bars: [0.05, 0.07, 0.14, 0.07, 0.05, 0.1, 0.42, 0.8, 0.5, 0.18, 0.08, 0.05, 0.05].map((a) => [a, a * 0.8]) };

/** The bars as outlines, upright caps (the line at v = 0): { white, teal }. */
function bars(spec = WAVE, from = 0, to = spec.bars.length) {
  const white = [], teal = [];
  spec.bars.slice(from, to).forEach(([up, down], i) => {
    const x = i * (spec.width + spec.gap);
    (up >= spec.loud ? teal : white).push([[x, -down], [x + spec.width, -down], [x + spec.width, up], [x, up]]);
  });
  return { white, teal };
}
// upright caps → SVG: leaned at the slant about the letters' baseline, `lineY` caps up from it
function place(g, { x, y, cap, lineY }) {
  const to = ([u, v]) => [x + (u + SLANT * (v + lineY)) * cap, y - (v + lineY) * cap];
  return { white: g.white.map((p) => wind(p.map(to))), teal: g.teal.map((p) => wind(p.map(to))) };
}
function bounds(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of list) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
const ink = (m) => bounds([...m.white, ...m.teal]);

// ── Lockups ───────────────────────────────────────────────────────────────────────────────────────
// CLUB, the wave, SHAPE: the wave's middle at the letters' middle bars, a gap each side as the pulse has.
export function horizontal(padCaps = LOCKUP.pad, spec = WAVE) {
  const pad = padCaps * CAP, gap = PULSE_LOCKUP.inlineGap;
  const [, bAt] = places('CLUB').at(-1);
  const lineStart = pad + (bAt + GLYPHS.B.w + gap) * CAP;
  const g = bars(spec), probe = ink(place(g, { x: 0, y: 0, cap: CAP, lineY: MID }));
  const over = Math.max(0, -probe.y0 - CAP), baseline = pad + over + CAP;
  // the wave's ink starts where the line would at mid-height (its first bar's foot leans less)
  const mark = place(g, { x: lineStart - (probe.x0 - SLANT * MID * CAP), y: baseline, cap: CAP, lineY: MID });
  const shapeX = lineStart + probe.w + gap * CAP;
  const shape = wordPolys('SHAPE', { x: shapeX, y: baseline, cap: CAP });
  return {
    W: shapeX + shape.width + pad, H: Math.max(baseline, ink(mark).y1) + pad, mark,
    club: wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys, shape: shape.polys,
  };
}

// The wave over CLUB SHAPE: 2.6 caps tall (a touch over the triangles' 2.4: its quiet bars carry less
// weight), its bars a mark's weight, its foot 0.75 caps above the cap line, centred on the word.
export const STACKED_CAPS = 2.6;
export function stacked(padCaps = LOCKUP.pad, spec = WAVE) {
  const pad = padCaps * CAP, g = bars(spec);
  const unit = ink(place(g, { x: 0, y: 0, cap: 1, lineY: 0 }));
  const cap = (STACKED_CAPS * CAP) / unit.h;
  const probe = ink(place(g, { x: 0, y: 0, cap, lineY: 0 }));
  const wordW = wordPolys('CLUB SHAPE', { x: 0, y: 0, cap: CAP }).width;
  const baseline = pad + probe.h + LOCKUP.markGap * CAP + CAP;
  const mark = place(g, { x: pad + wordW / 2 - probe.w / 2 - probe.x0, y: pad - probe.y0, cap, lineY: 0 });
  return {
    W: wordW + 2 * pad, H: baseline + pad, mark,
    club: wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys,
    shape: wordPolys('SHAPE', { x: pad + places('CLUB SHAPE')[4][1] * CAP, y: baseline, cap: CAP }).polys,
  };
}

// The app icon: the wave's middle nine bars (the bump through the beat), filling 68% of a square tile.
// Square and full-bleed, as the stores want it (they round the corners).
export const ICONS = {
  dark: { bg: '#0b0907', white: COLORS.white, teal: COLORS.teal },
  teal: { bg: COLORS.teal, white: COLORS.white, teal: COLORS.white },
  white: { bg: '#FFFFFF', white: COLORS.ink, teal: COLORS.teal },
};
export function iconSvg(size, c, { rounded = false } = {}) {
  const g = bars(WAVE, 2, 11), u = ink(place(g, { x: 0, y: 0, cap: 1, lineY: 0 }));
  const cap = (size * 0.68) / u.w, m0 = ink(place(g, { x: 0, y: 0, cap, lineY: 0 }));
  const m = place(g, { x: (size - m0.w) / 2 - m0.x0, y: (size - m0.h) / 2 - m0.y0, cap, lineY: 0 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Club Shape">`
    + `<rect width="${size}" height="${size}"${rounded ? ` rx="${size * 0.225}"` : ''} fill="${c.bg}"/>`
    + `<path fill="${c.white}" d="${pathOf(m.white)}"/><path fill="${c.teal}" d="${pathOf(m.teal)}"/></svg>\n`;
}

// ── Files and the preview ─────────────────────────────────────────────────────────────────────────
const LOCKUPS = { horizontal, stacked };
const build = (name, s, spec = WAVE) => LOCKUPS[name](s.bg ? LOCKUP.tilePad : LOCKUP.pad, spec);

async function main() {
  const sharp = createRequire(join(HERE, '..', '..', 'package.json'))('sharp');
  mkdirSync(join(OUT, 'png'), { recursive: true });
  const written = [];
  for (const name of Object.keys(LOCKUPS)) {
    for (const [suffix, s] of Object.entries(SCHEMES)) {
      const l = build(name, s), file = `club-shape-wave-${name}${suffix}.svg`, svg = svgOf(l, s);
      writeFileSync(join(OUT, file), svg);
      await sharp(Buffer.from(svg), { density: 72 * (2400 / l.W) }).resize({ width: 2400 }).png().toFile(join(OUT, 'png', file.replace('.svg', '.png')));
      written.push(file);
    }
  }
  for (const [name, c] of Object.entries(ICONS)) {
    const file = `club-shape-wave-icon-${name}.svg`, svg = iconSvg(1024, c);
    writeFileSync(join(OUT, file), svg);
    await sharp(Buffer.from(svg)).png().toFile(join(OUT, 'png', file.replace('.svg', '.png')));
    written.push(file);
  }
  await preview(sharp);
  console.log(`wrote ${written.length} SVGs and PNGs to marketing/club-shape/wave/, and wave/preview.png`);
}

async function preview(sharp) {
  const W = 2000, M = 60, tiles = [];
  let y = 0;
  const text = (t, sub, w, dark = true) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="110">`
    + `<text x="0" y="38" font-family="Inter" font-weight="600" font-size="30" fill="${dark ? '#f2ede4' : '#1a1a1a'}">${t}</text>`
    + `<text x="0" y="76" font-family="Inter" font-size="22" fill="${dark ? 'rgba(242,237,228,0.6)' : 'rgba(26,26,26,0.6)'}">${sub}</text></svg>`);
  const fit = async (l, s, w, h) => {
    const k = Math.min(w / l.W, h / l.H);
    return sharp(Buffer.from(svgOf(l, s)), { density: 72 * k }).resize({ width: Math.round(l.W * k) }).png().toBuffer();
  };
  const panel = async (bg, w, h, img, left, top, inset = 0) => {   // the image centred right of `inset`
    tiles.push({ input: await sharp({ create: { width: w, height: h, channels: 4, background: bg } }).png().toBuffer(), left, top });
    const im = await sharp(img).metadata();
    tiles.push({ input: img, left: left + inset + Math.round((w - inset - im.width) / 2), top: top + Math.round((h - im.height) / 2) });
  };
  // before and after, one line, on dark
  for (const [title, sub, spec] of [['Before', 'The sketch you picked', SKETCH], ['Perfected', 'Mirrored, even quiet bars, a cleaner beat', WAVE]]) {
    const LABEL = 520;
    await panel(DARK, W, 250, await fit(horizontal(LOCKUP.pad, spec), SCHEMES[''], W - LABEL - 2 * M, 170), 0, y, LABEL);
    tiles.push({ input: text(title, sub, LABEL - M), left: M, top: y + 70 });
    y += 250;
  }
  y += 20;
  // every colour version: one line on the left, stacked on the right
  const COL = W / 2, ROW = 300;
  for (const s of Object.values(SCHEMES)) {
    for (const [c, name] of Object.keys(LOCKUPS).entries()) {
      await panel(s.sheet, COL, ROW, await fit(build(name, s), s, COL - 2 * M, ROW - 2 * M), c * COL, y);
    }
    y += ROW;
  }
  // the app icons
  tiles.push({ input: await sharp({ create: { width: W, height: 380, channels: 4, background: DARK } }).png().toBuffer(), left: 0, top: y });
  tiles.push({ input: text('App icon', 'Dark · teal tile · white tile', 460), left: M, top: y + 135 });
  for (const [i, c] of Object.values(ICONS).entries()) {
    tiles.push({ input: await sharp(Buffer.from(iconSvg(280, c, { rounded: true }))).png().toBuffer(), left: 560 + i * 380, top: y + 50 });
  }
  y += 380;
  await sharp({ create: { width: W, height: y, channels: 4, background: DARK } }).composite(tiles).png().toFile(join(OUT, 'preview.png'));
}

main().catch((e) => { console.error(e); process.exit(1); });
