# Self-serve training — build your own week, program & race schedule

**Date:** 2026-07-08 · **Status:** Spec for owner review (build follows approval)

## The problem

A member with no coach has **no workout to log and no way to author one**. Train
shows the honest-but-dead "No workout assigned" week (`bsEmptyTrainProgram`),
the home hero has nothing to feature, and the only authoring tools in the app
are coach-side. Even a member who **buys** a coach's plan from the marketplace
gets it filed in their Library — nothing ever schedules it. Meanwhile the whole
downstream pipeline (live session player, +10 `award_workout_session`, session
details, workout auto-share #1613) is built and waiting for input.

This closes the coach-less P0 from the 2026-07-08 solo-member analysis.
Self-serve is the floor; coaching stays the pitch — the "Find a trainer" bar
keeps its pinned spot at the top of Train.

## Owner-ratified scope (v1 — all four, plus three amendments)

1. **Starter templates** — one-tap classic sessions AND multi-week programs.
2. **Custom builder** — sessions and full schedules, any discipline: strength,
   running (incl. **marathon/half/10K blocks**), **triathlon**, **Hyrox**,
   conditioning, hybrid. *(Owner amendment 1.)*
3. **Open "log as you go" session** — start empty, add moves at the gym.
4. **Start purchased plans** — schedule a bought marketplace plan onto the week.

Amendment 2: **the member chooses the duration** — every program (template or
custom) takes a member-set length (weeks stepper or race date); template
lengths are defaults, never fixed. Amendment 3 (owner): **AI assist** — an
optional "✦ Draft it for me" that generates a full draft schedule from a goal
prompt, always landing in the builder for review before anything is saved.

## Foundation — self-authored rows in `client_workouts` (Approach A)

One idempotent migration; every downstream reader lights up unchanged.

- **Migration `2026-07-08-self-authored-workouts.sql`** (owner runs it):
  - `client_workouts.trainer_id` → **nullable** (self rows carry NULL; every
    existing coach row keeps its id).
  - **Client self-CRUD policies**: INSERT/UPDATE/DELETE allowed where
    `trainer_id IS NULL AND client_id = auth.uid()` (each `with check` pins
    both, so a client can never create/claim a coach row or move a row to
    another member). The existing coach policies remain scoped to owned
    `trainer_id` rows — coach rows are untouchable by clients and self rows
    untouchable by coaches, in both directions. Client SELECT policy already
    covers self rows (`client_id = auth.uid()`).
  - Existing `client_workouts_set_updated_at` trigger applies as-is.
- **`/api/client/plan`**: pass through two payload fields — `repeatDow`
  (int[] 0=Mon..6=Sun) and per-exercise `seg` (free segment descriptor, e.g.
  `"10 mi · Z2"` / `"400m sled push"`). Also return `selfAuthored:
  trainer_id === null` per workout. No new routes for the core.
- **Writer**: `window.ShapeSelfTraining` in `shapeBackend.js` — direct
  RLS-scoped Supabase CRUD (`kind:'custom'`, `status:'published'`,
  `trainer_id:null`), mirroring how the coach app writes assignments.

## Authoring model — two shapes, one table

- **Weekly session** (repeats until changed): ONE row, no `scheduled_date`,
  `payload.repeatDow:[0,3]` → "Push Day, every Mon + Thu". Edit/delete = one
  row. `bsBuildTrainProgram` gains a repeat-slotting step (slot `repeatDow`
  workouts onto their weekdays each week, after dated rows claim their days,
  before the legacy unscheduled fill).
- **Program / schedule** (progressive block): dated rows materialized across
  the member-chosen length, `payload.program:{id,name,week,day,weeks}` stamped
  so the deck + calendar can label "Marathon block · W6 D3". Marathon long-run
  progressions live here — each day is its own editable row, so "bump
  Saturday's long run" is a normal edit. Materialization is client-side (the
  same pattern the coach Assign flow uses), capped at 160 rows per program
  (26 weeks × 6 days fits; the builder clamps weeks to 1–26 and guards the
  product).

## The builder — `BSWorkoutBuilder` (client module, full-page quiet form)

Open Ledger form grammar (two-tier rule: forms stay quiet — `.bs-uline`
fields, typographic indexes, one solid-teal CTA).

- **Entry points**: the Train empty state becomes the **"Build your week."**
  door (template shelves + BUILD YOUR OWN → + ✦ Draft it for me); once a week
  exists, a `＋` text-action rides the week-strip row. Home's empty training
  slate row deep-links to the same door.
- **Mode index**: `SESSION` (weekly-repeat) / `PROGRAM` (multi-week schedule).
- **Session fields**: name · discipline chips (Strength / Run / Ride / Swim /
  Row / Conditioning / Hybrid — sets the default row type + deck tag) ·
  weekday toggles · optional time · move rows.
- **Move rows carry two row types, mixable in one workout**:
  - **Lift** — name + sets × reps + load (the existing exercise shape).
  - **Segment** — name + distance-or-duration + optional pace/zone/effort →
    stored on `seg` ("45 min · Z2", "1K run", "50m sled push · 152 lb").
  A Hyrox sim or a brick day is just a workout whose rows mix both. Move
  names: pick from the starter move catalog (seeded from `BS_MOVE_SWAPS` +
  template moves) or free-type — same free-text tolerance the coach builder
  has.
- **Program fields**: name · discipline · **length in weeks (stepper, owner
  amendment: always member-adjustable)** OR **race date** (weeks derive from
  today→race; if shorter than a template's default the early weeks trim, never
  the taper) · days-per-week pattern (the weekly pattern editor) · then a
  **week-by-week review list** (W1..Wn, expandable) where any day can be
  tweaked before saving. Saving materializes the dated rows.
- **Editing**: tapping a self-authored day on the Train deck offers
  `EDIT · YOURS` (reopens the builder on that row) alongside the existing
  swap/preview; coach days are unchanged. Deleting a program offers "this day"
  vs "the whole block" (delete by `payload.program.id`).

## AI assist — "✦ Draft it for me" (owner amendment 3)

- In the builder door + inside PROGRAM mode: a prompt sheet — goal free-text
  ("first marathon Oct 12", "Hyrox in 10 weeks, ski erg is weak"), days/week,
  experience chips, duration prefilled from the length/race-date controls.
- **New `POST /api/ai/draft-program`** (rides the existing `/api/ai` proxy
  membership gate + OpenAI plumbing): returns a STRUCTURED draft — the exact
  program shape the builder edits (weeks → days → typed rows) — never prose.
  Server-side schema validation; length clamped to the member's requested
  weeks; row cap enforced.
- **Human-in-the-loop, house rule**: the draft always lands in the builder's
  week-by-week review — nothing writes until the member saves. Same
  preview→confirm posture as Nora's proposal cards; no audit-log entry needed
  since the write is the member's own normal save.
- Failure degrades honestly: model down → "Drafting is unavailable — build
  manually or try again"; never a silently-empty program.

## Starter catalog — pure data module `mobile-app/src/services/starterTemplates.mjs`

Two shelves (unit-tested shape validation; all durations are defaults, every
one adjustable at pick time):

- **Sessions**: Push · Pull · Legs · Upper · Lower · Full-body · Conditioning
  (EMOM/intervals) · Easy run (Z2) · Tempo run. Picking one prefills a
  SESSION in the builder.
- **Programs**: Marathon **16wk** · Half-marathon **12wk** · 10K **8wk** ·
  Triathlon sprint **12wk** · **Hyrox 8wk** · Strength block 8wk (LP). Real
  progressive content (long runs build ~10%/wk with cutback weeks, 2–3wk
  taper; Hyrox alternates station work + compromised running; tri rotates
  swim/bike/run + one brick). Picking one prefills a PROGRAM (length/race-date
  adjustable) → week-by-week review → save.

## Open session — log as you go

- "Start an open session" text-action on the Train deck (any day, program or
  none). Launches `BSSession` with `moves:[]` + a new **＋ Add move** row in
  the player (name from catalog/free-type; defaults 1 set; "＋ Add set"
  already exists). Title "Open session"; segments allowed.
- Saves through `saveWorkoutSessionLog` verbatim → same +10 award, session-id
  idempotency, cross-source dedup, auto-share. Zero pipeline changes.

## Start a purchased plan

- Library → an owned plan (`get_my_purchased_plans` already returns `detail`)
  gets **START THIS PLAN →**: start-Monday picker (+ weeks override when the
  outline is week-based), parses the outline with the `bsAssign*` parsers
  **extracted from `iosAppBroadsheetPros.jsx` into a shared module**
  (`mobile-app/src/services/planOutline.mjs`, unit-tested; pros app imports it
  back — one implementation), materializes dated self rows stamped
  `payload.program:{id:'plan:'+planId,…}`. Re-starting the same plan replaces
  its previous block (delete by program id first) — never duplicates.

## Coach interplay + guardrails

- A coach-assigned workout **wins the day slot** on the deck; the self workout
  for that day stays accessible under it (secondary row, `YOURS` tag). Getting
  a coach never deletes self-programming; the member retires it themselves.
- Self days show honest attribution — the deck byline reads **"Programmed by
  you"** (or "Marathon block · W6") — never a fabricated coach credit; the
  hardcoded "Jordan Chen" coach line renders only for demo/coach content.
- Coaches do NOT see self-authored plans in v1 — their `client_workouts` read
  is scoped to rows they authored, and this spec leaves that as-is. A coach
  still sees the member's training through the session LOGS they already read.
  (A coach read of self plans is a follow-up if coaches want it.)
- Signed-out preview: unchanged demo program; the builder door is a locked
  "Join Shape" affordance (existing gate pattern). Membership gates the AI
  route by prefix already.

## Out of scope (v1)

- Meal-plan self-authoring (Eat has its own follow-up path).
- A progression DSL / auto-periodization beyond the AI draft + templates.
- Coach visibility into self-authored plans; website parity for the builder
  (mobile-first, same as every wave; website reads nothing new).
- Editing PURCHASED plan content itself (you edit your materialized copy).

## Acceptance criteria

1. Signed-in, no coach: Train's empty week shows the "Build your week." door;
   picking **Push Day** template → it appears on chosen weekdays, repeats next
   week, home hero features it, live session starts it, +10 awards once/day,
   auto-share posts by the member's privacy rule.
2. Custom PROGRAM: a 16-week marathon (or any member-chosen length 1–26wk /
   race date) materializes dated days; W6's Saturday long run is editable in
   place; deleting the block removes only its rows.
3. Hyrox/triathlon/hybrid: one workout mixes lift rows + segment rows; the
   deck, preview, and live player render both; segments default 1 set.
4. ✦ Draft it for me returns a structured draft into the week-by-week review;
   nothing persists until save; model failure shows the honest fallback.
5. Open session: start empty → add moves mid-session → save logs/awards/shares
   exactly like a planned session.
6. A purchased plan starts onto the calendar from the Library; re-start
   replaces, never duplicates.
7. RLS: a client cannot write any row with a non-null `trainer_id` (or another
   member's `client_id`); a coach cannot touch `trainer_id IS NULL` rows.
   Coach-assigned weeks render exactly as before the migration.
8. Signed-out preview is byte-identical to today except the locked builder
   door.
