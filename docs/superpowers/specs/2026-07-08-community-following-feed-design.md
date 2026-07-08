# Community feed: Universal / Following toggle + `followers` privacy tier (design)

**Date:** 2026-07-08 · **Surfaces:** mobile chat Community feed (`BSClientFeed`,
`iosAppBroadsheetClient.jsx`) + website community feed (`dashboardCommunity.jsx`,
`GET/POST /api/community/feed`) · **One migration** (privacy tier + RLS).
**Spec 1 of 2** — Spec 2 (auto-posting device + in-app workouts) rides on this
feed model and is written after this ships.

## Context

Today the community feed is **global**: every signed-in member sees every
`public`/`community` post (mobile `shapeBackend.js:2399`, web
`api/community/feed/route.ts:46`). There is no way to see "just the people I
follow," and no privacy tier between "everyone" and "profile-only" — so a
friends-visibility member's activity can never appear in ANY feed without being
shown to strangers.

Owner-ratified model (this spec):

- **The feed gains a two-mode viewing lens** — the Twitter For-You/Following ·
  Strava Following/Discover pattern:
  - **UNIVERSAL** (default): the whole community's public activity — exactly
    today's feed. Only `public`/`community` posts. Friends-only and private
    content never appears here.
  - **FOLLOWING**: posts from the people the viewer follows (accepted follows,
    `user_follows.status='accepted'`) plus the viewer's own posts. Shows those
    authors' `public`/`community` posts AND their **`followers`** posts.
- **New `followers` privacy tier**: visible to the author + their accepted
  followers, nowhere else. This is how a Just-friends member's activity reaches
  the feed *of their friends only* — friends follow via the existing
  follow-request approval (`2026-06-08-follow-requests.sql`), so "my followers"
  ≈ "my friends" for a friends-visibility profile.
- **Default mode: Universal** (small community — a newcomer who follows nobody
  must land on activity, not emptiness). The choice persists per device; the
  default can flip to Following later once follow graphs fill in.

Sharing intent (locked with the owner, enforced in Spec 2 for workout
auto-posts): Public profile → `public` · Just friends → `followers` · Private →
`private` (self + linked coach via the coach's client view — no social
visibility). This spec only *creates* the `followers` tier; nothing writes it
yet (the composer keeps its current 3 options — see Out of scope).

## Design

### 1. Migration — `2026-07-08-followers-post-visibility.sql` (idempotent)

Follows the `2026-06-09-community-profile-visibility.sql` pattern exactly:

- **Widen the CHECK**: `privacy in ('public','community','private','profile','followers')`.
- **`can_view_community_post(p_post_id)`** gains one clause: a `followers` post
  is viewable when `p.author_id = auth.uid()` OR
  `exists (select 1 from public.user_follows f where f.follower_id = auth.uid()
  and f.following_id = p.author_id and f.status = 'accepted')`.
- **`"read visible community posts"` RLS policy** gains the same clause
  (mirrors the function, as the existing policy does for the other tiers).
- Because `community_likes` / `community_comments` RLS gate through
  `can_view_community_post`, **engagement on `followers` posts works for
  followers automatically** — no further policy changes.
- `user_follows` is public-read with indexes on both columns
  (`2026-06-08-user-follows.sql:22-30`), so the RLS subquery is cheap and the
  feed filter below can read the graph directly.

Owner runs it on Supabase (raw GitHub link per convention). All code degrades
cleanly pre-migration: nothing writes `followers` yet, and the Following mode
filter works against existing tiers.

### 2. Feed modes — one query change per surface

**Mobile** (`listCommunityPosts`, `shapeBackend.js:2392`): gains a `mode`
argument (`'universal'` default | `'following'`).
- `universal`: unchanged — `.in('privacy', ['public','community'])`.
- `following`: fetch the viewer's accepted following ids once
  (`user_follows.select('following_id').eq('follower_id', uid).eq('status','accepted')`,
  capped 500, cached ~60s alongside the existing feed caching), then
  `.in('author_id', [...ids, uid]).in('privacy', ['public','community','followers'])`.
  RLS remains the authority — the client filter is a narrowing convenience, so
  even a stale cache can never over-expose.
- Signed-out: no follow graph — both modes render the existing demo set
  (labelled preview, unchanged).

**Website** (`GET /api/community/feed`): accepts `?mode=following`; same
two-step query server-side with the caller-scoped client (RLS-gated). Response
shape unchanged.

**Profile activity feeds need no change**: they query by author and RLS now
filters `followers` rows per viewer — a friends-member's profile shows their
activity to accepted followers and hides it from strangers automatically.

### 3. The toggle UI (mobile + web)

- **Mobile**: at the head of the COMMUNITY feed in `BSClientFeed`, a two-item
  **typographic underline index** in the house tab grammar (`bsSubTab` pattern
  from #1596 — active = ink + drawn underline, `aria-pressed`, 44px targets):
  `UNIVERSAL · FOLLOWING`. Switching swaps the feed in place (same list chrome,
  loading state per mode). Choice persists to `localStorage('shape.feedMode')`;
  default `universal`.
- **Website** (`dashboardCommunity.jsx`): the same two-mode index above the
  feed column, `localStorage('shape.feedMode')`, `?v=` bump on the consumer
  pages.
- **Following empty state** (honest, sells the action): "You're not following
  anyone yet." + up to 3 **suggested people** from the existing
  `get_follow_suggestions` RPC (avatar + name + Follow pill, the search-row
  wiring) + a `SEE EVERYONE — UNIVERSAL →` text-action that flips the mode.
  Signed-in with follows but no posts: "Nothing from your people yet ·
  UNIVERSAL →".

### 4. Blast-radius notes (checked)

- **`award_community_post` (+5)** requires `privacy in ('public','community')`
  (`2026-06-18-score-ledger-awards.sql:38`) — unchanged on purpose. Nothing
  creates `followers` posts until Spec 2, and auto-posted workouts should NOT
  earn the authored-post +5 anyway (the workout already earns its own +10);
  Spec 2 restates this.
- **PR Wall** posts to a channel, not the feed — unaffected.
- **`normalizePrivacy`** (web route) and mobile `privacyToDb` learn the new
  value but the composer keeps its current 3 options.
- **Unread/notification paths** don't key on feed privacy — unaffected.

## Out of scope (deliberate)

- **Spec 2 — workout auto-posting**: the share-resolution helper
  (Public→`public` / Friends→`followers` / Private-or-off→`private`), wiring
  the 4 device syncs + Garmin + in-app sessions, cross-source dedup, the
  retroactive tighten-on-privacy-change, the first-run heads-up, and making the
  dead `shareWorkoutData` toggle real. Written after this ships.
- **Composer alignment**: the manual composer's Public/Profile/Just-me options
  stay; adding a "Followers" option (or mapping Public→followers for
  friends-visibility members) is a candidate follow-up after Spec 2.
- Flipping the default mode to Following (revisit once follow graphs fill in).

## Acceptance criteria

1. Universal mode is byte-identical in content to today's feed (public +
   community posts, everyone).
2. A `followers` post by author A appears in FOLLOWING for an accepted
   follower, does NOT appear in UNIVERSAL for anyone, does not appear anywhere
   for a non-follower (including A's profile feed), and is likeable/commentable
   by followers.
3. FOLLOWING shows only posts authored by the viewer's accepted follows + the
   viewer; pending/declined follows don't count.
4. Mode persists across app restarts per device; default is UNIVERSAL.
5. Following empty state shows follow suggestions + the Universal escape; no
   blank screen at any state (loading/empty/error).
6. Signed-out preview: both modes render the demo set; no errors from the
   missing follow graph.
7. Pre-migration, the app runs unchanged (no `followers` rows exist; Following
   mode still filters correctly).
8. Theme tokens only, 44px targets, `aria-pressed` on the mode index, i18n-
   extractable strings; website pages get `?v=` bumps.

## Verification

Parse-check both JSX surfaces + shapeBackend; mobile build; `npm test`;
migration validated read-only against prod (columns/policies resolve) before
the owner runs it; staging click-through of both modes + the empty state;
on-device pass rides the standing list.
