# Sleep logging redesign — design

**Date:** 2026-06-26
**Status:** DRAFT — for review
**Scope tier:** "Consolidate & reconnect" (+ HRM in the review, + a daily *rested* rating). Sleep **stages** are an explicit fast-follow (see Out of scope).

## Goal

Make daily sleep a first-class, device-aware part of the daily recovery check-in, and reconnect the sleep data we already collect to the engine and the coach. One sentence: **fold manual sleep into the *How are you · today* card (device-first), fix the dead sleep directive, surface the sleep efficiency + heart metrics we already store, and give the coach the objective sleep the client logs/syncs.**

## Why (problems found in the current build)

A read-only architecture map (2026-06-26) found four real gaps:

1. **The "Log last night's sleep" home directive is dead for real users.** `selfRecord` hardcodes `recovery = null` for any signed-in user (`mobile-app/src/services/shapeSignals.js:65`), so the engine's sleep lever (`public/newdesign/dashSignals.js:1024-1036`, `recoveryRead` at `:947-957`) only fires in the signed-out demo or via a coach override. A real member with bad sleep never sees the prompt from their own data. `signalsMap.mjs` (`:80-111`) already plumbs a `recovery` field into the record — it's just never populated.
2. **Three redundant sleep surfaces.** The standalone `BSSleepSheet` (`iosAppBroadsheetClient.jsx:14483-14516`, hours only), the dead directive, and the SLP ticker — versus the `BSDailyCheckinCard` (`:14882-14953`) which already writes Energy/Hunger to the same daily-snapshot row via the same partial-upsert route. Sleep belongs in that card.
3. **Stored device data is dropped at the UI/analytics layer.** `daily_health_snapshot.sleep_efficiency_pct` is written by WHOOP + Oura but read by *nothing*. `resting_hr` + `hrv_ms` are written (Oura/WHOOP) but absent from the sleep readout. Sleep *stages* / bed-wake / latency / respiratory have **no column at all** (discarded on ingest — the fast-follow).
4. **The coach sees almost no sleep** — only a once-a-week subjective 1–10 "sleep quality" (`client_checkins.ratings.sleep`). The objective sleep_hours/trend (and the `sleepSeries` the progress route already builds at `src/app/api/client/progress/route.ts:80`) never reach any coach surface (`shared-overview`, `get_client_stats`, the coach client profiles).

A minor correctness bug: `BSSleepSheet`'s save is fire-and-forget (`iosAppBroadsheetClient.jsx:2364` doesn't await `ShapeSleep.log` and toasts "Sleep logged" regardless) — a failed write silently shows success.

## Design

### A. One surface — the daily check-in card, device-first

`BSDailyCheckinCard` ("How are you · today") gains a third **Sleep** section below Energy/Hunger. Two independent parts:

- **Hours — device-first.** If today's snapshot already has a `sleep_hours`, show a **read-only recovery snapshot**: hours + (when present) efficiency % + resting HR + HRV, e.g. `Sleep · 7h 20m · 91% efficient · RHR 52 · HRV 68` — all from existing columns. If there is **no** `sleep_hours` yet, show a manual **hours** entry (a small number input + the existing `6 / 6.5 / 7 / 7.5 / 8 / 8.5` quick chips). The card keys off *whether a value exists*, not its source — a device-synced and a manually-logged value are treated the same, and the richer device fields (efficiency/RHR/HRV) simply appear when those columns are set. After a manual save the hours part flips to the read-only snapshot.
- **Rested — always manual.** A **1–10 "rested" tap-row** matching the Energy/Hunger pattern, offered every day regardless of device sync (no wearable reports "how rested do you feel"). Written to the new `sleep_quality` column.

The standalone `BSSleepSheet` and the `setSleepSheet` flow are **retired**. The directive's CTA (once data-driven, §C) points at this card.

### B. Manual capture, write path, and the schema

- **New column:** `daily_health_snapshot.sleep_quality smallint` with a `1..10` CHECK — the daily *rested* rating. Same trivial shape as the 2026-06-25 energy/hunger migration. It is subjective/manual-only, so it is **not** added to the multi-source reconcile set.
- **Write path:** extend `POST /api/client/checkin` (`src/app/api/client/checkin/route.ts`) to also accept `sleep_hours` (continuous — its own validator `0 < h <= 24`, **not** `clamp1to10`) and `sleep_quality` (1–10 via the existing `clamp1to10`). Same partial-upsert row the card already writes Energy/Hunger to. The card calls `window.ShapeCheckin.log({ energy, hunger, sleepHours, sleepQuality })` (`shapeBackend.js:3308`), **awaiting the result and rolling back the optimistic UI on failure** — matching the energy/hunger + hydration pattern and fixing the fire-and-forget bug. (The dedicated `/api/client/sleep-log` route stays for any other caller, but the card no longer uses it.)
- **Read-back / once-a-day hydrate:** the card hydrates today's sleep_hours + sleep_quality from `window.ShapeProgress.progress()` (the progress route exposes `sleepSeries`; add a `sleep_quality` series + an `efficiency`/`rhr`/`hrv` "today" read) — the same way it hydrates Energy/Hunger, so a card that's already logged shows the "logged ✓" summary.

### C. Engine fix — light up the directive for real users

- In `selfRecord` (`shapeSignals.js:45-67`), populate `recovery.sleepHours = { avg7, lastNight, target: 7.5 }` for signed-in users from the analytics rollup (`/api/client/analytics` already computes `sleep_hours` / `avg_sleep_label` at `route.ts:130-137,188-209`) and/or the progress `sleepSeries`. `recordFromSelfData` already forwards `recovery` (`signalsMap.mjs:108`), so no engine-logic change is needed — `recoveryRead` + `buildDirective` case 3 start firing on real data.
- The directive head copy is currently duplicated (`iosAppBroadsheetClient.jsx:2348` vs `dashSignals.js:1028`); align them so they don't drift. The CTA opens/scrolls to the check-in card's Sleep section (replacing `setSleepSheet`).
- HRV/RHR are *displayed* in the sleep review but the directive's trigger stays sleep-hours-based this pass (a true composite recovery score is the fast-follow).

### D. Surface efficiency + HRM (the un-dropped data)

- Mobile recovery ticker + the card's synced readout show `sleep_efficiency_pct`, `resting_hr`, `hrv_ms` (already stored). No migration.
- `/api/client/progress` already returns `sleepSeries`; add the latest `sleep_efficiency_pct` / `resting_hr` / `hrv_ms` to its KPI block so client + coach can read them from one place.

### E. Coach surface — objective sleep, not just the weekly rating

A compact **Sleep · recovery** readout in the coach client profile's existing check-in/recovery area, fed by `shared-overview`:

- `src/app/api/clients/[id]/shared-overview/route.ts` returns the client's objective sleep: latest `sleep_hours`, a **7-day sleep-hours trend** (sparkline data), latest `sleep_efficiency_pct`, `resting_hr`, `hrv_ms` — gated by the existing `is_coach_on_client` share check (read via the same coach-readable snapshot path used elsewhere).
- Render it on **web** `public/newdesign/coachClientDetail.jsx` (near the existing check-in 1–10 grid at `:264-275`) and **mobile** `iosAppBroadsheetPros.jsx` (near `:2932`). It **augments** the weekly subjective 1–10 sleep rating, it does not replace it.

## Data flow

```text
Wearable (WHOOP/Oura/Apple Health[/Garmin]) ─▶ daily_health_snapshot
        sleep_hours, sleep_efficiency_pct, resting_hr, hrv_ms      │
Manual card (no sync) ─▶ POST /api/client/checkin ─▶ same row ─────┤
        sleep_hours (validated), sleep_quality (1-10)              │
                                                                   ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │ daily_health_snapshot (one row per user per local day)                 │
   └───────────────────────────────────────────────────────────────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
  /api/client/analytics     /api/client/progress     /api/clients/:id/shared-overview
   (avg7, sleep_hours)        (sleepSeries, KPIs)       (latest + 7d trend + eff/rhr/hrv)
        │                         │                         │
        ▼                         ▼                         ▼
  selfRecord.recovery        Card synced readout       Coach client profile
   → engine directive         + Progress page           "Sleep · recovery"
```

## Components / files touched

- **Migration:** `supabase-migrations/2026-06-26-sleep-quality.sql` (new `sleep_quality` column).
- **Backend:** `src/app/api/client/checkin/route.ts` (accept sleep_hours + sleep_quality); `src/app/api/client/progress/route.ts` (latest efficiency/rhr/hrv in KPIs + a sleep_quality series); `src/app/api/clients/[id]/shared-overview/route.ts` (coach sleep readout).
- **Mobile client:** `iosAppBroadsheetClient.jsx` — extend `BSDailyCheckinCard` (Sleep section, device-first); retire `BSSleepSheet` + `setSleepSheet`; align the directive copy/CTA. `shapeBackend.js` `logCheckin` (send sleep fields; await+rollback in the card).
- **Engine:** `mobile-app/src/services/shapeSignals.js` `selfRecord` (populate `recovery.sleepHours`).
- **Coach:** `public/newdesign/coachClientDetail.jsx` (+ `?v=` bump) and `iosAppBroadsheetPros.jsx` (Sleep · recovery readout).

## Error handling / honest data

- Manual save **awaits** the write; rolls back the optimistic UI + toasts on failure (no fire-and-forget success). Signed-out preview never claims a persisted log (nudge to join, matching the energy/hunger fix).
- Every sleep readout is **honest**: a real number or `—` with a sub-label. No fabricated sleep on a signed-in account. The synced readout only shows efficiency/RHR/HRV when those columns are present for the day.
- The `checkin` route's `select('*')` + partial upsert already tolerate the migration not being applied yet (PostgREST-safe); `sleep_quality` writes no-op gracefully until the column exists.

## Testing

- `clamp1to10` already covered. Add focused tests for the new continuous **sleep-hours validator** in the checkin route (reject `<=0`, `>24`, non-number; accept `7.5`) — Node `--test`, mirroring the hydration `deltaL` validation.
- Pure mapping for `selfRecord`'s sleep → `recovery.sleepHours` (avg7/lastNight) if extracted to a testable helper.
- Manual verification (headless preview): the card's synced vs manual states; the directive firing on a seeded low-sleep record; the coach readout.

## Out of scope (explicit fast-follow)

Sleep **stages** (deep/REM/light minutes), bed/wake times + time-in-bed, sleep latency, wake count, respiratory rate. These have **no column today** and need: new `daily_health_snapshot` columns, mapping in each device writer (`src/lib/health-snapshot.ts` for WHOOP/Oura, the Garmin webhook), a widened Apple Health `ALLOWED_FIELDS` payload, reconcile entries, and a stage-breakdown UI. They are additive and do not block this pass. A separate spec.

Also deferred: a single canonical **recovery-readiness score** (sleep + HRV + RHR) consumed by both the ticker and the directive, and a **sleep-deficit triage rule** that flags the client in the coach "who needs you" feed.
