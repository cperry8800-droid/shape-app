// The stage screen's artwork: the Shape mark's two triangles over CLUB SHAPE, in the wordmark's own
// face. The brand art only has S H A P E, so C L U B are built from the same strokes; what vouches for
// them is that S H A P E, rebuilt the same way, still match the brand PNG letter by letter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../src/pngRgba.mjs';
import { GLYPHS, inGlyph, SLANT } from '../src/wordmarkGlyphs.mjs';
import { buildScreenArt, hex, ART, ARTWORKS } from '../src/screenArt.mjs';
import { CLUB_SHAPE_MASK, SHAPE_RADIO_MASK, NORA_MASK } from '../../../public/newdesign/booth/clubShapeMask.mjs';

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
  const masks = { clubShape: CLUB_SHAPE_MASK, shapeRadio: SHAPE_RADIO_MASK, nora: NORA_MASK };
  assert.deepEqual(Object.keys(masks), Object.keys(ARTWORKS));
  for (const [k, M] of Object.entries(masks)) {
    const m = buildScreenArt(ARTWORKS[k]);
    assert.equal(M.cols, m.cols, k);
    assert.equal(M.rows, m.rows, k);
    assert.equal(M.baseRow, m.baseRow, k);
    assert.equal(M.white, hex(m.white), k);
    assert.equal(M.teal, hex(m.teal), k);
  }
  // CLUB SHAPE is the artwork it always was: the headliner screen added two, it changed none.
  assert.deepEqual(buildScreenArt(), buildScreenArt(ARTWORKS.clubShape));
});

test('the headliner screen: every artwork fits the 192 × 112 wall, NORA is the biggest, the mark only on the lockups', () => {
  const WALL = { cols: 192, rows: 112 };
  const masks = { clubShape: CLUB_SHAPE_MASK, shapeRadio: SHAPE_RADIO_MASK, nora: NORA_MASK };
  const litRows = (M, key) => {
    const v = M[key], out = new Set();
    for (let i = 0; i < v.length; i++) if (parseInt(v[i], 16) > 7) out.add((i / M.cols) | 0);
    return out.size;
  };
  for (const [k, M] of Object.entries(masks)) {
    assert.ok(M.cols <= WALL.cols, `${k}: ${M.cols} columns on a ${WALL.cols}-column wall`);
    assert.ok(M.baseRow + 1 - M.rows >= 0 && M.baseRow < WALL.rows, `${k}: rows ${M.baseRow + 1 - M.rows}..${M.baseRow} off the wall`);
    assert.equal(M.white.length, M.cols * M.rows, k);
  }
  assert.ok(ARTWORKS.nora.capDots > 2 * ARTWORKS.clubShape.capDots, 'the headliner is the biggest thing on the wall');
  assert.equal(litRows(NORA_MASK, 'teal'), 0, 'NORA alone: no mark');
  assert.ok(litRows(SHAPE_RADIO_MASK, 'teal') > 0 && litRows(CLUB_SHAPE_MASK, 'teal') > 0, 'the venue and the station carry the mark');
  // SHAPE RADIO under the mark: ten letters on the baseline
  const radioTextTop = SHAPE_RADIO_MASK.rows - ART.pad - ARTWORKS.shapeRadio.capDots - 1;
  assert.equal(components(SHAPE_RADIO_MASK, 'white', radioTextTop, SHAPE_RADIO_MASK.rows), 10);
  // the name's letters land on the wall as four separate shapes, N O R A
  assert.equal(components(NORA_MASK, 'white', 0, NORA_MASK.rows), 4);
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
