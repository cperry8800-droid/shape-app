# e1RM + Strength Progression Engine (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn logged sets into an estimated 1-rep max (Epley) per lift plus a Progressing/Holding/Stalled/Building verdict, surfaced on a dedicated mobile Strength page, on the client's real PR rows, and on the coach's lift view (mobile + web).

**Architecture:** A pure, unit-tested `e1rm.mjs` module is the single source of truth, mirrored by a TS twin (`src/lib/e1rm.ts`) used by a new RLS-scoped `GET /api/client/strength` route and the existing `/api/client/progress` PR computation, and by a SQL mirror added to the `get_client_lifts` coach RPC. New mobile UI (`BSStrengthCard` + `BSStrengthHistory`) models the existing steps instruments.

**Tech Stack:** Node ESM pure modules + `node --test`; Next.js 16 App Router route handlers (TS); Supabase Postgres (plpgsql RPC); React (babel-standalone broadsheet JSX for mobile, newdesign JSX for web).

## Global Constraints

- **Branch:** all work on `feat/e1rm-progression` (already created off `c2d4c67c` = `origin/main`). Keep the branch after merge — do NOT delete. Phase 2 (prescriptive next-load) is a separate later branch — out of scope.
- **Stale-base rule:** before ANY edit run `git fetch origin main && git rev-parse --short HEAD origin/main`; if the branch base drifted from `origin/main`, rebase/reset before editing.
- **Mobile build is PowerShell-only** (Git Bash mangles `VITE_BASE=/m/`): `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` then from repo root `Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m`; confirm `/m/assets/` appears in `public/m/index.html`.
- **CRLF trap:** after editing any `.ts`/`.mjs`/`.js` file, run `tr -cd '\r' < <file> | wc -c`; if non-zero, strip (`tr -d '\r' < f > f.tmp && mv f.tmp f`). Repo is LF, no `.gitattributes`.
- **Parse-check JSX before building:** `node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`.
- **Migrations:** the owner runs them. Do NOT paste SQL bodies in chat — reply with only the `raw.githubusercontent.com/cperry8800-droid/shape-app/<branch>/supabase-migrations/2026-06-25-client-lifts-e1rm.sql` link. All migrations idempotent; code no-ops/degrades until applied.
- **No new colored emoji** in any UI copy — monochrome/typographic only. Do not retroactively change existing emoji/colors.
- **`?v=` cache-bust:** bump the `?v=` query on any edited referenced newdesign `.jsx`.
- **Tests:** repo-root `tests/*.test.mjs`, run via `npm test` (root `package.json` lists each file explicitly — new test files MUST be appended to that script). Mobile pure modules are imported from tests via `../mobile-app/src/services/<file>.mjs`.
- **Pre-commit hook** rebuilds mobile in Git Bash for staged JSX/TS — commit those with `MSYS_NO_PATHCONV=1 git commit …`. Docs/SQL-only commits skip the hook.
- **Review stack before the eventual PR merge:** `/code-review` + CodeRabbit GitHub App (authoritative); required CI checks **Web (typecheck+build) · Mobile (build + public/m sync) · Secret scan (gitleaks)** must be green; iterate on `staging` first.
- **Security review is mandatory for this feature** (it adds an authenticated data route + changes a `SECURITY DEFINER` RPC). See the Security section below; the review is enforced in Task 10.

---

## Security review & considerations

This feature adds a new authenticated data-read route and widens a `SECURITY DEFINER` Postgres function, so it carries real authorization surface. The controls below are **requirements**, not suggestions — Task 10 verifies each, and the diff goes through an explicit security review before merge.

**Threat surface & required controls:**

1. **`GET /api/client/strength` — IDOR / data exposure.** Must read ONLY the caller's rows. Controls (defense in depth): auth via `clientForRequest`/`currentUser` (Bearer **or** cookie — no anon path; returns 401 when unauthenticated), an explicit `.eq('client_id', user.id)` filter, **and** RLS on `workout_set_logs` scoping rows to the caller. There is no `:id`/query param selecting another user — the route derives the user from the session only. **Never** add a client-supplied user id to this route.
2. **Membership gating.** `/api/client/*` is gated by the Edge proxy (`src/lib/supabase/middleware.ts` → 402 `membership_required` for non-members), so `/api/client/strength` inherits the paywall automatically by prefix. Task 10 confirms the prefix actually covers it (no allowlist bypass).
3. **`get_client_lifts` widening — privilege boundary.** It's `SECURITY DEFINER`. The change must: keep `set search_path = public` (prevents search-path hijack), keep the `is_coach_on_client(p_user_id)` gate as the FIRST statement (returns null for non-coaches), and expose **no new data class** — e1RM is a pure arithmetic derivation of `actual_load`/`actual_reps`, columns the function already reads. No raw rows, file paths, or PII are added to the output.
4. **No secrets / no injection.** No new env vars, keys, or credentials (gitleaks must stay green). No string-built SQL (the migration uses parameterized plpgsql; the route uses the Supabase query builder, not raw SQL). No user-supplied input is interpolated anywhere.
5. **No new XSS surface.** All rendered values are numbers/enums/lift names already stored and shown elsewhere; output is React/JSX-escaped (the codebase uses no `dangerouslySetInnerHTML`). Lift names render as text, never as markup/URLs.
6. **Fail-closed vs fail-soft.** The route fails **soft** to an empty list (never 500s the page) — acceptable because an empty result leaks nothing; auth failure still returns 401 (fail-closed on identity).

**Security review process (who/what):**
- **Automated:** Secret scan (gitleaks) — required CI check. CodeRabbit GitHub App (assertive profile) reviews every PR including security findings — authoritative. If the Aikido MCP/plugin is available, run `aikido:scan` (or the `/security-review` skill) on the diff.
- **Manual gate:** run the **`/security-review`** skill on the branch diff before merge and resolve every finding (or justify in the PR). Confirm the four DB security advisors stay clean after the migration is applied (Supabase → Advisors: 0 new ERRORs; a gated `SECURITY DEFINER` function is expected/by-design).

---

### Task 1: Pure `e1rm.mjs` module + tests

**Files:**
- Create: `mobile-app/src/services/e1rm.mjs`
- Create: `tests/e1rm.test.mjs`
- Modify: `package.json` (root) — append `tests/e1rm.test.mjs` to the `test` script

**Interfaces:**
- Produces:
  - `epleyE1rm(load: number, reps: number) → number | null`
  - `buildLiftSeries(rows) → [{ key, name, series: [{date,e1rm,load,reps,rpe}] }]`
  - `progressionStatus(series, { now? }) → { status, deltaPct, recentBest, priorBest, lastImprovedAt }`
  - `summarizeLift(lift, { now? }) → { key, name, currentE1rm, bestE1rm, status, deltaPct, lastImprovedAt, topSet, series }`
  - constants `E1RM_MAX_REPS=12`, `PROGRESS_DEADBAND=0.02`, `STALL_WEEKS=3`, `RECENT_WINDOW_DAYS=14`
  - Input row shape (from the route): `{ key|move_name|moveName, name, date:'YYYY-MM-DD', load, reps, rpe, completed }`
  - `status ∈ 'progressing' | 'holding' | 'stalled' | 'building'`

- [ ] **Step 1: Write the failing test**

Create `tests/e1rm.test.mjs`:

```js
// Estimated 1-rep max (Epley) + a strength progression verdict folded over a
// per-lift series of best-set e1RMs. The /api/client/strength route, the TS
// twin (src/lib/e1rm.ts), and the get_client_lifts SQL all mirror this. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  epleyE1rm, buildLiftSeries, progressionStatus, summarizeLift,
  E1RM_MAX_REPS, PROGRESS_DEADBAND, STALL_WEEKS,
} from '../mobile-app/src/services/e1rm.mjs';

const DAY = 86400000;
const iso = (now, daysAgo) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10);

test('epley: a true single returns the load itself (no inflation)', () => {
  assert.equal(epleyE1rm(100, 1), 100);
});

test('epley: 100 × 5 ≈ 116.67', () => {
  assert.ok(Math.abs(epleyE1rm(100, 5) - 116.6667) < 0.01);
});

test('epley: reps above the cap or non-positive load → null', () => {
  assert.equal(epleyE1rm(100, E1RM_MAX_REPS + 1), null);
  assert.equal(epleyE1rm(0, 5), null);
  assert.equal(epleyE1rm(100, 0), null);
  assert.equal(epleyE1rm('x', 5), null);
});

test('buildLiftSeries: groups by lift+day, keeps the best e1RM per day, sorts', () => {
  const rows = [
    { move_name: 'Back Squat', date: '2026-05-01', load: 100, reps: 5 },   // e1rm 116.7
    { move_name: 'back squat', date: '2026-05-01', load: 110, reps: 3 },   // e1rm 121 (same day, higher)
    { move_name: 'Back Squat', date: '2026-04-20', load: 90, reps: 5 },    // e1rm 105
    { move_name: 'Bench', date: '2026-05-01', load: 60, reps: 8 },
  ];
  const lifts = buildLiftSeries(rows);
  const squat = lifts.find((l) => l.key === 'back squat');
  assert.equal(squat.name, 'Back Squat');                // most-recent casing
  assert.equal(squat.series.length, 2);                  // two distinct days
  assert.equal(squat.series[0].date, '2026-04-20');      // sorted ascending
  assert.equal(squat.series[1].e1rm, 121);               // best of the two same-day sets
});

test('buildLiftSeries: skips incomplete sets and out-of-range reps', () => {
  const rows = [
    { move_name: 'Deadlift', date: '2026-05-01', load: 200, reps: 5, completed: false },
    { move_name: 'Deadlift', date: '2026-05-02', load: 200, reps: 20 },
  ];
  assert.equal(buildLiftSeries(rows).length, 0);
});

test('progressionStatus: building when fewer than two points', () => {
  const r = progressionStatus([{ date: '2026-05-01', e1rm: 120 }], { now: Date.parse('2026-05-02') });
  assert.equal(r.status, 'building');
});

test('progressionStatus: progressing when recent beats prior by > deadband', () => {
  const now = Date.parse('2026-05-30');
  const series = [{ date: iso(now, 30), e1rm: 100 }, { date: iso(now, 3), e1rm: 110 }];
  const r = progressionStatus(series, { now });
  assert.equal(r.status, 'progressing');
  assert.ok(r.deltaPct > PROGRESS_DEADBAND);
});

test('progressionStatus: holding within the deadband', () => {
  const now = Date.parse('2026-05-30');
  const series = [{ date: iso(now, 30), e1rm: 100 }, { date: iso(now, 3), e1rm: 101 }];
  assert.equal(progressionStatus(series, { now }).status, 'holding');
});

test('progressionStatus: stalled when no new high for >= STALL_WEEKS', () => {
  const now = Date.parse('2026-05-30');
  // all-time high set 30 days ago (> 3 weeks), nothing higher since
  const series = [{ date: iso(now, 30), e1rm: 100 }, { date: iso(now, 2), e1rm: 99 }];
  const r = progressionStatus(series, { now });
  assert.equal(r.status, 'stalled');
});

test('summarizeLift: surfaces current, best and top set', () => {
  const lift = { key: 'bench', name: 'Bench', series: [
    { date: '2026-05-01', e1rm: 100, load: 90, reps: 4, rpe: 8 },
    { date: '2026-05-10', e1rm: 110, load: 100, reps: 4, rpe: 9 },
    { date: '2026-05-20', e1rm: 108, load: 98, reps: 4, rpe: 8 },
  ] };
  const s = summarizeLift(lift, { now: Date.parse('2026-05-21') });
  assert.equal(s.currentE1rm, 108);
  assert.equal(s.bestE1rm, 110);
  assert.equal(s.topSet.load, 100);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- 2>&1 | grep -i e1rm` (or temporarily `node --test tests/e1rm.test.mjs`)
Expected: FAIL — `Cannot find module '../mobile-app/src/services/e1rm.mjs'`.

- [ ] **Step 3: Write the module**

Create `mobile-app/src/services/e1rm.mjs`:

```js
// Estimated 1-rep max (Epley) + a strength progression verdict, folded over a
// per-lift series of best-set e1RMs. The /api/client/strength route, the TS
// twin src/lib/e1rm.ts, and the get_client_lifts SQL ALL mirror this — keep
// them in sync. Pure (no deps, no I/O) so it's the tested source of truth.
// Run: node --test

export const E1RM_MAX_REPS = 12;        // Epley is unreliable beyond ~12 reps
export const PROGRESS_DEADBAND = 0.02;  // within ±2% of prior best = "holding"
export const STALL_WEEKS = 3;           // no new all-time high for ≥3 wks → "stalled"
export const RECENT_WINDOW_DAYS = 14;

const DAY_MS = 86400000;
const round1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);
const dayMs = (d) => new Date(String(d) + 'T00:00:00Z').getTime();

export function epleyE1rm(load, reps) {
  const w = Number(load);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r) || r < 1 || r > E1RM_MAX_REPS) return null;
  if (r <= 1) return w;                  // a true single — no estimate inflation
  return w * (1 + r / 30);
}

// rows: [{ key|move_name|moveName, name, date:'YYYY-MM-DD', load, reps, rpe, completed }]
// → [{ key, name, series:[{date,e1rm,load,reps,rpe}] }]  (best qualifying set per day)
export function buildLiftSeries(rows) {
  const byLift = new Map();
  for (const r of rows || []) {
    if (!r || r.completed === false) continue;
    const e1 = epleyE1rm(r.load, r.reps);
    if (e1 == null) continue;
    const key = String(r.key ?? r.move_name ?? r.moveName ?? '').trim().toLowerCase();
    const day = String(r.date ?? '').slice(0, 10);
    if (!key || !day) continue;
    let lift = byLift.get(key);
    if (!lift) { lift = { key, name: '', nameAt: '', days: new Map() }; byLift.set(key, lift); }
    const disp = String(r.name ?? r.move_name ?? r.moveName ?? '').trim();
    if (disp && day >= lift.nameAt) { lift.name = disp; lift.nameAt = day; }
    const pt = {
      date: day,
      e1rm: round1(e1),
      load: Number(r.load),
      reps: Number(r.reps),
      rpe: Number.isFinite(Number(r.rpe)) ? Number(r.rpe) : null,
    };
    const cur = lift.days.get(day);
    if (!cur || pt.e1rm > cur.e1rm) lift.days.set(day, pt);
  }
  return [...byLift.values()].map((l) => ({
    key: l.key,
    name: l.name || l.key,
    series: [...l.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

export function progressionStatus(series, opts = {}) {
  const pts = (series || []).filter((p) => p && Number.isFinite(p.e1rm));
  const now = opts.now != null ? Number(opts.now) : Date.now();
  if (pts.length < 2) {
    return {
      status: 'building',
      deltaPct: null,
      recentBest: pts.length ? pts[pts.length - 1].e1rm : null,
      priorBest: null,
      lastImprovedAt: pts.length ? pts[pts.length - 1].date : null,
    };
  }
  const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
  let runMax = -Infinity, lastImprovedAt = sorted[0].date;
  for (const p of sorted) { if (p.e1rm > runMax) { runMax = p.e1rm; lastImprovedAt = p.date; } }
  const recentCut = now - RECENT_WINDOW_DAYS * DAY_MS;
  const recent = sorted.filter((p) => dayMs(p.date) >= recentCut);
  const prior = sorted.filter((p) => dayMs(p.date) < recentCut);
  const maxOf = (arr) => (arr.length ? Math.max(...arr.map((p) => p.e1rm)) : null);
  const recentBest = maxOf(recent);
  const priorBest = maxOf(prior);
  const stale = (now - dayMs(lastImprovedAt)) / (7 * DAY_MS) >= STALL_WEEKS;

  if (priorBest == null) {
    const first = recent[0].e1rm, last = recent[recent.length - 1].e1rm;
    const dp = (last - first) / first;
    return { status: dp > PROGRESS_DEADBAND ? 'progressing' : 'holding', deltaPct: dp, recentBest, priorBest: first, lastImprovedAt };
  }
  if (recentBest == null) {
    return { status: stale ? 'stalled' : 'holding', deltaPct: null, recentBest: null, priorBest, lastImprovedAt };
  }
  const deltaPct = (recentBest - priorBest) / priorBest;
  let status;
  if (deltaPct > PROGRESS_DEADBAND) status = 'progressing';
  else if (deltaPct < -PROGRESS_DEADBAND || stale) status = 'stalled';
  else status = 'holding';
  return { status, deltaPct, recentBest, priorBest, lastImprovedAt };
}

export function summarizeLift(lift, opts = {}) {
  const series = (lift && lift.series) || [];
  const st = progressionStatus(series, opts);
  const bestPt = series.reduce((b, p) => (!b || p.e1rm > b.e1rm ? p : b), null);
  const current = series.length ? series[series.length - 1] : null;
  return {
    key: lift.key,
    name: lift.name,
    currentE1rm: current ? current.e1rm : null,
    bestE1rm: bestPt ? bestPt.e1rm : null,
    status: st.status,
    deltaPct: st.deltaPct,
    lastImprovedAt: st.lastImprovedAt,
    topSet: bestPt ? { load: bestPt.load, reps: bestPt.reps, rpe: bestPt.rpe, e1rm: bestPt.e1rm } : null,
    series,
  };
}
```

- [ ] **Step 4: Register the test file**

In root `package.json`, append ` tests/e1rm.test.mjs` to the end of the `"test"` script string (after `tests/funnel.test.mjs`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all e1rm tests green, existing suite unaffected (count increases by the new tests).

- [ ] **Step 6: CRLF check + commit**

```bash
for f in mobile-app/src/services/e1rm.mjs tests/e1rm.test.mjs; do echo "$f $(tr -cd '\r' < "$f" | wc -c)"; done
git add mobile-app/src/services/e1rm.mjs tests/e1rm.test.mjs package.json
git commit -m "feat: e1rm pure module (Epley + progression verdict) + tests"
```

---

### Task 2: TypeScript twin `src/lib/e1rm.ts`

**Files:**
- Create: `src/lib/e1rm.ts`

**Interfaces:**
- Consumes: the `e1rm.mjs` algorithm (kept in sync; same constants + functions).
- Produces (for Tasks 3 & 4): `epleyE1rm`, `buildLiftSeries`, `summarizeLift`, and types `LiftRow`, `LiftSummary`.

- [ ] **Step 1: Write the twin**

Create `src/lib/e1rm.ts` (identical logic to `mobile-app/src/services/e1rm.mjs`, typed):

```ts
// TS twin of mobile-app/src/services/e1rm.mjs — KEEP IN SYNC. Used by the
// /api/client/strength route and the /api/client/progress PR e1RM. The .mjs is
// the unit-tested source of truth (tests/e1rm.test.mjs).

export const E1RM_MAX_REPS = 12;
export const PROGRESS_DEADBAND = 0.02;
export const STALL_WEEKS = 3;
export const RECENT_WINDOW_DAYS = 14;

const DAY_MS = 86400000;
const round1 = (n: number | null) => (n == null ? null : Math.round(Number(n) * 10) / 10);
const dayMs = (d: string) => new Date(String(d) + 'T00:00:00Z').getTime();

export type LiftRow = {
  key?: string; move_name?: string; moveName?: string; name?: string;
  date: string; load: unknown; reps: unknown; rpe?: unknown; completed?: boolean;
};
export type SeriesPoint = { date: string; e1rm: number; load: number; reps: number; rpe: number | null };
export type Lift = { key: string; name: string; series: SeriesPoint[] };
export type Status = 'progressing' | 'holding' | 'stalled' | 'building';
export type LiftSummary = {
  key: string; name: string; currentE1rm: number | null; bestE1rm: number | null;
  status: Status; deltaPct: number | null; lastImprovedAt: string | null;
  topSet: { load: number; reps: number; rpe: number | null; e1rm: number } | null;
  series: SeriesPoint[];
};

export function epleyE1rm(load: unknown, reps: unknown): number | null {
  const w = Number(load);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r) || r < 1 || r > E1RM_MAX_REPS) return null;
  if (r <= 1) return w;
  return w * (1 + r / 30);
}

export function buildLiftSeries(rows: LiftRow[]): Lift[] {
  const byLift = new Map<string, { key: string; name: string; nameAt: string; days: Map<string, SeriesPoint> }>();
  for (const r of rows || []) {
    if (!r || r.completed === false) continue;
    const e1 = epleyE1rm(r.load, r.reps);
    if (e1 == null) continue;
    const key = String(r.key ?? r.move_name ?? r.moveName ?? '').trim().toLowerCase();
    const day = String(r.date ?? '').slice(0, 10);
    if (!key || !day) continue;
    let lift = byLift.get(key);
    if (!lift) { lift = { key, name: '', nameAt: '', days: new Map() }; byLift.set(key, lift); }
    const disp = String(r.name ?? r.move_name ?? r.moveName ?? '').trim();
    if (disp && day >= lift.nameAt) { lift.name = disp; lift.nameAt = day; }
    const pt: SeriesPoint = {
      date: day, e1rm: round1(e1) as number, load: Number(r.load), reps: Number(r.reps),
      rpe: Number.isFinite(Number(r.rpe)) ? Number(r.rpe) : null,
    };
    const cur = lift.days.get(day);
    if (!cur || pt.e1rm > cur.e1rm) lift.days.set(day, pt);
  }
  return [...byLift.values()].map((l) => ({
    key: l.key, name: l.name || l.key,
    series: [...l.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

export function progressionStatus(series: SeriesPoint[], opts: { now?: number } = {}) {
  const pts = (series || []).filter((p) => p && Number.isFinite(p.e1rm));
  const now = opts.now != null ? Number(opts.now) : Date.now();
  if (pts.length < 2) {
    return { status: 'building' as Status, deltaPct: null as number | null, recentBest: pts.length ? pts[pts.length - 1].e1rm : null, priorBest: null as number | null, lastImprovedAt: pts.length ? pts[pts.length - 1].date : null };
  }
  const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
  let runMax = -Infinity, lastImprovedAt = sorted[0].date;
  for (const p of sorted) { if (p.e1rm > runMax) { runMax = p.e1rm; lastImprovedAt = p.date; } }
  const recentCut = now - RECENT_WINDOW_DAYS * DAY_MS;
  const recent = sorted.filter((p) => dayMs(p.date) >= recentCut);
  const prior = sorted.filter((p) => dayMs(p.date) < recentCut);
  const maxOf = (arr: SeriesPoint[]) => (arr.length ? Math.max(...arr.map((p) => p.e1rm)) : null);
  const recentBest = maxOf(recent);
  const priorBest = maxOf(prior);
  const stale = (now - dayMs(lastImprovedAt)) / (7 * DAY_MS) >= STALL_WEEKS;
  if (priorBest == null) {
    const first = recent[0].e1rm, last = recent[recent.length - 1].e1rm;
    const dp = (last - first) / first;
    return { status: (dp > PROGRESS_DEADBAND ? 'progressing' : 'holding') as Status, deltaPct: dp, recentBest, priorBest: first, lastImprovedAt };
  }
  if (recentBest == null) {
    return { status: (stale ? 'stalled' : 'holding') as Status, deltaPct: null as number | null, recentBest: null as number | null, priorBest, lastImprovedAt };
  }
  const deltaPct = (recentBest - priorBest) / priorBest;
  let status: Status;
  if (deltaPct > PROGRESS_DEADBAND) status = 'progressing';
  else if (deltaPct < -PROGRESS_DEADBAND || stale) status = 'stalled';
  else status = 'holding';
  return { status, deltaPct, recentBest, priorBest, lastImprovedAt };
}

export function summarizeLift(lift: Lift, opts: { now?: number } = {}): LiftSummary {
  const series = (lift && lift.series) || [];
  const st = progressionStatus(series, opts);
  const bestPt = series.reduce<SeriesPoint | null>((b, p) => (!b || p.e1rm > b.e1rm ? p : b), null);
  const current = series.length ? series[series.length - 1] : null;
  return {
    key: lift.key, name: lift.name,
    currentE1rm: current ? current.e1rm : null,
    bestE1rm: bestPt ? bestPt.e1rm : null,
    status: st.status, deltaPct: st.deltaPct, lastImprovedAt: st.lastImprovedAt,
    topSet: bestPt ? { load: bestPt.load, reps: bestPt.reps, rpe: bestPt.rpe, e1rm: bestPt.e1rm } : null,
    series,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: CRLF check + commit**

```bash
echo "src/lib/e1rm.ts $(tr -cd '\r' < src/lib/e1rm.ts | wc -c)"
git add src/lib/e1rm.ts
git commit -m "feat: TS twin of the e1rm module"
```

---

### Task 3: `GET /api/client/strength` route

**Files:**
- Create: `src/app/api/client/strength/route.ts`

**Interfaces:**
- Consumes: `buildLiftSeries`, `summarizeLift` from `@/lib/e1rm`; `clientForRequest`, `currentUser` from `@/lib/request-auth`.
- Produces: `GET /api/client/strength` → `{ ok: true, lifts: LiftSummary[] & {unit}, generatedAt }` (top 12 by frequency then recency). 401 when unauthenticated; fails soft to `{ ok:true, lifts:[] }` on error.

- [ ] **Step 1: Write the route**

Create `src/app/api/client/strength/route.ts`:

```ts
// Live data for the mobile Strength / e1RM progression page. Read-only over
// workout_set_logs (actual_load/actual_reps/rpe/load_unit are real numeric
// columns added by 2026-05-08-coach-program-tools.sql). RLS scopes every row to
// the signed-in user; a new account comes back empty. Bearer (native) or cookie
// (/m/ web) via request-auth, mirroring /api/client/progress.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { buildLiftSeries, summarizeLift } from '@/lib/e1rm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await clientForRequest(request);
    const user = await currentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const since = new Date(Date.now() - 180 * 86400000).toISOString();
    const { data: setRows } = await supabase
      .from('workout_set_logs')
      .select('move_name, actual_load, actual_reps, rpe, load_unit, completed, created_at')
      .eq('client_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000);

    const rows = (setRows ?? []).map((r) => ({
      key: String((r as Record<string, unknown>).move_name ?? '').trim().toLowerCase(),
      name: String((r as Record<string, unknown>).move_name ?? '').trim(),
      date: String((r as Record<string, unknown>).created_at ?? '').slice(0, 10),
      load: Number((r as Record<string, unknown>).actual_load),
      reps: Number((r as Record<string, unknown>).actual_reps),
      rpe: (r as Record<string, unknown>).rpe == null ? null : Number((r as Record<string, unknown>).rpe),
      completed: (r as Record<string, unknown>).completed as boolean | undefined,
    }));

    // load_unit per lift — most recent wins (rows are ascending by date).
    const unitByLift = new Map<string, string>();
    for (const r of setRows ?? []) {
      const k = String((r as Record<string, unknown>).move_name ?? '').trim().toLowerCase();
      if (k) unitByLift.set(k, String((r as Record<string, unknown>).load_unit || 'lb'));
    }

    const now = Date.now();
    const lifts = buildLiftSeries(rows)
      .map((l) => ({ ...summarizeLift(l, { now }), unit: unitByLift.get(l.key) || 'lb' }))
      .filter((l) => l.series.length > 0)
      .sort((a, b) =>
        (b.series.length - a.series.length) ||
        b.series[b.series.length - 1].date.localeCompare(a.series[a.series.length - 1].date))
      .slice(0, 12);

    return NextResponse.json({ ok: true, lifts, generatedAt: new Date(now).toISOString() });
  } catch {
    // Fail soft — never 500 the page; the client shows the honest empty state.
    return NextResponse.json({ ok: true, lifts: [], generatedAt: new Date().toISOString() });
  }
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS; the new route compiles and appears in the route manifest.

- [ ] **Step 3: CRLF check + commit**

```bash
echo "route $(tr -cd '\r' < src/app/api/client/strength/route.ts | wc -c)"
git add src/app/api/client/strength/route.ts
git commit -m "feat: GET /api/client/strength route (per-lift e1RM + progression)"
```

---

### Task 4: Thread e1RM onto `/api/client/progress` PR rows

**Files:**
- Modify: `src/app/api/client/progress/route.ts:108-148` (the PR block + the `PR` type)

**Interfaces:**
- Consumes: `epleyE1rm` from `@/lib/e1rm`.
- Produces: each PR object in the route's `prs` array gains `e1rm: number | null`.

- [ ] **Step 1: Add the import**

At the top of `src/app/api/client/progress/route.ts`, after the existing `request-auth` import (line 7), add:

```ts
import { epleyE1rm } from '@/lib/e1rm';
```

- [ ] **Step 2: Add `e1rm` to the PR type and the emitted PRs**

Change the `PR` type (currently lines 116-122) to add `e1rm`:

```ts
  type PR = {
    move: string;
    best: number;
    bestReps: number | null;
    unit: string;
    bestAt: string;
    e1rm: number | null;
  };
```

Then change the `prs` materialization (currently lines 146-148) to compute e1RM from the PR's best set:

```ts
  const prs = [...prMap.values()]
    .sort((a, b) => b.best - a.best)
    .slice(0, 6)
    .map((p) => {
      const e = epleyE1rm(p.best, p.bestReps);
      return { ...p, e1rm: e == null ? null : Math.round(e * 10) / 10 };
    });
```

(The two `prMap.set(...)` / update sites that construct a `PR` do not set `e1rm`; TypeScript requires the field. Add `e1rm: null` to the object literal at the `prMap.set(key, { ... })` site, lines 132-138, so the type is satisfied before the final `.map` fills it in.)

```ts
      prMap.set(key, {
        move: key,
        best: load,
        bestReps: r.actual_reps ?? null,
        unit: r.load_unit || 'lb',
        bestAt: r.created_at,
        e1rm: null,
      });
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: CRLF check + commit**

```bash
echo "progress $(tr -cd '\r' < src/app/api/client/progress/route.ts | wc -c)"
git add src/app/api/client/progress/route.ts
git commit -m "feat: include estimated 1RM on /api/client/progress PR rows"
```

---

### Task 5: Migration — widen `get_client_lifts` with e1RM

**Files:**
- Create: `supabase-migrations/2026-06-25-client-lifts-e1rm.sql`

**Interfaces:**
- Produces: `get_client_lifts(uuid)` `keyLifts[]` entries each gain an `e1rm` number (or null). Existing `best`/`delta`/`prs`/`avgRpe`/`workoutsLogged42d` behavior unchanged. Consumed by Task 8 (mobile pros + web coach).

- [ ] **Step 1: Write the migration**

Create `supabase-migrations/2026-06-25-client-lifts-e1rm.sql` (CREATE OR REPLACE — adds e1RM from the real `actual_load`/`actual_reps` columns, capped at 12 reps, mirroring `epleyE1rm`; leaves the existing free-text `best`/`delta` math untouched):

```sql
-- Widen get_client_lifts to add an estimated 1-rep max (Epley) per key lift.
-- e1RM uses the real captured columns (actual_load / actual_reps), capped at 12
-- reps and special-cased at 1 rep, mirroring mobile-app/src/services/e1rm.mjs.
-- The existing best/delta/prs/avgRpe/workoutsLogged42d logic is unchanged.
-- Gated on is_coach_on_client(uuid). Idempotent (create or replace).

create or replace function public.get_client_lifts(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_combined jsonb;
  v_rpe numeric;
  v_sessions int;
begin
  if not public.is_coach_on_client(p_user_id) then
    return null;
  end if;

  select count(*) into v_sessions
  from public.workout_sessions
  where client_id = p_user_id
    and status in ('completed', 'reviewed')
    and coalesce(ended_at, created_at) >= now() - interval '42 days';

  select round(avg(rpe)::numeric, 1) into v_rpe
  from (
    select (regexp_match(coalesce(sl.payload->>'rpe', ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric as rpe
    from public.workout_set_logs sl
    where sl.client_id = p_user_id
      and sl.created_at >= now() - interval '30 days'
  ) q
  where rpe is not null;

  with sets as (
    select sl.move_name,
           sl.created_at,
           (regexp_match(coalesce(sl.payload->>'load', sl.target_load, ''), '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric as load,
           case
             when sl.actual_load is null or sl.actual_load <= 0 then null
             when sl.actual_reps is null or sl.actual_reps < 1 or sl.actual_reps > 12 then null
             when sl.actual_reps <= 1 then round(sl.actual_load::numeric, 1)
             else round((sl.actual_load * (1 + sl.actual_reps::numeric / 30))::numeric, 1)
           end as e1rm
    from public.workout_set_logs sl
    where sl.client_id = p_user_id
      and sl.created_at >= now() - interval '90 days'
  ),
  per_move as (
    select move_name,
           max(load) as best,
           max(e1rm) as best_e1rm,
           max(load) filter (where created_at >= now() - interval '30 days') as best_recent,
           max(load) filter (where created_at <  now() - interval '30 days') as best_prior,
           count(*) as n
    from sets
    where load is not null
    group by move_name
  )
  select jsonb_build_object(
    'keyLifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', move_name,
        'best', best,
        'e1rm', best_e1rm,
        'delta', case when best_prior is not null and best_recent is not null
                      then round((best_recent - best_prior)::numeric, 1) else null end
      ) order by n desc, best desc nulls last)
      from (select * from per_move order by n desc, best desc nulls last limit 5) tp
    ), '[]'::jsonb),
    'prs', (
      select count(*) from per_move
      where best_recent is not null and best_prior is not null and best_recent > best_prior
    )
  ) into v_combined;

  return v_combined || jsonb_build_object('avgRpe', v_rpe, 'workoutsLogged42d', v_sessions);
end;
$$;

grant execute on function public.get_client_lifts(uuid) to authenticated;
```

- [ ] **Step 2: Verify the SQL is well-formed**

Read the file end-to-end; confirm it differs from `2026-06-13-client-lifts.sql` only by the `e1rm` expression in `sets`, the `max(e1rm) as best_e1rm` in `per_move`, and the `'e1rm', best_e1rm` key in the output. (It cannot be executed in this environment — the owner applies it.)

- [ ] **Step 3: Commit**

```bash
git add supabase-migrations/2026-06-25-client-lifts-e1rm.sql
git commit -m "feat: get_client_lifts returns estimated 1RM per key lift"
```

> After merge, send the owner ONLY the raw link:
> `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-25-client-lifts-e1rm.sql`

---

### Task 6: `window.ShapeStrength` client helper

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (near `window.ShapeProgress`, ~line 4256-4260)

**Interfaces:**
- Consumes: existing `cachedClientJson` (60s shared cache; already cleared by `invalidateClientMetrics()` on workout save — no new invalidation needed).
- Produces: `window.ShapeStrength = { get }` where `get()` → the `/api/client/strength` payload or `null`.

- [ ] **Step 1: Add the helper + window export**

Immediately after the `getClientNutrition` definition and the `window.ShapeProgress = {...}` line (~line 4260), add:

```javascript
async function getClientStrength() { return cachedClientJson('/api/client/strength').then((d) => (d && d.ok ? d : null)); }
window.ShapeStrength = { get: getClientStrength };
```

- [ ] **Step 2: Parse-check**

Run: `node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/services/shapeBackend.js','utf8'),{sourceType:'module',plugins:['jsx']})"`
Expected: no output (parse OK).

- [ ] **Step 3: CRLF check + commit**

```bash
echo "backend $(tr -cd '\r' < mobile-app/src/services/shapeBackend.js | wc -c)"
git add mobile-app/src/services/shapeBackend.js
MSYS_NO_PATHCONV=1 git commit -m "feat: window.ShapeStrength client helper"
```

---

### Task 7: Mobile Strength page + card + Overall-PR e1RM subline

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — add `BS_STRENGTH_STATUS`, `useBSStrength`, `BSStrengthCard`, `BSStrengthHistory`; place the card + overlay in `BSClientProgress`; add the e1RM subline to the Overall PR rows (line 20147-20152).

**Interfaces:**
- Consumes: `window.ShapeStrength.get()`; existing in-file helpers `useBS`, `useStateBSC`, `BSMeCorner`, `BSPlate`, `bsTHexA`, `bsMyTierColor`, the `AreaChart` idiom (10142). Mirrors the structure of `BSStepsHistory` (14555-14862) and `BSStepsCard` (14864-14918).
- Produces: a dedicated Strength overlay opened from the Training tab and from a tapped Overall PR row.

- [ ] **Step 1: Add the status map + data hook**

Place near the other module-scope helpers (e.g. just above `function BSStepsHistory` at line 14555). `BS_STRENGTH_STATUS` returns label + accent for a status; `useBSStrength` fetches once on mount:

```javascript
function bsStrengthStatusMeta(status, t, tier) {
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  switch (status) {
    case 'progressing': return { label: 'Progressing', color: tier || teal };
    case 'stalled': return { label: 'Stalled', color: t.AMBER || '#c0533b' };
    case 'holding': return { label: 'Holding', color: t.INK50 };
    default: return { label: 'Building', color: t.INK50 };
  }
}

function useBSStrength() {
  const [data, setData] = useStateBSC(null);
  React.useEffect(() => {
    let on = true;
    if (typeof window !== 'undefined' && window.ShapeStrength?.get) {
      window.ShapeStrength.get().then((d) => { if (on && d) setData(d); }).catch(() => {});
    }
    return () => { on = false; };
  }, []);
  return data;
}
```

- [ ] **Step 2: Add `BSStrengthHistory` (the dedicated page)**

Model the shell on `BSStepsHistory` (14555-14862) — same full-screen overlay container, the `BSMeCorner` nav row + back button, and `prefers-reduced-motion` restraint. Swap the body for per-lift e1RM cards. Add this component immediately after `BSStepsHistory`:

```javascript
function BSStrengthHistory({ onClose, focusKey = null }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const tier = (typeof bsMyTierColor === 'function' && bsMyTierColor()) || teal;
  const data = useBSStrength();
  const lifts = (data && Array.isArray(data.lifts)) ? data.lifts : [];
  const ordered = focusKey ? [...lifts].sort((a, b) => (a.key === focusKey ? -1 : b.key === focusKey ? 1 : 0)) : lifts;

  return (
    <div style={{ position: 'absolute', inset: 0, background: t.PAPER, zIndex: 60, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px' }}>
        <button onClick={onClose} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: t.INK }}>← BACK</button>
        <BSMeCorner />
      </div>
      <div style={{ padding: '0 18px 90px' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, marginBottom: 6 }}>STRENGTH · ESTIMATED 1RM</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', marginBottom: 16 }}>Your <span style={{ fontStyle: 'italic', color: teal }}>strength.</span></div>
        {ordered.length === 0 && (
          <div style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK50, lineHeight: 1.5, padding: '24px 0' }}>
            Log a few sessions with weight and reps to see your estimated max climb. Strength is computed from your logged sets — nothing to show yet.
          </div>
        )}
        {ordered.map((l) => {
          const sm = bsStrengthStatusMeta(l.status, t, tier);
          const vals = (l.series || []).map((p) => p.e1rm);
          const top = l.topSet;
          return (
            <div key={l.key} style={{ borderRadius: 6, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${bsTHexA(sm.color, 0.6)}`, background: bsTHexA(t.INK, 0.03), padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontFamily: t.BODY, fontSize: 15, fontWeight: 700, color: t.INK }}>{l.name}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: sm.color, border: `1px solid ${bsTHexA(sm.color, 0.4)}`, borderRadius: 3, padding: '3px 8px', background: bsTHexA(sm.color, 0.12) }}>{sm.label}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{l.currentE1rm != null ? Math.round(l.currentE1rm) : '—'}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>{l.unit} e1RM</span>
                {l.deltaPct != null && (
                  <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, color: sm.color, marginLeft: 'auto' }}>{l.deltaPct >= 0 ? '+' : '−'}{Math.abs(l.deltaPct * 100).toFixed(1)}%</span>
                )}
              </div>
              {vals.length >= 2 && <BSStrengthSpark vals={vals} color={sm.color} />}
              {top && (
                <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 8, letterSpacing: '0.04em' }}>
                  top set {top.load}×{top.reps}{top.rpe != null ? ` @ RPE ${top.rpe}` : ''} · best {Math.round(l.bestE1rm)} {l.unit}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Minimal area sparkline for the e1RM series (self-contained — the file's
// AreaChart at ~line 10142 is scoped to a component, so use this local copy).
function BSStrengthSpark({ vals, color }) {
  const t = useBS();
  if (!Array.isArray(vals) || vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), rng = (hi - lo) || 1;
  const W = 100, top = 6, bot = 94, span = bot - top;
  const yOf = (v) => bot - ((v - lo) / rng) * span;
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * W).toFixed(2)} ${yOf(v).toFixed(2)}`).join(' ');
  const gid = `e1rm-${String(color).replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 64, display: 'block' }} aria-hidden>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
      <path d={`${line} L100 100 L0 100 Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 3: Add `BSStrengthCard` (Training-tab entry)**

Add after `BSStrengthHistory`. Presentational card that calls `onOpen` (the overlay is owned by `BSClientProgress`):

```javascript
function BSStrengthCard({ onOpen }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const tier = (typeof bsMyTierColor === 'function' && bsMyTierColor()) || teal;
  const data = useBSStrength();
  const lifts = (data && Array.isArray(data.lifts)) ? data.lifts : [];
  const lead = lifts[0] || null;
  const sm = lead ? bsStrengthStatusMeta(lead.status, t, tier) : null;
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 6, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${bsTHexA(tier, 0.6)}`, background: bsTHexA(t.INK, 0.03), padding: 14, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: tier }}>STRENGTH · ESTIMATED 1RM</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, color: t.INK50 }}>View strength →</div>
      </div>
      {lead ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
          <span style={{ fontFamily: t.BODY, fontSize: 14, fontWeight: 700, color: t.INK }}>{lead.name}</span>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 20, color: t.INK, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{lead.currentE1rm != null ? Math.round(lead.currentE1rm) : '—'}<span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50 }}> {lead.unit}</span></span>
          {sm && <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, color: sm.color }}>{sm.label}</span>}
        </div>
      ) : (
        <div style={{ fontFamily: t.BODY, fontSize: 12.5, color: t.INK50, marginTop: 8 }}>Log sets with weight & reps to track your estimated max.</div>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Wire the overlay + card + PR subline into `BSClientProgress`**

(a) Add overlay state near the other `useStateBSC` hooks in `BSClientProgress` (after line 20074):

```javascript
  const [strengthOpen, setStrengthOpen] = useStateBSC(null); // null | { key } when open
```

(b) Render the overlay — add just before the component's final `return`/root close (top-level within the returned tree, e.g. wrap the existing return so the overlay sits above it). Insert where the page renders its content:

```javascript
  {strengthOpen && <BSStrengthHistory focusKey={strengthOpen.key || null} onClose={() => setStrengthOpen(null)} />}
```

(c) Add the entry card to the top of `trainingView` (immediately inside its root `<div>`, before the `kpiGrid([...])` at line 20213):

```javascript
      <BSStrengthCard onOpen={() => setStrengthOpen({})} />
```

(d) Add the e1RM subline + tap-to-open on the **Overall** PR rows. Replace the PR row block at lines 20147-20153 with:

```javascript
        {(O.prs || []).map((p, i) => (
          <div key={i} onClick={() => setStrengthOpen({})} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', padding: '11px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0, cursor: 'pointer' }}>
            <div>
              <div style={{ fontFamily: t.BODY, fontSize: 13.5, fontWeight: 600, color: t.INK }}>{p.move}</div>
              {p.e1rm != null && <div style={{ fontFamily: t.MONO, fontSize: 9, color: teal, marginTop: 2 }}>≈ {Math.round(p.e1rm)} {p.unit} e1RM</div>}
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 18, color: t.INK, letterSpacing: '-0.01em' }}>{Math.round(p.best)} {p.unit}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 11, color: teal }}>{p.bestReps != null ? '× ' + p.bestReps : ''}</div>
          </div>
        ))}
```

- [ ] **Step 5: Parse-check + mobile build + resync (PowerShell)**

Parse-check (Git Bash):
```bash
node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Then in **PowerShell**:
```powershell
cd mobile-app; $env:VITE_BASE='/m/'; npm run build
cd ..; Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m
```
Confirm `/m/assets/` appears in `public/m/index.html`.

- [ ] **Step 6: CRLF check + commit**

```bash
echo "client $(tr -cd '\r' < mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx | wc -c)"
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
MSYS_NO_PATHCONV=1 git commit -m "feat: mobile Strength page + e1RM on Overall PR rows"
```

---

### Task 8: Coach surfaces — e1RM on key-lift rows (mobile pros + web)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:2713-2724` (the `liftRows` setup in `BSProClientFullProfilePage`)
- Modify: `public/newdesign/coachClientDetail.jsx:126-135` (the `liftRows` setup)
- Modify: `public/newdesign/TrainerClient.html` + `public/newdesign/NutritionistClient.html` (`coachClientDetail.jsx?v=` bump)

**Interfaces:**
- Consumes: the `e1rm` field now on each `get_client_lifts` `keyLifts[]` entry (Task 5). Degrades to no e1RM text until the migration is applied (the `e1 != null` guard).

- [ ] **Step 1: Mobile pros — append e1RM to the lift value string**

In `iosAppBroadsheetPros.jsx`, in the `liftRows` map (lines 2718-2723), add an `e1` read and fold it into `v` (no `trackRow` change needed):

```javascript
    return L.keyLifts.map(x => {
      const b = lnum(x.best), dl = lnum(x.delta), e1 = lnum(x.e1rm);
      const v = b != null ? (e1 != null ? `${b} kg · ${Math.round(e1)} e1RM` : `${b} kg`) : '—';
      return { n: x.name || 'Lift', v, d: dl != null ? `${dl >= 0 ? '+' : ''}${dl}` : '—', p: b != null && mx ? Math.max(0.2, b / mx) : 0.5 };
    });
```

- [ ] **Step 2: Web coach — same, plus enrich the demo fallback**

In `public/newdesign/coachClientDetail.jsx`, the `liftRows` map (lines 129-131):

```javascript
    return L.keyLifts.map(x => { const b = ckNum(x.best), dl = ckNum(x.delta), e1 = ckNum(x.e1rm); const v = b != null ? (e1 != null ? `${b} kg · ${Math.round(e1)} e1RM` : `${b} kg`) : "—"; return { n: x.name || "Lift", v, d: dl != null ? `${dl >= 0 ? "+" : ""}${dl}` : "—", p: b != null && mx ? Math.max(0.2, b / mx) : 0.5 }; });
```

Leave the demo fallback array as-is (illustrative for signed-out preview).

- [ ] **Step 3: Bump the cache-bust version**

In `public/newdesign/TrainerClient.html` and `public/newdesign/NutritionistClient.html`, change every `coachClientDetail.jsx?v=20260622a` to `coachClientDetail.jsx?v=20260625a`.

- [ ] **Step 4: Parse-check both JSX files + mobile build + resync**

```bash
node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('public/newdesign/coachClientDetail.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Then rebuild + resync `public/m` in PowerShell (pros change is in the mobile bundle):
```powershell
cd mobile-app; $env:VITE_BASE='/m/'; npm run build
cd ..; Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m
```

- [ ] **Step 5: Commit**

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx public/newdesign/coachClientDetail.jsx public/newdesign/TrainerClient.html public/newdesign/NutritionistClient.html public/m
MSYS_NO_PATHCONV=1 git commit -m "feat: estimated 1RM on coach key-lift rows (mobile + web)"
```

---

### Task 9: War Room registration

**Files:**
- Modify: `src/lib/warroom.ts` (add the route to `RAW_ROUTES`; add a checklist item)

**Interfaces:**
- Produces: `/api/client/strength` listed in the War Room route board; a "Strength / e1RM progression" checklist entry; the migration tracked owner-manual.

- [ ] **Step 1: Register the route**

In `src/lib/warroom.ts`, find the `RAW_ROUTES` array (grep `RAW_ROUTES`) and add, alongside the other `/api/client/*` entries:

```ts
  '/api/client/strength',
```

- [ ] **Step 2: Add a checklist item**

Find the checklist section that holds training/wearables/steps items (grep for `Daily steps` or `steps`) and add a sibling item in the same shape the file uses, e.g.:

```ts
  { label: 'Strength / e1RM progression (#2): estimated 1RM + Progressing/Holding/Stalled engine, dedicated Strength page, PR-row e1RM, coach lift e1RM', status: 'done' },
```

and a migration tracker entry in the same shape used for other migrations:

```ts
  { label: 'Migration: 2026-06-25-client-lifts-e1rm.sql (widens get_client_lifts with e1rm)', status: 'manual' },
```

(Match the exact object keys/enum values the surrounding entries use — read the neighbors first.)

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
echo "warroom $(tr -cd '\r' < src/lib/warroom.ts | wc -c)"
git add src/lib/warroom.ts
git commit -m "chore: register /api/client/strength + e1RM in the War Room"
```

---

### Task 10: Full verification + staging

**Files:** none (verification only)

- [ ] **Step 1: Run the full test + typecheck + build**

```bash
npm test            # all suites incl. the new e1rm vectors
npx tsc --noEmit
npm run build       # Next web build
```
Expected: tests all green; tsc clean; web build succeeds.

- [ ] **Step 2: Confirm `public/m` is in sync**

In PowerShell, rebuild mobile and diff against the committed bundle:
```powershell
cd mobile-app; $env:VITE_BASE='/m/'; npm run build
cd ..; Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m
git status --porcelain public/m
```
If `git status` shows changes, commit them (`MSYS_NO_PATHCONV=1 git commit -m "chore: resync public/m"`). The CI **Mobile (build + public/m sync)** check fails on a stale bundle.

- [ ] **Step 3: Push a staging preview**

```bash
git push origin feat/e1rm-progression:staging --force
```
Open `https://shape-app-git-staging-cperry8800-droids-projects.vercel.app/m/` (use a browser User-Agent if curling, or Vercel's bot-checkpoint returns 403). Sign in to a test account, log a couple of strength sets, and confirm: the Strength card on Progress→Training, the dedicated page (status pills + sparkline + top set), and the e1RM subline on the Overall PR rows. (Coach e1RM only appears after the owner applies the migration.)

- [ ] **Step 4: Open the PR + run the review stack**

Push the branch, open a PR to `main`, run `/code-review` on the diff, let the CodeRabbit GitHub App review, address findings, and wait for the three required checks green before squash-merge. Send the owner the migration raw link. Keep the branch after merge.

---

## Self-Review (completed by the plan author)

**Spec coverage** — every spec section maps to a task:
- Engine math + status semantics → Task 1 (module) + Task 2 (twin). RPE secondary note intentionally **dropped from Phase 1** (spec marked it droppable) to keep scope tight.
- `/api/client/strength` → Task 3. PR-row e1RM → Task 4 (corrected to the **Overall** tab, which renders the real `/api/client/progress` PRs; the Training tab's PR section is demo/empty data and is left alone — entry card goes there instead).
- Coach `get_client_lifts` e1RM → Task 5 (migration) + Task 8 (surfaces).
- `window.ShapeStrength` + cache → Task 6 (invalidation already covered by the existing `invalidateClientMetrics()` on save — noted, no new code).
- Dedicated mobile page + card → Task 7. Coach mobile + web → Task 8.
- War Room → Task 9. Verification → Task 10.

**Units** — resolved better than the spec assumed: `load_unit` is a real column, so the route returns a real per-lift unit (no ambiguity).

**Type consistency** — `summarizeLift` output (`currentE1rm`, `bestE1rm`, `status`, `deltaPct`, `lastImprovedAt`, `topSet`, `series`) is consumed unchanged by Task 7's UI and the route's `lifts[]`; the `e1rm` field name is used identically in the progress route (Task 4), the SQL `keyLifts[].e1rm` (Task 5), and both coach readers (Task 8: `x.e1rm`).

**No placeholders** — every code step contains complete, runnable code; the only descriptive steps are War Room data-entry (Task 9), which intentionally defers to the file's existing object shape (read-neighbors-first), and the UI shell mirroring of the proven `BSStepsHistory` (Task 7), with the strength-specific JSX given in full.
