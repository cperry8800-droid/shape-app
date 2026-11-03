// markset.mjs — a Club Shape mark's whole set: the one-line lockup (CLUB, the mark, SHAPE), the stacked
// one (the mark over CLUB SHAPE), each in build-logo's seven colour versions, the app icons, PNGs of
// each, and a preview sheet. soundwave.mjs and trianglebeat.mjs draw a mark; this sets it.
//
// A mark is { white, teal }: outlines in upright caps, its line at v = 0 (y up). It is leaned at the
// face's slant here, about the letters' baseline, as the letters are.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SLANT, GLYPHS, MID } from '../../prototypes/nora-booth/src/wordmarkGlyphs.mjs';
import { wind, pathOf, wordPolys, places, CAP, LOCKUP, COLORS, SCHEMES, svgOf, DARK } from './build-logo.mjs';
import { PULSE_LOCKUP } from './pulse.mjs';

// upright caps → SVG: leaned at the slant about the letters' baseline, `lineY` caps up from it
export function place(g, { x, y, cap, lineY }) {
  const to = ([u, v]) => [x + (u + SLANT * (v + lineY)) * cap, y - (v + lineY) * cap];
  return { white: g.white.map((p) => wind(p.map(to))), teal: g.teal.map((p) => wind(p.map(to))) };
}
export function bounds(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of list) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export const ink = (m) => bounds([...m.white, ...m.teal]);

// CLUB, the mark, SHAPE: the mark's line at the letters' middle bars, a gap each side as the pulse has.
export function horizontal(g, padCaps = LOCKUP.pad) {
  const pad = padCaps * CAP, gap = PULSE_LOCKUP.inlineGap;
  const [, bAt] = places('CLUB').at(-1);
  const lineStart = pad + (bAt + GLYPHS.B.w + gap) * CAP;
  const probe = ink(place(g, { x: 0, y: 0, cap: CAP, lineY: MID }));
  const over = Math.max(0, -probe.y0 - CAP), baseline = pad + over + CAP;
  // the mark's ink starts where its line would at mid-height (a foot below the line leans less)
  const mark = place(g, { x: lineStart - (probe.x0 - SLANT * MID * CAP), y: baseline, cap: CAP, lineY: MID });
  const shapeX = lineStart + probe.w + gap * CAP;
  const shape = wordPolys('SHAPE', { x: shapeX, y: baseline, cap: CAP });
  return {
    W: shapeX + shape.width + pad, H: Math.max(baseline, ink(mark).y1) + pad, mark,
    club: wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys, shape: shape.polys,
  };
}

// The mark over CLUB SHAPE, `caps` tall, its foot 0.75 caps above the cap line, centred on the word.
export function stacked(g, caps, padCaps = LOCKUP.pad) {
  const pad = padCaps * CAP;
  const unit = ink(place(g, { x: 0, y: 0, cap: 1, lineY: 0 }));
  const cap = (caps * CAP) / unit.h;
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

// The app icon: the mark filling `fill` of a square tile's width, square and full-bleed as the stores
// want it (they round the corners; `rounded` is for the preview only).
export const ICONS = {
  dark: { bg: '#0b0907', white: COLORS.white, teal: COLORS.teal },
  teal: { bg: COLORS.teal, white: COLORS.white, teal: COLORS.white },
  white: { bg: '#FFFFFF', white: COLORS.ink, teal: COLORS.teal },
};
export function iconSvg(g, size, c, { rounded = false, fill = 0.68 } = {}) {
  const u = ink(place(g, { x: 0, y: 0, cap: 1, lineY: 0 }));
  const cap = (size * fill) / u.w, m0 = ink(place(g, { x: 0, y: 0, cap, lineY: 0 }));
  const m = place(g, { x: (size - m0.w) / 2 - m0.x0, y: (size - m0.h) / 2 - m0.y0, cap, lineY: 0 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Club Shape">`
    + `<rect width="${size}" height="${size}"${rounded ? ` rx="${size * 0.225}"` : ''} fill="${c.bg}"/>`
    + `<path fill="${c.white}" d="${pathOf(m.white)}"/><path fill="${c.teal}" d="${pathOf(m.teal)}"/></svg>\n`;
}

/**
 * Write a mark's set to `dir`: `${prefix}-{horizontal,stacked}${suffix}.svg` for each colour version,
 * `${prefix}-icon-{dark,teal,white}.svg`, a PNG of each in png/, and preview.png, which opens with
 * `compare` ([title, sub, mark] rows, one line on dark) before every version and the icons.
 */
export async function writeSet(sharp, { dir, prefix, mark, icon, stackedCaps, iconFill, compare = [] }) {
  mkdirSync(join(dir, 'png'), { recursive: true });
  const LOCKUPS = { horizontal: (pad) => horizontal(mark, pad), stacked: (pad) => stacked(mark, stackedCaps, pad) };
  const build = (name, s) => LOCKUPS[name](s.bg ? LOCKUP.tilePad : LOCKUP.pad);
  const written = [];
  for (const name of Object.keys(LOCKUPS)) {
    for (const [suffix, s] of Object.entries(SCHEMES)) {
      const l = build(name, s), file = `${prefix}-${name}${suffix}.svg`, svg = svgOf(l, s);
      writeFileSync(join(dir, file), svg);
      await sharp(Buffer.from(svg), { density: 72 * (2400 / l.W) }).resize({ width: 2400 }).png().toFile(join(dir, 'png', file.replace('.svg', '.png')));
      written.push(file);
    }
  }
  for (const [name, c] of Object.entries(ICONS)) {
    const file = `${prefix}-icon-${name}.svg`, svg = iconSvg(icon, 1024, c, { fill: iconFill });
    writeFileSync(join(dir, file), svg);
    await sharp(Buffer.from(svg)).png().toFile(join(dir, 'png', file.replace('.svg', '.png')));
    written.push(file);
  }

  // the preview
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
  for (const [title, sub, g] of compare) {
    const LABEL = 520;
    await panel(DARK, W, 250, await fit(horizontal(g, LOCKUP.pad), SCHEMES[''], W - LABEL - 2 * M, 170), 0, y, LABEL);
    tiles.push({ input: text(title, sub, LABEL - M), left: M, top: y + 70 });
    y += 250;
  }
  if (compare.length) y += 20;
  const COL = W / 2, ROW = 300;
  for (const s of Object.values(SCHEMES)) {
    for (const [c, name] of Object.keys(LOCKUPS).entries()) {
      await panel(s.sheet, COL, ROW, await fit(build(name, s), s, COL - 2 * M, ROW - 2 * M), c * COL, y);
    }
    y += ROW;
  }
  tiles.push({ input: await sharp({ create: { width: W, height: 380, channels: 4, background: DARK } }).png().toBuffer(), left: 0, top: y });
  tiles.push({ input: text('App icon', 'Dark · teal tile · white tile', 460), left: M, top: y + 135 });
  for (const [i, c] of Object.values(ICONS).entries()) {
    tiles.push({ input: await sharp(Buffer.from(iconSvg(icon, 280, c, { rounded: true, fill: iconFill }))).png().toBuffer(), left: 560 + i * 380, top: y + 50 });
  }
  y += 380;
  await sharp({ create: { width: W, height: y, channels: 4, background: DARK } }).composite(tiles).png().toFile(join(dir, 'preview.png'));
  return written;
}
