# Club Shape — logo and launch copy (draft)

Drafts for the owner's review; nothing in the app or the website uses these yet.

- `copy.md` — the landing hero and the App Store and Google Play listings.
- `preview.png` — every lockup on the background it is for.
- `club-shape-stacked*.svg` — the mark over CLUB SHAPE, as the Shape logo sets it over SHAPE.
- `club-shape-horizontal*.svg` — CLUB ▸◂ SHAPE on one line, as SHAPE ▸◂ RADIO sets its mark.
- `png/` — each SVG at 2400 px wide, on a transparent background.

| Suffix | Colours | For |
|---|---|---|
| *(none)* | white words and ◂, teal ▸ | dark backgrounds |
| `-ink` | ink words and ◂, teal ▸ | light backgrounds |
| `-teal` | CLUB in teal, SHAPE in white | dark backgrounds (an alternate) |
| `-mono-white`, `-mono-black` | one colour | stamps, embossing, one-colour print |

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
