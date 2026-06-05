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

### 2026-06-05 — Coach "Adjust program/plan" actually adjusts (persists on Apply)
- The Adjust page (`BSProAdjustProgram`) controls used to be cosmetic — they only
  rewrote the auto-note. Now **Apply & Send / Apply & Notify** persist the full
  adjustment to the client's coach-writable program record, and the client app reads
  it back. Selections still take effect **only on Apply** (never on tap).
- **Migration `2026-06-05-client-program-detail.sql`** (**run on Supabase**): adds a
  `detail jsonb` column to `client_programs` (inherits the existing coach-writable RLS).
  Shape: `{ training:{intensity,sessions,weeks,focus[],days[],note,updatedAt},
  nutrition:{calories,protein,carbs,fat,meals,refeed,restrictions[],note,updatedAt} }`
  — trainer writes `training`, nutritionist writes `nutrition`; the two coexist.
- `shapeBackend.js`: `ShapeProgramApi.get/set` now read/write `detail` (set **merges**
  the incoming section over what's stored so a trainer's edit never clobbers a
  nutritionist's, and vice-versa).
- **Coach page** seeds its controls from the last-applied `detail` on reopen (so it
  shows what's currently in effect), and `apply()` writes `detail` via `ShapeProgramApi.set`
  before sending the note. Helper text now reads "On apply · updates {client}'s Train/Eat
  tab + sends this note" (live) / "applies once linked" (demo).
- **Client** (`useBSProgram` now carries `detail`): new **`BSCoachAdjustBanner`** ("FROM
  YOUR COACH · {date}" + chips + the note) renders atop **Train** (training) and **Eat**
  (nutrition). On **Eat**, coach-set **calories + P/C/F** override the hero's target
  numbers when present. Only appears once a coach has pressed Apply for a linked member.
- *Still illustrative:* the trainer split/sessions don't yet rewrite the Train deck's
  per-day workouts (banner + header reflect the intent); Eat target override is the
  hero card (other meal-plan views keep their plan targets). Follow-up if we want the
  adjustment to drive the full program/plan generation.


### 2026-06-13 — Coach plans persist + sync (coach_plans) — AI draft saves
- **Migration `2026-06-13-coach-plans.sql`** (**run on Supabase**): `coach_plans`
  (owner-scoped RLS; kind program|meal_plan; name/meta/price/published/detail jsonb).
- **API `/api/coach/plans`** (GET ?kind / POST / PATCH / DELETE, owner-scoped).
- `shapeBackend.js`: `ShapeCoachPlans.list/create/update/remove`.
- **Mobile** `BSTrainerPrograms` / `BSNutriPlans`: catalogue now loads the coach's saved
  plans from the API (merged ahead of the demo seeds). The **AI draft → Generate** saves a
  real `coach_plans` row (persists + syncs), and **Duplicate** persists a copy
  (localStorage fallback when signed out).

### 2026-06-13 — Soundtrack import resolves real Spotify metadata
- `/api/coach/soundtracks` POST now resolves a pasted **Spotify** playlist link via the
  client-credentials flow (`SPOTIFY_CLIENT_ID/SECRET`): pulls the playlist **name** (when
  the coach left it blank), **track count**, and **duration**, stored in existing columns.
  Graceful no-op when creds are absent or the link isn't a Spotify playlist. No schema change.

### 2026-06-13 — Coach soundtracks sync (web ↔ mobile) + Assign by-client tab
- **Migration `2026-06-13-coach-soundtracks.sql`** (**run on Supabase**): `coach_soundtracks`
  (owner-scoped, RLS; `attached` jsonb of `{id,kind,name}`) + updated_at trigger.
- **API `/api/coach/soundtracks`** (GET/POST/PATCH/DELETE, owner-scoped).
- `shapeBackend.js`: `ShapeSoundtracks.list/create/update/remove`.
- **Mobile `BSProSoundtracks`** now syncs: loads the coach's saved playlists from the API,
  Import creates server-side, Assign attaches via PATCH (falls back to localStorage when
  signed out). New **Assign tabs** — *Plans & workouts* and *By client* (search a client →
  attach the soundtrack to their assigned workouts).
- **Website Playlists page** (`trainerPlaylistsPage.jsx`) reads the same `coach_soundtracks`
  (server playlists merge into the library) and its Import modal saves to the API — so
  playlists created on either surface appear on both. (Attach-on-website still local for the
  demo seed rows; server rows carry their attachments.)

### 2026-06-13 — MESSAGE button wired + website coach client page redesigned
- **MESSAGE** button (mobile client profile) is wired: both coach shells listen for
  `shape:proMessageClient` → `getOrCreateMemberConversation` with the client + jump to the
  **Chat** tab (thread appears at the top of the coach's DMs).
- **`/api/clients/[id]/shared-overview`** now also returns **`stats`** (`get_client_stats`)
  and **`lifts`** (`get_client_lifts`) alongside `goals` (all share-gated).
- **Website coach client page** (`public/newdesign/coachClientDetail.jsx`) rebuilt in line
  with the mobile redesign: **Overview / Analysis** tabs, role-accented (teal trainer / gold
  nutritionist). Overview = KPI stat grid, **Key lifts** (trainer) / **Macros vs target**
  (nutri), a **bodyweight / weight-trend** chart, plus the existing Care team / Current plans
  / Goals / Upcoming+Recent. Analysis = a 6-up KPI grid + a trendline. Live values from the
  new rollups with per-field demo fallback.

### 2026-06-13 — Nutritionist Adjust Plan + Schedule (distinct bodies)
- **`BSProAdjustProgram`** now renders a **nutritionist-specific body** (gold) when
  `role==='nutritionist'`: ENERGY · Calorie target stepper (kcal, step 50), MACROS · Daily
  split (Protein/Carbs/Fat steppers with `g` unit + a **from-macros** summary card: kcal
  from macros, ± vs target, teal/gold/rust split bar, `NP·NC·NF`), STRUCTURE · Meals & refeeds
  (meals/day stepper + Weekend-refeed toggle), CONSTRAINTS · Restrictions chips. Auto-note
  reads "Updated your plan to {kcal} kcal — …". Trainer body unchanged.
- **`BSProScheduleSession`** nutritionist variant: session types CONSULT / PLAN DELIVERY /
  FOOD-LOG REVIEW / INTRO CALL, modes ZOOM / CALL / IN-PERSON (no GYM), default 30 min,
  "Book a consult." `PLAN` kind added to the calendar map.
- `BSProStepper` gained `step` + `unit` props.

### 2026-06-13 — Coach dashboard: Key lifts / PRs / AVG RPE wired (get_client_lifts)
- **Migration `2026-06-13-client-lifts.sql`** (idempotent, **run on Supabase**): SECURITY
  DEFINER `get_client_lifts(p_user_id)` gated on `is_coach_on_client`. Best-effort strength
  rollup from `workout_set_logs` / `workout_sessions`: **key lifts** (best parsed load per
  move over 90d + recent-vs-prior delta, top 5), **PR count** (moves improved in the last
  30d vs the 30–90d window), **avg RPE** (parsed from the set `payload.rpe` when present),
  and 42d logged-workout count. Loads/reps are free text so numbers are regex-parsed; null
  fields when there's nothing to read.
- `shapeBackend.js`: `ShapeClientStats.getLifts(userId)`.
- **`BSProClientFullProfilePage`** now threads the rollup in (per-field demo fallback):
  the **Key lifts** list (name · best · ▲delta · relative bar), the **AVG RPE** and **PRS**
  stat cards (Profile), and **AVG RPE / TOTAL PRS** on the Analysis tab.

### 2026-06-13 — Coach "Adjust program" + "Schedule" action pages (wired)
- The profile header's **ADJUST PROGRAM / ADJUST PLAN** and **SCHEDULE** buttons now open
  real full pages (`BSProAdjustProgram` / `BSProScheduleSession`, role-accented teal/gold)
  instead of firing no-op events.
- **Adjust program** ("Tune the program.") — Intensity segmented control (Deload/Maintain/
  Progress) with a live descriptor, Frequency & block steppers (sessions/week, weeks
  remaining), multi-select Focus chips, a tappable Weekly-split editor (⇄ cycles each day),
  and an auto-generated, editable **Note to {client}**. **Apply & Send / Apply & Notify**
  open/find the 1:1 conversation (`getOrCreateMemberConversation`) and **send the note to
  the client** (`sendMessage`, metadata `{kind:'program_update',notify}`); demo clients
  (no user id) show a "sends once linked" hint.
- **Schedule** ("Book a session.") — session type, day picker (next 7 days), open-slot grid,
  duration segmented control, mode chips, repeat-weekly toggle, a live booking summary, and
  **Add to calendar** → `ShapeCalendar.create({ userId: client, kind, title, date, time,
  durationMin, … })` (writes to the client's calendar via `/api/calendar`, coach role).
- Shared chrome helpers added: `BSProActionHead/ClientMini/ActionSec/Chips/Segment/Stepper`.

### 2026-06-13 — Coach client dashboard wired to live KPIs (get_client_stats)
- **Migration `2026-06-13-client-stats.sql`** (idempotent, **run on Supabase**): SECURITY
  DEFINER `get_client_stats(p_user_id)` gated on `is_coach_on_client`. Aggregates the
  coach-readable tables into one call: `sessions` attendance (completed/planned, last
  42d) + recent sessions, `daily_health_snapshot` nutrition (days logged 7/30d, avg
  calories/protein/carbs/fat over the last 7 logged days, workout minutes 30d), and
  `client_weigh_ins` (now/start/count). Null fields when there's no data.
- `shapeBackend.js`: **`ShapeClientStats.get(userId)`** → the RPC.
- **`BSProClientFullProfilePage`** now fetches the rollup for a linked client and threads
  live values into the dashboard with **per-field demo fallback**:
  - **Profile tab** — Attendance % + `done/planned sessions` (trainer); Adherence % +
    `N/7 days logged` (nutri); SESSIONS, WEIGHT Δ, LOGGED stat cards; **Macros vs target**
    rows (avg protein/carbs/fat); AVG INTAKE (avg calories); Recent sessions list (live
    `sessions`). Weight chart already lived off weigh-ins.
  - **Analysis tab** — ADHERENCE / SESSIONS / AVG INTAKE / PROTEIN / WEIGHT Δ / DAYS
    LOGGED KPIs pull from the same rollup.
  - Still demo (no clean source yet): bar sparklines, AVG RPE, PRs, Key lifts, streaks,
    the consult/cohort lines. Demo roster clients (no user id) stay fully demo.

### 2026-06-13 — Coach clients roster redesign (card list + header) — tab bar removed
- **`BSProRosterView`** (shared, `iosAppBroadsheetPros.jsx`) replaces the old divider-row
  roster on **both** coach client pages: editorial header (`{N} ACTIVE · +3 THIS MONTH`
  eyebrow + serif **"Your clients."** + a `+` add button), a search box, **scrollable
  filter pills** (scrollbar hidden via `.bs-hide-scroll`), the **Active / Past** toggle
  (kept), and tappable **rounded client cards** (avatar, serif name, `{program} · {N}d
  streak`, a status pill, chevron). Tapping a card opens the full profile directly.
- **`BSProStatusPill`** maps status → colored outline pill: ON TRACK / NEEDS EYES / NEW /
  MISSED / PR / DELOAD / PAST.
- **Removed the ROSTER / CONSOLE / ANALYSIS section sub-tab bar** (`BSProClientsTabBar`)
  from the clients page per request — the clients page is now just the roster. The
  section-level **Console** and **Analysis** screens are no longer linked from here
  (components left intact; per-client Analysis now lives inside each client profile).
- Demo rosters refreshed (name · program · streak · status) to match the new design;
  `bsClientMatchesFilter` extended (NEEDS EYES now includes `missed`).

### 2026-06-13 — Coach client-profile redesign (trainer + nutritionist) + roster filters
- **`BSProClientFullProfilePage`** (mobile coach apps, `iosAppBroadsheetPros.jsx`) fully
  rebuilt into a **role-aware, 3-tab dashboard** (teal for trainers, gold `#d8b25a` for
  nutritionists). Custom editorial header: `{phase} · WEEK 6 OF 12` / `{phase} · 2100
  KCAL` eyebrow + ← BACK, big serif name (last word accent-italic), avatar + since/streak
  + teal status pill (ON TRACK / STRONG / PAST), and **MESSAGE / ADJUST · PLAN / SCHEDULE**
  buttons.
  - **Profile tab** — big metric card (trainer ATTENDANCE 96% + 7-week bars / nutri
    ADHERENCE 92% + Mon–Sun bars), 4 stat cards, **Key lifts** (trainer) / **Macros vs
    target** (nutri), **Bodyweight / Weight trend** chart (driven by the client's **live
    shared weigh-ins** when available, else demo), **Recent sessions/logs**, **Inbox ·
    Needs your eyes**, and a private **Coach / Clinical note**.
  - **Analysis tab** — "ANALYSIS · LAST 30 DAYS" summary: a one-line readout + a 6-up KPI
    grid (role-specific) + a TRENDLINE chart (weekly volume / weight).
  - **Manage tab** — the previous coach controls, restyled: **program-phase** chips
    (live `ShapeProgramApi` setter), the client's **shared goals** (read-only, share-gated,
    with the live weight-trend mini-chart), and coach notes. (ADJUST jumps here.)
  - Nutritionist console now passes `role="nutritionist"`; trainer keeps the default.
- **Roster search + filters** on **both** coach client pages: new `BSProRosterFilter`
  (search box "Search N clients" + scrollable pills — ALL / ON TRACK / NEEDS EYES / NEW /
  CUT / BUILD [/ PEAK]) sits atop the roster under the tab bar. `bsClientMatchesFilter` /
  `bsClientMatchesQuery` filter the live roster (status/phase + name/meta search), role-aware.
- Dashboard stats/lifts/macros/recent/inbox are illustrative demo data; the bodyweight
  chart + shared-goals card are live when the client is a linked member who shares.

### 2026-06-13 — War Room: register client goals & weigh-ins
- New checklist section **"Client goals & weigh-ins"** in `src/lib/warroom.ts`: the
  3-tab Goal page, Me-page featured goal box, share-with-coaches toggle, coach read of
  shared goals (mobile + website + `/shared-overview`), live `client_weigh_ins` table +
  `ShapeWeighIns`, and the coach weight-trend chart — all `done`; the two migrations
  (`2026-06-13-client-goals-coach-read.sql`, `2026-06-13-client-weigh-ins.sql`) tracked
  as `manual` (applied on Supabase). No new API routes (`/shared-overview` already in
  `RAW_ROUTES`).

### 2026-06-13 — Client Goal page redesign: Overall / Training / Nutrition dashboards
- Rebuilt `BSClientGoals` into **three themed dashboards** (per the new designs):
  - **Overall** (teal): "down so far" weight card (start/now/target + draggable progress),
    current/to-go/weekly-pace/on-track stats, weight trend chart (`BSGoalsTrend`),
    milestones, your plans, this-week targets, consistency heatmap, "your why", log
    weigh-in CTA.
  - **Training** (rust): "strength held" card + 7-week heatmap, sessions/streak/RPE/PRs
    stats, lift targets, milestones, "your program" card.
  - **Nutrition** (gold): shared weight card + trend (gold), current/to-go/adherence/pace
    stats, **macros vs target** rows, milestones, "your plan" card, weekly nutrition targets.
- **Tab-aware header**: per-tab eyebrow + serif title (last word accent-italic) + subtitle,
  an **Edit** button (Overall → body-comp fields incl. start/now/target/why; Training/
  Nutrition → headline title+subtitle), and a per-tab accent on the 3-up tab pills.
- Persists `overall` + `trainingMeta`/`nutritionMeta` to `user_goals('client_goals')`;
  the **share-with-coaches** toggle moved to the page bottom (applies to all tabs). The
  dashboards' trend/milestones/targets are illustrative demo data for now.

### 2026-06-13 — Home quick-chips restyle (Today / Log / Habits / Score)
- The 4 home quick-action chips got a bolder, more modern look: rounder (15px), a
  soft **accent-tinted fill** + accent eyebrow, and a **bold display value** (15px/800,
  was tiny mono). The **Today** chip is now **hollow** (transparent fill, white `INK`
  border + text) instead of a solid black block.

### 2026-06-13 — Me-page featured goal box
- Client **Me** page: new **featured goal** card right below the Shape Score card —
  teal-tinted, taps through to the Goal page. Eyebrow `YOUR GOAL · BY {date} ›` +
  `{N}% THERE`, serif title (last word teal italic), teal progress bar, and the goal's
  subtext. Driven by the client's top goal (training[0] → nutrition[0], loaded from
  `user_goals('client_goals')`; demo default until loaded).

### 2026-06-13 — Weigh-ins are live (dedicated table) + coach sees the trend chart
- **Migration `2026-06-13-client-weigh-ins.sql`** (idempotent, **run on Supabase**):
  new `client_weigh_ins` table (user_id, logged_on date, weight, unit; one row/day via
  upsert), RLS (client owns; coach reads via `is_coach_on_client`). Also **extends
  `get_client_goals`** to merge the live series into `overall.weighIns` + set
  `overall.now` to the latest weigh-in (still share-gated).
- `shapeBackend.js`: **`ShapeWeighIns.list()` / `.log({weight,unit})`** (upsert today).
- **Client goal page**: when signed in, loads the series from the table (table wins for
  weighIns/now) and **Log weigh-in writes to the table**; signed-out/demo still uses the
  `user_goals` JSONB. The headline metas (training/nutrition) now load too.
- **Coach view** (mobile `BSProClientFullProfilePage` + website `coachClientDetail.jsx`):
  the Overall goal card now draws the client's **weight trend chart** from the live
  `overall.weighIns`.

### 2026-06-13 — Coach goal view follows the redesigned goal (Overall + headlines)
- The redesign moved client goals to `overall` + `trainingMeta`/`nutritionMeta`; the
  `get_client_goals` RPC already returns the whole doc, so just the coach UIs changed.
- **Mobile** (`BSProClientFullProfilePage`) + **website** (`coachClientDetail.jsx`):
  the Client-goals card now shows the client's **Overall** body-comp goal (title +
  progress bar + `down · to go · now · target`, with the target date), plus the
  **Training** and **Nutrition** headline goals (title + subtitle). Private / none /
  loading states unchanged.

### 2026-06-13 — Coach goal view on the website + goal-sheet polish
- **Website coach client page** (`coachClientDetail.jsx`): added a **GOALS** card showing
  the client's shared Training/Nutrition goals (progress + target), fed by the
  `shared-overview` API route which now calls `get_client_goals` (server-side, the coach's
  session → RLS-gated). Same states as mobile: private / none / list.
- **Mobile goal sheet**: per-goal **Edit** button now teal; removed the drag-handle bar
  at the top of the add/edit sheet.

### 2026-06-13 — Coach sees a client's shared goals (read-only)
- **Migration `2026-06-13-client-goals-coach-read.sql`** (idempotent): SECURITY DEFINER
  `get_client_goals(p_user_id)` — returns the client's `user_goals('client_goals')`
  document **only** to a coach linked via `is_coach_on_client`, and **only** when the
  client's `share` flag is on (else `{share:false}`; `null` when not their coach).
  **Run on Supabase.**
- `shapeBackend.js`: `ShapeGoalsApi.getForClient(userId)` → the RPC.
- **Coach app** (`BSProClientFullProfilePage`): new **Client goals** section under the
  program-phase chips — fetches via the RPC and renders the client's Training/Nutrition
  goal cards read-only (progress + target). States: private ("keeps their goals
  private"), none shared, or demo ("appears once linked to a live member").

### 2026-06-13 — Client Goal page (Training/Nutrition tabs + coach-visibility toggle)
- **Mobile**: new `BSClientGoals` (linked from the **Me** tab → "Goals"). Mirrors the
  website goal page (`public/newdesign/ClientGoal.html`): goal cards (eyebrow `GOAL ·
  N%`, title, current/target, progress bar, subtext, optional target-date countdown)
  and a bottom-sheet add/edit flow with a **categorized template picker** (the website's
  templates, filtered to the active tab's group). Persists to `user_goals('client_goals')`
  as `{ share, training:[], nutrition:[] }`.
  - **Training / Nutrition tabs** split the goal lists; **Share with your coaches**
    toggle controls coach visibility (stored on `share`).
- **Website** (`ClientGoal.html`): added the same **Training/Nutrition tabs** + **Share
  with coaches** toggle; split `DEFAULT_GOALS_STATE.goals` into `training`/`nutrition`
  (+ `share`), migrate the legacy flat `goals` array into Training on load, and
  save/delete/Archive now operate on the active tab.

### 2026-06-04 — Fix: logging in as a coach lands in their app (not client)
- Signing in as a trainer/nutritionist dropped you into the **client** app until you
  manually switched role in Settings — the role state wasn't reliably re-derived from
  the signed-in profile at login.
- `BSAppShell` now (1) has a reactive effect that **follows `authState.profile.role`**
  whenever a session resolves (login OR restore), and (2) `handleLogin` sets both
  `role` and the `role` tweak from the account's profile — so a coach lands in their
  own app, and a stale dev-override can't pull them back to client. The Tweaks-panel
  override still works after login.

### 2026-06-04 — Recover from stale-chunk "failed to fetch dynamically imported module"
- Switching profiles (role → `loadProsBundle`) could throw **"Failed to fetch
  dynamically imported module … iosApp…-<hash>.js"** — a stale chunk after a redeploy
  (the cached `index.html` points at a hash that no longer exists).
- `loadClientBundle` / `loadProsBundle` now `.catch` import failures via
  **`_bsChunkRecover`**: on a stale-chunk error it **reloads once** (sessionStorage
  guard → one auto-reload per tab session) so the fresh `index.html` pulls the new
  hashes; the cached bundle promise is reset so it isn't stuck rejected.
- The bundle-error screen is friendlier — **"A new version is available. Reload to
  continue."** + a **Reload →** button (clears the guard) — with the raw error kept
  small below. *(Takes effect once this build is live; an existing stale tab needs one
  manual refresh to pick it up.)*

### 2026-06-04 — Avatar color = your tier (app-wide); accent picker removed; instant save
- **Every "your own" avatar now fills with your Shape Score tier color** (Base/steel
  until you earn points): the 5 client header avatars, the **Settings** identity editor
  (edit + non-edit), and — via newly window-exposed `bsMyName/bsMyInitials/bsMyTierColor`
  — the coach home headers + `BSProMe`. Tier is cached on **`window.ShapeScore`**
  (`_bsUseLiveScore` + a startup `/api/client/score` fetch in both the client and the
  two coach shells).
- **Removed the avatar accent-color picker** in Settings → edit-profile; the swatch row
  is now a read-only "{tier} tier color" chip. (`accent` is no longer used for the
  avatar; the editor's focus/chip accent follows the tier color too.)
- **Instant update on save**: saving the profile fires a `shape:identity` event; the
  app shell bumps `identityVersion`, so the avatars on the **current** screen pick up
  new initials immediately — no navigation needed.

### 2026-06-04 — Feed avatars: 2-letter initials, tier-colored own bubble, custom initials
- **Full (2-letter) initials** in the feed + community-activity avatars (e.g. "CP"
  not "C"); the role-feed avatar grew 32→36px to fit them cleanly. New `bsInitials()`
  helper (DM threads already did this).
- **Own bubble matches my real tier**: in chat, my own posts now tint to my actual
  Shape Score tier (Base/steel until I earn points) instead of a name-hash — resolved
  the same for the optimistic + persisted copies so it never flips.
- **Custom avatar initials** — edit-profile gained an **"Avatar initials · max 2"**
  field (alphanumeric, auto-uppercased, clamped to 2). Stored in `client_identity`
  and cached on `window.ShapeIdentity`, hydrated at app startup, so the override shows
  on **every** avatar — header, feed, Me card, and the coach Me page (`BSProMe`) —
  not just the edit form. Blank = derive from the display name. `bsMyInitials()` reads
  the override first.

### 2026-06-04 — Fix self-identity in feed + coach Me page
- **Feed: own posts kept flipping color.** The optimistic **"You"** post derived its
  tier from a hash of the string `'You'` (→ one color) while the persisted copy hashed
  the real name (→ another), so a just-sent message changed color after navigating away
  and back. Now any post that's **mine** resolves its tier from my real account
  identity — my real tier when known, else a stable hash of `bsMyName()` — so the
  optimistic and persisted copies always match. Own posts also read **"You"**
  consistently (was "You" → real name on refetch), and `myUserId` is included in the
  feed's tier batch.
- **Coach Me page showed "Jordan Chen".** `BSProMe` (trainer/nutritionist Me tab) was
  hardcoded via a `name` prop, so the header didn't match the name in Settings. It now
  uses the signed-in account's `full_name` (same source as Settings + the client Me
  page), falling back to the demo prop when signed out; the public-profile link uses it
  too.

### 2026-06-04 — Habits: "To don't" rename + compact Earned-today header
- The avoid section + the Earned-today card breakdown now read **"To don't"** (was
  "Don't do it"); "To do" unchanged.
- **Earned-today card top compacted** to match the breakdown sizes below it: big
  number 38→22, eyebrow 8.5→8, pts 10→8.5, subline 9→8.5, ring 48→42 (inner 37→32,
  % 10→9).

### 2026-06-04 — Header avatars match the signed-in account + chat top-rule removed
- The five "your own" header avatars (home / train / eat / chat / me) were hardcoded
  to **"A"**. New `bsMyName()` / `bsMyInitials()` helpers read `profiles.full_name`
  from the auth cache (the same source the Me page uses; the edit-profile flow writes
  + mirrors it), so the avatars now show the account's **real initials** (e.g. "JD"),
  falling back to the demo identity when signed out.
- The **Me identity card** now seeds its name + handle from the signed-in account
  (was a hardcoded "Alex Rivera" / "@alex.rivera") before any edit; a saved
  `client_identity` still overrides.
- **Chat page top border removed**: `BSMasthead`'s top hairline is now suppressed when
  `noRule` is set. Only the feed/chat passes `noRule`, so other mastheads keep it.

### 2026-06-04 — Habits page copy/colors + score breakdown; About hero accents
- **Habits sections renamed**: "To-dos" → **"To do"**, "To-don'ts" → **"Don't do it"**.
- **Don't-do-it section is red**: its count eyebrow + **+ Add →** now use the section
  `accent` (rust) instead of teal. The avoid-eyebrow word **"Clean" → "Stop"**
  (`0/1 Stop`).
- **Earned-today card breakdown**: added a 2nd section splitting the day's points into
  **To do** (teal) vs **Don't do it** (rust) — each with `+earned / possible pts` and a
  mini progress bar.
- **About page**: "shape" in the **"A place to shape a life."** hero is now teal; the
  closing line **"Come shape with us." → "Join the community."** (accent on "community").

### 2026-06-04 — Train session wired to the shared week (end-to-end workout consistency)
- The Train tab's demo program (`MOCK_PROGRAM`) was a **different week** than the
  shared one — e.g. Thursday read "Lower Pull — Peak" on Train but "Z2 run · 45 min"
  on home/calendar. Now the Train **deck, live session, and preview** all build from
  the same source.
- New **`bsBuildDemoTrainProgram(t)`** (in `bsClientWeekDemo.js`) builds the 7-day
  Train program from `BS_CLIENT_WEEK_DEMO` + `BS_CLIENT_WORKOUTS`, mirroring the
  live-plan builder's day shape. `MOCK_PROGRAM` is now just `bsBuildDemoTrainProgram(t)`
  (~135 lines of hardcoded data removed). Real assigned plans still win (`liveProgram`).
- **Live session reflects the real scheme**: the player now parses `4 × 8 · …` →
  `{ sets:4, reps:'8' }` per move (was a hardcoded `sets:4, reps:'6-8'`); cardio
  segments fall back to one set.
- **Hero** eyebrow shows the day + the workout's real time (e.g. "Today · 5:45 PM"),
  and meta comes from the workout (no more hardcoded "52 min · … RPE 8 · ~420 kcal").
- **"On deck"** list is derived from the program (next 3 days, tap to jump) instead
  of a hardcoded list.
- **Preview** prefers each move's authored `cue`; added a distinct `brief` to each
  workout so the preview's brief + coach line differ.
- Net: a given weekday now shows the **same workout** on the home hero, the week
  strip, the calendar, the Train deck, the preview, and the live player.

### 2026-06-04 — Shape Kitchen polish: top buffer, clear Send button, one filter section
- **Top buffer**: the Shape Kitchen header sat too high (`14px` top) — bumped to
  `54px` to match the standard page buffer (`BSPageHeader`).
- **Send to grocery list** button de-emphasized: removed the solid teal fill →
  transparent with a hairline border (matches the Save button's outline).
- **Filters merged into one section**: the meal-type quick pills and the separate
  collapsible "FILTERS" bar are now a single block — the pills row gains an inline
  **Filters ▾** toggle (active-count + Clear) that expands the Diet / Protein /
  Free-from / Goals groups in place. Removed the standalone FILTERS disclosure bar.

### 2026-06-04 — Fix: Train "Plan" → calendar → back no longer auto-starts a workout
- The Train **"On deck · Plan →"** action opens the calendar overlay, which (early
  `return` in `BSClientAppInner`) **unmounts** `BSClientTrain`. The auto-launch was a
  **monotonic counter** (`trainAutoStart`) and the screen started a session whenever
  `autoStart > 0` on mount — so hitting **back** remounted Train and re-fired the live
  session if the counter had ever been bumped.
- Replaced the counter with a **one-shot `pendingTrainStart` flag**: the calendar's
  "Start session" sets it true; `BSClientTrain` consumes it (`onAutoStartConsumed` →
  back to false) the moment it launches, so a remount with no pending start does
  nothing. Plan → calendar → back now returns to the Train deck, as expected.

### 2026-06-04 — Home "Up next" workout reflects today's real session
- The home **"Up next" workout card** + its **preview** (`BSHomeWorkoutPreview`) were
  hardcoded to "Upper Pull — Peak", so the featured workout didn't match the day.
  Now both read **today's actual workout** from the shared week (`bsClientWorkoutForDay`).
- Added **`BS_CLIENT_WORKOUTS`** (in `bsClientWeekDemo.js`) — move lists + coach note +
  summary keyed by the week's TRN titles (4 strength days + 2 cardio days). The hero
  card shows the title, the day's scheduled time, a short meta, and the first 3 moves
  (+N more); the preview shows the full move list, coach note, and a "Today · …" date.
- **Cardio** workouts (Z2 / long run) render as segments (no load); the **rest day**
  (Sun) shows an "Active recovery." card instead of a session.
- *Note:* the Train-tab session itself isn't wired to this yet — only the home hero +
  preview. (Possible follow-up.)

### 2026-06-04 — Month-view day cells are square
- `BSCalendarMonth` day cells were a fixed `minHeight: 58` over a ~46px-wide track
  (portrait rectangles). Swapped to **`aspectRatio: '1 / 1'`** (padding/gap trimmed)
  so each day box is square.

### 2026-06-04 — Home week strip ⇄ month calendar now share one source
- The client **home week strip** (day-log + week dots) and the **month calendar**
  (logged-out demo) were two **independent hardcoded datasets**, so the same weekday
  showed different workouts; the calendar also had a **broken day-remap**
  (`sourceDayByDate` mapped 20→11, 21→**14**, …) that collided remapped events with
  the month-density events, double-stacking days.
- New shared **`bsClientWeekDemo.js`** (`BS_CLIENT_WEEK_DEMO`, Mon..Sun, color-agnostic
  by `kind`) is the single source of truth:
  - **Home** builds `DAY_LOGS` (keyed 20..26) + `WEEK_DOTS_BY_IDX` from it.
  - **Calendar** `clientEvents` builds from it — the authored week sits cleanly on
    **May 11–17 (Mon–Sun)**; workouts repeat on adjacent weeks for month density.
    The `sourceDayByDate` remap now applies **only to trainer/nutritionist** (still
    authored on 20–26); client skips it. Demo meals show their literal times (no
    `slot` flattening) so they match the strip exactly.
- **Header**: the client calendar masthead **"The calendar." → "Month's plan."**
  (trainer "The schedule." / nutritionist "The diary." unchanged).

### 2026-06-04 — Recipe box ⇒ merged into Shape Kitchen (one page)
- The Recipe box and the old `BSShapeKitchen` page showed the **same recipes**; the
  only thing Kitchen had extra was its **advanced filters**. Merged them into one:
  - `BSRecipeBox` is **rebranded "Shape Kitchen."** (eyebrow + serif hero) and now
    carries the advanced **Diet / Protein / Free-from / Goals** filters as a
    collapsible "Filters" disclosure (badge = active count, "Clear", live recipe
    count), folded in alongside the existing quick meal-type pills + search.
  - **Removed** the redundant "Browse Shape Kitchen →" link, the `showKitchen` route,
    and the now-dead `BSShapeKitchen` component (~90 lines). `BSShapeKitchenRecipe`
    (the detail page) is unchanged.
  - **Recipe-card actions shrunk** (Send to grocery / Save): padding 11→7px, font 9→8.
- One place for recipes now; nothing lost.

### 2026-06-04 — Unify recipe ⇄ meal detail "anatomy"
- The Shape Kitchen recipe detail (`BSShapeKitchenRecipe`) and the meal-plan meal
  detail (`BSMealPreview`) had drifted. Brought the recipe page up to the meal page's
  shared anatomy so both read the same: **4-up macro stats incl. KCAL** (was 3-up
  P/C/F with kcal only in the hero pill), a **macro-split bar** (% of kcal, computed
  from `r.macros`), and a **"The dish"** eyebrow over the coach blurb (matching the
  meal page's description treatment).
- **Context tails kept distinct** (by design): a *meal* keeps its schedule eyebrow +
  "Ate as planned" log CTA; a *recipe* keeps serves + Pro tip + Reviews + Add-to-grocery.

### 2026-06-04 — Recipe box (new Recipes tab) + Saved/liked recipes
- New **`BSRecipeBox`** is the Recipes sub-tab: serif "Recipe box." hero, underline
  search, **All / Saved / Breakfast / Lunch / Dinner / Snack / Plant-based** filter
  pills, and recipe cards (hero-gradient thumb, category·coach eyebrow, title, one-line
  macros). Each card has **Send to grocery list →** (one teal action → builds that
  recipe's OWN list and opens it) + **♥ Save** toggle (kind `recipe`, so liked recipes
  show under the **Saved** filter and in the main Library). No "send all" bulk action.
- **Shape Kitchen kept** — the full catalog is reachable via the "Browse Shape Kitchen →"
  card (`showKitchen` state); recipe detail (`BSShapeKitchenRecipe`) shared by both.

### 2026-06-04 — Feed bubble look applied to DM / channel threads
- `BSChatThread` (Friends DMs, Team coach DMs, Channels) now matches the feed bubbles:
  an avatar next to each incoming message (tier color for people, teal for channels), a
  tinted/bordered bubble with a chat-tail corner, name eyebrow, and the same reaction
  affordances. Your own messages stay right-aligned in teal.

### 2026-06-04 — Saved-carts redesign + removed coach note / How-it-works
- **Saved carts** (`BSGroceryLibrary`): filter tabs are rounded pills; each list is a
  rounded `PAPER2` card (eyebrow, title + chevron, preview, rounded Load/Edit/Delete
  pills); the open preview is a nested rounded card.
- Removed the amber **coach-note quote box** from the grocery list page.
- Removed the **"How it works"** box from the Shape Score page.

### 2026-06-04 — Rounded-card redesign: Recipe / Shape Score / Shape Store
- **Recipe detail** (`BSShapeKitchenRecipe`): macro grid, Ingredients, and Method are
  now rounded `PAPER2` cards (1px RULE, hairline dividers) — dropped the 2px-INK ledger
  tops, matching the meal preview.
- **Shape Score**: Reward tiers, Rewards, Point values, and Recent-points ledger wrapped
  in rounded cards; "How it works" is now a rounded card too (less full-bleed).
- **Shape Store**: Catalog + Unlocked-codes lists wrapped in rounded cards; removed the
  hard rule under the category filters.
- **Grocery food-group tabs** shrunk (smaller pill font/padding) with edge padding so
  they fit/scroll cleanly without the last tab clipping.

### 2026-06-04 — Live tier + real messaging from chat profiles
- **Migration `2026-06-04-public-profile-card.sql`**: `get_public_profile(user_id)`
  (name, role, all-time points → tier, + public bio/pronouns/goal/link gated on
  Public visibility) and `get_user_points(uuid[])` batch (feed tier coloring).
  SECURITY DEFINER (score_ledger is self-only). **Run on Supabase.**
- Feed posts now carry **`author_id`** (`mapPost` → `userId`). `BSClientFeed`
  batch-fetches authors' points → **real tier** tints avatars/bubbles
  (`bsTierForPoints`); falls back to the derived tier.
- **`BSPublicProfile`** fetches the live card (real tier + public bio) when a userId
  is present.
- **Message** from a profile now routes through `getOrCreateMemberConversation` when
  the author has a userId — a real, persisted conversation (front-end thread otherwise).
- Radio prompt: the EQ icon now sits in a sized, clipped box so it fits the green tile.

### 2026-06-04 — Chat role tag follows the author's real role
- `mapPost` now carries `authorKind` (the author's real role from `community_posts.
  author_role`) separately from `kind` (the channel/section, used for filtering).
- `renderPost` uses `authorKind` for the **role tag, tag color, and L/R alignment**, so a
  trainer/nutritionist posting in the general feed reads "Trainer"/"Nutritionist" — not
  the section label. Own posts tag with the signed-in role. Profile opens with the real
  role too.

### 2026-06-04 — Tier-colored chat + tappable avatars → public profile
- **Feed bubbles**: avatar fill **and** bubble tint now follow the author's **tier**
  (`bsPostTier` → `bsTierColor`; explicit `tier` wins, else stable per-name). Role tag
  keeps its role color.
- **Alignment**: in the mixed **Community** feed coaches sit left / members + you sit
  right (conversation feel, matches the mock); single-role sections keep "only your own
  on the right".
- **Tappable avatars** (and names) open a new **`BSPublicProfile`** page — works for
  **clients and coaches** — tier-ringed avatar, tier·role, bio, **Message →**, plus a
  **Coaching →** link for coaches. Gated on `p.public !== false` (privacy-aware).

### 2026-06-04 — Per-client program phase (coach-writable) + presence confirm
- **Presence at launch** confirmed live (`getCurrentSession` → `startPresence`), so
  "● N online" is app-wide.
- **Program phase is now a real per-client store**: migration
  `2026-06-04-client-program-phase.sql` adds `client_programs` (user_id PK,
  training_phase, nutrition_phase) with RLS — **client owns their row; a coach with an
  active sub can read AND set it** (via `is_coach_on_client`). **Run on Supabase.**
- `shapeBackend.js`: `ShapeProgramApi.get(userId?)` / `.set({ userId, trainingPhase,
  nutritionPhase })`.
- Client `useBSProgram` hydrates from the real store (client_settings fallback); the
  Settings phase dropdowns now also write to it.
- **Coach app**: the client **full-profile** page shows a `{nutrition} · {training}`
  phase eyebrow and **Training block / Nutrition phase chips the coach can set** —
  persists to the client's row when the roster entry has a real user id (demo roster is
  local-only, labeled as such).

### 2026-06-04 — Calendar Start session + real Reschedule; profile persistence
- **Start session** (calendar workout sheet, client): fires a `shape:startWorkout`
  window event → the app shell closes the calendar, jumps to **Train**, and
  auto-launches the live session (`BSClientTrain` `autoStart` prop → `BSSession`).
- **Reschedule** is now real: a native date picker → `ShapeCalendar.update({ id, date })`
  for live editable events (PATCH /api/calendar); demo events fall back to a toast.
  Delete kept for live editable events.
- **Edit-profile persists**: identity (name/handle/location/bio/accent/pronouns/link/goal)
  saved to `user_goals('client_identity')` + loaded on open, so it survives sessions/
  devices. Display name also mirrors to `profiles.full_name` via new
  `ShapeAuth.updateProfileName` (keeps chat/search/leaderboard names in sync).

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
