# Wiring the coach dashboard: build plan (2026-11-05)

Source reports: $S/wiring/practice.md, coaching.md and engine.md. builders.md and
shared-and-notifications.md are pending. $S = /tmp/claude-0/-home-user-shape-app/7174c142-9643-5e05-a172-df53668bd76d/scratchpad

Owner: "Ok can you build all of the things missing so we can do all of this?" Stripe is
already integrated; we use the existing Connect setup.

Each package is built in its own git worktree and committed locally. The main session lands
them one at a time on claude/ecstatic-curie-4k0ixf → PR → CI → merge (on the owner's word),
rebasing the next one onto main each time. Packages own the files listed so they don't collide.

## P1 · Correctness fixes (no new tables)
- Today's day in the coach's time zone: trainer/dashboard route.ts:132-149, nutritionist :126-143.
- Program and "Wk x/y" from what the assign flow writes (client_workouts) and not the unwritten
  coach_program_assignments: shared-overview.ts:241 and every reader.
- dashBuilder.jsx:3077 reads `track_count`; the column is `tracks`.
- dashWeek.jsx:267: this week's food logs shown on past weeks.
- "Adherence · 7d" label matches what it measures (sessions kept over 42 days, all coaches).
- Growth funnel "Consults booked" counts intro sessions only (sessions.intro):
  trainer/dashboard :162, :233-240; nutritionist :156, :224-231.
- Analytics roster top-12 cap: trainer/analytics route.ts:502-505.
- Refresh on window focus for Today, Week and Schedule (Programs already does it).
- Meal builder: every meal after the first defaults to Lunch (dashMealBuilder.jsx:280).
- Playlist builder repeats its sample tracks (trainerPlaylistsPage.jsx:575).
- Settings close-account through window.confirm/prompt (dashProfileExtras.jsx:751-752): in-page confirmation.
- SEPARATE COMMIT, the owner picks the timing: Score fixes. Completion counts only past sessions in a
  valid status; "programs published" counts published programs, not assigned workouts
  (score/route.ts:104-122, SQL 2026-10-18-coach-score-distinct-clients.sql:101,106,159,164).
  This moves every trainer's score and tier.

## P2 · One engine, coach actions (dashSignals.js and its four callers)
- The same inputs everywhere: the website feeds sleep, energy and hunger; app, push and Nora feed streak,
  Score, calories-over, protein and partial food gaps; the app uses the coach's tuned thresholds;
  Nora gets contact, health screening and "Week 1 not live".
- A coach-action table keyed by reason category (Message with Nora draft / Review check-in /
  Adjust program / Schedule / Read screening …), used by website and app instead of text search.
- Client message drafts never include coach-facing reason text.
- Push alerts fire again after a client recovers and slips (notifications.mjs:627/712/720), and
  coaches who use only the website get them too.
- Dismiss and snooze per client and reason (small table, migration).
- New signals: missed sessions, check-in waiting with ratings or questions, unanswered client
  messages, plan set to end, payment retrying, program ending, wearable recovery where data exists.
- Surface the engine's 30-day summary line and the "{name} first — {reason}" brief line.

## P3 · Money records (Stripe; migration; mutation round)
- `coach_payments` (or similar), written by checkout.session.completed and invoice.paid: gross, Shape
  fee, coach net, client, coach, role, paid_at and Stripe ids. Idempotent on the invoice or session id.
  Plus a backfill script from Stripe.
- Save cancellations on subscriptions from the webhook: cancel_at_period_end, canceled_at, ended_at,
  and the Stripe cancellation_details reason and feedback.
- A cancellation reason question where members cancel (Stripe portal reasons or our own).
- Each coach's payout schedule read from their Stripe account, for next-payout dates and wording.
- Payout history kept and shown (coachForecast.js:403), read beyond 12.
- Expose past_due ("payment retrying") and plan-ending for the engine.

## P4 · Growth, goals, programs data (migration)
- Profile view tracking per coach per day (privacy: aggregate counts, no visitor identity; note it
  for the privacy-policy review counsel is already doing).
- Goals: start value, start date, due date, archive (with confirmation) instead of delete-all
  (trainerGoalPage.jsx:276, nutritionistGoalPage.jsx:281), and weekly readings of each tracked
  figure with the engine's goal-pace projection.
- Programs: published_at.
- A read route for the coach's own nightly Score history (the 30-day sparkline).

## P5 · Programs, messaging, playlists (after builders.md and shared-and-notifications.md)
- "Programs due": relabel to "checked in, ready to program" by default (programs publish on assign);
  owner decision on a draft-then-send step.
- Group messages (Nudge all / Note to all); a coach-to-coach thread for shared clients.
- Playlists: an attach matrix that saves, the playlist link on the client's workout card
  (BSTrainDay.jsx:89-91), the track list from Spotify, energy tags, reorder write-back.

P5 additions from shared-and-notifications.md:
- Shared clients: Clients → Shared, plus a Team tab in the client peek, built on the existing data
  (get_shared_client_workouts / meal_plan, shared sessions, shared-overview, care-team thread).
- A plan-change hand-off event when a co-coach changes a shared plan, posted to the care-team thread.
- New notices: check-in received (the switch exists, nothing sends it), member cancels a session
  (sessions/manage/route.ts:754-760 tells nobody), wins; a morning summary is a proposal.
- Bell: group into Needs you / Good news / FYI, one action each (Accept from the bell), Nora's draft
  on the website, and how each notice reached the coach. Glue only.
- PRIVACY MISMATCH: DECIDED (2026-11-05): "just remove it, coaches should automatically be able to see
  activity data if client is paying for one". Correct the policy text, remove the dead setting. Was: privacy.html:212 says members choose what each coach sees, but
  shareDataWithCoaches (clientMeSettings.jsx:46) is never read. Either build per-coach sharing
  controls or correct the policy; counsel is already reviewing the policy.
- (The joint-flag and routed-flag engine bugs went to P2.)
- Owner (2026-11-05): "coaches can attach playlists to workouts or cooking meals when they send to
  clients". Workouts: client_workouts.playlist_id carried through every send path and shown on the
  client's card. Meals: a new playlist_id on a plan day (and optionally a meal), a ♪ picker in the meal
  builder, and "Cook to: <playlist>" on the client's meal card and recipe. Assigned to P5.
  CORRECTED: the owner says this is already wired, and it is. 2026-10-11-coach-playlists-for-clients.sql
  (coach_soundtracks.attached sends to a client or all clients, by role; get_my_coach_playlists shows
  them to members on Train and Eat), plus spotify/save-playlist. No new meal playlist store. P5 only
  wires the website's coach Playlists pages to it, passes the per-workout playlist link to the client
  card, and shows coach playlists on the member website.

## P6 · Builders and Nora drafting (from builders.md)
- Whole-program drafting from the website builder; the route already accepts it.
- When drafting for a client, Nora reads more than the training phase: goals, health-screening flags
  and injuries, recent logs and recent working loads. Load suggestions from the client's own logged
  loads are labelled; she still never invents a load.
- Meal drafts from Shape Kitchen's 100 recipes (not the 24 library foods), with train and rest-day
  targets; a meal plan holds both target sets.
- The app's ＋ New composer uses the same draft core as the website (not generate-plan's outlines).
- A daily budget on /api/ai/draft-workout and generate-plan (noraLimits), like Nora's questions.
- A draft snapshot kept, so the builder can show what the coach changed (the change list).
- Builder data: Kitchen search in the meal builder; template id stored on assignments (who's on a plan,
  "Most used"); "Update theirs" verified against the existing update-future-workouts feature, or built;
  plan lifecycle lists de-duplicated ("3 need a new plan by Sun"); Assign follows the client's own
  training days; a session-minutes estimate; drop "volume" from the summary.
- Wire the orphan /api/program-tools/templates (source = 'ai_generated'), or retire it.
- Keep the owner's 2026-11-04 ruling (#2590): no Nora box on the library pages; Nora lives in the
  New flow and inside the builders.

## Then: the new dashboard front-end, in the review's build order, on top of P1–P5.

## Decisions for the owner
1. Score fixes: DECIDED (2026-11-05): ship with P1, with a dated note on the Score page for ~30 days.
2. "Programs due": DECIDED (2026-11-05): A, relabel to what Shape does ("10 clients need next week's
   program · 8 have checked in · 2 waiting on a check-in", each name opening the builder). No draft step.
3. Cancellation reasons: DECIDED (2026-11-05): our own question, the member types the reason (free text).
4. Profile-view counting: APPROVED by the owner (2026-11-05: "4 = yes"), aggregate counts only.
5. Migrations: the owner runs each one (raw.githubusercontent link), per AGENTS.md.

## P7 · Website ↔ app parity (from wiring/parity.md; owner: "the website and app need to fully communicate")
Not already in P1–P6:
- Use the notification row as the change signal (realtime is already on for that table): on a
  workout, meal-plan, session or message notice, both surfaces re-read the screen it affects.
- The app re-reads the plan when it returns to the foreground (Home reads it once per mount).
- Website meal swaps and "✓ Logged" move into the account (today: browser storage under two keys),
  read by both surfaces and by the night-before prep reminder.
- Meal-log and goal-milestone points are awarded on the server, so both surfaces earn the same.
- Website chat: realtime, marking threads read, unread counts. Coach Messages pages stop treating a
  failed send as sent (TrainerMessages.html:143-150, NutritionistMessages.html).
- Member alerts built on the server from live data (P2 does this for coaches), so a member who logs
  on the website isn't pushed "No food logs in 4 days".
- Habit reminders re-sync in the app when they're changed on the website.
- The website profile editor re-reads before saving, so it can't overwrite app edits.
- Goals: one projection function and one "primary goal" field (three dates today).
- Sessions: members can cancel, move and join the call on the website (request exists).
- Coach tools that are app-only: adjust program, phases and nutrition targets, commitments and
  penalty waivers, workout review, grocery lists. These come with the new dashboard front-end.
Owner decisions raised: retire the unused member meal-plan table (recommended); tell members when a
coach writes a review note; server sync for wearables (WHOOP/Strava/Oura) vs app-open only.

## Scope note (owner, 2026-11-05)
"the app should stay the same for now, we will address that later": the app's dashboard screens are not
redesigned now. Only the PROFILES get app versions (coach: Feed/Climb/Studio + picker; member: Feed family +
Score climb). Data parity (P7) still applies to the app.

## P8 · Member profile privacy (owner decision, 2026-11-05; queued after P1–P7 land)
Owner: "if you are private you have to accept the request and then that member can see everything
if you accept."
- Private profile: a follow is a request; once the member accepts it, that follower sees the whole
  profile (wall, tabs, the Shape Score climb). Today an accepted follower still sees nothing on a
  Private profile; only the owner does (clientmock agent's audit). Fix on web and app.
- No separate audience control for the climb: it follows the profile's visibility.
- get_public_profile returns points/tier to every caller: withhold them (and anything else the
  profile hides) from a viewer the profile isn't open to (not public, not an accepted follower).
- "Just friends" stays as it is unless the owner says otherwise.

## Rollout (owner, 2026-11-05)
- The new coach dashboard goes to ALL coaches when it ships: no owner-only switch. Order: P1 (#2620)
  → P2 (engine; being replayed onto P1) → the new dashboard front-end → P3–P7 add their widgets.
- Lean defaults; a widget whose data isn't built yet is not offered (never a made-up figure).

## P9 · Time zones: each person sets theirs; every time shows in the viewer's own (owner, 2026-11-05)
Owner: "all time zones should be set by user" and times from another person "should automatically
update to their own timezone".
- **Today:** coaches' zone (`trainers.timezone` / `nutritionists.timezone`) is stamped from the browser
  whenever they save hours (`/api/my-availability`). Members' zone is `client_profiles.timezone`, from
  signup's free-text field or reminders. There is no setting. About 361 call sites in 74 files (website
  `public/newdesign/`, app `mobile-app/src/`) print times in the device's zone.
- **Build:**
  1. One zone per account, in Settings on the website and in the app. It defaults to the device's zone
     on first sign-in, the person can change it, and both role tables follow it. If the device's zone
     differs (travel), offer to switch; never switch silently.
  2. One shared formatter (in `public/newdesign/`, re-exported in `mobile-app/src/services/`). Every
     instant prints in the viewer's set zone. Sweep the 361 sites.
  3. Another person's times convert automatically: coach hours (stored coach-local plus zone) show in
     the member's zone, a member's bookings show in the coach's zone, and so on.
  4. The coach Today and the week-ahead panel use the set zone (#2620's `dayZone` is the start).
- **Order:** after P2, before the new dashboard front-end, so the front-end prints through the shared
  formatter from the start.
