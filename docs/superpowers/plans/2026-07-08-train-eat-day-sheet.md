# Train deck + Eat day "The Day Sheet" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish serializing the Train deck (`BSClientTrain`), the Eat day view (`BSClientEat`), and their shared chrome into the zero-box Open Ledger grammar, per `docs/superpowers/specs/2026-07-08-train-eat-day-sheet-design.md`.

**Architecture:** Presentation-only restyles inside one file — `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`. Every handler, data derivation, and demo-vs-live gate is kept byte-identical; only JSX/styles change. Two PRs from the session branch `claude/train-eat-day-sheet`: **PR A** = Tasks 1–5 (shared chrome + Train), **PR B** = Tasks 6–11 (Eat day).

**Tech Stack:** React JSX (Vite/Capacitor mobile SPA), inline styles, `useBS()` theme tokens. No TS, no new deps, no tests to add (no new logic).

## Global Constraints

- **Theme tokens only** — `t.INK/PAPER2/RULE/HAIR/ACCENT/INK50/INK70/GREEN/RUST/AMBER/BLUE/DISPLAY/MONO`; never hardcode ink/paper. Role literals allowed: trainer rust `#c0533b`, nutritionist gold `#a07a2e` (icon tint `#b8923f`).
- **No behavior change.** Handlers, props, state, analytics, `data-tour` anchors survive every edit (the `hero-eat` anchor MOVES to the new verdict wrapper — it must not be dropped).
- **Zero-box:** no new borders/tints except hairline rules, dotted leaders, 3px role spines, 2px heat fills/underlines.
- **States never color-only** — mono text names them (`NEXT`, `LOG NOW`, `EATEN`, `REST`, `SWAPPED`).
- **One loop:** the Eat next-meal breathing dot (reuse the global `bsPlatePulse` keyframe), gated on `bsSdReduced()` (defined at ~line 11306). Train has none.
- **≥44px targets** on every new button (`minHeight: 44`).
- **Dot-leader idiom** (copy exactly, from `BSIndexRow` ~16851): `borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-3px)'`.
- **Verify per task:** from repo root —
  `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"`
  then `cd mobile-app && VITE_BASE=/m/ npm run build` (exit 0) then `cd .. && npm test` (497 pass today). **Do NOT touch `public/m`** — it builds at deploy since #1470.
- **LF normalize before every commit:** `sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (the Edit tool writes CRLF on Windows).
- Line numbers below are as of `931afee5` — re-locate by the quoted code, not the number, after earlier tasks shift them.

---

### Task 1: `BSFindCoachBar` — one shared leader row, kills the door-branch duplicate

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — insert component above `function BSWeekStrip` (~3411); replace 3 call sites (~4068–4077, ~4100–4109, ~6581–6590)

**Interfaces:**
- Produces: `BSFindCoachBar({ role: 'trainer'|'nutritionist', onOpen: () => void })` — top-level function component in the same file (window-globals not needed; same-module use only).

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

- [ ] **Step 2: Replace the three call sites.** Each old block is a `<button onClick={() => goMarket('trainer')} ...>` (two trainer copies, ~4068 in the Build-door branch and ~4100 on the deck — identical 10-line blocks starting `{/* Find a trainer — marketplace deep link` or the bare button in the door branch) and one nutritionist copy (~6581, starts `{/* Find a nutritionist — marketplace deep link`). Replace the door-branch + deck buttons (button through `</button>`, including the preceding comment where present) with:

```jsx
      <BSFindCoachBar role="trainer" onOpen={() => goMarket('trainer')} />
```

and the Eat button with:

```jsx
      <BSFindCoachBar role="nutritionist" onOpen={() => goMarket('nutritionist')} />
```

- [ ] **Step 3: Verify** — run the parse-check, mobile build, `npm test` (Global Constraints). Confirm with `grep -c "Find a trainer" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` → expect `1` (only inside `BSFindCoachBar`).

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(chrome): BSFindCoachBar role leader row — one impl, kills the door-branch duplicate"
```

---

### Task 2: `BSWeekStrip` — boxes → typographic date row

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:3411-3433` (the whole `BSWeekStrip` body)

**Interfaces:**
- Consumes/Produces: signature unchanged — `BSWeekStrip({ activeIdx, onSelect, restFlags })`. Callers (Train ~4120, Eat ~6594) untouched.

- [ ] **Step 1: Replace the `return (...)` block** of `BSWeekStrip` (keep the date-derivation lines above it) with:

```jsx
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return (
    <div style={{ padding: `10px ${t.padX}px 4px`, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
      {DOWL.map((L, i) => {
        const on = i === activeIdx;
        return (
          <button key={i} onClick={() => onSelect(i)} aria-label={`${names[i]} ${dates[i]}${on ? ', selected' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minHeight: 44, padding: '5px 0 4px', background: 'transparent', border: 0, cursor: 'pointer' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', fontWeight: 700, color: on ? t.ACCENT : t.INK50 }}>{L}</span>
            <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 15, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{dates[i]}</span>
            <span aria-hidden style={{ width: 16, height: 2, background: on ? t.ACCENT : 'transparent' }} />
            <span aria-hidden style={{ width: 4, height: 3, borderRadius: 1, background: restFlags[i] ? t.GREEN : 'transparent', marginTop: 1 }} />
          </button>
        );
      })}
    </div>
  );
```

Kills: the bordered/gradient cell, the 2.5px top bar. Rest-day green dot kept; the active marker is now the 2px heat tick.

- [ ] **Step 2: Verify** — parse-check, build, tests (Global Constraints).

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(chrome): week strip boxes die — typographic date row with a heat tick"
```

---

### Task 3: `BSCoachAdjustBanner` — plate → role-spine notice

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:1151-1172`

**Interfaces:**
- Consumes/Produces: signature unchanged — `BSCoachAdjustBanner({ detail, kind })`; show/hide logic (`if (!d || !d.updatedAt) return null;`) and the `chips` derivation stay verbatim.

- [ ] **Step 1: Edit the component.** Delete `const accent = t.ACCENT;` (line ~1153). Replace the `return (<BSPlate ...>...</BSPlate>);` block with:

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

Deviation from the spec's illustrative eyebrow copy (`COACH · ADJUSTED THIS WEEK`): we keep the existing `From your coach · {date}` — it carries the real date, which is more honest.

- [ ] **Step 2: Verify** — parse-check, build, tests.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(chrome): coach-adjust banner sheds its plate — role-spine notice"
```

---

### Task 4: Train deck — h1 dup fix, squared tags, dot-leader move ledger

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — inside `BSClientTrain` (~3983–4262)

**Interfaces:** none new; all existing handlers (`setSwapIdx`, `setSession`, `setBuilder`) untouched.

- [ ] **Step 1: H1 duplication fix.** The hero headline div (~4130) currently reads:

```jsx
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 23, lineHeight: 1.0, letterSpacing: '-0.035em', color: t.INK }}>{String(cur.headline || '').replace(/\.$/, '')}<span style={{ color: t.ACCENT }}>.</span></div>
```

Replace with (renders only when the headline is non-empty AND differs from the page title):

```jsx
        {(() => {
          const _norm = (s) => String(s || '').trim().replace(/\.$/, '').toLowerCase();
          const _h = _norm(cur.headline);
          if (!_h || _h === _norm(cur.title)) return null; // page h1 already says it
          return <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 23, lineHeight: 1.0, letterSpacing: '-0.035em', color: t.INK }}>{String(cur.headline || '').replace(/\.$/, '')}<span style={{ color: t.ACCENT }}>.</span></div>;
        })()}
```

- [ ] **Step 2: Square the pills.** In the coach-adjust chips (~4136–4137) change both `borderRadius: 999` → `borderRadius: 3`. In the `Rest` tag (~4164, the `<span ...>Rest</span>` beside the press credit) change `borderRadius: 999` → `borderRadius: 3`.

- [ ] **Step 3: Move rows → dot-leader ledger.** The row button (~4177–4184) currently:

```jsx
                <button key={i} onClick={() => setSwapIdx(i)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600, marginTop: 3 }}>{r.n}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.m}{swapped && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.ACCENT, marginLeft: 7 }}>SWAPPED</span>}</div>
                    <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{r.s}</div>
                  </div>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK, fontWeight: 600, marginTop: 3 }}>{r.l}</span>
                </button>
```

Replace with (leader rides the name line; no orphaned leader when a move has no load):

```jsx
                <button key={i} onClick={() => setSwapIdx(i)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600, marginTop: 3 }}>{r.n}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.m}{swapped && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.ACCENT, marginLeft: 7 }}>SWAPPED</span>}</span>
                      {r.l ? <span aria-hidden style={{ flex: 1, borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-3px)', minWidth: 12 }} /> : null}
                    </div>
                    <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{r.s}</div>
                  </div>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK, fontWeight: 600, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{r.l}</span>
                </button>
```

- [ ] **Step 4: Kicker rename.** At ~4172: `<BSTrackHeader kicker="Workout" .../>` → `kicker="The work"` (title/action unchanged). Leave `This week / On deck` and `From Jordan / Playlists` as-is (their right values are empty — a leader would be orphaned).

- [ ] **Step 5: Verify** — parse-check, build, tests. `data-tour="hero-train"` must still be on the deck lead wrapper (`grep -n 'data-tour="hero-train"'` → 1 hit).

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(train): deck finishes The Day Sheet — h1 dup fix, squared tags, dot-leader move ledger"
```

---

### Task 5: PR A gate — drive, ship, merge

- [ ] **Step 1: Browser drive** (demo data): `cd mobile-app && npm run dev`, open the client app → Train: week strip switches days (tick follows), move rows open the swap sheet, ▶ starts the session, Build door intact when signed-in-no-plan (visual only — don't change data); Eat: the trainer/nutritionist bars render as leader rows. Reduced motion (OS setting or DevTools emulation): no animation. Check 0px horizontal overflow at 320px width.
- [ ] **Step 2: Push + PR.** `git push`, then open **PR A** `style(chrome+train): The Day Sheet — shared chrome + Train deck (spec #1620)` via the REST API (no `gh`), base `main`, head `claude/train-eat-day-sheet`.
- [ ] **Step 3: Gate.** Wait CI green (Web + Mobile + gitleaks) AND CodeRabbit review; address every finding; squash-merge; re-sync the branch to `main` (`git fetch origin main && git checkout main && git merge --ff-only origin/main && git branch -f claude/train-eat-day-sheet main && git checkout claude/train-eat-day-sheet && git push --force-with-lease`). Keep the branch.

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

(The `teal` literal dies — `t.ACCENT` is the teal. The #1610 feed-toggle grammar.)

- [ ] **Step 2: Verify** — parse-check, build, tests. Drive: tabs switch views on Eat AND render identically on Grocery/Library/Recipes.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): nutrition tabs — pills die, house underline index"
```

---

### Task 7: Eat — kcal register + macro register row

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the calorie hero + macro cards IIFE (~6598–6650)

**Interfaces:** the `num`, `coachN`, `calNow/calTgt/calLeft/calPct`, and `macros` derivations stay verbatim EXCEPT the FAT color literal.

- [ ] **Step 1: FAT color.** In the `macros` array (~6610): `c: '#8a5cf6'` → `c: t.BLUE`.

- [ ] **Step 2: Kcal bar + subline.** Replace (~6621–6626):

```jsx
              <div style={{ marginTop: 7, height: 3, borderRadius: 2, background: t.HAIR, overflow: 'hidden' }}>
                <div style={{ width: `${calPct}%`, height: '100%', background: t.ACCENT }} />
              </div>
              <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em' }}>
                <span style={{ color: t.ACCENT }}>{calLeft.toLocaleString()} kcal left · on pace</span>
              </div>
```

with (2px drawn rule; the hardcoded `· on pace` honesty bug dies):

```jsx
              <div aria-hidden style={{ marginTop: 7, height: 2, background: t.HAIR }}>
                <div style={{ width: `${calPct}%`, height: '100%', background: t.ACCENT }} />
              </div>
              <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.INK50 }}>
                {calLeft.toLocaleString()} kcal left
              </div>
```

- [ ] **Step 3: Macro tiles → register.** Replace the whole `{/* Macro cards — condensed */}` grid (~6629–6647) with:

```jsx
            {/* Macro register — unboxed: label · /target · figure · 2px line fill */}
            <div style={{ padding: `10px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {macros.map((m) => {
                const mv = num(m.v), mg = num(m.g);
                const mp = mg ? Math.min(100, (mv / mg) * 100) : 0;
                return (
                  <div key={m.l}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', color: m.c, fontWeight: 700 }}>{m.l}</span>
                      <span style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK50 }}>/ {mg}</span>
                    </div>
                    <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 17, color: t.INK, letterSpacing: '-0.035em', lineHeight: 1, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{mv}</div>
                    <div aria-hidden style={{ marginTop: 5, height: 2, background: t.HAIR }}>
                      <div style={{ width: `${mp}%`, height: '100%', background: m.c }} />
                    </div>
                  </div>
                );
              })}
            </div>
```

- [ ] **Step 4: Verify** — parse-check, build, tests. `grep -c '8a5cf6' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` on the Eat page region → this instance gone.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): kcal + macro tiles die — unboxed registers, 'on pace' honesty fix, FAT takes t.BLUE"
```

---

### Task 8: Eat — the directive plate dies → verdict lead

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the `BSPlate` block inside the `{day === bsWeekdayIdx() && ...}` IIFE (~6667–6678)

**Interfaces:** the IIFE's derivations (`nextMeal`, `done`, `loggedN`, `total`, `calLeft`) and the `setPreviewMealId(nextMeal.id)` handler stay verbatim. The `_teal` local and `c = done ? t.GREEN : _teal` stay.

- [ ] **Step 1: Replace the `return (<BSPlate ...>...</BSPlate>);`** with:

```jsx
        return (
          <div data-tour="hero-eat" style={{ margin: `14px ${t.padX}px 0` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: c }}>{done ? 'Today · eaten' : 'Today · your move'}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{loggedN}/{total} meals</span>
            </div>
            <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 21, lineHeight: 1.06, letterSpacing: '-0.03em', color: t.INK }}>{done ? 'All meals logged' : `Log ${nextMeal.title}`}<span style={{ color: c }}>.</span></div>
            <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{calLeft.toLocaleString()} kcal left{done ? ' · nice work' : (nextMeal && bsMealSchedLabel(nextMeal) ? ` · ${bsMealSchedLabel(nextMeal)}` : '')}</div>
            {!done && (
              <button onClick={() => setPreviewMealId(nextMeal.id)} style={{ marginTop: 6, minHeight: 44, padding: '10px 2px', background: 'transparent', border: 0, borderBottom: `2px solid ${c}`, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>Log it →</button>
            )}
          </div>
        );
```

**`data-tour="hero-eat"` MUST land on this wrapper** (the spotlight tour anchors to it).

- [ ] **Step 2: Verify** — parse-check, build, tests. `grep -n 'data-tour="hero-eat"'` → exactly 1 hit, on the new div.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): the last directive plate dies — serif verdict lead + heat-underline LOG IT"
```

---

### Task 9: Eat — the menu ledger (no strikethrough, breathing next dot)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the meal-list header (~6682) + row button (~6689–6696)

**Interfaces:** `effMeals`, `mealOverrides`, `setPreviewMealId`, `bsMealSchedLabel` verbatim. Reuses global `bsPlatePulse` + `bsSdReduced()`.

- [ ] **Step 1: Kicker rename.** ~6682: `kicker="Meal list"` → `kicker="The menu"` (title + Swap action unchanged).

- [ ] **Step 2: Replace the row button** (~6689–6696) with (dim done — no strikethrough; leader to the time; breathing dot + `LOG NOW` on the next meal):

```jsx
            <button key={m.id} onClick={() => setPreviewMealId(m.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}`, background: 'transparent', border: 0 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 10, color: logged ? t.ACCENT : t.INK50, fontWeight: 600, marginTop: 3 }}>{logged ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: logged ? t.INK50 : t.INK, letterSpacing: '-0.01em' }}>{m.title}{swapped && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.ACCENT, marginLeft: 7 }}>SWAPPED</span>}</span>
                  <span aria-hidden style={{ flex: 1, borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-3px)', minWidth: 12 }} />
                </div>
                <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: next ? t.ACCENT : t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>
                  {m.kcal} kcal · {m.p}P · {m.c}C · {m.f}F
                  {next && <>
                    {' · '}
                    <span aria-hidden style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 999, background: t.ACCENT, verticalAlign: 'middle', marginRight: 4, ...(bsSdReduced() ? null : { animation: 'bsPlatePulse 1.8s ease-in-out infinite' }) }} />
                    LOG NOW
                  </>}
                </div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 3, whiteSpace: 'nowrap' }}>{bsMealSchedLabel(m)}</span>
            </button>
```

- [ ] **Step 3: Verify** — parse-check, build, tests. Drive: done rows dim (no strike), next row's dot breathes (and does NOT with reduced motion).

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): the menu ledger — strikethrough dies, dot-leaders, breathing next-meal dot"
```

---

### Task 10: Eat — nutritionist card → gold press credit + THE SHOP LIST leader

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the `Your plan` header (~6732) + bordered card (~6733–6748)

**Interfaces:** `liveMealCoach`, `liveProgram`, `cur.coachLine`, `setView('grocery')` verbatim.

- [ ] **Step 1: Kicker rename.** ~6732: `kicker="Your plan"` → `kicker="The plan"` (computed title unchanged).

- [ ] **Step 2: Replace the bordered card block** (the `<div style={{ borderRadius: 12, border: ... }}>...</div>` inside the padding wrapper) with:

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

Kills: the radius-12 border, the gold avatar circle, the boxed `SHOP LIST →` button. Adds the honest-absent guard on an empty `coachLine` (live open days).

- [ ] **Step 3: Verify** — parse-check, build, tests.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(eat): nutritionist card — gold press credit + THE SHOP LIST leader"
```

---

### Task 11: PR B gate — drive, ship, merge

- [ ] **Step 1: Browser drive** (demo data): Eat Day view top-to-bottom — underline tabs switch all four views, kcal/macro registers render (all three fills), verdict lead opens the next meal's preview, menu rows open previews, Swap flow works end-to-end (incl. the nutritionist notify toast), THE SHOP LIST → opens Grocery, non-today days show no verdict lead, reduced motion kills the dot. 0px overflow at 320px.
- [ ] **Step 2: Push + PR.** **PR B** `style(eat): The Day Sheet — Eat day view (spec #1620)`, base `main`, head `claude/train-eat-day-sheet`.
- [ ] **Step 3: Gate.** CI green + CodeRabbit findings addressed → squash-merge → re-sync branch (same commands as Task 5). Keep the branch.
- [ ] **Step 4: Worklog.** Append a dated entry to `docs/WORKLOG.md` (both PR numbers, the kills list, the honesty fixes, open follow-up: owner's on-device pass across Black/Sage/Cream × done/next/rest × reduced motion). Commit + PR + merge on green (worklog-only doc PR — no CodeRabbit wait needed).
