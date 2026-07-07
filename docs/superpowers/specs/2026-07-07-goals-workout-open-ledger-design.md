# Goals "The Contract" + Live Session "The Meter" — Open Ledger redesign (mobile)

Owner-picked from the 2026-07-07 concept round (G1 + W2): the last two plate-era
client surfaces — the **Goals page** (`BSClientGoals`, Overall/Training/Nutrition
tabs) and the **live session player** (`BSSession`) — serialized into the Open
Ledger zero-box language, plus the trailing **Train deck** (`BSClientTrain`) and
**workout previews** (`BSWorkoutPreview`, `BSHomeWorkoutPreview`) which follow the
session's grammar. All in `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`.

**Presentation-only.** No migration, no new routes. `client_weigh_ins`,
`user_goals('client_goals')`, `ShapeSignals.goalProjection`, `ShapeGoalAwards`,
the set-logging flow (`startSet`/`finishSet`/`saveSessionLog`), HR capture
(`shape:hrm`), presence broadcast, e1RM suggestions (`suggestNextLoad`), swap
sheets, and every demo-vs-live gate carry over verbatim.

## Non-goals

- No website changes (the web goal page + dashboards are a separate wave).
- No new data intelligence — the verdict/heat modules only re-express numbers the
  page already computes.
- No coach-surface changes; the coach's read of shared goals is untouched.
- No changes to the edit sheets' fields or persistence (they restyle only where
  noted; forms stay quiet forms).

## Shared rules (all surfaces)

- **Zero-box.** Bordered/tinted cards die; boundaries come from drawn rules
  (ink→heat gradients), station eyebrows with heat ticks, dot-leaders, and
  whitespace. Registers are eyebrow-above-figure (`BSSdCountUp` on plain
  numerics; composites, dates, and times stay static — never a fabricated
  mid-count value).
- **Two-tier rule holds.** Sheets and forms (`BSGoalEditSheet`, the overall
  targets sheet, the primary-goal chips, `BSWeighInSheet`, the session review
  block, the share-with-coaches row) stay quiet rounded forms.
- **Teal = action.** Solid buttons keep their current fills (session CTAs, sheet
  Saves, the deck ▶). Heat never fills a primary button. Page-level actions on
  Goals are ink text + a 2px heat underline (the Standing's grammar).
- **Honest-absent.** Every empty case renders a `BSTRedact`-style redaction line,
  never a fabricated figure. Demo content stays signed-out-only.
- **One loop per page.** Goals: the breathing next-milestone dot. Session: the
  LIVE dot. Everything else is a one-shot in-view entrance
  (`useBSSdInView` + per-station seen state), gated on `bsSdReduced()`; prefer
  the shipped `bsInjectSessionDetailCss` keyframes — add none unless a draw has
  no equivalent.
- **Severity stays semantic and named** (green/amber/rust on the ETA state, rust
  on a stalled verdict line) — never color-only; the mono meta always names the
  state (`NEXT`, `STALLED`, `Z4 EFFORT`).

## 1 · Goals — "The Contract" (G1)

The three tab-views die. One continuous ledger reads like the agreement the
member signed with themselves. **Heat = the member's tier**
(`bsMyTierColor()`), line-only, on a closed placement list: header italic word,
rules, station ticks, anchor underline, milestone next-dot, action underlines,
progress leaders. Trainer rust / nutritionist gold survive **only** as
press-credit spines. ETA/state colors stay semantic.

### Composition (top → bottom)

1. **Header** (kept, retinted): eyebrow `YOUR GOAL · BY {date}` + `← Back` +
   `BSMeCorner`; serif h1 = the member's own primary goal words (profile-synced
   `primaryGoal`/`overall.title`, current last-word-italic treatment — italic
   word takes tier heat). An `EDIT` heat-underlined action beside the eyebrow
   opens the existing primary-goal chip sheet (`editPrimary`). Kills the per-tab
   goal card below the tabs (its content lives here + in the stations).
2. **Anchor index** (replaces the segmented tab rail): mono typographic index —
   `THE GOAL · TRAINING · NUTRITION · THIS WEEK` — each item scrolls to its
   station (`scrollIntoView`, refs). No scroll-spy; press feedback only. 44px
   targets.
3. **THE READ station** — the verdict lead:
   - Serif verdict (~24px) + mono subline from the new pure module (below):
     on-pace → `“4.2 kg down. Aug 12 at this pace.”`; stalled → rust second
     line; achieved / far / stale / no-projection / no-goal variants. Subline:
     `CUT · 86 → 81.8 OF 78 KG · 52% THERE`.
   - Ink→heat rule (draws once in-view).
   - **Register row (4):** `CURRENT` · `TO GO` · `PACE` · `ETA` — values from
     the existing `stats`/`etaStat` computation verbatim (ETA keeps its
     semantic green/amber/rust + named sub: `on pace / stalled / 1y+ /
     refresh`); `—` with an honest sub when < 2 weigh-ins.
   - **Action line:** `LOG WEIGH-IN` (opens `BSWeighInSheet`) · `EDIT TARGETS`
     (opens the overall sheet) — ink + heat underline, 44px.
4. **THE TERMS station** — the milestones (existing trajectory computation
   verbatim, incl. the no-goal state): dot-leader rows — state glyph (heat `✓`
   done · breathing heat dot on the next · dim `○` ahead) + `Halfway · 82 kg` +
   leader + right meta (`DONE` / `NEXT` / `AUG 12`). The next-dot is the page's
   one loop. No goal set → one redaction row + `SET THE TERMS` action (opens
   the overall sheet).
5. **TRAINING station** (rust tick on the eyebrow is NOT used — station ticks
   are tier heat; rust lives on the credit spine only):
   - Headline: serif `trainingMeta.title` + italic subtitle + `EDIT` action
     (existing headline sheet).
   - Plan press-credit (3px rust spine): `{Training plan title}` /
     `JORDAN · TRAINER · 4×/WK` — from the existing `livePlans[0]` derivation;
     signed-in with none → redaction + `FIND A COACH →` leader
     (`shape:openMarket`); demo only signed-out.
   - The tab's user-authored goal list (`data.training`) as dot-leader rows
     (name · leader · target/progress) + `＋ ADD` action → the existing
     `BSGoalEditSheet`; lift-target rows from `liveTrain` keep their live/demo
     gating.
   - Closing leader: `THE FULL TRAINING RECORD →` (existing `onOpenProgress`).
6. **NUTRITION station** — same anatomy with the gold credit spine:
   `nutritionMeta` headline + `EDIT`; plan credit from `livePlans[1]`
   (`DR. MAYA · NUTRITIONIST · 1,890 KCAL`); `data.nutrition` goal rows + `＋
   ADD`; kcal/protein target dot-leaders (existing derivations); leader to
   Progress.
7. **THIS WEEK station** — the four targets (`liveWeek` verbatim: Sessions ·
   Protein days · Sleep · 7d volume) as dot-leader rows, value right, honest
   `—` subs kept.
8. **YOUR WHY** — quiet italic serif quote when `overall.why` exists; else an
   `ADD YOUR WHY` heat-underlined action (opens the overall sheet). No box.
9. **Share with coaches** — the existing toggle row, unchanged behavior,
   restyled borderless (hairline rules above/below); it's a control, not a
   plate.

### Kills (Goals)

- The 3-up instrument segment tab rail + `tab` view state (anchors replace it).
- The per-tab goal card (gradient tint + Edit pill).
- All three `BSPlate` heroes, the `miniCard`/stat tile grids, `SecHead`'s boxed
  variants, the bordered milestones/plans/targets/why cards, the consistency
  heatmap and the Training tab's bar-chart hero (Progress owns training
  analytics — the de-dup rule), and `BSGoalsTrend` if it loses its last caller.
- Every constant-teal accent on this page (heat or semantic colors replace it);
  the purple `#8a5cf6` week-target tint.

### New pure module — `mobile-app/src/services/goalContract.mjs`

`bsGoalVerdict({ start, now, target, unit, direction, pct, proj })` →
`{ lead, sub, tone }` — the verdict strings for every engine state
(no-goal · no-projection · on-pace · slipping (`+Nd this wk` amber) · stalled
(rust tone) · far (`1y+`) · stale (`refresh`) · achieved), cut and build
directions, unit-aware rounding. Pure, no window/Intl-locale dependence beyond
`toLocaleString` on numbers. `tests/goal-contract.test.mjs` (~10 vectors)
registered in the root `package.json` test script. The component keeps zero
verdict logic.

## 2 · Live session — "The Meter" (W2)

W1's serialized skeleton + **heat = live effort**. The page that records the
session speaks the same heat ramp as the page that replays it (Session
Details). Structure and every handler stay put.

### Heat source — new pure module `mobile-app/src/services/liveEffort.mjs`

- `bsLiveEffort({ bpm, rpe })` → `{ zone: 1–5, label: 'Z1'…'Z5' } | null`.
  Priority: live bpm → last logged RPE this session → `null`.
- **Bpm bands** from a documented conservative default HRmax 190 (no per-user
  max exists; never fabricate one): `<60%` Z1 · `60–70` Z2 · `70–80` Z3 ·
  `80–90` Z4 · `≥90` Z5.
- **RPE fallback:** `≤4` Z1 · `5–6` Z2 · `7` Z3 · `8` Z4 · `≥9` Z5.
- The component maps zone → the **same 5-stop ramp Session Details' intensity
  heat uses** (cool teal → ember/red; exact tokens lifted from `bsSdHeatColor`'s
  scale at build time) and **damps it**: re-evaluate at most every 5s, color
  changes ride a ~1.2s CSS transition. `null` → the page runs `t.ACCENT`
  exactly like today. **Reduced motion → heat locks to `t.ACCENT`** (a page
  that shifts color is motion).
- `tests/live-effort.test.mjs`: band edges, fallback order, null case.

### Composition (top → bottom; current order preserved)

1. **Top row** (kept): `✕ End` · breathing heat dot + `LIVE · {elapsed}` (the
   page's one loop) · `{done}/{total}`.
2. **Zone strip** — only when a monitor is live (`hrmOn && hrNow`): a 3px
   Z1→Z5 gradient rule with a needle at the current zone + mono
   `162 BPM · Z4 EFFORT` (aria-label carries both). No HR → the existing
   `Connect HR monitor` pill unchanged. RPE-fallback mode shows **no strip**
   (no fabricated zone display — heat shifts only).
3. **Title block**: serif title; the 4px pill progress bar → a 2px drawn rule
   whose heat fill = `pct`. Meta line unchanged.
4. **Exercise hero**: eyebrow `EXERCISE N OF M` takes heat (was rust); serif
   move name + heat period; italic cue; `LAST · 165 LB` kept.
5. **Suggested load** → a dot-leader row: `SUGGESTED` (heat) · `170 lb × 5` ·
   leader · `USE →` (heat underline; same fill handler + aria-label);
   rationale as a dim mono subline. Kills the clipped card.
6. **Plate math** → one unboxed mono line: `PER SIDE (170 LB) · BAR +` with
   the colored plate chips kept (real gym plate colors are semantic).
7. **Set ledger** (grid columns kept): inputs become **underline fields** —
   bottom border only; active set = 1.5px heat; idle = dotted hairline; done =
   plain dim text, no underline. Set numbers + passive `✓` marks take heat;
   the done-toggle keeps its ≥26px hit target (heat outline, heat fill when
   done). `＋ Add set` → a plain mono text action (44px row), dashed box dies.
8. **Primary CTAs unchanged** (solid teal Log/Start, green Next/Finish, clip
   kept) — heat never touches them.
9. **Rest** (pinned position kept) → a zero-box register: `REST` eyebrow with
   heat tick + `SET N OF M · DONE` meta; serif countdown + `OF 2:00`; a 2px
   rule that **drains** (width per tick, CSS transition — not a loop); actions
   `+30 SEC` (mono text) + `SKIP REST →` (small solid teal, kept). With live
   HR: subline `148 → 121 BPM · COME DOWN TO Z2` (only ever with real HR).
   Kills the INK instrument plate.
10. **Prev / Next** — quiet squared outline buttons, behavior unchanged.
11. **Queue** → a dot-leader index: `✓`/number · serif name · leader · load;
    current row = 3px heat spine + `NOW` mono tag; done rows dim (no
    strikethrough). Rows stay ≥44px buttons.
12. **Coach message** → a Wire press credit: 3px rust role spine, name +
    `LIVE · COACHING · 2 MIN` mono credit, italic quote. Kills the gradient
    card.
13. **Finish / review block** — stays a quiet form (feel/effort chips squared,
    Share-to-community toggle + `finishSession` untouched).
14. The **live HR readout line** (`♥ 132 BPM · LIVE`) joins the heat system
    (it is the effort source); glyph kept.

### Kills (Session)

The rest instrument plate, the suggested-load clipped card, the plate-math
bordered card, boxed input cells, both pill progress bars, the dashed add-set
box, the gradient coach card, and the fixed rust/teal accent mix (heat or
action-teal replaces each).

## 3 · Train deck + workout previews (trailing — session grammar, neutral accent)

These aren't live surfaces; their heat is the neutral `t.ACCENT`. Changes are
the same serialization, smaller:

- **Deck hero** (`BSClientTrain`): the `BSPlate` dies → an unboxed lead: heat
  eyebrow (`TODAY · 5:45 PM` / week meta), serif headline + accent period,
  mono meta, the coach-adjust chips kept, and a press-credit coach row (rust
  spine · `Jordan Chen / COACH`) with the solid teal ▶ start button kept.
  The week strip, find-a-trainer bar, move list (already divider rows), swap
  flow, and on-deck section keep their behavior; on-deck rows become
  dot-leaders.
- **Previews** (`BSWorkoutPreview` + `BSHomeWorkoutPreview`): verdict-style
  head (serif title + mono meta), the move list as a dot-leader ledger
  (n · name · leader · scheme/load), coach note as a rust press credit, the
  solid teal Begin CTA kept. Boxed chips/cards die.

## Invariants (explicitly unchanged)

- Goals: `user_goals('client_goals')` read/merge/persist, `client_weigh_ins`
  as weigh-in source of truth, optimistic `logWeighIn` + `ShapeGoalAwards`
  toasts, primary-goal ⇄ profile sync, the share flag's write shape, all
  sheets' fields, `BS_GOALS_EMPTY`/`BS_GOALS_DEFAULT` gating.
- Session: `buildSetInputs`, functional-updater input writes, `startSet`/
  `finishSet`/`logSet` semantics + `setLogs` shape, `finishSession` payload
  (incl. HR rollup + privacy), `bsSetMyActivity` presence, `suggestNextLoad`
  gating (lb-only, no-clobber fill), `addSet`, calendar `autoStart`,
  `workout_started` analytics.
- Deck/previews: `bsBuildDemoTrainProgram`/`bsApplyTrainAdjust`/`ShapePlan`
  wiring, swaps persistence, scheme parsing into the player.

## Accessibility

- Every input keeps its aria-label; underline fields keep ≥44px effective row
  height; all text actions ≥44px targets.
- The zone strip and needle carry an aria-label naming bpm + zone; zone/state
  is always ALSO named in mono text (`Z4 EFFORT`, `NEXT`, `STALLED`).
- `bsSdReduced()` renders every surface in its finished state: no breath, no
  draws, rest rule at its current width, session heat locked to `t.ACCENT`.

## Verification

- Per commit: JSX parse-check · PowerShell mobile build exit 0 · full
  `npm test` (two new test files registered) · LF normalize.
- Browser drive (vite preview, `--base=/`): Goals renders as one scroll with
  working anchors + verdict variants (demo data); session heat shifts when
  synthetic `shape:hrm` events fire and stays `t.ACCENT` without them; rest
  rule drains; reduced-motion renders finished states.
- **On-device pass (owner)** before sign-off: Black/Sage/Cream papers × tier
  heats (sage/gold/teal/violet/rose) on Goals × session with and without an HR
  strap × reduced motion.

## Rollout

Two build PRs after this spec: **PR A — Goals "The Contract"** (+
`goalContract.mjs` + tests); **PR B — Session "The Meter" + deck + previews**
(+ `liveEffort.mjs` + tests). Each through the standard gate (CI green +
CodeRabbit findings addressed), squash-merged, branches kept.
