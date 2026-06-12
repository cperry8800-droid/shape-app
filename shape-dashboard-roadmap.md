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
