# Coach Plans "The Catalogue" + Adjust/Schedule + Client Review — Open Ledger redesign (mobile)

The last pre-redesign pages in the app. The Coach Ledger wave (#1544–#1546)
explicitly deferred "the Plans/Chat/Me tabs + all action pages' internals
(Adjust / Schedule / …)" (its Out-of-scope section); with the client app now
fully serialized (Goals "The Contract" #1573 · Session "The Meter" #1575),
these five coach surfaces are all that remain of the plate era:

1. **Plans tab, both roles** — `BSTrainerPrograms` ("Your programs.") +
   `BSNutriPlans` ("Your plans."), one anatomy under role config.
2. **Adjust program / plan** — `BSProAdjustProgram` ("Tune the program.").
3. **Schedule** — `BSProScheduleSession` ("Book a session.").
4. **Client/Workout Review** — `BSWorkoutReviewPage` ("Client Review" nutri ·
   "Workout Review" trainer), **plus an honest-content fix to its
   nutritionist demo queue** (see §3).

All in `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx`.

**Presentation + demo data only.** No migration, no new routes, no new pure
modules. Every handler carries over verbatim: `ShapeCoachPlans`
list/create/update + the `BSProAssignPage` assign flow, the AI-draft
generate/save path, `ShapeProgramApi.get/set` (section-merge) + the Apply &
Send / Apply & Notify note delivery, `ShapeCalendar.create`, and
`ShapeWorkoutLogs.listSessions` / `addCoachReviewNote`.

## Non-goals

- No Chat/Me tab changes (Chat is shared with the client redesign already;
  the coach Me tab is the Signal profile + settings hub — separate surfaces).
- No new intelligence — no verdict engines, no new rollups.
- No changes to the plan/workout/meal-plan **builders** (`BSCoachDraftEditor`)
  or the AI-draft sheet's fields/persistence — they are forms and stay quiet
  (two-tier rule); only their entry points restyle.
- No live-data changes to the Review page's session-log fetch or note writes;
  the content fix is demo-shape only (§3).

## Shared rules (all surfaces)

- **Zero-box.** Bordered/tinted cards, pill rails, and gradient CTAs die;
  boundaries come from drawn rules (ink→heat), station eyebrows with heat
  ticks, dot-leaders, and whitespace. Registers are eyebrow-above-figure.
- **Two-tier rule holds.** Controls stay quiet rounded forms: the Adjust
  steppers/chips/split editor, the Schedule day picker + slot grid +
  duration segment, the Review note composer, and every sheet.
- **Teal = the one primary action per page** (Apply & Send / Apply & Notify ·
  Add to calendar · the assign flow's confirm). Everything else is ink text +
  a 2px heat underline (the Standing's grammar) or mono text actions.
- **Heat placement is line-only on a closed list**: header italic word,
  station ticks, ink→heat rules, action underlines, active-row spines,
  press-credit spines, dot-leader progress. Heat never fills a button.
- **Heat assignment:** Plans tab + Review = **role heat** (`bsProHeat` —
  trainer rust / nutritionist gold). Adjust + Schedule = **the client's
  member tier** (`bsTierForPoints` → `bsTierColor`, role-heat fallback for
  demo/unresolved rows) — visually continuous with the Case File whose
  MESSAGE · ADJUST · SCHEDULE action line opens them.
- **Honest-absent.** Every empty case renders a `BSTRedact`-style redaction
  line; demo content is signed-out/unlinked-only and labeled.
- **No loops.** None of these are live surfaces — zero infinite animations.
  Entrances are one-shot `useBSSdInView` + per-station seen state, gated on
  `bsSdReduced()`; use only the shipped `bsInjectSessionDetailCss` keyframes.
  Reduced motion renders every surface in its finished state.
- **Mast row inset.** Every top-of-page mast row sits in the standard
  `46px / t.padX` container (the #1574 rule — `BSPage` provides no top inset).

## 1 · Plans tab — "The Catalogue" (both roles, one anatomy)

`BSTrainerPrograms` + `BSNutriPlans` render the same composition under a role
config (heat, copy, sub-tab keys), like `BSProToday`/`BSProRosterView`.

### Composition (top → bottom)

1. **Header:** mast row (standard inset) + mono eyebrow
   `THE CATALOGUE · {N} PUBLISHED{ · {D} DRAFT}` + serif **"Your programs."**
   / **"Your plans."** (last word takes role heat, italic).
2. **LIBRARY / SOUNDTRACKS** → a typographic index (mono 9.5/800, active =
   ink + 2px underline; page-chrome teal underline per the roster's rule).
   The boxed pill pair dies. SOUNDTRACKS keeps rendering the existing
   `BSProSoundtracks` embedded body unchanged.
3. **Create actions** — the gradient AI card + the boxed BUILD pill die →
   two stacked text actions (≥44px rows): `✦ DRAFT A PLAN IN SECONDS →`
   (trainer) / `✦ DRAFT A MEAL PLAN IN SECONDS →` (nutritionist), ink + heat
   underline, and `＋ BUILD FROM SCRATCH` (mono). Same handlers; the sheets
   they open stay quiet forms.
4. **Kind sub-tabs** (trainer PLANS / WORKOUTS / PROGRAMS · nutri PLANS /
   PROGRAMS / DIET) → the same typographic index grammar.
5. **THE CATALOGUE station** (station head, heat tick): the paid-plans list
   as **dot-leader ledger rows** — mono index `01` · serif name · dotted
   leader · mono price right (`$120/MO` / `$140`) — with a meta subline
   (`12 WK · 48 ON IT · 4.9★`) and an **`ASSIGN`** heat-underlined action on
   the row's right edge (≥44px row; row tap keeps its current open/detail
   behavior; ASSIGN keeps opening `BSProAssignPage` with the plan preloaded).
   The `SORT · POPULAR →` control becomes a mono text action, behavior kept.
6. **ENROLLED station** ("Clients on plans") — dot-leader rows (client ·
   leader · plan/meta), tap-through kept.
7. **Empty cases** (no published plans · no enrolled clients · signed-out) →
   redaction lines + a `＋ BUILD FROM SCRATCH` action.

### Kills (Plans)

The LIBRARY/SOUNDTRACKS pill pair, the AI gradient card + its icon tile, the
boxed BUILD pill, the kind pill rail, every bordered catalogue/enrolled card,
and the boxed ASSIGN pill (→ underlined action).

## 2 · Adjust + Schedule — ledger heads over quiet forms

Structure and every handler stay put; these are control surfaces, so the
**page furniture** serializes while the **controls** stay quiet forms.

- **Head** (both): mast row inset + mono eyebrow (`ADJUST · {CLIENT}` /
  `SCHEDULE · {CLIENT}`) + `← BACK` + serif headline ("Tune the *program*." /
  "Book a *session*." — italic word takes the client-tier heat).
- **Client mini-card** → a Wire **press-credit row**: 3px tier spine · name ·
  mono `{PROGRAM} · WEEK 6 OF 12` credit. The bordered card dies.
- **Section heads** (WHAT · WHEN · TIME · HOW LONG · ENERGY · MACROS ·
  STRUCTURE · CONSTRAINTS · the note) → station eyebrows with tier-heat
  ticks + ink→heat rules, replacing the bare mono labels.
- **Controls unchanged in kind** (chips, day picker, slot grid, duration
  segment, steppers, macro rows, split editor, note textarea) — restyled only
  as far as the existing quiet-form conventions (squared corners, hairline
  borders, ≥44px targets); selected states may tint with the tier heat at
  line level (border/underline), never a solid heat fill.
- **Booking summary** (Schedule) → a register row (eyebrow-above-figure:
  DAY · TIME · LENGTH) instead of the summary card.
- **Macro from-macros summary** (Adjust, nutritionist) keeps its split bar —
  macro colors are semantic, not heat.
- **Primary CTAs keep solid teal** (Apply & Send / Apply & Notify · Add to
  calendar); the demo-client "sends once linked" hint keeps its honest copy.

### Kills (actions)

The bordered client mini-card, the boxed section containers, and any
constant-teal accents outside the primary CTAs (tier heat or ink replaces
them).

## 3 · Client/Workout Review — "The Queue"

- **Header:** mast row inset + mono eyebrow `THE QUEUE · {N} ITEMS` + serif
  **"Workout review."** / **"Client review."** (heat italic word) + `← BACK`.
  The status string moves to an honest mono meta line: live = `LIVE ·
  SUPABASE SESSION LOGS`, demo = `DEMO QUEUE · UNTIL CLIENT SESSIONS APPEAR`
  — never "sign in before loading…" rendered above visible demo content.
- **Queue** → dot-leader rows (serif title · leader · mono `{sets} SETS` /
  status right; sub mono line for state · duration). **Selected row = 3px
  heat spine** + ink text (the session-queue grammar The Meter shipped);
  unselected rows quiet. The tinted card list dies.
- **SESSION DETAIL station** → station head + an eyebrow-above-figure
  **register row** (SETS · AVG SET · AVG REST · ELAPSED — static composites,
  no count-ups needed) over dot-leader set rows (name + mono load sub ·
  leader · SET/REST times right). The bordered detail card + row boxes die.
- **WATCH SAMPLES station** → registers (AVG HR · MAX HR · samples meta);
  boxed tiles die.
- **REVIEW NOTES + composer** stay a quiet form (two-tier); save/status
  behavior verbatim.
- **Nutritionist demo content fix.** `demoWorkoutReviewSessions('nutritionist')`
  currently relabels workout sets as nutrition ("Meal prep check #1 ·
  5 – 245 LB" under "MACRO COMPLIANCE SESSION") — fabricated-looking lifting
  data. Replace with an honest nutrition review shape: demo entries are
  **meal-log review days** (title `Tue · 4 meals logged`, kcal vs target,
  protein, a flag line like `PROTEIN 40G UNDER · DINNER UNLOGGED`), rendered
  by a nutrition detail body — register row **KCAL · TARGET · PROTEIN ·
  LOGGED** over per-meal dot-leader rows (meal · kcal · macros). The trainer
  demo queue and the live path (workout session logs, both roles) render the
  existing workout shape unchanged; the note composer serves both bodies.

### Kills (Review)

The tinted queue cards, the bordered session-detail card + boxed set rows,
the boxed watch-sample tiles, and the misleading signed-out status copy.

## Accessibility

- Every action ≥44px effective target; ASSIGN/underlined actions carry
  aria-labels naming the plan/client they act on.
- Selected queue row and active filter/index items are marked via
  `aria-current`/`aria-pressed`, never color-only; severity/status words stay
  in mono text.
- `bsSdReduced()` renders every surface finished: no draws, no entrances.

## Verification

- Per commit: JSX parse-check · PowerShell mobile build exit 0 · full
  `npm test` · LF normalize.
- Browser drive (vite preview): both roles' Plans tab (all sub-tabs, assign
  flow opens, AI-draft sheet opens), Adjust + Schedule from a Case File
  (tier heat resolves; demo fallback), Review both roles (queue select,
  detail renders, note saves locally signed-out, nutritionist shows the new
  nutrition shape), reduced-motion finished states.
- **On-device pass (owner)** before sign-off: Black/Sage/Cream papers ×
  rust/gold role heats × client tier heats (sage/gold/teal/violet/rose) on
  Adjust/Schedule.

## Rollout

Two build PRs after this spec, standard gate (CI green; squash-merge;
branches kept):

- **PR A — Plans "The Catalogue"** (both roles).
- **PR B — Adjust + Schedule heads + Review "The Queue"** (incl. the
  nutritionist demo-content fix).
