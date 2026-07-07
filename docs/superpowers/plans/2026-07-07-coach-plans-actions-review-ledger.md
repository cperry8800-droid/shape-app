# Coach Plans "The Catalogue" + Adjust/Schedule + Client Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serialize the last five plate-era coach surfaces (Plans tab ×2 roles, Adjust, Schedule, Client/Workout Review) into the Open Ledger language, plus an honest-content fix to the nutritionist review demo queue.

**Architecture:** Presentation + demo-data only, all inside
`mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` (plus a 4-name window-export
addition in `iosAppBroadsheetClient.jsx`). New shared pros-side primitives
(`bsProTypoIndex`, `BSProCatRow`, `BSProTextAction`) implement the spec's "one
anatomy" for both Plans pages; the Adjust/Schedule furniture helpers
(`BSProActionHead/ClientMini/ActionSec`) are restyled in place so both action
pages inherit the ledger grammar from one edit. Every handler is invariant.

**Tech Stack:** React (inline-styles broadsheet), Vite/Capacitor mobile build, Node test runner (`npm test` at repo root).

**Spec:** `docs/superpowers/specs/2026-07-07-coach-plans-actions-review-ledger-design.md` — read it before starting any task.

## Global Constraints

- **Zero-box:** boxed cards/pills/gradient CTAs die; boundaries = drawn rules (ink→heat), station eyebrows w/ heat ticks, dot-leaders, whitespace.
- **Two-tier rule:** controls stay quiet rounded forms — Adjust steppers/chips/split editor, Schedule day picker + slot grid + duration segment, Review note composer, all sheets (`BSCoachDraftEditor`, the AI-draft sheet).
- **Teal = the one primary action per page** (`Apply & Send / Apply & Notify` · `Add to calendar` · the assign flow's confirm). Everything else = ink text + 2px heat underline, or mono text actions.
- **Heat:** Plans + Review = role heat `bsProHeat(t, role)` (already defined in the pros file; trainer rust / nutritionist gold). Adjust + Schedule = the client's member tier (`window.ShapeProfiles.getUserPoints` → `window.bsTierForPoints` → `window.bsTierColor`, role-heat fallback) — copy the Case File pattern at `iosAppBroadsheetPros.jsx:2847-2859` exactly.
- **Heat is line-only** on a closed list: header italic word, station ticks, ink→heat rules, action underlines, active-row spines, press-credit spines. Never a solid heat fill.
- **Active filter/index underline = page-chrome teal** (`t.isLight ? '#0a8f87' : '#34d6c5'`), per the roster's rule (`BSProRosterView:1732`); heat stays reserved for identity accents.
- **Honest-absent:** empty cases render `window.BSTRedact`-style redaction lines; demo content signed-out/unlinked-only, labeled.
- **No loops.** Entrances one-shot `window.useBSSdInView` + seen state, gated on `window.bsSdReduced()`; only shipped `bsInjectSessionDetailCss` keyframes. Reduced motion = finished state.
- **Mast row inset:** every top-of-page mast row sits in `padding: '46px ${t.padX}px 0'` (the #1574 rule — `BSPage` has no top inset).
- **≥44px targets** on every text action / row button; aria-labels name the plan/client acted on; selection via `aria-current`/`aria-pressed`, never color-only.
- **Per commit:** JSX parse-check · PowerShell mobile build exit 0 · full `npm test` (458 expected, no new files) · LF normalize (`sed -i 's/\r$//' <file>`). `public/m` is gitignored (#1470) — never commit it.
- **Base rule:** before ANY edit, `git fetch origin main && git rev-parse --short HEAD origin/main`; reset to `origin/main` if stale (AGENTS.md).

**House commands (used by every task):**

```bash
# parse-check (from mobile-app/)
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetPros.jsx','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('OK')"
# build (PowerShell, from mobile-app/)
$env:VITE_BASE='/m/'; npm run build
# tests (repo root)
npm test
```

---

# PR A — Plans "The Catalogue" (branch `claude/coach-plans-catalogue`, off origin/main)

### Task 1: Window-expose the OL primitives + add the shared Catalogue primitives

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:19175` (the `Object.assign(window, {...})` export block containing `BSTStationHead,`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` (insert new helpers directly ABOVE `function bsProMastRow` at line 1989)

**Interfaces:**
- Consumes: `window.BSOLHead/BSOLAct/BSOLRow/BSOLCredit` (defined in the client module at `iosAppBroadsheetClient.jsx:15003-15040`, shipped by #1573), `bsProHeat`, `useBS`.
- Produces (later tasks rely on these exact signatures):
  - `bsProTypoIndex(t, items, activeKey, onPick, { ariaLabel })` → JSX. `items = [[key, label], …]`.
  - `BSProCatRow({ index, name, meta, price, onOpen, onAssign, heat, t })` → dot-leader catalogue row.
  - `BSProTextAction({ label, onClick, heat, t, mono })` → ≥44px text action (heat underline; `mono:true` = plain mono, no underline).

- [ ] **Step 1: Expose the OL primitives on window (client module).**

In `iosAppBroadsheetClient.jsx`, find the export block line `  BSTStationHead,` (line 19175) and add four names beside it:

```js
  BSTStationHead,
  BSOLHead, BSOLAct, BSOLRow, BSOLCredit,
```

- [ ] **Step 2: Add the shared Catalogue primitives (pros module).**

Insert ABOVE `function bsProMastRow(withCorners = true) {` (line 1989):

```jsx
// ── Open Ledger catalogue primitives (Plans tab, both roles — spec §1) ──
// Typographic index: mono 9.5/800 items, active = ink + 2px page-teal
// underline (the roster's filter-index grammar, BSProRosterView §B.3).
function bsProTypoIndex(t, items, activeKey, onPick, { ariaLabel = 'Sections' } = {}) {
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  return (
    <div role="tablist" aria-label={ariaLabel} className="bs-hide-scroll" style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${t.INK}12`, overflowX: 'auto' }}>
      {items.map(([k, l]) => {
        const on = activeKey === k;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onPick(k)} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, borderBottom: on ? `2px solid ${teal}` : '2px solid transparent', cursor: 'pointer', padding: '0 1px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: on ? t.INK : t.INK50, whiteSpace: 'nowrap' }}>{l}</button>
        );
      })}
    </div>
  );
}
// Dot-leader catalogue row: mono index · serif name · leader · mono price ·
// ASSIGN heat-underlined action; meta subline. Row tap = onOpen.
function BSProCatRow({ index, name, meta, price, onOpen, onAssign, heat, t }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 12, alignItems: 'center', minHeight: 52, padding: '13px 0', borderTop: `1px solid ${t.INK}12` }}>
      <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK50 }}>{String(index + 1).padStart(2, '0')}</span>
      <button type="button" onClick={onOpen} aria-label={`Open ${name}`} style={{ minWidth: 0, textAlign: 'left', background: 'transparent', border: 0, cursor: onOpen ? 'pointer' : 'default', padding: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span aria-hidden style={{ flex: 1, minWidth: 18, borderBottom: `1px dotted ${t.INK}4d`, transform: 'translateY(-3px)' }} />
          {price && <span style={{ fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.04em', color: t.INK, whiteSpace: 'nowrap' }}>{String(price).toUpperCase()}</span>}
        </span>
        {meta && <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{meta}</span>}
      </button>
      {onAssign && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAssign(); }} aria-label={`Assign ${name} to a client`} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: t.INK, padding: '0 2px' }}>
          <span style={{ borderBottom: `2px solid ${heat}`, paddingBottom: 2 }}>ASSIGN</span>
        </button>
      )}
    </div>
  );
}
// Text action: ink + heat underline (mono:false) or plain mono (mono:true).
function BSProTextAction({ label, onClick, heat, t, mono = false }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: mono ? t.INK50 : t.INK }}>
      <span style={mono ? undefined : { borderBottom: `2px solid ${heat}`, paddingBottom: 2 }}>{label}</span>
    </button>
  );
}
```

- [ ] **Step 3: Parse-check both files + build.**

Run the parse-check on BOTH edited files (swap the path for the client file) and the PowerShell build. Expected: `OK` ×2, build exit 0.

- [ ] **Step 4: LF normalize + commit.**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(pros): OL catalogue primitives + window-expose BSOL kit"
```

### Task 2: BSTrainerPrograms → "The Catalogue" (trainer)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:3824-4128` (`BSTrainerPrograms` — main render only; the `drafting` AI-sheet branch at 3921-3976 and `BSCoachDraftEditor`/`BSProAssignPage` early-returns stay untouched per the two-tier rule)

**Interfaces:**
- Consumes: `bsProTypoIndex`, `BSProCatRow`, `BSProTextAction` (Task 1), `bsProMastRow()`, `bsProHeat(t,'trainer')`, `window.BSTStationHead`, `window.BSTRedact`, `window.useBSSdInView`, `window.bsSdReduced`.
- Produces: nothing consumed later; all handlers (`openDraft`, `duplicate`, `share`, `cycleSort`, `setAssignPlan`, `setTab`, `setLibTab`, `flash`) invariant.

- [ ] **Step 1: Header.** Replace the `BSPageHeader` block (lines 4007-4012) with the ledger header. `heat = bsProHeat(t, 'trainer')` declared beside the existing `teal` const (line 3826):

```jsx
{/* §1.1 Header — mast row (46px inset, #1574 rule) + THE CATALOGUE eyebrow
    + serif "Your programs." (heat italic). */}
<div style={{ padding: `46px ${t.padX}px 0` }}>{bsProMastRow()}</div>
<div style={{ padding: `10px ${t.padX}px 0` }}>
  <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
    THE CATALOGUE <span style={{ color: `${t.INK}80` }}>· 4 PUBLISHED · 1 DRAFT</span>
  </div>
  <div data-tour="hero-plans" style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', color: t.INK, lineHeight: 1.05 }}>
    Your <i style={{ color: heat, fontStyle: 'italic' }}>programs.</i>
  </div>
</div>
```

Note: `data-tour="hero-plans"` MOVES here from the old AI card (line 4025) so the app tour keeps its anchor. Keep the search/avatar corners by passing the old `trailing` cluster into `bsProMastRow()`'s slot — `bsProMastRow()` already renders `BSSearchCorner + BSProAvatarButton`, so the old trailing block is simply dropped.

- [ ] **Step 2: LIBRARY/SOUNDTRACKS + kind sub-tabs → typographic indexes.** Replace the TABS pill row (4016-4021) with `{bsProTypoIndex(t, TABS, tab, setTab, { ariaLabel: 'Library or soundtracks' })}` inside `margin: '14px ${t.padX}px 0'`; replace the LIB_TABS pill row (4035-4040) with `{bsProTypoIndex(t, LIB_TABS, libTab, setLibTab, { ariaLabel: 'Catalogue kind' })}`.

- [ ] **Step 3: Create actions.** Replace the AI gradient card (4024-4032) + the boxed BUILD pill (4033) with:

```jsx
<div style={{ marginTop: 6 }}>
  <BSProTextAction heat={heat} t={t} label={`✦ Draft a ${BUILD_LABEL[libBuild]} in seconds →`} onClick={() => openDraft(libBuild)} />
  <BSProTextAction mono heat={heat} t={t} label="＋ Build from scratch" onClick={() => openDraft(libBuild, true)} />
</div>
```

- [ ] **Step 4: Catalogue + list rows.** Retire `numRow` + the boxed `assignTrail` ASSIGN pill (3978-3987, 3998-4003): every `numRow(...)` call site becomes a `BSProCatRow` (programs 4044, workouts 4083, cues 4097, routines 4117), e.g. for programs:

```jsx
<div style={{ marginTop: 2 }}>
  {programs.map((p, i) => (
    <BSProCatRow key={p.id || p.n} index={i} name={p.n} meta={p.meta} price={p.price} heat={heat} t={t}
      onOpen={() => openDraft('plan')}
      onAssign={() => setAssignPlan({ id: p.id || null, name: p.n, meta: p.meta, detail: p.detail || null })} />
  ))}
</div>
```

(cues rows pass no `price`/`onAssign`; workouts/routines pass `onAssign` exactly as the old `assignTrail` did). **Owner directive 2026-07-07:** the demo `workouts` array ADDITIONALLY gains four day-type rows — Upper Body — Hypertrophy · Lower Body — Strength · Push Day · Pull Day (content-only). `secHead(...)` calls become `window.BSTStationHead` heads (heat tick) with the SORT/NEW trailing kept as a mono text button beside the head; delete `numRow`, `assignTrail`, and `secHead` once unreferenced.

- [ ] **Step 5: Feature cards + video upload + enrolled.** TOP WORKOUT (4068-4080) and TOP PROGRAM (4102-4114) gradient cards → unboxed verdict leads: mono eyebrow (`TOP WORKOUT · 62 MIN`), serif headline with heat-italic last word (kept), mono meta, then EDIT (teal is NOT used — ink + heat underline via `BSProTextAction` in a 3-across flex row w/ `width:'auto'`, `marginRight:18`) · DUPLICATE · SHARE →. The dashed purple video-upload card (4087-4096) → `BSProTextAction mono` `＋ UPLOAD A WORKOUT VIDEO` (purple dies). Enrolled rows (4047-4062): keep the facepiles + handlers, restyle borderless — replace `borderTop: 1px solid ${t.HAIR}` with `borderTop: 1px solid ${t.INK}12`, add a dotted leader between the program name and the `{n} on it` count (the `BSProCatRow` leader pattern). Empty catalogue (`programs.length === 0`) renders `window.BSTRedact` (`label="NO PUBLISHED PLANS"`) + the build-from-scratch action.

- [ ] **Step 6: Verify.** Parse-check + PowerShell build exit 0. Then browser-drive the trainer Plans tab in vite preview: all three sub-tabs render, ASSIGN opens `BSProAssignPage`, ✦ draft opens the AI sheet, SORT cycles.

- [ ] **Step 7: LF normalize + commit** (`feat(pros): trainer Plans tab → The Catalogue (Open Ledger)`).

### Task 3: BSNutriPlans → "The Catalogue" (nutritionist)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:4576-~4900` (`BSNutriPlans` main render; the `drafting` sheet + early-returns untouched)

**Interfaces:**
- Consumes: same primitives as Task 2; `heat = bsProHeat(t, 'nutritionist')` (gold).
- Produces: nothing; handlers (`openDraft`, `duplicate`, `share`, `setAssignPlan`, `flash`) invariant.

- [ ] **Step 1: Apply the identical Task-2 transforms with the nutritionist config.** The component mirrors the trainer's anatomy (verified: same TABS/LIB_TABS/openDraft/serverPlans/enrolled structure at 4576-4648). Concretely: header eyebrow `THE CATALOGUE · 4 PUBLISHED · 40 ON IT`, serif **"Your plans."** (heat = gold italic); create actions `✦ DRAFT A MEAL PLAN IN SECONDS →` (uses `BUILD_LABEL[libBuild]` so programs/diet read right) + `＋ BUILD FROM SCRATCH`; LIB_TABS Plans/Programs/Diet → `bsProTypoIndex`; `plans` / `nutriPrograms` / `diets` / enrolled rows → `BSProCatRow` / borderless enrolled rows exactly as Task 2 Step 4-5 (repeat that code with this component's variables); any TOP-feature card in its render gets the Task-2 Step-5 verdict-lead treatment; gold heat everywhere the trainer used rust. Keep `data-tour="hero-nutrition-plans"` if present on the old AI card by moving it to the new header (grep first; if absent, skip).

- [ ] **Step 2 (owner directive 2026-07-07): Diet sub-tab gains a MEALS station.** Below the DIETS rows, add a second station head (`MEALS · SINGLE DISHES`, heat tick) over demo dot-leader rows (no ASSIGN, no price; `onOpen` = the same `openDraft(libBuild)` the diet rows use):

```js
const singleMeals = [
  { n: 'Salmon dinner plate', meta: '630 kcal · 42P · dinner' },
  { n: 'High-protein breakfast bowl', meta: '420 kcal · 32P · breakfast' },
  { n: 'Chicken + rice lunch', meta: '620 kcal · 48P · lunch' },
  { n: 'Recovery smoothie', meta: '310 kcal · 30P · snack' },
];
```

- [ ] **Step 3: Verify** — parse-check + build + browser-drive the nutritionist Plans tab (all sub-tabs incl. the two Diet stations, assign flow, AI sheet).

- [ ] **Step 4: LF normalize + commit** (`feat(pros): nutritionist Plans tab → The Catalogue (Open Ledger)`).

### Task 3b: Exercise videos — real library + per-exercise clips (owner directive)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — `BSCoachDraftEditor` (block-row render; the component already uploads via `window.ShapeCoachMedia.upload` with a sign-in guard in its media section — reuse that exact pattern) and `BSTrainerPrograms`'s WORKOUT VIDEOS station.

**Interfaces:**
- Consumes: `window.ShapeCoachMedia.upload(file)` → `{url,type,name}`; `window.ShapeCoachPlans.update(id, patch)` (PATCH `/api/coach/plans`); `serverPlans` rows (`{id,name,detail}`); Task-1 `BSProCatRow`/`BSProTextAction`; `window.BSTRedact`.
- Produces: `blocks[i].video` (string url, optional) on draft blocks — persisted untouched through both roles' `publishDraft` → `coach_plans.detail.blocks`.

- [ ] **Step 1: Per-exercise clip attach in the editor.** Each block row in `BSCoachDraftEditor` gains a trailing mono affordance: no video → `＋ CLIP` (opens a hidden `<input type="file" accept="video/*">`; on pick, upload via the component's existing ShapeCoachMedia pattern incl. the signed-out guard message; store `setBlocks(list => list.map((b,j) => j===i ? {...b, video: m.url} : b))`); has video → `▶ CLIP` (opens `b.video` in a new tab) + a small `×` clearing it. ≥44px targets, aria-labels naming the exercise. Both roles inherit (shared editor).
- [ ] **Step 2: Real WORKOUT VIDEOS station (trainer Plans, workouts sub-tab).** Signed-in (`serverPlans` non-null): rows = flattened real clips — every video-typed entry in each plan's `detail.media` plus every `detail.blocks[i].video` — rendered as `BSProCatRow` (name = media name or the block text's first words; meta = `FROM {plan.name}`; no price; `onOpen` opens the url; no ASSIGN). Zero clips → `BSTRedact` label `NO CLIPS YET` + the upload action. Signed-out keeps the demo `cues` rows. The station's action `＋ ADD A CLIP TO A WORKOUT →` = pick a plan (quiet bottom-sheet list of `serverPlans` names — portal into `#bs-phone-surface` like other sheets) → file input → `ShapeCoachMedia.upload` → `ShapeCoachPlans.update(plan.id, { detail: {...plan.detail, media:[...(plan.detail?.media||[]), m]} })` → update local `serverPlans` state + flash. Signed-out → the existing explanatory flash.
- [ ] **Step 3: Verify** — parse-check · PowerShell build exit 0 · browser-drive: editor block rows show ＋ CLIP (guard message signed-out), workouts sub-tab shows demo cues signed-out; code-review the aggregation path for null-safety (`detail` may be null).
- [ ] **Step 4: LF normalize + commit** (`feat(pros): real exercise clips — per-block attach + aggregated video library`).

### Task 4: PR A gate

- [ ] **Step 1:** Full `npm test` at repo root — expected 458 pass, 0 fail.
- [ ] **Step 2:** Reduced-motion drive: with `prefers-reduced-motion` emulated, both Plans tabs render finished states (no entrance animation).
- [ ] **Step 3:** Push branch, open **PR A** against `main` titled `feat(pros): coach Plans "The Catalogue" — Open Ledger redesign`. Body references the spec path. Wait for CI green (Web · Mobile · gitleaks); squash-merge per the standard gate; keep the branch.

---

# PR B — Adjust/Schedule heads + Review "The Queue" (branch `claude/coach-actions-review-queue`, off origin/main AFTER PR A merges — same file, sequential to avoid conflicts)

### Task 5: Action-page furniture — tier heat + press-credit + station heads (Adjust + Schedule)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:2000-2080` (`BSProActionHead`, `BSProClientMini`, `BSProActionSec`), `:2082-2300` (`BSProAdjustProgram`), `:2302-~2560` (`BSProScheduleSession`)

**Interfaces:**
- Consumes: the Case File tier-resolution pattern (2847-2859), `bsProHeat`, Task-1 primitives.
- Produces: `useBSProClientHeat(t, role, clientUid)` → hex heat color (hook, used by both action pages); `BSProActionHead({ eyebrow, titleA, titleB, accent, onBack })`, `BSProClientMini({ client, heat })`, `BSProActionSec({ eyebrow, title, accent })` keep their existing names/props (`accent` now receives the tier heat).

- [ ] **Step 1: Add the tier-heat hook** above `BSProActionHead` (line 2000):

```jsx
// Action-page heat = the CLIENT's member tier (spec §2) — same resolution the
// Case File uses (2847-2859); role heat until known / for demo rows.
function useBSProClientHeat(t, role, clientUid) {
  const [tier, setTier] = useStateBSP(null);
  useEffectBSP(() => {
    setTier(null);
    if (!clientUid || !window.ShapeProfiles?.getUserPoints) return undefined;
    let on = true;
    window.ShapeProfiles.getUserPoints([clientUid])
      .then((map) => { const pts = map && map[clientUid]; if (on && pts != null && window.bsTierForPoints) setTier(window.bsTierForPoints(pts)); })
      .catch(() => {});
    return () => { on = false; };
  }, [clientUid]);
  return tier && window.bsTierColor ? window.bsTierColor(tier) : bsProHeat(t, role);
}
```

In `BSProAdjustProgram` (2084) and `BSProScheduleSession` (2304), replace `const accent = bsProAccent(t, role);` with `const accent = useBSProClientHeat(t, role, clientUid);` (Schedule already receives `clientUid`; Adjust does too — line 2082 signature).

- [ ] **Step 2: `BSProClientMini` → press-credit row** (replace the bordered card at 2013-2026):

```jsx
function BSProClientMini({ client, heat }) {
  const t = useBS();
  if (!client) return null;
  const prog = client.prog || (client.r || '').split('·')[0].trim() || 'Program';
  return (
    <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${heat || t.INK}`, padding: '4px 0 4px 12px' }}>
      <BSFacetAvatar size={38} c={client.c} initial={client.i} name={client.n} photo={client.avatarUrl || client.avatar || undefined} showRank={false} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{client.n}</div>
        <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{prog} · Week 6 of 12</div>
      </div>
    </div>
  );
}
```

Both call sites (`<BSProClientMini client={client} />` in Adjust + Schedule) gain `heat={accent}`.

- [ ] **Step 3: `BSProActionSec` → station head.** Replace its body with the station grammar (heat tick + eyebrow + ink→heat rule), keeping the `trailing` slot:

```jsx
function BSProActionSec({ eyebrow, title, trailing, accent }) {
  const t = useBS();
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span aria-hidden style={{ width: 8, height: 2, background: accent }} />
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{eyebrow} · {title}</span>
        </span>
        {trailing}
      </div>
      <div aria-hidden style={{ marginTop: 7, height: 1, background: `linear-gradient(90deg, ${t.INK}, ${accent} 70%, transparent)` }} />
    </div>
  );
}
```

`BSProActionHead` (2000-2012) keeps its structure — its serif `titleB` italic already takes `accent`, which is now the tier heat; the `paddingTop: 46` inset stays.

- [ ] **Step 4: Schedule booking summary → register row.** Find the summary card that renders `summaryWhen` (grep `summaryWhen` in the render, below line 2361) and replace the boxed card with an eyebrow-above-figure register (DAY · TIME · LENGTH) — three columns, mono 8.5 eyebrows over `t.DISPLAY` 20/600 figures, no border/fill. The solid-teal `Add to calendar` CTA and all controls (chips/day cells/slot grid/duration segment/repeat toggle — 2346-2361+) are UNTOUCHED except: selected-state borders may swap `accent` in (they already use `accent`, which now resolves to tier heat — no edit needed).
- [ ] **Step 5: Adjust page pass.** Same furniture (head/mini/sections now inherited). The macro from-macros summary card + split bar keep their box quietly (form-adjacent) but drop any constant-teal text to ink; the auto-note textarea + Apply CTAs untouched (Apply & Send keeps solid teal).
- [ ] **Step 6: Verify** — parse-check, build, browser-drive: open a Case File → ADJUST and SCHEDULE for a demo client (role-heat fallback) and confirm the head/credit/sections render ledgered while every control still works (chips toggle, day/slot pick, steppers, Apply/Add flows fire their status text).
- [ ] **Step 7: LF + commit** (`feat(pros): Adjust + Schedule — ledger heads over quiet forms`).

### Task 6: Client/Workout Review → "The Queue"

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:135-340` (`BSWorkoutReviewPage`)

**Interfaces:**
- Consumes: `bsProHeat`, `window.BSTStationHead`, `window.BSTRedact`, Task-1 `BSProTextAction`.
- Produces: renders `selected.nutrition === true` sessions via the Task-7 nutrition body; keeps `saveNote`, `formatReviewSeconds`, the `stat()` register helper.

- [ ] **Step 1: Heat + status honesty.** Line 138: `const accent = isNutri ? t.RUST : t.AMBER;` → `const heat = bsProHeat(t, role);` (rename all `accent` reads in this component). Line 142/154/160 status strings → `'LOADING…'` / live: `'LIVE · SUPABASE SESSION LOGS'` / demo: `'DEMO QUEUE · UNTIL CLIENT SESSIONS APPEAR'` / catch: `'DEMO QUEUE · OFFLINE'` (never an instruction rendered over visible demo data).
- [ ] **Step 2: Header.** Replace the `BSMasthead` (212-219) with the ledger header: `<div style={{ padding: '46px ${t.padX}px 0' }}>{bsProMastRow(false)}</div>`, then an eyebrow row `THE QUEUE · {sessions.length} ITEMS` + `← BACK` (`BSBackButton onClick={onBack}`) + serif **"Workout review." / "Client review."** (heat italic last word) + the status string as a mono 8/0.12em `t.INK50` meta line.
- [ ] **Step 3: Queue → dot-leader rows.** Replace the tinted card list (222-247): each session = a `minHeight:52` grid row `borderLeft: session.id === selected?.id ? '3px solid ' + heat : '3px solid transparent'`, serif 15/700 title · dotted leader · mono `{count} SETS` right, mono sub `{status} · {duration}`; `aria-current` on the selected row. No fill, no radius.
- [ ] **Step 4: Detail + samples + notes.** SESSION DETAIL: `BSSection` → `window.BSTStationHead` (heat tick, label `SESSION DETAIL · {status}`); the bordered card (252) dies — the 4-up `stat()` registers render bare (they're already eyebrow-under-figure; flip to eyebrow-ABOVE-figure: eyebrow div first, figure second, drop the `borderLeft`), set rows (267-286) → dot-leader rows (name+target mono sub · leader · `SET {time} · REST {time}` mono right), hairline `t.INK}12` separators only. WATCH SAMPLES: boxed tiles (291-300) → bare registers in the same 2-col grid (eyebrow above figure, no border/fill; `pending` renders `—` + `t.INK50`). COACH NOTES: keep the 3px-heat-spine note rows; the textarea + save button stay a quiet form (button stays `t.INK` fill — it's this page's primary action, ink not teal is fine as-is; do not restyle).
- [ ] **Step 5: Verify** — parse-check, build, drive both roles' Review pages (trainer via Today → reviews entry `:932`, nutritionist via `:4462`): queue selects, detail renders, note saves locally signed-out.
- [ ] **Step 6: LF + commit** (`feat(pros): Client/Workout Review → The Queue (Open Ledger)`).

### Task 7: Nutritionist review demo content — honest nutrition shape

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:84-133` (`demoWorkoutReviewSessions`) + the Review detail render (Task 6's structure)

**Interfaces:**
- Consumes: Task 6's restyled page.
- Produces: nutritionist demo rows carry `nutrition: true` + `{ kcal, target, protein_g, protein_target_g, logged, planned, flag, meals: [{ slot, name, kcal, macros }] }`; the detail body branches on `selected.nutrition`.

- [ ] **Step 1: Replace the nutritionist branch of `demoWorkoutReviewSessions`.** Trainer branch unchanged. Nutritionist returns meal-log review days (no `workout_set_logs`, no LB loads):

```js
if (isNutri) return [
  { id: 'demo-nutritionist-day-1', nutrition: true, title: 'Tue · 4 meals logged', status: 'complete day',
    kcal: 1980, target: 2100, protein_g: 168, protein_target_g: 170, logged: 4, planned: 4, flag: null,
    meals: [
      { slot: 'Breakfast', name: 'Greek yogurt bowl', kcal: 420, macros: '32P · 44C · 12F' },
      { slot: 'Lunch', name: 'Chicken + rice plate', kcal: 620, macros: '48P · 62C · 16F' },
      { slot: 'Snack', name: 'Protein shake + banana', kcal: 310, macros: '30P · 38C · 4F' },
      { slot: 'Dinner', name: 'Salmon, potatoes, greens', kcal: 630, macros: '42P · 48C · 24F' },
    ], coach_workout_review_notes: [] },
  { id: 'demo-nutritionist-day-2', nutrition: true, title: 'Mon · 3 of 4 meals logged', status: 'gap flagged',
    kcal: 1610, target: 2100, protein_g: 128, protein_target_g: 170, logged: 3, planned: 4,
    flag: 'PROTEIN 42G UNDER · DINNER UNLOGGED',
    meals: [
      { slot: 'Breakfast', name: 'Oats + berries', kcal: 390, macros: '18P · 62C · 9F' },
      { slot: 'Lunch', name: 'Turkey wrap', kcal: 540, macros: '38P · 48C · 18F' },
      { slot: 'Snack', name: 'Cottage cheese + fruit', kcal: 280, macros: '26P · 30C · 6F' },
    ], coach_workout_review_notes: [] },
];
```

- [ ] **Step 2: Nutrition detail body.** In the detail section, branch: `selected.nutrition` → register row **KCAL · TARGET · PROTEIN · LOGGED** (`{kcal}` / `{target}` / `{protein_g}G OF {protein_target_g}G` / `{logged}/{planned}`) via the same bare `stat()` registers; a rust mono flag line when `selected.flag` (`color: '#c0533b'`, the text IS the severity name); then per-meal dot-leader rows (`{slot} · {name}` serif · leader · `{kcal} KCAL` mono right, `macros` mono sub). Queue rows for nutrition sessions show `{logged}/{planned} MEALS` instead of `{count} SETS`. The workout body renders for everything else (incl. any live rows — both roles' live fetch is unchanged). The note composer serves both bodies unchanged.
- [ ] **Step 3: Verify** — parse-check, build, drive the nutritionist Review: honest nutrition demo renders (no LB meal-prep sets anywhere), flag line rust + named, note composer saves.
- [ ] **Step 4: LF + commit** (`fix(pros): nutritionist review demo — honest nutrition shape`).

### Task 8: PR B gate

- [ ] **Step 1:** Full `npm test` (458), reduced-motion drive across Adjust/Schedule/Review.
- [ ] **Step 2:** Push, open **PR B** against `main` titled `feat(pros): Adjust/Schedule ledger heads + Review "The Queue" + nutrition demo fix`; body references the spec. CI green → squash-merge, branch kept.
- [ ] **Step 3:** Append the WORKLOG changelog entry for the wave (both PRs, spec path, kills, verification, on-device pass note) in a docs commit on PR B or a trailing docs PR.
