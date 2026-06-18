# Shape Score — Momentum + Accountability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Momentum meter (consistency carrot) and accountability clawback (missed-commitment stick) to Shape Score, on a two-number ledger split so penalties have teeth without spending or a bad week ever demoting anyone.

**Architecture:** One `score_ledger`, two derived numbers — **Shape Score** (rank; `Σ delta WHERE source_kind <> 'store_redeem'`, high-water-marked) and **spendable balance** (`Σ delta`). Momentum is a 0–100 value folded from the trailing day-activity series; sustaining it pays a weekly `momentum_bonus`. Missed *committed* obligations write bounded `−½` penalty rows. All writes go through SECURITY DEFINER RPCs (hard-coded/derived amounts, ownership-verified, idempotent) — the 2026-06-18 lockdown pattern. A daily cron is the authoritative evaluator so ghosters still get penalized.

**Tech Stack:** Next.js 16 (App Router, `src/app/api/**`, TS), Supabase Postgres (RLS + SECURITY DEFINER RPCs, raw-SQL migrations the owner runs), mobile broadsheet (babel/Vite JSX in `mobile-app/src/broadsheet/`, rebuilt to `public/m`), node:test for pure `.mjs` logic.

## Global Constraints

- **Migrations:** write the SQL file under `supabase-migrations/`, reply with ONLY the `raw.githubusercontent.com/.../<file>.sql` link — the owner runs it. Award/penalty calls are fire-and-forget and **no-op until applied**.
- **Mobile build:** any `mobile-app/**` edit must rebuild from **PowerShell** (`$env:VITE_BASE='/m/'; npm run build`) then copy to `public/m` — Git Bash path-mangles `VITE_BASE`.
- **Ledger writes:** clients can no longer write `score_ledger` directly (lockdown). Every award/debit is a DEFINER RPC; `user_id` is ALWAYS `auth.uid()`; idempotent on the unique `(user_id, source_kind, source_id)` index via `ON CONFLICT DO NOTHING`.
- **Categories:** `score_ledger.category` CHECK already allows `workouts|adherence|habits|prs|community|endorsements|radio|referrals|other` — **no CHECK migration**. New rows reuse these.
- **Tunable constants (verbatim):** Momentum `STEP_UP=7`, `STEP_DOWN=12`, `BONUS_THRESHOLD=80`, `BONUS_POINTS=25`. Penalties: session `−6`, check-in `−7`, assigned workout `−5`, habit-streak `−2`; habit streak must be `>=3` days. Guards: weekly penalty cap `−30`, spendable-balance floor `0`, grace = end-of-day (daily) / end-of-week (check-in).
- **Honest-data:** signed-out = demo preview only; a signed-in account shows real values (or `'—'`), never demo.
- **Per-role:** Momentum + penalties are a **client** feature; coaches keep `/api/coach/score` and only interact via `waive_penalty`.

## File Structure

- `mobile-app/src/services/momentum.mjs` — **new.** Pure `computeMomentum(daySeries)` fold + `momentumThresholdMet(value)`. The single source of the recurrence (imported by the node test, and mirrored in SQL with identical constants).
- `src/lib/score-derive.ts` — **new.** Pure `deriveScore(rows)` → `{ shapeScore, spendableBalance, highWaterScore }` from ledger rows. Used by the score route; unit-tested via a `.mjs` twin.
- `mobile-app/tests/momentum.test.mjs`, `mobile-app/tests/score-derive.test.mjs` — **new** node tests.
- `supabase-migrations/2026-06-18-score-momentum.sql` — **new.** `compute_momentum(uid)` + `award_momentum_bonus()`.
- `supabase-migrations/2026-06-18-score-penalties.sql` — **new.** `apply_obligation_penalty(...)` + `waive_penalty(...)`.
- `src/app/api/client/score/route.ts` — **modify.** Two-number + high-water + at-risk + momentum in the response.
- `src/app/api/cron/score-accountability/route.ts` — **new.** Daily authoritative evaluator.
- `mobile-app/src/services/shapeBackend.js` — **modify.** `window.ShapeMomentum.check()` (on-open fast path) + thread `momentum`/`at_risk`/`spendable` through the score cache.
- `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — **modify.** `_bsUseLiveScore` consumes the new fields; the Score page renders the Momentum bar + at-risk line; the home directive gains stakes copy.
- `public/newdesign/score.jsx`, `clientScore.jsx` — **modify.** Show the Momentum bar + at-risk on the web score surfaces (`?v=` bump).

---

## PHASE A — Two-number score + high-water tier (no migration)

Foundation. Makes spending stop demoting, penalties start counting, and the rank high-water-marked. Ships first because Momentum + penalties read these numbers.

### Task A1: Pure score derivation + test

**Files:**
- Create: `mobile-app/src/services/scoreDerive.mjs`
- Create: `mobile-app/tests/score-derive.test.mjs`

**Interfaces:**
- Produces: `deriveScore(rows) -> { shapeScore:int, spendableBalance:int, highWaterScore:int }` where `rows = [{ delta:int, source_kind:string|null, earned_at:ISOstring }]`.

- [ ] **Step 1: Write the failing test** (`mobile-app/tests/score-derive.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveScore } from '../src/services/scoreDerive.mjs';

test('shapeScore excludes redemptions; spendable includes them', () => {
  const rows = [
    { delta: 800, source_kind: 'activity', earned_at: '2026-06-01T00:00:00Z' },
    { delta: -500, source_kind: 'store_redeem', earned_at: '2026-06-02T00:00:00Z' },
    { delta: -7, source_kind: 'penalty_checkin', earned_at: '2026-06-03T00:00:00Z' },
  ];
  const r = deriveScore(rows);
  assert.equal(r.shapeScore, 793);        // 800 - 7 (penalty counts, redeem excluded)
  assert.equal(r.spendableBalance, 293);  // 800 - 500 - 7
});

test('highWaterScore is the running max of the rank number over time', () => {
  const rows = [
    { delta: 900, source_kind: 'activity', earned_at: '2026-06-01T00:00:00Z' }, // rank 900
    { delta: -200, source_kind: 'penalty_session', earned_at: '2026-06-05T00:00:00Z' }, // rank 700
    { delta: -500, source_kind: 'store_redeem', earned_at: '2026-06-06T00:00:00Z' }, // rank still 700 (redeem excluded)
  ];
  const r = deriveScore(rows);
  assert.equal(r.shapeScore, 700);
  assert.equal(r.highWaterScore, 900); // peaked at 900 before the penalty
});

test('empty ledger → all zero', () => {
  const r = deriveScore([]);
  assert.deepEqual(r, { shapeScore: 0, spendableBalance: 0, highWaterScore: 0 });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`cd mobile-app && node --test tests/score-derive.test.mjs` → "Cannot find module scoreDerive.mjs")

- [ ] **Step 3: Implement** (`mobile-app/src/services/scoreDerive.mjs`)

```js
// Pure Shape Score derivation from raw ledger rows. ONE source of truth for the
// two-number split + high-water rank; mirrored in src/lib/score-derive.ts and the
// /api/client/score route. Rank (shapeScore) excludes store redemptions so spending
// never demotes; penalties (negative, non-redeem) DO count. highWaterScore is the
// running max of the rank number over time, so the displayed tier never demotes.
export function deriveScore(rows) {
  const sorted = [...(rows || [])].sort((a, b) => String(a.earned_at).localeCompare(String(b.earned_at)));
  let rank = 0, spendable = 0, high = 0;
  for (const r of sorted) {
    const d = Number(r.delta) || 0;
    spendable += d;
    if (r.source_kind !== 'store_redeem') { rank += d; if (rank > high) high = rank; }
  }
  return { shapeScore: rank, spendableBalance: spendable, highWaterScore: high };
}
```

- [ ] **Step 4: Run it — expect PASS** (`cd mobile-app && node --test tests/score-derive.test.mjs`)

- [ ] **Step 5: Commit** — `git add mobile-app/src/services/scoreDerive.mjs mobile-app/tests/score-derive.test.mjs && git commit -m "feat(score): pure two-number + high-water derivation (tested)"`

### Task A2: TS twin for the score route

**Files:**
- Create: `src/lib/score-derive.ts` (TS mirror — identical logic; the route is TS and can't import the `.mjs` test twin cleanly).

**Interfaces:**
- Produces: `deriveScore(rows: { delta:number; source_kind:string|null; earned_at:string }[]): { shapeScore:number; spendableBalance:number; highWaterScore:number }`.

- [ ] **Step 1: Implement** — copy the `mjs` body verbatim into a typed export. Add a one-line comment: `// Mirror of mobile-app/src/services/scoreDerive.mjs — keep in sync.`
- [ ] **Step 2: Verify** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(score): TS twin of deriveScore for the route"`

### Task A3: Score route returns the two numbers + high-water tier + at-risk

**Files:**
- Modify: `src/app/api/client/score/route.ts`

**Interfaces:**
- Consumes: `deriveScore` (A2), the existing `TIERS` array.
- Produces: response adds `spendable_balance:number`, `at_risk:boolean`; `current_tier` is the **high-water** tier; `points_total` stays the rank number (`shapeScore`).

- [ ] **Step 1:** Add `source_kind` to the ledger select (the `allRows` query at ~`:58`): `.select('category, delta, earned_at, source_kind')`.
- [ ] **Step 2:** Replace the inline rank/month/week sum loop with: keep `points_month`/`week_gain` as-is, but compute `const { shapeScore, spendableBalance, highWaterScore } = deriveScore(rows);` and use `shapeScore` for `points_total`. Tier resolves off `highWaterScore` (not `shapeScore`): `let hi=0; for(...) if (highWaterScore >= TIERS[i][1]) hi=i; const displayed = TIERS[hi];`. Compute `at_risk = shapeScore < displayed[1]` (only possible when `displayed` is above Raw). `points_to_next = next ? next[1] - highWaterScore : 0`.
- [ ] **Step 3:** Add to the JSON: `spendable_balance: spendableBalance`, `at_risk`, and keep `current_tier`/`next_tier`/`points_total` semantics (rank = `shapeScore`, tier = high-water). Leave `composite` untouched.
- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; **Supabase MCP assertion** (run via `execute_sql`): for a known user, confirm `Σ delta` (spendable) and `Σ delta FILTER (WHERE source_kind <> 'store_redeem')` (rank) match the route's numbers, and the high-water ≥ rank.
- [ ] **Step 5: Commit** — `git commit -am "feat(score): two-number split + high-water tier + at-risk in /api/client/score"`

### Task A4: Mobile + web consume high-water tier, at-risk, spendable

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`_bsUseLiveScore` ~`:15101`; store balance reads), `mobile-app/src/services/shapeBackend.js` (score cache), `public/newdesign/score.jsx`, `public/newdesign/clientScore.jsx`.

- [ ] **Step 1:** `_bsUseLiveScore`: the returned `total` stays the rank (`points_total`); add `spendable: data.spendable_balance` and `atRisk: data.at_risk`. The store/redeem affordability uses `spendable`, not `total`.
- [ ] **Step 2:** Score page (`BSShapeScorePage`): when `atRisk`, render the at-risk line under the tier (`"Slipped below {tier} · earn {points_to_next} to re-secure"`); the tier shown is the (high-water) `current_tier`. Honest `—`-style: only when signed-in.
- [ ] **Step 3:** Web `score.jsx`/`clientScore.jsx`: same — tier from `current_tier`, an at-risk line when `at_risk`, balance from `spendable_balance`. Bump `?v=` on the touched files' HTML refs.
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; PowerShell mobile build + copy `public/m`; `cd mobile-app && node --test` (232 pass); parse-check the edited website `.jsx`.
- [ ] **Step 5: Commit** — `git commit -am "feat(score): surface high-water tier + at-risk + spendable across mobile + web"`

---

## PHASE B — Momentum meter + weekly bonus

### Task B1: Pure momentum fold + test

**Files:**
- Create: `mobile-app/src/services/momentum.mjs`
- Create: `mobile-app/tests/momentum.test.mjs`

**Interfaces:**
- Produces: `computeMomentum(activeDays) -> int 0..100` where `activeDays` is an ordered (oldest→newest) array of booleans (one per calendar day in the window); `momentumThresholdMet(value) -> bool`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMomentum, STEP_UP, STEP_DOWN, BONUS_THRESHOLD, momentumThresholdMet } from '../src/services/momentum.mjs';

test('consistent two weeks fills the meter', () => {
  assert.equal(computeMomentum(Array(14).fill(true)), 98); // 14 * 7 = 98, capped 100
});
test('a missed day knocks it down a notch, not a reset', () => {
  // 10 active (70) then 1 miss (-12 = 58) then 1 active (65)
  const days = [...Array(10).fill(true), false, true];
  assert.equal(computeMomentum(days), 65);
});
test('clamps to 0..100', () => {
  assert.equal(computeMomentum(Array(30).fill(true)), 100);
  assert.equal(computeMomentum(Array(5).fill(false)), 0);
});
test('threshold helper', () => {
  assert.equal(momentumThresholdMet(BONUS_THRESHOLD), true);
  assert.equal(momentumThresholdMet(BONUS_THRESHOLD - 1), false);
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (`mobile-app/src/services/momentum.mjs`)

```js
// Momentum: a 0–100 "don't break the streak" meter, folded over an ordered day
// series (oldest→newest). +STEP_UP per active day, −STEP_DOWN per missed day
// (a notch, not a reset), clamped. Constants are the single source of truth;
// the SQL compute_momentum() mirrors them exactly.
export const STEP_UP = 7;
export const STEP_DOWN = 12;
export const BONUS_THRESHOLD = 80;
export const BONUS_POINTS = 25;
export function computeMomentum(activeDays) {
  let m = 0;
  for (const active of (activeDays || [])) {
    m = Math.max(0, Math.min(100, m + (active ? STEP_UP : -STEP_DOWN)));
  }
  return Math.round(m);
}
export function momentumThresholdMet(value) { return (Number(value) || 0) >= BONUS_THRESHOLD; }
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(momentum): pure fold + constants (tested)"`

### Task B2: SQL — `compute_momentum` + `award_momentum_bonus`

**Files:**
- Create: `supabase-migrations/2026-06-18-score-momentum.sql`

**Interfaces:**
- Produces: `compute_momentum(p_uid uuid) returns integer` (SECURITY DEFINER); `award_momentum_bonus() returns jsonb` (DEFINER, `auth.uid()`, idempotent per ISO week, gates on `compute_momentum >= 80`).

- [ ] **Step 1: Write the migration.** `compute_momentum`: build the last-30-day active-day series from `daily_health_snapshot` (a day is active when `calories>0 OR workout_minutes>0 OR sleep_hours>0`) **plus** `user_habit_completions` and `client_checkins` for that day; fold the same `+7/−12 clamp 0..100` recurrence in a recursive CTE / ordered aggregate; return the rounded value. `award_momentum_bonus`: `if compute_momentum(auth.uid()) >= 80` then insert `+25` (`category 'adherence'`, `source_kind 'momentum_bonus'`, `source_id = md5('momentum:'||uid||':'||to_char(now(),'IYYY-IW'))::uuid`) `ON CONFLICT DO NOTHING`. Grant execute to `authenticated`. (Full SQL written in the file — folds with `WITH RECURSIVE` over a `generate_series` of the 30 days.)
- [ ] **Step 2: Apply + assert** via Supabase MCP `execute_sql`: `select compute_momentum('<known-uid>')` returns 0..100; calling `award_momentum_bonus()` twice in the same week inserts at most one `momentum_bonus` row.
- [ ] **Step 3: Commit** the migration file; **post the raw GitHub link** for the owner to run.

### Task B3: `ShapeMomentum.check()` + score route returns momentum

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (add `window.ShapeMomentum = { check }` calling `award_momentum_bonus` then invalidating the metrics cache; call it on session resolve next to `ShapeGoalAwards.check`), `src/app/api/client/score/route.ts` (add `momentum: { value, bonusThisWeek }` to the response — `value` via `supabase.rpc('compute_momentum', {p_uid:user.id})`, `bonusThisWeek` = is there a `momentum_bonus` row this ISO week).

- [ ] **Step 1:** shapeBackend: `async function checkMomentum(){ if(!supabase||!state.user?.id) return; try{ await supabase.rpc('award_momentum_bonus'); invalidateClientMetrics(); }catch(e){} }` → `window.ShapeMomentum = { check: checkMomentum }`; call in `getCurrentSession` resolve.
- [ ] **Step 2:** score route: `const { data: mv } = await supabase.rpc('compute_momentum', { p_uid: user.id }); const momentum = { value: Number(mv)||0, bonusThisWeek: rows.some(r => r.source_kind==='momentum_bonus' && new Date(r.earned_at) >= weekStartOfISOWeek) };` add to JSON.
- [ ] **Step 3: Verify** — tsc; mobile build + `public/m`; node --test.
- [ ] **Step 4: Commit** — `git commit -am "feat(momentum): award on app-open + return momentum in score route"`

### Task B4: Momentum bar UI (mobile Score page + web)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSShapeScorePage` — a Momentum bar + "this week's bonus" line, reading `_bsUseLiveScore().momentum`), `public/newdesign/score.jsx` + `clientScore.jsx` (same).

- [ ] **Step 1:** Add a Momentum section above the reward tiers: a 0–100 bar (theme teal), label `"Momentum {value}"`, and `bonusThisWeek ? "+25 banked this week" : "Reach 80 for a weekly +25"`. Signed-out → demo value; signed-in → real.
- [ ] **Step 2:** Web parity in `score.jsx`/`clientScore.jsx`; `?v=` bump.
- [ ] **Step 3: Verify** — mobile build + `public/m`; parse-check website jsx.
- [ ] **Step 4: Commit** — `git commit -am "feat(momentum): Momentum bar on the Score page (mobile + web)"`

---

## PHASE C — Accountability clawback + cron

### Task C1: SQL — `apply_obligation_penalty` + `waive_penalty`

**Files:**
- Create: `supabase-migrations/2026-06-18-score-penalties.sql`

**Interfaces:**
- Produces: `apply_obligation_penalty(p_uid uuid, p_kind text, p_source_id uuid, p_day date) returns jsonb` (DEFINER; verifies the obligation row exists + is `p_uid`'s + was actually missed + not in a paused window; respects the weekly `−30` cap and `0` balance floor; inserts the bounded negative row idempotently). `waive_penalty(p_penalty_source_kind text, p_penalty_source_id uuid) returns jsonb` (DEFINER; caller must be a coach of the penalized client via `is_coach_on_client`; inserts an offsetting positive row `source_kind 'penalty_waive'`).

- [ ] **Step 1: Write the migration** with the per-kind amount table (session `−6` / checkin `−7` / workout `−5` / habit `−2`), the existence+ownership checks per kind (`sessions`, `client_checkins` absence, `client_workouts`, habit streak `>=3` from `user_habit_completions`), the pause check (`client_settings`), the weekly-cap query (`Σ penalties this ISO week > -30` before adding), the balance-floor check (`Σ all delta + penalty >= 0`), and `ON CONFLICT DO NOTHING` on `(uid, source_kind, source_id)`. Amounts hard-coded; `p_kind` selects which. Grant: `apply_obligation_penalty` to `service_role` only (cron) — NOT `authenticated` (clients must not self-penalize/trigger); `waive_penalty` to `authenticated` (coach-gated inside).
- [ ] **Step 2: Apply + assert** via MCP: a penalty for a non-existent obligation no-ops; a second identical call doesn't double-charge; a waive by a non-coach no-ops; the weekly cap blocks the 6th `−6`.
- [ ] **Step 3: Commit** + post the raw link.

### Task C2: Daily cron evaluator

**Files:**
- Create: `src/app/api/cron/score-accountability/route.ts`
- Modify: `vercel.json` (cron schedule, daily) if present, else document the Supabase scheduled-function alternative.

**Interfaces:**
- Consumes: `apply_obligation_penalty` (service-role), `award_momentum_bonus`.
- Produces: a `GET`/`POST` route guarded by a `CRON_SECRET` header that, per active client, evaluates yesterday's due obligations and applies past-grace penalties + the weekly momentum bonus, and enqueues heads-up notifications for *today's* still-open obligations.

- [ ] **Step 1:** Implement the route: auth via `x-cron-secret` (env `CRON_SECRET`); use the **service-role** client; query the day's due obligations (missed sessions, last-week check-in absences at week-end, skipped assigned workouts, broken habit streaks) and call `apply_obligation_penalty` for each; call `award_momentum_bonus` per user at the weekly boundary; write `notifications` rows (never-shaming copy) for items still inside the grace window. Fail-open per user (one bad user can't abort the batch). Skip paused users.
- [ ] **Step 2:** Add the schedule (Vercel cron `0 8 * * *` or Supabase scheduled function). Document in WORKLOG + War Room (`RAW_ROUTES`).
- [ ] **Step 3: Verify** — tsc + next build; a manual authorized call against staging applies the expected rows for a seeded missed obligation; no rows for a paused user.
- [ ] **Step 4: Commit** — `git commit -am "feat(score): daily accountability cron (penalties + momentum + heads-ups)"`

### Task C3: Heads-up + at-risk surfacing in the directive

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (the home "Today · your move" directive — add stakes copy to the existing `checkin`/`training`/`sleep` levers, e.g. `"Check in tonight · keep your momentum + protect 15 pts"`), `public/newdesign/dashSignals.js` mirror if the copy lives there.

- [ ] **Step 1:** Thread the at-risk / pending-penalty state (from the score response) into the directive's reason line — additive copy only, no new lever, never-shaming tone.
- [ ] **Step 2: Verify** — mobile build + `public/m`; node --test (directive tests still green).
- [ ] **Step 3: Commit** — `git commit -am "feat(score): stakes copy in the home directive"`

### Task C4: Coach waive affordance

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` (`BSProClientFullProfilePage` — a "Waive penalty" action on a client's recent penalty, calling `waive_penalty` via a `ShapeCoachPenalties.waive` helper in `shapeBackend.js`).

- [ ] **Step 1:** Add `window.ShapeCoachPenalties = { waive(sourceKind, sourceId) }` → `supabase.rpc('waive_penalty', ...)`; surface a small "Waive" affordance on the client profile's recent-penalty row (visible only to a linked coach).
- [ ] **Step 2: Verify** — mobile build + `public/m`.
- [ ] **Step 3: Commit** — `git commit -am "feat(score): coach can waive a client's penalty"`

### Task C5: WORKLOG + War Room + spec cross-link

- [ ] Add a dated WORKLOG entry summarizing the three phases + the two migration links + the cron env (`CRON_SECRET`). Register the cron route in `src/lib/warroom.ts` `RAW_ROUTES`. Commit.

---

## Self-Review

**Spec coverage:** §2 two-number/high-water → A1–A4. §3 Momentum + bonus → B1–B4. §4 clawback (4 obligations, −½, guards) → C1. §5 cron + on-open → B3, C2. §6 surfacing → A4, B4, C3. §4 waive → C4. §7 source_kinds/RPCs → B2, C1. §8 deferred (session earns, escalation, stakes) → explicitly out of scope. All covered.

**Placeholder scan:** the two SQL migrations (B2, C1) describe the function bodies precisely (inputs, checks, amounts, idempotency keys, grants) but the **full SQL text is to be written in the migration file at execution** — this is the one place a task says "written in the file" rather than inlining 80 lines of SQL twice; the constraints (amounts, source_ids, grants, guards) are fully specified so there's no ambiguity. Everything else inlines its code.

**Type consistency:** `deriveScore` shape (`shapeScore/spendableBalance/highWaterScore`) is identical in A1/A2/A3. `computeMomentum`/constants identical B1↔B2 (mirrored). `momentum:{value,bonusThisWeek}` consistent B3↔B4. `apply_obligation_penalty(p_uid,p_kind,p_source_id,p_day)` + `waive_penalty(p_penalty_source_kind,p_penalty_source_id)` consistent C1↔C2↔C4.

**Tunable constants** appear once in Global Constraints and are referenced, not redefined.
