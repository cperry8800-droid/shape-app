# Real food-database search (meal logger) — design

**Date:** 2026-07-09 · **Status:** DRAFT — awaiting owner go
**Owner decisions taken:** provider = **hybrid USDA FoodData Central + Open Food
Facts**; **text search only** in v1 (barcode scanning deferred to the native
build; the OFF normalizer is barcode-ready for v2).

## The problem

The meal logger's add-food sheet (#1601 "Correct the Record") is honest but
empty for signed-in members: "Food search is coming. Enter what you ate
manually for now." The demo FOODS catalog is signed-out-only. Members correct
their record by hand-typing every ingredient's name, portion, and four macros.

## What ships

Typing in the add-food sheet searches a real food database; a result lands on
the ingredient list as a normal row (`{ id, name, qty, kcal, p, c, f, on }`,
stable `bsIngId`) with provider macros pre-filled; recents become real.

## Architecture

### 1. One pure module — `mobile-app/src/services/foodSearch.mjs` (+ tests)

The `workoutShare.mjs` pattern: the pure functions are the single source of
truth and the **server route imports them** (no TS twin drift):

- `normalizeFdcFood(raw)` — FDC search hit → the canonical result:
  `{ id, source: 'fdc', name, brand?, qty, kcal, p, c, f, per100g, servings }`.
  Per-serving math from FDC's per-100g nutrients × servingSize; falls back to
  a 100 g serving labeled honestly (`'100 g'`).
- `normalizeOffProduct(raw)` — OFF product → the same shape (`source: 'off'`,
  brand from `brands`, serving from `serving_size`, barcode kept on the record
  for v2).
- `mergeAndRank(fdcRows, offRows, q)` — dedupe near-identical names, rank:
  name-prefix matches first, generic (FDC Foundation/SR Legacy) above branded
  for whole-food queries, branded (OFF) surfaces on brand-looking queries;
  **rows missing kcal are dropped** (never a fabricated 0 — honest-data rule);
  cap 12.
- Unit vectors in `tests/food-search.test.mjs` against fixture payloads from
  both APIs (incl. a missing-kcal drop case, serving-math cases, and the
  merge/rank ordering).

### 2. Server route — `GET /api/nutrition/food-search?q=`

- Lives under `/api/nutrition` → already **membership-gated by the proxy** and
  rate-limited like every `/api/*` route. Bearer + cookie auth (native + /m/).
- Fans out to both providers **in parallel with a per-provider timeout
  (~2.5 s)**; either side failing degrades to the other's results (both down →
  `{ results: [], unavailable: true }` — the sheet shows the honest
  can't-reach state, never an error page).
  - **USDA FDC:** `POST api.nal.usda.gov/fdc/v1/foods/search` with
    `FDC_API_KEY` (free key; 3,600 req/hr default). DataTypes: Foundation +
    SR Legacy (generic/whole foods — FDC's strength in the hybrid).
  - **Open Food Facts:** the public search API, no key; a proper
    `User-Agent: Shape/1.0 (privacy@theshapecommunity.com)` per OFF policy
    (branded/packaged foods — OFF's strength).
- **No `FDC_API_KEY` set → FDC leg quietly skipped** (OFF-only results), so
  the feature works before the owner creates the key and gets better after.
- Registered in the War Room `RAW_ROUTES`.
- v1 has **no DB cache**; the client debounce + result cap keep volume tiny at
  current scale. If OFF politeness ever matters, a keyed cache table is the
  known next step (noted, not built).

### 3. Client — the add-food sheet becomes real

- The signed-in branch replaces the "coming soon" line with the same search UI
  the demo already renders: the input (placeholder becomes **"Search foods &
  brands…"** — "barcodes" leaves the copy until v2 ships it), a mono
  status line (`Searching…` / `N results` / honest failure copy), and result
  rows (name + `qty · kcal · P` sub-line, 44 px ＋).
- **Debounced 350 ms, in-flight aborted** (`AbortController`), min 2 chars.
  `window.ShapeFoodSearch.search(q)` in `shapeBackend.js` (plain authed fetch
  — no shared cache; queries are too varied to benefit).
- **＋ adds directly** with the provider's default serving; **tapping the row
  body opens the existing ingredient editor prefilled** (name/qty/macros) so a
  member can adjust the portion before it lands — reuses `editIng` verbatim.
- **Recents become real:** an added food is persisted to
  `user_goals('food_recents')` (cap 20, most-recent-first, deduped by name —
  **no migration**, the established `user_goals` pattern). Empty-query state
  shows real recents for signed-in members; the demo FOODS catalog stays
  signed-out-only. A best-effort write failure never blocks the add.
- Signed-out preview is byte-identical to today (demo catalog + recents).

### 4. Honesty rules (carried from #1601)

Never a fabricated macro: kcal-less provider rows are dropped in
`mergeAndRank`; provider values land as integers the member can edit; the
TALLY/CTA math is untouched (it already derives from the ingredient rows).
Failure states say what happened and always leave **Enter manually →** as the
floor.

## Owner actions

- Create the free FDC API key (fdc.nal.usda.gov → API key signup) and set
  **`FDC_API_KEY`** in Vercel env. Until then the route runs OFF-only.

## Out of scope (v1)

Barcode scanning (v2 — OFF records already carry the barcode); natural-language
multi-food parsing ("2 eggs and toast"); a food-cache table; website logger
parity (mobile-first, same as the logger itself); editing a recent's saved
macros (recents replay what was added).

## Phasing + verification

One build PR (module + route + sheet + recents + War Room). Per commit: JSX
parse · `tsc --noEmit` · `/m/` build · full `npm test` (new vectors registered)
· LF. Staging click-through: search "chicken breast" (generic-first), a brand
query (OFF result lands), add-direct vs tap-to-edit, recents populate + replay,
FDC-key-absent degrade, both-providers-down degrade, signed-out demo unchanged.
Owner on-device pass across papers.
