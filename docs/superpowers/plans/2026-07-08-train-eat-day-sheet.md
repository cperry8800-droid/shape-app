# Train deck + Eat day "The Program & The Menu" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serialize the Train deck (`BSClientTrain`), the Eat day view (`BSClientEat`), and their shared chrome into Option C — "The Program & The Menu" — per the REVISED `docs/superpowers/specs/2026-07-08-train-eat-day-sheet-design.md` (owner picked C after the visual round; kcal strip below the calendar; **no kitchen ticket**).

**Architecture:** Presentation-only restyles inside one file — `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`. Every handler, data derivation, and demo-vs-live gate is kept byte-identical; only JSX/styles change (plus one hoist of already-computed Eat derivations). Two PRs from the session branch `claude/train-eat-day-sheet`: **PR A** = Tasks 1–5 (shared chrome + Train), **PR B** = Tasks 6–10 (Eat day).

**Tech Stack:** React JSX (Vite/Capacitor mobile SPA), inline styles, `useBS()` theme tokens. No TS, no new deps, no new tests (no new logic).

## Global Constraints

- **Theme tokens only** — `t.INK/RULE/HAIR/ACCENT/INK50/INK70/GREEN/RUST/AMBER/BLUE/DISPLAY/MONO`; never hardcode ink/paper. Role literals allowed: trainer rust `#c0533b`, nutritionist gold `#a07a2e` (icon tint `#b8923f`).
- **No behavior change.** Handlers, props, state, analytics survive every edit. `data-tour="hero-train"` stays on the deck lead; `data-tour="hero-eat"` MOVES to the menu list container (the plate it rides today dies).
- **Zero-box:** no new borders/tints except hairline/course rules, dotted leaders, 3px role spines, 2px heat underlines, the 3px kcal fill rule, and the week-rule needle.
- **States never color-only** — mono text names them (`NEXT`, `✓`, `REST`, `SWAPPED`).
- **One loop:** the Eat next-course breathing dot (global `bsPlatePulse` keyframe), gated on `bsSdReduced()` (~line 11306). Train has none.
- **≥44px targets** on every new button (`minHeight: 44`).
- **Dot-leader idiom** (from `BSIndexRow` ~16851): `borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-2px)'`.
- **Verify per task:** from repo root —
  `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"`
  then `cd mobile-app && VITE_BASE=/m/ npm run build` (exit 0) then `cd .. && npm test` (497 pass today). **Do NOT touch `public/m`** — it builds at deploy since #1470.
- **LF normalize before every commit:** `sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`.
- Line numbers are as of `931afee5` — re-locate by the quoted code after earlier tasks shift them.

---

### Task 1: `BSFindCoachBar` — one shared leader row, kills the door-branch duplicate

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — insert component above `function BSWeekStrip` (~3411); replace 3 call sites (~4068–4077, ~4100–4109, ~6581–6590)

**Interfaces:**
- Produces: `BSFindCoachBar({ role: 'trainer'|'nutritionist', onOpen: () => void })` — top-level function component, same-module use only.

- [ ] **Step 1: Insert the component** directly above `function BSWeekStrip(...)`:

```jsx
// Find-a-coach leader row — the marketplace deep link pinned atop Train + Eat.
// Zero-box: 3px role spine + hairline bounds; role color rides spine/glyph/tag/
// arrow, the title stays theme ink. One shared implementation (the trainer bar
// was previously duplicated verbatim in the Build-door branch and the deck).
function BSFindCoachBar({ role, onOpen }) {
  const t = useBS();
  const trainer = role === 'trainer';
  const c = trainer ? '#c0533b' : '#a07a2e';
  const glyphC = trainer ? '#c0533b' : '#b8923f';
  return (
    <button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 9, margin: `8px ${t.padX}px 0`, width: `calc(100% - ${t.padX * 2}px)`, boxSizing: 'border-box', minHeight: 44, padding: '4px 2px 4px 10px', background: 'transparent', border: 0, borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}`, borderLeft: `3px solid ${c}`, cursor: 'pointer', textAlign: 'left' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={glyphC} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        {trainer
          ? <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
          : <><path d="M12 8c-1-2-4-2.4-5.6-.9C4 8.8 4.6 13 7 16.4c1 1.4 1.9 1.9 2.7 1.5.8-.4 1.8-.4 2.6 0 .8.4 1.7-.1 2.7-1.5 2.4-3.4 3-7.6.6-9.3C16 5.6 13 6 12 8Z" /><path d="M12 8c0-1.8 1-3.2 3-3.7" /></>}
      </svg>
      <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 13.5, color: t.INK, whiteSpace: 'nowrap' }}>{trainer ? 'Find a trainer' : 'Find a nutritionist'}</span>
      <span style={{ fontFamily: t.MONO, fontSize: 7.5, color: glyphC, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>{trainer ? 'Vetted coaches' : 'Vetted RDs'}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-2px)', minWidth: 12 }} />
      <span style={{ color: glyphC, fontSize: 14, flexShrink: 0, fontWeight: 700 }}>→</span>
    </button>
  );
}
```

- [ ] **Step 2: Replace the three call sites.** Two trainer copies (~4068 in the Build-door branch, ~4100 on the deck — identical `<button onClick={() => goMarket('trainer')} ...>` blocks incl. their comment where present) become:

```jsx
      <BSFindCoachBar role="trainer" onOpen={() => goMarket('trainer')} />
```

and the nutritionist copy (~6581, `{/* Find a nutritionist — marketplace deep link` through `</button>`) becomes:

```jsx
      <BSFindCoachBar role="nutritionist" onOpen={() => goMarket('nutritionist')} />
```

- [ ] **Step 3: Verify** — parse-check, mobile build, `npm test`. `grep -c "Find a trainer" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` → `1` (only inside `BSFindCoachBar`).

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(chrome): BSFindCoachBar role leader row — one impl, kills the door-branch duplicate"
```

---

### Task 2: `BSWeekStrip` — boxes → the calendar rule with a needle

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:3411-3433` (the whole `BSWeekStrip` body)

**Interfaces:**
- Consumes/Produces: signature unchanged — `BSWeekStrip({ activeIdx, onSelect, restFlags })`. Callers (Train ~4120, Eat ~6594) untouched.

- [ ] **Step 1: Replace the `return (...)` block** (keep the date-derivation lines above it) with:

```jsx
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return (
    <div style={{ padding: `12px ${t.padX}px 4px` }}>
      <div aria-hidden style={{ position: 'relative', height: 2, background: t.RULE, margin: '5px 2px 0' }}>
        {DOWL.map((_, i) => (
          <span key={i} style={{ position: 'absolute', left: `${((i + 0.5) * 100) / 7}%`, top: -3, width: 1.5, height: 8, background: t.RULE }} />
        ))}
        <span style={{ position: 'absolute', left: `${((activeIdx + 0.5) * 100) / 7}%`, top: -7, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${t.ACCENT}`, transform: 'translateX(-5px)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginTop: 6 }}>
        {DOWL.map((L, i) => {
          const on = i === activeIdx;
          return (
            <button key={i} onClick={() => onSelect(i)} aria-label={`${names[i]} ${dates[i]}${on ? ', selected' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 44, padding: '4px 0', background: 'transparent', border: 0, cursor: 'pointer' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', fontWeight: 700, color: on ? t.ACCENT : t.INK50 }}>{L}</span>
              <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 14, color: on ? t.INK : t.INK50, letterSpacing: '-0.03em', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{dates[i]}</span>
              <span aria-hidden style={{ width: 4, height: 3, borderRadius: 1, background: restFlags[i] ? t.GREEN : 'transparent' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
```

Kills: the bordered/gradient cells and the 2.5px top bar. The needle is the active marker; rest-day green dot kept.

- [ ] **Step 2: Verify** — parse-check, build, tests.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(chrome): week strip boxes die — calendar rule with a heat needle"
```

---

### Task 3: `BSCoachAdjustBanner` — plate → role-spine notice

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:1151-1172`

**Interfaces:**
- Consumes/Produces: signature unchanged — `BSCoachAdjustBanner({ detail, kind })`; show/hide (`if (!d || !d.updatedAt) return null;`) and the `chips` derivation stay verbatim.

- [ ] **Step 1: Edit the component.** Delete `const accent = t.ACCENT;` (~1153). Replace the `return (<BSPlate ...>...</BSPlate>);` with:

```jsx
  const roleC = kind === 'nutrition' ? '#a07a2e' : '#c0533b';
  return (
    <div style={{ margin: `12px ${t.padX}px 0`, borderLeft: `3px solid ${roleC}`, padding: '2px 0 2px 10px' }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', color: roleC, textTransform: 'uppercase' }}>From your coach{when ? ` · ${when}` : ''}</span>
      <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c, i) => <span key={i} style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: 3, padding: '4px 9px' }}>{c}</span>)}
      </div>
      {d.note ? <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 13.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.45 }}>“{d.note}”</div> : null}
    </div>
  );
```

(Keeps the real date over the spec's illustrative eyebrow copy — more honest.)

- [ ] **Step 2: Verify** — parse-check, build, tests.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(chrome): coach-adjust banner sheds its plate — role-spine notice"
```

---

### Task 4: Train deck — h1 dup fix, squared tags, the program table

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — inside `BSClientTrain` (~3983–4262)

**Interfaces:** none new; `setSwapIdx`, `setSession`, `setBuilder`, `moveOverrides` untouched.

- [ ] **Step 1: H1 duplication fix.** The hero headline div (~4130):

```jsx
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 23, lineHeight: 1.0, letterSpacing: '-0.035em', color: t.INK }}>{String(cur.headline || '').replace(/\.$/, '')}<span style={{ color: t.ACCENT }}>.</span></div>
```

becomes (renders only when non-empty AND different from the page title):

```jsx
        {(() => {
          const _norm = (s) => String(s || '').trim().replace(/\.$/, '').toLowerCase();
          const _h = _norm(cur.headline);
          if (!_h || _h === _norm(cur.title)) return null; // the page h1 already says it
          return <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 23, lineHeight: 1.0, letterSpacing: '-0.035em', color: t.INK }}>{String(cur.headline || '').replace(/\.$/, '')}<span style={{ color: t.ACCENT }}>.</span></div>;
        })()}
```

- [ ] **Step 2: Square the pills.** Coach-adjust chips (~4136–4137): both `borderRadius: 999` → `borderRadius: 3`. The `Rest` tag (~4164): `borderRadius: 999` → `borderRadius: 3`.

- [ ] **Step 3: Move list → the program table.** Replace the whole moves block — `<BSTrackHeader kicker="Workout" ...>` (~4172) plus the rows `<div style={{ padding: ... }}>{effMoves.map(...)}</div>` (~4173–4187) — with:

```jsx
          <BSTrackHeader kicker="The program" title={`${effMoves.length} moves`} actionLabel="Swap" onAction={() => setSwapIdx('pick')} />
          <div style={{ padding: `10px ${t.padX}px 0` }}>
            <div aria-hidden style={{ display: 'grid', gridTemplateColumns: '22px 1fr 92px 52px', gap: 10, padding: '0 0 7px', borderBottom: `1.5px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>
              <span>N</span><span>Move</span><span>Scheme</span><span style={{ textAlign: 'right' }}>Load</span>
            </div>
            {effMoves.map((r, i) => {
              const swapped = !!moveOverrides[`${day}:${i}`];
              // Display-only abbreviation ("3 min rest" → "3m", "90s rest" → "90s");
              // the stored scheme string is untouched (the session parser reads r.s).
              const sch = String(r.s || '').replace(/(\d+)\s*min rest/g, '$1m').replace(/(\d+)s rest/g, '$1s');
              return (
                <button key={i} onClick={() => setSwapIdx(i)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '22px 1fr 92px 52px', gap: 10, alignItems: 'baseline', minHeight: 44, padding: '12px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600 }}>{r.n}</span>
                  <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.m}{swapped && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.ACCENT, marginLeft: 7 }}>SWAPPED</span>}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.02em' }}>{sch}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.l}</span>
                </button>
              );
            })}
          </div>
```

Cardio segments (no `r.l`) leave LOAD empty — the SCHEME cell carries the segment text. Leave `This week / On deck` and `From Jordan / Playlists` untouched.

- [ ] **Step 4: Verify** — parse-check, build, tests. `grep -n 'data-tour="hero-train"'` → 1 hit, still on the lead wrapper.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(train): The Program — h1 dup fix, squared tags, columnar move register"
```

---

### Task 5: PR A gate — drive, ship, merge

- [ ] **Step 1: Browser drive** (demo data): Train — needle follows day taps, table rows open the swap sheet, ▶ starts the session, Build door intact; Eat — the coach bars render as leader rows, the calendar rule renders. Reduced motion: no animation. 0px horizontal overflow at 320px.
- [ ] **Step 2: Push + PR.** `git push`, then **PR A** `style(chrome+train): The Program & The Menu — shared chrome + Train deck (spec #1620 rev)` via the REST API, base `main`, head `claude/train-eat-day-sheet`.
- [ ] **Step 3: Gate.** CI green AND CodeRabbit findings addressed → squash-merge → re-sync (`git fetch origin main && git checkout main && git merge --ff-only origin/main && git branch -f claude/train-eat-day-sheet main && git checkout claude/train-eat-day-sheet && git push --force-with-lease`). Keep the branch.

---

### Task 6: `BSNutritionTopTabs` — pills → underline index

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:5000-5025` (whole component)

**Interfaces:**
- Consumes/Produces: signature unchanged — `BSNutritionTopTabs({ active, onChange })`. All 4 callers (eat ~6592, recipes ~5098, grocery ~21046, library ~21292) untouched and consistent.

- [ ] **Step 1: Replace the component body:**

```jsx
function BSNutritionTopTabs({ active, onChange }) {
  const t = useBS();
  const tabs = [
    ['eat', 'Day'],
    ['grocery', 'Grocery'],
    ['library', 'Library'],
    ['recipes', 'Recipes'],
  ];
  return (
    <div style={{ padding: `2px ${t.padX}px 0`, display: 'flex', gap: 18, borderBottom: `1px solid ${t.RULE}` }}>
      {tabs.map(([key, label]) => {
        const on = active === key;
        return (
          <button key={key} onClick={() => onChange(key)} aria-current={on ? 'page' : undefined} style={{ position: 'relative', minHeight: 44, padding: '12px 2px', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: on ? 800 : 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}>
            {label}
            {on && <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: t.ACCENT }} />}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify** — parse-check, build, tests. Tabs render identically on all four views.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): nutrition tabs — pills die, house underline index"
```

---

### Task 7: Eat — hoist day derivations + the kcal strip (below the calendar)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — insert hoisted consts after the `effMeals` line (~6568); replace the kcal-hero + macro-cards IIFE (~6598–6650)

**Interfaces:**
- Produces (component-scope consts consumed by Task 8): `bsEatNum(x): number`, `bsEatCalNow/bsEatCalTgt/bsEatCalLeft/bsEatCalPct: number`, `bsEatMacros: {l,v,g,c}[]`, `bsEatNextMeal: meal|null`.

- [ ] **Step 1: Hoist the derivations.** Directly after `const effMeals = cur.meals.map(...)` (~6568) insert (this is the SAME math the two IIFEs at ~6599–6606 and ~6655–6662 duplicate today — coach-set targets win; FAT takes `t.BLUE`, killing `#8a5cf6`):

```jsx
  // Day totals vs targets — hoisted once (the kcal strip and the menu's next
  // course both read them). Coach-set targets (Adjust plan → Apply) win.
  const bsEatNum = (x) => parseInt(String(x).replace(/[^0-9]/g, ''), 10) || 0;
  const bsEatCoachN = bsEatProgram.detail?.nutrition;
  const bsEatCalNow = bsEatNum(cur.totals.cal);
  const bsEatCalTgt = (bsEatCoachN && bsEatCoachN.calories != null) ? bsEatNum(bsEatCoachN.calories) : bsEatNum(cur.totals.target.cal);
  const bsEatCalLeft = Math.max(0, bsEatCalTgt - bsEatCalNow);
  const bsEatCalPct = bsEatCalTgt ? Math.min(100, Math.round((bsEatCalNow / bsEatCalTgt) * 100)) : 0;
  const bsEatMacros = [
    { l: 'PROTEIN', v: bsEatNum(cur.totals.p), g: (bsEatCoachN && bsEatCoachN.protein != null) ? bsEatNum(bsEatCoachN.protein) : bsEatNum(cur.totals.target.p), c: t.RUST },
    { l: 'CARBS', v: bsEatNum(cur.totals.c), g: (bsEatCoachN && bsEatCoachN.carbs != null) ? bsEatNum(bsEatCoachN.carbs) : bsEatNum(cur.totals.target.c), c: t.AMBER },
    { l: 'FAT', v: bsEatNum(cur.totals.f), g: (bsEatCoachN && bsEatCoachN.fat != null) ? bsEatNum(bsEatCoachN.fat) : bsEatNum(cur.totals.target.f), c: t.BLUE },
  ];
  // "Next" = explicit state, else the first un-done meal — today only.
  const bsEatNextMeal = day === bsWeekdayIdx() ? (effMeals.find(m => m.state === 'next') || effMeals.find(m => m.state !== 'done') || null) : null;
```

- [ ] **Step 2: Replace the whole kcal-hero + macro-cards IIFE** (~6598–6650, from `{(() => {` with `const num = (x) =>` through the closing `})()}` after the macro grid) with the owner-composed strip:

```jsx
      {/* Calorie register + one-line macro register (owner-composed crop) —
          sits below the calendar rule; the hardcoded "on pace" claim is gone. */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 33, lineHeight: 0.9, letterSpacing: '-0.045em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{bsEatCalNow.toLocaleString()}</span>
          <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.06em', color: t.INK50 }}>/ {bsEatCalTgt.toLocaleString()} KCAL</span>
          <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.INK50 }}>{bsEatCalPct}%</span>
        </div>
        <div aria-hidden style={{ marginTop: 7, height: 3, background: t.HAIR }}>
          <div style={{ width: `${bsEatCalPct}%`, height: '100%', background: t.ACCENT }} />
        </div>
        <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.ACCENT }}>{bsEatCalLeft.toLocaleString()} kcal left</div>
        <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>
          {bsEatMacros.map((m, i) => (
            <React.Fragment key={m.l}>
              {i > 0 && <span style={{ color: t.INK50 }}> · </span>}
              <span style={{ color: m.c, fontWeight: 700 }}>{m.l}</span> {m.v}/{m.g}
            </React.Fragment>
          ))}
        </div>
      </div>
```

- [ ] **Step 3: Verify** — parse-check, build, tests. `grep -c "8a5cf6" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` → one fewer than before (this page's instance gone).

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): macro tiles die — owner-composed kcal strip below the calendar, 'on pace' honesty fix, FAT takes t.BLUE"
```

---

### Task 8: Eat — the menu: courses by time (plate + numbered list die)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — delete the `TODAY` plate IIFE (~6652–6679, `{day === bsWeekdayIdx() && (() => { ... })()}` incl. its comment); replace the meal-list header + rows (~6681–6699)

**Interfaces:**
- Consumes: `bsEatNextMeal`, `bsEatCalLeft` (Task 7), `effMeals`, `mealOverrides`, `setPreviewMealId`, `bsMealSchedLabel`, global `bsPlatePulse` + `bsSdReduced()`.

- [ ] **Step 1: Delete the plate IIFE** — the whole `{/* TODAY — the next-meal directive ... */}` comment + `{day === bsWeekdayIdx() && (() => { ... })()}` block (~6652–6679). Its job moves into the menu below; `BSPlate` keeps its other callers.

- [ ] **Step 2: Replace the meal-list block** — `<BSTrackHeader kicker="Meal list" ...>` (~6682) and the rows `<div style={{ padding: ... }}>{effMeals.map(...)}</div>` (~6683–6699) — with:

```jsx
      {/* The menu — courses by time. The next course carries the page's one
          breathing dot + LOG IT; tapping any course opens the meal preview. */}
      <BSTrackHeader kicker="The menu" title={day === bsWeekdayIdx() ? "Today's meals" : `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day]}'s meals`} actionLabel="Swap meal" onAction={() => setSwapMealId('pick')} />
      <div data-tour="hero-eat" style={{ padding: `10px ${t.padX}px 0` }}>
        {effMeals.map((m, i) => {
          const logged = m.state === 'done';
          const isNext = !!(bsEatNextMeal && m.id === bsEatNextMeal.id);
          const swapped = !!mealOverrides[m._baseTitle];
          const timeLabel = bsMealSchedLabel(m) || m.tag || '';
          return (
            <div key={m.id} style={{ marginTop: i === 0 ? 0 : 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: isNext ? t.ACCENT : t.INK70 }}>{timeLabel}</span>
                <span aria-hidden style={{ flex: 1, height: 1.5, background: isNext ? bsTHexA(t.ACCENT, 0.45) : t.HAIR }} />
                {logged ? (
                  <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.ACCENT }}>✓</span>
                ) : isNext ? (
                  <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: t.ACCENT }}>
                    <span aria-hidden style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 999, background: t.ACCENT, verticalAlign: 'middle', marginRight: 5, ...(bsSdReduced() ? null : { animation: 'bsPlatePulse 1.8s ease-in-out infinite' }) }} />
                    NEXT
                  </span>
                ) : null}
              </div>
              <button onClick={() => setPreviewMealId(m.id)} aria-label={`${timeLabel} · ${m.title}${logged ? ' · logged' : isNext ? ' · next' : ''}`} style={{ display: 'block', width: '100%', minHeight: 44, textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0 2px' }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: logged ? t.INK50 : t.INK, letterSpacing: '-0.01em' }}>{m.title}{swapped && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.ACCENT, marginLeft: 7 }}>SWAPPED</span>}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: isNext ? t.ACCENT : t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{m.kcal} kcal · {m.p}P · {m.c}C · {m.f}F{isNext ? ` · ${bsEatCalLeft.toLocaleString()} KCAL LEFT` : ''}</div>
              </button>
              {isNext && (
                <button onClick={() => setPreviewMealId(m.id)} style={{ marginTop: 2, minHeight: 44, padding: '10px 2px', background: 'transparent', border: 0, borderBottom: `2px solid ${t.ACCENT}`, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>Log it →</button>
              )}
            </div>
          );
        })}
      </div>
```

No strikethrough anywhere; done rows dim. `data-tour="hero-eat"` now rides the menu container (stable when all courses are logged).

- [ ] **Step 3: Verify** — parse-check, build, tests. `grep -n 'data-tour="hero-eat"'` → exactly 1 hit, on the menu container.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): The Menu — courses by time; the last directive plate and the numbered list die"
```

---

### Task 9: Eat — nutritionist card → gold press credit + THE SHOP LIST leader

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the `Your plan` header (~6732) + bordered card (~6733–6748)

**Interfaces:** `liveMealCoach`, `liveProgram`, `cur.coachLine`, `setView('grocery')` verbatim.

- [ ] **Step 1: Kicker rename.** `kicker="Your plan"` → `kicker="The plan"` (computed title unchanged).

- [ ] **Step 2: Replace the bordered card** (the `<div style={{ borderRadius: 12, border: ... }}>...</div>` inside the padding wrapper) with:

```jsx
        <div style={{ borderLeft: '3px solid #a07a2e', padding: '2px 0 2px 12px' }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK }}>{liveMealCoach || 'Dr. Maya Patel'}</div>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase' }}>Nutritionist · {liveProgram ? 'This week' : 'Apr plan'}</div>
          {cur.coachLine ? <div style={{ marginTop: 9, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 16, lineHeight: 1.4, color: t.INK }}>&ldquo;{cur.coachLine}&rdquo;</div> : null}
        </div>
        <button onClick={() => setView('grocery')} style={{ marginTop: 4, width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 0', textAlign: 'left' }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>The shop list</span>
          <span aria-hidden style={{ flex: 1, borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-2px)' }} />
          <span style={{ color: t.ACCENT, fontWeight: 700, fontSize: 13 }}>→</span>
        </button>
```

Kills: the radius-12 border, the gold avatar circle, the boxed `SHOP LIST →` button. Adds the honest-absent guard on an empty `coachLine`.

- [ ] **Step 3: Verify** — parse-check, build, tests.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): nutritionist card — gold press credit + THE SHOP LIST leader"
```

---

### Task 10: PR B gate — drive, ship, merge, worklog

- [ ] **Step 1: Browser drive** (demo data): Eat Day top-to-bottom — underline tabs switch all four views, calendar rule + needle, kcal strip renders (figure/rule/left/macro line, FAT blue), courses render with ✓/NEXT states, the next course's dot breathes (and doesn't under reduced motion), LOG IT + course taps open previews, Swap flow end-to-end (incl. the nutritionist notify), THE SHOP LIST → opens Grocery, non-today days show plain courses (no NEXT). 0px overflow at 320px.
- [ ] **Step 2: Push + PR.** **PR B** `style(eat): The Menu — Eat day view (spec #1620 rev)`, base `main`, head `claude/train-eat-day-sheet`.
- [ ] **Step 3: Gate.** CI green + CodeRabbit findings addressed → squash-merge → re-sync branch (same commands as Task 5). Keep the branch.
- [ ] **Step 4: Worklog.** Append a dated entry to `docs/WORKLOG.md` (both PR numbers, the kills list, the honesty fixes, open follow-up: owner's on-device pass across Black/Sage/Cream × done/next/rest × reduced motion). Commit + PR + merge on green (worklog-only doc PR — no CodeRabbit wait needed).
