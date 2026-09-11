# Website dashboard review — coaches & clients (2026-09-09)

**Subject:** the `public/newdesign/` dashboards — `TrainerApp.html`, `NutritionistApp.html`,
`ClientApp.html`, and the standalone per-client page `TrainerClient.html` /
`NutritionistClient.html`.

**The brief (owner, 2026-09-09):** *"review the shape website dashboard for coaches and
clients … how fluid it is, easy to use and navigate … find gaps where it could be more
customizable. The website needs to be the coaches' office days where they can sit down and
do a real deep dive on their clients, check status at the end of each week, and get an
overall better visual of their own progress as well as their clients'. Also a better idea of
how they're progressing financially on the platform, number of clients increasing or
decreasing. And clients, which will probably use the website less than coaches, still make
sure it is up to speed with no gaps."*

**Method:** a full source read of the 31 dashboard modules (~22k lines), the coach/client
API routes they call, the tables behind those routes, and the mobile coach/client apps for
parity; plus headless renders of every tab in the signed-out demo state (§10). No live
account was used, so every "on live" claim below is read from the code path a signed-in
account takes, with the file and line cited.

---

## 1. The verdict

The bones are right and recent: three single-page shells with instant hash-routed tabs, one
data layer (`dashData.jsx`) that resolves live-or-demo so the UI never has to know, a
signals engine that ranks a roster red → amber → green, GridStack layouts persisted per
tab, and a Business tab that is wired to real subscriptions and real Stripe payouts under
an explicit honest-data rule. As a **coach's office** it falls short of the brief in five
specific ways, all fixable and most of them with data the backend already has.

1. **The deep dive dead-ends.** The only per-client view inside the coach SPA is a 440px
   drawer. Its "Open full profile →" (and Today's "Last notes") go to
   `ClientProfile.html`, a demo persona page with **no backend calls** that falls back to
   "Priya Shah" for any unknown name (`client.jsx:80-85`). The real per-client page —
   check-ins, sleep/recovery, health profile, measurements, photos, sessions
   (`coachClientDetail.jsx`, 961 lines) — is **linked from nothing except the Shared-clients
   tab** (`sharedClientsTab.jsx:132`). A coach cannot get from their roster to their client's
   file. (§4)
2. **There is no "week".** Nothing on the website is an end-of-week object: no
   week-over-week comparison (one variance line, on the orphaned page), no check-in
   read-back or reply, no "reviewed" state, no notes on the web at all (the drawer's
   "Coach notes" is always empty on live — `dashData.jsx:56-94` never carries them), and the
   weekly readout the app already computes (`/api/ai/weekly-readout`, with a coach read
   policy on `ai_weekly_readouts`) is consumed by no website surface. (§4)
3. **The coach's own trajectory isn't drawn.** Business shows a point-in-time MRR and a
   90-day bar of subscriber *adds*; churn is a list. There is no series of **active clients
   over time**, no net adds, no churn rate, no MRR history, no tenure, no targets vs actuals
   (the Goal tab's "current" values are typed in by hand). Every one of those is derivable
   today from `subscriptions` rows the analytics route already reads. (§5)
4. **Fabricated numbers reach signed-in accounts.** The sidebar money card "$18,420 · Month
   to date · +22%" and the "Clients 34" badge are literals (`coachNav.jsx:11,25,34,47`)
   rendered on six of ten coach tabs with no demo band; the coach Score page defaults to
   "6,420 · MASTER · Top 4% of trainers"; Community posts as "Priya M."; the per-client
   page substitutes demo lifts, bodyweight series and stat-grid numbers field-by-field when
   data is missing; the client Score and Habits tabs fall back to 1,284 points and nine fake
   habits when their fetch fails, with no band. This is the house honest-data rule, broken on
   the surface the brief wants coaches to trust. (§8)
5. **Customization is layout-only.** Drag, resize, hide and reset on the card tabs — and
   nothing else: no date ranges, no column choice or sort, no saved roster views, no widget
   settings, no per-coach signal thresholds, no default landing tab, no units, theme or
   locale on the web (the app has 18 papers, 25 textures and 13 locales), and no notification
   preferences for coaches at all. (§6)

The client side is in better shape than the coach side where it matters: Today, Progress,
Workouts, Nutrition, Goal and Settings are live, honest about empties, and write real data.
Its gaps are the same shape as the coach's (no weekly readout, no check-in history, a
score-history link that is `href="#"`, a no-op Leaderboard button) plus a navigation defect
that makes every in-card link a full page reload. (§7)

---

## 2. What exists today

| Role | Tabs (hash routes) | Live data source | Drag/resize grid | Demo band when signed out |
|---|---|---|---|---|
| Trainer / Nutritionist | today · schedule · clients · programs/plans · business · playlists · community · goal · score · profile | `/api/{role}/dashboard`, `/clients`, `/analytics`, `/api/clients/{id}/shared-overview`, `/api/calendar`, `/api/coach/plans`, `/api/coach/score` | Today, Goal, Score | Today, Clients, Schedule, Programs/Plans, Business only |
| Client | today · progress · workouts · nutrition · library · team · community · score · habits · goal · profile · settings | `/api/client/dashboard`, `/checkin-kit`, `/plan`, `/nutrition`, `/score`, `/progress`, `/train`, `/self-training`, `/habits`, `/team`, `/commitment`, `/reminders`, Stripe routes | Today, Progress, Workouts, Nutrition, Score, Habits, Goal | Today, Progress, Workouts, Nutrition, Goal only |
| Coach → one client | standalone `TrainerClient.html?id=` (not a route) | `/api/clients/{id}/shared-overview` + realtime `user_activity_live*` | none | none |

Shell: `trainerDashboard.jsx` (`DashSidebar` :9, `DashPage` :42, `DashShell` :172). Data
layer: `dashData.jsx` (`useDashboard(role)`; a 60s cache; roster first, then per-client
enrichment through a 4-wide pool). Engine: `dashSignals.js` (twelve rules, thresholds at
:50-72). Layout persistence: `dashGrid.jsx` → `user_goals('dashboard_layout')` per role+tab.

---

## 3. Fluidity and navigation

**What is genuinely fluid**

- Tab switches are same-document hash changes — no reload, no recompile; back/forward work;
  the URL is shareable (`TrainerApp.html:96-107`, `ClientApp.html:130-142`).
- The roster drawer opens on click or Enter/Space, closes on Escape
  (`dashRoster.jsx:352-356, 466-467`).
- Schedule is a real planning surface: month/week calendar, drag-to-reschedule with
  optimistic update and revert, an availability grid that feeds the marketplace
  (`dashSchedule.jsx:106-159, 346-367`).
- Programs/Plans → Assign is a true multi-client action with the guardrail's verdict
  surfaced verbatim (`dashBuilder.jsx:226-268`).

**Where the flow breaks**

- **F1 — Two navigations for the same tabs, one of them slow.** The signed-in header nav
  (`pageShell.jsx` `PORTAL_NAV`) links to the legacy pages — `TrainerDashboard.html`,
  `TrainerSchedule.html`, `TrainerClients.html`, `TrainerPrograms.html`,
  `TrainerAnalytics.html` — each of which `location.replace()`s into the SPA
  (`TrainerDashboard.html:5`). So the header's "Clients" is a full page load and recompile,
  while the sidebar's "Clients" is instant. Same on the client side (`ClientTrain.html`,
  `ClientProgress.html` …). Fix: point `PORTAL_NAV` at `<App>.html#slug`, or drop the
  duplicate header links inside the dashboards.
- **F2 — Every in-card link on the client side also reloads.** Card CTAs target the legacy
  `.html` files rather than `#slug` (e.g. Nutrition's "Log meal" navigates to
  `ClientDashboard.html`, `dashNutri.jsx:290`; "How streaks work" → `ClientScore.html`,
  `clientHabits.jsx:330`). Each is a reload-and-redirect instead of a hash change.
- **F3 — The per-client path.** Roster row → drawer → "Open full profile →" →
  `ClientProfile.html?client=<name-slug>` (`dashRoster.jsx:387`, `dashToday.jsx:284-287`).
  That page is 100% demo (`client.jsx`, zero fetches) and falls back to "Priya Shah". The
  real page (`TrainerClient.html?id=<uuid>`) is a standalone load with its own Babel pass
  and is reachable only from the Shared-clients tab. There is no `#client/<id>` route.
- **F4 — Dead calendar overlay on coach Today.** `calendarEvents` mounts `CalendarOverlay`
  but both "OPEN CALENDAR →" openers sit in the non-grid branch of `DashShell`
  (`trainerDashboard.jsx:277, 292`), and coach Today always renders the grid branch
  (`dashToday.jsx:782-799`). The overlay (and its 26 hardcoded demo events,
  `dashToday.jsx:83-110`) is unreachable; Schedule is the real calendar.
- **F5 — The header refetches identity on every tab.** Each route renders its own `<Header/>`
  and the Header fetches `/api/me` on mount (`pageShell.jsx:412`), so every tab switch
  re-resolves the signed-in user and re-paints the role menu.
- **F6 — Marketing chrome above the office.** The 56px fixed marketing header (60px logo,
  people search, Radio wordmark) sits above every dashboard. What a coach actually needs up
  there — a notifications inbox, unread messages, the current week — is absent; Messages is
  a separate standalone page (`TrainerMessages.html`).
- **F7 — Narrow widths.** The 240px sidebar is an inline `gridTemplateColumns: "240px 1fr"`
  on `DashShell`/`DashPage`; the `.dash-shell-grid` collapse rule in `dash.css` applies only
  to the client Settings route. Renders at 1024px and 390px are in §10.
- **F8 — No keyboard layer.** No shortcuts, no command palette, no "jump to client";
  the header's ⌕ searches *people* site-wide, not the coach's own roster or programs.
- **F9 — Filter state does not survive.** Roster filter chips and Progress trend tabs reset
  on every tab switch; nothing but the grid layout is remembered.

---

## 4. The coach's office day: the weekly deep dive

**What a coach can do today on the web**

- Today: a triage pulse (severity pills, per-row Message with a generated draft), today's
  schedule with expandable rows (Message · Last notes · Start log), a programming queue
  ("Write plan" marks a week done — in `localStorage` only, `dashToday.jsx:344-357`),
  client wins, and a business summary (`dashToday.jsx:782-791`).
- Clients: a roster table with search and four filter chips (At-risk · All · New · On track),
  three point-in-time stat cards (active · MRR · avg per client), the drawer, a
  Shared-clients tab for coach↔coach coordination (`trainerClientsPage.jsx`,
  `sharedClientsTab.jsx`).
- The drawer (trainer lens): Shape Score · 8 weeks, Goals (editable, saves to
  `/api/clients/{id}/goals`), Session adherence, Coach notes, Milestones, nutrition
  read-only. Nutritionist lens: last 3 days of logs, goals, macros vs targets, weigh-in
  trend, training read-only (`dashRoster.jsx:326-348`).

**Why it is not yet a deep dive**

- **D1 — The live record is mostly empty, so the roster and the engine under-perform on
  real accounts.** `_dashRecordFromLive` (`dashData.jsx:56-94`) sets `shapeScoreHistory`,
  `streaks`, `lastContact`, `foodLogs.lastLoggedOn`, `nutrition.target*`, `milestones`,
  `coachNotes`, `recentLogs` and `program` to null. Consequences: the trainer roster's
  Score · Program · Streak · Last-contact columns read "Not shared" on every live row; the
  drawer's Score, Notes and Logs sections show their empty copy; and because a rule with a
  missing input is skipped (`dashSignals.js:9-11`), most of the twelve rules cannot fire —
  in practice only the check-in, goal-slip and (partially) food-gap rules do. The demo
  roster shows the whole engine; a real one shows a sliver. The comments in `dashData.jsx`
  already name the missing sources (a weekly-score RPC, a thread-timestamp lookup).
- **D2 — No week-in-review surface.** The things a coach wants on Friday exist as data and
  are not composed anywhere on the web: this week's check-ins (`client_checkins`;
  `shared-overview` returns the last 4), adherence this week vs last
  (`get_roster_weekly_adherence`, used only on the orphaned page,
  `coachClientDetail.jsx:399-403`), weekly readouts (`ai_weekly_readouts`, coach-readable),
  what was published this week (`coach_week_publishes`), and what is due next week (the
  queue, which lives in `localStorage`). Nothing records that a coach *did* the review.
- **D3 — No coach notes, no check-in reply, no actions from the client view.** The mobile
  Case File has a private coach note, a check-in reply draft (`BSProCheckinDraft`),
  Adjust program (`BSProAdjustProgram`), Schedule session, Assign, and a block/phase
  setter. The web client page has one action: "Message counterpart"
  (`coachClientDetail.jsx:597`). The endpoints exist and go uncalled from the site:
  `/api/trainer/adjust`, `/api/trainer/week`, `/api/coach/review-note`,
  `/api/coach/roster-sleep`, `/api/coach/roster-weekend`, `/api/trainer/console`,
  `/api/trainer/messages`.
- **D4 — One batch action.** Assign is the only multi-client action. No multi-select
  message, no bulk "reviewed", no export.
- **D5 — The client page fabricates when data is missing.** Bodyweight series, key lifts,
  macro targets and the stat grid each fall back to demo literals for a signed-in coach
  (`coachClientDetail.jsx:474-512`: `[80.4 … 79.2]`, "Back Squat 82.5 kg +7.5",
  `170/200/62`, `96 / 38 of 41 / 8.0 / 3`). A coach reading a new client's file sees a
  plausible athlete who does not exist.

**Recommendations**

- **R1 (P0, small) — Re-link the real client page.** Drawer "Open full profile →" and
  Today's "Last notes" → `TrainerClient.html?id=<uuid>` when `rec.profile.id` exists; hide
  the link otherwise. Never route a live coach to `ClientProfile.html`.
- **R2 (P0, medium) — Bring the client page into the SPA as `#client/<id>`.** The hash
  router already handles unknown hashes by falling back to Today; extend `taSlug()` to
  parse a `client/<id>` prefix and mount `CoachClientDetailPage` inside the shell with the
  sidebar. Keep the drawer as the quick look; make the page the dive. Add the Case File's
  actions there (Adjust · Schedule · Assign · Message · Note) on the existing endpoints.
- **R3 (P0, medium) — A "Week" view.** A tab (or a mode on Clients) with a week cursor
  (‹ this week ›) and one row per client: check-in submitted? (ratings + wins/struggles +
  the question they asked you), adherence this week vs last, log days, weigh-in delta, the
  engine's flags, a **Reviewed ✓** toggle and a private note, per-row Message/Adjust, and
  batch "mark all reviewed" / "message everyone unreviewed". Persist the review state in a
  small table (`coach_client_week_reviews(coach_id, client_id, week_of, reviewed_at,
  note)`) so it is real and survives devices; reuse `coach_workout_review_notes` if a
  per-session note is what the coach wants instead.
- **R4 (P1, medium) — Fill the live record.** Extend `shared-overview` (or add one
  coach-gated RPC) with weekly score points (`score_ledger`), streaks, last-contact
  timestamp, program name + week, coach notes and recent logs, and map them in
  `_dashRecordFromLive`. This alone turns the roster columns, the drawer and the triage
  engine from demo-only into live.
- **R5 (P1, small) — Weekly readout on the web.** Call `/api/ai/weekly-readout` on the
  client page and the Week view; keep the app's "Computed, not written" label and the
  sample-size stamp.
- **R6 (P1, small) — Move the programming queue off `localStorage`.** "Write plan" should
  read `coach_week_publishes` and the Assign flow's real result; a queue that lives in one
  browser is not a queue.
- **R7 (P1, small) — Honest empties on the client page.** Replace every per-field demo
  fallback in `coachClientDetail.jsx:474-512` with the redaction the mobile Case File uses
  ("not shared" / "no sessions yet"); the drawer already does this correctly.

---

## 5. The coach's own trajectory and the money

**What exists**

- Today KPI strip (active clients · monthly net · sessions this week · upcoming) from
  `/api/{role}/dashboard`; the sidebar card becomes "MONTHLY · NET" on Today, Clients and
  Programs when live (`dashToday.jsx:806-808`).
- Business (`dashBusiness.jsx`): revenue plate (MRR gross/net now + 13 weekly bars of
  subscriber **adds**, `coach-growth.ts`), payouts (real Stripe balance/schedule/history, or
  "—" + Set-up CTA until Connect is activated — a registered War Room item), the
  marketplace funnel (views always null, consults + signings real, benchmark hardcoded 30%),
  churn (last 12 canceled subscriptions, exit reason always null until the cancellation
  survey ships), the 0%-commission referral link and origin labels, and roster outcomes
  (30-day workouts, weight change, PRs).
- Goal (`trainerGoalPage.jsx`): coach-authored goals with typed-in current values, a revenue
  calculator, and a hand-entered momentum card. Score (`trainerScorePage.jsx`): the coach
  score, breakdown and tier ladder.

**The gaps against "am I growing?"**

- **M1 — No active-client series.** The only trend is *adds*; departures are a list. The
  question in the brief — clients increasing or decreasing — has no chart. The series is
  one query away: `subscriptions(created_at, status, current_period_end)` gives, for each
  week or month, how many were active, how many joined, how many ended.
- **M2 — No MRR history, no net adds, no churn rate, no tenure.** The analytics route
  reads every field needed (`price_cents`, `fee_bps`, `origin`, `created_at`,
  `current_period_end`) and reduces them to a single "now" number.
- **M3 — One-time revenue is invisible.** `one_time_purchases` (bookings, meal plans,
  `price_cents`, `application_fee_cents`) is never summed anywhere on the dashboard; a coach
  selling sessions sees only subscriptions.
- **M4 — Goals do not move by themselves.** "50 active clients by July · current 34" is
  typed in; the live active count is on the same page's sidebar. Momentum ("+11 clients
  this quarter") is also typed in.
- **M5 — No revenue per client in the roster.** Roster rows carry `mrrCents` and
  `joinedAt` (`coach-roster.ts:97-108`) but the table shows neither; the origin zone shows
  who was brought vs found but not what they pay.
- **M6 — No time-range control, no export.** Everything is fixed at 30 or 90 days; nothing
  produces a CSV or a monthly statement for a coach's accounting.
- **M7 — The Score page is a placard.** The headline, breakdown, "Top 4% of trainers",
  "What Master unlocks", "Path to Icon" and the 12-row "How you earn" table are literals
  unless `/api/coach/score` returns a non-empty breakdown (`trainerScorePage.jsx:7-19,
  27`); "How it works" and "Leaderboard" have no handlers (`:137-138`). There is no score
  history.

**Recommendations**

- **R8 (P0, medium) — A "Practice trajectory" plate on Business.** Three linked series
  over a selectable range (90d · 12mo · all): active clients (line), adds vs ended (paired
  bars, net adds labelled), MRR gross/net (line, with one-time revenue as a second band).
  Derive in `/api/{role}/analytics` from `subscriptions` + `one_time_purchases` the way
  `coach-growth.ts` already buckets adds. Add the four figures the brief asks for: active
  now vs 30 days ago, net adds this month, churn rate (ended ÷ active at start), median
  tenure.
- **R9 (P1, small) — Live-bound goals.** Let a goal bind its "current" to a live metric
  (active clients · MRR · sessions/week · coach score) and compute momentum from the R8
  series; keep manual entry for goals the platform cannot measure.
- **R10 (P1, small) — Revenue and tenure in the roster.** Two columns (MRR · since) with
  sort; a per-client line in the drawer ("$180/mo · 7 months · you brought").
- **R11 (P1, small) — The sidebar card tells the truth everywhere.** Compute it once in
  the data layer (monthly net + active count) and pass it from every route; render "—"
  where it cannot be known. Replace the "Clients 34" badge with the live count.
- **R12 (P2, medium) — Export.** CSV of the roster (name · status · MRR · tenure · origin ·
  fee) and of monthly revenue; a printable monthly statement once payouts are live.
  ⚠ **BOTH CSVs SHIPPED 2026-09-10. THE STATEMENT IS NOT, AND THIS LINE SAYS WHY RATHER
  THAN LEAVING IT LOOKING FORGOTTEN:** it is gated in this item's own words on payouts
  being live, and they are not — Business still reads *"connects when payouts go live"*.
  A statement built now would be a printable page of numbers no processor has settled.
  ⚠ **AND THE ROSTER CSV NEEDED THE ROUTE EXTENDED, WHICH THE ITEM DOES NOT SAY.**
  `coach-roster.ts` carried neither `origin` nor the fee — both are stamped on the
  `subscriptions` rows it already reads, so it now carries `feeCents` (summed from each
  row's **stored** `fee_bps`, never re-derived from today's rate) and `origin` (from the
  client's earliest row, which is the acquisition). Its select moved to `'*'` for the same
  migration-safety reason the analytics route documents: naming the two columns errors the
  whole query on a pre-migration DB, and by this route's own rule a failed subscriptions
  read renders "Not shared" on every row.
- **R13 (P2, small) — Score page honesty.** Zero-state the literals, wire or remove the two
  dead buttons, and add a 12-week points sparkline from `score_ledger`.

---

## 6. Customization

**What a coach or client can change today**

- Card layout: drag (⠿ handle), resize (corner), hide, restore chips, "Reset layout" —
  persisted per role+tab to `user_goals('dashboard_layout')` (`dashGrid.jsx:63-296`). Coach:
  Today, Goal, Score. Client: Today, Progress, Workouts, Nutrition, Score, Habits, Goal.
- Schedule: month/week view, availability hours. Roster: search + four filters (not
  persisted). Progress: trend series tab (not persisted).
- Client Settings (`clientMeSettings.jsx`): profile fields, billing, connected apps
  (Strava · Whoop · Garmin · Oura), nutrition and training preferences, privacy toggles,
  PAR-Q, reminders, a 9-type × 3-channel notification matrix with quiet hours and a daily
  cap, social links, data export, pause, delete.
- Coach Profile extras: credentials + COI upload, listing photos, tour replay, export,
  close account. No notification settings, no preferences of any kind.

**What cannot be changed anywhere on the web**

- Which KPIs a tile shows, a widget's time window, thresholds the engine flags on
  (`dashSignals.js:50-72` are constants), pinned clients, saved roster views, column
  choice or sort, default landing tab, sidebar order, density, week start day.
- Units (the check-in form is kg/cm at `dashProgress.jsx:341-346`; trend tabs are lb at
  `:111`), theme (dark only; the app has 18 papers), language (13 locales on the app; the
  web ignores `/api/client/locale` and `/timezone`).
- Coach notification preferences (the app has a Notifications page; the web has none for
  coaches).

**Recommendations**

- **R14 (P1, medium) — An "Office settings" panel for coaches** (under Profile or a new
  Settings tab, mirroring the client one): default landing tab, week start, units, theme
  (light/dark paper), locale, signal thresholds (e.g. "flag after N days without a log",
  "check-in overdue after N days"), roster default filter and sort, notification
  preferences via the same `get_notification_center()` shape the client matrix uses.
- **R15 (P2, medium) — Widget settings.** A ⚙ on each card: KPI picker for the stat
  strips, time window (7d · 30d · 90d) per chart, pin clients to Today's pulse, choose the
  drawer's sections per lens.
  ⚠ **THE ROSTER SORT SHIPPED 2026-09-10, AND IT IS THE ONLY PART OF R15 THAT HAS.** It
  is here rather than under R16 because R16 asked to *remember* a sort that did not
  exist — every roster column with a value behind it is now a sort button, remembered per
  account alongside the filter and the tab. ⚠ **THE ⚙ AND THE PER-CHART TIME WINDOW
  SHIPPED 2026-09-11**, and **PINNING SHIPPED 2026-09-11** — a per-row control rather than
  a gear entry, because the gear holds settings that belong to the CARD and a pin is an
  act about one client. ⚠ **AND THE DRAWER'S SECTIONS SHIPPED 2026-09-11** — the control is
  in the drawer rather than on a card, because the drawer opens from four places. **One
  remains: the KPI picker for the stat strips.**
  ⚠ **AND TWO COLUMNS DELIBERATELY DO NOT SORT:** PROGRAM and GOAL PHASE are free text a
  coach types, so alphabetical order over them answers no question. They render as plain
  text rather than as buttons that lead nowhere.
- **R16 (P2, small) — Remember state.** Persist roster filters, sort, Progress trend tab
  and Schedule view alongside `dashboard_layout`.
  ⚠ **SHIPPED 2026-09-10, AND ONE QUARTER OF IT DOES NOT EXIST TO BE PERSISTED.** The
  roster filter, both roster tabs, the Progress trend tab and the Schedule view are now
  remembered per account in `user_goals('dashboard_prefs')`. **Sort is not, because
  `dashRoster.jsx` has no sort control** — measured, not assumed: it carries a filter
  (all · needs eyes · new · on track) and a search box, and no ordering control of any
  kind. Remembering a default for a control that does not exist is a preference for a
  feature that does not exist; the sort belongs to **R15**, and its memory follows it
  there. ⚠ **AND IT DID, LATER THE SAME DAY** — the sort control shipped under R15, so
  every roster column with a value behind it is a sort button and the choice is
  remembered as `rosterSort` / `rosterSortDir`. **R16 is complete.** The search box is
  deliberately **not** remembered either — a half-typed name is
  a moment, not a standing preference, and restoring it would show a coach a roster
  mysteriously narrowed to "pri" a week later.

---

## 7. The client website

**Up to speed**

- Today, Progress, Workouts, Nutrition, Goal and Settings are live, write real data
  (check-in with photos, hydration with optimistic rollback, meal logs, self-programmed
  weeks with an approve-before-save AI draft, reminders, PAR-Q, the notification matrix),
  and are honest about empties — `dashProgress.jsx:711-718` explicitly bans demo data for a
  signed-in member because the gauges are self-reported health data.
- The demo hygiene on Today (`dashClient.jsx:342-347, 491-496`) is the standard the coach
  side should adopt.

**Gaps**

- **C1 — No history where the app has it.** "VIEW FULL LEDGER →" is `href="#"`
  (`clientScore.jsx:331`); "Leaderboard" and "How it works" have no handlers (`:347-348`);
  `/api/client/score-record` and `/api/leaderboard` exist and are unused. Check-ins are
  write-only (no read-back, no coach reply); there is no weekly readout, no adherence-over-
  time view, no sleep/steps/strength history pages.
- **C2 — Dead surfaces.** Library shows only empty states when signed in and has three
  dead controls (`clientLibrary.jsx:43-44, 75`); Team's "Book session →" opens the demo
  chat widget (`clientTeam.jsx:64`) — there is no booking flow on the web; Community's
  meetup RSVP has no handler and channel JOIN is local state (`dashboardCommunity.jsx:1035,
  1167`).
- **C3 — Demo leaks without a band.** Score falls back to 1,284 points, a fabricated
  breakdown and ledger when its fetch fails (`clientScore.jsx:121, 142-177`); Habits keeps
  nine seeded habits with six-day histories on any non-array response (`habits.jsx:28-38`,
  `clientHabits.jsx:56`), plus a fixed "WEEK 16 OF 52" eyebrow and a "FROM MAYA" note
  (`clientHabits.jsx:312-326`); the sidebar card reads "1,284 · Tempo · 716 to Form" on 11
  of 12 tabs (`clientNav.jsx:24`); the chat widget's demo threads feed unread counts into
  the live Team card (`dashClient.jsx:78-86`); Community posts as "Priya M." under
  "4,218 MEMBERS · 128 ACTIVE NOW" (`dashboardCommunity.jsx:219, 1202`).
- **C4 — Navigation reloads** (F1/F2): every card CTA and the header nav leave the SPA.
- **C5 — No units, theme or language on the web** (§6).

**Recommendations**

- **R17 (P1, small) — Wire what exists:** score record page + leaderboard from their
  routes; the weekly readout card on Progress; check-in history with the coach's reply
  under the form.
- **R18 (P1, small) — Fix or remove dead controls** (Library's Search/Saved, Score's
  ledger/How-it-works/Leaderboard, Team's Book session, Community's RSVP/Join) — a button
  that does nothing costs more trust than an absent one.
- **R19 (P1, small) — Hash links everywhere** (`#slug`, never `Client*.html`), and the
  Nutrition "Log meal" should log in place like Today does.
- **R20 (P2, medium) — Booking + inbox on the web:** session booking against
  `provider_availability`/`sessions`, and a notifications inbox (the app has both).
  ⚠ **THE INBOX SHIPPED 2026-09-10. BOOKING HAS NOT.** `/api/notifications` had been
  live since the 2026-05-30 migration and only the mobile app read it — a member could be
  told on their phone that their coach had replied and see nothing on the web. There is a
  bell in the shared header now (signed-in only), with mark-one and mark-all, on every
  newdesign page. **Booking is still open**: `/api/availability` and `/api/sessions` both
  exist, and the client Team page's "Book session" is still one of R18's dead controls.

---

## 8. Honest-data leaks and dead controls

Every row below reaches a **signed-in** account with no demo label.

| Surface | What shows | Where |
|---|---|---|
| Coach sidebar — Schedule, Goal, Score, Playlists, Community, Profile, client page | "PAYOUT APR 30 · $18,420 · Month to date · +22%" (nutritionist "$11,240 · +14%") | `coachNav.jsx:25,47`; passed literally at `dashSchedule.jsx:382`, `trainerGoalPage.jsx:289`, `trainerScorePage.jsx:132`, `TrainerApp.html:85,95,98`, `coachClientDetail.jsx:435-518` |
| Coach sidebar — every tab | "Clients 34" / "Clients 28" badge | `coachNav.jsx:11,34` |
| Coach Score | "6,420 · COACH SCORE · MASTER", "Top 4% of trainers on Shape.", breakdown, unlocks, path, earn table — unless the API returns a non-empty breakdown | `trainerScorePage.jsx:7-19, 27, 82-114, 135` |
| Coach Goal | eyebrow "YOUR GOALS · Q2 2026" | `trainerGoalPage.jsx:290` |
| Community (both roles) | poster identity "Priya M. · Hypertrophy · 2,140" on your own posts; "4,218 MEMBERS · 128 ACTIVE NOW"; ten channels and three meetups with counts | `dashboardCommunity.jsx:219, 1179-1202, 1330` |
| Coach client page | demo bodyweight series, key lifts, macro targets, stat grid when a field is missing | `coachClientDetail.jsx:474-512` |
| Coach Today → "Last notes"; drawer → "Open full profile" | the "Priya Shah" demo persona page | `dashToday.jsx:284-287, 328`; `dashRoster.jsx:387`; `client.jsx:80-85` |
| Client sidebar — 11 of 12 tabs | "SHAPE SCORE · 1,284 · Tempo · 716 to Form"; Team badge "2" | `clientNav.jsx:14, 24` |
| Client Score (fetch failure) | 1,284 points, fabricated breakdown/ledger/momentum, "+36 · vs 28 last week" | `clientScore.jsx:121, 142-177, 189, 295` |
| Client Habits (fetch failure) | nine seeded habits with histories; "WEEK 16 OF 52"; "FROM MAYA" | `habits.jsx:28-38`; `clientHabits.jsx:56, 312-326` |
| Client Team badge | unread counts from the demo chat threads | `dashClient.jsx:78-86`; `clientChatThreads.jsx` |
| Client Settings (silent auth failure) | the "Priya Shah" sample profile | `clientMeSettings.jsx:13-53, 433` |

Dead or no-op controls: coach Score "How it works" / "Leaderboard" (`trainerScorePage.jsx:137-138`);
Profile "Pause coach profile" (`dashProfileExtras.jsx:341`); Programs "Publish v(n+1)" bumps
a local version only (`dashBuilder.jsx:390`); Performance panel is always empty on live
(`dashBuilder.jsx:455`); Clients "Invite client" goes to `MemberProfile.html` with no invite
flow (`trainerClientsPage.jsx:32`); unused `ProfileHero`/`BioCard`/`SubscriptionCard` with
dead buttons (`trainerDashboard.jsx:368-450`); client Score ledger/leaderboard
(`clientScore.jsx:331, 347-348`); Library Search/Saved/cards (`clientLibrary.jsx:43-44,
75`); Team "Book session" (`clientTeam.jsx:64`); Community RSVP/Join
(`dashboardCommunity.jsx:1035, 1167`); Habits visibility pills after creation
(`clientHabits.jsx:191`).

---

## 9. Prioritised roadmap

| # | Item | Priority | Size | Data ready? |
|---|---|---|---|---|
| R1 | Re-link the real client page from drawer + Today | P0 | S | yes |
| R11 | Live sidebar card + client count on every tab; "—" when unknown | P0 | S | yes |
| R7 | Honest empties on the coach client page | P0 | S | yes |
| R2 | `#client/<id>` route inside the SPA with Case File actions | P0 | M | endpoints exist |
| R3 | Week view: check-ins · adherence Δ · flags · Reviewed ✓ · note · batch | P0 | M | one small table |
| R8 | Practice trajectory: active clients · adds vs ended · MRR over time | P0 | M | yes (`subscriptions`, `one_time_purchases`) |
| R4 | Fill the live record (score history, streaks, last contact, program, notes) | P1 | M | RPC/route additions |
| R5 | Weekly readout on the web | P1 | S | yes |
| R9 | Live-bound goals + computed momentum | P1 | S | after R8 |
| R10 | Revenue + tenure columns in the roster | P1 | S | yes |
| R6 | Programming queue off `localStorage` | P1 | S | `coach_week_publishes` |
| F1/F2/R19 | Hash links in header nav and cards; "Log meal" in place | P1 | S | — |
| R14 | Coach office settings (landing tab, units, theme, locale, thresholds, notifications) | P1 | M | partly |
| R17/R18 | Client: score record, leaderboard, check-in history, readout; fix dead controls | P1 | S–M | routes exist |
| R13 | Coach Score page honesty + history | P2 | S | `score_ledger` |
| R12 | CSV export + monthly statement | P2 | M | CSVs SHIPPED 2026-09-10 · statement still gated on payouts |
| R15/R16 | Widget settings; remembered filters | P2 | M | R16 SHIPPED 2026-09-10 · R15's roster SORT 2026-09-10, the ⚙ + time window 2026-09-11, PINNING + DRAWER SECTIONS 2026-09-11; the KPI picker remains |
| R20 | Client booking + notifications inbox on the web | P2 | M | INBOX SHIPPED 2026-09-10 · booking still open |
| V1–V3 | Roster PROGRAM column clips/ellipsises; availability rail shows all 15 hours (wrap or widen); Goal titles unstuck | P1 | S | — |
| V7 | Viewport meta on the three shells + a sidebar that collapses below 760px on every route | P1 | S | — |
| V4/V5 | Check the GridStack gaps on a real screen; make the demo dataset agree with itself (one money figure, one client count) | P2 | S | V4 CHECKED 2026-09-10 — does not reproduce |

Sizing: S = one PR, M = a short wave of PRs.

---

## 10. Method notes, limits, and the renders

- Read in full: `trainerDashboard.jsx`, `coachNav.jsx`, `clientNav.jsx`, `dashData.jsx`,
  `dashToday.jsx`, `dashRoster.jsx`, `dashSchedule.jsx`, `sharedClientsTab.jsx`,
  `trainerClientsPage.jsx`, `coachClientDetail.jsx`, `dashBusiness.jsx`, `dashBuilder.jsx`,
  `dashMealBuilder.jsx`, `trainerGoalPage.jsx`, `trainerScorePage.jsx`,
  `dashProfileExtras.jsx`, `dashboardCommunity.jsx`, `dashClient.jsx`, `dashProgress.jsx`,
  `dashTrain.jsx`, `dashNutri.jsx`, `dashGoals.jsx`, `clientHabits.jsx`, `clientScore.jsx`,
  `clientTeam.jsx`, `clientLibrary.jsx`, `clientMeSettings.jsx`, `dashGrid.jsx`,
  `dashSignals.js`; the API routes under `src/app/api/{trainer,nutritionist,client,clients,
  coach}`; `src/lib/coach-growth.ts`, `coach-roster.ts`; the migrations for the tables
  named above; and the mobile `iosAppBroadsheetPros.jsx` / `iosAppBroadsheetClient.jsx`
  for parity.
- Not done: no signed-in account was driven, so no live API response was observed; load
  time was not measured; the CI/precompile path (`scripts/build-newdesign.mjs`) was read,
  not run.
- Renders: every tab of the three shells was rendered headlessly at 1440×900 in the
  signed-out demo state (the CDN scripts served locally, `/api/*` answered 404 so the pages
  took their demo branch). See the "Renders" addendum at the end of this file.

## Addendum — renders

**Setup.** Chromium 141 through `playwright-core` 1.56.1; React/ReactDOM 18.3.1 and
`@babel/standalone` 7.29.0 served from local copies whose sha384 matched the pages'
integrity attributes; every `/api/*` request answered 404, so each page took its demo
branch; Google Fonts loaded. 44 captures: all 32 tabs across the three shells at 1440×900,
the four client-detail entry points, and trainer/client Today at 390×844 (with and without
phone emulation) and 1024×768. Result: **no horizontal overflow at any width**, console
clean apart from the expected 404s and Babel's dev-mode warning; the one failed non-API
request on each Profile tab was the harness proxy refusing the Unsplash demo avatars, not
a site defect. Switch latency was not measured — the harness ran the in-browser Babel
path, which production precompiles.

**What the renders showed that the source read could not**

- **V1 — Roster column collision (trainer).** The PROGRAM column is a fixed 170px
  (`dashRoster.jsx:106`) and cells do not clip, so "Strength Block 3 · Wk 6/12" runs into
  the STREAK column at 1440px and reads as "Wk 6/129d". Program names of realistic length
  will do this on live rosters too.
- **V2 — Availability hours are hidden.** The availability grid has 15 hour columns
  (6a–8p, `DSC_HOURS`, min-width 520) inside a 300px right rail with its scrollbar hidden
  (`dash-hide-scroll`, `dashSchedule.jsx:101, 166, 387`). Only 6a–12p are visible; the
  afternoon and evening hours a coach most needs to set are reachable only by an
  invisible horizontal scroll.
- **V3 — Run-in titles on Goal.** "Revenue calculatorSET YOUR TARGET" and
  "MomentumTHIS QUARTER": `SectionTitle`'s space-between is defeated inside the grid card
  (`trainerGoalPage.jsx:218, 270`). The page eyebrow reads "YOUR GOALS · Q2 2026" in
  September.
- **V4 — Dead space on the GridStack tabs.** Trainer Score rendered 2,496px tall with
  roughly a third of it empty; client Score 3,234px with 150–300px gaps between every
  card; Progress leaves a hole beside the Photos card. The engine's ordered pack
  (`relayoutInOrder`, `dashGrid.jsx:161-197`) exists to prevent exactly this. Whether the
  gaps reproduce in a real browser or are a timing artefact of the 200ms fit in a headless
  capture needs one look on a real screen; either way the fit is fragile enough to fail
  under load timing.
  ⚠ **CORRECTED 2026-09-10 — IT DOES NOT REPRODUCE, AND THE HEDGE IN THE LAST SENTENCE
  WAS THE RIGHT ONE.** Re-measured in Chromium at 1440px, sampling the same grids at
  1.5s · 3s · 6s · 9s and reading each item's own box against its content box:

  | tab | height recorded | height measured | items | per-item slack | inter-row gaps |
  | :-- | --: | --: | --: | :-- | :-- |
  | trainer Score | 2,496px | **1,480px** | 5 | 19–20px | 0, 0, 0 |
  | client Score | 3,234px | **1,200px** | 6 | 18–20px | 0, 0, 0, 0 |
  | client Progress | — | **1,264px** | 8 | 18–19px | 0, 0, 0, 0 |
  | trainer Today | — | **2,180px** | 7 | 18–19px | 0, 0, 0, 0, 0 |

  There are **no 150–300px gaps anywhere**, and no hole beside Photos. The 18–20px that
  separates a card's content from its box is the `item-content` inset — constant on every
  card on every tab, i.e. the design, not dead space.
  ⚠ **AND THE SETTLE TRACE SAYS WHERE THE ORIGINAL FIGURES CAME FROM.** At **1.5s every
  one of these grids reports `n=0` items and a height of 660px** — the fit has not run
  yet. A capture taken in that window is measuring an empty grid and a placeholder
  height, so "a third of it empty" was a measurement of the instrument. From 3s onward
  every figure above is stable across three further samples. **The measured heights are
  40–63% SMALLER than the recorded ones**, which is the shape a too-early capture
  produces, not the shape a packing bug produces.
  ⚠ **THE SECOND CLAUSE IS NOT REFUTED AND IS NOT CLOSED BY THIS.** "The fit is fragile
  enough to fail under load timing" is about `relayoutInOrder` racing content that
  resizes after it runs, and nothing here tests that. What is now known is that it packs
  correctly once it has run.
- **V5 — The demo does not agree with itself.** Trainer Today shows four different
  monthly money figures at once — sidebar "$18,420 · PAYOUT APR 30", "THIS MONTH
  $4,192.00", "MONTHLY RECURRING $1,820", and the Business card's "$1,547 · MONTHLY · NET"
  — and the sidebar badge says 34 clients while the roster and KPI strip say 10 and the
  Business outcomes plate says 34. The signed-out preview is what a prospective coach
  evaluates the product on.
- **V6 — The Chat bubble covers content.** Fixed bottom-right, it overlaps the pulse
  panel's MESSAGE buttons on Today at 1440px and the right edge of every long page.
- **V7 — Phones get the desktop page.** In a genuinely narrow window the sidebar does
  collapse into a horizontal, scrollable tab strip (`pageShell.jsx:638`; the `dash.css`
  collapse rule additionally targets a class only the client Settings route uses). But the
  three shells carry no `<meta name="viewport">`, so a real phone never reaches that
  breakpoint: it lays the dashboard out at 980px and shrinks it, sidebar and all. At
  1024px the two-column Today holds, with the pulse pills wrapping to two lines.
- **V8 — The orphaned client page has no preview state.** `TrainerClient.html` without an
  id renders "Couldn't load · Missing client id" beside the demo payout card; with an
  unknown id, "Not found". The trainer and nutritionist files are byte-identical and both
  show the trainer sidebar in that error state. The tabs that
  carry no demo band (coach Playlists, Community, Goal, Score, Profile; client Library,
  Team, Community, Score, Habits, Profile, Settings) rendered demo or literal content with
  nothing marking it as such — the same list as §8.
- **V9 — What holds up.** The instrument-plate language is consistent across all three
  roles; Today, Progress and Workouts read densely and legibly; Schedule and Business are
  the two coach tabs that already look like a working office.
