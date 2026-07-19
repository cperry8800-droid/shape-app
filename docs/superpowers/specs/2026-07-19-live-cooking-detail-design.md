# Live cooking detail — the boost sheet learns what's on the stove

**Date:** 2026-07-19 · **Status:** spec for owner review · **Migration:** one
tiny hardening (`2026-07-19-user-activity-live-expiry-rls.sql` — see Design)

## Why

The presence system already broadcasts *that* a member is cooking (the amber
dot + "In the kitchen · N min in" on the boost sheet, via `user_activity`).
Live-progress v1 added set-by-set detail for workouts and registered cooking
detail as a v2 candidate. This closes it — a boost sender sees *what* is being
cooked, so the cheer lands specifically ("that salmon bowl looks serious").

## Doctrine reconciliation (the part that needs care)

The meal wave's rule is **meals are share-by-choice, never auto** (#1686 — no
auto-posting of logged intake, ever). Live cooking detail does NOT touch that
rule, because of what it carries:

- **It broadcasts the PLANNED MEAL'S TITLE only** — "Cooking · Salmon rice
  bowl" — when the member opened the logger from a plan meal or Kitchen Card
  recipe. A planned title is menu information (the coach-authored plan, the
  public recipe catalog), not logged intake.
- **Freehand cooking broadcasts no title** — a freehand meal name is the
  member's own composition (intake-class data); the sheet keeps today's
  generic "In the kitchen."
- **Never macros, never portions, never adjustments** — that is intake, and
  intake is share-by-choice. **Retention, stated honestly:** visibility ends on
  a successful `clear()` OR at row expiry — clear is best-effort, so a crash or
  failed request leaves the row until `expires_at`; consumers already suppress
  expired rows (the shipped `expires_at` guard + subscription-side timer), so a
  stale title is never RENDERED past expiry even while the row awaits cleanup.
  Nothing persists beyond the ephemeral row.

Audience = the member's same resolved live-audience rule
(`bsLiveAudience` — public / followers / private→nothing), reusing the shipped
pipe unchanged. (The rule reads workout-share settings; the settings copy
already frames it as live-activity sharing. The plan renames nothing.)

## Design

- **Payload:** `user_activity_live` rows gain `payload.kind: 'workout' |
  'cooking'`. **`bsValidLivePayload` dispatches on `raw.kind` FIRST**, before
  any workout-shape check (the current validator would reject a cooking
  payload at the `exercises` check before ever seeing it): `kind` absent or
  `'workout'` → the existing workout contract, byte-identical; `kind ===
  'cooking'` → exactly `{ v:1, kind:'cooking', title }` where title is a
  non-empty string ≤80 with no control characters or markup — **rejected to
  null, never truncated** (truncation is the builder's courtesy; the wire gets
  no such benefit of the doubt). Any other `kind` → null.
- **Writer:** `BSLogMealFlow` (the meal logger) — which already sets the
  presence activity to `'cooking'` — pushes a cooking row via the same
  `window.ShapeLiveProgress` serialized queue when (and only when) the meal is
  plan/recipe-sourced; `clear()` on logger close (the existing
  cooking-scoped-to-logger-open behavior). **Provenance is live, not
  open-time:** if mid-session the state becomes ineligible (the member pivots
  a plan meal to freehand, or provenance is lost), the writer actively
  `clear()`s the row THEN — never waits for logger close (the
  eligible→ineligible transition is a required test vector). And **audience
  changes take effect immediately, not on the next push:** the Settings save
  path fires a `shape:liveAudienceChanged` event; an open logger (or session
  player) re-pushes on it, which re-resolves the audience per push — a flip
  to private deletes the row within the serialized queue's turn, not at the
  next organic transition.
- **Consumer:** `BSLiveBoostSheet`'s cooking branch renders the title line
  ("Cooking · *Salmon rice bowl* — 12 min in") above the existing cook-themed
  boost phrases. No row / freehand → today's rendering, byte-identical.
- **One tiny hardening migration** — `2026-07-19-user-activity-live-expiry-rls.sql`:
  the shipped v1 SELECT policy leaves an expired row directly readable until
  cleanup (consumers filter `expires_at > now()` in code; a direct query
  needn't). Titles raise the sensitivity, so expiry moves INTO the read path:
  the audience legs of the `live read` policy gain `and expires_at > now()`
  (the OWNER leg stays unfiltered — she must be able to see and clear her own
  stale row). Idempotent drop-and-recreate of the one policy; everything else
  (table, realtime, audience stamping) ships today — this stays a payload
  variant plus one writer, one consumer, one policy tightening.

## Testing

Module vectors: cooking payload build (plan/recipe-sourced yes · freehand null
· absent/unsafe provenance null) · validator kind-dispatch (cooking accepted ·
unknown kind null · workout-contract regression byte-identical) · title
rejection (empty · control characters · markup · >80 — null, never truncated)
· **eligible→ineligible transition** (plan → freehand mid-session actively
clears) · **immediate audience withdrawal** (`shape:liveAudienceChanged` →
re-push → private deletes now, not next push) · **failed-clear honesty** (the
row survives to `expires_at`; consumers suppress it there AND — post-migration
— the read policy itself stops serving it). RLS proof: an expired row is
unreadable to the audience legs, still readable/clearable by its owner.
Boost-sheet render check on the dev server.

## Build

One small PR after live-progress-web merges. That spec moves `liveProgress.mjs`
to the ONE canonical copy in `public/newdesign/` — mobile imports it, the web
station loads it — so mobile and web genuinely share a single validator and the
`kind` branch lands exactly once; there is no second web validator to keep in
sync (parity by construction, not by convention).
