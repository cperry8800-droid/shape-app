# The share card — Shape activities as story-ready images

**Date:** 2026-07-13 · **Status:** Spec for owner review (build follows approval)

## The problem

The feed's Share button sends **text + a URL** through the OS share sheet.
Instagram — where members' audiences actually live — accepts that only as a
DM; Stories and the feed are image/video-only surfaces. So the app's best
organic-marketing moments (a PR, a finished block, a clean plate) die as
links nobody taps. Strava solved this years ago: every activity renders as
a **branded image** the member fires into their Story, and every screenshot
becomes an ad.

## Direction

One **canvas-drawn share-card renderer** (never a DOM screenshot — fonts,
CORS-tainted images, and paper themes make screenshots unreliable), emitting
a **1080×1920 PNG** (story-native 9:16; fine everywhere else), wired in as a
**"Share as image →"** action beside the existing link share.

**The card is fixed-dark in the wire/brand grammar** — dark ground, teal
accent, mono labels, the Shape mark — regardless of the member's paper
theme. Brand surfaces don't follow papers (the launch precedent), and dark
photographs best on Stories.

## Card anatomy (all types)

- Top: the Shape mark + `SHAPE` wordmark, small; a hairline rule.
- Author register: member name + tier chip line (`TEMPO · CLIENT`) — exactly
  what the feed card shows publicly, nothing more.
- The body (per type, below).
- Footer rule: date line · `theshapecommunity.com`.
- Honest-absent everywhere: a stat that doesn't exist renders NOTHING —
  no zeros, no placeholders (the meal-wave contract).

**Card types (v1):**

1. **Workout / run** — title, the hero stat large (the card's promoted
   metric), up to 3 further stat registers, and — when the post carries a
   normalized route — the **route polyline drawn on canvas** (the points are
   already privacy-trimmed server-side; the card draws the same line the
   feed shows).
2. **PR** — lift name, the load huge, the stamped delta line (only a real
   `metrics.delta`, never computed client-side).
3. **Meal** — THE PLATE, translated: dish name, kcal headline, dot-leader
   P/C/F lines, the AS PLANNED/ADJUSTED stamp + plan/recipe attribution.
   The plate, not the ledger — no day totals, no targets, and (standing
   guardrail) no calorie-comparison framing of any kind.

## Scope guardrails

- **Own activities only (v1).** The share-card action renders on the
  member's OWN cards (feed + detail page). Rebroadcasting *other members'*
  content off-platform as images is a separate decision for a separate
  spec — the link share already covers "show someone else's post".
- **No avatar photo in v1** — the initials facet draws clean on canvas;
  remote avatar images risk CORS taint that silently breaks PNG export.
- Signed-in members only (the demo preview never shows the action).

## The flow

1. Tap **Share as image →** (activity detail page action row; the feed
   card's share affordance gains it as a second row where the sheet
   pattern already exists).
2. The renderer draws the card off-screen (`document.fonts.load` for the
   mono/serif faces first; system fallbacks if unavailable) → `toBlob` →
   `File` (`shape-<type>-<date>.png`).
3. `navigator.canShare({ files })` → `navigator.share({ files })` → the OS
   sheet: Instagram Stories, Messages, save, anything.
4. No file-share support (desktop web) → **download the PNG** instead.
   Abort → nothing, no toast spam. Failure → honest toast.

## Implementation shape

- **`mobile-app/src/services/shareCard.mjs`** — the renderer. Pure,
  testable helpers exported separately: text wrapping/ellipsis, stat-row
  layout, dot-leader geometry, route point projection into the card's
  viewport (aspect-fit + padding). The canvas draw itself takes a plain
  card-model object `{type, who, tierLine, title, heroStat, stats, meal,
  delta, route, dateLine}` — built from the SAME `a` card shape the feed
  uses, so the image can never disagree with the card.
- Entry points build the card-model from the existing card/detail props —
  no new data fetches, no new API surface.
- Tests: the pure helpers (wrap/ellipsis boundaries, route projection
  bounds, honest-absent model building — missing stats produce absent
  rows, never "0").

## Out of scope (v1)

- Native Instagram Stories deep-link (`instagram-stories://` pasteboard
  layers) — rides the native iOS build when that lands; the share sheet
  covers today's WebView reality.
- Instagram Content Publishing API — Business-account machinery; only ever
  relevant to Shape's own marketing account, not members.
- Video/animated cards; web-dashboard parity (PR B candidate after the
  mobile card proves out).

## Acceptance criteria

1. On a member's own workout/PR/meal card (feed + detail), **Share as
   image →** produces a 1080×1920 PNG in the OS share sheet; picking
   Instagram offers Stories.
2. The card is fixed-dark brand grammar on every paper theme; the member's
   name + tier render exactly as the feed shows them.
3. Honest-absent: a card with no hero stat / missing macros / no delta
   renders those elements ABSENT — never a zero or placeholder.
4. Route cards draw the same normalized, privacy-trimmed polyline the feed
   renders; routeless cards draw no map element.
5. Desktop (no file share) downloads the PNG; share-sheet abort is silent;
   render failure toasts honestly.
6. No new data leaves the device beyond what the OS share sheet is handed;
   the renderer adds no analytics, no uploads.
7. Meal cards obey the meal-wave guardrails verbatim (plate not ledger,
   no comparison framing, attribution only when true).

## Build plan

- **PR A (mobile):** `shareCard.mjs` renderer + pure-helper tests + the
  workout/PR/meal card models + entry points on the feed card + detail
  page.
- **PR B (later, optional):** web dashboard parity (Session modal / meal
  plate) + the native Stories deep-link when the iOS build exists.
