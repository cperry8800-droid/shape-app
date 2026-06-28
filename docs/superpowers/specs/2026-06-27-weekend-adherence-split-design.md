# Weekend-vs-Weekday Adherence Split + Progress-Hub Simplification

**Date:** 2026-06-27
**Status:** Design approved (pending spec review)
**Scope:** v1 = nutrition + habits dimensions. Training dimension and a per-member baseline guard are explicit fast-follows (see §10).

> This spec was hardened by an 11-agent grounding + adversarial-critique pass
> (5 grounders verifying every assumption against the live schema/code, 5
> expert lenses, 1 synthesis). The corrections that pass produced are baked in
> below; §11 records the assumptions it overturned so we don't relitigate them.

---

## 1. Problem & goal

Members who look "consistent" on a weekly average often have a hidden cliff: their
discipline holds Monday–Friday and collapses Saturday–Sunday (or the reverse).
A weekly roll-up hides it. We want to **surface the weekday-vs-weekend gap** so:

- a **member** sees, plainly and without shame, where their weekend routine slips
  and that closing it is a winnable upside;
- a **coach** can triage, at a glance across a roster, who falls off on weekends,
  and gets one concrete move to make.

**Non-goal:** diagnosing *why*. The app has no shift-work or menstrual-cycle data,
so a Sat/Sun split is **descriptive, never causal**. Copy says "your weekends run
N points under your weekdays," never "you have a weekend problem."

---

## 2. The one job per surface

- **Member Weekends card** (Progress hub → Overall tab): one glance — which
  dimension dips on weekends, by how much, and a single never-shaming line.
- **Coach roster chip**: a quiet triage marker — *who* to look at.
- **Coach client-detail plate**: the evidence + one move for *this* client.

Everything else is cut (see §9).

---

## 3. Architecture overview

```
                       ┌─────────────────────────────────────────┐
                       │  weekendSplit.mjs  (pure, tz-free)        │  SINGLE SOURCE OF TRUTH
                       │  + weekendSplit.ts (verbatim twin)        │  (all statistics live here)
                       └─────────────────────────────────────────┘
                                  ▲                       ▲
            pre-bucketed weekly buckets            pre-bucketed weekly buckets
                                  │                       │
   SELF PATH (member)             │                       │   ROSTER PATH (coach)
   client builds buckets from     │                       │   SECURITY DEFINER RPC
   cached client JSON using       │                       │   get_roster_weekend_split(uuid[])
   local-day helpers, runs        │                       │   does tz bucketing + GROUP BY,
   weekendSplit.mjs in-app        │                       │   returns weekly buckets per client;
   (NO bespoke self endpoint)     │                       │   Next route runs weekendSplit.ts
```

**Key principle the hardening pass forced:** the pure module contains **zero
timezone / DST / weekday logic**. It takes *already-bucketed, tz-free* weekly
counts and does pure arithmetic + statistics. All Sat/Sun resolution happens
**upstream** — server SQL for the roster (using a per-user IANA timezone), the
existing local-day helpers for the member's own data. This is the single biggest
twin-drift safeguard: if `Intl`/DST lived inside the module, fixtures could pass
while real DST weekends silently diverged between the Node test runner, the mobile
WebView, and the Next server. (The original design listed "DST weekend boundary"
as a *module* unit test — that was the tell that the boundary was in the wrong place.)

---

## 4. The pure module: `weekendSplit`

### 4.1 Files
- `mobile-app/src/services/weekendSplit.mjs` — source of truth.
- `src/lib/weekendSplit.ts` — verbatim twin (same constants, same math).
- Pattern mirrors `scoreDerive.mjs`/`score-derive.ts`, `momentum.mjs`, `e1rm.mjs`.

### 4.2 Input (tz-free, pre-bucketed)
Per dimension, an array of **weekly buckets**:

```js
{
  weekStart: 'YYYY-MM-DD',   // Monday of the local week (label only; not re-parsed)
  weekdayNum: number,        // numerator on weekday side (e.g. days logged, habit completions)
  weekdayDen: number,        // denominator on weekday side (e.g. weekday days, scheduled habit-days)
  weekendNum: number,        // numerator on weekend side
  weekendDen: number,        // denominator on weekend side
}
```

Each dimension is a **proportion** `num/den` per side — this is how the 2-day vs
5-day asymmetry is neutralised (rates, not raw counts). Plus an `options` object
carrying the named constants (§4.4).

### 4.3 Output

```js
{
  status: 'ok' | 'building' | 'insufficient',
  dimensions: {
    nutrition: DimResult | null,   // null = absent (omitted), NEVER rendered 0%
    habits:    DimResult | null,
    training:  null,               // v1 always null (fast-follow)
    composite: CompositeResult | null,  // DISPLAY ONLY — never a flag trigger
  },
  worstDimension: 'nutrition' | 'habits' | null,  // present dims only, lower-CI-bound ranked
  weekends: number,                // count of distinct weekends with data
}

DimResult = {
  present: true,
  weekdayRate: number, // weekday rate 0..1
  weekendRate: number, // weekend rate 0..1
  gapPp: number,       // (weekday − weekend) × 100, in pp
  se: number,          // SE(gap) from per-side denominators
  flagged: boolean,    // passes the full gate (§4.5)
  weeksObserved: number,
  weekPositiveShare: number,  // share of weeks where the gap was positive (consistency)
  nWeekdayDays: number,
  nWeekendDays: number,
}
```

`status`:
- `insufficient` — fewer than `MIN_WEEKENDS` (3) weekends of data overall. Surfaces
  render **nothing** (no chip, no card body).
- `building` — has `≥ MIN_WEEKENDS` weekends of data but no dimension has crossed its
  minimum denominator yet (every dimension still absent), or the account is younger than
  the window. Member card may show a gentle "still learning your pattern" state;
  **no flag, no chip**. (A weak-but-present dimension whose CI straddles 0 stays `ok` +
  `flagged:false` — it is NOT downgraded to `insufficient`.)
- `ok` — at least one present dimension; may or may not be `flagged`.

> **Return-shape note (hardened):** sibling rollups use `has_data:boolean` / null
> fields rendered as "—", not a novel enum. We keep `status` for the top-level
> gate but **always return the full `dimensions` object with `null` values** so
> every consumer null-checks uniformly instead of special-casing one enum.

### 4.4 Constants (named, exported, mirrored in `.ts` + SQL)
```
MIN_WEEKENDS   = 3      // weekends of data before leaving 'insufficient'
FLAG_GAP_PP    = 15     // practical floor; TUNABLE (see §10 calibration)
MIN_DIM_DAYS   = { nutrition: 12, habits: 12 }   // weekend-side denominator floor per dim
SE_Z           = 1.65   // one-sided ~95%
CONSISTENCY    = 0.60   // gap must be positive in ≥60% of observed weeks
STATUS         = { OK:'ok', BUILDING:'building', INSUFFICIENT:'insufficient' }
```
These are the **single source of truth**. `.ts` imports/mirrors them verbatim; the
SQL RPC only needs the window length and tz (it emits raw counts — it does **not**
re-implement the statistics).

### 4.5 The flag gate (statistical, not a point estimate)

A dimension is `flagged` **only when all three hold**:

1. **Practical:** `gapPp ≥ FLAG_GAP_PP` (15pp).
2. **Statistical:** `gapPp ≥ SE_Z · SE(gap)`, where
   `SE(gap) = sqrt( pWk(1−pWk)/nWeekdayDays + pWe(1−pWe)/nWeekendDays )` (×100 for pp).
   If the one-sided CI straddles 0, the dimension stays **unflagged** (`flagged:false`)
   even above the weekend minimum — a real but unprovable gap is never alarmed on.
3. **Consistency:** `weekPositiveShare ≥ CONSISTENCY` (0.60) using trimmed/median
   central tendency — so two solid weekends + one outlier does **not** flag.

**Why:** at the 3-weekend floor nutrition is a 6-trial Bernoulli — one missed Saturday
moves the weekend rate 16.7pp, *larger than the entire 15pp threshold*. A fixed pp
gate treats the noisier weekend term (~1.6× the weekday SE) as equally precise and
fires a false "you're slipping." The practical-AND-statistical-AND-consistent gate
removes the dominant small-sample false positive without over-engineering.

### 4.6 Composite (display only)
Composite is a **labelled blend over present dimensions only**, re-normalised, never
a fixed 3-way average and **never a flag trigger**. Rationale: nutrition (high-base-rate
binary), habits (count ratio), and training (0–2 sessions/weekend) are incommensurable
with no stable shared variance — a single "composite gap = 18pp" is uninterpretable and
double-counts correlated weekend skips.

### 4.7 `worstDimension`
Selected **only among present dimensions**, ranked by **lower-CI-bound** of the gap
(not raw argmax). Raw argmax over three noisy gaps lets a tiny-denominator dimension
"win" by noise and tells the coach to fix the wrong thing.

---

## 5. Dimension definitions (v1)

### 5.1 Nutrition — "did they meaningfully log"
- Source: `daily_health_snapshot` (`snapshot_date date`, `calories`, `protein_g`, …).
- **Meaningful-food floor (hardened):** a day counts as logged **only** when there is a
  real food signal (e.g. `calories ≥ floor` or `protein_g ≥ floor`). Row-existence alone
  is NOT enough — the snapshot row is also touched by hydration, check-ins, steps, and
  device sync, so bare row-existence (or a 1-kcal log) would read as 100% adherence.
- Per day → `logged ∈ {0,1}`. `den` = days in side; `num` = logged days.
- Present when weekend-side `den ≥ MIN_DIM_DAYS.nutrition` (12).

### 5.2 Habits — completion rate of **daily-cadence** habits
- Source: `user_habits` (`cadence text`, default `'daily'`), `user_habit_completions`
  (`done_on date`).
- **v1 includes ONLY daily/everyday-cadence habits** (where a weekend day is genuinely
  scheduled). `user_habits.cadence` is free-text with no per-weekday schedule, so a
  weekday-only-cadence member would otherwise show a guaranteed-false 0% weekend rate.
  Weekday-only / weekend-only habits are excluded from **both** sides.
- Per day → `num` = completions, `den` = scheduled daily-habit-days.
- A `0/0` weekend denominator is **excluded, not scored as a miss**. Present when
  weekend-side scheduled-habit-days `≥ MIN_DIM_DAYS.habits`.

### 5.3 Training — fast-follow (v1 = `null`)
- Blocked on data: `client_workouts` has **no** `scheduled_date` column (only
  `created_at`/`updated_at` + `payload jsonb`); `workout_sessions` has
  `started_at`/`ended_at`, not a plain assigned date. There is no queryable
  "this session was assigned on Saturday" today.
- v1 returns `training: null`. See §10 for the migration that turns it on.

---

## 6. Member surfaces

### 6.1 Weekends card — Progress hub, Overall tab
- A `BSPlate` (live/actionable surface) titled with the editorial system (mono eyebrow
  + serif display + accent period), placed in the Overall tab.
- Shows: present dimensions only, each as weekday-vs-weekend with the gap in pp; the
  display-only composite line; one **descriptive, never-shaming** sentence
  (e.g. *"Your weekends run 18 pts under your weekdays on nutrition — closing that is
  your easiest win this month."*).
- **States:** `insufficient` → render nothing (card absent). `building` → gentle
  "still learning your weekend pattern" empty-ish state. `ok`/unflagged → show the split
  framed as steady. `ok`/flagged → the upside-framed line above. Signed-out preview uses
  a labelled demo persona (never fake numbers in a signed-in view).
- Computed **client-side** from cached client JSON via the existing `cachedClientJson`
  path + local-day helpers, fed through `signalsMap`/`recordFromSelfData` so the card
  (and any future directive) read **one** derived value. **No bespoke
  `/api/client/weekend-split` endpoint** (cut — §9).

### 6.2 Home — no v1 wiring
The "Today · your move" `weekend` directive lever is **cut from v1** (§9): there is no
honest same-day CTA, and it would be suppressed under any real obligation lever anyway.
A Sat/Sun-morning time-bound nudge is deferred (§10) and gated on a separate decision.

---

## 7. Coach surfaces

### 7.1 Data access — `SECURITY DEFINER` RPC (not a roster-sleep clone)
- **Cannot** clone `roster-sleep`'s `.in()` select: the
  `providers_read_subscriber_snapshots` RLS policy exposes **only**
  `daily_health_snapshot` (nutrition) to coaches. `user_habits` /
  `user_habit_completions` are owner-only and `client_workouts` has no coach-read
  policy, so a plain `.in()` would return zero habit/training rows.
- Build a **`SECURITY DEFINER` set-returning RPC**
  `get_roster_weekend_split(p_client_ids uuid[])` that:
  - filters internally with `is_coach_on_client(auth.uid(), client_id)` (coach only ever
    sees their own roster — the definer context is the whole reason we don't widen RLS);
  - does **set-based GROUP BY week aggregation** (one query, not N-per-client), bucketing
    Sat/Sun in **each member's** IANA timezone;
  - returns per-client weekly buckets (the §4.2 shape) for nutrition + habits;
  - caps input at `slice(0, 200)`.
- The Next coach route runs `weekendSplit.ts` per client over the returned buckets, so the
  **statistics live in exactly one place** (the twin) — SQL only does tz-bucketing + counting.
- Endpoint: `POST /api/coach/roster-weekend { clientIds } → { ok, split: { [clientId]: WeekendSplitResult } }`.
  **Both** the roster chip and the client-detail plate call this RPC (the plate passes a
  single-element array) — no separate per-client endpoint, no shared-overview extension.

### 7.2 Roster triage chip
- A quiet mono tag, role-rust, e.g. `WKND −18`, on a client row **only** when that
  client's `worstDimension` is `flagged` (full §4.5 gate) and `status === 'ok'`.
  Suppressed for `insufficient`/`building`/unflagged and when timezone is unknown
  (§8). Renders where the roster row currently shows triage markers (the roster-sleep
  consumer is the placement precedent).

### 7.3 Client-detail "Weekend pattern" plate
- A `BSPlate` on the client-detail page: per present dimension (weekday vs weekend + gap),
  the display-only composite, and a **one-line directive** targeting `worstDimension`,
  wired to the real Manage-tab actions:
  - nutrition → "set a weekend check-in" (check-in action),
  - habits → "add a weekend-specific reminder" (reminder action),
  - composite-led (whole weekend dips) → "set one weekend anchor habit",
  - (training → "assign a short weekend session" — fast-follow only).
- Framed as **evidence + a move**, not a causal verdict.

---

## 8. Timezone & data prerequisites

- **No canonical per-user timezone exists.** `tz` lives only in
  `user_scheduled_reminders.tz` (default `'UTC'`, only set if reminders configured).
- **Add `client_profiles.timezone` (IANA `text`)**, written opportunistically on every app open
  (client already knows its zone), backfilled from `user_scheduled_reminders.tz` /
  notification settings where present.
- **Roster bucketing uses each member's `client_profiles.timezone`.** Where it is unknown/default,
  the **chip is suppressed** (we do not guess UTC and mislabel evening-Americas/Europe
  activity). Member self-path already has the device zone, so the member card works
  regardless.
- Historical `daily_health_snapshot` rows were bucketed at write without a confirmed
  offset; the client-sends-local-date strategy fixes future writes only. The 8-week read
  window is therefore best-effort on the oldest rows — acceptable for a descriptive signal.

---

## 9. Progress-hub simplification (folded in)

Decisions, corrected by grounding:

- **`BSMeKpis` is dead code** (zero callers; the Me page is `BSTerrainProfile`, which
  already links to the hub via `onOpenProgress`). Action = **delete it** (one-line dead-code
  removal). The earlier "remove the grid + add a Progress plate" is a no-op — the plate
  already exists.
- **Keep the profile identity layer** (Shape Score, disciplines rings, key lifts) — per the
  user's call. Unchanged.
- **Drop the Overall-tab "Insights" card** — but only the card JSX + its local `ana` state.
  `/api/client/analytics` **stays** (it still feeds the home masthead ticker and
  `BSTerrainProfile`'s disciplines Consistency bar, plus coach pages). Do not remove the API.
- **Keep BOTH PR cards** — Overall and Training PRs are **not** duplicates: Overall reads
  `/api/client/progress` (`{move,best,e1rm,unit}`, renders the e1RM line, taps to Strength);
  Training reads `/api/client/train` (`{lift,value,deltaPct,unit}`, `+N%` chip, no e1RM).
  Preserve the e1RM annotation + Strength-detail tap.
- **Converge with the web, do not add a KPI/adherence grid.** `dashProgress.jsx` already
  removed the adherence grid and enforces the house rule *"no bare adherence percentages
  anywhere on the client side — consistency reads as streaks and wins."* The mobile Overall
  tab should match: **comparisons lead + streaks/wins strip**, the new **Weekends card**,
  the trend chart, the (kept) PR card, Measurements/Photos. **Weekly points** is preserved by
  folding it into the streaks/wins strip — not as a bare adherence %.
- Keep an always-present motivational lead / clean empty state for zero-data accounts.

---

## 10. Fast-follows (explicitly out of v1)

1. **Training dimension.** Add indexed `client_workouts.scheduled_date date` (backfilled
   from `payload->>'scheduled_date'`; index `(client_id, scheduled_date)`). Until shipped,
   `training` stays `null`. Then: training dimension = completion of **assigned** sessions
   only, `MIN_DIM_DAYS.training = 4` assigned weekend sessions, programmed rest weekends
   (no assignment) contribute nothing.
2. **Per-member baseline guard (v2).** Flag only when the weekend gap **widens** vs the
   member's trailing 16-week baseline, plus a per-dimension "expected weekend pattern" mute —
   the main alarm-fatigue mitigation for legitimately by-design weekend behaviour.
3. **Threshold calibration.** `FLAG_GAP_PP` ships at 15 (tunable constant) and is
   recalibrated against the live distribution of weekend gaps (target ≈ 85–90th percentile
   of the consistent-member null) before GA. Thresholds stay externalised/tunable.
4. **Optional Sat/Sun-morning Home nudge**, ranked below every obligation lever — deferred
   pending a separate product call.

---

## 11. Assumptions the hardening pass overturned (do not relitigate)

| Original assumption | Reality (grounded) |
|---|---|
| `BSMeKpis` is a live duplicate grid to replace | Dead code, zero callers → delete |
| Overall & Training PRs are duplicates → merge | Different APIs + e1RM annotation → keep both |
| Add a tight KPI/adherence grid to Overall | Web banned bare adherence %; converge with streaks/wins instead |
| Composite "blend of three" can trigger the flag | Dimensions incommensurable → composite is display-only |
| `client_workouts.scheduled_date` exists | No such column → training deferred |
| Per-user timezone is stored | Only `user_scheduled_reminders.tz` → add `client_profiles.timezone` |
| Coach roster = `roster-sleep` `.in()` clone | RLS blocks habits/workouts → `SECURITY DEFINER` RPC |
| Nutrition = any row that day | Row touched by hydration/steps/sync → meaningful-food floor |
| DST handled by a module unit test | tz/DST belongs upstream; module is tz-free |
| Bespoke `/api/client/weekend-split` self endpoint | Compute client-side over cached data |

---

## 12. Testing

### 12.1 Pure-module unit tests (`weekendSplit.test.mjs` — the bulk)
- Per-dimension rate computation + gap (pp), with `num/den` proportions.
- **Statistical gate:** exact 15pp boundary; a gap above 15pp but inside the noise band
  does NOT flag; two consistent weekends + one outlier does NOT flag (consistency gate);
  one-sided CI straddling 0 → `insufficient`.
- **Presence/denominator:** weekend `den < MIN_DIM_DAYS` → dimension absent (not 0%);
  single-present-dimension member → composite == that dimension, no fabricated gaps;
  `0/0` weekend denominator excluded.
- **Habits:** weekday-cadence habit produces no weekend gap (excluded both sides).
- **Nutrition:** a 1-kcal / hydration-only day is NOT counted as logged.
- **Status:** `< MIN_WEEKENDS` weekends → `insufficient`; young account → `building`.
- **Window:** 8-week cutoff excludes older buckets.

### 12.2 Twin convention (matches `scoreDerive`/`e1rm`)
- The test runner is Node's built-in (`node --test tests/*.test.mjs`); it **cannot import a
  `.ts` file**, so — exactly like every existing twin — the `.mjs` is the **unit-tested
  source of truth** and `src/lib/weekendSplit.ts` is a **hand-mirrored** twin kept in sync by
  review (header comment names the source `.mjs` + its test file). All constants (§4.4) are
  exported from the `.mjs` and re-declared verbatim in the `.ts`; the fixture suite (§12.1)
  lives on the `.mjs`. There is no separate runnable cross-twin test (none exists for
  `scoreDerive`/`e1rm` either — the repo deliberately keeps the two app builds independent).

### 12.3 Upstream bucketing tests (where tz/DST actually lives)
- Self-path bucket builder + the SQL RPC: a DST-transition weekend
  (00:30/01:30/02:30 local in `America/New_York`) buckets correctly and leaves the gap
  unchanged vs a non-DST baseline; `tz_unknown` suppresses the chip.

### 12.4 Endpoint tests
- `POST /api/coach/roster-weekend`: returns the keyed map; is access-gated so a coach only
  ever gets their own roster (the `SECURITY DEFINER` + `is_coach_on_client` filter);
  respects the 200-id cap.

### 12.5 Surface verification (mandatory build loop — not unit tests)
- Mobile build from `mobile-app/` (`VITE_BASE='/m/' npm run build`) → republish
  `rm -rf public/m && cp -r mobile-app/dist public/m` → `diff -rq` clean (CI gate).
- `tsc --noEmit` from **repo root** (typechecks the Next routes).
- Parse-check changed `.jsx`.
- Eyeball the Weekends card + simplified Overall tab + coach chip/plate across a couple of
  themes for token violations and 0px overflow.

---

## 13. Build sequence (for the implementation plan)

1. Migration: `client_profiles.timezone` (IANA) + opportunistic client write + backfill.
2. `weekendSplit.mjs` + constants + unit tests (statistical gate first, TDD).
3. `weekendSplit.ts` twin + parity test.
4. Self-path bucket builder over cached client JSON (local-day) + `signalsMap` wiring.
5. Member Weekends card in the Overall tab (all states).
6. Progress-hub simplification: delete `BSMeKpis`; drop Insights card JSX + `ana` state;
   converge Overall with the web pattern; keep both PR cards.
7. `get_roster_weekend_split` RPC (SECURITY DEFINER) + `POST /api/coach/roster-weekend`.
8. Coach roster chip + client-detail plate + directive wiring.
9. Full verification loop; PR → CI green → review → merge.

(Fast-follows in §10 are separate spec→plan→build cycles.)
