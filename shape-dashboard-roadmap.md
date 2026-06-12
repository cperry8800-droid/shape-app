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
