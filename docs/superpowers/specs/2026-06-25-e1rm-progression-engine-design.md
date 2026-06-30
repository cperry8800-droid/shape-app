# Design — e1RM auto-compute + strength progression engine (Phase 1)

Roadmap feature **#2** of the 5-feature to-do (steps was #1). Turns the sets
members already log into a clear "is my strength actually going up?" readout:
an **estimated 1-rep max (e1RM)** per lift, a **progression status** verdict,
and a dedicated **Strength** instrument page — with the e1RM number threaded
into the existing progress rows and the coach's client view.

- **Branch:** `feat/e1rm-progression` (kept after merge, per the no-delete
  convention). Phase 2 (prescriptive next-load suggestions) is a SEPARATE later
  spec/branch — out of scope here.
- **Scope decision (approved):** Phase 1 = analytics/display engine; Phase 2 =
  prescriptive next-load. Phase 1 UI footprint = dedicated Strength page +
  e1RM threaded into the Training-tab rows + coach lift view (mobile + web).

## Background / what exists today

- Sets are logged by the live session player → `saveWorkoutSessionLog`
  (`mobile-app/src/services/shapeBackend.js`) → rows in **`workout_set_logs`**
  (`supabase-migrations/2026-05-02-workout-session-logs.sql`). Each row:
  `move_name text`, `set_number int`, `target_reps/target_load text`,
  `completed bool`, and **`payload jsonb`** holding the actual
  `load` / `reps` / `rpe` as **free text**. FK → `workout_sessions`, `client_id`.
- Loads/reps are regex-parsed everywhere (client: `.replace(/[^0-9.]/g,'')`;
  SQL: `regexp_match(..., '([0-9]+(?:\.[0-9]+)?)')`).
- PRs already exist: `announcePRsFromSetLogs` (heaviest completed set per move,
  cap 6) → `post_my_pr_to_wall`; coach lifts via `get_client_lifts`
  (`2026-06-13-client-lifts.sql`); progress series via `/api/client/progress`
  (`series.strength` = weekly top-load, top-6 PRs); training rollups via
  `/api/client/train`.
- **There is ZERO existing e1RM / progression / progressive-overload code** —
  this is greenfield. e1RM is a pure derivation from the load/rep data already
  captured: **no new capture, no schema change to `workout_set_logs`.**

## The engine — e1RM math + progression semantics

### Estimated 1-rep max (Epley)

```text
e1rm = load × (1 + reps / 30)
```

- **reps ≤ 1 → e1rm = load** (special-cased; Epley overestimates a true single
  by ~3%).
- A set **qualifies** for e1RM when: `completed !== false`, parsed
  `load > 0` (finite), and parsed **`reps` in 1..12** (`E1RM_MAX_REPS = 12` —
  Epley is unreliable beyond ~12 reps). Sets failing this are excluded from
  e1RM **only**; the existing PR / volume / RPE math is untouched.
- **Per-session e1RM for a lift** = the **max** e1RM across that session's
  qualifying sets for that `move_name` (best working set wins).
- **Lift key** = `move_name` lowercased + trimmed (matches the PR-wall dedupe
  convention); display name = the most-recent original casing seen.

### Per-lift summary

For each lift the engine produces:

- `currentE1rm` — the **latest session's** e1RM.
- `bestE1rm` — the all-time max e1RM.
- `series` — ordered `[{ date, e1rm, load, reps, rpe }]`, one point per session
  (the qualifying best set of that session), oldest→newest.
- `status` + `deltaPct` + `lastImprovedAt` (below).

### Progression status (the verdict)

Compare a **recent window** to a **prior window**:

- Windows are **session-based with a calendar guard** (reusing the
  calendar-correctness discipline that bit the steps feature): recent = sessions
  in the last 14 days (fallback: the last 2 sessions if sparser than 14 days);
  prior = the 14 days before that (fallback: the 2 sessions before the recent
  set). `recentBest` / `priorBest` = max e1RM in each window.
- Classification (`PROGRESS_DEADBAND = 0.02`, `STALL_WEEKS = 3`):
  - **`progressing`** — `recentBest > priorBest × (1 + DEADBAND)`.
  - **`holding`** — within ±DEADBAND of `priorBest`.
  - **`stalled`** — no new all-time e1RM high for **≥ STALL_WEEKS weeks** while
    the lift was still being trained (≥1 qualifying session in that span).
  - **`building`** — **< 2 qualifying sessions**: honest "not enough data yet"
    (the steps `—` rule — never fabricate a 0 or a fake trend).
- `deltaPct` = `(recentBest − priorBest) / priorBest` (null when `building`).
- `lastImprovedAt` = date of the session that set the current `bestE1rm`.

### RPE secondary note (nice-to-have, droppable)

When `status` is `holding`/`stalled` but the **same top load** is being moved at
a **lower average RPE** across the recent vs prior window, attach a soft
`effortTrend: 'easier'` flag → surfaced as a "same load, feels easier" subnote.
Primary status stays e1RM-based. This is explicitly optional; drop it if it adds
review friction without clear value.

### Units (honest limitation)

Logged loads are stored as **bare, unit-ambiguous numbers** (the logger doesn't
reliably persist kg vs lb). So:

- e1RM **inherits whatever unit the athlete logged in** — we do NOT convert the
  stored number.
- Display shows the user's preferred unit **label** (`ShapeUnits` / `t.isMetric`
  → `kg`/`lb`) next to the number, matching how loads are shown elsewhere today.
- e1RM here is a **relative-progress instrument**; per-athlete unit consistency
  is what matters, and that holds. This limitation is documented in the module
  header and the route comment.

## Architecture (Approach A — pure module as the source of truth)

Mirrors the established `momentum.mjs` / `scoreDerive.mjs` pattern: a tested pure
ESM module is the single source of truth, with a TS twin and (where the coach
view needs it) a SQL mirror.

### `mobile-app/src/services/e1rm.mjs` (pure, no deps)

Exports + constants:

- `E1RM_MAX_REPS = 12`, `PROGRESS_DEADBAND = 0.02`, `STALL_WEEKS = 3`.
- `epleyE1rm(load, reps) → number | null` — null on non-finite / load ≤ 0 /
  reps outside 1..`E1RM_MAX_REPS`.
- `parseNum(text) → number | null` — the shared free-text → number parse
  (matches the existing `[^0-9.]` strip), reused so client + route agree.
- `bestE1rmFromSets(sets) → { e1rm, load, reps, rpe } | null` — best qualifying
  set in one session.
- `buildLiftSeries(setRows, { now }) → Lift[]` — group rows by lift key → per-
  session best → ordered series + `currentE1rm` / `bestE1rm`.
- `progressionStatus(series, { now }) → { status, deltaPct, recentBest,
  priorBest, lastImprovedAt, effortTrend }`.
- `summarizeLift(lift, { now }) → Lift summary` — combine the above into the
  shape the API returns.

### `src/lib/e1rm.ts` (TS twin)

Same constants + functions, kept in sync with the `.mjs` (a header comment in
both notes the sync requirement, as `score-derive` does). Used by the route.

### `tests/e1rm.test.mjs` (registered in `package.json` test script)

Vectors: Epley correctness (incl. reps=1 special case), rep-cap exclusion
(reps=13 → not counted), per-session max selection, deadband classification
(progressing / holding boundary), stall detection (no new high ≥3 wks),
sparse → `building`, empty → null, RPE `effortTrend` (if kept).

## Data flow / endpoints

### Client — new `GET /api/client/strength`

- `src/app/api/client/strength/route.ts`. Auth: Bearer **or** cookie
  (`clientForRequest` / `currentUser`). Auto **membership-gated** by the proxy
  (it's under `/api/client/*` — no extra wiring).
- Reads the caller's `workout_set_logs` for ~**180 days**, **`select('*')`**
  (migration-safe — PostgREST 400s an unknown explicit column), RLS-scoped to
  the caller. Runs the shared `e1rm.ts` logic.
- Returns the shape below; lifts sorted by frequency then recency, featured set
  capped at **top 12**:

```json
{
  "lifts": [
    { "key": "back squat", "name": "Back Squat",
      "currentE1rm": 142, "bestE1rm": 145, "unit": "kg",
      "status": "progressing", "deltaPct": 0.06,
      "lastImprovedAt": "2026-06-20",
      "series": [{ "date": "2026-05-02", "e1rm": 133, "load": 110, "reps": 5, "rpe": 8 }],
      "effortTrend": null }
  ],
  "generatedAt": "2026-06-25T..."
}
```

- **Fail-soft:** any unexpected error → `{ lifts: [], generatedAt }` (never a
  500 that breaks the page); the mobile page then shows the honest empty state.

### Client — `window.ShapeStrength.get()` (`shapeBackend.js`)

- Reads `/api/client/strength` via the shared **`cachedClientJson`** (60s TTL,
  uid-scoped — the "one data layer" pattern), so the Strength page and any
  threaded reads share one request.
- **Invalidate** the strength cache on workout-session save (alongside the
  existing `ShapeMetrics.invalidate()` call in `saveWorkoutSessionLog`).

### Client — thread e1RM onto `/api/client/progress` PR rows

- The progress route already computes the top-6 PRs from set logs; add an
  `e1rm` (best qualifying-set e1RM for that move) to each PR object using the
  shared `e1rm.ts`. Cheap, no extra query — lets the Training-tab PR rows show
  e1RM without a second fetch.

### Coach — extend `get_client_lifts`

- Migration **`supabase-migrations/2026-06-25-client-lifts-e1rm.sql`**: DROP +
  recreate `get_client_lifts(p_user_id)` to add an **`e1rm`** number per
  `keyLifts[]` entry (and optionally `e1rmDelta`). Epley computed in SQL from the
  already-parsed load + a newly-parsed reps (`payload->>'reps'`/`target_reps`),
  capped at 12 reps, max per lift over the existing 90-day window. Keeps the
  existing `is_coach_on_client` gating + return shape, only widening it.
- Idempotent (DROP FUNCTION IF EXISTS + CREATE). **Owner runs it** — reply with
  only the `raw.githubusercontent.com/.../2026-06-25-client-lifts-e1rm.sql` link
  (migration convention). Code degrades gracefully (no `e1rm` field) until
  applied — the coach UIs render `—` for e1RM pre-migration.

## Surfaces

### Mobile — dedicated `BSStrengthHistory` page (instrument house style)

In `iosAppBroadsheetClient.jsx`, modeled on `BSStepsHistory`:

- Standard nav bar (SHAPE logo + `Vol. 1 · No. 1` + search + tier avatar via
  `BSMeCorner`) + centered range tabs.
- Per featured lift, an instrument card (`BSPlate`): mono eyebrow (lift name),
  big **`currentE1rm`** + unit label, a **status pill** (Progressing / Holding /
  Stalled / Building — tier-colored fill when progressing, neutral otherwise),
  `deltaPct` chip, the e1RM **area chart** over the series (reuse the existing
  `AreaChart` primitive used by session-details), and the top set readout
  ("120 × 5 @ RPE 8 · best e1RM 145").
- Honest empty/`building` states ("Log a few sessions to see your estimated
  max." / per-lift `—`) — no fabricated rings or demo numbers for a signed-in
  account (the steps discipline). Signed-out preview may show a demo lift.
- "Alive" motion kept lightweight + `prefers-reduced-motion`-safe (reuse the
  step page's restraint; don't over-build).
- Entry point: a compact **`BSStrengthCard`** on the **Progress → Training tab**
  (top lift + status + "View strength →") that opens `BSStrengthHistory`.

### Mobile — Training-tab PR rows (`BSClientProgress`)

Add a small subline to each PR / key-lift row: `e1RM 142 · ↗ progressing`
(status word tier-/accent-colored). Tapping the row opens `BSStrengthHistory`
focused on that lift.

### Coach — mobile + web

- `BSProClientFullProfilePage` (`iosAppBroadsheetPros.jsx`) key-lift rows: show
  `e1rm` beside the existing best/delta (via `get_client_lifts` → `ShapeClientStats.getLifts`).
- `public/newdesign/coachClientDetail.jsx` key-lift rows: same `e1rm` value —
  it reads `/api/clients/:id/shared-overview`, which already calls the
  share-gated `get_client_lifts`, so widening that RPC feeds both coach surfaces
  with no route change. Bump the page `?v=`.

## Error handling / edge cases

- **Sparse / no data** → `building` + `—`; never a fake 0 or invented trend.
- **Garbage / non-numeric loads** → `parseNum` returns null → set excluded.
- **Bodyweight / cardio moves** (no load) → no e1RM (skipped), not an error.
- **Reps > 12** → excluded from e1RM; if a lift has zero qualifying sets it's
  omitted from the strength view entirely.
- **Route fails soft** (empty `lifts`) so the app degrades to empty/demo
  gracefully; mobile already falls back to demo on a non-200.
- **Migration-safe** coach RPC + `select('*')` route query (no explicit unknown
  column).
- **Unit ambiguity** documented in code; display uses the user's unit label.

## Testing / verification

- `tests/e1rm.test.mjs` vectors in `npm test` (added to the existing suite count).
- `tsc --noEmit` (TS twin + new route), mobile JSX parse-check, mobile build +
  `public/m` resync **from PowerShell** (Git Bash mangles `VITE_BASE=/m/`).
- Watch the **CRLF trap** on the new `.ts` / `.mjs` files (check
  `tr -cd '\r' < file | wc -c` after editing; `main` is LF, no `.gitattributes`).
- Iterate on **`staging`** preview before merge; run the full review stack
  (CodeRabbit GitHub App = authoritative + `/code-review`); required CI checks
  (**Web** · **Mobile** · **gitleaks**) green.
- **War Room** (`src/lib/warroom.ts`): register `/api/client/strength` in
  `RAW_ROUTES`; add a "Strength / e1RM progression" checklist item; track the
  `2026-06-25-client-lifts-e1rm.sql` migration as owner-manual.

## Out of scope (Phase 1)

- Prescriptive next-load / progressive-overload **suggestions** in the live
  session player (= **Phase 2**, separate spec/branch).
- Coach-set progression rules / target bands (overlaps roadmap **#4** coach
  differentiators).
- Multi-formula e1RM (Brzycki/Lombardi/etc.), bodyweight-load e1RM, and any
  change to how loads/units are *captured* (would need a logger schema change).
