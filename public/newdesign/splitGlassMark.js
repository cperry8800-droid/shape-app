// Split glass: the splash mark in 3D (owner, 2026-10-26: "can we make the triangles look more
// 3d on the splash pages", then "do split glass" from the preview's options). The mark's two
// triangles become glass prisms at two depths. They spin in from edge-on, then drift so the
// pieces slide past each other. It draws on the homepage splash (index.html, #shape-intro) and
// on the app's launch and hold screens (BSShapeMark in iosAppBroadsheetMain.jsx).
//
// Loads as a plain <script> on the website (exposes window.SplitGlassMark), as a side-effect
// import in the app's bundle, and via require() in Node (tests/split-glass-mark.test.mjs).
// pose() and render() are pure. play() is the one part that touches the page: it writes each
// frame into an SVG <g>, and stops itself once settled or stopped.
//
// ⚠ NO WEBGL, NO LIBRARY. Each frame turns the two prisms in 3D and writes ten flat polygons
// into the mark's own SVG, in that SVG's own coordinates, so the mark keeps its box: the
// homepage's hand-off measures `.imark` to glide it into the summit flag.
// ⚠ IT ENDS AS THE FLAT MARK. settle() turns it face-on, closes the gap, flattens the prisms
// and fills them solid in the flag's colors, so what glides into the summit flag IS the flag.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SplitGlassMark = api;
})(typeof window !== "undefined" ? window : null, function () {
  const TAU = Math.PI * 2;
  const FOCAL = 300; // the camera's distance, in the mark's own units
  const DEPTH = 14; // each prism's thickness
  const SEP = 11; // how far each triangle sits in front of (teal) or behind (white) the middle
  // Seconds from edge-on to facing (owner, 2026-10-26: "make the spin a little slower", from 2.3).
  // It eases out, so by the homepage splash's 2.9 s end it is turning less than a degree.
  const SPIN = 3.0;
  const SETTLE = 0.6; // seconds from wherever it is to the flat mark

  const clamp = (x) => Math.min(1, Math.max(0, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const r2 = (x) => Math.round(x * 100) / 100;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };

  // A key light from the top left and a weak fill from the lower right, both fixed to the camera.
  const LIGHTS = [
    { d: norm([-0.45, 0.62, 0.85]), k: 1 },
    { d: norm([0.8, -0.35, 0.45]), k: 0.28 },
  ];
  const HALF = LIGHTS.map((l) => norm(add(l.d, [0, 0, 1])));

  // Each surface's mark, in its SVG's own coordinates (y down): `rgb` tints the glass, `edge` is
  // the lit edges' color, and `solid` is the flat fill the mark settles into.
  const SITE = {
    center: [47.5, 57], // index.html's .imark, viewBox 8 8 79 98
    tris: [
      { pts: [[14, 47], [14, 100], [51, 73]], rgb: [52, 214, 197], edge: "120,240,226", solid: "#34d6c5" },
      { pts: [[81, 14], [81, 65], [44, 39]], rgb: [238, 243, 240], edge: "255,255,255", solid: "rgba(238,243,240,.92)" },
    ],
  };
  const APP = {
    center: [50, 50], // BSShapeMark, viewBox 0 0 100 100
    tris: [
      { pts: [[20, 40], [20, 88], [56, 64]], rgb: [10, 197, 168], edge: "110,235,215", solid: "#0ac5a8" },
      { pts: [[80, 12], [80, 60], [44, 36]], rgb: [255, 255, 255], edge: "255,255,255", solid: "#ffffff" },
    ],
  };

  // The flat mark (the summit flag), and the one still pose reduced motion gets.
  const REST = { rx: 0, ry: 0, sep: 0, depth: 0, fill: 1 };
  const STILL = { rx: 0.12, ry: 0.32, sep: SEP, depth: DEPTH, fill: 0 };

  /** The pose `e` seconds in: 1.25 turns from edge-on that ease out into a slow drift, while
   *  the two triangles part to their depths. */
  function pose(e) {
    const k = easeOut(clamp(e / SPIN));
    return {
      rx: (0.1 + 0.18 * Math.sin(e * 0.55 + 0.6)) * k,
      ry: 0.55 * Math.sin(e * 0.42) * k - 2.5 * Math.PI * (1 - k),
      sep: SEP * easeOut(clamp((e - 0.6) / 1.6)),
      depth: DEPTH,
      fill: 0,
    };
  }

  // The short way round: a spin cut short near -2π would otherwise unwind a whole turn.
  const wrap = (a) => {
    a %= TAU;
    return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;
  };
  function blend(a, b, k) {
    return {
      rx: lerp(wrap(a.rx), b.rx, k),
      ry: lerp(wrap(a.ry), b.ry, k),
      sep: lerp(a.sep, b.sep, k),
      depth: lerp(a.depth, b.depth, k),
      fill: lerp(a.fill, b.fill, k),
    };
  }

  // A triangular prism (y up, +z toward the camera), every face wound outward: the front face
  // first, then the back, then the three sides.
  function prism(t, z0, d) {
    const ccw = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1]) > 0;
    const p = ccw ? t : [t[0], t[2], t[1]];
    const F = p.map(([x, y]) => [x, y, z0 + d / 2]);
    const B = p.map(([x, y]) => [x, y, z0 - d / 2]);
    const faces = [{ v: F, front: true }, { v: [B[0], B[2], B[1]] }];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      faces.push({ v: [F[i], B[i], B[j], F[j]] });
    }
    return faces;
  }

  /** The SVG markup for one pose of `spec`'s mark. Glass draws every face, back ones first, so
   *  the far edges show through; `fill` fades the glass out and the solid front faces in. */
  function render(spec, p) {
    const [cx, cy] = spec.center;
    const cX = Math.cos(p.rx), sX = Math.sin(p.rx), cY = Math.cos(p.ry), sY = Math.sin(p.ry);
    const turn = (v) => {
      const x = v[0] * cY + v[2] * sY, z = -v[0] * sY + v[2] * cY;
      return [x, v[1] * cX - z * sX, v[1] * sX + z * cX];
    };
    const pt = (v) => {
      const s = FOCAL / (FOCAL - v[2]);
      return r2(cx + v[0] * s) + "," + r2(cy - v[1] * s);
    };
    const glass = 1 - p.fill;
    // The triangle further from the camera is painted first.
    const parts = spec.tris
      .map((tri, i) => {
        const local = tri.pts.map(([x, y]) => [x - cx, cy - y]);
        const faces = prism(local, i ? -p.sep : p.sep, p.depth).map((f) => ({ front: !!f.front, v: f.v.map(turn) }));
        const z = faces.reduce((s, f) => s + f.v.reduce((t, v) => t + v[2], 0), 0);
        return { tri, faces, z };
      })
      .sort((a, b) => a.z - b.z);
    let out = "";
    for (const { tri, faces } of parts) {
      if (glass > 0.001) {
        const lit = [];
        for (const f of faces) {
          const n = cross(sub(f.v[1], f.v[0]), sub(f.v[2], f.v[0]));
          const len = Math.hypot(n[0], n[1], n[2]);
          if (len < 1e-9) continue; // a side with no thickness left
          const u = [n[0] / len, n[1] / len, n[2] / len];
          const facing = dot(n, sub([0, 0, FOCAL], f.v[0])) > 0;
          lit.push({ f, u, facing, z: f.v.reduce((s, v) => s + v[2], 0) / f.v.length });
        }
        lit.sort((a, b) => a.facing - b.facing || a.z - b.z);
        for (const { f, u, facing } of lit) {
          // Faces turned edge-on to the camera read thicker, the way glass does.
          const fres = Math.pow(1 - Math.abs(u[2]), 1.5);
          const sp = HALF.reduce((s, h, k) => s + LIGHTS[k].k * Math.pow(Math.max(0, dot(u, h)), 36), 0);
          const alpha = Math.min(0.9, 0.07 + 0.4 * fres + 0.55 * sp) * glass;
          const col = tri.rgb.map((c) => Math.round(Math.min(255, lerp(c, 255, clamp(sp * 0.85))))).join(",");
          const edge = ((facing ? 0.5 : 0.28) + 0.4 * fres) * glass;
          out += `<polygon points="${f.v.map(pt).join(" ")}" fill="rgb(${col})" fill-opacity="${r2(alpha)}"`
            + ` stroke="rgba(${tri.edge},${r2(edge)})" stroke-width="${facing ? 0.7 : 0.45}" stroke-linejoin="round"/>`;
        }
      }
      if (p.fill > 0.001) {
        const op = p.fill < 0.999 ? ` opacity="${r2(p.fill)}"` : "";
        out += `<polygon points="${faces[0].v.map(pt).join(" ")}" fill="${tri.solid}"${op}/>`;
      }
    }
    return out;
  }

  /** Draw `spec`'s mark into the SVG group `g`, one frame per animation frame, from `start`
   *  (default now; the app passes its first mount's, so a second screen picks up the drift
   *  instead of spinning in again). Reduced motion, or no animation frames, draws STILL once.
   *  Returns settle(), which brings it to the flat mark in SETTLE seconds and stops, and stop(). */
  function play(g, spec, opts) {
    const o = opts || {};
    const clock = o.now || (() => performance.now());
    const raf = o.raf || (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
    const t0 = o.start != null ? o.start : clock();
    const draw = (p) => {
      g.innerHTML = render(spec, p);
    };
    let live = true, settleAt = null, from = null;
    if (o.reduced || !raf) {
      draw(STILL);
      return { settle() { live = false; draw(REST); }, stop() { live = false; } };
    }
    const frame = () => {
      if (!live) return;
      const now = clock();
      let p = pose((now - t0) / 1000);
      if (settleAt != null) {
        const k = easeInOut(clamp((now - settleAt) / (SETTLE * 1000)));
        p = blend(from, REST, k);
        if (k >= 1) live = false;
      }
      draw(p);
      if (live) raf(frame);
    };
    frame();
    return {
      settle() {
        if (settleAt != null || !live) return;
        settleAt = clock();
        from = pose((settleAt - t0) / 1000);
      },
      stop() { live = false; },
    };
  }

  return { SITE, APP, REST, STILL, SPIN, SETTLE, pose, blend, render, play };
});
