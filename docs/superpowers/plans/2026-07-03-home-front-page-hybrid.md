# Client Home "Front Page" Hybrid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `BSClientHome` from ~11 uniform bordered plates into the Front-Page hierarchy — bulletins → one engine-owned lead plate → TODAY'S SLATE run-sheet rows → INSIDE. index rows + compact door shelf — keeping all 11 existing features reachable.

**Architecture:** A render-section refactor of `BSClientHome` (spec: `docs/superpowers/specs/2026-07-03-home-front-page-hybrid-design.md`; verified line map: `.superpowers/sdd/home-structure-map.md`). All state, hooks, effects, and early-return overlays survive untouched. Four new presentational primitives (`BSSlateRow`, `BSIndexRow`, `BSHomeBulletin`, `BSShelfDoor`), two extracted hooks (`useBSCheckinLogged`, `useBSStepsToday`), and one pure sorted-slate service module (`homeSlate.mjs`) carry the new structure; every deleted card's data feed and honest-data gate moves line-for-line into a row or door.

**Tech Stack:** React function components in the window-global JSX bundle (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`, ~22.7k lines, no per-component imports); pure ESM service module tested with `node:test`; injected-keyframes CSS pattern for motion.

## Global Constraints

Every task's requirements implicitly include this section.

- **The Front-Page Rule:** exactly ONE `BSPlate` in Home's render (the lead); the page has exactly one CTA button. Bulletins max 2, above the lead. Slate admission test: "is this scheduled to happen TODAY?"
- **Anti-accretion contract** (Task 6 adds as a comment at the top of the render, verbatim): *"Do not add a plate. If it can't be a row, it lives on a tab and gets at most a row-door."*
- **Owner decisions:** check-in bulletin ABOVE the lead; nutritionist byline + FULL PLAN leave Home (Eat tab already renders them — do NOT re-add); shelf doors compact ~112w×64h; habits keep 3 working checkbox rows in the slate.
- **Honest-data gating, line-for-line:** weekly-totals data (SESSIONS / AVG KCAL index rows) stays **signed-out only** (`if (bsHomeSignedIn) return null;` carried); goal door hides when signed-in with no goal (`bsGoalSignedIn && !g → null`); steps door = data / not-today / connect-a-watch states from `BSStepsCard`; habits demo-lock 🔒 routing; coach feed live-first; **fix the pre-existing demo coach-notes leak** (fallback at map lines 3086–3089 becomes signed-out only).
- **Double-feature fix:** the lead's subject never gets a second interactive surface — lead=workout → TRAINING slate row shows `↑ LEAD`, no action; lead=meal (`heroMealId`) → that MEAL row shows `↑ LEAD` instead of its log tick.
- **Habit rows keep** `stopPropagation` on the checkbox and the #1502 keyboard guard (`e.target === e.currentTarget`) on row keydown.
- **Theme tokens only:** `const t = useBS()`; `t.INK/PAPER/PAPER2/RULE/HAIR/ACCENT/INK50/INK70/GREEN/RUST/AMBER/BLUE/DISPLAY/MONO`, alpha via `bsTHexA(hex, a)`; teal literal only as `t.isLight ? '#0a8f87' : '#34d6c5'`. Never hardcode ink/paper. Monochrome symbols only; reuse existing glyphs (› ✓ ↑ → ● 🔒).
- **A11y:** rows/doors are buttons or keyboard-activatable (Enter/Space), ≥44px targets (48px slate rows), aria-labels on interactive rows, `aria-hidden` on decorative layers; shelf doors in DOM order for VoiceOver.
- **Motion (Task 6):** slate rows stagger 30ms apart (opacity + 4px rise, 180ms) via the #1518 insertion-effect CSS pattern; index fades as one block (220ms); slivers draw 0→pct 400ms; only due-ticks pulse; `bsSdReduced()` → final state; **no count-ups on Home**. All keyframes inside `@media (prefers-reduced-motion: no-preference)`; every animated inline style uses the `...(reduced ? null : {animation})` spread.
- **Chrome unchanged:** masthead, `BSTicker`, edition band, `BSNowPlaying`, THIS WEEK strip + Month chip (`selIdx`), Your-widgets grid, footer, all early-return overlays, the `weekStat` portal sheet, `BSLogActivity`/`BSMoodSheet`.
- **Verification, every task:** parse-check from `mobile-app/` (`node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"`); mobile build via **PowerShell** (`cd C:\Users\cperr\shape-app\mobile-app; $env:VITE_BASE='/m/'; npm run build`) — never Git Bash for the build; `npm test` from repo root; LF-normalize touched tracked files (`sed -i 's/\r$//' <files>`) before commit. `public/m` is never committed (built at deploy, #1470).

## Interface Registry (source of truth — tasks must match exactly)

```js
// mobile-app/src/services/homeSlate.mjs (Task 1)
export function bsHomeTimeMinutes(str)
//  '7:00 AM' → 420, '12:30 PM' → 750, '12:00 AM' → 0; null/''/unparseable → null
export function bsHomeSlateSort(rows)
//  stable: timed rows ascending by bsHomeTimeMinutes(row.time); untimed rows after all
//  timed, preserving original order among untimed and among ties

// iosAppBroadsheetClient.jsx (Task 2) — each calls const t = useBS() internally
function BSSlateRow({ time, tag, tagColor, title, status, right, onOpen, ariaLabel })
//  grid '50px 58px 1fr auto 20px', minHeight 48, borderBottom 1px t.HAIR
//  right: undefined → '›' chevron | 'lead' → mono ↑ LEAD (non-interactive echo row)
//         | ReactNode → custom control cell (meal ghost tick / habit checkbox)
function BSIndexRow({ label, figure, status, due, done, onOpen })
//  44px, grid '86px 1fr auto 18px', dot leader, 5px status tick, no border/bg/radius
function BSHomeBulletin({ label, detail, onOpen })
//  40px, hairline top+bottom, pulsing 6px tick, mono label + detail, ›
function BSShelfDoor({ c, eyebrow, figure, status, pct, onOpen })
//  ~112w×64h native button; figure may be ReactNode; pct → 2px bottom progress sliver
function useBSCheckinLogged()  // → boolean; predicate VERBATIM from BSTodayNudge (map §2)
function useBSStepsToday()     // → { hasData, todayKnown, val, goal, pct, hit, stepPts }
// Modified components (defaults preserve current behavior until later tasks flip call sites):
//   BSTodayNudge({ onOpen, variant })  — 'bulletin' → BSHomeBulletin while due;
//                                        'row' → BSIndexRow check-in residue once logged
//   BSMeGoalCard({ c, onOpen, compact, door }) — door → BSShelfDoor GOAL, same loader + gate
//   BSProgressDoor({ onOpen, door })   — door → BSShelfDoor PROGRESS (4 section ticks figure)
```

---

### Task 1: homeSlate.mjs pure module + tests

**Files:**
- Create: `mobile-app/src/services/homeSlate.mjs`
- Create: `tests/home-slate.test.mjs`
- Modify: `package.json` (append the test file to the `test` script list)

**Interfaces:**
- Consumes: nothing (pure, dependency-free module — no theme, no window, no React).
- Produces: `bsHomeTimeMinutes(str) → number|null` — parses a 12-hour display
  string ("7:00 AM", "12:30 PM") to minutes since midnight; `'12:00 AM' → 0`,
  `'12:30 PM' → 750`; null/''/unparseable → `null`.
  `bsHomeSlateSort(rows) → array` — stable sort of `{time, ...}` row objects
  ascending by `bsHomeTimeMinutes(row.time)`; rows whose time is `null`
  (untimed) land after every timed row, preserving original relative order
  among themselves and among ties. Task 4 (`BSSlateRow` assembly in
  `BSClientHome`) imports both by these exact names; this task does **not**
  wire the import into `iosAppBroadsheetClient.jsx` — that's Task 4's job.

---

- [ ] **Step 1: Read the real time-string formats before writing tests**

Read `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` lines 2698–2719 (the
agenda time computation) and lines 2841–2846 (the current inline time-sort),
plus `mobile-app/src/broadsheet/bsClientWeekDemo.js` lines 176–218 (the
`fmt12` 12-hour formatter feeding `timeLabel`). Confirms: the raw source field
(`selWorkout.time`, meal `.time`) is 24-hour `HH:MM`, but the **displayed**
row time users will see (and what Task 4's `BSSlateRow` `time` prop will
carry) is produced by a `fmt12`-style formatter — e.g. `iosAppBroadsheetClient.jsx`'s
own inline `fmtAt()`:

```js
const fmtAt = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
};
```

`fmtAt(510)` → `'8:30 AM'`, `fmtAt(1170)` → `'7:30 PM'` — this is the exact
shape `bsHomeTimeMinutes` must invert. The Interface Registry's examples
(`'7:00 AM' → 420`, `'12:30 PM' → 750`, `'12:00 AM' → 0`) match this
12-hour-with-AM/PM format, NOT the raw `HH:MM` 24-hour source field — so the
module parses the **display** string, not the raw source.

Also read `mobile-app/src/services/sessionLedger.mjs` and
`tests/session-ledger.test.mjs` in full — they are the house style to mirror
exactly (header comment block referencing the spec, one-purpose pure
functions, `node:test` + `assert.deepEqual`/`assert.equal`, no dependencies).

- [ ] **Step 2: Write the failing tests**

Create `tests/home-slate.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsHomeTimeMinutes, bsHomeSlateSort } from '../mobile-app/src/services/homeSlate.mjs';

test('timeMinutes: AM parsing', () => {
  assert.equal(bsHomeTimeMinutes('7:00 AM'), 420);
  assert.equal(bsHomeTimeMinutes('9:05 AM'), 545);
  assert.equal(bsHomeTimeMinutes('12:00 AM'), 0);
  assert.equal(bsHomeTimeMinutes('12:01 AM'), 1);
});

test('timeMinutes: PM parsing', () => {
  assert.equal(bsHomeTimeMinutes('12:30 PM'), 750);
  assert.equal(bsHomeTimeMinutes('12:00 PM'), 720);
  assert.equal(bsHomeTimeMinutes('7:00 PM'), 1140);
  assert.equal(bsHomeTimeMinutes('11:59 PM'), 1439);
});

test('timeMinutes: null/empty/unparseable → null', () => {
  assert.equal(bsHomeTimeMinutes(null), null);
  assert.equal(bsHomeTimeMinutes(undefined), null);
  assert.equal(bsHomeTimeMinutes(''), null);
  assert.equal(bsHomeTimeMinutes('—'), null);
  assert.equal(bsHomeTimeMinutes('TBD'), null);
  assert.equal(bsHomeTimeMinutes('08:30'), null); // 24h form is not the display format
  assert.equal(bsHomeTimeMinutes('13:00 PM'), null); // out-of-range hour
});

test('slateSort: orders timed rows ascending by time', () => {
  const rows = [
    { time: '12:30 PM', k: 'lunch' },
    { time: '7:00 AM', k: 'breakfast' },
    { time: '6:00 PM', k: 'dinner' },
  ];
  const sorted = bsHomeSlateSort(rows);
  assert.deepEqual(sorted.map((r) => r.k), ['breakfast', 'lunch', 'dinner']);
});

test('slateSort: is stable — ties keep original relative order', () => {
  const rows = [
    { time: '7:00 AM', k: 'a' },
    { time: '7:00 AM', k: 'b' },
    { time: '7:00 AM', k: 'c' },
  ];
  const sorted = bsHomeSlateSort(rows);
  assert.deepEqual(sorted.map((r) => r.k), ['a', 'b', 'c']);
});

test('slateSort: untimed rows land after all timed rows, in original order', () => {
  const rows = [
    { time: null, k: 'habit1' },
    { time: '12:30 PM', k: 'lunch' },
    { time: '', k: 'habit2' },
    { time: '7:00 AM', k: 'breakfast' },
    { time: 'TBD', k: 'coachnote' },
  ];
  const sorted = bsHomeSlateSort(rows);
  assert.deepEqual(sorted.map((r) => r.k), ['breakfast', 'lunch', 'habit1', 'habit2', 'coachnote']);
});

test('slateSort: all untimed preserves original order; empty/null input is safe', () => {
  const rows = [{ k: 'x' }, { k: 'y' }, { k: 'z' }];
  assert.deepEqual(bsHomeSlateSort(rows).map((r) => r.k), ['x', 'y', 'z']);
  assert.deepEqual(bsHomeSlateSort([]), []);
  assert.deepEqual(bsHomeSlateSort(null), []);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run (repo root): `node --test tests/home-slate.test.mjs`
Expected: FAIL — `Cannot find module ... homeSlate.mjs`

- [ ] **Step 4: Write the module**

Create `mobile-app/src/services/homeSlate.mjs`:

```js
// Pure helpers for the Home "Front Page" TODAY'S SLATE run-sheet — parsing a
// row's displayed 12-hour time string into sortable minutes, and the stable
// time-ordered sort that places untimed rows after every timed row. No React,
// no window, no theme — dependency-free so the honesty rule (never invent an
// order) stays unit-tested. Spec: docs/superpowers/specs/2026-07-03-home-front-page-hybrid-design.md

// Parse a 12-hour clock string ("7:00 AM", "12:30 PM") into minutes since
// midnight. '12:00 AM' (midnight) → 0; '12:30 PM' (just after noon) → 750.
// null / '' / anything that doesn't match → null (never a fabricated order —
// callers must treat null as "untimed").
export function bsHomeTimeMinutes(str) {
  const s = String(str == null ? '' : str).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 1 || h > 12 || min < 0 || min > 59) return null;
  const ap = m[3].toUpperCase();
  if (ap === 'AM') h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return h * 60 + min;
}

// Stable sort of slate rows by their displayed `row.time` ("7:00 AM"-style).
// Timed rows sort ascending by bsHomeTimeMinutes(row.time); untimed rows (time
// missing/unparseable) land AFTER every timed row, in their original relative
// order. Ties among timed rows, and the untimed group itself, both preserve
// source order (a plain stable sort by a single numeric key, treating
// "untimed" as +Infinity, satisfies both).
export function bsHomeSlateSort(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row, i) => ({ row, i, mins: bsHomeTimeMinutes(row && row.time) }))
    .sort((a, b) => {
      const am = a.mins == null ? Infinity : a.mins;
      const bm = b.mins == null ? Infinity : b.mins;
      if (am !== bm) return am - bm;
      return a.i - b.i;
    })
    .map((x) => x.row);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/home-slate.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 6: Register the test file in package.json**

Read the current `"test"` script value first. It is a single long string of
space-separated `node --test` file args ending in
`tests/waitlist.test.mjs tests/session-ledger.test.mjs"`. Append, following
its existing style (a leading space, no comma — it's one shell command
string, not a JSON array):

Locate this exact substring:

```
 tests/waitlist.test.mjs tests/session-ledger.test.mjs"
```

Replace with:

```
 tests/waitlist.test.mjs tests/session-ledger.test.mjs tests/home-slate.test.mjs"
```

- [ ] **Step 7: Do NOT import into the JSX bundle**

Confirm `homeSlate.mjs` has zero references anywhere under
`mobile-app/src/broadsheet/`:

```
grep -rn "homeSlate" mobile-app/src/broadsheet/
```

Expected: no matches. Task 4 owns wiring
`import { bsHomeTimeMinutes, bsHomeSlateSort } from '../services/homeSlate.mjs';`
into `iosAppBroadsheetClient.jsx` when it assembles `BSSlateRow`s — this task
stops at a standalone, tested, unimported module (mirrors how Task 1 of the
prior Session-Details plan shipped `sessionLedger.mjs` before its own JSX
wiring task).

- [ ] **Step 8: Full verification pass**

Run, from repo root:

```
npm test
```
Expected: all tests pass (the pre-existing suite + 7 new `home-slate.test.mjs`
tests — e.g. 374 existing + 7 = 381 if no other task has landed yet; exact
existing count may shift as other tasks merge).

Parse-check the untouched client bundle (this task didn't edit it, but the
constraint runs every task):

```
node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Expected: no output.

Build the mobile bundle from **PowerShell** (never Git Bash):

```powershell
cd C:\Users\cperr\shape-app\mobile-app; $env:VITE_BASE='/m/'; npm run build
```
Expected: exit 0 (`✓ built in …s`). Do not commit `public/m` — it's built at
deploy time (#1470).

LF-normalize the touched files (Edit/Write save CRLF on Windows; this repo is
LF):

```
sed -i 's/\r$//' mobile-app/src/services/homeSlate.mjs tests/home-slate.test.mjs package.json
```

- [ ] **Step 9: Commit**

```
git add mobile-app/src/services/homeSlate.mjs tests/home-slate.test.mjs package.json
git commit -m "feat(home): add homeSlate.mjs pure module for slate time-sort (#task1)"
```

### Task 2: New primitives + hooks + component variants (unmounted)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — insert four new
  primitives + two new hooks immediately above `BSTodayNudge` (~line 15831); refactor
  `BSTodayNudge` (~15831–15863) to use the extracted hook + add `variant`; refactor
  `BSStepsCard`'s data effect (~16148–16160) to use the extracted hook; add a `door`
  branch to `BSMeGoalCard` (~16654–16690); add a `door` branch to `BSProgressDoor`
  (~15789–15818).

**Interfaces:**
- Consumes: `useBS()`, `bsTHexA()`, `BSPlate` (window-global, used directly),
  `useStateBSC`, `useBSStepGoal()` (~15254), `shapeStepsPoints()` (imported
  `shapeSteps.mjs` helper, already in scope — used verbatim in `BSStepsCard` today),
  `bsInjectFollowChipCss()` (~6951, reused verbatim by `BSProgressDoor`'s door branch —
  same CSS side-effect the legacy render already depends on), `bsSdReduced()` (the
  EXISTING module-scope reduced-motion predicate, ~line 10486 — verified present;
  reused verbatim, do not define a second one).
- Produces (signatures **exact**, per the Interface Registry):
  - `function BSSlateRow({ time, tag, tagColor, title, status, right, onOpen, ariaLabel })`
  - `function BSIndexRow({ label, figure, status, due, done, onOpen })`
  - `function BSHomeBulletin({ label, detail, onOpen })`
  - `function BSShelfDoor({ c, eyebrow, figure, status, pct, onOpen })`
  - `function useBSCheckinLogged()` → `boolean`
  - `function useBSStepsToday()` → `{ hasData, todayKnown, val, goal, pct, hit, stepPts }`
  - `BSTodayNudge({ onOpen, variant })` — `variant` undefined preserves current behavior
    byte-for-byte (verified against the call site at line 2618, unchanged in this task).
  - `BSMeGoalCard({ c, onOpen, compact, door })` — `door` undefined preserves current
    behavior byte-for-byte (call site at line 2671, unchanged in this task).
  - `BSProgressDoor({ onOpen, door })` — `door` undefined preserves current behavior
    byte-for-byte (call site at line 2992, unchanged in this task).
- **NO call sites change in this task.** Lines 2618 / 2671 / 2992 are not touched — the
  page renders identically before and after. Task 6 (out of scope here) flips the call
  sites to the new variants once the slate/index/bulletin/shelf sections exist to host them.

---

- [ ] **Step 1: Insert the four new primitives + two new hooks above `BSTodayNudge`**

Locate the exact existing anchor (verbatim, grep-able):

```
// Today instrument plate — the home daily check-in + hydration, consolidated into
// ONE BSPlate. Energy / Hunger / Rested are tap-to-set 1–10 gauges (no migration —
// the same 1–10 values the old tap-rows wrote); Sleep stays device-first (read-only
// when a wearable synced last night, else manual hour chips). Hydration folds in as a
// dot-progress + quick-add row that STAYS LIVE even after the check-in collapses to
// its one-line summary (you sip water all day). Recovery readiness + the sleep-detail
// door sit in the footer. Replaces BSDailyCheckinCard + BSHydrationCard.
// TODAY nudge — the check-in + hydration box moved to its own page (BSTodayPage);
// Home carries this compact notification-style door instead. Status-aware: "due"
// until a MANUAL signal exists for today (same rule as the card — a wearable
// syncing sleep alone never reads as logged), then flips to a quiet "logged ✓".
function BSTodayNudge({ onOpen }) {
```

Replace it with (the comment block + the new primitives/hooks inserted immediately
before, then the SAME comment block, then the new `BSTodayNudge` signature — the body
of `BSTodayNudge` is replaced in Step 2):

```jsx
// ── Front-Page primitives (spec: docs/superpowers/specs/2026-07-03-home-front-page-hybrid-design.md) ──
// Do not add a plate. If it can't be a row, it lives on a tab and gets at most a row-door.

// BSSlateRow — one time-ordered run-sheet row inside TODAY'S SLATE. min-height 48px,
// grid 50px time / 58px domain-tag / 1fr title / auto status / 20px control-or-chevron,
// 1px t.HAIR bottom rule. Whole row is a button ≥48px tall, Enter/Space-activatable,
// press-flash t.PAPER2 120ms. `right` is undefined → chevron '›'; 'lead' → a
// non-interactive mono "↑ LEAD" echo (no onOpen fires, no chevron); a ReactNode →
// a custom control cell (36px meal ghost-tick / 26px habit checkbox) rendered as-is.
function BSSlateRow({ time, tag, tagColor, title, status, right, onOpen, ariaLabel }) {
  const t = useBS();
  const isLead = right === 'lead';
  const isNode = right && typeof right === 'object';
  const interactive = !isLead && typeof onOpen === 'function';
  const [pressed, setPressed] = useStateBSC(false);
  // NEVER a <button> wrapper — rows contain nested interactive controls (the
  // meal ghost-tick, the habit checkbox), and a <button> nested inside another
  // <button> is invalid HTML. Matches the existing BSPlate pattern
  // (iosAppBroadsheet.jsx ~line 1030): a plain div with role="button" + tabIndex
  // when interactive. Non-interactive rows (right='lead') render a bare div with
  // no role/tabIndex.
  return (
    <div
      onClick={interactive ? onOpen : undefined}
      onKeyDown={interactive ? (e) => {
        // First line, always: a keypress that bubbled up from a nested control
        // (the meal ghost-tick / habit checkbox) must not also trigger the row's
        // own Enter/Space handling (the #1502 keyboard guard).
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      } : undefined}
      onPointerDown={interactive ? () => setPressed(true) : undefined}
      onPointerUp={interactive ? () => setPressed(false) : undefined}
      onPointerLeave={interactive ? () => setPressed(false) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      style={{
        display: 'grid', gridTemplateColumns: '50px 58px 1fr auto 20px', alignItems: 'center', gap: 8,
        width: '100%', minHeight: 48, boxSizing: 'border-box', padding: '6px 0',
        border: 0, borderBottom: `1px solid ${t.HAIR}`, background: pressed ? t.PAPER2 : 'transparent',
        transition: 'background 120ms ease', textAlign: 'left', cursor: interactive ? 'pointer' : 'default',
        font: 'inherit', color: 'inherit',
      }}
    >
      <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', color: t.INK50, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{time || ''}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span aria-hidden style={{ width: 16, height: 2, borderRadius: 1, background: tagColor || t.INK50 }} />
        <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: tagColor || t.INK50, whiteSpace: 'nowrap' }}>{tag}</span>
      </span>
      <span style={{ minWidth: 0, overflow: 'hidden' }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
      </span>
      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK50, whiteSpace: 'nowrap', textAlign: 'right' }}>{status || ''}</span>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        {isLead ? (
          <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', color: t.INK50, whiteSpace: 'nowrap' }}>↑ LEAD</span>
        ) : isNode ? right : (
          <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 13, fontWeight: 700, color: t.INK50 }}>›</span>
        )}
      </span>
    </div>
  );
}

// BSIndexRow — one row in the "Inside." index. 44px, grid 86px domain-label / 1fr
// dot-leader / auto figure / 18px chevron. No background/border/radius — pure
// typographic rows. `due` pulses the 5px status tick; `done` shows a ✓ instead.
function BSIndexRow({ label, figure, status, due, done, onOpen }) {
  const t = useBS();
  const interactive = typeof onOpen === 'function';
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      {...(interactive ? { onClick: onOpen, type: 'button' } : {})}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
      aria-label={interactive ? `${label} ${status || ''}`.trim() : undefined}
      style={{
        display: 'grid', gridTemplateColumns: '86px 1fr auto 18px', alignItems: 'center', gap: 8,
        width: '100%', height: 44, boxSizing: 'border-box', border: 0, background: 'transparent',
        padding: 0, textAlign: 'left', cursor: interactive ? 'pointer' : 'default', font: 'inherit', color: 'inherit',
      }}
    >
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>{label}</span>
      <span aria-hidden style={{ borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-3px)', minWidth: 12 }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden style={{
          width: 5, height: 5, borderRadius: 999, flexShrink: 0,
          background: done ? (t.GREEN || '#5fae7e') : due ? (t.ACCENT || (t.isLight ? '#0a8f87' : '#34d6c5')) : bsTHexA(t.INK, 0.18),
          ...(due && !done && !bsSdReduced() ? { animation: 'bsPlatePulse 1.8s ease-in-out infinite' } : null),
        }} />
        {/* Render the figure even when done — a done row with a real figure
            (e.g. CHECK-IN's figure="Logged ✓") must show that text, not a bare
            "✓" that discards it. Only fall back to a bare checkmark when no
            figure was passed. */}
        <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{done && !figure ? '✓' : figure}</span>
        {status ? <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK50, whiteSpace: 'nowrap' }}>{status}</span> : null}
      </span>
      <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: t.INK50, textAlign: 'right' }}>{interactive ? '›' : ''}</span>
    </Tag>
  );
}

// BSHomeBulletin — a slim 40px one-liner ABOVE the lead, for a due time-sensitive
// item (max 2 on the page). Hairline top+bottom, pulsing 6px tick, mono label +
// detail, trailing ›. Renders only while its caller decides it's due — this
// component itself is unconditional (the caller gates visibility).
function BSHomeBulletin({ label, detail, onOpen }) {
  const t = useBS();
  const accent = t.ACCENT || (t.isLight ? '#0a8f87' : '#34d6c5');
  return (
    <button
      type="button" onClick={onOpen} aria-label={`${label} · ${detail || ''}`.trim()}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 40, boxSizing: 'border-box',
        border: 0, borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}`, background: 'transparent',
        padding: `0 ${t.padX}px`, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: accent, flexShrink: 0, ...(!bsSdReduced() ? { animation: 'bsPlatePulse 1.8s ease-in-out infinite' } : null) }} />
      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{detail}</span>
      <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: accent, flexShrink: 0 }}>›</span>
    </button>
  );
}

// BSShelfDoor — one compact door (~112w×64h) in the horizontal shelf. Native
// button (DOM order = VoiceOver order); `figure` may be a ReactNode (e.g. the
// PROGRESS 4-tick row). `pct` (0–100), when a number, draws a 2px bottom
// progress sliver at that width. Press feedback scale(0.97) 120ms; the scale
// transition is skipped under prefers-reduced-motion (transform still applies
// instantly on press for a11y/testing, just without the animated transition).
function BSShelfDoor({ c, eyebrow, figure, status, pct, onOpen }) {
  const t = useBS();
  const accent = c || (t.ACCENT || (t.isLight ? '#0a8f87' : '#34d6c5'));
  const [pressed, setPressed] = useStateBSC(false);
  const reduced = bsSdReduced();
  const hasPct = typeof pct === 'number' && isFinite(pct);
  return (
    <button
      type="button" onClick={onOpen} aria-label={`${eyebrow || ''} ${status || ''}`.trim()}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      style={{
        position: 'relative', flex: '0 0 auto', width: 112, height: 64, boxSizing: 'border-box',
        scrollSnapAlign: 'start', borderRadius: 6, border: `1px solid ${t.HAIR}`, background: bsTHexA(t.INK, 0.03),
        padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        textAlign: 'left', cursor: 'pointer', overflow: 'hidden',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        ...(reduced ? null : { transition: 'transform 120ms ease' }),
      }}
    >
      <span aria-hidden style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 10px 10px 0', borderColor: `transparent ${accent} transparent transparent`, opacity: 0.7 }} />
      <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{eyebrow}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
        {typeof figure === 'string' || typeof figure === 'number'
          ? <span style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 800, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{figure}</span>
          : figure}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 700, color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status}</span>
        <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: accent, marginLeft: 'auto' }}>›</span>
      </span>
      {hasPct && (
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: bsTHexA(t.INK, 0.08) }}>
          <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: accent, ...(reduced ? null : { transition: 'width 400ms cubic-bezier(.4,0,.2,1)' }) }} />
        </span>
      )}
    </button>
  );
}

// Reduced-motion gating for these primitives reuses the EXISTING module-scope
// `bsSdReduced()` (defined once, ~line 10486) — the single reduced-motion
// predicate app-wide. Do not define a second one here.

// useBSCheckinLogged — the manual-signal "logged for today" predicate, extracted
// VERBATIM from BSTodayNudge's own effect (see the comment above — the has()/
// deviceMeta/rule is copied unchanged, only lifted into a reusable hook).
function useBSCheckinLogged() {
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [logged, setLogged] = useStateBSC(false);
  React.useEffect(() => {
    if (!signedIn || !window.ShapeProgress?.progress) return undefined;
    let on = true;
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    window.ShapeProgress.progress().then((p) => {
      if (!on || !p || !p.series) return;
      const has = (k) => (p.series[k] || []).some((s) => s.date === todayIso);
      const deviceMeta = has('sleepEfficiency') || has('restingHr') || has('hrv');
      if (has('energy') || has('hunger') || has('sleepQuality') || (has('sleep') && !deviceMeta)) setLogged(true);
    }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);
  return logged;
}

// useBSStepsToday — the steps-today data effect + derived render flags, extracted
// VERBATIM from BSStepsCard (goal via the existing useBSStepGoal() hook, signed-out
// preview sample, todayKnown honesty gate, Shape Steps→points conversion).
function useBSStepsToday() {
  const TARGET = useBSStepGoal();
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [steps, setSteps] = useStateBSC(null);
  React.useEffect(() => {
    if (!signedIn || !window.ShapeProgress?.progress) return undefined;
    let on = true;
    window.ShapeProgress.progress().then((p) => {
      if (!on) return;
      const series = p && p.series && Array.isArray(p.series.steps) ? p.series.steps : [];
      const d = new Date();
      const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const row = series.find((s) => s.date === todayIso);
      setSteps({ today: row ? Math.round(Number(row.value) || 0) : null, ever: series.length > 0 });
    }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);
  const hasData = signedIn ? !!(steps && steps.ever) : true;
  const todayKnown = signedIn ? !!(steps && steps.today != null) : true;
  const val = signedIn ? (steps && steps.today != null ? steps.today : 0) : 7240;
  const pct = Math.max(2, Math.min(100, Math.round((val / TARGET) * 100)));
  const hit = todayKnown && val >= TARGET;
  const stepPts = shapeStepsPoints(todayKnown ? val : 0, TARGET);
  return { hasData, todayKnown, val, goal: TARGET, pct, hit, stepPts };
}

// Today instrument plate — the home daily check-in + hydration, consolidated into
// ONE BSPlate. Energy / Hunger / Rested are tap-to-set 1–10 gauges (no migration —
// the same 1–10 values the old tap-rows wrote); Sleep stays device-first (read-only
// when a wearable synced last night, else manual hour chips). Hydration folds in as a
// dot-progress + quick-add row that STAYS LIVE even after the check-in collapses to
// its one-line summary (you sip water all day). Recovery readiness + the sleep-detail
// door sit in the footer. Replaces BSDailyCheckinCard + BSHydrationCard.
// TODAY nudge — the check-in + hydration box moved to its own page (BSTodayPage);
// Home carries this compact notification-style door instead. Status-aware: "due"
// until a MANUAL signal exists for today (same rule as the card — a wearable
// syncing sleep alone never reads as logged), then flips to a quiet "logged ✓".
// variant undefined → the exact current plate render (call site line 2618, untouched
// this task). variant 'bulletin' → BSHomeBulletin CHECK-IN DUE, rendered only while
// due (signed-in gating carried from the plate's own logged-detection scope — the
// bulletin simply renders nothing once logged, matching "decays to an index row once
// logged" from the spec; the index-row decay itself is variant 'row'). variant 'row'
// → BSIndexRow CHECK-IN residue (Logged ✓ · add water), rendered only once logged.
function BSTodayNudge({ onOpen, variant }) {
```

- [ ] **Step 2: Refactor `BSTodayNudge`'s body to consume the hook + branch on `variant`**

Locate the exact existing body (verbatim — this is everything between the signature
line replaced in Step 1 and the function's closing brace):

```
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [logged, setLogged] = useStateBSC(false);
  React.useEffect(() => {
    if (!signedIn || !window.ShapeProgress?.progress) return undefined;
    let on = true;
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    window.ShapeProgress.progress().then((p) => {
      if (!on || !p || !p.series) return;
      const has = (k) => (p.series[k] || []).some((s) => s.date === todayIso);
      const deviceMeta = has('sleepEfficiency') || has('restingHr') || has('hrv');
      if (has('energy') || has('hunger') || has('sleepQuality') || (has('sleep') && !deviceMeta)) setLogged(true);
    }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);
  return (
    <BSPlate c={teal} tick={!logged} bracket pad="12px 16px 12px 22px" role="button" tabIndex={0} ariaLabel="Open today's check-in" onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }}
      style={{ margin: `0 ${t.padX}px 12px`, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Today · how are you</div>
          <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{logged ? 'Logged for today ✓' : 'Quick check-in.'}</div>
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{logged ? 'Tap to review · add water' : 'Energy · sleep · hydration · 30 sec'}</div>
        </div>
        <span style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 5, border: `1px solid ${teal}`, color: teal, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{logged ? 'Open →' : 'Check in →'}</span>
      </div>
    </BSPlate>
  );
}
```

Replace it with:

```jsx
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const logged = useBSCheckinLogged();
  if (variant === 'bulletin') {
    if (logged) return null;
    return <BSHomeBulletin label="Check-in due" detail="Energy · sleep · 30 sec" onOpen={onOpen} />;
  }
  if (variant === 'row') {
    if (!logged) return null;
    return <BSIndexRow label="Check-in" figure="Logged ✓" status="add water" done onOpen={onOpen} />;
  }
  return (
    <BSPlate c={teal} tick={!logged} bracket pad="12px 16px 12px 22px" role="button" tabIndex={0} ariaLabel="Open today's check-in" onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }}
      style={{ margin: `0 ${t.padX}px 12px`, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Today · how are you</div>
          <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{logged ? 'Logged for today ✓' : 'Quick check-in.'}</div>
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{logged ? 'Tap to review · add water' : 'Energy · sleep · hydration · 30 sec'}</div>
        </div>
        <span style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 5, border: `1px solid ${teal}`, color: teal, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{logged ? 'Open →' : 'Check in →'}</span>
      </div>
    </BSPlate>
  );
}
```

The `variant` prop defaults to `undefined` (no default value given — `undefined` falls
through both `if` checks to the original plate render), so the call site at line 2618
(`<BSTodayNudge onOpen={() => setTodayPage(true)} />`) is behavior-identical after this
step: same hook-derived `logged` value (verbatim predicate, now via `useBSCheckinLogged()`
instead of an inline effect), same JSX, same DOM output.

- [ ] **Step 3: Refactor `BSStepsCard`'s data effect to consume `useBSStepsToday()`**

Locate the exact existing block (verbatim):

```
function BSStepsCard() {
  const t = useBS();
  const accent = t.isLight ? '#0a8f87' : '#34d6c5';
  const TARGET = useBSStepGoal();
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [steps, setSteps] = useStateBSC(null);
  const [history, setHistory] = useStateBSC(false);
  React.useEffect(() => {
    if (!signedIn || !window.ShapeProgress?.progress) return undefined;
    let on = true;
    window.ShapeProgress.progress().then((p) => {
      if (!on) return;
      const series = p && p.series && Array.isArray(p.series.steps) ? p.series.steps : [];
      const d = new Date();
      const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const row = series.find((s) => s.date === todayIso);
      setSteps({ today: row ? Math.round(Number(row.value) || 0) : null, ever: series.length > 0 });
    }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);
  // Signed-out preview shows a sample; signed-in shows TODAY's real count (0 until
  // today syncs), and the connect-a-device prompt only when nothing has ever synced.
  const hasData = signedIn ? !!(steps && steps.ever) : true;
  const todayKnown = signedIn ? !!(steps && steps.today != null) : true; // synced today? (else show "—", not 0)
  const val = signedIn ? (steps && steps.today != null ? steps.today : 0) : 7240;
  const pct = Math.max(2, Math.min(100, Math.round((val / TARGET) * 100)));
  const hit = todayKnown && val >= TARGET;
  const stepPts = shapeStepsPoints(todayKnown ? val : 0, TARGET); // today's running Shape Steps → points
  const openDevices = () => { try { window.dispatchEvent(new CustomEvent('shape:openIntegrations')); } catch (e) {} };
  const openHistory = () => setHistory(true);
```

Replace it with:

```jsx
function BSStepsCard() {
  const t = useBS();
  const accent = t.isLight ? '#0a8f87' : '#34d6c5';
  const [history, setHistory] = useStateBSC(false);
  const { hasData, todayKnown, val, goal: TARGET, pct, hit, stepPts } = useBSStepsToday();
  const openDevices = () => { try { window.dispatchEvent(new CustomEvent('shape:openIntegrations')); } catch (e) {} };
  const openHistory = () => setHistory(true);
```

Everything below this point in `BSStepsCard` (the `return (...)` JSX block, lines
~16171–16211 in the pre-task file) is **untouched** — `hasData`, `todayKnown`, `val`,
`TARGET`, `pct`, `hit`, `stepPts` are the same names with the same values (now sourced
from the hook instead of inline computation), so the rendered states are byte-identical.
`BSStepsHistory` stays mounted exactly as before (`{history && <BSStepsHistory .../>}`).

- [ ] **Step 4: Add the `door` branch to `BSMeGoalCard`**

Locate the exact existing signature + honest-gate block (verbatim):

```
function BSMeGoalCard({ c, onOpen, compact = false }) {
  const t = useBS();
  // Follow the paper theme so the goal text reads on light papers too.
  const INK = t.INK, TEAL = t.isLight ? '#0a8f87' : '#34d6c5';
  const SERIF = "'Space Grotesk', -apple-system, system-ui, sans-serif", MONO = "'JetBrains Mono', monospace", SANS = "'Space Grotesk', sans-serif";
  const [g, setG] = useStateBSC(null);
  React.useEffect(() => {
    let on = true;
    (async () => { try { const d = await window.shapeDb?.getUserGoals?.('client_goals'); if (on && d && d.overall) setG(d.overall); } catch (e) {} })();
    return () => { on = false; };
  }, []);
  // Signed in with no goal set → render nothing (never the demo goal); the demo
  // is the signed-out preview only. A real goal (g) shows once it loads.
  const bsGoalSignedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  if (bsGoalSignedIn && !g) return null;
  const ov = g || { title: 'Lean by summer', start: 78, now: 76.8, target: 73.6, unit: 'kg', by: null, why: '' };
  const start = Number(ov.start) || 0, now = Number(ov.now) || 0, target = Number(ov.target) || 0, unit = ov.unit || 'kg';
  const range = start - target;
  const pct = range > 0 ? Math.max(0, Math.min(1, (start - now) / range)) : 0;
  const down = +(now - start).toFixed(1), toGo = +(now - target).toFixed(1);
  const byD = ov.by ? new Date(ov.by) : null;
  const dateLabel = byD && !isNaN(byD) ? byD.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() : null;
  const words = String(ov.title || 'Your goal').trim().split(/\s+/);
  const last = words.length ? words.pop() : '';
  const head = words.join(' ');
  return (
    <BSPlate c={TEAL} notch={12} bracket pad={compact ? '12px 15px' : '16px 18px'} onClick={onOpen} role="button" tabIndex={0} ariaLabel="Open your goal" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }} style={{ width: '100%', textAlign: 'left', marginBottom: compact ? 0 : 14 }}>
```

Replace it with (signature widened to accept `door`, gate + progress math untouched,
one new early-return branch inserted right after the honest-gate line, before the demo
fallback `ov` line so `door` mode shares the exact same signed-in/no-goal null and the
exact same `ov`/`pct` computation the compact/normal branches already use):

```jsx
function BSMeGoalCard({ c, onOpen, compact = false, door = false }) {
  const t = useBS();
  // Follow the paper theme so the goal text reads on light papers too.
  const INK = t.INK, TEAL = t.isLight ? '#0a8f87' : '#34d6c5';
  const SERIF = "'Space Grotesk', -apple-system, system-ui, sans-serif", MONO = "'JetBrains Mono', monospace", SANS = "'Space Grotesk', sans-serif";
  const [g, setG] = useStateBSC(null);
  React.useEffect(() => {
    let on = true;
    (async () => { try { const d = await window.shapeDb?.getUserGoals?.('client_goals'); if (on && d && d.overall) setG(d.overall); } catch (e) {} })();
    return () => { on = false; };
  }, []);
  // Signed in with no goal set → render nothing (never the demo goal); the demo
  // is the signed-out preview only. A real goal (g) shows once it loads. This gate
  // is shared by ALL variants (door included) — a door never appears for a
  // signed-in account with no goal.
  const bsGoalSignedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  if (bsGoalSignedIn && !g) return null;
  const ov = g || { title: 'Lean by summer', start: 78, now: 76.8, target: 73.6, unit: 'kg', by: null, why: '' };
  const start = Number(ov.start) || 0, now = Number(ov.now) || 0, target = Number(ov.target) || 0, unit = ov.unit || 'kg';
  const range = start - target;
  const pct = range > 0 ? Math.max(0, Math.min(1, (start - now) / range)) : 0;
  const down = +(now - start).toFixed(1), toGo = +(now - target).toFixed(1);
  const byD = ov.by ? new Date(ov.by) : null;
  const dateLabel = byD && !isNaN(byD) ? byD.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() : null;
  const words = String(ov.title || 'Your goal').trim().split(/\s+/);
  const last = words.length ? words.pop() : '';
  const head = words.join(' ');
  if (door) {
    return (
      <BSShelfDoor c={TEAL} eyebrow="Goal" figure={`${Math.round(pct * 100)}%`} status="on track" pct={Math.round(pct * 100)} onOpen={onOpen} />
    );
  }
  return (
    <BSPlate c={TEAL} notch={12} bracket pad={compact ? '12px 15px' : '16px 18px'} onClick={onOpen} role="button" tabIndex={0} ariaLabel="Open your goal" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }} style={{ width: '100%', textAlign: 'left', marginBottom: compact ? 0 : 14 }}>
```

The `compact`/`normal` branches (everything from this `<BSPlate>` line through the
function's closing brace, ~16681–16690 pre-task) are **untouched** — same JSX, same
props, same close. The call site at line 2671
(`<BSMeGoalCard c={...} onOpen={...} compact />`) passes no `door`, so `door` defaults
to `false` and the function falls straight through to the pre-existing plate render —
behavior-identical.

- [ ] **Step 5: Add the `door` branch to `BSProgressDoor`**

Locate the exact existing signature + return (verbatim — the ENTIRE current function
body):

```
function BSProgressDoor({ onOpen }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  React.useInsertionEffect(() => { bsInjectFollowChipCss(); }, []);
  const clipN = (n) => `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, 0 100%)`;
  const segs = [['Streak', teal], ['Trends', t.BLUE || (t.isLight ? '#3a6ea5' : '#5b9bd5')], ['Training', t.RUST || '#c0533b'], ['Nutrition', t.AMBER || '#d8b25a']];
  return (
```

Replace it with (signature widened to accept `door`; the `React.useInsertionEffect`
CSS-injector call and the `segs` legend array are carried verbatim — `door` mode reuses
the same 4-entry `segs` as the figure ReactNode's colored ticks; a new early-return
branch is inserted right after `segs`, before the legacy `return (`):

```jsx
function BSProgressDoor({ onOpen, door = false }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  React.useInsertionEffect(() => { bsInjectFollowChipCss(); }, []);
  const clipN = (n) => `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, 0 100%)`;
  const segs = [['Streak', teal], ['Trends', t.BLUE || (t.isLight ? '#3a6ea5' : '#5b9bd5')], ['Training', t.RUST || '#c0533b'], ['Nutrition', t.AMBER || '#d8b25a']];
  if (door) {
    const ticks = (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {segs.map(([lab, sc]) => (
          <span key={lab} aria-hidden title={lab} style={{ width: 6, height: 6, borderRadius: 999, background: sc, flexShrink: 0 }} />
        ))}
      </span>
    );
    return <BSShelfDoor c={teal} eyebrow="Progress" figure={ticks} status="4 sections" onOpen={onOpen} />;
  }
  return (
```

The legacy hand-rolled clipped-plate render (everything from this `return (` through
the function's closing brace, ~15796–15818 pre-task) is **untouched**. The call site at
line 2992 (`<BSProgressDoor onOpen={() => setHomeProgressPage(true)} />`) passes no
`door`, so `door` defaults to `false` and the function falls straight through to the
pre-existing legacy render — behavior-identical.

- [ ] **Step 6: Verify — parse-check**

From the repo root:

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```

Expected: no output (clean parse).

- [ ] **Step 7: Verify — PowerShell mobile build**

```powershell
cd C:\Users\cperr\shape-app\mobile-app
$env:VITE_BASE='/m/'
npm run build
```

Expected: build succeeds, exit 0. Do NOT build from Git Bash (path-mangles
`VITE_BASE=/m/` → `/`). Do not commit `public/m` (built at deploy, #1470).

- [ ] **Step 8: Verify — test suite**

From the repo root:

```bash
npm test
```

Expected: all existing tests pass (no new test files added by this task — the four
primitives/two hooks are unmounted and presentational/derived-state only; behavioral
coverage of `BSTodayNudge`/`BSStepsCard`/`BSMeGoalCard`/`BSProgressDoor`'s unchanged
default paths is via the parse+build gate, per this plan's Global Constraints — no
test-writing step was specified for Task 2).

- [ ] **Step 9: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat: home front-page primitives (BSSlateRow/BSIndexRow/BSHomeBulletin/BSShelfDoor) + useBSCheckinLogged/useBSStepsToday hooks + door/variant branches (unmounted)"
```

### Task 3: Bulletins above the lead + lead plate per spec

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `todayDirective` (~2462–2500), the `BSTodayNudge` mount + coach-pushed-items + directive-plate render block (~2615–2666), the standalone `checkinDue` plate (~2933–2945; deleted).

**Interfaces:**
- Consumes (Interface Registry, verbatim names): `BSHomeBulletin({ label, detail, onOpen })`, `BSTodayNudge({ onOpen, variant })` with `variant="bulletin"`. Both assumed already landed by Tasks 1–2 exactly as declared in the registry — this task does not redefine them. `useBSCheckinLogged()` is NOT called from this task's JSX — `BSTodayNudge`'s `variant="bulletin"` branch already calls it internally and self-gates (returns null once logged); calling it again here would be a second, redundant hook instance racing the same async fetch. (The hook itself stays defined in Task 2 for `BSTodayNudge`'s own internal use — only the external call from Home's JSX is removed.)
- Produces (for Task 4 — exact names, added to the `todayDirective` return object): `leadIsWorkout: boolean` (true only when the lead item is `selWorkout`), `leadMeal: object | null` (the full meal record — `{id,title,sub,kcal,p,c,f,tag,tagColor,time,...}` — from `selMeals`, set only when the lead item is a meal-log entry; `heroMealId` stays `leadMeal ? leadMeal.id : null` for back-compat with the existing Meals slate-row suppression check at the old line 2804). `todayDirective.done` (existing) still means "no lead — show the kept-word state." Non-today (`selIdx !== todayIdx`) still returns `null` (unchanged gate at line 2468).
- Deviation from the Interface Registry: `BSHomeBulletin`/`BSTodayNudge` variant are consumed exactly as declared. `useBSCheckinLogged()` is declared in the registry as a hook `BSTodayNudge` itself uses internally — this task deliberately does NOT also call it from Home's JSX (see the Consumes note above; that would be a redundant second hook instance, and per the binding decision no hook may be called inside BSClientHome's return JSX at all). The one addition (`leadIsWorkout`/`leadMeal`) is explicitly invited by the plan header ("add e.g. `leadIsWorkout` if needed").

- [ ] **Step 1: Extend `todayDirective` to carry lead-identity flags + the full lead meal record**

Locate this exact block (current lines 2490–2500):

```jsx
    const todo = [];
    if (engineMove) todo.push({ head: engineMove.head, sub: [engineFlag.reason, engineMove.stakes].filter(Boolean).join(' · '), cta: engineMove.cta, c: engineMove.c, engine: true });
    if (selWorkout && selWorkout.title) todo.push({ label: selWorkout.title, cta: ["I'll train today →", () => setShowWorkoutPreview(true)], c: t.RUST });
    selMeals.filter(m => !mealLogged[m.id]).forEach(m => todo.push({ label: `Log ${m.title}`, cta: ["I'll log it →", () => { setMealToLog(m); setLoggingMealId(m.id); setShowLogMeal(true); }], c: _teal, mealId: m.id }));
    const habitsLeft = selDayHabits.filter(h => !h.done).length;
    if (habitsLeft > 0) todo.push({ label: `${habitsLeft} habit${habitsLeft > 1 ? 's' : ''} to finish`, cta: ["I'll finish my habits →", () => setHabitsPage(true)], c: t.GREEN });
    // Kept-promise echo: when everything's logged, close the loop on the day's pledge.
    if (!todo.length) return { done: true, head: "You kept your word today.", sub: "Everything you said you'd do — done.", c: t.GREEN };
    const lead = todo[0];
    return { head: lead.engine ? lead.head : lead.label, cta: lead.cta, c: lead.c, sub: lead.engine ? lead.sub : (todo.length > 1 ? `${todo.length - 1} more on today's plan` : null), heroMealId: lead.mealId || null };
  })();
```

Replace with:

```jsx
    const todo = [];
    if (engineMove) todo.push({ head: engineMove.head, sub: [engineFlag.reason, engineMove.stakes].filter(Boolean).join(' · '), cta: engineMove.cta, c: engineMove.c, engine: true });
    if (selWorkout && selWorkout.title) todo.push({ label: selWorkout.title, cta: ["I'll train today →", () => setShowWorkoutPreview(true)], c: t.RUST, workout: true });
    selMeals.filter(m => !mealLogged[m.id]).forEach(m => todo.push({ label: `Log ${m.title}`, cta: ["I'll log it →", () => { setMealToLog(m); setLoggingMealId(m.id); setShowLogMeal(true); }], c: _teal, mealId: m.id, meal: m }));
    const habitsLeft = selDayHabits.filter(h => !h.done).length;
    if (habitsLeft > 0) todo.push({ label: `${habitsLeft} habit${habitsLeft > 1 ? 's' : ''} to finish`, cta: ["I'll finish my habits →", () => setHabitsPage(true)], c: t.GREEN });
    // Kept-promise echo: when everything's logged, close the loop on the day's pledge.
    if (!todo.length) return { done: true, head: "You kept your word today.", sub: "Everything you said you'd do — done.", c: t.GREEN, leadIsWorkout: false, leadMeal: null };
    const lead = todo[0];
    return {
      head: lead.engine ? lead.head : lead.label, cta: lead.cta, c: lead.c,
      sub: lead.engine ? lead.sub : (todo.length > 1 ? `${todo.length - 1} more on today's plan` : null),
      heroMealId: lead.mealId || null,
      // Lead-identity flags (Task 4 reads these to suppress the slate's echo row's
      // second interactive surface — the double-feature fix).
      leadIsWorkout: !!lead.workout,
      leadMeal: lead.meal || null,
    };
  })();
```

- [ ] **Step 2: Replace the `BSTodayNudge` mount + coach-pushed-items block + directive plate with bulletins-then-lead**

Locate this exact block (current lines 2615–2666, from the TODAY comment through the directive `BSPlate`'s closing `)}`):

```jsx
      {/* TODAY — the daily check-in + hydration box lives on its OWN page; this
          notification-style door (due vs logged-aware) leads the card list,
          right under the week calendar. */}
      <BSTodayNudge onOpen={() => setTodayPage(true)} />

      {/* From your coach — pushed items (meals/workouts) from coach_pushed_items */}
      {/* (RLS-scoped to me). The coach's focus-banner note renders in the Op-ed below. */}
      {coachFeed.items.length > 0 && (
        <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.ACCENT, marginBottom: 10 }}>
            From your coach
          </div>
          {coachFeed.items.length > 0 && (
            <div style={{ marginTop: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>
                For today
              </div>
              {coachFeed.items.map(it => {
                const p = it.payload || {};
                const isMeal = it.kind === 'meal';
                const meta = isMeal
                  ? [p.time, p.kcal != null ? p.kcal + ' kcal' : null, p.protein != null ? p.protein + 'g P' : null].filter(Boolean).join(' · ')
                  : [p.sets, p.reps, p.tempo && ('Tempo ' + p.tempo)].filter(Boolean).join(' · ');
                return (
                  <BSPlate key={it.id} c={isMeal ? (t.isLight ? '#0a8f87' : '#34d6c5') : t.RUST} notch={8} spine={2.5} pad="10px 12px 10px 16px" style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: t.INK }}>{p.name}</div>
                    {meta && <div style={{ fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.06em', color: t.INK50, marginTop: 2 }}>{meta}</div>}
                    {(p.cue || p.note) && <div style={{ fontSize: 12, color: t.INK50, marginTop: 4, fontStyle: 'italic' }}>"{p.cue || p.note}"</div>}
                  </BSPlate>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TODAY · YOUR MOVE — the single elevated hero. One right action for today:
          the signal engine's top flag when it has one, else the plan's next move.
          Everything below steps down a level (this is the only glowing plate). */}
      {todayDirective && (
        <BSPlate c={todayDirective.c} tick bracket pad="13px 18px 13px 24px" data-tour="hero-home" style={{ margin: `10px ${t.padX}px 6px`, textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: todayDirective.c }}>{todayDirective.done ? 'Today · done' : 'Today · your move'}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][_now.getDay()]} {_now.getDate()}</span>
          </div>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 22, lineHeight: 1.06, letterSpacing: '-0.03em', color: t.INK }}>{todayDirective.head}</div>
          {todayDirective.sub && <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{todayDirective.sub}</div>}
          {todayDirective.cta && (
            <button onClick={todayDirective.cta[1]} style={{ marginTop: 10, padding: '10px 17px', borderRadius: 9, border: `1px solid ${todayDirective.c}`, background: `${todayDirective.c}1f`, color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{todayDirective.cta[0]}</button>
          )}
        </BSPlate>
      )}
```

Replace with:

```jsx
      {/* BULLETINS — max 2 slim one-liners, ABOVE the lead. Each suppressed
          per-lever, not by whether a lead exists at all (the spec: bulletins
          suppress "when the lever they represent is already the lead"). The
          daily check-in bulletin is NOT gated externally here — BSTodayNudge's
          variant="bulletin" already self-gates on `useBSCheckinLogged()`
          internally (returns null once logged), so the only external
          suppression needed is the engine's `checkin` lever leading. Calling
          useBSCheckinLogged() again here would be a second hook instance
          racing the same async fetch against BSTodayNudge's own — deleted, not
          duplicated. Same per-lever suppression on the weekly bulletin: it
          hides only when the engine's `checkin` lever is the lead, not
          whenever ANY lead exists (a workout/meal/habit lead must not eat the
          weekly check-in's only Home surface). Urgency earns height;
          completion demotes to an index row (Task 5, INSIDE.). */}
      {!(engineFlag && engineFlag.lever === 'checkin') && (
        <BSTodayNudge onOpen={() => setTodayPage(true)} variant="bulletin" />
      )}
      {checkinDue && !(engineFlag && engineFlag.lever === 'checkin') && (
        <BSHomeBulletin label="Weekly check-in due" detail="2 min" onOpen={() => setCheckinPage(true)} />
      )}

      {/* From your coach — pushed items (meals/workouts) from coach_pushed_items */}
      {/* (RLS-scoped to me). The coach's focus-banner note renders in the Op-ed below. */}
      {coachFeed.items.length > 0 && (
        <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.ACCENT, marginBottom: 10 }}>
            From your coach
          </div>
          {coachFeed.items.length > 0 && (
            <div style={{ marginTop: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>
                For today
              </div>
              {coachFeed.items.map(it => {
                const p = it.payload || {};
                const isMeal = it.kind === 'meal';
                const meta = isMeal
                  ? [p.time, p.kcal != null ? p.kcal + ' kcal' : null, p.protein != null ? p.protein + 'g P' : null].filter(Boolean).join(' · ')
                  : [p.sets, p.reps, p.tempo && ('Tempo ' + p.tempo)].filter(Boolean).join(' · ');
                return (
                  <BSPlate key={it.id} c={isMeal ? (t.isLight ? '#0a8f87' : '#34d6c5') : t.RUST} notch={8} spine={2.5} pad="10px 12px 10px 16px" style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: t.INK }}>{p.name}</div>
                    {meta && <div style={{ fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.06em', color: t.INK50, marginTop: 2 }}>{meta}</div>}
                    {(p.cue || p.note) && <div style={{ fontSize: 12, color: t.INK50, marginTop: 4, fontStyle: 'italic' }}>"{p.cue || p.note}"</div>}
                  </BSPlate>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ★ THE LEAD — the single elevated hero, the ONLY BSPlate on the page.
          One right action for today: the signal engine's top flag when it has
          one, else the plan's next move. Lead=workout carries the compact
          3-move list + the first-person CTA + a quiet mono PREVIEW → link into
          the existing workout preview. Lead=meal carries title + macros + its
          CTA. Done-state ("You kept your word today.") still renders — the
          fold is never empty. */}
      {todayDirective && (
        <BSPlate c={todayDirective.c} tick bracket pad="13px 18px 13px 24px" data-tour="hero-home" style={{ margin: `10px ${t.padX}px 6px`, textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: todayDirective.c }}>{todayDirective.done ? 'Today · done' : 'Today · your move'}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][_now.getDay()]} {_now.getDate()}</span>
          </div>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 22, lineHeight: 1.06, letterSpacing: '-0.03em', color: t.INK }}>{todayDirective.head}</div>
          {todayDirective.sub && <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{todayDirective.sub}</div>}
          {todayDirective.leadIsWorkout && _wkCompactLead.length > 0 && (
            <div style={{ marginTop: 9 }}>
              {_wkCompactLead.map(([n, name, sub, wt], i, arr) => (
                <div key={`lead-${n}-${i}`} onClick={() => setShowWorkoutPreview(true)} style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`, cursor: 'pointer' }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK50 }}>{n}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{name}</div>
                    <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>{sub}</div>
                  </div>
                  {wt ? <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{wt}</span> : <span />}
                </div>
              ))}
            </div>
          )}
          {todayDirective.leadMeal && (
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50, fontWeight: 600 }}>
              {todayDirective.leadMeal.kcal} kcal · {todayDirective.leadMeal.p}P · {todayDirective.leadMeal.c}C · {todayDirective.leadMeal.f}F
            </div>
          )}
          {todayDirective.cta && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={todayDirective.cta[1]} style={{ padding: '10px 17px', borderRadius: 9, border: `1px solid ${todayDirective.c}`, background: `${todayDirective.c}1f`, color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{todayDirective.cta[0]}</button>
              {todayDirective.leadIsWorkout && (
                <button onClick={() => setShowWorkoutPreview(true)} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>Preview →</button>
              )}
            </div>
          )}
        </BSPlate>
      )}
```

Note: `_wkCompactLead` is a small helper computed once above this block (Step 3) — it mirrors the existing `_wkCompact` build (used later by the slate's TRAINING row / Task 4) so the lead plate's move list matches the slate's list exactly, without depending on Task 4's row code executing first in file order.

- [ ] **Step 3: Add the `_wkCompactLead` helper (lead-plate move list) right before the bulletins block**

`_wkCompact` (the compact 3-move-list builder) is currently defined *inside* the IIFE at ~2709 (`(() => { … const _wkCompact = … })()`), which renders far below the lead plate — the lead plate needs its own copy available at render time. Locate this exact anchor (the closing of the `todayDirective` IIFE, immediately followed by the `return (` / `<BSPage>` open — current lines 2500–2504):

```jsx
    };
  })();

  return (
    <BSPage>
```

Replace with:

```jsx
    };
  })();

  // Compact 3-move list for the LEAD plate when lead=workout (mirrors the
  // slate TRAINING row's own list — same source, same 3-move truncation — so
  // the lead and the slate never disagree on what "today's workout" is).
  const _wkCompactLead = (() => {
    if (!(todayDirective && todayDirective.leadIsWorkout && selWorkout)) return [];
    const moves = (selWorkout.detail && selWorkout.detail.moves) || [];
    const compact = moves.slice(0, 3).map((m, i) => [String(i + 1).padStart(2, '0'), m.name, String(m.scheme || '').replace(' rest', ''), m.load || '']);
    if (moves.length > 3) compact.push(['+', `+ ${moves.length - 3} more`, moves.slice(3).map((m) => m.name).slice(0, 3).join(' · '), '']);
    return compact;
  })();

  return (
    <BSPage>
```

- [ ] **Step 4: Delete the standalone weekly check-in `checkinDue` plate**

Locate this exact block (current lines 2933–2945, between the SHOP LIST plate and the WEEK TOTALS section):

```jsx
      {/* WEEKLY CHECK-IN — nudge plate when this week's check-in hasn't been sent */}
      {checkinDue && (
        <BSPlate c={t.ACCENT} tick pad="12px 16px 12px 22px" role="button" ariaLabel="Open the weekly check-in" onClick={() => setCheckinPage(true)} style={{ margin: `0 ${t.padX}px 12px`, textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ACCENT }}>Weekly check-in · due</div>
              <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>Tell your coach how the week went.</div>
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Ratings · photos · measurements · 2 min</div>
            </div>
            <span style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 5, border: `1px solid ${t.ACCENT}`, color: t.ACCENT, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Check in →</span>
          </div>
        </BSPlate>
      )}

      {/* WEEK TOTALS — running tally; tap a card for history / a chart */}
```

Replace with:

```jsx
      {/* Weekly check-in due plate DELETED (Front-Page restructure) — its due
          state now lives in the BULLETINS block above the lead (BSHomeBulletin,
          suppressed only when the engine's checkin lever is the lead — not
          whenever any lead exists); its logged residue becomes an INSIDE.
          index row (Task 5). */}

      {/* WEEK TOTALS — running tally; tap a card for history / a chart */}
```

- [ ] **Step 5: Verify — parse-check**

From `mobile-app/`:
```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Expect no output (clean parse).

- [ ] **Step 6: Verify — mobile build (PowerShell only)**

```powershell
cd C:\Users\cperr\shape-app\mobile-app
$env:VITE_BASE='/m/'; npm run build
```
Expect exit code 0.

- [ ] **Step 7: Verify — full test suite**

From repo root:
```bash
npm test
```
Expect all tests green (no regressions from this task — it adds no new pure-module logic).

- [ ] **Step 8: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat: home bulletins above the lead + lead plate carries workout/meal detail per Front-Page spec"
```

### Task 4: TODAY'S SLATE run-sheet (meals, workout, habits, coach rows, op-ed notes + leak fix)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (import line 8; the coach-pushed-items block ~2622-2649; the "TODAY · YOUR MOVE" plate stays untouched but the section immediately below it changes; the AgendaCard workout+meals block ~2678-2847; the HABITS plate ~2849-2908; the "THIS WEEK'S NOTE" block ~3068-3120, deleted)

**Interfaces:**
- Consumes (Task 1 — `mobile-app/src/services/homeSlate.mjs`): `bsHomeSlateSort(rows)`, `bsHomeTimeMinutes(str)`.
- Consumes (Task 2 — same file, window-scope function components, already defined above `BSClientHome` by the time this section renders): `BSSlateRow({ time, tag, tagColor, title, status, right, onOpen, ariaLabel })` (Task 6 later widens this signature with an `index` prop for the stagger — this task's `.map()` call already passes `index={i}` so no further edit is needed at Task 6 time).
- Consumes (existing, untouched): `selMeals`, `mealLogged`/`setMealLogged`, `setMealToLog`/`setLoggingMealId`/`setShowLogMeal`, `setPreviewMeal`, `todayDirective.heroMealId`, `todayDirective.leadIsWorkout` (Task 3 — read by `workoutIsLead`, not a title-string comparison), `selWorkout`, `setShowWorkoutPreview`, `goTrain`, `selDayHabits`, `toggleHomeHabit`, `habitFlash`, `setHabitsPage`, `coachFeed.{items,banners}`, `bsHomeSignedIn`, `livePlan`, `upNextLabel`, `goEat`, `t = useBS()`.
- Produces: nothing new is exported — this task replaces three render regions with one inline IIFE section (matching the file's existing `{(() => { ... })()}` pattern used by the AgendaCard/Habits/Shop-list/Week-totals blocks) between the lead plate (`todayDirective` / `BSMeGoalCard`) and the `BSStepsCard` call. No behavior outside the render is added. Each entry pushed onto the `rows` array carries a stable `key` field (`meal-${m.id}` / `slate-training` / `habit-${h.id || h.name}` / `coach-${it.id}`) — these are the AUTHORITATIVE stable keys; the final `.map()` reads `key={r.key}` and passes `index={i}` (for Task 6's stagger), never an index-derived key.

- [ ] **Step 1: Add the `homeSlate.mjs` import**

Locate (top of file, verbatim):
```js
import { bsSdSplitUnit, bsSdRankStats, bsSdNeedle } from '../services/sessionLedger.mjs';
```

Replace with:
```js
import { bsSdSplitUnit, bsSdRankStats, bsSdNeedle } from '../services/sessionLedger.mjs';
import { bsHomeSlateSort, bsHomeTimeMinutes } from '../services/homeSlate.mjs';
```

- [ ] **Step 2: Delete the coach-pushed-items block — folded into the slate rows in Step 4**

Stale-anchor note: Task 3 already rewrote the comment immediately following this
block from `{/* TODAY · YOUR MOVE — …` to `{/* ★ THE LEAD — …`, and relocated the
coach-pushed-items block itself to sit AFTER the bulletins (between the bulletins
and the lead) rather than before the (now-deleted) directive plate. So this step's
locate/replace must match the POST-Task-3 file — anchor ONLY on the coach-pushed
block itself (which Task 3 leaves byte-identical), not on the trailing comment.

Locate (verbatim — the whole block, including its two comment lines above it; this
exact text is unchanged by Task 3, only what follows it changed):
```jsx
      {/* From your coach — pushed items (meals/workouts) from coach_pushed_items */}
      {/* (RLS-scoped to me). The coach's focus-banner note renders in the Op-ed below. */}
      {coachFeed.items.length > 0 && (
        <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.ACCENT, marginBottom: 10 }}>
            From your coach
          </div>
          {coachFeed.items.length > 0 && (
            <div style={{ marginTop: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>
                For today
              </div>
              {coachFeed.items.map(it => {
                const p = it.payload || {};
                const isMeal = it.kind === 'meal';
                const meta = isMeal
                  ? [p.time, p.kcal != null ? p.kcal + ' kcal' : null, p.protein != null ? p.protein + 'g P' : null].filter(Boolean).join(' · ')
                  : [p.sets, p.reps, p.tempo && ('Tempo ' + p.tempo)].filter(Boolean).join(' · ');
                return (
                  <BSPlate key={it.id} c={isMeal ? (t.isLight ? '#0a8f87' : '#34d6c5') : t.RUST} notch={8} spine={2.5} pad="10px 12px 10px 16px" style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: t.INK }}>{p.name}</div>
                    {meta && <div style={{ fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.06em', color: t.INK50, marginTop: 2 }}>{meta}</div>}
                    {(p.cue || p.note) && <div style={{ fontSize: 12, color: t.INK50, marginTop: 4, fontStyle: 'italic' }}>"{p.cue || p.note}"</div>}
                  </BSPlate>
                );
              })}
            </div>
          )}
        </div>
      )}
```

Delete this block entirely. Do not try to match anything after it verbatim — per
Task 3, the very next line is now the `{/* ★ THE LEAD — …` comment introducing the
lead plate (unchanged by this step). After deletion, that `★ THE LEAD` comment +
the lead plate that follows it sit directly where the coach-pushed block used to be.

*(The coach-pushed-items data + rendering resurface as COACH rows inside the slate in Step 4 — nothing is lost, only relocated below the lead.)*

- [ ] **Step 3: Delete the AgendaCard workout+meals block and the HABITS plate (~2678-2908) — replaced by the slate in Step 4**

Locate the exact start anchor (verbatim, immediately after the `BSMeGoalCard` div and the up-next `BSSection`):
```jsx
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const rust = t.RUST;
        // "Up next" cards ride the shared instrument plate (chrome's BSPlate).
        const AgendaCard = ({ c, children }) => (
```

...through the exact end anchor (verbatim — the closing of the HABITS plate IIFE, immediately before the SHAPE STEPS comment):
```jsx
            </BSPlate>
          </div>
        );
      })()}

      {/* SHAPE STEPS — the daily steps instrument (moved off the profile; it
          belongs with the day's living metrics). Taps into the steps history. */}
      <BSStepsCard />
```

Delete everything from the first anchor through (but not including) the `{/* SHAPE STEPS` comment — i.e. delete both the AgendaCard IIFE (workout + meals, ~2678-2847) and the HABITS IIFE (~2849-2908) in one contiguous cut, leaving:
```jsx
      {/* SHAPE STEPS — the daily steps instrument (moved off the profile; it
          belongs with the day's living metrics). Taps into the steps history. */}
      <BSStepsCard />
```

*(`BSStepsCard` and everything after it is untouched — Task 5 owns the INSIDE. index/shelf and may relocate `BSStepsCard` into a door; this task does not touch it.)*

- [ ] **Step 4: Insert the TODAY'S SLATE section in place of the deleted blocks**

Immediately before the `{/* SHAPE STEPS` comment (now directly below the `BSMeGoalCard` div from Step 2's surviving lead plate), insert:

```jsx
      {/* TODAY'S SLATE — one time-ordered run-sheet. Admission test: "is this
          scheduled to happen TODAY?" Rows, not cards. Anti-accretion: a future
          feature may claim a slate row only by passing that test; otherwise it
          lives on a tab and gets at most an index row / shelf door (see §5). */}
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const rust = t.RUST;
        // Coach-scheduled times (24h minutes) drive both the displayed time and
        // the sort order — carried verbatim from the pre-slate AgendaCard block.
        const _wkAt = (selWorkout && selWorkout.time && selWorkout.time !== '—') ? selWorkout.time : '09:00';
        const [_wkH, _wkM] = String(_wkAt).split(':').map(Number);
        const WORKOUT_AT = (Number.isNaN(_wkH) ? 9 : _wkH) * 60 + (Number.isNaN(_wkM) ? 0 : _wkM);
        const _wkShortMeta = (selWorkout && selWorkout.detail && selWorkout.detail.meta)
          ? selWorkout.detail.meta.split(' · ').slice(0, 3).join(' · ')
          : (selWorkout && selWorkout.sub) || '';
        const _lunchPref = (typeof window !== 'undefined' && window.ShapeMealTimes && window.ShapeMealTimes.get().LUNCH) || '12:40';
        const [_lh, _lm] = String(_lunchPref).split(':').map(Number);
        const MEAL_AT = (Number.isNaN(_lh) ? 12 : _lh) * 60 + (Number.isNaN(_lm) ? 40 : _lm);
        const fmtAt = (mins) => {
          const h = Math.floor(mins / 60), m = mins % 60;
          const ap = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 === 0 ? 12 : h % 12;
          return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
        };
        const mealMinutes = (m) => {
          const [h, mm] = String(m.time || '').split(':').map(Number);
          if (!Number.isNaN(h)) return h * 60 + (Number.isNaN(mm) ? 0 : mm);
          return MEAL_AT;
        };
        const slotLabel = (m) => {
          const tag = String(m.tag || '').toUpperCase();
          if (tag.startsWith('BFAST') || tag.startsWith('BREAK')) return 'Breakfast';
          if (tag.startsWith('LUNCH')) return 'Lunch';
          if (tag.startsWith('SNACK')) return 'Snack';
          if (tag.startsWith('DIN')) return 'Dinner';
          const h = Math.floor(mealMinutes(m) / 60);
          return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 17 ? 'Snack' : 'Dinner';
        };
        // Ghost log-tick — the 36px inline control cell for a MEAL row's `right`
        // slot. Carries the exact tap targets the old mealsCard glance used
        // (setMealToLog/setLoggingMealId/setShowLogMeal), plus the LOGGED state.
        const MealTick = ({ m, logged }) => logged ? (
          <span aria-hidden style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', color: teal }}>✓</span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setMealToLog(m); setLoggingMealId(m.id); setShowLogMeal(true); }}
            aria-label={`Log ${m.title}`}
            style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, border: `1.5px solid ${teal}`, background: `${teal}12`, cursor: 'pointer', padding: 0 }}
          />
        );
        // Untimed rows come after all timed rows (bsHomeSlateSort's contract);
        // every row here carries a real `time` so this only matters if a future
        // row type omits one — kept honest rather than assumed.
        const rows = [];
        // MEAL rows — one per selMeals meal. heroMealId suppresses the tick with
        // the lead echo (no second interactive surface on the lead's subject).
        selMeals.forEach((m) => {
          const logged = !!mealLogged[m.id];
          const isLead = !!(todayDirective && todayDirective.heroMealId === m.id);
          rows.push({
            key: `meal-${m.id}`,
            time: fmtAt(mealMinutes(m)),
            _sortAt: mealMinutes(m),
            tag: 'MEAL', tagColor: teal,
            title: m.title,
            status: `${slotLabel(m)} · ${m.kcal ? `${m.kcal} kcal` : ''}`.replace(/ · $/, ''),
            right: isLead ? 'lead' : <MealTick m={m} logged={logged} />,
            onOpen: () => setPreviewMeal(m),
            ariaLabel: `${m.title}, ${slotLabel(m)}, ${logged ? 'logged' : 'not logged'}`,
          });
        });
        // TRAINING row — real duration status; lead echo when the lead IS the
        // workout, else a quiet Start → link (training stays one tap). Rest day
        // → the Active-recovery row (carried verbatim from the old rest-day
        // branch's copy/tone, condensed to slate-row shape).
        // Reads Task 3's authoritative leadIsWorkout flag — never re-derive lead
        // status via a title-string comparison (todayDirective.head === selWorkout.title
        // is fragile: it only happens to work because Task 3's todo.push sets
        // label: selWorkout.title verbatim, and breaks silently the moment that
        // coupling drifts).
        const workoutIsLead = !!(todayDirective && todayDirective.leadIsWorkout);
        if (selWorkout) {
          rows.push({
            key: 'slate-training',
            time: fmtAt(WORKOUT_AT),
            _sortAt: WORKOUT_AT,
            tag: 'TRAINING', tagColor: rust,
            title: selWorkout.title,
            status: _wkShortMeta,
            right: workoutIsLead ? 'lead' : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={(e) => { e.stopPropagation(); goTrain?.(); }} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: rust }}>Start →</button>
                <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 12, color: t.INK50 }}>›</span>
              </div>
            ),
            onOpen: () => setShowWorkoutPreview(true),
            ariaLabel: `${selWorkout.title}, training, ${_wkShortMeta}`,
          });
        } else {
          rows.push({
            key: 'slate-training',
            time: fmtAt(WORKOUT_AT),
            _sortAt: WORKOUT_AT,
            tag: 'TRAINING', tagColor: t.GREEN,
            title: 'Active recovery',
            status: 'Rest day · an easy walk and 10 min of mobility keeps the streak alive',
            right: undefined,
            onOpen: undefined,
            ariaLabel: 'Active recovery, rest day',
          });
        }
        // COACH rows — pushed items from coach_pushed_items (payload taps carried
        // verbatim from the deleted "From your coach" block).
        (coachFeed.items || []).forEach((it) => {
          const p = it.payload || {};
          const isMeal = it.kind === 'meal';
          const meta = isMeal
            ? [p.time, p.kcal != null ? p.kcal + ' kcal' : null, p.protein != null ? p.protein + 'g P' : null].filter(Boolean).join(' · ')
            : [p.sets, p.reps, p.tempo && ('Tempo ' + p.tempo)].filter(Boolean).join(' · ');
          const atMins = bsHomeTimeMinutes(p.time);
          rows.push({
            key: `coach-${it.id}`,
            time: p.time || '',
            _sortAt: atMins == null ? undefined : atMins,
            tag: 'COACH', tagColor: isMeal ? teal : rust,
            title: p.name || (isMeal ? 'Meal from your coach' : 'Workout from your coach'),
            status: [meta, p.cue || p.note].filter(Boolean).join(' · '),
            right: undefined,
            onOpen: undefined,
            ariaLabel: `Coach-pushed ${isMeal ? 'meal' : 'workout'}: ${p.name || ''}`,
          });
        });
        // OPEN habit rows — up to 3, carried verbatim from the deleted HABITS
        // plate: habit checkbox stopPropagation + the #1502 keyboard guard on
        // the ROW (BSSlateRow's onKeyDown, first line: `if (e.target !==
        // e.currentTarget) return;` — added in Task 2). The checkbox itself is
        // a leaf control, not a container an event could bubble THROUGH before
        // reaching it — it only needs stopPropagation on click (so the row's
        // onOpen doesn't also fire) plus its own native <button> Enter/Space
        // activation. Do NOT re-add the e.target!==e.currentTarget guard on
        // the checkbox's own onKeyDown — a bare <button> has no children for a
        // keypress to bubble up FROM, so that guard there is meaningless (it
        // would always be true) and duplicates logic that already lives one
        // level up, on the row.
        const habitsDone = selDayHabits.filter(h => h.done).length;
        const habitsPts = selDayHabits.filter(h => h.done).reduce((a, h) => a + Math.round(h.pts), 0);
        const habitsPossible = selDayHabits.reduce((a, h) => a + Math.round(h.pts), 0);
        const openHabits = selDayHabits.filter(h => !h.done);
        openHabits.slice(0, 3).forEach((h) => {
          const avoid = h.type === 'avoid';
          const pillC = avoid ? t.RUST : t.GREEN;
          rows.push({
            key: `habit-${h.id || h.name}`,
            time: '', _sortAt: undefined,
            tag: avoid ? 'AVOID' : 'DO', tagColor: pillC,
            title: h.name,
            status: `+${Math.round(h.pts)} pts`,
            right: (
              <button
                onClick={(e) => { e.stopPropagation(); toggleHomeHabit(h); }}
                aria-label={h.live ? `Mark ${h.name} done` : 'Demo habits — open the habits page'}
                style={{ width: 26, height: 26, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${h.live ? pillC : t.RULE}`, background: `${pillC}12`, cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center', fontSize: 11, lineHeight: 1 }}
              >{h.live ? '' : '🔒'}</button>
            ),
            onOpen: () => setHabitsPage(true),
            ariaLabel: `${avoid ? 'Avoid' : 'Do'}: ${h.name}, worth ${Math.round(h.pts)} points, ${h.done ? 'done' : 'open'}`,
          });
        });
        const timedRows = rows.filter((r) => r._sortAt !== undefined).sort((a, b) => a._sortAt - b._sortAt);
        const untimedRows = rows.filter((r) => r._sortAt === undefined);
        const sortedRows = bsHomeSlateSort([...timedRows, ...untimedRows]);
        return (
          <>
            <div style={{ padding: `${t.sectGap}px ${t.padX}px 8px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 9, minWidth: 0, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK, whiteSpace: 'nowrap' }}>▤ Today's slate</span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>{upNextLabel}</span>
              </span>
              <button onClick={() => goEat()} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 4, border: `1px solid ${teal}66`, borderLeft: `3px solid ${teal}`, background: `${teal}14`, color: t.INK, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>Eat →</button>
            </div>
            <div style={{ padding: `0 ${t.padX}px 4px` }}>
              <div aria-hidden style={{ height: 2, background: `linear-gradient(90deg, ${t.INK}, ${t.ACCENT} 58%, transparent)`, marginBottom: 4 }} />
            </div>
            <div>
              {sortedRows.length === 0 ? (
                <div style={{ padding: `10px ${t.padX}px 16px`, fontFamily: t.BODY, fontSize: 13.5, color: t.INK70, lineHeight: 1.45 }}>Nothing scheduled for today.</div>
              ) : sortedRows.map((r, i) => (
                <BSSlateRow key={r.key} index={i} time={r.time} tag={r.tag} tagColor={r.tagColor} title={r.title} status={r.status} right={r.right} onOpen={r.onOpen} ariaLabel={r.ariaLabel} />
              ))}
              {openHabits.length > 3 && (
                <button onClick={() => setHabitsPage(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: `10px ${t.padX}px`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: `1px solid ${t.HAIR}` }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>+{openHabits.length - 3} more habit{openHabits.length - 3 > 1 ? 's' : ''}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.GREEN, fontWeight: 800 }}>View all →</span>
                </button>
              )}
              {selDayHabits.length === 0 && (
                <div style={{ padding: `10px ${t.padX}px 4px`, fontFamily: t.BODY, fontSize: 13, color: t.INK70, lineHeight: 1.4 }}>
                  <button onClick={() => setHabitsPage(true)} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: t.GREEN, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>+ Add your first habit →</button>
                </div>
              )}
              {selDayHabits.length > 0 && openHabits.length === 0 && (
                <div style={{ padding: `10px ${t.padX}px 4px`, fontFamily: t.BODY, fontSize: 13, color: t.INK70, lineHeight: 1.4 }}>
                  All habits done — <span style={{ color: t.GREEN, fontWeight: 700 }}>+{habitsPts} pts</span> banked today.
                </div>
              )}
              {habitFlash && (
                <div style={{ margin: `8px ${t.padX}px 0`, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 4, background: `${t.ACCENT}1f`, border: `1px solid ${t.ACCENT}55`, color: t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em' }}>✓ +{habitFlash.pts} pts → Shape Score</div>
              )}
            </div>
            {/* COACH WEEKLY NOTES — both notes as italic op-ed lines WITH bylines,
                rendered INSIDE the slate section, after the rows. Fixes the
                pre-existing demo-notes leak: the Jordan Chen / Dr. Maya Patel
                fallback (formerly map lines 3086-3089) now renders signed-out
                only — a signed-in account with no real coach banners yet sees
                no notes at all, instead of fabricated samples. */}
            {(() => {
              const banners = coachFeed.banners || [];
              const dayOf = (b) => {
                if (!b || !b.sent_at) return 'Mon';
                const d = new Date(b.sent_at);
                return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] || 'Mon';
              };
              const trainerBanner = banners.find(b => b.provider_role !== 'nutritionist');
              const nutriBanner = banners.find(b => b.provider_role === 'nutritionist');
              const notes = [];
              if (trainerBanner) notes.push({ role: 'trainer', text: trainerBanner.text, who: trainerBanner.provider_name || 'Jordan Chen', when: dayOf(trainerBanner) });
              if (nutriBanner) notes.push({ role: 'nutritionist', text: nutriBanner.text, who: nutriBanner.provider_name || 'Dr. Maya Patel', when: dayOf(nutriBanner) });
              // No real notes yet: the sample-note fallback is signed-out preview
              // ONLY (the fix — was unconditional before this task).
              if (!notes.length && !bsHomeSignedIn) {
                notes.push({ role: 'trainer', text: "You're 3 weeks in. The tempo is the point — slow eccentric on every press. Log your sleep, it's the lever.", who: 'Jordan Chen', when: 'Mon' });
                notes.push({ role: 'nutritionist', text: "Three weeks of steady protein — it's working. Keep breakfast above 35g and we'll carry the momentum into the next block.", who: 'Dr. Maya Patel', when: 'Mon' });
              }
              if (!notes.length) return null;
              return (
                <div style={{ padding: `12px ${t.padX}px 4px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.map((n, i) => (
                    <div key={i} style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13, fontWeight: 500, color: t.INK70, lineHeight: 1.45, letterSpacing: '-0.01em' }}>
                      &ldquo;{n.text}&rdquo;
                      <span style={{ display: 'block', marginTop: 4, fontStyle: 'normal', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
                        — {n.who} · {n.role === 'nutritionist' ? 'Nutritionist' : 'Trainer'}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        );
      })()}

      {/* SHAPE STEPS — the daily steps instrument (moved off the profile; it
          belongs with the day's living metrics). Taps into the steps history. */}
      <BSStepsCard />
```

- [ ] **Step 5: Delete the old standalone "THIS WEEK'S NOTE" section (~3068-3120)**

Locate (verbatim — the whole block, including its leading comment):
```jsx
      {/* THIS WEEK'S NOTE — coach's weekly note (trainer or nutritionist),
          editable from their console and sent to specific clients
          (coach_focus_banners, RLS-scoped). Falls back to an editorial line. */}
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const banners = coachFeed.banners || [];
        const dayOf = (b) => {
          if (!b || !b.sent_at) return 'Mon';
          const d = new Date(b.sent_at);
          return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] || 'Mon';
        };
        // Most-recent note from each role (banners arrive newest-first).
        const trainerBanner = banners.find(b => b.provider_role !== 'nutritionist');
        const nutriBanner = banners.find(b => b.provider_role === 'nutritionist');
        const notes = [];
        if (trainerBanner) notes.push({ role: 'trainer', text: trainerBanner.text, who: trainerBanner.provider_name || 'Jordan Chen', when: dayOf(trainerBanner) });
        if (nutriBanner) notes.push({ role: 'nutritionist', text: nutriBanner.text, who: nutriBanner.provider_name || 'Dr. Maya Patel', when: dayOf(nutriBanner) });
        // No real notes yet → show a sample from each coach (the demo client has both).
        if (!notes.length) {
          notes.push({ role: 'trainer', text: "You're 3 weeks in. The tempo is the point — slow eccentric on every press. Log your sleep, it's the lever.", who: 'Jordan Chen', when: 'Mon' });
          notes.push({ role: 'nutritionist', text: "Three weeks of steady protein — it's working. Keep breakfast above 35g and we'll carry the momentum into the next block.", who: 'Dr. Maya Patel', when: 'Mon' });
        }
        return (
          <>
            <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px` }}>
              <BSEyebrow color={teal}>From your team</BSEyebrow>
              <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>{notes.length > 1 ? 'This week’s notes' : 'This week’s note'}</div>
            </div>
            <div style={{ padding: `12px ${t.padX}px 4px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {notes.map((n, i) => {
                const isNutri = n.role === 'nutritionist';
                return (
                  <div key={i} style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15, fontWeight: 500, color: t.INK70, lineHeight: 1.5, letterSpacing: '-0.01em' }}>
                      &ldquo;{n.text}&rdquo;
                    </div>
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <BSAvatar init={(n.who || 'C').charAt(0)} size={28} fill={isNutri ? t.AMBER : t.RUST} ink={t.PAPER} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{n.who}</div>
                          <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 1 }}>{isNutri ? 'Nutritionist' : 'Trainer'}</div>
                        </div>
                      </div>
                      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{n.when}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <BSFooter right="Pg 1 of 1" />
```

Replace with:
```jsx
      <BSFooter right="Pg 1 of 1" />
```

- [ ] **Step 6: Parse-check**

From `mobile-app/`:
```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Expected: no output (clean parse).

- [ ] **Step 7: PowerShell mobile build**

```powershell
cd C:\Users\cperr\shape-app\mobile-app; $env:VITE_BASE='/m/'; npm run build
```
Expected: exit 0. Never build this from Git Bash.

- [ ] **Step 8: Run the test suite**

From repo root:
```bash
npm test
```
Expected: all existing tests still pass (this task adds no new `.mjs` logic and no new test file — `homeSlate.mjs`'s own tests are Task 1's responsibility).

- [ ] **Step 9: LF-normalize touched files**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

- [ ] **Step 10: Commit**

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(home): collapse coach items, workout, meals, habits, and coach notes into one TODAY'S SLATE run-sheet

Replaces the coach-pushed-items block, the AgendaCard workout+meals plates,
and the standalone habits plate with one time-sorted BSSlateRow list
(bsHomeSlateSort); coach weekly op-ed notes render inside the slate with
bylines. Fixes the pre-existing demo-notes leak (Jordan Chen / Dr. Maya
Patel fallback is now signed-out only)."
```

### Task 5: INSIDE. index rows + door shelf + section deletions

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — replaces the block
  from the GOAL card slot (~2668-2672) and the WEEKLY CHECK-IN plate through the
  WEEKLY TOTALS section and PROGRESS door mount (~2933-2992); deletes the
  `BSStepsCard` mount (~2912) and the shop-list card (~2915-2931); adds `BSStepsHistory`
  as a sibling mount for the STEPS door's open state.

**Interfaces:**
- Consumes (Interface Registry, `BSIndexRow`/`BSShelfDoor`/`useBSStepsToday` from
  Tasks 2-3; `BSMeGoalCard{door}`/`BSProgressDoor{door}` from Task 2's modified-variant
  contract; `BSTodayNudge{variant}` from Task 2):
  - `function BSIndexRow({ label, figure, status, due, done, onOpen })` — 44px, grid
    `86px 1fr auto 18px`, dot leader, 5px status tick, no border/bg/radius.
  - `function BSShelfDoor({ c, eyebrow, figure, status, pct, onOpen })` — ~112w×64h
    native button; `figure` may be a ReactNode; `pct` → 2px bottom progress sliver.
  - `function useBSStepsToday()` → `{ hasData, todayKnown, val, goal, pct, hit, stepPts }`.
  - `function BSTodayNudge({ onOpen, variant })` — `variant="row"` → the CHECK-IN
    residue `BSIndexRow` once logged.
  - `function BSMeGoalCard({ c, onOpen, compact, door })` — `door` → `BSShelfDoor` GOAL
    variant, same loader + `bsGoalSignedIn && !g → null` gate.
  - `function BSProgressDoor({ onOpen, door })` — `door` → `BSShelfDoor` PROGRESS
    variant (4 section-tick figure).
  - Existing in scope (untouched): `bsHomeSignedIn` (2120), `setWeekStat`, `weekStat`
    portal sheet (2995-3038, STAYS), `setTodayPage`, `goEat`, `t = useBS()`, `bsTHexA`,
    `BSStepsHistory` (component, mounted today as a sibling inside `BSStepsCard` at
    16208 — Task 5 re-mounts it as a sibling of the door shelf instead).
- Produces: nothing new exported — this task is pure render-body surgery inside
  `BSClientHome`. Introduces one new local state pair, `stepsHistory` (bool), that
  Home now owns directly (previously owned inside `BSStepsCard`, which is deleted
  from Home's render — the open/close flag for `BSStepsHistory` must live in the
  caller from now on). Also introduces one new hoisted local, `const stepsToday =
  useBSStepsToday();` — called unconditionally in Home's top-level hooks block
  (Step 2, alongside `mealLogged` etc., well above the 8 early-return overlays),
  never inside the render body's door-shelf IIFE. This is a binding decision, not
  a style preference: `BSClientHome`'s main-return JSX must never call a hook
  directly, because the 8 early returns above it (previewMeal,
  showWorkoutPreview, showLogMeal, habitsPage, checkinPage, homeProgressPage,
  goalsPage, todayPage) would otherwise skip that hook call on every render
  where one of those overlays is open, changing the hook count between renders.

---

- [ ] **Step 1: Delete the GOAL card top slot (~2668-2672)**

Locate (unique — the comment + wrapping div is the old top-slot mount):

```jsx
      {/* YOUR GOAL — the featured goal card (moved off the profile; the profile
          is identity-only now). Taps into the full Goals page. */}
      <div style={{ margin: `3px ${t.padX}px 9px` }}>
        <BSMeGoalCard c={t.isLight ? '#0a8f87' : '#34d6c5'} onOpen={() => setGoalsPage(true)} compact />
      </div>
```

Delete it entirely (no replacement here — the GOAL door lives in the shelf, added in
Step 3 below). Leave the `{selIdx !== todayIdx && <BSSection title={upNextLabel} />}`
line immediately after it untouched — it now follows directly after the slate (Task 4
scope) with no goal card between.

- [ ] **Step 2: Add local `stepsHistory` state AND hoist `useBSStepsToday()` into Home's hooks block**

**No hook calls inside `BSClientHome`'s return JSX — ever.** `BSClientHome` has 8
early-return overlays (previewMeal, showWorkoutPreview, showLogMeal, habitsPage,
checkinPage, homeProgressPage, goalsPage, todayPage — verified at lines
2437–2460 of the current source) BEFORE its main `return (`. Any hook called
inside the main-return JSX (e.g. inside a `{(() => { const x =
useBSStepsToday(); ... })()}` IIFE in the door-shelf section) is SKIPPED
whenever any of those 8 overlays is open, changing the hook count between
renders — a Rules-of-Hooks violation that WILL throw or corrupt state the
moment a user opens any overlay from Home and returns. So `useBSStepsToday()`
must be called unconditionally, in Home's top-level hooks block, alongside
`mealLogged` and friends — well above (line ~2135) the early returns
(~2437–2460) — never inside the render's door-shelf IIFE.

Locate (unique — the meal-logging state block, per the structure map ~2135-2141):

```jsx
      const [mealLogged, setMealLogged] = useStateBSC({});      // meal id → logged this session
      const [loggingMealId, setLoggingMealId] = useStateBSC(null); // meal that opened the logger
      const [mealToLog, setMealToLog] = useStateBSC(null); // the meal object being logged → real title/macros/time into the logger
```

Replace with (adds `stepsHistory` state AND hoists the `useBSStepsToday()` call
itself — Task 2 defined the hook, but calling it lives here, not in the render
body Step 3 touches below):

```jsx
      const [mealLogged, setMealLogged] = useStateBSC({});      // meal id → logged this session
      const [loggingMealId, setLoggingMealId] = useStateBSC(null); // meal that opened the logger
      const [mealToLog, setMealToLog] = useStateBSC(null); // the meal object being logged → real title/macros/time into the logger
      const [stepsHistory, setStepsHistory] = useStateBSC(false); // STEPS door → BSStepsHistory overlay (Home now owns this; BSStepsCard's own copy was deleted with its mount)
      // Hoisted OUT of the render body's door-shelf IIFE — useBSStepsToday() is a
      // React hook (uses useStateBSC/useBSStepGoal internally) and must be called
      // unconditionally at the top level, never inside JSX below the early-return
      // overlays. Step 3's shelf JSX reads this const directly.
      const stepsToday = useBSStepsToday();
```

- [ ] **Step 3: Replace the shop-list plate through the PROGRESS door mount with the INSIDE. section**

Stale-anchor note: by this point Task 3 (Step 4) has already deleted the standalone
WEEKLY CHECK-IN `checkinDue` plate and replaced it with a `{/* Weekly check-in due
plate DELETED …` comment — quoted below character-for-character from Task 3's actual
replacement text. This step's locate block must match that POST-Task-3 state, not
the original pre-Task-3 file.

Locate the full block (verbatim, unique — spans the `BSStepsCard` mount, the SHOP
LIST plate, Task 3's "plate DELETED" comment, the WEEKLY TOTALS section, and the
PROGRESS door call; this is everything between the `weekStat` portal sheet's opening
comment boundary and the sheet itself, which STAYS untouched immediately after):

```jsx
      {/* SHAPE STEPS — the daily steps instrument (moved off the profile; it
          belongs with the day's living metrics). Taps into the steps history. */}
      <BSStepsCard />

      {/* SHOP LIST — a quick door to this week's grocery list (built from the meals) */}
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        return (
          <BSPlate c={teal} notch={9} spine={2.5} pad="13px 16px 13px 22px" role="button" ariaLabel="Open your shopping list" onClick={() => { try { window.__bsPendingGrocery = true; } catch (e) {} goEat(); }} style={{ margin: `0 ${t.padX}px 12px`, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Shop list · this week</div>
                <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 21, lineHeight: 1.04, letterSpacing: '-0.03em', color: t.INK }}>
                  Your <span style={{ fontStyle: 'italic', color: teal }}>shopping list.</span>
                </div>
                <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>Auto-built from your meals · sorted by aisle</div>
              </div>
              <span style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 9, border: `1px solid ${teal}`, background: 'transparent', color: teal, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Open →</span>
            </div>
          </BSPlate>
        );
      })()}

      {/* Weekly check-in due plate DELETED (Front-Page restructure) — its due
          state now lives in the BULLETINS block above the lead (BSHomeBulletin,
          suppressed only when the engine's checkin lever is the lead — not
          whenever any lead exists); its logged residue becomes an INSIDE.
          index row (Task 5). */}

      {/* WEEK TOTALS — running tally; tap a card for history / a chart */}
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        // Two high-signal totals (density pass) — training + nutrition; the full
        // weekly breakdown (check-ins, consults, …) lives on the Progress page.
        const weekTotals = [
          { l: 'Sessions', v: 4, max: 5, c: t.RUST, unit: 'sessions',
            history: [['Mon', 'Upper Push — Peak', 'Done'], ['Tue', 'Lower Pull — Vol.', 'Done'], ['Thu', 'Upper Pull — Peak', 'Done'], ['Sat', 'Z2 run · 45m', 'Done'], ['Sun', 'Lower Push — Peak', 'Scheduled']] },
          { l: 'Avg kcal', v: 1890, max: 2100, c: t.BLUE, unit: 'avg kcal', chart: true, goalFrame: 'In your deficit · on track',
            series: [['M', 1820], ['T', 2010], ['W', 1760], ['T', 1980], ['F', 1890], ['S', 2140], ['S', 1830]] },
        ];
        // These are hardcoded demo figures (not wired to real rollups yet) — show
        // them only in the signed-out preview, never as fake stats to a real user.
        if (bsHomeSignedIn) return null;
        return (
          <>
            <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px` }}>
              <BSEyebrow color={teal}>Weekly totals</BSEyebrow>
              <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>So far</div>
            </div>
            <div style={{ padding: `10px ${t.padX}px 4px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              {weekTotals.map(s => {
                const pct = Math.max(0, Math.min(1, s.v / s.max));
                return (
                  <BSPlate key={s.l} c={s.c} notch={9} spine={2.5} pad="11px 11px 9px 13px" role="button" ariaLabel={`${s.l} — view detail`} onClick={() => setWeekStat(s)} style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: s.c, fontWeight: 700 }}>{s.l}</span>
                      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', color: t.INK50, fontWeight: 600 }}>/ {s.max.toLocaleString()}</span>
                    </div>
                    <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1 }}>{s.v.toLocaleString()}</div>
                    <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: t.HAIR, overflow: 'hidden' }}>
                      <div style={{ width: `${pct * 100}%`, height: '100%', background: s.c, borderRadius: 2 }} />
                    </div>
                    {s.goalFrame
                      ? <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.c, fontWeight: 700 }}>{s.goalFrame}</div>
                      : <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>View {s.chart ? 'chart' : 'history'} →</div>}
                  </BSPlate>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* PROGRESS — a slim door to the full progress hub (moved off the profile) */}
      <BSProgressDoor onOpen={() => setHomeProgressPage(true)} />
```

Replace it with (the INSIDE. head + ledger, the two weekly-totals index rows [signed-out
gate carried verbatim], the CHECK-IN residue row, and the door shelf — the `weekStat`
portal sheet that follows immediately after in the file is left untouched):

```jsx
      {/* § INSIDE. — everything else lives here: index rows (live figure + door)
          and the shelf doors. Per the Front-Page Rule: do not add a plate here. If
          it can't be a row, it lives on a tab and gets at most a row-door. */}
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        return (
          <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px` }}>
            <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em', color: t.INK }}>
              Inside<span style={{ color: teal, fontStyle: 'italic' }}>.</span>
            </span>
            <div aria-hidden style={{ height: 2, marginTop: 8, background: `linear-gradient(90deg, ${t.INK}, ${teal} 58%, transparent)` }} />
          </div>
        );
      })()}

      {/* WEEKLY TOTALS → two index rows. Same payloads as the old tile grid — the
          weekStat portal sheet below is unchanged and reads these objects as-is.
          Signed-out-only gate carried verbatim from the deleted tile grid. */}
      {(() => {
        // These are hardcoded demo figures (not wired to real rollups yet) — show
        // them only in the signed-out preview, never as fake stats to a real user.
        if (bsHomeSignedIn) return null;
        const weekTotals = [
          { l: 'Sessions', v: 4, max: 5, c: t.RUST, unit: 'sessions',
            history: [['Mon', 'Upper Push — Peak', 'Done'], ['Tue', 'Lower Pull — Vol.', 'Done'], ['Thu', 'Upper Pull — Peak', 'Done'], ['Sat', 'Z2 run · 45m', 'Done'], ['Sun', 'Lower Push — Peak', 'Scheduled']] },
          { l: 'Avg kcal', v: 1890, max: 2100, c: t.BLUE, unit: 'avg kcal', chart: true, goalFrame: 'In your deficit · on track',
            series: [['M', 1820], ['T', 2010], ['W', 1760], ['T', 1980], ['F', 1890], ['S', 2140], ['S', 1830]] },
        ];
        return (
          <>
            {/* weekTotals[0] (Sessions) carries no goalFrame field (only Avg kcal
                does) — give it a real status string matching the old tile's own
                affordance copy ("View history →" in its footer) rather than
                leaving status undefined (a blank status reads as a rendering
                bug, not a deliberate omission). */}
            <BSIndexRow label="Sessions" figure={`${weekTotals[0].v}/${weekTotals[0].max}`} status="View history ›" onOpen={() => setWeekStat(weekTotals[0])} />
            <BSIndexRow label="Avg kcal" figure={`${weekTotals[1].v.toLocaleString()}/${weekTotals[1].max.toLocaleString()}`} status={weekTotals[1].goalFrame} onOpen={() => setWeekStat(weekTotals[1])} />
          </>
        );
      })()}

      {/* CHECK-IN residue — BSTodayNudge's row variant; only renders once today's
          check-in is logged (the bulletin owns the due state, above the lead). */}
      <BSTodayNudge variant="row" onOpen={() => setTodayPage(true)} />

      {/* THE DOOR SHELF — STEPS · GOAL · PROGRESS · SHOP, horizontal snap-scroll,
          3 visible + a 12px end-peek so the 4th door shows a sliver. Native buttons
          in DOM order (VoiceOver traversal order == visual order).
          `stepsToday` is read from the HOISTED const (Step 2, top of BSClientHome's
          hooks block) — NOT called here. No hook may be called inside this render
          IIFE (or anywhere in the main-return JSX): BSClientHome has 8 early-return
          overlays above this point, so a hook called here would be skipped on those
          renders and violate the Rules of Hooks. */}
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const openStepsDoor = () => {
          if (stepsToday.hasData) { setStepsHistory(true); return; }
          try { window.dispatchEvent(new CustomEvent('shape:openIntegrations')); } catch (e) {}
        };
        const stepsFigure = stepsToday.todayKnown ? stepsToday.val.toLocaleString() : '—';
        const stepsStatus = !stepsToday.hasData
          ? 'Connect a watch'
          : !stepsToday.todayKnown
            ? 'No steps yet today'
            : stepsToday.hit
              ? 'Goal hit ✓'
              : `${Math.max(0, stepsToday.goal - stepsToday.val).toLocaleString()} to go`;
        return (
          <>
            <div className="bs-hide-scroll" style={{ display: 'flex', gap: 8, padding: `4px ${t.padX}px 12px ${t.padX}px`, paddingRight: `calc(${t.padX}px + 12px)`, overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
              <BSShelfDoor c={teal} eyebrow="Steps" figure={stepsFigure} status={stepsStatus} pct={stepsToday.hasData && stepsToday.todayKnown ? stepsToday.pct : undefined} onOpen={openStepsDoor} />
              <BSMeGoalCard c={teal} onOpen={() => setGoalsPage(true)} door />
              <BSProgressDoor onOpen={() => setHomeProgressPage(true)} door />
              <BSShelfDoor c={teal} eyebrow="Shop list" figure="→" status="By aisle" onOpen={() => { try { window.__bsPendingGrocery = true; } catch (e) {} goEat(); }} />
            </div>
            {stepsHistory && <BSStepsHistory onClose={() => setStepsHistory(false)} />}
          </>
        );
      })()}
```

The `teal` binding is re-declared inline at the top of this IIFE (matching the
same `t.isLight ? '#0a8f87' : '#34d6c5'` literal used in the preceding INSIDE.-head
IIFE) since these are two separate IIFEs and neither shares scope with the other.

- [ ] **Step 4: Delete the old `BSStepsCard` mount and the shop-list card (already folded into Step 3's replacement — verify no residue)**

Grep the file after Step 3 to confirm both are gone from `BSClientHome`'s render body:

```bash
grep -n "<BSStepsCard" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

Expected: no output inside `BSClientHome`'s return (the `function BSStepsCard()`
*definition* at line ~16141 stays — only its call site inside Home is removed; it may
still be referenced by other screens, but per the structure map it is not — leave the
function itself defined and unused-but-present, since deleting a defined component the
plan didn't ask you to delete is out of scope for this task).

- [ ] **Step 5: Parse-check**

From the repo root:

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```

Expected: no output (clean parse).

- [ ] **Step 6: PowerShell mobile build**

```powershell
cd C:\Users\cperr\shape-app\mobile-app
$env:VITE_BASE='/m/'
npm run build
```

Expected: build succeeds, exit 0. Never use Git Bash for this build (path-mangles
`VITE_BASE`).

- [ ] **Step 7: Run tests**

From the repo root:

```bash
npm test
```

Expected: all existing tests still pass (this task adds no new pure-module tests).

- [ ] **Step 8: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat: home INSIDE. index rows + door shelf; delete steps/shop cards + weekly-totals tile grid"
```

### Task 6: Motion, anti-accretion contract, dead-code deletion, WORKLOG

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — add
  `bsInjectBsHomeCss()` (near the other `bsInject*Css` helpers, e.g. after
  `bsInjectSessionDetailCss` ~line 10506); wire it + the reduced-motion spreads into
  `BSSlateRow`/`BSIndexRow`/`BSHomeBulletin`/`BSShelfDoor` (Tasks 2–5); add the
  anti-accretion comment block to `BSClientHome`'s returned JSX (~line 2502); delete
  the dead `homeCardsCtx`/`homeCardOpeners` block (~2427–2435); conditionally delete
  the legacy no-`variant` render branch in `BSTodayNudge` (~15831–15863).
- Modify: `docs/WORKLOG.md` — insert a new dated entry above the latest.

**Interfaces:**
- Consumes: `BSSlateRow`, `BSIndexRow`, `BSHomeBulletin`, `BSShelfDoor` (Task 2);
  their call sites in `BSClientHome`'s slate/index/bulletin/shelf sections (Tasks
  3–5); `BSTodayNudge({ onOpen, variant })` (Task 3's signature, per the plan header's
  Interface Registry); `bsSdReduced()` (existing, module-scope, reused verbatim — no
  new reduced-motion helper).
- Produces: `function bsInjectBsHomeCss()` — a one-shot `<style>` injector following
  the exact `bsInjectSessionDetailCss` shape (`_bsHomeCssInjected` guard, keyframes
  inside `@media (prefers-reduced-motion: no-preference)`). No other task consumes
  this by name (Tasks 2–5 call it directly), so this is the last task that touches it.

- [ ] **Step 1: Confirm the existing injected-keyframes pattern (read-only)**

Locate `bsInjectSessionDetailCss` (the pattern this task's injector must match
exactly — guard flag, `document.createElement('style')`, keyframes wrapped in the
reduced-motion media query):

```js
let _bsSdCssInjected = false;
function bsInjectSessionDetailCss() {
  if (_bsSdCssInjected || typeof document === 'undefined') return;
  _bsSdCssInjected = true;
  const el = document.createElement('style');
  el.textContent = `
    @media (prefers-reduced-motion: no-preference) {
      @keyframes bsSdRise { 0% { transform: scaleY(0); } 72% { transform: scaleY(1.07); } 100% { transform: scaleY(1); } }
      @keyframes bsSdFadeUp { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: none; } }
      ...
    }
  `;
  document.head.appendChild(el);
}
```

And the consumer wiring pattern (`BSLiveBoostSheet`, ~line 6621-6622):

```js
  const reduced = bsSdReduced();
  React.useInsertionEffect(() => { bsInjectSessionDetailCss(); bsInjectFollowChipCss(); }, []);
```

Task 6's `bsInjectBsHomeCss()` + the Home primitives' `React.useInsertionEffect`
calls must follow this shape exactly. `bsSdReduced()` (module-scope, already
defined ~line 10486) is the single reduced-motion predicate app-wide — reuse it
verbatim, do not define a second one.

- [ ] **Step 2: Add `bsInjectBsHomeCss()`**

Find the anchor (end of `bsInjectSessionDetailCss`, verbatim from Step 1):

```js
      @keyframes bsSdGrowY { 0% { transform: scaleY(0); } 100% { transform: scaleY(1); } }
    }
  `;
  document.head.appendChild(el);
}
```

Insert immediately after it (before the `// Count-up number:` comment that follows):

```js
// ── Home "Front Page" — injected keyframes ────────────────────────────────
// Slate rows stagger in (opacity + 4px rise); the INSIDE. index block fades as
// one quiet unit; door slivers draw 0→pct via a plain CSS `width` transition
// on BSShelfDoor's own sliver span (Task 2's shipped body — no keyframe needed
// for that, so none is defined here — see Step 4); only due-ticks pulse
// (reuses the shared BSPlate tick keyframe — no new pulse here). All wrapped
// in the reduced-motion media query per the #1518 pattern; every consumer
// additionally gates its own inline `animation` with
// `...(bsSdReduced() ? null : {...})`.
let _bsHomeCssInjected = false;
function bsInjectBsHomeCss() {
  if (_bsHomeCssInjected || typeof document === 'undefined') return;
  _bsHomeCssInjected = true;
  const el = document.createElement('style');
  el.textContent = `
    @media (prefers-reduced-motion: no-preference) {
      @keyframes bsHomeRowIn { 0% { opacity: 0; transform: translateY(4px); } 100% { opacity: 1; transform: none; } }
      @keyframes bsHomeIndexIn { 0% { opacity: 0; } 100% { opacity: 1; } }
    }
  `;
  document.head.appendChild(el);
}
```

- [ ] **Step 3: Wire the stagger into `BSSlateRow` (Task 2's component)**

`BSSlateRow` is a **plain function component** (per the Interface Registry:
`function BSSlateRow({ time, tag, tagColor, title, status, right, onOpen,
ariaLabel })`) rendered in a `.map()` inside THE SLATE section (Task 4). Plain
functions with **stable keys** mean React never unmounts/remounts a row on
check-off — a habit toggle or a meal log-tick only changes that row's props, so
the entrance animation (which runs once via CSS on mount, not on every render)
never replays.

**Stable keys are AUTHORITATIVE from Task 4** — Task 4's `rows.push({...})`
calls each carry a `key` field (`meal-${m.id}` / `slate-training` /
`habit-${h.id || h.name}` / `coach-${it.id}`), and Task 4's final `.map()`
already reads `key={r.key}` and passes `index={i}`. This step does **not**
adapt or "correct" those key strings — they are the source of truth. This
step's only job is widening `BSSlateRow`'s signature to accept the `index`
prop the map already passes, and using it for the stagger:
- Meal rows: `meal-${m.id}` (per-meal `selMeals[i].id`, never the array
  index — a log-tick or the `↑ LEAD` swap must not shift keys).
- Training row: `slate-training` (exactly one per render, day-scoped, no
  index needed).
- Habit rows: `habit-${h.id || h.name}` (per-habit id, so a checked-off
  habit that stays in the "open habits" list — or the demo `!h.live` rows keyed
  by name — keeps its DOM node across the `toggleHomeHabit` re-render).
- Coach-pushed rows: `coach-${it.id}` (per-item id from `coachFeed.items`).

This is a **minimal diff against Task 2's actual shipped `BSSlateRow` body** —
add the `index` prop to the destructure, call `bsInjectBsHomeCss()` alongside
the existing `bsInjectFollowChipCss`-style insertion effect (there is none in
Task 2's body — add a fresh `React.useInsertionEffect` here), and spread the
stagger animation into the EXISTING style object. Do **not** replace the
component with a bare skeleton — Task 2's div/role/tabIndex wrapper, the
`isLead`/`isNode`/`interactive` branching, the press-flash (`pressed` state +
pointer handlers), the keyboard guard's `if (e.target !== e.currentTarget)
return;` first line, and every cell's content all carry over unchanged. Only
the additions below are new:

```js
function BSSlateRow({ time, tag, tagColor, title, status, right, onOpen, ariaLabel, index = 0 }) {
  const t = useBS();
  const isLead = right === 'lead';
  const isNode = right && typeof right === 'object';
  const interactive = !isLead && typeof onOpen === 'function';
  const [pressed, setPressed] = useStateBSC(false);
  const reduced = bsSdReduced();
  React.useInsertionEffect(() => { bsInjectBsHomeCss(); }, []);
  return (
    <div
      onClick={interactive ? onOpen : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      } : undefined}
      onPointerDown={interactive ? () => setPressed(true) : undefined}
      onPointerUp={interactive ? () => setPressed(false) : undefined}
      onPointerLeave={interactive ? () => setPressed(false) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      style={{
        display: 'grid', gridTemplateColumns: '50px 58px 1fr auto 20px', alignItems: 'center', gap: 8,
        width: '100%', minHeight: 48, boxSizing: 'border-box', padding: '6px 0',
        border: 0, borderBottom: `1px solid ${t.HAIR}`, background: pressed ? t.PAPER2 : 'transparent',
        transition: 'background 120ms ease', textAlign: 'left', cursor: interactive ? 'pointer' : 'default',
        font: 'inherit', color: 'inherit',
        // NEW this task — the only behavioral addition to Task 2's body:
        ...(reduced ? null : { animation: `bsHomeRowIn 180ms ease-out ${index * 30}ms both` }),
      }}
    >
      {/* ...every cell from Task 2 (time / tag / title / status / right —
          including the isLead ↑ LEAD span, the isNode custom-control render,
          and the default › chevron), unchanged... */}
    </div>
  );
}
```

The `30ms * index` stagger + `180ms` duration is per the spec's exact motion
figures. `reduced` gates the whole `animation` key out (no `opacity:0` starting
state left behind — `both` fill-mode is only applied when the animation itself
is present, so omitting the `animation` key entirely under reduced-motion also
skips any transform/opacity side-effect).

- [ ] **Step 4: Wire the INSIDE. block fade + door-sliver draw**

In the INSIDE. section (Task 5), the index-rows block (containing all
`BSIndexRow`s) fades in **as one unit**, not per-row — wrap the block (not each
row) with the fade:

```jsx
<div style={{ ...(reduced ? null : { animation: 'bsHomeIndexIn 220ms ease-out both' }) }}>
  {/* ...BSIndexRow list from Task 5, unchanged... */}
</div>
```

(`reduced` here is `bsSdReduced()` called once in `BSClientHome`'s render body,
or locally inside whatever wrapping component Task 5 introduces for the INSIDE.
block — match whichever scope Task 5 actually used.)

In `BSShelfDoor` (Task 2), the optional bottom progress sliver (STEPS/GOAL,
`pct` prop) already draws 0→pct over 400ms as shipped by Task 2 — its inner
sliver span animates `width` via a plain CSS `transition: width 400ms
cubic-bezier(.4,0,.2,1)`, gated by the SAME `reduced` this task uses elsewhere
(Task 2's body, verbatim):

```js
{hasPct && (
  <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: bsTHexA(t.INK, 0.08) }}>
    <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: accent, ...(reduced ? null : { transition: 'width 400ms cubic-bezier(.4,0,.2,1)' }) }} />
  </span>
)}
```

This is ALREADY the correct 0→pct draw — a `transition` on `width` animates
from whatever the previous width was (0 on first mount, since the element
wasn't there before) to the new `pct`% over 400ms, which satisfies the spec's
"slivers draw 0→pct 400ms" figure exactly. **Do not** replace this with a
`transform: scaleX` + `bsHomeSliverDraw` keyframe rewrite — that would be a
different (and duplicate) animation mechanism for the same effect, and would
require reworking Task 2's shipped structure for no behavioral gain. The
`bsHomeSliverDraw` keyframe defined in Step 2 above is therefore UNUSED by
`BSShelfDoor` — it exists for a future consumer if one needs a hard 0→1 draw
rather than a width transition; do not force it in here.

This step's only actual change to `BSShelfDoor` is adding the
`bsInjectBsHomeCss()` call (Task 2's body has no `React.useInsertionEffect` —
add one, matching the `BSSlateRow` pattern above):

```js
function BSShelfDoor({ c, eyebrow, figure, status, pct, onOpen }) {
  const t = useBS();
  const accent = c || (t.ACCENT || (t.isLight ? '#0a8f87' : '#34d6c5'));
  const [pressed, setPressed] = useStateBSC(false);
  const reduced = bsSdReduced();
  const hasPct = typeof pct === 'number' && isFinite(pct);
  React.useInsertionEffect(() => { bsInjectBsHomeCss(); }, []);
  return (
    // ...everything else from Task 2's body, unchanged...
  );
}
```

**Due-ticks only pulse.** `BSHomeBulletin`'s pulsing 6px tick (Task 2's spec:
"pulsing 6px tick") and any `BSIndexRow` `due` tick reuse `BSPlate`'s existing
`bsPlatePulse` keyframe (defined in `iosAppBroadsheet.jsx`, injected per-`BSPlate`-
instance — already how `BSTodayNudge`'s `tick={!logged}` pulses). Do **not**
invent a second pulse keyframe in `bsInjectBsHomeCss()` — grep
`bsPlatePulse` to confirm it's still the live pulse source before wiring
`BSHomeBulletin`'s tick to it; if Task 2 built `BSHomeBulletin`'s tick as a bare
`<span>` (not a `BSPlate`), inline the same pulse via a `boxShadow` `animation`
gated by `reduced`, but only when due (`!done` / `due` prop true) — a completed
bulletin residue (the INSIDE. check-in row) never pulses.

- [ ] **Step 5: Add the anti-accretion contract comment**

Find `BSClientHome`'s return statement opening (verbatim anchor — locate via
grep for `return (` immediately preceded by the render-order comment block at
the top of the function's JSX, currently ~line 2502 pre-Task-1-5 shift):

```js
  return (
    <BSPage ...>
```

Insert the contract comment immediately before the `return (`:

```js
  // ── ANTI-ACCRETION CONTRACT ────────────────────────────────────────────
  // Do not add a plate. If it can't be a row, it lives on a tab and gets at
  // most a row-door.
  // ────────────────────────────────────────────────────────────────────────
  return (
    <BSPage ...>
```

The comment text is copied **verbatim** from the plan header's Global
Constraints ("Anti-accretion contract" line) — do not paraphrase.

- [ ] **Step 6: Delete the dead `homeCardsCtx`/`homeCardOpeners` block**

First verify with a repo-wide grep (must return **zero** hits outside this
block's own definition):

```bash
grep -n "homeCardsCtx\|homeCardOpeners" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

Expected: only the two definition lines themselves (no `<BSHomeCards
ctx={homeCardsCtx}` or similar call site — `BSHomeCards` at line 854 is a
separate, also-unreferenced component, out of this task's scope; confirm via
`grep -n "<BSHomeCards" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`
returns nothing). If either grep returns an unexpected consumer, STOP and do
not delete — flag it instead of removing live code.

Locate the exact block (verbatim, ~2425–2435):

```js
  // Context handed to the customizable card stack so each card builds from live
  // signals. `energy` here is the goal-aware model computed above.
  const homeCardsCtx = { t, ticker, analytics, energy, energyAccent, energyCaption, noLiveToday };
  const homeCardOpeners = {
    training: goTrain,
    consistency: goScore,
    energy: undefined,
    recovery: goIntegrations,
    protein: undefined,
    mood: () => setShowMood(true),
  };
```

Delete it entirely (all 11 lines, including both comment lines). Do **not**
touch the `energy`/`energyAccent`/`energyCaption`/`noLiveToday` computations
immediately above it — those remain in scope (verify whether Tasks 2–5 already
consume `energy`/`energyAccent`/`energyCaption` inside THE LEAD or elsewhere;
if by Task 6 nothing in the shipped render tree reads them either, that is a
separate dead-code question out of this task's explicit scope — leave them,
since the brief names only `homeCardsCtx`/`homeCardOpeners` for deletion).

- [ ] **Step 7: Conditionally delete the legacy `BSTodayNudge` plate branch**

Grep for every JSX call site of `BSTodayNudge`:

```bash
grep -n "<BSTodayNudge" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx
```

- **If every call site now passes an explicit `variant` prop** (i.e. Task 3
  added `variant` to `BSTodayNudge`'s signature and Task 5 flipped Home's call
  site to `<BSTodayNudge variant="bulletin" onOpen={...} />`, with no other
  file calling it undecorated): the plain `<BSPlate ...>` render currently at
  ~15849-15862 (the body that runs when `variant` is `undefined`) is dead.
  Delete that branch from `BSTodayNudge`'s render — keep only the
  `variant==='bulletin'` and `variant==='row'` branches Task 3 built, and make
  `variant` a required/documented prop (no silent fallback to the old look).
  Verbatim anchor for the branch being removed (confirm this is still the
  exact body before deleting — Task 3 may have already restructured it, in
  which case adapt the anchor to match the actual pre-Task-6 source):

  ```js
  return (
    <BSPlate c={teal} tick={!logged} bracket pad="12px 16px 12px 22px" role="button" tabIndex={0} ariaLabel="Open today's check-in" onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }}
      style={{ margin: `0 ${t.padX}px 12px`, textAlign: 'left' }}>
      ...
    </BSPlate>
  );
  ```

- **If any call site still invokes `BSTodayNudge` with no `variant` (or an
  unrecognized `variant`)** — e.g. a pros-app shell or another surface reuses
  the plain plate look — **leave the legacy branch in place** as the
  `variant==null` fallback. State explicitly in the commit message and in your
  final summary which case applied and why (quote the surviving call site).

This step is a genuine fork: do the deletion ONLY when the grep confirms zero
undecorated callers remain. Do not delete speculatively.

- [ ] **Step 8: WORKLOG entry**

Read the top of `docs/WORKLOG.md` (already done for this plan — the changelog's
newest entry starts at line 154, directly under the `## Changelog` intro
paragraph and its `> **Latest session handoff...` blockquote). New entries are
inserted **above** the current top-most `### <date> — <headline>` entry, in the
same tight heading-then-bullets style (no blank-line-separated prose
paragraphs — a `###` date/headline line, then `-` bullets, sub-bulleted with
2-space indents where needed, bold lead phrases).

The PR number is **unknown at plan time** — the implementer receives it from
the controller (the orchestrating process) once the PR is actually opened,
which happens AFTER this task's own commit (Step 10 below commits
`docs/WORKLOG.md` as part of Task 6, sequenced before the plan's later
integration/PR-opening step). So the Task 6 commit MAY legitimately carry the
literal `#PR` placeholder unresolved — that is expected, not an error. Use the
literal `#PR` placeholder in the heading now; the controller resolves it to the
real number at PR-open time via an amend or a small follow-up commit/edit once
the PR exists. Do not attempt to invent or look up a PR number here.

Insert this entry immediately above the current top entry (`### 2026-07-03 —
Quick security pass (clean) · Score "Start" label takes tier color · calendar
avatar shows the real self avatar`):

```markdown
### 2026-07-03 — Client Home "Front Page" hybrid restructure (#PR)
- **`BSClientHome` restructured from ~11 uniform bordered plates into the
  Front-Page hierarchy** (spec `docs/superpowers/specs/2026-07-03-home-front-page-hybrid-design.md`,
  structure map `.superpowers/sdd/home-structure-map.md`): 0–2 slim **BULLETINS**
  above the lead (daily check-in due · weekly check-in due, each suppressed
  once the lead already targets that lever) → exactly **ONE** engine-owned
  **LEAD** `BSPlate` (`todayDirective`'s #1 action — the page's only CTA
  button) → **THE SLATE**, a time-ordered run-sheet of 48px rows (one per meal
  · the day's training row · up to 3 open habit checkboxes · coach-pushed
  items · bylined coach notes) → **INSIDE.**, a serif-headed index of 44px
  rows (SESSIONS/AVG KCAL, signed-out-only · CHECK-IN residue once logged) plus
  a compact horizontal door shelf (STEPS · GOAL · PROGRESS · SHOP LIST,
  ~112×64). All 11 pre-existing pieces stay reachable — nothing deleted, only
  demoted to a row or a door.
- **Workout/meal double-feature fixed**: the lead's subject never gets a
  second interactive surface — lead=workout shows `↑ LEAD` on the TRAINING
  slate row (no second action); lead=meal (`heroMealId`) shows `↑ LEAD` on
  that MEAL row instead of its log tick.
- **Demo-notes leak fixed**: the "This week's notes" Jordan/Maya fallback
  (previously shown to any account with zero coach banners, live or not) is
  now signed-out-preview only — a real signed-in client with no coach notes
  yet sees nothing fabricated.
- **One-plate rule enforced by a code comment** at the top of `BSClientHome`'s
  return: *"Do not add a plate. If it can't be a row, it lives on a tab and
  gets at most a row-door."*
- **Motion**: slate rows stagger 30ms apart (opacity + 4px rise, 180ms,
  `bsInjectBsHomeCss` following the #1518 injected-keyframes pattern); the
  INSIDE. index block fades in as one quiet unit (220ms); door slivers draw
  0→pct (400ms); only due-ticks pulse (reuses `BSPlate`'s existing pulse).
  Rows are plain functions with stable per-item keys, so entrances never
  replay on check-off. Every animated style is reduced-motion-gated via
  `bsSdReduced()`.
- **Dead code removed**: the unreferenced `homeCardsCtx`/`homeCardOpeners`
  block (fed a card-stack component, `BSHomeCards`, that was never mounted
  from Home's render path).
- New primitives `BSSlateRow` · `BSIndexRow` · `BSHomeBulletin` · `BSShelfDoor`;
  extracted hooks `useBSCheckinLogged` (from `BSTodayNudge`'s manual-signal
  predicate, carried verbatim) · `useBSStepsToday` (from `BSStepsCard`); pure
  sorted-slate module `mobile-app/src/services/homeSlate.mjs` (+ tests).
  Verified: JSX parse · PowerShell mobile build · full `npm test` · LF
  normalized.
```

- [ ] **Step 9: Final verification gates**

Parse-check (from `mobile-app/`):

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Expected: no output.

PowerShell mobile build (never Git Bash — MSYS mangles `VITE_BASE`):

```powershell
cd C:\Users\cperr\shape-app\mobile-app
$env:VITE_BASE='/m/'
npm run build
```
Expected: exit 0.

Full test suite, from the repo root:

```bash
npm test
```
Expected: 100% pass (no new test files in this task, but the full suite must
stay green after the deletions).

- [ ] **Step 10: LF-normalize + commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx docs/WORKLOG.md
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx docs/WORKLOG.md
git commit -m "feat: home front-page motion + anti-accretion contract + dead-code sweep"
```

(Do not run `git push` / open the PR here — that is the plan's final
integration step, outside Task 6's scope; the PR-number placeholder in the
WORKLOG entry gets resolved there.)
