# Shape — Work Log (ARCHIVED — Cycles 2–5, PRs #712–#807, early June 2026)

> **⚠ ARCHIVED 2026-07-02.** This is the frozen early-June work log (last
> updated at PR #808). It previously lived at the repo root as `WORKLOG.md`,
> where its stale conventions (a dead feature branch, a pre-PR-flow merge rule,
> the pre-#1470 `public/m` publish step) kept confusing sessions. The canonical,
> live changelog is **`docs/WORKLOG.md`** (auto-loaded via `AGENTS.md`) — read
> that, not this. The one piece of live guidance this file held (the
> window-globals load-order gotcha) was ported to `docs/WORKLOG.md`'s
> architecture map before archiving. Kept verbatim below for history.

A durable record of recent work, settings, conventions, and pending steps. The
remote dev environment is ephemeral, so anything not committed is lost — this
file is the narrative companion to the live status dashboard in
`src/lib/warroom.ts` and the git history.

> Live status (env keys present, services reachable, go-live checklist) is
> computed at runtime by `src/lib/warroom.ts` — check that for the current
> "is it configured" truth. This file is the "what we did and why."

---

## Cycle 5 (PRs #794–#807) — Channels polish, chat unread, integrations

### Channels & chat
- **Channel pin + search** (#794): a search box filters channels by name; pinned channels sort to the top via a local override (works for demo + live).
- **Post to the right feed** (#795): messages now post to the chip you're on (Shape / Community / your role) instead of always Client; the channel is persisted in `community_posts.metrics`. Added a Support-bubble pin and a **× cancel** on the create-channel form (#796).
- **Pin glyph** (#797, #799, #801, #802): monochrome → top-right corner → finally a custom **SVG pushpin** (tinted head only, neutral needle); fills solid only when actually pinned so unpinned channels don't look pinned.
- **Unread, everywhere** (#798, #800): the bottom-nav **Chat** badge now also shows in the logged-out demo (seeded `ShapeUnread.seedDemo`), across all profiles; and the chat **section tabs** badge where the unread is — DMs → **Friends**, channels → **Teams**.

### Integrations (all reuse the generic provider machinery)
- **Oura Ring — full sync** (#803): provider config (OAuth2 v2) + `/api/integrations/oura/sync` pulling readiness/sleep/HR/workouts into `daily_health_snapshot` (`writeOuraSnapshots`), `?import=1` imports workouts; mobile Connect/Sync/Import/Disconnect card.
- **Garmin** (#802): the "coming later" placeholder became a live Connect/Disconnect card (shared OAuth flow). Needs keys **and** Garmin program approval.
- **Apple Health / Apple Watch** (#804): native, since HealthKit has no web API. Thin in-app `ShapeHealthPlugin.swift` (`CAPBridgedPlugin`, auto-registered as `ShapeHealth`) reads steps/HR/HRV/resting-HR/sleep/energy/distance/workouts; HealthKit entitlement + Info.plist usage strings; `/api/integrations/apple-health/sync` writes the same snapshot rows. Needs a Mac+Xcode device build to go live (no env keys).
- **Spotify — save a coach playlist** (#805): client can save (follow) a coach's playlist to their own profile (mobile + web); added `playlist-modify-*` scopes + `/api/integrations/spotify/save-playlist`. **Existing Spotify users must reconnect once** for the new scope.
- **Instacart — copy fallback** (#807): Instacart Developer Platform applications are **gated** (no waitlist) — partnership request submitted. We use the **IDP Products Link** API (single `INSTACART_API_KEY`), *not* the Connect fulfillment OAuth flow. While keyless, the grocery button **copies the list to the clipboard** (route returns `{ configured: false, items }`); reverts to the pre-filled-cart redirect once a key is added.

### Production env status (verified 2026-06-02 via authorize endpoints)
- **Live (keys set):** Spotify ✅, Strava ✅, Whoop ✅.
- **Code ready, keys pending:** Oura, Garmin (+ approval).
- **No keys / different path:** Apple Health (iOS build), Instacart (access gated), Apple Music / Instacart credentials per env.
- Prereqs in Vercel: `NEXT_PUBLIC_SITE_URL=https://theshapecommunity.com`; Spotify redirect URIs registered for **both** apex and `www`.
- Full provider setup + redirect-URI audit lives in `docs/INTEGRATIONS_SETUP.md`.

---

## Cycle 4 (PRs #768–#790) — Community chat + channels

### Community feed → scoped, live channels
- **Scoped chat channels** (#775): the feed chips became real channels — **SHAPE = individual members**, and the middle chip is your role's peers only (**TRAINER** trainers-only, **NUTRI** nutritionists-only); COMMUNITY = the activity feed. Fixed the chip not following the active profile (#773).
- **Everything live + wired** (#778, #781, #785): Friends/Coaches lists pull real DM threads (`listDirectCoachThreads`); tapping any row opens a real **thread** (#779); **comments work on every post** (persist via `ShapeCommunity.addComment`, show real comments); **DM sends persist** (`sendMessage`); the **COMMUNITY tab renders live `community_posts`** with persistent likes/comments. Unified the composer to one Message…/Send pill; removed the SAVE action; enlarged like/comment.
- **No more login bounces** (#780): dropped `bsRequireAccount` from chat interactions (liking/commenting/sending no longer redirects to the create-account screen).

### Member-created channels ("run club")
- **Channels** (#783): any member creates a channel (hosts it), anyone discovers + joins, the host adds other Shape members, members post. New tables `channels` / `channel_members` / `channel_messages` + RLS + `create_channel`/`search_members` RPCs; mobile `window.ShapeChannels`; full Teams→Channels UI. Fixed a dead Create button (optimistic + crash-proofed the `?.fn?.().then` chains) (#786).
- **Public / private + pin** (#788): visibility toggle on create (private = members-only, invite-only via host-add; public = discoverable/joinable), `🔒 PRIVATE` tag, and per-user **📌 pin-to-top** (`set_channel_pinned`).

### Realtime + unread
- **Realtime** (#787): `channel_messages` / `messages` added to the `supabase_realtime` publication; new messages drop into an open thread live and drive per-row **"N new"** badges on channels + friends/coaches.
- **Persisted unread + Chat-tab badge** (#789): app-wide `ShapeUnread` manager seeds counts from `channel_unread`/`dm_unread` RPCs (survive reload), keeps them live, and powers an unread count on the bottom-nav **Chat** icon (started from the always-mounted tab bar). `mark_*_read` on open.
- **Demo content** (#790): seeded conversations in the sample friend/coach chats + a few marketing channels (Shape HQ / Sunday Run Club / Macro Mondays / PR Wall).

### Migrations to apply (Supabase) — all idempotent
`2026-06-02-channels.sql`, `2026-06-02-channels-visibility.sql`, `2026-06-02-chat-realtime.sql`, `2026-06-02-chat-unread.sql`. (Owner has applied these.) Channels talk to Supabase directly under RLS — **no new API routes**.

### UI polish this cycle
Grocery action row to one line + per-aisle Reset (#768/#771); Habits page (compact Score card, removed coach note + log box, tap-to-log today, "+ Add habit") (#769); home **Score chip shows today's points** (#770); Train/Eat **day selector defaults to today** (#772); **pro nav line-icons** instead of 01/02/03 (#776); **pro Today uses the real current week/date** instead of hardcoded May (#777); thinner rule under the feed header (#784).

---

## Cycle 3 (PRs #759–#766)

### Coach-editable client surfaces
- **#759**: home **ticker editor in Settings** — client chooses which metrics show (persisted to `shapeDb` `client_ticker`); also fixed the "Inside Shape" data on the Shape Daily intro (filter to real recent posts, first-name authors).
- **#760**: split the **grocery coach note** and the **home Op-ed** into two separate coach-editable messages (`coach_pushed_items` kind `grocery_note` vs `coach_focus_banners`), so editing one no longer overwrites the other.
- **#761**: the nutritionist **Live Console pre-fills the existing grocery note** per client (GET returns `groceryNoteByClient`).

### Grocery library overhaul (#762)
- Tap a list row to **preview** its items (falls back to `bsLibraryPreviewItems` for built-ins without an explicit `items` array); **Load** now opens the list's real contents; **Edit** opens an editable copy (seeded for built-ins so edits persist); **Duplicate** shown only for meal-plan lists; **Delete** removes custom lists and hides built-ins via a persisted `shape.deletedGroceryIds` set.

### Code-health pass — behavior-preserving cleanup (#762–#766)
A review of both the mobile-app and website for inefficiency/duplication, applying **only** changes verified not to alter behavior (build + `tsc --noEmit`, every deletion grep-confirmed to have zero call-sites first).
- **Dead code (#762, ~860 lines mobile):** `BSClientChatLegacy` (~540), `BSClientApp_old`, `_BSTrainerApp_old`, `_BSNutritionistApp_old`, the inert `BSBrowseChrome` (+mount+orphaned `BSPreviewNotice`/`BSSubscribeBanner`), the empty `injectBSFonts` IIFE, the stale `BSM_COACHES`/`BSM_FILTERS`/`BSN_FILTERS` dataset; website: unused `queries.ts` exports `getProviderAvailability`/`getMyAvailability`, dead `PublicHero`, orphaned `bgEditor.jsx`/`radioRooms.jsx`.
- **Shared helpers (new `src/lib` modules):** `request-auth.ts` (`clientForRequest`/`currentUser`) replacing **22** identical copies across API routes — the 2 `console` routes were left alone (semantically different, no `persistSession`/`autoRefresh` flags); `time.ts` (`DAY_MS`/`startOfWeek`) replacing 6+4 copies; `loadStripe`/`StripeSummary` moved into `stripe.ts`; `coach-roster.ts` (`coachClientsResponse(role)`) collapsing the twin trainer/nutritionist **clients** routes (#766). Mobile `shapeBackend.js`: `getJsonOrDefault` for 8 best-effort reads (#763), `providerTable(role)` (#764), `COMMUNITY_POST_SELECT`, `saveApplicationFallback`→`saveLocalRecord`.
- **Perf (#765):** memoized the large Train/Eat `MOCK_PROGRAM` demo literals (`useMemo(..., [t])`) so ~800 lines aren't re-allocated each render.
- **Bug:** `t.RED` was undefined in the palette (error text rendered colorless) → switched Marketplace / ProviderApply error states to `t.RUST`.

### Deliberately NOT done (would change behavior — left as-is)
- `normalizeRole`/`normalizeProviderRole` (8 copies) are **genuinely divergent** (different return sets/defaults; `stripe/connect-account` uses fuzzy `.includes()`; `radio/rooms` defaults to `trainer`) — not safe to unify.
- `mean`/`avg` copies are domain-specific inline math, not one helper.
- **`dashboard` twins** emit role-specific output keys (`sessionsThisWeek` vs `consultsThisWeek`); **`analytics` twins** diverge substantially (different KPIs/queries) — neither is a safe merge.
- Bearer-token POST helpers in `shapeBackend.js` differ per call site (throw vs return on missing URL) — left separate.

### Still deferred (higher risk, want a manual pass)
- `useUserGoals` hook to fold ~19 duplicated guarded `getUserGoals` effects in `iosAppBroadsheetClient.jsx` (heavy edits in a 9.9k-line file, no tests).
- `newdesign` shared-includes (Goal/LiveConsole twins ~92% identical; lazy-load the heavy chat bundle on the ~32 pages that only need the button) — unbuilt browser-Babel pages, changes load order → needs per-page browser testing.

---

## Cycle 2 (PRs #727–#745)

### Eat / Train redesign + coach swaps
- **Tracklist redesign** (#732–#733): Eat and Train day views rebuilt — calorie/today hero, macro cards / move list, plan card, shop-list card, playlists. Shared helpers `BSWeekStrip` / `BSTrackHeader` / `BSPlaylistCard`.
- **Wired to real data** (#734, #744): goal label from `client_nutrition_prefs`; shop-list card from the nutritionist's grocery list; playlists from `BS_COACH_PLAYLISTS`; `/api/client/train` + `/api/client/nutrition` now return exercises/meals **with `alternatives`**.
- **Coach-approved swaps** (#736, #742): client one-tap exercise + meal substitution from a coach-defined list; alternatives are authored in the **workout builder** (`newWorkout.jsx`) and **nutritionist console** (`NutritionistLiveConsole.html`) and ride along in the JSONB payload; website got a `ClientTrain` workout-detail modal + `ClientNutri` meal swap.
- **Persist + notify** (#737): swaps saved to `user_goals` (`client_train_swaps` / `client_meal_swaps` / `client_workout_swaps`) and the trainer/nutritionist is messaged via `ShapeMessages.sendProviderMessage`.

### Mobile ↔ website sync (the important plumbing)
- **#740**: defined `window.shapeDb` on mobile (was undefined → 21 call sites silently no-op'd) backed by the same `user_goals` table the website uses; swaps keyed by meal/exercise **name** for cross-surface alignment.
- **#741 (env verification you asked for)**: `user_goals` migration is correct (PK `(user_id,kind)` + RLS). But the `/m/` preview was built **without** `VITE_SUPABASE_URL` (never had it, per git history) and there's **no Vercel mobile rebuild step** — so its supabase client was `null`. Fixed by falling back to the same project URL + publishable key the website hardcodes. Native Capacitor build still overrides via env.

### UI polish
- `100dvh` shell fit (#727), radio backdrop + `# support` private channel (#728–#729), recipe-filter dropdown (#730), splash glow (#731), home reorder (week strip / Now Playing / ticker) + card compaction + masthead double-rule removal (#736/#738/#743), compact Today/calorie/macro heroes (#745).

### Still manual (owner)
- Apply `user_goals` migration to the live Supabase project (if not already).
- Set provider env keys (Spotify / Apple Music / Instacart) + Supabase Apple provider / Confirm email toggles.
- Native Capacitor build: set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time.
- Nutritionist console only captures kcal/protein per meal — coach-alternative meals inherit base macros on swap until carbs/fat are added to the form.

---

## Workflow & conventions

- **Active feature branch:** `claude/sleepy-feynman-RtyIr`. All work is developed
  here, PR'd to `main`, squash-merged, then the branch is hard-synced back to
  `main` (`git fetch origin main && git reset --hard origin/main && git push
  --force-with-lease`).
- **Do not** create PRs/merge unless asked — though the established pattern this
  cycle has been: ship each change as its own PR and squash-merge to `main`.
- **Deploy:** Vercel auto-deploys `main`. "Changes not showing" is almost always
  device cache (especially the home-screen standalone PWA) — hard-refresh or
  bump a `?v=` query, not a redeploy.

## Mobile app build & deploy (the `/m/` broadsheet SPA)

The mobile app is a Capacitor/Vite "broadsheet" SPA served at `/m/`.

```bash
cd mobile-app
VITE_BASE=/m/ npm run build         # outputs to mobile-app/dist
# then from repo root:
rm -rf public/m && cp -r mobile-app/dist public/m
```

Parse-check a single source before building (fast feedback):

```bash
cd mobile-app
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/<file>.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```

TypeScript (website / API routes): `npx tsc --noEmit` from repo root.

### Architecture gotchas
- **Window-globals load order:** modules expose components via
  `Object.assign(window, {...})` and consume them via top-level
  `const {...} = window`. If a role module reads a global before a feature
  module defines it, you get React error #130 (undefined component). The shell
  loaders in `iosAppBroadsheetMain.jsx` load feature modules *first*, then the
  role module.
- **Pros vs client bundles:** clients load `iosAppBroadsheetClient.jsx`; trainers
  and nutritionists load `iosAppBroadsheetPros.jsx`. Pros reuse client-module
  globals (e.g. `BSClientChat`) off `window`.

---

## What shipped this cycle (PRs #712–#725, all on `main`)

### Community feed / chat (mobile)
- **#712** Chat tab rebuilt as **"The feed."** — role-aware filter chips:
  everyone sees **Shape** (all members) + **their own role** chip (Client /
  Trainer / Nutri) + **Community**. Teams tab gained **Channels** + **Coaches**.
- **#713** Teams sections styled as chips; **trainer & nutritionist chat now
  uses the shared role-aware feed** (`BSClientChat` delegates to `BSClientFeed`
  with a `role` prop; composer slot added to both pro shells). Opening a chat no
  longer hard-gates browse users to login.
- **#714** Teams = **Channels/Coaches selector** (tap to reveal the list);
  **Friends = people list** (tap a person to open the chat); **Community =
  Strava-style workout activity feed** (PR / run-with-splits / logged-workout
  cards with real stats), mirroring the website's "Today on Shape".
- **#716 / #717** Evenly spaced (grid) the Teams selector chips and the role
  filter chips.
- **#719** Removed the dot-texture wash from the chat masthead.

### Login & radio (mobile)
- **#715 / #720** Shape logo raised, wider logo→heading gap, browse section
  lowered/separated.
- **#718** Radio intro hero moved lower; Home week-day strip compacted.
- **#725** Radio intro: **flowing sound-wave backdrop** (soft teal lines,
  reduced-motion aware), dark theme only.

### Integrations (mobile + website)
- **#721** (mobile) **Spotify** connect/disconnect surfaced; **Apple Music**
  on-device MusicKit auth flow; **Instacart** grocery hand-off.
- **#722** (website) Same parity on `dashboard/settings/IntegrationsPanel.tsx`
  and public `integrations.html`.

### Website chat bubble
- **#723** Chat bubble tabs made **role-aware** (peer tab filtered to the
  viewer's role); removed a **duplicate close (×)** on the rich widget.
- **#724** Role filtering **only applies once logged in** — logged-out visitors
  see the full default tab set; cached role cleared on logout.

---

## Integrations status

| Service | Code | What's left to go live |
|---|---|---|
| **Spotify** | ✅ OAuth 2.0 + PKCE backend + connect/disconnect UI (mobile + web) | Set `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`; add the `/api/integrations/spotify/callback` redirect URI in the Spotify dashboard |
| **Apple Music** | ✅ Developer-token endpoint + on-device MusicKit `authorize()` → stores Music-User-Token under synthetic `apple_music` provider; connect/disconnect + status | Set `APPLE_MUSIC_TEAM_ID` / `APPLE_MUSIC_KEY_ID` / `APPLE_MUSIC_PRIVATE_KEY`. MusicKit popup works on web; verify in the native Capacitor shell |
| **Instacart** | ✅ `/api/integrations/instacart/shopping-list` builds an IDP `products_link` from coach-pushed grocery items; "Send grocery list" button | Set `INSTACART_API_KEY` (and optionally `INSTACART_CONNECT_URL` → `https://connect.dev.instacart.tools` for the dev catalog) |

Key routes added:
`/api/integrations/apple-music/connect` (POST),
`/api/integrations/apple-music/disconnect` (POST),
`/api/integrations/instacart/shopping-list` (POST).
Each returns a clear "not configured" error until its env keys are present.

### Role-aware website chat (how it works)
- `public/newdesign/globalChatButton.js` defines `window.shapeViewerRole()`
  (returns `""` when logged out) and `window.__shapeFilterChatTabs(tabs, role)`
  (no filtering when role is empty). It resolves the role from
  `shapeDb.getProfile().role`, caches it on `window` + `localStorage`
  (`shape.viewerRole`), and clears it on logout.
- Both the rich `ChatWidget` (`clientChatThreads.jsx` → `window.clientChatTabs`)
  and the fallback panel filter through the same helper, so behavior is
  identical regardless of which loads.

---

## Pending manual steps (owner: account holder, not code)

1. **Supabase dashboard:** enable the **Apple** auth provider; toggle **Confirm
   email** on. (Code paths are already in place.)
   - Project ref `zznufekgjngecelwxndw`; callback
     `https://zznufekgjngecelwxndw.supabase.co/auth/v1/callback`; app redirect
     `https://www.theshapecommunity.com/m/`.
2. **Provider keys** (Vercel env): `SPOTIFY_CLIENT_ID/SECRET`,
   `APPLE_MUSIC_TEAM_ID/KEY_ID/PRIVATE_KEY`, `INSTACART_API_KEY`
   (+ optional `INSTACART_CONNECT_URL`). See `.env.example`.
3. **Native Sign in with Apple** plugin for the iOS App Store build.

## Known follow-ups / explicitly deferred

- Website **community page** role-aware feed: explicitly **left as-is**
  (`dashboardCommunity.jsx` is marketing). The role-aware "chat feature" was
  applied to the **chat bubble** instead.
- Chat demo **thread content** is still client-flavored seed data; only *which
  tabs* appear is role-aware. Rewriting each thread's contents per role is a
  potential follow-up.
