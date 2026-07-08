# Recipes + Library — "The Kitchen Card & The Catalogue" redesign (mobile)

Owner-composed from the 2026-07-08 concept round (three rendered directions,
both papers): the recipe surfaces take **"The Kitchen Card"** — option B's
typed index card carrying option C's clipping anatomy, with the **directions
outside the card** (owner call) — and the Library takes **option A's "The
Catalogue"**. A **photograph of the finished plate** renders as the card's
figure **only when a real photo exists** (owner + design agreement: no
gradient stand-in in the figure slot).

Surfaces (all in `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`):
the Recipes tab (`BSRecipeBox`), the recipe detail (`BSShapeKitchenRecipe`),
the Eat-day recipe preview (`BSRecipePreview`), the Library
(`BSClientLibrary`), and the saved-item detail (`BSLibraryDetail`).

**Presentation-only.** No migration, no new routes. `useBSLibrary` /
`bsLibToggle` / `bsLibRead-write`, `onSendToGrocery` (a recipe builds its OWN
grocery list), the recipe filter engine (`recipeMatchesDiet`, `recipeNeeds`,
quick pills + advanced groups), search, household-unit conversion
(`bsHouseholdQty`/`bsHouseholdStr`, imperial-gated), and the Library
**Start-this-plan** flow (`ShapeSelfTraining.startPurchasedPlan` + its sheet)
carry over verbatim.

## Non-goals

- No real photography sourcing — the card's figure slot is photo-READY; the
  content job stays on the Store-photography follow-up list.
- No website recipe/library **design** parity (separate wave) — but recipe
  **content** parity is IN scope (owner call, §7.6): the same catalog on app
  and web.
- `BSMealPreview` (the meal sheet) is NOT in scope — its Ingredients/Method
  boxes are a later fast-follow using the same grammar.
- Sheets stay quiet forms (the Start-plan sheet, swap sheets, filter groups).

## Shared rules

- **The card is a licensed object.** The double-ruled index card is a
  deliberate print artifact (like chat bubbles), NOT a return of boxes — its
  license depends on staying **bounded**: reference content only (header,
  title, byline, register, figure, ingredients, one note). Variable-length
  prose (the directions) never goes inside.
- **Zero-box everywhere else.** Boundaries from hairlines, datelines, ruled
  lines, spines, whitespace. Teal = action; role gold rides bylines/notes.
- **Honest-absent.** The figure renders only with a real photo; no photo →
  no figure (the card is complete without one). Demo stays signed-out-only.
- **No loops** on these pages (static surfaces). `bsSdReduced()` n/a.
- **States never color-only**; all targets ≥44px; `type="button"` on every
  new button.
- Kill raw `#8a5cf6` on these surfaces → `t.BLUE` (grocery/library color).

## 1 · The Kitchen Card (shared card renderer)

One implementation — a new top-level component in the client module,
`BSKitchenCard({ recipe, no, dayLabel })` (byline/note/figure read from the
recipe's own fields) — used by BOTH `BSShapeKitchenRecipe` and
`BSRecipePreview` (today they duplicate this layout with drift). Anatomy,
top → bottom, inside a **double-ruled frame**
(1px `t.RULE` outer + 1px `t.HAIR` inner, ~8px inset, square corners, paper
background):

1. **Typed Nº header** (centered mono, wide tracking): `SHAPE KITCHEN ·
   RECIPE Nº {no}` — `no` = the recipe's 1-based position in the catalog;
   day-view recipes not in the catalog show the day instead (`SHAPE KITCHEN
   · WEDNESDAY`). Never a fabricated number.
2. **Centered serif title** with the teal period.
3. **Gold byline** (centered mono): `FROM THE KITCHEN OF {coach}` — the
   recipe's real author (`r.by` / plan coach); absent when unknown.
4. **Register row (4)**: `KCAL {kcal}` · `MACROS {p}P` (sub `{c}C · {f}F`) ·
   `TIME {time}` · `SERVES {servings}` — existing fields verbatim; `—` for
   an honest absent value.
5. **The figure (conditional)**: renders ONLY when the recipe has a real
   image (new optional `photo` field — a URL/path; the existing `hero`
   gradient strings do NOT qualify). Full-card-width image in a hairline
   frame + mono caption row: left caption (`THE PLATE — {hero-ish line}` or
   the title), right `FIG. {no}`. `alt` = "Photograph of {title}".
6. **THE INGREDIENTS dateline** (centered mono between hairlines), then
   **ruled lines in two columns**: each ingredient on a teal-tinted rule
   (`1px solid` teal at ~30% alpha), name left (serif, household-unit
   converted where the setting applies), quantity right (mono dim); when a
   per-ingredient kcal exists it rides the quantity cell as a dim suffix
   (`500 g · 900`). Odd counts leave the last right-column slot empty.
7. **Typed coach note** (when the recipe has one): `{FIRSTNAME}: {note}` —
   mono, the name in gold. One line-ish; long notes wrap.

## 2 · Recipe detail (`BSShapeKitchenRecipe`) — the card + the article

1. Page: masthead/back kept → **the Kitchen Card** (§1).
2. **THE METHOD dateline** (centered) below the card, then the directions as
   **lettered serif steps** — `a.` teal mono letter + serif step text, full
   page width, hairline-free.
3. **Reviews** → press-credit quotes: 3px `t.HAIR` spine rows (reviewer name
   bold, mono meta, italic quote) replacing the radius-16 review cards.
4. **CTAs**: solid clipped-teal `SEND TO GROCERY LIST →` (same handler) +
   `♡ SAVE TO LIBRARY` as an ink + 2px teal-underline text action (same
   `bsLibToggle`). The boxed `BSSaveButton` instance here is replaced by the
   text action; `BSSaveButton` itself is untouched (other callers).

### Kills (detail)

The radius-16 bordered stat grid / Ingredients / Method / review cards, the
hero `borderRadius: 999` pill chip, and the duplicated card layout drift
between detail and preview.

## 3 · Eat-day recipe preview (`BSRecipePreview`) — same card

Renders **the same `BSKitchenCard`** (day variant: day-name header, no Nº)
plus the THE METHOD article below, same CTAs it has today (add-to-grocery
with its `groceryAdded` state, back). Kills its bespoke pre-Open-Ledger layout
(flat ink rules, solid-ink coach-note block, circular step badges).

## 4 · Recipes tab (`BSRecipeBox`) — the card stack

1. **Recipe rows → slim Nº cards**: each recipe a single-hairline framed
   card (bounded object — typed `Nº {n} · {DIET}` eyebrow in the diet color,
   serif title, mono meta line `{kcal} kcal · {p}P/{c}C/{f}F · {time}`,
   byline coach). The 62px gradient thumbs die (typographic cards; the
   photo lives on the detail card when real). Actions become text: `SEND TO
   GROCERY →` mono leader action + `♡ SAVE` / `✓ SAVED` text toggle — the
   radius-9 bordered buttons die. Tap opens the detail (unchanged).
2. **Quick filter pills + Filters toggle** (radius-999, filled active) →
   **squared quiet chips** (radius 3, hairline border; active = teal border
   and teal text — no fill). The advanced Diet/Protein/Free-from/Goals `Chip`s
   square the same way (they are filter controls — chips allowed, pills
   not). Counts kept.
3. Search underline + hero copy kept; the radius-18 empty-state card → an
   honest unboxed line.
4. `BSPlate` leaves this page (keeps its other callers).

## 5 · Library (`BSClientLibrary`) — "The Catalogue"

1. **Stat tiles → the typographic index** (owner-picked render): 4 columns —
   big tabular count, colored mono label, a 2px color tick underneath
   (workouts `t.RUST` · meals `t.GREEN` · recipes teal · groceries
   **`t.BLUE`**). Tap = same filter toggle (active column: 3px tick + ink
   count; `aria-pressed`). No borders, no fills.
2. Search underline + hero copy kept.
3. **Item rows**: bordered cards → tick-divider rows — 8px kind-color square
   · serif title · mono sub (`{KIND} · {coach} · {meta}`, recipes may carry
   `Nº {n}` when resolvable from the catalog) · saved date right · hairline
   dividers. Tap → `BSLibraryDetail` (unchanged).
4. Empty state → honest unboxed line with the marketplace deep-link kept.

## 6 · Saved-item detail (`BSLibraryDetail`)

1. Kind eyebrow + title + meta kept.
2. The radius-18 preview card → **unboxed**: preview text as italic serif on
   a 3px kind-color spine; `SAVED {date}` as a dim mono line under it.
3. **Start this plan** clipped CTA + its sheet: byte-identical (recently
   shipped, already in-language).
4. `Remove from library / ♡ Save` boxed button → ink + 2px teal-underline
   text action (same `bsLibToggle` + `onBack`).

## 7 · The catalog content — restructure + expand (owner-added scope)

The Shape Kitchen dataset (`mobile-app/src/broadsheet/shapeKitchenData.js`,
26 recipes) is updated WITH the redesign:

1. **Restructure ingredients** from single strings (`"6 oz chicken thigh"`)
   to the structured shape the day-view recipes already use — `{ n, m, k }`
   (quantity · name · optional kcal string) — so `BSKitchenCard` consumes
   ONE ingredient shape across catalog and plan recipes, and the ruled
   lines get a real qty cell (+ dim kcal suffix) without string parsing.
   Household-unit conversion applies to the structured quantity.
2. **Notes**: each recipe's `tip` renders as the card's typed note under the
   author's first name (`RAE: …`); tips are copyedited to fit that voice
   (imperative, one thought).
3. **Detail pass (owner call: "more detailed")** over every recipe, old and
   new — each must be genuinely cookable from the card + article alone:
   - **Ingredients**: a real quantity on EVERY line — no catch-all lines
     like "Garlic, paprika, salt" (split into `2 cloves garlic`, `1 tsp
     smoked paprika`, `1/2 tsp salt`); pantry basics included.
   - **Steps**: heat level, vessel, time, and a **sensory doneness cue** in
     every step that cooks ("medium-high until the edges blister, ~3 min");
     the why kept where it teaches ("dry skin is what lets it brown").
   - **Prep/cook split** in the `time` field where they differ
     (`15 min prep · 25 min cook`), and a **storage / meal-prep line**
     appended to the tip where the recipe batches.
   - One house voice throughout; macro math sanity-checked
     (kcal ≈ 4·P + 4·C + 9·F within ~±15%).
4. **Expand by ~8–10 recipes** (catalog → ~35) targeting coverage gaps —
   vegan/plant-based, seafood, snacks, batch-cook — same author roster,
   written to the same detail bar (structured ingredients, cue-rich steps,
   tip + storage note, tags, honest macros), gradient `hero` kept as the
   tab-era placeholder field.
5. **New data-integrity test** `tests/shape-kitchen-data.test.mjs`
   (registered in the root test script): every recipe has the required
   fields, structured ingredients, and macro-consistent kcal.
6. **Website content parity (owner call)**: the refreshed + expanded catalog
   ports to the website's `/recipes` dataset (`public/newdesign/recipes.jsx`,
   today a same-shape copy of the old 26) in the SAME wave — **content only,
   the website's design/rendering untouched**. The port keeps whatever data
   shape the website renderers consume (string ingredients may be generated
   from the structured `{n, m, k}` entries); every touched referenced `.jsx`
   gets its `?v=` cache-bust bump. Goal: the same recipes, same count, same
   copy on app and web.

## Data

- New **optional `photo` field** on recipe objects (catalog + plan recipes):
  a real image URL/path. Nothing populates it yet; the card renders the
  figure only when present. `hero` (gradient string) is never treated as a
  photo.
- Recipe `Nº` = 1-based index in the Shape Kitchen catalog array (stable
  demo data); absent → day-name header (preview) or no Nº (library sub).
- Catalog ingredient shape unified to `{ n, m, k }` (§7.1).

## Invariants (explicitly unchanged)

Send-to-grocery list building + `groceryAdded`, `bsLibToggle`/`useBSLibrary`
id scheme (`recipe:{slug}`), the full filter engine + counts, search,
household-unit display conversion, `BSNutritionTopTabs` wiring, Start-this-
plan (`startPurchasedPlan` payload + sheet), `_bsScrollTopOnMount`, demo-vs-
live gating, and every navigation handler.

## Accessibility

44px targets on rows/chips/actions; `aria-pressed` on filter chips and index
columns; the figure carries a real `alt`; quantities/counts tabular; states
named in mono text, never color-only.

## Verification

- Per commit: JSX parse-check · `VITE_BASE=/m/` mobile build exit 0 ·
  `npm test` (497 today + the new catalog data-integrity test) · LF
  normalize.
- Browser drive (demo data): Recipes tab filter/search/save/send-to-grocery,
  detail card with and WITHOUT a photo (temporarily inject one locally to
  verify the figure, do not commit it), day-view recipe preview, Library
  index filtering + row → detail → save/remove + Start-plan sheet opens,
  0px horizontal overflow at 320px.
- **On-device pass (owner)** before sign-off: Black/Sage/Cream × the two
  recipe surfaces × Library states.

## Rollout

Three build PRs: **PR A — the catalog content + the recipe surfaces** (§7
restructure/expansion + data test, then `BSKitchenCard` + detail + preview +
Recipes tab); **PR B — the Library** (Catalogue + detail); **PR C — the
website content port** (§7.6, content-only, `?v=` bumps). Each through the
standard gate (CI green + CodeRabbit findings addressed), squash-merged,
branches kept.
