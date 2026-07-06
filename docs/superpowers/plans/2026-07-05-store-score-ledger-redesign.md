# Shape Score "The Standing" + Shape Store "The Shop/Drop" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the two June-era client surfaces `BSShapeScorePage` and `BSShapeStorePage` in the shipped Open Ledger language — Score → "The Standing" (verdict + the ladder/tier standing chart), Store → "The Shop, opened by The Drop" (S8).

**Architecture:** Presentation-only rebuild of two React components inside one file (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`), plus one net-new pure derivation module + its tests. No data/backend/commerce-flow changes — every RPC, catalogue, cart, checkout, and membership gate is invariant (spec §Invariants). Both pages reuse the existing Open Ledger primitive kit (`BSTStationHead`, `BSTRedact`, `BSTLedgerStat`, `BSTerrainTabs`, `BSSdCountUp`, `useBSSdInView`) and the `bsInjectSessionDetailCss` keyframes; nothing new is added to the motion system.

**Tech Stack:** React (babel-in-file broadsheet, `iosAppBroadsheetClient.jsx`), plain-ESM pure modules under `mobile-app/src/services/*.mjs`, `node --test` for units. Mobile bundle built with Vite; `public/m` built at deploy.

**Spec:** `docs/superpowers/specs/2026-07-05-store-score-ledger-design.md` — read it in full before starting; this plan implements it and does not restate every prose detail.

## Global Constraints

Copied verbatim from the spec — every task's requirements implicitly include these:

- **Presentation only.** No change to: `_bsUseLiveScore`, `BS_STORE_PRODUCTS` + its module-scope retail→cost derivation, `window.ShapeStore.get/redeem/checkout/redeemLeadBoost`, cart persistence (`shape.storeCart`, 9-qty cap, merch-only), `useBSMembership`, `bsStartPlatformCheckout`, the confirm + shipping flows, `BSStoreCheckout`, error/notice message strings, `bsIsCoachRole` role catalogues + coach tier ladder, the cross-nav props (`onBack`, `onOpenStore`, `onOpenScore`, `profile`). The pros bundle consumes both pages via `window` — keep the exports/props identical.
- **Heat = the viewer's tier** = `bsTierColor(profile.tier)` (client or coach ladder, resolved by `_bsUseLiveScore`) — **line-only**. Tier-colored running text demotes to ink-alphas. The constant teal accent (`#0a8f87`/`#34d6c5`) and hardcoded rust literals in the current pages die except where re-sanctioned below.
- **Teal** (`t.isLight ? '#0a8f87' : '#34d6c5'`) = live/action only. Store: commerce CTAs (ADD / REDEEM / cart bar) only. Score: only the signed-out momentum sign-in line.
- **Rust** = penalties/at-risk only, always NAMED in mono text, never color-only. Tier names keep their own tier colors.
- **Motion:** one-shot entrances via `useBSSdInView` + per-station `seen`, existing `bsInjectSessionDetailCss` keyframes ONLY (`bsSdFadeUp`, `bsSdDrawX`, `bsSdDrawLine`, `bsSdGrowY`, `bsSdPrBreath`, `bsSdBurst`); count-ups via `BSSdCountUp`; every animated style spreads `...(bsSdReduced() ? null : seen ? {animation} : {hidden-initial})`. **One breathing loop max per page** — Score spends it on the chart you-dot (`bsSdPrBreath`); the Store has none.
- **Honest data:** every absent case → a `BSTRedact` redaction line or an honest `—`; nothing fabricated. `_bsUseLiveScore`, signed-out preview, and `bsRequireAccount` gating carry over verbatim.
- **≥44px tap targets** on every tappable control (invisible padding where the visual is smaller).
- **Windows/session gates (per commit):** JSX parse-check · PowerShell mobile build (`$env:VITE_BASE='/m/'`) exit 0 · full `npm test` green · LF-normalize any file the Edit tool touched (`sed -i 's/\r$//' <file>`). Local `tsc`/`next build` have known baseline failures — CI is the real gate. Do NOT hand-commit `public/m` (built at deploy).
- **Reused-primitive reference (exact signatures, all in `iosAppBroadsheetClient.jsx`):**
  - `BSTStationHead({ heat, INK, label, meta })` — mono eyebrow + heat tick + optional right meta.
  - `BSTRedact({ INK, label })` — dashed honest-absent line.
  - `BSTLedgerStat({ INK, label, value, seen, figSize=30, delay=0, align='left' })` — eyebrow-above-figure register, counts up on `seen`.
  - `BSTerrainTabs({ tabs:[{key,label}], active, onPick, heat, INK, BG, pad=20 })` — typographic tab index, sticky, active label draws a heat underline (`bsSdDrawX`). **Note:** it is `position:sticky top:0` — acceptable inside these pages (the detail header is not sticky). If stickiness fights the layout, pass a plain inline index instead (spec allows either; see Task notes).
  - `BSSdCountUp({ text, run=true, duration=750, delay=0, style })` — count-up; non-numeric/time text renders static.
  - `useBSSdInView()` → `[ref, seen]` — one-shot in-view; reduced motion → seen=true immediately.
  - `bsSdReduced()` → boolean.
  - `bsSdSplitUnit(value)` → `{ num, unit }` (in scope in the broadsheet; imported from `sessionLedger.mjs`).
  - `bsInjectSessionDetailCss()` — call once via `React.useInsertionEffect(() => { bsInjectSessionDetailCss(); }, [])` at the top of each page component.
  - Fonts: `t.DISPLAY` = Space Grotesk (serif-role display), `t.MONO` = JetBrains Mono. `BST_SERIF`/`BST_MONO` module consts are the same faces — the reused primitives use those internally.
  - Theme tokens on `t` (from `useBS()`): `t.INK`, `t.INK70/INK50/INK30` (may not all exist — prefer `bsTHexA(t.INK, α)` for arbitrary alphas), `t.PAPER`, `t.PAPER_BG`, `t.HAIR`, `t.RULE`, `t.ACCENT`, `t.AMBER`, `t.RUST`, `t.GREEN`, `t.padX`, `t.sectGap`, `t.RADIUS_SM`, `t.isLight`, `t.isMetric`.

---

## File Structure

- **Create** `mobile-app/src/services/scoreStanding.mjs` — the one pure derivation (`bsScoreStanding`) both Score chart views and the verdict sub-line read. One responsibility: turn `(tiers, tierName, total)` into placement facts.
- **Create** `tests/score-standing.test.mjs` — unit vectors for the module (root `tests/`, imported via `../mobile-app/src/services/scoreStanding.mjs`).
- **Modify** `package.json:9` (root) — append `tests/score-standing.test.mjs` to the `test` script's file list (the runner enumerates explicitly; an unlisted test never runs).
- **Modify** `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`:
  - `BSShapeScorePage` (~line 18341–18619) — full-body rebuild (Tasks 2–3).
  - `BSShapeStorePage` (~line 18653–end of component before `BSStoreCheckout` at 18976) — full-body rebuild (Tasks 4–5).
  - Add net-new sub-components at module scope near the Store page: `BSStoreGlyph` (Task 4). If a shared standing-chart sub-component is cleaner than an inline IIFE, add `BSScoreStandingChart` near `BSShapeScorePage` (Task 2).
- **Modify** `docs/WORKLOG.md` + `src/lib/warroom.ts` (Task 6) — changelog entry + product-photography follow-up.

Everything lives in one broadsheet file (established codebase pattern; do not restructure it). Tasks 2–3 edit the same function `BSShapeScorePage` sequentially; Tasks 4–5 edit `BSShapeStorePage` sequentially. Each task ends at an independently reviewable, buildable state.

---

## Task 1: `scoreStanding.mjs` pure module + tests

**Files:**
- Create: `mobile-app/src/services/scoreStanding.mjs`
- Test: `tests/score-standing.test.mjs`
- Modify: `package.json` (root, line 9 — the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function bsScoreStanding(tiers, tierName, total)` → `{ laneIndex, laneCount, frac, pct, toNext, curThr, nextThr, topTier, atRisk, nextName }`.
  - `tiers`: the ladder array (`[{ name, range, perk }]`, e.g. `SHAPE_SCORE_TIERS` / `SHAPE_SCORE_TIERS_COACH`). `range` is a display string like `'0+'`, `'750+'`, `'2,000+'`, `'15,000+'` — parse digits only.
  - `tierName`: the current tier name (case-insensitive match against `tiers[].name`).
  - `total`: the numeric rank score.
  - Returns: `laneIndex` (0-based index of the current tier, −1 → 0 fallback), `laneCount` (`tiers.length`), `frac` (0..1 progress through the current tier's lane), `pct` (`Math.round(frac*100)`), `toNext` (points to the next threshold, 0 at top), `curThr`/`nextThr` (numeric thresholds), `topTier` (bool, current tier is the last rung), `atRisk` (bool, `total < curThr`), `nextName` (next tier's name, `''` at top).

- [ ] **Step 1: Write the failing test**

Create `tests/score-standing.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsScoreStanding } from '../mobile-app/src/services/scoreStanding.mjs';

const TIERS = [
  { name: 'Raw', range: '0+' },
  { name: 'Tempo', range: '750+' },
  { name: 'Form', range: '2,000+' },
  { name: 'Peak', range: '5,000+' },
  { name: 'Legend', range: '15,000+' },
];

test('mid-tier: 1,284 in Tempo → 43% of the 750→2,000 lane', () => {
  const s = bsScoreStanding(TIERS, 'Tempo', 1284);
  assert.equal(s.laneIndex, 1);
  assert.equal(s.laneCount, 5);
  assert.equal(s.curThr, 750);
  assert.equal(s.nextThr, 2000);
  assert.equal(s.pct, 43);
  assert.equal(s.toNext, 716);
  assert.equal(s.topTier, false);
  assert.equal(s.atRisk, false);
  assert.equal(s.nextName, 'Form');
});

test('exact threshold: 2,000 sits at Form lane start (frac 0)', () => {
  const s = bsScoreStanding(TIERS, 'Form', 2000);
  assert.equal(s.laneIndex, 2);
  assert.equal(s.frac, 0);
  assert.equal(s.toNext, 3000);
});

test('top tier: Legend → full bar, no next', () => {
  const s = bsScoreStanding(TIERS, 'Legend', 21000);
  assert.equal(s.laneIndex, 4);
  assert.equal(s.topTier, true);
  assert.equal(s.frac, 1);
  assert.equal(s.pct, 100);
  assert.equal(s.toNext, 0);
  assert.equal(s.nextName, '');
});

test('at-risk: rank below the current (high-water) tier floor → frac clamps to 0', () => {
  // Tier held at Tempo (never demotes) but the rank slipped under 750.
  const s = bsScoreStanding(TIERS, 'Tempo', 600);
  assert.equal(s.laneIndex, 1);
  assert.equal(s.atRisk, true);
  assert.equal(s.frac, 0);
});

test('top tier but below floor (high-water Legend, penalised) → empty, at-risk', () => {
  const s = bsScoreStanding(TIERS, 'Legend', 12000);
  assert.equal(s.topTier, true);
  assert.equal(s.atRisk, true);
  assert.equal(s.frac, 0); // NOT 1 — a below-floor top-tier member reads empty
  assert.equal(s.pct, 0);
});

test('coach ladder names resolve the same way', () => {
  const COACH = [
    { name: 'Certified', range: '0+' },
    { name: 'Pro', range: '750+' },
    { name: 'Elite', range: '2,000+' },
    { name: 'Master', range: '5,000+' },
    { name: 'Icon', range: '15,000+' },
  ];
  const s = bsScoreStanding(COACH, 'Pro', 1000);
  assert.equal(s.laneIndex, 1);
  assert.equal(s.nextName, 'Elite');
  assert.equal(s.curThr, 750);
});

test('malformed / missing tier name → laneIndex 0, no crash', () => {
  const s = bsScoreStanding(TIERS, 'Nonsense', 1284);
  assert.equal(s.laneIndex, 0);
  assert.equal(Number.isFinite(s.frac), true);
});

test('empty tiers → safe zeros', () => {
  const s = bsScoreStanding([], 'Tempo', 1284);
  assert.equal(s.laneIndex, 0);
  assert.equal(s.laneCount, 0);
  assert.equal(s.topTier, true); // nothing above → treat as top
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="score standing" 2>&1 | tail -20` (or the whole suite). Expected: FAIL — cannot find module `../mobile-app/src/services/scoreStanding.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile-app/src/services/scoreStanding.mjs`:

```javascript
// The one derivation both Shape Score standing-chart views (THE LADDER / THIS
// TIER) and the verdict sub-line read. Mirrors the existing hero frac math:
// each tier is an ordinal "lane"; frac is the rank's progress through the
// current lane (curThr → nextThr), clamped 0..1. Tiers never demote, so a rank
// below the current (high-water) tier floor is "at risk" and clamps to frac 0.
const parseNum = (s) => Number(String(s == null ? '' : s).replace(/[^0-9]/g, '')) || 0;

export function bsScoreStanding(tiers, tierName, total) {
  const list = Array.isArray(tiers) ? tiers : [];
  const laneCount = list.length;
  const score = Number(total) || 0;
  const wantIdx = list.findIndex((x) => String(x.name).toLowerCase() === String(tierName).toLowerCase());
  const laneIndex = wantIdx >= 0 ? wantIdx : 0;
  const topTier = laneCount === 0 || laneIndex >= laneCount - 1;
  const curThr = laneCount ? parseNum(list[laneIndex].range) : 0;
  const nextThr = (!topTier && list[laneIndex + 1]) ? parseNum(list[laneIndex + 1].range) : (score + 0);
  const nextName = (!topTier && list[laneIndex + 1]) ? String(list[laneIndex + 1].name) : '';
  const span = nextThr - curThr;
  // At-risk first, so the top-tier branch clamps to empty (not a forced full bar)
  // when a last-rung member's rank slipped below the floor.
  const atRisk = laneCount > 0 && score < curThr;
  const frac = topTier ? (atRisk ? 0 : 1) : (span > 0 ? Math.max(0, Math.min(1, (score - curThr) / span)) : 1);
  const pct = Math.round(frac * 100);
  const toNext = topTier ? 0 : Math.max(0, nextThr - score);
  return { laneIndex, laneCount, frac, pct, toNext, curThr, nextThr, topTier, atRisk, nextName };
}
```

- [ ] **Step 4: Register the test in `package.json` and run to verify it passes**

Append ` tests/score-standing.test.mjs` to the end of the `test` script's file list in root `package.json` (line 9), before the closing quote. Then run: `npm test 2>&1 | tail -15`. Expected: PASS — all 7 `score-standing` cases pass, existing suite still green.

- [ ] **Step 5: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/scoreStanding.mjs tests/score-standing.test.mjs package.json
git add mobile-app/src/services/scoreStanding.mjs tests/score-standing.test.mjs package.json
git commit -m "feat(score): scoreStanding.mjs — the ladder/tier standing derivation + tests"
```

---

## Task 2: Shape Score — verdict lead + register row + THE STANDING chart

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSShapeScorePage` header→chart region (currently the `BSDetailHeader` + the composite-hero IIFE, ~18367–18467).
- Add (module scope, just above `BSShapeScorePage`): `BSScoreStandingChart` sub-component.

**Interfaces:**
- Consumes: `bsScoreStanding` (Task 1 — add an import at the top-of-file import block: `import { bsScoreStanding } from '../services/scoreStanding.mjs';` — match how sibling `.mjs` are imported into the broadsheet; verify the existing import style first with `grep "from '../services/" iosAppBroadsheetClient.jsx | head`).
- Produces: `BSScoreStandingChart({ tiers, tier, total, heat, t, seen })` rendering the two-view chart with an internal toggle.

- [ ] **Step 1: Add the CSS-injection hook + import**

At the top of `BSShapeScorePage`'s body (after `const t = useBS();`), add:
```javascript
React.useInsertionEffect(() => { bsInjectSessionDetailCss(); }, []);
const [standScale, setStandScale] = useStateBSC('ladder'); // 'ladder' | 'tier'
const [stationRef, stationSeen] = useBSSdInView();
```
Add the module import near the other `../services/*.mjs` imports.

- [ ] **Step 2: Build `BSScoreStandingChart` (module scope)**

Add above `function BSShapeScorePage`:

```javascript
// THE STANDING — two scales of the same fact. LADDER: the whole tier hierarchy
// as an equal-lane rising line (ordinal x, so Raw→Form don't crush to the left);
// tier-colored threshold nodes; a heat progress path draws to the you-point; the
// you-dot breathes (the page's ONE loop). THIS TIER: the current lane zoomed —
// {tier}→{next} with a heat fill to `frac`. `s` is bsScoreStanding(...).
function BSScoreStandingChart({ tiers, tier, total, heat, t, seen, scale }) {
  const s = bsScoreStanding(tiers, tier, total);
  const INK = t.INK;
  const reduced = bsSdReduced();
  const fmtThr = (n) => Number(n).toLocaleString();
  if (scale === 'tier') {
    const nextColor = s.topTier ? heat : bsTierColor(s.nextName || tier);
    const caption = s.topTier
      ? 'Top tier — nothing above.'
      : `${fmtThr(s.toNext)} to ${s.nextName} · ${s.pct}% through the tier`;
    return (
      <div aria-label={`${fmtThr(total)} points — ${tier}, ${s.pct}% to ${s.nextName || 'the top'}, ${fmtThr(s.toNext)} to go`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: heat }}>{tier} · {fmtThr(s.curThr)}</span>
          {!s.topTier && <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: nextColor }}>{s.nextName} · {fmtThr(s.nextThr)}</span>}
        </div>
        <div style={{ position: 'relative', height: 3, background: t.HAIR }}>
          <div style={{ position: 'absolute', inset: 0, width: `${s.pct}%`, background: heat, transformOrigin: 'left', ...(reduced ? null : seen ? { animation: 'bsSdDrawX 700ms cubic-bezier(.2,.7,.2,1) both' } : { transform: 'scaleX(0)' }) }} />
          <div style={{ position: 'absolute', left: `${s.pct}%`, top: -3.5, width: 10, height: 10, borderRadius: 999, background: heat, transform: 'translateX(-50%)', '--sd-glow': bsTHexA(heat, 0.55), ...(reduced ? null : { animation: 'bsSdPrBreath 2.6s ease-in-out infinite' }) }} />
          <div style={{ position: 'absolute', left: `${s.pct}%`, top: -20, transform: 'translateX(-50%)', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: heat }}>{fmtThr(total)}</div>
        </div>
        <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: bsTHexA(INK, 0.5), fontWeight: 700 }}>{caption}</div>
        <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: bsTHexA(INK, 0.3) }}>Tiers never demote — this bar only moves right</div>
      </div>
    );
  }
  // LADDER view — ordinal lanes. Node i sits at x=(i+0.5)/N... use lane boundaries
  // at x=i/N so the rising polyline spans the whole width; you-point at
  // x=(laneIndex+frac)/N.
  const N = Math.max(1, s.laneCount);
  const W = 300, H = 100, padY = 12;
  const nodeX = (i) => 2 + (i / Math.max(1, N - 1)) * (W - 4);
  const nodeY = (i) => (H - padY) - (i / Math.max(1, N - 1)) * (H - padY - 8); // rise left→low to right→high
  const youX = 2 + ((s.laneIndex + (s.topTier ? 0 : s.frac)) / Math.max(1, N - 1)) * (W - 4);
  // interpolate youY along the polyline segment
  const segLo = Math.min(N - 1, s.laneIndex), segHi = Math.min(N - 1, s.laneIndex + 1);
  const youY = nodeY(segLo) + (nodeY(segHi) - nodeY(segLo)) * (s.topTier ? 0 : s.frac);
  const poly = tiers.map((_, i) => `${i ? 'L' : 'M'}${nodeX(i).toFixed(1)} ${nodeY(i).toFixed(1)}`).join(' ');
  const prog = `M${nodeX(0).toFixed(1)} ${nodeY(0).toFixed(1)} ` + tiers.slice(0, s.laneIndex + 1).map((_, i) => i === 0 ? '' : `L${nodeX(i).toFixed(1)} ${nodeY(i).toFixed(1)}`).join(' ') + ` L${youX.toFixed(1)} ${youY.toFixed(1)}`;
  return (
    <div aria-label={`${fmtThr(total)} points — ${tier}, tier ${s.laneIndex + 1} of ${N}, ${s.pct}% through the tier`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
        <path d={poly} fill="none" stroke={bsTHexA(INK, 0.18)} strokeWidth="2" />
        <path d={prog} fill="none" stroke={heat} strokeWidth="2.5" strokeLinecap="round"
          pathLength="1" strokeDasharray="1" style={{ '--sd-len': 1, ...(reduced || !seen ? { strokeDashoffset: 0 } : { strokeDashoffset: 1, animation: 'bsSdDrawLine 900ms ease forwards' }) }} />
        {tiers.map((tt, i) => (
          <circle key={i} cx={nodeX(i)} cy={nodeY(i)} r={2.5} fill={bsTierColor(tt.name)} />
        ))}
        {/* drop line + you-dot + figure */}
        <line x1={youX} y1={youY + 4} x2={youX} y2={H - 4} stroke={bsTHexA(INK, 0.3)} strokeWidth="1" strokeDasharray="2 3" />
        <circle cx={youX} cy={youY} r={4} fill={heat} style={{ '--sd-glow': bsTHexA(heat, 0.5), ...(reduced ? null : { animation: 'bsSdPrBreath 2.6s ease-in-out infinite' }) }} />
        <text x={youX} y={youY - 9} textAnchor="middle" fill={heat} style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700 }}>{fmtThr(total)}</text>
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, 1fr)`, marginTop: 7 }}>
        {tiers.map((tt, i) => {
          const cur = i === s.laneIndex;
          return (
            <div key={tt.name} style={{ textAlign: i === 0 ? 'left' : i === N - 1 ? 'right' : 'center' }}>
              <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: cur ? 800 : 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: bsTierColor(tt.name) }}>{tt.name}{cur ? '·you' : ''}</div>
              <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7, color: bsTHexA(INK, 0.3) }}>{fmtThr(parseInt(String(tt.range).replace(/[^0-9]/g, ''), 10) || 0)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: bsTHexA(INK, 0.3) }}>Equal lane per tier — the dot's place in its lane is your progress through it</div>
    </div>
  );
}
```

> Implementer note: the label-row spacing (left/center/right per column) may need a small nudge on 320px; verify visually. `bsTierColor` and `bsTHexA` are already in-scope in the broadsheet.

- [ ] **Step 3: Replace the header→hero region of `BSShapeScorePage`**

Replace the current `BSDetailHeader` (keep it, unchanged props) + the entire composite-hero IIFE (the `{(() => { const tc = ... })()}` block, ~18382–18467) with, in order:
1. `BSDetailHeader` — unchanged (eyebrow "Your standing", title `Shape\nScore.` with the italic tier-colored "Score.", trailing STORE button unchanged).
2. **Verdict lead** — serif, replacing the plate. Compute `const st = bsScoreStanding(tiers, tier, scoreTotal);` and `const heat = bsTierColor(tier);`.
   - Headline: `` `${tier}, and climbing.` `` (top tier → `` `${tier}. The top of the ladder.` ``), serif `t.DISPLAY` ~23px/700, the trailing `.` in `heat`.
   - Sub-line (italic serif, ink70): when not at-risk → `` `${(scoreTotal - st.curThr).toLocaleString()} into the tier — ${st.toNext.toLocaleString()} from ${st.nextName}.` `` (top tier → "The highest rank Shape offers."). When `profile.atRisk` (existing field) OR `st.atRisk` → replace the sub-line with the rust at-risk line: `` `⚠ ${Math.max(0, st.curThr - scoreTotal).toLocaleString()} below ${tier} — earn it back to hold` `` in `t.MONO` 8/800, color `t.isLight ? '#c0392b' : '#e0463c'`.
3. **Register row** — three `BSTLedgerStat`s in a flex row with hairline `borderLeft` separators (or reuse the current 3-col grid): SCORE (`value={scoreTotal.toLocaleString()}` `seen={stationSeen}`), THIS WK (`value={weekTxt}`, force `figSize` smaller, keep the `+` — `BSSdCountUp` renders `+86` fine), STREAK (`value={`${streak}d`}`). Use `seen` so they count up in view.
4. **THE STANDING station**:
   ```jsx
   <div ref={stationRef} style={{ padding: `${t.sectGap}px ${t.padX}px 0` }}>
     <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
       <span aria-hidden style={{ flex: 'none', width: 6, height: 1.5, background: heat }} />
       <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.55) }}>The standing</span>
       <span aria-hidden style={{ flex: 1, height: 2, background: `linear-gradient(90deg, ${bsTHexA(t.INK, 0.4)}, ${heat})`, margin: '0 4px' }} />
       {[['ladder', 'The ladder'], ['tier', 'This tier']].map(([k, label]) => {
         const on = standScale === k;
         return (
           <button key={k} onClick={() => setStandScale(k)} aria-pressed={on}
             style={{ position: 'relative', minHeight: 44, padding: '14px 2px 3px', marginTop: -14, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: on ? t.INK : bsTHexA(t.INK, 0.45) }}>
             {label}
             {on && <span aria-hidden style={{ position: 'absolute', left: 2, right: 2, bottom: 1, height: 2, background: heat }} />}
           </button>
         );
       })}
     </div>
     <BSScoreStandingChart tiers={tiers} tier={tier} total={scoreTotal} heat={heat} t={t} seen={stationSeen} scale={standScale} />
   </div>
   ```

Delete the composite-hero locals that are now unused (`tc`, `weekTxt` if reused keep it, the climb geometry `W/H/gp/ys/xs/rg/arc`, `stats`, `pct`, `frac`, `toNext`, etc.) — the module + chart own that math now.

- [ ] **Step 4: Parse-check + build + test**

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})" && echo PARSE_OK
```
Then from PowerShell: `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` → expect exit 0. Then `npm test 2>&1 | tail -5` → green.

- [ ] **Step 5: Visual check (self, per preview-only-when-needed)**

Load the mobile build / a render harness; toggle THE LADDER / THIS TIER; confirm: the progress path draws once, the you-dot breathes (one loop), tier nodes are their own colors, at-risk copy appears when the demo/live rank is below tier, reduced-motion renders finished. Fix layout nits (320px label row, figure clipping).

- [ ] **Step 6: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(score): The Standing — verdict lead + register row + ladder/tier chart"
```

---

## Task 3: Shape Score — momentum station + commitment restyle + typographic tabs

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSShapeScorePage` momentum→footer region (currently the momentum `BSPlate` IIFE ~18472–18504, `BSCommitmentCard` mount 18507, the tab buttons 18510–18517, and the scroll box 18518–18614).

**Interfaces:**
- Consumes: the page-scope `momentum`, `activities`, `penalties`, `tiers`, `ledger`, `rewards`, `available`, `scoreTab`/`setScoreTab`, `stationSeen`, `onOpenStore` already in scope.
- Produces: nothing new.

- [ ] **Step 1: Rebuild the MOMENTUM station** (replace the momentum `BSPlate` IIFE)

Keep every gate exactly (`momentum && (() => {...})()`, `preview`, `reqAuth`, the copy set). Replace the `BSPlate` chrome with a zero-box station:
- Station head via the inline pattern (heat tick + "MOMENTUM · {val}" mono eyebrow + ink→heat rule). `heat` = `bsTierColor(tier)` (compute once at page scope).
- A 2px hairline track (`t.HAIR`) with a heat fill to `val`% (`bsSdDrawX` on seen, gated) and a fixed tick at `left: 80%` (1.5px, `bsTHexA(t.INK,0.5)`).
- The status mono line (exact current copy: banked/streak / "At the line…" / "Reach 80…") in heat when `bonusThisWeek` else ink70.
- Preview → the teal sign-in action line (SANCTIONED teal); the whole station stays the `reqAuth` tap target with `role`/`tabIndex`/`onKeyDown` as today, `minHeight:44`.

- [ ] **Step 2: Restyle `BSCommitmentCard` to a station**

`BSCommitmentCard` is a separate component (line 18217). Two options — pick the lower-risk:
- **(a) Preferred:** wrap the existing `<BSCommitmentCard />` mount unchanged for this task and open a **follow-up** to restyle its internals, OR
- **(b)** if its internals are a self-contained `BSPlate`, restyle in place: swap the plate for a `BSTStationHead heat={heat} INK={t.INK} label="This week's commitment"` + zero-box body, dot-leader rows for targets/stakes, and bump the stepper `−`/`+` targets to `minHeight:44/minWidth:44`. Keep ALL handlers, state, and copy verbatim.

Inspect `BSCommitmentCard` first (`sed -n '18217,18340p'`). If it's tightly coupled, do (a) and note the restyle as a Task-6 follow-up so the page still ships. **Decision recorded in the commit message.**

- [ ] **Step 3: Typographic tab index + inline tab bodies**

Replace the 4 solid-fill buttons (18510–18517) with a typographic index (mono 9/800, active = ink + 2px heat underline; ≥44px). Either use `BSTerrainTabs` (`tabs={[{key:'tiers',label:'Tiers'},...]}`, `heat`, `INK:t.INK`, `BG:t.PAPER`, `pad:t.padX`) — but note it is `position:sticky`; if that fights the page, inline a non-sticky copy of the same markup. Remove the `maxHeight:320` scroll box wrapper — render the active tab inline at natural height.

Re-set each tab body in ledger grammar (all data unchanged):
- **TIERS** — one row per tier: tier name in `bsTierColor(tier.name)` (current bold + "· you") · dotted leader · mono threshold; perk as ink50 mono meta under the name. (This absorbs P1's "climb" content.)
- **REWARDS** — `rewards.map` → dot-leader rows (name · leader · `{cost} pts` + "✓ Redeemable" heat / "{n} to go" ink50), closing "Redeem in the Shape Store →" leader (heat underline, `onClick={onOpenStore}`). Affordability against `available`.
- **POINTS** — `activities` earn rows (dot-leader, `+N` heat) + the **PROTECT YOUR POINTS** rust sub-head (keep its rust rule + rust `−N`) + the "Good to know" copy as a plain ink70 paragraph under a hairline (drop the tinted box). "Spend points… →" leader unchanged.
- **LEDGER** — `ledger.map` → day eyebrow · label · dotted leader · `±N` (earned heat, penalties rust "· waivable").

- [ ] **Step 4: Parse + build + test** (same commands as Task 2 Step 4).

- [ ] **Step 5: Visual check** — all 4 tabs render inline, no scroll box, momentum track draws once (no loop), preview sign-in line teal, commitment stepper ≥44px (if restyled).

- [ ] **Step 6: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(score): momentum station + typographic tab index + ledger-grammar tabs"
```

---

## Task 4: Shape Store — header + balance chip + category index + THE DROP hero + product grid

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSShapeStorePage` header→catalog-grid region (currently `BSDetailHeader` 18796, balance hero 18808–18829, credit card 18831–18842, notice 18844–18848, category pills 18850–18880, `BSSection` + catalog list 18882–18931).
- Add (module scope, near the Store page): `BSStoreGlyph`.

**Interfaces:**
- Consumes: page-scope `store`, `balance`, `credit`, `products`, `visible`, `cat`/`setCat`, `affordable`/`setAffordable`, `categories`, `roleCats`, `isCoach`, `cart`/`addToCart`/`setQty`, `handleRedeem`, `purchasesLocked`, `isMerch`, `SHAPE_PTS_PER_USD`, `t`. Add `const [storeRef, storeSeen] = useBSSdInView();` + `React.useInsertionEffect(() => { bsInjectSessionDetailCss(); }, []);`.
- Produces: `BSStoreGlyph({ id, cat, size, color })`.

- [ ] **Step 1: Add `BSStoreGlyph` (module scope)**

Line-art product glyphs keyed by id/category — honest stand-ins until real photos land. Match the concept board's stroke glyphs (cap, tee, bottle, crewneck, towel, duffel, generic).

```javascript
// Product stand-in glyph (stroke line-art) — used until real product photos are
// dropped into mobile-app/public/store/<id>.png (then BSStoreTile prefers the img).
// Keyed by product id first, then category, then a generic tag.
function BSStoreGlyph({ id = '', cat = '', size = 40, color = 'currentColor' }) {
  const key = /cap/.test(id) ? 'cap' : /tee|crew|towel|duffel|bottle/.test(id) ? id.split('_').pop()
    : cat === 'Shape Merch' ? 'tee' : 'tag';
  const paths = {
    cap: <><path d="M10 23 a10 10 0 0 1 20 0" /><path d="M6 23 h30" /><path d="M20 13 v-2.5" /></>,
    tee: <path d="M13 8 C14.5 10.5 17 12 20 12 C23 12 25.5 10.5 27 8 L33 11 L30 17 L27 15 L27 32 L13 32 L13 15 L10 17 L7 11 Z" />,
    crewneck: <><path d="M13 8 C14.5 10.5 17 12 20 12 C23 12 25.5 10.5 27 8 L33 11 L30 17 L27 15 L27 32 L13 32 L13 15 L10 17 L7 11 Z" /><path d="M15 32 v2 M25 32 v2" /></>,
    bottle: <><rect x="15" y="13" width="10" height="20" rx="4" /><path d="M17 13 v-3 h6 v3" /></>,
    towel: <><rect x="9" y="12" width="22" height="16" rx="2" /><path d="M9 24 h22" /></>,
    duffel: <><rect x="7" y="17" width="26" height="14" rx="7" /><path d="M15 17 a5 5 0 0 1 10 0" /></>,
    tag: <><path d="M11 11 h9 l9 9 -9 9 -9 -9 Z" /><circle cx="15.5" cy="15.5" r="1.4" /></>,
  };
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden style={{ display: 'block', stroke: color, fill: 'none', strokeWidth: 1.4, strokeLinejoin: 'round', strokeLinecap: 'round' }}>
      {paths[key] || paths.tag}
    </svg>
  );
}
```

- [ ] **Step 2: Header + balance chip + category index**

Replace `BSDetailHeader` title with `Gear & perks.` (serif, heat period; `heat = t.ACCENT`? No — Store heat = viewer tier for headings, but the store's action color is teal. Per spec the title period is "heat" = tier color `bsTierColor(profile.tier)`). Keep eyebrow "Store", kicker "Shape Store", trailing SCORE button.

Replace the dark plate hero with a **balance chip row** (right-aligned mono chip on a hairline): `` `${balance.toLocaleString()} pts · ≈$${(balance / SHAPE_PTS_PER_USD).toFixed(2)}` `` — the balance count-up via `BSSdCountUp` on `storeSeen`, the `≈$` in the teal action color (this is a live figure — acceptable). Move `lifetime`/`redeemedCount` OUT (they go to LOCKER, Task 5).

Replace the boxed category pill grid + "Within balance" button with a typographic index: `['All', ...roleCats-as-labels, 'Locker']` + a `Within balance` toggle item. Client labels: `ALL · MERCH · TRAINING · NUTRITION · PERKS · LOCKER`; coach: `ALL · MERCH · COACH TOOLS · LOCKER`. Map display label → the existing `cat` filter value (`'Shape Merch'` etc.); add a new `'Locker'` view value (Task 5 renders it). Active item = ink + 2px heat underline; `Within balance` active = heat underline, toggles `affordable`. ≥44px.

- [ ] **Step 3: THE DROP hero + product grid** (ALL + MERCH views only)

Add a hero-selection helper at page scope. **The hero is picked from the SAME `visible`-filtered merch set** (so "Within balance" hides an unaffordable/locked drop from the hero too — CodeRabbit/Codex finding), preferring a live limited drop, then a new item, then the first affordable merch:
```javascript
const merchVisible = visible.filter((p) => p.cat === 'Shape Merch');
const heroItem = merchVisible.find((p) => p.tag === 'Limited drop') || merchVisible.find((p) => p.tag === 'New') || merchVisible[0] || null;
const gridMerch = merchVisible.filter((p) => !heroItem || p.id !== heroItem.id); // grid EXCLUDES the hero (no dupes — pinned)
```
Render the hero only when `(cat === 'All' || cat === 'Shape Merch')` and `heroItem`:
- Full-bleed framed tile (duotone gradient ground, hairline border): the product image via a shared **`BSStoreImg`** helper that loads the deterministic `/m/store/${id}.png` with an `onError` that swaps to `BSStoreGlyph` (so simply dropping a file into `mobile-app/public/store/` lights it up with zero code change — Codex finding); eyebrow `DROP · {tag or 'Featured'}` top-left in heat; stock fact (`heroItem.stock`) top-right ink50; footer bar inside the frame: serif name + heat period · mono `{cost} pts · ${retail}` + affordability · **teal solid REDEEM/ADD** button (merch → ADD to cart via `addToCart`/`handleRedeem` per the existing merch/non-merch split; non-member → `MEMBERS →` amber → `bsStartPlatformCheckout`).

Product grid (2-col) over **`gridMerch`** (excludes the hero — pinned, no duplicate featured item): each tile = framed `BSStoreImg` area (`PAPER2` ground, hairline) with tag chips (`LIMITED · 30` etc.), name (display 600), mono price line with affordability (`{cost} pts ✓` heat / `{cost} · +{gap}` ink50, tile `opacity:0.6` when unaffordable/locked), and the existing cart mechanics squared (first tap ADD; in-cart → inline `−` qty `+` stepper, squared not pill; tier-locked dim + "Unlocks at {tier}", non-tappable). Reuse the exact handlers already in scope.

**`BSStoreImg` (module scope, near `BSStoreGlyph`):** renders `<img src={`/m/store/${id}.png`}>` and, on the image's `error` event, unmounts the img and renders `<BSStoreGlyph id cat color>` instead — so a real photo wins per item the moment it exists, and every product without one shows the honest line-art glyph.

- [ ] **Step 4: Parse + build + test** (same commands).

- [ ] **Step 5: Visual check** — hero picks the limited drop; grid tiles show glyphs; affordability ✓/+N present (never color-only); ADD → cart; locked tiles dimmed + named; teal only on CTAs; no breathing loop anywhere.

- [ ] **Step 6: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(store): The Shop/Drop — balance chip, category index, drop hero, product grid + BSStoreGlyph"
```

---

## Task 5: Shape Store — SHAPE DISCOUNTS / COACH TOOLS + ON DEPOSIT + LOCKER + notices + cart bar

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the remaining Store regions: the non-merch catalog rows, the credit-wallet card, the notice box, and the sticky cart bar (18831–18842, 18844–18848, 18934–end of component).

**Interfaces:**
- Consumes: same page scope as Task 4 + `unlocked`, `lifetime`, `redeemedCount`, `cartCount`, `cartTotal`, `setCheckoutOpen`, `setNotice`, `notice`, `credit`.

- [ ] **Step 1: SHAPE DISCOUNTS / COACH TOOLS department**

For the non-merch visible items (`visible.filter((p) => p.cat !== 'Shape Merch')`), render a department under a `BSTStationHead heat={heat} INK={t.INK} label={isCoach ? 'Coach tools' : 'Shape discounts'}`. Each row (on hairlines, no cards): display-700 `${retail}` big figure · name + one-line descriptor (`p.brand`, display 600 / ink50 mono) · mono `{cost} pts` + affordability · right-aligned squared **ADD** button (teal outline affordable / hairline+ink30 not). Tap → the EXISTING `handleRedeem(p)` → confirm-sheet flow (unchanged) for non-merch/lead-boost. Show this department when `cat === 'All'` or a service category / `'Coach Tools'` is selected.

- [ ] **Step 2: ON DEPOSIT line** (replace the tinted credit-wallet card)

When `credit.session > 0 || credit.nutrition > 0`, render one dot-leader line under the discounts head: `ON DEPOSIT` mono eyebrow · leader · `` `$${(credit.session/100).toFixed(0)} session / $${(credit.nutrition/100).toFixed(0)} nutrition` `` · a second ink50 line "Applies automatically the next time you book a coach or buy a meal plan." Hidden at zero (as today). Show non-zero regardless of tab.

- [ ] **Step 3: LOCKER view** (new `cat === 'Locker'` branch)

Leads with two `BSTLedgerStat`s (LIFETIME EARNED = `lifetime`, ITEMS REDEEMED = `redeemedCount`, `seen={storeSeen}`), then `unlocked.map` → dot-leader rows (`code` mono · item name · date · `−{cost}`). Empty (`unlocked.length === 0`) → `<BSTRedact INK={t.INK} label="Nothing redeemed yet" />`. Demo codes stay signed-out-only (the existing `liveRedemptions` gating already handles this — do not change it).

- [ ] **Step 4: Notice → amber-spined line; cart bar → squared teal bar**

- Notice: replace the tinted box with a 3px amber-spined zero-box line (`borderLeft: 3px solid ${t.AMBER}` + text), same `notice` string.
- Cart bar: keep the sticky wrapper + `env(safe-area-inset-bottom)` padding; restyle the button from `borderRadius:14` pill to a squared solid-teal bar: mono `CART · {n}` · dotted leader · `{cartTotal} pts · CHECKOUT →`. Same `onClick={() => { setNotice(''); setCheckoutOpen(true); }}`.

- [ ] **Step 5: Remove the dead Store locals**

Delete `storeHeroMuted/Faint/Rule/Hair` (the dark-hero alphas) and any now-unused pieces after the hero died. Keep `BSSection` import if still used elsewhere (grep before deleting the import). Confirm `BSStoreCheckout` (18976) and the confirm/shipping sheets are UNTOUCHED.

- [ ] **Step 6: Parse + build + test** (same commands).

- [ ] **Step 7: Visual check** — discounts big-$ rows; coach role shows COACH TOOLS (Lead Boost) + no client-only items; ON DEPOSIT line when funded; LOCKER registers + codes / redaction when empty; notice amber-spined; cart bar squared teal; confirm-sheet + checkout still work (tap a $25 credit → confirm → redeem).

- [ ] **Step 8: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(store): discounts/coach-tools department + on-deposit + locker + squared cart bar"
```

---

## Task 6: WORKLOG + War Room + whole-branch review handoff

**Files:**
- Modify: `docs/WORKLOG.md` (changelog entry, top of `## Changelog`).
- Modify: `src/lib/warroom.ts` (product-photography follow-up item).

- [ ] **Step 1: WORKLOG changelog entry**

Add a dated `### 2026-07-05 — Shape Score "The Standing" + Shape Store "The Shop/Drop" (#PR)` entry summarizing: the standing chart (ladder/tier toggle, `scoreStanding.mjs` + tests), the momentum/commitment/tabs restyle, the S8 store (drop hero + grid + BSStoreGlyph + discounts department + locker), the kills, and the **product-photography follow-up** (glyphs are stand-ins; drop real shots into `mobile-app/public/store/<id>.png`). Note the wave rules held (heat=tier, teal=action, one loop on the score chart only). Follow the existing entry style (no colored emoji for new additions).

- [ ] **Step 2: War Room follow-up**

Add a `pending` item to the relevant checklist section in `src/lib/warroom.ts`: "Shape Store product photography — drop real product shots into `mobile-app/public/store/<id>.png`; tiles fall back to line-art glyphs until then." No new route to register (presentation only).

- [ ] **Step 3: LF-normalize + commit**

```bash
sed -i 's/\r$//' docs/WORKLOG.md src/lib/warroom.ts
git add docs/WORKLOG.md src/lib/warroom.ts
git commit -m "docs: WORKLOG + War Room — Store/Score Open Ledger redesign + product-photo follow-up"
```

- [ ] **Step 4: Whole-branch review + PR**

Run a thorough whole-branch review (adversarial, strongest model) over the full diff BEFORE opening the PR — hunt: the tier-vs-teal color discipline (heat is line-only tier; teal only on Store CTAs + the one Score sign-in line), any second breathing loop, chart edge cases (top tier, at-risk, 320px), invariants accidentally touched (RPCs/cart/gates/props), missed reduced-motion gate, coach-role catalogue correctness, and `public/m` NOT committed. Fix findings, then open the PR against `main`, wait for CI + CodeRabbit, address every finding, and hold for owner merge (per the wave protocol — the owner reviews and merges on their word).

---

## Self-Review

**1. Spec coverage** (each spec item → task):
- Shared rules (heat/teal/rust, motion, honesty, 44px) → Global Constraints, enforced in every visual task + the Task 6 review.
- Score §1: header/verdict/registers/THE STANDING (ladder+tier+toggle, equal-lane, you-dot loop, at-risk) → Task 2. Momentum station → Task 3. BSCommitmentCard restyle → Task 3 (with a documented fall-back). Typographic tabs + 4 bodies + kills → Task 3. `scoreStanding.mjs` + tests + package.json → Task 1. `BSFooter` unchanged → untouched.
- Store §2: header/balance chip → Task 4. Category index (client+coach labels, Within balance, Locker) → Task 4/5. THE DROP hero (selection rule, non-member CTA) → Task 4. Product grid + imagery/glyph fallback → Task 4 (`BSStoreGlyph`). SHAPE DISCOUNTS/COACH TOOLS → Task 5. ON DEPOSIT → Task 5. LOCKER → Task 5. Notices + cart bar + kills → Task 5. Invariants → Global Constraints + Task 5 Step 5 + Task 6 review. Accessibility → chart `aria-label`s (Task 2), toggle `aria-pressed` (Task 2), affordability text (Tasks 4–5). Verification → each task's build/test steps + Task 6.

**2. Placeholder scan:** No "TBD/handle edge cases/similar to Task N". The one deliberate branch is Task 3 Step 2 (BSCommitmentCard restyle vs defer) — both paths are spelled out with a decision rule and commit-message record; not a placeholder.

**3. Type consistency:** `bsScoreStanding` returns the same field names in Task 1 (module + tests) and Task 2 (`st.curThr`, `st.toNext`, `st.nextName`, `st.atRisk`, `st.laneIndex`, `st.frac`, `st.pct`, `st.topTier`, `st.laneCount`). `BSScoreStandingChart` prop names (`tiers/tier/total/heat/t/seen/scale`) match the Task 2 call site. `BSStoreGlyph` props (`id/cat/size/color`) match its Task 4 usage.

**Note on TDD scope:** only Task 1 carries unit tests (the pure module). Tasks 2–5 are visual React rebuilds in the babel-in-file broadsheet, which the codebase verifies via JSX parse-check + PowerShell mobile build + the full `npm test` suite staying green + a visual pass — the shipped convention for every prior broadsheet wave. Those are each task's real gate.
