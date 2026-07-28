# Progression Guardrails — v1 Design Spec

**Date:** 2026-07-27
**Status:** Build-ready. All open decisions are settled. §13.4 records the derived
values and the one accepted substitution, §13.5 the production measurement that
drove the cold-start calibration, §13.6 the ship order.

**Ship the session-RPE prompt first, as its own deploy (§13.6).**

A coach authors a training week. Before it is published to a client, the
guardrail measures the load it represents against what that client has actually
been doing, and reports one of three states. It is **advisory**: it never
rewrites a week, never blocks a coach who has read the flag, and never
substitutes its judgement for theirs. Red costs the coach one extra click and a
reason; nothing more.

---

## 1. Purpose and the shape of the answer

The guardrail answers one question: *is this week an unusually large jump for
this client?* It answers with a state, the axes that produced it, and the
numbers behind them.

| State | Meaning | Coach experience |
|---|---|---|
| `green` | Nothing exceeded | Silent. No chip, no interstitial |
| `amber` | One axis over its ramp ceiling | Dismissible inline flag on the week |
| `red` | Over the red curve, **or** two independent axes at amber | Explicit acknowledgment with a reason before publish; logged |

Red is deliberately expensive, so it must be genuinely rare. Every threshold in
this document is a tuning knob, expected to move after launch on real flag-rate
data — which is why §10.2 makes telemetry a v1 requirement rather than a
follow-up.

---

## 2. What already exists (and must be reused, not rebuilt)

### 2.1 Client workout history

| Source | Contributes | Caveat |
|---|---|---|
| `public.workout_sessions` | `client_id`, `duration_seconds` (**populated** — see §3.1), `started_at`, `ended_at`, `created_at`; **gains `session_rpe` in this build** | **No per-day date column.** `get_roster_weekly_adherence` documents this and refuses to use the table for day bucketing |
| `public.workout_set_logs` | `rpe numeric(3,1)` (0–10, **nullable**), `actual_load`, `actual_reps`, joined on `session_id` | RPE is NULL when unknown, never 0 — the 2026-06-26 backfill refused to fabricate it. Rows exist **only** for in-app player sessions, never for imported activity |
| `public.client_workouts` | The authored side: `scheduled_date`, `status`, `payload.exercises[]` of `{name, sets, reps, load, seg, baseL}` | This is what a *proposed* week is |
| `public.exercise_library` | `primary_muscles text[]` | Coach-owned, free text, defaults to `{}`; authored moves reference it only by free-text `name`. See §7.3 |

`public.shape_user_tz(client_id)` is the canonical timezone helper — validated
against `pg_timezone_names`, returns NULL for an unknown zone. Clients with no
resolvable zone drop out rather than being bucketed in a fabricated one.

### 2.2 The house pattern for a judgement like this

`get_roster_weekly_adherence` (SQL) buckets; `public/newdesign/varianceBand.mjs`
(pure ESM) judges; `bsVarianceCopy()` owns every word so two surfaces cannot
word the same finding differently. The guardrail follows this split exactly.

The canonical module lives in `public/newdesign/` because the web builders load
it as a native ES module. Mobile imports it by relative path — the existing
precedent is
`import { bsVarianceCopy } from '../../../public/newdesign/varianceBand.mjs';`
at `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:9`. Node tests import the
same file. **One implementation, three consumers.**

### 2.3 Audit and override

`public.ai_audit_log` (2026-06-16) already carries
`actor_user_id, actor_role, source, action, target_user_id, target_kind,
target_id, suggestion, confirmed_payload, before_state, after_state, status,
undone_at`, with RLS scoping and a read route at `/api/ai/audit`.

`src/app/api/ai/directive/override/route.ts` is the precedent to copy: the coach
overrides the engine, **the coach wins**, the write is gated on
`is_coach_on_client`, and before/after state is logged.

### 2.4 Telemetry

`public.analytics_events` + the `track_event(p_event, p_props)` whitelisted
writer. **The whitelist is enforced in two places that must agree**: the `if
p_event not in (...)` list inside the SQL function, and `ANALYTICS_EVENTS` in
`src/lib/funnel.mjs:17`. `track_event` **silently returns** on an unknown name.
See §10.2 — this is the single most likely way this feature ships with no data.

---

## 3. The load metric, and what happens when it is absent

**Primary metric:** session RPE load in arbitrary units (AU) — session RPE (1–10)
× session duration in minutes. A week's load is the sum of its sessions.

### 3.1 Measured (historical) load

**Duration — confirmed present and populated.** `workout_sessions.duration_seconds`
(`integer not null default 0`) is written on every in-app session save at
`mobile-app/src/services/shapeBackend.js:2252`, sourced from the session timer
(`summary.captureMethod = 'in_app_session_timer'`), and mirrored to
`daily_health_snapshot.workout_minutes` at `:2312`. A baseline **is** computable;
the anchor curve is reachable.

Two rules on it:

- Duration is `duration_seconds ÷ 60`. A session with `duration_seconds = 0`
  (the column default, meaning a writer that supplied nothing) is **excluded**,
  never scored as zero load.
- `daily_health_snapshot.workout_minutes` is **not** a duration fallback for this
  metric. It is a per-*day* rollup with no link to a session's RPE, so pairing it
  with a session RPE would combine two different things. It is listed here only
  so a later reader does not reach for it.

**Both halves are required, and the completion prompt owns the gap.** A session
contributes measured load only when it has **a non-zero duration AND a session
RPE**. Either alone is worthless: sRPE is a product, and a missing factor is not
a small error, it is no measurement.

Duration already arrives for the in-app player — `finishSession` at
`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:24597` passes
`durationSeconds: elapsedSec` straight from the running timer, so that path needs
nothing new and the prompt adds only the rating.

**But that is the only path that supplies it.** A session logged any other way —
manual entry, or a path where the timer never ran — arrives with
`duration_seconds = 0` and is excluded no matter how carefully it was rated. So
the completion prompt must **capture duration too whenever the timer did not
supply it**, on the same one screen as the rating. A prompt that collects only
the rating leaves those sessions unmeasurable, and if that became the common path
no baseline would ever form and the anchor curve would never execute.

**Session RPE — a genuine session-level rating, not a set aggregate.** RPE is
rated *for the session*, post-session. Deriving it by averaging set RPEs
produces a different construct with a systematic downward bias, and a perverse
one: the same working sets score lower when a client logs more warm-up sets.
Sparse set-RPE logging is not a random sample either — people rate hard sets more
often than easy ones — so the bias does not average out across clients.

Since §3.2 is already changing the builder, v1 captures the real thing:

- **One tap on workout completion**, an integer 1–10. Skippable — a skipped
  rating stores NULL, never a default.
- **Schema change required:** add `session_rpe numeric(3,1) check (session_rpe is
  null or session_rpe between 0 and 10)` to `public.workout_sessions`, mirroring
  the existing constraint on `workout_set_logs.rpe` exactly. Additive and
  nullable, so it is safe to apply ahead of the UI.
- **The proposed side uses the same construct.** `payload.plannedRpe` (§3.2) is
  the coach's intended session effort on the same 1–10 scale that
  `session_rpe` records after the fact. History and proposal are directly
  comparable, which is the whole point.

This also closes a coverage hole that set-derived RPE cannot. Duration exists for
**every** session including ones imported from Strava, Whoop and Apple Health;
`workout_set_logs` rows exist only for sessions driven through the in-app
set-by-set player. An imported run has a duration and no sets, so under a
set-derived construct it could never contribute to the baseline regardless of how
much of the client's training it represents. A session-level rating attaches to
it.

**There is no derived fallback. A session RPE is rated or it is absent.**

A set-derived estimator was specified and then cut. It would have put two
constructs in one field — a baseline mixing true session ratings with values
inferred from set RPEs is not measuring one thing — and worse, it would have
undermined the qualifying rule below by converting unrated sessions into
pseudo-rated ones, so a week that ought to degrade to cold start would instead
qualify as *measured* on a contaminated baseline. Degrading to cold start is not
a bad outcome now that §6.1 is calibrated as a viable universal regime. **That
recalibration is the backstop.** If the skip rate turns out high, the fix is
prompt UX, not a silent estimator that hides the signal.

### Skipped ratings — the rules, and the bias they carry

- A session with no session RPE is **excluded** from the week's load sum.
- Its load is **not imputed or estimated by any means** — not from set RPEs, not
  from duration, not from a per-client average.
- **`session_rpe = 0` is ABSENT, not zero effort.** The column's CHECK permits
  0–10 while the prompt only ever emits 1–10, so a 0 can only arrive from a bug.
  Treating it as a rating would compute `0 × minutes = 0 AU` and enter a real
  week into the sum at zero, silently deflating the baseline and tightening every
  future ceiling. A 0 is excluded exactly as a null is, and does not count toward
  the more-than-half measured share.
- **An unconfirmed overrun is excluded.** The completion timer is wall-clock, so
  a session over 150 minutes that the member never confirmed is the screen having
  been left open, not a measurement. Confirmed, it counts in full. Without this
  the 150-minute prompt would only protect members who engage with it, and an
  ignored prompt would still inflate the baseline — the dangerous direction.
- **Exclusion biases the weekly total downward.** A depressed weekly total
  depresses the median baseline, which tightens future ramp ceilings. This is a
  **known and deliberately accepted property, not an oversight**: the error runs
  in the conservative direction, and the alternative is inventing load that was
  never rated.
- **Skip rate is instrumented from day one** (§10.2). It is a prompt-UX signal
  and it must be readable clean, which is exactly what a derived fallback would
  have obscured.

**Week bucketing** — `started_at` when present, else `created_at`, converted to
the client's local date via `shape_user_tz(client_id)`, then bucketed to ISO
weeks (Monday start, matching `date_trunc('week', …)` as used by
`get_roster_weekly_adherence`).

**The honest-absence rule.** A week counts as *measured* only if **more than
half** of its non-excluded sessions carry a session RPE. The boundary is strict:
**exactly half does not qualify.** A week that fails this does not count toward
the three completed weeks in §6.1, and the client stays in the cold-start
regime.

This is deliberate and it is not the same as silence: a client whose logging is
too thin to measure gets the **fixed absolute caps**, which is the safe default,
not no guardrail at all.

### 3.2 Proposed load — a required builder change

**`client_workouts.payload.exercises[]` carries no RPE and no duration.** The
proposed side of the primary metric is therefore not computable from what the
builder saves today.

Estimating it from sets × reps × load would be fabrication, which this codebase
consistently refuses (`workout_set_logs.rpe` left NULL rather than defaulted to
0; `bsCookable` emitting `steps:[]` rather than inventing a method). So v1
requires the builder to **capture** it:

- `payload.plannedMinutes` — integer, planned session duration
- `payload.plannedRpe` — number 1–10, the intended effort for the session

`payload` is `jsonb`, so **no migration is needed** for these fields — only the
builder UI and the payload contract. The AI-draft builder already carries a
session-length concept (its LENGTH chip offers 30/45/60/75 min), so the duration
half has a natural home.

**A proposed session missing either field cannot be scored.** The guardrail
returns `state: 'unknown'` with `reason: 'incomplete_week'`, names the offending
sessions, and publish is **not** gated. An unscoreable week is not a safe week —
it is an unmeasured one, and the spec says so rather than passing it green.

---

## 4. The pure core

**Create:** `public/newdesign/progressionGuardrail.mjs`

Pure ESM. No I/O, no DOM, no `Date.now()`, no `Math.random()`. Fully
deterministic: identical inputs always produce an identical result. Never
throws — malformed input yields an `unknown` state, mirroring
`bsVarianceBand`'s never-throws contract.

### 4.1 Interface

```
bsProgressionGuardrail(history, proposedWeek) -> GuardrailResult
bsGuardrailCopy(result)                       -> GuardrailCopy | null
bsInterpolateAnchors(anchors, x)              -> number
```

**STANDING RULE — the core reads RAW SESSION ROWS ONLY, never precomputed
summary aggregates.** Ruled 2026-07-28, generalising the duration-specific
amendment below, which was one instance of it. Every field in `sessions[]` is a
fact the writer observed; not one is a figure someone else already reduced. Three
reasons, each sufficient on its own:

- **An aggregate is a drift hazard by construction.** It is computed under one
  version of the rules and read under another. The load rules carry real
  judgement — RPE 0 is absent, an unconfirmed overrun is excluded, credibility is
  derived against the *current* ceiling (§13.8) — so a stored aggregate is a
  verdict frozen at write time, and §13.4 promises the thresholds will move.
- **It moves the rules out of the only place they are fixture-testable.**
  Pre-aggregating in SQL puts the derivation where §12's fixtures cannot reach
  it, which is the reasoning already recorded for the week buckets.
- **It hides its own staleness.** A wrong raw row reports `malformed` **by name**
  and degrades the evaluation honestly; a wrong aggregate reports a plausible
  number and is indistinguishable from a right one.

Concretely: `workout_sessions` also carries `completedSets`, `avgSetSeconds` and
`avgRestSeconds`. **The guardrail reads none of them, and 2b must not begin to.**
Whether *those* columns drift against their own writers is a real risk but not
this wave's — it is registered separately for whoever consumes them, deliberately
not fixed here.

Note the boundary this rule does **not** cross: it governs values that
*interpret* data. Transactional facts — a price paid, an amount charged — are
frozen at write time on purpose and are the opposite case. The test that
separates them is in §13.11.

```
// AMENDED — the core takes RAW SESSIONS and derives the weeks itself. Load
// derivation carries real rules (RPE 0 is absent; an unconfirmed overrun is
// excluded), and pre-aggregating in SQL would put them in the one place they
// are not fixture-testable. See SPEC-guardrails-2a-fixtures.md §0.
history = {
  todayISO: 'YYYY-MM-DD',                   // an INPUT — never read from a clock
  sessions: [{
    // AMENDED — the core resolves the client's own calendar week ITSELF, from
    // an instant plus a zone. It does NOT take a pre-localized `dateISO`: an
    // unknown zone must be reported as MALFORMED BY NAME, never silently
    // bucketed in UTC, which would fabricate a week boundary the client never
    // experienced (Rule E; fixture F125). A caller written against the old
    // one-field shape omits BOTH of these, so every row reports malformed and
    // every evaluation returns `unknown`.
    startedAtISO:      'ISO-8601 instant',  // when the session started, with offset
    // ⚠ THE CLIENT'S *CURRENT* ZONE, THE SAME VALUE ON EVERY ROW. A caller
    // obligation the core does not enforce — it is carried per row only because
    // rows are classified one at a time, NOT so each session can report the zone
    // it was recorded in. Mixed zones shift week membership row by row and yield
    // a baseline no client ever lived. Doing it right is what produces the
    // documented property: after travel, history re-buckets retroactively.
    timezone:          'IANA zone',         // e.g. 'America/New_York'
    durationSec:       number,
    sessionRpe:        number | null,       // null AND 0 both mean ABSENT
    // AMENDED — two FACTS, not a verdict; credibility is derived at READ time
    // against the CURRENT ceiling (§13.8).
    durationPrompted:  boolean,             // was the member ASKED about the duration
    durationAnswer:    'confirmed' | 'declined' | 'not_prompted'
  }]
}

proposedWeek = {
  weekStartISO: 'YYYY-MM-DD',
  sessions: [{ id, plannedMinutes: number, plannedRpe: number }]
}
```

```
GuardrailResult = {
  state:   'green' | 'amber' | 'red' | 'unknown',
  regime:  'cold_start' | 'measured' | 'return',
  redPath: 'curve' | 'compound' | null,     // null unless state === 'red'
  // ⚠ THE COMPLETE SET. Deploy 2b keys copy AND telemetry off `reason`, so a
  // consumer written against a partial list hits unmapped values in
  // production. Every one of these is emitted by the shipped core; adding a
  // tenth means adding it to `BS_UNKNOWN_DETAIL` in the same commit.
  reason:  string | null,                   // 'incomplete_week' | 'malformed_history'
                                            // | 'no_history' | 'no_qualifying_weeks'
                                            // | 'insufficient_weeks' | 'stale_baseline'
                                            // | 'baseline_below_floor'
                                            // | 'baseline_unreadable' | 'unscoreable'
  baseline: { au: number | null, basis: 'measured' | 'none', weeks: number },
  proposed: { totalAu: number, hardestAu: number, sessions: number },
  axes: [{
    axis:      'volume' | 'concentration' | 'distribution',  // see §7.3
    state:     'green' | 'amber' | 'red',
    checks:    [{ check, value, ceiling, tripped }],
    ceilingPct: number | null
  }]
}
```

`axes` is a **list, not a pair of named fields**, and state resolution counts
distinct `axis` values — so registering a third axis (§7.3) is a config change,
not a rewrite.

**Create:** `tests/progression-guardrail.test.mjs` — auto-discovered by
`npm test` (`node --test "tests/**/*.test.mjs"`); no registration needed.

---

## 5. The interpolation utility and the three anchor tables

No interpolation helper exists in the codebase today. `bsInterpolateAnchors` is
introduced here and used by **all three** curves, so there is one mechanism and
one fixture pattern.

Behaviour: linear interpolation between adjacent anchors; **flat below the first
anchor and flat above the last** (clamped, never extrapolated).

Anchors live in named exported config constants — not inline in the functions —
so retuning any single point is a one-line change.

### 5.1 `BS_RAMP_ANCHORS` — the amber ceiling

| Baseline (AU/week) | Ceiling |
|---|---|
| ≤ 500 | 40% |
| 1500 | 22% |
| 3000 | 13% |
| ≥ 5000 | 9% |

Reference athletes: 600 AU → ~38.2% · 1680 AU → ~20.9% · 3375 AU → ~12.3%.

### 5.2 `BS_RED_ANCHORS` — the red curve

| Baseline (AU/week) | Ceiling |
|---|---|
| ≤ 500 | 75% |
| 1500 | 45% |
| 3000 | 30% |
| ≥ 5000 | 22% |

The gap over amber widens from ~1.88× at 500 AU to ~2.44× at 5000 AU, so red
does not fire on non-events at the top of the curve where a large percentage is
a small absolute change.

### 5.3 `BS_RETURN_ANCHORS` — the return-week fraction

| Gap (days, no logged session) | Return-week cap |
|---|---|
| < 14 | *no return rule* |
| 14 | 70% of pre-break baseline |
| 28 | 55% |
| 56 – 83 | **40%, flat** — the last anchor, held flat to the horizon, exactly as the ramp curve is held flat below 500 AU. Defined, not undefined |
| ≥ 84 | **Not floored** — baseline is stale; route to the cold-start regime |

The 84-day rule is a **regime handoff, not a fifth fraction**. There is no third
regime, and 56 days is where the anchor table ends.

---

## 6. Regimes

Exactly one regime applies to any evaluation.

### 6.1 `cold_start` — no usable baseline

Applies when fewer than **three** completed *measured* weeks (§3.1) exist, or
when a gap of ≥ 84 days has made the baseline stale.

**This is the launch regime, not a rare fallback.** `workout_sessions` held zero
rows at design time (§13.5), so every client begins here and stays here until
they have accumulated three rated weeks. The caps below are calibrated for that
job — a limit for a client of *unknown* training status — not for a worst-case
deconditioned beginner. That distinction is the whole calibration.

Absolute caps, not percentages. The weekly cap scales with the **session count of
the proposed week**, which is the one thing the week itself declares about the
client without any history or intake: a coach writing six sessions is asserting
something a two-session week is not.

| Check | Amber | Red |
|---|---|---|
| **Weekly total** | `sessions × 600 AU` | `sessions × 850 AU` |
| **Hardest single session** (peak) | 700 AU | 1000 AU |

Where the numbers come from: 600 AU ≈ 75 minutes at RPE 8, a hard but ordinary
session, used as a *weekly average*; 850 AU ≈ 100 minutes at RPE 8.5 sustained on
**every** session of the week. The peak bounds are higher than the average
allowance by design — one hard day among several is normal, every day being that
hard is not. 700 AU ≈ 90 min at RPE 8; 1000 AU ≈ 120 min at RPE 8.5.

Against the reference athletes of §5.1:

| Client | Week | Sessions | Amber cap | Result |
|---|---|---|---|---|
| beginner 3×40 RPE 5 | 600 AU | 3 | 1800 | green |
| intermediate 4×60 RPE 7 | 1680 AU | 4 | 2400 | green |
| advanced 6×75 RPE 7.5 | 3375 AU | 6 | 3600 | green |

…while still catching recklessness: 4 × 90 min at RPE 10 is 3600 AU against a
3400 AU red cap → red; a lone 120-minute RPE 9 session is 1080 AU → red on the
peak bound even when the weekly total is comfortable; a beginner given
3 × 700 AU → amber.

The hardest-session bound applies **independently** of the weekly total: a week
whose total is comfortably green still flags if one day is disproportionate.

**The cost of making this regime universal, stated plainly.** Caps loose enough
to leave a normal intermediate week green are necessarily loose for a genuinely
deconditioned beginner — 3 × 600 AU is over-prescription for that person and
reaches only amber. Nothing can close that gap without knowing who the client
is, which is precisely what intake seeding would supply and precisely what
free-text intake cannot. The trade is forced by the data, and it is the right one
because amber is a visible flag, not silence.

Flags from this regime are labelled **"no baseline yet"** — never "estimated".
The claim being made is that we have no measurement and are applying a fixed
limit. That is a different and more honest statement than an estimate.

**Handoff.** On reaching three measured weeks, the client moves to `measured`
and the baseline is the **median** of the qualifying trailing weeks. Median, not
mean — a single light or interrupted week cannot depress the baseline, and
symmetrically one unusually heavy week cannot inflate it. Weeks falling inside a
detected gap do not qualify.

**Do not build intake seeding.** `client_intakes.experience_level` and
`workout_frequency` are free text, so seeding from them would collapse to the
lowest bucket for most clients while adding a database read to what must stay a
pure function. Leave a `TODO` naming this as the upgrade path once those columns
become structured enums.

### 6.2 `measured` — the normal ramp

**The trailing window is bounded on both axes.** "Last N calendar weeks" starves
a sparse logger; "last N qualifying weeks" reaches back indefinitely into stale
data. So:

> The baseline is the **median of the most recent qualifying weeks — at most 4,
> at least 3 — found by searching back at most 12 calendar weeks (84 days) from
> `todayISO`.** Fewer than 3 qualifying weeks within that reach → `cold_start`.

At most 4 because a training block is four weeks (this repo's own
`starterTemplates` cutback lands every 4th), so one block of memory adapts at the
rate training actually changes. The 12-week reach deliberately **equals** the
84-day stale horizon of §6.3 — one staleness concept, expressed once, because
two horizons are how they come to disagree.

Where the window and the gap rule disagree — qualifying weeks still in reach, but
no qualifying session for 84+ days — **the stale rule wins and routes to
`cold_start`.** A baseline you cannot trust is worse than no baseline.

**The baseline floor is 500 AU — the ramp curve's own lowest anchor.** Below its
first anchor the curve is outside its domain, so applying it there is
extrapolation dressed as measurement. **`baseline < 500 AU` → `cold_start`,
reason `baseline_below_floor`, and no percentage is ever computed against it.**
The absolute session-count caps of §6.1 govern instead, which is what they were
recalibrated to do.

An earlier draft put this at 100 AU and left a real failure open: percentages of
a tiny baseline are meaningless. A client at 200 AU who adds a second session
reaches 400 AU — a 100% increase — and with the ramp clamped to 40% and the red
curve to 75% below their first anchors, that resolved **red for ordinary beginner
progression**. The guardrail would have been loudest for the people least able to
interpret it.

Separately, **`baseline <= 0` is asserted in its own right.** It is unreachable by
construction (a measured week forces at least one rated session, and a rated
session has RPE 1–10 over a positive duration) — which is precisely the class of
reasoning that turns out to be wrong, and the failure is severe: every ceiling
becomes 0, every week goes red, the ratio divides by zero.

**`unknown` never blocks publish.** It means *we could not measure this*, which is
not a finding about the training and never the coach's fault — malformed history
comes from a logging defect, not from the week they authored. It must be **shown
to the coach** as "this week could not be checked", with the reason, never
rendered as silence: silence is indistinguishable from green, and a coach would
reasonably infer the week passed. It must be **recorded in telemetry** with its
reason, so malformed history gets fixed instead of sitting behind a UI that looks
fine.

Amber ceiling from `BS_RAMP_ANCHORS`, red curve from `BS_RED_ANCHORS`, both
against that baseline.

**The guardrail never flags a decrease.** A deliberate deload is always green. It
follows that returning to normal load *after* a deload block will flag, because
the baseline fell during the deload — intended, and the most likely real-world
false positive.

**Malformed input is reported, never coerced.** `sessionRpe: null` is *absent* —
expected, handled by exclusion. `sessionRpe: 11`, a negative `durationSec`, or a
missing `startedAtISO` or an unknown `timezone` are *malformed*, a caller bug;
silently dropping them lets a
client-side defect quietly produce a wrong baseline forever. They return
`state: 'unknown'`, `reason: 'malformed_history'`, naming the offending rows —
never clamped, never dropped, and (per the `varianceBand` precedent) never thrown.

### 6.3 `return` — after an interruption

**Gap definition:** consecutive days with no logged session **that exceeds a
minimum of 100 AU †**. A 15-minute walk must not reset three weeks of
protection. Gap length is measured from the last qualifying session to
`history.todayISO`.

When the gap is ≥ 14 days, the return-week cap from `BS_RETURN_ANCHORS` reduces
the baseline, and the **normal ramp curve then applies to that reduced number**.
Subsequent weeks re-ramp from there by the ordinary rules — no special case.

**The return week** is the proposed week containing the gap's end. A gap ending
mid-week makes that whole week the return week.

**Copy rule:** the flag says *"no sessions logged in N days"*, never *"you took N
days off"*. Logging is self-report; unlogged training and no training are
indistinguishable, and the copy must not claim to tell them apart. Same doctrine
as "no baseline yet" over "estimated".

---

## 7. Axes and state resolution

### 7.1 The two v1 axes

**Volume axis** — the weekly-total ramp. The return-week cap (§6.3) *modifies*
this axis by reducing the baseline the ramp measures against. **It is not a
separate axis** and must never be counted as a second contributor to compound
red.

**Concentration axis** — the hardest single session, via two checks:

| Check | Rule | Applies when |
|---|---|---|
| `share_of_week` | hardest session > 45% of the proposed week's own total | proposed week has **3 or more sessions** |
| `jump_vs_history` | hardest proposed session > hardest logged session in the trailing window × (1 + its own anchor ramp) | a measured hardest session exists; else the cold-start absolute bound |

The 3-session floor on `share_of_week` is load-bearing: a twice-weekly client
running two identical sessions sits at 50% each and would otherwise trip
permanently on a perfectly balanced week.

**Both checks are ONE axis.** They frequently fire together on the same session
— that is one problem described twice, and it must not satisfy the compound-red
condition on its own.

### 7.2 Resolution order

1. Any axis over the red curve (or its regime's red absolute cap) → `red`,
   `redPath: 'curve'`
2. Two or more **distinct axes** at amber, **and the proposed week has 3 or more
   sessions** → `red`, `redPath: 'compound'`
3. Any axis at amber → `amber`
4. Otherwise → `green`

Rule 1 is evaluated first so a single catastrophic jump on one axis produces red
— and therefore an audit entry — rather than sitting at amber.

**The 3-session condition on rule 2 is load-bearing, in every regime.** Below
three sessions the concentration axis is very nearly *determined* by the volume
axis: a week of two equal sessions has a hardest session of exactly half the
weekly total by construction, so the two axes cannot fail independently and
compounding them double-counts one fact.

The failure this prevents, in cold start: two sessions at 800 AU each is 1600 AU
against a two-session amber cap of 1200 (volume amber, §6.1), with a hardest
session of 800 AU against the 700 AU peak bound (concentration amber). Neither
axis is near red — 1600 is under the 1700 weekly red cap, 800 is under the 1000
peak red — yet two axes at amber would resolve to red, for two hard-but-real
100-minute sessions. Amber is the correct answer there; red is not.

This is the **same non-independence reasoning** that already disqualifies the
`share_of_week` check below three sessions (§7.1), carried to its logical end: it
governs the cold-start absolute hardest-session bound's participation in compound
red as well, not just the share check. Suppression applies to the compound path
only — **either axis can still reach red on its own** at any session count, so a
genuinely dangerous two-session week is still caught by rule 1.

The result **must name the path and list the contributing axes**. A coach cannot
act on an unexplained red.

### 7.3 Hard sets per muscle group — registered, not counted in v1

The decided secondary metric for resistance programs is registered as a third
axis, `distribution`, and is **disabled in v1's compound evaluation** by config.

It is not counted because it is not yet computable honestly: authored moves in
`client_workouts.payload.exercises[]` carry only a free-text `name` with no
reference to `exercise_library`, and `primary_muscles` is a coach-owned free-text
array defaulting to `{}`. Name-matching against a possibly-empty per-coach
library would produce muscle-group counts that are silently wrong for most
coaches — the same failure class the honest-absence rules above exist to
prevent.

Enabling it later is a config flag plus a resolver, not a rewrite of §7.2.

**Consequence to be honest about:** with only two axes live, "two or more distinct
axes at amber" is not a general rule in v1 — it is a single specific condition,
*volume and concentration both amber on a week of three or more sessions*. The
compound path is written generally so the third axis costs no rewrite, but nobody
should read §7.2 as describing a range of behaviours it cannot yet exhibit. In
practice v1 red is dominated by the curve path.

### 7.4 Kill switch — downgrade red to amber without a deploy

Red is the only state with teeth, and it is calibrated on numbers that have never
met real coaches (§13.4). If the red rate comes in wrong at launch, waiting on a
deploy to stop it is waiting while coaches learn to click through red — which
destroys the acknowledgment log's meaning permanently, and no later fix restores
it.

**The switch:** a single server-read boolean, `guardrail_red_enabled`. When
false, every `red` result is **downgraded to `amber`** in everything the coach
sees, and publish-blocking is disabled — no acknowledgment interstitial, no
`409`, no `guardrail_red_ack` entry (there is nothing to acknowledge).

**Telemetry keeps recording the truth.** The `guardrail_evaluated` event logs
`state: 'red'` with `redPath` and the contributing axes exactly as it would have,
plus `redSuppressed: true`. That is the entire point: we keep a clean read of
what red *would* have fired on, so the caps can be retuned from real data before
red is switched back on. A switch that also suppressed the telemetry would leave
us blind precisely when we most needed to see.

**Storage — it must be a database row, not an environment variable.** No app
config table exists today (only per-user `notification_settings`), so this build
adds a minimal one. An env var was considered and rejected: on Vercel, changing
one requires a redeploy to propagate, which fails the stated requirement of
flipping this *without a deploy*.

**Read path — no extra round trip.** The flag rides on the load-history RPC
response (§9.2), so the builder receives it with the history it already fetches
and the publish route reads it in the query it already makes. Builder and route
therefore agree on the state; a coach is never shown a red the server will not
enforce, or an amber the server will block.

**Fails enforced, not suppressed.** If the flag cannot be read, treat it as
`true` and enforce red, logging the read failure. This is safe *because* red is
not a hard block — it costs an acknowledgment and a reason, never the ability to
publish. Failing the other way would silently remove the gate at exactly the
moment something is already wrong.

**Fixtures:** with the flag false, a red-by-curve week resolves `amber` and
publish succeeds without an acknowledgment · the telemetry payload for that same
week still carries `state: 'red'`, its `redPath`, its axes, and
`redSuppressed: true` · no `guardrail_red_ack` row is written · an unreadable
flag enforces red.

---

## 8. Copy

`bsGuardrailCopy(result)` is the **only** source of guardrail wording, following
the `bsVarianceCopy` precedent — the mobile builder, the web builders and the
publish-rejection response all read from it, so they cannot disagree.

Display rounding happens **inside the copy function**. Every comparison upstream
stays unrounded.

Required phrasings:
- cold start → "no baseline yet"
- return rule → "no sessions logged in N days"
- red via curve → "exceeds the red threshold for this baseline"
- red via compound → "multiple limits reached at once", plus the axis names

---

## 9. Call sites — two, server authoritative

The same module, two consumers, no duplicated logic.

### 9.1 Builder (advisory, live)

- `public/newdesign/dashBuilder.jsx`
- `public/newdesign/newWorkout.jsx`
- `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx`

Runs as the week is assembled against a history payload fetched once for that
client. Amber renders inline and dismissible; red disables publish until
acknowledged, and the acknowledgment plus reason ride along on the save.

**The builder writes no telemetry** (§10.2).

### 9.2 Publish route (authoritative)

⚠ **SUPERSEDED IN SHAPE BY §9.4 (ruled 2026-07-28).** The gate is not a check
added to the existing one-session-per-call route; it is a **new week-shaped
publish boundary** that every coach writer moves onto. §9.2's *rule* stands
verbatim — red without an acknowledgment does not publish — but the boundary it
attaches to, and the enforcement default at ship, are §9.4's. Read §9.4 first.

**Modify:** `src/app/api/trainer/workout/route.ts`

After the existing auth and on-client scope gate, and before insert: load the
client's history, run the same module, and **reject a `red` result carrying no
acknowledgment** with `409` and the flag payload. A modified client must not be
able to publish a red week without an audit entry.

`unknown` (§3.2) does not gate publish — it is reported, not enforced.

### 9.4 The week-shaped boundary, and total write coverage

Three premises in §9 did not survive contact with the codebase. Recorded before
the ruling, because each one changes what 2b is:

1. **No week-shaped publish boundary exists.** `dashBuilder` flattens a program
   and fires **one POST per day** (16 for a 4×4); `BSProAssignPage` loops one
   insert per session. Nothing anywhere assembles sessions-for-one-week as an
   object before writing.
2. **`/api/trainer/workout` is not the chokepoint.** It covers the two web
   builders and Nora. The **mobile coach app does not use it at all** —
   `assignClientWorkout` (`shapeBackend.js`) is a **direct client-side
   `supabase.from('client_workouts').insert(…)`** under RLS. So is Adjust, via
   the `regenerate_client_workouts` RPC.
3. **`plannedMinutes` and `plannedRpe` exist nowhere outside this spec and the
   core.** No builder, no payload, no route carries them. Two of the three mobile
   Assign branches write `exercises: []`. Capturing them is a **prerequisite** of
   the gate scoring anything, not parallel work.

**RULING — one boundary, week-shaped, every writer through it.**

A builder submits `{ clientIds[], weekStartISO, sessions: [{ title,
scheduledDate, plannedMinutes, plannedRpe, payload }] }` in **one call**,
evaluated once and written **atomically**.

*Why not compose the week server-side from one-session-per-call:* the server
**cannot know when a week is complete** — POST 8 of 16 is indistinguishable from
an 8-session week. That breaks evaluation (16 scorings of a growing week, 15 of
them incomplete), telemetry (16 rows per real week, with no final POST to key
off — the same denominator problem that moved telemetry out of the builder,
§10.2), and acknowledgment (a coach cannot acknowledge a red for a week still
arriving).

**Coverage is total, and this is the architecture, not a nice-to-have.** The
whole rationale is one boundary every writer passes through; gating one of three
defeats it rather than partially delivering it.

| Path | Today | After 2b |
|---|---|---|
| `/api/trainer/workout` — web builders + Nora | ungated | **gated**, week-shaped |
| `assignClientWorkout` — **the mobile coach app** | ungated, **direct client-side insert** | **gated**, routed through the boundary |
| `regenerate_client_workouts` — Adjust | ungated | **gated** |

**No session-shaped coach write path stays live alongside the week-shaped one.**
Two contracts makes the gate optional in practice. If the migration cannot land
in one pass, sequence it — **mobile first** (the primary coaching surface and the
largest share of real writes), then Adjust, then web — but not past the end of
the wave.

**Adjust regeneration is the HIGHEST-risk path, not a secondary one.** It
rescales loads — precisely the guardrail's subject — and it is **automated**, so
no human looked at the result at the moment of change. A coach hand-building a
hot week at least saw it. Gating the manual path while leaving regeneration open
inverts the risk ordering. **It evaluates the post-rescale week as a FRESH
proposal against the client's history, never a delta:** the guardrail's question
is always *"is this week too big for this client"*, regardless of how the week
came to be.

**The mobile gap's failure mode is worse than having no feature.** A coach on
their phone would watch programs publish clean and conclude the guardrail passed
them. False assurance is worse than absence — the same reasoning that makes
`unknown` its own state instead of defaulting to green.

**Ships with the kill switch (§7.4) DEFAULTED TO ADVISORY.** Red computes, is
recorded, and surfaces to the coach with the acknowledgment path live — but does
**not** 409. Telemetry records the true state throughout. Enforcement flips on by
config once flag rates come back in the target band (10–15% amber, 1–2% red).
Advisory is a **runtime state of this architecture**, not an alternative to it:
shipping "advisory-only" as its own design would mean doing the integration
twice.

**Fixtures this ruling requires** (beyond §12):

- a full week is accepted atomically;
- a red week **in advisory mode** is written, with the flag recorded and **not**
  rejected;
- a red week with the kill switch **off** is rejected without an acknowledgment
  and accepted with one;
- a **partial submission is rejected as malformed**, never scored;
- **one evaluation and one telemetry row per publish**, regardless of session
  count;
- a mobile week-shaped publish is gated **identically** to web;
- regeneration producing a red week is handled by the same acknowledgment path,
  and is evaluated as a **fresh week, not a delta**;
- a **direct client-side insert attempt is rejected**.

⚠ One consequence to handle explicitly in the mobile migration: today
`assignClientWorkout` **falls back to a local record when the insert errors**. A
gate that returns a rejection must not be absorbed by that fallback and reported
to the coach as saved. **CLOSED 2026-07-28** — and it was worse than written: the
function *returned* rather than threw, so the fallback swallowed every failure;
nothing ever replayed the local record (`shape.clientWorkouts` was written by
those lines and read by nothing); and because `getOwnedTrainerId()` is a network
call that runs *before* the insert, the offline case never even reached the
fallback. Fixed as its own change, with the replay draining through the same
writer so it cannot become a side door around this gate.

### §9.5 RULED 2026-07-28 — the guardrail's universe is IN-APP, PERFORMED work

**Which `workout_sessions` rows are the client's training?** Ruled on both
discriminators. Device-imported sessions are **outside the guardrail entirely** —
not in the numerator, not in the denominator, not scored, **not gap-breaking** —
and the history reads **completed work only**.

**The reasoning, which is the part that generalises.** An unrated *in-app*
session was **asked and not answered**: a behavioural signal, correctly counted
in §3.1's measured-week denominator. A device import was **never promptable** —
there is no completion step on a watch sync — so it is **structurally
unratable, not electively unrated**. Treating them alike is the same conflation
this spec has now rejected twice: absent-vs-malformed (§13.8) and
"no baseline yet"-vs-"estimated" (§3.2).

One rule resolves both hazards §9.5 originally raised: **no cold-start pinning**
(syncs stop diluting the rated share) and **no double-count** (only the in-app
row was ever in scope — there is no dedupe pass, and none is needed).

⚠ **THE PREMISE OF THE ORIGINAL §9.5 WAS WRONG, and the correction is recorded
rather than quietly dropped.** It asserted that device imports reach the
denominator today. They do not. Verified read-only against production
2026-07-28:

- The RPC reads `public.workout_sessions` directly — no view.
- **Exactly one writer reaches that table**: `saveStructuredWorkoutSession`
  (two inserts, the second being the no-RPE retry). No `update`, `upsert` or
  `delete` anywhere in the repo, and no database function or trigger writes it.
- **All five device syncs** (Apple Health, Garmin, Oura, Strava, Whoop) write
  `activities` and `daily_health_snapshot`. Round 4's finding #5 was correct.
- Scheduled work is not in this table at all — it lives in `client_workouts`.
- The single writer hardcodes `source: 'shape_app'` and `status: 'completed'`,
  and production held **zero rows**.

So the rule is **anticipatory, not remedial** — which is precisely why it is
worth having: `workout_sessions.source` already carries a CHECK constraint of
**nine** values — so **seven sit outside the allowlist: six device sources plus
`manual`** — and `status` carries five states, of which two are in scope. The
schema anticipates writers the guardrail must not silently absorb. (The core's
§9.5 comment counts it the same way; two sites counting different sets is how a
reader ends up trusting neither.)

**Where each half lives, and why they are split.**

| Half | Enforced in | Why there |
|---|---|---|
| `status in ('completed','reviewed')` | **the RPC** | Not a judgement about whose training counts — a `planned` row is not a past session under any reading, so it belongs with the ownership and date-window bounds. Filtering it in SQL also stops non-performed rows consuming the `limit 500`. |
| `source in ('shape_app','shape_session')` | **the core** (`bsSessionInScope`) | This *is* the ruling — the contestable half, with `manual` registered for revisit. Under the §4.1 standing rule a judgement belongs where §12's fixtures reach it. |

The RPC therefore **returns `source` and `status` on every row**, closing the
contract gap the original §9.5 named.

⚠ **`reviewed` is in scope.** It reads like a widening of the ruling's word
"completed", and it was written as one — but it is not. **Three already-shipped
migrations read exactly `status in ('completed','reviewed')` against this same
table**: `2026-06-13-client-lifts.sql`, `2026-06-13-client-profile-stats.sql`
(twice), and `2026-06-25-client-lifts-e1rm.sql`. So this is the **house
definition of "work that happened" on `workout_sessions`**, and a literal
`= 'completed'` would have made the guardrail the odd one out — quietly
disagreeing with the key-lift and profile-stat reads about which sessions the
same client performed.

The independent reason still holds and is the sharper one: `reviewed` is a
*completed* session a coach has since opened, so reading `= 'completed'`
literally would mean **a coach reviewing a session removes it from that client's
baseline** — the same silent baseline-shrink class as the `started_at is not
null` drop, and worse than a direction error, because it makes the verdict
depend on an unrelated act by a different person.

`abandoned` is correctly out: nothing writes it, and "End workout early" routes
through the same completion step and saves `completed`.

⚠ **An ALLOWLIST, not a blocklist.** A blocklist silently admits the **eighth**
value outside the list the day someone widens the CHECK. `manual` falls **out**
— a hand-entered past workout was not prompted at the time either — which is a
decision, not an oversight: if a manual-entry form ever ships *with* an RPE
field, that row becomes promptable and the list should be revisited.

⚠ **An ABSENT discriminator is IN scope** — the opposite call from malformed,
and deliberately so. Both columns are `not null default`, so the **database**
cannot emit a null one; an absent field can only mean an RPC predating this
contract. Reading absence as out-of-scope would vanish an entire history on a
contract regression. The emission is pinned by
`tests/guardrail-load-history-wire.test.mjs`.

⚠ **Precision on "one writer exists": that is an APP-CODE invariant, not a
schema one**, and the distinction matters because the sentence above leans on
it. The `clients update own active workout sessions` policy carries **no status
predicate** — its body is `using (client_id = auth.uid()) with check (client_id
= auth.uid())` — so despite the name a client may update any of their own rows,
including `source` and `status`. The absent-is-in-scope call does *not* rest on
the writer count (it rests on `NOT NULL`, which is genuinely enforced), so the
conclusion stands; but the policy name overpromises relative to its body. That
is pre-existing and outside this guardrail's threat model — **registered, not
fixed here.** The hazard is not the permission; it is that a future reader
trusts the NAME and assumes a constraint that is not there. So the registered
fix is a naming one: either rename the policy to what it does, or add the
`status` predicate its name implies. Changing an auth policy inside a guardrail
branch is the wrong blast radius.

⚠ **REGISTERED REGRESSION VECTOR — a source that LIES, which no fixture can
catch.** The allowlist stops a new source *value* entering unruled. It cannot
stop a future device-sync writer stamping `shape_app`. The day one starts
writing `workout_sessions`, the likely implementation path is copy-paste from
`saveStructuredWorkoutSession`, which hardcodes `source: 'shape_app'` — and
that **fails OPEN**: device rows enter the baseline wearing the in-app label,
while every §9.5 fixture stays green, because they all construct `source` by
hand. The guard is a code-review one, recorded here because the test suite
cannot be it. A real fix, if a device writer ever lands, is to make the sync
path set `source` from the integration that produced the row and assert that in
that writer's own tests.

Fixtures: `tests/guardrail-scope.test.mjs`. ⚠ **Stated as measured, because two
earlier versions of this paragraph were wrong in the same way — a claim about
test rigor that the next auditor trusts instead of re-running.** (First it said
every fixture asserts both sides; then, correcting that, it merged two distinct
vacuity causes into one and kept only the simpler.) Mutation matrix:

| Mutant | Result |
|---|---|
| whole predicate forced `true` | **14 of 14 fail** — nothing in the suite is inert |
| `source` check removed | 11 fail |
| `status` check removed | 4 fail |

The single overlap is the truth-table test `the two halves are independent`;
every other test is sensitive to exactly one half, so no fixture pins one
discriminator while riding on the other. ⚠ That test is in both mutant sets
because two of its four rows **restate** the `ALLOWLIST` and `only work that
HAPPENED` tests. The row it was written for — out on *both* halves — adds no
kill coverage, and the both-in row cannot be killed at all; they are kept for
exhaustiveness and to document that the predicate is an AND, not because the
mutants reach them.

⚠ **TWO WAYS A SCOPE FIXTURE GOES VACUOUS.** Both were live in the first cut and
both were found by mutation, not by reading. **(1) A counterfactual that varies
two things** — the return-clock fixture restamped `source` *and* filled in a
rating together, so it proved "a rated in-app session closes the gap", which is
true either way. **(2) An assertion that compares two implementations** — the
`bsWeekLoad` fixture had no counterfactual at all; it used an unrated device row
(0 AU, never the hardest, so scope-invariant on its own) and asserted
`bsWeekLoad === bsBucketWeeks`, which holds in both worlds because removing
scope moves the two identically. **The second is the subtler trap: an
implementation-vs-implementation check reads as more rigorous than a literal and
proves strictly less.** Fixed respectively by varying `source` alone, and by
rating the row and asserting literals. The accepted cost is recorded in §13.13.

**Create:** `supabase-migrations/2026-07-27-guardrail-load-history.sql` — a
`SECURITY DEFINER` RPC returning the client's **raw trailing session rows**,
gated on `is_coach_on_client`.

⚠ **AMENDED 2026-07-28 — this paragraph said "per-week load buckets" and was
STALE.** The bucketing ruling was reversed in `SPEC-guardrails-2a-fixtures.md
§0` and §4.1 was amended to match; **this site and §11 were not**, so a 2b
implementer reading §9 in isolation would have built the exact SQL aggregation
the amendment exists to prevent — the same stale-contract-site failure recorded
in the Deploy 1 handoff. Corrected here rather than followed. See the §4.1
**standing rule**: the core reads raw session rows only, never precomputed
summary aggregates.

**The RPC returns rows, one per session, and makes no judgement of any kind** —
no weeks, no sums, no load, no qualifying flag. It selects, filters to the
trailing window, and hands over exactly the six fields §4.1 names
(`startedAtISO`, `timezone`, `durationSec`, `sessionRpe`, `durationPrompted`,
`durationAnswer`) plus the kill-switch flag (§7.4). Every derivation — week
membership in the client's own zone, RPE 0 as absent, an unconfirmed overrun as
excluded, credibility against the *current* ceiling — happens in the pure core
where §12's fixtures can reach it.

Follow `get_roster_weekly_adherence` exactly: `search_path` pinned with
`pg_temp`, every reference schema-qualified, unauthorized ids **absent** from the
result rather than erroring, `revoke all … from public, anon` before
`grant execute … to authenticated, service_role`.

### 9.3 Visibility — coach-facing only, enforced at the API boundary

**In v1 a client never sees a guardrail flag, a state, an axis, a threshold, or
an acknowledgment, on any surface.** These are a coach's working notes about
their own prescription, and a client encountering "your coach was warned this
week was too much" — or worse, clicking through to a red they cannot act on — is
a conversation the coach must own, not something the product stages for them.

**Enforce at the API boundary, not by omitting the field from a component.**
Omission in the UI is not enforcement: the data still crosses the wire, still
sits in a network response, and the next developer who adds a client surface
inherits a leak nobody wrote down. The rule is that a **client-scoped request
must not be able to retrieve this data at all**:

- The guardrail result is returned **only** on the coach publish path
  (`src/app/api/trainer/workout/route.ts`) and to the coach's own builder. It is
  never attached to any client-scoped payload — not `/api/client/train`, not
  `/api/client/dashboard`, not the client's workout detail.
- Red acknowledgments in `ai_audit_log` must not surface to a client. The
  existing RLS policy `ai_audit_read_own_or_coach` reads *own entries or, as a
  coach, entries targeting your client* — and a guardrail acknowledgment sets
  `target_user_id` to **the client**, so the "own entries" arm would expose it to
  them. **This must be closed explicitly**, either by filtering `action =
  'guardrail_red_ack'` out of the client arm of that policy or by reading these
  entries through a coach-gated path only. It is not covered by the existing
  policy — it is created by it.
- `/api/ai/audit` (§2.3) must not return `guardrail_red_ack` rows to a
  client-role caller.

**Fixture:** a client-role request for a week that carries flags and an
acknowledgment receives **nothing** — no flags key, no state, no acknowledgment
row — while the same week requested by the owning coach returns the full result.
Assert on the absence of the keys, not on their emptiness.

---

## 10. Persistence

### 10.1 Red acknowledgment — `ai_audit_log`, authoritative

No new table. Red acknowledgments are rare, legally meaningful, and read
individually; jsonb extraction over a few hundred rows is a non-issue at this
volume.

| Column | Value |
|---|---|
| `source` | `'engine'` |
| `action` | `'guardrail_red_ack'` |
| `target_kind` | `'training_week'` |
| `target_user_id` | the client |
| `suggestion` | the computed `GuardrailResult` |
| `confirmed_payload` | `{ acknowledged: true, reasonCode, reasonText }` |
| `before_state` / `after_state` | the week before and as published |

Written via the existing `auditSink` in `src/lib/ai/server.ts`.

**Authority rule:** `ai_audit_log` is authoritative for anything coach-facing or
legal. Telemetry is never consulted for an individual case.

### 10.2 Flag-rate telemetry — `analytics_events`, aggregate only

A **different object** from the acknowledgment, not a second copy of it:
telemetry covers *every* evaluation (including green), is aggregate-only, and is
never read for an individual decision. This is what makes the thresholds
retunable.

- Event: `guardrail_evaluated`
- Written **server-side at publish only** — never from the builder.
  Per-keystroke evaluations would destroy the flag-rate denominators.
- `props`: `{ state, regime, redPath, axes: [...], baselineAu, proposedAu,
  ceilingPct, overridden, reasonCode, excludedSessionRate, redSuppressed }` —
  `state` is always the **true** computed state, never the value shown to the
  coach: when the kill switch (§7.4) has downgraded a red, `state` stays `'red'`
  and `redSuppressed` is `true`. —
  `excludedSessionRate` is the share of the baseline window's sessions dropped
  for want of a session RPE, so the cost of skipping is visible at the point it
  actually distorts a ceiling.
- `props` carries **no client identifier**.

**A second event, shipping earlier: `session_rpe_prompted`.** Skip rate is a
property of the *completion prompt*, not of a guardrail evaluation, so it cannot
ride on `guardrail_evaluated` — that fires at publish, on a different surface, at
a different time.

- Written at session completion with `props: { rated: boolean }`.
- **It belongs to the session-RPE deploy (§13.6), not the guardrail deploy** —
  including its half of the two-place whitelist below. Shipping it with the
  prompt means skip-rate data starts accumulating from the first rated session
  rather than from the guardrail's launch, which is the whole point of sequencing
  capture first.

With the derived estimator cut (§3.1), this number is the *only* read on skip
behaviour. If it comes back high, the answer is prompt UX.

**⚠ Launch-period rule — do not retune the ramp curve from cold-start data.**
For as long as the population is in `cold_start` (§6.1 — which at launch is all
of it), the flag rates being logged come from **absolute session-count caps**,
not from the anchor ramp. They are a different regime over a different
distribution, and the ramp curve is not being exercised at all.

Using month-one telemetry to move `BS_RAMP_ANCHORS` would be tuning one
mechanism on another mechanism's data. Retune the ramp only once a meaningful
number of clients are actually evaluating in `measured` — segment every flag-rate
query by `regime` before drawing any conclusion from it. The cold-start caps
themselves *can* be retuned from month-one data, because that is the regime
producing it.

**⚠ Two-place whitelist — and this applies to each event separately.** Adding
either `session_rpe_prompted` or `guardrail_evaluated` requires editing **both**:

1. the `if p_event not in (…)` list inside `track_event`, via a migration
2. `ANALYTICS_EVENTS` in `src/lib/funnel.mjs:17`

`track_event` **silently returns** on an unknown name. Updating only one of the
two ships a feature that writes nothing and reports no error — precisely the
failure this instrumentation exists to prevent.

Because the two events ship in **different deploys** (§13.6), this trap is set
twice, and the second time is the easier one to miss: by then the pattern will
feel familiar and the first event will be working. The end-to-end check in §14
exists to catch both.

---

## 11. Files

Split by deploy, per the ship order in §13.6.

### Deploy 1 — session-RPE capture (ships first, standalone)

| Path | Change |
|---|---|
| **Create** `supabase-migrations/2026-07-27-session-rpe.sql` | Add `workout_sessions.session_rpe numeric(3,1) check (… between 0 and 10)`, additive and nullable · **and** add `session_rpe_prompted` to the `track_event` whitelist |
| **Modify** `src/lib/funnel.mjs` | Add `session_rpe_prompted` to `ANALYTICS_EVENTS` — the second half of the two-place whitelist (§10.2) |
| **Modify** `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:24597` | The one-tap rating on completion, before the `saveSessionLog` call, plus the `session_rpe_prompted` write |
| **Modify** `mobile-app/src/services/shapeBackend.js` | `saveStructuredWorkoutSession` (`:2219`) and `saveWorkoutSessionLog` (`:2389`) accept `sessionRpe` and write it; omitted or skipped stays NULL |

Nothing here imports the guardrail. This deploy stands alone and should not wait
on anything below it.

### Deploy 2 — the guardrail

| Path | Change |
|---|---|
| **Create** `public/newdesign/progressionGuardrail.mjs` | The pure core, three anchor tables, the interpolation utility, the copy function |
| **Create** `tests/progression-guardrail.test.mjs` | Fixtures per §12 |
| **Create** `supabase-migrations/2026-07-27-guardrail-load-history.sql` | Load-history RPC — **raw trailing session ROWS**, not buckets (amended 2026-07-28, see §9.2) — returning the kill-switch flag alongside them (§7.4). ⚠ **It also carries the `app_config` table + the `guardrail_red_enabled` seed** (see the row below). **Still owed by this file:** `guardrail_evaluated` on the `track_event` whitelist — deferred with the telemetry work, NOT delivered by the foundation commit |
| ~~**Create** `supabase-migrations/2026-07-27-guardrail-config.sql`~~ | ⚠ **SUPERSEDED 2026-07-28 — DO NOT CREATE THIS FILE.** It described a second migration seeding `guardrail_red_enabled` **`true`**, which contradicts §9.4's ruling that 2b **ships advisory**. The table + seed live in the load-history migration above and are seeded **`false`**. This row survived the same stale-contract sweep that corrected §9.2 and §11's bucketing line one row up — an implementer reading §11 as the build manifest would have created a second file with the opposite seed and enforced red on day one |
| **Modify** `supabase-migrations/` — the `ai_audit_read_own_or_coach` policy | Close the client-visibility hole in §9.3: a `guardrail_red_ack` row sets `target_user_id` to the client, so the policy's "own entries" arm would expose it to them |
| **Modify** `src/lib/funnel.mjs` | Add `guardrail_evaluated` to `ANALYTICS_EVENTS` — the whitelist trap, second time (§10.2) |
| **Modify** `src/app/api/trainer/workout/route.ts` | Authoritative evaluation, 409 on unacknowledged red, audit + telemetry writes |
| **Modify** `public/newdesign/dashBuilder.jsx` | Inline advisory flags, red acknowledgment UI |
| **Modify** `public/newdesign/newWorkout.jsx` | Same |
| **Modify** `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` | Same, plus `plannedMinutes` / `plannedRpe` capture in the coach builder |

**Reuse unchanged:** `src/lib/ai/server.ts` (`auditSink`), `public.ai_audit_log`,
`public.shape_user_tz`, `is_coach_on_client`.

---

## 12. Test fixtures

Every fixture below was named as required coverage during design. All are pure
unit tests against the module; none needs a database.

**Ramp curve** — each of the four anchors exactly · one midpoint per segment ·
both clamped ends (below 500, above 5000) · the three reference athletes at 600,
1680 and 3375 AU expecting ~38%, ~21% and ~12%.

**Cold start** — zero history under cap · zero history amber · zero history red ·
the peak hardest-session bound firing while the weekly total is green · week 3 →
week 4 handoff · handoff where week 1 was abnormally light (median must not be
dragged down).

**Cold-start session-count scaling** — the three reference athletes of §6.1
(600 AU over 3 sessions, 1680 over 4, 3375 over 6) **all green** · the same
1680 AU week compressed into 2 sessions crossing the 1200 amber cap · 4 × 900 AU
= 3600 red against the 3400 four-session red cap · a one-session week bounded by
the peak rather than the weekly cap.

**Return rule** — 13 days (no break) · 14 days exactly · a midpoint in each
segment · 84-day handoff to cold start · a trivial sub-100 AU session mid-gap
**not** resetting the gap · a return week followed by a normal re-ramp · a gap
ending mid-week.

**Concentration axis** — a 2-session week at 50/50 that **must not** flag · a
3-session week at 50/30/20 where the share check applies · `jump_vs_history`
firing while share is clean · share firing while jump is clean · **both firing
together counting as ONE axis** (must not produce compound red).

**Red resolution** — curve path on a single axis · compound path on two distinct
axes across a 3-session week · return-week cap plus the volume ramp counted as
**one** axis, not two · `redPath` and contributing axes present in the payload.

**Compound suppression below 3 sessions** — the worked cold-start case:
**two sessions at 800 AU each — 1600 AU weekly against a 1200 amber / 1700 red
two-session cap (volume amber) and 800 AU hardest against the 700/1000 peak
bounds (concentration amber) — must resolve to `amber`, not `red`** · the same
three sessions at 800 AU (2400 AU against a 1800 amber / 2550 red three-session
cap, both axes still amber) **does** resolve to compound red · a two-session week
of 1100 + 200 AU — volume amber at 1300, concentration **red** at 1100 — still
resolves to red via the curve path, because suppression touches the compound path
only.

**Session RPE and skipped ratings** — a rated session using `session_rpe`
directly · a skipped rating excluding that session entirely, never scoring it 0
and **never deriving a value from its set RPEs** · a week whose excluded sessions
depress its total, confirming the downward bias is real and the lower figure is
what reaches the baseline.

**The qualifying boundary** — a 4-session week with 3 rated qualifying as
measured · **a 4-session week with exactly 2 rated NOT qualifying** (the strict
`> half` boundary) · a 3-session week with 2 rated qualifying · a week failing
the rule leaving the client in cold start rather than producing a thin baseline.

**Honest absence** — a `duration_seconds = 0` session excluded rather than scored
as zero · **a session rated but with zero duration excluded, and a session with
duration but no rating excluded** (both factors are required, §3.1) · a proposed
session missing `plannedRpe` or `plannedMinutes` returning `unknown` /
`incomplete_week`.

**Visibility (§9.3)** — a client-role request for a flagged, acknowledged week
receives **no flags key, no state, no acknowledgment row**, asserted on key
absence rather than emptiness · the owning coach's request for the same week
returns the full result · a `guardrail_red_ack` row is not readable by the client
it targets, despite `target_user_id` being that client.

**Kill switch (§7.4)** — flag false: a red-by-curve week resolves `amber` and
publishes with no acknowledgment · the same week's telemetry still carries
`state: 'red'`, its `redPath`, its axes and `redSuppressed: true` · no
`guardrail_red_ack` row written · an unreadable flag enforces red · flag true
behaves exactly as the rest of §12 specifies.

**Route** — publish rejected for an unacknowledged red week.

---

## 13. Explicitly out of scope for v1

- **Intake-seeded baselines.** Blocked on `client_intakes.experience_level` and
  `workout_frequency` becoming structured enums. `TODO` in the module.
- **The `distribution` axis** (hard sets per muscle group) counting toward
  compound red — see §7.3. Registered and disabled.
- **A dedicated `guardrail_acknowledgments` table.** `ai_audit_log` serves v1.
- **Nutrition and non-training plans.** Training weeks only.
- **Auto-correction of any kind.** The guardrail never rewrites a week, never
  proposes an alternative, and never adjusts loads.
- **Client-visible flags.** Coach-facing only, enforced at the API boundary —
  see §9.3, which is a v1 *requirement*, not merely an omission.
- **Scheduled/batch evaluation.** v1 evaluates on authoring and on publish. The
  cron pattern in `src/app/api/cron/score-accountability/route.ts` is documented
  here as the template if roster-wide sweeps are wanted later.
- **Injury cross-referencing.** `client_intakes.injuries` is free text.
- **Retuning the thresholds.** v1 ships the numbers below and the telemetry to
  judge them; the first retune is a follow-up informed by real flag rates.

### 13.4 Derived values, resolved on the record

Five values were derived rather than owner-supplied during drafting. All five are
now settled; the reasoning is kept because a future reader will otherwise assume
every number here was chosen deliberately from evidence, and one of them was not.

1. **Cold-start caps — recalibrated, superseding the original 900/1400 weekly and
   400/600 peak.** The originals were calibrated for a rare worst-case
   deconditioned beginner. Once §13.5 established that cold start is the *only*
   regime running at launch, that calibration became wrong for the job: against
   the spec's own reference athletes a normal intermediate week (1680 AU) was red
   and an ordinary 60-minute RPE 7 session (420 AU) tripped the peak amber
   instantly. A majority-red launch in front of the founding coaches, against a
   target red rate of 1–2%, teaches coaches to click through red within days —
   and the acknowledgment log, which is the entire liability rationale for the
   red state, fills with reflexive dismissals.

   Replaced by session-count-scaled weekly caps (`sessions × 600` amber /
   `sessions × 850` red) plus independent peak bounds of 700/1000 AU. Anchored to
   session count because it is the only statement the proposed week makes about
   the client without history or intake. Verification table and the accepted cost
   to the true-beginner case are in §6.1.
2. **The 500 AU boundary is shared by THREE rules, and they must stay one
   constant.** The ramp and red anchor tables both begin at 500; that is (a) the
   curves' own domain, (b) the measured-baseline floor (rule B2), and (c) the
   general rule that a *percentage of a small number is meaningless*, which is
   why (a) and (b) exist at all. **Retuning the lowest ramp anchor moves all
   three.** In code this is `BS_CURVE_DOMAIN_FLOOR_AU`, **derived** from the
   ramp table rather than written as a literal so it cannot drift away from it,
   with the red table's first anchor and `BS_BASELINE_FLOOR_AU` both asserted
   equal to it in the suite — a divergence fails loudly instead of silently
   reading one curve outside its own domain.

   Ruled after a defect found in review: `bsJumpBounds` read the curves at ANY
   positive session value with no domain floor, so a client whose sessions are
   small got the tightest possible jump bound (at a 200 AU hardest, red sat at
   350). Restructuring an unchanged 1000 AU week into 400/300/300 resolved RED
   and blocked publish, while the same week from a client with no history at all
   was green — more data made the guardrail louder in the wrong direction, on
   the only state with teeth. Below the floor the axis now falls back to the
   absolute peak bound, which is what F75 already specifies for "no measured
   hardest session": an unusable measurement and an absent one are the same
   thing here. No signal is lost — `share_of_week` catches restructure
   scale-free, needing no curve (F141). The alternative considered and rejected
   was flooring only the RED bound at an invented 1000: it keeps computing an
   out-of-domain percentage and surfaces it anyway, which is the same failure as
   "estimated" and as imputing a skipped rating, and 1000 is anchored to
   nothing. Rows F139-F143.
3. **Gap-breaking session minimum — 100 AU** (roughly 20 minutes at RPE 5).
   Owner specified that a threshold must exist and that a short walk must not
   reset protection, but not the value. **Accepted.**
4. **Baseline = median of qualifying trailing weeks — accepted as a substitution,
   not a translation.** The request was for an *asymmetric floor*: a single light
   or interrupted week must not depress the baseline. Median is **symmetric** — it
   also resists upward movement, so it lags a legitimate ramp and ceilings run
   slightly tight for a client who is genuinely improving. That error is in the
   conservative direction and is accepted knowingly. If retuning later shows
   improving clients being flagged too often, this is the first thing to revisit,
   and an asymmetric floor (`max(median, previous baseline)`) is the alternative
   that was passed over.
5. **Session RPE — the derived-from-set-RPEs proposal was rejected.** A flat mean
   of set RPEs is a different construct with a systematic downward bias, and it is
   perverse: identical working sets score lower when more warm-up sets are logged.
   Sparse set-RPE logging is not a random sample either, since hard sets get rated
   more often, so the bias does not wash out. Replaced by a genuine session-level
   rating captured on completion (§3.1).

   **The top-third-of-set-RPEs stopgap was then also cut**, having been specified
   as a hedge against an unknown skip rate. Two reasons, both decisive. It puts
   two constructs in one field — a baseline mixing rated and derived values is
   not measuring one thing. And it corrupts the qualifying rule: converting
   unrated sessions into pseudo-rated ones lets a week that should degrade to
   cold start qualify as *measured* on a contaminated baseline. The unknown skip
   rate no longer justifies it, because §6.1 was recalibrated into a viable
   universal regime — **degrading to cold start is the backstop.** If the skip
   rate proves high, the fix is prompt UX, not a silent estimator that hides the
   signal, which is why `session_rpe_prompted` (§10.2) ships with the prompt.

### 13.5 Measured at design time — the database was empty

Run against production on 2026-07-27, before calibrating §6.1:

| | |
|---|---|
| `workout_sessions`, all time | **0** |
| `workout_set_logs` / with non-NULL `rpe` | **0** / **0** |
| `client_workouts` | **0** |
| `activities` | **0** |
| `daily_health_snapshot` with workout minutes | **0** (1 row total) |
| profiles / clients / active subscriptions | 2 / 1 / 1 |

Clients who would have had a measured baseline under the old set-derived RPE
construct: **zero**. So moving to a session-level rating (§3.1) forfeits no
existing history — there is none to forfeit.

Three consequences that shape the build:

- **The ramp curve (§5.1, §5.2) is unreachable at launch** and stays unreachable
  until clients accumulate three rated weeks each. It is correct, tested, and
  dormant.
- **`cold_start` is the product** for the first months, which is why §6.1 is
  calibrated as a universal regime rather than a fallback.
- **The launch-period telemetry rule in §10.2 follows directly**: month-one flag
  rates describe the absolute caps, not the ramp.

### 13.6 Ship order

**The session-RPE prompt ships first, as its own deploy, ahead of the guardrail.**
Capture ships before the thing that consumes it.

It is fully standalone — a nullable column, the completion prompt at
`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:24597`, and a parameter
through the two save functions in `mobile-app/src/services/shapeBackend.js`.
Nothing in that path imports the guardrail module; the guardrail only ever reads
what it writes. With zero existing rows there is no backfill to plan either.

Every day it ships earlier is a day of rated sessions banked toward the first
measured baselines, and therefore toward the ramp curve becoming reachable at
all.

### 13.7 A planned deload can make the return week publish-blocking

**Known, accepted, and quantified.** §6.2 never flags a decrease (fixture F57),
so a deload block lowers the trailing median; returning to normal load then reads
as an increase against that lowered baseline. The escalation scales with the
deload's *length*, because the window is the median of at most 4 qualifying
weeks:

| Deload weeks | Trailing window | Baseline | Amber over | Red over | Proposed 2000 |
|---|---|---|---|---|---|
| 1 | 1200, 2000, 2000, 2000 | 2000 | 2380 | 2800 | green |
| 2 | 1200, 1200, 2000, 2000 | 1600 | 1942 | 2304 | **amber** |
| 3 | 1200, 1200, 1200, 2000 | 1200 | 1529 | 1848 | **red** |

**The three-week row is the one that matters:** red is publish-blocking (§7.2,
§9.2), so **a legitimate, textbook coaching pattern — a planned three-week
deload followed by a return to normal load — requires an explicit acknowledgment
with a written reason before the week can be published.** That is a real cost
paid by real coaches, not a hypothetical.

It is accepted for v1 for one reason: **the alternative requires inferring
intent from data the guardrail does not have.** Distinguishing "the coach
deliberately deloaded and is now returning to plan" from "this client's capacity
genuinely dropped and the coach is over-prescribing" needs either an explicit
authored deload marker on the week or a baseline that tracks the *pre-deload*
level. Both are real designs; neither can be calibrated against zero production
rows (§13.5).

**Out of scope for v1: deload-aware baselines.** Revisit with telemetry —
`guardrail_evaluated` (§10.2) carries the state and the axis, so the flag rate
for return-from-deload weeks is measurable once real weeks exist. If it is a
meaningful share of reds, the asymmetric floor already registered in §13.4 item 3
(`max(median, previous baseline)`) is the first candidate, because it fixes this
case directly: the baseline would not fall during the deload at all. Fixtures
F109 (two-week → amber) and F129 (three-week → red) pin the current behaviour so
a future change to it is deliberate and visible.

---

### 13.8 Duration credibility is DERIVED, not stored (amends §0, F22)

`durationConfirmed` was a single boolean, and it conflated two different things:
*asked, and affirmed* with *never asked, deemed credible at write time*. The
second is a **judgement persisted as a measurement**, and it only holds while the
ceiling never moves — which §13.4 promises it will. Lowering the ceiling would
have silently reclassified every previously-unasked session into a "confirmed"
overrun nobody confirmed.

The row now carries only what happened — `durationPrompted` and `durationAnswer`
(`confirmed` / `declined` / `not_prompted`) — and the core derives credibility at
read time against the **current** ceiling. A retune re-judges stored rows
correctly instead of inheriting a stale verdict.

Absent **both** fields still reads as `not_prompted`, preserving F22's ruling
that a missing flag is not a caller bug and excludes rather than admits. A
**half-filled or self-contradicting** pair is malformed: guessing which half to
believe is how a caller bug becomes a silent baseline error.

Also added: **`BS_SESSION_MINUTES_MAX` (600)**. Past the ceiling we ask; past the
maximum we refuse, and a row claiming more is **EXCLUDED from load, even with a
confirmation**. It is exported and imported by the completion prompt, so the
field cannot accept a figure the core rejects.

⚠ **Excluded, not malformed** — corrected after review caught the first cut
reporting it as malformed. Our own wall-clock fallback produces exactly this row
when a phone is left on the completion screen, so it is not a caller bug; and one
malformed row turns the WHOLE evaluation `unknown`, which §7.5 rules never blocks
publish — a forgotten timer would therefore have switched the guardrail OFF for
that client. Malformed stays reserved for shapes no legitimate writer can emit.

### 13.9 Never-throws is kept — the throw instruction is REVERSED

An instruction to make a missing IANA zone **throw** was issued and then
withdrawn. `malformed_history` stands.

**Reasoning, recorded so it is not relitigated:** never-throws is the more
valuable invariant, and it is the same reasoning behind Rule C — throwing inside
the coach's builder breaks the UI on data the coach did not cause. F88, F89 and
F91 stay unamended. The intent behind the instruction is already met: a missing
or unrecognised zone is **never** defaulted to UTC, the offending field is named,
and the whole evaluation degrades to `unknown` rather than scoring a week from a
zone nobody knows.

### 13.10 F112's wording is amended to match its own test

F112 read *"malformed — missing `dateISO`"*. Rule E — ruled in, in the same
document — replaced the pre-localised `dateISO` with `startedAtISO` + `timezone`,
and F112's own test already pins `startedAtISO`. The row's **assertion** was
correct and unchanged; only the field name was pre-Rule-E, so the row contradicted
the test implementing it. Amended to *"malformed — missing or unparseable
`startedAtISO`"*; the companion unknown-`timezone` case is F125. Recorded here
alongside F109 / F120 / F127 / F95 as a flagged-and-ruled amendment, not a silent
edit.

### 13.11 Derived-at-read-time vs frozen-at-write-time — the test

Ruled 2026-07-28, after review correctly flagged `store_catalogue` pricing as a
persisted derived value and proposed applying §13.8's doctrine to it. **The flag
was right; the fix would have been wrong.** Recorded here so the same reading
does not recur and get "corrected" next time.

§13.8 does not say *never persist a derived value*. It says a value that
**interprets** data must re-derive when the interpretation rule changes —
otherwise old records inherit a verdict nobody would reach today. That reasoning
covers verdicts. It does not cover facts.

**The test — if the rule changes, should history change?**

| | Answer | Therefore |
|---|---|---|
| Guardrail verdicts, credibility, eligibility, measured-week status | **YES** — a retuned ceiling should re-judge old rows | Store the raw facts; derive at read time |
| Prices paid, amounts charged, fee rates, anything transactional | **NO** — a reprice must never rewrite what a customer was charged | Freeze at write time |

Both are persisted derived values. They sit on **opposite sides** of this line,
and the line is not architectural taste — for the transactional half it is
accounting and consumer-protection law. Re-deriving a completed order under
today's prices would misstate revenue and misrepresent the contract the customer
actually entered. This is the same principle already shipped as *"the stored
`fee_bps` is the billing truth"* in the BYO commission split: every dashboard,
analytics and refund path computes from the row's own stored rate precisely so a
future reprice cannot rewrite history.

**Scope, explicitly:** `store_catalogue` is outside the guardrail entirely.
**Deploy 2b must not read from or write to it.** It is named here only to settle
the classification.

### 13.12 The latched clock is NOT an untestable path — the survivor is closed

Deploy 1 recorded the latched completion clock as the one perturbation survivor,
on the stated grounds that *time cannot pass in the harness*. **That was wrong,
and the claim is withdrawn.** Both directions are now driven and both kill their
mutation.

The reasoning that produced it: effects are no-ops in
`tests/broadsheet-session-render.test.mjs` (running them hangs the runner —
`BSSession` starts wall-clock timers on mount), so the 1s tick never fires and
`now` looked frozen. But **the tick is only `setNow(Date.now())`** — a state
write. The harness already owns the state cells, so performing that same write
directly *is* the tick, with none of the machinery that hangs. `advanceNow()`
does exactly that, and the two paths the §13.8 note describes are now covered:

| Direction | Unlatched failure | Test |
|---|---|---|
| under a minute → crosses 60s mid-answer | `askDuration` flips false, the field is **withdrawn under the member**, their typed figure is stored while the facts say nobody was asked | *the clock crossing a minute does not withdraw the question mid-answer* |
| 149 min → crosses the 150-min ceiling while the screen sits | `askDuration` flips true and the prefill path **answers itself** — `confirmed`, with no member action at all | *the clock crossing the ceiling does not confirm a figure nobody was shown* |

Three things worth carrying, because each cost a real defect here:

1. **"The harness can't do X" deserves one attempt before it becomes a
   recorded limitation.** The no-op-effects fact was true; the conclusion drawn
   from it was not, and it hardened into a documented gap on the strength of
   sounding right.
2. **Identify a state cell by value, never by index.** `now` and `elapsedStart`
   are *consecutive* reads but sit deep in the hook order, not at 0/1 — a
   first-match scan finds a rest timer instead. The pair is located by the
   offset the harness itself staged, so a hook inserted between them fails
   loudly rather than advancing the wrong cell and silently voiding the test.
3. **A boundary test must land STRICTLY past the boundary.** The ceiling test
   first advanced exactly 60 s, landing *on* 150 min — and `timerImplausible`
   is `>`, not `>=`. It crossed nothing and passed with the latch removed. Only
   the perturbation run exposed it; the assertion looked correct in review.
   **Run the mutation before believing a green boundary test.**

## 14. End-to-end verification

Run after implementation, in order. Steps 1–2 are automated; 3–7 need a real
authenticated coach session against a seeded client and are the owner's pass.

1. **`npm test`** — the full suite passes, including every §12 fixture. Confirm
   the new file was picked up by glob discovery (the count rises).
2. **`npx tsc --noEmit`** — clean, against the 3 known baseline errors recorded
   in `shape-app-local-build-gate`. CI is the real gate.
3. **Apply both migrations.** Verify the load-history RPC the way this repo
   verifies every `SECURITY DEFINER` function: `SECURITY DEFINER` set,
   `search_path` pinned, `anon` EXECUTE = false, `authenticated` = true, and a
   coach calling it for a client they do **not** coach gets an absent row rather
   than an error. Separately confirm `workout_sessions.session_rpe` exists, is
   nullable, and rejects a value outside 0–10.
4. **Confirm the telemetry whitelist agrees in both places — for both events,
   separately.** Complete a session, then publish a week, then:

   ```sql
   select event, count(*) from analytics_events
   where event in ('session_rpe_prompted', 'guardrail_evaluated')
   group by event;
   ```

   **Two rows are required. A missing row means the two-place whitelist in §10.2
   is out of sync for that event** and the write is being silently dropped.
   `session_rpe_prompted` should already be accumulating from Deploy 1 — check it
   at that deploy, not here, so a gap is caught weeks earlier. Confirm both
   `rated: true` and `rated: false` appear in its props after skipping one
   rating deliberately.
5. **Walk one client from cold start to measured.** Seed zero history. Author
   three-session weeks (amber cap 1800 AU, red cap 2550) totalling ~1500 AU
   (green), ~2000 AU (amber, labelled **"no baseline yet"**, never "estimated"),
   and ~2700 AU (red).

   Then confirm the calibration actually holds on real shapes: an intermediate
   4 × 60 min at RPE 7 (1680 AU) and an advanced 6 × 75 min at RPE 7.5 (3375 AU)
   must both be **green**. If either is amber the caps have regressed toward the
   pre-recalibration values and the launch will be majority-red.

   Then author the two-session 800/800 week from §12 and confirm it resolves
   **amber, not red** — the compound-suppression case, and the one most likely to
   regress silently.

   Now log three real weeks **through the app**, rating each session on the
   completion prompt. This exercises the whole capture chain, so confirm as you
   go: the prompt appears once per session, skipping it writes NULL rather than
   0, and `session_rpe` lands on the row. Then confirm the fourth evaluation
   reports `regime: 'measured'` with a baseline equal to the **median** of the
   three weeks — and verify explicitly by making one of the three deliberately
   light, which must not drag the baseline down.
6. **Trip both red paths and confirm the audit trail.** Publish a red-by-curve
   week and a red-by-compound week (volume plus concentration). For each: the
   acknowledgment interstitial names the path and the contributing axes; publish
   is rejected with `409` if the acknowledgment is stripped from the request; and
   the entry appears in `/api/ai/audit` with `action = 'guardrail_red_ack'`,
   the flags in `suggestion`, and the reason in `confirmed_payload`.
7. **Confirm parity across all three builders.** The same proposed week produces
   an identical state, identical axes and identical wording in
   `dashBuilder.jsx`, `newWorkout.jsx` and the mobile broadsheet — the whole
   point of one canonical module and one copy function.
8. **Prove the client cannot see any of it (§9.3).** Sign in as the *client* of
   the red week acknowledged in step 6 and request every client-scoped surface —
   `/api/client/train`, `/api/client/dashboard`, the workout detail, and
   `/api/ai/audit`. **None may contain a flag, a state, an axis, a threshold or
   the acknowledgment.** Inspect the raw JSON, not the rendered screen: a field
   that is present but unused by the UI is a leak, not a pass. Confirm the
   `ai_audit_log` row targeting that client is genuinely unreadable by them.
9. **Flip the kill switch (§7.4).** Set `guardrail_red_enabled` false **without
   deploying anything**, re-open the red week, and confirm it now renders amber
   and publishes with no acknowledgment. Then confirm the telemetry row for that
   publish still reads `state: 'red'` with its `redPath`, its axes and
   `redSuppressed: true`, and that no `guardrail_red_ack` row was written. Set it
   back to true and confirm red enforces again. **If this cannot be flipped
   without a deploy, the switch does not do its job** — it exists precisely for a
   launch morning when a deploy is the thing you do not have time for.

**Ship criterion.** Across a week of real authoring, green is the overwhelming
majority, amber is occasional and actionable, and red is rare enough that every
instance is worth the coach's attention. If step 4 returns zero, none of that is
measurable and the launch is flying blind — fix the whitelist before drawing any
conclusion from flag rates.

---

### 13.13 Training outside the app understates capacity (§9.5's accepted cost)

**Known, accepted, and deliberately chosen.** §9.5 puts device-imported
sessions outside the guardrail's universe. The direct consequence: **a client
who trains heavily outside the app has their capacity understated**, so their
ceilings run tighter than their true fitness warrants and they will see more
amber and red than a client doing identical work entirely in-app.

This is the same shape as §13.7 (deload) and the unrated-session rule in §3.1 —
a real cost paid by real coaches, accepted because the alternative is worse:

- Counting device rows in the denominator **pins a watch-wearing client in
  `cold_start` indefinitely by their own sync**, which is not a tighter ceiling
  but a *wrong regime* — and cold start's per-session bounds stand in for a
  measurement we do not have, so applying them to someone we *could* have
  measured is strictly less honest.
- Counting a device row's *duration* toward load without a rating means
  imputing an RPE, which §3.2 already ruled against for exactly this reason.

**It fails toward the safe direction.** Understated capacity over-flags: the
coach is asked to acknowledge a week that was probably fine. Overstated capacity
under-flags: the guardrail stays quiet on a week that was not. The first is
friction; the second is the failure the guardrail exists to prevent.

⚠ **The residual risk is alarm fatigue, not silence** — and it is loud rather
than quiet, which is why it is acceptable. A client whose entire history is
device syncs reads `no_history` and lands in `cold_start`, where a genuinely
strong week may flag every time. That is visible in `guardrail_evaluated`
(§10.2) from day one.

**Revisit in v2 if telemetry shows it biting.** The measurable signal is the
flag rate for clients with a connected integration versus those without; the
state and axis already ride on `guardrail_evaluated`, so no new instrumentation
is needed. If it is a meaningful share of reds, the first candidate is *not*
admitting device rows to the denominator but **making them promptable** — a
post-sync rating prompt would convert them into genuine in-app rated sessions
and dissolve the problem at its source rather than trading one bias for another.
