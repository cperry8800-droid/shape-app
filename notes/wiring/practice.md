# Practice pages: is the data on the new coach dashboard real?

Scope: Business (Overview, Money, Plan, Growth, Retention, with each catalog), Goal, Score (trainer and
nutritionist), and the status figures on Settings and Settings › Practice. Read-only audit of
`/home/user/shape-app` at e3ef8a1. Every path below is relative to that repo. Line numbers are from that commit.

**Demo data and live data.** Every figure in the mock-ups is the demo practice (`DashSignals.buildMockClients`,
ten clients, Maya Okafor). The live pages show demo figures only to a signed-out viewer or a non-coach. That rule
is `preview = !live && !extra && source === "demo" && analytics === "preview"` at `public/newdesign/dashBusiness.jsx:1520`.
For the Score page it is a 401 (`trainerScorePage.jsx:45-53`). A signed-in coach with a failed read sees
"couldn't read", never demo numbers. So the question for each widget is whether a real coach's payload can fill it.

## Summary

| Status | Count | Meaning |
|---|---|---|
| **WIRED** | 117 | Exists today with the same meaning. |
| **WIRED·bug** | 4 | Wired, but the live figure is miscounted (the Score total, completion, programs, and Top weight loss). |
| **DERIVABLE** | 63 | The raw data exists. It needs a computation, a field added to a payload, or a small endpoint. |
| **NEW** | 16 | There is no data source. It needs a new field, table, event or feature. |
| **MOCK-ONLY** | 3 | Invented in the mock: "typical ~30%", the "Example ranks" chip, and the nutritionist's "his trainer flagged him for a dietitian". |

Total: 203 elements, counted row by row from the tables below.

| Page | WIRED | WIRED·bug | DERIVABLE | NEW | MOCK-ONLY |
|---|---|---|---|---|---|
| Overview (+ catalog) | 18 | 0 | 11 | 1 | 0 |
| Money (+ catalog) | 20 | 0 | 12 | 2 | 0 |
| Plan (+ catalog) | 16 | 0 | 6 | 0 | 0 |
| Growth (+ catalog) | 14 | 0 | 3 | 3 | 1 |
| Retention (+ catalog) | 22 | 1 | 4 | 3 | 0 |
| Goal (+ catalog) | 8 | 0 | 8 | 6 | 0 |
| Score, trainer + nutritionist (+ catalog) | 13 | 3 | 13 | 0 | 2 |
| Settings status lines | 6 | 0 | 6 | 1 | 0 |

Most DERIVABLE items are client-side arithmetic over payloads the pages already load. The rest need a field added to
a payload, a Stripe read, or one small route.

**What must be built (NEW), in order of how many widgets each unblocks:**

1. **A payment ledger.** This means a table written from `invoice.paid` and `checkout.session.completed`, or a
   Stripe `balance_transactions` read on the coach's account. It unblocks "This month so far", "Lifetime on Shape",
   "This month · net $224" on Settings, and "earned Nov 1–4". Today nothing records what was actually collected.
   - `invoice.paid` only sends a notice (`src/app/api/stripe/webhook/route.ts:1116-1162`).
   - `src/lib/payment-notices.ts` writes no table.
   - The demo's "this month" is net × day-of-month ÷ days-in-month (`dashSignals.js:1800-1802`).
   - The demo's "lifetime" is net × months (`dashSignals.js:1812-1823`).
2. **Store cancellations on `subscriptions`.** Save `cancel_at_period_end` / `cancel_at` / `canceled_at` from
   `customer.subscription.updated`. The webhook writes only `status` and `current_period_end` (`webhook/route.ts:933-934`).
   - A coach can only learn that a client cancelled if their renewal falls in the next 7 days. That check asks
     Stripe live (`src/lib/coach-renewals.mjs:5-11`, `RENEWAL_DAYS = 7`).
   - So "Money at risk", "Leaving", and "Who might leave? › Cancelled" miss anyone whose period ends later.
   - Departure dates are approximated too (`src/lib/coach-trajectory.mjs:23-29`).
3. **Profile-view tracking.** This is a view event on the coach's public profile and marketplace card, counted per
   provider per day, de-duplicated. Without it, the funnel's top bar, "3.2% · The leak" and "97 in 100 leave" have no
   source. `src/lib/coach-growth.ts` header: "Profile views aren't tracked anywhere yet → always null". There is no
   such event in `src/lib/funnel.mjs:17-41`.
4. **A cancellation-reason survey.** `reason` is always null (`src/app/api/trainer/analytics/route.ts:450`). It
   unblocks "Why did people leave?" (the reasons, the quotes, and "No one left over the coaching").
5. **Goal fields and history.** Goals store only `t, cur, tgt, sub, money, pct, metric, id`
   (`trainerGoalPage.jsx:55`, `dashData.jsx:940-968`). They need:
   - a **start value, start date and due date** per goal;
   - **an archive** of past quarters;
   - **a weekly reading of each bound metric**, without which "Off track", "Heading for 83%", "Reaches 16 on Jan 11"
     and the pace chart cannot be computed.
6. **Programs published per quarter.** This needs `published_at` on `coach_program_templates`, which has `status`
   but no publish date (`supabase-migrations/2026-05-08-coach-program-tools.sql:52-67`), plus a Goal binding for it.
7. **Your own score history.** `coach_score_snapshots` holds one total a day, written nightly at 07:15 UTC
   (`vercel.json`, `supabase-migrations/2026-10-15-leaderboards.sql:45-53`). RLS has no read policy, so the coach
   needs a definer RPC or route to read their own series. It unblocks the 30-day sparkline and "Score history".
8. **Trainer → nutritionist referral.** This only matters if the nutritionist Score's "His trainer flagged him for a
   dietitian" is kept. Otherwise drop it.

**Bugs found (file:line):**

- **Confirmed: the Score completion window counts future sessions.**
  - `/api/coach/score` filters only `scheduled_at >= now − 90d`, with no upper bound and any status
    (`src/app/api/coach/score/route.ts:104-116`).
  - The SQL that drives the leaderboard and the nightly snapshots does the same
    (`supabase-migrations/2026-10-18-coach-score-distinct-clients.sql:101,159`).
  - Upcoming, cancelled and declined sessions all sit in the denominator.
  - A session only counts as completed when the coach presses Complete (`src/app/api/sessions/manage/route.ts:715`).
    No job completes past confirmed sessions.
- **Confirmed: "Programs published" counts assigned workouts.**
  - The route counts `client_workouts` rows for `trainer_id`: one workout, one client, one date, archived ones too
    (`score/route.ts:117-122`; SQL `:106,164`).
  - The real thing is `coach_program_templates.status = 'published'`.
  - ⚠ Fixing either bug moves every trainer's score and tier. The owner should decide how to ship it.
- **New: the Growth funnel's "Consults · 90d" counts every session.**
  - `consults90` keeps every calendar row of kind `'SESSION'`, which is every one of the coach's own sessions, any
    type and any status (`src/app/api/trainer/dashboard/route.ts:162,233-240`;
    `src/app/api/nutritionist/dashboard/route.ts:156,224-231`).
  - `sessions.intro` exists (`supabase-migrations/2026-10-15-intro-length.sql:40`) but is unused.
  - The read is also capped at 500 rows, newest first, including future sessions (`trainer/dashboard/route.ts:18,117-121`).
  - Result: "consult → signed" is deflated, and the close-rate advice is wrong.
- **New: Goal › Archive deletes every goal.** It calls `persist({ ...state, goals: [] })` with no confirmation and no
  history (`trainerGoalPage.jsx:276`, `nutritionistGoalPage.jsx:281`).
- **New: analytics keeps only the 12 most active clients.**
  - `clientProgress.roster` is sorted by workouts and cut to 12 (`trainer/analytics/route.ts:502-505`).
  - On a roster over 12, the clients who most need a nudge are the ones dropped.
  - "Top weight loss" and "Nudge Sam R. and Jonah W." can't rely on it.
- **New: the payout history is loaded and then dropped.**
  - `loadStripe` reads the last 12 payouts (`src/lib/stripe.ts:58,63-70`), and the route sends them
    (`trainer/analytics/route.ts:515`).
  - `moneyFrom` keeps only `in_transit` / `pending` (`public/newdesign/coachForecast.js:403`).

**Inconsistencies inside the mock-ups (fix before they become specs):**

- **One goal, two figures.** The Business pages draw a **$3,000** goal; the Goal page's net goal is **$2,400**. The
  Plan's goal is an unsaved slider (`dashBusiness.jsx:1202`, default 1.5 × net at `coachForecast.js:361`).
- **"$2,400 · On track · gets there Dec 25"** can't be true on the mock's own numbers. At 1.6 new clients a month and
  11.2% leaving a month, the Plan mock levels off at **$2,379** and reaches only $2,211 by Nov '27.
- **"monthly · 7-day hold" is the demo's schedule** (`dashBusiness.jsx:72`).
  - Shape creates **Standard** accounts with no payout settings (`src/lib/coach-checkout.ts:582-586`), so each coach's
    real schedule is whatever their Stripe account says. A US Standard account typically pays out daily.
  - Every "7 days", "once a month" and "Nov 30" must come from `schedule` (`stripe.ts:71-79`).
- **Payouts won't equal the monthly net.** The mock shows Oct 31 = $1,682, exactly the net a month. Real payouts are:
  - after Shape's fee;
  - after Stripe's processing, on direct charges (with destination charges, Shape pays the processing:
    `src/app/api/stripe/checkout-session/route.ts:561-571`);
  - after refunds and disputes;
  - possibly mixed with the coach's other business, since it's their own Stripe account (`stripe.ts:92-94`).
- **"$224" means two things.** It is both "in the 7-day hold" (Stripe pending) and "this month · net" on Settings.
  These coincide only in the demo.
- **"typical ~30%" has no source.** It is the constant `DASH_FUNNEL_BENCHMARK = 30` (`dashToday.jsx:987`).

**How data stays fresh, in general:**

- **Page load only.** Nothing polls, and nothing is realtime.
  - The Business page reads `/api/{role}/analytics?renewals=1` once on mount, with `no-store` (`dashBusiness.jsx:1495-1509`).
  - The Plan freezes "now" for the whole visit (`dashBusiness.jsx:1667`).
  - Goal and Today share a 60-second module cache (`dashData.jsx:24-51`).
  - A tab left open stays stale. "Updated 1:20 pm" stamps would be the browser's fetch time; no payload carries a timestamp.
- **Stripe** figures (balance, pending, payouts, schedule, cancel flags) are read live from Stripe on each load. When
  Stripe can't be read they show as unread (`stripe.ts:81-86`).
- **Subscriptions** follow Stripe webhooks: checkout completed, subscription updated or deleted. Prices follow
  coach-side edits on direct charges (`webhook/route.ts:922-969`).
- **Client signals** (streak, logs, check-ins, contact, score) are computed in the browser from `/api/{role}/clients`
  plus the batched `/api/clients/shared-overview`. They only see what each client shares.
- **Score** is computed live on each load. The leaderboard ranks live. History is nightly.
- **Listing readiness:** on load, plus a `shape:listing-changed` event. `stripe_account_status` is set by the
  `account.updated` webhook.

---

## Business › Overview (`business-overview-v2.html`)

| # | Element (as the mock shows it) | Source today (file:line · fields) | Status | Freshness and notes |
|---|---|---|---|---|
| 1 | "Updated 1:20 pm" | No timestamp in any payload | **DERIVABLE** | Stamp it when the fetch resolves. Page load only. |
| 2 | Net a month **$1,682** "after Shape's fee" | `trainer/analytics/route.ts:405-415` trajectory; `coachForecast.js:289-295` `todayFrom` → last week's `mrrNetCents`; net from each row's stored `fee_bps` (`route.ts:175-179`) | **WIRED** | Updates via subscription webhooks; read on page load. It's the recurring rate, not cash collected. |
| 3 | "▲ $168 vs 30 days ago" | `trajectory.weeks[n-5].mrrNetCents` (the summary has only `active30dAgo`: `coach-trajectory.mjs:269-282`) | **DERIVABLE** | Client-side subtraction. History uses each subscription's *current* price. |
| 4 | "From 10 clients. Shape's 15% fee comes only out of the five who found you on Shape" | `byoMix` (`route.ts:481`, `origin-attribution.ts:82-85`) | **WIRED** | Per client, not per plan. |
| 5 | Chart: actual net a month, 12 months back | Trajectory, 104 weekly buckets (`coach-trajectory.mjs:45`); monthly roll `dbzRollMonths` (`dashBusiness.jsx:711-721`) | **WIRED** | Reconstructed from subscription spans at today's prices, not a payment history. Departure weeks are approximate (no `canceled_at`). |
| 6 | Chart: "at today's pace" dashed line to **$2,211** by Nov '27 | `CoachForecast.forecast` + `paceFrom` (`coachForecast.js:83-100,144-167`), already drawn on Plan (`dashBusiness.jsx:1190-1327`) | **WIRED** | Pace is the last ~91 days; a practice under 30 days old has no pace and must say so. |
| 7 | Goal line **$3,000** | Plan goal is an unsaved slider (`dashBusiness.jsx:1202,1277`); Goal page saves `mrrNetMonthly` goals in `user_goals` (`trainerGoalPage.jsx:159-167`) | **DERIVABLE** | Read the Goal page's net goal; one goal for every page. The mock's $3,000 conflicts with Goal's $2,400. |
| 8 | "The $3,000 goal needs about one more client a month" | `forecast` with adds + 1 (the what-if at `dashBusiness.jsx:1220-1224`) | **DERIVABLE** | Client-side. |
| 9 | "Plan it →" | Link to `#business?section=plan` (`dashBusiness.jsx:1587-1592`) | **WIRED** | |
| 10 | Money at risk: **Sam R. · Cancelled · ends Wed, Nov 11** | `renewals[]` with `ending: true` (`route.ts:457-470`; `coach-renewals.mjs:24-56`; `stripe.ts:131-155`) | **DERIVABLE** | Only a cancellation whose period ends **within 7 days** is ever known. Needs NEW item 2 to see the rest. Stripe is asked live on each load (≤25 legacy rows, `RENEWAL_CHECK_CAP`). |
| 11 | "−$180 a month" | renewal row `netCents` / roster `mrrCents − feeCents` (`coach-roster.ts:169-171,225-246`) | **WIRED** | |
| 12 | "Two years with you" | roster `joinedAt` (`coach-roster.ts:172-173,241`) | **WIRED** | A client who left and came back dates from the return. |
| 13 | "Quiet 7 days, no logs 4 days" | `DashSignals` `ruleContactGap` / `ruleFoodGap` (`dashSignals.js:548-647`) through `useDashboard().triage` (`dashData.jsx:619-623`) | **WIRED** | Uses the coach's tuned thresholds; only what the client shares. |
| 14 | "A note before Nov 11 can still keep them" + **Message Sam** | Coach → client direct messages (`/api/messages/direct`) | **WIRED** | Copy is static. |
| 15 | Next payout **Nov 30 · in 26 days** | Stripe gives an arrival date only for a payout already created (`stripe.ts:63-70`; `moneyFrom` `coachForecast.js:401-409`) | **DERIVABLE** | Compute the next date from `schedule.interval / monthlyAnchor / weeklyAnchor / delayDays` (`stripe.ts:71-79`). The mock's "monthly · 7-day hold" is the demo schedule. |
| 16 | Available now **$0** | `balance.available` → `balanceCents` (`stripe.ts:61`) | **WIRED** | Live Stripe read per load. On a Standard account it may include the coach's non-Shape business. |
| 17 | In 7-day hold **$224** | `balance.pending` → `pendingCents` (`stripe.ts:62`) | **WIRED** | Already after Shape's fee, and after Stripe processing on direct charges. "7-day" must come from `delayDays`. |
| 18 | "Why $0: new payments wait 7 days" | `schedule.delayDays` | **DERIVABLE** | Word it from the coach's own schedule. |
| 19 | Clients **10** active | trajectory last week `active` (`todayFrom`) | **WIRED** | Counts a client whose payment is retrying (past_due), as membership does. |
| 20 | "▲ 1 vs 30 days ago" | `trajectory.summary.active30dAgo` (`coach-trajectory.mjs:269`) | **WIRED** | |
| 21 | Ten client gems (one fixed colour each) | names: roster / `byOrigin`; colour map is a design asset | **WIRED** | The colour map is part of the depth/colour build, not data. |
| 22 | "Joined · Tess B. · Oct 30" | roster `joinedAt` (`coach-roster.ts:241`) | **DERIVABLE** | Newest `joinedAt` in the last 30 days. |
| 23 | "Leaving · Sam R. · Nov 11" | as #10 | **DERIVABLE** | Same 7-day blind spot. |
| 24 | "Who stays, and why people leave · Retention →" | link | **WIRED** | |
| C1 | Catalog: Goal progress ($3,000 · how far along) | `user_goals` net goal + `mrrNetCents` (`dashData.jsx:960-968`) | **DERIVABLE** | Bind to the Goal page's goal. |
| C2 | Catalog: Renewing this week | `DbzRenewalsZone` (`dashBusiness.jsx:1345-1377`) | **WIRED** | |
| C3 | Catalog: Lifetime on Shape | nothing; demo multiplies net × months (`dashSignals.js:1812-1823`) | **NEW** | Needs the ledger (NEW item 1) or a Stripe charges read. Summing trajectory MRR would be an estimate and must say so. |
| C4 | Catalog: Joined vs left | `DbzTrajectoryZone` (`dashBusiness.jsx:920-921`) | **WIRED** | |
| C5 | Catalog: Marketplace funnel | see Growth #2–#8 | **DERIVABLE** | Views NEW; consults bug. |
| C6 | Catalog: Who stays | `DbzLifetimeZone` (`dashBusiness.jsx:1400-1417`) | **WIRED** | |

## Business › Money (`business-money-v2.html`)

| # | Element | Source today | Status | Freshness and notes |
|---|---|---|---|---|
| 1 | "From Stripe · 1:20 pm" | fetch time | **DERIVABLE** | |
| 2 | Next payout **Nov 30**, "in 26 days", "to your bank · monthly · 7-day hold" | `schedule` (`stripe.ts:71-79`); `dbzScheduleLine` already words it (`dashBusiness.jsx:171-180`) | **DERIVABLE** | Next date computed from interval and anchor. Manual-payout coaches have no next date: "you trigger payouts in Stripe". |
| 3 | "Pays out everything that has cleared by then" | schedule semantics | **DERIVABLE** | True for automatic schedules only. |
| 4 | Available now **$0** "ready to pay out" | `balanceCents` (`stripe.ts:61`) | **WIRED** | |
| 5 | In 7-day hold **$224** | `pendingCents` (`stripe.ts:62`) | **WIRED** | |
| 6 | "earned Nov 1–4, after Shape's fee" | not read | **DERIVABLE** | Needs `stripe.balanceTransactions.list` (`available_on`, `created`) on the coach's account. Net is also after Stripe processing on direct charges. |
| 7 | "Why $0 today? Stripe holds each payment 7 days, then pays out once a month" | `schedule.delayDays`, `interval` | **DERIVABLE** | Must read the coach's real schedule (often daily). |
| 8 | "November's first payments clear on **Nov 8**" | `balance_transactions.available_on` | **DERIVABLE** | New Stripe read (same as #6). |
| 9 | Track: last payout **Oct 31 ✓** | `stripe.payouts[]` (`stripe.ts:58,63-70`) sent at `route.ts:515` | **WIRED** | Loaded but dropped by `moneyFrom` (`coachForecast.js:403`); show the latest `status: 'paid'`. |
| 10 | Track: renewal pins Jordan Nov 5 · Marcus Nov 7 · Aisha Nov 9 · Sam Nov 11 (ending) | `renewals[].dueAt`, `ending` | **WIRED** | Next 7 days only. |
| 11 | "Clears into your balance, day by day" band, Nov 8 → Nov 30 | `dueAt + delayDays` | **DERIVABLE** | Card payments only. A failed renewal goes past_due, and that isn't shown. |
| 12 | Renewing this week: "3 · **$513** net" | `renewalsSum` (`coachForecast.js:390-396`), header `dbzRenewalsHead` (`dashBusiness.jsx:1370-1377`) | **WIRED** | Only Stripe-confirmed renewals count; unchecked rows are said. |
| 13 | "Shape's 15% fee applies only to clients who found you on Shape" | `platform-fee.mjs` (15% / BYO 0%), stored `fee_bps` | **WIRED** | |
| 14 | Row: day + client + gem | `renewals[].dueAt`, `name` (`coach-renewals.mjs:38-56`) | **WIRED** | |
| 15 | "Brought by you · no fee" / "Found you on Shape · 15% fee" per row | `renewalRows` sends `priceCents` + `netCents`, not `feeBps` | **DERIVABLE** | Add `feeBps` to `renewalRows`, or compute price − net. |
| 16 | **$153** with "$180 − $27" | `priceCents`, `netCents` | **WIRED** | |
| 17 | Sam R. **Ending** · "Cancelled · won't renew" + Message | `ending: true` | **WIRED** | Within the 7-day window only. |
| 18 | "The three renewals clear by **Nov 16**, in time for the Nov 30 payout" | `dueAt + delayDays` vs next payout | **DERIVABLE** | |
| 19 | Payouts: Next · Nov 30 · "what clears" | as #2 | **DERIVABLE** | |
| 20 | Payouts: Oct 31 $1,682 ✓ · Sep 30 $1,393 · Aug 31 $1,240 · Jul 31 $1,240 | `stripe.payouts[]` (last 12) | **WIRED** | Data is there but not rendered. ⚠ 12 payouts covers only ~12 days on a daily schedule: "last 4 months" needs paging `payouts.list` (or `created[gte]`) and grouping by month. Amounts will not equal the net a month (processing, refunds, other business). |
| 21 | "Each is a month's cleared payments, after Shape's fee" | — | **DERIVABLE** | Copy must also say "and Stripe's processing" on direct charges, and follow the real schedule. |
| 22 | ↓ Export CSV | `DashExport.revenueCsv` exists (`dashBusiness.jsx:1634-1636`); no payouts builder | **DERIVABLE** | Small builder from the same payload. |
| 23 | Shape's fee **$138** a month | `mrrGrossCents − mrrNetCents` (`todayFrom`) | **WIRED** | |
| 24 | "from 5 of your 10 clients" | `byOrigin` rows with `feeBps > 0` / `byoMix` | **WIRED** | |
| 25 | Split bar of **$1,820** billed: $900 brought · $782 found (net) · $138 fee | `byOrigin[].priceCents`, `feeBps` (`origin-attribution.ts:194-201`) | **WIRED** | Per client; plans folded. |
| 26 | Client gems per group | `byOrigin[].name` | **WIRED** | |
| 27 | "Clients from your link: no fee" + **Copy invite link** | `create_coach_referral_link` RPC (`dashBusiness.jsx:373-378`) | **WIRED** | |
| 28 | Stripe **✓ Connected** | `stripe.connected` / `stripe_account_status` (set by `account.updated`, `webhook/route.ts:971-1011`) | **WIRED** | Must also show pending / restricted / disconnected / "couldn't reach Stripe". |
| 29 | "Your payments run through your own Stripe account. It holds: charges and receipts · payout statements · bank and schedule" | Standard accounts (`coach-checkout.ts:582-586`) | **WIRED** | Static copy, true for direct charges. For legacy destination charges the receipts live on Shape's account. |
| 30 | **Open Stripe dashboard ↗** | `DBZ_STRIPE_DASHBOARD` (`dashBusiness.jsx:186`) | **WIRED** | |
| C1 | Catalog: Net a month · 13 weeks | `DbzNetWeeksZone` (`dashBusiness.jsx:1380-1397`) | **WIRED** | |
| C2 | Catalog: This month so far | nothing; demo prorates (`dashSignals.js:1800-1802`) | **NEW** | Ledger (NEW item 1). |
| C3 | Catalog: Lifetime on Shape | nothing | **NEW** | Ledger. |
| C4 | Catalog: Card processing (estimate) | `CoachForecast.processingCents` (`coachForecast.js:33-59`) | **WIRED** | Labelled estimate. Only true when direct charges are on (`directChargesReady`, `coach-checkout.ts:37-39`). |

## Business › Plan (`business-plan-v2.html`)

| # | Element | Source today | Status | Freshness and notes |
|---|---|---|---|---|
| 1 | "From your last 3 months" | `paceFrom` window, `dbzPaceWhen` (`dashBusiness.jsx:982`) | **WIRED** | Says "after your first week" for a young practice. |
| 2 | Net a month by Nov '27 · today's pace **$2,211** | `forecast().rows[12].netCents` | **WIRED** | Frozen per visit (`planNow`). |
| 3 | "▲ $529 vs today" | rows[12] − `mrrNetCents` | **DERIVABLE** | Client-side. |
| 4 | "from $1,682 today · 13 clients by then" | `rows[12].clients` (table column at `dashBusiness.jsx:1312`) | **WIRED** | |
| 5 | Projection chart, 12 months | `DbzPathsChart` (`dashBusiness.jsx:1146-1182`) | **WIRED** | |
| 6 | Goal line "$3,000 a month" | unsaved slider | **DERIVABLE** | Read the saved Goal-page goal. |
| 7 | "Goal by <month>" marker | `monthsTo` (`coachForecast.js:111-116`) | **WIRED** | Month granularity. |
| 8 | Lever: New clients a month **1.6** · "yours: 1.6 · last 3 months" | `paceFrom().adds` | **WIRED** | |
| 9 | Lever: Clients leaving a month **11.2%** | `paceFrom().churn`, `churnPct` (`coachForecast.js:281`) | **WIRED** | Departure weeks approximate (no `canceled_at`). |
| 10 | Lever: Price for new clients **$180** · "today's clients keep their price" | listing `monthly` (`/api/coach/listing`), fallback average/default with its source said (`dashBusiness.jsx:1016-1026`) | **WIRED** | |
| 11 | Tick at "yours" on each slider | `planStart` (`coachForecast.js:355-363`) | **WIRED** | |
| 12 | ↺ Back to my numbers | `reset` (`dashBusiness.jsx:1204`) | **WIRED** | |
| 13 | "A projection… after Shape's fee on clients who find you here" | `byoShare` | **WIRED** | |
| 14 | Which lever moves it most? ranked: +$1,129 one more client · +$476 3 fewer in 100 leaving · +$251 new clients pay $205 | the three what-ifs exist (`dashBusiness.jsx:1218-1224`); no ranking | **DERIVABLE** | Run `forecast` three times and sort. No new data. |
| 15 | "Get more clients →" | link | **WIRED** | |
| 16 | Where does it level off? **$2,379** · about 14 clients | `forecast().steadyClients / steadyNetCents` (`coachForecast.js:96-99`), already in the note (`dashBusiness.jsx:1322`) | **WIRED** | |
| 17 | Scale: "$1,682 today" vs "Goal $3,000", "**$621 short**", **Below goal** chip / "Clears goal" | needs the saved goal | **DERIVABLE** | |
| 18 | Edit goal → | link to Goal | **DERIVABLE** | Once the goal is shared. |
| C1 | Catalog: What clients earn you | `DbzEarnZone` (`dashBusiness.jsx:1045-1085`) | **WIRED** | |
| C2 | Catalog: Card processing estimate | `processingCents` | **WIRED** | |
| C3 | Catalog: Month by month (12 or 36 months) | `forecast().rows` (to 36); today's table is 3 rows | **DERIVABLE** | |
| C4 | Catalog: Earned over the year | `earnedOver` (`coachForecast.js:103-107`) | **WIRED** | |

## Business › Growth (`business-growth-v2.html`)

| # | Element | Source today | Status | Freshness and notes |
|---|---|---|---|---|
| 1 | "Last 90 days · updated 1:20 pm" | `/api/{role}/dashboard` funnel, 90-day window | **WIRED** | Page load. |
| 2 | Profile views **1,240** | `funnel.views` is always `null` (`coach-growth.ts:42,103`; `trainer/dashboard/route.ts:248`) | **NEW** | NEW item 3. |
| 3 | "**3.2%** book a consult · The leak" | needs views | **NEW** | |
| 4 | Consults booked **40** | `consults90` = every own session in 90 days, any type or status (`trainer/dashboard/route.ts:162,233-240`; nutritionist `:156,224-231`), from a 500-row read (`:18,117-121`) | **DERIVABLE** | **Bug.** Count `sessions.intro = true`, excluding cancelled/declined (`2026-10-15-intro-length.sql:40`), with its own count query rather than the capped calendar. |
| 5 | Signed **14** | `signed90`: new clients in 90 days whose stored fee > 0 (`coach-growth.ts:96-104`) | **WIRED** | A client can sign without an intro; the rate is null when signings > consults (`dashToday.jsx:991-1004`). |
| 6 | "**35%** sign up · Good" | `dashCloseRate` (`dashToday.jsx:995-997`) | **DERIVABLE** | Right formula, wrong denominator until #4 is fixed. |
| 7 | "typical ~30%" | `DASH_FUNNEL_BENCHMARK = 30` (`dashToday.jsx:987`), no source | **MOCK-ONLY** | Drop, or source and label the benchmark. |
| 8 | "97 in 100 people who open your profile leave without booking one" | needs views | **NEW** | |
| 9 | How do I get more consults? profile link + **Copy profile link** | `create_coach_referral_link` (`dashBusiness.jsx:365-383`) | **WIRED** | The link is the member profile with `ref` and `role`. |
| 10 | "Anyone who joins through it within 30 days counts as brought by you, with no Shape fee" | `coach_referrals.expires_at = now() + 30 days` (`2026-07-21-coach-byo-commission-split.sql:151`); BYO 0% (`platform-fee.mjs`) | **WIRED** | |
| 11 | Where did my clients come from? "10 clients · $1,820 billed a month" | `byOrigin`, `mrrGrossCents` | **WIRED** | |
| 12 | Split $900 / $782 / $138 + named gems | `byOrigin` | **WIRED** | |
| 13 | "Shape takes 15%… **$27 a month** on a $180 plan" | fee rate × listing price | **WIRED** | |
| 14 | Waiting list **3** members | `/api/coach/capacity` `waiting` (`dashBusiness.jsx:1547-1560`) | **WIRED** | Page load. |
| 15 | "?" ghost avatars | count only | **WIRED** | Names not exposed; fine. |
| 16 | "about **$459 a month** to you… 15% goes to Shape" | `DbzWaitlistZone` at the listing price, all Shape-found (`dashBusiness.jsx:1426-1440`) | **WIRED** | No figure without a listing price, and it says why. |
| 17 | **Reopen my listing** | `POST /api/coach/capacity { atCapacity: false }`, which tells the waiting list (`src/app/api/coach/capacity/route.ts` header) | **WIRED** | Show only while at capacity. |
| C1 | Catalog: Clients by source | `DbzOriginZone` (`dashBusiness.jsx:426-485`) | **WIRED** | |
| C2 | Catalog: One-time purchases | `byOrigin` purchase rows (latest 20) | **WIRED** | |
| C3 | Catalog: Email your link | `emailIt` (`dashBusiness.jsx:390-394`) | **WIRED** | |
| C4 | Catalog: New clients a month, 6 months, brought vs found | `growth.weeklyAdds` covers 13 weeks with no origin split (`coach-growth.ts:84-96`); trajectory `added` has 104 weeks, no split | **DERIVABLE** | Add an origin split to the trajectory buckets. |

## Business › Retention (`business-retention-v2.html`)

| # | Element | Source today | Status | Freshness and notes |
|---|---|---|---|---|
| 1 | "Signals as of 1:20 pm" | triage computed in the browser at load | **WIRED** | |
| 2 | Who might leave? "4 clients · **$666** a month at stake" | triage feed + renewals `ending` + roster net per client | **DERIVABLE** | No "at risk" rule joins signals and money today. Pick a rule (red/amber + cancelled) and sum `mrrCents − feeCents`. |
| 3 | Sam R. "2 years with you · brought by you · Needs you" | `joinedAt`, `origin` (`coach-roster.ts:172-192,241-247`) | **WIRED** | |
| 4 | Sam R. "**Cancelled: the plan ends Wed, Nov 11**" | renewals `ending` | **DERIVABLE** | 7-day window only (NEW item 2). |
| 5 | "Quiet 7 days, no logs in 4" | `ruleContactGap`, `ruleFoodGap` | **WIRED** | |
| 6 | −$180/mo + **Message Sam** | roster net; direct messages | **WIRED** | |
| 7 | Marcus T. "Streak broken, no logs in 3 days, score down 8" | `ruleStreakBroken`, `ruleFoodGap`, `ruleScoreDrop` (`dashSignals.js:493-566`) | **WIRED** | |
| 8 | Jonah W. "Check-in 3 weeks late, in the first month" | `ruleCheckinOverdue` (`dashSignals.js:591-610`) + `joinedAt` | **WIRED** | |
| 9 | Aisha K. "Quiet 6 days, no check-in this week" | `contact_gap`, check-in state | **WIRED** | |
| 10 | Needs you / Watch chips | triage severity red / amber | **WIRED** | |
| 11 | $153/mo · $180/mo per row | roster `mrrCents`, `feeCents` | **WIRED** | |
| 12 | "From the signals on Today… All clients →" | | **WIRED** | |
| 13 | Why did people leave? "**3** left · **−$560** a month · last 90 days" | `CoachForecast.departures` count and `lostCents` (`coachForecast.js:213-258`); churn rows (`route.ts:135-142,440-452`) | **WIRED** | The window is the pace's (~3 months), not exactly 90 days. The list is capped at 12 rows, so the count can be a floor. |
| 14 | Reasons bar "Life changed · 2 / Hit their goal · 1" | `reason: null` always (`route.ts:450`) | **NEW** | Cancellation survey (NEW item 4). |
| 15 | Quotes "Budget. Coming back in the fall." etc. | demo only (`dashBusiness.jsx:82-86`) | **NEW** | Survey. |
| 16 | Devon S. "7 mo · Oct 26" (name, tenure, date) | churn rows `name`, `startedAt`, `endedAt` | **WIRED** | `endedAt` approximated without `canceled_at`. |
| 17 | "No one left over the coaching. Devon said 'the fall'." | from reasons | **NEW** | |
| 18 | **Check in** (message a former client) | the coach-access policy scopes to open plans (`route.ts:148-151` note) | **DERIVABLE** | Not verified that a coach may open a thread with a former client. Check before shipping the button. |
| 19 | Tenure line of today's 10 clients | roster `joinedAt` per client | **WIRED** | |
| 20 | "Average stay ~9 mo" marker | `lifetime().months` = 1 ÷ churn (`coachForecast.js:261-266`) | **WIRED** | Modelled, not observed. Label it "expected". |
| 21 | "**4 of 10** have been with you 3 months or less… Six have stayed more than a year" | `joinedAt` | **DERIVABLE** | |
| 22 | What's a client worth? "**~9** months" | `lifetime` | **WIRED** | |
| 23 | "each month ≈ **$168** net" | `mrrNetCents / clients` (`dashBusiness.jsx:1404`) | **WIRED** | |
| 24 | "**11.2%** leave a month" | `paceFrom().churn` | **WIRED** | |
| 25 | "**$1,498** net from each client" | `lifetime().valueCents` | **WIRED** | |
| 26 | "Try it in Plan →" | link | **WIRED** | |
| C1 | Catalog: Roster outcomes (workouts, adherence, PRs, 30d) | `clientProgress` (`route.ts:492-506`) | **WIRED** | Trainer "adherence" is workouts ÷ a fixed 4 a week (`route.ts:332-334`), not planned sessions. That is why it disagrees with Today's 69% compliance. |
| C2 | Catalog: Top weight loss | `roster[].weightChangeLb` | **WIRED·bug** | Drawn only from the 12 most active clients (`route.ts:502-505`). |
| C3 | Catalog: Most consistent | `roster[].workouts30d` | **WIRED** | |
| C4 | Catalog: Every departure | churn rows (≤12) | **WIRED** | |

## Goal (`goal-v2.html`)

| # | Element | Source today | Status | Freshness and notes |
|---|---|---|---|---|
| 1 | "Q4 · **57** days left" | `goalQuarterLabel` (`trainerDashboard.jsx:334-337`) | **DERIVABLE** | Add a days-to-quarter-end count. |
| 2 | "All four goals are due Dec 31" | goals have no due date (`trainerGoalPage.jsx:55`) | **NEW** | NEW item 5. |
| 3 | "Two need you; two are on track" | needs pace status per goal | **NEW** | Start value, start date, due date, metric history. |
| 4 | **Archive** | `persist({ ...state, goals: [] })` (`trainerGoalPage.jsx:276`, `nutritionistGoalPage.jsx:281`) | **NEW** | **Bug:** today it deletes every goal, unconfirmed. Needs an archive store. |
| 5 | **＋ New goal** | `GoalEditModal`, saved to `user_goals` (`shapeBackend.js:4913-4918`) | **WIRED** | Unconditional upsert, so the last write wins across tabs and devices. `saveUserGoalsIfRev` exists but isn't used here. |
| 6 | Hero title "90% average session adherence" | binding `adherencePct` (`dashData.jsx:946-966`) | **WIRED** | Trainer: completed workouts in 30 days ÷ 16 per client (`trainer/analytics/route.ts:332-334,360`), a whole number. Nutritionist: share of logged days with ≥120 g protein, fixed (`nutritionist/analytics/route.ts:196,252,273`). The goal title should say what it measures. |
| 7 | Ring **86.5%** now · goal 90% | live `adherencePct`, typed `tgt` | **WIRED** | Integers only (86.5 can't occur). |
| 8 | **Off track** chip · "Heading for **83%** on Dec 31, not 90%" | no history of the metric anywhere | **NEW** | Weekly readings of each bound metric, plus a due date. For trainers, adherence could be recomputed per week from `workout_sessions`. |
| 9 | Pace chart since Oct 1 (line so far, trend, shaded gap, TODAY) | same | **NEW** | |
| 10 | **Nudge Sam R. and Jonah W. →** | per-client `workouts30d` (`route.ts:338-346`) | **DERIVABLE** | Lowest contributors. The payload drops all but the 12 most active (`route.ts:502-505`), so use the roster/overviews instead. |
| 11 | Collapse ↙ / Expand ↗ per goal | UI | **WIRED** | Presentation only; the chart inside is NEW. |
| 12 | "16 active clients": ring **10 of 16** | binding `activeClients` | **WIRED** | |
| 13 | **Behind** · "Reaches 16 on **Jan 11**, 11 days late" | `forecast().rows[].clients` from pace | **DERIVABLE** | Plus the NEW due date. Day precision needs interpolation between months. |
| 14 | **Invite 3 clients →** | referral link | **WIRED** | |
| 15 | "$2,400 net a month": ring **$1,682 of $2,400** | binding `mrrNetMonthly` | **WIRED** | |
| 16 | **On track** · "Gets there **Dec 25**, 6 days early" | `monthsTo` | **DERIVABLE** | Plus due date. ⚠ False on the mock's own pace: it levels off at $2,379. |
| 17 | **Try $200 for new clients →** | Plan what-if | **DERIVABLE** | |
| 18 | "Publish 2 new programs": ring **1 of 2** | typed only; `coach_program_templates.status` has no `published_at` | **NEW** | NEW item 6. |
| 19 | "Half done with **8 weeks** to go" | typed values + quarter end | **DERIVABLE** | |
| 20 | **Publish Foundations →** | drafts in `coach_program_templates` (`status = 'draft'`) | **DERIVABLE** | |
| C1 | Catalog: Momentum "This quarter against last" | `coachLiveMomentum` is this month / 30 days (`dashData.jsx:973-1004`) | **DERIVABLE** | Re-bucket the trajectory by quarter. Typed momentum rows still override it. |
| C2 | Catalog: What clients earn you | `DbzGoalEarn` (`dashBusiness.jsx:1107-1123`) | **WIRED** | |

**Nutritionist Goal:**
- The adherence binding is protein adherence. It uses a fixed 120 g bar, not each client's target.
- "Publish N plans" uses the same `coach_program_templates` table, so it has the same `published_at` gap.
- Archive has the same bug.

## Score (`score-v2.html`; nutritionist `score-nutri-v2.html`)

| # | Element | Source today | Status | Freshness and notes |
|---|---|---|---|---|
| 1 | "Counted live · 1:20 pm" | `/api/coach/score` computes on every load | **WIRED** | |
| 2 | **1,760** · Pro chip | `total`, `current_tier` (`score/route.ts:157-171`) | **WIRED·bug** | Inherits the completion and programs bugs. |
| 3 | "▲ **150** in the last 30 days" | `shape_coach_board` `view=climb` returns `gained` for the caller (`leaderboard.mjs:152`); the page reads `view=standing` only (`leaderboards.jsx:496`) | **DERIVABLE** | Nightly snapshots (07:15 UTC). |
| 4 | 30-day trend sparkline | `coach_score_snapshots` (one total per day, kept 400 days), no read policy | **DERIVABLE** | Needs a definer RPC/route for the caller's own series (NEW item 7). |
| 5 | "+50 Jonah W." / "+50 Tess B." markers | snapshots store totals only; roster `joinedAt` | **DERIVABLE** | Inferred by laying join dates on the line, not stored per term. |
| 6 | Ladder Certified 0–750 · Pro 750–2,000 · Elite 2,000–5,000 · Master 5,000–15,000 · Icon 15,000+ | `TIERS` (`score/route.ts:25-31`) | **WIRED** | |
| 7 | YOU · 1,760 marker, "**240** to go" | `points_to_next` | **WIRED** | |
| 8 | Fastest way: "+160 · 2 × 80 · Publish Foundations + Onboarding · Sam R. and Tess B. already follow them" | drafts + `coach_program_assignments` (`2026-05-08-coach-program-tools.sql:141-151`) | **DERIVABLE** | ⚠ Only true after the programs fix. Today, publishing a template adds nothing; assigning workouts adds 80 each. |
| 9 | "+80 · Publish Hypertrophy Reset · Marcus T. is in week 2 of 8" | same | **DERIVABLE** | |
| 10 | "+50 · Sign Sam O. after today's intake · 2:00 pm" | today's `sessions` with `intro = true` for someone without an open plan | **DERIVABLE** | |
| 11 | "All three · 1,760 → 2,050 · Elite" | sum | **DERIVABLE** | |
| 12 | Where 1,760 comes from: Active clients **10 × 50 = 500** | distinct clients with an open plan (`score/route.ts:92-103,136`) | **WIRED** | |
| 13 | Session completion **86% × 10 · last 90 days = 860** | `score/route.ts:104-116,138-140`; SQL `:101,159` | **WIRED·bug** | **Confirmed:** future, cancelled and declined sessions are in the denominator. Completion only counts coach-pressed Complete. |
| 14 | Programs published **5 × 80 = 400** | `client_workouts` count (`score/route.ts:117-122`; SQL `:106,164`) | **WIRED·bug** | **Confirmed:** counts assigned workouts (archived too), not published programs. |
| 15 | Stacked bar adds up to the score | breakdown points | **WIRED** | |
| 16 | "Completion stops at 1,000" | `ptsCompletion` (`score/route.ts:147`) | **WIRED** | |
| 17 | Leaderboard **#21 of 212** trainers | `standing.me.rank`, `total` (`leaderboards.jsx:485-501`) | **WIRED** | Live per load. A coach whose listing isn't live gets a rank with `listed: false`. |
| 18 | "▲ 2 places this week" | `moved` vs the reading a week ago (`leaderboard.mjs:151`) | **WIRED** | Null until a week of snapshots exists. |
| 19 | "#20 is **31 points** ahead. One new client (+50) passes them." | `trimCoachBoard` returns the coach either side (`leaderboard.mjs:163-172`) | **DERIVABLE** | Points difference plus the 50-a-client rule. |
| 20 | "Example ranks" chip | ranks are real | **MOCK-ONLY** | Drop once wired; keep only for the signed-out sample. |
| 21 | Your score / Leaderboard switch | `CoachLeaderboard` | **WIRED** | |
| C1 | Catalog: How points are counted | `COACH_FORMULA` (`trainerScorePage.jsx:15-19`) | **WIRED** | |
| C2 | Catalog: Leaderboard neighbours | `trimCoachBoard` | **WIRED** | |
| C3 | Catalog: Score history (90 nightly readings) | snapshots | **DERIVABLE** | Same own-series read as #4. |

**Removed in the mock, correctly:** "What Master unlocks" (`trainerScorePage.jsx:110-121`) and the standing line
"drives marketplace ranking, verified badge, and payout tier" (`leaderboards.jsx:486`). Nothing grants these perks;
it is an open owner decision.

**Nutritionist variant (score-nutri-v2):**

| # | Element | Source today | Status | Notes |
|---|---|---|---|---|
| N1 | **1,510** = 12 × 50 + 91 × 10, two terms, "Two terms for nutritionists" | `score/route.ts:117-122,153-155` | **WIRED** | Completion counts consults, with the same window bug. |
| N2 | "▲ 70 in the last 30 days" | as #3 | **DERIVABLE** | |
| N3 | "+50 · Sign Deandre K. after an intro · His trainer flagged him for a dietitian" | "→ dietitian" routing only reaches a nutritionist already on the client (`dashSignals.js:945-980`); there is no trainer → nutritionist referral | **MOCK-ONLY** | Drop, or keep as a proposed referral feature (NEW item 8). |
| N4 | "+50 each · Every new client · On clients alone, 10 more reach Elite" | formula | **DERIVABLE** | 490 ÷ 50 rounded up. |
| N5 | "+90 at most · Lift completion from 91% to 100%" | formula | **DERIVABLE** | Subject to the window bug. |
| N6 | "Completion at 100%, plus 8 new clients · 1,510 → 2,000 · Elite" | sum | **DERIVABLE** | |
| N7 | #14 of 96 nutritionists · ▲1 · "#13 is 22 points ahead" | as #17–19 | **WIRED** | "#13 is 22 ahead" is derivable as in #19. |

## Settings and Settings › Practice (status lines and figures only)

| # | Element | Source today | Status | Freshness and notes |
|---|---|---|---|---|
| 1 | Rail: Practice "1 flag tuned · taking clients" | `coach_settings` tuned count (`coachSettings.jsx:268`); `/api/coach/capacity` `atCapacity` | **WIRED** | |
| 2 | Payouts panel: "Stripe ✓ Connected" | `stripe_account_status` (`account.updated` webhook); listing route reads it (`coach/listing/route.ts:41`) | **WIRED** | |
| 3 | "Next payout **Nov 30** · In 26 days" + Nov 1 → Nov 30 track | `schedule` | **DERIVABLE** | Settings reads no Stripe data today. It needs a slim payouts summary route; the full analytics route is heavy. |
| 4 | "Balance · settled, 7-day hold **$0**" | `balanceCents`; hold length from `delayDays` | **DERIVABLE** | Same route need. |
| 5 | "This month · net of Shape's fee **$224**" | nothing; demo prorates | **NEW** | Ledger (NEW item 1). Not the same quantity as the pending $224. |
| 6 | Open Stripe dashboard ↗ | link | **WIRED** | |
| 7 | "Listed · ✓ rate ✓ photo ✓ payouts" | `/api/coach/listing` `ready`, `missing[price, payouts, photo]`, `suspended` (`coach/listing/route.ts:41-62`; card `dashProfileExtras.jsx:127-300`) | **WIRED** | Page load + `shape:listing-changed`. Must show "Suspended" first (`dashProfileExtras.jsx:269-297`). |
| 8 | Flags header "1 tuned", house values (Food-log gap 3, Contact gap 5…) | `DEFAULT_THRESHOLDS` (`dashSignals.js:60-85,108-124`), `coach_settings` | **WIRED** | |
| 9 | Each flag's "who it catches today" (Logging 2: Sam R., Deandre K. · Contact 1 · Check-in grace 1 · missed 1 · Score drop 2 · Goal slip 1 · Sleep none · Calories over 1 routed, Deandre +21% · Protein under 1 routed, Priya) | `DashSignals` rules + `evaluateClient` (`dashSignals.js:832`); Settings deliberately skips the roster read (`coachSettings.jsx:173-181`) | **DERIVABLE** | Needs the roster + overviews (reuse the 60s cache when Today was opened). Re-run per rule. |
| 10 | "No one is this far under right now" (sleep) | same | **DERIVABLE** | |
| 11 | Save bar "Contact gap 5 → 7 days · **1 fewer flag today**" | re-evaluate with the candidate threshold | **DERIVABLE** | |
| 12 | Booking rules: "This week · **5.5 of 29** open hours booked" | Today computes `capacity.booked / available` (`dashToday.jsx:1726`) | **DERIVABLE** | Reuse on Settings. |
| 13 | New clients "Open · You're taking new clients", intros while full, reopen date | `/api/coach/capacity` `atCapacity`, `introsAtCapacity`, `resumeOn` | **WIRED** | Reopen notifies the waiting list; the hourly cron `capacity-reopen` handles dates. |

---

## Less data, more direction

The owner: "I dont want coaches being overwhelmed with data." These raw figures could become one recommendation or
alert. Most need no new data. An item marked (needs NEW) can't happen until its NEW item ships.

**Overview**
- **Net a month + "▲ $168"** → one sentence that names the cause: "Up $168 since Tess B. joined". Use `joinedAt` and
  the trajectory's added/ended for the last 30 days.
- **Next payout, Available, In hold** → show only when something is off. Otherwise one line, "Paid out daily · next
  arrives Thu". Alerts worth adding:
  - the Stripe account went restricted (`account.updated` → status not `active`);
  - a payout failed. The webhook doesn't handle `payout.failed` today, so that alert is NEW but small.
- **Where it's heading chart** → keep the sentence ("$2,211 by next November; the goal needs one more client a
  month"). The chart can sit behind Expand.

**Money**
- **Renewals list** → show only the exceptions:
  - "Sam cancelled: ends Wed. Message."
  - "Marcus's card is failing." `past_due` is already stored and counted as active (`coach-trajectory.mjs:11-15`), so
    a "payment retrying" alert is a cheap, useful addition.
  - Confirmed renewals can collapse to "3 renew this week · $513".
- **Payouts history** → keep it in the catalog. Coaches check payouts in Stripe; the widget's job is "did it arrive?"
- **Shape's fee split bar** → turn it into a nudge: "5 clients found you on Shape and cost $138 a month. Bring your
  next one by link and keep the $27." Merge it with Growth's link card rather than showing it twice.
- **Card processing estimate** → a footnote under the net, not a widget.

**Plan**
- **Three sliders + chart + ceiling** → lead with the "Which lever" ranking. It is the direction: "One more client a
  month is worth 2½× fewer leaving." Sliders on demand.

**Growth**
- **Funnel** → until views are tracked it is two numbers. Show one verdict: "You sign 35% of intros, which is good;
  get more intros." Drop the bars and the "typical ~30%" constant.
- **Waiting list** → show only while the coach is at capacity or someone is waiting, with Reopen as the action.

**Retention**
- **Tenure line** → an alert: "4 clients are in their first 3 months, the stretch where people leave; check in at
  weeks 4, 8 and 12." Better as Today nudges than a chart.
- **What's a client worth / average stay** → fold into Plan's churn lever ("3 fewer in 100 leaving = +$476 a month").
- **Roster outcomes** (412 workouts, 41 PRs) are pride numbers with no action. Turn them into "client wins worth
  sharing" prompts, or leave them in the catalog.
- **Why people left** (needs NEW) → the one action, "Devon said the fall; check in", is the useful part. The counts
  are context.

**Goal**
- **Rings + chart** → status chip + one sentence + one action, as the mock already does.
- A coach without due dates and history gets a ring with no verdict. Until NEW item 5 ships, say "Set a start and
  due date to see if you're on pace" rather than drawing an empty chart.

**Score**
- **Ladder + breakdown + leaderboard** → keep "Fastest way" (it is the direction) and the score. Put the ladder,
  breakdown and rank in the catalog.
- Fix the two counts first, or "Fastest way" will advise the wrong moves. Today it would say "assign more workouts".
- Watch that "+80 a program" doesn't reward publishing empty programs.

**Settings › Flags**
- "Who it catches today" is already direction: each threshold shows its consequence. Keep it, and add the save
  bar's "1 fewer flag today" preview.
