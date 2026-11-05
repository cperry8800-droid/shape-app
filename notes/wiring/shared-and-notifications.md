# Shared clients and how coaches are notified

Research for the owner's two asks (2026-11-05): "a portal or area that shows the view and data if
coaches are sharing a client … should already be wired, but needs to be in new design on dashboard",
and "how coaches are notified". Code read at the working tree on 2026-11-05; nothing in the repo was
changed. The engine's alerts and recommendations are catalogued in `wiring/engine.md`; this file
covers sharing, and the delivery side of notifications.

Status key: **WIRED** live in code today · **DERIVABLE** the data exists, it needs UI or glue ·
**NEW** needs new data, a new writer or a migration · **MOCK-ONLY** illustration in the mock-up.

## Summary

**Sharing is wired at the data layer, thin in the UI.**
- Two coaches share a client when the member pays both (an open subscription each). Nobody opts in.
  Every coach on the client reads the same client data through `is_coach_on_client`.
- Each coach's own plan stays theirs. The other coach reads only a projection:
  - program headers;
  - workouts without sets, menus without recipes;
  - the other coach's sessions.
- Both coaches are told when the sharing starts. They get a private care-team thread the client can
  never read.
- What's missing is a place that puts it together. The website has:
  - a "Shared with you" tab that lists names;
  - a Care team card low on the client page;
  - a "See all schedules" calendar overlay.
- Also missing:
  - no shared note other than the thread;
  - no hand-off log (a plan change isn't recorded or announced);
  - no shared to-do list.
- The engine's two shared features both have a bug: they assume a co-coach exists without checking.
  - **Joint attention** fires for any client slipping on both sides, co-coach or not. Its "Start
    joint note" button messages the client, not the other coach.
  - **Routed flags** ("→ dietitian") assume the other coach exists. So a trainer-only client's
    nutrition flags are shown as someone else's job, and are never alerted.

**Notifications work end to end. The bell is the weak part.**
- Every notice is a row in `notifications`. It shows in the bell, pushes through one webhook, and
  emails only the few kinds email is offered for.
- Delivery controls, all real and shared by both settings screens:
  - quiet hours (default 10 pm – 7 am, in the coach's zone), which hold pushes until morning;
  - a daily push limit (default 4), with the overflow rolled into one "N updates for you";
  - per-kind × per-channel switches for 13 coach kinds;
  - mute everything.
- There's no scheduled daily digest. The only digest is the roll-up of what quiet hours or the
  limit held.
- The website bell is a 340px newest-first list. It has no grouping, no actions, no drafts, and
  doesn't say how a notice was delivered.
- Gaps:
  - Coaches who only use the website get no red or amber alerts (see `engine.md`).
  - "Check-in received" has a switch but nothing sends it.
  - A member cancelling a session tells nobody.
  - A co-coach changing a shared plan tells nobody.
  - Nora's message drafts reach coaches in the app only.
  - Device push still waits on the owner's push keys (#2385).

## Part A · Shared clients today

### A1. How two coaches end up sharing a client, and what allows it

| Piece | How it works | Where | Status |
|---|---|---|---|
| The link | A member with an open subscription (active, trialing, past_due) to two listings. No consent step, no invite: hiring the second coach is the act. | `is_coach_on_client` `supabase-migrations/2026-10-18-coach-access-past-due.sql:72` (first `2026-05-26-shared-clients.sql:19`) | WIRED |
| Who the co-coaches are | `get_my_shared_clients` (trainer ↔ nutritionist pairs only) and `get_client_coaches` (every coach the member pays, a second trainer too) | `2026-10-18-coach-access-past-due.sql:531, :441`; read at `src/lib/shared-overview.ts:126, :131` | WIRED |
| A failed care-team read | Flagged `careTeamPartial`, rendered as "couldn't load", never as "only coach" | `shared-overview.ts:148`; `coachClientDetail.jsx:589` | WIRED |
| Being told | `tellSharedCoaches`: when a member hires a coach while another is on them, both sides get `shared_client` (bell + push, no email), one per pair, deduped. Existing pairs were told once by migration. | `src/lib/coach-thread.ts:325, :376`; `2026-10-29-shared-client-schedules.sql` §2 | WIRED |
| The "Shared" badge | `shared_client_acks` per (coach, client, counterpart); "N new" on the tab until dismissed | `2026-05-26-shared-clients.sql:51`; `/api/me/shared-clients/[clientId]/ack` | WIRED |
| Member's control | Only goals (`share` flag) and the cycle are share-gated per member. The privacy policy says members "adjust what each coach can see from Settings" (`public/privacy.html:212`). But `shareDataWithCoaches: "All metrics"` (`public/newdesign/clientMeSettings.jsx:46`) is a default nothing reads, so every linked coach sees the same thing. | `2026-06-13-client-goals-coach-read.sql`; `get_client_cycle` | Partly WIRED; per-coach control NEW. Counsel review of the policy is already on Waiting on the owner. |
| Two trainers | Two trainers share the care team and calendar, but not the Shared tab (that roster stays trainer ↔ nutritionist) | `warroom.ts:2708` (pending) | Partly WIRED |

### A2. What each coach can see of the other's work

| What | Can the other coach see it? | Where | Status |
|---|---|---|---|
| The other coach's program / plan | Header only: title, goal, level, weeks, days a week, the assignment's notes | RLS `shared_coach_reads_assignments` / `_templates` (`2026-05-26-shared-clients-plans.sql:10, :23`); `shared-overview.ts:241-297`; shown as "CURRENT PLANS" `coachClientDetail.jsx:693` | WIRED |
| Workouts on the calendar | Title, description, date, length, time, number of exercises, trainer's name, last 5 finished runs. No sets. | `get_shared_client_workouts` `2026-10-29-shared-schedules-any-coach.sql:26`; `/api/calendar` | WIRED |
| Menu on the calendar | Each day's title and tag; each meal's slot, title, time and kcal. No ingredients, steps or notes. Newest menu only. | `get_shared_client_meal_plan` `…any-coach.sql:94` | WIRED |
| Sessions / consults | Confirmed, requested and completed sessions of both coaches (the other coach's are read-only) | RLS `shared_coach_reads_sessions` `2026-05-26-shared-clients.sql:84`; `shared-overview.ts:209-237` | WIRED |
| Client data (check-ins, food logs, macros, weigh-ins, measurements, photos, sleep, vitals, score, intake, PAR-Q, cycle, meal prep) | The same for every coach on the client, gated by `is_coach_on_client` (goals and cycle also by the member's share switch) | `shared-overview.ts:304-349` | WIRED |
| Nutrition targets / phases | One shared `client_programs` row (training + nutrition sections, coach goals) | `shared-overview.ts:336, :539` | WIRED, with no change history (see A4) |
| Check-in "reviewed" | Per coach, in each coach's own `user_goals` doc | `public/newdesign/dashData.jsx:765-778` | WIRED (private) |
| Private notes | Never shown: "Private to you — never shown to the client or a co-coach" | `coachClientDetail.jsx:173, :294` (`user_goals` `coach_client_notes`) | WIRED (private) |
| Each coach's thread with the client | Private to that coach (participant-scoped) | `shared-overview.ts:340`; `can_access_conversation` | WIRED (private) |
| Review notes, "team" visibility | The schema has `client | coach_private | team`. "team" is also readable by the client, and a workout note only by that session's coach. So it isn't a coach-to-coach note. | `2026-05-02-workout-session-logs.sql:89, :180-188`; `2026-08-31-nutrition-day-review-notes.sql:103` | Not a joint note |

### A3. Joint notes, hand-offs and coach-to-coach messaging

| Piece | Today | Where | Status |
|---|---|---|---|
| Care-team thread | A private coach ↔ coach thread per client, opened by "Message {name}". The client can't list, read, post or be notified. A message notifies only the other coach (`data.careTeam`). A coach who stops coaching the client loses access. | `get_or_create_coach_coach_conversation` `2026-10-18-coach-access-past-due.sql:261`; `/api/me/shared-clients/[clientId]/thread`; privacy `2026-10-15-keep-care-team-private.sql:46, :134` | WIRED |
| Joint attention | A client with a training flag (streak broken) and a nutrition flag in one week. Shows "Joint attention · with their nutritionist" on website Today (max 2). Not in the app, Nora or push. | `dashSignals.js:1326`; `dashToday.jsx:913-925` | WIRED, with two bugs ↓ |
| ↳ bug: no co-coach check | Runs over every client (`dashData.jsx:633`). Records don't carry the care team, so it fires for a client with no nutritionist and still says "with their nutritionist". | `dashSignals.js:1326-1339` | DERIVABLE fix: `careTeam` is already in the overview |
| ↳ bug: messages the client, not the co-coach | "Start joint note" opens a draft to the client ("your nutritionist and I compared notes…") and tells the other coach nothing | `dashToday.jsx:384, :923` → `dashMessageClient` `:349` | DERIVABLE: post to the care-team thread too |
| Routed flags ("→ dietitian", "→ trainer") | A flag outside the viewer's discipline is shown read-only and never counts or alerts | `dashSignals.js:951-980`; `dashToday.jsx:871`; alerts skip non-owned flags `notifications.mjs:510` | WIRED, with a bug ↓ |
| ↳ bug: assumes the other coach exists | `hasPro` returns true unless `c.pros` is set, and nothing sets it. The engine's own rule ("a client with a single pro → that pro owns everything") is never applied. A trainer-only client's protein and ledger flags read "→ dietitian" and never reach the trainer. A nutritionist-only client's broken streak reads "→ trainer". | `dashSignals.js:947-949` | DERIVABLE fix: set `pros` from `careTeam` in `_dashRecordFromLive` and `recordFromCoachData` |
| Hand-offs / change log | None. A target change (`client_programs.detail`) or a new menu leaves no event, and the other coach isn't told. The calendar shows only the newest menu. | — | NEW (a change event: a trigger or a write-path hook, plus a `care_team` system message or notice) |
| Who owns the next action | Implicit: by discipline (routed flags), by booking (sessions), by plan step (onboarding board, per role) | `dashSignals.js` routing; `shared-overview.ts:545-605` | DERIVABLE (a list view); a shared assignable to-do is NEW |
| Recommendations for both | Only joint attention. `buildDirective` reasons across disciplines but speaks to one coach. | `dashSignals.js:1342-` | DERIVABLE for routed + joint; a "both of you agree X" recommendation is NEW |

### A4. Where it shows today

| Surface | What's there | Where |
|---|---|---|
| Website Clients → "Shared with you" tab | A table: client name (grey blank avatar), the other coach, New / Seen, Message {name}, Dismiss. No client data, no plans. | `public/newdesign/sharedClientsTab.jsx:18-174`; tab `trainerClientsPage.jsx:65`, `nutritionistClientsPage.jsx:65` |
| Website client page | Subtitle "Care team of N"; a CARE TEAM card (name, role, Message) with "See all schedules →" (calendar overlay with every coach's plans); CURRENT PLANS (each coach's plan header side by side) | `coachClientDetail.jsx:589, :653-683, :691-715` |
| Website Today | Joint attention banner (above); routed pills "→ dietitian" | `dashToday.jsx:871, :913-925` |
| App coach client page | CARE TEAM rows "{role} · CO-MANAGING", MESSAGE (opens the care-team thread in Chat), "See all schedules →" | `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx:4037-4160, :5130-5176`; `shapeBackend.js:6790` (`ShapeCareTeam`) |
| App / website chat | The care-team thread titled "Care team" (website opens it in the chat bubble) | `public/newdesign/pageShell.jsx:556, :577`; `chatWidget.jsx:1368` |
| Bell / push | `shared_client` notice, opens the client's page | `coach-thread.ts:376` |

Rulings found:
- "Both coaches should be notified if they share a client" (2026-10-29, `warroom.ts:1523`).
- "Any shared client for any trainer or nutritionist should be shared" (schedules, 2026-10-29,
  `warroom.ts:1496-1501`).
- "Members can have multiple coaches" and "shared section is fine" (2026-10-16,
  `2026-10-16-client-coaches.sql:1-8`).
- "Go ahead, fix the privacy one first": the client must never read the care-team thread
  (2026-10-15).
- The "decide whether coaches keep seeing each other's active clients and sessions-kept rate" item
  in Waiting on the owner is about the **coach leaderboard**, not shared clients
  (`WORKLOG-ARCHIVE-2026-10.md:134`).
- Still open (OWNER manual): on staging, have a member hire two coaches, and check both notices and
  See all schedules (`warroom.ts:1516, :1527`).

### A5. Design (shared-client.html)

**Where it lives:** Clients → **Shared** (the existing "Shared with you" tab, kept as a segment) →
the client peek opens on a **Team** tab.
- A dedicated area would split the roster in two. A filter alone would hide the joint work in the
  normal peek.
- The Team tab sits in the same peek every page already uses (round-2 decision), so it is one click
  from Today, Week or Schedule. It only appears on clients with a co-coach.
- `?side=rae` renders the same screen from the nutritionist's side.

| Element in the mock-up | What it shows | Status |
|---|---|---|
| Shared list, grouped "With Rae Lindqvist · nutritionist" | 4 clients (Marcus T., Priya S., Jonah W., Elena R.), one line of the latest between the coaches, and whose move is next (coach gem) | List WIRED (`/api/me/shared-clients`); the "latest" line and "next" owner DERIVABLE (thread `last_message_at`, sessions, routing) |
| Team header | Client gem, status, both coaches with role and "since" | WIRED (`careTeam`, `get_client_coaches.since`) |
| This week, both plans | One set of days, two lanes. Training (Maya: sessions in Priya's colour, done ✓, today's next, Friday's "She asked: shorter?"). Nutrition (Rae: kcal per day, training/rest tag, "▲ carbs", what she ate and protein in rust when under, Rae's 1:30 consult). | Lanes WIRED (`get_shared_client_workouts` / `_meal_plan`, sessions); "eaten / protein" WIRED (`logs` leg, stats); per-day protein DERIVABLE; check-in question on Friday DERIVABLE (check-in text) |
| Care-team thread | Rae ↔ Maya messages, reply box, "Priya never sees this" | WIRED (thread + privacy) |
| Hand-off card in the thread | "Rae raised carbs on training days, 160 → 190 g from Mon Nov 2", posted automatically | NEW, labelled Proposed |
| Next, and whose | Rae's consult 1:30 pm (live) · You: answer "a shorter Friday?" · Rae: move to Steady Maintain by Sun 8 | Consult WIRED (shared sessions); owner-by-discipline DERIVABLE; plan-due step DERIVABLE (onboarding/plan board) |
| Shape suggests, for both | "Protein under target 5 of 7 days → Rae's call" (read-only to Maya) · "Energy 2 of 5 … shorten Friday and keep its carbs" | First WIRED (routed flag); second NEW, labelled Proposed |
| You both see / Only you | Check-ins, food logs, weigh-ins, sleep, score, goals (while shared) · private notes, your own thread | WIRED (describes A2) |

To build it (no migration for most of it):
1. Pass `careTeam` into the dashboard records and set `pros`. This fixes joint attention and routing.
2. Have "Start joint note" also post to the care-team thread.
3. Build the Team tab from the existing overview plus the two calendar definers.
4. A hand-off event needs a migration or a write-path hook.

## Part B · How coaches are notified today

### B1. Every notification a coach can receive

The "Switch" column is the switch name in `PREFERENCE_OF` (`public/newdesign/notificationSurfaces.mjs:66`).
The default for every switch is in-app on, push on, email off
(`src/lib/ai/notifications.mjs:59`, `coachSettings.jsx:32`).

| Kind · switch | Trigger | Writer | Channels | Copy (English) | Opens | Status |
|---|---|---|---|---|---|---|
| Client went red · `client_red` | The engine, on the roster snapshot the **app** last posted: a client this coach owns enters red (only on appearance or worsening). Re-run hourly for 14 days. | `coachCandidates` `notifications.mjs:500`; `notify-core.ts`; `/api/ai/notify/cron` (`vercel.json:5`); snapshot from the app `shapeBackend.js:10034` (30-min throttle) | Bell + push; never email | "{client} needs you" / the engine's top owned reason, else "Flagged on your triage." (`notifications.mjs:281`, notice `coach.red.*`) | Client page (app; website `#client/<id>`) | WIRED, app-fed (website-only coaches get none: `engine.md` §2c) |
| Client went amber · `client_amber` | Same, amber | same | Bell + push | "{client} — worth a look" / reason, else "Edging amber on your triage." | Client page | WIRED |
| Updates for you (digest) | Engine items held by quiet hours, the daily limit or low priority, sent together at the next run | `decideNotifications` `notifications.mjs:612-764` | The channels its items wanted; push only under the limit | "N updates for you" / first 3 titles + "+N more" | Coach's client list (`route: clients`) | WIRED |
| Client message · `client_message` | A client writes in the coach thread | DB trigger `notify_on_new_message` (`data.side = coach`) | Bell + push | "New message" + their words | Website: TrainerMessages.html?conversation=… ; app: Chat | WIRED |
| Care-team message · `client_message` | The co-coach writes in the care-team thread; only the other coach is told | same trigger, `data.careTeam` `2026-10-15-keep-care-team-private.sql:134` | Bell + push | "New message" | Website: the chat bubble on that thread (`pageShell.jsx:556`) | WIRED |
| Messages · `direct_message` | Another member writes | same trigger (`side = member`) | Bell + push | "New message" | Chat bubble, Friends tab | WIRED |
| New client · `new_client` | A subscription is saved (Stripe webhook) | `coach-thread.ts:277` | Bell + push, **and always an email** (`coach-thread.ts:294`) | "New client: {client}" / "{client} subscribed · $X/mo to you. Your thread with them is open in Messages; read their screening on their client page before you program." | The new thread (`chat:<id>`), else the client page | WIRED |
| Shared client · `shared_client` | A client of yours hires another coach (or you're hired by a client who has one) | `coach-thread.ts:325, :376` | Bell + push, no email | "Shared client: {client}" / "{client} now works with you and nutritionist {coach}. You can message each other in the care team on their client page." | Client page | WIRED |
| Session request · `sessions` | A member requests a session or a consultation | `sessions/request/route.ts:181`; `consultation/route.ts:391` | Bell + push | "New session request" / "{client} requested a session on {when}." | Schedule | WIRED |
| Session to schedule · `sessions` | A paid session | `coach-thread.ts:484` + **always an email** `:495` | Bell + push + email | "Session to schedule: {client}" / "{client} paid for a session · $X to you. It waits on your Schedule under To schedule…" | Schedule | WIRED |
| Refunded session · `sessions` | A paid session is refunded | `src/lib/refund-session.ts:71` | Bell + push | "Refunded session cancelled" / "{client}'s paid session was refunded…" | Schedule | WIRED |
| A member cancels a booking | Nothing tells the coach: the route notifies only the member, and only when the coach confirms, declines, moves or cancels | `sessions/manage/route.ts:754-760` | — | — | — | NEW (gap; the switch's help text says "cancellations") |
| Payment · `payments` | Monthly renewal; a program or meal-plan sale | `payment-notices.ts:233`; `coach-thread.ts:452` | Bell + push | "Monthly payment: {client}" / "{client}'s monthly plan renewed · $X to you." · "Payment received: {client}" | Business | WIRED |
| Waiting list · `waitlist_join` | Someone joins the coach's waiting list | `waitlist/join/route.ts:137` | Bell + push; **the only coach kind with an Email switch** (off by default) | "New waiting-list request" / "Someone joined your waiting list." | Website: Profile (waiting room) | WIRED |
| Credentials · `credentials` | Verified / a fix needed / not verified (admin); insurance or license expiry (weekly cron, Mon 08:00 UTC) | `src/app/dashboard/credentials/actions.ts:68, :110, :151`; `cron/credential-expiry/route.ts:86` | Bell + push | "You're verified ✓" · "Credential review — a quick fix needed" · "Insurance renewal coming up / expires {date}" | Profile (certifications) | WIRED |
| Followers · `follows` | Follow, follow request, accepted | DB trigger | Bell + push | trigger copy | The follower's profile | WIRED |
| Friends' habits · `friend_habit` | A friend hasn't done a shared habit by evening (hourly cron) | `cron/habit-watch/route.ts:298` | Bell + push (under the daily limit) | "{name} hasn't done “{habit}” yet today" | Their profile | WIRED |
| From Shape · `account` | Account notes | `general` writers | Bell + push | various | — | WIRED |
| Check-in received · `checkin_submitted` | In the registry (`notifications.mjs:42`), but **nothing sends it**. The website removed its switch (`coachSettings.jsx:80-88`). | — | — | — | — | NEW (registered: `warroom.ts:2731`) |
| Co-coach changed a shared plan | — | — | — | — | — | NEW |
| Client win / PR | Wins show on Today only (`DashWinsPanel`); no notice | — | — | — | — | NEW |

### B2. Delivery rules

| Rule | Behaviour | Where | Status |
|---|---|---|---|
| One table | Every notice is a `notifications` row. A `data.dedupe` unique index stops repeats. Bell, push and email all read that row. | `src/lib/notify.ts:42-70`; `2026-10-05-notifications-dedupe.sql` | WIRED |
| Push | A Supabase DB webhook on insert calls `/api/push/dispatch`, which pushes through FCM, gated by the recipient's switch | `src/app/api/push/dispatch/route.ts:1-12, :282` | WIRED in code; device delivery waits on the owner's APNs/Firebase keys (#2385, Waiting on the owner) |
| Email | Only `EMAIL_TYPES` (`coach_message`, `waitlist_invite`, `tier_up`, `waitlist_join`). For a coach that's just `waitlist_join`, off by default. Plus transactional emails that always go: new client, paid session. | `notificationSurfaces.mjs:40-52`; `coach-thread.ts:294, :495` | WIRED |
| Quiet hours | Default 10 pm – 7 am in the person's own zone (profile, then settings; none known means no quiet hours). A regular notice landing in them is stamped `held_at`. `/api/cron/push-held` (every 15 min) pushes it once the night ends: at most 3 per person per run, oldest first; one older than a day isn't pushed; a read one isn't pushed. Reminders are exempt. Engine alerts in quiet hours go to the digest instead. | `notifications.mjs:158-174`; `notify-core.ts:75`; `dispatch/route.ts:60-62, :215-219`; `cron/push-held/route.ts:22`; `vercel.json:53` | WIRED |
| Daily limit | Default 4 pushes (choices 2/3/4/6/8). Counts pushes only, shared by the engine and the habit cron. Past it, engine items wait for the digest. | `notifications.mjs:81, :700-712`; `notify-core.ts:135`; `coachSettings.jsx:38` | WIRED |
| Mute everything | Master switch | `notifications.mjs:651`; `coachSettings.jsx:619` | WIRED |
| Phone-only kinds | Member reminders and habit nudges stay off the website bell | `notificationSurfaces.mjs:11-31`; `api/notifications/route.ts:51` | WIRED |
| Daily digest | None scheduled. The only "digest" is the roll-up above. | — | NEW (proposed in the mock-up) |
| Language | Copy is stored in English with `data.copy` keys. The app bell and push say it in the reader's language; the website reads the English. | `mobile-app/src/services/noticeCopy.mjs`; `notify.ts:33-39` | WIRED |

### B3. The settings screens

| Screen | What it has | Where |
|---|---|---|
| Website Settings → "Notifications · your own" | Mute everything; quiet hours as two bare 0–23 number fields; "Most per day" chips; a table of 13 kinds × App / Push / Email (Email only on Waiting list). Footer: "Quiet hours hold them until the morning; the daily cap applies to the client alerts and friends' habits above." | `public/newdesign/coachSettings.jsx:25-88, :403-683` |
| App coach Settings | The same 13 kinds, per-channel toggles, quiet hours, mute | `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:26407` |
| Store | `notification_settings` (mute, quiet_start, quiet_end, tz, daily_cap) and `notification_preferences` (overrides only), read by `get_notification_center` | `notify-core.ts:56-80` |
| Sync guard | `tests/notification-switches.test.mjs` holds both screens to `PREFERENCE_OF` | — |

### B4. What the website bell shows today

- A 340px panel under the bell (`pageShell.jsx:459, :810`).
- Contents: up to 200 rows, newest first (`api/notifications/route.ts:52`); a teal unread count;
  each row's title, body and age ("3h").
- Header actions: Mark all read, and Clear all with a confirm.
- Honest loading and failed states.
- A row opens its route (`dashInboxHref` `:594`): the client page, Messages, Schedule, Business or
  Profile. Care-team and member messages open the chat bubble. A row without a destination is plain
  text.
- What it lacks:
  - no grouping or priority: a red client sits between a follower and a payment;
  - no action without leaving the page;
  - no Nora draft. The website's message drafts are templates (`dashToday.jsx:364-389`); Nora's
    model-written draft (`/api/ai/draft-message`, `source: 'nora'`) is used by the app only
    (`iosAppBroadsheetPros.jsx:3626`);
  - no sign of how a notice was delivered (pushed, held, emailed).

### B5. Design (notifications.html, notification-settings.html)

**The bell, opened** (`notifications.html`): a 488px drawer under the bell, over Today.

| Element | What it shows | Status |
|---|---|---|
| Groups: Needs you · Good news · For your information, plus a filter (All 10 · 3 · 3 · 4) | Grouped by what the coach does with it, not by time. FYI folds to one line each. | DERIVABLE (type → group map on the existing rows) |
| Summary line | "3 need you, 3 are good news, 4 are for your information. Quiet hours held 1 overnight; it reached your phone at 7:00 am." | DERIVABLE (`held_at`, types) |
| Marcus T. needs you · "Joint · Rae too" · **Nora's draft** · Review & send | A red alert with the joint context and a ready-to-edit message | Alert WIRED (app-fed); joint DERIVABLE (needs the co-coach fix above); the Nora draft exists (`/api/ai/draft-message`), in the bell DERIVABLE |
| Session request: Sat 9:00 AM · ✓ Accept · Other time · "quiet hours → 7:00 am" | One action in place; shows it was held overnight | Notice WIRED; accept-from-bell DERIVABLE (the Schedule's accept route); held mark DERIVABLE |
| Jonah W. needs you · Message Jonah | Check-in 3 weeks late | WIRED (app-fed) |
| Good news: new client Tess B. · monthly payment Aisha K. · Jordan M. 5k under 25:00 | One line each, one link | First two WIRED; the win NEW, labelled Proposed |
| FYI: shared client Jonah W. · Elena R. worth a look · insurance renewal · 2 followers | One line each, the row opens it | WIRED |
| How it reached you (bell / phone / moon icons + time) | Delivery made visible | DERIVABLE (switches + `held_at`) |
| Footer: "Phone today 3 of your 4 … Quiet 10 pm – 7 am · Settings →" | The limit and quiet hours in plain words | DERIVABLE (push-cap claims) |

**Settings** (`notification-settings.html`) reuses `settings.html` (two panes, section nav, payouts
card, floating save bar), with Notifications open.

| Element | What it shows | Status |
|---|---|---|
| Quiet hours | The day as one track, nights hatched, a now-line. From/to as time pickers, "New York time, from your profile". "At 7:00 your phone gets what waited, three at most." | WIRED (rules); the track and time pickers replace the bare 0–23 fields |
| Pushes a day | 2 / 3 / 4 / 6 / 8, "3 of 4 used today", the "N updates for you" roll-up; Pause everything | WIRED; "used today" DERIVABLE |
| Which kinds go where | 13 kinds grouped Clients / Schedule and money / You and Shape × In the bell / Phone / Email. "Shape engine" tag on red/amber. Email only on Waiting list; "Always" on New clients and Sessions (receipt emails). 2 changed rows. | WIRED (same switches) |
| Check-in received · Care-team hand-offs | Disabled switches, labelled Proposed: "no sender yet" | NEW |
| Morning summary | One push at a time you pick. In it: amber, shared clients, payments, followers, credentials. Still right away: red, messages, requests, new clients. A phone preview against today's roll-up. | NEW, labelled Proposed |

## Files

- `/tmp/claude-0/-home-user-shape-app/7174c142-9643-5e05-a172-df53668bd76d/scratchpad/coachmock/shared-client.html` (`?side=rae` for the nutritionist's side, `?paper=dark`)
- `/tmp/claude-0/-home-user-shape-app/7174c142-9643-5e05-a172-df53668bd76d/scratchpad/coachmock/notifications.html`
- `/tmp/claude-0/-home-user-shape-app/7174c142-9643-5e05-a172-df53668bd76d/scratchpad/coachmock/notification-settings.html`
- Screenshots at 1440×900 and 2× in `/tmp/claude-0/-home-user-shape-app/7174c142-9643-5e05-a172-df53668bd76d/scratchpad/coachprop3/`:
  - `shared-client.png`, `shared-client-rae.png`, `notifications.png`, `notification-settings.png`;
  - checks: `*-full.png`, `*-1280.png`, `*-dark.png`, `shared-client-rae-full.png`.
- At 1280 none of the three screens scrolls sideways, and the checker found no clipped text.
