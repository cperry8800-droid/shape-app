# Sleep Logging Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold daily sleep into the *How are you · today* check-in card (device-first), fix the dead sleep directive, surface the sleep efficiency + heart metrics we already store, and give the coach the objective sleep the client logs/syncs.

**Architecture:** All sleep lands on the existing `daily_health_snapshot` row (one per user per local day). The check-in card writes `sleep_hours` + a new `sleep_quality` (1–10) through the existing `/api/client/checkin` partial-upsert; wearables already write `sleep_hours`/`sleep_efficiency_pct`/`resting_hr`/`hrv_ms`. The mobile signal engine starts reading real sleep so its directive fires; the progress route + a coach `shared-overview` readout expose the objective numbers.

**Tech Stack:** Supabase Postgres (one column migration); Next.js 16 App Router routes (TS); React broadsheet JSX (babel-standalone, mobile + newdesign web); Node ESM pure modules + `node --test`.

## Global Constraints

- **Branch:** all work on `feat/sleep-logging-redesign` (already created off `origin/main`).
- **Stale-base rule:** before ANY edit run `git fetch origin main && git rev-parse --short HEAD origin/main`; if drifted, `git reset --hard origin/main` first.
- **One migration only:** `daily_health_snapshot.sleep_quality smallint` with a `1..10` CHECK. Owner runs it; everything must no-op gracefully until applied (the routes already `select('*')`, which is PostgREST-migration-safe).
- **Tier 1 scope.** OUT OF SCOPE (do NOT build): sleep stages (deep/REM/light), bed/wake times, latency, respiratory rate; a canonical recovery-readiness score; a coach sleep-triage rule. These are a documented fast-follow.
- **Theme tokens only** on mobile (`const t = useBS()`; `t.INK/PAPER/RULE/HAIR/MONO/DISPLAY/INK50/INK70/BLUE/ACCENT`). No hardcoded ink/paper.
- **Honest data:** every sleep readout is a real value or `—` with a sub-label; no fabricated sleep on a signed-in account; signed-out preview never claims a persisted log.
- **Verify before commit:** parse-check changed JSX (`node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`); `npx tsc --noEmit` for TS; `npm test`; mobile build from `mobile-app/` (`$env:VITE_BASE='/m/'; npm run build` in PowerShell) then republish `public/m` and confirm in sync; bump `?v=` on any edited `newdesign/*.jsx`.

---

### Task 1: Migration — `sleep_quality` column

**Files:**
- Create: `supabase-migrations/2026-06-26-sleep-quality.sql`

**Interfaces:**
- Produces: a nullable `daily_health_snapshot.sleep_quality smallint` (1–10) that Task 2 writes and Task 4 reads.

- [ ] **Step 1: Write the migration**

```sql
-- Daily subjective "rested" rating (1-10) for the home check-in card's sleep
-- section. Manual-only (no device provides it), so it is NOT added to the
-- multi-source reconcile set. Idempotent; nullable so existing rows are fine.

alter table public.daily_health_snapshot
  add column if not exists sleep_quality smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_health_snapshot_sleep_quality_range'
  ) then
    alter table public.daily_health_snapshot
      add constraint daily_health_snapshot_sleep_quality_range
      check (sleep_quality is null or (sleep_quality >= 1 and sleep_quality <= 10)) not valid;
  end if;
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase-migrations/2026-06-26-sleep-quality.sql
git commit -m "feat: daily_health_snapshot.sleep_quality column (1-10 rested rating)"
```

Note: the owner runs this on Supabase; the rest of the plan no-ops until then.

---

### Task 2: Check-in route — accept `sleepHours` + `sleepQuality`

**Files:**
- Modify: `src/app/api/client/checkin/route.ts`

**Interfaces:**
- Consumes: the request body may now include `sleepHours` (number, hours) and `sleepQuality` (1–10).
- Produces: writes `sleep_hours` + `sleep_quality` onto today's snapshot row via the existing partial upsert; returns them in the JSON.

- [ ] **Step 1: Add a sleep-hours validator next to `clamp1to10`**

In `src/app/api/client/checkin/route.ts`, after the existing `clamp1to10` function, add:

```ts
// Sleep duration is continuous (not a 1-10 rating). Accept a JSON number in
// (0, 24]; anything else (null/string/boolean/out-of-range) → absent.
function sleepHoursOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 24) return null;
  return Math.round(v * 100) / 100;
}
```

- [ ] **Step 2: Read + write the sleep fields in `POST`**

Where the route currently derives `mood/energy/hunger/stress/soreness`, add:

```ts
  const sleepHours = sleepHoursOrNull((body as Record<string, unknown>).sleepHours);
  const sleepQuality = clamp1to10((body as Record<string, unknown>).sleepQuality);
```

Add to the "nothing to log" guard so a sleep-only submit is valid:

```ts
  if (mood == null && energy == null && hunger == null && stress == null && soreness == null && sleepHours == null && sleepQuality == null) {
    return NextResponse.json({ error: 'Nothing to log.' }, { status: 400 });
  }
```

In the patch object (only-write-present-fields), add:

```ts
  if (sleepHours != null) patch.sleep_hours = sleepHours;
  if (sleepQuality != null) patch.sleep_quality = sleepQuality;
```

And include them in the success response: `return NextResponse.json({ ok: true, mood, energy, hunger, sleepHours, sleepQuality });`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (no new errors in `checkin/route.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/client/checkin/route.ts
git commit -m "feat: check-in route accepts sleep hours + 1-10 quality"
```

Note: `sleep_quality` writes no-op gracefully until Task 1's migration is applied (PostgREST ignores the column on an unmigrated DB only if absent — verify in staging that an unmigrated write of `sleep_quality` does not 400 the whole upsert; if it does, the route already uses `select('*')` on reads, and the patch should drop `sleep_quality` when the column is missing — but since the owner applies Task 1 before this ships, this is the expected order).

---

### Task 3: `shapeBackend.logCheckin` — forward the sleep fields

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (`logCheckin`, ~line 3308)

**Interfaces:**
- Consumes: callers pass `{ energy, hunger, sleepHours, sleepQuality }`.
- Produces: POSTs them to `/api/client/checkin`; returns the parsed JSON (throws on non-OK — already does).

- [ ] **Step 1: Widen the signature + body**

Change `logCheckin` from:

```js
async function logCheckin({ mood, energy, hunger, stress, soreness } = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/client/checkin`, {
    method: 'POST', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mood, energy, hunger, stress, soreness, date: _localDate() }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save check-in.');
  invalidateClientMetrics();
  return d;
}
```

to (add `sleepHours`, `sleepQuality`):

```js
async function logCheckin({ mood, energy, hunger, stress, soreness, sleepHours, sleepQuality } = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/client/checkin`, {
    method: 'POST', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mood, energy, hunger, stress, soreness, sleepHours, sleepQuality, date: _localDate() }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save check-in.');
  invalidateClientMetrics();
  return d;
}
```

- [ ] **Step 2: Parse-check + commit**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/services/shapeBackend.js','utf8'),{sourceType:'module',plugins:['jsx']})"`
Expected: no output (parses).

```bash
git add mobile-app/src/services/shapeBackend.js
git commit -m "feat: ShapeCheckin.log forwards sleep hours + quality"
```

---

### Task 4: Progress route — surface latest efficiency / RHR / HRV + a `sleep_quality` series

**Files:**
- Modify: `src/app/api/client/progress/route.ts`

**Interfaces:**
- Consumes: existing `seriesFor(...)` + `snaps`.
- Produces: `series.sleepQuality` (dated points) and `kpis.sleepEfficiency`, `kpis.hrvLatest`, plus `kpis.sleepLatest` (today/most-recent sleep hours) — the single read-source for the card (Task 6) and the coach (Task 7).

- [ ] **Step 1: Add the series + KPIs**

In `src/app/api/client/progress/route.ts`, the `seriesFor` union already includes `'hrv_ms'` and `'resting_hr'`. Add `'sleep_efficiency_pct'` and `'sleep_quality'` to the `seriesFor` key union type, then near the other `seriesFor` calls:

```ts
  const sleepEfficiencySeries = seriesFor('sleep_efficiency_pct');
  const sleepQualitySeries = seriesFor('sleep_quality');
```

In the `kpis` object add (reuse the existing `sleeps`/`restingHrs`/`hrvSeries`):

```ts
    sleepLatest: sleepSeries.length ? sleepSeries[sleepSeries.length - 1].value : null,
    sleepEfficiency: sleepEfficiencySeries.length ? Math.round(sleepEfficiencySeries[sleepEfficiencySeries.length - 1].value) : null,
    hrvLatest: hrvSeries.length ? Math.round(hrvSeries[hrvSeries.length - 1].value) : null,
```

In the returned `series` object add `sleepQuality: sleepQualitySeries` (alongside the existing series). Confirm the response already returns `series.sleep` (it returns `sleepSeries` — keep its existing key name; do NOT rename).

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add src/app/api/client/progress/route.ts
git commit -m "feat: progress route exposes sleep efficiency/HRV/quality + latest sleep"
```

---

### Task 5: Engine — light up the sleep directive for real users (pure helper + wiring)

**Files:**
- Modify: `mobile-app/src/services/signalsMap.mjs` (add a pure `sleepRecoveryFromProgress`)
- Modify: `mobile-app/src/services/shapeSignals.js` (`selfRecord`, lines 45-67)
- Test: `tests/sleep-recovery.test.mjs`

**Interfaces:**
- Produces: `sleepRecoveryFromProgress(progress) -> { sleepHours: { avg7, lastNight, target } } | null` — consumed by `selfRecord` and forwarded (already) by `recordFromSelfData` into `rec.recovery`, which `dashSignals.js recoveryRead` reads.

- [ ] **Step 1: Write the failing test**

Create `tests/sleep-recovery.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sleepRecoveryFromProgress } from '../mobile-app/src/services/signalsMap.mjs';

test('null/empty progress → null (no fabricated recovery)', () => {
  assert.equal(sleepRecoveryFromProgress(null), null);
  assert.equal(sleepRecoveryFromProgress({ series: {} }), null);
  assert.equal(sleepRecoveryFromProgress({ series: { sleep: [] } }), null);
});

test('builds avg7 + lastNight from the sleep series', () => {
  const series = { sleep: [
    { date: '2026-06-20', value: 6 }, { date: '2026-06-21', value: 7 },
    { date: '2026-06-22', value: 6.5 }, { date: '2026-06-23', value: 8 },
    { date: '2026-06-24', value: 6 }, { date: '2026-06-25', value: 7 },
    { date: '2026-06-26', value: 5.5 },
  ] };
  const r = sleepRecoveryFromProgress({ series });
  assert.equal(r.sleepHours.lastNight, 5.5);                 // most recent point
  assert.equal(Math.round(r.sleepHours.avg7 * 10) / 10, 6.6); // mean of the last 7
  assert.equal(r.sleepHours.target, 7.5);
});

test('fewer than 7 points still averages what exists', () => {
  const r = sleepRecoveryFromProgress({ series: { sleep: [{ date: '2026-06-25', value: 6 }, { date: '2026-06-26', value: 8 }] } });
  assert.equal(r.sleepHours.lastNight, 8);
  assert.equal(r.sleepHours.avg7, 7);
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `node --test tests/sleep-recovery.test.mjs`
Expected: FAIL — `sleepRecoveryFromProgress` is not exported.

- [ ] **Step 3: Implement the pure helper**

In `mobile-app/src/services/signalsMap.mjs`, add + export:

```js
// Build the engine's recovery.sleepHours from the progress rollup's sleep series
// (the same `series.sleep` the progress route returns). null when there is no
// real sleep data — never fabricated. Target is the engine default (7.5h).
export function sleepRecoveryFromProgress(progress) {
  const pts = (progress && progress.series && Array.isArray(progress.series.sleep)) ? progress.series.sleep : [];
  const vals = pts.map((p) => Number(p && p.value)).filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  const lastNight = vals[vals.length - 1];
  const last7 = vals.slice(-7);
  const avg7 = last7.reduce((a, b) => a + b, 0) / last7.length;
  return { sleepHours: { avg7, lastNight, target: 7.5 } };
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `node --test tests/sleep-recovery.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into `selfRecord`**

In `mobile-app/src/services/shapeSignals.js`: add `window.ShapeProgress.progress()` to the `Promise.all` and import the helper, then replace line 65.

Add to the top imports of the file: `import { recordFromSelfData, sleepRecoveryFromProgress } from './signalsMap.mjs';` (extend the existing import — do NOT duplicate it).

Add a 7th promise to the `Promise.all` at line 49-56:

```js
    SP && SP.progress ? SP.progress().catch(() => null) : null,
```

and add `progress` to the destructured array: `const [nutrition, train, weighIns, goalsDoc, checkins, prog, progress] = await Promise.all([...]);`

Replace line 65:

```js
  // Real sleep drives the engine's recovery lever for signed-in members
  // (signed-out keeps the demo seed so the preview still shows the lever).
  const recovery = signedIn
    ? sleepRecoveryFromProgress(progress)
    : { sleepHours: { avg7: 6.2, lastNight: null, target: 7.5 } };
```

- [ ] **Step 6: Run the full suite + parse-check + commit**

Run: `npm test` → all pass (incl. the new file).
Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/services/shapeSignals.js','utf8'),{sourceType:'module',plugins:['jsx']})"` → parses.

```bash
git add mobile-app/src/services/signalsMap.mjs mobile-app/src/services/shapeSignals.js tests/sleep-recovery.test.mjs
git commit -m "fix: wire real sleep into selfRecord so the sleep directive fires for real members"
```

---

### Task 6: Mobile card — Sleep section (device-first) + retire `BSSleepSheet`

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSDailyCheckinCard` ~14882; `BSSleepSheet` ~14483-14516; the `todayDirective` sleep lever ~2348 + `setSleepSheet` wiring ~2364)

**Interfaces:**
- Consumes: `window.ShapeProgress.progress()` → `series.sleep` (hours), `series.sleepQuality`, `kpis.sleepEfficiency`, `kpis.restingHr` (already), `kpis.hrvLatest`; `window.ShapeCheckin.log({ energy, hunger, sleepHours, sleepQuality })`.

- [ ] **Step 1: Add Sleep state + today's read-back to `BSDailyCheckinCard`**

Inside `BSDailyCheckinCard`, alongside the existing `energy`/`hunger` state, add:

```jsx
  const [sleepHours, setSleepHours] = useStateBSC(null);   // today's logged/synced hours (number)
  const [rested, setRested] = useStateBSC(null);           // today's 1-10 rested rating
  const [sleepMeta, setSleepMeta] = useStateBSC(null);     // { efficiency, rhr, hrv } from a wearable, when present
```

In the existing once-a-day hydrate effect (the one reading `p.series.energy`/`hunger`), also read today's sleep:

```jsx
      const sToday = (p.series.sleep || []).find((s) => s.date === todayIso);
      const qToday = (p.series.sleepQuality || []).find((s) => s.date === todayIso);
      if (sToday) setSleepHours(Number(sToday.value));
      if (qToday) setRested(Math.round(Number(qToday.value)));
      // efficiency/RHR/HRV are "latest" KPIs — only show them as a today readout when sleep synced today.
      if (sToday && p.kpis) setSleepMeta({ efficiency: p.kpis.sleepEfficiency ?? null, rhr: p.kpis.restingHr ?? null, hrv: p.kpis.hrvLatest ?? null });
```

- [ ] **Step 2: Render the Sleep section (device-first hours + always-on rested)**

Below the `Hunger` `Row` in the form branch, add a Sleep block. Hours: read-only review when `sleepHours != null`, else a manual input + the quick chips. Rested: always a 1-10 `Row` (reuse the existing `Row` sub-component) using `t.BLUE` as the recovery accent:

```jsx
          {/* SLEEP — device-first hours + an always-on 1-10 rested rating */}
          <div style={{ marginTop: 7, paddingTop: 8, borderTop: `1px solid ${t.HAIR}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>Sleep · last night</span>
              {sleepHours != null && <span style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.BLUE }}>{Math.floor(sleepHours)}h {Math.round((sleepHours % 1) * 60)}m</span>}
            </div>
            {sleepHours != null ? (
              // synced or already-logged → read-only recovery snapshot
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.INK50 }}>
                {sleepMeta && sleepMeta.efficiency != null ? `${sleepMeta.efficiency}% efficient` : null}
                {sleepMeta && sleepMeta.rhr != null ? `${sleepMeta.efficiency != null ? ' · ' : ''}RHR ${sleepMeta.rhr}` : null}
                {sleepMeta && sleepMeta.hrv != null ? ` · HRV ${sleepMeta.hrv}` : null}
                {(!sleepMeta || (sleepMeta.efficiency == null && sleepMeta.rhr == null && sleepMeta.hrv == null)) ? 'Logged' : null}
              </div>
            ) : (
              // nothing synced → manual hours: chips
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[6, 6.5, 7, 7.5, 8, 8.5].map((h) => (
                  <button key={h} onClick={() => setSleepHours(h)} style={{ flex: 1, minWidth: 44, borderRadius: 5, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', padding: '8px 0', fontFamily: t.MONO, fontSize: 10, fontWeight: 700 }}>{h}</button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Row label="Rested" val={rested} set={setRested} c={t.BLUE} />
            </div>
          </div>
```

- [ ] **Step 3: Save sleep with the check-in (await + rollback)**

Update `doLog` so the card's primary action persists energy/hunger AND sleep together, awaiting the write and rolling back on failure (extend the existing `doLog`, do not add a second button):

```jsx
  const doLog = async () => {
    if (energy == null && hunger == null && sleepHours == null && rested == null || saving) return;
    if (!signedIn) { window.__bsToast?.('Join Shape to save your check-in', 'ok'); return; }
    setSaving(true);
    try {
      await window.ShapeCheckin?.log?.({ energy, hunger, sleepHours, sleepQuality: rested });
      setLogged(true); setEditing(false);
    } catch (e) {
      window.__bsToast?.('Could not save check-in — try again', 'err');
    } finally { setSaving(false); }
  };
```

(Enable the button when any of energy/hunger/sleepHours/rested is set — update the existing `disabled={...}` expression to include `sleepHours == null && rested == null`.)

- [ ] **Step 4: Retire `BSSleepSheet` + the standalone directive sheet**

- Delete the `BSSleepSheet` component (`~14483-14516`) and its render (`<BSSleepSheet ... />` near `2364`) and the `setSleepSheet` state.
- In `todayDirective` (`~2348`), change the `sleep` lever's CTA from `() => setSleepSheet(true)` to scroll the check-in card into view: `() => { try { document.querySelector('[data-bs-checkin]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }`, and add `data-bs-checkin` to the `BSDailyCheckinCard` root `<div>`. Align the directive head copy with the engine reason (use the engine's `dir.reason`/`dir.verdict` if available, else keep "Log last night's sleep.").

- [ ] **Step 5: Parse-check + build + preview + commit**

Run the JSX parse-check on `iosAppBroadsheetClient.jsx` → parses.
Build mobile (`$env:VITE_BASE='/m/'; npm run build` from `mobile-app/`), republish `public/m`, confirm in sync.
Preview (headless): the card shows the manual hours chips + Rested row when no sleep synced; logging persists; with a seeded synced value it shows the read-only `Xh Ym · NN% efficient · RHR · HRV` snapshot; the home sleep directive's CTA scrolls to the card.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
git commit -m "feat: sleep folded into the daily check-in card (device-first); retire BSSleepSheet"
```

---

### Task 7: Coach — objective sleep on the client profile

**Files:**
- Modify: `src/app/api/clients/[id]/shared-overview/route.ts`
- Modify: `public/newdesign/coachClientDetail.jsx` (+ `?v=` bump on `TrainerClient.html`, `NutritionistClient.html`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx`

**Interfaces:**
- Consumes: the coach-readable `daily_health_snapshot` for the client (already share-gated by `is_coach_on_client` in the route's data path).
- Produces: `overview.sleep = { latest, avg7, series7, efficiency, rhr, hrv }` consumed by both coach UIs.

- [ ] **Step 1: Return objective sleep from `shared-overview`**

In `src/app/api/clients/[id]/shared-overview/route.ts`, alongside the existing coach reads, fetch the client's recent snapshot sleep (last ~14 rows) and build:

```ts
  // Objective sleep for the coach (share-gated like the other reads).
  const { data: snapRows } = await supabase
    .from('daily_health_snapshot')
    .select('snapshot_date, sleep_hours, sleep_efficiency_pct, resting_hr, hrv_ms')
    .eq('user_id', clientId)
    .order('snapshot_date', { ascending: true })
    .limit(30);
  const sl = (snapRows ?? []).filter((r) => (r as Record<string, unknown>).sleep_hours != null)
    .map((r) => ({ date: (r as Record<string, string>).snapshot_date, value: Number((r as Record<string, unknown>).sleep_hours) }));
  const last = (snapRows ?? [])[(snapRows ?? []).length - 1] as Record<string, unknown> | undefined;
  const last7 = sl.slice(-7).map((p) => p.value);
  const sleep = sl.length ? {
    latest: sl[sl.length - 1].value,
    avg7: last7.length ? Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 10) / 10 : null,
    series7: sl.slice(-7),
    efficiency: last && last.sleep_efficiency_pct != null ? Math.round(Number(last.sleep_efficiency_pct)) : null,
    rhr: last && last.resting_hr != null ? Math.round(Number(last.resting_hr)) : null,
    hrv: last && last.hrv_ms != null ? Math.round(Number(last.hrv_ms)) : null,
  } : null;
```

Add `sleep` to the returned JSON object. (Use the same coach-scoped `supabase` client the route already uses for its share-gated reads; if the route reads via an RPC rather than direct table access, mirror that path. The route is already gated by `is_coach_on_client` — do not add a second gate.)

Run `npx tsc --noEmit` → exit 0. Commit:

```bash
git add src/app/api/clients/[id]/shared-overview/route.ts
git commit -m "feat: shared-overview returns the client's objective sleep (hours+trend+eff/rhr/hrv)"
```

- [ ] **Step 2: Web coach readout (`coachClientDetail.jsx`)**

Near the existing check-in 1–10 grid (`~264-275`), render a compact **Sleep · recovery** block when `data.sleep` is present: latest hours + 7-day avg + a tiny sparkline of `series7` (reuse the page's existing mini-chart/sparkline pattern) + `efficiency% · RHR · HRV`. Honest `—` when a field is null. Bump `?v=` on `TrainerClient.html` and `NutritionistClient.html`.

Parse-check the jsx; commit:

```bash
git add public/newdesign/coachClientDetail.jsx public/newdesign/TrainerClient.html public/newdesign/NutritionistClient.html
git commit -m "feat: coach web client page shows objective sleep + recovery"
```

- [ ] **Step 3: Mobile coach readout (`iosAppBroadsheetPros.jsx`)**

Near the existing check-in 6-up grid (`~2932`), render the same **Sleep · recovery** readout from `ShapeClientKit`/the shared-overview `sleep` object (latest hours · 7d avg · efficiency · RHR · HRV), theme-token styled, honest `—` for nulls. Parse-check, build, republish `public/m`, confirm in sync. Commit:

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx public/m
git commit -m "feat: coach mobile client profile shows objective sleep + recovery"
```

---

## Self-Review

**Spec coverage:**
- §A device-first card → Task 6. §B schema + write path + await/rollback → Tasks 1-3, 6. §C engine fix → Task 5. §D efficiency/HRM surface → Tasks 4, 6, 7. §E coach → Task 7. ✓
- Retire `BSSleepSheet` + directive CTA → Task 6 Step 4. ✓
- Out-of-scope (stages/score/triage) → not built. ✓

**Placeholder scan:** every code step shows real code; the only "describe, don't show" is Task 7 Steps 2-3 sparkline rendering, which reuses an existing page pattern — the implementer must read `coachClientDetail.jsx`'s existing chart helper (`DprChart`/equivalent) and the pros card style and follow it (acceptable: it's "follow the established pattern", not an invented API).

**Type consistency:** `sleepHours`/`sleepQuality` body fields (Task 2) match `logCheckin`'s args (Task 3) and the card's `ShapeCheckin.log` call (Task 6). `series.sleep`/`series.sleepQuality`/`kpis.sleepEfficiency`/`kpis.restingHr`/`kpis.hrvLatest` (Task 4) match the card's reads (Task 6). `sleepRecoveryFromProgress` shape `{ sleepHours: { avg7, lastNight, target } }` (Task 5) matches what `dashSignals.js recoveryRead` reads. ✓

**One ordering note for the executor:** apply Task 1's migration (owner) before Task 2 ships to staging, so a `sleep_quality` write doesn't risk a PostgREST column error on the upsert.
