# e1RM Next-Load Suggestions (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the live workout session player, suggest the next target load × reps for a logged lift (progressive-overload nudge) as a glanceable, tap-to-fill instrument-plate chip.

**Architecture:** A pure, unit-tested `suggestNextLoad.mjs` (autoregulate off the last session by RPE, sanity-bound against the athlete's e1RM via the Phase-1 `epleyE1rm`, with %-of-e1RM and repeat fallbacks) is consumed in `BSSession` via the existing `useBSStrength()` data. Client-only — reuses Phase 1's `/api/client/strength`; no new endpoint or migration.

**Tech Stack:** Node ESM pure module + `node --test`; React (babel-standalone broadsheet JSX).

## Global Constraints

- **Branch:** `feat/e1rm-next-load`, stacked on `feat/e1rm-progression` (depends on Phase 1's `e1rm.mjs` + `window.ShapeStrength`, which are in PR #1420, not yet on `main`). Keep the branch after merge. The Phase 2 PR targets `main` and is opened/retargeted only **after** PR #1420 merges.
- **No new colored emoji** in UI copy — text/typographic glyphs only.
- **Tests:** repo-root `tests/*.test.mjs`, run via `npm test`; new test files MUST be appended to the root `package.json` `"test"` script. Mobile pure modules import from tests via `../mobile-app/src/services/<file>.mjs`.
- **Mobile build is PowerShell-only** (Git Bash mangles `VITE_BASE=/m/`): `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` then from repo root `Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m`; confirm `/m/assets/` in `public/m/index.html`.
- **Parse-check JSX:** `node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`.
- **CRLF trap:** after editing any `.mjs`/`.jsx`, run `tr -cd '\r' < <file> | wc -c`; strip if non-zero. Repo is LF, no BOM. Commit mobile-source changes with `MSYS_NO_PATHCONV=1 git commit`.
- **Constants (verbatim):** `AUTOREG_RPE = 8`, `BUMP_PCT = 0.025`, `E1RM_CEILING = 1.05`, gym steps `{ kg: 2.5, lb: 5 }`.
- **No owner/migration action** — client-only.
- **Review stack** before the eventual PR: `/code-review` + CodeRabbit; required CI checks green; iterate on `staging`.

---

### Task 1: Pure `suggestNextLoad.mjs` module + tests

**Files:**
- Create: `mobile-app/src/services/suggestNextLoad.mjs`
- Create: `tests/suggest-next-load.test.mjs`
- Modify: `package.json` (root) — append `tests/suggest-next-load.test.mjs` to the `test` script

**Interfaces:**
- Consumes: `epleyE1rm` from `mobile-app/src/services/e1rm.mjs` (Phase 1: `epleyE1rm(load, reps) → number | null`).
- Produces:
  - `suggestNextLoad(lift, move) → { load, reps, unit, basis, rationale, deltaFromLast } | null`
  - `lift` = a `window.ShapeStrength` lift summary `{ currentE1rm, unit, series:[{load,reps,rpe}] } | null`; `move` = the authored move `{ reps, l }`.
  - `basis ∈ 'autoreg' | 'e1rm' | 'repeat'`.
  - constants `AUTOREG_RPE`, `BUMP_PCT`, `E1RM_CEILING`, `GYM_STEP`.

- [ ] **Step 1: Write the failing test**

Create `tests/suggest-next-load.test.mjs`:

```js
// Next-load suggestion for the live session: autoregulate off the last session
// by RPE, sanity-bound against the athlete's e1RM, with %-of-e1RM + repeat
// fallbacks. Pure; consumed by BSSession. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestNextLoad, AUTOREG_RPE, BUMP_PCT, E1RM_CEILING } from '../mobile-app/src/services/suggestNextLoad.mjs';

const lift = (over = {}) => ({ currentE1rm: 140, unit: 'kg', series: [{ load: 100, reps: 5, rpe: 7 }], ...over });

test('autoreg: easy last set (rpe <= 8) bumps a gym step at the authored reps', () => {
  const s = suggestNextLoad(lift(), { reps: '5', l: '100' });
  assert.equal(s.basis, 'autoreg');
  assert.equal(s.reps, 5);
  assert.equal(s.load, 102.5); // 100 * 1.025 = 102.5 → kg step 2.5
  assert.equal(s.deltaFromLast, 2.5);
  assert.equal(s.unit, 'kg');
});

test('autoreg: grindy last set (rpe > 8) holds the load', () => {
  const s = suggestNextLoad(lift({ series: [{ load: 100, reps: 5, rpe: 9.5 }] }), { reps: '5', l: '100' });
  assert.equal(s.basis, 'autoreg');
  assert.equal(s.load, 100);
  assert.equal(s.deltaFromLast, 0);
});

test('autoreg: blank RPE bumps only when the authored reps were hit', () => {
  const hit = suggestNextLoad(lift({ series: [{ load: 100, reps: 5, rpe: null }] }), { reps: '5', l: '100' });
  assert.equal(hit.load, 102.5); // hit 5 reps → bump
  const missed = suggestNextLoad(lift({ series: [{ load: 100, reps: 3, rpe: null }] }), { reps: '5', l: '100' });
  assert.equal(missed.load, 100); // only logged 3 of 5 → hold
});

test('sanity bound: never suggests beyond ~1.05x the current e1RM', () => {
  // e1RM 100, reps 5 → epley ceiling 105; cap load so load*(1+5/30) <= 105 → 90.
  const s = suggestNextLoad({ currentE1rm: 100, unit: 'kg', series: [{ load: 100, reps: 5, rpe: 6 }] }, { reps: '5', l: '100' });
  // 100*1.025=102.5 → epley(102.5,5)=119.6 > 105 → clamped down to <= 90 (a 2.5 step).
  assert.ok(s.load <= 90 + 0.001);
  assert.ok(s.load > 0);
});

test('range reps target the TOP of the range', () => {
  const s = suggestNextLoad(lift(), { reps: '6-8', l: '100' });
  assert.equal(s.reps, 8);
});

test('%-of-e1RM fallback when an e1RM exists but the last load is unusable', () => {
  const s = suggestNextLoad({ currentE1rm: 150, unit: 'kg', series: [{ load: 0, reps: 5, rpe: 7 }] }, { reps: '5', l: '' });
  assert.equal(s.basis, 'e1rm');
  // 150 * 30/35 = 128.57 → 2.5 step → 130 or 127.5 (nearest)
  assert.equal(s.load, 127.5);
});

test('repeat fallback: no e1RM, no usable history, but an authored load', () => {
  const s = suggestNextLoad(null, { reps: '5', l: '60' });
  assert.equal(s.basis, 'repeat');
  assert.equal(s.load, 60);
});

test('null when there is nothing numeric to suggest', () => {
  assert.equal(suggestNextLoad(null, { reps: '5', l: '' }), null);
  assert.equal(suggestNextLoad(null, {}), null);
});

test('lb gym step is 5', () => {
  // currentE1rm 216 is consistent with 185x5 (epley ~216), so the bump to 190
  // stays under the 1.05x ceiling (226.8) and is NOT clamped.
  const s = suggestNextLoad(lift({ unit: 'lb', currentE1rm: 216, series: [{ load: 185, reps: 5, rpe: 7 }] }), { reps: '5', l: '185' });
  // 185 * 1.025 = 189.625 → nearest 5 = 190
  assert.equal(s.load, 190);
  assert.equal(s.unit, 'lb');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/suggest-next-load.test.mjs`
Expected: FAIL — `Cannot find module '../mobile-app/src/services/suggestNextLoad.mjs'`.

- [ ] **Step 3: Write the module**

Create `mobile-app/src/services/suggestNextLoad.mjs`:

```js
// Next-load suggestion for the live session player. Autoregulate off the most
// recent session for the lift (bump when the last set was easy / hit reps, hold
// when grindy), sanity-bound against the athlete's current e1RM, with a
// %-of-e1RM fallback and finally "repeat the last/authored load". Pure (no I/O);
// the only dependency is epleyE1rm (the shared Phase-1 Epley model). Run: node --test

import { epleyE1rm } from './e1rm.mjs';

export const AUTOREG_RPE = 8;      // last set at/under this effort → bump
export const BUMP_PCT = 0.025;     // ~2.5% progressive-overload step
export const E1RM_CEILING = 1.05;  // never suggest beyond 1.05x the current e1RM
export const GYM_STEP = { kg: 2.5, lb: 5 };

const stepFor = (unit) => GYM_STEP[unit] || GYM_STEP.lb;
const roundToStep = (x, step) => Math.round(x / step) * step;
const round1 = (n) => Math.round(n * 10) / 10;

function pnum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  return parseFloat(String(v));
}

// "6-8" → 8 (top of the range); "8" → 8; "" / null → null
function targetReps(authored) {
  if (authored == null) return null;
  const nums = String(authored).match(/\d+/g);
  return nums && nums.length ? Math.max(...nums.map(Number)) : null;
}

// lift: a window.ShapeStrength lift summary { currentE1rm, unit, series:[{load,reps,rpe}] } | null
// move: the authored move { reps, l }
// → { load, reps, unit, basis, rationale, deltaFromLast } | null
export function suggestNextLoad(lift, move) {
  const unit = (lift && lift.unit) || 'lb';
  const step = stepFor(unit);
  const series = lift && Array.isArray(lift.series) ? lift.series : [];
  const last = series.length ? series[series.length - 1] : null;
  const e1 = lift && Number.isFinite(Number(lift.currentE1rm)) ? Number(lift.currentE1rm) : null;

  let reps = targetReps(move && move.reps);
  const lastLoad = last ? pnum(last.load) : NaN;
  const lastReps = last ? pnum(last.reps) : NaN;
  const lastRpe = last && last.rpe != null ? pnum(last.rpe) : null;
  if (reps == null && Number.isFinite(lastReps)) reps = lastReps;
  const authoredLoad = pnum(move && move.l);

  let load = null, basis = null, rationale = '', deltaFromLast = null;

  if (Number.isFinite(lastLoad) && lastLoad > 0) {
    // 1) autoregulate off the last session
    const hitReps = reps == null || (Number.isFinite(lastReps) && lastReps >= reps);
    const easy = (lastRpe != null && lastRpe <= AUTOREG_RPE) || (lastRpe == null && hitReps);
    if (easy) {
      load = Math.max(lastLoad + step, roundToStep(lastLoad * (1 + BUMP_PCT), step));
      basis = 'autoreg';
      rationale = lastRpe != null ? `+${round1(load - lastLoad)} from last · felt easy` : `+${round1(load - lastLoad)} from last`;
    } else {
      load = lastLoad;
      basis = 'autoreg';
      rationale = 'hold · last set was hard';
    }
    // 2) sanity-bound vs current e1RM
    if (e1 != null && reps != null) {
      const cap = epleyE1rm(load, reps);
      if (cap != null && cap > e1 * E1RM_CEILING) {
        const denom = reps <= 1 ? 1 : 1 + reps / 30;
        load = roundToStep((e1 * E1RM_CEILING) / denom, step);
        rationale = `capped near your e1RM`;
      }
    }
    deltaFromLast = round1(load - lastLoad);
  } else if (e1 != null && reps != null) {
    // 3) %-of-e1RM fallback (e1RM exists but no usable last load)
    load = roundToStep(e1 * (30 / (30 + reps)), step);
    basis = 'e1rm';
    rationale = `≈${Math.round((30 / (30 + reps)) * 100)}% of your e1RM`;
  } else if (Number.isFinite(authoredLoad) && authoredLoad > 0) {
    // 4) repeat the authored/last load
    load = authoredLoad;
    basis = 'repeat';
    rationale = 'repeat last';
  } else {
    return null; // 5) nothing numeric to suggest
  }

  load = roundToStep(load, step);
  if (!Number.isFinite(load) || load <= 0) return null;
  return { load, reps, unit, basis, rationale, deltaFromLast };
}
```

- [ ] **Step 4: Register the test + run it**

Append ` tests/suggest-next-load.test.mjs` to the end of the root `package.json` `"test"` script. Then run `npm test`.
Expected: PASS — all suggest-next-load tests green, existing suite unaffected.

- [ ] **Step 5: CRLF check + commit**

```bash
for f in mobile-app/src/services/suggestNextLoad.mjs tests/suggest-next-load.test.mjs; do echo "$f $(tr -cd '\r' < "$f" | wc -c)"; done
git add mobile-app/src/services/suggestNextLoad.mjs tests/suggest-next-load.test.mjs package.json
MSYS_NO_PATHCONV=1 git commit -m "feat: suggestNextLoad pure module (autoreg + e1RM-bound + fallbacks) + tests"
```

---

### Task 2: Wire the suggestion chip into `BSSession`

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSSession` (starts line 17272): import-less use of the new module via a small in-file consumer, the `useBSStrength()` hook, the chip render, and the tap-to-fill handler.

**Interfaces:**
- Consumes: `suggestNextLoad` (Task 1); `useBSStrength()` (Phase 1, in-file at ~line 14930 — returns `{ lifts:[{key,...}] } | null`); `updateSetInput(i, field, value)`, `moveIdx`, `move`, `completed`, `setInputs` (existing `BSSession` locals); the `teal` / `t` theme tokens; the instrument-plate idiom at lines 17542 / 17499.
- Produces: a visible suggestion chip + tap-to-fill in the live session.

**Note on importing the pure module into the babel-standalone bundle:** `iosAppBroadsheetClient.jsx` is a Vite-bundled module, so a top-level `import` is fine (the file already imports other `../services/*` modules — verify by grepping `^import` at the top of the file and add `import { suggestNextLoad } from '../services/suggestNextLoad.mjs';` alongside them). If the file uses a non-import convention for services, match that convention instead.

- [ ] **Step 1: Add the import**

At the top of `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`, with the other `../services/*` imports, add:

```js
import { suggestNextLoad } from '../services/suggestNextLoad.mjs';
```

(Confirm the existing import style first — grep `from '../services/` at the top of the file.)

- [ ] **Step 2: Pull strength data + compute the suggestion in `BSSession`**

Inside `BSSession` (after the `const [moves, setMoves] = ...` / hooks block near line 17288, with the other hooks — must be unconditional, before any early return), add:

```js
  const _bsStrength = useBSStrength();
```

Then where `move` is defined for the current render (the component already derives `const move = moves[moveIdx]` — locate it; it is used at line 17502 `move.sets`), compute the suggestion just after `move` is available:

```js
  const _bsSug = (() => {
    if (!move || !move.m) return null;
    const lift = (_bsStrength && Array.isArray(_bsStrength.lifts))
      ? _bsStrength.lifts.find((l) => l.key === String(move.m).trim().toLowerCase())
      : null;
    const s = suggestNextLoad(lift, move);
    // Only surface progression-adding suggestions ('repeat' just echoes the
    // "Last ·" line). The set inputs are lb-only, so suppress a non-lb suggestion
    // (filling kg as lb would corrupt the logged load).
    return s && s.basis !== 'repeat' && s.unit === 'lb' ? s : null;
  })();
  const _bsFillSuggestion = () => {
    if (!_bsSug) return;
    let i = 0;
    while (i < move.sets && completed[`${moveIdx}-${i}`]) i += 1;
    if (i >= move.sets) i = move.sets - 1;
    const cur = setInputs[`${moveIdx}-${i}`] || {};
    // Don't clobber an athlete-typed load: only fill when it's still the pre-filled
    // default (move.l) or empty; reps only when blank. (updateSetInput uses
    // functional updaters so the load + reps writes compose, not clobber.)
    const loadIsDefault = cur.load == null || String(cur.load) === '' || String(cur.load) === String(move.l || '');
    if (loadIsDefault) updateSetInput(i, 'load', String(_bsSug.load));
    if (_bsSug.reps != null && (cur.reps == null || String(cur.reps) === '')) updateSetInput(i, 'reps', String(_bsSug.reps));
  };
```

(If `move` is not already a single local in `BSSession`, define `const move = moves[moveIdx];` adjacent to the existing usage — but it is already referenced bare as `move`, so the local exists; place the snippet after it.)

- [ ] **Step 3: Render the chip above the set grid**

Insert the chip JSX immediately AFTER the "Current exercise" block (the `<div>` that closes at line 17537, right after the `{move.l && <div>…Last · {move.l}…</div>}`) and BEFORE the `{/* Plate math */}` block at line 17539:

```jsx
      {/* Suggested next load (e1RM progression nudge) */}
      {_bsSug && (
        <div style={{ padding: `14px ${t.padX}px 0` }}>
          <button
            onClick={_bsFillSuggestion}
            aria-label={`Use suggested load ${_bsSug.load} ${_bsSug.unit}`}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', clipPath: 'polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 0 100%)', borderRadius: 6, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${teal}`, background: t.PAPER2, padding: 14 }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal, fontWeight: 800 }}>Suggested</span>
              <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Tap to use →</span>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{_bsSug.load}<span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50 }}> {_bsSug.unit}</span></span>
              {_bsSug.reps != null && <span style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK50 }}>× {_bsSug.reps}</span>}
            </div>
            <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50, fontWeight: 600 }}>{_bsSug.rationale}</div>
          </button>
        </div>
      )}
```

- [ ] **Step 4: Parse-check + mobile build + resync (PowerShell)**

```bash
node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Then in **PowerShell**:
```powershell
cd mobile-app; $env:VITE_BASE='/m/'; npm run build
cd ..; Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m
```
Confirm `/m/assets/` appears in `public/m/index.html`.

- [ ] **Step 5: CRLF check + commit**

```bash
echo "client $(tr -cd '\r' < mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx | wc -c)"
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
MSYS_NO_PATHCONV=1 git commit -m "feat: next-load suggestion chip in the live session player"
```

---

### Task 3: Verification + staging

**Files:** none (verification only)

- [ ] **Step 1: Full test + parse-check**

```bash
npm test
node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Expected: all tests green (incl. the new suggest-next-load vectors); JSX parses.

- [ ] **Step 2: Confirm `public/m` is in sync**

In PowerShell, rebuild + diff against the committed bundle:
```powershell
cd mobile-app; $env:VITE_BASE='/m/'; npm run build
cd ..; Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m
git status --porcelain public/m
```
If `git status` shows changes, commit them. (CI's Mobile check fails on a stale bundle.)

- [ ] **Step 3: Staging click-through**

```bash
git push origin feat/e1rm-next-load:staging --force
```
Open `https://shape-app-git-staging-cperry8800-droids-projects.vercel.app/m/` (browser User-Agent), start a logged strength session for a lift you have history on, and confirm: the Suggested chip appears above the set grid with a sensible load × reps + rationale, tapping it fills the first un-logged set's load, and there's no chip for a lift with no history (honest empty).

- [ ] **Step 4: Review + PR (after Phase 1 merges)**

Run `/code-review` on the diff. Once PR #1420 (Phase 1) merges to `main`, retarget/rebase `feat/e1rm-next-load` onto `main`, open the PR, let CI + CodeRabbit run, address findings, squash-merge. Keep the branch.

---

## Self-Review (completed by the plan author)

**Spec coverage** — every spec section maps to a task:
- Engine (blend algorithm + constants + fallbacks) → Task 1. The `%-of-e1RM` path covers the degenerate "e1RM but no usable last load" edge per the spec's clarified path 3.
- Surface (chip above the set grid, tap-to-fill, honest no-chip) → Task 2. The chip suppresses the `'repeat'` basis (it would only echo the existing "Last · {l}" line) — a UI display policy noted in the spec's "no chip for no-data" spirit.
- Architecture (pure module + `useBSStrength`, no endpoint/migration) → Tasks 1-2. Verification + staging → Task 3.

**Type consistency** — `suggestNextLoad(lift, move)` returns `{ load, reps, unit, basis, rationale, deltaFromLast }`; Task 2 reads exactly those (`_bsSug.load/reps/unit/rationale`, `.basis !== 'repeat'`). The lift shape (`{ currentE1rm, unit, series:[{load,reps,rpe}] }`) matches Phase 1's `summarizeLift` output consumed via `useBSStrength().lifts`.

**No placeholders** — Task 1 is complete code; Task 2 gives the full chip JSX + handler with exact insertion anchors (after the `move.l` line ~17537, before the Plate-math block ~17539) and notes the one thing the implementer must confirm in-file (the `../services/` import style and that `move` is a local).

## Out of scope (Phase 2)

- Coach-set progression rules / target bands (roadmap #4).
- Cross-unit (kg↔lb) normalization (Phase-1 unit-handling follow-up).
- Persisting the suggestion or notifying a coach; velocity-based autoregulation.
