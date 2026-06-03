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
- **Marketplace redesign follow-ups** (main screen done — see changelog):
  - Restyle the coach **detail pages** (`BSCoachDetailPublic` / `BSCoachDetail`) to
    match the new discovery look — they still use the older hard-bordered style.
  - Remove now-dead marketplace constants + `ListingRow` (unused after the rebuild).
  - Confirm pricing semantics (cards show `$rate/mo`).

### Known stubs / next
- Food-database free-text search in the logger (Search tab uses local recents today).
- Native mic + camera plugins for the iOS App Store build (WebView fallback today).
- On-device "Shape reads macros" from a meal photo (currently photo → coach review only).
