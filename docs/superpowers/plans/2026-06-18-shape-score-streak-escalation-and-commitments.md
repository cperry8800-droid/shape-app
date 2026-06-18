# Shape Score v2 — Streak Escalation + Weekly Commitments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (D) momentum-bonus escalation for sustained streaks and (E) coach/self weekly commitments with a two-sided stake, both on the existing Shape Score ledger + daily cron.

**Architecture:** Two independent slices. **D** replaces `award_momentum_bonus()` so the weekly bonus grows +15/consecutive-week to a +100 cap, with the streak count surfaced in the score route + Momentum bar. **E** adds a `score_commitments` RLS table + three DEFINER RPCs (set / accept / settle), settled by the existing daily accountability cron, with client + coach UI. Each slice ships and is testable alone.

**Tech Stack:** Next.js 16 (App Router, `src/app/api/**`, TS), Supabase Postgres (RLS + SECURITY DEFINER RPCs, raw-SQL migrations the owner runs), mobile broadsheet (babel/Vite JSX in `mobile-app/src/`), node:test for pure `.mjs`.

## Global Constraints

- **Migrations:** write the `.sql` under `supabase-migrations/`; reply with ONLY the `raw.githubusercontent.com/.../<file>.sql` link — the owner runs it. Fire-and-forget; callers no-op until applied.
- **Mobile build:** any `mobile-app/**` edit → rebuild from **PowerShell** (`$env:VITE_BASE='/m/'; npm run build`) then copy to `public/m`. Bump `?v=` on referenced website `.jsx`.
- **Ledger discipline:** all writes via SECURITY DEFINER RPC; `user_id` is `auth.uid()` (self) or service-role (cron); idempotent via `ON CONFLICT (user_id, source_kind, source_id) WHERE source_kind is not null and source_id is not null DO NOTHING`.
- **Tunables (verbatim):** Momentum `BONUS_THRESHOLD=80`, `BONUS_BASE=25`, `BONUS_STEP=15`, `BONUS_MAX=100`. Commitment stake range `5..50`. New `source_kind`s: `commitment_win` (+, `adherence`), `commitment_loss` (−, `adherence`); momentum keeps `momentum_bonus`. No CHECK migration.
- **Tests in the ROOT `tests/` dir** (the real suite in `package.json`), importing `../mobile-app/src/services/*.mjs`. Register each new test file in the `test` script.
- **Safety:** never-shaming copy; tier never demotes; spendable balance never < 0; commitment wins/losses are NOT counted against the −30/week penalty cap; coach-set commitments require client consent before points are at risk.

---

## PHASE D — Momentum streak escalation

### Task D1: Pure escalation helper + test

**Files:**
- Modify: `mobile-app/src/services/momentum.mjs`
- Create: `tests/momentum-bonus.test.mjs` (register in `package.json` test script)

**Interfaces:**
- Produces: `BONUS_STEP=15`, `BONUS_MAX=100`, `momentumBonus(streakWeeks:int)->int = min(BONUS_MAX, BONUS_BASE + BONUS_STEP*streakWeeks)` where `streakWeeks` ≥ 0 (0 = first qualifying week).

- [ ] **Step 1: Write the failing test** (`tests/momentum-bonus.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { momentumBonus, BONUS_STEP, BONUS_MAX } from '../mobile-app/src/services/momentum.mjs';

test('first qualifying week pays the base 25', () => { assert.equal(momentumBonus(0), 25); });
test('escalates +15 per consecutive prior week', () => {
  assert.deepEqual([0,1,2,3,4,5].map(momentumBonus), [25,40,55,70,85,100]);
});
test('caps at 100', () => { assert.equal(momentumBonus(6), 100); assert.equal(momentumBonus(99), 100); });
test('constants', () => { assert.equal(BONUS_STEP, 15); assert.equal(BONUS_MAX, 100); });
```

- [ ] **Step 2: Run — expect FAIL** (`node --test tests/momentum-bonus.test.mjs` → "momentumBonus is not a function").
- [ ] **Step 3: Implement** in `momentum.mjs` — add below the existing constants:

```js
export const BONUS_BASE = 25;   // the flat weekly bonus at >= BONUS_THRESHOLD
export const BONUS_STEP = 15;   // added per consecutive prior bonus-week
export const BONUS_MAX  = 100;  // cap — reached at a 6-week streak
// streakWeeks = consecutive immediately-prior ISO weeks that already earned the bonus.
export function momentumBonus(streakWeeks) {
  return Math.min(BONUS_MAX, BONUS_BASE + BONUS_STEP * Math.max(0, Number(streakWeeks) || 0));
}
```
(Keep the existing `BONUS_POINTS = 25` export for back-compat; `BONUS_BASE` is its alias.)

- [ ] **Step 4: Run — expect PASS.** Add `tests/momentum-bonus.test.mjs` to the `package.json` `test` script; `npm test` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(momentum): escalation helper momentumBonus (tested)"`

### Task D2: Migration — escalating `award_momentum_bonus`

**Files:**
- Create: `supabase-migrations/2026-06-18-score-momentum-escalation.sql`

**Interfaces:**
- Produces: `create or replace function award_momentum_bonus()` — unchanged signature/grant; awards `momentumBonus(streak)` instead of a flat 25.

- [ ] **Step 1: Write the migration.** `create or replace` the Phase B function; before the insert, capture momentum (≥80 gate unchanged), then count the consecutive prior-week streak and compute the escalated delta:

```sql
create or replace function public.award_momentum_bonus()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_m   integer;
  v_streak integer := 0;
  v_n   integer;
  v_delta integer;
  v_ins integer;
begin
  if v_uid is null then return jsonb_build_object('awarded', false); end if;
  v_m := public.compute_momentum();
  if v_m < 80 then return jsonb_build_object('awarded', false, 'momentum', v_m, 'streak_weeks', 0); end if;
  -- consecutive immediately-prior ISO weeks that already have a momentum_bonus row
  for v_n in 1..6 loop
    if exists (
      select 1 from public.score_ledger
      where user_id = v_uid and source_kind = 'momentum_bonus'
        and to_char(earned_at, 'IYYY-"W"IW') = to_char(now() - (v_n || ' weeks')::interval, 'IYYY-"W"IW')
    ) then v_streak := v_streak + 1; else exit; end if;
  end loop;
  v_delta := least(100, 25 + 15 * v_streak);  -- mirrors momentum.mjs momentumBonus()
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'adherence', 'momentum_bonus',
            md5('momentum_bonus:'||v_uid::text||':'||to_char(now(),'IYYY-"W"IW'))::uuid,
            v_delta, 'Momentum bonus')
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('awarded', v_ins > 0, 'momentum', v_m,
                            'streak_weeks', v_streak + 1, 'points', case when v_ins>0 then v_delta else 0 end);
end $$;
grant execute on function public.award_momentum_bonus() to authenticated;
```

- [ ] **Step 2: Validate read-only** via Supabase MCP: run the streak-count `for` body + `least(100,25+15*streak)` as a SELECT against a fake uid (0 → 25) and confirm the `to_char(...,'IYYY-"W"IW')` week tokens resolve. (Do NOT create the function in prod.)
- [ ] **Step 3: Commit** the migration; **post the raw GitHub link**.

### Task D3: Score route + Momentum bar show the streak

**Files:**
- Modify: `src/app/api/client/score/route.ts` (add `streakWeeks` to the `momentum` object — count consecutive prior `momentum_bonus` weeks from the already-fetched `rows`, +1 when banked this week).
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (the Momentum bar bonus line) + `public/newdesign/clientScore.jsx` (`?v=` bump).

- [ ] **Step 1:** route — after computing `bonusThisWeek`, count the streak from `rows` (ISO-week tokens of `momentum_bonus` rows, consecutive back from this week) and set `momentum = { value, bonusThisWeek, streakWeeks }`.
- [ ] **Step 2:** mobile bar — when `bonusThisWeek` and `streakWeeks > 1`, show `🔥 {streakWeeks}-week streak · +{momentumBonus(streakWeeks-1)} banked`; else the existing copy. Import nothing new (compute inline or read `momentum.points` if the route returns it — add `points` to the route `momentum` object for the exact banked amount).
- [ ] **Step 3:** web `clientScore.jsx` — same line; bump `clientScore.jsx?v=` on ClientApp.html + ClientScore.html.
- [ ] **Step 4: Verify** — `tsc --noEmit`; PowerShell mobile build + `public/m`; `npm test`; parse-check web jsx.
- [ ] **Step 5: Commit** — `git commit -am "feat(momentum): surface the streak + escalated bonus"`

---

## PHASE E — Weekly commitment + stake

### Task E1: Pure `commitmentMet` helper + test

**Files:**
- Create: `mobile-app/src/services/commitments.mjs`
- Create: `tests/commitments.test.mjs` (register in `package.json`)

**Interfaces:**
- Produces: `commitmentMet(targets, actuals) -> bool` where `targets = { workouts?, checkin?, habits? }`, `actuals = { workouts:int, checkin:bool, habits:int }`. Met = every *specified* target reached (omitted key ignored). `STAKE_MIN=5`, `STAKE_MAX=50`, `clampStake(n)->int`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { commitmentMet, clampStake, STAKE_MIN, STAKE_MAX } from '../mobile-app/src/services/commitments.mjs';

test('all specified targets reached → met', () => {
  assert.equal(commitmentMet({ workouts:4, checkin:true, habits:5 }, { workouts:4, checkin:true, habits:7 }), true);
});
test('any specified target short → not met', () => {
  assert.equal(commitmentMet({ workouts:4 }, { workouts:3, checkin:false, habits:0 }), false);
});
test('omitted targets are ignored', () => {
  assert.equal(commitmentMet({ checkin:true }, { workouts:0, checkin:true, habits:0 }), true);
});
test('stake clamps to 5..50', () => {
  assert.equal(clampStake(0), 5); assert.equal(clampStake(999), 50); assert.equal(clampStake(20), 20);
  assert.equal(STAKE_MIN, 5); assert.equal(STAKE_MAX, 50);
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (`commitments.mjs`)

```js
export const STAKE_MIN = 5;
export const STAKE_MAX = 50;
export function clampStake(n) { return Math.max(STAKE_MIN, Math.min(STAKE_MAX, Math.round(Number(n) || 0))); }
// targets: { workouts?, checkin?, habits? }; actuals: { workouts, checkin, habits }
export function commitmentMet(targets, actuals) {
  const t = targets || {}, a = actuals || {};
  if (t.workouts != null && (Number(a.workouts) || 0) < Number(t.workouts)) return false;
  if (t.checkin && !a.checkin) return false;
  if (t.habits != null && (Number(a.habits) || 0) < Number(t.habits)) return false;
  // require at least one specified target (an empty commitment is never "met")
  return (t.workouts != null) || !!t.checkin || (t.habits != null);
}
```

- [ ] **Step 4: Run — expect PASS;** register in `package.json`; `npm test` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(commitments): pure commitmentMet + stake clamp (tested)"`

### Task E2: Migration — `score_commitments` table + RPCs

**Files:**
- Create: `supabase-migrations/2026-06-18-score-commitments.sql`

**Interfaces:**
- Produces: table `score_commitments`; `set_commitment(p_user uuid, p_targets jsonb, p_stake int)`, `accept_commitment(p_id uuid)`, `settle_commitment(p_user uuid, p_week date)`.

- [ ] **Step 1: Write the migration.**
  - Table per spec §3.3 (PK id; `unique(user_id, week_of)`; `stake` CHECK 5..50; `status` CHECK proposed/active/met/missed). Enable RLS. Policies: `user_id = auth.uid()` → select + insert + update own; `is_coach_on_client(user_id)` → select + insert (proposal). (Point writes go through the RPCs, not direct, but the table holds no points.)
  - `set_commitment` — DEFINER, `authenticated`. `v_week := date_trunc('week', now())::date` (this ISO week). If `p_user = auth.uid()` → `v_status := 'active'`; elsif `is_coach_on_client(p_user)` → `v_status := 'proposed'`; else return error. Validate `p_stake between 5 and 50`. `insert ... on conflict (user_id, week_of) do update set targets=excluded.targets, stake=excluded.stake, created_by=excluded.created_by, status=excluded.status where score_commitments.status in ('proposed','active')` (don't overwrite a settled week). Return the row as jsonb.
  - `accept_commitment(p_id)` — DEFINER, `authenticated`. `update score_commitments set status='active' where id=p_id and user_id=auth.uid() and status='proposed'`. Return `{accepted: rowcount>0}`.
  - `settle_commitment(p_user, p_week)` — DEFINER, **service-role only** (revoke from public, grant service_role). For the row `(p_user, p_week)` with `status='active'` and `now() >= p_week + 7`: compute actuals over `[p_week, p_week+6]` — workouts = count(distinct days with `daily_health_snapshot.workout_minutes>0` OR an `activities` started_at::date in range), checkin = a `client_checkins` row for `week_of=p_week`, habits = count of `user_habit_completions` in range. `v_met := <commitmentMet logic in SQL>`. Per-user advisory lock + 0-balance floor on a loss (clamp like penalties). Insert `commitment_win +stake` (met) or `commitment_loss −min(stake, balance)` (missed) into `score_ledger` (category `adherence`, `source_kind` accordingly, `source_id = commitment id`, ON CONFLICT DO NOTHING). `update ... set status = (met ? 'met' : 'missed'), settled_at = now()`. Return jsonb `{settled, met, amount}`.
- [ ] **Step 2: Validate read-only** via MCP: the table DDL parses (run as a `create table` in a rolled-back check is not possible — instead assert the actuals sub-queries resolve against the real schema with a fake uid + week, like the Phase C validation). Confirm `is_coach_on_client` + the dedupe index are referenced correctly.
- [ ] **Step 3: Commit** + post the raw link.

### Task E3: Cron settlement step

**Files:**
- Modify: `src/app/api/cron/score-accountability/route.ts`

- [ ] **Step 1:** in the per-user loop, after the penalty/earn passes, settle last week's commitment: `const { data } = await admin.rpc('settle_commitment', { p_user: uid, p_week: lastMonday });` — on `data.settled`, push a never-shaming heads-up (won → "you hit your commitment, +S"; missed → "the week's commitment didn't land — next week's on you"). Fail-open (already wrapped per-user).
- [ ] **Step 2: Verify** — `tsc --noEmit` + `next build`.
- [ ] **Step 3: Commit** — `git commit -am "feat(commitments): settle weekly commitments in the daily cron"`

### Task E4: `ShapeCommit` bridge + client UI

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (`window.ShapeCommit = { get, set, accept }`).
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (a "This week's commitment" card on `BSShapeScorePage`).
- Modify: `public/newdesign/clientScore.jsx` (web parity; `?v=` bump).

- [ ] **Step 1:** `ShapeCommit.get()` — read `score_commitments` for `auth.uid()` + this ISO week via the RLS-scoped client (also fetch live actuals from the existing metrics if cheap, else show targets only). `set(targets, stake)` → `rpc('set_commitment', { p_user: state.user.id, p_targets, p_stake })`; `accept(id)` → `rpc('accept_commitment', { p_id: id })`. All guarded (`!supabase || !state.user?.id`), no-op pre-migration.
- [ ] **Step 2:** mobile card states — **none:** "Set a commitment" → a sheet (target chips: N workouts / check-in / K habits + a 5–50 stake slider) → `set`; **proposed (coach):** Accept / Decline; **active:** live progress + the stake; **settled:** the outcome (+S / −S). Theme tokens only; portal sheet into `#bs-phone-surface`.
- [ ] **Step 3:** web `clientScore.jsx` — the same card (set/accept/progress/outcome); `?v=` bump on ClientApp.html + ClientScore.html.
- [ ] **Step 4: Verify** — mobile build + `public/m`; parse-check web jsx; `tsc`.
- [ ] **Step 5: Commit** — `git commit -am "feat(commitments): client commitment card (mobile + web)"`

### Task E5: Coach "Set a commitment" affordance

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (`window.ShapeCoachCommit = { propose }` → `set_commitment` with the client id).
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` (`BSProClientFullProfilePage` Manage tab — a "Set a commitment" affordance below Recent penalties).

- [ ] **Step 1:** `ShapeCoachCommit.propose(clientUid, targets, stake)` → `rpc('set_commitment', { p_user: clientUid, p_targets, p_stake })` (server makes it `proposed`). Surface a small sheet on the Manage tab (target chips + stake slider) gated on a real linked client.
- [ ] **Step 2: Verify** — mobile build + `public/m`.
- [ ] **Step 3: Commit** — `git commit -am "feat(commitments): coach can propose a client commitment"`

### Task E6: WORKLOG + War Room + adversarial review

- [ ] Adversarial review (workflow) of the commitments migration + cron settlement (farming, false settle, consent bypass, balance floor, idempotency) before pushing; apply confirmed fixes.
- [ ] Dated WORKLOG entry (both features + the two migration links). No new API route to register (commitments use RPCs + the existing cron). Commit + push branch+main.

---

## Self-Review

**Spec coverage:** §2 escalation → D1–D3. §3.1 targets → E1 + E2 actuals. §3.2 consent → E2 (`set_commitment` status + `accept_commitment`). §3.3 table → E2. §3.4 RPCs → E2. §3.5 cron → E3. §3.6 UI → E4 (client) + E5 (coach). §4 source_kinds/migrations → E2 + D2. All covered.

**Placeholder scan:** the two SQL migrations (D2 full body inlined; E2 describes each function's inputs/checks/amounts/grants precisely — the full E2 SQL is written in the file at execution, the one place a task says "written in the file", with every constraint specified). Everything else inlines code.

**Type consistency:** `momentumBonus(streakWeeks)` (D1) ↔ `least(100,25+15*streak)` (D2) ↔ route (D3) identical. `commitmentMet(targets,actuals)` (E1) ↔ the SQL actuals in `settle_commitment` (E2) identical shape. `set_commitment(p_user,p_targets,p_stake)` / `accept_commitment(p_id)` / `settle_commitment(p_user,p_week)` consistent E2↔E3↔E4↔E5. `commitment_win`/`commitment_loss` consistent.
