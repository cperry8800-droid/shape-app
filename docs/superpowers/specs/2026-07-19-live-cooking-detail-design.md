# Live cooking detail — the boost sheet learns what's on the stove

**Date:** 2026-07-19 · **Status:** spec for owner review · **Migration:** none

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
  intake is share-by-choice. Nothing this feature sends survives past the
  cooking session (same 6h-max ephemeral row).

Audience = the member's same resolved live-audience rule
(`bsLiveAudience` — public / followers / private→nothing), reusing the shipped
pipe unchanged. (The rule reads workout-share settings; the settings copy
already frames it as live-activity sharing. The plan renames nothing.)

## Design

- **Payload:** `user_activity_live` rows gain `payload.kind: 'workout' |
  'cooking'`; the cooking payload is `{ v:1, kind:'cooking', title }` (title
  ≤80, validated). `bsValidLivePayload` branches on `kind` — the workout
  contract is untouched; a cooking payload validates title-only.
- **Writer:** `BSLogMealFlow` (the meal logger) — which already sets the
  presence activity to `'cooking'` — pushes a cooking row via the same
  `window.ShapeLiveProgress` serialized queue when (and only when) the meal is
  plan/recipe-sourced; `clear()` on logger close (the existing
  cooking-scoped-to-logger-open behavior).
- **Consumer:** `BSLiveBoostSheet`'s cooking branch renders the title line
  ("Cooking · *Salmon rice bowl* — 12 min in") above the existing cook-themed
  boost phrases. No row / freehand → today's rendering, byte-identical.
- **No migration:** the table, RLS, realtime, expiry, and audience stamping all
  ship today; this is a payload variant plus one writer and one consumer.

## Testing

Module vectors: cooking payload build (plan-sourced yes / freehand null) ·
validator branch (title bounds, kind gating, workout contract regression) ·
audience unchanged. Boost-sheet render check on the dev server.

## Build

One small PR after live-progress-web (so the web coach station's validator
lands the `kind` branch once, not twice).
