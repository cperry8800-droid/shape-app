// mark-ideas.mjs — other marks for Club Shape, to set beside the two triangles (owner, 2026-11-03:
// "any ideas of other options other than the triangles that could be cool different shape?").
//
// Each idea keeps what makes the current mark Shape's: the wordmark's slant (SLANT), its strokes, and
// the teal-and-white pair. Each is shown over CLUB SHAPE in the approved stacked lockup (the mark's
// height 2.4 caps, 0.75 caps above the word) and alone as an app icon.
//
//   node marketing/club-shape/mark-ideas.mjs   writes marketing/club-shape/mark-ideas.png
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SLANT, GLYPHS, TH, TV, TD } from '../../prototypes/nora-booth/src/wordmarkGlyphs.mjs';
import { MARK_PNG } from '../../prototypes/nora-booth/src/screenArt.mjs';
import { partPolygon, wind, pathOf, wordPolys, places, CAP, LOCKUP, COLORS } from './build-logo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MH = LOCKUP.markCaps * CAP;   // every mark fits a 240-unit band, the approved mark's height

// ── Shapes (mark units, y down) ───────────────────────────────────────────────────────────────────
const circle = (cx, cy, r, n = 96) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
// a ring's half between angles a0 and a0 + π (maths angles, y up), as one polygon
function halfRing(cx, cy, r0, r1, a0, n = 64) {
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (Math.PI * i) / n;
    out.push([cx + r1 * Math.cos(a), cy - r1 * Math.sin(a)]);
    inn.push([cx + r0 * Math.cos(a), cy - r0 * Math.sin(a)]);
  }
  return [...out, ...inn.reverse()];
}
// a stroked polyline: a quad per leg and a disc at each joint (round joins), flat ends
function stroke(pts, t) {
  const polys = [];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (-(b[1] - a[1]) / L) * t / 2, ny = ((b[0] - a[0]) / L) * t / 2;
    polys.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
    if (i < pts.length - 1) polys.push(circle(b[0], b[1], t / 2, 32));
  }
  return polys;
}
// a glyph's strokes, thickened by k, at cap height `cap`, its baseline at y = cap (y down, sheared)
function glyphPolys(parts, cap, k) {
  return parts.map((p) => {
    const q = p.k === 'arc' ? { ...p, t0: p.t0 * k, t1: p.t1 * k } : { ...p, t: p.t * k };
    return partPolygon(q).map(([u, v]) => [(u + SLANT * v) * cap, (1 - v) * cap]);
  });
}

// ── The ideas: { name, line, layers: [[role, polys]] }, roles teal / white / dim ──────────────────
const IDEAS = [];

// The current mark, for reference: the brand art's two triangles.
IDEAS.push({
  name: 'Today · the split triangles',
  line: ['The mark Shape has now.'],
  layers: (() => {
    const { box, cap } = MARK_PNG, k = MH / ((box.y1 - box.y0) / cap) / cap;
    const rel = (pts) => pts.map(([x, y]) => [(x - box.x0) * k, (y - box.y0) * k]);
    return [['teal', [rel(MARK_PNG.teal)]], ['white', [rel(MARK_PNG.white)]]];
  })(),
});

// A · A record split on the wordmark's slant, teal on the left and white on the right. Cut apart along
// the slant only: offset up and down as the triangles are, the halves' centre hole no longer lines up.
IDEAS.push({
  name: 'A · Split record',
  line: ['A vinyl cut on the logo’s slant:', 'the radio and the club in one.'],
  layers: (() => {
    const R = 112, r = 18, cx = 120, cy = 120, gap = 9, drop = 0;
    const phi = Math.atan2(1, SLANT);                       // the slant's direction, from the x axis
    const nx = Math.sin(phi), ny = Math.cos(phi);           // its normal, pointing right (y down)
    const move = (poly, s, dy) => poly.map(([x, y]) => [x + s * nx * gap, y + s * ny * gap + dy]);
    return [
      ['teal', [move(halfRing(cx, cy, r, R, phi), -1, drop)]],
      ['white', [move(halfRing(cx, cy, r, R, phi - Math.PI), 1, -drop)]],
    ];
  })(),
});

// B · A level meter: five bars on the slant, the tallest in teal. Sound, and a climb.
IDEAS.push({
  name: 'B · Level meter',
  line: ['Five bars on the slant, peaking', 'in teal: the beat and the climb.'],
  layers: (() => {
    const w = 26, gap = 17, heights = [96, 168, 124, 240, 152], white = [], teal = [];
    heights.forEach((h, i) => {
      const x = i * (w + gap), d = SLANT * h;
      const bar = [[x, MH], [x + w, MH], [x + w + d, MH - h], [x + d, MH - h]];
      (h === MH ? teal : white).push(bar);
    });
    return [['white', white], ['teal', teal]];
  })(),
});

// C · The wordmark's own S, thickened, split through its middle bar into two hooks that turn about
// each other, as the triangles do: the upper one teal, the lower one white.
IDEAS.push({
  name: 'C · Split S',
  line: ['The wordmark’s own S, split', 'into two hooks that face each other.'],
  layers: (() => {
    const parts = GLYPHS.S.parts, mid = parts.findIndex((p) => p.k === 'seg' && Math.abs(p.a[1] - p.b[1]) < 1e-9 && p.a[1] > 0.3 && p.a[1] < 0.7);
    const m = parts[mid], xm = (m.a[0] + m.b[0]) / 2, g = 0.035;
    const left = { ...m, a: m.a[0] < m.b[0] ? m.a : m.b, b: [xm - g, m.a[1]] };
    const right = { ...m, a: [xm + g, m.a[1]], b: m.a[0] < m.b[0] ? m.b : m.a };
    const upper = [...parts.slice(0, mid), left], lower = [right, ...parts.slice(mid + 1)];
    const cap = 200, k = 2.0;
    return [['teal', glyphPolys(upper, cap, k)], ['white', glyphPolys(lower, cap, k)]];
  })(),
});

// D · A heartbeat whose spike is a beat: health and the music, the spike in teal.
IDEAS.push({
  name: 'D · Pulse',
  line: ['A heartbeat that turns into a', 'beat: health and music, one line.'],
  layers: (() => {
    const t = 18, y0 = 150;
    const pts = [[0, y0], [70, y0], [92, 118], [114, y0], [142, y0], [180, 12], [218, 228], [246, y0], [320, y0]];
    return [['white', [...stroke(pts.slice(0, 5), t), ...stroke(pts.slice(7), t)]], ['teal', stroke(pts.slice(4, 8), t)]];
  })(),
});

// E · The wordmark's Λ (its A has no crossbar) as a peak, with a teal sun: the climb the homepage
// draws, and the letter SHAPE already carries.
IDEAS.push({
  name: 'E · Summit',
  line: ['The wordmark’s Λ as a peak with', 'a teal sun: the climb, in its letter.'],
  layers: (() => {
    const cap = 200, k = 2.1, peak = glyphPolys(GLYPHS.A.parts, cap, k);
    const ax = (GLYPHS.A.parts[0].x1 + SLANT * 1) * cap;
    return [['white', peak.map((p) => p.map(([x, y]) => [x, y + (MH - cap)]))], ['teal', [circle(ax + 150, 46, 28)]]];
  })(),
});

// F · An S lit on a dot grid, the way the club's stage screen draws letters; the top row in teal, the
// unlit dots of the grid left faint.
IDEAS.push({
  name: 'F · LED S',
  line: ['An S lit on the stage screen’s', 'dot grid, the top row in teal.'],
  layers: (() => {
    const S = ['.XXXX', 'X....', '.XXX.', '....X', 'XXXX.'];
    const pitch = 50, r = 17, white = [], teal = [], dim = [];
    S.forEach((row, j) => [...row].forEach((c, i) => {
      const up = (S.length - 1 - j) * pitch;               // the slant, row by row
      const dot = circle(r + i * pitch + SLANT * up, r + j * pitch + (MH - (S.length - 1) * pitch - 2 * r) / 2, r, 48);
      (c === '.' ? dim : j === 0 ? teal : white).push(dot);
    }));
    return [['dim', dim], ['white', white], ['teal', teal]];
  })(),
});

// ── Placing a mark ────────────────────────────────────────────────────────────────────────────────
function bbox(layers) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [, polys] of layers) for (const p of polys) for (const [x, y] of p) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}
const place = (layers, b, k, dx, dy) => layers.map(([role, polys]) => [role, polys.map((p) => wind(p.map(([x, y]) => [dx + (x - b.x0) * k, dy + (y - b.y0) * k])))]);

const ROLE = { teal: COLORS.teal, white: COLORS.white, dim: 'rgba(255,255,255,0.07)' };
const paths = (layers) => layers.map(([role, polys]) => `<path fill="${ROLE[role]}" d="${pathOf(polys)}"/>`).join('');

// The approved stacked lockup with this mark: as tall as it is (at most 2.4 caps), centred on the word.
function lockupSvg(idea) {
  const pad = LOCKUP.pad * CAP, b = bbox(idea.layers), k = Math.min(1, MH / b.h);
  const wordW = wordPolys('CLUB SHAPE', { x: 0, y: 0, cap: CAP }).width;
  const shapeAt = places('CLUB SHAPE')[4][1] * CAP;
  const mh = b.h * k, baseline = pad + mh + LOCKUP.markGap * CAP + CAP;
  const W = wordW + 2 * pad, H = baseline + pad;
  const mark = place(idea.layers, b, k, pad + wordW / 2 - (b.w * k) / 2, pad);
  return {
    W, H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${paths(mark)}`
      + `<path fill="${COLORS.white}" d="${pathOf(wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys)}"/>`
      + `<path fill="${COLORS.white}" d="${pathOf(wordPolys('SHAPE', { x: pad + shapeAt, y: baseline, cap: CAP }).polys)}"/></svg>`,
  };
}

// The mark alone on an app icon: a rounded square, the mark filling about 60% of it.
function iconSvg(idea, size) {
  const b = bbox(idea.layers), k = (size * 0.6) / Math.max(b.w, b.h);
  const mark = place(idea.layers, b, k, (size - b.w * k) / 2, (size - b.h * k) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}" fill="#0b0907" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>${paths(mark)}</svg>`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function labelSvg(idea, w, h) {
  const lines = idea.line.map((l, i) => `<text x="0" y="${118 + i * 32}" font-family="Inter" font-size="23" fill="rgba(242,237,228,0.62)">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="78" font-family="Inter" font-weight="600" font-size="32" fill="#f2ede4">${esc(idea.name)}</text>${lines}</svg>`;
}

async function main() {
  const sharp = createRequire(join(HERE, '..', '..', 'package.json'))('sharp');
  const LABEL = 470, LOCK = 1000, ICON = 330, ROW = 330, M = 50, BG = '#15110d';
  const tiles = [];
  for (const [r, idea] of IDEAS.entries()) {
    const top = r * ROW;
    tiles.push({ input: Buffer.from(labelSvg(idea, LABEL - M, ROW - 40)), left: M, top: top + 40 });
    const l = lockupSvg(idea), k = Math.min((LOCK - 2 * M) / l.W, (ROW - 2 * M) / l.H);
    const lock = await sharp(Buffer.from(l.svg), { density: 72 * k }).resize({ width: Math.round(l.W * k) }).png().toBuffer();
    const lm = await sharp(lock).metadata();
    tiles.push({ input: lock, left: LABEL + Math.round((LOCK - lm.width) / 2), top: top + Math.round((ROW - lm.height) / 2) });
    const icon = await sharp(Buffer.from(iconSvg(idea, 230))).png().toBuffer();
    tiles.push({ input: icon, left: LABEL + LOCK + Math.round((ICON - 230) / 2), top: top + 50 });
  }
  const W = LABEL + LOCK + ICON, H = IDEAS.length * ROW;
  const rules = Array.from({ length: IDEAS.length - 1 }, (_, i) => `<rect x="${M}" y="${(i + 1) * ROW}" width="${W - 2 * M}" height="1" fill="rgba(242,237,228,0.1)"/>`).join('');
  tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rules}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } }).composite(tiles).png().toFile(join(HERE, 'mark-ideas.png'));
  console.log('wrote marketing/club-shape/mark-ideas.png (' + IDEAS.length + ' marks)');
}

main().catch((e) => { console.error(e); process.exit(1); });
