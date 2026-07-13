# Share card PR B — web dashboard parity

**Date:** 2026-07-13 · **Status:** Spec for owner review (build follows approval)
**Parent:** `2026-07-13-share-card-image-design.md` (#1692) — this is the
"PR B (later)" that spec named: *web dashboard parity*. The native
`instagram-stories://` deep-link half stays shelved until the iOS build exists.

## The problem

The share card shipped mobile-only (#1693). On the website dashboard's
community feed (`dashboardCommunity.jsx`, six shells) SHARE still sends
**text + a URL** — the exact dead-end the parent spec closed on mobile. And
desktop is where the renderer's **PNG-download** path is actually the primary
outcome: a member at a keyboard saves the story card and posts it from their
phone, or drags it anywhere.

## Direction

**Same renderer, ONE implementation — the `dashSignals.js` precedent** (one
canonical file; the website loads it, the mobile app imports it, Node tests
require it directly — the surfaces can never drift):

- **`shareCard.mjs` and `mealShare.mjs` MOVE to `public/newdesign/`** and
  become the canonical copies, served to the browser as native ES modules
  (`shareCard.mjs` imports `./mealShare.mjs` relatively, so they travel
  together; `mealShare.mjs` is pure and dependency-free).
- **Mobile re-points its two imports** (`iosAppBroadsheetClient.jsx`) to
  `../../../public/newdesign/…` — the exact path pattern `main.jsx` already
  uses for `dashSignals.js`; Vite's `server.fs.allow: ['..']` covers it and
  the production build bundles it identically. **Zero logic change.**
- **Tests re-point** their two import lines (`tests/share-card.test.mjs`,
  `tests/meal-share.test.mjs`).
- **Web loads it once per shell** via a one-line native module loader —
  deterministic, no reliance on babel-standalone passing dynamic `import()`
  through. The import uses the **canonical absolute URL** (never
  shell-relative — review round) so it can't mis-resolve from any document
  path:

  ```html
  <script type="module">
    import * as SC from '/newdesign/shareCard.mjs?v=20260713';
    window.ShapeShareCard = SC;
  </script>
  ```

  **Readiness is by construction, not by snapshot** (review round): module
  scripts finish executing before `DOMContentLoaded`, which is when
  babel-standalone transforms and runs the `text/babel` page code — so the
  global exists before any consumer renders. Belt-and-braces,
  `dashboardCommunity.jsx` reads `window.ShapeShareCard` **per render**
  (never captured once at load) and **degrades honestly when it's absent**
  (a stale-cached shell without the loader, or a failed module fetch): the
  chooser simply doesn't offer the image row — the link share always works.

## Entry points (mirrors mobile exactly)

1. **The feed card (`FeedItem`)** — on a member's **OWN real post**
   (`p.isMe && p.isLive && p.id`, the same gate EDIT/DELETE already use),
   SHARE opens a small **chooser** (the `SendPostModal` chrome): **Share
   link →** (today's behavior verbatim) / **Share as image →**. Everyone
   else's cards, demo cards, and signed-out preview keep the direct link
   share untouched — own-only v1, per the parent spec's guardrail.
2. **The Session details modal** — a Share affordance in
   `SessionDetailsModal`'s header, same own-real gate, opening the same
   chooser (the mobile Session details page is a named entry point; the web
   modal is its twin). ONE model-build function feeds both entry points so
   the image can never differ by door.

## The card model on the web

Built from the SAME mapped post the card just drew (`mapPost` gains three
pass-throughs it already has in hand: `createdAt` (raw `created_at`), the
normalized `route.points` pairs (the API row carries them; the bucket logic
already reads them), and the stamped `metrics.delta` string):

- `who` / role — the card's own author line.
- **`tierLine`** — `TIER · ROLE` when my tier resolves, else `ROLE` alone
  (honest-absent). Share is own-only, so only MY tier is ever needed: one
  lazy fetch at first share — coaches via `/api/coach/score?role=…`
  (`current_tier` string, coach ladder), members via `/api/client/score`
  (`current_tier.name`). The cache is **keyed by the authenticated user id**
  (review round — an account switch inside a live tab must never reuse the
  prior account's tier; unauthenticated resolves are never cached). A failed
  fetch degrades to the role-only line, never blocks the share.
- **Hero promotion is extracted, not re-implemented**: new pure
  **`bsHeroStat(stats, { isRun })`** exported from `shareCard.mjs` — the
  mobile card's `_primIdx` rule verbatim (runs promote `/dist/i`, lifts
  `/load|weight/i`, fallback: first digit+unit value, else index 0). The
  mobile card refactors onto it (one rule, both surfaces); the web feeds it
  `workoutStats` with `isRun = p.buckets.includes('run')` (the bucket already
  mirrors the app's endurance semantics from #1684/#1685). +test vectors.
- `meal` — `mapPost`'s existing meal object is already key-compatible with
  `bsMealMenuLines` (`kcal/p/c/f/planned/portion/recipeId/coach`); it passes
  through untouched. Meal-wave guardrails ride the shared renderer verbatim
  (the plate not the ledger, honest-absent macros, attribution only when true).
- `delta` — only a stamped `metrics.delta` (never computed client-side);
  a delta post renders the PR card type, same as mobile.
- Milestone/note posts with no hero and no stats render the honest minimal
  card (name · title · date) — identical to mobile's behavior.

## Flow and outcomes

`bsShareCardImage` is unchanged: fonts (`document.fonts.load` — the shells
already load Space Grotesk + JetBrains Mono via the pageShell font link) →
canvas → `toBlob` → `File` → `navigator.canShare({files})` → OS sheet on
share-capable browsers (phones); otherwise **download the PNG** (the desktop
default). Abort silent; render failure → the page's existing alert pattern;
a successful download shows no alert (the browser's own download UI is the
confirmation). No uploads, no analytics — nothing leaves the machine beyond
the share sheet / the downloaded file.

## Out of scope

- Native Instagram Stories deep-link (rides the iOS build — unchanged shelf).
- Rebroadcasting other members' content as images (own-only stands).
- The standalone marketing/community pages — the chooser ships where the
  real feed lives (`dashboardCommunity.jsx`'s six shells).

## Acceptance criteria

1. On every shell that hosts the real feed (ClientApp · TrainerApp ·
   NutritionistApp · the three Community pages), SHARE on my own real post
   offers **Share as image →**, producing the 1080×1920 fixed-dark PNG —
   OS share sheet where files are shareable, PNG download otherwise.
2. The image for a given post is **composition-identical to the mobile
   card's** (same model fields, same renderer, same hero-promotion rule).
3. The Session details modal offers the same share for own posts only.
4. Honest-absent everywhere: missing hero/macros/delta render ABSENT; the
   tier line falls back to role-only when the tier fetch fails.
5. Other members' cards, demo cards, and signed-out preview are byte-identical
   to today (direct link share, no chooser).
6. Mobile is behavior-identical (imports re-pointed only); the suite stays
   green with the new `bsHeroStat` vectors added.
7. A stale-cached shell (no loader) degrades to link-share-only — no error.

## Build plan

**One PR:** move the two `.mjs` canonicals to `public/newdesign/` + re-point
the two mobile imports and two test imports · extract `bsHeroStat` (+
vectors, mobile card refactors onto it) · `mapPost` pass-throughs · the web
chooser + both entry points + the tier-line resolver ·
the module loader + `dashboardCommunity.jsx?v` bump across the six shells.
Verified per house gates: JSX parse · `tsc --noEmit` · `npm test` ·
PowerShell `/m/` build exit 0 · LF.
