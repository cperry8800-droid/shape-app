# Coach Ledger (Assignment Rail Today · Client Index roster · Case File) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serialize the app's last pre-redesign surfaces — trainer/nutritionist Today, the Clients roster, and the per-client Case File — into the shipped Open Ledger language, engine-led, per `docs/superpowers/specs/2026-07-04-coach-ledger-redesign-design.md` (READ THE SPEC FIRST — it is the contract; this plan is the route).

**Architecture:** One new pure module (`proLedger.mjs`, TDD) implements the three owner-ratified rules (loop · anchor · attention budget) + day-shape math. The two Today pages consolidate into one `BSProToday({ role })`; the roster and Case File are re-rendered in ledger grammar with every data source, RPC, and action page carried verbatim. The pros bundle consumes the client module's ledger kit off `window` (established load-order pattern).

**Tech Stack:** React (no JSX build-time types — plain .jsx, babel-parsed), Vite mobile bundle, `node --test` for pure modules. No new dependencies, no API/migration changes.

## Global Constraints

- **Spec is law:** `docs/superpowers/specs/2026-07-04-coach-ledger-redesign-design.md` — heat tables, closed placement lists, the three rules, honesty rules, kills lists. On any conflict between this plan and the spec, the spec wins; flag the conflict in the task report.
- **Heat:** trainer rust `'#c0533b'` (one literal, both papers) · nutritionist gold `t.isLight ? '#a07a2e' : '#d8b25a'` · Case File heat = client tier (`window.bsTierForPoints(points)` → `window.bsTierColor(tier)`), role-heat fallback. New helper (Task 2): `bsProHeat(t, role)`.
- **Semantic colors** (state, never identity, always NAMED in mono text): severity rust `'#c0533b'` FLAG · amber `'#d8a23a'` WATCH · green `'#5fa96e'` NEW. Teal = live/action + page chrome only.
- **Loops:** Today = exactly one breathing tick (LIVE bulletin dot, else NOW tick). Roster + Case File = zero infinite animations.
- **Motion:** one-shot entrances only, via `window.useBSSdInView` + per-station seen state; every animated style spreads `...(reduced ? null : seen ? { animation } : { hiddenInitial })` off `window.bsSdReduced()`; keyframes come from `window.bsInjectSessionDetailCss` (call in `React.useInsertionEffect`) — **no new keyframes**.
- **Hit targets:** every interactive element ≥44px (min-height or padding).
- **Honesty:** every `bsProSignedIn()` / `coachSignedIn` gate carries; signed-in never sees demo copy/data; absent data → redaction line (`window.BSTRedact` or the dashed-rule pattern), never an empty chart or fabricated figure.
- **Pros module idioms:** state hook is `useStateBSP` (NOT useState/useStateBSC); theme via `const t = useBS()`; alpha tints via hex-suffix templates (`` `${t.INK}17` ``); client-module components/hooks read from `window` at render scope (e.g. `const StationHead = window.BSTStationHead;` inside the component, with a null guard where the component is optional).
- **Gates on EVERY commit** (run all four, in this order, from the repo root unless noted):
  1. Parse each touched .jsx: `cd mobile-app && node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/<file>','utf8'),{sourceType:'module',plugins:['jsx']})"` → prints nothing (exit 0).
  2. LF-normalize touched files: `sed -i 's/\r$//' <files>` (Edit/Write emit CRLF on this Windows box).
  3. `npm test` → all suites pass (the full suite: 39 registered test FILES ≈ 382 test CASES as of `710fc3e4`, plus the new `pro-ledger` file — the number that matters is ZERO failures).
  4. Mobile build from **PowerShell** (never Git Bash — MSYS mangles the base): `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` → exit 0. If Windows Application Control blocks the oxide binary (known env issue), note it and rely on CI's Linux build as the gate.
  - Do NOT rebuild/commit `public/m` (built at deploy since #1470). **Hook
    caveat (verified):** the tracked pre-commit hook (`scripts/verify-staged.sh:86-95`)
    still diffs `mobile-app/dist` against `public/m` and BLOCKS the commit
    ("public/m is OUT OF SYNC") when `mobile-app/src/**` is staged — and this
    checkout has no tracked `public/m`, so an ARMED hook fails every mobile
    commit. On this Windows box the hook is UNARMED (`git config core.hooksPath`
    is empty) so commits pass; a web session auto-arms it — there, commit
    mobile-src changes with the documented bypass `SKIP_VERIFY=1 git commit …`
    and NEVER hand-build `public/m`. CI stays the hard gate either way.
- **Branch/PR choreography:** work on the session's `claude/*` branch reset to `origin/main`. Three PRs, merged sequentially with a `git reset --hard origin/main` re-sync between: **PR A** = Tasks 1–2 (module + kit + Today) · **PR B** = Task 3 (roster) · **PR C** = Tasks 4–6 (Case File) + Task 7 docs. Each PR: CI green (Web · Mobile · gitleaks) + **standard CodeRabbit wait** (no skip), findings addressed, squash-merge, branch kept.
- **Preserve every `data-tour` attribute** when rewriting JSX (the coach onboarding tour `BSProOnboardingTour` anchors to them — run `grep -n "data-tour"` on each component BEFORE rewriting it, and re-attach each anchor to the equivalent new element).
- **Verify base before ANY edit** (every session/turn): `git fetch origin main && git rev-parse --short HEAD origin/main` — if they differ, `git reset --hard origin/main` first.

### House JSX patterns (reference for Tasks 2–6 — copy these shapes, adapt data)

```jsx
// Station head — heat tick · mono label · ink→heat rule · optional mono action
<div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '22px 0 0' }}>
  <span aria-hidden style={{ width: 10, height: 2, background: heat }} />
  <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK70 }}>THE RAIL</span>
  <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${t.INK}4d, ${heat})` }} />
  {action && <button onClick={onAction} style={{ background: 'transparent', border: 0, cursor: 'pointer', minHeight: 44, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, padding: '0 2px' }}>CALENDAR →</button>}
</div>

// Ledger register — eyebrow ABOVE figure, count-up, heat rule draws on first view
<div>
  <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>SESSIONS</div>
  <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
    <window.BSSdCountUp text={String(n)} run={seen} />
  </div>
  <div style={{ marginTop: 6, height: 2, background: heat, transformOrigin: 'left',
    ...(reduced ? null : seen ? { animation: 'bsSdDrawX 700ms cubic-bezier(.4,0,.2,1) both' } : { transform: 'scaleX(0)' }) }} />
</div>

// Dot-leader row (INSIDE doors, lifts, roster leaders) — ≥44px button when tappable
<button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
  <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 }}>CLIENTS</span>
  <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}4d` }} />
  <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>12 ACTIVE · <span style={{ color: t.INK50 }}>3 FLAGGED</span> ›</span>
</button>

// Wire row (severity spine · bold lead-in + NAMED severity · directive · action)
<div style={{ borderLeft: `3px solid ${sevColor}`, padding: '8px 0 9px 11px', marginTop: 10 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{name}</span>
    <span style={{ fontFamily: t.MONO, fontSize: 6.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>· {sevWord}</span>
  </div>
  <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 11.5, color: t.INK70, lineHeight: 1.4 }}>{directive}</div>
  <button onClick={onAct} style={{ marginTop: 5, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 0 0', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{actionLabel} →</span></button>
</div>

// Redaction line (honest-absent)
<div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
  <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
  <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>RESPIRATORY · NOT SYNCED</span>
  <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${t.INK}4d` }} />
</div>
```

---

### Task 1: `proLedger.mjs` pure module + tests + ledger-kit window exposure

**Files:**
- Create: `mobile-app/src/services/proLedger.mjs`
- Create: `tests/pro-ledger.test.mjs`
- Modify: `package.json` (append the test file to the `"test"` script)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (the `Object.assign(window, {` export block at ~line 19067)

**Interfaces:**
- Produces (consumed by Tasks 2, 4, 5): `bsProMin(hhmm)→min|null` · `bsProHourLabel(hhmm)→'7A'|'8:30'|'1P'` · `bsProGapLabel(startMin,endMin)→'12 – 2 · OPEN'` · `bsProDurationFromSub(sub)→min|null` · `bsProDayShape(bookings, now?)→{sessions,gaps[],openHours|null,nowSlot,countdown}` · `bsProAttentionBudget(triage,bookings,max=3)→{lead,leadAnchor,inline[],wires[],demoted[]}` · `bsProLeadVerdict({signedIn,sessions,firstLabel,top})→string|null`
- Produces on `window` (for the pros bundle): `BSTStationHead, BSTRedact, BSTLedgerStat, BSTerrainTabs, BSSdBars, BSSdCountUp, useBSSdInView, bsSdReduced, bsInjectSessionDetailCss, bsTierForPoints`
- Consumes: nothing new. Booking shape (existing Today wiring): `{ time:'HH:MM', title, sub, client, clientId, state?:'done' }` — **`durationMin` does NOT exist upstream** (demo or calendar rows); it appears only after Task 2 derives it via `bsProDurationFromSub(b.sub)` and maps it onto the bookings it feeds `bsProDayShape`. Triage shape (from `useBSProRoster` rows through `bsRowSeverity` — see Task 2's verified mapping): `{ clientId?, name, severity:'red'|'amber'|'new', directive }`.

- [ ] **Step 1: Write the failing tests** — create `tests/pro-ledger.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsProMin, bsProHourLabel, bsProGapLabel, bsProDurationFromSub,
  bsProDayShape, bsProAttentionBudget, bsProLeadVerdict,
} from '../mobile-app/src/services/proLedger.mjs';

test('bsProMin parses HH:MM and rejects junk', () => {
  assert.equal(bsProMin('07:00'), 420);
  assert.equal(bsProMin('13:05'), 785);
  assert.equal(bsProMin('—'), null);
  assert.equal(bsProMin('25:00'), null);
  assert.equal(bsProMin(null), null);
});

test('bsProHourLabel renders 12h ledger labels', () => {
  assert.equal(bsProHourLabel('07:00'), '7A');
  assert.equal(bsProHourLabel('08:30'), '8:30');
  assert.equal(bsProHourLabel('13:00'), '1P');
  assert.equal(bsProHourLabel('12:00'), '12P');
});

test('bsProGapLabel floors both ends to 12h hours', () => {
  assert.equal(bsProGapLabel(12 * 60, 14 * 60), '12 – 2 · OPEN');
});

test('bsProDurationFromSub parses "· 60m"-style embedded durations', () => {
  assert.equal(bsProDurationFromSub('Lower Pull · 60m'), 60);
  assert.equal(bsProDurationFromSub('Conditioning · 45m'), 45);
  assert.equal(bsProDurationFromSub('Form check · 6 clips'), null);
  assert.equal(bsProDurationFromSub(null), null);
});

const BK = (time, client, extra = {}) => ({ time, title: client, client, ...extra });

test('dayShape: gaps ≥90min only, default 60min duration', () => {
  const d = bsProDayShape([BK('07:00', 'A'), BK('08:30', 'B'), BK('12:00', 'C')]);
  assert.equal(d.gaps.length, 1);                      // 9:30→12:00 = 150min; 8:00→8:30 = 30min ignored
  assert.equal(d.gaps[0].startMin, 9 * 60 + 30);
  assert.equal(d.gaps[0].endMin, 12 * 60);
});

test('dayShape: openHours needs ≥2 bookings, sums whole hours of ≥60min gaps', () => {
  assert.equal(bsProDayShape([BK('07:00', 'A')]).openHours, null);
  const d = bsProDayShape([BK('07:00', 'A'), BK('10:00', 'B', { durationMin: 60 }), BK('13:30', 'C')]);
  assert.equal(d.openHours, 4);                        // 8:00→10:00 (120) + 11:00→13:30 (150) = 270 → 4h
});

test('dayShape: countdown skips done, formats <60m and ≥60m, DAY CLEAR after last', () => {
  const rows = [BK('07:00', 'Alex Rivera', { state: 'done' }), BK('10:00', 'Riley Kim')];
  assert.equal(bsProDayShape(rows, { h: 9, m: 12 }).countdown, '48M UNTIL RILEY');
  assert.equal(bsProDayShape(rows, { h: 7, m: 30 }).countdown, '2H 30M UNTIL RILEY');
  assert.equal(bsProDayShape(rows, { h: 11, m: 0 }).countdown, 'DAY CLEAR');
});

const TR = (name, severity, directive, clientId) => ({ name, severity, directive, clientId });

test('budget: lead is rank #1 and never re-listed; anchors by clientId or EXACT name', () => {
  const triage = [TR('Riley Kim', 'red', 'read the week', 'u1'), TR('Casey Lee', 'amber', 'weekend gap', 'u2'), TR('Drew', 'amber', 'checkin', null)];
  const bookings = [BK('10:00', 'Riley Kim', { clientId: 'u1' }), BK('13:00', 'Casey Lee'), BK('14:30', 'Andrew Park')];
  const b = bsProAttentionBudget(triage, bookings);
  assert.equal(b.lead.name, 'Riley Kim');
  assert.equal(b.leadAnchor, 0);
  assert.equal(b.inline.length, 1);                    // Casey by exact name
  assert.equal(b.inline[0].bookingIdx, 1);
  assert.equal(b.wires.length, 1);                     // 'Drew' must NOT substring-match 'Andrew Park'
  assert.equal(b.wires[0].name, 'Drew');
  assert.equal(b.demoted.length, 0);
});

test('budget: caps inline+wires at max, overflow demotes in rank order', () => {
  const triage = [TR('L', 'red', 'x'), TR('A', 'amber', 'x'), TR('B', 'amber', 'x'), TR('C', 'new', 'x'), TR('D', 'new', 'x')];
  const b = bsProAttentionBudget(triage, [], 3);
  assert.equal(b.wires.length, 3);
  assert.deepEqual(b.demoted.map((x) => x.name), ['D']);
});

test('lead verdicts: top-flag, bookings-only, clear-day; null when signed out', () => {
  assert.equal(bsProLeadVerdict({ signedIn: false, sessions: 3 }), null);
  assert.equal(bsProLeadVerdict({ signedIn: true, sessions: 8, firstLabel: '7A', top: TR('Riley Kim', 'red', 'Logs quiet 3 days — read the week before the refeed.') }),
    'Riley Kim first — Logs quiet 3 days — read the week before the refeed.');
  assert.equal(bsProLeadVerdict({ signedIn: true, sessions: 2, firstLabel: '7A', top: null }), '2 sessions — first at 7A.');
  assert.equal(bsProLeadVerdict({ signedIn: true, sessions: 0, firstLabel: null, top: null }), 'Nothing booked, nobody flagged — a clear day.');
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/pro-ledger.test.mjs` → FAIL (`Cannot find module … proLedger.mjs`).

- [ ] **Step 3: Implement `mobile-app/src/services/proLedger.mjs`:**

```js
// Pure helpers for the coach Today "Assignment Rail" + Case File lead.
// No DOM, no Date.now — callers pass `now`. Contract:
// docs/superpowers/specs/2026-07-04-coach-ledger-redesign-design.md
// (three rules: one loop · anchor · attention budget).

export function bsProMin(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function bsProHourLabel(hhmm) {
  const min = bsProMin(hhmm);
  if (min == null) return typeof hhmm === 'string' && hhmm ? hhmm : '—';
  const h = Math.floor(min / 60), mm = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return mm ? `${h12}:${String(mm).padStart(2, '0')}` : `${h12}${h < 12 ? 'A' : 'P'}`;
}

export function bsProGapLabel(startMin, endMin) {
  const f = (m) => ((Math.floor(m / 60) + 11) % 12) + 1;
  return `${f(startMin)} – ${f(endMin)} · OPEN`;
}

// Durations are embedded in the booking `sub` strings ('Lower Pull · 60m') on
// BOTH the demo datasets and the real ShapeCalendar rows — no durationMin field
// exists upstream. Callers map this onto bookings before bsProDayShape.
export function bsProDurationFromSub(sub) {
  if (typeof sub !== 'string') return null;
  const m = sub.match(/(\d+)\s*m\b/i);
  return m ? +m[1] : null;
}

export function bsProDayShape(bookings = [], now = null) {
  const rows = bookings
    .map((b, i) => ({ i, min: bsProMin(b && b.time), b }))
    .filter((r) => r.min != null)
    .sort((a, b) => a.min - b.min);
  const endOf = (r) => r.min + ((r.b && r.b.durationMin) || 60);
  const gaps = [];
  let openMins = 0;
  for (let k = 1; k < rows.length; k++) {
    const g = rows[k].min - endOf(rows[k - 1]);
    if (g >= 60) openMins += g;
    if (g >= 90) gaps.push({ afterIdx: rows[k - 1].i, startMin: endOf(rows[k - 1]), endMin: rows[k].min });
  }
  const openHours = rows.length >= 2 ? Math.floor(openMins / 60) : null;
  let nowSlot = null, countdown = null;
  if (now && typeof now.h === 'number') {
    const nowMin = now.h * 60 + now.m;
    const next = rows.find((r) => r.min > nowMin && (!r.b || r.b.state !== 'done'));
    nowSlot = next ? next.i : (rows.length ? 'end' : null);
    if (next) {
      const d = next.min - nowMin, H = Math.floor(d / 60), M = d % 60;
      const who = String((next.b && (next.b.client || next.b.title)) || 'next').split(' ')[0].toUpperCase();
      countdown = d < 60 ? `${M}M UNTIL ${who}` : `${H}H ${M}M UNTIL ${who}`;
    } else if (rows.length) {
      countdown = 'DAY CLEAR';
    }
  }
  return { sessions: bookings.length, gaps, openHours, nowSlot, countdown };
}

export function bsProAttentionBudget(triage = [], bookings = [], max = 3) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const anchorOf = (t) => bookings.findIndex((b) => b && (
    (t.clientId && b.clientId && t.clientId === b.clientId) ||
    (norm(t.name) && (norm(b.client) === norm(t.name) || norm(b.title) === norm(t.name)))
  ));
  const lead = triage[0] || null;
  const leadIdx = lead ? anchorOf(lead) : -1;
  const inline = [], wires = [], demoted = [];
  for (const t of triage.slice(1)) {
    if (inline.length + wires.length >= max) { demoted.push(t); continue; }
    const idx = anchorOf(t);
    if (idx >= 0) inline.push({ ...t, bookingIdx: idx }); else wires.push(t);
  }
  return { lead, leadAnchor: leadIdx >= 0 ? leadIdx : null, inline, wires, demoted };
}

export function bsProLeadVerdict({ signedIn, sessions = 0, firstLabel = null, top = null } = {}) {
  if (!signedIn) return null; // signed-out demo narratives are authored at the call site
  if (top) return `${top.name} first — ${top.directive}`;
  if (sessions) return `${sessions} ${sessions === 1 ? 'session' : 'sessions'} — first at ${firstLabel}.`;
  return 'Nothing booked, nobody flagged — a clear day.';
}
```

- [ ] **Step 4: Run tests** — `node --test tests/pro-ledger.test.mjs` → all pass. Then append ` tests/pro-ledger.test.mjs` inside the `"test"` script string in `package.json` and run `npm test` → full suite green.

- [ ] **Step 5: Expose the ledger kit + tier helper on window.** In `iosAppBroadsheetClient.jsx`, find the block `Object.assign(window, {` (~line 19067, the one already exporting `BSFacetAvatar, bsMyName, …`) and add these entries — ALL VERIFIED defined in this file and currently absent from both window blocks (`bsTierColor` is already exported; do not duplicate it): `BSTStationHead` (:8695) · `BSTRedact` (:8706) · `BSTLedgerStat` (:8718) · `BSTerrainTabs` (:8735) · `BSSdBars` (:10925) · `BSSdCountUp` (:10761) · `useBSSdInView` (:10789) · `bsSdReduced` (:10714) · `bsInjectSessionDetailCss` (:10716) · `bsTierForPoints` (:13825).

- [ ] **Step 6: Gates + commit** — run all four Global gates; `git add -A && git commit -m "feat(coach-ledger): proLedger pure module + tests; expose the Open Ledger kit on window"`.

---

### Task 2: `BSProToday` — the Assignment Rail (both editions) + Today kills

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — replace the bodies of `BSTrainerToday` (~1103–1357) and `BSNutriToday` (~4146–4358) with thin wrappers over a new `BSProToday`; restyle `BSProWeekStrip` (~849–896); DELETE `BSProTriageFeed` (~15–89), `BSProScheduleRows` (~90–142), `BSReviewQueueCard` (~239–271, already zero call sites), `BSProHabits` (~1549–1598, already zero call sites). Line numbers are anchors from `710fc3e4` — re-grep each symbol before editing.

**Interfaces:**
- Consumes: Task 1's module (`import { bsProMin, bsProHourLabel, bsProGapLabel, bsProDayShape, bsProAttentionBudget, bsProLeadVerdict } from '../services/proLedger.mjs';` at the top of the pros file) + `window.BSSdCountUp / useBSSdInView / bsSdReduced / bsInjectSessionDetailCss`.
- Produces: `BSProToday({ role, onProfile, sheet, goCalendar, goRadio, onOpenReviews, onWidgetOpen, onOpenHabits, onOpenScore, onWatchLive, tweaks, setTweak })`; `BSTrainerToday(props)` → `<BSProToday role="trainer" {...props} />`, `BSNutriToday(props)` → `<BSProToday role="nutritionist" {...props} />` (exact current prop names — the shells must not change). New helper `bsProHeat(t, role)` (module scope, pros file) used by Tasks 2–4.

- [ ] **Step 1: Add `bsProHeat` next to `bsProAccent` (~line 1808):**

```jsx
// ROLE heat for the coach ledger surfaces (spec: trainer rust is ONE literal
// on all papers; nutritionist gold is a light/dark pair). bsProAccent (teal)
// stays the ACTION accent for the action pages — heat ≠ accent.
function bsProHeat(t, role) { return role === 'nutritionist' ? (t.isLight ? '#a07a2e' : '#d8b25a') : '#c0533b'; }
```

- [ ] **Step 2: Build `BSProToday`** in place of `BSTrainerToday`'s body. Keep ALL current data wiring verbatim (copy from both old bodies into role config): the analytics ticker fetch (endpoint per role), `ShapeCalendar.list` → `realByDate`, the demo datasets (`TRAINER_BOOKINGS`/`NUTRI_SCHEDULE`, `TRAINER_LEAD`/`NUTRI_LEAD`, the `dataFor` offset maps, the demo dot densities), `useBSProRoster(role)`, `useProPresenceTick()`, `bsProSignedIn`/`coachSignedIn`, `selDay` state. Then render the spec's structure §A.1–A.9 exactly:
  - Masthead: unchanged (copy the existing `<BSMasthead compact thinRule noTopRule …>` block once).
  - Dateline (kills the PAPER2 edition strip): one row, `borderBottom: 1px solid ${t.INK}12`; left `<span>{role==='nutritionist'?'NUTRI EDITION':'COACHES EDITION'}</span>` in heat + ` · {DOW} · {MON D}` ink-50; right = `bsNowHHMM()` when `isToday`, else the selected date. Mono 7.5/800/0.18em.
  - Bulletins: LIVE — reuse the exact `liveClients` presence logic from the old trainer body, EXTENDED per spec (trainer matches `activityOf===\'workout\'` → `WATCH →` → existing `onWatchLive` payload; nutritionist matches `\'cooking\'` → `OPEN →` → `window.dispatchEvent(new CustomEvent('shape:proMessageClient', { detail: { client: { userId: lc.userId, n: lc.n } } }))` — VERIFIED payload shape (the listener at pros `:42` reads `detail.client.{userId,n}`)). Render as the 3px teal-spine row w/ breathing dot (`animation: 'bsLivePulse 2.2s ease-in-out infinite'` — keyframe already local to the old LIVE plate; move the `<style>` tag with it). Signed-out shows the demo bulletin (Riley/Sam). REVIEW bulletin: heat spine, no dot, demo-gated exactly like the old Queue (`!coachSignedIn`), label `4 FORM CLIPS WAITING · REVIEW →` → `onOpenReviews()` (nutri: `2 CLIENT LOGS WAITING`).
  - THE LEAD: station head (pattern block) + serif verdict `fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.28` ending in `<span style={{ color: heat }}>.</span>`; signed-in text = `bsProLeadVerdict({ signedIn: true, sessions: bookings.length, firstLabel: bsProHourLabel(first?.time), top: budget.lead })`; signed-out = the day's demo lead copy verbatim. Registers row: SESSIONS/CONSULTS (`bookings.length`) · NEED YOU (**true** flagged total from the roster, not the budget) · OPEN HRS (`dayShape.openHours`, render the register only when non-null). Pattern-block registers with `BSSdCountUp` + `bsSdDrawX` rules.
  - Week strip: edit `BSProWeekStrip` in place — day letters mono 8/800; selected = `color: t.INK` + 2px heat underline (`left/right 22%`); the `dots` prop keeps its API but renders `Math.min(3, dots[i].length)` ink-alpha 3×3px ticks instead of colored dots. Add a `heat` prop (both call sites pass `bsProHeat(t, role)`).
  - THE RAIL: station head `{DOW} · THE RAIL` + `CALENDAR →`. Compute `const dayShape = bsProDayShape(bookings, isToday ? { h: new Date().getHours(), m: new Date().getMinutes() } : null)` and `const budget = bsProAttentionBudget(triageRows, bookings)` where `triageRows` uses the VERIFIED severity model (post-review fix — the engine's sev values are `red / amber / new / green / past` and **`green` means ON TRACK**, never flagged; demo rows carry NO `_sig` and derive severity from their `s` status, so go through `bsRowSeverity(c, role)` — the single live-or-demo path at ~`:1493`):

```jsx
const FLAG_WORDS = { red: 'FLAG', amber: 'WATCH', new: 'NEW' }; // green/past NEVER enter the budget
const triageRows = roster
  .map((c) => ({ c, sig: bsRowSeverity(c, role) }))
  .filter(({ sig }) => sig && FLAG_WORDS[sig.sev])
  .sort((a, b) => (a.sig.rank ?? 9) - (b.sig.rank ?? 9))
  .map(({ c, sig }) => ({ clientId: c.userId || null, name: c.n, severity: sig.sev, directive: sig.directive || sig.label || '' }));
```

Severity words on spines/meta come from `FLAG_WORDS[sev]`; spine colors `red→'#c0533b' · amber→'#d8a23a' · new→'#5fa96e'`. Because `bsRowSeverity` falls back to the demo `s`-status mapping, signed-out demo flags flow through the same budget path (BSProTriageFeed's separate demo rows are NOT needed — its data dies with it). Feed `bsProDayShape` bookings enriched with parsed durations: `bookings.map((b) => ({ ...b, durationMin: bsProDurationFromSub(b.sub) || undefined }))` (durations live embedded in the `sub` strings — `'Lower Pull · 60m'` — there is NO durationMin field on either the demo or the real calendar rows). Wrap entries in a rail container: `position: relative; paddingLeft: 44px` with a `::before`-equivalent absolute 2px heat bar at `left: 30` that scales in (`bsSdGrowY` one-shot, gated on the section's `useBSSdInView` pair). Per booking, in time order:

```jsx
<div key={i} style={{ position: 'relative', minHeight: 44, padding: '6px 0 10px' }}>
  <span style={{ position: 'absolute', left: -44, top: 8, width: 26, textAlign: 'right', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: done ? `${t.INK}4d` : `${t.INK}b3`, textDecoration: done ? 'line-through' : 'none' }}>{bsProHourLabel(b.time)}</span>
  <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, color: done ? t.INK50 : t.INK, textDecoration: done ? 'line-through' : 'none' }}>{b.title}</div>
  <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>
    {isNext ? <span style={{ color: t.INK, borderBottom: `1px solid ${heat}`, paddingBottom: 2 }}>{typeWord}</span> : typeWord}
    {' · '}{b.sub}{done ? ' · DONE' : ''}{isNext && <span style={{ color: heat }}> · ↑ NEXT</span>}
    {isDemotedFlag && <span style={{ color: sevColor }}> · ⚑ {sevWord}</span>}
  </div>
  {inlineWire /* budget.inline entries + (budget.leadAnchor===i ? nothing extra — the verdict IS the lead's wire) */}
</div>
```

  `typeWord` = the NAMED type from the old tag maps (LIVE/ASYNC/F/U/INTAKE/CHK/PLAN/PRGM/ADM) — keep the `tagFor` mapping functions but strip their colors. NOW line at `dayShape.nowSlot` (today only): heat 9px dot (breathes ONLY when no live bulletin — `animation: liveBulletinShown ? 'none' : 'bsLivePulse …'`) + mono heat `NOW {bsNowHHMM()} — {dayShape.countdown}`. Gap rows from `dayShape.gaps` after their `afterIdx` entry: dashed top+bottom `1px dashed ${t.INK}12`, mono ink-30 `bsProGapLabel(...)` (+ demo-only flavored suffix from the authored copy; signed-in plain). Density guards: `bookings.length >= 10` → collapse `state==='done'` entries into one row `{n} DONE ✓`; signed-in empty day → single dashed row `NOTHING BOOKED — OPEN HOURS`. Tap any entry → `goCalendar` (whole entry is a ≥44px button).
  - THE WIRE: station head `THE WIRE · NO SESSION BOOKED` (rust tick) + `budget.wires` rows (pattern block; action = `SCHEDULE →` when the row has a `clientId` → render `BSProScheduleSession` via a local `schedFor` state exactly like the client page does, else `OPEN THE FILE →` → the roster's `onOpen` path via `onWidgetOpen('clients')`); render the station only when `budget.wires.length > 0`. Then ALWAYS the roster leader row (pattern block): `SEE THE FULL ROSTER ····· {N} CLIENTS{flagged ? ` · ${k} FLAGGED` : ''} →` → `onWidgetOpen('clients')`.
  - INSIDE.: serif `INSIDE.` h4 (21/700) + doors per role (spec §A.8 exact labels/targets); figures only when known (roster counts always known; drafts/clips/list counts: render the figure when the existing data source is already loaded, else just `›`).
  - Radio + footer: keep `<BSNowPlaying onOpen={goRadio} />` + `<BSFooter left={role === 'nutritionist' ? 'The Nutri Edition' : 'The Coach Edition'} right="Pg 1 of 4" />`.
  - Keep `data-tour="hero-today"` on the LEAD block (the coach tour anchors to it).
  - Motion: ONE `useBSSdInView` pair per station (lead/rail/wire/inside), 30–70ms staggers, everything reduced-gated. `React.useInsertionEffect(() => { window.bsInjectSessionDetailCss && window.bsInjectSessionDetailCss(); }, [])`.

- [ ] **Step 3: Collapse the wrappers + delete the dead.** `BSTrainerToday`/`BSNutriToday` become 1-liners delegating to `BSProToday`. Delete `BSProTriageFeed`, `BSProScheduleRows`, `BSReviewQueueCard`, `BSProHabits`, the PAPER2 edition strips, the old LIVE `BSPlate` block, the Queue sections, the `BSHeadlineNumber` hero usage in both (verify `BSHeadlineNumber` has OTHER consumers before touching its definition — delete only these call sites). `grep -n "BSProTriageFeed\|BSProScheduleRows\|BSReviewQueueCard\|BSProHabits" mobile-app/src/broadsheet/*.jsx` → zero hits after.

- [ ] **Step 4: Gates + commit** — all four gates; commit `feat(coach-ledger): Today = the Assignment Rail (one BSProToday, both editions) + kills`.

- [ ] **Step 5: Open PR A** (Tasks 1–2), CI green + CodeRabbit findings addressed → squash-merge → re-sync branch to `origin/main`.

---

### Task 3: Roster — the Client Index

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — `BSProRosterView` (~1608–1712; re-grep), its consumers `BSTrainerClients` (~1713) + `BSNutriClients` (~4360) only if their props change (they should not), `BSProStatusPill` (delete if this was its last consumer — grep first).

**Interfaces:**
- Consumes: `bsProHeat(t, role)` (Task 2) · existing `bsClientMatchesFilter/bsClientMatchesQuery/bsRowSeverity/BS_ROSTER_FILTERS` (keep verbatim) · `window.useBSSdInView/bsSdReduced`.
- Produces: same `BSProRosterView` signature (no prop changes — verify against both call sites before starting).

- [ ] **Step 1: Rewrite `BSProRosterView`'s render** per spec §B (keep every piece of state + logic; only the JSX changes):
  1. Header: mast row (existing `bsProMastRow()`) + `THE ROSTER` eyebrow row with right meta `{N} ACTIVE{demo ? ' · +3 THIS MO' : ''}` + serif `Your <i style={{color: heat, fontStyle:'italic'}}>clients.</i>` (30/700/-0.04em) + mono `＋ ADD` (keep the existing add handler; ≥44px).
  2. Underline search: `borderBottom: 1.5px solid ${t.INK}4d`, ⌕ glyph, existing `query` state.
  3. Filter index: one flex row, `borderBottom: 1px solid ${t.INK}12`; items = the role's `BS_ROSTER_FILTERS` + last item `⚑ NEEDS YOU` (`color: '#c0533b'`); active = ink + 2px **teal** underline (page chrome); each ≥44px. `⚑ NEEDS YOU` drives the existing `needsYou` state.
  4. Verdict: serif 16/600 + heat period — `k` = flagged count, `m` = on-track count: `k ? `${k} need you — the other ${m} are holding.` : `All ${m} holding — nobody needs you today.``
  5. NEEDS YOU station (only when `k > 0`): station head (rust tick, `NEEDS YOU · {k}`) + full rows — 3px severity spine (`red→'#c0533b'`, `amber→'#d8a23a'`, `new→'#5fa96e'`), serif name 14.5/700, ink-70 directive line (the row's existing directive/meta string), mono right meta `{FLAG|WATCH|NEW} · {phase}` — severity word ALWAYS present. Row = ≥52px button → existing `onOpen(c)`.
  6. ON TRACK station: compact rows (spine `${t.INK}12`, name 13.5/600 ink-70, right meta `{phase} · {streak}`); first 5, then dot-leader expander `{n} MORE ON TRACK ····· SHOW ›` (local `expanded` state).
  7. PAST: redaction-row toggle `─── PAST CLIENTS · {n} › ───` flipping the existing active/past state.
  8. Signed-in empty roster: redaction line + underlined `Grow your roster →` (existing marketplace-listing destination — grep the old empty state for the handler).
  9. Motion: rows stagger 30ms one-shot; zero loops.
- [ ] **Step 2: Kill sweep** — the rounded card styles, filter pills, boxed search, Active/Past buttons; delete `BSProStatusPill` if zero call sites remain (`grep -n "BSProStatusPill" mobile-app/src/broadsheet/*.jsx`).
- [ ] **Step 3: Gates + commit** — `feat(coach-ledger): roster = the Client Index`.
- [ ] **Step 4: PR B** → CI green + CodeRabbit addressed → squash-merge → re-sync.

---

### Task 4: Case File — header, tier heat, action line, tabs

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — `BSProClientFullProfilePage` header region (~2649–2905; re-grep for `function BSProClientFullProfilePage`).

**Interfaces:**
- Consumes: `window.bsTierForPoints` + `window.bsTierColor` (Task 1) · `bsProHeat` (Task 2) · existing `phase` store, status logic, `fireEvt('shape:proMessageClient')`, `setShowAdjustPage/setShowSchedulePage/setShowDraft`, `view` state.
- Produces: a component-scope `heat` value (client tier, role fallback) that Tasks 5–6 read; the `view` tab state unchanged (`'profile' | 'manage'`).

- [ ] **Step 1: Tier-heat resolution.** At the top of the component (with the other effects). VERIFIED wiring (adversarial pass): the batch helper is `window.ShapeProfiles.getUserPoints(ids)` (`shapeBackend.js:4435`, exposed at `:4465`) — it calls `rpc('get_user_points', { p_ids: list })` and resolves to a `{ [user_id]: points }` map. Do NOT call the RPC raw:

```jsx
// Case File heat = the CLIENT's member tier (spec) — resolved from their
// all-time points; role heat until known / for demo rows (no clientUid).
const [clientTier, setClientTier] = useStateBSP(null);
React.useEffect(() => {
  setClientTier(null);
  if (!clientUid || !window.ShapeProfiles?.getUserPoints) return undefined;
  let on = true;
  window.ShapeProfiles.getUserPoints([clientUid])
    .then((map) => {
      const pts = map && map[clientUid];
      if (on && pts != null && window.bsTierForPoints) setClientTier(window.bsTierForPoints(pts));
    })
    .catch(() => {});
  return () => { on = false; };
}, [clientUid]);
const heat = clientTier && window.bsTierColor ? window.bsTierColor(clientTier) : bsProHeat(t, role);
```

- [ ] **Step 2: Header rewrite** per spec §C: eyebrow `CASE FILE · {PHASE}[ · WK X OF Y | · {KCAL} KCAL]` (week/kcal only when the live program `detail` carries it; demo keeps demo); serif name with heat period; keep the existing avatar but pass the tier ring color; mono id line; status → mono text + heat tick (`● ON TRACK`).
- [ ] **Step 3: Action line** — replace the 3-button grid + full-width DRAFT pill with ONE row, 4 cells (`display:flex; justifyContent:space-between; borderTop/Bottom 1px solid ${t.INK}12`): `MESSAGE / ADJUST / SCHEDULE / ✦ DRAFT`, mono 8/800, each a ≥44px button, label underlined `1px solid ${heat}`; identical handlers.
- [ ] **Step 4: Tabs** — the pill pair → typographic index (two flex buttons, mono 8.5/800, active = ink + 2px heat underline; ≥44px).
- [ ] **Step 5: Gates + commit** — `feat(coach-ledger): Case File header — tier heat, typographic actions + tabs`.

---

### Task 5: Case File — PROFILE tab, engine-led

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — the `view === 'profile'` body of `BSProClientFullProfilePage` (+ `ProWeekendPlate` ~2618 → zero-box station).

**Interfaces:**
- Consumes: the page's EXISTING directive-lead computation — VERIFIED at ~`:3353–3369`: it calls `bsRowSeverity(client, role)`, reads the engine's `_sig.{sev, rank, label, directive}` plus a 30-day `summaryLine` — reuse that output verbatim as YOUR MOVE's verdict/severity/evidence source. Also `S` (get_client_stats), lifts, check-in kit (`ck`/ratings/measurements), `sleepRec`, weekend `split`, `heat` (Task 4), `window.BSSdBars/BSSdCountUp/BSTRedact/useBSSdInView`.
- Produces: nothing consumed later; MANAGE (Task 6) is independent.

- [ ] **Step 1: YOUR MOVE · FROM THE ENGINE** (station #1): serif verdict (16.5/600, heat period) from the existing directive lead; ONE underlined action mapped by directive kind — nutrition-slip → `MESSAGE` (fires `shape:proMessageClient`; when the draft kit has stats, `✦ DRAFT` opens `BSProCheckinDraft` prefilled) · missed-sessions → `SCHEDULE` (`setShowSchedulePage(true)`) · program-stall → `ADJUST` (`setShowAdjustPage(true)`) · check-in-due → `✦ DRAFT` (`setShowDraft(true)`); THE EVIDENCE: ≤3 dot-leader rows built from the SAME fields the directive cites (e.g. `WEEKEND NUTRITION ···· −22 PTS`, `LOGS ···· QUIET 3 DAYS`), closing with `EVERYTHING ELSE ····· HOLDING ✓` when no other dimension is flagged. **All-clear:** verdict `Everything holding — next check-in {weekday} ✓.` + `✦ DRAFT` as the light action. No directive computable (no engine, no data) → the honest station renders just `BSTRedact` `NO READ YET · DATA STILL THIN`.
- [ ] **Step 2: Flagged-dimension float** — when the weekend split flags, its station renders directly under YOUR MOVE (semantic rust spine + the split figures + the one concrete move; `ProWeekendPlate`'s data verbatim, plate chrome → zero-box). Otherwise it stays in standing order.
- [ ] **Step 3: Standing stations** in spec order §C.3, each ONE register row + ONE visual: ATTENDANCE/ADHERENCE (register pair + `window.BSSdBars` rows `W3…W6` with `still` — build `rows` from the existing weekly bars data), KEY LIFTS (trainer: dot-leaders `{move} ···· {best} ▲{Δ}` + `HISTORY →` keeping its handler) / MACROS VS TARGET (nutri: `BSSdBars` rows from the existing avg-vs-target values), BODY (registers + the weight polyline redrawn line-only self-drawing: `strokeDasharray/offset` one-shot + heat end-dot; `LOG →` kept), CHECK-IN (3-col mini registers ×6 + the wins/struggles serif pull-quote + asked-you line), SLEEP · RECOVERY (readiness + 7-day registers; redactions for unsynced fields), ACTIVITY (dot-leader recent rows), COACH NOTE (ink-spined quiet block, `COACH NOTE · ONLY YOU SEE THIS`). Every absent source → `BSTRedact`. Role gates exactly as today (nutri sees ADHERENCE + MACROS where trainer sees ATTENDANCE + LIFTS).
- [ ] **Step 4: Kill sweep** — the 64px bordered metric card, `StatCard` boxes, the old `Section` component usage in this tab (station heads replace it), the boxed note.
- [ ] **Step 5: Gates + commit** — `feat(coach-ledger): Case File PROFILE — engine lead + ledger stations`.

---

### Task 6: Case File — MANAGE tab + WORKLOG

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — the `view === 'manage'` body.
- Modify: `docs/WORKLOG.md` (changelog entry, this wave).

**Interfaces:**
- Consumes: `heat` (Task 4), existing `phaseRow` options + `setPhaseKey` (ShapeProgramApi), `setShowAssignPage`, goals (`ShapeGoalsApi.getForClient` result), penalties + waive RPC wiring, care-team rows + `shape:proMessageCoach`.

- [ ] **Step 1: MANAGE rewrite** per spec §C-Manage: phase chips → typographic index (mono 9/800, active = ink + 2px heat underline, same `setPhaseKey`); ASSIGN → amber-spined notice row (`borderLeft: 3px solid #d8a23a`, mono label `ASSIGN FROM YOUR CATALOGUE…`, `›`) → `setShowAssignPage(true)`; shared goals → dot-leader rows + private/none → `BSTRedact`; ACCOUNTABILITY → penalty rows (mono description · rust `−{n}` · dotted leader · `WAIVE` heat-underline action, existing RPC handler); CARE TEAM → press-credit rows (3px spine in the COUNTERPART's role color — nutritionist gold pair / trainer rust — name 13/700, `CO-MANAGING` mono, `MESSAGE` heat-underline → existing `shape:proMessageCoach` payload); notes editor unchanged (quiet form).
- [ ] **Step 2: WORKLOG entry** — dated `### 2026-07-04 — Coach Ledger wave` entry in `docs/WORKLOG.md` summarizing the three PRs (structure + kills + the three rules + engine-led Case File), per the house changelog format.
- [ ] **Step 3: Gates + commit** — `feat(coach-ledger): Case File MANAGE + WORKLOG`; **PR C** (Tasks 4–6) → CI green + CodeRabbit addressed → squash-merge → re-sync.

---

### Task 7: Whole-branch review gate (before PR C merges)

- [ ] **Step 1:** Before opening PR C, run a whole-branch adversarial review of ALL three surfaces' diffs against the spec (strongest available reviewer): hunt specifically for — heat-literal drift (rust/gold pairs, tier fallback), loop-rule violations (any second infinite animation), anchor/budget double-listing, honesty regressions (demo leaking into signed-in paths), dead handlers (every old CTA must still reach its destination), rules-of-hooks breaks in the window-kit consumption, and ≥44px target misses. Fix findings before the PR.
- [ ] **Step 2:** Register the on-device pass items (spec §Verification) in the PR description for the owner.

## Self-review notes (done at authoring)

- Spec coverage: §A→Task 2, §B→Task 3, §C header→4 / profile→5 / manage→6, module→1, gates/review→Global+7, WORKLOG→6. INSIDE doors, bulletins, NOW/gap/density guards all in Task 2 Step 2.
- Known drift risks called out inline: `get_user_points` param shape (Task 4 Step 1), `shape:proMessageClient` payload (Task 2 Step 2), `BSHeadlineNumber` other consumers (Task 2 Step 3), `BSProStatusPill` last-consumer check (Task 3 Step 2). Line numbers are `710fc3e4` anchors — always re-grep.
