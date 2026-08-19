# Cook-together serve time — the ask, the backward scheduler, and the docket

**Date:** 2026-08-19 · **Status:** DRAFT — build-ready except the owner questions in §10
(none block the build; each has a stated default) · **Migrations:** NONE — engine + UI +
catalogs + tests only · **Authoritative prior record:** `docs/WORKLOG.md` 2026-08-18
(#1907, the "50 cannot interleave" registration) + the Cook Mode wave entries (#1804–#1809)
· **Implements on:** one PR (§9)

Every `path:line` in this document was verified on 2026-08-19 by executing the modules and
reading the tree. ⚠ **The partially-built work this spec extends is UNCOMMITTED** — it
lives only as working-tree modifications to `mobile-app/src/services/cookOrchestrator.mjs`
and `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` on branch
`claude/cook-together-ask` (`git diff origin/main...HEAD` is EMPTY; the diff is
`git diff`). Line numbers cited for those two files are working-tree numbers and shift the
moment anything lands — anchor edits on symbols. **Build step 0 is committing what exists**
(§9); this repo has lost uncommitted work to container resets and `git checkout --` more
than once. Things that could NOT be verified are in §11.

> ⚠ **THE SIGNATURE BUG OF THIS FEATURE IS ALREADY ON THE RECORD AND MUST BE PINNED.**
> `bsOrchestrate`'s mode allow-list (`cookOrchestrator.mjs:173-174`) originally listed only
> TOGETHER and SEQUENCE, so a SERVE request fell silently through to AUTO and returned a
> **valid interleaved plan under the wrong name** — no error, no crash, just dinner not
> landing together with every gate green. The comment at `:167-172` records it. Adding a
> mode means adding it to that list, and §7.1 makes the suite fail when the list and the
> mode vocabulary ever disagree again.

---

## 1. Problem — the two rulings, the clarification, and what changed between them

The Prep Session lets a member cook several recipes in one go, and today the ENGINE decides
how: `bsOrchestrate` interleaves automatically whenever the data allows, and the UI reads
`interleaved = !orch.serial && orch.timeline.length > 0`
(`iosAppBroadsheetClient.jsx:7578`). The owner ruled that away in three quotes:

1. **The ask (2026-08-18, restated 2026-08-19):** *"If you choose multiple recipes to cook
   at once, before you can begin, the cook tutorial engine should ask if you want to cook
   these at the same time for timing purposes or one at a time"* — and when overlapping is
   impossible, show the option **disabled with the reason, not hidden**.
2. **The clarification — the real goal is NOT time-saving:** *"this is also about timing so
   the food can possibly be finished all at once together. example if you have multiple
   guests coming over. No food comes out cold."*
3. **The overview (2026-08-19):** *"lets create a visual, or an overall view so the user
   can see the overall status or checkpoint of all meals, so they aren't operating blind on
   just whatever recipe is being presently shown. Kind of like a progress road map for each
   recipe being cooked at once."*

What changed between quote 1 and quote 2: the first reads as a two-way choice (weave vs
one-at-a-time), and that is exactly what the built ask offers today
(`iosAppBroadsheetClient.jsx:7767-7815`). The second reveals a THIRD objective the
time-saving weave cannot deliver — **co-completion**. Measured on the live catalog
(executed, not estimated): `together` mode leaves *One-pan chicken and rice* + *Steak and
sweet potato hash* finishing **21 minutes apart**; the trio adding *Tofu and edamame poke
bowl* finishes **22 minutes apart**. The first dish sits going cold — the exact failure the
owner named. The new `serve` mode gets the pair to **8 minutes**, with the residual caused
by stove exclusivity and reported as `issues: ['stations']` (§3).

Quote 3 adds the visibility half: a schedule is only trustworthy if the cook can SEE it.
This matters most in serve mode, where the backward scheduler **deliberately delays a
dish's start** — with no overview, a dish that has not begun is indistinguishable from a
dish the cook forgot. §5 designs that overview (**the docket**).

Two owner decisions are FIXED and not re-litigated here:

1. **THREE options.** The existing time-saving interleave stays AND serve-together is its
   own separate choice — never a replacement, never a merge.
2. **The cook picks the serve time**, and the engine schedules backwards from it.
   Impossible times are refused by naming the earliest reachable time, never silently
   accepted.

### 1.1 What is already built (uncommitted, verified by execution)

- **Engine** (`cookOrchestrator.mjs`): `BS_COOK_MODE` (`:19-24` — auto · together ·
  sequence · serve), `BS_SERIAL_REASON` (`:28-33` — single · no-window · stations ·
  chosen), `BS_SERVE_ISSUE` (`:36-39` — too-soon · stations), the `serveTimeline()`
  backward scheduler (`:100-156`), and `bsOrchestrate(recipes, { mode, serveAt })`
  returning `{ timeline, serial, canInterleave, mode, reason }` plus, in serve mode,
  `{ serveAt, earliestServe, spread, issues }` (`:184-190`).
- **UI** (`BSPrepSession`, `iosAppBroadsheetClient.jsx:7467`): a TWO-option ask on the mise
  stage (`:7767-7815`) — Together / One at a time, real minutes on each card
  (`spanOf`, `:7590-7592`), start gated until a choice (`:7818-7824`), a reason line under
  a disabled Together (`:7810-7814`), and single-dish sessions skipping the ask entirely
  (`multi`, `:7585`). The AUTO probe (`orchAuto`, `:7573`) answers "COULD these overlap?"
  independently of the choice, so picking Sequence never makes Together look impossible.
- **NOT built:** the third card, the serve-time picker, any `serveAt` plumbing (the orch
  memo at `:7575-7577` passes only `{ mode }`), the docket, the serve countdown, the i18n
  catalog entries for the new ask (§7 — the shipped keys resolve off `defaultValue` only),
  and every test for the new engine surface (`tests/cook-orchestrator.test.mjs` — 10 tests,
  **zero** mentions of `mode`, `serveAt`, or `BS_COOK_MODE`).

### 1.2 Measured facts this spec builds on (all re-verified 2026-08-19 by running the code)

- **22 of 85** catalog recipes carry a hostable passive window (`passive:true` + `station`
  + `min>=4` through `bsCookableFromRecipe`); **0 of the 50 USDA recipes** do (their
  `_KITCHEN_STEP_META` overlays are the registered, unstarted follow-up from #1907).
- `STATIONS_EXCLUSIVE = ['oven','stove','board']` (`cookOrchestrator.mjs:46`); `'off'`
  (rest/chill) holds nothing.
- *One-pan chicken and rice* + *Steak and sweet potato hash*: together spread **21 min**;
  serve spread **8 min**, `issues:['stations']`, `earliestServe: 33`.
- Same pair, `serveAt: 10` (impossible): returns `serveAt: 33, earliestServe: 33,
  issues: ['too-soon','stations']`. `serveAt: 120`: dishes plate at **112** and **120**,
  first event at minute **87** — the plan waits 87 minutes before anything happens, which
  is why the docket (§5) is not optional polish.
- ⚠ The N-dish spread figures are **combination-dependent**: the 22-min three-dish figure
  holds for e.g. chicken + steak hash + poke bowl (22) but chicken + steak hash + shakshuka
  measures **33**. Any test pinning these numbers must name its exact fixture (§7).

---

## 2. The three modes — precisely what each promises the cook

The ask stays on the mise stage, after the merged mise and before Start — the last moment
the plan can still change and the first moment the full dish set is known. Neither option
is pre-selected (a default would answer the owner's question on the cook's behalf), the
start CTA stays disabled until a choice (`:7818-7824`, built), and a single dish skips the
ask (built). The two built cards stay; a third joins them.

| card | engine call | promises | can NOT promise | availability |
| --- | --- | --- | --- | --- |
| **Together** — "Woven for timing" | `{mode:'together'}` | the least total time at the stove; one dish's hands-off window hosts another's active steps | dishes finishing together — measured 21 min apart on the reference pair; the card's minute figure is the TOTAL span, honest about what it optimizes | disabled-with-reason when the AUTO probe comes back serial (`togetherPossible`, `:7574`); the reason distinguishes `no-window` from `stations` (`:7582-7584`) |
| **Serve together** — NEW | `{mode:'serve', serveAt}` | every dish plating within `spread` minutes of ONE moment the cook picked; dishes deliberately WAIT to start | a shorter evening (serve can be longer than together); physical feasibility beyond the station model (§3.4); the plan surviving a cook who runs far off the 3-min active-step assumption | **always offerable for ≥2 dishes** — verified: `serveTimeline` needs no passive window (a windowless pair schedules with staggered starts, spread 0). The disabled-with-reason ruling applies to Together only |
| **One at a time** — "Finish, then start" | `{mode:'sequence'}` | full attention on one dish; the existing per-recipe `BSCookMode` flow, unchanged | anything about timing — it is the longest option and the card's minute figure says so | always |

Copy rules, binding:

- Each card carries a REAL minute figure computed from its own timeline (`spanOf` over the
  memoized probe — built for Together/Sequence; the serve card shows the **picked serve
  clock time** once chosen, and before a pick shows the earliest reachable time, §4).
- The serve card, once a valid time is picked, shows one honest sub-line from the probe:
  `spread === 0 && !issues.length` → "everything lands at {time}"; `spread > 0` → "all
  within {spread} min of {time}"; `issues` containing `stations` **always** appends the
  stations note (§3.4 explains why even a 0-spread plan can carry it) — quiet mono
  register, not an alarm: the residual is a fact about sharing one oven, not a failure.
- The disabled-Together reason line stays exactly as ruled (shown, never hidden) but its
  reason clause must move into the catalog — as built, `noTogetherWhy`
  (`:7582-7584`) is **hardcoded English interpolated through a `{why}` param**, invisible
  to key-sync (the registered param-shadow blind spot). §7 assigns it real keys.
- `auto` remains in the engine for single-dish sessions, existing callers, and the UI's
  possibility probe — it is never offered as a card. The allow-list default (`:173-174`)
  maps any unknown mode to `auto`; verified.

---

## 3. The backward scheduler — the algorithm as built, its termination argument, and its honest failure modes

`serveTimeline(rs, activeMin, serveAt)` (`cookOrchestrator.mjs:100-156`), all times in
plan-minutes relative to session start (the engine is deliberately clock-free — no `Date`,
injectable `activeStepMin`, so timelines pin in tests).

### 3.1 The algorithm as built

1. **Durations.** `durationOf` (`:97`) sums each dish's steps — a step's authored `min`
   when real, else `activeStepMin` (3). `earliestServe = max(durations)` — the longest
   dish, cooked alone, defines the earliest possible common landing.
2. **Target clamp** (`:103-106`): a non-finite/absent/≤0 `serveAt` defaults to the
   earliest; a `serveAt` below the earliest is **clamped to it** and reported
   (`too-soon` in `issues`) — the engine never pretends food cooks faster than it does.
3. **Longest dish first** (`:108`), each placed **as late as possible**: `start = T − dur`.
4. **Clash-pull loop** (`:113-133`): walk the dish's steps at that start; on the first
   overlap with an already-committed hold on an exclusive station (oven/stove/board —
   `'off'` never clashes), pull the WHOLE dish earlier by exactly the overlap and re-walk.
   `pulled` is latched → `stations` in `issues`.
5. **Commit** (`:136-144`): each exclusive-station step books a `{station, from, to}` hold;
   events carry the full step record (`evt`, `:59-67` — `recipe/iid/title/stepIndex/text/
   at/min/passive/station`), sorted `(at, iid)`.
6. **Report** (`:146-156`): per-dish ends → `spread = max(end) − min(end)`; `{ timeline,
   serveAt: T, earliestServe, spread, issues }`.

### 3.2 Termination argument

Each pull strictly decreases `start` by the overlap amount (`clash > 0` by construction —
it only exists when `at < h.to && h.from < at + len`), and `start` is bounded below by 0:
on going negative it clamps to 0 and **breaks** (`:131`). A belt-and-braces iteration guard
caps the loop at `rs.length × steps + 8` (`:117`). So the loop terminates on every input,
including adversarial metadata. (Authored `min` values are integers by the no-decimal
authoring rule — `bsAuthorStep` refuses fractional durations — so pulls are integral; the
guard covers any future non-integer leak anyway.)

### 3.3 Verified behaviour (executed, exact)

- `serveAt: 10` on the reference pair → `{serveAt: 33, earliestServe: 33, spread: 8,
  issues: ['too-soon','stations']}` — refusal reports the earliest reachable time.
- `serveAt: 120` → chicken plates at 120, steak at 112, first event at minute 87 —
  backward scheduling works and the wait is real.
- Windowless pair → valid staggered plan, spread 0, no issues.

### 3.4 Honest failure modes — state these anywhere the numbers surface

1. **`too-soon`** — the picked time is unreachable; the plan is built at the earliest
   instead, and BOTH facts are in the result. The UI must surface the refusal BEFORE
   start (§4); the engine clamp is the backstop, never the UX.
2. **`stations`** — an exclusive station forced a dish earlier, so it finishes before the
   serve moment; `spread > 0` quantifies it (8 min on the reference pair).
3. ⚠ **THE FLOOR-CLAMP RESIDUAL — `spread` MEASURES SCATTER, NOT FEASIBILITY.** Measured,
   not hypothesized: three 30-minute stove dishes in serve mode return `spread: 0,
   issues: ['stations']` with **all three stove holds fully overlapping** (`[3,33]` ×3) —
   the pull hit the 0 floor (`:131`) and the dishes were placed anyway. The plan looks
   perfect by its spread and physically wants three pots on one exclusive stove. This is
   why §2's copy rule appends the stations note **whenever the issue is present, even at
   spread 0**, and why the docket never renders a "perfect" badge off spread alone. (In a
   real kitchen a stove has burners, so the one-burner station model is conservative in
   interleave and optimistic here; changing the station model is out of scope, §10.7.)
4. **One pair of hands is not modeled.** Station-null active steps overlap freely in the
   plan (verified: two dishes' step-0 both at minute 0). The board serializes execution by
   cursor, so wall drift accrues whenever the plan stacks active work. Plan minutes are the
   plan; the wall clock is the truth; the serve countdown (§5.5) is wall-anchored so it
   stays honest while the per-step plan drifts.
5. **Unauthored steps are assumed 3 minutes** (`activeStepMin`). A cook who chops slower
   drifts; the engine does not re-plan mid-session (registered, §10.4).

### 3.5 The allow-list rule (the bug already bitten once)

`MODES = [TOGETHER, SEQUENCE, SERVE]` (`:173-174`); anything else → AUTO. The recorded
failure: SERVE missing from that list produced a valid interleaved plan labeled by
nothing — the caller got `mode: 'auto'`-shaped output while believing it had a serve plan.
The gate (§8.1) pins every member of `BS_COOK_MODE` except AUTO as accepted, and pins the
serve result shape, so a future FOURTH mode that skips the list fails the suite instead of
shipping the wrong answer under a right-looking name.

---

## 4. The serve-time picker

### 4.1 Where it lives and what it looks like

Picking the **Serve together** card reveals a time row directly beneath the three cards
(same dark band, `BAND.bg`/`heat` vocabulary the mise stage already uses,
`:7471-7476`): a mono eyebrow `WHEN DO YOU WANT TO EAT?`, a native
`<input type="time">` (with `colorScheme: 'dark'` — the wire-form precedent for native
controls on fixed-dark surfaces), and a row of quick chips: **Earliest · +45 min · +1 h ·
+1½ h**. The card's minute figure becomes the picked clock time; the sub-line shows the
probe's spread/issues copy (§2).

### 4.2 Units — clock time on screen, minutes-from-now on the wire

The owner's scenario is "guests coming over"; cooks think *"we eat at 7:30"*, so the UI
speaks **clock time**. The engine takes relative minutes (`serveAt`), so the UI converts:
`serveMin = round((serveWallClock − Date.now()) / 60000)`. ⚠ **The conversion happens
TWICE**: once live in the picker (validation + the card copy), and **again at the Start
tap** — a cook who picks 7:30 and then spends ten minutes on the mise must get a plan
built from the minutes remaining AT START, not at pick time. If the dawdle made the time
impossible, the refusal (§4.4) reappears and start stays gated. The Start tap also stamps
the **wall anchor** (`sessionAnchorMs = Date.now()`) that §5.5's countdown and every
"starts in" figure derive from.

### 4.3 The default

Seeded to **the earliest reachable time, rounded UP to the next 5-minute mark**:
`now + earliestServe minutes`, from a memoized probe `bsOrchestrate(orchInput,
{mode:'serve'})` with no `serveAt` (the engine's own default IS the earliest, `:103-105`;
one extra memo beside `orchAuto`/`orchSeq`, `:7573`/`:7589`). The default is therefore
always valid, and "just start when it's ready" costs zero taps.

### 4.4 Refusing an impossible time — name the earliest, never fail

Validation runs in the picker, live: `pickedMin < earliestServe` (including any clock time
at-or-before now — there is no next-day interpretation; a session does not span to
tomorrow's dinner) renders a quiet refusal line **naming the reachable time**:

> *Too soon — {longest dish title} alone needs {earliestServe} min. Earliest: {clock}.*

with a one-tap **Use the earliest** chip that snaps the input to §4.3's value. While the
picked time is impossible, the serve card counts as un-chosen — the Start CTA stays
disabled exactly as it does before any choice (`:7818-7824`). The engine's own clamp
(§3.4.1) remains as the backstop for any path that slips a bad value through, and the gate
proves the backstop fires (§8.1).

### 4.5 Telling the cook about the residual spread — honestly, without alarm

When the probe reports `spread > 0` or `stations`, the card sub-line reads (mono, quiet):

> *All within {spread} min of {time} — two dishes share the {station}, so one finishes a
> few minutes early.*

Rules: the figure is the engine's `spread`, never rounded to zero; "early" is the true
direction (pulled dishes always finish BEFORE the serve time — `:128-131` only ever moves
starts earlier); at `spread === 0` with `stations` present the line keeps the sharing
clause and drops the figure (§3.4.3). It is one sentence, it does not block anything, and
it never uses failure language — an 8-minute spread across a shared stove is a good plan,
stated plainly.

---

## 5. THE DOCKET — the per-dish roadmap (owner quote 3; unbuilt)

> *"…an overall view so the user can see the overall status or checkpoint of all meals, so
> they aren't operating blind on just whatever recipe is being presently shown. Kind of
> like a progress road map for each recipe being cooked at once."*

### 5.1 What exists today (corrected against the code)

The board is NOT entirely blind — `BSPrepCook` already renders a per-dish **chip strip**
(`iosAppBroadsheetClient.jsx:7384-7402`): one chip per recipe with its title and either
`done/total` (`recStats`/`doneByRecipe`, `:7263-7273`) or a live hold countdown. What it
lacks is exactly what the owner asked for: no STATE vocabulary (a deliberately-waiting
dish and a forgotten dish both read `0/6`), no "starts in", no done/plated distinction
beyond `6/6`, no serve countdown, cramped 7.5px chips — and **nothing at all outside the
board**: the sequence flow (`stage 'transition'` → `BSCookMode`, `:7649-7653`) shows only
`Prep · Recipe {n} of {m}` (`:7153`), the blindest surface of all. The docket is an
**upgrade of the existing strip plus two new placements**, not a greenfield surface.

### 5.2 The lane model — one pure function

`bsDocket(timeline, cursorIndex, liveTimers, { anchorMs, nowMs, serveAtMin })` in
`cookOrchestrator.mjs`, beside `bsHoldingAt` (`:261`) — the module already owns
board-state derivation, is clock-free (times injected), and is where the engine tests
live. Returns one lane per `iid` (instance id — NEVER `recipe` key: two selected instances
of one recipe are separate tracks, the exact identity rule the board's timer gates already
follow, `:7304-7311`), in timeline `order`:

```
{ iid, recipe, title, done, total,            // step progress (n of m)
  state: 'waiting'|'active'|'holding'|'done',
  holdEndsAtMs,                                // holding: the live countdown's end
  startsAtMin,                                 // waiting: first event's plan minute
  startsInMs }                                 // waiting + anchor: wall ms until it
```

State precedence, derived — never stored, so it cannot go stale:

- **done** — every one of the instance's timeline events is behind the cursor (the same
  fact `advance` uses to fire `onRecipePrepped`, `:7278-7281`).
- **holding** — a running non-soft timer for this `iid` (from the board's live `timers`,
  passed in; soft convenience timers are explicitly NOT lanes' holds, matching `:7361-7363`).
- **active** — the cursor's event belongs to this `iid`.
- **waiting** — everything else. With a wall anchor (serve mode), `startsInMs =
  anchorMs + startsAtMin·60000 − nowMs`, floored at 0 — a lane whose planned start has
  passed while the cook runs behind reads **"ready to start"**, never a negative countdown
  and never a fabricated one.

### 5.3 Where it lives — always-visible lanes on the board, not a separate screen

**Decision: the chip strip (`:7384-7402`) is replaced in place by stacked full-width
lanes** — one row per dish inside the existing dark band header: title (ellipsized) ·
a thin progress fill (`done/total`) · the state, which is a word plus its figure
(`Starts in 12 min` / `Now` / `◷ 4:32 on the stove` / `Prepped ✓`).

Why this and not the alternatives: a **separate screen** re-creates the blindness (the cook
must leave the step to check — the owner's complaint verbatim); a **collapsible panel**
hides exactly the thing that was asked to be visible, and its collapsed state is the
today-strip we already know is insufficient. On a phone, lanes cost ~32px each; a prep
session realistically holds 2–5 dishes (the picker has no cap, but candidates are the
week's tier-≤2 meals + library recipes, `:7490-7511`), so the header grows ~1 chip-row →
~4 lane-rows. Beyond 6 lanes the block becomes internally scrollable at a fixed height
rather than eating the step area (default, §10.6). The existing 1s tick (`:7245`) already
re-renders the board every second, so countdown lanes are free.

### 5.4 The non-interleaved flows get it too

A `sequence` session — and any serve/together session that degrades to serial — runs
`transition` → `BSCookMode` per dish, which today shows nothing about the other dishes.
Two placements, both driven by the same lane model (sequence lanes derive from
`ordered` + `cookIdx`, no timeline needed — done `< cookIdx`, active `== cookIdx`,
waiting with "next in line" ordering after):

1. **The transition screen** (`:7830-7846`) gains the FULL lane list under the recipe
   title — this is the between-dishes moment where "what's done, what's left" is the whole
   question.
2. **Inside `BSCookMode` in prep mode**: the `prep` prop (`:6421-6427`, consumed at
   `:7153`) gains `docket` (the lanes array); a compact one-line strip renders under the
   `Prep · Recipe {n} of {m}` eyebrow — per dish a state glyph + short title
   (`✓ Chili · ● Oats · ○ Dahl`), display-only. The full lanes live one Back-tap away on
   the transition screen; duplicating them inside the step page spends vertical space the
   method needs.

### 5.5 The serve countdown

Serve-mode sessions render a **serve header row above the lanes** (board) and atop the
transition lanes: `SERVE · {clock} · in MM:SS`, computed from `serveWallAtMs = anchorMs +
serveAtMin·60000` against the wall clock — never from plan minutes, so it stays true while
the cook drifts off the 3-min step assumption. Once `now > serveWallAtMs` with lanes still
unfinished it flips to `SERVE · past {clock}` in the same quiet register — visible, never
blinking, never shaming. Waiting lanes' "starts in" figures share the same anchor, so the
header and the lanes can never disagree about time.

**The waiting gate (serve only):** when the cursor's event has a wall start in the future
(`anchorMs + ev.at·60000 − now > 0` beyond a 30s grace), the board's CTA area shows the
countdown — `{dish} starts in M:SS` — with a quiet **Start now →** override. The override
**re-anchors the whole plan**: `anchorMs = now − ev.at·60000`, which slides every start AND
the serve time earlier by the same amount, keeping the plan internally consistent; the
serve header restates the new clock time on the next tick. (Silently starting early while
the header still promises 7:30 would be the plan lying; re-anchoring keeps every displayed
number derived from one truth.) Default per §10.3.

### 5.6 Lanes are not tap-to-jump (v1)

On the board the timeline is a **total order over shared stations** built at t=0 — the
engine has no mid-session re-plan, so jumping the cursor to another dish would either
break station holds or demand a re-orchestration from partial state that `bsOrchestrate`
cannot express. A lane TAP therefore **expands the lane** to show that dish's next step
text and its planned time — information, not navigation. Mid-session re-orchestration is
registered as a follow-up (§10.4); queue reordering in sequence mode is deferred with it.
Stated as a decision, not an oversight.

---

## 6. Rendering — every surface, with path:line

⚠ Anchor edits on SYMBOLS in `iosAppBroadsheetClient.jsx` (30,282 lines, uncommitted —
numbers below are working-tree as of 2026-08-19).

| # | surface | anchor | change |
| --- | --- | --- | --- |
| 1 | Mise ask — third card | `:7767-7815` (the built two-card block) | the options array gains SERVE (always `on`); card copy per §2; picked-serve sub-line per §4.5 |
| 2 | Serve-time picker row | new, directly under the cards | §4 — native time input + chips + refusal line |
| 3 | Start CTA gate | `:7818-7824` | unchanged mechanics; serve counts as chosen only with a valid time (§4.4) |
| 4 | `serveAt` plumbing | `orch` memo `:7575-7577` | `bsOrchestrate(orchInput, cookMode === SERVE ? { mode, serveAt: minsAtStart } : { mode })`; recomputed at the Start tap (§4.2); `sessionAnchorMs` stamped there |
| 5 | Board — lanes | `BSPrepCook` strip `:7384-7402` | replaced by §5.3 stacked lanes off `bsDocket`; `timers` already in scope (`:7238`) |
| 6 | Board — serve header + waiting gate | header `:7376-7383`, CTA row `:7448-7453` | §5.5; the waiting gate slots beside the existing `waitingOn` disabled-CTA pattern (`:7450-7451`) |
| 7 | Transition screen | `:7830-7846` | full lane list (§5.4.1) |
| 8 | `BSCookMode` prep strip | prep prop `:6421-6427`, eyebrow `:7153` | compact docket line (§5.4.2); `prep={{ index, count, onPrepped, docket }}` threaded at `:7649-7653` |
| 9 | Wrap | `:7848+` | serve sessions add one line: "Landed within {spread} min of {clock}" (default §10.5); `wrapHolds` mechanics untouched |
| 10 | Engine | `cookOrchestrator.mjs:19-39` (vocab), `:100-156` (serveTimeline), `:173-198` + `:253` (mode dispatch/reasons), `bsDocket` new beside `:261` | §3 + §5.2 |
| 11 | Reason-clause i18n | `noTogetherWhy :7582-7584` | the two English literals move into catalog keys (§7); the `{why}` param dies |

**Not touched, deliberately:** `BSCookMode`'s solo flow (a single dish has no docket to
show — §10.2); `bsPrepOrder`/`bsMergeMise` (`mealPrep.mjs:155` — mise and ordering are
mode-independent); the PREPPED write path (`recordItem`/`onPrepped`, `:7615-7631` — a
serve session records prep entries exactly as a together session does); the website (Cook
Mode is mobile-only; no web twin exists to drift).

---

## 7. i18n keys — `mobile-app/src/i18n/catalogs/*/cook.json`, all 13 locales

`tests/i18n-catalog-complete.test.mjs:34-41` asserts every `en` key exists in all of
`ACTIVE_LOCALES` (13: en es pt-BR fr de it id vi tr ha pcm ru uk) and `:43-52` pins ICU
placeholder names. ⚠ **A key absent from `en` is invisible to that gate** — the component
resolves the `defaultValue` and ships untranslated with the suite green. That is the
current state of the built ask: **all six of its keys are uncataloged** (verified: zero
matches in `en/cook.json`, which holds 94 keys / 40 `prep.*`).

**7.1 Already shipped, must be cataloged (en + 12):**
`prep.howAsk` · `prep.together` · `prep.togetherSub` · `prep.oneAtATime` ·
`prep.oneAtATimeSub` · `prep.togetherWhy`.

**7.2 The reason-clause fix:** `prep.togetherWhy` currently takes `{why}` carrying
hardcoded English (`:7582-7584`) — the registered param-shadow blind spot (a param
carrying prose defeats key-sync exactly the way a concatenated key does). Replace with two
self-contained keys, no `{why}` param:
`prep.whyStations` ("Together is unavailable — these dishes all need the same station, so
they cannot overlap.") · `prep.whyNoWindow` ("Together is unavailable — no dish here has a
hands-off stretch long enough to start another one inside."). `prep.togetherWhy` is
deleted before it ever lands in a catalog.

**7.3 Serve option + picker:**
`prep.serveTogether` ("Serve together") · `prep.serveTogetherSub` ("Everything lands at
once") · `prep.serveAsk` ("When do you want to eat?") · `prep.serveEarliest` ("Earliest ·
{time}") · `prep.serveChipEarliest` ("Earliest") · `prep.serveChip45` ("+45 min") ·
`prep.serveChip60` ("+1 h") · `prep.serveChip90` ("+1½ h") · `prep.serveTooSoon` ("Too
soon — {title} alone needs {n} min. Earliest: {time}.") · `prep.serveUseEarliest` ("Use
the earliest") · `prep.serveAtNote` ("Everything lands at {time}") · `prep.serveSpreadNote`
("All within {n} min of {time}") · `prep.serveStationsNote` ("Two dishes share the
{station}, so one finishes a few minutes early.") · `prep.min` ("min" — the card figure's
unit, currently a hardcoded JSX suffix).

**7.4 The docket:**
`prep.serveHeader` ("Serve · {time}") · `prep.serveInT` ("in {t}") · `prep.servePast`
("past {time}") · `prep.laneStartsIn` ("Starts in {t}") · `prep.laneReadyToStart` ("Ready
to start") · `prep.laneUpNext` ("Up next") · `prep.laneInLine` ("{n} in line") ·
`prep.laneNow` ("Now") · `prep.startsInCta` ("{title} · starts in {t}") · `prep.startNow`
("Start now →"). Reused, NOT duplicated: `prep.holding` (holding lanes), `prep.platedTitle`
("Prepped ✓" — the done state), `prep.now`, `prep.station.*` (`:7223`, `:7234`).

Rules: flat dotted keys; ICU placeholders preserved per the parity gate; brand nouns
literal; translations LLM-generated and flagged for the standing human review; Turkish
never glues case suffixes onto `{placeholders}`; times/counts interpolate pre-formatted
strings (`{time}`, `{t}`) so locales never re-derive clock formats.

---

## 8. The gate — assertions + the mutations that must prove each real

Two harnesses exist and are reused; one small resolve-check is new. Co-completion is
**numerically asserted, never eyeballed**.

### 8.1 Engine — extend `tests/cook-orchestrator.test.mjs` (10 tests today, zero mode coverage)

Pure vectors on synthetic fixtures (the `A()`/`P()` helpers at `:6-7` of that file), plus
one catalog-real vector:

1. **Allow-list pin (the signature bug).** Every `BS_COOK_MODE` value except AUTO round-
   trips: `bsOrchestrate(pair, {mode}).mode === mode`, and the serve result carries all
   four serve fields. Derived from the exported vocabulary, not a re-typed list — a FIFTH
   mode added to `BS_COOK_MODE` but not to `MODES` fails here.
   *Mutation:* remove `SERVE` from `MODES` (`:173`) → the serve vector fails on
   `mode === 'auto'` + missing `serveAt`.
2. **Backward correctness, pinned.** A 33-min + 24-min synthetic pair at `serveAt: 120`:
   per-dish ends exactly `{120, 112}`, first event at 87, `spread: 8`,
   `issues: ['stations']`.
   *Mutation:* flip the longest-first sort (`:108`) to shortest-first → ends change, fails.
3. **Co-completion beats together, numerically.** On the same pair: serve `spread` (8) `<`
   together finish-scatter (21, computed from ends the same way). The assertion is the
   inequality AND both exact figures.
   *Mutation:* stub `serveTimeline` to return the together timeline → fails on both.
4. **Refusal.** `serveAt: 10` → `{serveAt: 33, earliestServe: 33}` and `issues` contains
   `too-soon`. *Mutation:* drop the `tooSoon` clamp (`:105-107`) → fails.
5. **Reason vocabulary.** sequence → `chosen`; one dish → `single`; windowless pair in
   together → `no-window`; window-bearing but station-blocked pair → `stations`; and
   `canInterleave` present on every non-serve result.
   *Mutation:* return `null` reason on the no-window branch (`:197`) → fails.
6. **Floor-clamp honesty (§3.4.3).** Three 30-min same-station dishes → `spread === 0`
   AND `issues` contains `stations` — the residual signal survives a perfect-looking
   spread. *Mutation:* drop `pulled = true` on the clamp path (`:130`) → fails.
7. **Catalog-real vector (the corpus must contain the defect).** Through the REAL
   `bsCookableFromRecipe` + `SHAPE_KITCHEN_RECIPES`: the chicken/steak pair's together
   spread is 21 and serve spread is 8. This pins the numbers the ask SHOWS to real data;
   it breaks when the catalog's window overlays change — which is the point (the card
   figures are measurements, and a data edit that moves them should be seen).
8. **`bsDocket` vectors.** waiting/active/holding/done off a mid-cursor board state;
   `startsInMs` floors at 0 (the "ready to start" case); two instances of ONE recipe get
   independent lanes (keyed `iid`).
   *Mutations:* key lanes on `recipe` instead of `iid` → the duplicate-instance vector
   fails; freeze `done` at 0 → the mid-cursor vector fails (a stale roadmap is the
   named worse-than-none failure).

### 8.2 UI — new `tests/prep-session-ask.test.mjs` on the proven hook-shim harness

The technique is `tests/kitchen-allergen-surfaces.test.mjs` verbatim: compile the shipping
`iosAppBroadsheetClient.jsx` in memory with the deploy's own transform, export
`BSPrepSession`/`BSPrepCook`/`BSCookMode` (`:86` there), and `drive()` — render, click
buttons by their rendered text, re-render, assert on text (`:131-173`). Fixtures follow
its `PROGRAM` shape (`:276-283`) with titles that exact-match catalog recipes: a
**window pair** (One-pan chicken and rice + Steak and sweet potato hash) and a
**windowless pair** (two USDA titles).

1. **The ask gates start.** Multi-dish at mise: the ask renders; clicking `Start the
   session` with no choice leaves the board text absent; choosing then starting reaches
   the board. Single dish: no ask, start live immediately.
   *Mutation:* drop the `disabled={multi && !cookMode}` guard (`:7821`) → fails.
2. **Disabled-with-reason.** Windowless pair: the Together card is disabled AND the
   `prep.whyNoWindow` catalog text renders; window pair: enabled with real minutes on
   both cards. *Mutation:* hide the disabled card instead of disabling → the reason-text
   assertion fails (hidden ≠ disabled-with-reason, the ruling's exact words).
3. **The serve flow end-to-end.** Pick Serve together → the picker renders seeded to the
   earliest; an impossible time renders `prep.serveTooSoon` naming the earliest and start
   stays gated; `Use the earliest` enables start; starting reaches the board with the
   serve header and at least one lane reading a starts-in state.
   *Mutation:* skip the §4.2 re-validation at start → the impossible-time vector fails.
4. **The docket reflects real state.** Drive the board through steps: after a dish's last
   event, its lane reads `Prepped ✓`; while a real hold runs, its lane carries the
   countdown; the cursor's dish reads Now.
   *Mutation:* render lanes from a snapshot taken at mount (stale roadmap) → fails after
   the first advance.
5. **Sequence flow visibility.** Sequence session: the transition screen lists every dish
   with states; `BSCookMode` in prep mode renders the compact docket strip.
   *Mutation:* drop the `docket` from the `prep` prop → fails.
6. **Resolve-check (closes the ships-ungated trap).** Grep the component source for every
   `cook:prep.*` literal it references and assert each exists in `en/cook.json` — the
   score-page precedent. This is what makes §7.1's currently-uncataloged keys a FAILING
   state instead of a silent one, and what catches the next hardcoded-English `{why}`.
   *Mutation:* delete `prep.serveTooSoon` from `en` → fails here;
   `i18n-catalog-complete` then enforces the other 12 locales for free.

### 8.3 Standing gates

JSX parse (`@babel/parser`) · `tsc --noEmit` · PowerShell `VITE_BASE=/m/` build (never Git
Bash — the MSYS path-mangle is on the record) · full `npm test` re-run (never carry a
suite figure forward) · every touched file LF with zero NUL bytes, verified with
`tr -cd '\r' < f | wc -c` (not `grep -c`) · mutation-test with `cp file file.bak`, never
`git checkout --`, always AFTER committing, with an unmutated sanity case at both ends ·
merge gate: CI green + Codex clean on the final head, findings batched into one push.
⚠ `npm test` runs in CI (`Tests (unit + mount)`) but is NOT a required merge check — say
"fails the suite/CI", never "blocks the merge".

---

## 9. Build order — ONE PR, on `claude/cook-together-ask`

0. **COMMIT THE EXISTING WORK FIRST.** The engine modes + the two-option ask exist only as
   working-tree edits. Nothing else happens until they are committed (mutation-testing
   uncommitted work has destroyed fixes twice on the record; the web container resets to
   older commits).
1. **Engine tests for what exists** — §8.1 vectors 1–7 against the committed engine (all
   should pass as-is; any that do not is a finding, not a test bug).
2. **i18n floor** — catalog §7.1's six keys ×13; replace `{why}` with
   `prep.whyStations`/`prep.whyNoWindow` (§7.2) in code + catalogs; the §8.2.6
   resolve-check lands here and goes green.
3. **The serve option + picker** — the third card, the time row, validation/refusal,
   `serveAt` plumbing with at-start re-validation, the wall anchor, §7.3 keys ×13.
4. **The docket** — `bsDocket` + §8.1.8 vectors; board lanes + serve header + waiting
   gate; transition lanes; `BSCookMode` compact strip; wrap line; §7.4 keys ×13.
5. **The UI gate** — `tests/prep-session-ask.test.mjs` (§8.2 vectors 1–5).
6. **Mutation proofs** (§8's named mutations, `cp`-based, committed head, sanity runs at
   both ends) — outcomes recorded in the PR body.
7. **Records** — WORKLOG entry; flip the cook-mode-prep-session registration from "specced,
   NOT built" to shipped; register the §10 follow-ups (mid-session re-plan, USDA window
   overlays as the reach multiplier — today 0 of 50 USDA recipes can serve-schedule with
   real windows, so their serve plans run entirely on the 3-min assumption).

Pre-push self-review against the known classes: the miss-next-to-the-fix sibling sweep
(re-grep every `bsOrchestrate(` caller for the options shape; re-grep `prep` prop
consumers), quantifier claims in the PR summary, because-clauses verified against the code,
and a re-grep of the `iosAppBroadsheetClient.jsx` symbol anchors before every edit.

---

## 10. Open questions — none block the build; defaults stated

1. **Picker input form** — native `<input type="time">` + quick chips, or chips only?
   **Default: native time + chips** (§4.1); the wire form already ships dark native
   inputs, and "guests at 7:30" is a clock-time thought.
2. **Docket on the solo cook** — should a single-dish `BSCookMode` show any roadmap?
   **Default: no** — one dish has nothing to map; the ask already skips singles.
3. **"Start now" override semantics** — re-anchor the whole plan earlier (serve time
   slides with it, restated), vs start early without moving the serve time (re-creates
   the cold-food gap deliberately). **Default: re-anchor uniformly** (§5.5) — every
   displayed number stays derived from one truth.
4. **Mid-session re-orchestration** (lane tap-to-jump, queue reorder, re-planning when the
   cook drifts) — **Default: out of v1, registered.** The engine schedules from t=0 only;
   lanes expand for information, never navigate (§5.6).
5. **Wrap-screen serve line** — show "Landed within {n} min of {clock}" always in serve
   mode, or only when spread > 0? **Default: always in serve mode** — the number is the
   feature's own receipt; it reuses the engine's spread, never re-measures.
6. **Lane density above 6 dishes** — internal scroll (default) vs collapsing back to
   chips? **Default: fixed-height internal scroll**; revisit on the owner's device pass.
7. **The station model** — one-burner-exclusive 'stove' is conservative for interleave and
   optimistic under the serve floor-clamp (§3.4.3). Multi-burner counts are an authoring-
   vocabulary change (owner + data work). **Default: keep the model; the stations note is
   the honest patch.**
8. **Existing card copy** — do Together/One-at-a-time subs change now that a third card
   reframes them? **Default: keep as built** ("Woven for timing" / "Finish, then start");
   pure presentation, tunable at review without re-translation only if changed BEFORE the
   ×13 catalogs land (step 2/3 ordering already ensures that window exists).

---

## 11. What I could NOT verify (honesty section)

1. **Nothing here has rendered in a browser or on a device.** Browser tooling is
   forbidden in this project (standing rule). Every UI claim comes from the hook-shim
   harness technique and reading the source; lane density, the dark-band time input, and
   the serve countdown's feel are unverified until the owner's on-device pass (registered
   in §9.7). The harness also no-ops effects — the 1s tick and wake lock (`:7245-7256`)
   are asserted structurally, not behaviourally.
2. **The built work is uncommitted**, so every `iosAppBroadsheetClient.jsx` /
   `cookOrchestrator.mjs` line number is a working-tree snapshot (2026-08-19). The
   framing that pointed at `git diff origin/main...HEAD` was wrong — that range is empty;
   the work exists only in `git diff`. Re-grep anchors after step 0's commit.
3. **The measured minute figures are catalog-coupled.** 21/8/33/22-min figures were
   executed against today's `_KITCHEN_STEP_META` overlays and named pairs/trios (§1.2);
   an overlay edit legitimately moves them, which is why §8.1.7 pins them as a
   change-detector rather than eternal truths. The 22-min three-dish figure holds only
   for specific trios — the framing's unqualified "3 dishes" number was reproducible but
   not universal (§1.2).
4. **Wall-clock behaviour under backgrounding.** The serve countdown is wall-anchored and
   the board holds a wake lock, but a phone that sleeps through a hold has only the
   existing timer semantics — no push, no alarm. Not built, not claimed.
5. **Translations** for §7's keys will be LLM-generated pending the standing human
   review; the per-locale rules (Turkish suffixes, Hausa plurals, real Naija Pidgin) are
   asserted by convention and the ICU gate, not by a native speaker.
6. **No database, no migration, no live-catalog question exists for this feature** — it is
   entirely source-module data + tests. The PREPPED write path is untouched by mode.
7. **The 3-minute active-step assumption** (`BS_ORCH.activeStepMin`) was never validated
   against a real cook; every plan figure inherits it. The docket's wall-anchored
   countdowns are the mitigation, not a fix.
