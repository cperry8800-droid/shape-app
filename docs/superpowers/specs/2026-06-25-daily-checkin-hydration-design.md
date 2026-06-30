# Design — daily energy/hunger check-in + dedicated hydration logger

Roadmap feature **#3**. Two cohesive daily-wellness additions on the mobile home
page: **(1)** a lightweight daily **energy + hunger** check-in (these exist only
on the heavy weekly check-in today), and **(2)** a dedicated **hydration logger**
(hydration only accumulates via meal-logging / device sync today — there's no
"log water" UI). Athlete-side; coach surfacing is a later pass.

- **Branch:** `feat/daily-checkin-hydration` (off `main`). Kept after merge.
- **Scope (approved):** two **separate** dedicated home cards; energy/hunger
  stored as `daily_health_snapshot` columns (one small migration); hydration
  reuses the existing accumulating `hydration_l` path.

## Background / what exists

- **Weekly check-in** (`BSWeeklyCheckin`, `iosAppBroadsheetClient.jsx`) already
  rates energy + hunger (+ sleep/stress/adherence) on a 1–10 scale → `client_checkins.ratings`
  jsonb, one row/ISO week. Colors: energy teal `#34d6c5`, hunger amber `#e8b14a`.
  **No DAILY energy/hunger surface exists.**
- `daily_health_snapshot` is the per-day metrics table — already holds `mood`,
  `hydration_l`, `sleep_hours`, `steps`, etc. A daily snapshot writer + the
  `src/lib/health-snapshot.ts` `SnapshotPatch`/`cleanPatch`/`ALLOWED_FIELDS`
  mechanism (used by the steps feature) is the established way to write a daily
  metric. `window.ShapeCheckin.log({...})` is the mobile helper that writes the
  daily snapshot (mood today).
- **Hydration:** `hydration_l` (liters) column exists; written by the meal-log
  route's accumulating `hydrationL` param (`+=`) and by device sync (Garmin);
  displayed as a 7-day bar chart on the Progress→Nutrition tab. A
  `hydration_target_l` setting exists (default 3.0). **No direct "log water" UI.**
- **Units:** `window.ShapeUnits` (`t.isMetric`) drives metric/imperial display.

## 1. Storage & backend

- **Migration `2026-06-25-daily-energy-hunger.sql`** (idempotent) — add to
  `daily_health_snapshot`: `energy smallint` and `hunger smallint` (nullable,
  `CHECK (energy between 1 and 10)` / same for hunger). `hydration_l` already
  exists — no schema change for hydration. **Owner runs it; code no-ops for those
  fields until applied** (the snapshot reads use `select('*')`, migration-safe).
- **Energy/hunger write** — extend the daily-snapshot patch path:
  `src/lib/health-snapshot.ts` `SnapshotPatch` + `ALLOWED_FIELDS` gain
  `energy` / `hunger`, each normalized to an **integer clamped to 1..10** in
  `cleanPatch` (mirroring the steps non-negative-int normalization). The daily
  check-in route (the one `window.ShapeCheckin.log` calls — confirmed during
  planning) accepts `energy` / `hunger` and applies the patch (upsert today's row;
  RLS-scoped to the caller; membership-gated by the `/api/client` proxy prefix).
- **Hydration add** — reuse the existing accumulating `hydration_l` path: a new
  `window.ShapeHydration.add(deltaL)` helper posts a positive `hydrationL` delta
  (the existing accumulate-on-snapshot path); **undo** posts a negative delta,
  **clamped so `hydration_l` never goes below 0** server-side. (If the existing
  accumulator can't decrement/clamp cleanly, add a tiny `POST /api/client/hydration`
  that applies a signed `deltaL` clamped at 0 via the snapshot patch — decided in
  the plan after verifying the exact route. Either way: no new data class, RLS +
  membership gated.)

## 2. Two daily home cards (mobile, `iosAppBroadsheetClient.jsx`)

Both are instrument-plate (`BSPlate`) cards placed in the home day-section
(near the habits / score cards). Both read today's `daily_health_snapshot` via
the existing client-metrics path (`window.ShapeMetrics` / the progress/snapshot
read) so they reflect device-synced + logged values.

- **`BSDailyCheckinCard` — "How are you · today?"**
  - Energy + Hunger each on a **1–10 tap-scale** (the weekly check-in's dot/segment
    treatment, energy teal / hunger amber). Tap a number → it's selected; a
    **Log today** action upserts today's `energy`/`hunger` onto the snapshot via
    `ShapeCheckin.log`.
  - **Once/day:** after logging, the card shows the logged values
    ("Energy 6 · Hunger 3 · logged ✓") with an edit affordance (tap re-opens the
    scale). Honest empty state before logging ("Tap to log your energy & hunger").
- **`BSHydrationCard` — "Hydration · today"**
  - A ring/bar toward the daily target (`hydration_target_l`, default 3.0 L)
    showing `{logged} / {target} {unit} · {pct}%`.
  - **Quick-add chips** — metric: **+250 ml / +500 ml**; imperial: **+8 oz / +16 oz**
    (converted to liters for storage: 8 oz ≈ 0.237 L, 16 oz ≈ 0.473 L) — each calls
    `ShapeHydration.add`. An **undo (↶)** reverses the last add (negative delta,
    clamped ≥ 0). Optimistic update; reconciles from the snapshot read.
  - Imperial display shows oz/cups; the stored value stays liters. The existing
    Progress→Nutrition 7-day chart already shows the trend (no change there).

## 3. Honest data / edge cases

- No fabricated values: unlogged energy/hunger → the empty prompt (not a fake
  number); hydration → `0.0 / target` until logged or device-synced.
- Device-synced + meal-logged hydration both flow into the same `hydration_l`, so
  the card reflects all sources; quick-adds accumulate on top.
- Undo never drives `hydration_l` below 0.
- Day boundary: "today" uses the client's local date (the app's existing
  `_localDate()` pattern for day-scoped writes), so a late-night log lands on the
  right day.
- Pre-migration: energy/hunger writes/reads no-op gracefully (snapshot `select('*')`);
  the card still renders its prompt.

## 4. Testing & scope

- This is UI + a 2-column migration + reusing existing write paths — **no new pure
  module** is warranted, so it's lighter than Phase 1/2. Verify: JSX parse-check;
  `tsc --noEmit` (the route/lib TS edits); mobile build + `public/m` resync
  (PowerShell); `npm test` (unaffected); staging click-through of both cards
  (log energy/hunger, +250 ml, undo, imperial).
- **Owner runs one migration** (`2026-06-25-daily-energy-hunger.sql`).
- Review stack + CodeRabbit before merge; required CI checks green.

## Out of scope

- **Coach-facing** daily energy/hunger (surfacing to the coach client page /
  `get_client_*` rollups) — athlete-side first; a later pass.
- Reminders/notifications to nudge daily logging (the existing reminders system
  could drive this later).
- Changing the weekly check-in or the hydration target-setting UI.
- Mood (already on the snapshot) — not added to the new card in this pass unless
  trivially free; energy + hunger are the roadmap ask.
