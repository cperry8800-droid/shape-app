// soundwave.mjs — the Club Shape soundwave mark: the pulse drawn as audio bars (pulse-looks.png's D,
// owner 2026-11-03: "i like this", then "lets perfect it").
//
// Perfected from the sketch in three ways:
//   - mirrored about the line, which runs at the letters' middle-bar height (MID, 0.528 caps), so the
//     tallest bar clears the cap line by 0.33 caps and the baseline by 0.27 (the sketch's shallower
//     fall left 0.33 and 0.11);
//   - the quiet bars are exactly the letters' bar thickness (TH), so the quiet stretch reads as a line
//     in the letters' own pen, not dashes of three lengths;
//   - the loud bars climb and fall in an even rhythm (a small bump, then the beat), the three loudest in
//     teal. Every bar is a stem's width (TV), leaning at the face's slant.
//
//   node marketing/club-shape/soundwave.mjs   writes marketing/club-shape/wave/ (markset.mjs's set: the
//                                             one-line and stacked lockups in every colour, the app
//                                             icons, PNGs, preview.png)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { TH, TV } from '../../prototypes/nora-booth/src/wordmarkGlyphs.mjs';
import { writeSet } from './markset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const Q = TH / 2;   // a quiet bar's half-height: the letters' bar thickness in all

// Each bar's reach above the line and below it, in caps, left to right.
export const WAVE = {
  bars: [Q, Q, 0.13, Q, Q, 0.1, 0.4, 0.8, 0.52, 0.2, 0.09, Q, Q].map((a) => [a, a]),
  width: TV,          // a bar: a stem's width
  gap: 0.085,         // between bars
  loud: 0.4,          // a bar this loud or louder is the beat, in teal
};
// The sketch the owner picked, for the before-and-after row: three heights of quiet bar, the reach
// below the line 0.8 of the reach above it.
const SKETCH = { ...WAVE, bars: [0.05, 0.07, 0.14, 0.07, 0.05, 0.1, 0.42, 0.8, 0.5, 0.18, 0.08, 0.05, 0.05].map((a) => [a, a * 0.8]) };

/** The bars as outlines, upright caps (the line at v = 0): { white, teal }. */
function bars(spec = WAVE, from = 0, to = spec.bars.length) {
  const white = [], teal = [];
  spec.bars.slice(from, to).forEach(([up, down], i) => {
    const x = i * (spec.width + spec.gap);
    (up >= spec.loud ? teal : white).push([[x, -down], [x + spec.width, -down], [x + spec.width, up], [x, up]]);
  });
  return { white, teal };
}
// The wave over CLUB SHAPE: 2.6 caps tall (a touch over the triangles' 2.4: its quiet bars carry less
// weight), its bars a mark's weight. The app icon: the wave's middle nine bars (the bump through the
// beat), filling 68% of the tile.
export const STACKED_CAPS = 2.6;

async function main() {
  const sharp = createRequire(join(HERE, '..', '..', 'package.json'))('sharp');
  const written = await writeSet(sharp, {
    dir: join(HERE, 'wave'), prefix: 'club-shape-wave', mark: bars(WAVE), icon: bars(WAVE, 2, 11),
    stackedCaps: STACKED_CAPS, iconFill: 0.68,
    compare: [['Before', 'The sketch you picked', bars(SKETCH)], ['Perfected', 'Mirrored, even quiet bars, a cleaner beat', bars(WAVE)]],
  });
  console.log(`wrote ${written.length} SVGs and PNGs to marketing/club-shape/wave/, and wave/preview.png`);
}

main().catch((e) => { console.error(e); process.exit(1); });
