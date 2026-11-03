// pulse-looks.mjs — other looks for the Club Shape pulse (owner, 2026-11-03: "also any other looks for
// the pulse"), each between CLUB and SHAPE as pulse.mjs sets the line (at the letters' middle-bar height,
// in their weight) and alone as an app icon.
//
// Every look is drawn the way the pulse is: in caps, upright, the line at v = 0, then leaned at the
// face's slant. A stroked look uses the face's own weights: its flat runs are bars (TH), its slopes
// slabs TV thick across the stroke, cut flat where two slopes meet, as the A's apex is.
//
//   node marketing/club-shape/pulse-looks.mjs   writes marketing/club-shape/pulse-looks.png
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { SLANT, GLYPHS, TH, TV, MID } from '../../prototypes/nora-booth/src/wordmarkGlyphs.mjs';
import { partPolygon, wind, pathOf, wordPolys, places, CAP, LOCKUP, COLORS } from './build-logo.mjs';
import { PULSE, PULSE_LOCKUP } from './pulse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const A_SLOPE = (() => { const p = GLYPHS.A.parts[0]; return (p.x1 - p.x0) / (p.y1 - p.y0); })();
const P = PULSE.INLINE;

// ── A stroked polyline in the face's construction ─────────────────────────────────────────────────
// pts: [x, y] (upright, caps); teal(i): whether leg i is the beat. Returns { white, teal } parts.
function strokeParts(pts, teal, k = 1) {
  const th = TH * k, out = { white: [], teal: [] };
  const flat = (i) => i < 0 || i >= pts.length - 1 || Math.abs(pts[i + 1][1] - pts[i][1]) < 1e-9;
  for (let i = 0; i < pts.length - 1; i++) {
    let [a, b] = [pts[i], pts[i + 1]];
    const into = teal(i) ? out.teal : out.white;
    if (flat(i)) { into.push({ k: 'seg', a, b, t: th }); continue; }
    const s = (b[0] - a[0]) / (b[1] - a[1]);
    // where a slope meets a flat run (or ends), carry it on through the bar's half-thickness
    const ext = (p, q) => { const dir = Math.sign(p[1] - q[1]); return [p[0] + s * dir * th / 2, p[1] + dir * th / 2]; };
    if (flat(i - 1)) a = ext(a, b);
    if (flat(i + 1)) b = ext(b, a);
    into.push({ k: 'diag', x0: a[0], y0: a[1], x1: b[0], y1: b[1], t: TV * k * Math.hypot(1, s) });
  }
  return out;
}
const polys = (parts) => parts.map(partPolygon);

// The pulse as pulse.mjs draws it, as points: lead, bump, run, beat, tail; the beat's legs are 4–6.
function pulsePoints(L0 = 0, L1 = 0, { bump = true, beats = [[P.rise, P.fall]] } = {}) {
  const pts = [[0, L0], [P.lead, L0]];
  let x = P.lead;
  if (bump) { pts.push([x + A_SLOPE * P.bump, L0 + P.bump], [x + 2 * A_SLOPE * P.bump, L0]); x += 2 * A_SLOPE * P.bump; }
  const beatLegs = [];
  beats.forEach(([rise, fall], j) => {
    const base = j === beats.length - 1 ? L1 : L0, s = P.legSlope;
    x += P.run; pts.push([x, L0]);
    const i0 = pts.length - 1;
    x += s * rise; pts.push([x, L0 + rise]);
    x += s * (L0 + rise + fall); pts.push([x, -fall]);
    x += s * (base + fall); pts.push([x, base]);
    beatLegs.push([i0, i0 + 1, i0 + 2, j]);
  });
  pts.push([x + P.tail, L1]);
  return { pts, beatLegs };
}

// ── The looks: each returns { white, teal, dim } outline lists (upright caps, line at v = 0) ──────
export const LOOKS = [
  {
    name: 'Line', line: ['The pulse as it stands: a teal', 'beat on a white line.'],
    draw: (k) => { const { pts, beatLegs } = pulsePoints(); const b = new Set(beatLegs.flat().slice(0, 3));
      const s = strokeParts(pts, (i) => b.has(i), k); return { white: polys(s.white), teal: polys(s.teal) }; },
  },
  {
    name: 'Climb', line: ['The line leaves the beat higher', 'than it came in: every beat lifts you.'],
    draw: (k) => { const { pts, beatLegs } = pulsePoints(-0.15, 0.15); const b = new Set(beatLegs[0].slice(0, 3));
      const s = strokeParts(pts, (i) => b.has(i), k); return { white: polys(s.white), teal: polys(s.teal) }; },
  },
  {
    name: 'Double beat', line: ['Ba-dum: a small white beat,', 'then the teal one. The rhythm.'],
    draw: (k) => { const { pts, beatLegs } = pulsePoints(0, 0, { bump: false, beats: [[0.46, 0.32], [P.rise, P.fall]] });
      const b = new Set(beatLegs[1].slice(0, 3)); const s = strokeParts(pts, (i) => b.has(i), k);
      return { white: polys(s.white), teal: polys(s.teal) }; },
  },
  {
    name: 'Triangle beat', line: ['The beat as two solid triangles,', 'teal up, white down: today’s mark inside.'],
    draw: (k) => {
      const lead = P.lead + 2 * A_SLOPE * P.bump + P.run, w = 0.46;
      const end = lead + 2 * w + P.tail;
      const line = strokeParts([[0, 0], [P.lead, 0], [P.lead + A_SLOPE * P.bump, P.bump], [P.lead + 2 * A_SLOPE * P.bump, 0], [end, 0]], () => false, k);
      const up = [[lead, 0], [lead + w, 0], [lead + w / 2, P.rise]];
      const down = [[lead + w, 0], [lead + 2 * w, 0], [lead + 1.5 * w, -P.fall]];
      return { white: [...polys(line.white), down], teal: [up] };
    },
  },
  {
    name: 'Soundwave', line: ['The beat as audio bars on the slant,', 'the loudest in teal: heart and music.'],
    draw: (k) => {
      const amps = [0.05, 0.07, 0.14, 0.07, 0.05, 0.1, 0.42, 0.8, 0.5, 0.18, 0.08, 0.05, 0.05];
      const bw = TV * k, gap = 0.085 + TV * (k - 1) * 0.5, white = [], teal = [];
      amps.forEach((a, i) => {
        const x = i * (bw + gap), lo = -a * (P.fall / P.rise), bar = [[x, lo], [x + bw, lo], [x + bw, a], [x, a]];
        (a >= 0.4 ? teal : white).push(bar);
      });
      return { white, teal };
    },
  },
  {
    name: 'LED', line: ['The pulse lit on a dot grid, the way', 'the club’s stage screen draws it.'],
    draw: (k) => {
      // each column of the grid lights the rows the line passes through in it, so the beat's legs
      // become columns of dots, as an LED wall draws a steep line
      const { pts, beatLegs } = pulsePoints(); const b = new Set(beatLegs.flat().slice(0, 3));
      const r = 0.045 * k, pitch = 2.5 * r, white = [], teal = [];
      const end = pts.at(-1)[0];
      for (let x = 0; x <= end + 1e-9; x += pitch) {
        let lo = Infinity, hi = -Infinity, isTeal = false, best = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const [a, c] = [pts[i], pts[i + 1]];
          const x0 = Math.max(Math.min(a[0], c[0]), x - pitch / 2), x1 = Math.min(Math.max(a[0], c[0]), x + pitch / 2);
          if (x1 < x0) continue;
          const yAt = (xx) => (c[0] === a[0] ? a[1] : a[1] + (c[1] - a[1]) * (xx - a[0]) / (c[0] - a[0]));
          const ys = c[0] === a[0] ? [a[1], c[1]] : [yAt(x0), yAt(x1)];
          lo = Math.min(lo, ...ys); hi = Math.max(hi, ...ys);
          if (x1 - x0 > best) { best = x1 - x0; isTeal = b.has(i); }
        }
        for (let j = Math.round(lo / pitch); j <= Math.round(hi / pitch); j++) (isTeal ? teal : white).push({ dot: [x, j * pitch], r });
      }
      return { white, teal };
    },
  },
  {
    name: 'Rounded', line: ['A softer line: round ends and', 'round turns, the beat in teal.'],
    draw: (k) => { const { pts, beatLegs } = pulsePoints(); const b = new Set(beatLegs.flat().slice(0, 3));
      return { white: [], teal: [], round: { pts, teal: (i) => b.has(i), t: 0.1 * k } }; },
  },
];

// ── Placing a look: upright caps → SVG (leaned at the slant about the letters' baseline) ─────────
const circle = (cx, cy, r, n = 40) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
function roundStroke(pts, t) {          // pts already in SVG space; every outline wound alike (nonzero)
  const out = [];
  pts.forEach((b, i) => {
    out.push(circle(b[0], b[1], t / 2));
    if (i === 0) return;
    const a = pts[i - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (-(b[1] - a[1]) / L) * t / 2, ny = ((b[0] - a[0]) / L) * t / 2;
    out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
  });
  return out.map(wind);
}
function placeLook(look, k, { x, y, cap, lineY }) {
  const g = look.draw(k);
  const to = ([u, v]) => [x + (u + SLANT * (v + lineY)) * cap, y - (v + lineY) * cap];
  const conv = (list) => list.map((p) => wind(p.dot ? circle(...to(p.dot), p.r * cap) : p.map(to)));
  const out = { white: conv(g.white), teal: conv(g.teal) };
  if (g.round) {
    const { pts, teal, t } = g.round;
    for (let i = 0; i < pts.length - 1; i++) (teal(i) ? out.teal : out.white).push(...roundStroke([to(pts[i]), to(pts[i + 1])], t * cap));
  }
  return out;
}
function bounds(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of list) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
const widthOf = (look, k) => { const m = placeLook(look, k, { x: 0, y: 0, cap: 1, lineY: 0 }); const b = bounds([...m.white, ...m.teal]); return b.x1 - b.x0; };

// CLUB, the look, SHAPE: as pulse.mjs's one-line lockup sets the line.
function inlineSvg(look, k = 1) {
  const pad = LOCKUP.pad * CAP, gap = PULSE_LOCKUP.inlineGap;
  const [, bAt] = places('CLUB').at(-1);
  const lineStart = pad + (bAt + GLYPHS.B.w + gap) * CAP;
  const probe = placeLook(look, k, { x: 0, y: 0, cap: CAP, lineY: MID }), pb = bounds([...probe.white, ...probe.teal]);
  // the look's ink starts where an upright x of 0 would at mid-height; a look's own left overhang counts
  const left0 = SLANT * MID * CAP;
  const over = Math.max(0, -pb.y0 - CAP), baseline = pad + over + CAP;
  const mark = placeLook(look, k, { x: lineStart - (pb.x0 - left0), y: baseline, cap: CAP, lineY: MID });
  const shapeX = lineStart + (pb.x1 - pb.x0) + gap * CAP;
  const shape = wordPolys('SHAPE', { x: shapeX, y: baseline, cap: CAP });
  const all = bounds([...mark.white, ...mark.teal]);
  const W = shapeX + shape.width + pad, H = Math.max(baseline, all.y1) + pad;
  return {
    W, H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`
      + `<path fill="${COLORS.white}" d="${pathOf(mark.white)}"/><path fill="${COLORS.teal}" d="${pathOf(mark.teal)}"/>`
      + `<path fill="${COLORS.white}" d="${pathOf(wordPolys('CLUB', { x: pad, y: baseline, cap: CAP }).polys)}"/>`
      + `<path fill="${COLORS.white}" d="${pathOf(shape.polys)}"/></svg>`,
  };
}

// The look alone on a dark app icon, heavier (k = 2) so it holds at icon size.
function iconSvg(look, size) {
  const m = placeLook(look, 2, { x: 0, y: 0, cap: 100, lineY: 0 }), b = bounds([...m.white, ...m.teal]);
  const k = (size * 0.66) / Math.max(b.x1 - b.x0, (b.y1 - b.y0) * 1.2);
  const t = (list) => list.map((p) => p.map(([x, y]) => [(size - (b.x1 - b.x0) * k) / 2 + (x - b.x0) * k, (size - (b.y1 - b.y0) * k) / 2 + (y - b.y0) * k]));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}" fill="#0b0907" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>`
    + `<path fill="${COLORS.white}" d="${pathOf(t(m.white))}"/><path fill="${COLORS.teal}" d="${pathOf(t(m.teal))}"/></svg>`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const label = (look, n, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
  + `<text x="0" y="40" font-family="Inter" font-weight="600" font-size="30" fill="#f2ede4">${n === 0 ? 'Today' : String.fromCharCode(64 + n)} · ${esc(look.name)}</text>`
  + look.line.map((l, i) => `<text x="0" y="${80 + i * 30}" font-family="Inter" font-size="22" fill="rgba(242,237,228,0.6)">${esc(l)}</text>`).join('') + '</svg>';

async function main() {
  const sharp = createRequire(join(HERE, '..', '..', 'package.json'))('sharp');
  const LABEL = 500, LOCK = 1050, ICON = 250, ROW = 250, M = 50, BG = '#15110d', tiles = [];
  for (const [r, look] of LOOKS.entries()) {
    const top = r * ROW;
    tiles.push({ input: Buffer.from(label(look, r, LABEL - M, 150)), left: M, top: top + 60 });
    const l = inlineSvg(look), k = Math.min((LOCK - 2 * M) / l.W, (ROW - 2 * M) / l.H);
    const img = await sharp(Buffer.from(l.svg), { density: 72 * k }).resize({ width: Math.round(l.W * k) }).png().toBuffer();
    const im = await sharp(img).metadata();
    tiles.push({ input: img, left: LABEL + Math.round((LOCK - im.width) / 2), top: top + Math.round((ROW - im.height) / 2) });
    tiles.push({ input: await sharp(Buffer.from(iconSvg(look, 190))).png().toBuffer(), left: LABEL + LOCK + 20, top: top + 30 });
  }
  const W = LABEL + LOCK + ICON, H = LOOKS.length * ROW;
  const rules = Array.from({ length: LOOKS.length - 1 }, (_, i) => `<rect x="${M}" y="${(i + 1) * ROW}" width="${W - 2 * M}" height="1" fill="rgba(242,237,228,0.1)"/>`).join('');
  tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rules}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } }).composite(tiles).png().toFile(join(HERE, 'pulse-looks.png'));
  console.log('wrote marketing/club-shape/pulse-looks.png (' + LOOKS.length + ' looks)');
}

// Run as a script; imported (trianglebeat.mjs shows the sketch), it only lends its looks.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
