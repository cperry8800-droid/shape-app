// pulse.mjs — the Club Shape pulse mark (owner, 2026-11-03, of mark-ideas.png's D: "perfect this one
// more. Also try it in between club and shape also").
//
// The pulse is drawn in the wordmark's own construction, so it reads as part of the type:
//   - its flat runs are the face's bars (thickness TH) and its legs slabs like the A's, cut flat across
//     at the peak and the dip as the A's apex is: the bump's at the A's own section (TD), the beat's
//     steeper legs at the stems' weight (TV across the stroke), which TD would make heavy;
//   - the small first bump is a Λ at the A's own angle, and the beat's legs are steeper;
//   - the whole line leans at the face's slant (SLANT), as the letters do;
//   - the beat is teal, the line white, the pair the triangles have.
// Between CLUB and SHAPE the line runs at the letters' middle-bar height (MID) in the letters' weight,
// so it leaves the B, beats, and runs on into the S.
//
//   node marketing/club-shape/pulse.mjs   writes marketing/club-shape/pulse-preview.png
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SLANT, GLYPHS, TH, TV, TD, MID } from '../../prototypes/nora-booth/src/wordmarkGlyphs.mjs';
import { partPolygon, wind, pathOf, wordPolys, places, CAP, LOCKUP, COLORS } from './build-logo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The A's legs, upright: x runs this far per unit of height (wordmarkGlyphs' A, before the slant).
const A_SLOPE = (() => { const p = GLYPHS.A.parts[0]; return (p.x1 - p.x0) / (p.y1 - p.y0); })();

// The pulse's shape (the line at v = 0, y up, upright: the slant comes after). STACKED is in units of
// its own, scaled to the mark's height; INLINE is in caps, the line at the letters' middle bars.
export const PULSE = {
  STACKED: { lead: 0.45, bump: 0.28, run: 0.2, rise: 1.0, fall: 0.56, legSlope: 0.26, tail: 0.55 },
  INLINE: { lead: 0.55, bump: 0.3, run: 0.22, rise: 1.0, fall: 0.8, legSlope: 0.26, tail: 0.6 },
};
// lead: the line before the bump · bump: the small Λ's height, at the A's angle · run: the line from
// the bump to the beat · rise, fall: the beat above the line and the dip below it · legSlope: the
// beat's legs, upright (steeper than the A's, so the beat is sharp) · tail: the line after the beat

/** The pulse as wordmark parts: { white, teal, width } (upright, line at v = 0), strokes × k. */
export function pulseParts(k, P) {
  const th = TH * k, s = P.legSlope, sp = A_SLOPE;
  const td = TD * k, tb = TV * k * Math.hypot(1, s);                     // the bump's legs, the beat's
  const bar = (x0, x1) => ({ k: 'seg', a: [x0, 0], b: [x1, 0], t: th });
  const leg = (xa, ya, xb, yb, t = td) => ({ k: 'diag', x0: xa, y0: ya, x1: xb, y1: yb, t });
  // a leg leaving the line starts at the bar's far edge, so the two meet without a notch
  const fromLine = (x, slope, dir) => [x - slope * dir * th / 2, -dir * th / 2];
  const xb = P.lead, xbt = xb + sp * P.bump, xbe = xbt + sp * P.bump;     // the bump: foot, top, foot
  const xr = xbe + P.run, xp = xr + s * P.rise;                           // the beat: foot, peak
  const xd = xp + s * (P.rise + P.fall), xe = xd + s * P.fall;            // the dip, back on the line
  const end = xe + P.tail;
  const white = [
    bar(0, xb),
    leg(...fromLine(xb, sp, 1), xbt, P.bump), leg(xbt, P.bump, xbe + sp * th / 2, -th / 2),
    bar(xbe, xr),
    bar(xe, end),
  ];
  const teal = [
    leg(...fromLine(xr, s, 1), xp, P.rise, tb),
    leg(xp, P.rise, xd, -P.fall, tb),
    leg(xd, -P.fall, xe + s * th / 2, th / 2, tb),
  ];
  return { white, teal, width: end };
}

/** Outlines in SVG space: the line's start at x, at height `lineY` (cap units) over a baseline at y. */
function pulsePolys({ k, x, y, cap, lineY, P }) {
  const { white, teal, width } = pulseParts(k, P);
  const to = (parts) => parts.map((p) => wind(partPolygon(p).map(([u, v]) => [x + (u + SLANT * (v + lineY)) * cap, y - (v + lineY) * cap])));
  return { white: to(white), teal: to(teal), width };
}

// ── Lockups ───────────────────────────────────────────────────────────────────────────────────────
export const PULSE_LOCKUP = {
  stackedK: 1.3,      // the stacked mark's strokes (a little heavier than the letters, as a mark is)
  stackedCaps: 2.2,   // its height (rise + fall), in caps
  inlineK: 1.0,       // between the words: the letters' own weight
  inlineGap: 0.75,    //   from the B to the line, and from the line to the S, at mid-height
};

function bounds(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

// The pulse over CLUB SHAPE, centred, its dip 0.75 caps above the cap line.
export function stackedPulse(padCaps = LOCKUP.pad) {
  const pad = padCaps * CAP, L = PULSE_LOCKUP;
  const P = PULSE.STACKED, u = (L.stackedCaps * CAP) / (P.rise + P.fall);   // one pulse unit, in SVG units
  const probe = pulsePolys({ k: L.stackedK, x: 0, y: 0, cap: u, lineY: P.fall, P });
  const b = bounds([...probe.white, ...probe.teal]);
  const wordW = wordPolys('CLUB SHAPE', { x: 0, y: 0, cap: CAP }).width;
  const markTop = pad, markH = b.y1 - b.y0;
  const baseline = markTop + markH + LOCKUP.markGap * CAP + CAP;
  const mark = pulsePolys({ k: L.stackedK, x: pad + wordW / 2 - (b.x1 - b.x0) / 2 - b.x0, y: markTop - b.y0, cap: u, lineY: P.fall, P });
  return {
    W: wordW + 2 * pad, H: baseline + pad, mark,
    club: wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys,
    shape: wordPolys('SHAPE', { x: pad + places('CLUB SHAPE')[4][1] * CAP, y: baseline, cap: CAP }).polys,
  };
}

// CLUB, the pulse, SHAPE on one line: the line at the letters' middle-bar height, in caps.
export function inlinePulse(padCaps = LOCKUP.pad, k = PULSE_LOCKUP.inlineK) {
  const pad = padCaps * CAP, L = PULSE_LOCKUP, P = PULSE.INLINE;
  const clubPlaces = places('CLUB'), [, bAt] = clubPlaces[clubPlaces.length - 1];
  // B's right edge and S's left edge at mid-height are their boxes' edges, leaning by SLANT·MID, as
  // the line's ends do: so the gaps are measured box to line
  const lineStart = pad + (bAt + GLYPHS.B.w + L.inlineGap) * CAP;
  const { width } = pulseParts(k, P);
  const shapeX = lineStart + (width + L.inlineGap) * CAP;
  const probe = pulsePolys({ k, x: 0, y: 0, cap: CAP, lineY: MID, P });
  const over = Math.max(0, -bounds([...probe.white, ...probe.teal]).y0 - CAP);   // the beat over the caps
  const baseline = pad + over + CAP;
  const mark = pulsePolys({ k, x: lineStart, y: baseline, cap: CAP, lineY: MID, P });
  const shape = wordPolys('SHAPE', { x: shapeX, y: baseline, cap: CAP });
  const all = bounds([...mark.white, ...mark.teal]);
  return {
    W: shapeX + shape.width + pad, H: Math.max(baseline, all.y1) + pad, mark,
    club: wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys,
    shape: shape.polys,
  };
}

// ── The preview sheet ─────────────────────────────────────────────────────────────────────────────
const DARK = '#15110d', LIGHT = '#f2ede4';
const SCHEME = {
  dark: { word: COLORS.white, line: COLORS.white, beat: COLORS.teal },
  light: { word: COLORS.ink, line: COLORS.ink, beat: COLORS.teal },
  white: { word: COLORS.white, line: COLORS.white, beat: COLORS.white },
};
function svgOf(l, s, bg = null) {
  const f = (c, polys) => `<path fill="${c}" d="${pathOf(polys)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.W} ${l.H}">${bg ? `<rect width="${l.W}" height="${l.H}" fill="${bg}"/>` : ''}`
    + f(s.line, l.mark.white) + f(s.beat, l.mark.teal) + f(s.word, l.club) + f(s.word, l.shape) + '</svg>';
}
function iconSvg(size, s, bg) {
  const P = PULSE.STACKED, m = pulsePolys({ k: PULSE_LOCKUP.stackedK, x: 0, y: 0, cap: 100, lineY: P.fall, P });
  const b = bounds([...m.white, ...m.teal]), k = (size * 0.64) / (b.x1 - b.x0);
  const t = (polys) => polys.map((p) => p.map(([x, y]) => [(size - (b.x1 - b.x0) * k) / 2 + (x - b.x0) * k, (size - (b.y1 - b.y0) * k) / 2 + (y - b.y0) * k]));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}" fill="${bg}"/>`
    + `<path fill="${s.line}" d="${pathOf(t(m.white))}"/><path fill="${s.beat}" d="${pathOf(t(m.teal))}"/></svg>`;
}
const label = (title, sub, w, h, dark = true) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
  + `<text x="0" y="40" font-family="Inter" font-weight="600" font-size="30" fill="${dark ? '#f2ede4' : '#1a1a1a'}">${title}</text>`
  + `<text x="0" y="78" font-family="Inter" font-size="22" fill="${dark ? 'rgba(242,237,228,0.6)' : 'rgba(26,26,26,0.6)'}">${sub}</text></svg>`;

async function main() {
  const sharp = createRequire(join(HERE, '..', '..', 'package.json'))('sharp');
  const W = 1800, LABEL = 440, M = 60, tiles = [];
  let y = 0;
  const row = async (title, sub, l, s, bg, h) => {
    tiles.push({ input: await sharp({ create: { width: W, height: h, channels: 4, background: bg } }).png().toBuffer(), left: 0, top: y });
    tiles.push({ input: Buffer.from(label(title, sub, LABEL - M, 120, bg === DARK)), left: M, top: y + Math.round(h / 2) - 50 });
    const k = Math.min((W - LABEL - 2 * M) / l.W, (h - 2 * 30) / l.H);
    const img = await sharp(Buffer.from(svgOf(l, s)), { density: 72 * k }).resize({ width: Math.round(l.W * k) }).png().toBuffer();
    const im = await sharp(img).metadata();
    tiles.push({ input: img, left: LABEL + Math.round((W - LABEL - im.width) / 2), top: y + Math.round((h - im.height) / 2) });
    y += h;
  };
  await row('Stacked', 'The beat over the name', stackedPulse(), SCHEME.dark, DARK, 380);
  await row('Stacked', 'On light', stackedPulse(), SCHEME.light, LIGHT, 380);
  await row('One line', 'In the letters’ own weight', inlinePulse(), SCHEME.dark, DARK, 260);
  await row('One line', 'On light', inlinePulse(), SCHEME.light, LIGHT, 260);
  await row('One line, bolder', 'The pulse a touch heavier', inlinePulse(LOCKUP.pad, 1.5), SCHEME.dark, DARK, 260);
  // the icons: dark, a teal tile (all white), a white tile
  tiles.push({ input: await sharp({ create: { width: W, height: 360, channels: 4, background: DARK } }).png().toBuffer(), left: 0, top: y });
  tiles.push({ input: Buffer.from(label('App icon', 'Dark · teal tile · white tile', LABEL - M, 120)), left: M, top: y + 130 });
  const icons = [[SCHEME.dark, '#0b0907'], [SCHEME.white, COLORS.teal], [SCHEME.light, '#FFFFFF']];
  for (const [i, [s, bg]] of icons.entries()) {
    tiles.push({ input: await sharp(Buffer.from(iconSvg(240, s, bg))).png().toBuffer(), left: LABEL + 80 + i * 330, top: y + 60 });
  }
  y += 360;
  await sharp({ create: { width: W, height: y, channels: 4, background: DARK } }).composite(tiles).png().toFile(join(HERE, 'pulse-preview.png'));
  console.log('wrote marketing/club-shape/pulse-preview.png');
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
