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
from the same rows. No new table, no new route: the coach app already CRUDs
its own authored rows over RLS (the Assign flow's rails).

### Scope — what regeneration may touch (hard limits)

- ONLY rows authored by **this coach** (`trainer_id = their provider row id`).
- ONLY the **future**: `scheduled_date >= today` (UTC date, matching the plan
  route's windows) plus the coach's undated weekly-repeat rows.
- NEVER: the client's logs (`workout_sessions` / `workout_set_logs`), past
  rows, self-authored rows (`trainer_id IS NULL`), or another coach's rows.

### The regeneration rules (deterministic, never fabricates)

1. **Intensity** — bake the load scaling into each future row's payload moves
   (deload ×0.85 · progress ×1.025 · maintain ×1 — the SAME constants as the
   display path, extracted to ONE shared pure module so the two can't drift).
   Once regenerated, `detail.training.regeneratedAt` is stamped and
   `bsApplyTrainAdjust` **skips its scaling** (no double-apply) while keeping
   the banner/labels.
2. **Weekly split / rest days** — re-map upcoming rows onto the chosen
   weekdays; a coach-set **Rest** weekday deletes that weekday's future rows
   (the deck's existing Rest card renders from absence + the banner).
3. **Sessions/week** — reducing trims the extra weekday(s); increasing only
   re-days EXISTING sessions. Regeneration cannot invent a workout the coach
   never authored — adding a session goes through Assign (the sheet says so).
4. **Weeks remaining** — shortening deletes rows past the new end date;
   extending replicates the (adjusted) weekly pattern forward via the
   existing materialization helpers, capped by the Assign flow's same bounds.
5. **Atomic-in-effect** — new rows land first, then the superseded future
   rows delete (the #1618 plan re-start precedent): no window where the
   client has no plan, no duplicates on failure.

### Nutrition — deliberately NOT menu regeneration

The nutritionist's calorie/macro targets already ARE the plan's real dials —
the Eat hero override + banner consume them. Regenerating the authored menu
(scaling portions / dropping meal slots to hit a new target) would fabricate
food the nutritionist never wrote — an honest-data violation. Kept as the
target-override model, with one companion fix in this build: the WEBSITE
nutrition surfaces read the same `detail.nutrition` targets the app does
(closing that half of the drift).

## Build plan (one PR after this spec)

- **Pure `mobile-app/src/services/adjustRegen.mjs`** (+ tests): takes the
  coach's current future rows + the adjustment → `{ inserts, deleteIds }`.
  Owns the scaling constants; `bsApplyTrainAdjust` imports them.
- **Wire into `BSProAdjustProgram.apply()`**: fetch the coach's future rows
  for the client, run the module, execute inserts→deletes over the existing
  RLS rails, then write `detail.training` (+ `regeneratedAt`) and send the
  note exactly as today. Failure surfaces honestly — detail/note only write
  after the rows land.
- **Client guard**: `bsApplyTrainAdjust` skips load scaling when
  `regeneratedAt` is present.
- **Website targets parity**: nutrition dashboards read `detail.nutrition`
  targets (small, display-only).
- War Room P2 flipped on merge; WORKLOG entry.

## Acceptance criteria

1. Coach applies **Deload** → the client's future assigned rows carry the
   scaled loads; mobile deck, calendar, and website Train all agree; past
   rows + logs byte-identical.
2. Coach sets **Wednesday = Rest** → Wednesday's future assigned rows are
   gone on every surface; the deck shows the coach-set rest card.
3. **Sessions/week 4 → 3** trims one weekday; **3 → 4** re-days only, and the
   sheet explains why nothing new appeared.
4. **Weeks 8 → 4** deletes weeks 5–8; **4 → 8** extends the adjusted pattern.
5. A second Apply composes from the CURRENT rows (no compounding double-scale
   — intensity always re-derives from the original authored loads via the
   stored base, or scaling is idempotent per `regeneratedAt` generation).
6. Self-authored and other-coach rows never change; a client with no assigned
   plan gets detail/note only (today's behavior).

## Open decisions (owner)

- **A1**: Nutrition stays target-override (recommended) — or should menu
  regeneration be specced separately?
- **A2**: On intensity re-apply (deload → progress), scale from the ORIGINAL
  authored loads (requires storing the base per move — recommended) or from
  the current rows?
- **A3**: Extending weeks — default cap at the Assign flow's 182-row bound?
