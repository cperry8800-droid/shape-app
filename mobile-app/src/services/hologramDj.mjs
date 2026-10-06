// The hologram DJ, pure core. No React, no DOM, no window: beat math, the
// deterministic hash and glitch schedule, the palette (a continuous WCAG
// contrast "reach" against the real paper grounds) and the static geometry the
// overlay draws (figure, headphones, hands, console) as SVG path strings in RIG
// coordinates: 1 unit = 1 CSS px on a 350px-wide surface, the rig box is
// HOLO_RIG.w x HOLO_RIG.h and its bottom edge (y = HOLO_RIG.h) is the floor the
// booth stands on. Nothing here draws below that line.
//
// The geometry is built lazily, on the first holoGeometry() call (the first
// mount), never at module evaluation: this module is imported on the app's
// launch path whether or not anyone ever turns the hologram on.
//
// Every top-level name is prefixed holo / HOLO_, exported or not, so the module
// can be inlined beside other code.

// ── beat ────────────────────────────────────────────────────────────────
export const HOLO_BPM = 132;
export const HOLO_BEAT_MS = 60000 / HOLO_BPM;
export const HOLO_BAR_MS = HOLO_BEAT_MS * 4;

// Everything the motion needs from the clock. pulse = (1 - phase)^3, the
// kick envelope used across the app's reactive effects.
export function holoBeat(ms) {
  const t = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const beats = t / HOLO_BEAT_MS;
  const beatN = Math.floor(beats);
  const phase = beats - beatN;
  const eighths = beats * 2;
  const eighthN = Math.floor(eighths);
  return {
    ms: t, beats, beatN, phase,
    pulse: (1 - phase) ** 3,
    bar: (t % HOLO_BAR_MS) / HOLO_BAR_MS,
    barN: Math.floor(t / HOLO_BAR_MS),
    eighths, eighthN, eighth: eighths - eighthN,
    sixteenthN: Math.floor(beats * 4),
  };
}

// ── deterministic noise ─────────────────────────────────────────────────
export function holoHash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ── glitch schedule ─────────────────────────────────────────────────────
// One window per two bars (8 beats, ~3.6 s). About 60% of windows hold one
// burst (window 0 never does), starting on one of the window's 8th notes 3..12
// and lasting HOLO_GLITCH_MS, so two bursts are always at least 3.5 beats
// (~1.6 s) apart.
// The burst displaces ONE horizontal band, 8–24 px tall, lying inside the
// figure's own vertical span (HOLO_FIG_SPAN), by 3–6 px.
export const HOLO_GLITCH_WINDOW_MS = HOLO_BEAT_MS * 8;
export const HOLO_GLITCH_MS = 140;
// the figure's vertical span in rig px (crest of the head box … the console's
// back edge); the geometry test pins it against the built boxes
export const HOLO_FIG_SPAN = [22, 124];
export function holoGlitchWindow(n) {
  if (n < 1 || holoHash(n * 7 + 3) < 0.4) return null;
  const start = n * HOLO_GLITCH_WINDOW_MS + Math.floor(3 + holoHash(n * 11 + 5) * 10) * (HOLO_BEAT_MS / 2); // 8ths 3..12
  const h = 8 + Math.floor(holoHash(n * 17 + 2) * 17); // 8..24
  const [y0, y1] = HOLO_FIG_SPAN;
  const y = Math.round(y0 + holoHash(n * 13 + 1) * (y1 - y0 - h));
  const dx = (holoHash(n * 19 + 5) < 0.5 ? -1 : 1) * (3 + Math.floor(holoHash(n * 23 + 4) * 4)); // 3..6 px
  return { n, start, end: start + HOLO_GLITCH_MS, y, h, dx };
}
export function holoGlitchAt(ms) {
  if (!(ms > 0)) return null;
  const g = holoGlitchWindow(Math.floor(ms / HOLO_GLITCH_WINDOW_MS));
  return g && ms >= g.start && ms < g.end ? g : null;
}
export function holoGlitchFirstMs() {
  for (let n = 1; n < 64; n++) { const g = holoGlitchWindow(n); if (g) return g.start; }
  return -1;
}

// ── colour ──────────────────────────────────────────────────────────────
export const HOLO_TEAL = '#0ac5a8';
export const HOLO_GROUNDS_DARK = ['#0b0d10', '#111111'];
export const HOLO_GROUNDS_LIGHT = ['#f2ede4', '#ece4d3'];
// the casing under every rim: the paper itself, so it is invisible on bare
// paper and only shows where the rig crosses something bright (a colour
// swatch, a photo) or dark, keeping the line legible there
export const HOLO_CASING = { dark: '#0b0d10', light: '#f2ede4' };
const HOLO_WHITE = [255, 255, 255];
const HOLO_INK = [20, 24, 28];
const HOLO_COOL = [70, 150, 205]; // the cast a neutral tint borrows, so it still reads as light

export function holoNormTint(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : HOLO_TEAL;
}
export function holoRgb(hex) {
  const n = parseInt(holoNormTint(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function holoHex(c) {
  return `#${c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
export function holoMix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function holoLum(c) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export function holoContrast(a, b) {
  const x = holoLum(a), y = holoLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// Walk `rgb` toward `toward` just far enough that it meets `target` contrast
// against EVERY ground. Continuous in its input (bisection, not steps), so a
// drifting tint never jumps. With `max`, the walk stops as soon as the colour's
// contrast falls to `target` against every ground (a cap, walking toward the
// paper).
export function holoReach(rgb, toward, grounds, target, max = false) {
  const g = grounds.map(holoRgb);
  // tested on the 8-bit colour that will actually be published
  const at = t => holoMix(rgb, toward, t).map(Math.round);
  const ok = t => { const m = at(t); return max ? g.every(q => holoContrast(m, q) <= target) : g.every(q => holoContrast(m, q) >= target); };
  if (ok(0)) return at(0);
  if (!ok(1)) return toward.slice();
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
  return at(hi);
}
// Contrast targets per role, each a floor and a cap. Dark paper: walked toward
// white to the floor, back toward the ground past the cap (a cream or white
// tint would otherwise print every faint line at 17:1). Light paper: the same
// lines print as ink, the rim a clear step lighter than body text (~16:1) and
// than the grey meta text it crosses (~6:1), so a crossing never reads as a stroke.
export const HOLO_TARGETS = {
  dark: { rim: 11, line: 6, rimMax: 13, lineMax: 9.5 },
  light: { rim: 4.5, line: 2.6, rimMax: 5.2, lineMax: 3.2 },
};
export const HOLO_CHROMA = { dark: ['#58dcff', '#ff5aa8'], light: ['#1f6fd1', '#d2335f'] };
// 0 for a grey, 1 for a fully saturated colour
export function holoChroma(rgb) { const mx = Math.max(...rgb), mn = Math.min(...rgb); return mx === 0 ? 0 : (mx - mn) / mx; }
export function holoPalette(tint, isLight) {
  let c = holoRgb(tint);
  const T = isLight ? HOLO_TARGETS.light : HOLO_TARGETS.dark;
  const to = isLight ? HOLO_INK : HOLO_WHITE;
  const grounds = isLight ? HOLO_GROUNDS_LIGHT : HOLO_GROUNDS_DARK;
  const [ca, cb] = isLight ? HOLO_CHROMA.light : HOLO_CHROMA.dark;
  // a neutral tint (cream, white, grey) borrows a cool cast in its LINE colour
  // only, continuously with its saturation, so it still reads as light
  const neutral = Math.max(0, 1 - holoChroma(c) / 0.28);
  const lineBase = holoMix(c, HOLO_COOL, 0.7 * neutral);
  const back = holoRgb(grounds[0]);
  let rim = holoReach(c, to, grounds, T.rim), line = holoReach(lineBase, to, grounds, T.line);
  rim = holoReach(rim, back, grounds, T.rimMax, true);
  line = holoReach(line, back, grounds, T.lineMax, true);
  return { rim: holoHex(rim), line: holoHex(line), ca, cb };
}

// ── path helpers ────────────────────────────────────────────────────────
function holoF1(n) { return (Math.round(n * 10) / 10).toString(); }
function holoPt(p) { return `${holoF1(p[0])} ${holoF1(p[1])}`; }
export function holoPoly(a, close = true) { return `M${a.map(holoPt).join('L')}${close ? 'Z' : ''}`; }
export function holoLine(a, b) { return `M${holoPt(a)}L${holoPt(b)}`; }
// open Catmull-Rom
export function holoCurve(p) {
  const n = p.length, at = i => p[Math.max(0, Math.min(n - 1, i))];
  let d = `M${holoPt(p[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), e = at(i + 2);
    d += `C${holoPt([b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6])} ${holoPt([c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6])} ${holoPt(c)}`;
  }
  return d;
}
// rotate (deg, clockwise on screen) + scale + translate a list of [x, y, corner?]
export function holoPlace(points, { x = 0, y = 0, rot = 0, s = 1, su = 1, sv = 1 } = {}) {
  const a = (rot * Math.PI) / 180, c = Math.cos(a) * s, sn = Math.sin(a) * s;
  return points.map(p => {
    const u = p[0] * su, v = p[1] * sv;
    const q = [x + u * c - v * sn, y + u * sn + v * c];
    if (p[2]) q.push(1);
    return q;
  });
}
export function holoEllipse(cx, cy, rx, ry, rot = 0, n = 24, a0 = 0, a1 = Math.PI * 2) {
  const out = [], r = (rot * Math.PI) / 180, cr = Math.cos(r), sr = Math.sin(r);
  const closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-9; // a full ring does not repeat its first point
  for (let i = 0; i <= n - (closed ? 1 : 0); i++) {
    const a = a0 + ((a1 - a0) * i) / n, x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return out;
}
export function holoBounds(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
// Sample a closed Catmull-Rom ring (third element = corner) into a dense
// polyline, ~`step` px apart, keeping the index of each source segment so
// hidden source segments stay hidden.
export function holoDense(p, step = 1.4) {
  const n = p.length, at = i => p[((i % n) + n) % n];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), e = at(i + 2);
    const c1 = b[2] ? b : [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = c[2] ? c : [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    const k = Math.max(1, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, u = 1 - t;
      const x = u * u * u * b[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * c[0];
      const y = u * u * u * b[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * c[1];
      out.push([x, y, i]);
    }
  }
  return out;
}
export function holoInside(q, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// A form: dense outline + its rim, with source segments in `hide` cut, and
// every stretch that falls inside an occluder (a part drawn in front) cut too.
export function holoForm(points, { hide = [], occluders = [], step = 1.4 } = {}) {
  const d = holoDense(points, step), n = d.length;
  const occ = occluders.map(o => ({ o, b: holoBounds(o) }));
  const vis = d.map((q, i) => {
    const r = d[(i + 1) % n];
    if (hide.includes(q[2])) return false;
    const m = [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2];
    return !occ.some(({ o, b }) => m[0] >= b[0] && m[0] <= b[2] && m[1] >= b[1] && m[1] <= b[3] && holoInside(m, o));
  });
  let rim = '', open = false;
  for (let i = 0; i < n; i++) {
    const r = d[(i + 1) % n];
    if (!vis[i]) { open = false; continue; }
    if (!open) { rim += `M${holoPt(d[i])}`; open = true; }
    rim += `L${holoPt(r)}`;
  }
  return { pts: d, sil: `${holoPoly(d)}`, rim };
}
// A limb from joint centres [[x, y, r], …]: offsets each bone, rounds the
// outside of every bend, meets the inside at the crook. Both end caps are
// marked hidden (they are cuts: under a sleeve, a deltoid, a hand).
export function holoLimb(J, swell = [], { roundStart = false } = {}) {
  const bones = [];
  for (let i = 0; i < J.length - 1; i++) {
    const a = J[i], b = J[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const [sw, at] = swell[i] || [0, 0.4];
    const left = [], right = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, r = a[2] + (b[2] - a[2]) * t + sw * Math.exp(-((t - at) ** 2) / 0.05);
      const x = a[0] + dx * t, y = a[1] + dy * t;
      left.push([x + uy * r, y - ux * r]); right.push([x - uy * r, y + ux * r]);
    }
    bones.push({ left, right, ux, uy });
  }
  const X = (p1, p2, p3, p4) => {
    const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]), 1];
  };
  let Ls = bones[0].left.slice(), Rs = bones[0].right.slice();
  for (let i = 1; i < bones.length; i++) {
    const A = bones[i - 1], B = bones[i], j = J[i];
    const cross = A.ux * B.uy - A.uy * B.ux, outerLeft = cross > 0;
    const inA = outerLeft ? Rs : Ls, inB = outerLeft ? B.right : B.left;
    const x = X(inA[inA.length - 2], inA[inA.length - 1], inB[0], inB[1]);
    const keepA = inA.filter(p => (p[0] - x[0]) * A.ux + (p[1] - x[1]) * A.uy < -0.3);
    const keepB = inB.filter(p => (p[0] - x[0]) * B.ux + (p[1] - x[1]) * B.uy > 0.3);
    const inner = [...keepA, x, ...keepB];
    const outA = outerLeft ? Ls : Rs, outB = outerLeft ? B.left : B.right;
    const s = outA[outA.length - 1], e = outB[0];
    const a0 = Math.atan2(s[1] - j[1], s[0] - j[0]), a1 = Math.atan2(e[1] - j[1], e[0] - j[0]);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const arc = [];
    for (let k = 1; k < 6; k++) { const a = a0 + (da * k) / 6; arc.push([j[0] + j[2] * Math.cos(a), j[1] + j[2] * Math.sin(a)]); }
    const outer = [...outA, ...arc, ...outB];
    if (outerLeft) { Ls = outer; Rs = inner; } else { Ls = inner; Rs = outer; }
  }
  const nL = Ls.length;
  const ring = [...Ls, ...Rs.slice().reverse()];
  for (const i of [nL - 1, nL]) ring[i] = [ring[i][0], ring[i][1], 1];
  if (!roundStart) {
    for (const i of [0, ring.length - 1]) ring[i] = [ring[i][0], ring[i][1], 1];
    return { ring, hide: [nL - 1, ring.length - 1] };
  }
  // a rounded dome over the start joint (a shoulder): from the right side's
  // start, round the back of the joint, to the left side's start
  const j = J[0], b = bones[0], a0 = Math.atan2(b.ux, -b.uy);
  for (let k = 1; k < 8; k++) { const a = a0 + (Math.PI * k) / 8; ring.push([j[0] + j[2] * Math.cos(a), j[1] + j[2] * Math.sin(a)]); }
  return { ring, hide: [nL - 1] };
}
function holoPad([x0, y0, x1, y1], p) { const x = Math.floor(x0 - p), y = Math.floor(y0 - p); return [x, y, Math.ceil(x1 + p) - x, Math.ceil(y1 + p) - y]; }

// ── the rig ─────────────────────────────────────────────────────────────
// Drawn for a 350px-wide surface; shown right-aligned. The console is ~0.6 of
// the width and centred under the figure, so the left text column (up to
// x ≈ 130 on a 350 surface) is clear on every screen. With floor = 0 (no tab
// bar: the calendar, the cycle screen, the Settings preview) the rig is inset
// by `corner` so the base clears the phone's rounded bottom corner; in the
// Settings preview it is also drawn `bareScale` larger, so the head reaches up
// off the colour swatches.
export const HOLO_RIG = { w: 236, h: 160, right: 4, corner: 26, ref: 350, bareScale: 1.15 };

// ── console, one-point perspective ─────────────────────────────────────
// World: x across (px at the front lip), d into the screen, h up from the deck.
export const HOLO_CAM = { cx: 128, y0: 153, yh: 22, dist: 420, kh: 0.9 };
export function holoP(x, d, h = 0) {
  const { cx, y0, yh, dist, kh } = HOLO_CAM;
  const s = dist / (dist + d);
  return [cx + (x - cx) * s, yh + (y0 - yh) * s - h * s * kh];
}
export const HOLO_DECK = { x0: [30, 148], w: 78, depth: 96 };
export const HOLO_CONSOLE_X = [24, 232];
export const HOLO_CONSOLE_D = 104;
export const HOLO_MIXER = { x0: 110, x1: 146 };
export const HOLO_JOG = { d: 46, r: 25, h: 3.2 };

// ── the figure ──────────────────────────────────────────────────────────
// A featureless light-form, 3/4 view, leaning in over the left deck: head
// pitched toward it, the near cup (screen right) held to the ear with the
// elbow down, the other hand flat on the left jog. Authored about (141, 136)
// and placed so its centre stands over the mixer (HOLO_CAM.cx).
export const HOLO_FIG = { ax: 141, ay: 136, x: HOLO_CAM.cx, s: 1 };
// the head group (skull, headphones, cue hand) is drawn a touch larger than
// the body (s) so the headphones read at 1x; authored upright about its centre
export const HOLO_HEAD = { x: 141, y: 48, rot: -15, s: 1.08 };
export const HOLO_NECK = [147, 63]; // authored: the nod pivots here

let holoGeo = null;
// Builds every path once, on first use. Pure and deterministic.
export function holoGeometry() {
  if (holoGeo) return holoGeo;
  const F = HOLO_FIG;
  const fs = p => { const q = [F.x + (p[0] - F.ax) * F.s, F.ay + (p[1] - F.ay) * F.s]; if (p[2]) q.push(1); return q; };
  const fsl = pts => pts.map(fs);
  const fsj = J => J.map(j => [...fs([j[0], j[1]]), j[2] * F.s]);
  const head = pts => fsl(holoPlace(pts, HOLO_HEAD));

  // ── console ──
  const quad = (x0, x1, d0, d1, h = 0) => holoPoly([holoP(x0, d0, h), holoP(x1, d0, h), holoP(x1, d1, h), holoP(x0, d1, h)]);
  const ringPts = (cx, cd, r, h = 0, n = 40) => Array.from({ length: n }, (_, i) => holoP(cx + r * Math.cos((i / n) * 2 * Math.PI), cd + r * Math.sin((i / n) * 2 * Math.PI), h));
  const ring = (cx, cd, r, h, n) => holoPoly(ringPts(cx, cd, r, h, n));
  const ringHalves = (cx, cd, r, h, n = 40) => {
    const P = ringPts(cx, cd, r, h, n); P.push(P[0]);
    const far = [], near = [];
    for (let i = 0; i < n; i++) (Math.sin(((i + 0.5) / n) * 2 * Math.PI) < 0 ? far : near).push(holoLine(P[i], P[i + 1]));
    return { far: far.join(''), near: near.join('') };
  };
  const [L, R] = HOLO_CONSOLE_X, D = HOLO_CONSOLE_D, J = HOLO_JOG;
  const edge = [], fine = [], faint = [];
  edge.push(holoLine(holoP(L, 0), holoP(L, D)), holoLine(holoP(R, 0), holoP(R, D)));
  faint.push(holoLine(holoP(L, D), holoP(R, D)));
  const jogs = [];
  for (const x0 of HOLO_DECK.x0) {
    const x1 = x0 + HOLO_DECK.w, cx = x0 + HOLO_DECK.w / 2;
    edge.push(quad(x0, x1, 6, HOLO_DECK.depth, 3.2));
    const o = ringHalves(cx, J.d, J.r, J.h, 48);
    edge.push(o.near); fine.push(o.far);
    fine.push(ring(cx, J.d, J.r * 0.76, J.h, 40));
    edge.push(ring(cx, J.d, 5.5, J.h, 20));
    // pitch fader slot + cap
    fine.push(holoLine(holoP(x1 - 6, 22, 3.2), holoP(x1 - 6, 72, 3.2)));
    fine.push(quad(x1 - 8.6, x1 - 3.4, 44, 48, 3.6));
    // play / cue
    fine.push(ring(x0 + 7, 24, 2.8, 3.2, 14), ring(x0 + 7, 34, 2.8, 3.2, 14));
    // no hot-cue pads: the deck's front row lies on the screen's last content
    // row, where any mark reads as a text character
    // the small screen at the back of the deck, tilted up
    fine.push(holoPoly([holoP(x0 + 18, 82, 3.2), holoP(x1 - 18, 82, 3.2), holoP(x1 - 18, 92, 7), holoP(x0 + 18, 92, 7)]));
    const c = holoP(cx, J.d, J.h);
    const l = holoP(cx - J.r, J.d, J.h), r = holoP(cx + J.r, J.d, J.h);
    const f = holoP(cx, J.d - J.r, J.h), b = holoP(cx, J.d + J.r, J.h);
    jogs.push({ cx: c[0], cy: (f[1] + b[1]) / 2, rx: (r[0] - l[0]) / 2, ry: (f[1] - b[1]) / 2 });
  }
  const { x0: m0, x1: m1 } = HOLO_MIXER, mc = (m0 + m1) / 2;
  edge.push(quad(m0, m1, 6, HOLO_DECK.depth, 4.4));
  for (const cx of [m0 + 6, m1 - 6]) {
    fine.push(holoLine(holoP(cx, 16, 4.4), holoP(cx, 40, 4.4)));
    fine.push(quad(cx - 3, cx + 3, 27, 30, 5));
    for (let r = 0; r < 3; r++) fine.push(ring(cx, 54 + r * 12, 2.6, 4.4, 14));
  }
  fine.push(holoLine(holoP(mc - 9, 10, 4.4), holoP(mc + 9, 10, 4.4)));
  fine.push(quad(mc - 2, mc + 2, 8.5, 11.5, 5));
  // VU: two columns of dots between the channel strips, back to front
  const vu = [mc - 3.6, mc + 3.6].map(x => Array.from({ length: 7 }, (_, i) => holoP(x, 82 - i * 8.6, 4.4)));
  for (const col of vu) fine.push(holoLine(col[0], col[col.length - 1]));
  // the emitter: a compact projector housing on the back edge, behind the mixer
  const em = [holoP(mc - 12, D, 0), holoP(mc + 12, D, 0), holoP(mc + 9.5, D, 3.2), holoP(mc - 9.5, D, 3.2)];
  const emA = holoP(mc - 10, D, 0.5), emB = holoP(mc + 10, D, 0.5);
  const lip = [holoP(L, 0), holoP(R, 0)];
  const base = HOLO_RIG.h - 0.6;
  const desk = {
    edge: edge.join(''), fine: fine.join(''), faint: faint.join(''),
    // the console's top surface: the floor-0 glass (not the front face, which
    // lies on the screen's last row of text)
    glass: holoPoly([holoP(L, D), holoP(R, D), lip[1], lip[0]]),
    lip: holoLine(lip[0], lip[1]),
    face: `${holoLine(lip[0], [lip[0][0], base])}${holoLine(lip[1], [lip[1][0], base])}`,
    base: holoLine([lip[0][0], base], [lip[1][0], base]),
    emitter: holoPoly(em),
    lens: holoP(mc, D, 1.7),
    x: [lip[0][0], lip[1][0]],
    top: holoP(L, D)[1],
  };
  const emitter = { x0: emA[0], x1: emB[0], y: emA[1] };

  // ── head (a mannequin): crown, forehead, soft brow, cheek, chin, the jaw
  // line back to its angle, the back of the jaw, the occiput ──
  const HEAD_RING = head([
    [1, -17.6], [-5.6, -16.3], [-10.4, -12.1], [-12.6, -5.8], [-12.4, -1.6], [-11.5, 2], [-11.8, 6],
    [-11, 10.4], [-9.3, 14.2], [-7, 16.6, 1], [-2.6, 16.5], [2.8, 14.5], [7.6, 11.3, 1], [9.9, 7.4],
    [12.5, 1.6], [13.2, -4.8], [11.3, -11.2], [6.8, -15.8],
  ]);
  // headphones: the near cup is a short cylinder on the ear axis (inner face on
  // the head, outer face out toward the viewer's right); the far cup shows only
  // where it clears the face; a strap band over the crown
  const NEAR = { x: 5.4, y: 1.6, len: 5.4, r: 8.6, k: 0.54 };
  const nearInner = holoEllipse(NEAR.x, NEAR.y, NEAR.r * NEAR.k, NEAR.r, 0, 28);
  const nearOuter = holoEllipse(NEAR.x + NEAR.len, NEAR.y, NEAR.r * NEAR.k * 0.94, NEAR.r * 0.94, 0, 28);
  const NEAR_SIL = head([...Array.from({ length: 15 }, (_, i) => nearInner[(7 + i) % 28]), ...Array.from({ length: 15 }, (_, i) => nearOuter[(21 + i) % 28])]);
  const NEAR_FACE = head(nearOuter);
  const NEAR_CAP = head(holoEllipse(NEAR.x + NEAR.len + 0.5, NEAR.y, 2.5, 4.7, 0, 18));
  const FAR_CUP = head(holoEllipse(-13.7, 1.8, 3.9, 8, 0, 26));
  const BAND_RING = head([
    [7.8, -7.6, 1], [10.6, -13.2], [7.2, -19.2], [0.4, -21.6], [-6.4, -20.6], [-11.6, -16.4], [-13.6, -10.2], [-13.4, -6.6, 1],
    [-11.6, -7, 1], [-11.4, -10.4], [-9.4, -15.2], [-5.4, -18.6], [0.2, -19.4], [5.6, -17.4], [8.2, -12.8], [6.2, -7.8, 1],
  ]);
  const flipV = pts => pts.map(p => (p[2] ? [p[0], -p[1], 1] : [p[0], -p[1]]));
  // a mitten: u wrist → tip, v across (thumb on +v)
  const MITTEN = [
    [0, -3.4, 1], [4, -4.1], [9, -4.5], [13.2, -4.3], [16.2, -3.1], [17.4, -0.9], [17, 1.5], [15.2, 3.2], [12.2, 4.1],
    [10.2, 4.6], [10.1, 5.9], [10.7, 7.3], [9.6, 8.3], [7.6, 8.1], [5.2, 6.6], [2.6, 4.7], [0, 3.6, 1],
  ];
  const MITTEN_CAP = 16; // the wrist: a cut, hidden from the rim
  // the cue hand: pressed to the back of the near cup, fingers up over it,
  // thumb toward the face
  const CUE_HAND = { x: 161.4, y: 65.4, rot: -117, s: HOLO_HEAD.s };
  const MITTEN_LINES = [[[3.4, 4.3], [6.6, 5.3], [9.8, 5.2]], [[11.6, 1.2], [14.4, 0.9], [16.9, 0.6]]];
  const cueHand = pts => fsl(holoPlace(flipV(pts), CUE_HAND));
  const CUE_HAND_RING = cueHand(MITTEN);
  // the deck hand: palm down at the back of the left platter (the DJ's side),
  // seen from above and in front: a mitten whose fingertips reach toward the
  // viewer onto the record, the thumb lobe toward the mixer, two short finger
  // splits at the tips. Drawn in screen axes (y down = toward the viewer) about
  // the wrist; the scratch rocks it there.
  const DECK_HAND = { x: 85.2, y: 126.8, rot: -12, s: 1.02 };
  const DECK_MITTEN = [
    [-3, 0, 1], [-3.9, 2.2], [-4.6, 4.8], [-4.8, 7.2], [-4.2, 9.2], [-2.6, 10.6], [-0.4, 11.2], [1.8, 10.9], [3.4, 9.8],
    [4, 8.2], [4.5, 7], [6, 7.3], [7.2, 6.4], [7.1, 5], [5.8, 3.6], [4.3, 2], [3.2, 0, 1],
  ];
  const DECK_CAP = 16;
  const DECK_LINES = [[[-2, 8.2], [-2.3, 9.4], [-2.5, 10.3]], [[0.7, 8.4], [0.7, 9.6], [0.6, 10.7]]];
  const deckHand = pts => fsl(holoPlace(pts, DECK_HAND));
  const DECK_HAND_RING = deckHand(DECK_MITTEN);

  // torso + neck. The top edge (nape → throat) is under the head; the bottom
  // dissolves into the beam behind the console.
  const TORSO_RING = fsl([
    [140.2, 60.6], [139.4, 67.6], [130, 72.4], [117, 75.8], [106, 78.8], [99.2, 83], [95.8, 90], [96.2, 97.6],
    [100.6, 104.4], [104.6, 114], [108, 125], [110, 136, 1], [173, 136, 1], [174.8, 124], [178.4, 112],
    [182.2, 102], [187, 94], [189.4, 85.6], [186.6, 78.8], [178.6, 73.4], [167, 69.4], [159.6, 64.6], [157.6, 56.6, 1],
  ]);
  const DECK_ARM = holoLimb(fsj([[101.2, 86.4, 6.6], [86.8, 110.6, 5], [85.2, 127.2, 3.5]]), [[0.5, 0.45], [0.6, 0.22]], { roundStart: true });
  const CUE_ARM = holoLimb(fsj([[182.6, 82.6, 6.6], [173.4, 100.6, 5.3], [161.6, 64.6, 3.3]]), [[0.4, 0.5], [0.8, 0.22]], { roundStart: true });
  const deckArmPts = holoDense(DECK_ARM.ring), cueArmPts = holoDense(CUE_ARM.ring);
  const cueHandPts = holoDense(CUE_HAND_RING), deckHandPts = holoDense(DECK_HAND_RING);
  const nearSilPts = holoDense(NEAR_SIL.map(p => [p[0], p[1]])), headPts = holoDense(HEAD_RING);

  const headPart = holoForm(HEAD_RING, { occluders: [nearSilPts, cueHandPts] });
  const phones = {
    near: holoForm(NEAR_SIL, { occluders: [cueHandPts] }),
    nearFace: holoForm(NEAR_FACE, { occluders: [cueHandPts] }),
    nearCap: holoForm(NEAR_CAP, { occluders: [cueHandPts] }),
    far: holoForm(FAR_CUP, { occluders: [headPts] }),
    band: holoForm(BAND_RING, { occluders: [cueHandPts] }),
  };
  const torso = holoForm(TORSO_RING, { hide: [11, 22], occluders: [deckArmPts, cueArmPts] });
  const deckArm = holoForm(DECK_ARM.ring, { hide: DECK_ARM.hide, occluders: [deckHandPts] });
  const cueArm = holoForm(CUE_ARM.ring, { hide: CUE_ARM.hide, occluders: [cueHandPts] });
  const cueHandF = holoForm(CUE_HAND_RING, { hide: [MITTEN_CAP] });
  const deckHandF = holoForm(DECK_HAND_RING, { hide: [DECK_CAP] });

  const box = {
    body: holoPad(holoBounds([...torso.pts, ...deckArmPts, ...cueArmPts]), 4),
    head: holoPad(holoBounds([...headPart.pts, ...phones.band.pts, ...phones.near.pts, ...phones.far.pts, ...cueHandPts]), 4),
    deck: holoPad(holoBounds(deckHandF.pts), 6),
  };
  const local = (pts, b) => `path('${holoPoly(pts.map(p => [p[0] - b[0], p[1] - b[1]]))}')`;
  holoGeo = {
    desk, emitter, jogs, vu,
    head: headPart,
    headLines: [
      holoCurve(head([[-8.6, 13.2], [-5.8, 14.6], [-2.6, 14.2]])),             // under the chin
      holoCurve(head([[-11.1, 4.6], [-7.8, 7.6], [-3.6, 10.4], [1.8, 11.6]])), // cheek → jaw plane
    ].join(''),
    phones,
    cueHand: cueHandF,
    cueHandLines: MITTEN_LINES.map(l => holoCurve(cueHand(l))).join(''),
    deckHand: deckHandF,
    deckHandLines: DECK_LINES.map(l => holoCurve(deckHand(l))).join(''),
    torso,
    torsoLines: [
      holoCurve(fsl([[151.4, 59.6], [150, 65.4], [145.6, 70.4]])), // neck-to-jaw contour, down to the pit
      holoCurve(fsl([[123, 78], [133, 76.8], [142.6, 73]])),       // collarbones
      holoCurve(fsl([[146, 73.4], [156, 75.4], [170, 74.8]])),
    ].join(''),
    deckArm, cueArm,
    box,
    // a soft aura about the headphones (centre x, y, radius)
    aura: [...fs([HOLO_HEAD.x + 4, HOLO_HEAD.y - 2]), 23],
    pivot: { body: fs([F.ax, F.ay]), head: fs(HOLO_NECK), deck: fs([DECK_HAND.x, DECK_HAND.y]) },
    // the slice texture's clip, in each box's local px
    sliceClip: { body: local(torso.pts, box.body), head: local(headPart.pts, box.head) },
  };
  holoGeo.figX = [Math.min(box.body[0], box.deck[0], box.head[0]), Math.max(box.body[0] + box.body[2], box.head[0] + box.head[2])];
  holoGeo.figY = [box.head[1], HOLO_FIG_SPAN[1]];
  return holoGeo;
}
export const HOLO_SLICE_PITCH = 3.5;
