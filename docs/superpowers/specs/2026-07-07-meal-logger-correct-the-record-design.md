# Meal logger → "Correct the Record" — Open Ledger restructure (design)

**Date:** 2026-07-07 · **Surface:** mobile client meal logger (`BSLogMealPage` area,
`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` ~1450–2001) · **Scope:** one page
restructure + small `shapeBackend.js` contract change. Presentation + wiring only — no
schema or API changes.

## Context

The Log Meal sheet is the last plate-era client surface: boxed 4-way mode tabs, no
ledger rules, and four real defects the Open Ledger wave exists to kill:

1. **Stale, unreachable CTA.** `doLog` is wired only to the top "Ate it as planned"
   plate (~line 1768). After any adjustment (portion, ingredients) the user must scroll
   back up and tap a button whose label is now false. There is no other log action.
2. **Mixed taxonomy.** ADJUST + SEARCH mutate the meal; PHOTO + VOICE are messages to
   the coach that change nothing. One segmented control, two unrelated jobs.
3. **Hardcoded persona + goals.** "Note to Dr. Maya", "Maya reviews your plate",
   "Sends to Maya when you log" (~1842, 1848, 1949) render for every signed-in user
   regardless of their real (or absent) nutritionist. `CAL_GOAL = 2100, P_GOAL = 165`
   (~1668) are constants, not the member's targets. (Same constants duplicated ~3715.)
4. **Missed Score moment.** Logging a meal earns +10/day (#1558) but the confirmation
   shows nothing; the `award_meal_log` RPC result is discarded
   (`shapeBackend.js:4141`).

Also pre-existing and adjacent: the confirmation screen's **"Undo" doesn't undo** —
macros are already POSTed (server-side accumulating); the button just returns to the
form, where logging again double-posts. And the one-tap plate renders even for free
logs (signed-in, no planned meal) where "as planned" is meaningless.

Three treatments were mocked and compared (reskin-only / restructure / full-rethink
with a collapsed confirm card). **Restructure chosen**: fixes both structural defects
for one page's rework, keeps the planned case at a single tap, stays inside the Open
Ledger vocabulary.

## Design

### Page anatomy (top → bottom)

```
× CANCEL          LOG MEAL          6:05 PM      chrome (unchanged)

MEAL · PLANNED                                   masthead (unchanged)
Greek yogurt + almonds.
280 PLANNED · 22P · 26C · 10F

[ ONE TAP — Ate it as planned ✓ ]                teal plate — pristine state only,
                                                 and only when a planned meal exists

━━ CORRECT THE RECORD ━━━━━━━━━━━━               2px ink→teal gradient rule
PORTION                               1.00 ×
(range input, restyled labels)  ¼ ½ 1× 1½ 2×
✓ Greek yogurt + almonds  1 SERVING · 280 · 22P   EDIT
＋ ADD — SEARCH FOODS OR ENTER MANUALLY

━━ DISPATCH TO DR. <NAME> · OPTIONAL ━━          gold rule · hidden if no coach linked
[ note field — quiet rounded card ]
[⊡ PHOTO]  [● VOICE]                             disclosure chips

━━ THE TALLY ━━━━━━━━━━━━━━━━━━━━━━               BSPlate (unchanged two-part content)
THIS MEAL 280 KCAL · P/C/F
AFTER LOGGING · DAY TOTAL   bars vs REAL targets

▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                 sticky ledger bar (NEW)
280 KCAL · 22P              [ LOG AS PLANNED → ]
```

The 4-tab mode control is **deleted** (mode state removed). Adjust content is the
always-visible main register; search folds into ADD; photo + voice move to dispatch.

### State machine — pristine vs adjusted

`dirty = portion !== 1 || ings differ from the initial snapshot` (toggled off, edited,
added, or removed vs. a frozen copy taken at mount).

- **Pristine + planned meal:** one-tap plate renders (unchanged visuals, calls
  `doLog`). Sticky bar reads `LOG AS PLANNED →` with the live tally at left. Two
  entries, one action.
- **Adjusted:** the plate collapses to a hairline row — `↺ ADJUSTED — RESET TO PLAN`
  (1px `t.RULE` border, radius 4, mono; tap restores portion 1 + initial ingredients,
  returning to pristine automatically via the predicate). Bar CTA reprices:
  `LOG · {kcal} KCAL` plus ` · {portion}×` only when portion ≠ 1. Height change
  animates ~180ms ease; none under `prefers-reduced-motion`.
- **Free log** (signed-in, no planned meal): no plate, no reset row — the page opens
  at CORRECT THE RECORD; bar CTA `LOG · {kcal} KCAL`, disabled while kcal = 0.

The CTA label is derived from state and can never claim "as planned" over an adjusted
meal.

### Sticky ledger bar

- `createPortal` into `#bs-phone-surface`; `position:absolute; left/right/bottom:0`,
  padding includes `env(safe-area-inset-bottom)`; zIndex below the sheets (~5000 vs
  editIng's 6000). Page content gets bottom padding reserving the bar's height — no
  layout shift, no overlap with THE TALLY.
- Left: `{kcal} KCAL · {P}P` mono, `font-variant-numeric: tabular-nums`. Right: the
  CTA button (min 44px target). Bar background `t.PAPER2` + top hairline + soft top
  shadow; hidden on the confirmation screen.
- Tally numbers tick on change (~150ms); no animation under reduced motion.

### Register 1 — CORRECT THE RECORD

- Section head: mono 800, ls 0.2em, `t.INK`, with the house **2px
  `linear-gradient(90deg, t.INK, teal)` rule** beneath (teal = `t.isLight ? '#0a8f87'
  : '#34d6c5'`).
- **Portion**: keep the native `<input type=range>` (mechanics + a11y unchanged);
  restyle labels — mono eyebrow left, `1.00 ×` right in display type, tabular-nums.
- **Ingredients ledger**: existing rows unchanged (toggle tick, qty · kcal · P
  sub-line, rust EDIT).
- **One ADD action** replaces both `+ ADD INGREDIENT` and the SEARCH tab:
  `＋ ADD — SEARCH FOODS OR ENTER MANUALLY` (dashed row, unchanged styling). Opens a
  bottom sheet (same portal pattern as the ingredient editor): search input on top of
  the existing recents list, honestly labeled `RECENTS — FOOD SEARCH COMING SOON`
  when signed in; below the list, an `ENTER MANUALLY →` row opens the existing
  ingredient editor sheet (`openAddIng`). Tapping a result = existing `addFood`.

### Register 2 — DISPATCH TO {COACH} · OPTIONAL

- Head takes the **nutritionist-gold** accent on its gradient rule
  (`t.isLight ? '#a07a2e' : '#d8b25a'`); title stays theme ink per the role-color
  rule.
- **Name resolution**: reuse the `coachReal` pattern (~8989–9004) —
  `window.ShapeMessages.listDirectCoachThreads()`, preferring the thread with
  `provider_role === 'nutritionist'`, else any linked coach. Signed-out demo keeps
  "DR. MAYA". **Signed-in with no linked coach: the entire register is hidden**
  (note, chips, and all "sends to coach" copy — the endpoint no-ops anyway; a note
  field that goes nowhere is dishonest). All three hardcoded "Maya" strings are
  replaced by the resolved name (or removed with the register).
- **Note**: unchanged quiet rounded card.
- **Photo / Voice become disclosure chips** under the note (outline chips, mono
  labels, `aria-pressed`): tapping expands the existing capture block inline beneath
  (photo: preview + Take photo/Upload; voice: capture-mode toggle + mic button —
  machinery untouched). One expanded at a time; both collapsed by default. Attached
  states render on the chips: photo chip shows a small thumb + ×; voice chip shows
  `● MEMO · 0:42 ×`. Dictated text still lands in the note. Same `FormData` →
  `/api/nutrition/meal-note` on log.

### Register 3 — THE TALLY

- Section head + the existing `BSPlate` (THIS MEAL + AFTER LOGGING day totals) —
  content unchanged except **real targets**.
- **Targets**: pass `dayTargets` alongside the existing `daySoFar` prop, sourced from
  the same Eat-day data that already carries them (`dy.targets`, coach-set overrides
  win — see ~4928 and ~6031). Signed-in with no target: value renders, goal reads
  `/ —`, bar hidden (no fabricated percentage). Signed-out demo keeps 2100/165.
  Delete the duplicated `CAL_GOAL/P_GOAL` constants at both call sites (~1668, ~3715)
  in favor of the prop (demo defaults live at the signed-out edge only).

### Confirmation screen (+10 moment)

- `shapeBackend.js` `logMealMacros`: stop discarding the `award_meal_log` result —
  keep it fire-and-forget (never blocks the log) but expose the promise on the
  resolved value (e.g. `{ ...snapshotJson, awardPromise }`; resolves
  `{awarded, points} | null`, errors → null). The second call site (~4097) ignores
  the return and is unaffected.
- The "Logged." screen appends `+10 · NUTRITION · SHAPE SCORE` (small mono, teal) when
  the promise resolves `awarded === true`; otherwise nothing — an already-earned day
  never shows a fake +10. Fade-in 180ms; none under reduced motion.
- **Rename "Undo" → "← Back"** (it navigates; it does not reverse the POST). Real
  undo (negative-delta or revoke) is flagged as a follow-up, out of scope here.

## Out of scope

- Real food-database search (known stub — the ADD sheet labels recents honestly).
- Real undo / macro reversal; coach-side surfaces; website (logger is mobile-only).
- Native camera/mic plugins (WebView fallback stands).
- i18n of the logger — strings stay plain and extractable; a later rollout increment
  picks the page up.

## Acceptance criteria

1. With a planned meal and no adjustments: one-tap plate + bar both log; bar reads
   `LOG AS PLANNED →`; one tap total.
2. Adjust portion to 0.75×: plate collapses to `↺ ADJUSTED — RESET TO PLAN`; bar
   reads `LOG · {repriced} KCAL · 0.75× →`; tally + day totals reprice; reset row
   restores pristine.
3. Toggle an ingredient off (portion 1): bar reads `LOG · {kcal} KCAL` (no `×`
   suffix).
4. Free log (no planned meal): no plate/reset row; CTA disabled at 0 kcal.
5. Signed-in, nutritionist "Dr. Okafor" linked: dispatch head reads
   `DISPATCH TO DR. OKAFOR`; no "Maya" string anywhere signed-in.
6. Signed-in, no coach linked: dispatch register absent entirely.
7. Signed-in, no targets: day totals show `/ —`, no progress bar; with targets, real
   values. Signed-out demo unchanged (2100/165, Maya).
8. First meal log of the day: confirmation shows `+10 · NUTRITION · SHAPE SCORE`;
   second log same day: no award line. Confirmation button reads `← Back`.
9. Mode-tab control gone; photo/voice reachable as dispatch chips with attached
   states; add-food sheet reachable from the single ADD row, manual entry inside.
10. Theme tokens only (all 14 papers), 44px targets, `aria-pressed` on chips,
    reduced-motion respected, no horizontal overflow, sheets portal into
    `#bs-phone-surface`.

## Verification

Parse-check the JSX; `VITE_BASE=/m/ npm run build` from `mobile-app/`; republish
`public/m` and confirm `diff -rq` clean; `npm test`; staging click-through (this is a
logic-touching UI rework → staging before merge per convention); on-device pass rides
the standing follow-up list (Black/Sage/Cream papers, both roles).
