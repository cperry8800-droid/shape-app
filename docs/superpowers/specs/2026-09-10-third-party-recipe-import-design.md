# Third-party recipe import — the ingest ladder, the two breakdowns, and what an imported recipe may never claim

**Date:** 2026-09-10 · **Status:** DRAFT, unbuilt · reviewed (§0) · surveyed (§0b) · **Migrations:** ONE — a
`recipe-imports` storage bucket (§4.2); no schema change · **Owner decisions taken 2026-09-10:** private
to the member · AI draft allowed, labelled + member-reviewed · paste + photo in v1, URL
fetch deferred (§10) · **Authoritative prior record:** the Cook Mode wave (#1804–#1809) and
[`2026-08-19-cook-together-serve-time-design.md`](2026-08-19-cook-together-serve-time-design.md)
· **Implements on:** four PRs (§13)

Every `path:line` and every claim about existing behaviour in this document was verified on
2026-09-10 by reading the tree at `7d23eb88` (`origin/main`). Things that could NOT be
verified are in §12 — read that section before trusting the photo path.

> ⚠ **THE SIGNATURE CONSTRAINT OF THIS FEATURE, STATED BEFORE ANYTHING ELSE.**
> `mobile-app/src/services/cookOrchestrator.mjs:8-12` carries a binding owner constraint:
>
> > *no fabricated parallelism. Interleaving requires EXPLICIT structured metadata —
> > `passive === true` + a station + `min ≥ minPassive` — never a merely-parsed duration
> > (a "simmer 20 min, stirring" is not hands-off).*
>
> The attractive version of this feature — *upload a recipe, the model finds its hands-off
> windows, the prep board interleaves it with your other dishes* — **is the thing that
> constraint exists to refuse.** An imported recipe gets **no** passive windows and falls
> back to SERIAL. §7 is the full argument and the honest alternative.
>
> This is not a detail to be revisited during the build. If a reviewer or a later session
> proposes inferring windows from imported prose, the answer is in this box and in the
> four catalog guard tests at `tests/shape-kitchen-data.test.mjs:101,167,205,233`.

---

## 0. Review record — the adversarial pass, 2026-09-10

Run after the draft was complete, in-session on Claude Fable 5.1 — the owner switched the
session model rather than spawning a cold agent, trading independence for the loaded
context, deliberately. The bar was finding claims that are **wrong**, so every finding below
was re-derived from the source, not from the draft. Each is corrected in the section named,
or refuted and left standing.

**0.1 — The seam was half-identified.** The draft framed `bsCookableFromText` as *the* seam.
It is the seam for the raw **paste** — a blob it splits into a draft. The **stored** document
(§3.2) already carries reviewed `steps[]` and `{n,m,k}` ingredients, which is the RECIPE
shape; feeding it to the text adapter would join and re-split what the member just confirmed.
The stored document goes through a thin `bsCookableFromMemberRecipe` wrapper over
`bsCookableFromRecipe`. *Corrected in §1, §2, §5.3, §13.*

**0.2 — The identity plan was unbuildable as written.** §5.3 said "pass the uuid as
`mealId`" and §13 said `bsCookableFromText` is "wired with `mealId: uuid`" — the function
takes no such argument (`cookable.mjs:841`: `{ title, text, ingredients, macros, coach }`),
and neither does `bsCookableFromRecipe`. The wrapper sets it. *Corrected in §5.3.*

**0.3 — The dispatcher would have cooked the wrong dish.** `bsCookable(source)`
(`cookable.mjs:863-869`) routes anything without a `macros` object to `bsCookableFromMeal`
(`cookable.mjs:776`), which resolves a **step-less** source by exact title against the
catalog and adopts the catalog's method and ingredients — its own comment: *"the catalog base
still serves step-less meals"*. A member's ingredients-only "Greek yogurt power bowl" would
walk the catalog's method under the member's title, silently. Every shipped caller names a
specific adapter, never the dispatcher (`iosAppBroadsheetClient.jsx:5890,7947,7958,8727`);
the spec now requires the same. *Corrected in §5.3; test 11 in §9.*

**0.4 — The prep-session picker cannot see a member recipe, and would substitute a catalog
one.** `BSPrepSession`'s candidate list resolves library `kind: 'recipe'` pointers by exact
catalog title (`iosAppBroadsheetClient.jsx:7953-7961` — *"exact catalog match only"*): a
member recipe with its own title is dropped, so it can never join a prep session; one whose
title matches a catalog title resolves to the **catalog** recipe. The draft listed
`BSPrepSession` as untouched. The board and the orchestration stay untouched; the picker
learns `myrecipe:` pointers. *Corrected in §11, §13; test 12 in §9.*

**0.5 — A title collision would have credited the member's dish to a named nutritionist.**
Three surfaces derive `recipeId` from `cookable.recipeTitle`
(`iosAppBroadsheetClient.jsx:6755,7104,8189`), and `bsCookableFromRecipe` sets
`recipeTitle: title`. A member recipe titled like a catalog recipe would emit that slug into
the live-progress push, the share card and the prep ledger — where *"Kitchen Card attribution
is true for both sources"* (`:7098-7099`) resolves it to the catalog recipe and, through
`bsRecipeAttribution`, to its author. The wrapper sets `recipeTitle: null`. *Corrected in
§5.3, §7.3; test 13 in §9.*

**0.6 — The "logged" screen would show a 46-pixel zero.** Refuted at the write, real at the
display. §6.2's rule (no total until every row carries macros) creates a cookable with
`macros.kcal === null` that a member actually **cooks** — a state no shipped cookable reaches,
because every catalog recipe and plan meal carries kcal. The write is honest: `logIt`
(`iosAppBroadsheetClient.jsx:6826-6836`) omits the log entirely when `kcal == null` — *"never
posted as fabricated 0s"*. The confirmation that follows is not: it mounts
`<BSMealLogged kcal={m.kcal ?? 0}>` (`:7103`), and that component prints `{kcal}` as a 46px
teal figure (`:5638`) — the member sees **0** under a logged stamp while nothing was written.
One honest state is owed at the plated stage, which dents §1's *"needs no changes"*: the
walkthrough needs none; the plated stage needs one state it has never had to show.
*Corrected in §1, §6.3, §11; test 14 in §9.*

**0.7 — The no-AI paste path was hand-waved.** §4.1 claimed paste "works today with zero AI"
without saying how one textarea becomes ingredients **and** a method. It does not, without a
rule. *Corrected in §4.1.*

**0.8 — Smaller corrections.** The header declared *"Migrations: NONE"* while §4.2 owed a
bucket migration — fixed at the header. §8 said "both" routes for one route. §9 test 7 named
a `serialReason` field that does not exist — the orchestrator's field is `reason`
(`cookOrchestrator.mjs:518-521`). `bsCookableFromText` omits `allergenNotes` (undefined, not
the `null` §7.3 claimed); every consumer coalesces with `|| []`
(`iosAppBroadsheetClient.jsx:7183,8011`), so it is harmless, and the wrapper sets `null` for
shape uniformity anyway. And the draft said `draftedByAI` "drives the on-screen label"
without saying where — the cookable carries no such field, so it is the detail screen and
the library card, never cook mode's `From the plan` marker (`:7436`), which names a coach's
plan.

**What the pass did not find:** anything wrong with §7.1. The binding constraint, the
hand-curated overlay and the four guard tests read exactly as the draft describes them.

---

## 0b. Second review — the implementation-readiness survey, 2026-09-10

Six parallel readers mapped the write lane, the library render path, the test harness, the
cookable contract, i18n, and every surface a `myrecipe:` pointer reaches; a completeness
critic then checked what they missed and which gate a naive PR 1 would actually trip.
**153 findings, 78 hazards, 13 gaps, 6 contradictions, 9 build-breakers, and 10 corrections
to THIS document.** Each correction is applied in the section it names.

⚠ **0b.1 — §3.2's STATED REASON WAS FALSE, AND IT CONTRADICTED THIS DOCUMENT'S OWN §5.3.**
The claim was *"there is no path from a string to a window"*. There is:
`bsCookableFromRecipe` applies a caller-supplied parallel `stepMeta` overlay **onto
plain-string steps** (`cookable.mjs:745-746`), and that is precisely how the catalog's
hand-curated windows attach (`shapeKitchenData.js:1169`). §5.3 already said as much
(*"honours structured steps and a `stepMeta` overlay"*) — the two sections disagreed inside
one document, and the §0 pass did not catch it. **The invariant is not structural at the
adapter; it is held by the wrapper deleting the key.** And `stepMeta: []` is **not**
equivalent to an absent key: `Array.isArray([])` is true, so an empty array becomes the
overlay. *Corrected in §3.2, §5.3, §7.1.*

⚠ **0b.2 — §9's TEST 6 GUARDED THE WRONG THING, AND ITS SMALLEST FIXTURE PASSES ON BROKEN
CODE.** Two compounding errors. It asserted on structured **steps** when the real leak is
the **overlay** (0b.1) — and `finishCookable:714-722` drops a **terminal** passive
non-`'off'` window to plain meta, so the obvious two-step fixture with the window on step 1
goes green even if the wrapper deletes nothing. The fixture must carry a `stepMeta` key with
the window on a **non-terminal** step. *Corrected in §9.*

⚠ **0b.3 — "THE CATALOGUE" WAS AMBIGUOUS, AND THE WRONG READING IS A PRODUCTION CRASH.**
It is **`BSClientLibrary`**, settled by `warroom.ts:1237` (the #1628 redesign, verbatim), not
`BSRecipeBox`. The distinction is not cosmetic: appending a member recipe to `BSRecipeBox`'s
`recipes` prop throws on first render — `iosAppBroadsheetClient.jsx:6574` reads
`{r.kcal} kcal · {r.macros.p}P / {r.macros.c}C / {r.macros.f}F · {r.time}` **unguarded** and
the §3.2 document carries no `macros` key. `BSKitchenCard` **is**
null-safe there, so a card-level render test misses it, and nothing in CI would catch it.
*Corrected in §3.1.*

⚠ **0b.4 — TWO FALSE-PROVENANCE STRINGS GREET A MEMBER'S OWN RECIPE.** `BSLibraryDetail:1801`
renders *"Saved {kind} from your coach. Open it on its source page to start, swap, or log."*
as its **default** body, and the Catalogue's empty state at `:1903` reads *"Save your
coaches' workouts, meals, recipes…"*. Both are untrue of a recipe the member typed
themselves; both sit in the i18n UNCOVERED baseline, so correcting either moves the ratchet.
*Corrected in §3.1; budgeted in §13.*

⚠ **0b.5 — THE i18n RATCHET IS THE REAL BUDGET, AND TWO PLACES ARE INVISIBLE TO IT.** Five
gates fire on UI copy (`i18n-surface-inventory` equality + baseline-direction assertions,
`i18n-default-resolution` byte-identical defaults, `i18n-catalog-complete` ×13 locales). The
**cheap** path is a fully-keyed NEW component — it moves only two `>=` floors. The expensive
one is touching a baseline string inside an UNCOVERED component (0b.4). ⚠ And the ratchet's
file scan is a **non-recursive `readdirSync` over `broadsheet/*.jsx`**, so a subdirectory, a
`.mjs`, or anything under `services/` ships English to 13 locales with the suite fully green.
*Recorded in §9 and §13.*

⚠ **0b.6 — THE GDPR EXPORT WAS MAPPED BY NOBODY. ⚠ AND HALF OF WHAT THE SURVEY SAID ABOUT
IT WAS WRONG — CORRECTED HERE RATHER THAN CARRIED.** The survey reported that the
`SENSITIVE_KEYS` scrub *"matches none of §3.2's fields"* as though that were a defect. **It is
not.** That scrub is for tokens and secrets — its own comment says so — and a GDPR export is
the member receiving **their own** data: their recipe notes belong in it, unscrubbed.
Scrubbing member content out of a member's own export would be the actual defect. And
`photoPath` follows the route's own stated pattern (*"Media files … are referenced by path;
the file itself is delivered on request"*). **There is no privacy problem here.**

What survives is narrow and real, and it is **not recipe-specific**: the export is a flat
table→key map (`export/route.ts:15-30`), so `user_goals` gets **one** key —
`health_screening_and_goals` — and **~22 distinct kinds land under it**: grocery lists,
dashboard layout, voice preferences, coach notes, week reviews, ticker settings, home cards.
Exactly **one** (`health_profile`) is health screening. The label has been wrong for twenty
other kinds since long before this feature. *§10.6 — a rename, in its own PR, not PR 1's
business.* Deletion is already covered (`delete/route.ts:34`).

⚠ **0b.7 — THERE IS NO ROW DELETE FOR THIS KIND, BY DESIGN.** `user_goals` carries no
user-facing DELETE policy (the only one is kind-scoped and GUC-gated, for `cycle_settings`).
So *"delete my recipe"* is an upsert with the key removed, and *"delete them all"* is an
upsert of `{v:1, items:{}}` — never a row delete. The table also has **no check constraint on
`kind`** and no allow-list anywhere, which is the evidence behind §3's "no migration".
*Corrected in §3.3.*

⚠ **0b.8 — CI HAS FOUR JOBS, NOT THREE.** `Tests (unit + mount)` is its own job, installs
**both** `node_modules` trees, and is the **only** one that executes a React component — so
PR 1's render assertions run there and nowhere else. And the `mobile` job's name still says
*"public/m sync"* although `public/m` is gitignored (`.gitignore:26`, zero tracked files) and
no sync check exists; `ci.yml`'s own header says the name is kept so branch protection keeps
matching. The auto-loaded `AGENTS.md` convention to `cp -r mobile-app/dist public/m` produces
nothing committable. *Corrected in §13.*

⚠ **0b.9 — THE STORE NEEDS A SYNCHRONOUS LOCAL MIRROR, AND THAT PULLS IN A THREE-FILE EDIT.**
⚠ **The survey justified the mirror by the test harness; that is the weaker reason and it does
not survive §13's resplit** (PR 1 ships no UI, so there is no mount test to satisfy). The
durable reason is **offline parity with `client_library`**: a member who typed a recipe must
be able to read it on a plane, and a cloud-only kind cannot. The mirror is part of the store's
design, so it lands in PR 1 with its `localScrub` entries — the privacy obligation attaches
the moment the mirror exists, not when a screen reads it.

The harness measurement still binds **PR 2**: `drive(BSClientLibrary)` renders **today** under
`tests/helpers/broadsheet-mount.mjs` — but only a **synchronous** seed is visible; an
effect-only load renders nothing and the test passes **vacuously**. A localStorage mirror
means adding the key to **three** `localScrub` inventories (`public/newdesign/localScrub.mjs`,
`pageShell.jsx`, `public/supabase.js`) or `tests/local-scrub-sync.test.mjs` goes red in both
directions — and a member's private recipes left on a shared device after sign-out is exactly
the harm that inventory exists to prevent. ⚠ Mobile is **not** one of the three edit sites:
`mobile-app/src/services/localScrub.mjs` is a re-export shim, and the suite asserts that.
*Recorded in §3.3 and §13.*

⚠ **0b.10 — THE POINTER ARRAY HAS ZERO TEST COVERAGE TODAY.** `bsLibWrite`, `bsLibToggle`,
`useBSLibrary` and `BS_LIB_KINDS` return **no hits** across `tests/`. There is no guard to
extend and no regression net: every assertion about pointer behaviour is new code PR 1
writes. *Recorded in §9.*

**Two smaller corrections.** §0.3 says the step-less catalog resolution is by *"exact
title"* — `bsCookableFromMeal` matches on **`bsCookSlug`** (`cookable.mjs:784-789`), which
lowercases and collapses every non-alphanumeric run, so punctuation and case collide too;
the prep picker (`:7956`) is the narrower trim+lowercase form. A collision test written for
one proves nothing about the other. And §9's test 1 expected `fromPlan: true` from the
stored-document path, which is unreachable — `bsCookableFromRecipe` hardcodes
`fromPlan: false` (`cookable.mjs:755`).

**What survived.** §7.1's binding constraint, again — nothing in the survey dented it. But
0b.1 moves **where** it is enforced, which makes the wrapper's `delete stepMeta` load-bearing
rather than belt-and-braces.

⚠ **TWO OF THE SURVEY'S CITATIONS WERE CHECKED AND ONE WAS OFF BY A LINE** — the unguarded
macros read is `:6574`, not `:6573`. ⚠ **And the check that found it nearly produced a false
refutation of its own:** the Catalogue's empty-state copy at `:1903` is **raw JSX text**
(`<>Nothing saved yet. Save your coaches&rsquo; workouts…</>`), not a quoted literal, so a
scan for `'…'` reports the line as containing only *"No matches"* and *"None in here yet."*
and the finding reads as invented. It is real. *A string that is not a literal is invisible to
a literal scan* — which is also worth knowing before trusting any grep-based count of UI copy
in this file.

⚠ **AND A MEASUREMENT NOTE FOR ANYONE RUNNING A HARNESS HERE.** This container has **4
CPUs**, so a workflow's concurrency cap is **2**. Six readers do not run six-wide; they run
two at a time. Fan-out width buys independence and coverage, never wall-clock.

---

## 1. Problem

Shape can cook the ~100 recipes compiled into the app. It cannot cook the recipe on the
back of a packet, in a member's grandmother's handwriting, or on the website they were
reading this morning. The ask: let a member bring a recipe in, have its ingredients broken
down, and walk it in the cooking tutorial that already exists.

**The walkthrough needs no changes; the plated stage owes one honest state (§6.3).** That is
the central finding of this spec, and it determines the shape of the work: everything below
is upstream of `BSCookMode`, and the one thing inside it is a new branch, not a changed one.

### 1.1 What already exists, verified

| Thing | Where | State |
|---|---|---|
| The normalizer every cook surface consumes | `mobile-app/src/services/cookable.mjs` | shipped, 869 lines, tested |
| **A text adapter with zero production callers** | `cookable.mjs:841` `bsCookableFromText` | **shipped + tested, unused** |
| Quantity parse / scale / merge | `services/mealPrep.mjs:27,55,70` | shipped |
| Real food-database macros | `services/foodSearch.mjs` + `/api/nutrition/food-search` | shipped |
| Private attachment upload | `/api/nutrition/meal-note/route.ts:28-59` (`meal-notes` bucket) | shipped |
| Server-side model access | `src/lib/ai.ts` — `callAI`, `parseModelJson` | shipped |
| A member-owned pointer index | `client_library` via `bsLibToggle` (`iosAppBroadsheetClient.jsx:1671`) | shipped |
| Recipe catalog | `shapeKitchenData.js:968` `SHAPE_KITCHEN_RECIPES` | **code-resident, 100 recipes** |

`bsCookableFromText`'s own header comment names this exact use:

```js
// cookable.mjs:840 — Generic text adapter — the seam future creation surfaces
// (coach_plans single dishes, AI-created recipes) call with whatever they honestly have.
```

It is exercised only by `tests/cookable.test.mjs:201-205`. **The seam was built and never
connected.** This feature connects it — for the raw paste (§4.1). ⚠ It is **not** the adapter
for the stored document: that carries reviewed `steps[]` in the catalog's own grammar and takes
a thin wrapper over `bsCookableFromRecipe` (§5.3, §0.1).

### 1.2 The catalog is code, which is why storage is a real question

`SHAPE_KITCHEN_RECIPES` is a static import (35 authored + 50 USDA + 15 USDA2). There is no
`recipes` table — `recipe_reviews` keys off a `recipe_slug` string
(`src/app/api/recipes/reviews/route.ts:29`), it does not join anything. A member recipe
therefore cannot be "added to the catalog"; it needs its own store (§3).

---

## 2. The honesty ladder decides what a messy upload becomes

`cookable.mjs:16` defines four tiers, and `finishCookable` (`cookable.mjs:707-727`) assigns
one structurally — steps present → STEPS or PROSE; ingredients only → MISE; neither →
QUICK.

| Tier | What was extracted | What the member gets |
|---|---|---|
| 1 STEPS | discrete steps | the full walkthrough |
| 2 PROSE | one method blob, split | the walkthrough, labelled **FROM THE PLAN** |
| 3 MISE | ingredients, no method | the mise board + timers, no steps |
| 4 QUICK | title only | quick-log mode |

⚠ **This ladder is the reason the feature is safe to ship without guaranteeing parse
quality.** A bad import degrades to tier 3 and says so. It does not invent a method. Nothing
in the build should add a "best effort" step-generation path that defeats this — the tier is
the honest report of what the ingest actually got.

**`fromPlan` marks a split the app made on the member's behalf, and it applies to the DRAFT.**
`bsCookableFromText` sets `fromPlan: !!prose` (`cookable.mjs:853`), so the paste draft the
review screen shows is tier 2 — a split the member has not yet approved. Once confirmed and
stored as `steps[]`, the cookable is tier 1: the member is the author of record for the split
they approved. The provenance that survives is `draftedByAI` (§5.4), shown on the detail screen
and the library card — **not** cook mode's `From the plan` marker
(`iosAppBroadsheetClient.jsx:7436`), which names a coach's plan and would mislabel a member's
own recipe.

### 2.1 `bsSplitMethodProse`, exactly

`cookable.mjs:136`. Numbered or lettered markers (`1.` `2)` `a.`) win and are carried
**wholesale** — no length floor, because dropping an authored step silently omits a real
instruction. Absent markers, it splits on sentence boundaries, drops fragments ≤ 12
characters, and keeps only segments matching `COOK_VERBS`. It returns `null` when fewer than
2 parts or fewer than 2 instructional parts survive.

That `null` is the tier-3 path, and it is correct: a blob with no cooking verbs is not a
method.

---

## 3. The store — `client_recipes`, a new `user_goals` kind

**Decision taken:** private to the member. No migration; `user_goals` is keyed
`(user_id, kind)` with an upsert on `onConflict: 'user_id,kind'`
(`shapeBackend.js:4114-4121`).

### 3.1 ⚠ Do NOT put recipe bodies in `client_library`

This is the sharpest finding of the design pass, and it would have been an easy mistake.

`client_library` holds **pointers, not bodies**. `bsRecipeLibItem`
(`iosAppBroadsheetClient.jsx:6209`) emits `{ id: 'recipe:<slug>', kind, title, meta, coach }`
— five fields, resolved back against the catalog by slug at render time.

And `bsLibWrite` (`iosAppBroadsheetClient.jsx:1668`) writes the whole array **blind**:

```js
function bsLibWrite(items) {
  try { window.localStorage && ... setItem(BS_LIB_KEY, JSON.stringify(items)); } catch (e) {}
  try { window.shapeDb?.saveUserGoals?.('client_library', items); } catch (e) {}   // no read-merge
  ...
}
```

There is no read-merge. `useBSLibrary` does a one-time union on mount
(`iosAppBroadsheetClient.jsx:1686-1694`), which is enough to protect *pointers* — a lost
pointer costs a re-save. **It is not enough to protect a recipe body**: a device that loads
with a stale local array and toggles anything would overwrite the cloud copy, and the
member's typed-in recipe is gone with nothing to re-derive it from.

**So: bodies live in their own kind, `client_recipes`. The library keeps holding pointers**
— `{ id: 'myrecipe:<uuid>', kind: 'recipe', title, meta, coach: null, mine: true }` — which
means the **list** renders member recipes with no change to its write path.

⚠ **"The Catalogue" is `BSClientLibrary`, NOT `BSRecipeBox`** (settled by `warroom.ts:1237`,
the #1628 redesign recorded verbatim). The distinction is a production crash, not a naming
preference: appending a member recipe to `BSRecipeBox`'s `recipes` prop — mounted with
`SHAPE_KITCHEN_RECIPES` at `iosAppBroadsheetClient.jsx:10418` — throws on first render, because
`:6574` reads `{r.kcal} kcal · {r.macros.p}P / {r.macros.c}C / {r.macros.f}F · {r.time}`
**unguarded** and the §3.2 document has no `macros` key. `BSKitchenCard` is null-safe at that field, so a card-level render test misses
it, and no CI job catches it. **A member recipe never enters `SHAPE_KITCHEN_RECIPES`.**

⚠ **And the screens AROUND the list tell a member their own recipe came from a coach.**
`BSLibraryDetail:1801` renders *"Saved {kind} from your coach. Open it on its source page to
start, swap, or log."* as its **default** body (nothing in the tree sets `item.preview`), and
the Catalogue's empty state at `:1903` reads *"Save your coaches' workouts, meals, recipes,
and grocery lists here."* Both are false for a member-authored recipe. Both are baseline
strings in an i18n-UNCOVERED component, so correcting them is a ratchet cost §13 budgets
rather than a free edit.

### 3.2 Document shape

```jsonc
// user_goals kind 'client_recipes'
{
  "v": 1,
  "items": {
    "<uuid>": {
      "id": "<uuid>",              // crypto.randomUUID(); the cookable identity (§5.3)
      "title": "Nana's lemon chicken",
      "servings": 4,               // number | null — never 0 for "unknown"
      "ingredients": [ { "n": "6 oz", "m": "chicken thigh", "k": "330 kcal" } ],
      "steps": [ "Pat the chicken dry…", "…" ],
      "sourceKind": "paste" | "photo",
      "sourceNote": "From Mum's book, p.114",   // member-typed, optional, never inferred
      "photoPath": "recipe-imports/<uid>/<ts>.jpg",  // storage path, not a URL (§4.2)
      "draftedByAI": true,         // §5.4 — drives the on-screen label; never cleared
      "createdAt": 1757462400000,
      "updatedAt": 1757462400000
    }
  }
}
```

⚠ **`ingredients` uses the catalog's `{n, m, k?}` grammar verbatim** so
`normalizeIngredients` (`cookable.mjs:109`) and `bsMergeMise` accept it with no adapter.
`k` is a **string** (`"330 kcal"`), matching `shapeKitchenData.js` — not a number.

⚠ **`steps` are plain strings, never structured `{t, min, passive, station}` objects — AND
the document must never carry a `stepMeta` key at all.** A structured step is one way a
passive window enters the system (`splitSteps`, `cookable.mjs:84`); **the parallel `stepMeta`
overlay is the other, and it attaches to plain strings** (`bsCookableFromRecipe`,
`cookable.mjs:745-746` — which is exactly how the catalog's curated windows attach,
`shapeKitchenData.js:1169`).

⚠ **So this is NOT structural at the adapter, and an earlier draft of this spec claimed it
was** (0b.1). The invariant is held at exactly one place: **`bsCookableFromMemberRecipe`
deletes `stepMeta` before calling through** (§5.3). Writing plain strings is necessary and
not sufficient. ⚠ **`stepMeta: []` is not equivalent to an absent key** — `Array.isArray([])`
is true, so an empty array *becomes* the overlay; the wrapper must `delete`, never
`= []`.

### 3.3 The write lane

`client_recipes` is a whole-document upsert, so it takes the same discipline
`client_settings` already has (WORKLOG 2026-09-01, `bsSettingsWriteSerial`).

⚠ **Copy the two SAFE precedents by name, because the file's dominant idiom is the unsafe
one.** Twelve mobile writers blind-overwrite the whole document, and two of the three
read-merge writers (`bsSaveIdentity:165`, `bsLoadFoodRecents:2041`) collapse a null read with
`|| {}` and clobber. The models are **`bsOnlineRailPersist`**
(`iosAppBroadsheetClient.jsx:23191-23210` — which also inspects `res.error`) and
**`useCoachDoc`** (`public/newdesign/dashData.jsx:664-706`). The two nearest-looking
newdesign copies, `dashWeek.jsx:83-118` and `coachClientDetail.jsx:385-403`, are two fixes
behind — do not copy those.

⚠ **`saveUserGoals` RESOLVES `{error}` rather than throwing** (`shapeBackend.js:4114-4121`),
so a bare `await` inside a `try` can never see a failed write. Inspect the return value.

⚠ **And there is no row DELETE for this kind** (0b.7): `user_goals` carries no user-facing
delete policy, so *"delete my recipe"* is an upsert with the key removed and *"delete them
all"* is an upsert of `{v:1, items:{}}`. The table also has **no check constraint on `kind`**
and no allow-list anywhere (`supabase-migrations/2026-04-20-user-goals.sql`) — which is the
evidence behind §3's "no schema migration", and the answer to a reviewer asking where the
kind is registered: nowhere, by design.

The discipline:

1. **Serial lane.** Concurrent saves read-merge-write through one promise chain; two saves
   racing must not lose the first.
2. **Bound to the initiating account.** `saveUserGoals` resolves the user at *save* time
   (`shapeBackend.js:4116`), so an account switch mid-flight writes A's document into B's
   row. Capture the uid before the read, compare before the write, discard on mismatch.
   This is the cross-account class the WORKLOG records four separate payments for.
3. **A read that cannot be trusted declines the write.** `getUserGoals` returns `null` for
   every can't-know case (no backend · not signed in · query error) and `{}` for a genuinely
   absent row (`shapeBackend.js:4106-4113`). `null` must never be treated as "no recipes yet"
   and merged into — that publishes an empty library over a full one.

---

## 4. Ingest — two surfaces in v1

**Decision taken:** paste/type and photo. URL fetch is deferred (§10.3).

Both land on one internal function. The surfaces differ only in how they obtain text.

### 4.1 Paste / type

A plain two-field sheet: title, and one textarea for the whole recipe. No AI required — this
path works with `bsSplitMethodProse` and the quantity parser alone, and it is the honest
floor of the feature. It is also the fallback whenever `hasOpenAIKey()` is false or the
parse route fails; the member can always fix a bad extraction by editing text.

**How one textarea becomes ingredients AND a method with no model** (§0.7 — the draft had
not said):

1. A section heading wins. A line matching `/^(ingredients|method|directions|instructions|steps)\b/i`
   splits the paste: the block under the ingredients heading is the list, the rest is the
   method.
2. Otherwise, per line: it is an ingredient when `bsQtyParse` (`mealPrep.mjs:27`) succeeds on
   it, **or** it is short (≤ 6 words) and matches nothing in `COOK_VERBS`
   (`cookable.mjs:134`). `"2 cloves garlic"` and `"salt to taste"` are ingredients; `"Serve
   warm."` is method. Consecutive ingredient lines form the list; everything else joins the
   method blob.
3. The method blob goes to `bsSplitMethodProse`. Its `null` is tier 3.

The member sees the split on the review screen and moves lines between the two lists — a
heuristic that guesses wrong is corrected there, never persisted silently. A pure function
(`bsSplitPaste`) so §9 can drive it.

### 4.2 Photo

FormData upload of a `File`, exactly as `meal-note` does
(`src/app/api/nutrition/meal-note/route.ts:62-70`). Server-side, the file goes to a private
bucket via the service-role admin client and never becomes a public URL.

⚠ **Use a NEW bucket, `recipe-imports`, not `meal-notes`.** `meal-notes` is scoped to
coach-delivered meal notes and its objects are handed out as **year-long signed URLs**
(`SIGNED_URL_TTL = 60 * 60 * 24 * 365`, `meal-note/route.ts:22`) so a coach can open them.
A recipe photo has no coach recipient in this design and should not inherit a year-long
public link. Store the **path** in the document (§3.2) and mint a short-lived signed URL on
demand when the member views it.

The bucket needs its own idempotent migration file following
`supabase-migrations/2026-06-03-meal-notes-bucket.sql`. ⚠ **This is the one migration this
feature needs, and it is a storage bucket, not a schema change** — the header block's
"Migrations: NONE" refers to table schema. Per house convention the raw GitHub link is
posted on creation and the owner runs it.

---

## 5. The parse layer

**Decision taken:** AI drafting allowed, labelled and member-reviewed before save.

### 5.1 Route: `POST /api/nutrition/recipe-parse`

Lives under `/api/nutrition` (the membership proxy gate) but does its **own** auth, because
the proxy deliberately fails open on faults — the pattern stated at
`food-search/route.ts:4-8`:

```ts
const denied = await requireMembership(request);
if (denied) return denied;
const user = await currentUser(request);
if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
```

Accepts FormData: `text` (string, capped) **or** `photo` (File). Returns

```jsonc
{ "draft": { "title": "…", "servings": 4|null, "ingredients": [...], "steps": [...] },
  "confidence": { "ingredients": "high"|"low", "steps": "high"|"low" } }
```

or `{ "draft": null, "unavailable": true }` when `hasOpenAIKey()` is false. ⚠ **Never an
empty draft on failure** — `{ingredients: [], steps: []}` is the positive claim *"this
recipe has no ingredients"*, and the member-review screen would render it as a finding
rather than a failure. `null` + `unavailable` is the honest shape, and it is the same
distinction `/api/nutrition/food-search` already draws.

### 5.2 The model call

Through `callAI` (`src/lib/ai.ts:86`) — the one place holding the key, the model default,
the timeout and structured logging. Model comes from `aiModel()`; do not pin one in the
route.

**Every field goes through `parseModelJson`** (`src/lib/ai.ts:279` — note the name; it is
NOT `parseAIJson`) and then a hand-written validator that drops anything not matching the
`{n, m, k?}` / string-step grammar. The helper's own docstring is the rule: *"Model output
that becomes DATA must go through this (or a stricter validator) — never write raw model
text straight to the record."*

The prompt must state three things the extraction may not do:
- **Do not invent quantities.** An ingredient with no stated amount gets `n: ""` — which
  `normalizeIngredients` accepts and `bsMergeMise` renders as a bare name row.
- **Do not invent steps, merge them, or reword them into a house voice.** Carry the source's
  own sentences. This is what makes the tier honest.
- **Do not emit `min`, `passive`, or `station` on any step.** §7.

### 5.3 Building the cookable — one new adapter, and never the dispatcher

Two adapters exist and neither fits the stored document alone:

- `bsCookableFromText` (`cookable.mjs:841`) takes a text **blob** and splits it. Right for the
  raw paste → draft (§4.1). Wrong for the stored document, whose `steps[]` the member has
  already reviewed — it would join and re-split them (§0.1).
- `bsCookableFromRecipe` (`cookable.mjs:732`) takes the **recipe** shape — which §3.2 is. But
  it sets `recipeTitle: title` (§0.5), honours structured steps and a `stepMeta` overlay
  (§7.1), and sets no `mealId` (§0.2).

**So the stored document goes through a new `bsCookableFromMemberRecipe(doc)` in
`cookable.mjs`** — a thin wrapper, tested in `tests/cookable.test.mjs`, that:

1. copies `doc` with `steps` coerced to plain strings (an object step keeps only its `t`) and
   `stepMeta` **deleted with `delete`, never set to `[]`** — ⚠ this line is the **only** place
   the §7.1 invariant is enforced (0b.1: the overlay attaches to plain strings, so writing
   strings is necessary and not sufficient), and `Array.isArray([])` is true, so an empty
   array would *become* the overlay;
2. calls `bsCookableFromRecipe` on that copy;
3. overrides on the result: `mealId: doc.id` · `sourceKind: 'member'` · `recipeTitle: null` ·
   `coach: null` · `allergenNotes: null`.

Why each override:

- **`mealId: doc.id`** — `bsCookKey` (`cookable.mjs:45-54`) checks it first, so resume state is
  per-recipe and survives a rename. Without it a non-Latin title slugs to `''` and every such
  recipe shares one hash bucket; two same-titled recipes share one resume slot.
- **`sourceKind: 'member'`** — never `'meal'`: `sourceKind === 'meal'` is what stamps a log
  *"As planned · From {coach}'s plan"* (`iosAppBroadsheetClient.jsx:7096-7104`). `'member'` is
  a new value; that strict equality is its only consumer, so it is safe, and it lets a later
  surface tell a member recipe from a catalog one.
- **`recipeTitle: null`** — §0.5. Three surfaces slug it into a `recipeId` the Kitchen Card
  resolves against the catalog.
- **`coach: null`** and **`allergenNotes: null`** — §7.3; the doc carries neither, but explicit
  beats implicit, and `null` keeps the shape uniform with the catalog path.

⚠ **Never through `bsCookable(source)`.** The dispatcher (`cookable.mjs:863-869`) routes a
source without a `macros` object to `bsCookableFromMeal`, which resolves a step-less source
against the catalog and adopts the catalog's method — §0.3. Every shipped caller names its
adapter; this one does too.

⚠ **And that resolution is by SLUG, not by exact title** (`cookable.mjs:784-789`, via
`bsCookSlug`, which lowercases and collapses every non-alphanumeric run) — so *"Greek Yogurt
Power-Bowl!"* collides with *"Greek yogurt power bowl"*. The prep-session picker (`:7956`) is
a **different, narrower** match (trim + `toLowerCase` only) and does not. A collision test
written against one proves nothing about the other; §9 tests both.

### 5.4 The review screen, and why the label is permanent

Nothing saves until the member has seen the draft in an editable form: title, servings,
ingredient rows (quantity + name, each removable), step list. Save writes `client_recipes`
and a `client_library` pointer.

⚠ **`draftedByAI` is set on any AI-assisted import and is never cleared, including after the
member edits every field.** The temptation is to clear it once "the member has taken
ownership" — refuse it. The flag's job is to let a later reader (a coach, a support case, a
future feature that wants to trust these numbers) know the *provenance* of the macros, and
provenance does not change because someone corrected a typo. It is one boolean; the cost of
keeping it is nothing and the cost of a fabricated-macro question with no way to answer it
is real.

---

## 6. Ingredient breakdown — two different jobs

The request "ingredients are broken down" is two engines, and conflating them is how the
build goes wrong.

### 6.1 Job A — quantities, scaling, merging (no network, shipped)

`services/mealPrep.mjs`. `bsQtyParse` (`:27`) matches a leading integer or simple fraction
plus an optional unit token; `bsScaleQty` (`:55`) does servings arithmetic; `bsMergeMise`
(`:70`) sums same-name **same-unit** lines across dishes and keeps clashing units on
separate rows.

⚠ **All three are deliberately narrow and must stay that way for imports.** The header says
it: *"We only do arithmetic on quantities we can parse EXACTLY … anything else stays a
verbatim string on its own line. Honest > clever."* `"a pinch"` survives as `"a pinch"`;
`"200 g"` + `"1 cup"` print as two rows rather than a fabricated conversion. An imported
recipe gets exactly this treatment and needs no new code.

### 6.2 Job B — macros per ingredient (network, shipped, opt-in)

`/api/nutrition/food-search` → `searchFoodsServer`, hybrid USDA FoodData Central + Open Food
Facts, returning `per100g` and gram servings (`services/foodSearch.mjs:10-13`). This is what
turns `"6 oz chicken thigh"` into the `k: "330 kcal"` field the catalog carries.

⚠ **The mapping is a guess and must be member-confirmed, one row at a time.** "chicken
thigh" matches many FDC rows at different fat contents. The design: on the review screen each
ingredient row offers **"find macros"**, which opens the existing food-search picker; the
member picks the row that matches. Unmapped ingredients keep `k` absent.

⚠ **A recipe with partial macro coverage must not display a total.** Summing the mapped rows
and presenting it as the recipe's kcal is the fabrication class this codebase names
repeatedly — `foodSearch.mjs:13` already refuses it at the row level (*"A row that cannot
state a real kcal is dropped — never a fabricated 0"*). Show per-row figures where they
exist and no total until every row carries one; below that, the honest string is the count
("macros on 4 of 9 ingredients").

⚠ **`/api/nutrition/food-search` requires auth and burns provider quota.** It 401s before any
provider fetch precisely so a limiter fault cannot fan out. Never call it in a loop over
every ingredient on import — it is user-initiated, per row.

### 6.3 The plated stage with no kcal — one honest state, owed

§6.2 creates a cookable with `macros.kcal === null` that a member actually cooks. No shipped
cookable reaches the plated stage in that state — every catalog recipe and plan meal carries
kcal — so cook mode has never had to display it. What it does today (§0.6): the **write** is
honest (`logIt` omits the log, `iosAppBroadsheetClient.jsx:6826-6836`); the **confirmation**
is not (`<BSMealLogged kcal={m.kcal ?? 0}>`, `:7103`, printing **0** at 46px, `:5638`).

The state: when `cookable.macros.kcal == null`, the plated stage offers **Done** in place of
**Log it**, with one line — *"No macros on this recipe yet, so nothing was added to your day.
Add them from the recipe to log it next time."* — and never mounts `BSMealLogged`. `onLogged`
is not fired, because nothing was logged. This is the one change inside `BSCookMode` this spec
asks for, and it is a new branch on a condition no existing cookable meets.

---

## 7. What an imported recipe may never claim

### 7.1 No passive windows, therefore no interleaving

The engine requires `passive === true` **and** a station in `BS_STATIONS`
(`cookable.mjs:22`) **and** `min ≥ BS_ORCH.minPassive`
(4). `sanitizeMeta` (`cookable.mjs:68-76`) enforces each independently.

Where do the catalog's windows come from? **A hand-curated overlay, `_KITCHEN_STEP_META`
(`shapeKitchenData.js:1011`), merged onto recipes at import time (`:1167-1170`)** — and its
entries are dense with human judgement that no parse could reproduce:

```js
// shapeKitchenData.usda2.js:552-559
// step 0's 45-minute rice runs in the BACKGROUND of the sauce — the recipe says 50 minutes
// total, which is only true if they overlap. A hold blocks its own recipe (`freeAt`) and
// occupies the one modelled stove, so annotating it made the board read 79 minutes and
// stopped a two-dish session interleaving AT ALL.
```

Four guard tests enforce the annotation quality (`tests/shape-kitchen-data.test.mjs`):
overlay keys must name real recipes (`:101`); a window's `min` must be **stated in the step's
own text** (`:167`); no annotated window may be followed by an authored concurrent same-recipe
step (`:205`); an **attended** step is never annotated hands-off (`:233`). An import bypasses
all four by construction.

**So an imported recipe hosts nothing.** It contributes to a prep session as a serial dish,
and the board already models and explains this: `BS_SERIAL_REASON.NO_WINDOW`
(`cookOrchestrator.mjs:33`) exists so *"unavailable" with no explanation reads as a broken
feature*. The UI work is zero; the copy work is one sentence.

⚠ **This is not a gap to close later by getting better at parsing.** Roughly 53 of the 100
catalog recipes can host a window even with a human annotating them, and a two-dish pair
interleaves about half the time (WORKLOG 2026-09-03). The feature's value is the
walkthrough, the mise and the timers — not the interleave.

### 7.2 The honest alternative, if the owner wants it later

There is one path to a window that does **not** fabricate: **the member marks it.** A step
carrying a parsed timer (`bsStepTimers`, `cookable.mjs:215`) could offer *"is this
hands-off?"* with a station picker, during or before the cook. That is a human annotating
their own recipe — structurally identical to what `_KITCHEN_STEP_META` is, just authored by
the cook instead of the house.

**Registered, not designed here** (§10.2). It needs its own thinking about the four
invariants the guard tests protect — in particular the terminal-window rule that
`finishCookable` (`cookable.mjs:714-722`) enforces structurally, where a final passive
window on a non-`'off'` station drops to a plain step because *the board's wrap treats
leftover holds as unattended make-aheads*.

### 7.3 No allergen notes, no attribution it did not earn

`allergenNotes` reaches cook mode through an **explicit allowlist** in
`bsCookableFromRecipe` (`cookable.mjs:758-764`), and the notes themselves are hand-written
safety copy — `GF_OATS` and siblings (`shapeKitchenData.js:1176`), certification-first, with
brand lists deliberately empty where a certified product could not be confirmed.

An imported recipe carries `allergenNotes: null` and renders the no-notes path. It must never
inherit notes from a catalog recipe it happens to share a title with.

Attribution likewise: `bsRecipeAttribution` (`shapeKitchenData.js:1001`) is *"the single
place that decides how an unattributed recipe is credited"*. A member recipe passes
`coach: null` — the member's own `sourceNote` is a free-text provenance line shown on the
detail screen, not a byline, and not a credit the app asserts.

⚠ **And `recipeTitle` must be null** (§0.5, §5.3). Three surfaces slug it into a `recipeId`
the Kitchen Card resolves against the catalog (`iosAppBroadsheetClient.jsx:6755,7104,8189`),
so a title collision would credit the member's dish to the catalog recipe's author.

---

## 8. Routes

| Route | Method | Notes |
|---|---|---|
| `/api/nutrition/recipe-parse` | POST | §5.1. FormData `text` \| `photo`. Own auth. |

One new route. It must be registered in `RAW_ROUTES` (`src/lib/warroom.ts:190`) — the
War Room is the go-live board and an unregistered route is invisible to it. `groupOf`
(`warroom.ts:354`) will file `/api/nutrition/*` under its existing group; no new group
needed.

No route is needed for storage: `user_goals` is read and written client-side through
`window.shapeDb`, as every other `client_*` kind is.

---

## 9. Tests

House pattern: **drive the shipped functions, never pin their spelling.** The WORKLOG records
this lesson four times in one wave — a guard that matches source text fails on a correct
rewrite and passes on a broken one.

**`tests/recipe-import.test.mjs`** (new):

1. **The PASTE path** (`bsCookableFromText`): numbered steps → every step carried,
   `fromPlan: true`. ⚠ Name the adapter — this is unreachable through the stored document,
   because `bsCookableFromRecipe` hardcodes `fromPlan: false` (`cookable.mjs:755`) and that
   field is the only thing separating tier 1 from tier 2 (`finishCookable:724`).
2. A paste with a marketing lead and no markers → the lead does **not** become a step
   (`bsSplitMethodProse`'s instructional filter).
3. Ingredients only → tier 3 MISE, `steps: []`.
4. Title only → tier 4 QUICK.
5. **Every step of an imported cookable has `passive: false`, `station: null`, `min: null`** —
   the §7 invariant, asserted structurally over the emitted `stepMeta`.
6. **A stored document carrying a `stepMeta` OVERLAY still emits plain meta** — the mutation
   that matters, and the one an earlier draft of this spec got wrong (0b.2). ⚠ **The fixture
   must put the window on a NON-TERMINAL step** (or use station `'off'`): `finishCookable`
   (`cookable.mjs:714-722`) drops a *terminal* passive non-`'off'` window to plain meta by
   itself, so the obvious two-step fixture with the window on step 1 goes green **even if the
   wrapper deletes nothing**. Assert the overlay case AND the structured-step case; the
   overlay is the real leak, because it attaches to plain strings.
7. `bsOrchestrate` over one catalog recipe with windows + one imported recipe returns a plan
   in which **no detour is hosted inside the import**, and a two-import session returns
   `reason: BS_SERIAL_REASON.NO_WINDOW` — the field is `reason`
   (`cookOrchestrator.mjs:518-521`), not `serialReason` as the draft had it.
8. `bsCookKey` on two same-titled member recipes returns **different** keys (§5.3), and on a
   non-Latin title returns the uuid branch rather than `cook:h…`.
9. The store: a `null` read declines the write; a uid change between read and write discards
   it; two concurrent saves both survive.
10. Macro totals are absent while any ingredient lacks `k` (§6.2).
11. `bsCookableFromMemberRecipe` on a doc titled **identically to a catalog recipe**, with no
    steps, yields tier 3 with the **doc's** ingredients — never the catalog's method (§0.3).
    Pinned against the real dispatcher: the same doc through `bsCookable(doc)` is shown to
    adopt the catalog's steps, so the test documents why the dispatcher is forbidden rather
    than asserting it from memory.
12. The prep-session candidate builder (extracted as a pure function and driven) includes a
    `myrecipe:` pointer resolved from `client_recipes`, and does **not** resolve a
    title-colliding member recipe to the catalog (§0.4).
13. For a member recipe titled like a catalog recipe: `recipeTitle` is null, the derived
    `recipeId` is `''`, and `sourceKind !== 'meal'` (§0.5, §5.3).
14. A headless render of the plated stage with `kcal == null` shows the no-macros state and
    never mounts `BSMealLogged` (§6.3).
15. `bsSplitPaste` (§4.1): a heading-led paste, a heading-less paste with quantity lines, and
    a paste that is method only — each lands the right lines on the right side.
16. **A member recipe never enters `SHAPE_KITCHEN_RECIPES`** (0b.3), and `BSRecipeBox` is
    driven with a `macros`-less row to pin that `:6574` would throw — the assertion documents
    why the boundary exists rather than trusting a comment.
17. **The two collision widths are distinct** (§5.3): a title differing only in punctuation
    or case collides through `bsCookSlug` and does **not** through the prep picker's
    trim+lowercase. One fixture, two expectations.
18. **The store**: a `null` read declines the write; `{}` is merged into (a real, empty
    document); a uid change between read and write discards; `saveUserGoals` resolving
    `{error}` is surfaced, not swallowed.

⚠ **THE POINTER ARRAY HAS NO EXISTING COVERAGE** (0b.10) — `bsLibWrite`, `bsLibToggle`,
`useBSLibrary` and `BS_LIB_KINDS` return zero hits across `tests/`. There is no guard to
extend; all of it is new code. ⚠ **PR 1 writes that net against the array's EXISTING
behaviour** (§13), so PR 2 extends a tested array rather than an untested one.

⚠ **WHICH PR OWNS WHICH TEST** (§13's resplit): **PR 1** owns test 18 and the pointer-array
net — everything provable without a screen. **PR 2** owns 1–8 and 11–17, every one of which
needs either an adapter the store does not call or a surface PR 1 does not ship.

⚠ **AND THE MOUNT HARNESS ONLY SEES A SYNCHRONOUS SEED** (0b.9). `drive(BSClientLibrary)`
renders today, but an effect-only load renders nothing and the test **passes vacuously** —
which is why PR 1 needs the local mirror, and why that mirror needs its `localScrub` entries.

**Mutation-test every new guard.** The house rule, paid for repeatedly: *a guard that reports
a pass is a broken instrument until the mutation is proven to have landed.* Verify the edit
actually applied before trusting the run — three of four survivors in a recent wave were
no-op mutations of the author's own making.

---

## 10. Owner questions — each with a stated default; none blocks the build

**10.1 May a member's imported recipe be sent to their coach?**
Default: **no** in v1. The storage decision was "private to the member", and a coach-visible
import puts third-party method text on a coach's screen (§10.4). The nearer-term want is
probably narrower — *"I cooked this, here are the macros"* — which the **existing meal-note
path already does** without moving the recipe.

**10.2 Should a member be able to mark a step hands-off, unlocking interleaving?**
Default: **not in v1.** §7.2 is the honest design if you want it. It is a genuine feature,
not a workaround, and it deserves its own spec.

**10.3 URL import.**
Deferred by decision. When it comes back it needs: SSRF hardening (deny private ranges and
redirects into them), a timeout and size cap, a User-Agent that identifies Shape, and a
ruling on §10.4. Note that most recipe sites publish schema.org `Recipe` JSON-LD, which
makes the *parse* nearly free — the cost is entirely in fetching and in policy.

**10.4 Copyright scope.**
In US law an ingredient **list** is generally not protectable; the **written method** and
headnotes generally are. This design stores a copy privately for the member who brought it,
which is the low-exposure end. It becomes a real question the moment a recipe is shared
between members, published, or shown to a coach — i.e. §10.1 and any future share feature.
⚠ **This is a legal question with a business answer, not an engineering one**, and it should
be settled before the share path is built rather than after.

**10.6 The GDPR export label — RESOLVED 2026-09-10: rename it, in its own PR, and do not
block this feature on it.** (0b.6.) ⚠ **This was registered as a recipe decision and it is
not one.** The export maps each table to one key, so **~22 `user_goals` kinds** already share
`health_screening_and_goals` — grocery lists, dashboard layout, voice preferences, coach
notes, week reviews — of which exactly one is health screening. Splitting `client_recipes` out
would fix the label for recipes, leave it wrong for twenty other kinds, and add a special
case. **Renaming the key** (each row already carries its own `kind`, so the data is
intelligible once the heading stops over-claiming) is a one-line change to the `OWNED` array,
costs nothing to defer — exports are generated fresh, so there is no stored artifact to
migrate — and belongs to no PR in this feature. ⚠ **And the scrub is not part of it**: see
0b.6, where the survey's claim is refuted rather than repeated.

⚠ **10.7 RETIRED, NOT ANSWERED.** It asked whether PR 1 should accept a test-only render half
or add a dev seed. **Both are ways of living with a half-wired PR**, and §13's resplit removes
the half: PR 1 ships **no UI at all**, so there is no dead render path to caveat and no
on-device pass to owe.

**10.5 Does an imported recipe belong in the grocery builder and the meal plan?**
Default: **yes to grocery** (it is `bsMergeMise` output like anything else, and the aisle
classifier works on ingredient names), **no to the coach's meal plan** — a nutritionist's
plan is their prescription, and a member inserting their own dish into it changes what the
plan claims.

---

## 11. Out of scope

- Any change to `BSCookMode`'s walkthrough phases, to `BSPrepSession`'s board or wait gate,
  to `cookOrchestrator.mjs`, or to `_KITCHEN_STEP_META`. Two named, additive exceptions are
  **in** scope: the plated stage's no-kcal state (§6.3) and the prep picker's `myrecipe:`
  resolution (§0.4).
- Editing a **catalog** recipe. Members import their own; the catalog stays code-resident.
- Recipe photos as *food* photography (the frontispiece follow-up, WORKLOG "PR E
  FOLLOW-UPS"). §4.2's photo is the **source document**, not a plated shot.
- Nutrition-label OCR. Different problem, different validator.
- Renaming the GDPR export key (§10.6). ⚠ **Out of scope because it is not this feature's
  defect** — ~22 `user_goals` kinds already share that label and exactly one is health
  screening. The data rides out correctly today, unscrubbed and complete, which is what a
  portability export owes; only the section heading over-claims. Its own one-line PR.
- The website. `public/newdesign/recipes.jsx` carries a content-parity copy of the catalog
  (`recipe-web-mobile-parity.test.mjs` enforces it); member recipes are mobile-only in v1 and
  **must not** be added to that parity check.

---

## 12. ⚠ NOT VERIFIED — read before building the photo path

**This repo has never sent an image to a model.** `grep -rn "input_image\|image_url" src/
--include=*.ts` returns **nothing**. `src/lib/ai.ts` targets the OpenAI **Responses API**
(`/v1/responses`, `ai.ts:16`) and its existing callers are all text; `DEFAULT_MODEL` is
`gpt-5.4-mini` and prod pins `OPENAI_MODEL`.

Consequences for the build, all of which are step 1 of the photo PR:

1. **Confirm the pinned production model accepts image input**, and what it costs. The route
   must degrade to `{ draft: null, unavailable: true }` rather than erroring if it does not.
2. **Confirm the exact Responses-API content-block shape** `callAI` needs for an image. Do
   not infer it from the Chat Completions shape — `ai.ts:12-15` explicitly warns against
   treating the two as interchangeable.
3. **Measure a real photo end to end** before writing any confidence heuristic. A cookbook
   page at an angle in kitchen light is the actual input, not a flat scan.

Also unverified: every latency and cost figure in this document (there are none, deliberately),
and whether `client_library`'s one-time union merge behaves well once pointer volume grows —
it is fine at today's sizes and was not stress-tested.

---

## 13. Build order

Four PRs, each independently mergeable, each green before the next. The house gate: CI green
on the final head and not a draft, `/code-review` before pushing, and an explicit
`@codex review` on the PR (WORKLOG, owner 2026-09-10).

⚠ **CI HAS FOUR JOBS, NOT THE THREE THE AUTO-LOADED CONVENTIONS NAME** (0b.8): `web`,
**`Tests (unit + mount)`**, `mobile`, `secrets`. The tests job installs **both**
`node_modules` trees and is the **only** one that executes a React component — so every
render assertion in §9 runs there and nowhere else. ⚠ And the `mobile` job's name still says
*"public/m sync"* although `public/m` is gitignored with zero tracked files and no sync check
exists; copying a build into it produces nothing committable.

⚠ **What a PR-1 `git commit` actually costs**, measured: `mobile-app/src/*` sets
`mobile_changed` + `code_changed`, so the hook runs a babel parse-check of every staged JS
file, the **full `VITE_BASE=/m/ npm run build`**, and the **whole suite** (2858 tests, ~50s at
the time of writing). **`tsc` does NOT run** — nothing under `src/*.ts` is staged — so a
reader assuming typecheck covers this change is wrong. A missing root `node_modules` is a hard
**fail**, not a warning.

⚠ **RESPLIT 2026-09-10 — PR 1 SHEDS ITS UI.** The first draft gave PR 1 a store **and** a
render path with **no writer**: half a UI, dead in production until PR 2, unverifiable on
device, and paying an i18n bill for copy nothing could reach. §10.7 asked how to live with
that; the better answer is not to have it. **Either ship no UI, or ship UI that works.**

**PR 1 — the store, and nothing a member can see.** The `client_recipes` kind, its own serial
write lane, uid binding, null-read decline, `res.error` inspected, and the **synchronous local
mirror** with its **three `localScrub` inventory edits** (0b.9 — justified by offline parity
with `client_library`, not by a test harness). No pointer, no Catalogue change, no detail
screen, **no new user-visible strings**. Tests 18 of §9, plus the store's own vectors.

⚠ **And it carries one thing that is not about member recipes at all: the FIRST tests for the
pointer array.** `bsLibWrite` / `bsLibToggle` / `useBSLibrary` / `BS_LIB_KINDS` have **zero**
coverage today (0b.10), so PR 2 would otherwise build the pointer on an untested array. Pin
the **existing** behaviour here — the blind whole-array write, the mount-time union, the
`kind` switch — as a regression net PR 2 can then extend.

**What the resplit buys, and it is the reason to prefer it over a dev seed:** nothing
user-visible ships that does not work; **zero i18n cost in PR 1** (the ratchet budget moves to
the PR that has to pay it regardless); the risky part is genuinely retired, because
persistence is fully testable without a screen; and there is no on-device `manual` pass to
owe, because there is nothing to look at.

**PR 2 — the feature, end to end.** The library pointer and its `BSClientLibrary` row (0b.3),
the detail screen and the **two false-provenance strings** (0b.4), the paste sheet with the
structural split (§4.1), the review screen, `bsCookableFromMemberRecipe` (§5.3), the prep
picker's `myrecipe:` resolution (§0.4) and the plated stage's no-kcal state (§6.3). **This is
the PR where the feature becomes real, and it needs no AI and no new route.** Tests 1–8 and
11–17 of §9.

⚠ **It is the bigger PR, deliberately, and it is COHERENT rather than merely large** — one
reviewable story (*a member brings a recipe in and sees it*) instead of two halves that only
work together. ⚠ **Its i18n budget is the whole feature's**: a **fully-keyed new component** is
the cheap path, editing a baseline string in an UNCOVERED component is the expensive one
(0b.5), and new UI copy must stay out of a `broadsheet/` subdirectory, out of `.mjs` and out of
`services/` — the ratchet's scan is non-recursive and top-level-only, so English would
otherwise ship to 13 locales with the suite green.

**PR 3 — macros.** Per-row food-search mapping on the review screen, partial-coverage
display rule. Test 10.

**PR 4 — photo.** The `recipe-imports` bucket migration, the FormData path, `recipe-parse`
with vision — **gated on §12 step 1 passing.** If the pinned model cannot read images, this
PR stops at the bucket and the upload, and the extraction waits.

⚠ **PR 2 is shippable alone and PRs 3–4 are genuinely optional.** If the photo path stalls
on §12, a member can still bring in any recipe by pasting it, and that is the feature working
— not a degraded version of it.
