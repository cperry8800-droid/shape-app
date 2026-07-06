# "The Record" — detailed Shape Score history + report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dedicated full-screen "Record" page (mobile + website) that shows a member's cumulative Shape Score over a selectable time window (1W default · 1M · 3M · All), a by-source breakdown with penalties, and the complete day-grouped filterable ledger history.

**Architecture:** One pure aggregation algorithm, two twins — `mobile-app/src/services/scoreHistory.mjs` (unit-tested source of truth; mobile demo path) and `src/lib/scoreHistory.ts` (server twin) — feeding a new `GET /api/client/score-record` route. Mobile renders a `BSScoreRecordPage` overlay off the endpoint (demo via the `.mjs`); the website renders a "The Record" view in `score.jsx` off the endpoint (demo via a baked fixture). No migration — reads the existing `score_ledger`.

**Tech Stack:** ES-module `.mjs` (Vite) + TS twin (Next 16 App Router), `node --test`, React (babel-standalone for the website, Vite JSX for mobile), Supabase (`createClient` server helper, RLS-scoped `score_ledger`).

**Spec:** `docs/superpowers/specs/2026-07-06-score-record-history-report-design.md` (owner-approved, merged #1559).

## Global Constraints

- **Rank basis, redemptions excluded everywhere.** Mirror `deriveScore` (`mobile-app/src/services/scoreDerive.mjs`): every row with `source_kind === 'store_redeem'` is excluded from the series, by-category, penalties, history, `earned`/`lost`/`net`, and `lifetime` — so the report reconciles with the Standing. Penalties = negative, non-redeem deltas.
- **Honest data.** Signed-in views never render fabricated numbers; the demo Record is a labelled preview only. Empty ledger → an empty-but-valid report (no `NaN`, no fake rows).
- **Twin parity.** `scoreHistory.ts` is byte-for-byte the same algorithm as `scoreHistory.mjs`. The `.mjs` is the tested source of truth.
- **Theme tokens only** on mobile (`const t = useBS()`; `t.INK/PAPER/RULE/HAIR/MONO/DISPLAY/BODY/INK70`, `bsTHexA`, heat = tier color via the page's existing `heat`). `BS_SD_ZONES`-style bars for by-source; rust (`rustCol`) for penalties. No hardcoded ink/paper.
- **Motion:** entrances once per first view; `bsSdReduced()` → finished state; at most one breathing loop.
- **Range keys** are exactly `'1w' | '1m' | '3m' | 'all'`; labels `1W / 1M / 3M / All`; default `1w`.
- **Windows (UTC):** 1w = 7 days, 1m = 30 days, 3m = 90 days, all = everything. Series bucketing: 1w/1m by **day**, 3m/all by **week** (Monday-00:00 UTC).
- **Per-commit gate:** JSX parse-check changed `.jsx`; `npx tsc --noEmit` for changed `.ts`; `npm test`; LF-normalize any edited tracked file (`sed -i 's/\r$//'`); confirm the mobile bundle compiles (`cd mobile-app && VITE_BASE=/m/ npm run build`). `public/m` is deploy-built (#1470) — do **not** hand-commit a bundle.

---

### Task 1: Pure aggregation module + tests (`scoreHistory.mjs`)

**Files:**
- Create: `mobile-app/src/services/scoreHistory.mjs`
- Create: `tests/score-record.test.mjs`
- Modify: `package.json` (append the test file to the `test` script)

**Interfaces:**
- Produces: `bsScoreRecord(rows, opts)` → `{ ranges, history, lifetime }`, `RANGE_KEYS`, `RECORD_CATEGORY_LABELS`, `recordFilterBucket(category, delta, sourceKind)`.
  - `rows`: `[{ category, source_kind, delta, note, earned_at }]`.
  - `opts.now`: `Date | number | undefined` (defaults `Date.now()`; tests pass a fixed value).
  - `ranges[key]` = `{ series:[{date, cumulative, dayDelta}], byCategory:[{key,label,earned}], earned, lost, net, penalties:[{note,total}] }`.
  - `history` = `[{ date, subtotal, rows:[{note,category,label,delta,earned_at,bucket,isPenalty}] }]`, newest day first, newest row within a day first.
  - `lifetime` = Σ non-redeem delta (the rank total).

- [ ] **Step 1: Write the failing test**

Create `tests/score-record.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsScoreRecord, recordFilterBucket, RANGE_KEYS } from '../mobile-app/src/services/scoreHistory.mjs';

// Fixed "now": 2026-07-06T12:00:00Z
const NOW = Date.UTC(2026, 6, 6, 12, 0, 0);
const day = (y, m, d) => new Date(Date.UTC(y, m, d, 9, 0, 0)).toISOString();

const ROWS = [
  { category: 'workouts', source_kind: 'workout_session', delta: 10, note: 'Workout logged', earned_at: day(2026, 6, 6) }, // today
  { category: 'nutrition', source_kind: 'meal_log', delta: 10, note: 'Meal logged', earned_at: day(2026, 6, 5) },          // yesterday
  { category: 'habits', source_kind: 'habit', delta: 3, note: 'Habit', earned_at: day(2026, 6, 2) },                        // this week
  { category: 'adherence', source_kind: 'checkin', delta: -7, note: 'Missed check-in', earned_at: day(2026, 5, 20) },       // ~2wk ago (penalty)
  { category: 'other', source_kind: 'store_redeem', delta: -450, note: 'Redeemed tee', earned_at: day(2026, 6, 4) },        // EXCLUDED
  { category: 'prs', source_kind: 'pr_wall', delta: 12, note: 'Back squat PR', earned_at: day(2026, 3, 10) },               // ~3mo ago
];

test('redemptions excluded from lifetime + every range (rank basis)', () => {
  const r = bsScoreRecord(ROWS, { now: NOW });
  // 10+10+3-7+12 = 28 ; the -450 redeem is excluded
  assert.equal(r.lifetime, 28);
  for (const k of RANGE_KEYS) {
    const flat = r.ranges[k].byCategory.map((c) => c.key);
    assert.ok(!flat.includes('other'), `${k} must not surface the redeem row`);
  }
});

test('1w window: earned/lost/net + cumulative is the true running rank', () => {
  const w = bsScoreRecord(ROWS, { now: NOW }).ranges['1w'];
  // in the last 7 days: +10 +10 +3 = 23 earned, 0 lost
  assert.equal(w.earned, 23);
  assert.equal(w.lost, 0);
  assert.equal(w.net, 23);
  // cumulative ends at the lifetime rank (28), monotonic non-decreasing here
  assert.equal(w.series[w.series.length - 1].cumulative, 28);
  for (let i = 1; i < w.series.length; i++) {
    assert.ok(w.series[i].cumulative >= w.series[i - 1].cumulative);
  }
});

test('all window: penalties bucketed to lost + a penalty reason', () => {
  const a = bsScoreRecord(ROWS, { now: NOW }).ranges['all'];
  assert.equal(a.lost, 7);
  assert.equal(a.penalties[0].note, 'Missed check-in');
  assert.equal(a.penalties[0].total, -7);
});

test('history: grouped by day, newest first, subtotals sum the day', () => {
  const h = bsScoreRecord(ROWS, { now: NOW }).history;
  assert.equal(h[0].date, '2026-07-06');       // newest day first
  assert.equal(h[0].subtotal, 10);
  // 5 non-redeem rows across 5 distinct days
  assert.equal(h.length, 5);
  assert.equal(h.reduce((s, d) => s + d.rows.length, 0), 5);
});

test('filter buckets map categories + penalties', () => {
  assert.equal(recordFilterBucket('workouts', 10, 'workout_session'), 'workouts');
  assert.equal(recordFilterBucket('adherence', 15, 'checkin'), 'checkins');
  assert.equal(recordFilterBucket('adherence', -7, 'checkin'), 'penalty');
  assert.equal(recordFilterBucket('prs', 12, 'pr_wall'), 'prs');
  assert.equal(recordFilterBucket('community', 5, 'community_post'), 'other');
});

test('empty ledger → valid empty report, no NaN', () => {
  const r = bsScoreRecord([], { now: NOW });
  assert.equal(r.lifetime, 0);
  assert.equal(r.history.length, 0);
  assert.equal(r.ranges['1w'].earned, 0);
  assert.equal(r.ranges['1w'].net, 0);
  assert.deepEqual(r.ranges['1w'].series, []);
  assert.ok(Number.isFinite(r.ranges['all'].net));
});

test('single-entry ledger', () => {
  const one = [{ category: 'workouts', source_kind: 'workout_session', delta: 10, note: 'W', earned_at: day(2026, 6, 6) }];
  const r = bsScoreRecord(one, { now: NOW });
  assert.equal(r.lifetime, 10);
  assert.equal(r.history.length, 1);
  assert.equal(r.ranges['1w'].series.length, 1);
  assert.equal(r.ranges['1w'].series[0].cumulative, 10);
});

test('3m buckets weekly + spans a month boundary without collapsing days', () => {
  const rows = [
    { category: 'workouts', source_kind: 'w', delta: 10, note: 'a', earned_at: day(2026, 4, 28) }, // May 28
    { category: 'workouts', source_kind: 'w', delta: 10, note: 'b', earned_at: day(2026, 5, 2) },  // Jun 2 (different ISO week)
  ];
  const r = bsScoreRecord(rows, { now: NOW }).ranges['3m'];
  assert.equal(r.series.length, 2);          // two weekly buckets, not merged
  assert.equal(r.series[1].cumulative, 20);
  // history keeps them on their own calendar days
  const h = bsScoreRecord(rows, { now: NOW }).history;
  assert.equal(h.length, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/score-record.test.mjs`
Expected: FAIL — `Cannot find module '.../scoreHistory.mjs'`.

- [ ] **Step 3: Write the module**

Create `mobile-app/src/services/scoreHistory.mjs`:

```js
// Pure aggregation for "The Record" — the Shape Score history + report. ONE
// algorithm, mirrored in src/lib/scoreHistory.ts (the server twin the
// /api/client/score-record route runs); keep them in sync. Unit-tested in
// tests/score-record.test.mjs.
//
// RANK BASIS: store redemptions are EXCLUDED everywhere (series, byCategory,
// penalties, history, lifetime, earned/lost/net) — the same exclusion as
// scoreDerive.deriveScore, so the report total agrees with the Standing.
// Penalties = negative, non-redeem deltas.

const DAY_MS = 86400000;

export const RANGE_KEYS = ['1w', '1m', '3m', 'all'];
const RANGE_DAYS = { '1w': 7, '1m': 30, '3m': 90, all: null };
const RANGE_BUCKET = { '1w': 'day', '1m': 'day', '3m': 'week', all: 'week' };

// category → display label for the by-source bars.
export const RECORD_CATEGORY_LABELS = {
  workouts: 'Workouts',
  nutrition: 'Nutrition',
  adherence: 'Check-ins',
  habits: 'Habits',
  prs: 'PRs',
  community: 'Community',
  endorsements: 'Endorsements',
  radio: 'Radio',
  referrals: 'Referrals',
  other: 'Other',
};

// history filter buckets (the tight chip set) — maps a row to a filter key.
export function recordFilterBucket(category, delta, sourceKind) {
  if (Number(delta) < 0 && sourceKind !== 'store_redeem') return 'penalty';
  switch (String(category || '')) {
    case 'workouts': return 'workouts';
    case 'habits': return 'habits';
    case 'nutrition': return 'nutrition';
    case 'adherence': return 'checkins';
    case 'prs': return 'prs';
    default: return 'other';
  }
}

function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
function dayStartMs(ms) { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }
function weekStartMs(ms) {
  const d = new Date(ms); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  return d.getTime();
}

export function bsScoreRecord(rows, opts = {}) {
  const nowMs = opts.now instanceof Date ? opts.now.getTime()
    : (typeof opts.now === 'number' ? opts.now : Date.now());

  // rank-basis rows only, oldest → newest (correct running total).
  const clean = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.source_kind !== 'store_redeem')
    .map((r) => ({
      category: String(r.category || 'other'),
      source_kind: r.source_kind || null,
      delta: Number(r.delta) || 0,
      note: r.note || null,
      earned_at: r.earned_at,
      ms: new Date(r.earned_at).getTime(),
    }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);

  const lifetime = clean.reduce((s, r) => s + r.delta, 0);

  const ranges = {};
  for (const key of RANGE_KEYS) {
    const days = RANGE_DAYS[key];
    const cutoff = days == null ? -Infinity : nowMs - days * DAY_MS;
    const inWin = clean.filter((r) => r.ms >= cutoff);

    // cumulative absolute rank — starts from the rank at the window's open.
    let running = clean.filter((r) => r.ms < cutoff).reduce((s, r) => s + r.delta, 0);

    const bucketOf = RANGE_BUCKET[key] === 'week' ? weekStartMs : dayStartMs;
    const byBucket = new Map();
    for (const r of inWin) byBucket.set(bucketOf(r.ms), (byBucket.get(bucketOf(r.ms)) || 0) + r.delta);
    const series = [];
    for (const b of [...byBucket.keys()].sort((a, z) => a - z)) {
      running += byBucket.get(b);
      series.push({ date: isoDay(b), cumulative: running, dayDelta: byBucket.get(b) });
    }

    const cat = new Map(); const pen = new Map();
    let earned = 0, lost = 0;
    for (const r of inWin) {
      if (r.delta >= 0) { earned += r.delta; cat.set(r.category, (cat.get(r.category) || 0) + r.delta); }
      else { lost += -r.delta; const k = r.note || RECORD_CATEGORY_LABELS[r.category] || 'Penalty'; pen.set(k, (pen.get(k) || 0) + r.delta); }
    }
    const byCategory = [...cat.entries()]
      .map(([k, earnedPts]) => ({ key: k, label: RECORD_CATEGORY_LABELS[k] || k, earned: earnedPts }))
      .sort((a, b) => b.earned - a.earned);
    const penalties = [...pen.entries()]
      .map(([note, total]) => ({ note, total }))
      .sort((a, b) => a.total - b.total); // most-negative first

    ranges[key] = { series, byCategory, earned, lost, net: earned - lost, penalties };
  }

  // history — every (non-redeem) row grouped by day, newest first.
  const dayMap = new Map();
  for (const r of clean) {
    const d = isoDay(r.ms);
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d).push({
      note: r.note || RECORD_CATEGORY_LABELS[r.category] || 'Points',
      category: r.category,
      label: RECORD_CATEGORY_LABELS[r.category] || r.category,
      delta: r.delta,
      earned_at: r.earned_at,
      bucket: recordFilterBucket(r.category, r.delta, r.source_kind),
      isPenalty: r.delta < 0,
    });
  }
  const history = [...dayMap.keys()].sort((a, b) => (a < b ? 1 : -1)).map((d) => {
    const dayRows = dayMap.get(d).slice().reverse();
    return { date: d, subtotal: dayRows.reduce((s, r) => s + r.delta, 0), rows: dayRows };
  });

  return { ranges, history, lifetime };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/score-record.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Register in the full suite + commit**

Append ` tests/score-record.test.mjs` to the end of the `"test"` script value in `package.json` (line 9, after `tests/pace-splits.test.mjs`).

Run: `npm test` — Expected: the full suite passes (prior total + 8).

```bash
sed -i 's/\r$//' mobile-app/src/services/scoreHistory.mjs tests/score-record.test.mjs
git add mobile-app/src/services/scoreHistory.mjs tests/score-record.test.mjs package.json
git commit -m "feat(score): scoreHistory.mjs — pure aggregation for The Record (+ tests)"
```

---

### Task 2: Server twin (`scoreHistory.ts`)

**Files:**
- Create: `src/lib/scoreHistory.ts`

**Interfaces:**
- Consumes: nothing (self-contained; mirrors Task 1).
- Produces: `bsScoreRecord(rows: LedgerRow[], opts?: { now?: Date | number }): ScoreRecord` — same shape as the `.mjs`. Exported types: `LedgerRow`, `ScoreRecord`, `RangeReport`, `HistoryDay`.

- [ ] **Step 1: Write the twin**

Create `src/lib/scoreHistory.ts` — the byte-parallel TS mirror of `scoreHistory.mjs` (same constants, same helpers, same algorithm), typed:

```ts
// TS twin of mobile-app/src/services/scoreHistory.mjs — KEEP IN SYNC. The .mjs
// is the unit-tested source of truth (tests/score-record.test.mjs). Used by the
// /api/client/score-record route over the caller's score_ledger. Rank basis:
// store redemptions are excluded everywhere so the report reconciles with the
// Standing; penalties = negative non-redeem deltas.

const DAY_MS = 86400000;

export const RANGE_KEYS = ['1w', '1m', '3m', 'all'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
const RANGE_DAYS: Record<RangeKey, number | null> = { '1w': 7, '1m': 30, '3m': 90, all: null };
const RANGE_BUCKET: Record<RangeKey, 'day' | 'week'> = { '1w': 'day', '1m': 'day', '3m': 'week', all: 'week' };

export const RECORD_CATEGORY_LABELS: Record<string, string> = {
  workouts: 'Workouts', nutrition: 'Nutrition', adherence: 'Check-ins', habits: 'Habits',
  prs: 'PRs', community: 'Community', endorsements: 'Endorsements', radio: 'Radio',
  referrals: 'Referrals', other: 'Other',
};

export function recordFilterBucket(category: string, delta: number, sourceKind: string | null): string {
  if (Number(delta) < 0 && sourceKind !== 'store_redeem') return 'penalty';
  switch (String(category || '')) {
    case 'workouts': return 'workouts';
    case 'habits': return 'habits';
    case 'nutrition': return 'nutrition';
    case 'adherence': return 'checkins';
    case 'prs': return 'prs';
    default: return 'other';
  }
}

export type LedgerRow = { category: string; source_kind: string | null; delta: number; note: string | null; earned_at: string };
export type SeriesPoint = { date: string; cumulative: number; dayDelta: number };
export type CategoryBar = { key: string; label: string; earned: number };
export type PenaltyRow = { note: string; total: number };
export type RangeReport = { series: SeriesPoint[]; byCategory: CategoryBar[]; earned: number; lost: number; net: number; penalties: PenaltyRow[] };
export type HistoryRow = { note: string; category: string; label: string; delta: number; earned_at: string; bucket: string; isPenalty: boolean };
export type HistoryDay = { date: string; subtotal: number; rows: HistoryRow[] };
export type ScoreRecord = { ranges: Record<RangeKey, RangeReport>; history: HistoryDay[]; lifetime: number };

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStartMs = (ms: number) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
const weekStartMs = (ms: number) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime(); };

export function bsScoreRecord(rows: LedgerRow[], opts: { now?: Date | number } = {}): ScoreRecord {
  const nowMs = opts.now instanceof Date ? opts.now.getTime() : (typeof opts.now === 'number' ? opts.now : Date.now());

  const clean = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.source_kind !== 'store_redeem')
    .map((r) => ({
      category: String(r.category || 'other'), source_kind: r.source_kind || null,
      delta: Number(r.delta) || 0, note: r.note || null, earned_at: r.earned_at,
      ms: new Date(r.earned_at).getTime(),
    }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);

  const lifetime = clean.reduce((s, r) => s + r.delta, 0);

  const ranges = {} as Record<RangeKey, RangeReport>;
  for (const key of RANGE_KEYS) {
    const days = RANGE_DAYS[key];
    const cutoff = days == null ? -Infinity : nowMs - days * DAY_MS;
    const inWin = clean.filter((r) => r.ms >= cutoff);
    let running = clean.filter((r) => r.ms < cutoff).reduce((s, r) => s + r.delta, 0);

    const bucketOf = RANGE_BUCKET[key] === 'week' ? weekStartMs : dayStartMs;
    const byBucket = new Map<number, number>();
    for (const r of inWin) byBucket.set(bucketOf(r.ms), (byBucket.get(bucketOf(r.ms)) || 0) + r.delta);
    const series: SeriesPoint[] = [];
    for (const b of [...byBucket.keys()].sort((a, z) => a - z)) {
      running += byBucket.get(b)!;
      series.push({ date: isoDay(b), cumulative: running, dayDelta: byBucket.get(b)! });
    }

    const cat = new Map<string, number>(); const pen = new Map<string, number>();
    let earned = 0, lost = 0;
    for (const r of inWin) {
      if (r.delta >= 0) { earned += r.delta; cat.set(r.category, (cat.get(r.category) || 0) + r.delta); }
      else { lost += -r.delta; const k = r.note || RECORD_CATEGORY_LABELS[r.category] || 'Penalty'; pen.set(k, (pen.get(k) || 0) + r.delta); }
    }
    const byCategory: CategoryBar[] = [...cat.entries()]
      .map(([k, e]) => ({ key: k, label: RECORD_CATEGORY_LABELS[k] || k, earned: e }))
      .sort((a, b) => b.earned - a.earned);
    const penalties: PenaltyRow[] = [...pen.entries()].map(([note, total]) => ({ note, total })).sort((a, b) => a.total - b.total);

    ranges[key] = { series, byCategory, earned, lost, net: earned - lost, penalties };
  }

  const dayMap = new Map<string, HistoryRow[]>();
  for (const r of clean) {
    const d = isoDay(r.ms);
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push({
      note: r.note || RECORD_CATEGORY_LABELS[r.category] || 'Points',
      category: r.category, label: RECORD_CATEGORY_LABELS[r.category] || r.category,
      delta: r.delta, earned_at: r.earned_at,
      bucket: recordFilterBucket(r.category, r.delta, r.source_kind), isPenalty: r.delta < 0,
    });
  }
  const history: HistoryDay[] = [...dayMap.keys()].sort((a, b) => (a < b ? 1 : -1)).map((d) => {
    const dayRows = dayMap.get(d)!.slice().reverse();
    return { date: d, subtotal: dayRows.reduce((s, r) => s + r.delta, 0), rows: dayRows };
  });

  return { ranges, history, lifetime };
}
```

- [ ] **Step 2: Verify it typechecks + commit**

Run: `npx tsc --noEmit`
Expected: no NEW errors from `scoreHistory.ts` (the 3 pre-existing baseline errors, if present, are unrelated — see `shape-app-local-build-gate`).

```bash
sed -i 's/\r$//' src/lib/scoreHistory.ts
git add src/lib/scoreHistory.ts
git commit -m "feat(score): scoreHistory.ts — server twin of the Record aggregation"
```

---

### Task 3: API route (`GET /api/client/score-record`)

**Files:**
- Create: `src/app/api/client/score-record/route.ts`

**Interfaces:**
- Consumes: `bsScoreRecord` + `ScoreRecord` from Task 2; `createClient` (`@/lib/supabase/server`); `dbError` (`@/lib/request-utils`).
- Produces: `GET` → `{ ranges, history, lifetime }` (the `ScoreRecord`), or `401` when unauthenticated. The `/api/client` prefix is already membership-gated in the proxy (see `src/lib/supabase/middleware.ts`).

- [ ] **Step 1: Write the route**

Create `src/app/api/client/score-record/route.ts` — mirrors the auth + fetch shape of `src/app/api/client/score/route.ts`:

```ts
// "The Record" — the caller's full Shape Score history + report. Reads the
// existing score_ledger (RLS-scoped) and runs the shared aggregation twin. Kept
// separate from /api/client/score so the Standing page stays lean (the Record
// opens on demand). No migration.

import { NextResponse } from 'next/server';
import { dbError } from '@/lib/request-utils';
import { createClient } from '@/lib/supabase/server';
import { bsScoreRecord, type LedgerRow } from '@/lib/scoreHistory';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // Full ledger, newest first, capped — the report groups + windows client-side
  // in the aggregation twin. 1000 rows is far beyond a real member's history.
  const { data: rows, error } = await supabase
    .from('score_ledger')
    .select('category, delta, note, earned_at, source_kind')
    .eq('user_id', user.id)
    .order('earned_at', { ascending: false })
    .limit(1000);

  if (error) return dbError(error, 'score record read', 500);

  const record = bsScoreRecord((rows || []) as LedgerRow[], { now: new Date() });
  return NextResponse.json(record);
}
```

- [ ] **Step 2: Verify + register + commit**

Run: `npx tsc --noEmit` — Expected: clean (no new errors).

Register the route in the War Room `RAW_ROUTES` list: add `'/api/client/score-record'` in `src/lib/warroom.ts` (find the existing `/api/client/score` entry and add the new one beside it, matching the surrounding format).

Run: `npx tsc --noEmit` again after the warroom edit — Expected: clean.

```bash
sed -i 's/\r$//' src/app/api/client/score-record/route.ts src/lib/warroom.ts
git add src/app/api/client/score-record/route.ts src/lib/warroom.ts
git commit -m "feat(score): GET /api/client/score-record — The Record endpoint"
```

---

### Task 4: Mobile `BSScoreRecordPage` + LEDGER-tab leader

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`
  - Import `bsScoreRecord`, `RANGE_KEYS` from `../services/scoreHistory.mjs` (top-of-file imports).
  - Add `BSScoreRecordPage` (new component near `BSShapeScorePage`, ~line 18560).
  - Add `showRecord` state + the `SEE THE FULL RECORD →` leader at the end of the LEDGER tab body (`scoreTab === 'ledger'`, ~line 18801) + mount the overlay.

**Interfaces:**
- Consumes: `bsScoreRecord`, `RANGE_KEYS` (Task 1); the page's existing `heat`, `rustCol`, `t`, `dotLead`, `bsTHexA`, `bsSdReduced`, `BSSdCountUp`, `BSSdBars`, `BSDetailHeader`/`BSMastRow`, `createPortal` target `#bs-phone-surface`, `_bsFormatScoreDate`.
- Produces: a full-screen overlay reached from the LEDGER tab.

- [ ] **Step 1: Add the import**

At the top of `iosAppBroadsheetClient.jsx`, beside the other `../services/*.mjs` imports, add:

```js
import { bsScoreRecord, RANGE_KEYS } from '../services/scoreHistory.mjs';
```

- [ ] **Step 2: Add a small demo-ledger fixture (module scope)**

Near `BS_STORE_PRODUCTS` (module scope, ~line 18812), add a demo ledger the signed-out Record computes over — so the mobile demo matches the website's baked fixture (Task 5 mirrors these rows):

```js
// Demo ledger for the signed-out Record preview (a labelled example, never shown
// to a signed-in member). Website bakes the SAME rows into a static fixture.
const BS_RECORD_DEMO_ROWS = [
  { category: 'workouts', source_kind: 'workout_session', delta: 10, note: 'Workout logged', earned_at: '2026-07-06T15:00:00Z' },
  { category: 'nutrition', source_kind: 'meal_log', delta: 10, note: 'Meal logged', earned_at: '2026-07-06T12:00:00Z' },
  { category: 'habits', source_kind: 'habit', delta: 3, note: 'Habit completed', earned_at: '2026-07-05T18:00:00Z' },
  { category: 'workouts', source_kind: 'workout_session', delta: 10, note: 'Workout logged', earned_at: '2026-07-04T15:00:00Z' },
  { category: 'adherence', source_kind: 'checkin', delta: 15, note: 'Weekly check-in', earned_at: '2026-07-01T09:00:00Z' },
  { category: 'prs', source_kind: 'pr_wall', delta: 12, note: 'Back squat PR', earned_at: '2026-06-28T17:00:00Z' },
  { category: 'adherence', source_kind: 'checkin', delta: -7, note: 'Missed check-in', earned_at: '2026-06-22T09:00:00Z' },
  { category: 'nutrition', source_kind: 'meal_log', delta: 10, note: 'Meal logged', earned_at: '2026-06-15T12:00:00Z' },
];
```

- [ ] **Step 3: Add the `BSScoreRecordPage` component**

Add near `BSShapeScorePage` (~line 18560). Full component:

```jsx
// "The Record" — full-screen Shape Score history + report. Live members fetch
// /api/client/score-record; signed-out shows a labelled demo computed from
// BS_RECORD_DEMO_ROWS via the same aggregation module.
function BSScoreRecordPage({ onBack }) {
  const t = useBS();
  const heat = bsTierColor((typeof window !== 'undefined' && window.ShapeScore && window.ShapeScore.tier) || 'Base');
  const rustCol = t.RUST || '#c0533b';
  const loggedIn = !!(typeof window !== 'undefined' && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user);
  const [record, setRecord] = useStateBSC(loggedIn ? null : bsScoreRecord(BS_RECORD_DEMO_ROWS, {}));
  const [range, setRange] = useStateBSC('1w');
  const [filter, setFilter] = useStateBSC('all');

  React.useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    fetch('/api/client/score-record', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && d.ranges) setRecord(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loggedIn]);

  const preview = !loggedIn;
  const rec = record || bsScoreRecord([], {});
  const win = rec.ranges[range] || rec.ranges['1w'];
  const filters = [['all', 'All'], ['workouts', 'Workouts'], ['habits', 'Habits'], ['nutrition', 'Nutrition'], ['checkins', 'Check-ins'], ['prs', 'PRs'], ['penalty', 'Penalties']];
  const days = filter === 'all'
    ? rec.history
    : rec.history.map((d) => ({ ...d, rows: d.rows.filter((r) => r.bucket === filter) })).filter((d) => d.rows.length);

  const eyebrow = { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.5) };
  const sect = { padding: `${t.sectGap}px ${t.padX}px 0` };

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, background: t.PAPER, zIndex: 60, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }} className="bs-hide-scroll">
      <BSMastRow onBack={onBack} title="The Record" />
      {preview && (
        <div style={{ margin: `0 ${t.padX}px 6px`, padding: '8px 10px', border: `1px solid ${bsTHexA(heat, 0.4)}`, borderRadius: 6, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: heat }}>
          Preview · demo record — an example of a live account · Sign in →
        </div>
      )}

      {/* 1 · Header register */}
      <div style={sect}>
        <div style={eyebrow}>Shape Score · The Record</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', lineHeight: 1 }}>
          <BSSdCountUp value={rec.lifetime} />
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 12 }}>
          {[['This week', rec.ranges['1w'].net], ['This month', rec.ranges['1m'].net], ['Earned', win.earned], ['Lost', -win.lost]].map(([label, val], i) => (
            <div key={label}>
              <div style={eyebrow}>{i >= 2 ? `${label} · ${range.toUpperCase()}` : label}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 15, fontWeight: 800, color: Number(val) < 0 ? rustCol : t.INK }}>{Number(val) >= 0 ? '+' : ''}{val}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${t.INK}, ${heat})` }} />
      </div>

      {/* 2 · Score over time + range toggle */}
      <div style={sect}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={eyebrow}>Score over time</div>
          <div style={{ display: 'flex', gap: 2, border: `1px solid ${t.HAIR}`, borderRadius: 7, padding: 2 }}>
            {RANGE_KEYS.map((k) => {
              const on = range === k;
              return (
                <button key={k} onClick={() => setRange(k)} aria-pressed={on} style={{ minWidth: 40, minHeight: 30, padding: '4px 8px', border: 0, borderRadius: 5, cursor: 'pointer', background: on ? heat : 'transparent', color: on ? t.PAPER : bsTHexA(t.INK, 0.55), fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{k}</button>
              );
            })}
          </div>
        </div>
        <BSRecordTrace series={win.series} heat={heat} t={t} />
      </div>

      {/* 3 · By source + penalties */}
      <div style={sect}>
        <div style={eyebrow}>By source · {range.toUpperCase()}</div>
        <BSSdBars items={win.byCategory.map((c) => ({ label: c.label, value: c.earned }))} accent={heat} still />
        {win.lost > 0 && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${t.HAIR}` }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: rustCol }}>− Penalties · {win.lost} lost</div>
            {win.penalties.slice(0, 3).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', marginTop: 6 }}>
                <span style={{ fontFamily: t.BODY, fontSize: 12, color: t.INK70 }}>{p.note}</span>
                <span aria-hidden style={dotLead} />
                <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 800, color: rustCol }}>{p.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4 · The full history */}
      <div style={{ ...sect, paddingBottom: 40 }}>
        <div style={eyebrow}>The full history</div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '8px 0 4px' }} className="bs-hide-scroll">
          {filters.map(([k, label]) => {
            const on = filter === k;
            return (
              <button key={k} onClick={() => setFilter(k)} aria-pressed={on} style={{ flex: 'none', minHeight: 30, padding: '5px 11px', border: `1px solid ${on ? heat : t.HAIR}`, borderRadius: 999, background: on ? bsTHexA(heat, 0.12) : 'transparent', color: on ? heat : bsTHexA(t.INK, 0.6), cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</button>
            );
          })}
        </div>
        {days.length === 0 ? (
          <div style={{ padding: '18px 0', fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>No entries in this filter yet.</div>
        ) : days.map((d) => (
          <div key={d.date} style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.5) }}>{_bsFormatScoreDate(d.date)}</span>
              <span aria-hidden style={dotLead} />
              <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 800, color: d.subtotal < 0 ? rustCol : heat }}>{d.subtotal >= 0 ? '+' : ''}{d.subtotal}</span>
            </div>
            {d.rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', padding: '9px 0', borderBottom: i === d.rows.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.note}</span>
                <span aria-hidden style={dotLead} />
                <span style={{ fontFamily: t.MONO, fontSize: 11.5, fontWeight: 800, color: r.isPenalty ? rustCol : heat }}>{r.delta >= 0 ? '+' : ''}{r.delta}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.getElementById('bs-phone-surface') || document.body,
  );
}

// Self-drawing cumulative line. preserveAspectRatio="none" + %-positioned end dot
// (the ladder-chart lesson) so the HTML overlay tracks the drawn geometry at any width.
function BSRecordTrace({ series, heat, t }) {
  if (!series || series.length < 2) {
    return <div style={{ padding: '18px 0', fontFamily: t.BODY, fontSize: 12, color: t.INK70 }}>Not enough history in this range yet.</div>;
  }
  const vals = series.map((p) => p.cumulative);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const n = series.length;
  const pts = series.map((p, i) => {
    const x = n === 1 ? 100 : (i / (n - 1)) * 100;
    const y = 100 - ((p.cumulative - min) / span) * 100;
    return [x, y];
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const end = pts[pts.length - 1];
  return (
    <div style={{ position: 'relative', marginTop: 8, height: 120 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d={d} fill="none" stroke={heat} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          style={bsSdReduced() ? null : { strokeDasharray: 200, strokeDashoffset: 200, animation: 'bsSdDrawLine 900ms ease forwards' }} />
      </svg>
      <span aria-hidden style={{ position: 'absolute', left: `${end[0]}%`, top: `${end[1]}%`, width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: '50%', background: heat, boxShadow: `0 0 0 3px ${bsTHexA(heat, 0.25)}` }} />
    </div>
  );
}
```

> Note: `BSSdBars`, `BSMastRow`, `BSSdCountUp`, `_bsFormatScoreDate`, `bsTierColor`, `bsTHexA`, `bsSdReduced`, `dotLead`, `useStateBSC`, `bsSdDrawLine`/`bsSdDrawX` keyframes all already exist in the file. If `BSMastRow` needs a different prop name than `title`/`onBack`, match its actual signature (grep `function BSMastRow`); the intent is the standard masthead + a ← BACK affordance. If `BSSdBars` doesn't accept `{label,value}[]`, adapt to its real item shape (grep `function BSSdBars`).

- [ ] **Step 4: Add the leader + overlay in `BSShapeScorePage`**

Add a `showRecord` state at the top of `BSShapeScorePage` (beside `const [scoreTab, setScoreTab] = useStateBSC('tiers');`, ~line 18582):

```js
const [showRecord, setShowRecord] = useStateBSC(false);
```

At the end of the `scoreTab === 'ledger'` block (right after the `ledger.map(...)`, ~line 18801, before the closing `</div>` of the tab body), add the leader:

```jsx
{scoreTab === 'ledger' && (
  <div onClick={() => setShowRecord(true)} role="button" tabIndex={0}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowRecord(true); } }}
    style={{ marginTop: 14, minHeight: 44, display: 'flex', alignItems: 'center', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: heat, cursor: 'pointer', borderBottom: `2px solid ${heat}`, width: 'fit-content' }}>
    See the full record →
  </div>
)}
```

Mount the overlay just before `<BSFooter right="Rewards" />` (~line 18804):

```jsx
{showRecord && <BSScoreRecordPage onBack={() => setShowRecord(false)} />}
```

- [ ] **Step 5: Verify + commit**

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})" && echo PARSE_OK
cd mobile-app && VITE_BASE=/m/ npm run build && cd ..
npm test
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(score): The Record page (mobile) + SEE THE FULL RECORD leader"
```
Expected: `PARSE_OK`, mobile build exits 0, full suite passes.

---

### Task 5: Website "The Record" view (`score.jsx`) + demo fixture

**Files:**
- Modify: `public/newdesign/score.jsx` (add `ScoreRecordView` + a `SEE THE FULL RECORD →` leader in `ScoreLedger`; wire an open/close state in `ScorePage`; add a baked `RECORD_DEMO` fixture).
- Modify: `public/newdesign/Score.html` (bump `score.jsx?v=19` → `?v=20`).

**Interfaces:**
- Consumes: `fetch('/api/client/score-record')` (Task 3) for signed-in; the baked `RECORD_DEMO` fixture for signed-out. Website babel cannot import the `.mjs`/`.ts` — the server owns live aggregation; demo is precomputed.
- Produces: a full-page Record view reached from the Ledger leader.

- [ ] **Step 1: Add the baked demo fixture**

The website can't run the aggregation in-browser, so bake the output of `bsScoreRecord(BS_RECORD_DEMO_ROWS, { now: <build date> })` as a static object near the top of `score.jsx` (below the existing `LEDGER` const). Generate it deterministically:

```bash
node -e "import('./mobile-app/src/services/scoreHistory.mjs').then(m=>{const rows=[
  { category:'workouts', source_kind:'workout_session', delta:10, note:'Workout logged', earned_at:'2026-07-06T15:00:00Z' },
  { category:'nutrition', source_kind:'meal_log', delta:10, note:'Meal logged', earned_at:'2026-07-06T12:00:00Z' },
  { category:'habits', source_kind:'habit', delta:3, note:'Habit completed', earned_at:'2026-07-05T18:00:00Z' },
  { category:'workouts', source_kind:'workout_session', delta:10, note:'Workout logged', earned_at:'2026-07-04T15:00:00Z' },
  { category:'adherence', source_kind:'checkin', delta:15, note:'Weekly check-in', earned_at:'2026-07-01T09:00:00Z' },
  { category:'prs', source_kind:'pr_wall', delta:12, note:'Back squat PR', earned_at:'2026-06-28T17:00:00Z' },
  { category:'adherence', source_kind:'checkin', delta:-7, note:'Missed check-in', earned_at:'2026-06-22T09:00:00Z' },
  { category:'nutrition', source_kind:'meal_log', delta:10, note:'Meal logged', earned_at:'2026-06-15T12:00:00Z' }];
  console.log(JSON.stringify(m.bsScoreRecord(rows,{now:new Date('2026-07-06T18:00:00Z')}),null,2));})"
```

Paste the printed JSON as `const RECORD_DEMO = {...};` near the other demo consts (this is a labelled preview, matching the mobile demo rows).

- [ ] **Step 2: Add the `ScoreRecordView` component**

Add a `ScoreRecordView({ onBack })` (styled to the score page's dark palette — `INK/PAPER/TEAL/serif/mono/sans` already in scope) rendering the four blocks off `RECORD_DEMO` (signed-out) or the live endpoint (signed-in):

```jsx
function ScoreRecordView({ onBack }) {
  const [record, setRecord] = React.useState(RECORD_DEMO);
  const [live, setLive] = React.useState(false);
  const [range, setRange] = React.useState("1w");
  const [filter, setFilter] = React.useState("all");
  React.useEffect(function () {
    var alive = true;
    fetch("/api/client/score-record", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (alive && d && d.ranges) { setRecord(d); setLive(true); } })
      .catch(function () {});
    return function () { alive = false; };
  }, []);
  var win = record.ranges[range] || record.ranges["1w"];
  var filters = [["all", "All"], ["workouts", "Workouts"], ["habits", "Habits"], ["nutrition", "Nutrition"], ["checkins", "Check-ins"], ["prs", "PRs"], ["penalty", "Penalties"]];
  var days = filter === "all" ? record.history
    : record.history.map(function (d) { return Object.assign({}, d, { rows: d.rows.filter(function (r) { return r.bucket === filter; }) }); }).filter(function (d) { return d.rows.length; });
  var fmtD = function (iso) { try { return new Date(iso + "T00:00:00Z").toLocaleDateString([], { month: "short", day: "numeric" }); } catch (e) { return iso; } };
  var maxBar = Math.max(1, ...win.byCategory.map(function (c) { return c.earned; }));
  // ... render: back link + "SHAPE SCORE · THE RECORD" eyebrow + lifetime total +
  // register (This week / This month / Earned·range / Lost·range) + range toggle
  // (1W/1M/3M/All) + a cumulative <svg> line (same preserveAspectRatio="none"
  // idiom as ScoreHero's trace) + horizontal by-source bars (width = earned/maxBar)
  // with a rust penalties line + the day-grouped filterable history.
  // Signed-out shows the "Preview · demo record — Sign in →" band (live === false).
}
```

> The render body follows the existing `ScoreLedger`/`ScoreHero` styling exactly (dark cards `rgba(11,14,12,0.62)`, `TEAL` accents, `serif` titles, `mono` figures). Bars are simple `<div>`s with `width: (earned/maxBar*100)+"%"`. Keep it a full `<section>` swapped in over the page (Step 3), not a modal.

- [ ] **Step 3: Wire the leader + view swap**

In `ScoreLedger`, add a leader row after the ledger card (before the closing `</div>` of the `maxWidth:1320` wrapper), calling a prop `onOpenRecord`:

```jsx
<div onClick={props.onOpenRecord} role="button" tabIndex={0} style={{ marginTop: 20, fontFamily: mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, cursor: "pointer", borderBottom: "2px solid " + TEAL, width: "fit-content", paddingBottom: 4 }}>See the full record →</div>
```

In `ScorePage`, add `const [recordOpen, setRecordOpen] = React.useState(false);` and render `{recordOpen ? <ScoreRecordView onBack={() => setRecordOpen(false)} /> : <>...existing sections...</>}` (or render `ScoreRecordView` as an overlay `<section>` above the fold). Pass `onOpenRecord={() => setRecordOpen(true)}` into `<ScoreLedger />`.

- [ ] **Step 4: Cache-bust + verify + commit**

Bump `Score.html`: `score.jsx?v=19` → `score.jsx?v=20`.

Parse-check the babel block:
```bash
node -e "const s=require('fs').readFileSync('public/newdesign/score.jsx','utf8');require('@babel/parser').parse(s,{sourceType:'module',plugins:['jsx']});console.log('PARSE_OK')"
```
Expected: `PARSE_OK`.

```bash
sed -i 's/\r$//' public/newdesign/score.jsx public/newdesign/Score.html
git add public/newdesign/score.jsx public/newdesign/Score.html
git commit -m "feat(score): The Record view on the website + ?v=20 cache-bust"
```

---

### Task 6: WORKLOG entry + finish

**Files:**
- Modify: `docs/WORKLOG.md` (prepend a dated changelog entry under `## Changelog`).

- [ ] **Step 1: Add the changelog entry**

Add a `### 2026-07-06 — "The Record": Shape Score history + report (mobile + website)` entry summarizing: the `scoreHistory.mjs` + `.ts` twin + tests, the `GET /api/client/score-record` route, `BSScoreRecordPage` + the LEDGER leader (mobile), the `ScoreRecordView` + `?v=20` (website), rank-basis (redemptions excluded so it reconciles with the Standing), no migration, and the verification run (parse · mobile build · tsc · full test suite · LF).

- [ ] **Step 2: Full verification sweep**

Run all gates once more from a clean state:
```bash
npm test
npx tsc --noEmit
node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})" && echo JSX_OK
node -e "require('@babel/parser').parse(require('fs').readFileSync('public/newdesign/score.jsx','utf8'),{sourceType:'module',plugins:['jsx']})" && echo WEB_OK
cd mobile-app && VITE_BASE=/m/ npm run build && cd ..
```
Expected: full suite green, tsc clean (baseline errors only), both parse OK, mobile build exits 0.

- [ ] **Step 3: Commit + finish the branch**

```bash
sed -i 's/\r$//' docs/WORKLOG.md
git add docs/WORKLOG.md
git commit -m "docs: WORKLOG — The Record (score history + report) shipped"
```

Then use **superpowers:finishing-a-development-branch** → push `claude/score-record-build`, open a PR against `main`, wait for CI green + the CodeRabbit review, address findings, squash-merge on green (keep the branch). No migration to run.

---

## Self-Review

**Spec coverage:**
- Header register (lifetime + This week/This month/Earned·Lost per range) → Task 4 Step 3 / Task 5 Step 2. ✓
- Score-over-time cumulative line + 1W/1M/3M/All toggle → `BSRecordTrace` + range toggle (Task 4), `ScoreRecordView` svg + toggle (Task 5). ✓
- By-source bars + penalties in rust → Task 4/5 block 3, module `byCategory`+`penalties`. ✓
- Day-grouped filterable full history (All/Workouts/Habits/Nutrition/Check-ins/PRs/Penalties) → module `history` + `recordFilterBucket` + the filter chips. ✓
- Server-side aggregation via `scoreHistory.mjs` + `src/lib` twin + `GET /api/client/score-record`, no migration → Tasks 1–3. ✓
- Mobile + website → Tasks 4 + 5. ✓
- Demo honesty (labelled preview, no fabricated live numbers) → preview band + demo rows/fixture. ✓
- Tests (windowing, cumulative + subtotals, rank-basis exclusion, earned/lost/net, penalties→rust, empty→no NaN, single-entry, month-boundary weekly buckets) → Task 1 Step 1. ✓

**Placeholder scan:** module/twin/route/tests are complete concrete code. The two UI tasks give full mobile component code and a website skeleton whose render body is explicitly specified to mirror the existing `ScoreLedger`/`ScoreHero` styling (an intentional "match the neighbouring code" instruction, not a TODO) — acceptable because the website file's exact styling constants live in-file and must be matched, not invented.

**Type/name consistency:** `bsScoreRecord`, `RANGE_KEYS`, `RECORD_CATEGORY_LABELS`, `recordFilterBucket`, and the `{ ranges, history, lifetime }` shape are identical across `.mjs`, `.ts`, the route, and both consumers. `history` (not `byDay`) is the field name end-to-end. Range keys `'1w'|'1m'|'3m'|'all'` are consistent everywhere.
