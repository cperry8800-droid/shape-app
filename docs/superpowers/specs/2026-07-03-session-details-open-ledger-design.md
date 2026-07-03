# Session Details "Open Ledger" redesign — design spec

**Date:** 2026-07-03 · **Status:** approved by owner (direction pick + mockup review)
**Surface:** the mobile activity detail page (`BSActivityDetail`, stats view) in
`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the **hero + GPS route +
Summary section only**. The living charts below (Pace/Power/HR traces, zone cells,
splits bars from #1518) and the comments-focus page are **unchanged**.

## Problem

The top of the session page is 10 near-identical bordered boxes (1 hero plate + 1
route box + 8 uniform summary tiles) — generic, boxy, and visually flat. Separately,
the hero's radial heat-wash paints 18px above its own container, bleeding over the
author/avatar row (`inset: '-18px -16px -14px'` at ~line 10890).

## Direction (owner-picked)

**Open Ledger / "race telegram":** zero boxes. The section reads as pure typography
threaded on a vertical **heat rail**, with the route inked straight onto the paper
and stats as a **two-register ledger**. Three grafts folded in from the rejected
concepts, plus two owner adjustments:

1. **PR readout** (from "Rangefinder"): ink text + heat arrow/underline — AA-safe on
   light papers with no contrast guard.
2. **Route marks** (from "Route Stage"): heat-stroked self-drawing polyline, hollow
   start square, popping heat end dot.
3. **Pace needle** (owner request, from "Route Stage"): the AVG PACE ledger row
   carries a needle-on-tick-scale band showing where the average sits between the
   session's slowest and fastest.
4. **Owner sizing:** hero figure reduced from the concept's 72px to **50px**; primary
   ledger values **30px**.

## Design

### 0 · Bleed fix (root cause)

**Delete the heat-wash div entirely** (`inset:'-18px -16px -14px'`). The rail carries
the page's temperature now; no ambient fill remains, so the overdraw class of bug is
structurally impossible. Add a **hairline** under the author row
(`height:1, bsTHexA(t.INK,0.08), margin:'14px 0 0'`) as a hard "filed-by" cut line.
Title `marginTop` 15 → 18 for real whitespace separation.

### 1 · The heat rail

One `position:relative` wrapper spans **hero → route → summary** (it must END before
the first chart `secHead` — the charts own their `paddingLeft:34` axis gutters).

- Rail: absolutely positioned column, `left:0, top:6, bottom:0, width:2,
  borderRadius:1`, `background: linear-gradient(180deg, heat, bsTHexA(heat,.35) 38%,
  bsTHexA(t.INK,.12) 72%, transparent)`.
- Content sits at `paddingLeft:15` **inside the existing 16px body gutter** (no
  double-gutter: the rail replaces no padding, it lives in the content column's left
  15px; total left offset stays visually aligned with the author row above).
- A 3×10px **needle tick** rides the rail beside the hero figure and breathes
  (`bsSdPrBreath`, `--sd-glow: bsTHexA(heat,.4)`, 3.2s infinite) — the instrument at
  rest.
- Boot: the rail grows in (`transformOrigin:'top'`, new keyframe **`bsSdGrowY`**
  `scaleY(0)→scaleY(1)`, 1100ms cubic-bezier(.4,0,.2,1) 200ms) while the hero number
  counts — the section's one theatrical beat.

### 2 · Hero (unboxed)

Delete all hero plate chrome: both clip-path layers, the 3px spine, the corner
bracket, the pill PR chip, the standalone title pulse-rule (the hero's own ledger
rule below replaces it — one rule, not two).

- Title: unchanged serif 25px + heat period.
- Eyebrow: `d.heroStat[0]` mono 7.5px, 0.2em, uppercase, `bsTHexA(t.INK,.5)`,
  `marginTop:14`.
- Figure: split value/unit via `String(v).match(/^([^a-zA-Z%]*[\d.,:]+)\s*(.*)$/)`.
  Number = `t.DISPLAY` **50px**, w700, `-0.04em`, `lineHeight:.95`, tabular,
  `t.INK`, through `BSSdCountUp` (times render static per its existing rule);
  clamp `fontSize:'min(50px, 12.5vw)'` for long strength values ("8,150 lb").
  Unit = mono 12px w700 `bsTHexA(t.INK,.55)`, baseline-aligned, 6px gap.
- Hero ledger rule: `height:2, marginTop:11, background:linear-gradient(90deg, heat,
  bsTHexA(heat,.25) 55%, transparent)`, drawn with `bsSdDrawX`.
- **PR readout** (when `d.prDelta`): right-aligned above the rule — heat `↑` glyph +
  `PR +0.3 MI` in **t.INK** mono 9px 800 + a 1px **heat underline** under the text.
  No pill, no background, no contrast guard needed (text is always ink).
- `d.body` caption + co-sign stamp unchanged.

### 3 · Route

Section head = a rail "station": 6×1.5px heat tick crossing the rail + mono
`ROUTE · GPS` 7.5px eyebrow, `margin:'20px 0 8px'`.

- **Real route** (`d.routeObj.points`, already 0–100 normalized viewBox pairs —
  verified in `BSActivityRoutePreview` at line ~6361): unboxed inline SVG
  (`viewBox="0 0 100 44"`, `preserveAspectRatio="xMidYMid meet"`, height 96, width
  100%). One `<path>` through the points: stroke **heat**, width 1.6,
  `vectorEffect:'non-scaling-stroke'`, round joins/caps; `pathLength={1}` +
  dasharray/dashoffset so it **draws itself** in-view (1100ms, the BSSdTrace
  recipe; note dasharray on `<path d>` — the mechanism BSSdTrace already proves in
  the WKWebView). Start = 4px hollow square (1.5px ink stroke); end = 5px **heat
  dot** popping in (`bsSdPop`, ~340ms after the draw completes). Mono `START` /
  `END` micro-labels 7px 800 `bsTHexA(t.INK,.45)` at the endpoints, clamped inside
  the edges. One honest caption row: `{provider·toUpperCase()} · PRIVACY-TRIMMED`
  only when those fields exist — never fabricated.
- **Fallback:** `routeObj` present but `points` missing/<2 → render the existing
  `<BSActivityRoutePreview/>` untouched (no regression; the shared component and its
  feed-card usage are NOT modified).
- **No-GPS placeholder** (`d.showRoute`): the 120px halftone box collapses to a
  ~20px **redaction line** — a 1px dashed rule flexing on both sides of a centered
  mono label `GPS · NOT RECORDED` 7.5px `bsTHexA(t.INK,.45)`. No tint, no radius.

### 4 · Summary — two-register ledger

Keep `secHead('Summary')`. Replace the tile grid entirely.

**Ranking** (data-driven, 1..10+ stats): `paceRe=/pace|speed/i`,
`timeRe=/\btime\b|duration|moving|elapsed/i`, `avgHrRe=/avg.*(hr|heart)|(^|\s)hr\b|heart/i`.
Primary = first match of each (≤3). If <2 match (strength/recovery), promote the
first 2 stats in `detailStats` order. Secondary = everything else, source order.
Spot-check strength/swim fixtures so e.g. `SETS 24` gets primary treatment.

**Primary register** — full-width baseline rows (`padding:'11px 0 12px'`, 1px
`bsTHexA(t.INK,.08)` borderBottom; the FIRST row carries no borderTop — the secHead
already draws one). Label: mono 7.5px 800 0.16em uppercase `bsTHexA(t.INK,.5)`,
ellipsis at `maxWidth:'46%'`. Value: `t.DISPLAY` **30px** 700 tabular via
`BSSdCountUp`, unit split to mono 10px `bsTHexA(t.INK,.55)`.

- **HR row**: keeps the ghost sparkline (`ghostFor(k)` reused) — absolute SVG,
  `right:0, bottom:2, width:132`, stroke heat 1.5, opacity 0.11.
- **AVG PACE row — the needle instrument** (owner addition). Renders **only when
  `d.paceTrace.length > 1`**, else it's a plain primary row (no fabricated needle):
  - Under the label/value line: a **tick band**, height 15px — SVG line ticks every
    4% (ink 0.18; every 5th tick 1.4× tall at ink 0.32).
  - A 2×15px **heat needle** at `left:{frac}%`. For pace (sec/mi, lower = faster):
    `frac = clamp01((maxSec − avgSec) / (maxSec − minSec))` so **faster reads
    right**; avgSec parsed from the stat value (M:SS), min/max from `paceTrace`.
    For rides (speed, higher = faster): `frac = clamp01((avg − min)/(max − min))`.
  - Endpoint labels mono 7px `bsTHexA(t.INK,.45)`: slowest left, fastest right
    (`fmtPaceSec`; mph values for rides).
  - Boot: the needle **sweeps** from 0 to `frac` (`transition:'left 700ms
    cubic-bezier(.3,.7,.2,1) 140ms'` gated on the summary's `seen`; a single 2px
    element, acceptable layout-prop transition). Reduced motion: final position.
  - The pace row does NOT also render a ghost sparkline (the band replaces it).

After the last primary row: the house **2px ink→heat gradient divider**
(`linear-gradient(90deg, t.INK, heat 70%)`, drawn with `bsSdDrawX`).

**Secondary register** — telegram dot-leader lines (~26px each,
`padding:'7px 0'`): label mono 7px 800 `bsTHexA(t.INK,.45)`; leader `flex:1,
borderBottom:'1.5px dotted '+bsTHexA(t.INK,.22)`; value `t.DISPLAY` 15px 700
tabular + small unit, via `BSSdCountUp`. Long labels ellipsize; values never
truncate; the leader absorbs slack. (If dotted borders render ragged across DPRs,
switch to a `repeating-linear-gradient` strip — implementer's call on device.)

**Cleanup:** `outputStats` is hardcoded `[]` — delete the Output section and the
now-unused `statTile` (dead-code discipline).

### 5 · Heat usage (line-only discipline)

Heat appears ONLY as: the rail + breathing needle tick, the title period, the hero
rule, the PR arrow + underline, section-head ticks + rail stations, the route
stroke/end dot, the pace needle, the ink→heat divider, and ghost strokes at 0.11.
All text stays `t.INK`/ink-alphas — AA never depends on heat. No-zone sessions
degrade to `heat = t.ACCENT` with identical geometry.

## Motion & boot summary

Hero zone fires on mount (above the fold): 80ms hero rule draws → 120ms figure
counts (780ms) → 200ms rail grows (1100ms) → 720ms PR line fades up → needle tick
breathes from ~1500ms. Route + Summary each boot on their own one-shot
`useBSSdInView`. All animation via the existing injected-keyframes pattern
(`bsInjectSessionDetailCss` + one new `bsSdGrowY` inside the reduced-motion-gated
block); every animated style uses the `...(sdReduced ? null : {animation})` spread;
reduced motion renders the finished state.

## Edge cases & honesty

- No `heroStat` → title + rail + sections only (no empty figure block).
- Strength/recovery (no route, no traces): route = redaction line only if
  `showRoute`; summary = promoted primaries + leaders — reads designed, not degraded.
- 1 stat → one large primary line; 10 stats → ≤3 primaries + quiet leaders
  (~340px vs today's ~480px of tiles).
- Needle/ghosts/route never render from absent series. Captions never fabricate
  provider/privacy fields.

## Out of scope

Charts below Summary, comments page, the shared `BSActivityRoutePreview` (kept
as-is for feed cards + fallback), website surfaces.

## Verification

JSX parse-check · PowerShell mobile build (`$env:VITE_BASE='/m/'`) · 363 tests ·
LF normalization · `public/m` via CI's Linux build for the PR (house rule #1470) ·
on-device pass on Black + Sage + Cream papers with a run, a ride, and a strength
fixture (same recommendation as the #1518/#1519 animation pages).
