# Meals on the wire — share-by-choice meal posts on the community feed

**Date:** 2026-07-12 · **Status:** Spec for owner review (build follows approval)

## The problem

Nutrition is half the daily loop and socially invisible. Every proof-of-work
card on the community feed is training — workouts, runs, PRs — while the Eat
side (the meal logger "Correct the Record", real food search #1648, barcode
#1662, the Kitchen Card catalogue #1627) produces nothing a coach can co-sign
or a member can react to. The web dashboard's demo feed has modeled the answer
for weeks (the sheet-pan-salmon meal card + a MEALS filter tab) but no real
writer exists on either surface, and the reaction grammar already reserved a
verb for it (`nutrition → "Locked in"`, `reactionVerbs.mjs`). Nutritionists —
half the marketplace — have no public surface where their plans visibly feed
people.

## Owner-locked direction (2026-07-12)

1. **Share by CHOICE — per meal, default off, never auto.** Sharing is a
   deliberate act on the logged confirmation. No remembered default that
   silently posts, no auto-share path for meals ever (the #1613 workout
   auto-share pattern explicitly does NOT extend here).
2. **The plate, not the ledger.** A shared meal shows the meal name, the
   macro line (kcal · P · C · F), and honest attribution. It NEVER shows the
   member's running totals, deficit, targets, or weight data — those are
   private instrument-panel numbers.
3. **No +5 community-post award on meal shares** — the meal log already earns
   its own award (`award_meal_log`, #1558); per-meal +5s are a farm vector.
4. **No calorie leaderboards, no "lightest plate" framing anywhere, ever.**
   Macros are stated facts on the member's own card. No comparative UI, no
   sorting by kcal, no lowest/highest anything.
5. **Coach/plan attribution only when true** (the honest-absent rule): "From
   {coach}'s plan" or a Kitchen Card recipe link renders ONLY when the logged
   meal actually came from the assigned plan or a catalogue recipe.

## The share moment (mobile, `BSMealLogged`)

The logged confirmation (`iosAppBroadsheetClient.jsx` `BSMealLogged` — the
"Logged · {kcal} kcal" screen with Done / Undo) gains one quiet secondary
action under the primary row:

- **`Post to the wire →`** — mono, ghost, the same grammar as the screen's
  existing actions. One tap posts and swaps the row to `✓ On the wire ·
  Community` (mono, teal). No modal, no second step — the choice IS the tap.
- **Undo symmetry:** the screen's existing Undo (un-logs the meal) also
  deletes the shared post when one was made — a retracted meal never leaves
  a ghost card on the feed.
- The action renders only for signed-in members (the logger already gates on
  membership); it never renders in coach preview contexts.

## Data contract (no schema change)

The share posts through the existing pipe — `window.ShapeCommunity.createPost`
→ `createCommunityPost` (`shapeBackend.js`) → `community_posts` under RLS:

```js
{
  title: mealName,                      // "Sheet-pan salmon, sweet potato & broccoli"
  activityType: 'meal',
  privacy: <member's normal post privacy — same vocabulary as every post>,
  metrics: {
    kind: 'meal',
    kcal, p, c, f,                      // the logged macros (post-portion)
    portion,                            // only when ≠ 1×
    recipeId,                           // ONLY when logged from a Kitchen Card recipe
    coach,                              // ONLY when logged from the assigned plan
    planned: true|false,                // "as planned" vs adjusted (bsMealDirty)
  },
  skipAward: true,                      // rides the autoShare-style award skip
}
```

`bsMealDirty` / the logger's existing state provides `planned` and the macro
set; `recipeId`/`coach` come from the meal's plan/recipe source fields and are
**omitted entirely** when absent — never empty strings.

## Scoring & anti-farm (defense in depth)

- **Client:** the share call passes the existing award-skip (the same
  mechanism `autoShare: true` uses in `createCommunityPost`), so the app path
  never invokes `award_community_post` for a meal share.
- **Server (migration, owner applies):** `award_community_post` gains a guard
  — it returns 0 when the post's `metrics->>'kind' = 'meal'` (or
  `activity_type = 'meal'`) — so a meal share via the WEB route (which calls
  the RPC unconditionally on every insert) can never award either. Migration
  file: `2026-07-12-meal-share-no-award.sql`; verified live before PR B
  merges.
- `award_meal_log` (+10 for the log itself) is untouched — logging pays,
  re-broadcasting doesn't.

## The card

**Mobile (community stream):** `bsActivityFromPost` accepts
`metrics.kind === 'meal'` in its activity gate and returns a meal-shaped card:
`typeLabel: 'Meal'`, the meal name as title, a 3-up stats row
(`Calories · {kcal}` / `Protein · {p}g` / `C·F · {c}g·{f}g`), the note as
body, attribution row only when `coach`/`recipeId` ride the post. The
reaction verb resolves automatically — `bsActivityBucket('meal') → nutrition
→ "Locked in"`. The detail page renders the macro plate; no traces, no zones
(meals carry neither — honest-absent keeps them hidden).

**Web (dashboard feed):** real meal posts keep `kind: 'post'` (the renderer
contract from #1684) and gain a compact **macro plate** on the post card
(kcal · P · C · F + attribution, the same visual weight as the session strip)
when `metrics.kind === 'meal'`. The demo `MealStat` renderer is untouched.

## Filters (#1684 rails)

- **Mobile:** the chip row gains **Meals** (All / Workouts / Runs / PRs /
  Meals). `bsFeedTypeMatch` files `kind === 'meal'` or the nutrition bucket
  under `meals` and excludes it from `workouts` (a meal is not a workout).
- **Web:** `bucketsFor` returns `['meal']` when `metrics.kind === 'meal'` —
  the MEALS tab goes live for real posts. Buckets stay non-exclusive
  elsewhere; meals don't cross-file.

## Privacy & ownership

Same vocabulary as every community post: the member's post privacy applies
(public / community / followers), RLS enforces visibility on both surfaces
(verified identical in the 2026-07-11 feed-parity audit), and the standard
ownership paths (edit caption / delete from the card menu) work because a
meal share IS a community post — no parallel machinery.

## Acceptance criteria

1. The share action is **off by default on every meal** — logging N meals
   with no taps produces zero posts.
2. One tap on `Post to the wire →` → the meal card is visible on the app
   COMMUNITY stream and the web dashboard feed (same post, both surfaces).
3. The card's reaction chip reads **`LOCKED IN · {count}`** and the unified
   count behaves exactly like every other post.
4. Sharing changes the member's score ledger by **exactly 0** (app path AND
   web route path — the RPC guard covers both); the meal log's own award is
   unchanged.
5. The Meals chip (app) and MEALS tab (web) show the shared meal; it does
   not appear under WORKOUTS/RUNS/PRs on either surface.
6. Attribution renders ONLY for plan/recipe-sourced meals; a freehand logged
   meal shows no coach line and no recipe link.
7. Undo on `BSMealLogged` removes both the log and the shared post; the feed
   never shows a card for a retracted meal.
8. No comparative calorie UI exists anywhere in the build — no sorting,
   ranking, or min/max framing on any surface.
9. Reduced motion and all three papers are unaffected (the card introduces
   no new animation).

## Out of scope (v1)

- Web-side share authoring (the web logger can't compose meal posts yet).
- Meal photo upload in the share (recipe-sourced meals may later render the
  catalogue image; not in v1).
- Auto-share for meals — permanently out, not deferred.
- Demo meal cards in the mobile stream (web demo keeps its existing one).
- Nora tools for sharing ("share my lunch") — separate proposal rails.

## Build plan

- **PR A (mobile + migration):** share action on `BSMealLogged` + payload
  builder (pure, tested) + `bsActivityFromPost` meal branch + Meals chip +
  `2026-07-12-meal-share-no-award.sql`.
- **PR B (web):** `bucketsFor` meal branch + the post-card macro plate +
  MEALS tab live. Merges only after the migration is applied + verified.
