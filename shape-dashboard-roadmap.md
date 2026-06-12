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

1. **`dashKit.jsx` (versioned) + `dash.css`.**
   - Add `?v=` cache tags to `trainerDashboard.jsx` references (39 pages) so
     the kit can evolve safely; new shared pieces go in `dashKit.jsx`.
   - Extract the per-page inline `<style>` boilerplate into one `dash.css`.
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

## Phase 2 — Twin collapse & rosters

- Merge TrainerDashboard/NutritionistDashboard into one role-parameterized
  page body (URLs unchanged — the two HTML files become thin wrappers).
- Unify TrainerClients/NutritionistClients the same way (server side is
  already shared via `coach-roster.ts`).
- Roster rows link by real user id (`ClientProfile.html?u=<uuid>`), falling
  back to the name slug only for demo rows. Wire "Invite client".
- "Needs your eyes" inbox plate on coach Today (missed check-ins, flagged
  PAR-Q, stale clients — sources already exist in the check-in kit).

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
