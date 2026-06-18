# Drag-and-drop dashboard widgets (design)

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Scope:** Let signed-in members rearrange their **website dashboard** widgets by drag-and-drop —
free placement, show/hide, persisted per user — on **all three** dashboards (client, trainer,
nutritionist). Website only; the mobile broadsheet is untouched.

## 1. Goal & principles

- A member can drag any dashboard card to any position, hide cards they don't want, and have it
  **stick across sessions + devices**. Always-draggable (no edit mode).
- **Reuse, don't reinvent:** extend the existing `ShapeHomeCards` drag-reorder pattern
  (`public/newdesign/pageShell.jsx`) — native HTML5 drag, a drag handle, `user_goals` persistence.
  **No new library** (none is in `package.json`; the app uses the native HTML5 Drag API).
- **Follow existing patterns:** the dashboard cards keep their `dash-plate` styling, accent spines,
  and live data wiring exactly as today — we only wrap them in a reorderable container.
- **Degrade gracefully:** signed-out / no saved layout → the default order. A widget added or removed
  in a future release reconciles automatically (never crashes on a stale saved order).

## 2. The layout model (free placement, no cramping)

Each role's dashboard becomes a **single ordered sequence** of widgets rendered into a responsive
grid, replacing today's fixed `1.45fr / 1fr` asymmetric columns:

- Each widget declares a **size**: `full` (spans the row) or `half` (pairs with the next half).
- **Big cards** = `full` (Shape Score, Workout, Meals). **Small cards** = `half` (Consistency,
  Milestones, Team, Grocery/Session). A `full` card always takes a whole row; `half` cards flow two
  per row. This is what makes "any card anywhere" look right — a big card never gets cramped into a
  narrow column.
- CSS: a 2-column grid (`grid-template-columns: 1fr 1fr`, gap 16); `full` cards use
  `grid-column: 1 / -1`. Collapses to one column at ≤1000px (matching today's `.dash-cols` breakpoint).
- The user reorders the sequence; the grid auto-reflows.

The fixed top region is **not** part of the reorderable set: the greeting + CTAs and the conditional
"Weekly check-in due" banner stay pinned above the grid (they're transient alerts/actions).

## 3. Interaction — always draggable, hide, reset

- Each card renders inside a **chrome wrapper** with, in its top-right corner: a **⠿ drag handle**
  and an **× hide** button (small, low-contrast, theme-tinted; they don't fight the card content).
- **Reorder:** native HTML5 DnD on the handle (`draggable`, `onDragStart` / `onDragOver` /
  `onDrop`) — same mechanism as `ShapeHomeCards`. Dropping a card onto another inserts it
  before/after that card; the sequence persists on drop.
- **Touch / keyboard fallback:** because HTML5 DnD is unreliable on touch, each card's chrome also
  has tiny **▲ / ▼ move** buttons (move one step earlier/later in the sequence). Same persist path.
- **Hide:** the × moves the widget into a thin **"Hidden" tray** pinned at the bottom of the grid
  ("Hidden · N — tap to restore"); tapping a chip there restores it to the end of the visible
  sequence. The tray only renders when ≥1 widget is hidden.
- **Reset:** a small **"Reset layout"** text link (next to the Hidden tray) clears the saved order +
  hidden set for the current role → back to the default order, everything visible.

## 4. Architecture — one reusable `DashGrid`

New focused file **`public/newdesign/dashGrid.jsx`** exposing `window.DashGrid` (babel-standalone
module, `Object.assign(window, { DashGrid })` per the newdesign convention). It owns ALL the
reorder/hide/persist/layout logic so each dashboard stays thin.

```
DashGrid({ role, widgets })
  role:    'client' | 'trainer' | 'nutritionist'
  widgets: Array<{ key: string, size: 'full'|'half', render: () => JSXNode }>
```

- On mount: load the saved layout via `window.shapeDb.getUserGoals('dashboard_layout')`, read
  `data[role]` → `{ order: string[], hidden: string[] }`. Resolve against the passed `widgets`
  (see §6 `resolveLayout`). Signed-out / no doc → default order, nothing hidden.
- Renders the chrome + the responsive full/half grid + the Hidden tray + Reset.
- Persists on every change (reorder / hide / restore / reset) via
  `window.shapeDb.saveUserGoals('dashboard_layout', mergedDoc)` — **merging** over the other roles'
  entries so saving the client layout never clobbers the coach layout. Best-effort (swallow errors;
  the in-memory state is the source of truth for the session).

Each dashboard defines its widget array and renders `<DashGrid role=… widgets=… />` in place of its
hand-laid column markup. The widget `render` thunks contain the **exact existing card JSX** (moved,
not rewritten), so live data + styling are unchanged.

## 5. Per-profile widget inventories

Sizes chosen so big/data-dense cards are `full` and compact stat cards are `half`.

**Client** (`dashClient.jsx`): `score` (full), `workout` (full), `meals` (full),
`consistency` (half), `milestones` (half), `team` (half), `secondary` (half — grocery/session/
membership). Default order: `score, consistency, milestones, workout, meals, team, secondary`
(a full hero, a pair of stat cards, the two big plan cards, then a closing pair) — tunable.

**Trainer** (`dashToday.jsx` via `DashShell`): the current Today sections become widgets —
`schedule` (full), `pulse` (full — client triage feed), `kpis` (full — financial+practice strip),
`queue` (half — programming queue), `wins` (half — client wins), `business` (half). Default order
mirrors today's top-to-bottom.

**Nutritionist** (`dashToday.jsx` via `DashShell`): same set, nutrition-labelled —
`schedule` (consults), `pulse`, `kpis`, `plansDue` (half), `wins` (half), `business` (half),
`roster` (half — roster health).

The exact coach widget breakdown is finalized in the plan when `DashShell` / `dashToday.jsx` are
refactored into widget lists (the bigger lift; client ships first to prove the pattern).

## 6. Data model + pure logic

**`user_goals('dashboard_layout')`** — one doc per user:
```json
{ "client":       { "order": ["score","consistency", "..."], "hidden": ["team"] },
  "trainer":      { "order": ["..."], "hidden": [] },
  "nutritionist": { "order": ["..."], "hidden": [] } }
```
No migration — `user_goals(user_id, kind, data jsonb)` already exists; this is a new `kind`.

**Pure helper (unit-tested), in `dashGrid.jsx`, mirrored as an `.mjs` for tests:**
- `resolveLayout(saved, allKeys, defaultOrder) -> { order, hidden }` — start from `saved.order`
  filtered to `allKeys` (drops removed widgets), append any `allKeys` not in it (picks up new
  widgets, in `defaultOrder` position), and `hidden = saved.hidden ∩ allKeys`. Robust to the widget
  set changing between releases.
- `moveKey(order, key, beforeKey) -> order'` — pure reorder (used by drag-drop + ▲/▼).

`tests/dashboard-layout.test.mjs` (node:test, registered in `package.json`): defaults when no doc;
a removed widget drops out; a newly-added widget appears; hidden filtering; `moveKey` edge cases
(to front, to end, no-op on self).

## 7. Build phases (each independently shippable + verifiable)

1. **DashGrid + tests** — `dashGrid.jsx` (+ the `.mjs` twin + tests). The reusable engine, with a
   trivial throwaway harness, before touching a real dashboard.
2. **Client dashboard** — refactor `dashClient.jsx`'s columns into the widget array + `<DashGrid>`.
   Ships the feature on the screenshot dashboard. `?v=` bump on the loader pages.
3. **Coach dashboards** — refactor `dashToday.jsx` / `DashShell` (`trainerDashboard.jsx`) Today
   sections into widget arrays for trainer + nutritionist. `?v=` bumps.
4. **Docs** — WORKLOG entry + War Room note.

## 8. Out of scope / deferred

- **No free resizing** — cards are `full`/`half` by type (a grid engine like react-grid-layout is
  overkill + no library).
- **Website only** — the mobile broadsheet keeps its current layout.
- **Dashboard only** — not the marketing pages or the client *home* (which already has
  `ShapeHomeCards`).
- **No cross-role copy** — each role's layout is independent.
- **Drag is desktop-first** — touch uses the ▲/▼ fallback; no fancy touch-drag library.
