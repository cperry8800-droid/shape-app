# Workout auto-share: device + in-app workouts post to the feed by the member's own privacy (design)

**Date:** 2026-07-08 · **Spec 2 of 2** — rides on Spec 1
(`2026-07-08-community-following-feed-design.md`, built as #1610: the
Universal/Following feed + the `followers` privacy tier). **Hard dependency:**
the Spec 1 build must be merged AND its migration applied before this build
lands — this feature writes `followers` posts.

**Surfaces:** the 5 device sync routes (`src/app/api/integrations/{strava,
apple-health,oura,whoop}/sync/route.ts`, `garmin/webhook/route.ts`) · the
in-app session save (`shapeBackend.js saveWorkoutSessionLog`) · mobile Settings
(the Share-workout-data toggle) · **no migration** (Spec 1's tier is the only
schema change).

## Context

The auto-post pipeline already exists — Strava/Apple Health/Oura/Whoop syncs
upsert one `community_post` per device workout (full stat set, privacy-zoned
route, per-source dedup on `source_provider + source_activity_id`) — but every
route hardcodes **`privacy: 'private'`**, so device workouts never reach the
feed or other viewers. Meanwhile Settings ships a **"Share workout data"**
toggle whose copy promises exactly this feature ("your logged workouts, PRs,
and activity can appear on your profile and in the community feed") — and it is
a **dead switch: nothing reads it** (verified repo-wide). Two sources are also
inconsistent: **Garmin** syncs `activities` but never posts, and **in-app
logged sessions** never post (only PRs reach the PR Wall).

Owner-ratified model: a member's workouts share **automatically**, scoped by
their own privacy — Public profiles reach the Universal feed, Just-friends
members reach only their followers' Following feeds, Private (or Share off)
stays self-only (the linked coach still sees workouts through the coach client
view, which reads `activities`/`workout_sessions` and is unaffected by post
privacy).

## The share-resolution rule (one source of truth)

`workoutSharePrivacy(shareOn, visibility)`:

| `shareWorkoutData` | `profileVisibility` | Post privacy | Reaches |
|---|---|---|---|
| On (default) | Public (default) | `public` | Universal feed + profile (anyone) |
| On | Just friends | `followers` | Following feeds of accepted followers + profile (followers) |
| On | Private | `private` | Self only (coach via client view) |
| Off | any | `private` | Self only (coach via client view) |

- Both fields live in the **`user_goals('client_settings')`** doc
  (`shareWorkoutData: 'On'|'Off'`, `profileVisibility: 'Public'|'Just friends'|
  'Private'`). **A missing doc or missing field resolves to the default**
  (On · Public → `public`) — matching the Settings pills' first-option defaults,
  so a member who never opened Settings auto-shares publicly out of the box
  (the owner's "automatic" requirement), and the first-run notice (§5) tells
  them.
- Implementations: a pure map + tiny doc-reader in **`src/lib/workout-share.ts`**
  (`resolveWorkoutSharePrivacy(client, userId)` — one read per sync run) for
  the 5 routes, and a pure twin **`mobile-app/src/services/workoutShare.mjs`**
  (+ `tests/workout-share.test.mjs`) for the in-app poster, which reads the
  same settings doc the mobile Settings page already loads.

## Design

### 1. The 4 existing syncs honor the rule
Each route resolves the member's share privacy once per sync and passes it into
its post payload builder, replacing the hardcoded `privacy: 'private'`. The
Strava `metrics.tags` `'PRIVATE'` literal becomes the resolved level's tag
(`'PRIVATE'` only when private; no tag when public/followers). Nothing else in
the payloads changes; the per-source upsert dedup stays. On the **update**
branch (re-sync of an existing post), privacy is NOT re-written — the member
may have retro-tightened (§4); syncs never loosen an existing post.

### 2. Garmin joins the pipeline
`garmin/webhook/route.ts` gains the same `community_posts` upsert the other
providers have (summary stats — sport, duration, distance, calories, avg HR —
in the Whoop payload shape; no per-second streams), deduped on
`source_provider: 'garmin'` + the activity's `summaryId`, privacy from the same
resolver (admin client + the mapped user id — the webhook is service-role).

### 3. In-app logged sessions auto-post
After a successful `saveStructuredWorkoutSession` persist, `shapeBackend.js`
builds a post from the session (title, move count, duration, top stats in
`metrics.workoutStats`; `source_provider: 'shape'`, `source_activity_id` = the
session id for idempotency) and creates it with the privacy from the `.mjs`
resolver — **best-effort, fire-and-forget, never blocks the save** (same
pattern as the award RPC). The demo/signed-out path never posts.

### 4. Cross-source dedup (the one new behavior)
Before creating (not updating) a workout post, the writer checks the member's
recent posts for a **different-source workout within ±20 minutes of the same
start time** (`source_provider is not null`, different provider) — if found,
skip the post (the `activities`/session persistence still happens; only the
social post is skipped). Pure helper `isDuplicateWorkoutPost(existing, startISO)`
in the `.mjs`/`.ts` pair, unit-tested. First-writer-wins; a skipped post logs
nothing to the user (no error).

### 5. Retro-tighten + first-run notice
- **Tightening is retroactive; loosening is not.** When Settings changes either
  field such that the newly-resolved level is **stricter** (public → followers
  → private), the client bulk-updates ALL past auto-posts
  (`author_id = me AND source_provider is not null`) to the new level (existing
  owner-update RLS covers it). Loosening (e.g. Private → Public) affects only
  future workouts — never surprise-publishes a back-catalogue. Manual composer
  posts (`source_provider null`) are never touched. Exposed as
  `ShapeCommunity.tightenAutoPosts(newLevel)`, called from the Settings
  `setPref` handler for the two keys.
- **First-run notice:** the first time a member's auto-post resolves to
  `public`/`followers`, write one in-app notification — "Your workouts now show
  on your profile and in the community feed · manage in Settings → Share
  workout data" — deduped by a `user_goals('client_settings').autoShareNoticeAt`
  stamp (no new notification type/preferences plumbing; plain `createNotification`,
  in-app only).

### 6. Blast-radius (checked)
- **No +5 farming:** auto-posts never call `award_community_post` (only the
  composer path does); the workout itself already earns its +10.
- **PR Wall** unchanged (separate channel + its own public-profile gate).
- **Oura/Whoop post workouts only** — sleep/recovery snapshots never become
  posts (unchanged, restated as a constraint).
- The dead Settings toggle's copy is already accurate once this ships — no
  copy change needed; the toggle simply becomes real.
- Feed queries need no changes — Spec 1's modes already read `followers`.

## Out of scope
- Composer alignment (a "Followers" option on manual posts) — follow-up.
- Real "delete on unfollow" semantics (RLS already hides `followers` posts from
  ex-followers instantly — nothing stored per-viewer).
- Coach-side surfaces; Score changes; any migration.

## Acceptance criteria
1. Default member (no Settings doc): a Strava sync creates the post `public`;
   it appears in Universal + on their profile; the +10 workout award still
   fires; no +5 community award.
2. Just-friends member: sync posts land `followers` — visible in an accepted
   follower's Following feed and on the profile to followers; absent from
   Universal, anon, and non-followers.
3. Private member or Share=Off: posts land `private` (self-only), coach client
   view unaffected.
4. Garmin webhook activity creates a deduped post with the same rules; a
   re-delivered webhook doesn't duplicate.
5. In-app logged session auto-posts once (session-id idempotent); a device sync
   of the same workout within ±20 min does not double-post (and vice versa).
6. Flipping Share Off (or visibility to Private) flips every past auto-post to
   the stricter level; manual posts untouched; flipping back On does NOT
   re-publish old posts.
7. First qualifying auto-post produces exactly one in-app notice, ever.
8. Re-syncs update stats without loosening a tightened post's privacy.
9. Pure rule + dedup helper unit-tested (`.mjs` in the suite); tsc clean; all
   sync routes parse/typecheck; mobile build green.

## Verification
Unit tests for the rule + dedup; `tsc --noEmit`; mobile build + `npm test`;
staging: sync a Strava workout on a test account through the share matrix
(Public/Friends/Private × On/Off) + the retro-tighten flip; on-device pass
rides the standing list.
