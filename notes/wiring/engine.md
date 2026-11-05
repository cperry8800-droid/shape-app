# What Shape's engine tells coaches today

Read-only research, 2026-11-05. Sources are repo-relative. Every quoted string below is the
code's own wording. Where a string carries a client's figures, they come from running the engine
on its demo roster at Wed 4 Nov 2026, 1:20 pm (`scratchpad/wiring/run-engine.cjs`,
`run-notify.mjs`).

## Summary

- **One engine, four readers.** `public/newdesign/dashSignals.js` is a pure module. It holds 15
  per-client rules (flags), a severity model (red, amber, green, unknown), a ranked triage feed
  and the single "directive" (verdict, reason, action). It also holds a few roster-level helpers:
  joint attention, the programming queue, milestones, goal pace and programs ending. It reads
  logged data only and makes no model call. Four places run it:
  1. the website coach Today and Clients pages (`dashData.jsx`, `dashToday.jsx`, `dashRoster.jsx`);
  2. the app's coach Today, Clients and case file (`shapeSignals.js`, `iosAppBroadsheetPros.jsx`);
  3. Nora's "What needs me today?" tool (`src/lib/ai/coachToday.mjs`);
  4. the hourly push cron that sends `client_red` / `client_amber` (`src/lib/ai/notify-core.ts`, `notifications.mjs`).
- **What a coach actually gets is a flagged client with a one-line reason**, for example
  "No contact in 7 days" or "No check-in for 3 weeks". The client is coloured red ("Needs you")
  or amber ("Watch") and ranked by severity, then by how many flags they have. The reason line is
  real and specific. **The "what to do" part is thin.**
  - The engine's `action` is written for the *member* ("Log a meal today", "Send your weekly
    check-in"). Nora's coach tool deliberately leaves it out.
  - The coach's own move is improvised by each screen. The website offers a templated Message
    and nothing else. The app case file regex-matches the reason text to one of DRAFT, MESSAGE,
    SCHEDULE or ADJUST.
- **The four readers do not see the same flags.** Each one builds its client record from
  different reads:
  - The website cannot raise sleep, energy or hunger flags.
  - The app, Nora and push cannot raise streak, Shape Score, calories-over or protein flags, and
    see food gaps only after a fully empty week.
  - Nora also cannot raise contact, screening or "Week 1 not live" flags.
  - The app ignores the coach's tuned thresholds.
  - Push runs only for coaches who open the mobile app, and phrases the reason differently from
    Today.
- **Nora adds** two things:
  - an AI check-in draft (✦ DRAFT, app case file only). It is grounded in an evidence pack of
    sessions, calories, protein, days logged, weight, goal pace and sleep. It does **not** use the
    flag that made the client need you.
  - on-request proposals the coach confirms, with undo: assign or draft a workout, draft a meal
    plan or nutrition program, set a goal, set a phase or note, add a review note, reschedule.

  Nora never proposes anything on her own from a flag. The coach "directive override" exists only
  as an API; no screen calls it.
- **No dismiss and no snooze.** Coaches can pin clients (website), tune 9 thresholds (website
  Settings), and switch the two alert types per channel. Messaging a client clears the contact
  flag on its own. Reviewing a check-in or marking a program written clears queue rows, not flags.
- **For the redesign**, every "what to do" slot in the mock-ups can be filled from engine output:
  - the triage feed (who, red or amber, the reason)
  - `findJointAttention` (one note to both coaches)
  - `buildProgrammingQueue` (who is ready to program)
  - `dashProgramsEnding`, `buildMilestones` (wins) and `projectGoal` / `goalBrief` (pace)

  Two mock blocks have **no engine behind them yet**:
  - the cross-client "patterns" built from weekly check-in ratings and questions (Week);
  - churn risk, "Who might leave" (Retention).

  The one missing piece the dashboard needs is a **coach-move table keyed by the directive's
  `lever`**. It would replace the app's regex and the website's one-size Message.

## 1. Where the engine lives

| Piece | File | What it gives coaches |
|---|---|---|
| Rules, severity, triage, directive, joint attention, queue, milestones, goal pace, KPI pool, Today widgets | `public/newdesign/dashSignals.js` | everything below |
| Website record builder + tuning | `public/newdesign/dashData.jsx` (`_dashRecordFromLive`, `dashReadCoachSettings`) | website triage, using the coach's thresholds |
| Website legs (server) | `src/lib/shared-overview.ts`, `src/lib/coach-client-legs.mjs` | last contact, program, logs, nutrition targets, onboarding board, screening, score history |
| App record builder | `mobile-app/src/services/shapeSignals.js` + `signalsMap.mjs` (`recordFromCoachData`) | app triage (`triageLive`), push snapshot |
| Roster sleep + daily vitals | `src/app/api/coach/roster-sleep` + `src/lib/roster-vitals.mjs` | sleep_low, energy_low, hunger_high inputs (app, Nora, push) |
| Nora's coach Today | `src/lib/ai/coachToday.mjs`, tool `get_coach_today` in `src/app/api/support/chat/route.ts` | "What needs me today?" |
| Push alerts | `src/lib/ai/notify-core.ts`, `notifications.mjs`, `/api/ai/notify` (app posts the roster), `/api/ai/notify/cron` (hourly) | `client_red`, `client_amber`, digest |
| Directive + override | `src/lib/ai/directive.ts`, `/api/ai/directive`, `/api/ai/directive/override` | member directive; the override has no UI |
| AI drafts | `src/lib/ai/draft.ts`, `/api/ai/draft-message` (+ `/sent`) | ✦ DRAFT check-in (app) |
| Weekend split / variance band | `mobile-app/src/services/weekendSplit.mjs` (+ `/api/coach/roster-weekend`), `public/newdesign/varianceBand.mjs` | roster chips + case-file plates |
| Thresholds UI | `public/newdesign/coachSettings.jsx` ("Flags · when a client reaches you") | 9 tunables |

## 2. Catalog

### 2a. Per-client flags (the 15 rules)

"Tunable" means the rule has a key in the website Settings ("Flags · when a client reaches you").
Its range is `TUNABLES`, and the stored value lives in `user_goals.coach_settings.thresholds`.
Evidence floors are deliberately **not** tunable ("absence is never a signal"). Each flag also
drives the directive: its verdict, its member action and its priority.

1. **`streak_broken`** · label "Streak broken"
   - Trigger: `streaks.current == 0` and best ≥ 3 (not tunable).
   - Inputs: the client's Shape Score streak (score-history coach read).
   - Reason: "Streak broken — was 12 days".
   - Discipline: training. The trainer owns it; a nutritionist sees it owned=false, but it still
     counts toward their severity.
   - Directive: "Train today" / "Open today's session" · priority 40.
2. **`score_drop`** · label "Score ↓8"
   - Trigger: drop of `SCORE_DROP_PTS` 5 or more (tunable 1–50) between the two newest
     *complete* weeks.
   - Inputs: weekly Shape Score points (`scoreHistory.weeks`).
   - Reason: "Shape Score down 8 pts week-over-week".
   - Discipline: general.
   - Directive: "Grab a win" / "Grab a win today" · priority 30.
3. **`food_gap`** · label "No logs 4d" or "No logs 7d+"
   - Trigger: days since the last logged day ≥ `FOOD_GAP_DAYS` 3 (tunable 1–14). With no
     last-log date, it fires only on 0/7 days logged and a threshold ≤ 7. New clients under 7
     days are skipped.
   - Inputs: `daily_health_snapshot.dietary_kcal` (logs leg) and `get_client_stats.daysLogged7d`.
   - Reasons: "No food logs in 4 days" · "No food logs in the 4 days since they joined" · "No food
     logs in the last week".
   - Discipline: general.
   - Directive: "Tighten nutrition" / "Log a meal today" · priority 55.
4. **`checkin_overdue`** · label "Check-in due", "Check-in 3w late" or "No first check-in"
   - Trigger: weeks since the last weekly check-in Monday. One missed week fires only from
     `CHECKIN_GRACE_DAYS` 3 (Thu; tunable 0–6). It goes red alone at ≥ `CHECKIN_RED_WEEKS` 2
     (tunable 1–8). New clients are exempt from "No first check-in".
   - Inputs: `client_checkins.week_of` (`get_client_checkins`).
   - Reasons: "Check-in due — last was week of 2026-10-26" · "No check-in for 3 weeks" ·
     "Hasn't completed a first check-in".
   - Discipline: general.
   - Directive: "Check-in due" / "Send your weekly check-in" · priority 100 + 5 per week (max +50).
5. **`contact_gap`** · label "Say hello", "Never messaged" or "Quiet 7d"
   - Trigger: the last message either way in the coach's thread or DM is ≥ `CONTACT_GAP_DAYS` 5
     old (tunable 1–30). "Say hello" fires when the onboarding `hello` step is still undone on
     day 3 or later.
   - Inputs: `conversations.last_message_at` (coach thread + member DM) and the onboarding board.
   - Reasons: "No contact in 7 days" · "No message in the 5 days since they joined" · "You haven't
     written to them since they joined 3 days ago".
   - Discipline: general.
   - Directive: "Reconnect" / "Reach out today" · priority 80.
6. **`goal_slip`** · label "Goal ETA +15d" or "Goal ETA lost"
   - Trigger: a least-squares pace over the last 56 days. The projected date moved ≥
     `GOAL_SLIP_DAYS` 7 later than a week ago (tunable 1–60).
   - Inputs: `client_programs.detail.goals`, `user_goals.client_goals` (share-gated) and
     `client_weigh_ins`.
   - Reasons: "“Goal weight” slipped — the projected finish moved 15 days later this week" ·
     "“X” lost its projected date — the pace flattened this week".
   - Discipline: general.
   - Directive: "Goal pace slipped" / "Log a weigh-in" · priority 60.
7. **`sleep_low`** · label "Sleep low"
   - Trigger: the 7-day average is more than `SLEEP_DEFICIT_H` 1.5 h under a 7.5 h target
     (tunable 0.5–4), over at least 3 logged nights.
   - Inputs: `daily_health_snapshot.sleep_hours` (device or typed), via `/api/coach/roster-sleep`.
   - Reason: "Averaging 5.6h sleep vs a 7.5h target — recovery is running down".
   - Discipline: recovery (trainer-owned).
   - Directive: "Sleep is the lever" / "Log last night's sleep" · priority 35.
8. **`energy_low`** · label "Energy low"
   - Trigger: 7-day average energy ≤ 4/10 over at least 3 logs (not tunable).
   - Inputs: daily check-in `energy`.
   - Reason: "Energy has averaged 3.4/10 this week — a lighter session still counts".
   - Discipline: recovery (trainer).
   - Directive: "Energy is running low" / "Take today lighter" · priority 34.
9. **`hunger_high`** · label "Hunger high"
   - Trigger: 7-day average hunger ≥ 8/10 over at least 3 logs (not tunable).
   - Inputs: daily check-in `hunger`.
   - Reason: "Hunger has averaged 8.4/10 this week — the plan may be running light on fuel".
   - Discipline: nutrition. A trainer sees it read-only, routed to the nutritionist, and it never
     counts toward the trainer's severity.
   - Directive: "Fuel is running short" / "Add a real meal today" · priority 33.
10. **`ledger_blown`** · label "Ledger +21%"
    - Trigger: average kcal ≥ target + `LEDGER_OVER_PCT` 10% (tunable 1–50).
    - Inputs: `get_client_stats.avgCalories` and the coach's target in `client_programs.detail.nutrition`.
    - Reason: "Averaging 2540 kcal vs a 2100 kcal target".
    - Discipline: nutrition. A trainer sees it read-only as "Ledger +21% → dietitian".
    - Directive: "Tighten nutrition" / "Log a meal today" · priority 50.
11. **`protein_under`** · label "Protein low"
    - Trigger: average protein ≤ target − `PROTEIN_UNDER_PCT` 15% (tunable 1–50).
    - Inputs: `avgProtein` and the coach's target.
    - Reason: "Averaging 96g protein vs a 150g target".
    - Discipline: nutrition. A trainer sees "Protein low → dietitian".
    - Directive: "Tighten nutrition" · priority 45.
12. **`screening_flagged`** · label "Health flag"
    - Trigger: the PAR-Q health screening has a "yes".
    - Inputs: the health profile plus the coach-only intake.
    - Reason: "Answered yes on the health screening — read it before programming".
    - Discipline: general.
    - Directive: "Reconnect" (lever contact) · priority 90.
13. **`screening_missing`** · label "No screening"
    - Trigger: no screening on file, and the intake read answered.
    - Reason: "Has not completed the health screening — ask them to fill it in".
    - Discipline: general.
    - Directive: "Reconnect" · priority 70.
14. **`plan_due`** · label "Week 1 not live"
    - Trigger: the coach's week-one start date has passed with no plan published.
    - Inputs: the onboarding board (`weekOne.startsOn`, first published plan).
    - Reason: "Week 1 was set to start 2026-11-02 and no plan is published".
    - Discipline: general.
    - Directive: falls back to "Train today" (it has no lever of its own) · priority 85.
15. **`hydration_low`** · member only, never a coach flag (owner ruling).

**Severity.**
- **Red**: 2 or more flags, or a check-in missed for `CHECKIN_RED_WEEKS` weeks or more.
- **Amber**: exactly 1 flag.
- **Green**: no flags, and the progress read answered with data from the last 14 days, or the
  client is new.
- **Unknown**: anything else ("Progress unavailable" or "Insufficient recent data").

Read-only routed flags never change severity. The website labels the four bands
`["red","Needs you"], ["amber","Watch"], ["green","On track"], ["unknown","Not enough data"]`
(`DashRosterStatusPanel`). The app labels them "NEEDS YOU" (red and amber), "NEW" and
"ON TRACK", with FLAG / WATCH / NEW chips on To do.

### 2b. Recommendations, queues and reads built on the flags

**1. Directive** (`buildDirective`)
- Trigger: the coach override wins first. Otherwise the top flag by `DIRECTIVE_PRIORITY`. With no
  flags, a sleep-lever read, then "on pace".
- Inputs: the record above.
- Coach sees:
  - `verdict` ("Reconnect", "Check-in due", "Tighten nutrition", "Goal pace slipped", "Grab a
    win", "Sleep is the lever", "On pace") and `reason` (the top flag's reason).
  - When green: "9-day streak, deficit holding, sessions on plan — keep it boring."
  - `read.summary30d`: "30 days: 18/20 sessions · avg 2080 kcal · -0.1 lb".
  - `action` is the member's ("Log a meal today").
- Action offered: none of its own.
- Where it shows:
  - App: To do rows, Clients rows and the case file's "YOUR MOVE · FROM THE ENGINE" show `reason`.
  - Website: only inside the Message draft.
  - Nora: shows "verdict: reason".
  - `read` is never shown to a coach.
- When computed: per triage pass. Live.

**2. Triage feed** (`getTriageFeed`)
- Trigger: every client is evaluated and sorted red → amber → unknown → green, then by flag
  count, then by name.
- Coach sees:
  - Website "Needs you › Attention": the name, up to 2 owned flag labels, routed chips ("Protein
    low → dietitian"), and a facts line ("0d streak · 63 wk pts ▼8 · spoke 1d ago").
  - App To do: the name, FLAG or WATCH, and the reason.
- Actions:
  - Website: Message (template draft), pin, open drawer.
  - App: tap opens the client file.
- Where: website Today (trainer and nutritionist), website Clients, app Today and Clients.
- When computed: website on page load, using the coach's thresholds. App on open (30 s cache),
  with house thresholds only.

**3. Joint attention** (`findJointAttention`)
- Trigger: `streak_broken` together with any of `food_gap`, `ledger_blown` or `protein_under` in
  the same week.
- Coach sees: "Joint attention · with their nutritionist" and "**Marcus T.** is slipping on both
  sides — streak broken and no logs 3d. One coordinated message beats two separate nudges."
- Action: **Start joint note**, with the draft "Hey Marcus — your nutritionist and I compared
  notes: streak broken + no logs 3d in the same week. One reset plan from both of us. Quick call
  tomorrow?"
- Where: website Today (Attention tab), at most 2 shown. Not in the app, Nora or push.
- When computed: on load. Live.

**4. Programming queue** (`buildProgrammingQueue`)
- Trigger: every client with check-in state. "ready" means this week's check-in is in;
  "blocked" means it is not.
- Coach sees:
  - "8 ready to program · week of 2026-11-02".
  - Rows: "Check-in received — ready to program" / "Waiting on this week's check-in" /
    "Waiting on their first check-in" / "Week of … · delivered".
- Actions: Template (link), **Mark written** (`coach_week_plans`). Publishes from
  `coach_week_publishes` tick a row on their own.
- Where: website Today "Programs" tab (both roles) and the KPI "Programs due / Plans due"
  ("10 · 8 ready").
- When computed: on load. Live.

**5. Programs ending** (`dashProgramsEnding`)
- Trigger: the block assigned by this coach has ≤ 3 weeks left. Paused or unknown blocks are
  counted separately.
- Inputs: `client_program_assignments` + template `durationWeeks` (`bsProgramLeg`: week,
  `overdue`, `nextAssigned`).
- Coach sees: "Programs ending soon", e.g. Priya S. · Cut · Conditioning · wk 7/10 · 3 left.
- Action: link to Programs.
- Where: website Today, an **optional** widget that is off by default.
- When computed: on load. Live.

**6. Wins** (`buildMilestones`)
- Trigger: goal crossings, PRs and workout counts in the last 30 days. Streak landmarks are not
  dated.
- Coach sees: "Jordan M. — 5k under 25:00 · 1d ago".
- Action: **Congratulate** → "Jordan — 5k under 25:00. That's earned, not given. What are we
  pointing at next?"
- Where: website Today "Client wins".
- Live vs demo: live records carry no `milestones` or `totals`, so live it shows only achieved
  coach-set goals. Mostly demo.

**7. Goal pace / pre-session context** (`projectGoal`, `goalBrief`, `dashContextLine`)
- Trigger: a pace fit over the last 56 days. States: on-pace, stalled, far, stale, achieved.
- Coach sees:
  - "2.8 lb to “Goal weight” · pace Dec 9"
  - "9.4 lb to “Goal weight” · pace stalled"
  - "7.8 lb to “Goal weight” · pace Jan 20 (ETA +15d this wk)"
  - plus "check-in received" or "no check-in this week"
- Action: Message · Last notes · Start log on the expanded row.
- Where: website Today schedule rows (expanded) and the Goals drawer.
- When computed: on load. Live.

**8. Onboarding next step** (`bsOnboardingLeg`, `dashOnboardingNext`)
- Trigger: a client's first 30 days. Steps: joined, welcome, hello, plan, checkin, checkin2,
  progress (each ticked by records).
- Coach sees: "Your first message" / "Plan live · due Mon 9 Nov" / "First check-in · due …" /
  "Day-30 measurements". The app shows "New · {step}".
- Action: the board (Say hello, set the week-one target).
- Where: website "Needs you › New clients", app Today/Clients for NEW rows, app case file station.
- Live.

**9. Weekend pattern** (`weekendSplit`)
- Trigger: the weekday vs weekend gap is at least 15 points, at least 1.65 SE, positive in at
  least 60% of weeks, over at least 3 weekends.
- Inputs: food logs, habits and scheduled workouts per member timezone (`get_roster_weekend_split`).
- Coach sees: the roster chip "WKND −N" and the case-file plate "WEEKEND PATTERN", with lines
  like "WK 86% · WE 54% · −32" and one move:
  - "Set a weekend check-in or a lighter weekend nutrition target."
  - "Move a weekend session earlier in the day, or shift it to a weekday they hit."
  - "Add a weekend-specific habit reminder."
- Action: text only.
- Where: **app only**.
- When computed: on roster load. Live.

**10. Variance band** (`bsVarianceBand` / `bsVarianceCopy`)
- Trigger: the stdev of weekly adherence over 4–8 closed weeks. ≥ 18 points is "VARIABLE"; ≤ 8
  is steady.
- Inputs: `get_roster_weekly_adherence`.
- Coach sees: chip "VARIABLE" and "Week-to-week: swings 40–95% — steady the floor before raising
  the target." / "Week-to-week: holds 85–92%."
- Action: text only.
- Where: app roster and case file, website client page.
- Live.

**11. Check-ins to review** (not an engine rule)
- Trigger: a shared check-in not yet marked reviewed.
- Coach sees: ratings, wins, struggles, question, weight.
- Actions: **Draft response** ("Hi Elena — thanks for your check-in for the week of …"), **Mark
  reviewed** (`coach_week_reviews`).
- Where: website "Needs you › Check-ins" and the Week page.

**12. Replies needed** (not an engine rule)
- Trigger: the latest message in the thread is the client's.
- Coach sees: "Waiting since …".
- Action: Open conversation.
- Where: website "Needs you › Replies" only.

**13. To schedule** (not an engine rule)
- Trigger: a paid single session with no booking.
- Inputs: `/api/coach/to-schedule`.
- Coach sees: a paid row.
- Action: book.
- Where: app To do (first rows), website Schedule.

**14. Booking requests to confirm** (not an engine rule)
- Trigger: `sessions.status = 'requested'`.
- Coach sees: Nora's "requests to confirm". The website calendar shows "1 to confirm".
- Actions: Accept / Other time / Decline.
- Where: Nora, Schedule.

**15. Weekly readout "The read"**
- Trigger: the member's own AI readout (correlations over `daily_health_snapshot`), cached weekly.
- Coach sees: the summary only. The per-insight `recommendation` is never read by a coach page.
- Action: none.
- Where: website Week page.
- Live once the member has generated one.

**16. Readiness 0–100**
- Trigger: `readinessFromSeries` (sleep, HRV, RHR vs baseline).
- Coach sees: the number and its band label on the client page.
- Action: none. No flag.
- Where: website client page.

**17. Coach KPI "Needs eyes"**
- Coach sees: "{n} · of {N} on the pulse".
- Where: a website Today KPI pool option.

### 2c. What reaches the coach outside the dashboard

**1. Push / bell `client_red`**
- Trigger: a client newly red under a flag this coach owns, or amber turning red.
- Coach sees: "**Sam R. needs you**", with the body set to the first owned flag's reason ("No
  food logs in 4 days").
- Channels: app and push; never email.
- Cadence: the app posts the roster on open (30-min throttle); the cron re-runs that snapshot
  hourly for 14 days.
- Switch: "Client went red".
- Cap: shares the person's daily cap (default 4). The rest roll into a digest titled
  "3 updates for you" whose body lists the held titles.

**2. Push / bell `client_amber`**
- Trigger: a client newly amber.
- Coach sees: "**Aisha K. — worth a look**" · "No contact in 6 days".
- Channels, cadence and cap: as above.
- Switch: "Client went amber".

**3. Nora `get_coach_today`**
- Trigger: on demand ("What needs me today?" is a quick reply for both roles).
- Coach sees: requests to confirm, then today's sessions, then up to 8 flagged clients as
  `{name, severity, why: "Reconnect: No contact in 7 days"}`. It also says when reads failed.

**4. Nora proposals**
- Trigger: on request only.
- Coach sees: a preview card, Confirm, Undo (`ai_audit_log`).
- Tools: `set_client_goal`, `assign_workout`, `draft_workout`, `draft_meal_plan`,
  `draft_nutrition_program`, `assign_meal_plan`, `set_program_detail`, `add_review_note`,
  `reschedule_session`.
- Not available: no tool to draft a client message or to set the directive override.

**5. Event notices** (not engine)
- `new_client`, `shared_client`, `waitlist_join` (the only one that can email), client
  messages, sessions, payments, credentials.
- `checkin_submitted` is in the registry but **nothing sends it**. Settings hides it
  (`coachSettings.jsx`, War Room).

## 3. Which reader can fire which flag (live)

| Rule | Website Today/Clients | App Today/Clients/case file | Push alerts (app snapshot) | Nora "needs me today" |
|---|---|---|---|---|
| streak_broken | yes | **no** (no streaks on the record) | **no** | **no** |
| score_drop | yes | **no** (no score history) | **no** | **no** |
| food_gap | yes (to the day) | only "No logs 7d+" | only "7d+" | only "7d+" |
| checkin_overdue | yes | yes | yes | yes |
| contact_gap | yes | yes | yes | **no** (no lastContact passed) |
| goal_slip | yes | yes | yes | yes |
| sleep_low / energy_low / hunger_high | **no** (`sleep`/`vitals` on the overview are never mapped to the record) | yes | yes | yes |
| ledger_blown / protein_under | yes (targets from detail.nutrition) | **no** (`get_client_stats` has no targets) | **no** | **no** |
| screening_* / plan_due | yes | yes | yes | **no** |
| Coach's tuned thresholds | yes | **no** (house defaults) | yes | yes |

Consequences:

- A client can be red on the website and on track in the app, or the reverse.
- A coach who uses only the website never gets red or amber pushes, because nothing posts a
  snapshot from the website.
- Push snapshots are capped at 100 clients.

## 4. Ranking, reasons and actions

**What makes a client "needs you".**
- Severity first: red outranks amber, then unknown, then green.
- Within a band, more flags rank higher, then name A–Z.
- The website lifts pinned clients above the feed under "Pinned · N". The engine's
  `pulseOrder` keeps each row once and never hides a flag.
- The app's To do lists paid-to-book rows first, then red, amber and new, five rows at most.
  A flagged client with a session today has the to-do folded onto that session row
  (`bsProFoldTodos`).

**The directive picks which reason to lead with, by urgency.** The order is: check-in overdue
(100, +5 a week) > health flag 90 > Week 1 not live 85 > contact 80 > no screening 70 > goal
slip 60 > food gap 55 > calories over 50 > protein 45 > streak 40 > sleep 35 > energy 34 >
hunger 33 > score 30.

The feed's order does **not** use this priority. Jonah (one flag, priority 115) sorts below
Marcus (three flags, top priority 55).

**Does it explain why?** Yes. Every flag carries a plain, specific `reason`, and the directive
picks one. Three readers phrase it differently:

| Reader | What it shows for Sam R. |
|---|---|
| App To do | "No contact in 7 days" |
| Push body | "No food logs in 4 days" (first owned flag in rule order) |
| Website pulse | the pills "No logs 4d" and "Quiet 7d", no sentence; the drawer shows pills only |

The 30-day `read` exists and is never shown.

**One tap.**
- Website: Message, which opens Messages with a drafted opener built from the directive reason
  ("Hey Sam — checking in. I'm seeing no contact in 7 days. What's getting in the way this
  week?"). Also Start joint note, Congratulate, Draft response, Mark reviewed, Mark written,
  Open conversation.
- App: tapping a To do row opens the file. The case file's YOUR MOVE has one button, chosen by
  regex on the reason text: check-in → ✦ DRAFT, session or missed → SCHEDULE, logs or macros →
  MESSAGE, plan or stall → ADJUST.
- Push: opens the client.

**Dismiss or snooze: none.**
- To quiet a flag, a coach can only change a threshold, switch the alert type off, or fix the
  underlying data.
- Push dedupe: a client already alerted at a severity is not re-alerted at that severity.

**Feedback loops.**

| Coach action | What it changes |
|---|---|
| Message the client | clears `contact_gap` on the next read |
| Mark reviewed / Mark written / publish | clears queue rows only; `checkin_overdue` is about the client submitting |
| Pin | reorders the website feed |
| Directive override | **no UI**; also never reaches coach screens, because neither record builder carries `coachDirective` |
| AI draft | logs the draft and the sent version to `ai_audit_log`; audit only, no learning |

## 5. Gaps

**Data that exists but drives no recommendation**

1. **Training adherence.** `trainingAdherence` (9/14 sessions) appears only in the directive's
   read and in the AI evidence. There is no "missed sessions" flag, although the app case file
   has a SCHEDULE action for that case. This is the biggest trainer gap.
2. **Weekly check-in content.** Ratings (training, nutrition, sleep, energy, stress, hunger),
   wins, struggles and the client's question are shown raw. No rule reads them, and an
   unanswered question raises nothing.
3. **Unanswered client messages.** They appear only on the website Replies tab and never affect
   severity. `contact_gap` treats any message either way as contact, so a client left waiting
   reads as "spoke 1d ago".
4. **Wearables.** WHOOP recovery score, HRV, resting heart rate, readiness and the "rested"
   rating are shown on the client page but have no rule. The record's `recoveryScore` and
   `restingHr` fields are read by nothing.
5. **Money and retention.**
   - `paymentRetrying` (past due) is a quiet mark only.
   - A subscription cancelled at period end (`coach-renewals.mjs`, `ending: true`) appears only on
     the Business Money tab.
   - There is no churn-risk signal.
   - Exit reasons are not collected ("Exit reason — collects once the cancellation survey ships").
6. **Programs ending or overdue** (`program.overdue`, `nextAssigned`) live only in an optional
   widget, off by default.
7. **Weight** moves only through `goal_slip`. A client with no goal set never triggers anything.
8. **Crossover reads** (work habits × training and sleep) and correlations are member-only.

**Computed but never shown to a coach**

- The directive's `read.summary30d` and `oneThingNow`, and the website's use of `verdict`.
- `bsProLeadVerdict` ("{name} first — {directive}" / "Nothing booked, nobody flagged — a clear
  day.") is tested but unused, as is `bsProAttentionBudget`.
- The weekly readout's per-insight `recommendation`. This is deliberate, for privacy.
- `checkin_submitted` alerts are never written.
- The app case file's `summaryLine` is defined and never rendered.

**Demo-only or static**

- The engine's demo roster (`buildMockClients`) drives the signed-out website. The app's demo
  roster has directives no live rule can produce: "Deload due — adjust the block.", "PR this
  week — send some props.", "Check-in form waiting on your review.", "Food log waiting on your
  review."
- The website nutritionist "Roster health" card shows a hard-coded "Insight · recipes"
  paragraph to live coaches. Its "Renewals due · 30d" reads "—" live.
- "Client wins" is near-empty live (see 2b, item 6).
- The coach's own Goal page subtexts are free text the coach typed. Business goals get no pace
  projection.

**Inconsistencies a dashboard redesign would inherit**

- The rule coverage gaps between readers in section 3, plus the app ignoring the coach's
  thresholds.
- The push reason differs from the directive reason (rule order instead of priority).
- **The coach's coach-facing reason is pasted into a client-facing message**, e.g. "I'm seeing
  answered yes on the health screening — read it before programming." The website draft
  lower-cases it into the coach's voice.
- The AI ✦ DRAFT ignores the flag. For Marcus it drafts "You logged 18/20 sessions (90% of
  plan), and your intake averaged 2080 kcal…" and never mentions the broken streak or the
  missing logs.
- The green reason can start in lower case ("deficit holding, sessions on plan — keep it
  boring.").
- A nutritionist's severity counts the trainer's `streak_broken`. `hunger_high` was gated to
  avoid exactly this the other way round.
- **Verified bug:** push dedupe never forgets. `notify_state.coachClients[clientId]` is written
  when an alert goes out and never cleared when the client recovers (`notifications.mjs` lines
  627, 712, 720; `coachCandidates` skips `prev === sev`). A client alerted amber who recovers and
  slips to amber again is **never alerted again**. A client once alerted red is never alerted
  again at all. The code comment promises "green→amber/red" re-alerts.

## 6. How the dashboard should use it

General rules for every page:

- **Who** comes from `getTriageFeed` severity, labelled as `DashRosterStatusPanel` does:
  "Needs you" = red, "Watch" = amber, "On track" = green. Also show "New" for green clients
  marked new, and "Not enough data" for unknown. The mock-ups drop this fourth state; it is real
  and must have a place.
- **Why** is `directive.reason`, verbatim, one line. Add the other owned flag labels as small
  chips, and routed flags as "{label} → dietitian" or "→ trainer".
- **What to do** needs one new table in `dashSignals.js`, `COACH_MOVES` keyed by `directive.lever`.
  It replaces the app's regex and the website's one-size Message. The suggested table, built
  from screens that already exist:

| lever (flags) | Coach button | Opens / does | Draft basis |
|---|---|---|---|
| contact (contact_gap) | Message | Messages with draft | "Hey Sam — it's been a week since we talked. How's it going?" (client voice, not the coach reason) |
| contact (screening_flagged) | Read their screening | client file, health section | — |
| contact (screening_missing) | Ask for the screening | Message | "Could you fill in your health screening before our next session?" |
| checkin (checkin_overdue) | Ask for this week's check-in | Message | uses the reason's figures (weeks missed) |
| nutrition (food_gap) | Nudge to log | Message | — |
| nutrition (ledger_blown, protein_under) | Adjust plan (nutritionist) / Note to dietitian (trainer, routed) | Plans builder / care-team thread | — |
| training (streak_broken), plan_due | Adjust program / Publish week 1 | Programs / builder | — |
| sleep, energy | Ease the load | Adjust (app's ADJUST page) | — |
| hunger | Check fuel (nutritionist) / routed | Plans | — |
| goal (goal_slip) | Ask for a weigh-in | Message | — |
| score | Send a win | Message / Congratulate | — |
| joint attention | Start joint note | care-team note | existing `dashJointDraft` |

- **The client-facing draft should be member wording**, not the coach reason. The engine already
  has member wording for its own directive (`memberMoveLine`, `leadReason.mjs`). Pass the flag
  key and figures to `/api/ai/draft-message` as well, so ✦ DRAFT talks about what was flagged.
- **One record per client, everywhere.** Before the redesign ships, map the overview's `sleep`
  and `vitals` into the website record. Add streaks, score history, last-log date and nutrition
  targets to the app record (it already loads the overview). Apply thresholds in the app.
  Otherwise the new Today will disagree with the phone.

### Today (today-v2.html)

**Brief.** Compose it from the feed and the calendar, not hand-written prose.
- First line: the count of red clients, plus the next booking.
- Then up to three named clients, each with their engine sentence.
- The demo data gives:
  > **3 clients need you before your 2:00 with Sam O.**
  > Marcus T. is slipping on both sides — streak broken and no logs 3d. Sam R.: no contact in 7 days. Jonah W.: no check-in for 3 weeks.
  - Marcus's text comes from `findJointAttention`; the others are `directive.reason`.
- With nothing flagged, use the existing app strings "Nothing needs you right now." /
  "Nothing booked, nobody flagged — a clear day." (`bsProLeadVerdict`).
- The mock's "Sam R. has gone quiet" is not engine wording. Use "no contact in 7 days" or the
  verdict "Reconnect".

**Up next.** For a roster client, the context line is `dashContextLine`, e.g. "2.8 lb to “Goal
weight” · pace Dec 9 · check-in received". For a new client (Sam O.), show the onboarding next
step plus the screening state:
- "Health flag · Answered yes on the health screening — read it before programming", or
- "No screening · Has not completed the health screening — ask them to fill it in".

"No shared history yet" is fine when there is no record.

**At a glance.**
- **Programs due.** The mock's "8 ready to send · 2 to finish" misreads the queue. The engine
  says:
  > 10 in the queue · 8 ready to program · 2 waiting on a check-in
  - Ready means "Check-in received — ready to program". The 2 waiting are Jonah W. ("Waiting on
    this week's check-in") and Tess B. ("Waiting on their first check-in").
  - "Ready" does not mean written. Writing is `Mark written` / publishes.
- **Roster logging.** "69%" is the compliance KPI. Replace "▼ 3 stopped logging" with the
  food_gap count:
  > 3 with no food logs in 3+ days — Marcus T., Sam R., Deandre K.
  - The threshold comes from the coach's food-log gap setting.
- **Check-ins reviewed 0/10** is the reviews store, not the engine. Keep it as a fact, not an
  alert.

**Needs you list.** Each row is name, chip, `directive.reason`, and one `COACH_MOVES` button,
using the demo engine output. The engine ranks Sam before Jonah, by flag count.

| Client | Chip | Line | Button |
|---|---|---|---|
| Marcus T. | Needs you · Joint | "Slipping on both sides — streak broken and no logs 3d. One coordinated message beats two separate nudges." | Start joint note |
| Sam R. | Needs you | "No contact in 7 days" (+ chip "No logs 4d") | Message |
| Jonah W. | Needs you | "No check-in for 3 weeks" | Ask for this week's check-in |

- The mock's "This week's just came in" contradicts the flag. If this week's check-in had
  arrived, the flag would have cleared.
- "6 more" splits into "4 to watch" (Aisha K. "No contact in 6 days", Deandre K. "No food logs
  in 3 days" + "Ledger +21% → dietitian", Elena R. "Shape Score down 7 pts week-over-week",
  Nadia P. "“Goal weight” slipped — the projected finish moved 15 days later this week") and
  "2 good news" (`buildMilestones`: "Jordan M. — 5k under 25:00", "Priya S. — Squat 245 lb PR",
  with **Congratulate**).
- Keep the website tabs New clients, Check-ins and Replies, with their own engine or queue copy.

**Today's sessions.** Fold each flagged client's line onto their session row
(`bsProFoldTodos`). Priya's 17:30 row carries her routed "Protein low → dietitian" as context,
not as an alert.

**Nutritionist variant.** Same structure, run with the nutritionist role. The engine output
differs: Deandre K. goes red ("No food logs in 3 days" + "Ledger +21%"), Priya S. goes amber
("Averaging 96g protein vs a 150g target"), and Tess B. goes amber ("No message in the 5 days
since they joined", label "Never messaged").

### Clients (clients-v2.html)

**Roster health bands.** Use `dashRosterStatus`: "3 Need you · 4 Watch · 3 On track", plus
"Not enough data" when any client is unknown. Show "New" as a sub-count, from the engine's
`fresh`.

**Group rows.** The row lead is the engine sentence, not check-in prose.
- The mock's "rest" text ("knee twinge on lunges", "asked about creatine", "stress at work all
  week") comes from check-in struggles and questions. That is data, not engine; put it in the
  peek, not on the triage line.

Engine rows (trainer):

| Group | Client | Lead | Extra chips / note |
|---|---|---|---|
| Needs you | Marcus T. | "No food logs in 3 days" | "Streak broken", "Score ↓8", Joint |
| Needs you | Sam R. | "No contact in 7 days" | "No logs 4d" |
| Needs you | Jonah W. | "No check-in for 3 weeks" | — |
| Watch | Aisha K. | "No contact in 6 days" | — |
| Watch | Deandre K. | "No food logs in 3 days" | "Ledger +21% → dietitian" |
| Watch | Elena R. | "Shape Score down 7 pts week-over-week" | — |
| Watch | Nadia P. | "“Goal weight” slipped — the projected finish moved 15 days later this week" | — |
| On track | Jordan M. | "9-day streak, deficit holding, sessions on plan — keep it boring." | Win ✓ "5k under 25:00" |
| On track | Priya S. | as Jordan | routed "Protein low → dietitian" |
| On track | Tess B. | onboarding "New · {next step}" | — |

- Marcus's lead is the directive's top reason. For the joint case, the joint sentence is better.

**Sort.** "Needs you first" is `getTriageFeed` order.

**Peek panel.** Lead with the app case file's YOUR MOVE pattern:
- verdict + reason, e.g. "Tighten nutrition — No food logs in 3 days";
- one `COACH_MOVES` button;
- up to 3 evidence rows, e.g. "LOGS · QUIET 4 DAYS", "ATTENDANCE · 18/20 SESSIONS";
- then `read.summary30d`: "30 days: 18/20 sessions · avg 2080 kcal · -0.1 lb".

The joint card is right, with the engine's text and "Start joint note". After that come the
check-in ratings with Mark reviewed, the Shape Score line, food logs, next session and notes.
The food-logs line should echo the flag: "No food logs in 3 days".

### Week (week-v2.html) — "Patterns, worked out"

The engine has no cross-client pattern over weekly check-in ratings or questions. "Stress is the
week's weak spot" and "2 clients asked about creatine" are honest counts of check-in data, but
they are **not** engine findings.
- Either label them "From this week's check-ins" and keep them as counts,
- or add a roster pattern rule to `dashSignals.js` first.

Patterns the engine can already state for the demo week, with exact wording:

| Pattern | Who | Button / source |
|---|---|---|
| **3 have no food logs in 3+ days** | Marcus T. (3d), Sam R. (4d), Deandre K. (3d) | Nudge all 3; each draft from their own flag |
| **Marcus T. is slipping on both sides** — streak broken and no logs 3d. One coordinated message beats two separate nudges. | Marcus T. | Start joint note |
| **2 waiting on a check-in before you can program** | Jonah W. ("Waiting on this week's check-in"), Tess B. ("Waiting on their first check-in") | Ask both |
| **Shape Score down for 2** | Marcus T. ▼8, Elena R. ▼7 | `dashTopMovers.down` |
| **Weekend pattern** (when the split fires) | per client | "WK 86% · WE 54%" + "Set a weekend check-in or a lighter weekend nutrition target." (app plate copy) |
| **Week-to-week swings** (variance VARIABLE) | per client | "Week-to-week: swings 40–95% — steady the floor before raising the target." |

The engine also offers energy, hunger and sleep counts from the daily check-in, e.g. "2 have
averaged energy of 4/10 or lower this week". Today only the app's record carries those.

"Food logging is thin for 3 (under 4 of 7 days)" uses a cut the engine doesn't have. Use the
food-gap rule above so the count matches Today and Clients.

### Goal (goal-v2.html) — the coach's own practice goals

- Live goals bind to real metrics: active clients, net MRR, and average session adherence
  (trainer) or average protein adherence (nutritionist). They have **no projection**.
- The mock's "Heading for 83% on Dec 31", "Reaches 16 on Jan 11, 11 days late" and "Gets there
  Dec 25" are not computed anywhere.
- To make them real, run `DashSignals.projectGoal` over the weekly series that already exist:
  `coach-trajectory.mjs` for active clients and MRR, `get_roster_weekly_adherence` for adherence.
  Use its state words ("pace {date}", "pace stalled", "1y+ at this pace", "hit {date} ✓") in
  place of "Off track / Behind / On track".
- The adherence goal's action can come straight from client records. Clients under the target,
  by `trainingAdherence`: Sam R. 9/14 sessions (64%), Jonah W. 10/14 (71%). The mock's "Nudge
  Sam R. and Jonah W." is correct.
- "Invite 3 clients" and "Try $200 for new clients" are Plan-tab forecasts (`coachForecast.js`),
  not engine recommendations. Label them as what-ifs.

### Business · Retention (business-retention-v2.html) — "Who might leave?"

There is no churn model. Build the list only from real signals, in this order, each with its
source string:

1. **Cancelled, ends {date}**: renewals with `ending: true` (Stripe cancel-at-period-end, 7-day
   window, up to 25 checked).
2. **Payment retrying**: roster `paymentRetrying` (past due).
3. **Engine red**, with tenure. Demo rows (trainer):

| Client | Line (engine wording) | Tenure | Band |
|---|---|---|---|
| Sam R. | "No contact in 7 days · No food logs in 4 days" | 2 years | Needs you |
| Marcus T. | "Streak broken — was 12 days · Shape Score down 8 pts week-over-week · No food logs in 3 days" | 3 months | Needs you |
| Jonah W. | "No check-in for 3 weeks" | 18 days, first month (onboarding) | Needs you (the engine makes him red; the mock says Watch) |
| Aisha K. | "No contact in 6 days" | — | Watch |

- Put Sam's "Cancelled: the plan ends Wed, Nov 11" first, but only when the renewals read says
  `ending: true`.
- "$666 a month at stake" is the sum of each row's net (`rowNetCents`: 180 + 153 + 153 + 180).
  It matches the engine's demo roster.
- Change the footer to "From the signals on Today: check-ins, food logs, contact, Shape Score and
  plan changes." Replies are not in the engine.
- "Why did people leave?": live there are no exit reasons yet. Show the existing empty line
  ("Exit reason — collects once the cancellation survey ships") rather than quotes.

### Programs (programs-v2.html) — "Due next week"

Replace "8 ready / 2 need you / Send 8 ready" with the programming queue's real meaning:

> **10 to program for next week · 8 ready · 2 waiting on a check-in**
> Ready: "Check-in received — ready to program" (Aisha K., Deandre K., Elena R., Jordan M., Marcus T., Nadia P., Priya S., Sam R.)
> Waiting: Jonah W. "Waiting on this week's check-in" · Tess B. "Waiting on their first check-in"

- Per-row actions are the ones that exist: open the template or builder, and **Mark written**.
  A publish ticks the row and reads "Week of … · delivered".
- "Send 8 ready" implies a bulk publish the queue does not do. Don't show it unless that exists.
- The mock's Marcus line ("Knee twinge: swap the lunges") is from his check-in struggle and coach
  note, not the engine. Show it as a note, not as the reason he "needs you".
- Add the engine's **ending soon** block (`dashProgramsEnding`): "Priya S. · Cut · Conditioning ·
  week 7 of 10 · 3 weeks left — write the next block before the last session." The same applies
  to Tess B.'s Onboarding (1/4). Flag `overdue: true` blocks and show `nextAssigned` when set.
- Show `plan_due` here when it fires: "Week 1 not live — Week 1 was set to start {date} and no
  plan is published".
