# Daily check-in engine — coach monitoring · client weekly readout · optional check-in

**Date:** 2026-08-17 · **Status:** DRAFT — for owner go/no-go · **Migrations:** NONE

## 1. Problem

The daily "How are you" check-in captures five fields into `daily_health_snapshot`
(one row per member per day), but only one of them is wired to any engine:

| Field | Column | Coach surface | Rules / alerts | Client review |
| --- | --- | --- | --- | --- |
| Sleep hours | `sleep_hours` | roster triage + case file (both surfaces) | `sleep_low` flag → notifications | directive + trend chart |
| Rested /10 | `sleep_quality` | **web case file only** (mobile omits it) | none | prefill + history page |
| Energy /10 | `energy` | none | none | none (Cycle card only) |
| Hunger /10 | `hunger` | none | none | none (Cycle card only) |
| Hydration | `hydration_l` | computed then dropped (`/api/nutritionist/analytics` → never rendered) | none | trend bars only |

No cron evaluates any of these values. There is no weekly review of check-in data —
`/api/ai/weekly-readout` was built (correlations + 3–5 AI insights + deterministic
fallback) and has **zero callers** (its only reference is the `warroom.ts` route
inventory). And the check-in itself is mandatory chrome: the home "CHECK-IN DUE"
bulletin (`BSTodayNudge`, `iosAppBroadsheetClient.jsx:3769`) nags every member,
every day, with no way to turn it off.

⚠ **Implementer trap:** the coach case file already shows "Energy / Hunger" cells
(`iosAppBroadsheetPros.jsx:4783`, `coachClientDetail.jsx:612`) — those are the
**weekly** check-in ratings from `client_checkins.ratings` (a different table).
They are NOT this data and must not be touched or conflated. New daily cells get a
distinct label (see §3B).

## 2. Goal

1. All five fields reach the coach engine (flags → triage → notifications) and the
   coach case file, on both surfaces.
2. The client gets a real weekly review of their check-in data (wire the orphaned
   weekly-readout endpoint to a UI).
3. The daily check-in becomes **optional per member** — the nag can be turned off
   without breaking anything downstream.

**Zero migrations.** Coach reads of `daily_health_snapshot` are already permitted
by the `providers_read_subscriber_snapshots` RLS policy; the opt-out toggle and the
readout cache ride the existing `user_goals` doc pattern.

## 3. Design

### A — Engine: flags for energy / hunger / hydration

- **Record shape** (`mobile-app/src/services/signalsMap.mjs`): extend the self
  record with a `vitals` leg — `{ energy: {avg7, n}, hunger: {avg7, n},
  hydration: {avg7L, targetL, n}, rested: {avg7, n} }` — derived from the progress
  series the client already caches (`/api/client/progress` exposes
  `series.energy/hunger/hydration/sleepQuality` today).
- **Rules** (`public/newdesign/dashSignals.js`, modeled on `ruleSleepRecovery`
  :462): new entries in `THRESHOLDS` (:55) + `DIRECTIVE_PRIORITY` (:946), all
  priority-ranked **below** `sleep_low` (35):
  - `energy_low` — 7-day avg ≤ **4.0**/10 with ≥ **3** logged days → amber flag.
  - `hunger_high` — 7-day avg ≥ **8.0**/10 with ≥ **3** logged days → amber flag
    (sustained high hunger = under-fueling signal; direction is an owner call, §8).
  - `hydration_low` — 7-day avg < **50 %** of target with ≥ **4** logged days →
    **client directive only**, no coach flag (owner call, §8).
  - **Absence gate everywhere:** no data → no flag, ever. A member who opts out of
    the check-in (§3D) simply never fires these rules. Absence of data is not a
    signal (house doctrine).
- **Coach roster read:** widen the existing `POST /api/coach/roster-sleep` select
  to include `energy`, `hunger`, `hydration_l` (same table, same RLS, same batch
  window) — **no new route**. `shapeSignals.js coachRecords()` maps the new
  columns into the coach-side record so `getTriageFeed` picks the flags up.
- **Notifications** (`src/lib/ai/notifications.mjs` + the persisted
  `notify_snapshot`): the persisted record gains the `vitals` leg (the hourly
  `/api/ai/notify/cron` re-evaluates only what the snapshot carries — this is the
  step that makes the cron able to see these fields at all). New flags route
  through the existing `client_amber` coach candidate + a `directive` client
  candidate; per-type × per-channel matrix, quiet hours, caps and dedupe all
  inherited — additive, not architectural.

### B — Coach case file: show what's already fetched

- `src/app/api/clients/[id]/shared-overview/route.ts` already selects `*` from
  `daily_health_snapshot` (:269) and has a `colSeries()` helper — return a new
  `vitals` leg (energy / hunger / hydration series + 7-day averages). The data is
  in memory in that route today and simply not returned.
- **Mobile case file** (`iosAppBroadsheetPros.jsx` SLEEP · RECOVERY station,
  :4806-4845): add the missing **RESTED** row (closes the live web/mobile
  asymmetry) + a compact **DAILY · 7D AVG** line for energy / hunger / hydration,
  honest-absent (`BSTRedact`) when the member has no data.
- **Web case file** (`public/newdesign/coachClientDetail.jsx` :641-670): the same
  cells beside the existing RESTED entry.
- Labels read **"DAILY ENERGY · 7D"** etc., so they can never be confused with the
  weekly `client_checkins` cells (§1 trap).

### C — Client weekly readout: wire the orphaned endpoint

- `POST /api/ai/weekly-readout`: add `energy`, `hunger`, `sleep_quality` to
  `SNAPSHOT_FIELDS` (:38) — `hydration_l` is already in. Route logic, correlation
  engine, and the deterministic model-down fallback ship as built.
- **Entry point:** a **"The Readout"** card on the client Progress hub, Overall
  tab (instrument-plate grammar). On first open in an ISO week it calls the
  route and renders the 3–5 evidence-bound insights + recommendations.
- **Cost control:** the generated readout is cached in
  `user_goals('weekly_readout')` `{ week, payload }` — at most **one model call
  per member per week**; re-opens render the cache. The `/api/ai` prefix is
  already membership-gated (paid feature, correct).
- i18n: new keys ×13 locales, registered in BOTH the runtime NS array and the
  catalog-parity test (the ships-ungated trap).

### D — Optional check-in (owner request 2026-08-17)

- **Toggle:** Settings → Preferences → **"Daily check-in"** (default ON). Stored
  as `dailyCheckin: false` in `user_goals('client_settings')` (absent = on) —
  the same doc that already carries `onlineVisible` / `profileVisibility`. No
  migration.
- **OFF behavior:** the home **CHECK-IN DUE bulletin renders nothing** and the
  logged-residue row is hidden (`BSTodayNudge` gates on the setting before its
  `logged` logic). A quiet **"Check-in"** `BSIndexRow` door remains in the
  INSIDE. index — never says "due", never nags — so `BSTodayPage` (and the
  hydration quick-add that lives on it) stays reachable. Turning the toggle back
  on restores the bulletin.
- **Downstream:** nothing else changes. Rules are data-gated (§3A), so an
  opted-out member never flags; the coach case file shows honest absence
  (redaction), **not** an "opted out" label — the setting itself is not surfaced
  to the coach (absence-is-never-a-padlock doctrine; owner may override, §8).

### E — Registered, not built here

- `dashBusiness.jsx DbzOutcomesZone` computes `avgHydrationL` per client and
  never renders it — render it or delete the compute (separate cleanup).
- Energy/hunger joining the client Progress **trend tabs** (mobile
  `BSPROG_TREND_TABS` :28507 / web `DPR_TREND_TABS`) — cheap, proposed yes (§8).

## 4. What deliberately does NOT change

- The weekly check-in (`client_checkins`) and its case-file cells.
- The Cycle card's statistical read of energy/hunger (its own gates stand).
- `sleep_low` and the whole existing sleep pipeline.
- The check-in write path (`/api/client/checkin`, `add_hydration`).
- No new crons — the hourly notify cron picks the new flags up via the widened
  snapshot record.

## 5. Build order

Four PRs, each through the standard gate (CI green + Codex clean on final head;
review-quota discipline — batch fixes into one push):

1. **PR D — optional check-in** (smallest, the explicit owner ask; independent).
2. **PR A — engine + roster + notifications.**
3. **PR B — case-file surfacing + the RESTED mobile fix** (reads PR A's leg).
4. **PR C — weekly readout wiring + i18n.**

## 6. Tests / gates

- Rule vectors for the three new flags (clone `tests/dash-sleep-triage.test.mjs`),
  including the absence gates (no data → no flag) and threshold boundaries.
- `signalsMap` mapper vectors for the `vitals` leg (missing values = absence,
  never `Number(null)` → 0 — the documented fabrication class).
- Readout cache: pure-module test (same week = cache hit, new week = regenerate).
- Toggle: mount-level render test via the `tests/broadsheet-render.test.mjs`
  harness (bulletin gone when off, quiet door present, bulletin back when on) —
  render-check rule applies, this is exactly the class static gates miss.
- Standard: parse · tsc · suite · PowerShell `/m/` build · LF (CR=0) · catalog
  parity ×13 on PR C.

## 7. Open questions — owner calls (parked, none block PR D)

1. **Thresholds** — defaults above are proposals; all live in `THRESHOLDS`
   (one tunable surface).
2. **Hunger direction** — flag sustained HIGH (under-fueling, proposed), LOW,
   or both?
3. **Hydration** — client-only nudge (proposed) or also a coach flag?
4. **Opt-out visibility** — coach sees plain absence (proposed) or an explicit
   "check-in off" state?
5. **Readout placement/cadence** — Progress Overall card, on-demand, 1 model
   call/member/week (proposed). Alternative: a weekly cron that pre-generates.
6. **Trend tabs** — add Energy + Hunger to the client trend tabs (proposed yes)?
