# Compliance variance band — steady vs variable clients on the coach roster

**Date:** 2026-07-19 · **Status:** spec for owner review · **Migration:** one (owner runs it)

## Why

The second half of the 2026-06-12 coach-metrics research gap (the weekend split
closed the first): platforms like Trainerize show a coach not just a client's
*average* adherence but its **week-to-week variance**. Two clients at 70%
average are different coaching problems — one holds 65–75 every week, the other
alternates 100 and 40. The steady one needs a plan tweak; the swinging one needs
a floor. Shape's roster + engine currently read averages only.

## Design

### The statistic — pure `mobile-app/src/services/varianceBand.mjs` (TDD)

`bsVarianceBand(weeks)` over a per-client series of weekly adherence rates
(0–1), trailing ≤8 ISO weeks:

- **Adherence per week** (computed in SQL, one number per week): completed
  scheduled units / scheduled units, where units = daily-habit days + assigned
  workout days + nutrition-logged days — the same signal classes the
  weekend-split RPC already buckets, aggregated weekly instead of Sat/Sun.
- **Floors:** ≥4 complete weeks with ≥6 scheduled units each, else `null`
  (honest-null — no band, no chip).
- **Band:** stdev of the weekly rates. `steady` ≤ 8pp · `variable` ≥ 18pp ·
  between = no band (the middle is noise; only the clear signal fires — the
  crossover doctrine of clear thresholds over vibes).
- Returns `{ band, mean, stdev, weeks }` for register display.

### Data — migration `2026-07-19-roster-weekly-adherence.sql` (⚠ OWNER runs it)

SECURITY DEFINER `get_roster_weekly_adherence(p_client_ids uuid[])` — the exact
`get_roster_weekend_split` pattern: **every client gated through
`is_coach_on_client`** inside the function, per-member timezone week bucketing
via `shape_user_tz`, archived habits excluded, returns per-client arrays of
`{week_start, scheduled, completed}`. EXECUTE revoked from public/anon.
The band itself is computed client-side by the pure module (no SQL twin drift).

### Surfaces

1. **Roster chip** (`BSProRosterView`, both roles): a quiet mono `VARIABLE`
   chip on flagged clients — never-shaming framing applies to coach surfaces
   too: the chip is a coaching signal, not a grade. `steady` gets no chip
   (absence of noise is the reward; the roster stays calm).
2. **Case File** (Profile tab, near ATTENDANCE/ADHERENCE): one line under the
   adherence station — "Week-to-week: holds 65–75%" / "Week-to-week: swings
   38–96% — steady the floor before raising the target" — copy bound to the
   computed numbers (the crossoverCopy no-drift rule: words and figures from
   one function).
3. **Engine:** the roster severity read (`bsRosterSeverity`) may take
   `variable` as a WATCH-tier input (never FLAG on its own — variance is
   context, not an emergency).
4. **Website parity:** the same line on `coachClientDetail.jsx`'s adherence
   block. **No new route anywhere:** both surfaces call the RPC directly —
   mobile via `shapeBackend` `supabase.rpc` (the `get_client_lifts` pattern),
   web via `window.shapeDb.client.rpc` (the `get_public_profile` pattern) —
   the definer gates internally. Module shared via the canonical-copy pattern.

## Privacy

Coach-facing over data the coach already reads (adherence). The RPC's
`is_coach_on_client` gate is the permission, per the `get_client_stats`
precedent. Members never see the band (it's a coaching lens, not a member
grade — showing a member "you are VARIABLE" violates never-shaming).

## Testing

`tests/variance-band.test.mjs`: floors (3 weeks → null; thin weeks → null) ·
band edges (8pp/18pp boundaries) · the dead middle · copy binding · garbage
input. RPC validated read-only against prod post-migration (gating, tz
bucketing, archived-habit exclusion).

## Build

One PR: migration + module + tests + roster chip + Case File line + web line.
