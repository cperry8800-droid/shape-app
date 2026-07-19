# Shape Sets schedule — nora_sets + the watch-screen auto-show (Radio Phase B)

**Date:** 2026-07-19 · **Status:** spec for owner review · **Migration:** one (owner runs it)

## Why

Radio Phase B's registered remainder. The Shape Sets page ("Residents who
train. Sets that land.") is editorial only — there is no schedule, so nothing
tells a member a set is *about to happen* or *happening now*. The audio side
stays blocked on the owner's Radio.co signup (the station row defaults to
mock); the **schedule is buildable now** and is what makes the radio feel
programmed rather than ambient the day audio goes live.

**Honest scope note:** until Radio.co is live, the LIVE/tune state is
SUPPRESSED (see the gating in Surfaces) — a set inside its window reads as a
quiet "broadcast coming soon," never a LIVE badge over the mock stream. The
schedule ships dark-launch-ready; the full payoff switches on with the station
row.

## Design

### Data — migration `2026-07-19-nora-sets.sql` (⚠ OWNER runs it)

`nora_sets`: `id uuid pk default gen_random_uuid()` · `title text NOT NULL
check (btrim(title) <> '')` · `dj text NOT NULL check (btrim(dj) <> '')` ·
`blurb text` (nullable BY DESIGN — optional flavor line; rows render without
it) · `starts_at timestamptz NOT NULL` · `duration_min int NOT NULL check
(10–360)` · `published boolean NOT NULL default false` · `created_at
timestamptz NOT NULL default now()`. A published row is therefore always
evaluable by `bsSetsNow` and renderable — no null start, duration, or labels
by construction.

RLS: **public read of published rows only** (`using (published)` to anon +
authenticated). **Table privilege contract, explicit:** `revoke all on
public.nora_sets from anon, authenticated` then `grant select` back to both —
RLS narrows the read to published rows, and no client DML exists at the GRANT
layer even if a policy were ever misconfigured (defense in depth). Writes are
service-role only (no authenticated write policy — schedule authoring is an
owner/ops act, via SQL or a later admin panel; v1 ships no editor UI). Not in
the realtime publication — consumers poll on open (a schedule changes rarely;
realtime is overkill).

**Supersedes the 2026-06-19 avatar-DJ sketch** (Phase B — paused, nothing
built; repo-verified: no `nora_sets` table, no `/api/radio/nora-sets` route
exists). THIS schema is the contract going forward: `starts_at` + `published`
replace that sketch's `scheduled_start`/`status` (a boolean RLS gate beats
free-text status), `recurrence` is dropped (YAGNI — rows are authored
explicitly), and the sketched route is unnecessary — clients read Supabase
directly under the public-read RLS, and `bsSetsNow` IS the "is a set live
now" resolver that spec wanted server-side. Avatar Phase B consumes this
table + module when it resumes.

### Pure module — `public/newdesign/noraSets.mjs` (TDD)

Canonical copy in `public/newdesign/` (the `shareCard.mjs` pattern) — mobile
imports it and `radio.jsx` loads it as a native ES module, so both surfaces
run ONE implementation. `bsSetsNow(rows, now)` → `{ live, next, upcoming }`,
boundary semantics exact:

- `live` = the row whose **end-exclusive** window
  `[starts_at, starts_at + duration_min)` covers now — `now === end` is NOT
  live, so back-to-back sets never overlap at the boundary; latest start wins
  when windows overlap.
- `next` = the soonest row with `starts_at > now` (a currently-live row is
  never `next`).
- `upcoming` = rows with `now < starts_at ≤ now + 7 days` (boundary
  inclusive), ordered `(starts_at asc, id asc)` — deterministic on equal
  starts — capped 10. The live row is excluded (it is `live`, not upcoming).

Pure, injected clock, tested.

### Surfaces

1. **Shape Sets page** (`BSShapeSetsScreen`): a **COMING UP** station — dot-
   leader rows (day · time in the member's locale via `intlLocale()` · title ·
   dj) from published rows; honest empty state ("Schedule lands with the first
   broadcast.") pre-seeding.
2. **Radio screen auto-show — gated on a REAL stream:** the **LIVE SET
   banner** (`LIVE · {title} · {dj}`, the ON AIR red-lamp grammar #1750;
   tapping tunes/raises the radio) renders only when `bsSetsNow` reports
   `live` AND the station row resolves a real, non-mock stream. While the
   provider is still the mock, a set inside its window shows a quiet honest
   **"On the schedule now — broadcast coming soon"** line with NO tune CTA —
   members never see LIVE over a placeholder stream. When `next` is within
   60 min: a quiet "Up next · {title} · {t}" line. Nothing renders when the
   table is empty.
3. **Website Radio page:** the same COMING UP list on `radio.jsx` via anon
   Supabase read (public-read RLS), same module (canonical-copy pattern).

### What v1 does not do

No notifications/reminders for sets (rides the existing notification prefs as
a v2 once the audio is real — pushing members toward a mock stream would be
noise). No admin editor UI. No per-set artwork.

## Testing

`tests/nora-sets.test.mjs`: live-window edges (`now == start` → live ·
`now == end` → NOT live · overlap → latest start) · `next` excludes the live
row · upcoming's inclusive 7-day boundary + equal-start `(starts_at, id)`
ordering + cap · empty input. RLS + grants post-migration: anon reads
published only, unpublished invisible, **no client DML at the grant layer**.
Render checks on the dev server (a seeded row covering now on the mock
provider shows "broadcast coming soon" — no LIVE badge, no tune CTA).

## Build

One PR: migration + module + tests + the three surfaces.
