# Coaching mock-ups: is the data real?

Audit of every figure, list, chart and chip on the round-2 Coaching mock-ups (Today and its widget
catalog, Week, Schedule, Clients and the peek panel, Programs and its Review drawer, the three
Playlists views) against what Shape reads today for a **signed-in coach**. Read-only research on the
working tree as it stands (2026-11-05). Paths are relative to `/home/user/shape-app` unless they
start with `$S` (the scratchpad).

## Summary

**Tally: 189 elements — WIRED 83 · DERIVABLE 76 · NEW 25 · MOCK-ONLY 5.**

| Page | Elements | WIRED | DERIVABLE | NEW | MOCK-ONLY |
|---|---|---|---|---|---|
| Today + catalog | 48 | 25 | 17 | 4 | 2 |
| Week | 28 | 13 | 12 | 3 | 0 |
| Schedule | 20 | 14 | 6 | 0 | 0 |
| Clients + peek | 30 | 16 | 13 | 0 | 1 |
| Programs + review | 18 | 6 | 7 | 4 | 1 |
| Playlists · Library | 16 | 4 | 8 | 3 | 1 |
| Playlists · Attach | 9 | 0 | 7 | 2 | 0 |
| Playlists · Builder | 17 | 3 | 5 | 9 | 0 |
| Shell | 3 | 2 | 1 | 0 | 0 |
| **All** | **189** | **83** | **76** | **25** | **5** |

What the statuses mean here:

- **WIRED**: a signed-in coach already gets this value, with this meaning, from a route or a page.
- **DERIVABLE**: the raw data is already read or stored; it needs a computation, a field passed
  through, or a new small endpoint.
- **NEW**: no source; a new field, table, route or feature.
- **MOCK-ONLY**: invented by the mock-up (or contradicts how the data works). Drop it, or keep it as a
  proposed feature.

**The short answer for the owner.** The skeleton is real: the attention feed, the day timeline with
its now-line, the KPI figures (roster logging, monthly recurring, active clients), the weekly
check-ins with ratings, wins, struggles and questions, review ticks, the schedule grid with open hours,
requests, time off and booking rules, the program library with "in use" counts, and the client's
score, streak, logs, notes and next session all come from live data today. What is **not** real yet:

- the **Programs "due next week · 8 ready · Send 8"** idea (Shape publishes a program the moment it is
  assigned; there is no "written but not sent" state);
- the **client's program and week** ("Hypertrophy Reset · Wk 2/8"), which reads a table nothing in
  the current product writes, so live coaches see "Not set";
- the **Playlists Attach matrix** (today a hard-coded demo list for every coach, and clicks are not
  saved), the **▶ that opens the client's Spotify** (the client card gets a name only), and
  everything track-level in the Builder (track list, energy tags, the session arc, reorder);
- **bulk actions** ("Note to all 6", "Nudge all 3", "Answer both", "Send 8 ready") and **messaging
  the other coach** ("Message with Rae", "Forward to her nutritionist");
- a handful of mock phrases the data cannot support ("Rae sees it too", "asked about creatine",
  "This week's just came in" on a 3-weeks-late check-in).

**Must build for the mock-ups to be fully live** (roughly in order of value):

1. **Fix Today's day boundary** (bug): `/api/trainer/dashboard` and `/api/nutritionist/dashboard`
   pick "today" and "this week" on the server's clock (UTC on Vercel), so a US coach's evening
   sessions drop off Today and tomorrow's appear. `/api/calendar` already takes `tz`; do the same.
2. **Make the program leg read what the builder writes** (bug): the roster/peek/Week "Program · Wk x/y",
   "Programs ending soon" and the Week panel's program line read `coach_program_assignments`, written
   only by `/api/program-tools/templates` POST, which nothing calls. Website assignments land in
   `client_workouts` (payload.template + dates). Derive name, week x of y and "next week published?"
   from there.
3. **Decide the "programs due" model**: either relabel to what is wired ("8 checked in · ready to
   program / 2 waiting on a check-in", plus "programmed this week" from `coach_week_publishes`), or
   build a draft-week state plus a bulk publish (NEW) for "8 ready · Send 8".
4. **Today widgets that are computations**: the one-sentence brief, tab counts on Needs you, "▼ 3
   stopped logging", per-row actions chosen by the top flag, and the Money widget's next payout
   (read Stripe's in-transit payout or the account's payout schedule; Today never reads Stripe now).
5. **Pass through data the overview already reads but the record drops**: care-team names ("with
   Rae"), PRs from `get_client_lifts` (wins like "Squat 245 lb PR"), 7 days of logs instead of 3 (day
   dots and the logging sparkline), the session's `series_id` ("standing Tuesday slot") and `intro`
   flag ("intake call / consult").
6. **Messaging**: a bulk send route, and a coach-to-coach (or three-way) thread kind. Neither exists:
   conversations are `direct`, `room` or `community` only.
7. **Playlists**: build the Attach matrix from the coach's real programs (`coach_plans`) and usage,
   save a toggle to the program day, carry the playlist's URL and provider into the workout payload and
   open it on the client's card, fetch the track list from Spotify, store per-track energy tags, and
   (optionally) write a reorder back through the coach's Spotify connection (the scopes are already
   requested). Fix the builder's `track_count` read (bug).
8. **Week**: count food logs inside the check-in week, not the last 7 days at read time (bug), and
   either build topic grouping for questions (AI) or show the questions as a plain list.
9. **Freshness**: Today, Week and Schedule read once per visit (60 s cache) with no polling, focus
   refresh or realtime. At least re-read on focus, as the Programs page already does.

---

## How the data reaches the dashboard (freshness model)

| Source | What it feeds | How it updates |
|---|---|---|
| `useDashboard(role)` (`public/newdesign/dashData.jsx:521`) | Every page's roster, triage feed, queue, joint attention | Once per page mount (each tab switch remounts), through a 60 s module cache (`dashData.jsx:24`). Re-reads on `shape:coach-progress-refresh` (the drawer's Refresh). **No polling, no focus refresh, no realtime** on Today, Week, Clients. |
| `/api/{role}/clients` (`src/lib/coach-roster.ts`) | Names, isNew (14 days), mrrCents, fee, origin, joinedAt, onPlan, paymentRetrying | Computed on read from `subscriptions` + `sessions`. |
| `POST /api/clients/shared-overview` (`src/lib/shared-overview.ts:72`) | Per client: stats (`get_client_stats`), check-ins (last 4), score history (8 ISO weeks + streak), goals, weigh-ins, lifts, logs leg, last contact, program leg, intake, sessions (−30 / +60 days), care team | Computed on read; 50 clients per request. Underlying rows are written when the client logs food (`daily_health_snapshot`), submits a weekly check-in (`client_checkins`), earns score (`score_ledger`), messages (`conversations.last_message_at`). |
| `/api/{role}/dashboard` (`src/app/api/trainer/dashboard/route.ts`) | Today's sessions, calendar, kpis (active clients, net a month, sessions this week, upcoming), growth/funnel | Computed on read. **Day/week boundaries on the server clock** (`route.ts:132-149`; nutritionist `route.ts:126-143`; `src/lib/time.ts:7`). |
| `DashSignals` engine (`public/newdesign/dashSignals.js`) | Severity, flags, reasons, joint attention, programming queue, KPI pool, wins | Pure, recomputed in the browser on each render of new data. The same engine runs **hourly** server-side (`/api/ai/notify/cron`, `vercel.json` "0 * * * *") to push `client_red` / `client_amber` to the coach (`src/lib/ai/notifications.mjs:40`). |
| `coach_week_reviews`, `coach_client_notes`, `dashboard_prefs`, `coach_week_plans` (`user_goals` docs) | Reviewed ticks, private notes, pins, layout, tabs | Read on mount; written on the coach's click (read-before-write). |
| `/api/calendar` (`src/app/api/calendar/route.ts`) | Schedule grid, requests, plans lane, capacity | Each visible month once (`dashSchedule.jsx:1720-1745`); a 60 s clock moves the now-line only. New requests appear on reload or navigation. |
| `/api/trainer/analytics` (`route.ts`) | Business page money: Stripe balance, payouts (arrival dates), schedule, renewals | On Business/Goal visit; live Stripe API calls (`src/lib/stripe.ts:48-87`). **Today does not read it.** |
| `/api/coach/plans`, `/api/coach/plans/usage` | Program library, "In use · N clients" | On mount and on window focus / tab visibility (`dashBuilder.jsx` TrainerProgramsPage). |
| `/api/coach/soundtracks` (`src/app/api/coach/soundtracks/route.ts`) | Playlists | On mount. Spotify name/tracks/duration resolved **once**, at import. |

**Demo vs live.** Signed out, wrong role, or a failed roster read, every page falls back to
`DashSignals.buildMockClients()` (the cast in BRIEF.md) and shows the demo band (`DashDemoBand`).
`DASH_TODAY_ROLES` (`dashToday.jsx:162-312`) holds the demo schedule, calendar and pulse; the demo
KPI strip is `dashDemoKpis` (`dashToday.jsx:72`), including the demo-only "This month $224" and
"Next payout · in N days". Playlists show `TRAINER_PLAYLISTS` only when signed out
(`trainerPlaylistsPage.jsx:80`), **but the Attach matrix rows are the demo list for everyone**
(`TrainerApp.html:141`).

---

## Today (`$S/coachmock/today-v2.html`) and the widget catalog (`today-v2-edit.html`)

Live page: `CoachDashboardPage` (`public/newdesign/dashToday.jsx:1881`), a DashGrid board with a day
column (`DashNowColumn`, `dashToday.jsx:1759`) and a "Needs you" card (`DashNeedsYou`, `:1852`).

| # | Element (as the mock shows it) | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| T1 | Header "Wednesday · Nov 4 · 1:20 pm" | `dashTodayDate` (`dashToday.jsx:149`), browser clock | WIRED | Per render. Time-of-day is a trivial addition. |
| T2 | "Good afternoon, Maya." | First name: `/api/trainer/dashboard` `user.firstName` (`route.ts:41-50`). Greeting is hard-coded "Good morning, " (`dashToday.jsx:168`, `:234`) | DERIVABLE | Pick morning/afternoon/evening from the clock. |
| T3 | Customize · ＋ Program · ＋ New session | DashGrid edit mode; `cfg.primaryCta` / `secondaryCta` (`dashToday.jsx:169-170`) | WIRED | "New session" links to Clients, not a booking sheet. |
| T4 | Brief: "**3 clients need you** before your 2:00 with Sam O." | Red count from the triage feed (`useDashboard` → `getTriageFeed`, `dashSignals.js:986`) + next session (DashNowColumn logic). The app composes a similar line ("N things need you. X of Y sessions done.", `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:1434-1446`) | DERIVABLE | Template sentence, no AI. "as of 1:20 pm" should be the read time, not render time (data is not refreshed). |
| T5 | Brief names + reasons ("Marcus slipping on both sides, Sam gone quiet, Jonah's check-in 3 weeks late") | Flag labels: joint (`findJointAttention`, `dashSignals.js:1326`), `contact_gap` "Quiet 7d" (`:613`), `checkin_overdue` "Check-in 3w late" (`:591`) | DERIVABLE | Wording from flag keys. |
| T6 | Up next: "Sam O. · Intake call" | `today[]` from `/api/trainer/dashboard` (`route.ts:145-157`): `client_name`, `topic`, duration, `type` | WIRED | **Bug: "today" is the server's UTC day** (`route.ts:133-149`). Rows carry no `client_id`, so the client record is matched by name (`dashFindRecord`). |
| T7 | "New client · first session" | `sessions.intro` (`supabase-migrations/2026-10-15-intro-length.sql:40`) not selected by the route; roster `sessions` count | DERIVABLE | |
| T8 | "40 min · at 14:00" countdown | `dashCountdown` (`dashToday.jsx:1743`), 30 s clock (`:1762-1765`) | WIRED | |
| T9 | "No shared history yet." | DashNowColumn fallback when no context line (`dashToday.jsx` ~1810) | WIRED | When a record exists it shows the engine's context line instead (goal pace, check-in state). |
| T10 | "Their intake form is in." | `record.intake` from `get_client_intake`, readable for anyone with a booked session in 90 days (`2026-10-15-coach-client-intake.sql:29-56`) | DERIVABLE | Only if the prospect is on the roster (session-only people are) and the name match succeeds. |
| T11 | "Prep the intake →" | Today: "Client file" + "Message" | DERIVABLE | Intake view lives on the client file. |
| T12 | At a glance · **Programs due 10** next week | KPI `due` = clients in `buildProgrammingQueue` (`dashSignals.js:1932-1938`, `:1233-1253`): everyone whose check-in leg is readable, **not** "programs due next week" | DERIVABLE | The mock's meaning needs "does this client have published `client_workouts` for next week?" per client. |
| T13 | "**8 ready to send** · 2 to finish" | Live "ready" = "this week's check-in received" (`dashSignals.js:1240-1243`). No "written, not sent" state: `client_workouts.status` is `published` or `archived` (`2026-04-18-client-workouts.sql:21`) and assigning publishes at once (`dashBuilder.jsx:1690-1720`) | NEW | Or relabel to the wired "8 checked in · ready to program / 2 waiting on a check-in". |
| T14 | Check-ins reviewed **0/10** this week | Week page `reviewedCount` over `coach_week_reviews` (`dashWeek.jsx:385-389`) | WIRED | Shown on Week, not Today. Denominator is the whole roster, including session-only people. |
| T15 | "The week closes Sunday" | Copy (Week page says "closes Sunday") | WIRED | |
| T16 | Roster logging **69%** · last 7 days | KPI `compliance` (`dashSignals.js:1940-1958`) over `foodLogs.daysLogged7d` from `get_client_stats` (`2026-10-31-client-stats-window.sql:75-79`) | WIRED | A logged day = calories eaten present. Computed at read. |
| T17 | Logging sparkline (7 daily points) | Overview carries the 7-day count and 3 recent logged days (`coach-client-legs.mjs:110`, `recentLimit = 3`) | DERIVABLE | Widen the logs leg to 7 days, or add a roster daily-logging RPC. |
| T18 | "▼ 3 stopped logging" | Count of `food_gap` flags (`dashSignals.js:548`) | DERIVABLE | |
| T19 | Money **$1,820 a month** "From 10 clients on a plan with you" | KPI `mrr` (gross) = Σ `payments.mrrCents` (`dashSignals.js:2009-2031`; `coach-roster.ts:225`) | WIRED | The live sidebar card shows **net** (`monthlyNetCents`); pick one figure and say gross or net. |
| T20 | "Next payout **Nov 30** · in 26 days" | Stripe payouts (`src/lib/stripe.ts:56-80`) via `/api/trainer/analytics`, read only on Business. A future date exists only for a payout Stripe has already created; otherwise only the schedule (`dbzScheduleLine`, `dashBusiness.jsx:171`) | DERIVABLE | Nov 30 is the demo's end-of-month rule (`demoPayouts`), not Stripe's; most Standard accounts pay daily or weekly. Today's card still says "payouts connect soon" (`dashToday.jsx:107`, `trainerDashboard.jsx:92`), now stale copy. |
| T21 | Needs you tabs Attention / Check-ins / Replies | `DashNeedsYou` tabs (`dashToday.jsx:1985-2001`) | WIRED | Live also has New clients and Programs tabs. |
| T22 | Tab counts 9 / 4 / 3 | Each panel computes its rows; no counts shown. Replies reads `/api/trainer/messages` only when its tab opens (`useDashWidgetRead`, `:1633`) | DERIVABLE | Counts need the replies read on load. |
| T23 | "Act today · 3" + "before your 2:00" | Red severity (`evaluateClient`, `dashSignals.js:832`) + next session | DERIVABLE | Grouping and label only. |
| T24 | Row "Marcus T. · Joint · with Rae" | Joint = engine (`findJointAttention`) — WIRED. "with Rae" needs the care team: `careTeam` is in the overview but dropped by `_dashRecordFromLive` (`dashData.jsx:152`) | DERIVABLE | |
| T25 | Row reason "Streak broken and no food logs for 3 days." | Flag reasons (`getTriageFeed` `reasons`) | WIRED | |
| T26 | "…Rae sees it too." | Nothing records that the nutritionist saw it; the engine evaluates the nutrition rules itself | MOCK-ONLY | Drop, or say "Slipping on training and food". |
| T27 | Jonah: "Check-in 3 weeks late. This week's just came in." | `checkin_overdue` counts from the latest check-in (`dashSignals.js:591-611`); if this week's arrived the flag clears | MOCK-ONLY | Contradiction; pick one. |
| T28 | Row action "Message" | `dashMessageClient` with a drafted opener (`dashMessageDraft`) | WIRED | |
| T29 | Row action "Review check-in" | Choose the action by top flag key | DERIVABLE | |
| T30 | Row action "Message with Rae" (three-way) | Conversations are `direct`, `room` or `community` only; the wired equivalent is "Start joint note" (a DM to the client written as from both, `dashToday.jsx:384`, `:923`) | NEW | |
| T31 | Footer "6 more" gems | Remaining triage rows | WIRED | |
| T32 | "4 this week" · "2 good news" chips | Amber count; green rows with a dated win | DERIVABLE | Labels are ambiguous; define or drop. |
| T33 | "Show all →" | Clients page with `?status=` (`trainerClientsPage.jsx:20-23`) | WIRED | |
| T34 | Today timeline: 5 sessions, time · name · topic | `today[]` + `DashNowColumn` (`dashToday.jsx:1759-1850`); cancelled/declined filtered (`:1757`) | WIRED | **Same UTC-day bug as T6.** |
| T35 | Location "remote" / "Brooklyn" | `sessions.type` (`video`, `phone`, `inperson` or `message`) gives "remote"; no location column (`2026-04-18-sessions-and-availability.sql:14-32`) | NEW | "remote" alone is DERIVABLE; a place name needs a column. |
| T36 | Done ✓ · Next · now-line "13:20" | Done = completed or ended; now-line; 30 s clock (`dashToday.jsx:1769-1830`) | WIRED | |
| T37 | "Open the week →" | Calendar link in the day column | WIRED | |
| T38 | Customize: drag, resize "8 of 12 columns", ⚙, ×, Reset to default, Done | DashGrid (`dashGrid.jsx`, gridstack), layout per account; "Reset layout" (`dashGrid.jsx:611`, `:1464`) | WIRED | |
| T39 | Catalog · Check-ins "0 of 10 reviewed" | Optional widget `checkins` (`dashToday.jsx:2002`) | WIRED | The subtitle figure is DERIVABLE (same as T14). |
| T40 | Catalog · Replies "3 waiting on you" | Optional widget `replies` (`dashToday.jsx:2008`) | WIRED | Count needs the read (T22). |
| T41 | Catalog · New clients "Their first 30 days" | Optional widget `setup`, onboarding leg (`coach-client-legs.mjs:288`) | WIRED | |
| T42 | Catalog · Wins "4 to congratulate" (5k under 25:00, Squat 245 lb PR, 50% to goal) | `DashWinsPanel` (`dashToday.jsx:781`) over `buildMilestones` (`dashSignals.js:1260`). Live `milestones` is hard-coded null (`dashData.jsx:268`), so live wins are streak landmarks and achieved goals only | DERIVABLE | PRs: map `get_client_lifts` (already in the overview). "50% to goal": from the goal projection. |
| T43 | Catalog · Top movers | Optional widget `movers` (`dashSignals.js:2260`) | WIRED | Needs two full weeks of score history. |
| T44 | Catalog · Week ahead | Optional widget `week` (`dashWeekAhead`) | WIRED | |
| T45 | Catalog · Capacity "5.5 of 29 hours booked" | `DashCapacityPanel` (`dashToday.jsx:1714`): `/api/calendar` + `/api/my-availability` | WIRED | Reads "unavailable" unless the saved hours' zone equals the browser zone. |
| T46 | Catalog · This month "$224 net after the fee" | Demo only (`dashDemoKpis`, `dashToday.jsx:72-87`); live has net-a-month run-rate and Stripe balance, no month-to-date net | DERIVABLE | Stripe balance transactions or the trajectory. |
| T47 | Catalog · Revenue by client | Optional widget `revenue` (`dashSignals.js:2353`) | WIRED | |
| T48 | Catalog · Programs due "8 of 10 ready to send" | As T12-T13 | NEW | |

**Nutritionist variant.** Same page and routes (`/api/nutritionist/dashboard` has the same UTC-day
bug at `route.ts:126-143`). Units read "consults". The triage adds `ledger_blown` and `protein_under`
(targets from `client_programs.detail.nutrition`). "Plans due" uses the same check-in queue, and the
publish ledger is trainer-only, so a nutritionist's queue is marks-only (`dashToday.jsx:542-562`).
The nutritionist board adds **Roster health** (`DashNutriAggPanel`, `dashToday.jsx:1105`): average
compliance and % logged are WIRED; "Renewals due · 30d" is demo-only (`:1114`) and its "Insight ·
recipes" text is static copy. Joint attention reads "with their trainer".

---

## Week (`$S/coachmock/week-v2.html`)

Live page: `CoachWeekPage` (`public/newdesign/dashWeek.jsx:357`).

| # | Element | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| W1 | Ring "0/10 reviewed" | `reviewedCount` over roster rows + `coach_week_reviews` (`dashWeek.jsx:384-389`) | WIRED | A review is invalidated if the check-in changes (`dashCheckinReviewed`). |
| W2 | "Weekly check-ins · Nov 2 – 8" + week nav | `dwkMonday`, ‹ Prev / This week | WIRED | |
| W3 | "**9** check-ins to review" | Clients with this week's check-in, not reviewed | DERIVABLE | |
| W4 | "4 asked you something" | Count of `checkin.question` | DERIVABLE | |
| W5 | "Aisha K. hasn't checked in" | Row "No check-in yet this week" (`DwkRow`) | WIRED | |
| W6 | "Closes Sunday · 4 days left" | Date math | DERIVABLE | |
| W7 | Start review → · "Starts with Sam R." · J/K | UI over the same rows | DERIVABLE | |
| W8 | Pattern "Stress is the week's weak spot: 6 of 9 rated it 4 or 5 · roster average 3.9" | Aggregate of `ratings.stress` (check-ins via `get_client_checkins`, `shared-overview.ts:317`) | DERIVABLE | |
| W9 | Pattern "2 clients asked about creatine · answer once" | Questions are free text; nothing groups them by topic | NEW | Needs keyword or AI grouping; or list the questions plainly. |
| W10 | Pattern "Food logging is thin for 3" (under 4 of 7) | `foodLogs.daysLogged7d` | DERIVABLE | |
| W11 | Bulk "Note to all 6" · "Answer both" · "Nudge all 3" | No bulk or broadcast message route (`/api/messages/direct` is one thread) | NEW | |
| W12 | Matrix: six ratings 1–5 as coloured tiles | `checkin.ratings` (trainingAdherence, nutritionAdherence, sleep, energy, stress, hunger), `DwkRatings` (`dashWeek.jsx:213`) | WIRED | Written when the client submits; overview keeps the last 4. |
| W13 | Struggle / win line under the name | `checkin.struggles` / `checkin.wins` | WIRED | |
| W14 | Column roster averages | Mean of the ratings | DERIVABLE | |
| W15 | Food logs n/7 + pips | `foodLogs.daysLogged7d` (`dashWeek.jsx:267`) | WIRED | **Bug: it is the last 7 days at read time, not the check-in week**, so a past week shows this week's logs. Per-day pips are DERIVABLE (logs leg keeps 3 days). |
| W16 | "Asked" bubble with a topic word ("creatine") | `checkin.question` — WIRED; the topic word is NEW (W9) | WIRED | |
| W17 | Done ✓ per row | Mark reviewed (`onReview`, signature-checked) | WIRED | |
| W18 | Sort "Needs you first" · A–Z · "Asked you 4" | Rows arrive in triage order; the mock's ordering (low ratings + thin logs + a question) and the filters are new | DERIVABLE | |
| W19 | "↓ lower is better" on Stress and Hunger | `DWK_RATINGS` "lo" flag | WIRED | |
| W20 | Panel "Check-in 4 of 10" ‹ › | UI | DERIVABLE | |
| W21 | Panel "Strength Block 3 · Wk 6/12" | Program leg (`bsProgramLeg`, `coach-client-legs.mjs:61`) reads `coach_program_assignments` (`shared-overview.ts:241`), whose only writer is `/api/program-tools/templates` POST (`route.ts:150`), which nothing calls. Website assignments write `client_workouts` (`dashBuilder.jsx:1705` → `/api/trainer/workout`) | DERIVABLE | **Bug: live coaches see "Not set".** Derive from `client_workouts.payload.template` + dates. |
| W22 | Panel Food logs 6/7 · Weigh-in "not shared" · Week score 59 ▼7 | `foodLogs`; weigh-ins share-gated (`get_client_goals`); `scoreWeekReading` (`dashSignals.js:516`) over `get_client_score_history` | WIRED | Score delta compares the two newest complete weeks. |
| W23 | "Her ratings" bars with roster-average tick | Ratings WIRED; average DERIVABLE | DERIVABLE | |
| W24 | ▲ Win / ▼ Struggle | `checkin.wins` / `struggles` | WIRED | |
| W25 | "Asked you" quote | `checkin.question` | WIRED | |
| W26 | Reply box + "Reply & mark reviewed ✓" | Today two actions: Message (opens the chat with a draft) and Mark reviewed | DERIVABLE | Send through `/api/messages/direct`, then the review write. |
| W27 | "Forward to her nutritionist · Rae L." | No coach-to-coach thread; care-team names exist in the overview | NEW | |
| W28 | "Open ↗" | Client file route `#client/<id>` | WIRED | |

**Nutritionist variant.** Same page (`CoachWeekPage role="nutritionist"`). The panel's program line
would be a meal plan, which has no week-of-N leg at all (`goalPhase` is the only plan label).

---

## Schedule (`$S/coachmock/schedule-v2.html`)

Live page: `CoachSchedulePage` (`public/newdesign/dashSchedule.jsx`), rules in `scheduleRules.mjs`.

| # | Element | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| S1 | "1 to confirm: Sam R. wants **Sat 9:00 AM**" with ✓ Accept / Decline | `requested` sessions from `/api/calendar`; requests strip `DscRequests` (`dashSchedule.jsx:1491`); actions `/api/sessions/manage` | WIRED | Loaded once per month view; a new request needs a reload. |
| S2 | "Strength check · 60 min · fits your open hours" | `topic`, `duration_min`; `fitsOpenHours` (`scheduleRules.mjs:73`) | WIRED | |
| S3 | ⋯ "Suggest another time · Message Sam" | "Other time" in the strip; message helper | WIRED | |
| S4 | Up next "2:00 pm · Sam O. · Consult · intake call · video" + 40 MIN ring + Open | Calendar events + now; the Today countdown exists; this card does not exist on Schedule | DERIVABLE | "Consult" for a trainer needs `sessions.intro`, not read by `/api/calendar`. |
| S5 | ‹ › · "Nov 2 – 8" · Today · Day/Week/Month | Calendar navigation | WIRED | |
| S6 | "**5.5** of **29** open hours booked" + meter | `dayLoad` (`scheduleRules.mjs:193`), week load (`dashSchedule.jsx` ~2150) | WIRED | |
| S7 | Ghost segment "Sam R.'s request, if you accept" | Request duration | DERIVABLE | |
| S8 | "Share open times ↗" | Public profile booking page exists; no share action on Schedule | DERIVABLE | |
| S9 | Sessions as blocks sized by length, initials, client colour | Time grid; colours assigned by order on screen (`dscColorMap`, `dashSchedule.jsx:57`) | WIRED | Fixed per-client colours are the new design. |
| S10 | Kinds labelled: session / check-in (azure) / consult (gold) | `/api/calendar` maps a booking to `SESSION` (trainer) or `CONSULT` (nutritionist) (`route.ts:259`); `CHECKIN` exists only as a coach-made `calendar_events` row (`route.ts:78`) | DERIVABLE | Read `sessions.intro` to mark a trainer's intro as a consult. |
| S11 | Open hours as a teal wash | `provider_availability` via `/api/my-availability` | WIRED | Shaded only when the saved zone equals the calendar zone. |
| S12 | Today lifted, past veil, now-line 1:20 | Now-line (`dashSchedule.jsx:1059`), 60 s clock (`:1683`) | WIRED | |
| S13 | Past blocks ✓ | Session `status` | WIRED | |
| S14 | Requested block, dashed, with ✓ × | Requested sessions on the grid | WIRED | |
| S15 | "8:30 · Request lapsed" | No lapsed state; a past `requested` session | DERIVABLE | |
| S16 | "Time off · Dentist · 1:00 – 5:00 PM" hatched | `/api/my-time-off` (block + note) | WIRED | |
| S17 | Plans lane "Priya · Lower A", "Marcus · Push" … | `/api/calendar?clientPlans=1` → `client_workouts` as read-only `WORKOUT` events (`route.ts:305-353`) | WIRED | Trainers only. |
| S18 | Sunday "Closed" | No availability slots that weekday | DERIVABLE | |
| S19 | "Drag to move · click an open hour to book" | Drag reschedule and click-to-book (`/api/sessions/manage` create) | WIRED | |
| S20 | Hours & rules slide-over: open hours, time off, buffer, max/day, notice, free intro 15 min | `/api/my-availability`, `/api/my-time-off`, `/api/my-booking-rules`; `consult_min` (`2026-10-15-intro-length.sql:33`) | WIRED | Today these sit on the page; moving them is layout only. |

**Nutritionist variant.** Same page; bookings come back as `CONSULT`, and the plans row
(`clientPlans=1`) is requested for trainers only (`dashSchedule.jsx:1733`), so a nutritionist has no
plans lane.

---

## Clients (`$S/coachmock/clients-v2.html`): roster and peek panel

Live page: `TrainerClientsPage` (`public/newdesign/trainerClientsPage.jsx:11`), roster table and
drawer in `dashRoster.jsx` (`DashRosterTable` `:769`, `DashClientDrawer` `:583`). The drawer is a
modal side sheet today; the peek is the same data beside the list.

| # | Element | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| C1 | "Clients" + ＋ Invite client | Invite link (`trainerClientsPage.jsx:58`) | WIRED | |
| C2 | "Your clients 10" / "Shared with you" | `dashPlanClientCount` (`dashData.jsx:300`); `SharedClientsTab` | WIRED | The count is people with an open plan; the list also holds session-only people. |
| C3 | Roster health "3 Need you · 4 Watch · 3 On track", click to filter | `DashRosterTiles` (`dashRoster.jsx:741`) on triage severity | WIRED | Live also has "New" and "Progress unknown" (failed reads); keep "unknown" visible when non-zero. |
| C4 | "Check-ins this week 0 of 10 reviewed · closes Sun" | Week page figure (W1) | WIRED | Not on Clients today. |
| C5 | "Search 10 clients" with "/" | Search box | WIRED | The "/" shortcut is new UI. |
| C6 | "Sort: Needs you first ▾" | `DASH_ROSTER_SORTS`, default triage (`dashRoster.jsx:182`) | WIRED | |
| C7 | Columns Client · Score (63 ▼8) · Spoke (1d) | `dashScoreCell` (`:153`), `dashContactLabel` (`:103`) | WIRED | |
| C8 | Group headings Needs you / Watch / On track | Severity | DERIVABLE | Grouping is UI. |
| C9 | Row "Streak broken · knee twinge on lunges" | Top flag WIRED; the second clause is the latest check-in's struggle | DERIVABLE | `record.checkins[0].struggles`. |
| C10 | On-track rows "✓ 5k under 25:00 · yesterday", "✓ Squat PR 245 lb" | Live milestones are null (`dashData.jsx:268`); `get_client_lifts` is read but unmapped | DERIVABLE | |
| C11 | "First weigh-in 158 lb · wk 1/4" | Weigh-ins WIRED (share-gated); "wk 1/4" hits the program-leg bug (W21) | DERIVABLE | |
| C12 | Chips "Joint", "New" | Joint engine; `isNew` (14 days, `coach-roster.ts:214`) | WIRED | |
| C13 | Spoke colouring (hot / warm) | Days since contact; roster already warns at ≥5 | DERIVABLE | |
| C14 | Peek status "Needs you" + "Streak broken · score ▼8" | Severity + flag labels | WIRED | |
| C15 | "Next · Sam R. ↓" | UI | DERIVABLE | |
| C16 | "Message Marcus" · "Open file ↗" | Drawer Message + Open client file (`dashRoster.jsx` ~715) | WIRED | |
| C17 | Program "Hypertrophy Reset", Hypertrophy tag, Wk 2/8 meter | Program leg (bug, W21); the type tag would come from `coach_program_templates.goal`, while the website library is `coach_plans` with tags | DERIVABLE | Live: "Not set". |
| C18 | "Adherence · 7d 90%" | Live `trainingAdherence` = completed ÷ booked sessions over **42 days**, across **all** the client's coaches, counting past un-actioned "confirmed" sessions as missed (`2026-10-31-client-stats-window.sql:57-64`). Weekly habit+session+logging adherence exists for closed weeks (`get_roster_weekly_adherence`, `dashWeek.jsx:61`) | DERIVABLE | Relabel ("Sessions kept · 6 wk") or switch source. Not a 7-day figure. |
| C19 | Streak "0d" | `get_client_score_history` streak | WIRED | |
| C20 | Joint note "**Rae, his nutritionist, flagged Marcus too.** … Write one note →" | Joint is the engine's own reading, not a flag Rae raised; Rae's name needs the care team (T24). "Write one note" = joint draft DM | DERIVABLE | Reword: nobody "flagged" anything. |
| C21 | This week's check-in, six gauges, ✓ Mark reviewed | `record.checkins` + `coach_week_reviews` | WIRED | Not in today's drawer; on Week. |
| C22 | "✓ Win" / "× Struggle" quotes | Check-in | WIRED | |
| C23 | Shape score "63 ▼8 vs last week" + 8-week line | `get_client_score_history` (8 ISO weeks, `2026-09-09-client-score-history-coach-read.sql`), `DashSecScore` (`dashRoster.jsx:319`) | WIRED | The newest week may be partial (marked `*`). |
| C24 | Sparkline flag "50% to goal" | Goal projection history | DERIVABLE | |
| C25 | Food logs "3/7" + day dots Thu … Today | Count WIRED; dots need 7 days (logs leg keeps 3) | DERIVABLE | |
| C26 | "**Nothing logged since Sun** · Rae sees the same gap" | `foodLogs.lastLoggedOn` WIRED; "Rae sees the same gap" is MOCK-ONLY | MOCK-ONLY | Keep the first half. |
| C27 | Next session "Tue 10 · 6:00 PM · Deadlift work" | Overview `sessions` (−30 / +60 days, `shared-overview.ts:210-214`) | WIRED | Shown on the client file, not the drawer. |
| C28 | "His standing Tuesday slot" | `sessions.series_id` (`2026-10-07-session-series.sql:26`), not selected by the overview | DERIVABLE | |
| C29 | Private notes "only you · edited Tue" + Edit | `coach_client_notes` doc (`dashData.jsx:325`), `updatedAt` | WIRED | Editing is on the client file. |
| C30 | Rail badge "Clients 3" | Sidebar badge is the active-client count (`trainerDashboard.jsx:207`) | DERIVABLE | Needs-you count from triage. |

**Nutritionist variant.** `NutritionistClientsPage`; the drawer's lens is "Quick consult"
(`dashRoster.jsx:546-554`): last 3 days of food logs, macros vs targets (7-day average), weigh-in trend,
the trainer side read-only. A nutritionist peek should show those (all WIRED) instead of Program /
Adherence / Streak. Protein and calories flags (`protein_under`, `ledger_blown`) are owned.

---

## Programs (`$S/coachmock/programs-v2.html`) and the #review drawer

Live page: `TrainerProgramsPage` (`public/newdesign/dashBuilder.jsx:3015`), library from
`/api/coach/plans?kind=program` (`coach_plans`), usage from `/api/coach/plans/usage`.

| # | Element | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| P1 | "Trainer · 5 published" | `coach_plans.published` | WIRED | Re-read on focus. |
| P2 | ＋ Single workout day · ＋ Program | `create('workout')` and `create('program')` | WIRED | |
| P3 | "**10 programs** due next week · Nov 9 – 15" | Per client: no published `client_workouts` for next week | DERIVABLE | Today's "Programs due" counts something else (T12). |
| P4 | "✓ 8 ready · 2 need you" | No unsent/draft week (`client_workouts` `published` or `archived`) | NEW | Wired alternative: `coach_week_publishes` ("programmed this week", `/api/coach/week-publishes`) and the check-in queue. |
| P5 | Review (drawer) · "Send 8 ready →" | Needs P4's draft state and a bulk publish | NEW | |
| P6 | Filters: search, type segmented with counts, "Sort · Most clients" | `DashFilterBar` facets (type, focus, tags, In use) | DERIVABLE | Search and type are WIRED; counts per type and sort-by-clients are small additions. |
| P7 | Card type label (Strength, Cut, Hypertrophy, Return to gym, 5k prep) | Goal/tag facet (`programTagFacet`) | WIRED | Type colours are the new design. |
| P8 | Name + "2 weeks · 2 days a week" | Builder weeks and days (`programFacts`) | WIRED | |
| P9 | "Most used · 5 clients" | "In use · N clients" from usage | DERIVABLE | Count WIRED; "most used" is a max. |
| P10 | Client gems on the card (JW · AK · DK · +2) | Usage route builds client-id sets but returns only sizes (`usage/route.ts:41-52`) | DERIVABLE | |
| P11 | "No clients yet" | Usage 0 | WIRED | Counts clients with **future** published workouts from the template; a client on their last day reads as off it. Capped at 5,000 rows (`capped` flag). |
| P12 | Assign · ⋯ (Use as template, Edit template) | Assign modal, copy, edit | WIRED | |
| P13 | "Written for one client · 5 programs, kept out of the library" | No per-client program entity; custom work is published weeks in `client_workouts` | NEW | Or group `client_workouts` by title per client (DERIVABLE, weaker). |
| P14 | Row "Week 2 of 8" + meter | From `client_workouts` dates + template weeks; not via the program leg (bug) | DERIVABLE | |
| P15 | "Week 3 not ready" / "✓ Week 5 ready" | Next week's `client_workouts` exist? Template assignments publish every week at once, so they are always "ready" | DERIVABLE | |
| P16 | Drawer "Marcus T. · Hypertrophy Reset · Week 3 · **Knee twinge: swap the lunges**" | Week DERIVABLE; the advice line is a suggestion composed from a check-in struggle | MOCK-ONLY | Would need AI; or show the struggle quote itself (WIRED). |
| P17 | Drawer "Tess B. · Onboarding · Week 2 · Week 2 isn't written yet" | Next week's `client_workouts` | DERIVABLE | |
| P18 | Drawer "✓ Ready · 8" list + "Lands in each client's app" | Ready state is NEW (P4); publish → client app is WIRED | NEW | |

**Nutritionist variant.** `NutritionistPlansPage` (meal plans). "Plans due" is the same check-in
queue; there is no publish ledger for meal plans (`dashToday.jsx:542-562`), so "ready / sent" has
even less to read. The round-2 plans mock (`plans-v2.html`) is out of this audit's scope.

---

## Playlists · Library (`$S/coachmock/playlists-library-v2.html`)

Live page: `PlaylistPage` (`public/newdesign/trainerPlaylistsPage.jsx:38`) over
`/api/coach/soundtracks` (`coach_soundtracks`: name, provider, tag, url, tracks, duration, bpm,
attached).

| # | Element | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| L1 | Lede: "every client on it gets ▶ on that workout card. It opens in their own Spotify or Apple Music." | A program day's playlist is copied into each workout as `{ name, meta }` only (`dashBuilderCore.js:949`, `workoutDocument.js:606`); the member app shows a "♪ name · meta" chip with no link (`BSTrainDay.jsx:89-91`). The Spotify ▶ is sample-only (`BSWorkoutDetail.jsx:67`) | NEW | Carry url + provider (or the soundtrack id) in the payload and open it on the card. |
| L2 | "Spotify 5 · Apple Music 1" | `coach_soundtracks.provider` | DERIVABLE | |
| L3 | ＋ Add a playlist | POST `/api/coach/soundtracks`; Spotify picker `/api/integrations/spotify/playlists`; Apple MusicKit | WIRED | |
| L4 | Views Library / Attach (flag "2") / Builder | Tabs WIRED; the flag count DERIVABLE (L7) | WIRED | |
| L5 | "Search 6 playlists" | Search | WIRED | |
| L6 | Today strip "**3 of 4** have music" | Today's program workouts carry `payload.playlist` (readable via `/api/calendar?clientPlans=1`); 1:1 sessions (the 07:00 Priya row) have no playlist field | DERIVABLE | Sessions with music would be NEW. |
| L7 | "Dana · 5k Prep · Day 1 · No music · ＋ Attach" | A workout today with `payload.playlist` null | DERIVABLE | |
| L8 | Card cover art | Spotify playlist images (API), not stored | DERIVABLE | |
| L9 | "28 tracks · 2h 14m · 75–95 BPM" | `tracks`, `duration` resolved once at import, Spotify only (`soundtracks/route.ts:55-76`, `:104-108`); `bpm` is free text the coach types | WIRED | Duration sums only the first page of items (≤100 tracks); Apple rows read 0 tracks; PATCH of a new URL does not re-resolve; never re-synced. |
| L10 | Energy strip (one bar per track, Easy/Build/Peak, width by length) | No per-track storage, no energy tags | NEW | |
| L11 | "Energy not tagged · Tag in Builder →" | As L10 | NEW | |
| L12 | "→ Strength Block 3 · Day A · +2 more" | Scan `coach_plans` builder days for `day.playlist` (matched by **name**; no id link) | DERIVABLE | `coach_soundtracks.attached` exists but the website never writes it. |
| L13 | "7 clients hear it" | Days with this playlist × usage per template | DERIVABLE | |
| L14 | ＋ Attach on each card | Today the attach surface is the demo matrix (A2) | DERIVABLE | |
| L15 | Footer "Shape never streams… without one they get Shape Radio" | Policy copy; the fallback to Shape Radio is not something the card does today | MOCK-ONLY | Verify before shipping the sentence. |
| L16 | Crumb "6 playlists · playing on 11 days" | Count of program days with a playlist | DERIVABLE | |

The live page also shows "CLIENT LISTENS", hard-coded to 0 for every real playlist
(`trainerPlaylistsPage.jsx:15`, `:84`); the mock is right to drop it.

## Playlists · Attach (`$S/coachmock/playlists-attach-v2.html`)

| # | Element | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| A1 | "2 days need music" | Program days with clients and no playlist | DERIVABLE | |
| A2 | Rows: program → days ("Day A · Lower · 65 min"), type dot, "Strength · 5 clients" | `coach_plans` builder weeks/days + usage. **Today the website's matrix rows are a hard-coded demo list for every coach** (`TrainerApp.html:141` → `trainerPlaylists.jsx:146-154`; nutritionist `nutritionistPlaylists.jsx:145`) | DERIVABLE | Bug: live coaches see "Lower Pull (Deadlift) · 14 clients" etc. Session minutes per day need an estimate (no per-day duration field). |
| A3 | Click a cell to attach / detach, "✓ 5" | Toggle is local React state, never saved (`trainerPlaylistsPage.jsx:424`) | DERIVABLE | Real path: set `day.playlist` in the template. Assignments are snapshots, so already-assigned clients change only after "Update future assignments". |
| A4 | Column header: cover, name, "3 days" | Count of days per playlist | DERIVABLE | |
| A5 | Gap row "Legs · No music · Marcus T. · 60 min · Sat" | Template day + who has it | DERIVABLE | |
| A6 | "5k Prep · Day 1 · Dana has it today" | Today's `client_workouts` | DERIVABLE | |
| A7 | Rows "Foundations · Custom · 1 client", "Onboarding · Custom" | No per-client program entity (P13) | NEW | |
| A8 | "1:1 sessions" rows (Lower pull · Priya S., Upper push · Deandre K. · Priya S.) | `sessions` has no playlist | NEW | |
| A9 | Fold "No clients yet: Return to Gym · Day 1 → Mobility + Warmup" | Usage 0 + template days | DERIVABLE | |

## Playlists · Builder (`$S/coachmock/playlists-builder-v2.html`)

| # | Element | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| B1 | Editable name | PATCH `name` | WIRED | |
| B2 | "Spotify · your library · open.spotify.com/… · **synced 2d ago** · Replace link" | url/provider WIRED; no sync ever runs (metadata resolved once at POST); Replace = PATCH url, which does not re-resolve tracks/duration | NEW | "synced" needs a re-fetch job or on-open refresh. |
| B3 | "28 tracks · 2h 14m · 75–95 BPM, your range · tagged 20 of 28" | Counts as L9; "tagged 20 of 28" needs tags | NEW | |
| B4 | "2 unsaved changes · 1 tag, 1 move" + Save | No track-level edits exist | NEW | |
| B5 | "Open in Spotify ↗" | `url` | WIRED | |
| B6 | ⋯ Share with team · Delete | DELETE route exists (`soundtracks/route.ts:162`); "Share with team" has no backend (the live button has no handler) | NEW | Delete WIRED, share NEW. |
| B7 | Session arc: tracks against Strength Block 3 · Day A's warm-up / top sets / machines / core / cool-down over 65 min | Needs the track list (B9), energy tags (B10) and per-block minutes (the builder has blocks, sets, rest, tempo but no block timing) | NEW | Block timing is estimable from sets × rest. |
| B8 | "✓ Peak covers the top sets. Track 8 runs 1:42 into Machines." | Depends on B7 | NEW | |
| B9 | Track list: 28 distinct tracks, title, artist, start, length, "no repeats" | Spotify Web API returns the items; the route only asks for `tracks.items(track(duration_ms))` (`soundtracks/route.ts:62-64`) and stores nothing | DERIVABLE | Apple Music needs MusicKit. The live Builder shows looped sample tracks. |
| B10 | Energy tag per track (Easy / Build / Peak) | No storage | NEW | e.g. a `track_tags` jsonb on `coach_soundtracks`. |
| B11 | ⠿ drag to reorder → writes back to Spotify | Scopes already requested: `playlist-modify-public playlist-modify-private` (`src/lib/integrations/providers.ts:47`); `/api/integrations/spotify/save-playlist` exists | NEW | Works only on playlists the coach owns, through their own OAuth; not for Apple. |
| B12 | "After the session · tracks 17–28 · 8 untagged" | As B9-B10 | NEW | |
| B13 | "On the client's card" preview "Heavy Squat Day · 28 tracks · from Maya · Open ↗" | The card gets `{ name, meta }`; "Open" is NEW (L1) | DERIVABLE | |
| B14 | "Note for clients" | `coach_soundtracks.tag` (shown as the page's note) | DERIVABLE | Not carried to the client's card. |
| B15 | "BPM range · you set it · shown on the card" | `bpm` text WIRED; the builder's picker builds `meta` from `x.track_count`, a field that does not exist (`dashBuilder.jsx:3077`; the column is `tracks`), so `meta` is always empty | DERIVABLE | **Bug.** |
| B16 | "Plays on · 3 days · 7 clients" with per-day counts; "Lower pull · 1:1 · Priya S. · today 07:00 ✓" | Template days by playlist name + usage; the 1:1 row is NEW (A8) | DERIVABLE | |
| B17 | "Editing 1 of 6 · Switch playlist ▾" | The list | WIRED | |

**Nutritionist variant.** Same page with `NUTRI_CTX`; attach targets are a demo meal-prep list
(`nutritionistPlaylists.jsx:145`) for everyone, the same bug as A2. A nutritionist has no
"workout day" to attach to; decide what music attaches to (a prep session?) before building.

## Shell (all pages)

| # | Element | Source today | Status | Freshness, caveats |
|---|---|---|---|---|
| X1 | ⌘K "Search clients, plans, or type a command" | The header has "Search Shape" (names, @handles, goals across Shape, `pageShell.jsx:1167-1180`); no roster/library search or commands | DERIVABLE | Roster and library are already loaded in the page; commands would be NEW. |
| X2 | Bell with unread dot | Header bell over `/api/notifications` (`pageShell.jsx:448`) | WIRED | |
| X3 | "Mock-up · example data" stamp | Live pages show the demo band only in demo mode | WIRED | |

## Status count per page

| Page | Elements | WIRED | DERIVABLE | NEW | MOCK-ONLY |
|---|---|---|---|---|---|
| Today + catalog | 48 | 25 | 17 | 4 | 2 |
| Week | 28 | 13 | 12 | 3 | 0 |
| Schedule | 20 | 14 | 6 | 0 | 0 |
| Clients + peek | 30 | 16 | 13 | 0 | 1 |
| Programs + review | 18 | 6 | 7 | 4 | 1 |
| Playlists · Library | 16 | 4 | 8 | 3 | 1 |
| Playlists · Attach | 9 | 0 | 7 | 2 | 0 |
| Playlists · Builder | 17 | 3 | 5 | 9 | 0 |
| Shell | 3 | 2 | 1 | 0 | 0 |
| **All** | **189** | **83** | **76** | **25** | **5** |

---

## Known bugs found (file:line)

1. **Today's day and week on the server clock.** `src/app/api/trainer/dashboard/route.ts:132-149`
   and `src/app/api/nutritionist/dashboard/route.ts:126-143` (`todayStart.setHours(0,0,0,0)`,
   `startOfWeek` in `src/lib/time.ts:7`). On UTC servers a US coach's Today drops evening sessions and
   shows tomorrow's from late afternoon; "Sessions this week" shifts on Sunday evening.
2. **Program leg reads a table with no live writer.** `src/lib/shared-overview.ts:241`
   (`coach_program_assignments`) → `bsProgramLeg` (`src/lib/coach-client-legs.mjs:61`). The only
   insert is `src/app/api/program-tools/templates/route.ts:150`, which no page or app calls. Website
   assignments write `client_workouts` (`public/newdesign/dashBuilder.jsx:1705` → `/api/trainer/workout`).
   Program column, peek, Week panel and "Programs ending soon" read "Not set" for programs assigned on
   the website. Worth a read-only row count on the live table to confirm.
3. **Playlists Attach matrix is demo data for real coaches, and does not save.**
   `public/newdesign/TrainerApp.html:141` (`attachTargets: TRAINER_WORKOUTS`, a constant at
   `trainerPlaylists.jsx:146`), `NutritionistApp.html:139`; toggle is local state
   (`trainerPlaylistsPage.jsx:424`).
4. **Builder playlist chip loses its meta.** `public/newdesign/dashBuilder.jsx:3077` reads
   `x.track_count`; `coach_soundtracks` has `tracks` (`supabase-migrations/2026-06-13-coach-soundtracks.sql:15`).
5. **Week food logs ignore the selected week.** `public/newdesign/dashWeek.jsx:267` shows the last 7
   days at read time on every week, including past weeks; the weigh-in is also the latest, not the
   week's.
6. **"Adherence" is not what it says.** `get_client_stats` counts completed ÷ booked sessions over 42
   days for the client across every coach (`supabase-migrations/2026-10-31-client-stats-window.sql:57-64`):
   a trainer's figure includes the nutritionist's consults, and a past booking nobody marked complete
   counts as missed.
7. **Stale copy on live money cards.** "payouts connect soon" (`dashToday.jsx:107`,
   `trainerDashboard.jsx:92`) while Stripe payouts are live on Business.
8. **Dead writes.** `shape.dashQueueDone.*` is written to localStorage after an assign
   (`dashBuilder.jsx:1729`, `dashMealBuilder.jsx:434`) but the queue now reads the server ledger and
   `coach_week_plans`; nothing reads the key except the scrubbers.
9. **Spotify duration under-reports long playlists** (first 100 items only,
   `src/app/api/coach/soundtracks/route.ts:62-70`), and Replace link never re-resolves (PATCH, `:136-160`).
10. **Live wins are thin by construction.** `milestones: null` (`public/newdesign/dashData.jsx:268`)
    and no `totals`, so live "Client wins" can show only streak landmarks and achieved goals.

---

## Less data, more direction

The owner: "I don't want coaches being overwhelmed with data." Where the mock shows raw figures, these
are the ones that could become a recommendation or an alert **from a source that exists today**:

| Raw element | Replace with | Source that exists |
|---|---|---|
| Roster logging 69% + sparkline (T16-T18) | "3 stopped logging · Nudge" with their names | `food_gap` flags (`dashSignals.js:548`); the hourly notify cron already pushes `client_red`/`client_amber` on the same engine |
| Peek's Shape score 63 ▼8 + 8-week line (C23) | The engine's directive: one verdict, one reason, one action ("Reconnect", "Check-in due", "Sleep is the lever") | `buildDirective` (`dashSignals.js:1478`), already computed per row in the triage feed |
| Peek's Adherence / Streak / Score trio (C17-C19, C23) | The top flag's reason sentence, then the facts on demand | `getTriageFeed` `reasons` |
| Week's 60-tile ratings matrix (W12-W14) | The patterns (W8, W10) plus only the tiles that are flagged (rating ≤2, or stress/hunger ≥4) | Check-in ratings; the live row already colours exactly those (`DwkRatings` flag rule) |
| Week's six rating bars per client (W23) | The member's weekly readout, where one exists ("The read") | `ai_weekly_readouts`, read under RLS without spending the member's call (`dashWeek.jsx` `useWeekReadouts`) |
| Money $1,820 + payout date on Today (T19-T20) | Only an alert when money needs the coach: a renewal Stripe is retrying, a plan set to end | `paymentRetrying` on the roster (`coach-roster.ts`), renewals with cancel flags (`/api/trainer/analytics?renewals=1`, `loadCancelFlags` `src/lib/stripe.ts`) |
| Capacity "5.5 of 29 hours" (T45, S6) | "2 paid sessions to book" | `/api/coach/to-schedule` (paid sessions with no booking), already on Schedule |
| Programs due 10 · 8 ready (T12-T13) | "2 waiting on a check-in · Nudge" and "Programmed this week ✓" | Programming queue `blocked` rows + `coach_week_publishes` |
| Clients Score and Spoke columns (C7) | Drop the columns; the row's reason already says "Score ▼8" or "Quiet 6d" when it matters | Flag labels |
| Up next "No shared history yet" (T9) | The engine's two most useful facts (goal pace, check-in state), or the intake's goal for a new client | `dashContextLine` (`dashToday.jsx:395`), `record.intake` |
| Playlists "3 of 4 have music" (L6) | "Dana's 5k day has no music · Attach" only when there is a gap | Today's `client_workouts` `payload.playlist` |
| Wins list (T42) | Keep, it is already an action ("Congratulate") | `DashWinsPanel` |

**Drop or park as proposed features** (no source, or the data says otherwise): "Rae sees it too" /
"Rae flagged Marcus too" (T26, C20, C26), "This week's just came in" on a late check-in (T27), the
"asked about creatine" grouping (W9) unless AI grouping is built, the drawer's coaching advice line
(P16), session locations like "Brooklyn" (T35), ⌘K commands (X1), "synced 2d ago" (B2), and the whole
Builder session arc (B7-B8) until tracks and tags exist. The "4 this week · 2 good news" chips (T32)
need a definition or should go.
