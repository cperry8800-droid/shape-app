# Coach builders: Nora drafting today, and what the builder mock-ups' data needs

Read from the working tree on 2026-11-05. Nothing under `/home/user/shape-app` was changed. Paths are repo-relative; `file:line` points at the line or the range.
Mock-ups checked: `coachmock/workout-builder.html`, `program-builder.html`, `plans-v2.html` and `meal-builder.html`.

---

## Summary

**Nora drafting today.**
- **Two engines.**
  - Workouts and programs come from one core, `src/lib/ai/workoutDraft.mjs`. Two doors use it:
    - the website day editor's **✦ Draft with AI** (`POST /api/ai/draft-workout`);
    - Nora's `draft_workout` tool in chat.
  - Meal plans come from `src/lib/ai/mealDraft.mjs`, through Nora's `draft_meal_plan` in chat only.
    - No model writes the meals: a deterministic picker chooses from the builder's **24-food library**, not Shape Kitchen's 100 recipes.
  - The app's **＋ New** composer (trainer and nutritionist) is a third, older path. It calls `POST /api/ai/generate-plan`, which returns text outline lines, not builder rows.
- **What Nora reads.**
  - The coach's brief in their own words.
  - Single day or program; weeks (1–12, 4 by default) and days a week (1–7, 3 by default).
  - Minutes, equipment and level.
  - The coach's load unit.
  - For a client the coach coaches: **their training phase and nothing else**. She does not read goals, injuries, logs, past loads, 1RMs or health notes. A meal draft reads no client data at all.
- **What she returns.**
  - Workouts:
    - real builder rows: sets, reps, RPE, rest, tempo, a cue and superset letters;
    - **loads are blank** unless the brief states the number;
    - a program is one week repeated, RPE +0.5 a build week, with deload weeks (sets × 0.6, RPE −1);
    - **loads never progress**.
  - Meal plans:
    - one library food per meal, as a 1–7 day rotation (3 by default);
    - one target set for every day (stated, or the phase's defaults);
    - portions scaled per day ×0.6–1.6;
    - no rest-day version.
- **How it lands.**
  - The web day editor previews the drafted lines, then offers Use, Add or Replace, and **Undo draft** while the day is untouched.
  - Nora's card saves the draft **unpublished** and opens it in the builder.
  - A single day for a named client can be assigned on a named date.
  - **Nothing tracks what the coach changed after that.** Drafted rows keep an `ai-…` id and drafted meals a `nora-…` id, so provenance can be derived, but nothing keeps the draft to compare against.
- **Limits.**
  - The workout route has a 45 s model timeout and a template fallback that says it is one.
  - **It has no daily budget**, and neither does `generate-plan`. Only Nora's questions (300 a day for coaches) and `draft_nutrition_program` (40 a day) are counted.

**Data check (the four mock-ups).** Most of what the builders show is already stored or can be computed. The gaps are few and specific:

| Mock-up | Wired | Derivable | New | Mock-only |
|---|---|---|---|---|
| Workout builder (30 elements) | 16 | 11 | 2 | 1 |
| Program builder (21) | 12 | 8 | 1 | 0 |
| Meal-plan library (14) | 6 | 5 | 2 | 1 |
| Meal-plan builder (26) | 9 | 11 | 6 | 0 |

**The NEW items, all of them:**
1. Shape Kitchen in the meal builder. The builder searches 24 foods; Kitchen's 100 recipes have kcal and macros but text quantities.
2. Separate train and rest-day targets in a meal plan.
3. Meal-plan assignment that follows each client's own training days. Today the coach ticks them, Mon/Wed/Fri by default.
4. A template id on meal-plan assignments (for "who's on it", "Most used", "Update theirs").
5. "Update theirs": push template edits to clients already on a program or plan. Both assignments are snapshots.
6. ＋ Add to a program, from a single day.
7. Assign all 3 (several plans at once).
8. A session-minutes estimate.
9. Shape demo videos per move. `exercise_catalog.demo_url` exists, but it is empty and the picker doesn't read the catalog.
10. A per-meal note to the client (one field on a meal).

**Drop or relabel:**
- the volume figure (12.2k lb), which is misleading when Nora leaves loads blank and on bodyweight or carry rows;
- the "Race" and "Intake" plan types (the only phases are Cut, Maintain and Build);
- "On it now · week 6 of 12" as one week for five clients. Each client has their own week.

**The Nora mock-ups** (`coachmock/builder-start.html`, `workout-builder-nora.html`, `program-builder-nora.html`, `meal-builder-nora.html`):
- They use only what Nora does today, with three exceptions, each labelled **proposed** on the page:
  - program-level drafting from the website builder (the route already accepts `kind: 'program'`; the web UI only sends `'day'`);
  - meal drafts from Shape Kitchen recipes, honouring rest-day targets;
  - the "what you changed" tracking against the draft.

---

## 1. Nora drafting, as it exists today

### 1.1 Where a coach starts a draft

| Surface | The control | What it calls | What comes back |
|---|---|---|---|
| **Website**, workout and program builder, inside a day | **✦ Draft with AI**, a ghost button under the day's list (`public/newdesign/dashBuilder.jsx:1584`). It opens an inline brief: one text field, "Lower body, 50 min, barbell, intermediate" (`:1318-1332`) | `POST /api/ai/draft-workout` with **`kind: "day"` only**, plus the builder's client when it has one (`:1304`) | One day of builder rows, shown as lines before anything changes (`:1338-1351`) |
| **Website**, empty program library | "✦ Ask Nora to draft one", shown only when the library is empty (`dashBuilder.jsx:3125`). Otherwise the library offers ＋ Single workout day / ＋ Program (`:3117-3118`) | Opens Nora's chat with "Draft a workout for me: " typed in (`public/newdesign/globalChatButton.js:80-98`) | Nora's card (below) |
| **Website**, empty meal-plan library | "✦ Ask Nora to draft one" (`public/newdesign/dashMealBuilder.jsx:960`). Otherwise there is ＋ New meal plan (`:952`) | Nora chat, "Draft a meal plan for me: " | Nora's card |
| **Nora chat** (the masthead ✦ on any surface), trainer | `draft_workout` tool (`src/app/api/support/chat/route.ts:484-511`; prompt `:636-658`) | `draftWorkoutAction` (`src/lib/ai/actions.mjs:340-477`) → the same core | A confirm card. It saves an unpublished program, or assigns one session |
| **Nora chat**, nutritionist or dietitian | `draft_meal_plan` and `draft_nutrition_program` (`chat/route.ts:516-565`; notes `:566-572`) | `actions.mjs:491-555` (meal plan); `:563-633` (program or diet → `/api/ai/generate-plan`) | A confirm card, saved unpublished |
| **App**, coach Programs / Plans | **＋ New** → the "✦ AI DRAFT" composer (`mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:6046-6144` trainer; `:7196-7276` nutritionist). There is also "＋ Build from scratch" and, when the list is empty, "Ask Nora to draft one" (`:6234`, `:7328`) | `POST /api/ai/generate-plan` (`:6069`, `:7224`) | Outline text lines, e.g. "Mon — Upper (push)", opened in the editor (`:6074-6084`, `:7232-7237`) |
| **Website**, legacy pages TrainerNewWorkout/NewProgram.html | `AIGeneratorCard` with pre-filled sample fields ("Alex Rivera", "protect right knee") (`public/newdesign/aiGenerator.jsx:1-40`; `newWorkout.jsx:234`, `newProgram.jsx:211`) | `generate-plan` | Coarse blocks. r2data already proposes retiring these pages |

> **Owner history to weigh.** On 2026-11-04 the owner had the "Draft with Nora" box removed from the app's Programs and Plans pages: "coach should just be able to ask nora from click nora button in mast head" (`src/lib/warroom.ts:785-786`, #2590). The new ask asks for Nora inside the builders. The mock-ups therefore put Nora in the **New** flow and as a quiet mark inside the builder. They don't put a box back on the library page.

### 1.2 What Nora reads

| Input | Workout / program (`workoutDraft.mjs`) | Meal plan (`mealDraft.mjs`) | App composer (`generate-plan`) |
|---|---|---|---|
| Brief in the coach's words | `request`, at most 500 characters (`:121-147`, `:30`) | No free text reaches the picker. Nora reads the words into the fields below | `preferences` free text + the chips |
| Single day or program | `kind` (`:125-127`) | — | Workout / Program / Plan chip |
| Length | `weeks` 1–12, 4 if not given (`:138`) | `days` 1–7, **3 if not given** (`:92`) | Program duration text |
| Days a week | `daysPerWeek` 1–7, 3 if not given (`:139`). Weekdays come from the model or are spread (`:85-88`, `:310-319`) | — | — |
| Minutes | 10–180 (`:140`) | `maxPrepMinutes` per meal (`:95`) | Length chip 30/45/60/75 min (`iosAppBroadsheetPros.jsx:6136`) |
| Equipment | Free text, 80 characters (`:141`) | — | Full gym / Dumbbells / Bodyweight |
| Level | Beginner / intermediate / advanced (`:104-110`) | — | Experience chip |
| Goal | Only as words in the brief | `goalPhase` cut / maintain / build (`:72`) | Focus or goal chip |
| Targets | — | kcal / protein / carbs / fat **only if stated**. Otherwise the phase defaults (Cut 1,900 · 165 P · 170 C · 60 F) (`:44-48`, `:73-81`) | Daily calories chip, meals a day |
| Leave out | — | Exclusions, with diet words expanded (vegetarian → meat, fish…) (`:84-86`, `:112-143`) | Diet chip |
| Load unit | The coach's Settings → Units (`:790-798`) | — | — |
| **The client** | Only after `is_coach_on_client` (`src/app/api/ai/draft-workout/route.ts:71-79`). Then **only `client_programs.training_phase`** (`workoutDraft.mjs:806-814`). No goals, injuries, logs, body data or past loads | The client's name only labels the card; **no client data is read** (`actions.mjs:502-508`) | `client: ''`: no name reaches the model (`nutritionDraft.mjs:85-87`) |

Nora never reads injuries. A knee goes to her only as words the coach types into the brief, and then only the model sees it; no rule enforces it.

### 1.3 What Nora returns

**Workouts and programs** (`workoutDraft.mjs`):
- **Rows.** Name, sets 1–10, reps as text, RPE in half points, rest, tempo, a cue, and a superset letter (`:210-233`, `:254-271`).
  - A name that matches the 75-move library carries its muscle and equipment (`:51-83`, `:215-223`).
  - Blocks are warm-up, main, accessory and finisher, at most 16 rows a day (`:235-253`).
- **Loads are blank** unless the brief states the number: "use 185", "100 kg", or a % with a 1RM (`:167-201`, prompt `:676`).
  - The card says so: "Left blank unless you gave them — RPE sets the effort" (`actions.mjs:331-333`).
  - The web brief hint says "Loads stay empty unless you give one" (`dashBuilder.jsx:1332`).
- **A program is one week, repeated.** Later weeks get RPE +0.5 per build week. Deload weeks run sets × 0.6 with RPE −1 (`:352-398`, `:322-328`).
  - The template deloads weeks 4, 8 and 12 (`:612`).
  - **Loads never move**: a load progression (+5 lb a week) is the builder's own rule, which the coach turns on (`public/newdesign/workoutDocument.js:430-463`).
- **Notes and fallback.** At most one sentence of notes (`:677`). With no key, a failed call or junk back, it builds a **labelled template** from the library: `TEMPLATE_NOTICE` (`:42`, `:439-615`, `:734-752`).
- **Off-topic briefs** come back as a question (`:43`, `:746`, `:750`).

**Meal plans** (`mealDraft.mjs`):
- **Picks.** One food per slot, from the builder's 24 foods (`:16-41`, which copy `public/newdesign/dashMealCore.js:55-80`).
  - Breakfast, Lunch, Dinner and Snack each have their own pool (`:52-57`).
  - The picker scores closeness to the targets, counts protein double, applies a protein floor and penalises repeats (`:168-204`).
- **Portions.** Each day's portions are scaled ×0.6–1.6 to hit the kcal (`:155-161`, `:207-213`).
- **Targets.** One set of targets; no rest or travel variant (`variants: {}`, `:241`).
- **Name.** Defaults to "Cut · 3-day rotation" (`:246-248`).
- **What it never does.** Model-written meals, Shape Kitchen recipes, train/rest targets, assignment.

**Nutrition programs and diets** (`nutritionDraft.mjs`): text lines from `generate-plan` ("Week 1 — Reset & habits"; "Breakfast options"), read with the app's own parsers (`:103-110`). Saved as the app's document (`:115-136`).

**The app composer** (`generate-plan`): title/detail blocks in a fixed grammar (`src/app/api/ai/generate-plan/route.ts:223-266`), read into outline lines. It is not row-level: no sets, RPE or rest fields.

### 1.4 How the draft lands, and whether edits are tracked

| Path | Lands as | Undo | Tracking edits against the draft |
|---|---|---|---|
| Web ✦ Draft with AI | Preview lines first. Then "Use this draft" on an empty day, or "Add to this day" / "Replace this day" (`dashBuilder.jsx:1338-1351`). Rows join the document and ride autosave (`:1501-1517`). A placeholder day name takes the draft's | **Undo draft**, offered only while the day still equals what the draft left (`:1388-1390`, `:1518-1525`) | **None.** Row ids keep the draft's `ai-<8 hex>-w1-d1-rN` (`workoutDraft.mjs:354-358`, `:381`; ids preserved at `workoutDocument.js:569`). Nothing reads the prefix, and no copy of the draft is kept |
| Nora `draft_workout`, saved | Confirm card (week 1 move by move, at most 36 lines; `actions.mjs:309-336`). Then `POST /api/coach/plans`, **unpublished** (`:447-451`), opened at `#programs?plan=` (`dashBuilder.jsx:3047`) | Undo deletes it **only while revision 1** (`actions.mjs:470-476`). One builder save and it can't be undone | None, as above |
| Nora `draft_workout`, assigned | One session (or a one-week program) on a named date (`actions.mjs:360-415`). A multi-week program for a client is saved, not assigned (`:302-307`) | Archives exactly those sessions (`:459-468`) | — |
| Nora `draft_meal_plan` | Saved unpublished (`actions.mjs:536-540`). Opens in the website meal builder at `?plan=` (`dashMealBuilder.jsx:884-897`). **Never assigned**: the compliance check runs at assign | Undo only while the stored document is byte-identical (`actions.mjs:544-554`) | None. Meal ids are `nora-<tag>-<day>-<slot>` (`mealDraft.mjs:235`) |
| App composer | The outline opens in `BSWorkoutDocumentEditor` / `BSCoachDraftEditor` (`iosAppBroadsheetPros.jsx:6043`, `:7193`) | Cancel | None; block ids are `b0`, `b1`… |

Precedent for tracking: the builder already marks a later week's load or RPE that the coach typed by hand as **pinned**, against the progression rule (`workoutDocument.js:479-496`, `:514-530`). "Edited from Nora's draft" would be the same comparison against a stored draft.

### 1.5 Limits and cost caps

- **`/api/ai/draft-workout`.**
  - Gate: membership, then signed in, then coach or admin, then **trainers only** (`route.ts:39-59`).
  - Body cap 16 KB (`:62`); model timeout 45 s (`workoutDraft.mjs:734`); `maxDuration` 120 (`route.ts:35`); effort medium, 16k output tokens (`workoutDraft.mjs:706`, `:739`).
  - **No per-account daily budget.** Only the proxy's 100 a minute applies.
- **Nora chat.**
  - Every question counts against the daily limit: coaches 300, members 200 (`src/lib/ai/noraLimits.ts:22-28`; counted at `chat/route.ts:1521`).
  - `draft_nutrition_program` also spends the `draft_program` budget, 40 a day (`chat/route.ts:1123-1126`; `noraLimits.ts:43-49`).
  - `draft_workout` and `draft_meal_plan` have no separate budget. The meal picker makes no model call.
- **`/api/ai/generate-plan`.** Coach-gated (`route.ts:585-588`), **no daily budget**, default 60 s timeout (`src/lib/ai.ts:47`).
- **`/api/ai/draft-program`.** This is the member self-serve builder, not coaches; budget 40 a day (`route.ts:187-190`).

### 1.6 Half-built, or gaps

- **No program-level draft on the website.** The route accepts `kind: 'program'`, `weeks` and `daysPerWeek` (`draft-workout/route.ts:6-7`), but the web UI only sends `'day'` (`dashBuilder.jsx:1304`). Programs are drafted only through Nora's chat.
- **Two engines for one job.** The app's ＋ New composer uses `generate-plan` text outlines, not the row-level core the website and Nora use. The same brief gives a coarser draft in the app.
- **Meal drafts use 24 foods, not Shape Kitchen.** Nora's own prompt says "Shape's library is small (about two dozen dishes)" (`chat/route.ts:569`).
- **Nora's drafts aren't counted.** No daily budget on `draft-workout` or `generate-plan` (see 1.5).
- **Programs and diets are app-only.** A program or diet Nora drafts is edited only in the app; the website meal builder lists only its own documents (`warroom.ts:774`).
- **The app's meal-plan editor** can't add one's own dish or rest/travel versions, and its Assign uses Mon/Wed/Fri at portion 1 (`warroom.ts:775`).
- **Mutation spec drift.** Five mutations in `ai-draft-2026-10-07` match no code on main (`warroom.ts:778`).
- **`POST /api/program-tools/templates`** writes `coach_program_templates.source = 'ai_generated'` (`src/app/api/program-tools/templates/route.ts:19`, `:99`), but **nothing calls it**; it appears only in `warroom.ts:352`. It is an orphan. The builders save to `coach_plans`.
- **The legacy AI form** on TrainerNewWorkout/TrainerNewProgram.html still ships sample client names (`aiGenerator.jsx:3-8`).

---

## 2. Data check, element by element

**Status key.**
- **WIRED**: stored and read today.
- **DERIVABLE**: computable from stored data; the computation is named.
- **NEW**: needs a field, table or logic; what's needed is named.
- **MOCK-ONLY**: drop it, or keep it as a labelled proposal.

### 2.1 Workout builder (`workout-builder.html`)

| Element | Source | Status |
|---|---|---|
| Eyebrow "Single workout day · Strength" | `detail.buildType` 'workout' (`dashBuilder.jsx:3117`); goal tag `GOAL_TAGS` (`dashBuilderCore.js:46-52`) | WIRED |
| Title "Lower Push" ✎ | `day.name` | WIRED |
| "Saved just now" | Autosave state (`dashBuilder.jsx:2479`) | WIRED (reads "Saved") |
| ＋ Add to a program | — The reverse exists: a program pulls in "Add a saved day…" (`dashBuilder.jsx:2876-2890`) | **NEW**: a day → program picker that appends the day to a chosen program's weeks |
| Assign → | `DbuAssignModal` (`dashBuilder.jsx:1666-1756`) | WIRED |
| Library "Shape + yours" | `EXERCISES` (75) + the coach's own moves `customMoves` (`dashBuilderCore.js:62-93`; `dashBuilder.jsx:1578`) | WIRED |
| "Search 75 moves" | `EXERCISES.length` = 75 (`dashBuilderCore.js:62-93`). The picker caps results at 12 (`:95-101`); the ~200-move `exercise_catalog` is not wired to the picker (`:109-110`) | WIRED (75). Lift the 12 cap |
| Legs / Upper / Core / More | `muscle` on each move | DERIVABLE: map muscle → region (Quads, Hamstrings, Glutes, Calves, Posterior chain → Legs …) |
| "22 leg moves" | — | DERIVABLE: count after the region filter |
| Any equipment ▼ | `equipment` on each move | DERIVABLE: filter on the field. No equipment filter exists in the picker today |
| ✓ already in this workout | Day rows' names | DERIVABLE |
| ▶ thumbnails / "Shape demo" video | Coaches upload their own (`dashBuilder.jsx:1138`, `ShapeVideoAttachment`). `exercise_catalog.demo_url` exists but is **empty** ("the owner's to fill", `supabase-migrations/2026-10-07-exercise-catalog.sql:29-31`) | **MOCK-ONLY** for Shape demos (NEW: fill `demo_url` and read the catalog). "Use my own" is WIRED |
| ＋ Main (add to block) | `addRows(bi, …)` (`dashBuilder.jsx:1570`) | WIRED |
| Coach sheet / Client view | Preview as client (`dashBuilder.jsx:2828`) | WIRED |
| "7 moves · 4 blocks" | Rows and blocks | DERIVABLE (count) |
| Columns Sets×reps, Load, RPE, Tempo, Rest | Row fields (`dashBuilderCore.js:398`; `workoutDocument.js:580`) | WIRED |
| Warm-up / Main / Accessory / Finisher | `BLOCK_KINDS` (`dashBuilderCore.js:54-59`) | WIRED |
| Cue mark “ | `row.cue` | WIRED |
| Superset bracket A1/A2 | `row.group` (`workoutDocument.js:569`) | WIRED |
| "3 rounds, rest after A2" | Sets and the last row's rest | DERIVABLE |
| Quick add "adds to Finisher ↵" | `DbuQuickAdd`, current block (`dashBuilder.jsx:1578-1579`) | WIRED |
| ＋ Block · ✦ Draft with Nora | `dashBuilder.jsx:1583-1584` (labelled "✦ Draft with AI" today) | WIRED; rename to Nora |
| Selected move "Main · 02 · Quads · Barbell" | Block kind, index; `muscle` / `equipment` | WIRED (blank for a custom move without them) |
| Tempo explained "3 s down, 1 s pause…" | `row.tempo` | DERIVABLE: parse the 4-digit tempo |
| Per-set targets 225 → 255 lb | `perSet` ladder (`workoutDocument.js`, `perSetEntries`) | WIRED |
| ≈62 min | `day.plannedMinutes`, typed only in the app editor (`mobile-app/src/broadsheet/BSWorkoutDocumentEditor.jsx:257`) | **NEW**: an estimate (sets × (work + rest)), or show plannedMinutes when set |
| 19 working sets | Σ sets outside warm-up | DERIVABLE (checked: 7 + 6 + 6 = 19) |
| 12.2k lb volume | Σ sets × reps × load | DERIVABLE, but **drop**. Blank loads (every Nora draft), BW, carries and "ea" make it wrong or empty; coaches don't act on it |
| Muscle balance Quads 7 / Hams 6 / Core 6 | `row.muscle` × sets | DERIVABLE (library and Nora-matched rows carry the muscle; custom moves may not) |
| Note "Legs and core only… pair with an upper day" | Muscles present | DERIVABLE (one rule); new copy |

### 2.2 Program builder (`program-builder.html`)

| Element | Source | Status |
|---|---|---|
| "Program · Strength · 2 days a week" | Goal tag; days in week 1 | WIRED / DERIVABLE |
| Length 4 · 6 · 8 · 12 · Custom | `builder.weeks.length`. ＋ Week adds an empty week (`dashBuilder.jsx:2895`); a week row's Copy copies one | DERIVABLE: set the count = add copies of the last week, or trim. The picker is new UI over existing data |
| Published chip · "Saved · v3" | `coach_plans.published`; `detail.revision` / `doc.version` (`dashBuilder.jsx:2336-2348`, `:2823`) | WIRED |
| Preview as client · ⋯ (duplicate / unpublish / delete) | `dashBuilder.jsx:2828`; Use as template; publish flag | WIRED |
| Sessions "In this program" (7 moves · ≈62 min · ♪ playlist) | Days; `day.playlist` (`workoutDocument.js:606`) | WIRED (minutes: see 2.1) |
| "From your library" sessions | `dayTemplates`, "Add a saved day…" (`dashBuilder.jsx:2876-2890`) | WIRED |
| Week 1 "Nov 9 – 15" | Program details start date (`dashBuilder.jsx:2837`) | DERIVABLE |
| Strip of training days M T W T F S S | `day.weekday` | DERIVABLE |
| Card: Back squat 4 × 5 · 260 ▲5 | Rows and their week's load from the rule; the ▲ is the rule's step (`workoutDocument.js:430-463`, `progressionStatus` `:479-486`) | WIRED (the ▲ marks 'follows') |
| "+5 more · ≈62 min" | Row count; minutes see 2.1 | DERIVABLE |
| Week 3 ghost "copies week 2; loads follow the rule" | Copy-week exists. ＋ Week alone adds an empty week | DERIVABLE: point ＋ Week at the copy |
| Peek "Week 2 · Mon, Nov 16 · Open in builder" | The day; the start date | WIRED / DERIVABLE |
| "+5 lb a week on main lifts" | `builder.progression` {amount, unit, kinds} (`workoutDocument.js:347-361`; "＋ Add a progression" `dashBuilder.jsx:2096`) | WIRED |
| "Deload every 4th week" | `progression.deloadEvery` (`workoutDocument.js:356-360`, `:434-440`) | WIRED |
| Chart Back squat 255 → 295, deloads hatched | `applyProgramProgression` per week | DERIVABLE |
| NOW marker at week 6 | Assigned sessions carry `payload.template {id, version, week, day}` (`workoutDocument.js:607`) | DERIVABLE per client (this week's session's `week`). One NOW for five clients holds only if they started together |
| "On it now · week 6 of 12" + 5 gems | `client_workouts` where `payload->template->>id` = this plan, published, this trainer | DERIVABLE. Show each client's own week (Jonah wk 6, Tess wk 1…), not one |
| Update theirs ↗ | Assignment is a snapshot: "later template edits never retro-change them" (`dashBuilderCore.js:33-35`) | **NEW**: re-publish upcoming weeks for clients on an older `template.version`, through `publish_client_week` per week |
| Add clients gems · 2 picked | Assign modal client list (active subs) | WIRED |
| Starts Mon, Nov 9 ▼ | Assign start date (`dashBuilder.jsx:1666`, `:1755`) | WIRED |
| Assign to Sam and Nadia → · "Each gets a copy" | `buildAssignmentRows` → `/api/trainer/workout` | WIRED |

Example-data note: the demo library has Strength Block 3 at **2 weeks** (`builderaudit/21-program-sb3-grid.png`), while the roster shows clients at "Wk 6/12". The mock's 12 weeks follows the roster; the live demo would need a 12-week template.

### 2.3 Meal-plan library (`plans-v2.html`)

| Element | Source | Status |
|---|---|---|
| "Nutritionist · 6 meal plans" | Templates (`dashMealBuilder.jsx:930`) | WIRED |
| "11 of 12 clients are on a plan" | Active subs vs published `client_meal_plans` | DERIVABLE |
| "3 need a new plan by Sun · Nov 8" | `buildPlanLifecycle`: expiring (queue ready) + phase change (50% milestone, or within 3 of goal) (`dashMealCore.js:536-548`; panel `dashMealBuilder.jsx:773-808`) | DERIVABLE: dedupe the two lists (the audit found 9 + 8 overlapping) and close on the check-in week's Sunday |
| Pick per client "Priya → Steady Maintain" | `writePlanFor`: the first template whose phase = the client's (`dashMealBuilder.jsx:916-921`) | WIRED (rule). "Race Week Fuel" can't be picked by phase |
| Reasons "2.8 lb from goal weight", "Race fueling call today", "chose a cut at intake" | Goal now/target; schedule; intake | DERIVABLE |
| Assign all 3 | One template per modal (`DmbAssignModal`) | **NEW**: bulk assign several template→client pairs, each through the compliance gate |
| Type filter Cut 2 · Maintain 1 · Build 1 · **Race 1 · Intake 1** | Phases are only cut / maintain / build (`dashMealCore.js:33-37`, `mealPhaseFacet` `:690-692`) | Cut/Maintain/Build WIRED. **Race and Intake MOCK-ONLY** (or NEW: coach tags, as programs have) |
| Search "or a recipe in them" | Search covers names only (`mealPlanFacts.search`, `:669`) | DERIVABLE: add meal names to the search text |
| Cover "1 week · 2,300 kcal · 160 g protein" | `targets.kcal`, `targets.p`; length = `days.length` "N-day rotation" (`dashMealBuilder.jsx:985`) | WIRED. Say "7-day rotation", not "1 week" |
| "Most used · 5 clients", client gems | Assignments store **no template id**: `payload: { days }`, title = name (`src/app/api/nutritionist/meal-plan/route.ts:90-99`; table `supabase-migrations/2026-06-01-client-plans.sql:41-51`) | **NEW**: store `templateId` and revision on the assignment (DERIVABLE meanwhile by title match, which is fragile) |
| "Eats: Overnight oats, Lemon-herb chicken box, Harissa salmon" | Meal names in the doc | WIRED (names). Kitchen names appear only once Kitchen is wired (2.4) |
| "Vegetarian" sub-label | `planDiet` (`dashMealCore.js:658`) | DERIVABLE |
| Assign · ⋯ | `dashMealBuilder.jsx:988-990` | WIRED |

### 2.4 Meal-plan builder (`meal-builder.html`)

| Element | Source | Status |
|---|---|---|
| "Meal plan · Cut" | `goalPhase` | WIRED |
| "1 week · 4 training + 3 rest days" | Days are a rotation; training days are ticked **at Assign** (`dashMealBuilder.jsx:401`) | DERIVABLE for 7 days; the day types are **NEW** in the template (see Targets) |
| "Summer Cut · 1900" · "Saved · v3" · Preview as client | Name; `version`; autosave (`dashMealBuilder.jsx:636`); `DmbClientPreview` | WIRED |
| **Shape Kitchen · Kitchen 100** | The builder's search is `DashMeals.searchFoods` over **24 FOODS** (`dashMealBuilder.jsx:48`; `dashMealCore.js:55-80`). Kitchen is `SHAPE_KITCHEN_RECIPES`, 100 recipes with kcal, macros, time, diet, tags and art (`mobile-app/src/broadsheet/shapeKitchenData.js:977`) | **NEW**: wire the Kitchen catalog into the builder's search and add-meal |
| Mine 6 | `customFoodsFromTemplates` (`dashMealBuilder.jsx:911`) | WIRED |
| High protein · Vegetarian · Prep < 20 min | Kitchen tags (High protein = 40 recipes ✓), `diet`, `time` | DERIVABLE once Kitchen is wired |
| Recipe row "480 kcal · 38 P · 5 min" | Kitchen `kcal`, `macros.p`, `time` | DERIVABLE (Kitchen) |
| Day header kcal + meter | `dayTotals` vs `targets` | DERIVABLE |
| Low P chip | `checkConstraints` protein floor (`dashMealCore.js:423-430`) | WIRED |
| Under chip | Total vs target | DERIVABLE |
| Meal card art · kcal · P | Kitchen `hero` gradient; meal kcal / p | DERIVABLE (Kitchen) / WIRED |
| ☾ prep the night before | `meal.prepNightBefore`; Shape dishes always (`dashMealCore.js:285-299`) | WIRED |
| ↻ cooked earlier this week | — | DERIVABLE: the same recipe earlier in the week |
| ⇄ approved swaps | `meal.swaps` ≤ 3 (`dashMealCore.js:19-21`) | WIRED |
| ✎ note to client | No per-meal note field in the meal document (`dashMealCore.js:4-21`; the assignment carries `alts` but no note, `:514-520`) | **NEW**: one `meal.note` field, carried into the assignment |
| "27 of 28 meals · 14 recipes" | Slots | DERIVABLE |
| Drop slot "→ 1,710" | — | DERIVABLE |
| Wednesday ring 1,960 / 1,900; 164 / 165 P… | `dayTotals` vs `targets` | DERIVABLE |
| ✓ On target chip | — | DERIVABLE (needs a tolerance rule, e.g. ±5% kcal and protein ≥ floor) |
| **Targets by day type: Train 1,900 · Rest 1,700** | One `targets` set; rest **variants** change meals only (`dashMealCore.js:8-17`); every assigned day carries the same targets (`:510-513`) | **NEW**: `targets.rest` (or per-variant targets) and carry it into assignment |
| "Protein holds at 165 g; rest days drop 45 g carbs" | Same | **NEW** (follows from the above) |
| Groceries: top 3 + "+38 more" | `buildMealAssignment` → `buildGrocery`, coach edits (`dashMealBuilder.jsx:341-386`; `dashMealCore.js:432-528`) | WIRED for library foods. Kitchen ingredients are text ("1 cup", "1/2 cup"), so **NEW** parsing to sum them |
| "scaled to each client in their app" | Per-client portion scale at Assign (`dashMealBuilder.jsx:396`, `:420-426`) | WIRED |
| Assign gems; Assign to Tess → | `DmbAssignModal` (`dashMealBuilder.jsx:393` on) | WIRED |
| Update theirs ↗ | Snapshot, no template id (2.3) | **NEW** |
| "Starts Mon, Nov 9 on Tess's own training days" | Assign ticks training days, **Mon/Wed/Fri by default** (`dashMealBuilder.jsx:401`; `dashMealCore.js:468`). A client's days live in `client_programs.detail.training.days`, from the trainer's Adjust (`BSProAdjust.jsx:363-371`), and in their scheduled sessions | **NEW**: pre-fill the days from those (fall back to the coach's ticks) |

---

## 3. What the Nora mock-ups show, and the work behind them

Files are in `coachmock/`; screenshots are in `coachprop3/` (1440 × 900 @2x, a 1280 check and a dark check).

**One pattern in all three builders:**
- **One Nora card** at the top of the right column. It holds the coach's brief in quotes, then what they changed since, then one gold **To do** for what Nora couldn't do: blank loads, or a day short on protein. Its controls are Edit brief and Undo draft.
- **A source mark on every row or meal**: ✦ for Nora's; a dotted underline (on a row) or a teal ring (on a meal card) where the coach changed it; nothing, or YOU, for the coach's own.
- **The builder's one primary action stays.** That is Assign; there's no new button.
- **What doesn't exist today is labelled "proposed" on the page.**

| File | What it shows | Data behind it |
|---|---|---|
| `builder-start.html` (+ `#nutri`) | **Start with Nora** is the raised, first way in; it holds the brief and the page's one primary (✦ Draft it with Nora). Start blank and Copy one of yours sit beside it. The brief offers only what Nora reads (see 1.2). Three plain lines say what she won't do. | Start blank and Copy are WIRED. Nora from here: day WIRED (route); program **proposed** (route takes `kind: 'program'`, web UI doesn't send it); meal plan **proposed** (today chat only) |
| `workout-builder-nora.html` | Lower Push as Nora drafted it from "…Back squat 4 × 5 at 255". 255 is the only load she wrote, because the brief named it. The coach changed 4 values (RPE 7 → 8; Leg curl 12 → 10; RDL 215 and Split squat 65 typed into blanks), removed her calf raise and added Farmer carry. The selected move shows "7 → 8 · Back to 7". The session figures became one line under the sheet; the volume figure is dropped. | ✦ from the `ai-` row id: DERIVABLE. The change list, the per-cell "Nora wrote 12" and Back to 7: **NEW**. Store the draft on the plan (`detail.draft = { by: 'nora', at, brief, rows }`) and compare by row id, as `pinLoadEdits` does (`workoutDocument.js:514-530`) |
| `program-builder-nora.html` | 12 weeks from one brief, saved **Unpublished** (as Nora saves today). Session cards carry ✦ and "1 edit / 2 edits". Progression shows whose rule is whose: the coach's +5 lb a week "replaces Nora's RPE +0.5 a week, which kept loads flat"; the deload every 4th week is ✦ Nora's. Assign reads "Not on anyone yet"; there's no NOW marker and no Update theirs on a fresh draft. | Nora's RPE climb and deloads: WIRED (`workoutDraft.mjs:352-398`). The load rule: WIRED. Edits: **NEW**, as above |
| `meal-builder-nora.html` | Summer Cut · 1900 from "a cut at 1,900 kcal, 7 days, no shellfish, 35 min prep at most". All 28 meals are Nora's except Monday's dinner (YOU). Three of hers carry the coach's swaps or a note (ringed). To do: Sunday is 15 g under the 145 g protein floor. Assign has Tess picked because the draft named her. | Floor 145 = Cut default 165 − 20 when protein isn't stated (`mealDraft.mjs:96`); exclusions and max prep: WIRED. **Proposed**: Kitchen recipes and rest-day targets (today 24 foods, one target). Edits: **NEW** (meal ids `nora-…` give the ✦) |

**What the mock-ups deliberately leave out.**
- **No Nora box on the library pages.** The owner removed one from the app on 2026-11-04 (#2590). The Nora way in is the New flow plus the masthead ✦.
- **No reading of injuries, goals or logs** in the brief, because Nora doesn't read them.
- **No load progression attributed to Nora.**
- **No Nora "assign"** for meal plans.

**Work to make the mock-ups true, smallest first:**
1. Rename "✦ Draft with AI" to "✦ Draft with Nora" (`dashBuilder.jsx:1584`).
2. Add a daily budget to `/api/ai/draft-workout` and `/api/ai/generate-plan` (a new `AiBudgetKind`, as `draft_program`).
3. Send `kind: 'program'` with weeks and days from the start screen, and open the result in the builder. The route and `expandDraft` already build it.
4. Keep the draft on the plan (`detail.draft`) and derive the change list. This covers both builders and the meal builder (meal ids `nora-…`).
5. Give the app's ＋ New composer the same row-level core, so one brief drafts the same thing on both surfaces.
6. Wire Shape Kitchen into the meal builder, then let `mealDraft.mjs` pick from Kitchen (a slot map from the Breakfast and Snack tags, otherwise lunch or dinner pools) and honour `targets.rest`.
