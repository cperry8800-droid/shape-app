# Adjust → full program regeneration — design spec

**Date:** 2026-07-13 · **Status:** DRAFT — for owner review before build
**Closes:** War Room P2 (Coach tools) — "Adjust → full program/plan regeneration"

## Why

The coach Adjust page (`BSProAdjustProgram`, both roles) writes
`client_programs.detail.training / .nutrition` and sends the note — but the
client's ACTUAL assigned plan never changes. Today's behavior:

- **Mobile Train deck**: `bsApplyTrainAdjust` applies the adjustment at
  DISPLAY time — intensity scales shown loads/RPE, the split re-themes day
  tags, coach Rest overrides a day's card. The underlying `client_workouts`
  rows are untouched.
- **Everything else reads the raw rows**: the calendar's derived plan events,
  the website Train page (`dashTrain.jsx` — reads `/api/client/plan`, never
  `detail.training`), and the coach's own Assign/self-plans views all show
  the UNADJUSTED plan. A deload client sees lighter loads on the mobile deck
  and the original loads on the website + calendar — **cross-surface drift**.
- **Two controls are decorative**: the *sessions/week* and *weeks remaining*
  steppers change nothing anywhere (they only reword the auto-note).

## Design (recommended): the adjustment rewrites the real rows — training only

On **Apply & Send / Apply & Notify**, the trainer's adjustment **regenerates
the client's upcoming coach-authored schedule** in `client_workouts`, so every
surface (deck, calendar, website, coach views) reads the same adjusted plan
from the same rows. The rewrite executes in **one transactional SECURITY
DEFINER RPC** (spec review round: separate client-side inserts + deletes can
strand BOTH plans when the delete leg fails — "no duplicates on failure"
needs a real transaction).

### Scope — what regeneration may touch (hard limits)

- ONLY rows authored by **this coach** (`trainer_id = their provider row id`).
- ONLY the **strict future**: `scheduled_date > today` (UTC date — TODAY's
  row is excluded: it may be in progress or already referenced by
  `workout_sessions` / `workout_set_logs`; spec review round) plus the
  coach's undated weekly-repeat rows.
- NEVER: the client's logs (`workout_sessions` / `workout_set_logs`), today's
  row, past rows, self-authored rows (`trainer_id IS NULL`), or another
  coach's rows.

### The regeneration rules (deterministic, never fabricates)

1. **Intensity — base loads are the one source of truth.** On first
   regeneration each move's authored load is preserved as
   `payload.moves[].baseL`; every scaling (this Apply and every later one)
   derives from `baseL`, never from the current displayed load — so
   deload → progress re-applies correctly and repeated Applies are
   idempotent by construction. Constants (deload ×0.85 · progress ×1.025 ·
   maintain ×1) live in ONE shared pure module the display path imports too.
2. **Regeneration state is row-scoped, not global.** Each regenerated row
   carries `payload.adjustGen = detail.training.gen` (a counter bumped per
   Apply). `bsApplyTrainAdjust` skips display scaling ONLY for rows whose
   `adjustGen` matches the current generation — a row Assigned AFTER the
   regeneration carries no gen and keeps today's display-scaling behavior
   (spec review round: a global `regeneratedAt` would un-scale rows the
   regeneration never touched).
3. **Weekly split / rest days — dated rows AND repeat sources.** Upcoming
   dated rows re-map onto the chosen weekdays; a coach-set **Rest** weekday
   deletes that weekday's future dated rows AND removes the weekday from any
   coach-authored weekly-repeat row's `repeatDow` (a repeat left with no days
   is deleted) — so later materialization can never resurrect the rest day
   (spec review round).
4. **Sessions/week — deterministic remapping.** Training weekdays sort
   ascending (Mon…Sun). Reducing N→M keeps the FIRST M training weekdays and
   deletes the rest; increasing only re-days EXISTING sessions: the current
   sessions (sorted by their weekday) map 1:1 onto the split's chosen
   weekdays in ascending order — collisions resolve by that same ordering,
   and repeated regeneration yields the identical schedule. Regeneration
   cannot invent a workout the coach never authored — adding a session goes
   through Assign (the sheet says so).
5. **Weeks remaining** — shortening deletes rows past the new end date;
   extending replicates the (adjusted) weekly pattern forward via the
   existing materialization helpers, capped by the Assign flow's 182-row
   bound.
6. **Atomic — one transaction.** The pure module emits
   `{ inserts, deleteIds, repeatPatches }`; a new SECURITY DEFINER RPC
   executes all three in a single transaction (retry-safe: the RPC validates
   every id still belongs to the caller before touching anything). No window
   where the client has no plan; a failure changes nothing.
7. **No notification storm.** `notify_on_client_workout` fires per published
   insert — regenerating a block would spam one "New workout from your
   coach" per row. The RPC sets a transaction-local flag
   (`set_config('shape.adjust_regen','1',true)`) that the trigger checks and
   skips; the coach's ONE adjustment note (the existing DM) is the only
   client-facing message (spec review round).

### Nutrition — deliberately NOT menu regeneration

The nutritionist's calorie/macro targets already ARE the plan's real dials —
the Eat hero override + banner consume them. Regenerating the authored menu
(scaling portions / dropping meal slots to hit a new target) would fabricate
food the nutritionist never wrote — an honest-data violation. Kept as the
target-override model, with one companion fix in this build: the WEBSITE
nutrition surfaces read the same `detail.nutrition` targets the app does
(closing that half of the drift).

## Build plan (one PR after this spec)

- **Migration (⚠ OWNER applies)** — `regenerate_client_workouts(p_client_id,
  p_delete_ids uuid[], p_inserts jsonb, p_repeat_patches jsonb)`: SECURITY
  DEFINER, gated on `is_discipline_coach_on_client` (training discipline),
  re-validates every delete/patch id belongs to the CALLER's provider row and
  is strictly future-dated (or an undated repeat), executes the deletes,
  inserts, and repeat patches in one transaction, and sets the
  transaction-local `shape.adjust_regen` flag; `notify_on_client_workout` amended (same
  migration) to skip when the flag is set. EXECUTE revoked from
  public/anon, granted to authenticated (the body is the guard — the
  #1459 grant lesson).
- **Pure `mobile-app/src/services/adjustRegen.mjs`** (+ tests): takes the
  coach's current future rows + the adjustment → `{ inserts, deleteIds,
  repeatPatches }`. Owns the scaling constants + `baseL`/`adjustGen`
  stamping; `bsApplyTrainAdjust` imports the constants. Test vectors:
  repeated Apply idempotence, deload→progress from `baseL` (no compounding),
  the deterministic 4→3 / 3→4 weekday mappings, rest-day repeat patching,
  the strict-future scope.
- **Wire into `BSProAdjustProgram.apply()`**: fetch the coach's future rows
  for the client, run the module, call the RPC, then write `detail.training`
  (+ the bumped `gen`) and send the note exactly as today. Failure surfaces
  honestly — detail/note only write after the RPC commits. Pre-migration the
  RPC is absent (PGRST202) → apply degrades to today's detail+note behavior.
- **Client guard**: `bsApplyTrainAdjust` skips load scaling only for rows
  whose `payload.adjustGen` matches `detail.training.gen`.
- **Website targets parity**: nutrition dashboards read `detail.nutrition`
  targets (small, display-only).
- War Room P2 flipped on merge; WORKLOG entry.

## Acceptance criteria

1. Coach applies **Deload** → the client's strictly-future assigned rows
   carry the scaled loads; mobile deck, calendar, and website Train all
   agree; today's row, past rows + logs byte-identical.
2. Coach sets **Wednesday = Rest** → Wednesday's future dated rows are gone
   AND no coach-authored weekly repeat carries Wednesday anymore — on every
   surface, and no later materialization resurrects it; the deck shows the
   coach-set rest card.
3. **Sessions/week 4 → 3** removes the LAST training weekday (ascending
   order) — same result on every re-run; **3 → 4** re-days only (the
   deterministic ascending mapping), and the sheet explains why nothing new
   appeared.
4. **Weeks 8 → 4** deletes weeks 5–8; **4 → 8** extends the adjusted pattern
   within the 182-row bound.
5. **No compounding, ever**: deload → progress re-derives from each move's
   stored `baseL`; applying the same adjustment twice yields byte-identical
   rows; a row Assigned after the regeneration (no `adjustGen`) still gets
   today's display-scaling.
6. A regeneration whose delete leg WOULD fail changes nothing (single
   transaction) — never both plans, never zero plans; exactly ONE
   client-facing message per Apply (the note — no per-row workout
   notifications).
7. Self-authored and other-coach rows never change; a client with no assigned
   plan gets detail/note only; pre-migration, Apply degrades to today's
   detail+note behavior.

## Open decisions (owner)

- **A1**: Nutrition stays target-override (recommended) — or should menu
  regeneration be specced separately?
- *(Resolved in review: intensity scales from stored per-move base loads
  (`baseL`) — the compounding question is closed; weeks-extension caps at
  the Assign flow's 182-row bound.)*
