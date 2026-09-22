# Build brief — the coach builders as Grid ⇄ Sheet, on a light paper with a switch to the dark one

**Status:** brief only — **nothing here is built.** Written 2026-09-21 against `main` = `0e63de1`;
every `path:line` below was printed from that tree, not remembered. The design is the round-two
concept board, tab **G**: https://claude.ai/artifact/TWHg2SbPj6VNeoeTXxtYpC · the review is
[`REVIEW-2026-09-21-coach-builders.md`](REVIEW-2026-09-21-coach-builders.md) (§10.6 for G, §11
for the colour system).

**Owner rulings, 2026-09-21, verbatim:** *"i like the toggle for both options. looks god"* ·
*"use the designs but keep the same colors currently on website"* · *"but i like the look of the
white and what you already built"* · *"so maybe use that for now, but create the option to change
back to the dark tones"*. Read together: **G is the builder; the light paper is the default for
now; the website's current dark colours stay available as a switch, exactly as they are today.**

**Defaults taken so the build can start, each one line to reverse** (§7): the Grid opens first ·
Anybody + Schibsted Grotesk on the dashboards · *"In sequence from start"* retired for weekday
defaults · the switch applies to all three dashboards (coach ×2, client) and never to the marketing
pages · the app's 18 papers and 9 accents are a later step · the client preview is the client's
**website** surface.

---

## 1. What exists, and what each PR keeps

**The document is untouched.** A trainer template is `coach_plans.detail.builder` — `weeks[]` →
`days[]` → `blocks[]` → `rows[]` — persisted by autosave to `/api/coach/plans`
(`public/newdesign/dashBuilder.jsx:393`) and snapshotted per client into `client_workouts` by
`/api/trainer/workout` (`:271`). A nutritionist template is `detail.mealBuilder`, autosaved the
same way (`dashMealBuilder.jsx:465-476`) and published through `/api/nutritionist/meal-plan`
(`:342`). Neither route changes. No migration.

**A day already has a weekday.** `day.weekday` is an integer 0–6, Monday-based;
`builderToAssignmentRows` places a day with one on that weekday of its week and a day without
one at its **index** from the start date (`public/newdesign/workoutDocument.js:90-106`). The
concept's *Mondays ▾ / Thursdays ▾* is that field with a control on it; what changes is the
**default** (§4).

**The dashboard has no colour system.** `dash.css` declares no custom properties; the dashboard
modules, the two navs, `trainerDashboard.jsx`, `pageShell.jsx`, `dashboardLayout.mjs` and
`dash.css` carry **1,108 colour literals, 206 distinct values** (measured on `0e63de1`).
⚠ **CORRECTED while building PR 1 — this read 1,129 / 217**, a count taken with
`#[0-9a-fA-F]{3,8}` which also matches a **PR reference in prose**: 21 of those "literals" are
`#2137`, `#2046`, `#2069` and friends. A valid CSS hex is 3, 6 or 8 digits, and the corrected
pattern is what the sweep and its guard both use. The
ink family alone — `rgba(242,237,228, α)` at some twenty-five alphas plus `#f2ede4` — is over
half of them; `#2ee0c4` (accent) 69, `#d8a23a` (gold) 38, `#e0644b` / `#c0533b` (rust) 35,
`#7bbf5a` (green) 18, `#1a1612` / `#14110e` / `#06231f` (grounds) 45. The switch is therefore a
**token layer first** (§2), then the builder on top of it.

**The pieces the new views reuse rather than rewrite:** `DbuDayEditor` (`dashBuilder.jsx:117`,
the blocks-and-rows editor — it becomes the Grid's side panel), `DbuFutureUpdates` (`:200`),
`DbuPerformance` (`:543`), the exercise picker (`:62`), `applyProgression` / `deloadWeek`
(`dashBuilderCore.js:158`, `:180`), `dayToClientCard` (`:196`), `buildAssignmentRows` (`:236`),
`groupAssignmentWeeks` (`:391`); on the nutrition side `resolveDay` (`dashMealCore.js:114`),
`mealsTotals` (`:165`), `buildMealAssignment` (`:259`, which already takes `trainingDows`),
`buildPlanLifecycle` (`:326`), and `DmbDayEditor` (`dashMealBuilder.jsx:142`). The per-account
memory is `useRememberedChoices` / `useRememberedChoice` (`dashData.jsx:877`, `:894`) over
`user_goals('dashboard_prefs')`.

---

## 2. PR 1–3 · the token layer and the two papers (visual no-op until the flip)

### 2.1 The tokens
Defined once in `public/newdesign/dash.css` (loaded by all 34 dashboard pages, in `<head>`,
before any script — `TrainerApp.html:17`) on `:root`, with the **dark** values being today's
exact literals:

```
--sh-ground:#1a1612  --sh-ground2:#14110e  --sh-deep:#06231f
--sh-ink:#f2ede4     --sh-ink-rgb:242,237,228
--sh-accent:#2ee0c4  --sh-accent2:#0ac5a8   --sh-gold:#d8a23a
--sh-rust:#e0644b    --sh-rust2:#c0533b     --sh-green:#7bbf5a
--sh-shadow:rgba(0,0,0,.5)   --sh-nav-ink:rgba(245,239,225,.78)
```
and the **light** values under `html[data-paper="light"]`, taken from the board's own artboard
palette (`.ab2` in the concept board): ground `#f4f6f5`, card `#ffffff`, ink `#15211e`
(`21,33,30`), ink2 `#5a6763`, ink3 `#8a9490`, line `#e1e6e3`, line2 `#c9d2ce`, accent `#0a8f87`
with tint `#e2f2f0`, rust `#c0533b` / `#fbeae5`, gold `#a07a2e` / `#f7eed8`, rest `#edf0ee`.
Every alpha-of-ink literal becomes `rgba(var(--sh-ink-rgb, 242,237,228), α)`; every named
literal becomes `var(--sh-accent, #2ee0c4)` and so on — **always with today's value as the
fallback**, so a page that has not loaded the tokens (the 35 marketing pages that render
`pageShell.jsx`'s header) is byte-identical to today.

### 2.2 The sweep, staged so each PR is provable
Four PRs, each a **visual no-op proven by pixel diff** (§8): (1) the chrome — `dash.css`,
`pageShell.jsx`'s style template (`:1298-1483`, 68 hex literals), `trainerDashboard.jsx`,
`coachNav.jsx`, `clientNav.jsx`, `dashGrid.jsx`; (2) Today · Week · Schedule · Roster · Client ·
client detail; (3) Business · Goals · Progress · Train · Nutri · profile extras · the two Settings
pages; (4) the two builders and Playlists. A literal used **outside CSS** — a canvas `fillStyle`,
an SVG attribute written by script — cannot take `var()` and reads the token through
`getComputedStyle(document.documentElement).getPropertyValue(...)` at draw time; the pixel diff
is what catches one that was missed (a canvas handed `var(--…)` draws nothing).

### 2.3 The switch
- **State:** `dashboard_prefs.paper ∈ {light, dark}` through
  `useRememberedChoice(store, "paper", ["light","dark"], "light")` — per account, validated,
  the default deleted from the document rather than stored (that hook's own rules,
  `dashData.jsx:894` onward). The signed-out preview keeps it for the session only, like every
  other remembered control.
- **First paint:** an inline `<script>` in each shell's `<head>` (`TrainerApp.html`,
  `NutritionistApp.html`, `ClientApp.html`, all at `:20` for `<body>`) reads a device mirror
  `localStorage["shape.web.paper"]` and stamps `document.documentElement.dataset.paper` before
  the stylesheet applies — no flash from light to dark on a reload. The hook writes the mirror on
  every change and on the cloud read.
- **Control:** an *Appearance · Light · Dark* segmented control in `CoachSettingsPage`
  (`coachSettings.jsx:152`) and `ClientMeSettings` (`clientMeSettings.jsx:233`), applying
  instantly. One place, not a header widget.
- **Default:** `light`. The flip is its own PR (the fifth), after the four sweeps are merged, and
  is one line: the fallback value in the hook.
- **Scope:** only pages that load `dash.css` ever stamp `data-paper`. Marketing pages never do,
  so their header keeps the fallback values. The client dashboard is included: it shares the
  chrome and the modules, and a member who wants the dark website has the switch.

---

## 3. PR 6 · the trainer builder, Sheet view first (E)

`dashBuilder.jsx` is restructured, keeping `DbuBuilder`'s state, autosave and routes:

- **`DbuHeader`** — the program name (Anybody), the goal-tag chip, **Starts ▾** (the reference
  Monday the dates on the page are drawn for, default next Monday, held in
  `detail.builder.previewStart`; **each client's real start is chosen at assign**, §5), the
  summary chip (weeks · weekdays · sessions · last date, derived), `Saved · just now` from the
  autosave state, the **Preview as client** toggle (§5), **Publish** (library visibility), and the
  one primary button **Assign to clients**. *Save draft* and *Publish template* (`:471-472`)
  collapse into autosave + Publish.
- **`DbuToolbar`** — the view switch (§4; Sheet only until PR 7 lands, so the control renders
  with one option disabled and a title), *Progression +N kg / week on main lifts ▾* (reads and
  writes what `applyProgression` applies), *Show sets × reps · load ▾*, and **＋ Week**.
- **`DbuSheet`** — one table: a header row of weeks with their dates (from the reference start)
  and a *Deload −20%* chip from `week.deload`; a **band** per day carrying the day name, its
  weekday chip (`day.weekday`), moves · minutes · playlist, and the four dates it lands on; a row
  per exercise with block kind and tempo under the name; a cell per week showing `sets × reps`
  over the load, the deload column shaded; one expanded row at a time for cue · rest · tempo ·
  video (the fields `DbuRow` edits at `:76`); **＋ Add exercise to <day>** and **＋ Add a day**
  rows. Cells edit inline; the week-over-week load is what `applyProgression` produced, editable
  per cell.
- **The nutritionist's Sheet** (`DmbBuilder`, PR 8): meal slots down, **day types** across (base
  day and its `variants` from `resolveDay`), totals against the targets in the last row from
  `mealsTotals`, and the week strip on top showing which real dates take which day type.

## 4. PR 7 · the Grid view (D) and the switch

- **`DbuGrid`** — Mon–Sun across, weeks down; each cell is the day whose `weekday` matches, drawn
  as a session card (name · moves · minutes · playlist) with its date; an empty cell is *Rest*
  and, on hover, **＋ Add session** (a `newDay` with that weekday); the gutter carries *Week N*,
  its dates and the deload chip. Clicking a card opens **`DbuDayEditor`** in a 400px side panel
  (the editor as it is, restyled to the tokens) with a *when* line (date · week · days since the
  same day last week · the progression delta) and a footer: **Edit all 4 weeks in the sheet**
  (switches view and expands that band) · Delete · Done. Drag a card to another cell = set
  `day.weekday`.
- **The switch** — `useRememberedChoice(store, "builderView:trainer", ["grid","sheet"], "grid")`
  and `builderView:nutritionist` for `Week` ⇄ `Day types`. Per role, because one auth user can
  own both roles and the two builders are different pages.
- **Weekday defaults (retires *"In sequence from start"*, `dashBuilder.jsx:129`).** A program
  with N days a week takes: 1 → Mon · 2 → Mon Thu · 3 → Mon Wed Fri · 4 → Mon Tue Thu Fri ·
  5 → Mon–Fri · 6 → Mon–Sat · 7 → every day; a day added later takes the next free weekday. A
  legacy document whose days carry no weekday is given them **on load** by the same table, in
  order, through the normaliser (`workoutDocument.js`, `normalizeWorkoutDetail`) — so the fallback
  branch of `builderToAssignmentRows` (`:98`) stops being reachable from the builder and stays
  as a guard. Published snapshots are not touched: they are copies.

## 5. PR 9 · the Assign panel and the client preview (shared by both builders)

- **Assign** replaces `DbuAssignModal` (`:230`) and `DmbAssignModal` (`:313`) with one side
  panel: a checkbox row per client with their **own start Monday** (the modal's next-Monday
  default, `:233`, per client now), a *Where week 1 lands* strip from `builderToAssignmentRows`
  per client, the collision line against what is already on that client's calendar, and the
  guardrail sentence naming the client it is about. ⚠ **The guardrail today is evaluated at the
  publish boundary** (`dashBuilderCore.js:359`, `src/app/api/trainer/workout/route.ts`); showing
  its verdict *before* publish needs either a dry-run flag on that route or a client-side mirror
  of the same rule. **Decision for the build: the dry-run flag** — one rule, one place, the panel
  shows the route's own answer. The nutritionist panel keeps the portion scale and the training
  days (`dashMealBuilder.jsx:376`), the latter pre-filled from the template's own training days
  (§3) and still per-client.
- **Preview as client** replaces the checkbox (`:469`, `:534`) and the card drawn under the tree
  (`:526`): a docked column (Sheet) or a popover (Grid) rendering **the client's website
  surface** from the same rows the assign would publish — *Today* and *Week* through
  `dashTrain.jsx`'s own renderers (`dtrBuildWeeks` `:40`, `dtrToCard` `:92`, `DtrWeekPlate`
  `:182`), and a *Month* grid built from the rows (new, small). ⚠ **The app's phone is not
  renderable on the website** — it is a different bundle — so the board's phone is a drawing of
  the app's Today, and the built preview says *what Jordan sees on the website*; the app shows
  the same program.

## 6. Order and what each PR must not do

| PR | What | Must not |
|---|---|---|
| 1–4 | Token layer + the four sweeps (dark values) | change a single pixel — pixel diff per tab |
| 1 | **SHIPPED.** `dash.css` token block + the chrome swept (337 sites) + `tests/newdesign-paper-tokens.test.mjs` | — |
| 2 | **SHIPPED.** The six coach/client surfaces (342 sites) + every hex parser in the directory made token-tolerant, which is PR 1's own class closed — §11 | — |
| 5 | The light paper values, the switch, the Settings control, **default light** | touch a marketing page's header (no `data-paper` there) |
| 6 | Trainer Sheet view + header + toolbar | change the document shape or either route |
| 7 | Trainer Grid view + side panel + the view switch + weekday defaults | move a published snapshot |
| 8 | Nutritionist Week ⇄ Day types | change `buildMealAssignment`'s contract |
| 9 | Assign panel + client preview | publish anything from a preview |

The changelog entry for each PR is written **after** its review round, per the house rule. One
front-loaded `@coderabbitai full review` per PR; the sweeps are the file-count-heavy ones, which
is why they are four PRs and not one.

## 7. Defaults taken, and the line that reverses each

| # | Default | Reversal |
|---|---|---|
| 1 | The Grid opens first for a coach who has never switched | the fallback in `useRememberedChoice(..., "grid")` |
| 2 | Anybody + Schibsted Grotesk on the dashboards (the shells' font link; marketing keeps Fraunces · Space Grotesk) | the font link and two constants in the token block |
| 3 | *"In sequence from start"* retired; weekday defaults as §4 | keep the select option and skip the on-load assignment |
| 4 | The switch covers all three dashboards | stamp `data-paper` in the two coach shells only |
| 5 | The app's 18 papers and 9 accents on the website: **later**, on the same token layer, reading `user_goals('app_tweaks')` (§11 of the review) | — |
| 6 | The preview is the client's website surface | — (an app-frame preview is a separate build) |

## 8. Verification recipe (every PR)

- The pre-commit gate (JSX parse · `tsc --noEmit` · `npm test`) and the newdesign precompile
  check (`node scripts/build-newdesign.mjs --check`).
- **The render harness.** The dashboard pages load React 18.3.1, ReactDOM and Babel 7.29.0 from
  unpkg with SRI; the container's proxy blocks unpkg, and `npm pack` of those exact versions
  yields the bytes the SRI hashes were taken from — route the three URLs at them and the shells
  render unmodified (the recipe in the review's §7 and `coaches.jsx`'s header). Drive every tab of
  the three shells in the signed-out preview at 1440 and 390.
- **PR 1–4:** screenshot every tab before and after; the diff must be **zero pixels**. A non-zero
  diff is either a missed canvas literal or a wrong fallback, never acceptable drift.
- **PR 5:** the same set under `data-paper="light"` looked at, not only measured; the marketing
  header (`index.html`, `Coaches.html`) pixel-identical to before; the switch driven Light → Dark →
  reload → Dark (the mirror), and against a second account (a clean slate, the hook's own rule).
- **PR 6–9, the guards to write:** the weekday-defaults table (1..7 → the exact sets, and the
  next-free rule); `builderToAssignmentRows` never lands two days of one week on one date once
  weekdays are set; the on-load assignment leaves a document that already has weekdays untouched;
  the view switch is validated and per role; the Sheet's cells round-trip `applyProgression`; the
  preview renders from the assign rows and never calls the publish route; a source sweep that no
  dashboard module reintroduces a retired literal, with a vacuity floor.
- **Mutation round before each push**, each mutation proven to land, the suite's own counts parsed.

## 9. Registered, not in scope

- The client preview shows the website surface; an in-page frame of the app is its own build.
- The app's papers, accents, textures and light effects on the website (§7 row 5).
- `public/mobile/` and the legacy dashboards keep their own colours; the token layer reaches the
  34 pages that load `dash.css` and no further.

---

## 10. What PR 1 actually found (shipped 2026-09-22)

The token block plus the chrome sweep — `dash.css`, `pageShell.jsx`, `trainerDashboard.jsx`,
`dashGrid.jsx`, **337 sites**. `coachNav.jsx` and `clientNav.jsx` carry no colour literal at all,
so the brief's PR 1 list is complete at four files. Proven a visual no-op by a pixel diff of
**41 surfaces** — 33 dashboard tabs across the three shells plus 8 marketing pages — **all 41
identical**.
⚠ **AND IT WAS STILL BROKEN IN THREE PLACES — CORRECTED 2026-09-22, SEE §11.** The diff was
honest and the sweep was not: a pixel diff proves only the states you captured, and the chat
bubble's Feed tab, its profile card and Nora's row in site search are all **closed** in a page
capture. Read that claim as *"identical in every state the harness opened"*, which is a smaller
claim than it looks.
Four findings worth carrying into PRs 2–4:

⚠ **THE HEX-ALPHA TRAP HAS TWO SPELLINGS, AND SWEEPING ONE SHIPS THE OTHER.** `INK` was the
string `#f2ede4`, so ``${INK}40`` produced the 8-digit hex `#f2ede440`. Once `INK` became
`var(--sh-ink, #f2ede4)` the same expression produced `var(--sh-ink, #f2ede4)40` — not a colour,
so CSS dropped the **whole declaration** and the Team page's *Browse coaches* button lost its
border and fill with nothing failing anywhere. A scan for the template form found **6** sites;
the pixel diff then caught **5 more** written as concatenation (`INK + "8c"`), which that scan
could not see. Eleven sites in total, across `clientTeam.jsx`, `community.jsx`,
`marketplace.jsx`, `store.jsx` and `clientMeSettings.jsx` — **five of them outside PR 1's stated
scope**, because the trap lives wherever a swept constant is *consumed*, not where it is
declared. Every one became `rgba(var(--<token>-rgb, r,g,b), α)` with α = 0xHH/255, and all nine
distinct conversions were **verified in Chromium to compute the identical colour** rather than
trusted to the arithmetic. PRs 2–4 must re-run that scan in **both** spellings after each sweep.

⚠ **THE COOKIE-CONSENT BANNER IS OUTSIDE THE PAPER SYSTEM, AND AN EXISTING GUARD IS WHAT SAID
SO.** The sweep nested the paper tokens inside the banner's own `--consent-*` fallbacks, and
`tests/consent-banner-contrast.test.mjs` failed — correctly. That banner is injected on ~69
pages and keeps a private namespace because it once borrowed generic palette tokens and a page
that defined one of them drew the disclosure at **1.11:1** while Accept stayed legible; a
half-legible consent choice is a dark pattern however it was arrived at. Its region is reverted
to literals, the sweep script now protects it by range, and `dash.css` records why. ⚠ The ink
ratchet in the new guard had to be **scoped** to that exception, with a second assertion that the
region is real, non-empty, under 15% of the file and still carries literals — an exclusion that
large or that vacuous would silently stop the ratchet catching anything.

⚠ **TWO FILES IN THAT SET ARE CRLF-STORED, AND A TEXT-MODE WRITE NORMALISES THEM.**
`clientMeSettings.jsx` (1,137 CRLF lines) and `store.jsx` (850) came back as **1,700 changed
lines for a one-line fix** until both edits were re-applied in **bytes**. The lesson is already
in `docs/WORKLOG.md` from the `vite.config.ts` incident; PRs 2–4 sweep far more files, so check
`git diff --stat` against the size of the change before trusting any of them.

⚠ **AND THE RENDER HARNESS HAD TO BE PROVEN DETERMINISTIC BEFORE ANY DIFF MEANT ANYTHING.** Two
independent captures of the *same* tree are **41/41 identical** — the clock fixed with
`page.clock.setFixedTime`, `Math.random` seeded from an init script, animations and transitions
disabled, the fonts and the three CDN bundles served from local bytes.
⚠ **CORRECTED 2026-09-22 — 39 of 41, AND THE CONTROL ITSELF WAS A SAMPLE.** Re-measured over the
full set (the first control predated the 8 marketing pages), **two** surfaces move between two
captures of the identical tree: `NutritionistApp-schedule.png` by **11,147 px (0.467%)** in one
35px band at y 680..714 where the calendar's event chips sit, and `page-index.png` by **221,800
px** — the scroll-driven journey, which renders in two stable modes depending on run position.
⚠ **AND THE FIRST CONTROL PASSED `page-index.png`, WHICH IS THE WHOLE LESSON.** Two captures can
agree by coincidence when the nondeterminism is bimodal, so *a determinism control run once is
itself a sample, not a proof.* On the PR 2 diff that surface duly reported **110,916 px** — and a
**position-matched** comparison (capture a vs capture a, b vs b) returns **0 px on both
positions** while the same tree across positions returns the full 221,800. So the tree is not the
variable, and the honest way to compare these two surfaces is position-matched or not at all.
Without that control a green diff is indistinguishable from a harness that renders the same thing
twice by luck.
⚠ Playwright's own `page.screenshot` **hung** on both coach *Today* tabs waiting for
`document.fonts` (the page is fine; `fonts.ready` resolves), so captures go through CDP
`Page.captureScreenshot` with `captureBeyondViewport`.

**What the diff cannot prove, stated rather than implied:** every capture is the **signed-out
preview**, so a signed-in-only subtree is unverified by it — the two `clientMeSettings.jsx`
conversions sit inside cards gated on a session, and are correct by the Chromium equality check
above rather than by a render. `rgba(var(--triplet), α)`, `var()` fallbacks, and `var()` inside a
shorthand, a gradient and an SVG presentation attribute were each measured in Chromium before the
sweep depended on them.

## 11. What PR 2 actually found (shipped 2026-09-22)

The six coach/client surfaces the brief lists — `dashToday.jsx`, `dashWeek.jsx`,
`dashSchedule.jsx`, `dashRoster.jsx`, `dashClient.jsx`, `coachClientDetail.jsx`, **342 sites** —
plus a fix for the class PR 1 left open, which is most of what follows.

⚠ **A COLOUR THAT REACHES A HEX-ALPHA APPEND MUST STAY LITERAL, AND FOUR SOURCES IN THIS SET
DO.** `DashPill` composes its tint and both borders as `c + "1c"` / `c + "55"`; `CKTrend` fills
under its line with `color + "22"`; the schedule's chip tints with `color + "22"`; the membership
pill borders with `memberPill.c + "55"`. The first cut tokenised the constants behind all four —
measured, **every severity pill on both coach Today tabs lost its tint, its border and its
padding, and the page got 16px shorter**. `DASH_SEV_COLORS`, the queue's inline ternary branch,
`inkMutedPill`, `DCL_TEAL`/`DCL_RED`/`DCL_INK50`, `coachClientDetail`'s `teal`/`gold`/`rust` and
`DSC_PALETTE` are reverted, each with the rule written **beside it** rather than only here.
⚠ `DCL_GREEN` and `DSC_TEAL` stay tokenised, deliberately: nothing appends to either. **The split
is about where a value ENDS UP, not about what kind of colour it is.**

⚠ **AND THE SWEEP SCRIPT DERIVES THAT SKIP SET NOW, WHICH FOUND THREE OF THE FOUR AND MISSED THE
FOURTH FOR A REASON WORTH KEEPING.** It walks from each append site back through the file's
declarations, so `DASH_SEV_COLORS` and the ternary are protected automatically. `DSC_PALETTE` is
not, because the chain runs `color ← (colorOf || dscClientColor)(…) ← DSC_PALETTE` — through a
**function return**, and the walker only followed `const`. *A derived skip set is only as deep as
the hops it knows* — which is why the shipped guard is an AST walk and the sweep is only a
labour-saver. ⚠ Its SVG rule is imprecise in the same way, and the residual was checked rather
than assumed: the pattern protects only the **first** colour attribute on a tag, so
`<circle fill="none" stroke="rgba(242,237,228,0.09)">` had its stroke swept. That one is
**correct** — a 9% ink hairline is the paper's own colour and should follow it — and Chromium
resolves `var()` in an SVG presentation attribute with the token present *and* absent (measured
again here, along with both box-shadow forms). It is the only SVG attribute in the diff that
moved, so the imprecision cost nothing this time; PR 3 should re-check rather than re-trust it.

⚠ **A SECOND AND WORSE SINK: A HELPER THAT PARSES THE HEX DIGITS ARITHMETICALLY. PR 1 BROKE THREE
SURFACES THIS WAY AND THE PIXEL DIFF COULD NOT SEE ANY OF THEM.** `ssShade`, `cwHexA`, `cwShade`
and `cfHexA` all `parseInt(hex, 16)`, and `INK` / `TEAL` / `TEAL_BRIGHT` are `pageShell.jsx`
module-scope constants that every later classic script can read. Measured on the branch:

| call | before PR 1 | after PR 1 | where |
| --- | --- | --- | --- |
| `cfHexA(INK, 0.06)` — 16 of 21 calls | `rgba(242,237,228,0.06)` | **opaque cream** | chat bubble · Feed plate |
| `ssShade(TEAL, 0.5)` | `rgb(5,99,84)` | **`rgb(0,0,0)`** | site search · Nora's facet |
| `cwHexA(TEAL_BRIGHT, 0.3)` | `rgba(46,224,196,0.3)` | **`rgba(0,0,0,0.3)`** | chat bubble · avatar |
| `` `${tc}55` `` | `#2ee0c455` | **invalid, dropped** | chat bubble · profile card |

⚠ **`NaN >> 16 & 255` IS 0, SO TWO OF THOSE ARE VALID CSS THAT IS SIMPLY BLACK** — no browser,
no linter and no build can report a colour that parses. `livingShared.jsx`'s `hexA` is nastier
still: `parseInt("ar(--sh-probe, #2ee0c4)", 16)` stops at the leading `a` and returns **10**, so
the output is a plausible near-black rather than an obvious one.

**Fixed at the sink, not at the sources.** Every one of the directory's **ten** hex-parsing
helpers now EXTRACTS the digits (`String(x).match(/#([0-9a-fA-F]{3,6})/)`) instead of assuming the
whole string is a hex — a token always carries its own literal fallback, so the digits are there
to be found. `cfHexA` and a new `ssAlpha` go further and emit `rgba(var(--<token>-rgb, r,g,b), a)`,
so those derived alphas **still follow the paper**; a multiplicative shade has no CSS equivalent
and is honestly pinned to the fallback. ⚠ **`cwHexA` is deliberately left on the literal too,
which is a choice rather than an omission**: its callers are mostly a member's TIER colour, which
is semantic and does not follow the ground, and the one paper accent among them
(`chatWidget.jsx:167`) is in a file no sweep list covers anyway — so giving it the twin treatment
would buy nothing until PR 5 rules on the bubble. ⚠ **All twelve conversions were A/B'd against the
pre-PR-1 originals** (lifted from source and run, not restated) and the alpha and token
equivalences were **measured in Chromium** — `#2ee0c455` = `rgba(46,224,196,0.3333)`, and
`rgba(var(--sh-ink-rgb, 242,237,228), .06)` computes to the literal when the token is absent and
**follows it** when present.

⚠ **SIX OF THE TEN PARSERS WERE NOT BROKEN TODAY AND ARE FIXED ANYWAY, WHICH IS A SCOPE
DECISION.** `marketplace.jsx`, `radioInstrument.jsx`, `livingShared.jsx` (×2) and `siteSearch.js`
read their own literals, so nothing tokenised reaches them yet — and PRs 3–5 tokenise those very
files. A guard that exempts four parsers is a guard with four holes, and the exemption list is
the thing that goes stale. Nine one-line changes, each proven byte-identical by driving it, is
cheaper than four traps.

⚠ **THE GUARD IS SCOPE-AWARE BECAUSE A NAME-KEYED WALK CANNOT BE.** `tests/newdesign-paper-tokens.test.mjs`
gained two checks, both on the Babel AST: **every hex parser is driven** with a token and a bare
hex and must answer the same colour; and **no hex-alpha append resolves to a token**, resolved
through Babel's own bindings across the alias, member-read, function-return and cross-file JSX
prop hops. Three earlier attempts are recorded because each failed in an instructive way — a
reads-follow walk over these files reached **183 declarations** from one append site; bounding it
to a name declared once still crossed scopes via a **parameter**; and a scope-blind walk went
`c → r → dir → row` through four unrelated functions and reported a defect that was not there.
⚠ Its own `seen` key had to be **file-scoped**: without that, two files' nodes at the same byte
offset collided and silently pruned the DashPill chain while the walk reported CLEAN — found by
the mutation round, not by reading.

⚠ **AND A THIRD CLASS, REGISTERED RATHER THAN GUARDED, BECAUSE NO LIVE INSTANCE EXISTS: A COLOUR
COMPARED BY EQUALITY.** `dashGoals.jsx` decides a spark's colour with `accent === DGO_INK50`
(three sites) and `shared.jsx`'s `ShapeWord` infers light-vs-dark with
`c === "#fff" || … || c.includes("244,241,234")`. Both are **safe today, and checked rather than
assumed**: every `c:` in `dgoStateView` is assigned the constant itself, never a literal spelling
of it, so tokenising `DGO_INK50` keeps both sides equal; and `ShapeWord` is handed a colour only
by the two retired exploration files, where `var(--sh-ink, #f2ede4)` and `#f2ede4` both fail every
arm of that test identically — measured, the inferred variant does not move.
**PR 3 owns the hazard**, because it sweeps `dashGoals.jsx`: the moment one side of that
comparison is a token and the other a literal, the spark silently draws in the wrong colour and
nothing fails. The fix when it comes is a semantic flag (`muted: true`) rather than a colour
compare — a colour is not an identity.

⚠ **AND SEVEN OF THE THIRTEEN TOKENS HAVE NO `-rgb` TWIN, WHICH SILENTLY CAPS WHAT `cfHexA` AND
`ssAlpha` CAN FOLLOW.** Both build `var(--<token>-rgb, r,g,b)` from whatever token they are
handed, and only **six** twins are declared: `--sh-accent`, `--sh-accent2`, `--sh-accent3`,
`--sh-ground`, `--sh-ink`, `--sh-nav-ink`. The other seven — `--sh-deep`, `--sh-gold`,
`--sh-green`, `--sh-ground2`, `--sh-ink-soft`, `--sh-rust`, `--sh-rust2` — fall back to the
literal triplet, which is **correct and honest** (identical to today) and simply does not move
with the paper. Nothing is broken; the fix, if PR 5 wants those alphas to follow, is seven more
lines in the token block, not a code change. Recorded because a fallback that works forever is
the kind of limitation nobody re-derives.

⚠ **AND THE FOUR SWEEPS DO NOT COVER THE DIRECTORY, WHICH PR 5 HAS TO KNOW.** Counted after PR 2
(the 13 named hexes plus the 6 triplets, comments stripped): **2,721 paper-colour literals remain
across 82 files**, and only **714** of them are in the brief's PR 3 (491) and PR 4 (223) lists.
**1,819 across 59 files are in no list at all** — `directionB.jsx` 152, **`chatWidget.jsx` 122**,
**`communityFeed.jsx` 120**, `recipes.jsx` 120, `store.jsx` 99, `score.jsx` 76, `community.jsx`
75, and so on. The 188 still inside the PR 1/PR 2 files are the deliberate ones: semantic
palettes, shadows, brand marks, the consent banner.
⚠ **THE CHAT BUBBLE IS THE ONE THAT MATTERS.** It mounts on **35 pages including every
dashboard**, so with `chatWidget.jsx` and `communityFeed.jsx` unswept a member who switches to
the light paper gets a light dashboard with a **dark chat bubble over it**. That is a product
consequence of the staging, not a bug in it — but it is the owner's to see, and it belongs in
PR 5's scope or in an explicit "the bubble keeps the dark paper" ruling. ⚠ The earlier figure of
"~622 remaining" was wrong in both directions and is replaced by these; it is corrected here
rather than left, because a wrong scope number is what sizes the next PR.

**Verification.** `npm test` **4,274 / 0** through the pre-commit gate · all 13 changed modules
parse · the newdesign precompile check (73 pages, 80 shared jsx, 0 errors) · a pixel diff of the
same 41 surfaces against PR 1's head: **40 identical outright**, and `page-index.png` — which the
control above proves renders in two modes — **identical at both positions when matched**, so the
sweep is pixel-exact on every surface the harness opens · **27 mutations, 27 killed**, each proven to land, the
suite's own `# pass`/`# fail` parsed, sanity green at both ends, the tree restored in a `finally`
and on a signal — including the two that close the class **forward** (a brand-new naive parser,
and a brand-new component that hex-appends a tokenised prop) and one per spelling of the append
vacuity floor, because a **summed** floor is satisfied by whichever spelling still matches and
that mutation survived until the floor was split.
