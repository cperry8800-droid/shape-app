# The per-day menu contract — what C1a writes, and who reads it

**Status:** contract, build-ready. Unblocks **C1a** in the nutrition week-block
spec (`2026-07-25-nutrition-week-block-programs.md`).

⚠ **Cross-references in this document are deliberately NAMED, not linked.** Both
the parent spec and the entitlement-layer spec are *created by* PR #1834 and are
not on `main` yet, so a relative link from here resolves to nothing for anyone
who reads this before that lands. Convert both to links in the change that
merges them.

C1a is "the builder can author a different menu each DAY." It has been blocked
not because it depends on anything unbuilt, but because **the shape it would
write is read by a paid commerce surface**, and the two obvious ways to write it
break that surface in opposite directions. This document defines the shape, the
fallback, and the one normalizer both readers call — which is exactly what the
parent spec says a track needs before it can be called ready.

---

## 1 — The bug being fixed

`iosAppBroadsheetPros.jsx`, `BSProAssignPage.apply()`, the nutrition branch:

```js
const days = Array.from({ length: 7 }, (_, i) => ({
  dow: i, title: plan.name, tag: 'PLAN', coachLine: planNote, targets, meals,
}));
```

`meals` is **one array**, referenced by all seven days. A client on an assigned
meal plan eats the identical five meals every day of the week. Stack C2's weekly
rows on top and you get four weeks of the same five meals.

## 2 — Where the problem actually is (and where it is not)

**The delivery shape is already correct.** `client_meal_plans.payload.days` is
an array of `{ dow, title, tag, coachLine, targets, meals }`, and
`/api/nutritionist/meal-plan` stores `days` wholesale without reshaping it
(`payload: { days }`). Seven days with seven *different* `meals` arrays is
already a legal, storable, readable value. Nothing in the table, the route, or
the client read needs to change.

**The problem is entirely in the authoring shape.** `coach_plans.detail.blocks`
is a flat array of text lines with no notion of a day, so Assign has no per-day
material to distribute — it can only repeat what it has.

That narrows C1a considerably: **no migration, no route change, and no change to
how a client reads their menu.** It is an authoring-shape change plus the readers
of that shape.

## 3 — Every reader of `coach_plans.detail.blocks`

Verified against the tree at `5bebd73b`. This list is why the naive fixes fail;
it is also the acceptance surface.

| # | Reader | Location | What it does with `blocks` |
|---|---|---|---|
| 1 | `BSCoachDraftEditor` | `iosAppBroadsheetPros.jsx` | **Writes** them. Flat list of `{ text, steps?, video? }`. |
| 2 | `BSProAssignPage.apply()` | `iosAppBroadsheetPros.jsx` | Parses each via `bsAssignMeal` → the shared `meals` array. **The thing C1a changes.** |
| 3 | `bsPlanPreview` | `services/planPreview.mjs` | **The buyer-facing marketplace preview of a PAID plan.** Parses via `bsAssignMeal`, shows `BS_PREVIEW_FREE_UNITS`, reports the rest `locked`. |
| 4 | `startBlockWeeks` | `iosAppBroadsheetClient.jsx` | Reads day/week LINES only, to decide whether to show the weeks stepper. |
| 5 | `bsMaterializeOutline` | `services/planOutline.mjs` | Start-this-plan → `client_workouts`. **Training only** — returns workout payloads. |

⚠ **A purchased meal plan has no self-start path.** `iosAppBroadsheetClient.jsx`
gates it explicitly:

```js
const canStart = !!(item.owned && item.kind === 'plan'
  && item.planKind !== 'meal_plan' && item.planId != null && …);
```

So readers 4 and 5 are training-only in practice, and **the only route from a
nutrition `detail.blocks` to a client's Eat tab is a coach pressing Assign.**
That is a real product gap in its own right — a client can buy a meal plan and
then only *read* it — and it is registered in §8, but it is deliberately **not**
in C1a's scope: adding a nutrition start path is a new delivery surface, and
this contract is about the shape.

## 4 — Why the two obvious fixes fail

**Nest the days** — `detail.days = [{ dow, blocks: [...] }, …]`, drop `blocks`:

`bsPlanPreview` does `Array.isArray(detail.blocks) ? … : []`, and an empty
`texts` returns the `empty` model with `kind: null`. **Every already-published
paid meal plan's preview renders nothing** the moment that reader ships, and
every new per-day plan previews as nothing. Silent, total, and on the surface
where the purchase decision is made.

**Flatten with day prefixes** — `blocks = ["Mon — Breakfast · Oats · 500 kcal", …]`:

The preview's nutrition branch is reached (its weekday-split test is gated on
`!isNutri`), so all 35 lines parse through `bsAssignMeal`. That helper takes the
text *before* the dash as the slot source, so `"Mon"` matches none of
breakfast/lunch/dinner/snack and every meal comes back labelled **`MEAL`** with
`"Breakfast · Oats · 500 kcal"` as its title. The buyer sees 35 undifferentiated
rows, 2 free and 33 locked, with no indication the plan has seven distinct days —
which is the entire thing they are being asked to pay for.

**The pattern:** both fixes treat the preview as a detail. It is the surface the
purchase decision is made on, so it constrains the shape rather than following it.

## 5 — The contract

### 5.1 Stored shape — additive, never replacing

`coach_plans.detail` gains an **optional** `days` key. `blocks` **stays exactly
as it is** and remains the authority when `days` is absent.

```jsonc
{
  "blocks": [ /* unchanged — the week's default menu */ ],
  "note":   "…",
  "days": [                        // OPTIONAL. Present ⇒ per-day plan.
    { "dow": 0, "blocks": [ /* same block shape as detail.blocks */ ] },
    { "dow": 1, "blocks": [ … ] }
    // 1..7 entries; a dow with no entry inherits detail.blocks (§5.2)
  ]
}
```

Rules that make this safe:

- **`dow` is 0 = MONDAY**, matching `BS_ASSIGN_DOW` and `bsRepeatSpec` — *not*
  the reminders table's `0 = Sunday`. The parent spec fixed this class once
  already (`2026-07-20-cycle-coach-today.sql`); it is restated here because this
  is a new writer of a dow.
- **A day's `blocks` use the identical block shape** as `detail.blocks` (bare
  string or `{ text, steps?, … }`), so `blockText`, `bsAssignMeal` and
  `bsAuthorStep` apply unchanged. No second grammar.
- **No migration.** `detail` is already `jsonb`; a legacy row simply has no
  `days` key.

### 5.2 The legacy fallback, stated once

> A plan with no `days` key behaves **byte-identically to today**: all seven days
> receive `detail.blocks`. A plan whose `days` omits a given `dow` receives
> `detail.blocks` for that day.

So `detail.blocks` is never dead — it is the **default menu**, and `days` is the
per-day override. Every already-published plan keeps working with no backfill,
and a coach who authors three distinct days gets those three plus four default
days rather than four empty ones.

### 5.3 The ONE normalizer

Both readers call the same function. It lives in `planOutline.mjs` beside the
grammar it uses — the module that exists to stop exactly this drift.

```js
// planOutline.mjs
//
// The single source of truth for "what does this plan serve on each day?".
// Assign delivers from it and the Listing preview renders from it, so a preview
// can never describe a week the delivery does not build.
export function bsPlanWeek(detail) // → { perDay: boolean, days: [{ dow, blocks }] }
```

- Returns **seven entries, always**, `dow` 0..6 ascending.
- `perDay` is `true` only when `detail.days` contributed at least one day whose
  blocks differ from the default. A `days` array that is present but says the
  same thing everywhere is not a per-day plan and must not be sold as one.
**Bounds and malformed input — one canonical policy, stated exactly.** `detail`
comes off a **public-read provider row**, so every rule below is a rule about
attacker-shaped data, not a tidiness preference. Assign and the preview share
this policy because they share the function; a second policy in either would
reproduce the preview/delivery split this contract exists to close.

| Input | Policy | Why |
| --- | --- | --- |
| `days` scan | first **7** entries only | a week has seven days; more is either a mistake or an attack |
| blocks per day | first **40** (`= planPreview`'s `BLOCK_SCAN`) | the preview has always capped at 40, so this makes delivery agree instead of silently exceeding what the buyer saw |
| block text | bounded by the existing `clean()` (2000-char slice, control chars stripped, 120-char title) | unchanged — the per-day path reuses it rather than adding a second limit |
| invalid / out-of-range `dow` | **DROPPED**, never clamped | clamping would move a coach's Thursday menu onto Sunday; dropping falls back to that day's default, which is the honest degrade |
| non-integer `dow` (`"1"`, `1.5`, `true`) | dropped | a value indistinguishable from a typo is not a day the coach chose, and this is the write path for PAID content |
| duplicate `dow` | **first authored entry wins** | deterministic, and matches `bsWeekUnits`'s existing dedupe posture |
| entry with no `blocks` array | inherits the default | an unfilled day is not an emptied day |
| `blocks: []` (authored empty) | **stays empty** | clearing Sunday is a real choice and must survive; this is the one case where empty ≠ inherit |
| `days` not an array / junk entries | skipped, never thrown | a crafted row must not be able to break a coach's assign |

`BSProAssignPage.apply()` then becomes, in place of the shared-array line:

```js
const week = bsPlanWeek(plan.detail);
const days = week.days.map(({ dow, blocks }) => ({
  dow, title: plan.name, tag: 'PLAN', coachLine: planNote, targets,
  meals: mealsFrom(blocks),          // the existing rawBlocks→bsAssignMeal→steps map
}));
```

— the `meals` derivation is unchanged; only its input becomes per-day.

### 5.4 What the paid preview shows

This is a **product decision on a commerce surface**, so it is stated here rather
than left to the implementer.

`planPreview.mjs` already draws a line between structure and content:

> *a split is the plan's table of contents — its day lines are structure … so the
> whole split shows. An exercise list or a menu IS the product, so it shows
> `BS_PREVIEW_FREE_UNITS` units and reports the remainder as locked.*

A per-day menu is **both**. It therefore previews as:

- **the seven day labels — free.** They are the table of contents, and they are
  the differentiator the buyer is paying for. Withholding them hides the
  product's value from the person deciding whether to buy it.
- **the meals — paid**, on the existing allowance: `BS_PREVIEW_FREE_UNITS` shown,
  the remainder counted in `locked`. The free units come from the **first day
  that has any**, so the sample is a real day rather than an interleaving of
  seven.
- `kind: 'menu'` is retained with a new `perDay: true` flag rather than a new
  kind, so any consumer which only understands `menu` keeps rendering something
  correct.

**The exact payload**, since a renderer cannot be written against prose and a
wrong `locked` count on a paid surface is a money bug:

```jsonc
{
  "kind": "menu",           // null when the whole week has no parseable meal
  "perDay": true,           // ABSENT on a non-per-day menu — see below
  "days": [                 // exactly 7, dow order. FREE: structure, counts only
    { "label": "MON", "count": 2 },
    { "label": "TUE", "count": 1 }
    // … through SUN. `count` includes meals a day INHERITS from the default.
  ],
  "weeks": null,
  "sessionsPerWeek": null,
  "units": [ /* the WHOLE week's meal units, existing {label,title,kcal} shape */ ],
  "free":  [ /* units.slice(0, BS_PREVIEW_FREE_UNITS) */ ],
  "locked": 6,              // units.length - free.length. NEVER minus the constant.
  "note": "…",
  "media": []
}
```

Four things that shape pins down. The first three are each a bug that was
actually shipped and caught in review, so they are stated as rules rather than
description:

- **`units` is the WHOLE week**, exactly as it is for every other kind. The
  sheet renders `units.length` as the product's meal count, so sampling it made
  a three-meal plan display "Meals 2". Only `free` is sampled.
- **`free` is ONE real day** — the first day that has any meals — not an
  interleaving of seven. A sample has to be something the member would actually
  eat on a Tuesday.
- **`locked = units.length - free.length`, never `total - BS_PREVIEW_FREE_UNITS`.**
  `free` is capped by the sampled day's own size, so when that day is light (one
  Monday breakfast, fuller days after) the constant leaves meals counted in
  **neither** the free rows nor the locked total — paid content invisible on
  both sides of the paywall. The invariant to test is
  `free.length + locked === units.length`.
- **`days` carries counts only.** A locked meal's text never enters the model at
  all, so it cannot leak through a renderer that displays more than it should.

⚠ **The sheet must actually RENDER `days`.** Returning it is not delivering it:
the only consumer (`BSPlanPreviewSheet`) maps `p.free` and nothing else, so a
model carrying the structure while the sheet ignored it showed a per-day listing
as a sample day plus a locked count — indistinguishable from a single-day menu,
which is the exact comparison the buyer is being asked to pay for.

**A non-per-day menu keeps today's model exactly** — no `perDay` key, no `days`
key, same `units`/`free`/`locked`. Consumers branch on `perDay` being present,
and the acceptance test in §7.1 asserts the absence of both fields rather than
just their values.

A non-per-day menu previews exactly as it does today. **This is the acceptance
test that matters most: an existing published meal plan's preview must be
unchanged, field for field.**

## 6 — Authoring (the editor half)

`BSCoachDraftEditor` currently edits one flat list. Per-day authoring is a
**day selector above the existing list** — the block list, its step authoring
(PR E), and the publish path are otherwise untouched:

- A **DEFAULT** tab (edits `detail.blocks`) plus **MON…SUN** tabs.
- A day tab with no authored blocks shows the DEFAULT menu greyed and labelled
  as inherited, with one action to start from it — making §5.2's inheritance
  visible rather than something a coach discovers by assigning.
- Publishing writes `days` **only for days actually authored**, so a coach who
  never opens a day tab publishes a plan byte-identical to today's.

⚠ **A day tab edits the entry whose `dow` MATCHES — never `detail.days[dow]`.**
`days` is a **sparse** array of `{ dow, blocks }`, so array position is not the
weekday: for `[{dow:0},{dow:2},{dow:4}]`, `days[1]` is *Wednesday's* entry, and
an editor that indexed by position would silently overwrite Wednesday's menu
when the coach edited Tuesday. Find by `dow`, create a new entry carrying that
`dow` when none exists, and canonicalize (sort by `dow`, drop duplicates) on
publish. The normalizer already reads it this way — §5.3 keys a Map on
`entry.dow` — so an index-based editor would be the only thing in the system
that disagreed, which is exactly how a menu ends up on the wrong day.

## 7 — Acceptance

1. A plan with no `days` key: preview model **field-for-field identical** to the
   pre-change output (pin the current model in a test first, then refactor).
2. A plan with no `days` key: Assign produces seven days with the same meals —
   today's behavior, deliberately preserved.
3. A plan with `days` for Mon/Wed/Fri: Assign produces those three menus on
   dow 0/2/4 and the default menu on the other four.
4. `days` present but every day identical to the default ⇒ `perDay === false`
   and the preview is the non-per-day render.
5. A crafted `days` (200 entries, `dow: 99`, `dow: "1"`, duplicate dows, a
   40k-char block) neither throws nor moves a menu to the wrong day.
6. `dow` 0 lands on **Monday** in the assigned week, verified against
   `bsAssignIso(monday)` — not off by one.
7. The Cook door still opens tier-1 on a per-day meal (PR E `steps` survive the
   per-day path).

## 8 — Registered, not in scope

- **A purchased meal plan cannot be started by its buyer** (§3). Real gap, own
  work: it needs a nutrition equivalent of `bsMaterializeOutline` writing
  `client_meal_plans`, plus the replay/entitlement question that belongs to the
  entitlement layer.
- **C1b** (the ✦ AI DRAFT) stays blocked on its own contract. A per-day menu
  makes the AI's response shape *more* demanding, not less — whatever six-mode
  contract C1b lands must return a seven-day shape satisfying §5.1.
- **C2's multi-week rows** consume this shape (a week row's menu is a
  `bsPlanWeek` result) but add the run/precedence questions that wait on E.
