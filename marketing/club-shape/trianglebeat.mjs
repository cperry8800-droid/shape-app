// trianglebeat.mjs — the Club Shape triangle beat: the pulse's beat as Shape's two triangles
// (pulse-looks.png's C, owner 2026-11-03: "i like this too").
//
// Perfected from the sketch as a quotation of the Shape mark itself:
//   - the beat's falling stroke is the split between the triangles, as the brand art splits its two
//     with one straight channel: the teal ▲ rises on its left, the white ▼ hangs on its right, the
//     channel a stem's width (TV) across, cut through the line too;
//   - the triangles stand upright and even-sided, as the brand art's do beside its leaning letters:
//     their edges are set so that, once the mark leans at the face's slant, each triangle's two sides
//     lean equally (the rising and returning edges at `slope`, the fall at slope + 2·SLANT), so both
//     have the same sharp point; the peak and the dip sit where the pulse's do (0.8 and 0.64 caps);
//   - the triangles stand flush with the line's edges, and the line meets the ▲ along its rising edge,
//     so nothing white shows under the teal and nothing overlaps it;
//   - the line, its small bump (a Λ at the A's angle) and the run to the beat are the pulse's own, in
//     the letters' bar weight, and the whole mark leans at the face's slant.
//
//   node marketing/club-shape/trianglebeat.mjs   writes marketing/club-shape/triangle-beat/ (markset's
//                                                set: both lockups in every colour, the icons, PNGs,
//                                                preview.png)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SLANT, GLYPHS, TH, TV, TD } from '../../prototypes/nora-booth/src/wordmarkGlyphs.mjs';
import { partPolygon } from './build-logo.mjs';
import { PULSE } from './pulse.mjs';
import { LOOKS } from './pulse-looks.mjs';
import { writeSet } from './markset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const A_SLOPE = (() => { const p = GLYPHS.A.parts[0]; return (p.x1 - p.x0) / (p.y1 - p.y0); })();

export const BEAT = {
  ...PULSE.INLINE,      // lead, bump, run, rise, fall, tail: the pulse's
  slope: 0.18,          // the rising and returning edges, upright; the fall is slope + 2·SLANT
  gap: TV,              // the channel between the triangles, across: a stem's width
  line: 1,              // the line's weight, in the letters' bar thickness (TH)
};

/** The triangle beat: { white, teal } in upright caps, the line at v = 0. */
export function beat(spec = BEAT) {
  const { lead, bump, run, rise: R, fall: F, slope: s, tail } = spec;
  const sf = s + 2 * SLANT;                              // the fall (and the channel), upright
  const th = TH * spec.line, td = TD * spec.line, sp = A_SLOPE;
  const hx = (spec.gap / 2) * Math.hypot(1, sf);         // half the channel, measured along the line
  const seg = (a, b) => partPolygon({ k: 'seg', a, b, t: th });
  const leg = (x0, y0, x1, y1) => partPolygon({ k: 'diag', x0, y0, x1, y1, t: td });
  // the bump, as the pulse draws it
  const xb = lead, xbt = xb + sp * bump, xbe = xbt + sp * bump;
  const xr = xbe + run;                                   // the ▲'s rising edge crosses the line here
  const xp = xr + s * R;                                  // the peak
  const splitL = (v) => xp + sf * (R - v);                // the ▲'s side of the channel
  const splitR = (v) => splitL(v) + 2 * hx;               // the ▼'s side
  const xd = splitR(-F);                                  // the dip
  const xe = xd + s * F;                                  // the ▼'s return edge crosses the line here
  const rising = (v) => xr + s * v, returning = (v) => xe + s * v;
  const up = [[rising(-th / 2), -th / 2], [xp, R], [splitL(-th / 2), -th / 2]];
  const down = [[splitR(th / 2), th / 2], [xd, -F], [returning(th / 2), th / 2]];
  const white = [
    seg([0, 0], [xb, 0]),
    leg(xb - sp * th / 2, -th / 2, xbt, bump), leg(xbt, bump, xbe + sp * th / 2, -th / 2),
    // the run to the beat, its end cut along the ▲'s rising edge
    [[xbe, -th / 2], [rising(-th / 2), -th / 2], [rising(th / 2), th / 2], [xbe, th / 2]],
    down,
    seg([returning(-th / 2), 0], [xe + tail, 0]),
  ];
  return { white, teal: [up] };
}

async function main() {
  const sharp = createRequire(join(HERE, '..', '..', 'package.json'))('sharp');
  const sketch = LOOKS.find((l) => l.name === 'Triangle beat').draw(1);
  const written = await writeSet(sharp, {
    dir: join(HERE, 'triangle-beat'), prefix: 'club-shape-beat',
    mark: beat(),
    // the icon: the line heavier, so it holds beside the triangles at icon size
    icon: beat({ ...BEAT, line: 1.8, gap: TV * 1.4, lead: 0.3, tail: 0.34 }),
    stackedCaps: 2.4, iconFill: 0.7,
    compare: [['Before', 'The sketch you picked', sketch], ['Perfected', 'Even-sided, split like the Shape mark', beat()]],
  });
  console.log(`wrote ${written.length} SVGs and PNGs to marketing/club-shape/triangle-beat/, and its preview.png`);
}

main().catch((e) => { console.error(e); process.exit(1); });
