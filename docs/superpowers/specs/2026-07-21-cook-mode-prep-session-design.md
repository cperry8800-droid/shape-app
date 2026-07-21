# Cook Mode · Prep Session · Nora the sous-chef — design spec (2026-07-21)

**Status: DRAFT for owner approval.** Builds follow the approved spec, one PR per
phase, through the full review gate (CI + CodeRabbit + Codex on the final head +
owner's final say).

## 1 · Why (positioning)

Recipes today render as a flat lettered list (THE METHOD) under the Kitchen
Card. This wave adds the **doing-surface** on top: a guided, full-screen,
step-at-a-time cook-through — and then goes where no competitor is:

- **Guided cook-throughs exist** in dedicated cooking apps (SideChef's whole
  identity; Kitchen Stories' "cooking mode"; Mealime/MealPrepPro step scrolls) —
  and MyFitnessPal recently shipped a full-screen cook mode on AI-imported
  recipes. The walkthrough alone is not the differentiator.
- **No coaching platform has any of it** (Trainerize · Everfit · TrueCoach ·
  MyPTHub · WAG: meal plans are static lists/PDFs — re-confirmed 2026-07-21 on
  top of the June coach-metrics research).
- **Shape's differentiator is the closed loop only Shape can run**: the
  nutritionist-assigned meal → guided cook → one-tap log with real macros
  (+10) → Score/momentum → coach adherence read → live "cooking" presence +
  boost sheet. And the **Prep Session** — a guided multi-meal batch-prep of the
  coach-assigned week with a PREPPED state the rest of the week consumes —
  exists nowhere. **Nora speaking the steps and answering questions mid-cook**
  (grounded in the recipe AND the member's plan/macros) is a layer no cooking
  app or coaching platform has.

Same shape as the cycle-awareness finding: the mechanic is emerging in adjacent
categories (multi-recipe orchestration apps like "mise" are nascent) — the
window is open; move while it is.

## 2 · Owner decisions (binding, 2026-07-21)

1. Build **all three phases**: Cook Mode (v1) → Prep Session (v2) →
   orchestration + timers + hands-free (v3). Make it as unique as possible.
2. **Nora is the voice**: she speaks step-by-step instructions aloud and her AI
   voice answers cooking questions mid-cook.
3. **Applies to recipes as well as plan meals** — every recipe surface gets the
   walkthrough (Shape Kitchen catalog, saved Library recipes, recipe-mapped
   assigned-menu meals). The flat METHOD list stays as the default reading
   view; the walkthrough is a choice, never forced.
4. Finish hands off to the **one-tap log** (the existing rails).
5. **Cook Mode must register and process ANY recipe or meal created in the
   system** — not just the curated catalog. Coach-authored meals and single
   dishes, assigned-menu meals, and future member/AI-created recipes all
   normalize into the walkthrough via one cookable contract (§4's "The
   cookable contract"), with an honest coverage ladder for meals that carry no
   authored method.

## 3 · Doctrine (non-negotiable rules)

- **Honest-data everywhere.** Only recipes with real steps get the CTA (the
  catalog guarantees ≥4 cue-rich steps). No fabricated timers: a countdown
  renders only when the step carries a real duration (parsed or structured).
  The award chip shows only when the RPC actually granted. PREPPED renders only
  from a real prep record.
- **No points for prepping** (recommended; ruling §13.2). Prepping is
  unverifiable; the meal LOG remains the earn. The prep's reward is the
  mid-week friction drop + the coach signal.
- **Privacy rides the existing live-cooking doctrine** unchanged: a
  plan/recipe-sourced cook broadcasts its TITLE under the member's own share
  rule; Cook Mode is always recipe-sourced, so entering it may set the cooking
  presence + detail row exactly as the meal logger does today. Nothing new is
  shared; exit/finish clears.
- **Never-shaming.** Skipping steps, abandoning a cook, or never prepping reads
  as nothing anywhere. The coach prep signal states what happened ("3 meals
  prepped Sun"), never what didn't.
- **Content vs chrome i18n**: recipe content (titles, steps, ingredients) stays
  English (the Store-catalogue/recipes precedent); all Cook Mode CHROME ships
  ×13 day one in a new `cook:` namespace, registered in BOTH the i18n runtime
  NS array AND the catalog-parity test (the ships-ungated trap).

## 4 · Surface 1 — Cook Mode (single recipe walkthrough)

**Entries** (every meal/recipe surface — the cookable contract below decides
what the walkthrough can honestly offer):
- Shape Kitchen recipe detail (`BSShapeKitchenRecipe`): a **COOK THIS →**
  primary action near THE METHOD.
- Library saved recipes (via the same detail page — free).
- Eat plan-meal preview (`BSMealPreview`): EVERY assigned-menu meal gets the
  CTA — a catalog-mapped meal (recipeId when present, else exact-title match —
  no fuzzy guessing) walks the full method; an unmapped meal walks whatever
  its cookable tier supports (below).
- Coach-authored meals / single dishes (the Catalogue's MEALS·SINGLE DISHES,
  `coach_plans` meal items) wherever a member can view one.

**The cookable contract — any meal, any source (owner decision §2.5).** One
pure normalizer, `bsCookable(source)` (module + tests), ingests every
meal/recipe shape in the system — catalog recipe · assigned-menu meal ·
`coach_plans` meal/single-dish detail · a future member/AI-created recipe —
and emits the one shape the walkthrough renders:
`{ title, servings?, macros?, ingredients[], steps[], sourceKind, coach? }`.
Adapters per source; adding a future creation surface = one adapter, zero
walkthrough changes. Coverage is an **honest ladder**, never fabrication:

1. **Structured steps** (catalog, or coach-authored once the editor supports
   them) → walked verbatim.
2. **Prose method only** (a description/blurb that reads as instructions) → a
   deterministic splitter (numbered lines / sentence boundaries, tested) turns
   it into steps, labeled `FROM THE PLAN` — the coach's own words, re-paced,
   never rewritten.
3. **Ingredients but no method** → Cook Mode still opens: THE MISE + free
   timers + the log handoff, with an optional **✦ Nora drafts the method**
   (PR B) — the `/api/ai/draft-program` human-in-the-loop pattern: she
   proposes steps from the title + ingredients, the member reviews them BEFORE
   cooking, and every screen carries an `AI-DRAFTED — not from your coach`
   label. Never stored back onto the coach's plan (ruling §13.5).
4. **Title/macros only** → mise-less quick mode: timers + Nora Q&A + the log
   handoff. Never an invented ingredient or step.

Forward path: the coach draft editor gains optional structured method/steps
authoring on meal items (PR E), so newly created meals become tier-1 cookable
at the source.

**The takeover** — a full-screen doing-surface in the Cockpit/Split instrument
language (the session player's sibling, per the standing reuse ruling):
`mast={false}`, gesture-dead (`noSwipe` — a swipe can never lose your place
mid-sear), portaled into `#bs-phone-surface`.

- **THE BAND** (fixed-dark `#0b0f0f`, teal seam): ✕ exit (confirm if mid-method)
  · recipe title + `STEP n OF N` eyebrow · per-step segment strip (lit = done,
  outlined = now, dimmed = skipped) · ELAPSED · the **active timer** when one
  is running (countdown + a draining fill bar — the rest-timer grammar).
- **THE PAPER** (below the seam): the current step, large serif, its doneness
  cue prominent; a quiet INGREDIENTS peek row (expandable — household units via
  the existing converter); the coach byline where the recipe carries one.
- **Controls**: `✓ Done · Next →` (primary, clipped ink) · `← Back` · `Skip`
  (text-actions). Skipped steps stay reachable via Back. All targets ≥44px.

**Phases**:
1. **THE MISE** — one screen: structured ingredients (checkable "have it"
   rows) + prep tasks derived from the recipe's `prep` note, each row
   check/skip; an **"Already prepped — skip to the method →"** fast path; and
   when a matching PREPPED record exists (§5), the mise opens pre-checked with
   a "Prepped {day} ✓" stamp.
2. **THE METHOD** — one step per screen as above.
3. **PLATED.** — finish screen: the Kitchen Card's register (kcal · P/C/F ·
   servings) + the one-tap log handoff — plan meals ride the existing
   pristine-gated "Ate it as planned"; standalone recipes open the logger
   prefilled with the recipe's per-serving macros. Or quiet `Done` (logging is
   never forced).

**Timers (v1)**: a pure parser lifts durations from step text ("18 minutes",
"sear 3 minutes per side" → per-occurrence chips); tapping START TIMER runs the
band countdown with a gentle chime + (when Nora voice is on) a spoken "time's
up on the rice". Structured metadata (§6) overrides parsing when present.
Multiple concurrent timers allowed (they become HOLDING lanes in §6's board).

**Kitchen ergonomics**: screen **wake lock** while the takeover is open
(`navigator.wakeLock`, honest no-op where unsupported); extra-large tap zones;
the whole step screen advances on tap of the primary only (no accidental
whole-screen taps with wet hands... deliberate).

## 5 · Surface 2 — Prep Session (the Sunday ritual)

**Entry**: a **PREP THE WEEK →** door on the Eat Menu (near THE SHOP LIST
leader) + the grocery page.

**Flow**:
1. **The picker** — the assigned week's recipe-mapped meals (grouped by day) +
   saved Library recipes; multi-select with servings steppers.
2. **THE MISE, merged** — union of all selected recipes' ingredients: same-unit
   quantities sum; clashing units list both lines (honest — never a fabricated
   conversion); merged prep tasks. One big checkable board.
3. **The session** — v1 is **serial**: recipe after recipe through the same
   step screens, ordered longest-total-time first, with a transition screen
   (`RECIPE 2 OF 4 — Turkey lettuce cups`). Each recipe's PLATED stamps
   **PREPPED ✓** (no log — you didn't eat it).
4. **The wrap** — `4 meals prepped · Mon–Thu covered` + storage notes pulled
   from each recipe's `tip` (they already carry "keeps 3 days chilled").

**The PREPPED state** (no migration — the `user_goals` pattern):
`user_goals('meal_prep')` → `{ entries: [{ weekKey, dayIdx?, slot?, recipeTitle,
recipeId?, mealId?, servings, preppedAt }] }`, pruned past the freshness window
(default **4 days**, ruling §13.3). Consumers:
- **Eat day courses + home slate meal rows**: a matching meal reads
  **`PREPPED ✓ · just plate it`**; its log action stays one tap.
- **Cook Mode mise** pre-checks (§4.1).

**The coach signal** — ⚠ one **OWNER MIGRATION** (lands with PR C): SECURITY
DEFINER `get_client_meal_prep(p_user_id)` gated on `is_coach_on_client`,
returning a compact projection only (count + last `preppedAt` + covered days —
never the doc). Joins `/api/clients/[id]/shared-overview` as a `prep` leg; the
Case File nutrition area gains a one-line **PREP** register ("3 meals · Sun").
Gate: **coach link alone** (recommended — plan adherence, the live-coach-channel
ratification pattern; ruling §13.1). Absence renders nothing (never a padlock).

## 6 · The orchestration layer (v3 — where uniqueness peaks)

**Step metadata** — `steps` entries widen from `string` to
`string | { t, min?, passive?, station? }` (station ∈ oven·stove·board·off).
Backward compatible: strings stay valid everywhere; the catalog gets a scripted
+ hand-checked metadata pass on all 35 recipes;
`tests/shape-kitchen-data.test.mjs` extends (shape validity, sane `min`
ranges, passive steps must carry `min`).

**The orchestrator** — pure, injected-clock, TDD'd
`mobile-app/src/services/cookOrchestrator.mjs`: a deterministic greedy
interleaver — during recipe A's **passive** block (`min ≥ 4`), surface recipe
B's active steps; station conflicts respected (one oven, one stove — constants);
emits a timeline of `{ recipe, step, at }` + HOLDING windows. **Recipes lacking
metadata fall back to serial inside the same session** — the board never
fabricates parallelism it can't back.

**The board** — THE BAND goes multi-track: the **NOW** lane (active step) over
**HOLDING** lanes (recipe tag · what's in the oven · remaining countdown).
"While the chicken roasts, start tomorrow's rice" becomes the product's most
demo-able 10 seconds.

## 7 · Nora the sous-chef

All on the existing rails — server TTS (`/api/ai/speak`, sage voice + style
instructions, the verbatim `X-Spoken-Text` contract), server STT
(`/api/ai/transcribe`), the support-chat model.

1. **She reads the steps.** On step advance, the step text auto-speaks. A
   **NORA READS** chip in the band toggles it (persisted). Default **ON** for
   members with voice available (ruling §13.4 — a deliberate departure from the
   chat's off-by-default voice mode: reading steps aloud IS this feature).
   Gating is the existing honest ladder (signed_out / members / unavailable) —
   explicit taps toast, auto-speak failures stay silent.
2. **Hold-to-talk mid-cook.** A large mic target (wet-hands sized). Transcripts
   hit a local **command grammar first** — next · back · repeat · skip · done ·
   start the timer · how long left — executed instantly, no model round-trip.
3. **Anything else is a question for Nora.** Routed to `/api/support/chat`
   with a new optional **`cookContext`** body field — `{ recipeTitle, stepIndex,
   stepText, ingredients, servings }`, server-validated + size-bounded, injected
   as a system block beside the existing member-context. So "what can I swap
   for buttermilk?" or "how do I know it's done?" gets a grounded answer — and
   because member context rides along, "does this fit my macros today?" does
   too. The reply auto-plays (voice-chat semantics). **Read-only** — no
   proposal/write tools from the kitchen in v1.
4. **Hands-free honesty**: no wake-word in a WebView — hold-to-talk +
   auto-speak IS the v1 hands-free story, stated plainly. A native build can
   revisit.

## 8 · What this is NOT (scope fences)

- No new social surface: presence/boost rails are reused, not extended.
- No recipe authoring/import in this wave (coach-authored catalog + assigned
  menus only). AI recipe import is a separate future call.
- No Score earns for cooking or prepping (the log remains the earn).
- No web Cook Mode in this wave (doing-surfaces are mobile-first — the session
  player precedent). Web gets the **PREPPED state display** only (PR C/E).

## 9 · States · a11y · motion

- **Signed-out preview**: Cook Mode browsable on catalog recipes (the preview
  philosophy); voice honestly gated; log handoff gated as today.
- **Reduced motion**: timers render numerically (no draining animation); the
  band's one loop (live tick) parks. One-loop rule holds per screen.
- **A11y**: the takeover is `role="dialog"` + labelled by the step; step
  changes announce; timer state `aria-live="polite"`; every control ≥44px;
  Escape/✕ exits with confirm mid-method.
- **Interrupted cook**: backgrounding keeps state (component state + a light
  `localStorage` resume stamp scoped to recipe + day); reopening the recipe
  offers **Resume at step n** or start over. Abandonment writes nothing.

## 10 · Data & backend summary

| Piece | Where | Migration? |
|---|---|---|
| Cookable contract | `bsCookable` normalizer + per-source adapters + prose splitter (pure, tests) | no |
| Step timers (parsed) | pure module + tests | no |
| Step metadata | `shapeKitchenData.js` widen + data-test extension | no |
| PREPPED state | `user_goals('meal_prep')` | no |
| Coach prep leg | `get_client_meal_prep` RPC + shared-overview | ⚠ owner (PR C) |
| Nora cook Q&A | `cookContext` on `/api/support/chat` | no |
| Orchestrator | `cookOrchestrator.mjs` (pure, TDD) | no |

## 11 · Build plan (one PR each, full gate)

- **PR A — Cook Mode core**: the `bsCookable` contract (normalizer, adapters,
  prose splitter — TDD), the takeover (MISE → METHOD → PLATED), ALL entries
  (catalog · library · every assigned-menu meal · coach-authored meals),
  parsed timers, wake lock, presence/cooking broadcast reuse, log handoff,
  resume, `cook:` ×13.
- **PR B — Nora sous-chef**: auto-speak + NORA READS, hold-to-talk command
  grammar (pure, tested) + Q&A with the server `cookContext` injection, reply
  auto-play, **✦ Nora drafts the method** (tier-3 meals, human-in-the-loop,
  AI-DRAFTED label).
- **PR C — Prep Session (serial)**: picker, merged mise (pure merge module +
  tests), serial session, `meal_prep` doc + PREPPED across Eat/home/mise,
  ⚠ the coach-leg migration, Case File PREP register, web PREPPED display.
- **PR D — Orchestration**: catalog metadata pass + data-test extension,
  `cookOrchestrator.mjs` (TDD), the multi-track board, serial fallback.
- **PR E — polish/holdback**: coach draft-editor structured method/steps
  authoring on meal items (the tier-1 forward path), anything deferred from
  A–D reviews + the on-device round-up.

## 12 · Verification per PR

Parse/tsc/suite/build + LF + tr-shadow as standard; **mount-render every
takeover component** (the render-check rule — hook-order/TDZ crashes pass all
static gates); browser-verify the walkthrough advance/back/skip/timer flows on
the built bundle; orchestrator TDD with pinned timelines; the support-chat
`cookContext` bounded-input tests (oversize/malformed rejected).

## 13 · Open owner rulings (answer on the spec PR)

1. **Coach prep-signal gate** — coach link alone (recommended) or behind a
   member share toggle?
2. **No points for prepping** — ratify (recommended: none; anti-farm).
3. **PREPPED freshness window** — 4-day default display window: ratify or set.
4. **Nora auto-speak default ON in Cook Mode** (members w/ voice) — ratify the
   departure from chat's off-by-default.
5. **AI-drafted methods** (tier 3 of the cookable ladder) — ratify: allowed
   for the member's own cook session on meals with no authored method,
   human-reviewed before cooking, always labeled `AI-DRAFTED — not from your
   coach`, and NEVER written back to the coach's plan. (Alternative: coach
   pre-approval required — which would kill the spontaneous-cook case.)
6. **Web scope** — PREPPED display only this wave (recommended), or more?

## 14 · Deferred (recorded, not built)

Wake-word/continuous listening (native) · voice-driven step COMPLETION of
timers by sound · AI recipe import → Cook Mode · web Cook Mode · smart-display
casting · per-step photos/video (the coach ＋CLIP rails could attach here
later) · prep-session Score mechanics if the owner ever wants them.
