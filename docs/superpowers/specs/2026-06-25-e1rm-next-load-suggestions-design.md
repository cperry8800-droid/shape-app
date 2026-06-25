# Design — e1RM next-load suggestions in the live session (Phase 2)

Roadmap feature #2, **Phase 2** — the prescriptive follow-up to the Phase 1
analytics engine (`feat/e1rm-progression`, PR #1420). When an athlete starts a
logged lift in the live session player, suggest the next target **load × reps**
from their estimated 1-rep max + recent history (a progressive-overload nudge),
as a glanceable, tap-to-fill chip. **Athlete-side only** — no coach
configuration (that's roadmap #4).

- **Branch:** `feat/e1rm-next-load`, stacked on `feat/e1rm-progression` (it
  depends on Phase 1's `e1rm.mjs` + `window.ShapeStrength`). Kept after merge.
  Retarget/rebase onto `main` once Phase 1 (PR #1420) merges.
- **Scope (approved):** athlete-side suggestion; **blend algorithm with honest
  fallbacks**; surfaced in the live session player; tap-to-fill; no new endpoint
  or migration.

## Background / what exists (from Phase 1)

- `window.ShapeStrength.get()` returns `{ lifts: [{ key, name, currentE1rm,
  bestE1rm, unit, status, deltaPct, series:[{date,e1rm,load,reps,rpe}], topSet }] }`
  — reachable in the player via the `useBSStrength()` hook. The `series` gives
  the per-day best set (load/reps/rpe) per lift; `currentE1rm` is the latest.
- The live session player **`BSSession`** (`iosAppBroadsheetClient.jsx`) iterates
  `moves` parsed `{ m (name), sets, reps, l (last/authored load) }` and renders a
  per-set grid with **load / reps / RPE** inputs. The natural slot is a teal
  instrument-plate chip above the set grid (matching the rest-timer plate).
- **Data note (Phase-1 learning):** actual logged values live in the set
  `payload` (`actualLoad`/`actualReps`/`rpe`); the Phase-1 fix made
  `/api/client/strength` read them, so `ShapeStrength.series` is populated from
  real app sessions. The suggestion reads `ShapeStrength` (no raw DB access).
- **Epley** (`epleyE1rm` in `e1rm.mjs`) is the shared intensity model; its
  inverse `30/(30+reps)` is the rep→%1RM curve used for the fallback.

## The suggestion engine (`suggestNextLoad.mjs`, pure + tested)

**Inputs:** the lift's `ShapeStrength` summary (`currentE1rm`, `unit`, `series`)
+ the authored move (`reps` target, last/authored load `l`).
**Output:** `{ load, reps, unit, basis, rationale, deltaFromLast } | null`.

### Reps
The authored rep target. For a range (`"6-8"`), target the **top** (8) so the
load suits the whole range. No authored reps → the most recent session's reps.

### Load — priority order
1. **Autoregulate** off the most recent same-lift session (the last `series`
   point's `load`/`reps`/`rpe`):
   - last `rpe ≤ AUTOREG_RPE` (8), **or** rpe blank but the athlete hit the
     authored reps → **bump**: `roundToStep(lastLoad × (1 + BUMP_PCT))`,
     minimum **one gym step**.
   - last `rpe > 8` (grindy) → **hold** at `lastLoad`.
   - `BUMP_PCT = 0.025`; **gym step** = `2.5` (kg) / `5` (lb) by unit;
     `roundToStep(x, step) = round(x/step)*step`.
2. **Sanity-bound** every autoregulated bump: never suggest a load whose implied
   e1RM `epleyE1rm(load, reps)` exceeds `currentE1rm × E1RM_CEILING` (1.05). If
   it would, clamp the load down to the ceiling.
3. **%-of-e1RM fallback** when there's an `currentE1rm` but the most recent
   session has **no usable load** to autoregulate from (a data edge — e.g. the
   latest series point carries an e1RM but a missing/zero load):
   `roundToStep(currentE1rm × 30/(30+reps))` — the Epley-consistent intensity
   for the authored reps. (`currentE1rm` derives from the series, so the common
   one-session case still autoregulates via path 1; this path is the
   degenerate-data fallback.)
4. **Repeat** the authored/last load (`move.l`) when there's no e1RM and no
   usable history.
5. **`null`** (no chip) when there's nothing numeric to suggest.

`basis ∈ 'autoreg' | 'e1rm' | 'repeat'` drives the rationale string; e.g.
`"+2.5 from last · felt easy"`, `"≈88% of your e1RM"`, `"repeat last"`.
`deltaFromLast` = suggested − last load (null when no history).

### Constants
`AUTOREG_RPE = 8`, `BUMP_PCT = 0.025`, `E1RM_CEILING = 1.05`, gym steps
`{ kg: 2.5, lb: 5 }`. Exported so they're tunable in one place.

## Surface (in `BSSession`)

A teal **instrument-plate chip above the set grid** for the current move:
**"Suggested · {load} {unit} × {reps}"** + a mono rationale line (the `basis`
string). **Tapping the chip fills the current/first un-logged set's load input**
(and reps if blank) — it **never overwrites** a value the athlete already typed.
The chip shows **only when a suggestion exists** — no chip for bodyweight/cardio
moves (no load), no matching lift + no `move.l`, or any non-numeric case
(honest, the Phase-1 discipline). Matches the rest-timer plate idiom; reduced-
motion safe; advisory only (never blocks logging — the athlete types what they
actually lift).

## Architecture

`mobile-app/src/services/suggestNextLoad.mjs` (pure, imports `epleyE1rm` from
`./e1rm.mjs` for the sanity bound) + `tests/suggest-next-load.test.mjs`
(registered in root `package.json`). Consumed in `BSSession` via the existing
`useBSStrength()` data, matching the lift by `move.m.toLowerCase()` against
`lifts[].key`, and passing the authored move + the lift summary into
`suggestNextLoad`. **No new endpoint, no migration** — client-only, reuses
Phase 1's `/api/client/strength`. The pure module is unit-agnostic (operates in
the unit the caller passes); `BSSession` passes the lift's `unit`.

## Edge cases / honest data

- No matching lift in `ShapeStrength` **and** no `move.l` → `null` (no chip).
- Non-numeric/garbage load or reps → ignored; falls through the priority chain.
- Bodyweight/cardio moves (no authored load, no lift e1RM) → `null`.
- Sanity-bound prevents a runaway bump beyond the athlete's current capacity.
- The suggestion is advisory; logging always uses the typed value.

## Testing & verification

`tests/suggest-next-load.test.mjs` vectors: autoreg bump on low/blank RPE that
hit reps; hold on high RPE; sanity-bound clamp; %-of-e1RM fallback (no history);
repeat (only authored load); `null` (nothing); rep-range targets the top; gym-
step rounding by unit. Plus: parse-check `iosAppBroadsheetClient.jsx`; mobile
build + `public/m` resync (PowerShell); `npm test`; review stack (lighter — no
endpoint/SQL/security surface beyond reusing Phase 1's gated route); staging
click-through in the live session. **No owner/migration action.**

## Out of scope (Phase 2)

- Coach-set progression rules / target bands (roadmap #4 coach differentiators).
- Cross-unit (kg↔lb) normalization (the Phase-1 unit-handling follow-up).
- Writing the suggestion back to the workout plan or notifying a coach.
- Multi-formula or velocity-based autoregulation.
