# Progress hub "Field Ledger" + Marketplace "Classifieds" — design spec

**Date:** 2026-07-04 · **Status:** owner-approved (picked from the wave-6 concept
boards: *P1 body + P2 verdict lead grafted* for Progress; *M1 structure + M2
portrait treatment* for the Marketplace) · **Waves:** 6 (Progress) + 7 (Marketplace)
of the July redesign, after Session Details #1523 · Home #1527 · Feed #1528 ·
Terrain profile #1531/#1532.

Both surfaces serialize into the shipped **Open Ledger / Wire Dispatch** language:
zero-box stations on hairline rules, eyebrow-above-figure ledger stats,
self-drawing linework, dot-leader rows, honest-absent redaction lines, one-shot
in-view motion, reduced-motion = finished state.

---

## Surface 1 — Progress hub (`BSClientProgress`) · "The Field Ledger"

### Heat declaration

Heat = **the member's Shape Score tier color** (`bsMyTierColor()`) — the same
per-surface declaration the Terrain profile made (intensity is Session Details',
role is the feed's, tier is the member-owned surfaces'). **Line-only, closed
placement list:**

verdict tick + serif period · station-head ticks (`BSTStationHead`) · tab
underline (`BSTerrainTabs`) · trend trace stroke + end dot · data-bar fills
(volume / macros / calories / hydration / muscle rows) · delta glyphs (▴/▾ +
the mono delta figure).

Everything else demotes to ink-alphas. **What dies with this:** the constant
teal accent on eyebrows/figures, the **9-color trend-series palette**
(`BSPROG_TREND_TABS` colors), the 4 macro-bar colors, the 7-color muscle-split
palette, the teal delta chips, and the tinted weekly-focus card.

### Structure (full page — the dead `embedded` Me→Stats mode is REMOVED in this wave; both remaining consumers are full-page)

1. **Header** — `BSDetailHeader` unchanged (standard chrome).
2. **THE VERDICT** (replaces `BSClientNextPlate`'s `BSPlate`, keeps its exact
   data logic): heat-tick mono eyebrow → one **serif verdict headline** with a
   heat period (engine-fed: `goalBrief` → nearest milestone → the honest
   "Log a weigh-in." prompt) → mono sub-line. The signed-out demo keeps its
   "Example" tag; a signed-in no-data account gets the honest prompt — the
   existing gating carries verbatim. No plate, no box, no fabricated verdicts.
3. **Tabs** — the instrument segment rail dies → `BSTerrainTabs` (typographic
   index, drawn heat underline), `pad = t.padX`.
4. **Registers** — `kpiGrid` dies → 2-col **eyebrow-above-figure** ledger stats
   (`BSTLedgerStat` treatment: mono eyebrow ink-50, serif figure with
   `BSSdCountUp` on first view, mono sub-line; deltas read heat ▴/▾ + mono).
5. **THE TREND** — station head + the unit as meta. The 9 series pills become
   **mono text toggles** (active = ink + heat underline; inactive ink-45;
   horizontal scroll). `BSProgChart` is rewritten line-only: hairline grid
   kept, **self-drawing heat stroke** (pathLength/dashoffset on first view),
   heat end-dot, the gradient area fill deleted. Latest figure = serif ink
   (not series-colored). Empty → `BSTRedact` ("TREND · NOT ENOUGH LOGGED").
6. **PERSONAL RECORDS** — dot-leader rows (mono move · dotted leader · serif
   figure · mono ×reps; e1RM as an ink-50 sub). Tap-through to
   `BSStrengthHistory` kept.
7. **MEASUREMENTS / PROGRESS PHOTOS** — station heads + hairline rows; the
   photo grid itself is unchanged (images are content, not chrome). Shrink
   deltas keep their current semantics (down = heat ▾, up = ink, zero = —).
8. **WEEKENDS** (`BSWeekendsCard`) — the `BSPlate` dies → a zero-box station:
   head + serif statement + tabular dimension rows. The flagged gap figure
   keeps **rust as a semantic state color** (state, not identity — same
   exception the waitlist spines hold).
9. **Training tab** — `BSStrengthCard` chrome converts to a ledger station
   (single consumer, verified; data/logic/hook verbatim). Registers replace
   the KPI grid; the weekly-focus tinted card → zero-box station with serif
   primary + note; the 14-day volume bars keep their shape with **heat fills**
   (today full heat, past days heat-alpha, empty hairline) and a staggered
   grow entrance; PR rows → dot-leader with mono heat "▴N.N%" (chips die);
   muscle split → horizontal label·bar·pct ledger rows (palette dies);
   recent sessions → hairline rows (PR marker = heat ▴ glyph + ink text).
10. **Nutrition tab** — registers; today-vs-target → ledger bars (labels ink,
    fills heat, figures tabular `cur / target`); weekly calories bars: adherent
    = full heat, logged-but-off = heat-alpha, unlogged = hairline; hydration
    bars heat-alpha; most-logged foods → dot-leader rows.
11. **Deletions** — the `card` style const, the local `Eyebrow`, `kpiGrid`,
    the area gradient + `bsprog-` gradient defs, every series/macro/muscle
    color usage, the segment tab rail.

### Motion contract

One `useBSSdInView` observer per station, one-shot; **zero infinite loops on
this page** (nothing here is live); `bsInjectSessionDetailCss()` injected via
`React.useInsertionEffect` in `BSClientProgress` (the Terrain lesson — never
rely on another surface having injected the keyframes); `bsSdReduced()` gates
every animated style to the finished state.

### Honest-data rules (all carried verbatim)

`BSPROG_EMPTY` signed-in zeroing unchanged; demo figures are signed-out preview
only; every empty list/series renders a `BSTRedact` line, never a fabricated
number; the verdict suppresses to the honest prompt exactly as
`BSClientNextPlate` does today; measurements/photos stay live-only.

---

## Surface 2 — Marketplace (`BSMarketplaceScreen`) · "The Classifieds"

### Heat declaration

Heat = **each coach's role** — trainer rust `#c0533b` / nutritionist gold —
the same per-author declaration the feed's Wire Dispatch made. Line-only:
**3px role spines on feature + listing rows, portrait frame edges, nothing
else.** Page chrome keeps the existing teal italic accent on the hero title
(brand mark, unchanged). Role-colored TEXT demotes to ink-alphas.

### Structure

1. **Hero** — eyebrow "THE CLASSIFIEDS"; the serif "Find your *coach.*" title
   stays; the pill search becomes an **underline field**.
2. **Role tabs** (All / Trainers / Nutritionists) → drawn-underline typographic
   index (`BSTerrainTabs` anatomy).
3. **Coach of the Week** → a railed **feature notice**: role spine, a
   **duotone-framed portrait** (real photo, initials fallback — M2's graft),
   serif name + role-heat period, mono credential/city line, italic pull
   quote, underlined "SEE THE PROFILE →" action.
4. **Featured · This week** — the 2-up gradient `MktCoachCard`s die → **portrait
   cells**: framed photo with a role spine on the frame edge, serif byline,
   mono dateline (role · specialty), one mono stat line (★ rating · rate).
5. **Listings / results** — classifieds rows: role spine · mono index · serif
   name · mono meta (role · specialty · city) · ★ rating · **dot leader → rate
   figure** (real published rate or "Listed" — never fabricated). Rows keep
   ≥44px targets.
6. **Programs tracklist** → dot-leader rows.
7. **Tap-through unchanged** — `BSCoachDetailPublic` and the Signal profile are
   untouched (the sigil stays, per the owner's call). All handlers (open,
   search, role filter, apply flow) carry verbatim.

### Honest data

Real coaches merge ahead of the demo directory exactly as today; demo cast =
signed-out/preview only; rates show the published figure or "Listed".

---

## Build order + review

Progress first (pure restyle over existing data plumbing — no commerce paths),
Marketplace second (discovery → checkout entry points get the fuller review
pass). Each: build → verify (JSX parse · PowerShell mobile build · full tests ·
LF) → whole-branch self-review → PR → CI green + CodeRabbit addressed → merge.
WORKLOG + War Room updated with the second PR.

### Risks (named)

- Tier-heat line legibility on Cream/Sage papers — device-only proof; flagged
  for the standing on-device pass.
- `BSStrengthCard` restyle — single consumer verified before chrome changes.
- Classifieds row density at 320px — leaders must flex, rows must not wrap
  their rate column; ≥44px hit targets on every row.
- ~~The Me→Stats `embedded` mode shares the body~~ — resolved at build time:
  the `embedded` mode had NO remaining consumer (it died with the Route Card
  profile) and was removed as dead code; both live mounts are full-page.
