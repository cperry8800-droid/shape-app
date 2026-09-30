// The crowd bake's quadric-error decimator (src/meshDecimate.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weld, decimate, splitByPart } from '../src/meshDecimate.mjs';

// A UV sphere as an unwelded triangle soup (every triangle owns its three corners), so weld()
// has real work to do; the top half is part 1, the bottom half part 0.
function sphereSoup(r = 1, seg = 32, rings = 16) {
  const P = [], part = [];
  const pt = (i, j) => {
    const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2;
    return [r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)];
  };
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
    const tag = j < rings / 2 ? 1 : 0;
    if (j > 0) { P.push(...a, ...b, ...c); part.push(tag); }
    if (j < rings - 1) { P.push(...a, ...c, ...d); part.push(tag); }
  }
  return { soup: Float64Array.from(P), part: Uint8Array.from(part) };
}

test('weld merges coincident corners into a closed sphere', () => {
  const { soup } = sphereSoup();
  const { pos, remap } = weld(soup, 1e-6);
  assert.equal(remap.length, soup.length / 3);
  // 32 × 15 ring vertices + the two poles (the seam at φ = 2π welds onto φ = 0)
  assert.equal(pos.length / 3, 32 * 15 + 2);
});

test('decimate reaches the target, keeps the shape and the part seam, and never flips a face', () => {
  const { soup, part } = sphereSoup();
  const { pos, remap } = weld(soup, 1e-6);
  const faces = Int32Array.from(remap);
  const nf = faces.length / 3;
  const attr = new Float32Array((pos.length / 3) * 2);
  for (let v = 0; v < pos.length / 3; v++) attr[v * 2] = pos[v * 3 + 1] > 0 ? 1 : 0; // a weight on the top half
  const out = decimate({ pos, faces, fpart: part, attr, attrSize: 2, target: 200 });
  assert.ok(nf > 900);
  assert.ok(out.faces.length / 3 <= 200, `faces ${out.faces.length / 3}`);
  assert.ok(out.faces.length / 3 >= 150, 'did not over-collapse');
  // every vertex stays near the unit sphere (the quadrics hold the surface)
  for (let v = 0; v < out.pos.length / 3; v++) {
    const r = Math.hypot(out.pos[v * 3], out.pos[v * 3 + 1], out.pos[v * 3 + 2]);
    assert.ok(Math.abs(r - 1) < 0.08, `vertex ${v} at radius ${r}`);
    assert.ok(Number.isFinite(out.attr[v * 2]));
  }
  // every face still points outward (no flips): its normal agrees with its centroid direction
  for (let f = 0; f < out.faces.length / 3; f++) {
    const [a, b, c] = [0, 1, 2].map((k) => out.faces[f * 3 + k]);
    const p = (i) => [out.pos[i * 3], out.pos[i * 3 + 1], out.pos[i * 3 + 2]];
    const A = p(a), B = p(b), C = p(c);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const m = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    // the soup winds inward (a, c, d order); either way the sign must be the same for every face
    const s = Math.sign(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]);
    if (f === 0) out._sign = s; else assert.equal(s, out._sign, `face ${f} flipped`);
  }
  // the equator seam between the two parts stays at y ≈ 0: every vertex shared by both parts
  const seen = new Map();
  for (let f = 0; f < out.faces.length / 3; f++) for (let k = 0; k < 3; k++) {
    const v = out.faces[f * 3 + k];
    seen.set(v, (seen.get(v) || 0) | (1 << out.fpart[f]));
  }
  let seam = 0;
  for (const [v, mask] of seen) if (mask === 3) { seam++; assert.ok(Math.abs(out.pos[v * 3 + 1]) < 0.06, `seam vertex off the equator: ${out.pos[v * 3 + 1]}`); }
  assert.ok(seam >= 6, `seam vertices ${seam}`);
});

test('decimate is deterministic', () => {
  const { soup, part } = sphereSoup(1, 24, 12);
  const { pos, remap } = weld(soup, 1e-6);
  const run = () => decimate({ pos, faces: Int32Array.from(remap), fpart: part, target: 120 });
  const a = run(), b = run();
  assert.deepEqual(Array.from(a.faces), Array.from(b.faces));
  assert.deepEqual(Array.from(a.pos), Array.from(b.pos));
});

test('splitByPart gives each part its own vertices with shared unit normals', () => {
  const { soup, part } = sphereSoup(1, 16, 8);
  const { pos, remap } = weld(soup, 1e-6);
  const s = splitByPart({ pos, faces: Int32Array.from(remap), fpart: part });
  assert.equal(s.ni, remap.length);
  assert.ok(s.nv > pos.length / 3, 'the equator vertices were split');
  for (let v = 0; v < s.nv; v++) {
    const l = Math.hypot(s.nrm[v * 3], s.nrm[v * 3 + 1], s.nrm[v * 3 + 2]);
    assert.ok(Math.abs(l - 1) < 1e-6);
  }
  for (let f = 0; f < s.ni / 3; f++) {
    const parts = new Set([0, 1, 2].map((k) => s.part[s.index[f * 3 + k]]));
    assert.equal(parts.size, 1, 'a face mixes parts');
  }
});
