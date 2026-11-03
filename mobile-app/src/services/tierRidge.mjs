// The tier ridge on the member profile's cover (owner, 2026-11-03: "this top section should show the
// tier line graph we had"), as pure geometry: no React, no window, no theme.
//
// The route sits in a W×H frame: the base low on the left, the summit high on the right, in the shape the
// head's mountain drew until 2026-10-31 (its knee and shoulder as fractions of the rise, so a taller or
// wider frame steepens the climb instead of distorting it). `earned` is the same route cut at `pct` of its
// length and `now` the point it stops on, both from one sampled polyline, so the dot the profile draws at
// `now` sits exactly where the heat ends.
export function bsTierRidgeGeom(W, H, pct) {
  const base = [6, H - 26], peak = [W - 10, 30];
  const rise = base[1] - peak[1];
  const c1 = [W * 0.4, base[1] - rise * (12 / 102)];
  const mid = [W * 0.62, base[1] - rise * (53 / 102)];
  const c2 = [2 * mid[0] - c1[0], 2 * mid[1] - c1[1]]; // T reflects the first control point through mid
  const d = `M ${base[0]} ${base[1]} Q ${c1[0]} ${c1[1]}, ${mid[0]} ${mid[1]} T ${peak[0]} ${peak[1]}`;
  const q = (a, cp, b, t) => [0, 1].map((k) => (1 - t) * (1 - t) * a[k] + 2 * (1 - t) * t * cp[k] + t * t * b[k]);
  const N = 40, pts = [];
  for (let i = 0; i <= N; i++) pts.push(q(base, c1, mid, i / N));
  for (let i = 1; i <= N; i++) pts.push(q(mid, c2, peak, i / N));
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const want = Math.max(0, Math.min(1, Number(pct) || 0)) * lens[lens.length - 1];
  const out = [pts[0]];
  let now = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (lens[i] >= want) {
      const f = (want - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1);
      now = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
      out.push(now);
      break;
    }
    out.push(pts[i]);
    now = pts[i];
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  return { d, earned: out.map((p, i) => `${i ? 'L' : 'M'} ${r2(p[0])} ${r2(p[1])}`).join(' '), now, base, peak };
}
