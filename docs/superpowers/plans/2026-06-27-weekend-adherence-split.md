# Weekend-vs-Weekday Adherence Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a weekday-vs-weekend adherence signal (nutrition + habits in v1) as a member Progress card and a coach roster chip + client-detail plate, and simplify the Progress hub while doing it.

**Architecture:** One pure, timezone-free module (`weekendSplit.mjs`) holds all statistics; it consumes pre-bucketed weekly counts and returns per-dimension gaps with a statistical flag gate. The member self-path builds those buckets client-side from already-cached endpoints; the coach path builds them server-side in a `SECURITY DEFINER` SQL RPC (because habit data is owner-only under RLS). A hand-mirrored TypeScript twin (`weekendSplit.ts`) serves the Next coach route.

**Tech Stack:** Node ESM (`.mjs`) + `node --test`; Next.js (TypeScript) API routes; Supabase Postgres (SQL migrations + RPC); React/JSX broadsheet UI (mobile `iosAppBroadsheetClient.jsx`, coach `iosAppBroadsheetPros.jsx`); Vite build → `public/m` sync.

## Global Constraints

These apply to **every** task:

- **v1 scope = nutrition + habits only.** The `training` dimension always returns `null` in v1 (no `client_workouts.scheduled_date` column exists yet). Do not implement training.
- **The pure module is timezone-free.** All Sat/Sun / DST / weekday resolution happens upstream: local-day helpers client-side, SQL `Intl`-free date math server-side. No `Intl`, no `Date`-from-now, no tz logic inside `weekendSplit.mjs`/`.ts`.
- **Constants are single-source-of-truth in `weekendSplit.mjs`**, re-declared verbatim in `weekendSplit.ts`. Values: `MIN_WEEKENDS=3`, `FLAG_GAP_PP=15`, `MIN_DIM_DAYS={nutrition:12,habits:12}`, `SE_Z=1.65`, `CONSISTENCY=0.60`, `NUTRITION_PROTEIN_FLOOR_G=10`.
- **No bare adherence percentages on any client-facing surface** (repo house rule, stated in `public/newdesign/dashProgress.jsx:8-10`). Weekly points (a point count, not a %) is allowed.
- **Copy is descriptive, never causal/shaming.** "Your weekends run N pts under your weekdays," never "you have a weekend problem."
- **Absent dimensions render nothing** — never a fabricated `0%`. A number is live or it reads "—".
- **Theme tokens only** on themed surfaces: `const t = useBS()`; use `t.INK/PAPER/PAPER2/RULE/HAIR/ACCENT/GREEN/RUST/AMBER/MONO/DISPLAY`. Never hardcode ink/paper. Live/actionable surfaces use `BSPlate`.
- **Tests:** Node's built-in runner. New test files live in `tests/` and MUST be appended to the `test` script in `package.json`. Run with `node --test tests/<file>.test.mjs`.
- **Migrations** are applied by the repo owner: write the `.sql` file, then post its `https://raw.githubusercontent.com/cperry8800-droid/shape-app/<branch>/supabase-migrations/<file>.sql` link for the owner to run; verify afterward via the Supabase MCP.
- **Mobile build gate:** after any `mobile-app/` change, from `mobile-app/` run `VITE_BASE='/m/' npm run build`, then from repo root `rm -rf public/m && cp -r mobile-app/dist public/m`, and confirm `diff -rq mobile-app/dist public/m` is clean. CI fails on a stale `public/m`.
- **Branch:** `feat/weekend-adherence-split` (already created off `main`; the spec is committed there).

---

## File Structure

**Create:**
- `mobile-app/src/services/weekendSplit.mjs` — pure module: constants, `computeWeekendSplit`, `buildSelfWeekendBuckets`.
- `src/lib/weekendSplit.ts` — hand-mirrored TS twin (compute only; used by the coach route).
- `tests/weekend-split.test.mjs` — unit tests for the module.
- `supabase-migrations/2026-06-27-client-timezone.sql` — `client_profiles.timezone` + backfill.
- `supabase-migrations/2026-06-27-roster-weekend-split.sql` — `get_roster_weekend_split` RPC.
- `src/app/api/client/timezone/route.ts` — opportunistic tz write.
- `src/app/api/coach/roster-weekend/route.ts` — coach batch endpoint.

**Modify:**
- `mobile-app/src/services/shapeBackend.js` — add `getClientHabits` getter + `setTimezone` + `weekendSplitSelf`.
- `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — tz capture on mount; Weekends card; delete `BSMeKpis`; remove Insights card.
- `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — roster chip; client-detail Weekend-pattern plate.
- `package.json` — register the new test file.

---

## Task 1: Per-user timezone — column, write endpoint, capture-on-open, backfill

**Files:**
- Create: `supabase-migrations/2026-06-27-client-timezone.sql`
- Create: `src/app/api/client/timezone/route.ts`
- Modify: `mobile-app/src/services/shapeBackend.js` (add `setTimezone`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:343` (BSClientAppInner mount effect)

**Interfaces:**
- Produces: `client_profiles.timezone text` (IANA); `POST /api/client/timezone { tz } → { ok }`; `window.ShapeProfile.setTimezone(tz)`.

- [ ] **Step 1: Write the migration**

Create `supabase-migrations/2026-06-27-client-timezone.sql`:

```sql
-- Per-user IANA timezone for weekend/weekday bucketing (and future tz-aware reads).
-- client_profiles is otherwise (user_id, data jsonb, updated_at); a dedicated text
-- column joins far more cheaply in get_roster_weekend_split than JSONB extraction.
alter table public.client_profiles
  add column if not exists timezone text;

-- Backfill from the only existing tz source: a member's reminder settings.
-- Skip 'UTC' (the default) so we only seed genuinely-known zones.
update public.client_profiles cp
set timezone = r.tz
from (
  select distinct on (user_id) user_id, tz
  from public.user_scheduled_reminders
  where tz is not null and tz <> 'UTC'
  order by user_id, updated_at desc
) r
where r.user_id = cp.user_id
  and cp.timezone is null;
```

- [ ] **Step 2: Post the migration link for the owner to run**

Post: `https://raw.githubusercontent.com/cperry8800-droid/shape-app/feat/weekend-adherence-split/supabase-migrations/2026-06-27-client-timezone.sql`
After the owner confirms, verify via Supabase MCP `execute_sql`: `select column_name from information_schema.columns where table_name='client_profiles' and column_name='timezone';` → expect 1 row.

- [ ] **Step 3: Write the write-endpoint**

Create `src/app/api/client/timezone/route.ts`:

```typescript
// Opportunistic per-user IANA timezone capture. The client posts its resolved
// Intl zone on app open; we store it on client_profiles for tz-aware reads
// (weekend split, future reminders). Owner-scoped via the request's auth client.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A loose IANA sanity check ("Area/Location", optionally multi-segment, plus UTC).
const IANA = /^(UTC|[A-Za-z]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?)$/;

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await readJson<{ tz?: unknown }>(request, { allowEmpty: false });
  if (!body.ok) return body.response;
  const tz = String(body.data?.tz ?? '').trim().slice(0, 64);
  if (!IANA.test(tz)) return NextResponse.json({ error: 'invalid_tz' }, { status: 400 });

  const supabase = await clientForRequest(request);
  // client_profiles is keyed by user_id (PK); `data` defaults to '{}' and a
  // trigger maintains updated_at, so a tz-only upsert is safe on insert + update
  // (RLS: client_profiles_insert_own + client_profiles_update_own).
  const { error } = await supabase
    .from('client_profiles')
    .upsert({ user_id: user.id, timezone: tz }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Add the client getter**

In `mobile-app/src/services/shapeBackend.js`, near the other `window.Shape*` writers, add:

```javascript
// Opportunistic, non-throwing: mirror the authenticated-fetch pattern used by
// postProConsole (there is NO generic postJson helper in this file).
async function setTimezone(tz) {
  if (!tz || typeof tz !== 'string') return { ok: false };
  if (!apiBaseUrl || !state.session?.access_token) return { ok: false };
  try {
    const res = await fetch(`${apiBaseUrl}/api/client/timezone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify({ tz }),
    });
    return res.ok ? { ok: true } : { ok: false };
  } catch { return { ok: false }; }
}
window.ShapeProfile = { ...(window.ShapeProfile || {}), setTimezone };
```

- [ ] **Step 5: Capture timezone once on app open**

In `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`, inside `BSClientAppInner` (line 343), add a mount effect that fires once when signed in:

```javascript
useEffect(() => {
  if (!signedIn) return;            // only persist for a real account
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { tz = 'UTC'; }
  if (tz && tz !== 'UTC') { window.ShapeProfile?.setTimezone?.(tz); }
}, [signedIn]);
```

(Use whatever signed-in flag the component already has in scope; never throw if `Intl` is unavailable.)

- [ ] **Step 6: Build + verify + commit**

Run the mobile build gate (Global Constraints). Then:

```bash
git add supabase-migrations/2026-06-27-client-timezone.sql src/app/api/client/timezone/route.ts mobile-app/src/services/shapeBackend.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
git commit -m "feat(weekend-split): per-user timezone capture + backfill"
```

---

## Task 2: `weekendSplit.mjs` pure module + unit tests (TDD)

**Files:**
- Create: `mobile-app/src/services/weekendSplit.mjs`
- Create: `tests/weekend-split.test.mjs`
- Modify: `package.json` (append the test file to the `test` script)

**Interfaces:**
- Produces:
  - `computeWeekendSplit({ nutrition, habits }, options?) → WeekendSplitResult`
  - `buildSelfWeekendBuckets(habitsPayload, progressPayload, { todayLocal }) → { nutrition: WeeklyBucket[], habits: WeeklyBucket[] }`
  - constants `MIN_WEEKENDS, FLAG_GAP_PP, MIN_DIM_DAYS, SE_Z, CONSISTENCY, NUTRITION_PROTEIN_FLOOR_G, STATUS`
  - `WeeklyBucket = { weekStart, weekdayNum, weekdayDen, weekendNum, weekendDen }`
  - `WeekendSplitResult = { status, dimensions: { nutrition, habits, training, composite }, worstDimension, weekends }`
  - `DimResult = { present, weekdayRate, weekendRate, gapPp, se, lowerCi, flagged, weeksObserved, weekPositiveShare, nWeekdayDays, nWeekendDays }`

- [ ] **Step 1: Write the first failing tests (statistics core)**

Create `tests/weekend-split.test.mjs`:

```javascript
// Weekday-vs-weekend adherence split — pure statistics over pre-bucketed weekly
// counts. Timezone-free by contract; the SQL RPC + client bucket builder mirror
// the bucketing. The .mjs is the source of truth; src/lib/weekendSplit.ts mirrors
// it. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWeekendSplit, buildSelfWeekendBuckets,
  MIN_WEEKENDS, FLAG_GAP_PP, SE_Z, CONSISTENCY, STATUS,
} from '../mobile-app/src/services/weekendSplit.mjs';

// helper: build N weeks of identical buckets for one dimension
const wk = (i, wdN, wdD, weN, weD) => ({ weekStart: `2026-W${i}`, weekdayNum: wdN, weekdayDen: wdD, weekendNum: weN, weekendDen: weD });

test('fewer than MIN_WEEKENDS weekends → insufficient', () => {
  const nutrition = [wk(1, 5, 5, 2, 2), wk(2, 5, 5, 2, 2)]; // 2 weekends only
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.status, STATUS.INSUFFICIENT);
});

test('a clear, consistent weekend drop flags', () => {
  // 6 weeks: weekday 5/5 logged, weekend 0/2 logged → 100% vs 0%, every week
  const nutrition = Array.from({ length: 6 }, (_, i) => wk(i, 5, 5, 0, 2));
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.status, STATUS.OK);
  assert.equal(r.dimensions.nutrition.present, true);
  assert.equal(Math.round(r.dimensions.nutrition.gapPp), 100);
  assert.equal(r.dimensions.nutrition.flagged, true);
  assert.equal(r.worstDimension, 'nutrition');
});

test('a perfectly consistent member does not flag (gap ~0)', () => {
  const nutrition = Array.from({ length: 6 }, (_, i) => wk(i, 5, 5, 2, 2));
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.dimensions.nutrition.flagged, false);
  assert.equal(r.worstDimension, null);
});

test('two solid weekends + one outlier does NOT flag (consistency gate)', () => {
  // weekday always 5/5; weekend: 2/2,2/2,2/2,2/2,2/2,0/2 → small avg gap, low positive-week share
  const nutrition = [wk(0,5,5,2,2),wk(1,5,5,2,2),wk(2,5,5,2,2),wk(3,5,5,2,2),wk(4,5,5,2,2),wk(5,5,5,0,2)];
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.dimensions.nutrition.flagged, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/weekend-split.test.mjs`
Expected: FAIL — `Cannot find module '../mobile-app/src/services/weekendSplit.mjs'`.

- [ ] **Step 3: Implement the module**

Create `mobile-app/src/services/weekendSplit.mjs`:

```javascript
// Weekday-vs-weekend adherence split — the single source of truth for the member
// Weekends card and the coach roster/plate. PURE + TIMEZONE-FREE by contract:
// callers pass pre-bucketed weekly counts (client bucket builder for self, the
// get_roster_weekend_split SQL RPC for coaches). Mirrored verbatim in
// src/lib/weekendSplit.ts. Unit-tested in tests/weekend-split.test.mjs.

export const MIN_WEEKENDS = 3;            // weekends of data before leaving 'insufficient'
export const FLAG_GAP_PP = 15;            // practical floor for a flag (tunable)
export const MIN_DIM_DAYS = { nutrition: 12, habits: 12 }; // weekend-side denominator floor
export const SE_Z = 1.65;                 // one-sided ~95%
export const CONSISTENCY = 0.60;          // gap must be positive in ≥60% of observed weeks
export const NUTRITION_PROTEIN_FLOOR_G = 10; // a "meaningful" food log (used by the bucket builder)
export const STATUS = { OK: 'ok', BUILDING: 'building', INSUFFICIENT: 'insufficient' };

const sum = (arr, f) => arr.reduce((a, b) => a + f(b), 0);

function dimResult(buckets, minDays) {
  const wdDen = sum(buckets, (b) => b.weekdayDen);
  const weDen = sum(buckets, (b) => b.weekendDen);
  if (!(weDen >= minDays && wdDen > 0)) return null; // absent — never rendered 0%
  const wdNum = sum(buckets, (b) => b.weekdayNum);
  const weNum = sum(buckets, (b) => b.weekendNum);
  const pWk = wdNum / wdDen;
  const pWe = weNum / weDen;
  const gapPp = (pWk - pWe) * 100;
  const se = Math.sqrt(pWk * (1 - pWk) / wdDen + pWe * (1 - pWe) / weDen) * 100;
  // per-week consistency: only weeks with data on BOTH sides count
  const weeks = buckets.filter((b) => b.weekdayDen > 0 && b.weekendDen > 0);
  const weeksObserved = weeks.length;
  const positive = weeks.filter((b) => (b.weekdayNum / b.weekdayDen) - (b.weekendNum / b.weekendDen) > 0).length;
  const weekPositiveShare = weeksObserved ? positive / weeksObserved : 0;
  const lowerCi = gapPp - SE_Z * se;
  const flagged = gapPp >= FLAG_GAP_PP && gapPp >= SE_Z * se && weeksObserved > 0 && weekPositiveShare >= CONSISTENCY;
  return {
    present: true,
    weekdayRate: pWk, weekendRate: pWe, gapPp, se, lowerCi,
    flagged, weeksObserved, weekPositiveShare,
    nWeekdayDays: wdDen, nWeekendDays: weDen,
  };
}

function compositeOf(dims) {
  const present = dims.filter(Boolean);
  if (!present.length) return null;
  // inverse-variance weighted blend of the gaps (display only, never flags)
  let wsum = 0, gsum = 0;
  for (const d of present) {
    const w = d.se > 0 ? 1 / (d.se * d.se) : 1;
    wsum += w; gsum += w * d.gapPp;
  }
  return { present: true, gapPp: wsum ? gsum / wsum : 0 };
}

export function computeWeekendSplit(input, options = {}) {
  const minDays = { ...MIN_DIM_DAYS, ...(options.minDimDays || {}) };
  const nutrition = dimResult(input.nutrition || [], minDays.nutrition);
  const habits = dimResult(input.habits || [], minDays.habits);
  const training = null; // v1: no scheduled_date source

  // distinct weeks with any weekend data
  const weekSet = new Set();
  for (const b of [...(input.nutrition || []), ...(input.habits || [])]) {
    if (b.weekendDen > 0) weekSet.add(b.weekStart);
  }
  const weekends = weekSet.size;

  const present = [nutrition, habits].filter(Boolean);
  let status = STATUS.OK;
  if (weekends < (options.minWeekends ?? MIN_WEEKENDS)) status = STATUS.INSUFFICIENT;
  else if (!present.length) status = STATUS.BUILDING;

  // worstDimension: present, positive-gap, flagged, ranked by lower-CI bound
  const named = [['nutrition', nutrition], ['habits', habits]]
    .filter(([, d]) => d && d.flagged && d.gapPp > 0)
    .sort((a, b) => b[1].lowerCi - a[1].lowerCi);
  const worstDimension = named.length ? named[0][0] : null;

  return {
    status,
    dimensions: { nutrition, habits, training, composite: compositeOf(present) },
    worstDimension,
    weekends,
  };
}
```

- [ ] **Step 4: Run statistics-core tests, verify pass**

Run: `node --test tests/weekend-split.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Add presence/denominator + composite + worstDimension tests**

Append to `tests/weekend-split.test.mjs`:

```javascript
test('weekend denominator below MIN_DIM_DAYS → dimension absent (null), not 0%', () => {
  // 3 weekends but only 6 weekend-days total (< 12) → nutrition absent
  const nutrition = [wk(0,5,5,0,2),wk(1,5,5,0,2),wk(2,5,5,0,2)];
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.dimensions.nutrition, null);
  assert.equal(r.status, STATUS.BUILDING); // has weekends, but no present dimension
});

test('single present dimension → composite equals that dimension, no fabricated gaps', () => {
  const nutrition = Array.from({ length: 6 }, (_, i) => wk(i, 5, 5, 0, 2));
  const r = computeWeekendSplit({ nutrition, habits: [] });
  assert.equal(r.dimensions.habits, null);
  assert.equal(Math.round(r.dimensions.composite.gapPp), Math.round(r.dimensions.nutrition.gapPp));
});

test('worstDimension ranks by lower-CI bound among flagged dims', () => {
  // nutrition: big clean gap; habits: smaller noisier gap
  const nutrition = Array.from({ length: 6 }, (_, i) => wk(i, 10, 10, 1, 5)); // 100% vs 20%
  const habits = Array.from({ length: 6 }, (_, i) => wk(i, 18, 20, 12, 16));   // ~90% vs 75%
  const r = computeWeekendSplit({ nutrition, habits });
  assert.equal(r.worstDimension, 'nutrition');
});

test('constants are exported and stable', () => {
  assert.equal(MIN_WEEKENDS, 3);
  assert.equal(FLAG_GAP_PP, 15);
  assert.equal(SE_Z, 1.65);
  assert.equal(CONSISTENCY, 0.60);
});
```

- [ ] **Step 6: Run all module tests, verify pass**

Run: `node --test tests/weekend-split.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 7: Implement `buildSelfWeekendBuckets` + tests**

Append the bucket builder to `weekendSplit.mjs` (still tz-free — dates are already local `YYYY-MM-DD`; weekday is derived by anchoring at noon UTC, matching `weekMondayOf`):

```javascript
// ── Self bucket builder ──────────────────────────────────────────────────────
// Turns the member's own cached payloads (already on their local calendar day)
// into the weekly buckets computeWeekendSplit consumes. No tz lookup needed: the
// device's own data is already local-dated.

const DAY_MS = 86400000;
function isoDay( d) { return d.toISOString().slice(0, 10); }
function dowUTCnoon(day) { return new Date(`${day}T12:00:00Z`).getUTCDay(); } // 0=Sun..6=Sat
function isWeekendDay(day) { const d = dowUTCnoon(day); return d === 0 || d === 6; }
function mondayOf(day) {
  const dt = new Date(`${day}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return isoDay(dt);
}

// 56-day window of local YYYY-MM-DD strings, ending at todayLocal (inclusive).
function windowDays(todayLocal, n = 56) {
  const end = new Date(`${todayLocal}T12:00:00Z`);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoDay(new Date(end.getTime() - i * DAY_MS)));
  return out;
}

function emptyWeek(weekStart) { return { weekStart, weekdayNum: 0, weekdayDen: 0, weekendNum: 0, weekendDen: 0 }; }

export function buildSelfWeekendBuckets(habitsPayload, progressPayload, { todayLocal }) {
  const allDays = windowDays(todayLocal);     // 56 calendar days, oldest→newest
  const winSet = new Set(allDays);

  // Nutrition: presence in the protein series = a snapshot existed that day;
  // "logged" = that day's protein clears the meaningful-food floor.
  const series = (progressPayload && progressPayload.series) || {};
  const proteinByDay = new Map();
  for (const pt of (series.protein || [])) {
    if (pt && pt.date && winSet.has(String(pt.date))) proteinByDay.set(String(pt.date), Number(pt.value) || 0);
  }

  // Habits: daily-cadence habits only; scheduled = every day, done = completion that day.
  const allHabits = (habitsPayload && habitsPayload.habits) || [];
  const daily = allHabits.filter((h) => {
    const c = String(h.cadence || 'daily').toLowerCase();
    return c === 'daily' || c === 'everyday';
  });
  const dailyCount = daily.length;
  const doneByDay = new Map(); // day → count of daily habits completed
  for (const h of daily) {
    // /api/client/habits returns each habit's completion dates as `history`.
    for (const done of (h.history || [])) {
      const d = String(done);
      if (winSet.has(d)) doneByDay.set(d, (doneByDay.get(d) || 0) + 1);
    }
  }

  // Clamp the window to the member's FIRST observed activity (any snapshot or
  // completion). Without this a brand-new account reads 54 empty days as a giant
  // weekend "gap." No activity at all → no buckets → 'insufficient'.
  const activityDays = [...proteinByDay.keys(), ...doneByDay.keys()];
  if (!activityDays.length) return { nutrition: [], habits: [] };
  const earliest = activityDays.reduce((a, b) => (a < b ? a : b)); // lexicographic min of YYYY-MM-DD
  const days = allDays.filter((d) => d >= earliest);

  const nutritionWeeks = new Map();
  const habitWeeks = new Map();
  for (const day of days) {
    const ws = mondayOf(day);
    const weekend = isWeekendDay(day);
    // nutrition — denominator is every day in the (clamped) window
    const nb = nutritionWeeks.get(ws) || emptyWeek(ws);
    const logged = (proteinByDay.get(day) || 0) >= NUTRITION_PROTEIN_FLOOR_G ? 1 : 0;
    if (weekend) { nb.weekendDen += 1; nb.weekendNum += logged; } else { nb.weekdayDen += 1; nb.weekdayNum += logged; }
    nutritionWeeks.set(ws, nb);
    // habits — denominator is (#daily habits) per day
    if (dailyCount > 0) {
      const hb = habitWeeks.get(ws) || emptyWeek(ws);
      const done = doneByDay.get(day) || 0;
      if (weekend) { hb.weekendDen += dailyCount; hb.weekendNum += done; } else { hb.weekdayDen += dailyCount; hb.weekdayNum += done; }
      habitWeeks.set(ws, hb);
    }
  }

  return {
    nutrition: [...nutritionWeeks.values()],
    habits: dailyCount > 0 ? [...habitWeeks.values()] : [],
  };
}
```

Append tests:

```javascript
test('buildSelfWeekendBuckets: weekday-only protein logging yields a weekend gap', () => {
  // log protein every weekday, never on weekends, across the window
  const days = [];
  const end = '2026-06-27';
  // synthesize 56 days; mark weekdays as logged
  const series = { protein: [] };
  const dayMs = 86400000;
  const e = new Date(end + 'T12:00:00Z');
  for (let i = 55; i >= 0; i--) {
    const day = new Date(e.getTime() - i * dayMs).toISOString().slice(0, 10);
    const dow = new Date(day + 'T12:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6) series.protein.push({ date: day, value: 120 });
  }
  const buckets = buildSelfWeekendBuckets({ habits: [] }, { series }, { todayLocal: end });
  const r = computeWeekendSplit(buckets);
  assert.equal(r.dimensions.nutrition.present, true);
  assert.ok(r.dimensions.nutrition.gapPp > 90); // weekday ~100%, weekend ~0%
  assert.equal(r.dimensions.nutrition.flagged, true);
});

test('buildSelfWeekendBuckets: a 1g protein day is NOT a logged day (floor)', () => {
  const series = { protein: [{ date: '2026-06-27', value: 1 }] };
  const buckets = buildSelfWeekendBuckets({ habits: [] }, { series }, { todayLocal: '2026-06-27' });
  // that single below-floor day contributes 0 to weekendNum
  const sat = buckets.nutrition.find((w) => w.weekendNum > 0);
  assert.equal(sat, undefined);
});

test('buildSelfWeekendBuckets: a brand-new account (only a few recent days) does not fabricate a gap', () => {
  // activity on the last 5 days only → window clamps to ~5 days → <12 weekend-days → nutrition absent
  const series = { protein: [] };
  const dayMs = 86400000; const e = new Date('2026-06-27T12:00:00Z');
  for (let i = 4; i >= 0; i--) series.protein.push({ date: new Date(e.getTime() - i * dayMs).toISOString().slice(0, 10), value: 120 });
  const buckets = buildSelfWeekendBuckets({ habits: [] }, { series }, { todayLocal: '2026-06-27' });
  const r = computeWeekendSplit(buckets);
  assert.equal(r.dimensions.nutrition, null); // clamp prevents 54 empty days reading as a weekend cliff
});

test('buildSelfWeekendBuckets: no activity at all → empty buckets → insufficient', () => {
  const buckets = buildSelfWeekendBuckets({ habits: [] }, { series: {} }, { todayLocal: '2026-06-27' });
  assert.deepEqual(buckets, { nutrition: [], habits: [] });
  assert.equal(computeWeekendSplit(buckets).status, STATUS.INSUFFICIENT);
});

test('buildSelfWeekendBuckets: weekday-cadence habits excluded entirely', () => {
  const habits = { habits: [{ id: '1', cadence: 'weekdays', history: ['2026-06-22'] }] };
  const buckets = buildSelfWeekendBuckets(habits, { series: {} }, { todayLocal: '2026-06-27' });
  assert.equal(buckets.habits.length, 0); // no daily-cadence habits → dimension absent
});

test('buildSelfWeekendBuckets: a daily habit counts its `history` dates into buckets', () => {
  // one daily habit completed every weekday for the window, never on weekends
  const dayMs = 86400000; const e = new Date('2026-06-27T12:00:00Z');
  const history = [];
  for (let i = 55; i >= 0; i--) {
    const day = new Date(e.getTime() - i * dayMs).toISOString().slice(0, 10);
    const dow = new Date(day + 'T12:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6) history.push(day);
  }
  const habits = { habits: [{ id: '1', cadence: 'daily', history }] };
  const buckets = buildSelfWeekendBuckets(habits, { series: {} }, { todayLocal: '2026-06-27' });
  const r = computeWeekendSplit(buckets);
  assert.equal(r.dimensions.habits.present, true);
  assert.ok(r.dimensions.habits.gapPp > 90); // weekday ~100%, weekend ~0%
});
```

- [ ] **Step 8: Register the test file + run full suite**

In `package.json`, append `tests/weekend-split.test.mjs` to the `test` script string (after `tests/shape-steps.test.mjs`).
Run: `node --test tests/weekend-split.test.mjs`
Expected: PASS (14 tests). Then run `npm test` and confirm the whole suite still passes.

- [ ] **Step 9: Commit**

```bash
git add mobile-app/src/services/weekendSplit.mjs tests/weekend-split.test.mjs package.json
git commit -m "feat(weekend-split): pure module (compute + self bucket builder) + tests"
```

---

## Task 3: `weekendSplit.ts` hand-mirrored TS twin

**Files:**
- Create: `src/lib/weekendSplit.ts`

**Interfaces:**
- Consumes: the `weekendSplit.mjs` algorithm (mirrored verbatim).
- Produces: `computeWeekendSplit(input: WeekendSplitInput, options?: WeekendSplitOptions): WeekendSplitResult` + exported constants + types, for the coach route (Task 7). The TS twin does NOT need `buildSelfWeekendBuckets` (the coach path buckets in SQL).

- [ ] **Step 1: Write the twin**

Create `src/lib/weekendSplit.ts` — mirror the constants + `computeWeekendSplit` (including `dimResult`/`compositeOf`) verbatim, typed. Header:

```typescript
// TS twin of mobile-app/src/services/weekendSplit.mjs — KEEP IN SYNC. The .mjs is
// the unit-tested source of truth (tests/weekend-split.test.mjs). Used by the
// /api/coach/roster-weekend route over buckets from get_roster_weekend_split.
export const MIN_WEEKENDS = 3;
export const FLAG_GAP_PP = 15;
export const MIN_DIM_DAYS = { nutrition: 12, habits: 12 };
export const SE_Z = 1.65;
export const CONSISTENCY = 0.60;
export const STATUS = { OK: 'ok', BUILDING: 'building', INSUFFICIENT: 'insufficient' } as const;

export type WeeklyBucket = { weekStart: string; weekdayNum: number; weekdayDen: number; weekendNum: number; weekendDen: number };
export type DimResult = {
  present: true; weekdayRate: number; weekendRate: number; gapPp: number; se: number; lowerCi: number;
  flagged: boolean; weeksObserved: number; weekPositiveShare: number; nWeekdayDays: number; nWeekendDays: number;
};
export type WeekendSplitInput = { nutrition?: WeeklyBucket[]; habits?: WeeklyBucket[] };
export type WeekendSplitOptions = { minWeekends?: number; minDimDays?: { nutrition?: number; habits?: number } };
export type WeekendSplitResult = {
  status: string;
  dimensions: { nutrition: DimResult | null; habits: DimResult | null; training: null; composite: { present: true; gapPp: number } | null };
  worstDimension: 'nutrition' | 'habits' | null;
  weekends: number;
};
```

Then port `dimResult`, `compositeOf`, and `computeWeekendSplit` from the `.mjs` with identical math.

- [ ] **Step 2: Typecheck**

Run from repo root: `rm -f .next/types/validator.ts && npx tsc --noEmit`
Expected: no errors referencing `weekendSplit.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/weekendSplit.ts
git commit -m "feat(weekend-split): TS twin for the coach route"
```

---

## Task 4: Member self-path wiring (`weekendSplitSelf`)

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (add `getClientHabits` if absent + `weekendSplitSelf`)

**Interfaces:**
- Consumes: `cachedClientJson` (`shapeBackend.js:3215`), `getClientProgress` (`:3363`), `/api/client/habits`, `computeWeekendSplit` + `buildSelfWeekendBuckets` (Task 2).
- Produces: `window.ShapeProgress.weekendSplit() → Promise<WeekendSplitResult | null>`.

- [ ] **Step 1: Add a cached habits getter (if not already present)**

In `shapeBackend.js`, beside the other getters (`:3363-3370`):

```javascript
async function getClientHabits() { return cachedClientJson('/api/client/habits'); }
```

- [ ] **Step 2: Add `weekendSplitSelf`**

```javascript
import { computeWeekendSplit, buildSelfWeekendBuckets } from './weekendSplit.mjs';

async function weekendSplitSelf() {
  try {
    const [habits, progress] = await Promise.all([getClientHabits(), getClientProgress()]);
    // device-local calendar day as YYYY-MM-DD (en-CA renders ISO order); no
    // cross-package import of local-day.ts needed.
    const todayLocal = new Date().toLocaleDateString('en-CA');
    const buckets = buildSelfWeekendBuckets(habits || { habits: [] }, progress || { series: {} }, { todayLocal });
    return computeWeekendSplit(buckets);
  } catch { return null; }
}
window.ShapeProgress = { ...(window.ShapeProgress || {}), weekendSplit: weekendSplitSelf };
```

(Place the `import` with the other top-of-file imports in `shapeBackend.js`; `weekendSplit.mjs` is a sibling in `mobile-app/src/services/`. If the file uses CommonJS-style loading instead of ESM imports, match that.)

- [ ] **Step 3: Build + smoke-verify**

Run the mobile build gate. In a browser preview signed in, call `await window.ShapeProgress.weekendSplit()` in the console and confirm it returns `{ status, dimensions, worstDimension, weekends }` (or `insufficient` for a thin account) without throwing.

- [ ] **Step 4: Commit**

```bash
git add mobile-app/src/services/shapeBackend.js public/m
git commit -m "feat(weekend-split): member self-path (weekendSplitSelf over cached endpoints)"
```

---

## Task 5: Member Weekends card in the Progress hub Overall tab

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (insert card in `BSClientProgress` Overall view, after the Insights-card location at `:21040`, before Trends at `:21041`)

**Interfaces:**
- Consumes: `window.ShapeProgress.weekendSplit()` (Task 4); `useBS()` theme; `BSPlate`.
- Produces: a self-contained `BSWeekendsCard` component rendered in the Overall tab.

- [ ] **Step 1: Add the card component**

Above `BSClientProgress` (near other Progress sub-cards), add `BSWeekendsCard`. It owns its own fetch + all states. Use theme tokens and `BSPlate` (match a neighboring plate's props):

```javascript
function BSWeekendsCard({ isSelf }) {
  const t = useBS();
  const BSPlate = window.BSPlate; // the plate primitive is exposed on window (see neighboring cards)
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    if (!isSelf || !window.ShapeProgress?.weekendSplit) return;
    let alive = true;
    window.ShapeProgress.weekendSplit().then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [isSelf]);

  // Absent / too-thin → render nothing (honest empty: no card at all).
  if (!data || data.status === 'insufficient') return null;

  const dims = data.dimensions || {};
  const present = ['nutrition', 'habits'].map((k) => [k, dims[k]]).filter(([, d]) => d);
  if (data.status === 'building' || !present.length) {
    return (
      <BSPlate c={t.ACCENT}>
        <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70 }}>WEEKENDS</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 17, color: t.INK, marginTop: 4 }}>Still learning your weekend pattern.</div>
        <div style={{ fontSize: 12, color: t.INK70, marginTop: 6 }}>A few more weekends of logging and this fills in.</div>
      </BSPlate>
    );
  }

  const flagged = present.find(([, d]) => d.flagged);
  const label = (k) => (k === 'nutrition' ? 'Nutrition' : 'Habits');
  const headline = flagged
    ? `Your weekends run ${Math.round(flagged[1].gapPp)} pts under your weekdays on ${label(flagged[0]).toLowerCase()}.`
    : `Your weekends hold steady with your weekdays.`;

  return (
    <BSPlate c={flagged ? (t.isLight ? '#0a8f87' : '#34d6c5') : t.ACCENT}>
      <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70 }}>WEEKENDS</div>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 17, color: t.INK, marginTop: 4 }}>{headline}</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {present.map(([k, d]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, color: t.INK }}>{label(k)}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 12, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>
              wk {Math.round(d.weekdayRate * 100)}% · we {Math.round(d.weekendRate * 100)}%
            </span>
            <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: d.flagged ? t.RUST : t.INK70, fontVariantNumeric: 'tabular-nums' }}>
              {d.gapPp >= 0 ? '−' : '+'}{Math.abs(Math.round(d.gapPp))}
            </span>
          </div>
        ))}
      </div>
      {flagged && <div style={{ fontSize: 12, color: t.INK70, marginTop: 8 }}>Closing that gap is your easiest win this month.</div>}
    </BSPlate>
  );
}
```

(Adjust `t.INK70`/`isLight`/`BSPlate` props to the file's actual theme-token + plate API — confirm against a neighboring `BSPlate` usage. Decorative glyphs, if any, stay monochrome typographic.)

- [ ] **Step 2: Render it in the Overall view**

In `BSClientProgress`, in the `overallView` JSX, insert `<BSWeekendsCard isSelf={isSelf} />` after the (soon-removed) Insights location and before the Trends card (`:21040–21041`). It is the only weekend surface; ensure it sits inside `overallView` (which ends ~`:21115`), not outside the tab ternary at `:21243`.

- [ ] **Step 3: Build + verify states**

Run the mobile build gate. In preview: signed-out (demo persona, no fake live numbers), thin account (card absent / building), and a seeded flagged account. Check AA contrast, 44px targets, 0px overflow across two themes.

- [ ] **Step 4: Commit**

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
git commit -m "feat(weekend-split): member Weekends card in Progress Overall tab"
```

---

## Task 6: Progress-hub simplification (delete dead BSMeKpis; remove Insights adherence grid)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a rule-compliant Overall tab (no bare adherence %); `weekly_points` preserved.

> **Scope note (honest):** this task removes the rule-violating Insights adherence grid and the dead `BSMeKpis`, and preserves `weekly_points`. A full pixel-port of the web's "comparisons + streaks/wins" widget layout is a larger Progress-hub redesign and is **deferred** — the mobile Overall tab already leads with KPI deltas (a then-vs-now equivalent), so removing the adherence grid achieves the user-approved "converge with the web / no bare adherence %" intent for v1.

- [ ] **Step 1: Delete the dead `BSMeKpis` component**

`BSMeKpis` is defined at `:15925` with **zero references** (verified: the only occurrence in `mobile-app/src/broadsheet/` is its definition). Delete the entire `function BSMeKpis(...) { ... }` block.

- [ ] **Step 2: Confirm zero references after deletion**

Run: `grep -rn "BSMeKpis" mobile-app/src/`
Expected: no output.

- [ ] **Step 3: Remove the Insights adherence card**

In `BSClientProgress`, delete the Insights card JSX block (`:21031–21040`, gated on `ana && ana.kpis`) which renders bare `workout_adherence_pct` / `macro_adherence_pct`. **Before deleting**, relocate `weekly_points` (`:21035`) into the kept KPI grid (`:21025–21030`) as one tile labelled "Weekly points" (a point count — allowed), reading from the same `ana.kpis.weekly_points`.

- [ ] **Step 4: Remove the now-orphaned `ana` analytics fetch (only if unused elsewhere)**

`grep -n "ana" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` around `BSClientProgress` (state `:20975`, fetch `:20985`). If `ana` is referenced ONLY by the removed Insights card (and not the relocated weekly-points tile), remove the state + fetch. If the weekly-points tile still reads `ana.kpis.weekly_points`, KEEP the fetch + state and only remove the adherence rows. Do not remove `/api/client/analytics` (it still feeds the home ticker + the disciplines Consistency bar — out of scope here).

- [ ] **Step 5: Build + verify**

Run the mobile build gate. In preview, confirm the Overall tab shows no bare adherence %, weekly points still appears, and the Weekends card renders in its place.

- [ ] **Step 6: Commit**

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
git commit -m "refactor(weekend-split): delete dead BSMeKpis + remove Insights adherence grid (no bare adherence %)"
```

---

## Task 7: Coach roster RPC + `/api/coach/roster-weekend`

**Files:**
- Create: `supabase-migrations/2026-06-27-roster-weekend-split.sql`
- Create: `src/app/api/coach/roster-weekend/route.ts`

**Interfaces:**
- Consumes: `computeWeekendSplit` (`src/lib/weekendSplit.ts`, Task 3); `client_profiles.timezone` (Task 1); the `subscriptions`/`trainers`/`nutritionists` coach-on-client predicate.
- Produces: `get_roster_weekend_split(uuid[])` returning per-client weekly buckets; `POST /api/coach/roster-weekend { clientIds } → { ok, split: { [clientId]: WeekendSplitResult } }`.

- [ ] **Step 1: Write the RPC migration**

Create `supabase-migrations/2026-06-27-roster-weekend-split.sql`. SECURITY DEFINER so it can read owner-only habit rows; an internal coach-on-client filter (mirroring `providers_read_subscriber_profiles`) ensures a coach only ever gets their own roster. It returns weekly per-side counts for nutrition + habits, bucketed Sat/Sun in each member's `client_profiles.timezone` (fallback UTC):

```sql
-- Batched weekday-vs-weekend buckets for a coach's roster. SECURITY DEFINER:
-- habit rows are owner-only under RLS, so we read them in a definer context but
-- gate every client through is-coach-on-client (active/trialing subscription
-- owned by the caller) — a coach can only ever see their own clients' buckets.
create or replace function public.get_roster_weekend_split(p_client_ids uuid[])
returns table (
  client_id uuid,
  dimension text,        -- 'nutrition' | 'habits'
  week_start date,
  weekday_num numeric,
  weekday_den numeric,
  weekend_num numeric,
  weekend_den numeric
)
language sql
security definer
set search_path = public
as $$
  with allowed as (
    select cid as client_id
    from unnest(p_client_ids) as cid
    where exists (
      select 1 from public.subscriptions s
      left join public.trainers t on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = cid
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  ),
  tz as (
    select a.client_id, coalesce(cp.timezone, 'UTC') as zone
    from allowed a
    left join public.client_profiles cp on cp.user_id = a.client_id
  ),
  win as (  -- per client, the local "today" and the 56-day floor
    select client_id, zone,
           (now() at time zone zone)::date as today_local
    from tz
  ),
  -- Clamp the window start to the member's FIRST observed activity (any snapshot
  -- or daily-habit completion) within the 56-day floor — mirrors the client
  -- bucket builder, so a brand-new account doesn't read empty days as a gap.
  activity as (
    select w.client_id, w.today_local,
      greatest(
        w.today_local - 55,
        least(
          coalesce((select min(d.snapshot_date) from public.daily_health_snapshot d
                    where d.user_id = w.client_id and d.snapshot_date > w.today_local - 56 and d.snapshot_date <= w.today_local), w.today_local),
          coalesce((select min(uhc.done_on) from public.user_habit_completions uhc
                    join public.user_habits uh on uh.id = uhc.habit_id and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday')
                    where uh.user_id = w.client_id and uhc.done_on > w.today_local - 56 and uhc.done_on <= w.today_local), w.today_local)
        )
      ) as start_local
    from win w
  ),
  days as (  -- expand each client's clamped window, one row per calendar day
    select a.client_id, gs::date as day
    from activity a, generate_series(a.start_local, a.today_local, interval '1 day') gs
  ),
  -- NUTRITION: denominator = every day in the (clamped) window; a day is "logged"
  -- when its snapshot protein clears the floor. Left join so no-snapshot days
  -- count as den+1/num+0 (a miss) — matching the client builder exactly.
  nut as (
    select dy.client_id, 'nutrition'::text as dimension,
           date_trunc('week', dy.day)::date as week_start,
           count(*) filter (where extract(isodow from dy.day) < 6) as weekday_den,
           count(*) filter (where extract(isodow from dy.day) < 6 and coalesce(d.protein_g,0) >= 10) as weekday_num,
           count(*) filter (where extract(isodow from dy.day) >= 6) as weekend_den,
           count(*) filter (where extract(isodow from dy.day) >= 6 and coalesce(d.protein_g,0) >= 10) as weekend_num
    from days dy
    left join public.daily_health_snapshot d on d.user_id = dy.client_id and d.snapshot_date = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  ),
  -- HABITS: daily-cadence habits only; scheduled = every day in window × #daily habits
  daily_habits as (
    select a.client_id, count(*) as n_daily
    from activity a
    join public.user_habits h on h.user_id = a.client_id and lower(coalesce(h.cadence,'daily')) in ('daily','everyday')
    group by a.client_id
  ),
  hab as (
    select dy.client_id, 'habits'::text as dimension,
           date_trunc('week', dy.day)::date as week_start,
           sum(case when extract(isodow from dy.day) < 6 then dh.n_daily else 0 end) as weekday_den,
           sum(case when extract(isodow from dy.day) < 6 then coalesce(c.done,0) else 0 end) as weekday_num,
           sum(case when extract(isodow from dy.day) >= 6 then dh.n_daily else 0 end) as weekend_den,
           sum(case when extract(isodow from dy.day) >= 6 then coalesce(c.done,0) else 0 end) as weekend_num
    from days dy
    join daily_habits dh on dh.client_id = dy.client_id
    left join (
      select uh.user_id, uhc.done_on, count(*) as done
      from public.user_habit_completions uhc
      join public.user_habits uh on uh.id = uhc.habit_id and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday')
      group by uh.user_id, uhc.done_on
    ) c on c.user_id = dy.client_id and c.done_on = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  )
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from nut
  union all
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from hab;
$$;

revoke all on function public.get_roster_weekend_split(uuid[]) from public;
grant execute on function public.get_roster_weekend_split(uuid[]) to authenticated;
```

- [ ] **Step 2: Post the migration link + verify**

Post the `raw.githubusercontent.com/.../2026-06-27-roster-weekend-split.sql` link. After the owner runs it, verify via Supabase MCP: `select proname, prosecdef from pg_proc where proname='get_roster_weekend_split';` → expect 1 row, `prosecdef = true`.

- [ ] **Step 3: Write the coach route**

Create `src/app/api/coach/roster-weekend/route.ts`:

```typescript
// Batched weekday-vs-weekend split for a coach's roster. One RPC (set-based,
// owner-gated, SECURITY DEFINER) returns weekly buckets per client; we run the
// pure twin per client so the statistics live in exactly one place.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { computeWeekendSplit, type WeeklyBucket } from '@/lib/weekendSplit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = {
  client_id: string; dimension: 'nutrition' | 'habits'; week_start: string;
  weekday_num: number; weekday_den: number; weekend_num: number; weekend_den: number;
};

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await readJson<{ clientIds?: unknown }>(request, { allowEmpty: true });
  if (!body.ok) return body.response;
  const ids = Array.isArray(body.data?.clientIds)
    ? [...new Set((body.data!.clientIds as unknown[]).map(String).filter(Boolean))].slice(0, 200)
    : [];
  if (!ids.length) return NextResponse.json({ ok: true, split: {} });

  const supabase = await clientForRequest(request);
  const { data, error } = await supabase.rpc('get_roster_weekend_split', { p_client_ids: ids });
  if (error) return NextResponse.json({ ok: true, split: {} }); // degrade quietly; never block the roster

  const byClient = new Map<string, { nutrition: WeeklyBucket[]; habits: WeeklyBucket[] }>();
  for (const r of (data || []) as Row[]) {
    const e = byClient.get(r.client_id) || { nutrition: [], habits: [] };
    e[r.dimension].push({
      weekStart: r.week_start,
      weekdayNum: Number(r.weekday_num) || 0, weekdayDen: Number(r.weekday_den) || 0,
      weekendNum: Number(r.weekend_num) || 0, weekendDen: Number(r.weekend_den) || 0,
    });
    byClient.set(r.client_id, e);
  }

  const split: Record<string, ReturnType<typeof computeWeekendSplit>> = {};
  for (const id of ids) {
    const buckets = byClient.get(id) || { nutrition: [], habits: [] };
    split[id] = computeWeekendSplit(buckets);
  }
  return NextResponse.json({ ok: true, split });
}
```

- [ ] **Step 4: Typecheck**

Run from repo root: `rm -f .next/types/validator.ts && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase-migrations/2026-06-27-roster-weekend-split.sql src/app/api/coach/roster-weekend/route.ts
git commit -m "feat(weekend-split): coach roster RPC + /api/coach/roster-weekend"
```

---

## Task 8: Coach roster chip + client-detail "Weekend pattern" plate

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx`
- Modify: `mobile-app/src/services/shapeBackend.js` (add `window.ShapeRosterWeekend.get(clientIds)`)

**Interfaces:**
- Consumes: `POST /api/coach/roster-weekend` (Task 7); `useBSProRoster` (`pros:1495`); roster row render (`pros:1654`); client-detail page (`pros:2564`); Manage actions (`ShapeCoachCommit.propose`, reminders).
- Produces: a `WKND −N` chip on flagged roster rows; a "Weekend pattern" `BSPlate` on the client-detail page.

- [ ] **Step 1: Add the coach batch getter**

In `shapeBackend.js`:

```javascript
// Authenticated POST (postProConsole pattern); degrade to an empty split so the
// roster never blocks on this.
async function rosterWeekendGet(clientIds) {
  const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : [];
  if (!ids.length || !apiBaseUrl || !state.session?.access_token) return { ok: true, split: {} };
  try {
    const res = await fetch(`${apiBaseUrl}/api/coach/roster-weekend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify({ clientIds: ids }),
    });
    return res.ok ? await res.json() : { ok: true, split: {} };
  } catch { return { ok: true, split: {} }; }
}
window.ShapeRosterWeekend = { get: rosterWeekendGet };
```

- [ ] **Step 2: Fetch the batch in the roster hook**

In `useBSProRoster` (`pros:1495–1512`), after the live roster rows are known, fire one `window.ShapeRosterWeekend.get(rows.map(r => r.uid))` and stash the result in state keyed by client id. Merge each client's `split` onto its row as `row._wknd`.

- [ ] **Step 3: Render the chip on flagged rows**

In the roster row render (`pros:1654–1679`), where the right-aligned label pill is drawn, add — only when `row._wknd?.status === 'ok'` and `row._wknd.worstDimension` is set and that dimension is `flagged` and tz is known (the RPC already suppresses unknown-tz by bucketing in UTC; gate on a real gap):

```javascript
{row._wknd?.worstDimension && row._wknd.dimensions[row._wknd.worstDimension]?.flagged && (
  <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', color: t.RUST, border: `1px solid ${bsTHexA(t.RUST, 0.4)}`, borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>
    WKND −{Math.abs(Math.round(row._wknd.dimensions[row._wknd.worstDimension].gapPp))}
  </span>
)}
```

(Match the existing label-pill styling helpers in the file, e.g. `bsTHexA`.)

- [ ] **Step 4: Add the client-detail Weekend-pattern plate**

In `BSProClientFullProfilePage` (`pros:2564+`), fetch this client's split once (`window.ShapeRosterWeekend.get([clientUid])`) into state, resetting per-client (match the care-team `ignore`-flag pattern at `:2598–2613`). Render a `BSPlate` in the Manage tab (near the commitment form `:3157`) when `status === 'ok'`:

```javascript
function ProWeekendPlate({ split }) {
  const t = useBS();
  const BSPlate = window.BSPlate;
  if (!split || split.status !== 'ok') return null;
  const dims = split.dimensions || {};
  const present = ['nutrition', 'habits'].map((k) => [k, dims[k]]).filter(([, d]) => d);
  if (!present.length) return null;
  const worst = split.worstDimension;
  const move = worst === 'nutrition'
    ? 'Set a weekend check-in or a lighter weekend nutrition target.'
    : worst === 'habits'
      ? 'Add a weekend-specific habit reminder.'
      : 'Set one weekend anchor habit.';
  return (
    <BSPlate c={'#c0533b'} spine={3}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70 }}>WEEKEND PATTERN</div>
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        {present.map(([k, d]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontFamily: t.MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: t.INK }}>
            <span>{k === 'nutrition' ? 'Nutrition' : 'Habits'}</span>
            <span style={{ color: d.flagged ? t.RUST : t.INK70 }}>wk {Math.round(d.weekdayRate * 100)}% · we {Math.round(d.weekendRate * 100)}% · −{Math.abs(Math.round(d.gapPp))}</span>
          </div>
        ))}
      </div>
      {worst && <div style={{ fontSize: 12, color: t.INK70, marginTop: 8 }}>{move}</div>}
    </BSPlate>
  );
}
```

Frame it as evidence + a move, not a verdict. (Wire the CTA to the existing Manage actions if a one-tap path exists; otherwise the directive text is sufficient for v1.)

- [ ] **Step 5: Build + verify + commit**

Run the mobile build gate. Verify the chip appears only on flagged clients and the plate renders for a seeded client. Then:

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx mobile-app/src/services/shapeBackend.js public/m
git commit -m "feat(weekend-split): coach roster chip + client-detail weekend-pattern plate"
```

---

## Task 9: Full verification + PR

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all pass, including `tests/weekend-split.test.mjs`.

- [ ] **Step 2: Typecheck from repo root**

Run: `rm -f .next/types/validator.ts && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Parse-check changed JSX**

From `mobile-app/`:
```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetPros.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Expected: no output (valid).

- [ ] **Step 4: Confirm `public/m` sync**

From `mobile-app/`: `VITE_BASE='/m/' npm run build`; from repo root: `rm -rf public/m && cp -r mobile-app/dist public/m && diff -rq mobile-app/dist public/m`
Expected: no diff output.

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/weekend-adherence-split
```
Open a PR (GitHub REST API per repo convention) titled "Weekend-vs-weekday adherence split (v1: nutrition + habits) + Progress-hub simplification". Body: link the spec, summarize the surfaces, note the two migrations the owner must run (`client-timezone`, `roster-weekend-split`), and list the deferred fast-follows (training dimension, baseline guard, full web layout port). Wait for required CI checks (`Web (typecheck + build)`, `Mobile (build + public/m sync)`, `Secret scan (gitleaks)`) to go green before requesting merge.

---

## Self-Review

**Spec coverage:**
- §4 pure module → Task 2 ✓ (constants, compute, flag gate, composite display-only, worstDimension by lower-CI). §4 self bucket builder → Task 2 Step 7 ✓.
- §5 nutrition meaningful-food floor → Task 2 (`NUTRITION_PROTEIN_FLOOR_G`) ✓; habits daily-cadence only → Task 2 + Task 7 ✓; training null → Global Constraints + module ✓.
- §6 member card + states → Task 5 ✓; no bespoke self endpoint → Task 4 (client-side over cached) ✓; no Home lever → omitted (correct) ✓.
- §7 coach RPC + chip + plate + directive → Tasks 7, 8 ✓; SECURITY DEFINER + is-coach-on-client → Task 7 ✓.
- §8 `client_profiles.timezone` + capture + backfill + chip suppression → Task 1 + Task 8 ✓.
- §9 delete BSMeKpis + drop Insights + keep both PR cards + converge/no-bare-adherence → Task 6 ✓ (full layout port deferred, noted).
- §10 fast-follows → out of scope, listed in PR body ✓.
- §12 tests → Task 2 (unit), Task 9 (build loop) ✓; twin convention (no runnable parity test) → Task 3 ✓.

**Placeholder scan:** No "TBD"/"handle edge cases" without code. UI tasks carry concrete component code with real anchors; theme-token/BSPlate-prop adjustments are explicitly flagged as "match the neighboring usage" (a real constraint, not a placeholder).

**Type consistency:** `computeWeekendSplit`/`buildSelfWeekendBuckets`/`WeeklyBucket`/`DimResult`/`WeekendSplitResult` names match across Tasks 2, 3, 4, 7. RPC column names (`weekday_num`…) match the route's `Row` type and the `WeeklyBucket` mapping. `window.ShapeProgress.weekendSplit` (Task 4) is the exact name consumed in Task 5; `window.ShapeRosterWeekend.get` (Task 8 Step 1) matches its consumers in Steps 2/4.

**Adversarial verification pass (defects caught + already fixed in this plan):**
- `postJsonOrDefault` does not exist in `shapeBackend.js` → both writers now use the authenticated inline-`fetch` pattern (matches `postProConsole`).
- `/api/client/habits` returns each habit's dates as `history`, not `completions` → bucket builder + tests corrected.
- `BSPlate`'s color prop is `c` (not `accent`) and it's read from `window.BSPlate` → card + plate corrected.
- `buildSelfWeekendBuckets`/SQL parity bug (snapshot-row vs all-day nutrition denominator) and the new-account false-gap → both fixed (clamped, day-based denominators in JS *and* SQL); regression tests added.
- `local-day.ts` cross-package import avoided entirely (Task 4 derives `todayLocal` via `toLocaleDateString('en-CA')`).
- `client_profiles` upsert verified safe: PK on `user_id`, `data` defaults to `'{}'`, insert+update RLS policies + an `updated_at` trigger all exist.

**Remaining soft spots for the implementer (real, not placeholders):** match `BSPlate`'s other props (`notch`/`tick`/`spine`) and exact theme-token names to a neighboring plate; the `ana`-removal in Task 6 Step 4 is conditional on the weekly-points relocation; the SQL `protein_g >= 10` floor is hardcoded to mirror `NUTRITION_PROTEIN_FLOOR_G` (keep them in sync if the constant changes); the JS clamp uses protein-series days while SQL uses any-snapshot days for the window-start edge (a few-day difference only for members whose earliest in-window snapshot has null protein — acceptable).
