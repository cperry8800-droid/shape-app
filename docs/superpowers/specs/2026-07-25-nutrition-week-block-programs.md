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
`phaseStartISO`. The Eat tab's existing `BSCoachAdjustBanner` (rendered at
`iosAppBroadsheetClient.jsx:8968` from `detail.nutrition`) gains a line:
*"Week 2 of 4 · Build routine."* The **menu** continues to come from a separate
Diet / Meal-plan assignment.

- ✅ Uses storage and a render surface that already exist — no migration.
- ✅ Delivers exactly what the coach authored, and no food they didn't write.
- ✅ Composes: a real menu and a phase arc can be live at once.
- ❌ The program and the menu become two assignments. Arguably correct — they are
  two different products — but it is a workflow change worth naming.

**B is only viable with all five of the following.** Each is a real blocker found
in review, not an implementation detail — B written without them either persists
data the client never sees, or fails to fix the bug at all.

0. **A phase-only assignment must NOT write a `client_meal_plans` row.**
   Week-block detection has to *bypass* the existing `isNutri` /
   `bsAssignMeal` materialization entirely — not run alongside it. Writing the
   phases while still installing the seven-day menu would leave the fabricated
   meals ("Reset & habits", "Build routine") exactly where they are, which is the
   entire defect this spec exists to remove. And because the assign route
   **archives every published row before inserting**, a phase-only assignment
   must not call it at all: a client's real, separately-assigned menu has to
   survive untouched.

1. **Write through `set_program_detail(p_client_id, 'nutrition', p_phase,
   p_detail)`, never `merge_program_detail({ nutrition: … })`.** The latter merges
   TOP-LEVEL keys, so it replaces the whole nutrition object and silently wipes
   the calorie/macro targets Adjust set. `set_program_detail` is SECURITY
   DEFINER, discipline-scoped, and gated on
   `is_discipline_coach_on_client(client, 'nutritionist')` — the correct
   primitive. The build must also state whether the **`nutrition_phase` scalar
   column** is set from the current week's phase or deliberately left alone;
   leaving that unsaid lets two readers observe conflicting phase state.
2. **The banner will not render a phase-only write.** `BSCoachAdjustBanner`
   returns `null` unless `detail.nutrition.updatedAt` exists
   (`iosAppBroadsheetClient.jsx:1355`). For any client whose nutritionist has
   never used Adjust, the assignment would persist and be **invisible**. The build
   must stamp its own assignment timestamp or give the phase line its own
   visibility condition — it must not borrow the macro-adjustment timestamp's
   meaning.
3. **Web parity — DECIDED: both surfaces, in the same wave.** The gated website
   Eat surface (`public/newdesign/dashNutri.jsx`) reads `/api/client/plan`, and
   that route reduces `detail.nutrition` to numeric `coachTargets`
   (`route.ts:174`) — phases are not exposed.

   The coach assigning a program cannot know which surface their client uses, so
   a mobile-only scope means the same assignment is delivered to one member and
   silently absent for another. That is the same honest-data failure this spec is
   written to remove, so shipping mobile-only is not treated as an option here.
   **Acceptance:** `/api/client/plan` returns the phase arc alongside
   `coachTargets`; `dashNutri.jsx` renders the current week's phase line; and a
   client with an assigned arc sees the *same* week and phase on web and mobile
   on the same day. (Owner may still overrule and scope to mobile — question 4.)
4. **A stated start date.** "Which week are we in" derives from a real
   `phaseStartISO`, never from a `created_at` that moves under a re-assign.

### C — N sequential menus

Materialize N `client_meal_plans` rows keyed by `week_start`, and select by the
current week.

- ✅ A genuine multi-week menu capability.
- ❌ **The WRITER contract has to change too, not just the read.** `POST
  /api/nutritionist/meal-plan` archives *every* `status='published'` row for the
  (nutritionist, client) pair before inserting, so materializing N rows would
  archive each earlier week as the next one lands. This option requires a
  status/retention redesign (which rows stay published, how a future week is
  distinguished from a stale one), a migration, and read/write back-compat for
  plans already in flight — before it is even comparable to A or B.
- ❌ Changes the read contract for **every** client — the highest-risk option here.
- ❌ **Solves the wrong problem:** a week-block outline contains no meals, so this
  installs N *empty* menus. It would only pay off for a builder that emits
  per-week menus, which this one does not.

## Recommendation

**B, on both surfaces, with A's guard as the floor.** Deliver the arc on the rail
that already exists and already renders; if an outline yields neither meals nor
phases, block rather than install phantom food.

Concretely, B is build-ready only as: **skip the meal-plan write entirely** (0),
**write via `set_program_detail`** (1), **carry its own visibility timestamp**
(2), **reach mobile AND web** (3), and **date the arc from a stated
`phaseStartISO`** (4). Any of those dropped and the build either fails to remove
the fabricated menu or ships a phase line nobody sees.

## Open questions for the owner

1. **Is "program = arc, menu = separate assignment" the right model?** B assumes
   yes. If a nutrition program is meant to carry its own menus, that is option C
   plus a builder change, and a much larger build.
2. **What happens when the arc ends?** Silently stop showing the phase line, or
   surface "program complete" to the coach?
3. **Should the trailing non-week block ("Grocery + prep guide") show anywhere,**
   or be dropped as it is on the training side?
4. **Overrule the web decision?** Precondition 3 commits to delivering phases on
   web *and* mobile, because the coach cannot know which surface their client
   uses. Scoping to mobile is cheaper and would ship sooner — but it means the
   same assignment is visible to one member and silently absent for another. Say
   the word if you want mobile-only anyway; it is the one precondition that is a
   product call rather than a correctness one.
