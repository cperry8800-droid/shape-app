# Pace bars · The Splits page · split zones · THIS TIER zoomed ladder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Session Details pace as a per-split, zone-colored bar chart with a max-depth "The Splits" detail page over real provider laps, and redraw the Shape Score THIS TIER view as the zoomed ladder with an unmissable segmented toggle.

**Architecture:** A new pure module `paceSplits.mjs` owns all split normalization + session-relative zone classification (unit-tested like `scoreStanding.mjs`). The broadsheet consumes it in two new render components (bar chart + splits page). The Strava sync grows one detail fetch to populate `rawMetrics.splits`. The tier chart reuses the ladder's existing SVG grammar zoomed to one segment; the toggle becomes a segmented control.

**Tech Stack:** React (Babel JSX, no build-time TS in the broadsheet), pure ES modules + `node --test`, Next.js API route (TS) for the Strava sync.

**Spec:** `docs/superpowers/specs/2026-07-06-pace-splits-tier-chart-design.md` (merged #1556).

## Global Constraints

- **Files:** mobile broadsheet `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`; new pure module `mobile-app/src/services/paceSplits.mjs`; tests `tests/pace-splits.test.mjs`; backend `src/app/api/integrations/strava/sync/route.ts`. No migrations, no website.
- **Honest data:** nothing renders without a real source; a column/section absent → `BSTRedact` or omitted, never fabricated. Demo cards flow through the same module as real ones.
- **Color:** `BS_SD_ZONES = ['#5b8def','#34d6c5','#d8b25a','#e8843c','#e0463c']` is the single zone ramp (Z1→Z5). Zone-colored pace bars are the *deliberate* polychrome exception (matches the existing HR-zone bars). Everywhere else heat = role (session page) / tier (score page), line-only. Rust `#e0463c`/`#c0392b` = penalties/at-risk only — never "slow split" shaming (slowest split reads plain ink).
- **Zones are session-relative**, labeled `VS THIS SESSION'S AVG` (no user threshold-pace setting exists yet).
- **Motion:** entrances once per first view via `useBSSdInView`/`seen`; `bsSdReduced()` → finished state; one breathing loop per page (Score you-dot only).
- **Theme tokens only** (`useBS()` → `t`); squared radii; mono uppercase eyebrows.
- **Per-commit gate (every task's final step):** JSX parse-check ·
  `cd mobile-app && $env:VITE_BASE='/m/'; npm run build` exit 0 (PowerShell — Git Bash mangles the base) ·
  full `npm test` green · normalize LF (`sed -i 's/\r$//' <file>`) on every touched tracked file before commit.
- **Parse-check command** (run from repo root):
  `node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('PARSE OK')"`

---

## File Structure

| File | Responsibility |
|---|---|
| `mobile-app/src/services/paceSplits.mjs` (new) | Pure: normalize provider splits/laps or bucket traces → split rows; classify each split into a session-relative zone; compute bar heights + best/worst. No React. |
| `tests/pace-splits.test.mjs` (new) | Unit vectors for the module; registered in `package.json` test list. |
| `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (modify) | New `BSSdPaceBars` (chart) + `BSSplitsPage` (detail page) components; rewire the pace section + remove the main-page splits section; rewrite `BSScoreStandingChart` `scale==='tier'` branch + the toggle. |
| `src/app/api/integrations/strava/sync/route.ts` (modify) | Add `fetchActivitySplits()` (one `GET /activities/{id}`) + attach normalized `m.splits` under the existing new-post/cap gating. |

## Interfaces (locked names/types used across tasks)

- `bsPaceZoneFor(paceSec: number, avgSec: number) => 1|2|3|4|5` — lower paceSec = faster. Bands vs avg: `≤ -8% → 5`, `-8%..-3% → 4`, `-3%..+3% → 3`, `+3%..+8% → 2`, `> +8% → 1`. Non-finite/≤0 inputs → `3` (neutral, never throws).
- `bsPaceSplits(input) => { splits, avgSec, bestIdx, worstIdx, source }` where
  `input = { providerSplits?, paceTrace?, hrTrace?, cadenceTrace?, elevTrace?, distanceMi?, sport? }`,
  each `splits[i] = { label, paceSec, paceLabel, hr, cadence, elevDelta, zone, hFrac }`,
  `hFrac ∈ (0,1]` = bar height (fastest = 1, slowest = 0.28 baseline), `source = 'provider'|'trace'|null`.
- `BSSdPaceBars({ data, t, muted, heat, big=false, onOpen })` — `data` = a `bsPaceSplits` result; renders the zone-colored bar chart; `onOpen` (optional) makes it tappable.
- `BSSplitsPage({ d, t, onClose })` — full-screen splits detail; `d` = the `activityDetail` payload (already carries `paceTrace`/`trace`/`cadenceTrace`/`elevTrace`/`breakdown`/`heat`/`distanceMi`/`sport`).

---

### Task 1: `paceSplits.mjs` — pure split + zone model (TDD)

**Files:**
- Create: `mobile-app/src/services/paceSplits.mjs`
- Create/Test: `tests/pace-splits.test.mjs`
- Modify: `package.json:9` (append the test file to the `test` script)

**Interfaces:**
- Produces: `bsPaceZoneFor`, `bsPaceSplits` (signatures above). Consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write the failing test** — `tests/pace-splits.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsPaceZoneFor, bsPaceSplits } from '../mobile-app/src/services/paceSplits.mjs';

test('bsPaceZoneFor: faster than avg climbs zones, slower drops', () => {
  assert.equal(bsPaceZoneFor(500, 500), 3);      // exactly avg → steady
  assert.equal(bsPaceZoneFor(455, 500), 5);      // ~9% faster → push
  assert.equal(bsPaceZoneFor(480, 500), 4);      // ~4% faster
  assert.equal(bsPaceZoneFor(520, 500), 2);      // ~4% slower
  assert.equal(bsPaceZoneFor(560, 500), 1);      // ~12% slower → easy
});

test('bsPaceZoneFor: guards non-finite / non-positive to neutral 3', () => {
  assert.equal(bsPaceZoneFor(0, 500), 3);
  assert.equal(bsPaceZoneFor(500, 0), 3);
  assert.equal(bsPaceZoneFor(NaN, 500), 3);
});

test('bsPaceSplits: provider splits preferred, uncapped, zones rise on a negative split', () => {
  const providerSplits = [
    { label: 'Mile 1', pace: '9:00/mi', hr: '150 bpm', elevation: '+10 ft' },
    { label: 'Mile 2', pace: '8:30/mi', hr: '158 bpm' },
    { label: 'Mile 3', pace: '8:00/mi', hr: '165 bpm' },
  ];
  const r = bsPaceSplits({ providerSplits, sport: 'run' });
  assert.equal(r.source, 'provider');
  assert.equal(r.splits.length, 3);
  assert.equal(r.splits[0].paceSec, 540);
  assert.equal(r.splits[2].paceSec, 480);
  assert.equal(r.bestIdx, 2);           // fastest = mile 3
  assert.equal(r.worstIdx, 0);
  assert.ok(r.splits[2].zone >= r.splits[0].zone); // later miles no slower → zone rises
  assert.equal(r.splits[2].hFrac, 1);   // fastest bar full height
  assert.ok(r.splits[0].hFrac >= 0.28 && r.splits[0].hFrac < 1);
  assert.equal(r.splits[0].hr, 150);
  assert.equal(r.splits[0].elevDelta, 10);
});

test('bsPaceSplits: trace fallback buckets by distance when no provider splits', () => {
  const paceTrace = Array.from({ length: 30 }, (_, i) => 540 - i * 2); // steadily faster
  const r = bsPaceSplits({ paceTrace, distanceMi: 3, sport: 'run' });
  assert.equal(r.source, 'trace');
  assert.equal(r.splits.length, 3);           // 3 miles
  assert.ok(r.splits.every((s) => Number.isFinite(s.paceSec)));
});

test('bsPaceSplits: no provider splits and no trace → source null, empty splits', () => {
  const r = bsPaceSplits({ sport: 'run' });
  assert.equal(r.source, null);
  assert.deepEqual(r.splits, []);
});

test('bsPaceSplits: a single split still yields one full-height bar, no NaN', () => {
  const r = bsPaceSplits({ providerSplits: [{ label: 'Lap 1', pace: '7:30/mi' }], sport: 'run' });
  assert.equal(r.splits.length, 1);
  assert.equal(r.splits[0].hFrac, 1);
  assert.equal(r.splits[0].zone, 3);          // equals avg (itself)
});

test('bsPaceSplits: ride speed (mph) — faster = higher number, best = max', () => {
  const providerSplits = [
    { label: 'Mile 1', pace: '18.0 mph' },
    { label: 'Mile 2', pace: '22.0 mph' },
  ];
  const r = bsPaceSplits({ providerSplits, sport: 'ride' });
  assert.equal(r.bestIdx, 1);                 // 22 mph fastest
  assert.equal(r.splits[1].hFrac, 1);
});

test('bsPaceSplits: absent columns stay absent (no fabricated hr/cadence)', () => {
  const r = bsPaceSplits({ providerSplits: [{ label: 'Mile 1', pace: '8:00/mi' }], sport: 'run' });
  assert.equal(r.splits[0].hr, null);
  assert.equal(r.splits[0].cadence, null);
  assert.equal(r.splits[0].elevDelta, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pace-splits.test.mjs`
Expected: FAIL — `Cannot find module '.../paceSplits.mjs'`.

- [ ] **Step 3: Write the module** — `mobile-app/src/services/paceSplits.mjs`

```js
// Pure pace-split + zone model. No React, no window — unit-tested like scoreStanding.mjs.
// Zones are RELATIVE TO THE SESSION'S OWN AVERAGE pace (no user threshold setting exists);
// callers label this "VS THIS SESSION'S AVG".

const BASE_HFRAC = 0.28; // slowest split still shows a readable bar

// Parse a pace/speed string → seconds-per-unit for foot/swim, or a synthetic
// "lower = faster" seconds value for rides so ONE comparison path works.
// Runs/swims: "8:30/mi" | "1:42/100m" → 510 | 102. Rides: "22.0 mph" → we invert
// to a comparable where lower = faster, so bestIdx/zone math is uniform.
function paceStrToComparable(str, isRide) {
  const s = String(str == null ? '' : str);
  if (isRide) {
    const m = s.match(/([\d.]+)\s*mph/i) || s.match(/([\d.]+)/);
    const mph = m ? parseFloat(m[1]) : NaN;
    if (!Number.isFinite(mph) || mph <= 0) return null;
    return { cmp: 1000 / mph, display: mph }; // cmp lower = faster; display = the mph number
  }
  const mm = s.match(/(\d+):(\d+)/);
  if (mm) { const sec = (+mm[1]) * 60 + (+mm[2]); return sec > 0 ? { cmp: sec, display: sec } : null; }
  const n = s.match(/[\d.]+/);
  const sec = n ? parseFloat(n[0]) : NaN;
  return Number.isFinite(sec) && sec > 0 ? { cmp: sec, display: sec } : null;
}

function numFrom(str) {
  if (str == null) return null;
  const m = String(str).match(/-?[\d.]+/);
  return m ? Number(m[0]) : null;
}

export function bsPaceZoneFor(paceSec, avgSec) {
  if (!Number.isFinite(paceSec) || !Number.isFinite(avgSec) || paceSec <= 0 || avgSec <= 0) return 3;
  const d = (paceSec - avgSec) / avgSec; // >0 = slower than avg
  if (d <= -0.08) return 5;
  if (d <= -0.03) return 4;
  if (d < 0.03) return 3;
  if (d < 0.08) return 2;
  return 1;
}

function toRows(providerSplits, isRide) {
  const out = [];
  for (const s of providerSplits) {
    const p = paceStrToComparable(s.pace || s.value || s.split || s.time, isRide);
    if (!p) continue;
    out.push({
      label: String(s.label || `Split ${out.length + 1}`),
      cmp: p.cmp,
      paceSec: p.display,
      paceLabel: String(s.pace || s.value || s.split || ''),
      hr: numFrom(s.hr),
      cadence: numFrom(s.cadence),
      elevDelta: numFrom(s.elevation != null ? s.elevation : s.elev),
    });
  }
  return out;
}

// Distance-bucket a uniform trace into per-mile splits (fallback). Parallel
// hr/cadence/elev traces are averaged over the same bucket when present.
function bucketTrace({ paceTrace, hrTrace, cadenceTrace, elevTrace, distanceMi, isRide }) {
  if (!Array.isArray(paceTrace) || paceTrace.length < 2) return [];
  const miles = Math.max(1, Math.round(distanceMi || 0) || Math.min(paceTrace.length, 8));
  const per = paceTrace.length / miles;
  const avg = (arr, a, b) => {
    if (!Array.isArray(arr)) return null;
    const seg = arr.slice(a, b).filter((v) => Number.isFinite(v));
    return seg.length ? seg.reduce((x, y) => x + y, 0) / seg.length : null;
  };
  const rows = [];
  for (let i = 0; i < miles; i++) {
    const a = Math.floor(i * per), b = Math.floor((i + 1) * per);
    const pv = avg(paceTrace, a, b); // seconds/mi (or mph-ish for rides — resampled speed)
    if (pv == null || pv <= 0) continue;
    const cmp = isRide ? 1000 / pv : pv;
    const hr = avg(hrTrace, a, b), cad = avg(cadenceTrace, a, b);
    const e0 = Array.isArray(elevTrace) ? elevTrace[a] : null, e1 = Array.isArray(elevTrace) ? elevTrace[Math.max(a, b - 1)] : null;
    rows.push({
      label: `Mile ${i + 1}`, cmp, paceSec: pv, paceLabel: '',
      hr: hr == null ? null : Math.round(hr),
      cadence: cad == null ? null : Math.round(cad),
      elevDelta: (Number.isFinite(e0) && Number.isFinite(e1)) ? Math.round(e1 - e0) : null,
    });
  }
  return rows;
}

export function bsPaceSplits(input) {
  const inp = input || {};
  const isRide = /ride|bike|cycl|spin|watt|peloton/.test(String(inp.sport || '').toLowerCase());
  let rows = [];
  let source = null;
  const provider = Array.isArray(inp.providerSplits) && inp.providerSplits.length
    ? inp.providerSplits
    : (Array.isArray(inp.laps) && inp.laps.length ? inp.laps : null);
  if (provider) { rows = toRows(provider, isRide); if (rows.length) source = 'provider'; }
  if (!rows.length) { rows = bucketTrace({ ...inp, isRide }); if (rows.length) source = 'trace'; }
  if (!rows.length) return { splits: [], avgSec: null, bestIdx: -1, worstIdx: -1, source: null };

  const cmps = rows.map((r) => r.cmp);
  const avgCmp = cmps.reduce((a, b) => a + b, 0) / cmps.length;
  // avg in the same unit as paceSec for zone thresholds:
  const avgSec = rows.reduce((a, r) => a + r.paceSec, 0) / rows.length;
  const fast = Math.min(...cmps), slow = Math.max(...cmps), rng = (slow - fast) || 1;
  const bestIdx = cmps.indexOf(fast), worstIdx = cmps.indexOf(slow);
  const splits = rows.map((r) => {
    // hFrac: fastest (min cmp) = 1, slowest = BASE_HFRAC
    const hFrac = 1 - ((r.cmp - fast) / rng) * (1 - BASE_HFRAC);
    // zone via seconds-relative comparison (rides: invert cmp back to a pace-like scale
    // where lower = faster, which cmp already is — compare cmp to avgCmp directly).
    const zone = bsPaceZoneFor(r.cmp, avgCmp);
    return {
      label: r.label, paceSec: r.paceSec, paceLabel: r.paceLabel,
      hr: r.hr ?? null, cadence: r.cadence ?? null, elevDelta: r.elevDelta ?? null,
      zone, hFrac: Math.max(BASE_HFRAC, Math.min(1, hFrac)),
    };
  });
  return { splits, avgSec, bestIdx, worstIdx, source };
}
```

- [ ] **Step 4: Register the test** — `package.json:9`, append ` tests/pace-splits.test.mjs` to the end of the `"test"` command string (before the closing quote).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`, pass count +8 (was 400 → 408).

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/paceSplits.mjs tests/pace-splits.test.mjs
git add mobile-app/src/services/paceSplits.mjs tests/pace-splits.test.mjs package.json
git commit -m "feat(pace): pure paceSplits.mjs — provider/trace split normalization + session-relative zones + tests"
```

---

### Task 2: Strava sync — ingest provider splits (`rawMetrics.splits`)

**Files:**
- Modify: `src/app/api/integrations/strava/sync/route.ts` (add `fetchActivitySplits`; wire into `importStravaActivities` near line 432-442)

**Interfaces:**
- Produces: posts whose `metrics.splits = [{ label, pace, hr, elevation }]` — exactly the shape `bsBuildBreakdown` (`iosAppBroadsheetClient.jsx:7776-7784`) already reads, and Task 1's `bsPaceSplits({ providerSplits })` consumes.

- [ ] **Step 1: Add the fetch+normalize helper** (place after `fetchStreams`, ~line 383)

```ts
// Per-mile splits from the DETAILED activity (splits_standard) — one extra call per
// new post, same cap as the streams fetch. Honest: absent fields stay absent; no
// splits on the response → returns null (the app falls back to trace-derived splits).
async function fetchActivitySplits(
  accessToken: string,
  activityId: number
): Promise<{ label: string; pace: string; hr?: string; elevation?: string }[] | null> {
  try {
    const detail = await stravaGet<{
      splits_standard?: Array<{
        distance?: number; elapsed_time?: number; moving_time?: number;
        average_heartrate?: number; elevation_difference?: number; split?: number;
      }>;
    }>(accessToken, `/activities/${activityId}`);
    const arr = detail?.splits_standard;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const out: { label: string; pace: string; hr?: string; elevation?: string }[] = [];
    arr.forEach((s, i) => {
      const secs = (typeof s.moving_time === 'number' ? s.moving_time : s.elapsed_time) ?? null;
      // Never fabricate a mile — skip a split without a real distance (honest-data rule).
      const meters = typeof s.distance === 'number' ? s.distance : null;
      if (secs == null || secs <= 0 || meters == null || meters <= 0) return;
      const perMile = secs / (meters / 1609.344);
      const mm = Math.floor(perMile / 60), ss = Math.round(perMile % 60);
      const row: { label: string; pace: string; hr?: string; elevation?: string } = {
        label: `Mile ${s.split ?? i + 1}`,
        pace: `${mm}:${String(ss).padStart(2, '0')}/mi`,
      };
      if (typeof s.average_heartrate === 'number') row.hr = `${Math.round(s.average_heartrate)} bpm`;
      if (typeof s.elevation_difference === 'number') {
        const ft = Math.round(s.elevation_difference * 3.28084);
        row.elevation = `${ft >= 0 ? '+' : ''}${ft} ft`;
      }
      out.push(row);
    });
    return out.length ? out : null;
  } catch {
    return null; // failure-isolated: never fails the activity's sync
  }
}
```

- [ ] **Step 2: Wire it into the import loop** — inside the `if (!existing?.id && hasStreamSignal && streamsFetched < STREAM_CAP)` block (route.ts ~432-442), after the trace attaches, add:

```ts
      const splits = await fetchActivitySplits(accessToken, activity.id);
      if (splits) m.splits = splits;
```

(Same gating/cap — the split fetch only runs when the streams fetch does, i.e. new posts under `STREAM_CAP`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors introduced by this file (the 3 known baseline errors — see the local-build-gate memory — may remain; confirm the strava route is clean).

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' src/app/api/integrations/strava/sync/route.ts
git add src/app/api/integrations/strava/sync/route.ts
git commit -m "feat(strava): capture per-mile splits_standard into rawMetrics.splits (new posts, same stream cap)"
```

---

### Task 3: `BSSdPaceBars` — the zone-colored per-split bar chart

**Files:**
- Modify: `iosAppBroadsheetClient.jsx` — add the component just above `BSSdZoneCells` (~line 10889) so it sits with the other session-detail chart primitives; import `bsPaceSplits` at the top of the module's import block (find the existing `scoreStanding.mjs` import and add a sibling line).

**Interfaces:**
- Consumes: `bsPaceSplits` (Task 1), `BS_SD_ZONES`, `useBSSdInView`, `bsSdReduced`, `bsTHexA`.
- Produces: `BSSdPaceBars({ data, t, muted, heat, big, onOpen })` — used by Tasks 4 (main page, `big=false`, `onOpen` set) and 5 (splits page, `big=true`).

- [ ] **Step 1: Add the import** (top of file, next to the scoreStanding import)

```js
import { bsPaceSplits, bsPaceZoneFor } from '../services/paceSplits.mjs';
```
(Verify the exact relative path matches the existing `scoreStanding.mjs` import — grep `from '../services/`.)

- [ ] **Step 2: Add the component** (above `BSSdZoneCells`, ~10889)

```jsx
// Per-split PACE as vertical bars — taller = faster, each bar filled by its pace
// zone (BS_SD_ZONES). Avg-pace hairline across; fastest bar carries the ▲ chip.
// Tappable (onOpen) → the full Splits page. `big` renders labels + more height.
function BSSdPaceBars({ data, t, muted, heat, big = false, onOpen }) {
  const [ref, seen] = useBSSdInView();
  const reduced = bsSdReduced();
  if (!data || !Array.isArray(data.splits) || data.splits.length === 0) return null;
  const { splits, bestIdx } = data;
  const H = big ? 150 : 116;
  const fmtPace = (sec, ride) => ride ? `${Number(sec).toFixed(1)}` : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const isRide = splits.some((s) => s.paceSec > 40); // mph values are small; sec/mi large → heuristic only for label
  const gap = splits.length > 16 ? 2 : 4;
  const interactive = typeof onOpen === 'function';
  return (
    <div ref={ref}>
      <div
        role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? onOpen : undefined}
        onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
        aria-label={interactive ? 'Open full splits breakdown' : undefined}
        style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap, height: H, cursor: interactive ? 'pointer' : 'default', minHeight: interactive ? 44 : undefined }}>
        {/* avg hairline */}
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: `${(1 - avgHFrac(splits)) * 100}%`, height: 1, background: bsTHexA(t.INK, 0.18) }} />
        {splits.map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
            <div aria-hidden style={{
              width: '100%', height: seen ? `${s.hFrac * 100}%` : '0%',
              background: BS_SD_ZONES[(s.zone - 1) % 5], borderRadius: 2,
              transition: reduced ? 'none' : `height 620ms cubic-bezier(.3,.6,.2,1) ${40 * i}ms`,
              outline: i === bestIdx ? `1px solid ${bsTHexA(t.INK, 0.45)}` : 0,
            }} />
            {big && <span style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 6.5, fontWeight: 700, color: muted, whiteSpace: 'nowrap' }}>{i + 1}</span>}
          </div>
        ))}
      </div>
      {/* zone legend + honesty label */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.4) }}>Vs this session's avg</span>
        {[1, 2, 3, 4, 5].map((z) => {
          const n = splits.filter((s) => s.zone === z).length;
          if (!n) return null;
          return (
            <span key={z} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, color: muted }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: BS_SD_ZONES[z - 1] }} />Z{z} · {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}
// avg bar height fraction (for the hairline) — mean of the split hFracs.
function avgHFrac(splits) { return splits.reduce((a, s) => a + s.hFrac, 0) / splits.length; }
```

- [ ] **Step 3: Parse-check** (component compiles; no render wiring yet)

Run the parse-check command on the file. Expected: `PARSE OK`.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(pace): BSSdPaceBars — zone-colored per-split bar chart primitive"
```

---

### Task 4: Wire pace bars into the main detail page; move MILE SPLITS off it

**Files:**
- Modify: `iosAppBroadsheetClient.jsx` — the detail component body (build `paceData` near the other derived vars ~11169-11183), the PACE section (11279-11284), the SPLITS section (11304-11319), and the detail component's local state (add `splitsOpen`).

**Interfaces:**
- Consumes: `BSSdPaceBars` (Task 3), `bsPaceSplits` (Task 1).
- Produces: `splitsOpen` state + the `BSSplitsPage` mount point (Task 5 fills the page body).

- [ ] **Step 1: Derive `paceData`** — after the `paceCfg`/`distanceMi` lines (~11183) add:

```jsx
  // Per-split model (provider splits preferred, trace fallback) for the bar chart
  // + the Splits page. Runs/swims/rides; null when there's no pace signal at all.
  const paceData = bsPaceSplits({
    // Raw uncapped provider splits FIRST (rawMetrics.splits/laps threaded via the 'a'
    // mapper), then the flattened breakdown, then trace — never suppress the raw path.
    providerSplits: (Array.isArray(d.rawSplits) && d.rawSplits.length) ? d.rawSplits
      : (d.breakdown && /split|mile|lap/i.test(String(d.breakdown.label || '')) && Array.isArray(d.breakdown.rows))
        ? d.breakdown.rows.map((r) => ({ label: r[0], pace: r[1], hr: /bpm/.test(String(r[2])) ? r[2] : undefined, elevation: /ft|m\b/.test(String(r[2])) ? r[2] : undefined }))
        : null,
    paceTrace: Array.isArray(d.paceTrace) ? d.paceTrace : null,
    hrTrace: d.trace, cadenceTrace: d.cadenceTrace, elevTrace: d.elevTrace,
    distanceMi, sport,
  });
  const hasSplitsPage = !!(paceData && paceData.splits.length > 1);
```

- [ ] **Step 2: Add `splitsOpen` state** — with the detail component's other `useStateBSC` calls (grep the component's first `useStateBSC`), add:

```jsx
  const [splitsOpen, setSplitsOpen] = useStateBSC(false);
```

- [ ] **Step 3: Replace the PACE section** (11279-11284) with the bar chart + leader:

```jsx
        {!isComments && paceData && paceData.splits.length > 0 && (
          <>
            {secHead(paceCfg.label, paceChipStat ? headChip(`${paceCfg.chip} ${paceChipStat[1]}`, true) : null)}
            <BSSdPaceBars data={paceData} t={t} muted={muted} heat={heat} onOpen={hasSplitsPage ? () => setSplitsOpen(true) : undefined} />
            {hasSplitsPage && (
              <button onClick={() => setSplitsOpen(true)} style={{ marginTop: 12, width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 0, padding: '11px 0', cursor: 'pointer', textAlign: 'left' }}>
                <span aria-hidden style={{ width: 6, height: 1.5, background: heat, flexShrink: 0 }} />
                <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.55) }}>Splits · Full breakdown ›</span>
              </button>
            )}
          </>
        )}
```

- [ ] **Step 4: Remove the main-page SPLITS section** — delete the block at 11304-11319 (the `d.breakdown` splits ledger) **only for pace-type breakdowns**; keep it for strength (working sets). Replace the block's guard so it renders only when the breakdown is NOT splits:

```jsx
        {/* Working-sets breakdown stays on the main page; splits moved to the Splits page (Task 5). */}
        {!isComments && d.breakdown && Array.isArray(d.breakdown.rows) && d.breakdown.rows.length > 0
          && !/split|mile|lap/i.test(String(d.breakdown.label || '')) && (() => {
          const rows = d.breakdown.rows;
          const perf = rows.map((r) => { const m = String(r[1]).match(/[\d.]+/); return m ? +m[0] : 0; });
          const bestIdx = perf.indexOf(Math.max(...perf));
          return (
            <>
              {secHead(d.breakdown.label || 'Working sets')}
              <BSSdBars rows={rows} perf={perf} bestIdx={bestIdx} heat={heat} t={t} muted={muted} />
            </>
          );
        })()}
```

- [ ] **Step 5: Mount the Splits page** — just before the `view`'s closing (find where the detail `view` returns / the outermost wrapper closes, right before `createPortal`), add a conditional sibling overlay:

```jsx
        {splitsOpen && <BSSplitsPage d={d} paceData={paceData} t={t} onClose={() => setSplitsOpen(false)} />}
```
(Task 5 defines `BSSplitsPage`. Until then, parse-check will pass but the reference is undefined at runtime — Task 5 lands before any on-device check.)

- [ ] **Step 6: Parse-check + build + tests + commit**

```bash
# parse-check (expect PARSE OK), then:
cd mobile-app; $env:VITE_BASE='/m/'; npm run build   # PowerShell; expect exit 0
cd ..; npm test 2>&1 | grep -E "^ℹ (pass|fail)"       # expect fail 0
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(pace): main detail page shows the pace bar chart + Splits leader; splits move off it"
```

---

### Task 5: `BSSplitsPage` — the max-depth Splits detail page

**Files:**
- Modify: `iosAppBroadsheetClient.jsx` — add `BSSplitsPage` near the detail component (after `BSSdPaceBars`, or just below the detail component definition). Uses `createPortal` into `#bs-phone-surface` like the other full-screen overlays.

**Interfaces:**
- Consumes: `paceData` (Task 4), `BSSdPaceBars` (`big`), `BS_SD_ZONES`, `BSTRedact`, `bsInjectSessionDetailCss`, `createPortal`.

- [ ] **Step 1: Add the component**

```jsx
// The Splits — max-depth per-lap breakdown. Portals over the session-details
// overlay; ← BACK returns. Columns render only when the stream exists.
function BSSplitsPage({ d, paceData, t, onClose }) {
  const muted = bsTHexA(t.INK, 0.55), hair = bsTHexA(t.INK, 0.1);
  const heat = d.heat || (t.isLight ? '#0a8f87' : '#34d6c5');
  const surface = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  if (!surface || !paceData || !paceData.splits.length) return null;
  const s = paceData.splits;
  const anyHr = s.some((x) => x.hr != null), anyCad = s.some((x) => x.cadence != null), anyElev = s.some((x) => x.elevDelta != null);
  const fmtPace = (x) => x.paceLabel || `${Math.floor(x.paceSec / 60)}:${String(Math.round(x.paceSec % 60)).padStart(2, '0')}`;
  const col = { fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: muted, textAlign: 'right' };
  const cell = { fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const view = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99992, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: 'calc(env(safe-area-inset-top,0px) + 13px) 16px 11px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} aria-label="Back" style={{ width: 30, height: 30, borderRadius: 999, border: `1px solid ${hair}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontSize: 16, display: 'grid', placeItems: 'center' }}>‹</button>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }}>The splits</span>
        {paceData.source === 'trace' && <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.4) }}>Estimated · from trace</span>}
      </div>
      <div className="bs-hide-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px' }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>{d.title || 'Session'}<span style={{ color: heat }}>.</span></div>
        <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: muted, marginBottom: 16 }}>{d.who} · {d.ago} ago</div>
        <BSSdPaceBars data={paceData} t={t} muted={muted} heat={heat} big />
        {/* ledger table */}
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: `minmax(56px,1fr) auto ${anyHr ? 'auto ' : ''}${anyCad ? 'auto ' : ''}${anyElev ? 'auto' : ''}`.trim(), rowGap: 0, columnGap: 12, alignItems: 'center' }}>
          <span style={{ ...col, textAlign: 'left' }}>Split</span>
          <span style={col}>Pace</span>
          {anyHr && <span style={col}>HR</span>}
          {anyCad && <span style={col}>Cad</span>}
          {anyElev && <span style={col}>Elev</span>}
          {s.map((x, i) => {
            const best = i === paceData.bestIdx;
            return (
              <React.Fragment key={i}>
                <span style={{ gridColumn: '1 / -1', height: 1, background: hair, margin: '9px 0' }} aria-hidden />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK }}>
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: 1.5, background: BS_SD_ZONES[(x.zone - 1) % 5], flexShrink: 0 }} />{x.label}
                </span>
                <span style={{ ...cell, color: best ? heat : t.INK, fontWeight: best ? 800 : 700 }}>{fmtPace(x)}</span>
                {anyHr && <span style={cell}>{x.hr != null ? x.hr : '—'}</span>}
                {anyCad && <span style={cell}>{x.cadence != null ? x.cadence : '—'}</span>}
                {anyElev && <span style={cell}>{x.elevDelta != null ? `${x.elevDelta > 0 ? '+' : ''}${x.elevDelta}` : '—'}</span>}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
  return ReactDOM.createPortal(view, surface);
}
```

(Verify the portal helper name in this file — grep `createPortal`; it may be `ReactDOM.createPortal` or a destructured `createPortal`. Match the existing usage.)

- [ ] **Step 2: Parse-check + build + on-device sanity**

```bash
# parse-check → PARSE OK
cd mobile-app; $env:VITE_BASE='/m/'; npm run build   # exit 0
```
Then drive the branch preview (chrome-devtools MCP): CHAT feed → open a run post ("Drew Oyelaran" has splits + traces) → confirm the pace bars are zone-colored + tappable → tap → the Splits page opens with the per-lap table → 0 horizontal overflow.

- [ ] **Step 3: Commit**

```bash
cd ..; npm test 2>&1 | grep -E "^ℹ (pass|fail)"
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(pace): The Splits page — per-lap ledger (pace/HR/cadence/elev), zone-colored, honest columns"
```

---

### Task 6: THIS TIER → the zoomed ladder

**Files:**
- Modify: `iosAppBroadsheetClient.jsx` — rewrite the `scale === 'tier'` branch of `BSScoreStandingChart` (18340-18361) to reuse the ladder's SVG grammar (the `scale !== 'tier'` branch, 18362-18391, is the reference).

**Interfaces:**
- Consumes: `bsScoreStanding` (unchanged), `bsTierColor`, the ladder branch's SVG pattern.

- [ ] **Step 1: Rewrite the `scale === 'tier'` branch** — replace 18340-18361 with a two-node zoomed segment: current-tier node bottom-left, next-tier node top-right, a dashed ink baseline, a self-drawing heat path to `s.frac`, and the breathing HTML you-dot + points figure at `frac` along the line (mirror the ladder branch's `preserveAspectRatio="none"` SVG + `youLeftPct` HTML overlay; use `W=300,H=100`, x from 6→294, y from `H-12`→`12`, you at `frac`). Keep the captions verbatim (reword "bar"→"line"): at-risk clamps the dot to the floor node with the rust caption; top-tier draws the full heat lane, dot at the summit, "Top tier — nothing above."

```jsx
  if (scale === 'tier') {
    const riskRed = t.isLight ? '#c0392b' : '#e0463c';
    const nextColor = s.topTier ? heat : bsTierColor(s.nextName || tier);
    const frac = s.topTier ? 1 : s.frac;
    const W = 300, H = 100, x0 = 6, x1 = W - 6, y0 = H - 12, y1 = 12;
    const youX = x0 + (x1 - x0) * (s.atRisk ? 0 : frac);
    const youY = y0 + (y1 - y0) * (s.atRisk ? 0 : frac);
    const base = `M${x0} ${y0} L${x1} ${y1}`;
    const prog = `M${x0} ${y0} L${youX.toFixed(1)} ${youY.toFixed(1)}`;
    const youLeftPct = (youX / W) * 100;
    const caption = s.atRisk
      ? `⚠ ${fmt(Math.max(0, s.curThr - total))} below ${tier} — earn it back to hold`
      : s.topTier ? 'Top tier — nothing above.' : `${fmt(s.toNext)} to ${s.nextName} · ${s.pct}% through the tier`;
    return (
      <div aria-label={`${fmt(total)} points — ${tier}${s.topTier ? ', top tier' : `, ${s.pct}% to ${s.nextName}`}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: heat }}>{tier} · {fmt(s.curThr)}</span>
          {!s.topTier && <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: nextColor }}>{s.nextName} · {fmt(s.nextThr)}</span>}
        </div>
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
            {[0.25, 0.5, 0.75].map((g, i) => <line key={i} x1="0" y1={H * g} x2={W} y2={H * g} stroke={bsTHexA(INK, 0.06)} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            <path d={base} fill="none" stroke={bsTHexA(INK, 0.18)} strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={prog} fill="none" stroke={heat} strokeWidth="2.5" strokeLinecap="round" pathLength="1" strokeDasharray="1"
              style={{ ['--sd-len']: 1, strokeDashoffset: reduced ? 0 : 1, ...(reduced ? null : seen ? { animation: 'bsSdDrawLine 900ms ease forwards' } : null) }} />
            <circle cx={x0} cy={y0} r="3" fill="none" stroke={heat} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <circle cx={x1} cy={y1} r="3" fill={s.topTier ? heat : bsTHexA(INK, 0.35)} stroke={nextColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <div aria-hidden style={{ position: 'absolute', left: `${youLeftPct}%`, top: youY, width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: 999, background: s.atRisk ? riskRed : heat, ['--sd-glow']: bsTHexA(s.atRisk ? riskRed : heat, 0.5), ...(reduced ? null : { animation: 'bsSdPrBreath 2.6s ease-in-out infinite' }) }} />
          <div aria-hidden style={{ position: 'absolute', left: `${youLeftPct}%`, top: youY - 20, transform: 'translateX(-50%)', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: s.atRisk ? riskRed : heat, whiteSpace: 'nowrap' }}>{fmt(total)}</div>
        </div>
        <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.atRisk ? riskRed : bsTHexA(INK, 0.5), fontWeight: 800 }}>{caption}</div>
        <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: bsTHexA(INK, 0.3) }}>Tiers never demote — this line only moves right</div>
      </div>
    );
  }
```

- [ ] **Step 2: Parse-check + build + on-device**

Build (PowerShell, exit 0), then drive the preview: Settings → Shape Score → THIS TIER toggle → confirm the zoomed ladder draws with two nodes + breathing dot; toggle back to THE LADDER still works; test the at-risk state (a Base/at-risk demo profile) clamps the dot to the floor in rust.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(score): THIS TIER view redrawn as the zoomed ladder (two nodes, self-drawing heat path, breathing you-dot)"
```

---

### Task 7: The LADDER / THIS TIER toggle → segmented control

**Files:**
- Modify: `iosAppBroadsheetClient.jsx:18496-18505` — replace the two underline buttons with a segmented control.

**Interfaces:**
- Consumes: `standScale`, `setStandScale` (unchanged state).

- [ ] **Step 1: Replace the toggle buttons** (18496-18505) with:

```jsx
          <div role="tablist" aria-label="Standing scale" style={{ display: 'inline-flex', flex: 'none', border: `1px solid ${bsTHexA(t.INK, 0.28)}`, borderRadius: 4, overflow: 'hidden' }}>
            {[['ladder', 'The ladder'], ['tier', 'This tier']].map(([k, label], i) => {
              const on = standScale === k;
              return (
                <button key={k} role="tab" aria-selected={on} onClick={() => setStandScale(k)}
                  style={{ minHeight: 44, padding: '13px 12px', border: 0, borderLeft: i ? `1px solid ${bsTHexA(t.INK, 0.28)}` : 0, cursor: 'pointer',
                    background: on ? t.INK : 'transparent', color: on ? t.PAPER : bsTHexA(t.INK, 0.5),
                    fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              );
            })}
          </div>
```

Note: the head row (18492) currently has a flexible gradient rule (`flex: 1`) before the toggle — keep it; the segmented control sits at the right. If the row gets tight at narrow width, let the gradient rule shrink (`minWidth: 8` already set).

- [ ] **Step 2: Parse-check + build + on-device**

Build (exit 0); preview: Shape Score → the toggle now reads as a clear segmented control, active cell ink-filled; both cells switch the chart; 44px tap height.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(score): LADDER/THIS TIER toggle → segmented control (active cell ink-inverted, 44px)"
```

---

## Final integration pass (after Task 7)

- [ ] Full `npm test` green (408+).
- [ ] PowerShell mobile build exit 0; `public/m` is built at deploy (#1470) — do NOT hand-sync.
- [ ] `/code-review` the whole branch diff (logic + theme-token + demo-vs-live leaks).
- [ ] Push the branch, open ONE PR (all 7 tasks), wait for CI + CodeRabbit + Codex, address findings, squash-merge, keep the branch.
- [ ] On-device pass (owner, tracked follow-up): Black/Sage/Cream × run/ride/swim posts (provider-splits + trace-only) × the Splits page × Score THIS TIER (Raw/Tempo/at-risk/top) + the toggle.

## Self-review notes (checked against the spec)

- Spec §1 pace bars → Task 3+4. §2 Splits page → Task 5. §3 zones/model → Task 1. §4 THIS TIER → Task 6. §5 toggle → Task 7. §6 ingestion → Task 2. All six covered.
- `bsPaceSplits`/`bsPaceZoneFor`/`BSSdPaceBars`/`BSSplitsPage` names are consistent across Tasks 1/3/4/5.
- Honest-data: `source: null` → no chart (Task 3 guard); absent columns drop (Task 5); trace fallback labeled "Estimated" + zones labeled "VS THIS SESSION'S AVG".
- Ambiguity resolved: ride "faster" uses an inverted comparable so one code path handles bestIdx/zone/hFrac; the label heuristic in `BSSdPaceBars` is display-only (zone/height come from the module, which is unit-tested).
