# Shape Score — Momentum + Accountability (design)

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Scope:** Adds two layers on top of the existing Shape Score ledger — a **Momentum**
meter (consistency carrot) and **accountability clawback** (missed-commitment stick) —
and formalizes a **two-number** split so penalties have teeth without store-spending or
a bad week demoting anyone. **Client-only** feature (coaches keep the synthetic
`/api/coach/score`); coaches can *waive* a client's penalty.

## 1. Goal & principles

- Give users a real *downside* for not doing what they committed to, **without**
  contradicting the app's two load-bearing decisions: the tier is a **lifetime
  achievement that never demotes**, and the tone is **never-shaming**.
- Loss-aversion comes from a falling **number**, a falling **Momentum** meter, and a
  **heads-up before any penalty** — not from yanking someone's rank or perks.
- Everything routes through **SECURITY DEFINER** RPCs with hard-coded/derived amounts,
  ownership checks, and `ON CONFLICT DO NOTHING` idempotency — same pattern as the
  2026-06-18 ledger lockdown. Clients can no longer write `score_ledger` directly.

## 2. The two-number model (foundation)

One ledger, two derived numbers (filters on `source_kind`):

| Number | Definition | Drives |
|---|---|---|
| **Shape Score** (rank) | `Σ delta WHERE source_kind <> 'store_redeem'` (earns + penalties + momentum bonuses; **excludes** redemptions) | the **tier/rank** |
| **Spendable balance** | `Σ delta` (all rows, incl. redemptions + penalties) | what you **redeem** with |

- **Fixes an existing quirk:** today the tier is computed off the *net* total, so a
  store redemption already drags your tier down. Excluding `store_redeem` from the rank
  number fixes that — **spending never demotes you; lapsing dents your number.**
- **High-water-marked rank:** the *displayed tier* = the highest threshold the Shape
  Score number has **ever** crossed, computed as the running-max prefix sum over the
  ledger ordered by `earned_at` (a window function — `max(sum(delta) FILTER (source_kind
  <> 'store_redeem')) OVER (ORDER BY earned_at)`). No stored high-water state needed.
  - Your **current** Shape Score number can fall below your tier's threshold from
    penalties; the rank does **not** drop.
  - **At-risk display:** when `current_score < threshold(displayed_tier)`, show a clear
    *"you've slipped below {Tier} — earn {gap} to re-secure it"* line. Informational
    only; never removes the rank or its perks. **No automatic demotion.**

## 3. Momentum meter (carrot — "don't break the streak")

A 0–100 meter, **display state recomputed from the trailing day series** (the same
`daily_health_snapshot` + habit/check-in signals the directive engine already reads):

- A day **counts** ("showed up") if you did any core thing that day: logged a workout,
  completed your habits, or submitted your check-in.
- **Recurrence** (folded over the last ~30 days, oldest→newest):
  `m = clamp(m_prev + (active_day ? +STEP_UP : −STEP_DOWN), 0, 100)`,
  with `STEP_UP ≈ 100/14` (≈+7/day → fills in ~2 weeks) and `STEP_DOWN ≈ 12`
  (a missed day **knocks it down a notch**, not a reset). Final value = today's meter.
- **Bonus payout (real points):** at the weekly tick, if momentum ≥ `BONUS_THRESHOLD`
  (80), award **`momentum_bonus` +25** (category `adherence`), idempotent per ISO week
  (`source_id = md5('momentum:'||uid||':'||iso_week)`). Optional small escalation for
  long sustained streaks (e.g., +5 per extra full week, capped) — *deferred to v2.*
- The meter **falling** removes **no** banked points — you just stop earning the bonus.
  Pure loss-aversion.

## 4. Accountability clawback (stick — scope (ii))

Only **committed** obligations can penalize; everything else is upside-only.

| Obligation (missed) | Detected via | Penalty (negative `delta`) | category | source_kind | source_id |
|---|---|---|---|---|---|
| Scheduled **coach session** | `sessions` row, `scheduled_at` past, status ∉ {completed} | **−½ session value** (kept = +12 ⇒ **−6**) | `adherence` | `penalty_session` | session id |
| Weekly **check-in** | no `client_checkins` row for the ISO week by week-end | **−⌊15/2⌋ = −7** | `adherence` | `penalty_checkin` | `md5('penalty_checkin:'||uid||':'||week)` |
| **Assigned workout** skipped | `client_workouts` `scheduled_date` past, no logged activity/session that day | **−5** (½ of a ~10-pt session) | `workouts` | `penalty_workout` | client_workout id |
| **Active habit streak** broken | a habit on a ≥3-day streak missed (directive engine `streak_broken`) | **−⌈3/2⌉ = −2** | `habits` | `penalty_habit` | `md5('penalty_habit:'||uid||':'||habit_id||':'||day)` |

- Penalty amount = **half of what the activity would have earned** (rounded), so the
  downside is always bounded and tied to the specific behavior.
- Penalties use the **same category** as the related activity, so the breakdown nets out
  honestly (a missed check-in is negative `adherence`, etc.).
- Brand-new habits (streak < 3) and unscheduled activity are **never** penalized.

### Heads-up first (never-shaming) + grace

- Before a penalty lands, the existing notification engine sends a **nudge**:
  *"Check in by tonight to keep your +15 / avoid −7."* The penalty only applies **after
  the grace window** (end of day for daily items, end of week for the check-in).

### Fairness guards

- **Balance floor:** a penalty is reduced/skipped if it would take **spendable balance
  below 0** (you can't go negative).
- **Weekly cap:** total penalties per ISO week capped (e.g., **−30/week**) so a
  catastrophic week can't nuke you.
- **Rest / pause:** **no penalties** are evaluated for days the user marked a rest day
  or set "pause / vacation" (`client_settings`).
- **Coach waive:** a coach can waive a specific penalty for their client via
  `waive_penalty(penalty_source_id)` — DEFINER, gated on `is_coach_on_client`, inserts an
  **offsetting positive row** (`source_kind = 'penalty_waive'`, dedupe on the penalty id)
  rather than deleting (ledger stays append-only).

## 5. Evaluation model (who fires the penalties)

Penalties must fire even when the user **ghosts** (stops opening the app), so the
authoritative evaluator is **server-side**:

- **Daily cron** `/api/cron/score-accountability` (or extend the existing notify cron):
  for each user — fold momentum, send heads-ups for at-risk obligations, and apply
  past-grace penalties (respecting pause / weekly cap / balance floor / idempotency).
- **On-app-open fast path:** a `window.ShapeMomentum.check()` (mirrors
  `ShapeGoalAwards.check`) recomputes the user's own momentum + applies any due
  self-evident bonus on session resolve, so active users see fresh state immediately.
  The cron remains the source of truth for ghosters.

## 6. Surfacing (UI)

- **Score page:** the Momentum bar + "this week's bonus", and the **at-risk** line when
  the number is below the current tier's threshold.
- **Home "Today · your move"** directive (already detects misses): gains the stakes —
  *"Check in tonight · keep your momentum + protect 15 pts."*
- **Notifications:** through the existing never-shaming engine — nudges, never scolds.

## 7. Build surface (RPCs / source_kinds / no CHECK migration)

- **New `source_kind`s:** `momentum_bonus` (+, `adherence`), `penalty_session`,
  `penalty_checkin`, `penalty_workout`, `penalty_habit` (−, existing categories),
  `penalty_waive` (+). **All categories already allowed** by the `score_ledger` CHECK —
  no CHECK migration.
- **New DEFINER RPCs** (idempotent, ownership-verified, hard-coded/derived amounts):
  - `apply_obligation_penalty(p_kind text, p_source_id uuid)` — verifies the obligation
    exists, is the caller's (or service-role for the cron), was actually missed + past
    grace + not paused + under the weekly cap + above the balance floor, then inserts the
    bounded negative row.
  - `award_momentum_bonus()` — folds the day series, awards the weekly bonus if ≥
    threshold (idempotent per week).
  - `waive_penalty(p_penalty_source_id uuid)` — coach-gated offset.
- **Score endpoint changes** (`src/app/api/client/score/route.ts`): return
  `shape_score` (rank number, redemptions excluded) + `displayed_tier` (high-water) +
  `at_risk` + `spendable_balance` + `momentum` ({value, bonusThisWeek}). Keep
  `points_total` as a back-compat alias of the rank number.
- **Cron route** for the authoritative daily evaluation.

## 8. Out of scope / deferred

- The **session/workout earn side** isn't fully wired today (kept-session points are
  demo). This spec **defines** the values used for the *penalty* (−½), but wiring the
  positive earns for sessions is tracked separately.
- Momentum bonus **escalation** for very long streaks (v2).
- A **coach-set commitment/stake** opt-in (model "D" from brainstorming) — not in v1.

## 9. Per-role notes

- Momentum + penalties are a **client** feature (the obligations are client-side).
- Coaches keep `/api/coach/score`; they only interact via **waiving** a client's penalty.
- Dietitians ride the client rails like any member.
