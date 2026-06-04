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

### 2026-06-04 — Edit-profile redesign + more customizations
- Settings **edit profile** form modernized (less analog): rounded-14 fields with
  accent-colored focus, lighter labels, pill Change-photo + Cancel, teal Save.
- New customizations: **avatar accent color** swatches (reflected on the profile
  avatar), **Pronouns** chips, **Website / link**, **Primary goal** chips, and a Bio
  character counter. Non-edit view shows handle · goal + pronouns and the chosen accent.

### 2026-06-04 — Calendar event sheet fixes + app-wide presence + dynamic phase
- **Calendar event sheet** (tap a workout/consult from month/week view): now **fills
  the full screen** (top 36→0, no rounded gap), has a proper **← Back** button in the
  top bar (replaced the floating "Close ✕"), **coach-note removed** from the workout
  body, footer CTAs **lifted off the nav zone** (bottom padding), and **Join consult**
  now opens the real `meetingUrl` (toast when none yet). *Start session / Reschedule
  remain stubs — no live-session launch or reschedule backend from the calendar.*
- **Presence app-wide**: `startPresence()` now fires on session resolve
  (`getCurrentSession`), so the "● N online" count reflects everyone with the app open,
  not just feed viewers.
- **Dynamic program phase**: `window.ShapeProgram` cache + `useBSProgram()` hook;
  Home/Eat/Train eyebrows read `trainingPhase` / `nutritionPhase` (persisted in
  `client_settings`, editable in Settings → Preferences). Replaces the hardcoded
  Cut/Build. (Coach-app phase display TBD — depends on per-client selection.)

### 2026-06-04 — Contextual page eyebrows + live "online" count
- **Feed header** left-aligned ("The feed.") to match other pages.
- **Live presence**: `window.ShapePresence` (Supabase Realtime presence on an
  `online-users` channel keyed by user id) exposes a genuine live online count;
  `useBSOnline()` hook. The feed masthead right kicker now shows **"● N online"**
  (falls back to "Live" when 0 / signed out). No migration — presence is ephemeral.
- **Contextual week eyebrows**: `bsProgramWeek()` (weeks since program start) drives
  the **Eat** header (`Cut · Week N`, nutrition) and **Train** header (`Build · Week N`,
  training); home already showed `Cut · W{week}`.

### 2026-06-04 — Realtime DM thread refresh + smaller habit cards
- **Realtime member/coach DM lists**: `BSClientFeed` now subscribes to
  `ShapeMessages.subscribeMessages` and (debounced) reloads both member + coach thread
  lists on incoming messages, so new threads + latest-message previews appear live.
  Unread badges were already live app-wide (the `dm_unread` / `mark_conversation_read`
  RPCs + the generic `messages` realtime increment are participant-keyed, so they
  already covered member DMs).
- **Habit cards** (`BSHabitRow`) shrunk: padding 14→10/12, checkbox 30→25, title 17→15,
  meta/points/× tightened.

### 2026-06-03 — Member-to-member DM backend (Friends + New message)
- **Migration `2026-06-03-member-direct-conversations.sql`** (idempotent): adds a
  `dm_key` dedupe column to `conversations` + two SECURITY DEFINER RPCs —
  `get_or_create_member_conversation(other_user_id)` (creates/finds the 1:1, adds both
  as participants) and `list_member_dm_threads()` (returns my member DMs with the
  **counterpart's** name resolved from `profiles`). Reuses the existing
  conversations/messages RLS (participants read + send). **Must be run on Supabase.**
- `shapeBackend.js`: `ShapeMessages.getOrCreateMemberConversation` + `listMemberThreads`;
  `listDirectCoachThreads` now excludes member DMs (`dm_key is null`) so Coaches vs
  Friends stay separate.
- `BSClientFeed`: the **Friends** tab now lists real member DM threads; the **+ New**
  picker creates a real conversation on select, so messages persist + deliver (realtime).
  Applies to all profiles. (Coach DMs, channels, community feed, support already had
  backends — member DMs were the only gap.)
- **Filter pills**: Community/Client/Shape + Coaches/Channels/Support are now
  content-sized (flex, not full-width grid) — less dead space inside each pill.

### 2026-06-03 — Chat feed bubbles + New-message picker + header polish
- **Feed posts** (`renderPost`, role channels Client/Trainer/Nutritionist/Shape +
  live community) are now **chat bubbles**: coaches (trainer/nutri) align left, members
  + your own posts (client/shape/You) align right; role-tinted bubble with a chat-tail
  corner, role tag, time, and reactions (♥ / ↳). Support thread + Strava ActivityCards
  untouched.
- **"+ New"** on the thread lists now opens a **New-message people picker** (searches
  members via `ShapeChannels.searchMembers`, opens a thread on select). Lives in the
  shared `BSClientFeed`, so it applies to **all profiles** (client/trainer/nutritionist).
  Note: member-to-member DMs have no backend yet (coach DMs do) — the opened thread is
  currently front-end only.
- **Feed header**: removed the bottom border line (new `noRule` prop on `BSMasthead`);
  "The feed." title now uses `t.DISPLAY` at the standard header weight.

### 2026-06-03 — Chat thread list redesign (Friends + Coaches)
- The `BSClientFeed` DM list `Row` (shared by the **Friends** and **Coaches** tabs)
  is no longer a bordered card — it's a clean **divider-separated row**: circular
  avatar with a green **online dot**, bold name, role eyebrow (e.g. "Your coach"),
  last-message **preview**, **time** top-right, and a **teal unread badge**.
- Added a list header per section: **"X unread · Y threads"** + a **+ New** action.
- Coach thread role labels now read "Your coach" / "Your nutritionist".

### 2026-06-03 — Shape Score header + tier-synced hero color
- Shape Score page header changed to **Your standing / Shape _Score._** (current serif
  font). The italic **"Score." now takes the current tier's color** (`bsTierColor`), and
  the composite **hero box border** is tier-colored too — so the title, ring, gradient,
  and border all sync with the member's tier.

### 2026-06-03 — Schedule in sync app-wide (calendar + home follow meal-time pref)
- **Calendar** (`iosAppBroadsheetCalendar.jsx`, shared client + coach): all event
  times now render **12-hour** via `bsCalTimeLabel()`, matching the day-log. **MEAL
  events carry a `slot`** (BFAST/LUNCH/SNACK/DINNER) and read `window.ShapeMealTimes`,
  so changing a meal time in Settings moves the calendar meal too — no title-parsing.
- **Home "next up"**: the lunch card time + ordering (`MEAL_AT`) and the `HOME_LUNCH`
  preview now derive from the lunch preference, so home, day-log, calendar, and the
  meal-preview eyebrow all show the same scheduled time.

### 2026-06-03 — Meal-time schedule surfaced in day-log; auth polish; compact score hero
- **Day-log rows now show the scheduled meal time** (eat page list + day brief + swap
  sheet) via shared `bsMealSchedLabel()` — meal's own time, else the client's meal-time
  preference for that slot, rendered 12-hour. Consistent with the preview eyebrow.
  (Calendar keeps its own per-event times.)
- **Auth screen**: "No account? Browse the app →" is now plain teal text (bubble
  removed). SHAPE logo brightened + teal glow + slightly larger (more visible).
- **Shape Score hero** made more compact (ring 112→86, padding/fonts trimmed).

### 2026-06-03 — Library heading/search polish + client meal-time preference
- **Library**: new heading — teal "Your library" eyebrow, serif **Saved / _everything._**
  title, italic subtitle ("Every workout, meal, recipe and grocery list you keep — in
  one place."). Search bar is now an **underline** (no pill/bubble).
- **Client meal-time schedule preference**: Settings → Preferences now has Breakfast /
  Lunch / Snack / Dinner time dropdowns (30-min steps), persisted in `client_settings`.
  A `window.ShapeMealTimes` cache (loaded at settings open, seeded from defaults) feeds
  the meal-preview eyebrow's slot fallback, so a meal without an explicit plan time
  shows the client's own eating time. Defaults 8:00 / 12:30 / 4:00 / 7:00.

### 2026-06-03 — Shape Score composite hero + compact meal CTA
- **Shape Score page**: new **composite hero card** above the reward tiers — a
  tier-colored ring (% to goal), the tier name as an italic headline, `{total} pts ·
  {week} this week`, a "composite of training, nutrition, recovery & consistency"
  blurb, and a 3-up mini-stat row (This week / Streak / To next tier). Removed the
  header's trailing score number and the old THIS-WK/THIS-MO/TIER stats grid (now
  covered by the hero).
- **Meal preview CTA row** reformatted + shrunk: Close / ♡ Save / teal "One tap ·
  Ate as planned ✓" are now compact single-line pills (Save is an inline toggle so
  all three match height).

### 2026-06-03 — Meal ingredients in household units (tied to Imperial/Metric)
- Added `bsHouseholdQty(qty, name)` / `bsHouseholdStr(str)` in the client module: a
  display-only converter that turns gram/ml ingredient quantities into **cups / tbsp /
  oz / slices**, keyed by ingredient name (`_BS_HOUSEHOLD` map) with safe fallbacks
  (oz for unknown solids, cups/tbsp for liquids). Stored data stays metric.
- Gated on the existing **Imperial/Metric** setting (`t.isMetric` from `ShapeUnits`):
  metric users still see grams; imperial users see household measures. Applied to
  `BSMealPreview`, `BSRecipePreview` (two-column rows, qty column widened 56→78), and
  the Shape Kitchen recipe detail (string ingredients).
- Auth screen: "No account? Browse the app →" pill font weight 700 → 400 (thinner).

### 2026-06-03 — Habits page rebuilt: To-dos / To-don'ts + add sheet
- **Completely removed** the old full-page add/edit form (`BSHabitForm`) and the dead
  habit UI layer (`BSHabitTracker`, `BSHabitInsights`, `BSTimeChip`, all the legacy row
  variants + grid card).
- `BSHabitsPage` is now: a compact **"Earned today"** score card (big `+N pts`, "of N
  possible · to your Shape Score", progress bar, % ring, tap → Shape Score) +
  two card-list sections — **To-dos** (teal) and **To-don'ts** (rust) — each with a
  count eyebrow (`x/y done` · `x/y clean`), a `+ Add →` link, and rounded habit cards
  (check, title, status line, points, ×). Done cards tint to the section accent.
- **Add flow** is a bottom sheet (portaled into `#bs-phone-surface`), do/avoid variant:
  eyebrow + serif "Something to *do.* / *avoid.*", text field, suggestion chips, a
  **points stepper** (− +N +), and Cancel / Add habit (accent CTA).
- Page header changed to **Daily habits** ("habits" in teal). Habits now carry an
  optional `pts` field (threaded through encode/decode + `create`); display falls back
  to a stable derived value.

### 2026-06-03 — Grocery list: food-group tabs + single Reset
- `BSGrocery` aisles are no longer a long scroll. A horizontal **food-group tab row**
  (one pill per aisle, e.g. PRODUCE/DAIRY/…) sits at the top; tapping a tab shows just
  that group's items (completed groups show struck-through). A single **Reset ↺** pill
  is pinned top-right on the same line and clears the active group's checks (disabled
  when nothing's checked). Removed the old per-aisle headers + per-aisle reset buttons.

### 2026-06-03 — Habits add/edit form redesign + recipe/grocery library saves
- `BSHabitForm` (the "super analog" Add Habit page) rebuilt to the rounded-card
  system: name in a rounded `PAPER2` field (was a 2px-INK underline), **Do daily /
  Avoid** as rounded green/rust toggle cards, **Reminder** + **Visibility** each in
  their own rounded card, visibility as a 3-up rounded pill segmented control (teal
  when active), and rounded pill **Cancel / Add habit** actions (teal CTA). `BSTimeChip`
  rounded to a pill with a hairline border.
- **Library boxes now fill:** added `BSSaveButton` (kind `recipe`) to the Shape
  Kitchen recipe detail (beside "Add to grocery"), and a ♡/✓ **Save to library**
  toggle (kind `grocery`) to the `BSGrocery` action row. The **Recipes** and
  **Groceries** stat cards on the Library page now reflect real saves.

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
