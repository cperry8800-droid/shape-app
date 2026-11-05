# Member (client) dashboard: audit, data check and direction

Review of `public/newdesign/ClientApp.html` (11 tabs), Nov 5, 2026. Same process as the coach review
(`coachreview/shape-coach-cockpit.html`, data in `reviewtools/r2data.py`), adapted for members.
Nothing under `/home/user/shape-app` was changed.

**Files**
- Current screens: `clientcur/<tab>.png` (1440 × 900, DSF 2) and `clientcur/<tab>-full.png` for all 11 tabs;
  phone (390 × 844): `clientcur/today-phone.png`, `today-phone-full.png`, `nutrition-phone.png`.
  Team, Score and Habits were shot with `/api/client/*` answering 401 (production's signed-out reply); the
  plain static server's 404 puts those three in their error states instead.
- Member kit: `clientmock/kit.css`, `clientmock/clientchrome.js`, `clientmock/BRIEF-client.md`.
- Example mock-up: `clientmock/today-v1.html` → `clientprop/today-v1.png` (1440), `today-v1-1280.png`,
  `today-v1-dark.png`.
- Tools: `clienttools/shots.js` (live tabs), `shots401.js`, `mockshot-client.js`, `engine.js` (runs the real
  directive engine on Priya's record), `contrast-mock.js`.

**How the screens were taken.** Served `public/` on a local port; `ClientApp.html#<tab>` in Playwright.
With no API, the gate fails open and every tab shows its signed-out preview ("Preview · demo data").
⚠ In production a signed-out visitor never sees this preview: `/api/me` answers `{ user: null }` and the
page sends them to Login (`ClientApp.html:48-61`), and a signed-in non-member gets the join panel
(`ClientApp.html:227`). **So the demo is a review artifact; real members see their own data or the empty
states.** The redesign has to design the empty states (no coach, no plan, nothing logged) as carefully as
the full ones.

**Status key** (same as the coach review)
- **WIRED**: a live source feeds it today, and it updates as described.
- **DERIVABLE**: the data exists in Shape (a table, a route, or the app's own reader), but the website
  doesn't read or compute it yet.
- **NEW**: needs a new field, table or route.
- **MOCK-ONLY**: the website shows it only in the demo; a live member sees an empty state or nothing.

---

## The member and what the engine already gives them

### What a member needs from the dashboard
Three questions, in this order, on every visit:
1. **What do I do today?** The one move, then the day's plan.
2. **How am I doing?** Against my goal and my week, in a sentence before a chart.
3. **What's next with my coaches?** What they sent, what they're waiting on, and when we next talk.

Today the website answers none of them first. Every tab opens on raw figures: Today on a check-in banner,
a plan column and eight equal widgets, about 2,100px of them.

### What the engine and Nora already produce for members
| Output | What it says | Where it runs | On the website today? |
|---|---|---|---|
| **The directive** ("one lead per page") | verdict + reason + one action, cross-discipline, e.g. "On pace — 9-day streak, deficit holding, sessions on plan — keep it boring" | `public/newdesign/dashSignals.js:1478` (`buildDirective`); server copy `src/lib/ai/directive.ts:82` (`computeDirective`, cached per member per day) | **No.** App Home's "Your move" row (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:3531`, `:4089`), the Shape Daily splash (`iosAppBroadsheetMain.jsx:468`), the member's push and bell (`src/lib/ai/notify-core.ts:215`) |
| **Coach override** of the directive | a coach sets the lever, verdict and reason; it wins over the engine | `/api/ai/directive/override` → `client_programs.detail.directive` (`src/lib/ai/directive.ts:67`, `:108`) | No |
| **Notifications** (directive, flags, digest) | supportive pushes with quiet hours, daily caps, never shaming | `src/lib/ai/notifications.mjs`, `/api/ai/notify` | Bell only (header inbox, `pageShell.jsx:447`) |
| **Weekly readout** | 3–5 insights from correlations, one model call per member per week | `/api/ai/weekly-readout` | Yes: Progress "The read · this week" (`dashProgress.jsx:1292`), only when held |
| **Coach's weekly note** | free text from each coach ("Five plates. Three logged before noon…") | `coach_focus_banners` (realtime), read by `ShapeCoachFeed` (`mobile-app/src/services/shapeBackend.js:10076`) | No (app Home Team card only) |
| **Coach-pushed items** | exercises (trainer), meals and grocery notes (nutritionist) | `coach_pushed_items`; `/api/client/nutrition` (`route.ts:87`), `/api/client/grocery` | Not on Today or Nutrition (the pages read `/api/client/plan` only) |
| **Night-before prep** | "prep the overnight oats tonight", reminder at the member's hour | `mobile-app/src/services/prepAhead.mjs:188` (`bsPrepDueTonight`), cron `/api/cron/prep-reminders` | No (Nutrition shows PREPPED records only) |
| **Morning swap** | a 15-minute alternative when a planned breakfast wasn't prepped | `prepAhead.mjs:307` (`bsMorningSwapFor`), `BSPlanDay.jsx` (`BSMorningSwapCard`) | No |
| **Member's own day plan** | meals the member planned for a day | `mobile-app/src/services/mealDays.mjs` (`user_goals` `client_meal_days`) | No |
| **Habit watch** | at 8 pm friends hear about a shared habit not done | `/api/cron/habit-watch` | Sharing toggle on Habits only |
| **Score accountability** | daily penalties for missed commitments, credit for kept sessions, one heads-up | `/api/cron/score-accountability`; commitments `/api/client/commitment` | Commitment card on Score |
| **Nora** (chat) | member tools: `get_week_summary`, `get_training_plan`, `get_recent_workouts`, `get_habits`, `get_mornings`, `get_points`, `get_coaching`, `log_meal`, `log_water`, `log_weigh_in`, `check_habit`, `set_reminder`, `set_up_account`, `recommend_coaches`, `shape_workout_draft` (writes as confirm cards, `src/lib/ai/proposals.mjs`) | `/api/support/chat` | Yes: "Ask Nora" floating button on every tab; Nora's greeting and four suggestions (`src/lib/ai/noraGreeting.mjs`) |
| **Nora drafts a week** | a program draft from goal, weeks, days | `/api/ai/draft-program` | Workouts "Build your week" (`dashTrain.jsx:460`) |
| **Morning check-in** | sleep, energy, soreness… in words, readiness, "What we've noticed" | app only (owner, 2026-10-20) | A pointer card ("Your Morning check-in is in the Shape app", `dashClient.jsx:387`) |

**The gap:** the website never leads with the directive. It can't compute one well either: the self record
it builds from `/api/client/dashboard` + the check-in kit carries no adherence, nutrition, weigh-ins or
recovery (`dashData.jsx:338-358`), so `buildDirective` would mostly answer "Not enough signal yet". The app
builds a full record client-side (`mobile-app/src/services/shapeSignals.js:46`). → **NEW:** one thin route,
`GET /api/client/directive`, building the record server-side and returning `computeDirective` (override
merged, cached per day). Everything it needs exists.

⚠ **An owner call hiding in the engine.** Protein and calorie flags are nutritionist-only by design
(`dashSignals.js:868-871`): Priya's own directive says "On pace" while Rae's feed says "Averaging 96g protein
vs a 150g target". The member hears it only if Rae sets an override or writes it in her note. The mock-up
shows the override path ("Set by Rae"). **Decide** whether the member's own directive should also carry
`protein_under` / `ledger_blown` when the member has no nutritionist, or always.

### How the member sees their team today
- **Team tab:** each coach's role, "since", plan and price, next session, Message and Book. No messages, no
  notes, no check-in status, nothing the coach is waiting on (`clientTeam.jsx:244-279`).
- **Today:** a "Your team" widget with two names, a role and Message (`dashClient.jsx:953-978`); its unread
  badge is demo data (bug B6).
- **Check-ins:** a gold "Weekly check-in · due" banner on Today (`dashClient.jsx:838-846`) and the form on
  Progress. After sending, nothing shows that a coach read or answered it.
- **Messages:** the floating Chat widget (`chatWidget.jsx`), live conversations.
- **The app already solved this:** Home's Team card puts the trainer's session, the nutritionist's note,
  the food left and the next meal on each coach (`iosAppBroadsheetClient.jsx:4111-4170`, owner 2026-11-03:
  "replace with just this").

---

## Tabs

### 1 · Today (`#today`, `ClientDashboardPage`, `dashClient.jsx:686`)
Screens: `clientcur/today.png`, `today-full.png` (2,111px), `today-phone.png`, `today-phone-full.png` (3,414px).

**One question:** *What do I do today, and what's my one move?*

**What's on it:** "Welcome back, Priya." with Log workout and Book session; a full-width gold "Weekly check-in ·
due" banner; for live members in their first 30 days, the setup board (four stages, a step list and a
week-one target form, `dashClient.jsx:564-683`); then two columns. Left: Up next (a meal or the workout, with
a countdown) and the day as a list. Right: the board toolbar (Dashboard ▾, Save as…, Rename, Undo, Widgets,
plus a help line) and eight widgets: Shape Score ring + streak, Morning check-in pointer + water, Tonight's
workout (every move, cues, playlist, Start), Today's meals (four macro bars + every meal with Swap and Log),
This week ring, Milestones, Your team, Links (grocery, next session, membership pill).

**Problems**
- **No direction.** Nothing says what matters today; the engine's directive is not on the page (see above).
- **Overload.** About 12 blocks; the first screen holds the banner, Up next and two widgets. Workout and
  meals repeat what Up next and the day list already say (the chicken bowl appears three times above the
  fold on the phone).
- **Dead-end loop.** Log workout (`dashClient.jsx:832`), Start → (`:200`) and Start workout (`:465`) all go
  to Workouts, whose subtitle says "Log sessions in the app" (`dashTrain.jsx:900`). The website can't start
  or log a session.
- **Numbers that contradict each other** across tabs in the demo (streak 14 here, 9 for coaches; target
  2,200/175 here, 1,900/150 for the engine; next session Thu 6:30 pm here, Thu 8:00 am on Team; goal "pace
  Aug 3", a date three months past). Table in `clientmock/BRIEF-client.md`.
- **Invented figures for live members:** the consistency ring divides by an assumed 5 workouts a week and
  adds sessions to food-logged days to make "wins" (B5); partial plan targets are filled from the demo (B4).
- **Tiny type:** 23 labels at 8.5–9px and six at 7–8px (`dashClient.jsx:862, 875, 907, 912, 916, 935`).
- **Board chrome:** the toolbar and help line take ~100px on desktop and ~300px on the phone, every tab.
- **Phone:** the demo band covers the Nora button; Up next's countdown reads "in 12h 3m" at midnight.

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| First name, greeting | `/api/client/dashboard` `user.firstName` (`route.ts:38-46`) | WIRED | page load |
| Today's workout (title, time, moves, video, playlist) | `/api/client/plan` → `client_workouts` (`plan/route.ts:134-391`) | WIRED | page load; 60s cache (`dashData.jsx`) |
| Today's meals + approved swaps | `/api/client/plan` → `client_meal_plans` (day by weekday) | WIRED | page load |
| Nutritionist-pushed meals, member-added meals | `/api/client/nutrition` `todayMeals` (`nutrition/route.ts:87-130`) | DERIVABLE (returned, not read) | page load |
| Macro ledger (eaten) | `/api/client/nutrition` `today` ← `daily_health_snapshot` | WIRED | seeds on load, ticks on each Log here |
| Calorie / macro targets | plan day `targets`; nutritionist's `coachTargets` | WIRED, but demo fill (B4) | page load |
| Meal "✓ Logged" | `localStorage` per device (`dashClient.jsx:748-755`) | WIRED write (`/api/nutrition/meal-log`), state MOCK-like | device only (B3) |
| Water + member's target | `/api/client/hydration` (`route.ts:51-116`) | WIRED | optimistic, server answer wins |
| Weekly check-in due | `/api/client/checkin-kit` `checkins[0].week_of` | WIRED | page load |
| First-30-days board | `/api/client/onboarding` (`route.ts:85-228`) | WIRED | load + `shape:accountSetup` |
| Shape Score, tier, to next, week gain, sparkline, "why it moved" | `/api/client/score` (`route.ts:108-242`) ← `score_ledger` | WIRED | page load; ledger written as things are logged, plus the nightly cron |
| Streak | `/api/client/dashboard` `kpis.streak` (`readDayStreak`, member's zone) | WIRED | page load |
| Workouts done this week | `kpis.workoutsThisWeek` ← `workout_sessions` | WIRED | page load |
| Workouts planned this week | plan rows dated this week, else **5** | WIRED / invented fallback (B5) | page load |
| Days meals logged (7) | `/api/client/nutrition` `loggedDays7` | WIRED | page load |
| Milestones (earned / next) | `DashSignals.buildMilestones(selfRec)` on a thin self record | DERIVABLE (thin: no weigh-ins, PRs) | page load |
| Team names + roles | `/api/client/dashboard` `team` ← `subscriptions` | WIRED | page load |
| Team unread badge | `window.clientChatTabs` demo threads (`dashClient.jsx:88`) | MOCK-ONLY (B6) | never |
| Next session | `dashboard.upcoming[0]` ← `sessions` (requested + confirmed) | WIRED, mislabels requests (B1) | page load |
| Membership pill | `/api/stripe/subscription` | WIRED | page load |
| Grocery link | `ClientGrocery.html` ← `/api/client/grocery` (`coach_pushed_items`) | WIRED | page load |
| **Directive / your move** | `buildDirective` + override (`src/lib/ai/directive.ts`) | NEW route (engine WIRED) | per day, recomputed on signal change |
| **Coach's note** | `coach_focus_banners` | DERIVABLE (app reads it with realtime) | realtime in the app |
| **Call link for a session** | `sessions.meeting_url` via `/api/calendar` (`calendar/route.ts:144`) | DERIVABLE | page load |
| **Night-before prep** | `prepAhead.mjs` + `meal_prep` records | DERIVABLE (port the module or add a route) | hourly cron in the app |

**Direction** (the example mock-up, `clientprop/today-v1.png`)
1. **Your move first.** One sentence from the directive, and the chip says whose it is: "Set by Rae" when a
   coach override wins, "Shape's read · on pace" for the engine. One action. Replaces the check-in banner
   and the score ring as the opening.
2. **Up next stands highest.** The next thing in the day with its one action (Join the call / Log / Preview),
   and "Then …" for the one after. The day itself is one timeline coloured by kind (training coral, meals
   lime, a coach call in that coach's colour) with a now-line, Log and Swap in the row, and tonight's prep
   at the foot.
3. **How am I doing, in two small widgets.** Fuel left (one ring, the three macros as words: "the lever",
   "on track", water with ＋ 250 ml) and This week (sessions, streak, score points, and three lanes a day:
   trained, food logged, protein hit).
4. **Your team says what's pending.** Each coach's latest note or the question you're waiting on, with one
   button; the check-in status underneath. Score, Goal, Habits, Milestones, Program week, Grocery and Radio
   move to the catalog ("＋ Add a widget").

---

### 2 · Progress (`#progress`, `ClientProgressPage`, `dashProgress.jsx:1092`)
Screens: `clientcur/progress.png`, `progress-full.png` (1,608px).

**One question:** *Is it working? Am I closer to my goal than eight weeks ago?*

**What's on it:** "Earned, not promised"; board toolbar; Weight 8 weeks ago vs today; Measurements then vs
today; Photos then vs today (demo hatched tiles); Consistency strip (streak, workouts this week, PRs this
quarter, all-time); Trend chart with Weight / Body fat / Strength / Sleep tabs and a ⚙ window; PR history;
Strength e1RM with progressing / holding / stalled / building chips; Milestones earned → next; conditional
Weekly readout, Crossover, Cycle, Check-in form and Photo timeline.

**Problems**
- **Up to 13 widgets, no verdict.** Four separate "then vs now" readings and a trend chart, and nothing says
  "you're 2.8 lb from goal, on pace for Nov 21". The goal lives on another tab.
- **The weekly check-in form is buried here** (Today's banner links to it), below charts.
- **Repeats:** streak and workouts this week are also on Today and Workouts; PRs appear twice (PR history and
  e1RM).
- **Demo milestones belong to another client** (Jordan M.'s 5k and 100th workout, B10) and weight 177 → 171
  contradicts the 172.8 lb the engine and Goal use.

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Weight, body fat, sleep series; 8-weeks-ago compare | `/api/client/progress` (`route.ts:38-374`) ← `daily_health_snapshot`, `client_weigh_ins` | WIRED | page load; devices sync into the snapshot |
| Strength series, PRs | `/api/client/progress` `prs` ← `workout_set_logs` | WIRED | page load |
| e1RM per lift + status | `/api/client/strength` (`route.ts:23-92`) | WIRED | page load |
| Measurements | `/api/client/checkin-kit` `measurements` ← `client_measurements` | WIRED | page load |
| Photos then vs now, timeline | `/api/client/progress-photos` ← `client_progress_photos` | WIRED | page load |
| Streak, workouts this week, total | `/api/client/dashboard` `kpis` | WIRED | page load |
| PRs this quarter | counted from `prs[].bestAt` | DERIVABLE (computed here) | page load |
| Milestones earned → next | `buildMilestones` on a thin record (`dashProgress.jsx:1260-1271`) | DERIVABLE (thin) | page load |
| The read · this week | `/api/ai/weekly-readout` | WIRED | once a week per member |
| Crossover (work × body) | shared engine `crossoverRead` | WIRED | page load, needs data past floors |
| The Cycle | `cyclePhase.mjs` + member's logged dates | WIRED | page load |
| Weekly check-in form | POST `/api/client/checkin-kit` → `client_checkins` | WIRED | on save |
| **Goal verdict** ("2.8 lb to go, on pace for Nov 21") | `DashSignals.projectGoal` / `goalBrief` over `goals` + weigh-ins | DERIVABLE | page load |

**Direction**
1. **A verdict on top:** "Down 3.2 lb in 3 weeks. On pace for 170 lb around Nov 21." from `goalBrief`, with the
   weekly readout's lead insight under it when one is held.
2. **One chart, chosen:** the trend with the goal line and the projection; weight, body fat, strength and
   sleep stay as its tabs. Then vs today becomes a row of three small compares (weight, waist, photo).
3. **Strength as one widget:** e1RM per lift with its chip; PR history goes into its ⋯.
4. **The check-in leaves Progress** for Today and Team (where its answer arrives); milestones join the catalog.

---

### 3 · Workouts (`#workouts`, `ClientWorkoutsPage`, `dashTrain.jsx:679`)
Screens: `clientcur/workouts.png`, `workouts-full.png` (1,690px).

**One question:** *What's my next session, and where am I in the program?*

**What's on it:** program eyebrow ("Strength Block 3 · Week 2 of 4"); board toolbar; Tonight's workout card
(every move); weeks as plates (done, this week with each day's state, locked, "not written yet" with a gold
Check in); conditional Build your week (self-training and Nora's draft); Consistency (this week, all-time,
7-day volume); Session history (logged vs prescribed, PR chip).

**Problems**
- **"Tonight's workout · NOV 6"** when the next session is on another day (B7); and Today calls a different
  workout "tonight" in the demo.
- **The website can't start or log a session** but three buttons on Today promise it (dead-end loop above).
  The page says so only in its subtitle.
- **Weeks as full plates** push history and consistency below the fold; the program's shape (where you are of
  10 weeks) is a line of small text.
- Consistency repeats Today's and Progress's figures (third copy of "workouts this week").

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Program name, week x of y | `/api/client/plan` `training.workouts[].template` | WIRED | page load |
| Weeks, days, done state | plan rows + `dashboard.calendar` WORKOUT dates | WIRED | page load |
| Next / tonight's session + moves | plan rows (`dtrTonight`, `dashTrain.jsx:77`) | WIRED | page load |
| Locked / not-written weeks | plan rows' week numbers vs the template length | WIRED | page load |
| Session history, logged vs prescribed | `/api/client/train` `recentSessions` (`route.ts:37-194`) ← `workout_sessions`, `workout_set_logs` | WIRED | after the app syncs sets |
| This week, all-time, 7-day volume | `/api/client/train` `stats` | WIRED | page load |
| PR marks | `/api/client/progress` `prs` | WIRED | page load |
| Build your week, Nora drafts | `/api/client/self-training`, `/api/ai/draft-program` | WIRED | on save |
| Playlist on a session | plan row `playlist` | WIRED | page load |

**Direction**
1. **Next session as the lifted card**, labelled with its real day ("Thursday · 5:30 pm"), its moves folded
   to a line, one action **"Send to my phone"** (or a QR) instead of Start, since logging happens in the app.
2. **The program as a strip:** 10 weeks across, done / this week / locked / not written, each week a
   coloured cell in the program type's colour; a click opens the week.
3. **History beside it**, compact, with PR chips; consistency drops (Today owns it).
4. **Build your week** stays for members without a trainer; with a trainer it moves to ⋯.

---

### 4 · Nutrition (`#nutrition`, `ClientNutritionPage`, `dashNutri.jsx:224`)
Screens: `clientcur/nutrition.png`, `nutrition-full.png` (1,980px), `nutrition-phone.png`.

**One question:** *What do I eat today, and how much is left?*

**What's on it:** "Lean recomp · Week 3 · Rae"; board toolbar; This week (seven equal tiles of planned
calories, a dot for logged); Today's meals (four macro bars + meals with Swap and Log); Grocery (ten
ingredients, each "1× wk"); Logging (streak, days, recent wins, a bar per day); Saved recipes.

**Problems**
- **Today here disagrees with Today on Today** in the demo (rest day, different meals, 1,530 vs 1,340 kcal).
- **Saved recipes is demo-only**: there is no saved-recipe store, so a live member always sees "No saved
  recipes yet" (`dashNutri.jsx:305`, B14).
- **Grocery as ten "1× wk" rows** says little; the full list is a separate page.
- **The week strip carries no meaning beyond planned calories**; the dots are tiny. On the phone it stacks
  into seven 160px tiles (~1,100px) before the meals.
- **Ignores what the nutritionist pushed and what the member planned** (`todayMeals`, `client_meal_days`),
  and the night-before prep the app already reminds about.
- **Invented targets for live members** (2,200/175/240/70 when a plan day has none, B4).

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Plan title, coach, days, meals, swaps, ingredients | `/api/client/plan` `meals` ← `client_meal_plans` (`plan/route.ts:391`) | WIRED | page load |
| Targets | `plan.meals.coachTargets` > day targets > **demo** | WIRED / demo fill (B4) | page load |
| Today's ledger | `/api/client/nutrition` `today` ← `daily_health_snapshot` (`route.ts:18-136`) | WIRED | page load + each Log |
| Week calories, logged days, streaks | `/api/client/nutrition` `week`, `loggedDays7`, `currentStreak`, `longestStreak` | WIRED | page load |
| Grocery (widget) | built from plan ingredients (`dnuBuildGrocery`, `dashNutri.jsx:54`) | WIRED | page load |
| Grocery (full page) | `/api/client/grocery` ← `coach_pushed_items` grocery notes | WIRED | page load |
| Prepped meals | `ShapeMealPrepLib` + meal-prep records (RLS) | WIRED | page load |
| Saved recipes | none (`DNU_DEMO.favorites`) | MOCK-ONLY | — |
| Pushed + member-planned meals | `/api/client/nutrition` `todayMeals` | DERIVABLE | page load |
| Night-before prep due | `prepAhead.mjs:188` | DERIVABLE | hourly cron in the app |
| Member's own day plan | `user_goals` `client_meal_days` (`mealDays.mjs`) | DERIVABLE | on write (compare-and-set) |

**Direction**
1. **Fuel left first:** one ring and the three macros, with the nutritionist's lever written as words
   ("protein is the lever"), and water.
2. **Today's meals as a short timeline** with Log and Swap, the 4 pm protein shake marked as the lever,
   tonight's prep at the foot (from `prepAhead.mjs`).
3. **The week as seven small columns** of eaten vs plan, the training days marked, a tap opens a day.
4. **Drop Saved recipes** (no store) for **"From Rae"**: what she pushed this week and her note. Grocery
   becomes a count with "Open list".

---

### 5 · Library (`#library`, `ClientLibraryPage`, `clientLibrary.jsx:1`)
Screens: `clientcur/library.png`, `library-full.png`.

**One question:** *What has my team given me to watch, read or cook?*

**What's on it:** "From your team"; Search and Saved (14); tag pills; six collection cards (gradient
placeholders); Recently added (video, doc, recipe rows dated April).

**Problems**
- **Entirely demo.** A signed-in member always gets an empty page (`clientLibrary.jsx:25-26`): there is no
  library model behind it.
- **Dead controls:** Search, Saved (14) and every card have no handler (`clientLibrary.jsx:43-44, 75`, B8).
- Demo names a coach not on the team ("Diego") and April dates.
- Six large cards with empty art; nothing says what's new or what a coach wants you to look at.

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Collections, recent items, Saved (14) | literals in `clientLibrary.jsx:10-24` | MOCK-ONLY | — |
| Exercises a trainer pushed | `coach_pushed_items` kind `exercise` (`src/app/api/trainer/console/route.ts:47`) | DERIVABLE | realtime in the app |
| Meals / grocery notes a nutritionist pushed | `coach_pushed_items` kind `meal`, `grocery_note` | DERIVABLE | page load |
| Exercise demos (video) | workout moves' `video` in the plan; the exercise catalogue (`/api/exercises`) | DERIVABLE | page load |
| Shape Kitchen recipes | the static catalogue in `public/newdesign/recipes.jsx` (the Recipes page) | DERIVABLE | ships with the site |
| Program intro / walkthrough videos | plan rows `programVideo`, `video` | DERIVABLE | page load |

**Direction** (fixed layout, a tool page)
1. **Build it from what exists:** "From Maya" (exercises she pushed, the program's videos) and "From Rae"
   (meals and notes she pushed, the Kitchen recipes in your plan), newest first, each with who and when.
2. **One search** across those and Shape Kitchen; tag pills become the two coach filters plus Kitchen.
3. **Hide the tab until there's something in it**, or show "Your coaches haven't shared anything yet" with
   Kitchen picks for your plan. No fake counts.

---

### 6 · Team (`#team`, `ClientTeamPage`, `clientTeam.jsx:304`)
Screens: `clientcur/team.png` (preview), `team-full.png`.

**One question:** *What's going on with my coaches: what did they send, what are they waiting on, when do we
talk next?*

**What's on it:** "Your team." with Browse coaches and ＋ Invite specialist; COACHES 2 and SESSIONS COMING UP
2; one station per coach: initials, role, since, PLAN · price, NEXT, Message, Book session.

**Problems**
- **Says who, not what's going on.** No coach note, no unread, no check-in or its reply, no question waiting.
  Two-thirds of the page is empty.
- **NEXT shows unconfirmed requests as sessions**, and the count includes them (B1).
- **Price on the team page** reads as billing; the member needs it in Settings, not here.
- ＋ Invite specialist goes to the Marketplace, the same place as Browse coaches.

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Coaches, role, since, plan price | `/api/client/team` (`route.ts:44-111`) ← `subscriptions`, `trainers`, `nutritionists` | WIRED | page load |
| Next session per coach | `/api/client/team` ← `sessions` (requested + confirmed) | WIRED, mislabels requests (B1) | page load |
| Book a session | `/api/availability` + `/api/sessions/request` | WIRED | on request |
| Unread per coach | conversations (`chatWidget.jsx` reads `/api/conversations/...`) | DERIVABLE | live in the widget |
| Coach's weekly note | `coach_focus_banners` | DERIVABLE | realtime in the app |
| Check-in sent / reviewed / answered | `client_checkins` (`/api/client/checkin-kit`); a coach's review state | WIRED (sent) / NEW (reviewed, answered) | page load |
| What each coach pushed this week | `coach_pushed_items` | DERIVABLE | page load |
| Call link | `sessions.meeting_url` (`/api/calendar`) | DERIVABLE | page load |

**Direction** (fixed layout)
1. **One column per coach, in their colour**, each answering "what's pending": their latest note, the
   question you're waiting on, an unread count, the next confirmed session with Join, a request shown as a
   request.
2. **The week's check-in as a shared strip:** sent Monday ✓ · Rae reviewed ✓ · Maya replied … (needs a
   reviewed / answered state: NEW).
3. **Price and plan move to Settings → Plan & billing**; Find a coach stays one button.

---

### 7 · Score (`#score`, `ClientScorePage`, `clientScore.jsx:109`)
Screens: `clientcur/score.png`, `score-full.png` (2,579px, preview).

**One question:** *How far to my next reward, and what's the quickest way there?*

**What's on it:** 1,284 with "You're in Tempo. 716 points to Form — about 20 weeks"; How it works and
Leaderboard; board toolbar; Momentum 72/100; This week's commitment; Reward tiers (five rows); Score breakdown
(eight categories); This week's gains; Shortest path; Recent points (eight entries).

**Problems**
- **2,579px for one number and one next step.** The shortest path (the only direction) is a small tinted box
  halfway down.
- **Demo breakdown sums to 1,404 under a 1,284 headline**, and three tabs give three "this week" figures (+41
  Today, +36 here, +82 Profile) (B13).
- Five tier rows at 70px each repeat what one progress bar says.
- Momentum, commitment, tiers, breakdown and ledger all at one volume.

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Points total, tier, to next, week gain | `/api/client/score` (`route.ts:108-242`) ← `score_ledger` | WIRED | as things are logged; nightly cron |
| Breakdown by category | `breakdown_total` (lifetime) | WIRED | page load |
| Recent points | `recent` (last 20) | WIRED | page load |
| Momentum | `/api/client/score` `momentum` ← `compute_momentum` RPC (`route.ts:188-191`) | WIRED | page load |
| Commitment | `/api/client/commitment` (`route.ts:19-70`) | WIRED | on save; settles weekly |
| Tier rewards (claim) | `/api/store/tier-rewards` (`claim_tier_reward`) | WIRED | on claim |
| Leaderboard | `/api/leaderboard` (`route.ts:60-147`) | WIRED | page load |
| Twelve weeks trend | `/api/client/score-record` | WIRED | page load |
| Shortest path wording | computed on the page | DERIVABLE | page load |

**Direction** (a widget board)
1. **One climb:** points on a bar from Tempo to Form with the reward at the end and "716 to go · about 20
   weeks".
2. **"Fastest way" as the raised widget:** the two or three moves that add the most this week, each with its
   points, from the ledger's own categories.
3. **This week's gains + commitment side by side**; tiers, breakdown and full ledger in the catalog or ⋯.

---

### 8 · Habits (`#habits`, `ClientHabitsPage`, `clientHabits.jsx:40`)
Screens: `clientcur/habits.png` (with no data: "Could not load habits"), `habits-full.png`.

**One question:** *Which habits are left today?*

**What's on it** (live): KPIs (today %, week %, longest streak), Sharing, Do's, Don'ts, a 7-day grid, Shape
Score from habits, Last seven days. Signed out it shows only an error line; there is no preview.

**Problems**
- **Seven widgets for a checklist.** Today's list is split into Do's and Don'ts; the grid repeats it with
  history; two widgets restate points.
- **Adding a habit is two browser pop-ups** (`window.prompt`, then `window.confirm("Tag this as a WORK
  habit?")`, `clientHabits.jsx:47, 50`, B11).
- The signed-out / failed state is a bare "Could not load habits. Please retry." with an unstyled button.

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Habits, history, today's ticks | `/api/client/habits` (`route.ts:19-232`) ← `user_habits`, `user_habit_completions` | WIRED | load, a 15s day-roll check, each toggle |
| Points per tick (3) | `award_habit` RPC (`habits/route.ts:200-205`) | WIRED | on toggle |
| Sharing / watchers | `habit_watchers` + cron `/api/cron/habit-watch` | WIRED | hourly (8 pm local) |
| Reminders | `habit_reminders`, `/api/client/reminders` | WIRED | on save |
| KPIs, streaks | computed on the page | DERIVABLE | page load |

**Direction** (a widget board, two widgets by default)
1. **Today's checklist** as one list (do's and don'ts together, don'ts marked), tick in place, points shown
   once at the bottom.
2. **The week as a grid** with each habit's streak; Sharing and reminders in each habit's ⋯.
3. **Add in place:** an inline row with a do / don't switch, no pop-ups.

---

### 9 · Goal (`#goal`, `ClientGoalsPage`, `dashGoals.jsx:311`)
Screens: `clientcur/goal.png`, `goal-full.png`.

**One question:** *Am I on pace for my goal, and when do I get there?*

**What's on it:** "3 of 3 · set with your coaches"; board toolbar; three goal cards (Weight "Lean by August"
79.2 → 76 kg, projected Dec 30; Back squat 1RM 110 → 115 kg, Dec 2; 5k under 25:00, Hit Nov 2); How the
projection works with Log weigh-in and Weekly check-in; Share with your coaches; Your why.

**Problems**
- **The projection is the point, and it's good**: this is the tab closest to the redesign already.
- **Live goals read the member's oldest 104 weigh-ins**, so a daily logger's projection freezes after about
  three months (`dashGoals.jsx:359`, B2).
- A weight goal named "Lean by August" in November; the demo's endurance goal is Jordan M.'s.
- "How the projection works" is a paragraph widget on the first screen; it belongs behind a ⓘ.

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Coach-set goals | `client_programs.detail.goals` (shapeDb, RLS) | WIRED | page load |
| Self-set goals, why | `user_goals` `client_goals` | WIRED | page load + `shape:accountSetup` |
| Weigh-in series | `client_weigh_ins` (`dashGoals.jsx:359`) | WIRED, oldest-first cap (B2) | page load |
| Projection, slip | `DashSignals.projectGoal`, `goalSlipDays` | WIRED | page load |
| Log a weigh-in | `client_weigh_ins` upsert (`dashGoals.jsx:520`) | WIRED | on save |
| Share with coaches | `user_goals` `client_settings` | WIRED | on toggle |

**Direction** (a widget board)
1. **One shape per goal:** a ring or a climb, a status chip ("on pace", "slipping 6 days"), the projected date
   and one action.
2. **The primary goal leads** with its pace chart (the app's "Climb", `BSHomeClimb`, `mobile-app/src/broadsheet/BSHomeDeck.jsx:70`); the others expand on
   click.
3. **Your why stays** (it's the member's own words); "How the projection works" goes behind ⓘ.

---

### 10 · Profile (`#profile`, `LiveProfilePage demoRole="client"`, `livingProfilePage.jsx:151`)
Screens: `clientcur/profile.png`, `profile-full.png`.

**One question:** *How do others see me, and is that what I want?*

**What's on it:** the dark living-profile hero (Priya Shah, @priya.lifts, Tempo, "Hypertrophy Block II ·
Week 6 of 12", Shape Score 1,284 ▲82, day streak 14, −5 lb), a climb to Form with her photo, followers /
following / posts, tabs Activity · Signals · Climb · Music, and the activity feed.

**Problems**
- **A third program name** for the same member (Hypertrophy Block II; Workouts says Strength Block 3; the
  coaches say Cut · Conditioning) and a third "this week" score.
- **The preview shows the visitor's view** ("Message Priya") on her own tab; signed in it reads "Edit
  profile" (`livingDesktop.jsx:407-411`), so this is demo-only.
- Not a dashboard page: it's the social profile, styled apart from every other tab. Fine as a tool page,
  but it should say who can see what.

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Name, handle, pronouns, location, photo | `get_public_profile` RPC (`livingProfilePage.jsx:197`) | WIRED | page load + `shape:accountSetup` |
| Shape Score, streak, trajectory, program | own metrics (`liveSelf`) | WIRED | page load |
| Posts, followers | community tables (RLS) | WIRED | page load |
| Music | the member's Spotify / Apple link | WIRED | page load |

**Direction** (fixed layout)
1. **Keep the living profile**, with an "as others see it" toggle and a privacy line under the hero
   (public / followers / coaches).
2. **Edit in place**, one Save, linking to Settings → Profile for the rest.

---

### 11 · Settings (`#settings`, `ClientMeSettings`, `clientMeSettings.jsx:198`)
Screens: `clientcur/settings.png`, `settings-full.png` (2,917px).

**One question:** *Change one thing, quickly.*

**What's on it:** Profile, Appearance (six skins), Plan & billing, Connected apps (Strava, Whoop, Garmin, Oura,
Apple Health app-only), Nutrition preferences, Training preferences, Privacy, Social & links, App tour, Danger
zone, Health profile, Your reminders, Notifications. One 2,917px scroll.

**Problems**
- **The same 2,900px scroll the coach Settings had**, no section nav or search; Notifications and reminders
  are at the bottom.
- The signed-out sample shows "Log out" beside the bar's "Log in".
- Several save models (per row Edit, per toggle, per form).

**Data check**
| Figure / list | Source | Status | Freshness |
|---|---|---|---|
| Profile fields | `user_goals` + `profiles` (shapeDb) | WIRED | on save |
| Appearance | `useDashPaper` → account + `localStorage` mirror | WIRED | instant |
| Plan & billing | `/api/stripe/subscription`, `/api/stripe/billing-portal` | WIRED | page load |
| Connected apps | `/api/integrations/status`, `/disconnect` | WIRED | page load |
| Preferences, health profile | `user_goals`, `/api/client/checkin-kit` (health) | WIRED | on save |
| Reminders | `/api/client/reminders` + cron `/api/cron/reminders` (5 min) | WIRED | on save |
| Notifications | `notification_preferences` | WIRED | on toggle |
| Export, delete | `/api/account/export`, `/api/account/delete` | WIRED | on request |

**Direction** (fixed layout): the coach Settings answer: **two panes with a section nav and search**, each
group's one-line status, **one floating save bar**, and coaching plans with their prices here (moved from
Team).

---

## Cross-cutting

**XC1 · Direction before data.** Every member page opens on a sentence that says what to do or where you
stand, attributed: the engine ("Shape's read"), a coach override ("Set by Rae"), or Nora. One route
(`GET /api/client/directive`) gives the website what the app already shows. The app's Home is the model
(`iosAppBroadsheetClient.jsx:4056-4160`: the deck, "Your move", the morning panel, Team).

**XC2 · One question per block, six on the first screen.** Today goes from ~12 blocks over 2,100px to six in
900px. Progress, Score and Habits shed duplicate figures (streak and "workouts this week" are on four tabs
today).

**XC3 · The board stays, its chrome shrinks.** Seven tabs already run on DashGrid (`dashGrid.jsx:856`,
layouts saved to `user_goals` `dashboard_layout` per tab, named dashboards). Keep it; replace the toolbar row
and help line with one quiet Customize key (the coach Today has the same), and show the catalog as
"＋ Add a widget" under the board. Tool tabs (Library, Team, Profile, Settings) stay fixed.

**XC4 · Colour that means something.** Teal is the member's accent (members have no role colour). Coaches are
rust and gold everywhere. Kinds of thing in a day (training coral, meals lime, a coach call in the coach's
colour, check-in indigo, habits violet, water cyan) and macros in the live ledger's order (teal, blue,
tangerine, pink). The member is mint, as coaches see them. Status is always a labelled chip.

**XC5 · One persona, one set of numbers.** The demo data disagrees with itself on streak, program, targets,
next session, goal, PRs and weekly score (table in `clientmock/BRIEF-client.md`). Before building, make
`DCL_DEMO`, `DPR_DEMO`, `DTR_DEMO`, `DNU_DEMO`, `CT_DEMO_COACHES`, the profile demo and the Score literals
read from one member fixture built on the engine's Priya S. record (`dashSignals.js:1148`), as the coach
side did for its roster.

**XC6 · Design the empty states.** Real members only ever see live data or empty states (the preview is
behind the Login gate). A member with no coach, no plan, nothing logged today should get a direction too
("Pick a plan: starter programs, or Nora drafts a week"), never "0/5", demo targets or a fake unread.

**XC7 · Say where things happen.** Logging a workout and the Morning check-in live in the app. Replace the
Start / Log workout buttons with "Send to my phone" (or a QR), and keep one clear "in the app" door, instead
of buttons that loop back to Workouts.

**XC8 · Type and contrast.** No text under 10px (Today has 29 labels at 7–9px). Kit AA: the coach kit's dark
`--ink3` reads 4.32:1 on the dark card; the member kit raises it to 4.9:1 (`clientmock/kit.css`, last block);
worth taking into the coach kit.

**XC9 · Phone.** The rail turns into a tab strip (fine). Fix: the board toolbar (~300px), the Nutrition week
strip stacking into 1,100px, and the demo band covering the Nora button.

**XC10 · The app already solved these, borrow them.**
| Website tab | App counterpart that already answers it |
|---|---|
| Today | Home: the deck (Shape Radio, the climb to goal, This week as five bars a day), "Your move", the morning panel (check-in, water, habits), Team card per coach, Shortcuts (`iosAppBroadsheetClient.jsx:4056-4180`) |
| Nutrition | Eat: Fuel left, the plan sheet and morning swap (`BSPlanDay.jsx`), night-before prep (`prepAhead.mjs`), own day plans (`mealDays.mjs`) |
| Team | Home's Team card (notes from `coach_focus_banners`, today's session on the trainer, food left on the nutritionist) |
| Progress / Goal | Home's climb (`BSHomeClimb`, `BSHomeDeck.jsx:70`), Your mornings (`BSYourMornings.jsx`) |
| Library | coach-pushed items (`ShapeCoachFeed`) |
| Score | the profile's tier progress; Home shortcut "Points and tier" |

---

## Bugs (verified in code)

| # | Bug | Where | Effect |
|---|---|---|---|
| **B1** | Team and Today show an **unconfirmed request as the next session**. The route returns requested + confirmed as `next`; the page's own comment says NEXT and the count mean confirmed only. | `src/app/api/client/team/route.ts:77`, `:86-89` → `public/newdesign/clientTeam.jsx:262`, `:346`, `:413` (comment at `:428-432`); also `src/app/api/client/dashboard/route.ts:151` → `dashClient.jsx:801` | A member thinks a session is booked that the coach hasn't accepted; "Sessions coming up" is inflated after a reload. |
| **B2** | **Goal reads the oldest 104 weigh-ins** (ascending + limit), the defect the dashboard and progress routes already fixed. | `public/newdesign/dashGoals.jsx:359` (fix pattern: `src/app/api/client/dashboard/route.ts:180`) | A daily logger's goal "current" and projection freeze after ~3 months. |
| **B3** | **A failed meal log still shows ✓ Logged** and moves the ledger: no `res.ok` check, `.catch(() => {})`; the ✓ lives in `localStorage` per device. | `public/newdesign/dashClient.jsx:751-764` | Lost logs look saved; another device or the app never shows the ✓; a reload snaps the ledger back while the ✓ stays. |
| **B4** | **Demo targets fill a live member's targets.** A plan day with calories but no protein gets 175 g; Nutrition falls back to 2,200 / 175 / 240 / 70 when a day has none. | `dashClient.jsx:739`; `dashNutri.jsx:294` | A member is measured against numbers nobody set. |
| **B5** | **Consistency invents 5 planned workouts a week** and adds sessions to food-logged days as "wins". | `dashClient.jsx:777`, `:782`, `:906` | "0/5" for a member who never planned five; a "wins" figure in no unit. |
| **B6** | **Today's team unread badge reads the demo chat threads**, matched by first name. | `dashClient.jsx:88-96`, `:963` (data: `clientChatThreads.jsx:8`, `:175`) | A live member whose coach is called Rae sees a fake "1"; everyone else always 0. |
| **B7** | **"Tonight's workout · NOV 6"**: the next session on another day is labelled tonight. | `dashTrain.jsx:791` → `dashClient.jsx:167` | A member thinks Friday's session is tonight. |
| **B8** | **Library's Search, Saved (14) and cards do nothing**; signed in, the page is always empty. | `clientLibrary.jsx:43-44`, `:75`, `:25-26` | A whole tab of dead ends. |
| **B9** | **Member-planned meals use the server's clock**, not the member's day. | `src/app/api/client/nutrition/route.ts:115-116` | On a UTC server, a US member's planned meals for today vanish in the evening (they read tomorrow's). |
| **B10** | Progress's **demo milestones are another client's** (`buildMockClients()[0]` is Jordan M.). | `dashProgress.jsx:1271` | Demo only: "5k under 25:00" and "100th workout" under Priya, while Today says workout #100 is 14 away. |
| **B11** | **Adding a habit uses `window.prompt` and `window.confirm`.** | `clientHabits.jsx:47`, `:50` | Browser pop-ups, a yes/no "WORK habit?" question with no explanation. |
| **B12** | Today's demo goal pace "Aug 3" is a hard-coded past date. | `dashClient.jsx:64` | Demo only. |
| **B13** | Score's demo breakdown sums to 1,404 under 1,284; three tabs show three weekly gains. | `clientScore.jsx:191-206`, `:427`; Today `dashClient.jsx:32`; Profile `livingShared.jsx` | Demo only, but it's what reviewers see. |
| **B14** | **Saved recipes is always empty for live members**: no store exists. | `dashNutri.jsx:305` | A widget that can never fill. |

Also noted, not bugs: Workouts' "not written yet" eyebrow carries an existing 🔒︎ (`dashTrain.jsx:252`;
the house rule leaves existing emoji). `/api/client/nutrition` and `/api/client/train` keep comments saying
the plan / schedule "intentionally absent" (`nutrition/route.ts:3-4`, `train/route.ts:4-6`) that the plan
route now covers; stale comments.

---

## Owner decisions this review raises
1. Should a member's own directive include nutrition flags (protein, calories over), or only when they have no
   nutritionist? Today only the nutritionist hears them (`dashSignals.js:868-871`).
2. Should a coach's "reviewed / replied" on a weekly check-in be shown to the member (needs a field)?
3. Library: build it from coach-pushed items and Kitchen, or hide the tab until a real library exists?
4. Can the website start a workout (a web logger), or is "Send to my phone" the answer?

---

## Suggested build order
1. **The member fixture and the six data bugs that lose or invent data** (B1, B2, B3, B4, B5, B6), small
   separate pull requests; B9 with them (server clock).
2. **`GET /api/client/directive`** (server-built record + `computeDirective` + override), and the coach note
   and pushed items read for the website (a route over `coach_focus_banners` / `coach_pushed_items`).
3. **Today as the lean board** (`clientmock/today-v1.html`): six widgets on the existing DashGrid, the
   toolbar collapsed to Customize, the catalog row.
4. **Nutrition and Workouts:** Fuel left + meal timeline + prep (port `prepAhead.mjs` or add a route);
   Workouts' next-session card with Send to my phone and the program strip; fix B7.
5. **Team as "what's pending"** (notes, unread, waiting questions, confirmed vs requested), then Library from
   pushed items + Kitchen (fix B8 or hide the tab).
6. **Progress, Goal, Score, Habits as boards** with a verdict on top and lean defaults; B11 inline add.
7. **Settings** (two panes, nav, search, one save bar) and **Profile** (as-others-see-it, privacy line).
