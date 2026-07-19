# Live progress — website surfaces (coach live-watch parity)

**Date:** 2026-07-19 · **Status:** spec for owner review · **Migration:** none
**Parent:** `2026-07-18-live-workout-progress-design.md` (shipped #1763/#1764; migration live)

## Why

Live workout progress shipped mobile-only. The house rule is app⇄web parity per
wave, and the highest-value web consumer is the **coach**: the mobile coach app
watches a client's session live (`BSProLiveWatch` real mode), while the website
client detail page — where a coach at a desk actually works — has no live leg at
all. v1 closes exactly that gap.

**Deliberately OUT of v1:** a member-side web boost sheet (the boost flow is
app-native chat), and any new data — this consumes the existing
`user_activity_live` row under the existing RLS, unchanged.

## Design

1. **THE LIVE STATION on `coachClientDetail.jsx`** (website client page, both
   coach roles): when the viewed client has a readable `user_activity_live` row,
   a station renders above the KPI grid — exercise list with done/total sets, the
   NOW marker (`curIdx`, −1 honoured), resting state, real elapsed from
   `started_at`, loads as the honest `—` (the v1 payload carries none). No row →
   **the station does not exist** (absence; the mobile console's neutral copy is
   for a console that always renders — the web page simply omits the station).
2. **Transport = browser-side Supabase realtime**, exactly the mobile pattern:
   initial `get()` + `postgres_changes` subscription on `user_id=eq.<client>`
   via `window.shapeDb.client` (the self-hosted supabase-js UMD carries
   realtime). **RLS enforces the audience per subscriber** — the web page adds
   zero trust surface. The `/api/clients/:id/shared-overview` route is NOT
   extended (a server snapshot can't be live; polling it would fake liveness).
3. **One validator, one implementation:** `liveProgress.mjs` becomes a canonical
   module the website loads (the `shareCard.mjs` pattern — canonical copy in
   `public/newdesign/`, mobile imports it). The web station renders **only**
   what `bsValidLivePayload` returns — wire data stays attacker-shaped until
   validated, same as mobile.
4. **Consumer-side hygiene ported verbatim from the mobile review round:** the
   `evented` TOCTOU guard (a late initial fetch never overwrites a newer
   realtime event, especially the end-of-session DELETE) and the subscription-
   side `expires_at` timer (an already-open page drops the row when it expires).
5. **Chat-widget presence line (small):** where the site chat widget shows a
   member with the activity dot, the label gains "in a workout · N min" from the
   existing `user_activity` read — presence-tier info only, no set detail. No
   new privacy surface (that table is already authenticated-read).

## Privacy

Nothing new. The audience is the member's own share rule, enforced by the
shipped RLS; `private` members have no row; the coach passes the same test as
everyone (the v1 no-coach-exception rule stands — the coach-channel spec, if
approved, changes that separately and explicitly).

## Testing

- Reuses `tests/live-progress.test.mjs` (module unchanged, path move only —
  import paths asserted).
- Headless browser proof on the branch preview: station renders from a seeded
  row; DELETE removes it; `share:false`-equivalent (no row) renders no station;
  **plus the race/timer paths module tests can't reach** — a LATE initial fetch
  resolving after a realtime DELETE/update leaves the newer state standing (the
  `evented` guard), an already-open page drops the row when `expires_at` passes
  (the subscription timer), and a malformed or expired-timestamp payload
  renders honest absence, never a partial station.
- Standard gates: JSX parse · `build-newdesign --check` · LF · `/m/` build
  (import re-point touches mobile).

## Build

One PR: module move + web station + presence line. No migration, no route.
