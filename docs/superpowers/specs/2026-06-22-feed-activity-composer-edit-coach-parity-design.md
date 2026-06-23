# Feed activities: post (photo + video) · edit own posts · coach stat parity

**Status:** DRAFT — design approved in brainstorming 2026-06-22, pending spec review.
**Surfaces:** mobile broadsheet (`/m/`) + website dashboard community feed.
**Migrations:** NONE required (owner `UPDATE`/`DELETE` RLS already exist; storage buckets exist).

## Overview

Make the in-chat **community feed** a first-class place to post, edit, and view
activities with media. Four workstreams:

- **A. Full "Log activity" composer on the feed** — Note / Photo / Video / Workout
  (with stats) / Link, posted directly from the feed (not only from the profile).
- **B. Edit (and delete) your own feed posts** — reopen the composer pre-filled to
  change text or **add/replace/remove a photo or video later**.
- **C. Website parity** — the website feed composer (`PostComposer`) gains video +
  the activity types, and an edit path.
- **D. Coach activity-stat parity** — a coach's activity post shows the **same** stat
  set as a client's (summary grid, HR zones, cadence/elevation/pace traces, splits).

## Goals / non-goals

**Goals**
- Posting a workout/activity **with photo or video** is reachable from the feed, both
  surfaces.
- A user can **edit their own** feed post any time (text + media + workout fields) and
  delete it.
- Coach posts render at full stat parity with client posts.

**Non-goals (this spec)**
- No change to who can *see* a post (existing privacy/visibility model untouched).
- No new analytics, no new storage buckets, no schema changes.
- Not reworking the reaction/cosign system.

## Current state (verified in code)

- **Render already supports both media.** `BSActivityBody`
  (`iosAppBroadsheetClient.jsx:7422`) renders an inline `<video controls>` for an
  uploaded clip or a play-card for a YouTube/Vimeo link, and `communityPostFromRow`
  (`shapeBackend.js:1859`) maps `.photo` and `.video`.
- **Rich composer exists but is profile-only.** `BSLogActivitySheet`
  (`iosAppBroadsheetClient.jsx:7444`) does Note/Photo/Video/Workout/Link; video →
  `ShapeCoachMedia.upload` (public `coach-media` bucket, video mimes), photo →
  `ShapeCommunity.uploadPhoto` (public `community-photos` bucket). It is mounted only
  from the member Terrain profile (`:8797`) and coach Signal profile (`:9307`).
- **In-chat feed composer is photo-only.** `BSMessageComposer` (`:11655`) has a 📷
  button (`onPhoto`) and @-tag, but **no video**. The feed's `onFeedPhotoFile`
  (`:10571`) uploads to `community-photos` and posts with `photoUrl`.
- **Website composer is photo-only.** `PostComposer` (`dashboardCommunity.jsx:874`)
  has `ADD PHOTO`, no video, no activity-type selector.
- **No edit path exists.** There is no `updateCommunityPost` (mobile) and no PATCH on
  `/api/community/feed`. **But** `community_posts` already has owner-scoped RLS for
  both update and delete (`supabase-migrations/2026-05-02-community-feed.sql:93-104`:
  `for update using (author_id = auth.uid()) with check (author_id = auth.uid())` and
  `for delete using (author_id = auth.uid())`). So edit/delete need code only, no
  migration.
- **Stat richness is role-agnostic in code.** `bsActivityFromPost` (`:7338`) derives
  the full stat grid / zones / traces / splits purely from `workoutStats` +
  `rawMetrics` (device streams) — role is never read. The coach-vs-client gap in the
  screenshots comes only from the demo `COMMUNITY_ACTIVITIES` array (`:10772`), where
  the demo coach entries (Sofia Park `:10780`, Maya Okafor `:10781`) were authored thin
  while the demo client entries (Drew `:10774`, Priya, Lena, Marcus) carry the full set.

## Design

### A. Full "Log activity" composer on the feed

- **Mobile.** Keep the quick text+📷 `BSMessageComposer` for fast messages. Add a
  compact **`＋ Log activity`** affordance in the feed composer's left button cluster
  (beside 📷/@) that opens the **existing** `BSLogActivitySheet`. No new composer is
  built — we mount the proven one from the feed.
  - The sheet posts via `createCommunityPost`. From the feed it must land on the feed:
    pass the **active feed channel** (`filter`/`myRoleChip`, same logic `post()`/
    `onFeedPhotoFile` use) and **feed visibility** (`privacy: 'community'`), and wire
    `onPosted` to refresh the feed list (optimistic insert + refetch, mirroring
    `onFeedPhotoFile`).
  - The sheet's existing 3-state visibility (Public / Profile / Just me) is preserved;
    default when opened from the feed = Public/Community so it shows in the feed.
- **Reuse, not fork.** One composer (`BSLogActivitySheet`) is the single create/edit
  surface across profile + feed — avoids the drift the worklog warns about.

### B. Edit + delete your own posts

- **Sheet gains an `editPost` prop.** When present, `BSLogActivitySheet` opens in edit
  mode: it seeds type + title/body + existing photo/video (+ workout fields) from the
  post, the primary action becomes **Save** (calls update, not create), and a
  **Delete post** action is shown. Add/replace/remove media uses the same upload paths;
  "remove" clears `photo_url` / `metrics.video_url`.
- **Edit affordance** renders only on **your own** posts (`mine === true`) — an **Edit**
  control in the post's action area on the feed card (and the profile feeds, since they
  share rendering). Tapping opens the sheet with `editPost`.
- **Backend `updateCommunityPost({ postId, title, note, photoUrl, video, metrics, privacy })`**
  (`shapeBackend.js`): owner-scoped
  `supabase.from('community_posts').update(patch).eq('id', postId).eq('author_id', uid)`
  (RLS double-enforces ownership), mirroring the `member_playlists` update pattern
  (`:3551`). **Metrics merge carefully**: spread existing `metrics` and overlay only the
  changed keys (preserve `workoutStats`, `coach`, `program`, `delta`, `mentions`, `kind`
  unless the edit changes them); allow setting/clearing `video_url` and the row's
  `photo_url`. Never lets a client change `author_id`/`activity_type` identity keys.
- **Delete `deleteCommunityPost({ postId })`**: owner-scoped delete (RLS-gated). The
  edit sheet's Delete action calls it, then removes the card from the feed.
- **"edited" indicator (cheap-only):** if `community_posts.updated_at` exists, show a
  subtle `· edited` label when `updated_at` meaningfully exceeds `created_at`. If the
  column is absent, skip it (no migration just for the tag).

### C. Website parity

- **`PostComposer` (`dashboardCommunity.jsx`)** gains a small **type selector**
  (Note / Photo / Video / Workout / Link) matching the mobile sheet's capabilities, and
  **video upload** (to the public `coach-media` bucket via `window.shapeDb.client.storage`,
  the same path the existing photo upload uses for `community-photos`). The post carries
  `metrics.video_url` so the website `FeedItem` renders it (add a `<video>` branch to
  `FeedItem`, mirroring its `<img>`).
- **Edit on the website:** an **Edit** control on the viewer's own `FeedItem` reopens
  `PostComposer` pre-filled; Save issues a **PATCH** to `/api/community/feed` (new
  handler that does the same owner-scoped `community_posts` update), or a direct
  RLS-scoped client update — implementation picks the path that matches the existing
  feed route style. Delete = owner-scoped delete.

### D. Coach activity-stat parity

- **Demo enrichment (the actual fix):** fill out the demo coach activities in
  `COMMUNITY_ACTIVITIES` so they carry the **same shape** as the comparable client
  activities:
  - **Sofia Park** (Nutritionist, run): add a full `stats` grid (Distance, Avg pace,
    Best pace, Time, Avg HR, Max HR, Cadence, Elevation, Calories, Stride, Ground,
    Training), `zones`, `trace`, `cadenceTrace`, `elevTrace`, `paceTrace`, and a
    `breakdown` (mile splits) — values realistic for a 5.1 mi easy Z2 run.
  - **Maya Okafor** (Trainer, strength): add a strength `stats` grid (Avg/Max HR,
    Calories, Volume, etc.), `zones`, `trace`, and a `breakdown` (working sets) like the
    client strength demos (Priya/Casey).
- **Confirm role-agnostic for real posts (no code change expected):** verify in
  `BSActivityDetail` (`:9794`) that nothing branches stat rendering on author role;
  confirm the composer's Workout type exposes identical stat fields regardless of role
  (it's the same shared `BSLogActivitySheet`). Document the confirmation.
- **GPS box:** the demo route tile is tinted by the author's **tier color** (Drew=Legend
  teal vs Sofia=Base steel) — that's expected and not a stat gap; both client and coach
  demos use `route: true` with no points, so they are already at parity on the route
  surface. No change needed beyond the enrichment above.

## Data & security

- **No migration.** `community_posts` owner `UPDATE` + `DELETE` RLS already present
  (2026-05-02). Storage buckets `community-photos` (image) and `coach-media` (image +
  video) already exist with owner-write/public-read RLS.
- Update/delete are double-guarded: owner-scoped `.eq('author_id', uid)` in code **and**
  the RLS policy. `author_id` and `activity_type` are never client-mutable on edit.
- Video size: clips ride the existing `coach-media` path (its current limits apply); no
  new limit logic in this spec.

## UI / house style

Follow the broadsheet instrument-plate house style (per the `ui-ux-pro-max` skill): the
`＋ Log activity` control and the Edit/Delete affordances use the existing composer's
button idiom (squared, hairline border, accent only when active); no colored emoji added
(monochrome glyphs per the worklog rule). The edit sheet reuses `BSLogActivitySheet`
chrome verbatim, so it inherits the approved look.

## Testing / verification

- `node -e` JSX parse-check on edited `.jsx`; `tsc --noEmit` if any TS route touched
  (website PATCH); mobile build + `public/m` resync (PowerShell, `VITE_BASE=/m/`).
- Manual: from the feed, post a workout with a photo and (separately) a video — both
  render inline in the card + detail. Edit one to add a video later → it appears. Delete
  → card disappears. Confirm a coach demo activity detail now shows the full grid +
  charts identical to a client's.
- Verify a non-owner sees no Edit/Delete control and (belt-and-braces) an update/delete
  of someone else's post is rejected by RLS.

## Out of scope / follow-ups

- Editing the *structured* workout stats beyond what the sheet exposes (e.g. per-set
  rewrite) — the sheet's existing fields are the edit surface.
- Server-side video transcoding / thumbnails / size caps beyond the bucket's current
  limits.
- An "edit history" / audit trail.
- Wiring real GPS polylines for demo activities (demo uses tinted route tiles by design).
