# Website and app: do they fully communicate?

This is read-only research, done on 2026-11-05 against the working tree; nothing under
`/home/user/shape-app` was changed. Paths are repo-relative. `$S` is the scratchpad.

The owner's asks:
- "the website and app need to fully communicate";
- "clients workouts and programs should automatically get sent to app… they shouldnt have to manually
  push send to phone".

The goal: anything a coach or member does on one surface shows up on the other, correctly and quickly,
from the same source of truth, under the same rules.

This file builds on the earlier helpers' reports and doesn't redo them. It cites them where it relies
on them:
- `wiring/engine.md`: which reader can fire which flag (§3), and the app-fed push (§2c);
- `wiring/builders.md`: the two drafting engines;
- `wiring/client-audit.md`: bugs B1–B14 and the website member gaps;
- `wiring/coaching.md`: the freshness model;
- `wiring/shared-and-notifications.md`: the bell (B4), shared clients and the notices;
- `build/PLAN.md`: packages P1–P6.

**Verdicts**
- **IN SYNC**: one source and one set of rules, and each side shows the other's change the next time
  the page or screen is opened.
- **LAGS**: same source and rules. But when another person acts (coach → member, member → coach, a
  message, a notice), the side looking at it doesn't refresh while it stays open, so they see it late.
  - Every website page reads once per load. The member pages have no focus refresh. So a page left
    open goes stale whatever the feature.
  - That baseline is noted once here. Rows are marked LAGS only where the cross-person delay is the
    normal way the feature is used.
- **DIVERGES**: different stores, or the same store under different rules, so the two surfaces can show
  different things for the same account.
- **ONE-SIDED**: only one surface can do it or see it.

---

## Summary

**74 features checked: 25 IN SYNC · 8 LAGS · 21 DIVERGES · 20 ONE-SIDED.**

| Area | Rows | IN SYNC | LAGS | DIVERGES | ONE-SIDED |
|---|---|---|---|---|---|
| A · Workouts and programs | 11 | 3 | 1 | 3 | 4 |
| B · Meals, swaps, prep, day plans, grocery | 9 | 2 | 1 | 4 | 2 |
| C · Food, water, weigh-in and body logs | 5 | 3 | 0 | 2 | 0 |
| D · Check-ins | 3 | 0 | 1 | 0 | 2 |
| E · Habits, goals, Score | 8 | 3 | 0 | 5 | 0 |
| F · Sessions and bookings | 6 | 1 | 1 | 1 | 3 |
| G · Messages | 5 | 0 | 2 | 1 | 2 |
| H · Notifications | 4 | 2 | 1 | 1 | 0 |
| I · Coach notes, banners, pushed items, engine | 5 | 1 | 0 | 1 | 3 |
| J · Playlists | 3 | 1 | 0 | 1 | 1 |
| K · Settings and profile | 6 | 3 | 0 | 1 | 2 |
| L · Integrations | 4 | 2 | 0 | 1 | 1 |
| M · Nora | 4 | 3 | 1 | 0 | 0 |
| N · Shared clients | 1 | 1 | 0 | 0 | 0 |
| **All** | **74** | **25** | **8** | **21** | **20** |

**The good news.** The writers are mostly shared.
- Workouts:
  - Both coach surfaces publish through the same gated week boundary. The website uses
    `/api/trainer/workout` and the app `/api/trainer/week`, and both run `publish_client_week`.
  - Both use the same update-future flow.
  - Both members read the same `/api/client/plan`.
- Meal plans, sessions, weekly check-ins, habits, Score, member settings, notification switches, the
  bell, private coach notes and Nora's thread each have one store on both sides.
- The repo already has the pattern for shared logic:
  - `public/newdesign` modules imported by the app: `dashSignals.js`, `settingsSync.mjs`,
    `mealPrep.mjs`, `profileCustom.mjs`;
  - mobile modules imported by server routes: the self-training route, and the prep cron importing
    `mealDays.mjs`.

**The answer to the owner's "automatically sent to app" ask.** It already is, with three caveats.
- Every publish writes `client_workouts` and inserts a `workout` notice, "Your week from your coach"
  (`supabase-migrations/2026-10-18-coach-access-past-due.sql:1161`). That covers the website builder,
  the app, Nora and update-future.
- A meal plan inserts a `meal_plan` notice (`src/app/api/nutritionist/meal-plan/route.ts:107-123`).
- No code path needs a "send to phone" step. The only "Send to their phone" label is the Live Console's
  focus banner, a different feature (`public/newdesign/TrainerLiveConsole.html:522-544`).
- Why it can look manual:
  1. Device push still waits on the owner's APNs and Firebase keys (#2385).
  2. An app already open doesn't re-read. Home reads the plan once per mount
     (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:3457-3468`). Train and Eat re-read only
     when they remount (`:5188-5206`, `:11398-11412`). Nothing refreshes on foreground, and
     `client_workouts` isn't in Supabase realtime.
  3. The client-audit proposed a **"Send to my phone"** button on the member website's Workouts
     (XC7). Given this ask, call it "Open in the app" or a QR code, so it doesn't suggest a manual
     send.

**The top problems, ranked by how much a user would notice**

1. **Engine alerts run on the app's last snapshot, not on live data.**
   - Who gets alerts:
     - The app posts a roster or self record to `/api/ai/notify` at most every 30 minutes, on open
       (`mobile-app/src/services/shapeBackend.js:10034-10069`).
     - The cron then re-runs that frozen snapshot hourly for 14 days
       (`src/app/api/ai/notify/cron/route.ts:1-12`, `:25`).
     - So a coach or member who only uses the website gets no red/amber or directive pushes.
   - Wrong alerts:
     - A member who logs food, checks in or weighs in on the website can still be pushed
       "No food logs in 4 days" or "Check-in due". The snapshot never saw the website's write.
   - P2 covers website-only **coaches**. It doesn't cover members, or refreshing the snapshot when
     someone writes.
2. **Messages disagree on what's read.**
   - Website member chat:
     - It never calls `mark_conversation_read`, so reading a thread on the website leaves the app's
       unread badge up.
     - It shows `unread: 0` for every live thread (`public/newdesign/chatWidget.jsx:1423`, `:1441`).
     - It polls only the open thread, every 8 seconds, while the panel is open (`:2237`).
   - The coach website Messages pages:
     - They read once at mount and never poll.
     - A failed send is treated as sent: no `res.ok` check, `.catch(() => {})`
       (`public/newdesign/TrainerMessages.html:143-150`, same in `NutritionistMessages.html:148`).
   - The app has realtime, unread counts and read receipts (`shapeBackend.js:8613-8668`, `:8689`).
3. **Meal swaps and "✓ Logged" live on one device.**
   - Website swaps are in `localStorage` under two different keys, one on Today and one on Nutrition
     (`public/newdesign/dashClient.jsx:214-228`, `:894`; `dashNutri.jsx:365`).
   - The app keeps swaps in the account (`user_goals` `client_meal_swaps`,
     `iosAppBroadsheetClient.jsx:11274`, `:13169`). The night-before prep cron reads that too
     (`src/app/api/cron/prep-reminders/route.ts:253`, `:289`).
   - "✓ Logged" is per device on the website (B3, `dashClient.jsx:748-764`) and per session in the
     app (`iosAppBroadsheetClient.jsx:3493`).
4. **Assigned work is automatic, but neither side refreshes while open** (above). It's the most
   visible case of the "loads once" problem the owner already saw on the coach website.
5. **A member's own meal plan for a day has two stores, and one is read by nobody.**
   - The website's recipe "Add to today's plan" writes `client_planned_meals`
     (`public/newdesign/recipeDetailPage.jsx:170-181`).
   - Its only reader is `todayMeals` in `/api/client/nutrition` (`route.ts:113-125`), and no screen
     on either surface reads `todayMeals`.
   - The app's day plans live in `user_goals` `client_meal_days` (`mobile-app/src/services/mealDays.mjs`).
     The website never reads them.
6. **Website members don't see what their coach sends them outside the plan.** This is the
   client-audit's finding, confirmed:
   - the coach's note (`coach_focus_banners`);
   - pushed exercises and meals (`coach_pushed_items`);
   - the directive ("your move").

   The app reads all three, with realtime for the first two (`shapeBackend.js:10077-10140`).
7. **Coaches review logged workouts only in the app, and the review never reaches the member.**
   - Finish ratings (`session_rpe`, enjoyment) and the review page are app-only
     (`mobile-app/src/broadsheet/BSWorkoutReview.jsx:16-17`, `:87-95`).
   - `/api/coach/review-note` has no website caller.
   - A note marked for the client is written to `coach_workout_review_notes`, but no member screen on
     either surface reads it, and no notice goes out.
8. **Score earns differently by surface.**
   - A meal logged on the website gets no +10: only the app calls `award_meal_log`
     (`shapeBackend.js:7189`).
   - A website weigh-in never runs `award_my_goal_milestones` (`:7227`, app only).
   - Momentum bonuses are app-only (`:7402`).
   - The website can't log workouts, so it never earns `award_workout_session`.
9. **WHOOP, Strava and Oura data arrive only when the app opens.**
   - The `/sync` routes are called only by the app (`shapeBackend.js:4218-4365`).
   - No cron pulls them (`vercel.json`). Only Garmin has a webhook.
   - A website-only member who connects WHOOP gets nothing. A coach sees recovery only as fresh as
     the member's last app open.
10. **Habit reminders turned off on the website keep firing on the phone.**
    - The phone's reminder is a local notification. It's scheduled only when the reminder is set in
      the app (`shapeBackend.js:9771-9813`), and never reconciled on start.
    - The website's switch updates `habit_reminders.enabled` only (`public/newdesign/clientMeSettings.jsx:1130-1135`).
11. **Sessions are split.**
    - Only the website lets a member ask their own coach for a session (`/api/sessions/request`,
      `public/newdesign/clientTeam.jsx:117-128`).
    - Only the app lets a member cancel or move one, or join the call
      (`iosAppBroadsheetClient.jsx:26550`, `:26588-26609`).
    - The coach website's Today uses the server's clock while the app's uses the device's zone (P1).
12. **The coach tools are split between surfaces.**
    - Website only: tuned flag thresholds (the app ignores them), check-in "reviewed" ticks,
      "programmed this week", pins.
    - App only:
      - Adjust/Tune a program;
      - phases and nutrition targets;
      - commitments and waiving penalties;
      - Nora's ✦ DRAFT reply;
      - grocery lists;
      - the workout review.
13. **One goal gets three different paces and two "primary goals".**
    - The website Goal and the app Goals page fit the last 56 days (`dashSignals.js:70`). But the
      website reads the *oldest* 104 weigh-ins (B2, `dashGoals.jsx:359`).
    - App Home's climb fits the last 28 days to today (`mobile-app/src/services/homeWeek.mjs:213-241`).
    - The primary goal is two fields: `client_goals.primaryGoal` in the app, and
      `client_training_prefs.primary_goal` in website Settings (`warroom.ts:2734`).
14. **The website profile editor can overwrite app edits.**
    - It saves the document as it was when the editor opened, plus its own edits, as a blind upsert
      (`public/newdesign/livingDesktop.jsx:1521-1567`).
    - The app re-reads the stored document and merges onto it (`BSMakeItYours.jsx:1726-1745`).
    - A studio, kitchen or look change made in the app while the website editor is open is lost.

---

## A · Workouts and programs

| Feature | Website (read · write) | App (read · write) | Source and rules | Freshness (web / app) | Device-local | Verdict |
|---|---|---|---|---|---|---|
| A1 Coach assigns a week or a program → member sees it | **Write:** `dashBuilder.jsx:1705` → `/api/trainer/workout` (merges into the week, then `publishMergedWeekForClient`). **Read (member):** `/api/client/plan` (`dashData.jsx:554`, `dashTrain.jsx:9`) | **Write:** `iosAppBroadsheetPros.jsx:3324` → `ShapeAssign.week` → `/api/trainer/week` (`shapeBackend.js:1895-1983`), offline queue drained on `online` and on sign-in (`:1995-2062`). **Read:** `ShapePlan.get` → `/api/client/plan`, 60 s cache (`:5218-5230`, `:5981`) | **Same** table (`client_workouts`), same publish function (`publish_client_week`, which inserts the `workout` notice). One gate (§9.4). | Web: page load (60 s module cache). App: Home once per mount; Train re-reads with the cache invalidated on mount (`iosAppBroadsheetClient.jsx:5188-5206`); no foreground refresh, no realtime | App offline queue (`shape.assignQueue`), by design | **LAGS** |
| A2 Edit a template, then update clients' future workouts | `dashBuilder.jsx:1635-1642`: `/api/coach/plans/assignments` preview → `/api/trainer/workout` with preconditions | `BSWorkoutFutureUpdates.jsx:24-36` → `shapeBackend.js:6944-6962`, same two routes | **Same**: one preview and one merge; a logged workout refuses (`week-publish-server.ts`, code 55000) | On action | none | **IN SYNC** |
| A3 Program library and the workout builder | `/api/coach/plans` (`coach_plans`, `detail.builder`); refreshes on focus (`dashBuilder.jsx:3081`) | `ShapeCoachPlans` → `/api/coach/plans` (`shapeBackend.js:6907-6942`) | **Same** store. The editors differ in fields: a move's equipment and `plannedMinutes` are app-editor only (`warroom.ts:1430`; builders.md) | Web: focus. App: on mount | none | **IN SYNC** (field gaps noted) |
| A4 Tune or Adjust a client's program (intensity, sessions, weeks, days) | none | `BSProAdjust.jsx:266-371` → `/api/trainer/adjust` (gated regeneration) | One route, but only the app calls it | — | none | **ONE-SIDED (app)** |
| A5 Training and nutrition phase, nutrition targets, the coach's directive override (`client_programs.detail`) | Read only (overview, `dashGoals.jsx:352`). The override has no UI anywhere (engine.md §4) | `ShapeProgramApi.set` → `set_program_detail` (`shapeBackend.js:6424-6496`), from Adjust and the case file (`iosAppBroadsheetPros.jsx:3993`) | Same row. Writers: app coach, the member's own phases, Nora's `set_program_detail`. The website coach can't edit it | Page load / on mount | none | **ONE-SIDED (app)** |
| A6 Member builds their own week (no trainer) | `/api/client/self-training` (`dashTrain.jsx:320`, `:420`) | Direct RLS inserts (`shapeBackend.js:2064-2160`) | **Same** rows, **same rules**: the route imports the mobile builder modules, so the row shape can't drift (`self-training/route.ts:1-5`) | On save | none | **IN SYNC** |
| A7 Member logs a workout | None: "Log sessions in the app" (`dashTrain.jsx:900`); three buttons loop back (client-audit, dead-end loop) | `saveWorkoutSessionLog` → `save_workout_session` + `award_workout_session` (`shapeBackend.js:3331-3498`, `:3053`) | — | — | App's in-progress session drafts | **ONE-SIDED (app)**. Owner decision open (client-audit Q4) |
| A8 What the member sees of a logged session (sets, ratings, coach notes) | `/api/client/train` (set logs, average RPE; not `session_rpe`, not enjoyment, not coach notes; `train/route.ts:65`, `:221`) | The member app has no reader of coach review notes; `listWorkoutSessions` (with notes) is used only by the coach review (`BSWorkoutReview.jsx`) | Different reads of the same rows. Neither surface shows the member the coach's note marked for them | Page load / on mount | none | **DIVERGES** (and a gap on both) |
| A9 Coach reviews a logged session (ratings, review note) | none: `/api/coach/review-note` has no website caller | `BSWorkoutReview.jsx` (ratings `:87-95`), `addCoachReviewNote` (`shapeBackend.js:3287`) | Only the app | — | none | **ONE-SIDED (app)** |
| A10 Nora drafts a workout or program | `/api/ai/draft-workout`, `kind: "day"` only (`dashBuilder.jsx:1304`) | ＋ New → `/api/ai/generate-plan` (text outlines, `iosAppBroadsheetPros.jsx:6069`, `:7224`) | **Two engines** (builders.md, Summary) | — | none | **DIVERGES** → P6 |
| A11 The playlist on a workout card | Card chips "♪ name · meta" (`dashTrain.jsx:104`) | Name only, no link (`BSTrainDay.jsx:86-91`) | Same `payload.playlist`; the URL and provider aren't carried (coaching.md) | Page load / on mount | none | **DIVERGES** → P5 |

## B · Meals, swaps, night-before prep, day plans, grocery

| Feature | Website (read · write) | App (read · write) | Source and rules | Freshness (web / app) | Device-local | Verdict |
|---|---|---|---|---|---|---|
| B1 Nutritionist assigns a meal plan → member sees it | **Write:** `dashMealBuilder.jsx:423` → `/api/nutritionist/meal-plan`. **Read:** `/api/client/plan` (`dashNutri.jsx:8`) | **Write:** `iosAppBroadsheetPros.jsx:3221` → the same route (`shapeBackend.js:6003`). **Read:** Eat via `ShapePlan.get` (`iosAppBroadsheetClient.jsx:11398-11412`) | **Same** (`client_meal_plans`); a `meal_plan` notice on every publish (`meal-plan/route.ts:107-123`) | Same as A1 | none | **LAGS** |
| B2 Meal-plan editors and documents | Lists only its own documents (`detail.mealBuilder`); own dish, rest-day and travel-day versions | Edits programs and diets the website can't open; no own dish or rest/travel versions; Assign uses Mon/Wed/Fri at portion 1 | Same `coach_plans`, different document shapes (`warroom.ts:774-775`) | — | none | **DIVERGES** → partly P6 (Kitchen search, template id, Assign follows training days) |
| B3 Meal swaps | `localStorage` `shape.dashMealSwap.<date>` (Today) and `shape.dashNutriSwap.<date>.<dow>` (Nutrition) (`dashClient.jsx:214-228`, `:894`; `dashNutri.jsx:365`) | `user_goals` `client_meal_swaps`, by meal title (`iosAppBroadsheetClient.jsx:11274`, `:13169`) | **Different stores.** The prep cron reads only the app's (`prep-reminders/route.ts:253`, `:289`), so a website swap also misleads tonight's reminder | Web: instant, this device only | **Website: all of it** | **DIVERGES** |
| B4 "✓ Logged" on a planned meal | `localStorage` `shape.dashMealLog.<date>`; a failed POST still ticks (B3, `dashClient.jsx:748-764`) | React state "logged this session" (`iosAppBroadsheetClient.jsx:3493`) | Neither stores which meal was logged; only the macros reach `daily_health_snapshot` | — | Website per device; app per session | **DIVERGES** |
| B5 Member's own day plan ("on Tuesday I'm having the oats") | Recipe "Add to today's plan" → `/api/client/planned-meals` → `client_planned_meals` (`recipeDetailPage.jsx:170-181`), falling back to `localStorage` on failure. Read by `todayMeals` (`nutrition/route.ts:113-125`), which **nothing renders** | `user_goals` `client_meal_days` (`mealDays.mjs`), read by Eat and the prep cron | **Two stores**, neither shown on the other surface; B9 (server clock) on the website's | — | Website fallback in `localStorage` | **DIVERGES** |
| B6 Night-before prep and the morning swap | none (client-audit: DERIVABLE) | `prepAhead.mjs:188`, `:307`; `bsLoadPrepTonight` (`iosAppBroadsheetClient.jsx:10965-10990`); hourly cron push | One rule module for the app and the cron | — | none | **ONE-SIDED (app)** |
| B7 Prepped records ("PREPPED ✓") | Read via the shared `mealPrep.mjs` (`ClientApp.html:115-116`, `dashNutri.jsx:255-372`) | Read and written (`shapeBackend.js:7348-7398`) | **Same** document (`user_goals` `meal_prep`), **same module** | Page load / on mount | none | **IN SYNC** |
| B8 Coach grocery lists and sending them | none (`warroom.ts:2203`: "sent and saved in the app only") | `coach_grocery_lists` CRUD, `notify_grocery_list`, push via `/api/nutritionist/console` (`shapeBackend.js:6716-6772`) | — | — | none | **ONE-SIDED (app)** |
| B9 Member grocery lists | `ClientGrocery.html` syncs `localStorage` with `user_goals` `client_grocery_lists` (`:106`); the recipe page writes the local list (`recipeDetailPage.jsx:60-74`) | `client_grocery_lists` (`iosAppBroadsheetClient.jsx:12325`) | **Same** document through a shared store | On page load | A local mirror until ClientGrocery syncs | **IN SYNC** |

## C · Food, water, weigh-in and body logs

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| C1 Food log (macros) | `/api/nutrition/meal-log` with no `res.ok` check (`dashClient.jsx:759-763`); no award | `logMealMacros` → the same route, plus `award_meal_log` +10 (`shapeBackend.js:7170-7196`) | Same snapshot (`add_meal_macros`); **different award** | Ledger optimistic on both | B4 | **DIVERGES** |
| C2 Water | `/api/client/hydration` (`dashClient.jsx:330`, `:361`) | Same route (`shapeBackend.js:7199-7221`) | **Same** | Optimistic, the server answer wins | none | **IN SYNC** |
| C3 Weigh-in | `client_weigh_ins` upsert, error swallowed (`dashGoals.jsx:520`); reads the *oldest* 104 (B2, `:359`); no milestone award | `logWeighIn` (`shapeBackend.js:7142-7166`), then `award_my_goal_milestones` (`BSGoals.jsx:1333-1366`, `shapeBackend.js:7227`) | Same table; **different award** and a different read window | On save | none | **DIVERGES** |
| C4 Measurements and progress photos | `/api/client/checkin-kit`, `/api/client/progress-photos` | `client_measurements` direct; the same photos route (`shapeBackend.js:7832-7870`) | **Same** | Page load | none | **IN SYNC** |
| C5 Cycle | `cycle_events`, `cycle_set_settings` (`dashProgress.jsx:693-770`) | Same RPCs and table (`shapeBackend.js:7244-7330`) | **Same** | Page load | none | **IN SYNC** |

## D · Check-ins

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| D1 Weekly check-in: member submits, coach reads | Member: `/api/client/checkin-kit` POST, the local day's Monday (`dashProgress.jsx:559-562`; `checkin-kit/route.ts:70-87`). Coach: overview `get_client_checkins` on Week and the client page | Member: direct `client_checkins` upsert, the device's Monday, `award_checkin_points` (`shapeBackend.js:7802-7822`). Coach: `get_client_checkins` | **Same** table, week rule and award | Coach website Week/Today read once (P1 adds focus refresh); app on open | none | **LAGS** → P1 |
| D2 Coach marks a check-in reviewed, and replies | "Mark reviewed" → `user_goals` `coach_week_reviews` (`dashData.jsx:914`, `dashWeek.jsx:12`); the reply is a template (`dashToday.jsx:364-389`) | No reviewed state. ✦ DRAFT reply by Nora (`/api/ai/draft-message`, `iosAppBroadsheetPros.jsx:3626`) | Split. The member sees neither (client-audit Q2) | — | none | **ONE-SIDED (split)** |
| D3 Morning check-in | A pointer card only (`dashClient.jsx:387`) | `/api/client/checkin` (`shapeBackend.js:5896-5905`) | App only, by ruling (owner, 2026-10-20). The coach website doesn't map its energy and hunger into flags (engine.md §3) | — | none | **ONE-SIDED (app)**; the coach half → P2 |

## E · Habits, goals, Score

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| E1 Habits and today's ticks | `/api/client/habits` (`habits.jsx:46`, `:63`) | Same route (`shapeBackend.js:7560-7573`) | **Same**, `award_habit` server-side | Web: load, plus a re-read only when the day rolls (`habits.jsx:52-57`) | none | **IN SYNC** |
| E2 Habit reminders | Toggle `habit_reminders.enabled` only (`clientMeSettings.jsx:1130-1135`) | Set → table + a **local notification** on the phone (`shapeBackend.js:9771-9813`); no reconcile on start (only `iosAppBroadsheetHabits.jsx:177`, `:980`) | Same table; the phone's schedule is device state | — | **App: the scheduled notification** | **DIVERGES** |
| E3 Goals document and "share with coaches" | `user_goals` `client_goals` (`dashGoals.jsx:334`, `:442-458`) | Same (`BSGoals.jsx:1389-1429`) | **Same** document. With no document at all, the app shows "not shared" while the RPC treats it as shared (`BSGoals.jsx:102`; `2026-06-13-client-weigh-ins.sql:60-64`). Edge case | Page load / on mount | none | **IN SYNC** |
| E4 Goal pace and projected date | `DashSignals.projectGoal` (56-day fit) over the oldest 104 weigh-ins (B2) | Goals page: the same engine (`BSGoals.jsx:309-311`). Home's climb: `bsHomeGoalRead`, a 28-day fit to today (`homeWeek.mjs:213-241`, `BSHomeDeck.jsx:109`) | **Three readings** of one goal | — | none | **DIVERGES** |
| E5 Primary goal | Settings → `client_training_prefs.primary_goal` (`settingsSync.mjs:14`) | `client_goals.primaryGoal` (`BSGoals.jsx:1395-1399`) | **Two fields** (`warroom.ts:2734`) | — | none | **DIVERGES** |
| E6 Score total, tier, ledger | `/api/client/score`, `/score-record` (`clientScore.jsx:135`, `:231`) | Same routes | **Same** | Page load | none | **IN SYNC** |
| E7 What earns points | Habits, check-in, steps and sleep (`globalChatButton.js`) | Also meal log +10, goal milestones, momentum, workout (`shapeBackend.js:3498`, `:7189`, `:7227`, `:7402`) | Awards are fired from the **client**, so the rules depend on the surface | — | none | **DIVERGES** |
| E8 Weekly commitment | `/api/client/commitment`: UTC week bounds for activities (`route.ts:26-36`). The coach can't propose one or waive a penalty | Progress computed in the app on the local week (`shapeBackend.js:7728-7745`). The coach can propose one and waive penalties (`:6878-6905`) | Same `score_commitments`; **duplicated progress logic** with different windows; coach tools app-only | Page load | none | **DIVERGES** |

## F · Sessions and bookings

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| F1 Intro consult | `/api/consultation` | `/api/consultation` (`shapeBackend.js:1502-1553`) | **Same** route, hours and rules | On request | none | **IN SYNC** |
| F2 Member asks their own coach for a session | Team → Book → `/api/sessions/request` (`clientTeam.jsx:117-128`) | No caller of `/api/sessions/request`; the app has the intro, paid one-time checkout (`iosAppBroadsheetClient.jsx:17784`) and "Ask for a time" for unclaimed listings only | — | — | none | **ONE-SIDED (web)** |
| F3 Coach confirms, declines, reschedules or books | `dashSchedule.jsx:1888` → `/api/sessions/manage` | `iosAppBroadsheetCalendar.jsx:907`, `shapeBackend.js:5672-5713` → the same route | **Same**. (`updateSessionStatus`, a direct table update, is exported but unused: `shapeBackend.js:1462`) | Web: each month read once; requests appear on reload (coaching.md). App: on open | none | **LAGS** → P1 (focus refresh on Schedule) |
| F4 Member cancels or moves a session | none (the member website has no session actions) | `iosAppBroadsheetClient.jsx:26550` → `/api/sessions/manage` | Only the app. A member cancel tells the coach nothing (shared-and-notifications B1) | — | none | **ONE-SIDED (app)**; the notice → P5 |
| F5 Call link (Join) | Coach Schedule shows it (`dashSchedule.jsx:1274`); the member website doesn't (client-audit, Team) | Member and coach (`iosAppBroadsheetClient.jsx:26588-26609`, `iosAppBroadsheetCalendar.jsx:1030-1036`) | Same `meeting_url` | — | none | **ONE-SIDED (app, for members)** |
| F6 The coach's "Today" sessions | `/api/{role}/dashboard`, on the server's clock (`dashData.jsx:576`; coaching.md bug 1) | `/api/calendar` with the device's zone (`iosAppBroadsheetPros.jsx:1157`) | Same rows, **different day boundary** | Web: page load | none | **DIVERGES** → P1 |

## G · Messages and the care-team thread

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| G1 Coach ↔ client thread: delivery | Member: the chat bubble polls the **open** thread every 8 s while the panel is open (`chatWidget.jsx:2225-2238`); the thread list loads when the panel opens. Coach: `TrainerMessages.html` / `NutritionistMessages.html` read once at mount (`:83`), never poll; **a failed send looks sent** (`:143-150`) | Realtime `messages` inserts (`shapeBackend.js:8423`), a re-read on visible (`iosAppBroadsheetClient.jsx:25330-25344`) | **Same** tables | Web member: 8 s while open. Web coach: page load. App: live | Website optimistic rows | **LAGS** (plus the website send bug) |
| G2 Unread and read state | No unread for live threads (`chatWidget.jsx:1423`, `:1441`); **never calls `mark_conversation_read`**; no receipts or typing (`warroom.ts:1196`) | `dm_unread`, `channel_unread`, `mark_conversation_read`, `conversation_seen`, typing (`shapeBackend.js:8613-8800`) | Same tables; **the website never writes read state** | — | none | **DIVERGES** |
| G3 Care-team (coach ↔ coach) thread | Opens in the chat bubble (`pageShell.jsx:556`) | `openCoachCoachThread` (`shapeBackend.js:6800`) | **Same**, private to coaches | As G1 | none | **LAGS** |
| G4 Voice notes, replies, receipts, typing, grocery cards | Words only, no replies, no grocery card (`warroom.ts:1164`, `:1266`, `:2203`) | All of them | — | — | none | **ONE-SIDED (app)** |
| G5 Nora drafts a coach's reply | Templates only (`dashToday.jsx:364-389`) | `/api/ai/draft-message` (`iosAppBroadsheetPros.jsx:3626`) | — | — | none | **ONE-SIDED (app)** → P5 (Nora's draft in the website bell) |

## H · Notifications

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| H1 The bell: rows and read state | `/api/notifications?surface=web`; loads on sign-in and on each open (`pageShell.jsx:708-737`, `:792`); phone-only kinds left out; "mark all read" and "clear" limited to what the bell shows | `/api/notifications` + realtime `INSERT` (`shapeBackend.js:5729-5779`; `BSNotifications.jsx:114`; `iosAppBroadsheetMain.jsx:1904-1925`) | **Same** rows and `read_at`. Surface filtering is by design | Web: **no badge update while the page is open**. App: live | none | **LAGS** |
| H2 Event pushes (publish, message, session, payment…) | — (no web push) | Push via `/api/push/dispatch` on insert | **Same**: written server-side, by DB trigger or route | Immediate. Device delivery waits on #2385 | none | **IN SYNC** |
| H3 Engine pushes: coach red/amber, member directive, flags, digest | Never feeds the engine | Posts a snapshot ≤ every 30 min on open (`shapeBackend.js:10034-10069`); the cron re-runs it hourly for 14 days (`notify/cron/route.ts:1-25`; `notify/route.ts:57-110`) | **Different inputs**: a stale, app-built snapshot instead of live data. Website-only users get none; website writes never update it | Hourly on the old snapshot | **The snapshot is a device-built record** | **DIVERGES** → P2 for coaches; members not covered |
| H4 Switches, quiet hours, daily limit, mute | `coachSettings.jsx:403-683`; member Settings → Notifications | `iosAppBroadsheetClient.jsx:26407`; `shapeBackend.js:9718-9741` | **Same** (`notification_settings`, `notification_preferences`); `tests/notification-switches.test.mjs` holds both screens to `PREFERENCE_OF` | On toggle | none | **IN SYNC** |

## I · Coach notes, focus banners, pushed items, the engine

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| I1 Private coach notes | `coachClientDetail.jsx:119-196` (compare-and-set) | `coachNotes.mjs` ("same document and compare-and-set contract as the website's CKCoachNote") | **Same** document (`coach_client_notes`); duplicated code, same contract | On open | App draft per device (`coachNoteDraftKey`) | **IN SYNC** |
| I2 The coach's note to the member (focus banner) | **Writers:** `TrainerLiveConsole.html:311`, `NutritionistLiveConsole.html:320`, `coachLiveWorkout.jsx:105`. **Member read:** none | **Writer:** the live-workout cue (`BSLiveWorkoutWatch.jsx:95-96` → `shapeBackend.js:10142-10160`). **Member read:** Home Team card with realtime (`:10077-10140`) | One row per coach and client. A live cue **replaces** the weekly note ("Focus banners retain only the latest cue per coach", `:10166-10168`) | App: realtime | none | **ONE-SIDED (app reads)** |
| I3 Pushed exercises and meals | Writers: Live Console `addItem`. Member: only grocery notes (`ClientGrocery.html` → `/api/client/grocery`); Library is demo (B8) | Member: Home feed with realtime; nutritionist grocery push (`shapeBackend.js:6762`) | Same `coach_pushed_items` | App: realtime | none | **ONE-SIDED (app reads)** |
| I4 Member's directive ("your move") and the coach override | none (client-audit: NEW route `/api/client/directive`) | Built on the device from `ShapeSignals.selfRecord` (`iosAppBroadsheetClient.jsx:3531`, `:4089`). The override has no UI | The engine is shared (`dashSignals.js`), the record is app-built | On open | none | **ONE-SIDED (app)** |
| I5 Coach triage: flags, severity, reasons | Website record (`dashData.jsx` `_dashRecordFromLive`), with the coach's thresholds | App record (`signalsMap.mjs` `recordFromCoachData`), house thresholds only | Same engine, **different inputs** (engine.md §3: a client can be red on one surface and fine on the other) | Web: page load. App: 30 s cache on open | none | **DIVERGES** → P2 |

## J · Playlists

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| J1 Coach playlist library | `/api/coach/soundtracks` | Same (`shapeBackend.js:6604-6640`) | **Same** (`coach_soundtracks`) | On mount | none | **IN SYNC** |
| J2 Attach to clients or workouts | Attach matrix is demo rows and doesn't save (`TrainerApp.html:141`, `trainerPlaylistsPage.jsx:424`; coaching.md bug 3) | Writes `attached` (`iosAppBroadsheetPros.jsx:7554`) | Same column, only the app writes it | — | Website: local state | **DIVERGES** → P5 |
| J3 Member sees their coach's playlists | none | Train and Eat via `get_my_coach_playlists` (`iosAppBroadsheetClient.jsx:5372`, `:13120`) | — | — | none | **ONE-SIDED (app)** → P5 |

## K · Settings and profile

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| K1 Member profile fields, preferences, units, privacy | `settingsSync.mjs` maps every field onto the app's documents (`:5-20`); read the latest, then patch (`:68-84`) | Imports the same `saveAccountDocPatch` (`iosAppBroadsheetClient.jsx:4`); units from `client_settings.units` (`:24605`) | **Same** documents, **same module** | Web: focus refresh (`clientMeSettings.jsx:405`). App: on mount | none | **IN SYNC** |
| K2 Theme (paper) | `user_goals` `app_tweaks` + a `localStorage` mirror; re-read on focus (`dashData.jsx:1695-1705`) | `app_tweaks` (`iosAppBroadsheetMain.jsx:2279-2282`) | **Same** | Web: focus. App: start | Mirror only | **IN SYNC** |
| K3 Coach flag thresholds, and the landing tab | `user_goals` `coach_settings` (`coachSettings.jsx:196-240`); read by the website engine (`dashData.jsx:407`), Nora (`coachToday.mjs:52`) and push (`notify-core.ts:289`) | **Never read** (no `coach_settings` reference in `mobile-app/src`) | — | — | none | **ONE-SIDED (web)** → P2 |
| K4 Dashboard layouts, pins, named boards | `dashboard_layout` (`dashGrid.jsx:678`), `dashboard_prefs` (`dashData.jsx:1086`) | The app's own Home layout | Per surface, by design | — | none | **ONE-SIDED (web, by design)** |
| K5 Profile customisation (`profile_custom`) | Editor: a blind upsert of the document as opened plus its edits (`livingDesktop.jsx:1521-1567`); no spotlight, Colors or About me (`warroom.ts:663-664`, `:697`, `:1389`) | Make it yours: re-reads the stored document and merges (`BSMakeItYours.jsx:1726-1745`) | Same document, shared normalizer (`profileCustom.mjs`), **different write contract and fields** | On save | none | **DIVERGES** |
| K6 Coach's public page | `coachProfileWeb.jsx` renders the app profile from the same document | App profile | **Same** | Page load | none | **IN SYNC** |

## L · Integrations

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| L1 WHOOP, Strava, Oura data | Connect and disconnect (`/api/integrations/status`); **never syncs** | Calls `/api/integrations/{whoop,strava,oura}/sync` (`shapeBackend.js:4218-4313`) | Same connection rows; **data arrives only from an app open** (no cron in `vercel.json`) | As fresh as the last app open | none | **DIVERGES** |
| L2 Garmin | Connect | Connect | Webhook (`/api/integrations/garmin/webhook`) | Live | none | **IN SYNC** |
| L3 Apple Health | "app-only" in Settings | `syncAppleHealth` (`shapeBackend.js:4325`) | Native only | — | — | **ONE-SIDED (app, by nature)** |
| L4 Spotify and Apple Music | `/api/integrations/spotify/authorize`, `apple-music/connect` | Handoff to the website for OAuth (`shapeBackend.js:4367-4430`) | **Same** rows | On connect | none | **IN SYNC** |

## M · Nora

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| M1 Chat history (one conversation per account) | `/api/nora/thread`, read on the first open (`chatWidget.jsx:940`); later opens pull **team replies only** (`:1012-1020`) | `noraThread` (`shapeBackend.js:9330-9360`) | **Same** | Web: a phone conversation shows only after a page reload | Web: a local copy | **LAGS** |
| M2 Proposals: confirm and undo | `/api/ai/proposals/confirm`, `/api/ai/audit/undo` | Same (`shapeBackend.js:9276-9299`) | **Same** | On action | none | **IN SYNC** |
| M3 Weekly readout | `/api/ai/weekly-readout` (`dashProgress.jsx:997`) | Same | **Same**, one per member per week | Page load | none | **IN SYNC** |
| M4 Account setup by Nora | Pages listen for `shape:accountSetup` | `userGoalsRefresh.mjs` announces the kinds it wrote | Same documents; each surface refreshes **itself** (not the other device) | Same device: live | none | **IN SYNC** |

## N · Shared clients

| Feature | Website | App | Source and rules | Freshness | Device-local | Verdict |
|---|---|---|---|---|---|---|
| N1 Care team and the co-coach's view | `/api/clients/:id/shared-overview` (`coachClientDetail.jsx:391`), Shared tab | `/api/clients/:id/shared-overview`, CARE TEAM rows (`shapeBackend.js:6792-6835`) | **Same** overview and RLS (shared-and-notifications A2) | Page load / on open | none | **IN SYNC** (the gaps there are in both, → P5) |

---

## How to make them fully communicate

Sizes: **S** is under a day with tests; **M** is one or two days, or a small migration; **L** is several
days, or a model change across surfaces.

**Package tags**
- **[P1]**, **[P2]**, **[P5]**, **[P6]**: already being built in that package (`build/PLAN.md`); don't
  double up.
- **[partly Px]**: the package covers part of it.
- **[new]**: in no package.

### 1 · One source of truth: move device-local state server-side

| # | Fix | Size | Package |
|---|---|---|---|
| 1.1 | **Website swaps into the account.** `DashMealLedgerCard` reads and writes `user_goals` `client_meal_swaps` in the app's shape (keyed by meal title) through `saveAccountDocPatch`, and drops both `localStorage` keys. Tonight's prep reminder then sees website swaps too | S | [new] |
| 1.2 | **"✓ Logged" per meal, stored once.** `/api/nutrition/meal-log` takes `mealId` (and the plan day) and records it in a per-day document (e.g. `user_goals` `client_meal_logged`, `{ date: { mealId: at } }`). Both surfaces render ✓ from it. Fold in client-audit B3: tick only on `res.ok` | S–M | [new] |
| 1.3 | **One store for a member's own day plan.** Keep `client_meal_days` (the app and the prep cron already use it). Point the recipe page's "Add to today's plan" at a small route that writes through `mealDays.mjs`'s validation; the server can import it, as the cron does. Read it on website Nutrition. Then migrate and retire `client_planned_meals` and `todayMeals` | M | [new] |
| 1.4 | **Engine snapshots built on the server, refreshed on write.** Build the coach roster records and the member self record server-side, the same builder as the client-audit's `GET /api/client/directive`. Re-evaluate when a write lands (meal log, check-in, weigh-in, message) instead of replaying the app's last snapshot | L | [partly P2]: P2 brings alerts to website-only **coaches**; members and the stale-snapshot replay aren't in it |
| 1.5 | **Wearables synced by the server.** An hourly cron runs the existing WHOOP, Strava and Oura `/sync` logic per connected account; the tokens are already server-side. Apple Health stays app-posted | M | [new] |
| 1.6 | **Habit reminders reconciled.** On start and on foreground, the app reads `habit_reminders` and cancels or schedules its local notifications to match (S). Or move habit reminders to the server reminder cron like the other reminders (M) | S / M | [new] |
| 1.7 | **The website profile editor merges onto the stored document.** Re-read `profile_custom` at save and apply only the changed keys, the app's contract (`BSMakeItYours.jsx:1726-1745`) | S | [new] |
| 1.8 | **One primary goal.** `settingsSync.mjs` maps Settings → Primary goal onto `client_goals.primaryGoal` (the app's canonical token), with the old field as a read fallback | S | [new] |
| 1.9 | **A coach's weekly note apart from live cues.** A `kind` (note / cue) on `coach_focus_banners` (migration), or cues in their own table, so a mid-workout cue doesn't overwrite the week's note | M | [new] |

### 2 · Shared logic: one module both import

| # | Fix | Size | Package |
|---|---|---|---|
| 2.1 | **Awards on the server, not the client.** `/api/nutrition/meal-log` calls `award_meal_log`. A weigh-in route (or `client_weigh_ins` upsert + RPC in one route) calls `award_my_goal_milestones`. Then both surfaces earn the same, and the website's swallowed weigh-in error goes too | S | [new] |
| 2.2 | **One goal pace.** Home's climb takes `DashSignals.projectGoal` (as the Goals page does), or `homeWeek.mjs` moves to `public/newdesign` and the engine uses it. Fix client-audit B2 (newest 104 weigh-ins) | S | [new] |
| 2.3 | **One commitment progress.** A pure `commitmentProgress.mjs` in `public/newdesign` with the local-week window, imported by `/api/client/commitment` and re-exported by the app | S | [new] |
| 2.4 | **One record per client for the engine.** One mapper for website, app, push and Nora; the app applies the coach's thresholds | M | [P2] |
| 2.5 | **One draft core.** The app's ＋ New composer uses `workoutDraft.mjs` and `mealDraft.mjs` | M | [P6] |
| 2.6 | **Meal-plan documents both editors open.** The website meal builder opens the app's programs and diets; the app editor gets own dish and rest/travel days (`warroom.ts:774-775`) | M–L | [partly P6]: Kitchen search, template id, Assign follows training days |
| 2.7 | **Night-before prep for the website.** `GET /api/client/prep-tonight` over `prepAhead.mjs` (`bsPrepDueTonight`, `bsMorningSwapFor`), the import the cron already does; website Nutrition shows "Prep tonight" | M | [new] |

### 3 · Live updates

| # | Fix | Size | Package |
|---|---|---|---|
| 3.1 | **Use the notifications row as the change signal.** `notifications` is already in `supabase_realtime`, and the app already subscribes (`iosAppBroadsheetMain.jsx:1904-1925`). On a `workout`, `meal_plan`, `session_*` or `message` insert: the app invalidates `ShapeMetrics` and re-reads Home, Train, Eat or the calendar; the website subscribes the same way in `pageShell.jsx` and fires events the data hooks listen to. A coach's publish then shows on an open screen on both surfaces with no new table in realtime | S–M | [new] |
| 3.2 | **App foreground refresh.** On `visibilitychange` → visible: invalidate the 60 s metrics cache and re-read the plan on Home, Train and Eat (today only the membership check does this) | S | [new] |
| 3.3 | **Website focus refresh.** Coach Today, Week and Schedule | S | [P1] |
| 3.3b | **Website focus refresh, member side.** The same on member Today, Workouts, Nutrition, Team and Habits (`dashData.jsx` client hook; `habits.jsx` today re-reads only on day roll) | S | [new] |
| 3.4 | **The website bell's badge live.** A realtime `INSERT` subscription on `notifications` (as the app does) instead of load-and-open only | S | [new]: P5 regroups the bell but doesn't make it live |
| 3.5 | **Website chat on realtime with read state.** Subscribe to `messages` (in the publication); thread unread from `dm_unread`; call `mark_conversation_read` when a thread opens (that clears the app's badge too). Coach Messages pages: the same, and a failed send shown as failed (check `res.ok`) | M | [new]: P5 adds group and coach-to-coach messaging, not this |
| 3.6 | **Nora's thread re-read in full on each website open,** not only team replies | S | [new] |

### 4 · One-sided features to bring across

**To the website (members)**

| # | Fix | Size | Package |
|---|---|---|---|
| 4.1 | The coach's note, pushed exercises and meals, and the directive. The client-audit's build step 2: a route over `coach_focus_banners` and `coach_pushed_items`, plus `GET /api/client/directive` | M | [new] |
| 4.2 | Sessions on the member's Team page: Join (`meeting_url`), Cancel, Move (`/api/sessions/manage`), and a request shown as a request (client-audit B1) | S–M | [new]; the cancel notice is [P5] |
| 4.3 | Coach playlists on Train and Nutrition, and the workout's playlist link | S | [P5] |
| 4.4 | What happened to a check-in: reviewed and answered (owner decision, client-audit Q2) | M | [new] |
| 4.5 | The coach's review notes marked for the client: show them on the session in **both** surfaces, with a notice | S–M | [new] |
| 4.6 | Workout logging: "Open in the app" or a QR code, unless the owner wants a web logger (client-audit Q4). Not "Send to my phone" | S | [new] |

**To the website (coaches)**

| # | Fix | Size | Package |
|---|---|---|---|
| 4.7 | Review a logged session: the two ratings and a review note, on the client page (the route exists, `/api/coach/review-note`) | M | [new] |
| 4.8 | Adjust a program, phases and nutrition targets (`/api/trainer/adjust`, `set_program_detail`) | M–L | [new] |
| 4.9 | Commitments: propose one and waive a penalty | S | [new] |
| 4.10 | Nora's draft reply | S | [P5] (in the bell) |
| 4.11 | Grocery lists, and sending them | M | [new] (`warroom.ts:2203`) |
| 4.12 | The coach's weekly note from the client page, not only the Live Console | S | [new] |
| 4.13 | Attach playlists that save | S | [P5] |

**To the website chat**

| # | Fix | Size | Package |
|---|---|---|---|
| 4.14 | Voice note players, replies, receipts, typing, grocery cards (`warroom.ts:1164`, `:1196`, `:1266`) | M | [new] |

**To the app**

| # | Fix | Size | Package |
|---|---|---|---|
| 4.15 | A member asks their own coach for a session (`/api/sessions/request`) | S–M | [new] |
| 4.16 | The coach's tuned thresholds | S | [P2] |
| 4.17 | Check-in "reviewed" ticks on `coach_week_reviews` | S | [new] |
| 4.18 | "Programmed this week" from `/api/coach/week-publishes` | S | [new] |
| 4.19 | Engine red/amber pushes for website-only coaches | M | [P2] |

**Leave one-sided, by ruling or by nature**
- The morning check-in (app, owner 2026-10-20).
- Apple Health (native).
- Dashboard layouts and pins (per surface).

### Suggested order
1. **3.1 + 3.2**, so an open app shows a coach's publish (the owner's ask). Then **1.1 + 1.2 + 2.1**,
   the member's numbers agreeing everywhere. All S, all [new].
2. **3.5 + 3.4**, so messages and the bell agree on what's read.
3. **1.4**, server-built engine records, with P2: it removes the stale-snapshot alerts and gives
   website-only members their pushes.
4. **1.3 + 2.7 + 4.1**: the member website gets the coach's voice and the day's food plan.
5. **1.5, 1.6, 2.2, 2.3, 1.7, 1.8, 1.9**: the smaller divergences.
6. **4.2, 4.7–4.9, 4.15, 4.17**: tools one surface lacks.

### Owner decisions this raises
1. **Member-planned meals.** Keep `client_meal_days` and retire `client_planned_meals` (recommended,
   1.3)?
2. **The coach's review notes.** Should the member be notified when a coach writes one "to the
   client"? Today it's written and never shown (4.5).
3. **Wearable sync.** A server cron per connected account (1.5) costs API calls to the providers per
   hour per member; or sync on website visits only.
4. **Logging on the website.** "Open in the app", or a web logger (4.6, client-audit Q4)?
