# Goals "The Contract" + Session "The Meter" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serialize the Goals page (`BSClientGoals`) into the single-scroll "Contract" ledger and the live session player (`BSSession`) + Train deck + workout previews into the zero-box "Meter", per the approved spec `docs/superpowers/specs/2026-07-07-goals-workout-open-ledger-design.md`.

**Architecture:** Presentation-only rework inside `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`, plus two new pure ESM modules (`goalContract.mjs` verdict copy, `liveEffort.mjs` effort-heat zones) with `node --test` suites. Reuse the shipped Open Ledger primitives (`BSTLedgerStat`, `BSTRedact`, `BSSdCountUp`, `useBSSdInView`, `bsSdReduced`, the `bsInjectSessionDetailCss` keyframes); add four small module-scope ledger primitives. All data flows, handlers, sheets, and demo-vs-live gates carry over verbatim.

**Tech Stack:** React (Vite/Capacitor broadsheet, inline styles + theme tokens `t.*`), `node --test` `.mjs` tests, no new dependencies.

## Global Constraints

- **Presentation-only** — no migration, no new/changed API routes, no changed persistence shapes (spec "Non-goals" + "Invariants").
- **Verify base first, every task:** `git fetch origin main && git rev-parse --short HEAD origin/main`; if HEAD ≠ origin/main, `git reset --hard origin/main` (WORKLOG rule).
- **Branches / PRs:** PR A on `claude/goals-contract`, PR B on `claude/session-meter`, each cut from fresh `origin/main` (B after A merges). Squash-merge on CI green with every CodeRabbit finding addressed; keep branches.
- **Per-commit gates:** JSX parse-check `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"` · PowerShell-only mobile build `$env:VITE_BASE='/m/'; npm run build` (from `mobile-app/`; **never Git Bash**) · full `npm test` at repo root · LF normalize every touched tracked file `sed -i 's/\r$//' <file>` before commit. `public/m` is built at deploy — do NOT commit it.
- **Zero-box grammar:** no new bordered/tinted cards outside sheets; boundaries = drawn rules, station eyebrows with heat ticks, dot-leaders, whitespace. Forms/sheets stay quiet (unchanged fields).
- **Teal = action.** Solid CTAs keep current fills. Heat never fills a primary button. Goals page-level actions = ink text + 2px heat underline.
- **One loop per page:** Goals = the breathing next-milestone dot; Session = the LIVE dot. Everything else one-shot in-view, gated on `bsSdReduced()`. Add **no new keyframes** unless a draw has no equivalent in `bsInjectSessionDetailCss`.
- **Honest-absent:** every empty case renders a `BSTRedact` redaction row, never a fabricated figure; demo content stays signed-out-only (existing gates).
- **A11y:** every input keeps its aria-label; interactive rows/actions ≥44px targets; the set done-toggle keeps ≥26px; states named in mono text, never color-only.
- Component/primitive names used below: before defining any new component, `grep -n "function <Name>" mobile-app/src/broadsheet/*.jsx` to confirm no collision.

## File structure

| File | Responsibility |
|---|---|
| `mobile-app/src/services/goalContract.mjs` (create) | Pure verdict copy: engine state → `{lead, sub, tone}` strings. |
| `tests/goal-contract.test.mjs` (create) | Vectors for every verdict state, cut+build, units. |
| `mobile-app/src/services/liveEffort.mjs` (create) | Pure effort zones: `{bpm, rpe}` → `{zone, label}`; the shared 4-stop ramp map. |
| `tests/live-effort.test.mjs` (create) | Band edges, fallback order, null. |
| `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (modify) | All four surfaces. Goals: `BSClientGoals` shell (~L17035–17240), `BSGoalsOverall` (~L15043) reworked into `BSGoalsContract`, `BSGoalsTraining` (~L15336) + `BSGoalsNutrition` (~L15483) folded in and deleted. Session: `BSSession` (~L19811–20330). Deck: `BSClientTrain` hero (~L3560–3595) + on-deck rows (~L3648+). Previews: `BSWorkoutPreview` (~L19666), `BSHomeWorkoutPreview` (~L1407). |
| `package.json` (modify) | Register the two new test files in the `test` script. |
| `docs/WORKLOG.md` (modify, PR B) | Dated changelog entry for the wave. |

Line numbers are anchors as of `origin/main` @ the spec merge — re-locate with the greps given in each task; never edit blind.

---

# PR A — Goals "The Contract" (`claude/goals-contract`)

### Task A1: `goalContract.mjs` — the verdict module (TDD)

**Files:**
- Create: `mobile-app/src/services/goalContract.mjs`
- Test: `tests/goal-contract.test.mjs`
- Modify: `package.json` (root — append the test file to the `test` script)

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `bsGoalVerdict({ start, now, target, unit, proj })` → `{ lead: string, sub: string, tone: 'neutral'|'good'|'warn'|'bad' }`. `proj` is the existing `goalProj` object (`{ state, projectedLabel, ratePerWeek, slip }` — see `BSGoalsOverall` ~L15072) or `null`. Direction is derived: `target < start` = cut ("down"), `target > start` = build ("up").

- [ ] **Step 1: Write the failing test**

```js
// tests/goal-contract.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsGoalVerdict } from '../mobile-app/src/services/goalContract.mjs';

const base = { start: 86, now: 81.8, target: 78, unit: 'kg' };

test('no goal → set-the-terms lead', () => {
  const v = bsGoalVerdict({ start: 0, now: 0, target: 0, unit: 'kg', proj: null });
  assert.equal(v.lead, 'Set the terms.');
  assert.equal(v.tone, 'neutral');
  assert.match(v.sub, /start \+ target/i);
});

test('on-pace cut → moved + ETA lead, subline names the cut', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'on-pace', projectedLabel: 'Aug 12', slip: null } });
  assert.equal(v.lead, '4.2 kg down. Aug 12 at this pace.');
  assert.equal(v.tone, 'good');
  assert.equal(v.sub, 'CUT · 86 → 81.8 OF 78 KG · 52% THERE');
});

test('slipping on-pace → amber tone + slip named', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'on-pace', projectedLabel: 'Aug 19', slip: 9 } });
  assert.equal(v.tone, 'warn');
  assert.match(v.lead, /Aug 19/);
  assert.match(v.sub, /\+9D THIS WK$/);
});

test('stalled → bad tone', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'stalled' } });
  assert.equal(v.lead, '4.2 kg down. Pace has flattened.');
  assert.equal(v.tone, 'bad');
});

test('far → 1y+ lead, warn', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'far' } });
  assert.equal(v.lead, '4.2 kg down. Over a year at this pace.');
  assert.equal(v.tone, 'warn');
});

test('stale → refresh lead, warn', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'stale' } });
  assert.equal(v.lead, '4.2 kg down. Log a weigh-in to update the read.');
  assert.equal(v.tone, 'warn');
});

test('achieved → done lead, good', () => {
  const v = bsGoalVerdict({ start: 86, now: 77.8, target: 78, unit: 'kg', proj: { state: 'achieved' } });
  assert.equal(v.lead, 'You did it. 78 kg.');
  assert.equal(v.tone, 'good');
});

test('no projection (fresh goal, <2 weigh-ins) → progress-only lead', () => {
  const v = bsGoalVerdict({ ...base, proj: null });
  assert.equal(v.lead, '4.2 kg down. 3.8 to go.');
  assert.equal(v.tone, 'neutral');
});

test('build direction reads "up" and BUILD', () => {
  const v = bsGoalVerdict({ start: 70, now: 72.5, target: 76, unit: 'kg', proj: { state: 'on-pace', projectedLabel: 'Sep 3', slip: null } });
  assert.equal(v.lead, '2.5 kg up. Sep 3 at this pace.');
  assert.match(v.sub, /^BUILD · 70 → 72\.5 OF 76 KG/);
});

test('zero movement never reads a signed zero', () => {
  const v = bsGoalVerdict({ start: 86, now: 86, target: 78, unit: 'kg', proj: null });
  assert.equal(v.lead, 'The terms are set. 8 kg to go.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (repo root): `node --test tests/goal-contract.test.mjs`
Expected: FAIL — `Cannot find module ... goalContract.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// mobile-app/src/services/goalContract.mjs
// The Contract's verdict copy — ONE pure mapping from the goal facts + the
// ShapeSignals projection to the serif lead + mono subline. The component keeps
// zero verdict logic (spec: docs/superpowers/specs/2026-07-07-goals-workout-open-ledger-design.md).
const r1 = (v) => Math.round(Number(v) * 10) / 10;
const fmt = (v) => {
  const n = r1(v);
  return Number.isInteger(n) ? String(n) : n.toLocaleString('en-US');
};

export function bsGoalVerdict({ start, now, target, unit = 'kg', proj = null }) {
  const s = Number(start) || 0, n = Number(now) || 0, g = Number(target) || 0;
  if (!s || !g || s === g) {
    return { lead: 'Set the terms.', sub: 'ADD A START + TARGET TO OPEN THE CONTRACT', tone: 'neutral' };
  }
  const build = g > s;
  const moved = r1(build ? n - s : s - n);          // progress in the goal's direction
  const range = r1(Math.abs(g - s));
  const toGo = r1(build ? g - n : n - g);
  const pct = Math.max(0, Math.min(1, range ? (range - Math.max(0, toGo)) / range : 0));
  const dirWord = build ? 'up' : 'down';
  const movedLead = `${fmt(Math.abs(moved))} ${unit} ${dirWord}.`;
  const sub = `${build ? 'BUILD' : 'CUT'} · ${fmt(s)} → ${fmt(n)} OF ${fmt(g)} ${String(unit).toUpperCase()} · ${Math.round(pct * 100)}% THERE`;
  const st = proj && proj.state;
  if (st === 'achieved') return { lead: `You did it. ${fmt(g)} ${unit}.`, sub, tone: 'good' };
  if (st === 'on-pace' && proj.projectedLabel) {
    const slip = proj.slip != null && isFinite(proj.slip) && proj.slip >= 7 ? Number(proj.slip) : null;
    return {
      lead: `${movedLead} ${proj.projectedLabel} at this pace.`,
      sub: slip ? `${sub} · +${slip}D THIS WK` : sub,
      tone: slip ? 'warn' : 'good',
    };
  }
  if (st === 'stalled') return { lead: `${movedLead} Pace has flattened.`, sub, tone: 'bad' };
  if (st === 'far') return { lead: `${movedLead} Over a year at this pace.`, sub, tone: 'warn' };
  if (st === 'stale') return { lead: `${movedLead} Log a weigh-in to update the read.`, sub, tone: 'warn' };
  if (moved <= 0) return { lead: `The terms are set. ${fmt(toGo)} ${unit} to go.`, sub, tone: 'neutral' };
  return { lead: `${movedLead} ${fmt(toGo)} to go.`, sub, tone: 'neutral' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/goal-contract.test.mjs` → all pass. If a string mismatches, fix the module (the tests are the contract).

- [ ] **Step 5: Register in `package.json` + full suite**

In the root `package.json` `"test"` script, append ` tests/goal-contract.test.mjs` to the existing `node --test` file list (match the exact style already there). Run `npm test` → everything green.

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/goalContract.mjs tests/goal-contract.test.mjs package.json
git add mobile-app/src/services/goalContract.mjs tests/goal-contract.test.mjs package.json
git commit -m "feat(goals): goalContract.mjs verdict module + tests"
```

### Task A2: Ledger primitives + shell rework + THE READ / THE TERMS

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSClientGoals` (grep `function BSClientGoals`), `BSGoalsOverall` (grep `function BSGoalsOverall`).

**Interfaces:**
- Consumes: `bsGoalVerdict` (Task A1, imported at the top of the file next to the other `../services/` imports); existing `BSTLedgerStat`, `BSTRedact`, `BSSdCountUp`, `useBSSdInView`, `bsSdReduced`, `bsMyTierColor`, `bsTHexA` (all module-scope — grep to confirm signatures before use).
- Produces (module scope, reused by Tasks A3 + PR B): 

```jsx
// ── Open Ledger primitives for the Contract/Meter wave ──
// Station head: heat tick + mono eyebrow (+ optional right meta or action).
function BSOLHead({ heat, label, right = null, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: `24px ${t.padX}px 0` }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>
        <span aria-hidden style={{ width: 8, height: 2, background: heat, display: 'inline-block' }} />{label}
      </span>
      {right}
    </div>
  );
}
// Ink text action with a 2px heat underline (the Standing's grammar). ≥44px target.
function BSOLAct({ heat, label, onClick, t }) {
  return (
    <button onClick={onClick} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 0', minHeight: 44, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: 0 }}>
      <span style={{ borderBottom: `2px solid ${heat}`, paddingBottom: 2 }}>{label}</span>
    </button>
  );
}
// Dot-leader row: glyph · text · leader dots · right meta. Button when onPress.
function BSOLRow({ glyph = null, glyphColor, text, textColor, sub = null, meta = null, metaColor, onPress = null, t }) {
  const inner = (
    <>
      {glyph != null && <span style={{ flexShrink: 0, width: 16, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: glyphColor || t.INK50 }}>{glyph}</span>}
      <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', color: textColor || t.INK }}>
        {text}
        {sub && <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>{sub}</span>}
      </span>
      <span aria-hidden style={{ flex: 1, minWidth: 14, borderBottom: `1px dotted ${bsTHexA(t.INK, 0.28)}`, transform: 'translateY(-4px)' }} />
      {meta != null && <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: metaColor || t.INK50 }}>{meta}</span>}
    </>
  );
  const style = { display: 'flex', alignItems: 'baseline', gap: 9, padding: '12px 0', minHeight: 44, boxSizing: 'border-box', width: '100%', textAlign: 'left' };
  return onPress
    ? <button onClick={onPress} style={{ ...style, background: 'transparent', border: 0, cursor: 'pointer' }}>{inner}</button>
    : <div style={style}>{inner}</div>;
}
// Press credit: 3px role spine + serif title + mono credit line.
function BSOLCredit({ spine, title, credit, t }) {
  return (
    <div style={{ borderLeft: `3px solid ${spine}`, padding: '3px 0 3px 11px', margin: '10px 0 0' }}>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{title}</div>
      <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{credit}</div>
    </div>
  );
}
```

  (Insert these directly above `function BSGoalsOverall`. Grep first: `grep -n "BSOLHead\|BSOLAct\|BSOLRow\|BSOLCredit" mobile-app/src/broadsheet/*.jsx` must return nothing.)

- [ ] **Step 1: Shell — kill the tab machinery, add heat + anchors**

In `BSClientGoals` (~L17035):
- Add `const heat = bsMyTierColor();` next to the existing `teal` const.
- Delete the `const [tab, setTab] = useStateBSC('overall')` state, the `ACCENT`/`accent`/`headInfo` per-tab derivations, the tab rail block (the `grid gridTemplateColumns:'1fr 1fr 1fr'` segment ~L17183–17192), and the per-tab goal-card IIFE block (~L17196–17216).
- Header keeps its structure; retint: eyebrow = `` `Your goal${byLabel ? ` · By ${byLabel}` : ''}` `` colored `heat`; h1 = the primary goal words (`data.primaryGoal || overall.title || 'Your goal'`) with the existing last-word-italic split, italic word colored `heat`; add an `EDIT` `BSOLAct` beside the eyebrow row opening `setEditPrimary(true)`.
- Add refs + the anchor index directly under the header:

```jsx
const refRead = React.useRef(null), refTrain = React.useRef(null), refNutr = React.useRef(null), refWeek = React.useRef(null);
const jump = (r) => { try { r.current?.scrollIntoView({ behavior: bsSdReduced() ? 'auto' : 'smooth', block: 'start' }); } catch (e) {} };
```

```jsx
{/* Anchor index — replaces the tab views; items scroll, nothing is hidden. */}
<div style={{ padding: `14px ${t.padX}px 0`, display: 'flex', gap: 18, borderBottom: `1px solid ${t.HAIR}` }}>
  {[['The goal', refRead], ['Training', refTrain], ['Nutrition', refNutr], ['Week', refWeek]].map(([l, r]) => (
    <button key={l} onClick={() => jump(r)} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '4px 0 12px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 }}>{l}</button>
  ))}
</div>
```

- Replace the three-way tab render (~L17218–17224) with ONE body: `<BSGoalsContract ...props (Step 2)... />`. Keep every sheet mount (`editing`/`editOverall`/`editPrimary`/`logWeigh`) and their handlers untouched. The goal-list editing state moves: `saveGoal`/`deleteGoal` operate on an explicit `listTab` state (`'training' | 'nutrition'`) set when a station's ＋ ADD / row-edit fires — replace `data[tab]` reads with `data[listTab]` (add `const [listTab, setListTab] = useStateBSC('training')`).
- Share row (~L17227+): keep the toggle + copy + handler byte-identical; drop `borderRadius/border/background` for `borderTop`/`borderBottom: 1px solid ${t.HAIR}` and vertical padding.

- [ ] **Step 2: `BSGoalsOverall` → `BSGoalsContract` — THE READ + THE TERMS**

Rename the component; new signature:

```jsx
function BSGoalsContract({ overall, data, heat, onLog, onEditTargets, onOpenProgress, onAddGoal, onEditGoal, plans, weekTargets, train, refs }) {
```

Threaded from the shell: `data` (for `trainingMeta`/`nutritionMeta`/`training`/`nutrition` lists), `heat`, `onAddGoal(tab)` → `{ setListTab(tab); setEditing('new'); }`, `onEditGoal(tab, i)` → `{ setListTab(tab); setEditing(i); }`, `train={liveTrain}`, `refs={{ read: refRead, train: refTrain, nutr: refNutr, week: refWeek }}`. Also `onEditHeadline` opening `setEditOverall(true)` (the existing headline sheet edits `trainingMeta`/`nutritionMeta` — keep whatever wiring `BSClientGoals` has today for it).

Keep ALL existing computations verbatim (`start/now/target/unit/down/range/toGo/pct/byLabel`, `wPace`, `goalProj`, `slipFlag`, `paceVal`, `etaStat`, `stats`, `milestones`, `plans`, `weekTargets`). Add:

```jsx
const verdict = bsGoalVerdict({ start, now, target, unit, proj: goalProj });
const toneColor = { good: t.GREEN, warn: t.AMBER, bad: t.RUST, neutral: t.INK }[verdict.tone] || t.INK;
const [readRef, readSeen] = useBSSdInView();
```

THE READ replaces the `BSPlate` hero block (from the `{/* Featured — down so far */}` comment through the plate close) + the `stats.map(miniCard)` grid + the Trend `SecHead`/link-card:

```jsx
<div ref={refs.read} style={{ padding: `18px ${t.padX}px 0`, scrollMarginTop: 56 }}>
  <div ref={readRef}>
    <div style={{ fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.18, color: verdict.tone === 'bad' ? t.RUST : t.INK }}>
      {verdict.lead.slice(0, -1)}<span style={{ color: heat }}>.</span>
    </div>
    <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: verdict.tone === 'neutral' ? t.INK50 : toneColor }}>{verdict.sub}</div>
    <div aria-hidden style={{ marginTop: 13, height: 2, background: `linear-gradient(90deg, ${t.INK}, ${heat} 62%, transparent)`, transformOrigin: 'left', transform: (bsSdReduced() || readSeen) ? 'none' : 'scaleX(0)', transition: 'transform .7s cubic-bezier(.2,.7,.2,1)' }} />
    <div style={{ marginTop: 14, display: 'flex' }}>
      {[
        { l: 'Current', v: now, u: unit, sub: 'latest' },
        { l: 'To go', v: toGo, u: unit, sub: `of ${range}` },
        { l: 'Pace', v: paceVal != null ? paceVal : null, u: paceVal != null ? `${unit}/wk` : '', sub: 'per week' },
        { l: etaStat.l, v: null, raw: `${etaStat.v}${etaStat.u || ''}`, rawColor: etaStat.c, sub: etaStat.sub },
      ].map((r, i) => (
        <div key={r.l} style={{ flex: 1, minWidth: 0, borderLeft: i ? `1px solid ${bsTHexA(t.INK, 0.14)}` : 0, paddingLeft: i ? 10 : 0 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{r.l}</div>
          <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: r.rawColor || t.INK, fontVariantNumeric: 'tabular-nums' }}>
            {r.raw != null ? r.raw : r.v != null ? <><BSSdCountUp value={r.v} seen={readSeen} /><span style={{ fontSize: 10, color: t.INK50, marginLeft: 2 }}>{r.u}</span></> : '—'}
          </div>
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{r.sub}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 22 }}>
      <BSOLAct heat={heat} label="Log weigh-in" onClick={onLog} t={t} />
      <BSOLAct heat={heat} label="Edit targets" onClick={onEditTargets} t={t} />
    </div>
  </div>
</div>
```

(Grep `function BSSdCountUp` first — pass props per its real signature; if it takes `(value, {seen})` differently, adapt the call, not the component.) The start→now→target strip, draggable knob, ETA chip (~L15179–15201) and `Edit targets →` (~L15202) die — their facts now live in the verdict/registers/actions.

THE TERMS replaces the Milestones `SecHead` + rows (~L15226–15239):

```jsx
<BSOLHead heat={heat} label="The terms" t={t} />
<div style={{ padding: `4px ${t.padX}px 0` }}>
  {milestones.map((m, i) => (
    <BSOLRow key={i} t={t}
      glyph={m.done ? '✓' : m.next
        ? <span aria-hidden style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: heat, animation: bsSdReduced() ? 'none' : 'bsSdPrBreath 2.4s ease-in-out infinite' }} />
        : '○'}
      glyphColor={m.done ? heat : t.INK50}
      text={m.t} textColor={m.done ? t.INK50 : t.INK}
      meta={m.next ? 'Next' : (m.when || (m.done ? 'Done' : ''))} metaColor={m.next ? heat : t.INK50} />
  ))}
</div>
```

Grep the breath keyframe name first (`grep -n "PrBreath\|bsSdBreath" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`) and use the shipped one; the milestone `next` row's text also carries `sub={m.sub}`. The no-goal case is already `milestones[0] = Set a goal` — render it through `BSTRedact` styling? No: keep the computed row + add `<BSOLAct heat={heat} label="Set the terms" onClick={onEditTargets} t={t} />` beneath when `!(range !== 0)`.

- [ ] **Step 3: Gates + commit**

Parse-check · PowerShell build · `npm test` · LF. Commit: `feat(goals): Contract shell — verdict lead, registers, terms (WIP: stations follow)`. (The old plans/weekTargets/why blocks still render below — removed next task; the page must still build clean at every commit.)

### Task A3: TRAINING / NUTRITION / THIS WEEK / WHY stations + kills

**Files:**
- Modify: `iosAppBroadsheetClient.jsx` — `BSGoalsContract` (continue), delete `BSGoalsTraining`, `BSGoalsNutrition`.

**Interfaces:** Consumes Task A2's primitives + props. No new exports.

- [ ] **Step 1: TRAINING station** (replaces the "Your plans" section for its training half + folds `BSGoalsTraining`'s goal-framing in). After THE TERMS:

```jsx
<div ref={refs.train} style={{ scrollMarginTop: 56 }}>
  <BSOLHead heat={heat} label="Training" t={t}
    right={<BSOLAct heat={heat} label="Edit" onClick={() => onEditHeadline('training')} t={t} />} />
  <div style={{ padding: `2px ${t.padX}px 0` }}>
    <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.015em', color: t.INK }}>{data.trainingMeta?.title || 'Set a training goal'}</div>
    {data.trainingMeta?.subtitle ? <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 12.5, color: t.INK50 }}>{data.trainingMeta.subtitle}</div> : null}
    {trainPlan
      ? <BSOLCredit spine={t.RUST} title={trainPlan.t} credit={`${(trainPlan.sub || '').toUpperCase()} · TRAINER`} t={t} />
      : signedIn
        ? <><BSTRedact t={t} label="No training plan yet" /><BSOLAct heat={heat} label="Find a coach →" onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openMarket', { detail: 'trainer' })); } catch (e) {} }} t={t} /></>
        : <BSOLCredit spine={t.RUST} title="12-wk lean strength" credit="JORDAN · TRAINER · 4×/WK" t={t} />}
    {(data.training || []).map((g, i) => (
      <BSOLRow key={i} t={t} text={g.title || g.t || 'Goal'} sub={g.subtitle || g.sub || null}
        meta={g.target || g.current || 'Edit'} onPress={() => onEditGoal('training', i)} />
    ))}
    {liftRows.map((l, i) => (
      <BSOLRow key={`lift-${i}`} t={t} text={l.t} meta={`${l.w} ▲ ${l.d}`} metaColor={t.INK70} />
    ))}
    <BSOLRow t={t} glyph="＋" glyphColor={heat} text="Add a training goal" onPress={() => onAddGoal('training')} />
    <BSOLRow t={t} text="The full training record" meta="→" metaColor={heat} onPress={onOpenProgress} />
  </div>
</div>
```

Where: `trainPlan = Array.isArray(plans) && plans.find(p => p.role === 'Training')` (demo fallback = the credit shown signed-out); `signedIn` = the existing gate const (already in the component's scope from `BSGoalsOverall` — keep it); `liftRows` = the top-4 lift mapping lifted verbatim from `BSGoalsTraining` (`livePrs.slice(0,4).map(...)` ~L15359, demo list only when signed-out, `[]` when `signedIn && !train`). Grep `function BSTRedact` for its real props (Terrain wave) and match them.

- [ ] **Step 2: NUTRITION station** — same anatomy: `refs.nutr`, `BSOLHead label="Nutrition"` + `Edit` → `onEditHeadline('nutrition')`; headline from `data.nutritionMeta`; credit `spine={'#d8a23a'}` from `plans.find(p => p.role === 'Nutrition')` (`… · NUTRITIONIST`); `data.nutrition` goal rows + `＋ Add a nutrition goal` (`onAddGoal('nutrition')`); leader row `The full nutrition record → onOpenProgress`. No macro grids (Progress owns them — spec kill).

- [ ] **Step 3: THIS WEEK + YOUR WHY** — replace the weekTargets `miniCard` grid + why gradient card:

```jsx
<div ref={refs.week} style={{ scrollMarginTop: 56 }}>
  <BSOLHead heat={heat} label="This week" t={t} />
  <div style={{ padding: `4px ${t.padX}px 0` }}>
    {weekTargets.map((w, i) => <BSOLRow key={i} t={t} text={w.l} sub={w.sub} meta={w.v} metaColor={t.INK} />)}
  </div>
</div>
{overall.why
  ? <><BSOLHead heat={heat} label="Your why" t={t} />
      <div style={{ padding: `6px ${t.padX}px 0`, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.5, color: t.INK }}>“{overall.why}”</div></>
  : <div style={{ padding: `6px ${t.padX}px 0` }}><BSOLAct heat={heat} label="Add your why" onClick={onEditTargets} t={t} /></div>}
```

- [ ] **Step 4: Kills sweep.** Delete: `BSGoalsTraining` + `BSGoalsNutrition` entire functions; the `miniCard` + `SecHead` locals in `BSGoalsContract`; the "Your plans" section (superseded by station credits); the `purple` const; `BSGoalsTrend` **if** `grep -c "BSGoalsTrend" iosAppBroadsheetClient.jsx` shows only its definition; every now-unused local (`series` etc. — run the parse-check, then `grep` each suspect). The duplicated projection block inside the deleted `BSGoalsNutrition` dies with it.

- [ ] **Step 5: Gates + commit** (parse · build · test · LF): `feat(goals): Training/Nutrition/Week/Why stations; kill tab bodies`.

### Task A4: Browser verification + PR A

- [ ] **Step 1:** Build for local preview (PowerShell): `$env:VITE_BASE='/'; npm run build` then `npx vite preview --base=/ --port 4183`. Drive with chrome-devtools MCP: signed-out demo → the Goals page renders ONE scroll; the 4 anchors scroll to their stations; verdict reads `4.2 kg down…` style copy; milestones show ✓/breathing-next/○; TRAINING/NUTRITION credits show rust/gold spines; reduced-motion emulation renders the rule drawn + no breathing dot. Screenshot for the PR.
- [ ] **Step 2:** Rebuild `/m/` (PowerShell `$env:VITE_BASE='/m/'`), full gates, LF, commit any fixes.
- [ ] **Step 3:** Push `claude/goals-contract`, open PR A (title `feat(goals): "The Contract" — Open Ledger goals page`), body links the spec; wait CI green + CodeRabbit, address findings, squash-merge, keep branch.

---

# PR B — Session "The Meter" + deck + previews (`claude/session-meter`)

### Task B1: `liveEffort.mjs` — effort zones (TDD)

**Files:**
- Create: `mobile-app/src/services/liveEffort.mjs`
- Test: `tests/live-effort.test.mjs`
- Modify: root `package.json` test script.

**Interfaces:**
- Produces: `bsLiveEffort({ bpm, rpe })` → `{ zone: 1–5, label: 'Z1'…'Z5', source: 'hr'|'rpe' } | null`; `BS_EFFORT_RAMP = { 1:'#34d6c5', 2:'#34d6c5', 3:'#d8b25a', 4:'#e8843c', 5:'#e0463c' }` (the Session Details `bsSdHeatColor` stops — Z1/Z2 share the cool stop so record + replay use literally the same ramp); `BS_EFFORT_HRMAX = 190`.

- [ ] **Step 1: Write the failing test**

```js
// tests/live-effort.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsLiveEffort, BS_EFFORT_RAMP, BS_EFFORT_HRMAX } from '../mobile-app/src/services/liveEffort.mjs';

test('bpm band edges (HRmax 190: 60/70/80/90% = 114/133/152/171)', () => {
  assert.equal(bsLiveEffort({ bpm: 113 }).zone, 1);
  assert.equal(bsLiveEffort({ bpm: 114 }).zone, 2);
  assert.equal(bsLiveEffort({ bpm: 133 }).zone, 3);
  assert.equal(bsLiveEffort({ bpm: 152 }).zone, 4);
  assert.equal(bsLiveEffort({ bpm: 171 }).zone, 5);
  assert.equal(bsLiveEffort({ bpm: 152 }).label, 'Z4');
  assert.equal(bsLiveEffort({ bpm: 152 }).source, 'hr');
});

test('bpm wins over rpe', () => {
  assert.equal(bsLiveEffort({ bpm: 120, rpe: 9 }).zone, 2);
});

test('rpe fallback bands', () => {
  assert.equal(bsLiveEffort({ rpe: 4 }).zone, 1);
  assert.equal(bsLiveEffort({ rpe: 5 }).zone, 2);
  assert.equal(bsLiveEffort({ rpe: 7 }).zone, 3);
  assert.equal(bsLiveEffort({ rpe: 8 }).zone, 4);
  assert.equal(bsLiveEffort({ rpe: 9 }).zone, 5);
  assert.equal(bsLiveEffort({ rpe: 8 }).source, 'rpe');
});

test('junk / nothing → null', () => {
  assert.equal(bsLiveEffort({}), null);
  assert.equal(bsLiveEffort({ bpm: 0 }), null);
  assert.equal(bsLiveEffort({ bpm: -5, rpe: 'x' }), null);
  assert.equal(bsLiveEffort({ rpe: 0 }), null);
});

test('ramp covers all five zones with the Session Details stops', () => {
  assert.equal(BS_EFFORT_RAMP[1], '#34d6c5');
  assert.equal(BS_EFFORT_RAMP[2], '#34d6c5');
  assert.equal(BS_EFFORT_RAMP[3], '#d8b25a');
  assert.equal(BS_EFFORT_RAMP[4], '#e8843c');
  assert.equal(BS_EFFORT_RAMP[5], '#e0463c');
  assert.equal(BS_EFFORT_HRMAX, 190);
});
```

- [ ] **Step 2:** `node --test tests/live-effort.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implementation**

```js
// mobile-app/src/services/liveEffort.mjs
// "The Meter" — live effort → a 5-zone read on the SAME heat ramp Session
// Details replays with (bsSdHeatColor stops; Z1/Z2 share the cool stop).
// HRmax is a documented conservative default — we never fabricate a per-user max.
export const BS_EFFORT_HRMAX = 190;
export const BS_EFFORT_RAMP = { 1: '#34d6c5', 2: '#34d6c5', 3: '#d8b25a', 4: '#e8843c', 5: '#e0463c' };

export function bsLiveEffort({ bpm, rpe } = {}) {
  const b = Number(bpm);
  if (Number.isFinite(b) && b > 0) {
    const p = b / BS_EFFORT_HRMAX;
    const zone = p < 0.6 ? 1 : p < 0.7 ? 2 : p < 0.8 ? 3 : p < 0.9 ? 4 : 5;
    return { zone, label: `Z${zone}`, source: 'hr' };
  }
  const r = Number(rpe);
  if (Number.isFinite(r) && r > 0) {
    const zone = r <= 4 ? 1 : r <= 6 ? 2 : r <= 7 ? 3 : r <= 8 ? 4 : 5;
    return { zone, label: `Z${zone}`, source: 'rpe' };
  }
  return null;
}
```

- [ ] **Step 4:** Tests pass; register in `package.json`; `npm test` green.
- [ ] **Step 5:** LF + commit `feat(session): liveEffort.mjs effort-zone module + tests`.

### Task B2: BSSession heat plumbing + zone strip + top-half serialization

**Files:** Modify `iosAppBroadsheetClient.jsx` — `BSSession` (grep `function BSSession(`), import `bsLiveEffort, BS_EFFORT_RAMP` at top.

**Interfaces:** Produces (inside `BSSession`): `const heat` — the damped page heat; `effort` — the current `{zone,label,source}|null`.

- [ ] **Step 1: Heat state.** Below the existing `hrNow`/`hrmOn` state:

```jsx
// "The Meter" — page heat tracks live effort (HR zone → last-set RPE → neutral).
// Damped: re-evaluated at most every 5s; color rides a 1.2s CSS transition.
// Reduced motion: a page that shifts color is motion → lock to the neutral accent.
const [effort, setEffort] = useStateBSC(null);
React.useEffect(() => {
  if (bsSdReduced()) return undefined;
  const tick = () => {
    const lastRpe = (() => { const done = setLogs.filter(e => e.completed && e.rpe); return done.length ? done[done.length - 1].rpe : null; })();
    setEffort(bsLiveEffort({ bpm: hrmOn ? hrNow : null, rpe: lastRpe }));
  };
  tick();
  const id = setInterval(tick, 5000);
  return () => clearInterval(id);
}, [hrmOn, hrNow, setLogs]);
const heat = (!bsSdReduced() && effort) ? BS_EFFORT_RAMP[effort.zone] : (t.isLight ? '#0a8f87' : '#34d6c5');
const heatTrans = { transition: 'color 1.2s ease, border-color 1.2s ease, background-color 1.2s ease' };
```

(Keep the existing `teal` const — the solid CTAs keep using it.) Every element retinted to `heat` in the steps below also spreads `...heatTrans`.

- [ ] **Step 2: Zone strip** — insert between the top row and the HR line, replacing the current centered HR readout block (~L20056–20066) **only in the live-HR case**; the `Connect HR monitor` pill branch stays verbatim:

```jsx
{hrmOn && hrNow ? (
  <div style={{ padding: `10px ${t.padX}px 0` }} aria-label={`${hrNow} beats per minute, zone ${effort?.zone || 1} effort`}>
    <div style={{ position: 'relative', height: 3, background: `linear-gradient(90deg, ${BS_EFFORT_RAMP[1]}, ${BS_EFFORT_RAMP[3]}, ${BS_EFFORT_RAMP[4]}, ${BS_EFFORT_RAMP[5]})` }}>
      <span aria-hidden style={{ position: 'absolute', top: -4, width: 2, height: 11, background: t.INK, left: `${Math.min(97, Math.max(1, (hrNow / 190) * 100))}%`, transition: 'left 1.2s ease' }} />
    </div>
    <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
      <span style={{ color: t.INK50 }}>Z1</span>
      <span style={{ color: heat, ...heatTrans }}>{bsFeedIcon('heart', 10, true)} {hrNow} bpm · {effort?.label || 'Z1'} effort</span>
      <span style={{ color: t.INK50 }}>Z5</span>
    </div>
  </div>
) : ( /* existing Connect pill branch, verbatim */ )}
```

- [ ] **Step 3: Top-half retints + serialization.**
  - Top row: the `Live · {fmt(elapsedSec)}` span + its dot → `color: heat` (+`heatTrans`); keep the dot's existing breath if present (grep — currently a static dot; give it the shipped breath keyframe, this is the page's one loop).
  - Progress bar under the title (~L20093–20095): replace the 4px `borderRadius:999` bar with `height: 2, background: t.HAIR` + inner `background: heat, width: pct%` (no radius).
  - Exercise eyebrow `Exercise N of M` (~L20101): `color: t.RUST` → `heat`. Title period: append `<span style={{ color: heat }}>.</span>` treatment is already `t.RUST` on the name (~L20105) → `heat`.
  - **Suggested load card → dot-leader row** (replace the whole `_bsSug` button block ~L20111–20129, keeping `onClick={_bsFillSuggestion}` + the aria-label):

```jsx
{_bsSug && (
  <div style={{ padding: `10px ${t.padX}px 0` }}>
    <button onClick={_bsFillSuggestion} aria-label={`Use suggested load ${_bsSug.load} ${_bsSug.unit}`}
      style={{ width: '100%', background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 0', minHeight: 44, textAlign: 'left' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: heat, ...heatTrans }}>Suggested</span>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{_bsSug.load} {_bsSug.unit}{_bsSug.reps != null ? ` × ${_bsSug.reps}` : ''}</span>
        <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${bsTHexA(t.INK, 0.28)}`, transform: 'translateY(-3px)' }} />
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${heat}`, paddingBottom: 2, ...heatTrans }}>Use →</span>
      </span>
      <span style={{ display: 'block', marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', color: t.INK50 }}>{_bsSug.rationale}</span>
    </button>
  </div>
)}
```

  - **Plate math card → unboxed line** (replace the bordered card ~L20132–20144; keep `plates`/`perSide`/`plateColor` and the chips):

```jsx
{perSide && (
  <div style={{ padding: `8px ${t.padX}px 0`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
    <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>Per side ({activeLoad} lb) · bar +</span>
    {plates.length ? plates.map((p, i) => (
      <span key={i} style={{ padding: '3px 8px', borderRadius: 3, background: plateColor[p] || t.INK50, color: '#1a1410', fontFamily: t.MONO, fontSize: 10, fontWeight: 800 }}>{p}</span>
    )) : <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>bar only</span>}
  </div>
)}
```

- [ ] **Step 4: Set ledger — underline inputs.** In the set-table `cell()` (~L20157) replace the boxed input style with underline fields (keep value/onChange/placeholder/inputMode/disabled/aria-label byte-identical):

```jsx
const cell = (field, ph) => (
  <input value={ri[field] ?? ''} onChange={(e) => updateSetInput(i, field, e.target.value)} placeholder={ph} inputMode="decimal" disabled={done} aria-label={`Set ${i + 1} ${field}`}
    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: 0, borderBottom: done ? 0 : (isActive ? `1.5px solid ${heat}` : `1px dotted ${bsTHexA(t.INK, 0.3)}`), background: 'transparent', color: t.INK, padding: '12px 4px', fontFamily: t.MONO, fontSize: 12.5, textAlign: 'center', fontVariantNumeric: 'tabular-nums', opacity: done ? 0.55 : 1, borderRadius: 0, ...heatTrans }} />
);
```

  Row accents: set number + passive `✓` `teal` → `heat`; the done-toggle button border/fill `teal` → `heat` (size/handlers unchanged). `＋ Add set` (~L20171): dashed box → plain text action — `style={{ marginTop: 6, width: '100%', minHeight: 44, padding: '12px', background: 'transparent', border: 0, color: t.INK70, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}`. **Do not touch** the two solid CTAs (~L20177, L20181) or Prev/Next.

- [ ] **Step 5: Gates + commit**: `feat(session): Meter heat + zone strip + serialized top half`.

### Task B3: Rest register + queue + coach credit + review chips

**Files:** Modify `iosAppBroadsheetClient.jsx` — `BSSession` continued (rest block ~L20069–20087, queue ~L20193–20213, coach card ~L20216–20230, review block — grep `reviewFeel` render usages below the queue).

- [ ] **Step 1: Rest register** (replace the clipped INK plate; keep `restEnd/restLeft/restTotal/restAfterSet` math + both button handlers):

```jsx
{restEnd && restLeft > 0 && (
  <div style={{ margin: `12px ${t.padX}px 0` }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>
        <span aria-hidden style={{ width: 8, height: 2, background: heat, ...heatTrans }} />Rest
      </span>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Set {restAfterSet} of {move.sets} · done</span>
    </div>
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: t.DISPLAY, fontSize: 42, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(restLeft)}</span>
      <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50 }}>of {fmt(restTotal)}</span>
      {hrmOn && hrNow ? <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: heat, ...heatTrans }}>{hrNow} bpm · come down to Z2</span> : null}
    </div>
    <div aria-hidden style={{ marginTop: 10, height: 2, background: t.HAIR }}>
      <div style={{ height: 2, background: heat, width: `${Math.round(Math.max(0, Math.min(1, restLeft / restTotal)) * 100)}%`, transition: bsSdReduced() ? 'none' : 'width 1s linear, background-color 1.2s ease' }} />
    </div>
    <div style={{ marginTop: 8, display: 'flex', gap: 18, alignItems: 'center' }}>
      <button onClick={() => { setRestEnd((e) => (e || Date.now()) + 30 * 1000); setRestTotal((r) => r + 30); }} style={{ background: 'transparent', border: 0, cursor: 'pointer', minHeight: 44, padding: '10px 0', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>+30 sec</button>
      <button onClick={() => setRestEnd(null)} style={{ marginLeft: 'auto', padding: '11px 18px', clipPath: 'polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)', borderRadius: 5, background: teal, color: '#04201d', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800 }}>Skip rest →</button>
    </div>
  </div>
)}
```

  (Note the rest rule shows **time remaining draining down** — `restLeft / restTotal`.)

- [ ] **Step 2: Queue → dot-leader index.** Keep each row a `≥44px` button with `onClick={() => setMoveIdx(i)}`; replace the row styles: current row gets `borderLeft: 3px solid ${heat}` + `paddingLeft: 10` + a mono `NOW` tag (heat) after the name; others `borderLeft: '3px solid transparent'`; name serif; `{mv.sets} × {mv.reps} · 90s rest` as the `sub` line; dotted leader flex-fill between name block and the load; done rows `opacity: .5` with the leading `✓` in `heat` (no strikethrough — remove the `textDecoration` style). Kill `background: t.PAPER2`/`borderRadius`.

- [ ] **Step 3: Coach message → Wire press credit** (replace the gradient card ~L20216–20230; rust is the trainer ROLE color — not heat):

```jsx
<div style={{ padding: `18px ${t.padX}px 0` }}>
  <div style={{ borderLeft: `3px solid ${t.RUST}`, padding: '3px 0 3px 11px' }}>
    <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.45 }}>{'“' + cue + '”'}</div>
    <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>Jordan · live · coaching · 2 min</div>
  </div>
</div>
```

- [ ] **Step 4: Review block** — locate the `reviewFeel`/`reviewEffort` chip render (grep `setReviewFeel` below the queue). Keep every handler + the Share-to-community toggle + `finishSession` untouched; restyle only: chips squared (`borderRadius: 5`), selected chip = ink border + heat top tick — no fills. If the block is already squared, leave it.
- [ ] **Step 5: Gates + commit**: `feat(session): rest register, dot-leader queue, wire coach credit`.

### Task B4: Train deck hero + previews + browser drive + PR B

**Files:** Modify `iosAppBroadsheetClient.jsx` — `BSClientTrain` hero (~L3566–3593), on-deck rows (~L3649+), `BSWorkoutPreview` (grep `function BSWorkoutPreview`), `BSHomeWorkoutPreview` (grep `function BSHomeWorkoutPreview`). Deck/preview heat = `t.ACCENT` (not live).

- [ ] **Step 1: Deck hero.** Replace the `BSPlate` block with an unboxed lead (keep `data-tour="hero-train"` on the wrapper, the coach-adjust chips block verbatim, and the existing ▶ start button + Rest pill exactly as-is):

```jsx
<div data-tour="hero-train" style={{ margin: `14px ${t.padX}px 0` }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
    <span style={{ color: t.ACCENT }}>{day === bsWeekdayIdx() ? 'Today' : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][day]}{cur.timeLabel ? ` · ${cur.timeLabel}` : ''}</span>
    <span style={{ color: t.INK50 }}>Week {bsProgramWeek()} · D{day + 1}</span>
  </div>
  <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 23, lineHeight: 1.0, letterSpacing: '-0.035em', color: t.INK }}>{cur.headline}<span style={{ color: t.ACCENT }}>.</span></div>
  <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, color: t.INK70, letterSpacing: '0.06em' }}>{effMoves.length > 0 ? cur.meta : cur.copy}</div>
  {/* coach-adjust chips block — verbatim */}
  <div aria-hidden style={{ margin: '11px 0 0', height: 2, background: `linear-gradient(90deg, ${t.INK}, ${t.ACCENT} 62%, transparent)` }} />
  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ flex: 1, minWidth: 0, borderLeft: `3px solid #c0533b`, padding: '2px 0 2px 10px' }}>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 700, color: t.INK }}>Jordan Chen</div>
      <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase' }}>Coach · Trainer</div>
    </div>
    {/* existing ▶ / Rest control — verbatim */}
  </div>
</div>
```

  (If the headline already ends with a period, strip it before appending the accent period: `String(cur.headline).replace(/\.$/, '')`.) On-deck rows: convert each to the dot-leader shape (day mono · title serif · leader · tag), keeping the tap-to-jump handlers.

- [ ] **Step 2: Previews.** In BOTH preview components: read the current render, then (a) head → serif title + mono meta line (kill any boxed hero/chips); (b) the move list → dot-leader rows `n · name (serif) · leader · scheme/load (mono)` — reuse the exact `BSOLRow` primitive from PR A; (c) coach note → `BSOLCredit spine={'#c0533b'}`; (d) keep the solid teal Begin/Start CTA + every handler (`onStart`, `onMove`, `onMessage`, save button). Do not alter data derivations.
- [ ] **Step 3: Browser drive** (vite preview `--base=/`): open Train → deck hero unboxed; start a session → page runs neutral accent; inject HR in the console: `window.dispatchEvent(new CustomEvent('shape:hrm', { detail: { bpm: 160 } }))` → zone strip appears, accents shift toward `#e8843c` within ~6s; complete a set with RPE 9 and stop HR events → heat follows; `prefers-reduced-motion` emulation → static neutral accent, no strip needle motion, rest rule static. Screenshot for the PR.
- [ ] **Step 4:** Rebuild `/m/` (PowerShell), full gates, LF; commit `feat(train): serialized deck hero + preview move ledgers`.
- [ ] **Step 5:** Push `claude/session-meter`, open PR B (`feat(session): "The Meter" — Open Ledger live session + deck + previews`); **append the WORKLOG changelog entry** for the whole wave (dated, both PRs, kills + modules + on-device-pass note) in this PR; CI green + CodeRabbit addressed → squash-merge, keep branch.

---

## Self-review notes (done)

- Spec coverage: every composition item, kill, invariant, and a11y rule maps to a task step; the spec's "no new keyframes" rule is honored (breath + draw reuse shipped CSS; rest drain + heat shifts are transitions).
- Names consistent across tasks: `BSOLHead/BSOLAct/BSOLRow/BSOLCredit` (A2, reused A3 + B4), `bsGoalVerdict` (A1→A2), `bsLiveEffort`/`BS_EFFORT_RAMP` (B1→B2), `heat`/`heatTrans` (B2→B3).
- Line anchors are advisory; every task locates by grep before editing (the file shifts as tasks land).
