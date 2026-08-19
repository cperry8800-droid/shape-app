# Allergen claim notes — "free from" claims kept, certified-form notes required, gate flipped

**Date:** 2026-08-18 · **Status:** DRAFT — build-ready except the owner questions in §10
(none block the build; each has a stated default) · **Migrations:** NONE ·
**Authoritative prior record:** `docs/WORKLOG.md` 2026-08-18 (#1907 rounds 3–4, the
broth item "REGISTERED, NOT CHANGED — NEEDS AN OWNER RULING" — the ruling has now been made) ·
**Implements on:** one PR (§9)

Every `path:line` in this document was verified by a reader agent against the main tree on
2026-08-18. Things that could NOT be verified are listed in §11 — read it before trusting
any claim about line numbers in `iosAppBroadsheetClient.jsx` (that file was moving during
verification) or about branch protection.

> ⚠ **THE WHOLE RISK OF THIS BUILD IS SEQUENCING.** `recipeNeeds()` reads a title's
> ABSENCE from `_RECIPE_NOT_GF` / `_RECIPE_HAS_DAIRY` as a positive "free from" claim
> (`mobile-app/src/broadsheet/shapeKitchenData.js:1074-1075`). Removing a title from those
> sets BEFORE its note ships re-creates the shipped P1 — the site telling a coeliac member
> a recipe is safe — **with the suite green**, because a one-way check cannot see a claim
> made by omission. The set removals, the notes, and the gate land in the **SAME change**
> (§2, §9), and the gate must be **proven to fail** on a removal-without-note (§7.5).

---

## 1. Problem

The owner ruled on the class the 2026-08-18 wave registered: **a recipe whose only
allergen-marker ingredient is an AMBIGUOUS one keeps its "free from" claim and carries a
recipe-level NOTE naming the safe form to buy.** Two decisions are FIXED and must not be
re-litigated:

1. **NOTE WORDING — certification first, brands as optional region-tagged examples.**
   E.g. *"Oats are only gluten-free when certified — standard milling shares a line with
   wheat. Look for a certified GF label — e.g. Bob's Red Mill GF Oats (US), Nairn's GF
   (UK)."* The brand list is **structured data** that can be maintained or omitted per
   market — never hardcoded prose (§3).
2. **ENFORCEMENT — a HARD GATE in the test suite.** A recipe claiming Gluten-free or
   Dairy-free whose ingredients hit the AMBIGUOUS vocabulary MUST carry a note for that
   allergen or the suite fails (§7).

### What this reverses

The existing gate, `tests/recipe-allergen-consistency.test.mjs`, enforces the **opposite**
ruling today: a recipe may not advertise a claim over an ambiguous ingredient at all — its
only exits are classification (title added to a set) or a `SAFE_FORMS` phrase exemption
(`:64-73`, remedies named at `:78-79`). Under that rule the catalog was **over-classified**:

- **Measured (by executing the modules, not from docs): oats appears in 4 recipes — all 4
  classified; soy sauce in 8 — all 8 classified; margarine in 2 — both classified. ZERO of
  those currently claim.** So for three of the owner's four ambiguous classes this ruling
  is not "add notes to existing claims" — it **reverses classifications** (§5).
- **Broth/stock/bouillon is the fourth class and the inverse case:** it is in NEITHER
  marker regex (`:27`, `:31` — verified by injection: `1 cup chicken broth` passes
  silently), so **5 recipes advertise Gluten-free over a broth line today with no note and
  no test**. The ruling's note requirement can only reach them if the vocabulary learns
  the words (§4).

Mutation-proven consequence (dossier, run against the live gate): restoring the
Gluten-free claim to `Overnight oats, three ways` without touching the gate produces
exactly one audit failure naming `1/2 cup rolled oats`. **The note must therefore be a
THIRD exemption branch inside `audit()`** — alongside classification and SAFE_FORMS —
not a separate additive test (§7.2).

---

## 2. The sequencing constraint — why the naive order is a P1

The mechanism, from the code:

- `recipeNeeds(r)` pushes `"Gluten-free"` / `"Dairy-free"` when the title is **absent**
  from the sets (`shapeKitchenData.js:1068-1077`). The website carries a byte-for-byte
  behavioural twin (`public/newdesign/recipes.jsx:2580-2589`) over its own hand-copied
  sets (`:2552`, `:2565`), whose comments state the same: *"ABSENT from this set is
  asserted gluten-free"* (`:2561`).
- The claim reaches members through the FREE FROM filter chips + counts on mobile
  (`iosAppBroadsheetClient.jsx:6226-6228`, `:6286-6287`) and on the web
  (`recipesPage.jsx:142`, `:199`) — a filtered result set IS the safety claim.
- Therefore: **a set removal is a publish action.** Commit a removal without its note and
  gate, and every static gate stays green (parse, tsc, suite, build) while a coeliac
  member filtering "Gluten-free" is told oats/soy-sauce/broth recipes are safe with no
  caveat anywhere on screen.

Binding order (enforced by §9's build order and §7.5's mutation proof):

1. The note data + attach loops + renderers may land **before** any set removal (a note
   on a still-classified recipe is inert-but-harmless).
2. The **gate rewrite and the set removals land in the same commit** — the current gate
   goes red the instant a soy/oats/margarine title leaves a set (`:78-84`), and the new
   gate's note requirement must be live before any broth marker or removal makes a claim.
3. Both surfaces' sets move together in that commit — the parity classification test
   (`tests/recipe-web-mobile-parity.test.mjs:121-134`) fails loudly on a one-sided edit
   (mutation-proven in the dossier), which is the desired backstop, not an obstacle.
4. Before the PR is opened, the gate is mutation-tested: a removal-without-note MUST fail
   the suite naming the recipe and the ingredient line (§7.5). Commit before
   mutation-testing (house rule — `git checkout --` has destroyed uncommitted fixes twice).

---

## 3. Data model — the note field, on both surfaces

### 3.1 Name and placement

- **The field is `allergenNotes` on the recipe object** (an array of note objects,
  attached at module load). The name is forced by two collisions verified in the dossier:
  - `note` is TAKEN on the website — it is the catalog's `blurb`, parity-checked at
    `tests/recipe-web-mobile-parity.test.mjs:86-90` and rendered as the detail pull quote
    (`recipeDetailPage.jsx:237-249`). Naming the new field `note` overwrites 85 pull
    quotes or fails parity on every recipe.
  - `tip` is required non-empty on all 85 (`tests/shape-kitchen-data.test.mjs:29-32`) and
    renders behind a **byline attribution** on mobile (`iosAppBroadsheetClient.jsx:5858`,
    `:5864-5868`, `:5938`) — folding the note into `tip` puts a brand recommendation in a
    named nutritionist's or USDA's mouth, and it also leaks into Cook Mode's PLATED tip
    (`:7109`) and BSPrepCook's de-duplicated "Storage" block (`:7666-7675`). Never reuse it.
  - Avoid `by` as any sub-key on the website side — the parity file's AST walk bans `.by`
    member reads in the three newdesign recipe pages (`recipe-web-mobile-parity.test.mjs:176-188`).

### 3.2 The authoring shape — one title-keyed table per surface, tuple entries

Mobile — a new export in `mobile-app/src/broadsheet/shapeKitchenData.js`, beside the
existing `_KITCHEN_STEP_META` overlay precedent (`:1009`, attach loop `:1033-1036`):

```js
// [title, allergen, certification, brands?]
// brands = [[name, region], ...] — structured, maintainable/omittable per market.
export const _RECIPE_ALLERGEN_NOTES = [
  ["Overnight oats, three ways", "gluten",
    "Oats are only gluten-free when certified — standard milling shares a line with wheat. Look for a certified GF label",
    [["Bob's Red Mill GF Oats", "US"], ["Nairn's GF", "UK"]]],
  // ... §5 lists all 14 required entries
];
for (const [title, allergen, certification, brands] of _RECIPE_ALLERGEN_NOTES) {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === title);
  if (r) (r.allergenNotes ||= []).push({ allergen, certification, brands: brands || [] });
}
```

- **Tuples, not objects, in the table** — key-order is then a non-issue for the
  JSON-based parity comparison (§8), and the flat array shape is exactly what the parity
  slicer can extract (§3.3).
- **The attach loop fails silently on a title typo** (`if (r)`), same as `_KITCHEN_STEP_META`
  — so it gets the same dedicated guard: a title-existence test mirroring
  `tests/shape-kitchen-data.test.mjs:100-102`, plus the gate's dead-note check (§7.3).
- One table covers all 85 recipes (authored + USDA) — unlike the classification sets, the
  notes do NOT split across the two data files. The classification sets DO stay split
  (`shapeKitchenData.js:1044-1061` spreading `USDA_NOT_GF`/`USDA_HAS_DAIRY` from
  `shapeKitchenData.usda.js:1453`, `:1476`), and §5 says which removal lands in which file.
- **The seven day-view recipe literals** (JSX titles, `coachNote`, not in the catalog —
  `iosAppBroadsheetClient.jsx:8057` etc.) are explicitly OUT: attach-at-load runs over
  `SHAPE_KITCHEN_RECIPES` only and the renderer reads `r.allergenNotes` off the object,
  so no title lookup ever runs at render time and JSX titles cannot mis-key.

Website — `public/newdesign/recipes.jsx` gets a hand-mirrored copy (there is no
generator; the file cannot import — it is a classic babel script sharing scope,
`Recipes.html:25-27`): the same `const _RECIPE_ALLERGEN_NOTES = [` table + the same
attach loop over `SHAPE_RECIPES`, declared at top level **outside** the three
`RECIPES_*` literals.

### 3.3 Parity-slicer constraints (breaking these kills the parity harness, not a test)

`tests/recipe-web-mobile-parity.test.mjs` extracts website literals by text slicing:
`evalArray` cuts from `const X = [` to the first line that is exactly `];`
(`:37-43`); `evalSet` to `\n]);` (`:44-50`). Therefore, in `recipes.jsx`:

- The notes table closes with `];` at column 0, and **every nested tuple/brands array
  stays indented** — an indented closing bracket never matches `\n];`, a column-0 one
  truncates the slice mid-literal and the whole parity file dies at import.
- The table matches the `const X = [` shape `evalArray` already understands, so the
  parity test reads it with the existing slicer plus one new call — no third extractor
  mechanism (§8).

### 3.4 The composed note text — one composer, certification first

A tiny pure helper in each surface's data file (mobile: exported from
`shapeKitchenData.js`; web: a top-level function in `recipes.jsx`):

```js
const bsAllergenNoteText = ({ certification, brands }) =>
  certification + (brands && brands.length
    ? " — e.g. " + brands.map(([n, r]) => `${n} (${r})`).join(", ") + "."
    : ".");
```

Binding constraints (the fixed owner wording decision): **certification text always
leads**; brands are appended ONLY from the structured list and only when present; a
market build that empties the brands list loses the examples and nothing else. The exact
join punctuation is implementer-tunable; the order is not.

---

## 4. The AMBIGUOUS vocabulary

Four classes, per the owner ruling. Each is *ambiguous* — a certified/labelled form of
the same product is genuinely free of the allergen — as opposed to *disqualifying*
ingredients (wheat, farro, cheddar…) where no purchasable form is safe:

| class | regex (ingredient names only) | why ambiguous, not disqualifying | in the gate today? |
| --- | --- | --- | --- |
| oats | `\b(oats?\|oatmeal)\b` | oats are inherently gluten-free; standard milling shares a line with wheat — certified-GF oats exist (the rationale already written at `shapeKitchenData.usda.js:1454-1456`) | `oats?` in GLUTEN (`recipe-allergen-consistency.test.mjs:27`) |
| soy sauce | `\bsoy sauce\b` | traditionally brewed with wheat; certified-GF soy sauce and GF-labelled tamari exist | `soy sauce` in GLUTEN (`:27`) |
| broth / stock / bouillon | `\b(broths?\|stocks?\|bouillon)\b` | commercial broth/bouillon frequently carries wheat; certified-GF broths exist. Covers the liquid AND the cube/granule forms (`low-sodium beef bouillon cube` usda:37, `vegetable bouillon` usda:1308) | **NOT in any marker** — must be ADDED to GLUTEN or the 5 claiming recipes stay invisible (injection-verified fail-open) |
| margarine | `\bmargarine\b` | generic margarine commonly contains milk solids/whey; dairy-free-labelled margarines exist (rationale at `usda.js:1476-1478`) | `margarine` in DAIRY (`:31`) |

Rules the vocabulary must obey:

- **Match by regex against the ingredient NAME line, never by exact string** — `nameOf`
  joins `{n, m}` so the same class appears as `"1 tsp soy sauce"` through
  `"3 tbsp reduced-sodium soy sauce"` (`:55`).
- **Ingredients only, never steps** — the gate's own header declares that scope (`:19-22`),
  and it is load-bearing here: SIX recipes say "broth"/"stock" only in a step/tip while
  buying water/tomatoes (Beef pozole, Ground beef stew, Shorba, Braised chicken thighs,
  Chicken pozole, Catfish stew — full ingredient lists verified). Scanning steps produces
  six false failures that would be "fixed" by weakening the gate.
- **Adding broth to GLUTEN makes the 5 claiming recipes hit the audit** — that is the
  point; the note branch (§7.2) is what lets them pass WITH a note.
- **NOT in v1** (owner has not ruled; see §10.2): `miso`, `oyster sauce`, `teriyaki` —
  soy-adjacent, commonly wheat-bearing, currently hand-classified with no gate behind
  them. This spec deliberately does NOT flip the recipes whose gluten story depends on
  them (§5).
- **Known fail-open residue, unchanged by this PR:** the marker vocabulary misses
  semolina, spelt, ghee, kefir, mascarpone, kamut, triticale, quark, paneer, casein,
  half-and-half, custard powder, and the compound-word class (`buttermilk`,
  `creme fraiche` — the `\b` anchors, not the word list, are the hole). Widening that is
  registered open work from #1907, not this PR's scope; the note gate inherits exactly the
  same "fails closed only inside its vocabulary" honesty and must be described that way.

---

## 5. Exact recipe inventory — every title that changes

Derived by executing both catalog modules (not from comments — the block comments above
`USDA_NOT_GF`/`USDA_HAS_DAIRY` attribute all 17 entries each to oats/margarine and are
wrong for 15 of them; never derive the sets from those comments).

### 5.1 Notes required, NO set change — the 5 broth claimers (claim already live)

| # | title | file / ingredient line | claims today | note |
| --- | --- | --- | --- | --- |
| 1 | One-pan chicken and rice | `shapeKitchenData.js:33` `low-sodium chicken broth` | GF + DF | gluten · broth |
| 2 | Red lentil and spinach dahl | `:214` `vegetable broth` | GF + DF | gluten · broth |
| 3 | Turkey chili verde | `:924` `chicken stock` | GF + DF | gluten · broth |
| 4 | Slow-simmered beef pot roast | `usda.js:37` `low-sodium beef bouillon cube` | GF + DF | gluten · broth |
| 5 | Black skillet beef with kale and red potatoes | `usda.js:131` `reduced-sodium beef broth` | GF + DF | gluten · broth |

(The DF half of their claims has no dairy-ambiguous ingredient — no dairy note owed.)

### 5.2 Claim RESTORED — remove from a set AND add the note (same commit)

**From `_RECIPE_NOT_GF` (authored literal, `shapeKitchenData.js:1044-1052`):**

| # | title | ambiguous ingredient | also in HAS_DAIRY? |
| --- | --- | --- | --- |
| 6 | Overnight oats, three ways | `:792` rolled oats | YES — **stays** (milk, Greek yogurt, whey are real dairy) |
| 7 | Date and almond energy bites | `:894` rolled oats | no |
| 8 | Tempo turkey lettuce cups | `:82` soy sauce | no — its `butter lettuce` DAIRY hit is covered by the existing SAFE_FORMS entry (`:43`), which MUST survive the gate rewrite |
| 9 | Tofu and edamame poke bowl | `:302` soy sauce | no |

**From `USDA_NOT_GF` (`shapeKitchenData.usda.js:1453-1474`):**

| # | title | ambiguous ingredient | also in HAS_DAIRY? |
| --- | --- | --- | --- |
| 10 | Blueberry baked oats in ramekins | `usda:865` quick-cooking rolled oats | YES — stays (`:1489`, milk + yogurt) |
| 11 | Maple banana oatmeal with walnuts | `usda:1330` quick cooking oats | YES — stays (`:1492`, non-fat dry milk) |
| 12 | Asparagus and mandarin chicken rice bowl | `usda:412` reduced-sodium soy sauce | no |
| 13 | Sizzling chicken and broccoli over brown rice | `usda:494` reduced-sodium soy sauce | no |

**From `USDA_HAS_DAIRY` (`usda.js:1476-1495`):**

| # | title | ambiguous ingredient | note |
| --- | --- | --- | --- |
| 14 | Herbed baked salmon with lemon | `usda:524` margarine, melted (its ONLY dairy hit — measured) | dairy · margarine |

**Total: 14 notes (13 gluten + 1 dairy); 9 set removals (4 authored NOT_GF, 4 USDA_NOT_GF,
1 USDA_HAS_DAIRY). Every removal is mirrored in the website's flat sets
(`recipes.jsx:2552-2564`, `:2565-2573`) in the same commit.**

Visible side effect (state it in the PR): the FREE FROM chip counts change — Gluten-free
49 → 57, Dairy-free 56 → 57 — on mobile (`iosAppBroadsheetClient.jsx:6286-6287`) and web
(`recipesPage.jsx:199`).

### 5.3 HELD classified pending an owner ruling on the adjacent classes (§10.2)

- **Miso-glazed cod with greens** — soy sauce (`:302`-adjacent, `:272`) **plus
  `white miso`** (`:262` region), which is commonly barley/wheat-fermented and invisible
  to every regex. Flipping it would publish a GF claim over miso with no note and no gate.
- **Beef and broccoli stir-fry** — soy sauce (`:352`) **plus `oyster sauce`** (`:343`
  region), commonly wheat-bearing, equally invisible.
- **Tempeh and broccoli teriyaki** — `teriyaki sauce` (`:371` region), unruled class.

⚠ This is a deliberate deviation from the reader dossier's Area-1 "10 flip" list (which
counted Miso cod and Beef & broccoli as ambiguous-only because only the REGEX's markers
were counted). Under-claiming costs a filter hit; over-claiming is the harm — the same
safe-direction rule #1907 round 4 recorded. Default: hold; the owner can flip them by
ruling miso/oyster/teriyaki ambiguous (then they get markers + notes like everything else).

### 5.4 MUST STAY classified — hard ingredient present (a bulk class-flip would ship false claims)

Crispy tofu grain bowl (farro) · Mango and peanut chicken wraps (whole-wheat tortillas) ·
Harissa salmon with couscous (couscous) · Beef stroganoff with macaroni (macaroni) ·
Turkey tetrazzini bake (fettuccine + flour) · Barley pilaf with mushrooms and celery
(pearl barley) · Layered cheddar potato gratin (cheddar + non-fat milk for dairy, flour
for gluten). Four of these ALSO buy broth/stock — whether they get an (optional,
ingredient-scoped) note is §10.1; the gate never requires one, because `recipeNeeds`
never emits a claim for them (`audit()` `continue`s at
`recipe-allergen-consistency.test.mjs:67`).

---

## 6. Rendering — every surface that must show the note

Notes render as their OWN unattributed block — never through the tip/byline machinery.

### Mobile (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — ⚠ anchor edits on
symbol names, not line numbers; the file was being edited concurrently during verification)

1. **`BSKitchenCard`** (function at `:5852` — the shared index card BOTH the catalog
   detail `:7732` and the day-view preview `:5974` render, and the ONE mobile component
   with whole-catalog render coverage, `tests/kitchen-card-render.test.mjs:103-110`).
   Insert after the ingredients list (the `:5928-5930` rows region) and BEFORE the tip
   note block (`:5936`): for each `r.allergenNotes` entry, a mono eyebrow
   `ALLERGEN · GLUTEN` / `ALLERGEN · DAIRY` + `bsAllergenNoteText(note)`. **No
   `noteName` prefix** — the block must not route through `:5858`/`:5864-5868`/`:5938`.
   English, hard-coded, matching the card's existing untranslated state (`:5852-5943`
   has zero `tr()` calls); i18n is a registered follow-up (§10.6).
2. **Cook Mode** — `bsCookableFromRecipe` builds an explicit allowlist literal
   (`mobile-app/src/services/cookable.mjs:747-761`); without a change the note is
   silently dropped on the cook-along surface. Add `allergenNotes: recipe.allergenNotes || null`
   to that literal, and render the note(s) on the **MISE screen** of `BSCookMode`
   (function at `:6385`) beside the ingredient checklist — the shopping decision happens
   at mise, not at PLATED. The PLATED tip render (`:7109`) is untouched.
3. **BSRecipeBox list rows** (`:6302-6324`) — unchanged. No per-recipe free-from label
   exists on mobile (the claim lives only in the filter chips), so there is no badge for
   a note to sit beside; the card is the first claim-adjacent surface. Stated as a
   decision, not an oversight.
4. **BSPrepCook / bsCookableFromMeal / grocery** — out of scope, registered (§10.7).

### Website

5. **`recipeDetailPage.jsx`** — insertion slot (b) from the dossier: inside the left
   column, between the `INGREDIENTS` heading (`:255`) and the `<ul>` (`:256`), so the
   note reads BEFORE the ingredient list and stacks above METHOD on mobile (the grid
   collapses under 760px, `:401`). Full composed text per note, plain text (no links in
   v1 — parity of copy with the card).
6. **`recipesPage.jsx` `RecipeCard`** — the All-view blind spot: restoring 9 claims
   newly ENTERS those recipes into the Free-From filtered grid, which otherwise shows
   uncaveated claims. Add a one-line mono note (the `certification` clause, CSS-clamped
   to one line) as the last child of the card body, between the tag map close (`:103`)
   and the body close (`:104`). **Inert text only — the whole card is an anchor**
   (`:56`-`:105`; the no-nested-link convention is written at `:84-85`). Brands are
   detail-page-only.
7. **NOT touched:** `RecipeModal` / `RecipeOfTheDayWidget` inside `recipes.jsx`
   (`:2614`, `:2703`) — mounted by NOTHING (the file's header comment claiming
   ClientDashboard/ClientLibrary load it is stale; verified zero loaders). A note added
   there ships on zero pages. Do not "fix" them.

---

## 7. The gate — `tests/recipe-allergen-consistency.test.mjs`

Rewrite in place; the file stays the single allergen authority over the MOBILE catalog
(it imports `shapeKitchenData.js` at `:25`; the website is covered by parity, §8).

### 7.1 Vocabulary changes

- `GLUTEN` (`:27`) gains `broths?|stocks?|bouillon` — 28 → 31 alternatives.
- New tagged AMBIGUOUS regexes (per §4): `AMBIGUOUS = { gluten: /\b(oats?|oatmeal|soy sauce|broths?|stocks?|bouillon)\b/i, dairy: /\bmargarine\b/i }`.
- `SAFE_FORMS` (`:41-53`) is **extended, never replaced or restructured** — its
  phrase-level `residue()` semantics (`:60-62`) are a shipped-defect fix (`:36-40`), and
  `butter lettuce` (`:43`) is load-bearing for Tempo turkey lettuce cups. Adding an
  ambiguous class to SAFE_FORMS instead of the note path is FORBIDDEN — SAFE_FORMS is
  keyed on the phrase alone and would exempt the ingredient catalog-wide, forever.

### 7.2 The third exemption branch — inside `audit()`

At the only place holding the `(recipe, allergen, matched line)` triple — between the
marker test (`:70`) and the `bad.push` (`:71`):

```
if marker.test(residue(line, allergen)):
  amb = AMBIGUOUS[allergen]
  hasNote = (r.allergenNotes || []).some(n => n.allergen === allergen)
  # The note only excuses a hit the ambiguous class fully explains:
  if hasNote and amb.test(line) and !marker.test(strike(line, amb)): continue
  bad.push(`${r.title}: advertises "${claim}" over "${line.trim()}" — classify it,
            add a SAFE_FORM with a reason, or attach an allergen note (owner ruling 2026-08-18)`)
```

where `strike` blanks only the ambiguous phrase (same mechanism as `residue`). The
residue re-test is what stops a note from waving through a line that ALSO carries a hard
marker (`corn tortillas with wheat flour` class) — the note is keyed on
(recipe × allergen), and even then only excuses ambiguous-explained hits.

### 7.3 Note-shape and liveness assertions (new `test()` blocks in the same file)

- **Shape:** every `_RECIPE_ALLERGEN_NOTES` entry has `allergen ∈ {gluten, dairy}`, a
  non-empty `certification` that matches a certification vocabulary
  (`/certif|gluten-free label|dairy-free|labelled|labeled/i`) — a note reading "we like
  Bob's Red Mill" with no certification language FAILS (the wording ruling is
  structural, not advisory); `brands`, when present, is an array of `[name, region]`
  string pairs.
- **Title existence:** every note title is a real catalog title (mirrors
  `tests/shape-kitchen-data.test.mjs:100-102`; a typo'd title must fail the build, not
  silently attach to nothing — mutation-proven hazard: a typo'd SET entry already passes
  all 4 parity tests).
- **Dead-note guard:** every note's `AMBIGUOUS[allergen]` matches ≥ 1 ingredient line of
  its recipe — catches a note pointed at the wrong recipe or wrong allergen.
- **Guard-the-guard extensions** (beside `:90-95`): each AMBIGUOUS regex matches ≥ 1 real
  catalog ingredient (a typo in the new broth marker must not silence the whole
  requirement vacuously); the audit's note branch is exercised ≥ 1 time for gluten
  (14 notes exist, so ≥ 1 is safe and non-brittle); `_RECIPE_ALLERGEN_NOTES.length >= 14`.

### 7.4 What the gate still does NOT see — stated honestly

Ingredient names only, mobile catalog only, and only inside its vocabulary. The website
is enforced via parity (§8), not by this file. A future recipe naming an ambiguous
ingredient outside the four classes (miso, oyster sauce, teriyaki, semolina, …) is
invisible here exactly as today.

### 7.5 The mutation proofs (required before the PR opens; commit first, `cp file file.bak`
never `git checkout --`; run an unmutated sanity case at both ends)

1. Remove `"Date and almond energy bites"` from `_RECIPE_NOT_GF` AND delete its note →
   the gluten audit must fail naming the oats line. Restore → green. **This is the
   removal-without-note failure the whole build hinges on.**
2. Blank one note's `certification` → the shape test fails.
3. Typo one note's title → the title-existence test fails.
4. Remove `broths?|stocks?|bouillon` from GLUTEN → the guard-the-guard ambiguous-liveness
   assertion fails (NOT a silent vacuous pass).
5. Delete the `butter lettuce` SAFE_FORM → the dairy audit fails on Tempo turkey lettuce
   cups (proves the extension didn't break the phrase exemptions).

Record all five outcomes in the PR body.

### 7.6 Render-side assertions

- `tests/kitchen-card-render.test.mjs`: the existing every-catalog-recipe render loop
  (`:103-110`) covers crashes for free once the card renders notes. Add: for one
  note-bearing recipe (e.g. Herbed baked salmon with lemon), the rendered markup contains
  its `certification` text and does NOT contain it preceded by the attribution name
  (the byline-fabrication regression).
- `tests/recipe-render.test.mjs`: extend the detail-page render from 2 recipes to **the
  whole catalog** (loop like the card test at `:76-80`) — the detail note-lookup must not
  assume every recipe has notes; assert the note text renders in `RecipeDetailPage` and
  the one-line note renders in `RecipeCard` for a note-bearing recipe. (`RecipesPage`
  itself remains unrendered by any test — pre-existing gap, registered, not this PR.)

### 7.7 Where the gate runs

`npm test` globs `tests/**/*.test.mjs` (`package.json:9`) and runs in CI job
`Tests (unit + mount)` (`.github/workflows/ci.yml:79-80`, `:106-107`) — no per-file
registration. ⚠ Whether that job is a REQUIRED merge check is branch-protection state,
not repo content (§11.2) — describe the gate as "fails the suite/CI", never "blocks the
merge", unless the owner has added it to the required set.

---

## 8. Parity — `tests/recipe-web-mobile-parity.test.mjs`

The parity test compares a hand-listed field set (`:85-115`) — a new field is invisible
until registered (the exact `prep`/`license` drift class already live in that file).
Additions:

1. **Extract the website table** with the existing slicer:
   `const WEB_NOTES = evalArray('const _RECIPE_ALLERGEN_NOTES = [');` plus an
   extractor-found-something assertion: `assert.ok(WEB_NOTES.length >= 14, ...)` — an
   extractor that finds nothing must fail, never pass vacuously.
2. **Table equality:** `assert.deepEqual(sort(WEB_NOTES), sort(MOBILE_NOTES))` where
   `sort` orders by `title + allergen` and MOBILE_NOTES is imported from
   `shapeKitchenData.js`. Tuples make this order-stable with no key-order trap.
3. **Per-recipe field cmp** (belt + braces, catches a broken attach loop on either side):
   inside the `:85-115` loop, after `tags`:
   `cmp('allergenNotes', JSON.stringify(w.allergenNotes ?? null), JSON.stringify(m.allergenNotes ?? null));`
   — `?? null` is mandatory (absent vs present-but-null, the `by`/`byRole` precedent at
   `:89-94`; a raw cmp fails on all 71 note-less recipes), `JSON.stringify` is mandatory
   (objects are never `!==`-equal, the `tags` precedent at `:104`).
4. **Set removals need no new machinery** — the classification test (`:121-134`) already
   fails in BOTH directions on a one-sided edit (mutation-proven). It is the required
   backstop for §5.2's mirror edits.

---

## 9. Build order — ONE PR

Internal commit order (the pre-commit hook runs the suite per commit, so each commit is
green on its own):

1. **Notes + attach + composer + shape/title tests** — `shapeKitchenData.js` gains
   `_RECIPE_ALLERGEN_NOTES` (14 entries per §5), the attach loop, `bsAllergenNoteText`;
   `tests/shape-kitchen-data.test.mjs` gains the title-existence + shape tests. No set
   changes yet; the old gate stays green (notes are inert on classified recipes).
2. **THE PIVOT COMMIT — gate rewrite + ALL set removals, both surfaces, together:**
   `tests/recipe-allergen-consistency.test.mjs` per §7 (broth markers, AMBIGUOUS, third
   branch, shape/liveness/guard tests) + the 9 removals in `shapeKitchenData.js` /
   `shapeKitchenData.usda.js` + the mirrored removals AND the notes table + attach loop
   in `public/newdesign/recipes.jsx` + the §8 parity additions. This is the commit the
   sequencing constraint is about; it cannot be split without a red or lying intermediate
   state.
3. **Mobile rendering** — `BSKitchenCard` note block; `cookable.mjs` allowlist +
   BSCookMode mise render; `tests/kitchen-card-render.test.mjs` assertions (§7.6).
4. **Website rendering** — `recipeDetailPage.jsx` slot (b); `recipesPage.jsx` card line;
   `tests/recipe-render.test.mjs` whole-catalog detail loop + note assertions.
5. **Mutation proofs** (§7.5) run against the finished head; outcomes recorded in the PR.
6. **Records** — WORKLOG entry flipping the #1907 "REGISTERED — NEEDS AN OWNER RULING"
   broth item to ruled+built (minimal diff), registering the §10 follow-ups.

Standard gates: JSX parse (`@babel/parser`, both edited jsx surfaces) · `tsc --noEmit` ·
full `npm test` re-run (never carry a suite count forward) · PowerShell `VITE_BASE=/m/`
build · `build-newdesign --check` · every touched file LF with zero NUL bytes — verify
with `tr -cd '\r' < f | wc -c`, not `grep -c` (all six data/page files verified `i/lf w/lf`
in the dossier; the Edit tool writes CRLF on this machine — normalize after editing).
Merge gate: CI green + Codex clean on the final head; batch review fixes into one push.
Pre-push self-review against the known bug classes: the miss-next-to-the-fix sibling sweep
(re-grep `allergenNotes` consumers), quantifier claims in the PR summary, and a re-grep of
`iosAppBroadsheetClient.jsx` anchors (§11.1).

---

## 10. Open questions — none block the build; defaults stated

1. **Note scope: claim-scoped or ingredient-scoped?** 9 recipes buy broth/stock but only
   5 claim; the other 4 (Harissa, Stroganoff, Tetrazzini, Barley) stay classified for
   hard gluten, yet a cook following them still buys stock. Ingredient-scoped notes on
   classified recipes are ALLOWED by the gate (dead-note guard permits them) but not
   required. **Default: claim-scoped requirement only; the 4 classified broth recipes get
   no note in v1.**
2. **Miso / oyster sauce / teriyaki** — rule them ambiguous (Miso-glazed cod, Beef and
   broccoli stir-fry, Tempeh and broccoli teriyaki then flip with widened vocabulary +
   notes) or disqualifying-until-ruled? **Default: hold all three classified (§5.3).**
3. **The `GF` string tag** — 12 recipes carry a `GF` tag tied to nothing (agrees with the
   sets today by coincidence; never renders on mobile — `tags[0]` only at `:6302`).
   Restored recipes do NOT gain the tag in v1. **Default: leave tags untouched; register
   the tag↔set drift hazard rather than adding a coupling test in this PR.**
4. **Brand examples** — ship the US/UK examples from the owner's wording (Bob's Red Mill
   GF Oats · Nairn's GF for oats; implementer picks equivalent certified examples for soy
   sauce/broth/margarine or omits brands for those classes)? **Default: brands on the 4
   oats notes only; certification-only text for soy/broth/margarine until ops supplies
   vetted brand lists** — the structured field makes adding them a data edit.
5. **Website card line copy** — certification first sentence, one-line clamp, inert.
   **Default: as specced (§6.6); pure presentation, tunable at review.**
6. **i18n** — notes are catalog data (English, like `tip`/`ingredients`); BSKitchenCard
   has zero i18n today. **Default: ship English; register the card's localization (label
   + notes) with the standing i18n follow-up.**
7. **Downstream surfaces** — grocery hand-off (the note never reaches the shop list or
   Instacart: `recipeDetailPage.jsx:44-48`, `:329`), BSPrepCook merged mise,
   `bsCookableFromMeal`. **Default: out of scope; register all three as follow-ups.**

---

## 11. What I could NOT verify (honesty section)

1. **`iosAppBroadsheetClient.jsx` line numbers are KNOWN-UNSTABLE.** The file's mtime
   moved during the verification run and lines below ~9184 shifted +4; citations were
   re-verified against md5 `841f33972e4bac7a75f53fd5667b3fc0` at that moment. Anchor
   every edit on symbol names (`function BSKitchenCard`, `function BSCookMode`,
   `bsCookableFromRecipe`) and re-grep before touching the file.
2. **Whether `Tests (unit + mount)` is a required merge check.** Branch protection is
   GitHub state, not repository content; the recorded expectation is that only
   Web · Mobile · gitleaks are required. The "hard gate" claim in this spec therefore
   means "fails the suite and the CI job" — do not claim merge-blocking without checking
   Settings → Branches.
3. **Real-world brand facts.** That Bob's Red Mill GF Oats / Nairn's GF are currently
   certified and sold in the named markets is a product-world claim nobody verified from
   this machine — the structured brands field exists precisely so ops can amend/remove
   entries without a code change. Owner/ops should eyeball the shipped brand list.
4. **The certification wording is engineering-drafted, not counsel-reviewed.** The owner
   ruled the mechanism; the specific health-adjacent sentences (§3.4 examples) follow the
   owner's own example wording but have not been through the standing counsel review that
   other health-claim copy gets. Flag in the PR body.
5. **Every path:line in this spec comes from the 2026-08-18 reader dossier**, which
   executed the modules and mutation-tested the gates it describes; this spec's author
   did not independently re-read the tree. The dossier's measured counts (4 oats / 8 soy /
   2 margarine / 9 broth-bearing / 5 broth-claiming) are executions, not doc citations,
   and are treated as authoritative over the three documents they contradict (§5, and the
   contradictions listed in the PR summary).
6. **No database, no migration, no live-catalog question exists for this feature** — it
   is entirely source-module data + tests.
