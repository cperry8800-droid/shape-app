// The stage screen's artwork: the Shape mark's two triangles over CLUB SHAPE, in the wordmark's own
// face. The brand art only has S H A P E, so C L U B are built from the same strokes; what vouches for
// them is that S H A P E, rebuilt the same way, still match the brand PNG letter by letter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../src/pngRgba.mjs';
import { GLYPHS, inGlyph, SLANT } from '../src/wordmarkGlyphs.mjs';
import { buildScreenArt, hex, ART } from '../src/screenArt.mjs';
import { CLUB_SHAPE_MASK } from '../../../public/newdesign/booth/clubShapeMask.mjs';

const LOGO = fileURLToPath(new URL('../../../public/SHAPE-logo-teal-white.png', import.meta.url));

test('the rebuilt S H A P E match the brand wordmark (IoU ≥ 0.9 each), so C L U B share its face', () => {
  const { W, px } = decodePng(LOGO);
  const cap = 340, base = 1581, y0 = 1235, y1 = 1586;
  const at = { S: 296, H: 960, A: 1610, P: 2343, E: 2985 };   // each letter's left edge in the art
  for (const [ch, a0] of Object.entries(at)) {
    let best = 0;
    for (let dx = -0.04; dx <= 0.0401; dx += 0.01) {           // the letter's placement, not its shape
      let i = 0, u = 0;
      for (let y = y0; y < y1; y += 2) for (let x = a0 - 40; x < a0 + 520; x += 2) {
        const yu = (base - (y + 0.5)) / cap, xu = (x + 0.5 - a0) / cap - dx - SLANT * yu;
        const mine = inGlyph(GLYPHS[ch], xu, yu), brand = px[(y * W + x) * 4 + 3] > 128;
        if (mine && brand) i++; if (mine || brand) u++;
      }
      best = Math.max(best, i / u);
    }
    assert.ok(best >= 0.9, `${ch}: IoU ${best.toFixed(3)}`);
  }
});

test('clubShapeMask.mjs is current (re-run node screen-mask.mjs if this fails)', () => {
  const m = buildScreenArt();
  assert.equal(CLUB_SHAPE_MASK.cols, m.cols);
  assert.equal(CLUB_SHAPE_MASK.rows, m.rows);
  assert.equal(CLUB_SHAPE_MASK.white, hex(m.white));
  assert.equal(CLUB_SHAPE_MASK.teal, hex(m.teal));
});

// lit dots (coverage over half), grouped 8-connected
function components(M, key, r0, r1) {
  const { cols } = M, v = M[key], seen = new Uint8Array(cols * M.rows);
  const lit = (i) => parseInt(v[i], 16) > 7;
  let n = 0;
  for (let r = r0; r < r1; r++) for (let q = 0; q < cols; q++) {
    const i = r * cols + q;
    if (seen[i] || !lit(i)) continue;
    n++;
    const st = [i]; seen[i] = 1;
    while (st.length) {
      const j = st.pop(), jr = (j / cols) | 0, jq = j % cols;
      for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) {
        const rr = jr + dr, qq = jq + dq;
        if (rr < r0 || rr >= r1 || qq < 0 || qq >= cols) continue;
        const k = rr * cols + qq;
        if (!seen[k] && lit(k)) { seen[k] = 1; st.push(k); }
      }
    }
  }
  return n;
}

test('the screen reads CLUB SHAPE under the two triangles: nine letters, one teal ▸, one white ◂', () => {
  const M = CLUB_SHAPE_MASK;
  const textTop = M.rows - ART.pad - ART.capDots - 1;
  assert.equal(components(M, 'white', textTop, M.rows), 9, 'nine letters on the baseline');
  assert.equal(components(M, 'white', 0, textTop), 1, 'the white ◂ above');
  assert.equal(components(M, 'teal', 0, M.rows), 1, 'the teal ▸, and no teal anywhere else');
  // the top and bottom bars land on one row of dots each (the cap height is hinted to whole dots)
  assert.equal(ART.capDots, Math.round(ART.capDots));
  // it fits the 192 × 112 screen, and the wordmark spans most of it
  assert.ok(M.cols <= 192 && M.cols >= 170, `cols ${M.cols}`);
  assert.ok(M.rows <= 84, `rows ${M.rows}`);
});
