# Shape Dashboard v2 — Roadmap

The spec for rebuilding the website dashboards (`public/newdesign/`) so they
match the app: **the updated design language, real data end-to-end, demo mode
when signed out, and one codepath instead of copy-paste twins.**

Visual reference: `shape-dashboards-prototype.html` (repo root — open it in a
browser). Status of the current pages: see the audit in the PR/session notes
and the summary below.

---

## Where we are (audit summary, 2026-06-12)

| Page | Live today | Still fake/hardcoded even when signed in |
|---|---|---|
| TrainerDashboard | name, client/session KPIs, schedule, calendar | all money (balance/payout/lifetime), recent payouts, the date line, pulse trends |
| NutritionistDashboard | same | same — the page is a copy-paste twin of the trainer page |
| NutritionistClients / TrainerClients | roster + totals (shared `coach-roster.ts`), shared-clients tab | "Invite client" (dead), name-slug profile links |
| ClientDashboard | streak/workout KPIs, upcoming sessions, team | the entire today rail, nutrition widget (localStorage-only fake logging), habits (localStorage), recipe, "week's focus" |

Shared layer: `trainerDashboard.jsx` (the dashboard kit for ALL three roles,
39 pages, **no cache tag**), `pageShell.jsx` (Header/Footer/CalendarOverlay/
tokens), `coachNav.jsx`/`clientNav.jsx` (nav + **static** sidebar money/score
cards), `sharedClientsTab.jsx`. No shared stylesheet — every page repeats the
same inline boilerplate. No build step — babel-standalone in the browser.

## Design principles (carried over from the app)

1. **The app is the source of truth for design.** Editorial broadsheet +
   instrument plates: mono uppercase eyebrows, serif headlines, clipped-corner
   plates with a 3px accent spine + pulsing status tick, squared chips.
   Two-tier rule: plates = live/actionable; quiet rounded cards = forms/lists.
2. **Role accents:** client teal `#1ec0a8/#2ee0c4`, trainer rust `#c0533b`,
   nutritionist gold `#d8a23a`.
3. **Demo mode is a feature.** Signed out, every dashboard renders the demo
   persona under the "Preview · demo data" band — never a sign-in wall, and
   never demo data leaking into a signed-in view.
4. **No fake numbers for signed-in users.** A metric is live, or it reads "—"
   with an honest sub-label. Fake-but-plausible money is the worst failure
   mode we found in the audit.
5. **Push-to-client must reach the website dashboards** the same way it
   reaches the app (plan → today rail / calendar / grocery).

---

## Phase 1 — Foundation & data truth

Goal: one shared dashboard kit + one data layer, all three Today pages on it,
no fake numbers, client today rail driven by the real assigned plan.

1. **`dashKit.jsx` (versioned) + `dash.css`.** ✅ foundation shipped on
   dashboard-v2: all 39 `trainerDashboard.jsx` references carry
   `?v=20260612`, and the per-page inline `<style>` boilerplate is extracted
   into `dash.css` (31 pages). Still to come in this item: the new
   `DashPlate` etc. primitives land with the visual step.
   - New primitives, ported from the app: `DashPlate` (instrument KPI plate —
     clipped corner, accent spine, tick), `DashEyebrow`, `DashChip` (squared,
     spine-left), section ledger rules (ink → accent gradient fade).
2. **`useDashData(role)` — one data hook.**
   - Wraps `/api/trainer/dashboard` · `/api/nutritionist/dashboard` ·
     `/api/client/dashboard` with per-role response mappers (the routes return
     role-specific keys — do NOT merge the routes).
   - Centralizes the mock fallback: one demo dataset per role, used ONLY when
     signed out / wrong role; loading renders skeletons, not demo numbers.
   - Real dates everywhere (kill "WEDNESDAY APR 18").
3. **Honest money.**
   - Sidebar payout/score cards (`coachNav`/`clientNav` statics) become live:
     coach payout card from the dashboard API (or "—" until Stripe rollups
     exist); client score card from `/api/client/score`.
   - Dashboard money KPIs + "Recent payouts": real Stripe-backed numbers via a
     new `/api/{role}/payouts` rollup, or render "—  · connects to Stripe"
     until that lands. Never the fake $2,847.50.
4. **Client today rail = the assigned plan.**
   - Today's workout (+ coach-set session time) and meals from
     `/api/client/plan`; "LOG MEAL" posts to `/api/nutrition/meal-log`;
     nutrition-today widget reads the snapshot the app writes; habits widget
     reads/writes `/api/client/habits` (kill the localStorage fork).
   - Demo rail stays for signed-out.
5. **Demo banner parity.** Signed-out dashboards show the same
   "Preview · demo data — an example of a live account · Sign in →" band the
   profiles got.

**Acceptance:** a signed-in trainer/nutritionist/client sees zero fabricated
numbers anywhere on their Today page; a nutritionist "push to client" shows up
on the client's website dashboard today rail without a deploy; signed-out
still shows the full demo experience; all three Today pages consume
`useDashData` + `DashPlate` (no per-page formatters/mocks).

## Phase 2 — Data layer, signal engine & twin collapse

### 2.1 The unified client record ✅ (shipped on dashboard-v2)
One record shape for every dashboard surface, per client: `profile`,
`trainingAdherence`, `foodLogs`, `shapeScoreHistory` (8 weeks), `weighIns`,
`streaks`, `lastContact` (per pro), `checkIn`, `goalPhase`, `milestones`,
`payments`. Every field nullable — live coverage grows into the contract.
Documented in `public/newdesign/dashSignals.js`.

Live-fillable today: profile/MRR (`/api/{role}/clients`), adherence +
days-logged (`get_client_stats`), check-in status (check-in kit), weigh-ins
(`get_client_goals`). Needs backend extensions (tracked): coach-readable
weekly score history, lastContact thread timestamps, goalPhase in the
overview API, exact last-food-log date.

### 2.2 `useDashboard(role)` ✅ (shipped on dashboard-v2)
`public/newdesign/dashData.jsx`. Single data hook: live roster +
concurrency-capped (4) per-client enrichment via
`/api/clients/{id}/shared-overview` with a 60s cache; `role:'client'`
returns the one self record. Mock fallback (the 8 personas in
`dashSignals.js` — Jordan M., Marcus T., Aisha K., Sam R., Priya S.,
Elena R., Deandre K., Jonah W.) is centralized inside the hook; the UI never
knows which source it got. Follow-up: a batch overview endpoint to kill the
N+1 fetch at larger rosters.

### 2.3 Rule-based signal engine ✅ (shipped on dashboard-v2)
`public/newdesign/dashSignals.js` (pure UMD — browser + Node) +
`tests/dash-signals.test.mjs` (`npm test`, node:test, zero deps). Rules:
streak broken · score drop ≥5 pts wk/wk · no food logs 3+ days · check-in
overdue (1 missed week nags from Thu, ≥2 weeks always) · no pro contact
5+ days. All thresholds in one `THRESHOLDS` constant. Rules with missing
inputs are SKIPPED — sparse live records can never false-flag.
`getTriageFeed(role)` → clients sorted red → amber → green with a
human-readable reason per flag. Severity: red = 2+ flags or check-in missed
≥2 weeks; amber = 1 flag; green = clean.

### 2.4 Twin collapse & rosters
- ✅ **Step 20 — client Nutrition tab (full assigned meal plan)**: migrated
  `ClientNutri.html` (was mock-driven on `/api/client/nutrition` only) into
  `dashNutri.jsx` reading the REAL assigned plan (`/api/client/plan`
  `meals.days` — the step-13 meal-builder payload with per-meal swap groups,
  day targets, ingredients). **Today expanded with swaps visible** reuses the
  shared `DashMealLedgerCard` (swap chips, ledger ticks, red-when-over — the
  Today dashboard ledger now deep-links here via "Full meal plan · week &
  swaps →"). **Week view**: a 7-day strip (plan targets + logged-day overlay)
  you can tap to view any day's meals. **Grocery** auto-builds from the plan's
  ingredients (`dnuBuildGrocery` — real, same data the mobile auto-grocery
  uses) + a link to the full ClientGrocery page. **Logging history is
  STREAK-FRAMED** (logging streak · days-this-week · recent wins + a
  logged-day calorie bar chart — zero bare adherence %, per the client
  framing rule). **Saved recipes**: demo favorites under the band, honest
  empty state live (no web saved-recipe store yet). **Server**:
  `/api/client/nutrition` now returns a real `currentStreak`/`longestStreak`
  from the 30-day snapshot history (no migration). Nav "Nutri" → "Nutrition"
  (sidebar + header; Grocery's active key updated to match). Browser-verified
  (demo plan, 0px overflow 375/1280, zero console errors). Tests 78/78 ·
  render review 107/107.
- ✅ **Step 19 — client Workouts tab (full assigned program)**: migrated
  `ClientTrain.html` (was a stats page reading only `/api/client/train`) into
  `dashTrain.jsx` — the whole program by week. **Tonight's session** leads
  (the Today card's Start → already targets this page). **Weeks**: current
  expanded, past collapsed with per-day ✓ completion marks, upcoming
  **visible but locked** with "🔒 {coach} fine-tunes it after your check-in";
  then an always-present **"{coach} writes this after your check-in"** plate —
  the human loop is the headline sell, not a footnote. **Session history**
  expands to **logged-vs-prescribed** per move (sets done/prescribed + best
  set) with inline **▲ PR** badges; consistency is streaks/wins (no bare
  adherence %). Week grouping prefers the builder `template.week` stamp,
  falls back to ISO calendar weeks; completion marks come from the
  dashboard's completed-workout calendar, PR dates from `/api/client/progress`.
  **Server**: `/api/client/train` `recentSessions` now carry per-move
  `{setsLogged, setsPrescribed, target, best}` from `workout_set_logs`
  (prescription stored alongside actuals — no migration); `/api/client/plan`
  workouts pass the `template` stamp through. Nav "Train" → "Workouts"
  (sidebar + site header; pageShell `?v=20260613b` across 62 pages). Browser-
  verified: 3-week demo renders, 0px overflow at 375/1280, zero console
  errors. Tests 78/78 · render review 100/100.
- ✅ **Step 18 — full QA pass (real-browser)**: `scripts/qa-sweep.mjs` (18
  pages × 375/768/1280 in headless Chromium against `next start`: page
  errors, console, horizontal overflow, screenshots — the container's
  blocked CDNs are served from npm-identical local bytes via
  `scripts/qa-cdn.mjs`) + `scripts/qa-interactions.mjs` (21 e2e checks:
  message deep-links, drawer keyboard access, builder autosave + preview
  parity, queue/Business/score-ring navigation, tap targets). Results:
  78/78 unit · 92/92 render · 18/18 pages error-free* · 21/21 interactions
  (*ClientCommunity's feed 400 is container egress, not product). **Fixed
  during the pass**: (1) `DashShell` main lacked DashPage's `overflowX:
  hidden` → both pro Today pages scrolled sideways at 375px (now 0px);
  (2) REAL lazy-boot bug — `openRichChat`'s script dedup only recognized
  its own injected tags, so re-injecting an already-loaded pageShell threw
  "Identifier 'PAPER' has already been declared" in babel's shared scope
  and broke the bubble boot on every dashboard page (dedup now matches by
  filename; verified: pulse Message → panel opens on the flagged client's
  thread, zero page errors); (3) the Today wrappers never loaded
  dashGoals/dashRoster, silently degrading the step-11
  drawer-from-pulse-rows behavior (restored); (4) the client score ring
  now links to ClientScore.html; (5) ClientTeam's Message buttons route
  through `__openChatTo` (no pre-mount no-op race); (6) the client
  dashboard's bare "→" links got real padded hit areas. Signed-out e2e
  verifies messaging to the composer-lock boundary (members-only by
  design); the draft contract stays harness-pinned.
- ✅ **Step 17 — Message deep-links (audit decision: NO messages page)**:
  Messaging stays the chat bubble — the audit table's Messages-page row is
  closed as won't-build. **Capability (the prerequisite small task)**:
  `window.__openChatTo({ who, draft, tab })` in globalChatButton.js works on
  EVERY page — open-or-boot the bubble deep-linked to a person's thread;
  requests made before the widget mounts stash on `__openChatRequest` and
  are consumed on mount (lazy-boot flush included). `__openChat` descriptors
  gain `draft` (pre-fills the composer for the target tab, never auto-sends,
  never clobbers typed text) + `tab`, and a draft-only mode (no `who`) for
  "message your coach". **Wiring**: `dashMessageClient(name, role, draft)`
  routes pulse rows, the drawer, schedule rows, wins Congratulate, the
  joint-attention banner, the goals empty state, and the meal-builder intake
  nudge through the bubble — the old Messages.html redirect fallback is
  GONE. Reason pills become editable openers via `dashMessageDraft(row)`
  ("Hey Marcus — checking in. I'm seeing …. What's getting in the way this
  week?"), plus `dashCongratsDraft` (milestone) and `dashJointDraft` (the
  coordinated two-coach note). Chat-script edits rode the mandated `?v`
  sweep (chatWidget ×32, globalChatButton ×117). Render review 92/92 ·
  tests 78/78.
- ✅ **Step 16 — Business page (Analytics + Payouts merged, both pro roles)**:
  `TrainerAnalytics.html` / `NutritionistAnalytics.html` MIGRATED in place
  into one role-parameterized **`CoachBusinessPage`** (dashBusiness.jsx) —
  same URLs, retitled Business; coachNav gains a top-level **Business**
  entry and every old "Analytics" label (Clients sub-tab, LiveConsole
  rails, pageShell header nav) now reads Business. Zones: **revenue trend
  90d** (the real subscriber-adds panel + MRR gross/net from live
  subscription rows, labeled as derived), **payouts schedule + history** —
  the REAL Stripe Connect summary the analytics API already returned but
  no page ever rendered (available balance · in-transit/next · last-12
  history with status pills), now with the account's payout cadence
  (`loadStripe` gains `schedule` via accounts.retrieve: "Paid out weekly ·
  Fridays · 2-day rolling delay"), **marketplace funnel** (the benchmark
  panel reused), **churn list** (NEW in both analytics routes: canceled
  subscriptions with tenure + MRR lost; exit reason is honestly null —
  "collects once the cancellation survey ships" — until a survey exists),
  and the migrated **roster-outcomes** section (the old pages' KPI cards +
  mover lists, role-flavored; the big roster table dropped — the v2
  Clients roster owns per-client rows). **HONEST MONEY (hardest here)**:
  live + not-connected renders "—" + "connects when payouts go live" +
  a real Set-up CTA (`/api/stripe/connect/onboard`, providerId now in the
  analytics payload); a live viewer with a failed analytics fetch gets
  honest loading states, never demo numbers; render checks assert ZERO
  invented dollars in both states. **Today's Business card**: the separate
  Growth + Funnel sections on both coach dashboards collapsed into ONE
  `DashBusinessSummary` plate (monthly net · adds 90d + MoM · close rate
  vs benchmark · mini sparkbars) linking "Revenue · payouts · funnel ·
  churn →" to the page; nutritionist keeps Roster health. pageShell label
  change rode a `?v=20260613` sweep (62 pages). Render review 86/86 ·
  tests 78/78 · tsc + build clean. Still open: profile-view tracking
  (funnel top stays "connects soon") and the cancellation survey.
- ✅ **Step 15 — client Progress page (migrated): comparisons first**:
  `ClientProgress.html` MIGRATED in place (same URL, same cookie APIs). The
  LEAD is comparisons, not tables — "8 weeks ago vs today" side-by-side for
  **weight** (dated weigh-in nearest 8 weeks back vs latest, honest "Xw ago"
  label when the history is younger, delta chip), **measurements** (per-site
  then→now from check-in tape entries), and **photos** (then/today pair per
  pose from the progress-photos timeline; the empty state sells taking the
  first set). Below: the **weight chart** (the old 9-series trend switcher
  kept, restyled to plates; only series with data show), **PR history**
  (dated bests as ▲ win rows), and a **milestone timeline** (earned ✓ →
  "Next up" ○ with progress bars — built on `buildMilestones`, so goal
  proximity + pace from step 14 ride in automatically; live record from
  `/api/client/dashboard` incl. its goals block). **FRAMING RULE shipped:
  no bare adherence percentages anywhere on the client side** — the old
  Insights card ("82% workout adherence" grid) is gone, replaced by a
  consistency strip of streaks and wins (current streak · workouts this
  week · PRs this quarter · all-time), and the client DASHBOARD's
  compliance ring was reframed too ("This week · consistency", center =
  the week's win count, no % — render check updated deliberately). The
  **check-in kit survives intact** below the fold as "the weekly ritual —
  two minutes that sharpen everything above" (same POST shapes; submitting
  refetches so the comparisons update); its old measurements/photos cards
  folded into the comparison lead + a photo timeline. New demo dataset is
  DATED so the demo comparison is real math (177→171, −6 lb, exactly 8
  weeks). Render review 75/75 · tests 78/78.
- ✅ **Step 14 — Goals page (migrated, not rebuilt) + pace projections**:
  `ClientGoal.html` MIGRATED in place onto the v2 kit (same URL; keeps its
  supabase wiring — the `user_goals('client_goals')` doc + legacy fallback,
  the share-with-coaches toggle, and log-weigh-in, which now also upserts
  `client_weigh_ins`). The page is one card per goal (≤3): target, current
  value, time-proportional sparkline with a dashed target line, progress %,
  and the **projected completion date at the current pace** as the card's
  hero — plus an honest state machine (achieved ✓ / stalled "No ETA" / 1y+ /
  stale / needs-history) and an amber in-card note when the ETA slipped this
  week. Clients VIEW only (the old self-edit goal UI is gone by design);
  the empty state routes them to their coach. **Engine** (dashSignals.js,
  pure+tested): `projectGoal` (least-squares pace over the last
  GOAL_RECENT_DAYS=56, run forward from the latest point; never projects
  from <2 points or <7d span), `goalSlipDays` (re-projects with last week's
  knowledge; Infinity = ETA lost), the **`goal_slip` rule** (slip ≥
  GOAL_SLIP_DAYS=7 → one amber flag on BOTH pro feeds, worst goal named —
  an always-stalled goal never had an ETA so never flags), `goalsFromDoc`
  (normalizes coach goals + the legacy self doc + every weigh-in shape),
  `goalBrief`, MAX_GOALS=3 cap (a hidden 4th goal can't flag). **Pros set
  goals** in the shared drilldown drawer (both lenses gain a "Goals ·
  projections" section, lazily via dashGoals.jsx): compact cards + editor
  (label/metric/unit/target/start + "current" logs a dated history point),
  + Add disabled at 3 ("3 max — one focus per front"); live writes POST
  **`/api/clients/[id]/goals`** → `client_programs.detail.goals` (existing
  coach-writable RLS, zero migration; merge preserves the Adjust payloads),
  demo saves locally. `shared-overview` returns `coachGoals` +
  `programPhases` (closing the listed goalPhase gap → live roster GOAL
  PHASE column); `/api/client/dashboard` returns the goals block (coach +
  self doc + weigh-ins) so the client record carries goals. **Wired in**:
  the trainer's pre-session context line leads with `goalBrief` ('2.8 lb to
  "Goal weight" · pace Jul 17', slip noted in-line) and the milestone feed
  leads with goal proximity + pace; achieved goals celebrate in `recent`
  (client dashboard + drawer + wins briefing automatically). Personas:
  Jordan = collinear on-pace ×2 + achieved 5k; Marcus = stalled (honest, no
  flag); **Nadia P. (new, #10)** = the slip case (clean −1 lb/wk flattens →
  ETA +15d → amber on goal_slip alone); Tess = none set. Tests 78/78
  (20 new — exact hand-checked ETAs/slips) · render review 67/67 · tsc +
  next build clean.
- ✅ **Step 13 (final) — nutritionist Plans + the meal-plan builder**:
  `NutritionistPlans.html` rebuilt on the v2 stack with two zones —
  **Library** (templates in `coach_plans.detail.mealBuilder`, goal-phase
  tags cut/maintain/build with phase-default targets, Assign/Edit per
  card) and **Plan lifecycle** (expiring this week = the plan queue's
  ready set · ready for phase change = 50%-milestone or ≤3 units from
  goal · intake pending = new/no first check-in; "Write plan" pre-fills
  the assign modal with that client on the matching-phase template).
  **Builder** (`dashMealCore.js` pure+tested / `dashMealBuilder.jsx` UI):
  targets-first panel (kcal+P/C/F seeded per phase), meal slots filled
  from the food/recipe search (LIVE-FILTERED by the plan's constraints —
  allergy/exclusion tags + max prep; protein-floor warning on the bar),
  a running macro bar that goes red when over EXACTLY like the client
  ledger, **first-class day variants** (training/rest/travel as overlay
  override-maps, never copies — editing the base asks "apply to
  variants?" once per meal; declining freezes the approved old meal into
  each variant), **swap groups** (≤3 approved alternates per meal → the
  client card's ⇄ chip cycles them and logs the chosen alternate's
  macros, so swapping never breaks ledger math), **auto-built editable
  grocery** (removals + weekly-total rescales flow through the meals'
  INGREDIENTS at assignment, so every client grocery surface matches),
  week tools (duplicate day with remapped variant keys; one-step phase
  shift e.g. −10% carbs across all days/variants/swaps with kcal
  recomputed 4/4/9), debounced autosave (API ⇄ localStorage) + explicit
  Publish vN. **Assign = scaled snapshot publish**: per-client portion
  scale (×1.2 never edits the template), week start + training-day
  picker (rest days get the rest variant), POSTs
  `/api/nutritionist/meal-plan` per client with SCALED day targets in
  the `{cal,p,c,f}` shape the client ledger reads (verified: the
  dashboard ledger + mobile both measure against assigned-plan targets,
  not defaults), marks the plan queue done. The client meals+ledger
  plate is now the shared **`DashMealLedgerCard`** (swap chips + red
  over-target states) and the builder's client preview renders that
  literal component, playable (log/swap/reset). Tests 57/57 · render
  review 53/53.
- ✅ **Step 12 — trainer Programs + the workout builder**:
  `TrainerPrograms.html` rebuilt on the v2 stack with two zones — **Library**
  (versioned templates in `coach_plans.detail.builder`, goal-tag filters
  cut/strength/hypertrophy/return-to-gym/5k-prep, Assign/Edit/Performance
  per card) and **Performance** (subscribers · completion · per-week
  retention bars + worst-drop-off callout; demo-rich, live shows the honest
  "tracks from your first assignment" state). **Builder**
  (`dashBuilderCore.js` pure+tested / `dashBuilder.jsx` UI): Program →
  Weeks → Days → Blocks tree with day drag/▲▼ reorder, searchable
  76-exercise library, per-row sets×reps · kg/%1RM/RPE · tempo · rest ·
  verbatim cue, superset letter groups (A1/A2), per-exercise progression
  rules that auto-fill duplicated weeks, deload toggle (−40% volume,
  editable), day-level Shape Radio playlist, debounced autosave
  (API ⇄ localStorage drafts), and an always-on **client preview that
  renders the literal `DashWorkoutCard`** the client dashboard uses
  (extracted shared). **Assign = snapshot publish**: multi-client +
  start date via `/api/trainer/workout`, queue ready/blocked badges
  inline, marks the programming queue done; template edits never
  retro-change assigned weeks (tested). The plan API now passes
  tempo/cue/superset/playlist through, so cues land on the client's card
  exactly as typed and the playlist chip shows its real name. Tests
  41/41 · render review 45/45.
- ✅ **Step 11 — trainer roster + the SHARED drilldown drawer**:
  `TrainerClients.html` rebuilt on the v2 stack with training columns
  (Shape Score + wk delta · adherence % · program + week · streak · last
  contact — every cell real or labelled), triage filters with the
  "At-risk" lead, demo band, honest MRR sidebar. `DashRosterTable` is now
  role-configured (`DASH_ROSTER_VIEWS`), and the drawer is ONE shared
  `DashClientDrawer` with role lenses (`DASH_DRAWER_VIEWS`): trainer =
  score history · adherence · coach notes · milestones · read-only
  nutrition summary; nutritionist keeps her consult lens. It opens from
  any roster row AND from the Client Pulse rows on both Today pages
  (Message buttons stopPropagation; keyboard accessible). Record gains
  `program {name, week, weeks}` + `coachNotes` (live null → honest empty
  states). Render review 39/39.
- ✅ **Step 10 — full review + fixes**: `scripts/dash-render-review.mjs`
  (offline; Next's compiled Babel + ReactDOMServer) renders every v2 page
  with pageShell stubbed — 35/35: all pages render error-free, role
  isolation asserted (no leaked role UI either direction), client page
  banned-word checks (no MRR / consults), joint banner + wins + drawer
  render. Fixes shipped from the review: **demo-mode band** on all 4 v2
  pages whenever the data layer falls back (signed out OR API down — demo
  data is now always labelled, never fake-as-real), keyboard access on
  roster + schedule row targets (tabIndex/Enter/Space/aria-expanded),
  the dead "Invite client" button wired (→ public page), responsive
  collapses for the client page (≤1000px one column, ≤760px sidebar
  hides) + roster horizontal-scroll wrapper, and every cross-file dash
  symbol explicitly window-exported (no reliance on babel-standalone
  scope internals). Tags unified at `?v=20260613`.
- ✅ **Milestones + coordinated action** (step 9): the unified record gains
  typed milestone events (`kind: pr|workout_count|streak|goal`) + lifetime
  `totals.workouts`; pure `buildMilestones(record)` derives "what they
  earned" (stored hits ≤30d, crossed streak landmarks) and "what's next"
  (next streak/workout landmark w/ progress, goal-weight distance). Client
  dashboard renders the **Milestones plate** (✓ earned + Next-up progress
  bars — live-derivable from streak/totals/goal); both pro Today pages get
  the **Client wins** briefing ("Jordan M. — 100th workout · 2d ago") with
  one-tap Congratulate. **Joint attention** (`findJointAttention`): a
  client flagged in BOTH domains — training (streak) AND nutrition
  (logs/ledger/protein) — surfaces ONE "Start joint note" banner atop both
  pros' triage panels instead of two separate nudges (Marcus T. is the
  demo case, per spec). Tests 32/32.
- ✅ **Honest money + business panels** (step 8, restructure target e):
  the always-rendered fake "Recent payouts" tables are GONE from both pro
  Today pages. Trainer gains **Growth · 90 days** — a REAL weekly
  subscriber-adds sparkline + MRR-added + MoM% derived server-side from
  `subscriptions.created_at` (new `src/lib/coach-growth.ts`, wired into
  both dashboard routes; explicitly labelled adds, not payouts — payout
  history stays "—" until Stripe payouts land). Both roles gain the
  **Marketplace funnel** (views → consults → signed): consults + signings
  are real 90-day counts; profile views aren't tracked yet → honest
  "connects soon"; ~30% consult→signed benchmark line + a derived
  coaching-insight sentence. Nutritionist gains **Roster health** (avg
  compliance · % logged this week — real from records; renewals due "—"
  until billing dates are exposed) + the recipe-publishing insight card.
  Sidebar cards are honest when signed in: coach Today + roster show real
  monthly net / MRR ("payouts connect soon" sub), the client dashboard
  shows the real Shape Score; demo mode keeps the example cards. All
  charts are inline SVG/divs — no chart dependency.
- ✅ **Client dashboard rebuilt** (step 7, restructure target d):
  `dashClient.jsx` — the prototype's client view on real plumbing, first
  page in the instrument-plate language (`dash.css` plate classes). Today
  rail = `/api/client/plan` (workout w/ coach-set time + meals by dow);
  **meal logging is real** — LOG posts `/api/nutrition/meal-log` and the
  macro ledger (seeded from today's snapshot) ticks live, logged state
  per-day in localStorage. Hero: Shape Score ring (tier progress) +
  weekly delta + ledger-derived sparkline + plain-language "why it moved"
  (top scoring category this week), streak alongside. Tonight's-workout
  plate (exercises/schemes/loads + Shape Radio chip), weekly compliance
  ring (workouts done/planned + days logged /7), team rows w/ unread
  badges + Message, check-in-due banner (gold plate → ClientProgress),
  secondary: grocery link · next session · membership status pill. Real
  date in the masthead. Nothing business-flavored. Demo dataset is the
  centralized fallback; the hook gained client extras
  (plan/nutrition/score/membership, all independent fetches).
- ✅ **Nutritionist roster v2 + quick-consult drawer** (step 6):
  `NutritionistClients.html` is hook-driven (`useDashboard`), rows are the
  triage feed, and **"Needs eyes" = signal-engine severity** (leads the
  filter row with a live count; replaces the stale-sessions heuristic).
  Columns: Last Food Log · 7-day Compliance % · Goal Phase · Last Consult —
  every cell is a real value or a labelled honest empty state ("Not
  shared", "No consults yet"), never a bare dash. Last Consult is real
  live (roster `lastAt` from the sessions table) and the personas carry
  `payments.lastSessionAt`. **Row click opens the quick-consult slide-over**
  (`dashRoster.jsx` — shared so the trainer roster can reuse it): last 3
  days of logs (`recentLogs`, mock-only until per-day logs reach the
  overview API), macros vs targets with over/under coloring, weigh-in
  trend polyline + delta, read-only training context (volume 42d + weekly
  Shape Score), Send note + Full profile →. No navigation on row click.
- ✅ **Nutritionist = a true Today view** (step 5): all four panels flip on
  via role config — nutrition-aware triage (`getTriageFeed('nutritionist')`
  adds role-scoped rules: **ledger blown** avg ≥ target+10% ("Ledger +21%")
  and **protein under** avg ≤ target−15% ("Protein low"); the trainer feed
  is untouched), expandable consult schedule, programming queue, and a
  **derived stat bar** (consults today + next time · plans due + ready ·
  avg roster food-log compliance · real MRR from the roster) computed
  identically for demo and live — no fabricated KPIs. The unified record
  gains `nutrition { avgCalories, targetCalories, avgProtein,
  targetProtein }`; live carries the averages now, targets land with the
  plan-targets API gap. Demo: Deandre goes red on the nutritionist feed
  (logs + ledger), Priya amber (protein) — both unchanged for the trainer.
  Tests 28/28.
- ✅ **Expandable schedule + Programming queue** (step 4, trainer):
  schedule rows expand to a pre-session context line ("2.8 lb from goal
  weight · check-in reviewed" — the unified record gained a `goal`
  field, live-fillable from `get_client_goals.overall.target`) + inline
  Message / Last notes / Start log actions, DONE/NEXT preserved. New
  Programming-queue panel from the pure `buildProgrammingQueue(clients)`
  (exposed as `queue` on the hook): current-week check-in in → ready,
  else blocked ("waiting on this/first check-in"); Template shortcut +
  "Write plan" marks done (localStorage, keyed by week Monday, resets
  next week). `DashShell` gained a `scheduleRender` slot; kit
  `?v=20260612c`. Tests 24/24.
- ✅ **Trainer Client Pulse = the triage feed** (step 3): `TriagePulsePanel`
  in `dashToday.jsx` renders `getTriageFeed('trainer')` regrouped at-risk →
  new → on-track, with severity-colored reason pills (engine flags now carry
  short `label`s — "Score ↓8", "No logs 4d"), streak · weekly pts + delta ·
  last contact metas, and a one-tap Message per row (chat widget → global
  chat → Messages page fallback). Gated by `cfg.triagePulse` (trainer only;
  flip the nutritionist when ready). `DashShell` gained an optional
  `pulseRender` slot; kit tag bumped to `?v=20260612b` everywhere.
- ✅ TrainerDashboard/NutritionistDashboard merged into one role-parameterized
  page (`dashToday.jsx` — `CoachDashboardPage` + `DASH_TODAY_ROLES` config;
  the two HTML files are thin wrappers, URLs unchanged). Data flows through
  `useDashboard(role)`, which now also carries the `today` feed
  (/api/{role}/dashboard, resolved independently of the roster so one
  failing API can't take down the other). Pixel parity verified: all 415
  data/label literals from the old pages survive into the role config; the
  hardcoded "WEDNESDAY APR 18" date is intentionally kept until 1.2.
- Unify TrainerClients/NutritionistClients the same way (server side is
  already shared via `coach-roster.ts`).
- Roster rows link by real user id (`ClientProfile.html?u=<uuid>`), falling
  back to the name slug only for demo rows. Wire "Invite client".
- "Needs your eyes" inbox plate on coach Today = the triage feed's red/amber
  rows (missed check-ins, flagged PAR-Q, stale clients).

## Phase 3 — Instrument pass & app-parity widgets

- Roll the instrument design across the remaining dashboard pages (Progress,
  Train, Nutri, Score, Goal, Habits…) to match the app's shipped passes.
- Port the ticker (`BSTicker` concept) to the dashboard masthead.
- Client: weekly check-in due plate; coach: assign/adjust quick actions.

## Phase 4 — Platform hardening (defer until 1–3 ship)

- Decide on precompiling the newdesign babel bundle (perf) vs staying
  no-build. Not before the kit consolidation, or we freeze the duplication in.

---

## Risks / blast radius (from the audit — re-check before each phase)

- `trainerDashboard.jsx` edits ripple across 39 pages; tag + smoke the big
  consumers (Clients, Programs/Plans, Score, Goal) per change.
- The living-profile pages reuse `DashSidebar` via `LiveProfilePage`'s `shell`
  prop — sidebar changes must keep that path working.
- Flat-file hrefs everywhere: never rename/delete a page without a link sweep.
- Babel global scope: new files need unique top-level names
  (+ `Object.assign(window, …)` by convention).
- Keep `source === 'event'` edit-gating when touching anything calendar.


---

## Still open after steps 1–10 (Phases 1–3)

**Phase 1**
- 1.1 visual: the prototype plate language ships on the CLIENT dashboard;
  trainer/nutritionist Today + roster still wear the soft-card kit look.
- 1.2: coach Today keeps "WEDNESDAY APR 18" (parity choice, step 2) — real
  dates done on the client page only; coach first paint shows demo content
  before the band confirms source.
- 1.3: static payout/score sidebar cards remain on the ~30 NON-hook coach
  pages (Programs/Score/Goal/…); real Stripe payout history API unbuilt
  (growth panel uses real subscriber adds instead).
- 1.4: dashboard meal logging is real, but the full ClientNutri/ClientHabits
  PAGES still run on localStorage forks.
- 1.5: demo band on the 4 v2 pages only.

**Phase 2**
- 2.4: ~~TrainerClients roster~~ ✅ collapsed in step 11; id-based `?u=`
  client links still open (rosters link by name slug).
- Data-layer backend extensions: batch overview endpoint (N+1), coach-
  readable weekly score history, lastContact thread timestamps, goalPhase
  in the overview API, per-day food logs + last-logged date, plan
  macro targets (unlocks ledger/protein rules on live), billing dates
  (renewals due), profile-view tracking (funnel top).

**Phase 3**
- Instrument pass across the remaining dashboard pages; ticker port;
  joint note → the coach↔coach thread (today it opens the client chat);
  congratulate with prefilled message; check-in-due plate on coach Today.

**Phase 4** — untouched by design (build-step decision after 1–3).
