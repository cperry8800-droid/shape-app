# Drag-and-drop dashboard widgets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in members rearrange their website dashboard widgets — free placement, show/hide, reset — persisted per-user, on all three dashboards (client, trainer, nutritionist).

**Architecture:** One reusable `DashGrid` (`public/newdesign/dashGrid.jsx`, `window.DashGrid`) generalizes the existing `ShapeHomeCards` HTML5-drag pattern: it takes a per-role widget list `[{key,size,render}]`, renders each widget's existing JSX inside a drag/hide chrome in a full/half responsive grid, and persists the order+hidden set to `user_goals('dashboard_layout')`. Each dashboard defines its widget array and renders `<DashGrid>` in place of its hand-laid columns.

**Tech Stack:** babel-standalone JSX modules in `public/newdesign/` (loaded by the SPA shells ClientApp.html / TrainerApp.html / NutritionistApp.html), React 19 (global, no JSX imports), native HTML5 Drag API (no library), Supabase via `window.shapeDb`, node:test for pure logic.

## Global Constraints

- **No new dependencies** — native HTML5 DnD only (matches `ShapeHomeCards`, `pageShell.jsx:1089`).
- **newdesign module convention** — end each file with `Object.assign(window, { Name })`; babel-standalone evals globally so top-level consts cross files, but window-export is the convention. Shells load the file via `<script type="text/babel" src="dashGrid.jsx?v=YYYYMMDD">` BEFORE the dashboard modules that use it.
- **`?v=` cache-bust** — bump the `?v=` on EVERY HTML page that references an edited `.jsx`, or returning users keep the stale file. (`docs/WORKLOG.md` rule.)
- **Keep the look** — widgets keep their exact `dash-plate` styling, accent spines, and live data. We move existing JSX into render thunks; we do not restyle the cards. Use theme tokens (`INK`, `TEAL`, `rgba(242,237,228,…)`) for the new chrome, matching `ShapeHomeCards`.
- **Persistence shape** — `user_goals('dashboard_layout')` = `{ client:{order,hidden}, trainer:{…}, nutritionist:{…} }`. Saving one role MERGES over the others. `window.shapeDb.getUserGoals(kind)` returns the `data` doc; `saveUserGoals(kind, data)` upserts it (see `pageShell.jsx:1101-1109`).
- **Website only** — do not touch `mobile-app/`. Dashboard only — not the client *home* (`ShapeHomeCards` already covers that).

---

## Task 1: Pure layout logic + tests

**Files:**
- Create: `public/newdesign/dashboardLayout.mjs` (pure helpers, importable by the node test)
- Create: `tests/dashboard-layout.test.mjs`
- Modify: `package.json` (append the test file to the `test` script)

**Interfaces:**
- Produces:
  - `resolveLayout(saved, allKeys, defaultOrder) -> { order: string[], hidden: string[] }` — `saved` is `{order,hidden}|null`. `order` = saved order filtered to `allKeys`, then any `allKeys` missing from it appended in `defaultOrder` sequence. `hidden` = `saved.hidden ∩ allKeys` (default `[]`). Null `saved` → `{ order: defaultOrder.slice(), hidden: [] }`.
  - `moveKey(order, key, beforeKey) -> string[]` — remove `key`, insert immediately before `beforeKey`; if `beforeKey` is null/absent, push to end; moving a key onto itself is a no-op.
  - `stepKey(order, key, dir) -> string[]` — move `key` one slot earlier (`dir < 0`) or later (`dir > 0`); clamps at the ends.

- [ ] **Step 1: Write the failing test** — `tests/dashboard-layout.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayout, moveKey, stepKey } from '../public/newdesign/dashboardLayout.mjs';

const ALL = ['a', 'b', 'c', 'd'];
const DEF = ['a', 'b', 'c', 'd'];

test('null saved → default order, nothing hidden', () => {
  assert.deepEqual(resolveLayout(null, ALL, DEF), { order: ['a', 'b', 'c', 'd'], hidden: [] });
});

test('respects saved order; appends a newly-added widget in default position', () => {
  // saved knew only a,b,c (in a custom order); 'd' is new → appended
  const r = resolveLayout({ order: ['c', 'a', 'b'], hidden: [] }, ALL, DEF);
  assert.deepEqual(r.order, ['c', 'a', 'b', 'd']);
});

test('drops a removed widget from a stale saved order', () => {
  // saved references 'z' which no longer exists
  const r = resolveLayout({ order: ['b', 'z', 'a'], hidden: ['z'] }, ALL, DEF);
  assert.deepEqual(r.order, ['b', 'a', 'c', 'd']);
  assert.deepEqual(r.hidden, []); // 'z' filtered out of hidden too
});

test('hidden is intersected with existing keys', () => {
  const r = resolveLayout({ order: ['a', 'b', 'c', 'd'], hidden: ['c'] }, ALL, DEF);
  assert.deepEqual(r.hidden, ['c']);
});

test('moveKey inserts before the target; end when target absent; self is no-op', () => {
  assert.deepEqual(moveKey(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveKey(['a', 'b', 'c', 'd'], 'a', null), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'b', 'b'), ['a', 'b', 'c']);
});

test('stepKey moves one slot and clamps at the ends', () => {
  assert.deepEqual(stepKey(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(stepKey(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(stepKey(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']); // clamp
  assert.deepEqual(stepKey(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);  // clamp
});
```

- [ ] **Step 2: Run it — expect FAIL** (`cd /c/Users/cperr/shape-app && node --test tests/dashboard-layout.test.mjs` → "Cannot find module dashboardLayout.mjs")

- [ ] **Step 3: Implement** — `public/newdesign/dashboardLayout.mjs`

```js
// Pure dashboard-layout logic — the single source of truth for resolving a saved
// widget layout against the current widget set and for reordering. Mirrored inline in
// dashGrid.jsx (window.DashGrid); keep them identical.

// saved: { order:string[], hidden:string[] } | null. allKeys: the widget keys that
// exist NOW. defaultOrder: the default ordering of allKeys. Returns a layout that:
//  - keeps the saved order (filtered to existing keys),
//  - appends any new keys (in defaultOrder sequence) so a future widget shows up,
//  - drops stale keys, and intersects hidden with existing keys.
export function resolveLayout(saved, allKeys, defaultOrder) {
  const all = new Set(allKeys);
  const savedOrder = (saved && Array.isArray(saved.order)) ? saved.order.filter((k) => all.has(k)) : [];
  const seen = new Set(savedOrder);
  const order = savedOrder.slice();
  for (const k of defaultOrder) if (all.has(k) && !seen.has(k)) { order.push(k); seen.add(k); }
  const hidden = (saved && Array.isArray(saved.hidden)) ? saved.hidden.filter((k) => all.has(k)) : [];
  return { order, hidden };
}

export function moveKey(order, key, beforeKey) {
  if (key === beforeKey) return order.slice();
  const next = order.filter((k) => k !== key);
  const idx = beforeKey == null ? -1 : next.indexOf(beforeKey);
  if (idx < 0) next.push(key); else next.splice(idx, 0, key);
  return next;
}

export function stepKey(order, key, dir) {
  const i = order.indexOf(key);
  if (i < 0) return order.slice();
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= order.length) return order.slice();
  const next = order.slice();
  next.splice(i, 1);
  next.splice(j, 0, key);
  return next;
}
```

- [ ] **Step 4: Run it — expect PASS** (`node --test tests/dashboard-layout.test.mjs`)

- [ ] **Step 5: Register the test** — in `package.json`, append ` tests/dashboard-layout.test.mjs` to the end of the `"test"` script's file list (the script is an explicit list, NOT a glob).

- [ ] **Step 6: Run the full suite** — `npm test` → all pass (242 + 6 new = the new total).

- [ ] **Step 7: Commit**

```bash
git add public/newdesign/dashboardLayout.mjs tests/dashboard-layout.test.mjs package.json
git commit -m "feat(dashboard): pure widget-layout logic (resolveLayout/moveKey/stepKey) + tests"
```

---

## Task 2: `DashGrid` component

**Files:**
- Create: `public/newdesign/dashGrid.jsx` (`window.DashGrid`)
- Create (throwaway): `public/newdesign/__dashgrid_harness.html` — a standalone page mounting `DashGrid` with 5 dummy widgets, to eyeball drag/hide/reset before wiring a real dashboard. Delete in Step 6.

**Interfaces:**
- Consumes: `window.shapeDb.getUserGoals/saveUserGoals`; the pure helpers (inlined — babel-standalone can't `import`).
- Produces: `window.DashGrid` — `DashGrid({ role: 'client'|'trainer'|'nutritionist', widgets: Array<{key:string, size:'full'|'half', render:()=>node}> })`. Renders the responsive full/half grid with per-widget drag/hide/▲▼ chrome, a Hidden tray, and a Reset link.

- [ ] **Step 1: Implement** — `public/newdesign/dashGrid.jsx`

```jsx
// DashGrid — reorderable / hideable dashboard widgets. Generalizes ShapeHomeCards
// (pageShell.jsx) to arbitrary widget content + a full/half responsive grid, persisted
// per-role to user_goals('dashboard_layout'). Pure helpers are inlined (mirror of
// public/newdesign/dashboardLayout.mjs — keep identical). Website only.
const DG_INK = "#f2ede4";
const DG_MUTE = "rgba(242,237,228,0.5)";

function dgResolveLayout(saved, allKeys, defaultOrder) {
  const all = new Set(allKeys);
  const savedOrder = (saved && Array.isArray(saved.order)) ? saved.order.filter((k) => all.has(k)) : [];
  const seen = new Set(savedOrder);
  const order = savedOrder.slice();
  for (const k of defaultOrder) if (all.has(k) && !seen.has(k)) { order.push(k); seen.add(k); }
  const hidden = (saved && Array.isArray(saved.hidden)) ? saved.hidden.filter((k) => all.has(k)) : [];
  return { order, hidden };
}
function dgMoveKey(order, key, beforeKey) {
  if (key === beforeKey) return order.slice();
  const next = order.filter((k) => k !== key);
  const idx = beforeKey == null ? -1 : next.indexOf(beforeKey);
  if (idx < 0) next.push(key); else next.splice(idx, 0, key);
  return next;
}
function dgStepKey(order, key, dir) {
  const i = order.indexOf(key); if (i < 0) return order.slice();
  const j = i + (dir < 0 ? -1 : 1); if (j < 0 || j >= order.length) return order.slice();
  const next = order.slice(); next.splice(i, 1); next.splice(j, 0, key); return next;
}
function dgBtn(extra) { return { width: 26, height: 26, borderRadius: 7, border: 0, background: "transparent", color: DG_MUTE, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 800, cursor: "pointer", lineHeight: 1, ...(extra || {}) }; }

function DashGrid({ role, widgets }) {
  const defaultOrder = widgets.map((w) => w.key);
  const byKey = {}; widgets.forEach((w) => { byKey[w.key] = w; });
  const allKeys = defaultOrder;

  const [layout, setLayout] = React.useState(() => ({ order: defaultOrder.slice(), hidden: [] }));
  const [drag, setDrag] = React.useState(null);
  const [over, setOver] = React.useState(null);
  const docRef = React.useRef({}); // the whole multi-role doc, for merge-on-save

  React.useEffect(() => {
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return;
    window.shapeDb.getUserGoals("dashboard_layout").then((doc) => {
      docRef.current = doc && typeof doc === "object" ? doc : {};
      setLayout(dgResolveLayout(docRef.current[role], allKeys, defaultOrder));
    }).catch(() => {});
  }, [role]);

  const persist = (next) => {
    setLayout(next);
    try {
      docRef.current = { ...docRef.current, [role]: { order: next.order, hidden: next.hidden } };
      if (window.shapeDb && window.shapeDb.saveUserGoals) window.shapeDb.saveUserGoals("dashboard_layout", docRef.current);
    } catch (e) {}
  };

  const visible = layout.order.filter((k) => !layout.hidden.includes(k));
  const hide = (k) => persist({ order: layout.order, hidden: [...layout.hidden, k] });
  const restore = (k) => persist({ order: layout.order, hidden: layout.hidden.filter((x) => x !== k) });
  const reset = () => persist({ order: defaultOrder.slice(), hidden: [] });
  const step = (k, dir) => persist({ ...layout, order: dgStepKey(layout.order, k, dir) });
  const onDrop = (target) => {
    if (drag && drag !== target) persist({ ...layout, order: dgMoveKey(layout.order, drag, target) });
    setDrag(null); setOver(null);
  };

  const chrome = (k) => {
    const w = byKey[k];
    const span = w.size === "full" ? "1 / -1" : "auto";
    const isOver = over === k && drag && drag !== k;
    return (
      <div key={k}
        draggable
        onDragStart={() => setDrag(k)}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onDragOver={(e) => { e.preventDefault(); if (over !== k) setOver(k); }}
        onDrop={(e) => { e.preventDefault(); onDrop(k); }}
        style={{ gridColumn: span, position: "relative", opacity: drag === k ? 0.45 : 1,
          outline: isOver ? "1.5px dashed " + DG_INK : "none", outlineOffset: 3, borderRadius: 6 }}>
        {/* drag/move/hide chrome — top-right, absolutely positioned over the card corner */}
        <div style={{ position: "absolute", top: 6, right: 8, zIndex: 3, display: "inline-flex", gap: 2, alignItems: "center",
          background: "rgba(11,14,12,0.55)", borderRadius: 8, padding: "1px 3px" }}>
          <span title="Drag to move" style={{ cursor: "grab", color: DG_MUTE, fontSize: 14, padding: "0 3px" }}>⠿</span>
          <button title="Move up/left" onClick={() => step(k, -1)} style={dgBtn()}>▲</button>
          <button title="Move down/right" onClick={() => step(k, 1)} style={dgBtn()}>▼</button>
          <button title="Hide" onClick={() => hide(k)} style={dgBtn()}>×</button>
        </div>
        {w.render()}
      </div>
    );
  };

  return (
    <div>
      <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {visible.map(chrome)}
      </div>
      {(layout.hidden.length > 0 || visible.length < allKeys.length) && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {layout.hidden.length > 0 && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: DG_MUTE }}>Hidden ·</span>}
          {layout.hidden.map((k) => (
            <button key={k} onClick={() => restore(k)} title="Restore" style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.2)", background: "transparent", color: DG_MUTE, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: "pointer" }}>
              + {byKey[k] ? (byKey[k].title || k) : k}
            </button>
          ))}
          <a href="#" onClick={(e) => { e.preventDefault(); reset(); }} style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DG_MUTE, textDecoration: "none", borderBottom: "1px solid rgba(242,237,228,0.25)" }}>Reset layout</a>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DashGrid });
```

(Add a `title` field to each widget in Tasks 3–5 so the Hidden-tray chips read nicely, e.g. `{ key:'team', title:'Your Team', size:'half', render:… }`. `byKey[k].title` already reads it.)

- [ ] **Step 2: Parse-check**

Run: `node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('public/newdesign/dashGrid.jsx','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Eyeball harness** — create `public/newdesign/__dashgrid_harness.html` loading React + `dashGrid.jsx` and mounting `<DashGrid role="client" widgets={[5 dummy {key,title,size,render:()=>(<div className="dash-plate"…>)} ]} />`. Open it (or render via ReactDOMServer headlessly if no browser) and confirm: full cards span the row, half cards pair, ⠿/▲/▼/× show, hide → tray, restore + reset work. (No Supabase signed in → defaults; persistence is exercised in Task 3.)

- [ ] **Step 4: Verify build** — `npm run build` (Next typecheck/build is unaffected — `public/` is static; this just confirms nothing broke). Expected: compiles.

- [ ] **Step 5: Delete the harness** — `rm public/newdesign/__dashgrid_harness.html`.

- [ ] **Step 6: Commit**

```bash
git add public/newdesign/dashGrid.jsx
git commit -m "feat(dashboard): reusable DashGrid (drag-reorder + hide + reset + persist)"
```

---

## Task 3: Client dashboard → DashGrid

**Files:**
- Modify: `public/newdesign/dashClient.jsx` (the 2-column block, ~`:429-586`)
- Modify: `public/newdesign/ClientApp.html`, `public/newdesign/ClientDashboard.html` (load `dashGrid.jsx`; bump `dashClient.jsx?v=`)

**Interfaces:**
- Consumes: `window.DashGrid` (Task 2).

- [ ] **Step 1: Build the widget array.** In `ClientDashboardPage` (`dashClient.jsx`), just before the `return`, define a `WIDGETS` array. Each entry's `render` thunk wraps the EXACT existing card JSX (move, don't rewrite) from the current left/right columns:

```jsx
const WIDGETS = [
  { key: 'score',       title: 'Shape Score',  size: 'full', render: () => (/* move lines ~432-455: the Shape Score hero plate */) },
  { key: 'consistency', title: 'This week',    size: 'half', render: () => (/* move lines ~485-503: Weekly Consistency ring */) },
  { key: 'milestones',  title: 'Milestones',   size: 'half', render: () => (/* move lines ~505-536: Milestones plate */) },
  { key: 'workout',     title: "Tonight's Workout", size: 'full', render: () => <DashWorkoutCard workout={w} /> /* lines ~457-463 */ },
  { key: 'meals',       title: "Today's Meals",     size: 'full', render: () => <DashMealLedgerCard meals={meals} targets={targets} ledger={ledger} logged={logged} onLog={logMeal} /> /* lines ~465-476 */ },
  { key: 'team',        title: 'Your Team',    size: 'half', render: () => (/* move lines ~538-563: Your Team plate */) },
  { key: 'secondary',   title: 'Links',        size: 'half', render: () => (/* move lines ~565-585: grocery/session/membership */) },
];
```

Default order is the array order: `score, consistency, milestones, workout, meals, team, secondary` (full hero → stat pair → two big plan cards → closing pair).

- [ ] **Step 2: Replace the hand-laid grid.** Swap the `<div className="dash-cols" …>{left}{right}</div>` block (~`:429-586`) for `<DashGrid role="client" widgets={WIDGETS} />`. Leave the greeting + CTAs + the conditional check-in banner ABOVE it untouched (not reorderable).

- [ ] **Step 3: Wire `DashGrid` into the shells.** In `ClientApp.html` and `ClientDashboard.html`, add `<script type="text/babel" src="dashGrid.jsx?v=20260618"></script>` BEFORE the `dashClient.jsx` script tag, and bump `dashClient.jsx?v=…` to `?v=20260618`.

- [ ] **Step 4: Parse-check** `dashClient.jsx` (same `@babel/parser` one-liner as Task 2 Step 2). Expected `OK`.

- [ ] **Step 5: Verify live.** With a signed-in client account on the dashboard: drag a card (e.g. move Milestones above Workout) → it moves + persists; reload → order sticks; hide Your Team → goes to the tray; restore + reset work. Signed-out → default order renders, no errors. (If no browser: render `ClientDashboardPage` via ReactDOMServer to confirm no React warnings + `<DashGrid>` mounts.)

- [ ] **Step 6: Commit**

```bash
git add public/newdesign/dashClient.jsx public/newdesign/ClientApp.html public/newdesign/ClientDashboard.html public/newdesign/dashGrid.jsx
git commit -m "feat(dashboard): client dashboard widgets are drag-reorderable + hideable"
```

---

## Task 4: Trainer dashboard → DashGrid

**Files:**
- Modify: `public/newdesign/dashToday.jsx` / `public/newdesign/trainerDashboard.jsx` (`DashShell` Today body)
- Modify: `public/newdesign/TrainerApp.html` (+ any standalone trainer dashboard page) — load `dashGrid.jsx`, bump the edited `.jsx` `?v=`.

**Interfaces:**
- Consumes: `window.DashGrid`.

- [ ] **Step 1: Identify the Today sections** in `DashShell` (`trainerDashboard.jsx:172-331`) + `dashToday.jsx` `extraSections`: `schedule`, `pulse` (client triage), `kpis` (financial + practice strip), `queue` (programming queue), `wins` (client wins), `business`. Confirm exact line ranges before moving.

- [ ] **Step 2: Build the widget array** in the Today body, wrapping each section's existing JSX in a render thunk:

```jsx
const WIDGETS = [
  { key: 'schedule', title: "Today's schedule", size: 'full', render: () => (/* existing schedule section */) },
  { key: 'pulse',    title: 'Client pulse',     size: 'full', render: () => (/* existing triage feed */) },
  { key: 'kpis',     title: 'Practice',         size: 'full', render: () => (/* existing KPI strips */) },
  { key: 'queue',    title: 'Programming queue',size: 'half', render: () => (/* existing queue */) },
  { key: 'wins',     title: 'Client wins',      size: 'half', render: () => (/* existing wins */) },
  { key: 'business', title: 'Business',         size: 'half', render: () => (/* existing business */) },
];
```

- [ ] **Step 3: Render `<DashGrid role="trainer" widgets={WIDGETS} />`** in place of the hand-laid Today layout. Keep the masthead/greeting fixed above it.

- [ ] **Step 4: Shell wiring** — ensure `TrainerApp.html` loads `dashGrid.jsx` (add the tag if not already from a shared shell) and bump the edited `.jsx` `?v=`.

- [ ] **Step 5: Parse-check** the edited file(s) (`@babel/parser` one-liner). Expected `OK`.

- [ ] **Step 6: Verify** — trainer dashboard renders; drag/hide/reset work + persist under `role:'trainer'` (independent of the client layout — saving trainer must not change the client doc entry). Render via ReactDOMServer if no browser.

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(dashboard): trainer dashboard widgets are drag-reorderable + hideable"
```

---

## Task 5: Nutritionist dashboard → DashGrid

**Files:**
- Modify: `public/newdesign/dashToday.jsx` / `trainerDashboard.jsx` (the nutritionist branch of `DashShell` / `CoachDashboardPage({role:'nutritionist'})`)
- Modify: `public/newdesign/NutritionistApp.html` — load `dashGrid.jsx`, bump `?v=`.

**Interfaces:**
- Consumes: `window.DashGrid`.

- [ ] **Step 1: Widget array** (nutrition-labelled): `schedule` (consults, full), `pulse` (full), `kpis` (full), `plansDue` (half), `wins` (half), `business` (half), `roster` (half — roster health). Wrap each section's existing JSX in a render thunk, same as Task 4.

- [ ] **Step 2: Render `<DashGrid role="nutritionist" widgets={WIDGETS} />`** in place of the hand-laid layout.

- [ ] **Step 3: Shell wiring** — `NutritionistApp.html` loads `dashGrid.jsx`; bump the edited `.jsx` `?v=`.

- [ ] **Step 4: Parse-check** (`@babel/parser`). Expected `OK`.

- [ ] **Step 5: Verify** — nutritionist dashboard renders; drag/hide/reset persist under `role:'nutritionist'` (independent of client + trainer entries).

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(dashboard): nutritionist dashboard widgets are drag-reorderable + hideable"
```

---

## Task 6: Docs (WORKLOG + War Room)

**Files:**
- Modify: `docs/WORKLOG.md` (dated changelog entry)
- Modify: `src/lib/warroom.ts` (a checklist item under the dashboard/UI section)

- [ ] **Step 1:** Add a WORKLOG entry: the feature, the `DashGrid` engine, `user_goals('dashboard_layout')`, all three profiles, full/half flow, drag + hide + reset, website-only.
- [ ] **Step 2:** Add a War Room checklist item (status `done`) noting dashboard widgets are user-customizable (reorder + hide) across all three profiles, persisted per-role.
- [ ] **Step 3:** `npx tsc --noEmit` (warroom.ts is TS) → clean.
- [ ] **Step 4: Commit** `git commit -am "docs(dashboard): log draggable dashboard widgets"`, then push branch + main.

---

## Self-Review

**Spec coverage:** §2 layout (full/half flow) → Task 2 (`gridColumn: 1/-1` for full) + the per-dashboard `size` fields (Tasks 3–5). §3 interaction (drag, ▲/▼ fallback, hide tray, reset) → Task 2. §4 architecture (`DashGrid`, widget arrays, merged persist) → Tasks 2–5. §5 inventories → Tasks 3–5. §6 data model + `resolveLayout`/`moveKey` tested → Task 1. §7 phases → Tasks 2/3/4-5/6. §8 out-of-scope (no resize, website-only, dashboard-only) → respected (no mobile-app edits; no resize UI). Covered.

**Placeholder scan:** the only "(/* move lines … */)" markers are deliberate move-this-existing-JSX instructions with exact line anchors — not new logic to invent. All NEW code (pure helpers, DashGrid) is inlined in full. The coach line ranges are confirmed in Task 4 Step 1 / Task 5 Step 1 before moving (the one read-then-move the plan can't pin without the live file).

**Type consistency:** `resolveLayout(saved, allKeys, defaultOrder) -> {order,hidden}`, `moveKey(order,key,beforeKey)`, `stepKey(order,key,dir)` identical in Task 1 (`.mjs`) and Task 2 (inlined `dg*`). `DashGrid({role, widgets:[{key,size,title,render}]})` consistent across Tasks 2–5. `user_goals('dashboard_layout')` doc shape `{[role]:{order,hidden}}` consistent in Task 2 persist + the spec.
