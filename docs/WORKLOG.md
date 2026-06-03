# Shape — working notes & changelog

Running memory for ongoing work on the Shape app. Skim this before starting
mobile/website work so context carries across sessions. Add a dated entry to the
changelog whenever something ships.

## How we work

- **Mobile app** lives in `mobile-app/` (Capacitor/Vite SPA, the `/m/` broadsheet).
  - Build: from `mobile-app/`, `VITE_BASE=/m/ npm run build`.
  - Publish into the website: from the **repo root**, `rm -rf public/m && cp -r mobile-app/dist public/m`.
  - Parse-check a JSX file before building:
    `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
- **Website** is Next.js at the repo root (`src/`). Typecheck: `npx tsc --noEmit`.
- **Git / deploy:** develop on `claude/sleepy-feynman-RtyIr`. Per change: commit →
  push → open PR → squash-merge → re-sync the branch to `main`
  (`git fetch origin main && checkout main && reset --hard origin/main && checkout <branch> && reset --hard origin/main && push --force-with-lease`).
- **Verify before committing:** parse-check changed JS, `tsc --noEmit` for TS, build, copy `public/m`.

## Architecture map (mobile broadsheet)

- `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — client app (home, eat,
  train, logger, chat, settings). Biggest file (~9.7k lines).
  - `BSLogMealFlow` — the meal logger (Adjust / Photo / Search / Voice tabs +
    ingredient editor). Delivers a note/memo/photo via `sendMealNote()`.
  - `BSClientEat` — eat/calendar page (meals, swap, grocery views).
  - `BSChatThread` / `BSClientFeed` — shared chat (coaches + clients use the same code).
- `iosAppBroadsheetPros.jsx` — trainer & nutritionist apps (`BSProMe`, console).
- `iosAppBroadsheet.jsx` — shared chrome (`BSPage`, `BSFooter`, `BSSwapSheet`).
- `iosAppBroadsheetRadio.jsx` — Shape Radio (`BSNowPlaying`).
- `mobile-app/src/services/shapeBackend.js` — Supabase data layer (`conversationToThread`, etc.).
- **Theme:** `useBS()` → `t`. Teal accent literal: `t.isLight ? '#0a8f87' : '#34d6c5'`.
  Role colors: nutritionist gold `#a07a2e`, trainer rust `#c0533b`.
- **Sheets** must `createPortal` into `#bs-phone-surface` (position:absolute) so they
  don't overhang the phone frame in desktop preview.

## Backend touchpoints

- `src/app/api/nutrition/meal-note/route.ts` — delivers a meal log's note + voice
  memo + photo to every linked coach. Uploads to the private `meal-notes` storage
  bucket (audio + image mime types); links ride in `messages.metadata.audio/photo`.
- `src/app/api/nutrition/voice/route.ts` — Whisper transcription (returns `{ transcript }`).
- Storage bucket: `supabase-migrations/2026-06-03-meal-notes-bucket.sql` (idempotent;
  re-run after widening mime types). **War Room** (`/warroom`, `src/lib/warroom.ts`) is
  the go-live status board — register new routes in `RAW_ROUTES` and add checklist items there.

## Changelog

### 2026-06-03 — Library page: stat-card filters, search, item previews
- `BSClientLibrary` filter row is now a 4-up **stat-card grid** (big tabular count +
  colored label): **Workouts** (rust), **Meals** (green), **Recipes** (teal),
  **Groceries** (purple `#8a5cf6`). Tapping a card toggles that filter (tap again →
  all). Kind metadata centralized in `BS_LIB_KINDS` (workout/plan/meal/recipe/grocery).
- New **search field** below the cards ("Search your library…") filters saved items by
  title / meta / coach.
- Saved item rows are now **tappable cards** (chevron `›`, no more × remove button) that
  open a new **`BSLibraryDetail`** preview page (kind eyebrow, title, meta/coach, saved
  date, preview blurb) with a **Save / Remove from library** action at the bottom.
### 2026-06-13 — About + Pricing pages (mobile) & compact score card
- New **`BSAboutPage`** and **`BSPricingPage`** in the client module, adapting the
  website's `/newdesign/About` + `/Pricing` into the broadsheet (serif hero, letter,
  numbered pillars; $5/mo card with feature checklist, "coaches price themselves"
  rows, FAQ accordion). Reachable from **Settings → About** (new "About Shape" +
  "Pricing" rows). `bsStartPlatformCheckout()` helper (shared with the upgrade
  button) drives Get-started; "Browse all coaches" fires a `shape:openMarket` event
  that `BSClientAppInner` listens for (closes settings → opens marketplace).
- **Me-page Shape Score card compacted** (~20% tighter): padding 18→14, tier 28→23,
  number 46→37, ring 84→68px, slimmer metric bars (h5→4, gaps tightened).
- The playlist preview popup (`BSPlaylistCard`) now has a **♡ Save to my Spotify**
  button (shown only for genuine `spotify.com/playlist/...` links — not Apple Music)
  that *follows* the coach's playlist into the signed-in member's own Spotify
  library. Native goes through the `window.ShapeIntegrations.saveSpotifyPlaylist`
  bridge (Bearer token); the `/m/` web build falls back to a same-origin cookie
  POST to `/api/integrations/spotify/save-playlist`. Button shows saving / ✓ Saved /
  Try again, and surfaces "Connect Spotify…" when the account isn't linked.
- **Note:** in-app **Connect Spotify** already exists — Settings → Connected apps →
  Spotify → Connect (`BSIntegrationsPage`, wired to `connectSpotify` →
  `/api/integrations/spotify/authorize`). Both halves of the sync loop are now live.
- **Not-linked UX:** when the save fails because Spotify isn't connected (or the
  member isn't signed in), the popup now shows a tappable **"Connect Spotify to
  save → Settings · Connected apps"** CTA instead of the raw error. It closes the
  sheet and fires a `shape:openIntegrations` event that `BSClientAppInner` listens
  for → opens the integrations page (no prop-threading). The redundant error
  **toast is suppressed** for the not-linked case (the inline CTA covers it);
  toasts still fire for other failures (e.g. network).
- **War Room:** Spotify checklist now tracks redirect-URI registration (done) +
  a manual "out of Development mode" item; credentials row auto-reads live env.

### 2026-06-13 — playlist tracklist preview popup
- Tapping a `BSPlaylistCard` (coach/nutritionist Spotify cards on home/train/eat)
  now opens a bottom-sheet **tracklist preview** (portaled into `#bs-phone-surface`)
  so a client can see what's on a list before opening Spotify: Spotify-glyph header
  with the playlist title/meta, a numbered track list (title · artist · length), a
  "Preview · first N of M" label, and a green **Open in Spotify** CTA + Close. The
  card's ▶ button still jumps straight to Spotify (stops propagation).
- Data: added a short `songs` preview array to each `BS_COACH_PLAYLISTS` entry
  (radio module); the train/eat maps pass `tracks: p.songs`, and the home
  "Pull heavy." card carries an inline list. Extracted `bsSpotifyGlyph()` helper.

### 2026-06-13 — iMessage-style auto-growing chat composer
- `BSMessageComposer` (shared by DM threads + the feed) is now an auto-resizing
  `<textarea>` instead of a fixed 38px `<input>`: one line at rest, grows upward
  as you type, caps at ~6 lines (`COMPOSER_MAX_H = 132`) then scrolls internally.
  Re-measured on every `value` change via `useLayoutEffect`, so it also collapses
  back after a send clears the draft. Send button bottom-aligns (`alignItems:'end'`).
  Enter sends; Shift/⌘/Ctrl+Enter inserts a newline. `borderRadius:19` reads as a
  pill at one line and a rounded rect when expanded.

### 2026-06-13 — client Library (Phase 1)
- New **Library** screen (`BSClientLibrary` in the client module): clients save
  trainers' **workouts**, paid **programs/plans**, and nutritionists' **meals/plans**
  to their own profile. Serif "Your library." hero, All/Workouts/Programs/Meals
  filter pills, kind-colored rows (workout = rust, plan = amber, meal = teal) with
  remove (×), and an empty state that deep-links to the marketplace.
- Data model: `bsLibRead/bsLibWrite/bsLibToggle` over `localStorage` key `shape.library`
  + `shapeDb.saveUserGoals('client_library')` (cloud), broadcast on a `bs-library`
  event; `useBSLibrary()` hook merges the cloud copy by id-union once on mount.
- `BSSaveButton({item, full})` — reusable ♡ Save / ✓ Saved toggle (teal when saved).
  Wired into the **workout preview** footer and the **meal preview** CTA row so far.
- Me page: added a **Library** shortcut + `showLibrary` route in `BSClientMe`.
- **Follow-ups:** Save actions on coach/marketplace content (programs, coach meals);
  the trainer "sell a plan" paid-checkout path; a dedicated Supabase `client_library`
  table (today it piggybacks on `user_goals`).

### 2026-06-13 — Garmin push-webhook ingestion (ready for approval)
- Built `src/app/api/integrations/garmin/webhook/route.ts` — Garmin Health API is
  PUSH-based, so this receives Dailies/Sleeps/Activities POSTs, maps each item's
  Garmin `userId` → Shape user via `user_integrations.provider_user_id`, and upserts
  into `daily_health_snapshot` (resting HR, stress, calories, sleep hours, workout
  min/HR) + `activities` (same tables as Whoop/Oura/Strava). Optional
  `GARMIN_WEBHOOK_SECRET` (`?token=`) guard; GET returns 200 for URL validation.
- OAuth callback now fetches Garmin's `userId` (`/wellness-api/rest/user/id`) at
  connect time and stores it on `provider_user_id` (token response omits it).
- No migration — reuses existing tables. Registered the route in the War Room.
- **Blocked on Garmin:** their access-request form is down; apply via Developer
  Contact Us. Once approved: set `GARMIN_CLIENT_ID/SECRET`, then register the
  webhook URL + summary types (Dailies/Sleeps/Activities) in the Garmin portal.

### 2026-06-03 — tier color system + score-card focus
- Added `bsTierColor()` in the client module (Raw/Base = steel, Tempo = gold,
  Form = teal, Peak = violet, Legend = rose), exposed on `window` for the Pros app.
- Shape Score card (client `BSClientMe` + coach `BSProMe`): the **tier is now a big
  tier-colored line** on the card (no pill, no header chip) with a tier-colored ring;
  the coach card's TIER bar uses the tier color too.
- Full Shape Score page: the reward-tier list is color-coded (color dot + tier-colored
  name; the user's current tier is marked "· you").
- **Follow-up (next):** apply `bsTierColor` to the remaining tier displays — community
  feed tier tags and the marketplace coach tier label — for full app-wide coordination.

### 2026-06-03 — coach profile page redesign
- Rebuilt `BSCoachDetailPublic` to match the app: role-gradient hero card with a
  circular avatar, tier chip, headline, stat pills + a 3-up mini-stats row; rounded
  pill tabs (was hard-INK with an offset shadow); rounded teal action + bottom CTAs;
  rounded specialty pills. Removed the halftone "client view" wireframe banner. All
  handlers (book / message / checkout / reviews / availability) + the action panel kept.

### 2026-06-03 — circular avatars + upgrade button wiring
- `BSAvatar` is now **circular by default** (`round` default true) — all people
  avatars (client + coach headers, chat, feed, settings) are circles. Added an
  opt-in `glow` prop; the Settings identity avatar uses `round glow`.
- `BSHeadshot` (public coach profile pages) made circular too.
- **Upgrade button fix:** a free user's "Upgrade →" now starts a Stripe Checkout
  (`/api/stripe/platform-checkout`) instead of the billing portal (which only
  manages an existing sub). "Manage →" still opens the portal when subscribed.
  Free-plan subtitle reworded to "Become a Shape member to access the platform & features".

### 2026-06-03 — mobile marketplace redesign (first pass)
- Rebuilt `BSMarketplaceScreen` as an editorial discovery page matching the rest
  of the app (replaced the old hard-bordered "wireframe" look). New layout:
  - Serif hero **"Find your _coach._"** (teal italic accent).
  - Rounded pill search bar.
  - Filter tabs — **All · Trainers · Nutritionists** only (no specialty pills),
    wrap (no horizontal scroll). All = discovery view; a role/search = results list.
  - **Coach of the Week** card: italic pull-quote, circular avatar, arrow, and an
    embedded **Tracklist** of that coach's real packages (`buildPublicProfile`).
  - **Featured · This week** — 2-up grid of gradient coach cards (no scroller).
  - **Programs · Start a thing** — numbered tracklist from coach packages.
  - New helpers: `MktAvatar/MktPill/MktSectionHead/MktTrackRow/MktCoachCard/MktRow`.
  - Kept working: live Supabase providers, search, role filter, tap→`BSCoachDetailPublic`,
    coach-apply flow. `BSHeadshot` + the detail pages are untouched.
  - Follow-ups: `BSM_MARKETPLACE_CATEGORIES/CERTIFICATIONS/FORMATS/LOCATIONS` and
    `ListingRow` are now unused (dead) — sweep later; pricing shows `$rate/mo` (label
    only — confirm semantics); detail pages still use the older style.

### 2026-06-03 — dead-code audit (behavior-preserving)
- Removed 8 orphaned, never-referenced top-level components/helpers from
  `iosAppBroadsheetClient.jsx` (~639 lines): `BSHealthIntegrationsCard`,
  `BSConnectedDataSummary`, `BSAddWidgets`, `BSRecipeArchivePage`, `BSRxPlanWidget`,
  `readStoredCoachThreadsForChat`, `mergeChatThreads`, `BSCommunityLiveFeed`.
- Removed the dead `addPlanToGrocery` (never called) and an unused `[logged]`
  state in `BSMealPreview`.
- Consolidated the duplicated audio/photo upload blocks in
  `/api/nutrition/meal-note` into one `uploadAttachment()` helper.
- All verified zero-reference repo-wide; bundle size unchanged (already
  tree-shaken), so the shipped app is equivalent.

### 2026-06-03
- **#898** Meal logger Photo tab made real (capture/upload → inline preview →
  delivered to coach, rendered inline in their chat); `meal-notes` bucket widened to
  allow images (15 MB); Shape Score tier badge boldened (text-stroke + solid gold).
- **#897** Meal-preview "Log Now" centered to match the Close button's mono type.
- **#896** Shape Radio bar full-bleed (full screen width); tier badge solid gold;
  marketplace CTA outlines bolder.
- **#895** Grocery shop list auto-builds from the week's meal ingredients (deduped,
  aisle-grouped) so it matches the meals; "Find a coach" CTAs elevated (tint + icon).
- **#894** Swap meal: pick which meal first, then the coach-approved alternate.
- **#893** Meal note delivers to **all** linked coaches (trainer + nutritionist);
  coach chat renders the voice-memo audio player; "Log Now" on a meal preview opens
  the full logger.
- Also this session: meal-search recents now add to the meal + filter as you type;
  War Room updated to reflect the above (routes, config, checklist).

### Next up (planned)
- **Client "Library" — save coach content to your profile** (NEW · priority):
  let clients save to their own profile/library: trainers' **workouts** and **paid
  plans/programs** (purchasable — needs the sell/checkout flow), and nutritionists'
  **meals & meal plans**. Needs: a saved-library data model + a client Library screen,
  "Save" actions on coach/marketplace content, and the trainer "sell a plan" purchase path.
- **Marketplace follow-ups**: remove now-dead marketplace constants + `ListingRow`
  (unused after the rebuild); confirm pricing semantics (cards show `$rate/mo`).
  (Coach detail pages are now redesigned — see changelog.)

### Known stubs / next
- Food-database free-text search in the logger (Search tab uses local recents today).
- Native mic + camera plugins for the iOS App Store build (WebView fallback today).
- On-device "Shape reads macros" from a meal photo (currently photo → coach review only).
