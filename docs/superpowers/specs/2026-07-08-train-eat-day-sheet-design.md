# Train deck + Eat day — "The Day Sheet" Open Ledger redesign (mobile)

Owner-picked from the 2026-07-08 concept round (option A of three): the two
half-serialized client surfaces — the **Train deck** (`BSClientTrain`) and the
**Eat day view** (`BSClientEat`) — finish their serialization into the Open
Ledger zero-box language, together with the shared chrome both pages carry
(`BSWeekStrip`, the find-a-coach bars, `BSCoachAdjustBanner`). All in
`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`.

**Presentation-only.** No migration, no new routes, no new pure modules (no
verdict logic worth extracting — the next-meal derivation already exists
inline). `ShapePlan.get`, `bsBuildTrainProgram` / `bsBuildDemoTrainProgram` /
`bsApplyTrainAdjust`, the swap stores (`client_train_swaps` /
`client_meal_swaps` + the `sendProviderMessage` notify), `buildMealProgram`,
the coach-target overrides (`bsEatProgram.detail`), meal preview / logger
open, the self-serve builder + Build door (#1618), calendar `autoStart`, and
`workout_started` analytics all carry over verbatim.

## Non-goals

- No website changes (web Eat/Train parity is a separate wave).
- Grocery / Library / Recipes views untouched (they had their own waves —
  #1591, #1601); the live session (`BSSession`) and workout previews keep
  their shipped #1575 design.
- No new data intelligence: the kcal/macro register re-expresses numbers the
  page already computes; no over-target verdicts, no pacing model.
- Sheets stay quiet forms (`BSSwapSheet`, meal preview, builder — untouched).

## Shared rules (both pages)

- **Zero-box.** Bordered/tinted cards die; boundaries come from drawn rules,
  dot-leaders, role spines, and whitespace.
- **Two-tier rule holds.** Sheets and forms stay quiet rounded forms.
- **Teal = action.** The solid teal ▶ start button keeps its fill; page-level
  text actions are ink + a 2px heat underline (the Standing's grammar). Heat
  never fills a primary button.
- **Heat = neutral `t.ACCENT`** on both pages (neither is a live surface).
  Role colors survive only as press-credit spines / role tags (trainer rust
  `#c0533b`, nutritionist gold `#a07a2e`).
- **Honest-absent.** Empty cases keep their honest lines; demo content stays
  signed-out-only. The hardcoded `· on pace` claim dies (see §3).
- **One loop per page.** Eat: a breathing heat dot on the NEXT meal row.
  Train: none (static page). Gated on `bsSdReduced()` → finished state.
- **States never color-only** — the mono meta always names them (`NEXT`,
  `LOG NOW`, `EATEN`, `REST`, `SWAPPED`).

## 1 · Shared chrome

1. **`BSWeekStrip` restyle** (same API: `activeIdx` / `onSelect` /
   `restFlags`): the 7 bordered gradient boxes die. Each column: mono day
   letter (dim; heat when active) over a serif tabular date, with a 2px heat
   tick under the active date. Rest days keep the small green dot. Cells stay
   ≥44px targets; each button gets an aria-label naming the weekday + date +
   selected state. No new today-vs-active marker (parity with current
   behavior — active defaults to today on mount).
2. **Find-a-coach bars → role leader rows.** The tinted bordered box + icon
   chip die. New form, extracted to one shared `BSFindCoachBar({ role })`
   (the trainer bar is currently duplicated verbatim in the Build-door branch
   and the deck): a 44px hairline-bounded row — 3px role spine, ink title
   (`Find a trainer` / `Find a nutritionist`), mono role tag (`VETTED
   COACHES` / `VETTED RDS`), dot-leader, role-colored `→`. Same
   `goMarket(role)` handlers, still pinned at the top of both pages
   (coaching stays the pitch — quieter, not hidden).
3. **`BSCoachAdjustBanner` → role-spine notice**: 3px role spine + mono
   `COACH · ADJUSTED THIS WEEK` eyebrow + the note text. No box/plate. Same
   props (`detail`, `kind`), same show/hide logic.
4. **Coach-adjust chips** (radius-999 pills on the deck lead) → squared mono
   tags (radius ≈3), same content (`{coachFocus}`, `Coach · {intensityLabel}`).
5. **Kickers go editorial** (BSTrackHeader component itself untouched —
   shared app-wide): `Workout` → `The work`, `Meal list` → `The menu`,
   `Your plan` → `The plan`.

## 2 · Train deck (light — finishing #1575)

1. **H1 duplication fix**: the deck hero's serif headline renders only when
   it differs from the page title (normalized compare: trim, strip trailing
   period, case-insensitive vs `cur.title`); otherwise the hero leads with
   the eyebrow + mono meta + the ink→heat ledger rule directly. Kills the
   double "Upper Pull — Peak".
2. **Move list → dot-leader ledger**: `01 · Pull-up ····· 42 lb` — mono
   number (or heat `SWAPPED` tag state), serif name, dot-leader, load right;
   the scheme (`4 × 6-8 · 3 min rest`) stays the dim mono subline. Rows stay
   ≥44px buttons opening the swap flow. Moves without a load (cardio
   segments) render no right value — name only, no orphaned leader.
3. **Everything already in-language is untouched**: the unboxed lead
   (eyebrow / headline / meta / rule), the coach press-credit + self-authored
   teal spine variant + `Edit · Yours`, the solid teal ▶, the `Rest` tag
   (squared to match §1.4), `OPEN SESSION` / `＋ BUILD A WORKOUT` actions,
   the Build door, rest-day and on-deck sections.
4. `data-tour="hero-train"` stays on the restyled lead wrapper.

## 3 · Eat day (the real wave)

1. **Top tabs → underline index** (`BSNutritionTopTabs`, same API): `DAY ·
   GROCERY · LIBRARY · RECIPES` as the house mono index — active view takes
   ink + a 2px heat underline (the #1610 feed-toggle grammar); inactive dim.
   44px targets.
2. **Kcal hero → register**: the big tabular figure + `/ 1,800 KCAL` + right
   `97%` stay; the rounded progress bar becomes a 2px drawn rule with heat
   fill on a hairline track. The subline drops the hardcoded `· on pace`
   string (an honesty bug — it renders regardless of pace) → just
   `52 KCAL LEFT`, from the existing computation.
3. **Macro tiles → macro register row**: three unboxed columns — mono label
   in the semantic color, `142 / 140` tabular figure in ink, a 2px line fill
   per macro on a hairline track. **PROTEIN `t.RUST` · CARBS `t.AMBER` · FAT
   `t.BLUE`** — the raw purple `#8a5cf6` dies (same kill as the Goals wave).
   Values/targets from the existing coach-override-wins computation verbatim.
4. **The directive plate dies → verdict lead** (today only, as now).
   Anatomy top→bottom: mono eyebrow `TODAY · YOUR MOVE` (heat) /
   `TODAY · EATEN` (green) with `2/4 MEALS` right; serif verdict
   `Log Skyr + chia.` (heat period) / `All meals logged.`; mono subline
   `52 KCAL LEFT · 4:00 PM` (as the plate shows today); action `LOG IT →`
   as ink + 2px heat underline, ≥44px, same `setPreviewMealId(nextMeal.id)`
   handler. `data-tour="hero-eat"` moves onto this wrapper.
5. **Meal list → the menu ledger**: done rows = heat `✓` + dimmed name —
   **no strikethrough**; the next meal = the page's one breathing heat dot +
   `LOG NOW` mono tag (as now, plus the dot); upcoming rows keep their `02`
   numbers; serif name · dot-leader · scheduled time right
   (`bsMealSchedLabel`); the kcal/macro subline stays. Rows ≥44px, tap →
   preview; `SWAPPED` tag kept.
6. **Nutritionist card → gold press credit**: the bordered rounded card +
   avatar circle die → 3px gold spine, name (`Dr. Maya Patel` / live coach),
   mono credit `NUTRITIONIST · THIS WEEK` (or `APR PLAN` for the demo), the
   italic serif quote kept, and the boxed `SHOP LIST` button becomes a
   closing leader `THE SHOP LIST →` (same `setView('grocery')`).

### Kills (summary)

The week-strip boxes, both find-a-coach tinted boxes (and the door-branch
duplicate), the coach-adjust plate/box, pill-radius chips, the DAY/GROCERY
pill tabs, the three bordered macro tiles + raw `#8a5cf6`, the `TODAY · YOUR
MOVE` `BSPlate` + its tinted `LOG IT` pill, the meal-row strikethrough, the
hardcoded `· on pace` string, and the bordered nutritionist card + its boxed
button.

## Invariants (explicitly unchanged)

- Train: plan load + `loadPlan` rebuild, `moveOverrides` keying
  (`${day}:${i}`), swap sheet flow, `bsApplyTrainAdjust` intent, the
  scheme-parse into `BSSession`, open-session/empty-moves handling, the
  signed-in/signed-out program gating (`EMPTY_PROGRAM` / `MOCK_PROGRAM`),
  builder seeds incl. `Edit · Yours` id threading.
- Eat: `buildMealProgram` shape, `mealOverrides` keyed by original title
  (website-shared store), swap → nutritionist notify, `bsMealSchedLabel`
  scheduling, meal preview / day-brief / recipe routes, grocery-list state.
- Both: `BSPage` masthead behavior (#1605), `BSHeaderTools`, week-strip
  callers outside these pages (verify at plan time — restyle must not break
  other consumers of `BSWeekStrip` / `BSNutritionTopTabs` /
  `BSCoachAdjustBanner`).

## Accessibility

- All rows/actions ≥44px effective targets; the underline actions and index
  tabs are real buttons with visible focus.
- Week-strip days carry aria-labels (weekday, date, selected); the ▶ keeps
  `aria-label="Start session"`.
- Every state is named in mono text, never color-only.
- `bsSdReduced()`: no breathing dot; every surface renders its finished
  state.

## Verification

- Per commit: JSX parse-check · mobile build exit 0 (`VITE_BASE=/m/`) ·
  `npm test` (497 green) · LF normalize.
- Browser drive (vite preview, demo data): day switching on both strips,
  swap sheets open (move + meal), log flow opens from verdict + menu rows,
  done/next states render (✓ dim, breathing dot), tabs switch views,
  reduced-motion renders finished states, 0px horizontal overflow.
- **On-device pass (owner)** before sign-off: Black/Sage/Cream papers ×
  both pages × done/next/rest states × reduced motion.

## Rollout

Two build PRs after this spec, mirroring the Goals wave: **PR A — shared
chrome + Train deck** (§1 + §2); **PR B — Eat day** (§3). Each through the
standard gate (CI green + CodeRabbit findings addressed), squash-merged,
branches kept.
