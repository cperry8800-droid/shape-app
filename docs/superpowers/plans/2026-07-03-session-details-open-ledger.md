# Session Details "Open Ledger" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the hero + GPS route + Summary section of the mobile activity detail page (`BSActivityDetail`) as the unboxed "Open Ledger" — heat rail, self-drawing route, two-register stat ledger with the AVG PACE needle band — and delete the heat-wash that bleeds over the author row.

**Architecture:** All UI work happens in `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (the sd-primitives block ~10480–11010). The two bug-prone logic pieces — stat ranking and the pace needle — are extracted to a new pure module `mobile-app/src/services/sessionLedger.mjs` with unit tests, imported like the existing `reactionVerbs.mjs`. The charts below Summary (Pace/Power/HR/Splits/Cadence/Elevation) are untouched.

**Tech Stack:** React 18 + inline styles + injected CSS keyframes (no new deps). `node --test` for the pure module. Spec: `docs/superpowers/specs/2026-07-03-session-details-open-ledger-design.md`.

## Global Constraints

- Theme tokens only (`t.INK/PAPER/DISPLAY/MONO`, `bsTHexA(...)`); never hardcode ink/paper. Heat literal comes only from `bsSdHeatColor(...)` already in scope as `heat`.
- Honest data: needle/ghost/route render ONLY from real series; no fabricated values; captions never invent provider/privacy fields.
- Reduced motion: every animation uses `...(sdReduced ? null : { animation: ... })` or the `reduced` flag; `useBSSdInView` already seeds `seen=true` when reduced.
- All text stays ink-toned (AA never depends on heat).
- Line endings: the repo is LF; after Edit/Write on Windows run `sed -i 's/\r$//' <file>` before committing.
- Branch: `claude/home-sd-redesign` (already created). Commit per task. Do NOT touch `public/m` (built at deploy since #1470); do NOT modify `BSActivityRoutePreview` (shared with feed cards).
- The comments-focus page (`isComments`) shares the hero/body/co-sign/route JSX — it inherits the new hero + route (intended); its Reactions/Comments sections are untouched and stay OUTSIDE the rail wrapper.

---

### Task 1: Pure ledger helpers (`sessionLedger.mjs`) + tests

**Files:**
- Create: `mobile-app/src/services/sessionLedger.mjs`
- Create: `tests/session-ledger.test.mjs`
- Modify: `package.json` (append the test file to the `test` script list)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:7` (add import after the `shapeSteps.mjs` import)

**Interfaces:**
- Produces: `bsSdSplitUnit(text) → { num: string, unit: string }`;
  `bsSdRankStats(stats: [label, value][]) → { primary: [..][], secondary: [..][] }`;
  `bsSdNeedle(value: string, trace: number[], mode: 'pace'|'speed') → { frac: number, lo: string, hi: string } | null`.
  Tasks 2 and 4 consume all three by these exact names.

- [ ] **Step 1: Write the failing tests**

Create `tests/session-ledger.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsSdSplitUnit, bsSdRankStats, bsSdNeedle } from '../mobile-app/src/services/sessionLedger.mjs';

test('splitUnit: trailing short unit splits', () => {
  assert.deepEqual(bsSdSplitUnit('3.2 mi'), { num: '3.2', unit: 'mi' });
  assert.deepEqual(bsSdSplitUnit('148 bpm'), { num: '148', unit: 'bpm' });
  assert.deepEqual(bsSdSplitUnit('7:58/mi'), { num: '7:58', unit: '/mi' });
  assert.deepEqual(bsSdSplitUnit('8,150 lb'), { num: '8,150', unit: 'lb' });
  assert.deepEqual(bsSdSplitUnit('1.12 m'), { num: '1.12', unit: 'm' });
});

test('splitUnit: times, bare numbers, and composites stay whole', () => {
  assert.deepEqual(bsSdSplitUnit('25:31'), { num: '25:31', unit: '' });
  assert.deepEqual(bsSdSplitUnit('410'), { num: '410', unit: '' });
  assert.deepEqual(bsSdSplitUnit('2.4 · M0'), { num: '2.4 · M0', unit: '' });
  assert.deepEqual(bsSdSplitUnit(null), { num: '', unit: '' });
});

test('rankStats: run session → pace/time/avg-HR primary in source order', () => {
  const stats = [['AVG PACE', '7:58/mi'], ['TIME', '25:31'], ['AVG HR', '148 bpm'], ['MAX HR', '164 bpm'], ['CALORIES', '410'], ['STRIDE', '1.12 m'], ['GROUND', '250 ms'], ['TRAINING', '2.4 · M0']];
  const { primary, secondary } = bsSdRankStats(stats);
  assert.deepEqual(primary.map((s) => s[0]), ['AVG PACE', 'TIME', 'AVG HR']);
  assert.deepEqual(secondary.map((s) => s[0]), ['MAX HR', 'CALORIES', 'STRIDE', 'GROUND', 'TRAINING']);
});

test('rankStats: strength session (no pace/hr/time) promotes the first two', () => {
  const { primary, secondary } = bsSdRankStats([['SETS', '24'], ['VOLUME', '8,150 lb'], ['TRAINING', '2.1 · M0']]);
  assert.deepEqual(primary.map((s) => s[0]), ['SETS', 'VOLUME']);
  assert.deepEqual(secondary.map((s) => s[0]), ['TRAINING']);
});

test('rankStats: MAX HR counts as the HR primary when no AVG HR exists', () => {
  const { primary } = bsSdRankStats([['MAX HR', '164 bpm'], ['CALORIES', '410'], ['TIME', '25:31']]);
  assert.deepEqual(primary.map((s) => s[0]), ['MAX HR', 'TIME']);
});

test('rankStats: one stat → one primary; empty → both empty', () => {
  assert.equal(bsSdRankStats([['DISTANCE', '1,200 m']]).primary.length, 1);
  assert.deepEqual(bsSdRankStats([]), { primary: [], secondary: [] });
  assert.deepEqual(bsSdRankStats(null), { primary: [], secondary: [] });
});

test('needle: pace mode — faster reads right, endpoints slowest→fastest', () => {
  const n = bsSdNeedle('7:58/mi', [521, 478, 432], 'pace');
  assert.ok(Math.abs(n.frac - (521 - 478) / (521 - 432)) < 1e-9);
  assert.equal(n.lo, '8:41');
  assert.equal(n.hi, '7:12');
});

test('needle: speed mode — higher reads right', () => {
  const n = bsSdNeedle('17.2 mph', [12.0, 21.5], 'speed');
  assert.ok(Math.abs(n.frac - (17.2 - 12.0) / 9.5) < 1e-9);
  assert.equal(n.lo, '12.0');
  assert.equal(n.hi, '21.5');
});

test('needle: clamps out-of-range averages to 0..1', () => {
  assert.equal(bsSdNeedle('6:00/mi', [521, 432], 'pace').frac, 1);
  assert.equal(bsSdNeedle('9:59/mi', [521, 432], 'pace').frac, 0);
});

test('needle: honest null on short/flat/unparseable input', () => {
  assert.equal(bsSdNeedle('7:58/mi', [478], 'pace'), null);
  assert.equal(bsSdNeedle('7:58/mi', [480, 480], 'pace'), null);
  assert.equal(bsSdNeedle('brisk', [521, 432], 'pace'), null);
  assert.equal(bsSdNeedle('7:58/mi', null, 'pace'), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (repo root): `node --test tests/session-ledger.test.mjs`
Expected: FAIL — `Cannot find module ... sessionLedger.mjs`

- [ ] **Step 3: Write the module**

Create `mobile-app/src/services/sessionLedger.mjs`:

```js
// Pure helpers for the Session Details "Open Ledger" summary — stat ranking
// into the two ledger registers + the AVG PACE needle math. Dependency-free
// so the honesty rules (no fabricated needle, promoted primaries) stay
// unit-tested. Spec: docs/superpowers/specs/2026-07-03-session-details-open-ledger-design.md

// Split a stat value into { num, unit } for big-number + small-unit type.
// Only a short trailing letter/%/slash token counts as a unit — composites
// ("2.4 · M0") and times ("25:31") render whole.
export function bsSdSplitUnit(text) {
  const s = String(text == null ? '' : text).trim();
  const m = s.match(/^([\d.,:]+)\s*([a-zA-Z%/]{1,6})$/);
  return m ? { num: m[1], unit: m[2] } : { num: s, unit: '' };
}

const SD_PACE_RE = /pace|speed/i;
const SD_TIME_RE = /\btime\b|duration|moving|elapsed/i;
const SD_HR_RE = /avg.*(hr|heart|bpm)|(^|\s)hr\b|heart/i;

// Rank [label, value] pairs into the ledger registers. Primary = the first
// pace/speed + time + HR match (≤3), kept in SOURCE order; when fewer than 2
// match (strength / recovery sessions) the leading stats are promoted so the
// big register never renders a lonely orphan. Secondary = the rest, in order.
export function bsSdRankStats(stats) {
  const list = Array.isArray(stats) ? stats.filter((s) => Array.isArray(s) && s.length >= 2) : [];
  const primary = [];
  [SD_PACE_RE, SD_TIME_RE, SD_HR_RE].forEach((re) => {
    const hit = list.find((s) => re.test(String(s[0])) && !primary.includes(s));
    if (hit) primary.push(hit);
  });
  list.forEach((s) => { if (primary.length < 2 && !primary.includes(s)) primary.push(s); });
  primary.sort((a, b) => list.indexOf(a) - list.indexOf(b));
  return { primary, secondary: list.filter((s) => !primary.includes(s)) };
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const fmtPace = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

// Where the average sits between the session's slowest and fastest samples.
// Returns null (→ plain ledger row, never a fabricated needle) when the trace
// is short/flat or the value doesn't parse. 'pace' traces are seconds (lower
// = faster; faster reads RIGHT); 'speed' traces are mph (higher = faster).
// lo/hi are the LEFT/RIGHT endpoint labels (slowest → fastest).
export function bsSdNeedle(value, trace, mode = 'pace') {
  if (!Array.isArray(trace) || trace.length < 2) return null;
  const lo = Math.min(...trace), hi = Math.max(...trace);
  if (!(hi > lo)) return null;
  const s = String(value == null ? '' : value);
  if (mode === 'speed') {
    const avg = parseFloat(s.replace(/[^\d.]/g, ''));
    if (!isFinite(avg)) return null;
    return { frac: clamp01((avg - lo) / (hi - lo)), lo: lo.toFixed(1), hi: hi.toFixed(1) };
  }
  const m = s.match(/(\d+):(\d{2})/);
  if (!m) return null;
  const avg = (+m[1]) * 60 + (+m[2]);
  return { frac: clamp01((hi - avg) / (hi - lo)), lo: fmtPace(hi), hi: fmtPace(lo) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/session-ledger.test.mjs`
Expected: PASS (10 tests)

- [ ] **Step 5: Register the test + add the client import**

In `package.json`, append ` tests/session-ledger.test.mjs` to the end of the `"test"` script string.

In `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`, after line 7 (`import { shapeStepsPoints } ...`) add:

```js
import { bsSdSplitUnit, bsSdRankStats, bsSdNeedle } from '../services/sessionLedger.mjs';
```

- [ ] **Step 6: Verify the full suite + parse**

Run: `npm test` → all tests pass (363 existing + 10 new).
Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"` → no output.

- [ ] **Step 7: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/sessionLedger.mjs tests/session-ledger.test.mjs package.json
git add mobile-app/src/services/sessionLedger.mjs tests/session-ledger.test.mjs package.json mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat: sessionLedger pure helpers (rank stats, split unit, pace needle) + tests"
```

---

### Task 2: Bleed fix + heat rail + unboxed hero

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the CSS injector (~10491–10502), the hero block (~10887–10910), and the wrapper close point after the SUMMARY block (~10935).

**Interfaces:**
- Consumes: `bsSdSplitUnit` (Task 1); existing `heat`, `sdReduced`, `BSSdCountUp`, `bsTHexA`.
- Produces: the rail wrapper `<div style={{ position:'relative', paddingLeft:15 }}>` that Tasks 3–4 render inside. The wrapper opens right after the author row and closes right after the SUMMARY conditional block (BEFORE the `{/* PACE / SPEED ... */}` section and before `{isComments && ...}`).

- [ ] **Step 1: Add the `bsSdGrowY` keyframe**

In `bsInjectSessionDetailCss`, after the `bsSdPop` line inside the `@media (prefers-reduced-motion: no-preference)` block, add:

```
      @keyframes bsSdGrowY { 0% { transform: scaleY(0); } 100% { transform: scaleY(1); } }
```

- [ ] **Step 2: Replace the hero block**

Replace the ENTIRE current hero block (the `{/* hero — boots on entry ... */}` comment through the closing `</div>` of the heroStat plate, currently ~10887–10910) with:

```jsx
        {/* author hairline — a hard "filed-by" cut between the byline and the
            hero zone (the heat-wash that used to bleed over the author row is
            deleted; the rail below carries the page temperature instead). */}
        <div aria-hidden style={{ height: 1, background: bsTHexA(t.INK, 0.08), margin: '14px 0 0' }} />
        {/* ── OPEN LEDGER — hero → route → summary threaded on the heat rail ── */}
        <div style={{ position: 'relative', paddingLeft: 15 }}>
          <div aria-hidden style={{ position: 'absolute', left: 0, top: 6, bottom: 0, width: 2, borderRadius: 1, background: `linear-gradient(180deg, ${heat}, ${bsTHexA(heat, 0.35)} 38%, ${bsTHexA(t.INK, 0.12)} 72%, transparent)`, ...(sdReduced ? null : { transformOrigin: 'top', animation: 'bsSdGrowY 1100ms cubic-bezier(.4,0,.2,1) 200ms both' }) }} />
          {!sdReduced && <span aria-hidden style={{ position: 'absolute', left: -0.5, top: 96, width: 3, height: 10, borderRadius: 2, background: heat, '--sd-glow': bsTHexA(heat, 0.4), animation: 'bsSdPrBreath 3.2s ease-in-out 1500ms infinite' }} />}
          <div style={{ fontFamily: t.DISPLAY, fontSize: 25, fontWeight: 800, color: t.INK, letterSpacing: '-0.025em', lineHeight: 1.08, marginTop: 18 }}>{d.title}{/[.!?]$/.test(String(d.title || '')) ? null : <span style={{ color: heat }}>.</span>}</div>
          {d.heroStat && (() => {
            const u = bsSdSplitUnit(d.heroStat[1]);
            return (
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.5), marginTop: 14 }}>{d.heroStat[0]}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 'min(50px, 12.5vw)', fontWeight: 700, color: t.INK, letterSpacing: '-0.04em', lineHeight: 0.95, fontVariantNumeric: 'tabular-nums' }}>
                    <BSSdCountUp text={u.num} duration={780} delay={120} />
                  </span>
                  {u.unit ? <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: bsTHexA(t.INK, 0.55) }}>{u.unit}</span> : null}
                  {d.prDelta && (
                    <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK, borderBottom: `1px solid ${heat}`, paddingBottom: 2, whiteSpace: 'nowrap', ...(sdReduced ? null : { animation: 'bsSdFadeUp 420ms ease 720ms both' }) }}>
                      <span style={{ color: heat }}>↑</span> PR {d.prDelta}
                    </span>
                  )}
                </div>
                <div aria-hidden style={{ height: 2, marginTop: 11, background: `linear-gradient(90deg, ${heat}, ${bsTHexA(heat, 0.25)} 55%, transparent)`, transformOrigin: 'left', ...(sdReduced ? null : { animation: 'bsSdDrawX 900ms cubic-bezier(.4,0,.2,1) 80ms both' }) }} />
              </div>
            );
          })()}
```

Deletions this replacement performs (verify in the diff): the heat-wash div (`inset: '-18px -16px -14px'`), the standalone 2px title pulse-rule, both hero clip-path plate layers, the 3px spine, the corner bracket, and the pill PR chip.

- [ ] **Step 3: Close the wrapper after Summary**

The `d.body` paragraph, the `d.coSign` block, the route block, and the SUMMARY conditional now sit INSIDE the wrapper (indent only — no content change in this task). Insert the closing `</div>` immediately after the SUMMARY block's closing `)}` (currently ~line 10935) and BEFORE the `{/* PACE / SPEED ... */}` comment. The charts, Output, and `{isComments && ...}` sections stay outside.

- [ ] **Step 4: Verify**

Run the parse-check (same command as Task 1 Step 6) → clean.
Run from `mobile-app/`: PowerShell `$env:VITE_BASE='/m/'; npm run build` → build succeeds.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat: session details open-ledger hero + heat rail; delete the author-row bleed wash"
```

---

### Task 3: Route — unboxed self-drawing polyline + redaction placeholder

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — add `BSSdRoute` after `BSSdBars` (~line 10732), replace the route block inside `BSActivityDetail` (the `{d.routeObj ? ... : d.showRoute && ...}` block, ~10921–10925 pre-Task-2 numbering).

**Interfaces:**
- Consumes: `useBSSdInView`, `bsSdReduced`, `bsTHexA`; `d.routeObj` (`{ points: [[x,y]…] (0–100 viewBox coords), provider?, privacy?, area?, kind? }` — same shape `BSActivityRoutePreview` reads at line ~6361), `d.showRoute`.
- Produces: `function BSSdRoute({ route, heat, t })` — returns `null` when `route.points` has <2 entries (matching `BSActivityRoutePreview`'s own guard, so behavior on degenerate routes is unchanged).

- [ ] **Step 1: Add the `BSSdRoute` component** (after `BSSdBars`, before the `BSActivityDetail` comment block):

```jsx
// The route inked straight onto the paper — no box, no fill. The heat-stroked
// polyline draws itself in-view (the BSSdTrace dash recipe); hollow ink start
// square, popping heat end dot, honest provider/privacy caption (never
// fabricated). Same stretched-viewBox geometry as BSActivityRoutePreview.
function BSSdRoute({ route, heat, t }) {
  const [ref, seen] = useBSSdInView();
  const reduced = bsSdReduced();
  const pts = (route && Array.isArray(route.points)) ? route.points : [];
  if (pts.length < 2) return null;
  const dPath = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const [sx, sy] = pts[0];
  const [ex, ey] = pts[pts.length - 1];
  const caption = [route.provider ? String(route.provider).toUpperCase() : '', route.privacy ? String(route.privacy).toUpperCase() : ''].filter(Boolean).join(' · ');
  const lbl = { position: 'absolute', fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.1em', color: bsTHexA(t.INK, 0.45), pointerEvents: 'none' };
  return (
    <div ref={ref}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.55), margin: '20px 0 8px' }}>
        <span aria-hidden style={{ width: 6, height: 1.5, background: heat, marginLeft: -15 }} />
        <span>Route · GPS</span>
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: 96, display: 'block' }}>
          <path d={dPath} fill="none" stroke={heat} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
            pathLength={1} strokeDasharray={reduced ? 'none' : 1} strokeDashoffset={reduced ? 0 : (seen ? 0 : 1)} style={{ transition: 'stroke-dashoffset 1100ms cubic-bezier(.4,0,.2,1) 120ms' }} />
        </svg>
        <span aria-hidden style={{ position: 'absolute', left: `min(max(calc(${sx}% - 2px), 0px), calc(100% - 5px))`, top: `min(max(calc(${sy * 0.96}% - 2px), 0px), calc(100% - 5px))`, width: 5, height: 5, border: `1.2px solid ${t.INK}`, background: 'transparent' }} />
        {(seen || reduced) && <span aria-hidden style={{ position: 'absolute', left: `min(max(calc(${ex}% - 3px), 0px), calc(100% - 6px))`, top: `min(max(calc(${ey * 0.96}% - 3px), 0px), calc(100% - 6px))`, width: 6, height: 6, borderRadius: 999, background: heat, boxShadow: `0 0 0 3px ${bsTHexA(heat, 0.18)}`, ...(reduced ? null : { animation: 'bsSdPop 340ms ease 1240ms both' }) }} />}
        <span style={{ ...lbl, left: `min(max(calc(${sx}% - 16px), 0px), calc(100% - 36px))`, top: `min(calc(${sy * 0.96}% + 5px), calc(100% - 11px))`, ...(reduced ? null : { opacity: seen ? 1 : 0, transition: 'opacity 380ms ease 900ms' }) }}>START</span>
        <span style={{ ...lbl, left: `min(max(calc(${ex}% - 12px), 0px), calc(100% - 28px))`, top: `min(calc(${ey * 0.96}% + 6px), calc(100% - 11px))`, ...(reduced ? null : { opacity: seen ? 1 : 0, transition: 'opacity 380ms ease 1000ms' }) }}>END</span>
      </div>
      {caption ? <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 6.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.4) }}>{caption}</div> : null}
    </div>
  );
}
```

- [ ] **Step 2: Replace the route block in `BSActivityDetail`**

Replace the current `{d.routeObj ? <div style={{ marginTop: 14 }}><BSActivityRoutePreview .../></div> : d.showRoute && ( ...halftone box... )}` with:

```jsx
        {d.routeObj ? <BSSdRoute route={d.routeObj} heat={heat} t={t} /> : d.showRoute && (
          <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 2px' }} aria-label="GPS not recorded">
            <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${bsTHexA(t.INK, 0.25)}` }} />
            <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.45), padding: '0 8px', ...(sdReduced ? null : { animation: 'bsSdFadeUp 420ms ease 100ms both' }) }}>GPS · Not recorded</span>
            <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${bsTHexA(t.INK, 0.25)}` }} />
          </div>
        )}
```

Note: `BSSdRoute` returns `null` for <2 points, which matches `BSActivityRoutePreview`'s existing guard — no visible regression on degenerate routes. `BSActivityRoutePreview` itself is untouched (feed cards keep it); if its import/reference becomes unused in this file, leave it (the feed card path still renders it at ~line 11307).

- [ ] **Step 3: Verify** — parse-check clean; mobile build succeeds.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat: session details unboxed self-drawing route + GPS redaction placeholder"
```

---

### Task 4: Two-register summary ledger + pace needle; delete the tile grid

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — add `BSSdLedger` after `BSSdRoute`; replace the SUMMARY block; delete `statTile`, `sumCols`, `outputStats`, the OUTPUT section, and (if then unused inside the component) the `clip` helper.

**Interfaces:**
- Consumes: `bsSdRankStats`, `bsSdSplitUnit`, `bsSdNeedle` (Task 1); `ghostFor`, `heat`, `summaryStats`, `isRideSport`, `d.paceTrace` — all already in scope in `BSActivityDetail`.
- Produces: `function BSSdLedger({ primary, secondary, heat, t, ghostFor, paceTrace, isRide })`.

- [ ] **Step 1: Add the `BSSdLedger` component** (after `BSSdRoute`):

```jsx
// The two-register summary ledger. Primaries = full-width baseline rows (30px
// figures; AVG PACE carries the needle band, HR its ghost trace at 0.11);
// then the ink→heat divider; secondaries = telegram dot-leader lines (15px).
// Zero boxes — hierarchy is size + rule weight only. The needle renders ONLY
// from a real pace trace (bsSdNeedle returns null otherwise).
function BSSdLedger({ primary, secondary, heat, t, ghostFor, paceTrace, isRide }) {
  const [ref, seen] = useBSSdInView();
  const reduced = bsSdReduced();
  const paceRe = /pace|speed/i, hrRe = /\bhr\b|heart|bpm/i;
  const unitSpan = (u, size) => (u ? <span style={{ fontFamily: t.MONO, fontSize: size, fontWeight: 700, color: bsTHexA(t.INK, 0.55), marginLeft: 4 }}>{u}</span> : null);
  return (
    <div ref={ref}>
      {primary.map(([k, v], i) => {
        const u = bsSdSplitUnit(v);
        const isPace = paceRe.test(String(k));
        const needle = isPace ? bsSdNeedle(v, paceTrace, isRide ? 'speed' : 'pace') : null;
        const ghost = (!isPace && hrRe.test(String(k))) ? ghostFor(k) : null;
        return (
          <div key={`${k}-${i}`} style={{ position: 'relative', padding: '11px 0 12px', borderBottom: `1px solid ${bsTHexA(t.INK, 0.08)}`, ...(reduced ? null : { animation: `bsSdFadeUp 460ms ease ${i * 90}ms both` }) }}>
            {ghost && (
              <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', right: 0, bottom: 8, width: 132, height: 'calc(100% - 16px)', opacity: seen ? 0.11 : 0, transition: 'opacity 700ms ease 650ms' }}>
                <path d={ghost} fill="none" stroke={heat} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.5), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '46%' }}>{k}</span>
              <span style={{ position: 'relative', fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <BSSdCountUp text={u.num} run={seen} duration={800} delay={180 + i * 90} />
                {unitSpan(u.unit, 10)}
              </span>
            </div>
            {needle && (
              <div aria-hidden>
                <div style={{ position: 'relative', height: 15, marginTop: 8 }}>
                  <svg viewBox="0 0 100 15" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    {Array.from({ length: 25 }, (_, ti) => {
                      const x = (ti / 24) * 100, tall = ti % 5 === 0;
                      return <line key={ti} x1={x} y1={tall ? 1 : 4} x2={x} y2={tall ? 14 : 11} stroke={bsTHexA(t.INK, tall ? 0.32 : 0.18)} strokeWidth="1" vectorEffect="non-scaling-stroke" />;
                    })}
                  </svg>
                  <span style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: heat, left: `calc(${(seen || reduced) ? needle.frac * 100 : 0}% - 1px)`, transition: reduced ? 'none' : 'left 700ms cubic-bezier(.3,.7,.2,1) 140ms' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: t.MONO, fontSize: 7, fontWeight: 700, color: bsTHexA(t.INK, 0.45), fontVariantNumeric: 'tabular-nums' }}>
                  <span>{needle.lo}</span><span>{needle.hi}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {secondary.length > 0 && (
        <>
          <div aria-hidden style={{ height: 2, background: `linear-gradient(90deg, ${t.INK}, ${heat} 70%)`, transformOrigin: 'left', ...(reduced ? null : { animation: 'bsSdDrawX 700ms cubic-bezier(.4,0,.2,1) 300ms both' }) }} />
          {secondary.map(([k, v], i) => {
            const u = bsSdSplitUnit(v);
            return (
              <div key={`${k}-${i}`} style={{ display: 'flex', alignItems: 'baseline', padding: '7px 0', ...(reduced ? null : { animation: `bsSdFadeUp 460ms ease ${380 + Math.min(i, 9) * 55}ms both` }) }}>
                <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.45), whiteSpace: 'nowrap' }}>{k}</span>
                <span aria-hidden style={{ flex: 1, margin: '0 8px', borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-3px)' }} />
                <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  <BSSdCountUp text={u.num} run={seen} duration={650} delay={420 + Math.min(i, 9) * 55} />
                  {unitSpan(u.unit, 8.5)}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace the SUMMARY block**

Replace the current block (secHead + the `gridTemplateColumns` tile grid) with:

```jsx
        {!isComments && summaryStats.length > 0 && (() => {
          const { primary, secondary } = bsSdRankStats(summaryStats);
          return (
            <>
              {secHead('Summary')}
              <BSSdLedger primary={primary} secondary={secondary} heat={heat} t={t} ghostFor={ghostFor} paceTrace={d.paceTrace} isRide={isRideSport} />
            </>
          );
        })()}
```

- [ ] **Step 3: Delete the dead tile machinery**

- Delete the `statTile` function and the `sumCols` const (its only consumer).
- Delete the `outputStats` const (hardcoded `[]`) and the entire `{!isComments && outputStats.length > 0 && (...)}` OUTPUT section.
- Grep `clip(` within `BSActivityDetail`; if the hero-plate deletion (Task 2) and `statTile` were its only callers, delete the `clip` helper too.

- [ ] **Step 4: Verify** — parse-check clean; `npm test` all pass; mobile build succeeds.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat: session details two-register summary ledger + pace needle; drop the tile grid"
```

---

### Task 5: Full verification, WORKLOG, PR

**Files:**
- Modify: `docs/WORKLOG.md` (dated changelog entry at the top of the Changelog section)

- [ ] **Step 1: Full local verify**

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
npm test
```
PowerShell, from `mobile-app/`: `$env:VITE_BASE='/m/'; npm run build` → succeeds.
Optional visual: preview the built page in a headless browser against a run fixture (hero counts, rail draws, route draws, ledger staggers) and a strength fixture (promoted primaries, no needle, redaction line only if `showRoute`).

- [ ] **Step 2: WORKLOG entry**

Append a dated `### 2026-07-03 — Session Details "Open Ledger" (#PR)` entry summarizing: unboxed hero + heat rail, self-drawing route + redaction placeholder, two-register ledger + pace needle, the bleed-wash deletion, the new `sessionLedger.mjs` + 10 tests, and the on-device pass recommendation. Normalize LF, commit as `docs: worklog — session details open ledger`.

- [ ] **Step 3: Push + PR + gates**

```bash
git push -u origin claude/home-sd-redesign
```
Open the PR against `main` via the GitHub REST API (gh CLI is not installed — use git's stored token, per the house mechanism). Title: `Session Details "Open Ledger" — unboxed hero, heat rail, self-drawing route, summary ledger + pace needle`. Body: spec link + before/after + the honest-data notes + "on-device pass recommended".
Wait for CI green (Web · Mobile · gitleaks) AND CodeRabbit's review; address every finding; squash-merge only when green + 0 unresolved threads; keep the branch; re-sync per the house flow.
