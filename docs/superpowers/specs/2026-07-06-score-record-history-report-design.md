# "The Record" — detailed Shape Score history + report (mobile + website) — design

**Date:** 2026-07-06 · **Status:** owner-approved in chat (report+history · dedicated page ·
1-week default range, selectable · mobile **and** website) — spec for the implementation plan.

**Problem:** the Shape Score LEDGER tab shows only the last ~12–20 entries as a flat list. Members
want a real history + report: how the score moved over time, where points come from, and the full
transaction record.

**Surfaces:** mobile broadsheet (`iosAppBroadsheetClient.jsx`) + website (`public/newdesign/score.jsx`
+ `Score.html`). New pure module `mobile-app/src/services/scoreHistory.mjs` (+tests). New/extended
API route. No migration (reads the existing `score_ledger`).

---

## Core decisions (owner)

- **Report + full history** on **one dedicated full-screen page** ("The Record").
- Reached from the **LEDGER tab**, which becomes a short recent-preview ending in a
  **`SEE THE FULL RECORD →`** leader (both surfaces).
- **Time range** for the trend + breakdown: **1W (default) · 1M · 3M · All**, selectable inline.
- Works **signed-in (live)** and **signed-out (demo)**; heat = tier color; penalties in rust
  (never shaming — the established score-page convention).

## Page anatomy (both surfaces, same content)

1. **Header register** — `SHAPE SCORE · THE RECORD`, the lifetime rank total, and a count-up
   register row: **THIS WEEK · THIS MONTH · EARNED / LOST** (net + gross for the visible range).
2. **Score over time** — a self-drawing cumulative line (the existing `BSSdTrace`/ridge SVG idiom;
   `preserveAspectRatio="none"` + %-positioned end dot per the ladder lesson) over the selected
   range, with the **1W · 1M · 3M · All** range control as a segmented toggle (the #1557 pattern).
   1W plots daily points; longer ranges bucket by day/week so the line stays legible.
3. **By source** — horizontal bars of points earned per category over the range (Workouts · Habits ·
   Nutrition · Check-ins · PRs · Community · Steps · Momentum), using the `BS_SD_ZONES`-style bar
   rows; a **− penalties** line beneath in rust (gross lost + top penalty reasons).
4. **The full history** — every ledger entry (not capped at 20), **grouped by day with a per-day
   subtotal** (`TODAY · +20`, `JUL 5 · +9`), newest first; a **category filter** (All / Workouts /
   Habits / Nutrition / Check-ins / PRs / Penalties). Each row: note · dot-leader · signed delta
   (earned ink/heat, penalties rust). "Load more" past the initial page if the list is long.

## Architecture

**The aggregation logic — one algorithm, two twins (the established `weekendSplit` pattern):**
`bsScoreRecord(rows, { now })` where `rows = [{ category, source_kind, delta, note, earned_at }]` →
`{ ranges: { '1w'|'1m'|'3m'|'all': { series:[{date, cumulative, dayDelta}],
byCategory:[{key,label,earned}], earned, lost, net } }, byDay:[{date, subtotal, rows:[…]}], lifetime }`.
Windowing, cumulative-sum, per-day grouping, and category rollups (rank-basis — excludes redemptions,
mirroring `deriveScore`) all live here.
- **`mobile-app/src/services/scoreHistory.mjs`** — the mobile/Vite copy; unit-tested; used by the
  mobile client for the **demo/signed-out** path (Vite can import it; the browser-babel website
  cannot, which is why the server owns the live aggregation).
- **`src/lib/scoreHistory.ts`** — the server twin (byte-for-byte same algorithm + a shared vector
  set), imported by the route. (Same twin arrangement `weekendSplit.mjs`/`weekendSplit.ts` uses,
  since Next can't reach into `mobile-app/` and the website can't import ESM at all.)

**`GET /api/client/score-record`** (new; keeps the main `/api/client/score` load lean since the
report opens on demand). Owner-RLS; fetches the caller's full `score_ledger` (cap history at ~1000
rows, newest first), runs the TS twin, returns `{ history, ranges, lifetime }` — the exact same JSON
feeds mobile + website (both are thin renderers of `ranges`/`history`).

- **Mobile: `BSScoreRecordPage`** — full-screen overlay (`createPortal` into `#bs-phone-surface`),
  `← BACK`; range toggle switches which precomputed `ranges[...]` renders; category filter +
  day-grouping render off `history`/`byDay`. Live → the endpoint; demo → `scoreHistory.mjs` over the
  demo ledger rows.
- **Website:** a "The Record" view in `score.jsx` (a full section, reached from the Ledger leader)
  rendering the same four blocks off the endpoint JSON; bump `Score.html` `?v=`. Signed-out demo
  reads a small precomputed demo `ranges`/`history` fixture (the website can't aggregate in-browser)
  — the plan bakes it from the same demo rows so it matches the mobile demo.
- **Demo honesty:** demo report is a labelled preview; no fabricated live numbers in a signed-in view.

## Testing

`tests/score-record.test.mjs` — vectors for: range windowing (1w vs all), cumulative monotonic +
per-day subtotals, by-category rollup excludes redemptions (rank-basis, matching the existing
`deriveScore` split), earned/lost/net split, penalties bucketed to rust, empty ledger → empty
report (no NaN), a single-entry ledger, and day-grouping across a month boundary. Plus the shared
per-commit gate (JSX parse · PowerShell mobile build · full `npm test` · tsc for the route · LF).

## Invariants / reuse

- No new table, no migration — reads `score_ledger` (owner-RLS). Reuses `deriveScore`'s
  rank-basis exclusion of redemptions so the report total agrees with the Standing.
- Motion: entrances once per first view; reduced-motion → finished; one breathing loop max.
- Theme tokens only; `BS_SD_ZONES` for the source bars; heat = tier; rust = penalties.

## Out of scope (v1)

Coach-side score history; CSV/PDF export; per-source drill-down pages; comparing to other members;
changing what any action awards (that's the #1558 line of work).
