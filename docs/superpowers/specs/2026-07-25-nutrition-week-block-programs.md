# Nutrition week-block programs — design

**Status:** OWNER RULED **C** (multi-week menus) 2026-07-26. C is a WAVE, not a
fix; scoping it surfaced a blocker that reorders the work, and the rulings reach
past nutrition into **training purchases and platform entitlement**.

⚠ **Scope of "answered": every question this document rules on — the six owner
rulings plus rounds 2's two — is closed, and that is what makes C0/C1
build-ready. It does NOT mean the wave has no open questions.** The entitlement
work those rulings imply was split into
[`2026-07-26-entitlement-layer.md`](2026-07-26-entitlement-layer.md), which is
**NOT build-ready** and carries four unresolved conditions of its own (run
lifecycle, paid-content durability, cross-discipline exclusivity, and a clean
adversarial pass). C2/C3 inherit those. Read the table below as the build
signal, not this paragraph.

**Related:** #1832 (the training half: a week label is a phase, not an exercise).

**Build-ready scope — read this before building anything from this document:**

| Track | State |
| --- | --- |
| **C0** — stop the fabrication | ✅ **SHIPPED** (#1836) |
| **C1** — per-day menus + make the ✦ AI DRAFT real | ✅ **build-ready — next** |
| **C2 / C3** — multi-week rows, precedence, labelling | ⛔ **blocked on E** (C2's end-of-program rule needs a term to end) |
| **E** — the entitlement layer | ⛔ **split out and NOT build-ready** → [`2026-07-26-entitlement-layer.md`](2026-07-26-entitlement-layer.md) |

Build order is therefore **C0 (done) → C1**, then C2 → C3 once E is ruled
build-ready. C1 depends on nothing in E.

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
   ✅ **RATIFIED 2026-07-26 (ruling 8) — not overruled.** The owner was offered
   the mobile-only amendment before any build started and kept both surfaces.
   Settled: build both, and do not re-raise it mid-build.
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

⚠ **The structural cause, and therefore the shape of the fix.** `isWeekBlock` is
gated on `!isNutri` (`iosAppBroadsheetPros.jsx:3327`), so week-block detection is
*unreachable* on the nutrition side and the `isNutri` branch maps every block
through `bsAssignMeal` unconditionally. C0 is mostly removing a guard that was
never true for nutrition — reusing the SAME `bsAssignWeekLine` grammar and the
same ≥2 threshold, so nutrition and training classify an outline identically
(one grammar, per `planOutline.mjs`).

Per **ruling 7**, C0 also states what it did NOT deliver: the trailing non-week
block is dropped from delivery and **named in the assign confirmation**, never
dropped silently.

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

⚠ **"Make the draft real" is NOT just deleting the hardcoded template — the API
contract does not currently accept what the nutrition builder sends.** Both
halves of the mismatch are load-bearing:

- **The kind is silently wrong.** The nutritionist builder's `buildType` is
  `mealplan | program | diet` (`iosAppBroadsheetPros.jsx:5990`) and it is sent
  straight through as `kind` (`:6052`); the trainer's is `plan | workout |
  program` (`:5106`, sent at `:5171`). But the route's `GenerateKind` is
  `'workout' | 'program' | 'meal_plan'` (`generate-plan/route.ts:9`) and it
  **normalizes anything unrecognized to `'workout'`** (`:101`). So `mealplan`,
  `diet` and the trainer's `plan` all resolve to **workout** — a nutritionist
  asking for a meal plan gets exercises back. Today that is invisible *because
  the answer is discarded*; the moment C1 renders it, a coach's ✦ AI DRAFT
  produces a workout in a meal-plan builder. **The build must map the builder's
  kinds onto the route's before consuming the response** (and either widen
  `GenerateKind` or reject an unknown kind rather than defaulting — defaulting
  to `workout` is how this stayed silent).
- **`meal_plan` doesn't return seven distinct days.** The route's meal-plan
  branch (`:118`) and program branch (`:144`) return their own schemas, neither
  of which is "7 different menu days" — which is precisely what C1 exists to
  author. The **response shape must be specified before the build consumes it**,
  or C1 ships a real AI call whose answer still can't populate the thing it was
  called for.

**C2 — Multi-week storage.** N `client_meal_plans` rows coexist, selected by the
current week. Requires, all of them:

- a **retention/status model** — `status` is CHECK-constrained to
  `published|archived` with no notion of "scheduled"; a future week is currently
  indistinguishable from a stale one;
- the **writer contract** to stop archiving every published row for the pair on
  each insert (`/api/nutritionist/meal-plan`), or each new week retires the last;
- the **reader** (`/api/client/plan`, currently `published` / `created_at desc` /
  `limit 1`) to select by `week_start` against the member's local week;
- the **grocery list to follow the week.** ⚠ Do not re-invent this: the shop list
  is ALREADY derived from the assigned menu every week —
  `bsBuildPlanGrocery(PROGRAM, …)` (`iosAppBroadsheetClient.jsx:7530`) walks
  `days → meals → ingredients`, dedupes by name, collapses repeated quantities,
  buckets by aisle, and is credited to the real nutritionist + named after their
  plan; `activeGroceryList = selectedGroceryList || planGrocery` makes it the
  DEFAULT list. Because it consumes the same `PROGRAM` the reader produces, a
  correct per-week reader carries the grocery list along **for free** — but that
  is exactly why it must be an explicit acceptance criterion rather than an
  assumption: **in week 3, the shop list contains week 3's ingredients.** A
  reader that silently keeps returning week 1 would leave a member shopping for
  the wrong week with no visible error.

  ⚠ **A correct reader is necessary but NOT sufficient — the manual selection
  overrides it.** `activeGroceryList = selectedGroceryList || planGrocery`
  (`:8679`) means any list the member picked wins over the derived one for as
  long as it is held, so the criterion above is unenforceable on its own: pick a
  saved list in week 1 and week 3 still shows week 1's. Today this is invisible
  precisely because every week carries the same menu — **C2 is what makes the
  weeks differ, so C2 is what turns it into a wrong-week shopping list.**
  Therefore the selection must be **scoped to the program week it was made in**:
  when the member's active program week changes, the selection is dropped and
  that week's derived list becomes active again (`setSelectedGroceryList(null)`
  is already the picker's own "back to the plan list" path, `:8876`). A
  selection made *within* a week still holds for that week — a deliberate choice
  is not clobbered mid-shop. The picker's plan row must also **name the week it
  represents**, so "which week am I shopping for" is answerable on screen rather
  than inferred;
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
- a **program week** — carries the **run's** identity plus which week it is
  (a run/entitlement key + a week ordinal or `week_start`). N of these belong to
  one assigned program.

**Uniqueness, stated as two constraints rather than one:** at most one *live*
standing row per (nutritionist, client) — preserving today's invariant exactly —
and at most one program-week row per (nutritionist, client, **run**, week). A
single constraint over both kinds cannot express this, which is why the program
key has to be a real column rather than something parsed out of `payload`.

⚠ **A per-run constraint is not enough — add a single-active-run invariant.**
Keying weeks on the run (below) is what makes a re-buy representable, but it
also makes **two live runs** representable: a client can start a purchased
program while a coach-assigned one is still running, and both would then hold a
row for the same current week. The precedence ladder says "**a** running,
un-paused program week wins" — with two, there is no winner, and
`/api/client/plan` would serve whichever the query happened to order first,
which on a paid program is serving the wrong menu. So: **at most one ACTIVE
nutrition run per client** — the SAME invariant E states, with the unique index
and the advisory-lock key both scoped to `(client, discipline)`. A
purchase-scoped bound is **strictly weaker and does not imply this one**: two
different purchases could each open a live nutrition run and still satisfy it.
A second activation is **refused with an
explicit choice** — end the running program now and start this one, or keep the
current one — never silently accepted. Training carries the identical rule on
its own discipline (ruling 6). As defense in depth the reader still needs a
deterministic tiebreak — **most recently activated run wins** — so that even a
bypassed constraint yields one answer rather than an arbitrary one.

⚠ **"Active" must be a STORED lifecycle value, not a wall-clock predicate.**
Postgres requires an index predicate to be IMMUTABLE, so
`... where started_at is not null and ends_at > now()` is **rejected at
creation** — `now()` is STABLE. And indexing on `started_at is not null` alone
is worse than useless: a naturally-expired run would hold the unique slot
**forever**, permanently refusing the client's next program. So the run row
carries an explicit **`status`** (`active` | `ended`) — or an `ended_at`
timestamp with the index on `where ended_at is null` — and the unique index is
over `(client, discipline) where status = 'active'`, which is immutable.

The build must then say **who flips it**, because a row cannot expire itself:
activation sets `active` inside the activation transaction; an explicit
end-and-replace sets the outgoing run to `ended` **in the same transaction** as
the incoming activation, so the slot is never double-held and never
transiently empty; and **natural expiry is flipped by the server on the
authoritative path** — lazily when the term check reads a run whose
`term_ends_at` has passed, plus a sweep so a client who never opens the app
still frees the slot. Every reader computes eligibility from the stored status
**and** the term dates, so a missed flip degrades to "expired, no menu" (rule 3,
honest) rather than to a program that silently runs forever.

⚠ **The row key is the RUN, not the catalog program — `program_id` alone
collides on a re-buy.** Ruling 2 makes a program a repeatable sale, so
`(client, program, week)` is not unique across two purchases of the same catalog
program: the second run's week 1 would either overwrite the first's or attach to
the expired entitlement. `program_id` therefore stays a **catalog reference**
(what was bought, for labelling and re-buy), while **row identity, the
uniqueness constraint, and the reader's selection all key on the run**. This is
the same finding as E's purchase-id bullet reaching a second surface: E fixes
*activation and the term check*, C2 fixes *the rows those produce*. Fixing one
without the other leaves the collision intact.

⚠ **The run key must be a row we CREATE — there is no coach-assignment id to
borrow.** An earlier draft said "the `one_time_purchases.id` for a purchase, a
coach-assignment id for a coach-assigned run." The first exists; **the second
does not.** `BSProAssignPage` writes straight through `ShapeAssign.mealPlan` /
`ShapeAssign.workout` (`iosAppBroadsheetPros.jsx:3363`, `:3373`) and creates no
assignment record at all, and the one table with a plausible name,
`coach_program_assignments`, carries `program_template_id uuid not null
references coach_program_templates` (`2026-05-08-coach-program-tools.sql:145`) —
a NOT NULL FK to *templates*, not to the `coach_plans` row being assigned here,
and it is only ever inserted by `/api/program-tools/templates`
(`route.ts:149`). So half the runs would have had no key.

The build must therefore create a **durable run row** — one record per run,
carrying: client,
provider, discipline, **source** (`purchase` with its `one_time_purchases.id`,
or `coach_assign`), the catalog `program_id`, `started_at`, the immutable
`term_days` (below), and the ruling-5 conflict choice. **That row's id is the
run key** every program week points at, and it is what the term check, the
replay bound, and the reader all read. It is the entitlement record; the weeks
are its output. A run whose rows exist but whose run row doesn't is
unrepresentable, which is the point.

⚠ **The run and its weeks commit TOGETHER — an active run with no weeks is the
worse orphan.** An earlier draft said the run row is written "atomically before
any week is materialized," which guards only one direction. The other is
strictly more damaging: if a week insert then fails, an **active** run survives
with zero or partial coverage, the single-active-run rule refuses any
replacement, and under pause mode the standing menu is ineligible — so the
client has **no menu at all until the term expires**, for a program they paid
for. So either the run row **and every authored week row commit in one
transaction**, or the run is created **non-active** and flips to `active` only
once materialization has completed, in that same transaction. Partial coverage
that the *coach chose* is still fine (the invariant only promises rows for weeks
they actually filled); partial coverage caused by a *failed write* must roll the
whole activation back and leave the client exactly where they were.

**Precedence when both cover the same week — one rule, applied identically by
`/api/client/plan` and the mobile reader:**

1. A **running, un-paused program week** for the member's local current week
   wins.
1b. **Past the last authored week of a still-entitled run, the FINAL authored
   week keeps serving** (see the clamp below).
2. Otherwise the **standing menu** wins — **unless a pause-mode term is still
   running** (below). This covers before the program starts and after its term
   ends (ruling 4).
3. If neither is eligible there is no menu, and the surface says so honestly
   rather than falling back to the most recent row.

⚠ **Rule 1b exists because rules 1–3 alone CONTRADICT ruling 4.** On the ongoing
monthly coaching entitlement, ruling 4 requires the last week's menu to keep
serving "until the coach assigns the next thing." But an entitlement outlives
its authored weeks: once the current-week ordinal passes the last authored one,
rule 1 finds no row, and the client falls through to the standing menu — or, in
pause mode, to **no menu at all**, because a running pause-mode term makes the
standing row ineligible. So a client on a live, paid, ongoing plan would watch
their food disappear the week after the coach's last authored week, which is the
opposite of what ruling 4 promises. The clamp: **while the run is still entitled
and its weeks are exhausted, the reader selects the highest authored week
ordinal** rather than treating the week as uncovered. This applies ONLY to the
ongoing-entitlement case — a **one-off program whose TERM has ended** still
stops (ruling 4's other half), falls to rule 2, and offers the re-buy.

⚠ **Rule 2 is conditional on the stored conflict choice — not a blanket
fallback.** Partial coverage is explicitly permitted (the invariant only
promises rows for "weeks a coach actually filled"), so a week the program simply
doesn't cover would otherwise let rule 2 **revive the very menu the coach
paused** — mid-term, without anyone choosing it. That silently overrides ruling
5. Therefore: **while a pause-mode term is running the standing row is
INELIGIBLE, even on an uncovered week** — the honest state there is rule 3 (no
menu), not the paused one. It becomes eligible again only when the term ends.

Ruling 5 chooses which of those two rows even exists: **replace** retires the
standing menu outright (rule 2 then has nothing to fall back to, which is why
the coach is told that at assign time), while **pause** keeps it stored and
un-selected **for the whole term** — it returns under rule 2 when the TERM ends,
never merely because a week went uncovered. Pause is why the writer can no
longer archive every published row on insert, and why the conflict choice must
be **stored on the program** rather than inferred at read time.

**C3 — Labelling.** The week's phase name from the outline titles that week's
menu — B's arc, riding C's food.

## E — The entitlement layer → SPLIT OUT, not build-ready

⚠ **E has been lifted into its own document:
[`2026-07-26-entitlement-layer.md`](2026-07-26-entitlement-layer.md), and it is
marked NOT BUILD-READY.** It is not a nutrition change — it decides what a
client owns after they pay, across purchases, Stripe checkout metadata, run
lifecycle, term expiry, replay bounds and cross-discipline exclusivity —
and nutrition is only one of its consumers.

**Why it was split rather than finished here.** Four review rounds on this PR
returned **twelve findings, every one of them inside E**, and rounds 2–4 were
each caused by the previous round's fix (keying rows on the run made two live
runs representable; single-active-run made a failed materialization lock the
client out; the migration-boundary fix moved the same bug onto a different
clock). Each fix was right in isolation and opened a seam at its edge. That is a
scope signal, not a polish signal — so E gets a document sized to its blast
radius, and the rest of this wave stops waiting on it.

**What this changes for the build:**

- **C0 and C1 do not depend on E at all** and are build-ready now. C0 is
  already shipped (#1836); C1 is next.
- **C2 and C3 remain blocked on E** — specifically C2's end-of-program rule,
  which needs a term to end. They are **not** build-ready, and the sections
  above describing them stand as design, not as a build contract.
- ⚠ **One item does NOT wait for E: the live paid-content bug.**
  `one_time_purchases.plan_id` is `on delete set null`
  (`2026-06-08-coach-plans-sale.sql:12`) and `get_my_purchased_plans()`
  inner-joins the live catalogue row (`:45-46`), so a coach deleting a plan
  makes a paying client's purchase **vanish from their Library** and editing it
  silently changes what they bought. That exists in production today, is not
  caused by this design, and has its own PR.

## Owner rulings, round 2 (2026-07-26) — nothing is open

Both remaining questions were ruled **before any build started**, which is the
order this spec demands of the web one.

7. **The trailing non-week block is DROPPED from delivery — and the coach is
   told.** ⚠ **The reason matters, because the first framing of this question was
   wrong.** It is not that "Grocery + prep guide" has no items to build from —
   **the app already sends the meal plan's items to the grocery list every week.**
   `bsBuildPlanGrocery` derives the shop list from the assigned menu's own
   ingredients (see the C2 bullet above), and it is the DEFAULT list a member
   sees. So the block is **redundant with a feature that already ships**, and
   materializing it would create a second, hand-authored grocery list that can
   disagree with the derived one — two shop lists for one week.
   Therefore: not delivered, and the assign confirmation **says so and says why**
   ("Grocery + prep guide — not delivered; the shop list builds automatically
   from this plan's meals"). The drop is never silent. ⚠ Note the training-side
   precedent was thinner than assumed — the trainer's week-block template emits
   six week lines and NO trailing block, so nothing was ever *deliberately*
   dropped there; the drop is emergent (`bsWeekUnits` skips non-week lines).
8. **Web parity CONFIRMED — both surfaces, as precondition 3 states.** Not
   overruled. The mobile-only saving is smaller than "cheaper and ships sooner"
   implies: **both surfaces already read the same route** (mobile
   `shapeBackend.js:3715`, web `dashNutri.jsx:194` — both `/api/client/plan`), so
   mobile-only would still need the same field added and would save only the
   `dashNutri.jsx` render block. C2's week selection lives in that shared route,
   so it is correct on both surfaces by construction either way; this ruling
   governs the phase-line render alone.
