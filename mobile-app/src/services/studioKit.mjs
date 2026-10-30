// The studio kit: every piece a coach can place on their space, drawn from above, and the
// starting layouts. Pure (strings in, strings out), so tests/studio-kit.test.mjs draws every
// piece without a browser.
//
// Owner, 2026-10-27, on the coach profile: "make the studio customizable in terms of layout …
// for what someone might have in their gym or studio … or have an option for full gym", then
// "add free weights, machines, treadmill, etc", then, of the first drawings, "make this look a
// little more simple. looks like an engineering blueprint", then "ok well this can be a little
// more detailed". So the plan draws each piece as soft two-tone shapes with a few details (bar
// and plates on a rack, belt and console on a treadmill), and the editor's "Add" list keeps
// the finer line drawings as its icons.
//
// The stored form is profile_custom.studio (normalized by public/newdesign/profileCustom.mjs):
// pieces { t, x, y, w, h, label?, tag?, spot?, st? } on a fixed 344 × 528 plan. The room
// outline and doors belong to the kind of space and are drawn from STUDIO_ROOMS, never stored.
import { BS_STUDIO_TYPES, BS_STUDIO_W, BS_STUDIO_H } from './profileCustom.mjs';

export { BS_STUDIO_W, BS_STUDIO_H };

const at = (o) => (o ? ' ' + o : '');
const R = (x, y, w, h, o) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + at(o) + '/>';
const C = (cx, cy, r, o) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"' + at(o) + '/>';
const E = (cx, cy, rx, ry, o) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"' + at(o) + '/>';
const L = (x1, y1, x2, y2, o) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"' + at(o) + '/>';
const P = (d, o) => '<path d="' + d + '"' + at(o) + '/>';
const rep = (n, fn) => Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => fn(i)).join('');
const Rf = (x, y, w, h, r, f) => '<rect x="' + x + '" y="' + y + '" width="' + Math.max(0, w) + '" height="' + Math.max(0, h) + '" rx="' + r + '" fill="' + f + '"/>';
const Cf = (cx, cy, r, f) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + Math.max(0, r) + '" fill="' + f + '"/>';
const Ef = (cx, cy, rx, ry, f) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"/>';
const Lf = (x1, y1, x2, y2, f, sw) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + f + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
const Pf = (d, f, sw) => '<path d="' + d + '" fill="none" stroke="' + f + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"/>';

// The line drawings (the editor's icons): S = stroke, F = a faint fill, so = solid S.
function lineDrawings(S, F) {
  const fl = 'fill="' + F + '"', so = 'fill="' + S + '" stroke="none"', th = 'stroke-width="2.6" stroke-linecap="round"', fa = 'stroke-opacity="0.45"';
  const D = {
    rack: (W, H) => R(1, 3, W - 2, H - 6, fl) + [[1, 3], [W - 6, 3], [1, H - 8], [W - 6, H - 8]].map(([x, y]) => R(x, y, 5, 5, so)).join('') + L(W / 2, 0, W / 2, H, 'stroke-width="2"') + R(W / 2 - 8, 6, 16, 4, so) + R(W / 2 - 8, H - 10, 16, 4, so),
    platform: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + L(W * 0.28, 0, W * 0.28, H) + L(W * 0.72, 0, W * 0.72, H) + rep(H / 12, (i) => L(W * 0.28, 12 + i * 12, W * 0.72, 12 + i * 12, fa)) + L(W * 0.08, H / 2, W * 0.92, H / 2, 'stroke-width="2"') + R(W * 0.1, H / 2 - 11, 5, 22, so) + R(W * 0.9 - 5, H / 2 - 11, 5, 22, so),
    bench: (W, H) => R(3, 1, W - 6, H - 2, 'rx="4" ' + fl) + L(0, 5, W, 5) + L(0, H - 5, W, H - 5),
    adjbench: (W, H) => R(3, 1, W - 6, H * 0.36, 'rx="3" ' + fl) + R(3, H * 0.4, W - 6, H * 0.6 - 1, 'rx="3" ' + fl) + L(0, H - 5, W, H - 5),
    dumbbells: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + rep((H - 4) / 9, (i) => { const y = 6 + i * 9; return L(4, y, W - 4, y) + R(2, y - 2.5, 3.5, 5, so) + R(W - 5.5, y - 2.5, 3.5, 5, so); }),
    bells: (W, H) => rep(H / 17, (i) => C(W / 2, 8.5 + i * 17, W / 2 - 2, fl) + P('M' + (W / 2 - 3.5) + ' ' + (5 + i * 17) + ' q3.5 -4 7 0')),
    plates: (W, H) => C(W / 2, H / 2, W / 2 - 1, fl) + C(W / 2, H / 2, W / 2 - 6) + C(W / 2, H / 2, 2.5, so),
    barbells: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + rep((H - 6) / 12, (i) => L(W / 2, 4 + i * 12, W / 2, 10 + i * 12, 'stroke-width="3.5" stroke-linecap="round"')),
    landmine: (W, H) => C(5, H - 5, 4, so) + L(5, H - 5, W - 9, 9, 'stroke-width="2"') + C(W - 9, 9, 7, fl),
    smith: (W, H) => R(1, 1, W - 2, H - 2, fl) + L(5, 1, 5, H - 1) + L(W - 5, 1, W - 5, H - 1) + L(W / 2, 4, W / 2, H - 4, 'stroke-width="2"') + C(W / 2, 11, 3, so) + C(W / 2, H - 11, 3, so),
    cable: (W, H) => R(1, 1, W - 2, W - 6, fl) + R(1, H - W + 5, W - 2, W - 6, fl) + L(W / 2, W - 5, W / 2, H - W + 5, 'stroke-dasharray="3 3"') + C(W / 2, (W - 4) / 2, 3.5) + C(W / 2, H - (W - 4) / 2, 3.5),
    latpull: (W, H) => R(W * 0.3, 1, W * 0.4, 9, fl) + L(3, 15, W - 3, 15, th) + L(W * 0.25, H * 0.48, W * 0.75, H * 0.48, th) + R(W * 0.28, H * 0.56, W * 0.44, H * 0.38, 'rx="4" ' + fl),
    chest: (W, H) => L(4, H * 0.18, W - 4, H * 0.18) + L(4, H * 0.18, 4, H * 0.42, th) + L(W - 4, H * 0.18, W - 4, H * 0.42, th) + R(W * 0.3, H * 0.36, W * 0.4, H * 0.2, 'rx="3" ' + fl) + R(W * 0.28, H * 0.6, W * 0.44, H * 0.36, 'rx="4" ' + fl),
    pecdeck: (W, H) => P('M4 ' + H * 0.42 + ' Q ' + W / 2 + ' ' + (-H * 0.1) + ' ' + (W - 4) + ' ' + H * 0.42, 'stroke-width="2"') + R(W * 0.32, H * 0.3, W * 0.36, H * 0.14, 'rx="2" ' + fl) + R(W * 0.3, H * 0.5, W * 0.4, H * 0.44, 'rx="4" ' + fl),
    legpress: (W, H) => R(1, 1, W - 2, H - 2, 'rx="4" ' + fl) + R(W * 0.14, 6, W * 0.72, 9, so) + L(W * 0.3, 15, W * 0.3, H * 0.52) + L(W * 0.7, 15, W * 0.7, H * 0.52) + R(W * 0.24, H * 0.54, W * 0.52, H * 0.38, 'rx="5"'),
    hack: (W, H) => R(1, 1, W - 2, H - 2, fl) + R(W * 0.14, H - 12, W * 0.72, 8, so) + R(W * 0.3, 8, W * 0.4, H * 0.56, 'rx="4"') + C(W * 0.3, 10, 4.5, fl) + C(W * 0.7, 10, 4.5, fl),
    legext: (W, H) => R(2, 2, 6, H - 4, so) + L(W * 0.22, H * 0.12, W * 0.82, H * 0.12, 'stroke-width="3.5" stroke-linecap="round"') + R(W * 0.26, H * 0.28, W * 0.5, H * 0.66, 'rx="4" ' + fl),
    legcurl: (W, H) => R(W * 0.2, 2, W * 0.6, H * 0.7, 'rx="5" ' + fl) + L(W * 0.14, H * 0.82, W * 0.86, H * 0.82, 'stroke-width="3.5" stroke-linecap="round"') + R(2, H - 7, W - 4, 5, so),
    hipthrust: (W, H) => R(2, 2, W - 4, H * 0.24, 'rx="4" ' + fl) + R(W * 0.14, H * 0.34, W * 0.72, H * 0.62, fl) + L(4, H * 0.46, W - 4, H * 0.46, 'stroke-width="2"'),
    preacher: (W, H) => P('M' + W * 0.12 + ' 2 L' + W * 0.88 + ' 2 L' + W * 0.74 + ' ' + H * 0.44 + ' L' + W * 0.26 + ' ' + H * 0.44 + ' Z', fl) + R(W * 0.28, H * 0.58, W * 0.44, H * 0.36, 'rx="3"'),
    dip: (W, H) => L(W * 0.28, 2, W * 0.28, H - 10, th) + L(W * 0.72, 2, W * 0.72, H - 10, th) + R(W * 0.16, H - 7, W * 0.68, 6, fl),
    ghd: (W, H) => R(W * 0.18, 2, W * 0.64, H * 0.38, 'rx="7" ' + fl) + L(W / 2, H * 0.4, W / 2, H - 14) + R(W * 0.22, H - 13, W * 0.56, 11, so),
    treadmill: (W, H) => R(1, 1, W - 2, H - 2, 'rx="4" ' + fl) + R(5, 13, W - 10, H - 18) + L(4, 7, W - 4, 7, th) + rep((H - 22) / 10, (i) => L(6, 18 + i * 10, W - 6, 18 + i * 10, fa)),
    bike: (W, H) => C(W / 2, 8, 6.5, fl) + L(3, 17, W - 3, 17, th) + L(W / 2, 15, W / 2, H - 11) + E(W / 2, H - 8, 4, 6, so),
    airbike: (W, H) => C(W / 2, 12, 10.5, fl) + rep(4, (i) => L(W / 2, 12, W / 2 + 9 * Math.cos(i * 0.785), 12 + 9 * Math.sin(i * 0.785), fa)) + L(2, 26, W - 2, 26, th) + L(W / 2, 24, W / 2, H - 10) + E(W / 2, H - 8, 4.5, 6, so),
    rower: (W, H) => C(W / 2, 7.5, W / 2 - 1.5, fl) + R(2, 16, 5, 6, so) + R(W - 7, 16, 5, 6, so) + L(W / 2, 22, W / 2, H - 2, 'stroke-width="2"') + R(W / 2 - 5, H * 0.56, 10, 9, 'rx="2" ' + fl),
    ski: (W, H) => R(W * 0.28, 1, W * 0.44, H * 0.42, fl) + C(W * 0.2, H * 0.66, 2.5, so) + C(W * 0.8, H * 0.66, 2.5, so) + R(1, H - 6, W - 2, 5),
    elliptical: (W, H) => R(1, 1, W - 2, H - 2, 'rx="9" ' + fl) + L(4, 8, W - 4, 8, th) + E(W * 0.32, H * 0.55, 3.2, 9, so) + E(W * 0.68, H * 0.62, 3.2, 9, so),
    stair: (W, H) => R(1, 1, W - 2, H - 2, fl) + L(4, 5, W - 4, 5, th) + rep((H - 12) / 6, (i) => L(3, 11 + i * 6, W - 3, 11 + i * 6)),
    rig: (W, H) => L(3, 0, 3, H) + L(W - 3, 0, W - 3, H) + rep(H / 46 + 1, (i) => { const y = Math.min(i * 46, H - 6); return R(0, y, 6, 6, so) + R(W - 6, y, 6, 6, so) + L(3, y + 3, W - 3, y + 3, 'stroke-width="2"'); }),
    turf: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + rep(H / 22 - 1, (i) => L(0, (i + 1) * 22, W, (i + 1) * 22, fa)) + L(W / 2, 4, W / 2, H - 4, 'stroke-dasharray="4 5"'),
    sled: (W, H) => P('M' + W * 0.12 + ' ' + (H - 2) + ' L' + W * 0.25 + ' 4 L' + W * 0.75 + ' 4 L' + W * 0.88 + ' ' + (H - 2) + ' Z', fl) + C(W * 0.35, H * 0.4, 2.5, so) + C(W * 0.65, H * 0.4, 2.5, so),
    boxes: (W, H) => R(1, 1, W - 2, W - 2, fl) + R(2.5, W + 3, W - 5, W - 5, fl) + R(4, 2 * W + 3, W - 8, W - 8, fl),
    ropes: (W, H) => R(W / 2 - 3, 0, 6, 6, so) + P('M' + (W / 2 - 2) + ' 6 q-4 8 0 16 t0 16 t0 16 t0 16') + P('M' + (W / 2 + 2) + ' 6 q4 8 0 16 t0 16 t0 16 t0 16'),
    wallballs: (W, H) => rep(H / 15, (i) => C(W / 2, 7.5 + i * 15, W / 2 - 1.5, fl)),
    straps: (W, H) => C(W / 2, 3, 2.5, so) + L(W / 2, 3, 5, H - 6) + L(W / 2, 3, W - 5, H - 6) + R(1, H - 6, 8, 4, so) + R(W - 9, H - 6, 8, 4, so),
    bag: (W, H) => C(W / 2, H / 2, W / 2 - 1, fl) + C(W / 2, H / 2, W / 2 - 5),
    ring: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + R(6, 6, W - 12, H - 12) + R(11, 11, W - 22, H - 22, fa) + [[0, 0], [W - 9, 0], [0, H - 9], [W - 9, H - 9]].map(([x, y]) => R(x, y, 9, 9, so)).join(''),
    mats: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl + ' stroke-dasharray="4 3"') + rep(H / 24 - 1, (i) => L(0, (i + 1) * 24, W, (i + 1) * 24, fa)),
    reformer: (W, H) => R(1, 1, W - 2, H - 2, 'rx="5" ' + fl) + L(3, 9, W - 3, 9, th) + rep(4, (i) => L(6 + i * (W - 12) / 3, 14, 6 + i * (W - 12) / 3, 22, fa)) + R(4, H * 0.36, W - 8, H * 0.28, 'rx="3"'),
    barre: (W, H) => L(1.5, 0, 1.5, H) + L(W - 1.5, 0, W - 1.5, H) + rep(H / 35 + 1, (i) => L(0, Math.min(i * 35, H - 1), W, Math.min(i * 35, H - 1), 'stroke-width="2"')),
    mirror: (W, H) => L(1.5, 0, 1.5, H, 'stroke-width="2.4"') + L(W - 1, 0, W - 1, H, fa),
    speaker: (W, H) => R(1, 1, W - 2, H - 2, 'rx="3" ' + fl) + C(W / 2, H * 0.6, W * 0.24) + C(W / 2, H * 0.24, 1.6, so),
    desk: (W, H) => R(1, 1, W * 0.56, H - 2, fl) + C(W * 0.82, H / 2, W * 0.14),
    frames: (W, H) => rep(H / 12, (i) => R(1, 2 + i * 12, W - 2, 9, fl)),
    tree: (W, H) => C(W / 2, H / 2, W / 2 - 1, 'stroke-dasharray="3 3"') + C(W / 2, H / 2, W * 0.18, fl),
    counter: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + L(W - 5, 0, W - 5, H, fa),
    island: (W, H) => R(1, 1, W - 17, H - 2, 'rx="3" ' + fl) + L(W - 22, 4, W - 22, H - 4, fa) + rep(4, (i) => C(W - 6, H * (i + 0.5) / 4, 5)),
    range: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + C(W * 0.3, H * 0.28, W * 0.15) + C(W * 0.7, H * 0.28, W * 0.15) + C(W * 0.3, H * 0.66, W * 0.15) + C(W * 0.7, H * 0.66, W * 0.15) + L(3, H - 3, W - 3, H - 3, fa),
    // The oven's door and handle face the room (the bottom edge, upright).
    oven: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + rep(3, (i) => C(W * (i + 1) / 4, H * 0.17, 1.6, so)) + R(4, H * 0.3, W - 8, H * 0.5, 'rx="3"') + L(5, H - 5, W - 5, H - 5, 'stroke-width="2" stroke-linecap="round"'),
    fridge: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + L(W / 2, 1, W / 2, H - 1) + L(W / 2 - 4, H - 6, W / 2 - 4, H - 12, 'stroke-width="2"') + L(W / 2 + 4, H - 6, W / 2 + 4, H - 12, 'stroke-width="2"'),
    sink: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + R(5, 5, W - 10, H * 0.42, 'rx="4"') + R(5, H * 0.53, W - 10, H * 0.42, 'rx="4"') + C(W - 3, H / 2, 2, so),
    pantry: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + rep(H / 12 - 1, (i) => L(0, (i + 1) * 12, W, (i + 1) * 12, fa)),
    table: (W, H) => R(11, 8, W - 22, H - 16, 'rx="5" ' + fl) + [0.25, 0.5, 0.75].map((f) => R(1, H * f - 7, 7, 14, 'rx="2"') + R(W - 8, H * f - 7, 7, 14, 'rx="2"')).join('') + R(W / 2 - 7, 0, 14, 5, 'rx="2"') + R(W / 2 - 7, H - 5, 14, 5, 'rx="2"'),
    scale: (W, H) => R(1, 1, W - 2, H - 2, 'rx="3" ' + fl) + C(W / 2, H / 2, W * 0.24),
    blender: (W, H) => C(W / 2, H / 2, W / 2 - 1, fl) + C(W / 2, H / 2, W * 0.18),
    herbs: (W, H) => rep(H / 14, (i) => C(W / 2, 7 + i * 14, W / 2 - 1.5, fl) + C(W / 2, 7 + i * 14, 1.6, so)),
    board: (W, H) => R(1, 1, W - 2, H - 2, 'rx="3" ' + fl) + L(W * 0.3, H * 0.18, W * 0.3, H * 0.82, 'stroke-width="2" stroke-linecap="round"') + C(W * 0.66, H * 0.4, W * 0.14) + C(W * 0.66, H * 0.68, W * 0.1),
    sofa: (W, H) => R(1, 1, W - 2, H - 2, 'rx="6" ' + fl) + L(9, 5, 9, H - 5) + rep(2, (i) => L(9, H * (i + 1) / 3, W - 2, H * (i + 1) / 3, fa)),
    armchair: (W, H) => R(1, 1, W - 2, H - 2, 'rx="7" ' + fl) + L(7, 5, 7, H - 5) + L(7, 6, W - 3, 6, fa) + L(7, H - 6, W - 3, H - 6, fa),
    screen: (W, H) => R(1, 1, W * 0.62, H - 2, fl) + L(W - 3, 7, W - 3, H - 7, 'stroke-width="3" stroke-linecap="round"') + C(W * 0.3, H * 0.5, 4.5, 'stroke-dasharray="2 2"'),
    shelf: (W, H) => R(0.5, 0.5, W - 1, H - 1, fl) + rep((H - 4) / 5, (i) => L(2, 3 + i * 5, W - 2 - (i % 3) * 2, 3 + i * 5, fa)),
    zone: (W, H) => R(0.6, 0.6, W - 1.2, H - 1.2, 'stroke-dasharray="4 3" stroke-opacity="0.7"')
  };
  return D;
}

// The plan's soft two-tone drawings: b = the piece, d = its few details, l = a lighter area.
const SOFT = {
    rack: (W, H, b, d) => Rf(0, 0, W, H, 5, b) + [[3, 3], [W - 9, 3], [3, H - 9], [W - 9, H - 9]].map(([x, y]) => Rf(x, y, 6, 6, 1.5, d)).join('') + Lf(W / 2, 4, W / 2, H - 4, d, 2.4) + Rf(W / 2 - 9, 9, 18, 5, 2, d) + Rf(W / 2 - 9, H - 14, 18, 5, 2, d),
    platform: (W, H, b, d, l) => Rf(0, 0, W, H, 6, l) + Rf(W * 0.3, 0, W * 0.4, H, 0, b) + Lf(W * 0.1, H / 2, W * 0.9, H / 2, d, 2.4) + Rf(W * 0.12, H / 2 - 11, 6, 22, 2, d) + Rf(W * 0.88 - 6, H / 2 - 11, 6, 22, 2, d),
    bench: (W, H, b, d) => Rf(1, 0, W - 2, H, W / 2.4, b) + Rf(W * 0.2, 3, W * 0.6, H * 0.22, W / 4, d),
    adjbench: (W, H, b, d) => Rf(1, 0, W - 2, H * 0.36, 5, b) + Rf(1, H * 0.4, W - 2, H * 0.6, 5, b) + Rf(W * 0.2, 3, W * 0.6, H * 0.16, 3, d),
    dumbbells: (W, H, b, d) => Rf(0, 0, W, H, 4, b) + Array.from({ length: Math.floor((H - 4) / 10) }, (_, i) => { const y = 5 + i * 10; return Rf(3, y - 2.5, 4.5, 5, 1.5, d) + Rf(W - 7.5, y - 2.5, 4.5, 5, 1.5, d) + Lf(7, y, W - 7, y, d, 1.4); }).join(''),
    bells: (W, H, b, d) => Array.from({ length: Math.floor(H / 17) }, (_, i) => Cf(W / 2, 8.5 + i * 17, W / 2 - 1.5, b) + Cf(W / 2, 8.5 + i * 17, 2.6, d)).join(''),
    plates: (W, H, b, d) => Cf(W / 2, H / 2, W / 2, b) + Cf(W / 2, H / 2, W / 2 - 5, d) + Cf(W / 2, H / 2, W * 0.16, b),
    barbells: (W, H, b, d) => Rf(0, 0, W, H, 4, b) + Array.from({ length: Math.floor((H - 6) / 12) }, (_, i) => Lf(W / 2, 5 + i * 12, W / 2, 10 + i * 12, d, 4)).join(''),
    landmine: (W, H, b, d) => Cf(W - 10, 10, 9, b) + Lf(6, H - 6, W - 10, 10, d, 3) + Cf(6, H - 6, 4.5, d),
    smith: (W, H, b, d) => Rf(0, 0, W, H, 5, b) + Lf(6, 4, 6, H - 4, d, 2) + Lf(W - 6, 4, W - 6, H - 4, d, 2) + Lf(W / 2, 6, W / 2, H - 6, d, 2.4) + Rf(W / 2 - 8, H * 0.3, 16, 4, 2, d),
    cable: (W, H, b, d, l) => Rf(W * 0.3, W - 6, W * 0.4, H - 2 * W + 12, 2, l) + Rf(0, 0, W, W - 4, 5, b) + Rf(0, H - W + 4, W, W - 4, 5, b) + Cf(W / 2, (W - 4) / 2, 4, d) + Cf(W / 2, H - (W - 4) / 2, 4, d),
    latpull: (W, H, b, d) => Rf(W * 0.3, 0, W * 0.4, 12, 3, b) + Lf(4, 16, W - 4, 16, d, 3) + Rf(W * 0.22, H * 0.44, W * 0.56, 6, 3, d) + Rf(W * 0.26, H * 0.56, W * 0.48, H * 0.42, 6, b),
    chest: (W, H, b, d) => Lf(5, H * 0.14, 5, H * 0.42, d, 3) + Lf(W - 5, H * 0.14, W - 5, H * 0.42, d, 3) + Rf(W * 0.28, H * 0.32, W * 0.44, H * 0.22, 4, d) + Rf(W * 0.24, H * 0.58, W * 0.52, H * 0.4, 6, b) + Rf(W * 0.14, 0, W * 0.72, H * 0.12, 3, b),
    pecdeck: (W, H, b, d) => Pf('M5 ' + H * 0.44 + ' Q ' + W / 2 + ' ' + (-H * 0.12) + ' ' + (W - 5) + ' ' + H * 0.44, d, 3) + Rf(W * 0.3, H * 0.3, W * 0.4, H * 0.16, 3, d) + Rf(W * 0.26, H * 0.5, W * 0.48, H * 0.48, 6, b),
    legpress: (W, H, b, d) => Rf(0, 0, W, H, 6, b) + Rf(W * 0.14, 5, W * 0.72, 10, 3, d) + Rf(W * 0.24, H * 0.56, W * 0.52, H * 0.36, 6, d),
    hack: (W, H, b, d) => Rf(0, 0, W, H, 6, b) + Cf(W * 0.3, 11, 5, d) + Cf(W * 0.7, 11, 5, d) + Rf(W * 0.32, 18, W * 0.36, H * 0.44, 4, d) + Rf(W * 0.14, H - 12, W * 0.72, 8, 3, d),
    legext: (W, H, b, d) => Rf(W * 0.08, H * 0.26, W * 0.84, H * 0.72, 7, b) + Rf(W * 0.08, H * 0.26, W * 0.2, H * 0.72, 4, d) + Lf(W * 0.24, H * 0.1, W * 0.8, H * 0.1, d, 5),
    legcurl: (W, H, b, d) => Rf(W * 0.14, 0, W * 0.72, H * 0.74, 7, b) + Lf(W * 0.16, H * 0.86, W * 0.84, H * 0.86, d, 5),
    hipthrust: (W, H, b, d) => Rf(0, H * 0.3, W, H * 0.7, 6, b) + Rf(1, 0, W - 2, H * 0.24, 5, d) + Lf(5, H * 0.5, W - 5, H * 0.5, d, 2.5),
    preacher: (W, H, b, d) => '<path d="M' + W * 0.1 + ' 1 L' + W * 0.9 + ' 1 L' + W * 0.74 + ' ' + H * 0.46 + ' L' + W * 0.26 + ' ' + H * 0.46 + ' Z" fill="' + d + '"/>' + Rf(W * 0.24, H * 0.56, W * 0.52, H * 0.42, 5, b),
    dip: (W, H, b, d) => Rf(W * 0.12, H - 8, W * 0.76, 8, 3, b) + Lf(W * 0.3, 3, W * 0.3, H - 10, d, 4) + Lf(W * 0.7, 3, W * 0.7, H - 10, d, 4),
    ghd: (W, H, b, d) => Rf(W * 0.14, 0, W * 0.72, H * 0.42, W * 0.3, b) + Lf(W / 2, H * 0.42, W / 2, H - 12, b, 3) + Rf(W * 0.2, H - 12, W * 0.6, 11, 3, d),
    treadmill: (W, H, b, d, l) => Rf(0, 0, W, H, 6, b) + Rf(5, 14, W - 10, H - 19, 3, l) + Lf(5, 7, W - 5, 7, d, 4),
    bike: (W, H, b, d) => Rf(W * 0.3, 10, W * 0.4, H - 18, 4, b) + Cf(W / 2, 8, 7.5, d) + Lf(3, 18, W - 3, 18, d, 3) + Ef(W / 2, H - 7, 5, 7, d),
    airbike: (W, H, b, d) => Rf(W * 0.32, 18, W * 0.36, H - 26, 4, b) + Cf(W / 2, 12, 11.5, b) + Cf(W / 2, 12, 4, d) + Lf(2, 27, W - 2, 27, d, 3) + Ef(W / 2, H - 7, 5, 7, d),
    rower: (W, H, b, d) => Rf(W / 2 - 2.5, 16, 5, H - 16, 2.5, b) + Cf(W / 2, 8, W / 2 - 0.5, b) + Cf(W / 2, 8, 3, d) + Rf(1, 17, W - 2, 6, 2, d) + Rf(W / 2 - 6, H * 0.56, 12, 10, 3, d),
    ski: (W, H, b, d) => Rf(W * 0.24, 0, W * 0.52, H * 0.5, 4, b) + Rf(0, H - 6, W, 6, 3, b) + Cf(W * 0.18, H * 0.68, 3, d) + Cf(W * 0.82, H * 0.68, 3, d),
    elliptical: (W, H, b, d) => Rf(0, 0, W, H, W / 2.4, b) + Lf(5, 8, W - 5, 8, d, 4) + Ef(W * 0.32, H * 0.55, 3.5, 9, d) + Ef(W * 0.68, H * 0.62, 3.5, 9, d),
    stair: (W, H, b, d, l) => Rf(0, 0, W, H, 5, b) + Lf(5, 6, W - 5, 6, d, 4) + Array.from({ length: Math.floor((H - 14) / 7) }, (_, i) => Rf(4, 12 + i * 7, W - 8, 4, 1.5, l)).join(''),
    rig: (W, H, b, d) => Rf(W / 2 - 3, 0, 6, H, 3, b) + Array.from({ length: Math.floor(H / 46) + 1 }, (_, i) => { const y = Math.min(i * 46, H - 8); return Rf(0, y, W, 8, 3, d); }).join(''),
    turf: (W, H, b, d, l) => Rf(0, 0, W, H, 6, l) + Lf(W / 2, 8, W / 2, H - 8, b, 2.5),
    sled: (W, H, b, d) => '<path d="M' + W * 0.1 + ' ' + H + ' L' + W * 0.24 + ' 2 L' + W * 0.76 + ' 2 L' + W * 0.9 + ' ' + H + ' Z" fill="' + b + '"/>' + Cf(W * 0.36, H * 0.42, 3, d) + Cf(W * 0.64, H * 0.42, 3, d),
    boxes: (W, H, b, d) => Rf(0, 0, W, W - 1, 4, b) + Rf(1.5, W + 2, W - 3, W - 3, 4, b) + Rf(3, 2 * W + 3, W - 6, W - 6, 4, d),
    ropes: (W, H, b, d) => Rf(W / 2 - 4, 0, 8, 7, 2, d) + Pf('M' + (W / 2 - 2) + ' 7 q-4 9 0 18 t0 18 t0 18 t0 18', b, 3) + Pf('M' + (W / 2 + 2) + ' 7 q4 9 0 18 t0 18 t0 18 t0 18', b, 3),
    wallballs: (W, H, b, d) => Array.from({ length: Math.floor(H / 15) }, (_, i) => Cf(W / 2, 7.5 + i * 15, W / 2 - 1, b) + Cf(W / 2, 7.5 + i * 15, 2, d)).join(''),
    straps: (W, H, b, d) => Cf(W / 2, 3, 3, d) + Lf(W / 2, 3, 5, H - 7, b, 2.5) + Lf(W / 2, 3, W - 5, H - 7, b, 2.5) + Rf(0, H - 7, 10, 5, 2, d) + Rf(W - 10, H - 7, 10, 5, 2, d),
    bag: (W, H, b, d) => Cf(W / 2, H / 2, W / 2, b) + Cf(W / 2, H / 2, W * 0.2, d),
    ring: (W, H, b, d, l) => Rf(0, 0, W, H, 6, l) + '<rect x="7" y="7" width="' + (W - 14) + '" height="' + (H - 14) + '" rx="3" fill="none" stroke="' + b + '" stroke-width="3"/>' + [[0, 0], [W - 11, 0], [0, H - 11], [W - 11, H - 11]].map(([x, y]) => Rf(x, y, 11, 11, 3, d)).join(''),
    mats: (W, H, b, d, l) => Rf(0, 0, W, H, 6, l) + Array.from({ length: Math.floor(H / 24) - 1 }, (_, i) => Lf(4, (i + 1) * 24, W - 4, (i + 1) * 24, b, 1.5)).join(''),
    reformer: (W, H, b, d) => Rf(0, 0, W, H, 7, b) + Lf(5, 9, W - 5, 9, d, 4) + Rf(4, H * 0.36, W - 8, H * 0.28, 4, d),
    barre: (W, H, b, d) => Lf(W / 2, 1, W / 2, H - 1, d, 3.5),
    mirror: (W, H, b, d) => Rf(0, 0, W, H, 2, b) + Lf(W / 2, 3, W / 2, H - 3, d, 1.5),
    speaker: (W, H, b, d) => Rf(0, 0, W, H, 5, b) + Cf(W / 2, H * 0.6, W * 0.24, d) + Cf(W / 2, H * 0.22, 1.8, d),
    desk: (W, H, b, d) => Rf(0, 0, W * 0.6, H, 5, b) + Cf(W * 0.84, H / 2, W * 0.15, d),
    frames: (W, H, b, d) => Array.from({ length: Math.floor(H / 12) }, (_, i) => Rf(0, 2 + i * 12, W, 9, 2, i % 2 ? b : d)).join(''),
    tree: (W, H, b, d, l) => Cf(W / 2, H / 2, W / 2, l) + Cf(W * 0.38, H * 0.42, W * 0.22, b) + Cf(W * 0.62, H * 0.58, W * 0.2, b),
    counter: (W, H, b, d, l) => Rf(0, 0, W, H, 4, b) + Rf(0, H - 4, W, 4, 2, l),
    island: (W, H, b, d) => Rf(0, 0, W - 18, H, 7, b) + Array.from({ length: 4 }, (_, i) => Cf(W - 7, H * (i + 0.5) / 4, 5.5, d)).join(''),
    range: (W, H, b, d) => Rf(0, 0, W, H, 4, b) + [[0.3, 0.28], [0.7, 0.28], [0.3, 0.68], [0.7, 0.68]].map(([x, y]) => Cf(W * x, H * y, W * 0.15, d)).join(''),
    oven: (W, H, b, d, l) => Rf(0, 0, W, H, 4, b) + [1, 2, 3].map((i) => Cf(W * i / 4, H * 0.17, 1.8, d)).join('') + Rf(4, H * 0.3, W - 8, H * 0.5, 3, l) + Lf(5, H - 5, W - 5, H - 5, d, 2.6),
    fridge: (W, H, b, d, l) => Rf(0, 0, W, H, 4, b) + Lf(W / 2, 3, W / 2, H - 3, l, 1.5) + Lf(W / 2 - 4, H - 7, W / 2 - 4, H - 14, d, 2.5) + Lf(W / 2 + 4, H - 7, W / 2 + 4, H - 14, d, 2.5),
    sink: (W, H, b, d, l) => Rf(0, 0, W, H, 4, b) + Rf(5, 5, W - 10, H * 0.42, 5, d) + Rf(5, H * 0.53, W - 10, H * 0.42, 5, d),
    pantry: (W, H, b, d, l) => Rf(0, 0, W, H, 3, b) + Array.from({ length: Math.floor(H / 12) - 1 }, (_, i) => Rf(2, (i + 1) * 12 - 1, W - 4, 2, 1, l)).join(''),
    table: (W, H, b, d) => Rf(11, 8, W - 22, H - 16, 7, b) + [0.25, 0.5, 0.75].map((f) => Rf(1, H * f - 7, 7, 14, 3, d) + Rf(W - 8, H * f - 7, 7, 14, 3, d)).join('') + Rf(W / 2 - 7, 0, 14, 6, 3, d) + Rf(W / 2 - 7, H - 6, 14, 6, 3, d),
    scale: (W, H, b, d) => Rf(0, 0, W, H, 4, b) + Cf(W / 2, H / 2, W * 0.24, d),
    blender: (W, H, b, d) => Cf(W / 2, H / 2, W / 2, b) + Cf(W / 2, H / 2, W * 0.2, d),
    herbs: (W, H, b, d) => Array.from({ length: Math.floor(H / 14) }, (_, i) => Cf(W / 2, 7 + i * 14, W / 2 - 0.5, b) + Cf(W / 2, 7 + i * 14, 2, d)).join(''),
    board: (W, H, b, d) => Rf(0, 0, W, H, 4, b) + Lf(W * 0.28, H * 0.2, W * 0.28, H * 0.8, d, 2.5) + Cf(W * 0.66, H * 0.38, W * 0.13, d) + Cf(W * 0.66, H * 0.68, W * 0.1, d),
    sofa: (W, H, b, d, l) => Rf(0, 0, W, H, 8, b) + Rf(0, 0, 9, H, 6, d) + Array.from({ length: 2 }, (_, i) => Lf(12, H * (i + 1) / 3, W - 3, H * (i + 1) / 3, l, 1.5)).join(''),
    armchair: (W, H, b, d) => Rf(0, 0, W, H, 9, b) + Rf(0, 0, 9, H, 6, d),
    screen: (W, H, b, d) => Rf(0, 0, W * 0.64, H, 5, b) + Lf(W - 4, 6, W - 4, H - 6, d, 4) + Cf(W * 0.3, H / 2, 5, d),
    shelf: (W, H, b, d) => Rf(0, 0, W, H, 3, b) + Array.from({ length: Math.floor((H - 4) / 6) }, (_, i) => Lf(3, 4 + i * 6, W - 3 - (i % 3) * 2, 4 + i * 6, d, 2.5)).join(''),
    zone: () => ''
  };

// [English name, group, default width, default height]. The name and group are the
// English defaults of profile:studio.kit.<type> / profile:studio.group.<slug>.
export const STUDIO_KIT = Object.freeze({
    dumbbells: ['Dumbbell rack', 'Free weights', 120, 16], bells: ['Kettlebells', 'Free weights', 126, 16], plates: ['Plate tree', 'Free weights', 30, 30],
    barbells: ['Barbell rack', 'Free weights', 70, 14], bench: ['Flat bench', 'Free weights', 18, 56], adjbench: ['Adjustable bench', 'Free weights', 20, 60],
    rack: ['Squat rack', 'Free weights', 78, 46], platform: ['Lifting platform', 'Free weights', 120, 90], landmine: ['Landmine', 'Free weights', 40, 40],
    smith: ['Smith machine', 'Machines', 70, 44], cable: ['Cable machine', 'Machines', 90, 30], latpull: ['Lat pulldown', 'Machines', 40, 56],
    chest: ['Chest press', 'Machines', 44, 50], pecdeck: ['Pec deck', 'Machines', 44, 44], legpress: ['Leg press', 'Machines', 44, 70],
    hack: ['Hack squat', 'Machines', 40, 64], legext: ['Leg extension', 'Machines', 40, 44], legcurl: ['Leg curl', 'Machines', 30, 64],
    hipthrust: ['Hip thrust', 'Machines', 40, 56], preacher: ['Preacher curl', 'Machines', 30, 36], dip: ['Dip station', 'Machines', 30, 40], ghd: ['GHD', 'Machines', 26, 60],
    treadmill: ['Treadmill', 'Cardio', 28, 64], bike: ['Bike', 'Cardio', 22, 46], airbike: ['Air bike', 'Cardio', 26, 48], rower: ['Rower', 'Cardio', 18, 76],
    ski: ['Ski erg', 'Cardio', 24, 24], elliptical: ['Elliptical', 'Cardio', 24, 58], stair: ['Stair climber', 'Cardio', 28, 40],
    rig: ['Pull-up rig', 'Functional', 140, 20], turf: ['Turf lane', 'Functional', 56, 260], sled: ['Sled', 'Functional', 24, 30], boxes: ['Plyo boxes', 'Functional', 64, 20],
    ropes: ['Battle ropes', 'Functional', 12, 80], wallballs: ['Wall balls', 'Functional', 44, 14], straps: ['Suspension straps', 'Functional', 24, 30],
    bag: ['Heavy bag', 'Functional', 22, 22], ring: ['Boxing ring', 'Functional', 150, 150],
    mats: ['Mat area', 'Studio', 100, 70], reformer: ['Reformer', 'Studio', 30, 96], barre: ['Barre', 'Studio', 6, 140], mirror: ['Mirror', 'Studio', 6, 120],
    counter: ['Counter', 'Kitchen', 150, 26], island: ['Island', 'Kitchen', 130, 64], range: ['Stove', 'Kitchen', 30, 34], oven: ['Oven', 'Kitchen', 32, 32], fridge: ['Fridge', 'Kitchen', 32, 36],
    sink: ['Sink', 'Kitchen', 52, 30], pantry: ['Pantry shelves', 'Kitchen', 96, 18], table: ['Table', 'Kitchen', 100, 64], scale: ['Food scale', 'Kitchen', 18, 18],
    blender: ['Blender', 'Kitchen', 16, 16], herbs: ['Herb shelf', 'Kitchen', 70, 12], board: ['Prep board', 'Kitchen', 44, 30],
    sofa: ['Sofa', 'Office', 84, 32], armchair: ['Armchair', 'Office', 32, 32], screen: ['Video desk', 'Office', 60, 24], shelf: ['Bookshelf', 'Office', 80, 14],
    speaker: ['Speaker', 'Studio', 22, 22], desk: ['Desk', 'Studio', 72, 36], frames: ['Client wall', 'Studio', 8, 78], tree: ['Tree', 'Studio', 44, 44], zone: ['Zone', 'Studio', 120, 80]
});

// The groups the editor's "Add what you have" list shows, in order: [slug, English name].
export const STUDIO_GROUPS = Object.freeze([['free', 'Free weights'], ['machines', 'Machines'], ['cardio', 'Cardio'], ['functional', 'Functional'], ['studio', 'Studio']]);
// A nutritionist's kitchen layout lists these instead (owner, 2026-10-30: "lets show a kitchen
// layout, like we did for trainers"): the kitchen's pieces, then the office's for a consult corner.
export const KITCHEN_GROUPS = Object.freeze([['kitchen', 'Kitchen'], ['office', 'Office']]);
const GROUP_SLUG = { 'Free weights': 'free', Machines: 'machines', Cardio: 'cardio', Functional: 'functional', Studio: 'studio', Kitchen: 'kitchen', Office: 'office' };
/** The group slug a piece is listed under. */
export const bsStudioGroupOf = (type) => GROUP_SLUG[(STUDIO_KIT[type] || [])[1]] || 'studio';
/** The pieces of one group, in the kit's order. */
export const bsStudioTypesIn = (slug) => BS_STUDIO_TYPES.filter((t) => STUDIO_KIT[t] && bsStudioGroupOf(t) === slug);

// The room each kind of space draws: [x, y, w, h, border style, corner radius] and its doors
// [x, y, w, h, label key, label x, label y]. Never stored: a coach picks the kind, the room follows.
export const STUDIO_ROOMS = Object.freeze({
  private: { room: [12, 12, 320, 470, 'solid', 12], doors: [[9, 428, 8, 40, 'door', 22, 446]] },
  garage: { room: [40, 70, 280, 330, 'solid', 12], doors: [[100, 396, 160, 8, 'garage', 136, 412]] },
  gym: { room: [12, 12, 320, 480, 'solid', 12], doors: [[150, 489, 44, 8, 'entrance', 150, 500]] },
  pilates: { room: [12, 12, 320, 480, 'solid', 12], doors: [[9, 420, 8, 44, 'door', 22, 440]] },
  boxing: { room: [12, 12, 320, 480, 'solid', 12], doors: [[150, 489, 44, 8, 'entrance', 150, 500]] },
  outdoor: { room: [12, 12, 320, 480, 'dashed', 28], doors: [] },
  kitchen: { room: [12, 12, 320, 300, 'solid', 12], doors: [[36, 308, 44, 8, 'door', 38, 318]] },
  blank: { room: [12, 12, 320, 480, 'solid', 12], doors: [[150, 489, 44, 8, 'door', 160, 500]] },
});
export const bsStudioRoom = (kind) => STUDIO_ROOMS[kind] || STUDIO_ROOMS.blank;
// The kinds a coach starts from, in the editor's order.
export const STUDIO_COACH_KINDS = Object.freeze(['private', 'garage', 'gym', 'pilates', 'boxing', 'outdoor', 'blank']);
// The kinds a nutritionist's kitchen starts from.
export const KITCHEN_COACH_KINDS = Object.freeze(['kitchen', 'blank']);

// The words a starting layout writes (station titles, labels and zone names), by key: the
// English defaults of profile:studio.word.<key>. The editor translates them when the coach picks
// the layout, and from then on they are the coach's own words, stored with the piece.
export const STUDIO_WORDS = Object.freeze({
  squatRack: 'Squat rack', squatRacks: 'Squat racks', rack: 'Rack', racks: 'Racks', platform: 'Platform', kettlebells: 'Kettlebells', speaker: 'Speaker',
  desk: 'Desk', frontDesk: 'Front desk', clientWall: 'Client wall', mats: 'Mats', freeWeights: 'Free weights', machines: 'Machines', cardio: 'Cardio',
  turf: 'Turf', cable: 'Cable machine', reformers: 'Reformers', barre: 'Barre', ring: 'The ring', bags: 'Heavy bags', rig: 'Pull-up rig', meetHere: 'Meet here',
  fridge: 'Fridge', pantry: 'Pantry', stove: 'Stove', oven: 'Oven', prepIsland: 'Prep island', kitchenTable: 'The table',
});

const it = (t, x, y, o = {}) => ({ t, x, y, w: o.w || STUDIO_KIT[t][2], h: o.h || STUDIO_KIT[t][3], ...(o.st ? { st: o.st } : {}), ...(o.label ? { label: o.label } : {}), ...(o.tag ? { tag: o.tag } : {}), ...(o.spot ? { spot: o.spot } : {}) });
// Each layout's pieces. `st`, `label` and `tag` hold STUDIO_WORDS keys until the editor applies them.
export const STUDIO_TEMPLATES = Object.freeze({
  private: [
    it('rack', 28, 108, { st: 'squatRack' }), it('platform', 184, 150, { w: 120, h: 96, st: 'platform', label: 'platform' }), it('bells', 160, 452, { st: 'kettlebells' }), it('speaker', 296, 26, { st: 'speaker' }), it('desk', 40, 372, { st: 'desk', label: 'desk' }), it('frames', 320, 290, { st: 'clientWall' }),
    it('rack', 28, 44), it('rack', 28, 172), it('rack', 28, 236, { label: 'racks' }), it('mirror', 322, 60), it('plates', 120, 52), it('plates', 120, 180), it('adjbench', 210, 290), it('adjbench', 240, 290), it('dumbbells', 160, 420)],
  garage: [
    it('rack', 58, 92, { st: 'rack', label: 'rack' }), it('mats', 172, 92, { st: 'mats' }), it('bells', 58, 306, { w: 100, st: 'kettlebells' }), it('speaker', 290, 82, { st: 'speaker' }), it('desk', 220, 346, { st: 'desk', label: 'desk' }),
    it('adjbench', 84, 160), it('plates', 146, 96), it('dumbbells', 58, 250), it('boxes', 172, 200), it('airbike', 292, 190), it('rower', 296, 252)],
  gym: [
    it('rack', 190, 146, { st: 'squatRacks' }), it('platform', 190, 244, { w: 122, h: 70, st: 'platform' }), it('zone', 22, 120, { w: 150, h: 198, tag: 'freeWeights', st: 'freeWeights', spot: [134, 16] }),
    it('zone', 22, 326, { w: 150, h: 156, tag: 'machines', st: 'machines', spot: [134, 16] }), it('zone', 22, 20, { w: 300, h: 92, tag: 'cardio', st: 'cardio', spot: [284, 16] }),
    it('turf', 270, 326, { w: 52, h: 156, st: 'turf' }), it('cable', 186, 340, { w: 30, h: 90, st: 'cable' }), it('desk', 186, 444, { st: 'frontDesk', label: 'frontDesk' }),
    it('zone', 182, 120, { w: 140, h: 198, tag: 'racks' }),
    it('treadmill', 30, 42), it('treadmill', 62, 42), it('treadmill', 94, 42), it('treadmill', 126, 42), it('elliptical', 166, 45), it('elliptical', 196, 45), it('bike', 232, 54), it('airbike', 260, 42), it('stair', 292, 62, { w: 24 }),
    it('dumbbells', 32, 146, { w: 130 }), it('dumbbells', 32, 168, { w: 130 }), it('adjbench', 40, 200), it('adjbench', 70, 200), it('bench', 104, 202), it('bench', 132, 202), it('bells', 32, 280, { w: 130 }),
    it('rack', 190, 194), it('plates', 282, 152), it('plates', 282, 200),
    it('latpull', 30, 350), it('chest', 76, 352), it('pecdeck', 124, 354), it('legpress', 30, 408), it('hack', 80, 412), it('legcurl', 130, 412),
    it('sled', 284, 344), it('boxes', 230, 342, { w: 20, h: 64 })],
  pilates: [
    it('reformer', 40, 60, { st: 'reformers' }), it('mats', 196, 300, { w: 120, h: 110, st: 'mats' }), it('barre', 322, 120, { st: 'barre' }), it('speaker', 296, 26, { st: 'speaker' }), it('desk', 100, 436, { st: 'frontDesk', label: 'frontDesk' }),
    it('reformer', 86, 60), it('reformer', 132, 60), it('reformer', 178, 60), it('reformer', 224, 60, { label: 'reformers' }), it('mirror', 16, 200), it('wallballs', 226, 450, { w: 90 }), it('straps', 60, 300), it('straps', 100, 300)],
  boxing: [
    it('ring', 30, 40, { st: 'ring' }), it('bag', 240, 60, { st: 'bags' }), it('rack', 30, 270, { st: 'rack', label: 'rack' }), it('turf', 262, 250, { h: 200, st: 'turf' }), it('desk', 120, 430, { st: 'frontDesk', label: 'frontDesk' }),
    it('bag', 282, 60), it('bag', 240, 110), it('bag', 282, 110), it('mirror', 16, 340), it('dumbbells', 120, 280), it('bench', 128, 320, { w: 56, h: 18 }), it('boxes', 130, 370), it('ropes', 220, 300), it('sled', 278, 270)],
  outdoor: [
    it('rig', 40, 70, { st: 'rig', label: 'rig' }), it('turf', 254, 90, { h: 300, st: 'turf' }), it('bells', 40, 190, { st: 'kettlebells' }), it('speaker', 160, 398, { st: 'speaker' }), it('desk', 50, 420, { st: 'meetHere', label: 'meetHere' }),
    it('bench', 54, 270, { w: 56, h: 18 }), it('mats', 40, 306), it('boxes', 160, 190), it('tree', 196, 24), it('tree', 280, 428), it('sled', 270, 110), it('ropes', 200, 260)],
  // A home kitchen: the fridge, counters, sink, stove and oven along the back wall, the pantry on
  // the left, an island to prep on, the table by the door. Counters come before what sits in them,
  // so the sink and the board draw on top.
  kitchen: [
    it('fridge', 22, 22, { w: 36, h: 40, st: 'fridge' }), it('pantry', 22, 92, { w: 18, h: 124, st: 'pantry' }), it('range', 192, 22, { w: 36, h: 34, st: 'stove' }),
    it('oven', 232, 22, { w: 32, h: 34, st: 'oven' }), it('island', 84, 110, { w: 160, h: 64, st: 'prepIsland', spot: [12, 14] }), it('table', 172, 218, { w: 124, h: 72, st: 'kitchenTable' }),
    it('counter', 62, 22, { w: 126, h: 28 }), it('sink', 98, 22, { w: 52, h: 28 }), it('counter', 270, 22, { w: 52, h: 28 }), it('herbs', 312, 66, { w: 12, h: 70 }),
    it('board', 118, 118, { w: 44, h: 30 }), it('scale', 174, 124, { w: 18, h: 18 }), it('blender', 204, 125, { w: 16, h: 16 })],
  blank: [],
});

/**
 * A starting layout as stored pieces, its words translated by `word(key)`. Station notes
 * start empty: what happens at each station is the coach's to write.
 */
export function bsStudioFromTemplate(kind, word = (k) => STUDIO_WORDS[k] || k) {
  return (STUDIO_TEMPLATES[kind] || []).map((p) => {
    const out = { t: p.t, x: p.x, y: p.y, w: p.w, h: p.h };
    if (p.label) out.label = word(p.label);
    if (p.tag) out.tag = word(p.tag);
    if (p.spot) out.spot = p.spot.slice();
    if (p.st) out.st = { title: word(p.st), note: '' };
    return out;
  });
}

/** Where a piece's station number sits on the plan. */
export const bsStudioSpot = (p) => [p.x + (p.spot ? p.spot[0] : p.w / 2), p.y + (p.spot ? p.spot[1] : p.h / 2)];

/** The pieces drawn in order: zones first, so the pieces inside a zone sit on top of it. */
export const bsStudioDrawOrder = (items) => (items || []).map((p, i) => i).sort((a, b) => (items[a].t === 'zone' ? 0 : 1) - (items[b].t === 'zone' ? 0 : 1));

const hexRgb = (h) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(h || ''));
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(',') : null;
};
const svgUri = (w, h, body, attrs = '') => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"' + attrs + '>' + body + '</svg>');
// A piece wider than tall is drawn upright and turned a quarter.
const turned = (w, h, draw) => {
  const turn = w > h;
  const body = draw(turn ? h : w, turn ? w : h);
  return turn ? '<g transform="translate(' + w + ' 0) rotate(90)">' + body + '</g>' : body;
};

/**
 * One piece as an SVG data URI.
 *   ink     the paper's ink as "r,g,b"
 *   light   whether the paper is light
 *   accent  a station's accent hex: its piece takes the coach's colour
 *   line    the editor's line-drawing icon instead of the plan's soft shape
 */
export function bsStudioSvg(type, w, h, { ink = '245,240,230', light = false, accent = null, line = false } = {}) {
  const a = (n) => 'rgba(' + ink + ',' + n + ')';
  const W = Math.max(1, Math.round(Number(w) || 0)), H = Math.max(1, Math.round(Number(h) || 0));
  if (line) {
    const D = lineDrawings(a(light ? 0.6 : 0.64), a(light ? 0.07 : 0.08));
    const body = type === 'zone' ? R(0.6, 0.6, W - 1.2, H - 1.2, 'stroke-dasharray="4 3" stroke-opacity="0.7"') : turned(W, H, D[type] || (() => ''));
    return svgUri(W, H, body, ' fill="none" stroke="' + a(light ? 0.6 : 0.64) + '" stroke-width="1.2"');
  }
  if (type === 'zone') return svgUri(W, H, '<rect width="' + W + '" height="' + H + '" rx="10" fill="' + a(light ? 0.045 : 0.05) + '"/>');
  const t = hexRgb(accent);
  const b = t ? 'rgba(' + t + ',' + (light ? 0.3 : 0.32) + ')' : a(light ? 0.15 : 0.17);
  const d = t ? 'rgba(' + t + ',' + (light ? 0.85 : 0.8) + ')' : a(light ? 0.32 : 0.36);
  const l = t ? 'rgba(' + t + ',' + (light ? 0.16 : 0.18) + ')' : a(light ? 0.08 : 0.09);
  const draw = SOFT[type] || ((W2, H2, bb) => Rf(0, 0, W2, H2, 5, bb));
  return svgUri(W, H, turned(W, H, (W2, H2) => draw(W2, H2, b, d, l)));
}

/**
 * The part of the plan a kitchen layout shows: its room and doors, and every piece with its label,
 * with a little paper round them. [x, y, w, h] in plan units. A kitchen is shorter than a gym, so
 * the profile draws only this much of the 344 × 528 plan rather than a tall empty frame.
 */
export function bsStudioFrame(studio, pad = 10) {
  const items = studio && Array.isArray(studio.items) ? studio.items : [];
  const room = bsStudioRoom(studio && studio.kind);
  const [rx, ry, rw, rh] = room.room;
  let x0 = rx, y0 = ry, x1 = rx + rw, y1 = ry + rh;
  for (const [dx, dy, dw, dh, , , ly] of room.doors) { x0 = Math.min(x0, dx); y0 = Math.min(y0, dy); x1 = Math.max(x1, dx + dw); y1 = Math.max(y1, dy + dh, ly + 12); }
  for (const p of items) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h + (p.label ? 15 : 0)); }
  const fx = Math.max(0, Math.floor(x0 - pad)), fy = Math.max(0, Math.floor(y0 - pad));
  return [fx, fy, Math.min(BS_STUDIO_W, Math.ceil(x1 + pad)) - fx, Math.min(BS_STUDIO_H, Math.ceil(y1 + pad)) - fy];
}
