# Shape Sets schedule — nora_sets + the watch-screen auto-show (Radio Phase B)

**Date:** 2026-07-19 · **Status:** spec for owner review · **Migration:** one (owner runs it)

## Why

Radio Phase B's registered remainder. The Shape Sets page ("Residents who
train. Sets that land.") is editorial only — there is no schedule, so nothing
tells a member a set is *about to happen* or *happening now*. The audio side
stays blocked on the owner's Radio.co signup (the station row defaults to
mock); the **schedule is buildable now** and is what makes the radio feel
programmed rather than ambient the day audio goes live.

**Honest scope note:** until Radio.co is live, "LIVE NOW" tunes into the mock
stream. The schedule ships dark-launch-ready; its payoff switches on with the
station row.

## Design

### Data — migration `2026-07-19-nora-sets.sql` (⚠ OWNER runs it)

`nora_sets`: `(id uuid pk, title text, dj text, blurb text, starts_at
timestamptz, duration_min int check 10–360, published boolean default false,
created_at)`. RLS: **public read of published rows only**
(`using (published)` to anon + authenticated); writes service-role only (no
authenticated write policy — schedule authoring is an owner/ops act, via SQL or
a later admin panel; v1 ships no editor UI). Not in the realtime publication —
consumers poll on open (a schedule changes rarely; realtime is overkill).

### Pure module — `mobile-app/src/services/noraSets.mjs` (TDD)

`bsSetsNow(rows, now)` → `{ live, next, upcoming }`: `live` = the row whose
`[starts_at, starts_at + duration_min]` covers now (latest start wins on
overlap) · `next` = soonest future row · `upcoming` = next 7 days capped 10.
Pure, injected clock, tested.

### Surfaces

1. **Shape Sets page** (`BSShapeSetsScreen`): a **COMING UP** station — dot-
   leader rows (day · time in the member's locale via `intlLocale()` · title ·
   dj) from published rows; honest empty state ("Schedule lands with the first
   broadcast.") pre-seeding.
2. **Radio screen auto-show:** when `bsSetsNow` reports `live`, the radio
   screen (and the muted now-playing bar) carries a **LIVE SET banner** —
   `LIVE · {title} · {dj}` with the ON AIR red-lamp grammar (#1750). Tapping
   tunes/raises the radio. When `next` is within 60 min: a quiet "Up next ·
   {title} · {t}" line instead. Neither renders when the table is empty.
3. **Website Radio page:** the same COMING UP list on `radio.jsx` via anon
   Supabase read (public-read RLS), same module (canonical-copy pattern).

### What v1 does not do

No notifications/reminders for sets (rides the existing notification prefs as
a v2 once the audio is real — pushing members toward a mock stream would be
noise). No admin editor UI. No per-set artwork.

## Testing

`tests/nora-sets.test.mjs`: live-window edges (start, end, overlap → latest
start) · next/upcoming ordering + cap · empty. RLS post-migration: anon reads
published only, unpublished invisible, no authenticated write. Render checks
on dev server (banner appears when a seeded row covers now).

## Build

One PR: migration + module + tests + the three surfaces.
