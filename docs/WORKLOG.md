# Shape — working notes & changelog

Running memory for ongoing work on the Shape app. Skim this before starting
mobile/website work so context carries across sessions. Add a dated entry to the
changelog whenever something ships.

## How we work

- **No colored emoji for NEW additions going forward.** Any emoji you *add* from
  now on should be monochrome — use typographic symbols (⚙ ↗ ✓ → × ♡ ＋ #) or
  theme-tinted inline SVG/icons, matching the editorial aesthetic. **Do NOT
  retroactively change existing emoji or colors** already in the app/website
  (especially on profiles) — leave current ones as-is. Rule applies to new emoji
  only.
- **Migrations: just post the raw GitHub SQL link.** When a migration is
  created, reply with only the `raw.githubusercontent.com/.../supabase-migrations/<file>.sql`
  link — the user runs it on Supabase. Don't paste the SQL body or long explanations.
- ⛔️ **NEVER edit on a stale base — verify FIRST, every session/turn.** The web
  container periodically re-clones/resets the working tree to an *older* commit
  while `origin/main` holds the real latest. Editing on that stale base creates
  duplicate commits, rebase conflicts, and lost work — it has cost real tokens
  multiple times. **Before making ANY edit:** run
  `git fetch origin main && git rev-parse --short HEAD origin/main` — if HEAD ≠
  origin/main, run `git reset --hard origin/main` first. `main` and the session's
  dev branch (the current `claude/*` working branch — it differs per session) are
  always kept identical (push both to the same commit); treat `origin/main` as the
  single source of truth.
- **Mobile app** lives in `mobile-app/` (Capacitor/Vite SPA, the `/m/` broadsheet).
  - Build: from `mobile-app/`, `VITE_BASE=/m/ npm run build`.
  - Publish into the website: from the **repo root**, `rm -rf public/m && cp -r mobile-app/dist public/m`.
  - Parse-check a JSX file before building:
    `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
- **Website = `public/newdesign/`.** This is the canonical, live website surface
  we build on — **always edit the pages here** (`*.html` + their `*.jsx` babel
  blocks/companions), not anywhere else. Each `*.html` is the live page; many are
  **self-contained** (inline `<script type="text/babel">`) and pull in shared
  `living*.jsx` / `chatWidget.jsx` / `pageShell.jsx` via `?v=N` tags — **bump the
  `?v=` when you change a referenced `.jsx`** so the cache busts. A few legacy
  `*.jsx` files (e.g. `memberProfile.jsx`) are **orphaned/dead** (nothing loads
  them) — confirm a file is actually referenced before relying on an edit there.
  The Next.js app at the repo root (`src/`) is **API routes + the gated
  `/dashboard`** (typecheck: `npx tsc --noEmit`); the public/marketing/profile/
  store/coach pages all live in `public/newdesign/`.
- **Git / deploy:** develop on the session's `claude/*` branch. Per change: commit →
  push → open PR → **wait for the CI checks to go green** (`.github/workflows/ci.yml`:
  Web typecheck+build, Mobile build + public/m sync) → **review the PR diff** →
  squash-merge → re-sync the branch to `main`
  (`git fetch origin main && checkout main && reset --hard origin/main && checkout <branch> && reset --hard origin/main && push --force-with-lease`).
  Don't merge on red — a failed check is exactly the broken-main it exists to stop.
  CI also fails when `public/m` is stale (mobile source edited without republishing).
- **Diff review before merge (standard practice).** For any non-trivial change
  (logic, data flow, theming, anything touching shared components), give the PR
  diff a dedicated review pass before squash-merging — hunting specifically for:
  logic bugs/regressions, missed `?v=` cache-bust bumps on edited referenced
  `.jsx`, theme-token violations (hardcoded ink/paper on themed surfaces, theme
  tokens on fixed-background screens), demo-vs-live data leaks, and changes to
  shared code that other profiles/pages also render. Docs/copy-only tweaks can
  skip it. Riskier changes additionally go to `staging` for a click-through
  before merging.
- **Test branch = `staging`** (long-lived, Vercel preview). Pushing any commit to
  `staging` auto-deploys to the stable preview URL
  **https://shape-app-git-staging-cperry8800-droids-projects.vercel.app** — production
  (`theshapecommunity.com`) is untouched. Use it for riskier changes you want to
  click through before merging: `git push origin <branch-or-sha>:staging --force`
  (it's a scratch pointer — force-resetting it is fine; merging to main still goes
  through the normal PR flow). Every dev-branch push also gets its own preview at
  `shape-app-git-claude-<branch>-….vercel.app`. **Caveats:** previews share the
  PRODUCTION Supabase DB + env vars (no isolated test data; don't test destructive
  migrations here — Supabase branch DBs need the Pro plan, currently deferred), and
  if a preview URL asks you to log in, that's Vercel Deployment Protection
  (Project Settings → Deployment Protection to relax it).
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

### 2026-06-12 — Check-in kit website parity (client pages + coach client page)
- **New `GET/POST /api/client/checkin-kit`** (cookie/Bearer, RLS-scoped): GET →
  my check-ins + measurements + health profile; POST `action:'checkin'`
  (upsert this week's row + measurement entries) or `action:'health'` (upsert
  user_goals 'health_profile'). Exists so the self-contained newdesign pages
  don't need a supabase client; mobile stays direct.
- **`ClientProgress.html`**: new `CheckinKitSection` under the Trends tab —
  the full weekly check-in form (6× 1–10 ratings, weight + 6 girths,
  front/side/back photo attach via `/api/client/progress-photos`,
  wins/struggles/question, prefills this week's row) + **Measurements**
  (latest per site + Δ) + **Progress photos** timeline cards. Renders nothing
  signed-out / pre-migration.
- **`ClientMe.html`**: new **Health profile** card (PAR-Q 7×Yes/No + injuries +
  medications + emergency contact; all-clear/flagged status chip) saving via
  the kit API.
- **`coachClientDetail.jsx`** (`?v=20260612` on TrainerClient + Nutritionist
  Client): `/api/clients/:id/shared-overview` now also returns `checkins`,
  `measurements`, `progressPhotos`, `healthProfile` (the coach-gated RPCs);
  the page renders **Latest check-in** (6 ratings + wins/struggles/asked-you),
  **Health profile · screening** (liability card), and **Body · measurements &
  photos**.

### 2026-06-12 — The check-in kit: weekly check-in · measurements · progress photos · health intake (research-driven)
- **Coach-metrics research** (5-agent web pass — Trainerize/Everfit/TrueCoach/
  TeamBuildr/MyPTHub/PT Distinction/PN/WAG + ACE/NASM): full gap analysis
  registered in the War Room ("Check-in kit & coach-metrics gaps"). Built the
  three standard-of-care gaps now; steps/e1RM/energy·hunger/hydration UI and
  the differentiators (cycle awareness, weekend-split adherence) tracked as
  to-builds.
- **Migration `2026-06-12-checkin-kit.sql`** (**run on Supabase**):
  `client_measurements` (ACE sites, one row/user/day/site), `client_checkins`
  (one/user/week, ratings jsonb + wins/struggles/question + weight),
  `client_progress_photos` + PRIVATE `progress-photos` bucket, and 4 coach
  RPCs (`get_client_checkins/measurements/progress_photos/health_profile`) —
  all owner-RLS'd, coach read gated on `is_coach_on_client`. The health
  profile is deliberately NOT share-gated (liability screening).
- **`BSWeeklyCheckin`** (client): the weekly ritual — 6× 1–10 ratings
  (training/nutrition adherence · sleep · energy · stress · hunger), optional
  weight (also writes a weigh-in) + 6 girth measurements + front/side/back
  photo uploads + wins/struggles/question. Upserts this week's row. Entries:
  **home due-plate** ("Weekly check-in · due") when no row this week +
  Settings → Weekly check-in.
- **`BSHealthIntake`** (client): REQUIRED one-time gate after sign-in (PAR-Q+
  7 yes/no + injuries + medications + emergency contact + consent; yes-answer
  warning). Gates in `BSClientAppInner` (never flashes for completed accounts,
  fails open on fetch errors); editable later via Settings → Health profile.
- **Progress hub (Overall)**: live-only **Measurements** card (latest per site
  + Δ since first) and **Progress photos** timeline (date rows of front/side/
  back thumbs → tap to open).
- **Coach client profile** (both roles): Profile tab gains **"Check-in · Week
  of …"** (ratings grid + wins/struggles/asked-you); Manage tab gains **Health
  profile** (PAR-Q all-clear/flagged + injuries/meds/emergency) and **Latest
  measurements**. All live-only via `window.ShapeClientKit`.
- **Backend**: `ShapeCheckins` / `ShapeMeasurements` / `ShapeProgressPhotos`
  (private-bucket upload via **`/api/client/progress-photos`**, service-role +
  1-yr signed URLs) / `ShapeHealthProfile` (user_goals 'health_profile') /
  `ShapeClientKit` (coach reads). Website parity tracked as the next PR.

### 2026-06-12 — Stats accuracy: weight/body-fat/macros/volume get REAL sources (+ demo-data preview banner)
- **Audit finding**: the Progress page read everything from `daily_health_snapshot`,
  but `weight_lb`, `body_fat_pct`, `protein_g`, `hydration_l` had **no writer** —
  the per-field demo fallback silently showed example numbers that looked live.
  Demo data stays (it's the intended signed-out example); the fix is real sources
  for signed-in accounts:
- **(1) Weight**: `/api/client/progress` now builds the weight series from
  **`client_weigh_ins`** (what Log-weigh-in writes), normalized to lb; snapshot
  rows remain the fallback. Fixes the split-brain where Goals showed real
  weigh-ins and Progress showed demo weight.
- **(2) Body fat**: **migration `2026-06-12-weigh-in-body-fat.sql`** (**run on
  Supabase**) adds `client_weigh_ins.body_fat_pct`; the weigh-in sheet gains an
  optional **Body fat %** field (`ShapeWeighIns.log({ bodyFat })`, pre-migration
  retry guard); the progress body-fat series reads it (select('*') so the route
  works pre-migration).
- **(3) Meal macros**: new **`POST /api/nutrition/meal-log`** accumulates
  kcal/protein/carbs/fat (+ optional hydration) onto today's snapshot row —
  called from the one-tap "Ate as planned" and the full logger's Log action
  (`window.ShapeMealLog.log`). Nutrition "today vs target" + macro adherence now
  track actual logging.
- **(4) Volume**: in-app live-session saves roll `durationSeconds` into
  `daily_health_snapshot.workout_minutes` (accumulating, best-effort) — the
  Progress volume series counts app workouts alongside device-synced ones.
- **Preview banner re-added** (was removed 2026-06-11): preview mode again shows
  the dismissible bottom banner, reworded to "**Preview · demo data** — These
  numbers are an example of a live account — not real tracking." with the $5/mo
  Join CTA. Still hides under the Radio prompt.

### 2026-06-12 — Grocery page: source chip · Lists tab · small ＋ box (clutter removed)
- **"+ NEW LIBRARY" and the "AUTO-BUILT FROM YOUR MEALS" eyebrow removed** from
  the grocery header. In their place: a **source chip** under the title that says
  exactly which list is loaded — **"Coach plan · this week"** (teal, the default
  plan-built list), **"Your library · custom"** (purple, a list from Saved carts),
  or **"Recipe list"** (amber, sent from a recipe) — plus the list's name.
- **`Lists` is now a first-class tab** in the eat-section rail (Day · Grocery ·
  Lists · Recipes — `BSNutritionTopTabs` is 4-up): the grocery-list library
  (Saved carts) opens from any eat view, and the library page itself renders the
  rail (active = Lists) so navigation reads the same everywhere. Recipes already
  had its tab.
- **Small ＋ box** (squared, spine) top-right of the grocery header opens the
  Build-a-list page for a new custom grocery list; the library's "＋ New grocery
  list" CTA is squared/clipped to match.

### 2026-06-12 — Milestone Shape points · goals tabs live-wired · habits demo lock + more demo habits
- **Migration `2026-06-12-goal-milestone-points.sql`** (**run on Supabase**):
  `award_my_goal_milestones()` — SECURITY INVOKER, self-scoped. Reads the Overall
  goal (user_goals client_goals) + latest `client_weigh_ins` row, computes the
  25/50/75/goal thresholds (cut or build), and credits **+50/+75/+100/+200 pts**
  into `score_ledger` (category other, source_kind `goal_milestone`, deterministic
  md5-uuid source_id → the existing dedupe index makes it idempotent). Returns
  only newly credited milestones.
- **Client wiring**: `window.ShapeGoalAwards.check` (shapeBackend) runs after every
  weigh-in log AND on Goals-page open (catch-up) — each new credit toasts
  "+N pts · {milestone}" and invalidates the metrics cache.
- **Goals Training/Nutrition tabs wired to the real account** (demo stays the
  fallback, per request): Training hero/stats/lifts/milestones derive from
  `ShapeProgress.train` (PRs → done milestones + next target, avg RPE, streak);
  Nutrition milestones use the live weigh-in trajectory (same auto-✓ math as
  Overall). Overall milestones were already live.
- **Home habits card**: demo-gated checkboxes now show a 🔒 (matching the app's
  other gates) and route to the habits page; live accounts keep the working
  check-off. **Demo habit set +5 rows** (vitamins · morning sunlight · journal ·
  no smoking · no added sugar) and the add-sheet suggestion chips expanded
  (10 do / 9 avoid).

### 2026-06-12 — Home: one meals card · live habit check-off (+pts flash, rows leave) · compact goal card above the day
- **All meals of the day are now ONE agenda card** (same chrome as the workout
  card): "{Today/Weekday}'s meals." with each meal sectioned off inside — slot ·
  time eyebrow, tappable title → its preview, macro subline, per-meal **Log → /
  ✓ Logged** pill — plus a logged-count eyebrow and the nutritionist footer.
  `mealCardFor` (one card per meal) is gone; the agenda sorts the meals card by
  the earliest meal time vs the workout.
- **Home habits card check-off is live**: each row's box toggles the habit right
  on the card (stopPropagation — card tap still opens the habits page). Toggle
  flips the selected day in the habit's history, mirrors into tweaks (instant
  re-render) and POSTs the same `/api/client/habits` toggle the habits page uses.
  On completion a **"✓ +N pts → Shape Score" chip flashes** (~2s) and the
  **completed habit leaves the card** (rows = not-done only; "All done — +N pts
  banked" state when everything's checked). Demo habits (signed-out) route to the
  habits page. `_bsEncodeHabits` now window-exposed from the habits module.
- **Featured goal card moved + compacted**: now sits right above the day's
  agenda section (was below habits), with a `compact` mode on `BSMeGoalCard`
  (tighter padding, 16px title, slimmer bar) — Me-page usage unchanged.

### 2026-06-12 — Goals: one Edit per tab (nav Edit removed) · per-tab goal cards · home goal link
- **Goals header**: the nav-bar Edit button is GONE (it duplicated/confused with the
  goal card's Edit); the eyebrow ("Your goal · By …") is compacted (smaller, tighter
  tracking) so it doesn't truncate.
- **Per-tab goal cards** (replacing the single "Primary goal" card): **Overall =
  the primary goal** (profile-synced text, Edit → profile editor — per request
  "overall can be primary goal"); **Training** and **Nutrition** show their own
  headline goals (Edit → the headline sheet). Card is accent-spined per tab.
- **Overall body-comp targets stay editable**: a mono **"Edit targets →"** action
  inside the "Down so far" hero plate opens the old overall sheet
  (title/start/now/target/date/why) — the record the nav Edit used to open.
- **Home → Goals link**: the Me page's featured goal card (`BSMeGoalCard`, now
  squared w/ teal spine — shared, so Me matches) renders on HOME under the habits
  card and opens the full Goals page (goals/progress early-return overlays added
  to `BSClientHome`).

### 2026-06-12 — Home habits → one agenda card · habits page + goals page instrument pass
- **Home HABITS section is now ONE agenda-style plate** (same `BSPlate` chrome as
  the workout/meal cards — green spine, tick, bracket): eyebrow `HABITS · n/m
  done` + `+pts / possible`, serif "Daily habits." title, compact numbered rows
  (DO/AVOID chip · name · status · +pts · ✓ state), footer rule + View →.
  **Tapping anywhere on the card opens the habits page** — check-off now lives
  there (the per-row home checkboxes are display-only state). The old BSSection
  ledger + numbered-row list is gone.
- **Daily habits page instrument pass** (`iosAppBroadsheetHabits.jsx`): the
  Earned-today card is a `BSPlate` (tick + bracket, squared bars), habit rows are
  squared cards w/ a do/avoid accent spine (squared checkbox), empty-state add
  row squared. Add-sheet stays a quiet rounded form by the two-tier rule.
- **Goals page instrument pass** (Overall / Training / Nutrition): all three tab
  heroes are `BSPlate`s (teal/rust/gold — squared sliders + heatmap tiles), stat
  mini-cards are squared tiles w/ per-stat spines (Me-grid recipe), the tab rail
  is the instrument segment (per-tab accent tint + top tick, solid-fill INKON
  dropped), trend/plans/program/plan/why/primary-goal cards squared w/ accent
  spines, Open → buttons squared. Edit/weigh-in sheets stay quiet forms.

### 2026-06-12 — Instrument pass: progress · store · meal preview · live session · calendar (+ polish batch)
- **Design rollout extended to the remaining client pages** (screenshot-driven):
  **Progress hub** (squared KPI tiles + section cards w/ teal spines, instrument
  segment tab rail w/ top tick, squared per-series trend chips), **Shape Store**
  (balance hero = clipped dark plate w/ accent spine; category/“Within balance”
  pills = squared spine chips), **Meal preview** + recipe macro bar (clipped
  hero-photo plate, plated macro stats, squared split bar/cards, clipped Log-now),
  **Live session player** (clipped rest plate, squared set inputs/checks, clipped
  Start/Next CTAs, queue current-row spine, squared review chips), **Calendar
  month** (squared day cells w/ selected top tick, squared dots/legend; event-sheet
  stat plates carry the event accent; sheet CTAs squared/clipped), **Home workout
  preview** (squared action chips, clipped Begin-session, coach-note spine;
  `BSSaveButton` squared app-wide).
- **Live-session starting sets default to 3 for EVERY move** (duration/cardio
  segments included — was 1; authored “N × reps” schemes still win).
- **Terrain profile**: “In training” status bubble removed entirely; the climb’s
  current-level label reads just the tier name (was “Tempo · now”).
- **Notifications page emoji icon tiles removed** (#1255) — rows carry a 3px
  accent spine instead; `_bsNotifStyle` returns just the accent color. Same PR:
  profile tab rail fits one line, Cards ▾ trigger restyled to the accent chip,
  status-chip dot dropped (chip then fully removed in this batch).

### 2026-06-11 — Instrument design run (home + dock + radio) · day-log → meal cards · store math
- **Instrument plate look** (boxy · futuristic · less analog, per request) shipped
  across: the home **up-next cards** (`AgendaCard` — clipped top-right corner via
  two stacked clip-path layers, 3px accent spine, pulsing status tick, corner
  bracket, squared buttons), the **weekly-totals tiles**, the **day/habit tag
  badges** (angular, accent left edge) + habit checkbox, the section ledger rules
  (2px ink → accent gradient fade), the **THIS WEEK strip** (angular day tiles,
  active = accent plate w/ top tick, Month-view chip), the **tab bar** (instrument
  dock: gradient hairline + gliding glow tick above the active tab, active tab on
  a clipped plate, inactive = bare glyphs, squared badge), and the **radio
  now-playing bar** (frame-layer clipped plate + spine; fx intact). A full
  design-system rollout (`BSPlate` + two-tier rule) is **parked in Next up**.
- **Home Day Log + quick-confirm sheet REMOVED** (by request): every meal of the
  selected day now renders as its own agenda card (same anatomy as the workout
  card — slot+time eyebrow, serif title, macros, byline, Log now → marks that
  meal via the logger callback), time-sorted with the workout card. Live =
  assigned plan (`bsHomeLiveWeek.mealsByIdx`); demo only with no plan. Habits
  stays. `HOME_LUNCH` + day-log plumbing deleted (−360 lines). Preview banner in
  demo mode also removed.
- **Score page Rewards tab live-wired**: featured rows from the shared
  `BS_STORE_PRODUCTS` catalogue (module scope; ids match the server's
  `store-catalogue.ts`) with real-balance affordability ("✓ Redeemable" / "N to
  go"), tap → the Shape Store (the one redemption flow).
- **Annual membership credit math fixed**: a Shape year is $5/mo × 12 = **$60**,
  not $200 → retail 60 / **1,200 pts** in all three catalogues (server + mobile +
  website). The mobile retail→cost derivation (20 pts = $1) now runs ONCE at
  module scope — the Store page used to mutate the shared list on mount, so the
  Rewards tab disagreed until the Store was opened.
- **Theme contrast guards** (Black-paper unreadable on phone): `makePalette`
  ignores a saved ink override that can't read on the chosen paper (contrast < 3)
  and flips the mono black/white accents to the readable side (contrast < 1.6).
- **War Room**: North Star / mission panel restored to the default Status view
  (it had moved to the Architecture tab in the split). "— for $5/month." removed
  from the paywall intro + index meta description. Marketplace got the standard
  masthead band; live-session sets default to 3 for schemeless strength moves
  (duration lines stay 1) with a **＋ Add set** button mid-workout.

### 2026-06-11 — One data layer: shared client-metrics cache (no more dueling endpoints)
- **`cachedClientJson(path)`** in `shapeBackend.js`: the 5 client rollup
  endpoints — `/api/client/analytics · progress · train · nutrition · plan` —
  now share **one in-flight promise + cached RAW response per endpoint**
  (60s TTL, uid-scoped keys so account switches never see stale data). Callers
  keep their own transforms (`ok`/`has_data` filters) on top, so every existing
  call site works unchanged: `ShapeAnalytics.get/getProgress`, all four
  `ShapeProgress.*`, and `ShapePlan.get` (Home + Train + Eat + Goal previously
  fetched the plan 4×) all read through the cache.
- **The ticker and the Progress hub now literally consume the same response** —
  the audit's "RHR/sleep can differ between screens" race is gone, and the
  duplicate per-surface fetch storm is collapsed to one request per endpoint
  per minute.
- **Invalidation**: weigh-in log, check-in log, workout-session save, and
  sign-out clear the cache (`window.ShapeMetrics.invalidate()` exposed for
  future writes). War Room gap closed.

### 2026-06-11 — War Room de-cluttered: 4 top-level views + collapsible checklist
- **`/warroom` is now tabbed** (`WarRoomClient.tsx` only — data untouched):
  **Status** (stat row · P1 queue · live services · next steps · config) ·
  **Checklist** (sections are collapsible accordions with per-section `n/m`
  progress, ✓-green when complete) · **Architecture** (North Star · flow map ·
  diagram) · **API routes** (the browsable/probeable list). The stat cards +
  view tabs stay pinned on every view — no more one endless scroll.

### 2026-06-11 — Home tab wired to the real assigned plan (day log · dots · up-next)
- **New `bsHomeLiveWeek(plan, t)`**: builds the home week from the REAL assigned
  plan (`/api/client/plan` — the same source Train + Eat read). Workouts slot by
  `scheduledDate` (Train-deck rules), meal-plan days by `dow`; produces per-day
  day-log rows, week-strip dot colors, the up-next workout model
  (`{title, sub, detail:{moves, meta, note}}` — same shape the card/preview
  already consume), and a per-day lunch record in the `BSMealPreview` shape.
- **Wiring (live wins, demo only when NO plan exists):** `dayLog`,
  the week-strip `dots`, `selWorkout` (up-next workout card + preview — falls
  to the "Active recovery" card on uncovered days), and `selLunch` (meal card
  hides on live days with no assigned meal — `mealCard` now null-guarded).
  Habits, the score chip, the ticker, and the coach feed were already live.
  Dead `todayWorkout` const removed.
- **Assignments now complete the loop end-to-end**: coach assigns from the
  catalogue → the client's HOME day log + week dots + up-next cards show it,
  same as Train/Eat. Calendar events remain demo (tracked in War Room).

### 2026-06-11 — De-duplication pass: coach Profile⇄Analysis merged + one Progress home
- **Coach client profile is now 2 tabs (Profile / Manage).** The Analysis tab's
  KPI grid duplicated the Profile tab's cards, so the tab is gone; its unique
  pieces — the 30-day summary line + trendline chart — folded into Profile as an
  "ANALYSIS · LAST 30 DAYS · The read" section (between Macros/Body and Recent
  sessions). Same data, one tab. (`BSProClientFullProfilePage`; the dead
  `analysisView`/`aKpis` block removed.)
- **Me → Stats no longer embeds a second copy of the Progress hub.** It keeps
  the compact `BSMeKpis` grid (now tappable → Progress via the existing
  `onOpenProgress`) + a "Full progress & trends →" link card. The 3-tab
  `BSClientProgress` renders ONLY on the Progress page now — no more two
  instances racing the same fetches.
- **Goal page Overall slimmed to goal-framing.** The weight trend chart (the
  most-duplicated visual in the app) and the consistency heatmap moved out —
  the Trend section is now a compact row (latest weight + so-far + log count,
  keeps the **Log weigh-in** action) that links through to Progress
  (`onOpenProgress` threaded from both Me containers: Goal closes → Progress
  opens). Kept: goal hero card, 4-up goal stats, milestones, Your plans, This
  week targets, Your why. Dead `consist` loader removed.
- **Website parity (same pass, follow-up PR):** `coachClientDetail.jsx` — the
  Analysis tab was FULLY redundant on the web (its 6-up grid + trendline both
  duplicated Overview's own KPI grid + weight chart), so the tab bar is gone
  and the page is single-view (`?v=20260611` added on TrainerClient.html +
  NutritionistClient.html, which had no cache tag). `ClientGoal.html` Overall —
  same treatment as mobile: trend chart → compact row (latest weight + so-far +
  log count, keeps Log weigh-in) linking to `ClientProgress.html`; consistency
  heatmap removed; dead `TrendChart`/`consist` code deleted.

### 2026-06-11 — Assign to client: coach catalogue plans → the client's Train/Eat
- **The missing middle of the core loop** (flagged in the flow review): a coach
  could only sell a plan (marketplace) or hand-tune a client (Adjust) — there
  was no "put this client on my saved program." Now there is, with **no
  migration**: assignments write the SAME tables the client's `/api/client/plan`
  already reads — `client_workouts` (extended the existing direct-Supabase
  `assignClientWorkout` with `scheduled_date`) and `client_meal_plans` (the
  existing `POST /api/nutritionist/meal-plan`, which archives the prior menu).
- **New `BSProAssignPage`** (pros app, role-accented): entered from **(a)** an
  **ASSIGN** pill on every Plans-tab library row (trainer Plans/Workouts/
  Programs + nutritionist Plans/Programs/Diet — catalogue rows now carry
  `detail` through) or **(b)** the client profile's **Manage tab → "Assign from
  your catalogue"** card. Whichever half is missing gets an inline picker:
  saved `coach_plans` of the right kind, or the coach's REAL linked clients
  (`/api/trainer|nutritionist/clients` — now accepts **Bearer** auth too, was
  cookie-only, so the native coach app works).
- **Outline → plan conversion** (`bsAssign*` parsers): a weekday split
  ("Mon — Upper (push)" × 3+) schedules one titled workout per day across N
  weeks (rest lines skipped); an exercise outline ("Secondary compound · 4×8")
  becomes one weekly session with parsed sets/reps; meal-plan blocks
  ("Lunch — bowl · 600 kcal") become a 7-day menu with slot/kcal + day targets
  from the plan's authored calories. Trainer flow has a start-day picker +
  weeks stepper (defaults from the plan's "N weeks"); nutritionist replaces
  this week's menu. On assign the client gets a 1:1 note
  (`metadata.kind:'plan_assigned'`) — demo clients show "assigns once linked".
- `shapeBackend.js`: **`window.ShapeAssign`** `{ clients, workout, mealPlan }`.

### 2026-06-11 — Dependabot (monthly grouped minor/patch) + API security audit clean
- **`.github/dependabot.yml`**: monthly **grouped** version updates for root npm,
  mobile-app npm, and github-actions — **minor/patch only** (majors are deliberate
  projects; alerts still fire). Dependabot PRs run through the CI gate; mobile-dep
  bumps will fail the `public/m` sync check until republished (by design — handle
  in session, don't auto-merge). *Manual:* enable **Dependabot security updates**
  in GitHub Settings → Advanced Security (alerts are on by default for public
  repos). Note: the bluetooth-le patch-package patch must be regenerated if that
  package is ever bumped.
- **Full API security audit (all 99 routes): zero vulnerabilities.** Verified:
  proxy membership gate (28 routes), per-route auth + RLS scoping (41), the 18
  service-role routes all webhook-gated or auth-checked first, 3 webhooks verify
  signatures, 14 public-by-design routes leak nothing. No IDOR on any dynamic-ID
  route. Secrets scan clean — only the by-design `sb_publishable_` key is
  committed; no service-role/Stripe/webhook secret values in the repo.

### 2026-06-11 — Live heart-rate monitor (Bluetooth LE) + Radio HR-sync wired real
- **New `mobile-app/src/services/hrm.js`** (`window.ShapeHRM`): connects to any
  standard Bluetooth Heart Rate profile device (service 0x180D — Polar/Garmin/
  Wahoo straps, watches in broadcast mode) via `@capacitor-community/bluetooth-le`
  (^7.3.2, matches Capacitor 7). One codepath covers the native build AND Web
  Bluetooth (Chrome desktop/Android — testable today); readings broadcast as
  `shape:hrm` window events.
- **Radio "Heart-rate sync" card now uses real data**: Connect monitor opens the
  system device picker when Bluetooth is available; the YOU number shows the live
  reading ("You · live" teal label) and the free/matching/in-sync stages compute
  from the real delta. Falls back to the existing demo simulation when Bluetooth
  is absent (iOS WebView pre-native-build, Safari) or the picker is cancelled —
  demo easing never runs over a live reading.
- **Native prep done**: Android manifest (BLUETOOTH_SCAN neverForLocation +
  CONNECT, legacy pair ≤ API 30, bluetooth_le feature optional) + iOS
  `NSBluetoothAlwaysUsageDescription`. Activates on the native build via
  `npx cap sync` (same pattern as push notifications).
- **Song BPM remains authored/demo** — real BPM is blocked until Shape Radio
  streams audio we control (compute at ingest then; Spotify's tempo API is
  deprecated for new apps). Tracked in War Room with the HRM activation steps.

### 2026-06-11 — CI gate on main: typecheck + builds + public/m sync check
- New **`.github/workflows/ci.yml`** runs on every PR into main (+ pushes to
  main/staging): **Web** (root `npm ci` → `tsc --noEmit` → `next build`) and
  **Mobile** (`mobile-app npm ci` → `VITE_BASE=/m/` build → **`diff` the fresh
  dist against the committed `public/m`** — fails with republish instructions
  when the mobile source was edited without copying the bundle, a recurring
  break-main mistake). All four checks verified green at current HEAD before
  shipping. Merge discipline updated in "How we work": open PR → **wait for CI
  green** → **review the diff** (standard pre-merge pass for non-trivial changes:
  logic bugs, missed `?v=` bumps, theme-token violations, shared-component blast
  radius) → squash-merge. *Manual (optional, GitHub Settings → Branches):* add a
  protection rule on `main` requiring the two checks, which makes the gate hard
  even for manual merges.

### 2026-06-11 — Test branch: long-lived `staging` → stable Vercel preview URL
- Created the **`staging`** branch (from `main` @ 831ca84). Vercel preview
  deployments were already enabled for the project, so no config was needed —
  every push to `staging` now auto-builds at the permanent URL
  **shape-app-git-staging-cperry8800-droids-projects.vercel.app** without touching
  production. Workflow + caveats documented in "How we work" above (shared
  production Supabase DB; treat `staging` as a force-pushable scratch pointer;
  main merges still go through PRs).

### 2026-06-09 — Security: clear remaining transitive dep advisories (npm overrides)
- Pinned the patched same-major versions of the transitive moderate-severity
  deps via `overrides` (no breaking bumps): root → `postcss ^8.5.15`,
  `ws ^8.21.0`, `qs ^6.15.2`; mobile-app → `ws ^8.21.0`, `qs ^6.15.2`.
- Result: **both packages now report 0 vulnerabilities** (`npm audit --omit=dev`).
  Smoke-tested: root `tsc --noEmit` + `next build` clean, mobile `npm run build`
  clean. No source changed (deps only); `public/m` bundle unchanged.
- **RLS confirmed fully on**: all 66 public tables have RLS enabled AND ≥1 policy
  (0 tables RLS-off, 0 deny-all). Clean bill of health.
- *Still manual (no MCP tool / Pro-plan dashboard toggle):* enable **Leaked
  password protection** at Auth → Providers → Email (HaveIBeenPwned check).

### 2026-06-09 — Security: Next.js 16.2.3 → 16.2.9 (patch bump, smoke-tested)
- Resolves the **high-severity** Next.js advisories (middleware/proxy bypass,
  cache poisoning, SSRF on WS upgrades, image-API DoS, RSC XSS, …) — relevant
  because the membership paywall is enforced in the proxy/middleware layer.
- Same-major **patch** bump (not the 16.x major jump), so low risk. Smoke test:
  `tsc --noEmit` clean and `next build` succeeds on BOTH 16.2.3 (baseline) and
  16.2.9 — identical route output, proxy/middleware compiles. After the bump the
  only remaining prod-dep advisories are moderate transitive (ws/qs/postcss).
- Pinned exact (`"next": "16.2.9"`) to match the repo's existing style; lockfile
  changes scoped to `next` + its `@next/*` sub-packages.

### 2026-06-09 — Fix: restored missing RLS policies (DMs + engagement were deny-all)
- Supabase security advisors flagged `messages`, `conversation_participants`,
  `community_likes`, `community_comments` as **RLS enabled but 0 policies** —
  deny-all for normal roles. This was silently breaking real 1:1 DM sends/reads
  and the like/comment engagement writes (the optimistic UI showed them; the DB
  insert was denied). `conversations` was also down to 1 of its 3 policies
  (missing insert + update).
- **Migration `2026-06-09-restore-missing-rls-policies.sql`** (**applied via MCP +
  in repo**): recreates the missing policies verbatim from their originals
  (`2026-05-02-conversations-messages.sql`, `2026-05-02-community-feed.sql`).
  Deliberately surgical — does NOT touch `community_posts` (preserves the
  2026-06-09 'profile' visibility read policy) and redefines no functions.
  Verified after apply: messages 2, conversation_participants 2, conversations 3,
  community_likes 3, community_comments 3 — and **zero** public tables remain in
  the RLS-on/no-policy (deny-all) state.

### 2026-06-09 — Profile Music tab: personal playlist library (public/share) — Spotify & Apple Music
- **Migration `2026-06-09-member-playlists.sql`** (**run on Supabase**): `member_playlists`
  table (owner-scoped; provider spotify|apple|other, url, cover, track_count, is_public,
  saved_from) + RLS (public rows readable by anyone, owner full control) + SECURITY DEFINER
  `get_member_playlists(p_user_id)` (own → all; else only public, gated on profile visibility).
- **`ShapePlaylists`** backend (`mine`/`listFor`/`add`/`update`/`remove`/`parseUrl`): paste a
  Spotify or Apple Music playlist link, name it, mark public/private. `parseUrl` classifies
  the provider.
- **New "Music" tab** on both profiles (member Terrain + coach Signal, via `BSLivingTabs`):
  `BSProfilePlaylists`. **Own profile** = "Your library" — add (`BSAddPlaylistSheet`),
  per-row Public/Private toggle, ✉ Send (DM the playlist to a member via the generalized
  send sheet — `kind:'shared_playlist'`), ↗ share, × remove. **Others' profile** = their
  public playlists, each with ▶ Open (Spotify/Apple) + ＋ Save-to-my-library (copies the row,
  `saved_from`). Provider-colored tiles (Spotify green / Apple red).

### 2026-06-09 — Post & channel engagement: like · comment · send · share · repost (app + website)
- **No migration** — `community_likes`/`community_comments` (+ RLS gated on
  `can_view_community_post`) existed since 2026-05-02; this wires them everywhere.
- **`BSPostActions`** under every profile activity card (member Terrain + coach
  Signal): ♥ live like toggle, ↳ comments bottom-sheet (list + composer),
  **✉ Send** (member picker → real 1:1 DM with `shared_post` metadata), ↗ system
  share (clipboard fallback), **⇄ Repost** (new public post quoting the original
  via `metrics.repostOf`). Engagement fields plumbed through `bsMapActivityPosts`
  + `communityPostFromRow` (which now also maps `repostOf`).
- **Chat feed**: bubble posts gained ✉ ↗ ⇄ next to the existing live ♥/↳; the
  Strava-style **activity cards** now persist cheers as real likes (seeded, no
  double count), persist comments with the CORRECT post id (fixed: the card key's
  `post-` prefix was being sent as the id, so comments never landed), and carry
  ✉ ↗ ⇄. **VERIFIED badge removed** from activity cards; the action row is
  uniform 27px pills.
- **Channels shareable**: every channel row has ✉ (DM the channel — the message
  carries `metadata.channel`, rendering as a tappable "# name · Open →" card in
  the recipient's thread that deep-links into the channel) and ↗ share. The send
  sheet is generalized for channel payloads; both DM thread mappers map
  `sharedChannel`.
- **Website** (`dashboardCommunity.jsx`): likes + replies now PERSIST for live
  posts (direct `community_likes`/`community_comments` writes), and the action
  row is complete — ✉ SEND (member picker → `get_or_create_member_conversation`
  → `messages` insert), ↗ SHARE, ⇄ REPOST (`/api/community/feed`). Demo cards
  self-explain. (Site has no real-channels UI — a shared channel shows as text
  in the site widget, the tappable card in the app.)

### 2026-06-09 — Usernames: every account gets a Shape handle (@username)
- **Migration `2026-06-09-usernames.sql`** (**run on Supabase**): `profiles.username`
  (unique, case-insensitive) + RPCs — `is_username_available` (anon, signup
  typeahead), `set_my_username` (validates `^[a-z0-9][a-z0-9._]{2,19}$`),
  `get_email_for_username` (anon — lets the login form accept either; note:
  username→email is enumerable by design, standard trade-off). Also recreates
  **`search_shape_people`** (matches usernames, prefix-ranked) and
  **`get_public_profile`** (returns `username` as a new LAST column).
- **Login accepts email OR username** — mobile (`BSLogin`: "Email or username"
  label, type/text + autocomplete swap) and website (`login.jsx`): a value with
  no `@` (or a leading `@handle`) resolves via the RPC first; friendly "no
  account with that username" error.
- **Signup picks a username** (client + coach roles share the mobile screen):
  lowercase-sanitized field with **debounced live availability** ("@you is
  yours" / taken), required before submit. Rides in `user_metadata.username`
  and is claimed via `set_my_username` — immediately when a session exists,
  else **on first (confirmed) login** (`ensureUsernameClaimed` in signIn +
  getCurrentSession). Website `signup.jsx` gains the same `UsernameField` on
  the client + pro personal steps; coach applications carry `details.username`
  (note: the website client signup remains an application stub — it collects
  but doesn't create the auth account; real accounts come from the app).
- **Handle display prefers the real username**: Settings identity seed and the
  Terrain/Signal profile `@handle` read `profile.username` / `get_public_profile
  .username` first (saved client_identity handle still overrides own card).
- `ShapeAuth.checkUsername` / `claimUsername` exposed; `?v=20260609` stamps on
  `login.jsx` + `signup.jsx` script tags.

### 2026-06-09 — Search v3: beyond people (channels · recipes · workouts · coach plans) + chat-script cache stamp
- **Universal search now matches more than people** (All filter only; Members/
  Coaches chips stay people-only): **Channels** (live `ShapeChannels.list`,
  tap → opens the channel thread directly via a `channel` payload on
  `shape:openConversation` + a new deep-link branch in the chat `openRequest`
  effect), **Recipes** (`SHAPE_KITCHEN_RECIPES`, tap → the kitchen recipe detail
  in-place), **Workouts** (`BS_CLIENT_WORKOUTS`, tap → the workout preview;
  Start hands off to `shape:startWorkout`), and **Coach plans**
  (`ShapeMarketPlans.list`, tap → the coach's Signal profile). Mono glyph tiles
  (# ◇ ▣ ✦), max 4 rows per section; "no results" only when every section is empty.
- **Website chat cache fix**: ~82 pages loaded `chatWidget.jsx` /
  `clientChatThreads.jsx` / `globalChatButton.js` with **no `?v=` tag**, so prior
  copy changes (e.g. Nora's "Shape's Concierge" line) stuck on the browser-cached
  version. Every reference now carries `?v=20260609` (newdesign + root marketing
  pages) — bump these on future chat-script edits.

### 2026-06-09 — Search v2: handles/goals, inline Follow+Message, people-you-may-know, coached-by link
- **Migration `2026-06-09-universal-search.sql` updated** (idempotent — **re-run on
  Supabase**): `search_shape_people` now also matches **@handle** (leading `@`
  stripped) and **bio + goal keywords** (skipped for private-visibility profiles).
- **Inline row actions** (`BSSearchFollowBtn`/`BSSearchMsgBtn`): every real-account
  result row carries a **Follow / Requested / Following** pill (live `ShapeFollows`
  state + toggle) and a **✉ Message** button — creates/finds the real 1:1
  (`get_or_create_member_conversation`) and jumps straight to the thread via a new
  **`shape:openConversation`** event (handled in the client shell + both coach
  shells → `chatRequest.conversationId`). Demo people keep the plain chevron.
- **"People you may know"** — the empty state's suggestions now come from the
  follow graph (`get_follow_suggestions`: mutuals + follows-you, avatar-enriched),
  with "N mutual / Follows you" sublines; falls back to "On Shape" (any accounts)
  then the demo cast.
- **Recents = recently *viewed***: `BSPublicProfile` records every non-self profile
  view (from chat, feed, follows, search) into `shape.recentSearch`; the section is
  now labeled "Recent" and live-syncs via a `shape:recentSearch` event.
- **"Coached by" chip → live link** (member Terrain hero): tapping the coach opens
  their **Signal public profile** — resolved to the coach's real account when
  possible (new `ShapeCoachLookup.ownerOf` provider→owner lookup), derived profile
  otherwise. Also fixed a dormant bug: the live-coach capture treated the
  `{stored,data}` thread response as an array, so the real coach name never
  replaced the demo "Maya Okafor".

### 2026-06-09 — Universal search: find anyone on Shape (⌕ in every header)
- **Migration `2026-06-09-universal-search.sql`** (**run on Supabase**): SECURITY
  DEFINER `search_shape_people(p_q, p_limit)` — name search over every `profiles`
  row, returning role (client/trainer/nutritionist), profile photo
  (`user_goals('client_identity').photo`, withheld for private-visibility
  accounts), and all-time points (→ tier color). Prefix matches rank first.
- **`BSSearchCorner`** (monochrome ⌕, dispatches `shape:openSearch`) now sits
  **left of the avatar** in every header: the 5 client tab headers (via new
  `BSHeaderTools`), the chat masthead, the Terrain/Signal me-mastheads,
  `BSMeCorner` sub-pages, and both coach Today headers. Both coach shells +
  `BSClientAppInner` listen for the event and overlay the search screen.
- **`BSUniversalSearch`** (client module, window-exposed for the pros bundle):
  serif "Find anyone." screen with an autofocused underline input, **debounced
  live typeahead** (`ShapeSearch.people` → the RPC; falls back to `search_members`
  pre-migration, demo cast when signed out), **All / Members / Coaches** filter
  chips, **recent searches** (localStorage `shape.recentSearch`, cap 8, Clear),
  an **"On Shape" suggested list** on the empty state, and a no-results state
  that deep-links to the Marketplace. Rows = tier-colored facet avatar + role
  eyebrow + name; tap → the person's living public profile (Terrain/Signal),
  back returns to the results.

### 2026-06-09 — Tighter "Vol. 1 · No. 1" header row (every page)
- The logo + Vol·No masthead row is condensed app-wide: letter-spacing
  `0.22em → 0.12em`, logo↔text gap `8 → 6` (gate screen `10 → 6`). Applied to the
  shared `BSMasthead` + `BSPageHeader` and every custom copy (profile/chat
  mastheads in the client module, the membership gate, both Radio headers).
  Splash/loading/footer Vol·No lines untouched (not page headers).

### 2026-06-09 — Quinn Harper demo headshot wired
- The uploaded demo headshot (`public/Demo account headshot AI.png`) is now
  **`public/demo-avatar.png`** + **`mobile-app/public/demo-avatar.png`** (served at
  `/m/demo-avatar.png`). `bsMyPhoto()`'s signed-out branch returns it directly
  (was a hash-picked Unsplash stock face), so every "you" avatar in the demo/
  preview — headers, Me page, settings, follow sheet — shows Quinn's real photo.
  Signed-in accounts unchanged (own photo, else initials).

### 2026-06-09 — Nora website parity (concierge profile) + demo "you" renamed to Quinn Harper
- **Website Nora now matches mobile** (`chatWidget.jsx`): tapping her avatar in the
  Help tab opens a **staff concierge card** instead of the generic member preview —
  teal "ALWAYS ONLINE · SHAPE'S CONCIERGE" eyebrow, live dot, concierge bio,
  Status/Replies/Escalates stats (no tier/score), a "Helps with / Can't sort it?"
  details card, and no "Full profile →" (she has no member page). Thread copy updated
  to the concierge wording in `clientChatThreads.jsx` **and** the `globalChatButton.js`
  fallback (was "Shape Support"). `?v=` bumps on `MemberProfile.html` +
  `index-explorations.html`.
- **Demo "you" renamed: Alex Rivera → Quinn Harper** (signed-out preview identity
  only — `bsMyName`/profile fallbacks, `@quinn.harper` handle, demo email; the
  stock demo face follows the new name automatically). The "Alex Rivera" demo
  *client* in the coach rosters/calendars is intentionally untouched.

### 2026-06-09 — Nora has a real avatar (mobile + website)
- The uploaded Nora photo (`public/NORA 1.png`, the android-concierge render) is now
  **`public/nora-avatar.png`** (web-safe name) + a copy at
  **`mobile-app/public/nora-avatar.png`** (served at `/m/nora-avatar.png`).
- **Mobile**: nothing to wire — `BS_NORA_AVATAR` already pointed at
  `${BASE_URL}nora-avatar.png`, so her Support-chat bubbles + staff profile light up
  with the photo (was the "N" initial fallback).
- **Website** (`chatWidget.jsx`): `cwDemoFace('Nora')` now returns `/nora-avatar.png`
  instead of a hash-picked Unsplash stock face — covers the Help-tab bubbles, the
  thread row, and the tap-through profile preview. Bumped the two versioned
  `chatWidget.jsx?v=` refs (`MemberProfile.html`, `index-explorations.html`).

### 2026-06-09 — Eat meal-list header: real weekday + "Meal list" kicker
- The Eat tab's meals section header (`BSTrackHeader`) now reads **"Meal list"**
  (was "Tracklist") with the title **"Today's meals" / "{Weekday}'s meals"**
  (e.g. "Tuesday's meals" — was the cryptic "T 18 meals").
- Fixed the stale **`day === 4`** "today" check (left over from when the demo
  hardcoded today) → `day === bsWeekdayIdx()`, matching the Train page's pattern,
  so "Today's meals" follows the real current weekday. The swap-meal coach
  message uses the same label ("· Tuesday" instead of "· T 18").

### 2026-06-09 — Home "Weekly totals" label + lockfile sync
- Home page running-tally section eyebrow renamed **"Week totals" → "Weekly totals"**
  (`iosAppBroadsheetClient.jsx`).
- `mobile-app/package-lock.json` synced with the `@capacitor/browser` +
  `@capacitor/push-notifications` deps declared in `package.json` on 06-08 (lockfile
  had never been regenerated).

### 2026-06-09 — Followers/following lists: tap-through profiles + photos (all profile types)
- **Mobile** (`iosAppBroadsheetClient.jsx`): the followers/following list rows are now
  **live links to each person's public profile** on every profile surface.
  - `BSTerrainProfile` (client Me / member) got a `followProfile` sub-view state +
    early return → `BSPublicProfile`; `BSSignalCoachProfile` (coach) reuses its existing
    `reviewerProfile`. Both pass `onOpenProfile` into `BSFollowBlock`.
  - `BSFollowMini` (Settings identity card): the **Followers / Following counts now open
    the same live `BSFollowListSheet` directly** (full parity with the profile), and
    tapping a person opens their public profile (portaled over `#bs-phone-surface`).
  - `BSFollowListSheet` (shared) batches **profile photos** via
    `ShapeProfiles.getUserAvatars` (demo Unsplash faces for accountless people) and renders
    each row as a button → `onOpenProfile`. Accept/decline kept for the requests kind.
- **Website** (`MemberProfile.html`, + dead-but-consistent `memberProfile.jsx`): the
  followers/following/requests list rows now show **real profile photos**, batched via
  `get_public_profile.avatar` (initials fallback). Rows already deep-linked to
  `MemberProfile.html?u=<userId>`.

### 2026-06-09 — Shape Sets page (mobile) + Train deck follows coach Adjust + Goal plans/targets live + feed proof cards
- **Shape Sets (mobile Radio → editorial "about Shape Radio" page).** New `BSShapeSetsScreen`
  in `iosAppBroadsheetRadio.jsx`, reached from a **"Shape Sets · About →"** row at the top of
  the Radio screen's below-fold panel (`showSets` state → early return). Mirrors the website
  Shape Radio page copy (Club Shape concert series · "Residents who train. Sets that land." ·
  "Your coach picks the soundtrack" + the Maya/Rae/Diego example cards · the social-loop note)
  and sits on the **Club Shape venue background** — copied the website's `radio background
  upscale.jpg` into `mobile-app/public/club-shape-bg.jpg` (served at `/m/club-shape-bg.jpg`),
  fixed + scrimmed under glassy cards. Mobile-only.
- **Train deck follows coach Adjust** (`bsApplyTrainAdjust` in `bsClientWeekDemo.js`): applies
  `client_programs.detail.training` onto the per-day deck — intensity scales loads + shown RPE,
  the weekly split re-themes days + sets coach rest days, the note rides onto the day; the live
  session + preview inherit the scaled moves. A coach focus/intensity chip shows on the Train hero.
- **Goal Overall "Your plans" + "This week targets" wired** (mobile + website): plans from the
  assigned plan + coach detail + program phase; weekly targets (Sessions/Protein days/Sleep/7d
  volume) from the ShapeProgress rollups. Demo fallback when signed-out.
- **Community feed activity "proof cards" wired** (`bsActivityFromPost`): the COMMUNITY feed
  builds Strava-style cards from real workout/run posts (composer workoutStats + sensor stats +
  GPS route) with live tier + avatar; demo cards are the signed-out / no-activity-yet fallback.

### 2026-06-09 — Website goal page ⇄ mobile parity (Overall dashboard ported) + storage unified
- **Mobile redesign ported to the website** (`public/newdesign/ClientGoal.html`). The site
  goal page was a flat goal-card list (Training/Nutrition tabs only); mobile had the richer,
  more motivating **Overall body-comp dashboard**. Brought the web up to match, leading with
  one clear progress story then progressively revealing the rest:
  - **New Overall tab** (first, teal): body-comp **hero** (down-so-far + % there +
    start→now→target line), a **4-up stat grid** (Current / To go / Weekly pace / On track —
    derived from the real weigh-in series), a **weight trend** chart, **Milestones** (real
    trajectory start→25/50/75%→target, auto-✓ as you reach each), the **Driving it · Your
    plans** section, **This week · Targets that move it**, a **consistency heatmap** (live
    `ShapeProgress.train.volumeByDay` when present, demo fallback), and **Your why**.
  - **Training (rust) / Nutrition (gold)** tabs keep the goal cards + score calculator +
    momentum, now tinted to the tab accent. Removed the now-redundant standalone "Log
    weigh-in" CTA on mobile (the Trend-section inline action remains).
  - **Storage unified to `user_goals('client_goals')`** — the same key mobile uses and the
    one `get_client_goals` reads for **coach visibility**. Reads `client_goals` first, falls
    back to the legacy `client` doc, and migrates a legacy flat `goals[]` into Training. So a
    goal set on either surface now shows on both *and* to the client's coaches. No migration.

### 2026-06-09 — Coach Me page is profile-first (parity with client) + consolidated coach settings
- **Coach Me tab = the living Signal profile** (profile-first), mirroring the client's
  Terrain Me page. `BSSignalCoachProfile` gained `meMode` + `onOpenSettings`: a "ME /
  Profile." masthead (logo + Vol·No, edit pencil + settings gear, no back) and the real
  self name (`bsMyName`) / tier (live via the signed-in `userId`). `BSPublicProfile`
  forwards `meMode`/`onOpenSettings`. Both coach shells now render the profile in the Me
  tab instead of the old `BSProMe` hub; a `meMode` bottom-pad clears the tab bar.
- **Consolidated coach settings** (per the chosen option — practice shortcuts live in
  Settings): the gear opens the existing `BSProMe` hub as the settings screen (back →
  profile), which already holds every practice shortcut (Marketplace listing · Public
  profile · Payouts · Availability · Rates · Soundtracks · Radio · Store) + account rows
  (Notifications · Certifications · App tour · Help · Terms · Sign out). Added an
  **Appearance & display** row → the shared `BSSettings` (paper · accent · units · text
  weight), so nothing was lost. `shape:openProSettings` + the chat/home avatar still open
  the settings hub.

### 2026-06-09 — Appearance settings persist per account (survive reload + login) + Steel bolder + 4 papers
- **Appearance tweaks now persist** (`iosAppBroadsheetMain.jsx` `BSApp`, the live root —
  applies to **all** profiles: client/coach/radio). Before, `paperMode/accentKey/texture/
  weight/border/fx/splash…` lived in React state seeded from a static defaults file and
  `setTweak` only posted to the desktop-preview bridge, so every reload/login reset them.
  Now: seed from **localStorage** (`shape.tweaks`) over defaults (no flash-back on reload);
  every change writes localStorage **and** (debounced) to the account via
  **`user_goals('app_tweaks')`**; on login (polled `ShapeAuth` uid) the account's saved
  appearance loads and applies — so it restores on every login, on any device, and an
  account switch loads that account's look. `role` is excluded (derived from the profile).
  *No migration* — reuses `user_goals`. The mobile BSSettings preferences (units, meal-times,
  visibility, nutrition/training prefs) already persisted via `client_settings`/`user_goals`.
  **Website:** functional settings already persist via the same shared tables; the site uses a
  fixed editorial design (no paper themes), so there's no appearance state to sync there.
- **Steel paper reads bolder:** lightened the stock (`#a9aeb4`→`#c2c7cd` + paper2/3) so dark
  ink, deep accents, and tier colors all gain contrast on the metal — uniform fix (also affects
  hardcoded literals + tier hexes) without retargeting ~58 teal literals.
- **4 new papers** in the Appearance picker (client Settings + Tweaks panel) + label map +
  tinted phone bezels: **Sage** (light green), **Forest** (dark green), **Slate** (blue-grey),
  **Plum** (aubergine). 14 papers total.

### 2026-06-09 — Third post visibility ('profile') + settings icon-boxes removed
- **New "Profile" visibility** on the Log-activity composer (both member + coach
  profiles): **Public** (profile + feed) · **Profile** (visible to everyone on your
  profile, but NOT in the community feed) · **Just me** (private).
  - **Migration `2026-06-09-community-profile-visibility.sql`** (**run on Supabase**):
    widens the `community_posts.privacy` CHECK to allow `'profile'`, and updates the
    read RLS policy + `can_view_community_post()` so `'profile'` reads like `'public'`
    (anyone can view → renders on the profile). The feed exclusion is done in code.
  - **Feed queries exclude `profile` + `private`**: mobile `listCommunityPosts` and the
    website `GET /api/community/feed` now `.in('privacy', ['public','community'])`.
  - `privacyToDb` / website `normalizePrivacy` accept `'profile'`; `communityPostFromRow`
    labels it `Profile`. The 3-state toggle in `BSLogActivitySheet` is shared, so it
    applies to every profile type.
- **Settings icon boxes removed** (client `BSSettings` `HubCard`): the rounded-square
  icon chips next to each row are gone — rows are now title + summary + chevron (the
  accent color moved onto the title so "Account actions" stays rust). Removed the now-
  dead `Icon` component. Coach settings (`BSProMe`) already used numbered rows (no boxes).

### 2026-06-09 — Log activity on ALL profiles + visibility toggle + goal-header cleanup
- **Goal page eyebrow:** removed the coach-name suffix (`· Jordan C…` / `· Dr. May…`)
  from the Training / Nutrition goal headers — now just "Training goal" / "Nutrition goal".
- **"Log activity" now on the coach (Signal) profile too**, not just the member
  (Terrain) profile. Extracted shared `bsMapActivityPosts` + a `BSActivityBody`
  component so both profile feeds load the coach/member's real posts and render every
  rich type identically (note · photo · inline video / video+link cards · workout stats).
  The coach's Personal-activities section gained the **＋ Log activity** button + the
  composer; the demo field-notes remain as a fallback tail.
- **Visibility toggle on the composer** (`BSLogActivitySheet`): **Public** (profile +
  community feed) vs **Just me** (profile only — `privacy:'private'`, kept out of the
  shared feed). Defaults to Public.

### 2026-06-09 — Profile "Log activity" composer (Substack-style multi-type publishing)
- The member Terrain profile's **Personal activities** button changed from **+ Photo**
  to **＋ Log activity**, opening a new **`BSLogActivitySheet`** composer (portal into
  `#bs-phone-surface`, tier-accented). Pick a type and publish to your public feed +
  profile:
  - **Note / article** — headline + multi-line body.
  - **Photo** — image upload (community-photos bucket) + caption.
  - **Video** — file upload (`ShapeCoachMedia` → public `coach-media/<uid>/`, video mimes)
    *or* paste a watch link (YouTube/Vimeo). Direct files render inline `<video>`; links
    render a play-card.
  - **Workout** — type chips (Strength/Run/Ride/Conditioning/Mobility) + Duration / Dist·Vol /
    Effort stat fields → a 3-up stat row on the card.
  - **Link** — website/article URL (+ optional title/desc) → a tappable link card (host ↗).
- **Wiring:** each type maps to `ShapeCommunity.createPost` with the rich payload stashed in
  `community_posts.metrics` (`kind`, `video_url`, `link`, `workoutStats`) — **no migration**.
  `communityPostFromRow` now exposes `kind/video/link/workoutStats`; the profile feed loads
  **all** of the author's posts (was photo-only) and renders each type (photo, inline video,
  video/link cards, workout stats, notes). Posting refreshes the feed.

### 2026-06-09 — App-wide paper-theme sweep (all 11 papers read correctly)
- Audited every broadsheet file for colors that don't follow the paper theme
  (`t.INK/PAPER*/RULE/ACCENT`). The app overwhelmingly already adapts; the
  remaining offenders were dark-designed pieces. Fixed:
  - **`BSMeKpis`** (Me → Stats "Your progress" grid): hardcoded cream `#f2ede4`
    for the label, card border/fill, and stat values → cream-on-cream on light
    papers. Now `t.INK`.
  - **`BSFacetAvatar`**: `BG`/`INK` no longer default to fixed dark/cream — they
    fall back to `t.PAPER`/`t.INK`, so header avatars (which don't pass them) get
    the right dot-ring + rank-shadow surface on every paper. (Inner gem window +
    initials were already made theme-aware in the prior commit.)
- **Verified intentional / no change:** the `PAPERS` palette definitions (source
  of truth); the Main auth screens (deliberately on `BSNightSky`), splash, and
  error screen; Tweaks color-picker swatch values; dark overlays *over cover
  photos*; the rust/gold "Find a trainer/nutritionist" bars and other `#fff`-on-
  colored-chip text; the intentional black channel header. Pros / Marketplace /
  Calendar / Habits / Widgets carry no dark-designed literals (all theme tokens).

### 2026-06-09 — Light-paper sweep: radio two-tone logo + Me-page reads on cream
- **Shape Radio wordmark, light papers** (`iosAppBroadsheetRadio.jsx`): baked a
  recolored **`shape-radio-logo-lt.png`** (white parts → ink/black: SHAPE + the
  second play-triangle; teal stays: the play triangle + RADIO) — the two-tone
  treatment from the uploaded `black and teal triangles.png`. New `BSRadioWordmark`
  helper picks the dark (white) or light (recolored) PNG by `t.isLight`; used by the
  radio screen header **and** the prompt header (was a bare white PNG, invisible on a
  light-paper prompt). Vote-button text-shadow dropped on light papers.
- **Me page (Terrain profile) on cream paper** (`iosAppBroadsheetClient.jsx`) — text
  + avatar were disappearing because dark-designed pieces hardcoded cream/black:
  - **`BSFacetAvatar`**: the gem's inner window was a fixed near-black (`#0f0c0a`) with
    `INK` initials → a black blob with invisible initials on light paper. Now on light
    papers the window fills with a **darkened tier tint** + **light initials** (a tier
    jewel that reads on any paper); dark papers keep the original look untouched.
  - **`BSScoreCardDark`** + **`BSMeGoalCard`**: both hardcoded `INK = '#f2ede4'`, so the
    score number/labels and the goal headline were cream-on-cream. Now read `t.INK` +
    a light/dark-aware teal. The rest of the profile already used theme `INK/BG/TEAL`.

### 2026-06-09 — Calendar month view: divider-row day list + cleaner grid + real preview data
- **`iosAppBroadsheetCalendar.jsx`** — three fixes to the month view + its event
  preview sheets (`BSEventSheet` bodies):
  - **Box view removed:** the per-day event list under the month grid is now clean
    **divider rows** (thin accent bar · time/min · kind tag + serif title + sub ·
    chevron, hairline between) instead of bordered `PAPER2` cards.
  - **Grid fits cleanly:** tighter day cells (gap 5→4, smaller number/count, a
    single non-wrapping dot row, `boxSizing:border-box`) and a **teal ring on
    today** so the weeks sit clean without crowding.
  - **Preview data is now real (no more contradictions):** the workout body looks
    up the actual session by title from **`BS_CLIENT_WORKOUTS`** (now imported from
    `bsClientWeekDemo.js`), so a **Z2 run** shows run **segments** + cardio stats
    (DUR/DIST/ZONE/KCAL) — not barbell rows; strength shows real moves + loads +
    RPE. The meal body **parses kcal/protein from the event's own `sub`** and
    derives carbs/fat (internally consistent), draws a **macro-split bar**, and
    lists **"On the plate"** components from the title — so "Yogurt parfait · 380
    kcal" never renders a chicken-bowl ingredient list again. Both bodies modernized
    (rounded cards + a coach's-cue callout); live server events fall back gracefully.

### 2026-06-09 — Coach media: upload photos & videos for plans/programs/workouts
- **Migration `2026-06-09-coach-media.sql`** (**run on Supabase**): public
  **`coach-media`** storage bucket (200 MB; image + video mime types — jpeg/png/webp/
  heic/gif + mp4/quicktime/webm/m4v). Storage RLS: public read (clients view the demo
  media), owner can write/update/delete only their own `<uid>/…` folder. Idempotent.
- **Migration `2026-06-09-coach-sale-plans-detail.sql`** (**run on Supabase**): the
  public sale-plan RPCs **`get_coach_sale_plans`** + **`get_coach_sale_plans_by_user`**
  now also return **`detail jsonb`** (DROP+recreate to widen the return type), so a buyer
  can preview the coach-uploaded media before buying.
- **Coach draft editor** (`BSCoachDraftEditor`, mobile pros app — trainer *and*
  nutritionist plan/program/workout/meal-plan builders): new **MEDIA · PHOTOS & VIDEOS**
  section — `+ UPLOAD` (multi-file `image/*,video/*`) uploads to `coach-media/<uid>/…` via
  `window.ShapeCoachMedia.upload(file)` → `{url,type:'image'|'video',name}`, shown as a
  3-up thumbnail grid (video badge + remove ×). Rides through `onPublish({…, media})` into
  both `publishDraft`s → **`coach_plans.detail.media`**.
- **Client preview**: the coach profile's sale-plan rows render a horizontal media
  thumbnail strip (photo thumbs + a play glyph on videos) on **mobile**
  (`iosAppBroadsheetMarketplace.jsx`, salePlans now carry `detail`) and **website**
  (`livingShared.jsx` `LvServices`, `?v=10`).
- `shapeBackend.js`: `window.ShapeCoachMedia.upload`; `listSalePlans` /
  `listSalePlansByUser` map `detail`.
- War Room: registered under "Marketplace & coach profiles".

### 2026-06-09 — Mobile Me page restructure + Settings merge + dead-code sweep
- **Me tab is PROFILE-FIRST.** Opens as your living **Terrain profile** (standard
  masthead: SHAPE logo + `Vol. 1 · No. 1` + **ME / Profile.**), no back button (root
  tab). Header carries a tappable **goal card** (→ Goal page) above the **Shape Score
  card**; edit pencil → customizer, **gear** → Settings.
- **Stats tab = the full progress page** — embeds `BSClientProgress` (Overall/Training/
  Nutrition) via a new `embedded` mode (no chrome) that **forces a dark palette through
  `BSContext.Provider`** so it reads right on the dark profile even in light app theme.
  A "Your progress" KPI grid (live `ShapeProgress` + demo merge) sits on top.
- **Living Signals + Climb wired live** (self): day streak, bodyweight trajectory +
  delta, weekly momentum, disciplines, key lifts, and the Climb's Shape-Score aspect.
- **Tier unified everywhere** — avatars, profile, score card, climb, Settings read ONE
  client-score source (`_bsUseLiveScore(SHAPE_SCORE_PROFILES.client)` + `bsMyTier()`
  same fallback): live signed-in, **Tempo/1284** in preview. Fixes the Base-vs-Tempo split.
- **Settings is ONE screen** (`BSSettings`): folded the old Me-page hub in (Account ·
  Preferences · Nutrition · Training · Integrations · Notifications · Privacy ·
  Membership & billing · More links · Appearance/Radio/Light-fx/Ticker · About · Account
  actions). Section cards are **divider rows** (no boxes); identity card = the summary.
- **Chat masthead** gained the logo + `Vol. 1 · No. 1` line. Follow-list + Cards
  dropdown scrollbars hidden.
- **Dead-code sweep:** removed **~1,070 unreferenced lines** from
  `iosAppBroadsheetClient.jsx` (`BSMeSettingsHub`, `BSClientProgressLegacy`,
  `BSEditSheet`, `BSFeedActivityCard`, `BSProfilePrivacy`, `BSTerrainContours`,
  `BSTerrainRidge`) — verified zero non-def references repo-wide. Parse + build + tsc clean.

### 2026-06-09 — Live "doing now" activity dot, home re-layout, photos & avatars
- **Live activity dot (persistent).** Migration **`2026-06-09-user-activity.sql`**
  (**run on Supabase**): `user_activity` table (owner-write, authenticated-read,
  realtime, 6h `expires_at` safety) + `get_active_activities()`. `ShapePresence`
  gained `setActivity`/`activityOf`/`myActivity`; the workout player broadcasts
  `'workout'` and the meal logger `'cooking'`. The avatar **corner dot** is now
  decoupled from the online ring: **teal = in a workout, amber = cooking**. The
  workout dot is set on session start and **persists across screen changes / app
  backgrounding**, clearing only when she ends it (✕ End / Finish). Reads on real
  avatars (self header/me, chat messages, profiles); chat thread refreshes live.
  Cooking stays logger-open-scoped (per request).
- **Chat presence rail:** "lifting now" → **"online now"**; more avatars marked
  live (pulsing ring) + a dot legend.
- **Home re-layout.** Removed the **Log/Activity**, **Habits**, and **Score** quick
  chips. The **Day Log** header now shows the selected day's **`+N pts`** (live
  per-date ledger, demo fallback, future days = 0). New **Habits** section directly
  under the Day Log — same numbered row format (DO/AVOID pill, name, done state,
  points), a per-day **check-mark box**, header **`+N pts`** + a **View →** link to
  the full habits page. Me-page Shape Score card leads with **`+N today`**.
- **Day-log detail sheet redesign:** tag-tinted header + the new rounded badge,
  3 rounded metric tiles, tag-tinted note, fully-rounded pill buttons, frosted
  backdrop blur. **Workout items now show an Exercises preview** (numbered moves +
  scheme + load chip from the day's workout).
- **Tag pills modernized** (Day Log + Habits): flat solid blocks → soft tinted,
  fully-rounded badges with colored text + hairline border.
- **Meal preview photos:** `bsMealPhoto(meal)` shows the meal's own `photo`, then a
  coach-uploaded `media` image (coach-media), then an inferred stock food photo
  (halftone fallback) — replacing the halftone placeholder.
- **Find-a-coach bars** (Train/Eat): filled in role color (trainer rust /
  nutritionist gold), compacted, thicker 2.5px lighter border.
- **Facet avatar = photo OR initials, always.** Initials now render underneath the
  photo and a missing/broken image (`onError`) falls back to them — never a blank/
  placeholder gem. Mobile `BSFacetAvatar` + website `LvPortrait` (`livingShared ?v=11`).
- **Website marketplace polish:** marketing face photos on the signed-out directory
  (spotlight + grid), a coach-customizable **cover image** band behind the avatar
  (darkened/tinted; demo covers + real `profile_custom.cover.image`), filter
  dropdowns. Migration **`2026-06-09-coach-sale-plans-detail.sql`** already covers
  the plan-media preview.
- **Real coach accounts resolve on BOTH surfaces.** App already fetched live
  providers + photos (`get_public_profile.avatar`). Website now does too: fetches
  live coaches from `trainers`/`nutritionists`, resolves each real photo via
  `get_public_profile`, merges them ahead of the demo directory (deduped), and links
  real coaches to their live profile (`?u=<owner>`). Marketplace links also pass
  `&avatar=` so derived (demo) coach profiles show the card photo (`marketplace.jsx ?v=5`).
- **Settings:** removed the tier name under the identity avatar.
- **Cards dropdown** ("Show on home"): scrollbar hidden + no longer closes when you
  scroll *inside* it (only on page scroll).

### 2026-06-08 — Store fulfillment: redeemed rewards actually DO something
- **Migration `2026-06-08-store-fulfillment.sql`** (**run on Supabase**): adds fulfillment
  columns to `store_redemptions` (`kind`, `ship_to` jsonb, `fulfilled_at`, `fulfillment_note`),
  a **`store_credits`** dollar-wallet ledger (RLS owner-read; `kind` session|nutrition, signed
  `cents`), and RPCs: `get_my_store_credit` / `get_store_credit_for(uid)`, an extended
  **`redeem_store_item(... p_kind, p_credit_cents, p_credit_kind, p_ship_to)`** (also writes the
  ship-to + funds the wallet for credit items, atomically), **`consume_store_credit(uid,kind,
  session_id,cents)`** (service-role, advisory-locked, idempotent per checkout), and admin
  `admin_list_store_fulfillment` / `admin_mark_store_fulfilled`.
- **Three fulfillment paths**, by item kind (server-authoritative catalogue
  `src/lib/store-catalogue.ts`):
  - **Merch → ships.** Redeeming merch now requires a **shipping address** (422 `needs_shipping`
    → a shipping sheet on mobile, a modal on the website). The address rides on the redemption;
    **ops is emailed** to ship it (Resend, `STORE_OPS_EMAIL` or first admin) + the member gets a
    confirmation.
  - **Credit → auto-applies at coach checkout.** A `$25/$50 session credit` funds a **session**
    wallet; a `$25 nutrition credit` funds a **nutrition** wallet. `/api/stripe/checkout-session`
    reads the wallet and **discounts the charge** (trainer booking ← session, meal plan ←
    nutrition), leaving ≥ $0.50 payable; the webhook **debits the wallet** on a completed payment
    (idempotent — abandoned checkouts don't burn credit). The applied credit shows in the Stripe
    line-item name.
  - **Service → recorded + emailed** (coach follows up).
- **Emails** via the existing Resend wrapper (`src/lib/email.ts`): member reward confirmation
  (code + next steps) on every redeem; ops ship notice for merch. No-ops cleanly without
  `RESEND_API_KEY`.
- **Frontend**: both stores show a **Coach credit wallet** card (session/nutrition $) when funded;
  merch redeem opens a shipping form. `ShapeStore.get` now returns `credit`; `redeem(itemId,
  shipping)`.
- War Room: registered the flows + the two migrations + RESEND/STORE_OPS env in the checklist;
  flipped the "live redemption API" P2 gap to **done**.

### 2026-06-08 — Store redemption is real: points become spendable (mobile + website)
- **Migration `2026-06-08-store-redemptions.sql`** (**run on Supabase**): `store_redemptions`
  table (owner-read RLS) + 3 SECURITY DEFINER RPCs — `get_my_points_balance()` (live balance =
  Σ `score_ledger.delta`), `get_my_redemptions()` (the locker), and **`redeem_store_item(item_id,
  name, cost)`** which **atomically** (per-user `pg_advisory_xact_lock`) checks the balance,
  writes a **negative ledger row** (category `other`, `source_kind 'store_redeem'`) so the spend
  shows on the score page + lowers the balance, and issues a one-time `CODE-XXXXXXXX`. Raises
  `insufficient_points` when short — no double-spend.
- **API `/api/store/redeem`** (GET locker+balance / POST redeem). Auth Bearer-or-cookie; looks up
  the **authoritative cost server-side** from new **`src/lib/store-catalogue.ts`** (never trusts the
  client), gates on membership (`computeMembership` — points earn for all, spend for members/coaches/
  admin), and blocks tier-locked + lead-boost items. Registered in War Room `RAW_ROUTES`.
- **Mobile** (`shapeBackend.js` `ShapeStore = { get, redeem }`): `BSShapeStorePage` now loads the
  **live balance + locker**, every catalogue row is a **tappable Redeem →** (deducts + issues a code,
  shows an inline notice, refreshes the balance + Unlocked codes). Demo values remain the signed-out
  fallback. Each product carries a stable `id` matching the server catalogue.
- **Website** (`store.jsx`): `StorePage` fetches the same endpoint → live hero balance, real Redeem
  buttons (busy state + notice), and the **Your locker** section renders real redemption codes.
  Products carry server item ids via a name→id map.
- Builds on the 20 pts = $1 rate — points are now genuine purchasing power end-to-end.

### 2026-06-08 — Up-next #4: native push/browser plugin prep (code side complete)
- Declared **`@capacitor/push-notifications`** + **`@capacitor/browser`** in
  `mobile-app/package.json` and added a `PushNotifications.presentationOptions`
  (`badge/sound/alert`) block to `capacitor.config.ts` so a `npm i && npx cap sync`
  native build picks them up (registerPush + the system-browser Apple Pay opener already
  feature-detect them). The push pipeline (token register → notifications DB Webhook →
  `/api/push/dispatch` → FCM sender in `@/lib/push`) is otherwise complete.
- **Remaining to activate (external):** (1) set `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` /
  `FCM_PRIVATE_KEY` + `PUSH_WEBHOOK_SECRET` env; (2) Supabase → Database → Webhooks:
  table `notifications`, INSERT → POST `https://theshapecommunity.com/api/push/dispatch`,
  header `x-push-secret: <PUSH_WEBHOOK_SECRET>`; (3) Firebase config (google-services.json /
  GoogleService-Info.plist) + APNs key uploaded to Firebase + the native build with Push
  capability.

### 2026-06-08 — Up-next #3 done: profile sub-data wired to real rollups
- The member **Terrain** profile's living-identity sub-data now reads from the real self
  rollups (demo fallback per field): **climb** (weigh-ins), **personal activities** (logged
  activities), **key lifts** (`/api/client/train` PRs), and now the **disciplines strata** —
  Strength = strength-trend gain (`/api/client/progress`), Endurance = recent training
  volume, Consistency = workout adherence (`/api/client/analytics`), Recovery = sleep.
- Coach **Signal** competency rings stay illustrative by design (they're practice focus,
  not workout/PR data). Removes the P1 "rich profile sub-data" gap from the build queue.

### 2026-06-08 — Sell-a-plan (Up-next #2): buy a coach's published plan
- **Migration `2026-06-08-coach-plans-sale.sql`** (**run on Supabase**): `get_coach_sale_plans(role,id)`
  (a coach's published, priced plans — public read, maps provider row → owner), a `plan_id`
  column on `one_time_purchases`, and `get_my_purchased_plans()` (the buyer's paid plans).
- **Checkout**: `/api/stripe/checkout-session` passes `item.planId` → `metadata.plan_id`;
  the **webhook** stores it on the `one_time_purchases` row. Reuses the existing Stripe
  Connect destination-charge + 15% fee.
- **Mobile**: `ShapeCoachPlans.salePlans / purchased / buy`. The coach profile's Packages
  tab now shows a **"Plans for sale"** section (real `coach_plans`) with a **Buy · $X** button
  → the existing checkout flow (plan_id rides along). Purchased plans auto-merge into the
  client **Library** (`owned`) via `get_my_purchased_plans`.
- Coach already sets price + publishes at plan-create time. Needs **live Stripe** to verify
  the actual charge.
- **Catalogue tabs on the coach profile** (Packages tab): role-aware sub-tabs — trainers
  **Programs / Workouts / Plans**, nutritionists **Meals / Diets / Plans** — populated from
  the coach's published `coach_plans` (categorised by `detail.buildType`, else the kind).
  Priced → **Buy**, otherwise **Listed**. `get_coach_sale_plans` now returns all published
  plans (+ a `category`), not just priced ones.
- **Apple Pay / Google Pay on checkout:** native checkout (the $5/mo membership + coach/plan
  buys) now opens in the **system browser (SFSafariViewController)** via the Capacitor Browser
  plugin so Stripe Checkout can present the **Apple Pay sheet** (the in-app WebView can't).
  Falls back to the WebView when the plugin/native isn't present. Needs `@capacitor/browser`
  + Apple Pay enabled in Stripe to go live.
- *Tracked follow-up (wanted):* a **full in-app Stripe PaymentSheet** — native Apple Pay /
  Google Pay sheet with no browser hop. Needs a Stripe mobile/Capacitor SDK
  (`@capacitor-community/stripe`), a PaymentIntent/SetupIntent + customer ephemeral-key
  endpoint for the $5/mo sub + coach/plan buys, and the native build. Logged in the War Room
  (Platform services · P3).

### 2026-06-08 — War Room: North Star + Up-next P1 queue + build-order gaps
- **North Star panel** (top of `/warroom`): the positioning — Shape as a **coach
  marketplace with a social presence**, fusing the three camps (social fitness · coaching
  software · creator marketplace), the coach-first **wedge**, the **moats**, and a 4-phase
  **cold-start sequence**. Data in `SHAPE_ARCHITECTURE.northStar`.
- **Up next** panel: every **P1** gap across all layers rolled into one ranked queue
  (layer + status), so the single most important build order is glanceable.
- Each layer's **"Still to do"** is now `{task, status, priority}` — sorted P1→P3 with a
  priority chip + `● in progress` / `○ not started`; the diagram bands show `N to do · k×P1`.
- **Flow diagram → company hierarchy**: a root **SHAPE** node branches top→down into the
  sections, each branching into its pieces (org-chart / site-map look); the member-journey
  ribbon sits below as the sequential view.
- **"Next steps to go live"** is now **tabbed by section** (chips with per-area counts) so
  only the active area's items show — short + scannable instead of one 38-item list.

### 2026-06-08 — War Room: "Architecture & flow" map (how Shape works / who it serves)
- New top panel on `/warroom` summarizing the whole product so direction stays organized:
  **personas** (prospect / member / trainer / nutritionist / admin), the **10-step member
  journey** (Discover → Join → Onboard → Find a coach → Daily loop → Shape Score →
  Community → Rewards → Retain, + the parallel coach side), the **6 layers of the stack**
  (Surfaces · The Loop · Coach tools · Social graph · Platform services · Data & infra,
  each with who-it-serves + the pieces), and an **Area × persona matrix** (Train / Eat /
  Score / Coaching / Community / Billing / Profile). Curated static data in
  `SHAPE_ARCHITECTURE` (`src/lib/warroom.ts`) — edit it as the product evolves.

### 2026-06-08 — System push: register device tokens at sign-in (close the wiring gap)
- The push pipeline already existed end-to-end — `push_tokens` table, `/api/push/register`,
  `/api/push/dispatch` (Supabase **Database Webhook** on `notifications` INSERT →
  `sendPushToUser` via FCM in `src/lib/push.ts`), and `mobile-app/src/services/push.js`
  `registerPush()` (Capacitor PushNotifications → `/api/push/register`). The one gap:
  **`registerPush()` was never called**, so no device ever stored a token.
- Wired `registerPush()` into `getCurrentSession()` (fires on every session resolve,
  alongside `startPresence()`). No-op on web / until the native plugin + build exist.
- **So every in-app notification we already write** (follow / messages / coach content /
  grocery / bookings …) **fans out to a phone's lock-screen + banner once activated** —
  no per-event wiring needed (the webhook is the single chokepoint).
- **Activation checklist** (nothing testable in the web container):
  1. Run the `push_tokens` migration (`2026-05-30-push-tokens.sql`) if not already.
  2. Set env: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (Firebase
     service account) + `PUSH_WEBHOOK_SECRET`.
  3. Supabase → Database → Webhooks: `notifications` · Insert · HTTP POST →
     `https://theshapecommunity.com/api/push/dispatch`, header `x-push-secret: <PUSH_WEBHOOK_SECRET>`.
  4. iOS: upload an APNs key to Firebase (FCM relays to APNs).
  5. Native build: `cd mobile-app && npm i @capacitor/push-notifications && npx cap sync`,
     add `google-services.json` (Android) + `GoogleService-Info.plist` (iOS) + enable the
     Push Notifications capability/entitlement. Users toggle it from iOS/Android settings.

### 2026-06-08 — Follow requests for private profiles (approve to follow) — app + website
- **Migration `2026-06-08-follow-requests.sql`** (**run on Supabase**): adds
  `user_follows.status` ('accepted'|'pending') + `shape_profile_visibility(uid)`. Reworks
  the RPCs: **public profile → Follow is instant** (accepted); **friends/private → Follow
  creates a request** (pending) the owner must accept. `get_follow_stats` now counts only
  accepted + returns **`is_pending`**; `toggle_follow` requests/cancels by privacy;
  `get_follow_list` lists only accepted; new **`list_follow_requests()`** +
  **`respond_follow_request(follower, accept)`**.
- **Mobile** (`BSFollowBlock`, both client Terrain + coach Signal): Follow button is now
  3-state — **Follow / Requested / Following ✓**. On your own profile a **"N requests"**
  button opens a sheet to **Accept / Decline** each pending follower. `ShapeFollows`
  gained `requests()` + `respond()`; cache/`shape:follows` sync extended.
- **Website** (`MemberProfile.html` + `livingDesktop.jsx`): same — Follow/Requested/
  Following on the hero + locked card, an owner **"N requests"** chip → accept/decline
  modal. Applies to **client and coach** profiles.
- **Notifications** (in the same migration): `toggle_follow` notifies the owner —
  `follow_request` ("X requested to follow you") on a private/friends request, or
  `follow` ("X started following you") on a public follow; `respond_follow_request`
  accept notifies the requester (`follow_accept`, "X accepted your follow request").
  Written into the existing `notifications` table from the SECURITY DEFINER RPCs (no app
  change — the existing notifications surface renders them).

### 2026-06-08 — Website public profile = desktop Terrain/Signal (same direction as mobile)
- Dropped the **desktop** living-identity designs (`chat-design-v2/Shape (13).zip` =
  Terrain/member, `(14).zip` = Signal/coach) into `public/newdesign/`: **`livingShared.jsx`**
  (design system), **`livingTerrain.jsx`** / **`livingSignal.jsx`** (signature visuals),
  **`livingDesktop.jsx`** (`DesktopProfile` layout — nav, split hero, signals band,
  2-col grid, feed, footer, locked card).
- **`MemberProfile.html` rebuilt** to render `<DesktopProfile>` wired to real data:
  role → **terrain (member)** / **signal (coach)**; name / tier (member or coach ladder
  colors) / Shape Score / avatar (real photo via `lvPortraitURL` pass-through, else
  initials) / goal / pronouns / privacy are live (`get_public_profile`); rich sub-data
  stays illustrative (same as mobile). **Message** → site chat (`window.__openChat`),
  **Edit profile** on your own, **Follow** → `toggle_follow`, **Coaching** → Marketplace.
- **Followers / Following** counts in the hero are **public + live links** → a people
  sheet (`get_follow_list`); kept visible on the **locked** (private) card too.
- Patched `livingDesktop.jsx` `DesktopProfile`/`DesktopHero`/`DesktopLocked` to accept a
  `person` override + `onMessage`/`onFollow`/`follow`/`coachingHref`; `lvPortraitURL` now
  passes through full `http(s)`/`data:` avatar URLs.
- **`chatWidget.jsx`**: the chat profile-preview "View full profile →" now points **any
  real account (member OR coach)** to `MemberProfile.html?u=` (Signal for coaches);
  accountless coaches still link to Marketplace. The old `memberProfile.jsx` card view is
  superseded (left in place, unreferenced).

### 2026-06-08 — Tag members in posts/workouts on the feed (mobile + website)
- **Mobile** (`BSClientFeed`): the feed composer gained an **@ Tag people** button (next
  to the photo button) → a member-search sheet (`search_members` RPC); tagged people show
  as removable chips and ride on the post. Both text posts and photo/workout posts carry
  the tags. `renderPost` shows a tappable **"with @Name, @Name"** line (opens each member's
  profile). `BSMessageComposer` got `onTag` / `tags` / `onRemoveTag` props + a chip row.
- **Website** (`dashboardCommunity.jsx`): `PostComposer` gained **@ TAG PEOPLE** with an
  inline member search (chips + toggle); `onSubmit` POSTs `metrics.mentions`; `FeedItem`
  renders the **"with @Name"** line (links to each member's profile).
- **Backend** (`shapeBackend.js`): `createCommunityPost({ …, mentions })` stores
  `metrics.mentions` (`[{userId,name}]`, capped 12); `communityPostFromRow` exposes
  `mentions`. No migration (rides in the existing `community_posts.metrics` jsonb).

### 2026-06-08 — Progress hub on app (Overall / Training / Nutrition) — website data → app
- **Mobile `BSClientProgress` rebuilt as a 3-tab hub** mirroring the website's
  Progress / Train / Nutrition pages, reached from **Me → "Progress & PRs"** (and the
  score card). Tabs:
  - **Overall** — KPI grid (bodyweight Δ, body fat, resting HR, sleep), an Insights
    block (adherence + weekly points), a **trend chart** with 9 series pills (weight /
    body fat / strength / resting HR / sleep / HRV / volume / protein / hydration), and
    **personal records**. From `/api/client/progress` + `/api/client/analytics`.
  - **Training** — KPIs (logged, this week, 7d volume, avg RPE), weekly-focus banner,
    14-day volume bars, PRs with Δ%, muscle-group split, recent sessions. From
    `/api/client/train`.
  - **Nutrition** — today vs target macro bars, days-logged/adherent KPIs, weekly
    calorie bars, hydration, most-logged foods. From `/api/client/nutrition`.
- `shapeBackend.js`: `ShapeProgress = { progress, analytics, train, nutrition }`
  (auth'd `getJsonOrDefault` fetches; null on no-data → demo fallback).
- No migration (read-only rollup routes already existed for the website). The old
  Overall-only progress page is retained as `BSClientProgressLegacy` (unreferenced).

### 2026-06-08 — Chat bubbles carry the sender's tier color (mobile + website)
- **Mobile** (`BSChatThread`): DM/channel message bubbles are now tinted to the
  sender's **tier color** — incoming = their tier, mine = my tier — for both members
  and coaches (coaches use the coach ladder colors). Replaced the neutral incoming /
  cream-inverted outgoing bubbles with a tier tint + matching hairline border.
- **Website** (`chatWidget.jsx`): same — bubble background/border derive from
  `cwTierColor` of the sender (live tier when known, else the stable name-hash tier),
  mine from my tier. Text stays `INK` for legibility.

### 2026-06-08 — Follower / following system (mobile + website public profiles)
- **Migration `2026-06-08-user-follows.sql`** (**run on Supabase**): `user_follows`
  directed graph (RLS: public read, self insert/delete) + SECURITY DEFINER RPCs
  `get_follow_stats(uid)` (followers/following counts + the caller's `is_following`),
  `toggle_follow(uid)` (follow/unfollow → fresh counts+state), `get_follow_list(uid,
  kind)` (names list for the followers/following sheet). Idempotent.
- **Mobile** (`shapeBackend.js`): `ShapeFollows = { stats, toggle, list }`. New shared
  **`BSFollowBlock`** (counts → tappable names sheet + Follow/Following toggle) on
  **both** profile types — Terrain (member, under the hero) and Signal (coach, under the
  back row). Counts are public; the button only shows when viewing someone else.
- **Website** (`memberProfile.jsx`): new **`MPFollow`** — Followers/Following counts +
  a Follow/Following toggle (hidden on your own profile), wired to the same RPCs via
  `window.shapeDb.client.rpc`.

### 2026-06-08 — Photo posts on community feed + profile feeds (mobile + website)
- **Migration `2026-06-08-community-photos.sql`** (**run on Supabase**): public
  **`community-photos`** storage bucket (15 MB, image mimes; public read, owner can
  write/update/delete their own `<uid>/…` folder via storage RLS) + a **`photo_url`**
  column on `community_posts`. Idempotent.
- **Shared backend:** `POST /api/community/feed` accepts `photoUrl` → `photo_url`
  (title defaults to "Photo" for photo-only posts). Uploads go **browser → Supabase
  storage** directly on both surfaces (gated by the owner-folder RLS), returning a
  public URL that rides on the post.
- **Mobile** (`shapeBackend.js`): `ShapeCommunity.uploadPhoto(file)` (own folder →
  public URL), `listByAuthor(id,{withPhotoOnly})`, `createPost({…, photoUrl})`;
  `communityPostFromRow` exposes `photo`. **Feed composer** (`BSMessageComposer`)
  gained a 📷 attach button (`onPhoto`) → upload + post; `renderPost` renders the
  image in the bubble. **Profile "Personal activities"** (`BSTerrainProfile`) loads
  the member's photo posts and renders them; your own profile has a **+ Photo**
  button (uploads → public community post → shows on your feed + profile).
- **Website** (`dashboardCommunity.jsx`): `PostComposer` gained **ADD PHOTO** (uploads
  via `window.shapeDb.client.storage`), the composer now actually **POSTs to
  `/api/community/feed`** (was local-only), and `FeedItem` renders the photo. Live
  feed mapper reads `photo_url`.

### 2026-06-08 — Care Team on mobile (coach ↔ co-coach messaging)
- **Mobile coach client profile** (`BSProClientFullProfilePage`, Manage tab) now shows
  a **Care Team** section listing the *other* coach(es) on the same client (trainer ↔
  nutritionist). Each row: facet avatar + name + role eyebrow + **MESSAGE** button.
- **MESSAGE** dispatches `shape:proMessageCoach` `{clientId, counterpartUserId, name,
  role}`; both coach shells listen → `window.ShapeCareTeam.openThread(clientId,
  counterpartUserId)` (POST `/api/me/shared-clients/[id]/thread` →
  `get_or_create_coach_coach_conversation` → conversationId) → jump to **Chat** on that
  exact 1:1 (same `openRequest`/`chatRequest` path as MESSAGE-client).
- `shapeBackend.js`: `window.ShapeCareTeam = { overview, openThread }` —
  `overview(clientId)` reads `/api/clients/[id]/shared-overview` (`careTeam`, filtered to
  `!isMe` members with a `userId`). No migration (RPC + routes already existed; web
  surfaced this — mobile was the gap).

### 2026-06-07 — Web online-visibility toggle + score tier-bar overlap fix
- **Website Me** (`public/newdesign/ClientMe.html`): added a **"Show when I'm
  online"** toggle under Privacy & notifications, wired to
  `window.ShapeWebPresence.setVisible()` — persists to the shared
  `client_settings.onlineVisible` so web + mobile agree, and seeds from the live
  presence state on load. Completes the opt-out loop on the website (mobile already
  had it).
- **Shape Score page** (`public/newdesign/score.jsx`): the teal progress connector
  bar was painting **across** the tier circles. Layered the bar behind the node row
  (`zIndex`) so each opaque tier disc covers the line — it now connects node-to-node
  cleanly. Cache-bust `Score.html` → `score.jsx?v=4`. (Coach ladder uses the same
  component, so the fix covers both Members/Coaches tabs.)

### 2026-06-07 — Public profiles: Terrain (client) + Signal (coach) + privacy
- Member/coach public profiles are now immersive "living identity" pages
  (`iosAppBroadsheetClient.jsx`): **clients → Terrain** (topographic contour hero,
  ridgeline climb, living signals, discipline strata, field-notes) and **coaches →
  Signal** (sigil instrument of discipline rings + cardiac week-trace + portrait
  core, certs/offerings/reviews). Tier is the atmosphere color (client/coach ladder).
  `BSPublicProfile` routes coach→`BSSignalCoachProfile`, member→`BSTerrainProfile`;
  the old card body was removed.
- **Me → Public profile** opens your own profile on every role (client already did;
  coach Me now opens the Signal self-view via the window-exposed `BSPublicProfile`,
  Edit → `shape:openProSettings`).
- **Privacy selector** (Public / Friends / Private) on your own profile, persisted
  to `client_settings.profileVisibility` (same field Settings uses).
- **Migration `2026-06-07-public-profile-friends-visibility.sql`** (**run on
  Supabase**): `get_public_profile` now returns `visibility` + `can_view` and
  enforces all three states — friends = a viewer who shares a member 1:1
  conversation (`conversations.dm_key`) with the owner; details (bio/pronouns/goal/
  link) return only when `can_view`. `is_public` kept for back-compat.
- *Still illustrative:* the rich profile sub-data (the climb, disciplines, lifts,
  certs, offerings, reviews, field-notes) is demo/role-aware — wire to real
  workout/PR/marketplace data later.

### 2026-06-06 — Signal chat redesign (mobile, Chat tab) — shipped in 5 steps
- Ported the **"Signal" v2 chat design** (presence-forward, tier-colored, Strava-style)
  into the live `BSClientFeed` (Chat tab only). The standalone prototypes live in
  **`mobile-app/design/signal-chat/`** (v1) and **`mobile-app/design/signal-chat-v2/`**
  (v2 — the source of truth; de-rotated filenames, runnable host). *Note:* the v1
  upload had clobbered `mobile-app/index.html` (the Vite entry) — restored + the
  prototype moved out of the build path.
- **Step 1 — presence rail:** Feed tab now leads with a live "N lifting now · near you"
  rail of tier-colored avatars (`TRAINING_NOW`, demo data via `bsTierColor`; wire to a
  real presence feed later).
- **Step 2a — 4 tabs:** tab bar is now **Feed · Channels · Friends · Team**. Channels
  promoted to its own top-level tab (lifted out of Team → Channels, all create/search/
  join/pin wiring intact); Team keeps Coaches + Support. Per-tab unread split (channel /
  member-DM / coach-DM).
- **Step 2b — Strava feed blend:** `ActivityCard` restyled to `SigActivity` (tier
  hairline, type chip, location, run splits, 3-up stat row, Verified + cheer/reply pills)
  and **interleaved with the live community posts** in the COMMUNITY feed for everyone
  (blend — posts + role channels stay fully wired; activity data illustrative for now).
- **Step 3 + formatting — Channels cards:** full `SigChannel` look (teal `#` tile, serif
  name + LIVE/private/host badges, members·online meta, blurb line, Open/Join pill).
- **Step 4 — thread:** header avatar matches (tier avatar for people, teal `#` tile for
  channels); bubbles + iMessage composer were already aligned; avatar tap → full
  `BSPublicProfile` (kept over the prototype's peek sheet).
- **Step 5 — rows:** Friends/Team list rows use larger 46px avatars + 2-letter initials.
- Decisions taken: **blend** (don't drop role-channel posting) + **4 tabs**; signature
  data-dependent bits (presence rail, proof cards) are **demo-now / wire-later**.
- **Refinement pass:** all chat avatars are now **rounded squares** (tier-colored;
  coaches carry a role pip on the presence rail). The **header is tab-aware** — a
  "CHAT" eyebrow over a serif title that follows the tab (Community / Channels /
  Friends / Your team) with a square tier avatar top-right. **Thread bubbles** match
  the prototype: incoming bubbles are neutral (tier shown via a name + tier-chip +
  role-chip byline on channels, no per-message avatar), my bubbles are the cream/ink
  inverted bubble, chat-tail corners, and a "Program tweak · applied" clip card when a
  message carries one.

### 2026-06-05 — Coach Shape Score tier ladder (scheme J) — separate from clients
- Coaches now climb a **separate, renamed Shape Score tier ladder** (same 5 rungs /
  thresholds as clients): **Certified · Pro · Elite · Master · Icon**. No new page —
  the shared `BSShapeScorePage` is already role-driven; this is a thin tier-name layer.
- **Colors** diverge from the client ramp so teal (the logo color) **crowns** the coach
  ladder: Certified `#8a93a0` · Pro `#d8a23a` · Elite `#e0463c` (crimson) · Master
  `#8fe3e6` (ice/diamond) · Icon `#34d6c5` (teal). Added these keys to `BS_TIER_COLORS`.
- New `SHAPE_SCORE_TIERS_COACH`, `bsCoachTier()` (client-tier → coach name), and
  `bsIsCoachRole()` (client module, window-exposed). `_bsUseLiveScore` + the coach
  startup score-cache (`_bsHydrateProScore`, pros) translate live tier/next-tier to
  coach names, so the coach **Me card, score page, avatar tint, and public profile**
  read the coach ladder. The score page swaps in `SHAPE_SCORE_TIERS_COACH` when
  `profile.roleLabel` is a coach. Trainer/nutritionist demo profiles updated (Elite ·
  ELT · → Master). Client tiers untouched.

### 2026-06-05 — Website member public profile page + profile-link wiring
- **New `public/newdesign/MemberProfile.html` + `memberProfile.jsx`** — a member's
  public profile on the website, mirroring the coach page anatomy (tier-gradient
  hero, tier chip, 3-up stats [Shape Score / Tier / Role], About + Details rows for
  goal/pronouns/link) with the **private** state (🔒, name+tier only). Reads
  `get_public_profile(?u=<userId>)`; with **no `u`** it loads the signed-in user's
  own profile (owner sees **Edit profile →** to `ClientMe.html`; everyone else gets a
  **Message →** CTA wired to the site chat via `window.__openChat`, falling back to
  the global chat launcher). Coaches also get a **Coaching →** link.
- **Wiring:** the website chat profile preview's **View full profile →** now points
  members with a real account to `MemberProfile.html?u=<userId>` (coaches still link
  to Marketplace; demo people with no `userId` show nothing). **`ClientMe.html`** Me
  page gained a **View public profile** header action → opens your own
  `MemberProfile.html`.
- **Mobile paywall/radio polish:** the paywall **Sign in / Sign out** and **Step
  inside** buttons + the Radio **Continue** button are now smaller, faded pills
  (fit-content, `borderRadius:999`, faded teal/ink fills) instead of full-width bars.

### 2026-06-05 — Me-tab "Public profile" (view/edit) + Nora branding
- **Mobile Me → Public profile:** new shortcut row opens **your own**
  `BSPublicProfile` (`isSelf`) — the coach-style card showing how others see you,
  with **Edit profile →** (fires `shape:openProfile` → Settings) and a "this is
  how others see you · private" hint.
- **Nora branding:**
  - Mobile support bubble label "Nora · Shape AI" → **"Nora · Shape's Assistant"**.
  - **Website Help chat is now Nora** (was "Shape Support"): the thread + greeting
    ("Hi, I'm Nora — Shape's assistant…"), the reply author, and the typing
    indicator all use **Nora** (`clientChatThreads.jsx` + `chatWidget.jsx`).

### 2026-06-05 — Mobile member profile = coach design + every avatar opens it
- Rebuilt **`BSPublicProfile`** (mobile) to share the **coach detail page anatomy**:
  back + serif name (last word tier-italic), a tier-gradient **hero card** (avatar
  + tier chip + role·locale eyebrow + goal headline + stat pills), a **3-up stats
  row** (Shape Score / Tier / Role), a **Message** CTA (+ Coaching for coaches),
  and an **About** section (Their why / Details: goal·pronouns·link). Live
  tier/bio/details + the **🔒 private** state come from `get_public_profile`
  (`is_public`); demo/community people stay derived.
- **Wired the avatar taps that were dead:**
  - Community **demo activity cards** (PR/run/workout) — avatar + name now open
    the profile (this is what non-members tap while browsing the feed).
  - **DM threads** (`BSChatThread`) — the header (1:1) + each incoming message
    avatar/name now open the sender's profile (`onOpenProfile` threaded from
    `BSClientFeed`; channels don't open a "profile" for the channel itself).
  - The real community feed (`renderPost`) was already wired.
- *Note:* DM/demo people have no user id, so their profile is derived (tier from
  name-hash, generic bio) until a real account backs the message — same model as
  the website.
- Expanded the website chat `chatWidget.jsx` profile preview (the card that opens
  when you tap an avatar):
  - **Avatar fixed:** dropped the conic-gradient ring (which read as a "weird"
    dark wedge top-left) for a clean solid tier disc + soft ring.
  - **Full initials:** avatars + the preview now use the fullest name available
    (the 1:1 thread name, not the message's first-name-only) → 2-letter initials.
  - **More info:** a 3-up stat row (Tier / Shape Score pts / Role) plus, for real
    members, **pronouns / goal / link** rows from `get_public_profile`.
  - **Privacy:** when a member set their profile to non-Public, the preview shows
    a **🔒 "keeps their profile private — only their name and tier are shown"**
    notice instead of the bio/details. Backed by a new `is_public` flag.
  - **View full profile →** link for coaches (→ Marketplace). (No member full-
    profile page on the website yet — the preview holds all their public info,
    matching mobile.)
- **Migration `2026-06-05-public-profile-visibility.sql`** (**run on Supabase**):
  drops + recreates `get_public_profile` adding an `is_public boolean` column
  (Public visibility). Body otherwise identical to the 2026-06-04 version.

### 2026-06-05 — Paywall: SHAPE logo + moved before the editorial splash
- **Logo:** added the SHAPE wordmark (`/m/shape-logo.png`, the high-res PNG) to the
  **top-left** of `BSPaywall`; the membership copy now centers in the space below
  it (logo top-left, content vertically centered) so everything still fits.
- **Order:** the membership wall now appears **before** the "Shape Daily" editorial
  splash. New launch flow: **cosmos splash → membership gate → (non-member) paywall
  → Preview → Shape Daily splash → app**; members auto-advance through the gate
  (`stage === 'gate'` + a member-resolved effect) straight to the editorial splash
  and the app, so they never see the paywall.

### 2026-06-05 — Website chat bubbles: avatars + tap-to-profile (mobile parity)
- Ported the mobile chat-bubble avatar/profile features into the website
  `chatWidget.jsx` **message bubbles** (the chat box chrome — tabs/sidebar/header/
  composer — is unchanged):
  - **Tier-colored avatars** (2-letter initials) next to each incoming message,
    using the same tier palette (Base steel / Tempo gold / Form teal / Peak violet
    / Legend rose). Helpers `cwInitials/cwTierColor/cwHashTier/cwTierForPoints`.
  - **Tap an avatar or sender name → a public-profile view** (overlay inside the
    pane, with ← Back): tier-ringed avatar (conic ring + filled disc), `tier · role`
    eyebrow, name, "Member of the Shape community", bio, **Message →**, and
    **Coaching →** (coaches → Marketplace).
  - **Derived vs live:** demo/seeded threads have no real user ids, so tier color
    is a stable name-hash and the bio is generic (mobile's exact fallback). When a
    message carries a real `userId`, it fetches the live card via
    `get_public_profile` (`window.shapeDb.client.rpc`) — so live tiers/bios light
    up once there's an actual signed-in account behind the message.
- *Note:* on group/demo threads, **Message →** just returns to the current thread
  (no 1:1 spin-up for fictional members).

### 2026-06-05 — Website Help tab → real AI support (Nora / OpenAI)
- The website chat widget's **Help** tab now talks to the same **OpenAI-backed
  assistant** the mobile app uses (`POST /api/support/chat`, model Nora). It was
  previously a hard-coded `supportReply()` script. `send()` posts the thread
  history (`{messages:[{role,content}]}`) and renders `data.reply`; the server
  falls back to its rule-based responder if the model is down, and the client
  falls back to the local script on a network error. Other tabs keep their
  simulated peer replies.
- **Support is open to everyone:** the member-gate on the composer (PR for chat
  gating) is now **tab-aware** — it only locks the real-messaging tabs
  (Circle/Trainers/Friends/Community) for non-members; the **Help/Support tab
  composer stays available** so prospects can use AI support (matches the
  endpoint, which is intentionally not membership-gated).

### 2026-06-05 — One website chat bubble (consolidation)
- Standardized on the site-wide **`globalChatButton.js`** as the **single** chat
  launcher on every page. Removed **ChatWidget's own floating `.chw-bubble`** —
  ChatWidget now renders only the open panel (opened via `window.__openChat`).
- Fixes the regression where the bubble vanished on click (the prior
  hide-when-native-widget logic hid the global button the moment ChatWidget
  mounted) and removes the original double-bubble at the source. `syncVisibility`
  reverts to always-visible.
- Safe: every non-popout page that loads `chatWidget.jsx` also loads
  `globalChatButton.js` (verified); `chatPopout.html` is docked (never had a
  bubble). Marketing pages' `supportBubble.jsx` still pre-mounts ChatWidget so
  `__openChat` is ready — it just no longer paints a competing bubble.

### 2026-06-05 — Paywall polish + website chat-bubble de-dupe
- **Website chat bubble "double" look fixed:** the site-wide launcher
  (`globalChatButton.js`) was always visible — on pages that also mount the rich
  widget (`chatWidget.jsx` `.chw-bubble`), the two teal pills stacked at a 4px
  offset and read as one bubble behind another. `syncVisibility` now **hides the
  launcher whenever the native widget is present** (`.chw-bubble` closed or
  `[data-chat-panel]` open); the existing MutationObserver re-runs it as the
  widget mounts/opens/closes, so exactly one bubble ever shows.
- **Paywall feature list** (`BSPaywall`) gained two bullets — *Daily habits,
  streaks & check-ins* and *Recipes, meal logging & grocery lists*.
- **Removed the now-redundant "Browse the app" link** from the mobile login screen
  (the paywall's "Preview the app" is the single preview door now).

### 2026-06-05 — Paywall is the post-splash landing (members skip it)
- Mobile launch flow changed: **splash → membership wall** (was splash → login).
  The daily splash now routes to the `app` stage, whose gate shows **`BSPaywall`
  first** for non-members (it no longer waits on the role bundle), with
  Create-account / **Preview the app** / Sign-in. **Login is reached from the
  paywall**, not before it.
- **Members + approved coaches skip the wall** — they fall straight through to the
  app. New **`authReady`** flag holds the "Checking membership…" state until
  `getCurrentSession` resolves (it runs during the splash, so there's no added
  wait), and the membership effect waits on it — so a returning member/coach never
  flashes the paywall before their session + role restore.
- Sign-out now lands on the membership wall (the gate) instead of the bare login
  screen.

### 2026-06-05 — Chat gated to members (mobile + website) + preview-banner dismiss
- **Real messaging is members-only.** Added `/api/conversations` + `/api/messages`
  to the proxy gate (the website chat bubble sends via `/api/conversations`).
- **Mobile chat** = previewable but you can't type (same idea as the website
  community preview). `BSMessageComposer` now shows a 🔒 "Join Shape to send
  messages" bar instead of the input for non-members; tapping it exits preview to
  the paywall. Driven by `window.ShapeCanChat` (set by `BSAppShell` =
  `memberAllowed`, so **coaches** — members by role, not subscription — can still
  type) via a `shape:canchat` event + `useBSCanChat()` hook.
- **Preview banner** (`BSPreviewBanner`) got an **✕ dismiss** so it doesn't sit on
  screen the whole time; `shape:exitPreview` event returns the locked composer's
  Join CTA to the paywall.
- **Website chat bubble** (`chatWidget.jsx`): composer locked for non-members
  (signed-out or free) — shows "Become a Shape member to send messages" + a
  Pricing CTA; approved coaches + active subscribers type normally (resolved from
  `/api/me` role + `/api/stripe/subscription`).
- **Website community page** (`community.jsx`) is a **preview** (left open) — added
  a note under the hero: *the activity is a sample; use the chat bubble (bottom-
  right) to actually send messages (members only).*

### 2026-06-05 — Server-side member enforcement (proxy gate)
- Hardened the UI paywall with **real server-side enforcement** in the Next 16
  **proxy** (`src/lib/supabase/middleware.ts`, run by `src/proxy.ts`). The paid
  client API prefixes — **`/api/client`, `/api/nutrition`, `/api/ai`,
  `/api/insights`, `/api/calendar`** — now return **402 `membership_required`**
  (or 401) unless the requester is an approved coach, an admin, or a client with
  an **active platform subscription**. Honors both auth styles: **Bearer** (native)
  and **cookie** (web). **Fails open** on any unexpected error so a gate fault can
  never take down the paid routes.
- New edge-safe **`src/lib/membership-core.ts`** (`computeMembership`, `adminEmails`,
  `ACTIVE_SUB`) — no `next/headers`, so it's importable from the Edge proxy. Admin
  list mirrors `admin-access.ts` (which can't be imported into Edge).
- **Not gated** (deliberate, so flows keep working): billing/auth/webhook, public
  marketing + marketplace + leaderboard, coach routes (coaches are members; coach
  data is RLS-scoped), and integration connect/OAuth. The non-member client app
  already falls back to demo data on a non-200, so Preview mode degrades cleanly.
- *Note:* `computeMembership` runs ~2 lightweight queries per gated request; a
  SECURITY DEFINER `is_member()` RPC could collapse that to one if latency matters.

### 2026-06-05 — App-wide member gate (paywall) — mobile + website
- **Shape is now members-only.** Full access requires an **active $5/mo
  subscription** OR an **approved coach** account (authoritative `profile.role`,
  trainer/nutritionist). Admins exempt on the website.
- **Mobile** (`BSAppShell`, `iosAppBroadsheetMain.jsx`): a single gate wraps the
  role-dispatched app. Non-members get **`BSPaywall`** (Join → `/api/stripe/
  platform-checkout` when signed in, else create-account; Sign in; Sign out) with
  a **"Preview the app"** path → renders the real app behind a persistent
  **`BSPreviewBanner`** ("Join Shape · $5/mo") so prospects can see features +
  function. Coaches bypass by role.
  - **Fail mode:** fail-closed, but **never locks out a confirmed member** —
    membership is cached (`window.ShapeMembership` + `localStorage 'shape.member'`)
    and a failed/unreachable `/api/stripe/subscription` check falls back to the
    last-known status (so a transient/native API failure doesn't paywall a member).
    Seeded from cache → no paywall flash on reload.
  - No dev "unlock" bypass (per request) — preview the app via the paywall's
    Preview path or a real member/coach login.
- **Website** (`src/app/dashboard/layout.tsx`): the dashboard layout gates every
  `/dashboard/*` route — coaches/admins free; clients need an active
  `platform_subscriptions` row (status active/trialing/past_due), else the content
  is replaced with a **Members-only** paywall (🔒 + Pricing CTA). The public
  marketing / newdesign pages remain the website's "preview".
- *Scope:* UI/route gate on both surfaces. Real enforcement of paid features must
  still be server-side per endpoint; this gates access to the app shell.

### 2026-06-05 — Spotify "pick from your library" on the website too
- **`public/newdesign/trainerPlaylistsPage.jsx`** (`NewPlaylistCard`, shared by the
  trainer **and** nutritionist website Playlists pages): the import modal now offers
  **"Pick from your Spotify"** alongside paste-a-link — calls
  `/api/integrations/spotify/playlists` (cookie auth), lists the coach's playlists
  (cover/name/tracks/owner), and prefills the URL + name on pick. Same **BETA**
  gating as mobile: a not-connected response shows a **Connect Spotify →** link (to
  `/api/integrations/spotify/authorize?return=…`), and any other failure degrades
  gracefully to "Library import is still rolling out … paste a link instead."
- Backend reused as-is (the playlists route + `currentUser` already accept the
  website cookie session); the dropped `user-read-email` scope + Extended Quota prep
  are server-side, so they already applied to the website.

### 2026-06-05 — Shape Store gated to members (mobile + website)
- **`BSShapeStorePage`** now checks membership before rendering the catalogue. A
  signed-in account with an **active subscription** (`/api/stripe/subscription` →
  `active:true`) gets in; **coaches** (role trainer/nutritionist) are allowed too
  (providers). Free / signed-out users see a **"members only"** upgrade prompt
  (🔒 + "Activate membership · $5/mo" → `bsStartPlatformCheckout`, or "Join Shape"
  when signed out) instead of the store. Note: "You still earn points — redeem
  them once you're a member."
- Shared **`useBSMembership()`** hook drives the gate and the **Me-page "Shape
  Store" row**, which now reads **"Members only · tap to join"** with a 🔒 for
  non-members. Result cached on `window.ShapeMembership` so repeat opens don't
  flash the loading state. The gate lives inside the page, so every entry point
  (Me row, Settings, Score page, store tab) is covered.
- **Website** (`public/newdesign/store.jsx`): `StorePage` applies the same rule —
  resolves the signed-in user (Supabase), allows coaches (`profiles.role`) +
  active subscribers, else renders a **`StoreMembersOnly`** section (🔒 + Pricing
  CTA) in place of the catalogue.
- *Scope:* UI gate (the catalogue/redemption is still illustrative — no live
  redemption API to enforce server-side yet).

### 2026-06-05 — App tour: coach variant + new-accounts-only trigger
- **Coach tour** (`BSProOnboardingTour`, pros module): role-accented (teal trainer /
  gold nutritionist) walkthrough — Welcome → Today / Clients / Plans / Chat / Me →
  You're set. Wired into **both** coach shells (`BSTrainerAppInner`,
  `BSNutritionistAppInner`); the Plans step uses each shell's real tab key
  (`programs` trainer / `plans` nutritionist). Persists to `shape.coachTourSeen`
  + `user_goals('coach_onboarding')`. New **Me → App tour** row (in `BSProMe`
  settings) replays it via the shared `shape:startTour` event.
- **New-accounts-only trigger** (client + coach): the tour now auto-shows **only
  for accounts created in the last 24h** (`ShapeAuth…user.created_at`) that haven't
  seen it — existing users no longer get it on next load (still replayable from
  Me → App tour). Auth-resolve timing handled with an immediate check + a 1.2s
  retry; a guard prevents double-firing.

### 2026-06-05 — First-run app tour (client) — skippable + replayable
- New **`BSOnboardingTour`** (client module): a ~60-second, **skippable** guided
  walkthrough that auto-appears once when you first land in the app and can be
  **replayed anytime from Me → App tour** (`shape:startTour` event).
- 7 steps (Welcome → Home / Train / Eat / Chat / Me → You're set). Each step
  **switches the underlying tab** (`onNavigate={setTab}`) so the real screen shows
  behind a card with eyebrow/title/body, progress dots, Back/Next, and a ✕/Skip.
- **Trigger:** auto-shows unless already seen — localStorage fast-path
  (`shape.tourSeen`) + cloud `user_goals('client_onboarding')` so it doesn't
  re-appear across devices. Welcome step offers **Take a quick tour** / **Skip for
  now**; finishing or skipping marks it seen (`bsMarkTourSeen`).
- Mounted in `BSClientAppInner` (portals into `#bs-phone-surface`, above the tab
  bar). New **Me → App tour** shortcut row dispatches `shape:startTour`.
- *Follow-up:* a coach-app variant (trainer/nutritionist) reusing the same shell.


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
- **Design-system pass — Phase 1 SHIPPED 2026-06-11** (`BSPlate` shared
  primitive in the chrome, window-exposed; AgendaCard + weekly-totals tiles
  refactored onto it; converted: Train hero, coach-adjust banner, home
  coach-feed pushed items, find-a-coach bars, Score composite hero). Kept
  quiet BY THE RULE: Eat hero (deliberately condensed strip), Eat/Train list
  rows, Store catalog rows. **Phase 2 SHIPPED same day** — coach apps (both
  roles, role-accented): client-profile StatCards + big attendance/adherence
  metric card (plate w/ tick) + Manage assign card; Plans-tab TOP feature
  cards + AI-generate CTAs squared with role spines. Coach Today lead stays
  typographic (masthead style); rosters/forms/action pages quiet by the rule.
  Two-tier rule: plates = live/actionable; quiet rounded cards =
  forms/sheets/lists; chat bubbles stay round.
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
