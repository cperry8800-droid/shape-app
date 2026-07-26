# Nutrition week-block programs — design

**Status:** OWNER RULED **C** (multi-week menus) 2026-07-26, and every open
question is now answered — see "Owner rulings" below. C is a WAVE, not a fix;
scoping it surfaced a blocker that reorders the work, and the rulings extend it
past nutrition into **training purchases and platform entitlement**.
**Related:** #1832 (the training half: a week label is a phase, not an exercise).

## ⚠ The finding that reorders this work

C's premise is a different menu each week. **The builder cannot author a
different menu each DAY.**

`iosAppBroadsheetPros.jsx:3362` assigns the *same* `meals` array to all seven
days:

```js
const days = Array.from({ length: 7 }, (_, i) => ({ dow: i, …, meals }));
```

and the nutritionist's `meal_plan` builder emits exactly one day's list
(`['Breakfast · ~500 kcal', 'Lunch · ~600 kcal', …]`).

So a client on an assigned meal plan today **eats the identical five meals every
day of the week.** Stacking four weekly rows on top of that gives four weeks of
the same five meals — a multi-week program that is not multi-anything.

**Per-day variation is the prerequisite, and on its own it is worth more than
per-week.** A member eating a genuinely different Tuesday and Thursday is a
bigger product change than the same Tuesday recurring in weeks 1–4. C should be
sequenced behind it, not instead of it.

## Owner rulings (2026-07-26)

All six answered. These are binding; do not re-litigate them at build time.

1. **Authoring — week 1, then vary it, and the AI drafts week 1.** The coach
   authors (or accepts an AI draft of) one real 7-day week; each later week
   starts as a copy they edit. An unedited copy is a week the coach *chose* to
   repeat — never food the app invented.
2. **A purchased program carries a TERM; access ends.** A program is a
   repeatable sale, not a one-time one. `one_time_purchases` has no expiry
   today (see the finding below), so this needs a real entitlement model.
3. **The term starts on START, not on purchase.** Buying in January and
   starting in March gives the full term from March. A never-started purchase
   sits in the Library until the client begins it.
4. **After the last week, the final week persists — while entitled.** On the
   monthly coach plan the last week's menu keeps serving until the coach
   assigns the next thing. On a one-off program the term ends, the menu stops,
   and the client is offered the re-buy. The end state is entitlement-driven,
   not content-driven.
5. **On a menu conflict, the COACH chooses at assign time** — replace the
   client's standing menu, or pause it for the program's term and restore it
   after. The app never guesses about someone's food.
6. **All of this applies to TRAINING too**, not just nutrition. A purchased
   program carries a term in both disciplines; a single session booking is
   consumed by attendance, not by time.

Precondition, unchanged and unruled-on because it is a correctness rule rather
than a product call: **a plain Meal-plan assignment must keep behaving exactly
as it does now.** Most clients will never be on a program, so single-menu and
multi-week have to coexist under one reader.

## ⚠ Three findings the rulings surfaced

**① The AI is already being called — and its answer is thrown away.**
`iosAppBroadsheetPros.jsx:6052` (nutritionist) and `:5171` (trainer):

```js
if (!blankMode) { try { await window.ShapeAI?.generatePlanDraft?.({…}); } catch (e) {} }
const outline = blankMode ? mk(['', '', '']) : (buildType === 'program'
  ? mk(['Week 1 — Reset & habits', 'Week 2 — Build routine', …])   // ← hardcoded
```

Both builders await a real `/api/ai/generate-plan` call, render "Generating…"
and an **✦ AI DRAFT** eyebrow, then build the outline from a canned template
regardless. Every coach who taps ✦ AI DRAFT today gets a template, and the call
costs money to produce nothing. Ruling 1 is therefore mostly *finishing* the AI
already wired, not adding it.

**② A purchased program is recorded as a "booking."**
`src/app/api/stripe/checkout-session/route.ts:232`:

```js
kind: isSubscription ? 'subscription' : providerRole === 'nutritionist' ? 'meal_plan' : 'booking',
```

The kind is derived from the **provider's role and nothing else**, so a 12-week
training program and a single Tuesday session are the same `'booking'`,
distinguishable only by carrying a `plan_id`. Anything that expires programs but
not sessions must first make the kind real (`booking` | `program` | `meal_plan`).

**③ Training programs are already replayable forever.**
`ShapeSelfTraining.startPurchasedPlan` materializes the dated rows under a fresh
`runId` and deletes the prior run, so a client can restart week 1 indefinitely at
no further cost. Same paid-forever hole as nutrition, live today.

## The bug today

The nutritionist's `program` build type emits a week-phase outline:

```text
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
   on the same day.

   **This is the build contract: both surfaces, no ambiguity at build time.**
   The owner can still choose mobile-only — it is a product call, not a
   correctness one — but that changes the contract, so it is an **amendment
   made to this spec before the build starts**, never an assumption taken
   mid-build. Until amended, build both.
4. **A stated start date.** "Which week are we in" derives from a real
   `phaseStartISO`, never from a `created_at` that moves under a re-assign —
   and it resolves through the single definition in **"Week-time semantics"**
   below (a member-local `YYYY-MM-DD` date, Monday-based), which C2's
   `week_start` selection and E's term reuse verbatim.

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

## Recommendation (superseded by the owner's ruling — kept for the record)

The original recommendation was **B**, as the only option that ships value
against what the builder emits today. **The owner ruled C on 2026-07-26**, taking
the larger product. B is not discarded: a week's phase name is the natural title
for that week's menu, so B's arc becomes C's labelling layer rather than a
competing design.

## Week-time semantics — ONE definition, reused everywhere

Three separate things now ask "which week is it": `phaseStartISO` (precondition
4), C2's `week_start` selection, and E's term. If they answer differently, a
member sees one week on web and another on mobile around midnight, or a term
expires a day early in one timezone. Define it once:

- **`phaseStartISO` and `week_start` are DATES, not instants** — `YYYY-MM-DD`,
  no time component, no offset. An instant would make the answer depend on who
  is asking.
- **The member's own timezone owns every boundary**, resolved through the
  existing `shape_user_tz(uid)` helper with the same null fallback the cycle
  work already uses. Never the coach's clock and never the server's — that exact
  bug shipped once already and needed the `2026-07-20-cycle-coach-today.sql`
  fix (`get_client_cycle` now returns a member-local `today`). Do not re-make it.
- **Weeks start Monday**, matching `bsRepeatSpec`'s `0 = MONDAY` base used by
  the training materializer. (Note the trap: the reminders table uses
  `0 = Sunday`. They are different bases; do not cross them.)
- **Before the start date**, the program is not running — rule 2 of the
  precedence ladder applies (standing menu, or nothing).
- **After the final week**, the program is complete; what the member sees is
  entitlement-driven (ruling 4), not a wrap-around.
- **The term is measured in whole member-local days from `started_at`**, so a
  4-week term is 28 of the member's own days regardless of travel or DST.

Every reader — `/api/client/plan`, the mobile reader, and the coach view —
derives from this one definition. A surface that computes its own week is a bug.

## What C actually requires

C is a wave, and it has a hard prerequisite (see the finding at the top). Ordered
by dependency, smallest shippable first:

**C0 — Stop the fabrication.** Week-block detection must skip the
`isNutri`/`bsAssignMeal` path and write no `client_meal_plans` row. This is the
bug fix, it is independent of everything below, and it should ship first so the
phantom menu stops being installed while the rest is built.

⚠ **C0 is the pre-C2 safety behavior, not a permanent ban on writing rows.**
C2's whole point is to materialize N rows, so read the two together as one
invariant that survives the wave:

> **A week block yields a menu row only when a genuine menu was authored for
> that week. It never yields one derived from a phase name.**

Before C2 ships, no authored per-week menu can exist, so the invariant reduces
to C0's "write nothing." After C2, the same invariant permits N rows for the
weeks a coach actually filled and still forbids fabricating "Reset & habits"
into food. C0 is therefore never *reverted* by C2 — it is the degenerate case
of the rule C2 generalizes.

**C1 — Per-DAY menus (the prerequisite), and the AI draft made real.** The
builder learns to author a different day; the assign stops replicating one
`meals` array across all seven (`iosAppBroadsheetPros.jsx:3362`). Per ruling 1,
this is also where **the AI draft stops being discarded** — `generatePlanDraft`'s
returned blocks become the outline instead of the hardcoded template (finding ①),
so a coach drafts week 1 with AI and edits it. Without C1, every week in C2 is
the same five meals repeated and the wave delivers nothing a client can taste.
Largest standalone value in the whole spec.

**C2 — Multi-week storage.** N `client_meal_plans` rows coexist, selected by the
current week. Requires, all of them:

- a **retention/status model** — `status` is CHECK-constrained to
  `published|archived` with no notion of "scheduled"; a future week is currently
  indistinguishable from a stale one;
- the **writer contract** to stop archiving every published row for the pair on
  each insert (`/api/nutritionist/meal-plan`), or each new week retires the last;
- the **reader** (`/api/client/plan`, currently `published` / `created_at desc` /
  `limit 1`) to select by `week_start` against the member's local week;
- the **assign-time choice** (ruling 5) — replace the client's standing menu, or
  pause it for the term and restore it after. "Pause and restore" is what makes
  the archive-everything writer unacceptable: a paused menu must survive intact;
- a **migration** plus back-compat for plans already in flight — every existing
  client has exactly one published row and must keep working unchanged;
- the **end-of-program rule**, which is entitlement-driven (ruling 4) and
  therefore **blocked on E**;
- **row identity and reader precedence** — the load-bearing one, below.

### C2's row identity + precedence (must be settled before any SQL)

Today the model is *exactly one* published `client_meal_plans` row per
(nutritionist, client). C2 breaks that, and ruling 5 makes two kinds of row
coexist deliberately, so the contract has to be explicit or `/api/client/plan`
and mobile will disagree about which menu is live.

**Two row kinds, told apart by a program key:**

- a **standing menu** — what a plain Meal-plan assignment writes today. Carries
  no program key. This is the row every existing client has, and its behavior
  must not change (the unruled precondition above).
- a **program week** — carries the program's identity plus which week it is
  (a `program_id` + a week ordinal or `week_start`). N of these belong to one
  assigned program.

**Uniqueness, stated as two constraints rather than one:** at most one *live*
standing row per (nutritionist, client) — preserving today's invariant exactly —
and at most one program-week row per (nutritionist, client, program, week). A
single constraint over both kinds cannot express this, which is why the program
key has to be a real column rather than something parsed out of `payload`.

**Precedence when both cover the same week — one rule, applied identically by
`/api/client/plan` and the mobile reader:**

1. A **running, un-paused program week** for the member's local current week
   wins.
2. Otherwise the **standing menu** wins — this covers before the program starts,
   after its term ends (ruling 4), and any week the program simply doesn't
   cover.
3. If neither exists, there is no menu, and the surface says so honestly rather
   than falling back to the most recent row.

Ruling 5 chooses which of those two rows even exists: **replace** retires the
standing menu outright (rule 2 then has nothing to fall back to, which is why
the coach is told that at assign time), while **pause** keeps it stored and
un-selected for the term, so it returns under rule 2 the moment the program
ends. Pause is the reason the writer can no longer archive every published row
on insert.

**C3 — Labelling.** The week's phase name from the outline titles that week's
menu — B's arc, riding C's food.

## E — The entitlement layer (cross-discipline, blocks C2's end rule)

Ruling 6 puts this outside nutrition: it is a **platform** change that also fixes
a live training hole (finding ③). It can be built in parallel with C0/C1 and must
land before C2's end-of-program rule.

- **Make the purchase kind real** (finding ②) — `booking` | `program` |
  `meal_plan`, derived from what was bought rather than from the provider's role.
  Everything downstream depends on telling a program from a single session.
- **Give a program purchase a term** and, per ruling 3, a **`started_at` stamp
  set when the client starts it** — not at purchase. A never-started purchase
  has no clock running.
- **Bound the replay, and enforce it on the SERVER.** `startPurchasedPlan`
  currently lets a client restart week 1 forever. The invariant is
  **one active run per purchase**: starting stamps `started_at` (ruling 3) and
  opens the term; re-starting *inside* the term is a **restart of the same run**
  (the existing atomic new-rows-then-delete-old behavior, term unchanged — it
  does not extend the clock); starting *after* the term has elapsed is
  **refused** and offers the re-buy. This must be checked where the rows are
  written, not in the UI — the client owns their own `client_workouts` rows
  under RLS, so a UI-only bound is not a bound at all.
- **Honest end state** on both surfaces: the plan stops, the client is told the
  program is complete, and the re-buy is offered. Never a silent empty Eat or
  Train tab.
- **A single session is untouched** — consumed by attendance, not by time.

**Migration + backfill for rows that already exist.** Every historical row is
`kind='booking'` or `'meal_plan'` with no term, so the build must state what
happens to them rather than leave it to the reader:

- **Classification.** A legacy row is a **program** only if it carries a
  `plan_id` whose `coach_plans` row is a program/multi-week kind; everything
  else stays a **single session** (`booking`) or a one-off `meal_plan`. There is
  no other signal — the kind was derived from provider role (finding ②), so it
  cannot be trusted to distinguish them.
- **Grandfathering, stated explicitly.** Legacy program purchases have no
  `started_at` and no term. They are **not** retro-expired — a client who
  already bought keeps what they bought. They carry a null term and behave as
  they do today (own-forever, replayable); the term applies to purchases made
  **after** the migration. Retro-expiring a past purchase would be taking away
  something already paid for.
- **Unclassifiable rows fail OPEN**, to the client's benefit: no term, current
  behavior preserved.

## Still open for the owner (2 — neither blocks C0 or C1)

The other two questions here are now answered: "is program = arc?" by the ruling
for C, and "what happens when the arc ends?" by ruling 4.

1. **Should the trailing non-week block ("Grocery + prep guide") show anywhere,**
   or be dropped as it is on the training side?
2. **Overrule the web decision?** Precondition 3's build contract is **both
   surfaces**, and that is what gets built unless this spec is amended first —
   there is no ambiguity for the builder either way. Raising it here only
   because it is the one precondition that is a product call rather than a
   correctness one: scoping to mobile is cheaper and ships sooner, at the cost
   of the same assignment being visible to one member and silently absent for
   another. Say the word and the spec is amended before the build; say nothing
   and both surfaces ship.
