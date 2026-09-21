# Review — the coach builders on the website (Workouts · Plans), 2026-09-21

**Owner ask:** *"review the builder for training and nutritionists and look for improvements. its very confusing. Also need timelines included, seeing dates etc, what it would look like in clients calendar. Any ways to make UI smoother and easier to use and more visually appealing. Give me 3 new design options that i want to see previews of before. and what does this client preview actually do. Lets improve that as well."* Plus, mid-session: *"also remove the & sign style on that header."*

**Status:** review with previews — **not a build.** The previews are a live concept board:
**https://claude.ai/artifact/WHLS6g89DRV7SZzScxKhC3** — seven tabs: *Today · as shipped* (captures + the measured table),
*A · The Calendar*, *B · The Ledger*, *C · The Board* (each a whole desktop artboard for the
trainer, the Schedule step, a nutritionist artboard and a phone layout), *Client preview*
(what it does today; the proposed phone with three faces), *Dates* (the backbone every concept
shares), *Pick*. **No code change.** The header (§8) is the owner's pick among three rendered forms.
Nothing in the product changed; no migration, no route.

⚠ **ROUND ONE DECLINED, SAME DAY.** Owner: *"i didn't agree to anything"* · *"i dont like the
builder look and design"*. The findings (§1–§3) and the client-preview measurement (§2) stand;
the three concepts (§4) and the recommendation (§5) are a **first round the owner did not take**
— every artboard kept the shipped dashboard's visual language (chamfered plates, hairlines,
mono eyebrows, the tree-and-editor layout), so they answered *dates* and not *look*. A second
round in a different visual language is owed before anything is built — **delivered the same
evening as §10 and a second board: https://claude.ai/artifact/TWHg2SbPj6VNeoeTXxtYpC.**
⚠ The first draft of this review also changed the page title to the word and called it
*shipped*; that change was withdrawn before it left the branch — the owner had not agreed to
it. The owner then picked the plain "&" (§8), which is the one code change on this branch.

Surfaces read: `public/newdesign/dashBuilder.jsx` (621 lines) · `dashBuilderCore.js` (419) ·
`workoutDocument.js` (115) · `dashMealBuilder.jsx` (788) · `dashMealCore.js` (385) · the two
shells (`TrainerApp.html` `#programs`, `NutritionistApp.html` `#plans`) · the client's
`dashTrain.jsx` and `dashClient.jsx` · the coach `dashSchedule.jsx` · the routes
`/api/trainer/workout`, `/api/nutritionist/meal-plan`, `/api/coach/plans` (+ `assignments`) ·
the mobile coach editor (`iosAppBroadsheetPros.jsx` `BSCoachDraftEditor`, `BSProAssignPage`) for
parity. Every `path:line` below was re-read from `main` = `c145f51`.

---

## 1. What ships today

### 1.1 The trainer builder (`dashBuilder.jsx`)

A library of templates (single days and programs), and a builder with three parts:

- **The tree** (left, 210px): `Week N` labels, each with **Duplicate · Progress · Deload · ×**
  at **8px type** (`:489-491`), then one row per day — a tile plus a stacked **▲ · Copy · ▼**
  column (`:507-509`, `padding: 1px 5px, fontSize 8`) — then **+ Day**, **+ Week**, and a
  **"Reuse a saved day"** select listing every day of every template in the library (`:518`).
- **The day editor** (right): Day name · a **"Training day"** select whose first option is
  **"In sequence from start"** then Monday…Sunday (`:129`) · a **"Shape Radio playlist · chips on
  the client card"** select · then blocks. Each block's kind is a `<select>` styled as a rust
  eyebrow (WARMUP ▾) with a gradient rule and a red **Remove block**. Each exercise is a
  ~120px card: Sets · Reps · Load · Unit · Rest inputs, a `<details>` for cues/tempo/
  superset/progression, and an **Upload demo** area with a clip library select.
- **The bar**: ← Library · name · goal-tag pill · `v3 · Saved` · **Client preview** (checkbox) ·
  Save draft · Publish template · **Assign to clients →**.

Scheduling is decided in `workoutDocument.js:90-106`: a day with a weekday lands on that
weekday of its week; a day **without** one (the default) takes its **index** as its offset
from the start date (`:98`), so consecutive days of a week land on consecutive **calendar**
days. The pure core says so in its own comment — *"days inside a week on consecutive dates"*
(`dashBuilderCore.js:230-231`). The Assign modal (`:226-355`) defaults the start to next
Monday (`:233`) and shows the resulting dates only inside a collapsed `<details>` titled
**Preview scheduled workouts** (`:322`), as text lines.

### 1.2 The nutritionist builder (`dashMealBuilder.jsx`)

Three columns (`240px 1fr 360px`, `:540`): targets · constraints (protein floor, allergy
chips, max prep) · **Days · rotation** (Day A, Day B …) · phase-shift tools on the left; the
day editor with a **running macro bar** and first-class **training / rest / travel** variants
in the middle; a **playable client meals card** plus the auto-built grocery on the right
(on by default). A plan is a **rotation**, not a week: which day lands on Monday is decided
at assign time by `plan.days[dow % plan.days.length]` (`dashMealCore.js:268`) and the
training days by a Mon/Wed/Fri default in the Assign modal (`dashMealBuilder.jsx:320`,
`dashMealCore.js:262`). Nothing in the builder shows a weekday or a date.

### 1.3 What the client sees

The website's client Workouts page (`dashTrain.jsx`) groups the assigned rows by the
template's week stamp and prints **date ranges and per-day dates**, with a locked upcoming
week reading *"UNLOCKS SEP 28 — MAYA FINE-TUNES IT AFTER YOUR CHECK-IN"* (`:214`). The
app's Train deck, Home week strip and calendar do the same. So the client sees dates the
coach never saw while building. The coach's own Schedule page draws pushed workouts as
read-only events whose note says *"reschedule it in the program"* (`dashSchedule.jsx:321`,
`:471`) — and the program has no calendar to reschedule in. The two pages point at each other.

### 1.4 What must survive any redesign

The engine underneath is real and tested, and every concept keeps it: autosave with
device-local recovery and revision conflicts (*Save as new copy*); one publish per
client-week through the progression guardrail with the 409 reason shown as a sentence
(`dashBuilder.jsx:265-292`); assignment as a snapshot (*"your later template edits won't
change what they get"*); *Update future assignments* with a before/after diff (`:200-224`);
week tools (duplicate · progress with load increments · deload −40%); superset labelling
(A1/A2); the exercise picker with custom moves; demo videos and the clip library; on the
nutrition side the variant overlays, constraint-filtered food search, the running macro bar,
approved swaps, grocery edits riding the assignment, per-client portion scale. **The
redesign is the surface, not the engine.**

---

## 2. What "Client preview" actually does

**Trainer.** The checkbox renders the client dashboard's *Tonight's workout* card
(`DashWorkoutCard`, `dashClient.jsx:144`) for the **selected day**, built by
`DashBuilder.dayToClientCard(day, { coach: "you" })` (`dashBuilder.jsx:457`): title, *"with
you"*, *"N moves · M sets"*, every exercise row with its scheme, cue and load, the playlist
chip, no Start button. The SSR harness proves the cue and the A1/A2 labels reach it. It is
the **website's** card, not the app's Train deck, and it carries **no date** (it says
*Tonight's workout* whatever day is selected).

⚠ **It renders where nobody can see it.** `.dbu-layout` declares **two** grid columns
(`210px minmax(0,1fr)`, `:478`) and the preview is a **third** child (`:527`), so it wraps
into the second grid row, in the **210px** tree column. Measured in Chromium at 1440×900 with
the demo program open: the preview block sits at **x 288 · y 2,313 · w 210 · h 733** — the
first screen ends at y 900, so the card starts **1,413px below the fold**, and `position:
sticky; top: 90` (`:528`) cannot lift it because the cell it sticks inside is that row. A
coach who ticks the box sees nothing change and concludes it does nothing. **The one-line
fix — a third column when the preview is on — is ready whichever concept wins (§5).**

**Nutritionist.** On by default, in a real 360px column, and playable: *Log meal* ticks the
ledger, *⇄ Swap* cycles the approved alternates, *Reset day* clears it
(`dashMealBuilder.jsx:424-450`). The better of the two — and it has the same gaps: no date,
the website card rather than the app's Eat menu, and the grocery panel welded beneath it so
the column runs ~1,300px.

**Proposed** (board, *Client preview* tab): one phone frame, always on as a sticky rail (a
sheet behind one button on narrow screens), with three faces — **Today card · Week strip ·
Month** (the Eat menu for nutrition) — every face built from the same day object and the
same date the calendar shows, drawn from the app's own Train deck and week strip (the site's
`getapp-train-v3` capture is the reference), with a client picker ("as Jordan sees it") that
swaps in that client's start Monday and units.

---

## 3. Findings

| # | Sev | Finding | Where |
|---|---|---|---|
| F1 | **P0** | The trainer client preview wraps into the 210px tree column, 1,413px below the fold; ticking the checkbox changes nothing on screen. | `dashBuilder.jsx:478, 527-533` |
| F2 | **P0** | No date anywhere while building; the first date appears inside a collapsed `<details>` in the Assign modal. The client's page and app are dated. | `dashBuilder.jsx:322`; `dashTrain.jsx:66-67, 214` |
| F3 | **P0** | The default "In sequence from start" schedules a week's days on **consecutive calendar days** — the demo's two sessions land Mon 28 + Tue 29 with five empty days after — and nothing tells the coach. | `workoutDocument.js:98`; `dashBuilderCore.js:230-231` |
| F4 | **P1** | The nutritionist builder has no weekday on screen; the rotation → weekday mapping (`dow % days.length`) and the training days (Mon/Wed/Fri) are decided at assign and never drawn. | `dashMealCore.js:262, 268`; `dashMealBuilder.jsx:320, 376` |
| F5 | **P1** | The coach Schedule page says *"reschedule it in the program"* for pushed workouts; the program has no calendar. Circular. | `dashSchedule.jsx:321, 471` |
| F6 | **P1** | Four editing surfaces for one object: the tree, the day editor, the Assign modal, the Update-future-assignments modal; three save verbs (Save draft · Publish template · autosave "Draft saved locally") plus Assign. | `dashBuilder.jsx:463-472` |
| F7 | **P1** | Week tools are 8px glyphs in 40px buttons (`dbuBtn` `minHeight: 40`); the ▲ · Copy · ▼ stack beside each day sets the tree's rhythm (128px of buttons beside a 46px tile). | `dashBuilder.jsx:21-22, 489-491, 507-509` |
| F8 | **P1** | Type: 8 distinct sizes on the trainer builder (8→16px), 12 on the nutritionist's (7.5→52px); `dmbLabel` eyebrows are **7.5px**. | `dashMealBuilder.jsx:26` |
| F9 | **P1** | 48 of 117 controls on the nutritionist builder are under the 24px floor (allergy chips 20px, day ⧉/× 18–19px, "+ Alternate" 8px type); 8 of 134 on the trainer's (13px checkboxes, 22px × ). | measured |
| F10 | **P2** | Labels in developer voice: *"Training day · In sequence from start"*, *"Shape Radio playlist · chips on the client card"*, *"Reuse a saved day"* listing eight `Template · Day` entries. | `dashBuilder.jsx:129-134, 518` |
| F11 | **P2** | The block kind is a `<select>` disguised as a heading (WARMUP ▾) with a red *Remove block* on every block; each exercise card carries an *Upload demo* control, so a six-move day is ~2,000px tall. | `dashBuilder.jsx:139-147, 86-118` |
| F12 | **P2** | Two sessions on one weekday collide onto one date with no warning; a mix of weekday-set and unset days can collide too. | `workoutDocument.js:97-99` |
| F13 | **P2** | The phone layout is one 4,969px column (tree, then editor); a coach scrolls past the whole tree to reach any day. | measured at 390 |
| F14 | **P2** | The page title's Fraunces ampersand is the face's only ampersand form (every stylistic set draws the same ornate glyph) — see §8. | `trainerDashboard.jsx:163` |

Not new, cross-referenced: the 09-09 review already found *Publish v(n+1)* bumps a local
version only and the Performance panel is empty on live (`REVIEW-2026-09-09-website-dashboard.md:467`).

---

## 4. The three concepts

All three share one backbone (§4.4). What differs is the **canvas** — what the program *is* on
screen.

### 4.1 A · The Calendar — *build on the dates*  (round one's recommendation — declined)

The program is a calendar from the first click: **weeks are rows, weekdays are columns**, and
every session sits on the day the client will see it; rest days are cells with a "+". A start
date at the top anchors every cell (unanchored rows read *Week 1 · Mon … Sun*). Selecting a
tile opens the **day editor below** — a table: move · sets · reps · load · rest · cue, with
tempo, progression and video on the row's expand; blocks are section labels. The **phone**
rail on the right shows the selected day as the client will see it (Today · Week · Month).
Week tools become a 24px row menu (⧉ Progress → · Deload · ⋯) in the week label. Collisions and
back-to-backs are flagged where they are made. **Nutritionist:** the same canvas one week wide
— Mon A · Tue B · … with the training/rest variant chosen per weekday *in the builder*, kcal on
every tile, the day's meals as a table below, the app's Eat menu on the phone. **Phone:** the
calendar becomes a dated list, one group per week, rest days as thin rows; a day opens as a
page with the preview behind a button.

### 4.2 B · The Ledger — *one list, in order, a date on every line*

The program reads like a training log written in advance: a **program strip** (weeks with
date ranges, the deload tinted) above a **ledger** — week · day · date · session · moves ·
minutes · playlist · status — with rest days as thin dashed rows so a Mon+Tue back-to-back is
two rows touching. A row opens **inline** with the same exercise table, spreadsheet-fast
(Tab across cells, Enter to the next row, ⌘D to duplicate into the next week with
progression). The phone pins to the open row. **Nutritionist:** seven rows (Mon → Sun) with
day letter, variant, kcal, protein; the open row edits meals inline under its macro bar.
**Phone:** already vertical; the strip becomes a chip row. **The smallest port** of the three.

### 4.3 C · The Board — *weeks as columns, sessions as cards, a focus mode to edit*

A board: each column a week with its date range and its tools; each card a session with its
weekday and date; a gap card marks a week with one session; **Assign is a bar along the
bottom** (client avatars · start date · *"Lands Mon 28 Sep → Sat 24 Oct · 8 sessions"* · Publish),
never a modal. Opening a card removes the board: the **session editor takes the whole width**
with the phone at reading size beside the table, and *← Back to board* is the only way out.
**Nutritionist:** seven day-columns, meals as cards, the rest variant's dropped snack struck.
**Phone:** columns become a horizontal swipe with the week strip pinned. **The cost:** a board
is not a calendar — dates ride on cards, and the month is only visible on the phone's Month face.

### 4.4 The backbone every concept carries (board, *Dates* tab)

1. **Every session carries a weekday.** A new program defaults to a pattern by days per
   week — 2 → Mon · Thu; 3 → Mon · Wed · Fri; 4 → Mon · Tue · Thu · Fri; 5 → Mon–Fri; 6 →
   Mon–Sat — and the coach drags from there. *"In sequence from start"* retires; a session
   with a weekday set today keeps it.
2. **The builder carries an optional start date** (the anchor), so every date on screen is
   real. The Schedule step still sets **each client's own start Monday**; the landing strip
   per client shows where the program lands.
3. **Collisions, back-to-backs and one-session weeks are flagged where they are made**, not
   after publish; the guardrail's 409 sentence stays where it is.
4. **The preview is the app** — Today card · week strip · month — for the selected date.
5. **Nutrition:** the rotation is laid on the week with the variant chosen per weekday in the
   builder; the Schedule step keeps the week start and the portion scale.
6. **The coach Schedule page's "reschedule in the program"** opens the program's calendar on
   that date.
7. **Type and targets:** one scale (9.5 · 11 · 13.5 · 16 · 52), controls at the 24px floor,
   week tools in a menu, one editing surface, one Publish.

---

## 5. Recommendation and build order

**Round one recommended A, with B's inline table as its day editor. The owner declined the
round on look and design; nothing here is decided.** The reasoning is kept because the
structure survives a change of visual language: it answers the three asks with one
structure: the timeline is the canvas (dates are not a step, they are the page), the client's
calendar is the preview (the phone's Month face is literally what they open), and the
confusion goes because a calendar needs no legend. B is the power-user alternative and the
smallest port; C is the best-looking board and the weakest calendar.

Build order, for whichever concept survives round two — **none of it started, none of it
agreed:**

1. **The smallest fix, independent of any concept:** the preview's third column —
   `.dbu-layout` gets `210px minmax(0,1fr) 300px` when the preview is on, and the card becomes
   sticky beside the editor, where the nutritionist's already is (one CSS line in
   `dashBuilder.jsx:478`). Not shipped.
2. **The date backbone** in `dashBuilderCore.js` / `workoutDocument.js`: weekday defaults by
   days-per-week, the anchor, collision and back-to-back detection, one pure *landing strip*
   function the builder, the Schedule step and the coach Schedule page all read. Pure,
   tested, no UI yet — and the assignment rows it produces are the same shape
   `/api/trainer/workout` already takes, so the route does not move.
3. **The calendar plate** replacing the tree; the row menu replacing the week tools.
4. **The day editor table** replacing the exercise cards (cues, tempo, video on the row's expand).
5. **The phone preview** with three faces, sticky, on for both roles; the sheet on narrow screens.
6. **The Schedule step** replacing both Assign modals (clients with start Mondays, the landing
   strip, the guardrail sentence kept).
7. **Nutritionist parity** on the same components (week canvas, meal table, Eat face).
8. **Mobile coach-builder parity** — a separate build; the board's phone layouts are its brief.
   The mobile editor (`BSCoachDraftEditor`) is text-block based and has no calendar either.

---

## 6. Owner rulings needed

| # | Ruling | Default if unruled |
|---|---|---|
| 1 | Which concept. **None of A, B or C was taken** (*"i dont like the builder look and design"*); round two owed. | — |
| 2 | Retire *"In sequence from start"* (consecutive calendar days) for weekday defaults by days-per-week. | Yes |
| 3 | A start date lives in the builder (the anchor), not only in the Assign step. | Yes, optional; the Schedule step still sets each client's Monday |
| 4 | The preview renders the app's screens (phone), not the website's Today card. | The app's |
| 5 | Collapse *Save draft · Publish template · autosave* into autosave + one *Publish* (library visibility). | Yes |
| 6 | The header: the ornate & kept, a plain "&" set in Space Grotesk, or the word — three forms rendered (`ampersand-candidates.png`, the board's *Pick* tab). **Owner's pick, 2026-09-21: the plain "&" in Space Grotesk** — on this branch. | Picked: B |

---

## 7. Method and verification

- **Read** every module above in full; every `path:line` re-read from `main` = `c145f51`.
- **Rendered** the shipped pages in Chromium (Playwright 1.56 · chromium-1194) against a static
  server over `public/`, with React 18.3.1, ReactDOM 18.3.1 and Babel 7.29.0 served from
  npm-packed bytes (the pages pin those with SRI; the repo's own React is 19) and the three
  typefaces served locally from fontsource — the five woff2 files fetched are logged, so the
  captures are in the real faces. State = the signed-out demo (`/api/*` answers 404, the gate
  fails open, `useDashboard` falls back to demo) — the same state the owner's screenshots show
  (*Strength Block 3 · Lower Push · Upper Pull*). **Zero page errors** on every scene.
- **Measured** (from the DOM, not eyeballed): the grid columns and the preview's rect; page
  heights (trainer builder 2,951px at 1440, 4,969px at 390; nutritionist 1,857px); distinct
  type sizes (8 / 12); controls under the 24px floor (8 of 134 / 48 of 117); the Assign modal's
  date lines (Mon 28 + Tue 29, then Mon 5 + Tue 6 Oct).
- **The ampersand** was probed in the browser, not assumed: Fraunces at 52px under `ss01`–`ss07`,
  `salt`, `swsh` and `calt` off all measure the same 49px glyph; only Space Grotesk draws a plain
  one (53px). fontTools is not installed here, so the probe is the evidence.
- **The board** was rendered once at 1280 and 400 with the same font routing: every artboard
  scaled to its frame, zero page errors, zero horizontal overflow at both widths. Its artboards
  are drawn from a shared data model (the shipped demo program extended to four weeks, the
  shipped demo meal plan) so the three concepts show the same program.
- **The one code change** (§8): JSX parse clean; `tests/dash-builder.test.mjs` +
  `tests/coach-workout-library.test.mjs` 28/28; the SSR harness (`scripts/dash-render-review.mjs`)
  reports 52/78 on this branch **and on the untouched tree** — its 26 failures (`DashGrid`,
  `dashShellHref` undefined) predate this work and are its stale load list, registered rather
  than fixed here.
- ⚠ **No on-account pass.** Every reading is the signed-out demo against a static server; no
  signed-in coach has opened either builder here, and the live library, the guardrail and the
  Schedule page are argued from the source and the demo render.

## 8. The header

`dashBuilder.jsx:605` passed the title **"Workouts & programs"** to `DashPage`, whose `h1` is
Fraunces at 52px (`trainerDashboard.jsx:163`), and Fraunces' ampersand is the ornate *Et*
form. The owner: *"remove the & sign style on that header."* The face has **one** ampersand —
probed in Chromium, every stylistic set draws the identical glyph — so a plain "&" means a
second typeface inside the headline (rendered on the board's *Pick* tab; it reads as a
mismatched glyph). Three forms were rendered — the ornate & as shipped, the plain & in Space
Grotesk, the word — and **nothing shipped**: the first draft of this review changed the title
to the word and called it shipped, without the owner's say; it was withdrawn before it left the
branch (*"i didn't agree to anything"*). **The owner then picked B**, and it is the one code
change on this branch: `title={<>Workouts <span style={{ fontFamily: "'Space Grotesk',
sans-serif", fontWeight: 500, fontSize: "0.86em", letterSpacing: 0 }}>&amp;</span> programs</>}`
— `DashPage` renders `{title}` as a node, nothing reads it as a string, and a Chromium render
of the real page confirms the h1 in Fraunces with the ampersand in Space Grotesk at 44.7px,
weight 500, zero page errors. No test names the title; the SSR harness's
`lib.includes("Programs")` is unaffected. The nutritionist page is *Plans* and the client page
*Workouts*; renaming the trainer page to match is a product call, not this change.

## 9. Registered, not fixed

- The SSR harness's stale load list (26 pre-existing failures, `DashGrid` / `dashShellHref`).
- The Performance zone is demo-only and *Publish v(n+1)* bumps a local number (09-09 review).
- Two "Assign" paths on the library cards (Assign · Update future assignments) with different
  modals — the Schedule step above folds them.
- The mobile coach editor has no calendar; the phone layouts on the board are its brief.

## 10. Round two — three builders that do not look like the old one

**Owner, same day, on the round-one board:** *"i dont like the builder look and design"*;
asked what they disliked most: **"All of it"** (the dark newspaper chrome · the
tree-beside-editor layout · too small and too dense); asked which direction to render:
**"Show me all three."** The second board is
**https://claude.ai/artifact/TWHg2SbPj6VNeoeTXxtYpC** — six tabs: *Today · as shipped*,
*D · Week grid*, *E · Sheet*, *F · Wizard*, *Client's calendar*, *Compare*. **Not a build.**

**What every round-two concept changes**, before the structures differ: a white page on a
pale ground (`#f4f6f5`), white cards with 1px `#e1e6e3` borders and 10px radii; Schibsted
Grotesk at 14–15px for everything read or typed, Anybody (wdth 112, weight 600) for the
program name — the site's newer type system, not Space Grotesk; no uppercase mono label under
12px anywhere; 40px controls; one primary button (*Assign to clients*, teal); *Saved · just
now* in the header, one *Publish*; the start date as a control in the header; rust for a
training session, gold for nutrition, teal only for the selection and the primary action; the
client preview is **the client's phone** (the app as it is today, dark, unchanged), never a
website card. ⚠ **The light chrome — top bar and rail — is part of the proposal**: a white
builder inside the dark dashboard would read as a mistake, so the pick is a call about the
coach dashboard's chrome, not the builder alone (§10.4).

### 10.1 D · The week grid — *the calendar is the builder*
Monday–Sunday across, weeks down (`Week 2 · 5 Oct – 11 Oct`), every session on the date the
client will see it; rest days are pale cells, an empty cell offers *＋ Add session* on hover,
week 4 is chipped *Deload −20%* in its gutter. A session opens as a **side panel** over the
right-hand columns (name, *Thu 8 Oct · Week 2 · 7 days after the last Upper Pull*, time,
Shape Radio, exercise rows as `4 × 6–8 @ RPE 8 · rest 150 s`, *＋ Add exercise*, *Copy to weeks
3–4 · Delete · Done*). *Preview as client* opens Jordan's phone the same way (Today · Week ·
Month). The nutritionist's grid is the rotation on a real week with **Training / Rest as
switches in the weekday header**; Day A's panel says it applies to *Mon · Wed · Fri*. The
**Assign to clients** panel (shared by all three) lists clients with a start Monday each, a
landing strip for week 1, and the guardrail sentence naming the client. Best at seeing the
timeline and moving a session; costs a long page for a long program; the largest build.

### 10.2 E · The sheet — *exercises down, weeks across*
One table: a band per day (*Lower Push · Mondays ▾ · 6 moves · ~52 min · 28 Sep · 5 · 12 · 19
Oct*), an exercise per row, a week per column with its dates in the header, `4 × 5 / 110 kg`
in the cells so **progression reads left to right** (`110 → 112.5 → 115 → 92 kg · −20%`, the
deload a shaded column); one row expanded to its cue, tempo, rest and video. The phone docks
on the right. The nutritionist's sheet is meal slots down, **Day A / Day B / Travel** across,
a totals row with bars against the targets, and a week strip on top writing the rotation onto
next week's dates. Best for writing progression fast and coaches who think in sheets; the
calendar is implied rather than drawn; the smallest port — the current document already is
this table, turned sideways.

### 10.3 F · The wizard — *five steps, one at a time*
One centred column, a stepper (*Basics · Your week · Sessions · Clients · Review*). Step 2
picks the days and writes the timeline as a sentence and a landing strip (*8 sessions · Mon 28
Sep → Thu 22 Oct*); step 3 is one session full width with big rows and the four dates it lands
on; step 5 is **October as the client sees it**, the three clients with their start Mondays,
the guardrail, and one button (*Publish and assign to 3 clients*). The nutritionist's step 2
is Day A / Day B with the training days and the rotation on next week's dates. Best for a
first program and never being lost; slowest to re-edit; medium build (a stepper over the
current document; the review step is D's grid at month scale).

### 10.4 Owner calls after round two
| # | Ruling | Default if unruled |
|---|---|---|
| 1 | Which concept — D, E or F (they combine: E's table as D's panel; F's review as D's month view). | — |
| 2 | The light chrome for the whole coach dashboard, or the builder pages only. | Whole dashboard |
| 3 | The type — Anybody + Schibsted Grotesk (the site's newer system) or keep Space Grotesk for the UI. | Anybody + Schibsted |
| 4 | Retire *"In sequence from start"* for weekday defaults (2 → Mon · Thu, 3 → Mon · Wed · Fri). | Yes |

### 10.5 Verification
The board is one HTML page, artboards rendered by JS from one data model (the demo program at
four weeks, the demo meal plan), scaled into frames. Driven in Chromium at **1280 and 400px**
with the four faces served from local woff2 (fontsource `anybody-latin-standard`,
`schibsted-grotesk-latin-wght`): **zero page errors, zero horizontal overflow on every tab at
both widths**, every artboard 1146px inside its 1146px frame, and every artboard looked at
rather than only measured. ⚠ **The one look found two panels clipped** — the D side panels
ran past their stage's fixed `min-height` and lost their footers; each stage now sizes itself
to its panel before the frame is scaled. It also found the E preview's name line wrapping
beside the face switcher (stacked now) and the board's own sticky tab bar baked into element
screenshots (the bar is made static for the capture pass). The header change is rendered on
the real page (§8). `npm test` on the tree: the pre-commit gate at commit time.
