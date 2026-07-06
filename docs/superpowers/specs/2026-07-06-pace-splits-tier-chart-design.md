# Pace bars · "The Splits" detail page · split zones · THIS TIER zoomed ladder — design

**Date:** 2026-07-06 · **Status:** owner-approved (chat), spec for the implementation plan
**Surfaces:** mobile broadsheet (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` + a new
`mobile-app/src/services/paceSplits.mjs`) **plus one backend touch** — the Strava sync
(`src/app/api/integrations/strava/sync/route.ts`) starts capturing provider splits/laps (§6;
Codex review P2 — nothing writes `rawMetrics.splits`/`laps` today, so without ingestion the
provider-first path could never fire). No migrations (metrics is already a JSON payload), no
website changes.

Owner directives, verbatim anchors:

- "i want pace to displayed as a bar graph"
- "create another page where when you click on pace, it gives a more detailed breakdown on
  splits/laps … either put splits right under pace or in the new detailed pace/splits page"
- "Also need to create split zones" → chose **zone-per-split** (each mile/lap classified + colored)
- "I want the sessions data to be as detailed as possible"
- "have 'This tier' graph look like the ladder, just more zoomed in a detailed"
- "make these selections more obvious or visible" (the LADDER / THIS TIER toggle)

---

## 1 · PACE → per-split bar chart (main Session Details page)

The pace **line trace dies** (pace only — HR, cadence, elevation, and power keep `BSSdTrace`
lines). In its place:

- **One vertical bar per split** (mile for runs, provider lap when labeled, 500m/100m for swims,
  mile for rides reading speed). Bar height maps **speed relative to the session's slowest split**
  (taller = faster) so the best split literally stands tallest — the same inversion `BSSdTrace`
  does with `invert`.
- **Bar fill = the split's pace zone color** (the existing `BS_SD_ZONES` Z1→Z5 ramp — see §3).
  This is a *deliberate* polychrome exception to the one-heat-color discipline, matching the HR
  ZONES station that already uses this ramp on the same page.
- The **avg-pace hairline** runs across the chart; the `▲ FASTEST <pace>` chip stays (top-right,
  as today); the fastest bar carries the marker.
- The **whole chart is tappable** (`role="button"`, ≥44px) and a
  **`SPLITS · FULL BREAKDOWN ›`** dot-leader row sits under it — both open "The Splits" (§2).
- The current grouped **MILE SPLITS section moves OFF this page** (anti-repetition: glance →
  detail). Its content is superseded by §2's table. **Working-sets breakdowns (strength posts)
  are untouched** and stay on the main page — only splits-type breakdowns move.
- Honest-data gates unchanged: no `paceTrace` and no provider splits → no pace chart at all
  (exactly today's guard), never a fabricated chart.

## 2 · "The Splits" — new full-screen detail page (max depth)

Opened from the pace chart or the leader. Pushed **over** the session-details overlay (local view
state inside the existing full-screen detail component; `← BACK` returns to session details, same
back-button grammar as the rest of the app).

Content, top to bottom — every station renders only when its source data exists
(`BSTRedact` when absent; columns drop, never fabricate):

1. **Header** — mast + `← BACK`, the activity ref (author · title · ago), `BEST <pace>` chip.
2. **The bar chart, full-size** — same component as §1 at greater height with per-bar split
   labels (MI 1 … MI N).
3. **Per-split ledger table** — one row per lap/mile:
   `SPLIT · PACE · HR · CADENCE · ELEV Δ · ELAPSED` + a zone tick (■ Z3) per row.
   - **Provider splits/laps preferred** (`rawMetrics.splits` / `rawMetrics.laps`). The reader
     for this shape exists (`bsBuildBreakdown` — today flattening to 3 text columns, capped at
     14 rows) but **no writer does yet** — §6 adds the Strava-sync ingestion that populates it.
     The detail page reads the **raw uncapped** array.
   - **Trace-derived fallback**: when no provider splits, bucket `paceTrace` (+ parallel
     `trace`/`cadenceTrace`/`elevTrace` samples) by distance into per-mile splits.
   - A column renders only when that stream exists on this post.
   - **Fastest split reads in heat; slowest is named in plain ink** (rust stays penalties-only,
     per the global color constraints).
4. **Zone legend station** — the Z1–Z5 chips (ramp colors) with per-zone split counts
   (`Z3 · 4 SPLITS`), labeled **`ZONES · VS THIS SESSION'S AVG`** (see §3 honesty note).
5. Sports: runs, rides (speed semantics — faster = taller already), swims. Strength posts never
   open this page (their per-set breakdown stays on the main page).

## 3 · Split zones — the data model (`paceSplits.mjs`)

New pure module `mobile-app/src/services/paceSplits.mjs` + `tests/pace-splits.test.mjs`
(registered in the root `package.json` test list — the `scoreStanding.mjs` pattern). No React,
no window; both the main-page chart and the detail page read it.

- `bsPaceSplits({ providerSplits, paceTrace, hrTrace, cadenceTrace, elevTrace, distanceMi,
  sport })` → `{ splits: [{ label, paceSec, paceLabel, hr, cadence, elevDelta, elapsedSec,
  zone, hFrac }], avgSec, bestIdx, worstIdx, source: 'provider' | 'trace' | null }`
  - Normalizes provider splits first; falls back to distance-bucketed traces; returns
    `source: null` when neither exists (callers redact).
  - `hFrac` is the ready-to-render bar height fraction (speed-relative, slowest > 0 baseline).
- `bsPaceZoneFor(paceSec, avgSec)` → 1–5. Zones are **relative to this session's average pace**
  (bands around avg; ~±3% = Z3 "steady", out to Z1 "easy" / Z5 "push" — exact band edges tuned in
  the implementation plan with test vectors). Rationale: there is no user threshold-pace setting
  to anchor true training zones, so session-relative is the only *honest* zone today. The page
  labels it explicitly (`VS THIS SESSION'S AVG`). A future user-threshold setting can re-anchor
  the same function without UI changes.
- Test vectors (minimum): negative-split run (zones rise), single-split activity, missing
  streams (columns drop), provider-vs-trace agreement on the same session, ride speed semantics,
  a zero/absurd pace sample (guard).

## 4 · Shape Score — THIS TIER view = the ladder, zoomed

`BSScoreStandingChart`'s `scale === 'tier'` branch drops the flat HTML track for **the ladder's
own SVG grammar zoomed to one segment** (one visual language, two zoom levels):

- Grid lanes (hairlines), the **dashed ink route** rising bottom-left → top-right across the full
  segment, the **self-drawing heat path** to `frac`, threshold **nodes at both ends** — current
  tier bottom-left (`TEMPO · 750`, tier-colored), next tier top-right (`FORM · 2,000`, its tier
  color), the **breathing you-dot + points figure** as the HTML overlay at `frac` along the line
  (same `preserveAspectRatio="none"` + %-overlay technique — the ladder-chart lesson), and the
  dashed drop line under the dot.
- Captions carry over verbatim: `716 TO FORM · 43% THROUGH THE TIER` and
  `TIERS NEVER DEMOTE — THIS BAR ONLY MOVES RIGHT` (reworded to "this line", since it's no
  longer a bar).
- **At-risk**: you-dot clamps to the floor node (0% — `bsScoreStanding`'s existing clamp) with
  the rust warning caption, unchanged semantics. **Top tier**: full heat lane, no next node,
  "Top tier — nothing above." caption, dot rests at the summit node.
- The you-dot remains the Score page's **one breathing loop** across both views.
- `bsScoreStanding` (the derivation) is untouched — this is a render-only change.

## 5 · THE LADDER / THIS TIER toggle → segmented control

Today: two mono labels with a hairline underline — reads as a heading, gets missed. It becomes a
**two-cell segmented control**: squared cells (radius ≈4) in a shared 1px `RULE` border, the
active cell **inverted** (INK fill, PAPER text), inactive cell plain mono ink-alpha; cells ≥44px
tall; `aria-pressed` on each. Monochrome (no heat fill — heat stays line-only), unmistakably a
control. Scope: this toggle only (the pattern is reusable but nothing else changes now).

## 6 · Provider-splits ingestion (Strava sync) — the data path §2 depends on

Today the sync makes **one capped, new-posts-only streams call per activity**
(`/activities/{id}/streams?keys=…`, `STREAM_CAP`); nothing writes `rawMetrics.splits`/`laps`
(Codex P2 on this spec's PR — without this section, §2's provider-first path would never fire
and every Strava run would silently fall back to trace buckets).

- Under the **same gating** (new-posts-only, counted against the same per-run cap), the sync adds
  one `GET /activities/{id}` detail fetch. Strava's detailed activity carries `splits_standard`
  (per-mile), `splits_metric`, and device `laps`.
- Normalize into the shape `bsBuildBreakdown` already reads:
  `rawMetrics.splits = [{ label, pace, time, hr, elevation }]` (per-mile from `splits_standard`:
  moving-time-derived pace, `average_heartrate` when present, `elevation_difference`), and
  `rawMetrics.laps` (device laps, same fields + lap label) when the activity has real laps.
  Honest rules: absent fields stay absent; no splits on the detail response → nothing written.
- **No backfill.** Existing posts keep trace-derived splits (§3's fallback — already designed);
  new syncs get provider depth going forward.
- Failure isolation: a failed detail fetch must not fail the sync of that activity — streams and
  the post itself proceed, splits just stay absent (trace fallback covers it).

## Invariants (verbatim carry-overs)

- All data plumbing: `setActivityDetail` payload fields, `bsBuildBreakdown` (still feeds the
  strength working-sets section), `bsBuildZones`, likes/comments/reactions, route preview,
  `bsScoreStanding` and its tests.
- Honest-data rules: nothing renders without a real source; demo cards keep working via the same
  module (their traces/breakdowns flow through `bsPaceSplits` like real ones).
- Motion contract: entrances once per first view (`useBSSdInView`/`seen` gates), reduced motion →
  finished state, one breathing loop per page.
- Theme: `useBS()` tokens only; `BS_SD_ZONES` is the single zone ramp; heat = role (session page)
  / tier (score page), line-only outside the zone-ramp exception in §1/§2.
- Per-commit gate: JSX parse · PowerShell mobile build exit 0 · full `npm test` green · LF.

## Out of scope

Website session pages; a user threshold-pace setting (noted as the future re-anchor for zones);
power-zone classification for rides; coach-side surfaces; backfilling provider splits onto
existing posts; Strava `best_efforts` capture; splits ingestion for providers other than Strava
(WHOOP/Garmin posts keep the trace fallback until their syncs grow the same capture).
