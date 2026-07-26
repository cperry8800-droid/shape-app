# Nutrition week-block programs — design

**Status:** DRAFT — needs an owner decision before build.
**Related:** #1832 (the training half: a week label is a phase, not an exercise).

## The bug today

The nutritionist's `program` build type emits a week-phase outline:

```
Week 1 — Reset & habits
Week 2 — Build routine
Week 3 — Dial macros
Week 4 — Lock it in
Grocery + prep guide
```

`BSProAssignPage`'s `isNutri` branch maps every block through `bsAssignMeal`, which
keeps the tail as a meal title and defaults the slot to `MEAL`. So assigning this
program installs a **7-day menu in which every day carries four meals named
"Reset & habits", "Build routine", "Dial macros", "Lock it in"** — plus one called
"Grocery + prep guide".

That is fabricated food on the client's Eat tab. #1832 fixed the training half of
this class; this is the nutrition half, and it was deliberately left out because
the fix is not symmetrical (below).

## Why the training fix doesn't transfer

Training delivered a week block as **one session per stated week** because
`client_workouts` is a row-per-dated-session table — N weeks is just N rows.

Nutrition has no such shape:

- **`client_meal_plans` holds ONE WEEK.** `payload.days` is a 7-entry, day-of-week
  menu.
- **Exactly one is live per (nutritionist, client).** `POST /api/nutritionist/meal-plan`
  archives *every* `status='published'` row for that pair, then inserts one.
- **The client reads one.** `/api/client/plan` selects `status='published'`,
  `order created_at desc`, `limit 1`. `week_start` is stored but is **not** used to
  select, so a second published row would simply hide the first.

So a four-week program cannot be expressed as a menu. It is not an
under-specified menu — it is a different thing: a **coaching arc**, stating what to
focus on each week, containing no meals at all.

## ⚠ The hazard any fix must respect

`merge_program_detail(p_client_id, p_patch)` merges **top-level keys** of the
`detail` JSONB. Patching `{ nutrition: {...} }` therefore **replaces the whole
nutrition object** — silently wiping the calorie/macro targets the coach set on
the Adjust page (`{ calories, protein, carbs, fat, meals, refeed, restrictions,
note, updatedAt }`).

Any option that writes phases into `detail.nutrition` must merge *within* the
section, not over it.

## Options

### A — Refuse, honestly

Detect a week-block nutrition outline at Assign and block: *"This program
describes weeks, not meals — assign a Diet or Meal plan for the menu."*

- ✅ Zero fabrication; tiny change; no storage work.
- ❌ Leaves a first-class builder output with **no delivery path at all**. The
  coach authors a program the app then refuses to deliver.

### B — Phases ride the nutrition rail *(recommended)*

Assign writes the arc to `client_programs.detail.nutrition.phases` +
`phaseStartISO`, **merging within** the nutrition section so Adjust's targets
survive. The Eat tab's existing `BSCoachAdjustBanner` (already rendered at
`iosAppBroadsheetClient.jsx:8968` from `detail.nutrition`) gains a line:
*"Week 2 of 4 · Build routine."* The **menu** continues to come from a separate
Diet / Meal-plan assignment.

- ✅ Uses storage and a render surface that already exist — no migration.
- ✅ Delivers exactly what the coach authored, and no food they didn't write.
- ✅ Composes: a real menu and a phase arc can be live at once.
- ❌ Needs the nested-merge fix, and a start date to derive "which week".
- ❌ The program and the menu become two assignments. Arguably correct — they are
  two different products — but it is a workflow change worth naming.

### C — Four sequential menus

Materialize N `client_meal_plans` rows keyed by `week_start`, and change the
client read to select by the current week.

- ✅ A genuine multi-week menu capability.
- ❌ Changes the read contract for **every** client — the highest-risk option here.
- ❌ **Solves the wrong problem:** a week-block outline contains no meals, so this
  installs four *empty* menus. It would only pay off for a builder that emits
  per-week menus, which this one does not.

## Recommendation

**B, with A's guard as the floor.** Deliver the arc on the rail that already
exists and already renders; if an outline yields neither meals nor phases, block
rather than install phantom food.

## Open questions for the owner

1. **Is "program = arc, menu = separate assignment" the right model?** B assumes
   yes. If a nutrition program is meant to carry its own menus, that is option C
   plus a builder change, and a much larger build.
2. **What happens when the arc ends?** Silently stop showing the phase line, or
   surface "program complete" to the coach?
3. **Should the trailing non-week block ("Grocery + prep guide") show anywhere,**
   or be dropped as it is on the training side?
