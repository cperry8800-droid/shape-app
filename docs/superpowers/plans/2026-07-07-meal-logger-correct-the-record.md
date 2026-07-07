# Meal Logger "Correct the Record" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the mobile Log Meal sheet into the Open Ledger language — two honest registers (Correct the record / Dispatch to coach), a sticky repricing log bar, a one-tap plate that collapses to a reset row when adjusted, real coach name + real day targets, and a +10 Score moment on the confirmation.

**Architecture:** One React component is reworked in place (`BSLogMealFlow` in `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`). The two pieces of pure, testable logic — the "is this meal adjusted?" predicate and the CTA-label derivation — are extracted into a new pure ES module (`mobile-app/src/services/mealLoggerState.mjs`) with `node:test` unit tests. A one-line-surface backend change exposes the existing (currently-discarded) `award_meal_log` RPC result so the confirmation can show the award only when it was actually granted. No schema or API changes.

**Tech Stack:** React (in-file JSX, no build-time JSX transform beyond Vite), plain ES modules for pure logic, `node --test` for unit tests, Capacitor/Vite mobile build.

## Global Constraints

- **Branch:** `claude/meal-logger-correct-record` (already cut from `origin/main`, spec committed). Verify base before editing: `git fetch origin main && git rev-parse --short HEAD origin/main` — reset to `origin/main` if HEAD diverges (keep the spec commit; rebase it if main moved).
- **Theme tokens only.** `const t = useBS()`. Never hardcode ink/paper on a themed surface. Teal accent literal when required: `t.isLight ? '#0a8f87' : '#34d6c5'`. Nutritionist gold literal: `t.isLight ? '#a07a2e' : '#d8b25a'`.
- **Monochrome typographic glyphs only** for any newly-added symbol (`↺ ＋ ✓ × ● ⊡ →`). Never recolor existing emoji.
- **Sheets/overlays** `createPortal` into `#bs-phone-surface` (fallback `document.body`), matching the existing ingredient-editor sheet (~line 1998).
- **44px min touch targets**, `aria-pressed` on toggle chips, `prefers-reduced-motion` respected on every transition, `font-variant-numeric: tabular-nums` on all figures, 0px horizontal overflow.
- **Honesty:** no fabricated numbers or personas in a signed-in view. Signed-out demo is the only place demo constants (2100/165, "Dr. Maya", the demo plate) may appear.
- **CRLF:** after editing, normalize LF (`sed -i 's/\r$//' <file>`) before committing — the Edit tool writes CRLF on Windows and these are LF-tracked files.
- **Verify before commit** per task where noted: parse-check changed JSX
  (`node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`),
  `npm test` for the pure module, and the full mobile build + `public/m` republish in the final task.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File structure

- **Create** `mobile-app/src/services/mealLoggerState.mjs` — pure: `bsMealDirty()`, `bsMealCtaLabel()`.
- **Create** `tests/meal-logger-state.test.mjs` — unit tests for the above.
- **Modify** `package.json:9` — append the new test file to the `"test"` script list.
- **Modify** `mobile-app/src/services/shapeBackend.js:4128-4144` (`logMealMacros`) — return the award promise.
- **Modify** `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`:
  - `1519-1526` — component signature (`dayTargets` prop) + state (`award`, `coach`, `initialIngs`, `photoOpen`/`voiceOpen`, `showAddFood`; delete `mode`).
  - `1664-1727` — targets from prop; `DayTotals` real goals; add `dirty`/`ctaLabel` derivations.
  - `1729-1750` — confirmation `+10` line + Undo→Back.
  - `1752-2000` — the render restructure (registers, tabs removal, sticky bar, plate/reset, add-food sheet).
  - `2440` — call site: pass `dayTargets` from `ticker`.
  - `4097` — second `ShapeMealLog.log` call site: unaffected (return ignored) — verify only.

---

## Task 1: Pure meal-logger state module (dirty predicate + CTA label)

**Files:**
- Create: `mobile-app/src/services/mealLoggerState.mjs`
- Create: `tests/meal-logger-state.test.mjs`
- Modify: `package.json:9`

**Interfaces:**
- Produces:
  - `bsMealDirty(portion, ings, initialIngs) → boolean` — true when `portion !== 1`, or the on-count/identity of `ings` differs from `initialIngs`. Ingredient identity compared by a stable key of `name|qty|kcal|p|c|f|on`. Length change → dirty. Any element key mismatch at the same index → dirty.
  - `bsMealCtaLabel({ dirty, portion, kcal, hasPlanned }) → string` — `'Log as planned →'` when `!dirty && hasPlanned`; otherwise `'Log · {kcal} kcal →'`, with ` · {portion}×` inserted before the arrow when `portion !== 1` (portion formatted via `Number(portion).toFixed(2).replace(/\.?0+$/, '')` → `0.75`, `1`, `1.5`). kcal rendered as an integer.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/meal-logger-state.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsMealDirty, bsMealCtaLabel } from '../mobile-app/src/services/mealLoggerState.mjs';

const base = [
  { name: 'Greek yogurt + almonds', qty: '1 serving', kcal: 280, p: 22, c: 26, f: 10, on: true },
];

test('bsMealDirty: pristine when portion 1 and ings match initial', () => {
  assert.equal(bsMealDirty(1, base, base), false);
  assert.equal(bsMealDirty(1, base.map(x => ({ ...x })), base), false); // fresh copies, same values
});

test('bsMealDirty: portion change makes it dirty', () => {
  assert.equal(bsMealDirty(0.75, base, base), true);
  assert.equal(bsMealDirty(1.5, base, base), true);
});

test('bsMealDirty: toggling, editing, adding, removing an ingredient is dirty', () => {
  assert.equal(bsMealDirty(1, [{ ...base[0], on: false }], base), true);          // toggled off
  assert.equal(bsMealDirty(1, [{ ...base[0], kcal: 210 }], base), true);          // edited
  assert.equal(bsMealDirty(1, [...base, { ...base[0], name: 'Banana' }], base), true); // added
  assert.equal(bsMealDirty(1, [], base), true);                                    // removed
});

test('bsMealCtaLabel: pristine planned meal reads "as planned"', () => {
  assert.equal(bsMealCtaLabel({ dirty: false, portion: 1, kcal: 280, hasPlanned: true }), 'Log as planned →');
});

test('bsMealCtaLabel: free log (no planned) never says "as planned"', () => {
  assert.equal(bsMealCtaLabel({ dirty: false, portion: 1, kcal: 340, hasPlanned: false }), 'Log · 340 kcal →');
});

test('bsMealCtaLabel: adjusted reprices; portion suffix only when != 1', () => {
  assert.equal(bsMealCtaLabel({ dirty: true, portion: 0.75, kcal: 210, hasPlanned: true }), 'Log · 210 kcal · 0.75× →');
  assert.equal(bsMealCtaLabel({ dirty: true, portion: 1, kcal: 300, hasPlanned: true }), 'Log · 300 kcal →');
  assert.equal(bsMealCtaLabel({ dirty: true, portion: 1.5, kcal: 450, hasPlanned: true }), 'Log · 450 kcal · 1.5× →');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/meal-logger-state.test.mjs`
Expected: FAIL — `Cannot find module '.../mealLoggerState.mjs'`.

- [ ] **Step 3: Write the minimal implementation**

```javascript
// mobile-app/src/services/mealLoggerState.mjs
// Pure state helpers for the meal logger. Kept out of the JSX component so the
// "is this meal adjusted?" rule and the repricing CTA label are unit-testable
// and can never drift from what the sticky bar / reset row show.

const ingKey = (x) => [x && x.name, x && x.qty, x && x.kcal, x && x.p, x && x.c, x && x.f, x && x.on ? 1 : 0].join('|');

// Adjusted = portion moved off 1×, or the ingredient set differs from the copy
// frozen when the sheet opened (toggle, edit, add, remove).
export function bsMealDirty(portion, ings, initialIngs) {
  if (Number(portion) !== 1) return true;
  const a = Array.isArray(ings) ? ings : [];
  const b = Array.isArray(initialIngs) ? initialIngs : [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (ingKey(a[i]) !== ingKey(b[i])) return true;
  return false;
}

const fmtPortion = (p) => Number(p).toFixed(2).replace(/\.?0+$/, '');

// The one source of truth for the log button's words. Never claims "as planned"
// over an adjusted meal, and only shows a portion multiplier when it's not 1×.
export function bsMealCtaLabel({ dirty, portion, kcal, hasPlanned }) {
  if (!dirty && hasPlanned) return 'Log as planned →';
  const k = Math.round(Number(kcal) || 0);
  const mult = Number(portion) !== 1 ? ` · ${fmtPortion(portion)}×` : '';
  return `Log · ${k} kcal${mult} →`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/meal-logger-state.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Register the test in the suite**

In `package.json:9`, append ` tests/meal-logger-state.test.mjs` to the end of the `"test"` script string (before the closing quote). Then run the full suite to confirm no regressions:

Run: `npm test`
Expected: all tests pass, including the new file.

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/mealLoggerState.mjs tests/meal-logger-state.test.mjs
git add mobile-app/src/services/mealLoggerState.mjs tests/meal-logger-state.test.mjs package.json
git commit -m "feat(logger): pure dirty-predicate + repricing CTA-label module + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Expose the meal-log award result (backend)

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js:4128-4144`

**Interfaces:**
- Consumes: existing `award_meal_log(p_day)` RPC → jsonb `{ awarded: boolean, points: number }`.
- Produces: `logMealMacros(...)` resolved value gains an `awardPromise` field — a `Promise<{awarded, points} | null>` (null on no-user, RPC error, or not-awarded-shape). Fire-and-forget preserved: the RPC still never blocks the log, and errors resolve to null rather than reject.

- [ ] **Step 1: Apply the change**

Replace the award line + return in `logMealMacros` (currently):

```javascript
    invalidateClientMetrics();
    // Shape Score: +10 once/day for logging a meal (server-gated + deduped;
    // mirrors award_workout_session). Fire-and-forget — never blocks the log.
    try { if (state.user?.id) supabase.rpc('award_meal_log', { p_day: _localDate() }).then(() => {}, () => {}); } catch (e) {}
    return res.json();
```

with:

```javascript
    invalidateClientMetrics();
    // Shape Score: +10 once/day for logging a meal (server-gated + deduped;
    // mirrors award_workout_session). Fire-and-forget — never blocks the log —
    // but the RESULT ({awarded, points}) rides back on the resolved value so the
    // confirmation can show +10 only when it was actually granted (not on an
    // already-earned day). Errors + no-user resolve to null, never reject.
    let awardPromise = Promise.resolve(null);
    try {
      if (state.user?.id) {
        awardPromise = supabase.rpc('award_meal_log', { p_day: _localDate() })
          .then((r) => (r && r.data && typeof r.data === 'object' ? r.data : null), () => null);
      }
    } catch (e) {}
    const snap = await res.json().catch(() => ({}));
    return { ...(snap && typeof snap === 'object' ? snap : {}), awardPromise };
```

- [ ] **Step 2: Parse-check**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/services/shapeBackend.js','utf8'),{sourceType:'module'})"`
Expected: no output (parse OK).

- [ ] **Step 3: Confirm the other call site is unaffected**

Read `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:4097` — it calls `window.ShapeMealLog?.log?.(...)` and ignores the return. No change needed; the extra `awardPromise` field is inert there.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/shapeBackend.js
git add mobile-app/src/services/shapeBackend.js
git commit -m "feat(nutrition): surface award_meal_log result on logMealMacros for the +10 moment

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Component data plumbing (targets prop · coach · initial snapshot · award state)

Additive only — no render restructure yet. The file must still build after this task.

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — signature `1519`, state block `1522-1526`, derivations `1664-1673`, call site `2440`.

**Interfaces:**
- Consumes: `bsMealDirty`, `bsMealCtaLabel` from Task 1; `window.ShapeMessages.listDirectCoachThreads` (returns `{ data: [...] }` or array; items carry `who|name|full_name`, `provider_role`, `provider_id`).
- Produces (in-component, for Tasks 4–7): `coach` (`{name, role} | null`), `dirty` (bool), `initialIngsRef` (frozen copy), `award` (`{awarded, points} | null`), plus `dayTargets` prop.

- [ ] **Step 1: Import the pure module**

At the top of `iosAppBroadsheetClient.jsx`, add to the existing service imports:

```javascript
import { bsMealDirty, bsMealCtaLabel } from '../services/mealLoggerState.mjs';
```

(Match the existing import style/path in the file — verify the relative path resolves like the other `../services/*.mjs` imports already present.)

- [ ] **Step 2: Extend the signature + add state**

Change `1519`:

```javascript
function BSLogMealFlow({ onClose, onLogged = () => {}, meal = null, daySoFar = null, dayTargets = null, signedIn = false }) {
```

Replace the `const [mode, ...]` line (`1522`) — delete `mode` entirely — and add the new state near the other `useStateBSC` calls (`1522-1526` region):

```javascript
  // mode tabs removed — Adjust is the always-visible register; photo/voice are
  // dispatch disclosures; search folds into the ADD sheet.
  const [portion, setPortion] = useStateBSC(1);
  const [note, setNote] = useStateBSC('');
  const [foodQuery, setFoodQuery] = useStateBSC('');
  const [logged, setLogged] = useStateBSC(false);
  const [award, setAward] = useStateBSC(null);         // {awarded, points} | null — set after log resolves
  const [coach, setCoach] = useStateBSC(null);         // {name, role} | null — resolved linked nutritionist/coach
  const [showAddFood, setShowAddFood] = useStateBSC(false);
  const [photoOpen, setPhotoOpen] = useStateBSC(false); // dispatch disclosures
  const [voiceOpen, setVoiceOpen] = useStateBSC(false);
```

- [ ] **Step 3: Freeze the initial ingredient snapshot**

Immediately after the `ings` `useStateBSC` initializer (after `1542`), capture a one-time frozen copy for the dirty comparison:

```javascript
  const initialIngsRef = React.useRef(null);
  if (initialIngsRef.current === null) initialIngsRef.current = ings.map((x) => ({ ...x }));
```

- [ ] **Step 4: Resolve the real coach (nutritionist-preferred)**

Add near the other effects (after the `bsSetMyActivity` effect, ~1545). Signed-out stays demo (`coach` null → demo name used at render):

```javascript
  // Resolve the member's linked coach for the dispatch register — prefer the
  // nutritionist thread, else any linked coach. No thread → coach stays null and
  // the whole dispatch register hides (the meal-note endpoint no-ops anyway).
  React.useEffect(() => {
    if (!signedIn || !window.ShapeMessages?.listDirectCoachThreads) return;
    let alive = true;
    window.ShapeMessages.listDirectCoachThreads().then((res) => {
      const list = Array.isArray(res) ? res : (res && res.data) || [];
      if (!alive || !list.length) return;
      const nutri = list.find((c) => c.provider_role === 'nutritionist');
      const co = nutri || list[0];
      const nm = co.who || co.name || co.full_name;
      if (!nm) return;
      setCoach({ name: nm, role: co.provider_role === 'nutritionist' ? 'nutritionist' : 'trainer' });
    }).catch(() => {});
    return () => { alive = false; };
  }, [signedIn]);
```

- [ ] **Step 5: Real targets + dirty/CTA derivations**

Replace the hardcoded goals line (`1668`) and add derivations after the `kcal/P/C/F` sums (`1664-1667`):

```javascript
  // Day targets: real member targets when signed in (passed from the home ticker);
  // the demo goals are only the signed-out preview. null target → render "/ —".
  const CAL_GOAL = signedIn ? ((dayTargets && Number.isFinite(Number(dayTargets.cal))) ? Math.round(Number(dayTargets.cal)) : null) : 2100;
  const P_GOAL   = signedIn ? ((dayTargets && Number.isFinite(Number(dayTargets.protein))) ? Math.round(Number(dayTargets.protein)) : null) : 165;
  const DAY_BASE_CAL = 1568, DAY_BASE_P = 118;
```

After `1667` (the `F` sum), add:

```javascript
  const hasPlanned = !!(meal && Number.isFinite(Number(meal.kcal)));
  const dirty = bsMealDirty(portion, ings, initialIngsRef.current);
  const ctaLabel = bsMealCtaLabel({ dirty, portion, kcal, hasPlanned });
  const resetToPlan = () => { setPortion(1); setIngs(initialIngsRef.current.map((x) => ({ ...x }))); };
  const coachName = coach ? coach.name : (signedIn ? null : 'Dr. Maya');
  const coachAccent = t.isLight ? '#a07a2e' : '#d8b25a';
```

- [ ] **Step 6: Update `DayTotals` for null goals**

In `DayTotals` (`1714-1727`), the goal can now be null. Change the goal cell + bar so a null goal renders `/ —` and hides the bar. Replace the map body (`1718-1724`):

```javascript
        {[['Calories', dayCal, CAL_GOAL, teal], ['Protein', dayP, P_GOAL, t.RUST]].map(([l, v, goal, c]) => (
          <div key={l}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}><span>{l}</span><span>/ {goal != null ? goal : '—'}</span></div>
            <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            {goal != null && <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: t.HAIR, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, (v / goal) * 100)}%`, height: '100%', background: c }} /></div>}
          </div>
        ))}
```

- [ ] **Step 7: Pass targets from the call site**

At `2440`, add the `dayTargets` prop:

```javascript
    return <BSLogMealFlow meal={mealToLog} daySoFar={{ cal: liveCal, protein: (ticker && typeof ticker.protein_g === 'number' ? ticker.protein_g : null) }} dayTargets={{ cal: (ticker && typeof ticker.cal_target === 'number') ? ticker.cal_target : null, protein: (ticker && typeof ticker.protein_target === 'number') ? ticker.protein_target : null }} signedIn={bsHomeSignedIn} onClose={() => { setShowLogMeal(false); setMealToLog(null); }} onLogged={() => { if (loggingMealId) setMealLogged((prev) => ({ ...prev, [loggingMealId]: true })); }} />;
```

- [ ] **Step 8: Parse-check + build (the render still references `mode` — expected to break at build until Task 4)**

Run the parse-check only (build is deferred to Task 4, since the render still uses `mode`):
`node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"`
Expected: parse OK. (Do **not** commit yet — Tasks 3 and 4 land together as one buildable commit, since removing `mode` state without removing its render usages leaves a runtime-broken intermediate. Proceed directly to Task 4.)

---

## Task 4: Render restructure — registers, tabs removal, sticky bar, plate/reset, add-food sheet

This is one atomic render rewrite (the mode tabs cannot be half-removed). It replaces the body from the mode-tabs block through the `THIS MEAL` plate (`1766-1972`) and adds the add-food sheet portal. Blocks that move **unchanged** are called out by their current content so you transplant them verbatim; new blocks are shown in full.

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:1766-2000`

**Interfaces:**
- Consumes from Task 3: `dirty`, `ctaLabel`, `resetToPlan`, `hasPlanned`, `coach`, `coachName`, `coachAccent`, `photoOpen/setPhotoOpen`, `voiceOpen/setVoiceOpen`, `showAddFood/setShowAddFood`, `award`.

- [ ] **Step 1: Add a reusable ledger-head helper (inside the component, before `return`)**

Near `DayTotals` (~1714), add:

```javascript
  const LedgerHead = ({ label, accent = teal, extra = null }) => (
    <div style={{ padding: `16px ${t.padX}px 0` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK }}>{label}</span>
        {extra}
      </div>
      <div style={{ marginTop: 4, height: 2, background: `linear-gradient(90deg, ${t.INK}, ${accent})` }} />
    </div>
  );
```

- [ ] **Step 2: Replace the ONE-TAP plate block so it only shows pristine + planned, else the reset row**

Replace the current ONE-TAP block (`1766-1782`). Keep the existing teal-plate button JSX verbatim inside the `pristine` branch (the `<button onClick={doLog} ...>` with spine/tick/bracket, `1768-1781`), wrapped so it renders only when `hasPlanned && !dirty`; when `dirty`, render the reset row instead; when `!hasPlanned` render neither:

```javascript
      {/* Pristine planned meal → one-tap plate. Adjusted → reset row. Free log → neither. */}
      {hasPlanned && !dirty && (
        <div style={{ padding: `14px ${t.padX}px 4px` }}>
          {/* ↓ existing teal one-tap plate button, transplanted unchanged (1768–1781) */}
        </div>
      )}
      {hasPlanned && dirty && (
        <div style={{ padding: `12px ${t.padX}px 0` }}>
          <button onClick={resetToPlan} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 4, border: `1px solid ${t.RULE}`, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>
            <span aria-hidden style={{ fontSize: 13, color: coachAccent }}>↺</span>
            <span>Adjusted — reset to plan</span>
          </button>
        </div>
      )}
```

- [ ] **Step 3: Replace the OR-ADVISE divider + mode tabs + mode content with the three registers**

Delete the `OR ADJUST` divider (`1784-1789`), the mode tabs (`1791-1803`), and the four `mode === '...'` content blocks (`1805-1945`) **and** the standalone NOTE block (`1947-1951`). Replace all of it with:

**Register 1 — CORRECT THE RECORD** (portion + ingredients + single ADD). Transplant the existing portion control (`1808-1815`) and the existing ingredients list (`1817-1829`) unchanged into this block; replace the two add affordances with a single ADD row:

```javascript
      <LedgerHead label="Correct the record" />
      <div style={{ padding: `12px ${t.padX}px 4px` }}>
        {/* ↓ existing PORTION control, transplanted unchanged (1808–1815) */}
        {/* ↓ existing "INGREDIENTS · TAP TO TOGGLE" head + list rows, transplanted unchanged (1817–1829) */}
        <button onClick={() => setShowAddFood(true)} style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: t.RADIUS_SM, border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>＋ Add — search foods or enter manually</button>
      </div>
```

**Register 2 — DISPATCH TO {coach}** (hidden entirely when signed-in with no coach). Note field + photo/voice disclosure chips. The photo capture body (`1834-1855` inner) and voice capture body (`1895-1944` inner) are transplanted unchanged into the disclosure panels:

```javascript
      {(coach || !signedIn) && (
        <>
          <LedgerHead label={`Dispatch to ${coachName}`} accent={coachAccent} extra={<span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>Optional</span>} />
          <div style={{ padding: `10px ${t.padX}px 4px` }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Felt a bit hungry still · swapped rice for sweet potato…" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, outline: 'none', resize: 'vertical' }} />
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              {[['photo', '⊡ Photo', photoOpen, () => { setPhotoOpen((v) => !v); setVoiceOpen(false); }, !!photo],
                ['voice', '● Voice', voiceOpen, () => { setVoiceOpen((v) => !v); setPhotoOpen(false); }, !!voiceMemo]].map(([k, label, open, onTap, attached]) => (
                <button key={k} onClick={onTap} aria-pressed={open} style={{ flex: 1, padding: '10px 8px', borderRadius: t.RADIUS_SM, cursor: 'pointer', border: `1px solid ${open || attached ? coachAccent : t.RULE}`, background: open ? `${coachAccent}14` : 'transparent', color: open || attached ? t.INK : t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  {label}{attached ? ' ✓' : ''}
                </button>
              ))}
            </div>
            {photoOpen && (
              <div style={{ marginTop: 10 }}>
                {/* ↓ existing PHOTO capture body, transplanted unchanged (inner of 1834–1855) */}
              </div>
            )}
            {voiceOpen && (
              <div style={{ marginTop: 10 }}>
                {/* ↓ existing VOICE capture body, transplanted unchanged (inner of 1895–1944) */}
              </div>
            )}
          </div>
        </>
      )}
```

**Register 3 — THE TALLY** — a ledger head above the existing plate. Transplant the existing `THIS MEAL` `BSPlate` block (`1954-1970` inner) unchanged under the head:

```javascript
      <LedgerHead label="The tally" />
      <div style={{ padding: `10px ${t.padX}px 4px` }}>
        {/* ↓ existing THIS MEAL BSPlate (macros + <DayTotals />), transplanted unchanged (inner of 1954–1970) */}
      </div>
```

- [ ] **Step 4: Add the sticky ledger bar (before the closing `</BSPage>`, replacing the `<div style={{ height: 12 }} />` spacer at 1972)**

Replace the spacer (`1972`) with bottom padding that reserves the bar's height, and add the portaled bar just before `</BSPage>` (after the editIng portal, ~1999):

```javascript
      <div style={{ height: 96 }} />
      {createPortal((
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5200, background: t.PAPER2, borderTop: `1px solid ${t.RULE}`, boxShadow: '0 -8px 22px rgba(0,0,0,0.12)', padding: `12px ${t.padX}px calc(14px + env(safe-area-inset-bottom, 0px))`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{kcal} KCAL · {P}P</span>
        <button onClick={doLog} disabled={signedIn && kcal <= 0} style={{ flex: '0 0 auto', minHeight: 44, padding: '0 18px', borderRadius: t.RADIUS_SM, border: 0, cursor: (signedIn && kcal <= 0) ? 'default' : 'pointer', opacity: (signedIn && kcal <= 0) ? 0.45 : 1, background: teal, color: '#04201d', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{ctaLabel}</button>
      </div>
      ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body)}
```

- [ ] **Step 5: Add the add-food sheet portal (after the sticky bar, before `</BSPage>`)**

This replaces the deleted SEARCH tab. It reuses the `FOODS` list + `addFood` logic that lived in the old `mode === 'search'` block (`1858-1892`) — transplant that `FOODS` array and `addFood`/`rows`/`q` logic into this portal, and add an "Enter manually" row that calls the existing `openAddIng` (`1643`):

```javascript
      {showAddFood && (() => {
        const FOODS = [ /* ↓ transplant the 8-item FOODS array verbatim from old 1859–1868 */ ];
        const q = foodQuery.trim().toLowerCase();
        const rows = q ? FOODS.filter((f) => f.name.toLowerCase().includes(q)) : FOODS.slice(0, 3);
        const addFood = (f) => { setIngs((arr) => [...arr, { name: f.name, qty: f.qty, kcal: f.kcal, p: f.p, c: f.c, f: f.f, on: true }]); window.__bsToast?.(`Added ${f.name}`, 'ok'); setShowAddFood(false); };
        return createPortal((
          <div onClick={() => setShowAddFood(false)} style={{ position: 'absolute', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -16px 40px rgba(0,0,0,0.35)', maxHeight: '80%', overflowY: 'auto' }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, marginBottom: 12 }}>Add food</div>
              <input autoFocus value={foodQuery} onChange={(e) => setFoodQuery(e.target.value)} placeholder="Search foods, brands, barcodes…" style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, outline: 'none' }} />
              <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{q ? `${rows.length} result${rows.length === 1 ? '' : 's'}` : (signedIn ? 'Recents — food search coming soon' : 'Recents')}</div>
              <div style={{ marginTop: 2 }}>
                {rows.map((r, i) => (
                  <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i === rows.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.name}</div>
                      <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{r.qty} · {r.kcal} kcal · {r.p}P</div>
                    </div>
                    <button onClick={() => addFood(r)} aria-label={`Add ${r.name}`} style={{ flex: '0 0 auto', minWidth: 44, minHeight: 44, background: 'transparent', border: 0, color: teal, cursor: 'pointer', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>＋</button>
                  </div>
                ))}
                {rows.length === 0 && <div style={{ padding: '16px 0', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50 }}>No matches for “{foodQuery.trim()}”.</div>}
              </div>
              <button onClick={() => { setShowAddFood(false); openAddIng(); }} style={{ marginTop: 12, width: '100%', padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Enter manually →</button>
            </div>
          </div>
        ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body);
      })()}
```

- [ ] **Step 6: Parse-check**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"`
Expected: parse OK. Grep to confirm no dangling `mode` references remain: `grep -n "mode ===\|setMode\|\[mode" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` inside the logger range — expect none.

- [ ] **Step 7: Build (first buildable checkpoint — Tasks 3+4 together)**

Run from `mobile-app/`: `VITE_BASE=/m/ npm run build`
Expected: build succeeds. Fix any unresolved reference (commonly a transplanted block that still names `mode`, or a moved `photo`/`voiceMemo` reference now out of the render scope — both are component-scope vars so they remain in scope).

- [ ] **Step 8: Commit (plumbing + restructure land together)**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(logger): Correct the Record restructure — registers, sticky bar, reset row, real coach + targets

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Confirmation +10 moment + Undo→Back

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `doLog` (`1703-1711`), confirmation screen (`1729-1748`).

**Interfaces:**
- Consumes: `logMealMacros` resolved `{ ...snap, awardPromise }` from Task 2; `award`/`setAward` state from Task 3.

- [ ] **Step 1: Capture the award in `doLog`**

Replace the `ShapeMealLog.log` line inside `doLog` (`1708`):

```javascript
    try {
      const r = window.ShapeMealLog?.log?.({ kcal, protein: P, carbs: C, fat: F });
      if (r && typeof r.then === 'function') {
        r.then((d) => (d && d.awardPromise) || null)
         .then((a) => { if (a && a.awarded) setAward(a); })
         .catch(() => {});
      }
    } catch (e) {}
```

- [ ] **Step 2: Show the +10 line on the confirmation**

In the `if (logged)` block, after the `{kcal} kcal · {P}P · {logTime}` line (`1737`), add the award line — only when granted:

```javascript
          {award && award.awarded && (
            <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, border: `1px solid ${teal}`, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: teal, animation: 'bsAwardIn 180ms ease-out' }}>
              +{award.points != null ? award.points : 10} · Nutrition · Shape Score
            </div>
          )}
          <style>{`@keyframes bsAwardIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } } @media (prefers-reduced-motion: reduce) { [style*="bsAwardIn"] { animation: none !important; } }`}</style>
```

- [ ] **Step 3: Rename Undo → Back**

Replace the Undo button (`1745-1747`). It navigates (does not reverse the POST), so it becomes a back affordance consistent with the primary `Done →`:

```javascript
        <div style={{ textAlign: 'center', paddingBottom: 28 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK50, letterSpacing: '0' }}>← Back</button>
        </div>
```

(Delete the now-unused `setLogged(false)` handler usage; keep `setLogged` since `doLog` still calls it.)

- [ ] **Step 4: Parse-check + build**

Run: parse-check (as Task 4 Step 6), then from `mobile-app/`: `VITE_BASE=/m/ npm run build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(logger): +10 Shape Score moment on confirmation (only when granted) · Undo→Back

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verify, republish public/m, self-review, stage

**Files:**
- Modify: `public/m/**` (build output republish).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all pass (including `meal-logger-state`).

- [ ] **Step 2: Clean build + republish public/m**

```bash
cd mobile-app && VITE_BASE=/m/ npm run build && cd ..
rm -rf public/m && cp -r mobile-app/dist public/m
diff -rq mobile-app/dist public/m
```
Expected: `diff` reports no differences (CI fails on stale `public/m`).

- [ ] **Step 3: Self-review against the spec's 10 acceptance criteria**

Walk each criterion (spec §"Acceptance criteria") against the diff:
pristine one-tap ↔ bar parity · adjusted reset row + repriced CTA · ingredient-toggle CTA (no `×`) · free-log disabled-at-0 · real coach name, no "Maya" signed-in · dispatch hidden when no coach · targets `/ —` when absent, demo when signed-out · +10 only on first log/day + `← Back` · tabs gone, photo/voice as chips, ADD sheet with manual entry · theme tokens, 44px, aria-pressed, reduced-motion, no overflow.
Grep guards: `grep -n "Maya\|CAL_GOAL = 2100\|mode ===" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the only `Maya`/`2100`/`165` hits must be inside signed-out (`!signedIn`) branches; no `mode ===` in the logger.

- [ ] **Step 4: Commit the republish + stage for click-through**

```bash
git add public/m
git commit -m "build(m): republish mobile bundle — meal logger Correct the Record

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin claude/meal-logger-correct-record
git push origin claude/meal-logger-correct-record:staging --force
```
Then click through the staging preview (Home → log a planned meal: one-tap; adjust portion → reset row + repriced bar; toggle ingredient; open ADD → manual entry; dispatch chips expand; confirmation +10) before opening the build PR.

---

## Self-review (plan vs spec)

- **Defect 1 (stale CTA):** Task 4 sticky bar + plate/reset. ✔
- **Defect 2 (mixed taxonomy):** Task 4 registers + tabs removal + ADD sheet. ✔
- **Defect 3 (hardcoded persona/goals):** Task 3 coach effect + targets prop + `DayTotals` null-goal + signed-out-only demo. ✔
- **Defect 4 (missed +10):** Task 2 backend + Task 5 confirmation line. ✔
- **Undo doesn't undo:** Task 5 Undo→Back. ✔
- **Free-log edge (no plate):** Task 4 Step 2 (`hasPlanned` gate) + Task 4 Step 4 disabled-at-0. ✔
- **Acceptance criteria 1–10:** covered across Tasks 3–6; verified in Task 6 Step 3. ✔
- **Type consistency:** `bsMealDirty`/`bsMealCtaLabel` signatures identical in Task 1 (def), Task 3 (import/use). `awardPromise` field name identical in Task 2 (produce) and Task 5 (consume). `coach` shape `{name, role}` identical Task 3 (set) / Task 4 (read `coachName`). ✔
- **Out of scope respected:** food-DB search labeled honestly (Task 4 Step 5); real undo deferred (Task 5 Step 3 comment); no website/coach-side/i18n changes. ✔
```
