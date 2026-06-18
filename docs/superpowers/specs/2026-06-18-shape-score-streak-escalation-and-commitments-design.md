# Shape Score v2 — Momentum streak escalation + Weekly commitments (design)

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Scope:** Two independent enhancements to the Shape Score Momentum/Accountability system
(Phases A–C, already shipped): (1) **Momentum streak escalation** — the weekly bonus grows
the longer you sustain momentum; (2) **Weekly commitments + stake** (brainstorm "model D")
— a coach or a member sets a one-week, auto-tracked commitment and stakes points two-sided.
Both are **client-side** features that ride the existing `score_ledger` and the existing
daily accountability cron. Built as two independent slices (ship in order, each works alone).

## 1. Goal & principles

- Reward sustained consistency more than a one-off good week (escalation), and let users put
  real skin in the game on a self-chosen target (commitments) — without breaking the system's
  load-bearing rules: the **tier never demotes**, the tone is **never-shaming**, every ledger
  write goes through a **SECURITY DEFINER** RPC with hard-coded/derived amounts + ownership
  checks + `ON CONFLICT DO NOTHING` idempotency, and **spendable balance never goes negative**.
- A coach must never gamble a client's points **without consent** (the commitment consent gate).
- Commitment stakes are a **voluntary opt-in bet**, kept separate from the involuntary penalty
  clawback (they do NOT count against the −30/week penalty cap).

## 2. Feature 1 — Momentum streak escalation

The Phase B `award_momentum_bonus()` pays a flat **+25** once per ISO week when momentum ≥ 80
(`BONUS_THRESHOLD`). v2: the bonus **grows +15 for each consecutive prior ISO week** that also
earned the bonus, capped at **+100** — a clean six-rung ramp.

- **Formula:** `bonus(streakWeeks) = min(100, 25 + 15 × streakWeeks)` where `streakWeeks` is the
  count of consecutive immediately-prior ISO weeks that already have a `momentum_bonus` row.
  So the ramp is **25 → 40 → 55 → 70 → 85 → 100** (weeks 1–6+, then flat). A missed week resets
  the streak.
- **Detection:** in `award_momentum_bonus()`, before inserting, walk back week-by-week
  (`to_char(now() - n*7d, 'IYYY-IW')`) counting consecutive prior weeks with a `momentum_bonus`
  ledger row; stop at the first gap. The inserted `delta` is the escalated amount (the per-week
  `source_id` idempotency is unchanged, so a week is still credited at most once).
- **Constants** live in `mobile-app/src/services/momentum.mjs` as the single source of truth:
  add `BONUS_STEP = 15`, `BONUS_MAX = 100`, and a pure helper
  `momentumBonus(streakWeeks) -> int` (tested), mirrored verbatim in the SQL.
- **Surfacing:** `/api/client/score` adds `momentum.streakWeeks` (consecutive bonus-weeks incl.
  the current one when banked). The Score-page momentum bar reads it: when `bonusThisWeek`,
  show **"🔥 {streakWeeks}-week streak · +{bonus} banked"**; otherwise the existing "Reach 80
  for a weekly +25" copy.
- **Migration:** a new file `supabase-migrations/2026-06-18-score-momentum-escalation.sql`
  `create or replace`s `award_momentum_bonus()` (the Phase B one is already applied). No new
  `source_kind`, no CHECK change. Fire-and-forget; no-op until applied.

## 3. Feature 2 — Weekly commitment + stake ("model D")

A coach (for their client) **or** a member (solo) sets a one-ISO-week commitment on auto-tracked
counts and stakes points. Two-sided: hit **all** targets → **+stake**, miss → **−stake**.

### 3.1 Targets (auto-tracked, no manual marking)

`targets` jsonb with any subset of: `{ workouts: N, checkin: true, habits: K }`, evaluated over
the commitment's ISO week `[M, M+6]` (M = Monday):
- **workouts** — distinct days with a logged workout (`daily_health_snapshot.workout_minutes>0`
  OR an `activities` row that day) ≥ `N`.
- **checkin** — a `client_checkins` row for `week_of = M` exists.
- **habits** — total `user_habit_completions` rows in the week ≥ `K`.

"Met" = every *specified* target reached (omitted keys are ignored). Stake range **5–50**.

### 3.2 Consent flow (status machine)

`status`: `proposed → active → (met | missed)`.
- **Self-set** (member creates their own): starts **active** immediately (they chose it).
- **Coach-set** (`is_coach_on_client`): starts **proposed**; the client must **accept** (→ active)
  before any points are at risk, or it never settles. A coach cannot put a client's points at
  risk unilaterally.

### 3.3 Data model — `score_commitments`

```
id          uuid pk default gen_random_uuid()
user_id     uuid not null references auth.users  -- the committer (client/member)
created_by  uuid not null references auth.users  -- coach or self
week_of     date not null                         -- ISO Monday
targets     jsonb not null                         -- { workouts?, checkin?, habits? }
stake       integer not null check (stake between 5 and 50)
status      text not null default 'active' check (status in ('proposed','active','met','missed'))
settled_at  timestamptz
created_at  timestamptz not null default now()
unique (user_id, week_of)                          -- one commitment per user per week
```
RLS: the owner (`user_id`) full read; the owner may insert/update **their own** (self path);
a coach (`is_coach_on_client(user_id)`) may read + insert (the proposal path). All point writes
go through the RPCs (not direct), same lockdown discipline as `score_ledger`.

### 3.4 RPCs (SECURITY DEFINER, idempotent)

- `set_commitment(p_user uuid, p_targets jsonb, p_stake int)` — `authenticated`. If
  `p_user = auth.uid()` → insert **active**; else require `is_coach_on_client(p_user)` and
  insert **proposed** with `created_by = auth.uid()`. Validates stake 5–50, one per ISO week
  (upsert the current week's row while still unsettled). Returns the row.
- `accept_commitment(p_id uuid)` — `authenticated`. The owner flips their own **proposed** →
  **active**. (Decline = delete/ignore; a proposed commitment never settles.)
- `settle_commitment(p_user uuid, p_week date)` — **service-role only** (the cron). For an
  **active** commitment whose week is fully over: evaluate the targets against real activity;
  **met** → `commitment_win +stake`, **missed** → `commitment_loss −stake` (clamped by the 0
  balance floor, like penalties). Write the ledger row (category `adherence`, `source_id =
  commitment id`, `ON CONFLICT DO NOTHING`), set `status` + `settled_at`. Idempotent.

`commitment_win` / `commitment_loss` are **not** `penalty_%`, so they don't count against the
−30/week penalty cap. They DO count in the rank (not `store_redeem`), so a loss dents the
number and a win lifts it — consistent with the two-number model.

### 3.5 Settlement — the existing daily cron

`/api/cron/score-accountability` gains a step: per active member, find their **active**
commitment for the just-completed ISO week and call `settle_commitment`. Same fail-open,
service-role pattern. A settled commitment emits a gentle heads-up (won → "you hit it, +S";
missed → never-shaming "the week's commitment didn't land — next week's on you").

### 3.6 UI

- **Client** (mobile Score page + web `clientScore.jsx`): a **"This week's commitment"** card —
  if none, a "Set a commitment" affordance (pick targets + a stake slider 5–50); if active, the
  live progress (e.g. "2/4 workouts · check-in ✓ · 5/7 habits") + the stake; if a coach proposed
  one, an **Accept / Decline**; after settlement, the outcome (+S won / −S). `window.ShapeCommit`
  bridge (`set`, `accept`, `get`).
- **Coach** (mobile `BSProClientFullProfilePage` Manage tab, next to Recent penalties): a **"Set
  a commitment"** affordance that proposes one for the client (`set_commitment` with the client id).

## 4. Build surface

- **New `source_kind`s:** `commitment_win` (+, `adherence`), `commitment_loss` (−, `adherence`).
  Momentum keeps `momentum_bonus` (escalated amount). **No CHECK migration** (categories allowed).
- **Migrations:** `2026-06-18-score-momentum-escalation.sql` (replace `award_momentum_bonus`);
  `2026-06-18-score-commitments.sql` (the table + RLS + `set_commitment` / `accept_commitment` /
  `settle_commitment`). Owner runs both; fire-and-forget until applied.
- **Pure logic + tests:** `momentum.mjs` `momentumBonus()` + a `commitmentMet(targets, actuals)`
  helper, both in `tests/`.
- **Route:** `/api/client/score` adds `momentum.streakWeeks`. Commitment data needs no new
  route — the `ShapeCommit` bridge reads `score_commitments` directly through the RLS-scoped
  client (owner reads their own; a coach reads via `is_coach_on_client`); writes go through the RPCs.
- **Cron:** the settlement step.
- **Per-role:** commitments are a client feature; coaches only *propose*. Dietitians ride client rails.

## 5. Out of scope / deferred

- Escalation for **commitments** (a streak of met commitments) — v3.
- Multi-week / recurring commitments — v3 (one ISO week only).
- Staking on the **store balance** as escrow (upfront deduction) — we settle at week-end, no escrow.
- Team/group commitments — not now.
