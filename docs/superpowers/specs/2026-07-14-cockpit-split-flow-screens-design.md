# The Cockpit / Split — flow-screen design system (2026-07-14)

Owner-picked off the round-2 concept board
(claude.ai/code/artifact/c47eaa01-2382-47fd-a028-f893de02a064): **Direction A
"The Cockpit"** with light treatment **A-3 "The Split"**. Round-1's quieter
Open-Ledger re-sets are shelved.

## Thesis

**Paper is for reading. The instrument is for doing.** The three "doing"
screens — the live session player, the meal logger, and the "Logged."
confirmation — get an instrument treatment distinct from the broadsheet pages:

- **Dark papers (Black/Forest/Plum/Slate):** the full dark deck — the whole
  screen is the instrument. Near-black ground, glass panels, luminous tabular
  numerals, segment gauges, a faint scan-line texture.
- **Light papers (Cream/Sage/white/etc.):** **THE SPLIT** — one full-bleed
  dark instrument band docked at the top of the screen holds the LIVE numbers;
  the work below stays on the page's own paper, separated by a 3px teal seam.
  Half console, half broadsheet — the hard seam is the signature.

Presentation-only: every handler, gate, award, and honest-data rule carries
over verbatim. This is the #1575 "Meter" page re-clothed, not re-plumbed.

## The band (shared anatomy, all three screens)

- Ground `#0b0f0f` (fixed — never a theme token; the band is the same machine
  on every paper), faint scan-line overlay (repeating 1px lines ≤2% white,
  `aria-hidden`), full-bleed (negative page-gutter margins), safe-area padded.
- Numerals: mono, weight 800, `tabular-nums`, bright teal `#38e0cc` with a
  soft glow (`text-shadow`). Labels: mono uppercase eyebrows, dim cream.
- Segment strip: one segment per unit of progress (exercises in the session,
  the day-target fraction on food screens); lit = teal + glow, unlit ≤12%
  cream. Never a fabricated segment — the strip renders only when the count
  is real.
- The seam: `height:3px`, `linear-gradient(90deg, teal, teal-15%)` — the ONE
  band/paper boundary; no other rule touches it.
- Reduced motion: glow pulses and fill animations render in their finished
  state; the scan-line is static (it never animates anyway).

## Screen 1 — live session ("the machine above the paper")

**Band contents (top → bottom):**
- Eyebrow row: `EXERCISE 01 / 06` left · **`ELAPSED 32:14`** right (owner
  add) — elapsed = wall time since session start, ticking once/second from
  the existing session-start timestamp; never an estimate.
- Exercise title (cream, sans 800 uppercase) + the **form-clip chip** when the
  coach attached one: `▶ HOW-TO · {COACH}'S FORM CLIP · 0:42` (hairline
  teal-framed chip). Tap → the clip in a portal sheet player
  (`createPortal` → `#bs-phone-surface`), sourced from the plan block's
  `video` (the #1577 ＋CLIP rails). Honest-absent: no clip → no chip.
- **Current-set readout:** big glowing figures `165 LB · 5 REPS · 8 RPE` +
  the done checkbox. These ARE the inputs — tapping a figure edits it in
  place (same state the old underline inputs wrote).
- **REST readout (owner add):** `REST · SET 2 IN` + a big `1:24` countdown +
  a **bar that fills as the rest runs** (teal, glowing; drains→fills from the
  existing rest-timer state the #1575 draining rule used). Hidden when not
  resting.
- Segment strip: exercises done / total.

**Paper below the seam:**
- `THE LEDGER · "{coach cue}" · LAST {load}` eyebrow.
- Set rows: done rows dim with a teal ✓; the ACTIVE row carries a 3px teal
  spine + bold figures; pending rows quiet mono. (Row tap selects the set —
  the band's readout follows the selection.)
- **Full set editing (owner requirement — nothing today's grid can do gets
  lost):** EVERY row's weight / reps / RPE figures are tap-to-edit in place
  (numeric keyboard, same state writes as today's underline inputs — done,
  active, and pending rows alike); the band's big readout is the same state,
  so an edit in either place reflects in both. `＋ ADD SET` appends (existing
  handler); the SELECTED row carries a quiet `× REMOVE` text-action on its
  right (rust) that deletes that set — never shown on done rows with logged
  data unless tapped through the existing confirm primitive
  (`window.bsAskConfirm`), so a logged set can't vanish on a stray tap.
- The START-SET CTA — **owner pick: C-1 INK, the press block.** Implemented
  as `t.INK` ground / `t.PAPER` text (black-on-cream on light papers,
  inverting cleanly on dark papers where t.INK is cream) ·
  `← PREVIOUS` (quiet ink) / `NEXT: {exercise} →` (teal) text-actions.
- Feel/effort review + share block: unchanged (quiet form, two-tier rule).

The #1575 intensity-heat engine keeps running: on the DARK deck the band's
teal shifts with `bsLiveEffort` exactly as the page accent does today.

## Screen 2 — meal logger ("Correct the Record")

- **Band:** the ONE-TAP action + the live tally. `ONE TAP` eyebrow ·
  `ATE IT AS PLANNED ✓` as the band's glowing primary row (tap = the same
  one-tap log) · `THIS MEAL 412 KCAL · 32P` + `DAY 1980 / 2100` readouts with
  a segment strip on the day fraction. Pristine-only rule unchanged — when
  the meal is adjusted, the one-tap row swaps for the
  `↺ ADJUSTED — RESET TO PLAN` line exactly as today.
- **Paper:** CORRECT THE RECORD (portion slider, ingredient rows, dashed
  ＋ADD box) and DISPATCH TO {coach} (underline note field, squared
  PHOTO/VOICE chips) — the existing stations, unchanged logic. The sticky
  log bar keeps its derived label contract (`Log as planned →` /
  `Log · 210 kcal · 0.75× →`), restyled to the CTA color.
- THE TALLY station dissolves — the band IS the tally now (no duplication).

## Screen 3 — "Logged." confirmation

- **Band:** `MEAL · FILED 6:33 AM` eyebrow · the big glowing `412` KCAL
  stamp · `KCAL · 32P · LOGGED ✓` line · DAY SO FAR readout + segment strip.
  The `+10 · NUTRITION · SHAPE SCORE` chip renders in the band ONLY when the
  award actually granted (existing rule).
- **Paper:** the Done CTA (owner color pick) and nothing else — the moment
  stays clean. `← Back` sits in the universal top-left spot ON the band
  (cream ink).

## Honest data / a11y

- Every figure is live or absent — no placeholder zeros, no fabricated
  segments, no demo values signed-in (unchanged contracts).
- The band is `role`-neutral chrome; inputs keep their labels; the countdown
  carries `aria-live="off"` (announce on state change only via the existing
  rest announcements); ≥44px targets throughout; the form-clip chip is a real
  button.
- Fixed-dark band on light papers is a DESIGN choice (like the launch wire);
  contrast inside the band is cream-on-near-black (AA+).

## Build plan

- **PR A — the live session** (`BSSession` + `sessionLedger`/`liveEffort`
  untouched): band + seam + paper ledger + rest/elapsed + form-clip chip.
- **PR B — the meal logger + Logged.** (`BSLogMealFlow`): band on both
  states, stations re-set below, sticky-bar restyle.
- Both: parse · PowerShell `/m/` build · `npm test` · LF · browser-driven
  screenshots on the built bundle (light + Black paper × reduced motion)
  before the PR.

## Open

- ~~CTA color~~ — **picked 2026-07-14: C-1 INK** ("do black").
- Owner on-device pass after both PRs (Black/Sage/Cream × reduced motion ×
  a real coached plan with a form clip).
