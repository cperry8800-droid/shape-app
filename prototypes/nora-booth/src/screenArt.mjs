// screenArt.mjs — the stage screen's artwork: the Shape mark's two triangles over CLUB SHAPE, laid out
// in LED dots and sampled to per-dot coverage. Pure (no DOM, no randomness); screen-mask.mjs writes
// its output to clubShapeMask.mjs, and the test re-runs it to check that file is current.
import { SLANT, GLYPHS, inGlyph, layoutWord } from './wordmarkGlyphs.mjs';

// The two triangles, as the brand art draws them (public/SHAPE-logo-teal-white.png, pixel corners
// measured from its alpha): the teal ▸ low on the left, the white ◂ high on the right.
export const MARK_PNG = {
  teal: [[1556, 511], [1557, 988], [1898, 745]],
  white: [[2160, 201], [2161, 685], [1820, 444]],
  box: { x0: 1553, x1: 2168, y0: 201, y1: 989 },
  cap: 340,               // the wordmark's cap height in the same art, for the mark's scale
};

export const ART = {
  word: 'CLUB SHAPE',
  capDots: 12,            // the cap height in whole dots, so the top and bottom bars each land on one
                          //   row of dots (LED lettering is hinted to its grid, or a bar straddling
                          //   two rows reads as two dim ones); CLUB SHAPE is then ≈180 of the 192
  gap: 0.5,               // between letters, in caps (the brand sets SHAPE at 0.79; tighter here so
                          //   the letters are as big as a 192-dot screen allows)
  space: 0.9,             // a word space, on top of the gap
  markCaps: 2.8,          // the mark's height, in caps (the brand's own lockup is 2.32; a longer
                          //   wordmark carries a slightly bigger mark)
  markGap: 0.75,          // mark to cap line, in caps (the brand's is 0.74)
  pad: 1,                 // empty dots round the lockup
  ss: 8,                  // samples per dot, per axis
};

const inTri = (t, x, y) => {
  const s = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d1 = s(t[0], t[1]), d2 = s(t[1], t[2]), d3 = s(t[2], t[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

/** Build the lockup mask: { cols, rows, white, teal, capDots } (white/teal: Uint8Array 0–15 per dot, row 0 on top). */
export function buildScreenArt(a = ART) {
  const lay = layoutWord(a.word, a.gap, a.space);
  const cap = a.capDots, widthDots = cap * lay.width;
  const markH = a.markCaps * cap, mk = MARK_PNG, k = markH / (mk.box.y1 - mk.box.y0), markW = (mk.box.x1 - mk.box.x0) * k;
  const cols = Math.ceil(widthDots) + 2 * a.pad;
  const rows = Math.ceil(markH + a.markGap * cap + cap) + 2 * a.pad;
  const base = rows - a.pad;                       // the baseline, in dots from the top
  const left = (cols - widthDots) / 2;            // the word's upright left edge at the baseline
  // the mark, centred over the word: at half a cap up (where the oblique leaves the letters' middle)
  // the word runs from left + SLANT·cap/2 to left + widthDots − SLANT·cap/2, centred on left + widthDots/2
  const markX0 = left + widthDots / 2 - markW / 2;
  const markY0 = a.pad;
  const white = new Uint8Array(cols * rows), teal = new Uint8Array(cols * rows);
  const n = a.ss, inv = 1 / n;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    let w = 0, t = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const X = q + (i + 0.5) * inv, Y = r + (j + 0.5) * inv;
      // the mark
      const px = mk.box.x0 + (X - markX0) / k, py = mk.box.y0 + (Y - markY0) / k;
      if (inTri(mk.teal, px, py)) { t++; continue; }
      if (inTri(mk.white, px, py)) { w++; continue; }
      // the word
      const yu = (base - Y) / cap;
      if (yu < -0.01 || yu > 1.01) continue;
      const xu = (X - left) / cap - SLANT * yu;
      for (const G of lay.glyphs) if (xu >= G.x - 0.05 && xu <= G.x + G.g.w + 0.05 && inGlyph(G.g, xu - G.x, yu)) { w++; break; }
    }
    white[r * cols + q] = Math.round((15 * w) / (n * n));
    teal[r * cols + q] = Math.round((15 * t) / (n * n));
  }
  return { cols, rows, white, teal, capDots: cap, markDots: markH };
}

export const hex = (arr) => Array.from(arr, (v) => v.toString(16)).join('');
export { GLYPHS };
