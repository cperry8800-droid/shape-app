# Train deck + Eat day — "The Program & The Menu" Open Ledger redesign (mobile)

**REVISED 2026-07-08** after the visual concept round (mockups of all three
directions, both papers): the owner picked **Option C — "The Program & The
Menu"** over the previously-specced Option A, composed with **Option B's
compact kcal strip** directly below the calendar rule (owner-supplied crop)
and **no kitchen ticket** (owner follow-up: the receipt block is cut — the
strip carries all totals). This file supersedes the Option A composition
merged in #1620; the shared-chrome groundwork carries over unchanged.

The two half-serialized client surfaces — the **Train deck** (`BSClientTrain`)
and the **Eat day view** (`BSClientEat`) — finish their serialization, together
with the shared chrome both carry (`BSWeekStrip`, the find-a-coach bars,
`BSCoachAdjustBanner`). All in
`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`.

**Presentation-only.** No migration, no new routes, no new pure modules.
`ShapePlan.get`, `bsBuildTrainProgram` / `bsBuildDemoTrainProgram` /
`bsApplyTrainAdjust`, the swap stores (`client_train_swaps` /
`client_meal_swaps` + the `sendProviderMessage` notify), `buildMealProgram`,
the coach-target overrides (`bsEatProgram.detail`), meal preview / logger
open, the self-serve builder + Build door (#1618), calendar `autoStart`, and
`workout_started` analytics all carry over verbatim.

## Non-goals

- No website changes (web Eat/Train parity is a separate wave).
- Grocery / Library / Recipes views untouched (#1591, #1601); the live
  session (`BSSession`) and workout previews keep their shipped #1575 design.
- No new data intelligence: every figure re-expresses numbers the page
  already computes; no over-target verdicts, no pacing model.
- Sheets stay quiet forms (`BSSwapSheet`, meal preview, builder — untouched).

## Shared rules (both pages)

- **Zero-box.** Bordered/tinted cards die; boundaries come from drawn rules,
  role spines, dashed ticket rules, and whitespace.
- **Two-tier rule holds.** Sheets and forms stay quiet rounded forms.
- **Teal = action.** The solid teal ▶ start button keeps its fill; text
  actions are ink + a 2px heat underline. Heat never fills a primary button.
- **Heat = neutral `t.ACCENT`** on both pages (neither is a live surface).
  Role colors survive only as press-credit spines / role tags (trainer rust
  `#c0533b`, nutritionist gold `#a07a2e`).
- **New grammar, derived not invented:** the week-strip **needle** borrows
  the Session Meter's zone-strip needle; the **course rules** are the house
  hairline with a status right. No other new elements.
- **Honest-absent.** Empty cases keep their honest lines; demo content stays
  signed-out-only. The hardcoded `· on pace` claim dies (§3.2).
- **One loop per page.** Eat: a breathing heat dot on the NEXT course's rule.
  Train: none (static page). Gated on `bsSdReduced()` → finished state.
- **States never color-only** — mono text always names them (`NEXT`,
  `EATEN`, `REST`, `SWAPPED`; the course ✓).

## 1 · Shared chrome

1. **`BSWeekStrip` → the calendar rule** (same API: `activeIdx` / `onSelect`
   / `restFlags`): the 7 bordered gradient boxes die. A single 2px track with
   7 tick marks and a **teal needle** over the active day; beneath it, 7
   columns — mono day letter over a serif tabular date (active = teal
   letter, ink date; others dim), rest days keep the small green dot.
   Columns are
   ≥44px buttons with aria-labels (weekday, date, selected).
2. **Find-a-coach bars → role leader rows.** The tinted bordered box + icon
   chip die. One shared `BSFindCoachBar({ role, onOpen })` (the trainer bar
   is currently duplicated verbatim in the Build-door branch): a 44px
   hairline-bounded row — 3px role spine, inline monochrome glyph, ink title,
   mono role tag (`VETTED COACHES` / `VETTED RDS`), dot-leader, role-colored
   `→`. Same `goMarket(role)` handlers, still pinned at the top of both pages.
3. **`BSCoachAdjustBanner` → role-spine notice**: 3px role spine + the mono
   `FROM YOUR COACH · {date}` eyebrow + squared chips + the italic note. No
   plate. Same props and show/hide logic.
4. **Coach-adjust chips + the deck `Rest` tag** (radius-999 pills) → squared
   (radius ≈3), same content.
5. **Kickers go editorial** (`BSTrackHeader` component itself untouched —
   shared app-wide): `Workout` → `The program`, `Meal list` → `The menu`,
   `Your plan` → `The plan`.

## 2 · Train — "The Program"

1. **H1 duplication fix**: the deck hero's serif headline renders only when
   it is non-empty AND differs from the page title (normalized compare:
   trim, strip trailing period, case-insensitive vs `cur.title`); otherwise
   the lead runs eyebrow → mono meta → the ink→heat ledger rule directly.
   Kills the double "Upper Pull — Peak".
2. **Move list → the program table**: mono column heads `N · MOVE · SCHEME ·
   LOAD` under a 1.5px rule; each move is a hairline-ruled row (still a
   button → the swap flow): mono number · serif move name (+ `SWAPPED` tag) ·
   mono scheme · tabular load right-aligned. The scheme cell applies a
   **display-only** abbreviation (`3 min rest` → `3m`, `90s rest` → `90s`) —
   the stored string is untouched. Cardio segments (no load) put the segment
   text in SCHEME and leave LOAD empty.
3. **Everything else untouched**: the unboxed lead (eyebrow / meta / rule),
   the coach press-credit + self-authored teal spine variant + `Edit ·
   Yours`, the solid teal ▶, `OPEN SESSION` / `＋ BUILD A WORKOUT` actions,
   the Build door, rest-day handling, `This week / On deck`, playlists.
4. `data-tour="hero-train"` stays on the lead wrapper.

## 3 · Eat — "The Menu"

1. **Top tabs → underline index** (`BSNutritionTopTabs`, same API): `DAY ·
   GROCERY · LIBRARY · RECIPES` — active view takes ink + a 2px heat
   underline (the #1610 feed-toggle grammar); inactive dim. 44px targets.
   All four caller views render it consistently.
2. **Kcal strip (owner-composed, per the approved crop) — directly below
   the calendar rule:** big tabular
   figure + `/ 1,800 KCAL` + right `97%`; a **3px** heat fill rule; `52 kcal
   left` in teal mono (the hardcoded `· on pace` string dies — it renders
   regardless of pace); then a **one-line macro register**: `PROTEIN 142/140
   · CARBS 178/180 · FAT 58/60` — labels in semantic colors (PROTEIN
   `t.RUST` · CARBS `t.AMBER` · FAT **`t.BLUE`**, raw `#8a5cf6` dies),
   values dim ink. Kills the three bordered macro tiles. The kcal/target
   derivations are **hoisted once** above the strip (they are currently
   duplicated across two IIFEs) so §3.3 reuses them.
3. **THE MENU — courses by time** (replaces BOTH the `TODAY · YOUR MOVE`
   `BSPlate` and the numbered meal list): section head (`The menu` /
   `Today's meals` / `Swap meal →`), then one **course** per meal:
   - **Rule-header**: mono time (`bsMealSchedLabel`, slot-tag fallback) +
     hairline rule + right status — teal `✓` (done) · breathing heat dot
     with `NEXT` (the next meal, **today only**) · blank (ahead). The
     next-course dot is the page's one loop.
   - **Entry** (a ≥44px button → the meal preview, aria-label carrying time
     + status + title): serif name — dim when done, **no strikethrough**,
     `SWAPPED` tag kept — and the mono kcal/macros subline; the next course's
     subline appends `· {left} KCAL LEFT` and takes heat.
   - **`LOG IT →`** ink + 2px heat-underline action on the next course only
     (same `setPreviewMealId` handler).
   - "Next" = the meal with `state === 'next'`, else the first un-done meal;
     computed only when the viewed day is today (other days show plain
     courses from their own states).
   - `data-tour="hero-eat"` moves to the **menu list container** (stable
     even when every course is logged).
4. **Nutritionist card → gold press credit**: 3px gold spine, name, mono
   credit `NUTRITIONIST · THIS WEEK` (or `APR PLAN` demo), the italic quote
   (guarded — absent when `coachLine` is empty), and the boxed `SHOP LIST`
   button becomes a closing leader `THE SHOP LIST →` (same
   `setView('grocery')`).

### Kills (summary)

The week-strip boxes (→ calendar rule + needle), both find-a-coach tinted
boxes (and the door-branch duplicate), the coach-adjust plate, pill-radius
chips, the DAY/GROCERY pill tabs, the three bordered macro tiles + raw
`#8a5cf6`, the `TODAY · YOUR MOVE` `BSPlate` + its tinted `LOG IT` pill, the
numbered meal-list rows + their strikethrough, the hardcoded `· on pace`
string, and the bordered nutritionist card + its boxed button.

## Invariants (explicitly unchanged)

- Train: plan load + `loadPlan` rebuild, `moveOverrides` keying
  (`${day}:${i}`), swap sheet flow, `bsApplyTrainAdjust` intent, the
  scheme-parse into `BSSession` (the display abbreviation never feeds it),
  open-session/empty-moves handling, signed-in/out program gating, builder
  seeds incl. `Edit · Yours` id threading.
- Eat: `buildMealProgram` shape, `mealOverrides` keyed by original title
  (website-shared store), swap → nutritionist notify, `bsMealSchedLabel`
  scheduling, meal preview / day-brief / recipe routes, grocery-list state.
- Both: `BSPage` masthead behavior (#1605), `BSHeaderTools`, and the other
  consumers of the restyled shared components (`BSNutritionTopTabs` renders
  on Grocery/Library/Recipes too — same API, consistent look).

## Accessibility

- All rows/actions ≥44px effective targets; underline actions, index tabs,
  week-strip days, and course entries are real buttons with aria-labels.
- Every state is named in mono text, never color-only (`NEXT`, `✓`,
  `EATEN`-equivalents, `SWAPPED`, `REST`).
- `bsSdReduced()`: no breathing dot; every surface renders its finished
  state.

## Verification

- Per commit: JSX parse-check · mobile build exit 0 (`VITE_BASE=/m/`) ·
  `npm test` (497 green today) · LF normalize.
- Browser drive (vite preview, demo data): day switching via the calendar
  rule on both pages, the program table opens the swap flow, course entries
  open previews, the next course carries dot + `LOG IT`, done courses dim
  (no strike), tabs switch all four views, reduced-motion renders finished
  states, 0px horizontal overflow.
- **On-device pass (owner)** before sign-off: Black/Sage/Cream papers ×
  both pages × done/next/rest states × reduced motion.

## Rollout

Two build PRs, mirroring the Goals wave: **PR A — shared chrome + Train**
(§1 + §2); **PR B — Eat day** (§3). Each through the standard gate (CI
green and CodeRabbit findings addressed), squash-merged, branches kept.
