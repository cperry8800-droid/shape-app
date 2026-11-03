# Club Shape — logo and launch copy (draft)

Drafts for the owner's review; nothing in the app or the website uses these yet.

**Chosen (owner, 2026-11-03: "move forward with this design"): the two triangles stacked over CLUB
SHAPE**, `club-shape-stacked*.svg`, in the colour versions below. The soundwave (`wave/`) and the
triangle beat (`triangle-beat/`) stay as explorations.

- `copy.md` — the landing hero and the App Store and Google Play listings.
- `preview.png` — every lockup in every colour version, on the background it is for.
- `club-shape-stacked*.svg` — the mark over CLUB SHAPE, as the Shape logo sets it over SHAPE.
- `club-shape-horizontal*.svg` — CLUB ▸◂ SHAPE on one line, as SHAPE ▸◂ RADIO sets its mark.
- `mark-ideas.png` (from `mark-ideas.mjs`) — six other marks to weigh against the triangles, each
  over CLUB SHAPE and as an app icon. Exploration only: no lockup files are made from them.
- `pulse-preview.png` (from `pulse.mjs`) — the pulse mark (idea D) refined into the wordmark's own
  strokes: stacked over CLUB SHAPE, and on one line between CLUB and SHAPE, plus app icons.
- `pulse-looks.png` (from `pulse-looks.mjs`) — six other looks for the pulse between CLUB and SHAPE
  (climb, double beat, triangle beat, soundwave, LED, rounded), each beside the line and as an icon.
- **`wave/` (from `soundwave.mjs`) — the soundwave mark, the owner's pick, perfected**: the pulse as
  slanted audio bars, mirrored about the letters' middle bars, its quiet bars the letters' bar weight.
  `club-shape-wave-horizontal*.svg` (CLUB, the wave, SHAPE) and `club-shape-wave-stacked*.svg` in the
  same seven colour versions as below, `club-shape-wave-icon-{dark,teal,white}.svg` (1024 px,
  square, full-bleed: the stores round the corners), each also in `wave/png/`, and `wave/preview.png`.
- **`triangle-beat/` (from `trianglebeat.mjs`) — the triangle beat, the owner's other pick, perfected**:
  the pulse's beat as Shape's two triangles, upright and even-sided, split by a stem-wide channel
  along the beat's fall as the Shape mark splits its pair. The same files as `wave/`
  (`club-shape-beat-*`). Both sets are written by `markset.mjs`.
- `png/` — each SVG at 2400 px wide: transparent, except the tiles, which carry their own background.

Both lockups come in every colour version below, each with the same sizing and spacing (the stacked
mark is 2.4 caps tall, owner 2026-11-03); a tile only has more room round the logo.

| Suffix | Colours | For |
|---|---|---|
| *(none)* | white words and ◂, teal ▸ | dark backgrounds |
| `-ink` | ink words and ◂, teal ▸ | light backgrounds |
| `-on-white` | a white tile: ink words and ◂, teal ▸ | a tile with its own background |
| `-on-teal` | a teal tile: all white (a teal ▸ would vanish on it) | a tile with its own background |
| `-mono-white` | all white | one-colour use on dark |
| `-mono-black` | all black | one-colour use on light, print |
| `-teal` | CLUB in teal, SHAPE in white | dark backgrounds (an alternate) |

`preview.png` shows them in that order, a row each: stacked on the left, one line on the right.

The letters are the Shape wordmark's own. The brand art has no font file behind it, so
`prototypes/nora-booth/src/wordmarkGlyphs.mjs` rebuilds it as strokes, fitted to
`public/SHAPE-logo-teal-white.png`, and builds C, L, U and B from the same bar, stem and corner (the
club's stage screen already says CLUB SHAPE in them). The SVGs are outlines, so they need no font.
SHAPE keeps the brand's own letter spacing, and the triangles are the brand art's.

Rebuild from the repository root (sharp comes with `npm ci`):

    node marketing/club-shape/build-logo.mjs           # the SVGs, the PNGs and preview.png
    node marketing/club-shape/build-logo.mjs --check   # the rebuilt SHAPE against the brand PNG

`--check` scores each letter's overlap with the brand art (1.000 would be identical); it reads
S 0.911 · H 0.955 · A 0.939 · P 0.946 · E 0.958.
