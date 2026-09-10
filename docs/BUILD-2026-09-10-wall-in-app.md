# Build brief — the Wall in the app (2026-09-10)

> ⚠ **BUILT 2026-09-10.** The migration, the public read, the Wall segment, *Your best*,
> *Post a PR* and the Home entry point all shipped — see the WORKLOG entry of the same date for
> what changed against this plan (the Home card registry this brief points at turned out to be dead
> code; a session's PRs are deliberately not linked to the session post). **The migration is owed on
> Supabase.** What remains from §7: the coach Today-rail one-tap Stamp, and the website's use of the
> same read (on hold with the website).

**Spec:** [`REVIEW-2026-09-10-index-page.md`](REVIEW-2026-09-10-index-page.md) §7, approved by the
owner (*"looks good i like it"*), then *"yes lets implement the new chat/wall look on app"* and
*"lets put the website update on hold for now"*. **Scope of this build: the app only** — the
migration, the public read, the Wall segment in the Chat tab with the full-record plates, the
online rail's Hide/Show, *Your best* + *Post a PR*, a Home *"On the wall"* card. The homepage
(direction E, the type system, the wire) is **on hold**. Preview of the approved design: the
concept board's **W** tab (https://claude.ai/code/artifact/adc4c3d3-2922-4735-b379-f3640e12c016).

This file is what a fresh session needs so nothing below is re-derived. Every line reference was
read in the source on 2026-09-10 at `main` = `7d23eb8` (branch
`claude/design-index-page-review-6vwcvw` = `98ddfa2` + this brief). Re-verify with
`git fetch origin main && git rev-parse HEAD origin/main` before editing (WORKLOG rule).

## 0. Ground truth, read from the code

**The Chat tab.** `BSClientFeed` — `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:17845–19357`,
wrapped for coaches by `BSClientChat` (`:19361`, `role` prop), mounted from `BSClientApp` at `:927`
with `openRequest={chatRequest}`.
- `tab` state (`useStateBSC('feed')`, `:17850`) ∈ `feed | teams | channels | support`.
- Masthead (`:18718–18744`): eyebrow `feed:masthead.eyebrow` ("Chat") + an `h1` whose text
  **follows the tab** (`:18736`: Feed → `titleFeed` "Community", Channels → "Channels", Support →
  "Support", else `titleTeam` "Your team"). *(Owner asked whether the heading updates per segment —
  it does; the Wall gets `feed:masthead.titleWall` "The Wall" in the same expression.)*
- **The online rail** (`:18746–18800`) renders **above the pills on every tab** — it is not gated on
  `tab`. Hide × / Show run through `useBSOnlineRailPref` (`:23230`) + `bsOnlineRailApply` /
  `bsOnlineRailPersist` (`client_settings.onlineRail`, per-uid mirror). **The Wall inherits it with
  zero changes** — the owner's "hide/show who is online" requirement is already met structurally.
- Pill row (`:18834`): `['feed','teams','channels','support']` in a `repeat(4, 1fr)` grid via the
  local `Pill` (`:18586`, teal fill when on, red unread badge).
- `tab !== 'feed'` (`:18841`) is an IIFE: `if (tab === 'channels')` returns at `:18956`,
  `if (tab === 'support')` at `:19010`, otherwise the Team body. **Add `if (tab === 'wall') return
  <BSWall …/>` before the Team return** (hooks stay above the `openProfile`/`openChat` early
  returns at `:18646`/`:18660` — the file's own warning).
- `loggedIn` (`:18506`) gates demo content everywhere on this page: **signed-in never shows the
  demo cast** (`realMode = loggedIn && postsLive`, `:19189`).

**The activity card IS the plate body.** `BSActivityCard({ a, ctx, hideAuthor, isLast, pagePad })`
(`:17348–17827`) already renders everything the owner asked the Wall plate to carry: avatar · name
· `TIER · ROLE` · `ago · city` · type tag (heat underline) · title · hero figure with count-up and
the `↑ PR {delta}` stamp (real posts, `a.delta`) · body · photo/video/link · *Programmed by* ·
meal plate · milestone block · secondary stats disclosure · *Session details · full activity*
(opens `BSActivityDetail` with `zones`, `trace`, cadence/elev/pace/power traces, `breakdown`,
`rawSplits`) · the coach co-sign line (`feed:card.cosigned`, suppressed when absent) · the
followed-likers facepile · the reaction bar (typed verb via `bsReactionVerb`, long-press palette)
· comments · share · send · repost. Its `ctx` is `feedCtx` (`:18577–18583`), built inside
`BSClientFeed`. **Render Wall plates as `<BSActivityCard a={rec} ctx={feedCtx} />` inside a Wall
plate frame** — do not re-implement the record.

**Real post → activity record.** `bsActivityFromPost(p)` (`:12704–12836`) → `{ real, key:
'post-<id>', postId, userId, who, role, delta, cosign, typeLabel, title, body, ago, city, statsRow,
fullStats, breakdown, zones, trace, cadenceTrace, elevTrace, paceTrace, powerTrace, rawSplits,
route, routeObj, kudos, liked, likerIds, postComments, activityType, … }`. `bsFeedTypeMatch(a, t)`
(`:12838`) is the feed's type filter (`'prs'` bucket).

**Backend (`mobile-app/src/services/shapeBackend.js`).**
- `COMMUNITY_POST_SELECT` (`:1158`) = `'*, likes:community_likes(user_id),
  comments:community_comments(id, user_id, author_name, body, created_at)'`;
  `communityPostFromRow(row)` (`:2450`) → the `p` above; `listCommunityPosts(mode)` (`:3323`).
- **PR detection at publish** (`:3405–3430`, inside `createCommunityPost`): a post carrying
  `metrics.lift` + `metrics.load` reads the author's own `pr_wall_posts` row, stamps
  `metrics.delta = "+X lb on <Mon> best"` only when it beats it, then calls
  `ShapePRWall.post({ lift, value, unit })` — **fire-and-forget, BEFORE the insert**
  (`.insert(payload).select(COMMUNITY_POST_SELECT).single()` a few lines down; the new id is
  `data.id`). Session saves also call `announcePRsFromSetLogs(setLogs)` (`:3222`, defined `:3274`,
  up to 6 lifts) after the session's feed post `feedPost` (`:3165`, `{ stored, data }`) exists.
- `postPRToWall` (`:3255`) → `POST /api/community/pr-wall`
  (`src/app/api/community/pr-wall/route.ts`) → RPC `post_my_pr_to_wall(p_lift, p_value, p_unit,
  p_reps)` (`supabase-migrations/2026-06-14-pr-wall.sql`): gates **public** via
  `shape_profile_visibility(uid) = 'public'`, requires `p_value > best_value`, upserts the ledger
  `pr_wall_posts (user_id, lift_key) PK · lift_label · best_value · unit · posted_at`, posts a line
  to the system `#PR Wall` channel. **Ledger RLS: owner `select` only.** Window export
  `window.ShapePRWall = { post, announce }` (`:3292`).
- Follows: `listAcceptedFollowingIds()` (`:3304`) reads `user_follows (follower_id, following_id,
  status = 'accepted')`.
- Co-sign: `post_coach_cosign(p_post_id, p_on)` (`2026-06-14-coach-cosign.sql`) stamps
  `community_posts.metrics.cosign = {name, role, byId}`; the app reaches it through
  `ShapeCommunity.toggleLike({ postId, cosign })` in `feedApplyReaction` (`:18437`), gated on
  `coachClientIds` (`:18420`, from `ShapeAssign.clients(role)`). **A coach reacting on their own
  client's plate already IS the Stamp** — the Wall gets it by reusing the card.
- Conventions to copy in SQL: leaderboard opt-out = `user_goals kind 'client_privacy_prefs'`,
  `coalesce(data->>'leaderboard','on') <> 'off'` (`2026-05-31-leaderboard.sql`,
  `shape_leaderboard`); coach↔client = `is_coach_on_client(client_id)`
  (`2026-05-26-shared-clients.sql`: `subscriptions` active/trialing joined to
  `trainers`/`nutritionists`.`owner_id = auth.uid()`); every RPC ends with `revoke all … from
  public; grant execute … to authenticated` (`2026-08-02-rpc-grant-lockdown.sql` is the sweep).
- Presence: `window.ShapePresence` (`:6685`) — the rail already consumes it.

**Demo records** (signed-out only): `COMMUNITY_ACTIVITIES` (`:17829–17843`). The board's W tab
used, verbatim: Priya Shah · Deadlift 245 lb (co-signed Dana Lewis) · Drew Oyelaran · 18.2 mi ·
Lena Fischer · swim 2,000 m · Devon Wells · Bench 225 lb · Marcus Bell · ride 25.1 mi / 612 W ·
Quinn Harper · Back squat 247 lb (co-signed Maya Okafor). Each carries the full `stats`, `zones`,
`trace`, `breakdown`, `likers`, `comments`, `kudos`, `replies`, `cosign`.

**Home.** Card registry `BS_CARD_TYPES / BS_CARD_LABEL / BS_CARD_DEFAULTS` (`:998–1000`),
`BSHomeCardItem` (`:1129`), `BSHomeCards` (`:1185`, layout persisted to
`user_goals 'client_home_cards'` + `localStorage bs_home_cards`), `BSClientHome` (`:3179`).
Navigation into chat: `goChat` (`:563`) sets `chatRequest` + `setTab('chat')`; the chat page's
`openRequest` effect (search `openRequest.nonce`) already branches on `conversationId`, `channel`,
`support` — add a `wall: true` branch → `setTab('wall')`.

**Coach apps.** They mount the same `BSClientChat` (`role` = trainer/nutritionist) → the Wall
segment appears there unchanged; `BSProToday` is `iosAppBroadsheetPros.jsx:1585` if a Today-rail
*"On the wall"* item is wanted (optional, not required by the spec's first PR).

**i18n.** Catalogs `mobile-app/src/i18n/catalogs/<loc>/feed.json` × 13 (`ACTIVE_LOCALES` in
`mobile-app/src/i18n/locales.mjs`); keys sorted alphabetically; **every `en` key must exist in
every locale** (`tests/i18n-catalog-complete.test.mjs`, ICU placeholder parity too). The surface
ratchet (`tests/i18n-surface-inventory.test.mjs`) lists `Client::BSClientFeed` as covered, so
**a new unkeyed user-facing string in the Wall fails the suite** — every string goes through
`tr('feed:wall.*', { defaultValue })`. Author each locale's value from that catalog's existing
wording (the 09-01/09-02 entries show the method); `pcm` may match English (creole).

**Tooling in the web container:** Postgres 16 (`/usr/lib/postgresql/16`, `psql`) — drive the
migration on a throwaway cluster with a stub schema the way the 09-09 entries did. The pre-commit
hook runs JSX parse · `tsc --noEmit` · mobile build + `public/m` diff · `npm test` on any code
commit (`public/m` is gitignored; CI rebuilds it). No `?v=` bumps. Monochrome glyphs only for new
UI (⚙ ↗ ✓ → × ♡ ＋ #). No model IDs in commits.

## 1. Migration — `supabase-migrations/2026-09-10-pr-wall-surface.sql` (idempotent)

1. `alter table public.pr_wall_posts add column if not exists prev_value numeric,
   add column if not exists reps int,
   add column if not exists post_id uuid references public.community_posts(id) on delete set null;`
   `create index if not exists pr_wall_posts_posted_idx on public.pr_wall_posts (posted_at desc);`
2. `drop function if exists public.post_my_pr_to_wall(text, numeric, text, int);` and recreate as
   `post_my_pr_to_wall(p_lift text, p_value numeric, p_unit text default 'lb', p_reps int default
   null, p_post_id uuid default null)` — same gates and channel post; on conflict
   `prev_value = pr_wall_posts.best_value`, `reps = excluded.reps`, `post_id = excluded.post_id`
   (a new best replaces the link — the old post was the old record). **Only accept `p_post_id`
   when `community_posts.author_id = v_uid`** (a caller must not link someone else's post).
   ⚠ Do NOT keep a 4-arg overload beside the 5-arg-with-default: PostgREST named-arg calls with
   four args would be ambiguous.
3. `shape_pr_wall(p_limit int default 40, p_lift text default null, p_scope text default
   'everyone')` — `language sql stable security definer set search_path = public`, returns
   `(user_id, full_name, avatar_url, role, lift_key, lift_label, best_value, prev_value, unit, reps,
   posted_at, post_id)` from `pr_wall_posts` joined to `profiles`, **where
   `shape_profile_visibility(user_id) = 'public'` and the leaderboard pref is not `'off'`**;
   `p_lift` filters `lift_key`; `p_scope`: `'following'` → `user_id in (select following_id from
   user_follows where follower_id = auth.uid() and status = 'accepted')`; `'coach'` → for a coach
   caller `is_coach_on_client(user_id)`, for a client caller rows whose member shares an
   active/trialing provider with the caller (join `subscriptions` on `provider_id, provider_role`);
   order `posted_at desc`, `limit greatest(1, least(p_limit, 200))`. `revoke … from public; grant
   … to authenticated` (signed-out shows the demo, never the live wall).
4. *Your best* needs no new SQL — the owner reads their own ledger under the existing policy.

Reply to the owner with **only** the raw GitHub link to the file (WORKLOG rule).

## 2. Backend — `shapeBackend.js`

- `postPRToWall({ lift, value, unit, reps, postId })` forwards `postId`; the route maps it to
  `p_post_id` (validate as a uuid string; omit otherwise).
- `createCommunityPost`: keep the delta computation where it is; **move the `ShapePRWall.post`
  call to after a successful insert**, passing `postId: data.id`, so the ledger row carries the
  record's post. `saveWorkoutSession`: pass `feedPost?.data?.id` into
  `announcePRsFromSetLogs(setLogs, postId)` so session-detected PRs link the session's feed post.
- New `listPRWall({ limit, lift, scope })` → `supabase.rpc('shape_pr_wall', …)`; then one
  `community_posts.select(COMMUNITY_POST_SELECT).in('id', postIds)` (RLS decides visibility) →
  `communityPostFromRow`; return `{ stored: 'supabase', data: rows.map(r => ({ ...r, post: byId[r.post_id] || null })) }`.
  ⚠ **A failed read returns `{ stored: 'local', data: [], error }`, never a bare `[]`** — an
  empty wall is the positive claim *"nobody has a record"* (the 09-09/09-10 entries' rule).
- New `myPRLedger()` → own `pr_wall_posts` rows (`best_value, prev_value, unit, reps, lift_label,
  posted_at`), same error shape.
- `window.ShapePRWall = { post, announce, list: listPRWall, mine: myPRLedger }`.

## 3. Route — `src/app/api/community/pr-wall/route.ts`

Accept `postId` in the body → `p_post_id`. Same path/method, so `RAW_ROUTES` in
`src/lib/warroom.ts` (`:262`) is unchanged; add a War Room checklist item for the Wall surface.
`npx tsc --noEmit` must be 0.

## 4. Client — inside `BSClientFeed`

- Pills: `['feed','wall','teams','channels','support']`, grid `repeat(5, 1fr)`;
  `feed:tab.wall` "Wall". Masthead: `tab === 'wall'` → `feed:masthead.titleWall` "The Wall".
- State: `wallScope` (`everyone | following | coach`), `wallLift` (`all | <lift_key>`),
  `wallRows` (`null` loading · `[]` empty · `{ error }` unreadable), `wallMine`. Fetch when the
  tab opens and on scope change; re-fetch after a successful *Post a PR*.
- **Plates:** for a row with a linked post, `bsActivityFromPost(row.post)` is the record; wrap it
  in the Wall plate frame (`BSPlate` from `iosAppBroadsheet.jsx:1265`, teal spine, tick on the
  newest) with a **record header**: `NEW BEST · {lift_label}`, the figure `{best_value} {unit}`
  (tabular numerals — the app has no Doto; use `t.DISPLAY` + `fontVariantNumeric: 'tabular-nums'`),
  the delta `↑ +{best−prev} {unit} over last best` when `prev_value` is set, else `first on the
  wall`, and the time from `posted_at`. The card renders the co-sign when present; when absent the
  frame's foot reads **`not yet stamped`** (spec: *so a stamp is worth something*). A row with no
  linked post (older ledger rows, *Post a PR* from outside the app) renders the header only — a
  bare record, no social row (nothing to react to).
- **Filters** in the `bsSubTab` grammar (`:18471`): Everyone · Following · *Coach's clients*
  (a coach sees *My clients*); the lift filter as the feed's `ALL ▾` select (`:19127`) listing the
  lifts present in the loaded rows.
- **Your best** (pinned at the bottom): `wallMine` rows — lift, best, when — and **Post a PR**: a
  small sheet (lift · value · unit lb/kg · reps) → `ShapePRWall.post`; toast the RPC's `reason`
  honestly (`not_public` → the profile is private, so nothing lands on the wall; `not_a_pr` → it
  does not beat their best; `ok` → refresh).
- **Signed-out:** demo plates from `COMMUNITY_ACTIVITIES` — the three `kind: 'pr'` entries plus
  the run/swim/ride records the board shows, each with a demo record header — under the preview's
  existing demo banner. **Signed-in:** live only; empty → `feed:wall.empty`; unreadable →
  `feed:wall.unreadable` (never the demo cast, never an empty positive claim).
- **Online rail:** nothing to add. **Home card:** register `wall` in `BS_CARD_TYPES/LABEL`
  ("On the wall"): the newest row, co-signed first; tap → `goChat` with `{ wall: true }`.
- Reactions/co-sign/comments/share/send/repost: all come with `BSActivityCard` + `feedCtx`.

## 5. i18n keys (`feed.json`, all 13 locales)

`tab.wall` · `masthead.titleWall` · `wall.scopeEveryone` · `wall.scopeFollowing` ·
`wall.scopeCoach` · `wall.scopeMyClients` · `wall.liftAll` · `wall.liftFilterAria` ·
`wall.newBest` · `wall.over` (`↑ +{gain} {unit} over last best`) · `wall.first` ·
`wall.notStamped` · `wall.yourBest` · `wall.noBestYet` · `wall.postPR` · `wall.postPRTitle` ·
`wall.lift` · `wall.value` · `wall.reps` · `wall.unit` · `wall.posted` · `wall.notPublic` ·
`wall.notAPR` · `wall.empty` · `wall.unreadable` · `home:card.wall`.

## 6. Verification owed before the PR

- `tests/pr-wall-surface.test.mjs`: brace-match the pure pieces out of the shipped source and
  **drive** them (the house method — `tests/radio-ask-gate.test.mjs`,
  `tests/theme-texture-css.test.mjs`): the record-header derivation (delta text · first-on-wall ·
  bare vs linked), the scope/lift filter, the pill list carrying `wall` between `feed` and
  `teams`, the masthead branch, the signed-in demo gate, and the `{ error }` read shape. Mutation
  test each guard and **prove the mutation landed** (the file's own rule).
- The migration driven on Postgres 16 with fixtures: private member excluded · opt-out excluded ·
  `prev_value` set on the second post · a foreign `p_post_id` ignored · following scope ·
  coach scope both directions · the 4-arg signature gone · idempotent re-apply.
- JSX parse · mobile build · `npm test` · `tsc --noEmit` · headless renders of the Wall at 375
  and 430 px, signed-out (demo) and stubbed live (rows · empty · unreadable), zero page errors.
- `/code-review` before pushing, `@codex review` on the PR, CI green, squash-merge, re-sync the
  branch (WORKLOG review stack, 2026-09-10 ruling).

## 7. Deliberately out of scope (owner rulings pending)

- The homepage feed of the same read (§7 item 4) — **on hold** with the website.
- Whether `#PR Wall` stays as the chat room once the Wall ships.
- The demo coach cast on the homepage (registered 09-02).
