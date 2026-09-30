// wordmarkGlyphs.mjs — the Shape wordmark's letterforms, as strokes, so any word can be set in it.
//
// The brand art (public/SHAPE-logo-teal-white.png) is one word, SHAPE, with no font file behind it:
// a wide, oblique, monoline face with rounded outer corners. The stage screen has to say CLUB SHAPE,
// so C, L, U and B are built here from the same strokes, and S H A P E are rebuilt the same way so all
// nine letters share one construction. screen-mask.cjs --check scores the rebuilt S H A P E against
// the brand PNG letter by letter; that score is what says C L U B are in the same face.
//
// Units: the cap height is 1, y is up from the baseline, x is upright (the oblique is a shear applied
// by the caller, x' = x + SLANT·y). Measured from the PNG (cap height 340 px):
//   horizontal bars 0.086 thick · stems 0.106 wide · middle bars centred at 0.528 · slant 58/335
//   outer corners rounded at ≈ 0.2 (square on P's and E's stem side) · A has no crossbar (Λ).
//   The brand sets the letters 0.79 of a cap apart (upright boxes).
// Pure: no DOM, no Math.random.

export const SLANT = 58 / 335;
export const TH = 0.086;        // a horizontal bar's thickness
export const TV = 0.106;        // a stem's width (upright)
export const TD = 0.122;        // a diagonal's horizontal cross-section (A)
export const MID = 0.528;       // the middle bars' centre (S, E, H; B's join)

// A glyph is { w, parts }, each part one of
//   { k: 'seg', a: [x, y], b: [x, y], t }       a straight stroke, flat ends, thickness t
//   { k: 'arc', c: [x, y], r, a0, a1, t0, t1 }  a stroke along a circle between angles a0..a1
//                                              (radians, CCW), thickness t0 → t1
//   { k: 'diag', x0, x1, y0, y1, t }           a slab: centre x runs x0 → x1 as y runs y0 → y1,
//                                              horizontal cross-section t (A's strokes)

// An orthogonal polyline with rounded corners. pts are centreline points; each interior corner is
// rounded at centreline radius r (a number, or one per corner; clamped to the adjoining legs). A
// radius of 0 leaves a square corner, as the face's P and E have on their stem side.
function rounded(pts0, rr0) {
  // drop a repeated point (a zero-length leg has no direction)
  const pts = pts0.filter((q, i) => i === 0 || Math.hypot(q[0] - pts0[i - 1][0], q[1] - pts0[i - 1][1]) > 1e-9);
  const rad = (i) => { const k = pts0.indexOf(pts[i]) - 1; return Array.isArray(rr0) ? (rr0[k] ?? 0) : rr0; };
  const parts = [];
  const thick = (a, b) => (Math.abs(a[1] - b[1]) < 1e-9 ? TH : TV);
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], next = pts[i + 1];
    if (!next) { parts.push({ k: 'seg', a: prev, b: p, t: thick(prev, p) }); break; }
    const inLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const outLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const rr = Math.min(rad(i), inLen * (i === 1 ? 1 : 0.5), outLen * (i + 1 === pts.length - 1 ? 1 : 0.5));
    const di = [(p[0] - prev[0]) / inLen, (p[1] - prev[1]) / inLen];
    const dout = [(next[0] - p[0]) / outLen, (next[1] - p[1]) / outLen];
    if (rr <= 1e-6) {
      // a square corner: run the leg on through the corner by half the other stroke, so the two meet
      const ext = thick(p, next) / 2, back = thick(prev, p) / 2;
      parts.push({ k: 'seg', a: prev, b: [p[0] + di[0] * ext, p[1] + di[1] * ext], t: thick(prev, p) });
      prev = [p[0] - dout[0] * back, p[1] - dout[1] * back];
      continue;
    }
    const e = [p[0] - di[0] * rr, p[1] - di[1] * rr];          // where the incoming leg ends
    const s = [p[0] + dout[0] * rr, p[1] + dout[1] * rr];      // where the outgoing leg starts
    parts.push({ k: 'seg', a: prev, b: e, t: thick(prev, p) });
    const c = [e[0] + dout[0] * rr, e[1] + dout[1] * rr];     // the arc's centre
    let a0 = Math.atan2(e[1] - c[1], e[0] - c[0]), a1 = Math.atan2(s[1] - c[1], s[0] - c[0]);
    const cross = di[0] * dout[1] - di[1] * dout[0];           // > 0: a left (CCW) turn
    let t0 = thick(prev, p), t1 = thick(p, next);
    if (cross < 0) { [a0, a1] = [a1, a0]; [t0, t1] = [t1, t0]; }
    while (a1 < a0) a1 += Math.PI * 2;
    parts.push({ k: 'arc', c, r: rr, a0, a1, t0, t1 });
    prev = s;
  }
  return parts;
}
const seg = (a, b, t) => ({ k: 'seg', a, b, t });

const hv = TV / 2, hh = TH / 2;
const top = 1 - hh, bot = hh;
const R = 0.2 - (TH + TV) / 4;      // centreline radius for a 0.2 outer corner

// Each letter is built from a few parameters (width, corner radii, where its bars sit). The S H A P E
// values are fitted to the brand PNG by screen-mask.cjs --fit (a local search on each letter's IoU);
// C L U B take the fitted style — the same bar, stem and corner — with widths set like their kin
// (C and B like S and P, U like H, L like E).
export const PARAMS = {
  // fitted to the brand PNG (IoU on each letter: S 0.917 · H 0.965 · A 0.940 · P 0.954 · E 0.965)
  S: { w: 1.1317, r: 0.1558, rm: 0.1745 },
  H: { w: 1.1357 },
  A: { w: 1.3875, ax: 0.6937, td: 0.1195, top: 0.9762 },
  P: { w: 1.075, b: 0.4275, r: 0.182, rt: 0 },
  E: { w: 0.9782, r: 0, mx: 0.9403 },
  // built from them: C is S's outer contour opened on the right, U is H with P's bowl corners, L is
  // E's stem and foot, B is P's bowl over a full-width lower one (square on the stem side, as P and E)
  C: { w: 1.1, r: 0.1558 },
  L: { w: 0.92, r: 0 },
  U: { w: 1.1357, r: 0.182 },
  B: { w: 1.075, r: 0.182, rt: 0, inset: 0.04 },
};

export function makeGlyph(ch, q) {
  const w = q.w;
  switch (ch) {
    case 'S': return { w, parts: rounded([[w, top], [hv, top], [hv, MID], [w - hv, MID], [w - hv, bot], [0, bot]], [q.r, q.rm, q.rm, q.r]) };
    case 'H': return { w, parts: [seg([hv, 0], [hv, 1], TV), seg([w - hv, 0], [w - hv, 1], TV), seg([hv, MID], [w - hv, MID], TH)] };
    case 'A': { const t = q.td ?? TD; return { w, parts: [{ k: 'diag', x0: t / 2, x1: q.ax, y0: 0, y1: q.top ?? 1, t }, { k: 'diag', x0: w - t / 2, x1: q.ax, y0: 0, y1: q.top ?? 1, t }] }; }
    case 'P': return { w, parts: [seg([hv, 0], [hv, top - q.rt], TV), ...rounded([[hv, top - q.rt], [hv, top], [w - hv, top], [w - hv, q.b], [hv, q.b]], [q.rt, q.r, q.r])] };
    case 'E': return { w, parts: [...rounded([[w, top], [hv, top], [hv, bot], [w, bot]], q.r), seg([hv, MID], [q.mx, MID], TH)] };
    case 'C': return { w, parts: rounded([[w, top], [hv, top], [hv, bot], [w, bot]], q.r) };
    case 'L': return { w, parts: rounded([[hv, 1], [hv, bot], [w, bot]], q.r) };
    case 'U': return { w, parts: rounded([[hv, 1], [hv, bot], [w - hv, bot], [w - hv, 1]], q.r) };
    case 'B': {
      const xu = w - hv - q.inset;   // the upper bowl is a little narrower, as in the face's P
      return { w, parts: [
        seg([hv, bot + q.rt], [hv, top - q.rt], TV),
        ...rounded([[hv, top - q.rt], [hv, top], [xu, top], [xu, MID], [hv, MID]], [q.rt, q.r, q.r]),
        ...rounded([[hv, MID], [w - hv, MID], [w - hv, bot], [hv, bot], [hv, bot + q.rt]], [q.r, q.r, q.rt]),
      ] };
    }
  }
  throw new Error('wordmarkGlyphs: no glyph for ' + ch);
}

export const GLYPHS = Object.fromEntries(Object.entries(PARAMS).map(([ch, q]) => [ch, makeGlyph(ch, q)]));

// Is upright point (x, y) inside glyph g? (x relative to the glyph's own left edge)
export function inGlyph(g, x, y) {
  for (const p of g.parts) {
    if (p.k === 'seg') {
      const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], L2 = dx * dx + dy * dy;
      const u = ((x - p.a[0]) * dx + (y - p.a[1]) * dy) / L2;
      if (u < 0 || u > 1) continue;
      const d = Math.abs((x - p.a[0]) * dy - (y - p.a[1]) * dx) / Math.sqrt(L2);
      if (d <= p.t / 2) return true;
    } else if (p.k === 'arc') {
      let a = Math.atan2(y - p.c[1], x - p.c[0]);
      while (a < p.a0) a += Math.PI * 2;
      if (a > p.a1) continue;
      const f = (a - p.a0) / (p.a1 - p.a0), t = p.t0 + (p.t1 - p.t0) * f;
      if (Math.abs(Math.hypot(x - p.c[0], y - p.c[1]) - p.r) <= t / 2) return true;
    } else if (p.k === 'diag') {
      if (y < p.y0 || y > p.y1) continue;
      const cx = p.x0 + (p.x1 - p.x0) * (y - p.y0) / (p.y1 - p.y0);
      if (Math.abs(x - cx) <= p.t / 2) return true;
    }
  }
  return false;
}

// Lay a word out: returns [{ g, x }] (x = each glyph's upright left edge at the baseline) and the
// set width. gap is the space between letters, space the extra width of a word space, both in caps.
export function layoutWord(word, gap, space) {
  const out = [];
  let x = 0;
  for (const ch of word) {
    if (ch === ' ') { x += space; continue; }
    const g = GLYPHS[ch];
    if (!g) throw new Error('wordmarkGlyphs: no glyph for ' + ch);
    out.push({ g, x, ch });
    x += g.w + gap;
  }
  return { glyphs: out, width: x - gap + SLANT };   // the last letter's top overhangs by SLANT
}
